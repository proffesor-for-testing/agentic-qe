/**
 * Agentic QE v3 - Transfer Specialist Service
 * Handles knowledge transfer between projects and domains
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainName, AgentId, ALL_DOMAINS } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { toError } from '../../../shared/error-utils.js';
import {
  Knowledge,
  KnowledgeType,
  KnowledgeContent,
  KnowledgeQuery,
  IKnowledgeSynthesisService,
  PatternContext,
} from '../interfaces.js';

/**
 * Configuration for the transfer specialist
 */
export interface TransferSpecialistConfig {
  maxKnowledgeItems: number;
  relevanceThreshold: number;
  transferDecayFactor: number;
  crossDomainBoost: number;
}

const DEFAULT_CONFIG: TransferSpecialistConfig = {
  maxKnowledgeItems: 1000,
  relevanceThreshold: 0.5,
  transferDecayFactor: 0.1,
  crossDomainBoost: 0.2,
};

/**
 * Transfer result for tracking transfer operations
 */
export interface TransferResult {
  knowledgeId: string;
  sourceDomain: DomainName;
  targetDomain: DomainName;
  originalRelevance: number;
  transferredRelevance: number;
  adaptations: string[];
}

/**
 * Transfer Specialist Service
 * Implements knowledge transfer and synthesis across domains
 */
export class TransferSpecialistService implements IKnowledgeSynthesisService {
  private readonly config: TransferSpecialistConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<TransferSpecialistConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // IKnowledgeSynthesisService Implementation
  // ============================================================================

  /**
   * Share knowledge with target agents
   */
  async shareKnowledge(
    knowledge: Knowledge,
    targetAgents: AgentId[]
  ): Promise<Result<void>> {
    try {
      // Store knowledge in shared namespace
      await this.memory.set(
        `learning:knowledge:shared:${knowledge.id}`,
        knowledge,
        { namespace: 'learning-optimization', persist: true }
      );

      // Create access records for each target agent
      for (const agent of targetAgents) {
        await this.memory.set(
          `learning:knowledge:access:${agent.value}:${knowledge.id}`,
          {
            knowledgeId: knowledge.id,
            agentId: agent.value,
            sharedAt: new Date(),
            accessed: false,
          },
          { namespace: 'learning-optimization', ttl: 86400 * 7 }
        );
      }

      // Record sharing event
      await this.recordSharingEvent(knowledge, targetAgents);

      return ok(undefined);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Query knowledge base
   */
  async queryKnowledge(query: KnowledgeQuery): Promise<Result<Knowledge[]>> {
    try {
      const results: Knowledge[] = [];

      // Search by domain if specified
      let keys: string[];
      if (query.domain) {
        keys = await this.memory.search(
          `learning:knowledge:*:${query.domain}:*`,
          query.limit || 100
        );
      } else {
        keys = await this.memory.search('learning:knowledge:shared:*', query.limit || 100);
      }

      for (const key of keys) {
        const knowledge = await this.memory.get<Knowledge>(key);
        if (knowledge && this.matchesQuery(knowledge, query)) {
          results.push(knowledge);
        }
      }

      // Sort by relevance score
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Apply semantic search if embedding provided
      if (query.embedding && query.embedding.length > 0) {
        const vectorResults = await this.memory.vectorSearch(
          query.embedding,
          query.limit || 10
        );

        for (const vr of vectorResults) {
          const knowledge = await this.memory.get<Knowledge>(vr.key);
          if (
            knowledge &&
            !results.some((r) => r.id === knowledge.id) &&
            this.matchesQuery(knowledge, query)
          ) {
            results.push(knowledge);
          }
        }
      }

      return ok(results.slice(0, query.limit || 100));
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Synthesize knowledge from multiple sources
   */
  async synthesizeKnowledge(knowledgeIds: string[]): Promise<Result<Knowledge>> {
    try {
      if (knowledgeIds.length < 2) {
        return err(new Error('Need at least 2 knowledge items to synthesize'));
      }

      const items: Knowledge[] = [];
      for (const id of knowledgeIds) {
        const knowledge = await this.getKnowledgeById(id);
        if (knowledge) {
          items.push(knowledge);
        }
      }

      if (items.length < 2) {
        return err(new Error('Not enough valid knowledge items found'));
      }

      // Determine synthesized type and domain
      const synthesizedType = this.determineSynthesizedType(items);
      const synthesizedDomain = this.determineSynthesizedDomain(items);

      // Merge content
      const synthesizedContent = this.mergeKnowledgeContent(items);

      // Calculate combined relevance
      const avgRelevance =
        items.reduce((sum, k) => sum + k.relevanceScore, 0) / items.length;

      // Boost relevance for successful synthesis
      const boostedRelevance = Math.min(
        1,
        avgRelevance + this.config.crossDomainBoost
      );

      // Create synthesized knowledge
      const synthesized: Knowledge = {
        id: uuidv4(),
        type: synthesizedType,
        domain: synthesizedDomain,
        content: synthesizedContent,
        sourceAgentId: items[0].sourceAgentId,
        targetDomains: this.mergeTargetDomains(items),
        relevanceScore: boostedRelevance,
        version: 1,
        createdAt: new Date(),
      };

      // Store synthesized knowledge
      await this.storeKnowledge(synthesized);

      // Record synthesis event
      await this.recordSynthesisEvent(synthesized, knowledgeIds);

      return ok(synthesized);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Transfer knowledge to a different domain
   */
  async transferKnowledge(
    knowledge: Knowledge,
    targetDomain: DomainName
  ): Promise<Result<Knowledge>> {
    try {
      if (knowledge.domain === targetDomain) {
        return err(new Error('Cannot transfer knowledge to the same domain'));
      }

      // Calculate transferred relevance with decay
      const transferredRelevance = this.calculateTransferredRelevance(
        knowledge,
        targetDomain
      );

      if (transferredRelevance < this.config.relevanceThreshold) {
        return err(
          new Error(
            `Transferred relevance ${transferredRelevance} below threshold ${this.config.relevanceThreshold}`
          )
        );
      }

      // Adapt content for target domain
      const adaptedContent = await this.adaptContentForDomain(
        knowledge.content,
        knowledge.domain,
        targetDomain
      );

      // Create transferred knowledge
      const transferred: Knowledge = {
        id: uuidv4(),
        type: knowledge.type,
        domain: targetDomain,
        content: adaptedContent,
        sourceAgentId: knowledge.sourceAgentId,
        targetDomains: [targetDomain],
        relevanceScore: transferredRelevance,
        version: knowledge.version + 1,
        createdAt: new Date(),
      };

      // Store transferred knowledge
      await this.storeKnowledge(transferred);

      // Record transfer event
      await this.recordTransferEvent(knowledge, transferred);

      return ok(transferred);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Validate knowledge relevance for a context
   */
  async validateRelevance(
    knowledge: Knowledge,
    context: PatternContext
  ): Promise<Result<number>> {
    try {
      let relevance = knowledge.relevanceScore;

      // Adjust based on context match
      if (context.language && knowledge.content.metadata?.language === context.language) {
        relevance += 0.1;
      }
      if (context.framework && knowledge.content.metadata?.framework === context.framework) {
        relevance += 0.1;
      }
      if (context.tags.length > 0 && knowledge.content.metadata?.tags) {
        const knowledgeTags = knowledge.content.metadata.tags as string[];
        const matchingTags = context.tags.filter((t) =>
          knowledgeTags.includes(t)
        );
        relevance += (matchingTags.length / context.tags.length) * 0.2;
      }

      // Apply age decay
      const ageMs = Date.now() - knowledge.createdAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const ageDecay = Math.exp(-this.config.transferDecayFactor * ageDays / 30);
      relevance *= ageDecay;

      // Check expiry
      if (knowledge.expiresAt && new Date() > knowledge.expiresAt) {
        relevance *= 0.5;
      }

      return ok(Math.min(1, Math.max(0, relevance)));
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Additional Public Methods
  // ============================================================================

  /**
   * Create new knowledge item
   */
  async createKnowledge(
    type: KnowledgeType,
    domain: DomainName,
    content: unknown,
    sourceAgent: AgentId,
    targetDomains: DomainName[] = [],
    metadata?: Record<string, unknown>
  ): Promise<Result<Knowledge>> {
    try {
      const knowledge: Knowledge = {
        id: uuidv4(),
        type,
        domain,
        content: {
          format: this.inferContentFormat(content),
          data: content,
          metadata,
        },
        sourceAgentId: sourceAgent,
        targetDomains,
        relevanceScore: 1.0,
        version: 1,
        createdAt: new Date(),
      };

      await this.storeKnowledge(knowledge);

      // Store vector embedding if applicable
      if (type === 'embedding' && Array.isArray(content)) {
        await this.memory.storeVector(
          `learning:knowledge:vector:${knowledge.id}`,
          content as number[],
          { knowledgeId: knowledge.id }
        );
      }

      return ok(knowledge);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get knowledge by ID
   */
  async getKnowledgeById(id: string): Promise<Knowledge | null> {
    const knowledge = await this.memory.get<Knowledge>(
      `learning:knowledge:shared:${id}`
    );
    return knowledge || null;
  }

  /**
   * Bulk transfer knowledge between projects
   */
  async bulkTransfer(
    sourceProject: string,
    targetProject: string,
    filter?: { types?: KnowledgeType[]; minRelevance?: number }
  ): Promise<Result<TransferResult[]>> {
    try {
      const keys = await this.memory.search(
        `learning:knowledge:project:${sourceProject}:*`,
        500
      );
      const results: TransferResult[] = [];

      for (const key of keys) {
        const knowledge = await this.memory.get<Knowledge>(key);
        if (!knowledge) continue;

        // Apply filter
        if (filter?.types && !filter.types.includes(knowledge.type)) {
          continue;
        }
        if (
          filter?.minRelevance &&
          knowledge.relevanceScore < filter.minRelevance
        ) {
          continue;
        }

        // Transfer to target project
        const adaptedContent = await this.adaptContentForProject(
          knowledge.content,
          sourceProject,
          targetProject
        );

        const transferred: Knowledge = {
          ...knowledge,
          id: uuidv4(),
          content: adaptedContent,
          relevanceScore: knowledge.relevanceScore * (1 - this.config.transferDecayFactor),
          version: knowledge.version + 1,
          createdAt: new Date(),
        };

        await this.memory.set(
          `learning:knowledge:project:${targetProject}:${transferred.id}`,
          transferred,
          { namespace: 'learning-optimization', persist: true }
        );

        results.push({
          knowledgeId: transferred.id,
          sourceDomain: knowledge.domain,
          targetDomain: knowledge.domain,
          originalRelevance: knowledge.relevanceScore,
          transferredRelevance: transferred.relevanceScore,
          adaptations: ['project-context-adapted'],
        });
      }

      return ok(results);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async storeKnowledge(knowledge: Knowledge): Promise<void> {
    // Store in shared namespace
    await this.memory.set(
      `learning:knowledge:shared:${knowledge.id}`,
      knowledge,
      { namespace: 'learning-optimization', persist: true }
    );

    // Index by domain
    await this.memory.set(
      `learning:knowledge:domain:${knowledge.domain}:${knowledge.id}`,
      knowledge.id,
      { namespace: 'learning-optimization', persist: true }
    );

    // Index by type
    await this.memory.set(
      `learning:knowledge:type:${knowledge.type}:${knowledge.id}`,
      knowledge.id,
      { namespace: 'learning-optimization', persist: true }
    );
  }

  private matchesQuery(knowledge: Knowledge, query: KnowledgeQuery): boolean {
    if (query.type && knowledge.type !== query.type) {
      return false;
    }
    if (query.domain && knowledge.domain !== query.domain) {
      return false;
    }
    if (
      query.minRelevance !== undefined &&
      knowledge.relevanceScore < query.minRelevance
    ) {
      return false;
    }
    if (query.tags && query.tags.length > 0) {
      const knowledgeTags = (knowledge.content.metadata?.tags as string[]) || [];
      const hasMatchingTag = query.tags.some((tag) =>
        knowledgeTags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }
    return true;
  }

  private determineSynthesizedType(items: Knowledge[]): KnowledgeType {
    const typeCounts: Map<KnowledgeType, number> = new Map();
    for (const item of items) {
      typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
    }

    let maxType: KnowledgeType = items[0].type;
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxType = type;
      }
    }

    return maxType;
  }

  private determineSynthesizedDomain(items: Knowledge[]): DomainName {
    // Use the domain that appears most frequently
    const domainCounts: Map<DomainName, number> = new Map();
    for (const item of items) {
      domainCounts.set(item.domain, (domainCounts.get(item.domain) || 0) + 1);
    }

    let maxDomain: DomainName = items[0].domain;
    let maxCount = 0;
    for (const [domain, count] of domainCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxDomain = domain;
      }
    }

    return maxDomain;
  }

  private mergeKnowledgeContent(items: Knowledge[]): KnowledgeContent {
    // Merge metadata
    const mergedMetadata: Record<string, unknown> = {};
    const mergedData: unknown[] = [];

    for (const item of items) {
      mergedData.push(item.content.data);
      if (item.content.metadata) {
        for (const [key, value] of Object.entries(item.content.metadata)) {
          if (Array.isArray(value)) {
            const existing = (mergedMetadata[key] as unknown[]) || [];
            mergedMetadata[key] = [...new Set([...existing, ...value])];
          } else {
            mergedMetadata[key] = value;
          }
        }
      }
    }

    return {
      format: 'json',
      data: { synthesized: true, sources: mergedData },
      metadata: {
        ...mergedMetadata,
        synthesizedFrom: items.map((i) => i.id),
        synthesizedAt: new Date().toISOString(),
      },
    };
  }

  private mergeTargetDomains(items: Knowledge[]): DomainName[] {
    const allDomains = new Set<DomainName>();
    for (const item of items) {
      allDomains.add(item.domain);
      for (const target of item.targetDomains) {
        allDomains.add(target);
      }
    }
    return Array.from(allDomains);
  }

  private calculateTransferredRelevance(
    knowledge: Knowledge,
    targetDomain: DomainName
  ): number {
    let relevance = knowledge.relevanceScore;

    // Apply transfer decay
    relevance *= 1 - this.config.transferDecayFactor;

    // Check if target domain is compatible
    const domainCompatibility = this.getDomainCompatibility(
      knowledge.domain,
      targetDomain
    );
    relevance *= domainCompatibility;

    // Boost if explicitly targeted
    if (knowledge.targetDomains.includes(targetDomain)) {
      relevance += this.config.crossDomainBoost;
    }

    return Math.min(1, Math.max(0, relevance));
  }

  private getDomainCompatibility(
    source: DomainName,
    target: DomainName
  ): number {
    // Define domain compatibility matrix (simplified)
    const relatedDomains: Record<DomainName, DomainName[]> = {
      'test-generation': ['test-execution', 'coverage-analysis'],
      'test-execution': ['test-generation', 'coverage-analysis', 'quality-assessment'],
      'coverage-analysis': ['test-generation', 'test-execution', 'quality-assessment'],
      'quality-assessment': ['test-execution', 'coverage-analysis', 'defect-intelligence'],
      'defect-intelligence': ['quality-assessment', 'code-intelligence'],
      'requirements-validation': ['test-generation', 'quality-assessment'],
      'code-intelligence': ['defect-intelligence', 'security-compliance'],
      'security-compliance': ['code-intelligence', 'quality-assessment'],
      'contract-testing': ['test-generation', 'test-execution'],
      'visual-accessibility': ['quality-assessment'],
      'chaos-resilience': ['test-execution', 'quality-assessment'],
      'learning-optimization': [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
      ],
      'enterprise-integration': ['contract-testing', 'security-compliance', 'quality-assessment'],
      'coordination': ALL_DOMAINS.filter((d) => d !== 'coordination'),
    };

    if (source === target) return 1.0;
    if (relatedDomains[source]?.includes(target)) return 0.8;
    return 0.5;
  }

  private async adaptContentForDomain(
    content: KnowledgeContent,
    sourceDomain: DomainName,
    targetDomain: DomainName
  ): Promise<KnowledgeContent> {
    // Add adaptation metadata
    return {
      ...content,
      metadata: {
        ...(content.metadata || {}),
        adaptedFrom: sourceDomain,
        adaptedTo: targetDomain,
        adaptedAt: new Date().toISOString(),
      },
    };
  }

  private async adaptContentForProject(
    content: KnowledgeContent,
    sourceProject: string,
    targetProject: string
  ): Promise<KnowledgeContent> {
    return {
      ...content,
      metadata: {
        ...(content.metadata || {}),
        sourceProject,
        targetProject,
        transferredAt: new Date().toISOString(),
      },
    };
  }

  private inferContentFormat(
    content: unknown
  ): 'text' | 'json' | 'embedding' | 'model' {
    if (typeof content === 'string') return 'text';
    if (Array.isArray(content) && content.every((v) => typeof v === 'number')) {
      return 'embedding';
    }
    return 'json';
  }

  private async recordSharingEvent(
    knowledge: Knowledge,
    targetAgents: AgentId[]
  ): Promise<void> {
    await this.memory.set(
      `learning:knowledge:events:share:${knowledge.id}:${Date.now()}`,
      {
        type: 'share',
        knowledgeId: knowledge.id,
        targetAgents: targetAgents.map((a) => a.value),
        timestamp: new Date(),
      },
      { namespace: 'learning-optimization', ttl: 86400 * 30 }
    );
  }

  private async recordSynthesisEvent(
    synthesized: Knowledge,
    sourceIds: string[]
  ): Promise<void> {
    await this.memory.set(
      `learning:knowledge:events:synthesis:${synthesized.id}`,
      {
        type: 'synthesis',
        synthesizedId: synthesized.id,
        sourceIds,
        timestamp: new Date(),
      },
      { namespace: 'learning-optimization', ttl: 86400 * 30 }
    );
  }

  private async recordTransferEvent(
    original: Knowledge,
    transferred: Knowledge
  ): Promise<void> {
    await this.memory.set(
      `learning:knowledge:events:transfer:${transferred.id}`,
      {
        type: 'transfer',
        originalId: original.id,
        transferredId: transferred.id,
        originalDomain: original.domain,
        targetDomain: transferred.domain,
        timestamp: new Date(),
      },
      { namespace: 'learning-optimization', ttl: 86400 * 30 }
    );
  }
}
