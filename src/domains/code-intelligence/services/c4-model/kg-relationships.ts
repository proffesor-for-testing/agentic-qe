/**
 * ADR-112 C2 — real component relationships from the Knowledge Graph.
 *
 * The detector models components as top-level `src/` directories but its edge
 * detection is a NAMING heuristic (`likelyHasRelationship`) that never reads the
 * code. This module folds the KnowledgeGraph's REAL file-level import/call edges
 * (extracted from the AST by the TS parser — no LLM needed) up to
 * component→component relationships.
 *
 * Pure aggregation + a resolver that drives the existing KG. The resolver
 * returns `null` on any miss so the bridge falls back to the heuristic — C2 can
 * only improve accuracy, never break generation.
 */

import * as path from 'path';
import type { DetectedComponent, DetectedRelationship } from '../../../../shared/c4-model';

/** Minimal shape of the KG `mapDependencies` result we consume. */
export interface DependencyMapLike {
  nodes: Array<{ id: string; path: string }>;
  edges: Array<{ source: string; target: string }>;
}

/** Minimal slice of the KnowledgeGraph the resolver needs (keeps this decoupled). */
export interface KnowledgeGraphSlice {
  index(req: { paths: string[]; incremental?: boolean }): Promise<{ success: boolean }>;
  mapDependencies(req: {
    files: string[];
    direction: 'incoming' | 'outgoing' | 'both';
    depth?: number;
  }): Promise<{ success: boolean; value?: DependencyMapLike }>;
}

/**
 * Resolve real component relationships for a set of detected components.
 * Returns `null` when it cannot (no files, KG miss, no cross-component edges) so
 * the caller keeps the heuristic.
 */
export type RelationshipResolver = (
  components: DetectedComponent[],
  projectPath: string,
) => Promise<DetectedRelationship[] | null>;

const normalize = (projectPath: string, p: string): string =>
  path.resolve(projectPath, p).replace(/\\/g, '/');

/**
 * PURE: fold file-level dependency edges into component→component relationships.
 * An edge counts only when both endpoints map to *different* components; weight =
 * number of underlying file edges. Exported for direct testing.
 */
export function aggregateDependencyMapToComponentRelationships(
  components: DetectedComponent[],
  dependencyMap: DependencyMapLike,
  projectPath: string,
): DetectedRelationship[] {
  // normalized file path → componentId
  const fileToComponent = new Map<string, string>();
  for (const c of components) {
    for (const f of c.files ?? []) fileToComponent.set(normalize(projectPath, f), c.id);
  }
  const idToPath = new Map(dependencyMap.nodes.map((n) => [n.id, normalize(projectPath, n.path)]));

  const componentOf = (nodeId: string): string | undefined => {
    const p = idToPath.get(nodeId);
    if (!p) return undefined;
    const exact = fileToComponent.get(p);
    if (exact) return exact;
    // Tolerate abs/rel divergence from the parser via a suffix match.
    for (const [file, cid] of fileToComponent) {
      if (p.endsWith(file) || file.endsWith(p)) return cid;
    }
    return undefined;
  };

  const byKey = new Map<string, DetectedRelationship>();
  for (const e of dependencyMap.edges) {
    const cs = componentOf(e.source);
    const ct = componentOf(e.target);
    if (!cs || !ct || cs === ct) continue;
    const key = `${cs}->${ct}`;
    const existing = byKey.get(key);
    if (existing) existing.weight = (existing.weight ?? 1) + 1;
    else byKey.set(key, { sourceId: cs, targetId: ct, type: 'depends_on', weight: 1 });
  }
  return [...byKey.values()];
}

/**
 * A KG factory scoped to a project root. Building the KG per-call lets us set
 * the FileReader base directory to `projectPath`, so analyzing a repo outside
 * cwd doesn't trip the path-traversal guard.
 */
export type KnowledgeGraphFactory = (projectPath: string) => KnowledgeGraphSlice;

/**
 * Build a resolver backed by the existing KnowledgeGraph. It (incrementally)
 * indexes the component files so edges exist regardless of prior `aqe code
 * index`, maps their dependencies, and aggregates to component edges.
 *
 * Accepts a project-scoped factory (preferred) or a single pre-built KG.
 */
export function createKnowledgeGraphRelationshipResolver(
  kgOrFactory: KnowledgeGraphSlice | KnowledgeGraphFactory,
  opts: { autoIndex?: boolean } = {},
): RelationshipResolver {
  const autoIndex = opts.autoIndex ?? true;
  const factory: KnowledgeGraphFactory =
    typeof kgOrFactory === 'function' ? kgOrFactory : () => kgOrFactory;
  return async (components, projectPath) => {
    const absFiles = components.flatMap((c) =>
      (c.files ?? []).map((f) => path.resolve(projectPath, f)),
    );
    if (absFiles.length === 0) return null;
    try {
      const kg = factory(projectPath);
      if (autoIndex) await kg.index({ paths: absFiles, incremental: true });
      const dep = await kg.mapDependencies({ files: absFiles, direction: 'both' });
      if (!dep.success || !dep.value) return null;
      const rels = aggregateDependencyMapToComponentRelationships(components, dep.value, projectPath);
      return rels.length > 0 ? rels : null;
    } catch {
      return null; // any failure → heuristic fallback
    }
  };
}
