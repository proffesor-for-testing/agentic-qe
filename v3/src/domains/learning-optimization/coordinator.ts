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
  DreamCycleCompletedPayload,
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
import type { TaskExperience } from '../../learning/experience-capture.js';
import {
  DreamScheduler,
  createDreamScheduler,
  createDreamEngine,
  type DreamSchedulerStatus,
  type EngineResult as DreamCycleResult,
} from '../../learning/dream/index.js';

// ============================================================================
// MinCut & Consensus Mixin Imports (ADR-047, MM-001)
// ============================================================================

import {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
  type IMinCutAwareDomain,
  type MinCutAwareConfig,
} from '../../coordination/mixins/mincut-aware-domain.js';

import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  type IConsensusEnabledDomain,
  type ConsensusEnabledConfig,
} from '../../coordination/mixins/consensus-enabled-domain.js';

// ADR-058: Governance-aware mixin for MemoryWriteGate integration
import {
  GovernanceAwareDomainMixin,
  createGovernanceAwareMixin,
} from '../../coordination/mixins/governance-aware-domain.js';

import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration.js';

import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings.js';

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

  // Dream Scheduler configuration
  /** Enable dream scheduler for offline learning */
  enableDreamScheduler: boolean;
  /** Interval for automatic dream cycles in ms (default: same as learningCycleIntervalMs) */
  dreamCycleIntervalMs: number;
  /** Enable dream trigger after experience threshold */
  enableExperienceTrigger: boolean;
  /** Number of experiences to accumulate before triggering dream */
  experienceThreshold: number;
  /** Enable dream trigger on quality gate failure */
  enableQualityGateFailureTrigger: boolean;
  /** Automatically apply high-confidence insights from dreams */
  autoApplyHighConfidenceInsights: boolean;
  /** Minimum confidence threshold for auto-applying insights (0-1) */
  autoApplyConfidenceThreshold: number;

  // MinCut integration config (ADR-047)
  enableMinCutAwareness: boolean;
  topologyHealthThreshold: number;
  pauseOnCriticalTopology: boolean;
  // Consensus integration config (MM-001)
  enableConsensus: boolean;
  consensusThreshold: number;
  consensusStrategy: 'majority' | 'weighted' | 'unanimous';
  consensusMinModels: number;
}

const DEFAULT_CONFIG: LearningCoordinatorConfig = {
  maxConcurrentWorkflows: 3,
  defaultTimeout: 120000, // 2 minutes
  enableAutoOptimization: true,
  publishEvents: true,
  learningCycleIntervalMs: 3600000, // 1 hour

  // Dream Scheduler defaults
  enableDreamScheduler: true,
  dreamCycleIntervalMs: 3600000, // 1 hour
  enableExperienceTrigger: true,
  experienceThreshold: 50,
  enableQualityGateFailureTrigger: true,
  autoApplyHighConfidenceInsights: false,
  autoApplyConfidenceThreshold: 0.8,

  // MinCut integration defaults (ADR-047)
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  // Consensus integration defaults (MM-001)
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
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

  /**
   * DreamScheduler for offline pattern consolidation and insight generation
   * Wraps DreamEngine with automatic scheduling and trigger support
   */
  private dreamScheduler: DreamScheduler | null = null;

  // MinCut topology awareness mixin (ADR-047)
  private readonly minCutMixin: MinCutAwareDomainMixin;

  // Consensus verification mixin (MM-001)
  private readonly consensusMixin: ConsensusEnabledMixin;

  // Domain identifier for mixin initialization
  private readonly domainName = 'learning-optimization';

  // ADR-058: Governance mixin for MemoryWriteGate integration
  private readonly governanceMixin: GovernanceAwareDomainMixin;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<LearningCoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize MinCut-aware mixin (ADR-047)
    this.minCutMixin = createMinCutAwareMixin(this.domainName, {
      enableMinCutAwareness: this.config.enableMinCutAwareness,
      topologyHealthThreshold: this.config.topologyHealthThreshold,
      pauseOnCriticalTopology: this.config.pauseOnCriticalTopology,
    });

    // Initialize Consensus-enabled mixin (MM-001)
    this.consensusMixin = createConsensusEnabledMixin({
      enableConsensus: this.config.enableConsensus,
      consensusThreshold: this.config.consensusThreshold,
      verifyFindingTypes: ['pattern-recommendation', 'optimization-suggestion', 'cross-domain-insight'],
      strategy: this.config.consensusStrategy,
      minModels: this.config.consensusMinModels,
      modelTimeout: 60000,
      verifySeverities: ['critical', 'high'],
      enableLogging: false,
    });

    // ADR-058: Initialize governance mixin for MemoryWriteGate integration
    this.governanceMixin = createGovernanceAwareMixin(this.domainName);

    this.learningService = new LearningCoordinatorService({ memory });
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

    // Initialize DreamScheduler if enabled
    if (this.config.enableDreamScheduler) {
      try {
        const dreamEngine = await createDreamEngine();
        await dreamEngine.initialize();

        this.dreamScheduler = createDreamScheduler(
          {
            dreamEngine,
            eventBus: this.eventBus,
            memoryBackend: this.memory,
          },
          {
            autoScheduleIntervalMs: this.config.dreamCycleIntervalMs,
            enableExperienceTrigger: this.config.enableExperienceTrigger,
            experienceThreshold: this.config.experienceThreshold,
            enableQualityGateFailureTrigger: this.config.enableQualityGateFailureTrigger,
            autoApplyHighConfidenceInsights: this.config.autoApplyHighConfidenceInsights,
            insightConfidenceThreshold: this.config.autoApplyConfidenceThreshold,
          }
        );

        await this.dreamScheduler.initialize();
        this.dreamScheduler.start();
        console.log('[LearningOptimizationCoordinator] DreamScheduler initialized and started');
      } catch (error) {
        console.warn('[LearningOptimizationCoordinator] Failed to initialize DreamScheduler:', error);
        // DreamScheduler is optional - continue without it
      }
    }

    // Subscribe to relevant events
    this.subscribeToEvents();

    // Load any persisted workflow state
    await this.loadWorkflowState();

    // Initialize Consensus engine if enabled (MM-001)
    if (this.config.enableConsensus) {
      try {
        await (this.consensusMixin as any).initializeConsensus();
        console.log(`[${this.domainName}] Consensus engine initialized`);
      } catch (error) {
        console.error(`[${this.domainName}] Failed to initialize consensus engine:`, error);
        console.warn(`[${this.domainName}] Continuing without consensus verification`);
      }
    }

    this.initialized = true;
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    // Dispose Consensus engine (MM-001)
    try {
      await (this.consensusMixin as any).disposeConsensus();
    } catch (error) {
      console.error(`[${this.domainName}] Error disposing consensus engine:`, error);
    }

    // Dispose MinCut mixin (ADR-047)
    this.minCutMixin.dispose();

    // Save workflow state
    await this.saveWorkflowState();

    // Clear active workflows
    this.workflows.clear();

    // Dispose DreamScheduler
    if (this.dreamScheduler) {
      try {
        await this.dreamScheduler.dispose();
        console.log('[LearningOptimizationCoordinator] DreamScheduler disposed');
      } catch (error) {
        console.error('[LearningOptimizationCoordinator] Error disposing DreamScheduler:', error);
      }
      this.dreamScheduler = null;
    }

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

      // ADR-047: Check topology health before expensive operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative strategy for learning cycle`);
        // Continue with reduced scope when topology is unhealthy
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Learning cycle paused: topology is in critical state'));
      }

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

      // ADR-047: Check topology health before expensive operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, using conservative optimization strategy`);
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Optimization paused: topology is in critical state'));
      }

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

      // ADR-047: Check topology health before cross-domain operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, limiting cross-domain transfer scope`);
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Cross-domain sharing paused: topology is in critical state'));
      }

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

  // ============================================================================
  // Dream Scheduler Methods
  // ============================================================================

  /**
   * Trigger a dream cycle manually.
   * Dreams consolidate patterns and generate novel insights through spreading activation.
   *
   * @param durationMs - Optional duration override in ms
   * @returns Dream cycle result with generated insights
   * @throws Error if DreamScheduler is not initialized
   */
  async triggerDreamCycle(durationMs?: number): Promise<DreamCycleResult> {
    if (!this.dreamScheduler) {
      throw new Error('[LearningOptimizationCoordinator] DreamScheduler not initialized');
    }

    const result = await this.dreamScheduler.triggerDream(durationMs);

    // Publish event for other domains to consume
    if (this.config.publishEvents) {
      await this.publishDreamCycleCompleted(
        result.cycle.id,
        result.cycle.durationMs ?? 0,
        result.cycle.conceptsProcessed,
        result.insights.map((i) => ({
          id: i.id,
          type: i.type,
          description: i.description,
          noveltyScore: i.noveltyScore,
          confidenceScore: i.confidenceScore,
          actionable: i.actionable,
          suggestedAction: i.suggestedAction,
          sourceConcepts: i.sourceConcepts,
        })),
        result.patternsCreated
      );
    }

    return result;
  }

  /**
   * Get the current status of the DreamScheduler.
   *
   * @returns DreamScheduler status or null if not initialized
   */
  getDreamStatus(): DreamSchedulerStatus | null {
    return this.dreamScheduler?.getStatus() ?? null;
  }

  /**
   * Check if the DreamScheduler is available and running.
   *
   * @returns True if DreamScheduler is initialized
   */
  isDreamSchedulerAvailable(): boolean {
    return this.dreamScheduler !== null;
  }

  /**
   * Get the last dream cycle result from the scheduler.
   *
   * @returns Last dream result or null if no dreams have completed
   */
  getLastDreamResult(): DreamCycleResult | null {
    return this.dreamScheduler?.getLastDreamResult() ?? null;
  }

  /**
   * Trigger a quick dream cycle for rapid insight generation.
   *
   * @returns Dream cycle result
   * @throws Error if DreamScheduler is not initialized
   */
  async triggerQuickDream(): Promise<DreamCycleResult> {
    if (!this.dreamScheduler) {
      throw new Error('[LearningOptimizationCoordinator] DreamScheduler not initialized');
    }

    return this.dreamScheduler.triggerQuickDream();
  }

  /**
   * Trigger a full dream cycle for comprehensive pattern consolidation.
   *
   * @returns Dream cycle result
   * @throws Error if DreamScheduler is not initialized
   */
  async triggerFullDream(): Promise<DreamCycleResult> {
    if (!this.dreamScheduler) {
      throw new Error('[LearningOptimizationCoordinator] DreamScheduler not initialized');
    }

    return this.dreamScheduler.triggerFullDream();
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

    // Subscribe to experience capture events (Phase 4 integration)
    this.eventBus.subscribe(
      'learning.ExperienceCaptured',
      this.handleExperienceCaptured.bind(this)
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

  /**
   * Handle experience captured from ExperienceCaptureService
   * This is the bridge between Phase 4 experience capture and the coordinator
   */
  private async handleExperienceCaptured(event: {
    payload: { experience: TaskExperience };
  }): Promise<void> {
    const { experience } = event.payload;

    // Skip low-quality experiences
    if (!experience.success || experience.quality < 0.7) {
      return;
    }

    // Map QEDomain to DomainName for coordinator's learning service
    const domain = experience.domain || 'learning-optimization';

    // Record as coordinator experience
    await this.learningService.recordExperience({
      agentId: {
        value: experience.agent || 'unknown',
        domain: domain as DomainName,
        type: 'specialist', // Valid AgentType
      },
      domain: domain as DomainName,
      action: experience.task,
      state: {
        context: {
          experienceId: experience.id,
          trajectoryId: experience.trajectoryId,
          model: experience.model,
        },
        metrics: {
          durationMs: experience.durationMs,
          stepCount: experience.steps.length,
          quality: experience.quality,
        },
      },
      result: {
        success: experience.success,
        outcome: {
          quality: experience.quality,
          patterns_extracted: experience.patterns?.length || 0,
        },
        duration: experience.durationMs,
      },
      reward: experience.quality,
    });

    // If experience has patterns, share them cross-domain
    if (experience.patterns && experience.patterns.length > 0 && experience.domain) {
      const relatedDomains = this.getRelatedDomains(experience.domain as DomainName);

      for (const targetDomain of relatedDomains) {
        if (targetDomain === experience.domain) continue;

        // Transfer the experience knowledge to related domains
        await this.transferService.transferKnowledge(
          {
            id: `exp-${experience.id}`,
            domain: experience.domain as DomainName,
            type: 'workflow', // Valid KnowledgeType
            content: {
              format: 'json' as const,
              data: {
                task: experience.task,
                steps: experience.steps,
                quality: experience.quality,
                patterns: experience.patterns,
              },
            },
            sourceAgentId: {
              value: experience.agent || 'experience-capture',
              domain: experience.domain as DomainName,
              type: 'specialist',
            },
            targetDomains: [targetDomain],
            relevanceScore: experience.quality,
            version: 1,
            createdAt: new Date(experience.startedAt),
          },
          targetDomain
        );
      }

      console.log(
        `[LearningOptimizationCoordinator] Experience ${experience.id} transferred to ${relatedDomains.length} related domains`
      );
    }

    // Record experience for dream scheduler to trigger insight generation
    if (this.dreamScheduler) {
      this.dreamScheduler.recordExperience({
        id: experience.id,
        agentType: experience.agent || 'unknown',
        domain: domain,
        taskType: experience.task,
        success: experience.success,
        duration: experience.durationMs,
        context: {
          quality: experience.quality,
          steps: experience.steps.length,
          patterns: experience.patterns?.length || 0,
        },
        timestamp: new Date(experience.startedAt),
      });
    }
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

  /**
   * Publish a dream cycle completion event.
   * This broadcasts dream insights to all interested domain coordinators.
   *
   * Called by the DreamScheduler or DreamEngine after completing a dream cycle.
   *
   * @param cycleId - Unique identifier for the dream cycle
   * @param durationMs - How long the dream cycle took
   * @param conceptsProcessed - Number of concepts processed during dreaming
   * @param insights - Array of insights generated during the dream cycle
   * @param patternsCreated - Number of patterns created from insights
   */
  async publishDreamCycleCompleted(
    cycleId: string,
    durationMs: number,
    conceptsProcessed: number,
    insights: Array<{
      id: string;
      type: string;
      description: string;
      noveltyScore: number;
      confidenceScore: number;
      actionable: boolean;
      suggestedAction?: string;
      sourceConcepts: string[];
    }>,
    patternsCreated: number
  ): Promise<void> {
    if (!this.config.publishEvents) {
      return;
    }

    const payload: DreamCycleCompletedPayload = {
      cycleId,
      durationMs,
      conceptsProcessed,
      insights,
      patternsCreated,
    };

    const event = createEvent(
      LearningOptimizationEvents.DreamCycleCompleted,
      'learning-optimization',
      payload
    );

    await this.eventBus.publish(event);

    console.log(
      `[LearningOptimizationCoordinator] Published dream cycle completion: ${insights.length} insights for ${conceptsProcessed} concepts`
    );
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

  // ============================================================================
  // MinCut Integration Methods (ADR-047)
  // ============================================================================

  /**
   * Set the MinCut bridge for topology awareness
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this.minCutMixin.setMinCutBridge(bridge);
    console.log(`[${this.domainName}] MinCut bridge connected for topology awareness`);
  }

  /**
   * Check if topology is healthy
   */
  isTopologyHealthy(): boolean {
    return this.minCutMixin.isTopologyHealthy();
  }

  /**
   * Get topology-based routing excluding weak domains
   * Per ADR-047: Filters out domains that are currently weak points
   *
   * @param targetDomains - List of potential target domains
   * @returns Filtered list of healthy domains for routing
   */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[] {
    return this.minCutMixin.getTopologyBasedRouting(targetDomains);
  }

  /**
   * Get weak vertices belonging to this domain
   * Per ADR-047: Identifies agents that are single points of failure
   */
  getDomainWeakVertices() {
    return this.minCutMixin.getDomainWeakVertices();
  }

  /**
   * Check if this domain is a weak point in the topology
   * Per ADR-047: Returns true if any weak vertex belongs to learning-optimization domain
   */
  isDomainWeakPoint(): boolean {
    return this.minCutMixin.isDomainWeakPoint();
  }

  // ============================================================================
  // Consensus Integration Methods (MM-001)
  // ============================================================================

  /**
   * Check if consensus engine is available
   */
  isConsensusAvailable(): boolean {
    return (this.consensusMixin as any).isConsensusAvailable?.() ?? false;
  }

  /**
   * Get consensus statistics
   * Per MM-001: Returns metrics about consensus verification
   */
  getConsensusStats() {
    return this.consensusMixin.getConsensusStats();
  }

  /**
   * Verify a pattern recommendation using multi-model consensus
   * Per MM-001: High-stakes pattern recommendations require verification
   *
   * @param pattern - The pattern being recommended
   * @param confidence - Initial confidence in the recommendation
   * @returns true if the recommendation is verified or doesn't require consensus
   */
  async verifyPatternRecommendation(
    pattern: { id: string; name: string; type: string; domain: DomainName },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof pattern> = createDomainFinding({
      id: uuidv4(),
      type: 'pattern-recommendation',
      confidence,
      description: `Verify pattern recommendation: ${pattern.name} (${pattern.type}) for domain ${pattern.domain}`,
      payload: pattern,
      detectedBy: 'learning-optimization-coordinator',
      severity: confidence > 0.9 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Pattern recommendation '${pattern.name}' verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Pattern recommendation '${pattern.name}' NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify an optimization suggestion using multi-model consensus
   * Per MM-001: Optimization suggestions can have significant impact
   *
   * @param suggestion - The optimization suggestion to verify
   * @param confidence - Initial confidence in the suggestion
   * @returns true if the suggestion is verified or doesn't require consensus
   */
  async verifyOptimizationSuggestion(
    suggestion: { metric: string; currentValue: number; targetValue: number; strategy: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof suggestion> = createDomainFinding({
      id: uuidv4(),
      type: 'optimization-suggestion',
      confidence,
      description: `Verify optimization: ${suggestion.metric} from ${suggestion.currentValue} to ${suggestion.targetValue} via ${suggestion.strategy}`,
      payload: suggestion,
      detectedBy: 'learning-optimization-coordinator',
      severity: confidence > 0.85 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Optimization suggestion for '${suggestion.metric}' verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Optimization suggestion for '${suggestion.metric}' NOT verified`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify a cross-domain insight using multi-model consensus
   * Per MM-001: Cross-domain insights require verification before propagation
   *
   * @param insight - The cross-domain insight to verify
   * @param confidence - Initial confidence in the insight
   * @returns true if the insight is verified or doesn't require consensus
   */
  async verifyCrossDomainInsight(
    insight: { sourceDomain: DomainName; targetDomains: DomainName[]; description: string; impact: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof insight> = createDomainFinding({
      id: uuidv4(),
      type: 'cross-domain-insight',
      confidence,
      description: `Verify cross-domain insight: ${insight.description}`,
      payload: insight,
      detectedBy: 'learning-optimization-coordinator',
      severity: 'high', // Cross-domain insights always have high impact
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Cross-domain insight verified by consensus for ${insight.targetDomains.length} target domains`);
        return true;
      }
      console.warn(`[${this.domainName}] Cross-domain insight NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }
}
