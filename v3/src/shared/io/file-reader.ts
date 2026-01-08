/**
 * Agentic QE v3 - File Reader Module
 * Safe async file reading with caching and Result pattern
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Result, ok, err } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface FileReaderOptions {
  /** Base path for resolving relative paths */
  basePath?: string;
  /** Maximum cache size (number of entries) */
  maxCacheSize?: number;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;
  /** Whether to enable caching (default: true) */
  enableCache?: boolean;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  size: number;
}

export interface FileReaderStats {
  cacheHits: number;
  cacheMisses: number;
  totalReads: number;
  cacheSize: number;
  cacheEntries: number;
}

export class FileReadError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FileReadError';
  }
}

export class JsonParseError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'JsonParseError';
  }
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number
  ) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return undefined;
    }

    // Update access order (move to end)
    this.updateAccessOrder(key);
    return entry.value;
  }

  set(key: string, value: T, size: number): void {
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict oldest entries if needed
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      size,
    });
    this.accessOrder.push(key);
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  get totalBytes(): number {
    let total = 0;
    this.cache.forEach((entry) => {
      total += entry.size;
    });
    return total;
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }

  /** Remove expired entries */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    const keysToDelete: string[] = [];
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.ttlMs) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => {
      this.delete(key);
      pruned++;
    });
    return pruned;
  }
}

// ============================================================================
// Simple Glob Pattern Matcher
// ============================================================================

function globToRegex(pattern: string): RegExp {
  // Build regex by processing pattern character by character
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];
    const next = pattern[i + 1];

    if (char === '*' && next === '*') {
      // ** matches any path component(s)
      if (pattern[i + 2] === '/') {
        // **/ at start or middle: match zero or more directories
        regex += '(?:.*/)?';
        i += 3;
      } else {
        // ** at end or standalone: match everything
        regex += '.*';
        i += 2;
      }
    } else if (char === '*') {
      // * matches any characters except /
      regex += '[^/]*';
      i++;
    } else if (char === '?') {
      // ? matches single character except /
      regex += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(char)) {
      // Escape special regex characters
      regex += '\\' + char;
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp('^' + regex + '$');
}

async function walkDirectory(
  dir: string,
  pattern: RegExp,
  results: string[],
  basePath: string
): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          await walkDirectory(fullPath, pattern, results, basePath);
        }
      } else if (entry.isFile()) {
        // Normalize path separators for pattern matching
        const normalizedPath = relativePath.replace(/\\/g, '/');
        if (pattern.test(normalizedPath)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Ignore directories we can't read (permissions, etc.)
  }
}

// ============================================================================
// FileReader Class
// ============================================================================

export class FileReader {
  private readonly basePath: string;
  private readonly cache: LRUCache<string>;
  private readonly enableCache: boolean;
  private stats: FileReaderStats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalReads: 0,
    cacheSize: 0,
    cacheEntries: 0,
  };

  constructor(options: FileReaderOptions = {}) {
    this.basePath = options.basePath ?? process.cwd();
    this.enableCache = options.enableCache ?? true;
    this.cache = new LRUCache<string>(
      options.maxCacheSize ?? 100,
      options.cacheTtlMs ?? 5 * 60 * 1000 // 5 minutes default
    );
  }

  /**
   * Resolves a path to an absolute path
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.basePath, filePath);
  }

  /**
   * Read file contents as a string
   */
  async readFile(filePath: string): Promise<Result<string, FileReadError>> {
    const absolutePath = this.resolvePath(filePath);
    this.stats.totalReads++;

    // Check cache first
    if (this.enableCache) {
      const cached = this.cache.get(absolutePath);
      if (cached !== undefined) {
        this.stats.cacheHits++;
        this.updateCacheStats();
        return ok(cached);
      }
      this.stats.cacheMisses++;
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');

      // Cache the result
      if (this.enableCache) {
        this.cache.set(absolutePath, content, Buffer.byteLength(content, 'utf-8'));
        this.updateCacheStats();
      }

      return ok(content);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      let message: string;

      switch (nodeError.code) {
        case 'ENOENT':
          message = 'File not found: ' + absolutePath;
          break;
        case 'EACCES':
          message = 'Permission denied: ' + absolutePath;
          break;
        case 'EISDIR':
          message = 'Path is a directory: ' + absolutePath;
          break;
        default:
          message = 'Failed to read file: ' + absolutePath;
      }

      return err(new FileReadError(message, absolutePath, nodeError.code, nodeError));
    }
  }

  /**
   * Read and parse a JSON file
   */
  async readJSON<T>(filePath: string): Promise<Result<T, FileReadError | JsonParseError>> {
    const absolutePath = this.resolvePath(filePath);
    const readResult = await this.readFile(absolutePath);

    if (!readResult.success) {
      return readResult as Result<T, FileReadError>;
    }

    try {
      const parsed = JSON.parse(readResult.value) as T;
      return ok(parsed);
    } catch (error) {
      const parseError = error as SyntaxError;
      return err(
        new JsonParseError(
          'Invalid JSON in file: ' + absolutePath + ' - ' + parseError.message,
          absolutePath,
          parseError
        )
      );
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<Result<boolean, FileReadError>> {
    const absolutePath = this.resolvePath(filePath);

    try {
      await fs.access(absolutePath, fs.constants.F_OK);
      return ok(true);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === 'ENOENT') {
        return ok(false);
      }

      // Other errors (permissions, etc.) are actual errors
      return err(
        new FileReadError(
          'Cannot check file existence: ' + absolutePath,
          absolutePath,
          nodeError.code,
          nodeError
        )
      );
    }
  }

  /**
   * List files matching a glob pattern
   */
  async listFiles(
    pattern: string,
    basePath?: string
  ): Promise<Result<string[], FileReadError>> {
    const searchBase = basePath ? this.resolvePath(basePath) : this.basePath;

    try {
      // Verify base path exists and is a directory
      const stats = await fs.stat(searchBase);
      if (!stats.isDirectory()) {
        return err(
          new FileReadError(
            'Base path is not a directory: ' + searchBase,
            searchBase,
            'ENOTDIR'
          )
        );
      }

      const regex = globToRegex(pattern);
      const results: string[] = [];

      await walkDirectory(searchBase, regex, results, searchBase);

      // Sort by path for consistent ordering
      results.sort();

      return ok(results);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      return err(
        new FileReadError(
          'Failed to list files in: ' + searchBase,
          searchBase,
          nodeError.code,
          nodeError
        )
      );
    }
  }

  /**
   * Invalidate cache for a specific file
   */
  invalidateCache(filePath: string): void {
    const absolutePath = this.resolvePath(filePath);
    this.cache.delete(absolutePath);
    this.updateCacheStats();
  }

  /**
   * Clear all cached files
   */
  clearCache(): void {
    this.cache.clear();
    this.updateCacheStats();
  }

  /**
   * Remove expired entries from cache
   */
  pruneCache(): number {
    const pruned = this.cache.prune();
    this.updateCacheStats();
    return pruned;
  }

  /**
   * Get file reader statistics
   */
  getStats(): FileReaderStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      totalReads: 0,
      cacheSize: this.cache.totalBytes,
      cacheEntries: this.cache.size,
    };
  }

  private updateCacheStats(): void {
    this.stats.cacheSize = this.cache.totalBytes;
    this.stats.cacheEntries = this.cache.size;
  }
}

// ============================================================================
// Default Instance
// ============================================================================

let defaultInstance: FileReader | null = null;

/**
 * Get or create the default FileReader instance
 */
export function getFileReader(options?: FileReaderOptions): FileReader {
  if (!defaultInstance || options) {
    defaultInstance = new FileReader(options);
  }
  return defaultInstance;
}

/**
 * Convenience function: Read file contents
 */
export async function readFile(filePath: string): Promise<Result<string, FileReadError>> {
  return getFileReader().readFile(filePath);
}

/**
 * Convenience function: Read and parse JSON file
 */
export async function readJSON<T>(
  filePath: string
): Promise<Result<T, FileReadError | JsonParseError>> {
  return getFileReader().readJSON<T>(filePath);
}

/**
 * Convenience function: Check if file exists
 */
export async function fileExists(filePath: string): Promise<Result<boolean, FileReadError>> {
  return getFileReader().fileExists(filePath);
}

/**
 * Convenience function: List files matching pattern
 */
export async function listFiles(
  pattern: string,
  basePath?: string
): Promise<Result<string[], FileReadError>> {
  return getFileReader().listFiles(pattern, basePath);
}
