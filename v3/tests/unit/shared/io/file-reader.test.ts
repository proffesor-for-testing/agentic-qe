/**
 * Agentic QE v3 - File Reader Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  FileReader,
  FileReadError,
  JsonParseError,
  getFileReader,
  readFile,
  readJSON,
  fileExists,
  listFiles,
} from '../../../../src/shared/io/file-reader';

describe('FileReader', () => {
  let testDir: string;
  let fileReader: FileReader;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-reader-test-'));
    fileReader = new FileReader({ basePath: testDir });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ============================================================================
  // readFile Tests
  // ============================================================================

  describe('readFile', () => {
    it('should read file contents successfully', async () => {
      const content = 'Hello, World!';
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, content, 'utf-8');

      const result = await fileReader.readFile(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(content);
      }
    });

    it('should handle relative paths', async () => {
      const content = 'Relative path content';
      await fs.writeFile(path.join(testDir, 'relative.txt'), content, 'utf-8');

      const result = await fileReader.readFile('relative.txt');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(content);
      }
    });

    it('should return error for non-existent file', async () => {
      const result = await fileReader.readFile('non-existent.txt');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileReadError);
        expect(result.error.code).toBe('ENOENT');
        expect(result.error.message).toContain('File not found');
      }
    });

    it('should return error when reading a directory', async () => {
      await fs.mkdir(path.join(testDir, 'subdir'));

      const result = await fileReader.readFile('subdir');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileReadError);
        expect(result.error.code).toBe('EISDIR');
      }
    });

    it('should cache file contents on second read', async () => {
      const content = 'Cached content';
      const filePath = path.join(testDir, 'cached.txt');
      await fs.writeFile(filePath, content, 'utf-8');

      // First read
      await fileReader.readFile(filePath);
      const statsAfterFirst = fileReader.getStats();

      // Second read (should hit cache)
      await fileReader.readFile(filePath);
      const statsAfterSecond = fileReader.getStats();

      expect(statsAfterFirst.cacheMisses).toBe(1);
      expect(statsAfterFirst.cacheHits).toBe(0);
      expect(statsAfterSecond.cacheHits).toBe(1);
      expect(statsAfterSecond.cacheMisses).toBe(1);
    });

    it('should respect cache disabled option', async () => {
      const noCacheReader = new FileReader({
        basePath: testDir,
        enableCache: false,
      });

      const content = 'No cache content';
      const filePath = path.join(testDir, 'no-cache.txt');
      await fs.writeFile(filePath, content, 'utf-8');

      await noCacheReader.readFile(filePath);
      await noCacheReader.readFile(filePath);

      const stats = noCacheReader.getStats();
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheEntries).toBe(0);
    });

    it('should read UTF-8 files with special characters', async () => {
      const content = 'Unicode: \u00e9\u00e0\u00fc\u4e2d\u6587\ud83d\ude80';
      const filePath = path.join(testDir, 'unicode.txt');
      await fs.writeFile(filePath, content, 'utf-8');

      const result = await fileReader.readFile(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(content);
      }
    });
  });

  // ============================================================================
  // readJSON Tests
  // ============================================================================

  describe('readJSON', () => {
    it('should parse valid JSON file', async () => {
      const data = { name: 'test', count: 42, nested: { value: true } };
      const filePath = path.join(testDir, 'data.json');
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');

      const result = await fileReader.readJSON<typeof data>(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(data);
      }
    });

    it('should return error for invalid JSON', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      await fs.writeFile(filePath, '{ invalid json }', 'utf-8');

      const result = await fileReader.readJSON(filePath);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(JsonParseError);
        expect(result.error.message).toContain('Invalid JSON');
      }
    });

    it('should return error for non-existent JSON file', async () => {
      const result = await fileReader.readJSON('non-existent.json');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileReadError);
      }
    });

    it('should handle empty JSON object', async () => {
      const filePath = path.join(testDir, 'empty.json');
      await fs.writeFile(filePath, '{}', 'utf-8');

      const result = await fileReader.readJSON<object>(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({});
      }
    });

    it('should handle JSON arrays', async () => {
      const data = [1, 2, 3, 'four', { five: 5 }];
      const filePath = path.join(testDir, 'array.json');
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');

      const result = await fileReader.readJSON<typeof data>(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(data);
      }
    });
  });

  // ============================================================================
  // fileExists Tests
  // ============================================================================

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'exists.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');

      const result = await fileReader.fileExists(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(true);
      }
    });

    it('should return false for non-existent file', async () => {
      const result = await fileReader.fileExists('non-existent.txt');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(false);
      }
    });

    it('should handle directories', async () => {
      await fs.mkdir(path.join(testDir, 'subdir'));

      const result = await fileReader.fileExists('subdir');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(true);
      }
    });

    it('should handle relative paths', async () => {
      await fs.writeFile(path.join(testDir, 'relative-exists.txt'), 'content', 'utf-8');

      const result = await fileReader.fileExists('relative-exists.txt');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(true);
      }
    });
  });

  // ============================================================================
  // listFiles Tests
  // ============================================================================

  describe('listFiles', () => {
    beforeEach(async () => {
      // Create test file structure
      await fs.writeFile(path.join(testDir, 'file1.ts'), 'content', 'utf-8');
      await fs.writeFile(path.join(testDir, 'file2.ts'), 'content', 'utf-8');
      await fs.writeFile(path.join(testDir, 'file3.js'), 'content', 'utf-8');
      await fs.mkdir(path.join(testDir, 'subdir'));
      await fs.writeFile(path.join(testDir, 'subdir', 'nested.ts'), 'content', 'utf-8');
      await fs.writeFile(path.join(testDir, 'subdir', 'nested.js'), 'content', 'utf-8');
    });

    it('should list files matching simple extension pattern', async () => {
      const result = await fileReader.listFiles('*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(2);
        expect(result.value.every((f) => f.endsWith('.ts'))).toBe(true);
      }
    });

    it('should list files matching globstar pattern', async () => {
      const result = await fileReader.listFiles('**/*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(3);
        expect(result.value.some((f) => f.includes('subdir'))).toBe(true);
      }
    });

    it('should list files in specific subdirectory', async () => {
      const result = await fileReader.listFiles('*.ts', path.join(testDir, 'subdir'));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toContain('nested.ts');
      }
    });

    it('should return empty array for no matches', async () => {
      const result = await fileReader.listFiles('*.xyz');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return error for non-existent base path', async () => {
      const result = await fileReader.listFiles('*.ts', '/non/existent/path');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileReadError);
      }
    });

    it('should handle complex glob patterns', async () => {
      await fs.writeFile(path.join(testDir, 'test.spec.ts'), 'content', 'utf-8');

      const result = await fileReader.listFiles('*.spec.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]).toContain('test.spec.ts');
      }
    });

    it('should return sorted results', async () => {
      const result = await fileReader.listFiles('*.ts');

      expect(result.success).toBe(true);
      if (result.success) {
        const sorted = [...result.value].sort();
        expect(result.value).toEqual(sorted);
      }
    });
  });

  // ============================================================================
  // Cache Management Tests
  // ============================================================================

  describe('cache management', () => {
    it('should invalidate specific cache entry', async () => {
      const filePath = path.join(testDir, 'invalidate.txt');
      await fs.writeFile(filePath, 'original', 'utf-8');

      await fileReader.readFile(filePath);
      expect(fileReader.getStats().cacheEntries).toBe(1);

      fileReader.invalidateCache(filePath);
      expect(fileReader.getStats().cacheEntries).toBe(0);
    });

    it('should clear all cache entries', async () => {
      await fs.writeFile(path.join(testDir, 'a.txt'), 'a', 'utf-8');
      await fs.writeFile(path.join(testDir, 'b.txt'), 'b', 'utf-8');

      await fileReader.readFile(path.join(testDir, 'a.txt'));
      await fileReader.readFile(path.join(testDir, 'b.txt'));
      expect(fileReader.getStats().cacheEntries).toBe(2);

      fileReader.clearCache();
      expect(fileReader.getStats().cacheEntries).toBe(0);
    });

    it('should prune expired cache entries', async () => {
      const shortTtlReader = new FileReader({
        basePath: testDir,
        cacheTtlMs: 10, // 10ms TTL
      });

      const filePath = path.join(testDir, 'expire.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');

      await shortTtlReader.readFile(filePath);
      expect(shortTtlReader.getStats().cacheEntries).toBe(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      const pruned = shortTtlReader.pruneCache();
      expect(pruned).toBe(1);
      expect(shortTtlReader.getStats().cacheEntries).toBe(0);
    });

    it('should evict oldest entries when cache is full', async () => {
      const smallCacheReader = new FileReader({
        basePath: testDir,
        maxCacheSize: 2,
      });

      await fs.writeFile(path.join(testDir, '1.txt'), '1', 'utf-8');
      await fs.writeFile(path.join(testDir, '2.txt'), '2', 'utf-8');
      await fs.writeFile(path.join(testDir, '3.txt'), '3', 'utf-8');

      await smallCacheReader.readFile(path.join(testDir, '1.txt'));
      await smallCacheReader.readFile(path.join(testDir, '2.txt'));
      expect(smallCacheReader.getStats().cacheEntries).toBe(2);

      // This should evict the oldest (1.txt)
      await smallCacheReader.readFile(path.join(testDir, '3.txt'));
      expect(smallCacheReader.getStats().cacheEntries).toBe(2);

      // Reading 1.txt again should be a cache miss
      const statsBeforeReread = smallCacheReader.getStats();
      await smallCacheReader.readFile(path.join(testDir, '1.txt'));
      const statsAfterReread = smallCacheReader.getStats();

      expect(statsAfterReread.cacheMisses).toBe(statsBeforeReread.cacheMisses + 1);
    });
  });

  // ============================================================================
  // Statistics Tests
  // ============================================================================

  describe('statistics', () => {
    it('should track total reads', async () => {
      await fs.writeFile(path.join(testDir, 'stats.txt'), 'content', 'utf-8');

      expect(fileReader.getStats().totalReads).toBe(0);

      await fileReader.readFile(path.join(testDir, 'stats.txt'));
      expect(fileReader.getStats().totalReads).toBe(1);

      await fileReader.readFile(path.join(testDir, 'stats.txt'));
      expect(fileReader.getStats().totalReads).toBe(2);
    });

    it('should reset statistics', async () => {
      await fs.writeFile(path.join(testDir, 'reset.txt'), 'content', 'utf-8');

      await fileReader.readFile(path.join(testDir, 'reset.txt'));
      await fileReader.readFile(path.join(testDir, 'reset.txt'));

      expect(fileReader.getStats().totalReads).toBe(2);
      expect(fileReader.getStats().cacheHits).toBe(1);

      fileReader.resetStats();

      expect(fileReader.getStats().totalReads).toBe(0);
      expect(fileReader.getStats().cacheHits).toBe(0);
      expect(fileReader.getStats().cacheMisses).toBe(0);
    });

    it('should track cache size in bytes', async () => {
      const content = 'Hello, World!';
      await fs.writeFile(path.join(testDir, 'size.txt'), content, 'utf-8');

      await fileReader.readFile(path.join(testDir, 'size.txt'));

      const stats = fileReader.getStats();
      expect(stats.cacheSize).toBe(Buffer.byteLength(content, 'utf-8'));
    });
  });

  // ============================================================================
  // Convenience Functions Tests
  // ============================================================================

  describe('convenience functions', () => {
    it('should read file using convenience function', async () => {
      const content = 'Convenience test';
      const filePath = path.join(testDir, 'convenience.txt');
      await fs.writeFile(filePath, content, 'utf-8');

      // Need to reset default instance to use our test directory
      const reader = getFileReader({ basePath: testDir });
      const result = await reader.readFile('convenience.txt');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(content);
      }
    });
  });
});

// ============================================================================
// Error Class Tests
// ============================================================================

describe('FileReadError', () => {
  it('should have correct name and properties', () => {
    const error = new FileReadError('Test error', '/path/to/file', 'ENOENT');

    expect(error.name).toBe('FileReadError');
    expect(error.message).toBe('Test error');
    expect(error.filePath).toBe('/path/to/file');
    expect(error.code).toBe('ENOENT');
  });

  it('should preserve cause', () => {
    const cause = new Error('Original error');
    const error = new FileReadError('Wrapped error', '/path', 'ERR', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('JsonParseError', () => {
  it('should have correct name and properties', () => {
    const error = new JsonParseError('Parse failed', '/path/to/file.json');

    expect(error.name).toBe('JsonParseError');
    expect(error.message).toBe('Parse failed');
    expect(error.filePath).toBe('/path/to/file.json');
  });
});
