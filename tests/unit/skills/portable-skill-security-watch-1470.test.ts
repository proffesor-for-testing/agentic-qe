/**
 * #1470 — security-watch: CRITICAL findings (secrets, private keys, passwords) block with
 * exit 2 in every mode; WARNING findings (eval / Function / innerHTML / SQL heuristics)
 * never hard-block — hook mode returns a PreToolUse "ask" decision on stdout and exits 0,
 * manual mode prints warnings on stderr and exits 0.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { MIRRORS, ROOT, createBsdHarness, type BsdHarness, type RunResult } from './helpers/bsd-grep-env';
import { ALLOWED, BLOCKED, edit, expectBlocked, multiEdit, runGuideHook, runGuideManual, write } from './helpers/hook-payloads';

let h: BsdHarness;
beforeAll(() => { h = createBsdHarness('aqe-1470-sec-'); });
afterAll(() => h.dispose());

type Kind = 'clean' | 'critical' | 'warning';
const CASES: Array<[string, string, Kind]> = [
  ['clean', 'const total = items.reduce((a, b) => a + b, 0);', 'clean'],
  ['word boundary (retrieval is not eval)', 'const retrieval = 1;', 'clean'],
  ['AWS key', 'const key = "AKIAABCDEFGHIJKLMNOP";', 'critical'],
  ['private key', '-----BEGIN RSA PRIVATE KEY-----', 'critical'],
  ['hardcoded password (double quotes)', 'const config = { password: "hunter22" };', 'critical'],
  ['hardcoded password (single quotes)', "const config = { password: 'hunter22' };", 'critical'],
  ['eval', 'eval (userInput);', 'warning'],
  ['innerHTML', 'el.innerHTML = html;', 'warning'],
  ['SQL template', 'db.query(`${table} SELECT * FROM users`);', 'warning'],
  ['secret plus warning', 'eval(x); const k = "AKIAABCDEFGHIJKLMNOP";', 'critical'],
];
const FILE = '/repo/src/config.ts';

interface AskDecision { hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } }

function askDecision(r: RunResult): AskDecision['hookSpecificOutput'] {
  return (JSON.parse(r.stdout) as AskDecision).hookSpecificOutput;
}

function expectHookOutcome(r: RunResult, kind: Kind, label: string): void {
  if (kind === 'critical') {
    expectBlocked(r, /critical security issue/);
    expect(r.stdout, label).toBe('');
  } else if (kind === 'warning') {
    expect(r.status, `${label}: ${r.stderr}`).toBe(ALLOWED);
    const d = askDecision(r);
    expect(d.hookEventName).toBe('PreToolUse');
    expect(d.permissionDecision).toBe('ask');
    expect(d.permissionDecisionReason).toMatch(/^security-watch: Dangerous pattern|^security-watch: Possible SQL injection/);
  } else {
    expect(r.status, `${label}: ${r.stderr}`).toBe(ALLOWED);
    expect(r.stdout, label).toBe('');
  }
}

function expectManualOutcome(r: RunResult, kind: Kind, label: string): void {
  expect(r.stdout, label).toBe('');
  if (kind === 'critical') expectBlocked(r, /critical security issue/);
  else {
    expect(r.status, `${label}: ${r.stderr}`).toBe(ALLOWED);
    if (kind === 'warning') expect(r.stderr, label).toMatch(/^WARNING: /m);
    else expect(r.stderr, label).toBe('');
  }
}

describe.runIf(process.platform !== 'win32')('#1470 security-watch severities', () => {
  for (const mirror of MIRRORS) {
    const script = join(ROOT, mirror, 'security-watch/scripts/scan-security.sh');
    it.each(CASES)(`${mirror}: %s`, (_n, content, kind) => {
      expectManualOutcome(h.run('bash', [script, content]), kind, 'argv');
      expectManualOutcome(h.run('bash', [script], { input: content }), kind, 'stdin');
      expectHookOutcome(h.run('bash', [script], { input: write(FILE, content) }), kind, 'write');
      expectHookOutcome(h.run('bash', [script], { input: edit(FILE, content) }), kind, 'edit');
      expectHookOutcome(h.run('bash', [script], { input: multiEdit(FILE, 'const a = 1;', content) }), kind, 'multiEdit');
    });
  }

  const SCRIPT = join(ROOT, 'assets/skills/security-watch/scripts/scan-security.sh');

  it.each([
    ['eval(input)', 'x = eval(input);', 'warning', /eval\(\) call/],
    ['el.innerHTML = ""', 'el.innerHTML = "";', 'warning', /innerHTML assignment/],
    ['a secret', 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'critical', /Potential secret/],
  ] as Array<[string, string, Kind, RegExp]>)('README.md containing %s', (_n, content, kind, reason) => {
    const r = h.run('bash', [SCRIPT], { input: write('/repo/README.md', content) });
    expectHookOutcome(r, kind, 'README');
    if (kind === 'warning') expect(askDecision(r).permissionDecisionReason).toMatch(reason);
    else expect(r.stderr).toMatch(reason);
  });

  it('JSON-escaped quotes around a password are decoded before scanning', () => {
    const payload = edit(FILE, 'const c = { password: "hunter2" };');
    expect(payload).toContain('\\"hunter2\\"');
    expectBlocked(h.run('bash', [SCRIPT], { input: payload }), /hardcoded password/);
  });

  it.each(CASES)('guide settings.json hook command, MultiEdit payload: %s', (_n, content, kind) => {
    expectHookOutcome(runGuideHook(h, 'security-watch', multiEdit(FILE, content)), kind, 'guide hook');
  });

  it.each(CASES)('guide manual commands: %s', (_n, content, kind) => {
    for (const r of runGuideManual(h, 'security-watch', '## Detection Patterns', { CONTENT: content })) {
      expectManualOutcome(r, kind, 'guide manual');
    }
  });

  it('exit code contract: critical = 2, warning-only = 0', () => {
    expect(h.run('bash', [SCRIPT, 'const k = "AKIAABCDEFGHIJKLMNOP";']).status).toBe(BLOCKED);
    expect(h.run('bash', [SCRIPT, 'eval(x)']).status).toBe(ALLOWED);
  });
});
