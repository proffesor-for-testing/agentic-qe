/**
 * Tests for Plugin Manifest Validation (IMP-09)
 */

import { describe, it, expect } from 'vitest';
import { validateManifest, parseManifest, type QEPluginManifest } from '../../src/plugins/manifest';

function validManifest(overrides?: Partial<QEPluginManifest>): QEPluginManifest {
  return {
    name: 'my-test-plugin',
    version: '1.0.0',
    description: 'A test plugin for unit tests',
    author: 'Test Author',
    domains: ['test-generation' as never],
    entryPoint: 'dist/index.js',
    ...overrides,
  };
}

describe('validateManifest', () => {
  describe('valid manifests', () => {
    it('should accept a valid minimal manifest', () => {
      const result = validateManifest(validManifest());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept manifest with all optional fields', () => {
      const result = validateManifest(validManifest({
        dependencies: { 'other-plugin': '^1.0.0' },
        hooks: { 'pre-test': 'hooks/pre-test.js' },
        minAqeVersion: '3.8.0',
        permissions: ['fs:read'],
      }));
      expect(result.valid).toBe(true);
    });
  });

  describe('required field validation', () => {
    it('should reject null/undefined input', () => {
      expect(validateManifest(null).valid).toBe(false);
      expect(validateManifest(undefined).valid).toBe(false);
    });

    it('should reject missing name', () => {
      const m = validManifest();
      delete (m as Record<string, unknown>).name;
      const result = validateManifest(m);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('name');
    });

    it('should reject missing version', () => {
      const m = validManifest();
      delete (m as Record<string, unknown>).version;
      expect(validateManifest(m).valid).toBe(false);
    });

    it('should reject missing entryPoint', () => {
      const m = validManifest();
      delete (m as Record<string, unknown>).entryPoint;
      expect(validateManifest(m).valid).toBe(false);
    });

    it('should reject empty domains array', () => {
      expect(validateManifest(validManifest({ domains: [] as never })).valid).toBe(false);
    });
  });

  describe('name validation', () => {
    it('should reject names with uppercase', () => {
      expect(validateManifest(validManifest({ name: 'MyPlugin' })).valid).toBe(false);
    });

    it('should reject names starting with numbers', () => {
      expect(validateManifest(validManifest({ name: '1plugin' })).valid).toBe(false);
    });

    it('should reject names with spaces', () => {
      expect(validateManifest(validManifest({ name: 'my plugin' })).valid).toBe(false);
    });

    it('should reject reserved prefixes', () => {
      expect(validateManifest(validManifest({ name: 'aqe-core-auth' })).valid).toBe(false);
    });

    it('should accept valid hyphenated names', () => {
      expect(validateManifest(validManifest({ name: 'my-custom-plugin' })).valid).toBe(true);
    });
  });

  describe('version validation', () => {
    it('should reject non-semver versions', () => {
      expect(validateManifest(validManifest({ version: '1.0' })).valid).toBe(false);
      expect(validateManifest(validManifest({ version: 'latest' })).valid).toBe(false);
    });

    it('should accept pre-release versions', () => {
      expect(validateManifest(validManifest({ version: '1.0.0-beta.1' })).valid).toBe(true);
    });
  });

  describe('entryPoint validation', () => {
    it('should reject path traversal', () => {
      expect(validateManifest(validManifest({ entryPoint: '../../../evil.js' })).valid).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(validateManifest(validManifest({ entryPoint: '/usr/bin/evil.js' })).valid).toBe(false);
    });

    it('should reject non-js/ts extensions', () => {
      expect(validateManifest(validManifest({ entryPoint: 'index.py' })).valid).toBe(false);
    });

    it('should accept .mjs entry points', () => {
      expect(validateManifest(validManifest({ entryPoint: 'dist/index.mjs' })).valid).toBe(true);
    });
  });

  describe('hooks validation', () => {
    it('should reject hook paths with traversal', () => {
      const result = validateManifest(validManifest({
        hooks: { 'pre-test': '../../../etc/passwd' },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('..'))).toBe(true);
    });
  });
});

describe('parseManifest', () => {
  it('should parse valid JSON string', () => {
    const json = JSON.stringify(validManifest());
    const manifest = parseManifest(json);
    expect(manifest.name).toBe('my-test-plugin');
  });

  it('should parse valid object', () => {
    const manifest = parseManifest(validManifest());
    expect(manifest.name).toBe('my-test-plugin');
  });

  it('should throw on invalid manifest', () => {
    expect(() => parseManifest({ name: 123 })).toThrow('Invalid plugin manifest');
  });
});
