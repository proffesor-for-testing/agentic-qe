/**
 * Agentic QE v3 - Test Execution Domain Plugin
 * Registers the test execution domain with the kernel
 */

import { DomainName, DomainEvent, Result, ok, err } from '../../shared/types';
import { BaseDomainPlugin, TaskHandler } from '../domain-interface';
import { EventBus, MemoryBackend } from '../../kernel/interfaces';
import { TestExecutionAPI, IExecuteTestsRequest, ISimpleTestRequest } from './interfaces';
import { TestExecutionCoordinator, createTestExecutionCoordinator } from './coordinator';

// ============================================================================
// Plugin Implementation
// ============================================================================

export class TestExecutionPlugin extends BaseDomainPlugin {
  private coordinator: TestExecutionCoordinator | null = null;

  constructor(eventBus: EventBus, memory: MemoryBackend) {
    super(eventBus, memory);
  }

  get name(): DomainName {
    return 'test-execution';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Test execution may depend on test generation for test files
    return ['test-generation'];
  }

  /**
   * Get the domain's public API
   */
  getAPI<T>(): T {
    if (!this.coordinator) {
      throw new Error('Plugin not initialized');
    }

    const api: TestExecutionAPI = {
      runTests: this.coordinator.runTests.bind(this.coordinator),
      execute: this.coordinator.execute.bind(this.coordinator),
      executeParallel: this.coordinator.executeParallel.bind(this.coordinator),
      detectFlaky: this.coordinator.detectFlaky.bind(this.coordinator),
      retry: this.coordinator.retry.bind(this.coordinator),
      getStats: this.coordinator.getStats.bind(this.coordinator),
      executeE2ETestCase: this.coordinator.executeE2ETestCase?.bind(this.coordinator),
      executeE2ETestSuite: this.coordinator.executeE2ETestSuite?.bind(this.coordinator),
    };

    return api as T;
  }

  // ============================================================================
  // Task Handlers (Queen-Domain Integration)
  // ============================================================================

  /**
   * Get task handlers for direct Queen-Domain integration
   * Maps task types to coordinator methods
   */
  protected override getTaskHandlers(): Map<string, TaskHandler> {
    return new Map([
      // Execute tests task - main task type for this domain
      ['execute-tests', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }

        // Support both simple and full request formats
        if (payload.testFiles && Array.isArray(payload.testFiles)) {
          // Simple request format
          const request: ISimpleTestRequest = {
            testFiles: payload.testFiles as string[],
            parallel: payload.parallel as boolean | undefined,
            retryCount: payload.retryCount as number | undefined,
            timeout: payload.timeout as number | undefined,
            workers: payload.workers as number | undefined,
          };
          return this.coordinator.runTests(request);
        } else if (payload.framework) {
          // Full request format
          const request: IExecuteTestsRequest = {
            testFiles: (payload.testFiles as string[]) || [],
            framework: payload.framework as string,
            timeout: payload.timeout as number | undefined,
            env: payload.env as Record<string, string> | undefined,
            reporters: payload.reporters as string[] | undefined,
          };
          return this.coordinator.execute(request);
        }

        return err(new Error('Invalid execute-tests payload: missing testFiles or framework'));
      }],

      // Detect flaky tests task
      ['detect-flaky', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }

        const testFiles = payload.testFiles as string[] | undefined;
        const runs = payload.runs as number | undefined;
        const threshold = payload.threshold as number | undefined;

        if (!testFiles) {
          return err(new Error('Invalid detect-flaky payload: missing testFiles'));
        }

        return this.coordinator.detectFlaky({
          testFiles,
          runs: runs ?? 5,
          threshold: threshold ?? 0.1,
        });
      }],

      // Retry failed tests task
      ['retry-tests', async (payload): Promise<Result<unknown, Error>> => {
        if (!this.coordinator) {
          return err(new Error('Coordinator not initialized'));
        }

        const runId = payload.runId as string | undefined;
        const failedTests = payload.failedTests as string[] | undefined;
        const maxRetries = payload.maxRetries as number | undefined;

        if (!runId || !failedTests) {
          return err(new Error('Invalid retry-tests payload: missing runId or failedTests'));
        }

        return this.coordinator.retry({
          runId,
          failedTests,
          maxRetries: maxRetries ?? 3,
          backoff: payload.backoff as 'linear' | 'exponential' | undefined,
        });
      }],
    ]);
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  protected async onInitialize(): Promise<void> {
    this.coordinator = createTestExecutionCoordinator(
      this.eventBus,
      this.memory
    ) as TestExecutionCoordinator;

    await this.coordinator.initialize();

    // Issue #205 fix: Start with 'idle' status (0 agents)
    this.updateHealth({
      status: 'idle',
      lastActivity: new Date(),
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.coordinator) {
      await this.coordinator.dispose();
      this.coordinator = null;
    }

    this.updateHealth({
      status: 'unhealthy',
    });
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Handle cross-domain events
    switch (event.type) {
      case 'test-generation.TestSuiteCreated':
        // Could auto-trigger test execution
        await this.handleTestSuiteCreated(event);
        break;

      case 'quality-assessment.QualityGateEvaluated':
        // Could adjust retry strategies based on quality gate results
        await this.handleQualityGateEvaluated(event);
        break;

      case 'coverage-analysis.CoverageGapDetected':
        // Could trigger targeted re-execution
        await this.handleCoverageGapDetected(event);
        break;
    }
  }

  protected subscribeToEvents(): void {
    // Subscribe to relevant events from other domains
    this.eventBus.subscribe('test-generation.TestSuiteCreated', (event) =>
      this.handleEvent(event)
    );

    this.eventBus.subscribe('quality-assessment.QualityGateEvaluated', (event) =>
      this.handleEvent(event)
    );

    this.eventBus.subscribe('coverage-analysis.CoverageGapDetected', (event) =>
      this.handleEvent(event)
    );
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleTestSuiteCreated(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      suiteId: string;
      testCount: number;
      sourceFiles: string[];
    };

    // Log the event for now - could auto-execute in the future
    this.updateHealth({
      lastActivity: new Date(),
    });

    // Store correlation for traceability
    await this.memory.set(
      `suite-event:${payload.suiteId}`,
      {
        eventId: event.id,
        timestamp: event.timestamp,
        sourceFiles: payload.sourceFiles,
      },
      { namespace: 'test-execution', ttl: 86400000 } // 24 hours
    );
  }

  private async handleQualityGateEvaluated(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      gateId: string;
      passed: boolean;
      checks: Array<{ name: string; passed: boolean }>;
    };

    // Could adjust retry behavior based on quality gate results
    if (!payload.passed) {
      // Increase retry attempts for failing quality gates
      await this.memory.set(
        `quality-context:${payload.gateId}`,
        {
          requiresRetry: true,
          failedChecks: payload.checks.filter(c => !c.passed).map(c => c.name),
        },
        { namespace: 'test-execution', ttl: 3600000 } // 1 hour
      );
    }

    this.updateHealth({
      lastActivity: new Date(),
    });
  }

  private async handleCoverageGapDetected(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      gapId: string;
      file: string;
      uncoveredLines: number[];
      riskScore: number;
    };

    // Could trigger targeted test execution for high-risk gaps
    if (payload.riskScore > 0.7) {
      await this.memory.set(
        `coverage-gap:${payload.gapId}`,
        {
          file: payload.file,
          uncoveredLines: payload.uncoveredLines,
          priority: 'high',
        },
        { namespace: 'test-execution', persist: true }
      );
    }

    this.updateHealth({
      lastActivity: new Date(),
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTestExecutionPlugin(
  eventBus: EventBus,
  memory: MemoryBackend
): TestExecutionPlugin {
  return new TestExecutionPlugin(eventBus, memory);
}
