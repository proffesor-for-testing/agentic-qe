import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { VitestPhaseExecutor, type VitestConfig } from '../../../src/test-scheduling/executors/vitest-executor.js';
import type { TestPhase } from '../../../src/test-scheduling/interfaces.js';

const require = createRequire(import.meta.url);
const vitestDirectory = dirname(require.resolve('vitest/package.json'));
const coverageDirectory = dirname(require.resolve('@vitest/coverage-v8/package.json'));
const fixtures: string[] = [];

function fixture(options: { sameLine?: boolean; fails?: boolean; emptyCoverage?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'aqe-phase-coverage-'));
  fixtures.push(root);
  for (const directory of ['home', 'tmp', 'node_modules', 'node_modules/@vitest']) mkdirSync(join(root, directory));
  symlinkSync(vitestDirectory, join(root, 'node_modules/vitest'), 'dir');
  symlinkSync(coverageDirectory, join(root, 'node_modules/@vitest/coverage-v8'), 'dir');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  // Real Node and the installed runner/provider; no npx download or substitute output.
  writeFileSync(join(root, 'vitest'), `import ${JSON.stringify(pathToFileURL(join(vitestDirectory, 'vitest.mjs')).href)};`);
  writeFileSync(join(root, 'sample.mjs'), options.sameLine
    ? 'export function covered() { return 4; } export function uncovered() { return 9; }\n'
    : 'export function covered() { return 4; }\nexport function uncovered() { return 9; }\n');
  if (options.sameLine) writeFileSync(join(root, 'other.mjs'), 'export function one() { return 1; }\nexport function two() { return 2; }\n');
  writeFileSync(join(root, 'vitest.config.mjs'), `export default {
    cacheDir: ${JSON.stringify(join(root, 'cache'))},
    test: { globals: true, include: ['proof.test.mjs'], coverage: {
      provider: 'v8', include: ${JSON.stringify(options.emptyCoverage ? ['absent.mjs'] : ['sample.mjs', 'other.mjs'])}
    } }
  };`);
  writeFileSync(join(root, 'proof.test.mjs'), `
    import { covered } from './sample.mjs';
    import { writeFileSync } from 'node:fs';
    it('executes a real callback', () => {
      writeFileSync(${JSON.stringify(join(root, 'callback'))}, 'ran');
      expect(covered()).toBe(${options.fails ? 5 : 4});
    });`);
  return root;
}

const phase: TestPhase = {
  id: 'coverage', name: 'coverage', testTypes: ['unit'], testPatterns: ['proof.test.mjs'],
  thresholds: { minPassRate: 1, maxFlakyRatio: 1, minCoverage: 0.4 },
  parallelism: 0, timeoutMs: 30000, failFast: false,
};

function executor(root: string, config: VitestConfig = {}): VitestPhaseExecutor {
  return new VitestPhaseExecutor({
    vitestPath: process.execPath, cwd: root, ...config,
    extraArgs: ['--config', join(root, 'vitest.config.mjs'), ...(config.extraArgs || [])],
    env: {
      HOME: join(root, 'home'), USERPROFILE: join(root, 'home'),
      TMPDIR: join(root, 'tmp'), TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), CI: 'true',
    },
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('native current Vitest phase coverage', () => {
  it.each(['json', 'lcov', 'text', 'html'] as const)('reads current coverage while preserving the %s reporter', async reporter => {
    const root = fixture();
    const result = await executor(root, { coverageReporter: reporter }).execute(phase);
    expect(result.passed, result.error).toBe(1);
    expect(existsSync(join(root, 'callback'))).toBe(true);
    expect(result.coverage).toBe(0.5);
    expect(result.success).toBe(true);
    const artifact = { json: 'coverage-final.json', lcov: 'lcov.info', html: 'index.html' };
    if (reporter !== 'text') expect(existsSync(join(root, 'coverage', artifact[reporter]))).toBe(true);
  }, 10000);

  it('reads current coverage with an absolute user report directory', async () => {
    const root = fixture();
    const coverageDir = join(root, 'absolute-reports');
    const result = await executor(root, { coverageDir }).execute(phase);
    expect(result.passed, result.error).toBe(1);
    expect(result.coverage).toBe(0.5);
    expect(result.success).toBe(true);
    expect(existsSync(join(coverageDir, 'coverage-final.json'))).toBe(true);
  }, 10000);

  it('does not borrow a real previous summary when current coverage is disabled', async () => {
    const root = fixture();
    const producer = await executor(root, { extraArgs: ['--coverage.reporter=json-summary'] }).execute(phase);
    expect(producer.coverage, producer.error).toBe(0.5);
    const summary = join(root, 'coverage', 'coverage-summary.json');
    expect(JSON.parse(readFileSync(summary, 'utf8')).total.lines.pct).toBe(50);
    rmSync(join(root, 'callback'));
    const current = await executor(root, { extraArgs: ['--coverage.enabled=false'] }).execute(phase);
    expect(current.passed, current.error).toBe(1);
    expect(existsSync(join(root, 'callback'))).toBe(true);
    expect(current.coverage).toBe(0);
    expect(current.success).toBe(false);
    expect(existsSync(summary)).toBe(true);
  }, 10000);

  it('matches the native line summary for same-line statements across multiple files', async () => {
    const root = fixture({ sameLine: true });
    const result = await executor(root, { extraArgs: ['--coverage.reporter=json-summary'] }).execute(phase);
    const lines = JSON.parse(readFileSync(join(root, 'coverage', 'coverage-summary.json'), 'utf8')).total.lines;
    expect(lines.total).toBe(3);
    expect(lines.covered).toBe(1);
    expect(lines.pct).toBe(33.33);
    expect(result.coverage).toBe(lines.pct / 100);
    expect(result.passed, result.error).toBe(1);
    expect(result.success).toBe(false);
  }, 10000);

  it('retains an actual assertion failure alongside collected coverage', async () => {
    const root = fixture({ fails: true });
    const result = await executor(root, { extraArgs: ['--coverage.reportOnFailure'] }).execute(phase);
    expect(result.totalTests, result.error).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(0);
    expect(existsSync(join(root, 'callback'))).toBe(true);
    expect(result.coverage).toBe(0.5);
    expect(result.success).toBe(false);
  }, 10000);

  it('keeps an empty native coverage map below a positive coverage requirement', async () => {
    const root = fixture({ emptyCoverage: true });
    const result = await executor(root).execute(phase);
    expect(result.passed, result.error).toBe(1);
    expect(existsSync(join(root, 'callback'))).toBe(true);
    expect(result.coverage).toBe(0);
    expect(result.success).toBe(false);
  }, 10000);
});
