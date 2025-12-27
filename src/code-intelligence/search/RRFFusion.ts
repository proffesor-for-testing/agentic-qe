/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Combines rankings from multiple search methods
 * using the RRF formula:
 *   score(d) = Σ 1 / (k + rank_i(d))
 *
 * Where k is a constant (typically 60) that determines
 * how much weight is given to lower-ranked results.
 */

import {
  RRFConfig,
  RRFRanking,
  SearchResult,
  DEFAULT_RRF_CONFIG,
} from './types.js';

export class RRFFusion {
  private config: RRFConfig;

  constructor(config: Partial<RRFConfig> = {}) {
    this.config = { ...DEFAULT_RRF_CONFIG, ...config };
  }

  /**
   * Fuse multiple ranked lists using RRF.
   *
   * @param rankedLists - Array of search result lists, each ordered by relevance
   * @param topK - Number of results to return
   * @returns Fused results ordered by RRF score
   */
  fuse(rankedLists: SearchResult[][], topK: number = 10): SearchResult[] {
    // Build RRF rankings
    const rankings = new Map<string, RRFRanking>();

    for (let listIndex = 0; listIndex < rankedLists.length; listIndex++) {
      const list = rankedLists[listIndex];

      for (let rank = 0; rank < list.length; rank++) {
        const result = list[rank];
        const existing = rankings.get(result.id);

        if (existing) {
          // Update existing ranking
          existing.ranks[listIndex] = rank + 1; // 1-indexed rank
          existing.originalScores[listIndex] = result.score;
        } else {
          // Create new ranking
          const ranks = new Array(rankedLists.length).fill(Infinity);
          const originalScores = new Array(rankedLists.length).fill(0);
          ranks[listIndex] = rank + 1;
          originalScores[listIndex] = result.score;

          rankings.set(result.id, {
            id: result.id,
            ranks,
            rrfScore: 0,
            originalScores,
          });
        }
      }
    }

    // Calculate RRF scores
    for (const ranking of rankings.values()) {
      ranking.rrfScore = this.calculateRRFScore(ranking.ranks);
    }

    // Filter by minimum source agreement if configured
    const filteredRankings = Array.from(rankings.values()).filter(ranking => {
      const sourcesWithRank = ranking.ranks.filter(r => r !== Infinity).length;
      return sourcesWithRank >= this.config.minSourceAgreement;
    });

    // Sort by RRF score
    filteredRankings.sort((a, b) => b.rrfScore - a.rrfScore);

    // Build result objects
    // We need the original results to get full data
    const resultMap = new Map<string, SearchResult>();
    for (const list of rankedLists) {
      for (const result of list) {
        if (!resultMap.has(result.id)) {
          resultMap.set(result.id, result);
        }
      }
    }

    return filteredRankings.slice(0, topK).map(ranking => {
      const original = resultMap.get(ranking.id)!;
      return {
        ...original,
        score: ranking.rrfScore,
        bm25Score: ranking.originalScores[0] || undefined,
        vectorScore: ranking.originalScores[1] || undefined,
      };
    });
  }

  /**
   * Fuse with weighted RRF.
   * Allows different weights for each source.
   */
  fuseWeighted(
    rankedLists: SearchResult[][],
    weights: number[],
    topK: number = 10
  ): SearchResult[] {
    if (weights.length !== rankedLists.length) {
      throw new Error('Weights array must match number of ranked lists');
    }

    // Normalize weights
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);

    // Build weighted RRF rankings
    const rankings = new Map<string, RRFRanking>();

    for (let listIndex = 0; listIndex < rankedLists.length; listIndex++) {
      const list = rankedLists[listIndex];
      const weight = normalizedWeights[listIndex];

      for (let rank = 0; rank < list.length; rank++) {
        const result = list[rank];
        const rrfContribution = weight / (this.config.k + rank + 1);

        const existing = rankings.get(result.id);
        if (existing) {
          existing.rrfScore += rrfContribution;
          existing.ranks[listIndex] = rank + 1;
          existing.originalScores[listIndex] = result.score;
        } else {
          const ranks = new Array(rankedLists.length).fill(Infinity);
          const originalScores = new Array(rankedLists.length).fill(0);
          ranks[listIndex] = rank + 1;
          originalScores[listIndex] = result.score;

          rankings.set(result.id, {
            id: result.id,
            ranks,
            rrfScore: rrfContribution,
            originalScores,
          });
        }
      }
    }

    // Filter and sort
    const filteredRankings = Array.from(rankings.values()).filter(ranking => {
      const sourcesWithRank = ranking.ranks.filter(r => r !== Infinity).length;
      return sourcesWithRank >= this.config.minSourceAgreement;
    });

    filteredRankings.sort((a, b) => b.rrfScore - a.rrfScore);

    // Build results
    const resultMap = new Map<string, SearchResult>();
    for (const list of rankedLists) {
      for (const result of list) {
        if (!resultMap.has(result.id)) {
          resultMap.set(result.id, result);
        }
      }
    }

    return filteredRankings.slice(0, topK).map(ranking => {
      const original = resultMap.get(ranking.id)!;
      return {
        ...original,
        score: ranking.rrfScore,
        bm25Score: ranking.originalScores[0] || undefined,
        vectorScore: ranking.originalScores[1] || undefined,
      };
    });
  }

  /**
   * Simple weighted score fusion (alternative to RRF).
   * Combines normalized scores directly.
   */
  fuseScores(
    rankedLists: SearchResult[][],
    weights: number[],
    topK: number = 10
  ): SearchResult[] {
    if (weights.length !== rankedLists.length) {
      throw new Error('Weights array must match number of ranked lists');
    }

    // Normalize weights
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);

    // Find max scores for normalization
    const maxScores = rankedLists.map(list =>
      list.length > 0 ? Math.max(...list.map(r => r.score)) : 1
    );

    // Build combined scores
    const scores = new Map<string, {
      combinedScore: number;
      originalScores: number[];
      result: SearchResult;
    }>();

    for (let listIndex = 0; listIndex < rankedLists.length; listIndex++) {
      const list = rankedLists[listIndex];
      const weight = normalizedWeights[listIndex];
      const maxScore = maxScores[listIndex];

      for (const result of list) {
        const normalizedScore = result.score / maxScore;
        const weightedScore = normalizedScore * weight;

        const existing = scores.get(result.id);
        if (existing) {
          existing.combinedScore += weightedScore;
          existing.originalScores[listIndex] = result.score;
        } else {
          const originalScores = new Array(rankedLists.length).fill(0);
          originalScores[listIndex] = result.score;

          scores.set(result.id, {
            combinedScore: weightedScore,
            originalScores,
            result,
          });
        }
      }
    }

    // Sort and return
    const sortedScores = Array.from(scores.values())
      .sort((a, b) => b.combinedScore - a.combinedScore);

    return sortedScores.slice(0, topK).map(({ combinedScore, originalScores, result }) => ({
      ...result,
      score: combinedScore,
      bm25Score: originalScores[0] || undefined,
      vectorScore: originalScores[1] || undefined,
    }));
  }

  /**
   * Calculate RRF score from ranks.
   */
  private calculateRRFScore(ranks: number[]): number {
    let score = 0;
    for (const rank of ranks) {
      if (rank !== Infinity) {
        score += 1 / (this.config.k + rank);
      }
    }
    return score;
  }

  /**
   * Get configuration.
   */
  getConfig(): RRFConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<RRFConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
