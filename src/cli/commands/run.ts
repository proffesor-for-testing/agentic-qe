import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import { RunOptions } from '../../types';

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

    } catch (error: any) {
      console.error(chalk.red('❌ Test execution failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
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

  private static async prepareExecutionEnvironment(target: string, options: RunOptions): Promise<any> {
    // Load fleet configuration
    const fleetConfig = await fs.readJson('.agentic-qe/config/fleet.json');
    const agentConfig = await fs.readJson('.agentic-qe/config/agents.json');

    // Load environment configuration
    const envConfigPath = `.agentic-qe/config/environments.json`;
    const envConfig = await fs.pathExists(envConfigPath)
      ? await fs.readJson(envConfigPath)
      : {};

    const executionConfig: any = {
      target,
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
      timestamp: new Date().toISOString()
    };

    // Create execution directory
    const executionId = `exec-${Date.now()}`;
    const executionDir = `.agentic-qe/executions/${executionId}`;
    await fs.ensureDir(executionDir);

    executionConfig.id = executionId;
    executionConfig.directory = executionDir;

    // Write execution configuration
    await fs.writeJson(`${executionDir}/config.json`, executionConfig, { spaces: 2 });

    return executionConfig;
  }

  private static async orchestrateTestAgents(config: any): Promise<void> {
    const orchestrationPlan: any = {
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
      const agentType = this.selectOptimalAgent(testType, config.agents);

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

  private static async discoverTestTypes(): Promise<string[]> {
    const testTypes = [];
    const testDirs = [
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

  private static selectOptimalAgent(testType: string, agentConfig: any): string {
    const agentMapping: Record<string, string> = {
      'unit': 'test-generator',
      'integration': 'test-generator',
      'e2e': 'visual-tester',
      'performance': 'performance-tester',
      'security': 'security-scanner'
    };

    return agentMapping[testType] || 'test-generator';
  }

  private static getTaskPriority(testType: string, target: string): number {
    const priorities: Record<string, Record<string, number>> = {
      'tests': { unit: 1, integration: 2, e2e: 3, performance: 4, security: 5 },
      'regression': { unit: 1, integration: 1, e2e: 2, performance: 3, security: 4 },
      'performance': { performance: 1, unit: 2, integration: 3, e2e: 4, security: 5 },
      'suite': { unit: 1, integration: 1, e2e: 1, performance: 1, security: 1 }
    };

    return priorities[target]?.[testType] || 3;
  }

  private static async generateCoordinationScripts(config: any, plan: any): Promise<void> {
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

  private static async executeTests(config: any): Promise<any[]> {
    const results = [];

    if (config.execution.parallel) {
      // Parallel execution
      results.push(...await this.executeTestsParallel(config));
    } else {
      // Sequential execution
      results.push(...await this.executeTestsSequential(config));
    }

    return results;
  }

  private static async executeTestsParallel(config: any): Promise<any[]> {
    const orchestration = await fs.readJson(`${config.directory}/orchestration.json`);
    const results = [];

    // Execute coordination hooks
    await this.runCoordinationScript(`${config.directory}/scripts/pre-execution.sh`);

    // Group tasks by agent type for optimal resource usage
    const taskGroups = this.groupTasksByAgent(orchestration.tasks);

    const promises = Object.entries(taskGroups).map(async ([agentType, tasks]) => {
      return this.executeAgentTasks(agentType, tasks as any[], config);
    });

    const agentResults = await Promise.all(promises);
    results.push(...agentResults.flat());

    // Execute post-coordination hooks
    await this.runCoordinationScript(`${config.directory}/scripts/post-execution.sh`);

    return results;
  }

  private static async executeTestsSequential(config: any): Promise<any[]> {
    const orchestration = await fs.readJson(`${config.directory}/orchestration.json`);
    const results = [];

    // Sort tasks by priority
    const sortedTasks = orchestration.tasks.sort((a: any, b: any) => a.priority - b.priority);

    for (const task of sortedTasks) {
      const taskResult = await this.executeTask(task, config);
      results.push(taskResult);
    }

    return results;
  }

  private static groupTasksByAgent(tasks: any[]): Record<string, any[]> {
    return tasks.reduce((groups, task) => {
      const agent = task.agent;
      if (!groups[agent]) {
        groups[agent] = [];
      }
      groups[agent].push(task);
      return groups;
    }, {} as Record<string, any[]>);
  }

  private static async executeAgentTasks(agentType: string, tasks: any[], config: any): Promise<any[]> {
    const results = [];

    for (const task of tasks) {
      const result = await this.executeTask(task, config);
      results.push(result);
    }

    return results;
  }

  private static async executeTask(task: any, config: any): Promise<any> {
    const taskResult = {
      id: task.id,
      type: task.type,
      agent: task.agent,
      status: 'pending',
      startTime: new Date().toISOString(),
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

    } catch (error: any) {
      taskResult.status = 'error';
      (taskResult as any).errors = [error.message];
    }

    (taskResult as any).endTime = new Date().toISOString();
    (taskResult as any).duration = new Date((taskResult as any).endTime).getTime() - new Date(taskResult.startTime).getTime();

    return taskResult;
  }

  private static buildTestCommand(task: any, config: any): string {
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
    const testPatterns: Record<string, string> = {
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

  private static async runTestCommand(command: string, config: any): Promise<any> {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const results = this.parseTestResults(stdout, stderr, config);
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

  private static parseTestResults(stdout: string, stderr: string, config: any): any {
    // Basic parsing - would be enhanced for specific frameworks
    const results = {
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
      (results as any).coverage = {
        percentage: parseFloat(coverageMatch[1])
      };
    }

    return results;
  }

  private static async runCoordinationScript(scriptPath: string): Promise<void> {
    if (await fs.pathExists(scriptPath)) {
      const { execSecure } = require('../../../security/secure-command-executor');
      return new Promise((resolve, reject) => {
        // Validate the script path first
        const path = require('path');
        const validatedPath = path.resolve(scriptPath);

        // Ensure the script is within allowed directories
        if (!validatedPath.includes('/coordination/') && !validatedPath.includes('/.claude/')) {
          console.warn(chalk.yellow(`⚠️  Script path not in allowed directory: ${scriptPath}`));
          resolve(undefined);
          return;
        }

        execSecure(`bash ${validatedPath}`, (error: any) => {
          if (error) {
            console.warn(chalk.yellow(`⚠️  Coordination script warning: ${error.message}`));
          }
          resolve(undefined);
        });
      });
    }
  }

  private static async aggregateResults(results: any[], options: RunOptions): Promise<any> {
    const aggregated: any = {
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

      const agentData: any = aggregated.agents[result.agent];
      agentData.tasks++;
      agentData.tests.total += result.tests.total;
      agentData.tests.passed += result.tests.passed;
      agentData.tests.failed += result.tests.failed;
      agentData.tests.skipped += result.tests.skipped;
      agentData.duration += result.duration;
    }

    // Calculate overall coverage
    const coverageResults = results.filter(r => r.coverage);
    if (coverageResults.length > 0) {
      const totalCoverage = coverageResults.reduce((sum, r) => sum + r.coverage.percentage, 0);
      aggregated.coverage.overall = totalCoverage / coverageResults.length;
    }

    return aggregated;
  }

  private static displayExecutionSummary(results: any, options: RunOptions): void {
    console.log(chalk.yellow('\n📊 Test Execution Summary:'));

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
      console.log(chalk.yellow('\n🤖 Agent Performance:'));
      Object.entries(results.agents).forEach(([agent, data]: [string, any]) => {
        console.log(chalk.gray(`  ${agent}: ${data.tasks} tasks, ${data.tests.total} tests`));
      });
    }

    // Errors
    if (results.errors.length > 0) {
      console.log(chalk.red('\n❌ Errors:'));
      results.errors.slice(0, 5).forEach((error: string) => {
        console.log(chalk.gray(`  ${error}`));
      });
      if (results.errors.length > 5) {
        console.log(chalk.gray(`  ... and ${results.errors.length - 5} more errors`));
      }
    }

    // Next steps
    console.log(chalk.yellow('\n💡 Next Steps:'));
    if (summary.failed > 0) {
      console.log(chalk.gray('  1. Review failed tests and fix issues'));
      console.log(chalk.gray('  2. Re-run failed tests: agentic-qe run tests --suite failed'));
    }
    if (results.coverage.overall < 80) {
      console.log(chalk.gray('  3. Improve coverage: agentic-qe analyze coverage --gaps'));
    }
    console.log(chalk.gray('  4. Analyze quality: agentic-qe analyze quality --metrics'));
  }

  private static async storeExecutionResults(results: any): Promise<void> {
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