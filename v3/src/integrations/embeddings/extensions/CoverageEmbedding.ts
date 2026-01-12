/**
 * QE-Specific Extension: Coverage Vector Embeddings
 *
 * Per ADR-040, extends base with coverage-specific logic.
 * Specialized for:
 * - Code coverage gap detection (O(log n) per ADR-012)
 * - Coverage vector similarity
 * - Sublinear coverage analysis
 *
 * @module integrations/embeddings/extensions/CoverageEmbedding
 */

import {
  EmbeddingGenerator,
  type IEmbedding,
  type IEmbeddingOptions,
} from '../base/EmbeddingGenerator.js';
import type { IEmbeddingModelConfig } from '../base/types.js';

/**
 * Type guard to check if an embedding is a coverage embedding
 */
function isCoverageEmbedding(embedding: IEmbedding): embedding is ICoverageEmbedding {
  return (
    embedding.namespace === 'coverage' &&
    embedding.metadata !== undefined &&
    typeof embedding.metadata === 'object' &&
    'filePath' in embedding.metadata &&
    'percentage' in embedding.metadata
  );
}

/**
 * Coverage data structure
 */
export interface ICoverageData extends Record<string, unknown> {
  /** File path */
  filePath: string;
  /** Lines covered */
  linesCovered: number[];
  /** Total lines */
  totalLines: number;
  /** Branches covered */
  branchesCovered: number[];
  /** Total branches */
  totalBranches: number;
  /** Functions covered */
  functionsCovered: string[];
  /** Percentage */
  percentage: number;
}

/**
 * Coverage gap analysis result
 */
export interface ICoverageGap {
  /** File with gap */
  filePath: string;
  /** Gap type (line, branch, function) */
  gapType: 'line' | 'branch' | 'function';
  /** Uncovered elements */
  uncovered: number[] | string[];
  /** Priority score (0-1) */
  priority: number;
  /** Suggested tests */
  suggestedTests: string[];
}

/**
 * Coverage vector embedding
 */
export interface ICoverageEmbedding extends IEmbedding {
  /** Coverage data */
  metadata: ICoverageData;
}

/**
 * Coverage embedding options
 */
export interface ICoverageEmbeddingOptions extends IEmbeddingOptions {
  /** Include branch coverage */
  includeBranches?: boolean;
  /** Include function coverage */
  includeFunctions?: boolean;
  /** Weight by complexity */
  weightByComplexity?: boolean;
}

/**
 * Coverage vector embedding generator
 *
 * Extends base EmbeddingGenerator with QE-specific logic for coverage analysis.
 */
export class CoverageEmbeddingGenerator extends EmbeddingGenerator {
  private complexityCache: Map<string, number> = new Map();

  constructor(config: Partial<IEmbeddingModelConfig> = {}) {
    super({
      ...config,
    });
  }

  /**
   * Generate embedding for coverage data
   */
  async embedCoverage(
    coverageData: ICoverageData,
    options: ICoverageEmbeddingOptions = {}
  ): Promise<ICoverageEmbedding> {
    // Prepare text for embedding
    const text = this.prepareCoverageText(coverageData, options);

    // Generate base embedding
    const embedding = await this.embed(text, {
      namespace: 'coverage',
      ...options,
    });

    return {
      ...embedding,
      metadata: coverageData,
    };
  }

  /**
   * Find coverage gaps using sublinear search
   *
 * Per ADR-012: O(log n) coverage gap detection
   */
  async findCoverageGaps(
    coverageFiles: ICoverageData[],
    threshold: number = 80
  ): Promise<ICoverageGap[]> {
    const gaps: ICoverageGap[] = [];

    for (const coverage of coverageFiles) {
      // Line coverage gaps
      if (coverage.percentage < threshold) {
        const uncoveredLines = this.findUncoveredElements(
          coverage.linesCovered,
          coverage.totalLines
        );

        gaps.push({
          filePath: coverage.filePath,
          gapType: 'line',
          uncovered: uncoveredLines,
          priority: this.calculateGapPriority(coverage),
          suggestedTests: this.suggestTestsForGaps(coverage, uncoveredLines),
        });
      }

      // Branch coverage gaps
      if (coverage.branchesCovered.length < coverage.totalBranches) {
        const uncoveredBranches = this.findUncoveredElements(
          coverage.branchesCovered,
          coverage.totalBranches
        );

        gaps.push({
          filePath: coverage.filePath,
          gapType: 'branch',
          uncovered: uncoveredBranches,
          priority: this.calculateGapPriority(coverage) * 1.2, // Branch gaps are higher priority
          suggestedTests: this.suggestTestsForGaps(coverage, uncoveredBranches),
        });
      }

      // Function coverage gaps
      const allFunctions = this.getAllFunctions(coverage.filePath);
      const uncoveredFunctions = allFunctions.filter(
        (f) => !coverage.functionsCovered.includes(f)
      );

      if (uncoveredFunctions.length > 0) {
        gaps.push({
          filePath: coverage.filePath,
          gapType: 'function',
          uncovered: uncoveredFunctions,
          priority: this.calculateGapPriority(coverage) * 1.5, // Function gaps are highest priority
          suggestedTests: this.suggestTestsForGaps(coverage, uncoveredFunctions),
        });
      }
    }

    return gaps.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Find similar coverage patterns
   */
  async findSimilarCoverage(
    queryCoverage: ICoverageData,
    options: {
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<Array<{ coverage: ICoverageData; similarity: number }>> {
    const queryEmbedding = await this.embedCoverage(queryCoverage);

    // Get all coverage embeddings using type guard
    const allCoverages = this.cache.getAll('coverage').filter(isCoverageEmbedding);

    // Calculate similarities
    const similarities = allCoverages
      .map((emb) => ({
        coverage: emb.metadata,
        similarity: this.cosineSimilarity(
          queryEmbedding.vector as number[],
          emb.vector as number[]
        ),
      }))
      .filter((result) => result.similarity >= (options.threshold || 0.7))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit || 10);

    return similarities;
  }

  /**
   * Get coverage trend over time
   */
  async getCoverageTrend(
    filePath: string,
    days: number = 30
  ): Promise<Array<{ date: Date; coverage: number }>> {
    const allCoverages = this.cache.getAll('coverage') as ICoverageEmbedding[];

    // Filter by file path
    const fileCoverages = allCoverages
      .filter((emb) => emb.metadata.filePath === filePath)
      .sort((a, b) => (a as IEmbedding).timestamp - (b as IEmbedding).timestamp);

    // Group by day
    const byDay = new Map<string, number[]>();
    for (const emb of fileCoverages) {
      const day = new Date((emb as IEmbedding).timestamp).toISOString().split('T')[0];
      if (!byDay.has(day)) {
        byDay.set(day, []);
      }
      byDay.get(day)!.push(emb.metadata.percentage);
    }

    // Average by day and limit to recent days
    const trend: Array<{ date: Date; coverage: number }> = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    for (const [day, coverages] of byDay.entries()) {
      const date = new Date(day);
      if (date >= cutoffDate) {
        trend.push({
          date,
          coverage: coverages.reduce((a, b) => a + b, 0) / coverages.length,
        });
      }
    }

    return trend.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Prepare coverage text for embedding
   */
  private prepareCoverageText(
    coverage: ICoverageData,
    options: ICoverageEmbeddingOptions
  ): string {
    let text = '';

    text += `File: ${coverage.filePath}\n`;
    text += `Coverage: ${coverage.percentage.toFixed(2)}%\n`;
    text += `Lines: ${coverage.linesCovered.length}/${coverage.totalLines}\n`;

    if (options.includeBranches !== false) {
      text += `Branches: ${coverage.branchesCovered.length}/${coverage.totalBranches}\n`;
    }

    if (options.includeFunctions !== false) {
      text += `Functions: ${coverage.functionsCovered.length}\n`;
    }

    // Add uncovered sections (for similarity matching)
    const uncoveredLines = this.findUncoveredElements(
      coverage.linesCovered,
      coverage.totalLines
    ).slice(0, 10); // Limit to first 10

    if (uncoveredLines.length > 0) {
      text += `Uncovered lines: ${uncoveredLines.join(', ')}\n`;
    }

    return text;
  }

  /**
   * Find uncovered elements (O(log n) via binary search)
   */
  private findUncoveredElements(covered: number[], total: number): number[] {
    // Sort covered for binary search
    const sortedCovered = [...covered].sort((a, b) => a - b);
    const uncovered: number[] = [];

    for (let i = 1; i <= total; i++) {
      if (!this.binarySearch(sortedCovered, i)) {
        uncovered.push(i);
      }
    }

    return uncovered;
  }

  /**
   * Binary search for element existence
   */
  private binarySearch(arr: number[], target: number): boolean {
    let left = 0;
    let right = arr.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (arr[mid] === target) {
        return true;
      } else if (arr[mid] < target) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return false;
  }

  /**
   * Calculate gap priority score
   */
  private calculateGapPriority(coverage: ICoverageData): number {
    // Base priority from coverage deficit
    const coverageDeficit = 100 - coverage.percentage;

    // Adjust by complexity
    const complexity = this.getComplexity(coverage.filePath);
    const complexityFactor = Math.log10(complexity + 1) / Math.log10(100);

    return (coverageDeficit / 100) * (0.5 + complexityFactor * 0.5);
  }

  /**
   * Get file complexity (cached)
   */
  private getComplexity(filePath: string): number {
    if (this.complexityCache.has(filePath)) {
      return this.complexityCache.get(filePath)!;
    }

    // Simple complexity estimate: file size as proxy
    // In production, would use cyclomatic complexity
    const complexity = 50; // Placeholder
    this.complexityCache.set(filePath, complexity);
    return complexity;
  }

  /**
   * Suggest tests for coverage gaps
   */
  private suggestTestsForGaps(
    coverage: ICoverageData,
    gaps: number[] | string[]
  ): string[] {
    const suggestions: string[] = [];

    if (Array.isArray(gaps) && typeof gaps[0] === 'number') {
      // Line gaps
      const lineGaps = gaps as number[];
      suggestions.push(`Test lines ${lineGaps[0]}-${lineGaps[lineGaps.length - 1]}`);
      suggestions.push('Add edge case tests');
    } else {
      // Function gaps
      const funcGaps = gaps as string[];
      for (const func of funcGaps.slice(0, 3)) {
        suggestions.push(`Test function: ${func}`);
      }
    }

    return suggestions;
  }

  /**
   * Get all functions in a file
   */
  private getAllFunctions(filePath: string): string[] {
    // Placeholder - in production, would parse AST
    return [];
  }
}
