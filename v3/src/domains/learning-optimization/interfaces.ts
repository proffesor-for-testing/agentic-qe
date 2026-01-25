/**
 * Agentic QE v3 - Learning & Optimization Domain Interfaces
 *
 * Bounded Context: Learning & Optimization
 * Responsibility: Pattern learning, cross-agent knowledge transfer, strategy optimization
 */

import type { DomainEvent, Result, AgentId, DomainName } from '../../shared/types/index.js';
import type { TimeRange } from '../../shared/value-objects/index.js';

// ============================================================================
// Value Objects
// ============================================================================

/**
 * Learned pattern from QE operations
 */
export interface LearnedPattern {
  readonly id: string;
  readonly type: PatternType;
  readonly domain: DomainName;
  readonly name: string;
  readonly description: string;
  readonly confidence: number;
  readonly usageCount: number;
  readonly successRate: number;
  readonly context: PatternContext;
  readonly template: PatternTemplate;
  readonly createdAt: Date;
  readonly lastUsedAt: Date;
}

export type PatternType =
  | 'test-pattern'
  | 'fix-pattern'
  | 'optimization-pattern'
  | 'detection-pattern'
  | 'workflow-pattern'
  | 'failure-pattern';

export interface PatternContext {
  readonly language?: string;
  readonly framework?: string;
  readonly testType?: string;
  readonly codeContext?: string;
  readonly tags: string[];
}

export interface PatternTemplate {
  readonly type: 'code' | 'prompt' | 'workflow' | 'config';
  readonly content: string;
  readonly variables: TemplateVariable[];
}

export interface TemplateVariable {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly description?: string;
}

/**
 * Experience record for reinforcement learning
 */
export interface Experience {
  readonly id: string;
  readonly agentId: AgentId;
  readonly domain: DomainName;
  readonly action: string;
  readonly state: StateSnapshot;
  readonly result: ExperienceResult;
  readonly reward: number;
  readonly timestamp: Date;
}

export interface StateSnapshot {
  readonly context: Record<string, unknown>;
  readonly metrics: Record<string, number>;
  readonly embeddings?: number[];
}

export interface ExperienceResult {
  readonly success: boolean;
  readonly outcome: Record<string, unknown>;
  readonly duration: number;
  readonly resourceUsage?: ResourceUsage;
}

export interface ResourceUsage {
  readonly cpuMs: number;
  readonly memoryMb: number;
  readonly tokens?: number;
}

/**
 * Knowledge item for transfer learning
 */
export interface Knowledge {
  readonly id: string;
  readonly type: KnowledgeType;
  readonly domain: DomainName;
  readonly content: KnowledgeContent;
  readonly sourceAgentId: AgentId;
  readonly targetDomains: DomainName[];
  readonly relevanceScore: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
}

export type KnowledgeType =
  | 'fact'
  | 'rule'
  | 'heuristic'
  | 'model'
  | 'embedding'
  | 'workflow';

export interface KnowledgeContent {
  readonly format: 'text' | 'json' | 'embedding' | 'model';
  readonly data: unknown;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Strategy optimization result
 */
export interface OptimizedStrategy {
  readonly id: string;
  readonly domain: DomainName;
  readonly objective: OptimizationObjective;
  readonly currentStrategy: Strategy;
  readonly optimizedStrategy: Strategy;
  readonly improvement: number;
  readonly confidence: number;
  readonly validationResults: ValidationResult[];
}

export interface OptimizationObjective {
  readonly metric: string;
  readonly direction: 'maximize' | 'minimize';
  readonly constraints: Constraint[];
}

export interface Constraint {
  readonly metric: string;
  readonly operator: 'lt' | 'gt' | 'lte' | 'gte' | 'eq';
  readonly value: number;
}

export interface Strategy {
  readonly name: string;
  readonly parameters: Record<string, unknown>;
  readonly expectedOutcome: Record<string, number>;
}

export interface ValidationResult {
  readonly testId: string;
  readonly passed: boolean;
  readonly metrics: Record<string, number>;
}

// ============================================================================
// Domain Events
// ============================================================================

export interface PatternLearnedEvent extends DomainEvent {
  readonly type: 'PatternLearnedEvent';
  readonly patternId: string;
  readonly patternType: PatternType;
  readonly domain: DomainName;
  readonly confidence: number;
}

export interface KnowledgeSharedEvent extends DomainEvent {
  readonly type: 'KnowledgeSharedEvent';
  readonly knowledgeId: string;
  readonly sourceAgent: AgentId;
  readonly targetDomains: DomainName[];
  readonly knowledgeType: KnowledgeType;
}

export interface StrategyOptimizedEvent extends DomainEvent {
  readonly type: 'StrategyOptimizedEvent';
  readonly strategyId: string;
  readonly domain: DomainName;
  readonly improvement: number;
  readonly metric: string;
}

export interface ExperienceRecordedEvent extends DomainEvent {
  readonly type: 'ExperienceRecordedEvent';
  readonly experienceId: string;
  readonly agentId: AgentId;
  readonly domain: DomainName;
  readonly reward: number;
}

export interface LearningMilestoneReachedEvent extends DomainEvent {
  readonly type: 'LearningMilestoneReachedEvent';
  readonly milestone: string;
  readonly domain: DomainName;
  readonly metrics: Record<string, number>;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Pattern Learning Service
 * Extracts and manages learned patterns
 */
export interface IPatternLearningService {
  /**
   * Learn pattern from experience
   */
  learnPattern(experiences: Experience[]): Promise<Result<LearnedPattern>>;

  /**
   * Find matching patterns
   */
  findMatchingPatterns(context: PatternContext, limit?: number): Promise<Result<LearnedPattern[]>>;

  /**
   * Apply pattern to generate output
   */
  applyPattern(pattern: LearnedPattern, variables: Record<string, unknown>): Promise<Result<string>>;

  /**
   * Update pattern based on feedback
   */
  updatePatternFeedback(patternId: string, success: boolean): Promise<Result<void>>;

  /**
   * Consolidate similar patterns
   */
  consolidatePatterns(patternIds: string[]): Promise<Result<LearnedPattern>>;

  /**
   * Get pattern statistics
   */
  getPatternStats(domain?: DomainName): Promise<Result<PatternStats>>;
}

export interface PatternStats {
  readonly totalPatterns: number;
  readonly byType: Record<PatternType, number>;
  readonly byDomain: Record<DomainName, number>;
  readonly avgConfidence: number;
  readonly avgSuccessRate: number;
  readonly topPatterns: LearnedPattern[];
}

/**
 * Experience Mining Service
 * Collects and analyzes agent experiences
 */
export interface IExperienceMiningService {
  /**
   * Record experience
   */
  recordExperience(experience: Omit<Experience, 'id' | 'timestamp'>): Promise<Result<string>>;

  /**
   * Mine experiences for patterns
   */
  mineExperiences(
    domain: DomainName,
    timeRange: TimeRange
  ): Promise<Result<MinedInsights>>;

  /**
   * Calculate reward for experience
   */
  calculateReward(result: ExperienceResult, objective: OptimizationObjective): number;

  /**
   * Get experience replay buffer
   */
  getReplayBuffer(agentId: AgentId, limit?: number): Promise<Result<Experience[]>>;

  /**
   * Cluster similar experiences
   */
  clusterExperiences(experiences: Experience[]): Promise<Result<ExperienceCluster[]>>;
}

export interface MinedInsights {
  readonly experienceCount: number;
  readonly successRate: number;
  readonly avgReward: number;
  readonly patterns: LearnedPattern[];
  readonly anomalies: ExperienceAnomaly[];
  readonly recommendations: string[];
}

export interface ExperienceCluster {
  readonly id: string;
  readonly centroid: StateSnapshot;
  readonly experiences: Experience[];
  readonly commonActions: string[];
  readonly avgReward: number;
}

export interface ExperienceAnomaly {
  readonly experienceId: string;
  readonly type: 'unexpected-failure' | 'unexpected-success' | 'outlier-reward';
  readonly description: string;
  readonly deviation: number;
}

/**
 * Strategy Optimizer Service
 * Optimizes agent strategies using ML
 */
export interface IStrategyOptimizerService {
  /**
   * Optimize strategy for objective
   */
  optimizeStrategy(
    currentStrategy: Strategy,
    objective: OptimizationObjective,
    experiences: Experience[]
  ): Promise<Result<OptimizedStrategy>>;

  /**
   * A/B test strategies
   */
  runABTest(
    strategyA: Strategy,
    strategyB: Strategy,
    testConfig: ABTestConfig
  ): Promise<Result<ABTestResult>>;

  /**
   * Get recommended strategy for context
   */
  recommendStrategy(context: PatternContext): Promise<Result<Strategy>>;

  /**
   * Evaluate strategy performance
   */
  evaluateStrategy(strategy: Strategy, experiences: Experience[]): Promise<Result<StrategyEvaluation>>;
}

export interface ABTestConfig {
  readonly duration: number;
  readonly minSamples: number;
  readonly confidenceLevel: number;
  readonly metric: string;
}

export interface ABTestResult {
  readonly winner: 'A' | 'B' | 'inconclusive';
  readonly strategyAMetrics: Record<string, number>;
  readonly strategyBMetrics: Record<string, number>;
  readonly pValue: number;
  readonly sampleSizeA: number;
  readonly sampleSizeB: number;
}

export interface StrategyEvaluation {
  readonly strategy: Strategy;
  readonly metrics: Record<string, number>;
  readonly strengths: string[];
  readonly weaknesses: string[];
  readonly improvementAreas: string[];
}

/**
 * Knowledge Synthesis Service
 * Cross-agent knowledge transfer
 */
export interface IKnowledgeSynthesisService {
  /**
   * Share knowledge between agents
   */
  shareKnowledge(knowledge: Knowledge, targetAgents: AgentId[]): Promise<Result<void>>;

  /**
   * Query knowledge base
   */
  queryKnowledge(query: KnowledgeQuery): Promise<Result<Knowledge[]>>;

  /**
   * Synthesize knowledge from multiple sources
   */
  synthesizeKnowledge(knowledgeIds: string[]): Promise<Result<Knowledge>>;

  /**
   * Transfer knowledge between domains
   */
  transferKnowledge(
    knowledge: Knowledge,
    targetDomain: DomainName
  ): Promise<Result<Knowledge>>;

  /**
   * Validate knowledge relevance
   */
  validateRelevance(knowledge: Knowledge, context: PatternContext): Promise<Result<number>>;
}

export interface KnowledgeQuery {
  readonly type?: KnowledgeType;
  readonly domain?: DomainName;
  readonly tags?: string[];
  readonly minRelevance?: number;
  readonly limit?: number;
  readonly embedding?: number[];
}

// ============================================================================
// Repository Interfaces
// ============================================================================

export interface IPatternRepository {
  findById(id: string): Promise<LearnedPattern | null>;
  findByDomain(domain: DomainName): Promise<LearnedPattern[]>;
  findByType(type: PatternType): Promise<LearnedPattern[]>;
  findSimilar(embedding: number[], limit: number): Promise<LearnedPattern[]>;
  save(pattern: LearnedPattern): Promise<void>;
  update(pattern: LearnedPattern): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IExperienceRepository {
  findById(id: string): Promise<Experience | null>;
  findByAgentId(agentId: AgentId, limit?: number): Promise<Experience[]>;
  findByDomain(domain: DomainName, timeRange: TimeRange): Promise<Experience[]>;
  save(experience: Experience): Promise<void>;
  deleteOlderThan(date: Date): Promise<number>;
}

export interface IKnowledgeRepository {
  findById(id: string): Promise<Knowledge | null>;
  findByDomain(domain: DomainName): Promise<Knowledge[]>;
  findByType(type: KnowledgeType): Promise<Knowledge[]>;
  search(query: KnowledgeQuery): Promise<Knowledge[]>;
  save(knowledge: Knowledge): Promise<void>;
  update(knowledge: Knowledge): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IStrategyRepository {
  findById(id: string): Promise<OptimizedStrategy | null>;
  findByDomain(domain: DomainName): Promise<OptimizedStrategy[]>;
  findBest(domain: DomainName, objective: string): Promise<OptimizedStrategy | null>;
  save(strategy: OptimizedStrategy): Promise<void>;
}

// ============================================================================
// Coordinator Interface
// ============================================================================

export interface ILearningOptimizationCoordinator {
  /**
   * Run learning cycle for domain
   */
  runLearningCycle(domain: DomainName): Promise<Result<LearningCycleReport>>;

  /**
   * Optimize all domain strategies
   */
  optimizeAllStrategies(): Promise<Result<OptimizationReport>>;

  /**
   * Share learnings across domains
   */
  shareCrossDomainLearnings(): Promise<Result<CrossDomainSharingReport>>;

  /**
   * Get learning dashboard
   */
  getLearningDashboard(): Promise<Result<LearningDashboard>>;

  /**
   * Export learned models
   */
  exportModels(domains?: DomainName[]): Promise<Result<ModelExport>>;

  /**
   * Import learned models
   */
  importModels(modelExport: ModelExport): Promise<Result<ImportReport>>;
}

export interface LearningCycleReport {
  readonly domain: DomainName;
  readonly experiencesProcessed: number;
  readonly patternsLearned: number;
  readonly strategiesOptimized: number;
  readonly knowledgeGenerated: number;
  readonly improvements: Improvement[];
}

export interface Improvement {
  readonly metric: string;
  readonly before: number;
  readonly after: number;
  readonly percentChange: number;
}

export interface OptimizationReport {
  readonly domainsOptimized: number;
  readonly totalStrategies: number;
  readonly avgImprovement: number;
  readonly byDomain: Record<DomainName, DomainOptimizationResult>;
}

export interface DomainOptimizationResult {
  readonly strategiesOptimized: number;
  readonly avgImprovement: number;
  readonly bestStrategy: Strategy;
}

export interface CrossDomainSharingReport {
  readonly knowledgeShared: number;
  readonly domainsUpdated: DomainName[];
  readonly transferSuccessRate: number;
  readonly newPatternsCreated: number;
}

export interface LearningDashboard {
  readonly overallLearningRate: number;
  readonly totalPatterns: number;
  readonly totalKnowledge: number;
  readonly experiencesLast24h: number;
  readonly topPerformingDomains: DomainName[];
  readonly learningTrend: TrendPoint[];
  readonly recentMilestones: Milestone[];
}

export interface TrendPoint {
  readonly timestamp: Date;
  readonly metric: string;
  readonly value: number;
}

export interface Milestone {
  readonly name: string;
  readonly achievedAt: Date;
  readonly domain: DomainName;
}

export interface ModelExport {
  readonly version: string;
  readonly exportedAt: Date;
  readonly patterns: LearnedPattern[];
  readonly knowledge: Knowledge[];
  readonly strategies: OptimizedStrategy[];
  readonly checksum: string;
}

export interface ImportReport {
  readonly patternsImported: number;
  readonly knowledgeImported: number;
  readonly strategiesImported: number;
  readonly conflicts: ImportConflict[];
  readonly resolved: boolean;
}

export interface ImportConflict {
  readonly type: 'pattern' | 'knowledge' | 'strategy';
  readonly id: string;
  readonly reason: string;
  readonly resolution: 'skip' | 'overwrite' | 'merge';
}
