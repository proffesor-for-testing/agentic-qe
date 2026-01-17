/**
 * Provider Commands - LLM Provider management CLI
 *
 * Commands for monitoring, configuring, and managing LLM providers.
 *
 * Available commands:
 *   aqe providers status   - Show provider health dashboard
 *   aqe providers list     - List all registered providers
 *   aqe providers quota    - Show quota usage for all providers
 *   aqe providers test     - Test connectivity to a provider
 *   aqe providers switch   - Switch the default provider
 *
 * @module cli/commands/providers
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ProviderStatusCommand, ProviderStatusOptions } from './status';

export function createProvidersCommand(): Command {
  const providers = new Command('providers')
    .description('LLM provider management and health monitoring')
    .addHelpText('after', `
Examples:
  $ aqe providers status                  Show provider health dashboard
  $ aqe providers status --detailed       Show detailed metrics
  $ aqe providers status --json           Output in JSON format
  $ aqe providers status --watch          Continuously monitor
  $ aqe providers list                    List all configured providers
  $ aqe providers test groq              Test Groq provider connectivity
  $ aqe providers switch claude          Switch default to Claude
`);

  // Status subcommand - primary health dashboard
  providers
    .command('status')
    .description('Show provider health dashboard with real-time metrics')
    .option('-d, --detailed', 'Show detailed metrics for each provider')
    .option('-j, --json', 'Output in JSON format')
    .option('-f, --format <format>', 'Output format (json, table)', 'table')
    .option('-v, --verbose', 'Show verbose output (alias for --detailed)')
    .option('-w, --watch', 'Continuously monitor provider health')
    .option('-i, --interval <seconds>', 'Watch interval in seconds', '10')
    .action(async (options) => {
      const statusOptions: ProviderStatusOptions = {
        detailed: options.detailed || options.verbose,
        json: options.json || options.format === 'json',
        watch: options.watch,
        interval: parseInt(options.interval, 10)
      };

      try {
        await ProviderStatusCommand.execute(statusOptions);
      } catch (error) {
        console.error(chalk.red(`❌ Provider status failed: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // List subcommand - list all providers
  providers
    .command('list')
    .description('List all configured providers and their status')
    .option('-j, --json', 'Output in JSON format')
    .option('-f, --format <format>', 'Output format (json, table)', 'table')
    .option('-v, --verbose', 'Show detailed information')
    .action(async (options) => {
      try {
        await ProviderStatusCommand.execute({
          json: options.json || options.format === 'json',
          detailed: options.verbose
        });
      } catch (error) {
        console.error(chalk.red(`❌ Provider list failed: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Quota subcommand - show quota usage
  providers
    .command('quota')
    .description('Show quota usage for all providers')
    .option('-j, --json', 'Output in JSON format')
    .action(async (options) => {
      try {
        await ProviderStatusCommand.execute({
          detailed: true,
          json: options.json
        });
      } catch (error) {
        console.error(chalk.red(`❌ Provider quota failed: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Test subcommand - test provider connectivity
  providers
    .command('test')
    .description('Test connectivity to a specific provider')
    .argument('[provider]', 'Provider name to test (groq, github-models, claude, ollama)')
    .option('-v, --verbose', 'Show detailed error information')
    .action(async (provider, options) => {
      try {
        console.log(chalk.cyan(`\n🔍 Testing provider: ${provider || 'all'}\n`));
        await ProviderStatusCommand.execute({
          detailed: options.verbose || true
        });
      } catch (error) {
        console.error(chalk.red(`❌ Provider test failed: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // Switch subcommand - change default provider
  providers
    .command('switch')
    .description('Switch the default provider')
    .argument('<provider>', 'Provider name (groq, github-models, claude, ollama, openrouter)')
    .action(async (provider) => {
      const validProviders = ['groq', 'github-models', 'claude', 'ollama', 'openrouter', 'ruvllm'];

      if (!validProviders.includes(provider.toLowerCase())) {
        console.error(chalk.red(`❌ Invalid provider: ${provider}`));
        console.log(chalk.yellow(`Valid providers: ${validProviders.join(', ')}`));
        process.exit(1);
      }

      console.log(chalk.cyan(`\n🔄 Switching default provider to: ${provider}\n`));
      console.log(chalk.yellow('To persist this change, update your configuration:'));
      console.log(chalk.white(`  aqe config set providers.default ${provider}`));
      console.log(chalk.white(`  # or edit .aqe/config.json directly\n`));

      // Show current status of the target provider
      console.log(chalk.cyan('Current status of target provider:'));
      await ProviderStatusCommand.execute({ detailed: false });
    });

  return providers;
}

// Export command components for direct usage
export { ProviderStatusCommand } from './status';
export type { ProviderStatusOptions, ProviderStatusReport, ProviderHealthInfo } from './status';
