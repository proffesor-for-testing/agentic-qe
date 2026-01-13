/**
 * Agentic QE v3 - Learning Coordinator Service
 * Orchestrates learning across all QE domains
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainName } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { TimeRange } from '../../../shared/value-objects/index.js';
import {
  LearnedPattern,
  PatternType,
  PatternContext,
  PatternTemplate,
  TemplateVariable,
  Experience,
  ExperienceResult,
  StateSnapshot,
  MinedInsights,
  ExperienceCluster,
  ExperienceAnomaly,
  PatternStats,
  IPatternLearningService,
  IExperienceMiningService,
  OptimizationObjective,
} from '../interfaces.js';
import {
  QEFlashAttention,
  createQEFlashAttention,
  type QEFlashAttentionConfig,
  type QEFlashAttentionMetrics,
} from '../../../integrations/ruvector/wrappers.js';

/**
 * Configuration for the learning coordinator
 */
export interface LearningCoordinatorConfig {
  minExperiencesForPattern: number;
  patternConfidenceThreshold: number;
  maxPatternsPerDomain: number;
  anomalyDeviationThreshold: number;
  clusterSimilarityThreshold: number;
}

const DEFAULT_CONFIG: LearningCoordinatorConfig = {
  minExperiencesForPattern: 5,
  patternConfidenceThreshold: 0.7,
  maxPatternsPerDomain: 100,
  anomalyDeviationThreshold: 2.0,
  clusterSimilarityThreshold: 0.8,
};

/**
 * Learning Coordinator Service
 * Implements pattern learning and experience mining capabilities
 */
export class LearningCoordinatorService
  implements IPatternLearningService, IExperienceMiningService
{
  private readonly config: LearningCoordinatorConfig;

  /**
   * QEFlashAttention for high-performance similarity computations
   * Provides 2.49x-7.47x speedup via @ruvector/attention SIMD implementation
   */
  private flashAttention: QEFlashAttention | null = null;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<LearningCoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // FlashAttention Integration Methods (via @ruvector/attention)
  // ============================================================================

  /**
   * Initialize FlashAttention for high-performance similarity computations.
   * This enables 2.49x-7.47x speedup for pattern matching and clustering.
   *
   * @param customConfig - Optional custom FlashAttention configuration
   * @returns The initialized FlashAttention instance
   * @throws Error if @ruvector/attention is not available
   */
  async initializeFlashAttention(
    customConfig?: Partial<QEFlashAttentionConfig>
  ): Promise<QEFlashAttention> {
    this.flashAttention = await createQEFlashAttention(
      'pattern-adaptation',
      customConfig
    );
    console.log('[LearningCoordinatorService] FlashAttention initialized for pattern adaptation');
    return this.flashAttention;
  }

  /**
   * Inject an existing FlashAttention instance
   * Use this when sharing FlashAttention across services
   *
   * @param flashAttention - Pre-initialized FlashAttention instance
   */
  injectFlashAttention(flashAttention: QEFlashAttention): void {
    this.flashAttention = flashAttention;
  }

  /**
   * Check if FlashAttention is available
   *
   * @returns True if FlashAttention is initialized
   */
  isFlashAttentionAvailable(): boolean {
    return this.flashAttention !== null;
  }

  /**
   * Get FlashAttention performance metrics
   *
   * @returns Array of performance metrics or empty array if unavailable
   */
  getFlashAttentionMetrics(): QEFlashAttentionMetrics[] {
    if (!this.flashAttention) {
      return [];
    }
    return this.flashAttention.getMetrics();
  }

  /**
   * Compute similarity between patterns using FlashAttention.
   *
   * @param embedding1 - First embedding vector
   * @param embedding2 - Second embedding vector
   * @returns Similarity score (0-1)
   * @throws Error if FlashAttention is not initialized
   */
  async computeSimilarityWithFlashAttention(
    embedding1: number[],
    embedding2: number[]
  ): Promise<number> {
    if (!this.flashAttention) {
      throw new Error(
        '[LearningCoordinatorService] FlashAttention not initialized. ' +
        'Call initializeFlashAttention() first.'
      );
    }

    const dim = Math.min(embedding1.length, embedding2.length);
    const Q = new Float32Array(dim);
    const K = new Float32Array(dim);
    const V = new Float32Array(dim);

    for (let i = 0; i < dim; i++) {
      Q[i] = embedding1[i];
      K[i] = embedding2[i];
      V[i] = 1.0; // Dummy values for similarity computation
    }

    const result = await this.flashAttention.computeFlashAttention(Q, K, V, 1, dim);
    // Normalize result to [0, 1]
    const similarity = Math.abs(result[0]);
    return Math.min(1, similarity);
  }

  /**
   * Batch compute similarities using FlashAttention.
   * Efficiently computes similarities for multiple embedding pairs.
   *
   * @param queryEmbedding - Query embedding to compare against
   * @param corpusEmbeddings - Array of corpus embeddings
   * @param topK - Number of top results to return (default: 5)
   * @returns Array of index-similarity pairs, sorted by similarity descending
   * @throws Error if FlashAttention is not initialized
   */
  async batchComputeSimilarities(
    queryEmbedding: number[],
    corpusEmbeddings: number[][],
    topK: number = 5
  ): Promise<Array<{ index: number; similarity: number }>> {
    if (!this.flashAttention) {
      throw new Error(
        '[LearningCoordinatorService] FlashAttention not initialized. ' +
        'Call initializeFlashAttention() first.'
      );
    }

    const query = new Float32Array(queryEmbedding);
    const corpus = corpusEmbeddings.map((e) => new Float32Array(e));

    return this.flashAttention.computeTestSimilarity(query, corpus, topK);
  }

  /**
   * Dispose FlashAttention resources
   */
  disposeFlashAttention(): void {
    if (this.flashAttention) {
      this.flashAttention.dispose();
      this.flashAttention = null;
    }
  }

  /**
   * Standard cosine similarity for internal pattern matching.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return (dotProduct / denominator + 1) / 2; // Normalize to [0, 1]
  }

  // ============================================================================
  // IPatternLearningService Implementation
  // ============================================================================

  /**
   * Learn a pattern from a set of experiences
   */
  async learnPattern(experiences: Experience[]): Promise<Result<LearnedPattern>> {
    try {
      if (experiences.length < this.config.minExperiencesForPattern) {
        return err(
          new Error(
            `Need at least ${this.config.minExperiencesForPattern} experiences to learn a pattern`
          )
        );
      }

      // Analyze experiences to extract common patterns
      const commonActions = this.extractCommonActions(experiences);
      const successRate = this.calculateSuccessRate(experiences);

      if (successRate < this.config.patternConfidenceThreshold) {
        return err(
          new Error(
            `Success rate ${successRate} below threshold ${this.config.patternConfidenceThreshold}`
          )
        );
      }

      // Determine pattern type from experiences
      const patternType = this.inferPatternType(experiences);
      const domain = experiences[0].domain;

      // Generate pattern template
      const template = this.generatePatternTemplate(experiences, commonActions);
      const context = this.extractPatternContext(experiences);

      const pattern: LearnedPattern = {
        id: uuidv4(),
        type: patternType,
        domain,
        name: `${patternType}-${domain}-${Date.now()}`,
        description: `Learned pattern from ${experiences.length} experiences with ${successRate * 100}% success rate`,
        confidence: successRate,
        usageCount: 0,
        successRate,
        context,
        template,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      // Store pattern in memory
      await this.storePattern(pattern);

      // Record pattern creation for future analysis
      await this.recordPatternCreation(pattern, experiences);

      return ok(pattern);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find patterns matching the given context
   */
  async findMatchingPatterns(
    context: PatternContext,
    limit = 10
  ): Promise<Result<LearnedPattern[]>> {
    try {
      const patterns: LearnedPattern[] = [];
      const keys = await this.memory.search('learning:pattern:*', 100);

      for (const key of keys) {
        const pattern = await this.memory.get<LearnedPattern>(key);
        if (pattern && this.matchesContext(pattern, context)) {
          patterns.push(pattern);
        }
      }

      // Sort by confidence and usage
      patterns.sort((a, b) => {
        const scoreA = a.confidence * 0.6 + (a.successRate * 0.4);
        const scoreB = b.confidence * 0.6 + (b.successRate * 0.4);
        return scoreB - scoreA;
      });

      return ok(patterns.slice(0, limit));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Apply a pattern to generate output
   */
  async applyPattern(
    pattern: LearnedPattern,
    variables: Record<string, unknown>
  ): Promise<Result<string>> {
    try {
      let output = pattern.template.content;

      // Replace template variables
      for (const variable of pattern.template.variables) {
        const value = variables[variable.name] ?? variable.defaultValue;
        if (variable.required && value === undefined) {
          return err(new Error(`Required variable ${variable.name} not provided`));
        }
        output = output.replace(
          new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g'),
          String(value ?? '')
        );
      }

      // Update pattern usage stats
      await this.updatePatternUsage(pattern.id);

      return ok(output);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update pattern based on application feedback
   */
  async updatePatternFeedback(
    patternId: string,
    success: boolean
  ): Promise<Result<void>> {
    try {
      const key = `learning:pattern:${patternId}`;
      const pattern = await this.memory.get<LearnedPattern>(key);

      if (!pattern) {
        return err(new Error(`Pattern ${patternId} not found`));
      }

      // Update success rate using exponential moving average
      const alpha = 0.1;
      const newSuccessRate =
        alpha * (success ? 1 : 0) + (1 - alpha) * pattern.successRate;

      // Update confidence based on usage count
      const usageWeight = Math.min(pattern.usageCount / 100, 1);
      const newConfidence = newSuccessRate * 0.7 + usageWeight * 0.3;

      const updatedPattern: LearnedPattern = {
        ...pattern,
        successRate: newSuccessRate,
        confidence: newConfidence,
        usageCount: pattern.usageCount + 1,
        lastUsedAt: new Date(),
      };

      await this.memory.set(key, updatedPattern, {
        namespace: 'learning-optimization',
        persist: true,
      });

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Consolidate similar patterns into a single improved pattern
   */
  async consolidatePatterns(patternIds: string[]): Promise<Result<LearnedPattern>> {
    try {
      if (patternIds.length < 2) {
        return err(new Error('Need at least 2 patterns to consolidate'));
      }

      const patterns: LearnedPattern[] = [];
      for (const id of patternIds) {
        const pattern = await this.memory.get<LearnedPattern>(
          `learning:pattern:${id}`
        );
        if (pattern) {
          patterns.push(pattern);
        }
      }

      if (patterns.length < 2) {
        return err(new Error('Not enough valid patterns found'));
      }

      // Merge patterns - take best template, combine contexts
      const bestPattern = patterns.reduce((best, current) =>
        current.successRate > best.successRate ? current : best
      );

      const mergedContext: PatternContext = {
        language: bestPattern.context.language,
        framework: bestPattern.context.framework,
        testType: bestPattern.context.testType,
        codeContext: bestPattern.context.codeContext,
        tags: [...new Set(patterns.flatMap((p) => p.context.tags))],
      };

      const consolidatedPattern: LearnedPattern = {
        id: uuidv4(),
        type: bestPattern.type,
        domain: bestPattern.domain,
        name: `consolidated-${bestPattern.name}`,
        description: `Consolidated from ${patterns.length} patterns`,
        confidence: this.calculateConsolidatedConfidence(patterns),
        usageCount: patterns.reduce((sum, p) => sum + p.usageCount, 0),
        successRate: this.calculateWeightedSuccessRate(patterns),
        context: mergedContext,
        template: bestPattern.template,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      // Store consolidated pattern
      await this.storePattern(consolidatedPattern);

      // Archive old patterns
      for (const pattern of patterns) {
        await this.archivePattern(pattern.id);
      }

      return ok(consolidatedPattern);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get statistics about patterns
   */
  async getPatternStats(domain?: DomainName): Promise<Result<PatternStats>> {
    try {
      const keys = await this.memory.search('learning:pattern:*', 500);
      const patterns: LearnedPattern[] = [];

      for (const key of keys) {
        const pattern = await this.memory.get<LearnedPattern>(key);
        if (pattern && (!domain || pattern.domain === domain)) {
          patterns.push(pattern);
        }
      }

      const byType: Record<PatternType, number> = {
        'test-pattern': 0,
        'fix-pattern': 0,
        'optimization-pattern': 0,
        'detection-pattern': 0,
        'workflow-pattern': 0,
        'failure-pattern': 0,
      };

      const byDomain: Record<DomainName, number> = {
        'test-generation': 0,
        'test-execution': 0,
        'coverage-analysis': 0,
        'quality-assessment': 0,
        'defect-intelligence': 0,
        'requirements-validation': 0,
        'code-intelligence': 0,
        'security-compliance': 0,
        'contract-testing': 0,
        'visual-accessibility': 0,
        'chaos-resilience': 0,
        'learning-optimization': 0,
        'coordination': 0,
      };

      let totalConfidence = 0;
      let totalSuccessRate = 0;

      for (const pattern of patterns) {
        byType[pattern.type]++;
        byDomain[pattern.domain]++;
        totalConfidence += pattern.confidence;
        totalSuccessRate += pattern.successRate;
      }

      const topPatterns = patterns
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 10);

      return ok({
        totalPatterns: patterns.length,
        byType,
        byDomain,
        avgConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
        avgSuccessRate:
          patterns.length > 0 ? totalSuccessRate / patterns.length : 0,
        topPatterns,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // IExperienceMiningService Implementation
  // ============================================================================

  /**
   * Record a new experience
   */
  async recordExperience(
    experience: Omit<Experience, 'id' | 'timestamp'>
  ): Promise<Result<string>> {
    try {
      const id = uuidv4();
      const fullExperience: Experience = {
        ...experience,
        id,
        timestamp: new Date(),
      };

      await this.memory.set(`learning:experience:${id}`, fullExperience, {
        namespace: 'learning-optimization',
        ttl: 86400 * 30, // 30 days
      });

      // Index by agent and domain for faster retrieval
      await this.indexExperience(fullExperience);

      return ok(id);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Mine experiences for insights
   */
  async mineExperiences(
    domain: DomainName,
    timeRange: TimeRange
  ): Promise<Result<MinedInsights>> {
    try {
      const experiences = await this.getExperiencesByDomainAndTime(
        domain,
        timeRange
      );

      if (experiences.length === 0) {
        return ok({
          experienceCount: 0,
          successRate: 0,
          avgReward: 0,
          patterns: [],
          anomalies: [],
          recommendations: ['No experiences found in the given time range'],
        });
      }

      const successRate = this.calculateSuccessRate(experiences);
      const avgReward = this.calculateAverageReward(experiences);
      const patterns = await this.extractPatternsFromExperiences(experiences);
      const anomalies = this.detectAnomalies(experiences);
      const recommendations = this.generateRecommendations(
        experiences,
        successRate,
        anomalies
      );

      return ok({
        experienceCount: experiences.length,
        successRate,
        avgReward,
        patterns,
        anomalies,
        recommendations,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Calculate reward for an experience result
   */
  calculateReward(result: ExperienceResult, objective: OptimizationObjective): number {
    const metricValue = (result.outcome[objective.metric] as number) ?? 0;

    // Normalize based on direction
    let normalizedValue: number;
    if (objective.direction === 'maximize') {
      normalizedValue = Math.min(metricValue / 100, 1);
    } else {
      normalizedValue = Math.max(1 - metricValue / 100, 0);
    }

    // Apply constraints as penalties
    let penalty = 0;
    for (const constraint of objective.constraints) {
      const constraintValue = (result.outcome[constraint.metric] as number) ?? 0;
      const violated = this.isConstraintViolated(constraint, constraintValue);
      if (violated) {
        penalty += 0.2;
      }
    }

    // Base reward on success and metric value
    const successBonus = result.success ? 0.5 : 0;
    const reward = Math.max(0, normalizedValue + successBonus - penalty);

    return Math.min(1, reward);
  }

  /**
   * Get experience replay buffer for an agent
   */
  async getReplayBuffer(
    agentId: { value: string; domain: DomainName; type: string },
    limit = 100
  ): Promise<Result<Experience[]>> {
    try {
      const keys = await this.memory.search(
        `learning:experience:index:agent:${agentId.value}:*`,
        limit
      );
      const experiences: Experience[] = [];

      for (const key of keys) {
        const experienceId = await this.memory.get<string>(key);
        if (experienceId) {
          const experience = await this.memory.get<Experience>(
            `learning:experience:${experienceId}`
          );
          if (experience) {
            experiences.push(experience);
          }
        }
      }

      // Sort by timestamp descending (most recent first)
      experiences.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      return ok(experiences.slice(0, limit));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Cluster similar experiences
   */
  async clusterExperiences(
    experiences: Experience[]
  ): Promise<Result<ExperienceCluster[]>> {
    try {
      if (experiences.length === 0) {
        return ok([]);
      }

      // Simple clustering based on action similarity
      const clusters: Map<string, Experience[]> = new Map();

      for (const exp of experiences) {
        let assigned = false;
        for (const [action, cluster] of clusters) {
          if (this.actionsSimilar(exp.action, action)) {
            cluster.push(exp);
            assigned = true;
            break;
          }
        }
        if (!assigned) {
          clusters.set(exp.action, [exp]);
        }
      }

      // Convert to ExperienceCluster format
      const result: ExperienceCluster[] = [];
      let clusterId = 0;

      for (const [_, clusterExperiences] of clusters) {
        if (clusterExperiences.length >= 2) {
          const centroid = this.calculateCentroid(clusterExperiences);
          const commonActions = this.extractCommonActions(clusterExperiences);
          const avgReward = this.calculateAverageReward(clusterExperiences);

          result.push({
            id: `cluster-${clusterId++}`,
            centroid,
            experiences: clusterExperiences,
            commonActions,
            avgReward,
          });
        }
      }

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async storePattern(pattern: LearnedPattern): Promise<void> {
    await this.memory.set(`learning:pattern:${pattern.id}`, pattern, {
      namespace: 'learning-optimization',
      persist: true,
    });
  }

  private async archivePattern(patternId: string): Promise<void> {
    const key = `learning:pattern:${patternId}`;
    const pattern = await this.memory.get<LearnedPattern>(key);
    if (pattern) {
      await this.memory.set(`learning:pattern:archived:${patternId}`, pattern, {
        namespace: 'learning-optimization',
        persist: true,
      });
      await this.memory.delete(key);
    }
  }

  private async updatePatternUsage(patternId: string): Promise<void> {
    const key = `learning:pattern:${patternId}`;
    const pattern = await this.memory.get<LearnedPattern>(key);
    if (pattern) {
      const updated: LearnedPattern = {
        ...pattern,
        usageCount: pattern.usageCount + 1,
        lastUsedAt: new Date(),
      };
      await this.memory.set(key, updated, {
        namespace: 'learning-optimization',
        persist: true,
      });
    }
  }

  private async recordPatternCreation(
    pattern: LearnedPattern,
    experiences: Experience[]
  ): Promise<void> {
    await this.memory.set(
      `learning:pattern:creation:${pattern.id}`,
      {
        patternId: pattern.id,
        experienceIds: experiences.map((e) => e.id),
        createdAt: new Date(),
      },
      { namespace: 'learning-optimization', persist: true }
    );
  }

  private async indexExperience(experience: Experience): Promise<void> {
    // Index by agent
    await this.memory.set(
      `learning:experience:index:agent:${experience.agentId.value}:${experience.id}`,
      experience.id,
      { namespace: 'learning-optimization', ttl: 86400 * 30 }
    );

    // Index by domain
    await this.memory.set(
      `learning:experience:index:domain:${experience.domain}:${experience.id}`,
      experience.id,
      { namespace: 'learning-optimization', ttl: 86400 * 30 }
    );
  }

  private async getExperiencesByDomainAndTime(
    domain: DomainName,
    timeRange: TimeRange
  ): Promise<Experience[]> {
    const keys = await this.memory.search(
      `learning:experience:index:domain:${domain}:*`,
      1000
    );
    const experiences: Experience[] = [];

    for (const key of keys) {
      const experienceId = await this.memory.get<string>(key);
      if (experienceId) {
        const experience = await this.memory.get<Experience>(
          `learning:experience:${experienceId}`
        );
        if (experience && timeRange.contains(experience.timestamp)) {
          experiences.push(experience);
        }
      }
    }

    return experiences;
  }

  private async extractPatternsFromExperiences(
    experiences: Experience[]
  ): Promise<LearnedPattern[]> {
    // Group successful experiences by action type
    const successfulExperiences = experiences.filter((e) => e.result.success);
    const actionGroups: Map<string, Experience[]> = new Map();

    for (const exp of successfulExperiences) {
      const existing = actionGroups.get(exp.action) || [];
      existing.push(exp);
      actionGroups.set(exp.action, existing);
    }

    const patterns: LearnedPattern[] = [];
    for (const [_, groupExperiences] of actionGroups) {
      if (groupExperiences.length >= this.config.minExperiencesForPattern) {
        const result = await this.learnPattern(groupExperiences);
        if (result.success) {
          patterns.push(result.value);
        }
      }
    }

    return patterns;
  }

  private matchesContext(
    pattern: LearnedPattern,
    context: PatternContext
  ): boolean {
    if (context.language && pattern.context.language !== context.language) {
      return false;
    }
    if (context.framework && pattern.context.framework !== context.framework) {
      return false;
    }
    if (context.testType && pattern.context.testType !== context.testType) {
      return false;
    }
    if (context.tags.length > 0) {
      const hasMatchingTag = context.tags.some((tag) =>
        pattern.context.tags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }
    return true;
  }

  private extractCommonActions(experiences: Experience[]): string[] {
    const actionCounts: Map<string, number> = new Map();
    for (const exp of experiences) {
      const count = actionCounts.get(exp.action) || 0;
      actionCounts.set(exp.action, count + 1);
    }

    return Array.from(actionCounts.entries())
      .filter(([_, count]) => count >= experiences.length * 0.3)
      .map(([action]) => action);
  }

  private calculateAverageReward(experiences: Experience[]): number {
    if (experiences.length === 0) return 0;
    const sum = experiences.reduce((acc, exp) => acc + exp.reward, 0);
    return sum / experiences.length;
  }

  private calculateSuccessRate(experiences: Experience[]): number {
    if (experiences.length === 0) return 0;
    const successCount = experiences.filter((e) => e.result.success).length;
    return successCount / experiences.length;
  }

  private inferPatternType(experiences: Experience[]): PatternType {
    const actions = experiences.map((e) => e.action.toLowerCase());

    if (actions.some((a) => a.includes('test') || a.includes('generate'))) {
      return 'test-pattern';
    }
    if (actions.some((a) => a.includes('fix') || a.includes('repair'))) {
      return 'fix-pattern';
    }
    if (actions.some((a) => a.includes('optimize') || a.includes('improve'))) {
      return 'optimization-pattern';
    }
    if (actions.some((a) => a.includes('detect') || a.includes('find'))) {
      return 'detection-pattern';
    }
    if (actions.some((a) => a.includes('workflow') || a.includes('process'))) {
      return 'workflow-pattern';
    }
    if (actions.some((a) => a.includes('fail') || a.includes('error'))) {
      return 'failure-pattern';
    }

    return 'workflow-pattern';
  }

  private generatePatternTemplate(
    experiences: Experience[],
    commonActions: string[]
  ): PatternTemplate {
    const variables: TemplateVariable[] = [
      {
        name: 'domain',
        type: 'string',
        required: true,
        description: 'Target domain for the pattern',
      },
      {
        name: 'action',
        type: 'string',
        required: true,
        defaultValue: commonActions[0],
        description: 'Primary action to execute',
      },
    ];

    const content = `// Pattern learned from ${experiences.length} experiences
// Common actions: ${commonActions.join(', ')}
// Apply to domain: {{domain}}
// Execute action: {{action}}`;

    return {
      type: 'workflow',
      content,
      variables,
    };
  }

  private extractPatternContext(experiences: Experience[]): PatternContext {
    const tags = new Set<string>();
    let language: string | undefined;
    let framework: string | undefined;

    for (const exp of experiences) {
      const context = exp.state.context;
      if (context.language) {
        language = context.language as string;
      }
      if (context.framework) {
        framework = context.framework as string;
      }
      if (context.tags && Array.isArray(context.tags)) {
        for (const tag of context.tags) {
          tags.add(tag as string);
        }
      }
    }

    return {
      language,
      framework,
      tags: Array.from(tags),
    };
  }

  private calculateConsolidatedConfidence(patterns: LearnedPattern[]): number {
    const totalUsage = patterns.reduce((sum, p) => sum + p.usageCount, 0);
    let weightedConfidence = 0;

    for (const pattern of patterns) {
      const weight = totalUsage > 0 ? pattern.usageCount / totalUsage : 1 / patterns.length;
      weightedConfidence += pattern.confidence * weight;
    }

    return weightedConfidence;
  }

  private calculateWeightedSuccessRate(patterns: LearnedPattern[]): number {
    const totalUsage = patterns.reduce((sum, p) => sum + p.usageCount, 0);
    let weightedRate = 0;

    for (const pattern of patterns) {
      const weight = totalUsage > 0 ? pattern.usageCount / totalUsage : 1 / patterns.length;
      weightedRate += pattern.successRate * weight;
    }

    return weightedRate;
  }

  private detectAnomalies(experiences: Experience[]): ExperienceAnomaly[] {
    const anomalies: ExperienceAnomaly[] = [];
    const avgReward = this.calculateAverageReward(experiences);
    const rewardStdDev = this.calculateStdDev(experiences.map((e) => e.reward));

    for (const exp of experiences) {
      const deviation = Math.abs(exp.reward - avgReward) / (rewardStdDev || 1);

      if (deviation > this.config.anomalyDeviationThreshold) {
        let type: ExperienceAnomaly['type'] = 'outlier-reward';
        if (exp.result.success && exp.reward < avgReward) {
          type = 'unexpected-success';
        } else if (!exp.result.success && exp.reward > avgReward) {
          type = 'unexpected-failure';
        }

        anomalies.push({
          experienceId: exp.id,
          type,
          description: `Reward ${exp.reward.toFixed(2)} deviates ${deviation.toFixed(2)} std from mean ${avgReward.toFixed(2)}`,
          deviation,
        });
      }
    }

    return anomalies;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private generateRecommendations(
    experiences: Experience[],
    successRate: number,
    anomalies: ExperienceAnomaly[]
  ): string[] {
    const recommendations: string[] = [];

    if (successRate < 0.5) {
      recommendations.push(
        'Low success rate detected. Consider reviewing the approach or gathering more training data.'
      );
    }

    if (anomalies.length > experiences.length * 0.1) {
      recommendations.push(
        'High anomaly rate detected. Investigate unexpected outcomes for potential improvements.'
      );
    }

    const avgDuration =
      experiences.reduce((sum, e) => sum + e.result.duration, 0) /
      experiences.length;
    if (avgDuration > 60000) {
      recommendations.push(
        'Average operation duration is high. Consider optimizing performance.'
      );
    }

    if (experiences.length < 10) {
      recommendations.push(
        'Limited experience data. Collect more data points for better insights.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Performance metrics are within acceptable ranges. Continue monitoring.'
      );
    }

    return recommendations;
  }

  private actionsSimilar(action1: string, action2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const n1 = normalize(action1);
    const n2 = normalize(action2);

    // Simple similarity check - could be improved with edit distance
    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;

    return false;
  }

  private calculateCentroid(experiences: Experience[]): StateSnapshot {
    const avgMetrics: Record<string, number> = {};
    const metricCounts: Record<string, number> = {};

    for (const exp of experiences) {
      for (const [key, value] of Object.entries(exp.state.metrics)) {
        avgMetrics[key] = (avgMetrics[key] || 0) + value;
        metricCounts[key] = (metricCounts[key] || 0) + 1;
      }
    }

    for (const key of Object.keys(avgMetrics)) {
      avgMetrics[key] /= metricCounts[key];
    }

    return {
      context: {},
      metrics: avgMetrics,
    };
  }

  private isConstraintViolated(
    constraint: { metric: string; operator: string; value: number },
    actualValue: number
  ): boolean {
    switch (constraint.operator) {
      case 'lt':
        return actualValue >= constraint.value;
      case 'gt':
        return actualValue <= constraint.value;
      case 'lte':
        return actualValue > constraint.value;
      case 'gte':
        return actualValue < constraint.value;
      case 'eq':
        return actualValue !== constraint.value;
      default:
        return false;
    }
  }
}
