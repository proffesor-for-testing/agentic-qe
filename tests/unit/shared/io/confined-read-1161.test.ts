/**
 * #1161: reads of checked payload paths open the file once and validate the
 * opened descriptor, so a file or symlink swapped in after the check cannot
 * redirect the read. Uses a real temporary project with real symlinks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ConfinedReadError,
  readConfinedFile,
  readConfinedText,
  readConfinedTextSync,
} from '../../../../src/shared/io/confined-read';
import { confinePayloadPaths } from '../../../../src/shared/io/payload-path-guard';
import { isCallerInputError } from '../../../../src/shared/error-utils';

const SECRET = 'OUTSIDE_SECRET_1161';

describe('confined reads (#1161)', () => {
  let base: string;
  let project: string;
  let outside: string;

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1161-read-')));
    project = path.join(base, 'proj');
    outside = path.join(base, 'outside');
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.mkdirSync(path.join(outside, 'src'), { recursive: true });
    fs.writeFileSync(path.join(project, 'src', 'ok.ts'), 'inside\n');
    fs.writeFileSync(path.join(outside, 'secret.ts'), `${SECRET}\n`);
    fs.writeFileSync(path.join(outside, 'src', 'ok.ts'), `${SECRET}\n`);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  const opts = (extra: Record<string, unknown> = {}) => ({ projectRoot: project, ...extra });
  const reasonOf = async (p: Promise<unknown>): Promise<string | undefined> =>
    p.then(() => undefined, (e: unknown) => (e instanceof ConfinedReadError ? e.reason : `other:${String(e)}`));

  it('reads a regular file inside the project, and a symlink that stays inside', async () => {
    fs.symlinkSync(path.join(project, 'src', 'ok.ts'), path.join(project, 'src', 'alias.ts'));

    expect(await readConfinedText(path.join(project, 'src', 'ok.ts'), opts())).toBe('inside\n');
    expect(await readConfinedText(path.join(project, 'src', 'alias.ts'), opts())).toBe('inside\n');
    expect(readConfinedTextSync(path.join(project, 'src', 'alias.ts'), opts())).toBe('inside\n');
  });

  it.each([
    ['a symlink pointing out', () => {
      fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(project, 'src', 'leak.ts'));
      return path.join(project, 'src', 'leak.ts');
    }, 'outside-project-root'],
    ['a directory component linked out', () => {
      fs.symlinkSync(outside, path.join(project, 'out'));
      return path.join(project, 'out', 'secret.ts');
    }, 'outside-project-root'],
    ['a path spelled outside', () => path.join(outside, 'secret.ts'), 'outside-project-root'],
    ['a directory', () => path.join(project, 'src'), 'not-a-file'],
    ['a missing file', () => path.join(project, 'src', 'gone.ts'), 'not-found'],
  ])('refuses %s without returning its content', async (_label, make, reason) => {
    const target = make();

    expect(await reasonOf(readConfinedFile(target, opts()))).toBe(reason);
    expect(await reasonOf(Promise.resolve().then(() => readConfinedTextSync(target, opts())))).toBe(reason);
  });

  it('refuses a FIFO without blocking on the open', async () => {
    const fifo = path.join(project, 'src', 'pipe.ts');
    try {
      execFileSync('mkfifo', [fifo]);
    } catch {
      return; // no mkfifo on this platform
    }

    expect(await reasonOf(readConfinedFile(fifo, opts()))).toBe('not-a-file');
    expect(await reasonOf(Promise.resolve().then(() => readConfinedTextSync(fifo, opts())))).toBe('not-a-file');
  });

  it('refuses a device linked into the project', async () => {
    fs.mkdirSync(path.join(project, 'coverage'));
    fs.symlinkSync('/dev/zero', path.join(project, 'coverage', 'lcov.info'));

    // /dev is outside the project, so the realpath check refuses it by name.
    expect(await reasonOf(readConfinedFile(path.join(project, 'coverage', 'lcov.info'), opts())))
      .toBe('outside-project-root');
    // With outside paths allowed, the descriptor check still refuses a device.
    expect(await reasonOf(readConfinedFile('/dev/zero', opts({ outsideRoot: 'allow' })))).toBe('not-a-file');
  });

  it('refuses a file over the limit, and reads an outside path only when allowed', async () => {
    fs.writeFileSync(path.join(project, 'src', 'big.ts'), 'x'.repeat(2048));

    expect(await reasonOf(readConfinedFile(path.join(project, 'src', 'big.ts'), opts({ maxBytes: 1024 }))))
      .toBe('too-large');
    expect(await readConfinedText(path.join(outside, 'secret.ts'), opts({ outsideRoot: 'allow' })))
      .toBe(`${SECRET}\n`);
  });

  it('is a caller-input error, so a refusal is not retried', async () => {
    const error = await readConfinedFile(path.join(outside, 'secret.ts'), opts()).catch((e: unknown) => e);

    expect(isCallerInputError(error)).toBe(true);
    expect(String(error)).not.toContain(SECRET);
  });

  it('never returns outside content while the checked name is swapped for a symlink (race)', async () => {
    // A writer swaps src/ok.ts between the inside file and a symlink to the
    // outside secret with atomic renames, as fast as it can. Every read goes
    // through the guard check and then the confined read, as handlers do.
    const victim = path.join(project, 'src', 'ok.ts');
    const insideCopy = path.join(project, 'src', 'ok.inside');
    fs.copyFileSync(victim, insideCopy);
    const writer = `
      const fs = require('fs');
      const [victim, inside, outsideFile, stop] = process.argv.slice(1);
      let i = 0;
      while (!fs.existsSync(stop)) {
        const tmp = victim + '.tmp' + (i++ % 2);
        try { fs.rmSync(tmp, { force: true }); } catch {}
        if (i % 2) fs.copyFileSync(inside, tmp); else fs.symlinkSync(outsideFile, tmp);
        fs.renameSync(tmp, victim);
      }`;
    const stop = path.join(base, 'stop');
    const child = (await import('node:child_process')).spawn(
      process.execPath, ['-e', writer, victim, insideCopy, path.join(outside, 'secret.ts'), stop],
      { stdio: 'ignore' },
    );
    let leaked = 0;
    let read = 0;
    try {
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline) {
        const { resolved } = await confinePayloadPaths([victim], { projectRoot: project, basePath: project });
        if (resolved.length === 0) continue;
        const content = await readConfinedText(resolved[0], opts()).catch(() => null);
        if (content === null) continue;
        read++;
        if (content.includes(SECRET)) leaked++;
      }
    } finally {
      fs.writeFileSync(stop, '');
      await new Promise(resolve => child.once('exit', resolve));
    }

    expect(leaked).toBe(0);
    expect(read).toBeGreaterThan(0);
  }, 20000);
});
