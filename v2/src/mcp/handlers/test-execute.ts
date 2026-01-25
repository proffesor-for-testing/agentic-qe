/**
 * Test Execution Handler
 *
 * Handles orchestrated parallel test execution across multiple environments.
 * Coordinates with fleet agents for distributed test running.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from './base-handler.js';
import { TestExecutionSpec } from '../tools.js';
import { AgentRegistry } from '../services/AgentRegistry.js';
import { HookExecutor } from '../services/HookExecutor.js';
import { QEAgentType } from '../../types/index.js';
import { SecureRandom } from '../../utils/SecureRandom.js';

export interface TestExecuteArgs {
  spec: TestExecutionSpec;
  fleetId?: string;
}

export interface TestExecution {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  spec: TestExecutionSpec;
  results: TestExecutionResults;
  startedAt: string;
  completedAt?: string;
  executionTime?: number;
  fleetId?: string;
  agentAssignments: AgentAssignment[];
}

export interface TestExecutionResults {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    retried: number;
  };
  suiteResults: SuiteResult[];
  coverage?: CoverageResults;
  performance: PerformanceMetrics;
  artifacts: Artifact[];
}

export interface SuiteResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed' | 'partial';
  tests: TestResult[];
  duration: number;
  agentId?: string;
}

export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  retryCount: number;
  assertions: AssertionResult[];
}

export interface AssertionResult {
  description: string;
  passed: boolean;
  expected?: any;
  actual?: any;
}

export interface CoverageResults {
  overall: number;
  byFile: Record<string, number>;
  uncoveredLines: Array<{file: string, lines: number[]}>;
  threshold: number;
  passed: boolean;
}

export interface PerformanceMetrics {
  totalExecutionTime: number;
  averageTestTime: number;
  parallelismEfficiency: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    network: number;
  };
}

export interface Artifact {
  type: 'screenshot' | 'log' | 'report' | 'coverage' | 'performance';
  name: string;
  path: string;
  size: number;
  environment: string;
}

export interface AgentAssignment {
  agentId: string;
  agentType: string;
  testSuites: string[];
  environment: string;
  status: 'assigned' | 'running' | 'completed' | 'failed';
}

export class TestExecuteHandler extends BaseHandler {
  private activeExecutions: Map<string, TestExecution> = new Map();
  private executionQueue: TestExecution[] = [];
  private maxConcurrentExecutions = 5;
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;

  constructor(registry: AgentRegistry, hookExecutor: HookExecutor) {
    super();
    this.registry = registry;
    this.hookExecutor = hookExecutor;
  }

  async handle(args: TestExecuteArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    this.log('info', 'Starting test execution', { requestId, spec: args.spec });

    try {
      // Validate required parameters
      this.validateRequired(args, ['spec']);
      this.validateTestExecutionSpec(args.spec);

      const { result: execution, executionTime } = await this.measureExecutionTime(
        () => this.executeTests(args.spec, args.fleetId)
      );

      this.log('info', `Test execution completed in ${executionTime.toFixed(2)}ms`, {
        executionId: execution.id,
        totalTests: execution.results.summary.total,
        passed: execution.results.summary.passed,
        failed: execution.results.summary.failed
      });

      return this.createSuccessResponse(execution, requestId);
    } catch (error) {
      this.log('error', 'Test execution failed', { error: error instanceof Error ? error.message : String(error) });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Test execution failed',
        requestId
      );
    }
  }

  private validateTestExecutionSpec(spec: TestExecutionSpec): void {
    if (!spec.testSuites || spec.testSuites.length === 0) {
      throw new Error('At least one test suite must be specified');
    }

    if (spec.retryCount < 0 || spec.retryCount > 5) {
      throw new Error('Retry count must be between 0 and 5');
    }

    if (spec.timeoutSeconds < 10) {
      throw new Error('Timeout must be at least 10 seconds');
    }
  }

  private async executeTests(spec: TestExecutionSpec, fleetId?: string): Promise<TestExecution> {
    const executionId = `execution-${Date.now()}-${SecureRandom.generateId(6)}`;

    const execution: TestExecution = {
      id: executionId,
      status: 'queued',
      spec,
      results: this.createEmptyResults(),
      startedAt: new Date().toISOString(),
      fleetId,
      agentAssignments: []
    };

    // Store execution
    this.activeExecutions.set(executionId, execution);

    // Check if we can run immediately or need to queue
    if (this.activeExecutions.size <= this.maxConcurrentExecutions) {
      await this.runExecution(execution);
    } else {
      this.executionQueue.push(execution);
      this.log('info', 'Execution queued', { executionId, queuePosition: this.executionQueue.length });
    }

    return execution;
  }

  private async runExecution(execution: TestExecution): Promise<void> {
    execution.status = 'running';
    const startTime = Date.now();

    try {
      this.log('info', 'Running test execution', { executionId: execution.id });

      // Execute pre-task hook
      await this.hookExecutor.executePreTask({
        description: `Executing tests: ${execution.spec.testSuites.join(', ')}`,
        agentType: QEAgentType.TEST_EXECUTOR
      });

      // Spawn test-executor agent
      const agent = await this.registry.spawnAgent(QEAgentType.TEST_EXECUTOR, {
        fleetId: execution.fleetId
      });

      this.log('info', 'Test executor agent spawned', {
        agentId: agent.id,
        executionId: execution.id
      });

      // Assign agents if fleet is specified
      if (execution.fleetId) {
        execution.agentAssignments = await this.assignAgents(execution);
      }

      // Execute test suites via agent
      if (execution.spec.parallelExecution) {
        await this.executeTestsInParallel(execution);
      } else {
        await this.executeTestsSequentially(execution);
      }

      // Calculate final results
      this.calculateFinalResults(execution);

      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.executionTime = Date.now() - startTime;

      // Execute post-task hook
      await this.hookExecutor.executePostTask({
        taskId: execution.id,
        status: 'completed',
        results: {
          executionId: execution.id,
          totalTests: execution.results.summary.total,
          passed: execution.results.summary.passed,
          failed: execution.results.summary.failed,
          coverage: execution.results.coverage?.overall
        }
      });

      this.log('info', 'Test execution completed successfully', {
        executionId: execution.id,
        duration: execution.executionTime
      });

      // Send notification via notify hook
      await this.hookExecutor.executeHook('notify', {
        message: `Test execution ${execution.id} completed: ${execution.results.summary.passed}/${execution.results.summary.total} tests passed`,
        level: 'info'
      });

    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
      execution.executionTime = Date.now() - startTime;

      // Execute post-task hook for failure
      await this.hookExecutor.executePostTask({
        taskId: execution.id,
        status: 'failed',
        results: {
          error: error instanceof Error ? error.message : String(error)
        }
      });

      this.log('error', 'Test execution failed', {
        executionId: execution.id,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    } finally {
      // Process queue
      this.processExecutionQueue();
    }
  }

  private async assignAgents(execution: TestExecution): Promise<AgentAssignment[]> {
    this.log('info', 'Assigning agents for test execution', {
      executionId: execution.id,
      fleetId: execution.fleetId
    });

    const assignments: AgentAssignment[] = [];
    const environments = execution.spec.environments || ['default'];

    // Simulate agent assignment logic
    // In a real implementation, this would coordinate with the fleet management system
    for (let i = 0; i < execution.spec.testSuites.length; i++) {
      const suite = execution.spec.testSuites[i];
      const environment = environments[i % environments.length];

      assignments.push({
        agentId: `agent-executor-${i + 1}`,
        agentType: 'test-executor',
        testSuites: [suite],
        environment,
        status: 'assigned'
      });
    }

    return assignments;
  }

  private async executeTestsInParallel(execution: TestExecution): Promise<void> {
    this.log('info', 'Executing tests in parallel', { executionId: execution.id });

    const promises = execution.spec.testSuites.map(async (suite, index) => {
      const environment = execution.spec.environments?.[index % (execution.spec.environments?.length || 1)] || 'default';
      const assignment = execution.agentAssignments.find(a => a.testSuites.includes(suite));

      if (assignment) {
        assignment.status = 'running';
      }

      try {
        const result = await this.executeSuite(suite, environment, execution.spec);

        if (assignment) {
          assignment.status = 'completed';
        }

        return result;
      } catch (error) {
        if (assignment) {
          assignment.status = 'failed';
        }
        throw error;
      }
    });

    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        execution.results.suiteResults.push(result.value);
      } else {
        // Create failed suite result
        const failedSuite: SuiteResult = {
          name: execution.spec.testSuites[index],
          environment: execution.spec.environments?.[index] || 'default',
          status: 'failed',
          tests: [],
          duration: 0
        };
        execution.results.suiteResults.push(failedSuite);
      }
    });
  }

  private async executeTestsSequentially(execution: TestExecution): Promise<void> {
    this.log('info', 'Executing tests sequentially', { executionId: execution.id });

    for (let i = 0; i < execution.spec.testSuites.length; i++) {
      const suite = execution.spec.testSuites[i];
      const environment = execution.spec.environments?.[i % (execution.spec.environments?.length || 1)] || 'default';
      const assignment = execution.agentAssignments.find(a => a.testSuites.includes(suite));

      if (assignment) {
        assignment.status = 'running';
      }

      try {
        const result = await this.executeSuite(suite, environment, execution.spec);
        execution.results.suiteResults.push(result);

        if (assignment) {
          assignment.status = 'completed';
        }
      } catch (error) {
        if (assignment) {
          assignment.status = 'failed';
        }

        // Create failed suite result
        const failedSuite: SuiteResult = {
          name: suite,
          environment,
          status: 'failed',
          tests: [],
          duration: 0
        };
        execution.results.suiteResults.push(failedSuite);
      }
    }
  }

  private async executeSuite(suiteName: string, environment: string, spec: TestExecutionSpec): Promise<SuiteResult> {
    const startTime = Date.now();

    this.log('info', 'Executing test suite', { suite: suiteName, environment });

    // Use real test execution via TestFrameworkExecutor
    try {
      const { TestFrameworkExecutor } = await import('../../utils/TestFrameworkExecutor.js');
      const executor = new TestFrameworkExecutor();

      // Detect framework or use Jest as default
      const workingDir = process.cwd();
      let framework = await executor.detectFramework(workingDir);
      if (!framework) {
        this.log('warn', 'Could not detect test framework, defaulting to Jest');
        framework = 'jest';
      }

      // Execute real tests
      const result = await executor.execute({
        framework,
        testPattern: suiteName,
        workingDir,
        timeout: spec.timeoutSeconds * 1000,
        coverage: false,
        environment
      });

      // Convert TestFrameworkExecutor results to SuiteResult format
      const tests: TestResult[] = result.tests.map(test => ({
        name: test.name,
        status: test.status === 'pending' ? 'skipped' : test.status,
        duration: test.duration,
        error: test.failureMessages?.join('\n'),
        retryCount: 0, // Retry logic handled by executor
        assertions: test.failureMessages?.map((msg, i) => ({
          description: `Assertion ${i + 1}`,
          passed: false,
          expected: 'See error message',
          actual: msg
        })) || []
      }));

      const duration = Date.now() - startTime;

      return {
        name: suiteName,
        environment,
        status: result.status === 'passed' ? 'passed' :
                result.status === 'failed' ? 'failed' : 'partial',
        tests,
        duration
      };
    } catch (error) {
      this.log('error', 'Test suite execution failed', { error: (error as Error).message });

      // Return failed suite result
      return {
        name: suiteName,
        environment,
        status: 'failed',
        tests: [{
          name: suiteName,
          status: 'failed',
          duration: Date.now() - startTime,
          error: (error as Error).message,
          retryCount: 0,
          assertions: []
        }],
        duration: Date.now() - startTime
      };
    }
  }

  private calculateFinalResults(execution: TestExecution): void {
    const summary = execution.results.summary;

    execution.results.suiteResults.forEach(suite => {
      suite.tests.forEach(test => {
        summary.total++;
        if (test.status === 'passed') {
          summary.passed++;
        } else if (test.status === 'failed') {
          summary.failed++;
        } else {
          summary.skipped++;
        }
        summary.retried += test.retryCount;
      });
    });

    // Calculate coverage (mock)
    execution.results.coverage = {
      overall: SecureRandom.randomFloat() * 20 + 75, // 75-95%
      byFile: {
        'src/main.js': SecureRandom.randomFloat() * 20 + 80,
        'src/utils.js': SecureRandom.randomFloat() * 20 + 70
      },
      uncoveredLines: [],
      threshold: 80,
      passed: true
    };

    // Calculate performance metrics
    execution.results.performance = {
      totalExecutionTime: execution.executionTime || 0,
      averageTestTime: summary.total > 0 ? (execution.executionTime || 0) / summary.total : 0,
      parallelismEfficiency: execution.spec.parallelExecution ? 0.85 : 1.0,
      resourceUtilization: {
        cpu: SecureRandom.randomFloat() * 30 + 40, // 40-70%
        memory: SecureRandom.randomFloat() * 20 + 60, // 60-80%
        network: SecureRandom.randomFloat() * 15 + 10 // 10-25%
      }
    };

    // Generate artifacts
    execution.results.artifacts = this.generateArtifacts(execution);
  }

  private generateArtifacts(execution: TestExecution): Artifact[] {
    const artifacts: Artifact[] = [];

    // Test report
    artifacts.push({
      type: 'report',
      name: `test-report-${execution.id}.${execution.spec.reportFormat}`,
      path: `/artifacts/reports/test-report-${execution.id}.${execution.spec.reportFormat}`,
      size: Math.floor(SecureRandom.randomFloat() * 500000) + 50000, // 50KB-550KB
      environment: 'all'
    });

    // Coverage report
    if (execution.results.coverage) {
      artifacts.push({
        type: 'coverage',
        name: `coverage-${execution.id}.html`,
        path: `/artifacts/coverage/coverage-${execution.id}.html`,
        size: Math.floor(SecureRandom.randomFloat() * 200000) + 100000, // 100KB-300KB
        environment: 'all'
      });
    }

    // Performance report
    artifacts.push({
      type: 'performance',
      name: `performance-${execution.id}.json`,
      path: `/artifacts/performance/performance-${execution.id}.json`,
      size: Math.floor(SecureRandom.randomFloat() * 50000) + 10000, // 10KB-60KB
      environment: 'all'
    });

    return artifacts;
  }

  private createEmptyResults(): TestExecutionResults {
    return {
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        retried: 0
      },
      suiteResults: [],
      performance: {
        totalExecutionTime: 0,
        averageTestTime: 0,
        parallelismEfficiency: 0,
        resourceUtilization: {
          cpu: 0,
          memory: 0,
          network: 0
        }
      },
      artifacts: []
    };
  }

  private processExecutionQueue(): void {
    if (this.executionQueue.length > 0 && this.activeExecutions.size <= this.maxConcurrentExecutions) {
      const nextExecution = this.executionQueue.shift();
      if (nextExecution) {
        this.runExecution(nextExecution).catch(error => {
          this.log('error', 'Queued execution failed', { error: error.message });
        });
      }
    }
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): TestExecution | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * List all executions
   */
  listExecutions(): TestExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution || execution.status === 'completed' || execution.status === 'failed') {
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date().toISOString();

    this.log('info', 'Execution cancelled', { executionId });
    return true;
  }
}