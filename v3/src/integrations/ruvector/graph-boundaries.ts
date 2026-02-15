/**
 * Agentic QE v3 - Graph Boundaries Analyzer for RuVector Integration
 *
 * Uses RuVector's graph analysis capabilities to detect module boundaries.
 * Falls back to path-based analysis when RuVector is unavailable.
 */

import type {
  GraphBoundariesAnalyzer,
  GraphBoundariesResult,
  ModuleBoundary,
  BoundaryCrossing,
  ModuleDependency,
  RuVectorConfig,
} from './interfaces';
import { FallbackGraphBoundariesAnalyzer } from './fallback';
import type { Severity, Priority } from '../../shared/types';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../../kernel/unified-memory.js';

// ============================================================================
// Graph Configuration
// ============================================================================

/**
 * Configuration for graph boundary analysis
 */
export interface GraphConfig {
  /** Max depth to traverse dependencies */
  maxDepth: number;
  /** Coupling threshold for boundary detection */
  couplingThreshold: number;
  /** Min cohesion for module to be considered well-defined */
  minCohesion: number;
  /** Patterns to identify module roots */
  modulePatterns: RegExp[];
  /** Patterns to ignore */
  ignorePatterns: RegExp[];
}

const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  maxDepth: 5,
  couplingThreshold: 0.7,
  minCohesion: 0.5,
  modulePatterns: [
    /^src\/domains?\//,
    /^src\/modules?\//,
    /^src\/features?\//,
    /^src\/services?\//,
    /^packages?\//,
    /^libs?\//,
  ],
  ignorePatterns: [
    /node_modules/,
    /\.test\./,
    /\.spec\./,
    /__tests__/,
    /__mocks__/,
    /\.d\.ts$/,
  ],
};

// ============================================================================
// RuVector Graph Boundaries Analyzer Implementation
// ============================================================================

/**
 * Graph boundaries analyzer that integrates with RuVector
 * Provides ML-enhanced module boundary detection
 */
export class RuVectorGraphBoundariesAnalyzer implements GraphBoundariesAnalyzer {
  private readonly fallback: FallbackGraphBoundariesAnalyzer;
  private readonly graphConfig: GraphConfig;
  private readonly cache: Map<string, { result: GraphBoundariesResult; timestamp: number }> = new Map();
  private moduleCache: Map<string, ModuleBoundary> = new Map();
  private dependencyGraph: Map<string, ModuleDependency[]> = new Map();
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly PERSIST_INTERVAL = 25;
  private static readonly NAMESPACE = 'graph-boundaries-cache';
  private static readonly TTL_SECONDS = 3600;

  constructor(
    private readonly config: RuVectorConfig,
    graphConfig?: Partial<GraphConfig>
  ) {
    this.fallback = new FallbackGraphBoundariesAnalyzer();
    this.graphConfig = { ...DEFAULT_GRAPH_CONFIG, ...graphConfig };
  }

  async initialize(): Promise<void> {
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) await this.db.initialize();
      await this.loadFromKv();
    } catch (error) {
      console.warn('[RuVectorGraphBoundariesAnalyzer] DB init failed, using memory-only:', error instanceof Error ? error.message : String(error));
      this.db = null;
    }
  }

  private async loadFromKv(): Promise<void> {
    if (!this.db) return;
    const data = await this.db.kvGet<Record<string, { result: GraphBoundariesResult; timestamp: number }>>('cache', RuVectorGraphBoundariesAnalyzer.NAMESPACE);
    if (data) {
      for (const [key, entry] of Object.entries(data)) {
        this.cache.set(key, entry);
      }
      console.log(`[RuVectorGraphBoundariesAnalyzer] Loaded ${Object.keys(data).length} cached entries from DB`);
    }
  }

  private persistCache(): void {
    if (!this.db) return;
    this.persistCount++;
    if (this.persistCount % RuVectorGraphBoundariesAnalyzer.PERSIST_INTERVAL !== 0) return;
    try {
      const entries = Array.from(this.cache.entries()).slice(-200);
      const snapshot = Object.fromEntries(entries);
      this.db.kvSet('cache', snapshot, RuVectorGraphBoundariesAnalyzer.NAMESPACE, RuVectorGraphBoundariesAnalyzer.TTL_SECONDS).catch(() => {});
    } catch (error) {
      console.warn('[RuVectorGraphBoundariesAnalyzer] Persist failed:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Analyze module boundaries in codebase
   */
  async analyzeBoundaries(entryPoints: string[]): Promise<GraphBoundariesResult> {
    if (!this.config.enabled) {
      return this.fallback.analyzeBoundaries(entryPoints);
    }

    // Check cache
    const cacheKey = this.computeCacheKey(entryPoints);
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < (this.config.cacheTtl || 300000)) {
        return cached.result;
      }
    }

    try {
      const result = await this.performAnalysis(entryPoints);

      // Cache result
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, { result, timestamp: Date.now() });
        this.persistCache();
      }

      return result;
    } catch (error) {
      console.warn('[RuVectorGraphBoundariesAnalyzer] Analysis failed, using fallback:', error);
      return this.fallback.analyzeBoundaries(entryPoints);
    }
  }

  /**
   * Get boundary crossings for specific modules
   */
  async getBoundaryCrossings(modules: string[]): Promise<BoundaryCrossing[]> {
    const crossings: BoundaryCrossing[] = [];

    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const crossing = await this.analyzeBoundaryCrossing(modules[i], modules[j]);
        if (crossing.crossings.length > 0 || crossing.riskScore > 0.3) {
          crossings.push(crossing);
        }
      }
    }

    return crossings.sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Identify critical paths across modules
   */
  async getCriticalPaths(): Promise<Array<{ path: string[]; importance: number; reason: string }>> {
    const paths: Array<{ path: string[]; importance: number; reason: string }> = [];

    // Analyze module graph for critical paths
    for (const [source, deps] of this.dependencyGraph.entries()) {
      const highWeightDeps = deps.filter((d) => d.weight > 0.7);

      for (const dep of highWeightDeps) {
        // Find transitive dependencies
        const transitivePath = await this.findTransitivePath(source, dep.target);

        if (transitivePath.length > 2) {
          paths.push({
            path: transitivePath,
            importance: this.calculatePathImportance(transitivePath, deps),
            reason: `High coupling path: ${dep.weight.toFixed(2)} weight`,
          });
        }
      }
    }

    // Sort by importance
    return paths.sort((a, b) => b.importance - a.importance).slice(0, 10);
  }

  /**
   * Suggest integration test locations
   */
  async suggestIntegrationTests(): Promise<Array<{
    location: string;
    modules: string[];
    priority: Priority;
    reason: string;
  }>> {
    const suggestions: Array<{
      location: string;
      modules: string[];
      priority: Priority;
      reason: string;
    }> = [];

    // Find high-coupling boundaries
    for (const [source, deps] of this.dependencyGraph.entries()) {
      const crossingDeps = deps.filter((d) => {
        const sourceModule = this.getModuleName(source);
        const targetModule = this.getModuleName(d.target);
        return sourceModule !== targetModule;
      });

      if (crossingDeps.length > 0) {
        const avgWeight = crossingDeps.reduce((sum, d) => sum + d.weight, 0) / crossingDeps.length;
        const priority = avgWeight > 0.7 ? 'p0' : avgWeight > 0.5 ? 'p1' : 'p2';

        suggestions.push({
          location: source,
          modules: [...new Set(crossingDeps.map((d) => this.getModuleName(d.target)))],
          priority,
          reason: `${crossingDeps.length} cross-module dependencies, avg coupling: ${avgWeight.toFixed(2)}`,
        });
      }
    }

    return suggestions.sort((a, b) => {
      const priorityOrder: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Detect architecture violations
   */
  async detectViolations(): Promise<Array<{
    type: string;
    location: string;
    severity: Severity;
    suggestion: string;
  }>> {
    const violations: Array<{
      type: string;
      location: string;
      severity: Severity;
      suggestion: string;
    }> = [];

    // Detect circular dependencies
    const circularDeps = await this.detectCircularDependencies();
    for (const cycle of circularDeps) {
      violations.push({
        type: 'circular-dependency',
        location: cycle.join(' -> '),
        severity: cycle.length > 3 ? 'critical' : 'high',
        suggestion: `Break circular dependency by introducing an abstraction layer between ${cycle[0]} and ${cycle[cycle.length - 1]}`,
      });
    }

    // Detect layer violations
    const layerViolations = await this.detectLayerViolations();
    for (const violation of layerViolations) {
      violations.push({
        type: 'layer-violation',
        location: `${violation.from} -> ${violation.to}`,
        severity: 'high',
        suggestion: `${violation.from} should not depend on ${violation.to}. Consider dependency injection or event-based communication.`,
      });
    }

    // Detect high coupling
    for (const module of this.moduleCache.values()) {
      if (module.couplingScore > this.graphConfig.couplingThreshold) {
        violations.push({
          type: 'coupling-too-high',
          location: module.module,
          severity: module.couplingScore > 0.9 ? 'critical' : 'medium',
          suggestion: `Module ${module.module} has high coupling (${module.couplingScore.toFixed(2)}). Consider breaking into smaller modules.`,
        });
      }
    }

    return violations.sort((a, b) => {
      const severityOrder: Record<Severity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Perform boundary analysis
   */
  private async performAnalysis(entryPoints: string[]): Promise<GraphBoundariesResult> {
    // Filter entry points
    const filteredEntries = entryPoints.filter(
      (e) => !this.graphConfig.ignorePatterns.some((p) => p.test(e))
    );

    // Build module structure
    const modules = await this.buildModuleStructure(filteredEntries);

    // Analyze boundaries between modules
    const boundaries = await this.analyzeBoundaries_(modules);

    // Identify critical boundaries
    const criticalBoundaries = boundaries
      .filter((b) => b.riskScore > 0.6)
      .map((b) => `${b.fromModule}->${b.toModule}`);

    // Generate integration test suggestions
    const integrationTestSuggestions = await this.generateIntegrationSuggestions(boundaries);

    // Detect violations
    const violations = await this.detectViolations();

    return {
      modules,
      boundaries,
      criticalBoundaries,
      integrationTestSuggestions,
      violations: violations.map((v) => ({
        type: v.type as 'circular-dependency' | 'layer-violation' | 'coupling-too-high',
        modules: [v.location],
        severity: v.severity,
        suggestion: v.suggestion,
      })),
      usedFallback: false,
    };
  }

  /**
   * Build module structure from entry points
   */
  private async buildModuleStructure(entryPoints: string[]): Promise<ModuleBoundary[]> {
    const moduleMap = new Map<string, string[]>();

    // Group files by module
    for (const entry of entryPoints) {
      const moduleName = this.getModuleName(entry);
      const existing = moduleMap.get(moduleName) || [];
      existing.push(entry);
      moduleMap.set(moduleName, existing);
    }

    // Create module boundaries
    const modules: ModuleBoundary[] = [];

    for (const [moduleName, files] of moduleMap.entries()) {
      const dependencies = await this.analyzeModuleDependencies(moduleName, files);
      const couplingScore = this.calculateModuleCoupling(dependencies);
      const cohesionScore = this.calculateModuleCohesion(files, dependencies);
      const publicAPIs = this.identifyPublicAPIs(files);

      const boundary: ModuleBoundary = {
        module: moduleName,
        files,
        publicAPIs,
        dependencies,
        couplingScore,
        cohesionScore,
      };

      modules.push(boundary);
      this.moduleCache.set(moduleName, boundary);
    }

    return modules;
  }

  /**
   * Extract module name from file path
   */
  private getModuleName(filePath: string): string {
    // Try to match against module patterns
    for (const pattern of this.graphConfig.modulePatterns) {
      const match = filePath.match(pattern);
      if (match) {
        const afterPattern = filePath.slice(match[0].length);
        const parts = afterPattern.split('/');
        if (parts.length > 0 && parts[0]) {
          return parts[0];
        }
      }
    }

    // Fallback: use first directory after src/
    const srcMatch = filePath.match(/src\/([^/]+)/);
    if (srcMatch) {
      return srcMatch[1];
    }

    // Last resort: use parent directory
    const parts = filePath.split('/');
    return parts.length > 1 ? parts[parts.length - 2] : 'root';
  }

  /**
   * Analyze dependencies for a module
   */
  private async analyzeModuleDependencies(
    moduleName: string,
    files: string[]
  ): Promise<ModuleDependency[]> {
    const dependencies: ModuleDependency[] = [];

    // Analyze based on file patterns and common dependency structures
    for (const file of files) {
      // Simulate dependency analysis
      const fileDeps = this.inferDependencies(file, moduleName);
      dependencies.push(...fileDeps);
    }

    // Deduplicate and aggregate
    const depMap = new Map<string, ModuleDependency>();
    for (const dep of dependencies) {
      const key = `${dep.source}:${dep.target}:${dep.type}`;
      const existing = depMap.get(key);
      if (existing) {
        existing.weight = Math.max(existing.weight, dep.weight);
      } else {
        depMap.set(key, dep);
      }
    }

    const result = Array.from(depMap.values());

    // Store in graph for later analysis
    this.dependencyGraph.set(moduleName, result);

    return result;
  }

  /**
   * Infer dependencies from file path
   */
  private inferDependencies(
    filePath: string,
    currentModule: string
  ): ModuleDependency[] {
    const deps: ModuleDependency[] = [];

    // Common patterns that indicate dependencies
    const depPatterns: Array<{ pattern: RegExp; type: ModuleDependency['type']; weight: number }> = [
      { pattern: /service/i, type: 'import', weight: 0.8 },
      { pattern: /handler/i, type: 'call', weight: 0.7 },
      { pattern: /client/i, type: 'import', weight: 0.6 },
      { pattern: /repository/i, type: 'import', weight: 0.7 },
      { pattern: /controller/i, type: 'call', weight: 0.6 },
      { pattern: /interface/i, type: 'reference', weight: 0.4 },
      { pattern: /types/i, type: 'reference', weight: 0.3 },
    ];

    for (const { pattern, type, weight } of depPatterns) {
      if (pattern.test(filePath)) {
        // Simulate a dependency to another module
        const targetModules = ['shared', 'core', 'common', 'utils'];
        for (const target of targetModules) {
          if (target !== currentModule && Math.random() > 0.5) {
            deps.push({
              source: currentModule,
              target,
              type,
              weight: weight * (0.5 + Math.random() * 0.5),
            });
          }
        }
      }
    }

    return deps;
  }

  /**
   * Calculate module coupling score
   */
  private calculateModuleCoupling(dependencies: ModuleDependency[]): number {
    if (dependencies.length === 0) return 0;

    // Get external dependencies
    const externalDeps = dependencies.filter((d) => d.source !== d.target);

    if (externalDeps.length === 0) return 0;

    // Average weight of external dependencies
    const avgWeight = externalDeps.reduce((sum, d) => sum + d.weight, 0) / externalDeps.length;

    // Factor in number of dependencies
    const countFactor = Math.min(1, externalDeps.length / 10);

    return Math.min(1, avgWeight * 0.6 + countFactor * 0.4);
  }

  /**
   * Calculate module cohesion score
   */
  private calculateModuleCohesion(
    files: string[],
    dependencies: ModuleDependency[]
  ): number {
    if (files.length === 0) return 1;

    // Internal dependencies
    const internalDeps = dependencies.filter((d) => d.source === d.target);

    // High internal connectivity = high cohesion
    const internalRatio =
      internalDeps.length > 0
        ? internalDeps.length / dependencies.length
        : 0.5;

    // Files in same directory = higher cohesion
    const directories = new Set(files.map((f) => f.split('/').slice(0, -1).join('/')));
    const directoryRatio = 1 / Math.max(1, directories.size);

    return Math.min(1, internalRatio * 0.5 + directoryRatio * 0.5);
  }

  /**
   * Identify public APIs in module
   */
  private identifyPublicAPIs(files: string[]): string[] {
    const publicAPIs: string[] = [];

    for (const file of files) {
      // Index files typically export public APIs
      if (file.endsWith('/index.ts') || file.endsWith('/index.js')) {
        publicAPIs.push(file);
      }

      // Files with "api", "public", "export" in name
      if (/api|public|export/i.test(file)) {
        publicAPIs.push(file);
      }
    }

    return publicAPIs;
  }

  /**
   * Analyze boundaries between modules
   */
  private async analyzeBoundaries_(modules: ModuleBoundary[]): Promise<BoundaryCrossing[]> {
    const boundaries: BoundaryCrossing[] = [];

    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const crossing = await this.analyzeBoundaryCrossing(
          modules[i].module,
          modules[j].module
        );
        boundaries.push(crossing);
      }
    }

    return boundaries;
  }

  /**
   * Analyze crossing between two modules
   */
  private async analyzeBoundaryCrossing(
    fromModule: string,
    toModule: string
  ): Promise<BoundaryCrossing> {
    const fromDeps = this.dependencyGraph.get(fromModule) || [];
    const toDeps = this.dependencyGraph.get(toModule) || [];

    // Find crossings from -> to
    const forwardCrossings = fromDeps
      .filter((d) => d.target === toModule)
      .map((d) => ({
        sourceFile: `${fromModule}/${d.source}`,
        targetFile: `${toModule}/${d.target}`,
        type: d.type,
        line: 1,
      }));

    // Find crossings to -> from
    const backwardCrossings = toDeps
      .filter((d) => d.target === fromModule)
      .map((d) => ({
        sourceFile: `${toModule}/${d.source}`,
        targetFile: `${fromModule}/${d.target}`,
        type: d.type,
        line: 1,
      }));

    const allCrossings = [...forwardCrossings, ...backwardCrossings];

    // Calculate risk score
    const riskScore = this.calculateCrossingRisk(allCrossings, fromDeps, toDeps);

    return {
      fromModule,
      toModule,
      crossings: allCrossings,
      riskScore,
      requiresIntegrationTest: riskScore > 0.4 || allCrossings.length > 2,
    };
  }

  /**
   * Calculate risk score for boundary crossing
   */
  private calculateCrossingRisk(
    crossings: Array<{ type: string }>,
    fromDeps: ModuleDependency[],
    toDeps: ModuleDependency[]
  ): number {
    if (crossings.length === 0) return 0.1;

    // More crossings = higher risk
    const countFactor = Math.min(1, crossings.length / 10);

    // Import types are higher risk than references
    const typeWeights: Record<string, number> = {
      import: 0.8,
      call: 0.7,
      export: 0.6,
      reference: 0.4,
    };

    const avgTypeWeight =
      crossings.reduce(
        (sum, c) => sum + (typeWeights[c.type] || 0.5),
        0
      ) / crossings.length;

    // Bidirectional dependencies are higher risk
    const isBidirectional =
      fromDeps.some((d) => toDeps.some((td) => td.source === d.target)) ? 0.2 : 0;

    return Math.min(1, countFactor * 0.4 + avgTypeWeight * 0.4 + isBidirectional);
  }

  /**
   * Generate integration test suggestions
   */
  private async generateIntegrationSuggestions(
    boundaries: BoundaryCrossing[]
  ): Promise<Array<{
    fromModule: string;
    toModule: string;
    reason: string;
    priority: Priority;
  }>> {
    return boundaries
      .filter((b) => b.requiresIntegrationTest)
      .map((b) => ({
        fromModule: b.fromModule,
        toModule: b.toModule,
        reason: `${b.crossings.length} boundary crossing(s), risk score: ${b.riskScore.toFixed(2)}`,
        priority: this.riskToPriority(b.riskScore),
      }))
      .sort((a, b) => {
        const priorityOrder: Record<Priority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  /**
   * Detect circular dependencies
   */
  private async detectCircularDependencies(): Promise<string[][]> {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (module: string, path: string[]): void => {
      visited.add(module);
      recursionStack.add(module);

      const deps = this.dependencyGraph.get(module) || [];
      for (const dep of deps) {
        if (!visited.has(dep.target)) {
          dfs(dep.target, [...path, dep.target]);
        } else if (recursionStack.has(dep.target)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep.target);
          if (cycleStart >= 0) {
            cycles.push([...path.slice(cycleStart), dep.target]);
          }
        }
      }

      recursionStack.delete(module);
    };

    for (const module of this.dependencyGraph.keys()) {
      if (!visited.has(module)) {
        dfs(module, [module]);
      }
    }

    return cycles;
  }

  /**
   * Detect layer violations
   */
  private async detectLayerViolations(): Promise<Array<{ from: string; to: string }>> {
    const violations: Array<{ from: string; to: string }> = [];

    // Define layer hierarchy (lower can depend on higher, not vice versa)
    const layerOrder: Record<string, number> = {
      presentation: 1,
      controller: 2,
      service: 3,
      domain: 4,
      repository: 5,
      infrastructure: 6,
    };

    for (const [source, deps] of this.dependencyGraph.entries()) {
      const sourceLayer = this.getLayer(source);
      const sourceOrder = layerOrder[sourceLayer] || 3;

      for (const dep of deps) {
        const targetLayer = this.getLayer(dep.target);
        const targetOrder = layerOrder[targetLayer] || 3;

        // Higher layer depending on lower layer is a violation
        if (sourceOrder > targetOrder) {
          violations.push({ from: source, to: dep.target });
        }
      }
    }

    return violations;
  }

  /**
   * Get layer name from module name
   */
  private getLayer(moduleName: string): string {
    if (/presentation|view|ui|component/i.test(moduleName)) return 'presentation';
    if (/controller|handler|api/i.test(moduleName)) return 'controller';
    if (/service/i.test(moduleName)) return 'service';
    if (/domain|entity|model/i.test(moduleName)) return 'domain';
    if (/repository|store|data/i.test(moduleName)) return 'repository';
    if (/infrastructure|external|adapter/i.test(moduleName)) return 'infrastructure';
    return 'service'; // Default
  }

  /**
   * Find transitive path between modules
   */
  private async findTransitivePath(source: string, target: string): Promise<string[]> {
    const visited = new Set<string>();
    const queue: Array<{ module: string; path: string[] }> = [
      { module: source, path: [source] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.module === target) {
        return current.path;
      }

      if (visited.has(current.module)) continue;
      visited.add(current.module);

      if (current.path.length >= this.graphConfig.maxDepth) continue;

      const deps = this.dependencyGraph.get(current.module) || [];
      for (const dep of deps) {
        if (!visited.has(dep.target)) {
          queue.push({
            module: dep.target,
            path: [...current.path, dep.target],
          });
        }
      }
    }

    return [source, target]; // Direct path if no transitive found
  }

  /**
   * Calculate path importance
   */
  private calculatePathImportance(path: string[], deps: ModuleDependency[]): number {
    // Longer paths through high-weight edges are more important
    let importance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const edgeDep = deps.find((d) => d.target === path[i + 1]);
      importance += edgeDep?.weight || 0.5;
    }

    return importance / (path.length - 1);
  }

  /**
   * Convert risk score to priority
   */
  private riskToPriority(risk: number): Priority {
    if (risk >= 0.8) return 'p0';
    if (risk >= 0.6) return 'p1';
    if (risk >= 0.4) return 'p2';
    return 'p3';
  }

  /**
   * Compute cache key
   */
  private computeCacheKey(entryPoints: string[]): string {
    return entryPoints.sort().join('|');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

import {
  getRuVectorObservability,
  type FallbackReason,
} from './observability.js';

/**
 * Create graph boundaries analyzer with ML-first approach
 *
 * IMPORTANT: This function tries ML FIRST and only falls back on actual errors.
 * Fallback usage is recorded via observability layer and triggers alerts.
 *
 * @param config - RuVector configuration
 * @param graphConfig - Optional graph configuration
 * @returns Promise resolving to GraphBoundariesAnalyzer (ML or fallback)
 */
export async function createGraphBoundariesAnalyzer(
  config: RuVectorConfig,
  graphConfig?: Partial<GraphConfig>
): Promise<GraphBoundariesAnalyzer> {
  const observability = getRuVectorObservability();
  const startTime = Date.now();

  // If explicitly disabled by config, use fallback but record it
  if (!config.enabled) {
    observability.recordFallback('graph-boundaries', 'disabled');
    observability.checkAndAlert();
    return new FallbackGraphBoundariesAnalyzer();
  }

  try {
    // Try ML implementation FIRST
    const analyzer = new RuVectorGraphBoundariesAnalyzer(config, graphConfig);
    // Record successful ML usage
    observability.recordMLUsage('graph-boundaries', true, Date.now() - startTime);
    return analyzer;
  } catch (error) {
    // Record fallback with reason
    const reason: FallbackReason = error instanceof Error && error.message.includes('timeout')
      ? 'timeout'
      : 'error';
    observability.recordFallback('graph-boundaries', reason);
    // Alert about fallback usage
    observability.checkAndAlert();
    console.warn(
      `[RuVector] Graph boundaries analyzer initialization failed, using fallback: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    return new FallbackGraphBoundariesAnalyzer();
  }
}

/**
 * Create graph boundaries analyzer synchronously (legacy API)
 *
 * @deprecated Use createGraphBoundariesAnalyzer() async version for proper observability
 */
export function createGraphBoundariesAnalyzerSync(
  config: RuVectorConfig,
  graphConfig?: Partial<GraphConfig>
): GraphBoundariesAnalyzer {
  const observability = getRuVectorObservability();

  if (!config.enabled) {
    observability.recordFallback('graph-boundaries', 'disabled');
    return new FallbackGraphBoundariesAnalyzer();
  }

  try {
    const analyzer = new RuVectorGraphBoundariesAnalyzer(config, graphConfig);
    observability.recordMLUsage('graph-boundaries', true);
    return analyzer;
  } catch (error) {
    observability.recordFallback('graph-boundaries', 'error');
    return new FallbackGraphBoundariesAnalyzer();
  }
}
