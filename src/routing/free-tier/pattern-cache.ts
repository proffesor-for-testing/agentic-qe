/**
 * ruvLLM-style test-gen pattern cache (#6).
 *
 * The local test-gen model is the slow part of the free tier (a thinking MoE
 * spends ~100s/gen). This cache lets the executor SKIP generation when it has
 * already produced a durable test for the same — or near-identical — code under
 * test. Two tiers:
 *   1. exact: normalized-source key match (whitespace/comments stripped).
 *   2. similarity: cosine over an injected code embedding, ≥ threshold.
 *
 * SAFETY: a cache hit is only a CANDIDATE. The executor re-runs the same
 * objective oracle on it before use, so a stale or wrong-but-similar hit simply
 * fails verification and falls through to real generation — the cache can never
 * bypass the oracle. Only outputs that PASSED verification are stored.
 *
 * Persistence: in-memory + per-process by design — it opens no database, so it
 * does not touch the unified memory.db (ADR). A durable variant would go through
 * the unified memory layer; out of scope here.
 */

/** Minimal embedder contract (subset of IEmbeddingProvider), injected & optional. */
export interface CodeEmbedder {
  embed(text: string): Promise<number[]>;
}

export interface PatternCacheOptions {
  /** Optional embedder; without it only the exact-match tier is active. */
  embedder?: CodeEmbedder;
  /** Cosine threshold for a similarity hit (default 0.97 — deliberately strict). */
  similarityThreshold?: number;
  /** Max entries retained (LRU by insertion/last-hit); default 200. */
  maxEntries?: number;
}

interface Entry {
  test: string;
  embedding?: number[];
}

/** Strip line/block comments and collapse whitespace → stable exact-match key. */
export function normalizeCode(code: string): string {
  return stripBlockComments(code)
    .replace(/\/\/[^\n]*/g, ' ') // line comments (linear, single quantifier)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove `/* ... *\/` block comments in a single linear pass. A regex here
 * (`/\/\*[\s\S]*?\*\//g`) backtracks polynomially on unterminated `/*` input —
 * a ReDoS CodeQL flags — so we scan with native `indexOf` instead. An
 * unterminated block comment is left in place, matching the old regex behavior.
 */
function stripBlockComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    if (code.charCodeAt(i) === 47 /* / */ && code.charCodeAt(i + 1) === 42 /* * */) {
      const end = code.indexOf('*/', i + 2);
      if (end === -1) { out += code.slice(i); break; } // unterminated → leave as-is
      out += ' ';
      i = end + 2;
    } else {
      out += code[i];
      i += 1;
    }
  }
  return out;
}

/** Cosine similarity of two equal-length vectors; 0 for empty/mismatched/zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class TestGenPatternCache {
  private readonly embedder?: CodeEmbedder;
  private readonly threshold: number;
  private readonly maxEntries: number;
  /** key = normalized code; Map preserves insertion order for cheap LRU eviction. */
  private readonly store = new Map<string, Entry>();
  private hits = 0;
  private misses = 0;

  constructor(opts: PatternCacheOptions = {}) {
    this.embedder = opts.embedder;
    this.threshold = opts.similarityThreshold ?? 0.97;
    this.maxEntries = Math.max(1, opts.maxEntries ?? 200);
  }

  get stats(): { size: number; hits: number; misses: number } {
    return { size: this.store.size, hits: this.hits, misses: this.misses };
  }

  /** Return a cached test for `code` (exact, then similarity), or undefined. */
  async lookup(code: string): Promise<string | undefined> {
    const key = normalizeCode(code);
    const exact = this.store.get(key);
    if (exact) {
      this.touch(key, exact);
      this.hits++;
      return exact.test;
    }

    if (this.embedder) {
      let query: number[];
      try {
        query = await this.embedder.embed(key);
      } catch {
        this.misses++;
        return undefined; // embedder unavailable → no similarity tier this call
      }
      let best: { key: string; entry: Entry; sim: number } | undefined;
      for (const [k, entry] of this.store) {
        if (!entry.embedding) continue;
        const sim = cosineSimilarity(query, entry.embedding);
        if (sim >= this.threshold && (!best || sim > best.sim)) best = { key: k, entry, sim };
      }
      if (best) {
        this.touch(best.key, best.entry);
        this.hits++;
        return best.entry.test;
      }
    }

    this.misses++;
    return undefined;
  }

  /** Cache a VERIFIED test for `code`. Computes an embedding when an embedder is set. */
  async put(code: string, test: string): Promise<void> {
    const key = normalizeCode(code);
    let embedding: number[] | undefined;
    if (this.embedder) {
      try {
        embedding = await this.embedder.embed(key);
      } catch {
        embedding = undefined; // still cache for the exact-match tier
      }
    }
    this.store.delete(key); // re-insert so it becomes most-recent
    this.store.set(key, { test, embedding });
    this.evictIfNeeded();
  }

  private touch(key: string, entry: Entry): void {
    this.store.delete(key);
    this.store.set(key, entry);
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}
