/**
 * Agentic QE v3 - Domain Command Handler
 *
 * Handles the 'aqe domain' command group for domain operations.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  ICommandHandler,
  CLIContext,
  getStatusColor,
} from './interfaces.js';
import { DomainName, ALL_DOMAINS } from '../../shared/types/index.js';

// ============================================================================
// Domain Handler
// ============================================================================

export class DomainHandler implements ICommandHandler {
  readonly name = 'domain';
  readonly description = 'Domain operations';

  private cleanupAndExit: (code: number) => Promise<never>;
  private ensureInitialized: () => Promise<boolean>;

  constructor(
    cleanupAndExit: (code: number) => Promise<never>,
    ensureInitialized: () => Promise<boolean>
  ) {
    this.cleanupAndExit = cleanupAndExit;
    this.ensureInitialized = ensureInitialized;
  }

  register(program: Command, context: CLIContext): void {
    const domainCmd = program
      .command('domain')
      .description(this.description);

    // domain list
    domainCmd
      .command('list')
      .description('List all domains')
      .action(async () => {
        await this.executeList(context);
      });

    // domain health
    domainCmd
      .command('health <domain>')
      .description('Get domain health')
      .action(async (domain: string) => {
        await this.executeHealth(domain, context);
      });
  }

  private async executeList(context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      console.log(chalk.blue('\n  Domains\n'));

      for (const domain of ALL_DOMAINS) {
        const health = context.queen!.getDomainHealth(domain);
        const load = context.queen!.getDomainLoad(domain);

        console.log(`  ${chalk.cyan(domain)}`);
        console.log(`    Status: ${getStatusColor(health?.status || 'unknown')}`);
        console.log(`    Load: ${load} tasks`);
        if (health) {
          console.log(`    Agents: ${health.agents.active}/${health.agents.total}`);
        }
        console.log('');
      }

    } catch (error) {
      console.error(chalk.red('\n  Failed to list domains:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeHealth(domain: string, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const health = context.queen!.getDomainHealth(domain as DomainName);

      if (!health) {
        console.log(chalk.red(`\n  Domain not found: ${domain}\n`));
        return;
      }

      console.log(chalk.blue(`\n  ${domain} Health\n`));
      console.log(`  Status: ${getStatusColor(health.status)}`);
      console.log(`  Agents Total: ${health.agents.total}`);
      console.log(`  Agents Active: ${chalk.green(health.agents.active)}`);
      console.log(`  Agents Idle: ${chalk.yellow(health.agents.idle)}`);
      console.log(`  Agents Failed: ${chalk.red(health.agents.failed)}`);
      if (health.lastActivity) {
        console.log(`  Last Activity: ${health.lastActivity.toISOString()}`);
      }

      if (health.errors.length > 0) {
        console.log(chalk.red('\n  Errors:'));
        health.errors.forEach(err => console.log(chalk.red(`    - ${err}`)));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n  Failed to get domain health:'), error);
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Manage domain operations including listing and health checks.

Usage:
  aqe domain <command> [options]

Commands:
  list              List all domains with status
  health <domain>   Get detailed domain health

Examples:
  aqe domain list
  aqe domain health test-generation
  aqe domain health coverage-analysis
`;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDomainHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): DomainHandler {
  return new DomainHandler(cleanupAndExit, ensureInitialized);
}
