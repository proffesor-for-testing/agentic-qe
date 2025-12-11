/**
 * ExperienceExtractor - Extract learnable content from agent executions
 *
 * Analyzes agent execution events to extract:
 * - Patterns and techniques used
 * - Decisions made during execution
 * - Errors encountered and handled
 * - Quality metrics and scores
 * - Vector embeddings for similarity search
 *
 * Part of the Nightly-Learner Phase 1 implementation.
 *
 * @version 1.0.0
 * @module src/learning/capture/ExperienceExtractor
 */

import { AgentExecutionEvent } from './ExperienceCapture';
import { EmbeddingGenerator } from '../../core/embeddings/EmbeddingGenerator';
import { Logger } from '../../utils/Logger';

/**
 * Extracted content from an execution event
 */
export interface ExtractedContent {
  /** Patterns and techniques identified in the execution */
  patterns: string[];

  /** Decisions made during execution */
  decisions: string[];

  /** Errors encountered */
  errors: string[];

  /** Quality score (0-1) */
  qualityScore: number;

  /** Vector embedding for similarity search */
  embedding?: number[];

  /** Coverage metrics */
  coverage?: {
    delta: number;
    total?: number;
  };

  /** Extraction metadata */
  metadata: {
    extractedAt: Date;
    contentHash: string;
    embeddingDimension?: number;
    embeddingMethod?: 'hash' | 'ml';
  };
}

/**
 * Configuration for the experience extractor
 */
export interface ExperienceExtractorConfig {
  /** Enable embedding generation. Default: true */
  generateEmbeddings?: boolean;

  /** Use ML-based embeddings. Default: false (uses hash-based) */
  useMLEmbeddings?: boolean;

  /** Embedding dimension. Default: 256 */
  embeddingDimension?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Statistics for extraction operations
 */
export interface ExtractionStats {
  totalExtractions: number;
  patternsExtracted: number;
  decisionsExtracted: number;
  errorsExtracted: number;
  embeddingsGenerated: number;
  avgQualityScore: number;
  avgExtractionTime: number;
}

/**
 * ExperienceExtractor extracts learnable content from agent executions
 *
 * Analyzes execution events to identify patterns, decisions, and quality metrics
 * that can be used for learning and improvement.
 *
 * @example
 * ```typescript
 * const extractor = new ExperienceExtractor({
 *   generateEmbeddings: true,
 *   useMLEmbeddings: false
 * });
 *
 * const content = await extractor.extract(executionEvent);
 * console.log('Patterns:', content.patterns);
 * console.log('Quality:', content.qualityScore);
 * ```
 */
export class ExperienceExtractor {
  private config: Required<ExperienceExtractorConfig>;
  private logger: Logger;
  private embeddingGenerator: EmbeddingGenerator;

  // Statistics tracking
  private totalExtractions: number = 0;
  private totalPatterns: number = 0;
  private totalDecisions: number = 0;
  private totalErrors: number = 0;
  private totalEmbeddings: number = 0;
  private totalQualityScore: number = 0;
  private totalExtractionTime: number = 0;

  constructor(config?: ExperienceExtractorConfig) {
    this.logger = Logger.getInstance();

    this.config = {
      generateEmbeddings: config?.generateEmbeddings ?? true,
      useMLEmbeddings: config?.useMLEmbeddings ?? false,
      embeddingDimension: config?.embeddingDimension ?? 256,
      debug: config?.debug ?? false,
    };

    // Initialize embedding generator
    this.embeddingGenerator = new EmbeddingGenerator(
      10000, // Cache size
      this.config.useMLEmbeddings // Auto-init ML models
    );
  }

  /**
   * Extract learnable content from an agent execution event
   *
   * @param event - Agent execution event to analyze
   * @returns Extracted content with patterns, decisions, and embeddings
   */
  async extract(event: AgentExecutionEvent): Promise<ExtractedContent> {
    const startTime = Date.now();

    try {
      // Extract patterns from output
      const patterns = this.extractPatterns(event.output);

      // Extract decisions from output
      const decisions = this.extractDecisions(event.output);

      // Extract errors
      const errors = this.extractErrors(event);

      // Calculate quality score
      const qualityScore = this.calculateQualityScore(event);

      // Generate embedding if enabled
      let embedding: number[] | undefined;
      let embeddingDimension: number | undefined;
      let embeddingMethod: 'hash' | 'ml' | undefined;

      if (this.config.generateEmbeddings) {
        const embeddingResult = await this.generateEmbedding(event);
        embedding = embeddingResult.embedding;
        embeddingDimension = embeddingResult.dimension;
        embeddingMethod = embeddingResult.method;
        this.totalEmbeddings++;
      }

      // Extract coverage metrics
      const coverage = this.extractCoverage(event);

      // Create content hash for deduplication
      const contentHash = this.createContentHash(event);

      // Update statistics
      this.totalExtractions++;
      this.totalPatterns += patterns.length;
      this.totalDecisions += decisions.length;
      this.totalErrors += errors.length;
      this.totalQualityScore += qualityScore;
      this.totalExtractionTime += Date.now() - startTime;

      const extracted: ExtractedContent = {
        patterns,
        decisions,
        errors,
        qualityScore,
        embedding,
        coverage,
        metadata: {
          extractedAt: new Date(),
          contentHash,
          embeddingDimension,
          embeddingMethod,
        },
      };

      if (this.config.debug) {
        this.logger.debug('[ExperienceExtractor] Content extracted', {
          patterns: patterns.length,
          decisions: decisions.length,
          errors: errors.length,
          qualityScore: qualityScore.toFixed(2),
          hasEmbedding: !!embedding,
          extractionTime: Date.now() - startTime,
        });
      }

      return extracted;
    } catch (error: any) {
      this.logger.error('[ExperienceExtractor] Extraction failed', { error });
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract patterns used during execution
   *
   * Looks for:
   * - Explicit pattern references in output
   * - Testing frameworks and strategies
   * - Code patterns and techniques
   * - Quality engineering approaches
   *
   * @param output - Execution output data
   * @returns Array of pattern identifiers
   */
  extractPatterns(output: Record<string, unknown>): string[] {
    const patterns: string[] = [];

    // Direct pattern references
    if (output.patterns && Array.isArray(output.patterns)) {
      patterns.push(...output.patterns.map((p: any) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && 'id' in p) return String(p.id);
        if (p && typeof p === 'object' && 'name' in p) return String(p.name);
        return String(p);
      }));
    }

    if (output.patternsApplied && Array.isArray(output.patternsApplied)) {
      patterns.push(...output.patternsApplied.map(String));
    }

    if (output.patternsUsed && Array.isArray(output.patternsUsed)) {
      patterns.push(...output.patternsUsed.map(String));
    }

    // Framework detection
    if (output.framework) {
      patterns.push(`framework:${output.framework}`);
    }

    if (output.testFramework) {
      patterns.push(`test-framework:${output.testFramework}`);
    }

    // Strategy detection
    if (output.strategy) {
      patterns.push(`strategy:${output.strategy}`);
    }

    if (output.testStrategy) {
      patterns.push(`test-strategy:${output.testStrategy}`);
    }

    // Technique detection
    if (output.techniques && Array.isArray(output.techniques)) {
      patterns.push(...output.techniques.map((t: any) => `technique:${t}`));
    }

    // Approach detection
    if (output.approach) {
      patterns.push(`approach:${output.approach}`);
    }

    // Method detection
    if (output.methods && Array.isArray(output.methods)) {
      patterns.push(...output.methods.map((m: any) => `method:${m}`));
    }

    // Tool detection
    if (output.tools && Array.isArray(output.tools)) {
      patterns.push(...output.tools.map((t: any) => `tool:${t}`));
    }

    // Remove duplicates and empty strings
    return [...new Set(patterns)].filter(p => p && p.length > 0);
  }

  /**
   * Extract decisions made during execution
   *
   * Looks for:
   * - Strategic choices
   * - Configuration decisions
   * - Implementation approaches
   * - Trade-off evaluations
   *
   * @param output - Execution output data
   * @returns Array of decision descriptions
   */
  extractDecisions(output: Record<string, unknown>): string[] {
    const decisions: string[] = [];

    // Direct decision references
    if (output.decisions && Array.isArray(output.decisions)) {
      decisions.push(...output.decisions.map(String));
    }

    if (output.decisionsMade && Array.isArray(output.decisionsMade)) {
      decisions.push(...output.decisionsMade.map(String));
    }

    // Strategy decisions
    if (output.strategy) {
      decisions.push(`strategy:${output.strategy}`);
    }

    // Framework decisions
    if (output.framework) {
      decisions.push(`framework:${output.framework}`);
    }

    // Configuration decisions
    if (output.config && typeof output.config === 'object') {
      const config = output.config as Record<string, unknown>;
      Object.entries(config).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          decisions.push(`config:${key}=${JSON.stringify(value)}`);
        }
      });
    }

    // Coverage target decisions
    if (output.coverageTarget) {
      decisions.push(`coverage-target:${output.coverageTarget}`);
    }

    // Test type decisions
    if (output.testType) {
      decisions.push(`test-type:${output.testType}`);
    }

    if (output.testTypes && Array.isArray(output.testTypes)) {
      decisions.push(...output.testTypes.map((t: any) => `test-type:${t}`));
    }

    // Assertion style decisions
    if (output.assertionStyle) {
      decisions.push(`assertion-style:${output.assertionStyle}`);
    }

    // Mock strategy decisions
    if (output.mockStrategy) {
      decisions.push(`mock-strategy:${output.mockStrategy}`);
    }

    // Architecture decisions
    if (output.architecture) {
      decisions.push(`architecture:${output.architecture}`);
    }

    // Remove duplicates and empty strings
    return [...new Set(decisions)].filter(d => d && d.length > 0);
  }

  /**
   * Extract errors encountered during execution
   *
   * @param event - Execution event
   * @returns Array of error messages
   */
  private extractErrors(event: AgentExecutionEvent): string[] {
    const errors: string[] = [];

    // Direct error from event
    if (event.error) {
      errors.push(event.error.message);

      // Include stack trace hash for grouping similar errors
      if (event.error.stack) {
        const stackHash = this.hashString(event.error.stack.substring(0, 200));
        errors.push(`stack-hash:${stackHash}`);
      }
    }

    // Errors in output
    if (event.output.errors && Array.isArray(event.output.errors)) {
      errors.push(...event.output.errors.map((e: any) => {
        if (typeof e === 'string') return e;
        if (e && typeof e === 'object' && 'message' in e) return String(e.message);
        return String(e);
      }));
    }

    if (event.output.error) {
      errors.push(String(event.output.error));
    }

    // Warnings as potential issues
    if (event.output.warnings && Array.isArray(event.output.warnings)) {
      errors.push(...event.output.warnings.map((w: any) => `warning:${w}`));
    }

    return [...new Set(errors)].filter(e => e && e.length > 0);
  }

  /**
   * Calculate quality score for the execution
   *
   * Scoring factors:
   * - Success/failure (0.5 base)
   * - Coverage metrics (+0.2)
   * - Tests generated (+0.1)
   * - Execution speed (+0.1)
   * - Error penalties (-0.2)
   *
   * @param event - Execution event
   * @returns Quality score between 0 and 1
   */
  calculateQualityScore(event: AgentExecutionEvent): number {
    let score = event.success ? 0.5 : 0.0;

    // Metrics-based scoring
    if (event.metrics) {
      // Coverage bonus
      if (event.metrics.coverage !== undefined) {
        const coverage = Number(event.metrics.coverage);
        if (coverage >= 90) {
          score += 0.2;
        } else if (coverage >= 70) {
          score += 0.15;
        } else if (coverage >= 50) {
          score += 0.1;
        }
      }

      // Tests generated bonus
      if (event.metrics.testsGenerated !== undefined) {
        const testsGenerated = Number(event.metrics.testsGenerated);
        if (testsGenerated >= 10) {
          score += 0.1;
        } else if (testsGenerated >= 5) {
          score += 0.05;
        }
      }

      // Execution speed bonus (fast execution)
      if (event.duration !== undefined) {
        if (event.duration < 3000) {
          score += 0.1; // Very fast (< 3s)
        } else if (event.duration < 5000) {
          score += 0.05; // Fast (< 5s)
        }
      }

      // Code quality bonus
      if (event.metrics.codeQuality !== undefined) {
        const quality = Number(event.metrics.codeQuality);
        score += quality * 0.1; // Up to +0.1 for perfect quality
      }

      // Coverage delta bonus (improvement)
      if (event.metrics.coverage_delta !== undefined) {
        const delta = Number(event.metrics.coverage_delta);
        if (delta > 10) {
          score += 0.05;
        }
      }
    }

    // Error penalties
    if (event.error) {
      score -= 0.2;
    }

    if (event.output.errors && Array.isArray(event.output.errors)) {
      score -= Math.min(0.2, event.output.errors.length * 0.05);
    }

    // Ensure score is in valid range [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate embedding for execution content
   *
   * Creates a vector embedding of the execution's content for similarity search.
   * Combines input, output, patterns, and decisions into a single representation.
   *
   * @param event - Execution event
   * @returns Embedding result with vector and metadata
   */
  async generateEmbedding(event: AgentExecutionEvent): Promise<{
    embedding: number[];
    dimension: number;
    method: 'hash' | 'ml';
  }> {
    // Create a text representation of the execution
    const content = this.serializeExecutionContent(event);

    try {
      // Generate text embedding
      const result = await this.embeddingGenerator.generateTextEmbedding(content, {
        useML: this.config.useMLEmbeddings,
        useCache: true,
        normalize: true,
        dimension: this.config.embeddingDimension,
      });

      return {
        embedding: result.embedding,
        dimension: result.dimension,
        method: result.method,
      };
    } catch (error: any) {
      // Fallback to hash-based embedding
      this.logger.warn('[ExperienceExtractor] ML embedding failed, using hash-based', { error: error.message });

      const embedding = this.embeddingGenerator.generateHashEmbedding(
        content,
        this.config.embeddingDimension
      );

      return {
        embedding,
        dimension: embedding.length,
        method: 'hash',
      };
    }
  }

  /**
   * Extract coverage metrics from event
   *
   * @param event - Execution event
   * @returns Coverage information
   */
  private extractCoverage(event: AgentExecutionEvent): { delta: number; total?: number } | undefined {
    if (!event.metrics) return undefined;

    const delta = event.metrics.coverage_delta !== undefined
      ? Number(event.metrics.coverage_delta)
      : 0;

    const total = event.metrics.coverage !== undefined
      ? Number(event.metrics.coverage)
      : undefined;

    return { delta, total };
  }

  /**
   * Serialize execution content to text for embedding
   *
   * @param event - Execution event
   * @returns Text representation
   */
  private serializeExecutionContent(event: AgentExecutionEvent): string {
    const parts: string[] = [
      `agent:${event.agentType}`,
      `task:${event.taskType}`,
      `success:${event.success}`,
    ];

    // Add patterns
    const patterns = this.extractPatterns(event.output);
    if (patterns.length > 0) {
      parts.push(`patterns:${patterns.join(',')}`);
    }

    // Add decisions
    const decisions = this.extractDecisions(event.output);
    if (decisions.length > 0) {
      parts.push(`decisions:${decisions.join(',')}`);
    }

    // Add metrics
    if (event.metrics) {
      Object.entries(event.metrics).forEach(([key, value]) => {
        parts.push(`metric:${key}=${value}`);
      });
    }

    // Add input summary (avoid large objects)
    if (event.input.description) {
      parts.push(`input:${String(event.input.description).substring(0, 200)}`);
    }

    return parts.join('|');
  }

  /**
   * Create content hash for deduplication
   *
   * @param event - Execution event
   * @returns Content hash
   */
  private createContentHash(event: AgentExecutionEvent): string {
    const content = this.serializeExecutionContent(event);
    return this.hashString(content);
  }

  /**
   * Hash a string using simple algorithm
   *
   * @param str - String to hash
   * @returns Hash string
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get extraction statistics
   *
   * @returns Statistics about extraction operations
   */
  getStats(): ExtractionStats {
    return {
      totalExtractions: this.totalExtractions,
      patternsExtracted: this.totalPatterns,
      decisionsExtracted: this.totalDecisions,
      errorsExtracted: this.totalErrors,
      embeddingsGenerated: this.totalEmbeddings,
      avgQualityScore: this.totalExtractions > 0
        ? this.totalQualityScore / this.totalExtractions
        : 0,
      avgExtractionTime: this.totalExtractions > 0
        ? this.totalExtractionTime / this.totalExtractions
        : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalExtractions = 0;
    this.totalPatterns = 0;
    this.totalDecisions = 0;
    this.totalErrors = 0;
    this.totalEmbeddings = 0;
    this.totalQualityScore = 0;
    this.totalExtractionTime = 0;
  }

  /**
   * Update configuration
   *
   * @param config - New configuration values
   */
  updateConfig(config: Partial<ExperienceExtractorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    this.logger.info('[ExperienceExtractor] Configuration updated', this.config);
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration
   */
  getConfig(): Required<ExperienceExtractorConfig> {
    return { ...this.config };
  }
}

export default ExperienceExtractor;
