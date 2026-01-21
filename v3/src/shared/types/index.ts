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
