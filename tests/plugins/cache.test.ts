/**
 * Tests for Plugin Cache (IMP-09)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PluginCache } from '../../src/plugins/cache';
import type { QEPluginManifest } from '../../src/plugins/manifest';

function makeManifest(name: string, version: string): QEPluginManifest {
  return {
    name,
    version,
    description: `Plugin ${name} v${version}`,
    author: 'test',
    domains: ['test-generation' as never],
    entryPoint: 'index.js',
  };
}

describe('PluginCache', () => {
  let tmpDir: string;
  let cache: PluginCache;
  let sourceDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-plugin-cache-'));
    sourceDir = path.join(tmpDir, 'source');
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'index.js'), 'module.exports = {}');

    cache = new PluginCache({ cacheDir: path.join(tmpDir, 'cache'), keepVersions: 2 });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('store and retrieve', () => {
    it('should store a plugin and retrieve it', () => {
      const manifest = makeManifest('my-plugin', '1.0.0');
      const cachePath = cache.store(manifest, sourceDir);

      expect(fs.existsSync(cachePath)).toBe(true);
      expect(cache.has('my-plugin', '1.0.0')).toBe(true);

      const cached = cache.get('my-plugin', '1.0.0');
      expect(cached).toBeDefined();
      expect(cached!.manifest.name).toBe('my-plugin');
      expect(cached!.manifest.version).toBe('1.0.0');
    });

    it('should not overwrite an existing cached version (immutable)', () => {
      const manifest = makeManifest('my-plugin', '1.0.0');
      const path1 = cache.store(manifest, sourceDir);
      const path2 = cache.store(manifest, sourceDir);

      // Same path returned — not overwritten
      expect(path1).toBe(path2);
    });

    it('should copy source files to cache', () => {
      const manifest = makeManifest('my-plugin', '1.0.0');
      const cachePath = cache.store(manifest, sourceDir);

      expect(fs.existsSync(path.join(cachePath, 'index.js'))).toBe(true);
      expect(fs.existsSync(path.join(cachePath, 'qe-plugin.json'))).toBe(true);
    });
  });

  describe('has', () => {
    it('should return false for non-existent plugins', () => {
      expect(cache.has('nonexistent', '1.0.0')).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove a cached version', () => {
      cache.store(makeManifest('my-plugin', '1.0.0'), sourceDir);
      expect(cache.has('my-plugin', '1.0.0')).toBe(true);

      const removed = cache.remove('my-plugin', '1.0.0');
      expect(removed).toBe(true);
      expect(cache.has('my-plugin', '1.0.0')).toBe(false);
    });

    it('should return false when removing non-existent', () => {
      expect(cache.remove('nonexistent', '1.0.0')).toBe(false);
    });
  });

  describe('listVersions', () => {
    it('should list all cached versions', () => {
      cache.store(makeManifest('my-plugin', '1.0.0'), sourceDir);
      cache.store(makeManifest('my-plugin', '2.0.0'), sourceDir);

      const versions = cache.listVersions('my-plugin');
      expect(versions).toHaveLength(2);
    });

    it('should return empty for unknown plugins', () => {
      expect(cache.listVersions('unknown')).toHaveLength(0);
    });
  });

  describe('listAll', () => {
    it('should list latest version of each plugin', () => {
      cache.store(makeManifest('alpha', '1.0.0'), sourceDir);
      cache.store(makeManifest('alpha', '2.0.0'), sourceDir);
      cache.store(makeManifest('beta', '1.0.0'), sourceDir);

      const all = cache.listAll();
      expect(all).toHaveLength(2);
      const names = all.map(c => c.manifest.name);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });
  });

  describe('version pruning', () => {
    it('should prune old versions beyond keepVersions', () => {
      // keepVersions = 2, so adding 3 versions should prune the oldest
      cache.store(makeManifest('my-plugin', '1.0.0'), sourceDir);
      cache.store(makeManifest('my-plugin', '2.0.0'), sourceDir);
      cache.store(makeManifest('my-plugin', '3.0.0'), sourceDir);

      const versions = cache.listVersions('my-plugin');
      expect(versions.length).toBeLessThanOrEqual(2);
    });
  });
});
