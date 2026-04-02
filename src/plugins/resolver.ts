/**
 * Agentic QE v3 - Plugin Dependency Resolver (IMP-09)
 *
 * DFS dependency resolution with cycle detection.
 * Given a set of plugin manifests, produces a topologically-sorted
 * load order where dependencies are loaded before dependents.
 */

import type { QEPluginManifest } from './manifest';

// ============================================================================
// Types
// ============================================================================

export interface ResolvedPlugin {
  manifest: QEPluginManifest;
  /** Order index (0 = load first) */
  order: number;
}

export interface ResolutionResult {
  /** Plugins in dependency-safe load order */
  ordered: ResolvedPlugin[];
  /** Unresolvable dependencies (plugin -> missing deps) */
  missing: Map<string, string[]>;
}

// ============================================================================
// PluginResolver
// ============================================================================

export class PluginResolver {
  /**
   * Resolve plugin load order via DFS topological sort.
   *
   * @param manifests - All available plugin manifests
   * @returns Ordered list of plugins safe to load sequentially
   * @throws Error if a dependency cycle is detected
   */
  resolve(manifests: QEPluginManifest[]): ResolutionResult {
    const byName = new Map<string, QEPluginManifest>();
    for (const m of manifests) {
      byName.set(m.name, m);
    }

    const ordered: QEPluginManifest[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>(); // cycle detection (gray nodes)
    const missing = new Map<string, string[]>();

    const visit = (name: string, path: string[]): void => {
      if (visited.has(name)) return;

      if (visiting.has(name)) {
        const cycle = [...path.slice(path.indexOf(name)), name];
        throw new Error(
          `Dependency cycle detected: ${cycle.join(' -> ')}`,
        );
      }

      const manifest = byName.get(name);
      if (!manifest) {
        // Missing dependency — record it but don't fail the entire resolution
        return;
      }

      visiting.add(name);

      // Visit dependencies first
      const deps = Object.keys(manifest.dependencies ?? {});
      const missingDeps: string[] = [];

      for (const dep of deps) {
        if (!byName.has(dep)) {
          missingDeps.push(dep);
        } else {
          visit(dep, [...path, name]);
        }
      }

      if (missingDeps.length > 0) {
        missing.set(name, missingDeps);
      }

      visiting.delete(name);
      visited.add(name);
      ordered.push(manifest);
    };

    // Visit all plugins
    for (const m of manifests) {
      visit(m.name, []);
    }

    return {
      ordered: ordered.map((manifest, index) => ({ manifest, order: index })),
      missing,
    };
  }

  /**
   * Check if a specific plugin can be loaded given the currently loaded set.
   */
  canLoad(
    manifest: QEPluginManifest,
    loaded: Set<string>,
  ): { canLoad: boolean; missingDeps: string[] } {
    const deps = Object.keys(manifest.dependencies ?? {});
    const missingDeps = deps.filter(d => !loaded.has(d));
    return {
      canLoad: missingDeps.length === 0,
      missingDeps,
    };
  }
}
