/**
 * PlatformDetector - Detects platform capabilities for optimized file operations
 *
 * Identifies filesystem features like reflink (copy-on-write) support
 * to enable 100x+ performance improvements for file operations.
 *
 * @module core/platform/PlatformDetector
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Platform capabilities for file operations
 */
export interface PlatformCapabilities {
  /** Platform identifier (darwin, linux, win32, etc.) */
  platform: NodeJS.Platform;
  /** Detected filesystem type */
  filesystem: string;
  /** Whether reflink/clonefile is supported */
  supportsReflink: boolean;
  /** Whether hardlinks are supported */
  supportsHardlinks: boolean;
  /** Whether copy_file_range is available */
  supportsCopyFileRange: boolean;
  /** Node.js copyFile flags to use */
  recommendedCopyFlags: number;
  /** Human-readable capability summary */
  summary: string;
}

/**
 * Cached capabilities per path
 */
const capabilitiesCache = new Map<string, PlatformCapabilities>();

/**
 * Detect platform capabilities for a given path
 *
 * @param targetPath - Path to check capabilities for (uses tmpdir if not specified)
 * @returns Platform capabilities object
 */
export async function detectCapabilities(
  targetPath: string = os.tmpdir()
): Promise<PlatformCapabilities> {
  // Check cache first
  const cacheKey = path.dirname(path.resolve(targetPath));
  const cached = capabilitiesCache.get(cacheKey);
  if (cached) return cached;

  const platform = os.platform();
  let filesystem = 'unknown';
  let supportsReflink = false;
  let supportsHardlinks = true;
  let supportsCopyFileRange = platform === 'linux';

  try {
    switch (platform) {
      case 'darwin':
        filesystem = await detectMacOSFilesystem(targetPath);
        supportsReflink = filesystem === 'apfs';
        break;

      case 'linux':
        filesystem = await detectLinuxFilesystem(targetPath);
        supportsReflink = ['btrfs', 'xfs'].includes(filesystem.toLowerCase());
        break;

      case 'win32':
        filesystem = await detectWindowsFilesystem(targetPath);
        supportsReflink = filesystem.toLowerCase() === 'refs';
        supportsHardlinks = true; // NTFS supports hardlinks
        break;

      default:
        filesystem = 'unknown';
        supportsReflink = false;
    }
  } catch {
    // Detection failed, use conservative defaults
  }

  // Determine recommended copy flags
  let recommendedCopyFlags = 0;
  if (supportsReflink) {
    recommendedCopyFlags = fs.constants.COPYFILE_FICLONE;
  }

  const capabilities: PlatformCapabilities = {
    platform,
    filesystem,
    supportsReflink,
    supportsHardlinks,
    supportsCopyFileRange,
    recommendedCopyFlags,
    summary: buildSummary(platform, filesystem, supportsReflink),
  };

  // Cache the result
  capabilitiesCache.set(cacheKey, capabilities);

  return capabilities;
}

/**
 * Detect macOS filesystem type
 */
async function detectMacOSFilesystem(targetPath: string): Promise<string> {
  try {
    // Use diskutil to get filesystem info
    const absolutePath = path.resolve(targetPath);
    const output = execSync(`diskutil info "${absolutePath}" 2>/dev/null | grep "File System Personality"`, {
      encoding: 'utf8',
      timeout: 5000,
    });

    if (output.includes('APFS')) return 'apfs';
    if (output.includes('HFS')) return 'hfs+';
    return 'unknown';
  } catch {
    // Fallback: assume APFS on modern macOS
    const release = os.release();
    const majorVersion = parseInt(release.split('.')[0], 10);
    // macOS 10.13+ (Darwin 17+) defaults to APFS
    return majorVersion >= 17 ? 'apfs' : 'hfs+';
  }
}

/**
 * Detect Linux filesystem type
 */
async function detectLinuxFilesystem(targetPath: string): Promise<string> {
  try {
    const absolutePath = path.resolve(targetPath);

    // Try stat -f first (most reliable)
    const output = execSync(`stat -f -c %T "${absolutePath}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    return output || 'unknown';
  } catch {
    try {
      // Fallback: check /proc/mounts
      const mounts = fs.readFileSync('/proc/mounts', 'utf8');
      const absolutePath = path.resolve(targetPath);

      // Find the mount point for the path
      for (const line of mounts.split('\n').reverse()) {
        const parts = line.split(' ');
        if (parts.length >= 3 && absolutePath.startsWith(parts[1])) {
          return parts[2]; // filesystem type
        }
      }
    } catch {
      // Ignore errors
    }

    return 'unknown';
  }
}

/**
 * Detect Windows filesystem type
 */
async function detectWindowsFilesystem(targetPath: string): Promise<string> {
  try {
    const absolutePath = path.resolve(targetPath);
    const drive = absolutePath.charAt(0).toUpperCase();

    // Use WMIC to get filesystem info
    const output = execSync(
      `wmic logicaldisk where "DeviceID='${drive}:'" get FileSystem /format:value`,
      { encoding: 'utf8', timeout: 5000 }
    );

    const match = output.match(/FileSystem=(\w+)/);
    return match ? match[1].toLowerCase() : 'ntfs';
  } catch {
    return 'ntfs'; // Assume NTFS as default
  }
}

/**
 * Build human-readable summary
 */
function buildSummary(
  platform: NodeJS.Platform,
  filesystem: string,
  supportsReflink: boolean
): string {
  const platformNames: Record<string, string> = {
    darwin: 'macOS',
    linux: 'Linux',
    win32: 'Windows',
  };
  const platformName = platformNames[platform] || platform;

  if (supportsReflink) {
    return `${platformName} (${filesystem}) - COW/reflink supported (100x+ faster copies)`;
  }
  return `${platformName} (${filesystem}) - Standard copy mode`;
}

/**
 * Test if reflink actually works for a given path
 *
 * This performs an actual file clone test to verify capabilities.
 *
 * @param targetPath - Path to test
 * @returns True if reflink works
 */
export async function testReflinkSupport(targetPath: string): Promise<boolean> {
  const testDir = path.join(path.dirname(path.resolve(targetPath)), '.reflink-test');
  const srcFile = path.join(testDir, 'src.tmp');
  const destFile = path.join(testDir, 'dest.tmp');

  try {
    // Create test directory
    await fs.promises.mkdir(testDir, { recursive: true });

    // Create source file
    await fs.promises.writeFile(srcFile, 'reflink-test-content');

    // Attempt reflink copy
    await fs.promises.copyFile(srcFile, destFile, fs.constants.COPYFILE_FICLONE_FORCE);

    // Success!
    return true;
  } catch {
    return false;
  } finally {
    // Cleanup
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Clear the capabilities cache
 */
export function clearCapabilitiesCache(): void {
  capabilitiesCache.clear();
}

/**
 * Get a quick summary of current platform capabilities
 */
export async function getQuickSummary(): Promise<string> {
  const caps = await detectCapabilities();
  return caps.summary;
}
