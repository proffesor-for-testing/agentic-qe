/**
 * Dependency Resolver for Skill Loading
 * Handles skill dependency graphs with cycle detection and optimal load ordering
 */

import { SkillMetadata, SkillManifest } from './types.js';

/**
 * Dependency resolution result
 */
export interface DependencyResolution {
  /** Skills in optimal load order (dependencies first) */
  loadOrder: string[];
  /** Dependency tree for visualization */
  tree: DependencyNode;
  /** Any circular dependencies detected */
  cycles: string[][];
  /** Skills that couldn't be resolved (missing dependencies) */
  unresolved: { skillId: string; missing: string[] }[];
}

/**
 * Dependency tree node
 */
export interface DependencyNode {
  id: string;
  depth: number;
  dependencies: DependencyNode[];
}

/**
 * Resolution options
 */
export interface ResolverOptions {
  /** Maximum dependency depth to prevent infinite recursion */
  maxDepth: number;
  /** Include optional dependencies */
  includeOptional: boolean;
  /** Strategy for handling cycles */
  cycleStrategy: 'error' | 'warn' | 'break';
}

/**
 * Skill Dependency Resolver
 * Resolves skill dependencies with cycle detection and optimal ordering
 */
export class DependencyResolver {
  private manifest: SkillManifest;
  private skillMap: Map<string, SkillMetadata>;
  private options: ResolverOptions;

  constructor(manifest: SkillManifest, options: Partial<ResolverOptions> = {}) {
    this.manifest = manifest;
    this.skillMap = new Map(manifest.skills.map(s => [s.id, s]));
    this.options = {
      maxDepth: 10,
      includeOptional: true,
      cycleStrategy: 'warn',
      ...options,
    };
  }

  /**
   * Resolve dependencies for a single skill
   */
  resolve(skillId: string): DependencyResolution {
    return this.resolveMultiple([skillId]);
  }

  /**
   * Resolve dependencies for multiple skills
   */
  resolveMultiple(skillIds: string[]): DependencyResolution {
    const visited = new Set<string>();
    const loadOrder: string[] = [];
    const cycles: string[][] = [];
    const unresolved: { skillId: string; missing: string[] }[] = [];

    // Build dependency tree for each skill
    const trees: DependencyNode[] = [];

    for (const skillId of skillIds) {
      const result = this.buildDependencyTree(skillId, [], 0, visited);
      trees.push(result.node);
      cycles.push(...result.cycles);
      unresolved.push(...result.unresolved);
    }

    // Topological sort for optimal load order
    const sortedOrder = this.topologicalSort(skillIds);
    loadOrder.push(...sortedOrder);

    // Merge trees into single root
    const mergedTree: DependencyNode = {
      id: 'root',
      depth: -1,
      dependencies: trees,
    };

    return {
      loadOrder,
      tree: mergedTree,
      cycles: this.deduplicateCycles(cycles),
      unresolved,
    };
  }

  /**
   * Get all skills that depend on a given skill (reverse dependencies)
   */
  getDependents(skillId: string): string[] {
    const dependents: string[] = [];

    for (const skill of this.manifest.skills) {
      if (skill.dependencies?.includes(skillId)) {
        dependents.push(skill.id);
      }
    }

    return dependents;
  }

  /**
   * Get direct dependencies of a skill
   */
  getDirectDependencies(skillId: string): string[] {
    const skill = this.skillMap.get(skillId);
    return skill?.dependencies || [];
  }

  /**
   * Get all transitive dependencies (full dependency closure)
   */
  getTransitiveDependencies(skillId: string): string[] {
    const resolution = this.resolve(skillId);
    return resolution.loadOrder.filter(id => id !== skillId);
  }

  /**
   * Check if adding a dependency would create a cycle
   */
  wouldCreateCycle(fromSkillId: string, toSkillId: string): boolean {
    // Check if toSkillId already depends on fromSkillId
    const deps = this.getTransitiveDependencies(toSkillId);
    return deps.includes(fromSkillId);
  }

  /**
   * Build dependency tree recursively
   */
  private buildDependencyTree(
    skillId: string,
    path: string[],
    depth: number,
    globalVisited: Set<string>
  ): { node: DependencyNode; cycles: string[][]; unresolved: { skillId: string; missing: string[] }[] } {
    const cycles: string[][] = [];
    const unresolved: { skillId: string; missing: string[] }[] = [];

    // Check for cycle
    if (path.includes(skillId)) {
      const cycleStart = path.indexOf(skillId);
      const cycle = [...path.slice(cycleStart), skillId];
      cycles.push(cycle);

      if (this.options.cycleStrategy === 'error') {
        throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
      }

      // Return leaf node to break cycle
      return {
        node: { id: skillId, depth, dependencies: [] },
        cycles,
        unresolved,
      };
    }

    // Check max depth
    if (depth > this.options.maxDepth) {
      return {
        node: { id: skillId, depth, dependencies: [] },
        cycles,
        unresolved,
      };
    }

    const skill = this.skillMap.get(skillId);

    if (!skill) {
      return {
        node: { id: skillId, depth, dependencies: [] },
        cycles,
        unresolved: [{ skillId, missing: [skillId] }],
      };
    }

    // Check for missing dependencies
    const missing = (skill.dependencies || []).filter(dep => !this.skillMap.has(dep));
    if (missing.length > 0) {
      unresolved.push({ skillId, missing });
    }

    // Build children
    const dependencies: DependencyNode[] = [];
    const newPath = [...path, skillId];

    for (const depId of skill.dependencies || []) {
      if (!this.skillMap.has(depId)) continue;
      if (globalVisited.has(depId) && !path.includes(depId)) {
        // Already fully processed, add as leaf
        dependencies.push({ id: depId, depth: depth + 1, dependencies: [] });
      } else {
        const result = this.buildDependencyTree(depId, newPath, depth + 1, globalVisited);
        dependencies.push(result.node);
        cycles.push(...result.cycles);
        unresolved.push(...result.unresolved);
      }
    }

    globalVisited.add(skillId);

    return {
      node: { id: skillId, depth, dependencies },
      cycles,
      unresolved,
    };
  }

  /**
   * Topological sort for optimal load order (dependencies first)
   */
  private topologicalSort(startIds: string[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>(); // For cycle detection

    const visit = (skillId: string): void => {
      if (visited.has(skillId)) return;
      if (visiting.has(skillId)) return; // Cycle, skip

      visiting.add(skillId);

      const skill = this.skillMap.get(skillId);
      if (skill?.dependencies) {
        for (const depId of skill.dependencies) {
          if (this.skillMap.has(depId)) {
            visit(depId);
          }
        }
      }

      visiting.delete(skillId);
      visited.add(skillId);
      result.push(skillId);
    };

    // Start from requested skills
    for (const startId of startIds) {
      visit(startId);
    }

    return result;
  }

  /**
   * Deduplicate cycle arrays (same cycle may be detected from different starting points)
   */
  private deduplicateCycles(cycles: string[][]): string[][] {
    const seen = new Set<string>();
    const unique: string[][] = [];

    for (const cycle of cycles) {
      // Normalize cycle by starting from smallest element
      const normalized = this.normalizeCycle(cycle);
      const key = normalized.join('->');

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(normalized);
      }
    }

    return unique;
  }

  /**
   * Normalize cycle to start from smallest element for deduplication
   */
  private normalizeCycle(cycle: string[]): string[] {
    if (cycle.length <= 1) return cycle;

    // Remove duplicate end if present
    const normalized = cycle[0] === cycle[cycle.length - 1]
      ? cycle.slice(0, -1)
      : cycle;

    // Find index of smallest element
    let minIndex = 0;
    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i] < normalized[minIndex]) {
        minIndex = i;
      }
    }

    // Rotate to start from smallest
    return [...normalized.slice(minIndex), ...normalized.slice(0, minIndex)];
  }
}

/**
 * Create a dependency resolver from manifest
 */
export function createDependencyResolver(
  manifest: SkillManifest,
  options?: Partial<ResolverOptions>
): DependencyResolver {
  return new DependencyResolver(manifest, options);
}

/**
 * Visualize dependency tree as ASCII art
 */
export function visualizeDependencyTree(node: DependencyNode, prefix: string = ''): string {
  const lines: string[] = [];

  if (node.id !== 'root') {
    lines.push(`${prefix}${node.id}`);
  }

  const childPrefix = node.id === 'root' ? '' : prefix + '  ';

  for (let i = 0; i < node.dependencies.length; i++) {
    const child = node.dependencies[i];
    const isLast = i === node.dependencies.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const nextPrefix = childPrefix + (isLast ? '    ' : '│   ');

    lines.push(`${childPrefix}${connector}${child.id}`);

    if (child.dependencies.length > 0) {
      lines.push(visualizeDependencyTree(child, nextPrefix));
    }
  }

  return lines.join('\n');
}
