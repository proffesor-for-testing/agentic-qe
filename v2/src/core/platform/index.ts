/**
 * Platform Module - Platform-optimized operations
 *
 * Provides platform-specific optimizations for file operations,
 * leveraging features like APFS clonefile (macOS) and reflink (Linux btrfs/xfs).
 *
 * @module core/platform
 * @version 1.0.0
 */

// Platform detection
export {
  detectCapabilities,
  testReflinkSupport,
  clearCapabilitiesCache,
  getQuickSummary,
  type PlatformCapabilities,
} from './PlatformDetector';

// File operations
export {
  copyFile,
  copyDirectory,
  cloneForIsolation,
  linkFixture,
  getCopyCapabilities,
  benchmarkCopy,
  CopyStrategy,
  type CopyResult,
  type CopyOptions,
} from './FileOperations';
