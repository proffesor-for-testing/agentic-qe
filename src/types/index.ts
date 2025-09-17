/**
 * Core type definitions for Agentic QE framework
 * Defines interfaces, types, and schemas for the testing ecosystem
 */

import { z } from 'zod';

// ============================================================================
// Core QE Agent Types
// ============================================================================

export interface QEAgentConfig {
  id: string;
  name: string;
  type: AgentType;
  capabilities: AgentCapability[];
  priority: number;
  timeout: number;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

export type AgentType =
  | 'test-planner'
  | 'test-executor'
  | 'test-analyzer'
  | 'performance-tester'
  | 'security-tester'
  | 'accessibility-tester'
  | 'api-tester'
  | 'ui-tester'
  | 'integration-tester'
  | 'load-tester'
  | 'chaos-tester'
  | 'visual-tester'
  | 'mobile-tester'
  | 'cross-browser-tester'
  | 'data-validator'
  | 'regression-tester'
  | 'smoke-tester'
  | 'e2e-tester'
  | 'unit-tester'
  | 'contract-tester'
  // QE-specific agent types
  | 'exploratory-testing-navigator'
  | 'risk-oracle'
  | 'tdd-pair-programmer'
  | 'production-observer'
  | 'deployment-guardian'
  | 'requirements-explorer';

export type AgentCapability =
  | 'test-generation'
  | 'test-execution'
  | 'test-analysis'
  | 'bug-detection'
  | 'performance-monitoring'
  | 'security-scanning'
  | 'accessibility-validation'
  | 'visual-comparison'
  | 'load-simulation'
  | 'chaos-engineering'
  | 'api-validation'
  | 'ui-automation'
  | 'data-validation'
  | 'cross-platform-testing'
  | 'regression-analysis'
  | 'risk-assessment'
  | 'test-optimization'
  | 'report-generation'
  | 'metrics-collection'
  | 'alerting'
  // QE-specific capabilities
  | 'exploratory-session-management'
  | 'anomaly-detection'
  | 'pattern-recognition'
  | 'tour-execution'
  | 'observation-documentation'
  | 'risk-scoring'
  | 'predictive-analysis'
  | 'test-prioritization'
  | 'failure-prediction'
  | 'mitigation-planning'
  | 'coverage-analysis'
  | 'refactoring-suggestions'
  | 'tdd-cycle-management'
  | 'style-adaptation'
  | 'synthetic-monitoring'
  | 'root-cause-analysis'
  | 'test-gap-identification'
  | 'smoke-test-generation'
  | 'canary-analysis'
  | 'statistical-testing'
  | 'rollback-automation'
  | 'progressive-deployment'
  | 'requirement-ambiguity-detection'
  | 'testability-assessment'
  | 'charter-generation'
  | 'heuristic-application';

// ============================================================================
// Test Execution Types
// ============================================================================

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  tests: TestCase[];
  configuration: TestConfiguration;
  metadata: any; // TestMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  type: TestType;
  priority: TestPriority;
  steps: TestStep[];
  expectedResults: TestResult[];
  actualResults?: TestResult[];
  status: TestStatus;
  duration?: number;
  retryCount: number;
  tags: string[];
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface TestStep {
  id: string;
  order: number;
  action: string;
  data?: Record<string, unknown>;
  expectedResult?: string;
  actualResult?: string;
  status: TestStatus;
  duration?: number;
  screenshot?: string;
  logs?: string[];
}

export type TestType = 
  | 'unit'
  | 'integration'
  | 'e2e'
  | 'api'
  | 'performance'
  | 'security'
  | 'accessibility'
  | 'visual'
  | 'load'
  | 'stress'
  | 'smoke'
  | 'regression'
  | 'acceptance'
  | 'contract'
  | 'chaos';

export type TestPriority = 'low' | 'medium' | 'high' | 'critical';

export type TestStatus = 
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'blocked'
  | 'cancelled'
  | 'timeout';

// ============================================================================
// Test Configuration
// ============================================================================

export interface TestConfiguration {
  environment: TestEnvironment;
  browser?: BrowserConfig;
  mobile?: MobileConfig;
  api?: ApiConfig;
  // performance?: PerformanceConfig;
  // security?: SecurityConfig;
  // accessibility?: AccessibilityConfig;
  // visual?: VisualConfig;
  // parallel?: ParallelConfig;
  // retry?: RetryConfig;
  // timeout?: TimeoutConfig;
}

export interface TestEnvironment {
  name: string;
  baseUrl: string;
  variables: Record<string, string>;
  headers?: Record<string, string>;
  auth?: AuthConfig;
}

export interface BrowserConfig {
  browsers: string[];
  viewport: { width: number; height: number };
  headless: boolean;
  screenshots: boolean;
  video: boolean;
}

export interface MobileConfig {
  devices: string[];
  orientation: 'portrait' | 'landscape';
  emulation: boolean;
}

export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
  auth?: AuthConfig;
}

export interface AuthConfig {
  type: 'basic' | 'bearer' | 'oauth2' | 'api-key';
  credentials: Record<string, string>;
}

// ============================================================================
// Test Results and Reporting
// ============================================================================

export interface TestResult {
  id: string;
  testCaseId: string;
  status: TestStatus;
  startTime: Date;
  endTime?: Date;
  duration: number;
  message?: string;
  error?: TestError;
  artifacts?: TestArtifact[];
  metrics?: TestMetrics;
  // assertions?: Assertion[];
}

export interface TestError {
  type: string;
  message: string;
  stack?: string;
  screenshot?: string;
  logs?: string[];
  context?: Record<string, unknown>;
}

export interface TestArtifact {
  id: string;
  type: ArtifactType;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

export type ArtifactType = 
  | 'screenshot'
  | 'video'
  | 'log'
  | 'report'
  | 'trace'
  | 'network'
  | 'performance'
  | 'coverage';

export interface TestMetrics {
  assertions: number;
  passed: number;
  failed: number;
  skipped: number;
  // coverage?: CoverageMetrics;
  // performance?: PerformanceMetrics;
  // accessibility?: AccessibilityMetrics;
  // security?: SecurityMetrics;
}

// ============================================================================
// Memory and Session Management
// ============================================================================

export interface QEMemoryEntry {
  key: string;
  value: unknown;
  type: MemoryType;
  sessionId: string;
  agentId?: string;
  timestamp: Date;
  ttl?: number;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export type MemoryType = 
  | 'test-result'
  | 'test-data'
  | 'configuration'
  | 'artifact'
  | 'metric'
  | 'session'
  | 'agent-state'
  | 'cache';

export interface TestSession {
  id: string;
  name: string;
  status: SessionStatus;
  startTime: Date;
  endTime?: Date;
  testSuites: string[];
  agents: string[];
  configuration: TestConfiguration;
  results: TestSessionResults;
  metadata?: Record<string, unknown>;
}

export type SessionStatus = 'active' | 'completed' | 'failed' | 'cancelled';

export interface TestSessionResults {
  summary: any; // TestSummary;
  suites: any[]; // TestSuiteResult[];
  artifacts: TestArtifact[];
  metrics: TestMetrics;
  reports: any[]; // TestReport[];
}

// ============================================================================
// Hooks and Events
// ============================================================================

export interface QEHookEvent {
  type: HookEventType;
  timestamp: Date;
  sessionId: string;
  agentId?: string;
  testId?: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type HookEventType = 
  | 'session-start'
  | 'session-end'
  | 'test-start'
  | 'test-end'
  | 'test-step-start'
  | 'test-step-end'
  | 'agent-spawn'
  | 'agent-destroy'
  | 'error'
  | 'warning'
  | 'metric-collected'
  | 'artifact-created'
  | 'report-generated';

export interface HookHandler {
  name: string;
  events: HookEventType[];
  handler: (event: QEHookEvent) => Promise<void> | void;
  priority: number;
  enabled: boolean;
}

// ============================================================================
// CLI and Command Types
// ============================================================================

export interface CLICommand {
  name: string;
  description: string;
  aliases?: string[];
  options: CLIOption[];
  handler: (args: Record<string, unknown>) => Promise<void>;
}

export interface CLIOption {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  default?: unknown;
  choices?: string[];
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const QEAgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'test-planner', 'test-executor', 'test-analyzer', 'performance-tester',
    'security-tester', 'accessibility-tester', 'api-tester', 'ui-tester',
    'integration-tester', 'load-tester', 'chaos-tester', 'visual-tester',
    'mobile-tester', 'cross-browser-tester', 'data-validator',
    'regression-tester', 'smoke-tester', 'e2e-tester', 'unit-tester', 'contract-tester',
    'exploratory-testing-navigator', 'risk-oracle', 'tdd-pair-programmer',
    'production-observer', 'deployment-guardian', 'requirements-explorer'
  ]),
  capabilities: z.array(z.string()),
  priority: z.number().min(1).max(10),
  timeout: z.number().positive(),
  retryCount: z.number().min(0),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['unit', 'integration', 'e2e', 'api', 'performance', 
                'security', 'accessibility', 'visual', 'load', 'stress',
                'smoke', 'regression', 'acceptance', 'contract', 'chaos']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  steps: z.array(z.object({
    id: z.string(),
    order: z.number(),
    action: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
    expectedResult: z.string().optional()
  })),
  tags: z.array(z.string()),
  dependencies: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Re-export commonly used types from extended module
// export type {
//   TestSummary,
//   TestSuiteResult,
//   TestReport,
//   CoverageMetrics,
//   PerformanceMetrics,
//   AccessibilityMetrics,
//   SecurityMetrics,
//   PerformanceConfig,
//   SecurityConfig,
//   AccessibilityConfig,
//   VisualConfig,
//   ParallelConfig,
//   RetryConfig,
//   TimeoutConfig,
//   Assertion,
//   TestMetadata
// } from './extended';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_AGENT_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_RETRY_COUNT = 3;
export const DEFAULT_SESSION_TTL = 3600000; // 1 hour
export const MAX_CONCURRENT_AGENTS = 10;
export const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'safari', 'edge'] as const;
export const SUPPORTED_MOBILE_DEVICES = ['iPhone', 'iPad', 'Android'] as const;

// Version information
export const VERSION = '1.0.0';
export const API_VERSION = 'v1';

// Default configurations
export const DEFAULT_TEST_CONFIG: Partial<TestConfiguration> = {
  environment: {
    name: 'default',
    baseUrl: 'http://localhost:3000',
    variables: {}
  },
  browser: {
    browsers: ['chrome'],
    viewport: { width: 1280, height: 720 },
    headless: true,
    screenshots: true,
    video: false
  },
  // retry: {
  //   count: 3,
  //   delay: 1000
  // },
  // timeout: {
  //   test: 30000,
  //   step: 5000,
  //   page: 10000
  // }
};
