/**
 * #1096: path checks shared by every code-index entry point. Uses a real
 * temporary project with a real symlink that points to a file outside it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MAX_INDEX_PATHS,
  confineIndexPaths,
  validateIndexPaths,
  validateIndexTaskPayload,
} from '../../../../src/domains/code-intelligence/index-path-guard';

describe('index path guard (#1096)', () => {
  let base: string;
  let project: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1096-guard-')));
    project = path.join(base, 'proj');
    fs.mkdirSync(path.join(project, 'src', 'adir.ts'), { recursive: true });
    fs.mkdirSync(path.join(base, 'outside'));
    fs.writeFileSync(path.join(project, 'src', 'ok.ts'), 'export const ok = 1;\n');
    fs.writeFileSync(path.join(base, 'outside', 'secret.ts'), 'export const secret = 1;\n');
    fs.symlinkSync(path.join('..', '..', 'outside', 'secret.ts'), path.join(project, 'src', 'leak.ts'));
    fs.symlinkSync('ok.ts', path.join(project, 'src', 'alias.ts'));
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const p = (rel: string): string => path.join(project, rel);

  describe('confineIndexPaths', () => {
    it('skips a symlink that resolves outside the project root', async () => {
      const result = await confineIndexPaths([p('src/leak.ts')], project);

      expect(result.accepted).toEqual([]);
      expect(result.skipped).toEqual([{ path: p('src/leak.ts'), reason: 'outside-project-root' }]);
    });

    it('skips missing paths and directories, keeps in-root files and in-root symlinks', async () => {
      const result = await confineIndexPaths(
        [p('src/ok.ts'), p('src/missing.ts'), p('src/adir.ts'), p('src/alias.ts'), path.join(base, 'outside', 'secret.ts')],
        project,
      );

      expect(result.accepted).toEqual([p('src/ok.ts'), p('src/alias.ts')]);
      expect(result.skipped).toEqual([
        { path: p('src/missing.ts'), reason: 'not-found' },
        { path: p('src/adir.ts'), reason: 'not-a-file' },
        { path: path.join(base, 'outside', 'secret.ts'), reason: 'outside-project-root' },
      ]);
    });

    it('gives the same reason for every outside path, whether it exists or not', async () => {
      const outside = [
        path.join(base, 'outside', 'secret.ts'),
        path.join(base, 'outside', 'missing.ts'),
        path.join(base, 'outside'),
        path.join(base, 'proj-evil', 'x.ts'),
      ];
      const result = await confineIndexPaths(outside, project);

      expect(result.accepted).toEqual([]);
      expect(result.skipped).toEqual(outside.map((p) => ({ path: p, reason: 'outside-project-root' })));
    });

    it('accepts an in-root file named through the real path of a symlinked root', async () => {
      const link = path.join(base, 'rootlink');
      fs.symlinkSync('proj', link);

      const viaReal = await confineIndexPaths([p('src/ok.ts')], link);
      const viaLink = await confineIndexPaths([path.join(link, 'src', 'ok.ts')], link);

      expect(viaReal.accepted).toEqual([p('src/ok.ts')]);
      expect(viaLink.accepted).toEqual([path.join(link, 'src', 'ok.ts')]);
    });

    it('resolves relative paths against the base path', async () => {
      const result = await confineIndexPaths(['src/ok.ts', 'src/leak.ts'], project, project);

      expect(result.accepted).toEqual(['src/ok.ts']);
      expect(result.skipped).toEqual([{ path: 'src/leak.ts', reason: 'outside-project-root' }]);
    });
  });

  describe('validation at the boundary', () => {
    it('rejects a path list longer than the cap, and accepts one at the cap', () => {
      const atCap = Array.from({ length: MAX_INDEX_PATHS }, (_, i) => `src/f${i}.ts`);

      const accepted = validateIndexPaths(atCap);
      const rejected = validateIndexPaths([...atCap, 'src/one-more.ts']);

      expect(MAX_INDEX_PATHS).toBe(10_000);
      expect(accepted.success).toBe(true);
      expect(rejected.success).toBe(false);
      if (!rejected.success) {
        expect(rejected.error.message).toBe(
          "Invalid index payload: 'paths' has 10001 entries; at most 10000 paths are accepted per request - index a directory target or split the list",
        );
      }
      expect(validateIndexTaskPayload('index', { paths: [...atCap, 'x.ts'] })?.message).toContain('at most 10000 paths');
    });

    it('rejects a non-array path list with a clear message', () => {
      const result = validateIndexPaths('src/ok.ts');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Invalid index payload: 'paths' must be an array of file paths, got string");
      }
    });

    it('rejects non-string and empty entries', () => {
      const numeric = validateIndexPaths(['src/ok.ts', 42]);
      const empty = validateIndexPaths(['']);

      expect(numeric.success || empty.success).toBe(false);
      if (!numeric.success) expect(numeric.error.message).toContain("'paths[1]' must be a non-empty string, got number");
      if (!empty.success) expect(empty.error.message).toContain("'paths[0]' must be a non-empty string");
    });

    it('checks paths only for index task types', () => {
      expect(validateIndexTaskPayload('index-code', { paths: { a: 1 } })?.message).toContain('must be an array');
      expect(validateIndexTaskPayload('index', { paths: ['src/ok.ts'] })).toBeUndefined();
      expect(validateIndexTaskPayload('generate-tests', { paths: 'x' })).toBeUndefined();
      expect(validateIndexTaskPayload('generate-tests', { target: 'src' })).toBeUndefined();
    });

    // #1134: the handler indexes exactly `paths`; it does not expand a
    // directory `target`, so a request without `paths` failed only after it
    // was accepted. It is refused at submission now.
    it.each([
      ['a code_index-style target', { target: 'src' }],
      ['an empty payload', {}],
      ['no payload', undefined],
      ['an inherited paths property', Object.create({ paths: ['src/ok.ts'] })],
    ])('refuses an index task with %s and says paths is required', (_label, payload) => {
      for (const type of ['index', 'index-code']) {
        const error = validateIndexTaskPayload(type, payload);
        expect(error?.message).toContain(`'${type}' needs 'paths', the list of files to index`);
        expect(error?.message).toContain('use code_index (or `aqe code index`) with a target');
      }
    });

    it('refuses an empty paths list', () => {
      expect(validateIndexTaskPayload('index-code', { paths: [] })?.message).toContain("'paths' is empty");
    });
  });

});
