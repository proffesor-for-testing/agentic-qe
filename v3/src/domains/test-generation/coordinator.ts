/**
 * Agentic QE v3 - Test Generation Coordinator
 * Orchestrates the test generation workflow across services
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  err,
  DomainEvent,
} from '../../shared/types';
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
  TestGeneratorService,
  ITestGenerationService,
} from './services/test-generator';
import {
  PatternMatcherService,
  IPatternMatchingService,
} from './services/pattern-matcher';

/**
 * Interface for the test generation coordinator
 */
export interface ITestGenerationCoordinator extends TestGenerationAPI {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getActiveWorkflows(): WorkflowStatus[];
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
export interface CoordinatorConfig {
  maxConcurrentWorkflows: number;
  defaultTimeout: number;
  enablePatternLearning: boolean;
  publishEvents: boolean;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkflows: 5,
  defaultTimeout: 60000, // 60 seconds
  enablePatternLearning: true,
  publishEvents: true,
};

/**
 * Test Generation Coordinator
 * Orchestrates test generation workflows and coordinates with agents
 */
export class TestGenerationCoordinator implements ITestGenerationCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly testGenerator: ITestGenerationService;
  private readonly patternMatcher: IPatternMatchingService;
  private readonly workflows: Map<string, WorkflowStatus> = new Map();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<CoordinatorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.testGenerator = new TestGeneratorService(memory);
    this.patternMatcher = new PatternMatcherService(memory);
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

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

    this.initialized = false;
  }

  /**
   * Get active workflow statuses
   */
  getActiveWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values()).filter(
      (w) => w.status === 'running' || w.status === 'pending'
    );
  }

  // ============================================================================
  // TestGenerationAPI Implementation
  // ============================================================================

  /**
   * Generate tests for source files
   */
  async generateTests(
    request: GenerateTestsRequest
  ): Promise<Result<GeneratedTests, Error>> {
    const workflowId = uuidv4();

    try {
      // Create workflow tracking
      this.startWorkflow(workflowId, 'generate');

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

      // Find matching patterns if pattern learning is enabled
      let patterns = request.patterns || [];
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

        // Publish events
        if (this.config.publishEvents) {
          await this.publishTestSuiteCreated(result.value, request);

          for (const test of result.value.tests) {
            await this.publishTestGenerated(test, request.framework);
          }
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
      const err = error instanceof Error ? error : new Error(String(error));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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
      return err(error instanceof Error ? error : new Error(String(error)));
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

  // ============================================================================
  // Workflow Management
  // ============================================================================

  private startWorkflow(
    id: string,
    type: WorkflowStatus['type']
  ): void {
    // Check workflow limit
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

  private subscribeToEvents(): void {
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
