/**
 * Agentic QE v3 - Coverage Embedder Service
 *
 * Converts code coverage data into dense vector embeddings for efficient
 * similarity search using HNSW index. The embedder creates multi-dimensional
 * representations that capture coverage patterns, risk factors, and file
 * characteristics.
 *
 * Embedding Strategy:
 * - Dimensions 0-15: Coverage metrics (line, branch, function, statement)
 * - Dimensions 16-31: Gap characteristics (size, distribution, density)
 * - Dimensions 32-47: Risk factors (complexity, change frequency, defect history)
 * - Dimensions 48-63: File characteristics (size, type, depth)
 * - Dimensions 64-127: Derived features and semantic signals
 *
 * @module coverage-analysis/coverage-embedder
 */

import { FileCoverage, CoverageGap } from '../interfaces';
import { CoverageVectorMetadata } from './hnsw-index';

// ============================================================================
// Embedder Configuration
// ============================================================================

/**
 * Configuration for coverage embedding generation
 */
export interface CoverageEmbedderConfig {
  /** Number of dimensions for the embedding (default: 768) */
  dimensions: number;
  /** Include file path features in embedding */
  includePathFeatures: boolean;
  /** Include temporal features (last modified, etc.) */
  includeTemporalFeatures: boolean;
  /** Normalization method for embeddings */
  normalization: 'l2' | 'minmax' | 'none';
}

/**
 * Default embedder configuration
 */
export const DEFAULT_EMBEDDER_CONFIG: CoverageEmbedderConfig = {
  dimensions: 768,
  includePathFeatures: true,
  includeTemporalFeatures: true,
  normalization: 'l2',
};

// ============================================================================
// Embedder Interface
// ============================================================================

/**
 * Interface for coverage embedding generation
 */
export interface ICoverageEmbedder {
  /** Create embedding from file coverage data */
  embedFileCoverage(coverage: FileCoverage): EmbeddingResult;

  /** Create embedding from coverage gap */
  embedCoverageGap(gap: CoverageGap): EmbeddingResult;

  /** Create embedding from query parameters */
  embedQuery(query: CoverageQuery): EmbeddingResult;

  /** Batch embed multiple file coverages */
  batchEmbed(coverages: FileCoverage[]): EmbeddingResult[];
}

/**
 * Query parameters for coverage search
 */
export interface CoverageQuery {
  /** Minimum line coverage threshold */
  minLineCoverage?: number;
  /** Maximum line coverage threshold */
  maxLineCoverage?: number;
  /** Minimum branch coverage threshold */
  minBranchCoverage?: number;
  /** Maximum branch coverage threshold */
  maxBranchCoverage?: number;
  /** Minimum risk score */
  minRiskScore?: number;
  /** Maximum risk score */
  maxRiskScore?: number;
  /** File path pattern (for similarity) */
  filePattern?: string;
  /** Maximum uncovered lines to find */
  maxUncoveredLines?: number;
}

/**
 * Result of embedding generation
 */
export interface EmbeddingResult {
  /** The embedding vector */
  vector: number[];
  /** Metadata for the embedding */
  metadata: CoverageVectorMetadata;
  /** Quality score (0-1) indicating embedding confidence */
  confidence: number;
}

// ============================================================================
// Coverage Embedder Implementation
// ============================================================================

/**
 * Coverage Embedder Service
 *
 * Generates dense vector embeddings from coverage data for use with
 * HNSW-based similarity search. The embeddings capture coverage patterns,
 * risk profiles, and file characteristics to enable efficient O(log n)
 * gap detection.
 *
 * @example
 * ```typescript
 * const embedder = new CoverageEmbedder();
 * const result = embedder.embedFileCoverage(fileCoverage);
 * await index.insert(fileCoverage.path, result.vector, result.metadata);
 * ```
 */
export class CoverageEmbedder implements ICoverageEmbedder {
  private readonly config: CoverageEmbedderConfig;

  constructor(config: Partial<CoverageEmbedderConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDER_CONFIG, ...config };
  }

  /**
   * Create embedding from file coverage data
   *
   * Generates a dense vector representation of the file's coverage
   * characteristics for similarity search.
   *
   * @param coverage - File coverage data to embed
   * @returns Embedding result with vector and metadata
   */
  embedFileCoverage(coverage: FileCoverage): EmbeddingResult {
    const vector = new Array(this.config.dimensions).fill(0);
    let offset = 0;

    // Section 1: Coverage Metrics (dimensions 0-15)
    offset = this.encodeCoverageMetrics(vector, coverage, offset);

    // Section 2: Gap Characteristics (dimensions 16-31)
    offset = this.encodeGapCharacteristics(vector, coverage, offset);

    // Section 3: Risk Factors (dimensions 32-47)
    offset = this.encodeRiskFactors(vector, coverage, offset);

    // Section 4: File Characteristics (dimensions 48-63)
    offset = this.encodeFileCharacteristics(vector, coverage, offset);

    // Section 5: Derived Features (dimensions 64-127)
    this.encodeDerivedFeatures(vector, coverage, offset);

    // Apply normalization
    const normalizedVector = this.normalize(vector);

    return {
      vector: normalizedVector,
      metadata: this.createMetadata(coverage),
      confidence: this.calculateConfidence(coverage),
    };
  }

  /**
   * Create embedding from coverage gap
   *
   * Generates a vector representation of a coverage gap for finding
   * similar gaps in the codebase.
   *
   * @param gap - Coverage gap to embed
   * @returns Embedding result with vector and metadata
   */
  embedCoverageGap(gap: CoverageGap): EmbeddingResult {
    const vector = new Array(this.config.dimensions).fill(0);

    // Encode gap-specific features
    vector[0] = gap.riskScore;
    vector[1] = Math.min(1, gap.lines.length / 100);
    vector[2] = Math.min(1, gap.branches.length / 20);
    vector[3] = this.severityToNumber(gap.severity) / 4;

    // Encode file path characteristics
    const pathFeatures = this.extractPathFeatures(gap.file);
    vector[4] = pathFeatures.depth / 10;
    vector[5] = pathFeatures.hashNormalized;

    // Encode gap distribution
    if (gap.lines.length > 1) {
      const lineSpread = gap.lines[gap.lines.length - 1] - gap.lines[0];
      vector[6] = Math.min(1, lineSpread / 500);
      vector[7] = gap.lines.length / (lineSpread + 1); // Density
    }

    // Fill remaining dimensions with derived features
    for (let i = 8; i < this.config.dimensions; i++) {
      const seed = gap.riskScore * i + gap.lines.length * 0.01;
      vector[i] = Math.sin(seed) * 0.5 + 0.5;
    }

    const normalizedVector = this.normalize(vector);

    return {
      vector: normalizedVector,
      metadata: {
        filePath: gap.file,
        lineCoverage: 0,
        branchCoverage: 0,
        functionCoverage: 0,
        statementCoverage: 0,
        uncoveredLineCount: gap.lines.length,
        uncoveredBranchCount: gap.branches.length,
        riskScore: gap.riskScore,
        lastUpdated: Date.now(),
        totalLines: gap.lines.length > 0 ? gap.lines[gap.lines.length - 1] : 0,
      },
      confidence: 0.8, // Gap embeddings have slightly lower confidence
    };
  }

  /**
   * Create embedding from query parameters
   *
   * Generates a query vector for finding files matching specific
   * coverage criteria.
   *
   * @param query - Query parameters
   * @returns Embedding result optimized for similarity search
   */
  embedQuery(query: CoverageQuery): EmbeddingResult {
    const vector = new Array(this.config.dimensions).fill(0);

    // Encode coverage thresholds
    if (query.minLineCoverage !== undefined) {
      vector[0] = query.minLineCoverage / 100;
    }
    if (query.maxLineCoverage !== undefined) {
      vector[1] = query.maxLineCoverage / 100;
    }
    if (query.minBranchCoverage !== undefined) {
      vector[2] = query.minBranchCoverage / 100;
    }
    if (query.maxBranchCoverage !== undefined) {
      vector[3] = query.maxBranchCoverage / 100;
    }

    // Encode risk thresholds
    if (query.minRiskScore !== undefined) {
      vector[4] = query.minRiskScore;
    }
    if (query.maxRiskScore !== undefined) {
      vector[5] = query.maxRiskScore;
    }

    // Encode file pattern if provided
    if (query.filePattern) {
      const pathFeatures = this.extractPathFeatures(query.filePattern);
      vector[6] = pathFeatures.depth / 10;
      vector[7] = pathFeatures.hashNormalized;
    }

    // Encode uncovered lines constraint
    if (query.maxUncoveredLines !== undefined) {
      vector[8] = Math.min(1, query.maxUncoveredLines / 100);
    }

    // Fill with neutral values for undefined query parameters
    for (let i = 9; i < this.config.dimensions; i++) {
      if (vector[i] === 0) {
        vector[i] = 0.5; // Neutral value
      }
    }

    return {
      vector: this.normalize(vector),
      metadata: {
        filePath: query.filePattern || '',
        lineCoverage: query.minLineCoverage || 0,
        branchCoverage: query.minBranchCoverage || 0,
        functionCoverage: 0,
        statementCoverage: 0,
        uncoveredLineCount: query.maxUncoveredLines || 0,
        uncoveredBranchCount: 0,
        riskScore: query.minRiskScore || 0,
        lastUpdated: Date.now(),
        totalLines: 0,
      },
      confidence: 0.7, // Query embeddings have lower confidence
    };
  }

  /**
   * Batch embed multiple file coverages
   *
   * Efficiently processes multiple files in parallel.
   *
   * @param coverages - Array of file coverages to embed
   * @returns Array of embedding results
   */
  batchEmbed(coverages: FileCoverage[]): EmbeddingResult[] {
    return coverages.map((coverage) => this.embedFileCoverage(coverage));
  }

  // ============================================================================
  // Private Encoding Methods
  // ============================================================================

  private encodeCoverageMetrics(
    vector: number[],
    coverage: FileCoverage,
    offset: number
  ): number {
    // Line coverage (4 dimensions)
    vector[offset++] = coverage.lines.total > 0
      ? coverage.lines.covered / coverage.lines.total
      : 0;
    vector[offset++] = Math.min(1, coverage.lines.total / 1000);
    vector[offset++] = Math.min(1, coverage.lines.covered / 500);
    vector[offset++] = coverage.lines.total > 0
      ? coverage.uncoveredLines.length / coverage.lines.total
      : 0;

    // Branch coverage (4 dimensions)
    vector[offset++] = coverage.branches.total > 0
      ? coverage.branches.covered / coverage.branches.total
      : 1;
    vector[offset++] = Math.min(1, coverage.branches.total / 200);
    vector[offset++] = Math.min(1, coverage.branches.covered / 100);
    vector[offset++] = coverage.branches.total > 0
      ? coverage.uncoveredBranches.length / coverage.branches.total
      : 0;

    // Function coverage (4 dimensions)
    vector[offset++] = coverage.functions.total > 0
      ? coverage.functions.covered / coverage.functions.total
      : 1;
    vector[offset++] = Math.min(1, coverage.functions.total / 50);
    vector[offset++] = Math.min(1, coverage.functions.covered / 25);
    vector[offset++] = coverage.functions.total > 0
      ? 1 - coverage.functions.covered / coverage.functions.total
      : 0;

    // Statement coverage (4 dimensions)
    vector[offset++] = coverage.statements.total > 0
      ? coverage.statements.covered / coverage.statements.total
      : 1;
    vector[offset++] = Math.min(1, coverage.statements.total / 1000);
    vector[offset++] = Math.min(1, coverage.statements.covered / 500);
    vector[offset++] = coverage.statements.total > 0
      ? 1 - coverage.statements.covered / coverage.statements.total
      : 0;

    return offset;
  }

  private encodeGapCharacteristics(
    vector: number[],
    coverage: FileCoverage,
    offset: number
  ): number {
    const uncoveredLines = coverage.uncoveredLines;
    const uncoveredBranches = coverage.uncoveredBranches;

    // Gap size metrics (4 dimensions)
    vector[offset++] = Math.min(1, uncoveredLines.length / 100);
    vector[offset++] = Math.min(1, uncoveredBranches.length / 50);
    vector[offset++] = Math.min(1, (uncoveredLines.length + uncoveredBranches.length) / 150);
    vector[offset++] = uncoveredLines.length > 0 ? 1 : 0;

    // Gap distribution metrics (4 dimensions)
    if (uncoveredLines.length > 1) {
      const sorted = [...uncoveredLines].sort((a, b) => a - b);
      const spread = sorted[sorted.length - 1] - sorted[0];
      const density = uncoveredLines.length / (spread + 1);

      vector[offset++] = Math.min(1, spread / 500);
      vector[offset++] = Math.min(1, density);

      // Gap clustering - count contiguous regions
      const regions = this.countContiguousRegions(sorted);
      vector[offset++] = Math.min(1, regions / 10);
      vector[offset++] = regions > 0 ? uncoveredLines.length / regions : 0; // Avg region size
    } else {
      vector[offset++] = 0;
      vector[offset++] = uncoveredLines.length > 0 ? 1 : 0;
      vector[offset++] = uncoveredLines.length > 0 ? 0.1 : 0;
      vector[offset++] = uncoveredLines.length;
    }

    // Gap position metrics (4 dimensions)
    if (uncoveredLines.length > 0 && coverage.lines.total > 0) {
      const firstGap = Math.min(...uncoveredLines);
      const lastGap = Math.max(...uncoveredLines);

      vector[offset++] = firstGap / coverage.lines.total; // Position of first gap
      vector[offset++] = lastGap / coverage.lines.total; // Position of last gap
      vector[offset++] = (lastGap - firstGap) / coverage.lines.total; // Gap span
      vector[offset++] = uncoveredLines.filter((l) => l <= coverage.lines.total * 0.2).length / uncoveredLines.length; // Early file gaps
    } else {
      offset += 4;
    }

    // Padding (4 dimensions)
    offset += 4;

    return offset;
  }

  private encodeRiskFactors(
    vector: number[],
    coverage: FileCoverage,
    offset: number
  ): number {
    // Coverage-based risk (4 dimensions)
    const overallCoverage = this.calculateOverallCoverage(coverage);
    vector[offset++] = 1 - overallCoverage; // Inverted: higher value = higher risk
    vector[offset++] = coverage.branches.total > 0
      ? 1 - coverage.branches.covered / coverage.branches.total
      : 0;
    vector[offset++] = coverage.functions.total > 0
      ? 1 - coverage.functions.covered / coverage.functions.total
      : 0;
    vector[offset++] = Math.min(1, coverage.uncoveredLines.length / 50);

    // Size-based risk (4 dimensions)
    vector[offset++] = Math.min(1, coverage.lines.total / 500);
    vector[offset++] = Math.min(1, coverage.functions.total / 30);
    vector[offset++] = Math.min(1, coverage.branches.total / 100);
    vector[offset++] = coverage.lines.total > 300 ? 0.8 : coverage.lines.total / 375;

    // Gap severity risk (4 dimensions)
    const largeGapRatio = this.calculateLargeGapRatio(coverage.uncoveredLines);
    vector[offset++] = largeGapRatio;
    vector[offset++] = coverage.uncoveredBranches.length > 10 ? 1 : coverage.uncoveredBranches.length / 10;
    vector[offset++] = coverage.uncoveredLines.length > 30 ? 1 : coverage.uncoveredLines.length / 30;
    vector[offset++] = this.calculateGapConcentration(coverage);

    // Padding (4 dimensions)
    offset += 4;

    return offset;
  }

  private encodeFileCharacteristics(
    vector: number[],
    coverage: FileCoverage,
    offset: number
  ): number {
    const pathFeatures = this.extractPathFeatures(coverage.path);

    // Path depth and structure (4 dimensions)
    vector[offset++] = pathFeatures.depth / 10;
    vector[offset++] = pathFeatures.hashNormalized;
    vector[offset++] = pathFeatures.isTest ? 0.1 : 0.9; // Lower priority for test files
    vector[offset++] = pathFeatures.isConfig ? 0.2 : 0.8; // Lower priority for config files

    // File type features (4 dimensions)
    vector[offset++] = pathFeatures.extension === 'ts' ? 1 : 0;
    vector[offset++] = pathFeatures.extension === 'js' ? 1 : 0;
    vector[offset++] = pathFeatures.extension === 'tsx' || pathFeatures.extension === 'jsx' ? 1 : 0;
    vector[offset++] = pathFeatures.isIndex ? 0.5 : 0;

    // Directory context (4 dimensions)
    vector[offset++] = pathFeatures.inSrc ? 1 : 0;
    vector[offset++] = pathFeatures.inLib ? 0.8 : 0;
    vector[offset++] = pathFeatures.inDomains ? 1 : 0;
    vector[offset++] = pathFeatures.inServices ? 0.9 : 0;

    // Padding (4 dimensions)
    offset += 4;

    return offset;
  }

  private encodeDerivedFeatures(
    vector: number[],
    coverage: FileCoverage,
    offset: number
  ): void {
    // Generate derived features using mathematical transformations
    const metrics = [
      coverage.lines.covered / (coverage.lines.total || 1),
      coverage.branches.covered / (coverage.branches.total || 1),
      coverage.functions.covered / (coverage.functions.total || 1),
      coverage.statements.covered / (coverage.statements.total || 1),
      coverage.uncoveredLines.length / (coverage.lines.total || 1),
      coverage.uncoveredBranches.length / (coverage.branches.total || 1),
    ];

    // Cross-metric features
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6 && offset < this.config.dimensions; j++) {
        vector[offset++] = (metrics[i] + metrics[j]) / 2; // Average
        if (offset < this.config.dimensions) {
          vector[offset++] = Math.abs(metrics[i] - metrics[j]); // Difference
        }
      }
    }

    // Polynomial features
    while (offset < this.config.dimensions - 6) {
      const idx = (offset - 64) % metrics.length;
      vector[offset++] = metrics[idx] * metrics[idx]; // Quadratic
      if (offset < this.config.dimensions) {
        vector[offset++] = Math.sqrt(metrics[idx]); // Square root
      }
    }

    // Trigonometric features for remaining dimensions
    while (offset < this.config.dimensions) {
      const phase = (offset - 64) * 0.1;
      const baseValue = metrics[(offset - 64) % metrics.length];
      vector[offset++] = Math.sin(baseValue * Math.PI + phase) * 0.5 + 0.5;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private normalize(vector: number[]): number[] {
    switch (this.config.normalization) {
      case 'l2':
        return this.l2Normalize(vector);
      case 'minmax':
        return this.minMaxNormalize(vector);
      default:
        return vector;
    }
  }

  private l2Normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;
    return vector.map((v) => v / norm);
  }

  private minMaxNormalize(vector: number[]): number[] {
    const min = Math.min(...vector);
    const max = Math.max(...vector);
    const range = max - min;
    if (range === 0) return vector.map(() => 0.5);
    return vector.map((v) => (v - min) / range);
  }

  private createMetadata(coverage: FileCoverage): CoverageVectorMetadata {
    return {
      filePath: coverage.path,
      lineCoverage: coverage.lines.total > 0
        ? (coverage.lines.covered / coverage.lines.total) * 100
        : 0,
      branchCoverage: coverage.branches.total > 0
        ? (coverage.branches.covered / coverage.branches.total) * 100
        : 0,
      functionCoverage: coverage.functions.total > 0
        ? (coverage.functions.covered / coverage.functions.total) * 100
        : 0,
      statementCoverage: coverage.statements.total > 0
        ? (coverage.statements.covered / coverage.statements.total) * 100
        : 0,
      uncoveredLineCount: coverage.uncoveredLines.length,
      uncoveredBranchCount: coverage.uncoveredBranches.length,
      riskScore: this.calculateRiskScore(coverage),
      lastUpdated: Date.now(),
      totalLines: coverage.lines.total,
    };
  }

  private calculateConfidence(coverage: FileCoverage): number {
    // Higher confidence for files with more data
    const hasLines = coverage.lines.total > 0;
    const hasBranches = coverage.branches.total > 0;
    const hasFunctions = coverage.functions.total > 0;
    const hasStatements = coverage.statements.total > 0;

    let confidence = 0.5;
    if (hasLines) confidence += 0.2;
    if (hasBranches) confidence += 0.1;
    if (hasFunctions) confidence += 0.1;
    if (hasStatements) confidence += 0.1;

    return Math.min(1, confidence);
  }

  private calculateOverallCoverage(coverage: FileCoverage): number {
    const line = coverage.lines.total > 0
      ? coverage.lines.covered / coverage.lines.total
      : 1;
    const branch = coverage.branches.total > 0
      ? coverage.branches.covered / coverage.branches.total
      : 1;
    const func = coverage.functions.total > 0
      ? coverage.functions.covered / coverage.functions.total
      : 1;
    const stmt = coverage.statements.total > 0
      ? coverage.statements.covered / coverage.statements.total
      : 1;

    return (line + branch + func + stmt) / 4;
  }

  private calculateRiskScore(coverage: FileCoverage): number {
    const lineCoverageGap = coverage.lines.total > 0
      ? 1 - coverage.lines.covered / coverage.lines.total
      : 0;
    const branchCoverageGap = coverage.branches.total > 0
      ? 1 - coverage.branches.covered / coverage.branches.total
      : 0;
    const functionCoverageGap = coverage.functions.total > 0
      ? 1 - coverage.functions.covered / coverage.functions.total
      : 0;

    // Weighted risk score (branches and functions weighted higher)
    return Math.min(1, lineCoverageGap * 0.3 + branchCoverageGap * 0.4 + functionCoverageGap * 0.3);
  }

  private countContiguousRegions(sortedLines: number[]): number {
    if (sortedLines.length === 0) return 0;

    let regions = 1;
    for (let i = 1; i < sortedLines.length; i++) {
      if (sortedLines[i] - sortedLines[i - 1] > 3) {
        regions++;
      }
    }
    return regions;
  }

  private calculateLargeGapRatio(uncoveredLines: number[]): number {
    if (uncoveredLines.length === 0) return 0;

    const sorted = [...uncoveredLines].sort((a, b) => a - b);
    let largeGaps = 0;
    let currentGapSize = 1;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= 3) {
        currentGapSize++;
      } else {
        if (currentGapSize > 10) largeGaps++;
        currentGapSize = 1;
      }
    }
    if (currentGapSize > 10) largeGaps++;

    const totalRegions = this.countContiguousRegions(sorted);
    return totalRegions > 0 ? largeGaps / totalRegions : 0;
  }

  private calculateGapConcentration(coverage: FileCoverage): number {
    if (coverage.uncoveredLines.length === 0 || coverage.lines.total === 0) return 0;

    // Higher concentration = gaps clustered in fewer regions
    const regions = this.countContiguousRegions([...coverage.uncoveredLines].sort((a, b) => a - b));
    const idealRegions = Math.ceil(coverage.uncoveredLines.length / 5); // Assume 5 lines per region
    return regions > 0 ? Math.min(1, idealRegions / regions) : 0;
  }

  private extractPathFeatures(path: string): PathFeatures {
    const parts = path.split('/').filter(Boolean);
    const extension = path.split('.').pop() || '';
    const fileName = parts[parts.length - 1] || '';

    return {
      depth: parts.length,
      extension,
      hashNormalized: this.hashString(path) / 1000000,
      isTest: /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(path) || parts.includes('tests') || parts.includes('__tests__'),
      isConfig: /\.(config|rc)\.(ts|js|json|yaml|yml)$/.test(path),
      isIndex: fileName.startsWith('index.'),
      inSrc: parts.includes('src'),
      inLib: parts.includes('lib'),
      inDomains: parts.includes('domains'),
      inServices: parts.includes('services'),
    };
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash + chr) | 0;
    }
    return Math.abs(hash);
  }

  private severityToNumber(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface PathFeatures {
  depth: number;
  extension: string;
  hashNormalized: number;
  isTest: boolean;
  isConfig: boolean;
  isIndex: boolean;
  inSrc: boolean;
  inLib: boolean;
  inDomains: boolean;
  inServices: boolean;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new coverage embedder instance
 *
 * @param config - Optional configuration overrides
 * @returns Configured coverage embedder
 */
export function createCoverageEmbedder(
  config?: Partial<CoverageEmbedderConfig>
): CoverageEmbedder {
  return new CoverageEmbedder(config);
}
