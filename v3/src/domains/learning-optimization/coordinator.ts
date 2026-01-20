/**
 * Agentic QE v3 - Learning & Optimization Coordinator
 * Orchestrates learning workflows across all QE domains
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  DomainName,
  ALL_DOMAINS,
} from '../../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces.js';
import { TimeRange } from '../../shared/value-objects/index.js';
import {
  LearningOptimizationEvents,
  PatternConsolidatedPayload,
  TransferCompletedPayload,
  createEvent,
} from '../../shared/events/domain-events.js';
import {
  ILearningOptimizationCoordinator,
  LearningCycleReport,
  OptimizationReport,
  CrossDomainSharingReport,
  LearningDashboard,
  ModelExport,
  ImportReport,
  ImportConflict,
  Improvement,
  DomainOptimizationResult,
  LearnedPattern,
  Knowledge,
  OptimizedStrategy,
  Experience,
  OptimizationObjective,
} from './interfaces.js';
import {
  LearningCoordinatorService,
  TransferSpecialistService,
  MetricsOptimizerService,
  ProductionIntelService,
} from './services/index.js';
import {
  PersistentSONAEngine,
  createPersistentSONAEngine,
} from '../../integrations/ruvector/sona-persistence.js';
import {
  type QESONAPattern,
  type QEPatternType,
  type QESONAStats,
  type QESONAAdaptationResult,
} from '../../integrations/ruvector/wrappers.js';
import type { RLState, RLAction } from '../../integrations/rl-suite/interfaces.js';

/**
 * Workflow status tracking
 */
export interface LearningWorkflowStatus {
  id: string;
  type: 'learning-cycle' | 'optimization' | 'transfer' | 'export' | 'import';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  agentIds: string[];
  progress: number;
  error?: string;
}

/**
 * Coordinator configuration
 */
export interface LearningCoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  enableAutoOptimization: boolean;
  publishEvents: boolean;
  learningCycleIntervalMs: number;
}

const DEFAULT_CONFIG: LearningCoordinatorConfig = {
  maxConcurrentWorkflows: 3,
  defaultTimeout: 120000, // 2 minutes
  enableAutoOptimization: true,
  publishEvents: true,
  learningCycleIntervalMs: 3600000, // 1 hour
};

/**
 * Learning & Optimization Coordinator
 * Orchestrates cross-domain learning and optimization workflows
 */
export class LearningOptimizationCoordinator
  implements ILearningOptimizationCoordinator
{
  private readonly config: LearningCoordinatorConfig;
  private readonly workflows: Map<string, LearningWorkflowStatus> = new Map();
  private readonly learningService: LearningCoordinatorService;
  private readonly transferService: TransferSpecialistService;
  private readonly optimizerService: MetricsOptimizerService;
  private readonly productionIntel: ProductionIntelService;
  private initialized = false;

  /**
   * QESONA (Self-Optimizing Neural Architecture) for pattern learning
   * Provides <0.05ms pattern adaptation via @ruvector/sona
   * Now uses PersistentSONAEngine to survive restarts
   */
  private sona!: PersistentSONAEngine;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<LearningCoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.learningService = new LearningCoordinatorService(memory);
    this.transferService = new TransferSpecialistService(memory);
    this.optimizerService = new MetricsOptimizerService(memory);
    this.productionIntel = new ProductionIntelService(memory);
  }

  /**
   * Initialize the coordinator.
   * Throws if QESONA fails to initialize.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize QESONA for neural pattern learning (persistent patterns)
    try {
      this.sona = await createPersistentSONAEngine({
        domain: 'learning-optimization',
        loadOnInit: true,
        autoSaveInterval: 60000,
        maxPatterns: 10000,
        minConfidence: 0.5,
      });
      console.log('[LearningOptimizationCoordinator] PersistentSONAEngine initialized for pattern learning');
    } catch (error) {
      console.error('[LearningOptimizationCoordinator] Failed to initialize PersistentSONAEngine:', error);
      throw error; // Learning optimization requires SONA
    }

    // Subscribe to relevant events
    this.subscribeToEvents();

    // Load any persisted workflow state
    await this.loadWorkflowState();

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    // Save workflow state
    await this.saveWorkflowState();

    // Clear active workflows
    this.workflows.clear();

    // V3: Clean up SONA engine (persistent patterns)
    if (this.initialized && this.sona) {
      try {
        await this.sona.close();
      } catch (error) {
        console.error('[LearningOptimizationCoordinator] Error closing SONA engine:', error);
      }
    }

    this.initialized = false;
  }

  /**
   * Get active workflow statuses
   */
  getActiveWorkflows(): LearningWorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  // ============================================================================
  // ILearningOptimizationCoordinator Implementation
  // ============================================================================

  /**
   * Run a learning cycle for a specific domain
   */
  async runLearningCycle(domain: DomainName): Promise<Result<LearningCycleReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'learning-cycle');

      // Spawn learning agent
      const agentResult = await this.spawnLearningAgent(workflowId, domain);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Get experiences from the last cycle
      const timeRange = TimeRange.lastNDays(1);
      const experiencesResult = await this.getExperiencesForDomain(domain, timeRange);
      const experiences = experiencesResult.success ? experiencesResult.value : [];

      this.updateWorkflowProgress(workflowId, 20);

      // Mine experiences for patterns
      const insightsResult = await this.learningService.mineExperiences(
        domain,
        timeRange
      );
      const patternsLearned = insightsResult.success
        ? insightsResult.value.patterns.length
        : 0;

      this.updateWorkflowProgress(workflowId, 50);

      // Optimize strategies based on experiences
      let strategiesOptimized = 0;
      const improvements: Improvement[] = [];

      if (experiences.length >= 10) {
        const objective: OptimizationObjective = {
          metric: 'success_rate',
          direction: 'maximize',
          constraints: [],
        };

        const currentStrategy = await this.getCurrentStrategy(domain);
        const optimizationResult = await this.optimizerService.optimizeStrategy(
          currentStrategy,
          objective,
          experiences
        );

        if (optimizationResult.success) {
          strategiesOptimized = 1;
          improvements.push({
            metric: objective.metric,
            before: this.calculateMetricValue(experiences, objective.metric),
            after: optimizationResult.value.optimizedStrategy.expectedOutcome[objective.metric] || 0,
            percentChange: optimizationResult.value.improvement * 100,
          });
        }
      }

      this.updateWorkflowProgress(workflowId, 80);

      // Generate knowledge from insights
      let knowledgeGenerated = 0;
      if (insightsResult.success && insightsResult.value.recommendations.length > 0) {
        const knowledgeResult = await this.transferService.createKnowledge(
          'heuristic',
          domain,
          insightsResult.value.recommendations,
          {
            value: `learning-agent-${workflowId.slice(0, 8)}`,
            domain: 'learning-optimization',
            type: 'analyzer',
          },
          [domain]
        );

        if (knowledgeResult.success) {
          knowledgeGenerated = 1;
        }
      }

      // Complete workflow
      this.completeWorkflow(workflowId);

      // Stop agent
      await this.agentCoordinator.stop(agentResult.value);

      const report: LearningCycleReport = {
        domain,
        experiencesProcessed: experiences.length,
        patternsLearned,
        strategiesOptimized,
        knowledgeGenerated,
        improvements,
      };

      // Publish event
      if (this.config.publishEvents && patternsLearned > 0) {
        await this.publishPatternConsolidated(patternsLearned, [domain]);
      }

      return ok(report);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Optimize all domain strategies
   */
  async optimizeAllStrategies(): Promise<Result<OptimizationReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'optimization');

      const byDomain: Record<DomainName, DomainOptimizationResult> = {} as Record<
        DomainName,
        DomainOptimizationResult
      >;
      let totalStrategies = 0;
      let totalImprovement = 0;
      let domainsOptimized = 0;

      const targetDomains = ALL_DOMAINS.filter(
        (d) => d !== 'learning-optimization'
      );

      for (let i = 0; i < targetDomains.length; i++) {
        const domain = targetDomains[i];
        this.updateWorkflowProgress(
          workflowId,
          Math.round((i / targetDomains.length) * 100)
        );

        const timeRange = TimeRange.lastNDays(7);
        const experiencesResult = await this.getExperiencesForDomain(
          domain,
          timeRange
        );

        if (!experiencesResult.success || experiencesResult.value.length < 10) {
          continue;
        }

        const experiences = experiencesResult.value;
        const objective: OptimizationObjective = {
          metric: 'success_rate',
          direction: 'maximize',
          constraints: [],
        };

        const currentStrategy = await this.getCurrentStrategy(domain);
        const optimizationResult = await this.optimizerService.optimizeStrategy(
          currentStrategy,
          objective,
          experiences
        );

        if (optimizationResult.success) {
          totalStrategies++;
          totalImprovement += optimizationResult.value.improvement;
          domainsOptimized++;

          byDomain[domain] = {
            strategiesOptimized: 1,
            avgImprovement: optimizationResult.value.improvement,
            bestStrategy: optimizationResult.value.optimizedStrategy,
          };

          // Store as current strategy
          await this.storeStrategy(domain, optimizationResult.value.optimizedStrategy);
        }
      }

      this.completeWorkflow(workflowId);

      const report: OptimizationReport = {
        domainsOptimized,
        totalStrategies,
        avgImprovement: totalStrategies > 0 ? totalImprovement / totalStrategies : 0,
        byDomain,
      };

      // Publish event
      if (this.config.publishEvents && totalStrategies > 0) {
        await this.publishOptimizationApplied(report);
      }

      return ok(report);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Share learnings across domains
   */
  async shareCrossDomainLearnings(): Promise<Result<CrossDomainSharingReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'transfer');

      let knowledgeShared = 0;
      const domainsUpdated: DomainName[] = [];
      let newPatternsCreated = 0;
      let totalTransfers = 0;
      let successfulTransfers = 0;

      // Get all knowledge items
      const queryResult = await this.transferService.queryKnowledge({
        minRelevance: 0.7,
        limit: 100,
      });

      if (!queryResult.success) {
        this.failWorkflow(workflowId, queryResult.error.message);
        return err(queryResult.error);
      }

      const knowledgeItems = queryResult.value;

      // Transfer high-relevance knowledge to related domains
      for (const knowledge of knowledgeItems) {
        const targetDomains = this.getRelatedDomains(knowledge.domain);

        for (const targetDomain of targetDomains) {
          if (targetDomain === knowledge.domain) continue;

          totalTransfers++;
          const transferResult = await this.transferService.transferKnowledge(
            knowledge,
            targetDomain
          );

          if (transferResult.success) {
            successfulTransfers++;
            knowledgeShared++;

            if (!domainsUpdated.includes(targetDomain)) {
              domainsUpdated.push(targetDomain);
            }
          }
        }

        this.updateWorkflowProgress(
          workflowId,
          Math.round((knowledgeShared / (knowledgeItems.length * 2)) * 100)
        );
      }

      // Consolidate similar patterns
      const patternStatsResult = await this.learningService.getPatternStats();
      if (patternStatsResult.success) {
        const topPatterns = patternStatsResult.value.topPatterns;
        if (topPatterns.length >= 2) {
          const similarPatterns = this.findSimilarPatterns(topPatterns);

          for (const group of similarPatterns) {
            if (group.length >= 2) {
              const consolidateResult = await this.learningService.consolidatePatterns(
                group.map((p) => p.id)
              );
              if (consolidateResult.success) {
                newPatternsCreated++;
              }
            }
          }
        }
      }

      this.completeWorkflow(workflowId);

      const report: CrossDomainSharingReport = {
        knowledgeShared,
        domainsUpdated,
        transferSuccessRate:
          totalTransfers > 0 ? successfulTransfers / totalTransfers : 1,
        newPatternsCreated,
      };

      // Publish event
      if (this.config.publishEvents && knowledgeShared > 0) {
        await this.publishTransferCompleted(report);
      }

      return ok(report);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get learning dashboard
   */
  async getLearningDashboard(): Promise<Result<LearningDashboard>> {
    try {
      // Get pattern stats
      const patternStatsResult = await this.learningService.getPatternStats();
      const patternStats = patternStatsResult.success
        ? patternStatsResult.value
        : null;

      // Get knowledge count
      const knowledgeResult = await this.transferService.queryKnowledge({
        limit: 1000,
      });
      const totalKnowledge = knowledgeResult.success
        ? knowledgeResult.value.length
        : 0;

      // Get experiences from last 24h
      const timeRange = TimeRange.lastNDays(1);
      let experiencesLast24h = 0;
      for (const domain of ALL_DOMAINS) {
        const expResult = await this.getExperiencesForDomain(domain, timeRange);
        if (expResult.success) {
          experiencesLast24h += expResult.value.length;
        }
      }

      // Get production health for trends
      const healthResult = await this.productionIntel.getProductionHealth();
      const trends = healthResult.success ? healthResult.value.trends : [];

      // Get milestones
      const milestonesResult = await this.productionIntel.getRecentMilestones(5);
      const recentMilestones = milestonesResult.success
        ? milestonesResult.value
        : [];

      // Calculate overall learning rate
      const overallLearningRate = patternStats
        ? patternStats.avgSuccessRate * 0.6 + (patternStats.avgConfidence * 0.4)
        : 0.5;

      // Determine top performing domains
      const topPerformingDomains: DomainName[] = [];
      if (patternStats) {
        const domainScores = Object.entries(patternStats.byDomain)
          .filter(([_, count]) => count > 0)
          .map(([domain, count]) => ({ domain: domain as DomainName, score: count }))
          .sort((a, b) => b.score - a.score);

        topPerformingDomains.push(...domainScores.slice(0, 3).map((d) => d.domain));
      }

      const dashboard: LearningDashboard = {
        overallLearningRate,
        totalPatterns: patternStats?.totalPatterns || 0,
        totalKnowledge,
        experiencesLast24h,
        topPerformingDomains,
        learningTrend: trends,
        recentMilestones,
      };

      return ok(dashboard);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // QESONA Pattern Learning Methods (via @ruvector/sona)
  // ============================================================================

  /**
   * Learn a pattern using QESONA neural architecture.
   * Creates patterns with <0.05ms adaptation time via @ruvector/sona.
   *
   * @param state - RL state representing the learning context
   * @param action - Action taken in this state
   * @param outcome - Outcome of the action (reward, success, quality)
   * @param patternType - Type of pattern to create
   * @param domain - Source domain for this pattern
   * @param metadata - Optional additional metadata
   * @returns The created QESONA pattern
   * @throws Error if coordinator is not initialized
   */
  learnPattern(
    state: RLState,
    action: RLAction,
    outcome: QESONAPattern['outcome'],
    patternType: QEPatternType,
    domain: DomainName,
    metadata?: Record<string, unknown>
  ): QESONAPattern {
    this.ensureInitialized();
    return this.sona.createPattern(state, action, outcome, patternType, domain, metadata);
  }

  /**
   * Ensure the coordinator is initialized before use.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        '[LearningOptimizationCoordinator] Not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Adapt a pattern based on current context using QESONA.
   * Leverages @ruvector/sona's HNSW-indexed pattern matching for <0.05ms adaptation.
   *
   * @param state - Current RL state to adapt pattern for
   * @param patternType - Type of pattern to search for
   * @param domain - Domain to search within
   * @returns Adaptation result including matched pattern and similarity score
   * @throws Error if coordinator is not initialized
   */
  async adaptPattern(
    state: RLState,
    patternType: QEPatternType,
    domain: DomainName
  ): Promise<QESONAAdaptationResult> {
    this.ensureInitialized();
    return this.sona.adaptPattern(state, patternType, domain);
  }

  /**
   * Get QESONA statistics including pattern counts, adaptation times, and engine stats.
   *
   * @returns QESONA statistics
   * @throws Error if coordinator is not initialized
   */
  getSONAStats(): QESONAStats {
    this.ensureInitialized();
    return this.sona.getStats();
  }

  /**
   * Get all QESONA patterns.
   *
   * @returns Array of QESONA patterns
   * @throws Error if coordinator is not initialized
   */
  getSONAPatterns(): QESONAPattern[] {
    this.ensureInitialized();
    return this.sona.getAllPatterns();
  }

  /**
   * Get QESONA patterns by type.
   *
   * @param type - Pattern type to filter by
   * @returns Array of matching QESONA patterns
   * @throws Error if coordinator is not initialized
   */
  getSONAPatternsByType(type: QEPatternType): QESONAPattern[] {
    this.ensureInitialized();
    return this.sona.getPatternsByType(type);
  }

  /**
   * Get QESONA patterns by domain.
   *
   * @param domain - Domain to filter by
   * @returns Array of matching QESONA patterns
   * @throws Error if coordinator is not initialized
   */
  getSONAPatternsByDomain(domain: DomainName): QESONAPattern[] {
    this.ensureInitialized();
    return this.sona.getPatternsByDomain(domain);
  }

  /**
   * Update QESONA pattern with feedback.
   * Uses reward signal to update pattern confidence via EWC++.
   *
   * @param patternId - ID of pattern to update
   * @param success - Whether the pattern application was successful
   * @param quality - Quality score (0-1)
   * @returns True if update was successful
   * @throws Error if coordinator is not initialized
   */
  updateSONAPattern(patternId: string, success: boolean, quality: number): boolean {
    this.ensureInitialized();
    return this.sona.updatePattern(patternId, success, quality);
  }

  /**
   * Force QESONA learning cycle.
   * Triggers background learning with EWC++ consolidation.
   *
   * @returns Learning result string
   * @throws Error if coordinator is not initialized
   */
  forceSONALearning(): string {
    this.ensureInitialized();
    return this.sona.forceLearn();
  }

  /**
   * Check if QESONA is available and initialized.
   *
   * @returns True if SONA is available
   */
  isSONAAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Export all QESONA patterns for persistence or transfer.
   *
   * @returns Array of QESONA patterns
   * @throws Error if coordinator is not initialized
   */
  exportSONAPatterns(): QESONAPattern[] {
    this.ensureInitialized();
    return this.sona.exportPatterns();
  }

  /**
   * Import QESONA patterns from external source.
   * Clears existing patterns and loads new ones.
   *
   * @param patterns - Array of patterns to import
   * @throws Error if coordinator is not initialized
   */
  importSONAPatterns(patterns: QESONAPattern[]): void {
    this.ensureInitialized();
    this.sona.importPatterns(patterns);
  }

  /**
   * Verify QESONA performance meets <0.05ms adaptation target.
   *
   * @param iterations - Number of iterations to test (default: 100)
   * @returns Performance verification results
   * @throws Error if coordinator is not initialized
   */
  async verifySONAPerformance(iterations: number = 100): Promise<{
    targetMet: boolean;
    avgTimeMs: number;
    minTimeMs: number;
    maxTimeMs: number;
    details: Array<{ iteration: number; timeMs: number }>;
  }> {
    this.ensureInitialized();
    return this.sona.verifyPerformance(iterations);
  }

  /**
   * Export learned models
   */
  async exportModels(domains?: DomainName[]): Promise<Result<ModelExport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'export');

      const targetDomains = domains || ALL_DOMAINS;
      const patterns: LearnedPattern[] = [];
      const knowledge: Knowledge[] = [];
      const strategies: OptimizedStrategy[] = [];

      // Export patterns
      for (const _domain of targetDomains) {
        const patternKeys = await this.memory.search(
          `learning:pattern:*`,
          500
        );

        for (const key of patternKeys) {
          const pattern = await this.memory.get<LearnedPattern>(key);
          if (pattern && targetDomains.includes(pattern.domain)) {
            patterns.push(pattern);
          }
        }

        this.updateWorkflowProgress(
          workflowId,
          Math.round((patterns.length / 100) * 30)
        );
      }

      // Export knowledge
      const knowledgeResult = await this.transferService.queryKnowledge({
        limit: 1000,
      });
      if (knowledgeResult.success) {
        for (const item of knowledgeResult.value) {
          if (targetDomains.includes(item.domain)) {
            knowledge.push(item);
          }
        }
      }

      this.updateWorkflowProgress(workflowId, 60);

      // Export strategies
      const strategyKeys = await this.memory.search(
        `learning:strategy:optimized:*`,
        200
      );
      for (const key of strategyKeys) {
        const strategy = await this.memory.get<OptimizedStrategy>(key);
        if (strategy && targetDomains.includes(strategy.domain)) {
          strategies.push(strategy);
        }
      }

      this.updateWorkflowProgress(workflowId, 90);

      // Calculate checksum
      const checksum = this.calculateChecksum(patterns, knowledge, strategies);

      this.completeWorkflow(workflowId);

      const modelExport: ModelExport = {
        version: '1.0.0',
        exportedAt: new Date(),
        patterns,
        knowledge,
        strategies,
        checksum,
      };

      return ok(modelExport);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Import learned models
   */
  async importModels(modelExport: ModelExport): Promise<Result<ImportReport>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'import');

      // Validate checksum
      const calculatedChecksum = this.calculateChecksum(
        modelExport.patterns,
        modelExport.knowledge,
        modelExport.strategies
      );

      if (calculatedChecksum !== modelExport.checksum) {
        this.failWorkflow(workflowId, 'Checksum mismatch');
        return err(new Error('Import failed: checksum mismatch'));
      }

      let patternsImported = 0;
      let knowledgeImported = 0;
      let strategiesImported = 0;
      const conflicts: ImportConflict[] = [];

      // Import patterns
      for (const pattern of modelExport.patterns) {
        const existing = await this.memory.get<LearnedPattern>(
          `learning:pattern:${pattern.id}`
        );

        if (existing) {
          if (existing.confidence < pattern.confidence) {
            // Overwrite with better pattern
            await this.memory.set(`learning:pattern:${pattern.id}`, pattern, {
              namespace: 'learning-optimization',
              persist: true,
            });
            patternsImported++;
            conflicts.push({
              type: 'pattern',
              id: pattern.id,
              reason: 'Existing pattern had lower confidence',
              resolution: 'overwrite',
            });
          } else {
            conflicts.push({
              type: 'pattern',
              id: pattern.id,
              reason: 'Existing pattern has higher confidence',
              resolution: 'skip',
            });
          }
        } else {
          await this.memory.set(`learning:pattern:${pattern.id}`, pattern, {
            namespace: 'learning-optimization',
            persist: true,
          });
          patternsImported++;
        }

        this.updateWorkflowProgress(
          workflowId,
          Math.round((patternsImported / modelExport.patterns.length) * 30)
        );
      }

      // Import knowledge
      for (const item of modelExport.knowledge) {
        const existing = await this.memory.get<Knowledge>(
          `learning:knowledge:shared:${item.id}`
        );

        if (existing) {
          if (item.version > existing.version) {
            await this.memory.set(`learning:knowledge:shared:${item.id}`, item, {
              namespace: 'learning-optimization',
              persist: true,
            });
            knowledgeImported++;
            conflicts.push({
              type: 'knowledge',
              id: item.id,
              reason: 'Import has newer version',
              resolution: 'overwrite',
            });
          } else {
            conflicts.push({
              type: 'knowledge',
              id: item.id,
              reason: 'Existing knowledge is same or newer version',
              resolution: 'skip',
            });
          }
        } else {
          await this.memory.set(`learning:knowledge:shared:${item.id}`, item, {
            namespace: 'learning-optimization',
            persist: true,
          });
          knowledgeImported++;
        }

        this.updateWorkflowProgress(
          workflowId,
          30 + Math.round((knowledgeImported / modelExport.knowledge.length) * 30)
        );
      }

      // Import strategies
      for (const strategy of modelExport.strategies) {
        const existing = await this.memory.get<OptimizedStrategy>(
          `learning:strategy:optimized:${strategy.id}`
        );

        if (existing) {
          if (strategy.confidence > existing.confidence) {
            await this.memory.set(
              `learning:strategy:optimized:${strategy.id}`,
              strategy,
              { namespace: 'learning-optimization', persist: true }
            );
            strategiesImported++;
            conflicts.push({
              type: 'strategy',
              id: strategy.id,
              reason: 'Import has higher confidence',
              resolution: 'overwrite',
            });
          } else {
            conflicts.push({
              type: 'strategy',
              id: strategy.id,
              reason: 'Existing strategy has higher confidence',
              resolution: 'skip',
            });
          }
        } else {
          await this.memory.set(
            `learning:strategy:optimized:${strategy.id}`,
            strategy,
            { namespace: 'learning-optimization', persist: true }
          );
          strategiesImported++;
        }

        this.updateWorkflowProgress(
          workflowId,
          60 + Math.round((strategiesImported / modelExport.strategies.length) * 40)
        );
      }

      this.completeWorkflow(workflowId);

      const report: ImportReport = {
        patternsImported,
        knowledgeImported,
        strategiesImported,
        conflicts,
        resolved: true,
      };

      return ok(report);
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private subscribeToEvents(): void {
    // Subscribe to test execution events for learning
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    // Subscribe to coverage gap events
    this.eventBus.subscribe(
      'coverage-analysis.CoverageGapDetected',
      this.handleCoverageGap.bind(this)
    );

    // Subscribe to quality assessment events
    this.eventBus.subscribe(
      'quality-assessment.QualityGateEvaluated',
      this.handleQualityGate.bind(this)
    );
  }

  private async handleTestRunCompleted(event: {
    payload: { runId: string; passed: number; failed: number; duration: number };
  }): Promise<void> {
    // Record experience from test run
    const { runId, passed, failed, duration } = event.payload;
    const successRate = (passed + failed) > 0 ? passed / (passed + failed) : 0;

    await this.learningService.recordExperience({
      agentId: {
        value: 'test-execution',
        domain: 'test-execution',
        type: 'tester',
      },
      domain: 'test-execution',
      action: 'test-run',
      state: {
        context: { runId },
        metrics: { passed, failed, duration },
      },
      result: {
        success: successRate > 0.8,
        outcome: { success_rate: successRate, passed, failed },
        duration,
      },
      reward: successRate,
    });
  }

  private async handleCoverageGap(event: {
    payload: { gapId: string; file: string; riskScore: number };
  }): Promise<void> {
    // Record as experience for learning
    const { gapId, file, riskScore } = event.payload;

    await this.learningService.recordExperience({
      agentId: {
        value: 'coverage-analysis',
        domain: 'coverage-analysis',
        type: 'analyzer',
      },
      domain: 'coverage-analysis',
      action: 'gap-detection',
      state: {
        context: { gapId, file },
        metrics: { riskScore },
      },
      result: {
        success: true,
        outcome: { risk_score: riskScore },
        duration: 0,
      },
      reward: 1 - riskScore, // Lower risk = higher reward
    });
  }

  private async handleQualityGate(event: {
    payload: { gateId: string; passed: boolean };
  }): Promise<void> {
    const { gateId, passed } = event.payload;

    await this.learningService.recordExperience({
      agentId: {
        value: 'quality-assessment',
        domain: 'quality-assessment',
        type: 'validator',
      },
      domain: 'quality-assessment',
      action: 'gate-evaluation',
      state: {
        context: { gateId },
        metrics: { passed: passed ? 1 : 0 },
      },
      result: {
        success: passed,
        outcome: { gate_passed: passed ? 1 : 0 },
        duration: 0,
      },
      reward: passed ? 1 : 0,
    });
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  private async publishPatternConsolidated(
    patternCount: number,
    domains: DomainName[]
  ): Promise<void> {
    const payload: PatternConsolidatedPayload = {
      patternCount,
      domains,
      improvements: 0,
    };

    const event = createEvent(
      LearningOptimizationEvents.PatternConsolidated,
      'learning-optimization',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishTransferCompleted(
    report: CrossDomainSharingReport
  ): Promise<void> {
    const payload: TransferCompletedPayload = {
      sourceProject: 'current',
      targetProject: 'current',
      patternsTransferred: report.knowledgeShared,
      successRate: report.transferSuccessRate,
    };

    const event = createEvent(
      LearningOptimizationEvents.TransferCompleted,
      'learning-optimization',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishOptimizationApplied(
    report: OptimizationReport
  ): Promise<void> {
    const event = createEvent(
      LearningOptimizationEvents.OptimizationApplied,
      'learning-optimization',
      {
        domainsOptimized: report.domainsOptimized,
        avgImprovement: report.avgImprovement,
      }
    );

    await this.eventBus.publish(event);
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  private async spawnLearningAgent(
    workflowId: string,
    domain: DomainName
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `learning-agent-${workflowId.slice(0, 8)}`,
      domain: 'learning-optimization',
      type: 'optimizer',
      capabilities: ['pattern-learning', 'experience-mining', domain],
      config: {
        workflowId,
        targetDomain: domain,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  private startWorkflow(
    id: string,
    type: LearningWorkflowStatus['type']
  ): void {
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) reached`
      );
    }

    this.workflows.set(id, {
      id,
      type,
      status: 'running',
      startedAt: new Date(),
      agentIds: [],
      progress: 0,
    });
  }

  private completeWorkflow(id: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.progress = 100;
    }
  }

  private failWorkflow(id: string, error: string): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = error;
    }
  }

  private addAgentToWorkflow(workflowId: string, agentId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.agentIds.push(agentId);
    }
  }

  private updateWorkflowProgress(id: string, progress: number): void {
    const workflow = this.workflows.get(id);
    if (workflow) {
      workflow.progress = Math.min(100, Math.max(0, progress));
    }
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<LearningWorkflowStatus[]>(
      'learning-optimization:coordinator:workflows'
    );

    if (savedState) {
      for (const workflow of savedState) {
        if (workflow.status === 'running') {
          workflow.status = 'failed';
          workflow.error = 'Coordinator restarted';
          workflow.completedAt = new Date();
        }
        this.workflows.set(workflow.id, workflow);
      }
    }
  }

  private async saveWorkflowState(): Promise<void> {
    const workflows = Array.from(this.workflows.values());
    await this.memory.set(
      'learning-optimization:coordinator:workflows',
      workflows,
      { namespace: 'learning-optimization', persist: true }
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async getExperiencesForDomain(
    domain: DomainName,
    timeRange: TimeRange
  ): Promise<Result<Experience[]>> {
    const keys = await this.memory.search(
      `learning:experience:index:domain:${domain}:*`,
      500
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

    return ok(experiences);
  }

  private async getCurrentStrategy(domain: DomainName): Promise<{
    name: string;
    parameters: Record<string, unknown>;
    expectedOutcome: Record<string, number>;
  }> {
    const strategyKey = `learning:strategy:current:${domain}`;
    const existing = await this.memory.get<{
      name: string;
      parameters: Record<string, unknown>;
      expectedOutcome: Record<string, number>;
    }>(strategyKey);

    if (existing) {
      return existing;
    }

    // Return default strategy
    return {
      name: `default-${domain}`,
      parameters: {
        timeout: 30000,
        retryCount: 3,
        concurrency: 4,
      },
      expectedOutcome: {
        success_rate: 0.8,
      },
    };
  }

  private async storeStrategy(
    domain: DomainName,
    strategy: { name: string; parameters: Record<string, unknown>; expectedOutcome: Record<string, number> }
  ): Promise<void> {
    await this.memory.set(`learning:strategy:current:${domain}`, strategy, {
      namespace: 'learning-optimization',
      persist: true,
    });
  }

  private calculateMetricValue(
    experiences: Experience[],
    metric: string
  ): number {
    const values = experiences
      .map((e) => (e.result.outcome[metric] as number) ?? 0)
      .filter((v) => !isNaN(v));

    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private getRelatedDomains(domain: DomainName): DomainName[] {
    const relationships: Record<DomainName, DomainName[]> = {
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
      'learning-optimization': ALL_DOMAINS.filter((d) => d !== 'learning-optimization'),
      'coordination': ALL_DOMAINS.filter((d) => d !== 'coordination'),
    };

    return relationships[domain] || [];
  }

  private findSimilarPatterns(patterns: LearnedPattern[]): LearnedPattern[][] {
    const groups: LearnedPattern[][] = [];
    const assigned = new Set<string>();

    for (const pattern of patterns) {
      if (assigned.has(pattern.id)) continue;

      const group = [pattern];
      assigned.add(pattern.id);

      for (const other of patterns) {
        if (assigned.has(other.id)) continue;

        if (
          pattern.type === other.type &&
          pattern.domain === other.domain &&
          this.contextsOverlap(pattern.context, other.context)
        ) {
          group.push(other);
          assigned.add(other.id);
        }
      }

      if (group.length >= 2) {
        groups.push(group);
      }
    }

    return groups;
  }

  private contextsOverlap(
    a: { tags: string[] },
    b: { tags: string[] }
  ): boolean {
    return a.tags.some((tag) => b.tags.includes(tag));
  }

  private calculateChecksum(
    patterns: LearnedPattern[],
    knowledge: Knowledge[],
    strategies: OptimizedStrategy[]
  ): string {
    const data = JSON.stringify({
      patternCount: patterns.length,
      knowledgeCount: knowledge.length,
      strategyCount: strategies.length,
      patternIds: patterns.map((p) => p.id).sort(),
      knowledgeIds: knowledge.map((k) => k.id).sort(),
      strategyIds: strategies.map((s) => s.id).sort(),
    });

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16);
  }
}
