/**
 * Agentic QE v3 - QE ReasoningBank Types
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Type definitions, configuration, and interfaces for the QE ReasoningBank.
 */

import type { QEPattern, QEPatternContext, QEDomain, ProgrammingLanguage, TestFramework, CreateQEPatternOptions } from './qe-patterns.js';
import type { QEGuidance } from './qe-guidance.js';
import { checkAntiPatterns } from './qe-guidance.js';
import type { PatternSearchOptions, PatternSearchResult } from './pattern-store.js';
import type { Result } from '../shared/types/index.js';
import type { RvfDualWriter } from '../integrations/ruvector/rvf-dual-writer.js';

// ============================================================================
// QEReasoningBank Configuration
// ============================================================================

/**
 * QEReasoningBank configuration
 */
export interface QEReasoningBankConfig {
  /** Enable pattern learning */
  enableLearning: boolean;

  /** Enable guidance generation */
  enableGuidance: boolean;

  /** Enable task routing */
  enableRouting: boolean;

  /** Embedding dimension (must match HNSW config) */
  embeddingDimension: number;

  /** Use ONNX embeddings (when available) */
  useONNXEmbeddings: boolean;

  /** Maximum patterns to consider for routing */
  maxRoutingCandidates: number;

  /** Weights for routing score calculation */
  routingWeights: {
    similarity: number;
    performance: number;
    capabilities: number;
  };

  /** Pattern store configuration */
  patternStore?: Partial<import('./pattern-store.js').PatternStoreConfig>;

  /** Coherence energy threshold for pattern promotion (ADR-052) */
  coherenceThreshold?: number;

  /** Optional RVF dual-writer for vector replication (Phase 3) */
  rvfDualWriter?: RvfDualWriter;
}

/**
 * Default configuration
 */
export const DEFAULT_QE_REASONING_BANK_CONFIG: QEReasoningBankConfig = {
  enableLearning: true,
  enableGuidance: true,
  enableRouting: true,
  embeddingDimension: 384, // Native all-MiniLM-L6-v2 dimension — no interpolation needed
  useONNXEmbeddings: true, // ADR-051: Enable ONNX embeddings by default
  maxRoutingCandidates: 10,
  routingWeights: {
    similarity: 0.3,
    performance: 0.4,
    capabilities: 0.3,
  },
  coherenceThreshold: 0.4, // ADR-052: Coherence gate threshold
};

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Task routing request
 */
export interface QERoutingRequest {
  /** Task description */
  task: string;

  /** Task type hint */
  taskType?: 'test-generation' | 'analysis' | 'debugging' | 'optimization';

  /** Target domain hint */
  domain?: QEDomain;

  /** Required capabilities */
  capabilities?: string[];

  /** Context for matching */
  context?: Partial<QEPatternContext>;
}

/**
 * Task routing result
 */
export interface QERoutingResult {
  /** Recommended agent type */
  recommendedAgent: string;

  /** Confidence in recommendation (0-1) */
  confidence: number;

  /** Alternative agent recommendations */
  alternatives: Array<{ agent: string; score: number }>;

  /** Detected QE domains */
  domains: QEDomain[];

  /** Relevant patterns found */
  patterns: QEPattern[];

  /** Generated guidance */
  guidance: string[];

  /** Reasoning for the recommendation */
  reasoning: string;
}

/**
 * Pattern learning outcome
 */
export interface LearningOutcome {
  /** Pattern ID that was used */
  patternId: string;

  /** Whether the application was successful */
  success: boolean;

  /** Quality metrics from the outcome */
  metrics?: {
    testsPassed?: number;
    testsFailed?: number;
    coverageImprovement?: number;
    executionTimeMs?: number;
  };

  /** Feedback from the agent or user */
  feedback?: string;
}

/**
 * Pattern promotion blocked event (ADR-052)
 */
export interface PromotionBlockedEvent {
  patternId: string;
  patternName: string;
  reason: 'coherence_violation' | 'insufficient_usage' | 'low_quality';
  energy?: number;
  existingPatternConflicts?: string[];
}

// ============================================================================
// QEReasoningBank Interface
// ============================================================================

/**
 * QEReasoningBank interface
 */
export interface IQEReasoningBank {
  /** Initialize the reasoning bank */
  initialize(): Promise<void>;

  /** Store a new pattern */
  storePattern(options: CreateQEPatternOptions): Promise<Result<QEPattern>>;

  /** Search for patterns */
  searchPatterns(
    query: string | number[],
    options?: PatternSearchOptions
  ): Promise<Result<PatternSearchResult[]>>;

  /** Get pattern by ID */
  getPattern(id: string): Promise<QEPattern | null>;

  /** Record pattern usage outcome */
  recordOutcome(outcome: LearningOutcome): Promise<Result<void>>;

  /** Route a task to optimal agent */
  routeTask(request: QERoutingRequest): Promise<Result<QERoutingResult>>;

  /** Get guidance for a domain */
  getGuidance(domain: QEDomain, context?: Partial<QEPatternContext>): QEGuidance;

  /** Generate guidance context for Claude */
  generateContext(
    domain: QEDomain,
    context?: { framework?: TestFramework; language?: ProgrammingLanguage }
  ): string;

  /** Check for anti-patterns in content */
  checkAntiPatterns(domain: QEDomain, content: string): ReturnType<typeof checkAntiPatterns>;

  /** Get embedding for text */
  embed(text: string): Promise<number[]>;

  /** Seed cross-domain patterns by transferring from populated domains to related ones */
  seedCrossDomainPatterns(): Promise<{ transferred: number; skipped: number }>;

  /** Get statistics */
  getStats(): Promise<QEReasoningBankStats>;

  /** Dispose the reasoning bank */
  dispose(): Promise<void>;
}

/**
 * QEReasoningBank statistics
 */
export interface QEReasoningBankStats {
  /** Total patterns */
  totalPatterns: number;

  /** Patterns by domain */
  byDomain: Record<QEDomain, number>;

  /** Routing requests served */
  routingRequests: number;

  /** Average routing confidence */
  avgRoutingConfidence: number;

  /** Learning outcomes recorded */
  learningOutcomes: number;

  /** Pattern success rate */
  patternSuccessRate: number;

  /** Pattern store stats */
  patternStoreStats: import('./pattern-store.js').PatternStoreStats;

  /** ADR-061: Asymmetric learning metrics (optional, available in RealQEReasoningBank) */
  asymmetricLearning?: {
    failurePenaltyRatio: string;
    quarantinedPatterns: number;
    rehabilitatedPatterns: number;
    avgConfidenceDelta: number;
  };
}
