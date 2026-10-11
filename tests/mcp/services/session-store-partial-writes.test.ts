import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resumeSession } from '../../../src/mcp/services/session-resume';
import { SessionStore, type SessionEntryInput } from '../../../src/mcp/services/session-store';

const fault = vi.hoisted(() => ({ partial: false, failNext: false, shortOnly: false, openFailure: false, closeFailure: false, descriptors: new Set<number>() }));
vi.mock('fs', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs')>();
  const error = () => Object.assign(new Error('Owned partial-write fixture'), { code: 'ENOSPC' });
  const partialFile = (file: fs.PathOrFileDescriptor, data: string | Uint8Array, options: unknown, append: boolean) => {
    if (!fault.partial) return append ? real.appendFileSync(file, data, options as never) : real.writeFileSync(file, data, options as never);
    fault.partial = false;
    const bytes = Buffer.from(data);
    const prefix = bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2)));
    if (append) real.appendFileSync(file, prefix); else real.writeFileSync(file, prefix, options as never);
    throw error();
  };
  return { ...real,
    appendFileSync: (file: fs.PathOrFileDescriptor, data: string | Uint8Array, options: unknown) => {
      if (fault.openFailure) { fault.openFailure = false; throw Object.assign(new Error('Owned open failure'), { code: 'EMFILE' }); }
      if (fault.closeFailure) { fault.closeFailure = false; real.appendFileSync(file, data, options as never); throw new Error('Owned close failure'); }
      return partialFile(file, data, options, true);
    },
    writeFileSync: (file: fs.PathOrFileDescriptor, data: string | Uint8Array, options: unknown) => partialFile(file, data, options, false),
    openSync: (file: fs.PathLike, flags: string) => {
      if (fault.openFailure) { fault.openFailure = false; throw Object.assign(new Error('Owned open failure'), { code: 'EMFILE' }); }
      const fd = real.openSync(file, flags); fault.descriptors.add(fd); return fd;
    },
    closeSync: (fd: number) => {
      try { real.closeSync(fd); } finally { fault.descriptors.delete(fd); }
      if (fault.closeFailure) { fault.closeFailure = false; throw new Error('Owned close failure'); }
    },
    writeSync: (fd: number, data: Buffer, offset: number, length: number) => {
      if (fault.failNext) { fault.failNext = false; throw error(); }
      if (fault.partial) {
        fault.partial = false; fault.failNext = true;
        return real.writeSync(fd, data, offset, Math.max(1, Math.floor(length / 2)));
      }
      return real.writeSync(fd, data, offset, fault.shortOnly ? Math.min(17, length) : length);
    },
  };
});

let directory: string;
let store: SessionStore;
const entry = (timestamp: number, result = 'owned é 🧪'): SessionEntryInput => ({ timestamp, type: 'tool_result', state: 'idle', result });
const rows = () => fs.readFileSync(store.getFilePath()!, 'utf8').trim().split('\n').map(line => JSON.parse(line));
beforeEach(() => {
  vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
  directory = fs.mkdtempSync(join(tmpdir(), 'aqe-partial-journal-'));
  store = new SessionStore(directory); store.startSession();
  fault.partial = fault.failNext = fault.shortOnly = fault.openFailure = fault.closeFailure = false;
});
afterEach(() => {
  fault.partial = fault.failNext = fault.shortOnly = fault.openFailure = fault.closeFailure = false;
  try { store.close(); } finally { fs.rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); }
  expect(fault.descriptors.size).toBe(0);
});

describe('session journal partial-write recovery', () => {
  it('retries only the remaining bytes after a partial batch, including subsequently queued rows', () => {
    const ids = [store.append(entry(1)), store.append(entry(2)), store.append(entry(3))];
    fault.partial = true;
    expect(() => store.flush()).toThrow('Owned partial-write fixture');
    expect(fault.descriptors.size).toBe(0);
    ids.push(store.append(entry(4)));
    store.flush();
    const actual = rows();
    expect(actual.map(value => value.uuid)).toEqual(ids);
    expect(actual.map(value => value.parentUuid)).toEqual([null, ...ids.slice(0, -1)]);
    expect(actual.map(value => value.result)).toEqual(Array(4).fill('owned é 🧪'));
    expect(resumeSession(store.getFilePath()!, { sessionRoot: directory, allowLegacyUnverified: true }).canResume).toBe(true);
  });

  it('does not leave an abandoned partial first row before a successful retry', () => {
    fault.partial = true;
    expect(() => store.append(entry(1))).toThrow('Owned partial-write fixture');
    expect(store.getMetadata().entryCount).toBe(0);
    const id = store.append(entry(2)); store.flush();
    expect(rows()).toMatchObject([{ uuid: id, parentUuid: null, timestamp: 2 }]);
    expect(fs.readdirSync(directory)).toEqual([`${store.getSessionId()}.jsonl`]);
  });

  it('completes repeated short writes without losing Unicode bytes', () => {
    const ids = [store.append(entry(1)), store.append(entry(2))];
    fault.shortOnly = true; store.flush();
    expect(rows().map(value => value.uuid)).toEqual(ids);
    expect(rows()[1].result).toBe('owned é 🧪');
  });

  it('retains accepted rows after an open failure and recovers on the next flush', () => {
    const ids = [store.append(entry(1)), store.append(entry(2))];
    fault.openFailure = true;
    expect(() => store.flush()).toThrow('Owned open failure');
    expect(fault.descriptors.size).toBe(0);
    store.flush();
    expect(rows().map(value => value.uuid)).toEqual(ids);
  });

  it('does not replay completed rows after a close failure', () => {
    const ids = [store.append(entry(1)), store.append(entry(2))];
    fault.closeFailure = true;
    expect(() => store.flush()).toThrow('Owned close failure');
    expect(fault.descriptors.size).toBe(0);
    store.flush();
    expect(rows().map(value => value.uuid)).toEqual(ids);
  });

  it('keeps first-write metadata unchanged after a staging close failure', () => {
    fault.closeFailure = true;
    expect(() => store.append(entry(1))).toThrow('Owned close failure');
    expect(store.getMetadata().entryCount).toBe(0);
    expect(fault.descriptors.size).toBe(0);
    const id = store.append(entry(2));
    expect(rows()).toMatchObject([{ uuid: id, parentUuid: null, timestamp: 2 }]);
  });

});
