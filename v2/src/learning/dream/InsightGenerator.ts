/**
 * InsightGenerator - Generate actionable insights from associations
 *
 * Transforms co-activated concept associations into actionable insights
 * that can improve agent behavior.
 *
 * Part of the Nightly-Learner Phase 2 implementation.
 *
 * @version 1.0.0
 * @module src/learning/dream/InsightGenerator
 */

import { EventEmitter } from 'events';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { ConceptGraph, ConceptNode, ConceptType } from './ConceptGraph';
import { Association } from './SpreadingActivation';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';

export type InsightType = 'new_pattern' | 'optimization' | 'warning' | 'connection' | 'transfer';

export interface DreamInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  associatedConcepts: string[];
  noveltyScore: number;
  confidenceScore: number;
  actionable: boolean;
  suggestedAction?: string;
  targetAgentTypes?: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'applied' | 'dismissed' | 'validated';
  createdAt: Date;
  appliedAt?: Date;
  outcome?: {
    success: boolean;
    feedback?: string;
    improvementMeasured?: number;
  };
}

export interface InsightGeneratorConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Minimum novelty score to generate insight. Default: 0.5 */
  noveltyThreshold?: number;
  /** Minimum confidence to mark as actionable. Default: 0.6 */
  confidenceThreshold?: number;
  /** Maximum insights to generate per cycle. Default: 10 */
  maxInsightsPerCycle?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface InsightGenerationResult {
  totalAssociations: number;
  insightsGenerated: number;
  actionableInsights: number;
  byType: Record<InsightType, number>;
  averageNovelty: number;
  averageConfidence: number;
  duration: number;
}

/**
 * InsightGenerator creates actionable insights from concept associations
 *
 * @example
 * ```typescript
 * const generator = new InsightGenerator(graph);
 *
 * const insights = await generator.generateInsights(associations);
 * console.log(`Generated ${insights.length} insights`);
 *
 * // Apply an insight
 * await generator.applyInsight(insights[0].id);
 * ```
 */
export class InsightGenerator extends EventEmitter {
  private graph: ConceptGraph;
  private config: Required<InsightGeneratorConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;

  constructor(graph: ConceptGraph, config?: InsightGeneratorConfig) {
    super();
    this.graph = graph;
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      noveltyThreshold: config?.noveltyThreshold ?? 0.5,
      confidenceThreshold: config?.confidenceThreshold ?? 0.6,
      maxInsightsPerCycle: config?.maxInsightsPerCycle ?? 10,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dream_insights (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        associated_concepts TEXT NOT NULL,
        novelty_score REAL NOT NULL,
        confidence_score REAL NOT NULL,
        actionable INTEGER NOT NULL,
        suggested_action TEXT,
        target_agent_types TEXT,
        priority TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        applied_at INTEGER,
        outcome TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_insight_type ON dream_insights(type);
      CREATE INDEX IF NOT EXISTS idx_insight_status ON dream_insights(status);
      CREATE INDEX IF NOT EXISTS idx_insight_priority ON dream_insights(priority);
      CREATE INDEX IF NOT EXISTS idx_insight_actionable ON dream_insights(actionable);
    `);
  }

  /**
   * Generate insights from associations
   */
  async generateInsights(associations: Association[]): Promise<DreamInsight[]> {
    const startTime = Date.now();
    const insights: DreamInsight[] = [];

    this.logger.info('[InsightGenerator] Generating insights', {
      associations: associations.length,
    });

    for (const association of associations) {
      if (association.novelty < this.config.noveltyThreshold) {
        continue;
      }

      const insight = await this.associationToInsight(association);
      if (insight) {
        insights.push(insight);

        if (insights.length >= this.config.maxInsightsPerCycle) {
          break;
        }
      }
    }

    // Store insights
    await this.storeInsights(insights);

    // Calculate stats
    const byType: Record<InsightType, number> = {
      new_pattern: 0,
      optimization: 0,
      warning: 0,
      connection: 0,
      transfer: 0,
    };

    for (const insight of insights) {
      byType[insight.type]++;
    }

    const result: InsightGenerationResult = {
      totalAssociations: associations.length,
      insightsGenerated: insights.length,
      actionableInsights: insights.filter(i => i.actionable).length,
      byType,
      averageNovelty: insights.length > 0
        ? insights.reduce((sum, i) => sum + i.noveltyScore, 0) / insights.length
        : 0,
      averageConfidence: insights.length > 0
        ? insights.reduce((sum, i) => sum + i.confidenceScore, 0) / insights.length
        : 0,
      duration: Date.now() - startTime,
    };

    this.logger.info('[InsightGenerator] Generation complete', {
      generated: result.insightsGenerated,
      actionable: result.actionableInsights,
      duration: result.duration,
    });

    this.emit('generation:complete', result);
    return insights;
  }

  /**
   * Convert an association to an insight
   */
  private async associationToInsight(association: Association): Promise<DreamInsight | null> {
    // Get the concepts involved
    const concepts = association.nodes
      .map(id => this.graph.getConcept(id))
      .filter(Boolean) as ConceptNode[];

    if (concepts.length < 2) return null;

    // Determine insight type based on concept types
    const types = new Set(concepts.map(c => c.type));
    const insightType = this.determineInsightType(types, concepts);

    // Calculate confidence based on association strength and concept quality
    const confidence = this.calculateConfidence(association, concepts);

    // Determine if actionable
    const actionable = confidence >= this.config.confidenceThreshold &&
                       insightType !== 'connection';

    // Generate content
    const title = this.generateTitle(concepts, insightType);
    const description = this.generateDescription(concepts, insightType);
    const suggestedAction = actionable ? this.generateAction(concepts, insightType) : undefined;

    // Determine target agent types from concepts
    const targetAgentTypes = this.extractTargetAgentTypes(concepts);

    // Determine priority
    const priority = this.determinePriority(association.novelty, confidence, insightType);

    const insight: DreamInsight = {
      id: `insight-${Date.now()}-${SecureRandom.randomString(8, 'alphanumeric')}`,
      type: insightType,
      title,
      description,
      associatedConcepts: association.nodes,
      noveltyScore: association.novelty,
      confidenceScore: confidence,
      actionable,
      suggestedAction,
      targetAgentTypes: targetAgentTypes.length > 0 ? targetAgentTypes : undefined,
      priority,
      status: 'pending',
      createdAt: new Date(),
    };

    this.emit('insight:generated', insight);

    if (this.config.debug) {
      this.logger.debug('[InsightGenerator] Generated insight', {
        id: insight.id,
        type: insight.type,
        novelty: insight.noveltyScore.toFixed(3),
        confidence: insight.confidenceScore.toFixed(3),
        actionable: insight.actionable,
      });
    }

    return insight;
  }

  /**
   * Determine insight type from concept types
   */
  private determineInsightType(types: Set<ConceptType>, concepts: ConceptNode[]): InsightType {
    if (types.has('pattern') && types.has('outcome')) {
      return 'new_pattern';
    }

    if (types.has('technique') && types.has('outcome')) {
      return 'optimization';
    }

    if (types.has('domain') && types.size > 1) {
      return 'transfer';
    }

    // Check for warning indicators in content
    const warningKeywords = ['fail', 'error', 'issue', 'problem', 'bug', 'slow'];
    const hasWarning = concepts.some(c =>
      warningKeywords.some(kw => c.content.toLowerCase().includes(kw))
    );

    if (hasWarning) {
      return 'warning';
    }

    return 'connection';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(association: Association, concepts: ConceptNode[]): number {
    let confidence = association.strength;

    // Bonus for high-quality concepts (those with more metadata)
    const avgMetadataSize = concepts.reduce((sum, c) =>
      sum + Object.keys(c.metadata).length, 0) / concepts.length;
    confidence += Math.min(0.2, avgMetadataSize * 0.05);

    // Bonus for type diversity
    const typeCount = new Set(concepts.map(c => c.type)).size;
    if (typeCount >= 2) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Generate a title for the insight
   */
  private generateTitle(concepts: ConceptNode[], type: InsightType): string {
    const firstConcept = concepts[0].content.substring(0, 30);

    switch (type) {
      case 'new_pattern':
        return `New Pattern: ${firstConcept}...`;
      case 'optimization':
        return `Optimization: ${firstConcept}...`;
      case 'warning':
        return `Warning: Potential issue with ${firstConcept}...`;
      case 'transfer':
        return `Transfer Opportunity: ${firstConcept}...`;
      default:
        return `Connection: ${concepts.length} concepts linked`;
    }
  }

  /**
   * Generate a description for the insight
   */
  private generateDescription(concepts: ConceptNode[], type: InsightType): string {
    const conceptSummaries = concepts.map(c =>
      `[${c.type}] ${c.content.substring(0, 50)}`
    ).join('; ');

    switch (type) {
      case 'new_pattern':
        return `Discovered a potential new pattern by combining: ${conceptSummaries}. ` +
               `This combination has not been seen before and may represent a novel approach.`;
      case 'optimization':
        return `Found an optimization opportunity: ${conceptSummaries}. ` +
               `Applying this technique may improve performance.`;
      case 'warning':
        return `Detected potential issue: ${conceptSummaries}. ` +
               `This combination has been associated with problems in the past.`;
      case 'transfer':
        return `Knowledge transfer opportunity between domains: ${conceptSummaries}. ` +
               `Patterns from one domain may be applicable to another.`;
      default:
        return `Discovered connection between: ${conceptSummaries}.`;
    }
  }

  /**
   * Generate a suggested action
   */
  private generateAction(concepts: ConceptNode[], type: InsightType): string {
    switch (type) {
      case 'new_pattern':
        return 'Create a new test pattern combining these concepts and validate with a small test set.';
      case 'optimization':
        return 'Apply this technique to relevant agents and measure performance improvement.';
      case 'warning':
        return 'Review affected code paths and add defensive checks or tests.';
      case 'transfer':
        return 'Identify agents that could benefit from this cross-domain knowledge.';
      default:
        return 'Investigate this connection for potential applications.';
    }
  }

  /**
   * Extract target agent types from concepts
   */
  private extractTargetAgentTypes(concepts: ConceptNode[]): string[] {
    const agentTypes = new Set<string>();

    for (const concept of concepts) {
      // Look for agent types in metadata
      if (concept.metadata.agentType) {
        agentTypes.add(concept.metadata.agentType as string);
      }
      if (concept.metadata.agentTypes && Array.isArray(concept.metadata.agentTypes)) {
        for (const at of concept.metadata.agentTypes) {
          agentTypes.add(at as string);
        }
      }

      // Extract from content
      const knownAgents = [
        'test-generator', 'coverage-analyzer', 'quality-gate',
        'performance-tester', 'security-scanner', 'flaky-test-hunter'
      ];
      for (const agent of knownAgents) {
        if (concept.content.toLowerCase().includes(agent)) {
          agentTypes.add(agent);
        }
      }
    }

    return Array.from(agentTypes);
  }

  /**
   * Determine priority level
   */
  private determinePriority(novelty: number, confidence: number, type: InsightType): 'high' | 'medium' | 'low' {
    const score = novelty * 0.4 + confidence * 0.4 + (type === 'warning' ? 0.2 : 0);

    if (score >= 0.7 || type === 'warning') return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Store insights in database
   */
  private async storeInsights(insights: DreamInsight[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO dream_insights
      (id, type, title, description, associated_concepts, novelty_score, confidence_score,
       actionable, suggested_action, target_agent_types, priority, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((ins: DreamInsight[]) => {
      for (const i of ins) {
        stmt.run(
          i.id,
          i.type,
          i.title,
          i.description,
          JSON.stringify(i.associatedConcepts),
          i.noveltyScore,
          i.confidenceScore,
          i.actionable ? 1 : 0,
          i.suggestedAction || null,
          i.targetAgentTypes ? JSON.stringify(i.targetAgentTypes) : null,
          i.priority,
          i.status,
          i.createdAt.getTime()
        );
      }
    });

    insertMany(insights);
  }

  /**
   * Get pending insights
   */
  getPendingInsights(limit: number = 10): DreamInsight[] {
    const rows = this.db.prepare(`
      SELECT * FROM dream_insights
      WHERE status = 'pending'
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        novelty_score DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => this.rowToInsight(row));
  }

  /**
   * Get insights by type
   */
  getInsightsByType(type: InsightType, limit: number = 10): DreamInsight[] {
    const rows = this.db.prepare(`
      SELECT * FROM dream_insights
      WHERE type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(type, limit) as any[];

    return rows.map(row => this.rowToInsight(row));
  }

  /**
   * Apply an insight (mark as applied)
   */
  async applyInsight(insightId: string, feedback?: string): Promise<void> {
    const now = Date.now();

    this.db.prepare(`
      UPDATE dream_insights
      SET status = 'applied', applied_at = ?
      WHERE id = ?
    `).run(now, insightId);

    this.emit('insight:applied', { insightId, feedback });
  }

  /**
   * Dismiss an insight
   */
  dismissInsight(insightId: string, reason?: string): void {
    this.db.prepare(`
      UPDATE dream_insights
      SET status = 'dismissed'
      WHERE id = ?
    `).run(insightId);

    this.emit('insight:dismissed', { insightId, reason });
  }

  /**
   * Record outcome of an applied insight
   */
  recordOutcome(insightId: string, success: boolean, feedback?: string, improvement?: number): void {
    const outcome = JSON.stringify({ success, feedback, improvementMeasured: improvement });

    this.db.prepare(`
      UPDATE dream_insights
      SET outcome = ?, status = 'validated'
      WHERE id = ?
    `).run(outcome, insightId);

    this.emit('insight:validated', { insightId, success, improvement });
  }

  /**
   * Convert database row to DreamInsight
   */
  private rowToInsight(row: any): DreamInsight {
    return {
      id: row.id,
      type: row.type as InsightType,
      title: row.title,
      description: row.description,
      associatedConcepts: JSON.parse(row.associated_concepts),
      noveltyScore: row.novelty_score,
      confidenceScore: row.confidence_score,
      actionable: row.actionable === 1,
      suggestedAction: row.suggested_action || undefined,
      targetAgentTypes: row.target_agent_types ? JSON.parse(row.target_agent_types) : undefined,
      priority: row.priority as 'high' | 'medium' | 'low',
      status: row.status as 'pending' | 'applied' | 'dismissed' | 'validated',
      createdAt: new Date(row.created_at),
      appliedAt: row.applied_at ? new Date(row.applied_at) : undefined,
      outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

export default InsightGenerator;
