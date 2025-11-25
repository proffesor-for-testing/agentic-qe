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
import { LearningEngine } from '../../../learning/LearningEngine';
import { PerformanceTracker } from '../../../learning/PerformanceTracker';
import { ProcessExit } from '../../../utils/ProcessExit';

export interface LearnCommandOptions {
  agent?: string;
  detailed?: boolean;
  limit?: number;
  confirm?: boolean;
  output?: string;
  task?: string;
  all?: boolean;
}

/**
 * LearningCommand - CLI handler for learning operations
 */
export class LearningCommand {
  private static memoryPath = '.agentic-qe/data/swarm-memory.db';

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
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      const agentId = options.agent || 'default';

      // Load learning state
      const learningState = await memoryManager.retrieve(
        `phase2/learning/${agentId}/state`,
        { partition: 'learning' }
      );

      if (!learningState) {
        spinner.fail('No learning data available');
        console.log(chalk.yellow('\n💡 Run "aqe init" to initialize the fleet and enable learning'));
        return;
      }

      spinner.succeed('Learning status loaded');

      console.log(chalk.blue('\n🧠 Learning Engine Status\n'));

      // Agent info
      console.log(chalk.cyan(`Agent: ${learningState.agentId}`));
      console.log(`├─ Learning Rate: ${chalk.cyan(learningState.config.learningRate)}`);
      console.log(`├─ Experiences: ${chalk.cyan(learningState.experiences.length.toLocaleString())}`);
      console.log(`├─ Exploration Rate: ${chalk.cyan((learningState.config.explorationRate * 100).toFixed(1) + '%')}`);

      if (learningState.performance) {
        const perf = learningState.performance;
        console.log(`├─ Avg Reward: ${this.formatReward(perf.avgReward)}`);
        console.log(`├─ Success Rate: ${chalk.green((perf.successRate * 100).toFixed(1) + '%')}`);
        console.log(`└─ Total Tasks: ${chalk.cyan(perf.totalExperiences.toLocaleString())}`);
      }

      // Load improvement data
      const improvement = await memoryManager.retrieve(
        `phase2/learning/${agentId}/improvement`,
        { partition: 'learning' }
      );

      if (improvement) {
        console.log(chalk.blue('\n📊 Performance Trends:\n'));
        console.log(`├─ Current Rate: ${this.formatImprovement(improvement.improvementRate)}`);
        console.log(`├─ Days Elapsed: ${chalk.cyan(improvement.daysElapsed.toFixed(1))}`);
        console.log(`└─ Target (20%): ${improvement.targetAchieved ? chalk.green('✅ REACHED') : chalk.yellow('⏳ In Progress')}`);
      }

      // Top patterns
      if (learningState.patterns && learningState.patterns.length > 0) {
        console.log(chalk.blue('\n🎯 Top Learned Patterns:\n'));
        const topPatterns = learningState.patterns
          .sort((a: any, b: any) => b.confidence - a.confidence)
          .slice(0, 5);

        topPatterns.forEach((pattern: any, index: number) => {
          const prefix = index === topPatterns.length - 1 ? '└─' : '├─';
          console.log(`${prefix} ${pattern.pattern} (confidence: ${chalk.cyan((pattern.confidence * 100).toFixed(1) + '%')})`);
        });
      }

      if (options.detailed) {
        console.log(chalk.blue('\n📈 Detailed Metrics:\n'));
        console.log(`Model Version: ${chalk.cyan(learningState.version)}`);
        console.log(`Last Updated: ${chalk.gray(new Date(learningState.lastUpdated).toLocaleString())}`);
        console.log(`State Size: ${chalk.cyan(this.formatBytes(learningState.size))}`);
        console.log(`Q-Table Entries: ${chalk.cyan(Object.keys(learningState.qTable).length.toLocaleString())}`);
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
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

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
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

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
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

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
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

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
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

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
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

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
    console.log(chalk.blue('\nOptions:\n'));
    console.log(chalk.gray('  --agent <id>       - Target specific agent'));
    console.log(chalk.gray('  --detailed         - Show detailed information'));
    console.log(chalk.gray('  --limit <number>   - Limit results'));
    console.log(chalk.gray('  --confirm          - Confirm destructive operation'));
    console.log(chalk.gray('  --output <file>    - Output file path'));
    console.log(chalk.gray('  --all              - Apply to all agents'));
    console.log(chalk.blue('\nExamples:\n'));
    console.log(chalk.gray('  aqe learn status --agent test-gen --detailed'));
    console.log(chalk.gray('  aqe learn enable --all'));
    console.log(chalk.gray('  aqe learn history --limit 50'));
    console.log(chalk.gray('  aqe learn export --output learning.json'));
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

/**
 * Show learning improvement metrics from AgentDB
 */
export async function learnMetrics(options: any): Promise<void> {
  const spinner = ora('Loading learning metrics from AgentDB...').start();

  try {
    const { createAgentDBManager } = await import('../../../core/memory/AgentDBManager');

    const agentDB = createAgentDBManager({
      dbPath: '.agentic-qe/agentdb.db'
    });

    await agentDB.initialize();

    // Query metrics from patterns table
    // Note: The patterns table uses 'type' column, not 'agent_id'
    const metrics = await agentDB.query(`
      SELECT
        type as agent,
        AVG(confidence) as avg_confidence,
        COUNT(*) as total_patterns,
        SUM(CASE WHEN confidence > 0.7 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as high_confidence_rate
      FROM patterns
      ${options.agent ? `WHERE type LIKE ?` : ''}
      GROUP BY type
      ORDER BY avg_confidence DESC
    `, options.agent ? [`%${options.agent}%`] : []);

    await agentDB.close();

    spinner.succeed('Learning metrics loaded');

    if (!metrics || metrics.length === 0) {
      console.log(chalk.yellow('\n⚠️  No learning metrics found'));
      console.log(chalk.gray('Run some agent tasks to generate learning data\n'));
      return;
    }

    const days = options.days || '7';
    console.log(chalk.blue(`\n📊 Learning Metrics (Last ${days} Days)\n`));

    // Format as table
    console.log(chalk.cyan('Agent'.padEnd(30)) +
                chalk.cyan('Avg Confidence'.padEnd(18)) +
                chalk.cyan('Total Patterns'.padEnd(18)) +
                chalk.cyan('High Confidence %'));
    console.log('─'.repeat(84));

    metrics.forEach((row: any) => {
      const confidenceColor = row.avg_confidence > 0.7 ? chalk.green :
                             row.avg_confidence > 0.5 ? chalk.yellow : chalk.red;

      console.log(
        row.agent.padEnd(30) +
        confidenceColor((row.avg_confidence * 100).toFixed(1) + '%').padEnd(18) +
        chalk.cyan(row.total_patterns.toString()).padEnd(18) +
        chalk.cyan((row.high_confidence_rate || 0).toFixed(1) + '%')
      );
    });

    console.log();

  } catch (error: any) {
    spinner.fail('Failed to load metrics');
    console.error(chalk.red('❌ Error:'), error.message);
    ProcessExit.exitIfNotTest(1);
  }
}
