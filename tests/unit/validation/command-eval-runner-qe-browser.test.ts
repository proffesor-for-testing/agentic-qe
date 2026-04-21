/**
 * Integration test: CommandEvalRunner against the real qe-browser.yaml.
 *
 * Purpose: catch regressions where a yaml edit (new test case, new assertion
 * kind, typo in a JSONPath) would silently break `aqe eval run --skill
 * qe-browser`. We load the actual file shipped in .claude/skills/qe-browser/
 * and feed the runner mock stdouts that match each primitive's happy-path
 * JSON envelope.
 *
 * This test does NOT invoke Vibium or the fixture server — it verifies the
 * suite is shaped correctly and that passing outputs pass.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as yaml from 'yaml';

import {
  CommandEvalRunner,
  isCommandEvalSuite,
  type CommandRunner,
} from '../../../src/validation/command-eval-runner.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILLS_DIR = path.join(REPO_ROOT, '.claude', 'skills');
const YAML_PATH = path.join(SKILLS_DIR, 'qe-browser', 'evals', 'qe-browser.yaml');

describe('CommandEvalRunner — qe-browser integration', () => {
  it('the shipped yaml is a valid command-mode suite', () => {
    const raw = yaml.parse(fs.readFileSync(YAML_PATH, 'utf-8'));
    expect(isCommandEvalSuite(raw)).toBe(true);
    expect(raw.skill).toBe('qe-browser');
    expect(raw.status).toBe('active');
    expect(Array.isArray(raw.test_cases)).toBe(true);
    expect(raw.test_cases.length).toBeGreaterThanOrEqual(11);
  });

  it('passes when every primitive returns its happy-path JSON envelope', async () => {
    // visual-diff is called twice in the yaml (tc006 creates baseline after
    // `rm -rf`, tc007 matches existing baseline). We track call order so the
    // mock returns baseline_created first, then match.
    let visualDiffCalls = 0;
    // Track the last navigated URL so downstream checks (e.g. check-injection)
    // can behave as if they're looking at that page — the real Vibium
    // daemon holds navigation state across `vibium go` and later script calls.
    let currentUrl = '';

    const runner: CommandRunner = (cmd) => {
      if (cmd.startsWith('vibium go')) {
        currentUrl = cmd.replace(/^vibium go\s+/, '').trim();
        return { status: 0, stdout: '', stderr: '' };
      }
      if (cmd.startsWith('rm -rf')) return { status: 0, stdout: '', stderr: '' };

      if (cmd.includes('scripts/assert.js')) {
        const intentionalFail = cmd.includes('this-does-not-exist');
        if (intentionalFail) {
          return {
            status: 1,
            stderr: '',
            stdout: JSON.stringify({
              status: 'failed',
              output: { assert: { passed: 0, failed: 1 } },
            }),
          };
        }
        return {
          status: 0,
          stderr: '',
          stdout: JSON.stringify({
            status: 'success',
            output: { assert: { passed: 1, failed: 0 } },
          }),
        };
      }

      if (cmd.includes('scripts/batch.js')) {
        const stopOnFail = cmd.includes('#does-not-exist');
        if (stopOnFail) {
          return {
            status: 1,
            stderr: '',
            stdout: JSON.stringify({
              status: 'failed',
              output: {
                batch: { passedSteps: 1, totalSteps: 3, failedStep: { index: 1 } },
              },
            }),
          };
        }
        return {
          status: 0,
          stderr: '',
          stdout: JSON.stringify({
            status: 'success',
            output: { batch: { passedSteps: 3, totalSteps: 3 } },
          }),
        };
      }

      if (cmd.includes('scripts/visual-diff.js')) {
        visualDiffCalls += 1;
        const isBaseline = visualDiffCalls === 1;
        return {
          status: 0,
          stderr: '',
          stdout: JSON.stringify({
            status: 'success',
            output: {
              visualDiff: { status: isBaseline ? 'baseline_created' : 'match' },
            },
          }),
        };
      }

      if (cmd.includes('scripts/check-injection.js')) {
        const poisoned = currentUrl.includes('injection-poisoned');
        if (poisoned) {
          return {
            status: 1,
            stderr: '',
            stdout: JSON.stringify({
              status: 'failed',
              output: { checkInjection: { severity: 'high' } },
            }),
          };
        }
        return {
          status: 0,
          stderr: '',
          stdout: JSON.stringify({
            status: 'success',
            output: { checkInjection: { severity: 'none' } },
          }),
        };
      }

      if (cmd.includes('scripts/intent-score.js')) {
        // tc011 navigates to /html (no form) and asks for fill_email, which
        // should report partial status + zero candidates. tc010 navigates
        // to /forms/post and asks for submit_form, which should find the
        // submit button.
        if (cmd.includes('fill_email')) {
          return {
            status: 0,
            stderr: '',
            stdout: JSON.stringify({
              status: 'partial',
              output: { intentScore: { intent: 'fill_email', candidateCount: 0 } },
            }),
          };
        }
        return {
          status: 0,
          stderr: '',
          stdout: JSON.stringify({
            status: 'success',
            output: { intentScore: { intent: 'submit_form', candidateCount: 2 } },
          }),
        };
      }

      throw new Error(`unmocked command: ${cmd}`);
    };

    const cer = new CommandEvalRunner({ skillsDir: SKILLS_DIR, runner });
    const result = await cer.run('qe-browser');

    // Surface any assertion failures in CI logs before the final expect.
    const fails = result.testResults.filter((r) => !r.passed);
    for (const f of fails) {
      // eslint-disable-next-line no-console
      console.error(`[FAIL] ${f.testId}: ${JSON.stringify(f.failures)}`);
    }

    expect(result.totalTests).toBeGreaterThanOrEqual(11);
    expect(result.passed).toBe(true);
    expect(result.passedTests).toBe(result.totalTests);
    expect(result.criticalPassed).toBe(true);
  });
});
