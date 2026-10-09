import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { VitestPhaseExecutor } from '../../../src/test-scheduling/executors/vitest-executor.js';
import type { TestPhase } from '../../../src/test-scheduling/interfaces.js';

const require = createRequire(import.meta.url);
const vitestDirectory = dirname(require.resolve('vitest/package.json'));
const nativeCli = join(vitestDirectory, 'vitest.mjs');
const fixtures: string[] = [];

function fixture(fails = false): string {
  const root = mkdtempSync(join(tmpdir(), 'aqe-phase-workers-'));
  fixtures.push(root);
  mkdirSync(join(root, 'home'));
  mkdirSync(join(root, 'tmp'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  // Forward real Node to the installed runner without downloading through npx.
  writeFileSync(join(root, 'vitest'), `import ${JSON.stringify(pathToFileURL(nativeCli).href)};`);
  writeFileSync(join(root, 'vitest.config.mjs'), `export default { cacheDir: ${JSON.stringify(join(root, 'cache'))}, test: { include: ['*.test.ts'] } };`);
  for (const name of ['first', 'second']) {
    writeFileSync(join(root, name + '.test.ts'), `
      import { test, expect } from ${JSON.stringify(pathToFileURL(join(vitestDirectory, 'dist/index.js')).href)};
      import { appendFileSync } from 'node:fs';
      test(${JSON.stringify(name)}, async () => {
        appendFileSync(${JSON.stringify(join(root, 'events'))}, JSON.stringify({ event: 'start', name: ${JSON.stringify(name)} }) + '\\n');
        await new Promise(resolve => setTimeout(resolve, 50));
        appendFileSync(${JSON.stringify(join(root, 'events'))}, JSON.stringify({ event: 'end', name: ${JSON.stringify(name)} }) + '\\n');
        expect(1).toBe(${fails && name === 'second' ? 2 : 1});
      });`);
  }
  return root;
}

function phase(parallelism: number): TestPhase {
  return {
    id: 'native', name: 'native', testTypes: ['unit'], testPatterns: ['first.test.ts', 'second.test.ts'],
    thresholds: { minPassRate: 1, maxFlakyRatio: 1, minCoverage: 0 },
    parallelism, timeoutMs: 30000, failFast: false,
  };
}

function executor(root: string): VitestPhaseExecutor {
  return new VitestPhaseExecutor({
    vitestPath: process.execPath, cwd: root,
    env: {
      HOME: join(root, 'home'), USERPROFILE: join(root, 'home'),
      TMPDIR: join(root, 'tmp'), TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), CI: 'true',
    },
    extraArgs: ['--config', join(root, 'vitest.config.mjs'), '--coverage.enabled=false'],
  });
}

interface CallbackEvent { event: 'start' | 'end'; name: string }

function events(root: string): CallbackEvent[] {
  return readFileSync(join(root, 'events'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
}

function completedCallbacks(root: string): string[] {
  return events(root).filter(event => event.event === 'end').map(event => event.name).sort();
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native Vitest phase worker limits', () => {
  it.each([1, 2])('executes real tests with a positive worker limit of %s', async parallelism => {
    const root = fixture();
    const result = await executor(root).execute(phase(parallelism));
    expect(result.success, result.error).toBe(true);
    expect(result.totalTests).toBe(2);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(completedCallbacks(root)).toEqual(['first', 'second']);
    if (parallelism === 1) {
      let active = 0;
      for (const event of events(root)) {
        active += event.event === 'start' ? 1 : -1;
        expect(active).toBeLessThanOrEqual(1);
      }
      expect(active).toBe(0);
    }
  }, 10000);

  it('retains runner defaults when no positive limit is requested', async () => {
    const root = fixture();
    const result = await executor(root).execute(phase(0));
    expect(result.success, result.error).toBe(true);
    expect(result.totalTests).toBe(2);
    expect(completedCallbacks(root)).toEqual(['first', 'second']);
  }, 10000);

  it('retains actual assertion failures with a positive worker limit', async () => {
    const root = fixture(true);
    const result = await executor(root).execute(phase(2));
    expect(result.success).toBe(false);
    expect(result.totalTests).toBe(2);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(completedCallbacks(root)).toEqual(['first', 'second']);
  }, 10000);
});
