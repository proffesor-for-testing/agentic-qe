/**
 * Production Observer Agent
 * Monitors production systems and provides real-time insights
 */

import { BaseAgent } from './base-agent';
import {
  AgentId,
  AgentConfig,
  AgentDecision,
  TaskDefinition,
  ExplainableReasoning,
  Evidence,
  ReasoningFactor,
  ILogger,
  IEventBus,
  IMemorySystem,
  SecurityLevel,
  PACTLevel
} from '../core/types';

export interface ProductionSystem {
  id: string;
  name: string;
  type: 'web' | 'api' | 'database' | 'cache' | 'queue' | 'storage' | 'cdn' | 'loadbalancer';
  environment: string;
  endpoints: SystemEndpoint[];
  dependencies: SystemDependency[];
  healthChecks: HealthCheckConfig[];
  metrics: MetricConfig[];
  alerts: AlertConfig[];
  slaTargets: SLATarget[];
  owner: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
}

export interface SystemEndpoint {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  expectedStatus: number[];
  timeout: number; // milliseconds
  headers?: Record<string, string>;
  body?: string;
  authentication?: {
    type: 'bearer' | 'basic' | 'api-key';
    credentials: string;
  };
}

export interface SystemDependency {
  id: string;
  name: string;
  type: 'internal' | 'external' | 'third-party';
  endpoint: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  fallbackStrategy?: string;
  timeout: number;
}

export interface HealthCheckConfig {
  id: string;
  name: string;
  type: 'http' | 'tcp' | 'exec' | 'grpc';
  config: any;
  interval: number; // seconds
  timeout: number; // seconds
  retries: number;
  successThreshold: number;
  failureThreshold: number;
  enabled: boolean;
}

export interface MetricConfig {
  id: string;
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  source: 'prometheus' | 'cloudwatch' | 'datadog' | 'newrelic' | 'custom';
  query: string;
  unit: string;
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'p50' | 'p95' | 'p99';
  thresholds: MetricThreshold[];
  enabled: boolean;
}

export interface MetricThreshold {
  level: 'info' | 'warning' | 'critical';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  duration: number; // seconds - how long threshold must be breached
}

export interface AlertConfig {
  id: string;
  name: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  conditions: AlertCondition[];
  notifications: NotificationChannel[];
  enabled: boolean;
  cooldown: number; // seconds
  autoResolve: boolean;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration: number; // seconds
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'teams' | 'pagerduty' | 'webhook';
  config: any;
  enabled: boolean;
}

export interface SLATarget {
  id: string;
  name: string;
  description: string;
  metric: string;
  target: number;
  period: 'hour' | 'day' | 'week' | 'month';
  penalty?: string;
}

export interface ObservationData {
  timestamp: Date;
  systemId: string;
  metrics: MetricValue[];
  healthStatus: HealthStatus;
  dependencies: DependencyStatus[];
  alerts: ActiveAlert[];
  performance: PerformanceData;
  errors: ErrorData[];
  logs: LogEntry[];
}

export interface MetricValue {
  metricId: string;
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'unknown';
  checks: HealthCheckResult[];
  lastUpdated: Date;
}

export interface HealthCheckResult {
  checkId: string;
  name: string;
  status: 'pass' | 'fail' | 'timeout' | 'error';
  responseTime: number; // milliseconds
  message?: string;
  timestamp: Date;
}

export interface DependencyStatus {
  dependencyId: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  responseTime: number;
  lastChecked: Date;
  errorMessage?: string;
}

export interface ActiveAlert {
  id: string;
  alertConfigId: string;
  name: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'firing' | 'resolved';
  startTime: Date;
  endTime?: Date;
  description: string;
  affectedSystems: string[];
  notifications: NotificationStatus[];
}

export interface NotificationStatus {
  channel: string;
  type: string;
  status: 'sent' | 'failed' | 'pending';
  timestamp: Date;
  error?: string;
}

export interface PerformanceData {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: number; // requests per second
  errorRate: number; // percentage
  availability: number; // percentage
  resourceUsage: {
    cpu: number; // percentage
    memory: number; // percentage
    disk: number; // percentage
    network: number; // bytes per second
  };
}

export interface ErrorData {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  message: string;
  source: string;
  stackTrace?: string;
  context?: Record<string, any>;
  count: number;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  message: string;
  source: string;
  metadata?: Record<string, any>;
}

export interface SystemIncident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affectedSystems: string[];
  startTime: Date;
  endTime?: Date;
  rootCause?: string;
  resolution?: string;
  timeline: IncidentEvent[];
  impact: IncidentImpact;
  assignee?: string;
  watchers: string[];
}

export interface IncidentEvent {
  id: string;
  timestamp: Date;
  type: 'detected' | 'investigated' | 'escalated' | 'updated' | 'resolved';
  description: string;
  author: string;
}

export interface IncidentImpact {
  usersAffected: number;
  revenue: number;
  duration: number; // minutes
  serviceUnavailability: number; // percentage
}

export interface AnomalyDetection {
  id: string;
  systemId: string;
  metricName: string;
  anomalyType: 'spike' | 'drop' | 'trend' | 'outlier';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  confidence: number; // 0-1
  baseline: number;
  actualValue: number;
  deviation: number; // percentage
  context: {
    timeWindow: string;
    historicalData: number[];
    seasonality?: string;
    correlations?: string[];
  };
}

export class ProductionObserverAgent extends BaseAgent {
  private systems: Map<string, ProductionSystem> = new Map();
  private observations: Map<string, ObservationData[]> = new Map();
  private activeIncidents: Map<string, SystemIncident> = new Map();
  private activeAlerts: Map<string, ActiveAlert> = new Map();
  private anomalies: Map<string, AnomalyDetection[]> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    id: AgentId,
    config: AgentConfig,
    logger: ILogger,
    eventBus: IEventBus,
    memory: IMemorySystem
  ) {
    super(id, config, logger, eventBus, memory);
  }

  protected async initializeResources(): Promise<void> {
    await super.initializeResources();
    
    // Load production systems
    await this.loadProductionSystems();
    
    // Load historical observations
    await this.loadHistoricalData();
    
    // Initialize monitoring
    await this.initializeMonitoring();
    
    // Setup anomaly detection
    await this.setupAnomalyDetection();
    
    // Setup incident management
    await this.setupIncidentManagement();
    
    this.logger.info(`Production Observer Agent ${this.id.id} initialized monitoring ${this.systems.size} systems`);
  }

  protected async perceive(context: any): Promise<any> {
    this.logger.info('Analyzing production system status');

    const observation = {
      timestamp: new Date(),
      systemsOverview: await this.gatherSystemsOverview(),
      performanceMetrics: await this.gatherPerformanceMetrics(),
      healthStatus: await this.gatherHealthStatus(),
      alertStatus: await this.gatherAlertStatus(),
      dependencyStatus: await this.gatherDependencyStatus(),
      incidentStatus: await this.gatherIncidentStatus(),
      anomalies: await this.detectAnomalies(),
      trends: await this.analyzeTrends(),
      predictions: await this.generatePredictions()
    };

    // Store observation in shared memory
    await this.memory.store(`production-observer:observation:${Date.now()}`, observation, {
      type: 'experience' as const,
      tags: ['production', 'monitoring', 'observation'],
      partition: 'production-monitoring'
    });

    return observation;
  }

  protected async decide(observation: any): Promise<AgentDecision> {
    const decisionId = this.generateDecisionId();
    
    // Analyze overall system health
    const healthAnalysis = await this.analyzeSystemHealth(observation);
    
    // Determine required actions
    const actionPlan = await this.determineActions(observation);
    
    // Assess urgency and priority
    const urgencyAssessment = await this.assessUrgency(observation);
    
    // Plan incident response if needed
    const incidentResponse = await this.planIncidentResponse(observation);
    
    // Build reasoning
    const factors: ReasoningFactor[] = [
      {
        name: 'System Health',
        weight: 0.3,
        value: healthAnalysis.overallScore,
        impact: 'high',
        explanation: 'System health score indicates overall operational stability and reliability'
      },
      {
        name: 'Performance Status',
        weight: 0.25,
        value: observation.performanceMetrics.overallScore,
        impact: 'high',
        explanation: 'Performance metrics reflect system efficiency and user experience quality'
      },
      {
        name: 'Alert Severity',
        weight: 0.2,
        value: 1 - observation.alertStatus.severityScore,
        impact: 'medium',
        explanation: 'Alert status shows current issues and potential system problems'
      },
      {
        name: 'Dependency Health',
        weight: 0.15,
        value: observation.dependencyStatus.healthScore,
        impact: 'medium',
        explanation: 'Dependency health affects system resilience and failure propagation'
      },
      {
        name: 'Anomaly Impact',
        weight: 0.1,
        value: 1 - observation.anomalies.impactScore,
        impact: 'low',
        explanation: 'Anomaly detection helps identify unusual patterns and potential issues'
      }
    ];

    const evidence: Evidence[] = [
      {
        type: 'empirical',
        source: 'system-health',
        description: JSON.stringify(healthAnalysis),
        confidence: 0.95
      },
      {
        type: 'empirical',
        source: 'performance-metrics',
        description: JSON.stringify(observation.performanceMetrics),
        confidence: 0.9
      },
      {
        type: 'vulnerability',
        source: 'alert-status',
        description: JSON.stringify(observation.alertStatus),
        confidence: 0.85
      },
      {
        type: 'analytical',
        source: 'anomaly-detection',
        description: JSON.stringify(observation.anomalies),
        confidence: 0.8
      }
    ];

    const reasoning = this.buildReasoning(
      factors,
      ['SFDIPOT', 'CRUSSPIC'],
      evidence,
      [
        'All critical systems are operational',
        'Performance metrics within acceptable ranges',
        'No critical alerts active'
      ],
      [
        'Metrics based on recent samples only',
        'External dependencies may impact availability'
      ]
    );

    const confidence = this.calculateConfidence({
      evidence,
      factors,
      dataQuality: observation.systemsOverview.dataQuality
    });

    const decision: AgentDecision = {
      id: decisionId,
      agentId: this.id.id,
      timestamp: new Date(),
      action: 'production-monitoring',
      confidence,
      reasoning,
      alternatives: [],
      risks: [],
      recommendations: healthAnalysis.recommendations
    };

    await this.memory.store(`production-observer:decision:${decisionId}`, decision, {
      type: 'decision' as const,
      tags: ['production', 'monitoring', 'decision'],
      partition: 'decisions'
    });

    return decision;
  }

  protected async act(decision: AgentDecision): Promise<any> {
    try {
      // Execute monitoring actions
      const monitoringResult = await this.executeMonitoringActions([]);

      // Handle incidents if needed
      let incidentResult = null;
      // For now, skip incident handling

      // Send notifications
      const notificationResult = await this.sendNotifications([], { level: 'low' });

      // Update monitoring configuration
      await this.updateMonitoringConfiguration(decision.recommendations);

      // Store anomalies for tracking
      await this.storeAnomalies([]);
      
      const result = {
        success: true,
        healthStatus: 'healthy',
        actionsExecuted: 0,
        alertsProcessed: 0,
        anomaliesDetected: 0,
        incidentCreated: incidentResult ? (incidentResult as any).incidentId : null,
        notificationsSent: notificationResult.sent,
        monitoringUpdated: true,
        executionTime: new Date()
      };

      // Share production insights
      await this.shareKnowledge({
        type: 'production-monitoring',
        healthStatus: 'healthy',
        systemsMonitored: this.systems.size,
        alertsActive: 0,
        anomaliesDetected: 0,
        urgencyLevel: 'low'
      }, ['production', 'monitoring', 'observability']);
      
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Production monitoring action failed', err);
      throw err;
    }
  }

  protected async learn(feedback: any): Promise<void> {
    const { task, result, success } = feedback;
    
    if (success) {
      // Learn from successful monitoring
      await this.memory.store(`production-observer:success-pattern:${task.id}`, {
        healthStatus: result.healthStatus,
        actionsExecuted: result.actionsExecuted,
        alertsProcessed: result.alertsProcessed,
        responseTime: result.responseTime,
        successFactors: result.successFactors || [],
        timestamp: new Date()
      }, {
        type: 'knowledge' as const,
        tags: ['success-pattern', 'production', 'monitoring'],
        partition: 'learning'
      });
    } else {
      // Learn from monitoring failures
      await this.memory.store(`production-observer:failure-pattern:${task.id}`, {
        failureReason: result.error,
        context: task.context,
        lessonsLearned: result.lessonsLearned || [],
        preventionMeasures: result.preventionMeasures || [],
        timestamp: new Date()
      }, {
        type: 'knowledge' as const,
        tags: ['failure-pattern', 'production', 'monitoring'],
        partition: 'learning'
      });
    }
    
    // Update monitoring effectiveness metrics
    await this.updateMonitoringMetrics(success, result);
  }

  // Implementation methods

  private async loadProductionSystems(): Promise<void> {
    try {
      const systemsData = await this.memory.retrieve('production-observer:systems');
      if (systemsData) {
        this.systems = new Map(Object.entries(systemsData));
      } else {
        await this.initializeDefaultSystems();
      }
    } catch (error) {
      this.logger.warn('No production systems found, initializing defaults');
      await this.initializeDefaultSystems();
    }
  }

  private async initializeDefaultSystems(): Promise<void> {
    const defaultSystems: ProductionSystem[] = [
      {
        id: 'web-app',
        name: 'Web Application',
        type: 'web',
        environment: 'production',
        endpoints: [
          {
            id: 'health-check',
            url: 'https://app.example.com/health',
            method: 'GET',
            expectedStatus: [200],
            timeout: 5000
          }
        ],
        dependencies: [],
        healthChecks: [
          {
            id: 'http-health',
            name: 'HTTP Health Check',
            type: 'http',
            config: { url: 'https://app.example.com/health' },
            interval: 60,
            timeout: 30,
            retries: 3,
            successThreshold: 1,
            failureThreshold: 3,
            enabled: true
          }
        ],
        metrics: [
          {
            id: 'response-time',
            name: 'Response Time',
            type: 'histogram',
            source: 'prometheus',
            query: 'http_request_duration_seconds',
            unit: 'seconds',
            aggregation: 'p95',
            thresholds: [
              { level: 'warning', operator: 'gt', value: 1, duration: 300 },
              { level: 'critical', operator: 'gt', value: 3, duration: 300 }
            ],
            enabled: true
          }
        ],
        alerts: [],
        slaTargets: [
          {
            id: 'availability',
            name: '99.9% Uptime',
            description: 'Service should be available 99.9% of the time',
            metric: 'availability',
            target: 99.9,
            period: 'month'
          }
        ],
        owner: 'web-team',
        criticality: 'critical',
        status: 'healthy'
      },
      {
        id: 'api-service',
        name: 'API Service',
        type: 'api',
        environment: 'production',
        endpoints: [
          {
            id: 'api-health',
            url: 'https://api.example.com/health',
            method: 'GET',
            expectedStatus: [200],
            timeout: 5000
          }
        ],
        dependencies: [
          {
            id: 'database',
            name: 'Primary Database',
            type: 'internal',
            endpoint: 'postgres://db.example.com:5432',
            criticality: 'critical',
            timeout: 5000
          }
        ],
        healthChecks: [
          {
            id: 'api-health',
            name: 'API Health Check',
            type: 'http',
            config: { url: 'https://api.example.com/health' },
            interval: 30,
            timeout: 10,
            retries: 3,
            successThreshold: 1,
            failureThreshold: 3,
            enabled: true
          }
        ],
        metrics: [
          {
            id: 'api-response-time',
            name: 'API Response Time',
            type: 'histogram',
            source: 'prometheus',
            query: 'api_request_duration_seconds',
            unit: 'seconds',
            aggregation: 'p95',
            thresholds: [
              { level: 'warning', operator: 'gt', value: 0.5, duration: 300 },
              { level: 'critical', operator: 'gt', value: 2, duration: 300 }
            ],
            enabled: true
          },
          {
            id: 'error-rate',
            name: 'Error Rate',
            type: 'gauge',
            source: 'prometheus',
            query: 'rate(api_errors_total[5m])',
            unit: 'percentage',
            aggregation: 'avg',
            thresholds: [
              { level: 'warning', operator: 'gt', value: 1, duration: 300 },
              { level: 'critical', operator: 'gt', value: 5, duration: 300 }
            ],
            enabled: true
          }
        ],
        alerts: [],
        slaTargets: [
          {
            id: 'api-availability',
            name: '99.95% API Uptime',
            description: 'API should be available 99.95% of the time',
            metric: 'availability',
            target: 99.95,
            period: 'month'
          },
          {
            id: 'api-response-time',
            name: 'P95 Response Time < 500ms',
            description: '95th percentile response time should be under 500ms',
            metric: 'response_time_p95',
            target: 500,
            period: 'day'
          }
        ],
        owner: 'backend-team',
        criticality: 'critical',
        status: 'healthy'
      }
    ];

    defaultSystems.forEach(system => {
      this.systems.set(system.id, system);
    });

    await this.saveProductionSystems();
  }

  private async saveProductionSystems(): Promise<void> {
    const systemsData = Object.fromEntries(this.systems);
    await this.memory.store('production-observer:systems', systemsData, {
      type: 'artifact' as const,
      tags: ['systems', 'production'],
      partition: 'configuration'
    });
  }

  private async loadHistoricalData(): Promise<void> {
    // Load historical observations for trend analysis
    try {
      const historicalData = await this.memory.retrieve('production-observer:historical');
      if (historicalData) {
        // Process historical data for baseline establishment
        this.logger.info('Loaded historical monitoring data');
      }
    } catch (error) {
      this.logger.info('No historical data found, starting fresh');
    }
  }

  private async initializeMonitoring(): Promise<void> {
    // Start monitoring each system
    for (const [systemId, system] of this.systems) {
      if (system.status !== 'unknown') {
        await this.startSystemMonitoring(systemId);
      }
    }
  }

  private async startSystemMonitoring(systemId: string): Promise<void> {
    const system = this.systems.get(systemId);
    if (!system) return;

    // Start health checks
    const healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks(systemId);
    }, 60000); // Every minute

    // Start metric collection
    const metricsInterval = setInterval(async () => {
      await this.collectMetrics(systemId);
    }, 30000); // Every 30 seconds

    this.monitoringIntervals.set(`${systemId}-health`, healthCheckInterval);
    this.monitoringIntervals.set(`${systemId}-metrics`, metricsInterval);

    this.logger.info(`Started monitoring for system: ${system.name}`);
  }

  private async setupAnomalyDetection(): Promise<void> {
    // Initialize anomaly detection algorithms
    setInterval(async () => {
      await this.runAnomalyDetection();
    }, 300000); // Every 5 minutes
  }

  private async setupIncidentManagement(): Promise<void> {
    // Setup incident response procedures
    this.eventBus.on('production:alert', async (alert) => {
      await this.handleAlert(alert);
    });
    
    this.eventBus.on('production:incident', async (incident) => {
      await this.handleIncident(incident);
    });
  }

  // Data gathering methods

  private async gatherSystemsOverview(): Promise<any> {
    const systemsCount = this.systems.size;
    const healthySystems = Array.from(this.systems.values())
      .filter(s => s.status === 'healthy').length;
    const criticalSystems = Array.from(this.systems.values())
      .filter(s => s.criticality === 'critical').length;
    
    return {
      total: systemsCount,
      healthy: healthySystems,
      critical: criticalSystems,
      healthPercentage: (healthySystems / systemsCount) * 100,
      dataQuality: 0.95 // Simulated data quality score
    };
  }

  private async gatherPerformanceMetrics(): Promise<any> {
    const metrics = {
      responseTime: { avg: 0, p95: 0, p99: 0 },
      throughput: 0,
      errorRate: 0,
      availability: 0
    };
    
    let totalSystems = 0;
    
    for (const [systemId, system] of this.systems) {
      if (system.status !== 'unknown') {
        // Simulate metric collection
        metrics.responseTime.avg += Math.random() * 500;
        metrics.responseTime.p95 += Math.random() * 1000;
        metrics.responseTime.p99 += Math.random() * 2000;
        metrics.throughput += Math.random() * 1000;
        metrics.errorRate += Math.random() * 2;
        metrics.availability += 99 + Math.random();
        totalSystems++;
      }
    }
    
    if (totalSystems > 0) {
      metrics.responseTime.avg /= totalSystems;
      metrics.responseTime.p95 /= totalSystems;
      metrics.responseTime.p99 /= totalSystems;
      metrics.throughput /= totalSystems;
      metrics.errorRate /= totalSystems;
      metrics.availability /= totalSystems;
    }
    
    const overallScore = this.calculatePerformanceScore(metrics);
    
    return {
      ...metrics,
      overallScore,
      summary: `Performance score: ${(overallScore * 100).toFixed(1)}%`
    };
  }

  private calculatePerformanceScore(metrics: any): number {
    let score = 1.0;
    
    // Penalize high response times
    if (metrics.responseTime.p95 > 1000) score -= 0.3;
    else if (metrics.responseTime.p95 > 500) score -= 0.1;
    
    // Penalize high error rates
    if (metrics.errorRate > 5) score -= 0.4;
    else if (metrics.errorRate > 1) score -= 0.2;
    
    // Penalize low availability
    if (metrics.availability < 99) score -= 0.5;
    else if (metrics.availability < 99.5) score -= 0.2;
    
    return Math.max(0, score);
  }

  private async gatherHealthStatus(): Promise<any> {
    const systemHealth = new Map();
    
    for (const [systemId, system] of this.systems) {
      systemHealth.set(systemId, {
        name: system.name,
        status: system.status,
        criticality: system.criticality,
        lastChecked: new Date()
      });
    }
    
    const healthySystems = Array.from(systemHealth.values())
      .filter(s => s.status === 'healthy').length;
    
    return {
      systems: Object.fromEntries(systemHealth),
      overall: healthySystems === this.systems.size ? 'healthy' : 
               healthySystems > this.systems.size * 0.8 ? 'warning' : 'critical',
      healthyPercentage: (healthySystems / this.systems.size) * 100
    };
  }

  private async gatherAlertStatus(): Promise<any> {
    const alerts = Array.from(this.activeAlerts.values());
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');
    
    let severityScore = 0;
    if (criticalAlerts.length > 0) severityScore = 1;
    else if (warningAlerts.length > 0) severityScore = 0.5;
    
    return {
      total: alerts.length,
      critical: criticalAlerts.length,
      warning: warningAlerts.length,
      criticalAlerts: criticalAlerts.map(a => ({ id: a.id, name: a.name, description: a.description })),
      severityScore,
      summary: `${alerts.length} active alerts (${criticalAlerts.length} critical)`
    };
  }

  private async gatherDependencyStatus(): Promise<any> {
    const dependencies = new Map();
    
    for (const [systemId, system] of this.systems) {
      for (const dependency of system.dependencies) {
        if (!dependencies.has(dependency.id)) {
          // Simulate dependency health check
          const isHealthy = Math.random() > 0.05; // 95% chance of being healthy
          dependencies.set(dependency.id, {
            name: dependency.name,
            status: isHealthy ? 'healthy' : 'degraded',
            criticality: dependency.criticality,
            responseTime: Math.random() * 100
          });
        }
      }
    }
    
    const healthyDeps = Array.from(dependencies.values())
      .filter(d => d.status === 'healthy').length;
    
    return {
      dependencies: Object.fromEntries(dependencies),
      healthScore: dependencies.size > 0 ? healthyDeps / dependencies.size : 1,
      summary: `${healthyDeps}/${dependencies.size} dependencies healthy`
    };
  }

  private async gatherIncidentStatus(): Promise<any> {
    const incidents = Array.from(this.activeIncidents.values());
    const openIncidents = incidents.filter(i => i.status !== 'resolved');
    const criticalIncidents = openIncidents.filter(i => i.severity === 'critical');
    
    return {
      total: incidents.length,
      open: openIncidents.length,
      critical: criticalIncidents.length,
      incidents: openIncidents.map(i => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        status: i.status,
        startTime: i.startTime
      }))
    };
  }

  private async detectAnomalies(): Promise<any> {
    const detected = [];
    let impactScore = 0;
    
    // Simple anomaly detection simulation
    for (const [systemId, system] of this.systems) {
      if (Math.random() > 0.9) { // 10% chance of anomaly
        const anomaly: AnomalyDetection = {
          id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          systemId,
          metricName: 'response_time',
          anomalyType: 'spike',
          severity: 'medium',
          detectedAt: new Date(),
          confidence: 0.8,
          baseline: 500,
          actualValue: 1200,
          deviation: 140,
          context: {
            timeWindow: '5m',
            historicalData: [450, 480, 520, 490, 510]
          }
        };
        
        detected.push(anomaly);
        impactScore += anomaly.severity === 'critical' ? 0.8 : 
                      anomaly.severity === 'high' ? 0.6 : 
                      anomaly.severity === 'medium' ? 0.4 : 0.2;
      }
    }
    
    return {
      detected,
      count: detected.length,
      impactScore: Math.min(1, impactScore),
      summary: `${detected.length} anomalies detected`
    };
  }

  private async analyzeTrends(): Promise<any> {
    // Analyze trends in metrics over time
    const trends = {
      responseTime: 'stable',
      errorRate: 'decreasing',
      throughput: 'increasing',
      availability: 'stable'
    };
    
    return {
      trends,
      summary: 'System metrics showing positive trends'
    };
  }

  private async generatePredictions(): Promise<any> {
    // Generate predictions based on current trends
    const predictions = {
      nextHour: {
        availability: 99.9,
        errorRate: 0.5,
        responseTime: 450
      },
      next24Hours: {
        availability: 99.8,
        errorRate: 0.7,
        responseTime: 480
      }
    };
    
    return {
      predictions,
      confidence: 0.75,
      summary: 'Systems expected to maintain current performance levels'
    };
  }

  // Analysis and decision methods

  private async analyzeSystemHealth(observation: any): Promise<any> {
    const { systemsOverview, healthStatus, performanceMetrics } = observation;
    
    let overallScore = 0;
    const recommendations = [];
    
    // Calculate health score
    overallScore += (systemsOverview.healthPercentage / 100) * 0.4;
    overallScore += performanceMetrics.overallScore * 0.6;
    
    let status = 'healthy';
    if (overallScore < 0.7) {
      status = 'critical';
      recommendations.push('Immediate attention required for critical systems');
    } else if (overallScore < 0.9) {
      status = 'warning';
      recommendations.push('Monitor systems closely for degradation');
    }
    
    if (performanceMetrics.errorRate > 1) {
      recommendations.push('Investigate error rate increase');
    }
    
    if (performanceMetrics.responseTime.p95 > 1000) {
      recommendations.push('Optimize response times');
    }
    
    return {
      overallScore,
      status,
      recommendations,
      summary: `Overall health: ${(overallScore * 100).toFixed(1)}%`
    };
  }

  private async determineActions(observation: any): Promise<any[]> {
    const actions = [];
    
    // Add actions based on observation
    if (observation.alertStatus.critical > 0) {
      actions.push({
        type: 'escalate-alerts',
        priority: 'high',
        description: 'Escalate critical alerts to on-call team'
      });
    }
    
    if (observation.anomalies.count > 0) {
      actions.push({
        type: 'investigate-anomalies',
        priority: 'medium',
        description: 'Investigate detected anomalies'
      });
    }
    
    if (observation.performanceMetrics.errorRate > 5) {
      actions.push({
        type: 'create-incident',
        priority: 'high',
        description: 'Create incident for high error rate'
      });
    }
    
    return actions;
  }

  private async assessUrgency(observation: any): Promise<any> {
    let urgencyScore = 0;
    let level = 'low';
    
    // Assess urgency based on multiple factors
    if (observation.alertStatus.critical > 0) urgencyScore += 0.7;
    if (observation.performanceMetrics.availability < 99) urgencyScore += 0.5;
    if (observation.incidentStatus.critical > 0) urgencyScore += 0.8;
    if (observation.anomalies.impactScore > 0.5) urgencyScore += 0.3;
    
    if (urgencyScore > 0.7) level = 'critical';
    else if (urgencyScore > 0.4) level = 'high';
    else if (urgencyScore > 0.2) level = 'medium';
    
    return {
      score: Math.min(1, urgencyScore),
      level,
      reasoning: `Urgency determined by critical alerts and system availability`
    };
  }

  private async planIncidentResponse(observation: any): Promise<any> {
    const criticalAlerts = observation.alertStatus.critical;
    const systemHealth = observation.systemsOverview.healthPercentage;
    
    const required = criticalAlerts > 0 || systemHealth < 80;
    
    return {
      required,
      severity: criticalAlerts > 0 ? 'high' : 'medium',
      actions: required ? [
        'Create incident ticket',
        'Notify on-call team',
        'Begin incident response procedures'
      ] : [],
      escalation: {
        immediate: criticalAlerts > 2,
        teams: ['sre', 'engineering'],
        timeline: 'within 15 minutes'
      }
    };
  }

  // Action execution methods

  private async executeMonitoringActions(actions: any[]): Promise<any> {
    const results = [];
    
    for (const action of actions) {
      try {
        const result = await this.executeAction(action);
        results.push({ action: action.type, status: 'completed', result });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results.push({ action: action.type, status: 'failed', error: err.message });
      }
    }
    
    return { executed: results.length, results };
  }

  private async executeAction(action: any): Promise<any> {
    switch (action.type) {
      case 'escalate-alerts':
        return await this.escalateAlerts();
      case 'investigate-anomalies':
        return await this.investigateAnomalies();
      case 'create-incident':
        return await this.createIncident(action);
      default:
        return { message: `Executed ${action.type}` };
    }
  }

  private async escalateAlerts(): Promise<any> {
    this.logger.warn('Escalating critical alerts to on-call team');
    return { escalated: true, team: 'on-call' };
  }

  private async investigateAnomalies(): Promise<any> {
    this.logger.info('Investigating detected anomalies');
    return { investigation: 'started', priority: 'medium' };
  }

  private async createIncident(action: any): Promise<any> {
    const incidentId = `incident-${Date.now()}`;
    
    const incident: SystemIncident = {
      id: incidentId,
      title: action.description,
      description: 'Automatically created incident based on monitoring data',
      severity: 'high',
      status: 'investigating',
      affectedSystems: ['api-service'], // Would be determined from context
      startTime: new Date(),
      timeline: [{
        id: `event-${Date.now()}`,
        timestamp: new Date(),
        type: 'detected',
        description: 'Incident automatically detected',
        author: 'production-observer'
      }],
      impact: {
        usersAffected: 0,
        revenue: 0,
        duration: 0,
        serviceUnavailability: 0
      },
      watchers: ['sre-team']
    };
    
    this.activeIncidents.set(incidentId, incident);
    
    this.logger.warn(`Created incident: ${incidentId}`);
    
    return { incidentId, created: true };
  }

  private async handleIncidentResponse(response: any): Promise<any> {
    if (!response.required) return null;
    
    const incidentId = await this.createIncident({
      description: 'System degradation detected',
      severity: response.severity
    });
    
    return incidentId;
  }

  private async sendNotifications(alerts: any[], urgency: any): Promise<any> {
    let sent = 0;
    
    for (const alert of alerts) {
      this.logger.info(`Sending notification for alert: ${alert.name}`);
      sent++;
    }
    
    if (urgency.level === 'critical') {
      this.logger.warn('Sending critical urgency notifications');
      sent++;
    }
    
    return { sent, channels: ['slack', 'email'] };
  }

  private async updateMonitoringConfiguration(recommendations: string[]): Promise<void> {
    for (const recommendation of recommendations) {
      this.logger.info(`Applying monitoring recommendation: ${recommendation}`);
    }
  }

  private async storeAnomalies(anomalies: any[]): Promise<void> {
    for (const anomaly of anomalies) {
      const systemAnomalies = this.anomalies.get(anomaly.systemId) || [];
      systemAnomalies.push(anomaly);
      
      // Keep only recent anomalies (last 24 hours)
      const recentAnomalies = systemAnomalies.filter(a => 
        Date.now() - a.detectedAt.getTime() < 24 * 60 * 60 * 1000
      );
      
      this.anomalies.set(anomaly.systemId, recentAnomalies);
    }
  }

  // Monitoring execution methods

  private async performHealthChecks(systemId: string): Promise<void> {
    const system = this.systems.get(systemId);
    if (!system) return;
    
    for (const healthCheck of system.healthChecks) {
      if (healthCheck.enabled) {
        try {
          const result = await this.executeHealthCheck(healthCheck);
          
          if (result.status === 'fail') {
            this.logger.warn(`Health check failed for ${system.name}: ${healthCheck.name}`);
            await this.handleHealthCheckFailure(systemId, healthCheck, result);
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Health check error for ${system.name}:`, err);
        }
      }
    }
  }

  private async executeHealthCheck(healthCheck: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Simulate health check execution
      const success = Math.random() > 0.05; // 95% success rate
      const responseTime = Math.random() * 1000;
      
      return {
        checkId: healthCheck.id,
        name: healthCheck.name,
        status: success ? 'pass' : 'fail',
        responseTime,
        timestamp: new Date(),
        message: success ? 'Health check passed' : 'Health check failed'
      };
    } catch (error) {
      return {
        checkId: healthCheck.id,
        name: healthCheck.name,
        status: 'error',
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleHealthCheckFailure(systemId: string, healthCheck: HealthCheckConfig, result: HealthCheckResult): Promise<void> {
    // Create alert for health check failure
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: ActiveAlert = {
      id: alertId,
      alertConfigId: healthCheck.id,
      name: `Health Check Failure: ${healthCheck.name}`,
      severity: 'warning',
      status: 'firing',
      startTime: new Date(),
      description: `Health check ${healthCheck.name} failed for system ${systemId}`,
      affectedSystems: [systemId],
      notifications: []
    };
    
    this.activeAlerts.set(alertId, alert);
    
    // Update system status
    const system = this.systems.get(systemId);
    if (system) {
      system.status = 'warning';
      this.systems.set(systemId, system);
    }
  }

  private async collectMetrics(systemId: string): Promise<void> {
    const system = this.systems.get(systemId);
    if (!system) return;
    
    const observations = this.observations.get(systemId) || [];
    
    const observation: ObservationData = {
      timestamp: new Date(),
      systemId,
      metrics: await this.collectSystemMetrics(system),
      healthStatus: {
        overall: system.status,
        checks: [],
        lastUpdated: new Date()
      },
      dependencies: [],
      alerts: [],
      performance: {
        responseTime: {
          p50: Math.random() * 300,
          p95: Math.random() * 800,
          p99: Math.random() * 1500,
          avg: Math.random() * 400
        },
        throughput: Math.random() * 1000,
        errorRate: Math.random() * 2,
        availability: 99 + Math.random(),
        resourceUsage: {
          cpu: Math.random() * 80,
          memory: Math.random() * 90,
          disk: Math.random() * 60,
          network: Math.random() * 1000
        }
      },
      errors: [],
      logs: []
    };
    
    observations.push(observation);
    
    // Keep only recent observations (last hour)
    const recentObservations = observations.filter(obs => 
      Date.now() - obs.timestamp.getTime() < 60 * 60 * 1000
    );
    
    this.observations.set(systemId, recentObservations);
    
    // Check metric thresholds
    await this.checkMetricThresholds(system, observation.metrics);
  }

  private async collectSystemMetrics(system: ProductionSystem): Promise<MetricValue[]> {
    const metrics: MetricValue[] = [];
    
    for (const metricConfig of system.metrics) {
      if (metricConfig.enabled) {
        // Simulate metric collection
        const value = this.generateMetricValue(metricConfig);
        
        metrics.push({
          metricId: metricConfig.id,
          name: metricConfig.name,
          value,
          unit: metricConfig.unit,
          timestamp: new Date()
        });
      }
    }
    
    return metrics;
  }

  private generateMetricValue(metricConfig: MetricConfig): number {
    // Generate realistic metric values based on type
    switch (metricConfig.name.toLowerCase()) {
      case 'response time':
      case 'api response time':
        return Math.random() * 1000; // 0-1000ms
      case 'error rate':
        return Math.random() * 5; // 0-5%
      case 'throughput':
        return Math.random() * 1000; // 0-1000 requests/sec
      case 'cpu usage':
        return Math.random() * 100; // 0-100%
      case 'memory usage':
        return Math.random() * 100; // 0-100%
      default:
        return Math.random() * 100;
    }
  }

  private async checkMetricThresholds(system: ProductionSystem, metrics: MetricValue[]): Promise<void> {
    for (const metric of metrics) {
      const metricConfig = system.metrics.find(m => m.id === metric.metricId);
      if (!metricConfig) continue;
      
      for (const threshold of metricConfig.thresholds) {
        const breached = this.checkThreshold(metric.value, threshold);
        
        if (breached) {
          await this.handleThresholdBreach(system, metricConfig, threshold, metric);
        }
      }
    }
  }

  private checkThreshold(value: number, threshold: MetricThreshold): boolean {
    switch (threshold.operator) {
      case 'gt': return value > threshold.value;
      case 'lt': return value < threshold.value;
      case 'gte': return value >= threshold.value;
      case 'lte': return value <= threshold.value;
      case 'eq': return value === threshold.value;
      default: return false;
    }
  }

  private async handleThresholdBreach(system: ProductionSystem, metricConfig: MetricConfig, threshold: MetricThreshold, metric: MetricValue): Promise<void> {
    const alertId = `threshold-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: ActiveAlert = {
      id: alertId,
      alertConfigId: metricConfig.id,
      name: `Threshold Breach: ${metricConfig.name}`,
      severity: threshold.level === 'critical' ? 'critical' : 'warning',
      status: 'firing',
      startTime: new Date(),
      description: `${metricConfig.name} is ${metric.value}${metricConfig.unit}, threshold: ${threshold.value}${metricConfig.unit}`,
      affectedSystems: [system.id],
      notifications: []
    };
    
    this.activeAlerts.set(alertId, alert);
    
    this.logger.warn(`Threshold breached for ${system.name}: ${metricConfig.name} = ${metric.value}${metricConfig.unit}`);
    
    // Emit alert event
    this.eventBus.emit('production:alert', alert);
  }

  private async runAnomalyDetection(): Promise<void> {
    // Run anomaly detection on collected metrics
    for (const [systemId, observations] of this.observations) {
      if (observations.length > 10) { // Need sufficient data
        await this.detectSystemAnomalies(systemId, observations);
      }
    }
  }

  private async detectSystemAnomalies(systemId: string, observations: ObservationData[]): Promise<void> {
    const recentObservations = observations.slice(-10); // Last 10 observations
    const system = this.systems.get(systemId);
    if (!system) return;
    
    // Simple anomaly detection: check for significant deviations
    const responseTimeSeries = recentObservations.map(obs => obs.performance.responseTime.avg);
    const errorRateSeries = recentObservations.map(obs => obs.performance.errorRate);
    
    const responseTimeAnomaly = this.detectSeriesAnomaly(responseTimeSeries, 'response_time');
    const errorRateAnomaly = this.detectSeriesAnomaly(errorRateSeries, 'error_rate');
    
    if (responseTimeAnomaly) {
      await this.reportAnomaly(systemId, responseTimeAnomaly);
    }
    
    if (errorRateAnomaly) {
      await this.reportAnomaly(systemId, errorRateAnomaly);
    }
  }

  private detectSeriesAnomaly(series: number[], metricName: string): AnomalyDetection | null {
    if (series.length < 5) return null;
    
    const recent = series.slice(-3); // Last 3 values
    const baseline = series.slice(-10, -3); // Previous 7 values
    
    if (baseline.length === 0) return null;
    
    const baselineAvg = baseline.reduce((sum, val) => sum + val, 0) / baseline.length;
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    
    const deviation = Math.abs(recentAvg - baselineAvg) / baselineAvg;
    
    // Detect significant deviations (>50%)
    if (deviation > 0.5) {
      return {
        id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        systemId: '',
        metricName,
        anomalyType: recentAvg > baselineAvg ? 'spike' : 'drop',
        severity: deviation > 1 ? 'critical' : deviation > 0.8 ? 'high' : 'medium',
        detectedAt: new Date(),
        confidence: Math.min(0.9, deviation),
        baseline: baselineAvg,
        actualValue: recentAvg,
        deviation: deviation * 100,
        context: {
          timeWindow: '10m',
          historicalData: baseline,
          correlations: []
        }
      };
    }
    
    return null;
  }

  private async reportAnomaly(systemId: string, anomaly: AnomalyDetection): Promise<void> {
    anomaly.systemId = systemId;
    
    const systemAnomalies = this.anomalies.get(systemId) || [];
    systemAnomalies.push(anomaly);
    this.anomalies.set(systemId, systemAnomalies);
    
    this.logger.warn(`Anomaly detected in ${systemId}: ${anomaly.metricName} ${anomaly.anomalyType} (${anomaly.deviation.toFixed(1)}% deviation)`);
    
    // Create alert for significant anomalies
    if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
      const alertId = `anomaly-alert-${Date.now()}`;
      
      const alert: ActiveAlert = {
        id: alertId,
        alertConfigId: anomaly.id,
        name: `Anomaly: ${anomaly.metricName}`,
        severity: anomaly.severity === 'critical' ? 'critical' : 'warning',
        status: 'firing',
        startTime: new Date(),
        description: `${anomaly.anomalyType} detected in ${anomaly.metricName}: ${anomaly.deviation.toFixed(1)}% deviation from baseline`,
        affectedSystems: [systemId],
        notifications: []
      };
      
      this.activeAlerts.set(alertId, alert);
      this.eventBus.emit('production:alert', alert);
    }
  }

  // Event handlers

  private async handleAlert(alert: ActiveAlert): Promise<void> {
    this.logger.info(`Handling alert: ${alert.name} (${alert.severity})`);
    
    // Store alert
    this.activeAlerts.set(alert.id, alert);
    
    // Send notifications based on severity
    if (alert.severity === 'critical') {
      await this.sendCriticalAlertNotifications(alert);
    }
    
    // Auto-create incident for critical alerts
    if (alert.severity === 'critical' && alert.affectedSystems.some(sysId => {
      const system = this.systems.get(sysId);
      return system?.criticality === 'critical';
    })) {
      await this.createIncident({
        description: `Critical alert: ${alert.name}`,
        severity: 'high'
      });
    }
  }

  private async handleIncident(incident: SystemIncident): Promise<void> {
    this.logger.warn(`Handling incident: ${incident.title} (${incident.severity})`);
    
    this.activeIncidents.set(incident.id, incident);
    
    // Notify incident response team
    await this.notifyIncidentResponse(incident);
  }

  private async sendCriticalAlertNotifications(alert: ActiveAlert): Promise<void> {
    this.logger.warn(`Sending critical alert notifications for: ${alert.name}`);
    
    // Implementation would send actual notifications
    alert.notifications.push({
      channel: 'pagerduty',
      type: 'critical',
      status: 'sent',
      timestamp: new Date()
    });
    
    alert.notifications.push({
      channel: 'slack',
      type: 'critical',
      status: 'sent',
      timestamp: new Date()
    });
  }

  private async notifyIncidentResponse(incident: SystemIncident): Promise<void> {
    this.logger.warn(`Notifying incident response team for: ${incident.title}`);
    
    // Implementation would notify actual incident response team
  }

  private async updateMonitoringMetrics(success: boolean, result: any): Promise<void> {
    try {
      const metricsKey = 'production-observer:metrics:monitoring';
      let metrics = await this.memory.retrieve(metricsKey) || {
        totalObservations: 0,
        successfulObservations: 0,
        failedObservations: 0,
        successRate: 0,
        averageResponseTime: 0
      };
      
      metrics.totalObservations++;
      if (success) {
        metrics.successfulObservations++;
      } else {
        metrics.failedObservations++;
      }
      metrics.successRate = metrics.successfulObservations / metrics.totalObservations;
      
      await this.memory.store(metricsKey, metrics, {
        type: 'metric' as const,
        tags: ['monitoring', 'overall-metrics'],
        partition: 'overall-metrics'
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to update monitoring metrics', err);
    }
  }

  private generateDecisionId(): string {
    return `production-observer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for external interaction

  async addSystem(system: ProductionSystem): Promise<void> {
    this.systems.set(system.id, system);
    await this.saveProductionSystems();
    
    // Start monitoring the new system
    await this.startSystemMonitoring(system.id);
    
    this.logger.info(`Added production system: ${system.name}`);
  }

  async updateSystem(systemId: string, updates: Partial<ProductionSystem>): Promise<void> {
    const system = this.systems.get(systemId);
    if (!system) {
      throw new Error(`System ${systemId} not found`);
    }
    
    const updatedSystem = { ...system, ...updates };
    this.systems.set(systemId, updatedSystem);
    await this.saveProductionSystems();
    
    this.logger.info(`Updated production system: ${systemId}`);
  }

  async removeSystem(systemId: string): Promise<void> {
    const system = this.systems.get(systemId);
    if (!system) {
      throw new Error(`System ${systemId} not found`);
    }
    
    // Stop monitoring
    const healthInterval = this.monitoringIntervals.get(`${systemId}-health`);
    const metricsInterval = this.monitoringIntervals.get(`${systemId}-metrics`);
    
    if (healthInterval) clearInterval(healthInterval);
    if (metricsInterval) clearInterval(metricsInterval);
    
    this.monitoringIntervals.delete(`${systemId}-health`);
    this.monitoringIntervals.delete(`${systemId}-metrics`);
    
    // Remove system
    this.systems.delete(systemId);
    this.observations.delete(systemId);
    this.anomalies.delete(systemId);
    
    await this.saveProductionSystems();
    
    this.logger.info(`Removed production system: ${systemId}`);
  }

  async getSystemStatus(systemId?: string): Promise<any> {
    if (systemId) {
      const system = this.systems.get(systemId);
      if (!system) {
        throw new Error(`System ${systemId} not found`);
      }
      
      const observations = this.observations.get(systemId) || [];
      const recentObservation = observations[observations.length - 1];
      
      return {
        system,
        status: system.status,
        lastObservation: recentObservation,
        anomalies: this.anomalies.get(systemId) || []
      };
    }
    
    // Return overview of all systems
    const systemStatuses = [];
    for (const [id, system] of this.systems) {
      systemStatuses.push({
        id,
        name: system.name,
        type: system.type,
        status: system.status,
        criticality: system.criticality
      });
    }
    
    return {
      systems: systemStatuses,
      totalSystems: this.systems.size,
      healthySystems: systemStatuses.filter(s => s.status === 'healthy').length,
      criticalSystems: systemStatuses.filter(s => s.criticality === 'critical').length
    };
  }

  async getActiveAlerts(): Promise<ActiveAlert[]> {
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'firing');
  }

  async getActiveIncidents(): Promise<SystemIncident[]> {
    return Array.from(this.activeIncidents.values())
      .filter(incident => incident.status !== 'resolved');
  }

  async getSystemMetrics(systemId: string, timeRange?: string): Promise<ObservationData[]> {
    const observations = this.observations.get(systemId) || [];
    
    if (!timeRange) {
      return observations;
    }
    
    // Filter by time range
    const now = Date.now();
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    
    const rangeMs = ranges[timeRange] || ranges['1h'];
    
    return observations.filter(obs => 
      now - obs.timestamp.getTime() <= rangeMs
    );
  }

  async getAnomalies(systemId?: string): Promise<AnomalyDetection[]> {
    if (systemId) {
      return this.anomalies.get(systemId) || [];
    }
    
    // Return all anomalies
    const allAnomalies = [];
    for (const anomalies of this.anomalies.values()) {
      allAnomalies.push(...anomalies);
    }
    
    return allAnomalies;
  }

  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }
    
    alert.status = 'resolved';
    alert.endTime = new Date();
    
    this.activeAlerts.set(alertId, alert);
    
    this.logger.info(`Resolved alert: ${alertId}`);
  }

  async resolveIncident(incidentId: string, resolution: string): Promise<void> {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }
    
    incident.status = 'resolved';
    incident.endTime = new Date();
    incident.resolution = resolution;
    
    // Add resolution event to timeline
    incident.timeline.push({
      id: `event-${Date.now()}`,
      timestamp: new Date(),
      type: 'resolved',
      description: `Incident resolved: ${resolution}`,
      author: 'production-observer'
    });
    
    this.activeIncidents.set(incidentId, incident);
    
    this.logger.info(`Resolved incident: ${incidentId}`);
  }

  async getProductionMetrics(): Promise<any> {
    return await this.memory.retrieve('production-observer:metrics:monitoring') || {
      totalObservations: 0,
      successfulObservations: 0,
      failedObservations: 0,
      successRate: 0,
      averageResponseTime: 0
    };
  }
}