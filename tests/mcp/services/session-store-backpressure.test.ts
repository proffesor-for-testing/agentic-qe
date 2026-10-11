import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore, type SessionEntryInput } from '../../../src/mcp/services/session-store';
import { createSessionDurabilityMiddleware } from '../../../src/mcp/services/session-durability-middleware';
import { resumeSession } from '../../../src/mcp/services/session-resume';

let directory: string;
let stores: SessionStore[];
let restore: (() => void) | undefined;
const input = (timestamp: number, result: unknown = 'owned'): SessionEntryInput => ({ timestamp, type: 'tool_result', state: 'idle', result });
const rows = (store: SessionStore) => fs.readFileSync(store.getFilePath()!, 'utf8').trim().split('\n').map(line => JSON.parse(line));
function create() { const store = new SessionStore(directory); stores.push(store); store.startSession(); store.append(input(1)); return store; }
function obstruct(store: SessionStore) {
  const path = store.getFilePath()!;
  fs.renameSync(path, `${path}.saved`); fs.mkdirSync(path);
  restore = () => { fs.rmdirSync(path); fs.renameSync(`${path}.saved`, path); restore = undefined; };
}
function clearFailedTimer(store: SessionStore) { try { store.flush(); } catch { /* owned persistent obstruction */ } }
beforeEach(() => {
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite'); vi.stubEnv('AQE_SESSION_DURABILITY', 'true');
  directory = fs.mkdtempSync(join(tmpdir(), 'aqe-journal-backpressure-')); stores = [];
});
afterEach(() => { restore?.(); for (const store of stores) store.close(); fs.rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('session journal bounded backpressure', () => {
  it.each([['entries', '', 1100, 1024], ['bytes', 'x'.repeat(128 * 1024), 50, 32]] as const)('bounds accepted %s under persistent owned write failure', (_kind, payload, attempts, maximumAccepted) => {
    const store = create(); obstruct(store);
    const ids: string[] = [];
    let error: unknown;
    for (let i = 0; i < attempts; i++) {
      try { ids.push(store.append(input(i + 2, payload))); } catch (caught) { error = caught; break; }
      clearFailedTimer(store);
    }
    console.log('Observed accepted pending entries:', ids.length);
    expect(error).toMatchObject({ name: 'SessionBufferLimitError' });
    expect(ids.length).toBeLessThanOrEqual(maximumAccepted);
    const before = store.getMetadata();
    expect(() => store.append(input(attempts + 10))).toThrow();
    expect(store.getMetadata()).toEqual(before);
    restore!(); store.flush();
    const actual = rows(store);
    expect(actual.slice(1, 1 + ids.length).map(value => value.uuid)).toEqual(ids);
    expect(actual.at(-1)).toMatchObject({ type: 'error', state: 'requires_action', result: { code: 'SESSION_TRANSCRIPT_GAP' } });
    expect(resumeSession(store.getFilePath()!, { sessionRoot: directory, allowLegacyUnverified: true }).lastState).toBe('requires_action');
  });

  it('returns an already produced result on post-hook pressure and blocks the next pre-hook', async () => {
    const store = create(); obstruct(store);
    const payload = 'x'.repeat(128 * 1024);
    for (let i = 0; i < 31; i++) { store.append(input(i + 2, payload)); clearFailedTimer(store); }
    const before = store.getMetadata();
    const middleware = createSessionDurabilityMiddleware(store);
    const context = { toolName: 'owned_side_effect', params: {}, timestamp: 100, metadata: {} };
    const result = { success: true, data: payload };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await middleware.postToolResult!(context, result)).toBe(result);
    expect(store.getMetadata()).toEqual(before);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('transcript incomplete'));
    let executions = 0;
    await expect((async () => { await middleware.preToolCall!(context); executions++; })()).rejects.toMatchObject({ name: 'SessionBufferLimitError' });
    expect(executions).toBe(0);
    clearFailedTimer(store);
    restore!(); store.flush();
    expect(rows(store).at(-1).result).toMatchObject({ code: 'SESSION_TRANSCRIPT_GAP', rejectedToolResults: 1 });
  });

  it('flushes healthy capacity and retains gap diagnostics beyond the recent projection', () => {
    const store = create(); obstruct(store);
    for (let i = 0; i < 1024; i++) { store.append(input(i + 2)); clearFailedTimer(store); }
    expect(() => store.append(input(1026))).toThrow();
    restore!(); store.flush();
    for (let i = 0; i < 1500; i++) store.append(input(1027 + i));
    store.flush();
    const resumed = resumeSession(store.getFilePath()!, { sessionRoot: directory, allowLegacyUnverified: true });
    expect(resumed.canResume).toBe(true);
    expect(resumed.recentEntries.every(entry => entry.type !== 'error')).toBe(true);
    expect(resumed.diagnostics.join(' ')).toContain('missing lifecycle entries');
    expect(rows(store)).toHaveLength(2526);
  });

  it('keeps automatic flush failures contained and recovers accepted rows', async () => {
    const store = create(); obstruct(store);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = store.append(input(2));
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Journal flush failed'));
    restore!(); store.flush();
    expect(rows(store).map(row => row.uuid)).toContain(id);
    expect(rows(store)).toHaveLength(2);
  });

  it('rejects one oversized pending record without advancing its chain and records its omission', () => {
    const store = create(); const before = store.getMetadata();
    expect(() => store.append(input(2, 'x'.repeat(4 * 1024 * 1024)))).toThrow();
    expect(store.getMetadata()).toEqual(before);
    const id = store.append(input(3)); store.flush();
    const actual = rows(store);
    expect(actual[1].result).toMatchObject({ code: 'SESSION_TRANSCRIPT_GAP', rejectedEntries: 1 });
    expect(actual[2]).toMatchObject({ uuid: id, parentUuid: actual[1].uuid });
  });

  it('preserves database-free bookkeeping without serialization or backlog limits', () => {
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    const store = new SessionStore(directory); stores.push(store); store.startSession();
    const circular: Record<string, unknown> = {}; circular.self = circular;
    for (let i = 0; i < 1100; i++) store.append(input(i, circular));
    expect(store.getMetadata().entryCount).toBe(1100);
    expect(fs.existsSync(store.getFilePath()!)).toBe(false);
  });
});
