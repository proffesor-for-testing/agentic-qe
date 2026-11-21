/**
 * #1330: a file that git does not track has no history. `git blame` fails on
 * it (exit 128, `fatal: no such path '<path>' in HEAD`) while `git log`
 * returns nothing, and that failure is git's answer, not an incomplete read.
 * The analyzer asks `git ls-files --error-unmatch` once per file scope to tell
 * the two apart, so a file still being written is not reported as incomplete.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';

describe('GitAnalyzer treats an untracked file as having no history (#1330)', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  /** A fresh repository with one commit, plus the given uncommitted files. */
  function repoWithCommit(uncommitted: string[]): string {
    const root = mkdtempSync(join(tmpdir(), 'aqe-untracked-1330-'));
    roots.push(root);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.name', 'AQE untracked test');
    git('config', 'user.email', 'aqe-untracked@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'tracked.ts'), 'export const tracked = true;\n');
    git('add', 'tracked.ts');
    git('commit', '-qm', 'fix: add the tracked file');
    for (const file of uncommitted) writeFileSync(join(root, file), 'export const draft = 1;\n');
    return root;
  }

  it('reads the blame failure of an uncommitted file as git’s answer, not as incomplete', async () => {
    const root = repoWithCommit(['new.ts']);
    const analyzer = new GitAnalyzer({ repoRoot: root, enableCache: false });

    const result = await analyzer.withFileDeadline('new.ts', async () => ({
      developerExperience: await analyzer.getDeveloperExperience('new.ts'),
      changeFrequency: await analyzer.getChangeFrequency('new.ts'),
      incomplete: analyzer.consumeIncomplete('new.ts'),
      timedOut: analyzer.consumeTimeout('new.ts'),
    }));

    // No history: the fallbacks stand in, and nothing claims git failed.
    expect(result.developerExperience).toBe(0.5);
    expect(result.changeFrequency).toBe(0);
    expect(result.incomplete).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it('keeps reporting a tracked file’s history as complete', async () => {
    const root = repoWithCommit([]);
    const analyzer = new GitAnalyzer({ repoRoot: root, enableCache: false });

    const result = await analyzer.withFileDeadline('tracked.ts', async () => ({
      developerExperience: await analyzer.getDeveloperExperience('tracked.ts'),
      changeFrequency: await analyzer.getChangeFrequency('tracked.ts'),
      incomplete: analyzer.consumeIncomplete('tracked.ts'),
    }));

    expect(result.developerExperience).toBe(0.1); // one author of one file
    expect(result.changeFrequency).toBeGreaterThan(0);
    expect(result.incomplete).toBe(false);
  });

  it('flags the untracked file’s scope incomplete when git itself cannot answer', async () => {
    const root = repoWithCommit(['new.ts']);
    // A path outside the work tree: `ls-files` exits 128, so git never said
    // the path is untracked. A failed query stays incomplete.
    const analyzer = new GitAnalyzer({ repoRoot: root, enableCache: false });
    const outside = join(root, '..', `outside-${process.pid}.ts`);
    writeFileSync(outside, 'export const outside = 1;\n');

    try {
      const result = await analyzer.withFileDeadline(outside, async () => {
        expect(await analyzer.getDeveloperExperience(outside)).toBe(0.5);
        return analyzer.consumeIncomplete(outside);
      });
      expect(result).toBe(true);
    } finally {
      rmSync(outside, { force: true });
    }
  });
});
