/**
 * Core type definitions for the Agentic QE Fleet
 */

export interface AgentId {
  id: string;
  type: QEAgentType;
  created: Date;
}

export interface AgentConfig {
  type: string;
  count: number;
  config: Record<string, unknown>;
}

export enum AgentStatus {
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  ACTIVE = 'active',
  BUSY = 'busy',
  ERROR = 'error',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated'
}

export interface AgentContext {
  id: string;
  type: string;
  status: AgentStatus;
  metadata?: Record<string, unknown>;
}

export interface FleetConfig {
  agents: AgentConfig[];
  database?: {
    type: 'sqlite' | 'memory';
    path?: string;
  };
  eventBus?: {
    type: 'memory' | 'redis';
    host?: string;
    port?: number;
  };
  topology?: 'hierarchical' | 'mesh' | 'ring' | 'adaptive';
  maxAgents?: number;
  project?: Record<string, unknown>;
  testingFocus?: string[];
  environments?: string[];
  frameworks?: string[];
  routing?: {
    enabled?: boolean;
    defaultModel?: string;
    enableCostTracking?: boolean;
    enableFallback?: boolean;
    maxRetries?: number;
    costThreshold?: number;
    modelPreferences?: Record<string, unknown>;
  };
  streaming?: {
    enabled?: boolean;
    progressInterval?: number;
    bufferEvents?: boolean;
    timeout?: number;
  };
}

export interface TaskSpec {
  id: string;
  type: string;
  priority: number;
  payload: unknown;
  timeout?: number;
  dependencies?: string[];
}

export interface AgentCapability {
  name: string;
  version: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface TopologyNode {
  id: string;
  type: string;
  connections: string[];
  position?: { x: number; y: number };
}

export interface CoordinationEvent {
  type: string;
  source: string;
  target?: string;
  payload: unknown;
  timestamp: number;
}

export interface MemoryRecord {
  key: string;
  value: unknown;
  namespace: string;
  ttl?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export enum QEAgentType {
  TEST_GENERATOR = 'test-generator',
  TEST_EXECUTOR = 'test-executor',
  COVERAGE_ANALYZER = 'coverage-analyzer',
  QUALITY_ANALYZER = 'quality-analyzer',
  PERFORMANCE_TESTER = 'performance-tester',
  SECURITY_SCANNER = 'security-scanner',
  QUALITY_GATE = 'quality-gate',
  CHAOS_ENGINEER = 'chaos-engineer',
  VISUAL_TESTER = 'visual-tester',
  FLEET_COMMANDER = 'fleet-commander',

  // NEW - Week 1 P0 Strategic Agents
  REQUIREMENTS_VALIDATOR = 'requirements-validator',
  PRODUCTION_INTELLIGENCE = 'production-intelligence',

  // NEW - Week 2+ Agents (prepared for future implementation)
  DEPLOYMENT_READINESS = 'deployment-readiness',
  REGRESSION_RISK_ANALYZER = 'regression-risk-analyzer',
  TEST_DATA_ARCHITECT = 'test-data-architect',
  API_CONTRACT_VALIDATOR = 'api-contract-validator',
  FLAKY_TEST_HUNTER = 'flaky-test-hunter',

  // NEW - Quality Experience (QX) Agent
  QX_PARTNER = 'qx-partner',

  // Accessibility Testing Agent
  ACCESSIBILITY_ALLY = 'accessibility-ally',

  // Code Intelligence Agent (Wave 6)
  CODE_INTELLIGENCE = 'code-intelligence',

  // Product Factors Assessor Agent (SFDIPOT)
  PRODUCT_FACTORS_ASSESSOR = 'qe-product-factors-assessor',

  // Quality Criteria Recommender Agent (HTSM)
  QUALITY_CRITERIA_RECOMMENDER = 'qe-quality-criteria-recommender'
}

// Alias for backward compatibility
export type AgentType = QEAgentType;

export enum EventType {
  AGENT_SPAWNED = 'agent.spawned',
  AGENT_TERMINATED = 'agent.terminated',
  AGENT_INITIALIZED = 'agent.initialized',
  AGENT_ERROR = 'agent.error',
  AGENT_PING = 'agent.ping',
  AGENT_PONG = 'agent.pong',
  TEST_GENERATED = 'test.generated',
  TEST_EXECUTED = 'test.executed',
  QUALITY_GATE_EVALUATED = 'quality.gate.evaluated',
  QUALITY_DEFECT_PREDICTED = 'quality.defect.predicted',
  SYSTEM_ERROR = 'system.error',
  SYSTEM_PERFORMANCE = 'system.performance',
  FLEET_SHUTDOWN = 'fleet.shutdown',
  TASK_SUBMITTED = 'task:submitted',
  TASK_STARTED = 'task:started',
  TASK_COMPLETED = 'task:completed',
  TASK_FAILED = 'task:failed',
  FLEET_STARTED = 'fleet:started',
  FLEET_STOPPED = 'fleet:stopped',
  COORDINATION_UPDATE = 'coordination:update'
}

export interface QETestResult {
  id: string;
  type: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  assertions: number;
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
  };
  errors?: string[];
  metadata?: Record<string, unknown>;
}

export interface QualityMetrics {
  coverage: {
    line: number;
    branch: number;
    function: number;
  };
  testResults: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  performance: {
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
  };
  security: {
    vulnerabilities: number;
    riskScore: number;
  };
}

// Additional types for agent system
export interface QEEvent {
  id: string;
  type: string;
  source: AgentId;
  target?: AgentId;
  data: unknown;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  scope: 'local' | 'global';
  category?: 'agent' | 'test' | 'quality' | 'system';
}

export interface EventHandler<T = unknown> {
  eventType: string;
  handler: (event: QEEvent) => void | Promise<void>;
}

export interface MemoryStore {
  store(key: string, value: unknown, ttl?: number): Promise<void>;
  retrieve(key: string): Promise<unknown>;
  set(key: string, value: unknown, namespace?: string): Promise<void>;
  get(key: string, namespace?: string): Promise<unknown>;
  delete(key: string, namespace?: string): Promise<boolean>;
  clear(namespace?: string): Promise<void>;
}

export interface QETask {
  id: string;
  type: string;
  payload: unknown;
  priority: number;
  status: string;
  result?: unknown;
  error?: Error;
  description?: string;
  context?: Record<string, unknown>;
  requirements?: {
    capabilities?: string[];
    resources?: Record<string, unknown>;
  };
}

export interface TaskAssignment {
  id: string;
  task: QETask;
  agentId: string;
  assignedAt: Date;
  status: string;
}

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: AgentId;
  to: AgentId;
  payload: unknown;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export enum MessageType {
  COMMAND = 'command',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  REQUEST = 'request'
}

// Test generation types
export interface TestSuite {
  id: string;
  name: string;
  tests: Test[];
  metadata: TestSuiteMetadata;
}

export interface Test {
  id: string;
  name: string;
  type: TestType;
  parameters: TestParameter[];
  assertions: string[];
  expectedResult: unknown;
  estimatedDuration?: number;
  code?: string; // Optional generated test code (from pattern templates)
  metadata?: Record<string, unknown>; // Optional metadata for test tracking
}

export enum TestType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  PERFORMANCE = 'performance',
  SECURITY = 'security'
}

export interface TestParameter {
  name: string;
  value: unknown;
  type: string;
}

export interface TestSuiteMetadata {
  generatedAt: Date;
  coverageTarget: number;
  framework: string;
  estimatedDuration: number;
  generationStrategy?: string;
  coverageProjection?: number;
  optimizationMetrics?: {
    optimizationRatio: number;
    [key: string]: unknown;
  };
}

export interface DefectPrediction {
  location: string;
  probability: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  reasoning: string;
}

export interface CoverageReport {
  overall: number;
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

export interface SublinearMatrix {
  rows: number;
  cols: number;
  values: number[];
  rowIndices: number[];
  colIndices: number[];
  format?: string;
  data?: {
    values: number[];
    rowIndices: number[];
    colIndices: number[];
  };
}

export interface SublinearSolution {
  solution: number[];
  iterations: number;
  convergence: boolean;
  convergenceTime?: number;
  error?: string;
}

// CLI-specific interfaces
export interface CLIOptions {
  verbose?: boolean;
  config?: string;
  dryRun?: boolean;
}

export interface InitOptions extends CLIOptions {
  topology: 'hierarchical' | 'mesh' | 'ring' | 'adaptive';
  maxAgents: string;
  focus: string;
  environments: string;
  frameworks?: string;
  force?: boolean;  // Force overwrite existing agent files
  // Phase 2 options (v1.1.0)
  enableLearning?: boolean;
  enablePatterns?: boolean;
  enableImprovement?: boolean;
  // Non-interactive mode
  yes?: boolean;           // -y flag: skip prompts, use defaults
  nonInteractive?: boolean; // --non-interactive: same as -y
}

export interface GenerateOptions extends CLIOptions {
  type: string;
  coverageTarget: string;
  path: string;
  output: string;
  framework: string;
  fromSwagger?: string;
  propertyBased?: boolean;
  mutationTesting?: boolean;
}

export interface RunOptions extends CLIOptions {
  parallel?: boolean;
  env: string;
  suite?: string;
  timeout: string;
  retryFlaky: string;
  concurrency: string;
  reporter: string;
  coverage?: boolean;
}

export interface AnalyzeOptions extends CLIOptions {
  gaps?: boolean;
  recommendations?: boolean;
  metrics?: boolean;
  trends?: boolean;
  period: string;
  format: string;
  threshold: string;
}

export interface FleetOptions extends CLIOptions {
  agents?: string;
  env: string;
  interval: string;
  topology?: string;
  healthCheck?: boolean;
}

// Week 1 Agent Configuration Interfaces
export interface RequirementsValidatorConfig {
  testabilityThreshold?: number;
  ambiguityThreshold?: number;
  bddTemplates?: string[];
  nlpEngine?: 'openai' | 'local' | 'mock';
  investCriteria?: {
    independent?: boolean;
    negotiable?: boolean;
    valuable?: boolean;
    estimable?: boolean;
    small?: boolean;
    testable?: boolean;
  };
}

export interface ProductionIntelligenceConfig {
  observabilityTools?: Array<'datadog' | 'newrelic' | 'grafana' | 'prometheus'>;
  incidentThreshold?: number;
  rumSamplingRate?: number;
  loadPatternWindow?: number;
  replayGenerationEnabled?: boolean;
  integrations?: Record<string, unknown>;
}

export interface FleetCommanderConfig {
  maxAgentsPerType?: number;
  healthCheckInterval?: number;
  autoScalingEnabled?: boolean;
  failureRecoveryStrategy?: 'restart' | 'replace' | 'isolate';
  loadBalancingAlgorithm?: 'round-robin' | 'least-loaded' | 'priority';
  coordinationTopology?: 'hierarchical' | 'mesh' | 'ring';
}

// Week 2+ Agent Configuration Interfaces (prepared for future)
export interface DeploymentReadinessConfig {
  integrations?: {
    qualityGate?: boolean;
    performance?: boolean;
    security?: boolean;
    monitoring?: string[];
  };
  thresholds?: {
    minConfidenceScore?: number;
    reviewThreshold?: number;
    maxRollbackRisk?: number;
    maxOpenIncidents?: number;
  };
  checklist?: {
    requiredApprovals?: string[];
    requiredTests?: string[];
    requiredMetrics?: string[];
  };
  // Legacy fields for backward compatibility
  riskThreshold?: number;
  confidenceLevel?: number;
  rollbackRiskWeight?: number;
  checklistItems?: string[];
  stakeholderReports?: boolean;
}

// Week 3+ P1 Optimization Agent Configuration Interfaces
export interface RegressionRiskAnalyzerConfig {
  gitIntegration?: {
    enabled?: boolean;
    defaultBranch?: string;
    remoteName?: string;
  };
  analysis?: {
    astParsing?: boolean;
    mlPatterns?: boolean;
    historicalData?: boolean;
    impactRadius?: number;
  };
  testSelection?: {
    strategy?: 'smart' | 'conservative' | 'aggressive';
    maxTestsPerChange?: number;
    minCoverageThreshold?: number;
  };
  riskScoring?: {
    fileChangeWeight?: number;
    complexityWeight?: number;
    historyWeight?: number;
    dependencyWeight?: number;
  };
}

export interface TestDataArchitectConfig {
  generation?: {
    recordsPerSecond?: number;
    maxRecordsPerRun?: number;
    seedStrategy?: 'random' | 'deterministic';
  };
  dataQuality?: {
    referentialIntegrity?: boolean;
    piiAnonymization?: boolean;
    dataRealism?: 'low' | 'medium' | 'high';
  };
  schemaIntrospection?: {
    databases?: string[];
    autoDetect?: boolean;
    includeViews?: boolean;
  };
}

export interface ApiContractValidatorConfig {
  schemas?: {
    openApi?: boolean;
    graphql?: boolean;
    protobuf?: boolean;
  };
  validation?: {
    strictMode?: boolean;
    breakingChangeDetection?: boolean;
    versionCompatibility?: boolean;
  };
  impact?: {
    consumerAnalysis?: boolean;
    backwardCompatibility?: boolean;
    deprecationWarnings?: boolean;
  };
}

export interface FlakyTestHunterConfig {
  detection?: {
    repeatedRuns?: number;
    parallelExecutions?: number;
    timeWindow?: number;
  };
  analysis?: {
    rootCauseIdentification?: boolean;
    patternRecognition?: boolean;
    environmentalFactors?: boolean;
  };
  remediation?: {
    autoStabilization?: boolean;
    quarantineEnabled?: boolean;
    retryAttempts?: number;
  };
  reporting?: {
    trendTracking?: boolean;
    flakinessScore?: boolean;
    recommendationEngine?: boolean;
  };
}

// Week 2 Enhanced Configuration Interfaces
export interface PerformanceTesterConfig {
  tools?: {
    loadTesting?: 'k6' | 'jmeter' | 'gatling' | 'artillery';
    monitoring?: string[];
    apm?: 'newrelic' | 'datadog' | 'dynatrace';
  };
  thresholds?: {
    maxLatencyP95?: number;
    maxLatencyP99?: number;
    minThroughput?: number;
    maxErrorRate?: number;
    maxCpuUsage?: number;
    maxMemoryUsage?: number;
  };
  loadProfile?: {
    virtualUsers?: number;
    duration?: number;
    rampUpTime?: number;
    pattern?: 'constant' | 'ramp-up' | 'spike' | 'stress' | 'soak';
  };
}

export interface SecurityScannerConfig {
  tools?: {
    sast?: 'sonarqube' | 'checkmarx' | 'semgrep';
    dast?: 'owasp-zap' | 'burp-suite';
    dependencies?: 'npm-audit' | 'snyk' | 'dependabot';
    containers?: 'trivy' | 'clair' | 'aqua';
  };
  thresholds?: {
    maxCriticalVulnerabilities?: number;
    maxHighVulnerabilities?: number;
    maxMediumVulnerabilities?: number;
    minSecurityScore?: number;
  };
  compliance?: {
    standards?: string[];
    enforceCompliance?: boolean;
  };
  scanScope?: {
    includeCode?: boolean;
    includeDependencies?: boolean;
    includeContainers?: boolean;
    includeDynamic?: boolean;
  };
}

// Memory namespace definitions for agent coordination
export const AQE_MEMORY_NAMESPACES = {
  REQUIREMENTS: 'aqe/requirements',
  PRODUCTION: 'aqe/production',
  FLEET: 'aqe/fleet',
  DEPLOYMENT: 'aqe/deployment',
  PERFORMANCE: 'aqe/performance',
  SECURITY: 'aqe/security',
  // Week 3+ P1 Optimization Agent Namespaces
  REGRESSION: 'aqe/regression',
  TEST_DATA: 'aqe/test-data',
  API_CONTRACT: 'aqe/api-contract',
  FLAKY_TESTS: 'aqe/flaky-tests'
} as const;

// Event types for Week 1 agents
export const WEEK1_EVENT_TYPES = {
  REQUIREMENTS_VALIDATED: 'requirements.validated',
  REQUIREMENTS_AMBIGUOUS: 'requirements.ambiguous',
  REQUIREMENTS_BDD_GENERATED: 'requirements.bdd.generated',
  PRODUCTION_INCIDENT: 'production.incident',
  PRODUCTION_PATTERN_DETECTED: 'production.pattern.detected',
  PRODUCTION_TEST_GENERATED: 'production.test.generated',
  FLEET_HEALTH: 'fleet.health',
  FLEET_SCALING: 'fleet.scaling',
  FLEET_FAILURE_RECOVERY: 'fleet.failure.recovery'
} as const;

// Event types for Week 2 agents
export const WEEK2_EVENT_TYPES = {
  DEPLOYMENT_READY: 'deployment.ready',
  DEPLOYMENT_BLOCKED: 'deployment.blocked',
  DEPLOYMENT_RISK_HIGH: 'deployment.risk.high',
  DEPLOYMENT_CHECKLIST_COMPLETE: 'deployment.checklist.complete',
  PERFORMANCE_TEST_STARTED: 'performance.test.started',
  PERFORMANCE_TEST_COMPLETED: 'performance.test.completed',
  PERFORMANCE_BOTTLENECK: 'performance.bottleneck.detected',
  PERFORMANCE_THRESHOLD_EXCEEDED: 'performance.threshold.exceeded',
  SECURITY_SCAN_STARTED: 'security.scan.started',
  SECURITY_SCAN_COMPLETE: 'security.scan.completed',
  SECURITY_CRITICAL_FOUND: 'security.critical.found',
  SECURITY_VULNERABILITY_DETECTED: 'security.vulnerability.detected'
} as const;

// Event types for Week 3+ P1 Optimization agents
export const WEEK3_EVENT_TYPES = {
  REGRESSION_RISK_HIGH: 'regression.risk.high',
  TEST_SELECTION_OPTIMIZED: 'test.selection.optimized',
  TEST_DATA_GENERATED: 'test.data.generated',
  API_CONTRACT_VALIDATED: 'api.contract.validated',
  BREAKING_CHANGE_DETECTED: 'api.breaking.change.detected',
  FLAKY_TEST_DETECTED: 'test.flaky.detected',
  TEST_QUARANTINED: 'test.quarantined',
  TEST_STABILIZED: 'test.stabilized'
} as const;

// Embedding Generation Types
export interface EmbeddingOptions {
  useML?: boolean;
  useCache?: boolean;
  normalize?: boolean;
  language?: string;
  model?: 'text' | 'code';
  dimension?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  dimension: number;
  method: 'hash' | 'ml';
  generationTime: number;
  cached: boolean;
  model: string;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTime: number;
  avgTime: number;
  cacheHits: number;
  method: 'hash' | 'ml';
}

export interface CacheStats {
  textCount: number;
  codeCount: number;
  totalCount: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number;
  maxSize: number;
}

// Re-export hook types
export * from './hook.types';

// Re-export QUIC types
export * from './quic';