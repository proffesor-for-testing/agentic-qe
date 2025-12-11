/**
 * Learning CLI Commands - Phase 2
 *
 * Commands for managing the LearningEngine and viewing learning status.
 * Provides comprehensive learning management functionality.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import { getSharedMemoryManager, initializeSharedMemoryManager } from '../../../core/memory/MemoryManagerFactory';
import { LearningEngine } from '../../../learning/LearningEngine';
import { PerformanceTracker } from '../../../learning/PerformanceTracker';
import { ProcessExit } from '../../../utils/ProcessExit';
import { MetricsCollector, TrendAnalyzer, AlertManager, TrendPeriod } from '../../../learning/metrics';
import { MetricsDashboard } from '../../../learning/dashboard';

export interface LearnCommandOptions {
  agent?: string;
  detailed?: boolean;
  limit?: number;
  confirm?: boolean;
  output?: string;
  task?: string;
  all?: boolean;
  period?: string;
  format?: 'table' | 'json';
  metric?: string;
  ack?: string;
}

/**
 * LearningCommand - CLI handler for learning operations
 *
 * Uses shared memory manager singleton to ensure all CLI, MCP, and agent
 * operations use the same database (.agentic-qe/memory.db).
 */
export class LearningCommand {
  /**
   * Get the shared memory manager singleton.
   * All persistence now goes to .agentic-qe/memory.db
   */
  private static async getMemoryManager(): Promise<SwarmMemoryManager> {
    return initializeSharedMemoryManager();
  }

  /**
   * Execute learning command
   */
  static async execute(subcommand: string, options: LearnCommandOptions = {}): Promise<void> {
    switch (subcommand) {
      case 'status':
        await this.showStatus(options);
        break;
      case 'enable':
        await this.enableLearning(options);
        break;
      case 'disable':
        await this.disableLearning(options);
        break;
      case 'history':
        await this.showHistory(options);
        break;
      case 'train':
        await this.manualTrain(options);
        break;
      case 'reset':
        await this.resetLearning(options);
        break;
      case 'export':
        await this.exportLearningData(options);
        break;
      case 'metrics':
        await this.showMetrics(options);
        break;
      case 'trends':
        await this.showTrends(options);
        break;
      case 'alerts':
        await this.showAlerts(options);
        break;
      default:
        console.error(chalk.red(`❌ Unknown learn command: ${subcommand}`));
        this.showHelp();
        ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show learning status
   */
  private static async showStatus(options: LearnCommandOptions): Promise<void> {
    const spinner = ora('Loading learning status...').start();

    try {
      const memoryManager = await this.getMemoryManager();
      const agentId = options.agent;

      // Query actual database tables for learning data
      // ARCHITECTURE (v2.2.0): Data is stored in dedicated tables, not memory_entries
      const experiencesQuery = agentId
        ? 'SELECT * FROM learning_experiences WHERE agent_id = ? ORDER BY created_at DESC'
        : 'SELECT * FROM learning_experiences ORDER BY created_at DESC';
      const experiences = memoryManager.queryRaw<any>(experiencesQuery, agentId ? [agentId] : []);

      const qValuesQuery = agentId
        ? 'SELECT * FROM q_values WHERE agent_id = ?'
        : 'SELECT * FROM q_values';
      const qValues = memoryManager.queryRaw<any>(qValuesQuery, agentId ? [agentId] : []);

      const patternsQuery = agentId
        ? 'SELECT * FROM patterns WHERE agent_id = ? ORDER BY confidence DESC'
        : 'SELECT * FROM patterns ORDER BY confidence DESC';
      const patterns = memoryManager.queryRaw<any>(patternsQuery, agentId ? [agentId] : []);

      // Check if any learning data exists
      if (experiences.length === 0 && qValues.length === 0 && patterns.length === 0) {
        // Fall back to legacy state check
        const learningState = await memoryManager.retrieve(
          `phase2/learning/${agentId || 'default'}/state`,
          { partition: 'learning' }
        );

        if (!learningState) {
          spinner.fail('No learning data available');
          console.log(chalk.yellow('\n💡 Run "aqe init" to initialize the fleet and enable learning'));
          return;
        }
      }

      spinner.succeed('Learning status loaded');

      console.log(chalk.blue('\n🧠 Learning Engine Status\n'));

      // Calculate aggregated stats from actual data
      const totalExperiences = experiences.length;
      const avgReward = totalExperiences > 0
        ? experiences.reduce((sum: number, e: any) => sum + (e.reward || 0), 0) / totalExperiences
        : 0;
      const successCount = experiences.filter((e: any) => e.reward > 0.5).length;
      const successRate = totalExperiences > 0 ? successCount / totalExperiences : 0;

      // Get unique agents
      const uniqueAgents = [...new Set(experiences.map((e: any) => e.agent_id))];

      console.log(chalk.cyan(`Agents with learning data: ${uniqueAgents.length}`));
      if (agentId) {
        console.log(chalk.gray(`  (filtered to: ${agentId})`));
      }
      console.log(`├─ Total Experiences: ${chalk.cyan(totalExperiences.toLocaleString())}`);
      console.log(`├─ Q-Value Entries: ${chalk.cyan(qValues.length.toLocaleString())}`);
      console.log(`├─ Patterns Stored: ${chalk.cyan(patterns.length.toLocaleString())}`);
      console.log(`├─ Avg Reward: ${this.formatReward(avgReward)}`);
      console.log(`└─ Success Rate: ${chalk.green((successRate * 100).toFixed(1) + '%')}`);

      // Show top agents by experience count
      if (uniqueAgents.length > 0 && !agentId) {
        console.log(chalk.blue('\n👥 Top Agents by Experience:\n'));
        const agentCounts = uniqueAgents.map(agent => ({
          agent,
          count: experiences.filter((e: any) => e.agent_id === agent).length
        })).sort((a, b) => b.count - a.count).slice(0, 5);

        agentCounts.forEach((item, index) => {
          const prefix = index === agentCounts.length - 1 ? '└─' : '├─';
          console.log(`${prefix} ${item.agent}: ${chalk.cyan(item.count)} experiences`);
        });
      }

      // Top patterns by confidence
      if (patterns.length > 0) {
        console.log(chalk.blue('\n🎯 Top Patterns by Confidence:\n'));
        const topPatterns = patterns.slice(0, 5);

        topPatterns.forEach((pattern: any, index: number) => {
          const prefix = index === topPatterns.length - 1 ? '└─' : '├─';
          const patternName = pattern.id || pattern.pattern?.substring(0, 30) || 'unnamed';
          console.log(`${prefix} ${patternName} (confidence: ${chalk.cyan((pattern.confidence * 100).toFixed(1) + '%')})`);
        });
      }

      // Recent activity
      if (experiences.length > 0) {
        const latestExp = experiences[0];
        const latestDate = latestExp.created_at
          ? new Date(latestExp.created_at).toLocaleString()
          : 'unknown';
        console.log(chalk.blue('\n📅 Recent Activity:\n'));
        console.log(`└─ Last experience: ${chalk.gray(latestDate)}`);
      }

      if (options.detailed && experiences.length > 0) {
        console.log(chalk.blue('\n📈 Detailed Task Types:\n'));
        const taskTypes = [...new Set(experiences.map((e: any) => e.task_type))];
        taskTypes.slice(0, 5).forEach((taskType, index) => {
          const count = experiences.filter((e: any) => e.task_type === taskType).length;
          const prefix = index === taskTypes.slice(0, 5).length - 1 ? '└─' : '├─';
          console.log(`${prefix} ${taskType}: ${chalk.cyan(count)} experiences`);
        });
      }

      console.log();

    } catch (error: any) {
      spinner.fail('Failed to load learning status');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Enable learning for agent(s)
   */
  private static async enableLearning(options: LearnCommandOptions): Promise<void> {
    const spinner = ora('Enabling learning...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      if (options.all) {
        // Enable for all agents
        const allStates = await memoryManager.query('phase2/learning/%/config', {
          partition: 'learning'
        });

        for (const entry of allStates) {
          const config = entry.value as any;
          config.enabled = true;
          await memoryManager.store(entry.key, config, { partition: 'learning' });
        }

        spinner.succeed(`Learning enabled for ${allStates.length} agents`);
      } else {
        const agentId = options.agent || 'default';
        const config = await memoryManager.retrieve(
          `phase2/learning/${agentId}/config`,
          { partition: 'learning' }
        );

        if (!config) {
          spinner.fail('Agent not found');
          console.log(chalk.yellow('💡 Run "aqe init" first to initialize the fleet'));
          return;
        }

        (config as any).enabled = true;
        await memoryManager.store(
          `phase2/learning/${agentId}/config`,
          config,
          { partition: 'learning' }
        );

        spinner.succeed(`Learning enabled for agent: ${agentId}`);
      }

      console.log(chalk.green('\n✅ Agents will now learn from task executions'));
      console.log(chalk.gray('Use "aqe learn status" to monitor progress\n'));

    } catch (error: any) {
      spinner.fail('Failed to enable learning');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Disable learning for agent(s)
   */
  private static async disableLearning(options: LearnCommandOptions): Promise<void> {
    const spinner = ora('Disabling learning...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      const agentId = options.agent || 'default';
      const config = await memoryManager.retrieve(
        `phase2/learning/${agentId}/config`,
        { partition: 'learning' }
      );

      if (!config) {
        spinner.fail('Agent not found');
        return;
      }

      (config as any).enabled = false;
      await memoryManager.store(
        `phase2/learning/${agentId}/config`,
        config,
        { partition: 'learning' }
      );

      spinner.succeed(`Learning disabled for agent: ${agentId}`);
      console.log(chalk.yellow('\n⚠️  Agent will no longer learn from new experiences'));
      console.log(chalk.gray('Existing learned patterns are preserved\n'));

    } catch (error: any) {
      spinner.fail('Failed to disable learning');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show learning history
   */
  private static async showHistory(options: LearnCommandOptions): Promise<void> {
    const spinner = ora('Loading learning history...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      const agentId = options.agent || 'default';
      const limit = options.limit || 20;

      const learningState = await memoryManager.retrieve(
        `phase2/learning/${agentId}/state`,
        { partition: 'learning' }
      );

      if (!learningState) {
        spinner.fail('No learning history available');
        return;
      }

      const experiences = (learningState as any).experiences || [];
      const recentExperiences = experiences.slice(-limit);

      spinner.succeed('Learning history loaded');

      console.log(chalk.blue(`\n📜 Learning History (${agentId})\n`));
      console.log(`Showing ${recentExperiences.length} of ${experiences.length} total experiences\n`);

      recentExperiences.forEach((exp: any, index: number) => {
        const reward = exp.reward || 0;
        const rewardColor = reward > 0 ? chalk.green : reward < 0 ? chalk.red : chalk.yellow;
        const timestamp = new Date(exp.timestamp).toLocaleString();

        console.log(`${chalk.cyan((index + 1).toString().padStart(2))}. ${exp.taskType || 'unknown'}`);
        console.log(`    Reward: ${rewardColor(reward.toFixed(2))}`);
        console.log(`    Strategy: ${exp.action?.strategy || 'default'}`);
        console.log(`    Time: ${chalk.gray(timestamp)}`);
        console.log();
      });

    } catch (error: any) {
      spinner.fail('Failed to load history');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Trigger manual training
   */
  private static async manualTrain(options: LearnCommandOptions): Promise<void> {
    if (!options.agent || !options.task) {
      console.error(chalk.red('❌ --agent and --task are required'));
      console.log(chalk.gray('Example: aqe learn train --agent test-gen --task \'{"type":"test-generation"}\''));
      ProcessExit.exitIfNotTest(1);
    }

    const spinner = ora('Training agent...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      const learningEngine = new LearningEngine(options.agent || 'default', memoryManager);
      await learningEngine.initialize();

      // Parse task JSON
      const task = JSON.parse(options.task || '{}');

      // Mock result for training
      const result = {
        success: true,
        executionTime: 1000,
        strategy: 'default'
      };

      const outcome = await learningEngine.learnFromExecution(task, result);

      spinner.succeed('Training completed');

      console.log(chalk.green('\n✅ Training Result:\n'));
      console.log(`Improvement: ${this.formatImprovement(outcome.improvementRate)}`);
      console.log(`Confidence: ${chalk.cyan((outcome.confidence * 100).toFixed(1) + '%')}`);
      console.log(`Total Patterns: ${chalk.cyan(outcome.patterns.length)}`);
      console.log();

    } catch (error: any) {
      spinner.fail('Training failed');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Reset learning state
   */
  private static async resetLearning(options: LearnCommandOptions): Promise<void> {
    if (!options.confirm) {
      console.log(chalk.yellow('⚠️  This will delete all learning data for the agent'));
      console.log(chalk.gray('Add --confirm to proceed'));
      return;
    }

    const spinner = ora('Resetting learning state...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      const agentId = options.agent || 'default';

      // Delete learning state
      await memoryManager.delete(`phase2/learning/${agentId}/state`, 'learning');

      // Delete improvement data
      await memoryManager.delete(`phase2/learning/${agentId}/improvement`, 'learning');

      spinner.succeed('Learning state reset');
      console.log(chalk.yellow('\n⚠️  All learning data has been deleted'));
      console.log(chalk.gray('Agent will start learning from scratch\n'));

    } catch (error: any) {
      spinner.fail('Reset failed');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Export learning data
   */
  private static async exportLearningData(options: LearnCommandOptions): Promise<void> {
    if (!options.output) {
      console.error(chalk.red('❌ --output is required'));
      ProcessExit.exitIfNotTest(1);
    }

    const spinner = ora('Exporting learning data...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      const agentId = options.agent || 'default';

      const learningState = await memoryManager.retrieve(
        `phase2/learning/${agentId}/state`,
        { partition: 'learning' }
      );

      if (!learningState) {
        spinner.fail('No learning data to export');
        return;
      }

      await fs.writeJson(options.output!, learningState, { spaces: 2 });

      spinner.succeed(`Learning data exported to: ${options.output}`);
      console.log(chalk.green('\n✅ Export completed'));
      console.log(`File size: ${chalk.cyan(this.formatBytes((learningState as any).size))}\n`);

    } catch (error: any) {
      spinner.fail('Export failed');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show comprehensive learning metrics (Phase 3)
   */
  private static async showMetrics(options: LearnCommandOptions): Promise<void> {
    const spinner = ora('Loading learning metrics...').start();

    try {
      const memoryManager = await this.getMemoryManager();
      const metricsCollector = new MetricsCollector(memoryManager);

      // Parse period option (e.g., "7d", "30d", "1m")
      const periodDays = this.parsePeriod(options.period || '7d');

      // Collect metrics
      const metrics = await metricsCollector.collectMetrics(periodDays);

      spinner.succeed('Learning metrics loaded');

      // Display metrics
      MetricsDashboard.displayMetrics(metrics, {
        detailed: options.detailed,
        format: options.format
      });

    } catch (error: any) {
      spinner.fail('Failed to load metrics');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show trend analysis (Phase 3)
   */
  private static async showTrends(options: LearnCommandOptions): Promise<void> {
    const spinner = ora('Analyzing trends...').start();

    try {
      const memoryManager = await this.getMemoryManager();
      const metricsCollector = new MetricsCollector(memoryManager);
      const trendAnalyzer = new TrendAnalyzer(metricsCollector);

      // Parse period
      const period = this.parseTrendPeriod(options.period || 'weekly');

      // Analyze trends
      let trends;
      if (options.metric) {
        // Single metric
        const trend = await trendAnalyzer.analyzeTrend(options.metric, this.periodToDays(period));
        trends = [trend];
      } else {
        // All metrics
        trends = await trendAnalyzer.analyzeAllTrends(period);
      }

      spinner.succeed('Trend analysis complete');

      // Display trends
      MetricsDashboard.displayTrends(trends, {
        detailed: options.detailed,
        format: options.format
      });

    } catch (error: any) {
      spinner.fail('Failed to analyze trends');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show and manage alerts (Phase 3)
   */
  private static async showAlerts(options: LearnCommandOptions): Promise<void> {
    const spinner = ora('Loading alerts...').start();

    try {
      const memoryManager = await this.getMemoryManager();
      const alertManager = new AlertManager(memoryManager);
      await alertManager.initialize();

      // Handle acknowledgment if provided
      if (options.ack) {
        spinner.text = `Acknowledging alert ${options.ack}...`;
        await alertManager.acknowledgeAlert(options.ack);
        spinner.succeed(`Alert ${options.ack} acknowledged`);
        return;
      }

      // Get alerts
      const alerts = options.all
        ? alertManager.getAllAlerts()
        : alertManager.getActiveAlerts();

      spinner.succeed(`Found ${alerts.length} alerts`);

      // Display alerts
      MetricsDashboard.displayAlerts(alerts, {
        format: options.format
      });

      // Show help for acknowledgment
      if (alerts.length > 0 && !options.all) {
        console.log(chalk.gray('Use --ack <id> to acknowledge an alert'));
        console.log(chalk.gray('Use --all to show all alerts (including acknowledged)\n'));
      }

    } catch (error: any) {
      spinner.fail('Failed to load alerts');
      console.error(chalk.red('❌ Error:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Parse period string to days
   */
  private static parsePeriod(period: string): number {
    const match = period.match(/^(\d+)([dhwm])$/);
    if (!match) {
      return 7; // Default to 7 days
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd': return value;
      case 'h': return Math.max(1, Math.floor(value / 24));
      case 'w': return value * 7;
      case 'm': return value * 30;
      default: return 7;
    }
  }

  /**
   * Parse trend period string
   */
  private static parseTrendPeriod(period: string): TrendPeriod {
    switch (period.toLowerCase()) {
      case 'daily':
      case 'd':
        return TrendPeriod.DAILY;
      case 'weekly':
      case 'w':
        return TrendPeriod.WEEKLY;
      case 'monthly':
      case 'm':
        return TrendPeriod.MONTHLY;
      default:
        return TrendPeriod.WEEKLY;
    }
  }

  /**
   * Convert trend period to days
   */
  private static periodToDays(period: TrendPeriod): number {
    switch (period) {
      case TrendPeriod.DAILY:
        return 1;
      case TrendPeriod.WEEKLY:
        return 7;
      case TrendPeriod.MONTHLY:
        return 30;
      default:
        return 7;
    }
  }

  /**
   * Show command help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n📚 Learning Commands:\n'));
    console.log(chalk.cyan('  aqe learn status') + chalk.gray('         - View learning status'));
    console.log(chalk.cyan('  aqe learn enable') + chalk.gray('         - Enable learning'));
    console.log(chalk.cyan('  aqe learn disable') + chalk.gray('        - Disable learning'));
    console.log(chalk.cyan('  aqe learn history') + chalk.gray('        - View learning history'));
    console.log(chalk.cyan('  aqe learn train') + chalk.gray('          - Trigger manual training'));
    console.log(chalk.cyan('  aqe learn reset') + chalk.gray('          - Reset learning state'));
    console.log(chalk.cyan('  aqe learn export') + chalk.gray('         - Export learning data'));
    console.log(chalk.blue('\nPhase 3 - Metrics & Analytics:\n'));
    console.log(chalk.cyan('  aqe learn metrics') + chalk.gray('        - Show learning metrics'));
    console.log(chalk.cyan('  aqe learn trends') + chalk.gray('         - Show trend analysis'));
    console.log(chalk.cyan('  aqe learn alerts') + chalk.gray('         - Show active alerts'));
    console.log(chalk.blue('\nOptions:\n'));
    console.log(chalk.gray('  --agent <id>       - Target specific agent'));
    console.log(chalk.gray('  --detailed         - Show detailed information'));
    console.log(chalk.gray('  --limit <number>   - Limit results'));
    console.log(chalk.gray('  --confirm          - Confirm destructive operation'));
    console.log(chalk.gray('  --output <file>    - Output file path'));
    console.log(chalk.gray('  --all              - Apply to all agents / Show all alerts'));
    console.log(chalk.gray('  --period <period>  - Time period (7d, 30d, 1m, weekly, monthly)'));
    console.log(chalk.gray('  --format <format>  - Output format (table, json)'));
    console.log(chalk.gray('  --metric <name>    - Specific metric to analyze'));
    console.log(chalk.gray('  --ack <id>         - Acknowledge alert by ID'));
    console.log(chalk.blue('\nExamples:\n'));
    console.log(chalk.gray('  aqe learn status --agent test-gen --detailed'));
    console.log(chalk.gray('  aqe learn enable --all'));
    console.log(chalk.gray('  aqe learn history --limit 50'));
    console.log(chalk.gray('  aqe learn export --output learning.json'));
    console.log(chalk.blue('\nPhase 3 Examples:\n'));
    console.log(chalk.gray('  aqe learn metrics --period 30d --detailed'));
    console.log(chalk.gray('  aqe learn metrics --format json'));
    console.log(chalk.gray('  aqe learn trends --metric discoveryRate --period weekly'));
    console.log(chalk.gray('  aqe learn alerts --all'));
    console.log(chalk.gray('  aqe learn alerts --ack alert-12345'));
    console.log();
  }

  // Helper methods

  private static formatReward(reward: number): string {
    if (reward > 0.5) return chalk.green(reward.toFixed(2));
    if (reward < -0.5) return chalk.red(reward.toFixed(2));
    return chalk.yellow(reward.toFixed(2));
  }

  private static formatImprovement(rate: number): string {
    const formatted = rate >= 0 ? `+${rate.toFixed(1)}%` : `${rate.toFixed(1)}%`;
    if (rate >= 20) return chalk.green(formatted + ' (Target Reached! 🎉)');
    if (rate >= 10) return chalk.cyan(formatted);
    if (rate >= 0) return chalk.yellow(formatted);
    return chalk.red(formatted);
  }

  private static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

// Export command functions for CLI registration
export async function learnStatus(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('status', options);
}

export async function learnEnable(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('enable', options);
}

export async function learnDisable(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('disable', options);
}

export async function learnHistory(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('history', options);
}

export async function learnTrain(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('train', options);
}

export async function learnReset(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('reset', options);
}

export async function learnExport(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('export', options);
}

export async function learnMetrics(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('metrics', options);
}

export async function learnTrends(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('trends', options);
}

export async function learnAlerts(options: LearnCommandOptions): Promise<void> {
  await LearningCommand.execute('alerts', options);
}
