/**
 * PatternMemoryIntegration - Integration with ReasoningBank and shared memory
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 *
 * Provides storage and retrieval of extracted patterns in shared memory
 * for coordination across agents in the AQE fleet.
 */

import { MemoryStore } from '../types';
import {
  TestPattern,
  PatternExtractionResult,
  CodeSignature,
  TestTemplate,
  PatternSimilarity,
  PatternRecommendation,
  ExtractionStatistics as PatternExtractionStatistics,
  ExtractionError
} from '../types/pattern.types';
import { Logger } from '../utils/Logger';

export interface PatternMemoryConfig {
  namespace: string;
  ttl: number;
  partition: string;
}

// Type definitions for stored data shapes
interface StoredPatternData {
  patterns?: TestPattern[];
  signatures?: CodeSignature[];
  statistics?: PatternExtractionStatistics;
  errors?: ExtractionError[];
  timestamp?: string | Date;
}

interface StoredSignatureData {
  signatures?: CodeSignature[];
  count?: number;
  timestamp?: Date;
}

interface StoredTemplateData {
  templates?: TestTemplate[];
  count?: number;
  timestamp?: Date;
}

interface StoredRecommendationData {
  recommendations?: PatternRecommendation[];
  timestamp?: Date;
}

interface ExtractionStatistics {
  totalPatternsExtracted: number;
  totalFilesProcessed: number;
  totalProcessingTime: number;
  lastExtraction?: Date;
  avgProcessingTime?: number;
}

/**
 * Pattern memory integration for ReasoningBank
 */
export class PatternMemoryIntegration {
  private logger: Logger;
  private memoryStore: MemoryStore;
  private config: PatternMemoryConfig;

  constructor(memoryStore: MemoryStore, config?: Partial<PatternMemoryConfig>) {
    this.logger = Logger.getInstance();
    this.memoryStore = memoryStore;

    this.config = {
      namespace: 'phase2',
      ttl: 86400, // 24 hours
      partition: 'reasoning',
      ...config
    };
  }

  /**
   * Store extracted patterns
   */
  async storePatterns(
    result: PatternExtractionResult,
    key: string = 'extracted-patterns'
  ): Promise<void> {
    const memoryKey = `${this.config.namespace}/${key}`;

    try {
      await this.memoryStore.set(
        memoryKey,
        {
          patterns: result.patterns,
          signatures: result.signatures,
          statistics: result.statistics,
          errors: result.errors,
          timestamp: result.timestamp,
          metadata: {
            count: result.patterns.length,
            processingTime: result.statistics.processingTime,
            version: '1.1.0'
          }
        },
        this.config.partition
      );

      this.logger.info(`Stored ${result.patterns.length} patterns in memory at ${memoryKey}`);
    } catch (error) {
      this.logger.error('Failed to store patterns:', error);
      throw error;
    }
  }

  /**
   * Retrieve extracted patterns
   */
  async retrievePatterns(key: string = 'extracted-patterns'): Promise<PatternExtractionResult | null> {
    const memoryKey = `${this.config.namespace}/${key}`;

    try {
      const data = await this.memoryStore.get(memoryKey, this.config.partition) as StoredPatternData | null;

      if (!data) {
        this.logger.warn(`No patterns found at ${memoryKey}`);
        return null;
      }

      const defaultStats: PatternExtractionStatistics = {
        filesProcessed: 0,
        testsAnalyzed: 0,
        patternsExtracted: 0,
        processingTime: 0,
        avgPatternsPerFile: 0,
        patternTypeDistribution: {} as Record<string, number>
      };
      return {
        patterns: data.patterns || [],
        signatures: data.signatures || [],
        statistics: data.statistics || defaultStats,
        errors: data.errors || [],
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
      };
    } catch (error) {
      this.logger.error('Failed to retrieve patterns:', error);
      return null;
    }
  }

  /**
   * Store code signatures
   */
  async storeSignatures(
    signatures: CodeSignature[],
    key: string = 'code-signatures'
  ): Promise<void> {
    const memoryKey = `${this.config.namespace}/${key}`;

    try {
      await this.memoryStore.set(
        memoryKey,
        {
          signatures,
          count: signatures.length,
          timestamp: new Date()
        },
        this.config.partition
      );

      this.logger.info(`Stored ${signatures.length} code signatures`);
    } catch (error) {
      this.logger.error('Failed to store signatures:', error);
      throw error;
    }
  }

  /**
   * Retrieve code signatures
   */
  async retrieveSignatures(key: string = 'code-signatures'): Promise<CodeSignature[]> {
    const memoryKey = `${this.config.namespace}/${key}`;

    try {
      const data = await this.memoryStore.get(memoryKey, this.config.partition) as StoredSignatureData | null;
      return data?.signatures || [];
    } catch (error) {
      this.logger.error('Failed to retrieve signatures:', error);
      return [];
    }
  }

  /**
   * Store test templates
   */
  async storeTemplates(
    templates: TestTemplate[],
    key: string = 'test-templates'
  ): Promise<void> {
    const memoryKey = `${this.config.namespace}/${key}`;

    try {
      await this.memoryStore.set(
        memoryKey,
        {
          templates,
          count: templates.length,
          timestamp: new Date()
        },
        this.config.partition
      );

      this.logger.info(`Stored ${templates.length} test templates`);
    } catch (error) {
      this.logger.error('Failed to store templates:', error);
      throw error;
    }
  }

  /**
   * Retrieve test templates
   */
  async retrieveTemplates(key: string = 'test-templates'): Promise<TestTemplate[]> {
    const memoryKey = `${this.config.namespace}/${key}`;

    try {
      const data = await this.memoryStore.get(memoryKey, this.config.partition) as StoredTemplateData | null;
      return data?.templates || [];
    } catch (error) {
      this.logger.error('Failed to retrieve templates:', error);
      return [];
    }
  }

  /**
   * Store pattern similarities
   */
  async storeSimilarities(
    similarities: PatternSimilarity[],
    key: string = 'pattern-similarities'
  ): Promise<void> {
    const memoryKey = `${this.config.namespace}/${key}`;

    try {
      await this.memoryStore.set(
        memoryKey,
        {
          similarities,
          count: similarities.length,
          timestamp: new Date()
        },
        this.config.partition
      );

      this.logger.info(`Stored ${similarities.length} pattern similarities`);
    } catch (error) {
      this.logger.error('Failed to store similarities:', error);
      throw error;
    }
  }

  /**
   * Store pattern recommendations
   */
  async storeRecommendations(
    recommendations: PatternRecommendation[],
    sourceCodeHash: string
  ): Promise<void> {
    const memoryKey = `${this.config.namespace}/recommendations/${sourceCodeHash}`;

    try {
      await this.memoryStore.set(
        memoryKey,
        {
          recommendations,
          count: recommendations.length,
          timestamp: new Date()
        },
        this.config.partition
      );

      this.logger.info(`Stored ${recommendations.length} recommendations for ${sourceCodeHash}`);
    } catch (error) {
      this.logger.error('Failed to store recommendations:', error);
      throw error;
    }
  }

  /**
   * Retrieve pattern recommendations
   */
  async retrieveRecommendations(sourceCodeHash: string): Promise<PatternRecommendation[]> {
    const memoryKey = `${this.config.namespace}/recommendations/${sourceCodeHash}`;

    try {
      const data = await this.memoryStore.get(memoryKey, this.config.partition) as StoredRecommendationData | null;
      return data?.recommendations || [];
    } catch (error) {
      this.logger.error('Failed to retrieve recommendations:', error);
      return [];
    }
  }

  /**
   * Store pattern by ID for quick access
   */
  async storePatternById(pattern: TestPattern): Promise<void> {
    const memoryKey = `${this.config.namespace}/patterns/${pattern.id}`;

    try {
      await this.memoryStore.set(memoryKey, pattern, this.config.partition);
      this.logger.debug(`Stored pattern ${pattern.id}`);
    } catch (error) {
      this.logger.error(`Failed to store pattern ${pattern.id}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve pattern by ID
   */
  async retrievePatternById(patternId: string): Promise<TestPattern | null> {
    const memoryKey = `${this.config.namespace}/patterns/${patternId}`;

    try {
      const pattern = await this.memoryStore.get(memoryKey, this.config.partition) as TestPattern | null;
      return pattern || null;
    } catch (error) {
      this.logger.error(`Failed to retrieve pattern ${patternId}:`, error);
      return null;
    }
  }

  /**
   * Update extraction statistics
   */
  async updateStatistics(stats: {
    totalPatternsExtracted: number;
    totalFilesProcessed: number;
    totalProcessingTime: number;
    lastExtraction: Date;
  }): Promise<void> {
    const memoryKey = `${this.config.namespace}/statistics`;

    try {
      const existingData = await this.memoryStore.get(memoryKey, this.config.partition) as ExtractionStatistics | null;
      const existing: ExtractionStatistics = existingData || {
        totalPatternsExtracted: 0,
        totalFilesProcessed: 0,
        totalProcessingTime: 0
      };

      const updated: ExtractionStatistics = {
        totalPatternsExtracted: existing.totalPatternsExtracted + stats.totalPatternsExtracted,
        totalFilesProcessed: existing.totalFilesProcessed + stats.totalFilesProcessed,
        totalProcessingTime: existing.totalProcessingTime + stats.totalProcessingTime,
        lastExtraction: stats.lastExtraction,
        avgProcessingTime: (existing.totalProcessingTime + stats.totalProcessingTime) /
          (existing.totalFilesProcessed + stats.totalFilesProcessed)
      };

      await this.memoryStore.set(memoryKey, updated, this.config.partition);
      this.logger.info('Updated extraction statistics');
    } catch (error) {
      this.logger.error('Failed to update statistics:', error);
    }
  }

  /**
   * Get extraction statistics
   */
  async getStatistics(): Promise<any> {
    const memoryKey = `${this.config.namespace}/statistics`;

    try {
      return await this.memoryStore.get(memoryKey, this.config.partition) || {
        totalPatternsExtracted: 0,
        totalFilesProcessed: 0,
        totalProcessingTime: 0,
        lastExtraction: null,
        avgProcessingTime: 0
      };
    } catch (error) {
      this.logger.error('Failed to get statistics:', error);
      return null;
    }
  }

  /**
   * Clear all patterns from memory
   */
  async clearPatterns(): Promise<void> {
    try {
      await this.memoryStore.clear(this.config.partition);
      this.logger.info('Cleared all patterns from memory');
    } catch (error) {
      this.logger.error('Failed to clear patterns:', error);
      throw error;
    }
  }

  /**
   * Export patterns for backup/migration
   */
  async exportPatterns(): Promise<{
    patterns: TestPattern[];
    templates: TestTemplate[];
    signatures: CodeSignature[];
    statistics: any;
  }> {
    try {
      const result = await this.retrievePatterns();
      const templates = await this.retrieveTemplates();
      const signatures = await this.retrieveSignatures();
      const statistics = await this.getStatistics();

      return {
        patterns: result?.patterns || [],
        templates,
        signatures,
        statistics
      };
    } catch (error) {
      this.logger.error('Failed to export patterns:', error);
      throw error;
    }
  }

  /**
   * Import patterns from backup
   */
  async importPatterns(data: {
    patterns: TestPattern[];
    templates?: TestTemplate[];
    signatures?: CodeSignature[];
  }): Promise<void> {
    try {
      // Import patterns
      if (data.patterns && data.patterns.length > 0) {
        const result: PatternExtractionResult = {
          patterns: data.patterns,
          signatures: data.signatures || [],
          statistics: {
            filesProcessed: 0,
            testsAnalyzed: 0,
            patternsExtracted: data.patterns.length,
            processingTime: 0,
            avgPatternsPerFile: 0,
            patternTypeDistribution: {} as any
          },
          errors: [],
          timestamp: new Date()
        };

        await this.storePatterns(result);
      }

      // Import templates
      if (data.templates && data.templates.length > 0) {
        await this.storeTemplates(data.templates);
      }

      // Import signatures
      if (data.signatures && data.signatures.length > 0) {
        await this.storeSignatures(data.signatures);
      }

      this.logger.info('Successfully imported patterns');
    } catch (error) {
      this.logger.error('Failed to import patterns:', error);
      throw error;
    }
  }
}
