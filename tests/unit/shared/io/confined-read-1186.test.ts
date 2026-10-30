/**
 * #1186: follow-ups to the confined reader (#1161), each reproduced with real
 * files, symlinks and hardlinks in a temporary project:
 *   1. `link/../x` resolves the way the kernel and the payload guard do;
 *   2. on Linux, a descriptor whose /proc entry no longer matches is refused
 *      as 'changed-during-read', never re-resolved by name;
 *   3. `hardlinks: 'refuse'` refuses a file with more than one link.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Lets a test make /proc/self/fd/N report the opened file as deleted, which
// is what Linux shows when the file is unlinked or replaced after the open.
const procOverride = vi.hoisted(() => ({ deleted: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const readlink = (async (p: fs.PathLike, ...rest: unknown[]) => {
    const target = await (actual.readlink as (...a: unknown[]) => Promise<string>)(p, ...rest);
    return procOverride.deleted && String(p).startsWith('/proc/self/fd/') ? `${target} (deleted)` : target;
  }) as typeof actual.readlink;
  return { ...actual, readlink, default: { ...actual, readlink } };
});

import {
  ConfinedReadError,
  openedLocation,
  openedLocationSync,
  readConfinedText,
  readConfinedTextSync,
} from '../../../../src/shared/io/confined-read';
import { confinePayloadPaths } from '../../../../src/shared/io/payload-path-guard';
import { FileReader } from '../../../../src/shared/io/file-reader';

const OUTSIDE = 'OUTSIDE_1186';
const INSIDE = 'INSIDE_1186';
const linux = process.platform === 'linux' && fs.existsSync('/proc/self/fd');

describe('confined reads, #1186 follow-ups', () => {
  let base: string;
  let project: string;
  let outside: string;
  const cwd = process.cwd();

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1186-read-')));
    project = path.join(base, 'proj');
    outside = path.join(base, 'outside');
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.mkdirSync(path.join(outside, 'dir'), { recursive: true });
    fs.writeFileSync(path.join(project, 'src', 'x'), INSIDE);
    fs.writeFileSync(path.join(outside, 'x'), OUTSIDE);
    // src/l -> outside/dir, so the kernel opens src/l/../x as outside/x.
    fs.symlinkSync(path.join(outside, 'dir'), path.join(project, 'src', 'l'));
  });

  afterEach(() => {
    procOverride.deleted = false;
    process.chdir(cwd);
    fs.rmSync(base, { recursive: true, force: true });
  });

  const reasonOf = async (p: Promise<unknown>): Promise<string | undefined> =>
    p.then(() => undefined, (e: unknown) => (e instanceof ConfinedReadError ? e.reason : `other:${String(e)}`));
  const reasonOfSync = (fn: () => unknown): string | undefined => {
    try { fn(); return undefined; } catch (e) { return e instanceof ConfinedReadError ? e.reason : `other:${String(e)}`; }
  };

  describe('1. `..` after a symlink', () => {
    it('the kernel opens the outside file and the payload guard refuses the path', async () => {
      process.chdir(project);
      expect(fs.readFileSync('src/l/../x', 'utf8')).toBe(OUTSIDE);
      const guard = await confinePayloadPaths(['src/l/../x'], { projectRoot: project, basePath: project });
      expect(guard.skipped).toEqual([{ path: 'src/l/../x', reason: 'outside-project-root' }]);
    });

    it.each([
      ['relative', () => 'src/l/../x'],
      ['absolute', () => `${project}/src/l/../x`],
    ])('the reader agrees with the guard for a %s path (async and sync)', async (_label, spell) => {
      process.chdir(project);
      // Before #1186 both returned INSIDE_1186: `..` was collapsed as text.
      expect(await reasonOf(readConfinedText(spell(), { projectRoot: project }))).toBe('outside-project-root');
      expect(reasonOfSync(() => readConfinedTextSync(spell(), { projectRoot: project }))).toBe('outside-project-root');
      // Even when outside paths are allowed: the path was spelled inside the root.
      expect(await reasonOf(readConfinedText(spell(), { projectRoot: project, outsideRoot: 'allow' })))
        .toBe('outside-project-root');
    });

    it('still reads `..` that stays inside the project', async () => {
      fs.mkdirSync(path.join(project, 'src', 'sub'));
      fs.symlinkSync(path.join(project, 'src', 'sub'), path.join(project, 'src', 'in'));
      fs.writeFileSync(path.join(project, 'src', 'y'), 'Y');
      // src/in -> src/sub, so src/in/../y is src/y.
      expect(await readConfinedText(`${project}/src/in/../y`, { projectRoot: project })).toBe('Y');
      expect(readConfinedTextSync(`${project}/src/in/../y`, { projectRoot: project })).toBe('Y');
    });

    it('FileReader resolves the caller spelling the same way', async () => {
      const reader = new FileReader({ basePath: project, projectRoot: project });
      const result = await reader.readFile('src/l/../x');
      expect(result.success).toBe(false);
      expect(result.success ? '' : result.error.message).not.toContain(INSIDE);
      expect((await reader.readFile('src/x')).success).toBe(true);
    });
  });

  describe.runIf(linux)('2. /proc/self/fd no longer matches (Linux)', () => {
    it('openedLocation does not fall back to re-resolving the name', async () => {
      // Open via `a`, which has a second link `b`; unlink `a`, then link it
      // back. /proc shows "a (deleted)", but the name `a` is the same inode
      // again, so the old fallback accepted it.
      const a = path.join(project, 'src', 'a');
      const b = path.join(project, 'src', 'b');
      fs.writeFileSync(a, 'A');
      fs.linkSync(a, b);
      const fd = fs.openSync(a, 'r');
      try {
        const st = fs.fstatSync(fd);
        fs.unlinkSync(a);
        fs.linkSync(b, a);
        expect(fs.readlinkSync(`/proc/self/fd/${fd}`)).toBe(`${a} (deleted)`);
        expect(fs.statSync(a).ino).toBe(st.ino);
        expect(await openedLocation(fd, a, st)).toBeNull();
        expect(openedLocationSync(fd, a, st)).toBeNull();
      } finally {
        fs.closeSync(fd);
      }
    });

    it('openedLocation still returns the location of an unchanged file', async () => {
      const f = path.join(project, 'src', 'x');
      const fd = fs.openSync(f, 'r');
      try {
        const st = fs.fstatSync(fd);
        expect(await openedLocation(fd, f, st)).toBe(f);
        expect(openedLocationSync(fd, f, st)).toBe(f);
      } finally {
        fs.closeSync(fd);
      }
    });

    it("a file replaced after the open is refused as 'changed-during-read', not 'outside-project-root'", async () => {
      procOverride.deleted = true;
      expect(await reasonOf(readConfinedText(path.join(project, 'src', 'x'), { projectRoot: project })))
        .toBe('changed-during-read');
    });
  });

  describe('3. hardlinks', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(outside, 'secret.txt'), OUTSIDE);
      fs.linkSync(path.join(outside, 'secret.txt'), path.join(project, 'src', 'hard.txt'));
    });

    it('a hardlink to an outside file passes every path check, so it is read by default', async () => {
      const hard = path.join(project, 'src', 'hard.txt');
      expect(fs.statSync(hard).nlink).toBe(2);
      expect(await readConfinedText(hard, { projectRoot: project })).toBe(OUTSIDE);
    });

    it("hardlinks: 'refuse' refuses it (async and sync)", async () => {
      const hard = path.join(project, 'src', 'hard.txt');
      const opts = { projectRoot: project, hardlinks: 'refuse' as const };
      expect(await reasonOf(readConfinedText(hard, opts))).toBe('hardlinked');
      expect(reasonOfSync(() => readConfinedTextSync(hard, opts))).toBe('hardlinked');
    });

    it("hardlinks: 'refuse' still reads a file with one link", async () => {
      const opts = { projectRoot: project, hardlinks: 'refuse' as const };
      expect(await readConfinedText(path.join(project, 'src', 'x'), opts)).toBe(INSIDE);
      expect(readConfinedTextSync(path.join(project, 'src', 'x'), opts)).toBe(INSIDE);
    });

    it("documented limit: once the outside name is removed, the file has one link and is read", async () => {
      fs.unlinkSync(path.join(outside, 'secret.txt'));
      const hard = path.join(project, 'src', 'hard.txt');
      expect(await readConfinedText(hard, { projectRoot: project, hardlinks: 'refuse' })).toBe(OUTSIDE);
    });
  });
});
