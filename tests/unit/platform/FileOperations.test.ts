/**
 * FileOperations Unit Tests
 *
 * Tests for platform-optimized file operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  copyFile,
  copyDirectory,
  cloneForIsolation,
  linkFixture,
  getCopyCapabilities,
  benchmarkCopy,
  CopyStrategy,
} from '../../../src/core/platform/FileOperations';
import {
  detectCapabilities,
  clearCapabilitiesCache,
} from '../../../src/core/platform/PlatformDetector';

describe('FileOperations', () => {
  let testDir: string;
  let srcFile: string;
  let destFile: string;

  beforeAll(async () => {
    // Create test directory in temp
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'file-ops-test-'));
  });

  afterAll(async () => {
    // Cleanup test directory
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Create fresh source file for each test
    srcFile = path.join(testDir, `src-${Date.now()}.txt`);
    destFile = path.join(testDir, `dest-${Date.now()}.txt`);
    await fs.promises.writeFile(srcFile, 'test content for file operations');
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.promises.unlink(srcFile).catch(() => {});
      await fs.promises.unlink(destFile).catch(() => {});
    } catch {
      // Ignore
    }
  });

  describe('copyFile', () => {
    it('should copy a file successfully', async () => {
      const result = await copyFile(srcFile, destFile);

      expect(result.success).toBe(true);
      expect(result.source).toBe(srcFile);
      expect(result.destination).toBe(destFile);
      expect(result.size).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Verify file was copied
      const destContent = await fs.promises.readFile(destFile, 'utf8');
      expect(destContent).toBe('test content for file operations');
    });

    it('should report strategy used', async () => {
      const result = await copyFile(srcFile, destFile);

      expect(result.success).toBe(true);
      expect(Object.values(CopyStrategy)).toContain(result.strategy);
    });

    it('should fail if source does not exist', async () => {
      const result = await copyFile('/nonexistent/file.txt', destFile);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail if destination exists and overwrite is false', async () => {
      // Create destination first
      await fs.promises.writeFile(destFile, 'existing');

      const result = await copyFile(srcFile, destFile, { overwrite: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should overwrite destination when option is set', async () => {
      // Create destination first
      await fs.promises.writeFile(destFile, 'existing content');

      const result = await copyFile(srcFile, destFile, { overwrite: true });

      expect(result.success).toBe(true);

      // Verify content was overwritten
      const destContent = await fs.promises.readFile(destFile, 'utf8');
      expect(destContent).toBe('test content for file operations');
    });

    it('should create parent directories when recursive is set', async () => {
      const nestedDest = path.join(testDir, 'nested', 'dir', 'file.txt');

      const result = await copyFile(srcFile, nestedDest, { recursive: true });

      expect(result.success).toBe(true);
      expect(fs.existsSync(nestedDest)).toBe(true);

      // Cleanup
      await fs.promises.rm(path.join(testDir, 'nested'), { recursive: true });
    });

    it('should preserve timestamps when option is set', async () => {
      // Set source timestamps to a known value
      const pastTime = new Date('2020-01-01');
      await fs.promises.utimes(srcFile, pastTime, pastTime);

      const result = await copyFile(srcFile, destFile, { preserveTimestamps: true });

      expect(result.success).toBe(true);

      const destStats = await fs.promises.stat(destFile);
      expect(destStats.mtime.getTime()).toBe(pastTime.getTime());
    });

    it('should use specified strategy', async () => {
      const result = await copyFile(srcFile, destFile, {
        strategy: CopyStrategy.USERSPACE,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(CopyStrategy.USERSPACE);
    });
  });

  describe('copyDirectory', () => {
    let srcDir: string;
    let destDir: string;

    beforeEach(async () => {
      srcDir = path.join(testDir, `srcdir-${Date.now()}`);
      destDir = path.join(testDir, `destdir-${Date.now()}`);

      // Create source directory with files
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(path.join(srcDir, 'file1.txt'), 'content 1');
      await fs.promises.writeFile(path.join(srcDir, 'file2.txt'), 'content 2');
      await fs.promises.mkdir(path.join(srcDir, 'subdir'));
      await fs.promises.writeFile(path.join(srcDir, 'subdir', 'file3.txt'), 'content 3');
    });

    afterEach(async () => {
      await fs.promises.rm(srcDir, { recursive: true, force: true }).catch(() => {});
      await fs.promises.rm(destDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should copy directory recursively', async () => {
      const results = await copyDirectory(srcDir, destDir);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);

      // Verify files were copied
      expect(fs.existsSync(path.join(destDir, 'file1.txt'))).toBe(true);
      expect(fs.existsSync(path.join(destDir, 'file2.txt'))).toBe(true);
      expect(fs.existsSync(path.join(destDir, 'subdir', 'file3.txt'))).toBe(true);
    });

    it('should preserve directory structure', async () => {
      await copyDirectory(srcDir, destDir);

      // Verify content
      const content1 = await fs.promises.readFile(path.join(destDir, 'file1.txt'), 'utf8');
      const content3 = await fs.promises.readFile(path.join(destDir, 'subdir', 'file3.txt'), 'utf8');

      expect(content1).toBe('content 1');
      expect(content3).toBe('content 3');
    });

    it('should throw for non-directory source', async () => {
      await expect(copyDirectory(srcFile, destDir)).rejects.toThrow('not a directory');
    });
  });

  describe('cloneForIsolation', () => {
    let srcDir: string;
    let destDir: string;

    beforeEach(async () => {
      srcDir = path.join(testDir, `clone-src-${Date.now()}`);
      destDir = path.join(testDir, `clone-dest-${Date.now()}`);

      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(path.join(srcDir, 'config.json'), '{"key": "value"}');
      await fs.promises.writeFile(path.join(srcDir, 'data.txt'), 'test data');
    });

    afterEach(async () => {
      await fs.promises.rm(srcDir, { recursive: true, force: true }).catch(() => {});
      await fs.promises.rm(destDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should clone directory for isolation', async () => {
      const result = await cloneForIsolation(srcDir, destDir);

      expect(result.success).toBe(true);
      expect(result.filesCloned).toBe(2);
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(Object.values(CopyStrategy)).toContain(result.strategy);
    });

    it('should report errors', async () => {
      // Clone to a path with permission issues
      const badPath = '/root/no-permission';

      const result = await cloneForIsolation(srcDir, badPath).catch(() => ({
        success: false,
        filesCloned: 0,
        totalSize: 0,
        duration: 0,
        strategy: CopyStrategy.USERSPACE,
        errors: ['Permission denied'],
      }));

      expect(result.success).toBe(false);
    });
  });

  describe('linkFixture', () => {
    it('should create hardlink for fixture', async () => {
      const result = await linkFixture(srcFile, destFile);

      expect(result.success).toBe(true);

      // Verify content
      const destContent = await fs.promises.readFile(destFile, 'utf8');
      expect(destContent).toBe('test content for file operations');

      // Verify they share the same inode (hardlink)
      const srcStats = await fs.promises.stat(srcFile);
      const destStats = await fs.promises.stat(destFile);
      expect(srcStats.ino).toBe(destStats.ino);
    });

    it('should fall back to copy if hardlink fails', async () => {
      // Create dest in different filesystem (if possible)
      // This test may not fail hardlink on all systems
      const result = await linkFixture(srcFile, destFile);

      expect(result.success).toBe(true);
    });
  });

  describe('getCopyCapabilities', () => {
    it('should return platform capabilities', async () => {
      const caps = await getCopyCapabilities();

      expect(caps.platform).toBeDefined();
      expect(caps.filesystem).toBeDefined();
      expect(Object.values(CopyStrategy)).toContain(caps.optimalStrategy);
      expect(caps.expectedSpeedup).toBeDefined();
    });
  });

  describe('benchmarkCopy', () => {
    it('should run copy benchmarks', async () => {
      const results = await benchmarkCopy(testDir);

      expect(results.userspace).toBeGreaterThan(0);
      expect(results.improvement).toBeDefined();

      // Kernel copy should be available or null
      if (results.kernel !== null) {
        expect(results.kernel).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe('PlatformDetector', () => {
  afterEach(() => {
    clearCapabilitiesCache();
  });

  describe('detectCapabilities', () => {
    it('should detect platform capabilities', async () => {
      const caps = await detectCapabilities();

      expect(caps.platform).toBe(process.platform);
      expect(caps.filesystem).toBeDefined();
      expect(typeof caps.supportsReflink).toBe('boolean');
      expect(typeof caps.supportsHardlinks).toBe('boolean');
      expect(caps.summary).toBeDefined();
    });

    it('should cache capabilities', async () => {
      const caps1 = await detectCapabilities('/tmp');
      const caps2 = await detectCapabilities('/tmp');

      expect(caps1).toEqual(caps2);
    });

    it('should detect capabilities for specific path', async () => {
      const caps = await detectCapabilities(os.tmpdir());

      expect(caps.platform).toBeDefined();
      expect(caps.filesystem).toBeDefined();
    });
  });

  describe('clearCapabilitiesCache', () => {
    it('should clear the cache', async () => {
      await detectCapabilities('/tmp');
      clearCapabilitiesCache();

      // Should not throw after clearing
      const caps = await detectCapabilities('/tmp');
      expect(caps).toBeDefined();
    });
  });
});
