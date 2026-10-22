/**
 * #1154 review: files the project's coverage tool is configured to leave out
 * are not "unmeasured". Without this, a normal exclude list (this repo's own
 * vitest config excludes `src/**\/index.ts`) would fail every verdict forever.
 * The scope is read statically from literal arrays; configs are never executed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveExistingCoverage } from '../../../../src/coordination/handlers/coverage-target';
import { globToRegExp, inCoverageScope, readCoverageScope } from '../../../../src/coordination/handlers/coverage-scope';
import { evaluateCliCoverage, type CoverageAnalyzeAPI } from '../../../../src/cli/utils/coverage-verdict';

const OLD = new Date('2020-01-01T00:00:00Z');
const NEWER = new Date('2021-01-01T00:00:00Z');

let root: string;
const at = (rel: string) => path.join(root, rel);

function write(rel: string, content: string, mtime: Date = OLD): void {
  fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
  fs.writeFileSync(at(rel), content);
  fs.utimesSync(at(rel), mtime, mtime);
}

const lcov = (...files: string[]) => files.map(f =>
  `TN:\nSF:${f}\nFN:1,f\nFNDA:1,f\nFNF:1\nFNH:1\nDA:1,1\nLF:1\nLH:1\nend_of_record\n`).join('');

async function evidenceFor(target: string) {
  const existing = await resolveExistingCoverage(target);
  if (existing.status !== 'evaluated' || existing.evaluation.status !== 'measured') throw new Error('not measured');
  return existing.evaluation.evidence;
}

const analyzer: CoverageAnalyzeAPI = {
  analyze: async (req: { coverageData: { summary: Record<string, number> } }) => ({
    success: true, value: { summary: req.coverageData.summary, recommendations: [] },
  }),
} as CoverageAnalyzeAPI;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1154-scope-')));
  fs.mkdirSync(at('.git'));
  fs.writeFileSync(at('package.json'), '{"name":"fx","version":"1.0.0"}');
  write('src/math.ts', 'export const add = (a: number, b: number) => a + b;');
  write('src/index.ts', "export * from './math';");
  write('src/util/index.ts', "export * from '../math';");
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('#1154 review — the project coverage scope is honoured', () => {
  it('(a) vitest exclude of src/**/index.ts: complete evidence, the verdict can pass', async () => {
    write('vitest.config.ts', `import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // comment with 'quotes'
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
  },
});
`);
    write('coverage/lcov.info', lcov('src/math.ts'), NEWER);

    const evidence = await evidenceFor(at('src'));
    expect(evidence).toMatchObject({ status: 'complete', unmeasuredFiles: [], targetFiles: 1 });
    expect(evidence.coverageScope).toEqual({ source: 'vitest.config.ts', readable: true });

    const outcome = await evaluateCliCoverage(analyzer, at('src'), 80, () => undefined);
    if (outcome.kind !== 'measured') throw new Error(outcome.kind);
    expect(outcome.insufficientEvidence).toEqual([]);
    expect(outcome.verdict.meetsThreshold).toBe(true);
  });

  it('(b) jest collectCoverageFrom with a negation excludes those files', async () => {
    write('jest.config.js', `module.exports = {
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/index.ts"],
  coveragePathIgnorePatterns: ["/node_modules/"],
};
`);
    write('coverage/lcov.info', lcov('src/math.ts'), NEWER);

    expect(await evidenceFor(at('src'))).toMatchObject({ status: 'complete', unmeasuredFiles: [] });
  });

  it('(b) jest scope in package.json, and coveragePathIgnorePatterns regexes', async () => {
    fs.writeFileSync(at('package.json'), JSON.stringify({
      name: 'fx', jest: { coveragePathIgnorePatterns: ['/node_modules/', 'index\\.ts$'] },
    }));
    write('coverage/lcov.info', lcov('src/math.ts'), NEWER);

    expect(await evidenceFor(at('src'))).toMatchObject({ status: 'complete', unmeasuredFiles: [] });
  });

  it('(c) a file inside the scope and missing from the report is still unmeasured', async () => {
    write('vitest.config.ts', "export default { test: { coverage: { exclude: ['src/**/index.ts'] } } };");
    write('src/unsafe.ts', 'export const run = (c: string) => eval(c);');
    write('coverage/lcov.info', lcov('src/math.ts'), NEWER);

    expect(await evidenceFor(at('src'))).toMatchObject({
      status: 'insufficient-evidence', unmeasuredFiles: [at('src/unsafe.ts')],
    });
  });

  it('(d) a source file outside include is not flagged', async () => {
    write('.nycrc.json', JSON.stringify({ include: ['src/util'], exclude: ['**/index.ts'] }));
    write('src/util/helper.ts', 'export const h = 1;');
    write('coverage/lcov.info', lcov('src/util/helper.ts'), NEWER);

    expect(await evidenceFor(at('src'))).toMatchObject({ status: 'complete', unmeasuredFiles: [], targetFiles: 1 });
  });

  it('c8 config in package.json is read', async () => {
    fs.writeFileSync(at('package.json'), JSON.stringify({ name: 'fx', c8: { exclude: ['src/**/index.ts'] } }));
    write('coverage/lcov.info', lcov('src/math.ts'), NEWER);

    expect(await evidenceFor(at('src'))).toMatchObject({ status: 'complete' });
  });
});

describe('#1154 review — static scope reading', () => {
  it('reads a spread of the tool defaults as harmless and other spreads as unreadable', () => {
    fs.writeFileSync(at('vitest.config.mts'),
      "export default { test: { coverage: { exclude: [...coverageConfigDefaults.exclude, 'src/gen/**'] } } };");
    expect(readCoverageScope(root)).toMatchObject({ readable: true, exclude: ['src/gen/**'] });

    fs.writeFileSync(at('vitest.config.mts'), "export default { test: { coverage: { exclude: [...mine, 'x'] } } };");
    expect(readCoverageScope(root)?.readable).toBe(false);
  });

  it('treats `coverage: options` as declared but unreadable', () => {
    fs.writeFileSync(at('vitest.config.ts'), 'const options = {}; export default { test: { coverage: options } };');
    expect(readCoverageScope(root)).toMatchObject({ source: 'vitest.config.ts', readable: false });
  });

  it('is null when no config declares a coverage scope', () => {
    fs.writeFileSync(at('vitest.config.ts'), 'export default { test: { globals: true } };');
    expect(readCoverageScope(root)).toBeNull();
  });

  it('matches globs the way coverage tools do', () => {
    expect(globToRegExp('src/**/index.ts').test('src/index.ts')).toBe(true);
    expect(globToRegExp('src/**/index.ts').test('src/a/b/index.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
    expect(globToRegExp('./src/**/*.{js,ts}').test('src/a/b.ts')).toBe(true);
    expect(globToRegExp('src/**/*.{js,ts}').test('src/a/b.tsx')).toBe(false);
    expect(globToRegExp('<rootDir>/src').test('src/x/y.js')).toBe(true);
  });

  it('applies include, then exclude, then ignore patterns', () => {
    const scope = { source: 's', readable: true, include: ['src/**'], exclude: ['src/gen/**'], ignorePatterns: [/fixture/] };
    expect(inCoverageScope(scope, at('src/a.ts'), root)).toBe(true);
    expect(inCoverageScope(scope, at('lib/a.ts'), root)).toBe(false);
    expect(inCoverageScope(scope, at('src/gen/a.ts'), root)).toBe(false);
    expect(inCoverageScope(scope, at('src/fixture.ts'), root)).toBe(false);
  });
});
