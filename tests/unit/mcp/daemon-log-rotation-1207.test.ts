/**
 * Issue #1207: the worker daemon's daemon.log was never rotated. The server's
 * stdout/stderr are daemon.log itself (an O_APPEND descriptor opened by
 * start-daemon.cjs), so the server truncates it in place on its heartbeat once
 * it passes AQE_DAEMON_LOG_MAX_SIZE, after copying it to daemon.log.1, and
 * start-daemon.cjs moves an oversized log aside before it starts the server.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  closeSync, constants, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  rmSync, statSync, symlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DAEMON_LOG_PATH_ENV,
  DEFAULT_DAEMON_HEARTBEAT_MS,
  DEFAULT_DAEMON_LOG_MAX_BYTES,
  createDaemonLogRotator,
  parseDaemonHeartbeatMs,
  parseDaemonLogMaxBytes,
  rotateDaemonLog,
  startDaemonHeartbeat,
} from '../../../src/mcp/daemon-mode';
import { WorkersPhase } from '../../../src/init/phases/10-workers';
import { createDefaultConfig } from '../../../src/init/types';
import type { InitContext } from '../../../src/init/phases/phase-interface';

describe('#1207 parseDaemonLogMaxBytes', () => {
  it.each([
    [undefined, DEFAULT_DAEMON_LOG_MAX_BYTES],
    ['', DEFAULT_DAEMON_LOG_MAX_BYTES],
    ['   ', DEFAULT_DAEMON_LOG_MAX_BYTES],
    ['1024', 1024],
    ['2048', 2048],
    ['512K', 512 * 1024],
    ['512kb', 512 * 1024],
    [' 5M ', 5 * 1024 * 1024],
    ['1G', 1024 ** 3],
    ['0', 0],
    ['off', 0],
    ['Disabled', 0],
  ])('reads %j as %d bytes', (raw, bytes) => {
    expect(parseDaemonLogMaxBytes(raw)).toEqual({ value: bytes });
  });

  it.each(['1023', '-5', '5T', 'big', '1.5M', '10 MB extra'])('rejects %j with a warning and keeps 5M', (raw) => {
    const parsed = parseDaemonLogMaxBytes(raw);

    expect(parsed.value).toBe(DEFAULT_DAEMON_LOG_MAX_BYTES);
    expect(parsed.warning).toContain('AQE_DAEMON_LOG_MAX_SIZE');
  });
});

describe('#1207 parseDaemonHeartbeatMs', () => {
  it.each([[undefined, 60_000], ['', 60_000], ['1', 1000], [' 30 ', 30_000], ['86400', 86_400_000]])(
    'reads %j as %d ms', (raw, ms) => {
      expect(parseDaemonHeartbeatMs(raw)).toEqual({ value: ms });
    });

  it.each(['0', '86401', '-1', '1.5', '1m', 'fast'])('rejects %j with a warning and keeps 60 s', (raw) => {
    const parsed = parseDaemonHeartbeatMs(raw);

    expect(parsed.value).toBe(DEFAULT_DAEMON_HEARTBEAT_MS);
    expect(parsed.warning).toContain('AQE_DAEMON_HEARTBEAT_SECONDS');
  });
});

describe('#1207 rotateDaemonLog on a real O_APPEND descriptor', () => {
  let tmp: string;
  let log: string;
  let fd: number;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-1207-rotate-'));
    log = join(tmp, 'daemon.log');
    fd = openSync(log, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY, 0o644);
  });
  afterEach(() => {
    try { closeSync(fd); } catch { /* closed */ }
    rmSync(tmp, { recursive: true, force: true });
  });

  it('copies an oversized log to daemon.log.1 and truncates it; later writes start at offset 0', () => {
    const old = 'x'.repeat(3000) + '\n';
    writeSync(fd, old);

    const result = rotateDaemonLog(log, 1024, [fd]);
    writeSync(fd, 'after rotation\n');

    expect(result).toEqual({ rotated: true, bytes: old.length, kept: true });
    expect(readFileSync(`${log}.1`, 'utf-8')).toBe(old);
    // No hole of NUL bytes: the O_APPEND descriptor follows the truncation.
    expect(readFileSync(log, 'utf-8')).toBe('after rotation\n');
  });

  it('replaces the previous daemon.log.1, so at most two files exist', () => {
    writeSync(fd, 'a'.repeat(2000));
    rotateDaemonLog(log, 1024, [fd]);
    writeSync(fd, 'b'.repeat(2000));
    rotateDaemonLog(log, 1024, [fd]);

    expect(readFileSync(`${log}.1`, 'utf-8')).toBe('b'.repeat(2000));
    expect(statSync(log).size).toBe(0);
    expect(existsSync(`${log}.2`)).toBe(false);
  });

  it('leaves a log at or under the cap alone', () => {
    writeSync(fd, 'y'.repeat(1024));

    expect(rotateDaemonLog(log, 1024, [fd])).toEqual({ rotated: false, reason: 'under-cap' });
    expect(statSync(log).size).toBe(1024);
    expect(existsSync(`${log}.1`)).toBe(false);
  });

  it('does nothing when rotation is disabled (cap 0)', () => {
    writeSync(fd, 'z'.repeat(5000));

    expect(rotateDaemonLog(log, 0, [fd])).toEqual({ rotated: false, reason: 'disabled' });
    expect(statSync(log).size).toBe(5000);
  });

  it('never truncates a file the given descriptors do not write to', () => {
    const other = join(tmp, 'other.log');
    writeFileSync(other, 'o'.repeat(5000));

    expect(rotateDaemonLog(other, 1024, [fd])).toEqual({ rotated: false, reason: 'not-our-log' });
    expect(statSync(other).size).toBe(5000);
  });

  it('refuses a symlinked daemon.log and leaves its target untouched (#970)', () => {
    const victim = join(tmp, 'victim.txt');
    writeFileSync(victim, 'V'.repeat(5000));
    const linked = join(tmp, 'linked.log');
    symlinkSync(victim, linked);
    const victimFd = openSync(victim, constants.O_APPEND | constants.O_WRONLY);
    try {
      expect(rotateDaemonLog(linked, 1024, [victimFd])).toEqual({ rotated: false, reason: 'not-a-regular-file' });
    } finally { closeSync(victimFd); }
    expect(statSync(victim).size).toBe(5000);
  });

  it('replaces a symlinked daemon.log.1 instead of writing through it (#970)', () => {
    const victim = join(tmp, 'victim.txt');
    writeFileSync(victim, 'VICTIM\n');
    symlinkSync(victim, `${log}.1`);
    writeSync(fd, 'q'.repeat(2000));

    const result = rotateDaemonLog(log, 1024, [fd]);

    expect(result.rotated).toBe(true);
    expect(readFileSync(victim, 'utf-8')).toBe('VICTIM\n');
    expect(lstatSync(`${log}.1`).isSymbolicLink()).toBe(false);
    expect(readFileSync(`${log}.1`, 'utf-8')).toBe('q'.repeat(2000));
  });

  it('still truncates, and says so, when daemon.log.1 cannot be written', () => {
    mkdirSync(`${log}.1`); // rename onto a directory fails
    writeSync(fd, 'w'.repeat(2000));

    const result = rotateDaemonLog(log, 1024, [fd]);

    expect(result).toMatchObject({ rotated: true, bytes: 2000, kept: false });
    expect(statSync(log).size).toBe(0);
  });

  it('createDaemonLogRotator is off without a path or cap, and silent for a log that is not stdout/stderr', () => {
    writeSync(fd, 'r'.repeat(2000));
    const lines: string[] = [];
    const rotate = createDaemonLogRotator(log, 1024, (m) => lines.push(m));
    rotate?.(); // this process's stdout/stderr are not daemon.log

    expect(lines).toEqual([]);
    expect(statSync(log).size).toBe(2000);
    expect(createDaemonLogRotator(undefined, 1024, () => {})).toBeUndefined();
    expect(createDaemonLogRotator(log, 0, () => {})).toBeUndefined();
  });
});

describe('#1207 rotation from a real child whose stdout/stderr are daemon.log', () => {
  let tmp: string;
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('rotates through fd 1/2 and keeps logging to the same file', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-1207-child-'));
    const log = join(tmp, 'daemon.log');
    writeFileSync(log, 'old line\n'.repeat(400)); // 3600 bytes
    const moduleUrl = new URL('../../../src/mcp/daemon-mode.ts', import.meta.url).href;
    const script = `import(${JSON.stringify(moduleUrl)}).then((m) => {
      const rotate = m.createDaemonLogRotator(process.env.${DAEMON_LOG_PATH_ENV}, 1024,
        (line) => process.stderr.write(line));
      rotate();
      process.stdout.write('heartbeat after rotation\\n');
    });`;
    const fd = openSync(log, constants.O_APPEND | constants.O_WRONLY);
    try {
      const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
        stdio: ['ignore', fd, fd], env: { ...process.env, [DAEMON_LOG_PATH_ENV]: log },
      });
      expect(result.status).toBe(0);
    } finally { closeSync(fd); }

    expect(readFileSync(`${log}.1`, 'utf-8')).toBe('old line\n'.repeat(400));
    const fresh = readFileSync(log, 'utf-8');
    expect(fresh).toMatch(/^\[AQE\] daemon\.log rotated: 3600 bytes moved to daemon\.log\.1 \(cap 1024\)\nheartbeat after rotation\n$/);
  });
});

describe('#1207 startDaemonHeartbeat runs the rotation hook before each line', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('calls beforeBeat first, and keeps beating when it throws', () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const stop = startDaemonHeartbeat(
      () => order.push('log'), () => undefined, 1000,
      () => { order.push('rotate'); throw new Error('disk gone'); },
    );

    vi.advanceTimersByTime(2000);
    stop();

    expect(order).toEqual(['rotate', 'log', 'rotate', 'log']);
  });
});

describe('#1207 generated start-daemon.cjs', () => {
  let tmp: string;
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  async function generate(): Promise<string> {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-1207-daemon-'));
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

  /** Run the script with spawn faked; returns the env it gave the server. */
  function spawnEnv(workers: string, env: Record<string, string> = {}): Record<string, string> {
    const out = join(tmp, 'spawned.json');
    const preload = join(tmp, 'fake-spawn.cjs');
    writeFileSync(preload, `const cp = require('child_process'); const { EventEmitter } = require('events');
      cp.spawn = (cmd, args, opts) => {
        require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(opts.env));
        return Object.assign(new EventEmitter(), { pid: 4242, unref() {} });
      };`);
    spawnSync(process.execPath, ['-r', preload, join(workers, 'start-daemon.cjs')], {
      env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(readFileSync(out, 'utf-8'));
  }

  it('tells the server which file daemon.log is', async () => {
    const workers = await generate();

    expect(spawnEnv(workers)[DAEMON_LOG_PATH_ENV]).toBe(join(workers, 'daemon.log'));
  });

  it('moves an oversized daemon.log to daemon.log.1 before starting', async () => {
    const workers = await generate();
    const log = join(workers, 'daemon.log');
    writeFileSync(log, 'stale\n'.repeat(500)); // 3000 bytes

    spawnEnv(workers, { AQE_DAEMON_LOG_MAX_SIZE: '2K' });

    expect(readFileSync(`${log}.1`, 'utf-8')).toBe('stale\n'.repeat(500));
    expect(readFileSync(log, 'utf-8')).toMatch(/^\[[^\]]+\] Starting AQE v3 Worker Daemon/);
  });

  it('keeps a daemon.log under the cap (default 5M) in place', async () => {
    const workers = await generate();
    const log = join(workers, 'daemon.log');
    writeFileSync(log, 'recent\n'.repeat(500));

    spawnEnv(workers);

    expect(existsSync(`${log}.1`)).toBe(false);
    expect(readFileSync(log, 'utf-8').startsWith('recent\n'.repeat(500))).toBe(true);
  });

  it('does not rotate when AQE_DAEMON_LOG_MAX_SIZE=off', async () => {
    const workers = await generate();
    const log = join(workers, 'daemon.log');
    writeFileSync(log, 'k'.repeat(4096));

    spawnEnv(workers, { AQE_DAEMON_LOG_MAX_SIZE: 'off' });

    expect(existsSync(`${log}.1`)).toBe(false);
  });

  it('neither rotates nor names a symlinked daemon.log (#970)', async () => {
    const workers = await generate();
    const victim = join(tmp, 'victim.txt');
    writeFileSync(victim, 'V'.repeat(4096));
    symlinkSync(victim, join(workers, 'daemon.log'));

    const env = spawnEnv(workers, { AQE_DAEMON_LOG_MAX_SIZE: '1K', [DAEMON_LOG_PATH_ENV]: victim });

    expect(env[DAEMON_LOG_PATH_ENV]).toBeUndefined();
    expect(lstatSync(join(workers, 'daemon.log')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(workers, 'daemon.log.1'))).toBe(false);
    expect(readFileSync(victim, 'utf-8')).toBe('V'.repeat(4096));
  });
});
