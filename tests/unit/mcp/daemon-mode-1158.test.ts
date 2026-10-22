/**
 * Issue #1158: start-daemon.cjs runs the MCP server with no stdin, so the
 * #513 stdin-EOF guard shut the worker daemon down seconds after it started.
 * `AQE_MCP_DAEMON=1` selects daemon mode, which skips only that guard, and
 * only when stdin is not a client pipe.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DAEMON_MODE_ENV,
  detectStdinKind,
  isDaemonModeRequested,
  resolveStdinGuardMode,
  startDaemonHeartbeat,
} from '../../../src/mcp/daemon-mode';
import { WorkersPhase } from '../../../src/init/phases/10-workers';
import { createDefaultConfig } from '../../../src/init/types';
import type { InitContext } from '../../../src/init/phases/phase-interface';

describe('#1158 isDaemonModeRequested', () => {
  it.each(['1', 'true', 'TRUE', ' yes ', 'on'])('is on for %j', (value) => {
    expect(isDaemonModeRequested({ [DAEMON_MODE_ENV]: value })).toBe(true);
  });

  it.each([undefined, '', '0', 'false', 'off', 'no', 'daemon', '2'])('is off for %j', (value) => {
    expect(isDaemonModeRequested({ [DAEMON_MODE_ENV]: value })).toBe(false);
  });
});

describe('#1158 resolveStdinGuardMode', () => {
  it('keeps the #513 guard for a piped stdin when daemon mode is not requested', () => {
    expect(resolveStdinGuardMode({}, 'pipe')).toEqual({ mode: 'stdio' });
  });

  it('keeps the #513 guard for a non-pipe stdin when daemon mode is not requested', () => {
    expect(resolveStdinGuardMode({}, 'other')).toEqual({ mode: 'stdio' });
  });

  it('selects daemon mode when requested and stdin is not a pipe (stdio: ignore)', () => {
    expect(resolveStdinGuardMode({ [DAEMON_MODE_ENV]: '1' }, 'other')).toEqual({ mode: 'daemon' });
  });

  it('refuses daemon mode, with a warning, when an MCP client is attached over a pipe', () => {
    const decision = resolveStdinGuardMode({ [DAEMON_MODE_ENV]: '1' }, 'pipe');

    expect(decision.mode).toBe('stdio');
    expect(decision.warning).toContain(`${DAEMON_MODE_ENV} ignored: stdin is a pipe`);
  });

  it('never guards an interactive terminal, whatever the environment says', () => {
    expect(resolveStdinGuardMode({}, 'tty')).toEqual({ mode: 'tty' });
    expect(resolveStdinGuardMode({ [DAEMON_MODE_ENV]: '1' }, 'tty')).toEqual({ mode: 'tty' });
  });
});

describe('#1158 detectStdinKind on a real child process', () => {
  const moduleUrl = new URL('../../../src/mcp/daemon-mode.ts', import.meta.url).href;
  const script = `import(${JSON.stringify(moduleUrl)}).then((m) => process.stdout.write(m.detectStdinKind()));`;

  function kindFor(stdin: 'pipe' | 'ignore'): string {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
      stdio: [stdin, 'pipe', 'pipe'], input: stdin === 'pipe' ? '' : undefined, encoding: 'utf-8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }

  it('reports a pipe for a stdio MCP client', () => {
    expect(kindFor('pipe')).toBe('pipe');
  });

  it("reports 'other' for stdio: 'ignore' (/dev/null), as start-daemon.cjs uses", () => {
    expect(kindFor('ignore')).toBe('other');
  });

  it('reports tty when isTTY is set, without touching the descriptor', () => {
    expect(detectStdinKind({ isTTY: true }, -1)).toBe('tty');
  });

  it('treats an unreadable descriptor as a pipe so the guard stays on', () => {
    expect(detectStdinKind({}, -1)).toBe('pipe');
  });
});

describe('#1158 startDaemonHeartbeat', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('logs worker progress each interval until stopped', () => {
    vi.useFakeTimers();
    const log = vi.fn();
    let runs = 0;
    const stop = startDaemonHeartbeat(log, () => ({
      totalWorkers: 11, errorWorkers: 0, totalExecutions: (runs += 3), failedExecutions: 1,
    }), 1000);

    vi.advanceTimersByTime(2000);
    stop();
    vi.advanceTimersByTime(5000);

    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toMatch(/^\[AQE\] Daemon heartbeat: pid \d+, up 1s, 11 workers \(0 in error\), 3 runs \(1 failed\)\n$/);
    expect(log.mock.calls[1][0]).toContain('6 runs');
  });

  it('still logs (and keeps running) when worker status is unavailable or throws', () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const stop = startDaemonHeartbeat(log, () => { throw new Error('not ready'); }, 1000);

    vi.advanceTimersByTime(1000);
    stop();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('workers unavailable'));
  });

  it('holds the event loop open (a ref’d timer), unlike the unref’d worker timers', () => {
    const real = setInterval;
    let refed: boolean | undefined;
    const spy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms: number) => {
      const t = real(fn, ms);
      refed = t.hasRef();
      return t;
    }) as typeof setInterval);
    const stop = startDaemonHeartbeat(() => {}, () => undefined, 60_000);
    stop();
    spy.mockRestore();

    expect(refed).toBe(true);
  });
});

describe('#1158 generated start-daemon.cjs starts the server in daemon mode', () => {
  let tmp: string;
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  async function generate(): Promise<string> {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-1158-daemon-'));
    const projectRoot = join(tmp, 'proj');
    mkdirSync(projectRoot);
    const context: InitContext = {
      projectRoot, options: {}, config: createDefaultConfig('demo', projectRoot),
      enhancements: { claudeFlow: false, ruvector: false }, results: new Map(),
      services: { log: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await new WorkersPhase().execute(context);
    expect(result.success, result.error?.message).toBe(true);
    return join(projectRoot, '.agentic-qe', 'workers');
  }

  /** Run the script with spawn faked; returns the spawn options it used. */
  function spawnOptions(workers: string): { env: Record<string, string>; stdio: unknown[] } {
    const out = join(tmp, 'spawned.json');
    const preload = join(tmp, 'fake-spawn.cjs');
    writeFileSync(preload, `const cp = require('child_process'); const { EventEmitter } = require('events');
      cp.spawn = (cmd, args, opts) => {
        const stdio = opts.stdio.map((s) => typeof s === 'number' ? 'fd' : s);
        require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify({ env: opts.env, stdio }));
        return Object.assign(new EventEmitter(), { pid: 4242, unref() {} });
      };`);
    spawnSync(process.execPath, ['-r', preload, join(workers, 'start-daemon.cjs')], {
      env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(readFileSync(out, 'utf-8'));
  }

  it('sets AQE_MCP_DAEMON=1 and gives the server no stdin', async () => {
    const opts = spawnOptions(await generate());

    expect(opts.env[DAEMON_MODE_ENV]).toBe('1');
    expect(opts.stdio[0]).toBe('ignore');
  });

  it('hands the server daemon.log directly instead of piping through the script', async () => {
    const opts = spawnOptions(await generate());

    expect(opts.stdio.slice(1)).toEqual(['fd', 'fd']);
  });

  it('gives the server no log descriptor when daemon.log is a symlink (#970)', async () => {
    const workers = await generate();
    const victim = join(tmp, 'victim.txt');
    writeFileSync(victim, 'VICTIM\n');
    symlinkSync(victim, join(workers, 'daemon.log'));

    const opts = spawnOptions(workers);

    expect(opts.stdio.slice(1)).toEqual(['ignore', 'ignore']);
    expect(readFileSync(victim, 'utf-8')).toBe('VICTIM\n');
  });
});

describe('#1158 entry.ts wiring', () => {
  const entry = readFileSync(resolve(__dirname, '../../../src/mcp/entry.ts'), 'utf-8');

  it('attaches the stdin-EOF shutdown only in stdio mode', () => {
    expect(entry).toMatch(/if \(stdinGuard\.mode === 'stdio'\) \{\s*process\.stdin\.on\('end', \(\) => \{ void shutdown\('stdin-eof'\); \}\);/);
  });

  it('removes AQE_MCP_DAEMON from the environment once read', () => {
    expect(entry).toContain('delete process.env[DAEMON_MODE_ENV]');
  });
});
