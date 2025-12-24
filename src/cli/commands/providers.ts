/**
 * Providers CLI Commands
 *
 * Commands for managing LLM providers
 * Provides list, status, switch, and test functionality for provider management.
 */

import chalk from 'chalk';
import { LLMProviderFactory, ProviderType } from '../../providers/LLMProviderFactory';
import { loadConfig } from '../../config/ConfigLoader';
import { Logger } from '../../utils/Logger';
import { ProcessExit } from '../../utils/ProcessExit';

export interface ProvidersCommandOptions {
  format?: 'json' | 'table';
  verbose?: boolean;
  provider?: string;
}

/**
 * Providers command class
 */
export class ProvidersCommand {
  private static logger = Logger.getInstance();

  /**
   * Execute providers command
   */
  static async execute(subcommand: string, args: string[] = [], options: ProvidersCommandOptions = {}): Promise<void> {
    switch (subcommand) {
      case 'list':
        await this.listProviders(options);
        break;
      case 'status':
        await this.showStatus(options);
        break;
      case 'switch':
        await this.switchProvider(args[0], options);
        break;
      case 'test':
        await this.testProvider(options.provider || args[0], options);
        break;
      default:
        console.error(chalk.red(`❌ Unknown providers command: ${subcommand}`));
        this.showHelp();
        ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * List all configured providers and their status
   */
  private static async listProviders(options: ProvidersCommandOptions): Promise<void> {
    try {
      console.log(chalk.blue('\n🔌 LLM Providers:\n'));

      // Load config to get provider settings
      const config = await loadConfig();
      const factory = new LLMProviderFactory();
      await factory.initialize();

      const availableProviders = factory.getAvailableProviders();
      const signals = factory.getEnvironmentSignals();

      // Determine default provider (lowest priority number, or first enabled)
      const defaultProvider = config.providers
        ?.filter(p => p.enabled)
        .sort((a, b) => a.priority - b.priority)[0]?.type || 'auto';

      if (options.format === 'json') {
        const providerData = {
          defaultProvider,
          availableProviders,
          providers: config.providers?.map(p => ({
            type: p.type,
            enabled: p.enabled,
            model: p.defaultModel,
            priority: p.priority,
            hasApiKey: !!p.apiKey,
            isAvailable: availableProviders.includes(p.type as ProviderType)
          }))
        };
        console.log(JSON.stringify(providerData, null, 2));
        await factory.shutdown();
        return;
      }

      // Table format
      const table: Array<{provider: string; status: string; default: string; model: string}> = [];

      // Check each provider type
      const providerTypes: ProviderType[] = ['claude', 'openrouter', 'ollama', 'ruvllm'];

      for (const type of providerTypes) {
        const providerConfig = config.providers?.find(p => p.type === type);
        const isAvailable = availableProviders.includes(type);
        const isDefault = defaultProvider === type;

        let statusText = '✗ not configured';
        let statusColor = chalk.red;

        if (isAvailable) {
          statusText = '✓ ready';
          statusColor = chalk.green;
        } else if (providerConfig?.enabled) {
          // Check why it's not available
          if (type === 'claude' && !signals.hasAnthropicKey) {
            statusText = '✗ no api key';
            statusColor = chalk.yellow;
          } else if (type === 'openrouter' && !signals.hasOpenRouterKey) {
            statusText = '✗ no api key';
            statusColor = chalk.yellow;
          } else if (type === 'ollama' && !signals.hasOllamaRunning) {
            statusText = '✗ not running';
            statusColor = chalk.yellow;
          } else if (type === 'ruvllm' && !signals.hasRuvllm) {
            statusText = '✗ not installed';
            statusColor = chalk.yellow;
          } else {
            statusText = '✗ failed';
            statusColor = chalk.red;
          }
        }

        table.push({
          provider: type,
          status: statusColor(statusText),
          default: isDefault ? '✓' : '',
          model: providerConfig?.defaultModel || '-'
        });
      }

      // Print table
      console.log('┌─────────────┬──────────────────┬─────────┬──────────────────┐');
      console.log('│ Provider    │ Status           │ Default │ Model            │');
      console.log('├─────────────┼──────────────────┼─────────┼──────────────────┤');

      for (const row of table) {
        const provider = row.provider.padEnd(11);
        const status = row.status.padEnd(16 + (row.status.length - this.stripAnsi(row.status).length));
        const def = row.default.padEnd(7);
        const model = row.model.padEnd(16);
        console.log(`│ ${provider} │ ${status} │ ${def} │ ${model} │`);
      }

      console.log('└─────────────┴──────────────────┴─────────┴──────────────────┘\n');

      if (options.verbose) {
        console.log(chalk.blue('Environment Signals:\n'));
        console.log(`  ANTHROPIC_API_KEY: ${signals.hasAnthropicKey ? '✓' : '✗'}`);
        console.log(`  OPENROUTER_API_KEY: ${signals.hasOpenRouterKey ? '✓' : '✗'}`);
        console.log(`  Ollama Running: ${signals.hasOllamaRunning ? '✓' : '✗'}`);
        console.log(`  ruvLLM Available: ${signals.hasRuvllm ? '✓' : '✗'}`);
        console.log(`  Claude Code Environment: ${signals.isClaudeCode ? '✓' : '✗'}\n`);
      }

      await factory.shutdown();

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list providers:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show current provider status and health
   */
  private static async showStatus(options: ProvidersCommandOptions): Promise<void> {
    try {
      console.log(chalk.blue('\n📊 Provider Status:\n'));

      const config = await loadConfig();
      const factory = new LLMProviderFactory();
      await factory.initialize();

      const availableProviders = factory.getAvailableProviders();

      // Determine default provider (lowest priority number, or first enabled)
      const defaultProvider = config.providers
        ?.filter(p => p.enabled)
        .sort((a, b) => a.priority - b.priority)[0]?.type || 'auto';

      console.log(`  Default Provider: ${chalk.cyan(defaultProvider)}`);
      console.log(`  Available Providers: ${chalk.green(availableProviders.length)}`);
      console.log(`  Providers: ${availableProviders.map(p => chalk.cyan(p)).join(', ') || chalk.gray('none')}\n`);

      // Show provider details
      for (const type of availableProviders) {
        const metadata = factory.getProviderMetadata(type as ProviderType);
        if (!metadata) continue;

        console.log(chalk.blue(`${type}:`));
        console.log(`  Name: ${metadata.name}`);
        console.log(`  Version: ${metadata.version}`);
        console.log(`  Models: ${metadata.models.slice(0, 3).join(', ')}${metadata.models.length > 3 ? '...' : ''}`);
        console.log(`  Location: ${metadata.location}`);
        console.log(`  Capabilities:`);
        console.log(`    Streaming: ${metadata.capabilities.streaming ? '✓' : '✗'}`);
        console.log(`    Caching: ${metadata.capabilities.caching ? '✓' : '✗'}`);
        console.log(`    Embeddings: ${metadata.capabilities.embeddings ? '✓' : '✗'}`);
        console.log(`    Vision: ${metadata.capabilities.vision ? '✓' : '✗'}`);
        console.log(`  Cost per 1M tokens:`);
        console.log(`    Input: $${metadata.costs.inputPerMillion.toFixed(2)}`);
        console.log(`    Output: $${metadata.costs.outputPerMillion.toFixed(2)}\n`);
      }

      // Show usage statistics if verbose
      if (options.verbose) {
        const usageStats = factory.getUsageStats() as Map<ProviderType, any>;
        if (usageStats.size > 0) {
          console.log(chalk.blue('Usage Statistics:\n'));
          for (const [type, stats] of usageStats.entries()) {
            if (stats.requestCount > 0) {
              console.log(chalk.cyan(`${type}:`));
              console.log(`  Requests: ${stats.requestCount}`);
              console.log(`  Success Rate: ${((stats.successCount / stats.requestCount) * 100).toFixed(1)}%`);
              console.log(`  Total Cost: $${stats.totalCost.toFixed(4)}`);
              console.log(`  Avg Latency: ${stats.averageLatency.toFixed(0)}ms\n`);
            }
          }
        }
      }

      await factory.shutdown();

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Switch the default provider
   */
  private static async switchProvider(provider: string, options: ProvidersCommandOptions): Promise<void> {
    try {
      if (!provider) {
        console.error(chalk.red('❌ Provider name required'));
        console.log(chalk.gray('\nUsage: aqe providers switch <provider>'));
        console.log(chalk.gray('Valid providers: claude, openrouter, ollama, ruvllm\n'));
        ProcessExit.exitIfNotTest(1);
        return;
      }

      const validProviders: ProviderType[] = ['claude', 'openrouter', 'ollama', 'ruvllm'];
      if (!validProviders.includes(provider as ProviderType)) {
        console.error(chalk.red(`❌ Invalid provider: ${provider}`));
        console.log(chalk.gray(`\nValid providers: ${validProviders.join(', ')}\n`));
        ProcessExit.exitIfNotTest(1);
        return;
      }

      console.log(chalk.blue(`🔄 Switching default provider to: ${chalk.cyan(provider)}\n`));

      const config = await loadConfig();

      // Check if provider is configured
      const providerConfig = config.providers?.find(p => p.type === provider);
      if (!providerConfig) {
        console.error(chalk.red(`❌ Provider ${provider} is not configured`));
        console.log(chalk.yellow('\n💡 Add provider to .aqe/providers.yaml first\n'));
        ProcessExit.exitIfNotTest(1);
        return;
      }

      // Update priority to make this provider the default (priority 0)
      // and adjust other providers' priorities
      config.providers = config.providers?.map(p => {
        if (p.type === provider) {
          return { ...p, priority: 0, enabled: true };
        }
        return { ...p, priority: p.priority >= 0 ? p.priority + 1 : p.priority };
      });

      // Save config
      const { ConfigLoader } = await import('../../config/ConfigLoader');
      const loader = new ConfigLoader();
      await loader.save(config, '.aqe/providers.yaml');

      console.log(chalk.green(`✅ Default provider switched to: ${provider}\n`));

      // Test the provider
      console.log(chalk.gray('Testing provider...\n'));
      await this.testProvider(provider, options);

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to switch provider:'), error.message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Test a specific provider's connectivity
   */
  private static async testProvider(provider: string | undefined, options: ProvidersCommandOptions): Promise<void> {
    try {
      if (!provider) {
        console.error(chalk.red('❌ Provider name required'));
        console.log(chalk.gray('\nUsage: aqe providers test <provider>'));
        console.log(chalk.gray('Valid providers: claude, openrouter, ollama, ruvllm\n'));
        ProcessExit.exitIfNotTest(1);
        return;
      }

      console.log(chalk.blue(`🔍 Testing provider: ${chalk.cyan(provider)}\n`));

      const factory = new LLMProviderFactory();
      await factory.initialize();

      const providerInstance = factory.getProvider(provider as ProviderType);

      if (!providerInstance) {
        console.error(chalk.red(`❌ Provider ${provider} is not available`));
        console.log(chalk.yellow('\n💡 Check configuration and API keys\n'));
        ProcessExit.exitIfNotTest(1);
        return;
      }

      // Perform health check
      console.log(chalk.gray('Performing health check...\n'));
      const startTime = Date.now();
      const health = await providerInstance.healthCheck();
      const duration = Date.now() - startTime;

      if (health.healthy) {
        console.log(chalk.green('✅ Provider is healthy\n'));
        console.log(`  Response Time: ${chalk.cyan(duration + 'ms')}`);
        if (health.latency) {
          console.log(`  API Latency: ${chalk.cyan(health.latency + 'ms')}`);
        }
        if (health.metadata) {
          console.log(`  Metadata: ${JSON.stringify(health.metadata, null, 2)}`);
        }
      } else {
        console.log(chalk.red('❌ Provider is unhealthy\n'));
        console.log(`  Response Time: ${chalk.cyan(duration + 'ms')}`);
        if (health.error) {
          console.log(`  Error: ${chalk.red(health.error)}`);
        }
      }

      // Show provider metadata
      const metadata = providerInstance.getMetadata();
      console.log(chalk.blue('\nProvider Information:\n'));
      console.log(`  Name: ${metadata.name}`);
      console.log(`  Version: ${metadata.version}`);
      console.log(`  Available Models: ${metadata.models.length}`);
      console.log(`  Location: ${metadata.location}`);

      console.log();

      await factory.shutdown();

    } catch (error: any) {
      console.error(chalk.red('❌ Provider test failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Strip ANSI codes for padding calculation
   */
  private static stripAnsi(str: string): string {
    return str.replace(/\u001b\[[0-9;]*m/g, '');
  }

  /**
   * Show command help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n📚 Providers Commands:\n'));
    console.log(chalk.cyan('  aqe providers list') + chalk.gray('           - List all configured providers'));
    console.log(chalk.cyan('  aqe providers status') + chalk.gray('         - Show current provider status'));
    console.log(chalk.cyan('  aqe providers switch <name>') + chalk.gray('  - Switch default provider'));
    console.log(chalk.cyan('  aqe providers test [provider]') + chalk.gray(' - Test provider connectivity'));
    console.log(chalk.blue('\nOptions:\n'));
    console.log(chalk.gray('  --format <format>  - Output format (json|table)'));
    console.log(chalk.gray('  --verbose, -v      - Verbose output'));
    console.log(chalk.blue('\nExamples:\n'));
    console.log(chalk.gray('  aqe providers list'));
    console.log(chalk.gray('  aqe providers status --verbose'));
    console.log(chalk.gray('  aqe providers switch ollama'));
    console.log(chalk.gray('  aqe providers test claude'));
    console.log();
  }
}

// Export command functions for CLI registration
export async function providersList(options: ProvidersCommandOptions): Promise<void> {
  await ProvidersCommand.execute('list', [], options);
  ProcessExit.exitIfNotTest(0);
}

export async function providersStatus(options: ProvidersCommandOptions): Promise<void> {
  await ProvidersCommand.execute('status', [], options);
  ProcessExit.exitIfNotTest(0);
}

export async function providersSwitch(provider: string, options: ProvidersCommandOptions): Promise<void> {
  await ProvidersCommand.execute('switch', [provider], options);
  ProcessExit.exitIfNotTest(0);
}

export async function providersTest(provider: string, options: ProvidersCommandOptions): Promise<void> {
  await ProvidersCommand.execute('test', [provider], options);
  ProcessExit.exitIfNotTest(0);
}
