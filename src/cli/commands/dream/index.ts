/**
 * Dream CLI Commands - Nightly-Learner Phase 2
 *
 * Commands for running dream cycles and viewing dream insights.
 * Provides interface to the DreamEngine for pattern discovery.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { DreamEngine } from '../../../learning/dream/DreamEngine';
import { InsightGenerator, DreamInsight } from '../../../learning/dream/InsightGenerator';
import { ProcessExit } from '../../../utils/ProcessExit';

export interface DreamCommandOptions {
  duration?: number;
  insights?: number;
  limit?: number;
  type?: string;
  actionable?: boolean;
  verbose?: boolean;
  format?: 'table' | 'json';
}

/**
 * DreamCommand - CLI handler for dream engine operations
 */
export class DreamCommand {
  private static getDbPath(): string {
    return path.join(process.cwd(), '.agentic-qe', 'memory.db');
  }

  /**
   * Execute dream command
   */
  static async execute(subcommand: string, options: DreamCommandOptions = {}): Promise<void> {
    switch (subcommand) {
      case 'run':
        await this.runDreamCycle(options);
        break;
      case 'insights':
        await this.showInsights(options);
        break;
      case 'status':
        await this.showStatus(options);
        break;
      default:
        console.error(chalk.red(`❌ Unknown dream command: ${subcommand}`));
        this.showHelp();
        ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Run a dream cycle
   */
  private static async runDreamCycle(options: DreamCommandOptions): Promise<void> {
    const spinner = ora('Initializing dream engine...').start();

    try {
      const duration = options.duration || 5000; // Default 5 seconds for CLI
      const targetInsights = options.insights || 5;

      const engine = new DreamEngine({
        dbPath: this.getDbPath(),
        cycleDuration: duration,
        targetInsights,
        debug: options.verbose,
      });

      spinner.text = 'Loading patterns as concepts...';
      await engine.initialize();

      const stats = engine.getState();
      spinner.text = `Running dream cycle (${duration / 1000}s)...`;

      const result = await engine.dream();

      spinner.succeed(`Dream cycle complete!`);

      console.log(chalk.blue('\n🌙 Dream Cycle Results\n'));
      console.log(`├─ Cycle ID: ${chalk.cyan(result.cycleId)}`);
      console.log(`├─ Duration: ${chalk.yellow((result.duration / 1000).toFixed(1))}s`);
      console.log(`├─ Status: ${result.status === 'completed' ? chalk.green('completed') : chalk.red(result.status)}`);
      console.log(`├─ Concepts Processed: ${chalk.cyan(result.conceptsProcessed)}`);
      console.log(`├─ Associations Found: ${chalk.cyan(result.associationsFound)}`);
      console.log(`└─ Insights Generated: ${chalk.green(result.insightsGenerated)}`);

      if (result.insights.length > 0) {
        console.log(chalk.blue('\n💡 Generated Insights:\n'));

        const displayInsights = result.insights.slice(0, options.limit || 10);
        for (const insight of displayInsights) {
          const typeIcon = this.getTypeIcon(insight.type);
          const actionableTag = insight.actionable ? chalk.green(' [ACTIONABLE]') : '';

          console.log(`${typeIcon} ${chalk.white(insight.description)}${actionableTag}`);
          console.log(chalk.gray(`   Novelty: ${(insight.noveltyScore * 100).toFixed(0)}% | Confidence: ${(insight.confidenceScore * 100).toFixed(0)}%`));

          if (insight.suggestedAction && options.verbose) {
            console.log(chalk.yellow(`   → ${insight.suggestedAction}`));
          }
          console.log('');
        }

        if (result.insights.length > (options.limit || 10)) {
          console.log(chalk.gray(`... and ${result.insights.length - (options.limit || 10)} more insights`));
        }
      }

      engine.close();

    } catch (error) {
      spinner.fail('Dream cycle failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show stored insights
   */
  private static async showInsights(options: DreamCommandOptions): Promise<void> {
    const spinner = ora('Loading dream insights...').start();

    try {
      const generator = new InsightGenerator(null as any, {
        dbPath: this.getDbPath(),
      });

      const insightOptions: any = {
        limit: options.limit || 20,
      };

      if (options.type) {
        insightOptions.type = options.type;
      }

      if (options.actionable) {
        insightOptions.actionableOnly = true;
      }

      // Use available methods: getPendingInsights or getInsightsByType
      let insights: DreamInsight[];
      if (options.type) {
        insights = generator.getInsightsByType(options.type as any, insightOptions.limit);
      } else {
        insights = generator.getPendingInsights(insightOptions.limit);
      }

      spinner.succeed(`Found ${insights.length} insights`);

      if (options.format === 'json') {
        console.log(JSON.stringify(insights, null, 2));
        return;
      }

      console.log(chalk.blue('\n💡 Dream Insights\n'));

      if (insights.length === 0) {
        console.log(chalk.yellow('No insights found. Run "aqe dream run" to generate insights.'));
        return;
      }

      for (const insight of insights) {
        const typeIcon = this.getTypeIcon(insight.type);
        const actionableTag = insight.actionable ? chalk.green(' [ACTIONABLE]') : '';

        console.log(`${typeIcon} ${chalk.white(insight.description)}${actionableTag}`);
        console.log(chalk.gray(`   ID: ${insight.id.substring(0, 20)}...`));
        console.log(chalk.gray(`   Novelty: ${(insight.noveltyScore * 100).toFixed(0)}% | Confidence: ${(insight.confidenceScore * 100).toFixed(0)}%`));

        if (insight.suggestedAction) {
          console.log(chalk.yellow(`   → ${insight.suggestedAction}`));
        }

        if (options.verbose && insight.associatedConcepts.length > 0) {
          console.log(chalk.gray(`   Concepts: ${insight.associatedConcepts.slice(0, 3).join(', ')}`));
        }
        console.log('');
      }

      generator.close();

    } catch (error) {
      spinner.fail('Failed to load insights');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show dream engine status
   */
  private static async showStatus(options: DreamCommandOptions): Promise<void> {
    const spinner = ora('Loading dream engine status...').start();

    try {
      const engine = new DreamEngine({
        dbPath: this.getDbPath(),
        autoLoadPatterns: false, // Don't load patterns just for status
      });

      await engine.initialize();
      const state = engine.getState();
      const graphStats = engine.getGraphStats();

      spinner.succeed('Status loaded');

      console.log(chalk.blue('\n🌙 Dream Engine Status\n'));
      console.log(`├─ Running: ${state.isRunning ? chalk.green('Yes') : chalk.gray('No')}`);
      console.log(`├─ Cycles Completed: ${chalk.cyan(state.cyclesCompleted)}`);
      console.log(`├─ Total Insights: ${chalk.cyan(state.totalInsightsGenerated)}`);
      console.log(`├─ Avg Insights/Cycle: ${chalk.cyan(state.averageInsightsPerCycle.toFixed(1))}`);
      console.log(`└─ Last Cycle: ${state.lastCycleTime ? chalk.gray(state.lastCycleTime.toISOString()) : chalk.gray('Never')}`);

      console.log(chalk.blue('\n📊 Concept Graph:\n'));
      console.log(`├─ Total Nodes: ${chalk.cyan(graphStats.nodeCount)}`);
      console.log(`├─ Total Edges: ${chalk.cyan(graphStats.edgeCount)}`);
      console.log(`├─ Avg Edges/Node: ${chalk.cyan(graphStats.avgEdgesPerNode.toFixed(2))}`);
      console.log(`└─ Avg Activation: ${chalk.cyan((graphStats.avgActivation * 100).toFixed(1))}%`);

      if (graphStats.byType) {
        console.log(chalk.blue('\n📋 Nodes by Type:\n'));
        for (const [type, count] of Object.entries(graphStats.byType)) {
          console.log(`   ${type}: ${chalk.cyan(count)}`);
        }
      }

      engine.close();

    } catch (error) {
      spinner.fail('Failed to load status');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Get icon for insight type
   */
  private static getTypeIcon(type: string): string {
    switch (type) {
      case 'new_pattern':
        return chalk.green('🆕');
      case 'optimization':
        return chalk.blue('⚡');
      case 'warning':
        return chalk.yellow('⚠️');
      case 'connection':
        return chalk.cyan('🔗');
      case 'transfer':
        return chalk.magenta('📤');
      default:
        return chalk.gray('•');
    }
  }

  /**
   * Show help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n🌙 Dream Engine Commands\n'));
    console.log(chalk.cyan('  aqe dream run') + chalk.gray('        - Run a dream cycle'));
    console.log(chalk.cyan('  aqe dream insights') + chalk.gray('   - View stored insights'));
    console.log(chalk.cyan('  aqe dream status') + chalk.gray('     - Show engine status'));
    console.log('');
    console.log(chalk.blue('Options:\n'));
    console.log(chalk.gray('  --duration <ms>      Duration of dream cycle (default: 5000)'));
    console.log(chalk.gray('  --insights <n>       Target number of insights (default: 5)'));
    console.log(chalk.gray('  --limit <n>          Limit results (default: 20)'));
    console.log(chalk.gray('  --type <type>        Filter by insight type'));
    console.log(chalk.gray('  --actionable         Show only actionable insights'));
    console.log(chalk.gray('  --verbose            Show detailed output'));
    console.log(chalk.gray('  --format json        Output as JSON'));
    console.log('');
  }
}

export default DreamCommand;

// Export command functions for CLI registration
export async function dreamRun(options: DreamCommandOptions): Promise<void> {
  await DreamCommand.execute('run', options);
}

export async function dreamInsights(options: DreamCommandOptions): Promise<void> {
  await DreamCommand.execute('insights', options);
}

export async function dreamStatus(options: DreamCommandOptions): Promise<void> {
  await DreamCommand.execute('status', options);
}
