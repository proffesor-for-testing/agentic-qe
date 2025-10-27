import { ProcessExit } from '../../../utils/ProcessExit';
/**
 * Routing CLI Commands
 *
 * Commands for managing the Multi-Model Router (Phase 1 - v1.0.5)
 * Provides enable/disable, status, dashboard, reporting, and stats functionality.
 */

import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';

export interface RoutingCommandOptions {
  config?: string;
  format?: 'json' | 'table';
  timeframe?: string;
  export?: string;
  verbose?: boolean;
}

export interface RoutingConfig {
  multiModelRouter: {
    enabled: boolean;
    version: string;
    defaultModel: string;
    enableCostTracking: boolean;
    enableFallback: boolean;
    maxRetries: number;
    costThreshold: number;
    modelRules: {
      simple: { model: string; maxTokens: number; estimatedCost: number };
      moderate: { model: string; maxTokens: number; estimatedCost: number };
      complex: { model: string; maxTokens: number; estimatedCost: number };
      critical: { model: string; maxTokens: number; estimatedCost: number };
    };
    fallbackChains: Record<string, string[]>;
  };
  streaming: {
    enabled: boolean;
    progressInterval: number;
    bufferEvents: boolean;
    timeout: number;
  };
}

export class RoutingCommand {
  private static configPath = '.agentic-qe/config/routing.json';

  /**
   * Execute routing command
   */
  static async execute(subcommand: string, options: RoutingCommandOptions = {}): Promise<void> {
    switch (subcommand) {
      case 'enable':
        await this.enableRouting(options);
        break;
      case 'disable':
        await this.disableRouting(options);
        break;
      case 'status':
        await this.showStatus(options);
        break;
      case 'dashboard':
        await this.showDashboard(options);
        break;
      case 'report':
        await this.generateReport(options);
        break;
      case 'stats':
        await this.showStats(options);
        break;
      default:
        console.error(chalk.red(`❌ Unknown routing command: ${subcommand}`));
        this.showHelp();
        ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Enable Multi-Model Router
   */
  private static async enableRouting(options: RoutingCommandOptions): Promise<void> {
    try {
      const configPath = options.config || this.configPath;

      if (!await fs.pathExists(configPath)) {
        console.error(chalk.red(`❌ Routing config not found: ${configPath}`));
        console.log(chalk.yellow('\n💡 Run "aqe init" first to initialize the fleet'));
        ProcessExit.exitIfNotTest(1);
      }

      const config: RoutingConfig = await fs.readJson(configPath);

      if (config.multiModelRouter.enabled) {
        console.log(chalk.yellow('⚠️  Multi-Model Router is already enabled'));
        return;
      }

      config.multiModelRouter.enabled = true;
      await fs.writeJson(configPath, config, { spaces: 2 });

      console.log(chalk.green('✅ Multi-Model Router enabled'));
      console.log(chalk.blue('\n💰 Cost Optimization:'));
      console.log(chalk.gray('  Expected savings: 70-81%'));
      console.log(chalk.gray(`  Default model: ${config.multiModelRouter.defaultModel}`));
      console.log(chalk.gray('  Cost tracking: Enabled'));
      console.log(chalk.gray('  Fallback chains: Enabled'));
      console.log(chalk.gray('\n📊 Model Selection Rules:'));
      console.log(chalk.gray(`  Simple tasks → ${config.multiModelRouter.modelRules.simple.model}`));
      console.log(chalk.gray(`  Moderate tasks → ${config.multiModelRouter.modelRules.moderate.model}`));
      console.log(chalk.gray(`  Complex tasks → ${config.multiModelRouter.modelRules.complex.model}`));
      console.log(chalk.gray(`  Critical tasks → ${config.multiModelRouter.modelRules.critical.model}`));
      console.log(chalk.gray('\n💡 Use "aqe routing dashboard" to monitor cost savings'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to enable routing:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Disable Multi-Model Router
   */
  private static async disableRouting(options: RoutingCommandOptions): Promise<void> {
    try {
      const configPath = options.config || this.configPath;

      if (!await fs.pathExists(configPath)) {
        console.error(chalk.red(`❌ Routing config not found: ${configPath}`));
        ProcessExit.exitIfNotTest(1);
      }

      const config: RoutingConfig = await fs.readJson(configPath);

      if (!config.multiModelRouter.enabled) {
        console.log(chalk.yellow('⚠️  Multi-Model Router is already disabled'));
        return;
      }

      config.multiModelRouter.enabled = false;
      await fs.writeJson(configPath, config, { spaces: 2 });

      console.log(chalk.yellow('⚠️  Multi-Model Router disabled'));
      console.log(chalk.gray('\n  All requests will now use the default model'));
      console.log(chalk.gray(`  Default model: ${config.multiModelRouter.defaultModel}`));
      console.log(chalk.gray('\n💡 Use "aqe routing enable" to re-enable cost optimization'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to disable routing:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show routing status
   */
  private static async showStatus(options: RoutingCommandOptions): Promise<void> {
    try {
      const configPath = options.config || this.configPath;

      if (!await fs.pathExists(configPath)) {
        console.error(chalk.red(`❌ Routing config not found: ${configPath}`));
        console.log(chalk.yellow('\n💡 Run "aqe init" first to initialize the fleet'));
        ProcessExit.exitIfNotTest(1);
      }

      const config: RoutingConfig = await fs.readJson(configPath);

      if (options.format === 'json') {
        console.log(JSON.stringify(config.multiModelRouter, null, 2));
        return;
      }

      console.log(chalk.blue('\n📊 Routing Status:\n'));

      const statusIcon = config.multiModelRouter.enabled ? '✅' : '❌';
      const statusColor = config.multiModelRouter.enabled ? chalk.green : chalk.red;

      console.log(`  ${statusIcon} Status: ${statusColor(config.multiModelRouter.enabled ? 'Enabled' : 'Disabled')}`);
      console.log(`  📦 Version: ${chalk.cyan(config.multiModelRouter.version)}`);
      console.log(`  🎯 Default Model: ${chalk.cyan(config.multiModelRouter.defaultModel)}`);
      console.log(`  💰 Cost Tracking: ${config.multiModelRouter.enableCostTracking ? '✅' : '❌'}`);
      console.log(`  🔄 Fallback: ${config.multiModelRouter.enableFallback ? '✅' : '❌'}`);
      console.log(`  🔁 Max Retries: ${chalk.cyan(config.multiModelRouter.maxRetries)}`);
      console.log(`  📊 Cost Threshold: ${chalk.cyan(config.multiModelRouter.costThreshold)}`);

      console.log(chalk.blue('\n🎯 Model Rules:\n'));
      console.log(`  Simple:   ${chalk.cyan(config.multiModelRouter.modelRules.simple.model)} ($${config.multiModelRouter.modelRules.simple.estimatedCost.toFixed(4)})`);
      console.log(`  Moderate: ${chalk.cyan(config.multiModelRouter.modelRules.moderate.model)} ($${config.multiModelRouter.modelRules.moderate.estimatedCost.toFixed(4)})`);
      console.log(`  Complex:  ${chalk.cyan(config.multiModelRouter.modelRules.complex.model)} ($${config.multiModelRouter.modelRules.complex.estimatedCost.toFixed(4)})`);
      console.log(`  Critical: ${chalk.cyan(config.multiModelRouter.modelRules.critical.model)} ($${config.multiModelRouter.modelRules.critical.estimatedCost.toFixed(4)})`);

      console.log(chalk.blue('\n📊 Streaming:\n'));
      console.log(`  ${config.streaming.enabled ? '✅' : '❌'} Status: ${config.streaming.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`);
      console.log(`  ⏱️  Progress Interval: ${chalk.cyan(config.streaming.progressInterval)}ms`);
      console.log(`  ⏰ Timeout: ${chalk.cyan(config.streaming.timeout / 1000)}s`);

      if (options.verbose) {
        console.log(chalk.blue('\n🔗 Fallback Chains:\n'));
        for (const [model, chain] of Object.entries(config.multiModelRouter.fallbackChains)) {
          console.log(`  ${chalk.cyan(model)} → ${chain.map(m => chalk.gray(m)).join(' → ')}`);
        }
      }

      console.log();

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show cost dashboard with real AdaptiveModelRouter data
   */
  private static async showDashboard(options: RoutingCommandOptions): Promise<void> {
    try {
      console.log(chalk.blue('\n💰 Cost Dashboard\n'));

      // Try to load cost data from SwarmMemoryManager via CostTracker
      try {
        // Initialize memory manager for coordination partition
        const memoryPath = '.agentic-qe/data/swarm-memory.db';
        const memoryManager = new SwarmMemoryManager(memoryPath);
        await memoryManager.initialize();

        // Try to retrieve cost data from CostTracker's storage location
        const costsData = await memoryManager.retrieve('routing/costs', {
          partition: 'coordination'
        });

        if (costsData && Array.isArray(costsData)) {
          // Calculate aggregated metrics from CostTracker's per-model data
          const totalRequests = costsData.reduce((sum: number, cost: any) => sum + (cost.requestCount || 0), 0);
          const totalCost = costsData.reduce((sum: number, cost: any) => sum + (cost.estimatedCost || 0), 0);

          // Calculate baseline cost (if all requests used Claude Sonnet 4.5)
          const totalTokens = costsData.reduce((sum: number, cost: any) => sum + (cost.tokensUsed || 0), 0);
          const baselineCostPerToken = 0.0030; // Claude Sonnet 4.5 cost per 1k tokens
          const baselineCost = (totalTokens / 1000) * baselineCostPerToken;
          const totalSavings = baselineCost - totalCost;
          const savingsPercent = baselineCost > 0 ? ((totalSavings / baselineCost) * 100) : 0;

          console.log(`  📊 Total Requests: ${chalk.cyan(totalRequests.toLocaleString())}`);
          console.log(`  💵 Total Cost: ${chalk.cyan('$' + totalCost.toFixed(4))}`);
          console.log(`  💰 Total Savings: ${chalk.green('$' + totalSavings.toFixed(4))} (${savingsPercent.toFixed(1)}%)`);
          console.log(`  🎯 Baseline Cost: ${chalk.gray('$' + baselineCost.toFixed(4))} (all Sonnet 4.5)`);

          console.log(chalk.blue('\n📈 Requests by Model:\n'));
          for (const cost of costsData) {
            if (cost.requestCount > 0) {
              const percentage = ((cost.requestCount / totalRequests) * 100).toFixed(1);
              const avgCost = cost.estimatedCost / cost.requestCount;
              console.log(`  ${chalk.cyan(cost.modelId)}: ${cost.requestCount} requests (${percentage}%) - Avg: $${avgCost.toFixed(4)}`);
            }
          }

          console.log(chalk.blue('\n💡 Cost Breakdown:\n'));
          for (const cost of costsData) {
            if (cost.estimatedCost > 0) {
              const percentage = ((cost.estimatedCost / totalCost) * 100).toFixed(1);
              console.log(`  ${chalk.cyan(cost.modelId)}: $${cost.estimatedCost.toFixed(4)} (${percentage}%)`);
            }
          }

        } else {
          console.log(chalk.yellow('  ⚠️  No cost data available yet'));
          console.log(chalk.gray('  Cost tracking will populate after routing is enabled and requests are processed'));
        }

      } catch (memError) {
        console.log(chalk.yellow('  ⚠️  No cost data available yet'));
        console.log(chalk.gray('  Cost tracking will populate after routing is enabled and requests are processed'));
        if (options.verbose) {
          console.log(chalk.gray(`  Debug: ${(memError as Error).message}`));
        }
      }

      console.log(chalk.blue('\n💡 Commands:\n'));
      console.log(chalk.gray('  aqe routing stats       - View detailed statistics'));
      console.log(chalk.gray('  aqe routing report      - Generate cost report'));
      console.log(chalk.gray('  aqe routing status -v   - View routing configuration'));
      console.log();

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to show dashboard:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Generate cost report
   */
  private static async generateReport(options: RoutingCommandOptions): Promise<void> {
    try {
      console.log(chalk.blue('📊 Generating cost report...\n'));

      const memoryPath = '.agentic-qe/data/swarm-memory.db';
      const memoryManager = new SwarmMemoryManager(memoryPath);
      await memoryManager.initialize();

      // Retrieve cost tracking data
      const costData = await memoryManager.retrieve('routing/cost-tracking', {
        partition: 'coordination'
      });

      if (!costData) {
        console.log(chalk.yellow('⚠️  No cost data available for reporting'));
        console.log(chalk.gray('Cost tracking will populate after routing is enabled and requests are processed'));
        return;
      }

      const report = {
        generatedAt: new Date().toISOString(),
        summary: {
          totalRequests: costData.totalRequests || 0,
          totalCost: costData.totalCost || 0,
          totalSavings: costData.totalSavings || 0,
          savingsPercent: costData.totalCost > 0
            ? ((costData.totalSavings / (costData.totalCost + costData.totalSavings)) * 100)
            : 0
        },
        byModel: costData.byModel || {},
        byComplexity: costData.byComplexity || {},
        timeframe: options.timeframe || 'all-time'
      };

      if (options.format === 'json' || options.export) {
        const json = JSON.stringify(report, null, 2);

        if (options.export) {
          await fs.writeFile(options.export, json);
          console.log(chalk.green(`✅ Report exported to: ${options.export}`));
        } else {
          console.log(json);
        }
      } else {
        console.log(chalk.blue('📋 Cost Report\n'));
        console.log(`  Generated: ${chalk.gray(report.generatedAt)}`);
        console.log(`  Timeframe: ${chalk.cyan(report.timeframe)}\n`);
        console.log(chalk.blue('Summary:\n'));
        console.log(`  Total Requests: ${chalk.cyan(report.summary.totalRequests.toLocaleString())}`);
        console.log(`  Total Cost: ${chalk.cyan('$' + report.summary.totalCost.toFixed(4))}`);
        console.log(`  Total Savings: ${chalk.green('$' + report.summary.totalSavings.toFixed(4))}`);
        console.log(`  Savings: ${chalk.green(report.summary.savingsPercent.toFixed(1) + '%')}\n`);

        console.log(chalk.gray('💡 Use --format json to get JSON output'));
        console.log(chalk.gray('💡 Use --export <file> to save report to file\n'));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to generate report:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show routing statistics
   */
  private static async showStats(options: RoutingCommandOptions): Promise<void> {
    try {
      console.log(chalk.blue('\n📈 Routing Statistics\n'));

      const memoryPath = '.agentic-qe/data/swarm-memory.db';
      const memoryManager = new SwarmMemoryManager(memoryPath);
      await memoryManager.initialize();

      // Retrieve statistics
      const stats = await memoryManager.retrieve('routing/statistics', {
        partition: 'coordination'
      });

      if (!stats) {
        console.log(chalk.yellow('⚠️  No statistics available yet'));
        console.log(chalk.gray('Statistics will populate after routing is enabled and requests are processed\n'));
        return;
      }

      console.log(chalk.blue('Performance Metrics:\n'));
      console.log(`  Average Latency: ${chalk.cyan((stats.avgLatency || 0).toFixed(2) + 'ms')}`);
      console.log(`  Fallback Rate: ${chalk.cyan((stats.fallbackRate || 0).toFixed(2) + '%')}`);
      console.log(`  Success Rate: ${chalk.green((stats.successRate || 100).toFixed(2) + '%')}`);
      console.log(`  Retry Rate: ${chalk.yellow((stats.retryRate || 0).toFixed(2) + '%')}`);

      if (stats.modelPerformance) {
        console.log(chalk.blue('\n🎯 Model Performance:\n'));
        for (const [model, perf] of Object.entries(stats.modelPerformance as Record<string, any>)) {
          console.log(`  ${chalk.cyan(model)}:`);
          console.log(`    Requests: ${perf.requests || 0}`);
          console.log(`    Avg Latency: ${(perf.avgLatency || 0).toFixed(2)}ms`);
          console.log(`    Success Rate: ${(perf.successRate || 100).toFixed(2)}%`);
        }
      }

      console.log();

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to show stats:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show command help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n📚 Routing Commands:\n'));
    console.log(chalk.cyan('  aqe routing enable') + chalk.gray('      - Enable Multi-Model Router'));
    console.log(chalk.cyan('  aqe routing disable') + chalk.gray('     - Disable Multi-Model Router'));
    console.log(chalk.cyan('  aqe routing status') + chalk.gray('      - Show routing configuration'));
    console.log(chalk.cyan('  aqe routing dashboard') + chalk.gray('   - Show cost dashboard'));
    console.log(chalk.cyan('  aqe routing report') + chalk.gray('     - Generate cost report'));
    console.log(chalk.cyan('  aqe routing stats') + chalk.gray('      - Show routing statistics'));
    console.log(chalk.blue('\nOptions:\n'));
    console.log(chalk.gray('  --config <path>    - Custom config file path'));
    console.log(chalk.gray('  --format <format>  - Output format (json|table)'));
    console.log(chalk.gray('  --export <file>    - Export report to file'));
    console.log(chalk.gray('  --verbose, -v      - Verbose output'));
    console.log(chalk.blue('\nExamples:\n'));
    console.log(chalk.gray('  aqe routing enable'));
    console.log(chalk.gray('  aqe routing status --verbose'));
    console.log(chalk.gray('  aqe routing dashboard'));
    console.log(chalk.gray('  aqe routing report --format json --export report.json'));
    console.log();
  }
}

// Export command functions for CLI registration
export async function routingEnable(options: RoutingCommandOptions): Promise<void> {
  await RoutingCommand.execute('enable', options);
}

export async function routingDisable(options: RoutingCommandOptions): Promise<void> {
  await RoutingCommand.execute('disable', options);
}

export async function routingStatus(options: RoutingCommandOptions): Promise<void> {
  await RoutingCommand.execute('status', options);
}

export async function routingDashboard(options: RoutingCommandOptions): Promise<void> {
  await RoutingCommand.execute('dashboard', options);
}

export async function routingReport(options: RoutingCommandOptions): Promise<void> {
  await RoutingCommand.execute('report', options);
}

export async function routingStats(options: RoutingCommandOptions): Promise<void> {
  await RoutingCommand.execute('stats', options);
}
