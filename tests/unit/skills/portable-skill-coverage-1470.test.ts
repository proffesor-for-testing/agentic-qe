/**
 * #1470 — brutal-honesty-review assess-tests.sh must parse coverage portably and
 * deterministically, and never award a coverage rating without a valid percentage.
 * A stub `npm` emits fixture output; `npm test` always passes so the test-runner
 * fixture is independent of the coverage parser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIRRORS, ROOT, createBsdHarness, writeExec, type BsdHarness } from './helpers/bsd-grep-env';

let h: BsdHarness;
beforeAll(() => { h = createBsdHarness('aqe-1470-cov-'); });
afterAll(() => h.dispose());

const SCRIPT = 'brutal-honesty-review/scripts/assess-tests.sh';
const COPIES = [...MIRRORS.map((m) => `${m}/${SCRIPT}`), '.kiro/skills/qe-brutal-honesty-review/scripts/assess-tests.sh'];
const RATING = /(MICHELIN STAR|ACCEPTABLE|RAW):[^\n]*coverage/;

interface Fixture { coverageScript?: boolean; output?: string; exit?: number; noPackageJson?: boolean }

function project(opts: Fixture): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(h.work, 'cov-'));
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/math.test.js'), "describe('math', () => { it('adds', () => {}); });\n");
  if (!opts.noPackageJson) {
    const scripts: Record<string, string> = { test: 'vitest run' };
    if (opts.coverageScript !== false) scripts['test:coverage'] = 'vitest run --coverage';
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts }, null, 2));
  }
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(dir, 'coverage-output.txt'), opts.output ?? '');
  writeExec(join(bin, 'npm'), `#!/bin/sh
if [ "$1" = "run" ] && [ "$2" = "test:coverage" ]; then
  cat "${join(dir, 'coverage-output.txt')}"
  exit ${opts.exit ?? 0}
fi
exit 0
`);
  return { dir, env: h.env({}, bin) };
}

function coverageSection(stdout: string): string {
  const start = stdout.indexOf('COVERAGE CHECK');
  const end = stdout.indexOf('EDGE CASE CHECK');
  return stdout.slice(start, end === -1 ? undefined : end);
}

const TABLE = (...rows: string[]) => [
  '----------|---------|----------|---------|---------|',
  'File      | % Stmts | % Branch | % Funcs | % Lines |',
  '----------|---------|----------|---------|---------|',
  ...rows,
].join('\n');

const RATED: Array<[string, Fixture, RegExp]> = [
  ['"All files: 93.50%"', { output: '> vitest run --coverage\nAll files: 93.50%\n' }, /MICHELIN STAR: 93\.50% coverage/],
  ['an istanbul table with a low score', { output: TABLE('All files |   42.1  |    30    |   50    |   42.1  |') }, /RAW: 42\.1% coverage/],
  ['a text-summary Statements line', { output: 'Statements   : 65.5% ( 131/200 )\nBranches     : 50% ( 1/2 )\n' }, /ACCEPTABLE: 65\.5% coverage/],
  ['a test name mentioning "All files" before the real row',
    { output: `    ✓ All files are listed (95 ms)\n${TABLE('All files |   12.5 | 10 | 20 | 12.5 |')}` }, /RAW: 12\.5% coverage/],
  ['the same summary printed twice', { output: `${TABLE('All files |   88 | 1 | 1 | 88 |')}\n${TABLE('All files |   88 | 1 | 1 | 88 |')}` }, /MICHELIN STAR: 88% coverage/],
  ['ANSI-coloured output', { output: '\u001b[32mAll files\u001b[0m | \u001b[33m81.2\u001b[0m | 70 |' }, /MICHELIN STAR: 81\.2% coverage/],
];

const UNAVAILABLE: Array<[string, Fixture, RegExp]> = [
  ['empty output', { output: '' }, /produced no output/],
  ['garbage output', { output: 'compiling... done in 12.5% of the time\nok\n' }, /could not parse a coverage percentage/],
  ['"All files: 3 found" (no %)', { output: '  - All files: 3 found\n' }, /could not parse a coverage percentage/],
  ['"Statements : Unknown% ( 0/0 )"', { output: 'Statements   : Unknown% ( 0/0 )\nLines        : Unknown% ( 0/0 )\n' }, /could not parse a coverage percentage from: Statements/],
  ['decimal comma "79,9%"', { output: 'All files: 79,9%\n' }, /could not parse a coverage percentage/],
  ['decimal comma in a table', { output: TABLE('All files |   79,9 | 1 | 1 | 79,9 |') }, /could not parse a coverage percentage/],
  ['an out-of-range value', { output: 'All files: 250%\n' }, /could not parse a coverage percentage/],
  ['different summaries (monorepo)', { output: `${TABLE('All files |   91 | 1 | 1 | 91 |')}\n${TABLE('All files |   35 | 1 | 1 | 35 |')}` }, /multiple coverage summaries with different values \(91, 35\)/],
  ['a failing command without a valid row', { output: 'Error: Cannot find module vitest\n', exit: 1 }, /exited with status 1 and printed no valid coverage summary/],
  ['no coverage script', { coverageScript: false }, /no 'test:coverage' script/],
  ['no package.json', { noPackageJson: true }, /no package\.json/],
];

describe.runIf(process.platform !== 'win32')('#1470 assess-tests.sh coverage', () => {
  for (const copy of COPIES) {
    const assess = (f: Fixture) => {
      const p = project(f);
      const r = h.run('bash', [join(ROOT, copy), 'tests'], { cwd: p.dir, env: p.env });
      return { ...r, section: coverageSection(r.stdout) };
    };

    it.each(RATED)(`${copy}: rates %s`, (_n, fixture, rating) => {
      const r = assess(fixture);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.section).toMatch(rating);
      expect(r.section.match(new RegExp(RATING.source, 'g'))).toHaveLength(1);
      expect(r.section).not.toMatch(/UNAVAILABLE|command failed/);
      expect(r.stderr).not.toMatch(/invalid option/);
    });

    it.each(UNAVAILABLE)(`${copy}: %s is reported unavailable without a rating`, (_n, fixture, reason) => {
      const r = assess(fixture);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.section).toMatch(/COVERAGE UNAVAILABLE/);
      expect(r.section).toMatch(reason);
      expect(r.section).not.toMatch(RATING);
    });

    it(`${copy}: a failing run with a valid row (coverage threshold) is rated with a failure note`, () => {
      const r = assess({ output: `${TABLE('All files |   41.2 | 30 | 40 | 41.2 |')}\nERROR: Coverage for statements (41.2%) does not meet global threshold (80%)\n`, exit: 1 });
      expect(r.section).toMatch(/RAW: 41\.2% coverage/);
      expect(r.section).toMatch(/coverage command failed \(status 1\)/);
      expect(r.section).not.toMatch(/UNAVAILABLE/);
    });
  }

  it('pre-fix parser (inline fixture) rates an empty value as MICHELIN STAR under BSD grep', () => {
    // The coverage logic of assess-tests.sh at 10718e16, verbatim except for the function wrapper.
    const OLD_PARSER = `coverage=$(npm run test:coverage 2>&1 | grep -oP '\\d+\\.\\d+(?=%)' | head -1 || echo "0")
if (( $(echo "$coverage < 50" | bc -l) )); then
  echo "RAW: \${coverage}% coverage"
elif (( $(echo "$coverage < 80" | bc -l) )); then
  echo "ACCEPTABLE: \${coverage}% coverage"
else
  echo "MICHELIN STAR: \${coverage}% coverage"
fi`;
    const p = project({ output: 'All files: 93.50%\n' });
    const r = h.run('bash', ['-c', OLD_PARSER], { cwd: p.dir, env: p.env });
    expect(r.stderr).toMatch(/invalid option -- P/);
    expect(r.stdout).toMatch(/MICHELIN STAR: % coverage/); // the defect
  });
});
