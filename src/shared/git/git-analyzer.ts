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

import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Sanitize a string for safe use in git arguments
 * Removes shell metacharacters that could enable injection
 */
function sanitizeGitArg(arg: string): string {
  // Remove characters that could be used for command injection
  return arg.replace(/[;&|`$(){}[\]<>\\'"!\n\r]/g, '');
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
}

const DEFAULT_CONFIG: Required<GitAnalyzerConfig> = {
  repoRoot: process.cwd(),
  maxCommits: 100,
  bugKeywords: ['fix', 'bug', 'patch', 'issue', 'error', 'defect', 'problem'],
  enableCache: true,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
};

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
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: this.config.repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
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
      const relativePath = sanitizeGitArg(this.getRelativePath(filePath));
      // Use execFileSync with argument array to prevent injection
      const output = execFileSync('git', [
        'log', '--oneline', '--since=90 days ago', '--', relativePath
      ], {
        cwd: this.config.repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

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
      const relativePath = sanitizeGitArg(this.getRelativePath(filePath));

      // Get blame info using execFileSync with argument array
      const blameOutput = execFileSync('git', [
        'blame', '--line-porcelain', '--', relativePath
      ], {
        cwd: this.config.repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

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
      const relativePath = sanitizeGitArg(this.getRelativePath(filePath));

      // Get first commit date using execFileSync with argument array
      let firstCommitTimestamp: number = NaN;
      try {
        const firstCommitOutput = execFileSync('git', [
          'log', '--format=%at', '--follow', '--diff-filter=A', '--', relativePath
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        // Get last line (oldest commit)
        const lines = firstCommitOutput.split('\n').filter(Boolean);
        if (lines.length > 0) {
          firstCommitTimestamp = parseInt(lines[lines.length - 1], 10);
        }
      } catch {
        // File may not have been added yet
      }

      // Get last commit date using execFileSync with argument array
      let lastCommitTimestamp: number = NaN;
      try {
        const lastCommitOutput = execFileSync('git', [
          'log', '-1', '--format=%at', '--', relativePath
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        lastCommitTimestamp = parseInt(lastCommitOutput, 10);
      } catch {
        // File may not be in git
      }

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
      const relativePath = sanitizeGitArg(this.getRelativePath(filePath));

      // Search for each keyword separately and count unique commits
      // This avoids shell injection from keywords config
      let bugCommits = 0;
      const seenCommits = new Set<string>();

      for (const keyword of this.config.bugKeywords) {
        const sanitizedKeyword = sanitizeGitArg(keyword);
        try {
          const output = execFileSync('git', [
            'log', '--oneline', '--grep', sanitizedKeyword, '-i', '--', relativePath
          ], {
            cwd: this.config.repoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();

          if (output) {
            // Track unique commit hashes to avoid double-counting
            const lines = output.split('\n');
            for (const line of lines) {
              const hash = line.split(' ')[0];
              if (hash && !seenCommits.has(hash)) {
                seenCommits.add(hash);
                bugCommits++;
              }
            }
          }
        } catch {
          // Keyword search failed, continue with next
        }
      }

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
      const relativePath = sanitizeGitArg(this.getRelativePath(filePath));

      // Get commit count using execFileSync with argument array
      let totalCommits = 0;
      try {
        const commitCountOutput = execFileSync('git', [
          'log', '--oneline', '--', relativePath
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        totalCommits = commitCountOutput ? commitCountOutput.split('\n').length : 0;
      } catch {
        // File may not be in git
      }

      // Get unique authors - parse output manually instead of piping through sort/wc
      let uniqueAuthors = 0;
      try {
        const authorsOutput = execFileSync('git', [
          'log', '--format=%ae', '--', relativePath
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (authorsOutput) {
          const authorSet = new Set(authorsOutput.split('\n').filter(Boolean));
          uniqueAuthors = authorSet.size;
        }
      } catch {
        // File may not be in git
      }

      // Get first commit date
      let firstCommit: Date | null = null;
      try {
        const firstCommitOutput = execFileSync('git', [
          'log', '--format=%at', '--follow', '--', relativePath
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (firstCommitOutput) {
          const lines = firstCommitOutput.split('\n').filter(Boolean);
          if (lines.length > 0) {
            const timestamp = parseInt(lines[lines.length - 1], 10);
            if (!isNaN(timestamp)) {
              firstCommit = new Date(timestamp * 1000);
            }
          }
        }
      } catch {
        // File may not be in git
      }

      // Get last commit date
      let lastCommit: Date | null = null;
      try {
        const lastCommitOutput = execFileSync('git', [
          'log', '-1', '--format=%at', '--', relativePath
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (lastCommitOutput) {
          const timestamp = parseInt(lastCommitOutput, 10);
          if (!isNaN(timestamp)) {
            lastCommit = new Date(timestamp * 1000);
          }
        }
      } catch {
        // File may not be in git
      }

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

      // Count bug fix commits - search each keyword separately to avoid injection
      let bugFixCommits = 0;
      const seenBugCommits = new Set<string>();
      for (const keyword of this.config.bugKeywords) {
        const sanitizedKeyword = sanitizeGitArg(keyword);
        try {
          const bugFixOutput = execFileSync('git', [
            'log', '--oneline', '--grep', sanitizedKeyword, '-i', '--', relativePath
          ], {
            cwd: this.config.repoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();
          if (bugFixOutput) {
            const lines = bugFixOutput.split('\n');
            for (const line of lines) {
              const hash = line.split(' ')[0];
              if (hash && !seenBugCommits.has(hash)) {
                seenBugCommits.add(hash);
                bugFixCommits++;
              }
            }
          }
        } catch {
          // Keyword search failed, continue with next
        }
      }

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

    try {
      const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sinceStr = sinceDate.toISOString().split('T')[0];

      // Get files changed since the date using execFileSync with argument array
      const output = execFileSync('git', [
        'log', `--since=${sinceStr}`, '--name-only', '--pretty=format:'
      ], {
        cwd: this.config.repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!output) return [];

      // Deduplicate and filter empty lines manually (instead of sort -u | grep -v)
      const files = output.split('\n').filter(Boolean);
      return Array.from(new Set(files));
    } catch {
      return [];
    }
  }

  /**
   * Get files changed in a specific commit
   * @param commitHash - Git commit hash (default: HEAD)
   * @returns Array of changed file paths relative to repo root
   */
  async getCommitFiles(commitHash: string = 'HEAD'): Promise<string[]> {
    if (!(await this.isGitRepository())) {
      return [];
    }

    try {
      // Sanitize commit hash to prevent injection
      const sanitizedHash = sanitizeGitArg(commitHash);

      const output = execFileSync('git', [
        'diff-tree', '--no-commit-id', '--name-only', '-r', sanitizedHash
      ], {
        cwd: this.config.repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (!output) return [];

      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get files with uncommitted changes (staged + unstaged)
   * @returns Array of modified file paths relative to repo root
   */
  async getUncommittedFiles(): Promise<string[]> {
    if (!(await this.isGitRepository())) {
      return [];
    }

    try {
      const files: string[] = [];

      // Get unstaged changes using execFileSync with argument array
      try {
        const unstagedOutput = execFileSync('git', [
          'diff', '--name-only', 'HEAD'
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (unstagedOutput) {
          files.push(...unstagedOutput.split('\n').filter(Boolean));
        }
      } catch {
        // May fail if no HEAD commit exists
      }

      // Get staged changes using execFileSync with argument array
      try {
        const stagedOutput = execFileSync('git', [
          'diff', '--name-only', '--cached'
        ], {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (stagedOutput) {
          files.push(...stagedOutput.split('\n').filter(Boolean));
        }
      } catch {
        // May fail if no commits exist
      }

      // Deduplicate
      return Array.from(new Set(files));
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
