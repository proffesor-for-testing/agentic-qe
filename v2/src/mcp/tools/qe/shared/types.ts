/**
 * Shared QE Types for Domain-Specific Tools
 *
 * This module defines strict TypeScript types for all QE domains.
 * All types use strict TypeScript with no 'any' types.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 * @date 2025-11-07
 */

// ==================== Core Enums ====================

export type TestType = 'unit' | 'integration' | 'e2e' | 'property-based' | 'mutation';
export type TestFramework = 'jest' | 'mocha' | 'jasmine' | 'pytest' | 'junit' | 'nunit' | 'xunit' | 'cucumber-js';
export type ProgrammingLanguage = 'javascript' | 'typescript' | 'python' | 'java' | 'csharp' | 'go' | 'rust' | 'ruby';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Environment = 'development' | 'staging' | 'production';
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending';
export type CoverageType = 'line' | 'branch' | 'function' | 'statement';

// ==================== Test Generation Domain ====================

/**
 * Parameters for generating unit test suites
 */
export interface UnitTestGenerationParams {
  /** Source code information */
  sourceCode: SourceCodeInfo;

  /** Optional: Target a specific class */
  targetClass?: string;

  /** Optional: Target a specific function */
  targetFunction?: string;

  /** Testing framework to use */
  framework: TestFramework;

  /** Coverage target percentage (0-100) */
  coverageTarget: number;

  /** Include edge case tests */
  includeEdgeCases: boolean;

  /** Generate mock implementations */
  generateMocks: boolean;

  /** Test patterns to apply */
  testPatterns: TestPattern[];

  /** Optional: Custom test data */
  testData?: Record<string, unknown>;
}

/**
 * Parameters for generating integration test suites
 */
export interface IntegrationTestGenerationParams {
  /** Source code information */
  sourceCode: SourceCodeInfo;

  /** Dependency mapping for integration points */
  dependencyMap: DependencyInfo[];

  /** Testing framework to use */
  framework: TestFramework;

  /** Mock strategy for dependencies */
  mockStrategy: 'full' | 'partial' | 'none';

  /** Enable contract testing */
  contractTesting: boolean;

  /** Optional: Integration scenarios */
  scenarios?: IntegrationScenario[];
}

/**
 * Parameters for generating end-to-end test suites
 */
export interface E2ETestGenerationParams {
  /** User flows to test */
  userFlows: UserFlow[];

  /** Page object models for UI interaction */
  pageObjects: PageObjectModel[];

  /** Testing framework to use */
  framework: TestFramework;

  /** Browser targets for testing */
  browserTargets: string[];

  /** Base URL for application */
  baseUrl: string;

  /** Viewport configurations */
  viewports?: ViewportConfig[];
}

/**
 * Parameters for property-based testing
 */
export interface PropertyBasedTestParams {
  /** Source code information */
  sourceCode: SourceCodeInfo;

  /** Properties to test */
  properties: PropertyInvariant[];

  /** Generator strategy */
  generatorStrategy: 'quickcheck' | 'hypothesis' | 'fast-check';

  /** Number of test iterations */
  iterations: number;

  /** Seed for reproducibility */
  seed?: number;
}

/**
 * Parameters for mutation testing
 */
export interface MutationTestParams {
  /** Source code to mutate */
  sourceCode: string;

  /** Test code to validate mutations */
  testCode: string;

  /** Programming language */
  language: ProgrammingLanguage;

  /** Mutation operators to apply */
  operators: MutationOperator[];

  /** Timeout per mutant (ms) */
  timeout: number;

  /** Number of parallel mutants */
  parallelMutants: number;

  /** Calculate coverage during mutation */
  calculateCoverage: boolean;
}

/**
 * Source code information
 */
export interface SourceCodeInfo {
  /** Repository URL */
  repositoryUrl: string;

  /** Branch or commit */
  branch: string;

  /** Programming language */
  language: ProgrammingLanguage;

  /** Files to analyze (glob patterns) */
  files: string[];

  /** Patterns to exclude */
  excludePatterns?: string[];

  /** Build configuration */
  buildConfig?: BuildConfig;
}

/**
 * Dependency information for integration testing
 */
export interface DependencyInfo {
  /** Dependency name */
  name: string;

  /** Dependency type */
  type: 'internal' | 'external';

  /** Version (for external dependencies) */
  version?: string;

  /** Exposed interfaces */
  interfaces: InterfaceDefinition[];

  /** Mock configuration */
  mockConfig?: MockConfig;
}

/**
 * User flow for E2E testing
 */
export interface UserFlow {
  /** Flow name */
  name: string;

  /** Description */
  description: string;

  /** Flow steps */
  steps: FlowStep[];

  /** Expected outcome */
  expectedOutcome: string;

  /** Prerequisites */
  prerequisites?: string[];
}

/**
 * Property invariant for property-based testing
 */
export interface PropertyInvariant {
  /** Property name */
  name: string;

  /** Description */
  description: string;

  /** Property expression (code) */
  property: string;

  /** Input generators */
  generators?: Record<string, string>;
}

/**
 * Mutation operators
 */
export type MutationOperator =
  | 'arithmetic'        // +, -, *, /
  | 'logical'           // &&, ||, !
  | 'relational'        // <, >, <=, >=, ==, !=
  | 'assignment'        // =, +=, -=
  | 'conditional'       // if, else, switch
  | 'statement-deletion' // Remove statements
  | 'return-value';     // Modify return values

/**
 * Test patterns
 */
export type TestPattern =
  | 'arrange-act-assert'
  | 'given-when-then'
  | 'builder'
  | 'object-mother'
  | 'four-phase-test';

// ==================== Coverage Domain ====================

/**
 * Parameters for sublinear coverage analysis
 */
export interface SublinearCoverageParams {
  /** Source files to analyze */
  sourceFiles: string[];

  /** Coverage threshold (0-1) */
  coverageThreshold: number;

  /** Sublinear algorithm to use */
  algorithm: 'johnson-lindenstrauss' | 'temporal-advantage' | 'hybrid';

  /** Target dimension for JL reduction */
  targetDimension?: number;

  /** Include uncovered line numbers */
  includeUncoveredLines: boolean;

  /** Analysis depth */
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
}

/**
 * Parameters for coverage gap detection
 */
export interface CoverageGapDetectionParams {
  /** Coverage data to analyze */
  coverageData: CoverageReport;

  /** Prioritization strategy */
  prioritization: 'complexity' | 'criticality' | 'change-frequency';

  /** Minimum gap size to report */
  minGapSize: number;

  /** Include recommendations */
  includeRecommendations: boolean;

  /** Maximum gaps to return */
  maxGaps?: number;
}

/**
 * Parameters for detailed coverage analysis
 */
export interface DetailedCoverageParams {
  /** Coverage data to analyze */
  coverageData: CoverageReport;

  /** Analysis type */
  analysisType: 'line' | 'branch' | 'function' | 'comprehensive';

  /** Detail level */
  detailLevel: 'basic' | 'detailed' | 'comprehensive';

  /** Compare with previous coverage */
  comparePrevious: boolean;

  /** Historical coverage data */
  historicalData?: CoverageReport[];

  /** Identify gaps */
  identifyGaps: boolean;

  /** Prioritize gaps */
  prioritizeGaps: boolean;
}

/**
 * Coverage report structure
 */
export interface CoverageReport {
  /** File-level coverage */
  files: FileCoverage[];

  /** Summary statistics */
  summary: CoverageSummary;

  /** Timestamp */
  timestamp: string;

  /** Git commit */
  commit?: string;
}

/**
 * File-level coverage information
 */
export interface FileCoverage {
  /** File path */
  path: string;

  /** Line coverage */
  lines: LineCoverage;

  /** Branch coverage */
  branches: BranchCoverage;

  /** Function coverage */
  functions: FunctionCoverage;

  /** File importance */
  importance: Priority;

  /** Complexity metrics */
  complexity?: number;
}

/**
 * Line coverage metrics
 */
export interface LineCoverage {
  /** Total lines */
  total: number;

  /** Covered lines */
  covered: number;

  /** Uncovered line numbers */
  uncovered: number[];

  /** Coverage percentage */
  percentage: number;
}

/**
 * Branch coverage metrics
 */
export interface BranchCoverage {
  /** Total branches */
  total: number;

  /** Covered branches */
  covered: number;

  /** Uncovered branch numbers */
  uncovered: number[];

  /** Coverage percentage */
  percentage: number;
}

/**
 * Function coverage metrics
 */
export interface FunctionCoverage {
  /** Total functions */
  total: number;

  /** Covered functions */
  covered: number;

  /** Uncovered function names */
  uncovered: string[];

  /** Coverage percentage */
  percentage: number;
}

/**
 * Coverage summary
 */
export interface CoverageSummary {
  /** Total lines */
  totalLines: number;

  /** Covered lines */
  coveredLines: number;

  /** Total branches */
  totalBranches: number;

  /** Covered branches */
  coveredBranches: number;

  /** Total functions */
  totalFunctions: number;

  /** Covered functions */
  coveredFunctions: number;

  /** Overall coverage percentage */
  overallPercentage: number;
}

// ==================== Quality Gates Domain ====================

/**
 * Parameters for quality gate execution
 */
export interface QualityGateExecutionParams {
  /** Project identifier */
  projectId: string;

  /** Build identifier */
  buildId: string;

  /** Target environment */
  environment: Environment;

  /** Quality policy to enforce */
  policy: QualityPolicy;

  /** Quality metrics to validate */
  metrics: QualityMetrics;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Quality policy definition
 */
export interface QualityPolicy {
  /** Policy ID */
  id: string;

  /** Policy name */
  name: string;

  /** Quality rules */
  rules: QualityRule[];

  /** Enforcement mode */
  enforcement: 'blocking' | 'warning' | 'informational';

  /** Applicable environments */
  environments: Environment[];
}

/**
 * Quality rule definition
 */
export interface QualityRule {
  /** Metric name */
  metric: string;

  /** Comparison operator */
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'ne';

  /** Threshold value */
  threshold: number;

  /** Rule severity */
  severity: Priority;

  /** Human-readable description */
  description?: string;
}

/**
 * Comprehensive quality metrics
 */
export interface QualityMetrics {
  /** Code coverage metrics */
  coverage: CoverageSummary;

  /** Test results */
  testResults: TestResultsSummary;

  /** Security scan results */
  security: SecurityScanResults;

  /** Performance metrics */
  performance: PerformanceMetrics;

  /** Code quality metrics */
  codeQuality: CodeQualityMetrics;

  /** Timestamp */
  timestamp: string;
}

/**
 * Test results summary
 */
export interface TestResultsSummary {
  /** Total tests */
  total: number;

  /** Passed tests */
  passed: number;

  /** Failed tests */
  failed: number;

  /** Skipped tests */
  skipped: number;

  /** Total duration (ms) */
  duration: number;

  /** Failure rate (0-1) */
  failureRate: number;

  /** Flaky tests detected */
  flakyTests?: number;
}

/**
 * Security scan results
 */
export interface SecurityScanResults {
  /** Vulnerabilities found */
  vulnerabilities: Vulnerability[];

  /** Summary by severity */
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  /** Scan timestamp */
  scannedAt: string;
}

/**
 * Vulnerability information
 */
export interface Vulnerability {
  /** Vulnerability ID */
  id: string;

  /** Severity level */
  severity: Priority;

  /** Title */
  title: string;

  /** Description */
  description: string;

  /** CWE identifier */
  cwe?: string;

  /** CVSS score */
  cvss?: number;

  /** Affected file */
  file?: string;

  /** Remediation advice */
  remediation?: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Response time metrics */
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };

  /** Throughput (requests/sec) */
  throughput: number;

  /** Error rate (0-1) */
  errorRate: number;

  /** Resource usage */
  resourceUsage: ResourceUsage;
}

/**
 * Resource usage metrics
 */
export interface ResourceUsage {
  /** CPU usage percentage */
  cpu: number;

  /** Memory usage (MB) */
  memory: number;

  /** Disk usage (MB) */
  disk: number;

  /** Network usage (MB) */
  network?: number;
}

/**
 * Code quality metrics
 */
export interface CodeQualityMetrics {
  /** Maintainability index (0-100) */
  maintainabilityIndex: number;

  /** Cyclomatic complexity */
  cyclomaticComplexity: number;

  /** Technical debt (hours) */
  technicalDebt: number;

  /** Code smells count */
  codeSmells: number;

  /** Duplication percentage */
  duplications: number;

  /** Lines of code */
  linesOfCode?: number;
}

// ==================== Flaky Detection Domain ====================

/**
 * Parameters for flaky test detection
 */
export interface FlakyTestDetectionParams {
  /** Test results to analyze */
  testResults: TestResult[];

  /** Minimum runs to consider */
  minRuns: number;

  /** Time window (days) */
  timeWindow: number;

  /** Confidence threshold (0-1) */
  confidenceThreshold: number;

  /** Analysis configuration */
  analysisConfig: FlakyAnalysisConfig;

  /** Report configuration */
  reportConfig?: FlakyReportConfig;
}

/**
 * Individual test result
 */
export interface TestResult {
  /** Test identifier */
  testId: string;

  /** Test name */
  name: string;

  /** Test status */
  status: TestStatus;

  /** Duration (ms) */
  duration: number;

  /** Timestamp */
  timestamp: string;

  /** Error message (if failed) */
  error?: string;

  /** Stack trace (if failed) */
  stackTrace?: string;

  /** Environment variables */
  environment?: Record<string, string>;

  /** Retry count */
  retryCount?: number;
}

/**
 * Flaky test analysis configuration
 */
export interface FlakyAnalysisConfig {
  /** Detection algorithm */
  algorithm: 'statistical' | 'ml' | 'hybrid';

  /** Features to analyze */
  features: string[];

  /** Auto-stabilize detected flaky tests */
  autoStabilize: boolean;

  /** ML model configuration */
  mlConfig?: {
    modelPath: string;
    threshold: number;
  };
}

/**
 * Flaky test report configuration
 */
export interface FlakyReportConfig {
  /** Include historical trends */
  includeTrends: boolean;

  /** Include stabilization suggestions */
  includeSuggestions: boolean;

  /** Report format */
  format: 'json' | 'html' | 'markdown';
}

/**
 * Parameters for regression risk analysis
 */
export interface RegressionRiskParams {
  /** Code changes to analyze */
  changes: CodeChange[];

  /** Baseline quality metrics */
  baselineMetrics: QualityMetrics;

  /** Risk threshold (0-1) */
  threshold: number;

  /** Historical quality data */
  historicalData?: QualityMetrics[];

  /** Include test selection */
  includeTestSelection: boolean;
}

/**
 * Code change information
 */
export interface CodeChange {
  /** File path */
  file: string;

  /** Change type */
  type: 'added' | 'modified' | 'deleted';

  /** Lines changed */
  linesChanged: number;

  /** Complexity delta */
  complexity: number;

  /** Test coverage */
  testCoverage: number;

  /** Author */
  author?: string;

  /** Commit hash */
  commit?: string;
}

// ==================== Performance Domain ====================

/**
 * Parameters for performance benchmarking
 */
export interface PerformanceBenchmarkParams {
  /** Benchmark suite name */
  benchmarkSuite: string;

  /** Number of iterations */
  iterations: number;

  /** Warmup iterations */
  warmupIterations: number;

  /** Enable parallel execution */
  parallel: boolean;

  /** Report format */
  reportFormat: 'json' | 'html' | 'markdown';

  /** Benchmark configuration */
  config?: BenchmarkConfig;
}

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  /** CPU affinity */
  cpuAffinity?: number[];

  /** Memory limit (MB) */
  memoryLimit?: number;

  /** Timeout (ms) */
  timeout?: number;
}

/**
 * Parameters for real-time monitoring
 */
export interface RealtimeMonitorParams {
  /** Target to monitor */
  target: string;

  /** Monitoring duration (seconds) */
  duration: number;

  /** Sampling interval (seconds) */
  interval: number;

  /** Metrics to monitor */
  metrics: MonitoringMetric[];

  /** Alert thresholds */
  thresholds?: Record<MonitoringMetric, number>;
}

/**
 * Monitoring metrics
 */
export type MonitoringMetric =
  | 'cpu'
  | 'memory'
  | 'network'
  | 'disk'
  | 'response-time'
  | 'throughput'
  | 'error-rate';

// ==================== Security Domain ====================

/**
 * Parameters for security scanning
 */
export interface SecurityScanParams {
  /** Scan type */
  scanType: 'sast' | 'dast' | 'dependency' | 'comprehensive';

  /** Target to scan */
  target: string;

  /** Scan depth */
  depth: 'basic' | 'standard' | 'deep';

  /** Include fingerprinting */
  includeFingerprinting: boolean;

  /** Exclude patterns */
  excludePatterns?: string[];

  /** Compliance standards */
  complianceStandards?: ('OWASP' | 'CWE' | 'SANS')[];
}

/**
 * Parameters for API breaking change detection
 */
export interface BreakingChangeParams {
  /** Old API source code */
  oldAPI: string;

  /** New API source code */
  newAPI: string;

  /** Programming language */
  language: ProgrammingLanguage;

  /** Calculate semantic version */
  calculateSemver: boolean;

  /** Generate migration guide */
  generateMigrationGuide: boolean;

  /** API type */
  apiType?: 'rest' | 'graphql' | 'grpc';
}

// ==================== Common Response Types ====================

/**
 * Standard QE tool response
 */
export interface QEToolResponse<T> {
  /** Success flag */
  success: boolean;

  /** Response data */
  data?: T;

  /** Error information */
  error?: QEError;

  /** Response metadata */
  metadata: ResponseMetadata;
}

/**
 * QE-specific error
 */
export interface QEError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Additional details */
  details?: Record<string, unknown>;

  /** Stack trace (in development) */
  stack?: string;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  /** Request identifier */
  requestId: string;

  /** Timestamp */
  timestamp: string;

  /** Execution time (ms) */
  executionTime: number;

  /** Agent identifier */
  agent?: string;

  /** Tool version */
  version?: string;
}

// ==================== Helper Types ====================

/**
 * Build configuration
 */
export interface BuildConfig {
  /** Build command */
  command: string;

  /** Build directory */
  directory: string;

  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Mock configuration
 */
export interface MockConfig {
  /** Mock strategy */
  strategy: 'manual' | 'auto';

  /** Mock data */
  data?: Record<string, unknown>;
}

/**
 * Flow step for E2E testing
 */
export interface FlowStep {
  /** Step action */
  action: string;

  /** Target element */
  target: string;

  /** Input data */
  input?: Record<string, unknown>;

  /** Expected outcome */
  expected?: string;

  /** Wait condition */
  wait?: WaitCondition;
}

/**
 * Wait condition for E2E
 */
export interface WaitCondition {
  /** Wait type */
  type: 'element' | 'timeout' | 'custom';

  /** Wait value */
  value: string | number;
}

/**
 * Page object model for E2E
 */
export interface PageObjectModel {
  /** Page name */
  name: string;

  /** Selectors */
  selectors: Record<string, string>;

  /** Methods */
  methods: string[];

  /** Page URL */
  url?: string;
}

/**
 * Viewport configuration
 */
export interface ViewportConfig {
  /** Viewport name */
  name: string;

  /** Width */
  width: number;

  /** Height */
  height: number;

  /** Device pixel ratio */
  devicePixelRatio?: number;
}

/**
 * Interface definition
 */
export interface InterfaceDefinition {
  /** Interface name */
  name: string;

  /** Methods */
  methods: MethodSignature[];

  /** Properties */
  properties?: PropertySignature[];
}

/**
 * Method signature
 */
export interface MethodSignature {
  /** Method name */
  name: string;

  /** Parameters */
  parameters: Parameter[];

  /** Return type */
  returnType: string;

  /** Is async */
  isAsync?: boolean;
}

/**
 * Property signature
 */
export interface PropertySignature {
  /** Property name */
  name: string;

  /** Property type */
  type: string;

  /** Is optional */
  optional: boolean;

  /** Is readonly */
  readonly?: boolean;
}

/**
 * Parameter definition
 */
export interface Parameter {
  /** Parameter name */
  name: string;

  /** Parameter type */
  type: string;

  /** Is optional */
  optional: boolean;

  /** Default value */
  defaultValue?: unknown;
}

/**
 * Integration scenario
 */
export interface IntegrationScenario {
  /** Scenario name */
  name: string;

  /** Description */
  description: string;

  /** Services involved */
  services: string[];

  /** Expected behavior */
  expectedBehavior: string;
}
