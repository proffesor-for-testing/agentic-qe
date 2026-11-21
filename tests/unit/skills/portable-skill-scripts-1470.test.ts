/**
 * #1470 — shipped skill commands must not depend on GNU-only `grep -P`.
 *
 * BSD grep (macOS) rejects `-P`. Inside an `if`, that error reads as "no match",
 * so hooks silently allow everything and the coverage helper rates an empty value.
 * These tests put a BSD-like `grep` first on PATH (it rejects -P with exit 2, and
 * otherwise execs the real grep), prove the pre-fix code fails under it, and prove
 * the shipped code and documented invocations behave correctly under it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const MIRRORS = ['assets/skills', '.claude/skills'] as const;
const PRE_FIX_COMMIT = '10718e16aaafa6d1fbc10aa31712c28e8fac2b1c';

const PRE_FIX_AVAILABLE = spawnSync('git', ['cat-file', '-e', `${PRE_FIX_COMMIT}^{commit}`], { cwd: ROOT }).status === 0;

let work: string;
let bsdBin: string;

function realGrep(): string {
  return execFileSync('bash', ['-c', 'command -v grep'], { encoding: 'utf8' }).trim();
}

/** Writes an executable file. */
function writeExec(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function bsdEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${bsdBin}:${process.env.PATH}`, NO_COLOR: '1', ...extra };
}

interface RunResult { status: number | null; stdout: string; stderr: string }

function run(cmd: string, args: string[], opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {}): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? work, input: opts.input ?? '', env: opts.env ?? bsdEnv(), encoding: 'utf8', timeout: 30_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Pre-fix version of a tracked file, or undefined if git history is unavailable. */
function preFix(path: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${PRE_FIX_COMMIT}:${path}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

/** Body of the first fenced bash block after `heading` in a markdown file. */
function bashBlockAfter(markdown: string, heading: string): string {
  const from = markdown.indexOf(heading);
  expect(from, `heading ${heading}`).toBeGreaterThanOrEqual(0);
  const m = /```(?:bash|sh)\n([\s\S]*?)```/.exec(markdown.slice(from));
  expect(m, `bash block after ${heading}`).not.toBeNull();
  return m![1];
}

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'aqe-1470-'));
  bsdBin = join(work, 'bsd-bin');
  mkdirSync(bsdBin);
  writeExec(join(bsdBin, 'grep'), `#!/bin/sh
# Emulates BSD grep's rejection of -P / --perl-regexp; everything else is the real grep.
for a in "$@"; do
  case "$a" in
    --) break ;;
    --perl-regexp) echo "grep: unrecognized option \\\`--perl-regexp'" >&2; exit 2 ;;
    --*) ;;
    -*P*) echo "grep: invalid option -- P" >&2; exit 2 ;;
  esac
done
exec ${realGrep()} "$@"
`);
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe.runIf(process.platform !== 'win32')('#1470 portable skill scripts', () => {
  it('the BSD grep emulation rejects -P and passes other flags through', () => {
    expect(run('grep', ['-qP', 'a'], { input: 'a\n' }).status).toBe(2);
    expect(run('grep', ['-qE', 'a'], { input: 'a\n' }).status).toBe(0);
  });

  // ---------------------------------------------------------------- no-skip
  describe('no-skip detector', () => {
    const fixtures: Array<[string, string, number]> = [
      ['clean', "it('adds numbers', () => { expect(add(1, 2)).toBe(3); });", 0],
      ['skip', "it.skip('adds numbers', () => {});", 1],
      ['only', "describe.only('math', () => {});", 1],
      ['todo', "test.todo('handles overflow');", 1],
      ['xit', "xit('adds numbers', () => {});", 1],
      ['annotation (Java/JUnit)', '@Disabled\nvoid addsNumbers() {}', 1],
      ['annotation (Ignore)', '@Ignore("flaky")\npublic void addsNumbers() {}', 1],
      ['word boundary (exit is not xit)', "process.exit(0); const suffix = 'exit (';", 0],
    ];

    for (const mirror of MIRRORS) {
      const script = join(ROOT, mirror, 'no-skip/scripts/check-skips.sh');

      it.each(fixtures)(`${mirror}: %s via argv and stdin under BSD grep`, (_name, content, expected) => {
        const argv = run('bash', [script, content]);
        expect(argv.status, argv.stdout + argv.stderr).toBe(expected);
        const stdin = run('bash', [script], { input: content });
        expect(stdin.status, stdin.stdout + stdin.stderr).toBe(expected);
        expect(argv.stderr).not.toMatch(/invalid option/);
      });
    }

    it.each(fixtures)('documented guide invocation: %s', (_name, content, expected) => {
      // Install the packaged skill where the guide says it lives, then run each documented command.
      const project = mkdtempSync(join(work, 'noskip-guide-'));
      cpSync(join(ROOT, 'assets/skills/no-skip'), join(project, '.claude/skills/no-skip'), { recursive: true });
      const block = bashBlockAfter(readFileSync(join(ROOT, 'assets/skills/no-skip/SKILL.md'), 'utf8'), '## Enforcement Logic');
      const commands = block.split('\n').filter((l) => /^(bash|printf) /.test(l));
      expect(commands.length).toBeGreaterThanOrEqual(2);
      for (const command of commands) {
        const r = run('bash', ['-c', command], { cwd: project, env: bsdEnv({ CONTENT: content }) });
        expect(r.status, `${command}\n${r.stdout}${r.stderr}`).toBe(expected);
      }
    });

    // Needs the pre-fix commit in git history (absent in shallow clones).
    it.runIf(PRE_FIX_AVAILABLE)('pre-fix guide example never blocks under BSD grep (regression capture)', () => {
      const old = preFix('assets/skills/no-skip/SKILL.md')!;
      const block = bashBlockAfter(old, '## Enforcement Logic');
      expect(block).toMatch(/grep -qP/);
      const skip = run('bash', ['-c', block, '_', "it.skip('x', () => {});"]);
      expect(skip.status).toBe(0); // the defect: a skip is allowed
      expect(skip.stderr).toMatch(/invalid option -- P/);
    });
  });

  // ---------------------------------------------------------- freeze-tests
  describe('freeze-tests hook', () => {
    const cases: Array<[string, number]> = [
      ['src/math.ts', 0],
      ['src/math.test.ts', 1],
      ['src/Button.spec.tsx', 1],
      ['src/__tests__/math.ts', 1],
      ['project/tests/helpers.ts', 1],
    ];
    for (const mirror of MIRRORS) {
      it.each(cases)(`${mirror}: %s -> exit %i under BSD grep`, (file, expected) => {
        const r = run('bash', [join(ROOT, mirror, 'freeze-tests/scripts/block-test-edits.sh'), file]);
        expect(r.status, r.stdout + r.stderr).toBe(expected);
      });
    }
  });

  // --------------------------------------------------------- security-watch
  describe('security-watch scanner', () => {
    const cases: Array<[string, string, number]> = [
      ['clean', 'const total = items.reduce((a, b) => a + b, 0);', 0],
      ['AWS key', 'const key = "AKIAABCDEFGHIJKLMNOP";', 1],
      ['hardcoded password', "const config = { password: 'hunter22' };", 1],
      ['eval', 'eval (userInput);', 1],
      ['innerHTML', 'el.innerHTML = html;', 1],
      ['SQL template', 'db.query(`${table} SELECT * FROM users`);', 1],
      ['word boundary (retrieval is not eval)', 'const retrieval = 1;', 0],
    ];
    for (const mirror of MIRRORS) {
      it.each(cases)(`${mirror}: %s under BSD grep`, (_name, content, expected) => {
        const r = run('bash', [join(ROOT, mirror, 'security-watch/scripts/scan-security.sh'), content]);
        expect(r.status, r.stdout + r.stderr).toBe(expected);
      });
    }
  });

  // ------------------------------------------------- brutal-honesty coverage
  describe('brutal-honesty-review assess-tests.sh coverage parsing', () => {
    const SCRIPT_PATH = 'brutal-honesty-review/scripts/assess-tests.sh';

    /** Temp project with a test dir, optional coverage script and a stub npm. */
    function project(opts: { coverageScript?: boolean; output?: string; exit?: number; noPackageJson?: boolean }): { dir: string; env: NodeJS.ProcessEnv } {
      const dir = mkdtempSync(join(work, 'cov-'));
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
      // Stub npm: `npm run test:coverage` prints the fixture output and exits with the fixture status;
      // `npm test` always passes, so the runner fixture is independent of the coverage parser.
      writeExec(join(bin, 'npm'), `#!/bin/sh
if [ "$1" = "run" ] && [ "$2" = "test:coverage" ]; then
  cat "${join(dir, 'coverage-output.txt')}"
  exit ${opts.exit ?? 0}
fi
exit 0
`);
      return { dir, env: { ...bsdEnv(), PATH: `${bin}:${bsdBin}:${process.env.PATH}` } };
    }

    function coverageSection(stdout: string): string {
      const start = stdout.indexOf('COVERAGE CHECK');
      const end = stdout.indexOf('EDGE CASE CHECK');
      return stdout.slice(start, end === -1 ? undefined : end);
    }

    const POSITIVE = /(MICHELIN STAR|ACCEPTABLE):[^\n]*coverage/;

    for (const mirror of [...MIRRORS, '.kiro/skills/qe-brutal-honesty-review/scripts/assess-tests.sh']) {
      const script = mirror.endsWith('.sh') ? join(ROOT, mirror) : join(ROOT, mirror, SCRIPT_PATH);

      const assess = (p: { dir: string; env: NodeJS.ProcessEnv }) => {
        const r = run('bash', [script, 'tests'], { cwd: p.dir, env: p.env });
        return { ...r, section: coverageSection(r.stdout) };
      };

      it(`${mirror}: parses "All files: 93.50%" as a MICHELIN STAR rating`, () => {
        const r = assess(project({ output: '> vitest run --coverage\nAll files: 93.50%\n' }));
        expect(r.status, r.stdout + r.stderr).toBe(0);
        expect(r.section).toMatch(/MICHELIN STAR: 93\.50% coverage/);
        expect(r.stderr).not.toMatch(/invalid option/);
      });

      it(`${mirror}: parses an istanbul table and a low score as RAW`, () => {
        const table = [
          '----------|---------|----------|---------|---------|',
          'File      | % Stmts | % Branch | % Funcs | % Lines |',
          '----------|---------|----------|---------|---------|',
          'All files |   42.1  |    30    |   50    |   42.1  |',
        ].join('\n');
        const r = assess(project({ output: table }));
        expect(r.section).toMatch(/RAW: 42\.1% coverage/);
        expect(r.section).not.toMatch(POSITIVE);
      });

      it(`${mirror}: parses a text-summary Statements line`, () => {
        const r = assess(project({ output: 'Statements   : 65.5% ( 131/200 )\nBranches     : 50% ( 1/2 )\n' }));
        expect(r.section).toMatch(/ACCEPTABLE: 65\.5% coverage/);
      });

      it.each([
        ['empty output', { output: '' }, /produced no output/],
        ['garbage output', { output: 'compiling... done in 12.5% of the time\nok\n' }, /could not parse a coverage percentage/],
        ['out-of-range value', { output: 'All files: 250%\n' }, /could not parse a coverage percentage/],
        ['failing command', { output: 'All files: 93.50%\nERROR: threshold not met\n', exit: 1 }, /exited with status 1/],
        ['no coverage script', { coverageScript: false }, /no 'test:coverage' script/],
        ['no package.json', { noPackageJson: true }, /no package\.json/],
      ] as const)(`${mirror}: %s reports coverage unavailable without a rating`, (_name, opts, reason) => {
        const r = assess(project(opts));
        expect(r.status, r.stdout + r.stderr).toBe(0);
        expect(r.section).toMatch(/COVERAGE UNAVAILABLE/);
        expect(r.section).toMatch(reason);
        expect(r.section).not.toMatch(POSITIVE);
        expect(r.section).not.toMatch(/RAW:[^\n]*coverage/);
      });
    }

    it.runIf(PRE_FIX_AVAILABLE)('pre-fix helper fails to parse 93.50% under BSD grep (regression capture)', () => {
      const old = preFix(`assets/skills/${SCRIPT_PATH}`)!;
      const oldScript = join(work, 'assess-tests.prefix.sh');
      writeExec(oldScript, old);
      const p = project({ output: 'All files: 93.50%\n' });
      const r = run('bash', [oldScript, 'tests'], { cwd: p.dir, env: p.env });
      expect(r.stderr).toMatch(/invalid option -- P/);
      expect(r.stdout).not.toMatch(/93\.50% coverage/);
      expect(r.stdout).toMatch(/MICHELIN STAR: % coverage/); // the defect: empty value rated as top tier
    });
  });

  // ------------------------------------------------------------------ guard
  describe('guard: no grep -P in shipped skill commands', () => {
    const TREES = ['assets/skills', '.claude/skills', '.kiro/skills', 'plugins/agentic-qe-fleet/skills'];
    const GREP_P = /\bgrep\b(?:[^\n|;&]*?)\s(?:-[A-Za-z]*P[A-Za-z]*\b|--perl-regexp\b)/;

    function walk(dir: string, out: string[] = []): string[] {
      if (!existsSync(dir)) return out;
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else out.push(p);
      }
      return out;
    }

    function offenders(): string[] {
      const found: string[] = [];
      for (const tree of TREES) {
        for (const file of walk(join(ROOT, tree))) {
          const rel = relative(ROOT, file);
          const text = readFileSync(file, 'utf8');
          let commands: string[] = [];
          if (/\.(sh|bash)$/.test(file) || text.startsWith('#!/bin/bash') || text.startsWith('#!/bin/sh') || text.startsWith('#!/usr/bin/env bash')) {
            commands = text.split('\n').filter((l) => !l.trim().startsWith('#'));
          } else if (file.endsWith('.md')) {
            for (const m of text.matchAll(/```(?:bash|sh|shell|zsh|console)\n([\s\S]*?)```/g)) {
              commands.push(...m[1].split('\n').filter((l) => !l.trim().startsWith('#')));
            }
          }
          for (const line of commands) if (GREP_P.test(line)) found.push(`${rel}: ${line.trim()}`);
        }
      }
      return found;
    }

    it('the detector recognises the forms that were shipped before #1470', () => {
      expect(GREP_P.test('if echo "$C" | grep -qP "$pattern"; then')).toBe(true);
      expect(GREP_P.test("npm run x 2>&1 | grep -oP '\\d+'")).toBe(true);
      expect(GREP_P.test('grep --perl-regexp foo')).toBe(true);
      expect(GREP_P.test('grep -Eq -- "$pattern"')).toBe(false);
      expect(GREP_P.test('grep -rn "TODO" src/')).toBe(false);
    });

    it('finds no grep -P in skill scripts or fenced shell blocks', () => {
      expect(offenders()).toEqual([]);
    });
  });
});
