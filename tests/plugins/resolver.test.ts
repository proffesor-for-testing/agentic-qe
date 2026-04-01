/**
 * Tests for Plugin Dependency Resolver (IMP-09)
 */

import { describe, it, expect } from 'vitest';
import { PluginResolver } from '../../src/plugins/resolver';
import type { QEPluginManifest } from '../../src/plugins/manifest';

function makeManifest(name: string, deps?: Record<string, string>): QEPluginManifest {
  return {
    name,
    version: '1.0.0',
    description: `Plugin ${name}`,
    author: 'test',
    domains: ['test-generation' as never],
    entryPoint: 'index.js',
    dependencies: deps,
  };
}

describe('PluginResolver', () => {
  const resolver = new PluginResolver();

  describe('simple resolution', () => {
    it('should resolve plugins with no dependencies', () => {
      const result = resolver.resolve([
        makeManifest('alpha'),
        makeManifest('beta'),
      ]);
      expect(result.ordered).toHaveLength(2);
      expect(result.missing.size).toBe(0);
    });

    it('should resolve empty list', () => {
      const result = resolver.resolve([]);
      expect(result.ordered).toHaveLength(0);
    });
  });

  describe('dependency ordering', () => {
    it('should load dependencies before dependents', () => {
      const result = resolver.resolve([
        makeManifest('child', { parent: '^1.0.0' }),
        makeManifest('parent'),
      ]);

      const names = result.ordered.map(r => r.manifest.name);
      expect(names.indexOf('parent')).toBeLessThan(names.indexOf('child'));
    });

    it('should handle deep dependency chains', () => {
      const result = resolver.resolve([
        makeManifest('c', { b: '^1.0.0' }),
        makeManifest('b', { a: '^1.0.0' }),
        makeManifest('a'),
      ]);

      const names = result.ordered.map(r => r.manifest.name);
      expect(names).toEqual(['a', 'b', 'c']);
    });

    it('should handle diamond dependencies', () => {
      // A depends on B and C, both depend on D
      const result = resolver.resolve([
        makeManifest('a', { b: '^1.0.0', c: '^1.0.0' }),
        makeManifest('b', { d: '^1.0.0' }),
        makeManifest('c', { d: '^1.0.0' }),
        makeManifest('d'),
      ]);

      const names = result.ordered.map(r => r.manifest.name);
      // D must come before B and C, which must come before A
      expect(names.indexOf('d')).toBeLessThan(names.indexOf('b'));
      expect(names.indexOf('d')).toBeLessThan(names.indexOf('c'));
      expect(names.indexOf('b')).toBeLessThan(names.indexOf('a'));
      expect(names.indexOf('c')).toBeLessThan(names.indexOf('a'));
    });
  });

  describe('cycle detection', () => {
    it('should detect direct cycles', () => {
      expect(() =>
        resolver.resolve([
          makeManifest('a', { b: '^1.0.0' }),
          makeManifest('b', { a: '^1.0.0' }),
        ]),
      ).toThrow(/cycle/i);
    });

    it('should detect indirect cycles', () => {
      expect(() =>
        resolver.resolve([
          makeManifest('a', { b: '^1.0.0' }),
          makeManifest('b', { c: '^1.0.0' }),
          makeManifest('c', { a: '^1.0.0' }),
        ]),
      ).toThrow(/cycle/i);
    });

    it('should include cycle path in error message', () => {
      try {
        resolver.resolve([
          makeManifest('x', { y: '^1.0.0' }),
          makeManifest('y', { x: '^1.0.0' }),
        ]);
        expect.unreachable('Should have thrown');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('x');
        expect(msg).toContain('y');
      }
    });
  });

  describe('missing dependencies', () => {
    it('should record missing dependencies without failing', () => {
      const result = resolver.resolve([
        makeManifest('a', { 'not-installed': '^1.0.0' }),
      ]);
      expect(result.ordered).toHaveLength(1);
      expect(result.missing.get('a')).toContain('not-installed');
    });
  });

  describe('canLoad', () => {
    it('should return true when all deps are loaded', () => {
      const loaded = new Set(['dep-a', 'dep-b']);
      const result = resolver.canLoad(
        makeManifest('plugin', { 'dep-a': '^1.0.0', 'dep-b': '^1.0.0' }),
        loaded,
      );
      expect(result.canLoad).toBe(true);
      expect(result.missingDeps).toHaveLength(0);
    });

    it('should return false when deps are missing', () => {
      const loaded = new Set(['dep-a']);
      const result = resolver.canLoad(
        makeManifest('plugin', { 'dep-a': '^1.0.0', 'dep-b': '^1.0.0' }),
        loaded,
      );
      expect(result.canLoad).toBe(false);
      expect(result.missingDeps).toContain('dep-b');
    });

    it('should return true for plugins with no deps', () => {
      const result = resolver.canLoad(makeManifest('plugin'), new Set());
      expect(result.canLoad).toBe(true);
    });
  });
});
