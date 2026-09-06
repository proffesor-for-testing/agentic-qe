import { describe, expect, it } from 'vitest';
import {
  createRetrievalReceipt,
  createStructuralRetrievalCorpus,
  diagnoseRetrieval,
  evaluateStructuralRetrieval,
} from '../../../src/learning/structural-retrieval/index.js';
import type {
  QueryRetrievalResult,
  StructuralPattern,
  StructuralRetrievalQuery,
} from '../../../src/learning/structural-retrieval/index.js';

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2));
}

function lexicalScore(query: string, pattern: StructuralPattern): number {
  const queryTokens = tokens(query);
  const patternTokens = tokens(pattern.text);
  return [...queryTokens].filter(token => patternTokens.has(token)).length / Math.max(1, queryTokens.size);
}

function lexicalResults(): QueryRetrievalResult[] {
  const corpus = createStructuralRetrievalCorpus();
  return corpus.queries.map(query => ({
    queryId: query.id,
    candidates: corpus.patterns
      .map(pattern => ({ patternId: pattern.id, score: lexicalScore(query.text, pattern) }))
      .sort((a, b) => b.score - a.score || a.patternId.localeCompare(b.patternId))
      .slice(0, 10),
  }));
}

describe('structural retrieval qualification corpus', () => {
  it('freezes a lineage-tracked corpus with 100 queries and five transformations', () => {
    const corpus = createStructuralRetrievalCorpus();
    expect(corpus.schemaVersion).toBe('aqe-structural-retrieval/v1');
    expect(corpus.lineageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createStructuralRetrievalCorpus().lineageHash).toBe(corpus.lineageHash);
    expect(corpus.queries).toHaveLength(100);
    expect(new Set(corpus.queries.map(query => query.transformation))).toHaveLength(5);
    expect(Object.isFrozen(corpus)).toBe(true);
    expect(Object.isFrozen(corpus.queries)).toBe(true);
    expect(Object.isFrozen(corpus.queries[0]!.mustNotRankAbove)).toBe(true);
  });

  it('keeps source families disjoint across train, calibration, and audit splits', () => {
    const corpus = createStructuralRetrievalCorpus();
    const families = new Map<string, Set<string>>();
    for (const query of corpus.queries) {
      const splits = families.get(query.familyId) ?? new Set<string>();
      splits.add(query.split);
      families.set(query.familyId, splits);
    }
    expect([...families.values()].every(splits => splits.size === 1)).toBe(true);
    expect(new Set(corpus.queries.map(query => query.split))).toEqual(new Set(['train', 'calibration', 'audit']));
  });

  it('includes hard distractors, counterexamples, gold relevance, and ordering constraints', () => {
    const corpus = createStructuralRetrievalCorpus();
    expect(corpus.queries.every(query => query.relevantPatternIds.length > 0)).toBe(true);
    expect(corpus.queries.every(query => query.mustNotRankAbove.length === 2)).toBe(true);
    expect(corpus.patterns.filter(pattern => pattern.id.endsWith('surface-distractor'))).toHaveLength(20);
    expect(corpus.patterns.filter(pattern => pattern.id.endsWith('counterexample'))).toHaveLength(20);
  });
});

describe('structural retrieval metrics and diagnostics', () => {
  it('reports perfect ranking metrics, slices, attribution, and relation compliance', () => {
    const corpus = createStructuralRetrievalCorpus();
    const results = corpus.queries.map(query => ({
      queryId: query.id,
      candidates: [
        { patternId: query.relevantPatternIds[0]!, score: 0.9 },
        { patternId: query.mustNotRankAbove[0]!.lowerPatternId, score: 0.3 },
      ],
      appliedPatternIds: [query.relevantPatternIds[0]!],
      outcomeImproved: true,
    }));
    const report = evaluateStructuralRetrieval(corpus, results, { rankerVersion: 'oracle/v1', k: 2 });
    expect(report.overall).toMatchObject({ support: 100 });
    expect(report.overall.recallAtK.value).toBe(1);
    expect(report.overall.hitAt1.value).toBe(1);
    expect(report.overall.mrr.value).toBe(1);
    expect(report.overall.ndcg.value).toBe(1);
    expect(report.overall.top1Margin.value).toBeCloseTo(0.6);
    expect(report.diagnostics.success).toBe(100);
    expect(report.relationViolations).toBe(0);
    expect(Object.values(report.slices).every(slice => slice?.support === 20)).toBe(true);
  });

  it('acts as a negative control by exposing lexical-overlap ranking failure', () => {
    const corpus = createStructuralRetrievalCorpus();
    const report = evaluateStructuralRetrieval(corpus, lexicalResults(), { rankerVersion: 'lexical-overlap/v1' });
    expect(report.overall.hitAt1.value).toBeLessThan(0.8);
    expect(report.relationViolations).toBeGreaterThan(0);
    expect(report.diagnostics.success).toBe(0);
  });

  it('distinguishes each retrieval-to-outcome failure stage', () => {
    const corpus = createStructuralRetrievalCorpus();
    const query = corpus.queries[0]!;
    const relevant = query.relevantPatternIds[0]!;
    const wrong = query.mustNotRankAbove[0]!.lowerPatternId;
    const result = (candidates: QueryRetrievalResult['candidates'], appliedPatternIds?: string[], outcomeImproved?: boolean) =>
      ({ queryId: query.id, candidates, appliedPatternIds, outcomeImproved });
    expect(diagnoseRetrieval(query, result([{ patternId: wrong, score: 1 }]), 2)).toBe('not_retrieved');
    expect(diagnoseRetrieval(query, result([{ patternId: wrong, score: 1 }, { patternId: relevant, score: 0.5 }]), 2))
      .toBe('retrieved_misranked');
    expect(diagnoseRetrieval(query, result([{ patternId: relevant, score: 1 }]), 2)).toBe('ranked_not_used');
    expect(diagnoseRetrieval(query, result([{ patternId: relevant, score: 1 }], [relevant], false), 2))
      .toBe('used_no_benefit');
    expect(diagnoseRetrieval(query, result([{ patternId: relevant, score: 1 }], [relevant], true), 2)).toBe('success');
  });

  it('rejects incomplete benchmark runs', () => {
    const corpus = createStructuralRetrievalCorpus();
    expect(() => evaluateStructuralRetrieval(corpus, [], { rankerVersion: 'broken/v1' }))
      .toThrow('exactly one entry for every corpus query');
  });

  it('rejects attribution to a pattern absent from the candidate evidence', () => {
    const corpus = createStructuralRetrievalCorpus();
    const results = corpus.queries.map(query => ({
      queryId: query.id,
      candidates: [{ patternId: query.relevantPatternIds[0]!, score: 1 }],
      appliedPatternIds: [] as string[],
    }));
    results[0]!.appliedPatternIds = ['family-20-counterexample'];
    expect(() => evaluateStructuralRetrieval(corpus, results, { rankerVersion: 'ranker/v1' }))
      .toThrow('applied pattern was not a candidate');
  });

  it('rejects tampered corpus lineage and malformed candidate evidence', () => {
    const corpus = createStructuralRetrievalCorpus();
    const forged = { ...corpus, corpusRevision: 'forged' };
    expect(() => evaluateStructuralRetrieval(forged, [], { rankerVersion: 'ranker/v1' }))
      .toThrow('corpus lineage hash mismatch');

    const results = corpus.queries.map(query => ({
      queryId: query.id,
      candidates: [{ patternId: query.relevantPatternIds[0]!, score: 1 }],
    }));
    results[0]!.candidates.push({ patternId: results[0]!.candidates[0]!.patternId, score: Number.NaN });
    expect(() => evaluateStructuralRetrieval(corpus, results, { rankerVersion: 'ranker/v1' }))
      .toThrow(/finite|duplicate/);
  });
});

describe('retrieval receipts', () => {
  it('binds representation, embedding, candidates, ranker, use, and outcome without reasoning text', () => {
    const input = {
      revision: 'abc123', queryId: 'query-1', queryRepresentationVersion: 'typed/v1',
      embeddingSpaceId: 'minilm:384:v1', rankerVersion: 'baseline/v1',
      candidates: [{ patternId: 'pattern-1', score: 0.75 }], appliedPatternIds: ['pattern-1'],
      outcomeRef: 'run-9', outcomeImproved: true,
    };
    const receipt = createRetrievalReceipt(input);
    expect(receipt.receiptId).toBe(createRetrievalReceipt(input).receiptId);
    expect(receipt).toMatchObject(input);
    expect(JSON.stringify(receipt)).not.toMatch(/chain.of.thought|reasoning/i);
    expect(Object.isFrozen(receipt.candidates)).toBe(true);
  });

  it('fails closed when provenance is absent', () => {
    expect(() => createRetrievalReceipt({
      revision: '', queryId: 'query-1', queryRepresentationVersion: 'typed/v1', embeddingSpaceId: '',
      rankerVersion: 'ranker/v1', candidates: [],
    })).toThrow('provenance fields must be non-empty');
  });
});
