import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');
const ADAPTER = join(REPO_ROOT, '.codex/hooks/aqe-codex-hook.cjs');

describe('Codex AQE hook adapter', () => {
  let projectRoot = '';

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    projectRoot = '';
  });

  function arrangeRuntime(response: unknown): string {
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-codex-hook-'));
    execFileSync('git', ['init', '--quiet', projectRoot]);
    mkdirSync(join(projectRoot, '.codex/hooks'), { recursive: true });
    copyFileSync(ADAPTER, join(projectRoot, '.codex/hooks/aqe-codex-hook.cjs'));
    writeFileSync(
      join(projectRoot, '.codex/hooks/aqe-runtime.cjs'),
      `
        const fs = require('node:fs');
        const path = require('node:path');
        fs.appendFileSync(path.join(process.cwd(), 'calls.log'), process.argv.slice(2).join(' ') + '\\n');
        process.stdout.write(${JSON.stringify(`${JSON.stringify(response)}\n`)});
      `,
    );
    return join(projectRoot, '.codex/hooks/aqe-codex-hook.cjs');
  }

  function run(subcommand: string, event: string): string {
    const adapter = arrangeRuntime({
      hookSpecificOutput: {
        hookEventName: event,
        permissionDecision: 'allow',
      },
      success: true,
      patternsLearned: 1,
    });
    return execFileSync('node', [adapter, subcommand], {
      cwd: projectRoot,
      input: JSON.stringify({ cwd: projectRoot, hook_event_name: event }),
      encoding: 'utf8',
    });
  }

  it.each([
    ['pre-command', 'PreToolUse'],
    ['pre-edit', 'PreToolUse'],
    ['post-command', 'PostToolUse'],
    ['post-edit', 'PostToolUse'],
    ['session-start', 'SessionStart'],
  ])('should_returnEmptyOutput_when_%s_completes', (subcommand, event) => {
    expect(run(subcommand, event)).toBe('');
  });

  it('should_returnCodexContext_when_routeCompletes', () => {
    const adapter = arrangeRuntime({
      recommendedAgent: 'qe-test-architect',
      confidence: 0.8,
      domains: ['test-generation'],
      guidance: ['Use AAA'],
    });

    const stdout = execFileSync('node', [adapter, 'route'], {
      cwd: projectRoot,
      input: JSON.stringify({ cwd: projectRoot, prompt: 'add tests' }),
      encoding: 'utf8',
    });

    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext:
          'AQE routing recommends qe-test-architect (80% confidence). Domains: test-generation. Guidance: Use AAA.',
      },
    });
  });

  it('should_closeRouteBeforeSessionEnd_when_stopRuns', () => {
    const adapter = arrangeRuntime({ success: true });

    const stdout = execFileSync('node', [adapter, 'stop'], {
      cwd: projectRoot,
      input: JSON.stringify({ cwd: projectRoot, hook_event_name: 'Stop' }),
      encoding: 'utf8',
    });

    expect(stdout).toBe('');
    expect(readFileSync(join(projectRoot, 'calls.log'), 'utf8').trim().split('\n')).toEqual([
      'post-route --success true --json',
      'session-end --save-state --json',
    ]);
  });
});
