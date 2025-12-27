import { ProcessExit } from '../../utils/ProcessExit';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import { RunOptions, FleetConfig, QEAgentType } from '../../types';

// ============================================================================
// Type Definitions for Run Command
// ============================================================================

/**
 * Valid test execution target types
 */
type ExecutionTarget = 'tests' | 'suite' | 'regression' | 'performance';

/**
 * Valid test type categories
 */
type TestTypeCategory = 'unit' | 'integration' | 'e2e' | 'performance' | 'security';

/**
 * Status of a task or test execution
 */
type TaskStatus = 'pending' | 'completed' | 'failed' | 'error';

/**
 * Agent configuration loaded from agents.json
 */
interface AgentConfigFile {
  agents: Array<{
    type: QEAgentType;
    count: number;
    config: Record<string, unknown>;
  }>;
  [key: string]: unknown;
}

/**
 * Environment configuration for test execution
 */
interface EnvironmentConfig {
  [envName: string]: {
    variables?: Record<string, string>;
    setup?: string[];
    teardown?: string[];
    [key: string]: unknown;
  };
}

/**
 * Execution settings parsed from RunOptions
 */
interface ExecutionSettings {
  parallel: boolean | undefined;
  timeout: number;
  retryCount: number;
  concurrency: number;
  reporter: string;
  coverage: boolean | undefined;
  suite: string | undefined;
}

/**
 * Complete execution configuration for a test run
 */
interface ExecutionConfig {
  id: string;
  target: ExecutionTarget;
  fleet: FleetConfig;
  agents: AgentConfigFile;
  environment: EnvironmentConfig[string];
  execution: ExecutionSettings;
  timestamp: string;
  directory: string;
}

/**
 * Individual test task definition
 */
interface TestTask {
  id: string;
  type: TestTypeCategory;
  agent: string;
  priority: number;
  timeout: number;
  retries: number;
}

/**
 * Coordination settings for orchestration
 */
interface CoordinationConfig {
  parallel: boolean | undefined;
  loadBalancing: boolean;
  faultTolerance: boolean;
}

/**
 * Orchestration plan for test execution
 */
interface OrchestrationPlan {
  strategy: string | undefined;
  agents: string[];
  tasks: TestTask[];
  coordination: CoordinationConfig;
}

/**
 * Test counts summary
 */
interface TestCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/**
 * Coverage information
 */
interface CoverageInfo {
  percentage: number;
}

/**
 * Result of executing a single test task
 */
interface TaskExecutionResult {
  id: string;
  type: TestTypeCategory;
  agent: string;
  status: TaskStatus;
  startTime: string;
  endTime: string | null;
  duration: number;
  tests: TestCounts;
  coverage: CoverageInfo | null;
  errors: string[];
}

/**
 * Result from running a test command
 */
interface TestCommandResult {
  success: boolean;
  results: TestCounts;
  coverage: CoverageInfo | null;
  errors: string[];
}

/**
 * Parsed test results from stdout
 */
interface ParsedTestResults {
  tests: TestCounts;
  coverage: CoverageInfo | null;
}

/**
 * Agent aggregation data
 */
interface AgentAggregation {
  tasks: number;
  tests: TestCounts;
  duration: number;
}

/**
 * Coverage aggregation details
 */
interface CoverageAggregation {
  overall: number;
  details: Record<string, unknown>;
}

/**
 * Aggregated results from all test executions
 */
interface AggregatedResults {
  summary: TestCounts & { duration: number };
  coverage: CoverageAggregation;
  agents: Record<string, AgentAggregation>;
  errors: string[];
  timestamp: string;
}

/**
 * Type guard to check if an error has a message property
 */
function isErrorWithMessage(error: unknown): error is { message: string; stack?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Type guard to validate task has required properties
 */
function isValidTask(task: unknown): task is TestTask {
  if (typeof task !== 'object' || task === null) return false;
  const t = task as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.type === 'string' &&
    typeof t.agent === 'string' &&
    typeof t.priority === 'number'
  );
}

export class RunCommand {
  static async execute(target: string, options: RunOptions): Promise<void> {
    console.log(chalk.blue.bold('\n⚡ Executing Test Suites with Parallel Orchestration\n'));

    try {
      const spinner = ora('Initializing test execution...').start();

      // Validate inputs
      await this.validateInputs(target, options);

      spinner.text = 'Preparing test environment...';

      // Setup execution environment
      const executionConfig = await this.prepareExecutionEnvironment(target, options);

      spinner.text = 'Orchestrating test agents...';

      // Orchestrate test execution agents
      await this.orchestrateTestAgents(executionConfig);

      spinner.text = 'Executing tests...';

      // Execute tests
      const results = await this.executeTests(executionConfig);

      spinner.text = 'Collecting results...';

      // Collect and aggregate results
      const aggregatedResults = await this.aggregateResults(results, options);

      spinner.succeed(chalk.green('Test execution completed successfully!'));

      // Display results summary
      this.displayExecutionSummary(aggregatedResults, options);

      // Store results and notify coordination
      await this.storeExecutionResults(aggregatedResults);

    } catch (error: unknown) {
      const errorMessage = isErrorWithMessage(error) ? error.message : String(error);
      const errorStack = isErrorWithMessage(error) ? error.stack : undefined;
      console.error(chalk.red('❌ Test execution failed:'), errorMessage);
      if (options.verbose && errorStack) {
        console.error(chalk.gray(errorStack));
      }
      ProcessExit.exitIfNotTest(1);
    }
  }

  private static async validateInputs(target: string, options: RunOptions): Promise<void> {
    const validTargets = ['tests', 'suite', 'regression', 'performance'];
    if (!validTargets.includes(target)) {
      throw new Error(`Invalid target '${target}'. Must be one of: ${validTargets.join(', ')}`);
    }

    const timeout = parseInt(options.timeout);
    if (timeout <= 0) {
      throw new Error('Timeout must be a positive number');
    }

    const retryCount = parseInt(options.retryFlaky);
    if (retryCount < 0) {
      throw new Error('Retry count must be non-negative');
    }

    const concurrency = parseInt(options.concurrency);
    if (concurrency <= 0) {
      throw new Error('Concurrency must be a positive number');
    }

    // Check if fleet configuration exists
    if (!await fs.pathExists('.agentic-qe/config/fleet.json')) {
      throw new Error('Fleet not initialized. Run: agentic-qe init');
    }

    // Check if tests exist
    const testDirs = ['tests', './tests', 'test', './test'];
    const hasTests = await Promise.all(testDirs.map(dir => fs.pathExists(dir)));
    if (!hasTests.some(exists => exists)) {
      throw new Error('No test directories found. Run: agentic-qe generate tests');
    }
  }

  private static async prepareExecutionEnvironment(target: string, options: RunOptions): Promise<ExecutionConfig> {
    // Load fleet configuration
    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json') as FleetConfig;
    const agentConfig = await fs.readJson('.agentic-qe/config/agents.json') as AgentConfigFile;

    // Load environment configuration
    const envConfigPath = `.agentic-qe/config/environments.json`;
    const envConfig: EnvironmentConfig = await fs.pathExists(envConfigPath)
      ? await fs.readJson(envConfigPath) as EnvironmentConfig
      : {};

    // Create execution directory
    const executionId = `exec-${Date.now()}`;
    const executionDir = `.agentic-qe/executions/${executionId}`;
    await fs.ensureDir(executionDir);

    const executionConfig: ExecutionConfig = {
      id: executionId,
      target: target as ExecutionTarget,
      fleet: fleetConfig,
      agents: agentConfig,
      environment: envConfig[options.env] || {},
      execution: {
        parallel: options.parallel,
        timeout: parseInt(options.timeout),
        retryCount: parseInt(options.retryFlaky),
        concurrency: parseInt(options.concurrency),
        reporter: options.reporter,
        coverage: options.coverage,
        suite: options.suite
      },
      timestamp: new Date().toISOString(),
      directory: executionDir
    };

    // Write execution configuration
    await fs.writeJson(`${executionDir}/config.json`, executionConfig, { spaces: 2 });

    return executionConfig;
  }

  private static async orchestrateTestAgents(config: ExecutionConfig): Promise<void> {
    const orchestrationPlan: OrchestrationPlan = {
      strategy: config.fleet.topology,
      agents: [],
      tasks: [],
      coordination: {
        parallel: config.execution.parallel,
        loadBalancing: true,
        faultTolerance: true
      }
    };

    // Assign test execution tasks to agents
    const testTypes = await this.discoverTestTypes();

    for (const testType of testTypes) {
      const agentType = this.selectOptimalAgent(testType);

      orchestrationPlan.tasks.push({
        id: `task-${testType}-${Date.now()}`,
        type: testType,
        agent: agentType,
        priority: this.getTaskPriority(testType, config.target),
        timeout: config.execution.timeout,
        retries: config.execution.retryCount
      });
    }

    // Store orchestration plan
    await fs.writeJson(`${config.directory}/orchestration.json`, orchestrationPlan, { spaces: 2 });

    // Generate coordination scripts
    await this.generateCoordinationScripts(config, orchestrationPlan);
  }

  private static async discoverTestTypes(): Promise<TestTypeCategory[]> {
    const testTypes: TestTypeCategory[] = [];
    const testDirs: Array<{ path: string; type: TestTypeCategory }> = [
      { path: 'tests/unit', type: 'unit' },
      { path: 'tests/integration', type: 'integration' },
      { path: 'tests/e2e', type: 'e2e' },
      { path: 'tests/performance', type: 'performance' },
      { path: 'tests/security', type: 'security' }
    ];

    for (const testDir of testDirs) {
      if (await fs.pathExists(testDir.path)) {
        const files = await fs.readdir(testDir.path);
        if (files.length > 0) {
          testTypes.push(testDir.type);
        }
      }
    }

    return testTypes;
  }

  private static selectOptimalAgent(testType: TestTypeCategory): string {
    const agentMapping: Record<TestTypeCategory, string> = {
      'unit': 'test-generator',
      'integration': 'test-generator',
      'e2e': 'visual-tester',
      'performance': 'performance-tester',
      'security': 'security-scanner'
    };

    return agentMapping[testType] || 'test-generator';
  }

  private static getTaskPriority(testType: TestTypeCategory, target: ExecutionTarget): number {
    const priorities: Record<ExecutionTarget, Record<TestTypeCategory, number>> = {
      'tests': { unit: 1, integration: 2, e2e: 3, performance: 4, security: 5 },
      'regression': { unit: 1, integration: 1, e2e: 2, performance: 3, security: 4 },
      'performance': { performance: 1, unit: 2, integration: 3, e2e: 4, security: 5 },
      'suite': { unit: 1, integration: 1, e2e: 1, performance: 1, security: 1 }
    };

    return priorities[target]?.[testType] || 3;
  }

  private static async generateCoordinationScripts(config: ExecutionConfig, _plan: OrchestrationPlan): Promise<void> {
    const scriptsDir = `${config.directory}/scripts`;
    await fs.ensureDir(scriptsDir);

    // Pre-execution script
    const preScript = `#!/bin/bash
# Pre-execution coordination
npx claude-flow@alpha hooks pre-task --description "Test execution: ${config.target}"
npx claude-flow@alpha memory store --key "agentic-qe/execution/config" --value '${JSON.stringify(config)}'
`;

    await fs.writeFile(`${scriptsDir}/pre-execution.sh`, preScript);
    await fs.chmod(`${scriptsDir}/pre-execution.sh`, '755');

    // Post-execution script
    const postScript = `#!/bin/bash
# Post-execution coordination
npx claude-flow@alpha hooks post-task --task-id "${config.id}"
npx claude-flow@alpha hooks notify --message "Test execution completed: ${config.target}"
`;

    await fs.writeFile(`${scriptsDir}/post-execution.sh`, postScript);
    await fs.chmod(`${scriptsDir}/post-execution.sh`, '755');
  }

  private static async executeTests(config: ExecutionConfig): Promise<TaskExecutionResult[]> {
    const results: TaskExecutionResult[] = [];

    if (config.execution.parallel) {
      // Parallel execution
      results.push(...await this.executeTestsParallel(config));
    } else {
      // Sequential execution
      results.push(...await this.executeTestsSequential(config));
    }

    return results;
  }

  private static async executeTestsParallel(config: ExecutionConfig): Promise<TaskExecutionResult[]> {
    const orchestration = await fs.readJson(`${config.directory}/orchestration.json`) as OrchestrationPlan;
    const results: TaskExecutionResult[] = [];

    // Execute coordination hooks
    await this.runCoordinationScript(`${config.directory}/scripts/pre-execution.sh`);

    // Group tasks by agent type for optimal resource usage
    const taskGroups = this.groupTasksByAgent(orchestration.tasks);

    const promises = Object.entries(taskGroups).map(async ([agentType, tasks]) => {
      return this.executeAgentTasks(agentType, tasks, config);
    });

    const agentResults = await Promise.all(promises);
    results.push(...agentResults.flat());

    // Execute post-coordination hooks
    await this.runCoordinationScript(`${config.directory}/scripts/post-execution.sh`);

    return results;
  }

  private static async executeTestsSequential(config: ExecutionConfig): Promise<TaskExecutionResult[]> {
    const orchestration = await fs.readJson(`${config.directory}/orchestration.json`) as OrchestrationPlan;
    const results: TaskExecutionResult[] = [];

    // Sort tasks by priority
    const sortedTasks = [...orchestration.tasks].sort((a, b) => a.priority - b.priority);

    for (const task of sortedTasks) {
      const taskResult = await this.executeTask(task, config);
      results.push(taskResult);
    }

    return results;
  }

  private static groupTasksByAgent(tasks: TestTask[]): Record<string, TestTask[]> {
    return tasks.reduce<Record<string, TestTask[]>>((groups, task) => {
      const agent = task.agent;
      if (!groups[agent]) {
        groups[agent] = [];
      }
      groups[agent].push(task);
      return groups;
    }, {});
  }

  private static async executeAgentTasks(_agentType: string, tasks: TestTask[], config: ExecutionConfig): Promise<TaskExecutionResult[]> {
    const results: TaskExecutionResult[] = [];

    for (const task of tasks) {
      const result = await this.executeTask(task, config);
      results.push(result);
    }

    return results;
  }

  private static async executeTask(task: TestTask, config: ExecutionConfig): Promise<TaskExecutionResult> {
    const startTime = new Date().toISOString();
    const taskResult: TaskExecutionResult = {
      id: task.id,
      type: task.type,
      agent: task.agent,
      status: 'pending',
      startTime,
      endTime: null,
      duration: 0,
      tests: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      coverage: null,
      errors: []
    };

    try {
      // Determine test command based on type and framework
      const testCommand = this.buildTestCommand(task, config);

      // Execute test command
      const execution = await this.runTestCommand(testCommand, config);

      taskResult.status = execution.success ? 'completed' : 'failed';
      taskResult.tests = execution.results;
      taskResult.coverage = execution.coverage;

      if (!execution.success) {
        taskResult.errors = execution.errors;
      }

    } catch (error: unknown) {
      taskResult.status = 'error';
      const errorMessage = isErrorWithMessage(error) ? error.message : String(error);
      taskResult.errors = [errorMessage];
    }

    const endTime = new Date().toISOString();
    taskResult.endTime = endTime;
    taskResult.duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    return taskResult;
  }

  private static buildTestCommand(task: TestTask, config: ExecutionConfig): string {
    const baseCommands: Record<string, string> = {
      'jest': 'npx jest',
      'mocha': 'npx mocha',
      'pytest': 'python -m pytest',
      'junit': 'mvn test'
    };

    // Get framework from fleet config
    const framework = config.fleet.frameworks?.[0] || 'jest';
    let command = baseCommands[framework] || baseCommands['jest'];

    // Add test pattern based on type
    const testPatterns: Record<TestTypeCategory, string> = {
      'unit': 'tests/unit/**/*.test.*',
      'integration': 'tests/integration/**/*.test.*',
      'e2e': 'tests/e2e/**/*.test.*',
      'performance': 'tests/performance/**/*.test.*',
      'security': 'tests/security/**/*.test.*'
    };

    if (testPatterns[task.type]) {
      command += ` ${testPatterns[task.type]}`;
    }

    // Add coverage if enabled
    if (config.execution.coverage) {
      if (framework === 'jest') {
        command += ' --coverage';
      } else if (framework === 'pytest') {
        command += ' --cov';
      }
    }

    // Add reporter
    if (config.execution.reporter === 'json') {
      if (framework === 'jest') {
        command += ' --json';
      }
    }

    // Add timeout
    if (framework === 'jest') {
      command += ` --testTimeout ${config.execution.timeout * 1000}`;
    }

    return command;
  }

  private static async runTestCommand(command: string, config: ExecutionConfig): Promise<TestCommandResult> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const results = this.parseTestResults(stdout, stderr);
        resolve({
          success: code === 0,
          results: results.tests,
          coverage: results.coverage,
          errors: code !== 0 ? [stderr] : []
        });
      });

      // Handle timeout
      setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          results: { total: 0, passed: 0, failed: 0, skipped: 0 },
          coverage: null,
          errors: ['Test execution timeout']
        });
      }, config.execution.timeout * 1000);
    });
  }

  private static parseTestResults(stdout: string, _stderr: string): ParsedTestResults {
    // Basic parsing - would be enhanced for specific frameworks
    const results: ParsedTestResults = {
      tests: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      coverage: null
    };

    // Simple regex patterns for common test output
    const passedMatch = stdout.match(/(\d+) passed/);
    const failedMatch = stdout.match(/(\d+) failed/);
    const skippedMatch = stdout.match(/(\d+) skipped/);

    if (passedMatch) results.tests.passed = parseInt(passedMatch[1]);
    if (failedMatch) results.tests.failed = parseInt(failedMatch[1]);
    if (skippedMatch) results.tests.skipped = parseInt(skippedMatch[1]);

    results.tests.total = results.tests.passed + results.tests.failed + results.tests.skipped;

    // Parse coverage if available
    const coverageMatch = stdout.match(/All files[^\n]*\|\s*(\d+\.?\d*)/);
    if (coverageMatch) {
      results.coverage = {
        percentage: parseFloat(coverageMatch[1])
      };
    }

    return results;
  }

  private static async runCoordinationScript(scriptPath: string): Promise<void> {
    if (await fs.pathExists(scriptPath)) {
      const { execSecure } = require('../../../security/secure-command-executor') as {
        execSecure: (command: string, callback: (error: Error | null) => void) => void;
      };
      return new Promise((resolve) => {
        // Validate the script path first
        const validatedPath = path.resolve(scriptPath);

        // Ensure the script is within allowed directories
        if (!validatedPath.includes('/coordination/') && !validatedPath.includes('/.claude/')) {
          console.warn(chalk.yellow(`  Script path not in allowed directory: ${scriptPath}`));
          resolve(undefined);
          return;
        }

        execSecure(`bash ${validatedPath}`, (error: Error | null) => {
          if (error) {
            console.warn(chalk.yellow(`  Coordination script warning: ${error.message}`));
          }
          resolve(undefined);
        });
      });
    }
  }

  private static async aggregateResults(results: TaskExecutionResult[], _options: RunOptions): Promise<AggregatedResults> {
    const aggregated: AggregatedResults = {
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0
      },
      coverage: {
        overall: 0,
        details: {}
      },
      agents: {},
      errors: [],
      timestamp: new Date().toISOString()
    };

    for (const result of results) {
      aggregated.summary.total += result.tests.total;
      aggregated.summary.passed += result.tests.passed;
      aggregated.summary.failed += result.tests.failed;
      aggregated.summary.skipped += result.tests.skipped;
      aggregated.summary.duration += result.duration;

      if (result.errors && result.errors.length > 0) {
        aggregated.errors.push(...result.errors);
      }

      // Aggregate by agent type
      if (!aggregated.agents[result.agent]) {
        aggregated.agents[result.agent] = {
          tasks: 0,
          tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
          duration: 0
        };
      }

      const agentData = aggregated.agents[result.agent];
      agentData.tasks++;
      agentData.tests.total += result.tests.total;
      agentData.tests.passed += result.tests.passed;
      agentData.tests.failed += result.tests.failed;
      agentData.tests.skipped += result.tests.skipped;
      agentData.duration += result.duration;
    }

    // Calculate overall coverage
    const coverageResults = results.filter((r): r is TaskExecutionResult & { coverage: CoverageInfo } => r.coverage !== null);
    if (coverageResults.length > 0) {
      const totalCoverage = coverageResults.reduce((sum, r) => sum + r.coverage.percentage, 0);
      aggregated.coverage.overall = totalCoverage / coverageResults.length;
    }

    return aggregated;
  }

  private static displayExecutionSummary(results: AggregatedResults, _options: RunOptions): void {
    console.log(chalk.yellow('\n Test Execution Summary:'));

    // Overall results
    const { summary } = results;
    const successRate = summary.total > 0 ? (summary.passed / summary.total * 100).toFixed(1) : '0';

    console.log(chalk.gray(`  Total Tests: ${summary.total}`));
    console.log(chalk.green(`  Passed: ${summary.passed}`));
    if (summary.failed > 0) {
      console.log(chalk.red(`  Failed: ${summary.failed}`));
    }
    if (summary.skipped > 0) {
      console.log(chalk.yellow(`  Skipped: ${summary.skipped}`));
    }
    console.log(chalk.gray(`  Success Rate: ${successRate}%`));
    console.log(chalk.gray(`  Duration: ${(summary.duration / 1000).toFixed(2)}s`));

    // Coverage
    if (results.coverage.overall > 0) {
      console.log(chalk.gray(`  Coverage: ${results.coverage.overall.toFixed(1)}%`));
    }

    // Agent performance
    if (Object.keys(results.agents).length > 0) {
      console.log(chalk.yellow('\n Agent Performance:'));
      Object.entries(results.agents).forEach(([agent, data]) => {
        console.log(chalk.gray(`  ${agent}: ${data.tasks} tasks, ${data.tests.total} tests`));
      });
    }

    // Errors
    if (results.errors.length > 0) {
      console.log(chalk.red('\n Errors:'));
      results.errors.slice(0, 5).forEach((error: string) => {
        console.log(chalk.gray(`  ${error}`));
      });
      if (results.errors.length > 5) {
        console.log(chalk.gray(`  ... and ${results.errors.length - 5} more errors`));
      }
    }

    // Next steps
    console.log(chalk.yellow('\n Next Steps:'));
    if (summary.failed > 0) {
      console.log(chalk.gray('  1. Review failed tests and fix issues'));
      console.log(chalk.gray('  2. Re-run failed tests: agentic-qe run tests --suite failed'));
    }
    if (results.coverage.overall < 80) {
      console.log(chalk.gray('  3. Improve coverage: agentic-qe analyze coverage --gaps'));
    }
    console.log(chalk.gray('  4. Analyze quality: agentic-qe analyze quality --metrics'));
  }

  private static async storeExecutionResults(results: AggregatedResults): Promise<void> {
    // Store results in reports directory
    const reportsDir = '.agentic-qe/reports';
    await fs.ensureDir(reportsDir);

    const reportFile = `${reportsDir}/execution-${Date.now()}.json`;
    await fs.writeJson(reportFile, results, { spaces: 2 });

    // Store in coordination memory
    const coordinationScript = `
npx claude-flow@alpha memory store --key "agentic-qe/execution/latest" --value '${JSON.stringify(results.summary)}'
npx claude-flow@alpha hooks notify --message "Test execution completed: ${results.summary.passed}/${results.summary.total} passed"
`;

    await fs.writeFile('.agentic-qe/scripts/store-execution-results.sh', coordinationScript);
    await fs.chmod('.agentic-qe/scripts/store-execution-results.sh', '755');

    // Execute coordination notification
    await this.runCoordinationScript('.agentic-qe/scripts/store-execution-results.sh');
  }
}