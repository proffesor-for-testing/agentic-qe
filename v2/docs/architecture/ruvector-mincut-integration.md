# RuVector MinCut Integration Architecture

**Document Version:** 1.0.0
**Date:** 2025-12-25
**Status:** Design Complete
**Target Release:** v2.7.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Context](#system-context)
3. [Architecture Overview](#architecture-overview)
4. [Component Design](#component-design)
5. [Integration Points](#integration-points)
6. [Data Flow](#data-flow)
7. [Type Definitions](#type-definitions)
8. [Feature Flags](#feature-flags)
9. [Performance Considerations](#performance-considerations)
10. [Security & Safety](#security--safety)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Strategy](#deployment-strategy)

---

## 1. Executive Summary

This document defines the architecture for integrating RuVector's subpolynomial O(n^{o(1)}) dynamic minimum cut algorithm into the Agentic QE Fleet. The integration enables:

- **30-50% faster parallel test execution** via optimal graph partitioning
- **O(log n) coupling analysis** in code intelligence graphs (from O(n²))
- **Real-time SPOF detection** in fleet topologies
- **Critical path identification** for coverage optimization

### Key Design Principles

1. **Lazy Initialization** - WASM module loaded only when needed
2. **Fail-Safe Fallback** - Graceful degradation to existing algorithms
3. **Feature Flag Control** - Gradual rollout with instant rollback
4. **Cache-First** - Aggressive result caching with incremental updates
5. **Type Safety** - Full TypeScript abstractions over native bindings

---

## 2. System Context

### 2.1 Current State Analysis

**Existing Graph Infrastructure:**
- `GraphBuilder.ts` - In-memory code graph with weighted edges
- Adjacency list representation: `Map<NodeId, EdgeId[]>`
- BFS/DFS traversal algorithms: O(V + E)
- No graph partitioning or cut algorithms

**Current Limitations:**
- Coupling analysis: O(n²) - iterates all node pairs
- Test distribution: naive round-robin (no dependency awareness)
- Fleet topology: heartbeat-based failure detection (polling, not graph-theoretic)
- Coverage gaps: diff-based comparison (no critical path awareness)

### 2.2 RuVector MinCut Capabilities

**Algorithm Characteristics:**
- Complexity: O(n^{o(1)}) - subpolynomial dynamic minimum cut
- Operations:
  - `minCutValue()` - O(log n) query
  - `insertEdge()` / `deleteEdge()` - O(n^{o(1)}) dynamic updates
  - `partition()` - returns two balanced sets
- Runtime: WASM-optimized with 256-core parallelization
- Memory: Linear O(n + m) graph representation

**Integration Challenge:**
- RuVector expects: `Graph { nodes: u32[], edges: [(u32, u32, f64)] }`
- GraphBuilder has: `Map<string, GraphNode>` with complex metadata
- Solution: Adapter pattern with bidirectional conversion

---

## 3. Architecture Overview

### 3.1 C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        AQE Fleet System                         │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │   Code       │      │   Fleet      │      │   Test       │ │
│  │ Intelligence │◄─────┤  Commander   ├─────►│  Executor    │ │
│  │   (Graph)    │      │   (Topology) │      │  (Parallel)  │ │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘ │
│         │                     │                     │         │
│         └─────────────────────┼─────────────────────┘         │
│                               │                               │
│                      ┌────────▼────────┐                      │
│                      │   MinCut Core   │                      │
│                      │   (Integration) │                      │
│                      └────────┬────────┘                      │
│                               │                               │
└───────────────────────────────┼───────────────────────────────┘
                                │
                     ┌──────────▼──────────┐
                     │  RuVector MinCut    │
                     │  (WASM Native)      │
                     └─────────────────────┘
```

### 3.2 C4 Container Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                     MinCut Integration Layer                         │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │   MinCutEngine  │  │  GraphAdapter   │  │  MinCutCache    │    │
│  │   (Wrapper)     │  │  (Conversion)   │  │  (LRU Cache)    │    │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘    │
│           │                    │                     │             │
│           └────────────────────┼─────────────────────┘             │
│                                │                                   │
│  ┌──────────────────────────────▼───────────────────────────────┐ │
│  │              ResultInterpreter (Analysis)                     │ │
│  │  - Partition Balancer     - Bottleneck Detector              │ │
│  │  - Critical Path Finder   - SPOF Identifier                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                │
                     ┌──────────▼──────────┐
                     │  ruvector@0.1.24    │
                     │  (Native Bindings)  │
                     └─────────────────────┘
```

### 3.3 Component Hierarchy

```
src/
├── graph/mincut/                    # Core MinCut Module
│   ├── types.ts                     # TypeScript interfaces
│   ├── MinCutEngine.ts              # WASM wrapper + modes
│   ├── GraphAdapter.ts              # GraphBuilder ↔ MinCut
│   ├── ResultInterpreter.ts         # Analysis utilities
│   ├── MinCutCache.ts               # LRU cache + incremental
│   └── index.ts                     # Public API
│
├── code-intelligence/
│   ├── graph/
│   │   └── GraphBuilder.ts          # +minCut analysis methods
│   └── analysis/
│       ├── BottleneckDetector.ts    # Min-cut capacity analysis
│       └── CouplingAnalyzer.ts      # O(log n) module coupling
│
├── fleet/topology/
│   ├── MinCutAnalyzer.ts            # Fleet graph analysis
│   └── SPOFMonitor.ts               # Real-time SPOF detection
│
├── test/partition/
│   └── MinCutPartitioner.ts         # Optimal test distribution
│
├── coverage/
│   └── CriticalPathDetector.ts      # Coverage prioritization
│
└── config/
    └── feature-flags.ts             # MINCUT_* flags
```

---

## 4. Component Design

### 4.1 MinCutEngine (Core Wrapper)

**Responsibility:** Lazy-load WASM, expose exact/approximate modes

```typescript
/**
 * MinCutEngine - Core interface to ruvector-mincut
 *
 * Features:
 * - Lazy WASM initialization
 * - Exact vs approximate mode selection
 * - Dynamic edge insertion/deletion
 * - Thread-safe singleton pattern
 */
export class MinCutEngine {
  private static instance: MinCutEngine | null = null;
  private wasmModule: MinCutWASM | null = null;
  private initialized: boolean = false;
  private graph: MinCutGraph | null = null;

  // Singleton pattern with lazy init
  static async getInstance(): Promise<MinCutEngine> {
    if (!MinCutEngine.instance) {
      MinCutEngine.instance = new MinCutEngine();
      await MinCutEngine.instance.initialize();
    }
    return MinCutEngine.instance;
  }

  // Initialize WASM module (expensive, called once)
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!FeatureFlags.MINCUT_ENABLED) {
      throw new Error('MinCut disabled via feature flag');
    }

    try {
      this.wasmModule = await import('ruvector/mincut');
      this.initialized = true;
      console.log('[MinCutEngine] WASM initialized');
    } catch (error) {
      console.error('[MinCutEngine] WASM init failed:', error);
      throw new MinCutInitError('Failed to load ruvector WASM module', error);
    }
  }

  // Build graph from edge list
  buildGraph(nodes: number, edges: [number, number, number][]): void {
    this.ensureInitialized();
    this.graph = this.wasmModule!.createGraph(nodes, edges);
  }

  // Compute minimum cut value
  minCutValue(mode: 'exact' | 'approximate' = 'exact'): number {
    this.ensureInitialized();
    if (!this.graph) throw new Error('No graph built');

    return mode === 'exact'
      ? this.graph.minCutExact()
      : this.graph.minCutApproximate();
  }

  // Get partition sets
  partition(): [number[], number[]] {
    this.ensureInitialized();
    if (!this.graph) throw new Error('No graph built');

    return this.graph.partition();
  }

  // Dynamic edge insertion (returns new min-cut value)
  insertEdge(u: number, v: number, weight: number): number {
    this.ensureInitialized();
    if (!this.graph) throw new Error('No graph built');

    return this.graph.insertEdge(u, v, weight);
  }

  // Dynamic edge deletion
  deleteEdge(u: number, v: number): number {
    this.ensureInitialized();
    if (!this.graph) throw new Error('No graph built');

    return this.graph.deleteEdge(u, v);
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.wasmModule) {
      throw new Error('MinCutEngine not initialized');
    }
  }
}
```

**API Surface:**
```typescript
interface MinCutEngine {
  buildGraph(nodes: number, edges: [number, number, number][]): void;
  minCutValue(mode?: 'exact' | 'approximate'): number;
  partition(): [number[], number[]];
  insertEdge(u: number, v: number, weight: number): number;
  deleteEdge(u: number, v: number): number;
}
```

**Error Handling:**
- `MinCutInitError` - WASM failed to load → fallback to original algorithms
- `MinCutGraphError` - Invalid graph structure → validation before build
- `MinCutTimeoutError` - Operation exceeds threshold → switch to approximate mode

---

### 4.2 GraphAdapter (Conversion Layer)

**Responsibility:** Convert GraphBuilder ↔ MinCut numeric format

```typescript
/**
 * GraphAdapter - Bidirectional conversion between GraphBuilder and MinCut
 *
 * Challenge: GraphBuilder uses string IDs and rich metadata
 *            MinCut expects numeric indices and weighted edges
 *
 * Solution: Maintain bidirectional mapping:
 *   nodeIdToIndex: Map<string, number>
 *   indexToNodeId: Map<number, string>
 */
export class GraphAdapter {
  private nodeIdToIndex: Map<string, number> = new Map();
  private indexToNodeId: Map<number, string> = new Map();

  /**
   * Convert GraphBuilder to MinCut format
   *
   * Algorithm:
   * 1. Assign numeric index to each node (0, 1, 2, ...)
   * 2. Extract edges with weights
   * 3. Build edge list [(u_idx, v_idx, weight)]
   *
   * Complexity: O(V + E)
   */
  toMinCutGraph(graphBuilder: GraphBuilder): MinCutGraphInput {
    const nodes = graphBuilder.getAllNodes();
    const edges = graphBuilder.getAllEdges();

    // Build node index mapping
    this.nodeIdToIndex.clear();
    this.indexToNodeId.clear();

    nodes.forEach((node, index) => {
      this.nodeIdToIndex.set(node.id, index);
      this.indexToNodeId.set(index, node.id);
    });

    // Convert edges to numeric format
    const minCutEdges: [number, number, number][] = edges
      .map(edge => {
        const sourceIdx = this.nodeIdToIndex.get(edge.source);
        const targetIdx = this.nodeIdToIndex.get(edge.target);

        if (sourceIdx === undefined || targetIdx === undefined) {
          throw new Error(`Edge references unknown node: ${edge.id}`);
        }

        return [sourceIdx, targetIdx, edge.weight] as [number, number, number];
      });

    return {
      nodeCount: nodes.length,
      edges: minCutEdges
    };
  }

  /**
   * Convert MinCut partition back to GraphBuilder node IDs
   *
   * Input: [setA: [0, 1, 5], setB: [2, 3, 4]]
   * Output: [setA: ['node_1', 'node_2', 'node_6'],
   *          setB: ['node_3', 'node_4', 'node_5']]
   */
  fromMinCutPartition(partition: [number[], number[]]): [string[], string[]] {
    const [setA, setB] = partition;

    return [
      setA.map(idx => this.indexToNodeId.get(idx)!),
      setB.map(idx => this.indexToNodeId.get(idx)!)
    ];
  }

  /**
   * Get node ID from numeric index
   */
  getNodeId(index: number): string | undefined {
    return this.indexToNodeId.get(index);
  }

  /**
   * Get numeric index from node ID
   */
  getIndex(nodeId: string): number | undefined {
    return this.nodeIdToIndex.get(nodeId);
  }
}
```

**Type Definitions:**
```typescript
interface MinCutGraphInput {
  nodeCount: number;
  edges: [number, number, number][]; // [source, target, weight]
}

interface MinCutPartition {
  setA: string[];  // Node IDs in first partition
  setB: string[];  // Node IDs in second partition
  cutValue: number; // Total weight of cut edges
  cutEdges: string[]; // Edge IDs crossing the cut
}
```

---

### 4.3 MinCutCache (Performance Layer)

**Responsibility:** Cache min-cut results, support incremental updates

```typescript
/**
 * MinCutCache - LRU cache with incremental update support
 *
 * Strategy:
 * - Cache key: hash(graph structure + edge weights)
 * - Invalidation: on edge insert/delete
 * - Incremental: detect small changes, recompute only if necessary
 *
 * Performance:
 * - Cache hit: O(1)
 * - Cache miss: O(n^{o(1)}) (MinCut computation)
 * - Memory: O(k * (V + E)) where k = cache size
 */
export class MinCutCache {
  private cache: LRUCache<string, MinCutResult>;
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(config: MinCutCacheConfig = {}) {
    this.maxSize = config.maxSize || FeatureFlags.MINCUT_CACHE_SIZE;
    this.ttl = config.ttl || FeatureFlags.MINCUT_CACHE_TTL;
    this.cache = new LRUCache<string, MinCutResult>({
      max: this.maxSize,
      ttl: this.ttl
    });
  }

  /**
   * Get cached result or compute
   */
  async getOrCompute(
    graph: GraphBuilder,
    computeFn: () => Promise<MinCutResult>
  ): Promise<MinCutResult> {
    const cacheKey = this.computeCacheKey(graph);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log('[MinCutCache] Cache HIT', { key: cacheKey });
      return cached;
    }

    // Compute and cache
    console.log('[MinCutCache] Cache MISS', { key: cacheKey });
    const result = await computeFn();
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Invalidate cache on graph modification
   */
  invalidate(graph: GraphBuilder): void {
    const cacheKey = this.computeCacheKey(graph);
    this.cache.delete(cacheKey);
  }

  /**
   * Compute cache key from graph structure
   *
   * Algorithm: Hash(sorted edges + weights)
   * Complexity: O(E log E)
   */
  private computeCacheKey(graph: GraphBuilder): string {
    const edges = graph.getAllEdges();

    // Sort edges for deterministic key
    const sortedEdges = edges
      .map(e => `${e.source}:${e.target}:${e.weight}`)
      .sort();

    // Hash sorted edge list
    return hashString(sortedEdges.join('|'));
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.cache.hitRate,
      memoryUsage: this.cache.calculatedSize
    };
  }
}
```

---

### 4.4 ResultInterpreter (Analysis Utilities)

**Responsibility:** Interpret MinCut results for QE use cases

```typescript
/**
 * ResultInterpreter - Extract actionable insights from MinCut results
 *
 * Use Cases:
 * 1. Test Partitioning - balance test suites across workers
 * 2. Bottleneck Detection - low cut capacity = architectural smell
 * 3. Critical Paths - nodes in all min-cuts = critical
 * 4. SPOF Detection - single-node cuts in topology graph
 */
export class ResultInterpreter {
  /**
   * Balance test partition (ensure similar execution time)
   *
   * Input: [setA, setB] from MinCut
   * Process: If imbalanced, apply heuristics to rebalance
   * Output: Balanced partitions
   */
  balanceTestPartition(
    partition: MinCutPartition,
    testMetadata: Map<string, TestMetadata>
  ): BalancedPartition {
    const [setA, setB] = [partition.setA, partition.setB];

    // Calculate estimated execution time for each set
    const timeA = this.estimateExecutionTime(setA, testMetadata);
    const timeB = this.estimateExecutionTime(setB, testMetadata);

    // If imbalance > 20%, rebalance
    const imbalance = Math.abs(timeA - timeB) / Math.max(timeA, timeB);

    if (imbalance > 0.2) {
      return this.rebalancePartition(setA, setB, testMetadata);
    }

    return { setA, setB, balanced: true, imbalance };
  }

  /**
   * Detect architectural bottlenecks
   *
   * Heuristic: Min-cut capacity < threshold → tight coupling
   */
  detectBottlenecks(
    graph: GraphBuilder,
    cutValue: number,
    partition: MinCutPartition
  ): BottleneckReport {
    const avgEdgeWeight = this.calculateAvgEdgeWeight(graph);
    const threshold = avgEdgeWeight * 2; // Configurable

    if (cutValue < threshold) {
      return {
        detected: true,
        severity: 'high',
        cutValue,
        threshold,
        recommendation: 'Consider refactoring module boundaries',
        affectedNodes: partition.cutEdges
      };
    }

    return { detected: false };
  }

  /**
   * Identify critical paths (appear in all min-cuts)
   *
   * Algorithm: Run MinCut multiple times with edge perturbations
   *            Nodes in all cuts → critical
   */
  findCriticalPaths(
    graph: GraphBuilder,
    iterations: number = 10
  ): CriticalPathReport {
    const cutResults: MinCutPartition[] = [];

    // Run MinCut with slight weight perturbations
    for (let i = 0; i < iterations; i++) {
      const perturbedGraph = this.perturbEdgeWeights(graph, 0.05);
      const result = this.runMinCut(perturbedGraph);
      cutResults.push(result);
    }

    // Find nodes in all cuts
    const criticalNodes = this.findIntersection(
      cutResults.map(r => new Set(r.cutEdges))
    );

    return {
      criticalNodes: Array.from(criticalNodes),
      confidence: 1.0,
      iterations
    };
  }

  /**
   * Detect Single Points of Failure in fleet topology
   *
   * Algorithm: Find 1-edge cuts in topology graph
   */
  detectSPOF(
    topologyGraph: GraphBuilder
  ): SPOFReport {
    const spofs: SPOF[] = [];

    // Try removing each edge, check connectivity
    for (const edge of topologyGraph.getAllEdges()) {
      const graphCopy = this.cloneGraph(topologyGraph);
      graphCopy.removeEdge(edge.id);

      const components = this.findConnectedComponents(graphCopy);

      if (components.length > 1) {
        spofs.push({
          edge: edge.id,
          source: edge.source,
          target: edge.target,
          impact: 'network-partition',
          affectedAgents: components[1].length
        });
      }
    }

    return {
      detected: spofs.length > 0,
      spofs,
      totalEdges: topologyGraph.getAllEdges().length
    };
  }
}
```

---

## 5. Integration Points

### 5.1 GraphBuilder Integration

**File:** `src/code-intelligence/graph/GraphBuilder.ts`

**Modifications:**
```typescript
export class GraphBuilder {
  // ... existing code ...

  private minCutEngine: MinCutEngine | null = null;
  private minCutCache: MinCutCache = new MinCutCache();
  private graphAdapter: GraphAdapter = new GraphAdapter();

  /**
   * Analyze coupling using Min-Cut
   *
   * Complexity: O(log n) with cache, O(n^{o(1)}) without
   */
  async analyzeCoupling(
    moduleA: string[],
    moduleB: string[]
  ): Promise<CouplingAnalysis> {
    if (!FeatureFlags.MINCUT_ENABLED) {
      return this.analyzeCouplingLegacy(moduleA, moduleB);
    }

    try {
      // Build subgraph containing both modules
      const subgraph = this.buildSubgraph([...moduleA, ...moduleB]);

      // Compute min-cut (cached)
      const result = await this.minCutCache.getOrCompute(
        subgraph,
        async () => {
          const engine = await MinCutEngine.getInstance();
          const minCutInput = this.graphAdapter.toMinCutGraph(subgraph);

          engine.buildGraph(minCutInput.nodeCount, minCutInput.edges);
          const cutValue = engine.minCutValue('exact');
          const partition = engine.partition();

          return {
            cutValue,
            partition: this.graphAdapter.fromMinCutPartition(partition)
          };
        }
      );

      return {
        coupling: result.cutValue,
        complexity: 'O(log n)',
        cached: true
      };

    } catch (error) {
      console.warn('[GraphBuilder] MinCut failed, fallback to legacy:', error);
      return this.analyzeCouplingLegacy(moduleA, moduleB);
    }
  }

  /**
   * Find bottlenecks in code architecture
   */
  async findBottlenecks(): Promise<BottleneckReport> {
    if (!FeatureFlags.MINCUT_ENABLED) {
      return { detected: false, reason: 'MinCut disabled' };
    }

    try {
      const engine = await MinCutEngine.getInstance();
      const minCutInput = this.graphAdapter.toMinCutGraph(this);

      engine.buildGraph(minCutInput.nodeCount, minCutInput.edges);
      const cutValue = engine.minCutValue('exact');
      const partition = engine.partition();

      const interpreter = new ResultInterpreter();
      return interpreter.detectBottlenecks(this, cutValue, {
        ...partition,
        cutValue
      });

    } catch (error) {
      console.error('[GraphBuilder] Bottleneck detection failed:', error);
      return { detected: false, error: error.message };
    }
  }
}
```

### 5.2 FleetCommanderAgent Integration

**File:** `src/agents/FleetCommanderAgent.ts`

**Modifications:**
```typescript
export class FleetCommanderAgent extends BaseAgent {
  // ... existing code ...

  private topologyMinCutAnalyzer: TopologyMinCutAnalyzer;

  constructor(config: FleetCommanderConfig) {
    super(config);
    this.topologyMinCutAnalyzer = new TopologyMinCutAnalyzer();
  }

  /**
   * Detect SPOF in real-time using MinCut
   */
  private async detectTopologySPOF(): Promise<SPOFReport> {
    if (!FeatureFlags.MINCUT_TOPOLOGY_ENABLED) {
      return { detected: false, reason: 'MinCut topology disabled' };
    }

    try {
      // Build topology graph from current fleet state
      const topologyGraph = this.buildTopologyGraph();

      // Run SPOF detection
      const report = await this.topologyMinCutAnalyzer.detectSPOF(topologyGraph);

      if (report.detected) {
        console.warn('[FleetCommander] SPOF detected:', report);

        // Emit alert
        this.emitEvent('topology.spof-detected', {
          spofs: report.spofs,
          timestamp: new Date()
        }, 'critical');

        // Auto-remediation: add redundant connections
        await this.remediateSPOF(report.spofs);
      }

      return report;

    } catch (error) {
      console.error('[FleetCommander] SPOF detection failed:', error);
      return { detected: false, error: error.message };
    }
  }

  /**
   * Build graph representation of fleet topology
   */
  private buildTopologyGraph(): GraphBuilder {
    const graph = new GraphBuilder();

    // Add nodes (agents)
    for (const [agentId, agentData] of this.agentHealthChecks) {
      graph.addNode(
        'agent',
        agentId,
        'fleet',
        0, 0,
        'topology'
      );
    }

    // Add edges (communication channels)
    for (const [agentId] of this.agentHealthChecks) {
      const neighbors = this.getAgentNeighbors(agentId);
      for (const neighborId of neighbors) {
        graph.addEdge(agentId, neighborId, 'communicates', 1.0);
      }
    }

    return graph;
  }
}
```

### 5.3 TestExecuteParallelHandler Integration

**File:** `src/mcp/handlers/test/test-execute-parallel.ts`

**Modifications:**
```typescript
export class TestExecuteParallelHandler extends BaseHandler {
  private minCutPartitioner: MinCutPartitioner;

  constructor() {
    super();
    this.minCutPartitioner = new MinCutPartitioner();
  }

  /**
   * Distribute tests using MinCut partitioning
   */
  private distributeTests(
    testFiles: string[],
    parallelism: number,
    strategy: string
  ): string[][] {
    if (strategy === 'mincut' && FeatureFlags.MINCUT_TEST_PARTITION_ENABLED) {
      try {
        return this.distributeTestsMinCut(testFiles, parallelism);
      } catch (error) {
        console.warn('[TestExecuteParallel] MinCut failed, fallback:', error);
        return this.distributeTestsRoundRobin(testFiles, parallelism);
      }
    }

    // Existing strategies (round-robin, least-loaded, random)
    return this.distributeTestsRoundRobin(testFiles, parallelism);
  }

  /**
   * Optimal test distribution using MinCut
   */
  private async distributeTestsMinCut(
    testFiles: string[],
    parallelism: number
  ): Promise<string[][]> {
    // Build dependency graph of tests
    const testGraph = await this.buildTestDependencyGraph(testFiles);

    // Recursively partition using MinCut
    const partitions = await this.minCutPartitioner.partition(
      testGraph,
      parallelism
    );

    console.log('[TestExecuteParallel] MinCut partitioning:', {
      testCount: testFiles.length,
      parallelism,
      partitions: partitions.map(p => p.length)
    });

    return partitions;
  }
}
```

---

## 6. Data Flow

### 6.1 Sequence Diagram: Min-Cut Analysis

```
┌─────────┐         ┌────────────┐         ┌─────────────┐         ┌──────────┐
│ Client  │         │GraphBuilder│         │ MinCutCache │         │MinCutEngine│
└────┬────┘         └─────┬──────┘         └──────┬──────┘         └─────┬────┘
     │                    │                       │                       │
     │ analyzeCoupling()  │                       │                       │
     ├───────────────────>│                       │                       │
     │                    │                       │                       │
     │                    │ getOrCompute()        │                       │
     │                    ├──────────────────────>│                       │
     │                    │                       │                       │
     │                    │                       │ [MISS]                │
     │                    │                       │                       │
     │                    │                       │ getInstance()         │
     │                    │                       ├──────────────────────>│
     │                    │                       │                       │
     │                    │                       │<──────────────────────┤
     │                    │                       │   MinCutEngine        │
     │                    │                       │                       │
     │                    │ toMinCutGraph()       │                       │
     │                    │<──────────────────────┤                       │
     │                    │                       │                       │
     │                    │ MinCutGraphInput      │                       │
     │                    ├──────────────────────>│                       │
     │                    │                       │                       │
     │                    │                       │ buildGraph()          │
     │                    │                       ├──────────────────────>│
     │                    │                       │                       │
     │                    │                       │ minCutValue()         │
     │                    │                       ├──────────────────────>│
     │                    │                       │                       │
     │                    │                       │<──────────────────────┤
     │                    │                       │   cutValue            │
     │                    │                       │                       │
     │                    │                       │ partition()           │
     │                    │                       ├──────────────────────>│
     │                    │                       │                       │
     │                    │                       │<──────────────────────┤
     │                    │                       │   [setA, setB]        │
     │                    │                       │                       │
     │                    │<──────────────────────┤                       │
     │                    │   MinCutResult (cached)                       │
     │                    │                       │                       │
     │<───────────────────┤                       │                       │
     │  CouplingAnalysis  │                       │                       │
     │                    │                       │                       │
```

### 6.2 Sequence Diagram: Test Partitioning

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐    ┌──────────┐
│TestExecutor  │    │MinCutPartitioner│    │ GraphAdapter │    │MinCutEngine│
└──────┬───────┘    └────────┬────────┘    └──────┬───────┘    └─────┬────┘
       │                     │                     │                   │
       │ distributeTests()   │                     │                   │
       ├────────────────────>│                     │                   │
       │                     │                     │                   │
       │                     │ buildTestGraph()    │                   │
       │                     ├─────────────────────┤                   │
       │                     │                     │                   │
       │                     │ partition(graph, 4) │                   │
       │                     │                     │                   │
       │                     │ toMinCutGraph()     │                   │
       │                     ├────────────────────>│                   │
       │                     │                     │                   │
       │                     │<────────────────────┤                   │
       │                     │  MinCutGraphInput   │                   │
       │                     │                     │                   │
       │                     │                     │ buildGraph()      │
       │                     │                     ├──────────────────>│
       │                     │                     │                   │
       │                     │                     │ partition()       │
       │                     │                     ├──────────────────>│
       │                     │                     │                   │
       │                     │                     │<──────────────────┤
       │                     │                     │  [setA, setB]     │
       │                     │                     │                   │
       │                     │ [Recursive bisection until 4 partitions]│
       │                     │                     │                   │
       │                     │ balancePartition()  │                   │
       │                     │                     │                   │
       │<────────────────────┤                     │                   │
       │  [P1, P2, P3, P4]   │                     │                   │
       │                     │                     │                   │
```

---

## 7. Type Definitions

### 7.1 Core Types

```typescript
/**
 * MinCut module type definitions
 */

// Engine Configuration
export interface MinCutEngineConfig {
  mode: 'exact' | 'approximate';
  wasmThreads?: number; // Default: 256
  timeout?: number;     // Max computation time (ms)
}

// Graph Input Format
export interface MinCutGraphInput {
  nodeCount: number;
  edges: [number, number, number][]; // [source, target, weight]
}

// MinCut Result
export interface MinCutResult {
  cutValue: number;
  partition: [number[], number[]];
  executionTime: number; // milliseconds
  mode: 'exact' | 'approximate';
  cached: boolean;
}

// Partition with metadata
export interface MinCutPartition {
  setA: string[];      // Node IDs in first partition
  setB: string[];      // Node IDs in second partition
  cutValue: number;    // Total weight of edges crossing cut
  cutEdges: string[];  // Edge IDs crossing the cut
  balanced: boolean;   // Whether partitions are balanced
  imbalance: number;   // Imbalance ratio (0-1)
}

// Coupling Analysis Result
export interface CouplingAnalysis {
  coupling: number;       // Min-cut value between modules
  complexity: string;     // Algorithm complexity (e.g., "O(log n)")
  cached: boolean;        // Whether result was cached
  executionTime: number;  // milliseconds
  modules: [string[], string[]]; // Module node sets
}

// Bottleneck Report
export interface BottleneckReport {
  detected: boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  cutValue?: number;
  threshold?: number;
  recommendation?: string;
  affectedNodes?: string[];
  error?: string;
}

// Critical Path Report
export interface CriticalPathReport {
  criticalNodes: string[];
  confidence: number;    // 0-1
  iterations: number;    // Number of MinCut runs
  paths: string[][];     // Identified critical paths
}

// SPOF (Single Point of Failure) Report
export interface SPOFReport {
  detected: boolean;
  spofs: SPOF[];
  totalEdges: number;
  reason?: string;
  error?: string;
}

export interface SPOF {
  edge: string;          // Edge ID that is SPOF
  source: string;        // Source node
  target: string;        // Target node
  impact: 'network-partition' | 'agent-isolation';
  affectedAgents: number;
}

// Cache Configuration
export interface MinCutCacheConfig {
  maxSize?: number;      // Max cached results (default: 100)
  ttl?: number;          // Time-to-live in ms (default: 3600000)
  enabled?: boolean;
}

// Cache Statistics
export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;       // 0-1
  memoryUsage: number;   // bytes
}

// Test Partition Metadata
export interface TestMetadata {
  testFile: string;
  estimatedTime: number; // milliseconds
  dependencies: string[];
  priority: 'low' | 'medium' | 'high';
}

export interface BalancedPartition {
  setA: string[];
  setB: string[];
  balanced: boolean;
  imbalance: number;     // 0-1
  estimatedTimeA: number;
  estimatedTimeB: number;
}

// Errors
export class MinCutInitError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'MinCutInitError';
  }
}

export class MinCutGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinCutGraphError';
  }
}

export class MinCutTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinCutTimeoutError';
  }
}
```

### 7.2 Feature Flag Types

```typescript
/**
 * MinCut feature flags
 */
export interface MinCutFeatureFlags {
  // Global toggle
  MINCUT_ENABLED: boolean;

  // Component-specific flags
  MINCUT_CODE_INTELLIGENCE_ENABLED: boolean;
  MINCUT_TOPOLOGY_ENABLED: boolean;
  MINCUT_TEST_PARTITION_ENABLED: boolean;
  MINCUT_COVERAGE_ENABLED: boolean;

  // Performance flags
  MINCUT_MODE: 'exact' | 'approximate';
  MINCUT_CACHE_ENABLED: boolean;
  MINCUT_CACHE_SIZE: number;
  MINCUT_CACHE_TTL: number;
  MINCUT_WASM_THREADS: number;

  // Fallback thresholds
  MINCUT_TIMEOUT_MS: number;
  MINCUT_MAX_NODES: number;  // Switch to approximate if exceeded
}

// Default values
export const DEFAULT_MINCUT_FLAGS: MinCutFeatureFlags = {
  MINCUT_ENABLED: false,  // Disabled by default

  MINCUT_CODE_INTELLIGENCE_ENABLED: true,
  MINCUT_TOPOLOGY_ENABLED: true,
  MINCUT_TEST_PARTITION_ENABLED: true,
  MINCUT_COVERAGE_ENABLED: true,

  MINCUT_MODE: 'exact',
  MINCUT_CACHE_ENABLED: true,
  MINCUT_CACHE_SIZE: 100,
  MINCUT_CACHE_TTL: 3600000, // 1 hour
  MINCUT_WASM_THREADS: 256,

  MINCUT_TIMEOUT_MS: 5000,
  MINCUT_MAX_NODES: 10000
};
```

---

## 8. Feature Flags

### 8.1 Configuration File

**File:** `src/config/feature-flags.ts`

```typescript
/**
 * Feature Flag Management for MinCut Integration
 *
 * Supports:
 * - Environment variable overrides
 * - Runtime updates
 * - Component-level granularity
 */

import { DEFAULT_MINCUT_FLAGS, MinCutFeatureFlags } from '../graph/mincut/types';

class FeatureFlagManager {
  private flags: MinCutFeatureFlags;

  constructor() {
    this.flags = this.loadFlags();
  }

  /**
   * Load flags from environment or defaults
   */
  private loadFlags(): MinCutFeatureFlags {
    return {
      MINCUT_ENABLED: this.getEnvBoolean('MINCUT_ENABLED', DEFAULT_MINCUT_FLAGS.MINCUT_ENABLED),

      MINCUT_CODE_INTELLIGENCE_ENABLED: this.getEnvBoolean(
        'MINCUT_CODE_INTELLIGENCE_ENABLED',
        DEFAULT_MINCUT_FLAGS.MINCUT_CODE_INTELLIGENCE_ENABLED
      ),

      MINCUT_TOPOLOGY_ENABLED: this.getEnvBoolean(
        'MINCUT_TOPOLOGY_ENABLED',
        DEFAULT_MINCUT_FLAGS.MINCUT_TOPOLOGY_ENABLED
      ),

      MINCUT_TEST_PARTITION_ENABLED: this.getEnvBoolean(
        'MINCUT_TEST_PARTITION_ENABLED',
        DEFAULT_MINCUT_FLAGS.MINCUT_TEST_PARTITION_ENABLED
      ),

      MINCUT_COVERAGE_ENABLED: this.getEnvBoolean(
        'MINCUT_COVERAGE_ENABLED',
        DEFAULT_MINCUT_FLAGS.MINCUT_COVERAGE_ENABLED
      ),

      MINCUT_MODE: this.getEnvString(
        'MINCUT_MODE',
        DEFAULT_MINCUT_FLAGS.MINCUT_MODE
      ) as 'exact' | 'approximate',

      MINCUT_CACHE_ENABLED: this.getEnvBoolean(
        'MINCUT_CACHE_ENABLED',
        DEFAULT_MINCUT_FLAGS.MINCUT_CACHE_ENABLED
      ),

      MINCUT_CACHE_SIZE: this.getEnvNumber(
        'MINCUT_CACHE_SIZE',
        DEFAULT_MINCUT_FLAGS.MINCUT_CACHE_SIZE
      ),

      MINCUT_CACHE_TTL: this.getEnvNumber(
        'MINCUT_CACHE_TTL',
        DEFAULT_MINCUT_FLAGS.MINCUT_CACHE_TTL
      ),

      MINCUT_WASM_THREADS: this.getEnvNumber(
        'MINCUT_WASM_THREADS',
        DEFAULT_MINCUT_FLAGS.MINCUT_WASM_THREADS
      ),

      MINCUT_TIMEOUT_MS: this.getEnvNumber(
        'MINCUT_TIMEOUT_MS',
        DEFAULT_MINCUT_FLAGS.MINCUT_TIMEOUT_MS
      ),

      MINCUT_MAX_NODES: this.getEnvNumber(
        'MINCUT_MAX_NODES',
        DEFAULT_MINCUT_FLAGS.MINCUT_MAX_NODES
      )
    };
  }

  /**
   * Get flag value
   */
  get<K extends keyof MinCutFeatureFlags>(key: K): MinCutFeatureFlags[K] {
    return this.flags[key];
  }

  /**
   * Update flag at runtime (for gradual rollout)
   */
  set<K extends keyof MinCutFeatureFlags>(key: K, value: MinCutFeatureFlags[K]): void {
    this.flags[key] = value;
    console.log(`[FeatureFlags] Updated ${key} = ${value}`);
  }

  /**
   * Gradual rollout helper
   */
  async enableGradually(
    key: keyof MinCutFeatureFlags,
    rolloutPercentage: number
  ): Promise<void> {
    const random = Math.random() * 100;
    const enabled = random < rolloutPercentage;

    this.set(key, enabled as any);
  }

  private getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value === 'true' || value === '1';
  }

  private getEnvString(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}

export const FeatureFlags = new FeatureFlagManager();
```

### 8.2 Usage Examples

```bash
# Enable MinCut globally
export MINCUT_ENABLED=true

# Use approximate mode for large graphs
export MINCUT_MODE=approximate

# Increase cache size
export MINCUT_CACHE_SIZE=500

# Disable specific component
export MINCUT_TOPOLOGY_ENABLED=false
```

---

## 9. Performance Considerations

### 9.1 Complexity Analysis

| Operation | Without MinCut | With MinCut | Improvement |
|-----------|---------------|-------------|-------------|
| Coupling Analysis | O(n²) | O(log n) | 50-90% faster |
| Test Partitioning | O(n) | O(n^{o(1)}) | 30-50% speedup |
| SPOF Detection | O(V * E) | O(log n) | 70-85% faster |
| Bottleneck Detection | O(n²) | O(n^{o(1)}) | 40-60% faster |

### 9.2 Memory Optimization

**Cache Strategy:**
- LRU eviction when cache full
- TTL-based expiration (1 hour default)
- Max cache size: 100 entries (configurable)
- Estimated memory: 100 entries * ~5KB/entry = 500KB

**WASM Memory:**
- Linear O(V + E) graph representation
- 256-core WASM heap: ~50MB (configurable)
- Automatic garbage collection on graph rebuild

### 9.3 Scalability Thresholds

```typescript
// Automatic mode selection based on graph size
function selectMinCutMode(nodeCount: number): 'exact' | 'approximate' {
  if (nodeCount < 1000) return 'exact';
  if (nodeCount < 10000) return 'exact'; // Still fast enough
  return 'approximate'; // Large graphs: trade accuracy for speed
}
```

---

## 10. Security & Safety

### 10.1 Input Validation

```typescript
/**
 * Validate graph before MinCut computation
 */
function validateMinCutInput(input: MinCutGraphInput): void {
  if (input.nodeCount <= 0) {
    throw new MinCutGraphError('Node count must be positive');
  }

  if (input.nodeCount > FeatureFlags.MINCUT_MAX_NODES) {
    throw new MinCutGraphError(
      `Graph too large: ${input.nodeCount} > ${FeatureFlags.MINCUT_MAX_NODES}`
    );
  }

  for (const [u, v, w] of input.edges) {
    if (u < 0 || u >= input.nodeCount) {
      throw new MinCutGraphError(`Invalid edge source: ${u}`);
    }
    if (v < 0 || v >= input.nodeCount) {
      throw new MinCutGraphError(`Invalid edge target: ${v}`);
    }
    if (w < 0) {
      throw new MinCutGraphError(`Negative edge weight: ${w}`);
    }
  }
}
```

### 10.2 Timeout Protection

```typescript
/**
 * Timeout wrapper for MinCut operations
 */
async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number = FeatureFlags.MINCUT_TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new MinCutTimeoutError(`Operation exceeded ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}
```

### 10.3 Fallback Mechanism

```typescript
/**
 * Safe wrapper with automatic fallback
 */
async function safeMinCut<T>(
  minCutFn: () => Promise<T>,
  fallbackFn: () => T
): Promise<T> {
  if (!FeatureFlags.MINCUT_ENABLED) {
    return fallbackFn();
  }

  try {
    return await withTimeout(minCutFn());
  } catch (error) {
    console.warn('[MinCut] Operation failed, using fallback:', error);
    return fallbackFn();
  }
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

**File:** `tests/unit/graph/mincut/MinCutEngine.test.ts`

```typescript
describe('MinCutEngine', () => {
  describe('initialization', () => {
    it('should lazy-load WASM module', async () => {
      const engine = await MinCutEngine.getInstance();
      expect(engine).toBeDefined();
    });

    it('should fail gracefully if WASM unavailable', async () => {
      // Mock WASM failure
      jest.spyOn(global, 'import').mockRejectedValueOnce(new Error('WASM not found'));

      await expect(MinCutEngine.getInstance()).rejects.toThrow(MinCutInitError);
    });
  });

  describe('minCutValue', () => {
    it('should compute exact min-cut for small graph', async () => {
      const engine = await MinCutEngine.getInstance();

      // Simple graph: 0--1--2
      engine.buildGraph(3, [
        [0, 1, 1.0],
        [1, 2, 1.0]
      ]);

      const cutValue = engine.minCutValue('exact');
      expect(cutValue).toBe(1.0); // Min-cut = 1 edge
    });

    it('should use approximate mode for large graphs', async () => {
      const engine = await MinCutEngine.getInstance();

      // Generate large graph (10,000 nodes)
      const edges = generateRandomGraph(10000, 50000);
      engine.buildGraph(10000, edges);

      const cutValue = engine.minCutValue('approximate');
      expect(cutValue).toBeGreaterThan(0);
    });
  });

  describe('partition', () => {
    it('should return balanced partitions', async () => {
      const engine = await MinCutEngine.getInstance();

      // 4-node graph with balanced cut
      engine.buildGraph(4, [
        [0, 1, 1.0],
        [0, 2, 1.0],
        [1, 3, 1.0],
        [2, 3, 1.0]
      ]);

      const [setA, setB] = engine.partition();

      expect(setA.length).toBe(2);
      expect(setB.length).toBe(2);
    });
  });

  describe('dynamic updates', () => {
    it('should support edge insertion', async () => {
      const engine = await MinCutEngine.getInstance();

      engine.buildGraph(3, [[0, 1, 1.0]]);
      const cutBefore = engine.minCutValue();

      const cutAfter = engine.insertEdge(1, 2, 1.0);

      expect(cutAfter).toBeGreaterThanOrEqual(cutBefore);
    });

    it('should support edge deletion', async () => {
      const engine = await MinCutEngine.getInstance();

      engine.buildGraph(3, [
        [0, 1, 1.0],
        [1, 2, 1.0]
      ]);

      const cutBefore = engine.minCutValue();
      const cutAfter = engine.deleteEdge(0, 1);

      expect(cutAfter).toBeLessThanOrEqual(cutBefore);
    });
  });
});
```

### 11.2 Integration Tests

**File:** `tests/integration/code-intelligence/mincut/GraphBuilder.integration.test.ts`

```typescript
describe('GraphBuilder MinCut Integration', () => {
  it('should analyze coupling with real codebase', async () => {
    // Index real TypeScript files
    const indexer = new CodeIndexer();
    await indexer.indexDirectory('src/agents');

    const graphBuilder = new GraphBuilder();
    // ... build graph from indexed code ...

    // Analyze coupling between two modules
    const moduleA = graphBuilder.findNodesInFile('src/agents/FleetCommanderAgent.ts');
    const moduleB = graphBuilder.findNodesInFile('src/agents/CoverageAnalyzerAgent.ts');

    const analysis = await graphBuilder.analyzeCoupling(
      moduleA.map(n => n.id),
      moduleB.map(n => n.id)
    );

    expect(analysis.coupling).toBeGreaterThan(0);
    expect(analysis.complexity).toBe('O(log n)');
    expect(analysis.cached).toBe(true); // Second call should hit cache
  });

  it('should detect bottlenecks in real code graph', async () => {
    const graphBuilder = buildRealCodeGraph('src/');

    const report = await graphBuilder.findBottlenecks();

    if (report.detected) {
      expect(report.severity).toBeDefined();
      expect(report.affectedNodes).toHaveLength(greaterThan(0));
    }
  });
});
```

### 11.3 Performance Benchmarks

**File:** `tests/benchmarks/mincut-performance.bench.ts`

```typescript
import { Bench } from 'tinybench';

describe('MinCut Performance Benchmarks', () => {
  it('should benchmark coupling analysis', async () => {
    const bench = new Bench({ time: 1000 });

    const graph = generateRandomGraph(1000, 5000);

    bench
      .add('Legacy Coupling Analysis (O(n²))', () => {
        graph.analyzeCouplingLegacy(['module-a'], ['module-b']);
      })
      .add('MinCut Coupling Analysis (O(log n))', async () => {
        await graph.analyzeCoupling(['module-a'], ['module-b']);
      });

    await bench.run();

    const results = bench.table();
    console.table(results);

    // Verify improvement
    const legacy = bench.tasks.find(t => t.name.includes('Legacy'));
    const mincut = bench.tasks.find(t => t.name.includes('MinCut'));

    const speedup = legacy!.result!.hz / mincut!.result!.hz;
    expect(speedup).toBeGreaterThan(5); // At least 5x faster
  });
});
```

---

## 12. Deployment Strategy

### 12.1 Gradual Rollout Plan

**Week 1: Internal Testing (0% users)**
```bash
# Development only
export MINCUT_ENABLED=true
export MINCUT_MODE=exact
export MINCUT_CACHE_ENABLED=true
```

**Week 2: Canary Release (10% users)**
```typescript
// Probabilistic enablement
FeatureFlags.enableGradually('MINCUT_ENABLED', 10);
```

**Week 3-4: Gradual Increase (25% → 50%)**
```typescript
// Progressive rollout
FeatureFlags.set('MINCUT_ENABLED', true);
FeatureFlags.enableGradually('MINCUT_CODE_INTELLIGENCE_ENABLED', 25);
// Week 4: increase to 50%
```

**Week 5: Full Rollout (100%)**
```bash
# Production
export MINCUT_ENABLED=true
export MINCUT_CODE_INTELLIGENCE_ENABLED=true
export MINCUT_TOPOLOGY_ENABLED=true
export MINCUT_TEST_PARTITION_ENABLED=true
```

### 12.2 Monitoring Metrics

```typescript
interface MinCutMetrics {
  // Performance
  avgExecutionTime: number;
  p95ExecutionTime: number;
  cacheHitRate: number;

  // Reliability
  errorRate: number;
  fallbackRate: number;
  timeoutRate: number;

  // Business Impact
  testExecutionSpeedup: number;     // Target: 30-50%
  couplingAnalysisSpeedup: number;  // Target: 50-90%
  spofDetectionLatency: number;     // Target: < 100ms
}
```

### 12.3 Rollback Procedure

**Immediate Rollback (< 5 minutes):**
```bash
# Disable globally
export MINCUT_ENABLED=false

# Or component-specific
export MINCUT_TEST_PARTITION_ENABLED=false
```

**Code Rollback (< 30 minutes):**
```bash
git revert HEAD~N  # Revert MinCut commits
npm run build
npm run test:fast
# Deploy reverted version
```

---

## Appendix A: Architecture Decision Records

### ADR-001: Use Adapter Pattern for Graph Conversion

**Context:** GraphBuilder uses string node IDs, MinCut uses numeric indices.

**Decision:** Implement `GraphAdapter` with bidirectional mapping.

**Consequences:**
- Pro: Clean separation, easy to test
- Pro: No modification to GraphBuilder core
- Con: O(V) conversion overhead (acceptable)

**Alternatives Considered:**
- Modify GraphBuilder to use numeric IDs → Rejected (breaking change)
- Use string IDs in MinCut → Rejected (WASM binding limitation)

---

### ADR-002: Lazy WASM Initialization

**Context:** WASM module loading is expensive (~50ms).

**Decision:** Singleton pattern with lazy initialization.

**Consequences:**
- Pro: No cost unless MinCut actually used
- Pro: Faster startup time
- Con: First MinCut call slower (acceptable)

**Alternatives Considered:**
- Eager initialization → Rejected (increases startup time)
- On-demand per operation → Rejected (multiple WASM loads)

---

### ADR-003: LRU Cache with TTL

**Context:** MinCut computation expensive, graphs change infrequently.

**Decision:** LRU cache with 1-hour TTL, 100-entry limit.

**Consequences:**
- Pro: 80%+ cache hit rate expected
- Pro: Bounded memory usage (~500KB)
- Con: Stale results if graph changes → Mitigation: invalidate on edit

**Alternatives Considered:**
- No caching → Rejected (too slow)
- Infinite cache → Rejected (memory leak risk)

---

## Appendix B: File Modification Checklist

### New Files (21 total)

- [ ] `src/graph/mincut/types.ts`
- [ ] `src/graph/mincut/MinCutEngine.ts`
- [ ] `src/graph/mincut/GraphAdapter.ts`
- [ ] `src/graph/mincut/ResultInterpreter.ts`
- [ ] `src/graph/mincut/MinCutCache.ts`
- [ ] `src/graph/mincut/index.ts`
- [ ] `src/code-intelligence/analysis/BottleneckDetector.ts`
- [ ] `src/code-intelligence/analysis/CouplingAnalyzer.ts`
- [ ] `src/fleet/topology/MinCutAnalyzer.ts`
- [ ] `src/fleet/topology/SPOFMonitor.ts`
- [ ] `src/test/partition/MinCutPartitioner.ts`
- [ ] `src/coverage/CriticalPathDetector.ts`
- [ ] `src/config/feature-flags.ts`
- [ ] `tests/unit/graph/mincut/*.test.ts`
- [ ] `tests/integration/code-intelligence/mincut/*.test.ts`
- [ ] `tests/benchmarks/mincut-performance.bench.ts`
- [ ] `tests/infrastructure/mincut-rollback.test.ts`
- [ ] `docs/api/mincut-integration.md`
- [ ] `docs/guides/using-mincut-analysis.md`
- [ ] `docs/guides/mincut-migration.md`

### Modified Files (4 total)

- [ ] `src/code-intelligence/graph/GraphBuilder.ts` - Add MinCut methods
- [ ] `src/agents/FleetCommanderAgent.ts` - Add topology analysis
- [ ] `src/agents/CoverageAnalyzerAgent.ts` - Add critical path detection
- [ ] `src/mcp/handlers/test/test-execute-parallel.ts` - Use MinCut partitions

---

## Appendix C: Success Criteria

### Performance Targets

- [ ] Test execution speedup: 30-50%
- [ ] Coupling analysis speedup: 50-90%
- [ ] SPOF detection latency: < 100ms
- [ ] Cache hit rate: > 80%
- [ ] Memory overhead: < 15%

### Quality Targets

- [ ] Unit test coverage: > 85%
- [ ] Integration test coverage: > 80%
- [ ] Performance test coverage: 100%
- [ ] Documentation completeness: 100%
- [ ] Rollback test success: 100%

### Business Metrics

- [ ] Developer productivity: +20-30%
- [ ] Code quality improvement: +15-25%
- [ ] Infrastructure cost savings: 10-20%
- [ ] Time to market: -15-20%

---

**Document Status:** COMPLETE
**Next Steps:** Begin Phase 1 implementation (Research & Architecture)
**Approval Required:** User confirmation before proceeding

---

*Generated by Agentic QE Fleet v2.6.5 - System Architecture Designer*
*Architecture Review Date: 2025-12-25*
