/**
 * Agentic QE v3 - Heartbeat Command Handler
 * Imp-10: Token-Free Heartbeat Scheduler CLI Integration
 *
 * Handles the 'aqe heartbeat' command with subcommands:
 *   status, run-now, history, log, pause, resume
 */

import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ICommandHandler, CLIContext, formatDuration } from './interfaces.js';
import { HeartbeatSchedulerWorker } from '../../workers/workers/heartbeat-scheduler.js';
import type { WorkerResult } from '../../workers/interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { findProjectRoot } from '../../kernel/unified-memory.js';

// ============================================================================
// Heartbeat Handler
// ============================================================================

export class HeartbeatHandler implements ICommandHandler {
  readonly name = 'heartbeat';
  readonly description = 'Manage the token-free heartbeat scheduler';

  private cleanupAndExit: (code: number) => Promise<never>;
  private worker: HeartbeatSchedulerWorker;

  constructor(cleanupAndExit: (code: number) => Promise<never>) {
    this.cleanupAndExit = cleanupAndExit;
    this.worker = new HeartbeatSchedulerWorker();
  }

  register(program: Command, _context: CLIContext): void {
    const heartbeat = program
      .command('heartbeat')
      .description(this.description);

    heartbeat
      .command('status')
      .description('Show heartbeat worker status, health, and schedule')
      .action(async () => {
        await this.executeStatus();
      });

    heartbeat
      .command('run-now')
      .description('Trigger an immediate heartbeat cycle')
      .option('-t, --timeout <ms>', 'Timeout in milliseconds (default: worker built-in 60s)')
      .action(async (options: { timeout?: string }) => {
        const timeout = options.timeout ? parseInt(options.timeout, 10) : undefined;
        await this.executeRunNow(timeout);
      });

    heartbeat
      .command('history')
      .description('Show recent heartbeat results')
      .option('-n, --count <count>', 'Number of entries to show', '10')
      .action(async (options: { count: string }) => {
        await this.executeHistory(parseInt(options.count, 10) || 10);
      });

    heartbeat
      .command('log')
      .description("Show today's daily log entries")
      .option('-d, --date <date>', 'Show log for specific date (YYYY-MM-DD)')
      .action(async (options: { date?: string }) => {
        await this.executeLog(options.date);
      });

    heartbeat
      .command('pause')
      .description('Pause the heartbeat worker')
      .action(async () => {
        await this.executePause();
      });

    heartbeat
      .command('resume')
      .description('Resume the heartbeat worker')
      .action(async () => {
        await this.executeResume();
      });
  }

  // --------------------------------------------------------------------------
  // Subcommand Implementations
  // --------------------------------------------------------------------------

  private async executeStatus(): Promise<void> {
    try {
      await this.worker.initialize();
      const health = this.worker.getHealth();
      const lastResult = this.worker.lastResult;

      console.log(chalk.blue('\n  Heartbeat Scheduler Status'));
      console.log(chalk.gray('  ' + '\u2500'.repeat(35)));

      console.log(`  Status:         ${statusColor(health.status)}`);
      console.log(`  Health Score:   ${scoreColor(health.healthScore)}${chalk.gray('/100')}`);

      if (this.worker.lastRunAt) {
        const ago = formatRelativeTime(this.worker.lastRunAt);
        console.log(`  Last Run:       ${chalk.cyan(this.worker.lastRunAt.toISOString().replace('T', ' ').slice(0, 19))} ${chalk.gray(`(${ago})`)}`);
      } else {
        console.log(`  Last Run:       ${chalk.gray('never')}`);
      }

      if (this.worker.nextRunAt) {
        const until = formatRelativeTime(this.worker.nextRunAt, true);
        console.log(`  Next Run:       ${chalk.cyan(this.worker.nextRunAt.toISOString().replace('T', ' ').slice(0, 19))} ${chalk.gray(`(${until})`)}`);
      }

      console.log(`  Total Runs:     ${chalk.cyan(String(health.totalExecutions))}`);
      const successRate = health.totalExecutions > 0
        ? ((health.successfulExecutions / health.totalExecutions) * 100).toFixed(1)
        : '100.0';
      console.log(`  Success Rate:   ${chalk.cyan(successRate + '%')}`);

      if (lastResult?.metrics?.domainMetrics) {
        const dm = lastResult.metrics.domainMetrics;
        console.log('');
        console.log(chalk.blue('  Last Result:'));
        console.log(`    Promoted:     ${chalk.cyan(String(dm.promoted ?? 0))} patterns`);
        console.log(`    Deprecated:   ${chalk.cyan(String(dm.deprecated ?? 0))} patterns`);
        console.log(`    Decayed:      ${chalk.cyan(String(dm.decayed ?? 0))} patterns`);
        console.log(`    Pending Exp:  ${chalk.cyan(String(dm.pendingExperiences ?? 0))}`);
        console.log(`    Avg Conf:     ${chalk.cyan(String(dm.avgConfidence ?? 0))}`);
      }

      console.log('');
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to get heartbeat status:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  private async executeRunNow(timeoutMs?: number): Promise<void> {
    try {
      console.log(chalk.blue('\n  Triggering heartbeat cycle...\n'));

      await this.worker.initialize();

      const abortController = new AbortController();

      // Only add external timeout if the user explicitly requests one shorter
      // than the worker's built-in 60s timeout.
      const timeoutHandle = timeoutMs && timeoutMs > 0
        ? setTimeout(() => abortController.abort(), timeoutMs)
        : null;

      // Use a real logger that outputs to the console, and a lightweight
      // event bus / memory — the heartbeat worker only needs DB access
      // (which it gets via getUnifiedMemory() internally).
      const result: WorkerResult = await this.worker.execute({
        eventBus: { publish: async () => {} },
        memory: {
          get: async () => undefined,
          set: async () => {},
          search: async () => [],
        },
        logger: {
          debug: () => {},
          info: (...args: unknown[]) => console.log(chalk.gray('  [heartbeat]'), ...args),
          warn: (...args: unknown[]) => console.warn(chalk.yellow('  [heartbeat]'), ...args),
          error: (...args: unknown[]) => console.error(chalk.red('  [heartbeat]'), ...args),
        },
        domains: {
          getDomainAPI: () => undefined,
          getDomainHealth: () => ({ status: 'healthy', errors: [] }),
        },
        signal: abortController.signal,
      });

      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (result.success) {
        const dm = result.metrics.domainMetrics;
        console.log(chalk.green('  Heartbeat cycle complete.'));
        console.log(`  Duration:       ${chalk.cyan(formatDuration(result.durationMs))}`);
        console.log(`  Health Score:   ${scoreColor(result.metrics.healthScore)}${chalk.gray('/100')}`);
        console.log(`  Trend:          ${trendColor(result.metrics.trend)}`);
        console.log(`  Promoted:       ${chalk.cyan(String(dm.promoted ?? 0))}`);
        console.log(`  Deprecated:     ${chalk.cyan(String(dm.deprecated ?? 0))}`);
        console.log(`  Decayed:        ${chalk.cyan(String(dm.decayed ?? 0))}`);
        console.log(`  Findings:       ${chalk.cyan(String(result.findings.length))}`);
      } else {
        console.error(chalk.red('  Heartbeat cycle failed:'), result.error);
      }

      // Store history entry
      storeHistoryEntry(result);

      console.log('');
      await this.cleanupAndExit(result.success ? 0 : 1);
    } catch (error) {
      console.error(chalk.red('\n  Failed to run heartbeat:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  private async executeHistory(count: number): Promise<void> {
    try {
      const entries = loadHistoryEntries(count);

      if (entries.length === 0) {
        console.log(chalk.yellow('\n  No heartbeat history found. Run `aqe heartbeat run-now` first.\n'));
        await this.cleanupAndExit(0);
        return;
      }

      console.log(chalk.blue(`\n  Heartbeat History (last ${entries.length})`));
      console.log(chalk.gray('  ' + '\u2500'.repeat(60)));

      for (const entry of entries) {
        const status = entry.success ? chalk.green('OK') : chalk.red('FAIL');
        const ts = entry.timestamp.slice(0, 19).replace('T', ' ');
        const dm = entry.domainMetrics || {};
        console.log(
          `  ${chalk.gray(ts)}  ${status}  ` +
          `score:${chalk.cyan(String(entry.healthScore))}  ` +
          `+${dm.promoted ?? 0}/-${dm.deprecated ?? 0}  ` +
          `${chalk.gray(formatDuration(entry.durationMs))}`
        );
      }

      console.log('');
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to load history:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  private async executeLog(date?: string): Promise<void> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      // Validate date format to prevent path traversal (CLI-MCP parity with heartbeat-handlers.ts)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        console.error(chalk.red(`\n  Invalid date format: "${targetDate}". Use YYYY-MM-DD.\n`));
        await this.cleanupAndExit(1);
        return;
      }

      const logDir = path.join(findProjectRoot(), '.agentic-qe', 'logs');
      const logPath = path.join(logDir, `${targetDate}.md`);

      if (!fs.existsSync(logPath)) {
        console.log(chalk.yellow(`\n  No daily log found for ${targetDate}.\n`));
        await this.cleanupAndExit(0);
        return;
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      console.log(chalk.blue(`\n  Daily Log \u2014 ${targetDate}`));
      console.log(chalk.gray('  ' + '\u2500'.repeat(40)));
      // Indent and display each line
      for (const line of content.split('\n')) {
        if (line.trim()) {
          console.log(`  ${line}`);
        }
      }
      console.log('');
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to read daily log:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  private async executePause(): Promise<void> {
    try {
      this.worker.pause();
      console.log(chalk.yellow('\n  Heartbeat worker paused.\n'));
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to pause heartbeat:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  private async executeResume(): Promise<void> {
    try {
      this.worker.resume();
      console.log(chalk.green('\n  Heartbeat worker resumed.\n'));
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to resume heartbeat:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Manage the token-free heartbeat scheduler (Imp-10).

The heartbeat runs every 30 minutes performing SQL-only maintenance:
  - Pattern promotion checks
  - Stale pattern deprecation
  - Confidence decay application
  - Experience buffer monitoring
  - Daily Markdown log entries

Subcommands:
  status    Show heartbeat worker status, health, and schedule
  run-now   Trigger an immediate heartbeat cycle
  history   Show recent heartbeat results (last 10)
  log       Show today's daily log entries
  pause     Pause the heartbeat worker
  resume    Resume the heartbeat worker

Examples:
  aqe heartbeat status
  aqe heartbeat run-now
  aqe heartbeat history -n 5
  aqe heartbeat log
  aqe heartbeat log --date 2026-03-25
  aqe heartbeat pause
  aqe heartbeat resume
`;
  }
}

// ============================================================================
// History Persistence
// ============================================================================

interface HeartbeatHistoryEntry {
  timestamp: string;
  success: boolean;
  durationMs: number;
  healthScore: number;
  domainMetrics: Record<string, number | string>;
}

const MAX_HISTORY_ENTRIES = 100;

function getHistoryPath(): string {
  return path.join(findProjectRoot(), '.agentic-qe', 'heartbeat-history.json');
}

function storeHistoryEntry(result: WorkerResult): void {
  try {
    const historyPath = getHistoryPath();
    const dir = path.dirname(historyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let entries: HeartbeatHistoryEntry[] = [];
    if (fs.existsSync(historyPath)) {
      try {
        entries = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      } catch {
        entries = [];
      }
    }

    entries.unshift({
      timestamp: result.timestamp.toISOString(),
      success: result.success,
      durationMs: result.durationMs,
      healthScore: result.metrics.healthScore,
      domainMetrics: result.metrics.domainMetrics,
    });

    // Prune to max entries
    if (entries.length > MAX_HISTORY_ENTRIES) {
      entries = entries.slice(0, MAX_HISTORY_ENTRIES);
    }

    fs.writeFileSync(historyPath, JSON.stringify(entries, null, 2));
  } catch {
    // Non-critical: don't fail the command if history persistence fails
  }
}

function loadHistoryEntries(count: number): HeartbeatHistoryEntry[] {
  try {
    const historyPath = getHistoryPath();
    if (!fs.existsSync(historyPath)) {
      return [];
    }
    const entries: HeartbeatHistoryEntry[] = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    return entries.slice(0, count);
  } catch {
    return [];
  }
}

// ============================================================================
// Display Helpers
// ============================================================================

function statusColor(status: string): string {
  switch (status) {
    case 'idle': return chalk.cyan(status);
    case 'running': return chalk.yellow(status);
    case 'paused': return chalk.yellow(status);
    case 'stopped': return chalk.gray(status);
    case 'error': return chalk.red(status);
    default: return chalk.white(status);
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return chalk.green(String(score));
  if (score >= 50) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

function trendColor(trend: string): string {
  switch (trend) {
    case 'improving': return chalk.green(trend);
    case 'stable': return chalk.cyan(trend);
    case 'degrading': return chalk.red(trend);
    default: return chalk.gray(trend);
  }
}

function formatRelativeTime(date: Date, future = false): string {
  const diffMs = future ? date.getTime() - Date.now() : Date.now() - date.getTime();
  if (diffMs < 0) return future ? 'now' : 'just now';
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ${future ? 'from now' : 'ago'}`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ${future ? 'from now' : 'ago'}`;
  return `${Math.floor(diffMs / 3_600_000)}h ${future ? 'from now' : 'ago'}`;
}

// ============================================================================
// Factory
// ============================================================================

export function createHeartbeatHandler(
  cleanupAndExit: (code: number) => Promise<never>
): HeartbeatHandler {
  return new HeartbeatHandler(cleanupAndExit);
}
