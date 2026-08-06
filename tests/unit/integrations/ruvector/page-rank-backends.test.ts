import { describe, expect, it, vi } from 'vitest';

import {
  computeTypeScriptPageRank,
  edgeListToCsr,
  runNativePageRank,
  runPageRankWorker,
  type NativeSolverModule,
  type PatternGraph,
  type SolverConfig,
} from '../../../../src/integrations/ruvector/page-rank-backends.js';

const CONFIG: SolverConfig = {
  dampingFactor: 0.85,
  tolerance: 1e-8,
  maxIterations: 200,
};

const WEIGHTED_GRAPH: PatternGraph = {
  nodes: ['a', 'b', 'c', 'dangling'],
  edges: [
    [0, 1, 1],
    [0, 2, 3],
    [1, 2, 2],
    [2, 0, 1],
  ],
};

describe('PageRank backend contracts', () => {
  it('should_returnNoScores_when_graphIsEmpty', () => {
    expect(computeTypeScriptPageRank({ nodes: [], edges: [] }, CONFIG)).toHaveLength(0);
  });

  it('should_convertWeightedEdgeList_when_nativeBackendNeedsCsr', () => {
    const csr = edgeListToCsr(WEIGHTED_GRAPH);

    expect(csr).toEqual({
      values: [1, 3, 2, 1],
      colIndices: [1, 2, 2, 0],
      rowPtrs: [0, 2, 3, 4, 4],
    });
  });

  it('should_matchSynchronousScores_when_workerBackendRuns', async () => {
    const expected = computeTypeScriptPageRank(WEIGHTED_GRAPH, CONFIG);

    const actual = await runPageRankWorker(WEIGHTED_GRAPH, CONFIG);

    expect(Array.from(actual)).toEqual(Array.from(expected));
  });

  it('should_mapCsrContract_when_nativeBackendRuns', async () => {
    const pagerank = vi.fn().mockResolvedValue({
      scores: [1, 2, 3, 4],
      converged: true,
      iterations: 7,
      residual: 1e-9,
    });
    const module: NativeSolverModule = {
      NapiSolver: class { pagerank = pagerank; },
    };

    await runNativePageRank(module, WEIGHTED_GRAPH, CONFIG);

    expect(pagerank).toHaveBeenCalledWith({
      values: [1, 3, 2, 1],
      colIndices: [1, 2, 2, 0],
      rowPtrs: [0, 2, 3, 4, 4],
      numNodes: 4,
      damping: 0.85,
      tolerance: 1e-8,
      maxIterations: 200,
    });
  });

  it('should_normalizeScores_when_nativeBackendHasRoundingDrift', async () => {
    const module: NativeSolverModule = {
      NapiSolver: class {
        async pagerank() {
          return { scores: [1, 2, 3, 4], converged: true, iterations: 1, residual: 0 };
        }
      },
    };

    const scores = await runNativePageRank(module, WEIGHTED_GRAPH, CONFIG);

    expect(Array.from(scores)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('should_rejectResult_when_nativeBackendDoesNotConverge', async () => {
    const module: NativeSolverModule = {
      NapiSolver: class {
        async pagerank() {
          return { scores: [0.25, 0.25, 0.25, 0.25], converged: false, iterations: 200, residual: 1 };
        }
      },
    };

    const operation = runNativePageRank(module, WEIGHTED_GRAPH, CONFIG);

    await expect(operation).rejects.toThrow(/did not converge/i);
  });
});
