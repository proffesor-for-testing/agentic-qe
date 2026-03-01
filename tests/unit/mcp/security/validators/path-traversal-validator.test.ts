import { describe, it, expect } from 'vitest';
import {
  PathTraversalValidator,
  PATH_TRAVERSAL_PATTERNS,
  DANGEROUS_PATH_COMPONENTS,
  validatePath,
  normalizePath,
  joinPaths,
  joinPathsAbsolute,
  getExtension,
} from '../../../../../src/mcp/security/validators/path-traversal-validator.js';

describe('PathTraversalValidator', () => {
  const validator = new PathTraversalValidator();

  describe('validate', () => {
    it('should accept safe relative paths', () => {
      const result = validator.validate('src/components/Button.tsx');
      expect(result.valid).toBe(true);
      expect(result.riskLevel).toBe('none');
    });

    it('should reject basic .. traversal', () => {
      const result = validator.validate('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should reject URL-encoded traversal (%2e%2e)', () => {
      const result = validator.validate('%2e%2e/secret');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should reject double URL-encoded traversal', () => {
      const result = validator.validate('%252e%252e/secret');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should reject null byte injection', () => {
      const result = validator.validate('file.txt\0.jpg');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should reject URL-encoded null byte', () => {
      const result = validator.validate('file.txt%00.jpg');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should reject absolute paths by default', () => {
      const result = validator.validate('/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('high');
    });

    it('should allow absolute paths when configured', () => {
      const result = validator.validate('/safe/path/file.ts', { allowAbsolute: true });
      expect(result.valid).toBe(true);
    });

    it('should reject Windows absolute paths', () => {
      const result = validator.validate('C:/Windows/System32');
      expect(result.valid).toBe(false);
    });

    it('should reject paths to /etc/', () => {
      const result = validator.validate('/etc/shadow', { allowAbsolute: true });
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should reject paths to /proc/', () => {
      const result = validator.validate('/proc/self/environ', { allowAbsolute: true });
      expect(result.valid).toBe(false);
    });

    it('should reject paths to /sys/', () => {
      const result = validator.validate('/sys/kernel', { allowAbsolute: true });
      expect(result.valid).toBe(false);
    });

    it('should enforce max path length', () => {
      const longPath = 'a'.repeat(5000);
      const result = validator.validate(longPath);
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('medium');
    });

    it('should enforce max depth', () => {
      const deepPath = Array(15).fill('dir').join('/');
      const result = validator.validate(deepPath, { maxDepth: 10 });
      expect(result.valid).toBe(false);
    });

    it('should reject denied file extensions', () => {
      const result = validator.validate('malware.exe');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('high');
    });

    it('should reject .bat files', () => {
      const result = validator.validate('script.bat');
      expect(result.valid).toBe(false);
    });

    it('should reject .sh files by default', () => {
      const result = validator.validate('script.sh');
      expect(result.valid).toBe(false);
    });

    it('should enforce allowed extensions', () => {
      const result = validator.validate('file.py', {
        allowedExtensions: ['.ts', '.js'],
        deniedExtensions: [],
      });
      expect(result.valid).toBe(false);
    });

    it('should accept files with allowed extensions', () => {
      const result = validator.validate('file.ts', {
        allowedExtensions: ['.ts', '.js'],
        deniedExtensions: [],
      });
      expect(result.valid).toBe(true);
    });

    it('should validate against basePath', () => {
      const result = validator.validate('../../outside', {
        basePath: '/safe/dir',
        allowAbsolute: true,
      });
      expect(result.valid).toBe(false);
    });

    it('should accept paths within basePath', () => {
      const result = validator.validate('subdir/file.ts', {
        basePath: '/safe/dir',
        deniedExtensions: [],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject Windows backslash traversal', () => {
      const result = validator.validate('..\\..\\etc\\passwd');
      expect(result.valid).toBe(false);
    });

    it('should reject UTF-8 overlong encoding bypass', () => {
      const result = validator.validate('%c0%ae%c0%ae/etc/passwd');
      expect(result.valid).toBe(false);
    });
  });

  describe('normalizePath', () => {
    it('should resolve . components', () => {
      expect(validator.normalizePath('a/./b')).toBe('a/b');
    });

    it('should resolve .. components', () => {
      expect(validator.normalizePath('a/b/../c')).toBe('a/c');
    });

    it('should replace backslashes', () => {
      expect(validator.normalizePath('a\\b\\c')).toBe('a/b/c');
    });

    it('should remove multiple slashes', () => {
      expect(validator.normalizePath('a///b//c')).toBe('a/b/c');
    });

    it('should handle empty path', () => {
      expect(validator.normalizePath('')).toBe('');
    });
  });

  describe('joinPaths', () => {
    it('should join path segments', () => {
      expect(validator.joinPaths('a', 'b', 'c')).toBe('a/b/c');
    });

    it('should strip leading/trailing slashes', () => {
      expect(validator.joinPaths('/a/', '/b/', '/c/')).toBe('a/b/c');
    });

    it('should handle empty input', () => {
      expect(validator.joinPaths()).toBe('');
    });
  });

  describe('joinPathsAbsolute', () => {
    it('should preserve leading slash', () => {
      expect(validator.joinPathsAbsolute('/a', 'b', 'c')).toBe('/a/b/c');
    });

    it('should not add slash for relative paths', () => {
      expect(validator.joinPathsAbsolute('a', 'b')).toBe('a/b');
    });
  });

  describe('getExtension', () => {
    it('should extract file extension', () => {
      expect(validator.getExtension('file.ts')).toBe('ts');
    });

    it('should handle dotfiles', () => {
      expect(validator.getExtension('.gitignore')).toBe('gitignore');
    });

    it('should return null for no extension', () => {
      expect(validator.getExtension('Makefile')).toBeNull();
    });

    it('should handle multiple dots', () => {
      expect(validator.getExtension('file.test.ts')).toBe('ts');
    });
  });

  describe('standalone functions', () => {
    it('validatePath should work', () => {
      expect(validatePath('src/file.ts').valid).toBe(true);
    });

    it('normalizePath should work', () => {
      expect(normalizePath('a/./b')).toBe('a/b');
    });

    it('joinPaths should work', () => {
      expect(joinPaths('a', 'b')).toBe('a/b');
    });

    it('joinPathsAbsolute should work', () => {
      expect(joinPathsAbsolute('/a', 'b')).toBe('/a/b');
    });

    it('getExtension should work', () => {
      expect(getExtension('file.ts')).toBe('ts');
    });
  });

  describe('constants', () => {
    it('PATH_TRAVERSAL_PATTERNS should cover major attack vectors', () => {
      expect(PATH_TRAVERSAL_PATTERNS.length).toBeGreaterThanOrEqual(10);
    });

    it('DANGEROUS_PATH_COMPONENTS should cover system directories', () => {
      expect(DANGEROUS_PATH_COMPONENTS.length).toBeGreaterThanOrEqual(5);
    });
  });
});
