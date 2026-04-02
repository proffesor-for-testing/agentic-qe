/**
 * Tests for Plugin Security (IMP-09)
 */

import { describe, it, expect } from 'vitest';
import { checkPluginSecurity, isNameSafe } from '../../src/plugins/security';
import type { QEPluginManifest } from '../../src/plugins/manifest';

function makeManifest(overrides?: Partial<QEPluginManifest>): QEPluginManifest {
  return {
    name: 'safe-plugin',
    version: '1.0.0',
    description: 'A safe test plugin',
    author: 'test',
    domains: ['test-generation' as never],
    entryPoint: 'dist/index.js',
    ...overrides,
  };
}

describe('checkPluginSecurity', () => {
  describe('safe plugins', () => {
    it('should pass for a clean manifest', () => {
      const result = checkPluginSecurity(makeManifest());
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass with valid hooks', () => {
      const result = checkPluginSecurity(makeManifest({
        hooks: { 'pre-test': 'hooks/pre.js' },
      }));
      expect(result.safe).toBe(true);
    });
  });

  describe('name impersonation', () => {
    it('should block reserved exact names', () => {
      const result = checkPluginSecurity(makeManifest({ name: 'aqe' }));
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.includes('reserved'))).toBe(true);
    });

    it('should block reserved prefixes', () => {
      const result = checkPluginSecurity(makeManifest({ name: 'aqe-core-exploit' }));
      expect(result.safe).toBe(false);
    });

    it('should block non-ASCII names', () => {
      const result = checkPluginSecurity(makeManifest({ name: 'pl\u00FCgin' }));
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.includes('non-ASCII'))).toBe(true);
    });
  });

  describe('path traversal', () => {
    it('should block entry point traversal', () => {
      const result = checkPluginSecurity(makeManifest({ entryPoint: '../../../evil.js' }));
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.includes('..'))).toBe(true);
    });

    it('should block absolute entry points', () => {
      const result = checkPluginSecurity(makeManifest({ entryPoint: '/usr/bin/evil.js' }));
      expect(result.safe).toBe(false);
    });

    it('should block hook path traversal', () => {
      const result = checkPluginSecurity(makeManifest({
        hooks: { 'pre-test': '../../etc/passwd' },
      }));
      expect(result.safe).toBe(false);
    });

    it('should block null bytes in paths', () => {
      const result = checkPluginSecurity(makeManifest({ entryPoint: 'index\0.js' }));
      expect(result.safe).toBe(false);
      expect(result.violations.some(v => v.includes('null byte'))).toBe(true);
    });
  });

  describe('dangerous permissions', () => {
    it('should flag dangerous permission requests', () => {
      const result = checkPluginSecurity(makeManifest({
        permissions: ['fs:read', 'fs:write-root', 'exec:shell'],
      }));
      expect(result.safe).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });

    it('should allow safe permissions', () => {
      const result = checkPluginSecurity(makeManifest({
        permissions: ['fs:read', 'net:http-get'],
      }));
      expect(result.safe).toBe(true);
    });
  });

  describe('system path detection', () => {
    it('should block /etc/ paths', () => {
      const result = checkPluginSecurity(makeManifest({
        hooks: { 'post-test': '/etc/shadow' },
      }));
      expect(result.safe).toBe(false);
    });

    it('should block node_modules injection', () => {
      const result = checkPluginSecurity(makeManifest({
        entryPoint: 'node_modules/malicious/index.js',
      }));
      expect(result.safe).toBe(false);
    });
  });
});

describe('isNameSafe', () => {
  it('should return true for valid names', () => {
    expect(isNameSafe('my-plugin')).toBe(true);
    expect(isNameSafe('test-coverage-plugin')).toBe(true);
  });

  it('should return false for reserved names', () => {
    expect(isNameSafe('aqe')).toBe(false);
    expect(isNameSafe('ruflo')).toBe(false);
  });

  it('should return false for non-ASCII', () => {
    expect(isNameSafe('plügin')).toBe(false);
  });
});
