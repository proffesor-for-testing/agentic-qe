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

import * as path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { assertSafeGitRef } from './ref-validation';
import { GitTimeoutError, runGit } from './git-process.js';

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
  /** Deadline in milliseconds shared by the git calls of one analysis (default: 30 seconds) */
  gitTimeoutMs?: number;
  /** Deadline in milliseconds for all analyses of one file inside withFileDeadline() (default: 60 seconds) */
  fileTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<GitAnalyzerConfig> = {
  repoRoot: process.cwd(),
  maxCommits: 100,
  bugKeywords: ['fix', 'bug', 'patch', 'issue', 'error', 'defect', 'problem'],
  enableCache: true,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
  gitTimeoutMs: 30 * 1000,
  fileTimeoutMs: 60 * 1000,
};

/** Room for `git blame --line-porcelain` on large files (execFileSync allowed 1 MiB). */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Git queries that share one deadline. A timeout, an output overflow or a
 * non-zero exit rejects; none of them reads as "no history" (#1115, #1165).
 */
interface GitQuery {
  text(args: string[]): Promise<string>;
  /** Non-empty output lines. */
  lines(args: string[]): Promise<string[]>;
  /** Paths from a `-z` query; NUL records preserve whitespace, newlines and quoted Unicode. */
  paths(args: string[]): Promise<string[]>;
}

/** One withFileDeadline() call: its deadline, and whether git left its data incomplete. */
interface FileScope {
  filePath: string;
  deadline: number;
  incomplete: boolean;
}

/** Git had an answer that was not read: it timed out or overflowed the output limit. */
function isIncompleteRead(error: unknown): boolean {
  return error instanceof GitTimeoutError || (error as NodeJS.ErrnoException)?.code === 'ENOBUFS';
}

/**
 * Git Analyzer for defect prediction metrics
 */
export class GitAnalyzer {
  private readonly config: Required<GitAnalyzerConfig>;
  private readonly cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private isGitRepo: boolean | null = null;
  /** After a rev-parse timeout, when to ask git again (until then: "timeout"). */
  private repoRetryAt = 0;
  /** Files whose git data came back incomplete outside any withFileDeadline() call. */
  private readonly timedOutFiles = new Set<string>();
  /** The withFileDeadline() call each async context runs in, so concurrent calls on one file stay apart (#1165). */
  private readonly fileScopes = new AsyncLocalStorage<FileScope>();

  constructor(config: GitAnalyzerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if current directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    return (await this.repoState()) === true;
  }

  /**
   * True when git timed out, or its output overflowed, while analysing
   * `filePath` since the last call, so the analysis returned its "git
   * unavailable" default rather than a result. Inside withFileDeadline() it
   * reports only that call's analyses, not another caller's on the same file (#1165).
   */
  consumeTimeout(filePath: string): boolean {
    const scope = this.scopeFor(filePath);
    if (!scope) return this.timedOutFiles.delete(filePath);
    const incomplete = scope.incomplete;
    scope.incomplete = false;
    return incomplete;
  }

  /**
   * Run `work`, during which every analysis of `filePath` also stops at one
   * shared `fileTimeoutMs` deadline. One file's analyses then wait for git at
   * most that long together, rather than `gitTimeoutMs` each (#1115). Each
   * call has its own deadline and timeout flag, even when calls on the same
   * file overlap (#1165); call consumeTimeout() inside `work` to read the flag.
   */
  async withFileDeadline<T>(filePath: string, work: () => Promise<T>): Promise<T> {
    if (this.scopeFor(filePath)) return work();
    const scope: FileScope = { filePath, deadline: Date.now() + this.config.fileTimeoutMs, incomplete: false };
    return this.fileScopes.run(scope, work);
  }

  /**
   * Get file change frequency (commits in last 90 days / 3)
   * Returns normalized value 0-1
   */
  async getChangeFrequency(filePath: string): Promise<number> {
    const cacheKey = `freq:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    return this.analyze(filePath, 0.4, {}, async (git, relativePath) => {
      // Literal pathspecs preserve route filenames such as app/[id].tsx.
      // Arguments go to git directly, without shell interpretation.
      const output = (await git.text(['--literal-pathspecs', 'log', '--oneline', '--since=90 days ago', '--', relativePath])).trim();

      const commits = output ? output.split('\n').length : 0;
      const frequency = Math.min(1, commits / 30); // Normalize: 30+ commits in 90 days = 1.0
      this.setCache(cacheKey, frequency);
      return frequency;
    });
  }

  /**
   * Get developer experience score for a file based on git blame
   * Returns inverted score: high experience = low risk (0), low experience = high risk (1)
   */
  async getDeveloperExperience(filePath: string): Promise<number> {
    const cacheKey = `exp:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    return this.analyze(filePath, 0.5, {}, async (git, relativePath) => {
      const blameOutput = await git.text(['--literal-pathspecs', 'blame', '--line-porcelain', '--', relativePath]);

      // Parse blame output - count authors manually instead of piping through shell
      const authorCounts = new Map<string, number>();
      for (const line of blameOutput.split('\n')) {
        if (line.startsWith('author ')) {
          const author = line.substring(7).trim();
          authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
        }
      }

      const totalLines = Array.from(authorCounts.values()).reduce((a, b) => a + b, 0);
      if (totalLines === 0) return 0.5;

      // More authors touching the file = higher risk (less concentrated ownership)
      const riskScore = Math.min(1, authorCounts.size / 10);
      this.setCache(cacheKey, riskScore);
      return riskScore;
    });
  }

  /**
   * Get code age - how old is the file
   * Returns risk score: very new (0.7), very old stable (0.3), middle-aged (0.4)
   */
  async getCodeAge(filePath: string): Promise<number> {
    const cacheKey = `age:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    return this.analyze(filePath, 0.4, {}, async (git, relativePath) => {
      // First commit: the last line (oldest) of the commits that added the file
      const added = await git.lines(['--literal-pathspecs', 'log', '--format=%at', '--follow', '--diff-filter=A', '--', relativePath]);
      const firstCommitTimestamp = parseInt(added[added.length - 1] ?? '', 10);
      const [lastLine] = await git.lines(['--literal-pathspecs', 'log', '-1', '--format=%at', '--', relativePath]);
      const lastCommitTimestamp = parseInt(lastLine ?? '', 10);

      if (isNaN(lastCommitTimestamp)) {
        return 0.4; // File not in git
      }

      const now = Date.now() / 1000;
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
    });
  }

  /**
   * Get bug history - how many bug fix commits have touched this file
   * Returns normalized score 0-1
   */
  async getBugHistory(filePath: string): Promise<number> {
    const cacheKey = `bugs:${filePath}`;
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== undefined) return cached;

    return this.analyze(filePath, 0.2, {}, async (git, relativePath) => {
      const bugCommits = await this.countBugFixCommits(git, relativePath);
      const riskScore = Math.min(1, bugCommits / 10); // Normalize: 10+ bug fixes = 1.0
      this.setCache(cacheKey, riskScore);
      return riskScore;
    });
  }

  /**
   * Get comprehensive file history analysis
   * @throws GitTimeoutError when git does not answer within `gitTimeoutMs`, and
   *   an ENOBUFS error when its output overflows; zero history would be a false answer (#1165)
   */
  async getFileHistory(filePath: string): Promise<FileHistory> {
    const cacheKey = `history:${filePath}`;
    const cached = this.getFromCache<FileHistory>(cacheKey);
    if (cached) return cached;

    return this.analyze(filePath, this.getDefaultFileHistory(filePath), { strict: true }, async (git, relativePath) => {
      // `git log` yields no lines when the file is not in git
      const totalCommits = (await git.lines(['--literal-pathspecs', 'log', '--oneline', '--', relativePath])).length;
      // Parse authors here instead of piping through sort/wc
      const uniqueAuthors = new Set(await git.lines(['--literal-pathspecs', 'log', '--format=%ae', '--', relativePath])).size;
      const followed = await git.lines(['--literal-pathspecs', 'log', '--format=%at', '--follow', '--', relativePath]);
      const firstCommit = timestampToDate(followed[followed.length - 1]);
      const [lastLine] = await git.lines(['--literal-pathspecs', 'log', '-1', '--format=%at', '--', relativePath]);
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

      const history: FileHistory = {
        filePath: relativePath,
        totalCommits,
        uniqueAuthors,
        firstCommit,
        lastCommit,
        changeFrequency,
        isRecentlyModified,
        bugFixCommits: await this.countBugFixCommits(git, relativePath),
      };

      this.setCache(cacheKey, history);
      return history;
    });
  }

  /**
   * Get files changed since a specific date
   * @param since - Date to check changes from (default: 24 hours ago)
   * @returns Array of changed file paths relative to repo root
   * @throws GitTimeoutError when git does not answer within `gitTimeoutMs`, and
   *   an Error when git fails; neither means "no changes" (#1165)
   */
  async getChangedFiles(since?: Date): Promise<string[]> {
    if (!(await this.isGitRepository())) {
      return [];
    }

    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const git = this.query();
    const files = await this.unlessUnborn(git, git.paths(['log', `--since=${sinceDate.toISOString()}`, '--name-only', '-z', '--format=']));
    return Array.from(new Set(files));
  }

  /**
   * Get files changed in a specific commit
   * @param commitHash - Git revision (SHA, `HEAD~3`, `origin/main`, tag; default: HEAD)
   * @returns Array of changed file paths relative to repo root
   * @throws Error when `commitHash` is option-shaped (starts with "-") or otherwise
   *   not a safe revision argument; git would otherwise parse it as an option
   *   (e.g. `--output=<path>` writes an arbitrary file). See issue #960.
   * @throws GitTimeoutError when git does not answer within `gitTimeoutMs`, and
   *   an Error when git fails, e.g. on an unknown revision (#1165)
   */
  async getCommitFiles(commitHash: string = 'HEAD'): Promise<string[]> {
    // Validate before touching git: there is no shell, so stripping
    // metacharacters does not help, but a leading "-" is still parsed as an option.
    assertSafeGitRef(commitHash, 'commit hash');

    if (!(await this.isGitRepository())) {
      return [];
    }

    return this.query().paths(['diff-tree', '--root', '--no-commit-id', '--name-only', '-z', '-r', commitHash]);
  }

  /**
   * Get files with uncommitted changes (staged + unstaged)
   * @returns Array of modified file paths relative to repo root
   * @throws GitTimeoutError when git does not answer within `gitTimeoutMs`, and
   *   an Error when git fails (#1165)
   */
  async getUncommittedFiles(): Promise<string[]> {
    if (!(await this.isGitRepository())) {
      return [];
    }

    // `diff HEAD` fails before the first commit; `--cached` still lists staged files.
    const git = this.query();
    const unstaged = await this.unlessUnborn(git, git.paths(['diff', '--name-only', '-z', 'HEAD']));
    const staged = await git.paths(['diff', '--name-only', '-z', '--cached']);
    return Array.from(new Set([...unstaged, ...staged]));
  }

  /**
   * Count commits whose message matches any bug keyword, in one `git log`
   * (repeated --grep patterns are OR-ed). Keywords are sanitized arguments and
   * never reach a shell.
   */
  private async countBugFixCommits(git: GitQuery, relativePath: string): Promise<number> {
    if (this.config.bugKeywords.length === 0) return 0;
    const greps = this.config.bugKeywords.flatMap((keyword) => ['--grep', sanitizeGitArg(keyword)]);
    const lines = await git.lines(['--literal-pathspecs', 'log', '--oneline', '-i', ...greps, '--', relativePath]);
    return new Set(lines.map((line) => line.split(' ')[0]).filter(Boolean)).size;
  }

  /**
   * `query`'s paths, or none when the repository has no commit yet, which
   * `git log` and `git diff HEAD` report as an error.
   */
  private async unlessUnborn(git: GitQuery, query: Promise<string[]>): Promise<string[]> {
    try {
      return await query;
    } catch (error) {
      if (error instanceof GitTimeoutError) throw error;
      try {
        await git.text(['rev-parse', '--verify', '-q', 'HEAD']);
      } catch (headError) {
        if (headError instanceof GitTimeoutError) throw headError;
        return [];
      }
      throw error;
    }
  }

  /**
   * Run one file's analysis with every git call sharing one `gitTimeoutMs`
   * deadline (#1115). When git is unavailable or fails, the analysis returns
   * its default, which callers treat as "no git data", never a measured 0
   * (#1165). A timeout or an output overflow is recorded for consumeTimeout(),
   * or, with `strict`, rejects.
   */
  private async analyze<T>(
    filePath: string,
    fallback: T,
    options: { strict?: boolean },
    work: (git: GitQuery, relativePath: string) => Promise<T>,
  ): Promise<T> {
    const scope = this.scopeFor(filePath);
    const repo = await this.repoState();
    if (repo === 'timeout') {
      if (options.strict) throw new GitTimeoutError(['rev-parse', '--is-inside-work-tree'], this.config.gitTimeoutMs);
      this.markIncomplete(filePath, scope);
    }
    if (repo !== true) return fallback;
    try {
      return await work(this.query(scope?.deadline), this.getRelativePath(filePath));
    } catch (error) {
      // Any other failure is git's answer for this file, e.g. `blame` of an untracked file.
      if (!isIncompleteRead(error)) return fallback;
      if (options.strict) throw error;
      this.markIncomplete(filePath, scope);
      return fallback;
    }
  }

  /** The withFileDeadline() call on `filePath` that the current async context runs in. */
  private scopeFor(filePath: string): FileScope | undefined {
    const scope = this.fileScopes.getStore();
    return scope?.filePath === filePath ? scope : undefined;
  }

  private markIncomplete(filePath: string, scope: FileScope | undefined): void {
    if (scope) scope.incomplete = true;
    else this.timedOutFiles.add(filePath);
  }

  /**
   * Whether the repo root is a git work tree. A timeout is not an answer: it
   * is remembered for `cacheTtl` so a hung git is not waited on for every
   * file, and then git is asked again.
   */
  private async repoState(): Promise<boolean | 'timeout'> {
    if (this.isGitRepo !== null) return this.isGitRepo;
    if (Date.now() < this.repoRetryAt) return 'timeout';
    try {
      await this.query().text(['rev-parse', '--is-inside-work-tree']);
      this.isGitRepo = true;
    } catch (error) {
      if (error instanceof GitTimeoutError) {
        this.repoRetryAt = Date.now() + this.config.cacheTtl;
        return 'timeout';
      }
      this.isGitRepo = false;
    }
    return this.isGitRepo;
  }

  /**
   * Git queries in the repo root that share a deadline of `gitTimeoutMs` from
   * now, or `fileDeadline` when that comes first. Git runs asynchronously in its own process group, so a slow or hung
   * git (a network filesystem, a credential prompt) neither blocks the MCP
   * server's event loop nor outlives its deadline (#1115).
   */
  private query(fileDeadline = Infinity): GitQuery {
    const deadline = Math.min(Date.now() + this.config.gitTimeoutMs, fileDeadline);
    const text = (args: string[]) => runGit(args, {
      cwd: this.config.repoRoot, timeout: deadline - Date.now(), maxBuffer: GIT_MAX_BUFFER,
    });
    return {
      text,
      lines: async (args) => (await text(args)).split('\n').map((line) => line.trim()).filter(Boolean),
      paths: async (args) => (await text(args)).split('\0').filter(Boolean),
    };
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
