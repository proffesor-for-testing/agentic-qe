/**
 * Test Runner Agent
 * Executes and orchestrates test runs
 */

import { QEAgent, AgentContext, AgentExecutionResult } from '../base/QEAgent';
import { QEAgentConfig, TestStatus } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

const logger = new Logger('TestRunner');

export interface TestRun {
  id: string;
  name: string;
  suite: string;
  startTime: string;
  endTime?: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'aborted';
  environment: TestEnvironment;
  configuration: TestConfiguration;
  results: TestResults;
  artifacts: TestArtifact[];
}

export interface TestEnvironment {
  name: string;
  type: 'local' | 'ci' | 'staging' | 'production';
  os: string;
  browser?: string;
  version: string;
  variables: Record<string, string>;
}

export interface TestConfiguration {
  parallel: boolean;
  maxWorkers?: number;
  timeout: number;
  retries: number;
  failFast: boolean;
  coverage: boolean;
  verbose: boolean;
  filters?: TestFilter;
}

export interface TestFilter {
  tags?: string[];
  suites?: string[];
  priority?: string[];
  pattern?: string;
}

export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
  coverage?: CoverageReport;
}

export interface TestResult {
  id: string;
  name: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  retries: number;
  error?: TestError;
  logs: string[];
  screenshots?: string[];
}

export interface TestError {
  message: string;
  stack?: string;
  expected?: any;
  actual?: any;
  diff?: string;
}

export interface CoverageReport {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
  files: FileCoverage[];
}

export interface FileCoverage {
  path: string;
  lines: number;
  statements: number;
  functions: number;
  branches: number;
  uncovered: number[];
}

export interface TestArtifact {
  type: 'log' | 'screenshot' | 'video' | 'report' | 'coverage';
  path: string;
  timestamp: string;
  size: number;
}

export class TestRunner extends QEAgent {
  private activeRuns: Map<string, TestRun> = new Map();
  private runHistory: TestRun[] = [];

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super(
      {
        ...config,
        name: config.name || 'test-runner',
        type: 'test-analyzer',
        capabilities: [
          'test-generation',
          'test-analysis',
          'risk-assessment',
          'test-optimization',
          'coverage-analysis',
          'pattern-recognition',
          'bug-detection'
        ]
      },
      memory,
      hooks,
      logger
    );
  }

  /**
   * Execute test suite
   */
  public async executeTestSuite(
    suite: string,
    config: TestConfiguration,
    context: AgentContext
  ): Promise<TestRun> {
    logger.info(`Executing test suite: ${suite}`);

    const run: TestRun = {
      id: `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Test Run - ${suite}`,
      suite,
      startTime: new Date().toISOString(),
      status: 'running',
      environment: await this.detectEnvironment(),
      configuration: config,
      results: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        tests: []
      },
      artifacts: []
    };

    this.activeRuns.set(run.id, run);

    try {
      // Execute tests
      const results = await this.runTests(suite, config, context);
      run.results = results;
      run.status = results.failed > 0 ? 'failed' : 'passed';

      // Collect artifacts
      run.artifacts = await this.collectArtifacts(run.id, context);

      // Generate coverage report if enabled
      if (config.coverage) {
        run.results.coverage = await this.collectCoverage(suite, context);
      }
    } catch (error) {
      logger.error(`Test execution failed: ${error}`);
      run.status = 'failed';
      run.results.failed = run.results.total;
    } finally {
      run.endTime = new Date().toISOString();
      run.results.duration = Date.parse(run.endTime) - Date.parse(run.startTime);

      // Store run results
      await this.storeResults(run, context);

      // Cleanup
      this.activeRuns.delete(run.id);
      this.runHistory.push(run);
    }

    return run;
  }

  /**
   * Run tests based on configuration
   */
  private async runTests(
    suite: string,
    config: TestConfiguration,
    context: AgentContext
  ): Promise<TestResults> {
    logger.info(`Running tests with config: ${JSON.stringify(config)}`);

    const results: TestResults = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      tests: []
    };

    // Simulate test execution (in real implementation, would run actual tests)
    const testCases = await this.loadTestCases(suite, config.filters);
    results.total = testCases.length;

    if (config.parallel && config.maxWorkers && config.maxWorkers > 1) {
      // Parallel execution
      const chunks = this.chunkTests(testCases, config.maxWorkers);
      const chunkResults = await Promise.all(
        chunks.map(chunk => this.executeTestChunk(chunk, config, context))
      );

      // Merge results
      for (const chunkResult of chunkResults) {
        results.tests.push(...chunkResult);
      }
    } else {
      // Sequential execution
      for (const testCase of testCases) {
        if (config.failFast && results.failed > 0) {
          // Skip remaining tests if fail-fast is enabled
          results.skipped++;
          results.tests.push({
            ...testCase,
            status: 'skipped',
            duration: 0,
            retries: 0,
            logs: ['Skipped due to fail-fast']
          });
          continue;
        }

        const result = await this.executeTest(testCase, config, context);
        results.tests.push(result);

        // Update counters
        switch (result.status) {
          case 'passed':
            results.passed++;
            break;
          case 'failed':
            results.failed++;
            break;
          case 'skipped':
            results.skipped++;
            break;
        }

        results.duration += result.duration;
      }
    }

    return results;
  }

  /**
   * Execute individual test
   */
  private async executeTest(
    testCase: any,
    config: TestConfiguration,
    context: AgentContext
  ): Promise<TestResult> {
    const startTime = Date.now();
    let status: TestResult['status'] = 'passed';
    let error: TestError | undefined;
    let retries = 0;
    const logs: string[] = [];

    // Execute with retry logic
    while (retries <= config.retries) {
      try {
        // Simulate test execution
        logs.push(`Executing test: ${testCase.name}`);

        // Random failure simulation (for demo)
        if (Math.random() < 0.2) {
          throw new Error('Test assertion failed');
        }

        status = 'passed';
        logs.push('Test passed');
        break;
      } catch (err: any) {
        status = 'failed';
        error = {
          message: err.message,
          stack: err.stack
        };
        logs.push(`Test failed: ${err.message}`);

        if (retries < config.retries) {
          retries++;
          logs.push(`Retrying (${retries}/${config.retries})...`);
        } else {
          break;
        }
      }
    }

    return {
      id: testCase.id,
      name: testCase.name,
      suite: testCase.suite,
      status,
      duration: Date.now() - startTime,
      retries,
      error,
      logs
    };
  }

  /**
   * Execute test chunk in parallel
   */
  private async executeTestChunk(
    testCases: any[],
    config: TestConfiguration,
    context: AgentContext
  ): Promise<TestResult[]> {
    const results = await Promise.all(
      testCases.map(testCase => this.executeTest(testCase, config, context))
    );
    return results;
  }

  /**
   * Collect test coverage
   */
  private async collectCoverage(
    suite: string,
    context: AgentContext
  ): Promise<CoverageReport> {
    logger.info('Collecting coverage data');

    // Simulated coverage data
    return {
      lines: 85.5,
      statements: 83.2,
      functions: 78.9,
      branches: 72.4,
      files: [
        {
          path: 'src/main.ts',
          lines: 90,
          statements: 88,
          functions: 85,
          branches: 80,
          uncovered: [45, 67, 89]
        },
        {
          path: 'src/utils.ts',
          lines: 95,
          statements: 93,
          functions: 90,
          branches: 85,
          uncovered: [12, 34]
        }
      ]
    };
  }

  /**
   * Collect test artifacts
   */
  private async collectArtifacts(
    runId: string,
    context: AgentContext
  ): Promise<TestArtifact[]> {
    const artifacts: TestArtifact[] = [];

    // Collect logs
    artifacts.push({
      type: 'log',
      path: `/tmp/test-runs/${runId}/console.log`,
      timestamp: new Date().toISOString(),
      size: 1024
    });

    // Collect reports
    artifacts.push({
      type: 'report',
      path: `/tmp/test-runs/${runId}/report.html`,
      timestamp: new Date().toISOString(),
      size: 2048
    });

    return artifacts;
  }

  /**
   * Store test results
   */
  private async storeResults(
    run: TestRun,
    context: AgentContext
  ): Promise<void> {
    await this.memory.store({
      key: `test_run_${run.id}`,
      value: run,
      type: 'test-data',
      sessionId: 'default-session',
      agentId: this.name,
      timestamp: new Date(),
      tags: ['test-run', 'results'],
      metadata: {
        agent: this.name,
        suite: run.suite,
        status: run.status,
        timestamp: run.endTime || run.startTime
      }
    });
  }

  /**
   * Detect test environment
   */
  private async detectEnvironment(): Promise<TestEnvironment> {
    return {
      name: process.env.TEST_ENV || 'local',
      type: process.env.CI ? 'ci' : 'local',
      os: process.platform,
      browser: process.env.BROWSER || 'chrome',
      version: process.version,
      variables: {
        NODE_ENV: process.env.NODE_ENV || 'test',
        CI: process.env.CI || 'false'
      }
    };
  }

  /**
   * Load test cases
   */
  private async loadTestCases(suite: string, filters?: TestFilter): Promise<any[]> {
    // Simulated test loading
    const allTests = [
      { id: '1', name: 'Test Login', suite, tags: ['auth', 'critical'] },
      { id: '2', name: 'Test Signup', suite, tags: ['auth', 'critical'] },
      { id: '3', name: 'Test Dashboard', suite, tags: ['ui', 'medium'] },
      { id: '4', name: 'Test API', suite, tags: ['api', 'high'] },
      { id: '5', name: 'Test Database', suite, tags: ['db', 'low'] }
    ];

    // Apply filters
    let tests = allTests;
    if (filters) {
      if (filters.tags && filters.tags.length > 0) {
        tests = tests.filter(t =>
          t.tags.some(tag => filters.tags!.includes(tag))
        );
      }
      if (filters.pattern) {
        tests = tests.filter(t =>
          t.name.toLowerCase().includes(filters.pattern!.toLowerCase())
        );
      }
    }

    return tests;
  }

  /**
   * Chunk tests for parallel execution
   */
  private chunkTests(tests: any[], workers: number): any[][] {
    const chunks: any[][] = [];
    const chunkSize = Math.ceil(tests.length / workers);

    for (let i = 0; i < tests.length; i += chunkSize) {
      chunks.push(tests.slice(i, i + chunkSize));
    }

    return chunks;
  }

  /**
   * Get run status
   */
  public async getRunStatus(runId: string): Promise<TestRun | undefined> {
    return this.activeRuns.get(runId) ||
           this.runHistory.find(r => r.id === runId);
  }

  /**
   * Abort test run
   */
  public async abortRun(runId: string): Promise<boolean> {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.status = 'aborted';
      run.endTime = new Date().toISOString();
      this.activeRuns.delete(runId);
      this.runHistory.push(run);
      return true;
    }
    return false;
  }

  /**
   * Main execution method implementation
   */
  protected async doExecute(context: AgentContext): Promise<AgentExecutionResult> {
    const task = (context.metadata?.task as string) || 'Execute test suite';
    logger.info(`TestRunner executing: ${task}`);
    const startTime = Date.now();

    try {
      const artifacts: string[] = [];

      // Parse task to determine execution type
      const config: TestConfiguration = {
        parallel: task.includes('parallel'),
        maxWorkers: 4,
        timeout: 30000,
        retries: task.includes('retry') ? 2 : 0,
        failFast: task.includes('fail-fast'),
        coverage: task.includes('coverage'),
        verbose: true
      };

      const suite = this.extractSuiteName(task);
      const run = await this.executeTestSuite(suite, config, context);

      // Add run artifacts
      artifacts.push(...run.artifacts.map(a => a.path));

      // Calculate duration
      const duration = Date.now() - startTime;

      return {
        success: run.status === 'passed',
        status: run.status as TestStatus,
        message: this.formatRunReport(run),
        artifacts,
        metrics: { executionTime: duration, testsRun: run.results.total },
        duration,
        metadata: { run }
      };
    } catch (error) {
      logger.error('Execution failed:', error);
      return {
        success: false,
        status: 'failed' as TestStatus,
        message: `Test execution failed: ${error}`,
        error: error as Error,
        artifacts: [],
        metrics: {},
        duration: Date.now() - startTime,
        metadata: { error }
      };
    }
  }

  /**
   * Extract suite name from task
   */
  private extractSuiteName(task: string): string {
    // Simple extraction logic
    if (task.includes('unit')) return 'unit-tests';
    if (task.includes('integration')) return 'integration-tests';
    if (task.includes('e2e')) return 'e2e-tests';
    return 'all-tests';
  }

  /**
   * Format run report
   */
  private formatRunReport(run: TestRun): string {
    const duration = run.results.duration / 1000;
    const passRate = run.results.total > 0
      ? ((run.results.passed / run.results.total) * 100).toFixed(1)
      : '0';

    return `
# Test Run Report

## Summary
- **Run ID**: ${run.id}
- **Suite**: ${run.suite}
- **Status**: ${run.status.toUpperCase()}
- **Environment**: ${run.environment.type} (${run.environment.os})

## Results
- **Total Tests**: ${run.results.total}
- **Passed**: ${run.results.passed} ✓
- **Failed**: ${run.results.failed} ✗
- **Skipped**: ${run.results.skipped} ○
- **Pass Rate**: ${passRate}%
- **Duration**: ${duration.toFixed(2)}s

## Configuration
- **Parallel**: ${run.configuration.parallel ? 'Yes' : 'No'}
- **Retries**: ${run.configuration.retries}
- **Coverage**: ${run.configuration.coverage ? 'Enabled' : 'Disabled'}

${run.results.coverage ? `
## Coverage
- **Lines**: ${run.results.coverage.lines.toFixed(1)}%
- **Statements**: ${run.results.coverage.statements.toFixed(1)}%
- **Functions**: ${run.results.coverage.functions.toFixed(1)}%
- **Branches**: ${run.results.coverage.branches.toFixed(1)}%
` : ''}

## Failed Tests
${run.results.tests
  .filter(t => t.status === 'failed')
  .map(t => `- ${t.name}: ${t.error?.message || 'Unknown error'}`)
  .join('\n') || 'None'}

## Artifacts
${run.artifacts.map(a => `- ${a.type}: ${a.path}`).join('\n') || 'None'}
    `.trim();
  }
}