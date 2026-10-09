import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';

describe('GitAnalyzer exact since timestamp with native Git', () => {
  let root: string;
  let since: Date;
  let analyzer: GitAnalyzer;
  const git = (args: string[], date?: Date) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TZ: 'UTC', ...(date ? {
      GIT_AUTHOR_DATE: date.toISOString(), GIT_COMMITTER_DATE: date.toISOString(),
    } : {}) },
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-git-since-'));
    since = new Date(Date.now() - 10 * 60 * 1000);
    git(['init', '-q']);
    git(['config', 'user.name', 'Native Git Test']);
    git(['config', 'user.email', 'native@example.invalid']);
    git(['config', 'commit.gpgsign', 'false']);
    for (const [name, offset] of [['before.ts', -5], ['after.ts', 5]] as const) {
      writeFileSync(join(root, name), 'export const value = 1;\n');
      git(['add', '--', name]);
      git(['commit', '-qm', name], new Date(since.getTime() + offset * 60 * 1000));
    }
    analyzer = new GitAnalyzer({ repoRoot: root, enableCache: false });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('excludes commits before the cutoff and includes commits after it', async () => {
    expect(await analyzer.getChangedFiles(since)).toEqual(['after.ts']);
  });

  it('uses the same instant supplied with a non-UTC offset', async () => {
    const withOffset = new Date(since.getTime() - 5 * 60 * 60 * 1000)
      .toISOString().replace('Z', '-05:00');
    expect(await analyzer.getChangedFiles(new Date(withOffset))).toEqual(['after.ts']);
  });

  it('retains a no-change result after the latest commit', async () => {
    expect(await analyzer.getChangedFiles(new Date())).toEqual([]);
  });
});
