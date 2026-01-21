/**
 * QE Wrapper for @ruvector/sona
 *
 * This wrapper provides QE-specific interface on top of @ruvector/sona (Rust/NAPI).
 * Maintains backward compatibility with existing QE SONA code while leveraging
 * the high-performance Rust implementation.
 *
 * @module integrations/ruvector/sona-wrapper
 */

import { SonaEngine } from '@ruvector/sona';
import type {
  RLState,
  RLAction,
  DomainName
} from '../rl-suite/interfaces.js';

// ============================================================================
// QE-Specific SONA Types
// ============================================================================

/**
 * Pattern types supported by QE SONA (extends @ruvector/sona with QE specifics)
 */
export type QEPatternType =
  | 'test-generation'
  | 'defect-prediction'
  | 'coverage-optimization'
  | 'quality-assessment'
  | 'resource-allocation';

/**
 * QE SONA pattern - extends @ruvector/sona's JsLearnedPattern with QE metadata
 */
export interface QESONAPattern {
  /** Unique pattern identifier */
  id: string;
  /** Pattern type */
  type: QEPatternType;
  /** Source domain */
  domain: DomainName;
  /** State embedding for similarity search */
  stateEmbedding: number[];
  /** Action taken */
  action: RLAction;
  /** Expected outcome */
  outcome: {
    reward: number;
    success: boolean;
    quality: number;
  };
  /** Pattern confidence (0-1) */
  confidence: number;
  /** Usage count */
  usageCount: number;
  /** Timestamp created */
  createdAt: Date;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Pattern metadata */
  metadata?: Record<string, unknown>;
  /** Raw @ruvector/sona pattern data */
  rawPattern?: {
    centroid: number[];
    clusterSize: number;
    totalWeight: number;
    avgQuality: number;
    createdAt: string;
    lastAccessed: string;
    accessCount: number;
    patternType: string;
  };
}

/**
 * SONA adaptation result
 */
export interface QESONAAdaptationResult {
  /** Whether adaptation was successful */
  success: boolean;
  /** Adapted pattern or null if not found */
  pattern: QESONAPattern | null;
  /** Adaptation time in milliseconds */
  adaptationTimeMs: number;
  /** Similarity score (0-1) */
  similarity: number;
  /** Reasoning */
  reasoning: string;
}

/**
 * SONA statistics
 */
export interface QESONAStats {
  /** Total patterns stored */
  totalPatterns: number;
  /** Patterns by type */
  patternsByType: Record<QEPatternType, number>;
  /** Average adaptation time (ms) */
  avgAdaptationTimeMs: number;
  /** Minimum adaptation time (ms) */
  minAdaptationTimeMs: number;
  /** Maximum adaptation time (ms) */
  maxAdaptationTimeMs: number;
  /** Total adaptations */
  totalAdaptations: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** SONA engine stats (JSON string from @ruvector/sona) */
  engineStats: string;
}

/**
 * SONA configuration
 */
export interface QESONAConfig {
  /** Hidden dimension size */
  hiddenDim: number;
  /** Embedding dimension (defaults to hidden_dim) */
  embeddingDim?: number;
  /** Micro-LoRA rank (1-2, default: 1) */
  microLoraRank?: number;
  /** Base LoRA rank (default: 8) */
  baseLoraRank?: number;
  /** Micro-LoRA learning rate (default: 0.001) */
  microLoraLr?: number;
  /** Base LoRA learning rate (default: 0.0001) */
  baseLoraLr?: number;
  /** EWC lambda regularization (default: 1000.0) */
  ewcLambda?: number;
  /** Number of pattern clusters (default: 50) */
  patternClusters?: number;
  /** Trajectory buffer capacity (default: 10000) */
  trajectoryCapacity?: number;
  /** Background learning interval in ms (default: 3600000 = 1 hour) */
  backgroundIntervalMs?: number;
  /** Quality threshold for learning (default: 0.5) */
  qualityThreshold?: number;
  /** Enable SIMD optimizations (default: true) */
  enableSimd?: boolean;
  /** Minimum confidence threshold for QE patterns */
  minConfidence?: number;
  /** Maximum patterns to store */
  maxPatterns?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_QE_SONA_CONFIG: QESONAConfig = {
  hiddenDim: 256,
  embeddingDim: 384,
  microLoraRank: 1,
  baseLoraRank: 8,
  microLoraLr: 0.001,
  baseLoraLr: 0.0001,
  ewcLambda: 1000.0,
  patternClusters: 50,
  trajectoryCapacity: 10000,
  backgroundIntervalMs: 3600000,
  qualityThreshold: 0.5,
  enableSimd: true,
  minConfidence: 0.5,
  maxPatterns: 10000,
};

// ============================================================================
// SONA Pattern Registry (QE-specific metadata layer)
// ============================================================================

/**
 * Registry for QE-specific pattern metadata
 * Bridges @ruvector/sona patterns with QE domain concepts
 */
class QESONAPatternRegistry {
  private patterns: Map<string, QESONAPattern>;
  private trajectoryMap: Map<number, string>; // trajectory ID -> pattern ID
  private maxPatterns: number;

  constructor(maxPatterns: number = 10000) {
    this.patterns = new Map();
    this.trajectoryMap = new Map();
    this.maxPatterns = maxPatterns;
  }

  /**
   * Register a QE pattern with metadata
   */
  register(pattern: QESONAPattern): void {
    // Evict oldest if at capacity
    if (this.patterns.size >= this.maxPatterns && !this.patterns.has(pattern.id)) {
      const oldest = Array.from(this.patterns.entries())
        .sort(([, a], [, b]) =>
          (a.lastUsedAt?.getTime() ?? a.createdAt.getTime()) -
          (b.lastUsedAt?.getTime() ?? b.createdAt.getTime())
        )[0];

      if (oldest) {
        this.patterns.delete(oldest[0]);
      }
    }

    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Get pattern by ID
   */
  get(id: string): QESONAPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get pattern by trajectory ID
   */
  getByTrajectory(trajectoryId: number): QESONAPattern | undefined {
    const patternId = this.trajectoryMap.get(trajectoryId);
    return patternId ? this.patterns.get(patternId) : undefined;
  }

  /**
   * Associate trajectory ID with pattern ID
   */
  associateTrajectory(trajectoryId: number, patternId: string): void {
    this.trajectoryMap.set(trajectoryId, patternId);
  }

  /**
   * Update pattern
   */
  update(id: string, updates: Partial<QESONAPattern>): boolean {
    const pattern = this.patterns.get(id);
    if (!pattern) return false;

    this.patterns.set(id, { ...pattern, ...updates });
    return true;
  }

  /**
   * Get all patterns
   */
  getAll(): QESONAPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get patterns by type
   */
  getByType(type: QEPatternType): QESONAPattern[] {
    return Array.from(this.patterns.values()).filter(p => p.type === type);
  }

  /**
   * Get patterns by domain
   */
  getByDomain(domain: DomainName): QESONAPattern[] {
    return Array.from(this.patterns.values()).filter(p => p.domain === domain);
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.trajectoryMap.clear();
  }

  /**
   * Get size
   */
  size(): number {
    return this.patterns.size;
  }
}

// ============================================================================
// Main QE SONA Wrapper Class
// ============================================================================

/**
 * QE SONA Wrapper for @ruvector/sona
 *
 * Provides QE-specific interface on top of @ruvector/sona's Rust/NAPI implementation.
 * Maintains backward compatibility with existing QE SONA code.
 */
export class QESONA {
  private engine: SonaEngine;
  private registry: QESONAPatternRegistry;
  private config: QESONAConfig;
  private adaptationTimes: number[] = [];
  private cacheHits: number = 0;
  private totalAdaptations: number = 0;

  constructor(config: Partial<QESONAConfig> = {}) {
    this.config = { ...DEFAULT_QE_SONA_CONFIG, ...config };

    // Initialize @ruvector/sona engine with config
    const jsConfig = {
      hiddenDim: this.config.hiddenDim,
      embeddingDim: this.config.embeddingDim,
      microLoraRank: this.config.microLoraRank,
      baseLoraRank: this.config.baseLoraRank,
      microLoraLr: this.config.microLoraLr,
      baseLoraLr: this.config.baseLoraLr,
      ewcLambda: this.config.ewcLambda,
      patternClusters: this.config.patternClusters,
      trajectoryCapacity: this.config.trajectoryCapacity,
      backgroundIntervalMs: this.config.backgroundIntervalMs,
      qualityThreshold: this.config.qualityThreshold,
      enableSimd: this.config.enableSimd,
    };

    this.engine = SonaEngine.withConfig(jsConfig);
    this.registry = new QESONAPatternRegistry(this.config.maxPatterns ?? 10000);
  }

  /**
   * Adapt pattern based on context - leverages @ruvector/sona's fast pattern matching
   *
   * Performance: <0.05ms target via Rust/NAPI implementation
   */
  async adaptPattern(
    state: RLState,
    patternType: QEPatternType,
    domain: DomainName
  ): Promise<QESONAAdaptationResult> {
    const startTime = performance.now();

    try {
      // Create state embedding for @ruvector/sona
      const stateEmbedding = this.createStateEmbedding(state);

      // Use @ruvector/sona's findPatterns for fast similarity search
      const rawPatterns = this.engine.findPatterns(stateEmbedding, 5);

      // Convert to QE patterns and filter by type/domain/confidence
      const matchingPatterns: Array<{ pattern: QESONAPattern; similarity: number }> = [];

      for (const raw of rawPatterns) {
        // Find corresponding QE pattern (or create on-the-fly from raw)
        let qePattern = this.findByRawPattern(raw);

        if (!qePattern) {
          // Create QE pattern from raw @ruvector/sona pattern
          qePattern = this.createQEPatternFromRaw(raw, patternType, domain);
        }

        // Filter by type, domain, and confidence
        if (qePattern.type === patternType &&
            qePattern.domain === domain &&
            qePattern.confidence >= (this.config.minConfidence ?? 0.5)) {
          // Calculate similarity from centroid distance
          const similarity = this.calculateSimilarity(stateEmbedding, raw.centroid);
          matchingPatterns.push({ pattern: qePattern, similarity });
        }
      }

      if (matchingPatterns.length === 0) {
        const adaptationTimeMs = performance.now() - startTime;
        this.recordAdaptation(adaptationTimeMs);

        return {
          success: false,
          pattern: null,
          adaptationTimeMs,
          similarity: 0,
          reasoning: 'No suitable pattern found',
        };
      }

      // Return best matching pattern
      const bestMatch = matchingPatterns[0];

      // Update pattern usage
      const updatedPattern = {
        ...bestMatch.pattern,
        usageCount: bestMatch.pattern.usageCount + 1,
        lastUsedAt: new Date(),
      };

      this.registry.update(updatedPattern.id, updatedPattern);

      const adaptationTimeMs = performance.now() - startTime;
      this.recordAdaptation(adaptationTimeMs);

      return {
        success: true,
        pattern: updatedPattern,
        adaptationTimeMs,
        similarity: bestMatch.similarity,
        reasoning: `Pattern adapted from @ruvector/sona with ${bestMatch.similarity.toFixed(3)} similarity`,
      };
    } catch (error) {
      const adaptationTimeMs = performance.now() - startTime;
      this.recordAdaptation(adaptationTimeMs);

      return {
        success: false,
        pattern: null,
        adaptationTimeMs,
        similarity: 0,
        reasoning: `Adaptation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Recall pattern for given context
   */
  recallPattern(
    context: RLState,
    patternType: QEPatternType,
    domain: DomainName
  ): QESONAPattern | null {
    const stateEmbedding = this.createStateEmbedding(context);
    const rawPatterns = this.engine.findPatterns(stateEmbedding, 1);

    for (const raw of rawPatterns) {
      const qePattern = this.findByRawPattern(raw);
      if (qePattern && qePattern.type === patternType && qePattern.domain === domain) {
        return qePattern;
      }
    }

    return null;
  }

  /**
   * Store pattern in memory using @ruvector/sona's trajectory learning
   */
  storePattern(pattern: QESONAPattern): void {
    // Register in QE registry
    this.registry.register(pattern);

    // Create trajectory in @ruvector/sona for learning
    const trajectoryId = this.engine.beginTrajectory(pattern.stateEmbedding);

    // Add trajectory step with action embedding
    const actionEmbedding = this.createActionEmbedding(pattern.action);
    const attentionWeights = new Array(actionEmbedding.length).fill(1.0);
    const reward = pattern.outcome.success ? pattern.outcome.quality : -pattern.outcome.quality;

    this.engine.addTrajectoryStep(trajectoryId, actionEmbedding, attentionWeights, reward);

    // End trajectory to trigger learning
    this.engine.endTrajectory(trajectoryId, pattern.outcome.quality);

    // Associate trajectory with pattern
    this.registry.associateTrajectory(trajectoryId, pattern.id);
  }

  /**
   * Store multiple patterns in batch
   */
  storePatternsBatch(patterns: QESONAPattern[]): void {
    for (const pattern of patterns) {
      this.storePattern(pattern);
    }
  }

  /**
   * Create and store a new pattern from experience
   */
  createPattern(
    state: RLState,
    action: RLAction,
    outcome: QESONAPattern['outcome'],
    type: QEPatternType,
    domain: DomainName,
    metadata?: Record<string, unknown>
  ): QESONAPattern {
    const pattern: QESONAPattern = {
      id: `qesona-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      domain,
      stateEmbedding: this.createStateEmbedding(state),
      action,
      outcome,
      confidence: 0.5,
      usageCount: 0,
      createdAt: new Date(),
      metadata,
    };

    this.storePattern(pattern);
    return pattern;
  }

  /**
   * Update pattern with feedback
   */
  updatePattern(patternId: string, success: boolean, quality: number): boolean {
    const pattern = this.registry.get(patternId);
    if (!pattern) return false;

    // Update confidence using reward signal
    const reward = success ? quality : -quality;
    const learningRate = 0.1;
    const newConfidence = pattern.confidence + learningRate * (reward - pattern.confidence);

    const updated = {
      ...pattern,
      confidence: Math.max(0, Math.min(1, newConfidence)),
      usageCount: pattern.usageCount + 1,
      lastUsedAt: new Date(),
    };

    return this.registry.update(patternId, updated);
  }

  /**
   * Apply Micro-LoRA transformation (from @ruvector/sona)
   */
  applyMicroLora(input: number[]): number[] {
    return this.engine.applyMicroLora(input);
  }

  /**
   * Apply Base-LoRA transformation for specific layer (from @ruvector/sona)
   */
  applyBaseLora(layerIdx: number, input: number[]): number[] {
    return this.engine.applyBaseLora(layerIdx, input);
  }

  /**
   * Force background learning cycle (from @ruvector/sona)
   */
  forceLearn(): string {
    return this.engine.forceLearn();
  }

  /**
   * Run background learning cycle if due (from @ruvector/sona)
   */
  tick(): string | null {
    return this.engine.tick();
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): QESONAPattern[] {
    return this.registry.getAll();
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: QEPatternType): QESONAPattern[] {
    return this.registry.getByType(type);
  }

  /**
   * Get patterns by domain
   */
  getPatternsByDomain(domain: DomainName): QESONAPattern[] {
    return this.registry.getByDomain(domain);
  }

  /**
   * Get statistics
   */
  getStats(): QESONAStats {
    const allPatterns = this.registry.getAll();
    const engineStats = this.engine.getStats();

    const patternsByType: Record<QEPatternType, number> = {
      'test-generation': 0,
      'defect-prediction': 0,
      'coverage-optimization': 0,
      'quality-assessment': 0,
      'resource-allocation': 0,
    };

    for (const pattern of allPatterns) {
      patternsByType[pattern.type]++;
    }

    return {
      totalPatterns: allPatterns.length,
      patternsByType,
      avgAdaptationTimeMs: this.avgAdaptationTime(),
      minAdaptationTimeMs: this.minAdaptationTime(),
      maxAdaptationTimeMs: this.maxAdaptationTime(),
      totalAdaptations: this.totalAdaptations,
      cacheHitRate: this.totalAdaptations > 0 ? this.cacheHits / this.totalAdaptations : 0,
      engineStats,
    };
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.registry.clear();
    this.adaptationTimes = [];
    this.cacheHits = 0;
    this.totalAdaptations = 0;
  }

  /**
   * Export all patterns
   */
  exportPatterns(): QESONAPattern[] {
    return this.registry.getAll();
  }

  /**
   * Import patterns
   */
  importPatterns(patterns: QESONAPattern[]): void {
    this.clear();
    this.storePatternsBatch(patterns);
  }

  /**
   * Get configuration
   */
  getConfig(): QESONAConfig {
    return { ...this.config };
  }

  /**
   * Enable/disable the engine
   */
  setEnabled(enabled: boolean): void {
    this.engine.setEnabled(enabled);
  }

  /**
   * Check if engine is enabled
   */
  isEnabled(): boolean {
    return this.engine.isEnabled();
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Create state embedding from RL state
   */
  private createStateEmbedding(state: RLState): number[] {
    const features = state.features;

    if (features.length === 0) {
      return new Array(this.config.embeddingDim ?? 384).fill(0);
    }

    // Normalize features
    const max = Math.max(...features.map(Math.abs));
    if (max === 0) {
      return [...features];
    }

    const normalized = features.map((f) => f / max);
    const dimension = this.config.embeddingDim ?? 384;

    if (normalized.length >= dimension) {
      return normalized.slice(0, dimension);
    }

    // Pad with zeros
    return [...normalized, ...new Array(dimension - normalized.length).fill(0)];
  }

  /**
   * Create action embedding for trajectory steps
   */
  private createActionEmbedding(action: RLAction): number[] {
    const embedding: number[] = [];

    // Encode action type
    const typeHash = this.hashCode(action.type);
    embedding.push((typeHash % 1000) / 1000);

    // Encode action value if number
    if (typeof action.value === 'number') {
      embedding.push(Math.min(1, Math.max(-1, action.value)));
    } else if (typeof action.value === 'string') {
      const valueHash = this.hashCode(action.value);
      embedding.push((valueHash % 1000) / 1000);
    } else if (Array.isArray(action.value)) {
      for (const v of action.value.slice(0, 10)) {
        if (typeof v === 'number') {
          embedding.push(Math.min(1, Math.max(-1, v)));
        }
      }
    }

    // Pad to embedding dimension
    const dimension = this.config.embeddingDim ?? 384;
    while (embedding.length < dimension) {
      embedding.push(0);
    }

    return embedding.slice(0, dimension);
  }

  /**
   * Find QE pattern by raw @ruvector/sona pattern
   */
  private findByRawPattern(raw: { id: string }): QESONAPattern | undefined {
    // Try to find by centroid similarity
    const allPatterns = this.registry.getAll();

    for (const pattern of allPatterns) {
      if (pattern.rawPattern?.patternType === raw.id) {
        return pattern;
      }
    }

    return undefined;
  }

  /**
   * Create QE pattern from raw @ruvector/sona pattern
   */
  private createQEPatternFromRaw(
    raw: { id: string; centroid: number[]; avgQuality: number; patternType: string },
    type: QEPatternType,
    domain: DomainName
  ): QESONAPattern {
    // Create a complete raw pattern with all required fields
    const completeRawPattern: QESONAPattern['rawPattern'] = {
      centroid: raw.centroid,
      clusterSize: 1,
      totalWeight: 1.0,
      avgQuality: raw.avgQuality,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
      patternType: raw.patternType,
    };

    return {
      id: `qesona-${raw.id}`,
      type,
      domain,
      stateEmbedding: raw.centroid,
      action: { type: 'learned', value: raw.patternType },
      outcome: {
        reward: raw.avgQuality,
        success: raw.avgQuality > 0.5,
        quality: raw.avgQuality,
      },
      confidence: raw.avgQuality,
      usageCount: 0,
      createdAt: new Date(),
      rawPattern: completeRawPattern,
    };
  }

  /**
   * Calculate similarity between embeddings
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    const len = Math.min(embedding1.length, embedding2.length);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < len; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const cosineSimilarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2) + 1e-10);
    return (cosineSimilarity + 1) / 2; // Normalize to [0, 1]
  }

  /**
   * Simple hash function for strings
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash | 0;
    }
    return Math.abs(hash);
  }

  /**
   * Record adaptation time
   */
  private recordAdaptation(timeMs: number): void {
    this.adaptationTimes.push(timeMs);
    this.totalAdaptations++;

    if (this.adaptationTimes.length > 1000) {
      this.adaptationTimes.shift();
    }
  }

  /**
   * Calculate average adaptation time
   */
  private avgAdaptationTime(): number {
    if (this.adaptationTimes.length === 0) return 0;
    const sum = this.adaptationTimes.reduce((a, b) => a + b, 0);
    return sum / this.adaptationTimes.length;
  }

  /**
   * Get minimum adaptation time
   */
  private minAdaptationTime(): number {
    if (this.adaptationTimes.length === 0) return 0;
    return Math.min(...this.adaptationTimes);
  }

  /**
   * Get maximum adaptation time
   */
  private maxAdaptationTime(): number {
    if (this.adaptationTimes.length === 0) return 0;
    return Math.max(...this.adaptationTimes);
  }

  /**
   * Verify performance target
   */
  async verifyPerformance(iterations: number = 1000): Promise<{
    targetMet: boolean;
    avgTimeMs: number;
    minTimeMs: number;
    maxTimeMs: number;
    details: Array<{ iteration: number; timeMs: number }>;
  }> {
    const details: Array<{ iteration: number; timeMs: number }> = [];

    const testState: RLState = {
      id: 'test-state',
      features: new Array(384).fill(0).map(() => Math.random()),
    };

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await this.adaptPattern(testState, 'test-generation', 'test-generation');
      const endTime = performance.now();

      details.push({
        iteration: i,
        timeMs: endTime - startTime,
      });
    }

    const times = details.map((d) => d.timeMs);
    const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    const minTimeMs = Math.min(...times);
    const maxTimeMs = Math.max(...times);

    return {
      targetMet: avgTimeMs < 0.05,
      avgTimeMs,
      minTimeMs,
      maxTimeMs,
      details,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a QE SONA instance with default configuration
 */
export function createQESONA(config?: Partial<QESONAConfig>): QESONA {
  return new QESONA(config);
}

/**
 * Create a QE SONA instance for a specific domain
 */
export function createDomainQESONA(
  domain: DomainName,
  config?: Partial<QESONAConfig>
): QESONA {
  return new QESONA({
    ...config,
    maxPatterns: config?.maxPatterns || 5000,
  });
}
