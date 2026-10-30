/**
 * #1165: follow-ups to #1115. A git timeout, an overflowing output or a failed
 * git call must not read as "no history" or "no changes", and one caller's
 * timeout flag and deadline must not leak into another caller on the same file.
 * A stub `git` on PATH hangs, fails or floods selected calls and otherwise
 * runs the real git.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { GitAnalyzer } from '../../../src/shared/git/git-analyzer.js';
import { GitTimeoutError } from '../../../src/shared/git/git-process.js';
import { CodeIntelligenceIndexProtocol } from '../../../src/coordination/protocols/code-intelligence-index.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(process.platform === 'win32')('GitAnalyzer git failures are not "no history" (#1165)', () => {
  let root: string;
  let repo: string;
  let realGit: string;

  beforeAll(() => {
    realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    root = mkdtempSync(join(tmpdir(), 'aqe-1165-git-'));
    repo = join(root, 'repo');
    const bin = join(root, 'bin');
    mkdirSync(repo);
    mkdirSync(bin);
    const git = (...args: string[]) => execFileSync(realGit, args, { cwd: repo, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.name', 'Git Failure Test');
    git('config', 'user.email', 'fail@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(repo, 'auth.ts'), 'export const login = () => true;\n');
    git('add', 'auth.ts');
    git('commit', '-qm', 'fix: login bug');

    // HANG_GREP hangs `log --grep`, FAIL_GREP makes it exit 1, BIG_GREP makes
    // it print more than GitAnalyzer's 64 MiB output limit.
    const stub = join(bin, 'git');
    writeFileSync(stub, `#!/bin/bash
if [[ " $* " == *" --grep "* ]]; then
  if [ -n "$HANG_GREP" ]; then sleep 60 & wait; fi
  if [ -n "$FAIL_GREP" ]; then echo "fatal: simulated failure" >&2; exit 1; fi
  if [ -n "$BIG_GREP" ]; then head -c 70000000 /dev/zero | tr '\\0' 'a'; exit 0; fi
fi
exec ${JSON.stringify(realGit)} "$@"
`);
    chmodSync(stub, 0o755);
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  });

  beforeEach(() => {
    for (const name of ['HANG_GREP', 'FAIL_GREP', 'BIG_GREP']) vi.stubEnv(name, '');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('reports a timeout only to the call it happened in, not to another call on the same file', async () => {
    vi.stubEnv('HANG_GREP', '1');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: false, gitTimeoutMs: 500 });
    const scoped = (work: () => Promise<unknown>) => analyzer.withFileDeadline('auth.ts', async () => {
      await work();
      return analyzer.consumeTimeout('auth.ts');
    });

    const [aTimedOut, bTimedOut] = await Promise.all([
      // A's bug search times out at 500 ms; A asks about it later.
      scoped(async () => { await analyzer.getBugHistory('auth.ts'); await sleep(1500); }),
      // B reads healthy history and asks in between.
      scoped(async () => { await analyzer.getChangeFrequency('auth.ts'); await sleep(800); }),
    ]);

    expect(bTimedOut).toBe(false);
    expect(aTimedOut).toBe(true);
  }, 30000);

  it('keeps a second call bounded by its own deadline after the first call on the file ends', async () => {
    vi.stubEnv('HANG_GREP', '1');
    // Each git call alone may wait 20 s; one file's analyses get 1.5 s.
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: false, gitTimeoutMs: 20000, fileTimeoutMs: 1500 });
    const started = Date.now();
    const [, bugs] = await Promise.all([
      analyzer.withFileDeadline('auth.ts', () => analyzer.getChangeFrequency('auth.ts')),
      analyzer.withFileDeadline('auth.ts', async () => {
        await analyzer.getChangeFrequency('auth.ts');
        await sleep(300); // the first call has finished by now
        return analyzer.getBugHistory('auth.ts');
      }),
    ]);
    expect(bugs).toBe(0.2);
    expect(Date.now() - started).toBeLessThan(6000);
  }, 30000);

  it('reads a failed git query as "no git data", never as a measured zero', async () => {
    vi.stubEnv('FAIL_GREP', '1');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: true });

    expect(await analyzer.getBugHistory('auth.ts')).toBe(0.2);

    // Nothing was cached: once git answers, the measured value comes back.
    vi.stubEnv('FAIL_GREP', '');
    expect(await analyzer.getBugHistory('auth.ts')).toBe(0.1);
  }, 30000);

  it('flags output beyond the buffer limit as incomplete, not as zero bug fixes', async () => {
    vi.stubEnv('BIG_GREP', '1');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: true });

    expect(await analyzer.getBugHistory('auth.ts')).toBe(0.2);
    expect(analyzer.consumeTimeout('auth.ts')).toBe(true);
  }, 30000);

  it('rejects getFileHistory on a timeout instead of returning zero history', async () => {
    vi.stubEnv('HANG_GREP', '1');
    const analyzer = new GitAnalyzer({ repoRoot: repo, enableCache: true, gitTimeoutMs: 500 });

    await expect(analyzer.getFileHistory('auth.ts')).rejects.toBeInstanceOf(GitTimeoutError);

    vi.stubEnv('HANG_GREP', '');
    expect(await analyzer.getFileHistory('auth.ts')).toMatchObject({ totalCommits: 1, bugFixCommits: 1 });
  }, 30000);

  it('rejects changed-file queries when git fails instead of reporting no changes', async () => {
    const analyzer = new GitAnalyzer({ repoRoot: repo });
    await expect(analyzer.getCommitFiles('0123456789abcdef0123456789abcdef01234567')).rejects.toThrow();
    // A healthy query still answers.
    expect(await analyzer.getCommitFiles('HEAD')).toEqual(['auth.ts']);
  }, 30000);

  it('still lists staged files before the first commit', async () => {
    const fresh = join(root, 'unborn');
    mkdirSync(fresh);
    execFileSync(realGit, ['init', '-q'], { cwd: fresh });
    writeFileSync(join(fresh, 'new.ts'), 'export {};\n');
    execFileSync(realGit, ['add', 'new.ts'], { cwd: fresh });

    expect(await new GitAnalyzer({ repoRoot: fresh }).getUncommittedFiles()).toEqual(['new.ts']);
  }, 30000);
});

describe('Code-intelligence incremental indexing does not skip committed changes on a git timeout (#1165)', () => {
  it('fails detectChanges instead of indexing without the committed changes', async () => {
    const kernel = {
      eventBus: { publish: async () => undefined },
      memory: { get: async () => undefined, set: vi.fn(async () => undefined), search: async () => [] },
      getDomainAPI: () => undefined,
    };
    const protocol = new CodeIntelligenceIndexProtocol(kernel as never, { analyzeImpact: false });
    const git = (protocol as unknown as { gitAnalyzer: GitAnalyzer }).gitAnalyzer;
    vi.spyOn(git, 'getUncommittedFiles').mockResolvedValue(['src/dirty.ts']);
    vi.spyOn(git, 'getChangedFiles').mockRejectedValue(new GitTimeoutError(['log'], 30000));

    const changes = await protocol.detectChanges();
    expect(changes.success).toBe(false);
    expect(changes.success ? undefined : changes.error).toBeInstanceOf(GitTimeoutError);

    // The protocol run fails too, so no new last-index time hides the commits.
    const run = await protocol.execute({ type: 'code-change' });
    expect(run.success).toBe(false);
    expect(kernel.memory.set).not.toHaveBeenCalled();
  });
});
