/**
 * Shared RVF adapter: a store locked by a live process stops the open ladder
 * at the busy warning (issue #574 follow-up).
 *
 * After logging "locked by a live process … degrading to SQLite", the ladder
 * used to continue with a create (which always fails on an existing path) and
 * a reopen (which hits the same lock), then log a second
 * "Shared adapter init failed: … LockHeld" line. Nothing was damaged, but the
 * wasted attempts and the extra line were noise on every hook/CLI start while
 * the MCP server held the store.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  createRvfStore,
  openRvfStore,
  isRvfNativeAvailable,
  type RvfNativeAdapter,
} from '../../../../src/integrations/ruvector/rvf-native-adapter.js';
import {
  __openOrCreateRvfForTests,
  RvfLiveLockError,
} from '../../../../src/integrations/ruvector/shared-rvf-adapter.js';

const describeNative = isRvfNativeAvailable() ? describe : describe.skip;

const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const fn of cleanups.splice(0).reverse()) {
    try { fn(); } catch { /* best-effort */ }
  }
});

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir).sort().map((f) => [f, createHash('sha256').update(readFileSync(join(dir, f))).digest('hex')]),
  );
}

describeNative('shared RVF adapter open ladder with a live lock owner (#574)', () => {
  it('stops after the busy warning: no create, no reopen, one log line, bytes unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rvf-574-live-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const rvfPath = join(dir, 'patterns.rvf');
    const owner: RvfNativeAdapter = createRvfStore(rvfPath, 8); // live owner = this process
    cleanups.push(() => owner.close());
    const before = snapshot(dir);

    const openFn = vi.fn(openRvfStore);
    const createFn = vi.fn(createRvfStore);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrown: unknown;
    try {
      __openOrCreateRvfForTests(openFn, createFn, rvfPath, 8);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(RvfLiveLockError);
    expect(String((thrown as Error).message)).toMatch(/LockHeld|0x0300/);
    expect(openFn).toHaveBeenCalledTimes(1);
    expect(createFn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/locked by a live process/);
    expect(snapshot(dir)).toEqual(before);
  });
});
