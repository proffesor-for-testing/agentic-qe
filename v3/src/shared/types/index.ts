/**
 * Agentic QE v3 - Shared Types
 * Core type definitions used across all domains
 */

// ============================================================================
// Agent Types
// ============================================================================

export type AgentType =
  | 'coordinator'
  | 'specialist'
  | 'analyzer'
  | 'generator'
  | 'validator'
  | 'tester'
  | 'reviewer'
  | 'optimizer';

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'queued';

export interface AgentId {
  readonly value: string;
  readonly domain: DomainName;
  readonly type: AgentType;
}

// ============================================================================
// Domain Types
// ============================================================================

export type DomainName =
  | 'test-generation'
  | 'test-execution'
  | 'coverage-analysis'
  | 'quality-assessment'
  | 'defect-intelligence'
  | 'requirements-validation'
  | 'code-intelligence'
  | 'security-compliance'
  | 'contract-testing'
  | 'visual-accessibility'
  | 'chaos-resilience'
  | 'learning-optimization'
  | 'enterprise-integration'
  | 'coordination';

export const ALL_DOMAINS: readonly DomainName[] = [
  'test-generation',
  'test-execution',
  'coverage-analysis',
  'quality-assessment',
  'defect-intelligence',
  'requirements-validation',
  'code-intelligence',
  'security-compliance',
  'contract-testing',
  'visual-accessibility',
  'chaos-resilience',
  'learning-optimization',
  'enterprise-integration',
  'coordination',
] as const;

// ============================================================================
// Event Types
// ============================================================================

export interface DomainEvent<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly timestamp: Date;
  readonly source: DomainName;
  readonly correlationId?: string;
  readonly payload: T;
  /** Semantic anti-drift fingerprint (ADR-060) — optional, backward compatible */
  readonly semanticFingerprint?: SemanticFingerprint;
}

/**
 * Semantic fingerprint for anti-drift detection (ADR-060).
 * Attached to domain events at emission time, verified at each agent boundary.
 * Inspired by AISP 5.1 Anti-Drift Protocol: Mean(s) === Mean_0(s).
 */
export interface SemanticFingerprint {
  /** HNSW embedding of event payload at emission time */
  readonly embedding: readonly number[];
  /** Cosine distance threshold for drift detection */
  readonly driftThreshold: number;
  /** Source agent that originally emitted this event */
  readonly sourceAgentId: string;
  /** Hop count — incremented at each agent boundary */
  readonly hopCount: number;
  /** Timestamp of original emission (epoch ms) */
  readonly emittedAt: number;
}

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

// ============================================================================
// Result Types
// ============================================================================

export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================================================
// Quality Metrics Types
// ============================================================================

export interface CoverageMetrics {
  line: number;
  branch: number;
  function: number;
  statement: number;
}

export interface QualityScore {
  overall: number;
  coverage: number;
  complexity: number;
  maintainability: number;
  security: number;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Priority = 'p0' | 'p1' | 'p2' | 'p3';

// ============================================================================
// Configuration Types
// ============================================================================

export interface DomainConfig {
  enabled: boolean;
  maxAgents: number;
  timeout: number;
  retryCount: number;
}

// ============================================================================
// Viewport Types
// ============================================================================

/**
 * Browser viewport configuration
 */
export interface Viewport {
  /** Viewport width in pixels */
  readonly width: number;
  /** Viewport height in pixels */
  readonly height: number;
  /** Device scale factor for retina displays */
  readonly deviceScaleFactor: number;
  /** Whether this is a mobile viewport */
  readonly isMobile: boolean;
  /** Whether the viewport supports touch */
  readonly hasTouch: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Awaitable<T> = T | Promise<T>;

export interface Disposable {
  dispose(): Promise<void>;
}

export interface Initializable {
  initialize(): Promise<void>;
}

// ============================================================================
// Metadata Types
// ============================================================================

export interface Metadata {
  readonly [key: string]: string | number | boolean | null | undefined;
}
