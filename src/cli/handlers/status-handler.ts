/**
 * Agentic QE v3 - Status Command Handler
 *
 * Handles the 'aqe status' and 'aqe health' commands.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ICommandHandler,
  CLIContext,
  getStatusColor,
  formatUptime,
} from './interfaces.js';
import { DomainName } from '../../shared/types/index.js';
import { type OutputFormat, writeOutput, toJSON } from '../utils/ci-output.js';
import { findProjectRoot } from '../../kernel/unified-memory.js';
import { loadRouterConfig } from '../../shared/llm/router/config-store.js';
import { billingModeForType } from '../../shared/llm/billing-modes.js';
import type { LLMProviderType } from '../../shared/llm/interfaces.js';

// ============================================================================
// Background worker daemon liveness (A18)
// ============================================================================

export interface DaemonLivenessStatus {
  /** A daemon.pid file exists (`aqe`/`npx ruflo daemon start` was run at least once) */
  configured: boolean;
  /** The PID in daemon.pid corresponds to a live process right now */
  running: boolean;
  pid?: number;
}

/**
 * Check whether the detached background-worker daemon (`.agentic-qe/workers/
 * start-daemon.cjs`, PID recorded in `daemon.pid` — see `10-workers.ts`) is
 * actually alive. Mirrors the exact liveness check `stop-daemon.cjs` uses
 * (`process.kill(pid, 0)`) rather than inventing a new protocol.
 *
 * Distinct from `aqe daemon status` (in `cli/commands/daemon.ts`), which
 * tracks a *different*, in-process `QualityDaemon` instance that can't see a
 * truly detached process across separate CLI invocations anyway.
 */
/**
 * ADR-123 (issue #557): print how the active LLM provider bills, plus any
 * configured per-run budget cap. Best-effort — never throws into `aqe health`.
 */
export function printLlmBilling(): void {
  try {
    const config = loadRouterConfig();
    const primary = config.defaultProvider as LLMProviderType;
    const mode = billingModeForType(primary);
    const modeLabel: Record<string, string> = {
      'metered-api': `${chalk.red('●')} pay-per-token API key (no cap)`,
      'metered-capped': `${chalk.yellow('●')} pay-per-token with server-side cap`,
      subscription: `${chalk.green('●')} Claude subscription (no per-token charge)`,
      local: `${chalk.green('●')} local (no cost)`,
    };
    console.log(chalk.blue('\n  LLM Billing:'));
    console.log(`  Provider: ${chalk.cyan(primary)}  ${modeLabel[mode] ?? mode}`);

    const cap = Number.parseFloat(process.env.AQE_MAX_BUDGET_USD ?? '');
    if (Number.isFinite(cap) && cap > 0) {
      console.log(`  Per-run budget cap: ${chalk.cyan('$' + cap.toFixed(2))}`);
    } else if (mode === 'metered-api') {
      console.log(chalk.gray('  No budget cap set — use AQE_MAX_BUDGET_USD or --max-budget-usd.'));
      console.log(chalk.gray('  Tip: AQE_LLM_PROVIDER=claude-code runs on your Claude subscription.'));
    }
  } catch {
    // Billing display is informational; failures must not break health.
  }
}

export function checkDaemonLiveness(): DaemonLivenessStatus {
  try {
    const pidFile = join(findProjectRoot(), '.agentic-qe', 'workers', 'daemon.pid');
    if (!existsSync(pidFile)) return { configured: false, running: false };

    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    if (!Number.isFinite(pid)) return { configured: true, running: false };

    try {
      process.kill(pid, 0); // signal 0: existence check only, doesn't actually kill
      return { configured: true, running: true, pid };
    } catch {
      return { configured: true, running: false, pid };
    }
  } catch {
    return { configured: false, running: false };
  }
}

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
      .option('-F, --format <format>', 'Output format (text|json)', 'text')
      .option('-o, --output <path>', 'Write output to file')
      .action(async (options) => {
        await this.executeStatus(options, context);
      });
  }

  private async executeStatus(options: StatusOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const health = context.queen!.getHealth();
      const metrics = context.queen!.getMetrics();
      const format = (options.format || 'text') as OutputFormat;

      if (format === 'json') {
        const domainStatus: Record<string, unknown> = {};
        if (options.verbose) {
          for (const [domain, dh] of health.domainHealth) {
            domainStatus[domain] = {
              status: dh.status,
              agents: dh.agents,
              errors: dh.errors.length,
            };
          }
        }
        writeOutput(toJSON({
          status: health.status,
          uptime: metrics.uptime,
          workStealing: health.workStealingActive,
          agents: { total: health.totalAgents, active: health.activeAgents, utilization: metrics.agentUtilization },
          tasks: { received: metrics.tasksReceived, completed: metrics.tasksCompleted, failed: metrics.tasksFailed, pending: health.pendingTasks, running: health.runningTasks, stolen: metrics.tasksStolen },
          coordination: { protocols: metrics.protocolsExecuted, workflows: metrics.workflowsExecuted },
          ...(options.verbose ? { domains: domainStatus } : {}),
          issues: health.issues,
        }), options.output);
        await this.cleanupAndExit(0);
        return;
      }

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
      .option('-F, --format <format>', 'Output format (text|json)', 'text')
      .option('-o, --output <path>', 'Write output to file')
      .action(async (options) => {
        await this.executeHealth(options, context);
      });
  }

  private async executeHealth(options: HealthOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const format = (options.format || 'text') as OutputFormat;

      if (format === 'json') {
        if (options.domain) {
          const health = context.queen!.getDomainHealth(options.domain as DomainName);
          if (!health) {
            writeOutput(toJSON({ error: `Domain not found: ${options.domain}` }), options.output);
            await this.cleanupAndExit(1);
            return;
          }
          writeOutput(toJSON({
            domain: options.domain,
            status: health.status,
            agents: health.agents,
            lastActivity: health.lastActivity?.toISOString() || null,
            errors: health.errors,
          }), options.output);
        } else {
          const health = context.queen!.getHealth();
          const domainSummary: Record<string, unknown> = {};
          for (const [domain, dh] of health.domainHealth) {
            domainSummary[domain] = { status: dh.status, agents: dh.agents };
          }
          writeOutput(toJSON({
            status: health.status,
            lastCheck: health.lastHealthCheck.toISOString(),
            domains: domainSummary,
            issues: health.issues,
            daemon: checkDaemonLiveness(),
          }), options.output);
        }
        await this.cleanupAndExit(0);
        return;
      }

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

        // A18: background worker daemon liveness \u2014 was previously invisible,
        // so a stopped daemon looked identical to "everything's fine".
        const daemon = checkDaemonLiveness();
        console.log(chalk.blue('\n  Background Daemon:'));
        if (!daemon.configured) {
          console.log(`  ${chalk.gray('\u25CB')} Not configured (never started \u2014 run "npx ruflo daemon start")`);
        } else if (daemon.running) {
          console.log(`  ${chalk.green('\u25CF')} Running (PID: ${daemon.pid})`);
        } else {
          console.log(`  ${chalk.red('\u25CF')} Not running (stale PID: ${daemon.pid ?? 'unknown'}) \u2014 learning/consolidation snapshots will not advance`);
        }

        // ADR-123 (issue #557): make LLM billing visible so a paid API key is
        // never a silent surprise.
        printLlmBilling();
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
  format?: string;
  output?: string;
}

interface HealthOptions {
  domain?: string;
  format?: string;
  output?: string;
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
