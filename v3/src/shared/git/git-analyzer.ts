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

import { execSync } from 'child_process';
import * as path from 'path';

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
      execSync('git rev-parse --is-inside-work-tree', {
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
      const relativePath = this.getRelativePath(filePath);
      const output = execSync(
        `git log --oneline --since="90 days ago" -- "${relativePath}" 2>/dev/null | wc -l`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();

      const commits = parseInt(output, 10) || 0;
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
      const blameOutput = execSync(
        `git blame --line-porcelain "${relativePath}" 2>/dev/null | grep "^author " | sort | uniq -c`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      );

      // Parse blame output
      const authorLines = blameOutput.trim().split('\n').filter(Boolean);
      const totalLines = authorLines.reduce((sum, line) => {
        const count = parseInt(line.trim().split(/\s+/)[0], 10);
        return sum + (isNaN(count) ? 0 : count);
      }, 0);

      // Get unique authors
      const uniqueAuthors = authorLines.length;

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

      // Get first and last commit dates
      const firstCommitOutput = execSync(
        `git log --format="%at" --follow --diff-filter=A -- "${relativePath}" 2>/dev/null | tail -1`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();

      const lastCommitOutput = execSync(
        `git log -1 --format="%at" -- "${relativePath}" 2>/dev/null`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();

      const now = Date.now() / 1000;
      const firstCommitTimestamp = parseInt(firstCommitOutput, 10);
      const lastCommitTimestamp = parseInt(lastCommitOutput, 10);

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
      const keywords = this.config.bugKeywords.join('|');

      const output = execSync(
        `git log --oneline --grep="${keywords}" -i -- "${relativePath}" 2>/dev/null | wc -l`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();

      const bugCommits = parseInt(output, 10) || 0;
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

      // Get commit count
      const commitCountOutput = execSync(
        `git log --oneline -- "${relativePath}" 2>/dev/null | wc -l`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();
      const totalCommits = parseInt(commitCountOutput, 10) || 0;

      // Get unique authors
      const authorsOutput = execSync(
        `git log --format="%ae" -- "${relativePath}" 2>/dev/null | sort -u | wc -l`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();
      const uniqueAuthors = parseInt(authorsOutput, 10) || 0;

      // Get first commit date
      const firstCommitOutput = execSync(
        `git log --format="%at" --follow -- "${relativePath}" 2>/dev/null | tail -1`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();
      const firstCommit = firstCommitOutput
        ? new Date(parseInt(firstCommitOutput, 10) * 1000)
        : null;

      // Get last commit date
      const lastCommitOutput = execSync(
        `git log -1 --format="%at" -- "${relativePath}" 2>/dev/null`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();
      const lastCommit = lastCommitOutput
        ? new Date(parseInt(lastCommitOutput, 10) * 1000)
        : null;

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

      // Count bug fix commits
      const bugKeywords = this.config.bugKeywords.join('|');
      const bugFixOutput = execSync(
        `git log --oneline --grep="${bugKeywords}" -i -- "${relativePath}" 2>/dev/null | wc -l`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();
      const bugFixCommits = parseInt(bugFixOutput, 10) || 0;

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

      // Get files changed since the date
      const output = execSync(
        `git log --since="${sinceStr}" --name-only --pretty=format: 2>/dev/null | sort -u | grep -v '^$'`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();

      if (!output) return [];

      return output.split('\n').filter(Boolean);
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
      const output = execSync(
        `git diff-tree --no-commit-id --name-only -r ${commitHash} 2>/dev/null`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();

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
      // Get both staged and unstaged changes
      const output = execSync(
        `git diff --name-only HEAD 2>/dev/null && git diff --name-only --cached 2>/dev/null`,
        {
          cwd: this.config.repoRoot,
          encoding: 'utf-8',
        }
      ).trim();

      if (!output) return [];

      // Deduplicate
      const files = output.split('\n').filter(Boolean);
      return [...new Set(files)];
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
