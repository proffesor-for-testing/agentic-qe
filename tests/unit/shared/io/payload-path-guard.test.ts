/**
 * #1126: the shared guard for caller-named paths in task payloads. Uses a real
 * temporary project with real symlinks that point out of it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MAX_PAYLOAD_FILE_BYTES,
  confinePayloadPaths,
  requirePayloadFiles,
  requirePayloadPath,
} from '../../../../src/shared/io/payload-path-guard';
import { isCallerInputError } from '../../../../src/shared/error-utils';

describe('payload path guard (#1126)', () => {
  let base: string;
  let project: string;
  let outside: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1126-guard-')));
    project = path.join(base, 'proj');
    outside = path.join(base, 'outside');
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(project, 'src', 'ok.ts'), 'export const ok = 1;\n');
    fs.writeFileSync(path.join(project, 'src', 'big.ts'), 'x'.repeat(MAX_PAYLOAD_FILE_BYTES + 1));
    fs.writeFileSync(path.join(outside, 'secret.ts'), 'export const secret = 1;\n');
    fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(project, 'src', 'leak.ts'));
    fs.symlinkSync(outside, path.join(project, 'out-dir'));
    fs.symlinkSync(path.join(outside, 'gone.ts'), path.join(project, 'src', 'dangling.ts'));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const opts = (extra: Record<string, unknown> = {}) => ({ projectRoot: project, basePath: project, ...extra });

  describe('confinePayloadPaths', () => {
    it('accepts a regular file inside the project and refuses a symlink pointing out', async () => {
      const result = await confinePayloadPaths(['src/ok.ts', 'src/leak.ts'], opts());

      expect(result.accepted).toEqual(['src/ok.ts']);
      expect(result.skipped).toEqual([{ path: 'src/leak.ts', reason: 'outside-project-root' }]);
    });

    it.each([
      ['an outside absolute path', () => path.join(outside, 'secret.ts')],
      ['a .. path', () => '../outside/secret.ts'],
      ['a system file', () => '/etc/hostname'],
      ['a process file', () => '/proc/self/environ'],
      ['a device', () => '/dev/zero'],
      ['an outside path that does not exist', () => path.join(outside, 'nope.ts')],
    ])('refuses %s as outside-project-root', async (_label, requested) => {
      const result = await confinePayloadPaths([requested()], opts());

      expect(result.accepted).toEqual([]);
      expect(result.skipped).toEqual([{ path: requested(), reason: 'outside-project-root' }]);
    });

    it('refuses a directory unless allowDirectory is set', async () => {
      expect((await confinePayloadPaths(['src'], opts())).skipped).toEqual([{ path: 'src', reason: 'not-a-file' }]);
      expect((await confinePayloadPaths(['src'], opts({ allowDirectory: true }))).accepted).toEqual(['src']);
    });

    it('refuses a directory reached through a symlink pointing out, even with allowDirectory', async () => {
      const result = await confinePayloadPaths(['out-dir'], opts({ allowDirectory: true }));

      expect(result.skipped).toEqual([{ path: 'out-dir', reason: 'outside-project-root' }]);
    });

    it('refuses a file over maxBytes, and only when maxBytes is set', async () => {
      const limited = await confinePayloadPaths(['src/big.ts'], opts({ maxBytes: MAX_PAYLOAD_FILE_BYTES }));
      expect(limited.skipped).toEqual([{ path: 'src/big.ts', reason: 'too-large' }]);

      expect((await confinePayloadPaths(['src/big.ts'], opts())).accepted).toEqual(['src/big.ts']);
    });

    it('accepts a missing in-project path only with allowMissing', async () => {
      expect((await confinePayloadPaths(['src/new.ts'], opts())).skipped)
        .toEqual([{ path: 'src/new.ts', reason: 'not-found' }]);
      expect((await confinePayloadPaths(['src/new.ts'], opts({ allowMissing: true }))).accepted).toEqual(['src/new.ts']);
    });

    it('with allowMissing, still refuses a missing name beneath a symlink out and a dangling symlink', async () => {
      const result = await confinePayloadPaths(['out-dir/new.ts', 'src/dangling.ts'], opts({ allowMissing: true }));

      expect(result.accepted).toEqual([]);
      expect(result.skipped).toEqual([
        { path: 'out-dir/new.ts', reason: 'not-found' },
        { path: 'src/dangling.ts', reason: 'not-found' },
      ]);
    });
  });

  describe('special files and the project root', () => {
    it.skipIf(process.platform === 'win32')('refuses a FIFO inside the project without opening it', async () => {
      execFileSync('mkfifo', [path.join(project, 'src', 'pipe.ts')]);

      const result = await confinePayloadPaths(['src/pipe.ts'], opts({ maxBytes: MAX_PAYLOAD_FILE_BYTES }));

      expect(result.skipped).toEqual([{ path: 'src/pipe.ts', reason: 'not-a-file' }]);
    });

    it('uses AQE_PROJECT_ROOT, so a nested package can name a sibling in the parent project', async () => {
      const pkgA = path.join(project, 'packages', 'a');
      const pkgB = path.join(project, 'packages', 'b');
      fs.mkdirSync(pkgA, { recursive: true });
      fs.mkdirSync(pkgB, { recursive: true });
      fs.writeFileSync(path.join(pkgB, 'b.ts'), 'export const b = 1;\n');
      vi.stubEnv('AQE_PROJECT_ROOT', project);
      try {
        const result = await confinePayloadPaths(['../b/b.ts', '../../../outside/secret.ts'], { basePath: pkgA });

        expect(result.accepted).toEqual(['../b/b.ts']);
        expect(result.skipped).toEqual([{ path: '../../../outside/secret.ts', reason: 'outside-project-root' }]);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('requirePayloadFiles', () => {
    it('returns the paths when all are allowed', async () => {
      const result = await requirePayloadFiles('generate-tests', 'sourceFiles', ['src/ok.ts'], opts());

      expect(result).toEqual({ success: true, value: ['src/ok.ts'] });
    });

    it('refuses the whole request by name with a caller-input error', async () => {
      const result = await requirePayloadFiles('generate-tests', 'sourceFiles', ['src/ok.ts', 'src/leak.ts'], opts());

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('Invalid generate-tests payload: sourceFiles cannot be read: src/leak.ts (outside-project-root)');
      expect(isCallerInputError(result.error)).toBe(true);
    });

    it.each([
      ['a string', 'src/ok.ts', "'sourceFiles' must be an array"],
      ['an empty entry', [''], "'sourceFiles[0]' must be a non-empty string"],
      ['a null byte', ['src/ok.ts\0x'], "'sourceFiles[0]' contains a null byte"],
    ])('refuses %s before touching the filesystem', async (_label, value, message) => {
      const result = await requirePayloadFiles('generate-tests', 'sourceFiles', value, opts());

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toContain(message);
    });
  });

  describe('requirePayloadPath', () => {
    it('returns the path resolved against basePath', async () => {
      const result = await requirePayloadPath('scan-security', 'target', 'src', opts({ allowDirectory: true }));

      expect(result).toEqual({ success: true, value: path.join(project, 'src') });
    });

    it('refuses an outside directory without listing it', async () => {
      const result = await requirePayloadPath('index-code', 'target', outside, opts({ allowDirectory: true }));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain(`${outside} (outside-project-root)`);
      expect(result.error.message).not.toContain('secret.ts');
    });

    it('refuses a non-string target', async () => {
      const result = await requirePayloadPath('index-code', 'target', 42, opts());

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toContain("'target' must be a non-empty path string");
    });
  });
});
