/**
 * IMP-10: QE Quality Daemon — Git Watcher
 *
 * Watches `.git/refs/heads/` for new commits via fs.watch.
 * Parses git log to determine changed files and enqueues
 * 'next' priority analysis tasks into the daemon queue.
 */

import { watch, type FSWatcher } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { PriorityQueue, GitCommitPayload, QueueItem, DaemonTaskPayload } from './priority-queue';

const execFileAsync = promisify(execFile);

export interface GitWatcherOptions {
  /** Root of the git repository (defaults to cwd) */
  repoRoot?: string;
  /** Debounce interval for fs.watch events (ms) */
  debounceMs?: number;
  /** Maximum number of changed files to track per commit */
  maxChangedFiles?: number;
  /** Polling interval in ms for platforms without recursive fs.watch (e.g. Linux). Default: 5000 */
  pollIntervalMs?: number;
}

const DEFAULTS: Required<GitWatcherOptions> = {
  repoRoot: process.cwd(),
  debounceMs: 500,
  maxChangedFiles: 200,
  pollIntervalMs: 5000,
};

/**
 * Watches git refs for new commits and enqueues analysis tasks.
 */
export class GitWatcher {
  private watcher: FSWatcher | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private options: Required<GitWatcherOptions>;
  private lastKnownHeads = new Map<string, string>();
  private debounceTimer: NodeJS.Timeout | undefined;
  private _running = false;
  private _polling = false;

  constructor(
    private readonly queue: PriorityQueue,
    options?: GitWatcherOptions
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  get running(): boolean {
    return this._running;
  }

  /**
   * Start watching git refs for changes.
   */
  async start(): Promise<void> {
    if (this._running) return;

    const refsDir = resolve(this.options.repoRoot, '.git', 'refs', 'heads');
    if (!existsSync(refsDir)) {
      throw new Error(`Git refs directory not found: ${refsDir}`);
    }

    // Snapshot current HEADs
    await this.snapshotHeads();

    // fs.watch({ recursive: true }) only works on macOS and Windows.
    // On Linux, fall back to polling (Finding 3).
    const supportsRecursive = process.platform === 'darwin' || process.platform === 'win32';

    if (supportsRecursive) {
      this.watcher = watch(refsDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        this.handleRefChange(filename);
      });
    } else {
      // Linux: use git-based polling instead of unreliable fs.watch
      this.pollTimer = setInterval(() => {
        this.poll().catch((err) => {
          console.debug('[GitWatcher] Poll error:', err);
        });
      }, this.options.pollIntervalMs);
    }

    this._running = true;
  }

  /**
   * Stop watching.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
    this._running = false;
  }

  /**
   * Manual poll — useful for platforms where fs.watch is unreliable.
   * Compares current HEAD hashes with last known and enqueues changes.
   */
  async poll(): Promise<string[]> {
    // Guard against concurrent poll + watch race condition
    if (this._polling) return [];
    this._polling = true;

    const changedBranches: string[] = [];

    try {
      const { stdout } = await execFileAsync('git', [
        'for-each-ref',
        '--format=%(refname:short) %(objectname:short)',
        'refs/heads/',
      ], { cwd: this.options.repoRoot });

      for (const line of stdout.trim().split('\n')) {
        if (!line) continue;
        const [branch, hash] = line.split(' ');
        const lastHash = this.lastKnownHeads.get(branch);
        if (lastHash && lastHash !== hash) {
          changedBranches.push(branch);
          await this.enqueueCommitAnalysis(branch, hash);
        }
        this.lastKnownHeads.set(branch, hash);
      }
    } catch {
      // git not available or not a repo — silently skip
    } finally {
      this._polling = false;
    }

    return changedBranches;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private handleRefChange(filename: string): void {
    // Debounce rapid fs events (git writes multiple times per commit)
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.processRefChange(filename).catch((err) => {
        console.debug('[GitWatcher] Error processing ref change:', err);
      });
    }, this.options.debounceMs);
  }

  private async processRefChange(filename: string): Promise<void> {
    const branch = filename.replace(/\\/g, '/');
    const refsDir = resolve(this.options.repoRoot, '.git', 'refs', 'heads');
    const refFile = join(refsDir, filename);

    let newHash: string;
    try {
      newHash = readFileSync(refFile, 'utf-8').trim();
    } catch {
      return; // ref deleted or unreadable
    }

    const lastHash = this.lastKnownHeads.get(branch);
    if (lastHash === newHash) return; // no change

    this.lastKnownHeads.set(branch, newHash);
    await this.enqueueCommitAnalysis(branch, newHash);
  }

  private async enqueueCommitAnalysis(
    branch: string,
    commitHash: string
  ): Promise<void> {
    let changedFiles: string[] = [];
    try {
      const { stdout } = await execFileAsync('git', [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        commitHash,
      ], { cwd: this.options.repoRoot });

      changedFiles = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(0, this.options.maxChangedFiles);
    } catch {
      // fallback: empty changed files list
    }

    const payload: GitCommitPayload = {
      type: 'git_commit',
      branch,
      commitHash,
      changedFiles,
    };

    const item: QueueItem<DaemonTaskPayload> = {
      id: `git-${commitHash}-${Date.now()}`,
      priority: 'next',
      payload,
      createdAt: Date.now(),
      source: 'git-watcher',
      ttlMs: 5 * 60 * 1000, // 5 min TTL
    };

    this.queue.enqueue(item);
  }

  private async snapshotHeads(): Promise<void> {
    try {
      const { stdout } = await execFileAsync('git', [
        'for-each-ref',
        '--format=%(refname:short) %(objectname:short)',
        'refs/heads/',
      ], { cwd: this.options.repoRoot });

      for (const line of stdout.trim().split('\n')) {
        if (!line) continue;
        const [branch, hash] = line.split(' ');
        this.lastKnownHeads.set(branch, hash);
      }
    } catch {
      // not a git repo or git not available
    }
  }
}
