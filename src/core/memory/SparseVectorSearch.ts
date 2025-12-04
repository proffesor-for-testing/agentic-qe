/**
 * Sparse Vector Search - BM25/TF-IDF for hybrid search
 * Combines with dense vectors for better pattern retrieval
 */

export interface SparseVector {
  terms: Map<string, number>;  // term -> weight
  norm: number;
}

export interface BM25Config {
  k1?: number;  // Term frequency saturation (default: 1.2)
  b?: number;   // Length normalization (default: 0.75)
}

export class BM25Scorer {
  private k1: number;
  private b: number;
  private avgDocLength: number = 0;
  private docCount: number = 0;
  private termDocFreqs: Map<string, number> = new Map();

  constructor(config: BM25Config = {}) {
    this.k1 = config.k1 ?? 1.2;
    this.b = config.b ?? 0.75;
  }

  // Tokenize text into terms
  tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  // Build sparse vector from text
  buildSparseVector(text: string): SparseVector {
    const terms = this.tokenize(text);
    const termFreqs = new Map<string, number>();

    for (const term of terms) {
      termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
    }

    let norm = 0;
    for (const freq of termFreqs.values()) {
      norm += freq * freq;
    }

    return { terms: termFreqs, norm: Math.sqrt(norm) };
  }

  // Index a document
  indexDocument(docId: string, text: string): void {
    const terms = new Set(this.tokenize(text));
    for (const term of terms) {
      this.termDocFreqs.set(term, (this.termDocFreqs.get(term) || 0) + 1);
    }
    this.docCount++;
    this.avgDocLength = (this.avgDocLength * (this.docCount - 1) + text.length) / this.docCount;
  }

  // Calculate BM25 score
  score(query: SparseVector, doc: SparseVector, docLength: number): number {
    let score = 0;

    for (const [term, qf] of query.terms) {
      const tf = doc.terms.get(term) || 0;
      if (tf === 0) continue;

      const df = this.termDocFreqs.get(term) || 1;
      const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

      const tfNorm = (tf * (this.k1 + 1)) /
        (tf + this.k1 * (1 - this.b + this.b * docLength / this.avgDocLength));

      score += idf * tfNorm * qf;
    }

    return score;
  }
}

export interface HybridResult {
  id: string;
  denseScore: number;
  sparseScore: number;
  fusedScore: number;
}

/**
 * Reciprocal Rank Fusion for combining dense and sparse results
 */
export function reciprocalRankFusion(
  denseResults: Array<{ id: string; score: number }>,
  sparseResults: Array<{ id: string; score: number }>,
  k: number = 60
): HybridResult[] {
  const scores = new Map<string, HybridResult>();

  // Add dense results with RRF score
  denseResults.forEach((result, rank) => {
    const rrf = 1 / (k + rank + 1);
    scores.set(result.id, {
      id: result.id,
      denseScore: result.score,
      sparseScore: 0,
      fusedScore: rrf,
    });
  });

  // Add sparse results with RRF score
  sparseResults.forEach((result, rank) => {
    const rrf = 1 / (k + rank + 1);
    const existing = scores.get(result.id);
    if (existing) {
      existing.sparseScore = result.score;
      existing.fusedScore += rrf;
    } else {
      scores.set(result.id, {
        id: result.id,
        denseScore: 0,
        sparseScore: result.score,
        fusedScore: rrf,
      });
    }
  });

  // Sort by fused score
  return Array.from(scores.values())
    .sort((a, b) => b.fusedScore - a.fusedScore);
}

export class HybridSearcher {
  private bm25: BM25Scorer;
  private documents: Map<string, { text: string; sparse: SparseVector }> = new Map();

  constructor(config?: BM25Config) {
    this.bm25 = new BM25Scorer(config);
  }

  indexPattern(id: string, text: string): void {
    this.bm25.indexDocument(id, text);
    this.documents.set(id, {
      text,
      sparse: this.bm25.buildSparseVector(text),
    });
  }

  searchSparse(query: string, k: number = 10): Array<{ id: string; score: number }> {
    const queryVector = this.bm25.buildSparseVector(query);
    const results: Array<{ id: string; score: number }> = [];

    for (const [id, doc] of this.documents) {
      const score = this.bm25.score(queryVector, doc.sparse, doc.text.length);
      if (score > 0) {
        results.push({ id, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  hybridSearch(
    query: string,
    denseResults: Array<{ id: string; score: number }>,
    k: number = 10
  ): HybridResult[] {
    const sparseResults = this.searchSparse(query, k * 2);
    return reciprocalRankFusion(denseResults, sparseResults).slice(0, k);
  }
}
