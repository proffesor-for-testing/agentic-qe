/**
 * Agentic QE v3 - Queen Coordinator Types & Constants
 * Extracted from queen-coordinator.ts - Types, interfaces, config, domain groups
 */

import type {
  DomainName,
  Priority,
  Severity,
  ALL_DOMAINS,
} from '../shared/types';
import type {
  AgentInfo,
  DomainHealth,
} from '../kernel/interfaces';
import type { QueenMinCutBridge } from './mincut/queen-integration';
import type { DomainBreakerRegistry } from './circuit-breaker/index.js';
import type { DomainTeamManager } from './agent-teams/domain-team-manager.js';
import type { TierSelector } from './fleet-tiers/index.js';
import type { TraceCollector } from './agent-teams/tracing.js';
import type { HypothesisManager } from './competing-hypotheses/index.js';
import type { FederationMailbox } from './federation/index.js';
import type { DynamicScaler } from './dynamic-scaling/index.js';
import type { QueenRouterConfig } from '../routing/queen-integration.js';
import type { IQEReasoningBank } from '../learning/qe-reasoning-bank.js';
import type { Result } from '../shared/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Task that can be assigned to domains
 */
export interface QueenTask {
  readonly id: string;
  readonly type: TaskType;
  readonly priority: Priority;
  readonly targetDomains: DomainName[];
  readonly payload: Record<string, unknown>;
  readonly timeout: number;
  readonly createdAt: Date;
  readonly requester?: string;
  readonly correlationId?: string;
}

export type TaskType =
  | 'generate-tests'
  | 'execute-tests'
  | 'analyze-coverage'
  | 'assess-quality'
  | 'predict-defects'
  | 'validate-requirements'
  | 'index-code'
  | 'scan-security'
  | 'validate-contracts'
  | 'test-accessibility'
  | 'run-chaos'
  | 'optimize-learning'
  | 'cross-domain-workflow'
  | 'protocol-execution'
  | 'ideation-assessment';

/**
 * Task execution status
 */
export interface TaskExecution {
  readonly taskId: string;
  readonly task: QueenTask;
  readonly status: 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly assignedDomain?: DomainName;
  readonly assignedAgents: string[];
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly result?: unknown;
  readonly error?: string;
  readonly retryCount: number;
}

/**
 * Domain group for coordination
 */
export interface DomainGroup {
  readonly name: string;
  readonly domains: DomainName[];
  readonly priority: Priority;
  readonly description: string;
}

/**
 * Work stealing configuration
 */
export interface WorkStealingConfig {
  enabled: boolean;
  idleThreshold: number; // Time in ms before domain is considered idle
  loadThreshold: number; // Max pending tasks before stealing is triggered
  stealBatchSize: number; // Number of tasks to steal at once
  checkInterval: number; // How often to check for work stealing opportunities
}

/**
 * Queen Coordinator metrics
 */
export interface QueenMetrics {
  readonly tasksReceived: number;
  readonly tasksCompleted: number;
  readonly tasksFailed: number;
  readonly tasksStolen: number;
  readonly averageTaskDuration: number;
  readonly domainUtilization: Map<DomainName, number>;
  readonly agentUtilization: number;
  readonly protocolsExecuted: number;
  readonly workflowsExecuted: number;
  readonly uptime: number;
}

/**
 * Queen Coordinator configuration
 */
export interface QueenConfig {
  maxConcurrentTasks: number;
  defaultTaskTimeout: number;
  taskRetryLimit: number;
  workStealing: WorkStealingConfig;
  enableMetrics: boolean;
  metricsInterval: number;
  priorityWeights: Record<Priority, number>;
  /** V3 Integration: TinyDancer routing configuration */
  routing?: QueenRouterConfig;
  /** Enable intelligent model routing (default: true) */
  enableRouting?: boolean;
  /** ADR-064: Enable domain circuit breakers (default: true) */
  enableCircuitBreakers?: boolean;
  /** ADR-064: Enable domain team management (default: true) */
  enableDomainTeams?: boolean;
  /** ADR-064: Enable fleet tier selection (default: true) */
  enableFleetTiers?: boolean;
}

/**
 * Queen health status
 */
export interface QueenHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  domainHealth: Map<DomainName, DomainHealth>;
  totalAgents: number;
  activeAgents: number;
  pendingTasks: number;
  runningTasks: number;
  workStealingActive: boolean;
  lastHealthCheck: Date;
  issues: HealthIssue[];
}

export interface HealthIssue {
  domain?: DomainName;
  severity: Severity;
  message: string;
  timestamp: Date;
}

/**
 * Queen Coordinator interface
 */
export interface IQueenCoordinator {
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;

  // Task Management
  submitTask(task: Omit<QueenTask, 'id' | 'createdAt'>): Promise<Result<string, Error>>;
  cancelTask(taskId: string): Promise<Result<void, Error>>;
  getTaskStatus(taskId: string): TaskExecution | undefined;
  listTasks(filter?: TaskFilter): TaskExecution[];

  // Domain Coordination
  getDomainHealth(domain: DomainName): DomainHealth | undefined;
  getDomainLoad(domain: DomainName): number;
  getIdleDomains(): DomainName[];
  getBusyDomains(): DomainName[];

  // Work Stealing
  enableWorkStealing(): void;
  disableWorkStealing(): void;
  triggerWorkStealing(): Promise<number>;

  // Agent Management
  listAllAgents(): AgentInfo[];
  getAgentsByDomain(domain: DomainName): AgentInfo[];
  requestAgentSpawn(domain: DomainName, type: string, capabilities: string[]): Promise<Result<string, Error>>;

  // Health & Metrics
  getHealth(): QueenHealth;
  getMetrics(): QueenMetrics;

  // Protocol & Workflow
  executeProtocol(protocolId: string, params?: Record<string, unknown>): Promise<Result<string, Error>>;
  executeWorkflow(workflowId: string, params?: Record<string, unknown>): Promise<Result<string, Error>>;

  // ADR-047: MinCut Integration
  getMinCutBridge(): QueenMinCutBridge | null;
  injectMinCutBridgeIntoDomain(domainName: DomainName): boolean;

  // ADR-064: Domain Teams, Circuit Breakers, Fleet Tiers
  getDomainBreakerRegistry(): DomainBreakerRegistry | null;
  getDomainTeamManager(): DomainTeamManager | null;
  getTierSelector(): TierSelector | null;

  // ADR-064 Phase 3: Learning & Observability
  connectReasoningBank(bank: IQEReasoningBank): void;

  // ADR-064 Phase 3: Distributed Tracing
  getTraceCollector(): TraceCollector | null;

  // ADR-064 Phase 4: Advanced Patterns
  getHypothesisManager(): HypothesisManager | null;
  getFederationMailbox(): FederationMailbox | null;
  getDynamicScaler(): DynamicScaler | null;
}

export interface TaskFilter {
  status?: TaskExecution['status'];
  domain?: DomainName;
  priority?: Priority;
  type?: TaskType;
  fromDate?: Date;
  toDate?: Date;
}

// ============================================================================
// Domain Groups (per Master Plan Section 4.1)
// ============================================================================

export const DOMAIN_GROUPS: DomainGroup[] = [
  {
    name: 'Core Testing',
    domains: ['test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment'],
    priority: 'p0',
    description: 'Core testing workflow domains',
  },
  {
    name: 'Intelligence',
    domains: ['defect-intelligence', 'code-intelligence', 'requirements-validation', 'security-compliance'],
    priority: 'p0',
    description: 'Intelligence and analysis domains',
  },
  {
    name: 'Specialized',
    domains: ['contract-testing', 'visual-accessibility', 'chaos-resilience', 'learning-optimization'],
    priority: 'p1',
    description: 'Specialized testing domains',
  },
];

// Task type to domain mapping
export const TASK_DOMAIN_MAP: Record<TaskType, DomainName[]> = {
  'generate-tests': ['test-generation'],
  'execute-tests': ['test-execution'],
  'analyze-coverage': ['coverage-analysis'],
  'assess-quality': ['quality-assessment'],
  'predict-defects': ['defect-intelligence'],
  'validate-requirements': ['requirements-validation'],
  'index-code': ['code-intelligence'],
  'scan-security': ['security-compliance'],
  'validate-contracts': ['contract-testing'],
  'test-accessibility': ['visual-accessibility'],
  'run-chaos': ['chaos-resilience'],
  'optimize-learning': ['learning-optimization'],
  'cross-domain-workflow': [] as unknown as DomainName[], // ALL_DOMAINS - set at runtime
  'protocol-execution': [] as unknown as DomainName[], // ALL_DOMAINS - set at runtime
  // QCSD Ideation Swarm: requirements-validation is primary, with support from coverage-analysis and security-compliance
  'ideation-assessment': ['requirements-validation', 'coverage-analysis', 'security-compliance'],
};

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_QUEEN_CONFIG: QueenConfig = {
  maxConcurrentTasks: 50,
  defaultTaskTimeout: 300000, // 5 minutes
  taskRetryLimit: 3,
  workStealing: {
    enabled: true,
    idleThreshold: 5000, // 5 seconds
    loadThreshold: 10,
    stealBatchSize: 3,
    checkInterval: 10000, // 10 seconds
  },
  enableMetrics: true,
  metricsInterval: 60000, // 1 minute
  priorityWeights: {
    p0: 100,
    p1: 50,
    p2: 25,
    p3: 10,
  },
  // V3 Integration: Enable intelligent model routing by default
  enableRouting: true,
};

/**
 * Initialize the TASK_DOMAIN_MAP entries that need ALL_DOMAINS at runtime.
 * Must be called once ALL_DOMAINS is available.
 */
export function initializeTaskDomainMap(allDomains: readonly DomainName[]): void {
  TASK_DOMAIN_MAP['cross-domain-workflow'] = allDomains as unknown as DomainName[];
  TASK_DOMAIN_MAP['protocol-execution'] = allDomains as unknown as DomainName[];
}
