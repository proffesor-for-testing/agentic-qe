/**
 * IMP-06: Startup Fast Paths - Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectBootMode,
  isVersionFastPath,
  isHealthFastPath,
} from '../../src/boot/fast-paths';
import { parallelPrefetch } from '../../src/boot/parallel-prefetch';

// ---------------------------------------------------------------------------
// detectBootMode
// ---------------------------------------------------------------------------

describe('detectBootMode', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Clear env vars that influence mode detection
    delete process.env.AQE_MCP;
    delete process.env.AQE_MCP_MODE;
    delete process.env.AQE_HTTP_PORT;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('returns "cli-version" for --version flag', () => {
    expect(detectBootMode(['node', 'aqe', '--version'])).toBe('cli-version');
  });

  it('returns "cli-version" for -v flag', () => {
    expect(detectBootMode(['node', 'aqe', '-v'])).toBe('cli-version');
  });

  it('returns "cli-health" for health subcommand', () => {
    expect(detectBootMode(['node', 'aqe', 'health'])).toBe('cli-health');
  });

  it('returns "mcp" when AQE_MCP=1 env var is set', () => {
    process.env.AQE_MCP = '1';
    expect(detectBootMode(['node', 'aqe'])).toBe('mcp');
  });

  it('returns "mcp" when AQE_MCP_MODE=1 env var is set', () => {
    process.env.AQE_MCP_MODE = '1';
    expect(detectBootMode(['node', 'aqe'])).toBe('mcp');
  });

  it('returns "http" when AQE_HTTP_PORT is set', () => {
    process.env.AQE_HTTP_PORT = '8080';
    expect(detectBootMode(['node', 'aqe'])).toBe('http');
  });

  it('returns "cli-full" for normal subcommands like agent spawn', () => {
    expect(detectBootMode(['node', 'aqe', 'agent', 'spawn'])).toBe('cli-full');
  });

  it('prioritises version flag over health subcommand', () => {
    // argv can technically contain both; version should win
    expect(detectBootMode(['node', 'aqe', 'health', '--version'])).toBe('cli-version');
  });

  it('prioritises version flag over env-based mcp mode', () => {
    process.env.AQE_MCP = '1';
    expect(detectBootMode(['node', 'aqe', '--version'])).toBe('cli-version');
  });

  it('prioritises mcp env over http env', () => {
    process.env.AQE_MCP = '1';
    process.env.AQE_HTTP_PORT = '8080';
    expect(detectBootMode(['node', 'aqe'])).toBe('mcp');
  });
});

// ---------------------------------------------------------------------------
// isVersionFastPath
// ---------------------------------------------------------------------------

describe('isVersionFastPath', () => {
  it('returns true for --version', () => {
    expect(isVersionFastPath(['node', 'aqe', '--version'])).toBe(true);
  });

  it('returns true for -v', () => {
    expect(isVersionFastPath(['node', 'aqe', '-v'])).toBe(true);
  });

  it('returns false when no version flag present', () => {
    expect(isVersionFastPath(['node', 'aqe', 'agent', 'list'])).toBe(false);
  });

  it('returns true when flag appears later in argv', () => {
    expect(isVersionFastPath(['node', 'aqe', 'agent', '--version'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isHealthFastPath
// ---------------------------------------------------------------------------

describe('isHealthFastPath', () => {
  it('returns true for health as first positional argument', () => {
    expect(isHealthFastPath(['node', 'aqe', 'health'])).toBe(true);
  });

  it('returns false when health is not at argv[2]', () => {
    expect(isHealthFastPath(['node', 'aqe', 'agent', 'health'])).toBe(false);
  });

  it('returns false when argv is too short', () => {
    expect(isHealthFastPath(['node', 'aqe'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parallelPrefetch
// ---------------------------------------------------------------------------

describe('parallelPrefetch', () => {
  it('runs tasks in parallel (wall time < sequential sum)', async () => {
    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    const taskDurationMs = 50;

    const tasks = [
      { name: 'a', fn: () => delay(taskDurationMs) },
      { name: 'b', fn: () => delay(taskDurationMs) },
      { name: 'c', fn: () => delay(taskDurationMs) },
    ];

    const result = await parallelPrefetch(tasks);

    // If run sequentially these would take >= 150ms.
    // Parallel execution should finish well under that.
    expect(result.totalTimeMs).toBeLessThan(taskDurationMs * tasks.length);
    expect(result.completedTasks).toEqual(['a', 'b', 'c']);
    expect(result.failedTasks).toEqual([]);
  });

  it('handles individual task failures gracefully', async () => {
    const tasks = [
      { name: 'ok-task', fn: async () => {} },
      { name: 'fail-task', fn: async () => { throw new Error('boom'); } },
      { name: 'ok-task-2', fn: async () => {} },
    ];

    const result = await parallelPrefetch(tasks);

    expect(result.completedTasks).toEqual(['ok-task', 'ok-task-2']);
    expect(result.failedTasks).toHaveLength(1);
    expect(result.failedTasks[0].name).toBe('fail-task');
    expect(result.failedTasks[0].error).toBe('boom');
  });

  it('returns correct completed/failed task names', async () => {
    const tasks = [
      { name: 'alpha', fn: async () => {} },
      { name: 'beta', fn: async () => { throw new Error('nope'); } },
      { name: 'gamma', fn: async () => { throw new Error('also nope'); } },
      { name: 'delta', fn: async () => {} },
    ];

    const result = await parallelPrefetch(tasks);

    expect(result.completedTasks).toEqual(['alpha', 'delta']);
    expect(result.failedTasks.map(f => f.name)).toEqual(['beta', 'gamma']);
    expect(result.failedTasks[0].error).toBe('nope');
    expect(result.failedTasks[1].error).toBe('also nope');
  });

  it('handles empty task array', async () => {
    const result = await parallelPrefetch([]);

    expect(result.completedTasks).toEqual([]);
    expect(result.failedTasks).toEqual([]);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    // Should return almost instantly
    expect(result.totalTimeMs).toBeLessThan(50);
  });

  it('captures non-Error rejection reasons as strings', async () => {
    const tasks = [
      { name: 'string-throw', fn: async () => { throw 'raw string error'; } },
    ];

    const result = await parallelPrefetch(tasks);

    expect(result.failedTasks).toHaveLength(1);
    expect(result.failedTasks[0].error).toBe('raw string error');
  });

  it('records totalTimeMs as a positive number', async () => {
    const tasks = [
      { name: 'quick', fn: async () => {} },
    ];

    const result = await parallelPrefetch(tasks);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });
});
