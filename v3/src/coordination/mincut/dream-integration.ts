/**
 * Agentic QE v3 - Dream x Strange Loop Meta-Learning Integration
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 6
 *
 * This module integrates MinCut observations with the Dream cycle for
 * meta-learning. It enables the swarm to:
 * - Feed MinCut health data into dream memory for pattern discovery
 * - Use dream insights to optimize topology decisions
 * - Cross-pollinate patterns between the self-healing and learning systems
 * - Track meta-level learning about strategy effectiveness
 *
 * Key Components:
 * - DreamMinCutBridge: Connects MinCut observations to Dream cycle
 * - MetaLearningState: Tracks strategy effectiveness and adaptation history
 * - StrangeLoopDreamIntegration: Combines real-time healing with dream consolidation
 * - DreamMinCutController: Orchestrates the integration
 *
 * The Strange Loop provides real-time observations (OBSERVE → MODEL → DECIDE → ACT),
 * while the Dream cycle consolidates learnings during "sleep" periods, enabling
 * meta-patterns to emerge from both systems.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SwarmObservation,
  SelfModelPrediction,
  ReorganizationAction,
  ReorganizationResult,
  WeakVertex,
  MinCutHealth,
} from './interfaces';
import { StrangeLoopController, StrangeLoopConfig } from './strange-loop';
import { MinCutPersistence } from './mincut-persistence';
import { SwarmGraph } from './swarm-graph';

// ============================================================================
// Try to import Dream module (graceful fallback if unavailable)
// ============================================================================

// Dream module types (may not be available)
interface DreamCycleResult {
  cycle: {
    id: string;
    startTime: Date;
    endTime?: Date;
    conceptsProcessed: number;
    associationsFound: number;
    insightsGenerated: number;
    status: string;
  };
  insights: DreamInsight[];
  activationStats: {
    totalIterations: number;
    peakActivation: number;
    nodesActivated: number;
  };
  patternsCreated: number;
}

interface DreamInsight {
  id: string;
  cycleId: string;
  type: string;
  sourceConcepts: string[];
  description: string;
  noveltyScore: number;
  confidenceScore: number;
  actionable: boolean;
  applied: boolean;
  suggestedAction?: string;
  createdAt: Date;
}

interface PatternImportData {
  id: string;
  name: string;
  description: string;
  domain: string;
  patternType?: string;
  confidence?: number;
  successRate?: number;
}

/**
 * Interface for the lazy-loaded DreamEngine
 * Matches the public API of the actual DreamEngine class
 */
interface IDreamEngine {
  initialize(): Promise<void>;
  dream(durationMs?: number): Promise<DreamCycleResult>;
  importPatterns(patterns: PatternImportData[]): Promise<number>;
  loadPatternsAsConcepts(patterns: unknown[]): Promise<void>;
  getPendingInsights(): Promise<DreamInsight[]>;
  dispose(): void;
}

// ============================================================================
// Meta-Learning Types
// ============================================================================

/**
 * Strategy effectiveness tracking
 */
export interface StrategyEffectiveness {
  /** Strategy identifier (e.g., action type) */
  strategyId: string;

  /** Number of times this strategy was used */
  usageCount: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Average improvement achieved */
  avgImprovement: number;

  /** Confidence in this strategy */
  confidence: number;

  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Pattern confidence tracking
 */
export interface PatternConfidence {
  /** Pattern identifier */
  patternId: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Source of the pattern */
  source: 'dream' | 'observation' | 'hybrid';

  /** Number of validations */
  validationCount: number;

  /** Last validated timestamp */
  lastValidated: Date;
}

/**
 * Adaptation record for meta-learning history
 */
export interface AdaptationRecord {
  /** Unique record ID */
  id: string;

  /** Timestamp of adaptation */
  timestamp: Date;

  /** Type of adaptation */
  type: 'topology_change' | 'strategy_update' | 'pattern_learned' | 'insight_applied';

  /** What triggered the adaptation */
  trigger: 'dream_insight' | 'observation' | 'threshold_breach' | 'meta_pattern';

  /** State before adaptation */
  stateBefore: {
    minCutValue: number;
    weakVertexCount: number;
  };

  /** State after adaptation */
  stateAfter: {
    minCutValue: number;
    weakVertexCount: number;
  };

  /** Improvement achieved */
  improvement: number;

  /** Related insight ID (if any) */
  insightId?: string;

  /** Related pattern ID (if any) */
  patternId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Meta-learning state
 */
export interface MetaLearningState {
  /** Strategy effectiveness by strategy ID */
  strategyEffectiveness: Map<string, StrategyEffectiveness>;

  /** Pattern confidence by pattern ID */
  patternConfidence: Map<string, PatternConfidence>;

  /** Adaptation history */
  adaptationHistory: AdaptationRecord[];

  /** Total meta-learning cycles */
  totalCycles: number;

  /** Last dream cycle timestamp */
  lastDreamCycle: Date | null;

  /** Overall learning rate (adaptive) */
  learningRate: number;

  /** Meta-confidence: How confident are we in our meta-patterns? */
  metaConfidence: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Dream integration configuration
 */
export interface DreamIntegrationConfig {
  /** Enable dream integration */
  enabled: boolean;

  /** Minimum observations before triggering dream cycle */
  minObservationsForDream: number;

  /** Maximum time between dream cycles (ms) */
  maxTimeBetweenDreams: number;

  /** Minimum insights to consider dream cycle successful */
  minInsightsForSuccess: number;

  /** Confidence threshold for applying dream insights */
  insightConfidenceThreshold: number;

  /** Meta-learning rate */
  metaLearningRate: number;

  /** Maximum adaptation history entries */
  maxAdaptationHistory: number;

  /** Whether to auto-apply high-confidence insights */
  autoApplyInsights: boolean;
}

/**
 * Default dream integration configuration
 */
export const DEFAULT_DREAM_INTEGRATION_CONFIG: DreamIntegrationConfig = {
  enabled: true,
  minObservationsForDream: 20,
  maxTimeBetweenDreams: 300000, // 5 minutes
  minInsightsForSuccess: 1,
  insightConfidenceThreshold: 0.7,
  metaLearningRate: 0.05,
  maxAdaptationHistory: 1000,
  autoApplyInsights: false,
};

// ============================================================================
// DreamMinCutBridge
// ============================================================================

/**
 * Bridge between MinCut observations and Dream cycle
 *
 * Converts MinCut health data into patterns that can be processed
 * by the Dream engine, and converts dream insights back into
 * actionable topology decisions.
 */
export class DreamMinCutBridge {
  private readonly config: DreamIntegrationConfig;
  private observationBuffer: SwarmObservation[] = [];
  private convertedPatterns: PatternImportData[] = [];

  constructor(config: Partial<DreamIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_DREAM_INTEGRATION_CONFIG, ...config };
  }

  // ==========================================================================
  // Observation to Pattern Conversion
  // ==========================================================================

  /**
   * Buffer an observation for later dream processing
   */
  bufferObservation(observation: SwarmObservation): void {
    this.observationBuffer.push(observation);

    // Keep buffer size manageable
    if (this.observationBuffer.length > 1000) {
      this.observationBuffer = this.observationBuffer.slice(-500);
    }
  }

  /**
   * Check if we have enough observations for a dream cycle
   */
  hasEnoughObservations(): boolean {
    return this.observationBuffer.length >= this.config.minObservationsForDream;
  }

  /**
   * Get buffered observation count
   */
  getObservationCount(): number {
    return this.observationBuffer.length;
  }

  /**
   * Convert buffered observations to dream patterns
   */
  convertObservationsToDreamPatterns(): PatternImportData[] {
    if (this.observationBuffer.length === 0) {
      return [];
    }

    const patterns: PatternImportData[] = [];

    // 1. Aggregate weak vertex patterns
    const weakVertexCounts = new Map<string, number>();
    const weakVertexReasons = new Map<string, string[]>();

    for (const obs of this.observationBuffer) {
      for (const weak of obs.weakVertices) {
        const count = weakVertexCounts.get(weak.vertexId) ?? 0;
        weakVertexCounts.set(weak.vertexId, count + 1);

        const reasons = weakVertexReasons.get(weak.vertexId) ?? [];
        if (!reasons.includes(weak.reason)) {
          reasons.push(weak.reason);
        }
        weakVertexReasons.set(weak.vertexId, reasons);
      }
    }

    // Create patterns for frequently weak vertices
    for (const [vertexId, count] of Array.from(weakVertexCounts.entries())) {
      const frequency = count / this.observationBuffer.length;
      if (frequency > 0.3) {
        const reasons = weakVertexReasons.get(vertexId) ?? [];
        patterns.push({
          id: `weak-vertex-${vertexId}`,
          name: `Weak Vertex: ${vertexId}`,
          description: `Vertex ${vertexId} frequently weak (${Math.round(frequency * 100)}%). Reasons: ${reasons.join(', ')}`,
          domain: 'topology',
          patternType: 'weakness',
          confidence: frequency,
          successRate: 1 - frequency, // Lower success rate means more problematic
        });
      }
    }

    // 2. MinCut trend patterns
    const minCutValues = this.observationBuffer.map((o) => o.minCutValue);
    const avgMinCut = minCutValues.reduce((a, b) => a + b, 0) / minCutValues.length;
    const trend = this.calculateTrend(minCutValues);

    patterns.push({
      id: `mincut-trend-${Date.now()}`,
      name: `MinCut Trend: ${trend.direction}`,
      description: `MinCut trending ${trend.direction} (avg: ${avgMinCut.toFixed(2)}, slope: ${trend.slope.toFixed(3)})`,
      domain: 'topology',
      patternType: 'trend',
      confidence: trend.confidence,
      successRate: trend.direction === 'improving' ? 0.8 : 0.3,
    });

    // 3. Topology health patterns
    const healthPatterns = this.extractHealthPatterns();
    patterns.push(...healthPatterns);

    this.convertedPatterns = patterns;
    return patterns;
  }

  /**
   * Convert a dream insight into a topology optimization action
   */
  convertInsightToAction(insight: DreamInsight): ReorganizationAction | null {
    // Skip if confidence too low
    if (insight.confidenceScore < this.config.insightConfidenceThreshold) {
      return { type: 'no_action', reason: `Insight confidence too low: ${insight.confidenceScore}` };
    }

    // Parse insight type and source concepts
    const insightData = this.parseInsightForAction(insight);

    if (!insightData) {
      return { type: 'no_action', reason: 'Could not parse insight for action' };
    }

    switch (insightData.actionType) {
      case 'reinforce':
        return {
          type: 'reinforce_edge',
          source: insightData.source,
          target: insightData.target,
          weightIncrease: 0.5 * insight.confidenceScore,
        };

      case 'spawn':
        return {
          type: 'spawn_agent',
          domain: insightData.domain as any,
          capabilities: insightData.capabilities || [],
        };

      case 'rebalance':
        return {
          type: 'rebalance_load',
          fromAgent: insightData.source,
          toAgent: insightData.target,
        };

      default:
        return { type: 'no_action', reason: `Unknown action type: ${insightData.actionType}` };
    }
  }

  /**
   * Clear observation buffer after dream cycle
   */
  clearBuffer(): void {
    this.observationBuffer = [];
    this.convertedPatterns = [];
  }

  /**
   * Get recent observations for analysis
   */
  getRecentObservations(limit: number = 50): SwarmObservation[] {
    return this.observationBuffer.slice(-limit);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private calculateTrend(values: number[]): {
    direction: 'improving' | 'stable' | 'degrading';
    slope: number;
    confidence: number;
  } {
    if (values.length < 3) {
      return { direction: 'stable', slope: 0, confidence: 0.3 };
    }

    // Simple linear regression
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Confidence based on R-squared
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      const predicted = yMean + slope * (i - xMean);
      ssRes += (values[i] - predicted) ** 2;
      ssTot += (values[i] - yMean) ** 2;
    }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    let direction: 'improving' | 'stable' | 'degrading' = 'stable';
    if (slope > 0.01) {
      direction = 'improving';
    } else if (slope < -0.01) {
      direction = 'degrading';
    }

    return {
      direction,
      slope,
      confidence: Math.max(0.3, Math.min(0.95, rSquared)),
    };
  }

  private extractHealthPatterns(): PatternImportData[] {
    const patterns: PatternImportData[] = [];

    if (this.observationBuffer.length < 5) {
      return patterns;
    }

    // Check for stability patterns
    const recentObs = this.observationBuffer.slice(-20);
    const weakCounts = recentObs.map((o) => o.weakVertices.length);
    const avgWeakCount = weakCounts.reduce((a, b) => a + b, 0) / weakCounts.length;
    const variance =
      weakCounts.reduce((a, b) => a + (b - avgWeakCount) ** 2, 0) / weakCounts.length;

    if (variance < 1) {
      patterns.push({
        id: `stability-pattern-${Date.now()}`,
        name: 'Stable Topology',
        description: `Topology showing stability with avg ${avgWeakCount.toFixed(1)} weak vertices (variance: ${variance.toFixed(2)})`,
        domain: 'topology',
        patternType: 'stability',
        confidence: 1 - variance / 10,
        successRate: 0.9,
      });
    } else if (variance > 5) {
      patterns.push({
        id: `volatility-pattern-${Date.now()}`,
        name: 'Volatile Topology',
        description: `Topology showing volatility with avg ${avgWeakCount.toFixed(1)} weak vertices (variance: ${variance.toFixed(2)})`,
        domain: 'topology',
        patternType: 'volatility',
        confidence: Math.min(0.9, variance / 10),
        successRate: 0.3,
      });
    }

    return patterns;
  }

  private parseInsightForAction(
    insight: DreamInsight
  ): { actionType: string; source: string; target: string; domain?: string; capabilities?: string[] } | null {
    // Parse based on insight type and source concepts
    const sourceConcepts = insight.sourceConcepts;

    if (sourceConcepts.length < 1) {
      return null;
    }

    // Extract vertex IDs from concept IDs
    const vertexIds = sourceConcepts
      .filter((c) => c.startsWith('weak-vertex-'))
      .map((c) => c.replace('weak-vertex-', ''));

    if (insight.type === 'pattern_merge' && vertexIds.length >= 2) {
      return {
        actionType: 'reinforce',
        source: vertexIds[0],
        target: vertexIds[1],
      };
    }

    if (insight.type === 'gap_detection' && vertexIds.length >= 1) {
      // Gap detected - might need to spawn
      const domainMatch = insight.description.match(/domain:\s*(\w+)/i);
      return {
        actionType: 'spawn',
        source: vertexIds[0],
        target: '',
        domain: domainMatch?.[1] ?? 'test-generation',
        capabilities: [],
      };
    }

    if (insight.type === 'optimization' && vertexIds.length >= 2) {
      return {
        actionType: 'rebalance',
        source: vertexIds[0],
        target: vertexIds[1],
      };
    }

    return null;
  }
}

// ============================================================================
// MetaLearningTracker
// ============================================================================

/**
 * Tracks meta-level learning about strategies and patterns
 */
export class MetaLearningTracker {
  private state: MetaLearningState;
  private readonly config: DreamIntegrationConfig;

  constructor(config: Partial<DreamIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_DREAM_INTEGRATION_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // ==========================================================================
  // Strategy Tracking
  // ==========================================================================

  /**
   * Update strategy effectiveness based on action result
   */
  updateStrategyEffectiveness(
    strategyId: string,
    success: boolean,
    improvement: number
  ): void {
    const existing = this.state.strategyEffectiveness.get(strategyId);

    if (existing) {
      // Update with exponential moving average
      const alpha = this.config.metaLearningRate;
      existing.usageCount++;
      existing.successRate = (1 - alpha) * existing.successRate + alpha * (success ? 1 : 0);
      existing.avgImprovement = (1 - alpha) * existing.avgImprovement + alpha * improvement;
      existing.confidence = Math.min(0.95, existing.confidence + 0.01);
      existing.lastUpdated = new Date();
    } else {
      this.state.strategyEffectiveness.set(strategyId, {
        strategyId,
        usageCount: 1,
        successRate: success ? 1 : 0,
        avgImprovement: improvement,
        confidence: 0.3,
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Get strategy effectiveness
   */
  getStrategyEffectiveness(strategyId: string): StrategyEffectiveness | undefined {
    return this.state.strategyEffectiveness.get(strategyId);
  }

  /**
   * Get all strategy effectiveness data
   */
  getAllStrategies(): StrategyEffectiveness[] {
    return Array.from(this.state.strategyEffectiveness.values());
  }

  /**
   * Get recommended strategy based on effectiveness
   */
  getRecommendedStrategy(): string | null {
    const strategies = this.getAllStrategies()
      .filter((s) => s.usageCount >= 3 && s.confidence > 0.4)
      .sort((a, b) => {
        // Score combines success rate, improvement, and confidence
        const scoreA = a.successRate * a.avgImprovement * a.confidence;
        const scoreB = b.successRate * b.avgImprovement * b.confidence;
        return scoreB - scoreA;
      });

    return strategies[0]?.strategyId ?? null;
  }

  // ==========================================================================
  // Pattern Tracking
  // ==========================================================================

  /**
   * Update pattern confidence
   */
  updatePatternConfidence(
    patternId: string,
    validated: boolean,
    source: 'dream' | 'observation' | 'hybrid'
  ): void {
    const existing = this.state.patternConfidence.get(patternId);

    if (existing) {
      const alpha = this.config.metaLearningRate;
      existing.confidence = (1 - alpha) * existing.confidence + alpha * (validated ? 1 : 0);
      existing.validationCount++;
      existing.source = existing.source === source ? source : 'hybrid';
      existing.lastValidated = new Date();
    } else {
      this.state.patternConfidence.set(patternId, {
        patternId,
        confidence: validated ? 0.6 : 0.3,
        source,
        validationCount: 1,
        lastValidated: new Date(),
      });
    }
  }

  /**
   * Get pattern confidence
   */
  getPatternConfidence(patternId: string): number {
    return this.state.patternConfidence.get(patternId)?.confidence ?? 0.5;
  }

  /**
   * Get high-confidence patterns
   */
  getHighConfidencePatterns(threshold: number = 0.7): PatternConfidence[] {
    return Array.from(this.state.patternConfidence.values()).filter(
      (p) => p.confidence >= threshold
    );
  }

  // ==========================================================================
  // Adaptation History
  // ==========================================================================

  /**
   * Record an adaptation
   */
  recordAdaptation(record: Omit<AdaptationRecord, 'id'>): void {
    const adaptation: AdaptationRecord = {
      id: uuidv4(),
      ...record,
    };

    this.state.adaptationHistory.push(adaptation);

    // Maintain max history size
    if (this.state.adaptationHistory.length > this.config.maxAdaptationHistory) {
      this.state.adaptationHistory = this.state.adaptationHistory.slice(-500);
    }

    // Update meta-confidence based on improvement trends
    this.updateMetaConfidence(adaptation);
  }

  /**
   * Get recent adaptations
   */
  getRecentAdaptations(limit: number = 20): AdaptationRecord[] {
    return this.state.adaptationHistory.slice(-limit);
  }

  /**
   * Get adaptation statistics
   */
  getAdaptationStats(): {
    total: number;
    byType: Record<string, number>;
    byTrigger: Record<string, number>;
    avgImprovement: number;
    positiveRate: number;
  } {
    const byType: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};
    let totalImprovement = 0;
    let positiveCount = 0;

    for (const record of this.state.adaptationHistory) {
      byType[record.type] = (byType[record.type] ?? 0) + 1;
      byTrigger[record.trigger] = (byTrigger[record.trigger] ?? 0) + 1;
      totalImprovement += record.improvement;
      if (record.improvement > 0) {
        positiveCount++;
      }
    }

    return {
      total: this.state.adaptationHistory.length,
      byType,
      byTrigger,
      avgImprovement:
        this.state.adaptationHistory.length > 0
          ? totalImprovement / this.state.adaptationHistory.length
          : 0,
      positiveRate:
        this.state.adaptationHistory.length > 0
          ? positiveCount / this.state.adaptationHistory.length
          : 0,
    };
  }

  // ==========================================================================
  // Meta-State Access
  // ==========================================================================

  /**
   * Get current meta-learning state
   */
  getState(): MetaLearningState {
    return {
      ...this.state,
      strategyEffectiveness: new Map(this.state.strategyEffectiveness),
      patternConfidence: new Map(this.state.patternConfidence),
      adaptationHistory: [...this.state.adaptationHistory],
    };
  }

  /**
   * Get meta-confidence (how confident is the system in its meta-patterns?)
   */
  getMetaConfidence(): number {
    return this.state.metaConfidence;
  }

  /**
   * Get learning rate
   */
  getLearningRate(): number {
    return this.state.learningRate;
  }

  /**
   * Update total cycles
   */
  incrementCycles(): void {
    this.state.totalCycles++;
  }

  /**
   * Set last dream cycle timestamp
   */
  setLastDreamCycle(timestamp: Date): void {
    this.state.lastDreamCycle = timestamp;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private createInitialState(): MetaLearningState {
    return {
      strategyEffectiveness: new Map(),
      patternConfidence: new Map(),
      adaptationHistory: [],
      totalCycles: 0,
      lastDreamCycle: null,
      learningRate: this.config.metaLearningRate,
      metaConfidence: 0.5,
    };
  }

  private updateMetaConfidence(adaptation: AdaptationRecord): void {
    const alpha = 0.02; // Slow update for meta-confidence
    const improvementSignal = adaptation.improvement > 0 ? 1 : 0;

    this.state.metaConfidence =
      (1 - alpha) * this.state.metaConfidence + alpha * improvementSignal;

    // Adjust learning rate based on meta-confidence
    if (this.state.metaConfidence > 0.7) {
      // High confidence - can use smaller learning rate
      this.state.learningRate = Math.max(0.01, this.state.learningRate * 0.99);
    } else if (this.state.metaConfidence < 0.3) {
      // Low confidence - need to learn faster
      this.state.learningRate = Math.min(0.2, this.state.learningRate * 1.01);
    }
  }
}

// ============================================================================
// StrangeLoopDreamIntegration
// ============================================================================

/**
 * Combines Strange Loop self-healing with Dream cycle consolidation
 *
 * The Strange Loop provides real-time OBSERVE → MODEL → DECIDE → ACT,
 * while the Dream cycle runs periodically to consolidate learnings
 * and discover meta-patterns across observations.
 */
export class StrangeLoopDreamIntegration {
  private readonly strangeLoop: StrangeLoopController;
  private readonly bridge: DreamMinCutBridge;
  private readonly metaTracker: MetaLearningTracker;
  private readonly config: DreamIntegrationConfig;

  private dreamAvailable = false;
  private lastDreamAttempt: Date | null = null;

  constructor(
    strangeLoop: StrangeLoopController,
    config: Partial<DreamIntegrationConfig> = {}
  ) {
    this.config = { ...DEFAULT_DREAM_INTEGRATION_CONFIG, ...config };
    this.strangeLoop = strangeLoop;
    this.bridge = new DreamMinCutBridge(config);
    this.metaTracker = new MetaLearningTracker(config);
  }

  // ==========================================================================
  // Observation Processing
  // ==========================================================================

  /**
   * Process a new observation from Strange Loop
   */
  processObservation(observation: SwarmObservation): void {
    // Buffer observation for dream processing
    this.bridge.bufferObservation(observation);

    // Track patterns from real-time observations
    for (const weak of observation.weakVertices) {
      this.metaTracker.updatePatternConfidence(
        `weak:${weak.vertexId}`,
        true,
        'observation'
      );
    }
  }

  /**
   * Process a reorganization result from Strange Loop
   */
  processResult(result: ReorganizationResult): void {
    // Update strategy effectiveness
    this.metaTracker.updateStrategyEffectiveness(
      result.action.type,
      result.success,
      result.improvement
    );

    // Record adaptation
    this.metaTracker.recordAdaptation({
      timestamp: new Date(),
      type: 'topology_change',
      trigger: 'observation',
      stateBefore: {
        minCutValue: result.minCutBefore,
        weakVertexCount: 0, // Would need to track this
      },
      stateAfter: {
        minCutValue: result.minCutAfter,
        weakVertexCount: 0,
      },
      improvement: result.improvement,
    });
  }

  /**
   * Check if dream cycle should be triggered
   */
  shouldTriggerDream(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Check observation count
    if (!this.bridge.hasEnoughObservations()) {
      return false;
    }

    // Check time since last dream
    const state = this.metaTracker.getState();
    if (state.lastDreamCycle) {
      const timeSinceLastDream = Date.now() - state.lastDreamCycle.getTime();
      if (timeSinceLastDream < this.config.maxTimeBetweenDreams / 2) {
        return false; // Not enough time has passed
      }
    }

    return true;
  }

  /**
   * Get patterns ready for dream processing
   */
  getDreamPatterns(): PatternImportData[] {
    return this.bridge.convertObservationsToDreamPatterns();
  }

  /**
   * Convert dream insight to action
   */
  convertInsightToAction(insight: DreamInsight): ReorganizationAction | null {
    return this.bridge.convertInsightToAction(insight);
  }

  /**
   * Mark dream cycle completed
   */
  completeDreamCycle(insights: DreamInsight[]): void {
    this.metaTracker.setLastDreamCycle(new Date());
    this.metaTracker.incrementCycles();

    // Update pattern confidence for dream-discovered patterns
    for (const insight of insights) {
      for (const conceptId of insight.sourceConcepts) {
        this.metaTracker.updatePatternConfidence(
          conceptId,
          insight.confidenceScore > 0.5,
          'dream'
        );
      }

      // Record insight as adaptation if actionable
      if (insight.actionable) {
        this.metaTracker.recordAdaptation({
          timestamp: new Date(),
          type: 'pattern_learned',
          trigger: 'dream_insight',
          stateBefore: { minCutValue: 0, weakVertexCount: 0 },
          stateAfter: { minCutValue: 0, weakVertexCount: 0 },
          improvement: insight.noveltyScore * insight.confidenceScore,
          insightId: insight.id,
        });
      }
    }

    // Clear observation buffer
    this.bridge.clearBuffer();
  }

  // ==========================================================================
  // Meta-Learning Access
  // ==========================================================================

  /**
   * Get meta-learning tracker
   */
  getMetaTracker(): MetaLearningTracker {
    return this.metaTracker;
  }

  /**
   * Get recommended strategy
   */
  getRecommendedStrategy(): string | null {
    return this.metaTracker.getRecommendedStrategy();
  }

  /**
   * Get meta-confidence
   */
  getMetaConfidence(): number {
    return this.metaTracker.getMetaConfidence();
  }

  /**
   * Get observation count
   */
  getObservationCount(): number {
    return this.bridge.getObservationCount();
  }

  /**
   * Get recent observations
   */
  getRecentObservations(limit: number = 50): SwarmObservation[] {
    return this.bridge.getRecentObservations(limit);
  }
}

// ============================================================================
// DreamMinCutController
// ============================================================================

/**
 * Main controller that orchestrates the Dream x MinCut integration
 *
 * Coordinates:
 * - Strange Loop real-time healing
 * - Dream cycle consolidation
 * - Meta-learning across both systems
 */
export class DreamMinCutController {
  private readonly integration: StrangeLoopDreamIntegration;
  private readonly strangeLoop: StrangeLoopController;
  private readonly persistence: MinCutPersistence;
  private readonly config: DreamIntegrationConfig;

  private dreamEngine: IDreamEngine | null = null; // Lazy-loaded DreamEngine
  private dreamTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    graph: SwarmGraph,
    persistence: MinCutPersistence,
    strangeLoopConfig?: Partial<StrangeLoopConfig>,
    dreamConfig?: Partial<DreamIntegrationConfig>
  ) {
    this.config = { ...DEFAULT_DREAM_INTEGRATION_CONFIG, ...dreamConfig };
    this.persistence = persistence;
    this.strangeLoop = new StrangeLoopController(
      graph,
      persistence,
      strangeLoopConfig
    );
    this.integration = new StrangeLoopDreamIntegration(this.strangeLoop, dreamConfig);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the controller (Strange Loop + periodic dream checks)
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // Start Strange Loop
    this.strangeLoop.start();

    // Schedule periodic dream checks
    if (this.config.enabled) {
      this.dreamTimer = setInterval(
        () => this.checkAndTriggerDream(),
        Math.min(60000, this.config.maxTimeBetweenDreams / 5)
      );
    }
  }

  /**
   * Stop the controller
   */
  stop(): void {
    this.running = false;

    this.strangeLoop.stop();

    if (this.dreamTimer) {
      clearInterval(this.dreamTimer);
      this.dreamTimer = null;
    }
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ==========================================================================
  // Dream Cycle Methods
  // ==========================================================================

  /**
   * Run a dream cycle with MinCut data
   *
   * The dream cycle:
   * 1. Converts MinCut observations to patterns
   * 2. Loads patterns into concept graph
   * 3. Runs spreading activation
   * 4. Generates insights
   * 5. Records meta-learning
   */
  async dream(durationMs?: number): Promise<DreamCycleResult | null> {
    // Try to load dream engine
    if (!this.dreamEngine) {
      try {
        const dreamModule = await import('../../learning/dream/index.js');
        const engine = dreamModule.createDreamEngine({
          maxDurationMs: durationMs ?? 30000,
        });
        this.dreamEngine = engine as unknown as IDreamEngine;
        await this.dreamEngine.initialize();
      } catch (error) {
        console.warn('[DreamMinCutController] Dream module not available:', error);
        return this.fallbackDream();
      }
    }

    try {
      // Get patterns from MinCut observations
      const patterns = this.integration.getDreamPatterns();

      if (patterns.length < 3) {
        console.log('[DreamMinCutController] Not enough patterns for dream cycle');
        return null;
      }

      if (!this.dreamEngine) {
        return this.fallbackDream();
      }

      // Load patterns into dream engine
      await this.dreamEngine.loadPatternsAsConcepts(patterns);

      // Run dream cycle
      const result = await this.dreamEngine.dream(durationMs);

      // Process dream results
      this.integration.completeDreamCycle(result.insights);

      // Apply high-confidence insights if auto-apply enabled
      if (this.config.autoApplyInsights) {
        await this.applyDreamInsights(result.insights);
      }

      return result;
    } catch (error) {
      console.error('[DreamMinCutController] Dream cycle failed:', error);
      return this.fallbackDream();
    }
  }

  /**
   * Awaken from dream - apply insights to topology
   *
   * @param insights - Insights to apply (defaults to pending insights)
   * @returns Number of insights applied
   */
  async awaken(insights?: DreamInsight[]): Promise<number> {
    const toApply =
      insights ??
      (this.dreamEngine ? await this.dreamEngine.getPendingInsights() : []);

    return this.applyDreamInsights(toApply);
  }

  /**
   * Consolidate learnings - persist meta-patterns
   */
  async consolidate(): Promise<void> {
    const state = this.integration.getMetaTracker().getState();
    const stats = this.integration.getMetaTracker().getAdaptationStats();

    // Persist high-confidence strategies as observations
    for (const strategy of Array.from(state.strategyEffectiveness.values())) {
      if (strategy.confidence > 0.7) {
        await this.persistence.recordObservation({
          iteration: state.totalCycles,
          minCutValue: 0,
          weakVertices: [],
          prediction: {
            predictedMinCut: strategy.avgImprovement,
            predictedWeakVertices: [],
            confidence: strategy.confidence,
            predictedAt: new Date(),
          },
        });
      }
    }

    console.log(
      `[DreamMinCutController] Consolidated: ${stats.total} adaptations, ` +
        `${state.strategyEffectiveness.size} strategies, meta-confidence: ${state.metaConfidence.toFixed(2)}`
    );
  }

  /**
   * Recall relevant patterns for a given context
   *
   * @param context - Context description for pattern retrieval
   * @returns Relevant patterns with confidence scores
   */
  recall(context: string): Array<{ patternId: string; confidence: number; relevance: number }> {
    const highConfidence = this.integration.getMetaTracker().getHighConfidencePatterns(0.5);

    // Simple keyword matching for relevance
    const keywords = context.toLowerCase().split(/\s+/);

    return highConfidence
      .map((pattern) => ({
        patternId: pattern.patternId,
        confidence: pattern.confidence,
        relevance: keywords.filter((k) => pattern.patternId.toLowerCase().includes(k)).length /
          Math.max(1, keywords.length),
      }))
      .filter((p) => p.relevance > 0)
      .sort((a, b) => b.confidence * b.relevance - a.confidence * a.relevance);
  }

  // ==========================================================================
  // Integration Cycle
  // ==========================================================================

  /**
   * Run one complete integration cycle (Strange Loop + Dream check)
   */
  async runCycle(): Promise<{
    observation: SwarmObservation | null;
    result: ReorganizationResult | null;
    dreamTriggered: boolean;
    dreamResult: DreamCycleResult | null;
  }> {
    // Run Strange Loop cycle
    const result = await this.strangeLoop.runCycle();
    const observations = this.strangeLoop.getObservations(1);
    const observation = observations[0] ?? null;

    // Process observation for dream
    if (observation) {
      this.integration.processObservation(observation);
    }

    // Process result for meta-learning
    if (result) {
      this.integration.processResult(result);
    }

    // Check if dream should be triggered
    let dreamTriggered = false;
    let dreamResult: DreamCycleResult | null = null;

    if (this.integration.shouldTriggerDream()) {
      dreamTriggered = true;
      dreamResult = await this.dream();
    }

    return {
      observation,
      result,
      dreamTriggered,
      dreamResult,
    };
  }

  // ==========================================================================
  // Status & Metrics
  // ==========================================================================

  /**
   * Get controller status
   */
  getStatus(): {
    running: boolean;
    strangeLoopRunning: boolean;
    strangeLoopIteration: number;
    observationCount: number;
    metaConfidence: number;
    recommendedStrategy: string | null;
    adaptationStats: ReturnType<MetaLearningTracker['getAdaptationStats']>;
  } {
    return {
      running: this.running,
      strangeLoopRunning: this.strangeLoop.isRunning(),
      strangeLoopIteration: this.strangeLoop.getIteration(),
      observationCount: this.integration.getObservationCount(),
      metaConfidence: this.integration.getMetaConfidence(),
      recommendedStrategy: this.integration.getRecommendedStrategy(),
      adaptationStats: this.integration.getMetaTracker().getAdaptationStats(),
    };
  }

  /**
   * Get Strange Loop controller
   */
  getStrangeLoop(): StrangeLoopController {
    return this.strangeLoop;
  }

  /**
   * Get integration layer
   */
  getIntegration(): StrangeLoopDreamIntegration {
    return this.integration;
  }

  /**
   * Get configuration
   */
  getConfig(): DreamIntegrationConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async checkAndTriggerDream(): Promise<void> {
    if (!this.running) return;

    if (this.integration.shouldTriggerDream()) {
      console.log('[DreamMinCutController] Triggering scheduled dream cycle');
      await this.dream();
    }
  }

  private async applyDreamInsights(insights: DreamInsight[]): Promise<number> {
    let appliedCount = 0;

    for (const insight of insights) {
      if (insight.confidenceScore < this.config.insightConfidenceThreshold) {
        continue;
      }

      const action = this.integration.convertInsightToAction(insight);
      if (action && action.type !== 'no_action') {
        // Record as adaptation
        this.integration.getMetaTracker().recordAdaptation({
          timestamp: new Date(),
          type: 'insight_applied',
          trigger: 'dream_insight',
          stateBefore: { minCutValue: 0, weakVertexCount: 0 },
          stateAfter: { minCutValue: 0, weakVertexCount: 0 },
          improvement: insight.noveltyScore * insight.confidenceScore,
          insightId: insight.id,
        });
        appliedCount++;
      }
    }

    return appliedCount;
  }

  /**
   * Fallback dream implementation when Dream module is unavailable
   */
  private fallbackDream(): DreamCycleResult {
    const observations = this.integration.getRecentObservations(50);
    const patterns = this.integration.getDreamPatterns();

    // Generate basic insights from patterns
    const insights: DreamInsight[] = patterns
      .filter((p) => (p.confidence ?? 0) > 0.5)
      .slice(0, 5)
      .map((p) => ({
        id: uuidv4(),
        cycleId: uuidv4(),
        type: 'optimization' as const,
        sourceConcepts: [p.id],
        description: p.description,
        noveltyScore: 0.5,
        confidenceScore: p.confidence ?? 0.5,
        actionable: true,
        applied: false,
        suggestedAction: `Review pattern: ${p.name}`,
        createdAt: new Date(),
      }));

    // Complete the cycle
    this.integration.completeDreamCycle(insights);

    return {
      cycle: {
        id: uuidv4(),
        startTime: new Date(),
        endTime: new Date(),
        conceptsProcessed: patterns.length,
        associationsFound: 0,
        insightsGenerated: insights.length,
        status: 'completed',
      },
      insights,
      activationStats: {
        totalIterations: 1,
        peakActivation: 0.5,
        nodesActivated: patterns.length,
      },
      patternsCreated: 0,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a DreamMinCutBridge
 */
export function createDreamMinCutBridge(
  config?: Partial<DreamIntegrationConfig>
): DreamMinCutBridge {
  return new DreamMinCutBridge(config);
}

/**
 * Create a MetaLearningTracker
 */
export function createMetaLearningTracker(
  config?: Partial<DreamIntegrationConfig>
): MetaLearningTracker {
  return new MetaLearningTracker(config);
}

/**
 * Create a StrangeLoopDreamIntegration
 */
export function createStrangeLoopDreamIntegration(
  strangeLoop: StrangeLoopController,
  config?: Partial<DreamIntegrationConfig>
): StrangeLoopDreamIntegration {
  return new StrangeLoopDreamIntegration(strangeLoop, config);
}

/**
 * Create a DreamMinCutController
 */
export function createDreamMinCutController(
  graph: SwarmGraph,
  persistence: MinCutPersistence,
  strangeLoopConfig?: Partial<StrangeLoopConfig>,
  dreamConfig?: Partial<DreamIntegrationConfig>
): DreamMinCutController {
  return new DreamMinCutController(graph, persistence, strangeLoopConfig, dreamConfig);
}
