/**
 * Extended type definitions for Agentic QE framework
 * Additional types and interfaces for specialized testing scenarios
 */

// ============================================================================
// Extended Test Result Types
// ============================================================================

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  passRate: number;
  duration: number;
  startTime: Date;
  endTime: Date;
}

export interface TestSuiteResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'partial';
  summary: TestSummary;
  testResults: string[]; // Test result IDs
  duration: number;
  coverage?: CoverageMetrics;
}

export interface TestReport {
  id: string;
  type: ReportType;
  format: ReportFormat;
  title: string;
  summary: TestSummary;
  sections: ReportSection[];
  generatedAt: Date;
  filePath?: string;
}

export type ReportType =
  | 'summary'
  | 'detailed'
  | 'coverage'
  | 'performance'
  | 'security'
  | 'accessibility'
  | 'trend';

export type ReportFormat = 'html' | 'json' | 'xml' | 'pdf' | 'csv';

export interface ReportSection {
  title: string;
  content: string;
  charts?: Chart[];
  tables?: Table[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Metrics and Analytics
// ============================================================================

export interface CoverageMetrics {
  lines: CoverageData;
  functions: CoverageData;
  branches: CoverageData;
  statements: CoverageData;
  files: FileCoverage[];
}

export interface CoverageData {
  total: number;
  covered: number;
  percentage: number;
}

export interface FileCoverage {
  path: string;
  lines: CoverageData;
  functions: CoverageData;
  branches: CoverageData;
  statements: CoverageData;
}

export interface PerformanceMetrics {
  responseTime: PerformanceData;
  throughput: PerformanceData;
  resourceUsage: ResourceUsage;
  webVitals?: WebVitals;
  loadTimes?: LoadTimes;
}

export interface PerformanceData {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  unit: string;
}

export interface ResourceUsage {
  cpu: PerformanceData;
  memory: PerformanceData;
  network: PerformanceData;
  disk?: PerformanceData;
}

export interface WebVitals {
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
}

export interface LoadTimes {
  domContentLoaded: number;
  pageLoad: number;
  firstByte: number;
  dns: number;
  tcp: number;
  ssl?: number;
}

export interface AccessibilityMetrics {
  violations: AccessibilityViolation[];
  score: number;
  level: 'A' | 'AA' | 'AAA';
  categories: AccessibilityCategory[];
}

export interface AccessibilityViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: AccessibilityNode[];
}

export interface AccessibilityNode {
  html: string;
  target: string[];
  failureSummary: string;
}

export interface AccessibilityCategory {
  name: string;
  score: number;
  violations: number;
  passes: number;
}

export interface SecurityMetrics {
  vulnerabilities: SecurityVulnerability[];
  riskScore: number;
  categories: SecurityCategory[];
  compliance: ComplianceResult[];
}

export interface SecurityVulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  title: string;
  description: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
  cvss?: number;
  affected: string[];
}

export interface SecurityCategory {
  name: string;
  score: number;
  vulnerabilities: number;
  recommendations: string[];
}

export interface ComplianceResult {
  standard: string;
  version: string;
  score: number;
  passed: number;
  failed: number;
  controls: ControlResult[];
}

export interface ControlResult {
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'manual';
  description: string;
  evidence?: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface PerformanceConfig {
  thresholds: PerformanceThresholds;
  monitoring: MonitoringConfig;
  load: LoadConfig;
  stress: StressConfig;
}

export interface PerformanceThresholds {
  responseTime: number;
  throughput: number;
  errorRate: number;
  cpu: number;
  memory: number;
  webVitals: WebVitalsThresholds;
}

export interface WebVitalsThresholds {
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
}

export interface MonitoringConfig {
  interval: number;
  duration: number;
  metrics: string[];
  alerts: AlertConfig[];
}

export interface AlertConfig {
  metric: string;
  threshold: number;
  operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
  action: 'log' | 'email' | 'webhook' | 'stop';
  target?: string;
}

export interface LoadConfig {
  users: number;
  rampUp: number;
  duration: number;
  scenario: LoadScenario[];
}

export interface LoadScenario {
  name: string;
  weight: number;
  steps: LoadStep[];
}

export interface LoadStep {
  action: string;
  target: string;
  data?: Record<string, unknown>;
  thinkTime?: number;
}

export interface StressConfig {
  maxUsers: number;
  increment: number;
  duration: number;
  breakpoint: BreakpointConfig;
}

export interface BreakpointConfig {
  metric: string;
  threshold: number;
  duration: number;
}

export interface SecurityConfig {
  scans: SecurityScanConfig[];
  authentication: AuthTestConfig;
  authorization: AuthzTestConfig;
  dataProtection: DataProtectionConfig;
}

export interface SecurityScanConfig {
  type: 'static' | 'dynamic' | 'interactive' | 'dependency';
  tools: string[];
  severity: string[];
  excludes: string[];
}

export interface AuthTestConfig {
  mechanisms: string[];
  bruteForce: boolean;
  sessionManagement: boolean;
  passwordPolicy: boolean;
}

export interface AuthzTestConfig {
  roles: string[];
  permissions: string[];
  escalation: boolean;
  bypassAttempts: boolean;
}

export interface DataProtectionConfig {
  encryption: boolean;
  sanitization: boolean;
  leakage: boolean;
  retention: boolean;
}

export interface AccessibilityConfig {
  standards: AccessibilityStandard[];
  level: 'A' | 'AA' | 'AAA';
  rules: AccessibilityRule[];
  browsers: string[];
  devices: string[];
}

export interface AccessibilityStandard {
  name: string;
  version: string;
  rules: string[];
}

export interface AccessibilityRule {
  id: string;
  enabled: boolean;
  level: 'A' | 'AA' | 'AAA';
  tags: string[];
}

export interface VisualConfig {
  baseline: VisualBaselineConfig;
  comparison: VisualComparisonConfig;
  tolerance: VisualToleranceConfig;
  capture: VisualCaptureConfig;
}

export interface VisualBaselineConfig {
  strategy: 'auto' | 'manual' | 'approval';
  storage: 'local' | 'cloud' | 's3';
  retention: number;
}

export interface VisualComparisonConfig {
  algorithm: 'pixel' | 'structural' | 'perceptual';
  sensitivity: number;
  ignoreRegions: VisualRegion[];
}

export interface VisualRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  selector?: string;
}

export interface VisualToleranceConfig {
  pixel: number;
  layout: number;
  color: number;
  text: number;
}

export interface VisualCaptureConfig {
  fullPage: boolean;
  element?: string;
  viewport: { width: number; height: number };
  delay: number;
  animation: 'allow' | 'disable' | 'wait';
}

export interface ParallelConfig {
  maxConcurrency: number;
  strategy: 'file' | 'test' | 'suite';
  distribution: 'round-robin' | 'balanced' | 'fastest';
  isolation: boolean;
}

export interface RetryConfig {
  count: number;
  delay: number;
  backoff: 'linear' | 'exponential';
  conditions: RetryCondition[];
}

export interface RetryCondition {
  error: string;
  maxRetries: number;
  delay?: number;
}

export interface TimeoutConfig {
  test: number;
  step: number;
  page: number;
  element: number;
  api: number;
}

// ============================================================================
// Assertion Types
// ============================================================================

export interface Assertion {
  id: string;
  type: AssertionType;
  target: string;
  operator: AssertionOperator;
  expected: unknown;
  actual?: unknown;
  status: 'pass' | 'fail';
  message?: string;
  metadata?: Record<string, unknown>;
}

export type AssertionType =
  | 'equals'
  | 'contains'
  | 'exists'
  | 'visible'
  | 'enabled'
  | 'selected'
  | 'text'
  | 'attribute'
  | 'css'
  | 'url'
  | 'status'
  | 'response'
  | 'performance'
  | 'accessibility'
  | 'security';

export type AssertionOperator =
  | 'equals'
  | 'not-equals'
  | 'contains'
  | 'not-contains'
  | 'starts-with'
  | 'ends-with'
  | 'matches'
  | 'greater-than'
  | 'less-than'
  | 'greater-equal'
  | 'less-equal'
  | 'in-range'
  | 'exists'
  | 'not-exists';

// ============================================================================
// Chart and Visualization Types
// ============================================================================

export interface Chart {
  id: string;
  type: ChartType;
  title: string;
  data: ChartData;
  options: ChartOptions;
}

export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'scatter'
  | 'area'
  | 'histogram'
  | 'heatmap'
  | 'treemap';

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
  borderColor?: string;
  backgroundColor?: string;
}

export interface ChartOptions {
  responsive: boolean;
  legend: boolean;
  tooltip: boolean;
  animation: boolean;
  scales?: ChartScales;
}

export interface ChartScales {
  x: ChartScale;
  y: ChartScale;
}

export interface ChartScale {
  type: 'linear' | 'logarithmic' | 'time' | 'category';
  min?: number;
  max?: number;
  stepSize?: number;
  title?: string;
}

export interface Table {
  id: string;
  title: string;
  headers: string[];
  rows: TableRow[];
  sortable: boolean;
  filterable: boolean;
}

export interface TableRow {
  cells: TableCell[];
  metadata?: Record<string, unknown>;
}

export interface TableCell {
  value: string | number;
  type: 'text' | 'number' | 'boolean' | 'date' | 'link';
  format?: string;
  style?: Record<string, string>;
}

// ============================================================================
// Test Metadata
// ============================================================================

export interface TestMetadata {
  author?: string;
  created: Date;
  updated: Date;
  version: string;
  tags: string[];
  categories: string[];
  requirements: string[];
  risks: string[];
  assumptions: string[];
  dependencies: string[];
  environment: string;
  browser?: string;
  device?: string;
  platform?: string;
  locale?: string;
  timezone?: string;
  notes?: string;
  attachments?: string[];
}