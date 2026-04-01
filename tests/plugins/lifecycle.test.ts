/**
 * Tests for Plugin Lifecycle Manager (IMP-09)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PluginLifecycleManager } from '../../src/plugins/lifecycle';
import { PluginCache } from '../../src/plugins/cache';
import type { QEPluginManifest } from '../../src/plugins/manifest';

function writePluginDir(dir: string, manifest: QEPluginManifest): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'qe-plugin.json'), JSON.stringify(manifest));
  // Create entry point directory if needed
  const entryDir = path.dirname(path.join(dir, manifest.entryPoint));
  fs.mkdirSync(entryDir, { recursive: true });
  fs.writeFileSync(path.join(dir, manifest.entryPoint), 'module.exports = {}');
}

describe('PluginLifecycleManager', () => {
  let tmpDir: string;
  let cache: PluginCache;
  let manager: PluginLifecycleManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-lifecycle-'));
    cache = new PluginCache({ cacheDir: path.join(tmpDir, 'cache') });
    manager = new PluginLifecycleManager({ cache });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('install from local', () => {
    it('should install a valid local plugin', async () => {
      const pluginDir = path.join(tmpDir, 'my-plugin');
      writePluginDir(pluginDir, {
        name: 'my-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        author: 'test',
        domains: ['test-generation' as never],
        entryPoint: 'index.js',
      });

      const result = await manager.install(pluginDir, 'local');
      expect(result.success).toBe(true);
      expect(result.manifest?.name).toBe('my-plugin');
      expect(result.cachePath).toBeTruthy();
      expect(result.errors).toHaveLength(0);
    });

    it('should reject plugins failing security checks', async () => {
      // Use a name that passes manifest validation but fails security
      // (reserved exact name 'ruflo' is blocked by security, not manifest)
      const pluginDir = path.join(tmpDir, 'evil-plugin');
      writePluginDir(pluginDir, {
        name: 'ruflo',
        version: '1.0.0',
        description: 'Impersonating plugin',
        author: 'attacker',
        domains: ['test-generation' as never],
        entryPoint: 'index.js',
      });

      const result = await manager.install(pluginDir, 'local');
      expect(result.success).toBe(false);
      expect(result.securityViolations.length).toBeGreaterThan(0);
    });

    it('should return existing cache on duplicate install', async () => {
      const pluginDir = path.join(tmpDir, 'my-plugin');
      writePluginDir(pluginDir, {
        name: 'my-plugin',
        version: '1.0.0',
        description: 'Test',
        author: 'test',
        domains: ['test-generation' as never],
        entryPoint: 'index.js',
      });

      const r1 = await manager.install(pluginDir, 'local');
      const r2 = await manager.install(pluginDir, 'local');
      expect(r1.cachePath).toBe(r2.cachePath);
    });

    it('should reject unknown source types', async () => {
      const result = await manager.install('/some/path', 'unknown');
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Unknown source type');
    });

    it('should handle missing plugin directory', async () => {
      const result = await manager.install('/nonexistent/path', 'local');
      expect(result.success).toBe(false);
    });
  });

  describe('list', () => {
    it('should list installed plugins', async () => {
      const pluginDir = path.join(tmpDir, 'my-plugin');
      writePluginDir(pluginDir, {
        name: 'my-plugin',
        version: '1.0.0',
        description: 'Test',
        author: 'test',
        domains: ['test-generation' as never],
        entryPoint: 'index.js',
      });

      await manager.install(pluginDir, 'local');
      const list = manager.list();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('my-plugin');
    });

    it('should return empty list when nothing installed', () => {
      expect(manager.list()).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('should remove an installed plugin', async () => {
      const pluginDir = path.join(tmpDir, 'my-plugin');
      writePluginDir(pluginDir, {
        name: 'my-plugin',
        version: '1.0.0',
        description: 'Test',
        author: 'test',
        domains: ['test-generation' as never],
        entryPoint: 'index.js',
      });

      await manager.install(pluginDir, 'local');
      expect(manager.list()).toHaveLength(1);

      const removed = manager.remove('my-plugin', '1.0.0');
      expect(removed).toBe(true);
      expect(manager.list()).toHaveLength(0);
    });
  });

  describe('resolveLoadOrder', () => {
    it('should resolve load order for installed plugins', async () => {
      const pluginDir = path.join(tmpDir, 'my-plugin');
      writePluginDir(pluginDir, {
        name: 'my-plugin',
        version: '1.0.0',
        description: 'Test',
        author: 'test',
        domains: ['test-generation' as never],
        entryPoint: 'index.js',
      });

      await manager.install(pluginDir, 'local');
      const order = manager.resolveLoadOrder();
      expect(order.ordered).toHaveLength(1);
      expect(order.ordered[0].manifest.name).toBe('my-plugin');
    });
  });
});
