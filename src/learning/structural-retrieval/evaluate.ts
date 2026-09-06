import type {
  MetricEstimate, QueryRetrievalResult, RetrievalDiagnostic, RetrievalMetricSet,
  StructuralRetrievalCorpus, StructuralRetrievalQuery, StructuralRetrievalReport,
} from './types.js';
import { verifyStructuralRetrievalCorpus } from './corpus.js';

interface Scores { recall: number; hit: number; reciprocalRank: number; ndcg: number; margin: number }

function queryScores(query: StructuralRetrievalQuery, result: QueryRetrievalResult, k: number): Scores {
  const relevant = new Set(query.relevantPatternIds);
  const rank = result.candidates.findIndex(candidate => relevant.has(candidate.patternId));
  const topKHits = result.candidates.slice(0, k).filter(candidate => relevant.has(candidate.patternId)).length;
  const idealCount = Math.min(k, relevant.size);
  const dcg = result.candidates.slice(0, k).reduce(
    (sum, candidate, index) => sum + (relevant.has(candidate.patternId) ? 1 / Math.log2(index + 2) : 0), 0,
  );
  const idcg = Array.from({ length: idealCount }, (_, index) => 1 / Math.log2(index + 2)).reduce((a, b) => a + b, 0);
  const relevantScore = rank >= 0 ? result.candidates[rank]!.score : 0;
  const bestWrong = Math.max(0, ...result.candidates.filter(c => !relevant.has(c.patternId)).map(c => c.score));
  return {
    recall: relevant.size === 0 ? 0 : topKHits / relevant.size,
    hit: rank === 0 ? 1 : 0,
    reciprocalRank: rank < 0 ? 0 : 1 / (rank + 1),
    ndcg: idcg === 0 ? 0 : dcg / idcg,
    margin: relevantScore - bestWrong,
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function estimate(values: number[], seed: number): MetricEstimate {
  if (values.length === 0) return { value: 0, confidenceInterval: { lower: 0, upper: 0, level: 0.95 } };
  let state = seed >>> 0;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
  const bootstraps = Array.from({ length: 1000 }, () => mean(Array.from(
    { length: values.length }, () => values[Math.floor(random() * values.length)]!,
  ))).sort((a, b) => a - b);
  return {
    value: mean(values),
    confidenceInterval: {
      lower: bootstraps[Math.floor(bootstraps.length * 0.025)]!,
      upper: bootstraps[Math.floor(bootstraps.length * 0.975)]!,
      level: 0.95,
    },
  };
}

function metricSet(scores: Scores[]): RetrievalMetricSet {
  return {
    support: scores.length,
    recallAtK: estimate(scores.map(s => s.recall), 11),
    hitAt1: estimate(scores.map(s => s.hit), 13),
    mrr: estimate(scores.map(s => s.reciprocalRank), 17),
    ndcg: estimate(scores.map(s => s.ndcg), 19),
    top1Margin: estimate(scores.map(s => s.margin), 23),
  };
}

export function diagnoseRetrieval(query: StructuralRetrievalQuery, result: QueryRetrievalResult, k: number): RetrievalDiagnostic {
  const relevant = new Set(query.relevantPatternIds);
  const relevantCandidates = result.candidates.slice(0, k).filter(c => relevant.has(c.patternId));
  if (relevantCandidates.length === 0) return 'not_retrieved';
  if (!relevant.has(result.candidates[0]?.patternId ?? '')) return 'retrieved_misranked';
  const applied = result.appliedPatternIds ?? [];
  if (applied.length === 0 || !applied.some(id => relevant.has(id))) return 'ranked_not_used';
  if (result.outcomeImproved !== true) return 'used_no_benefit';
  return 'success';
}

export function evaluateStructuralRetrieval(
  corpus: StructuralRetrievalCorpus,
  results: QueryRetrievalResult[],
  options: { rankerVersion: string; k?: number },
): StructuralRetrievalReport {
  const k = options.k ?? 10;
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer');
  if (!verifyStructuralRetrievalCorpus(corpus)) throw new Error('corpus lineage hash mismatch');
  if (results.length !== corpus.queries.length) {
    throw new Error('results must contain exactly one entry for every corpus query');
  }
  const byQuery = new Map(results.map(result => [result.queryId, result]));
  if (byQuery.size !== corpus.queries.length || corpus.queries.some(query => !byQuery.has(query.id))) {
    throw new Error('results must contain exactly one entry for every corpus query');
  }
  const knownPatterns = new Set(corpus.patterns.map(pattern => pattern.id));
  for (const result of results) {
    const candidateIds = new Set<string>();
    for (const candidate of result.candidates) {
      if (!knownPatterns.has(candidate.patternId)) throw new Error(`unknown candidate pattern: ${candidate.patternId}`);
      if (!Number.isFinite(candidate.score)) throw new Error(`candidate score must be finite: ${candidate.patternId}`);
      if (candidateIds.has(candidate.patternId)) throw new Error(`duplicate candidate pattern: ${candidate.patternId}`);
      candidateIds.add(candidate.patternId);
    }
    for (const appliedId of result.appliedPatternIds ?? []) {
      if (!candidateIds.has(appliedId)) throw new Error(`applied pattern was not a candidate: ${appliedId}`);
    }
  }
  const rows = corpus.queries.map(query => {
    const result = byQuery.get(query.id)!;
    return { query, result, scores: queryScores(query, result, k) };
  });
  const diagnosticNames: RetrievalDiagnostic[] = [
    'success', 'not_retrieved', 'retrieved_misranked', 'ranked_not_used', 'used_no_benefit',
  ];
  const diagnostics = Object.fromEntries(diagnosticNames.map(name => [name, 0])) as Record<RetrievalDiagnostic, number>;
  for (const row of rows) diagnostics[diagnoseRetrieval(row.query, row.result, k)] += 1;
  const relationViolations = rows.reduce((count, { query, result }) => {
    const ranks = new Map(result.candidates.map((candidate, index) => [candidate.patternId, index]));
    return count + query.mustNotRankAbove.filter(relation => {
      const low = ranks.get(relation.lowerPatternId);
      const high = ranks.get(relation.higherPatternId);
      return low !== undefined && (high === undefined || low < high);
    }).length;
  }, 0);
  const slices: StructuralRetrievalReport['slices'] = {};
  for (const transformation of new Set(corpus.queries.map(query => query.transformation))) {
    slices[transformation] = metricSet(rows.filter(row => row.query.transformation === transformation).map(row => row.scores));
  }
  return {
    corpusRevision: corpus.corpusRevision,
    corpusLineageHash: corpus.lineageHash,
    rankerVersion: options.rankerVersion,
    k,
    overall: metricSet(rows.map(row => row.scores)),
    slices,
    diagnostics,
    relationViolations,
  };
}
