/**
 * Coupled anchor scorer — retrieval → test-gen → anchor (ADR-118 / ADR-117).
 *
 * In the retrieval-only wiring the anchor was policy-INDEPENDENT (a flat guard):
 * the retrieval policy didn't feed test generation, so it couldn't move the
 * oracle score, and the no-regression guard was inert. This closes that loop:
 *
 *   retrieve(inputUnderTest, policy) → few-shot examples
 *       → generate(inputUnderTest, examples) → a test
 *           → evaluateOracle(referenceImpl, test) → mutation kill rate
 *
 * Now `anchorMean` VARIES with the retrieval policy — a policy that surfaces
 * more useful examples yields better generated tests and a higher oracle score.
 * The guard gets teeth: a candidate that games the cheap self-retrieval proxy
 * but produces WORSE tests drops the anchor mean and is rejected (ADR-117
 * no-regression), and the promotion is now genuinely oracle:test-exec-backed
 * (ADR-121) rather than a framing stretch.
 *
 * `retrieve` and `generate` are injected seams: fake/deterministic in tests,
 * a real policy-weighted DB retriever + an LLM test generator in production
 * (the LLM step is the metered part — bind it deliberately).
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { computeRealEmbedding } from '../real-embeddings.js';
import { evaluateOracle } from '../../validation/oracle-eval.js';
import { loadAnchorSet, anchorMean as meanOf, type AnchorItem } from '../../validation/anchor-set.js';
import type { RetrievalPolicy } from './policy.js';
import { createCorpusScorer } from './corpus-scorer.js';
import type { PolicyScorer, PolicyScores } from './generation.js';

/** A pattern retrieved as a few-shot example for test generation. */
export interface RetrievedExample {
  id: string;
  name: string;
  body: string;
}

/** Retrieve few-shot examples for a query under a given retrieval policy. */
export type RetrieveFn = (query: string, policy: RetrievalPolicy) => RetrievedExample[] | Promise<RetrievedExample[]>;

/** Generate a test for `inputUnderTest`, optionally conditioned on examples. */
export type TestGenerator = (inputUnderTest: string, examples: RetrievedExample[]) => string | Promise<string>;

export interface CoupledAnchorOptions {
  anchorPath?: string;
  retrieve: RetrieveFn;
  generate: TestGenerator;
  /** Oracle mutation-kill threshold per item (default 0.8 — the ADR-117 High bar). */
  threshold?: number;
  /** Cap on mutants per item for speed (forwarded to evaluateOracle). */
  maxMutants?: number;
}

const DEFAULT_ANCHOR_PATH = new URL('../../../verification/anchors/qe-anchor-v1.json', import.meta.url).pathname;

/**
 * Build the coupled anchorMean scorer: `(policy) => Promise<number>`.
 * Grades each frozen anchor item by generating a test from policy-retrieved
 * examples and scoring its mutation kill rate. The anchor now moves with the
 * policy.
 */
export function createCoupledAnchorScorer(opts: CoupledAnchorOptions): (policy: RetrievalPolicy) => Promise<number> {
  const anchor = loadAnchorSet(opts.anchorPath ?? DEFAULT_ANCHOR_PATH);
  const threshold = opts.threshold ?? 0.8;

  return async (policy: RetrievalPolicy): Promise<number> => {
    const scores: number[] = [];
    for (const item of anchor.items as AnchorItem[]) {
      const examples = await opts.retrieve(item.inputUnderTest, policy);
      const generatedTest = await opts.generate(item.inputUnderTest, examples);
      const result = evaluateOracle({
        moduleName: item.moduleName,
        referenceImpl: item.referenceImpl,
        generatedTest,
        threshold,
        maxMutants: opts.maxMutants,
      });
      scores.push(result.mutationScore);
    }
    return meanOf(scores);
  };
}

export interface CoupledScorerOptions extends CoupledAnchorOptions {
  /** DB handle for the self-retrieval held-out signal (read-only). */
  db: DatabaseType;
  /** Held-out query ratio for the proxy signal (bounds cost). */
  heldOutRatio?: number;
}

/**
 * A full PolicyScorer where `heldOut` is the cheap self-retrieval proxy (train
 * signal) and `anchorMean` is the COUPLED oracle test-gen quality (the guard
 * that now moves). The flywheel's accept() then requires a proxy gain WITHOUT an
 * oracle-quality regression — the proxy-overfitting veto ADR-117 exists for.
 */
export function createCoupledScorer(opts: CoupledScorerOptions): PolicyScorer {
  const heldOutScorer = createCorpusScorer({ db: opts.db, anchorPath: opts.anchorPath, heldOutRatio: opts.heldOutRatio });
  const anchorScorer = createCoupledAnchorScorer(opts);

  return async (policy: RetrievalPolicy): Promise<PolicyScores> => {
    // heldOut comes from the corpus scorer (its own anchorMean is the flat guard
    // and is discarded here — the coupled anchor replaces it).
    const heldOut = (await heldOutScorer(policy)).heldOut;
    const anchorMean = await anchorScorer(policy);
    return { heldOut, anchorMean };
  };
}

/**
 * A real policy-weighted DB retriever over `qe_patterns` — token overlap on the
 * query, scaled by the policy's body/subject weights, top-K by score. Read-only.
 * Injected as `retrieve` for live runs; tests use a deterministic fake instead.
 */
export function createDbRetriever(db: DatabaseType, topK = 3): RetrieveFn {
  const rows = db.prepare(
    `SELECT id, name, COALESCE(description,'') AS body FROM qe_patterns WHERE deprecated_at IS NULL`,
  ).all() as { id: string; name: string; body: string }[];
  const toks = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const docs = rows.map((r) => ({ ...r, nameToks: toks(r.name), bodyToks: toks(r.body) }));

  return (query: string, policy: RetrievalPolicy): RetrievedExample[] => {
    const q = toks(query);
    const scored = docs.map((d) => {
      let s = 0;
      for (const t of q) {
        if (d.bodyToks.has(t)) s += policy.alpha * policy.bodyWeight;
        if (d.nameToks.has(t)) s += (1 - policy.alpha) * policy.subjectWeight;
      }
      return { d, s };
    });
    return scored
      .sort((a, b) => b.s - a.s || a.d.id.localeCompare(b.d.id))
      .slice(0, topK)
      .map(({ d }) => ({ id: d.id, name: d.name, body: d.body }));
  };
}

// ---------------------------------------------------------------------------
// Semantic retriever — policy-sensitive retrieval over real pattern embeddings
// ---------------------------------------------------------------------------

/** Cosine similarity of two equal-length vectors. */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na * nb);
  return d === 0 ? 0 : dot / d;
}

export interface SemanticRetrieverOptions {
  /** Read-only DB with `qe_patterns` + `qe_pattern_embeddings`. */
  db: DatabaseType;
  /** Embed a query into the pattern-embedding space. Default: all-MiniLM-L6-v2. */
  embed?: (text: string) => Promise<number[]>;
  topK?: number;
}

/**
 * Policy-sensitive SEMANTIC retriever over the pre-computed `qe_pattern_embeddings`
 * (all-MiniLM-L6-v2). Fixes the lexical retriever's honest-null: the anchor
 * queries (toy functions) have ~0 lexical overlap with the corpus, so lexical
 * scores were identical for every policy. Cosine similarity is a real, varying
 * signal, and the policy re-shapes retrieval three ways:
 *   - `alpha` blends semantic cosine vs lexical overlap,
 *   - `subjectWeight`/`bodyWeight` scale the lexical component,
 *   - `mmrLambda` trades relevance for diversity in a greedy MMR rerank
 *     (this is the lever that reorders even when lexical overlap is 0).
 * Query embeddings are cached (same query across policies embeds once).
 */
export function createSemanticRetriever(opts: SemanticRetrieverOptions): RetrieveFn {
  const embed = opts.embed ?? ((t: string) => computeRealEmbedding(t));
  const topK = opts.topK ?? 3;
  const rows = opts.db.prepare(
    `SELECT p.id AS id, p.name AS name, COALESCE(p.description,'') AS body,
            e.embedding AS embedding, e.dimension AS dimension
       FROM qe_patterns p JOIN qe_pattern_embeddings e ON e.pattern_id = p.id
      WHERE p.deprecated_at IS NULL`,
  ).all() as { id: string; name: string; body: string; embedding: Buffer; dimension: number }[];

  const toks = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const docs = rows.map((r) => ({
    id: r.id, name: r.name, body: r.body,
    vec: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.dimension),
    nameToks: toks(r.name), bodyToks: toks(r.body),
  }));

  const queryCache = new Map<string, Float32Array>();

  return async (query: string, policy: RetrievalPolicy): Promise<RetrievedExample[]> => {
    if (docs.length === 0) return [];
    let qv = queryCache.get(query);
    if (!qv) { qv = new Float32Array(await embed(query)); queryCache.set(query, qv); }
    const q = toks(query);

    // relevance = alpha * semantic-cosine + (1-alpha) * weighted-lexical-overlap
    const scored = docs.map((d) => {
      const sem = cosine(qv!, d.vec);
      let lex = 0;
      for (const t of q) {
        if (d.bodyToks.has(t)) lex += policy.bodyWeight;
        if (d.nameToks.has(t)) lex += policy.subjectWeight;
      }
      lex = lex / Math.max(1, q.size); // normalize to a comparable scale
      return { d, rel: policy.alpha * sem + (1 - policy.alpha) * lex };
    });

    // greedy MMR rerank: mmrLambda trades relevance vs diversity (cosine between
    // candidate embeddings). This reorders retrieval as the policy changes even
    // when the lexical term is zero.
    const lambda = policy.mmrLambda;
    const remaining = scored.slice().sort((a, b) => b.rel - a.rel || a.d.id.localeCompare(b.d.id));
    const chosen: typeof remaining = [];
    while (remaining.length > 0 && chosen.length < topK) {
      let bestIdx = 0, bestScore = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const sim = chosen.length === 0 ? 0 : Math.max(...chosen.map((c) => cosine(remaining[i].d.vec, c.d.vec)));
        const mmr = lambda * remaining[i].rel - (1 - lambda) * sim;
        if (mmr > bestScore || (mmr === bestScore && remaining[i].d.id.localeCompare(remaining[bestIdx].d.id) < 0)) {
          bestScore = mmr; bestIdx = i;
        }
      }
      chosen.push(remaining.splice(bestIdx, 1)[0]);
    }
    return chosen.map(({ d }) => ({ id: d.id, name: d.name, body: d.body }));
  };
}
