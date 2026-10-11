import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync, realpathSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { buildSync } from 'esbuild';
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


describe.skipIf(process.platform === 'win32')('native Vitest collection recovery', () => {
  it('uses the static list when importing a test module times out', async () => {
    const root = fixture(`import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      it('first static case', () => { writeFileSync('executed', 'bad'); });
      it('second static case', () => { writeFileSync('executed', 'bad'); });`, true);
    const metrics = await countTests(root, { timeout: 1500 });
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(2);
    expect(existsSync(join(root, 'executed'))).toBe(false);
  }, 10000);

  it('uses the static list when importing a test module throws', async () => {
    const root = fixture(`import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
      throw new Error('collection import deliberately refused');
      it('first static case', () => { writeFileSync('executed', 'bad'); });
      it('second static case', () => { writeFileSync('executed', 'bad'); });`, true);
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(2);
    expect(existsSync(join(root, 'executed'))).toBe(false);
  }, 10000);

  it('preserves an empty static list after collection fails', async () => {
    const root = fixture(`import { describe } from 'vitest'; throw new Error('empty import deliberately refused'); describe('empty suite', () => {});`, true);
    const metrics = await countTests(root);
    expect(metrics.source).toBe('vitest');
    expect(metrics.total).toBe(0);
  }, 10000);

  it('uses file-pattern estimates when collection and static listing both fail', async () => {
    const root = fixture(`import { it } from 'vitest';
      it('first estimated case', () => { throw new Error('must not execute'); });
      it('second estimated case', () => { throw new Error('must not execute'); });`, true);
    writeFileSync(join(root, 'vitest.config.mjs'), 'export default { test: ');
    const metrics = await countTests(root);
    expect(metrics.source).toBe('fallback');
    expect(metrics.total).toBe(2);
  }, 10000);

});


describe.skipIf(process.platform === 'win32')('native listing resource ownership', () => {
  it('uses static discovery for large suites without importing modules', async () => {
    const cases = Array.from({ length: 1001 }, (_, i) => `it('case ${i}', () => { throw new Error('must not execute'); });`).join('\n');
    const root = fixture(`import { it } from 'vitest'; import { writeFileSync } from 'node:fs'; writeFileSync('imported', 'bad');\n${cases}`);
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'vitest', total: 1001 });
    expect(existsSync(join(root, 'imported'))).toBe(false);
  }, 15000);

  it('terminates timed-out collection descendants and leaves no listing directory', async () => {
    const root = fixture(`import { it } from 'vitest'; import { writeFileSync } from 'node:fs';
      writeFileSync('collector.pid', String(process.pid));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3500);
      writeFileSync('late-import-effect', 'bad');
      it('first static case', () => { throw new Error('must not execute'); });
      it('second static case', () => { throw new Error('must not execute'); });`, true);
    process.env.TMPDIR = join(root, 'tmp');
    const metrics = await countTests(root, { timeout: 1500 });
    expect(metrics).toMatchObject({ source: 'vitest', total: 2 });
    expect(existsSync(join(root, 'collector.pid'))).toBe(true);
    const pid = Number(readFileSync(join(root, 'collector.pid'), 'utf8'));
    try {
      const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(alive()).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 4000));
      expect(existsSync(join(root, 'late-import-effect'))).toBe(false);
      expect(readdirSync(join(root, 'tmp')).filter(name => name.startsWith('aqe-vitest-list-'))).toEqual([]);
    } finally {
      try { process.kill(pid, 'SIGKILL'); } catch { /* original-source control cleanup */ }
    }
  }, 15000);

  it('gives static and collection attempts distinct JSON output paths', async () => {
    const root = fixture(`import { it } from 'vitest'; throw new Error('import refused'); it('static case', () => {});`, true);
    const shim = join(root, 'bin', 'npx');
    const existing = readFileSync(shim, 'utf8');
    writeFileSync(shim, existing.replace('shift\n', `shift\nprintf '%s\n' "$@" >> '${join(root, 'attempt-args')}'\n`), { mode: 0o755 });
    const metrics = await countTests(root);
    expect(metrics).toMatchObject({ source: 'vitest', total: 1 });
    const outputs = readFileSync(join(root, 'attempt-args'), 'utf8').split('\n').filter(line => line.startsWith('--json='));
    expect(outputs).toHaveLength(2);
    expect(new Set(outputs).size).toBe(2);
  }, 10000);
});


describe.skipIf(process.platform === 'win32')('caller termination ownership', () => {
  it('releases process listeners after successful collection', async () => {
    const root = fixture("import { it } from 'vitest'; it('case', () => {});");
    const names = ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP'];
    const before = names.map(name => process.listenerCount(name));
    expect((await countTests(root)).total).toBe(1);
    expect(names.map(name => process.listenerCount(name))).toEqual(before);
  });
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP', 'exit'])('reaps collection descendants and artifacts when the caller receives %s', async (signal) => {
    const root = fixture(`import { it } from 'vitest'; import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      writeFileSync('collector.pid', String(process.pid)); writeFileSync('descendant.pid', String(child.pid));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);
      writeFileSync('late-import-effect', 'bad');
      it('ordinary static declaration', () => { throw new Error('must not execute'); });`, true);
    const bundle = join(root, 'counter-bundle.mjs');
    buildSync({ entryPoints: [join(process.cwd(), 'src/domains/code-intelligence/services/metric-collector/test-counter.ts')],
      bundle: true, platform: 'node', format: 'esm', outfile: bundle,
      alias: { '@shared': join(process.cwd(), 'src/shared') } });
    writeFileSync(join(root, 'caller.mjs'), `import { countTests } from './counter-bundle.mjs'; process.on('message', () => process.exit(23)); await countTests(${JSON.stringify(root)}, { timeout: 25000 });`);
    const caller = spawn(process.execPath, [join(root, 'caller.mjs')], {
      cwd: root, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { ...process.env, PATH: process.env.PATH, TMPDIR: join(root, 'tmp') },
    });
    const closed = new Promise(resolve => caller.once('close', (code, actualSignal) => resolve({ code, signal: actualSignal })));
    const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
    let pids = [];
    try {
      const deadline = Date.now() + 10000;
      while (!existsSync(join(root, 'descendant.pid')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      expect(existsSync(join(root, 'descendant.pid'))).toBe(true);
      pids = ['collector.pid', 'descendant.pid'].map(name => Number(readFileSync(join(root, name), 'utf8')));
      expect(pids.every(alive)).toBe(true);
      if (signal === 'exit') caller.send({ exit: true });
      else process.kill(-caller.pid!, signal);
      expect(await closed).toEqual(signal === 'exit' ? { code: 23, signal: null } : { code: null, signal });
      const reapedBy = Date.now() + 2000;
      while (pids.some(alive) && Date.now() < reapedBy) await new Promise(resolve => setTimeout(resolve, 25));
      expect(pids.some(alive)).toBe(false);
      expect(existsSync(join(root, 'late-import-effect'))).toBe(false);
      expect(readdirSync(join(root, 'tmp')).filter(name => name.startsWith('aqe-vitest-list-'))).toEqual([]);
    } finally {
      try { process.kill(-caller.pid!, 'SIGKILL'); } catch { /* owned caller already ended */ }
      for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* already reaped */ } }
    }
  }, 15000);
});
