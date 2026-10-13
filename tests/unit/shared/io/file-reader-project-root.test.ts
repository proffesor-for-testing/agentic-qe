/**
 * #1021 review B1: opt-in in-root containment for FileReader.
 *
 * With `projectRoot`, a path that resolves inside the root is contained by
 * realpath (so a symlink escaping the root is rejected) instead of the
 * regex validator, which wrongly rejected `[...slug].tsx`, deep paths and
 * in-root dot-dirs. Paths outside the root keep every legacy protection, and
 * readers WITHOUT `projectRoot` behave exactly as before.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { FileReader, PathTraversalError } from '../../../../src/shared/io/file-reader';

describe('FileReader projectRoot containment', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-reader-root-')));
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-reader-outside-')));
    writeFileSync(join(outside, 'secret.txt'), 'outside the root');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const reader = () => new FileReader({ basePath: root, projectRoot: root, enableCache: false });
  const write = (rel: string, content = 'export const x = 1;\n') => {
    const file = join(root, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
    return file;
  };

  describe('in-root files the legacy validator rejected', () => {
    it.each([
      ['a Next.js catch-all route', 'src/pages/[...slug].tsx'],
      ['an optional catch-all route', 'src/app/[[...params]]/page.tsx'],
      ['a dot-dir', '.storybook/main.ts'],
      ['a dotfile', '.eslintrc.js'],
      ['a path deeper than 10 levels', 'a/b/c/d/e/f/g/h/i/j/k/l/deep.ts'],
    ])('reads %s', async (_label, rel) => {
      const file = write(rel);
      const absolute = await reader().readFile(file);
      const relative = await reader().readFile(rel);
      expect(absolute.success).toBe(true);
      expect(relative.success).toBe(true);
    });
  });

  describe('traversal is still rejected', () => {
    it('rejects ../ escaping the root', async () => {
      const result = await reader().readFile('../../../../etc/passwd');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });

    it('rejects ../ that lands on a real file outside the root', async () => {
      const rel = join('..', outside.split('/').pop()!, 'secret.txt');
      const result = await reader().readFile(rel);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });

    it('rejects an absolute path outside the root', async () => {
      const result = await reader().readFile('/etc/passwd');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });

    it('rejects an absolute path to a real file outside the root', async () => {
      const result = await reader().readFile(join(outside, 'secret.txt'));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });

    it('rejects a symlinked file inside the root that points outside it', async () => {
      symlinkSync(join(outside, 'secret.txt'), join(root, 'link.ts'));
      const result = await reader().readFile(join(root, 'link.ts'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
        expect(result.error.message).toMatch(/outside the project root/);
      }
    });

    it('rejects a file under a symlinked directory that points outside the root', async () => {
      symlinkSync(outside, join(root, 'linked-dir'));
      const result = await reader().readFile('linked-dir/secret.txt');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });

    it('rejects a NUL byte in an in-root path', async () => {
      const result = await reader().readFile(join(root, 'a.ts\u0000.txt'));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });

    it('still denies executable extensions inside the root', async () => {
      const file = write('tools/run.exe', 'MZ');
      const result = await reader().readFile(file);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });

    it('allows a symlink inside the root that stays inside it', async () => {
      const target = write('src/real.ts');
      symlinkSync(target, join(root, 'alias.ts'));
      const result = await reader().readFile(join(root, 'alias.ts'));
      expect(result.success).toBe(true);
    });
  });

  it('reads in-root dot-dirs when the root itself sits under /home/<user>/.<dir>', async () => {
    // The legacy /^\/home\/.+\/\./ rule rejected every file of a checkout under
    // a dot-dir (e.g. ~/.claude/worktrees/…) and every in-root dotfile there.
    const homeRoot = realpathSync(mkdtempSync(join(process.cwd(), '.aqe-reader-dot-')));
    try {
      const file = join(homeRoot, '.github', 'scripts', 'check.ts');
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, 'export const ok = true;\n');
      const result = await new FileReader({ basePath: homeRoot, projectRoot: homeRoot, enableCache: false })
        .readFile(file);
      expect(result.success).toBe(true);
    } finally {
      rmSync(homeRoot, { recursive: true, force: true });
    }
  });

  describe('TOCTOU: concurrent symlink swaps (bounded race, #1021 round 2b)', () => {
    /**
     * Run `script` in a child process (it swaps paths as fast as it can for
     * 3 s) while reading `target` in a loop for `ms`. Returns the read tallies.
     */
    async function race(script: string, args: string[], target: string, ms = 1500) {
      const swapper = spawn(process.execPath, ['-e', script, ...args], { stdio: 'ignore' });
      const exited = new Promise((resolve) => swapper.on('exit', resolve));
      const r = reader();
      const tally = { outside: 0, inside: 0, refused: 0 };
      const deadline = Date.now() + ms;
      try {
        while (Date.now() < deadline) {
          const result = await r.readFile(target);
          if (!result.success) tally.refused++;
          else if (result.value.includes('OUTSIDE')) tally.outside++;
          else tally.inside++;
        }
      } finally {
        swapper.kill();
        await exited;
      }
      return tally;
    }

    it('never reads outside when the final symlink is swapped', async () => {
      writeFileSync(join(root, 'inside.ts'), 'INSIDE');
      writeFileSync(join(outside, 'secret.txt'), 'OUTSIDE-SECRET');
      symlinkSync(join(root, 'inside.ts'), join(root, 'link.ts'));
      const tally = await race(`
        const fs = require('fs'); const path = require('path');
        const [root, inside, secret] = process.argv.slice(1);
        const end = Date.now() + 3000; let i = 0;
        while (Date.now() < end) {
          const tmp = path.join(root, 'link.tmp');
          try { fs.unlinkSync(tmp); } catch {}
          fs.symlinkSync(i++ % 2 ? secret : inside, tmp);
          fs.renameSync(tmp, path.join(root, 'link.ts'));
        }
      `, [root, join(root, 'inside.ts'), join(outside, 'secret.txt')], join(root, 'link.ts'));

      expect(tally.outside).toBe(0);
      expect(tally.inside + tally.refused).toBeGreaterThan(0);
    }, 15000);

    it('never reads outside when a directory component is swapped for a symlink', async () => {
      // realpath can see sub/ as a real in-root directory, then sub becomes a
      // symlink to an outside directory before the file is opened by name.
      mkdirSync(join(root, 'sub'));
      writeFileSync(join(root, 'sub', 'f.ts'), 'INSIDE');
      writeFileSync(join(outside, 'f.ts'), 'OUTSIDE-SECRET');
      symlinkSync(outside, join(root, 'sub.link'));
      const tally = await race(`
        const fs = require('fs'); const path = require('path');
        const [root] = process.argv.slice(1);
        const sub = path.join(root, 'sub'), parked = path.join(root, 'sub.real'), link = path.join(root, 'sub.link');
        const end = Date.now() + 3000;
        while (Date.now() < end) {
          try {
            fs.renameSync(sub, parked); fs.renameSync(link, sub);   // sub -> outside
            fs.renameSync(sub, link); fs.renameSync(parked, sub);   // sub -> real dir
          } catch {}
        }
      `, [root], join(root, 'sub', 'f.ts'));

      expect(tally.outside).toBe(0);
      expect(tally.inside + tally.refused).toBeGreaterThan(0);
    }, 15000);
  });

  describe('readers without projectRoot are unchanged', () => {
    it('still rejects a catch-all route name (legacy validator)', async () => {
      const file = write('src/pages/[...slug].tsx');
      const legacy = new FileReader({ basePath: root, enableCache: false });
      const result = await legacy.readFile(file);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
    });
  });
});
