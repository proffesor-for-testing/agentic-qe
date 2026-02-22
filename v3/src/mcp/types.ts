/**
 * Agentic QE v3 - MCP Types
 * Type definitions for Model Context Protocol integration
 */

import { DomainName, Priority } from '../shared/types';
import { TaskType } from '../coordination/queen-coordinator';

// ============================================================================
// MCP Tool Types
// ============================================================================

/**
 * MCP tool parameter schema
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

/**
 * MCP tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  category: ToolCategory;
  domain?: DomainName;
  lazyLoad?: boolean;
}

/**
 * Tool categories for organization and lazy loading
 */
export type ToolCategory =
  | 'core'           // Always loaded - fleet, status, health
  | 'task'           // Task management
  | 'agent'          // Agent management
  | 'domain'         // Domain-specific tools
  | 'coordination'   // Protocols, workflows
  | 'memory'         // Memory operations
  | 'learning'       // Learning and optimization
  | 'routing'        // ADR-051: Model routing
  | 'cross-phase'    // QCSD: Cross-phase memory feedback loops
  | 'infra-healing'; // ADR-057: Infrastructure self-healing

/**
 * Tool handler function type
 */
export type ToolHandler<TParams = Record<string, unknown>, TResult = unknown> = (
  params: TParams
) => Promise<ToolResult<TResult>>;

/**
 * Tool result
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: ToolResultMetadata;
}

/**
 * Data source tracking for audit/transparency
 */
export type DataSource = 'real' | 'demo' | 'fallback';

/**
 * Tool result metadata
 */
export interface ToolResultMetadata {
  executionTime: number;
  timestamp: string;
  requestId: string;
  domain?: DomainName;
  taskId?: string;
  toolName?: string;
  /** Indicates whether data came from real services, explicit demo mode, or fallback */
  dataSource?: DataSource;
}

// ============================================================================
// Core Tool Parameters
// ============================================================================

/**
 * Fleet initialization parameters
 */
export interface FleetInitParams {
  topology?: 'hierarchical' | 'mesh' | 'ring' | 'adaptive';
  maxAgents?: number;
  testingFocus?: string[];
  frameworks?: string[];
  environments?: string[];
  enabledDomains?: DomainName[];
  lazyLoading?: boolean;
  memoryBackend?: 'sqlite' | 'agentdb' | 'hybrid';
}

/**
 * Fleet status parameters
 */
export interface FleetStatusParams {
  verbose?: boolean;
  includeDomains?: boolean;
  includeMetrics?: boolean;
}

/**
 * Fleet health parameters
 */
export interface FleetHealthParams {
  domain?: DomainName;
  detailed?: boolean;
}

// ============================================================================
// Task Tool Parameters
// ============================================================================

/**
 * Task submit parameters
 */
export interface TaskSubmitParams {
  type: TaskType;
  priority?: Priority;
  targetDomains?: DomainName[];
  payload?: Record<string, unknown>;
  timeout?: number;
}

/**
 * Task list parameters
 */
export interface TaskListParams {
  status?: 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority?: Priority;
  domain?: DomainName;
  limit?: number;
}

/**
 * Task status parameters
 */
export interface TaskStatusParams {
  taskId: string;
  detailed?: boolean;
}

/**
 * Task cancel parameters
 */
export interface TaskCancelParams {
  taskId: string;
}

// ============================================================================
// Agent Tool Parameters
// ============================================================================

/**
 * Agent list parameters
 */
export interface AgentListParams {
  domain?: DomainName;
  status?: 'idle' | 'busy' | 'failed';
  limit?: number;
}

/**
 * Agent spawn parameters
 */
export interface AgentSpawnParams {
  domain: DomainName;
  type?: string;
  capabilities?: string[];
}

/**
 * Agent metrics parameters
 */
export interface AgentMetricsParams {
  agentId?: string;
  metric?: 'all' | 'cpu' | 'memory' | 'tasks' | 'performance';
}

// ============================================================================
// Domain Tool Parameters
// ============================================================================

/**
 * Test generation parameters
 */
export interface TestGenerateParams {
  sourceCode?: string;
  filePath?: string;
  language?: 'javascript' | 'typescript' | 'python' | 'java' | 'go';
  framework?: string;
  testType?: 'unit' | 'integration' | 'e2e' | 'property-based';
  coverageGoal?: number;
  aiEnhancement?: boolean;
  detectAntiPatterns?: boolean;
}

/**
 * Test execution parameters
 */
export interface TestExecuteParams {
  testFiles?: string[];
  testSuites?: string[];
  parallel?: boolean;
  parallelism?: number;
  retryCount?: number;
  timeout?: number;
  collectCoverage?: boolean;
  reportFormat?: 'json' | 'junit' | 'html' | 'markdown';
}

/**
 * Coverage analysis parameters
 */
export interface CoverageAnalyzeParams {
  target?: string;
  includeRisk?: boolean;
  detectGaps?: boolean;
  mlPowered?: boolean;
  prioritization?: 'complexity' | 'criticality' | 'change-frequency' | 'ml-confidence';
}

/**
 * Quality assessment parameters
 */
export interface QualityAssessParams {
  runGate?: boolean;
  threshold?: number;
  metrics?: string[];
}

/**
 * Security scan parameters
 */
export interface SecurityScanParams {
  sast?: boolean;
  dast?: boolean;
  compliance?: string[];
  target?: string;
}

/**
 * Contract validation parameters
 */
export interface ContractValidateParams {
  contractPath?: string;
  providerUrl?: string;
  consumerName?: string;
  checkBreakingChanges?: boolean;
}

/**
 * Accessibility test parameters
 */
export interface AccessibilityTestParams {
  url?: string;
  standard?: 'wcag21-aa' | 'wcag21-aaa' | 'wcag22-aa' | 'section508';
  includeScreenReader?: boolean;
}

/**
 * Chaos test parameters
 */
export interface ChaosTestParams {
  faultType?: 'latency' | 'error' | 'timeout' | 'cpu' | 'memory' | 'network';
  target?: string;
  duration?: number;
  intensity?: number;
  dryRun?: boolean;
}

// ============================================================================
// Coordination Tool Parameters
// ============================================================================

/**
 * Protocol execute parameters
 */
export interface ProtocolExecuteParams {
  protocolId: string;
  params?: Record<string, unknown>;
}

/**
 * Workflow create parameters
 */
export interface WorkflowCreateParams {
  name: string;
  description?: string;
  steps: WorkflowStepParam[];
  triggers?: WorkflowTriggerParam[];
}

/**
 * Workflow step parameter
 */
export interface WorkflowStepParam {
  id: string;
  name: string;
  domain: DomainName;
  action: string;
  dependsOn?: string[];
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
  timeout?: number;
  continueOnFailure?: boolean;
}

/**
 * Workflow trigger parameter
 */
export interface WorkflowTriggerParam {
  type: 'event' | 'schedule' | 'manual';
  eventType?: string;
  cron?: string;
}

/**
 * Workflow execute parameters
 */
export interface WorkflowExecuteParams {
  workflowId: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// Memory Tool Parameters
// ============================================================================

/**
 * Memory store parameters
 */
export interface MemoryStoreParams {
  key: string;
  value: unknown;
  namespace?: string;
  ttl?: number;
  metadata?: Record<string, unknown>;
  persist?: boolean;
}

/**
 * Memory retrieve parameters
 */
export interface MemoryRetrieveParams {
  key: string;
  namespace?: string;
  includeMetadata?: boolean;
}

/**
 * Memory query parameters
 */
export interface MemoryQueryParams {
  pattern?: string;
  namespace?: string;
  limit?: number;
  offset?: number;
  includeExpired?: boolean;
  /** When true, use HNSW vector search instead of string pattern matching */
  semantic?: boolean;
}

// ============================================================================
// Team Tool Parameters (ADR-064)
// ============================================================================

/**
 * Team list parameters
 */
export interface TeamListParams {
  domain?: string;
}

/**
 * Team health parameters
 */
export interface TeamHealthParams {
  domain: string;
}

/**
 * Team message parameters
 */
export interface TeamMessageParams {
  from: string;
  to: string;
  type: string;
  payload: Record<string, unknown>;
  domain?: string;
}

/**
 * Team broadcast parameters
 */
export interface TeamBroadcastParams {
  domain: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Team scale parameters
 */
export interface TeamScaleParams {
  domain: string;
  targetSize: number;
}

/**
 * Team rebalance parameters (no params required)
 */
export type TeamRebalanceParams = Record<string, never>;

// ============================================================================
// Tool Results
// ============================================================================

/**
 * Fleet init result
 */
export interface FleetInitResult {
  fleetId: string;
  topology: string;
  maxAgents: number;
  enabledDomains: DomainName[];
  status: 'initialized' | 'ready';
}

/**
 * Fleet status result
 */
export interface FleetStatusResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  agents: {
    total: number;
    active: number;
    idle: number;
  };
  tasks: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  domains?: DomainStatusResult[];
  metrics?: FleetMetricsResult;
  /** ADR-064: Agent Teams summary */
  teams?: {
    active: number;
    totalAgentsInTeams: number;
    healthyCount: number;
  };
  /** Learning system summary */
  learning?: {
    totalPatterns: number;
    totalExperiences: number;
    totalTrajectories: number;
    vectorCount: number;
    experienceApplications: number;
    dreamCycles: number;
    embeddingDimension: number;
  };
}

/**
 * Domain status result
 */
export interface DomainStatusResult {
  domain: DomainName;
  // Issue #205 fix: Added 'idle' status for fresh/ready domains
  status: 'healthy' | 'idle' | 'degraded' | 'unhealthy';
  agents: number;
  load: number;
}

/**
 * Fleet metrics result
 */
export interface FleetMetricsResult {
  tasksReceived: number;
  tasksCompleted: number;
  tasksFailed: number;
  agentUtilization: number;
  averageTaskDuration: number;
}

/**
 * Task submit result
 */
export interface TaskSubmitResult {
  taskId: string;
  type: TaskType;
  priority: Priority;
  status: 'pending' | 'queued';
  assignedDomain?: DomainName;
}

/**
 * Task status result
 */
export interface TaskStatusResult {
  taskId: string;
  type: TaskType;
  status: 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: Priority;
  assignedDomain?: DomainName;
  assignedAgents: string[];
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

/**
 * Test generate result
 */
export interface TestGenerateResult {
  taskId: string;
  status: string;
  duration: number;
  testsGenerated: number;
  coverageEstimate: number;
  antiPatternsDetected?: number;
  suggestions?: string[];
  savedFiles?: string[];
  patternsUsed?: string[];
  // V2-compatible fields (optional, flexible typing for backwards compatibility)
  tests?: unknown[];
  antiPatterns?: unknown[];
  aiInsights?: Record<string, unknown>;
  coverage?: Record<string, unknown>;
  properties?: unknown[];
  language?: string;
  complexity?: unknown;
  learning?: Record<string, unknown>;
}

/**
 * Coverage analyze result
 */
export interface CoverageAnalyzeResult {
  taskId: string;
  status: string;
  duration: number;
  lineCoverage: number;
  branchCoverage: number;
  functionCoverage: number;
  gaps?: CoverageGap[];
  riskScore?: number;
  savedFiles?: string[];
  // V2-compatible fields (optional, flexible typing)
  statementCoverage?: number;
  totalFiles?: number;
  coverageByFile?: unknown[];
  gapAnalysis?: Record<string, unknown>;
  trends?: Record<string, unknown>;
  aiInsights?: Record<string, unknown>;
  learning?: Record<string, unknown>;
}

/**
 * Coverage gap
 */
export interface CoverageGap {
  file: string;
  line?: number;
  type: 'uncovered-line' | 'uncovered-branch' | 'uncovered-function';
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence?: number;
  suggestion?: string;
  // Extended fields for V2 compatibility
  id?: string;
  uncoveredLines?: number[];
  reason?: string;
  priority?: string;
  suggestedTest?: string;
  riskScore?: number;
}

/**
 * Memory store result
 */
export interface MemoryStoreResult {
  stored: boolean;
  key: string;
  namespace: string;
  timestamp: string;
  persisted: boolean;
}

/**
 * Memory retrieve result
 */
export interface MemoryRetrieveResult {
  found: boolean;
  key: string;
  value?: unknown;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  expiresAt?: string;
}
