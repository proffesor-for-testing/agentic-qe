/**
 * BM25 Search Engine
 *
 * Implements Best Matching 25 algorithm for keyword-based
 * code search with:
 * - Term frequency saturation
 * - Document length normalization
 * - Inverse document frequency weighting
 */

import {
  BM25Config,
  BM25Index,
  BM25Document,
  SearchResult,
  DEFAULT_BM25_CONFIG,
} from './types.js';

export class BM25Search {
  private config: BM25Config;
  private index: BM25Index;

  constructor(config: Partial<BM25Config> = {}) {
    this.config = { ...DEFAULT_BM25_CONFIG, ...config };
    this.index = this.createEmptyIndex();
  }

  /**
   * Add a document to the index.
   */
  addDocument(doc: Omit<BM25Document, 'terms'>): void {
    const terms = this.tokenize(doc.content);
    const document: BM25Document = { ...doc, terms };

    // Store document
    this.index.documents.set(doc.id, document);
    this.index.documentLengths.set(doc.id, terms.length);

    // Update term frequencies for this document
    const termFreqs = new Map<string, number>();
    for (const term of terms) {
      termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
    }
    this.index.termFrequencies.set(doc.id, termFreqs);

    // Update document frequencies
    const uniqueTerms = new Set(terms);
    for (const term of uniqueTerms) {
      this.index.documentFrequency.set(
        term,
        (this.index.documentFrequency.get(term) || 0) + 1
      );
    }

    // Update stats
    this.index.docCount++;
    this.updateAvgDocLength();
  }

  /**
   * Add multiple documents.
   */
  addDocuments(docs: Array<Omit<BM25Document, 'terms'>>): void {
    for (const doc of docs) {
      this.addDocument(doc);
    }
  }

  /**
   * Remove a document from the index.
   */
  removeDocument(docId: string): boolean {
    const doc = this.index.documents.get(docId);
    if (!doc) return false;

    // Update document frequencies
    const termFreqs = this.index.termFrequencies.get(docId);
    if (termFreqs) {
      for (const term of termFreqs.keys()) {
        const df = this.index.documentFrequency.get(term) || 0;
        if (df <= 1) {
          this.index.documentFrequency.delete(term);
        } else {
          this.index.documentFrequency.set(term, df - 1);
        }
      }
    }

    // Remove from index
    this.index.documents.delete(docId);
    this.index.documentLengths.delete(docId);
    this.index.termFrequencies.delete(docId);

    // Update stats
    this.index.docCount--;
    this.updateAvgDocLength();

    return true;
  }

  /**
   * Search for documents matching a query.
   */
  search(query: string, topK: number = 10): SearchResult[] {
    const queryTerms = this.tokenize(query);

    // Filter query terms by document frequency
    const filteredTerms = queryTerms.filter(term => {
      const df = this.index.documentFrequency.get(term) || 0;
      if (df < this.config.minDocFreq) return false;
      if (this.index.docCount > 0 && df / this.index.docCount > this.config.maxDocFreqRatio) {
        return false;
      }
      return true;
    });

    if (filteredTerms.length === 0) {
      return [];
    }

    // Calculate BM25 scores for all documents
    const scores: Array<{ docId: string; score: number }> = [];

    for (const [docId, termFreqs] of this.index.termFrequencies) {
      const docLength = this.index.documentLengths.get(docId) || 0;
      let score = 0;

      for (const term of filteredTerms) {
        const tf = termFreqs.get(term) || 0;
        if (tf === 0) continue;

        const df = this.index.documentFrequency.get(term) || 0;
        const idf = this.calculateIDF(df);
        const tfNorm = this.calculateTF(tf, docLength);

        score += idf * tfNorm;
      }

      if (score > 0) {
        scores.push({ docId, score });
      }
    }

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    // Convert to results
    return scores.slice(0, topK).map(({ docId, score }) => {
      const doc = this.index.documents.get(docId)!;
      return {
        id: doc.id,
        filePath: doc.filePath,
        content: doc.content,
        startLine: doc.startLine,
        endLine: doc.endLine,
        score,
        bm25Score: score,
        entityType: doc.entityType,
        entityName: doc.entityName,
        highlights: this.getHighlights(doc.content, filteredTerms),
      };
    });
  }

  /**
   * Get term matches in content for highlighting.
   */
  getHighlights(content: string, queryTerms: string[]): string[] {
    const highlights: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const lineTokens = this.tokenize(line);
      const hasMatch = queryTerms.some(term => lineTokens.includes(term));
      if (hasMatch) {
        highlights.push(line.trim());
      }
    }

    return highlights.slice(0, 3); // Max 3 highlights
  }

  /**
   * Get index statistics.
   */
  getStats(): {
    docCount: number;
    avgDocLength: number;
    uniqueTerms: number;
  } {
    return {
      docCount: this.index.docCount,
      avgDocLength: this.index.avgDocLength,
      uniqueTerms: this.index.documentFrequency.size,
    };
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.index = this.createEmptyIndex();
  }

  /**
   * Get configuration.
   */
  getConfig(): BM25Config {
    return { ...this.config };
  }

  /**
   * Calculate Inverse Document Frequency.
   * IDF = ln((N - df + 0.5) / (df + 0.5))
   */
  private calculateIDF(df: number): number {
    const N = this.index.docCount;
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Calculate normalized term frequency.
   * TF = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl/avgdl))
   */
  private calculateTF(tf: number, docLength: number): number {
    const { k1, b } = this.config;
    const avgDl = this.index.avgDocLength || 1;

    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avgDl));

    return numerator / denominator;
  }

  /**
   * Tokenize text into terms.
   */
  private tokenize(text: string): string[] {
    // Split on non-alphanumeric, handle camelCase and snake_case
    const expanded = text
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
      .replace(/_/g, ' ') // snake_case
      .toLowerCase();

    return expanded
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 2); // Min 2 chars
  }

  /**
   * Update average document length.
   */
  private updateAvgDocLength(): void {
    if (this.index.docCount === 0) {
      this.index.avgDocLength = 0;
      return;
    }

    let totalLength = 0;
    for (const length of this.index.documentLengths.values()) {
      totalLength += length;
    }
    this.index.avgDocLength = totalLength / this.index.docCount;
  }

  /**
   * Create empty index structure.
   */
  private createEmptyIndex(): BM25Index {
    return {
      docCount: 0,
      avgDocLength: 0,
      documentFrequency: new Map(),
      termFrequencies: new Map(),
      documentLengths: new Map(),
      documents: new Map(),
    };
  }
}
