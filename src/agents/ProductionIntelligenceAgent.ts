/**
 * ProductionIntelligenceAgent - Converts production data into test scenarios
 *
 * Implements incident replay testing, RUM analysis, anomaly detection,
 * load pattern analysis, and feature usage analytics to close the
 * production-to-testing feedback loop.
 *
 * Based on SPARC methodology and AQE Fleet specification
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { SecureRandom } from '../utils/SecureRandom.js';
import {
  AgentType as _AgentType,
  QEAgentType,
  QETask,
  TestSuite,
  Test,
  TestType,
  QETestResult as _QETestResult,
  TaskAssignment,
  PreTaskData,
  PostTaskData,
  TaskErrorData
} from '../types';

// ============================================================================
// Configuration Interfaces
// ============================================================================

export interface ProductionIntelligenceConfig extends BaseAgentConfig {
  // Monitoring platform configurations
  monitoringPlatforms?: {
    datadog?: {
      apiKey: string;
      appKey: string;
      site?: string;
    };
    newRelic?: {
      apiKey: string;
      accountId: string;
    };
    grafana?: {
      url: string;
      apiKey: string;
    };
  };

  // Analysis thresholds
  thresholds?: {
    anomalyStdDev: number; // Standard deviations for anomaly detection (default: 3)
    errorRateSpike: number; // Error rate increase percentage (default: 0.5)
    latencyDegradation: number; // Latency increase percentage (default: 0.3)
    minIncidentOccurrences: number; // Minimum occurrences to trigger test generation (default: 5)
  };

  // Feature flags
  features?: {
    incidentReplay: boolean;
    rumAnalysis: boolean;
    anomalyDetection: boolean;
    loadPatternAnalysis: boolean;
    featureUsageAnalytics: boolean;
  };
}

// ============================================================================
// Production Data Interfaces
// ============================================================================

export interface ProductionIncident {
  id: string;
  timestamp: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  service: string;
  error: string;
  affectedUsers: number;
  duration: number;
  region: string;
  context: {
    systemState: {
      cpu: number;
      memory: number;
      connections: number;
      queueDepth: number;
      cacheHitRate: number;
    };
    requestTrace?: {
      traceId: string;
      spanId: string;
      duration: number;
      hops: Array<{
        service: string;
        duration: number;
        timeout?: boolean;
      }>;
    };
    userContext?: {
      userId: string;
      sessionId: string;
      userAgent: string;
      location: string;
    };
    environmentalFactors?: {
      trafficSpike?: boolean;
      deploymentRecent?: boolean;
      externalServiceDegraded?: string;
      databaseSlowQuery?: boolean;
    };
  };
}

export interface RUMData {
  timeWindow: string;
  totalSessions: number;
  totalPageViews: number;
  userJourneys: UserJourney[];
  deviceDistribution: Record<string, number>;
  browserDistribution: Record<string, number>;
  performanceMetrics: {
    FCP: { p50: number; p95: number; p99: number }; // First Contentful Paint
    LCP: { p50: number; p95: number; p99: number }; // Largest Contentful Paint
    FID: { p50: number; p95: number; p99: number }; // First Input Delay
    CLS: { p50: number; p95: number; p99: number }; // Cumulative Layout Shift
  };
  errorPatterns: ErrorPattern[];
  featureUsage: Record<string, FeatureUsageMetrics>;
}

export interface UserJourney {
  pattern: string;
  frequency: number;
  avgDuration: number;
  conversionRate: number;
  dropoffPoints?: Array<{
    step: string;
    dropoffRate: number;
    reason: string;
  }>;
  steps?: JourneyStep[];
}

export interface JourneyStep {
  timestamp: string;
  action: string;
  duration: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface ErrorPattern {
  error: string;
  frequency: number;
  affectedUsers: number;
  browsers?: string[];
  regions?: string[];
  pages?: string[];
  timePattern?: string;
  userImpact: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface FeatureUsageMetrics {
  usage: number;
  satisfaction?: number;
  clickthrough?: number;
  conversion?: number;
}

/** User behavior pattern metrics within load patterns */
export interface UserBehaviorMetrics {
  avgSessionDuration: number;
  avgPagesPerSession: number;
  bounceRate?: number;
  conversionRate?: number;
}

export interface LoadPattern {
  dailyPattern: {
    hourly: Array<{ hour: number; rps: number }>;
    peakHours: number[];
    lowTrafficHours: number[];
  };
  weeklyPattern: Record<string, { rps: number; conversionRate: number }>;
  seasonalPattern?: Record<string, { rps: number; spike: number }>;
  endpointDistribution: Record<string, number>;
  userBehaviorPatterns: Record<string, UserBehaviorMetrics>;
}

export interface AnomalyDetection {
  type: 'ERROR_RATE_SPIKE' | 'LATENCY_DEGRADATION' | 'USER_BEHAVIOR_ANOMALY' | 'THROUGHPUT_DROP';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: {
    current: number;
    baseline: number;
    deviation: number;
    magnitude: number;
    confidence: number;
  };
  affectedUsers?: number;
  affectedEndpoints?: string[];
  recommendation: string;
  hypothesis?: string;
}

// ============================================================================
// Production Metrics and Analysis Interfaces
// ============================================================================

/** Baseline metric statistics for anomaly detection */
export interface BaselineMetric {
  mean: number;
  stdDev: number;
  p95?: number;
  p99?: number;
  conversionRate?: number;
}

/** Current production metrics snapshot */
export interface ProductionMetrics {
  errorRate?: number;
  activeUsers?: number;
  latency?: {
    p50?: number;
    p95: number;
    p99?: number;
  };
  conversionRate?: number;
  endpoints?: string[];
  throughput?: number;
  timestamp?: string;
}

/** Performance insights for web vitals */
export interface PerformanceInsight {
  status: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR';
  p95: number;
  threshold: number;
}

/** Aggregated performance insights */
export interface PerformanceInsights {
  fcp: PerformanceInsight;
  lcp: PerformanceInsight;
  fid: PerformanceInsight;
  cls: PerformanceInsight;
}

/** Feature usage analytics result */
export interface FeatureAnalysis {
  name: string;
  usage: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DEPRECATED';
  testCoverage: number;
  recommendation: string;
}

/** Unused feature identification */
export interface UnusedFeature {
  name: string;
  lastUsed: string;
  recommendation: string;
}

/** Feature usage data from analytics platform */
export interface FeatureUsageData {
  totalUsers: number;
  features: Array<{
    name: string;
    activeUsers: number;
    satisfaction?: number;
    clickthrough?: number;
    conversion?: number;
    seasonal?: boolean;
    lastUsed?: string;
  }>;
}

/** Production event for event handlers */
export interface ProductionEvent {
  type: string;
  data: ProductionIncident | ProductionMetrics;
  timestamp: Date;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

/** Monitoring client wrapper */
export interface MonitoringClient {
  initialized: boolean;
  platform?: string;
}

/** Task result metrics for extractTaskMetrics */
export interface TaskResultMetrics {
  incidents?: Array<{
    severity: string;
    testScenario?: unknown;
  }>;
  testScenarios?: Array<{
    type: string;
  }>;
  rum?: {
    sessionsAnalyzed?: number;
    userJourneys?: number;
    errorPatterns?: number;
  };
  comparison?: {
    metricsCount?: number;
    discrepancies?: number;
    correlation?: number;
  };
  patterns?: Array<{
    actionable?: boolean;
  }>;
  productionCoverage?: number;
  confidence?: number;
}

// ============================================================================
// Production Intelligence Agent Implementation
// ============================================================================

export class ProductionIntelligenceAgent extends BaseAgent {
  private readonly config: ProductionIntelligenceConfig;
  private baselineMetrics: Map<string, BaselineMetric> = new Map();
  private monitoringClients: Map<string, MonitoringClient> = new Map();

  constructor(config: ProductionIntelligenceConfig) {
    super({
      ...config,
      type: QEAgentType.PRODUCTION_INTELLIGENCE,
      capabilities: [
        {
          name: 'incident-replay',
          version: '1.0.0',
          description: 'Convert production incidents into reproducible test scenarios',
          parameters: {
            minOccurrences: config.thresholds?.minIncidentOccurrences || 5,
            severityFilter: ['HIGH', 'CRITICAL']
          }
        },
        {
          name: 'rum-analysis',
          version: '1.0.0',
          description: 'Analyze Real User Monitoring data to generate realistic test scenarios',
          parameters: {
            deviceTypes: ['mobile', 'desktop', 'tablet'],
            browserSupport: ['chrome', 'safari', 'firefox', 'edge']
          }
        },
        {
          name: 'anomaly-detection',
          version: '1.0.0',
          description: 'Detect abnormal patterns indicating potential bugs',
          parameters: {
            stdDevThreshold: config.thresholds?.anomalyStdDev || 3,
            detectionWindow: 300000 // 5 minutes
          }
        },
        {
          name: 'load-pattern-analysis',
          version: '1.0.0',
          description: 'Extract realistic load patterns from production traffic',
          parameters: {
            analysisWindow: '30d',
            includeSeasonality: true
          }
        },
        {
          name: 'feature-usage-analytics',
          version: '1.0.0',
          description: 'Track feature usage to prioritize testing efforts',
          parameters: {
            usageThreshold: 0.05, // 5% minimum usage
            deadCodeWindow: 90 // days
          }
        }
      ]
    });

    this.config = {
      ...config,
      thresholds: {
        anomalyStdDev: 3,
        errorRateSpike: 0.5,
        latencyDegradation: 0.3,
        minIncidentOccurrences: 5,
        ...config.thresholds
      },
      features: {
        incidentReplay: true,
        rumAnalysis: true,
        anomalyDetection: true,
        loadPatternAnalysis: true,
        featureUsageAnalytics: true,
        ...config.features
      }
    };
  }

  // ============================================================================
  // Lifecycle Hooks for Production Intelligence Coordination
  // ============================================================================

  /**
   * Pre-task hook - Load incident history
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    await super.onPreTask(data);

    const history = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/history`
    );

    if (history && Array.isArray(history)) {
      console.log(`Loaded ${history.length} historical production intelligence entries`);
    }

    console.log(`[${this.agentId.type}] Starting production intelligence task`, {
      taskId: data.assignment.id,
      taskType: data.assignment.task.type
    });
  }

  /**
   * Post-task hook - Store production patterns and emit events
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    await super.onPostTask(data);

    const result = data.result as TaskResultMetrics | undefined;

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/results/${data.assignment.id}`,
      {
        result: data.result,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        success: result?.confidence !== undefined ? result.confidence > 0 : true,
        incidentsAnalyzed: result?.incidents?.length || 0,
        testScenariosGenerated: result?.testScenarios?.length || 0
      },
      86400
    );

    this.eventBus.emit(`${this.agentId.type}:completed`, {
      agentId: this.agentId,
      result: data.result,
      timestamp: new Date(),
      testScenarios: result?.testScenarios || []
    });

    console.log(`[${this.agentId.type}] Production intelligence analysis completed`, {
      taskId: data.assignment.id,
      scenariosGenerated: result?.testScenarios?.length || 0
    });
  }

  /**
   * Task error hook - Log production intelligence failures
   */
  protected async onTaskError(data: TaskErrorData): Promise<void> {
    await super.onTaskError(data);

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/errors/${Date.now()}`,
      {
        taskId: data.assignment.id,
        error: data.error.message,
        stack: data.error.stack,
        timestamp: new Date(),
        taskType: data.assignment.task.type
      },
      604800
    );

    this.eventBus.emit(`${this.agentId.type}:error`, {
      agentId: this.agentId,
      error: data.error,
      taskId: data.assignment.id,
      timestamp: new Date()
    });

    console.error(`[${this.agentId.type}] Production intelligence task failed`, {
      taskId: data.assignment.id,
      error: data.error.message
    });
  }

  // ============================================================================
  // BaseAgent Implementation
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    console.log(`ProductionIntelligenceAgent ${this.agentId.id} initializing...`);

    // Initialize monitoring platform clients
    await this.initializeMonitoringClients();

    // Load historical baseline metrics
    await this.loadBaselineMetrics();

    // Register event handlers for production events
    this.registerProductionEventHandlers();

    console.log(`ProductionIntelligenceAgent ${this.agentId.id} initialized successfully`);
  }

  protected async performTask(task: QETask): Promise<any> {
    const { type, payload } = task;

    console.log(`ProductionIntelligenceAgent executing ${type} task: ${task.id}`);

    switch (type) {
      case 'incident-replay':
        return await this.performIncidentReplay(payload);

      case 'rum-analysis':
        return await this.performRUMAnalysis(payload);

      case 'anomaly-detection':
        return await this.performAnomalyDetection(payload);

      case 'load-pattern-analysis':
        return await this.performLoadPatternAnalysis(payload);

      case 'feature-usage-analytics':
        return await this.performFeatureUsageAnalytics(payload);

      case 'generate-tests-from-incidents':
        return await this.generateTestsFromIncidents(payload);

      case 'generate-tests-from-rum':
        return await this.generateTestsFromRUM(payload);

      case 'analyze-production-vs-staging':
        return await this.analyzeProductionVsStaging(payload);

      default:
        throw new Error(`Unsupported task type: ${type}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    // Load production intelligence patterns and insights
    const storedPatterns = await this.retrieveMemory('production-patterns');
    if (storedPatterns) {
      console.log('Loaded production intelligence patterns from memory');
    }

    // Load incident history
    const incidentHistory = await this.memoryStore.retrieve('aqe/production/incidents');
    if (incidentHistory) {
      console.log('Loaded incident history from memory');
    }

    // Load RUM data
    const rumData = await this.memoryStore.retrieve('aqe/production/rum-data');
    if (rumData) {
      console.log('Loaded RUM data from memory');
    }
  }

  protected async cleanup(): Promise<void> {
    // Save current state
    await this.storeMemory('production-state', {
      baselineMetrics: Array.from(this.baselineMetrics.entries()),
      timestamp: new Date()
    });

    // Close monitoring client connections
    for (const [platform, _client] of this.monitoringClients.entries()) {
      console.log(`Closing connection to ${platform}`);
      // In real implementation, properly close connections
    }

    this.monitoringClients.clear();
    console.log(`ProductionIntelligenceAgent ${this.agentId.id} cleaned up`);
  }

  // ============================================================================
  // Incident Replay Testing
  // ============================================================================

  private async performIncidentReplay(data: {
    incident: ProductionIncident;
  }): Promise<{
    testScenario: Test;
    reproducible: boolean;
    testSuite?: TestSuite;
  }> {
    const { incident } = data;

    console.log(`Analyzing incident ${incident.id} for replay testing`);

    // Generate test scenario from incident
    const testScenario = await this.generateIncidentTestScenario(incident);

    // Store incident analysis
    await this.memoryStore.store(
      `aqe/incidents/${incident.id}`,
      {
        incident,
        testScenario,
        analyzedAt: new Date(),
        severity: incident.severity
      }
    );

    // Emit event for test generation
    this.emitEvent('production.incident.analyzed', {
      incidentId: incident.id,
      testScenarioId: testScenario.id,
      severity: incident.severity
    }, incident.severity === 'CRITICAL' ? 'critical' : 'high');

    return {
      testScenario,
      reproducible: true,
      testSuite: {
        id: `incident-replay-${incident.id}`,
        name: `Incident Replay: ${incident.id} - ${incident.error}`,
        tests: [testScenario],
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 0,
          framework: 'jest',
          estimatedDuration: incident.context.requestTrace?.duration || 5000,
          generationStrategy: 'incident-replay'
        }
      }
    };
  }

  private async generateIncidentTestScenario(incident: ProductionIncident): Promise<Test> {
    return {
      id: `test-incident-${incident.id}`,
      name: `should handle ${incident.error} gracefully`,
      type: TestType.INTEGRATION,
      parameters: [
        {
          name: 'incident',
          value: incident,
          type: 'ProductionIncident'
        },
        {
          name: 'systemState',
          value: incident.context.systemState,
          type: 'SystemState'
        },
        {
          name: 'expectedBehavior',
          value: 'graceful-degradation',
          type: 'string'
        }
      ],
      assertions: [
        `expect(response.status).not.toBe(500)`,
        `expect(response.error).toBeDefined()`,
        `expect(response.retryable).toBe(true)`,
        `expect(orderData).not.toBeNull()`,
        `expect(circuitBreaker.state).toBe('OPEN') // after threshold`
      ],
      expectedResult: {
        status: 'failed-gracefully',
        userNotified: true,
        dataIntegrity: true
      },
      estimatedDuration: incident.context.requestTrace?.duration || 5000
    };
  }

  // ============================================================================
  // RUM Analysis
  // ============================================================================

  private async performRUMAnalysis(data: {
    rumData?: RUMData;
    timeWindow?: string;
  }): Promise<{
    userJourneys: UserJourney[];
    errorPatterns: ErrorPattern[];
    performanceInsights: PerformanceInsights;
    generatedTests: Test[];
  }> {
    const { rumData, timeWindow = 'last_7_days' } = data;

    console.log(`Analyzing RUM data for ${timeWindow}`);

    // Fetch RUM data from monitoring platform or use provided data
    const analysisData = rumData || await this.fetchRUMData(timeWindow);

    // Analyze user journeys
    const userJourneys = this.analyzeUserJourneys(analysisData);

    // Identify error patterns
    const errorPatterns = this.identifyErrorPatterns(analysisData);

    // Generate performance insights
    const performanceInsights = this.generatePerformanceInsights(analysisData);

    // Generate tests from RUM data
    const generatedTests = await this.generateTestsFromRUMData(analysisData);

    // Store RUM analysis
    await this.memoryStore.store('aqe/rum-data/latest', {
      analysisData,
      userJourneys,
      errorPatterns,
      performanceInsights,
      analyzedAt: new Date()
    });

    // Emit event
    this.emitEvent('production.rum.analyzed', {
      journeys: userJourneys.length,
      errors: errorPatterns.length,
      tests: generatedTests.length
    }, 'medium');

    return {
      userJourneys,
      errorPatterns,
      performanceInsights,
      generatedTests
    };
  }

  private analyzeUserJourneys(rumData: RUMData): UserJourney[] {
    // Sort journeys by frequency
    return rumData.userJourneys
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10); // Top 10 most common journeys
  }

  private identifyErrorPatterns(rumData: RUMData): ErrorPattern[] {
    // Filter high-impact errors
    return rumData.errorPatterns
      .filter(pattern => pattern.userImpact === 'HIGH' || pattern.frequency > 100)
      .sort((a, b) => b.frequency - a.frequency);
  }

  private generatePerformanceInsights(rumData: RUMData): PerformanceInsights {
    const { performanceMetrics } = rumData;

    return {
      fcp: {
        status: performanceMetrics.FCP.p95 < 2500 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
        p95: performanceMetrics.FCP.p95,
        threshold: 2500
      },
      lcp: {
        status: performanceMetrics.LCP.p95 < 4000 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
        p95: performanceMetrics.LCP.p95,
        threshold: 4000
      },
      fid: {
        status: performanceMetrics.FID.p95 < 100 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
        p95: performanceMetrics.FID.p95,
        threshold: 100
      },
      cls: {
        status: performanceMetrics.CLS.p95 < 0.1 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
        p95: performanceMetrics.CLS.p95,
        threshold: 0.1
      }
    };
  }

  private async generateTestsFromRUMData(rumData: RUMData): Promise<Test[]> {
    const tests: Test[] = [];

    // Generate tests for common user journeys
    for (const journey of rumData.userJourneys.slice(0, 5)) {
      tests.push({
        id: `rum-journey-${journey.pattern.replace(/\s+/g, '-').toLowerCase()}`,
        name: `should complete user journey: ${journey.pattern}`,
        type: TestType.E2E,
        parameters: [
          {
            name: 'journey',
            value: journey,
            type: 'UserJourney'
          }
        ],
        assertions: [
          `expect(journey.completed).toBe(true)`,
          `expect(journey.conversionRate).toBeGreaterThanOrEqual(${journey.conversionRate})`
        ],
        expectedResult: {
          completed: true,
          duration: journey.avgDuration
        },
        estimatedDuration: journey.avgDuration
      });
    }

    // Generate tests for error patterns
    for (const error of rumData.errorPatterns.slice(0, 3)) {
      tests.push({
        id: `rum-error-${error.error.replace(/\W+/g, '-').toLowerCase()}`,
        name: `should handle error: ${error.error}`,
        type: TestType.INTEGRATION,
        parameters: [
          {
            name: 'errorPattern',
            value: error,
            type: 'ErrorPattern'
          }
        ],
        assertions: [
          `expect(() => triggerError()).not.toThrow()`,
          `expect(errorHandled).toBe(true)`
        ],
        expectedResult: {
          errorHandled: true
        },
        estimatedDuration: 2000
      });
    }

    return tests;
  }

  // ============================================================================
  // Anomaly Detection
  // ============================================================================

  private async performAnomalyDetection(data: {
    currentMetrics: ProductionMetrics;
    lookbackPeriod?: string;
  }): Promise<{
    anomalies: AnomalyDetection[];
    recommendations: string[];
  }> {
    const { currentMetrics, lookbackPeriod = '24h' } = data;

    console.log(`Detecting anomalies in production metrics (lookback: ${lookbackPeriod})`);

    const anomalies: AnomalyDetection[] = [];
    const recommendations: string[] = [];

    // Error rate spike detection
    const errorRateAnomaly = this.detectErrorRateSpike(currentMetrics);
    if (errorRateAnomaly) {
      anomalies.push(errorRateAnomaly);
      recommendations.push('Generate regression tests for recent changes');
    }

    // Latency degradation detection
    const latencyAnomaly = this.detectLatencyDegradation(currentMetrics);
    if (latencyAnomaly) {
      anomalies.push(latencyAnomaly);
      recommendations.push('Generate performance tests targeting affected endpoints');
    }

    // User behavior anomaly detection
    const behaviorAnomaly = this.detectBehaviorAnomaly(currentMetrics);
    if (behaviorAnomaly) {
      anomalies.push(behaviorAnomaly);
      recommendations.push('Generate UI tests for affected user flows');
    }

    // Store anomalies
    await this.memoryStore.store('aqe/anomalies/latest', {
      anomalies,
      recommendations,
      detectedAt: new Date(),
      metrics: currentMetrics
    });

    // Emit high-priority event if critical anomalies found
    const criticalAnomalies = anomalies.filter(a => a.severity === 'CRITICAL');
    if (criticalAnomalies.length > 0) {
      this.emitEvent('production.anomaly.critical', {
        count: criticalAnomalies.length,
        anomalies: criticalAnomalies
      }, 'critical');
    }

    return { anomalies, recommendations };
  }

  private detectErrorRateSpike(currentMetrics: ProductionMetrics): AnomalyDetection | null {
    const baseline = this.baselineMetrics.get('errorRate') ?? { mean: 0.005, stdDev: 0.002 };
    const current = currentMetrics.errorRate ?? 0;

    const zScore = (current - baseline.mean) / baseline.stdDev;

    if (Math.abs(zScore) > this.config.thresholds!.anomalyStdDev!) {
      return {
        type: 'ERROR_RATE_SPIKE',
        severity: zScore > 5 ? 'CRITICAL' : zScore > 3 ? 'HIGH' : 'MEDIUM',
        details: {
          current,
          baseline: baseline.mean,
          deviation: zScore,
          magnitude: (current - baseline.mean) / baseline.mean,
          confidence: this.calculateConfidence(zScore)
        },
        affectedUsers: Math.floor((currentMetrics.activeUsers ?? 0) * current),
        recommendation: 'Generate regression tests for recent changes'
      };
    }

    return null;
  }

  private detectLatencyDegradation(currentMetrics: ProductionMetrics): AnomalyDetection | null {
    const baseline = this.baselineMetrics.get('latency') ?? { mean: 180, stdDev: 50, p95: 250 };
    const baselineP95 = baseline.p95 ?? 250;
    const current = currentMetrics.latency?.p95 ?? 0;

    const degradation = (current - baselineP95) / baselineP95;

    if (degradation > this.config.thresholds!.latencyDegradation!) {
      return {
        type: 'LATENCY_DEGRADATION',
        severity: degradation > 1.0 ? 'CRITICAL' : degradation > 0.5 ? 'HIGH' : 'MEDIUM',
        details: {
          current,
          baseline: baselineP95,
          deviation: degradation,
          magnitude: degradation,
          confidence: 0.9
        },
        affectedEndpoints: currentMetrics.endpoints ?? [],
        recommendation: 'Generate performance tests targeting affected endpoints'
      };
    }

    return null;
  }

  private detectBehaviorAnomaly(currentMetrics: ProductionMetrics): AnomalyDetection | null {
    const baseline = this.baselineMetrics.get('userBehavior') ?? { mean: 0.75, stdDev: 0.1, conversionRate: 0.75 };
    const baselineConversion = baseline.conversionRate ?? 0.75;
    const current = currentMetrics.conversionRate ?? 0;

    const drop = (baselineConversion - current) / baselineConversion;

    if (drop > 0.2) { // 20% drop in conversion
      return {
        type: 'USER_BEHAVIOR_ANOMALY',
        severity: drop > 0.5 ? 'CRITICAL' : 'HIGH',
        details: {
          current,
          baseline: baselineConversion,
          deviation: drop,
          magnitude: drop,
          confidence: 0.85
        },
        hypothesis: 'UI bug or broken functionality',
        recommendation: 'Generate UI tests for affected user flows'
      };
    }

    return null;
  }

  private calculateConfidence(zScore: number): number {
    // Convert z-score to confidence level (0-1)
    const absZ = Math.abs(zScore);
    if (absZ > 3) return 0.999;
    if (absZ > 2) return 0.95;
    if (absZ > 1) return 0.68;
    return 0.5;
  }

  // ============================================================================
  // Load Pattern Analysis
  // ============================================================================

  private async performLoadPatternAnalysis(data: {
    timeWindow?: string;
  }): Promise<{
    loadPattern: LoadPattern;
    loadTestScript: string;
    recommendations: string[];
  }> {
    const { timeWindow = '30d' } = data;

    console.log(`Analyzing load patterns for ${timeWindow}`);

    // Fetch production traffic data
    const loadPattern = await this.extractLoadPattern(timeWindow);

    // Generate load test script
    const loadTestScript = this.generateLoadTestScript(loadPattern);

    // Generate recommendations
    const recommendations = this.generateLoadTestRecommendations(loadPattern);

    // Store load pattern
    await this.memoryStore.store('aqe/load-patterns/latest', {
      loadPattern,
      analyzedAt: new Date(),
      timeWindow
    });

    return {
      loadPattern,
      loadTestScript,
      recommendations
    };
  }

  private async extractLoadPattern(_timeWindow: string): Promise<LoadPattern> {
    // Simulate load pattern extraction
    // In real implementation, fetch from monitoring platform
    return {
      dailyPattern: {
        hourly: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          rps: hour >= 9 && hour <= 17 ? 2000 + SecureRandom.randomFloat() * 1000 : 500 + SecureRandom.randomFloat() * 200
        })),
        peakHours: [9, 12, 14, 15, 18],
        lowTrafficHours: [0, 1, 2, 3, 4]
      },
      weeklyPattern: {
        monday: { rps: 2891, conversionRate: 0.78 },
        tuesday: { rps: 3124, conversionRate: 0.81 },
        wednesday: { rps: 3342, conversionRate: 0.83 },
        thursday: { rps: 3198, conversionRate: 0.79 },
        friday: { rps: 2734, conversionRate: 0.72 },
        saturday: { rps: 1893, conversionRate: 0.65 },
        sunday: { rps: 1678, conversionRate: 0.67 }
      },
      endpointDistribution: {
        'GET /api/products': 0.34,
        'GET /api/search': 0.23,
        'POST /api/cart': 0.15,
        'POST /api/orders': 0.12,
        'GET /api/users': 0.08,
        'other': 0.08
      },
      userBehaviorPatterns: {
        browsers: {
          avgSessionDuration: 342000,
          avgPagesPerSession: 7.8
        },
        buyers: {
          avgSessionDuration: 523000,
          avgPagesPerSession: 12.3
        }
      }
    };
  }

  private generateLoadTestScript(pattern: LoadPattern): string {
    // Generate k6 load test script
    return `
import { check, group, sleep } from 'k6';
import http from 'k6/http';

export let options = {
  stages: [
    { duration: '5m', target: 2000 },  // Morning ramp-up
    { duration: '2h', target: 3500 },  // Peak hours
    { duration: '5m', target: 1800 },  // Evening traffic
    { duration: '5m', target: 500 }    // Night baseline
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>2000']
  }
};

export default function() {
  // Implementation based on endpoint distribution
  const endpoints = ${JSON.stringify(pattern.endpointDistribution)};

  // Select endpoint based on distribution
  const rand = SecureRandom.randomFloat();
  let endpoint = '/api/products';

  group('User Session', () => {
    let response = http.get(\`\${BASE_URL}\${endpoint}\`);
    check(response, {
      'status 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500
    });
    sleep(SecureRandom.randomFloat() * 3 + 1);
  });
}
`.trim();
  }

  private generateLoadTestRecommendations(pattern: LoadPattern): string[] {
    const recommendations: string[] = [];

    // Analyze peak traffic
    const maxRps = Math.max(...pattern.dailyPattern.hourly.map(h => h.rps));
    recommendations.push(`Test system capacity at ${maxRps * 1.5} RPS (150% of peak load)`);

    // Check conversion rates
    const avgConversion = Object.values(pattern.weeklyPattern).reduce((sum, day) => sum + day.conversionRate, 0) / 7;
    if (avgConversion < 0.75) {
      recommendations.push('Investigate low conversion rate - potential UX issues');
    }

    recommendations.push('Implement gradual ramp-up to detect breaking points');
    recommendations.push('Test during simulated peak hours to validate auto-scaling');

    return recommendations;
  }

  // ============================================================================
  // Feature Usage Analytics
  // ============================================================================

  private async performFeatureUsageAnalytics(data: {
    timeWindow?: string;
  }): Promise<{
    features: FeatureAnalysis[];
    unusedFeatures: UnusedFeature[];
  }> {
    const { timeWindow = '30d' } = data;

    console.log(`Analyzing feature usage for ${timeWindow}`);

    // Fetch feature usage data
    const usageData = await this.fetchFeatureUsageData(timeWindow);

    // Analyze and prioritize features
    const features = this.analyzeFeaturePriority(usageData);

    // Identify unused features
    const unusedFeatures = this.identifyUnusedFeatures(usageData);

    // Store analytics
    await this.memoryStore.store('aqe/feature-usage/latest', {
      features,
      unusedFeatures,
      analyzedAt: new Date(),
      timeWindow
    });

    return { features, unusedFeatures };
  }

  private async fetchFeatureUsageData(_timeWindow: string): Promise<FeatureUsageData> {
    // Simulate feature usage data
    // In real implementation, fetch from analytics platform
    return {
      totalUsers: 84392,
      features: [
        { name: 'search_autocomplete', activeUsers: 75103, satisfaction: 0.92 },
        { name: 'product_recommendations', activeUsers: 56503, clickthrough: 0.34 },
        { name: 'saved_for_later', activeUsers: 19411, conversion: 0.12 },
        { name: 'gift_wrapping', activeUsers: 2107, seasonal: true },
        { name: 'legacy_wishlist_v1', activeUsers: 42, lastUsed: '2024-08-12' }
      ]
    };
  }

  private analyzeFeaturePriority(usageData: FeatureUsageData): FeatureAnalysis[] {
    return usageData.features.map((feature) => {
      const usagePercent = feature.activeUsers / usageData.totalUsers;
      let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DEPRECATED';
      let recommendation: string;

      if (usagePercent > 0.5) {
        priority = 'CRITICAL';
        recommendation = 'Maintain high test coverage (>90%), add edge cases';
      } else if (usagePercent > 0.25) {
        priority = 'HIGH';
        recommendation = 'Increase coverage to 85%+';
      } else if (usagePercent > 0.1) {
        priority = 'MEDIUM';
        recommendation = 'Coverage acceptable for usage level';
      } else if (usagePercent > 0.01) {
        priority = 'LOW';
        recommendation = 'Minimal testing required';
      } else {
        priority = 'DEPRECATED';
        recommendation = 'Consider removal, migrate remaining users';
      }

      return {
        name: feature.name,
        usage: usagePercent,
        priority,
        testCoverage: Math.floor(SecureRandom.randomFloat() * 30) + 60, // Simulated
        recommendation
      };
    });
  }

  private identifyUnusedFeatures(usageData: FeatureUsageData): UnusedFeature[] {
    const unusedThreshold = usageData.totalUsers * 0.001; // 0.1% usage

    return usageData.features
      .filter((f) => f.activeUsers < unusedThreshold)
      .map((f) => ({
        name: f.name,
        lastUsed: f.lastUsed ?? 'unknown',
        recommendation: 'Dead code, safe to remove'
      }));
  }

  // ============================================================================
  // Test Generation from Production Data
  // ============================================================================

  private async generateTestsFromIncidents(data: {
    incidentIds?: string[];
    severityFilter?: string[];
    limit?: number;
  }): Promise<{
    testSuites: TestSuite[];
    totalTests: number;
  }> {
    const { incidentIds, severityFilter = ['HIGH', 'CRITICAL'], limit = 10 } = data;

    // Fetch incidents from memory
    const incidents = await this.fetchIncidents(incidentIds, severityFilter, limit);

    const testSuites: TestSuite[] = [];
    let totalTests = 0;

    for (const incident of incidents) {
      const result = await this.performIncidentReplay({ incident });
      if (result.testSuite) {
        testSuites.push(result.testSuite);
        totalTests += result.testSuite.tests.length;
      }
    }

    return { testSuites, totalTests };
  }

  private async generateTestsFromRUM(data: {
    timeWindow?: string;
    minJourneyFrequency?: number;
  }): Promise<{
    testSuites: TestSuite[];
    totalTests: number;
  }> {
    const { timeWindow = '7d', minJourneyFrequency = 100 } = data;

    // Fetch RUM data
    const rumData = await this.fetchRUMData(timeWindow);

    // Filter journeys by frequency
    const _relevantJourneys = rumData.userJourneys.filter(
      j => j.frequency >= minJourneyFrequency
    );

    const tests = await this.generateTestsFromRUMData(rumData);

    const testSuite: TestSuite = {
      id: `rum-generated-${Date.now()}`,
      name: 'RUM-Based User Journey Tests',
      tests,
      metadata: {
        generatedAt: new Date(),
        coverageTarget: 0,
        framework: 'playwright',
        estimatedDuration: tests.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0),
        generationStrategy: 'rum-analysis'
      }
    };

    return {
      testSuites: [testSuite],
      totalTests: tests.length
    };
  }

  private async analyzeProductionVsStaging(data: {
    metrics: string[];
  }): Promise<{
    differences: Array<{
      metric: string;
      production: number;
      staging: number;
      delta: number;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    recommendations: string[];
  }> {
    const { metrics } = data;

    const differences: Array<{
      metric: string;
      production: number;
      staging: number;
      delta: number;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];
    const recommendations: string[] = [];

    // Compare production vs staging metrics
    for (const metric of metrics) {
      const prodValue = await this.fetchProductionMetric(metric);
      const stagingValue = await this.fetchStagingMetric(metric);
      const delta = Math.abs(prodValue - stagingValue) / prodValue;

      if (delta > 0.1) { // >10% difference
        differences.push({
          metric,
          production: prodValue,
          staging: stagingValue,
          delta,
          severity: delta > 0.5 ? 'HIGH' : 'MEDIUM'
        });

        recommendations.push(`Staging environment does not match production for ${metric}`);
      }
    }

    return { differences, recommendations };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async initializeMonitoringClients(): Promise<void> {
    const { monitoringPlatforms } = this.config;

    if (monitoringPlatforms?.datadog) {
      console.log('Initializing Datadog client');
      // In real implementation: initialize Datadog API client
      this.monitoringClients.set('datadog', { initialized: true });
    }

    if (monitoringPlatforms?.newRelic) {
      console.log('Initializing New Relic client');
      // In real implementation: initialize New Relic API client
      this.monitoringClients.set('newrelic', { initialized: true });
    }

    if (monitoringPlatforms?.grafana) {
      console.log('Initializing Grafana client');
      // In real implementation: initialize Grafana API client
      this.monitoringClients.set('grafana', { initialized: true });
    }
  }

  private async loadBaselineMetrics(): Promise<void> {
    // Load historical baselines from memory
    const storedBaselines = await this.retrieveMemory('baseline-metrics');

    if (storedBaselines && typeof storedBaselines === 'object') {
      const entries = Object.entries(storedBaselines) as [string, BaselineMetric][];
      this.baselineMetrics = new Map(entries);
    } else {
      // Initialize with defaults - all metrics require mean and stdDev
      this.baselineMetrics.set('errorRate', { mean: 0.005, stdDev: 0.002 });
      this.baselineMetrics.set('latency', { mean: 180, stdDev: 50, p95: 250 });
      this.baselineMetrics.set('userBehavior', { mean: 0.75, stdDev: 0.1, conversionRate: 0.75 });
    }
  }

  private registerProductionEventHandlers(): void {
    // Listen for production incidents
    this.registerEventHandler({
      eventType: 'production.incident',
      handler: async (event) => {
        const incident = event.data as ProductionIncident;
        await this.performIncidentReplay({ incident });
      }
    });

    // Listen for anomaly alerts
    this.registerEventHandler({
      eventType: 'production.anomaly',
      handler: async (event) => {
        const currentMetrics = event.data as ProductionMetrics;
        await this.performAnomalyDetection({ currentMetrics });
      }
    });
  }

  private async fetchRUMData(timeWindow: string): Promise<RUMData> {
    // Simulate fetching RUM data
    // In real implementation, fetch from monitoring platform
    return {
      timeWindow,
      totalSessions: 847392,
      totalPageViews: 3421847,
      userJourneys: [
        {
          pattern: 'Homepage → Search → Product → Checkout → Payment',
          frequency: 234891,
          avgDuration: 342000,
          conversionRate: 0.78
        },
        {
          pattern: 'Homepage → Category → Product → Add to Cart',
          frequency: 189234,
          avgDuration: 178000,
          conversionRate: 0.34
        }
      ],
      deviceDistribution: { mobile: 0.63, desktop: 0.32, tablet: 0.05 },
      browserDistribution: { chrome: 0.54, safari: 0.31, firefox: 0.09, edge: 0.04 },
      performanceMetrics: {
        FCP: { p50: 1234, p95: 3421, p99: 5678 },
        LCP: { p50: 2341, p95: 4523, p99: 7891 },
        FID: { p50: 87, p95: 234, p99: 456 },
        CLS: { p50: 0.02, p95: 0.08, p99: 0.15 }
      },
      errorPatterns: [],
      featureUsage: {}
    };
  }

  private async fetchIncidents(
    _incidentIds?: string[],
    _severityFilter?: string[],
    _limit?: number
  ): Promise<ProductionIncident[]> {
    // Simulate fetching incidents from memory
    // In real implementation, query incident management system
    return [
      {
        id: 'INC-2024-1234',
        timestamp: '2025-09-29T14:23:47.892Z',
        severity: 'CRITICAL',
        service: 'payment-service',
        error: 'PaymentProcessingException: Gateway timeout after 30s',
        affectedUsers: 1247,
        duration: 342000,
        region: 'us-east-1',
        context: {
          systemState: {
            cpu: 87.3,
            memory: 4.2,
            connections: 342,
            queueDepth: 1893,
            cacheHitRate: 23.1
          }
        }
      }
    ];
  }

  private async fetchProductionMetric(_metric: string): Promise<number> {
    // Simulate fetching production metric
    return SecureRandom.randomFloat() * 100;
  }

  private async fetchStagingMetric(_metric: string): Promise<number> {
    // Simulate fetching staging metric
    return SecureRandom.randomFloat() * 100;
  }

  /**
   * Type guard for TaskResultMetrics
   */
  private isTaskResultMetrics(result: unknown): result is TaskResultMetrics {
    return typeof result === 'object' && result !== null;
  }

  /**
   * Extract domain-specific metrics for Nightly-Learner
   * Provides rich production intelligence metrics for pattern learning
   */
  protected extractTaskMetrics(result: unknown): Record<string, number> {
    const metrics: Record<string, number> = {};

    if (!this.isTaskResultMetrics(result)) {
      return metrics;
    }

    // Incident analysis
    if (result.incidents && Array.isArray(result.incidents)) {
      metrics.incidents_analyzed = result.incidents.length;
      metrics.critical_incidents = result.incidents.filter(
        (i) => i.severity === 'critical'
      ).length;
      metrics.incidents_with_scenarios = result.incidents.filter(
        (i) => i.testScenario !== undefined
      ).length;
    }

    // Test scenarios generated
    if (result.testScenarios && Array.isArray(result.testScenarios)) {
      metrics.scenarios_generated = result.testScenarios.length;
      metrics.replay_scenarios = result.testScenarios.filter(
        (s) => s.type === 'replay'
      ).length;
    }

    // RUM (Real User Monitoring) metrics
    if (result.rum) {
      metrics.rum_sessions_analyzed = result.rum.sessionsAnalyzed ?? 0;
      metrics.user_journeys_captured = result.rum.userJourneys ?? 0;
      metrics.error_patterns_found = result.rum.errorPatterns ?? 0;
    }

    // Production vs Staging comparison
    if (result.comparison) {
      metrics.metrics_compared = result.comparison.metricsCount ?? 0;
      metrics.discrepancies_found = result.comparison.discrepancies ?? 0;
      metrics.correlation_score = result.comparison.correlation ?? 0;
    }

    // Pattern detection
    if (result.patterns && Array.isArray(result.patterns)) {
      metrics.patterns_detected = result.patterns.length;
      metrics.actionable_patterns = result.patterns.filter(
        (p) => p.actionable === true
      ).length;
    }

    // Coverage metrics
    if (typeof result.productionCoverage === 'number') {
      metrics.production_coverage = result.productionCoverage;
    }

    // Confidence
    if (typeof result.confidence === 'number') {
      metrics.confidence = result.confidence;
    }

    return metrics;
  }
}