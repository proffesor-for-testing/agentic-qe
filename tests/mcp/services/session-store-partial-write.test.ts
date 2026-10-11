/**
 * Issue #910: session journal behaviour on a disk that fails partway through a write.
 *
 * The fs mock below is a real failure injector, not a stub: writes go to the real
 * file until a byte budget runs out. Then the remaining call either writes the bytes
 * that still fit (a short write) or throws ENOSPC, as a full disk does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionStore, type SessionEntry, type SessionEntryInput } from '../../../src/mcp/services/session-store';
import { resumeSession } from '../../../src/mcp/services/session-resume';

const disk = vi.hoisted(() => ({ budget: null as number | null, zeroWrites: false, closeFails: false }));

function enospc(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error('ENOSPC: no space left on device, write');
  error.code = 'ENOSPC';
  return error;
}

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    // Node's appendFileSync loops writeSync, so a full disk leaves a written prefix behind.
    appendFileSync: (file: fs.PathOrFileDescriptor, data: string | Uint8Array, options?: fs.WriteFileOptions) => {
      if (disk.budget === null) return actual.appendFileSync(file, data, options);
      const bytes = Buffer.from(data as string);
      if (bytes.length <= disk.budget) {
        disk.budget -= bytes.length;
        return actual.appendFileSync(file, bytes);
      }
      actual.appendFileSync(file, bytes.subarray(0, disk.budget));
      disk.budget = 0;
      throw enospc();
    },
    writeSync: (fd: number, buffer: NodeJS.ArrayBufferView, offset?: number, length?: number, position?: number | null) => {
      if (disk.zeroWrites) return 0;
      if (disk.budget === null) return actual.writeSync(fd, buffer, offset, length, position);
      if (disk.budget === 0) throw enospc();
      const requested = length ?? buffer.byteLength - (offset ?? 0);
      const count = Math.min(requested, disk.budget);
      disk.budget -= count;
      return actual.writeSync(fd, buffer, offset, count, position);
    },
    closeSync: (fd: number) => {
      actual.closeSync(fd);
      if (disk.closeFails) throw Object.assign(new Error('EIO: i/o error, close'), { code: 'EIO' });
    },
  };
});

let directory: string;
let stores: SessionStore[];

function entry(timestamp: number, result?: unknown): SessionEntryInput {
  return { timestamp, type: 'tool_result', state: 'idle', result };
}
function open(options?: ConstructorParameters<typeof SessionStore>[1]): SessionStore {
  const value = new SessionStore(directory, options);
  stores.push(value);
  value.startSession();
  return value;
}
function rows(value: SessionStore): SessionEntry[] {
  return fs.readFileSync(value.getFilePath()!, 'utf-8').trim().split('\n').map(line => JSON.parse(line));
}
function lineBytes(value: SessionEntry): number {
  return Buffer.byteLength(JSON.stringify(value) + '\n');
}
function resume(value: SessionStore) {
  return resumeSession(value.getFilePath()!, { sessionRoot: directory, allowLegacyUnverified: true });
}

beforeEach(() => {
  delete process.env.AQE_MEMORY_BACKEND;
  disk.budget = null;
  disk.zeroWrites = false;
  disk.closeFails = false;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-partial-write-'));
  stores = [];
});
afterEach(() => {
  disk.budget = null;
  disk.zeroWrites = false;
  disk.closeFails = false;
  for (const value of stores) { try { value.close(); } catch { /* cleanup only */ } }
  fs.rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('SessionStore partial-append recovery (#910)', () => {
  it.each([
    ['at a line boundary', 0],
    ['inside a line', 17],
  ])('does not duplicate entries when ENOSPC interrupts a batch %s', (_where, tear) => {
    const value = open();
    const ids = [value.append(entry(1))];
    for (let i = 2; i <= 5; i++) ids.push(value.append(entry(i, `payload-${i}`)));
    const [first] = rows(value);

    // The disk fills after entry 2 is fully written: entry 3 is either untouched
    // or torn, and entries 4 and 5 are not written at all.
    const secondLine = lineBytes({ ...first, uuid: ids[1], parentUuid: ids[0], timestamp: 2, result: 'payload-2' });
    disk.budget = secondLine + tear;
    expect(() => value.flush()).toThrow(/ENOSPC/);

    disk.budget = null; // space freed
    value.flush();
    value.flush();

    const written = rows(value);
    expect(written.map(row => row.uuid)).toEqual(ids);
    expect(new Set(written.map(row => row.uuid)).size).toBe(ids.length);
    expect(written.map(row => row.parentUuid)).toEqual([null, ...ids.slice(0, -1)]);
    const resumed = resume(value);
    expect(resumed.disposition).toBe('LEGACY_UNVERIFIED');
    expect(resumed.diagnostics).not.toContain('duplicate entry UUID');
    expect(resumed.metadata.entryCount).toBe(5);
  });

  it('survives repeated partial failures before the disk recovers', () => {
    const value = open();
    const ids = [value.append(entry(1))];
    for (let i = 2; i <= 30; i++) ids.push(value.append(entry(i, 'x'.repeat(i))));
    for (const budget of [5, 0, 40, 1, 0, 300]) {
      disk.budget = budget;
      expect(() => value.flush()).toThrow(/ENOSPC/);
    }
    disk.budget = null;
    value.flush();
    expect(rows(value).map(row => row.uuid)).toEqual(ids);
    expect(resume(value).metadata.entryCount).toBe(30);
  });

  it('completes a torn first write instead of leaving a corrupt line', () => {
    const value = open();
    disk.budget = 10;
    expect(() => value.append(entry(1))).toThrow(/ENOSPC/);
    // Part of the record is on disk, so the store keeps it and finishes it on retry.
    expect(value.getMetadata().entryCount).toBe(1);
    disk.budget = null;
    const second = value.append(entry(2));
    value.flush();
    const written = rows(value);
    expect(written).toHaveLength(2);
    expect(written[1]).toMatchObject({ uuid: second, parentUuid: written[0].uuid });
    expect(resume(value).disposition).toBe('LEGACY_UNVERIFIED');
  });

  it('fails instead of spinning when a write reports zero bytes, then recovers', () => {
    const value = open();
    const first = value.append(entry(1));
    const second = value.append(entry(2));
    disk.zeroWrites = true;
    expect(() => value.flush()).toThrow(/made no progress/);
    disk.zeroWrites = false;
    value.flush();
    expect(rows(value).map(row => row.uuid)).toEqual([first, second]);
  });

  it('treats a close error after complete writes as written, without re-appending', () => {
    const value = open();
    const first = value.append(entry(1));
    const second = value.append(entry(2));
    disk.closeFails = true;
    expect(() => value.flush()).not.toThrow();
    disk.closeFails = false;
    value.flush();
    expect(rows(value).map(row => row.uuid)).toEqual([first, second]);
    expect(value.getWriteBufferStats().bufferedEntries).toBe(0);
  });

  it('rejects a first write that put nothing on disk, leaving the chain unchanged', () => {
    const value = open();
    disk.budget = 0;
    expect(() => value.append(entry(1))).toThrow(/ENOSPC/);
    expect(value.getMetadata().entryCount).toBe(0);
    disk.budget = null;
    const first = value.append(entry(2));
    expect(rows(value).map(row => [row.uuid, row.parentUuid])).toEqual([[first, null]]);
  });
});

describe('SessionStore write buffer bound (#910)', () => {
  it('caps the buffer, drops the oldest entries, counts them and warns once', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const value = open({ maxBufferedEntries: 50 });
    const firstId = value.append(entry(0));
    disk.budget = 0; // the disk stays full

    const ids: string[] = [];
    for (let i = 1; i <= 500; i++) {
      ids.push(value.append(entry(i, `payload-${i}`)));
      // Timer flushes fail; an uncaughtException handler would swallow these.
      if (i % 10 === 0) expect(() => value.flush()).toThrow(/ENOSPC/);
      expect(value.getWriteBufferStats().bufferedEntries).toBeLessThanOrEqual(50);
    }

    expect(value.getWriteBufferStats()).toMatchObject({ bufferedEntries: 50, droppedEntries: 450 });
    expect(value.getMetadata().entryCount).toBe(501);
    const warnings = warn.mock.calls.filter(call => String(call[0]).includes('session journal'));
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0][0])).toMatch(/WARN/);

    disk.budget = null;
    value.flush();
    const written = rows(value);
    expect(written.map(row => row.uuid)).toEqual([firstId, ...ids.slice(-50)]);
    expect(value.getWriteBufferStats()).toMatchObject({ bufferedEntries: 0, bufferedBytes: 0, droppedEntries: 450 });
    // The gap is visible to recovery, which fails closed instead of inventing a chain.
    expect(resume(value).diagnostics).toContain('broken parentUuid lineage');
  });

  it('caps by bytes as well as by entry count', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const value = open({ maxBufferedBytes: 4096 });
    value.append(entry(0));
    disk.budget = 0;
    for (let i = 1; i <= 100; i++) value.append(entry(i, 'y'.repeat(200)));
    const stats = value.getWriteBufferStats();
    expect(stats.bufferedBytes).toBeLessThanOrEqual(4096);
    expect(stats.droppedEntries).toBeGreaterThan(0);
    expect(stats.bufferedEntries + stats.droppedEntries).toBe(100);
  });

  it('never drops a partially written line, which would corrupt the next record', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const value = open({ maxBufferedEntries: 3 });
    const firstId = value.append(entry(0));
    const head = value.append(entry(1, 'head'));
    disk.budget = 7; // tear the head line
    expect(() => value.flush()).toThrow(/ENOSPC/);
    disk.budget = 0;
    const later: string[] = [];
    for (let i = 2; i <= 10; i++) later.push(value.append(entry(i)));
    disk.budget = null;
    value.flush();
    expect(rows(value).map(row => row.uuid)).toEqual([firstId, head, ...later.slice(-2)]);
  });

  it('rejects invalid caps', () => {
    expect(() => new SessionStore(directory, { maxBufferedEntries: 0 })).toThrow(RangeError);
    expect(() => new SessionStore(directory, { maxBufferedBytes: Number.NaN })).toThrow(RangeError);
  });
});
