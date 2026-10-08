import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { countTests } from '../../../../src/domains/code-intelligence/services/metric-collector/test-counter.js';

const require = createRequire(import.meta.url);
const vitestPackage = require.resolve('vitest/package.json');
const vitestDirectory = dirname(realpathSync(vitestPackage));
const nativeCli = join(vitestDirectory, 'vitest.mjs');
const fixtures: string[] = [];
const initialPath = process.env.PATH;
const initialTmpdir = process.env.TMPDIR;

function fixture(source: string, staticParse = false): string {
  const root = mkdtempSync(join(tmpdir(), 'aqe-native-test-count-'));
  fixtures.push(root);
  for (const directory of ['node_modules', 'bin', 'home', 'tmp']) mkdirSync(join(root, directory));
  symlinkSync(vitestDirectory, join(root, 'node_modules', 'vitest'), 'dir');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module', devDependencies: { vitest: '*' } }));
  // Put all generated runner caches in the owned fixture, never the linked package.
  writeFileSync(join(root, 'vitest.config.mjs'), `export default { cacheDir: ${JSON.stringify(join(root, 'cache'))}, test: { cache: false${staticParse ? ', staticParse: true' : ''} } };`);
  writeFileSync(join(root, 'counter.test.ts'), source);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  // Invoke the actual installed runner with a private environment and no npx download.
  writeFileSync(join(root, 'bin', 'npx'), '#!/bin/sh\n[ "$1" = vitest ] || exit 91\nshift\nexec /usr/bin/env -i ' +
    `HOME=${quote(join(root, 'home'))} TMPDIR=${quote(join(root, 'tmp'))} PATH=${quote(dirname(process.execPath) + ':/usr/bin:/bin')} CI=true ` +
    `${quote(process.execPath)} ${quote(nativeCli)} "$@"\n`, { mode: 0o755 });
  process.env.PATH = join(root, 'bin') + ':' + (initialPath || '');
  return root;
}

afterEach(() => {
  if (initialPath === undefined) delete process.env.PATH;
  else process.env.PATH = initialPath;
  if (initialTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = initialTmpdir;
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32')('native Vitest collection metrics', () => {
  it('counts expanded cases when imports write raw non-JSON output', async () => {
    const root = fixture(`import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
      process.stdout.write('module ready\\n');
      it.each([1, 2, 3])('raw output case %s', () => { writeFileSync('executed', 'bad'); });`);
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(3);
    expect(existsSync(join(root, 'executed'))).toBe(false);
  }, 10000);

  it('does not count raw import messages as tests in an empty collection', async () => {
    const root = fixture(`import 'vitest'; process.stdout.write('preflight > Ready\\n');`);
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(0);
  }, 10000);

  it('keeps artifact paths with spaces and shell syntax as a single argument', async () => {
    const root = fixture(`import { it } from 'vitest';
      it.each([1, 2])('path case %s', () => { throw new Error('must not execute'); });`);
    const privateTmpdir = join(root, "artifact space ' $(touch injected) `touch injected`");
    mkdirSync(privateTmpdir);
    process.env.TMPDIR = privateTmpdir;
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(2);
    expect(existsSync(join(root, 'injected'))).toBe(false);
    expect(existsSync(join(privateTmpdir, 'injected'))).toBe(false);
  }, 10000);

  it('counts expanded parameter cases without executing callbacks', async () => {
    const root = fixture(`import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
      it.each([1, 2, 3, 4])('handles value %s', () => { writeFileSync('executed', 'bad'); throw new Error('must not execute'); });`);
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(4);
    expect(existsSync(join(root, 'executed'))).toBe(false);
  });

  it('collects computed and nested tests when project configuration enables static parsing', async () => {
    const root = fixture(`import { describe, it } from 'vitest';
      console.log('preflight > Ready');
      describe('computed', () => { for (const value of [1, 2, 3]) it('case ' + value, () => { throw new Error('must not execute'); }); });`, true);
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(3);
  });

  it('collects cases from a relative project path without changing the process cwd', async () => {
    const root = fixture(`import { it } from 'vitest';
      it.each([1, 2, 3, 4])('relative case %s', () => { throw new Error('must not execute'); });`);
    const projectPath = relative(process.cwd(), root);
    const metrics = await countTests(projectPath);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(4);
  });

  it('preserves an empty structured collection', async () => {
    const root = fixture("import 'vitest';");
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(0);
  });

  it('preserves ordinary discovered cases', async () => {
    const root = fixture(`import { it } from 'vitest';
      it('ordinary', () => { throw new Error('must not execute'); });
      it('second', () => { throw new Error('must not execute'); });`);
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(2);
  });
});
