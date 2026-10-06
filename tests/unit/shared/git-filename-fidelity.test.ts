import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';

describe('GitAnalyzer filename fidelity with a real Git repository', () => {
  let root: string;
  let analyzer: GitAnalyzer;
  const names = ['app/[id].tsx', 'app/i.tsx', 'café.ts', ' leading.ts',
    ...(process.platform === 'win32' ? [] : ['line\nbreak.ts', 'trailing.ts '])];
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-git-filenames-'));
    git('init', '-q');
    git('config', 'user.name', 'Native Git Test');
    git('config', 'user.email', 'native@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(root, 'app'));
    for (const name of names) writeFileSync(join(root, name), 'export const value = 1;\n');
    git('add', '--', ...names);
    git('commit', '-qm', 'fix: initial files');
    analyzer = new GitAnalyzer({ repoRoot: root, enableCache: false });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('keeps Next.js route filenames literal in every file-history query', async () => {
    const file = 'app/[id].tsx';
    // Change the pattern-looking sibling: the literal route still has one commit.
    writeFileSync(join(root, 'app/i.tsx'), 'export const value = 2;\n');
    git('add', '--', 'app/i.tsx');
    git('commit', '-qm', 'fix: sibling');
    const history = await analyzer.getFileHistory(file);
    expect(history.filePath).toBe(file);
    expect(history.totalCommits).toBe(1);
    expect(history.uniqueAuthors).toBe(1);
    expect(history.bugFixCommits).toBe(1);
    expect(history.firstCommit).toBeInstanceOf(Date);
    expect(history.lastCommit).toBeInstanceOf(Date);
    expect(await analyzer.getChangeFrequency(file)).toBe(1 / 30);
    expect(await analyzer.getDeveloperExperience(file)).toBe(0.1);
    expect(await analyzer.getCodeAge(file)).toBe(0.7);
    expect(await analyzer.getBugHistory(file)).toBe(0.1);
  });

  it('decodes changed and committed files without quoting or whitespace loss', async () => {
    for (const name of names) writeFileSync(join(root, name), 'export const value = 2;\n');
    git('add', '--', ...names);
    git('commit', '-qm', 'fix: all files');
    expect((await analyzer.getChangedFiles()).sort()).toEqual([...names].sort());
    expect((await analyzer.getCommitFiles()).sort()).toEqual([...names].sort());
  });

  it('retains literal staged and unstaged filenames while deduplicating them', async () => {
    for (const name of names) writeFileSync(join(root, name), 'export const value = 2;\n');
    git('add', '--', names[0], names[2]);
    writeFileSync(join(root, names[0]), 'export const value = 3;\n');
    expect((await analyzer.getUncommittedFiles()).sort()).toEqual([...names].sort());
  });
});
