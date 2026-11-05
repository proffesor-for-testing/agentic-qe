/**
 * #1378: JSONReader.readAll() returned [] for a JSON source file that exists
 * but does not parse, so `aqe sync` reported a corrupt store as an empty,
 * successful source (✓, COMPLETED), `verify` counted it as 0, and a corrupt
 * file could not be told from an empty one. Now it is a failed source
 * ("could not be parsed: …"); a missing file is still "not read" (#1377).
 *
 * Real files in a temp directory; no cloud (dry run / no connection).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createJSONReader } from '../../../src/sync/readers/json-reader.js';
import { CloudSyncAgent } from '../../../src/sync/sync-agent.js';
import type { SyncSource } from '../../../src/sync/interfaces.js';

const SECRET = 'SECRET_1378_do_not_print';

let dir: string;
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1378-')));
  fs.writeFileSync(path.join(dir, 'corrupt.json'), `${SECRET}={"not": json`);
  fs.writeFileSync(path.join(dir, 'truncated.json'), '{"memory-1": {"value": "x"}, ');
  fs.writeFileSync(path.join(dir, 'empty.json'), '');
  fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify({ 'memory-1': { value: 'x' }, 'memory-2': { value: 'y' } }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const source = (name: string, file: string): SyncSource => ({
  name, type: 'json', path: file, targetTable: `aqe.${name.replace(/-/g, '_')}`,
  priority: 'medium', mode: 'full', enabled: true,
});
const reader = (file: string) => createJSONReader({ source: source('claude-flow-memory', file), baseDir: dir, environment: 'test' });

describe('JSONReader on a file that exists but does not parse (#1378)', () => {
  it('throws "could not be parsed" with the position, without quoting the file', async () => {
    const r = reader('corrupt.json');
    await r.initialize();
    const error = await r.readAll().then(() => null, (e: Error) => e);
    expect(error?.message).toMatch(/JSON source claude-flow-memory could not be parsed: .*corrupt\.json: not valid JSON/);
    expect(error?.message).not.toContain(SECRET);
    await expect(r.count()).rejects.toThrow(/could not be parsed/);
  });

  it('a truncated file reports where parsing stopped', async () => {
    await expect(reader('truncated.json').readAll()).rejects.toThrow(/not valid JSON at position \d+ \(line 1 column \d+\)/);
  });

  it('an empty file says so', async () => {
    await expect(reader('empty.json').readAll()).rejects.toThrow(/could not be parsed: .*: the file is empty/);
  });

  it('a missing file still has no records and does not exist (not read, #1377)', async () => {
    const r = reader('absent.json');
    await r.initialize();
    expect(r.exists()).toBe(false);
    await expect(r.readAll()).resolves.toEqual([]);
  });

  it('a valid file still reads', async () => {
    await expect(reader('good.json').readAll()).resolves.toHaveLength(2);
  });
});

describe('sync, verify and status on a corrupt JSON source (#1378)', () => {
  async function agent(sources: SyncSource[]) {
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const a = new CloudSyncAgent({
      environment: 'test',
      sync: {
        mode: 'full', interval: '1h', batchSize: 1000, conflictResolution: 'newer-wins',
        sourcePriority: {}, sources, dryRun: true,
      },
    });
    await a.initialize();
    return a;
  }

  it('--full: a corrupt source is a failed result, not ✓ with 0 records', async () => {
    const report = await (await agent([source('claude-flow-memory', 'corrupt.json')])).syncAll();
    expect(report.status).toBe('failed');
    expect(report.results[0]).toMatchObject({
      success: false, recordsSynced: 0, error: expect.stringMatching(/could not be parsed: .*not valid JSON/),
    });
    expect(report.results[0].sourceMissing).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it('--full: next to a source that read, the sync is partial', async () => {
    const report = await (await agent([
      source('claude-flow-memory', 'good.json'), source('intelligence-qlearning', 'corrupt.json'),
    ])).syncAll();
    expect(report.status).toBe('partial');
    expect(report.results.find(r => r.source === 'claude-flow-memory')).toMatchObject({ success: true, recordsSynced: 2 });
  });

  it('a missing source next to a read one still completes (unchanged from #1377)', async () => {
    const report = await (await agent([
      source('claude-flow-memory', 'good.json'), source('intelligence-qlearning', 'absent.json'),
    ])).syncAll();
    expect(report.status).toBe('completed');
    expect(report.results.find(r => r.source === 'intelligence-qlearning')).toMatchObject({ sourceMissing: true });
  });

  it('verify: the corrupt source is unverified with the parse error, never a local count of 0', async () => {
    const result = await (await agent([source('claude-flow-memory', 'corrupt.json')])).verify();
    expect(result.status).toBe('unverified');
    expect(result.results[0]).toMatchObject({
      localCount: -1, status: 'unverified', error: expect.stringMatching(/Local count failed: .*could not be parsed/),
    });
  });

  it('status: the corrupt source carries its error instead of failing the whole status', async () => {
    const status = await (await agent([
      source('claude-flow-memory', 'corrupt.json'), source('intelligence-qlearning', 'good.json'),
    ])).getStatus();
    expect(status.sources.find(s => s.name === 'claude-flow-memory')).toMatchObject({
      recordCount: 0, error: expect.stringMatching(/could not be parsed/),
    });
    expect(status.sources.find(s => s.name === 'intelligence-qlearning')?.error).toBeUndefined();
  });
});
