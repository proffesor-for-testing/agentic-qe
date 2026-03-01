/**
 * Agentic QE v3 - Collaborative Test Task Claims
 * ADR-016: Interfaces for claim types, statuses, and coordination
 *
 * Claim Types:
 * - coverage-gap: Uncovered code that needs tests
 * - flaky-test: Unstable test requiring fix
 * - defect-investigation: Predicted defect to analyze
 * - test-review: Generated tests awaiting human review
 *
 * Supports human <-> agent handoffs with claim stealing for load balancing.
 */

import { DomainName, Priority, Severity, AgentType } from '../../shared/types';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Types of claims that can be created in the QE system
 */
export type ClaimType =
  | 'coverage-gap'      // Uncovered code needs tests
  | 'flaky-test'        // Flaky test needs fixing
  | 'defect-investigation' // Predicted defect to analyze
  | 'test-review';      // Generated tests need human review

/**
 * Status of a claim through its lifecycle
 */
export type ClaimStatus =
  | 'available'     // Open for claiming
  | 'claimed'       // Actively being worked
  | 'in-progress'   // Work has started
  | 'blocked'       // Waiting on external dependency
  | 'completed'     // Successfully finished
  | 'abandoned'     // Claim was released without completion
  | 'expired';      // Claim timed out

/**
 * Who holds a claim - can be agent or human
 */
export type ClaimantType = 'agent' | 'human';

/**
 * Identifies who is holding a claim
 */
export interface Claimant {
  /** Unique identifier (agent ID or user ID) */
  readonly id: string;

  /** Type of claimant */
  readonly type: ClaimantType;

  /** Human-readable name */
  readonly name: string;

  /** For agents: the domain they operate in */
  readonly domain?: DomainName;

  /** For agents: their agent type */
  readonly agentType?: AgentType;
}

/**
 * Metadata associated with different claim types
 */
export interface CoverageGapMetadata {
  /** File with coverage gap */
  readonly filePath: string;

  /** Lines missing coverage */
  readonly uncoveredLines: number[];

  /** Current coverage percentage */
  readonly currentCoverage: number;

  /** Target coverage percentage */
  readonly targetCoverage: number;

  /** Complexity score of uncovered code */
  readonly complexity?: number;
}

export interface FlakyTestMetadata {
  /** Test file path */
  readonly testFilePath: string;

  /** Test name/description */
  readonly testName: string;

  /** Flakiness rate (0-1) */
  readonly flakinessRate: number;

  /** Number of recent failures */
  readonly recentFailures: number;

  /** Number of total runs */
  readonly totalRuns: number;

  /** Last failure timestamp */
  readonly lastFailure: Date;

  /** Suspected causes */
  readonly suspectedCauses?: string[];
}

export interface DefectInvestigationMetadata {
  /** File predicted to have defect */
  readonly filePath: string;

  /** Defect probability score */
  readonly probability: number;

  /** Prediction model used */
  readonly predictionModel: string;

  /** Contributing risk factors */
  readonly riskFactors: string[];

  /** Related commits */
  readonly relatedCommits?: string[];
}

export interface TestReviewMetadata {
  /** Generated test file path */
  readonly testFilePath: string;

  /** Source file being tested */
  readonly sourceFilePath: string;

  /** Test count in file */
  readonly testCount: number;

  /** Generator agent ID */
  readonly generatorAgentId: string;

  /** Generation timestamp */
  readonly generatedAt: Date;

  /** Confidence score of generated tests */
  readonly confidenceScore?: number;
}

/**
 * Union of all claim metadata types
 */
export type ClaimMetadata =
  | CoverageGapMetadata
  | FlakyTestMetadata
  | DefectInvestigationMetadata
  | TestReviewMetadata;

// ============================================================================
// Claim Entity
// ============================================================================

/**
 * Core claim entity representing a test task that can be claimed
 */
export interface Claim<T extends ClaimMetadata = ClaimMetadata> {
  /** Unique claim identifier */
  readonly id: string;

  /** Type of claim */
  readonly type: ClaimType;

  /** Current status */
  readonly status: ClaimStatus;

  /** Priority of the work */
  readonly priority: Priority;

  /** Severity (for defects/flaky tests) */
  readonly severity?: Severity;

  /** Domain this claim relates to */
  readonly domain: DomainName;

  /** Title/summary of the claim */
  readonly title: string;

  /** Detailed description */
  readonly description?: string;

  /** Type-specific metadata */
  readonly metadata: T;

  /** Current holder of the claim (if claimed) */
  readonly claimant?: Claimant;

  /** When the claim was created */
  readonly createdAt: Date;

  /** When the claim was last updated */
  readonly updatedAt: Date;

  /** When the claim was taken */
  readonly claimedAt?: Date;

  /** When the claim expires (for auto-release) */
  readonly expiresAt?: Date;

  /** Deadline for completion */
  readonly deadline?: Date;

  /** Estimated effort in minutes */
  readonly estimatedEffort?: number;

  /** Tags for filtering/categorization */
  readonly tags: string[];

  /** Related claim IDs (blocked-by, related-to) */
  readonly relatedClaims?: string[];

  /** Correlation ID for tracing */
  readonly correlationId?: string;

  /** Number of times this claim has been stolen */
  readonly stealCount: number;

  /** Previous claimants (for history) */
  readonly previousClaimants?: Claimant[];

  /** Work result when completed */
  readonly result?: ClaimResult;
}

/**
 * Result of completed claim work
 */
export interface ClaimResult {
  /** Success status */
  readonly success: boolean;

  /** Summary of work done */
  readonly summary: string;

  /** Artifacts produced (test files, reports, etc.) */
  readonly artifacts?: string[];

  /** Time spent in minutes */
  readonly timeSpent?: number;

  /** Follow-up claims created */
  readonly followUpClaims?: string[];

  /** Notes from the claimant */
  readonly notes?: string;
}

// ============================================================================
// Claim Operations
// ============================================================================

/**
 * Input for creating a new claim
 */
export interface CreateClaimInput<T extends ClaimMetadata = ClaimMetadata> {
  type: ClaimType;
  priority: Priority;
  severity?: Severity;
  domain: DomainName;
  title: string;
  description?: string;
  metadata: T;
  tags?: string[];
  deadline?: Date;
  estimatedEffort?: number;
  correlationId?: string;
  relatedClaims?: string[];
}

/**
 * Input for claiming an available claim
 */
export interface ClaimInput {
  /** Claim ID to take */
  claimId: string;

  /** Who is claiming */
  claimant: Claimant;

  /** Optional TTL override in milliseconds */
  ttlMs?: number;
}

/**
 * Input for releasing a claim
 */
export interface ReleaseClaimInput {
  /** Claim ID to release */
  claimId: string;

  /** Who is releasing */
  claimantId: string;

  /** Reason for release */
  reason?: 'completed' | 'abandoned' | 'handoff' | 'stolen';

  /** Result if completed */
  result?: ClaimResult;
}

/**
 * Input for stealing a claim from another claimant
 */
export interface StealClaimInput {
  /** Claim ID to steal */
  claimId: string;

  /** New claimant taking over */
  newClaimant: Claimant;

  /** Reason for stealing */
  reason: 'stale' | 'idle-agent' | 'priority-override' | 'manual';
}

/**
 * Input for handoff between human and agent
 */
export interface HandoffInput {
  /** Claim ID to hand off */
  claimId: string;

  /** Current holder */
  fromClaimant: Claimant;

  /** New holder */
  toClaimant: Claimant;

  /** Notes for the handoff */
  notes?: string;

  /** Context/progress to transfer */
  context?: Record<string, unknown>;
}

// ============================================================================
// Filtering and Queries
// ============================================================================

/**
 * Filter criteria for querying claims
 */
export interface ClaimFilter {
  /** Filter by type */
  type?: ClaimType | ClaimType[];

  /** Filter by status */
  status?: ClaimStatus | ClaimStatus[];

  /** Filter by priority */
  priority?: Priority | Priority[];

  /** Filter by domain */
  domain?: DomainName | DomainName[];

  /** Filter by claimant ID */
  claimantId?: string;

  /** Filter by claimant type */
  claimantType?: ClaimantType;

  /** Only unclaimed */
  available?: boolean;

  /** Only expired */
  expired?: boolean;

  /** Filter by tags (any match) */
  tags?: string[];

  /** Created after */
  createdAfter?: Date;

  /** Created before */
  createdBefore?: Date;

  /** Deadline before */
  deadlineBefore?: Date;

  /** Search in title/description */
  search?: string;

  /** Maximum results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Sort options for claims
 */
export interface ClaimSortOptions {
  field: 'createdAt' | 'updatedAt' | 'priority' | 'deadline' | 'estimatedEffort';
  direction: 'asc' | 'desc';
}

// ============================================================================
// Claim Events
// ============================================================================

/**
 * Events emitted by the claim system
 */
export type ClaimEventType =
  | 'ClaimCreated'
  | 'ClaimClaimed'
  | 'ClaimReleased'
  | 'ClaimCompleted'
  | 'ClaimAbandoned'
  | 'ClaimExpired'
  | 'ClaimStolen'
  | 'ClaimHandoff'
  | 'ClaimStatusChanged'
  | 'ClaimPriorityEscalated';

export interface ClaimEvent {
  readonly type: ClaimEventType;
  readonly claimId: string;
  readonly claim: Claim;
  readonly timestamp: Date;
  readonly actor?: Claimant;
  readonly previousState?: Partial<Claim>;
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for claim TTL and expiration
 */
export interface ClaimExpiryConfig {
  /** Default TTL for agent claims (ms) */
  defaultAgentTtlMs: number;

  /** Default TTL for human claims (ms) */
  defaultHumanTtlMs: number;

  /** How often to check for expired claims (ms) */
  expiryCheckIntervalMs: number;

  /** Grace period before stealing stale claims (ms) */
  staleThresholdMs: number;

  /** Maximum number of times a claim can be stolen */
  maxStealCount: number;
}

/**
 * Configuration for work stealing
 */
export interface WorkStealingConfig {
  /** Enable work stealing */
  enabled: boolean;

  /** Minimum idle time before agent can steal (ms) */
  idleThresholdMs: number;

  /** Maximum claims to steal per round */
  stealBatchSize: number;

  /** How often to check for stealing opportunities (ms) */
  checkIntervalMs: number;

  /** Prioritize stealing by priority level */
  prioritizeByPriority: boolean;

  /** Allow cross-domain stealing */
  allowCrossDomain: boolean;
}

/**
 * Full claim service configuration
 */
export interface ClaimServiceConfig {
  /** Expiry configuration */
  expiry: ClaimExpiryConfig;

  /** Work stealing configuration */
  workStealing: WorkStealingConfig;

  /** Enable claim events */
  enableEvents: boolean;

  /** Enable metrics collection */
  enableMetrics: boolean;

  /** Metrics collection interval (ms) */
  metricsIntervalMs: number;
}

// ============================================================================
// Metrics
// ============================================================================

/**
 * Metrics for the claim system
 */
export interface ClaimMetrics {
  /** Total claims created */
  readonly totalCreated: number;

  /** Total claims completed */
  readonly totalCompleted: number;

  /** Total claims abandoned */
  readonly totalAbandoned: number;

  /** Total claims expired */
  readonly totalExpired: number;

  /** Total claims stolen */
  readonly totalStolen: number;

  /** Total handoffs */
  readonly totalHandoffs: number;

  /** Currently available claims */
  readonly currentAvailable: number;

  /** Currently claimed (in progress) */
  readonly currentClaimed: number;

  /** Average time to claim (ms) */
  readonly avgTimeToClaimMs: number;

  /** Average time to complete (ms) */
  readonly avgTimeToCompleteMs: number;

  /** Claims by type */
  readonly byType: Record<ClaimType, number>;

  /** Claims by status */
  readonly byStatus: Record<ClaimStatus, number>;

  /** Claims by domain */
  readonly byDomain: Record<DomainName, number>;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Interface for claim persistence
 */
export interface IClaimRepository {
  /** Create a new claim */
  create(claim: Claim): Promise<void>;

  /** Get claim by ID */
  get(claimId: string): Promise<Claim | undefined>;

  /** Update an existing claim */
  update(claim: Claim): Promise<void>;

  /** Delete a claim */
  delete(claimId: string): Promise<boolean>;

  /** Find claims matching filter */
  find(filter: ClaimFilter, sort?: ClaimSortOptions): Promise<Claim[]>;

  /** Count claims matching filter */
  count(filter: ClaimFilter): Promise<number>;

  /** Find expired claims */
  findExpired(): Promise<Claim[]>;

  /** Find stale claims (claimed but inactive) */
  findStale(thresholdMs: number): Promise<Claim[]>;
}

/**
 * Interface for the claim service
 */
export interface IClaimService {
  /** Initialize the service */
  initialize(): Promise<void>;

  /** Dispose resources */
  dispose(): Promise<void>;

  /** Create a new claim */
  createClaim<T extends ClaimMetadata>(input: CreateClaimInput<T>): Promise<Claim<T>>;

  /** Claim an available claim */
  claim(input: ClaimInput): Promise<Claim>;

  /** Release a claim */
  release(input: ReleaseClaimInput): Promise<Claim>;

  /** Steal a claim from another claimant */
  steal(input: StealClaimInput): Promise<Claim>;

  /** Hand off a claim between claimants */
  handoff(input: HandoffInput): Promise<Claim>;

  /** Get a claim by ID */
  getClaim(claimId: string): Promise<Claim | undefined>;

  /** Find claims matching criteria */
  findClaims(filter: ClaimFilter, sort?: ClaimSortOptions): Promise<Claim[]>;

  /** Get available claims for a claimant */
  getAvailableForClaimant(claimant: Claimant): Promise<Claim[]>;

  /** Get claims held by a claimant */
  getClaimsForClaimant(claimantId: string): Promise<Claim[]>;

  /** Expire stale claims */
  expireStale(): Promise<number>;

  /** Get service metrics */
  getMetrics(): ClaimMetrics;
}

/**
 * Interface for work stealing coordinator
 */
export interface IWorkStealingCoordinator {
  /** Initialize coordinator */
  initialize(): Promise<void>;

  /** Dispose resources */
  dispose(): Promise<void>;

  /** Check for and execute work stealing */
  checkAndSteal(): Promise<number>;

  /** Get stealable claims for an idle agent */
  getStealableClaims(idleAgent: Claimant): Promise<Claim[]>;

  /** Record agent activity */
  recordActivity(agentId: string): void;

  /** Get idle agents */
  getIdleAgents(): Claimant[];

  /** Get busy agents */
  getBusyAgents(): Claimant[];
}

/**
 * Interface for human-agent handoff management
 */
export interface IHandoffManager {
  /** Initialize manager */
  initialize(): Promise<void>;

  /** Dispose resources */
  dispose(): Promise<void>;

  /** Request handoff to human */
  requestHumanReview(claimId: string, notes?: string): Promise<void>;

  /** Request handoff to agent */
  requestAgentAssist(claimId: string, preferredDomain?: DomainName): Promise<void>;

  /** Complete handoff */
  completeHandoff(handoffId: string, toClaimant: Claimant): Promise<Claim>;

  /** Get pending handoffs */
  getPendingHandoffs(): Promise<PendingHandoff[]>;

  /** Cancel a pending handoff */
  cancelHandoff(handoffId: string): Promise<void>;
}

/**
 * Pending handoff request
 */
export interface PendingHandoff {
  readonly id: string;
  readonly claimId: string;
  readonly claim: Claim;
  readonly requestedBy: Claimant;
  readonly requestedAt: Date;
  readonly targetType: ClaimantType;
  readonly notes?: string;
  readonly preferredDomain?: DomainName;
}
