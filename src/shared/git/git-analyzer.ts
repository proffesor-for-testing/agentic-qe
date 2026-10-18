/**
 * Agentic QE v3 - Git Analyzer
 * Provides real git history analysis for defect prediction
 *
 * Features:
 * - File change frequency analysis
 * - Developer experience scoring based on git blame
 * - Code age calculation
 * - Bug history from commit messages
 */

import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import { assertSafeGitRef } from './ref-validation';

const execFileAsync = promisify(execFile);

/**
 * Sanitize a string for safe use in git arguments
 * Removes shell metacharacters that could enable injection
 */
function sanitizeGitArg(arg: string): string {
  // Remove characters that could be used for command injection
  return arg.replace(/[;&|`$(){}[\]<>\\'"!\n\r]/g, '');
}

/** A git `%at` epoch-seconds line as a Date, or null when it is not one. */
function timestampToDate(line: string | undefined): Date | null {
  const timestamp = parseInt(line ?? '', 10);
  return isNaN(timestamp) ? null : new Date(timestamp * 1000);
}

/**
 * Git commit information
 */
export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  filesChanged: string[];
}

/**
 * Git blame information for a file
 */
export interface GitBlameInfo {
  authors: Map<string, number>; // Author -> line count
  primaryAuthor: string;
  primaryAuthorPercentage: number;
  totalLines: number;
  mostRecentChange: Date;
  oldestChange: Date;
}

/**
 * File history analysis
 */
export interface FileHistory {
  filePath: string;
  totalCommits: number;
  uniqueAuthors: number;
  firstCommit: Date | null;
  lastCommit: Date | null;
  changeFrequency: number; // commits per month
  isRecentlyModified: boolean; // modified in last 7 days
  bugFixCommits: number; // commits containing "fix", "bug", "patch"
}

/**
 * Configuration for GitAnalyzer
 */
export interface GitAnalyzerConfig {
  /** Repository root path (default: process.cwd()) */
  repoRoot?: string;
  /** Maximum commits to analyze per file (default: 100) */
  maxCommits?: number;
  /** Bug keywords to search for in commit messages */
  bugKeywords?: string[];
  /** Enable caching of git results */
  enableCache?: boolean;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
  /** Per-call git timeout in milliseconds (default: 30 seconds) */
  gitTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<GitAnalyzerConfig> = {
  repoRoot: process.cwd(),
  maxCommits: 100,
  bugKeywords: ['fix', 'bug', 'patch', 'issue', 'error', 'defect', 'problem'],
  enableCache: true,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
  gitTimeoutMs: 30 * 1000,
};

/** Room for `git blame --line-porcelain` on large files. */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Git Analyzer for defect prediction metrics
 */
export class GitAnalyzer {
  private readonly config: Required<GitAnalyzerConfig>;
  private readonly cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private isGitRepo: boolean | null = null;

  constructor(config: GitAnalyzerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    if (this.isGitRepo !== null) return this.isGitRepo;

    try {
      await this.git(['rev-parse', '--is-inside-work-tree']);
      this.isGitRepo = true;
    } catch {
      this.isGitRepo = false;
    }
    return this.isGitRepo;
  }

  /**
   * Get file change frequency (commits in last 90 days / 3)
   * Returns normalized value 0-1
   */
  async getChangeFrequency(filePath: string): Promise<number> {
    const cacheKey = `freq:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    if (!(await this.isGitRepository())) {
      return 0.4; // Default when not in git repo
    }

    try {
      const relativePath = this.getRelativePath(filePath);
      // Literal pathspecs preserve route filenames such as app/[id].tsx.
      // execFile passes arguments directly without shell interpretation.
      const output = (await this.git(['--literal-pathspecs', 'log', '--oneline', '--since=90 days ago', '--', relativePath])).trim();

      const commits = output ? output.split('\n').length : 0;
      const frequency = Math.min(1, commits / 30); // Normalize: 30+ commits in 90 days = 1.0
      this.setCache(cacheKey, frequency);
      return frequency;
    } catch {
      return 0.4; // Default on error
    }
  }

  /**
   * Get developer experience score for a file based on git blame
   * Returns inverted score: high experience = low risk (0), low experience = high risk (1)
   */
  async getDeveloperExperience(filePath: string): Promise<number> {
    const cacheKey = `exp:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    if (!(await this.isGitRepository())) {
      return 0.5; // Default when not in git repo
    }

    try {
      const relativePath = this.getRelativePath(filePath);

      // Get blame info
      const blameOutput = await this.git(['--literal-pathspecs', 'blame', '--line-porcelain', '--', relativePath]);

      // Parse blame output - count authors manually instead of piping through shell
      const authorCounts = new Map<string, number>();
      const lines = blameOutput.split('\n');
      for (const line of lines) {
        if (line.startsWith('author ')) {
          const author = line.substring(7).trim();
          authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
        }
      }

      const totalLines = Array.from(authorCounts.values()).reduce((a, b) => a + b, 0);
      const uniqueAuthors = authorCounts.size;

      // Score based on code ownership concentration
      // High concentration by few authors = more experience = lower risk
      if (totalLines === 0) return 0.5;

      // More authors touching the file = higher risk (less concentrated ownership)
      const riskScore = Math.min(1, uniqueAuthors / 10);
      this.setCache(cacheKey, riskScore);
      return riskScore;
    } catch {
      return 0.5; // Default on error
    }
  }

  /**
   * Get code age - how old is the file
   * Returns risk score: very new (0.7), very old stable (0.3), middle-aged (0.4)
   */
  async getCodeAge(filePath: string): Promise<number> {
    const cacheKey = `age:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    if (!(await this.isGitRepository())) {
      return 0.4; // Default when not in git repo
    }

    try {
      const relativePath = this.getRelativePath(filePath);

      // First commit: the last line (oldest) of the commits that added the file
      const added = await this.gitLines(['--literal-pathspecs', 'log', '--format=%at', '--follow', '--diff-filter=A', '--', relativePath]);
      const firstCommitTimestamp = parseInt(added[added.length - 1] ?? '', 10);
      const [lastLine] = await this.gitLines(['--literal-pathspecs', 'log', '-1', '--format=%at', '--', relativePath]);
      const lastCommitTimestamp = parseInt(lastLine ?? '', 10);

      const now = Date.now() / 1000;

      if (isNaN(lastCommitTimestamp)) {
        return 0.4; // File not in git
      }

      const daysSinceLastChange = (now - lastCommitTimestamp) / (60 * 60 * 24);
      const totalAgeDays = isNaN(firstCommitTimestamp)
        ? daysSinceLastChange
        : (now - firstCommitTimestamp) / (60 * 60 * 24);

      let riskScore: number;
      if (daysSinceLastChange < 7) {
        riskScore = 0.7; // Very recently modified = higher risk
      } else if (totalAgeDays > 365 && daysSinceLastChange > 90) {
        riskScore = 0.3; // Old and stable = lower risk
      } else {
        riskScore = 0.4; // Middle-aged code
      }

      this.setCache(cacheKey, riskScore);
      return riskScore;
    } catch {
      return 0.4; // Default on error
    }
  }

  /**
   * Get bug history - how many bug fix commits have touched this file
   * Returns normalized score 0-1
   */
  async getBugHistory(filePath: string): Promise<number> {
    const cacheKey = `bugs:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    if (!(await this.isGitRepository())) {
      return 0.2; // Default when not in git repo
    }

    try {
      const relativePath = this.getRelativePath(filePath);

      const bugCommits = await this.countBugFixCommits(relativePath);
      const riskScore = Math.min(1, bugCommits / 10); // Normalize: 10+ bug fixes = 1.0
      this.setCache(cacheKey, riskScore);
      return riskScore;
    } catch {
      return 0.2; // Default on error
    }
  }

  /**
   * Get comprehensive file history analysis
   */
  async getFileHistory(filePath: string): Promise<FileHistory> {
    const cacheKey = `history:${filePath}`;
    const cached = this.getFromCache<FileHistory>(cacheKey);
    if (cached) return cached;

    if (!(await this.isGitRepository())) {
      return this.getDefaultFileHistory(filePath);
    }

    try {
      const relativePath = this.getRelativePath(filePath);

      // Each query yields no lines when the file is not in git
      const totalCommits = (await this.gitLines(['--literal-pathspecs', 'log', '--oneline', '--', relativePath])).length;
      // Parse authors here instead of piping through sort/wc
      const uniqueAuthors = new Set(await this.gitLines(['--literal-pathspecs', 'log', '--format=%ae', '--', relativePath])).size;
      const followed = await this.gitLines(['--literal-pathspecs', 'log', '--format=%at', '--follow', '--', relativePath]);
      const firstCommit = timestampToDate(followed[followed.length - 1]);
      const [lastLine] = await this.gitLines(['--literal-pathspecs', 'log', '-1', '--format=%at', '--', relativePath]);
      const lastCommit = timestampToDate(lastLine);

      // Calculate change frequency (commits per month)
      let changeFrequency = 0;
      if (firstCommit && lastCommit && totalCommits > 0) {
        const months = Math.max(
          1,
          (lastCommit.getTime() - firstCommit.getTime()) / (30 * 24 * 60 * 60 * 1000)
        );
        changeFrequency = totalCommits / months;
      }

      // Check if recently modified
      const isRecentlyModified = lastCommit
        ? Date.now() - lastCommit.getTime() < 7 * 24 * 60 * 60 * 1000
        : false;

      const bugFixCommits = await this.countBugFixCommits(relativePath);

      const history: FileHistory = {
        filePath: relativePath,
        totalCommits,
        uniqueAuthors,
        firstCommit,
        lastCommit,
        changeFrequency,
        isRecentlyModified,
        bugFixCommits,
      };

      this.setCache(cacheKey, history);
      return history;
    } catch {
      return this.getDefaultFileHistory(filePath);
    }
  }

  /**
   * Get files changed since a specific date
   * @param since - Date to check changes from (default: 24 hours ago)
   * @returns Array of changed file paths relative to repo root
   */
  async getChangedFiles(since?: Date): Promise<string[]> {
    if (!(await this.isGitRepository())) {
      return [];
    }

    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const files = await this.gitPaths(['log', `--since=${sinceDate.toISOString()}`, '--name-only', '-z', '--format=']);
    return Array.from(new Set(files));
  }

  /**
   * Get files changed in a specific commit
   * @param commitHash - Git revision (SHA, `HEAD~3`, `origin/main`, tag; default: HEAD)
   * @returns Array of changed file paths relative to repo root
   * @throws Error when `commitHash` is option-shaped (starts with "-") or otherwise
   *   not a safe revision argument; git would otherwise parse it as an option
   *   (e.g. `--output=<path>` writes an arbitrary file). See issue #960.
   */
  async getCommitFiles(commitHash: string = 'HEAD'): Promise<string[]> {
    // Validate before touching git: execFile has no shell, so stripping
    // metacharacters does not help, but a leading "-" is still parsed as an option.
    assertSafeGitRef(commitHash, 'commit hash');

    if (!(await this.isGitRepository())) {
      return [];
    }

    return this.gitPaths(['diff-tree', '--root', '--no-commit-id', '--name-only', '-z', '-r', commitHash]);
  }

  /**
   * Get files with uncommitted changes (staged + unstaged)
   * @returns Array of modified file paths relative to repo root
   */
  async getUncommittedFiles(): Promise<string[]> {
    if (!(await this.isGitRepository())) {
      return [];
    }

    // `diff HEAD` fails before the first commit; `--cached` still lists staged files.
    const unstaged = await this.gitPaths(['diff', '--name-only', '-z', 'HEAD']);
    const staged = await this.gitPaths(['diff', '--name-only', '-z', '--cached']);
    return Array.from(new Set([...unstaged, ...staged]));
  }

  /**
   * Count unique commits whose message matches a bug keyword. Each keyword is
   * searched separately so keywords from config never reach a shell.
   */
  private async countBugFixCommits(relativePath: string): Promise<number> {
    const seen = new Set<string>();
    for (const keyword of this.config.bugKeywords) {
      const lines = await this.gitLines([
        '--literal-pathspecs', 'log', '--oneline', '--grep', sanitizeGitArg(keyword), '-i', '--', relativePath,
      ]);
      for (const line of lines) {
        const hash = line.split(' ')[0];
        if (hash) seen.add(hash);
      }
    }
    return seen.size;
  }

  /**
   * Run git asynchronously in the repo root (#1115). A slow or hung git (a
   * network filesystem, a credential prompt) must not block the event loop
   * of the MCP server, so this never uses the synchronous child-process API
   * and every call is bounded by `gitTimeoutMs`.
   */
  private async git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.config.repoRoot,
      encoding: 'utf-8',
      timeout: this.config.gitTimeoutMs,
      maxBuffer: GIT_MAX_BUFFER,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout;
  }

  /** Non-empty output lines of a git query, or none when git fails. */
  private async gitLines(args: string[]): Promise<string[]> {
    try {
      return (await this.git(args)).split('\n').map((line) => line.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Paths from a `-z` git query, or none when git fails. NUL records preserve
   * whitespace, newlines and Git-quoted Unicode paths.
   */
  private async gitPaths(args: string[]): Promise<string[]> {
    try {
      return (await this.git(args)).split('\0').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get relative path from repo root
   */
  private getRelativePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.relative(this.config.repoRoot, filePath);
    }
    return filePath;
  }

  /**
   * Get cached value
   */
  private getFromCache<T>(key: string): T | undefined {
    if (!this.config.enableCache) return undefined;

    const cached = this.cache.get(key);
    if (!cached) return undefined;

    if (Date.now() - cached.timestamp > this.config.cacheTtl) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.data as T;
  }

  /**
   * Set cache value
   */
  private setCache<T>(key: string, data: T): void {
    if (!this.config.enableCache) return;
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Get default file history for non-git repos
   */
  private getDefaultFileHistory(filePath: string): FileHistory {
    return {
      filePath,
      totalCommits: 0,
      uniqueAuthors: 0,
      firstCommit: null,
      lastCommit: null,
      changeFrequency: 0,
      isRecentlyModified: false,
      bugFixCommits: 0,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
