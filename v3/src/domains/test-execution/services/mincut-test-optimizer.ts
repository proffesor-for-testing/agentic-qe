/**
 * MinCut-Based Test Suite Optimization
 * Task 2.3: RVF Integration Plan
 *
 * Uses mincut analysis to identify the minimum set of tests that provide
 * maximum coverage assurance. Models the test suite as a bipartite graph
 * (tests and source files as vertices, coverage as edges) and computes
 * the minimum cut to find the critical test boundary.
 *
 * Algorithm:
 * 1. Build bipartite graph: test nodes <-> source file nodes
 * 2. Edge capacity = 1 / (number of tests covering that file) — rarer coverage is more valuable
 * 3. Compute mincut via MinCutCalculator (weighted-degree heuristic)
 * 4. Tests on the source side of the cut are critical
 * 5. Remaining tests are skippable (their coverage is redundant)
 * 6. Execution order: critical tests first, sorted by coverage breadth
 *
 * @module domains/test-execution/services/mincut-test-optimizer
 */

import { MinCutCalculator } from '../../../coordination/mincut/mincut-calculator.js';
import { SwarmGraph } from '../../../coordination/mincut/swarm-graph.js';
import type { SwarmVertex, SwarmEdge } from '../../../coordination/mincut/interfaces.js';

// ============================================================================
// Public Interfaces
// ============================================================================

/**
 * A test node with its coverage and timing metadata.
 */
export interface TestNode {
  readonly testId: string;
  readonly testFile: string;
  readonly coveredFiles: readonly string[];
  readonly estimatedDurationMs: number;
}

/**
 * Result of mincut-based test suite optimization.
 */
export interface TestOptimizationResult {
  /** Critical tests -- must run for coverage assurance */
  readonly criticalTests: readonly string[];
  /** Tests that can be skipped without reducing coverage below threshold */
  readonly skippableTests: readonly string[];
  /** Optimal execution order (critical first, then diminishing returns) */
  readonly executionOrder: readonly string[];
  /** Estimated time savings if skippable tests are skipped */
  readonly estimatedTimeSavingsMs: number;
  /** Coverage graph statistics */
  readonly graphStats: {
    readonly testCount: number;
    readonly coverageEdges: number;
    readonly mincutValue: number;
    readonly connectedComponents: number;
  };
}

/**
 * Interface for the mincut-based test optimizer.
 */
export interface MinCutTestOptimizer {
  /** Analyze test suite and produce optimization recommendations */
  optimize(tests: readonly TestNode[], coverageThreshold?: number): TestOptimizationResult;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Default implementation of MinCutTestOptimizer.
 *
 * Builds a bipartite graph from test nodes and their covered source files,
 * then uses mincut analysis to partition tests into critical vs skippable.
 */
export class MinCutTestOptimizerImpl implements MinCutTestOptimizer {
  private readonly calculator: MinCutCalculator;

  constructor(calculator?: MinCutCalculator) {
    this.calculator = calculator ?? new MinCutCalculator();
  }

  /**
   * Optimize a test suite using mincut analysis.
   *
   * @param tests - The test nodes to analyze
   * @param coverageThreshold - Minimum fraction of files that must remain covered (0-1, default 1.0)
   * @returns Optimization result with critical/skippable partitioning
   */
  optimize(tests: readonly TestNode[], coverageThreshold: number = 1.0): TestOptimizationResult {
    // Edge case: empty test suite
    if (tests.length === 0) {
      return this.emptyResult();
    }

    // Edge case: single test is always critical
    if (tests.length === 1) {
      return this.singleTestResult(tests[0]);
    }

    // Build the bipartite coverage graph
    const { graph, testIds, fileIds, edgeCount } = this.buildCoverageGraph(tests);

    // Compute mincut
    const mincutResult = this.calculator.approxMinCut(graph);
    const stats = graph.getStats();

    // Classify tests based on mincut partitioning
    const sourceSideSet = new Set(mincutResult.sourceSide);

    // Identify which tests are on the source side (critical boundary)
    // and which are on the target side (potentially skippable)
    const criticalFromCut = new Set<string>();
    const skippableFromCut = new Set<string>();

    for (const testId of testIds) {
      if (sourceSideSet.has(testId)) {
        criticalFromCut.add(testId);
      } else {
        skippableFromCut.add(testId);
      }
    }

    // Build file-to-tests coverage map for redundancy analysis
    const fileCoverage = this.buildFileCoverageMap(tests);
    const allCoveredFiles = new Set(fileCoverage.keys());

    // Ensure tests with unique coverage are always critical
    // A test is uniquely critical if it covers a file no other test covers
    const uniquelyCritical = this.findUniquelyCriticalTests(tests, fileCoverage);
    for (const testId of uniquelyCritical) {
      criticalFromCut.add(testId);
      skippableFromCut.delete(testId);
    }

    // Verify coverage threshold: ensure skipping tests doesn't drop coverage below threshold
    const criticalTests = new Set(criticalFromCut);
    const skippableTests = new Set(skippableFromCut);

    if (coverageThreshold < 1.0) {
      // Allow dropping some coverage
      const requiredFileCount = Math.ceil(allCoveredFiles.size * coverageThreshold);
      const criticalCoveredFiles = this.computeCoveredFiles(tests, criticalTests);

      if (criticalCoveredFiles.size < requiredFileCount) {
        // Promote skippable tests to critical until threshold is met
        this.promoteToCritical(tests, criticalTests, skippableTests, requiredFileCount);
      }
    } else {
      // Full coverage required: promote any test whose removal would lose a file
      this.ensureFullCoverage(tests, criticalTests, skippableTests, fileCoverage);
    }

    // Build execution order: critical first (sorted by coverage breadth desc), then skippable
    const executionOrder = this.buildExecutionOrder(tests, criticalTests, skippableTests);

    // Calculate time savings
    const testMap = new Map(tests.map(t => [t.testId, t]));
    const estimatedTimeSavingsMs = Array.from(skippableTests)
      .reduce((sum, id) => sum + (testMap.get(id)?.estimatedDurationMs ?? 0), 0);

    return {
      criticalTests: Array.from(criticalTests),
      skippableTests: Array.from(skippableTests),
      executionOrder,
      estimatedTimeSavingsMs,
      graphStats: {
        testCount: tests.length,
        coverageEdges: edgeCount,
        mincutValue: mincutResult.value,
        connectedComponents: stats.componentCount,
      },
    };
  }

  // ==========================================================================
  // Graph Construction
  // ==========================================================================

  /**
   * Build a bipartite graph from test nodes and their covered files.
   *
   * Test nodes and file nodes are vertices. Edges connect tests to the
   * files they cover, weighted inversely by the number of tests covering
   * that file (rarer coverage = higher weight = more valuable).
   */
  private buildCoverageGraph(tests: readonly TestNode[]): {
    graph: SwarmGraph;
    testIds: string[];
    fileIds: string[];
    edgeCount: number;
  } {
    const graph = new SwarmGraph();
    const testIds: string[] = [];
    const fileIdSet = new Set<string>();

    // Count how many tests cover each file (for weight calculation)
    const fileCoverCount = new Map<string, number>();
    for (const test of tests) {
      for (const file of test.coveredFiles) {
        fileCoverCount.set(file, (fileCoverCount.get(file) ?? 0) + 1);
      }
    }

    // Add test vertices
    for (const test of tests) {
      const vertex: SwarmVertex = {
        id: test.testId,
        type: 'agent',
        weight: test.coveredFiles.length,
        createdAt: new Date(),
        metadata: { nodeType: 'test', testFile: test.testFile },
      };
      graph.addVertex(vertex);
      testIds.push(test.testId);
    }

    // Add file vertices
    for (const [file] of fileCoverCount) {
      const fileId = `file:${file}`;
      const vertex: SwarmVertex = {
        id: fileId,
        type: 'domain',
        weight: 1.0,
        createdAt: new Date(),
        metadata: { nodeType: 'file', filePath: file },
      };
      graph.addVertex(vertex);
      fileIdSet.add(fileId);
    }

    // Add edges from tests to files
    let edgeCount = 0;
    for (const test of tests) {
      for (const file of test.coveredFiles) {
        const fileId = `file:${file}`;
        const coverCount = fileCoverCount.get(file) ?? 1;
        // Weight: rarer coverage is more valuable
        const weight = 1.0 / coverCount;

        const edge: SwarmEdge = {
          source: test.testId,
          target: fileId,
          weight,
          type: 'coordination',
          bidirectional: true,
        };
        graph.addEdge(edge);
        edgeCount++;
      }
    }

    return {
      graph,
      testIds,
      fileIds: Array.from(fileIdSet),
      edgeCount,
    };
  }

  // ==========================================================================
  // Coverage Analysis
  // ==========================================================================

  /**
   * Build a map from source file -> set of test IDs that cover it.
   */
  private buildFileCoverageMap(tests: readonly TestNode[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const test of tests) {
      for (const file of test.coveredFiles) {
        let testSet = map.get(file);
        if (!testSet) {
          testSet = new Set();
          map.set(file, testSet);
        }
        testSet.add(test.testId);
      }
    }
    return map;
  }

  /**
   * Find tests that are the sole provider of coverage for at least one file.
   * These tests are always critical regardless of mincut partitioning.
   */
  private findUniquelyCriticalTests(
    tests: readonly TestNode[],
    fileCoverage: Map<string, Set<string>>
  ): Set<string> {
    const uniquelyCritical = new Set<string>();

    for (const [, testSet] of fileCoverage) {
      if (testSet.size === 1) {
        // Only one test covers this file; it is uniquely critical
        const [testId] = testSet;
        uniquelyCritical.add(testId);
      }
    }

    return uniquelyCritical;
  }

  /**
   * Compute the set of files covered by a given set of test IDs.
   */
  private computeCoveredFiles(
    tests: readonly TestNode[],
    testIds: Set<string>
  ): Set<string> {
    const covered = new Set<string>();
    for (const test of tests) {
      if (testIds.has(test.testId)) {
        for (const file of test.coveredFiles) {
          covered.add(file);
        }
      }
    }
    return covered;
  }

  /**
   * Promote skippable tests to critical until the required file count is met.
   * Greedy: pick the skippable test that adds the most new coverage each step.
   */
  private promoteToCritical(
    tests: readonly TestNode[],
    criticalTests: Set<string>,
    skippableTests: Set<string>,
    requiredFileCount: number
  ): void {
    const covered = this.computeCoveredFiles(tests, criticalTests);

    const testMap = new Map(tests.map(t => [t.testId, t]));
    const remaining = Array.from(skippableTests);

    while (covered.size < requiredFileCount && remaining.length > 0) {
      // Find the skippable test that adds the most new files
      let bestIdx = -1;
      let bestNewCount = 0;

      for (let i = 0; i < remaining.length; i++) {
        const test = testMap.get(remaining[i]);
        if (!test) continue;
        const newCount = test.coveredFiles.filter(f => !covered.has(f)).length;
        if (newCount > bestNewCount) {
          bestNewCount = newCount;
          bestIdx = i;
        }
      }

      if (bestIdx === -1 || bestNewCount === 0) break;

      const promotedId = remaining[bestIdx];
      remaining.splice(bestIdx, 1);
      criticalTests.add(promotedId);
      skippableTests.delete(promotedId);

      const promotedTest = testMap.get(promotedId)!;
      for (const file of promotedTest.coveredFiles) {
        covered.add(file);
      }
    }
  }

  /**
   * Ensure that skipping the skippable tests does not lose any file coverage.
   * Promote tests from skippable to critical as needed.
   */
  private ensureFullCoverage(
    tests: readonly TestNode[],
    criticalTests: Set<string>,
    skippableTests: Set<string>,
    fileCoverage: Map<string, Set<string>>
  ): void {
    // For each file, check that at least one critical test covers it
    const criticalCovered = this.computeCoveredFiles(tests, criticalTests);

    for (const [file, testSet] of fileCoverage) {
      if (!criticalCovered.has(file)) {
        // No critical test covers this file; promote one
        for (const testId of testSet) {
          if (skippableTests.has(testId)) {
            criticalTests.add(testId);
            skippableTests.delete(testId);
            // Update covered files
            const test = tests.find(t => t.testId === testId);
            if (test) {
              for (const f of test.coveredFiles) {
                criticalCovered.add(f);
              }
            }
            break;
          }
        }
      }
    }
  }

  // ==========================================================================
  // Execution Order
  // ==========================================================================

  /**
   * Build optimal execution order:
   * 1. Critical tests first, sorted by coverage breadth (most files first)
   * 2. Skippable tests after, sorted by coverage breadth
   */
  private buildExecutionOrder(
    tests: readonly TestNode[],
    criticalTests: Set<string>,
    skippableTests: Set<string>
  ): string[] {
    const testMap = new Map(tests.map(t => [t.testId, t]));

    const byCoverage = (a: string, b: string): number => {
      const aCount = testMap.get(a)?.coveredFiles.length ?? 0;
      const bCount = testMap.get(b)?.coveredFiles.length ?? 0;
      return bCount - aCount; // descending
    };

    const critical = Array.from(criticalTests).sort(byCoverage);
    const skippable = Array.from(skippableTests).sort(byCoverage);

    return [...critical, ...skippable];
  }

  // ==========================================================================
  // Edge Case Results
  // ==========================================================================

  private emptyResult(): TestOptimizationResult {
    return {
      criticalTests: [],
      skippableTests: [],
      executionOrder: [],
      estimatedTimeSavingsMs: 0,
      graphStats: {
        testCount: 0,
        coverageEdges: 0,
        mincutValue: 0,
        connectedComponents: 0,
      },
    };
  }

  private singleTestResult(test: TestNode): TestOptimizationResult {
    return {
      criticalTests: [test.testId],
      skippableTests: [],
      executionOrder: [test.testId],
      estimatedTimeSavingsMs: 0,
      graphStats: {
        testCount: 1,
        coverageEdges: test.coveredFiles.length,
        mincutValue: 0,
        connectedComponents: test.coveredFiles.length > 0 ? 1 : 1,
      },
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new MinCutTestOptimizer instance.
 */
export function createMinCutTestOptimizer(calculator?: MinCutCalculator): MinCutTestOptimizer {
  return new MinCutTestOptimizerImpl(calculator);
}
