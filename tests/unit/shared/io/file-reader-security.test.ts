/**
 * SEC-004: FileReader Path Traversal Protection Tests
 *
 * These tests verify that the FileReader properly blocks path traversal attacks
 * using the validatePath security utility from cve-prevention.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import {
  FileReader,
  PathTraversalError,
  FileReadError,
} from '../../../../src/shared/io/file-reader';

describe('FileReader path traversal protection (SEC-004)', () => {
  let reader: FileReader;
  const safeBasePath = '/safe/base/directory';

  beforeEach(() => {
    reader = new FileReader({ basePath: safeBasePath });
  });

  describe('readFile() path traversal protection', () => {
    it('blocks basic ../ traversal attempts', async () => {
      const result = await reader.readFile('../../../etc/passwd');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
        expect((result.error as PathTraversalError).riskLevel).toBe('critical');
      }
    });

    it('blocks URL-encoded ../ traversal (%2e%2e%2f)', async () => {
      const result = await reader.readFile('%2e%2e%2f%2e%2e%2fetc/passwd');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });

    it('blocks double URL-encoded traversal (%252e%252e)', async () => {
      const result = await reader.readFile('%252e%252e%252f%252e%252e%252fetc/passwd');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });

    it('blocks null byte injection attempts', async () => {
      const result = await reader.readFile('file.txt\0.jpg');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });

    it('blocks URL-encoded null byte (%00)', async () => {
      const result = await reader.readFile('file.txt%00.jpg');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });

    it('blocks Windows-style backslash traversal', async () => {
      const result = await reader.readFile('..\\..\\..\\etc\\passwd');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });

    it('blocks access to /etc system paths', async () => {
      const result = await reader.readFile('/etc/passwd');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
        expect((result.error as PathTraversalError).riskLevel).toBe('critical');
      }
    });

    it('blocks access to /proc system paths', async () => {
      const result = await reader.readFile('/proc/self/environ');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });

    it('blocks dangerous file extensions (.exe)', async () => {
      const result = await reader.readFile('malicious.exe');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
        expect((result.error as PathTraversalError).riskLevel).toBe('high');
      }
    });

    it('blocks dangerous file extensions (.dll)', async () => {
      const result = await reader.readFile('library.dll');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });
  });

  describe('readJSON() path traversal protection', () => {
    it('blocks traversal attempts in JSON file paths', async () => {
      const result = await reader.readJSON('../../../etc/shadow');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });
  });

  describe('fileExists() path traversal protection', () => {
    it('blocks traversal attempts in file existence checks', async () => {
      const result = await reader.fileExists('../../../etc/passwd');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });
  });

  describe('listFiles() path traversal protection', () => {
    it('blocks traversal attempts in base path parameter', async () => {
      const result = await reader.listFiles('*.txt', '../../../etc');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(PathTraversalError);
      }
    });
  });

  describe('invalidateCache() path traversal protection', () => {
    it('throws PathTraversalError for malicious paths', () => {
      expect(() => {
        reader.invalidateCache('../../../etc/passwd');
      }).toThrow(PathTraversalError);
    });
  });

  describe('PathTraversalError properties', () => {
    it('contains the requested path', async () => {
      const maliciousPath = '../../../etc/passwd';
      const result = await reader.readFile(maliciousPath);

      expect(result.success).toBe(false);
      if (!result.success && result.error instanceof PathTraversalError) {
        expect(result.error.requestedPath).toBe(maliciousPath);
        expect(result.error.issues.length).toBeGreaterThan(0);
        expect(result.error.name).toBe('PathTraversalError');
      }
    });

    it('has correct risk level for critical traversal', async () => {
      const result = await reader.readFile('../../../etc/passwd');

      expect(result.success).toBe(false);
      if (!result.success && result.error instanceof PathTraversalError) {
        expect(result.error.riskLevel).toBe('critical');
      }
    });
  });
});

describe('FileReader valid path handling (SEC-004 regression)', () => {
  let reader: FileReader;
  let tempDir: string;
  let tempFile: string;

  beforeEach(async () => {
    // Create a real temporary directory for testing valid paths
    // Use a path that won't trigger system path checks
    tempDir = path.join(process.cwd(), '.test-temp-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
    tempFile = path.join(tempDir, 'valid-file.txt');
    await fs.writeFile(tempFile, 'test content');

    reader = new FileReader({ basePath: tempDir });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('allows valid relative paths within basePath', async () => {
    const result = await reader.readFile('valid-file.txt');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('test content');
    }
  });

  it('allows valid subdirectory paths', async () => {
    // Create subdirectory with file
    const subDir = path.join(tempDir, 'subdir');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, 'nested.txt'), 'nested content');

    const result = await reader.readFile('subdir/nested.txt');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('nested content');
    }
  });

  it('blocks absolute paths that escape basePath', async () => {
    // Absolute paths to system directories should be blocked
    const absoluteReader = new FileReader({ basePath: tempDir });
    const result = await absoluteReader.readFile('/etc/passwd');

    // Should be blocked as it escapes basePath
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(PathTraversalError);
    }
  });

  it('allows common source code extensions (.ts, .js)', async () => {
    const tsFile = path.join(tempDir, 'module.ts');
    await fs.writeFile(tsFile, 'export const x = 1;');

    const result = await reader.readFile('module.ts');

    expect(result.success).toBe(true);
  });

  it('allows JSON files with relative paths', async () => {
    const jsonFile = path.join(tempDir, 'config.json');
    await fs.writeFile(jsonFile, '{"key": "value"}');

    // Use relative path which will be resolved correctly
    const result = await reader.readJSON<{ key: string }>('config.json');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.key).toBe('value');
    }
  });

  it('allows reading files that exist with valid paths', async () => {
    // Test that valid file operations work
    const existsResult = await reader.fileExists('valid-file.txt');
    expect(existsResult.success).toBe(true);
    if (existsResult.success) {
      expect(existsResult.value).toBe(true);
    }

    // Test non-existent file returns false (not error)
    const notExistsResult = await reader.fileExists('nonexistent.txt');
    expect(notExistsResult.success).toBe(true);
    if (notExistsResult.success) {
      expect(notExistsResult.value).toBe(false);
    }
  });
});


describe('FileReader checkout-relative depth', () => {
  it('reads deep absolute and relative paths while retaining containment and depth limits', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'aqe-file-reader-depth-'));
    try {
      const base = path.join(root, ...Array.from({ length: 11 }, (_, index) => `checkout-${index}`));
      await fs.mkdir(path.join(base, 'src'), { recursive: true });
      await fs.writeFile(path.join(base, 'src', 'app.ts'), 'export const answer = 42;');
      const reader = new FileReader({ basePath: base });
      for (const file of ['src/app.ts', path.join(base, 'src', 'app.ts')]) {
        expect(await reader.readFile(file)).toEqual({ success: true, value: 'export const answer = 42;' });
      }
      const sibling = `${base}-other`;
      await fs.mkdir(sibling);
      await fs.writeFile(path.join(sibling, 'secret.ts'), 'outside');
      await fs.writeFile(path.join(path.dirname(base), 'secret.ts'), 'parent');
      await fs.mkdir(path.join(base, '%2e%2e'));
      await fs.writeFile(path.join(base, '%2e%2e', 'secret.ts'), 'encoded spelling');
      const tenComponents = path.join(...Array.from({ length: 9 }, () => 'child'), 'app.ts');
      const elevenComponents = path.join('extra', tenComponents);
      for (const relative of [tenComponents, elevenComponents]) {
        await fs.mkdir(path.dirname(path.join(base, relative)), { recursive: true });
        await fs.writeFile(path.join(base, relative), 'boundary fixture');
      }
      for (const file of [tenComponents, path.join(base, tenComponents)]) {
        expect(await reader.readFile(file)).toEqual({ success: true, value: 'boundary fixture' });
      }
      for (const file of [path.join(sibling, 'secret.ts'), '../secret.ts', '%2e%2e/secret.ts', elevenComponents, path.join(base, elevenComponents)]) {
        const result = await reader.readFile(file);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toBeInstanceOf(PathTraversalError);
      }
      // An explicit empty base historically permits absolute paths.
      const unrestricted = path.join(root, 'unrestricted.ts');
      await fs.writeFile(unrestricted, 'unrestricted fixture');
      expect(await new FileReader({ basePath: '' }).readFile(unrestricted))
        .toEqual({ success: true, value: 'unrestricted fixture' });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
