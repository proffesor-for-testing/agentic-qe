/**
 * ruflo hook-handler pre-bash contract.
 *
 * .claude/helpers/hook-handler.cjs is ruflo-managed (helpers.manifest.json).
 * Since ruflo 3.51.1 its pre-bash guard exits 2 on a dangerous command, which
 * Claude Code treats as a PreToolUse block (exit 1 was non-blocking). The guard
 * is a plain substring match, so commands that merely contain a dangerous
 * pattern — e.g. `rm -rf /tmp/scratch` contains `rm -rf /` — are blocked too.
 * These tests pin both behaviours so a future helper refresh that changes them
 * shows up in review.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(__dirname, '../../..');
const HANDLER = resolve(REPO_ROOT, '.claude/helpers/hook-handler.cjs');

function preBash(command: string): { code: number | null; stdout: string; stderr: string } {
  const projectDir = mkdtempSync(join(tmpdir(), 'aqe-pre-bash-'));
  const result = spawnSync('node', [HANDLER, 'pre-bash'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    timeout: 15000,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('ruflo hook-handler pre-bash', () => {
  it('allows an ordinary command', () => {
    const { code, stdout } = preBash('git status');
    expect(code).toBe(0);
    expect(stdout).toContain('[OK] Command validated');
  });

  it.each(['rm -rf /', 'format c:', ':(){:|:&};:'])('blocks %s with exit 2', (command) => {
    const { code, stderr } = preBash(command);
    expect(code).toBe(2);
    expect(stderr).toContain('[BLOCKED] Dangerous command detected');
  });

  it('also blocks a scoped rm -rf under /tmp (substring false positive)', () => {
    const { code, stderr } = preBash('rm -rf /tmp/aqe-scratch');
    expect(code).toBe(2);
    expect(stderr).toContain('rm -rf /');
  });
});
