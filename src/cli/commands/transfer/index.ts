/**
 * Transfer CLI Commands - Nightly-Learner Phase 2
 *
 * Commands for cross-agent pattern transfer and viewing transfer status.
 * Provides interface to the TransferProtocol for knowledge sharing.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { TransferProtocol } from '../../../learning/transfer/TransferProtocol';
import { ProcessExit } from '../../../utils/ProcessExit';

export interface TransferCommandOptions {
  source?: string;
  target?: string;
  pattern?: string;
  limit?: number;
  priority?: 'high' | 'medium' | 'low';
  verbose?: boolean;
  format?: 'table' | 'json';
}

/**
 * TransferCommand - CLI handler for pattern transfer operations
 */
export class TransferCommand {
  private static getDbPath(): string {
    return path.join(process.cwd(), '.agentic-qe', 'memory.db');
  }

  /**
   * Execute transfer command
   */
  static async execute(subcommand: string, options: TransferCommandOptions = {}): Promise<void> {
    switch (subcommand) {
      case 'broadcast':
        await this.broadcastPattern(options);
        break;
      case 'status':
        await this.showStatus(options);
        break;
      case 'history':
        await this.showHistory(options);
        break;
      case 'agents':
        await this.showAgents(options);
        break;
      default:
        console.error(chalk.red(`❌ Unknown transfer command: ${subcommand}`));
        this.showHelp();
        ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Broadcast a pattern to compatible agents
   */
  private static async broadcastPattern(options: TransferCommandOptions): Promise<void> {
    const spinner = ora('Initializing transfer protocol...').start();

    try {
      if (!options.pattern || !options.source) {
        spinner.fail('Missing required options');
        console.error(chalk.red('Error: --pattern and --source are required'));
        console.log(chalk.gray('Example: aqe transfer broadcast --pattern pattern-123 --source test-generator'));
        ProcessExit.exitIfNotTest(1);
        return;
      }

      const protocol = new TransferProtocol({
        dbPath: this.getDbPath(),
        debug: options.verbose,
      });

      spinner.text = 'Broadcasting pattern to compatible agents...';

      const results = await protocol.broadcastPattern(options.pattern, options.source);

      const successful = results.filter(r => r.patternsTransferred > 0);
      const failed = results.filter(r => r.patternsTransferred === 0);

      if (successful.length > 0) {
        spinner.succeed(`Pattern broadcast complete!`);
      } else {
        spinner.warn('No compatible agents found for transfer');
      }

      console.log(chalk.blue('\n📤 Transfer Results\n'));
      console.log(`├─ Pattern ID: ${chalk.cyan(options.pattern)}`);
      console.log(`├─ Source Agent: ${chalk.cyan(options.source)}`);
      console.log(`├─ Target Agents: ${chalk.cyan(results.length)}`);
      console.log(`├─ Successful: ${chalk.green(successful.length)}`);
      console.log(`└─ Failed/Skipped: ${chalk.yellow(failed.length)}`);

      if (successful.length > 0 && options.verbose) {
        console.log(chalk.blue('\n✅ Successful Transfers:\n'));
        for (const result of successful) {
          console.log(`   ${chalk.green('→')} ${result.targetAgent}`);
          console.log(chalk.gray(`      Success rate: ${(result.successRate * 100).toFixed(0)}%`));
        }
      }

      if (failed.length > 0 && options.verbose) {
        console.log(chalk.blue('\n⚠️ Failed/Skipped:\n'));
        for (const result of failed) {
          const reason = result.details[0]?.reason || 'Unknown';
          console.log(`   ${chalk.yellow('→')} ${result.targetAgent}`);
          console.log(chalk.gray(`      Reason: ${reason}`));
        }
      }

      protocol.close();

    } catch (error) {
      spinner.fail('Transfer failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show transfer status and statistics
   */
  private static async showStatus(options: TransferCommandOptions): Promise<void> {
    const spinner = ora('Loading transfer status...').start();

    try {
      const protocol = new TransferProtocol({
        dbPath: this.getDbPath(),
      });

      const stats = protocol.getStats();

      spinner.succeed('Status loaded');

      if (options.format === 'json') {
        console.log(JSON.stringify({
          totalRequests: stats.totalRequests,
          successfulTransfers: stats.successfulTransfers,
          failedTransfers: stats.failedTransfers,
          overallSuccessRate: stats.overallSuccessRate,
          averageCompatibilityScore: stats.averageCompatibilityScore,
        }, null, 2));
        protocol.close();
        return;
      }

      console.log(chalk.blue('\n📊 Transfer Protocol Status\n'));
      console.log(`├─ Total Requests: ${chalk.cyan(stats.totalRequests)}`);
      console.log(`├─ Successful Transfers: ${chalk.green(stats.successfulTransfers)}`);
      console.log(`├─ Failed Transfers: ${chalk.red(stats.failedTransfers)}`);
      console.log(`├─ Success Rate: ${this.formatRate(stats.overallSuccessRate)}`);
      console.log(`└─ Avg Compatibility: ${this.formatRate(stats.averageCompatibilityScore)}`);

      // Show per-agent-pair stats if verbose
      if (options.verbose && stats.byAgentPair.size > 0) {
        console.log(chalk.blue('\n👥 By Agent Pair:\n'));

        let count = 0;
        for (const [pair, data] of stats.byAgentPair) {
          if (count >= (options.limit || 10)) break;
          const rate = data.success / (data.success + data.fail) || 0;
          console.log(`   ${pair}: ${chalk.green(data.success)} success, ${chalk.red(data.fail)} fail (${(rate * 100).toFixed(0)}%)`);
          count++;
        }
      }

      protocol.close();

    } catch (error) {
      spinner.fail('Failed to load status');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show pending transfer requests
   */
  private static async showHistory(options: TransferCommandOptions): Promise<void> {
    const spinner = ora('Loading pending transfer requests...').start();

    try {
      const protocol = new TransferProtocol({
        dbPath: this.getDbPath(),
      });

      const requests = protocol.getPendingRequests();
      const limit = options.limit || 20;
      const displayRequests = requests.slice(0, limit);

      spinner.succeed(`Found ${requests.length} pending transfer requests`);

      if (options.format === 'json') {
        console.log(JSON.stringify(displayRequests, null, 2));
        protocol.close();
        return;
      }

      console.log(chalk.blue('\n📜 Pending Transfer Requests\n'));

      if (displayRequests.length === 0) {
        console.log(chalk.yellow('No pending transfer requests found.'));
        protocol.close();
        return;
      }

      for (const request of displayRequests) {
        const date = new Date(request.requestedAt).toLocaleString();

        console.log(`${chalk.yellow('○')} ${chalk.cyan(request.sourceAgent)} → ${chalk.cyan(request.targetAgent)}`);
        console.log(chalk.gray(`   ID: ${request.id.substring(0, 20)}...`));
        console.log(chalk.gray(`   Patterns: ${request.patternIds.length} | Date: ${date}`));

        if (options.verbose) {
          console.log(chalk.gray(`   Priority: ${request.priority} | Reason: ${request.reason}`));
        }
        console.log('');
      }

      if (requests.length > limit) {
        console.log(chalk.gray(`... and ${requests.length - limit} more requests`));
      }

      protocol.close();

    } catch (error) {
      spinner.fail('Failed to load pending requests');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show available agents for transfer
   */
  private static async showAgents(options: TransferCommandOptions): Promise<void> {
    const spinner = ora('Loading available agents...').start();

    // Define known QE agents with their capabilities
    const qeAgents = [
      { type: 'test-generator', domains: ['unit', 'integration', 'e2e'], frameworks: ['jest', 'vitest', 'mocha'] },
      { type: 'coverage-analyzer', domains: ['coverage', 'gaps', 'optimization'], frameworks: ['istanbul', 'c8', 'nyc'] },
      { type: 'quality-gate', domains: ['quality', 'thresholds', 'gates'], frameworks: ['sonarqube', 'custom'] },
      { type: 'performance-tester', domains: ['load', 'stress', 'benchmark'], frameworks: ['k6', 'artillery', 'autocannon'] },
      { type: 'security-scanner', domains: ['vulnerabilities', 'owasp', 'sast'], frameworks: ['snyk', 'semgrep', 'codeql'] },
      { type: 'chaos-engineer', domains: ['resilience', 'failure', 'recovery'], frameworks: ['chaos-monkey', 'gremlin'] },
      { type: 'visual-tester', domains: ['ui', 'screenshots', 'visual-regression'], frameworks: ['playwright', 'puppeteer', 'chromatic'] },
      { type: 'api-contract-validator', domains: ['contracts', 'openapi', 'schemas'], frameworks: ['pact', 'dredd', 'prism'] },
      { type: 'flaky-test-hunter', domains: ['flaky', 'stability', 'retry'], frameworks: ['jest', 'cypress', 'playwright'] },
      { type: 'integration-tester', domains: ['integration', 'services', 'mocking'], frameworks: ['nock', 'msw', 'wiremock'] },
    ];

    spinner.succeed(`Found ${qeAgents.length} agent types`);

    if (options.format === 'json') {
      console.log(JSON.stringify(qeAgents, null, 2));
      return;
    }

    console.log(chalk.blue('\n🤖 Available Agents for Transfer\n'));

    for (const agent of qeAgents) {
      console.log(`${chalk.cyan(agent.type)}`);
      console.log(chalk.gray(`   Domains: ${agent.domains.join(', ')}`));
      console.log(chalk.gray(`   Frameworks: ${agent.frameworks.join(', ')}`));
      console.log('');
    }
  }

  /**
   * Format rate as percentage with color
   */
  private static formatRate(rate: number): string {
    const percentage = (rate * 100).toFixed(1) + '%';
    if (rate >= 0.8) return chalk.green(percentage);
    if (rate >= 0.5) return chalk.yellow(percentage);
    return chalk.red(percentage);
  }

  /**
   * Show help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n📤 Transfer Protocol Commands\n'));
    console.log(chalk.cyan('  aqe transfer broadcast') + chalk.gray(' - Broadcast pattern to agents'));
    console.log(chalk.cyan('  aqe transfer status') + chalk.gray('    - Show transfer statistics'));
    console.log(chalk.cyan('  aqe transfer history') + chalk.gray('   - View transfer history'));
    console.log(chalk.cyan('  aqe transfer agents') + chalk.gray('    - List available agents'));
    console.log('');
    console.log(chalk.blue('Options:\n'));
    console.log(chalk.gray('  --pattern <id>       Pattern ID to transfer'));
    console.log(chalk.gray('  --source <agent>     Source agent type'));
    console.log(chalk.gray('  --target <agent>     Target agent type (for filtering)'));
    console.log(chalk.gray('  --limit <n>          Limit results (default: 20)'));
    console.log(chalk.gray('  --priority <level>   Transfer priority (high/medium/low)'));
    console.log(chalk.gray('  --verbose            Show detailed output'));
    console.log(chalk.gray('  --format json        Output as JSON'));
    console.log('');
    console.log(chalk.blue('Examples:\n'));
    console.log(chalk.gray('  aqe transfer broadcast --pattern pattern-123 --source test-generator'));
    console.log(chalk.gray('  aqe transfer history --source test-generator --limit 10'));
    console.log(chalk.gray('  aqe transfer status --verbose'));
    console.log('');
  }
}

export default TransferCommand;

// Export command functions for CLI registration
export async function transferBroadcast(options: TransferCommandOptions): Promise<void> {
  await TransferCommand.execute('broadcast', options);
}

export async function transferStatus(options: TransferCommandOptions): Promise<void> {
  await TransferCommand.execute('status', options);
}

export async function transferHistory(options: TransferCommandOptions): Promise<void> {
  await TransferCommand.execute('history', options);
}

export async function transferAgents(options: TransferCommandOptions): Promise<void> {
  await TransferCommand.execute('agents', options);
}
