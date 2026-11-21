/**
 * #1470 — the no-skip, freeze-tests and security-watch hooks must work with BSD grep
 * and with the real Claude Code PreToolUse protocol (JSON on stdin, exit 2 + stderr
 * to block), and their guides' documented commands must behave as documented.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIRRORS, ROOT, createBsdHarness, fencedBlockAfter, realBinary, type BsdHarness,
} from './helpers/bsd-grep-env';

let h: BsdHarness;
beforeAll(() => { h = createBsdHarness('aqe-1470-hooks-'); });
afterAll(() => h.dispose());

const BLOCKED = 2;
const ALLOWED = 0;

const write = (filePath: string, content: string): string =>
  JSON.stringify({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: filePath, content } });
const edit = (filePath: string, newString: string): string =>
  JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath, old_string: 'placeholder', new_string: newString } });
const multiEdit = (filePath: string, ...newStrings: string[]): string =>
  JSON.stringify({
    tool_name: 'MultiEdit',
    tool_input: { file_path: filePath, edits: newStrings.map((s) => ({ old_string: 'placeholder', new_string: s })) },
  });

/** Stage the packaged skill into a fresh project, as an install would. */
function stagedProject(skill: string): string {
  const dir = mkdtempSync(join(h.work, `${skill}-`));
  cpSync(join(ROOT, 'assets/skills', skill), join(dir, '.claude/skills', skill), { recursive: true });
  return dir;
}

/** The `command` from the guide's settings.json example. */
function guideHookCommand(skill: string): string {
  const config = JSON.parse(fencedBlockAfter(`assets/skills/${skill}/SKILL.md`, '## Hook Configuration', 'json'));
  const group = config.hooks.PreToolUse[0];
  expect(group.matcher).toBe('Write|Edit|MultiEdit');
  expect(group.hooks[0].type).toBe('command');
  return group.hooks[0].command as string;
}

function guideManualCommands(skill: string, heading: string): string[] {
  const cmds = fencedBlockAfter(`assets/skills/${skill}/SKILL.md`, heading, 'bash')
    .split('\n').filter((l) => /^(bash|printf) /.test(l));
  expect(cmds.length, `${skill} manual commands`).toBeGreaterThanOrEqual(2);
  return cmds;
}

/** Run the guide's hook command from a staged project with a hook payload on stdin. */
function runGuideHook(skill: string, payload: string) {
  const project = stagedProject(skill);
  return h.run('bash', ['-c', guideHookCommand(skill)], { cwd: project, input: payload, env: h.env({ CLAUDE_PROJECT_DIR: project }) });
}

function expectBlocked(r: { status: number | null; stdout: string; stderr: string }, reason: RegExp): void {
  expect(r.status, r.stdout + r.stderr).toBe(BLOCKED);
  expect(r.stderr).toMatch(reason);
  expect(r.stderr).not.toMatch(/invalid option/);
}

describe.runIf(process.platform !== 'win32')('#1470 skill hooks', () => {
  it('the BSD grep emulation rejects -P and passes other flags through', () => {
    expect(h.run('grep', ['-qP', 'a'], { input: 'a\n' }).status).toBe(2);
    expect(h.run('grep', ['-qE', 'a'], { input: 'a\n' }).status).toBe(0);
  });

  // ---------------------------------------------------------------- no-skip
  describe('no-skip', () => {
    const TEST_FILE = '/repo/src/math.test.ts';
    const fixtures: Array<[string, string, number]> = [
      ['clean', "it('adds numbers', () => {\n  expect(add(1, 2)).toBe(3);\n});", ALLOWED],
      ['skip', "it.skip('adds numbers', () => {});", BLOCKED],
      ['only', "describe.only('math', () => {});", BLOCKED],
      ['todo', "test.todo('handles overflow');", BLOCKED],
      ['xit on its own line', "describe('math', () => {\nxit('adds', () => {});\n});", BLOCKED],
      ['annotation (JUnit @Disabled)', '@Disabled\nvoid addsNumbers() {}', BLOCKED],
      ['annotation (@Ignore)', '@Ignore("flaky")\npublic void addsNumbers() {}', BLOCKED],
      ['word boundary (exit is not xit)', "process.exit(0); const suffix = 'exit (';", ALLOWED],
    ];

    for (const mirror of MIRRORS) {
      const script = join(ROOT, mirror, 'no-skip/scripts/check-skips.sh');
      it.each(fixtures)(`${mirror}: %s via argv, raw stdin and Write/Edit/MultiEdit payloads`, (_n, content, expected) => {
        const modes = {
          argv: h.run('bash', [script, content]),
          stdin: h.run('bash', [script], { input: content }),
          write: h.run('bash', [script], { input: write(TEST_FILE, content) }),
          edit: h.run('bash', [script], { input: edit(TEST_FILE, content) }),
          multiEdit: h.run('bash', [script], { input: multiEdit(TEST_FILE, 'const a = 1;', content) }),
        };
        for (const [mode, r] of Object.entries(modes)) {
          expect(r.status, `${mode}: ${r.stdout}${r.stderr}`).toBe(expected);
          if (expected === BLOCKED) expect(r.stderr, mode).toMatch(/BLOCKED: Found skip pattern/);
        }
      });
    }

    it('JSON-escaped newline before xit( is decoded, not scanned as "\\nxit("', () => {
      const payload = write(TEST_FILE, "describe('a', () => {\nxit('b', () => {});\n});");
      expect(payload).toContain('\\nxit(');
      expectBlocked(h.run('bash', [join(ROOT, 'assets/skills/no-skip/scripts/check-skips.sh')], { input: payload }), /xit/);
    });

    it.each([
      ['/repo/README.md', ALLOWED],
      ['/repo/src/math.ts', ALLOWED],
      ['/repo/src/__tests__/math.ts', BLOCKED],
      ['/repo/tests/unit/math.ts', BLOCKED],
      ['/repo/src/test/java/MathTest.java', BLOCKED],
      ['/repo/pkg/math_test.go', BLOCKED],
      ['/repo/test_math.py', BLOCKED],
    ])('hook mode only checks test files: %s', (file, expected) => {
      const r = h.run('bash', [join(ROOT, 'assets/skills/no-skip/scripts/check-skips.sh')], { input: write(file, "it.skip('x', () => {});") });
      expect(r.status, r.stderr).toBe(expected);
    });

    it('raw stdin that starts with "{" but is not a payload is still scanned', () => {
      const r = h.run('bash', [join(ROOT, 'assets/skills/no-skip/scripts/check-skips.sh')], { input: "{ it.only('x', () => {}) }" });
      expectBlocked(r, /only/);
    });

    it('a payload blocks (fails closed) when node is unavailable', () => {
      const minimal = join(h.work, 'no-node-bin');
      mkdirSync(minimal, { recursive: true });
      for (const tool of ['cat', 'head']) symlinkSync(realBinary(tool), join(minimal, tool));
      symlinkSync(join(h.bsdBin, 'grep'), join(minimal, 'grep'));
      const r = h.run(realBinary('bash'), [join(ROOT, 'assets/skills/no-skip/scripts/check-skips.sh')], {
        input: write(TEST_FILE, "it('ok', () => {});"), env: { PATH: minimal },
      });
      expectBlocked(r, /node was not found/);
    });

    it.each(fixtures)('guide settings.json hook command, Write payload: %s', (_n, content, expected) => {
      expect(runGuideHook('no-skip', write(TEST_FILE, content)).status).toBe(expected);
    });

    it.each(fixtures)('guide manual commands: %s', (_n, content, expected) => {
      const project = stagedProject('no-skip');
      for (const command of guideManualCommands('no-skip', '## Enforcement Logic')) {
        const r = h.run('bash', ['-c', command], { cwd: project, env: h.env({ CONTENT: content }) });
        expect(r.status, `${command}\n${r.stdout}${r.stderr}`).toBe(expected);
      }
    });

    it('pre-fix guide example (inline fixture) never blocks under BSD grep', () => {
      // Verbatim logic of the no-skip guide's "Enforcement Logic" block at 10718e16.
      const OLD_GUIDE_BLOCK = `CONTENT="$1"
SKIP_PATTERNS=('\\.skip\\s*\\(' '\\.only\\s*\\(' '\\bxit\\s*\\(' '\\bxdescribe\\s*\\(' '\\bxcontext\\s*\\(' 'test\\.todo\\s*\\(' '@Skip' '@Disabled' '@Ignore')
for pattern in "\${SKIP_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qP "$pattern"; then
    echo "BLOCKED: Found skip pattern '$pattern'"
    exit 1
  fi
done`;
      const r = h.run('bash', ['-c', OLD_GUIDE_BLOCK, '_', "it.skip('x', () => {});"]);
      expect(r.status).toBe(0); // the defect: a skip is allowed
      expect(r.stderr).toMatch(/invalid option -- P/);
    });
  });

  // ---------------------------------------------------------- freeze-tests
  describe('freeze-tests', () => {
    const cases: Array<[string, number]> = [
      ['/repo/src/math.ts', ALLOWED],
      ['/repo/src/math.test.ts', BLOCKED],
      ['/repo/src/Button.spec.tsx', BLOCKED],
      ['/repo/src/__tests__/math.ts', BLOCKED],
      ['/repo/tests/helpers.ts', BLOCKED],
    ];
    for (const mirror of MIRRORS) {
      const script = join(ROOT, mirror, 'freeze-tests/scripts/block-test-edits.sh');
      it.each(cases)(`${mirror}: %s via argv, raw stdin and Write/Edit/MultiEdit payloads`, (file, expected) => {
        const modes = {
          argv: h.run('bash', [script, file]),
          stdin: h.run('bash', [script], { input: file }),
          write: h.run('bash', [script], { input: write(file, 'x') }),
          edit: h.run('bash', [script], { input: edit(file, 'x') }),
          multiEdit: h.run('bash', [script], { input: multiEdit(file, 'x', 'y') }),
        };
        for (const [mode, r] of Object.entries(modes)) {
          expect(r.status, `${mode}: ${r.stdout}${r.stderr}`).toBe(expected);
          if (expected === BLOCKED) expect(r.stderr, mode).toMatch(/BLOCKED: Test (files|directories) are frozen/);
        }
      });
    }

    it.each(cases)('guide settings.json hook command, Edit payload: %s', (file, expected) => {
      expect(runGuideHook('freeze-tests', edit(file, 'x')).status).toBe(expected);
    });

    it.each(cases)('guide manual commands: %s', (file, expected) => {
      const project = stagedProject('freeze-tests');
      for (const command of guideManualCommands('freeze-tests', '## Enforcement Logic')) {
        const r = h.run('bash', ['-c', command], { cwd: project, env: h.env({ FILE: file }) });
        expect(r.status, `${command}\n${r.stdout}${r.stderr}`).toBe(expected);
      }
    });
  });

  // --------------------------------------------------------- security-watch
  describe('security-watch', () => {
    const cases: Array<[string, string, number]> = [
      ['clean', 'const total = items.reduce((a, b) => a + b, 0);', ALLOWED],
      ['AWS key', 'const key = "AKIAABCDEFGHIJKLMNOP";', BLOCKED],
      ['hardcoded password (double quotes)', 'const config = { password: "hunter22" };', BLOCKED],
      ['hardcoded password (single quotes)', "const config = { password: 'hunter22' };", BLOCKED],
      ['eval', 'eval (userInput);', BLOCKED],
      ['innerHTML', 'el.innerHTML = html;', BLOCKED],
      ['SQL template', 'db.query(`${table} SELECT * FROM users`);', BLOCKED],
      ['word boundary (retrieval is not eval)', 'const retrieval = 1;', ALLOWED],
    ];
    const FILE = '/repo/src/config.ts';
    for (const mirror of MIRRORS) {
      const script = join(ROOT, mirror, 'security-watch/scripts/scan-security.sh');
      it.each(cases)(`${mirror}: %s via argv, raw stdin and Write/Edit/MultiEdit payloads`, (_n, content, expected) => {
        const modes = {
          argv: h.run('bash', [script, content]),
          stdin: h.run('bash', [script], { input: content }),
          write: h.run('bash', [script], { input: write(FILE, content) }),
          edit: h.run('bash', [script], { input: edit(FILE, content) }),
          multiEdit: h.run('bash', [script], { input: multiEdit(FILE, 'const a = 1;', content) }),
        };
        for (const [mode, r] of Object.entries(modes)) {
          expect(r.status, `${mode}: ${r.stdout}${r.stderr}`).toBe(expected);
          if (expected === BLOCKED) expect(r.stderr, mode).toMatch(/security issue/);
        }
      });
    }

    it('JSON-escaped quotes around a password are decoded before scanning', () => {
      const payload = edit(FILE, 'const c = { password: "hunter2" };');
      expect(payload).toContain('\\"hunter2\\"');
      expectBlocked(h.run('bash', [join(ROOT, 'assets/skills/security-watch/scripts/scan-security.sh')], { input: payload }), /hardcoded password/);
    });

    it.each(cases)('guide settings.json hook command, MultiEdit payload: %s', (_n, content, expected) => {
      expect(runGuideHook('security-watch', multiEdit(FILE, content)).status).toBe(expected);
    });

    it.each(cases)('guide manual commands: %s', (_n, content, expected) => {
      const project = stagedProject('security-watch');
      for (const command of guideManualCommands('security-watch', '## Detection Patterns')) {
        const r = h.run('bash', ['-c', command], { cwd: project, env: h.env({ CONTENT: content }) });
        expect(r.status, `${command}\n${r.stdout}${r.stderr}`).toBe(expected);
      }
    });
  });
});
