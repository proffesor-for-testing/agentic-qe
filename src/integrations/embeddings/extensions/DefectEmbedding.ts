/**
 * QE-Specific Extension: Defect Pattern Embeddings
 *
 * Per ADR-040, extends base with defect-specific logic.
 * Specialized for:
 * - Defect pattern recognition
 * - Root cause similarity
 * - Defect prediction
 *
 * @module integrations/embeddings/extensions/DefectEmbedding
 */

import {
  EmbeddingGenerator,
  type IEmbedding,
  type IEmbeddingOptions,
  type ISearchOptions,
} from '../base/EmbeddingGenerator.js';
import type { IEmbeddingModelConfig } from '../base/types.js';
import { cosineSimilarity } from '../../../shared/utils/vector-math.js';

/**
 * Type guard to check if an embedding is a defect embedding
 */
function isDefectEmbedding(embedding: IEmbedding): embedding is IDefectEmbedding {
  return (
    embedding.namespace === 'defect' &&
    embedding.metadata !== undefined &&
    typeof embedding.metadata === 'object' &&
    'defectId' in embedding.metadata &&
    'title' in embedding.metadata &&
    'severity' in embedding.metadata &&
    'type' in embedding.metadata
  );
}

/**
 * Defect severity
 */
export type DefectSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Defect type
 */
export type DefectType =
  | 'functional'
  | 'performance'
  | 'security'
  | 'usability'
  | 'compatibility'
  | 'regression';

/**
 * Defect metadata
 */
export interface IDefectMetadata extends Record<string, unknown> {
  /** Defect ID */
  defectId: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Severity */
  severity: DefectSeverity;
  /** Type */
  type: DefectType;
  /** File path */
  filePath?: string;
  /** Root cause */
  rootCause?: string;
  /** Stack trace */
  stackTrace?: string;
  /** Reported by */
  reportedBy: string;
  /** Date reported */
  reportedDate: Date;
  /** Status */
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  /** Related tests */
  relatedTests?: string[];
  /** Tags */
  tags?: string[];
}

/**
 * Defect embedding with metadata
 */
export interface IDefectEmbedding extends IEmbedding {
  /** Defect metadata */
  metadata: IDefectMetadata;
}

/**
 * Similar defect result
 */
export interface ISimilarDefectResult {
  /** Defect ID */
  defectId: string;
  /** Title */
  title: string;
  /** Similarity score */
  score: number;
  /** Type of similarity */
  similarityType: 'exact-duplicate' | 'related' | 'similar-root-cause';
  /** Shared factors */
  sharedFactors: string[];
}

/**
 * Defect prediction result
 */
export interface IDefectPrediction {
  /** File/module */
  file: string;
  /** Defect probability (0-1) */
  probability: number;
  /** Predicted types */
  predictedTypes: DefectType[];
  /** Confidence (0-1) */
  confidence: number;
  /** Risk factors */
  riskFactors: string[];
}

/**
 * Defect embedding options
 */
export interface IDefectEmbeddingOptions extends IEmbeddingOptions {
  /** Include stack trace */
  includeStackTrace?: boolean;
  /** Include root cause */
  includeRootCause?: boolean;
  /** Weight by severity */
  weightBySeverity?: boolean;
}

/**
 * Defect pattern embedding generator
 *
 * Extends base EmbeddingGenerator with QE-specific logic for defect analysis.
 */
export class DefectEmbeddingGenerator extends EmbeddingGenerator {
  private severityWeights: Record<DefectSeverity, number> = {
    critical: 2.0,
    high: 1.5,
    medium: 1.0,
    low: 0.5,
  };

  constructor(config: Partial<IEmbeddingModelConfig> = {}) {
    super({
      ...config,
    });
  }

  /**
   * Generate embedding for a defect
   */
  async embedDefect(
    defect: IDefectMetadata,
    options: IDefectEmbeddingOptions = {}
  ): Promise<IDefectEmbedding> {
    // Prepare text for embedding
    const text = this.prepareDefectText(defect, options);

    // Generate base embedding
    const embedding = await this.embed(text, {
      namespace: 'defect',
      ...options,
    });

    return {
      ...embedding,
      metadata: defect,
    };
  }

  /**
   * Find similar defects
   */
  async findSimilarDefects(
    queryDefect: IDefectMetadata | string,
    options: ISearchOptions & {
      severity?: DefectSeverity;
      type?: DefectType;
      includeClosed?: boolean;
    } = {}
  ): Promise<ISimilarDefectResult[]> {
    // Generate query embedding
    const queryEmbedding =
      typeof queryDefect === 'string'
        ? await this.embed(queryDefect, { namespace: 'defect' })
        : await this.embedDefect(queryDefect);

    // Get all defect embeddings using type guard
    let allDefects = this.cache.getAll('defect').filter(isDefectEmbedding);

    // Filter by options
    if (options.severity) {
      allDefects = allDefects.filter((d) => d.metadata.severity === options.severity);
    }
    if (options.type) {
      allDefects = allDefects.filter((d) => d.metadata.type === options.type);
    }
    if (!options.includeClosed) {
      allDefects = allDefects.filter((d) => d.metadata.status !== 'closed');
    }

    // Calculate similarities
    const similarities: ISimilarDefectResult[] = allDefects
      .map((defect) => {
        const score = cosineSimilarity(
          queryEmbedding.vector as number[],
          defect.vector as number[]
        );

        let similarityType: ISimilarDefectResult['similarityType'] = 'related';
        if (score > 0.95) similarityType = 'exact-duplicate';
        else if (score > 0.8) similarityType = 'similar-root-cause';

        // Identify shared factors
        const sharedFactors = this.findSharedFactors(
          typeof queryDefect === 'string' ? { title: queryDefect } as IDefectMetadata : queryDefect,
          defect.metadata
        );

        return {
          defectId: defect.metadata.defectId,
          title: defect.metadata.title,
          score,
          similarityType,
          sharedFactors,
        };
      })
      .filter((result) => result.score >= (options.threshold || 0.7))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 10);

    return similarities;
  }

  /**
   * Predict defects for code changes
   */
  async predictDefects(
    filePath: string,
    codeChanges: string[],
    options: {
      includeHistorical?: boolean;
      riskThreshold?: number;
    } = {}
  ): Promise<IDefectPrediction[]> {
    const predictions: IDefectPrediction[] = [];

    // Get historical defects for this file
    const historicalDefects = options.includeHistorical
      ? this.cache.getAll('defect').filter(isDefectEmbedding).filter(
          (d) => d.metadata.filePath === filePath
        )
      : [];

    // Analyze each change
    for (const change of codeChanges) {
      const embedding = await this.embed(change, { namespace: 'defect' });

      // Find similar historical defects
      const similarDefects = historicalDefects
        .map((defect) => ({
          defect: defect.metadata,
          similarity: cosineSimilarity(
            embedding.vector as number[],
            defect.vector as number[]
          ),
        }))
        .filter((result) => result.similarity > 0.6)
        .sort((a, b) => b.similarity - a.similarity);

      if (similarDefects.length > 0) {
        // Calculate probability based on similarity
        const probability = Math.max(
          ...similarDefects.map((d) => d.similarity)
        );

        if (probability >= (options.riskThreshold || 0.5)) {
          // Predict types based on similar defects
          const typeCounts = new Map<DefectType, number>();
          for (const similar of similarDefects) {
            const count = typeCounts.get(similar.defect.type) || 0;
            typeCounts.set(similar.defect.type, count + 1);
          }

          const predictedTypes = Array.from(typeCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map((entry) => entry[0]);

          // Extract risk factors
          const riskFactors = new Set<string>();
          for (const similar of similarDefects.slice(0, 5)) {
            if (similar.defect.tags) {
              for (const tag of similar.defect.tags) {
                riskFactors.add(tag);
              }
            }
            if (similar.defect.rootCause) {
              riskFactors.add(similar.defect.rootCause);
            }
          }

          predictions.push({
            file: filePath,
            probability,
            predictedTypes,
            confidence: Math.min(probability + 0.1, 1),
            riskFactors: Array.from(riskFactors).slice(0, 5),
          });
        }
      }
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  /**
   * Get defect trends over time
   */
  async getDefectTrends(
    days: number = 30,
    groupBy: 'type' | 'severity' | 'status' = 'type'
  ): Promise<Array<{ label: string; count: number; trend: number }>> {
    const allDefects = this.cache.getAll('defect').filter(isDefectEmbedding);

    // Filter by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentDefects = allDefects.filter(
      (d) => new Date(d.metadata.reportedDate) >= cutoffDate
    );

    // Group by specified field
    const groups = new Map<string, IDefectEmbedding[]>();
    for (const defect of recentDefects) {
      let key: string;
      switch (groupBy) {
        case 'type':
          key = defect.metadata.type;
          break;
        case 'severity':
          key = defect.metadata.severity;
          break;
        case 'status':
          key = defect.metadata.status;
          break;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(defect);
    }

    // Calculate trends (compare with previous period)
    const trends: Array<{ label: string; count: number; trend: number }> = [];

    for (const [label, defects] of groups.entries()) {
      const count = defects.length;

      // Calculate previous period count
      const previousCutoff = new Date(cutoffDate);
      previousCutoff.setDate(previousCutoff.getDate() - days);

      const previousCount = allDefects.filter(
        (d) =>
          d.metadata.type === (groupBy === 'type' ? label : d.metadata.type) &&
          new Date(d.metadata.reportedDate) >= previousCutoff &&
          new Date(d.metadata.reportedDate) < cutoffDate
      ).length;

      // Trend percentage
      const trend = previousCount > 0
        ? ((count - previousCount) / previousCount) * 100
        : 0;

      trends.push({ label, count, trend });
    }

    return trends.sort((a, b) => b.count - a.count);
  }

  /**
   * Prepare defect text for embedding
   */
  private prepareDefectText(
    defect: IDefectMetadata,
    options: IDefectEmbeddingOptions
  ): string {
    let text = '';

    // Add title and description (high priority)
    text += `Title: ${defect.title}\n`;
    text += `Description: ${defect.description}\n`;

    // Add type and severity
    text += `Type: ${defect.type}\n`;
    text += `Severity: ${defect.severity}\n`;

    // Add file path if available
    if (defect.filePath) {
      text += `File: ${defect.filePath}\n`;
    }

    // Add root cause if available and requested
    if (options.includeRootCause !== false && defect.rootCause) {
      text += `Root Cause: ${defect.rootCause}\n`;
    }

    // Add stack trace if available and requested
    if (options.includeStackTrace !== false && defect.stackTrace) {
      text += `Stack Trace: ${defect.stackTrace.substring(0, 500)}\n`; // Limit length
    }

    // Add tags
    if (defect.tags && defect.tags.length > 0) {
      text += `Tags: ${defect.tags.join(', ')}\n`;
    }

    // Apply severity weighting if requested
    if (options.weightBySeverity) {
      const weight = this.severityWeights[defect.severity];
      text = text.repeat(Math.ceil(weight));
    }

    return text;
  }

  /**
   * Find shared factors between defects
   */
  private findSharedFactors(
    defect1: IDefectMetadata,
    defect2: IDefectMetadata
  ): string[] {
    const factors: string[] = [];

    // Check type
    if (defect1.type === defect2.type) {
      factors.push(`type: ${defect1.type}`);
    }

    // Check severity
    if (defect1.severity === defect2.severity) {
      factors.push(`severity: ${defect1.severity}`);
    }

    // Check file path
    if (defect1.filePath && defect2.filePath && defect1.filePath === defect2.filePath) {
      factors.push(`file: ${defect1.filePath}`);
    }

    // Check tags
    if (defect1.tags && defect2.tags) {
      const commonTags = defect1.tags.filter((tag) => defect2.tags?.includes(tag));
      for (const tag of commonTags) {
        factors.push(`tag: ${tag}`);
      }
    }

    return factors;
  }
}
