/**
 * openDatabase — native addon load failure (#1173).
 *
 * better-sqlite3 loads its native binary on the first `new Database()`. When
 * npm 12 blocked its install script the binary is missing; every DB entry point
 * (init, health, status, memory, MCP) goes through openDatabase, so it must
 * rethrow with the cause and the fix rather than the raw probed-path list.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BINDINGS_ERROR =
  'Could not locate the bindings file. Tried:\n' +
  ' → /usr/local/lib/node_modules/agentic-qe/node_modules/better-sqlite3/build/better_sqlite3.node';

vi.mock('better-sqlite3', () => ({
  default: vi.fn(function FakeDatabase() {
    throw new Error(BINDINGS_ERROR);
  }),
}));

import { openDatabase } from '../../../src/shared/safe-db.js';
import { NativeModuleLoadError } from '../../../src/shared/native-module-errors.js';

describe('openDatabase when the better-sqlite3 binary is missing', () => {
  it('should_throw_NativeModuleLoadError_with_the_fix_command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safedb-native-'));
    try {
      let thrown: unknown;
      try {
        openDatabase(join(dir, 'memory.db'));
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(NativeModuleLoadError);
      const message = (thrown as Error).message;
      expect(message).toContain('better-sqlite3 native module could not be loaded');
      expect(message).toContain('npm rebuild -g better-sqlite3 --allow-scripts=better-sqlite3');
      // The 20-line probed-path list stays on `cause`, not in the message.
      expect(message).not.toContain('build/better_sqlite3.node');
      expect(((thrown as Error).cause as Error).message).toBe(BINDINGS_ERROR);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
