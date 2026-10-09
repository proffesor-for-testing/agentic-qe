/** Real filesystem failures must not corrupt accepted session entries. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionStore, type SessionEntry, type SessionEntryInput } from '../../../src/mcp/services/session-store';
import { createSessionDurabilityMiddleware } from '../../../src/mcp/services/session-durability-middleware';

let directory: string;
let stores: SessionStore[];
let originalBackend: string | undefined;
let originalDurability: string | undefined;

function entry(timestamp: number, result?: unknown): SessionEntryInput {
  return { timestamp, type: 'tool_result', state: 'idle', result };
}
function store(sessionDirectory = directory): SessionStore {
  const value = new SessionStore(sessionDirectory);
  stores.push(value);
  value.startSession();
  return value;
}
function rows(value: SessionStore): SessionEntry[] {
  return fs.readFileSync(value.getFilePath()!, 'utf-8').trim().split('\n').map(line => JSON.parse(line));
}
function circular(): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  value.self = value;
  return value;
}
function obstruct(value: SessionStore): () => void {
  const file = value.getFilePath()!;
  const saved = file + '.saved';
  fs.renameSync(file, saved);
  fs.mkdirSync(file);
  return () => { fs.rmdirSync(file); fs.renameSync(saved, file); };
}
function expectChain(entries: SessionEntry[], ids: string[]): void {
  expect(entries.map(value => value.uuid)).toEqual(ids);
  expect(entries.map(value => value.parentUuid)).toEqual([null, ...ids.slice(0, -1)]);
}

beforeEach(() => {
  originalBackend = process.env.AQE_MEMORY_BACKEND;
  originalDurability = process.env.AQE_SESSION_DURABILITY;
  delete process.env.AQE_MEMORY_BACKEND;
  delete process.env.AQE_SESSION_DURABILITY;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-write-failures-'));
  stores = [];
});
afterEach(() => {
  // flush cancels the real batch timer even when the owned obstruction remains.
  for (const value of stores) { try { value.close(); } catch { /* failed test cleanup */ } }
  fs.rmSync(directory, { recursive: true, force: true });
  if (originalBackend === undefined) delete process.env.AQE_MEMORY_BACKEND;
  else process.env.AQE_MEMORY_BACKEND = originalBackend;
  if (originalDurability === undefined) delete process.env.AQE_SESSION_DURABILITY;
  else process.env.AQE_SESSION_DURABILITY = originalDurability;
});

describe('SessionStore write exception safety', () => {
  it('keeps first-write metadata and parent chain unchanged after a real directory obstruction', async () => {
    const blocked = path.join(directory, 'blocked');
    fs.writeFileSync(blocked, 'owned obstruction');
    const value = store(blocked);
    const middleware = createSessionDurabilityMiddleware(value);
    const context = { toolName: 'owned_tool', params: {}, timestamp: 123, metadata: {} };
    const initial = value.getMetadata();
    await expect(middleware.preToolCall!(context)).rejects.toThrow();
    expect(value.getMetadata()).toEqual(initial);
    fs.unlinkSync(blocked);
    fs.mkdirSync(blocked);
    expect(await middleware.preToolCall!(context)).toBe(context);
    const first = rows(value)[0].uuid;
    const second = value.append(entry(456));
    value.flush();
    expectChain(rows(value), [first, second]);
    expect(value.getMetadata()).toMatchObject({ entryCount: 2, lastActivityAt: 456, state: 'idle' });
  });

  it('does not accept a first entry that fails JSON serialization', () => {
    const value = store();
    const initial = value.getMetadata();
    expect(() => value.append(entry(123, circular()))).toThrow(TypeError);
    expect(value.getMetadata()).toEqual(initial);
    expect(fs.existsSync(value.getFilePath()!)).toBe(false);
    const first = value.append(entry(456, 'accepted'));
    expectChain(rows(value), [first]);
    expect(value.getMetadata().entryCount).toBe(1);
  });

  it('does not link buffered entries to a rejected serialization attempt', () => {
    const value = store();
    const first = value.append(entry(123));
    const accepted = value.getMetadata();
    expect(() => value.append({ ...entry(456, circular()), state: 'requires_action' })).toThrow(TypeError);
    expect(value.getMetadata()).toEqual(accepted);
    const second = value.append(entry(789));
    value.flush();
    expectChain(rows(value), [first, second]);
    expect(value.getMetadata().entryCount).toBe(2);
  });

  it('retains the batch after a real append failure and does not duplicate a successful retry', () => {
    const value = store();
    const first = value.append(entry(123));
    const second = value.append(entry(456));
    const accepted = value.getMetadata();
    const repair = obstruct(value);
    expect(() => value.flush()).toThrow();
    expect(value.getMetadata()).toEqual(accepted);
    repair();
    value.flush();
    value.flush();
    expectChain(rows(value), [first, second]);
  });

  it('keeps a failed close retryable with the original batch and subsequent accepted entry', () => {
    const value = store();
    const first = value.append(entry(123));
    const second = value.append(entry(456));
    const repair = obstruct(value);
    expect(() => value.close()).toThrow();
    const third = value.append(entry(789));
    repair();
    value.close();
    expectChain(rows(value), [first, second, third]);
    expect(value.getMetadata().entryCount).toBe(3);
    expect(() => value.append(entry(999))).toThrow('No active session');
  });

  it('preserves normal first-write persistence and the real 100ms batch timer', async () => {
    const value = store();
    const first = value.append(entry(123));
    expectChain(rows(value), [first]);
    const second = value.append(entry(456));
    expectChain(rows(value), [first]);
    await new Promise(resolve => setTimeout(resolve, 150));
    expectChain(rows(value), [first, second]);
  });

  it('preserves memory mode without serialization or filesystem writes', () => {
    process.env.AQE_MEMORY_BACKEND = 'memory';
    const blocked = path.join(directory, 'blocked');
    fs.writeFileSync(blocked, 'owned obstruction');
    const value = store(blocked);
    value.append(entry(123, circular()));
    value.append(entry(456, BigInt(1)));
    value.close();
    expect(value.getMetadata()).toMatchObject({ entryCount: 2, lastActivityAt: 456, state: 'idle' });
    expect(fs.readFileSync(blocked, 'utf-8')).toBe('owned obstruction');
    expect(fs.readdirSync(directory)).toEqual(['blocked']);
  });
});
