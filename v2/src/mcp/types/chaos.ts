/**
 * Chaos Engineering MCP Tool Type Definitions
 * Defines interfaces for fault injection, resilience testing, and blast radius control
 */

/**
 * Blast radius configuration for controlled chaos injection
 */
export interface BlastRadius {
  /** Percentage of target services to affect (0-100) */
  percentage: number;
  /** List of target services/endpoints */
  targetServices: string[];
  /** Progressive increase of blast radius */
  progressive?: boolean;
  /** Maximum percentage for progressive blast radius */
  maxPercentage?: number;
  /** Increment step for progressive blast radius */
  incrementStep?: number;
}

/**
 * Distribution types for latency injection
 */
export type LatencyDistribution = 'fixed' | 'uniform' | 'normal' | 'exponential';

/**
 * Distribution parameters for latency injection
 */
export interface DistributionParams {
  min?: number;
  max?: number;
  mean?: number;
  stdDev?: number;
  lambda?: number;
}

/**
 * Configuration for latency injection
 */
export interface ChaosLatencyConfig {
  /** Target service URL or identifier */
  target: string;
  /** Latency to inject in milliseconds */
  latencyMs: number;
  /** Distribution type for latency */
  distribution: LatencyDistribution;
  /** Distribution parameters */
  distributionParams?: DistributionParams;
  /** Blast radius control */
  blastRadius: BlastRadius;
  /** Duration of injection in milliseconds (optional) */
  duration?: number;
  /** Whether to rollback injection */
  rollback?: boolean;
  /** Injection ID for rollback */
  injectionId?: string;
}

/**
 * Failure types for chaos injection
 */
export type FailureType =
  | 'http_error'
  | 'timeout'
  | 'connection_refused'
  | 'dns_failure'
  | 'partial_response'
  | 'combined';

/**
 * Configuration for failure injection
 */
export interface ChaosFailureConfig {
  /** Target service URL or identifier */
  target: string;
  /** Type of failure to inject */
  failureType: FailureType;
  /** HTTP error code (for http_error type) */
  httpErrorCode?: number;
  /** Timeout duration in milliseconds (for timeout type) */
  timeoutMs?: number;
  /** Failure rate (0-1, where 1 = 100%) */
  failureRate?: number;
  /** Multiple failure types (for combined type) */
  failureTypes?: FailureType[];
  /** Blast radius control */
  blastRadius: BlastRadius;
  /** Duration of injection in milliseconds (optional) */
  duration?: number;
  /** Whether to rollback injection */
  rollback?: boolean;
  /** Injection ID for rollback */
  injectionId?: string;
}

/**
 * Resilience mechanisms to test
 */
export interface ResilienceConfig {
  /** Test circuit breaker pattern */
  circuitBreaker?: boolean;
  /** Retry policy configuration */
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    exponential?: boolean;
  };
  /** Timeout configuration */
  timeout?: {
    requestTimeoutMs: number;
    overallTimeoutMs: number;
  };
  /** Fallback behavior */
  fallback?: boolean;
}

/**
 * Monitoring configuration for resilience tests
 */
export interface MonitoringConfig {
  /** Enable monitoring integration */
  enabled: boolean;
  /** Metrics endpoint URL */
  metricsEndpoint?: string;
  /** Custom metrics to track */
  customMetrics?: string[];
}

/**
 * Chaos scenario for resilience testing
 */
export interface ChaosScenario {
  /** Scenario type */
  type: 'latency' | 'failure';
  /** Scenario configuration */
  config: Partial<ChaosLatencyConfig> | Partial<ChaosFailureConfig>;
  /** Weight for combined scenarios (0-1) */
  weight?: number;
}

/**
 * Configuration for resilience testing
 */
export interface ChaosResilienceConfig {
  /** Target service URL or identifier */
  target: string;
  /** Chaos scenarios to test */
  scenarios?: ChaosScenario[];
  /** Predefined template name */
  template?: string;
  /** Blast radius control */
  blastRadius: BlastRadius;
  /** Test duration in milliseconds */
  duration?: number;
  /** Resilience mechanisms to test */
  resilience?: ResilienceConfig;
  /** Monitoring configuration */
  monitoring?: MonitoringConfig;
  /** Auto-rollback after test */
  autoRollback?: boolean;
}

/**
 * Result of a chaos injection
 */
export interface ChaosInjectionResult {
  /** Whether injection was successful */
  success: boolean;
  /** Unique injection ID */
  injectionId: string;
  /** Target that was affected */
  target: string;
  /** Affected endpoints/services */
  affectedEndpoints: string[];
  /** Actual latency injected (for latency injection) */
  actualLatencyMs?: number;
  /** Distribution used (for latency injection) */
  distribution?: LatencyDistribution;
  /** Failure type (for failure injection) */
  failureType?: FailureType;
  /** Timeout value (for timeout failure) */
  timeoutMs?: number;
  /** Failure rate applied */
  failureRate?: number;
  /** Blast radius impact statistics */
  blastRadiusImpact?: {
    targetedCount: number;
    affectedCount: number;
    percentage: number;
  };
  /** Duration of injection */
  duration?: number;
  /** Expiration timestamp */
  expiresAt?: Date;
  /** Whether injection was rolled back */
  rolledBack?: boolean;
  /** Error message if injection failed */
  error?: string;
  /** Additional metadata */
  metadata?: {
    injectedAt: Date;
    injectionMethod: string;
    targetType: string;
    [key: string]: unknown;
  };
}

/**
 * Resilience test metrics
 */
export interface ResilienceMetrics {
  /** Total requests made */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
  /** P95 response time in milliseconds */
  p95ResponseTimeMs: number;
  /** P99 response time in milliseconds */
  p99ResponseTimeMs: number;
  /** Recovery time after failure in milliseconds */
  recoveryTimeMs?: number;
  /** Availability score (0-1) */
  availabilityScore: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Request rate (requests per second) */
  requestRate?: number;
}

/**
 * Resilience behavior observations
 */
export interface ResilienceBehavior {
  /** Circuit breaker triggered */
  circuitBreakerTriggered?: boolean;
  /** Number of retries attempted */
  retriesAttempted?: number;
  /** Fallback used */
  fallbackUsed?: boolean;
  /** Timeout occurred */
  timeoutOccurred?: boolean;
  /** Graceful degradation observed */
  gracefulDegradation?: boolean;
}

/**
 * Blast radius progression data
 */
export interface BlastRadiusProgression {
  /** Initial percentage */
  initialPercentage: number;
  /** Final percentage */
  finalPercentage: number;
  /** Progression steps */
  steps: Array<{
    percentage: number;
    timestamp: Date;
    metrics: Partial<ResilienceMetrics>;
  }>;
}

/**
 * Recommendation for improving resilience
 */
export interface ResilienceRecommendation {
  /** Recommendation priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Recommendation category */
  category: string;
  /** Recommendation title */
  title: string;
  /** Detailed description */
  description: string;
  /** Implementation effort */
  effort: 'low' | 'medium' | 'high';
  /** Expected impact */
  impact: 'low' | 'medium' | 'high';
}

/**
 * Scenario test result
 */
export interface ScenarioResult {
  /** Scenario type */
  type: string;
  /** Whether scenario passed */
  passed: boolean;
  /** Scenario duration */
  durationMs: number;
  /** Scenario metrics */
  metrics: ResilienceMetrics;
  /** Observed behavior */
  behavior: ResilienceBehavior;
  /** Errors encountered */
  errors?: string[];
}

/**
 * Comprehensive resilience test report
 */
export interface ChaosResilienceReport {
  /** Overall test success */
  success: boolean;
  /** Target service */
  target: string;
  /** Template used (if any) */
  template?: string;
  /** Individual scenario results */
  scenarios: ScenarioResult[];
  /** Overall resilience score (0-100) */
  overallScore: number;
  /** Aggregated metrics */
  metrics?: ResilienceMetrics;
  /** Observed resilience behavior */
  resilience?: ResilienceBehavior;
  /** Blast radius progression data */
  blastRadiusProgression?: BlastRadiusProgression;
  /** Recommendations for improvement */
  recommendations?: ResilienceRecommendation[];
  /** Whether test was rolled back */
  rolledBack?: boolean;
  /** Test duration in milliseconds */
  totalDurationMs?: number;
  /** Test start time */
  startTime?: Date;
  /** Test end time */
  endTime?: Date;
  /** Error message if test failed */
  error?: string;
  /** Additional metadata */
  metadata?: {
    testId: string;
    environment: string;
    [key: string]: unknown;
  };
}

/**
 * Active chaos injection tracking
 */
export interface ActiveInjection {
  injectionId: string;
  type: 'latency' | 'failure';
  target: string;
  config: ChaosLatencyConfig | ChaosFailureConfig;
  startTime: Date;
  expiresAt?: Date;
  active: boolean;
}

/**
 * Chaos experiment template
 */
export interface ChaosTemplate {
  name: string;
  description: string;
  scenarios: ChaosScenario[];
  defaultBlastRadius: BlastRadius;
  defaultDuration: number;
  category: string;
  tags: string[];
}
