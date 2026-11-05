/**
 * #1376: when the `pg` driver could not be loaded (require throws, or the
 * module has no Client export), PostgresWriter.connect() swapped in a mock
 * client whose every query returned no rows, so `aqe sync` reported
 * COMPLETED with nothing sent. Now connect() fails with a clear error, the
 * writer keeps no client, and no tunnel is left running.
 *
 * The driver is made unloadable by mocking `module`'s createRequire (what
 * the writer uses to load pg). The tunnel and the local readers are test
 * doubles; no database is touched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

const pgState = vi.hoisted(() => ({ mode: 'throw' as 'throw' | 'no-client' }));
vi.mock('module', async (importOriginal) => {
  const original = await importOriginal<typeof import('module')>();
  return {
    ...original,
    createRequire: (...args: Parameters<typeof original.createRequire>) => {
      const realRequire = original.createRequire(...args);
      return (id: string) => {
        if (id !== 'pg') return realRequire(id);
        if (pgState.mode === 'throw') throw new Error("Cannot find module 'pg'");
        return { types: {} }; // a pg module without a Client export
      };
    },
  };
});

const tunnel = vi.hoisted(() => ({
  active: false,
  start: null as unknown as Mock, stop: null as unknown as Mock,
}));
vi.mock('../../../../src/sync/cloud/tunnel-manager.js', () => ({
  createConnectionManager: () => ({
    start: tunnel.start, stop: tunnel.stop,
    isActive: () => tunnel.active,
    getConnection: () => (tunnel.active ? { host: 'localhost', port: 15432, startedAt: new Date() } : null),
  }),
}));
vi.mock('../../../../src/sync/readers/sqlite-reader.js', () => ({
  createSQLiteReader: () => ({
    name: 'r', type: 'sqlite', initialize: async () => undefined, readAll: async () => [{ id: 'a' }, { id: 'b' }],
    readChanged: async () => [{ id: 'a' }], count: async () => 2, close: async () => undefined,
  }),
}));

import { PostgresWriter } from '../../../../src/sync/cloud/postgres-writer.js';
import { createConnectionManager } from '../../../../src/sync/cloud/tunnel-manager.js';
import { CloudSyncAgent } from '../../../../src/sync/sync-agent.js';
import { PullSyncAgent } from '../../../../src/sync/pull-agent.js';
import type { CloudConfig, SyncSource } from '../../../../src/sync/interfaces.js';

const cloud: CloudConfig = { project: 'p', zone: 'z', instance: 'i', database: 'd', user: 'u', tunnelPort: 15432 };
const DRIVER_ERROR = /PostgreSQL driver \(pg\) could not be loaded: .*Reinstall agentic-qe/;
const sources: SyncSource[] = [{
  name: 'root-qe-patterns', type: 'sqlite', path: 'm.db', targetTable: 'aqe.qe_patterns',
  priority: 'high', mode: 'incremental', enabled: true,
}];

beforeEach(() => {
  tunnel.active = false;
  tunnel.start = vi.fn(async () => { tunnel.active = true; return { host: 'localhost', port: 15432, startedAt: new Date() }; });
  tunnel.stop = vi.fn(async () => { tunnel.active = false; });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe.each(['throw', 'no-client'] as const)('pg driver unloadable (%s) (#1376)', (mode) => {
  beforeEach(() => { pgState.mode = mode; });

  it('connect() fails with the driver error, keeps no client and starts no tunnel', async () => {
    const writer = new PostgresWriter({ cloud, tunnelManager: createConnectionManager(cloud) });
    await expect(writer.connect()).rejects.toThrow(DRIVER_ERROR);
    if (mode === 'no-client') await expect(writer.connect()).rejects.toThrow(/has no Client export/);
    expect(tunnel.start).not.toHaveBeenCalled();
    expect(tunnel.active).toBe(false);
    // Before: a mock client answered every query; now nothing is connected.
    await expect(writer.upsert('aqe.qe_patterns', [{ id: 'a' }])).rejects.toThrow('Not connected');
    await expect(writer.query('SELECT 1')).rejects.toThrow('Not connected');
  });

  it.each(['syncAll', 'syncIncremental'] as const)('aqe sync (%s) is FAILED with the driver error, no tunnel left running', async (method) => {
    const agent = new CloudSyncAgent({
      environment: 'test', cloud,
      sync: { mode: 'full', interval: '1h', batchSize: 1000, conflictResolution: 'newer-wins', sourcePriority: {}, sources },
    });
    await agent.initialize();
    const report = await agent[method]();
    expect(report.status).toBe('failed');
    expect(report.errors.join('\n')).toMatch(DRIVER_ERROR);
    expect(report.totalRecordsSynced).toBe(0);
    expect(tunnel.active).toBe(false);
    // A later attempt tries again (no half-open writer kept, #1377).
    expect((await agent[method]()).status).toBe('failed');
  });

  it('aqe sync verify is UNVERIFIED with the driver error', async () => {
    const agent = new CloudSyncAgent({
      environment: 'test', cloud,
      sync: { mode: 'full', interval: '1h', batchSize: 1000, conflictResolution: 'newer-wins', sourcePriority: {}, sources },
    });
    await agent.initialize();
    const result = await agent.verify();
    expect(result.status).toBe('unverified');
    expect(result.error).toMatch(DRIVER_ERROR);
  });

  it('aqe sync pull fails to initialize with the driver error, no tunnel left running', async () => {
    const agent = new PullSyncAgent({ cloud, dryRun: true });
    await expect(agent.initialize()).rejects.toThrow(DRIVER_ERROR);
    expect(tunnel.start).not.toHaveBeenCalled();
    expect(tunnel.active).toBe(false);
  });
});

describe('the writer owns the tunnel it starts (#1376)', () => {
  class Client {
    static fail = false;
    async connect(): Promise<void> { if (Client.fail) throw new Error('connect ECONNREFUSED'); }
    async query(): Promise<{ rows: unknown[]; rowCount: number }> { return { rows: [], rowCount: 0 }; }
    async end(): Promise<void> {}
  }
  beforeEach(() => { Client.fail = false; });

  it('a failed client connect stops the tunnel it started and keeps no client', async () => {
    Client.fail = true;
    const writer = new PostgresWriter({ cloud, tunnelManager: createConnectionManager(cloud), pgModule: { Client } });
    await expect(writer.connect()).rejects.toThrow('connect ECONNREFUSED');
    expect(tunnel.start).toHaveBeenCalledOnce();
    expect(tunnel.stop).toHaveBeenCalledOnce();
    expect(tunnel.active).toBe(false);
    await expect(writer.query('SELECT 1')).rejects.toThrow('Not connected');
  });

  it('close() stops a tunnel the writer started', async () => {
    const writer = new PostgresWriter({ cloud, tunnelManager: createConnectionManager(cloud), pgModule: { Client } });
    await writer.connect();
    expect(tunnel.active).toBe(true);
    await writer.close();
    expect(tunnel.stop).toHaveBeenCalledOnce();
    expect(tunnel.active).toBe(false);
  });

  it('close() leaves an already-running tunnel alone', async () => {
    tunnel.active = true;
    const writer = new PostgresWriter({ cloud, tunnelManager: createConnectionManager(cloud), pgModule: { Client } });
    await writer.connect();
    await writer.close();
    expect(tunnel.start).not.toHaveBeenCalled();
    expect(tunnel.stop).not.toHaveBeenCalled();
  });
});
