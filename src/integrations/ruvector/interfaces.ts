/**
 * Agentic QE v3 - RuVector Integration Interfaces
 *
 * RuVector provides ML-based code intelligence for QE.
 * This is an OPTIONAL dependency - all features work without it.
 *
 * Integration Points per ADR-017:
 * | RuVector Feature      | QE Application                    |
 * |----------------------|-----------------------------------|
 * | Q-Learning Router    | Route test tasks to optimal agents|
 * | AST Complexity       | Prioritize tests by code complexity|
 * | Diff Risk Classification | Target tests at high-risk changes |
 * | Coverage Routing     | Test coverage-aware agent selection|
 * | Graph Boundaries     | Focus integration tests at module boundaries |
 */

import type { AgentType, DomainName, Severity, Priority } from '../../shared/types';

// ============================================================================
// RuVector Client Configuration
// ============================================================================

/**
 * Configuration for RuVector client connection
 */
export interface RuVectorConfig {
  /** Whether RuVector integration is enabled */
  enabled: boolean;
  /** RuVector service endpoint (e.g., 'http://localhost:8080') */
  endpoint?: string;
  /** Path to local RuVector database file */
  databasePath?: string;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Enable caching of RuVector results */
  cacheEnabled?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /** Fallback to rule-based logic when RuVector unavailable */
  fallbackEnabled?: boolean;
  /** Retry attempts for failed connections */
  retryAttempts?: number;
  /** Retry delay in milliseconds */
  retryDelayMs?: number;
}

/**
 * Default RuVector configuration
 *
 * NOTE: RuVector provides ML-based intelligence for QE operations.
 * Uses unified memory.db via UnifiedMemoryManager (ADR-046).
 *
 * ARM64 binaries are available and working (verified 2026-01-16):
 * - @ruvector/sona: SonaEngine for pattern adaptation
 * - @ruvector/gnn: HNSW indexing and differentiable search
 * - @ruvector/attention: Flash Attention with SIMD acceleration
 */
export const DEFAULT_RUVECTOR_CONFIG: Required<RuVectorConfig> = {
  enabled: true, // ENABLED: ARM64 binaries verified working
  endpoint: 'http://localhost:8080',
  // LEGACY: This path is ignored when RuVector uses unified storage (ADR-046)
  // Kept for backward compatibility with external RuVector service configs
  databasePath: '.agentic-qe/memory.db',
  timeout: 5000,
  cacheEnabled: true,
  cacheTtl: 5 * 60 * 1000, // 5 minutes
  fallbackEnabled: true,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// ============================================================================
// RuVector Client Interface
// ============================================================================

/**
 * Connection status for RuVector service
 */
export type RuVectorConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'unavailable';

/**
 * RuVector health check result
 */
export interface RuVectorHealthResult {
  status: RuVectorConnectionStatus;
  version?: string;
  features: string[];
  latencyMs?: number;
  lastChecked: Date;
  error?: string;
}

/**
 * Main RuVector client interface for QE integration
 */
export interface RuVectorClient {
  /** Check if RuVector is available */
  isAvailable(): Promise<boolean>;

  /** Get health status */
  getHealth(): Promise<RuVectorHealthResult>;

  /** Q-Learning router for agent selection */
  getQLearningRouter(): QLearningRouter;

  /** AST complexity analyzer */
  getASTComplexityAnalyzer(): ASTComplexityAnalyzer;

  /** Diff risk classifier */
  getDiffRiskClassifier(): DiffRiskClassifier;

  /** Coverage-aware router */
  getCoverageRouter(): CoverageRouter;

  /** Graph boundaries analyzer */
  getGraphBoundaries(): GraphBoundariesAnalyzer;

  /** Initialize client */
  initialize(): Promise<void>;

  /** Dispose client resources */
  dispose(): Promise<void>;
}

// ============================================================================
// Q-Learning Router Interface
// ============================================================================

/**
 * Test task for routing
 */
export interface TestTask {
  id: string;
  name: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'accessibility';
  domain?: DomainName;
  filePath?: string;
  complexity?: number;
  priority?: Priority;
  dependencies?: string[];
  estimatedDurationMs?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Agent routing result
 */
export interface AgentRoutingResult {
  /** Recommended agent type */
  agentType: AgentType;
  /** Domain to route to */
  domain: DomainName;
  /** Confidence score 0-1 */
  confidence: number;
  /** Reasoning for the routing decision */
  reasoning: string;
  /** Alternative agents ranked by suitability */
  alternatives: Array<{
    agentType: AgentType;
    domain: DomainName;
    confidence: number;
  }>;
  /** Q-values for debugging */
  qValues?: Record<string, number>;
  /** Whether this used fallback logic */
  usedFallback: boolean;
}

/**
 * Q-Learning state for reinforcement learning
 */
export interface QLearningState {
  taskType: string;
  complexity: number;
  priority: Priority;
  domain?: DomainName;
  contextHash: string;
}

/**
 * Q-Learning action (agent assignment)
 */
export interface QLearningAction {
  agentType: AgentType;
  domain: DomainName;
}

/**
 * Q-Learning router for optimal agent selection
 */
export interface QLearningRouter {
  /** Route a test task to optimal agent */
  routeTask(task: TestTask): Promise<AgentRoutingResult>;

  /** Batch route multiple tasks */
  routeTasks(tasks: TestTask[]): Promise<AgentRoutingResult[]>;

  /** Provide feedback for learning */
  provideFeedback(
    taskId: string,
    result: { success: boolean; durationMs: number; quality: number }
  ): Promise<void>;

  /** Get Q-value for state-action pair */
  getQValue(state: QLearningState, action: QLearningAction): number;

  /** Reset learning state */
  reset(): Promise<void>;

  /** Export learned model */
  exportModel(): Promise<Record<string, unknown>>;

  /** Import learned model */
  importModel(model: Record<string, unknown>): Promise<void>;
}

// ============================================================================
// AST Complexity Analyzer Interface
// ============================================================================

/**
 * Code complexity metrics
 */
export interface ComplexityMetrics {
  /** Cyclomatic complexity */
  cyclomatic: number;
  /** Cognitive complexity */
  cognitive: number;
  /** Lines of code */
  linesOfCode: number;
  /** Number of dependencies */
  dependencies: number;
  /** Depth of inheritance */
  inheritanceDepth: number;
  /** Coupling score */
  coupling: number;
  /** Cohesion score */
  cohesion: number;
  /** Halstead difficulty */
  halsteadDifficulty?: number;
  /** Maintainability index */
  maintainabilityIndex: number;
}

/**
 * File complexity analysis result
 */
export interface FileComplexityResult {
  filePath: string;
  metrics: ComplexityMetrics;
  /** Overall complexity score 0-1 (higher = more complex) */
  overallScore: number;
  /** Risk level based on complexity */
  riskLevel: Severity;
  /** Functions/methods with highest complexity */
  hotspots: Array<{
    name: string;
    line: number;
    complexity: number;
    recommendation?: string;
  }>;
  /** Recommendations for reducing complexity */
  recommendations: string[];
  /** Analysis timestamp */
  analyzedAt: Date;
  /** Whether this used fallback logic */
  usedFallback: boolean;
}

/**
 * AST-based code complexity analyzer
 */
export interface ASTComplexityAnalyzer {
  /** Analyze complexity of a single file */
  analyzeFile(filePath: string): Promise<FileComplexityResult>;

  /** Analyze complexity of multiple files */
  analyzeFiles(filePaths: string[]): Promise<FileComplexityResult[]>;

  /** Get complexity ranking for test prioritization */
  getComplexityRanking(filePaths: string[]): Promise<Array<{
    filePath: string;
    score: number;
    priority: Priority;
  }>>;

  /** Suggest test focus areas based on complexity */
  suggestTestFocus(filePaths: string[]): Promise<Array<{
    filePath: string;
    functions: string[];
    reason: string;
  }>>;
}

// ============================================================================
// Diff Risk Classifier Interface
// ============================================================================

/**
 * File change information
 */
export interface FileChange {
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  oldPath?: string;
  hunks?: Array<{
    startLine: number;
    endLine: number;
    content: string;
  }>;
}

/**
 * Diff context for risk analysis
 */
export interface DiffContext {
  files: FileChange[];
  commitHash?: string;
  baseBranch?: string;
  targetBranch?: string;
  author?: string;
  message?: string;
}

/**
 * Risk classification for a change
 */
export interface RiskClassification {
  /** Overall risk level */
  level: Severity;
  /** Risk score 0-1 */
  score: number;
  /** Risk factors identified */
  factors: Array<{
    name: string;
    weight: number;
    description: string;
  }>;
  /** Files requiring focused testing */
  highRiskFiles: string[];
  /** Recommended test types */
  recommendedTests: Array<{
    type: 'unit' | 'integration' | 'e2e' | 'security' | 'performance';
    priority: Priority;
    reason: string;
  }>;
  /** Whether this used fallback logic */
  usedFallback: boolean;
}

/**
 * Diff risk classifier for targeting tests at high-risk changes
 */
export interface DiffRiskClassifier {
  /** Classify risk of a diff/changeset */
  classifyDiff(context: DiffContext): Promise<RiskClassification>;

  /** Get files sorted by risk */
  rankFilesByRisk(files: FileChange[]): Promise<Array<{
    filePath: string;
    riskScore: number;
    riskLevel: Severity;
  }>>;

  /** Check if change requires security review */
  requiresSecurityReview(context: DiffContext): Promise<boolean>;

  /** Get recommended reviewers based on risk */
  getRecommendedReviewers(context: DiffContext): Promise<string[]>;

  /** Predict potential defects in change */
  predictDefects(context: DiffContext): Promise<Array<{
    filePath: string;
    probability: number;
    type: string;
    location?: { line: number; column: number };
  }>>;
}

// ============================================================================
// Coverage Router Interface
// ============================================================================

/**
 * Coverage information for a file
 */
export interface FileCoverage {
  filePath: string;
  lineCoverage: number;
  branchCoverage: number;
  functionCoverage: number;
  statementCoverage: number;
  uncoveredLines: number[];
  uncoveredBranches: Array<{ line: number; branch: number }>;
  uncoveredFunctions: string[];
}

/**
 * Coverage gap analysis result
 */
export interface CoverageGap {
  filePath: string;
  gapType: 'line' | 'branch' | 'function' | 'integration';
  severity: Severity;
  lines?: number[];
  functions?: string[];
  recommendation: string;
}

/**
 * Coverage-based routing result
 */
export interface CoverageRoutingResult {
  /** Files needing more test coverage */
  prioritizedFiles: Array<{
    filePath: string;
    currentCoverage: number;
    targetCoverage: number;
    gaps: CoverageGap[];
    priority: Priority;
  }>;
  /** Suggested test generation targets */
  testGenerationTargets: Array<{
    filePath: string;
    functions: string[];
    reason: string;
  }>;
  /** Agent assignments for coverage improvement */
  agentAssignments: Array<{
    agentType: AgentType;
    domain: DomainName;
    files: string[];
  }>;
  /** Whether this used fallback logic */
  usedFallback: boolean;
}

/**
 * Coverage-aware router for test prioritization
 */
export interface CoverageRouter {
  /** Analyze coverage and route agents */
  analyzeCoverage(
    coverageData: FileCoverage[],
    targetCoverage?: number
  ): Promise<CoverageRoutingResult>;

  /** Get coverage gaps */
  getCoverageGaps(coverageData: FileCoverage[]): Promise<CoverageGap[]>;

  /** Prioritize files for coverage improvement */
  prioritizeForCoverage(
    files: string[],
    coverageData: FileCoverage[]
  ): Promise<string[]>;

  /** Suggest tests to improve coverage */
  suggestTestsForCoverage(
    filePath: string,
    coverage: FileCoverage
  ): Promise<Array<{
    testType: string;
    target: string;
    expectedCoverageGain: number;
  }>>;
}

// ============================================================================
// Graph Boundaries Analyzer Interface
// ============================================================================

/**
 * Module dependency information
 */
export interface ModuleDependency {
  source: string;
  target: string;
  type: 'import' | 'export' | 'call' | 'reference';
  weight: number;
}

/**
 * Module boundary analysis
 */
export interface ModuleBoundary {
  module: string;
  files: string[];
  publicAPIs: string[];
  dependencies: ModuleDependency[];
  /** Coupling score with other modules */
  couplingScore: number;
  /** Cohesion score within module */
  cohesionScore: number;
}

/**
 * Boundary crossing analysis
 */
export interface BoundaryCrossing {
  fromModule: string;
  toModule: string;
  crossings: Array<{
    sourceFile: string;
    targetFile: string;
    type: string;
    line: number;
  }>;
  /** Risk score for this boundary */
  riskScore: number;
  /** Whether integration tests should cover this boundary */
  requiresIntegrationTest: boolean;
}

/**
 * Graph boundaries analysis result
 */
export interface GraphBoundariesResult {
  modules: ModuleBoundary[];
  boundaries: BoundaryCrossing[];
  /** Critical boundaries needing tests */
  criticalBoundaries: string[];
  /** Suggested integration test locations */
  integrationTestSuggestions: Array<{
    fromModule: string;
    toModule: string;
    reason: string;
    priority: Priority;
  }>;
  /** Architecture violations detected */
  violations: Array<{
    type: 'circular-dependency' | 'layer-violation' | 'coupling-too-high';
    modules: string[];
    severity: Severity;
    suggestion: string;
  }>;
  /** Whether this used fallback logic */
  usedFallback: boolean;
}

/**
 * Graph boundaries analyzer for focusing integration tests
 */
export interface GraphBoundariesAnalyzer {
  /** Analyze module boundaries in codebase */
  analyzeBoundaries(entryPoints: string[]): Promise<GraphBoundariesResult>;

  /** Get boundary crossings for specific modules */
  getBoundaryCrossings(modules: string[]): Promise<BoundaryCrossing[]>;

  /** Identify critical paths across modules */
  getCriticalPaths(): Promise<Array<{
    path: string[];
    importance: number;
    reason: string;
  }>>;

  /** Suggest integration test locations */
  suggestIntegrationTests(): Promise<Array<{
    location: string;
    modules: string[];
    priority: Priority;
    reason: string;
  }>>;

  /** Detect architecture violations */
  detectViolations(): Promise<Array<{
    type: string;
    location: string;
    severity: Severity;
    suggestion: string;
  }>>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * RuVector error types
 */
export class RuVectorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RuVectorError';
  }
}

export class RuVectorUnavailableError extends RuVectorError {
  constructor(message: string = 'RuVector service is unavailable', cause?: Error) {
    super(message, 'RUVECTOR_UNAVAILABLE', cause);
    this.name = 'RuVectorUnavailableError';
  }
}

export class RuVectorTimeoutError extends RuVectorError {
  constructor(message: string = 'RuVector operation timed out', cause?: Error) {
    super(message, 'RUVECTOR_TIMEOUT', cause);
    this.name = 'RuVectorTimeoutError';
  }
}

export class RuVectorConfigError extends RuVectorError {
  constructor(message: string, cause?: Error) {
    super(message, 'RUVECTOR_CONFIG_ERROR', cause);
    this.name = 'RuVectorConfigError';
  }
}
