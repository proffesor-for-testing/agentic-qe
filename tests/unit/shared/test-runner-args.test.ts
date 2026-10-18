/**
 * Issue #909: runner argv helpers, and the spawn sites that use them. Spawn
 * sites are checked by launching a real recorder process that writes the argv
 * it received, so the test sees exactly what a runner would see.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  escapeRegExpLiteral, isJestCommand, jestExactPathPattern, nameFilterArg, runnerFilePath,
} from '../../../src/shared/test-runner-args.js';
import { FlakyDetectorService } from '../../../src/domains/test-execution/services/flaky-detector.js';
import { VitestPhaseExecutor } from '../../../src/test-scheduling/executors/vitest-executor.js';
import type { TestPhase } from '../../../src/test-scheduling/interfaces.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aqe-909-argv-')));
  fixtures.push(dir);
  return dir;
}

/** A Node script that records its argv (after the script path) as JSON. */
function recorder(dir: string, name = 'recorder.cjs'): { script: string; argv: () => string[] } {
  const out = join(dir, 'argv.json');
  const script = join(dir, name);
  writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));\n`);
  return { script, argv: () => JSON.parse(readFileSync(out, 'utf8')) };
}

describe('test-runner-args helpers', () => {
  it('escapes every regex metacharacter', () => {
    const literal = 'route[id](group)+v1.test.ts ^$ {2}|\\ *?';
    expect(new RegExp(`^${escapeRegExpLiteral(literal)}$`).test(literal)).toBe(true);
  });

  it('returns absolute paths, so a leading "-" never reaches the runner', () => {
    const dir = fixture();
    expect(runnerFilePath('-dash.test.ts', dir)).toBe(join(dir, '-dash.test.ts'));
    expect(runnerFilePath('--watch', dir).startsWith('-')).toBe(false);
  });

  it('resolves directory symlinks but keeps the file name', () => {
    const dir = fixture();
    mkdirSync(join(dir, 'real'));
    symlinkSync(join(dir, 'real'), join(dir, 'link'));
    expect(runnerFilePath('link/a.test.ts', dir)).toBe(join(dir, 'real', 'a.test.ts'));
  });

  it('builds a Jest pattern that matches exactly one file', () => {
    const dir = fixture();
    const re = new RegExp(jestExactPathPattern('app/route[id](group)+v1.test.ts', dir));
    expect(re.test(join(dir, 'app/route[id](group)+v1.test.ts'))).toBe(true);
    expect(re.test(join(dir, 'app/routeigroupv1xtest.ts'))).toBe(false);
    expect(re.test(join(dir, 'app/route[id](group)+v1.test.tsx'))).toBe(false);
    expect(re.test(join(dir, 'x', 'app/route[id](group)+v1.test.ts'))).toBe(false);
  });

  it('puts name filters in --flag=value form', () => {
    expect(nameFilterArg('jest', '-x')).toBe('--testNamePattern=^-x$');
    expect(nameFilterArg('vitest', 'a.b')).toBe('--testNamePattern=^a\\.b$');
    expect(nameFilterArg('mocha', '-x (y)')).toBe('--grep=^-x(?: > | )\\(y\\)$');
  });

  it('recognises Jest command vectors', () => {
    expect(isJestCommand(['npx', 'jest', '--json'])).toBe(true);
    expect(isJestCommand(['node_modules/.bin/jest'])).toBe(true);
    expect(isJestCommand(['npx', 'vitest', 'run'])).toBe(false);
  });
});

describe('spawn sites pass safe file arguments (#909)', () => {
  it('FlakyDetectorService passes an absolute path for a "-" file', async () => {
    const dir = fixture();
    const rec = recorder(dir);
    const detector = new FlakyDetectorService({} as never, {
      testRunner: process.execPath, testRunnerArgs: [rec.script], cwd: dir, runTimeout: 10000,
    });
    await (detector as unknown as { executeTestFile(file: string, run: number): Promise<unknown> })
      .executeTestFile('-dash.test.ts', 0).catch(() => undefined);
    expect(rec.argv()).toEqual([join(dir, '-dash.test.ts')]);
  });

  it('FlakyDetectorService passes Jest an escaped, anchored pattern', async () => {
    const dir = fixture();
    const rec = recorder(dir, 'jest');
    const detector = new FlakyDetectorService({} as never, {
      testRunner: process.execPath, testRunnerArgs: [rec.script, '--json'], cwd: dir, runTimeout: 10000,
    });
    await (detector as unknown as { executeTestFile(file: string, run: number): Promise<unknown> })
      .executeTestFile('app/route[id](group)+v1.test.ts', 0).catch(() => undefined);
    const [, pattern] = rec.argv();
    expect(new RegExp(pattern).test(join(dir, 'app/route[id](group)+v1.test.ts'))).toBe(true);
    expect(new RegExp(pattern).test(join(dir, 'app/routeigroupv1xtest.ts'))).toBe(false);
  });

  it('VitestPhaseExecutor passes absolute paths for explicit test files', async () => {
    const dir = fixture();
    // buildArgs starts with "vitest"; with vitestPath=node that runs ./vitest.
    const rec = recorder(dir, 'vitest');
    const executor = new VitestPhaseExecutor({ vitestPath: process.execPath, cwd: dir });
    const phase: TestPhase = {
      id: 'p', name: 'p', testTypes: ['unit'], testPatterns: [],
      thresholds: { minPassRate: 1, maxFlakyRatio: 1, minCoverage: 0 },
      parallelism: 1, timeoutMs: 10000, failFast: false,
    };
    await executor.execute(phase, ['-dash.test.ts', '--watch']);
    const argv = rec.argv();
    expect(argv).toContain(join(dir, '-dash.test.ts'));
    expect(argv).toContain(join(dir, '--watch'));
    expect(argv).not.toContain('--watch');
    expect(argv).not.toContain('-dash.test.ts');
  });
});
