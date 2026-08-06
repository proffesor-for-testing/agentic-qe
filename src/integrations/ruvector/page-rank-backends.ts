import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

export interface PatternGraph {
  nodes: string[];
  edges: Array<[number, number, number]>;
}

export interface SolverConfig {
  dampingFactor: number;
  tolerance: number;
  maxIterations: number;
}

export interface NativePageRankResult {
  scores: number[] | Float64Array;
  converged: boolean;
  iterations: number;
  residual: number;
}

export interface NativePageRankSolver {
  pagerank(input: {
    values: number[];
    colIndices: number[];
    rowPtrs: number[];
    numNodes: number;
    damping: number;
    tolerance: number;
    maxIterations: number;
  }): Promise<NativePageRankResult>;
}

export interface NativeSolverModule {
  NapiSolver: new () => NativePageRankSolver;
}

export type AsyncPageRankRunner = (
  graph: PatternGraph,
  config: SolverConfig,
  timeoutMs?: number,
) => Promise<Float64Array>;

/** Standard weighted PageRank with uniform dangling-node redistribution. */
export function computeTypeScriptPageRank(
  graph: PatternGraph,
  config: SolverConfig,
): Float64Array {
  const n = graph.nodes.length;
  if (n === 0) return new Float64Array();

  const { dampingFactor: d, tolerance, maxIterations } = config;
  const weightedOutDegree = new Float64Array(n);
  const inEdges: Array<Array<[number, number]>> = new Array(n);

  for (let i = 0; i < n; i++) inEdges[i] = [];
  for (const [from, to, weight] of graph.edges) {
    weightedOutDegree[from] += weight;
    inEdges[to].push([from, weight]);
  }

  const danglingNodes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (weightedOutDegree[i] === 0) danglingNodes.push(i);
  }

  let scores = new Float64Array(n);
  scores.fill(1 / n);
  const base = (1 - d) / n;

  for (let iter = 0; iter < maxIterations; iter++) {
    let danglingSum = 0;
    for (const index of danglingNodes) danglingSum += scores[index];
    const danglingContribution = d * danglingSum / n;
    const next = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      let incoming = 0;
      for (const [from, weight] of inEdges[i]) {
        incoming += scores[from] * weight / weightedOutDegree[from];
      }
      next[i] = base + d * incoming + danglingContribution;
    }

    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(next[i] - scores[i]));
    }
    scores = next;
    if (maxDelta < tolerance) break;
  }

  return scores;
}

export function edgeListToCsr(graph: PatternGraph): {
  values: number[];
  colIndices: number[];
  rowPtrs: number[];
} {
  const rows: Array<Array<[number, number]>> = Array.from(
    { length: graph.nodes.length },
    () => [],
  );
  for (const [from, to, weight] of graph.edges) rows[from].push([to, weight]);

  const values: number[] = [];
  const colIndices: number[] = [];
  const rowPtrs: number[] = [0];
  for (const row of rows) {
    row.sort((left, right) => left[0] - right[0]);
    for (const [column, value] of row) {
      colIndices.push(column);
      values.push(value);
    }
    rowPtrs.push(values.length);
  }
  return { values, colIndices, rowPtrs };
}

export function loadNativeSolverModule(): NativeSolverModule | null {
  try {
    const req = createRequire(import.meta.url);
    const candidate = req('@ruvector/solver') as Partial<NativeSolverModule>;
    return typeof candidate.NapiSolver === 'function'
      ? candidate as NativeSolverModule
      : null;
  } catch {
    return null;
  }
}

export async function runNativePageRank(
  module: NativeSolverModule,
  graph: PatternGraph,
  config: SolverConfig,
): Promise<Float64Array> {
  const csr = edgeListToCsr(graph);
  const result = await new module.NapiSolver().pagerank({
    ...csr,
    numNodes: graph.nodes.length,
    damping: config.dampingFactor,
    tolerance: config.tolerance,
    maxIterations: config.maxIterations,
  });

  if (!result.converged) throw new Error('Native PageRank did not converge');
  return validatePageRankScores(result.scores, graph.nodes.length);
}

export function runPageRankWorker(
  graph: PatternGraph,
  config: SolverConfig,
  timeoutMs = 30_000,
): Promise<Float64Array> {
  const workerSource = `
    const { parentPort, workerData } = require('node:worker_threads');
    const compute = ${computeTypeScriptPageRank.toString()};
    try {
      const graph = {
        nodes: new Array(workerData.nodeCount),
        edges: workerData.edges,
      };
      const scores = compute(graph, workerData.config);
      parentPort.postMessage(scores, [scores.buffer]);
    } catch (error) {
      throw error;
    }
  `;

  return new Promise<Float64Array>((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        nodeCount: graph.nodes.length,
        edges: graph.edges,
        config,
      },
    });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error(`PageRank worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.once('message', (scores: Float64Array | number[]) => {
      clearTimeout(timeout);
      resolve(validatePageRankScores(scores, graph.nodes.length));
    });
    worker.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`PageRank worker exited with code ${code}`));
      }
    });
  });
}

function validatePageRankScores(
  input: number[] | Float64Array,
  expectedLength: number,
): Float64Array {
  const scores = input instanceof Float64Array ? input : Float64Array.from(input);
  if (scores.length !== expectedLength) {
    throw new Error(`PageRank returned ${scores.length} scores for ${expectedLength} nodes`);
  }

  let total = 0;
  for (const score of scores) {
    if (!Number.isFinite(score) || score < 0) {
      throw new Error('PageRank returned an invalid score');
    }
    total += score;
  }
  if (!(total > 0)) throw new Error('PageRank returned a zero score total');
  if (Math.abs(total - 1) > 1e-12) {
    for (let i = 0; i < scores.length; i++) scores[i] /= total;
  }
  return scores;
}
