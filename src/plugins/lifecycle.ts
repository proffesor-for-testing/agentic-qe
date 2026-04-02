/**
 * Agentic QE v3 - Plugin Lifecycle Manager (IMP-09)
 *
 * Orchestrates the full plugin lifecycle:
 *   discover -> validate -> resolve deps -> cache -> load -> register
 *
 * Integrates with:
 *   - Plugin sources (local, GitHub, npm) for discovery
 *   - Plugin cache for versioned immutable storage
 *   - Plugin resolver for dependency ordering
 *   - Plugin security for validation
 *   - Kernel PluginLoader for registration
 */

import type { QEPluginManifest } from './manifest';
import { validateManifest } from './manifest';
import { PluginCache, type CachedPlugin } from './cache';
import { PluginResolver, type ResolutionResult } from './resolver';
import { checkPluginSecurity, type SecurityCheckResult } from './security';
import { LocalPluginSource, type PluginSource } from './sources/local';

// ============================================================================
// Types
// ============================================================================

export interface PluginLifecycleOptions {
  /** Plugin cache instance */
  cache?: PluginCache;
  /** Additional plugin sources beyond local */
  sources?: PluginSource[];
}

export interface InstallResult {
  success: boolean;
  manifest?: QEPluginManifest;
  cachePath?: string;
  errors: string[];
  securityViolations: string[];
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  domains: string[];
  source: string;
  cachePath: string;
}

// ============================================================================
// PluginLifecycleManager
// ============================================================================

export class PluginLifecycleManager {
  private readonly cache: PluginCache;
  private readonly resolver: PluginResolver;
  private readonly sources: Map<string, PluginSource> = new Map();

  constructor(options: PluginLifecycleOptions = {}) {
    this.cache = options.cache ?? new PluginCache();
    this.resolver = new PluginResolver();

    // Register default local source
    const localSource = new LocalPluginSource();
    this.sources.set('local', localSource);

    // Register additional sources
    if (options.sources) {
      for (const source of options.sources) {
        this.sources.set(source.type, source);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Install a plugin from a given location.
   * Runs the full lifecycle: resolve -> validate -> security check -> cache.
   * Disabled via AQE_PLUGINS_DISABLED=true.
   */
  async install(location: string, sourceType: string = 'local'): Promise<InstallResult> {
    if (process.env.AQE_PLUGINS_DISABLED === 'true') {
      return {
        success: false,
        errors: ['Plugin loading is disabled (AQE_PLUGINS_DISABLED=true)'],
        securityViolations: [],
      };
    }

    const errors: string[] = [];

    // 1. Get the source
    const source = this.sources.get(sourceType);
    if (!source) {
      return {
        success: false,
        errors: [`Unknown source type: ${sourceType}. Available: ${[...this.sources.keys()].join(', ')}`],
        securityViolations: [],
      };
    }

    // 2. Resolve manifest from source
    let manifest: QEPluginManifest;
    try {
      manifest = await source.resolve(location);
    } catch (err) {
      return {
        success: false,
        errors: [`Failed to resolve plugin: ${err instanceof Error ? err.message : String(err)}`],
        securityViolations: [],
      };
    }

    // 3. Validate manifest
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return {
        success: false,
        manifest,
        errors: validation.errors,
        securityViolations: [],
      };
    }

    // 4. Security check
    const security: SecurityCheckResult = checkPluginSecurity(manifest);
    if (!security.safe) {
      return {
        success: false,
        manifest,
        errors: ['Plugin failed security checks'],
        securityViolations: security.violations,
      };
    }

    // 5. Check if already cached
    if (this.cache.has(manifest.name, manifest.version)) {
      const cached = this.cache.get(manifest.name, manifest.version)!;
      return {
        success: true,
        manifest,
        cachePath: cached.path,
        errors: [],
        securityViolations: [],
      };
    }

    // 6. Get plugin path and store in cache
    let pluginPath: string;
    try {
      pluginPath = await source.getPluginPath(location);
    } catch (err) {
      return {
        success: false,
        manifest,
        errors: [`Failed to get plugin path: ${err instanceof Error ? err.message : String(err)}`],
        securityViolations: [],
      };
    }

    const cachePath = this.cache.store(manifest, pluginPath);

    return {
      success: true,
      manifest,
      cachePath,
      errors,
      securityViolations: [],
    };
  }

  /**
   * Remove a plugin from the cache.
   */
  remove(name: string, version?: string): boolean {
    if (version) {
      return this.cache.remove(name, version);
    }

    // Remove all versions
    const versions = this.cache.listVersions(name);
    let removed = false;
    for (const v of versions) {
      if (this.cache.remove(name, v.manifest.version)) {
        removed = true;
      }
    }
    return removed;
  }

  /**
   * List all installed plugins.
   */
  list(): PluginInfo[] {
    const cached: CachedPlugin[] = this.cache.listAll();
    return cached.map(c => ({
      name: c.manifest.name,
      version: c.manifest.version,
      description: c.manifest.description,
      domains: c.manifest.domains,
      source: 'cached',
      cachePath: c.path,
    }));
  }

  /**
   * Resolve load order for all cached plugins.
   */
  resolveLoadOrder(): ResolutionResult {
    const all = this.cache.listAll();
    return this.resolver.resolve(all.map(c => c.manifest));
  }

  /**
   * Register a plugin source.
   */
  registerSource(source: PluginSource): void {
    this.sources.set(source.type, source);
  }
}
