/**
 * Tests for the QE Quality Daemon Git Watcher (IMP-10).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PriorityQueue } from '../../../src/workers/quality-daemon/priority-queue';
import { GitWatcher } from '../../../src/workers/quality-daemon/git-watcher';
import type { DaemonTaskPayload, GitCommitPayload } from '../../../src/workers/quality-daemon/priority-queue';

const mockExecFile = vi.fn();

// Mock child_process.execFile
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// Mock fs.watch
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    watch: vi.fn(() => ({
      close: vi.fn(),
      on: vi.fn(),
    })),
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => 'abc123\n'),
  };
});

function setupGitMock(branches: Array<{ name: string; hash: string }>): void {
  const output = branches.map(b => `${b.name} ${b.hash}`).join('\n');
  mockExecFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb?: Function) => {
    if (cb) {
      if (args.includes('for-each-ref')) {
        cb(null, { stdout: output, stderr: '' });
      } else if (args.includes('diff-tree')) {
        cb(null, { stdout: 'src/foo.ts\nsrc/bar.ts\n', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    }
  });
}

describe('GitWatcher', () => {
  let queue: PriorityQueue;
  let watcher: GitWatcher;

  beforeEach(() => {
    queue = new PriorityQueue();
    watcher = new GitWatcher(queue, {
      repoRoot: '/tmp/fake-repo',
      debounceMs: 10,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    watcher.stop();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  it('starts and sets running to true', async () => {
    setupGitMock([{ name: 'main', hash: 'aaa111' }]);
    expect(watcher.running).toBe(false);
    await watcher.start();
    expect(watcher.running).toBe(true);
  });

  it('stop sets running to false and clears timers', async () => {
    setupGitMock([{ name: 'main', hash: 'aaa111' }]);
    await watcher.start();
    watcher.stop();
    expect(watcher.running).toBe(false);
  });

  it('does not error on double start', async () => {
    setupGitMock([{ name: 'main', hash: 'aaa111' }]);
    await watcher.start();
    await watcher.start();
    expect(watcher.running).toBe(true);
  });

  // -------------------------------------------------------------------------
  // poll() — commit detection (core feature)
  // -------------------------------------------------------------------------

  it('poll detects branch hash change and enqueues item', async () => {
    // First poll: establish baseline with hash aaa111
    setupGitMock([{ name: 'main', hash: 'aaa111' }]);
    let changed = await watcher.poll();
    expect(changed).toEqual([]);
    expect(queue.isEmpty).toBe(true);

    // Second poll: hash changed to bbb222
    setupGitMock([{ name: 'main', hash: 'bbb222' }]);
    changed = await watcher.poll();

    expect(changed).toEqual(['main']);
    expect(queue.size).toBe(1);

    const item = queue.dequeue()!;
    expect(item.priority).toBe('next');
    expect(item.source).toBe('git-watcher');
    const payload = item.payload as GitCommitPayload;
    expect(payload.type).toBe('git_commit');
    expect(payload.branch).toBe('main');
    expect(payload.commitHash).toBe('bbb222');
    expect(payload.changedFiles).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('poll detects multiple branch changes', async () => {
    setupGitMock([
      { name: 'main', hash: 'aaa111' },
      { name: 'feature', hash: 'ccc333' },
    ]);
    await watcher.poll(); // baseline

    setupGitMock([
      { name: 'main', hash: 'bbb222' },
      { name: 'feature', hash: 'ddd444' },
    ]);
    const changed = await watcher.poll();

    expect(changed).toEqual(['main', 'feature']);
    expect(queue.size).toBe(2);
  });

  it('poll does not enqueue when hash is unchanged', async () => {
    setupGitMock([{ name: 'main', hash: 'aaa111' }]);
    await watcher.poll();

    // Same hash on second poll
    const changed = await watcher.poll();
    expect(changed).toEqual([]);
    expect(queue.isEmpty).toBe(true);
  });

  it('poll returns empty array when git is unavailable', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
      if (cb) cb(new Error('git: command not found'), { stdout: '', stderr: '' });
    });
    const result = await watcher.poll();
    expect(result).toEqual([]);
  });

  it('poll guards against concurrent execution', async () => {
    setupGitMock([{ name: 'main', hash: 'aaa111' }]);

    // Start two polls simultaneously — second should be skipped
    const [result1, result2] = await Promise.all([
      watcher.poll(),
      watcher.poll(),
    ]);

    // One should have run, the other should be empty (guard)
    expect([...result1, ...result2]).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // TTL on enqueued items
  // -------------------------------------------------------------------------

  it('enqueued items have 5-minute TTL', async () => {
    setupGitMock([{ name: 'main', hash: 'aaa111' }]);
    await watcher.poll();

    setupGitMock([{ name: 'main', hash: 'bbb222' }]);
    await watcher.poll();

    const item = queue.dequeue()!;
    expect(item.ttlMs).toBe(5 * 60 * 1000);
  });
});
