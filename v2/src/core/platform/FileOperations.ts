/**
 * FileOperations - Platform-optimized file operations
 *
 * Provides file copy/clone operations that leverage platform-specific
 * features like APFS clonefile (macOS) and reflink (Linux btrfs/xfs)
 * for 50-100x performance improvements.
 *
 * @module core/platform/FileOperations
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectCapabilities, type PlatformCapabilities } from './PlatformDetector';

/**
 * Copy strategy used for a file operation
 */
export enum CopyStrategy {
  /** Copy-on-write clone (fastest) */
  REFLINK = 'reflink',
  /** Filesystem hardlink (instant, shares data) */
  HARDLINK = 'hardlink',
  /** Kernel-space copy (fast) */
  KERNEL = 'kernel',
  /** Userspace copy (fallback) */
  USERSPACE = 'userspace',
}

/**
 * Result of a copy operation
 */
export interface CopyResult {
  /** Source path */
  source: string;
  /** Destination path */
  destination: string;
  /** Strategy used */
  strategy: CopyStrategy;
  /** Operation duration in milliseconds */
  duration: number;
  /** File size in bytes */
  size: number;
  /** Whether operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for copy operations
 */
export interface CopyOptions {
  /** Force a specific strategy (skips auto-detection) */
  strategy?: CopyStrategy;
  /** Overwrite existing destination */
  overwrite?: boolean;
  /** Create parent directories if they don't exist */
  recursive?: boolean;
  /** Preserve file timestamps */
  preserveTimestamps?: boolean;
}

/**
 * Copy a file using the optimal strategy for the platform
 *
 * Priority: reflink > kernel copy > userspace copy
 *
 * @param source - Source file path
 * @param destination - Destination file path
 * @param options - Copy options
 * @returns Copy result with strategy and timing info
 */
export async function copyFile(
  source: string,
  destination: string,
  options: CopyOptions = {}
): Promise<CopyResult> {
  const startTime = performance.now();
  const sourcePath = path.resolve(source);
  const destPath = path.resolve(destination);

  // Check source exists
  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(sourcePath);
    if (!stats.isFile()) {
      throw new Error(`Source is not a file: ${sourcePath}`);
    }
  } catch (err: any) {
    return {
      source: sourcePath,
      destination: destPath,
      strategy: CopyStrategy.USERSPACE,
      duration: performance.now() - startTime,
      size: 0,
      success: false,
      error: err.message,
    };
  }

  // Create parent directory if needed
  if (options.recursive) {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  }

  // Handle overwrite
  if (!options.overwrite) {
    try {
      await fs.promises.access(destPath);
      return {
        source: sourcePath,
        destination: destPath,
        strategy: CopyStrategy.USERSPACE,
        duration: performance.now() - startTime,
        size: stats.size,
        success: false,
        error: 'Destination already exists',
      };
    } catch {
      // File doesn't exist, continue
    }
  }

  // Determine strategy
  let strategy = options.strategy;
  if (!strategy) {
    const caps = await detectCapabilities(sourcePath);
    strategy = caps.supportsReflink ? CopyStrategy.REFLINK : CopyStrategy.KERNEL;
  }

  // Execute copy with fallback chain
  let usedStrategy = strategy;
  let error: string | undefined;

  try {
    switch (strategy) {
      case CopyStrategy.REFLINK:
        try {
          await fs.promises.copyFile(
            sourcePath,
            destPath,
            fs.constants.COPYFILE_FICLONE_FORCE
          );
        } catch {
          // Reflink failed, try kernel copy
          usedStrategy = CopyStrategy.KERNEL;
          await fs.promises.copyFile(sourcePath, destPath, fs.constants.COPYFILE_FICLONE);
        }
        break;

      case CopyStrategy.HARDLINK:
        try {
          await fs.promises.link(sourcePath, destPath);
        } catch {
          // Hardlink failed, fallback to copy
          usedStrategy = CopyStrategy.KERNEL;
          await fs.promises.copyFile(sourcePath, destPath, fs.constants.COPYFILE_FICLONE);
        }
        break;

      case CopyStrategy.KERNEL:
        await fs.promises.copyFile(sourcePath, destPath, fs.constants.COPYFILE_FICLONE);
        break;

      case CopyStrategy.USERSPACE:
      default:
        await fs.promises.copyFile(sourcePath, destPath);
        break;
    }

    // Preserve timestamps if requested
    if (options.preserveTimestamps) {
      const srcStats = await fs.promises.stat(sourcePath);
      await fs.promises.utimes(destPath, srcStats.atime, srcStats.mtime);
    }
  } catch (err: any) {
    error = err.message;
  }

  return {
    source: sourcePath,
    destination: destPath,
    strategy: usedStrategy,
    duration: performance.now() - startTime,
    size: stats.size,
    success: !error,
    error,
  };
}

/**
 * Copy a directory recursively using optimal strategies
 *
 * @param source - Source directory path
 * @param destination - Destination directory path
 * @param options - Copy options
 * @returns Array of copy results for all files
 */
export async function copyDirectory(
  source: string,
  destination: string,
  options: CopyOptions = {}
): Promise<CopyResult[]> {
  const sourcePath = path.resolve(source);
  const destPath = path.resolve(destination);

  // Check source is a directory
  const stats = await fs.promises.stat(sourcePath);
  if (!stats.isDirectory()) {
    throw new Error(`Source is not a directory: ${sourcePath}`);
  }

  // Create destination directory
  await fs.promises.mkdir(destPath, { recursive: true });

  // Get all entries
  const entries = await fs.promises.readdir(sourcePath, { withFileTypes: true });

  const results: CopyResult[] = [];

  // Process entries in parallel with concurrency limit
  const CONCURRENCY = 10;
  const chunks: fs.Dirent[][] = [];
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    chunks.push(entries.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (entry) => {
        const srcEntryPath = path.join(sourcePath, entry.name);
        const destEntryPath = path.join(destPath, entry.name);

        if (entry.isDirectory()) {
          return copyDirectory(srcEntryPath, destEntryPath, options);
        } else if (entry.isFile()) {
          return [await copyFile(srcEntryPath, destEntryPath, options)];
        } else {
          // Symlinks, etc. - skip for now
          return [];
        }
      })
    );

    results.push(...chunkResults.flat());
  }

  return results;
}

/**
 * Clone a directory for test isolation
 *
 * Optimized for creating isolated test workspaces with COW cloning.
 *
 * @param source - Source directory path
 * @param destination - Destination directory path
 * @returns Clone result summary
 */
export async function cloneForIsolation(
  source: string,
  destination: string
): Promise<{
  success: boolean;
  filesCloned: number;
  totalSize: number;
  duration: number;
  strategy: CopyStrategy;
  errors: string[];
}> {
  const startTime = performance.now();

  const results = await copyDirectory(source, destination, {
    overwrite: true,
    recursive: true,
  });

  const errors = results.filter(r => !r.success).map(r => r.error || 'Unknown error');
  const successResults = results.filter(r => r.success);

  // Determine predominant strategy used
  const strategyCount = new Map<CopyStrategy, number>();
  for (const r of successResults) {
    strategyCount.set(r.strategy, (strategyCount.get(r.strategy) || 0) + 1);
  }

  let predominantStrategy = CopyStrategy.USERSPACE;
  let maxCount = 0;
  for (const [strategy, count] of strategyCount) {
    if (count > maxCount) {
      maxCount = count;
      predominantStrategy = strategy;
    }
  }

  return {
    success: errors.length === 0,
    filesCloned: successResults.length,
    totalSize: successResults.reduce((sum, r) => sum + r.size, 0),
    duration: performance.now() - startTime,
    strategy: predominantStrategy,
    errors,
  };
}

/**
 * Create a read-only fixture copy using hardlinks
 *
 * Useful for test fixtures that won't be modified.
 *
 * @param source - Source file path
 * @param destination - Destination file path
 * @returns Copy result
 */
export async function linkFixture(
  source: string,
  destination: string
): Promise<CopyResult> {
  return copyFile(source, destination, {
    strategy: CopyStrategy.HARDLINK,
    recursive: true,
  });
}

/**
 * Get platform copy capabilities summary
 */
export async function getCopyCapabilities(): Promise<{
  platform: string;
  filesystem: string;
  optimalStrategy: CopyStrategy;
  expectedSpeedup: string;
}> {
  const caps = await detectCapabilities();

  let optimalStrategy: CopyStrategy;
  let expectedSpeedup: string;

  if (caps.supportsReflink) {
    optimalStrategy = CopyStrategy.REFLINK;
    expectedSpeedup = '100-1000x';
  } else if (caps.supportsCopyFileRange) {
    optimalStrategy = CopyStrategy.KERNEL;
    expectedSpeedup = '2-5x';
  } else {
    optimalStrategy = CopyStrategy.USERSPACE;
    expectedSpeedup = '1x (baseline)';
  }

  return {
    platform: caps.platform,
    filesystem: caps.filesystem,
    optimalStrategy,
    expectedSpeedup,
  };
}

/**
 * Benchmark copy operations for the current platform
 *
 * @param testPath - Path to run benchmark in
 * @returns Benchmark results
 */
export async function benchmarkCopy(
  testPath: string = '/tmp'
): Promise<{
  reflink: number | null;
  kernel: number | null;
  userspace: number;
  improvement: string;
}> {
  const testDir = path.join(testPath, '.copy-benchmark');
  const testData = Buffer.alloc(1024 * 1024, 'x'); // 1MB test file

  try {
    await fs.promises.mkdir(testDir, { recursive: true });
    const srcFile = path.join(testDir, 'src.tmp');
    await fs.promises.writeFile(srcFile, testData);

    const results: { reflink: number | null; kernel: number | null; userspace: number } = {
      reflink: null,
      kernel: null,
      userspace: 0,
    };

    // Benchmark reflink
    try {
      const destReflink = path.join(testDir, 'dest-reflink.tmp');
      const startReflink = performance.now();
      await fs.promises.copyFile(srcFile, destReflink, fs.constants.COPYFILE_FICLONE_FORCE);
      results.reflink = performance.now() - startReflink;
      await fs.promises.unlink(destReflink);
    } catch {
      // Reflink not supported
    }

    // Benchmark kernel copy
    const destKernel = path.join(testDir, 'dest-kernel.tmp');
    const startKernel = performance.now();
    await fs.promises.copyFile(srcFile, destKernel, fs.constants.COPYFILE_FICLONE);
    results.kernel = performance.now() - startKernel;
    await fs.promises.unlink(destKernel);

    // Benchmark userspace copy
    const destUser = path.join(testDir, 'dest-user.tmp');
    const startUser = performance.now();
    await fs.promises.copyFile(srcFile, destUser);
    results.userspace = performance.now() - startUser;
    await fs.promises.unlink(destUser);

    // Calculate improvement
    let improvement = '1x';
    if (results.reflink !== null) {
      const factor = Math.round(results.userspace / results.reflink);
      improvement = `${factor}x (reflink)`;
    } else if (results.kernel !== null && results.kernel < results.userspace) {
      const factor = Math.round(results.userspace / results.kernel);
      improvement = `${factor}x (kernel)`;
    }

    return { ...results, improvement };
  } finally {
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
