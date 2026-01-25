/**
 * Agentic QE v3 - Causal Root Cause Analyzer Service
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 *
 * Integrates the causal discovery engine with the defect-intelligence domain
 * to provide automated, learning-based root cause analysis.
 */

import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  CausalDiscoveryEngine,
  TestEvent,
  TestEventType,
  RootCauseAnalysis as CausalRootCauseAnalysis,
  CausalSummary,
  CausalDiscoveryConfig,
} from '../../../causal-discovery';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Configuration for the causal root cause analyzer
 */
export interface CausalRootCauseAnalyzerConfig {
  /** Namespace for memory storage */
  namespace: string;

  /** Whether to auto-persist learned patterns */
  autoPersist: boolean;

  /** Persistence interval in milliseconds */
  persistIntervalMs: number;

  /** Causal discovery configuration */
  causalConfig: Partial<CausalDiscoveryConfig>;

  /** Minimum confidence for analysis results */
  minConfidence: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CAUSAL_ANALYZER_CONFIG: CausalRootCauseAnalyzerConfig = {
  namespace: 'defect-intelligence:causal',
  autoPersist: true,
  persistIntervalMs: 5 * 60 * 1000, // 5 minutes
  causalConfig: {
    timeWindow: 100, // 100ms for test events
    learningRate: 0.02,
    minObservations: 10,
  },
  minConfidence: 0.3,
};

/**
 * Request for causal root cause analysis
 */
export interface CausalAnalysisRequest {
  /** The event type to analyze (what happened?) */
  targetEvent: TestEventType;

  /** Optional: specific test or file context */
  context?: {
    testId?: string;
    file?: string;
    environment?: string;
  };

  /** Include indirect causes in analysis */
  includeIndirect?: boolean;

  /** Maximum intervention points to return */
  maxInterventions?: number;
}

/**
 * Response from causal root cause analysis
 */
export interface CausalAnalysisResponse {
  /** The analyzed event */
  targetEvent: TestEventType;

  /** Most likely root cause */
  rootCause: {
    event: TestEventType;
    strength: number;
    confidence: number;
  } | null;

  /** All direct causes ranked by strength */
  directCauses: Array<{
    event: TestEventType;
    strength: number;
    observations: number;
  }>;

  /** Indirect causes with paths */
  indirectCauses: Array<{
    event: TestEventType;
    strength: number;
    path: TestEventType[];
  }>;

  /** Recommended intervention points */
  interventions: Array<{
    event: TestEventType;
    score: number;
    reason: string;
  }>;

  /** Overall confidence in the analysis */
  confidence: number;

  /** Number of observations used */
  observationCount: number;

  /** Human-readable summary */
  summary: string;
}

/**
 * Service interface for causal root cause analysis
 */
export interface ICausalRootCauseAnalyzerService {
  /** Observe a test event for learning */
  observeEvent(event: TestEvent): void;

  /** Observe a batch of events */
  observeEvents(events: TestEvent[]): void;

  /** Analyze root cause of a target event */
  analyzeRootCause(request: CausalAnalysisRequest): Promise<Result<CausalAnalysisResponse, Error>>;

  /** Get the current causal summary */
  getSummary(): CausalSummary;

  /** Predict likely causes for an event type */
  predictCauses(eventType: TestEventType): TestEventType[];

  /** Persist learned patterns to memory */
  persist(): Promise<Result<void, Error>>;

  /** Restore learned patterns from memory */
  restore(): Promise<Result<void, Error>>;

  /** Reset all learned patterns */
  reset(): void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Causal Root Cause Analyzer Service
 *
 * Uses STDP-based causal discovery to learn relationships between events
 * and provide intelligent root cause analysis.
 */
export class CausalRootCauseAnalyzerService implements ICausalRootCauseAnalyzerService {
  private readonly engine: CausalDiscoveryEngine;
  private readonly config: CausalRootCauseAnalyzerConfig;
  private lastPersist: number = 0;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<CausalRootCauseAnalyzerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CAUSAL_ANALYZER_CONFIG, ...config };
    this.engine = new CausalDiscoveryEngine(this.config.causalConfig);
  }

  /**
   * Observe a single test event for learning
   */
  observeEvent(event: TestEvent): void {
    this.engine.observe(event);

    // Auto-persist if enabled and interval has passed
    if (this.config.autoPersist) {
      const now = Date.now();
      if (now - this.lastPersist > this.config.persistIntervalMs) {
        this.persist().catch(console.error);
        this.lastPersist = now;
      }
    }
  }

  /**
   * Observe a batch of events
   */
  observeEvents(events: TestEvent[]): void {
    this.engine.observeBatch(events);
  }

  /**
   * Analyze root cause of a target event
   */
  async analyzeRootCause(
    request: CausalAnalysisRequest
  ): Promise<Result<CausalAnalysisResponse, Error>> {
    try {
      const analysis = this.engine.analyzeRootCause(request.targetEvent);

      // Check minimum confidence
      if (analysis.confidence < this.config.minConfidence && analysis.observationCount < 10) {
        return ok({
          targetEvent: request.targetEvent,
          rootCause: null,
          directCauses: [],
          indirectCauses: [],
          interventions: [],
          confidence: analysis.confidence,
          observationCount: analysis.observationCount,
          summary: `Insufficient data for analysis. Observed ${analysis.observationCount} events. Need more observations to establish causal patterns.`,
        });
      }

      // Find the most likely root cause
      const rootCause =
        analysis.directCauses.length > 0
          ? {
              event: analysis.directCauses[0].event,
              strength: analysis.directCauses[0].strength,
              confidence: analysis.confidence,
            }
          : null;

      // Map direct causes
      const directCauses = analysis.directCauses.map(c => ({
        event: c.event,
        strength: c.strength,
        observations: c.observations,
      }));

      // Map indirect causes if requested
      const indirectCauses = request.includeIndirect !== false
        ? analysis.indirectCauses.map(c => ({
            event: c.event,
            strength: c.strength,
            path: c.path,
          }))
        : [];

      // Map interventions
      const maxInterventions = request.maxInterventions ?? 5;
      const interventions = analysis.interventionPoints
        .slice(0, maxInterventions)
        .map(p => ({
          event: p.event,
          score: p.score,
          reason: p.reason,
        }));

      // Generate summary
      const summary = this.generateSummary(request.targetEvent, analysis);

      return ok({
        targetEvent: request.targetEvent,
        rootCause,
        directCauses,
        indirectCauses,
        interventions,
        confidence: analysis.confidence,
        observationCount: analysis.observationCount,
        summary,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate a human-readable summary of the analysis
   */
  private generateSummary(
    target: TestEventType,
    analysis: CausalRootCauseAnalysis
  ): string {
    const parts: string[] = [];

    if (analysis.directCauses.length === 0) {
      return `No significant causal patterns detected for ${target}. ${analysis.observationCount} events observed.`;
    }

    // Main cause
    const topCause = analysis.directCauses[0];
    parts.push(
      `The most likely cause of ${target} is ${topCause.event} (${(topCause.strength * 100).toFixed(1)}% strength).`
    );

    // Secondary causes
    if (analysis.directCauses.length > 1) {
      const others = analysis.directCauses.slice(1, 3).map(c => c.event);
      parts.push(`Other contributing factors: ${others.join(', ')}.`);
    }

    // Intervention recommendation
    if (analysis.interventionPoints.length > 0) {
      const topIntervention = analysis.interventionPoints[0];
      parts.push(
        `Recommended intervention point: ${topIntervention.event} (${topIntervention.reason}).`
      );
    }

    // Confidence
    const confidenceLevel =
      analysis.confidence > 0.7 ? 'high' : analysis.confidence > 0.4 ? 'moderate' : 'low';
    parts.push(`Analysis confidence: ${confidenceLevel} (${(analysis.confidence * 100).toFixed(0)}%).`);

    return parts.join(' ');
  }

  /**
   * Get summary statistics
   */
  getSummary(): CausalSummary {
    return this.engine.getSummary();
  }

  /**
   * Predict likely causes for an event type
   */
  predictCauses(eventType: TestEventType): TestEventType[] {
    return this.engine.predictCauses(eventType);
  }

  /**
   * Predict what events might be caused by a source event
   */
  predictEffects(eventType: TestEventType): TestEventType[] {
    return this.engine.predictEffects(eventType);
  }

  /**
   * Persist learned patterns to memory
   */
  async persist(): Promise<Result<void, Error>> {
    try {
      const state = this.engine.toJSON();
      await this.memory.set(`${this.config.namespace}:state`, state, {
        namespace: 'defect-intelligence',
        persist: true,
      });
      this.lastPersist = Date.now();
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Restore learned patterns from memory
   */
  async restore(): Promise<Result<void, Error>> {
    try {
      const state = await this.memory.get<{
        config?: Partial<CausalDiscoveryConfig>;
        weights?: Record<string, unknown>;
        history?: TestEvent[];
        firstEventTime?: number;
        lastEventTime?: number;
      }>(`${this.config.namespace}:state`);

      if (state) {
        // Restore the engine state
        const restoredEngine = CausalDiscoveryEngine.fromJSON(state);
        // Copy state to our engine by observing the history
        if (state.history) {
          this.engine.observeBatch(state.history);
        }
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Reset all learned patterns
   */
  reset(): void {
    this.engine.reset();
  }

  /**
   * Apply decay to prevent weight explosion
   */
  decay(): void {
    this.engine.decay();
  }

  /**
   * Get the observation count
   */
  getObservationCount(): number {
    return this.engine.getObservationCount();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a causal root cause analyzer with default configuration
 */
export function createCausalRootCauseAnalyzer(
  memory: MemoryBackend,
  config: Partial<CausalRootCauseAnalyzerConfig> = {}
): CausalRootCauseAnalyzerService {
  return new CausalRootCauseAnalyzerService(memory, config);
}

// ============================================================================
// Event Helpers
// ============================================================================

/**
 * Create a test event from common test scenarios
 */
export function createTestEvent(
  type: TestEventType,
  options: {
    testId?: string;
    file?: string;
    data?: Record<string, unknown>;
  } = {}
): TestEvent {
  return {
    type,
    timestamp: Date.now(),
    testId: options.testId,
    file: options.file,
    data: options.data,
    id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

/**
 * Convert test execution results to causal events
 */
export function testResultToEvents(result: {
  testId: string;
  file: string;
  passed: boolean;
  duration: number;
  error?: string;
}): TestEvent[] {
  const events: TestEvent[] = [];
  const baseTime = Date.now();

  events.push({
    type: 'test_started',
    timestamp: baseTime - result.duration,
    testId: result.testId,
    file: result.file,
  });

  if (result.passed) {
    events.push({
      type: 'test_passed',
      timestamp: baseTime,
      testId: result.testId,
      file: result.file,
      data: { duration: result.duration },
    });
  } else {
    // Determine failure type
    let failureType: TestEventType = 'test_failed';
    if (result.error?.includes('timeout')) {
      failureType = 'timeout';
    } else if (result.error?.includes('assert')) {
      failureType = 'assertion_failed';
    } else if (result.error?.includes('exception') || result.error?.includes('Error')) {
      failureType = 'exception';
    }

    events.push({
      type: failureType,
      timestamp: baseTime,
      testId: result.testId,
      file: result.file,
      data: { duration: result.duration, error: result.error },
    });
  }

  return events;
}
