/**
 * #1115: GitAnalyzer ran about 16 `git` calls through execFileSync with no
 * timeout, and GitContextSource one per routed file, so a slow or hung git
 * froze the MCP server's event loop. A stub `git` on PATH delays or hangs
 * selected calls and otherwise runs the real git.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

describe.skipIf(process.platform === 'win32')('GitAnalyzer runs git without blocking the event loop (#1115)', () => {
  let root: string;
  let repo: string;
  let pids: string;
  let revParseOnce: string;

  beforeAll(() => {
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    root = mkdtempSync(join(tmpdir(), 'aqe-1115-git-'));
    repo = join(root, 'repo');
    const bin = join(root, 'bin');
    pids = join(root, 'hung-pids');
    revParseOnce = join(root, 'rev-parse-hung');
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

    // A wrapper script, like a credential helper or fsmonitor, whose child
    // must not outlive the timeout. HANG_GREP hangs only `log --grep`;
    // HANG_REV_PARSE_ONCE hangs only the first `rev-parse`.
    const stub = join(bin, 'git');
    writeFileSync(stub, `#!/bin/bash
hang() { sleep 60 & echo $! >> ${JSON.stringify(pids)}; wait; }
if [ -n "$HANG_GREP" ] && [[ " $* " == *" --grep "* ]]; then hang; fi
if [ -n "$HANG_REV_PARSE_ONCE" ] && [ "$1" = rev-parse ] && [ ! -e ${JSON.stringify(revParseOnce)} ]; then
  touch ${JSON.stringify(revParseOnce)}; hang
fi
sleep "\${SLOW_GIT_S:-0}"
exec ${JSON.stringify(realGit)} "$@"
`);
    chmodSync(stub, 0o755);
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  });

  beforeEach(() => {
    for (const name of ['SLOW_GIT_S', 'HANG_GREP', 'HANG_REV_PARSE_ONCE']) vi.stubEnv(name, '');
    rmSync(pids, { force: true });
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('keeps serving timers while slow git calls run, and still reads the history', async () => {
    vi.stubEnv('SLOW_GIT_S', '1');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: false });
    const started = Date.now();
    // A blocked loop resumes with the result already settled, so the final gap counts too.
    const { result: history, maxGap } = await maxLoopGap(() => analyzer.getFileHistory('auth.ts'));
    expect(history).toMatchObject({ filePath: 'auth.ts', totalCommits: 1, uniqueAuthors: 1, bugFixCommits: 1 });
    expect(history.lastCommit).toBeInstanceOf(Date);
    // rev-parse plus five history queries, one second each.
    expect(Date.now() - started).toBeGreaterThan(5500);
    // A synchronous call would stall the loop for one 1s git call or longer.
    expect(maxGap).toBeLessThan(500);
  }, 30000);

  it('gathers routing context from git history without blocking', async () => {
    vi.stubEnv('SLOW_GIT_S', '1');
    const { result: fragments, maxGap } = await maxLoopGap(() => new GitContextSource(repo).gather({
      targetFiles: ['auth.ts', 'auth.ts'], agentType: 'qe-test', taskDescription: 'route',
    }));
    expect(fragments).toHaveLength(2);
    expect(fragments[0].content).toContain('fix: login bug');
    expect(maxGap).toBeLessThan(500);
  }, 30000);

  it('reports a timed-out bug search as "no git data", never as zero bug fixes', async () => {
    vi.stubEnv('HANG_GREP', '1');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: true, gitTimeoutMs: 500 });

    expect(await analyzer.getBugHistory('auth.ts')).toBe(0.2);
    expect(analyzer.consumeTimeout('auth.ts')).toBe(true);
    expect(analyzer.consumeTimeout('auth.ts')).toBe(false);
    // The rest of the history shares the deadline and also falls back as a whole.
    expect(await analyzer.getFileHistory('auth.ts')).toMatchObject({ totalCommits: 0, bugFixCommits: 0, lastCommit: null });
    expect(analyzer.consumeTimeout('auth.ts')).toBe(true);

    // Nothing was cached: once git answers, the measured value comes back.
    vi.stubEnv('HANG_GREP', '');
    expect(await analyzer.getBugHistory('auth.ts')).toBe(0.1);
    expect(analyzer.consumeTimeout('auth.ts')).toBe(false);
  }, 30000);

  it('stops the whole git process group at the timeout', async () => {
    vi.stubEnv('HANG_GREP', '1');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: false, gitTimeoutMs: 500 });
    const started = Date.now();
    expect(await analyzer.getBugHistory('auth.ts')).toBe(0.2);
    expect(Date.now() - started).toBeLessThan(5000);

    const hung = readFileSync(pids, 'utf8').trim().split('\n').map(Number);
    expect(hung.length).toBeGreaterThan(0);
    expect(hung.filter(alive)).toEqual([]);
  }, 30000);

  it('asks again after a rev-parse timeout instead of turning git off for good', async () => {
    vi.stubEnv('HANG_REV_PARSE_ONCE', '1');
    rmSync(revParseOnce, { force: true });
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: false, gitTimeoutMs: 500, cacheTtl: 1000 });

    expect(await analyzer.getChangeFrequency('auth.ts')).toBe(0.4);
    expect(existsSync(revParseOnce)).toBe(true);
    expect(analyzer.consumeTimeout('auth.ts')).toBe(true);
    // Within cacheTtl the timeout stands in for git, without waiting again.
    const started = Date.now();
    expect(await analyzer.getCodeAge('auth.ts')).toBe(0.4);
    expect(Date.now() - started).toBeLessThan(200);
    expect(analyzer.consumeTimeout('auth.ts')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await analyzer.isGitRepository()).toBe(true);
    expect((await analyzer.getFileHistory('auth.ts')).totalCommits).toBe(1);
  }, 30000);
});
