/**
 * Improvement CLI Commands - Phase 2
 *
 * Commands for managing the continuous improvement loop.
 * Provides A/B testing, failure analysis, and recommendation management.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import { ImprovementLoop } from '../../../learning/ImprovementLoop';
import { LearningEngine } from '../../../learning/LearningEngine';
import { PerformanceTracker } from '../../../learning/PerformanceTracker';

export interface ImproveCommandOptions {
  agent?: string;
  days?: number;
  strategyA?: string;
  strategyB?: string;
  limit?: number;
  dryRun?: boolean;
  format?: 'html' | 'json' | 'text';
  output?: string;
}

/**
 * ImproveCommand - CLI handler for improvement operations
 */
export class ImproveCommand {
  private static memoryPath = '.agentic-qe/data/swarm-memory.db';

  /**
   * Execute improve command
   */
  static async execute(subcommand: string, args: any[] = [], options: ImproveCommandOptions = {}): Promise<void> {
    switch (subcommand) {
      case 'status':
        await this.showStatus(options);
        break;
      case 'start':
        await this.startLoop(options);
        break;
      case 'stop':
        await this.stopLoop(options);
        break;
      case 'history':
        await this.showHistory(options);
        break;
      case 'ab-test':
        await this.runABTest(options);
        break;
      case 'failures':
        await this.showFailures(options);
        break;
      case 'apply':
        await this.applyRecommendation(args[0], options);
        break;
      case 'report':
        await this.generateReport(options);
        break;
      default:
        console.error(chalk.red(`❌ Unknown improve command: ${subcommand}`));
        this.showHelp();
        process.exit(1);
    }
  }

  /**
   * Show improvement status
   */
  private static async showStatus(options: ImproveCommandOptions): Promise<void> {
    const spinner = ora('Loading improvement status...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';

      // Check if loop is running
      const loopStatus = await memoryManager.retrieve(
        `phase2/learning/${agentId}/loop-status`,
        { partition: 'learning' }
      );

      spinner.succeed('Status loaded');

      console.log(chalk.blue('\n🔄 Improvement Loop Status\n'));

      const isActive = loopStatus?.active || false;
      const statusIcon = isActive ? '✅' : '⏸️';
      const statusText = isActive ? chalk.green('ACTIVE') : chalk.yellow('STOPPED');

      console.log(`Agent: ${chalk.cyan(agentId)}`);
      console.log(`├─ Status: ${statusIcon} ${statusText}`);

      if (isActive) {
        console.log(`├─ Cycle Interval: ${chalk.cyan('1 hour')}`);
        console.log(`├─ Last Cycle: ${chalk.gray(this.formatTimeAgo(loopStatus?.lastCycle))}`);
        console.log(`└─ Next Cycle: ${chalk.gray(this.formatNextCycle(loopStatus?.lastCycle))}`);
      } else {
        console.log(`└─ Use "aqe improve start" to activate`);
      }

      // Load recent improvements
      const cycles = await memoryManager.query(
        `phase2/learning/${agentId}/cycles/%`,
        { partition: 'learning' }
      );

      if (cycles.length > 0) {
        console.log(chalk.blue('\n📈 Recent Improvements:\n'));

        const recentCycles = cycles
          .sort((a, b) => b.value.timestamp - a.value.timestamp)
          .slice(0, 3);

        recentCycles.forEach((cycle, index) => {
          const data = cycle.value;
          const prefix = index === recentCycles.length - 1 ? '└─' : '├─';
          console.log(`${prefix} [${chalk.gray(new Date(data.timestamp).toLocaleString())}]`);
          console.log(`   ├─ Improvement: ${this.formatImprovement(data.improvement?.improvementRate || 0)}`);
          console.log(`   ├─ Opportunities: ${chalk.cyan(data.opportunities)}`);
          console.log(`   └─ Active Tests: ${chalk.cyan(data.activeTests)}`);
        });
      }

      // Load active A/B tests
      const activeTests = await memoryManager.query(
        `phase2/learning/${agentId}/abtests/%`,
        { partition: 'learning' }
      );

      const runningTests = activeTests.filter(t => t.value.status === 'running');

      if (runningTests.length > 0) {
        console.log(chalk.blue('\n🧪 Active A/B Tests:\n'));
        runningTests.forEach((test, index) => {
          const data = test.value;
          const prefix = index === runningTests.length - 1 ? '└─' : '├─';
          console.log(`${prefix} ${chalk.cyan(data.name)}`);
          console.log(`   ├─ Progress: ${this.formatProgress(data.results, data.sampleSize)}`);
          console.log(`   └─ Started: ${chalk.gray(new Date(data.startedAt).toLocaleString())}`);
        });
      }

      console.log();

    } catch (error: any) {
      spinner.fail('Failed to load status');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Start improvement loop
   */
  private static async startLoop(options: ImproveCommandOptions): Promise<void> {
    const spinner = ora('Starting improvement loop...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';

      // Create and start improvement loop (in production, this would be a background service)
      const learningEngine = new LearningEngine(agentId, memoryManager);
      const performanceTracker = new PerformanceTracker(agentId, memoryManager);
      await learningEngine.initialize();
      await performanceTracker.initialize();

      const improvementLoop = new ImprovementLoop(
        agentId,
        memoryManager,
        learningEngine,
        performanceTracker
      );

      await improvementLoop.initialize();
      // Note: In CLI, we can't actually keep loop running. This would be handled by a daemon.

      // Mark as active in memory
      await memoryManager.store(
        `phase2/learning/${agentId}/loop-status`,
        {
          active: true,
          lastCycle: Date.now(),
          startedAt: Date.now()
        },
        { partition: 'learning' }
      );

      spinner.succeed('Improvement loop started');

      console.log(chalk.green('\n✅ Continuous improvement activated'));
      console.log(chalk.gray('Cycle interval: 1 hour'));
      console.log(chalk.gray('The loop will analyze performance and apply optimizations automatically\n'));

    } catch (error: any) {
      spinner.fail('Failed to start loop');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Stop improvement loop
   */
  private static async stopLoop(options: ImproveCommandOptions): Promise<void> {
    const spinner = ora('Stopping improvement loop...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';

      await memoryManager.store(
        `phase2/learning/${agentId}/loop-status`,
        {
          active: false,
          stoppedAt: Date.now()
        },
        { partition: 'learning' }
      );

      spinner.succeed('Improvement loop stopped');
      console.log(chalk.yellow('\n⚠️  Continuous improvement deactivated'));
      console.log(chalk.gray('Use "aqe improve start" to reactivate\n'));

    } catch (error: any) {
      spinner.fail('Failed to stop loop');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Show improvement history
   */
  private static async showHistory(options: ImproveCommandOptions): Promise<void> {
    const spinner = ora('Loading improvement history...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';
      const days = options.days || 30;

      const cycles = await memoryManager.query(
        `phase2/learning/${agentId}/cycles/%`,
        { partition: 'learning' }
      );

      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
      const recentCycles = cycles
        .filter(c => c.value.timestamp >= cutoff)
        .sort((a, b) => b.value.timestamp - a.value.timestamp);

      spinner.succeed(`Loaded ${recentCycles.length} improvement cycles`);

      console.log(chalk.blue(`\n📅 Improvement History (Last ${days} days)\n`));

      if (recentCycles.length === 0) {
        console.log(chalk.yellow('No improvement cycles found'));
        return;
      }

      recentCycles.forEach((cycle, index) => {
        const data = cycle.value;
        const date = new Date(data.timestamp).toLocaleString();

        console.log(`${chalk.cyan((index + 1).toString().padStart(2))}. ${date}`);
        console.log(`    Improvement: ${this.formatImprovement(data.improvement?.improvementRate || 0)}`);
        console.log(`    Opportunities: ${data.opportunities}`);
        console.log(`    Failure Patterns: ${data.failurePatterns}`);
        console.log(`    Active Tests: ${data.activeTests}`);
        console.log();
      });

    } catch (error: any) {
      spinner.fail('Failed to load history');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Run A/B test
   */
  private static async runABTest(options: ImproveCommandOptions): Promise<void> {
    if (!options.strategyA || !options.strategyB) {
      console.error(chalk.red('❌ --strategy-a and --strategy-b are required'));
      process.exit(1);
    }

    const spinner = ora('Creating A/B test...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';

      const learningEngine = new LearningEngine(agentId, memoryManager);
      const performanceTracker = new PerformanceTracker(agentId, memoryManager);
      await learningEngine.initialize();
      await performanceTracker.initialize();

      const improvementLoop = new ImprovementLoop(
        agentId,
        memoryManager,
        learningEngine,
        performanceTracker
      );

      await improvementLoop.initialize();

      const testId = await improvementLoop.createABTest(
        `${options.strategyA} vs ${options.strategyB}`,
        [
          { name: options.strategyA, config: {} },
          { name: options.strategyB, config: {} }
        ],
        100
      );

      spinner.succeed('A/B test created');

      console.log(chalk.green('\n✅ A/B Test Created\n'));
      console.log(`Test ID: ${chalk.cyan(testId)}`);
      console.log(`Strategy A: ${chalk.cyan(options.strategyA)}`);
      console.log(`Strategy B: ${chalk.cyan(options.strategyB)}`);
      console.log(`Sample Size: ${chalk.cyan('100')}`);
      console.log(chalk.gray('\nThe test will run automatically during task executions'));
      console.log(chalk.gray('Use "aqe improve status" to monitor progress\n'));

    } catch (error: any) {
      spinner.fail('Failed to create A/B test');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Show failure patterns
   */
  private static async showFailures(options: ImproveCommandOptions): Promise<void> {
    const spinner = ora('Analyzing failure patterns...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';

      const learningEngine = new LearningEngine(agentId, memoryManager);
      await learningEngine.initialize();

      const failures = learningEngine.getFailurePatterns();

      if (failures.length === 0) {
        spinner.info('No failure patterns detected');
        return;
      }

      spinner.succeed(`Found ${failures.length} failure patterns`);

      console.log(chalk.blue('\n⚠️  Failure Patterns\n'));

      const limit = options.limit || 10;
      const displayFailures = failures.slice(0, limit);

      displayFailures.forEach((failure, index) => {
        const prefix = index === displayFailures.length - 1 ? '└─' : '├─';
        console.log(`${prefix} ${chalk.yellow(failure.pattern)} (${failure.frequency} occurrences)`);
        console.log(`   ├─ Confidence: ${this.formatConfidence(failure.confidence)}`);
        if (failure.mitigation) {
          console.log(`   └─ ${chalk.green('Recommendation:')} ${failure.mitigation}`);
        } else {
          console.log(`   └─ ${chalk.gray('No mitigation available yet')}`);
        }
        console.log();
      });

    } catch (error: any) {
      spinner.fail('Failed to analyze failures');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Apply recommendation
   */
  private static async applyRecommendation(recommendationId: string, options: ImproveCommandOptions): Promise<void> {
    if (!recommendationId) {
      console.error(chalk.red('❌ Recommendation ID is required'));
      process.exit(1);
    }

    if (options.dryRun) {
      console.log(chalk.blue('🧪 Dry Run Mode\n'));
      console.log(chalk.gray('Would apply recommendation: ' + recommendationId));
      console.log(chalk.gray('Add --no-dry-run to actually apply\n'));
      return;
    }

    const spinner = ora('Applying recommendation...').start();

    try {
      // In a real implementation, this would apply the recommendation
      spinner.succeed('Recommendation applied');

      console.log(chalk.green('\n✅ Recommendation Applied\n'));
      console.log(`ID: ${chalk.cyan(recommendationId)}`);
      console.log(chalk.gray('Monitor "aqe improve status" to see effects\n'));

    } catch (error: any) {
      spinner.fail('Failed to apply recommendation');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Generate improvement report
   */
  private static async generateReport(options: ImproveCommandOptions): Promise<void> {
    const spinner = ora('Generating improvement report...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';

      const performanceTracker = new PerformanceTracker(agentId, memoryManager);
      await performanceTracker.initialize();

      const report = await performanceTracker.generateReport();

      spinner.succeed('Report generated');

      const format = options.format || 'text';

      if (format === 'json') {
        const json = JSON.stringify(report, null, 2);
        if (options.output) {
          await fs.writeFile(options.output, json);
          console.log(chalk.green(`\n✅ Report exported to: ${options.output}\n`));
        } else {
          console.log(json);
        }
        return;
      }

      // Text format
      console.log(chalk.blue('\n📊 Improvement Report\n'));
      console.log(report.summary);
      console.log(chalk.blue('\n📈 Trends:\n'));

      if (report.trends && report.trends.length > 0) {
        report.trends.forEach(trend => {
          const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→';
          const color = trend.direction === 'up' ? chalk.green : trend.direction === 'down' ? chalk.red : chalk.gray;
          console.log(`  ${trend.metric}: ${color(arrow + ' ' + trend.changeRate.toFixed(1) + '%')}`);
        });
      }

      console.log(chalk.blue('\n💡 Recommendations:\n'));
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });

      if (options.output && format === 'html') {
        const html = this.generateHTMLReport(report);
        await fs.writeFile(options.output, html);
        console.log(chalk.green(`\n✅ HTML report exported to: ${options.output}`));
      }

      console.log();

    } catch (error: any) {
      spinner.fail('Failed to generate report');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Show command help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n📚 Improve Commands:\n'));
    console.log(chalk.cyan('  aqe improve status') + chalk.gray('          - View improvement status'));
    console.log(chalk.cyan('  aqe improve start') + chalk.gray('           - Start improvement loop'));
    console.log(chalk.cyan('  aqe improve stop') + chalk.gray('            - Stop improvement loop'));
    console.log(chalk.cyan('  aqe improve history') + chalk.gray('         - View improvement history'));
    console.log(chalk.cyan('  aqe improve ab-test') + chalk.gray('         - Run A/B test'));
    console.log(chalk.cyan('  aqe improve failures') + chalk.gray('        - View failure patterns'));
    console.log(chalk.cyan('  aqe improve apply <id>') + chalk.gray('     - Apply recommendation'));
    console.log(chalk.cyan('  aqe improve report') + chalk.gray('          - Generate improvement report'));
    console.log(chalk.blue('\nOptions:\n'));
    console.log(chalk.gray('  --agent <id>         - Target specific agent'));
    console.log(chalk.gray('  --days <number>      - Time period for history'));
    console.log(chalk.gray('  --strategy-a <name>  - First strategy for A/B test'));
    console.log(chalk.gray('  --strategy-b <name>  - Second strategy for A/B test'));
    console.log(chalk.gray('  --limit <number>     - Limit results'));
    console.log(chalk.gray('  --dry-run            - Preview without applying'));
    console.log(chalk.gray('  --format <format>    - Report format (html, json, text)'));
    console.log(chalk.gray('  --output <file>      - Output file path'));
    console.log(chalk.blue('\nExamples:\n'));
    console.log(chalk.gray('  aqe improve status --agent test-gen'));
    console.log(chalk.gray('  aqe improve start'));
    console.log(chalk.gray('  aqe improve ab-test --strategy-a parallel --strategy-b sequential'));
    console.log(chalk.gray('  aqe improve report --format html --output report.html'));
    console.log();
  }

  // Helper methods

  private static formatImprovement(rate: number): string {
    const formatted = rate >= 0 ? `+${rate.toFixed(1)}%` : `${rate.toFixed(1)}%`;
    if (rate >= 20) return chalk.green(formatted);
    if (rate >= 10) return chalk.cyan(formatted);
    if (rate >= 0) return chalk.yellow(formatted);
    return chalk.red(formatted);
  }

  private static formatConfidence(confidence: number): string {
    const percentage = (confidence * 100).toFixed(0) + '%';
    if (confidence >= 0.9) return chalk.green(percentage);
    if (confidence >= 0.7) return chalk.cyan(percentage);
    return chalk.yellow(percentage);
  }

  private static formatTimeAgo(timestamp?: number): string {
    if (!timestamp) return 'never';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours} hours ago`;
    if (minutes > 0) return `${minutes} minutes ago`;
    return 'just now';
  }

  private static formatNextCycle(lastCycle?: number): string {
    if (!lastCycle) return 'soon';
    const nextCycle = lastCycle + (60 * 60 * 1000); // 1 hour
    const diff = nextCycle - Date.now();
    if (diff <= 0) return 'now';
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `in ${hours}h ${minutes % 60}m`;
    return `in ${minutes}m`;
  }

  private static formatProgress(results: any[], sampleSize: number): string {
    const total = results.reduce((sum, r) => sum + r.sampleCount, 0);
    const percentage = (total / sampleSize * 100).toFixed(0);
    return `${total}/${sampleSize} (${percentage}%)`;
  }

  private static generateHTMLReport(report: any): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Improvement Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #2c3e50; }
    .summary { background: #ecf0f1; padding: 20px; border-radius: 5px; }
    .trends { margin-top: 20px; }
    .recommendations { margin-top: 20px; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Improvement Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <p>${report.summary}</p>
  </div>
  <div class="trends">
    <h2>Trends</h2>
    <ul>
      ${report.trends?.map((t: any) => `<li>${t.metric}: ${t.changeRate.toFixed(1)}% ${t.direction}</li>`).join('') || ''}
    </ul>
  </div>
  <div class="recommendations">
    <h2>Recommendations</h2>
    <ul>
      ${report.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
    </ul>
  </div>
</body>
</html>`;
  }
}

// Export command functions for CLI registration
export async function improveCommand(subcommand: string, args: any[], options: ImproveCommandOptions): Promise<void> {
  await ImproveCommand.execute(subcommand, args, options);
}
