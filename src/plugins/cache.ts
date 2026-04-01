/**
 * Agentic QE v3 - Plugin Cache (IMP-09)
 *
 * Versioned immutable cache for installed plugins.
 * Stores plugins at `.agentic-qe/plugins/{name}@{version}/`.
 * Once cached, a version is never modified — only new versions are added.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { QEPluginManifest } from './manifest';

// ============================================================================
// Types
// ============================================================================

export interface CachedPlugin {
  manifest: QEPluginManifest;
  path: string;
  cachedAt: string;
}

export interface PluginCacheOptions {
  /** Base directory for the plugin cache (default: .agentic-qe/plugins) */
  cacheDir?: string;
  /** Number of old versions to keep per plugin (default: 2) */
  keepVersions?: number;
}

// ============================================================================
// PluginCache
// ============================================================================

export class PluginCache {
  private readonly cacheDir: string;
  private readonly keepVersions: number;

  constructor(options: PluginCacheOptions = {}) {
    this.cacheDir = options.cacheDir
      ?? path.join(process.cwd(), '.agentic-qe', 'plugins');
    this.keepVersions = options.keepVersions ?? 2;
  }

  /** Check if a specific version is cached. */
  has(name: string, version: string): boolean {
    const dir = this.versionDir(name, version);
    return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'qe-plugin.json'));
  }

  /** Get the cached path for a plugin version, or undefined if not cached. */
  get(name: string, version: string): CachedPlugin | undefined {
    if (!this.has(name, version)) return undefined;

    const dir = this.versionDir(name, version);
    const raw = fs.readFileSync(path.join(dir, 'qe-plugin.json'), 'utf-8');
    const manifest = JSON.parse(raw) as QEPluginManifest;

    const stat = fs.statSync(dir);
    return {
      manifest,
      path: dir,
      cachedAt: stat.birthtime.toISOString(),
    };
  }

  /**
   * Store a plugin in the cache by copying from a source directory.
   * Returns the cache path. If already cached, returns the existing path
   * (immutable — no overwrite).
   */
  store(manifest: QEPluginManifest, sourceDir: string): string {
    const dir = this.versionDir(manifest.name, manifest.version);

    if (fs.existsSync(dir)) {
      // Already cached — immutable, don't overwrite
      return dir;
    }

    // Copy source to cache
    fs.mkdirSync(dir, { recursive: true });
    this.copyDir(sourceDir, dir);

    // Write the manifest (ensure it's present even if source didn't have it at root)
    fs.writeFileSync(
      path.join(dir, 'qe-plugin.json'),
      JSON.stringify(manifest, null, 2),
    );

    // Cleanup old versions
    this.pruneOldVersions(manifest.name);

    return dir;
  }

  /** Remove a specific cached version. */
  remove(name: string, version: string): boolean {
    const dir = this.versionDir(name, version);
    if (!fs.existsSync(dir)) return false;

    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }

  /** List all cached versions for a plugin. */
  listVersions(name: string): CachedPlugin[] {
    const pluginDir = path.join(this.cacheDir, name);
    if (!fs.existsSync(pluginDir)) return [];

    const results: CachedPlugin[] = [];
    const entries = fs.readdirSync(pluginDir);

    for (const entry of entries) {
      const fullPath = path.join(pluginDir, entry);
      const manifestPath = path.join(fullPath, 'qe-plugin.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(raw) as QEPluginManifest;
          const stat = fs.statSync(fullPath);
          results.push({
            manifest,
            path: fullPath,
            cachedAt: stat.birthtime.toISOString(),
          });
        } catch {
          // Skip corrupted entries
        }
      }
    }

    return results;
  }

  /** List all cached plugins (latest version of each). */
  listAll(): CachedPlugin[] {
    if (!fs.existsSync(this.cacheDir)) return [];

    const results: CachedPlugin[] = [];
    const entries = fs.readdirSync(this.cacheDir);

    for (const name of entries) {
      const versions = this.listVersions(name);
      if (versions.length > 0) {
        // Return the latest version (lexicographic semver sort)
        versions.sort((a, b) => b.manifest.version.localeCompare(a.manifest.version));
        results.push(versions[0]);
      }
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private versionDir(name: string, version: string): string {
    return path.join(this.cacheDir, name, version);
  }

  private pruneOldVersions(name: string): void {
    const versions = this.listVersions(name);
    if (versions.length <= this.keepVersions) return;

    // Sort oldest first
    versions.sort((a, b) => a.cachedAt.localeCompare(b.cachedAt));

    const toRemove = versions.slice(0, versions.length - this.keepVersions);
    for (const cached of toRemove) {
      fs.rmSync(cached.path, { recursive: true, force: true });
    }
  }

  private copyDir(src: string, dest: string): void {
    if (!fs.existsSync(src)) return;
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // Skip .git directories
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
