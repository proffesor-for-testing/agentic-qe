/**
 * Agentic QE v3 - Status Command Handler
 *
 * Handles the 'aqe status' and 'aqe health' commands.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  ICommandHandler,
  CLIContext,
  getStatusColor,
  formatUptime,
} from './interfaces.js';
import { DomainName } from '../../shared/types/index.js';

// ============================================================================
// Status Handler
// ============================================================================

export class StatusHandler implements ICommandHandler {
  readonly name = 'status';
  readonly description = 'Show system status';

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
    program
      .command('status')
      .description(this.description)
      .option('-v, --verbose', 'Show detailed status')
      .action(async (options) => {
        await this.executeStatus(options, context);
      });
  }

  private async executeStatus(options: StatusOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const health = context.queen!.getHealth();
      const metrics = context.queen!.getMetrics();

      console.log(chalk.blue('\n  AQE v3 Status\n'));

      // Overall health
      console.log(`  Status: ${getStatusColor(health.status)}`);
      console.log(`  Uptime: ${chalk.cyan(formatUptime(metrics.uptime))}`);
      console.log(`  Work Stealing: ${health.workStealingActive ? chalk.green('active') : chalk.gray('inactive')}`);

      // Agents
      console.log(chalk.blue('\n  Agents:'));
      console.log(`  Total: ${chalk.cyan(health.totalAgents)}`);
      console.log(`  Active: ${chalk.yellow(health.activeAgents)}`);
      console.log(`  Utilization: ${chalk.cyan((metrics.agentUtilization * 100).toFixed(1))}%`);

      // Tasks
      console.log(chalk.blue('\n  Tasks:'));
      console.log(`  Received: ${chalk.cyan(metrics.tasksReceived)}`);
      console.log(`  Completed: ${chalk.green(metrics.tasksCompleted)}`);
      console.log(`  Failed: ${chalk.red(metrics.tasksFailed)}`);
      console.log(`  Pending: ${chalk.yellow(health.pendingTasks)}`);
      console.log(`  Running: ${chalk.yellow(health.runningTasks)}`);
      if (metrics.tasksStolen > 0) {
        console.log(`  Stolen (work stealing): ${chalk.cyan(metrics.tasksStolen)}`);
      }

      // Protocols & Workflows
      if (metrics.protocolsExecuted > 0 || metrics.workflowsExecuted > 0) {
        console.log(chalk.blue('\n  Coordination:'));
        console.log(`  Protocols Executed: ${chalk.cyan(metrics.protocolsExecuted)}`);
        console.log(`  Workflows Executed: ${chalk.cyan(metrics.workflowsExecuted)}`);
      }

      // Verbose domain status
      if (options.verbose) {
        console.log(chalk.blue('\n  Domain Status:'));
        const domainEntries = Array.from(health.domainHealth.entries());
        for (const [domain, domainHealth] of domainEntries) {
          console.log(`  ${domain}: ${getStatusColor(domainHealth.status)}`);
          console.log(chalk.gray(`    Agents: ${domainHealth.agents.active}/${domainHealth.agents.total} active`));
          if (domainHealth.errors.length > 0) {
            console.log(chalk.red(`    Errors: ${domainHealth.errors.length}`));
          }
        }

        // Domain utilization
        console.log(chalk.blue('\n  Domain Load:'));
        const utilizationEntries = Array.from(metrics.domainUtilization.entries());
        for (const [domain, load] of utilizationEntries) {
          const bar = '\u2588'.repeat(Math.min(load, 20)) + '\u2591'.repeat(Math.max(0, 20 - load));
          console.log(`  ${domain.padEnd(25)} ${bar} ${load}`);
        }
      }

      // Health issues
      if (health.issues.length > 0) {
        console.log(chalk.red('\n  Issues:'));
        for (const issue of health.issues) {
          const color = issue.severity === 'high' ? chalk.red :
                       issue.severity === 'medium' ? chalk.yellow : chalk.gray;
          console.log(`  ${color(`[${issue.severity}]`)} ${issue.message}`);
        }
      }

      console.log('');
      await this.cleanupAndExit(0);

    } catch (error) {
      console.error(chalk.red('\n  Failed to get status:'), error);
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Show system status including agents, tasks, and domain health.

Usage:
  aqe status [options]

Options:
  -v, --verbose    Show detailed status including domain breakdown

Examples:
  aqe status           # Basic status
  aqe status -v        # Verbose status with domain details
`;
  }
}

// ============================================================================
// Health Handler
// ============================================================================

export class HealthHandler implements ICommandHandler {
  readonly name = 'health';
  readonly description = 'Check system health';

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
    program
      .command('health')
      .description(this.description)
      .option('-d, --domain <domain>', 'Check specific domain health')
      .action(async (options) => {
        await this.executeHealth(options, context);
      });
  }

  private async executeHealth(options: HealthOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      if (options.domain) {
        const health = context.queen!.getDomainHealth(options.domain as DomainName);

        if (!health) {
          console.log(chalk.red(`\n  Domain not found: ${options.domain}\n`));
          return;
        }

        console.log(chalk.blue(`\n  Health: ${options.domain}\n`));
        console.log(`  Status: ${getStatusColor(health.status)}`);
        console.log(`  Agents: ${health.agents.active}/${health.agents.total} active`);
        console.log(`  Idle: ${health.agents.idle}`);
        console.log(`  Failed: ${health.agents.failed}`);
        if (health.lastActivity) {
          console.log(`  Last Activity: ${health.lastActivity.toISOString()}`);
        }
        if (health.errors.length > 0) {
          console.log(chalk.red(`\n  Errors:`));
          health.errors.forEach(err => console.log(chalk.red(`    - ${err}`)));
        }
      } else {
        const health = context.queen!.getHealth();

        console.log(chalk.blue('\n  System Health\n'));
        console.log(`  Overall: ${getStatusColor(health.status)}`);
        console.log(`  Last Check: ${health.lastHealthCheck.toISOString()}`);

        // Issue #205 fix: Summary by status including 'idle'
        let healthy = 0, idle = 0, degraded = 0, unhealthy = 0;
        const healthEntries = Array.from(health.domainHealth.entries());
        for (const [, domainHealth] of healthEntries) {
          if (domainHealth.status === 'healthy') healthy++;
          else if (domainHealth.status === 'idle') idle++;
          else if (domainHealth.status === 'degraded') degraded++;
          else unhealthy++;
        }

        console.log(chalk.blue('\n  Domains:'));
        console.log(`  ${chalk.green('\u25CF')} Healthy: ${healthy}`);
        console.log(`  ${chalk.cyan('\u25CF')} Idle (ready): ${idle}`);
        console.log(`  ${chalk.yellow('\u25CF')} Degraded: ${degraded}`);
        console.log(`  ${chalk.red('\u25CF')} Unhealthy: ${unhealthy}`);

        // Issue #205 fix: Add helpful tip for fresh installs
        if (idle > 0 && healthy === 0 && degraded === 0 && unhealthy === 0) {
          console.log(chalk.gray('\n  Tip: Domains are idle (ready). Run a task to spawn agents.'));
        }
      }

      console.log('');
      await this.cleanupAndExit(0);

    } catch (error) {
      console.error(chalk.red('\n  Health check failed:'), error);
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Check system and domain health status.

Usage:
  aqe health [options]

Options:
  -d, --domain <domain>    Check specific domain health

Examples:
  aqe health                        # Overall system health
  aqe health -d test-generation     # Check test-generation domain
`;
  }
}

// ============================================================================
// Types
// ============================================================================

interface StatusOptions {
  verbose?: boolean;
}

interface HealthOptions {
  domain?: string;
}

// ============================================================================
// Factory
// ============================================================================

export function createStatusHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): StatusHandler {
  return new StatusHandler(cleanupAndExit, ensureInitialized);
}

export function createHealthHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): HealthHandler {
  return new HealthHandler(cleanupAndExit, ensureInitialized);
}
