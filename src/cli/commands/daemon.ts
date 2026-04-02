/**
 * Agentic QE v3 - Daemon CLI Commands (IMP-10)
 *
 * Commands for managing the QE Quality Daemon:
 *   aqe daemon start [--detached]
 *   aqe daemon stop
 *   aqe daemon status
 *   aqe daemon notifications [--unread] [--limit N] [--type TYPE]
 *   aqe daemon clear-notifications
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { QualityDaemon, type QualityDaemonConfig } from '../../workers/quality-daemon';
import { PersistentWorkerMemory } from '../../workers/quality-daemon/persistent-memory';
import { isPrivateIp } from '../../hooks/security/ssrf-guard';
import type { WorkerMemory } from '../../workers/interfaces';

// In-process daemon instance (non-detached mode)
let activeDaemon: QualityDaemon | undefined;

export function createDaemonCommand(): Command {
  const daemon = new Command('daemon')
    .description('Manage the QE Quality Daemon')
    .addHelpText('after', `
Examples:
  aqe daemon start               Start daemon in foreground
  aqe daemon stop                Stop running daemon
  aqe daemon status              Show daemon health and queue depth
  aqe daemon notifications       List recent notifications
  aqe daemon clear-notifications Clear all notifications
`);

  // --- start ---
  daemon
    .command('start')
    .description('Start the QE Quality Daemon')
    .option('--tick-interval <ms>', 'Tick interval in milliseconds', '30000')
    .option('--ci-interval <ms>', 'CI poll interval in milliseconds', '300000')
    .action(async (options: { tickInterval: string; ciInterval: string }) => {
      if (activeDaemon?.running) {
        console.log(chalk.yellow('Daemon is already running'));
        const status = activeDaemon.getStatus();
        console.log(chalk.gray(`  Uptime: ${status.uptimeSeconds}s, Ticks: ${status.tickCount}`));
        return;
      }

      const config: QualityDaemonConfig = {
        tickIntervalMs: parseInt(options.tickInterval, 10),
        ciPollIntervalMs: parseInt(options.ciInterval, 10),
        notifications: {
          // IMP-07 SSRF guard for webhook URLs (Finding 5)
          urlValidator: (url: string) => {
            try {
              const parsed = new URL(url);
              const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
              return !isPrivateIp(hostname);
            } catch {
              return false;
            }
          },
        },
      };

      activeDaemon = new QualityDaemon(config);

      // Use persistent SQLite-backed memory when available, fall back to in-memory
      let memory: WorkerMemory;
      try {
        const { UnifiedMemoryManager } = await import('../../kernel/unified-memory.js');
        const unifiedMemory = await UnifiedMemoryManager.getInstanceAsync();
        memory = new PersistentWorkerMemory(unifiedMemory);
        console.log(chalk.gray('  Storage: SQLite (persistent)'));
      } catch {
        // Fallback for environments where kernel isn't available
        const store = new Map<string, unknown>();
        memory = {
          async get<T>(key: string): Promise<T | undefined> { return store.get(key) as T | undefined; },
          async set<T>(key: string, value: T): Promise<void> { store.set(key, value); },
          async search(pattern: string): Promise<string[]> {
            const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped.replace(/\*/g, '.*'));
            return Array.from(store.keys()).filter((k) => regex.test(k));
          },
        };
        console.log(chalk.yellow('  Storage: in-memory (no SQLite available, state will not persist)'));
      }

      console.log(chalk.green('Starting QE Quality Daemon...'));
      await activeDaemon.start(memory);

      console.log(chalk.green('QE Quality Daemon started'));
      console.log(chalk.gray(`  Tick interval: ${config.tickIntervalMs}ms`));
      console.log(chalk.gray(`  CI poll interval: ${config.ciPollIntervalMs}ms`));
      console.log(chalk.gray(`  PID: ${process.pid}`));
      console.log(chalk.gray('\n  Press Ctrl+C to stop'));

      // Keep process alive
      const keepAlive = setInterval(() => {
        if (!activeDaemon?.running) {
          clearInterval(keepAlive);
        }
      }, 5000);

      // Graceful shutdown
      const shutdown = async () => {
        console.log(chalk.yellow('\nStopping QE Quality Daemon...'));
        await activeDaemon?.stop();
        clearInterval(keepAlive);
        console.log(chalk.green('Daemon stopped'));
        process.exit(0);
      };

      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });

  // --- stop ---
  daemon
    .command('stop')
    .description('Stop the QE Quality Daemon')
    .action(async () => {
      if (!activeDaemon?.running) {
        console.log(chalk.yellow('No running daemon found'));
        return;
      }

      await activeDaemon.stop();
      console.log(chalk.green('Daemon stopped'));
      activeDaemon = undefined;
    });

  // --- status ---
  daemon
    .command('status')
    .description('Show daemon health and queue status')
    .action(() => {
      if (!activeDaemon) {
        console.log(chalk.yellow('No daemon instance (start with: aqe daemon start)'));
        return;
      }

      const s = activeDaemon.getStatus();

      console.log(chalk.bold('\nQE Quality Daemon Status'));
      console.log(chalk.gray('─'.repeat(40)));

      console.log(`  Running:     ${s.running ? chalk.green('yes') : chalk.red('no')}`);
      console.log(`  Uptime:      ${formatUptime(s.uptimeSeconds)}`);
      console.log(`  Ticks:       ${s.tickCount}`);
      console.log(`  Throttled:   ${s.throttled ? chalk.yellow('yes') : chalk.green('no')}`);

      console.log(chalk.bold('\n  Queue Depth'));
      console.log(`    Now:       ${s.queueDepth.now}`);
      console.log(`    Next:      ${s.queueDepth.next}`);
      console.log(`    Later:     ${s.queueDepth.later}`);

      console.log(chalk.bold('\n  Health'));
      console.log(`    CI:        ${healthColor(s.ciHealth)}${s.ciHealth}%${chalk.reset('')}`);
      console.log(`    Coverage:  ${healthColor(s.coverageHealth)}${s.coverageHealth}%${chalk.reset('')}`);

      console.log(chalk.bold('\n  Activity'));
      console.log(`    Commits:   ${s.commitsAnalyzed}`);
      console.log(`    Suggestions: ${s.suggestionsGenerated}`);
      console.log(`    Notifications: ${s.notificationsSent}`);
      console.log();
    });

  // --- notifications ---
  daemon
    .command('notifications')
    .description('List recent notifications')
    .option('--unread', 'Show only unread notifications')
    .option('--limit <n>', 'Maximum notifications to show', '20')
    .option('--type <type>', 'Filter by type (gate_failure, coverage_drop, flaky_detected, etc.)')
    .action((options: { unread?: boolean; limit: string; type?: string }) => {
      if (!activeDaemon) {
        console.log(chalk.yellow('No daemon instance'));
        return;
      }

      const notifications = activeDaemon.notificationService.list({
        unreadOnly: options.unread,
        limit: parseInt(options.limit, 10),
        type: options.type as any,
      });

      if (notifications.length === 0) {
        console.log(chalk.gray('No notifications'));
        return;
      }

      console.log(chalk.bold(`\nNotifications (${notifications.length})`));
      console.log(chalk.gray('─'.repeat(60)));

      for (const n of notifications) {
        const icon = severityIcon(n.severity);
        const time = new Date(n.timestamp).toLocaleString();
        const readMark = n.read ? chalk.gray('✓') : chalk.yellow('●');

        console.log(`${readMark} ${icon} ${chalk.bold(n.title)}`);
        console.log(`    ${n.message}`);
        console.log(chalk.gray(`    ${time} [${n.type}]`));
        console.log();
      }
    });

  // --- clear-notifications ---
  daemon
    .command('clear-notifications')
    .description('Clear all notifications')
    .action(() => {
      if (!activeDaemon) {
        console.log(chalk.yellow('No daemon instance'));
        return;
      }

      const count = activeDaemon.notificationService.clear();
      console.log(chalk.green(`Cleared ${count} notifications`));
    });

  return daemon;
}

// ============================================================================
// Helpers
// ============================================================================

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function healthColor(score: number): string {
  if (score >= 80) return chalk.green('');
  if (score >= 60) return chalk.yellow('');
  return chalk.red('');
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return chalk.red('!!');
    case 'high': return chalk.red('!');
    case 'medium': return chalk.yellow('~');
    case 'low': return chalk.blue('-');
    case 'info': return chalk.gray('i');
    default: return ' ';
  }
}
