/**
 * QE Agent Routing Types
 * ADR-022: Adaptive QE Agent Routing
 *
 * Types for ML-based task routing that combines:
 * - Vector similarity (semantic matching)
 * - Historical performance (agent success rates)
 * - Capability matching (task requirements vs agent capabilities)
 */

import type { QEDomain } from '../learning/qe-patterns.js';

// ============================================================================
// Agent Profile Types
// ============================================================================

/**
 * Programming languages supported by agents
 */
export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'csharp'
  | 'kotlin'
  | 'swift'
  | 'ruby'
  | 'php';

/**
 * Test frameworks supported by agents
 */
export type TestFramework =
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'pytest'
  | 'junit'
  | 'testng'
  | 'go-test'
  | 'rust-test'
  | 'xunit'
  | 'rspec'
  | 'phpunit'
  | 'playwright'
  | 'cypress'
  | 'selenium';

/**
 * Task complexity levels
 */
export type ComplexityLevel = 'simple' | 'medium' | 'complex';

/**
 * Agent capability categories
 */
export type AgentCapability =
  // Test generation
  | 'test-generation'
  | 'tdd'
  | 'bdd'
  | 'unit-test'
  | 'integration-test'
  | 'e2e-test'
  | 'contract-test'
  // Coverage
  | 'coverage-analysis'
  | 'gap-detection'
  | 'risk-scoring'
  | 'sublinear-analysis'
  | 'branch-coverage'
  // Mutation testing
  | 'mutation-testing'
  | 'test-quality'
  // API testing
  | 'api-testing'
  | 'openapi'
  | 'graphql'
  | 'pact'
  | 'contract-testing'
  // Security
  | 'sast'
  | 'dast'
  | 'vulnerability'
  | 'owasp'
  | 'security-scanning'
  // Visual/A11y
  | 'visual-regression'
  | 'screenshot'
  | 'percy'
  | 'chromatic'
  | 'wcag'
  | 'aria'
  | 'screen-reader'
  | 'contrast'
  // Performance
  | 'load-testing'
  | 'stress-testing'
  | 'k6'
  | 'artillery'
  | 'benchmark'
  // Chaos/Resilience
  | 'chaos-testing'
  | 'resilience'
  | 'fault-injection'
  // Other
  | 'flaky-detection'
  | 'test-stability'
  | 'retry'
  | 'test-data'
  | 'test-orchestration'
  | 'quality-gate'
  | 'deployment-readiness';

/**
 * Agent profile with capabilities and performance metrics
 */
export interface QEAgentProfile {
  /** Agent identifier (matches Task tool subagent_type) */
  readonly id: string;

  /** Human-readable agent name */
  readonly name: string;

  /** Agent description */
  readonly description: string;

  /** Primary QE domains this agent handles */
  readonly domains: QEDomain[];

  /** Specific capabilities */
  readonly capabilities: AgentCapability[];

  /** Supported programming languages */
  readonly languages?: ProgrammingLanguage[];

  /** Supported test frameworks */
  readonly frameworks?: TestFramework[];

  /** Complexity range this agent handles */
  readonly complexity: {
    min: ComplexityLevel;
    max: ComplexityLevel;
  };

  /** Performance score (0-1), updated via feedback */
  performanceScore: number;

  /** Number of tasks completed */
  tasksCompleted: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Average task duration in ms */
  avgDurationMs: number;

  /** Tags for additional matching */
  readonly tags?: string[];
}

// ============================================================================
// Task Types
// ============================================================================

/**
 * Task to be routed to an agent
 */
export interface QETask {
  /** Task description */
  readonly description: string;

  /** Detected or specified domain */
  readonly domain?: QEDomain;

  /** Required capabilities */
  readonly requiredCapabilities?: AgentCapability[];

  /** Target language */
  readonly language?: ProgrammingLanguage;

  /** Target framework */
  readonly framework?: TestFramework;

  /** Task complexity */
  readonly complexity?: ComplexityLevel;

  /** Additional context */
  readonly context?: {
    /** File paths involved */
    files?: string[];
    /** Code snippet */
    code?: string;
    /** Previous agent used */
    previousAgent?: string;
    /** User preference */
    preferredAgent?: string;
  };

  /** Priority level */
  readonly priority?: 'low' | 'normal' | 'high' | 'critical';
}

// ============================================================================
// Routing Types
// ============================================================================

/**
 * Routing decision with confidence and alternatives
 */
export interface QERoutingDecision {
  /** Recommended agent ID */
  readonly recommended: string;

  /** Confidence score (0-1) */
  readonly confidence: number;

  /** Alternative agents with scores */
  readonly alternatives: ReadonlyArray<{
    agent: string;
    score: number;
    reason: string;
  }>;

  /** Human-readable reasoning */
  readonly reasoning: string;

  /** Score breakdown */
  readonly scores: {
    similarity: number;
    performance: number;
    capabilities: number;
    combined: number;
  };

  /** Routing latency in ms */
  readonly latencyMs: number;

  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Routing weights for combining scores
 */
export interface RoutingWeights {
  /** Weight for semantic similarity (0-1) */
  similarity: number;

  /** Weight for historical performance (0-1) */
  performance: number;

  /** Weight for capability matching (0-1) */
  capabilities: number;
}

/**
 * Agent score during routing
 */
export interface AgentScore {
  /** Agent ID */
  agent: string;

  /** Similarity score (0-1) */
  similarityScore: number;

  /** Performance score (0-1) */
  performanceScore: number;

  /** Capability match score (0-1) */
  capabilityScore: number;

  /** Combined weighted score */
  combinedScore: number;

  /** Why this agent was scored this way */
  reason: string;
}

// ============================================================================
// Feedback Types
// ============================================================================

/**
 * Routing outcome for feedback learning
 */
export interface RoutingOutcome {
  /** Unique outcome ID */
  readonly id: string;

  /** Original task */
  readonly task: QETask;

  /** Routing decision made */
  readonly decision: QERoutingDecision;

  /** Agent actually used (may differ from recommendation) */
  readonly usedAgent: string;

  /** Whether recommendation was followed */
  readonly followedRecommendation: boolean;

  /** Task outcome */
  readonly outcome: {
    /** Task completed successfully */
    success: boolean;
    /** Quality score (0-1) */
    qualityScore: number;
    /** Duration in ms */
    durationMs: number;
    /** Error message if failed */
    error?: string;
  };

  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Aggregated agent performance metrics
 */
export interface AgentPerformanceMetrics {
  /** Agent ID */
  readonly agentId: string;

  /** Total tasks routed to this agent */
  readonly totalTasks: number;

  /** Tasks completed successfully */
  readonly successfulTasks: number;

  /** Success rate (0-1) */
  readonly successRate: number;

  /** Average quality score (0-1) */
  readonly avgQualityScore: number;

  /** Average duration in ms */
  readonly avgDurationMs: number;

  /** Tasks where this agent was recommended but different agent used */
  readonly overriddenCount: number;

  /** Tasks where this agent was used but wasn't recommended */
  readonly selectedOverOthersCount: number;

  /** Performance trend (improving, stable, declining) */
  readonly trend: 'improving' | 'stable' | 'declining';

  /** Last updated */
  readonly updatedAt: Date;
}

// ============================================================================
// Router Configuration
// ============================================================================

/**
 * Task router configuration
 */
export interface QERouterConfig {
  /** Routing weights */
  weights: RoutingWeights;

  /** Minimum confidence threshold to recommend */
  minConfidence: number;

  /** Number of similar tasks to consider */
  similarTasksLimit: number;

  /** Enable learning from feedback */
  enableLearning: boolean;

  /** Minimum tasks before trusting performance score */
  minTasksForPerformance: number;

  /** Default performance score for new agents */
  defaultPerformanceScore: number;

  /** Cache routing decisions */
  enableCache: boolean;

  /** Cache TTL in ms */
  cacheTtlMs: number;
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: QERouterConfig = {
  weights: {
    similarity: 0.3,
    performance: 0.4,
    capabilities: 0.3,
  },
  minConfidence: 0.5,
  similarTasksLimit: 10,
  enableLearning: true,
  minTasksForPerformance: 5,
  defaultPerformanceScore: 0.7,
  enableCache: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
};
