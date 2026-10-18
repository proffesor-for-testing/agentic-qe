/**
 * #1115: GitAnalyzer ran about 16 `git` calls through execFileSync with no
 * timeout, and GitContextSource one per routed file, so a slow or hung git
 * froze the MCP server's event loop. A stub `git` on PATH delays each call and
 * then runs the real git.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';
import { GitContextSource } from '../../../src/context/sources/git-source.js';

/** Largest timer gap while `work` runs, including the final one. */
async function maxLoopGap<T>(work: () => Promise<T>): Promise<{ result: T; maxGap: number }> {
  let maxGap = 0;
  let last = Date.now();
  const ticker = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 25);
  try {
    const result = await work();
    return { result, maxGap: Math.max(maxGap, Date.now() - last) };
  } finally {
    clearInterval(ticker);
  }
}

describe.skipIf(process.platform === 'win32')('GitAnalyzer runs git without blocking the event loop (#1115)', () => {
  let root: string;
  let repo: string;

  beforeAll(() => {
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    root = mkdtempSync(join(tmpdir(), 'aqe-1115-git-'));
    repo = join(root, 'repo');
    const bin = join(root, 'bin');
    mkdirSync(repo);
    mkdirSync(bin);
    const git = (...args: string[]) => execFileSync(realGit, args, { cwd: repo, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.name', 'Slow Git Test');
    git('config', 'user.email', 'slow@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(repo, 'auth.ts'), 'export const login = () => true;\n');
    git('add', 'auth.ts');
    git('commit', '-qm', 'fix: login bug');

    // Each call sleeps SLOW_GIT_MS, then hands over to the real git.
    const stub = join(bin, 'git');
    writeFileSync(stub, `#!${process.execPath}
const { spawnSync } = require('node:child_process');
setTimeout(() => {
  const r = spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}, Number(process.env.SLOW_GIT_MS));
`);
    chmodSync(stub, 0o755);
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('keeps serving timers while slow git calls run, and still reads the history', async () => {
    vi.stubEnv('SLOW_GIT_MS', '400');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: false });
    const started = Date.now();
    // A blocked loop resumes with the result already settled, so the final gap counts too.
    const { result: history, maxGap } = await maxLoopGap(() => analyzer.getFileHistory('auth.ts'));
    expect(history).toMatchObject({ filePath: 'auth.ts', totalCommits: 1, uniqueAuthors: 1, bugFixCommits: 1 });
    expect(history.lastCommit).toBeInstanceOf(Date);
    // At least rev-parse plus 11 history queries, 400ms each.
    expect(Date.now() - started).toBeGreaterThan(4000);
    // A synchronous call would stall the loop for one 400ms git call or longer.
    expect(maxGap).toBeLessThan(300);
  }, 30000);

  it('gathers routing context from git history without blocking', async () => {
    vi.stubEnv('SLOW_GIT_MS', '400');
    const { result: fragments, maxGap } = await maxLoopGap(() => new GitContextSource(repo).gather({
      targetFiles: ['auth.ts', 'auth.ts', 'auth.ts'], agentType: 'qe-test', taskDescription: 'route',
    }));
    expect(fragments).toHaveLength(3);
    expect(fragments[0].content).toContain('fix: login bug');
    expect(maxGap).toBeLessThan(300);
  }, 30000);

  it('gives up on a hung git after gitTimeoutMs and falls back to the default', async () => {
    vi.stubEnv('SLOW_GIT_MS', '20000');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: false, gitTimeoutMs: 300 });
    const started = Date.now();
    expect(await analyzer.isGitRepository()).toBe(false);
    expect(await analyzer.getChangeFrequency('auth.ts')).toBe(0.4);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 30000);
});
