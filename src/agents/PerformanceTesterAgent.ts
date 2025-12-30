/**
 * PerformanceTesterAgent - Load testing and bottleneck detection specialist
 *
 * Implements load testing orchestration (JMeter, K6, Gatling, Artillery),
 * bottleneck detection, resource monitoring, SLA validation, performance
 * regression detection, and load pattern generation.
 *
 * Based on SPARC methodology and AQE Fleet specification
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { SecureRandom } from '../utils/SecureRandom.js';
import { Logger } from '../utils/Logger';
import {
  AgentType as _AgentType,
  QEAgentType,
  QETask,
  TestSuite as _TestSuite,
  Test as _Test,
  TestType as _TestType,
  TaskAssignment
} from '../types';
import type { PreTaskData, PostTaskData, TaskErrorData } from '../types/hook.types';

// ============================================================================
// Configuration Interfaces
// ============================================================================

export interface PerformanceTesterConfig extends BaseAgentConfig {
  // Load testing tools configuration
  tools?: {
    loadTesting?: 'k6' | 'jmeter' | 'gatling' | 'artillery';
    monitoring?: string[]; // ['prometheus', 'grafana', 'datadog']
    apm?: 'newrelic' | 'datadog' | 'dynatrace';
  };

  // Performance thresholds
  thresholds?: {
    maxLatencyP95: number; // ms, default: 500
    maxLatencyP99: number; // ms, default: 1000
    minThroughput: number; // req/s, default: 1000
    maxErrorRate: number; // %, default: 1
    maxCpuUsage: number; // %, default: 80
    maxMemoryUsage: number; // %, default: 85
  };

  // Load profile configuration
  loadProfile?: {
    virtualUsers: number; // default: 100
    duration: number; // seconds, default: 300
    rampUpTime: number; // seconds, default: 30
    pattern: 'constant' | 'ramp-up' | 'spike' | 'stress' | 'soak';
  };
}

// ============================================================================
// Performance Testing Data Interfaces
// ============================================================================

export interface LoadTestConfig {
  targetUrl: string;
  loadProfile: LoadProfile;
  thresholds: PerformanceThresholds;
  monitoring?: MonitoringConfig;
}

export interface LoadProfile {
  virtualUsers: number;
  duration: number; // seconds
  rampUpTime: number; // seconds
  pattern: 'constant' | 'ramp-up' | 'spike' | 'stress' | 'soak';
  endpoints?: EndpointDistribution[];
}

export interface EndpointDistribution {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  percentage: number; // 0-100
  payload?: EndpointPayload;
}

/**
 * Payload for endpoint requests in load testing
 */
export interface EndpointPayload {
  body?: Record<string, unknown> | string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
}

export interface PerformanceThresholds {
  maxLatencyP95: number; // milliseconds
  maxLatencyP99: number; // milliseconds
  minThroughput: number; // requests per second
  maxErrorRate: number; // percentage (0-1)
  maxCpuUsage?: number; // percentage
  maxMemoryUsage?: number; // percentage
}

export interface MonitoringConfig {
  enabled: boolean;
  interval: number; // milliseconds
  metrics: string[];
}

export interface LoadTestResult {
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  metrics: PerformanceMetrics;
  bottlenecks: Bottleneck[];
  slaViolations: SLAViolation[];
  recommendations: string[];
  [key: string]: unknown;
}

export interface PerformanceMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    errorRate: number; // percentage
  };
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    bytesPerSecond: number;
  };
  resources: {
    cpu: ResourceUsage;
    memory: ResourceUsage;
    network: ResourceUsage;
    disk?: ResourceUsage;
  };
}

export interface ResourceUsage {
  current: number;
  average: number;
  peak: number;
  unit: string;
}

export interface Bottleneck {
  type: 'CPU' | 'MEMORY' | 'IO' | 'DATABASE' | 'NETWORK' | 'APPLICATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  location: string;
  description: string;
  metrics: Record<string, number>;
  remediation: string[];
  impactEstimate: string;
}

export interface SLAViolation {
  metric: string;
  threshold: number;
  actual: number;
  violation: number; // percentage over threshold
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  duration: number; // milliseconds
}

export interface PerformanceBaseline {
  timestamp: Date;
  metrics: PerformanceMetrics;
  loadProfile: LoadProfile;
  version: string;
  environment: string;
  [key: string]: unknown;
}

export interface RegressionAnalysis {
  current: PerformanceMetrics;
  baseline: PerformanceMetrics;
  regressions: PerformanceRegression[];
  improvements: PerformanceImprovement[];
  verdict: 'PASS' | 'FAIL' | 'WARNING';
}

export interface PerformanceRegression {
  metric: string;
  baseline: number;
  current: number;
  degradation: number; // percentage
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PerformanceImprovement {
  metric: string;
  baseline: number;
  current: number;
  improvement: number; // percentage
}

// ============================================================================
// Load Testing Client Types
// ============================================================================

/**
 * Configuration for load testing client
 */
export interface LoadTestingClient {
  tool: 'k6' | 'jmeter' | 'gatling' | 'artillery';
  initialized: boolean;
  config?: Record<string, string | number | boolean>;
}

/**
 * Configuration for monitoring client
 */
export interface MonitoringClient {
  platforms: string[];
  initialized: boolean;
  connections?: Record<string, boolean>;
}

/**
 * Raw results from load test execution
 */
export interface RawLoadTestResults {
  requests: {
    total: number;
    successful: number;
    failed: number;
  };
  latencies: number[];
  throughput: number;
  errors?: Array<{ code: number; message: string; count: number }>;
}

/**
 * Raw monitoring data collected during test
 */
export interface RawMonitoringData {
  cpu: ResourceSamples;
  memory: ResourceSamples;
  network: ResourceSamples;
  disk?: ResourceSamples;
}

/**
 * Resource samples collected during monitoring
 */
export interface ResourceSamples {
  samples: number[];
  average: number;
  peak: number;
}

// ============================================================================
// Task Metadata Types
// ============================================================================

/**
 * Metadata for run-load-test task
 */
export interface RunLoadTestMetadata {
  targetUrl?: string;
  loadProfile?: LoadProfile;
  thresholds?: PerformanceThresholds;
  monitoring?: MonitoringConfig;
}

/**
 * Metadata for detect-bottlenecks task
 */
export interface DetectBottlenecksMetadata {
  metrics: PerformanceMetrics;
  testId: string;
}

/**
 * Metadata for validate-sla task
 */
export interface ValidateSLAMetadata {
  metrics: PerformanceMetrics;
  thresholds: PerformanceThresholds;
}

/**
 * Metadata for detect-regressions task
 */
export interface DetectRegressionsMetadata {
  currentMetrics: PerformanceMetrics;
  baselineId: string;
}

/**
 * Metadata for establish-baseline task
 */
export interface EstablishBaselineMetadata {
  metrics: PerformanceMetrics;
  version: string;
  environment: string;
}

/**
 * Metadata for generate-load-pattern task
 */
export interface GenerateLoadPatternMetadata {
  pattern?: 'constant' | 'ramp-up' | 'spike' | 'stress' | 'soak';
  virtualUsers?: number;
  duration?: number;
}

/**
 * Metadata for analyze-performance task
 */
export interface AnalyzePerformanceMetadata {
  testId: string;
}

/**
 * Performance analysis result
 */
export interface PerformanceAnalysisResult {
  summary: {
    passed: boolean;
    duration: number;
    totalRequests: number;
    errorRate: number;
    p95Latency: number;
  };
  bottlenecks: Bottleneck[];
  violations: SLAViolation[];
  recommendations: string[];
}

/**
 * Test execution complete event data
 */
export interface TestExecutionCompleteEvent {
  testId: string;
  passed: boolean;
  duration: number;
  metrics?: PerformanceMetrics;
}

/**
 * SLA validation result
 */
export interface SLAValidationResult {
  passed: boolean;
  violations: SLAViolation[];
}

/**
 * Union type for all performance task results
 */
export type PerformanceTaskResult =
  | LoadTestResult
  | Bottleneck[]
  | SLAValidationResult
  | RegressionAnalysis
  | LoadProfile
  | PerformanceBaseline
  | PerformanceAnalysisResult;

/**
 * Type guard for LoadTestResult
 */
export function isLoadTestResult(result: unknown): result is LoadTestResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'id' in result &&
    'metrics' in result &&
    'bottlenecks' in result &&
    'slaViolations' in result
  );
}

/**
 * Type guard for PerformanceMetrics
 */
export function hasPerformanceMetrics(result: unknown): result is { metrics: PerformanceMetrics } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'metrics' in result &&
    typeof (result as { metrics: unknown }).metrics === 'object'
  );
}

/**
 * Post-task result with performance metrics for storage
 */
export interface PerformancePostTaskResult {
  success?: boolean;
  latencyP95?: number;
  throughput?: number;
  errorRate?: number;
  regressions?: PerformanceRegression[];
  metrics?: PerformanceMetrics;
}

/**
 * Type guard for PerformancePostTaskResult
 */
export function isPerformancePostTaskResult(result: unknown): result is PerformancePostTaskResult {
  if (typeof result !== 'object' || result === null) {
    return false;
  }
  // Check for at least one performance-related property
  return (
    'success' in result ||
    'latencyP95' in result ||
    'throughput' in result ||
    'errorRate' in result ||
    'regressions' in result ||
    'metrics' in result
  );
}

// ============================================================================
// Performance Tester Agent Implementation
// ============================================================================

export class PerformanceTesterAgent extends BaseAgent {
  private readonly config: PerformanceTesterConfig;
  private loadTestingClient?: LoadTestingClient;
  private monitoringClient?: MonitoringClient;
  private activeTests: Map<string, LoadTestResult> = new Map();
  private baselines: Map<string, PerformanceBaseline> = new Map();

  constructor(config: PerformanceTesterConfig) {
    const defaultThresholds = {
      maxLatencyP95: 500,
      maxLatencyP99: 1000,
      minThroughput: 1000,
      maxErrorRate: 0.01,
      maxCpuUsage: 80,
      maxMemoryUsage: 85
    };

    super({
      ...config,
      type: QEAgentType.PERFORMANCE_TESTER,
      capabilities: [
        {
          name: 'load-testing-orchestration',
          version: '1.0.0',
          description: 'Execute load tests using multiple tools (K6, JMeter, Gatling, Artillery)',
          parameters: {
            supportedTools: ['k6', 'jmeter', 'gatling', 'artillery'],
            maxVirtualUsers: 10000,
            maxDuration: 7200 // 2 hours
          }
        },
        {
          name: 'bottleneck-detection',
          version: '1.0.0',
          description: 'Identify performance bottlenecks in CPU, memory, I/O, database, and network',
          parameters: {
            analysisTypes: ['cpu', 'memory', 'io', 'database', 'network'],
            detectionAlgorithm: 'statistical-analysis'
          }
        },
        {
          name: 'resource-monitoring',
          version: '1.0.0',
          description: 'Real-time resource monitoring during load tests',
          parameters: {
            metrics: ['cpu', 'memory', 'disk', 'network', 'connections'],
            samplingInterval: 1000 // 1 second
          }
        },
        {
          name: 'sla-validation',
          version: '1.0.0',
          description: 'Validate performance against SLA thresholds',
          parameters: {
            thresholds: config.thresholds || defaultThresholds
          }
        },
        {
          name: 'performance-regression-detection',
          version: '1.0.0',
          description: 'Detect performance regressions by comparing against baselines',
          parameters: {
            comparisonStrategy: 'statistical',
            regressionThreshold: 0.1 // 10% degradation
          }
        },
        {
          name: 'load-pattern-generation',
          version: '1.0.0',
          description: 'Generate realistic load patterns (spike, ramp-up, stress, soak)',
          parameters: {
            patterns: ['constant', 'ramp-up', 'spike', 'stress', 'soak']
          }
        }
      ]
    });

    this.config = {
      ...config,
      tools: {
        loadTesting: 'k6',
        monitoring: ['prometheus'],
        ...config.tools
      },
      thresholds: {
        ...defaultThresholds,
        ...config.thresholds
      },
      loadProfile: {
        virtualUsers: 100,
        duration: 300,
        rampUpTime: 30,
        pattern: 'ramp-up',
        ...config.loadProfile
      }
    };
  }

  // ============================================================================
  // Lifecycle Hooks for Performance Testing Coordination
  // ============================================================================

  /**
   * Pre-task hook - Load performance baselines before task execution
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    // Call parent implementation first (includes AgentDB loading)
    await super.onPreTask(data);

    // Load performance testing baselines for comparison
    const history = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/history`
    ) as { entries?: unknown[]; length?: number } | null;

    if (history && history.entries) {
      this.logger.info(`Loaded ${history.entries.length} historical performance test entries`);
    }

    this.logger.info(`[${this.agentId.type}] Starting performance testing task`, {
      taskId: data.assignment.id,
      taskType: data.assignment.task.type
    });
  }

  /**
   * Post-task hook - Store performance results and detect regressions
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    // Call parent implementation first (includes AgentDB storage, learning)
    await super.onPostTask(data);

    // Extract typed result using type guard
    const taskResult: PerformancePostTaskResult | null = isPerformancePostTaskResult(data.result)
      ? data.result
      : null;

    // Store performance test results
    await this.memoryStore.store(
      `aqe/${this.agentId.type}/results/${data.assignment.id}`,
      {
        result: data.result,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        success: taskResult?.success !== false,
        performanceMetrics: {
          latencyP95: taskResult?.latencyP95,
          throughput: taskResult?.throughput,
          errorRate: taskResult?.errorRate
        }
      },
      86400 // 24 hours
    );

    // Emit performance test event for other agents
    this.eventBus.emit(`${this.agentId.type}:completed`, {
      agentId: this.agentId,
      result: data.result,
      timestamp: new Date(),
      regressions: taskResult?.regressions || []
    });

    this.logger.info(`[${this.agentId.type}] Performance testing completed`, {
      taskId: data.assignment.id,
      performanceMet: taskResult?.success
    });
  }

  /**
   * Task error hook - Log performance test failures
   */
  protected async onTaskError(data: TaskErrorData): Promise<void> {
    // Call parent implementation
    await super.onTaskError(data);

    // Store performance test error for analysis
    await this.memoryStore.store(
      `aqe/${this.agentId.type}/errors/${Date.now()}`,
      {
        taskId: data.assignment.id,
        error: data.error.message,
        stack: data.error.stack,
        timestamp: new Date(),
        taskType: data.assignment.task.type
      },
      604800 // 7 days
    );

    // Emit error event
    this.eventBus.emit(`${this.agentId.type}:error`, {
      agentId: this.agentId,
      error: data.error,
      taskId: data.assignment.id,
      timestamp: new Date()
    });

    this.logger.error(`[${this.agentId.type}] Performance testing failed`, {
      taskId: data.assignment.id,
      error: data.error.message
    });
  }

  // ============================================================================
  // BaseAgent Implementation
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    this.logger.info(`PerformanceTesterAgent ${this.agentId.id} initializing...`);

    // Initialize load testing client
    await this.initializeLoadTestingClient();

    // Initialize monitoring client
    await this.initializeMonitoringClient();

    // Load historical baselines
    await this.loadBaselines();

    // Register event handlers
    this.registerPerformanceEventHandlers();

    this.logger.info(`PerformanceTesterAgent ${this.agentId.id} initialized successfully`);
  }

  protected async performTask(task: QETask): Promise<PerformanceTaskResult> {
    const { type, payload } = task;

    this.logger.info(`PerformanceTesterAgent executing ${type} task: ${task.id}`);

    switch (type) {
      case 'run-load-test':
        return await this.runLoadTest(payload as RunLoadTestMetadata);

      case 'detect-bottlenecks':
        return await this.detectBottlenecks(payload as DetectBottlenecksMetadata);

      case 'validate-sla':
        return await this.validateSLA(payload as ValidateSLAMetadata);

      case 'detect-regressions':
        return await this.detectRegressions(payload as DetectRegressionsMetadata);

      case 'generate-load-pattern':
        return await this.generateLoadPattern(payload as GenerateLoadPatternMetadata);

      case 'establish-baseline':
        return await this.establishBaseline(payload as EstablishBaselineMetadata);

      case 'analyze-performance':
        return await this.analyzePerformance(payload as AnalyzePerformanceMetadata);

      default:
        throw new Error(`Unsupported task type: ${type}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    // Load performance testing knowledge from memory
    const storedKnowledge = await this.retrieveMemory('performance-knowledge');
    if (storedKnowledge) {
      this.logger.info('Loaded performance testing knowledge from memory');
    }

    // Load test results history
    const resultsHistory = await this.memoryStore.retrieve('aqe/performance/results/history');
    if (resultsHistory) {
      this.logger.info('Loaded test results history from memory');
    }
  }

  protected async cleanup(): Promise<void> {
    // Save current state
    await this.storeMemory('performance-state', {
      activeTests: Array.from(this.activeTests.entries()),
      baselines: Array.from(this.baselines.entries()),
      timestamp: new Date()
    });

    // Cleanup load testing client
    if (this.loadTestingClient) {
      this.logger.info('Cleaning up load testing client');
      // In real implementation, close connections
      this.loadTestingClient = undefined;
    }

    // Cleanup monitoring client
    if (this.monitoringClient) {
      this.logger.info('Cleaning up monitoring client');
      // In real implementation, close connections
      this.monitoringClient = undefined;
    }

    this.activeTests.clear();
    this.logger.info(`PerformanceTesterAgent ${this.agentId.id} cleaned up`);
  }

  // ============================================================================
  // Load Testing Orchestration
  // ============================================================================

  private async runLoadTest(metadata: RunLoadTestMetadata): Promise<LoadTestResult> {
    const testConfig: LoadTestConfig = this.parseTestConfig(metadata);
    const testId = `loadtest-${Date.now()}`;

    this.logger.info(`Starting load test ${testId} with ${testConfig.loadProfile.virtualUsers} VUs`);

    // Emit test started event
    this.emitEvent('performance.test.started', {
      testId,
      config: testConfig
    }, 'medium');

    const startTime = new Date();

    try {
      // Generate load test script
      const script = this.generateLoadTestScript(testConfig);

      // Execute load test
      const rawResults = await this.executeLoadTest(script, testConfig);

      // Collect monitoring data
      const monitoringData = await this.collectMonitoringData(testId);

      // Analyze results
      const metrics = this.analyzeLoadTestResults(rawResults, monitoringData);

      // Detect bottlenecks
      const bottlenecks = await this.analyzeBottlenecks(metrics);

      // Validate SLA
      const slaViolations = this.checkSLAViolations(metrics, testConfig.thresholds);

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, bottlenecks, slaViolations);

      const endTime = new Date();
      const result: LoadTestResult = {
        id: testId,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        metrics,
        bottlenecks,
        slaViolations,
        recommendations
      };

      // Store results
      await this.storeTestResults(testId, result);

      // Emit test completed event
      this.emitEvent('performance.test.completed', {
        testId,
        metrics,
        passed: slaViolations.length === 0
      }, slaViolations.length > 0 ? 'high' : 'medium');

      return result;

    } catch (error) {
      this.logger.error(`Load test ${testId} failed:`, error);
      this.emitEvent('performance.test.failed', {
        testId,
        error: error instanceof Error ? error.message : String(error)
      }, 'high');
      throw error;
    }
  }

  private generateLoadTestScript(config: LoadTestConfig): string {
    const tool = this.config.tools!.loadTesting!;

    switch (tool) {
      case 'k6':
        return this.generateK6Script(config);
      case 'jmeter':
        return this.generateJMeterScript(config);
      case 'gatling':
        return this.generateGatlingScript(config);
      case 'artillery':
        return this.generateArtilleryScript(config);
      default:
        throw new Error(`Unsupported load testing tool: ${tool}`);
    }
  }

  private generateK6Script(config: LoadTestConfig): string {
    const { loadProfile, thresholds } = config;

    return `
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const latency = new Trend('latency');

export let options = {
  stages: ${this.generateStages(loadProfile)},
  thresholds: {
    'http_req_duration': ['p(95)<${thresholds.maxLatencyP95}', 'p(99)<${thresholds.maxLatencyP99}'],
    'http_reqs': ['rate>${thresholds.minThroughput}'],
    'errors': ['rate<${thresholds.maxErrorRate}']
  }
};

export default function() {
  const endpoints = ${JSON.stringify(loadProfile.endpoints || [])};

  // Select endpoint based on distribution
  const endpoint = selectEndpoint(endpoints);

  const response = http.request(
    endpoint.method,
    \`${config.targetUrl}\${endpoint.path}\`,
    endpoint.payload
  );

  check(response, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'response time < ${thresholds.maxLatencyP95}ms': (r) => r.timings.duration < ${thresholds.maxLatencyP95}
  });

  errorRate.add(response.status >= 400);
  latency.add(response.timings.duration);

  sleep(SecureRandom.randomFloat() * 2 + 1);
}

function selectEndpoint(endpoints) {
  if (endpoints.length === 0) {
    return { path: '/', method: 'GET', percentage: 100 };
  }

  const rand = SecureRandom.randomFloat() * 100;
  let cumulative = 0;

  for (const endpoint of endpoints) {
    cumulative += endpoint.percentage;
    if (rand <= cumulative) {
      return endpoint;
    }
  }

  return endpoints[0];
}
`.trim();
  }

  private generateStages(profile: LoadProfile): string {
    switch (profile.pattern) {
      case 'constant':
        return `[
    { duration: '${profile.duration}s', target: ${profile.virtualUsers} }
  ]`;

      case 'ramp-up':
        return `[
    { duration: '${profile.rampUpTime}s', target: ${profile.virtualUsers} },
    { duration: '${profile.duration - profile.rampUpTime}s', target: ${profile.virtualUsers} }
  ]`;

      case 'spike': {
        const spikeVUs = profile.virtualUsers * 3;
        return `[
    { duration: '${profile.rampUpTime}s', target: ${profile.virtualUsers} },
    { duration: '30s', target: ${spikeVUs} },
    { duration: '30s', target: ${profile.virtualUsers} },
    { duration: '${profile.duration - profile.rampUpTime - 60}s', target: ${profile.virtualUsers} }
  ]`;
      }

      case 'stress':
        return `[
    { duration: '${Math.floor(profile.duration / 4)}s', target: ${profile.virtualUsers} },
    { duration: '${Math.floor(profile.duration / 4)}s', target: ${profile.virtualUsers * 2} },
    { duration: '${Math.floor(profile.duration / 4)}s', target: ${profile.virtualUsers * 3} },
    { duration: '${Math.floor(profile.duration / 4)}s', target: ${profile.virtualUsers * 4} }
  ]`;

      case 'soak':
        return `[
    { duration: '${profile.rampUpTime}s', target: ${profile.virtualUsers} },
    { duration: '${profile.duration}s', target: ${profile.virtualUsers} }
  ]`;

      default:
        return `[{ duration: '${profile.duration}s', target: ${profile.virtualUsers} }]`;
    }
  }

  private generateJMeterScript(config: LoadTestConfig): string {
    // JMeter XML test plan generation
    return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup>
        <stringProp name="ThreadGroup.num_threads">${config.loadProfile.virtualUsers}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${config.loadProfile.rampUpTime}</stringProp>
        <stringProp name="ThreadGroup.duration">${config.loadProfile.duration}</stringProp>
      </ThreadGroup>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
  }

  private generateGatlingScript(config: LoadTestConfig): string {
    // Gatling Scala simulation
    return `
import io.gatling.core.Predef._
import io.gatling.http.Predef._

class LoadTestSimulation extends Simulation {
  val httpProtocol = http
    .baseUrl("${config.targetUrl}")
    .acceptHeader("application/json")

  val scn = scenario("Load Test")
    .exec(http("request")
      .get("/")
      .check(status.is(200))
      .check(responseTimeInMillis.lt(${config.thresholds.maxLatencyP95})))

  setUp(
    scn.inject(rampUsers(${config.loadProfile.virtualUsers}) during (${config.loadProfile.rampUpTime} seconds))
  ).protocols(httpProtocol)
}
`.trim();
  }

  private generateArtilleryScript(config: LoadTestConfig): string {
    // Artillery YAML configuration
    return JSON.stringify({
      config: {
        target: config.targetUrl,
        phases: [
          {
            duration: config.loadProfile.rampUpTime,
            arrivalRate: Math.floor(config.loadProfile.virtualUsers / config.loadProfile.rampUpTime),
            rampTo: config.loadProfile.virtualUsers
          }
        ]
      },
      scenarios: [
        {
          flow: [
            { get: { url: '/' } }
          ]
        }
      ]
    }, null, 2);
  }

  private async executeLoadTest(_script: string, config: LoadTestConfig): Promise<RawLoadTestResults> {
    // Simulate load test execution
    // In real implementation, execute the actual tool
    this.logger.info(`Executing load test with ${config.loadProfile.virtualUsers} VUs for ${config.loadProfile.duration}s`);

    // Simulate test duration
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return simulated results
    return {
      requests: {
        total: config.loadProfile.virtualUsers * Math.floor(config.loadProfile.duration / 2),
        successful: config.loadProfile.virtualUsers * Math.floor(config.loadProfile.duration / 2) * 0.98,
        failed: config.loadProfile.virtualUsers * Math.floor(config.loadProfile.duration / 2) * 0.02
      },
      latencies: Array.from({ length: 1000 }, () => SecureRandom.randomFloat() * 1000),
      throughput: config.loadProfile.virtualUsers * 2
    };
  }

  private async collectMonitoringData(_testId: string): Promise<RawMonitoringData> {
    // Simulate monitoring data collection
    // In real implementation, query monitoring platform
    return {
      cpu: {
        samples: Array.from({ length: 100 }, () => 60 + SecureRandom.randomFloat() * 30),
        average: 75,
        peak: 92
      },
      memory: {
        samples: Array.from({ length: 100 }, () => 4 + SecureRandom.randomFloat() * 2),
        average: 5.2,
        peak: 6.8
      },
      network: {
        samples: Array.from({ length: 100 }, () => 100 + SecureRandom.randomFloat() * 50),
        average: 125,
        peak: 180
      }
    };
  }

  private analyzeLoadTestResults(rawResults: RawLoadTestResults, monitoringData: RawMonitoringData): PerformanceMetrics {
    const latencies = rawResults.latencies.sort((a: number, b: number) => a - b);

    return {
      requests: {
        total: rawResults.requests.total,
        successful: rawResults.requests.successful,
        failed: rawResults.requests.failed,
        errorRate: (rawResults.requests.failed / rawResults.requests.total) * 100
      },
      latency: {
        min: latencies[0],
        max: latencies[latencies.length - 1],
        mean: latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length,
        p50: latencies[Math.floor(latencies.length * 0.5)],
        p95: latencies[Math.floor(latencies.length * 0.95)],
        p99: latencies[Math.floor(latencies.length * 0.99)]
      },
      throughput: {
        requestsPerSecond: rawResults.throughput,
        bytesPerSecond: rawResults.throughput * 1024
      },
      resources: {
        cpu: {
          current: monitoringData.cpu.samples[monitoringData.cpu.samples.length - 1],
          average: monitoringData.cpu.average,
          peak: monitoringData.cpu.peak,
          unit: '%'
        },
        memory: {
          current: monitoringData.memory.samples[monitoringData.memory.samples.length - 1],
          average: monitoringData.memory.average,
          peak: monitoringData.memory.peak,
          unit: 'GB'
        },
        network: {
          current: monitoringData.network.samples[monitoringData.network.samples.length - 1],
          average: monitoringData.network.average,
          peak: monitoringData.network.peak,
          unit: 'Mbps'
        }
      }
    };
  }

  // ============================================================================
  // Bottleneck Detection
  // ============================================================================

  private async detectBottlenecks(metadata: DetectBottlenecksMetadata): Promise<Bottleneck[]> {
    const { metrics, testId } = metadata;

    this.logger.info(`Detecting bottlenecks for test ${testId}`);

    const bottlenecks: Bottleneck[] = [];

    // Analyze CPU bottlenecks
    if (metrics.resources.cpu.peak > this.config.thresholds!.maxCpuUsage!) {
      bottlenecks.push({
        type: 'CPU',
        severity: this.calculateSeverity(metrics.resources.cpu.peak, this.config.thresholds!.maxCpuUsage!),
        location: 'Application Server',
        description: `CPU usage reached ${metrics.resources.cpu.peak}%, exceeding threshold of ${this.config.thresholds!.maxCpuUsage}%`,
        metrics: {
          current: metrics.resources.cpu.peak,
          average: metrics.resources.cpu.average,
          threshold: this.config.thresholds!.maxCpuUsage!
        },
        remediation: [
          'Profile application to identify CPU-intensive operations',
          'Consider horizontal scaling',
          'Optimize algorithms and reduce computational complexity',
          'Implement caching for expensive operations'
        ],
        impactEstimate: 'High - May cause request timeouts and degraded user experience'
      });
    }

    // Analyze memory bottlenecks
    if (metrics.resources.memory.peak > this.config.thresholds!.maxMemoryUsage!) {
      bottlenecks.push({
        type: 'MEMORY',
        severity: this.calculateSeverity(metrics.resources.memory.peak, this.config.thresholds!.maxMemoryUsage!),
        location: 'Application Server',
        description: `Memory usage reached ${metrics.resources.memory.peak}GB, exceeding threshold`,
        metrics: {
          current: metrics.resources.memory.peak,
          average: metrics.resources.memory.average,
          threshold: this.config.thresholds!.maxMemoryUsage!
        },
        remediation: [
          'Check for memory leaks',
          'Implement connection pooling',
          'Optimize data structures',
          'Increase available memory'
        ],
        impactEstimate: 'Critical - May cause OOM errors and application crashes'
      });
    }

    // Analyze latency bottlenecks
    if (metrics.latency.p95 > this.config.thresholds!.maxLatencyP95!) {
      const latencyType = this.identifyLatencyBottleneck(metrics);
      bottlenecks.push({
        type: latencyType,
        severity: 'HIGH',
        location: 'Request Pipeline',
        description: `P95 latency is ${metrics.latency.p95}ms, exceeding ${this.config.thresholds!.maxLatencyP95}ms threshold`,
        metrics: {
          p95: metrics.latency.p95,
          p99: metrics.latency.p99,
          mean: metrics.latency.mean,
          threshold: this.config.thresholds!.maxLatencyP95!
        },
        remediation: [
          'Optimize database queries',
          'Implement caching layer',
          'Add CDN for static assets',
          'Review external API calls'
        ],
        impactEstimate: 'High - Affects user experience and conversion rates'
      });
    }

    // Store bottleneck analysis
    await this.memoryStore.store(`aqe/performance/bottlenecks/${testId}`, {
      bottlenecks,
      analyzedAt: new Date(),
      testId
    });

    // Emit bottleneck detected events
    for (const bottleneck of bottlenecks) {
      if (bottleneck.severity === 'CRITICAL' || bottleneck.severity === 'HIGH') {
        this.emitEvent('performance.bottleneck.detected', {
          type: bottleneck.type,
          severity: bottleneck.severity,
          metrics: bottleneck.metrics
        }, bottleneck.severity === 'CRITICAL' ? 'critical' : 'high');
      }
    }

    return bottlenecks;
  }

  private async analyzeBottlenecks(metrics: PerformanceMetrics): Promise<Bottleneck[]> {
    return await this.detectBottlenecks({ metrics, testId: 'current' });
  }

  private identifyLatencyBottleneck(metrics: PerformanceMetrics): Bottleneck['type'] {
    // Heuristic to identify latency source
    if (metrics.resources.cpu.peak > 80) return 'CPU';
    if (metrics.resources.memory.peak > 80) return 'MEMORY';
    if (metrics.latency.p99 > metrics.latency.p95 * 2) return 'DATABASE';
    return 'NETWORK';
  }

  private calculateSeverity(current: number, threshold: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const ratio = current / threshold;
    if (ratio > 1.5) return 'CRITICAL';
    if (ratio > 1.25) return 'HIGH';
    if (ratio > 1.1) return 'MEDIUM';
    return 'LOW';
  }

  // ============================================================================
  // SLA Validation
  // ============================================================================

  private async validateSLA(metadata: ValidateSLAMetadata): Promise<{ passed: boolean; violations: SLAViolation[] }> {
    const { metrics, thresholds } = metadata;

    this.logger.info('Validating SLA thresholds');

    const violations: SLAViolation[] = [];

    // Check P95 latency
    if (metrics.latency.p95 > thresholds.maxLatencyP95) {
      violations.push({
        metric: 'latency_p95',
        threshold: thresholds.maxLatencyP95,
        actual: metrics.latency.p95,
        violation: ((metrics.latency.p95 - thresholds.maxLatencyP95) / thresholds.maxLatencyP95) * 100,
        severity: this.calculateViolationSeverity(metrics.latency.p95, thresholds.maxLatencyP95),
        duration: 0 // Would be calculated from monitoring data
      });
    }

    // Check P99 latency
    if (metrics.latency.p99 > thresholds.maxLatencyP99) {
      violations.push({
        metric: 'latency_p99',
        threshold: thresholds.maxLatencyP99,
        actual: metrics.latency.p99,
        violation: ((metrics.latency.p99 - thresholds.maxLatencyP99) / thresholds.maxLatencyP99) * 100,
        severity: this.calculateViolationSeverity(metrics.latency.p99, thresholds.maxLatencyP99),
        duration: 0
      });
    }

    // Check throughput
    if (metrics.throughput.requestsPerSecond < thresholds.minThroughput) {
      violations.push({
        metric: 'throughput',
        threshold: thresholds.minThroughput,
        actual: metrics.throughput.requestsPerSecond,
        violation: ((thresholds.minThroughput - metrics.throughput.requestsPerSecond) / thresholds.minThroughput) * 100,
        severity: 'HIGH',
        duration: 0
      });
    }

    // Check error rate
    if (metrics.requests.errorRate > thresholds.maxErrorRate * 100) {
      violations.push({
        metric: 'error_rate',
        threshold: thresholds.maxErrorRate * 100,
        actual: metrics.requests.errorRate,
        violation: ((metrics.requests.errorRate - thresholds.maxErrorRate * 100) / (thresholds.maxErrorRate * 100)) * 100,
        severity: 'CRITICAL',
        duration: 0
      });
    }

    // Emit SLA violation events
    if (violations.length > 0) {
      this.emitEvent('performance.sla.violated', {
        violationCount: violations.length,
        violations
      }, 'critical');
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }

  private async checkSLAViolationsAsync(metrics: PerformanceMetrics, thresholds: PerformanceThresholds): Promise<SLAViolation[]> {
    const result = await this.validateSLA({ metrics, thresholds });
    return result.violations;
  }

  private checkSLAViolations(metrics: PerformanceMetrics, thresholds: PerformanceThresholds): SLAViolation[] {
    // Synchronous version for internal use
    const violations: SLAViolation[] = [];

    // Check P95 latency
    if (metrics.latency.p95 > thresholds.maxLatencyP95) {
      violations.push({
        metric: 'latency_p95',
        threshold: thresholds.maxLatencyP95,
        actual: metrics.latency.p95,
        violation: ((metrics.latency.p95 - thresholds.maxLatencyP95) / thresholds.maxLatencyP95) * 100,
        severity: this.calculateViolationSeverity(metrics.latency.p95, thresholds.maxLatencyP95),
        duration: 0
      });
    }

    // Check P99 latency
    if (metrics.latency.p99 > thresholds.maxLatencyP99) {
      violations.push({
        metric: 'latency_p99',
        threshold: thresholds.maxLatencyP99,
        actual: metrics.latency.p99,
        violation: ((metrics.latency.p99 - thresholds.maxLatencyP99) / thresholds.maxLatencyP99) * 100,
        severity: this.calculateViolationSeverity(metrics.latency.p99, thresholds.maxLatencyP99),
        duration: 0
      });
    }

    // Check throughput
    if (metrics.throughput.requestsPerSecond < thresholds.minThroughput) {
      violations.push({
        metric: 'throughput',
        threshold: thresholds.minThroughput,
        actual: metrics.throughput.requestsPerSecond,
        violation: ((thresholds.minThroughput - metrics.throughput.requestsPerSecond) / thresholds.minThroughput) * 100,
        severity: 'HIGH',
        duration: 0
      });
    }

    // Check error rate
    if (metrics.requests.errorRate > thresholds.maxErrorRate * 100) {
      violations.push({
        metric: 'error_rate',
        threshold: thresholds.maxErrorRate * 100,
        actual: metrics.requests.errorRate,
        violation: ((metrics.requests.errorRate - thresholds.maxErrorRate * 100) / (thresholds.maxErrorRate * 100)) * 100,
        severity: 'CRITICAL',
        duration: 0
      });
    }

    return violations;
  }

  private calculateViolationSeverity(actual: number, threshold: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    return this.calculateSeverity(actual, threshold);
  }

  // ============================================================================
  // Performance Regression Detection
  // ============================================================================

  private async detectRegressions(metadata: DetectRegressionsMetadata): Promise<RegressionAnalysis> {
    const { currentMetrics, baselineId } = metadata;

    this.logger.info(`Detecting performance regressions against baseline ${baselineId}`);

    // Retrieve baseline
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline ${baselineId} not found`);
    }

    const regressions: PerformanceRegression[] = [];
    const improvements: PerformanceImprovement[] = [];

    // Compare latency
    const latencyDelta = ((currentMetrics.latency.p95 - baseline.metrics.latency.p95) / baseline.metrics.latency.p95);
    if (latencyDelta > 0.1) { // 10% degradation threshold
      regressions.push({
        metric: 'latency_p95',
        baseline: baseline.metrics.latency.p95,
        current: currentMetrics.latency.p95,
        degradation: latencyDelta * 100,
        severity: this.calculateRegressionSeverity(latencyDelta)
      });
    } else if (latencyDelta < -0.1) { // 10% improvement
      improvements.push({
        metric: 'latency_p95',
        baseline: baseline.metrics.latency.p95,
        current: currentMetrics.latency.p95,
        improvement: Math.abs(latencyDelta) * 100
      });
    }

    // Compare throughput
    const throughputDelta = ((currentMetrics.throughput.requestsPerSecond - baseline.metrics.throughput.requestsPerSecond) / baseline.metrics.throughput.requestsPerSecond);
    if (throughputDelta < -0.1) { // 10% degradation
      regressions.push({
        metric: 'throughput',
        baseline: baseline.metrics.throughput.requestsPerSecond,
        current: currentMetrics.throughput.requestsPerSecond,
        degradation: Math.abs(throughputDelta) * 100,
        severity: this.calculateRegressionSeverity(Math.abs(throughputDelta))
      });
    } else if (throughputDelta > 0.1) { // 10% improvement
      improvements.push({
        metric: 'throughput',
        baseline: baseline.metrics.throughput.requestsPerSecond,
        current: currentMetrics.throughput.requestsPerSecond,
        improvement: throughputDelta * 100
      });
    }

    // Compare error rate
    const errorRateDelta = ((currentMetrics.requests.errorRate - baseline.metrics.requests.errorRate) / baseline.metrics.requests.errorRate);
    if (errorRateDelta > 0.2) { // 20% increase in errors
      regressions.push({
        metric: 'error_rate',
        baseline: baseline.metrics.requests.errorRate,
        current: currentMetrics.requests.errorRate,
        degradation: errorRateDelta * 100,
        severity: 'CRITICAL'
      });
    }

    const verdict = regressions.length === 0 ? 'PASS' :
                    regressions.some(r => r.severity === 'CRITICAL') ? 'FAIL' : 'WARNING';

    // Store regression analysis
    await this.memoryStore.store('aqe/performance/regressions/latest', {
      current: currentMetrics,
      baseline: baseline.metrics,
      regressions,
      improvements,
      verdict,
      analyzedAt: new Date()
    });

    // Emit regression detected events
    if (regressions.length > 0) {
      this.emitEvent('performance.regression.detected', {
        count: regressions.length,
        severity: verdict,
        regressions
      }, verdict === 'FAIL' ? 'critical' : 'high');
    }

    return {
      current: currentMetrics,
      baseline: baseline.metrics,
      regressions,
      improvements,
      verdict
    };
  }

  private calculateRegressionSeverity(degradation: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (degradation > 0.5) return 'CRITICAL'; // 50% degradation
    if (degradation > 0.3) return 'HIGH'; // 30% degradation
    if (degradation > 0.15) return 'MEDIUM'; // 15% degradation
    return 'LOW';
  }

  // ============================================================================
  // Baseline Management
  // ============================================================================

  private async establishBaseline(metadata: EstablishBaselineMetadata): Promise<PerformanceBaseline> {
    const { metrics, version, environment } = metadata;

    const baseline: PerformanceBaseline = {
      timestamp: new Date(),
      metrics,
      loadProfile: this.config.loadProfile!,
      version,
      environment
    };

    const baselineId = `${version}-${environment}`;
    this.baselines.set(baselineId, baseline);

    // Store baseline
    await this.memoryStore.store(`aqe/performance/baselines/${baselineId}`, baseline);

    this.logger.info(`Established performance baseline ${baselineId}`);

    return baseline;
  }

  private async loadBaselines(): Promise<void> {
    try {
      // Load baselines from memory
      const storedBaselines = await this.memoryStore.retrieve('aqe/performance/baselines');
      if (storedBaselines) {
        for (const [id, baseline] of Object.entries(storedBaselines)) {
          this.baselines.set(id, baseline as PerformanceBaseline);
        }
        this.logger.info(`Loaded ${this.baselines.size} performance baselines`);
      }
    } catch (error) {
      this.logger.warn('Could not load baselines:', error);
    }
  }

  // ============================================================================
  // Load Pattern Generation
  // ============================================================================

  private async generateLoadPattern(metadata: GenerateLoadPatternMetadata): Promise<LoadProfile> {
    const { pattern, virtualUsers, duration } = metadata;

    const loadProfile: LoadProfile = {
      virtualUsers: virtualUsers || this.config.loadProfile!.virtualUsers,
      duration: duration || this.config.loadProfile!.duration,
      rampUpTime: Math.floor((duration || this.config.loadProfile!.duration) * 0.1),
      pattern: pattern || this.config.loadProfile!.pattern
    };

    this.logger.info(`Generated ${pattern} load pattern with ${virtualUsers} VUs`);

    return loadProfile;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async initializeLoadTestingClient(): Promise<void> {
    const tool = this.config.tools!.loadTesting!;
    this.logger.info(`Initializing ${tool} load testing client`);
    // In real implementation, initialize actual client
    this.loadTestingClient = { tool, initialized: true };
  }

  private async initializeMonitoringClient(): Promise<void> {
    const monitoring = this.config.tools!.monitoring!;
    this.logger.info(`Initializing monitoring clients: ${monitoring.join(', ')}`);
    // In real implementation, initialize actual monitoring clients
    this.monitoringClient = { platforms: monitoring, initialized: true };
  }

  private registerPerformanceEventHandlers(): void {
    // Listen for test execution requests from other agents
    this.registerEventHandler({
      eventType: 'test.execution.complete',
      handler: async (event) => {
        // Extract test execution data from the event
        const eventData = event.data as TestExecutionCompleteEvent | undefined;
        // Automatically run performance tests after functional tests
        this.logger.info('Functional tests completed, considering performance test run', {
          testId: eventData?.testId,
          passed: eventData?.passed
        });
      }
    });
  }

  private parseTestConfig(metadata: RunLoadTestMetadata): LoadTestConfig {
    return {
      targetUrl: metadata.targetUrl || 'http://localhost:3000',
      loadProfile: metadata.loadProfile || this.config.loadProfile!,
      thresholds: metadata.thresholds || this.config.thresholds!,
      monitoring: metadata.monitoring
    };
  }

  private async storeTestResults(testId: string, result: LoadTestResult): Promise<void> {
    // Store in active tests
    this.activeTests.set(testId, result);

    // Store in memory for other agents
    await this.memoryStore.store(`aqe/performance/results/${testId}`, result);

    // Store in shared memory
    await this.storeSharedMemory('latest-test', {
      testId,
      timestamp: new Date(),
      passed: result.slaViolations.length === 0,
      metrics: result.metrics
    });
  }

  private generateRecommendations(
    metrics: PerformanceMetrics,
    bottlenecks: Bottleneck[],
    violations: SLAViolation[]
  ): string[] {
    const recommendations: string[] = [];

    // Recommendations based on bottlenecks
    for (const bottleneck of bottlenecks) {
      recommendations.push(...bottleneck.remediation);
    }

    // Recommendations based on SLA violations
    if (violations.length > 0) {
      recommendations.push('Review and optimize critical user paths');
      recommendations.push('Consider infrastructure scaling');
    }

    // General recommendations based on metrics
    if (metrics.requests.errorRate > 1) {
      recommendations.push('Investigate and fix error sources to reduce error rate');
    }

    if (metrics.latency.p99 > metrics.latency.p95 * 2) {
      recommendations.push('Large P99 tail latency detected - investigate outliers');
    }

    // Deduplicate recommendations
    return Array.from(new Set(recommendations));
  }

  private async analyzePerformance(metadata: AnalyzePerformanceMetadata): Promise<PerformanceAnalysisResult> {
    const { testId } = metadata;

    // Retrieve test results
    const storedResult = await this.memoryStore.retrieve(`aqe/performance/results/${testId}`) as LoadTestResult | null;
    const result: LoadTestResult | undefined = this.activeTests.get(testId) || storedResult || undefined;

    if (!result) {
      throw new Error(`Test results not found for ${testId}`);
    }

    return {
      summary: {
        passed: result.slaViolations.length === 0,
        duration: result.duration,
        totalRequests: result.metrics.requests.total,
        errorRate: result.metrics.requests.errorRate,
        p95Latency: result.metrics.latency.p95
      },
      bottlenecks: result.bottlenecks,
      violations: result.slaViolations,
      recommendations: result.recommendations
    };
  }

  private getDefaultThresholds(): PerformanceThresholds {
    return {
      maxLatencyP95: 500,
      maxLatencyP99: 1000,
      minThroughput: 1000,
      maxErrorRate: 0.01,
      maxCpuUsage: 80,
      maxMemoryUsage: 85
    };
  }

  /**
   * Extract domain-specific metrics for Nightly-Learner
   * Provides rich performance testing metrics for pattern learning
   */
  protected extractTaskMetrics(result: PerformanceTaskResult | null): Record<string, number> {
    const metrics: Record<string, number> = {};

    if (!result) {
      return metrics;
    }

    // Use type guard to check for LoadTestResult
    if (isLoadTestResult(result)) {
      // Request metrics
      if (result.metrics?.requests) {
        metrics.total_requests = result.metrics.requests.total || 0;
        metrics.successful_requests = result.metrics.requests.successful || 0;
        metrics.failed_requests = result.metrics.requests.failed || 0;
        metrics.error_rate = result.metrics.requests.errorRate || 0;
      }

      // Latency metrics
      if (result.metrics?.latency) {
        metrics.latency_min = result.metrics.latency.min || 0;
        metrics.latency_max = result.metrics.latency.max || 0;
        metrics.latency_mean = result.metrics.latency.mean || 0;
        metrics.latency_p50 = result.metrics.latency.p50 || 0;
        metrics.latency_p95 = result.metrics.latency.p95 || 0;
        metrics.latency_p99 = result.metrics.latency.p99 || 0;
      }

      // Throughput metrics
      if (result.metrics?.throughput) {
        metrics.requests_per_second = result.metrics.throughput.requestsPerSecond || 0;
        metrics.bytes_per_second = result.metrics.throughput.bytesPerSecond || 0;
      }

      // Resource metrics
      if (result.metrics?.resources) {
        metrics.cpu_peak = result.metrics.resources.cpu?.peak || 0;
        metrics.memory_peak = result.metrics.resources.memory?.peak || 0;
      }

      // Bottleneck and SLA metrics
      metrics.bottleneck_count = result.bottlenecks?.length || 0;
      metrics.sla_violations = result.slaViolations?.length || 0;
      metrics.recommendations_count = result.recommendations?.length || 0;

      // Duration
      if (typeof result.duration === 'number') {
        metrics.test_duration = result.duration;
      }
    } else if (hasPerformanceMetrics(result)) {
      // Handle other result types that have metrics
      const metricsData = result.metrics;
      if (metricsData.requests) {
        metrics.total_requests = metricsData.requests.total || 0;
        metrics.error_rate = metricsData.requests.errorRate || 0;
      }
      if (metricsData.latency) {
        metrics.latency_p95 = metricsData.latency.p95 || 0;
        metrics.latency_p99 = metricsData.latency.p99 || 0;
      }
    }

    return metrics;
  }
}