import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runGit, MockGitTimeoutError } = vi.hoisted(() => ({
  runGit: vi.fn(),
  MockGitTimeoutError: class MockGitTimeoutError extends Error {},
}));

vi.mock('../../../src/shared/git/git-process.js', () => ({
  GitTimeoutError: MockGitTimeoutError,
  runGit,
}));

import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';

describe('GitAnalyzer incomplete Git reads (#1330)', () => {
  beforeEach(() => {
    runGit.mockReset().mockImplementation(async (args: string[]) => {
      if (args.includes('--is-inside-work-tree')) return 'true\n';
      throw new Error('git log --grep failed');
    });
  });

  it('reports a non-timeout Git failure as incomplete without labeling it a timeout', async () => {
    const analyzer = new GitAnalyzer({ repoRoot: 'repo', enableCache: false });

    await analyzer.withFileDeadline('src/file.ts', async () => {
      expect(await analyzer.getBugHistory('src/file.ts')).toBe(0.2);
      expect(analyzer.consumeTimeout('src/file.ts')).toBe(false);
      expect(analyzer.consumeIncomplete('src/file.ts')).toBe(true);
    });
  });
});
