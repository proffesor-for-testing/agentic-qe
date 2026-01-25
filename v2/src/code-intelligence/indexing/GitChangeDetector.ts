/**
 * Git Change Detector
 *
 * Detects file changes using git for efficient incremental indexing.
 * Integrates with tj-actions/changed-files for CI/CD compatibility.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { FileChange } from './types.js';

const execAsync = promisify(exec);

export interface GitChangeDetectorConfig {
  /**
   * Root directory of the git repository.
   */
  rootDir: string;

  /**
   * File extensions to track.
   */
  extensions: string[];

  /**
   * Directories to exclude from tracking.
   */
  excludeDirs: string[];
}

export const DEFAULT_GIT_CHANGE_DETECTOR_CONFIG: GitChangeDetectorConfig = {
  rootDir: '.',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'],
  excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage'],
};

export class GitChangeDetector {
  private config: GitChangeDetectorConfig;
  private lastCommit: string | null = null;

  constructor(
    rootDir: string,
    config: Partial<GitChangeDetectorConfig> = {}
  ) {
    this.config = {
      ...DEFAULT_GIT_CHANGE_DETECTOR_CONFIG,
      ...config,
      rootDir,
    };
  }

  /**
   * Check if directory is a git repository.
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --is-inside-work-tree', {
        cwd: this.config.rootDir,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current HEAD commit hash.
   */
  async getCurrentCommit(): Promise<string> {
    const { stdout } = await execAsync('git rev-parse HEAD', {
      cwd: this.config.rootDir,
    });
    return stdout.trim();
  }

  /**
   * Get files changed since a specific commit.
   */
  async getChangedFiles(sinceCommit?: string): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    const baseCommit = sinceCommit || this.lastCommit;

    try {
      // Get diff with status
      const diffCmd = baseCommit
        ? `git diff --name-status ${baseCommit}..HEAD`
        : 'git diff --name-status HEAD~1..HEAD';

      const { stdout } = await execAsync(diffCmd, {
        cwd: this.config.rootDir,
      });

      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const [status, ...fileParts] = line.split('\t');
        const filePath = fileParts.join('\t'); // Handle files with tabs in names

        if (!filePath) continue;

        // Check if file matches our extensions
        const ext = path.extname(filePath);
        if (!this.config.extensions.includes(ext)) continue;

        // Check if file is in excluded directory
        if (this.isExcluded(filePath)) continue;

        const fullPath = path.join(this.config.rootDir, filePath);

        switch (status[0]) {
          case 'A': // Added
            changes.push({
              type: 'add',
              filePath: fullPath,
              timestamp: Date.now(),
            });
            break;
          case 'M': // Modified
            changes.push({
              type: 'modify',
              filePath: fullPath,
              timestamp: Date.now(),
            });
            break;
          case 'D': // Deleted
            changes.push({
              type: 'delete',
              filePath: fullPath,
              timestamp: Date.now(),
            });
            break;
          case 'R': // Renamed
            // For renamed files, treat as delete + add
            const [oldPath, newPath] = fileParts;
            if (oldPath) {
              changes.push({
                type: 'delete',
                filePath: path.join(this.config.rootDir, oldPath),
                timestamp: Date.now(),
              });
            }
            if (newPath) {
              changes.push({
                type: 'add',
                filePath: path.join(this.config.rootDir, newPath),
                timestamp: Date.now(),
              });
            }
            break;
        }
      }

      // Update last known commit
      this.lastCommit = await this.getCurrentCommit();
    } catch (error) {
      // If git command fails, return empty changes
      console.warn('Git change detection failed:', error);
    }

    return changes;
  }

  /**
   * Get uncommitted changes (working directory).
   */
  async getUncommittedChanges(): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    try {
      // Get staged and unstaged changes
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: this.config.rootDir,
      });

      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const status = line.substring(0, 2);
        const filePath = line.substring(3);

        if (!filePath) continue;

        // Check if file matches our extensions
        const ext = path.extname(filePath);
        if (!this.config.extensions.includes(ext)) continue;

        // Check if file is in excluded directory
        if (this.isExcluded(filePath)) continue;

        const fullPath = path.join(this.config.rootDir, filePath);

        // Parse git status
        const indexStatus = status[0];
        const workingStatus = status[1];

        if (indexStatus === '?' || workingStatus === '?') {
          // Untracked file
          changes.push({
            type: 'add',
            filePath: fullPath,
            timestamp: Date.now(),
          });
        } else if (indexStatus === 'A' || workingStatus === 'A') {
          changes.push({
            type: 'add',
            filePath: fullPath,
            timestamp: Date.now(),
          });
        } else if (indexStatus === 'D' || workingStatus === 'D') {
          changes.push({
            type: 'delete',
            filePath: fullPath,
            timestamp: Date.now(),
          });
        } else if (indexStatus === 'M' || workingStatus === 'M') {
          changes.push({
            type: 'modify',
            filePath: fullPath,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.warn('Git uncommitted change detection failed:', error);
    }

    return changes;
  }

  /**
   * Get all changes (committed since base + uncommitted).
   */
  async getAllChanges(sinceCommit?: string): Promise<FileChange[]> {
    const committed = await this.getChangedFiles(sinceCommit);
    const uncommitted = await this.getUncommittedChanges();

    // Merge and dedupe (uncommitted takes precedence)
    const changeMap = new Map<string, FileChange>();

    for (const change of committed) {
      changeMap.set(change.filePath, change);
    }

    for (const change of uncommitted) {
      changeMap.set(change.filePath, change);
    }

    return Array.from(changeMap.values());
  }

  /**
   * Get files changed between two commits.
   */
  async getChangesBetweenCommits(
    fromCommit: string,
    toCommit: string
  ): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    try {
      const { stdout } = await execAsync(
        `git diff --name-status ${fromCommit}..${toCommit}`,
        { cwd: this.config.rootDir }
      );

      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const [status, filePath] = line.split('\t');

        if (!filePath) continue;

        const ext = path.extname(filePath);
        if (!this.config.extensions.includes(ext)) continue;
        if (this.isExcluded(filePath)) continue;

        const fullPath = path.join(this.config.rootDir, filePath);

        const type: FileChange['type'] =
          status[0] === 'A' ? 'add' :
          status[0] === 'D' ? 'delete' : 'modify';

        changes.push({
          type,
          filePath: fullPath,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.warn('Git diff between commits failed:', error);
    }

    return changes;
  }

  /**
   * Get commit history for a file.
   */
  async getFileHistory(filePath: string, limit: number = 10): Promise<string[]> {
    try {
      const relativePath = path.relative(this.config.rootDir, filePath);
      const { stdout } = await execAsync(
        `git log --format=%H -n ${limit} -- "${relativePath}"`,
        { cwd: this.config.rootDir }
      );

      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get blame information for a file (line-by-line attribution).
   */
  async getBlame(
    filePath: string
  ): Promise<Array<{ line: number; commit: string; author: string }>> {
    const blame: Array<{ line: number; commit: string; author: string }> = [];

    try {
      const relativePath = path.relative(this.config.rootDir, filePath);
      const { stdout } = await execAsync(
        `git blame --line-porcelain "${relativePath}"`,
        { cwd: this.config.rootDir }
      );

      let currentCommit = '';
      let currentAuthor = '';
      let lineNumber = 0;

      for (const line of stdout.split('\n')) {
        if (line.match(/^[0-9a-f]{40}/)) {
          currentCommit = line.substring(0, 40);
          const parts = line.split(' ');
          lineNumber = parseInt(parts[2], 10);
        } else if (line.startsWith('author ')) {
          currentAuthor = line.substring(7);
        } else if (line.startsWith('\t')) {
          blame.push({
            line: lineNumber,
            commit: currentCommit,
            author: currentAuthor,
          });
        }
      }
    } catch (error) {
      console.warn('Git blame failed:', error);
    }

    return blame;
  }

  /**
   * Update last known commit.
   */
  setLastCommit(commit: string): void {
    this.lastCommit = commit;
  }

  /**
   * Get last known commit.
   */
  getLastCommit(): string | null {
    return this.lastCommit;
  }

  /**
   * Check if a path should be excluded.
   */
  private isExcluded(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');

    for (const dir of this.config.excludeDirs) {
      if (normalized.includes(`/${dir}/`) || normalized.startsWith(`${dir}/`)) {
        return true;
      }
    }

    return false;
  }
}
