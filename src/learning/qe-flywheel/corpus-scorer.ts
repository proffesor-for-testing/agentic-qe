/**
 * Real corpus scorer for the QE-policy flywheel (ADR-118) — the injected
 * `PolicyScorer` seam that generation.ts DI's. Turns a `RetrievalPolicy` into
 * its two decision signals over the live corpus:
 *
 *   1. heldOut  — self-supervised self-retrieval MRR over `qe_patterns`: for
 *      each stored pattern, a query is built from its BODY tokens with the
 *      SUBJECT (name) tokens WITHHELD; the correct label is the pattern's own
 *      id. A pure LEXICAL retriever — parameterized entirely by the policy
 *      weights (alpha blends body vs subject match, subject/bodyWeight scale the
 *      term contributions, typePenaltyFactor penalizes pattern_type mismatch,
 *      mmrLambda controls diversity in the ranked list) — ranks the corpus, and
 *      Mean Reciprocal Rank of the true doc is the score. A policy whose weights
 *      better match the corpus ranks the true doc higher, so heldOut is the
 *      optimization signal. NO model, NO network — deterministic lexical only.
 *
 *   2. anchorMean — grade the ADR-117 frozen anchor via `loadAnchorSet` +
 *      `evaluateOracle`, using a gold/reference test per item that kills its
 *      mutants (mutationScore >= 0.8 on all items), then take the mean.
 *
 * HONEST SCOPE (ruflo ADR-176 "human anchor held flat"): in this retrieval-only
 * wiring the retrieval policy does NOT feed test generation, so the anchor mean
 * is a FLAT no-regression GUARD — constant across every policy. It is graded
 * ONCE and cached. Coupling retrieval -> test-gen -> anchor (so the anchor moves
 * with the policy) requires a model in the loop and is DEFERRED. Here the anchor
 * is the flat floor the gate must not regress, while heldOut is the signal the
 * flywheel actually optimizes.
 */

import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { RetrievalPolicy } from './policy.js';
import type { PolicyScorer, PolicyScores } from './generation.js';
import { loadAnchorSet, anchorMean, type AnchorItem } from '../../validation/anchor-set.js';
import { evaluateOracle } from '../../validation/oracle-eval.js';

type SqliteDb = BetterSqlite3.Database;

/** Default frozen anchor location (ADR-117), consistent with anchor-set tests. */
export const DEFAULT_ANCHOR_PATH = join(process.cwd(), 'verification/anchors/qe-anchor-v1.json');

export interface CorpusScorerOptions {
  /** Read-only handle to the corpus DB (must expose a `qe_patterns` table). */
  db: SqliteDb;
  /** Frozen anchor path (ADR-117). Defaults to the pinned qe-anchor-v1. */
  anchorPath?: string;
  /**
   * Fraction of patterns used as held-out queries (deterministic id-sorted
   * prefix). Default 1 (query every pattern). Lower it to bound the O(n^2) cost
   * on large corpora — the subject-withholding is the real held-out mechanism.
   */
  heldOutRatio?: number;
}

// ---------------------------------------------------------------------------
// Corpus loading + tokenization
// ---------------------------------------------------------------------------

interface CorpusDoc {
  id: string;
  patternType: string;
  /** Distinct tokens of the name (the SUBJECT — withheld when this doc is queried). */
  subjectTokens: Set<string>;
  /** Distinct tokens of description + template + context (the BODY). */
  bodyTokens: Set<string>;
  /** subject ∪ body — used for MMR diversity similarity. */
  allTokens: Set<string>;
}

interface PatternRow {
  id: string;
  pattern_type: string | null;
  name: string | null;
  description: string | null;
  template_json: string | null;
  context_json: string | null;
}

/** Lowercase, split on non-alphanumerics, keep tokens of length >= 2, dedupe. */
function tokenize(...parts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const tok of part.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length >= 2) out.add(tok);
    }
  }
  return out;
}

function loadCorpus(db: SqliteDb): CorpusDoc[] {
  const rows = db
    .prepare(
      `SELECT id, pattern_type, name, description, template_json, context_json
         FROM qe_patterns`,
    )
    .all() as PatternRow[];

  return rows.map((r) => {
    const subjectTokens = tokenize(r.name);
    const bodyTokens = tokenize(r.description, r.template_json, r.context_json);
    const allTokens = new Set<string>([...subjectTokens, ...bodyTokens]);
    return {
      id: r.id,
      patternType: r.pattern_type ?? '',
      subjectTokens,
      bodyTokens,
      allTokens,
    };
  });
}

// ---------------------------------------------------------------------------
// Held-out self-retrieval MRR (the optimization signal)
// ---------------------------------------------------------------------------

/** Count of query tokens present in the doc's token set (distinct overlap). */
function overlap(query: Set<string>, docTokens: Set<string>): number {
  let n = 0;
  for (const t of query) if (docTokens.has(t)) n++;
  return n;
}

/** Jaccard similarity of two token sets (for MMR diversity). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Policy-parameterized lexical relevance of `doc` to a body-only `query` drawn
 * from held-out pattern `queried`. alpha blends the body and subject channels;
 * subject/bodyWeight scale each channel; typePenaltyFactor discounts docs whose
 * pattern_type differs from the queried pattern's.
 */
function relevance(
  query: Set<string>,
  doc: CorpusDoc,
  queried: CorpusDoc,
  policy: RetrievalPolicy,
): number {
  const bodyMatch = overlap(query, doc.bodyTokens);
  const subjectMatch = overlap(query, doc.subjectTokens);
  let rel =
    policy.alpha * policy.bodyWeight * bodyMatch +
    (1 - policy.alpha) * policy.subjectWeight * subjectMatch;
  if (doc.patternType !== queried.patternType) {
    rel *= 1 - policy.typePenaltyFactor;
  }
  return rel;
}

interface Scored {
  id: string;
  nrel: number;
  tokens: Set<string>;
}

/**
 * Greedy MMR rerank: select next by lambda * normalized-relevance −
 * (1 − lambda) * max-similarity-to-already-selected. lambda = 1 is pure
 * relevance; lower lambda rewards diversity. Ties break by id for determinism.
 */
function rankMMR(scored: Scored[], lambda: number): string[] {
  const remaining = [...scored].sort((a, b) => b.nrel - a.nrel || a.id.localeCompare(b.id));
  const chosen: Scored[] = [];
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const sim =
        chosen.length === 0
          ? 0
          : Math.max(...chosen.map((c) => jaccard(remaining[i].tokens, c.tokens)));
      const mmr = lambda * remaining[i].nrel - (1 - lambda) * sim;
      if (
        mmr > bestScore ||
        (mmr === bestScore && remaining[i].id.localeCompare(remaining[bestIdx].id) < 0)
      ) {
        bestScore = mmr;
        bestIdx = i;
      }
    }
    chosen.push(remaining.splice(bestIdx, 1)[0]);
  }
  return chosen.map((c) => c.id);
}

/**
 * MMR candidate-pool cap. The greedy MMR rerank is O(pool^2 * tokens) per query,
 * so reranking the WHOLE corpus is cubic in corpus size and hangs on a real
 * (hundreds of patterns) corpus. Standard practice is to rerank only the top-K
 * by relevance — the true doc (queried by its own body) ranks into this pool, so
 * MRR is unchanged, while cost stays bounded. Below this size the behavior is
 * identical to reranking everything (so small-corpus tests are unaffected).
 */
const MMR_POOL_SIZE = 50;

/** Deterministic held-out query split: id-sorted prefix of `ratio` of the corpus. */
function selectHeldOut(docs: CorpusDoc[], ratio: number): CorpusDoc[] {
  const clamped = Math.min(1, Math.max(0, ratio));
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const n = Math.max(1, Math.ceil(sorted.length * clamped));
  return sorted.slice(0, n);
}

/**
 * Mean Reciprocal Rank of each held-out pattern's own id when its BODY tokens
 * are used as the query (subject withheld) and the whole corpus is the
 * candidate pool. In [0, 1]; higher = the policy weights better recover the
 * corpus from its own body signal.
 */
function scoreHeldOut(docs: CorpusDoc[], policy: RetrievalPolicy, ratio: number): number {
  if (docs.length === 0) return 0;
  const queries = selectHeldOut(docs, ratio);
  if (queries.length === 0) return 0;

  let sumReciprocalRank = 0;
  for (const queried of queries) {
    const query = queried.bodyTokens; // subject deliberately withheld
    const rels = docs.map((d) => ({ doc: d, rel: relevance(query, d, queried, policy) }));
    const maxRel = rels.reduce((m, r) => Math.max(m, r.rel), 0);
    const scored: Scored[] = rels.map((r) => ({
      id: r.doc.id,
      nrel: maxRel > 0 ? r.rel / maxRel : 0,
      tokens: r.doc.allTokens,
    }));
    // Rerank only the top-K by relevance (bounded MMR cost). Force-include the
    // true doc so its rank is always measurable even if it fell just outside K.
    const pool = scored
      .slice()
      .sort((a, b) => b.nrel - a.nrel || a.id.localeCompare(b.id))
      .slice(0, MMR_POOL_SIZE);
    if (!pool.some((s) => s.id === queried.id)) {
      const trueDoc = scored.find((s) => s.id === queried.id);
      if (trueDoc) pool.push(trueDoc);
    }
    const ranked = rankMMR(pool, policy.mmrLambda);
    const rank = ranked.indexOf(queried.id) + 1; // 1-based; 0 -> not found
    sumReciprocalRank += rank > 0 ? 1 / rank : 0;
  }
  return sumReciprocalRank / queries.length;
}

// ---------------------------------------------------------------------------
// Anchor flat guard (the no-regression floor)
// ---------------------------------------------------------------------------

/**
 * Gold/reference tests for the frozen qe-anchor-v1 items — each is a minimal
 * CORRECT test written to kill its item's operator mutants (verified >= 0.8 via
 * evaluateOracle). Keyed by moduleName. These stand in for the "human anchor"
 * that a policy-independent, model-free wiring cannot generate itself.
 */
const GOLD_TESTS: Record<string, string> = {
  inRange: `import test from 'node:test';
import assert from 'node:assert/strict';
import { inRange } from '../src/inRange.mjs';
test('inRange', () => {
  assert.equal(inRange(2, 1, 3), true);
  assert.equal(inRange(1, 1, 3), true);
  assert.equal(inRange(3, 1, 3), true);
  assert.equal(inRange(0, 1, 3), false);
  assert.equal(inRange(5, 1, 3), false);
});
`,
  letterGrade: `import test from 'node:test';
import assert from 'node:assert/strict';
import { letterGrade } from '../src/letterGrade.mjs';
test('letterGrade', () => {
  assert.equal(letterGrade(95), 'A');
  assert.equal(letterGrade(90), 'A');
  assert.equal(letterGrade(89), 'D');
  assert.equal(letterGrade(60), 'D');
  assert.equal(letterGrade(59), 'F');
});
`,
  isBlank: `import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlank } from '../src/isBlank.mjs';
test('isBlank', () => {
  assert.equal(isBlank(''), true);
  assert.equal(isBlank('   '), true);
  assert.equal(isBlank(null), true);
  assert.equal(isBlank(undefined), true);
  assert.equal(isBlank('abc'), false);
});
`,
  countAbove: `import test from 'node:test';
import assert from 'node:assert/strict';
import { countAbove } from '../src/countAbove.mjs';
test('countAbove', () => {
  assert.equal(countAbove([1, 2, 3], 2), 1);
  assert.equal(countAbove([2, 3], 2), 1);
  assert.equal(countAbove([1, 1], 2), 0);
  assert.equal(countAbove([], 2), 0);
});
`,
  parseBool: `import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBool } from '../src/parseBool.mjs';
test('parseBool', () => {
  assert.equal(parseBool('true'), true);
  assert.equal(parseBool('TRUE'), true);
  assert.equal(parseBool('false'), false);
  assert.throws(() => parseBool('nope'));
});
`,
};

/** Grade one anchor item with its gold test; returns the oracle mutation score. */
function gradeAnchorItem(item: AnchorItem): number {
  const goldTest = GOLD_TESTS[item.moduleName];
  if (!goldTest) {
    throw new Error(
      `No gold reference test for anchor item "${item.id}" (module "${item.moduleName}"). ` +
        `The corpus scorer's flat guard is wired for qe-anchor-v1; a re-frozen anchor ` +
        `needs matching gold tests added here.`,
    );
  }
  const result = evaluateOracle({
    moduleName: item.moduleName,
    referenceImpl: item.referenceImpl,
    generatedTest: goldTest,
    threshold: 0.8,
  });
  return result.mutationScore;
}

/** Grade the whole frozen anchor -> mean of per-item mutation scores (the flat floor). */
function gradeAnchor(anchorPath: string): number {
  const anchor = loadAnchorSet(anchorPath); // throws on hash drift (ADR-117)
  const scores = anchor.items.map(gradeAnchorItem);
  return anchorMean(scores);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the real `PolicyScorer` for the flywheel. The corpus is read ONCE and
 * the frozen anchor is graded ONCE (lazily, then cached) — the anchor mean is
 * policy-independent (the honest flat guard), so caching makes the flat-guard
 * property exact and avoids re-spawning the oracle per generation. Only heldOut
 * varies with the policy.
 */
export function createCorpusScorer(opts: CorpusScorerOptions): PolicyScorer {
  const anchorPath = opts.anchorPath ?? DEFAULT_ANCHOR_PATH;
  const ratio = opts.heldOutRatio ?? 1;
  const corpus = loadCorpus(opts.db);
  let anchorMeanCached: number | null = null;

  return (policy: RetrievalPolicy): PolicyScores => {
    const heldOut = scoreHeldOut(corpus, policy, ratio);
    if (anchorMeanCached === null) {
      anchorMeanCached = gradeAnchor(anchorPath);
    }
    return { heldOut, anchorMean: anchorMeanCached };
  };
}
