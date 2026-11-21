/**
 * #1470 — the no-skip and freeze-tests hooks must work with BSD grep and with the real
 * Claude Code PreToolUse protocol (JSON on stdin, exit 2 + stderr to block), share one
 * test-file definition, fail closed on undecodable payloads, and behave as their guides
 * document.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { MIRRORS, ROOT, createBsdHarness, realBinary, type BsdHarness } from './helpers/bsd-grep-env';
import {
  ALLOWED, BLOCKED, BOM, MALFORMED_PAYLOADS, edit, expectBlocked, multiEdit, runGuideHook, runGuideManual, write,
} from './helpers/hook-payloads';

let h: BsdHarness;
beforeAll(() => { h = createBsdHarness('aqe-1470-hooks-'); });
afterAll(() => h.dispose());

const NO_SKIP = 'assets/skills/no-skip/scripts/check-skips.sh';
const FREEZE = 'assets/skills/freeze-tests/scripts/block-test-edits.sh';

/** Paths both hooks must treat as tests (round-2 review list plus the originals). */
const TEST_PATHS = [
  '/r/spec/fooSpec.js', '/r/src/a_spec.js', '/r/spec/models/user_spec.rb', '/r/cypress/e2e/login.cy.ts',
  '/r/src/app.e2e-spec.ts', '/r/e2e/login.ts', '/r/src/a.Test.ts', '/r/src/FooTests.swift', '/r/src/aTest.php',
  'C:\\r\\__tests__\\a.ts', '/r/src/test/java/FooTest.java', '/r/src/a.test.mjs', '/r/src/math.test.ts',
  '/r/src/Button.spec.tsx', '/r/src/__tests__/math.ts', '/r/tests/helpers.ts', '/r/src/FooIT.java',
  '/r/pkg/math_test.go', '/r/test_math.py',
];
const NON_TEST_PATHS = ['/r/README.md', '/r/src/math.ts', '/r/docs/AUDIT.md', '/r/src/latest.ts', 'C:\\r\\src\\app.ts'];

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
      expectBlocked(h.run('bash', [join(ROOT, NO_SKIP)], { input: payload }), /xit/);
    });

    it.each(TEST_PATHS)('hook mode checks test file %s', (file) => {
      expectBlocked(h.run('bash', [join(ROOT, NO_SKIP)], { input: write(file, "it.skip('x', () => {});") }), /skip/);
    });

    it.each(NON_TEST_PATHS)('hook mode allows non-test file %s', (file) => {
      expect(h.run('bash', [join(ROOT, NO_SKIP)], { input: write(file, "it.skip('x', () => {});") }).status).toBe(ALLOWED);
    });

    it.each(fixtures)('guide settings.json hook command, Write payload: %s', (_n, content, expected) => {
      expect(runGuideHook(h, 'no-skip', write(TEST_FILE, content)).status).toBe(expected);
    });

    it.each(fixtures)('guide manual commands: %s', (_n, content, expected) => {
      for (const r of runGuideManual(h, 'no-skip', '## Enforcement Logic', { CONTENT: content })) {
        expect(r.status, r.stdout + r.stderr).toBe(expected);
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
    for (const mirror of MIRRORS) {
      const script = join(ROOT, mirror, 'freeze-tests/scripts/block-test-edits.sh');
      it.each([...TEST_PATHS.map((p) => [p, BLOCKED]), ...NON_TEST_PATHS.map((p) => [p, ALLOWED])] as Array<[string, number]>)(
        `${mirror}: %s via argv, raw stdin and Write/Edit/MultiEdit payloads`,
        (file, expected) => {
          const modes = {
            argv: h.run('bash', [script, file]),
            stdin: h.run('bash', [script], { input: file }),
            write: h.run('bash', [script], { input: write(file, 'x') }),
            edit: h.run('bash', [script], { input: edit(file, 'x') }),
            multiEdit: h.run('bash', [script], { input: multiEdit(file, 'x', 'y') }),
          };
          for (const [mode, r] of Object.entries(modes)) {
            expect(r.status, `${mode}: ${r.stdout}${r.stderr}`).toBe(expected);
            if (expected === BLOCKED) expect(r.stderr, mode).toMatch(/BLOCKED: Test files are frozen/);
          }
        },
      );
    }

    it.each([['/r/src/a.test.ts', BLOCKED], ['/r/src/a.ts', ALLOWED]] as Array<[string, number]>)(
      'guide settings.json hook command, Edit payload: %s', (file, expected) => {
        expect(runGuideHook(h, 'freeze-tests', edit(file, 'x')).status).toBe(expected);
      },
    );

    it.each([['/r/src/a.test.ts', BLOCKED], ['/r/src/a.ts', ALLOWED]] as Array<[string, number]>)(
      'guide manual commands: %s', (file, expected) => {
        for (const r of runGuideManual(h, 'freeze-tests', '## Enforcement Logic', { FILE: file })) {
          expect(r.status, r.stdout + r.stderr).toBe(expected);
        }
      },
    );
  });

  // ------------------------------------------- shared protocol / fail-closed
  describe.each([
    ['no-skip', NO_SKIP, write('/r/a.test.ts', "it.skip('x', () => {});"), BLOCKED],
    ['freeze-tests', FREEZE, write('/r/a.ts', 'x'), ALLOWED],
    ['security-watch', 'assets/skills/security-watch/scripts/scan-security.sh', write('/r/a.ts', 'const k = "AKIAABCDEFGHIJKLMNOP";'), BLOCKED],
  ] as Array<[string, string, string, number]>)('%s hook input handling', (_skill, script, bomPayloadBody, bomExpected) => {
    it.each(MALFORMED_PAYLOADS)('blocks a malformed payload: %s', (_n, payload) => {
      expectBlocked(h.run('bash', [join(ROOT, script)], { input: payload }), /cannot decode the hook payload/);
    });

    it('decodes a payload that starts with a UTF-8 BOM', () => {
      const r = h.run('bash', [join(ROOT, script)], { input: BOM + bomPayloadBody });
      expect(r.status, r.stdout + r.stderr).toBe(bomExpected);
      expect(r.stderr).not.toMatch(/cannot decode/);
    });

    it('blocks a payload when node is unavailable', () => {
      const minimal = mkdtempSync(join(h.work, 'no-node-'));
      for (const tool of ['cat', 'head', 'tr', 'dirname']) symlinkSync(realBinary(tool), join(minimal, tool));
      symlinkSync(join(h.bsdBin, 'grep'), join(minimal, 'grep'));
      const r = h.run(realBinary('bash'), [join(ROOT, script)], { input: write('/r/a.test.ts', 'x'), env: { PATH: minimal } });
      expectBlocked(r, /node was not found/);
    });

    it('blocks when a sourced helper is missing', () => {
      const dir = mkdtempSync(join(h.work, 'no-helper-'));
      mkdirSync(join(dir, 'scripts'));
      const copy = join(dir, 'scripts', script.split('/').pop()!);
      copyFileSync(join(ROOT, script), copy);
      expectBlocked(h.run('bash', [copy], { input: write('/r/a.ts', 'x') }), /cannot load .*hook-input\.sh/);
    });
  });
});
