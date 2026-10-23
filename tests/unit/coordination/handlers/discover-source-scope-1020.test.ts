/**
 * #1020: quality assessment judges the whole source scope, so its discovery
 * must not silently drop TypeScript module files (.mts/.cts), component files
 * (.vue/.svelte) or symlinked files. Other callers keep the narrower scope.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSourceFiles } from '../../../../src/coordination/handlers/handler-utils';

describe('discoverSourceFiles scope (#1020)', () => {
  let dir: string;
  const rel = (files: string[]) => files.map((f) => f.slice(dir.length + 1)).sort();

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-1020-discover-')));
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'lib'));
    for (const name of ['a.ts', 'b.mts', 'c.cts', 'd.vue', 'e.svelte']) {
      writeFileSync(join(dir, 'src', name), 'export const x = 1;\n');
    }
    writeFileSync(join(dir, 'lib', 'real.ts'), 'export const y = 2;\n');
    symlinkSync(join(dir, 'lib', 'real.ts'), join(dir, 'src', 'linked.ts'));
    symlinkSync(join(dir, 'lib', 'missing.ts'), join(dir, 'src', 'dangling.ts'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('includes .mts and .cts files by default', async () => {
    expect(rel(await discoverSourceFiles(join(dir, 'src')))).toEqual(['src/a.ts', 'src/b.mts', 'src/c.cts']);
  });

  it('includes component files and symlinked files for a complete scope', async () => {
    const files = await discoverSourceFiles(join(dir, 'src'), { completeScope: true });

    expect(rel(files)).toEqual(['src/a.ts', 'src/b.mts', 'src/c.cts', 'src/d.vue', 'src/e.svelte', 'src/linked.ts']);
  });
});
