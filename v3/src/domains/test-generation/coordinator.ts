/**
 * Agentic QE v3 - Test Generation Coordinator
 * Orchestrates the test generation workflow across services
 *
 * Enhanced with @ruvector integration per ADR-040:
 * - QESONA for pattern learning (test generation patterns)
 * - QEFlashAttention for test similarity detection
 * - DecisionTransformer for test case selection
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  err,
  DomainEvent,
} from '../../shared/types';
import { toError, toErrorMessage } from '../../shared/error-utils.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces';
import {
  TestGenerationEvents,
  TestGeneratedPayload,
  TestSuiteCreatedPayload,
  LearningOptimizationEvents,
  DreamCycleCompletedPayload,
  createEvent,
} from '../../shared/events/domain-events';
import {
  GenerateTestsRequest,
  GeneratedTests,
  GeneratedTest,
  TDDRequest,
  TDDResult,
  PropertyTestRequest,
  PropertyTests,
  TestDataRequest,
  TestData,
  LearnPatternsRequest,
  LearnedPatterns,
  TestGenerationAPI,
} from './interfaces';
import {
  createTestGeneratorService,
  ITestGenerationService,
} from './services/test-generator';
import {
  PatternMatcherService,
  IPatternMatchingService,
} from './services/pattern-matcher';

// QE Hook integration for self-learning feedback loop (Issue #265)
import type { QEHookRegistry, QEHookResult } from '../../learning/qe-hooks.js';
import { QE_HOOK_EVENTS } from '../../learning/qe-hooks.js';

// ============================================================================
// MinCut & Consensus Mixin Imports (ADR-047, MM-001)
// ============================================================================

import {
  type IMinCutAwareDomain,
  type MinCutAwareConfig,
} from '../../coordination/mixins/mincut-aware-domain';

import {
  type IConsensusEnabledDomain,
  type ConsensusEnabledConfig,
} from '../../coordination/mixins/consensus-enabled-domain';

import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration';

// CQ-002: Base domain coordinator
import {
  BaseDomainCoordinator,
  type BaseDomainCoordinatorConfig,
  type BaseWorkflowStatus,
} from '../base-domain-coordinator.js';

import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings';

// ============================================================================
// @ruvector Wrapper Imports (ADR-040)
// ============================================================================

import {
  PersistentSONAEngine,
  createPersistentSONAEngine,
} from '../../integrations/ruvector/sona-persistence.js';

import {
  type QEPatternType,
  type QESONAAdaptationResult,
  type QESONAStats,
} from '../../integrations/ruvector/wrappers.js';

import {
  QEFlashAttention,
  createQEFlashAttention,
  type QEWorkloadType,
  type QEFlashAttentionMetrics,
} from '../../integrations/ruvector/wrappers.js';

import {
  DecisionTransformerAlgorithm,
} from '../../integrations/rl-suite/algorithms/decision-transformer.js';

import type {
  RLState,
  RLAction,
  RLPrediction,
  RLExperience,
} from '../../integrations/rl-suite/interfaces.js';

// Coherence Gate Integration (ADR-052)
import {
  TestGenerationCoherenceGate,
  createTestGenerationCoherenceGate,
  CoherenceError as CoherenceGateError,
  type Requirement,
  type TestSpecification,
  type RequirementCoherenceResult,
} from './services/coherence-gate-service.js';

import type { ICoherenceService } from '../../integrations/coherence/coherence-service.js';

/**
 * Interface for the test generation coordinator
 */
export interface ITestGenerationCoordinator extends TestGenerationAPI {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
  // @ruvector integration methods (ADR-040)
  getQESONAStats(): QESONAStats | null;
  getFlashAttentionMetrics(): QEFlashAttentionMetrics[] | null;
  // Coherence gate methods (ADR-052)
  checkRequirementCoherence(requirements: Requirement[]): Promise<RequirementCoherenceResult>;
  isCoherenceGateAvailable(): boolean;
  // MinCut integration methods (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  // Consensus integration methods (MM-001)
  isConsensusAvailable(): boolean;
}

/**
 * Workflow status tracking
 */
export interface WorkflowStatus {
  id: string;
  type: 'generate' | 'tdd' | 'property' | 'data' | 'learn';
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
export interface CoordinatorConfig extends BaseDomainCoordinatorConfig {
  enablePatternLearning: boolean;
  // @ruvector integration configs (ADR-040)
  enableQESONA: boolean;
  enableFlashAttention: boolean;
  enableDecisionTransformer: boolean;
  sonaPatternType: QEPatternType;
  flashAttentionWorkload: QEWorkloadType;
  // Coherence gate config (ADR-052)
  enableCoherenceGate: boolean;
  blockOnIncoherentRequirements: boolean;
  enrichOnRetrievalLane: boolean;
  consensusConfig?: Partial<ConsensusEnabledConfig>;
}

type TestGenWorkflowType = 'generate' | 'tdd' | 'property' | 'data' | 'learn';

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000, // 60 seconds
  enablePatternLearning: true,
  publishEvents: true,
  // @ruvector integration defaults (ADR-040)
  enableQESONA: true,
  enableFlashAttention: true,
  enableDecisionTransformer: true,
  sonaPatternType: 'test-generation',
  flashAttentionWorkload: 'test-similarity',
  // Coherence gate defaults (ADR-052)
  enableCoherenceGate: true,
  blockOnIncoherentRequirements: true,
  enrichOnRetrievalLane: true,
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
 * Test Generation Coordinator
 * Orchestrates test generation workflows and coordinates with agents
 *
 * Enhanced with @ruvector integration per ADR-040:
 * - QESONA for pattern learning (test generation patterns)
 * - QEFlashAttention for test similarity detection
 * - DecisionTransformer for test case selection
 *
 * Enhanced with MinCut topology awareness per ADR-047:
 * - Topology-based routing decisions
 * - Health monitoring for test generation workflows
 *
 * Enhanced with Multi-Model Consensus per MM-001:
 * - Consensus verification for high-stakes test design decisions
 * - Verifies test patterns, mock strategies, and edge cases
 */
export class TestGenerationCoordinator
  extends BaseDomainCoordinator<CoordinatorConfig, TestGenWorkflowType>
  implements ITestGenerationCoordinator
{
  private readonly testGenerator: ITestGenerationService;
  private readonly patternMatcher: IPatternMatchingService;

  // @ruvector integrations (ADR-040)
  private qesona: PersistentSONAEngine | null = null;
  private flashAttention: QEFlashAttention | null = null;
  private decisionTransformer: DecisionTransformerAlgorithm | null = null;
  private testEmbeddings: Map<string, Float32Array> = new Map();

  // Cache of recent dream insights for test enhancement
  private recentDreamInsights: Array<{
    id: string;
    type: string;
    description: string;
    suggestedAction?: string;
    confidenceScore: number;
    noveltyScore: number;
    actionable: boolean;
    sourceConcepts: string[];
    receivedAt: Date;
  }> = [];

  // Coherence gate (ADR-052)
  private coherenceGate: TestGenerationCoherenceGate | null = null;

  constructor(
    eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {},
    private readonly coherenceService?: ICoherenceService | null,
    private readonly hookRegistry?: QEHookRegistry | null
  ) {
    const fullConfig: CoordinatorConfig = { ...DEFAULT_CONFIG, ...config };

    super(eventBus, 'test-generation', fullConfig, {
      verifyFindingTypes: [
        'test-pattern-selection',
        'mock-strategy',
        'edge-case-generation',
        'assertion-strategy',
      ],
      ...fullConfig.consensusConfig,
    });

    this.testGenerator = createTestGeneratorService(memory);
    this.patternMatcher = new PatternMatcherService(memory);

    // Initialize coherence gate if service is provided (ADR-052)
    if (this.config.enableCoherenceGate && coherenceService) {
      this.coherenceGate = createTestGenerationCoherenceGate(
        coherenceService,
        undefined, // Use default embedding service
        {
          enabled: true,
          blockOnHumanLane: this.config.blockOnIncoherentRequirements,
          enrichOnRetrievalLane: this.config.enrichOnRetrievalLane,
        }
      );
    }
  }

  // ==========================================================================
  // BaseDomainCoordinator Template Methods
  // ==========================================================================

  protected async onInitialize(): Promise<void> {
    // Initialize PersistentSONAEngine for pattern learning (patterns survive restarts)
    if (this.config.enableQESONA) {
      try {
        this.qesona = await createPersistentSONAEngine({
          domain: 'test-generation',
          loadOnInit: true,
          autoSaveInterval: 60000, // Save every minute
          patternClusters: 50,
          minConfidence: 0.5,
        });
        console.log('[TestGenerationCoordinator] PersistentSONAEngine initialized for test-generation domain');
      } catch (error) {
        // Log and continue - SONA is enhancement, not critical
        console.error('[TestGenerationCoordinator] Failed to initialize PersistentSONAEngine:', error);
        console.warn('[TestGenerationCoordinator] Continuing without SONA pattern persistence');
        this.qesona = null;
      }
    }

    // Initialize Flash Attention for test similarity detection
    if (this.config.enableFlashAttention) {
      try {
        this.flashAttention = await createQEFlashAttention(
          this.config.flashAttentionWorkload,
          { dim: 384, strategy: 'flash', blockSize: 64 }
        );
        console.log('[TestGenerationCoordinator] QEFlashAttention initialized for test-similarity');
      } catch (error) {
        console.error('[TestGenerationCoordinator] Failed to initialize QEFlashAttention:', error);
        throw new Error(`QEFlashAttention initialization failed: ${toErrorMessage(error)}`);
      }
    }

    // Initialize Decision Transformer for test case selection
    if (this.config.enableDecisionTransformer) {
      try {
        this.decisionTransformer = new DecisionTransformerAlgorithm({
          contextLength: 10,
          embeddingDim: 128,
        });
        // Note: DecisionTransformer will auto-initialize on first predict() call
        console.log('[TestGenerationCoordinator] DecisionTransformer created for test case selection');
      } catch (error) {
        console.error('[TestGenerationCoordinator] Failed to create DecisionTransformer:', error);
        throw new Error(`DecisionTransformer creation failed: ${toErrorMessage(error)}`);
      }
    }

    // Subscribe to relevant events
    this.subscribeToEvents();

    // Load any persisted workflow state
    await this.loadWorkflowState();
  }

  protected async onDispose(): Promise<void> {
    // Save workflow state
    await this.saveWorkflowState();

    // Dispose @ruvector integrations
    if (this.flashAttention) {
      this.flashAttention.dispose();
      this.flashAttention = null;
    }

    if (this.decisionTransformer) {
      await this.decisionTransformer.reset();
      this.decisionTransformer = null;
    }

    // Dispose PersistentSONAEngine (flushes pending saves)
    if (this.qesona) {
      await this.qesona.close();
      this.qesona = null;
    }

    // Clear embeddings cache
    this.testEmbeddings.clear();
  }

  /**
   * Get active workflow statuses (typed override)
   */
  override getActiveWorkflows(): WorkflowStatus[] {
    return super.getActiveWorkflows() as WorkflowStatus[];
  }

  // ============================================================================
  // TestGenerationAPI Implementation
  // ============================================================================

  /**
   * Generate tests for source files
   * Enhanced with @ruvector integration per ADR-040:
   * - Uses QESONA to adapt test generation patterns based on context
   * - Uses QEFlashAttention to detect similar existing tests
   * - Uses DecisionTransformer to prioritize test cases
   *
   * Enhanced with topology awareness per ADR-047:
   * - Checks topology health before expensive operations
   * - Uses conservative strategy when topology is degraded
   *
   * Enhanced with consensus verification per MM-001:
   * - Verifies test pattern selections for high-stakes decisions
   */
  async generateTests(
    request: GenerateTestsRequest
  ): Promise<Result<GeneratedTests, Error>> {
    const workflowId = uuidv4();

    try {
      // Create workflow tracking
      this.startWorkflow(workflowId, 'generate');

      // ADR-047: Check topology health before expensive operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn('[TestGenerationCoordinator] Topology degraded, using conservative strategy');
        // Continue with reduced parallelism when topology is unhealthy
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        return err(new Error('Test generation paused: topology is in critical state'));
      }

      // Fire PreTestGeneration hook to get guidance and patterns from learning system
      let hookPatternIds: string[] = [];
      if (this.hookRegistry) {
        try {
          const targetFile = request.sourceFiles?.[0] || '';
          const hookResults = await this.hookRegistry.emit(
            QE_HOOK_EVENTS.PreTestGeneration,
            {
              targetFile,
              testType: request.testType,
              framework: request.framework,
              language: targetFile.split('.').pop() || 'typescript',
            }
          );
          for (const hookResult of hookResults) {
            if (hookResult.success && hookResult.data?.patterns) {
              hookPatternIds.push(...(hookResult.data.patterns as string[]));
            }
            if (hookResult.guidance) {
              console.log(`[TestGenerationCoordinator] Hook guidance: ${hookResult.guidance.join('; ')}`);
            }
          }
        } catch (e) {
          // Hook failures are non-critical
          console.debug('[TestGenerationCoordinator] PreTestGeneration hook failed:', e instanceof Error ? e.message : e);
        }
      }

      // Check if we can spawn agents
      if (!this.agentCoordinator.canSpawn()) {
        return err(new Error('Agent limit reached, cannot spawn test generation agents'));
      }

      // Spawn test generator agent
      const agentResult = await this.spawnTestGeneratorAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Use QESONA to adapt test generation patterns based on context
      let adaptedPatterns: string[] = [...(request.patterns || []), ...hookPatternIds];
      if (this.config.enableQESONA && this.qesona) {
        const sonaPatterns = await this.adaptTestGenerationPatterns(request);
        if (sonaPatterns.length > 0) {
          adaptedPatterns = sonaPatterns;
          console.log(`[TestGenerationCoordinator] Adapted ${sonaPatterns.length} patterns using QESONA`);
        }
      }

      // Find matching patterns if pattern learning is enabled
      let patterns = adaptedPatterns;
      if (this.config.enablePatternLearning && patterns.length === 0) {
        const matchResult = await this.patternMatcher.findMatchingPatterns({
          testType: request.testType,
          framework: request.framework,
        });

        if (matchResult.success && matchResult.value.length > 0) {
          patterns = matchResult.value.map((m) => m.pattern.id);
        }
      }

      // Generate tests
      const result = await this.testGenerator.generateTests({
        ...request,
        patterns,
      });

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Check for similar tests using Flash Attention
        if (this.config.enableFlashAttention && this.flashAttention) {
          const similarTests = await this.findSimilarTests(result.value.tests);
          if (similarTests.length > 0) {
            console.log(`[TestGenerationCoordinator] Found ${similarTests.length} similar tests using Flash Attention`);
          }
        }

        // Use DecisionTransformer to prioritize generated tests
        if (this.config.enableDecisionTransformer && this.decisionTransformer) {
          const prioritizedTests = await this.prioritizeTestCases(result.value.tests, request);
          console.log(`[TestGenerationCoordinator] Prioritized ${prioritizedTests.length} tests using DecisionTransformer`);
        }

        // Publish events
        if (this.config.publishEvents) {
          await this.publishTestSuiteCreated(result.value, request);

          for (const test of result.value.tests) {
            await this.publishTestGenerated(test, request.framework);
          }
        }

        // Learn from successful generation using QESONA
        if (this.config.enableQESONA && this.qesona) {
          await this.storeTestGenerationPattern(result.value, request);
        }

        // Learn from successful generation
        if (this.config.enablePatternLearning) {
          await this.learnFromGeneration(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
        if (this.config.publishEvents) {
          await this.publishGenerationFailed(result.error, 'generateTests');
        }
      }

      // Stop the agent
      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      const err = toError(error);
      this.failWorkflow(workflowId, err.message);
      if (this.config.publishEvents) {
        await this.publishGenerationFailed(err, 'generateTests');
      }
      return { success: false, error: err };
    }
  }

  /**
   * Generate tests using TDD workflow
   */
  async generateTDDTests(request: TDDRequest): Promise<Result<TDDResult, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'tdd');

      // Spawn TDD-specific agent
      const agentResult = await this.spawnTDDAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      // Generate TDD tests
      const result = await this.testGenerator.generateTDDTests(request);

      if (result.success) {
        this.completeWorkflow(workflowId);
        this.updateWorkflowProgress(workflowId, this.getTDDProgress(request.phase));
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * Generate property-based tests
   */
  async generatePropertyTests(
    request: PropertyTestRequest
  ): Promise<Result<PropertyTests, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'property');

      const agentResult = await this.spawnPropertyTestAgent(workflowId, request);
      if (!agentResult.success) {
        this.failWorkflow(workflowId, agentResult.error.message);
        return err(agentResult.error);
      }

      this.addAgentToWorkflow(workflowId, agentResult.value);

      const result = await this.testGenerator.generatePropertyTests(request);

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      await this.agentCoordinator.stop(agentResult.value);

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * Generate test data
   */
  async generateTestData(request: TestDataRequest): Promise<Result<TestData, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'data');

      const result = await this.testGenerator.generateTestData(request);

      if (result.success) {
        this.completeWorkflow(workflowId);
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  /**
   * Learn patterns from existing tests
   */
  async learnPatterns(
    request: LearnPatternsRequest
  ): Promise<Result<LearnedPatterns, Error>> {
    const workflowId = uuidv4();

    try {
      this.startWorkflow(workflowId, 'learn');

      const result = await this.patternMatcher.learnPatterns(request);

      if (result.success) {
        this.completeWorkflow(workflowId);

        // Publish pattern learned event
        if (this.config.publishEvents) {
          await this.publishPatternLearned(result.value);
        }
      } else {
        this.failWorkflow(workflowId, result.error.message);
      }

      return result;
    } catch (error) {
      this.failWorkflow(workflowId, String(error));
      return err(toError(error));
    }
  }

  // ============================================================================
  // Agent Spawning Methods
  // ============================================================================

  private async spawnTestGeneratorAgent(
    workflowId: string,
    request: GenerateTestsRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `test-generator-${workflowId.slice(0, 8)}`,
      domain: 'test-generation',
      type: 'generator',
      capabilities: ['test-generation', request.testType, request.framework],
      config: {
        workflowId,
        sourceFiles: request.sourceFiles,
        coverageTarget: request.coverageTarget,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnTDDAgent(
    workflowId: string,
    request: TDDRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `tdd-agent-${workflowId.slice(0, 8)}`,
      domain: 'test-generation',
      type: 'generator',
      capabilities: ['tdd', request.framework, request.phase],
      config: {
        workflowId,
        feature: request.feature,
        behavior: request.behavior,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  private async spawnPropertyTestAgent(
    workflowId: string,
    request: PropertyTestRequest
  ): Promise<Result<string, Error>> {
    const config: AgentSpawnConfig = {
      name: `property-test-agent-${workflowId.slice(0, 8)}`,
      domain: 'test-generation',
      type: 'generator',
      capabilities: ['property-testing', 'fast-check'],
      config: {
        workflowId,
        function: request.function,
        properties: request.properties,
      },
    };

    return this.agentCoordinator.spawn(config);
  }

  // ============================================================================
  // Event Publishing Methods
  // ============================================================================

  private async publishTestGenerated(
    test: GeneratedTest,
    framework: string
  ): Promise<void> {
    const payload: TestGeneratedPayload = {
      testId: test.id,
      testFile: test.testFile,
      framework,
      sourceFile: test.sourceFile,
      testType: test.type,
    };

    const event = createEvent(
      TestGenerationEvents.TestGenerated,
      'test-generation',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishTestSuiteCreated(
    tests: GeneratedTests,
    request: GenerateTestsRequest
  ): Promise<void> {
    const payload: TestSuiteCreatedPayload = {
      suiteId: uuidv4(),
      testCount: tests.tests.length,
      sourceFiles: request.sourceFiles,
      coverageEstimate: tests.coverageEstimate,
    };

    const event = createEvent(
      TestGenerationEvents.TestSuiteCreated,
      'test-generation',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishPatternLearned(learned: LearnedPatterns): Promise<void> {
    const event = createEvent(
      TestGenerationEvents.PatternLearned,
      'test-generation',
      {
        patternCount: learned.patterns.length,
        confidence: learned.confidence,
        patternIds: learned.patterns.map((p) => p.id),
      }
    );

    await this.eventBus.publish(event);
  }

  private async publishGenerationFailed(error: Error, context: string): Promise<void> {
    const event = createEvent(
      TestGenerationEvents.GenerationFailed,
      'test-generation',
      {
        error: error.message,
        context,
        timestamp: new Date().toISOString(),
      }
    );

    await this.eventBus.publish(event);
  }

  private getTDDProgress(phase: TDDRequest['phase']): number {
    switch (phase) {
      case 'red':
        return 33;
      case 'green':
        return 66;
      case 'refactor':
        return 100;
      default:
        return 0;
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  protected subscribeToEvents(): void {
    // Subscribe to coverage gap events to trigger test generation
    this.eventBus.subscribe(
      'coverage-analysis.CoverageGapDetected',
      this.handleCoverageGapDetected.bind(this)
    );

    // Subscribe to test execution events for learning
    this.eventBus.subscribe(
      'test-execution.TestRunCompleted',
      this.handleTestRunCompleted.bind(this)
    );

    // Subscribe to dream cycle events from learning-optimization domain
    this.subscribeToDreamEvents();
  }

  // ============================================================================
  // Dream Event Handling (ADR-021 Integration)
  // ============================================================================

  /**
   * Subscribe to dream cycle completion events from learning-optimization domain.
   * Dream insights can suggest edge cases, novel test patterns, and optimization opportunities.
   */
  private subscribeToDreamEvents(): void {
    this.eventBus.subscribe(
      LearningOptimizationEvents.DreamCycleCompleted,
      this.handleDreamCycleCompleted.bind(this)
    );
  }

  /**
   * Handle dream cycle completion event.
   * Filters insights relevant to test generation and applies actionable ones.
   */
  private async handleDreamCycleCompleted(
    event: DomainEvent<DreamCycleCompletedPayload>
  ): Promise<void> {
    const { insights, cycleId } = event.payload;

    if (!insights || insights.length === 0) {
      return;
    }

    // Filter insights relevant to this domain
    const relevantInsights = insights.filter((insight) => {
      // Check if suggested action mentions this domain
      const actionRelevant = insight.suggestedAction?.toLowerCase().includes(this.domainName) ||
        insight.suggestedAction?.toLowerCase().includes('test') ||
        insight.suggestedAction?.toLowerCase().includes('coverage');

      // Check if source concepts include test-related terms
      const conceptsRelevant = insight.sourceConcepts.some((c) =>
        c.toLowerCase().includes('test') ||
        c.toLowerCase().includes(this.domainName) ||
        c.toLowerCase().includes('coverage') ||
        c.toLowerCase().includes('edge-case')
      );

      // Check for test-generation related insight types
      const typeRelevant = insight.type === 'optimization' ||
        insight.type === 'gap_detection' ||
        insight.type === 'novel_association';

      return actionRelevant || conceptsRelevant || (typeRelevant && insight.actionable);
    });

    if (relevantInsights.length === 0) {
      return;
    }

    console.log(
      `[${this.domainName}] Received ${relevantInsights.length} relevant dream insights from cycle ${cycleId}`
    );

    // Apply high-confidence actionable insights
    for (const insight of relevantInsights) {
      if (insight.confidenceScore > 0.7 && insight.actionable) {
        await this.applyDreamInsight(insight, cycleId);
      }

      // Cache all relevant insights for test enhancement
      this.recentDreamInsights.push({
        ...insight,
        receivedAt: new Date(),
      });
    }

    // Prune old insights (keep last 50)
    if (this.recentDreamInsights.length > 50) {
      this.recentDreamInsights = this.recentDreamInsights.slice(-50);
    }
  }

  /**
   * Apply a dream insight by storing it as a learned pattern via SONA.
   * This allows the insight to influence future test generation decisions.
   *
   * @param insight - The dream insight to apply
   * @param cycleId - The dream cycle ID for tracking
   */
  private async applyDreamInsight(
    insight: DreamCycleCompletedPayload['insights'][0],
    cycleId: string
  ): Promise<void> {
    console.log(
      `[${this.domainName}] Applying dream insight: ${insight.description.slice(0, 100)}...`
    );

    // Store as a learned pattern via SONA if available
    if (this.qesona) {
      try {
        // Create state representation from insight
        const state: RLState = {
          id: `dream-insight-${insight.id}`,
          features: this.encodeInsightAsFeatures(insight),
          metadata: {
            insightType: insight.type,
            cycleId,
            sourceConcepts: insight.sourceConcepts,
          },
        };

        // Create action representing the suggested action
        const action: RLAction = {
          type: 'dream-insight',
          value: insight.suggestedAction || insight.description,
        };

        // Create pattern in QESONA with dream-derived marker
        const pattern = this.qesona.createPattern(
          state,
          action,
          {
            reward: insight.confidenceScore,
            success: true,
            quality: insight.noveltyScore,
          },
          'dream-derived' as QEPatternType,
          this.domainName,
          {
            insightId: insight.id,
            cycleId,
            description: insight.description,
            suggestedAction: insight.suggestedAction,
          }
        );

        console.log(
          `[${this.domainName}] Created SONA pattern ${pattern.id} from dream insight`
        );
      } catch (error) {
        console.error(
          `[${this.domainName}] Failed to store dream insight pattern:`,
          error
        );
      }
    }

    // Store insight in memory for downstream usage
    await this.memory.set(
      `${this.domainName}:dream-insight:${insight.id}`,
      {
        insight,
        cycleId,
        appliedAt: new Date().toISOString(),
      },
      { namespace: this.domainName, ttl: 86400 * 7 } // 7 days
    );
  }

  /**
   * Get recent dream insights filtered by type.
   * Used by test generation methods to enhance test case discovery.
   *
   * @param insightType - Optional type filter (e.g., 'novel_association', 'gap_detection')
   * @returns Array of recent dream insights
   */
  private getRecentDreamInsights(
    insightType?: string
  ): Array<typeof this.recentDreamInsights[0]> {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours

    return this.recentDreamInsights.filter((insight) => {
      const isRecent = insight.receivedAt.getTime() > cutoffTime;
      const matchesType = !insightType || insight.type === insightType;
      return isRecent && matchesType;
    });
  }

  /**
   * Enhance test generation request with dream insights for edge case discovery.
   * Queries recent dream insights to suggest additional test scenarios.
   *
   * @param request - The original test generation request
   * @returns Array of suggested edge case descriptions from dream insights
   */
  private async enhanceWithDreamInsights(
    request: GenerateTestsRequest
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Query recent dream insights for edge case suggestions
    const insights = this.getRecentDreamInsights();

    // Filter for novel paths and cross-domain insights that suggest edge cases
    const edgeCaseInsights = insights.filter(
      (i) =>
        (i.type === 'novel_association' || i.type === 'gap_detection') &&
        i.actionable &&
        i.confidenceScore > 0.6
    );

    for (const insight of edgeCaseInsights) {
      if (insight.suggestedAction) {
        // Check if the insight is relevant to the current request
        const isRelevant =
          request.sourceFiles.some((f) =>
            insight.sourceConcepts.some((c) => f.toLowerCase().includes(c.toLowerCase()))
          ) ||
          insight.suggestedAction.toLowerCase().includes(request.testType);

        if (isRelevant) {
          suggestions.push(insight.suggestedAction);
        }
      }
    }

    // Limit suggestions
    return suggestions.slice(0, 5);
  }

  /**
   * Encode a dream insight as feature vector for SONA pattern creation.
   */
  private encodeInsightAsFeatures(
    insight: DreamCycleCompletedPayload['insights'][0]
  ): number[] {
    const features: number[] = [];

    // Encode insight type
    const typeMap: Record<string, number> = {
      pattern_merge: 0.2,
      novel_association: 0.4,
      optimization: 0.6,
      gap_detection: 0.8,
    };
    features.push(typeMap[insight.type] || 0.5);

    // Encode confidence and novelty
    features.push(insight.confidenceScore);
    features.push(insight.noveltyScore);

    // Encode actionability
    features.push(insight.actionable ? 1.0 : 0.0);

    // Encode source concept count (normalized)
    features.push(Math.min(1, insight.sourceConcepts.length / 10));

    // Pad to consistent size
    while (features.length < 384) {
      features.push(0);
    }

    return features.slice(0, 384);
  }

  private async handleCoverageGapDetected(event: DomainEvent): Promise<void> {
    // Auto-generate tests for detected coverage gaps
    const payload = event.payload as {
      file: string;
      uncoveredLines: number[];
    };

    const result = await this.testGenerator.generateForCoverageGap(
      payload.file,
      payload.uncoveredLines,
      'jest' // Default framework
    );

    if (result.success && result.value.length > 0) {
      for (const test of result.value) {
        await this.publishTestGenerated(test, 'jest');
      }
    }
  }

  private async handleTestRunCompleted(_event: DomainEvent): Promise<void> {
    // Learn from test execution results
    // Could use event.payload data to improve pattern applicability scores
    // based on which generated tests pass/fail
    // Future implementation: analyze pass/fail rates and adjust pattern scores
  }

  // ============================================================================
  // Pattern Learning
  // ============================================================================

  private async learnFromGeneration(tests: GeneratedTests): Promise<void> {
    // Record successful patterns for future use
    for (const patternId of tests.patternsUsed) {
      const pattern = await this.patternMatcher.getPattern(patternId);
      if (pattern) {
        // Pattern was successfully used, increase its applicability
        // This is handled internally by recordPatternUsage
      }
    }
  }

  // ============================================================================
  // @ruvector Integration Methods (ADR-040)
  // ============================================================================

  /**
   * Adapt test generation patterns using QESONA
   * Per ADR-040: QESONA for pattern learning (test generation patterns)
   */
  private async adaptTestGenerationPatterns(
    request: GenerateTestsRequest
  ): Promise<string[]> {
    if (!this.qesona) {
      return [];
    }

    try {
      // Create state representation for SONA
      const state: RLState = {
        id: `test-gen-${Date.now()}`,
        features: this.encodeRequestAsFeatures(request),
        metadata: {
          testType: request.testType,
          framework: request.framework,
          sourceFileCount: request.sourceFiles.length,
        },
      };

      // Adapt pattern using QESONA
      const adaptationResult: QESONAAdaptationResult = await this.qesona.adaptPattern(
        state,
        this.config.sonaPatternType,
        'test-generation'
      );

      if (adaptationResult.success && adaptationResult.pattern) {
        console.log(`[TestGenerationCoordinator] QESONA adapted pattern with ${adaptationResult.similarity.toFixed(3)} similarity in ${adaptationResult.adaptationTimeMs.toFixed(2)}ms`);
        // Return pattern IDs from SONA adaptation
        return [adaptationResult.pattern.id];
      }

      return [];
    } catch (error) {
      console.error('[TestGenerationCoordinator] QESONA pattern adaptation failed:', error);
      return [];
    }
  }

  /**
   * Store test generation pattern in QESONA
   * Per ADR-040: Store test generation patterns in SONA
   */
  private async storeTestGenerationPattern(
    tests: GeneratedTests,
    request: GenerateTestsRequest
  ): Promise<void> {
    if (!this.qesona) {
      return;
    }

    try {
      // Create state from the successful generation
      const state: RLState = {
        id: `test-gen-${Date.now()}`,
        features: this.encodeRequestAsFeatures(request),
        metadata: {
          testCount: tests.tests.length,
          coverageEstimate: tests.coverageEstimate,
          success: true,
        },
      };

      // Create action representing what was done
      const action: RLAction = {
        type: 'generate-tests',
        value: {
          testType: request.testType,
          framework: request.framework,
          patternsUsed: tests.patternsUsed,
        },
      };

      // Create pattern in QESONA
      const pattern = this.qesona.createPattern(
        state,
        action,
        {
          reward: tests.coverageEstimate / 100,
          success: true,
          quality: tests.coverageEstimate / 100,
        },
        this.config.sonaPatternType,
        'test-generation',
        {
          testCount: tests.tests.length,
          framework: request.framework,
          testType: request.testType,
        }
      );

      console.log(`[TestGenerationCoordinator] Stored test generation pattern ${pattern.id} in QESONA`);
    } catch (error) {
      console.error('[TestGenerationCoordinator] Failed to store pattern in QESONA:', error);
    }
  }

  /**
   * Find similar tests using Flash Attention
   * Per ADR-040: QEFlashAttention for test similarity detection
   */
  private async findSimilarTests(
    tests: GeneratedTest[]
  ): Promise<Array<{ test: GeneratedTest; similarTests: Array<{ testId: string; similarity: number }> }>> {
    if (!this.flashAttention) {
      return [];
    }

    const results: Array<{ test: GeneratedTest; similarTests: Array<{ testId: string; similarity: number }> }> = [];

    try {
      // Generate embeddings for new tests
      for (const test of tests) {
        const embedding = this.generateTestEmbedding(test);
        this.testEmbeddings.set(test.id, embedding);
      }

      // Get all existing test embeddings from memory
      const existingEmbeddings = await this.loadExistingTestEmbeddings();

      if (existingEmbeddings.length === 0) {
        // No existing tests to compare against
        return [];
      }

      // Use Flash Attention to find similar tests
      for (const test of tests) {
        const testEmbedding = this.testEmbeddings.get(test.id);
        if (!testEmbedding) continue;

        const similarities = await this.flashAttention.computeTestSimilarity(
          testEmbedding,
          existingEmbeddings.map(e => e.embedding),
          5 // Top-5 similar tests
        );

        const similarTests = similarities
          .filter(s => s.similarity > 0.7) // Only include highly similar tests
          .map(s => ({
            testId: existingEmbeddings[s.index].testId,
            similarity: s.similarity,
          }));

        if (similarTests.length > 0) {
          results.push({ test, similarTests });
        }
      }

      return results;
    } catch (error) {
      console.error('[TestGenerationCoordinator] Flash Attention similarity detection failed:', error);
      return [];
    }
  }

  /**
   * Prioritize test cases using Decision Transformer
   * Per ADR-040: Decision Transformer for test case selection
   */
  private async prioritizeTestCases(
    tests: GeneratedTest[],
    request: GenerateTestsRequest
  ): Promise<GeneratedTest[]> {
    if (!this.decisionTransformer) {
      return tests;
    }

    try {
      // Create state for Decision Transformer
      const state: RLState = {
        id: `prioritize-${Date.now()}`,
        features: [
          tests.length / 100, // Normalize test count
          (request.coverageTarget || 80) / 100, // Coverage target
          request.testType === 'unit' ? 0.2 : request.testType === 'integration' ? 0.5 : 0.8,
          request.framework === 'jest' ? 0.3 : request.framework === 'vitest' ? 0.4 : 0.5,
        ],
        metadata: {
          testCount: tests.length,
          framework: request.framework,
          testType: request.testType,
        },
      };

      // Get prediction from Decision Transformer
      const prediction: RLPrediction = await this.decisionTransformer.predict(state);

      console.log(`[TestGenerationCoordinator] DecisionTransformer prediction: ${prediction.reasoning}`);

      // Prioritize tests based on prediction confidence
      // High confidence = prioritize tests based on action type
      if (prediction.confidence > 0.7) {
        // Sort tests by assertions count (simple prioritization heuristic)
        return tests.sort((a, b) => b.assertions - a.assertions);
      }

      return tests;
    } catch (error) {
      console.error('[TestGenerationCoordinator] DecisionTransformer prioritization failed:', error);
      return tests;
    }
  }

  /**
   * Get QESONA statistics
   * Per ADR-040: Monitor SONA pattern learning
   */
  getQESONAStats(): QESONAStats | null {
    if (!this.qesona) {
      return null;
    }
    return this.qesona.getStats();
  }

  /**
   * Get Flash Attention metrics
   * Per ADR-040: Monitor Flash Attention performance
   */
  getFlashAttentionMetrics(): QEFlashAttentionMetrics[] | null {
    if (!this.flashAttention) {
      return null;
    }
    return this.flashAttention.getMetrics();
  }

  // ============================================================================
  // Coherence Gate Methods (ADR-052)
  // ============================================================================

  /**
   * Check coherence of requirements before test generation
   * Per ADR-052: Verify requirement coherence using Prime Radiant
   *
   * @param requirements - Array of requirements to check for coherence
   * @returns Coherence result with lane recommendation
   */
  async checkRequirementCoherence(
    requirements: Requirement[]
  ): Promise<RequirementCoherenceResult> {
    if (!this.coherenceGate) {
      // Return passing result if gate is not configured
      return {
        isCoherent: true,
        energy: 0,
        lane: 'reflex',
        contradictions: [],
        recommendations: [],
        durationMs: 0,
        usedFallback: true,
      };
    }

    return this.coherenceGate.checkRequirementCoherence(requirements);
  }

  /**
   * Check if the coherence gate is available and initialized
   * Per ADR-052: Expose coherence gate availability
   */
  isCoherenceGateAvailable(): boolean {
    return this.coherenceGate?.isAvailable() ?? false;
  }

  /**
   * Verify requirements coherence and enrich spec if needed
   * Per ADR-052: Main integration point for test generation
   *
   * @param spec - Test specification to verify
   * @returns Validated and possibly enriched specification
   * @throws CoherenceGateError if requirements have unresolvable contradictions
   */
  private async verifyAndEnrichSpec(spec: TestSpecification): Promise<TestSpecification> {
    if (!this.coherenceGate || !this.config.enableCoherenceGate) {
      return spec;
    }

    const result = await this.coherenceGate.validateAndEnrich(spec);

    if (result.success) {
      return result.value;
    }

    throw result.error;
  }

  /**
   * Verify a test pattern selection using multi-model consensus
   * Per MM-001: High-stakes test design decisions require verification
   *
   * @param pattern - The test pattern to verify
   * @param confidence - Initial confidence in the pattern selection
   * @returns true if the pattern is verified or doesn't require consensus
   */
  private async verifyTestPatternSelection(
    pattern: { id: string; name: string; type: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof pattern> = createDomainFinding({
      id: uuidv4(),
      type: 'test-pattern-selection',
      confidence,
      description: `Verify test pattern: ${pattern.name} (${pattern.type})`,
      payload: pattern,
      detectedBy: 'test-generation-coordinator',
      severity: confidence > 0.9 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[TestGenerationCoordinator] Test pattern '${pattern.name}' verified by consensus`);
        return true;
      }
      console.warn(`[TestGenerationCoordinator] Test pattern '${pattern.name}' NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify a mock strategy using multi-model consensus
   * Per MM-001: Mock strategy decisions can have significant impact
   *
   * @param strategy - The mock strategy to verify
   * @param confidence - Initial confidence in the strategy
   * @returns true if the strategy is verified or doesn't require consensus
   */
  private async verifyMockStrategy(
    strategy: { target: string; mockType: string; reason: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof strategy> = createDomainFinding({
      id: uuidv4(),
      type: 'mock-strategy',
      confidence,
      description: `Verify mock strategy for ${strategy.target}: ${strategy.mockType}`,
      payload: strategy,
      detectedBy: 'test-generation-coordinator',
      severity: confidence > 0.85 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[TestGenerationCoordinator] Mock strategy for '${strategy.target}' verified by consensus`);
        return true;
      }
      console.warn(`[TestGenerationCoordinator] Mock strategy for '${strategy.target}' NOT verified`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify edge case generation using multi-model consensus
   * Per MM-001: Edge cases are critical for comprehensive testing
   *
   * @param edgeCase - The edge case to verify
   * @param confidence - Initial confidence in the edge case
   * @returns true if the edge case is verified or doesn't require consensus
   */
  private async verifyEdgeCaseGeneration(
    edgeCase: { description: string; inputConditions: string[]; expectedBehavior: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof edgeCase> = createDomainFinding({
      id: uuidv4(),
      type: 'edge-case-generation',
      confidence,
      description: `Verify edge case: ${edgeCase.description}`,
      payload: edgeCase,
      detectedBy: 'test-generation-coordinator',
      severity: 'high', // Edge cases are always important
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[TestGenerationCoordinator] Edge case '${edgeCase.description.slice(0, 50)}...' verified by consensus`);
        return true;
      }
      console.warn(`[TestGenerationCoordinator] Edge case NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  // ============================================================================
  // Helper Methods for @ruvector Integration
  // ============================================================================

  /**
   * Encode test generation request as feature vector for SONA
   */
  private encodeRequestAsFeatures(request: GenerateTestsRequest): number[] {
    const features: number[] = [];

    // Encode test type
    features.push(
      request.testType === 'unit' ? 0.2 :
      request.testType === 'integration' ? 0.5 :
      0.8 // e2e
    );

    // Encode framework
    features.push(
      request.framework === 'jest' ? 0.25 :
      request.framework === 'vitest' ? 0.5 :
      request.framework === 'mocha' ? 0.75 :
      0.9 // pytest
    );

    // Encode source file count (normalized)
    features.push(Math.min(1, request.sourceFiles.length / 50));

    // Encode coverage target (normalized)
    features.push((request.coverageTarget || 80) / 100);

    // Pad to consistent size if needed
    while (features.length < 384) {
      features.push(0);
    }

    return features.slice(0, 384);
  }

  /**
   * Generate test embedding for Flash Attention
   */
  private generateTestEmbedding(test: GeneratedTest): Float32Array {
    const embedding: number[] = [];

    // Encode test name (simple hash-based embedding)
    const nameHash = this.simpleHash(test.name);
    for (let i = 0; i < 64; i++) {
      embedding.push(((nameHash >> (i % 32)) & 1) * 2 - 1);
    }

    // Encode test type
    embedding.push(
      test.type === 'unit' ? 0.2 :
      test.type === 'integration' ? 0.5 :
      0.8 // e2e
    );

    // Encode assertions count (normalized)
    embedding.push(Math.min(1, test.assertions / 20));

    // Pad to 384 dimensions
    while (embedding.length < 384) {
      embedding.push(0);
    }

    return new Float32Array(embedding.slice(0, 384));
  }

  /**
   * Load existing test embeddings from memory
   */
  private async loadExistingTestEmbeddings(): Promise<Array<{ testId: string; embedding: Float32Array }>> {
    try {
      const keys = await this.memory.search('test-embedding:*', 1000);
      const embeddings: Array<{ testId: string; embedding: Float32Array }> = [];

      for (const key of keys) {
        const stored = await this.memory.get<{ testId: string; embedding: number[] }>(key);
        if (stored) {
          embeddings.push({
            testId: stored.testId,
            embedding: new Float32Array(stored.embedding),
          });
        }
      }

      return embeddings;
    } catch {
      return [];
    }
  }

  /**
   * Simple hash function for embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash | 0;
    }
    return Math.abs(hash);
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  private async loadWorkflowState(): Promise<void> {
    const savedState = await this.memory.get<WorkflowStatus[]>(
      'test-generation:coordinator:workflows'
    );

    if (savedState) {
      // Only restore non-completed workflows
      for (const workflow of savedState) {
        if (workflow.status === 'running') {
          // Mark as failed since we're restarting
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
      'test-generation:coordinator:workflows',
      workflows,
      { namespace: 'test-generation', persist: true }
    );
  }
}
