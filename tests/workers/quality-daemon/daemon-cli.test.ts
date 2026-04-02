/**
 * Tests for the QE Quality Daemon CLI commands (IMP-10).
 */

import { describe, it, expect } from 'vitest';
import { createDaemonCommand } from '../../../src/cli/commands/daemon';

describe('Daemon CLI Command', () => {
  it('creates a commander Command with name "daemon"', () => {
    const cmd = createDaemonCommand();
    expect(cmd.name()).toBe('daemon');
  });

  it('has start, stop, status, notifications, and clear-notifications subcommands', () => {
    const cmd = createDaemonCommand();
    const subcommands = cmd.commands.map((c) => c.name());

    expect(subcommands).toContain('start');
    expect(subcommands).toContain('stop');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('notifications');
    expect(subcommands).toContain('clear-notifications');
  });

  it('start command has --tick-interval and --ci-interval options', () => {
    const cmd = createDaemonCommand();
    const start = cmd.commands.find((c) => c.name() === 'start')!;
    const optionNames = start.options.map((o) => o.long);

    expect(optionNames).toContain('--tick-interval');
    expect(optionNames).toContain('--ci-interval');
  });

  it('notifications command has --unread, --limit, and --type options', () => {
    const cmd = createDaemonCommand();
    const notifs = cmd.commands.find((c) => c.name() === 'notifications')!;
    const optionNames = notifs.options.map((o) => o.long);

    expect(optionNames).toContain('--unread');
    expect(optionNames).toContain('--limit');
    expect(optionNames).toContain('--type');
  });
});
