/**
 * Agentic QE v3 - Chaos & Resilience Testing Domain Interfaces
 *
 * Bounded Context: Chaos & Resilience Testing
 * Responsibility: Chaos engineering, fault injection, performance/load testing
 */

import type { DomainEvent, Result } from '../../shared/types/index.js';
import type { RiskScore } from '../../shared/value-objects/index.js';

// ============================================================================
// Value Objects
// ============================================================================

/**
 * Chaos experiment definition
 */
export interface ChaosExperiment {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly hypothesis: Hypothesis;
  readonly steadyState: SteadyStateDefinition;
  readonly faults: FaultInjection[];
  readonly blastRadius: BlastRadius;
  readonly rollbackPlan: RollbackPlan;
  readonly schedule?: ExperimentSchedule;
}

export interface Hypothesis {
  readonly statement: string;
  readonly metrics: MetricExpectation[];
  readonly tolerances: Tolerance[];
}

export interface MetricExpectation {
  readonly metric: string;
  readonly operator: 'eq' | 'lt' | 'gt' | 'lte' | 'gte' | 'between';
  readonly value: number | [number, number];
  readonly unit?: string;
}

export interface Tolerance {
  readonly metric: string;
  readonly maxDeviation: number;
  readonly unit: 'percent' | 'absolute';
}

export interface SteadyStateDefinition {
  readonly description: string;
  readonly probes: SteadyStateProbe[];
}

export interface SteadyStateProbe {
  readonly name: string;
  readonly type: 'http' | 'tcp' | 'command' | 'metric';
  readonly target: string;
  readonly expected: unknown;
  readonly timeout: number;
  /** Expected HTTP status code (for http probes) */
  readonly expectedStatus?: number;
  /** Expected output substring (for command probes) */
  readonly expectedOutput?: string;
  /** Threshold configuration (for metric probes) */
  readonly threshold?: {
    readonly operator: 'lt' | 'gt' | 'lte' | 'gte' | 'eq';
    readonly value: number;
  };
}

/**
 * Fault injection configuration
 */
export interface FaultInjection {
  readonly id: string;
  readonly type: FaultType;
  readonly target: FaultTarget;
  readonly parameters: FaultParameters;
  readonly duration: number;
  readonly probability?: number;
}

export type FaultType =
  | 'latency'
  | 'error'
  | 'timeout'
  | 'packet-loss'
  | 'cpu-stress'
  | 'memory-stress'
  | 'disk-stress'
  | 'network-partition'
  | 'dns-failure'
  | 'process-kill';

export interface FaultTarget {
  readonly type: 'service' | 'pod' | 'container' | 'host' | 'network';
  readonly selector: string;
  readonly namespace?: string;
}

export interface FaultParameters {
  readonly [key: string]: unknown;
  readonly latencyMs?: number;
  readonly errorCode?: number;
  readonly packetLossPercent?: number;
  readonly cpuPercent?: number;
  readonly memoryBytes?: number;
  /** Number of CPU cores to stress (for cpu-stress faults) */
  readonly cores?: number;
}

export interface BlastRadius {
  readonly scope: 'single' | 'subset' | 'all';
  readonly percentage?: number;
  readonly maxAffected?: number;
  readonly excludeProduction?: boolean;
}

export interface RollbackPlan {
  readonly automatic: boolean;
  readonly triggerConditions: RollbackTrigger[];
  readonly steps: RollbackStep[];
}

export interface RollbackTrigger {
  readonly type: 'metric-threshold' | 'error-rate' | 'manual' | 'timeout';
  readonly condition: string;
}

export interface RollbackStep {
  readonly order: number;
  readonly action: string;
  readonly target?: string;
  readonly timeout?: number;
}

export interface ExperimentSchedule {
  readonly type: 'once' | 'recurring';
  readonly cron?: string;
  readonly nextRun?: Date;
  readonly lastRun?: Date;
}

/**
 * Experiment execution result
 */
export interface ExperimentResult {
  readonly experimentId: string;
  readonly status: ExperimentStatus;
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly hypothesisValidated: boolean;
  readonly steadyStateVerified: boolean;
  readonly faultResults: FaultResult[];
  readonly metrics: MetricSnapshot[];
  readonly incidents: Incident[];
}

export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back' | 'aborted';

export interface FaultResult {
  readonly faultId: string;
  readonly injected: boolean;
  readonly duration: number;
  readonly affectedTargets: number;
  readonly errors: string[];
}

export interface MetricSnapshot {
  readonly timestamp: Date;
  readonly name: string;
  readonly value: number;
  readonly labels: Record<string, string>;
}

export interface Incident {
  readonly type: 'alert' | 'error' | 'degradation';
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly message: string;
  readonly timestamp: Date;
  readonly resolved: boolean;
}

/**
 * Load test configuration
 */
export interface LoadTest {
  readonly id: string;
  readonly name: string;
  readonly type: LoadTestType;
  readonly target: LoadTestTarget;
  readonly profile: LoadProfile;
  readonly scenarios: LoadScenario[];
  readonly assertions: LoadAssertion[];
}

export type LoadTestType = 'load' | 'stress' | 'spike' | 'soak' | 'breakpoint';

export interface LoadTestTarget {
  readonly url: string;
  readonly method: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

export interface LoadProfile {
  readonly virtualUsers: VirtualUserConfig;
  readonly duration: number;
  readonly rampUp?: number;
  readonly rampDown?: number;
}

export interface VirtualUserConfig {
  readonly start: number;
  readonly max: number;
  readonly pattern: 'constant' | 'ramp' | 'step' | 'spike';
}

export interface LoadScenario {
  readonly name: string;
  readonly weight: number;
  readonly steps: LoadStep[];
}

export interface LoadStep {
  readonly type: 'request' | 'think' | 'pause';
  readonly target?: LoadTestTarget;
  readonly duration?: number;
}

export interface LoadAssertion {
  readonly metric: 'response-time' | 'throughput' | 'error-rate' | 'p95' | 'p99';
  readonly operator: 'lt' | 'gt' | 'lte' | 'gte';
  readonly value: number;
}

/**
 * Load test results
 */
export interface LoadTestResult {
  readonly testId: string;
  readonly status: 'completed' | 'failed' | 'aborted';
  readonly duration: number;
  readonly summary: LoadTestSummary;
  readonly timeline: TimelinePoint[];
  readonly errors: LoadTestError[];
  readonly assertionResults: AssertionResult[];
}

export interface LoadTestSummary {
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly requestsPerSecond: number;
  readonly avgResponseTime: number;
  readonly p50ResponseTime: number;
  readonly p95ResponseTime: number;
  readonly p99ResponseTime: number;
  readonly maxResponseTime: number;
  readonly errorRate: number;
}

export interface TimelinePoint {
  readonly timestamp: Date;
  readonly virtualUsers: number;
  readonly requestsPerSecond: number;
  readonly avgResponseTime: number;
  readonly errorRate: number;
}

export interface LoadTestError {
  readonly type: string;
  readonly message: string;
  readonly count: number;
  readonly firstOccurrence: Date;
  readonly lastOccurrence: Date;
}

export interface AssertionResult {
  readonly assertion: LoadAssertion;
  readonly passed: boolean;
  readonly actualValue: number;
}

// ============================================================================
// Domain Events
// ============================================================================

export interface ChaosExperimentStartedEvent extends DomainEvent {
  readonly type: 'ChaosExperimentStartedEvent';
  readonly experimentId: string;
  readonly name: string;
  readonly faultTypes: FaultType[];
  readonly blastRadius: BlastRadius;
}

export interface ChaosExperimentCompletedEvent extends DomainEvent {
  readonly type: 'ChaosExperimentCompletedEvent';
  readonly experimentId: string;
  readonly status: ExperimentStatus;
  readonly hypothesisValidated: boolean;
  readonly incidentCount: number;
}

export interface FaultInjectedEvent extends DomainEvent {
  readonly type: 'FaultInjectedEvent';
  readonly experimentId: string;
  readonly faultId: string;
  readonly faultType: FaultType;
  readonly target: string;
}

export interface LoadTestCompletedEvent extends DomainEvent {
  readonly type: 'LoadTestCompletedEvent';
  readonly testId: string;
  readonly testType: LoadTestType;
  readonly summary: LoadTestSummary;
  readonly passed: boolean;
}

export interface ResilienceIssueDetectedEvent extends Omit<DomainEvent, 'source'> {
  readonly type: 'ResilienceIssueDetectedEvent';
  readonly issueSource: 'chaos' | 'load';
  readonly issue: ResilienceIssue;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ResilienceIssue {
  readonly type: string;
  readonly description: string;
  readonly affectedService: string;
  readonly recommendation: string;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Chaos Engineering Service
 * Fault injection and experiment execution
 */
export interface IChaosEngineeringService {
  /**
   * Create chaos experiment
   */
  createExperiment(experiment: ChaosExperiment): Promise<Result<string>>;

  /**
   * Run chaos experiment
   */
  runExperiment(experimentId: string): Promise<Result<ExperimentResult>>;

  /**
   * Abort running experiment
   */
  abortExperiment(experimentId: string, reason: string): Promise<Result<void>>;

  /**
   * Verify steady state
   */
  verifySteadyState(definition: SteadyStateDefinition): Promise<Result<boolean>>;

  /**
   * Inject single fault
   */
  injectFault(fault: FaultInjection): Promise<Result<FaultResult>>;

  /**
   * Remove injected fault
   */
  removeFault(faultId: string): Promise<Result<void>>;
}

/**
 * Load Testing Service
 * Performance and stress testing
 */
export interface ILoadTestingService {
  /**
   * Create load test
   */
  createTest(test: LoadTest): Promise<Result<string>>;

  /**
   * Run load test
   */
  runTest(testId: string): Promise<Result<LoadTestResult>>;

  /**
   * Stop running test
   */
  stopTest(testId: string): Promise<Result<LoadTestResult>>;

  /**
   * Get real-time metrics
   */
  getRealtimeMetrics(testId: string): Promise<Result<TimelinePoint>>;

  /**
   * Generate load test from traffic
   */
  generateFromTraffic(
    trafficSample: TrafficSample,
    multiplier: number
  ): Promise<Result<LoadTest>>;
}

export interface TrafficSample {
  readonly requests: SampledRequest[];
  readonly duration: number;
  readonly source: string;
}

export interface SampledRequest {
  readonly url: string;
  readonly method: string;
  readonly frequency: number;
  readonly avgResponseTime: number;
}

/**
 * Resilience Testing Service
 * Recovery and failover testing
 */
export interface IResilienceTestingService {
  /**
   * Test service recovery
   */
  testRecovery(
    service: string,
    faultType: FaultType,
    expectedRecoveryTime: number
  ): Promise<Result<RecoveryTestResult>>;

  /**
   * Test failover
   */
  testFailover(
    primaryService: string,
    secondaryService: string
  ): Promise<Result<FailoverTestResult>>;

  /**
   * Test circuit breaker
   */
  testCircuitBreaker(
    service: string,
    options?: CircuitBreakerTestOptions
  ): Promise<Result<CircuitBreakerTestResult>>;

  /**
   * Test rate limiting
   */
  testRateLimiting(
    service: string,
    expectedLimit: number
  ): Promise<Result<RateLimitTestResult>>;
}

export interface RecoveryTestResult {
  readonly service: string;
  readonly faultType: FaultType;
  readonly recoveryTime: number;
  readonly expectedRecoveryTime: number;
  readonly passed: boolean;
  readonly timeline: RecoveryEvent[];
}

export interface RecoveryEvent {
  readonly timestamp: Date;
  readonly event: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
}

export interface FailoverTestResult {
  readonly primaryService: string;
  readonly secondaryService: string;
  readonly failoverTime: number;
  readonly dataLoss: boolean;
  readonly passed: boolean;
  readonly steps: FailoverStep[];
}

export interface FailoverStep {
  readonly order: number;
  readonly action: string;
  readonly duration: number;
  readonly success: boolean;
}

export interface CircuitBreakerTestOptions {
  readonly errorThreshold?: number;
  readonly timeout?: number;
  readonly halfOpenRequests?: number;
}

export interface CircuitBreakerTestResult {
  readonly service: string;
  readonly opened: boolean;
  readonly openedAfterErrors: number;
  readonly closedAfterRecovery: boolean;
  readonly halfOpenBehavior: 'correct' | 'incorrect';
  readonly passed: boolean;
}

export interface RateLimitTestResult {
  readonly service: string;
  readonly expectedLimit: number;
  readonly actualLimit: number;
  readonly passed: boolean;
  readonly responseWhenLimited: RateLimitResponse;
}

export interface RateLimitResponse {
  readonly statusCode: number;
  readonly retryAfter?: number;
  readonly body?: unknown;
}

// ============================================================================
// Repository Interfaces
// ============================================================================

export interface IChaosExperimentRepository {
  findById(id: string): Promise<ChaosExperiment | null>;
  findByName(name: string): Promise<ChaosExperiment[]>;
  findScheduled(): Promise<ChaosExperiment[]>;
  save(experiment: ChaosExperiment): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IExperimentResultRepository {
  findByExperimentId(experimentId: string): Promise<ExperimentResult[]>;
  findLatest(experimentId: string): Promise<ExperimentResult | null>;
  findByDateRange(startDate: Date, endDate: Date): Promise<ExperimentResult[]>;
  save(result: ExperimentResult): Promise<void>;
}

export interface ILoadTestRepository {
  findById(id: string): Promise<LoadTest | null>;
  findByType(type: LoadTestType): Promise<LoadTest[]>;
  save(test: LoadTest): Promise<void>;
}

export interface ILoadTestResultRepository {
  findByTestId(testId: string): Promise<LoadTestResult[]>;
  findLatest(testId: string): Promise<LoadTestResult | null>;
  save(result: LoadTestResult): Promise<void>;
}

// ============================================================================
// Coordinator Interface
// ============================================================================

export interface IChaosResilienceCoordinator {
  /**
   * Run chaos experiment suite
   */
  runChaosSuite(experimentIds: string[]): Promise<Result<ChaosSuiteReport>>;

  /**
   * Run load test suite
   */
  runLoadTestSuite(testIds: string[]): Promise<Result<LoadTestSuiteReport>>;

  /**
   * Run full resilience assessment
   */
  assessResilience(services: string[]): Promise<Result<ResilienceAssessment>>;

  /**
   * Generate chaos experiment from architecture
   */
  generateExperiments(
    architecture: ServiceArchitecture
  ): Promise<Result<ChaosExperiment[]>>;

  /**
   * Get resilience dashboard data
   */
  getResilienceDashboard(): Promise<Result<ResilienceDashboard>>;
}

export interface ServiceArchitecture {
  readonly services: ServiceDefinition[];
  readonly dependencies: ServiceDependency[];
  readonly criticalPaths: string[][];
}

export interface ServiceDefinition {
  readonly name: string;
  readonly type: 'api' | 'worker' | 'database' | 'cache' | 'queue';
  readonly replicas: number;
  readonly hasFailover: boolean;
}

export interface ServiceDependency {
  readonly from: string;
  readonly to: string;
  readonly type: 'sync' | 'async';
  readonly criticality: 'critical' | 'important' | 'optional';
}

export interface ChaosSuiteReport {
  readonly totalExperiments: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: ExperimentResult[];
  readonly recommendations: ResilienceRecommendation[];
}

export interface LoadTestSuiteReport {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: LoadTestResult[];
  readonly bottlenecks: PerformanceBottleneck[];
}

export interface PerformanceBottleneck {
  readonly location: string;
  readonly type: 'cpu' | 'memory' | 'io' | 'network' | 'database';
  readonly description: string;
  readonly impact: 'high' | 'medium' | 'low';
  readonly recommendation: string;
}

export interface ResilienceAssessment {
  readonly overallScore: number;
  readonly serviceScores: Map<string, number>;
  readonly strengths: string[];
  readonly weaknesses: ResilienceWeakness[];
  readonly recommendations: ResilienceRecommendation[];
}

export interface ResilienceWeakness {
  readonly service: string;
  readonly type: string;
  readonly description: string;
  readonly risk: RiskScore;
}

export interface ResilienceRecommendation {
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly category: string;
  readonly recommendation: string;
  readonly effort: 'trivial' | 'minor' | 'moderate' | 'major';
}

export interface ResilienceDashboard {
  readonly overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  readonly lastExperimentDate?: Date;
  readonly lastLoadTestDate?: Date;
  readonly activeIncidents: number;
  readonly uptime: number;
  readonly mttr: number; // Mean Time To Recovery
  readonly changeFailureRate: number;
}
