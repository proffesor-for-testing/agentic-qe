/**
 * Git ref validation — caller-supplied refs must never be parsed by git as
 * options (e.g. `--output=<path>` makes `git diff` create/truncate a file).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeGitRef, getGitRefError } from '../../../src/shared/git/ref-validation';
import { GitAwareTestSelector } from '../../../src/test-scheduling/git-aware/test-selector';
import { TestScheduleTool } from '../../../src/mcp/tools/test-execution/schedule';
import type { IImpactAnalyzerService } from '../../../src/domains/code-intelligence/services/impact-analyzer';

const impactAnalyzer = {
  analyzeImpact: async () => ({ success: true, value: {} }),
  getImpactedTests: async () => ({ success: true, value: [] }),
  calculateRiskLevel: () => 'low',
  getRecommendations: () => [],
} as unknown as IImpactAnalyzerService;

describe('getGitRefError', () => {
  it.each(['main', 'origin/main', 'HEAD', 'HEAD~3', 'HEAD^', 'v1.2.0^{commit}', 'feature/a-b_c.1', 'a1b2c3d4'])(
    'accepts ordinary revision %s',
    (ref) => {
      expect(getGitRefError(ref)).toBeUndefined();
    }
  );

  it.each([
    ['--output=/tmp/x', 'must not start with "-"'],
    ['-p', 'must not start with "-"'],
    ['main --output=/tmp/x', 'whitespace or control characters'],
    ['main\n--output=/tmp/x', 'whitespace or control characters'],
    ['main\0', 'whitespace or control characters'],
    ['', 'non-empty string'],
    ['a'.repeat(257), 'longer than 256'],
  ])('rejects unsafe ref %j', (ref, message) => {
    expect(getGitRefError(ref)).toContain(message);
  });

  it('rejects non-string values', () => {
    expect(getGitRefError(42 as unknown)).toContain('non-empty string');
    expect(() => assertSafeGitRef(undefined, 'gitRef')).toThrow('Invalid gitRef');
  });
});

describe('git ref option injection (real git)', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'aqe-gitref-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'one');
    writeFileSync(join(repo, 'a.ts'), 'export const a = 2;\n');
    git('commit', '-q', '-am', 'two');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('git itself treats a leading-dash ref as an option (the attack this guards against)', () => {
    const marker = join(repo, 'written-by-git');
    execFileSync('git', ['diff', '--name-status', `--output=${marker}`, 'HEAD'], { cwd: repo, stdio: 'pipe' });
    expect(existsSync(marker)).toBe(true);
  });

  it('GitAwareTestSelector rejects an option-shaped base ref before invoking git', () => {
    const marker = join(repo, 'pwned');
    expect(
      () => new GitAwareTestSelector({ impactAnalyzer, cwd: repo, baseRef: `--output=${marker}` })
    ).toThrow('must not start with "-"');
    expect(existsSync(marker)).toBe(false);
  });

  it('GitAwareTestSelector still diffs ordinary refs', async () => {
    const selector = new GitAwareTestSelector({ impactAnalyzer, cwd: repo, baseRef: 'HEAD~1' });
    const changed = await selector.getChangedFiles();
    expect(changed.map((f) => f.path)).toEqual(['a.ts']);
  });

  it('getMergeBase rejects an option-shaped target branch', async () => {
    const selector = new GitAwareTestSelector({ impactAnalyzer, cwd: repo });
    await expect(selector.getMergeBase('--output=/dev/null')).rejects.toThrow('must not start with "-"');
  });

  it('qe/tests/schedule returns an error for an unsafe gitRef without running the pipeline', async () => {
    const marker = join(repo, 'pwned');
    const tool = new TestScheduleTool();
    const result = await tool.invoke({ cwd: repo, gitRef: `--output=${marker}` });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid gitRef');
    expect(existsSync(marker)).toBe(false);
  });
});
