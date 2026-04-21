/**
 * CommandEvalRunner — unit tests.
 *
 * Covers:
 *   - Pure helpers (evalJsonPath, severityAtLeast, isCommandEvalSuite)
 *   - validateCommandResult assertion rules per field
 *   - Runner behavior with an injected runner (setup, timeouts, critical gate)
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

import {
  CommandEvalRunner,
  evalJsonPath,
  severityAtLeast,
  isCommandEvalSuite,
  validateCommandResult,
  type CommandEvalTestCase,
  type CommandRunner,
} from '../../../src/validation/command-eval-runner.js';

describe('evalJsonPath', () => {
  it('reads a top-level field', () => {
    expect(evalJsonPath({ status: 'ok' }, '.status')).toBe('ok');
  });

  it('reads a nested field', () => {
    expect(evalJsonPath({ output: { assert: { passed: 3 } } }, '.output.assert.passed')).toBe(3);
  });

  it('returns undefined for a missing segment', () => {
    expect(evalJsonPath({ output: {} }, '.output.assert.passed')).toBeUndefined();
  });

  it('returns undefined when the value is not an object partway through', () => {
    expect(evalJsonPath({ a: 1 }, '.a.b')).toBeUndefined();
  });

  it('rejects paths that do not start with a dot', () => {
    expect(evalJsonPath({ a: 1 }, 'a')).toBeUndefined();
  });

  it('handles null values without crashing', () => {
    expect(evalJsonPath(null, '.anything')).toBeUndefined();
  });
});

describe('severityAtLeast', () => {
  it('treats equal severities as passing', () => {
    expect(severityAtLeast('medium', 'medium')).toBe(true);
  });

  it('passes when actual is above threshold', () => {
    expect(severityAtLeast('high', 'medium')).toBe(true);
    expect(severityAtLeast('critical', 'low')).toBe(true);
  });

  it('fails when actual is below threshold', () => {
    expect(severityAtLeast('low', 'high')).toBe(false);
    expect(severityAtLeast('none', 'medium')).toBe(false);
  });

  it('fails conservatively on unknown severity strings', () => {
    // Devil's-advocate: a check-injection script that reports "info" severity
    // must not silently pass a "severity_at_least: medium" threshold.
    expect(severityAtLeast('info', 'medium')).toBe(false);
    expect(severityAtLeast(undefined, 'low')).toBe(false);
    expect(severityAtLeast(42, 'low')).toBe(false);
  });
});

describe('isCommandEvalSuite', () => {
  it('matches a suite whose first test case has input.command', () => {
    expect(
      isCommandEvalSuite({
        test_cases: [{ input: { command: 'node foo.js' } }],
      })
    ).toBe(true);
  });

  it('rejects a suite whose first test case has only input.code (LLM mode)', () => {
    expect(
      isCommandEvalSuite({
        test_cases: [{ input: { code: '<html></html>', context: {} } }],
      })
    ).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isCommandEvalSuite(null)).toBe(false);
    expect(isCommandEvalSuite('yaml-as-string')).toBe(false);
    expect(isCommandEvalSuite([])).toBe(false);
  });

  it('rejects a suite with no test_cases array', () => {
    expect(isCommandEvalSuite({ test_cases: null })).toBe(false);
    expect(isCommandEvalSuite({})).toBe(false);
  });

  it('rejects a suite with an empty test_cases array', () => {
    expect(isCommandEvalSuite({ test_cases: [] })).toBe(false);
  });
});

describe('validateCommandResult', () => {
  function tc(partial: Partial<CommandEvalTestCase>): CommandEvalTestCase {
    return {
      id: 'tc',
      input: { command: 'echo hi' },
      expected: {},
      ...partial,
    };
  }

  it('passes when exit_code matches and no other assertions', () => {
    const r = validateCommandResult(tc({ expected: { exit_code: 0 } }), 0, '');
    expect(r).toEqual({ passed: true, failures: [] });
  });

  it('fails with a clear message when exit_code mismatches', () => {
    const r = validateCommandResult(tc({ expected: { exit_code: 0 } }), 1, '');
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toMatch(/exit_code: expected 0, got 1/);
  });

  it('fails fast when stdout is required as JSON but is not parseable', () => {
    const r = validateCommandResult(
      tc({ expected: { json_fields: { '.status': 'ok' } } }),
      0,
      'not-json'
    );
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toMatch(/not valid JSON/);
  });

  it('does not parse JSON when only exit_code is asserted', () => {
    // Commands that produce non-JSON output (e.g. plain text) should pass if
    // only their exit code is asserted.
    const r = validateCommandResult(tc({ expected: { exit_code: 0 } }), 0, 'hello world');
    expect(r.passed).toBe(true);
  });

  it('validates multiple json_fields independently, reporting each failure', () => {
    const r = validateCommandResult(
      tc({
        expected: {
          exit_code: 0,
          json_fields: {
            '.status': 'success',
            '.output.count': 5,
          },
        },
      }),
      0,
      JSON.stringify({ status: 'failed', output: { count: 3 } })
    );
    expect(r.passed).toBe(false);
    expect(r.failures).toHaveLength(2);
    expect(r.failures[0]).toMatch(/\.status: expected "success", got "failed"/);
    expect(r.failures[1]).toMatch(/\.output\.count: expected 5, got 3/);
  });

  it('deep-equals nested json_fields values', () => {
    const r = validateCommandResult(
      tc({
        expected: {
          json_fields: { '.output.nested': { a: 1, b: [2, 3] } },
        },
      }),
      0,
      JSON.stringify({ output: { nested: { b: [2, 3], a: 1 } } })
    );
    expect(r.passed).toBe(true);
  });

  it('passes severity_at_least when severity equals the threshold', () => {
    const r = validateCommandResult(
      tc({ expected: { severity_at_least: 'high' } }),
      1,
      JSON.stringify({ output: { checkInjection: { severity: 'high' } } })
    );
    expect(r.passed).toBe(true);
  });

  it('fails severity_at_least when severity is below', () => {
    const r = validateCommandResult(
      tc({ expected: { severity_at_least: 'high' } }),
      1,
      JSON.stringify({ output: { checkInjection: { severity: 'low' } } })
    );
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toMatch(/severity_at_least: expected >= high, got "low"/);
  });

  it('passes candidate_count_at_least when count exceeds threshold', () => {
    const r = validateCommandResult(
      tc({ expected: { candidate_count_at_least: 1 } }),
      0,
      JSON.stringify({ output: { intentScore: { candidateCount: 3 } } })
    );
    expect(r.passed).toBe(true);
  });

  it('fails candidate_count_at_least when count is zero and threshold is 1', () => {
    const r = validateCommandResult(
      tc({ expected: { candidate_count_at_least: 1 } }),
      0,
      JSON.stringify({ output: { intentScore: { candidateCount: 0 } } })
    );
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toMatch(/candidate_count_at_least: expected >= 1, got 0/);
  });
});

// ----------------------------------------------------------------------------
// End-to-end runner tests with an injected CommandRunner + temp suite file
// ----------------------------------------------------------------------------

function withTempSkillsDir(fn: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-cmdeval-'));
  try {
    const out = fn(dir);
    if (out instanceof Promise) return out.finally(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.rmSync(dir, { recursive: true, force: true });
    return Promise.resolve();
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

function writeSuite(skillsDir: string, skill: string, yaml: string): void {
  const dir = path.join(skillsDir, skill, 'evals');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${skill}.yaml`), yaml, 'utf-8');
}

function makeRunner(responses: Map<string, { status: number; stdout?: string; stderr?: string }>): CommandRunner {
  return (cmd) => {
    const r = responses.get(cmd);
    if (!r) throw new Error(`unexpected command: ${cmd}`);
    return {
      status: r.status,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    };
  };
}

describe('CommandEvalRunner.run', () => {
  it('reports all passed when every case passes', async () => {
    await withTempSkillsDir(async (dir) => {
      writeSuite(
        dir,
        'demo',
        [
          'skill: demo',
          'status: active',
          'test_cases:',
          '  - id: tc001',
          '    priority: critical',
          '    input:',
          '      command: run-a',
          '    expected:',
          '      exit_code: 0',
          '  - id: tc002',
          '    priority: high',
          '    input:',
          '      command: run-b',
          '    expected:',
          '      exit_code: 0',
          '      json_fields:',
          '        ".status": "success"',
          '',
        ].join('\n')
      );

      const runner = makeRunner(
        new Map([
          ['run-a', { status: 0, stdout: '' }],
          ['run-b', { status: 0, stdout: JSON.stringify({ status: 'success' }) }],
        ])
      );

      const cer = new CommandEvalRunner({ skillsDir: dir, runner });
      const result = await cer.run('demo');

      expect(result.passed).toBe(true);
      expect(result.totalTests).toBe(2);
      expect(result.passedTests).toBe(2);
      expect(result.criticalPassed).toBe(true);
      expect(result.passRate).toBe(1);
    });
  });

  it('fails overall when a critical test fails even if pass rate is above threshold', async () => {
    // Devil's-advocate: with 10 tests, 1 critical failure still yields 90%
    // pass rate. Default required_pass_rate is 0.9 so that part would pass.
    // But critical_must_pass defaults to true, so the suite must fail.
    await withTempSkillsDir(async (dir) => {
      const cases = [];
      const responses = new Map<string, { status: number; stdout?: string }>();
      for (let i = 0; i < 9; i++) {
        cases.push(`  - id: tc${i}\n    priority: high\n    input:\n      command: pass-${i}\n    expected:\n      exit_code: 0`);
        responses.set(`pass-${i}`, { status: 0 });
      }
      cases.push(`  - id: tc_crit\n    priority: critical\n    input:\n      command: fail-crit\n    expected:\n      exit_code: 0`);
      responses.set('fail-crit', { status: 1, stderr: 'boom' });

      writeSuite(
        dir,
        'crit',
        ['skill: crit', 'status: active', 'test_cases:', ...cases, ''].join('\n')
      );

      const cer = new CommandEvalRunner({ skillsDir: dir, runner: makeRunner(responses) });
      const result = await cer.run('crit');

      expect(result.passRate).toBe(0.9);
      expect(result.criticalPassed).toBe(false);
      expect(result.passed).toBe(false);
    });
  });

  it('runs setup steps before the main command and short-circuits on setup failure', async () => {
    await withTempSkillsDir(async (dir) => {
      writeSuite(
        dir,
        'setup-demo',
        [
          'skill: setup-demo',
          'status: active',
          'test_cases:',
          '  - id: tc_setup_fails',
          '    priority: high',
          '    input:',
          '      setup:',
          '        - "setup-ok"',
          '        - "setup-bad"',
          '      command: should-not-run',
          '    expected:',
          '      exit_code: 0',
          '',
        ].join('\n')
      );

      const calls: string[] = [];
      const runner: CommandRunner = (cmd) => {
        calls.push(cmd);
        if (cmd === 'setup-ok') return { status: 0, stdout: '', stderr: '' };
        if (cmd === 'setup-bad') return { status: 2, stdout: '', stderr: 'nope' };
        return { status: 0, stdout: '', stderr: '' };
      };

      const cer = new CommandEvalRunner({ skillsDir: dir, runner });
      const result = await cer.run('setup-demo');

      expect(result.testResults[0].passed).toBe(false);
      expect(result.testResults[0].setupFailure).toMatch(/setup step failed.*setup-bad/);
      // Main command must NOT have been invoked after setup failed.
      expect(calls).toEqual(['setup-ok', 'setup-bad']);
    });
  });

  it('throws when the eval yaml is not command-mode (LLM suite)', async () => {
    await withTempSkillsDir(async (dir) => {
      writeSuite(
        dir,
        'llm-skill',
        [
          'skill: llm-skill',
          'test_cases:',
          '  - id: tc1',
          '    input:',
          '      code: "<html></html>"',
          '      context: {}',
          '    expected_output:',
          '      must_contain: ["ok"]',
          '',
        ].join('\n')
      );

      const runner = makeRunner(new Map());
      const cer = new CommandEvalRunner({ skillsDir: dir, runner });
      await expect(cer.run('llm-skill')).rejects.toThrow(/not command-mode/);
    });
  });
});
