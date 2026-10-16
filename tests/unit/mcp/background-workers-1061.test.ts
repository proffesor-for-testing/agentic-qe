/**
 * Issue #1061: the MCP server started the worker daemon and QualityDaemon
 * even when AQE_WORKERS_ENABLED=false (which `aqe init --no-database` writes).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { daemonStart, qualityStart, getDaemon } = vi.hoisted(() => {
  const daemonStart = vi.fn(async () => undefined);
  const qualityStart = vi.fn(async () => undefined);
  const getDaemon = vi.fn(() => ({
    start: daemonStart,
    getStatus: () => ({ workerManager: { totalWorkers: 11 } }),
    getQualityDaemon: () => ({ start: qualityStart }),
  }));
  return { daemonStart, qualityStart, getDaemon };
});

vi.mock('../../../src/workers/daemon.js', () => ({ getDaemon }));
vi.mock('../../../src/kernel/unified-memory.js', () => ({
  UnifiedMemoryManager: { getInstanceAsync: async () => ({}) },
}));
vi.mock('../../../src/workers/quality-daemon/persistent-memory.js', () => ({
  PersistentWorkerMemory: class {},
}));

import { startBackgroundWorkers } from '../../../src/mcp/background-workers';

describe('#1061 startBackgroundWorkers honours AQE_WORKERS_ENABLED', () => {
  beforeEach(() => {
    daemonStart.mockClear();
    qualityStart.mockClear();
    getDaemon.mockClear();
  });

  it('starts neither the worker daemon nor the quality daemon when AQE_WORKERS_ENABLED=false', async () => {
    const log = vi.fn();

    const outcome = await startBackgroundWorkers(log, { AQE_WORKERS_ENABLED: 'false' });

    expect(outcome).toBe('disabled');
    expect(getDaemon).not.toHaveBeenCalled();
    expect(daemonStart).not.toHaveBeenCalled();
    expect(qualityStart).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain('[MCP] Background workers disabled (AQE_WORKERS_ENABLED=false)');
  });

  it('starts both daemons when AQE_WORKERS_ENABLED is unset (unchanged default)', async () => {
    const outcome = await startBackgroundWorkers(vi.fn(), {});

    expect(outcome).toBe('started');
    expect(daemonStart).toHaveBeenCalledTimes(1);
    expect(qualityStart).toHaveBeenCalledTimes(1);
  });

  it('starts both daemons when AQE_WORKERS_ENABLED=true', async () => {
    const outcome = await startBackgroundWorkers(vi.fn(), { AQE_WORKERS_ENABLED: 'true' });

    expect(outcome).toBe('started');
    expect(daemonStart).toHaveBeenCalledTimes(1);
    expect(qualityStart).toHaveBeenCalledTimes(1);
  });
});
