/**
 * Structural retrieval baseline for the production pattern ranker (#653).
 *
 * Seeds an isolated temp SQLite + pattern store with the qualification corpus,
 * queries it the way QEReasoningBank.searchPatterns does (embedding + original
 * text), and prints evaluateStructuralRetrieval() metrics. Never touches the
 * project's .agentic-qe/memory.db.
 *
 *   npx tsx scripts/structural-retrieval-baseline.ts [--store=pattern|rvf|both] [--hash] [--json]
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-structural-baseline-'));
process.env.AQE_PROJECT_ROOT = tmpRoot;

const args = new Set(process.argv.slice(2));
const storeArg = [...args].find(a => a.startsWith('--store='))?.split('=')[1] ?? 'both';
const useHash = args.has('--hash');
const asJson = args.has('--json');
const K = 10;

const { createStructuralRetrievalCorpus, evaluateStructuralRetrieval } = await import('../src/learning/structural-retrieval/index.js');
const { createPatternStore } = await import('../src/learning/pattern-store.js');
const { RvfPatternStore } = await import('../src/learning/rvf-pattern-store.js');
const { createSQLitePatternStore } = await import('../src/learning/sqlite-persistence.js');
const { QEReasoningBank } = await import('../src/learning/qe-reasoning-bank.js');
const { setRuVectorFeatureFlags } = await import('../src/integrations/ruvector/feature-flags.js');
const { getActiveEmbeddingSpaceIdentity } = await import('../src/learning/real-embeddings.js');

type Vec = number[];

function memoryBackend() {
  const m = new Map<string, unknown>();
  return {
    get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: unknown) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); }, has: async (k: string) => m.has(k),
    keys: async () => [...m.keys()], search: async () => [], clear: async () => m.clear(),
    size: async () => m.size, close: async () => undefined, getState: () => ({ type: 'memory', ready: true }),
  };
}

/** In-memory exact cosine adapter standing in for native RVF HNSW (60 vectors: exact == ANN). */
function bruteForceAdapter(dimension: number) {
  const vectors = new Map<string, Float32Array>();
  return {
    ingest: (entries: Array<{ id: string; vector: Float32Array | Vec }>) => {
      for (const e of entries) vectors.set(e.id, Float32Array.from(e.vector));
      return { accepted: entries.length, rejected: 0 };
    },
    search: (query: Float32Array | Vec, k: number) => {
      const q = Float32Array.from(query);
      const hits = [...vectors].map(([id, v]) => {
        let dot = 0, a = 0, b = 0;
        for (let i = 0; i < dimension; i++) { dot += q[i] * v[i]; a += q[i] * q[i]; b += v[i] * v[i]; }
        const score = dot / (Math.sqrt(a) * Math.sqrt(b) + 1e-9);
        return { id, distance: 1 - score, score };
      });
      return hits.sort((x, y) => y.score - x.score).slice(0, k);
    },
    delete: (ids: string[]) => { for (const id of ids) vectors.delete(id); return ids.length; },
    status: () => ({ totalVectors: vectors.size }), dimension: () => dimension,
    close: () => undefined, compact: () => undefined, size: () => vectors.size,
  };
}

const corpus = createStructuralRetrievalCorpus();
const bank = new QEReasoningBank(memoryBackend() as never, undefined, { useONNXEmbeddings: !useHash });
const embed = (text: string): Promise<Vec> => bank.embed(text);
const dimension = (await embed('probe')).length;
// The ONNX embedder registers its own space identity; stores must match it.
const SPACE_ID = getActiveEmbeddingSpaceIdentity()?.spaceId ?? 'structural-baseline';

function toPattern(p: (typeof corpus.patterns)[number], embedding: Vec) {
  const now = new Date();
  return {
    id: p.id, patternType: 'test-template', qeDomain: 'test-generation', domain: 'test-generation',
    name: `${p.failureMechanism}: ${p.invariant}`, description: p.text,
    confidence: 0.7, usageCount: 0, successRate: 0, qualityScore: 0.5,
    context: { tags: [p.domain, p.framework], testType: 'unit' },
    template: { type: 'code', content: p.actions.join('\n'), variables: [] },
    embedding, tier: 'short-term', createdAt: now, lastUsedAt: now, successfulUses: 0,
  };
}

async function run(kind: 'pattern' | 'rvf') {
  const dir = fs.mkdtempSync(path.join(tmpRoot, `${kind}-`));
  const sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(dir, 'patterns.db') });
  await sqlite.initialize();
  setRuVectorFeatureFlags({ useRVFPatternStore: false });
  const store = kind === 'pattern'
    ? createPatternStore(memoryBackend() as never, { embeddingDimension: dimension, embeddingSpaceId: SPACE_ID })
    : new RvfPatternStore(() => bruteForceAdapter(dimension) as never, {
        rvfPath: path.join(dir, 'p.rvf'), base: undefined as never, embeddingSpaceId: SPACE_ID,
      });
  if (kind === 'pattern') { await store.initialize(); store.setSqliteStore!(sqlite); }
  else { store.setSqliteStore!(sqlite); await store.initialize(); }

  for (const p of corpus.patterns) {
    const stored = await store.store(toPattern(p, await embed(p.text)) as never);
    if (!stored.success) throw new Error(`store ${p.id}: ${stored.error.message}`);
  }

  let returned = 0;
  const results = [];
  for (const q of corpus.queries) {
    const res = await store.search(await embed(q.text), { limit: K, embeddingSpaceId: SPACE_ID, textQuery: q.text });
    if (!res.success) throw new Error(`search ${q.id}: ${res.error.message}`);
    returned += res.value.length;
    results.push({ queryId: q.id, candidates: res.value.map(r => ({ patternId: r.pattern.id, score: r.score })) });
  }
  await store.dispose();
  sqlite.close();

  const report = evaluateStructuralRetrieval(corpus, results, { rankerVersion: `${kind}-store`, k: K });
  return { report, meanReturned: returned / corpus.queries.length };
}

const fmt = (m: { value: number; confidenceInterval: { lower: number; upper: number } }) =>
  `${m.value.toFixed(3)} [${m.confidenceInterval.lower.toFixed(3)}, ${m.confidenceInterval.upper.toFixed(3)}]`;

const summary: Record<string, unknown> = { embedder: useHash ? 'hash' : 'onnx', dimension, k: K, corpus: corpus.corpusRevision };
try {
  for (const kind of (storeArg === 'both' ? ['pattern', 'rvf'] : [storeArg]) as Array<'pattern' | 'rvf'>) {
    const { report, meanReturned } = await run(kind);
    const o = report.overall;
    summary[kind] = {
      recallAtK: o.recallAtK.value, hitAt1: o.hitAt1.value, mrr: o.mrr.value, ndcg: o.ndcg.value,
      top1Margin: o.top1Margin.value, meanReturned,
      relationViolations: report.relationViolations,
    };
    if (!asJson) {
      console.log(`\n[${kind} store] embedder=${summary.embedder} dim=${dimension} k=${K} mean results/query=${meanReturned.toFixed(1)}`);
      console.log(`  recall@${K} ${fmt(o.recallAtK)}  Hit@1 ${fmt(o.hitAt1)}  MRR ${fmt(o.mrr)}  nDCG ${fmt(o.ndcg)}`);
      console.log(`  top1 margin ${fmt(o.top1Margin)}  distractor/counterexample ranked above gold: ${report.relationViolations}`);
      for (const [t, m] of Object.entries(report.slices)) {
        console.log(`    ${t.padEnd(24)} Hit@1 ${(m as typeof o).hitAt1.value.toFixed(2)}  MRR ${(m as typeof o).mrr.value.toFixed(2)}`);
      }
    }
  }
  if (asJson) console.log(JSON.stringify(summary, null, 2));
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
