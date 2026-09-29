/**
 * Unit tests for the CLI log gate (AQE_LOG_LEVEL / LOG_LEVEL / AQE_VERBOSE).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCommandVerbosity,
  classifyConsoleLine,
  getCliLogLevel,
  installCliLogGate,
  resolveCliLogLevel,
} from '../../../src/cli/log-gate.js';
import { LogLevel, LoggerFactory } from '../../../src/logging/index.js';

describe('resolveCliLogLevel', () => {
  it('should default to WARN when nothing is configured', () => {
    expect(resolveCliLogLevel({})).toBe(LogLevel.WARN);
  });

  it('should honour a caller-supplied default', () => {
    expect(resolveCliLogLevel({}, LogLevel.INFO)).toBe(LogLevel.INFO);
  });

  it('should read LOG_LEVEL case-insensitively', () => {
    expect(resolveCliLogLevel({ LOG_LEVEL: 'error' })).toBe(LogLevel.ERROR);
    expect(resolveCliLogLevel({ LOG_LEVEL: 'Silent' })).toBe(LogLevel.SILENT);
    expect(resolveCliLogLevel({ LOG_LEVEL: 'DEBUG' })).toBe(LogLevel.DEBUG);
  });

  it('should give AQE_LOG_LEVEL precedence over LOG_LEVEL', () => {
    expect(resolveCliLogLevel({ AQE_LOG_LEVEL: 'error', LOG_LEVEL: 'info' })).toBe(LogLevel.ERROR);
  });

  it('should map a truthy AQE_VERBOSE to INFO', () => {
    for (const value of ['1', 'true', 'YES', 'on']) {
      expect(resolveCliLogLevel({ AQE_VERBOSE: value })).toBe(LogLevel.INFO);
    }
    expect(resolveCliLogLevel({ AQE_VERBOSE: 'false' })).toBe(LogLevel.WARN);
    expect(resolveCliLogLevel({ AQE_VERBOSE: '0' })).toBe(LogLevel.WARN);
  });

  it('should let an explicit level override AQE_VERBOSE', () => {
    expect(resolveCliLogLevel({ AQE_VERBOSE: '1', LOG_LEVEL: 'error' })).toBe(LogLevel.ERROR);
  });

  it('should ignore unrecognised values instead of falling back to INFO', () => {
    expect(resolveCliLogLevel({ AQE_LOG_LEVEL: 'loud', LOG_LEVEL: 'error' })).toBe(LogLevel.ERROR);
    expect(resolveCliLogLevel({ LOG_LEVEL: 'verbose' })).toBe(LogLevel.WARN);
  });
});

describe('classifyConsoleLine', () => {
  it('should read the level from structured logger lines', () => {
    expect(classifyConsoleLine('info', '[10:01:10.407] [INFO ] [DreamScheduler] Started')).toBe(LogLevel.INFO);
    expect(classifyConsoleLine('warn', '[10:01:10.407] [WARN ] [security-compliance] No providers')).toBe(LogLevel.WARN);
    expect(classifyConsoleLine('debug', '[2026-09-28T10:01:10.407Z] [DEBUG] [x] y')).toBe(LogLevel.DEBUG);
  });

  it('should treat bracket-tagged lines as diagnostics at the console method level', () => {
    expect(classifyConsoleLine('log', '[UnifiedMemory] Initialized: /tmp/x.db')).toBe(LogLevel.INFO);
    expect(classifyConsoleLine('log', '[RVF] Removed stale lock')).toBe(LogLevel.INFO);
    expect(classifyConsoleLine('log', '[sona-three-loop] WASM loaded')).toBe(LogLevel.INFO);
    expect(classifyConsoleLine('debug', '[hooks] detail')).toBe(LogLevel.DEBUG);
    expect(classifyConsoleLine('warn', '[HybridBackend] Cleanup failed:')).toBe(LogLevel.WARN);
    expect(classifyConsoleLine('error', '[QEKernel] dispose failed')).toBe(LogLevel.ERROR);
  });

  it('should see through ANSI colour codes', () => {
    expect(classifyConsoleLine('log', '\x1b[2m[hooks] System initialized\x1b[22m')).toBe(LogLevel.INFO);
    expect(classifyConsoleLine('log', '   [10:01:10.407] [INFO ] [DreamScheduler] Started')).toBe(LogLevel.INFO);
  });

  it('should pass indented bracketed command output through (severity markers, user data)', () => {
    // aqe security --sast finding lines
    expect(classifyConsoleLine('log', '    [critical] Code Injection via eval(): src/vuln.js:6')).toBeNull();
    // aqe status / aqe coverage: `  ${color('[high]')} ...`
    expect(classifyConsoleLine('log', '  \x1b[31m[high]\x1b[39m Memory usage above threshold')).toBeNull();
    // aqe hooks pre-task Nagual context
    expect(classifyConsoleLine('log', '\x1b[2m  [test-generation] login flow (reward: 0.92)\x1b[22m')).toBeNull();
    // aqe memory get of a stored value "[TODO] fix auth"
    expect(classifyConsoleLine('log', '  [TODO] fix auth')).toBeNull();
  });

  it('should pass regular command output and JSON through', () => {
    expect(classifyConsoleLine('log', '  1 entries in namespace "aqe"')).toBeNull();
    expect(classifyConsoleLine('log', '["a","b"]')).toBeNull();
    expect(classifyConsoleLine('log', '[true]')).toBeNull();
    expect(classifyConsoleLine('log', '[1,2]')).toBeNull();
    expect(classifyConsoleLine('log', { key: 'value' })).toBeNull();
    expect(classifyConsoleLine('error', '  ✗ Key not found')).toBeNull();
  });
});

describe('installCliLogGate', () => {
  type Spies = Record<'log' | 'info' | 'debug' | 'warn' | 'error', ReturnType<typeof vi.fn>>;
  // `spies` are the original console methods; `gated` is the patched console.
  let spies: Spies;
  let gated: Console;
  let stderr: string[];
  let uninstall: () => void;

  const install = (level: LogLevel) => {
    uninstall = installCliLogGate({
      level,
      target: gated,
      writeStderr: (text) => { stderr.push(text); },
    });
  };

  beforeEach(() => {
    spies = { log: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    gated = { ...spies } as unknown as Console;
    stderr = [];
  });

  afterEach(() => {
    uninstall?.();
    LoggerFactory.reset();
  });

  it('should drop INFO diagnostics at the default WARN level', () => {
    install(LogLevel.WARN);
    gated.log('[UnifiedMemory] Initialized');
    gated.info('[10:01:10.407] [INFO ] [DreamScheduler] Started');
    gated.debug('[hooks] detail');

    expect(stderr).toEqual([]);
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
  });

  it('should keep WARN and ERROR diagnostics at the default level', () => {
    install(LogLevel.WARN);
    gated.warn('[10:01:10.407] [WARN ] [security-compliance] No providers');
    gated.error('[QEKernel] dispose failed', 'boom');

    expect(spies.warn).toHaveBeenCalledWith('[10:01:10.407] [WARN ] [security-compliance] No providers');
    expect(spies.error).toHaveBeenCalledWith('[QEKernel] dispose failed', 'boom');
  });

  it('should route INFO diagnostics to stderr, never stdout, at INFO level', () => {
    install(LogLevel.INFO);
    gated.log('[HybridBackend] Initialized with unified memory:', '/tmp/m.db');

    expect(stderr).toEqual(['[HybridBackend] Initialized with unified memory: /tmp/m.db\n']);
    expect(spies.log).not.toHaveBeenCalled();
  });

  it('should suppress every diagnostic when silent', () => {
    install(LogLevel.SILENT);
    gated.warn('[RVF] stale lock');
    gated.error('[10:01:10.407] [ERROR] [kernel] failed');

    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
    expect(stderr).toEqual([]);
  });

  it('should always pass regular command output through, even when silent', () => {
    install(LogLevel.SILENT);
    gated.log('  1 entries in namespace "aqe"');
    gated.error('  ✗ Key not found');

    expect(spies.log).toHaveBeenCalledWith('  1 entries in namespace "aqe"');
    expect(spies.error).toHaveBeenCalledWith('  ✗ Key not found');
  });

  it('should configure LoggerFactory so structured loggers filter at the source', () => {
    install(LogLevel.ERROR);
    expect(getCliLogLevel()).toBe(LogLevel.ERROR);
    expect(LoggerFactory.getLevel()).toBe(LogLevel.ERROR);
    expect(LoggerFactory.create('log-gate-test').isEnabled(LogLevel.WARN)).toBe(false);
  });

  it('should restore the original console methods on uninstall', () => {
    install(LogLevel.WARN);
    gated.log('[UnifiedMemory] x');
    expect(spies.log).not.toHaveBeenCalled();
    uninstall();
    gated.log('[UnifiedMemory] x');
    expect(spies.log).toHaveBeenCalledWith('[UnifiedMemory] x');
  });
});

describe('applyCommandVerbosity', () => {
  let restore: () => void;

  beforeEach(() => {
    const target = { log: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Console;
    restore = installCliLogGate({ level: LogLevel.WARN, target, writeStderr: () => {} });
  });

  afterEach(() => {
    restore();
    LoggerFactory.reset();
  });

  it('should raise the gate to INFO for a command --verbose flag', () => {
    expect(applyCommandVerbosity({ verbose: true }, {})).toBe(true);
    expect(getCliLogLevel()).toBe(LogLevel.INFO);
  });

  it('should leave the gate alone without --verbose', () => {
    expect(applyCommandVerbosity({ verbose: false }, {})).toBe(false);
    expect(applyCommandVerbosity({}, {})).toBe(false);
    expect(getCliLogLevel()).toBe(LogLevel.WARN);
  });

  it('should let an explicit AQE_LOG_LEVEL / LOG_LEVEL win over --verbose', () => {
    expect(applyCommandVerbosity({ verbose: true }, { AQE_LOG_LEVEL: 'error' })).toBe(false);
    expect(applyCommandVerbosity({ verbose: true }, { LOG_LEVEL: 'silent' })).toBe(false);
    expect(getCliLogLevel()).toBe(LogLevel.WARN);
  });
});
