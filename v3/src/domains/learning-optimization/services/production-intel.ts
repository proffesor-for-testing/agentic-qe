/**
 * Agentic QE v3 - Production Intelligence Service
 * Gathers and analyzes production intelligence for learning optimization
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, DomainName } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { TimeRange } from '../../../shared/value-objects/index.js';
import {
  Experience,
  ExperienceResult,
  StateSnapshot,
  MinedInsights,
  TrendPoint,
  Milestone,
} from '../interfaces.js';

/**
 * Configuration for production intelligence
 */
export interface ProductionIntelConfig {
  metricsRetentionDays: number;
  anomalyThreshold: number;
  trendWindowSize: number;
  alertThresholds: Record<string, number>;
}

const DEFAULT_CONFIG: ProductionIntelConfig = {
  metricsRetentionDays: 90,
  anomalyThreshold: 2.5,
  trendWindowSize: 7,
  alertThresholds: {
    error_rate: 0.05,
    latency_p99: 5000,
    memory_usage: 0.9,
    cpu_usage: 0.8,
  },
};

/**
 * Production metric snapshot
 */
export interface ProductionMetric {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly domain: DomainName;
  readonly tags: string[];
  readonly timestamp: Date;
}

/**
 * Production incident for learning
 */
export interface ProductionIncident {
  readonly id: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly title: string;
  readonly description: string;
  readonly domain: DomainName;
  readonly metrics: Record<string, number>;
  readonly rootCause?: string;
  readonly resolution?: string;
  readonly startedAt: Date;
  readonly resolvedAt?: Date;
}

/**
 * Production health summary
 */
export interface ProductionHealth {
  readonly overall: 'healthy' | 'degraded' | 'unhealthy';
  readonly domains: Record<DomainName, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: Record<string, number>;
    activeIncidents: number;
  }>;
  readonly metrics: Record<string, number>;
  readonly trends: TrendPoint[];
  readonly recentIncidents: ProductionIncident[];
  readonly recommendations: string[];
}

/**
 * Production Intelligence Service
 * Collects and analyzes production data for learning optimization
 */
export class ProductionIntelService {
  private readonly config: ProductionIntelConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ProductionIntelConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // Metrics Collection
  // ============================================================================

  /**
   * Record a production metric
   */
  async recordMetric(
    name: string,
    value: number,
    unit: string,
    domain: DomainName,
    tags: string[] = []
  ): Promise<Result<string>> {
    try {
      const metric: ProductionMetric = {
        id: uuidv4(),
        name,
        value,
        unit,
        domain,
        tags,
        timestamp: new Date(),
      };

      // Store metric
      await this.memory.set(
        `production:metric:${metric.id}`,
        metric,
        {
          namespace: 'learning-optimization',
          ttl: this.config.metricsRetentionDays * 86400,
        }
      );

      // Index by name and domain
      await this.indexMetric(metric);

      // Check for anomalies
      await this.checkForAnomalies(metric);

      return ok(metric.id);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Record multiple metrics in batch
   */
  async recordMetricsBatch(
    metrics: Array<{
      name: string;
      value: number;
      unit: string;
      domain: DomainName;
      tags?: string[];
    }>
  ): Promise<Result<string[]>> {
    try {
      const ids: string[] = [];

      for (const metric of metrics) {
        const result = await this.recordMetric(
          metric.name,
          metric.value,
          metric.unit,
          metric.domain,
          metric.tags
        );
        if (result.success) {
          ids.push(result.value);
        }
      }

      return ok(ids);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get metrics history for a specific metric name
   */
  async getMetricsHistory(
    metricName: string,
    timeRange: TimeRange,
    domain?: DomainName
  ): Promise<Result<ProductionMetric[]>> {
    try {
      const pattern = domain
        ? `production:metric:index:${metricName}:${domain}:*`
        : `production:metric:index:${metricName}:*`;

      const keys = await this.memory.search(pattern, 1000);
      const metrics: ProductionMetric[] = [];

      for (const key of keys) {
        const metricId = await this.memory.get<string>(key);
        if (metricId) {
          const metric = await this.memory.get<ProductionMetric>(
            `production:metric:${metricId}`
          );
          if (metric && timeRange.contains(metric.timestamp)) {
            metrics.push(metric);
          }
        }
      }

      // Sort by timestamp
      metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return ok(metrics);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Incident Management
  // ============================================================================

  /**
   * Record a production incident
   */
  async recordIncident(
    severity: ProductionIncident['severity'],
    title: string,
    description: string,
    domain: DomainName,
    metrics: Record<string, number>
  ): Promise<Result<ProductionIncident>> {
    try {
      const incident: ProductionIncident = {
        id: uuidv4(),
        severity,
        title,
        description,
        domain,
        metrics,
        startedAt: new Date(),
      };

      await this.memory.set(
        `production:incident:${incident.id}`,
        incident,
        { namespace: 'learning-optimization', persist: true }
      );

      // Index by domain and severity
      await this.indexIncident(incident);

      // Create experience from incident for learning
      await this.createExperienceFromIncident(incident);

      return ok(incident);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Resolve an incident
   */
  async resolveIncident(
    incidentId: string,
    rootCause: string,
    resolution: string
  ): Promise<Result<ProductionIncident>> {
    try {
      const incident = await this.memory.get<ProductionIncident>(
        `production:incident:${incidentId}`
      );

      if (!incident) {
        return err(new Error(`Incident ${incidentId} not found`));
      }

      const resolved: ProductionIncident = {
        ...incident,
        rootCause,
        resolution,
        resolvedAt: new Date(),
      };

      await this.memory.set(
        `production:incident:${incidentId}`,
        resolved,
        { namespace: 'learning-optimization', persist: true }
      );

      // Update experience with resolution
      await this.updateExperienceWithResolution(resolved);

      return ok(resolved);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get recent incidents
   */
  async getRecentIncidents(
    limit = 10,
    domain?: DomainName
  ): Promise<Result<ProductionIncident[]>> {
    try {
      const pattern = domain
        ? `production:incident:index:domain:${domain}:*`
        : 'production:incident:*';

      const keys = await this.memory.search(pattern, limit * 2);
      const incidents: ProductionIncident[] = [];

      for (const key of keys) {
        if (key.includes(':index:')) {
          const incidentId = await this.memory.get<string>(key);
          if (incidentId) {
            const incident = await this.memory.get<ProductionIncident>(
              `production:incident:${incidentId}`
            );
            if (incident) {
              incidents.push(incident);
            }
          }
        } else {
          const incident = await this.memory.get<ProductionIncident>(key);
          if (incident) {
            incidents.push(incident);
          }
        }
      }

      // Sort by start time (most recent first)
      incidents.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

      // Remove duplicates
      const unique = Array.from(
        new Map(incidents.map((i) => [i.id, i])).values()
      );

      return ok(unique.slice(0, limit));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Health & Trends
  // ============================================================================

  /**
   * Get current production health status
   */
  async getProductionHealth(): Promise<Result<ProductionHealth>> {
    try {
      const domains: DomainName[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
        'code-intelligence',
        'security-compliance',
        'learning-optimization',
      ];

      const domainHealth: ProductionHealth['domains'] = {} as ProductionHealth['domains'];
      const allMetrics: Record<string, number> = {};
      let overallStatus: ProductionHealth['overall'] = 'healthy';
      let degradedCount = 0;
      let unhealthyCount = 0;

      for (const domain of domains) {
        const health = await this.getDomainHealth(domain);
        domainHealth[domain] = health;

        if (health.status === 'degraded') degradedCount++;
        if (health.status === 'unhealthy') unhealthyCount++;

        for (const [key, value] of Object.entries(health.metrics)) {
          allMetrics[`${domain}_${key}`] = value;
        }
      }

      if (unhealthyCount > 0) {
        overallStatus = 'unhealthy';
      } else if (degradedCount > domains.length / 3) {
        overallStatus = 'degraded';
      }

      // Calculate trends
      const trends = await this.calculateTrends();

      // Get recent incidents
      const incidentsResult = await this.getRecentIncidents(5);
      const recentIncidents = incidentsResult.success ? incidentsResult.value : [];

      // Generate recommendations
      const recommendations = this.generateHealthRecommendations(
        domainHealth,
        allMetrics,
        recentIncidents
      );

      return ok({
        overall: overallStatus,
        domains: domainHealth,
        metrics: allMetrics,
        trends,
        recentIncidents,
        recommendations,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get health status for a specific domain
   */
  private async getDomainHealth(domain: DomainName): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: Record<string, number>;
    activeIncidents: number;
  }> {
    const timeRange = TimeRange.lastNDays(1);
    const metricsResult = await this.getMetricsHistory('*', timeRange, domain);
    const metrics: Record<string, number> = {};

    if (metricsResult.success) {
      for (const metric of metricsResult.value) {
        if (!metrics[metric.name]) {
          metrics[metric.name] = metric.value;
        } else {
          // Use latest value
          metrics[metric.name] = metric.value;
        }
      }
    }

    // Count active incidents
    const incidentsResult = await this.getRecentIncidents(100, domain);
    const activeIncidents = incidentsResult.success
      ? incidentsResult.value.filter((i) => !i.resolvedAt).length
      : 0;

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (activeIncidents > 2) {
      status = 'unhealthy';
    } else if (activeIncidents > 0) {
      status = 'degraded';
    }

    // Check metric thresholds
    if (metrics['error_rate'] > this.config.alertThresholds['error_rate']) {
      status = 'unhealthy';
    } else if (
      metrics['latency_p99'] > this.config.alertThresholds['latency_p99']
    ) {
      status = 'degraded';
    }

    return { status, metrics, activeIncidents };
  }

  /**
   * Calculate metric trends
   */
  private async calculateTrends(): Promise<TrendPoint[]> {
    const trends: TrendPoint[] = [];
    const metricNames = ['error_rate', 'latency_p99', 'success_rate'];
    const windowDays = this.config.trendWindowSize;

    for (const metricName of metricNames) {
      for (let day = 0; day < windowDays; day++) {
        const dayStart = new Date();
        dayStart.setDate(dayStart.getDate() - day);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const timeRange = TimeRange.create(dayStart, dayEnd);
        const metricsResult = await this.getMetricsHistory(metricName, timeRange);

        if (metricsResult.success && metricsResult.value.length > 0) {
          const avgValue =
            metricsResult.value.reduce((sum, m) => sum + m.value, 0) /
            metricsResult.value.length;

          trends.push({
            timestamp: dayStart,
            metric: metricName,
            value: avgValue,
          });
        }
      }
    }

    return trends;
  }

  /**
   * Generate health recommendations
   */
  private generateHealthRecommendations(
    domainHealth: ProductionHealth['domains'],
    metrics: Record<string, number>,
    incidents: ProductionIncident[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for unhealthy domains
    for (const [domain, health] of Object.entries(domainHealth)) {
      if (health.status === 'unhealthy') {
        recommendations.push(
          `Domain ${domain} is unhealthy. Review active incidents and metrics.`
        );
      } else if (health.status === 'degraded') {
        recommendations.push(
          `Domain ${domain} is degraded. Monitor closely.`
        );
      }
    }

    // Check metric thresholds
    for (const [metricKey, value] of Object.entries(metrics)) {
      const baseName = metricKey.split('_').slice(-2).join('_');
      const threshold = this.config.alertThresholds[baseName];

      if (threshold && value > threshold) {
        recommendations.push(
          `Metric ${metricKey} (${value.toFixed(2)}) exceeds threshold (${threshold})`
        );
      }
    }

    // Analyze incident patterns
    const unresolvedIncidents = incidents.filter((i) => !i.resolvedAt);
    if (unresolvedIncidents.length > 3) {
      recommendations.push(
        `${unresolvedIncidents.length} unresolved incidents require attention`
      );
    }

    // Check for recurring issues
    const severityCounts = incidents.reduce(
      (acc, i) => {
        acc[i.severity] = (acc[i.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    if (severityCounts['critical'] > 2) {
      recommendations.push(
        'Multiple critical incidents detected. Consider system-wide review.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('All systems operating within normal parameters.');
    }

    return recommendations;
  }

  // ============================================================================
  // Intelligence Extraction
  // ============================================================================

  /**
   * Extract insights from production data
   */
  async extractInsights(
    timeRange: TimeRange,
    domain?: DomainName
  ): Promise<Result<MinedInsights>> {
    try {
      // Get metrics for the time range
      const metricsResult = await this.getMetricsHistory('*', timeRange, domain);
      const metrics = metricsResult.success ? metricsResult.value : [];

      // Get incidents
      const incidentsResult = await this.getRecentIncidents(50, domain);
      const incidents = incidentsResult.success ? incidentsResult.value : [];

      // Calculate experience count (metric samples)
      const experienceCount = metrics.length;

      // Calculate success rate from incidents
      const resolvedIncidents = incidents.filter((i) => i.resolvedAt);
      const successRate =
        incidents.length > 0 ? resolvedIncidents.length / incidents.length : 1;

      // Calculate average reward (inverse of incident severity)
      const avgReward = this.calculateRewardFromIncidents(incidents);

      // Generate recommendations
      const recommendations = this.generateInsightRecommendations(
        metrics,
        incidents
      );

      // Detect anomalies in metrics
      const anomalies = this.detectMetricAnomalies(metrics);

      return ok({
        experienceCount,
        successRate,
        avgReward,
        patterns: [],
        anomalies,
        recommendations,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Record production milestone
   */
  async recordMilestone(
    name: string,
    domain: DomainName,
    metrics?: Record<string, number>
  ): Promise<Result<Milestone>> {
    try {
      const milestone: Milestone = {
        name,
        achievedAt: new Date(),
        domain,
      };

      await this.memory.set(
        `production:milestone:${uuidv4()}`,
        { ...milestone, metrics },
        { namespace: 'learning-optimization', persist: true }
      );

      return ok(milestone);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get recent milestones
   */
  async getRecentMilestones(limit = 10): Promise<Result<Milestone[]>> {
    try {
      const keys = await this.memory.search('production:milestone:*', limit);
      const milestones: Milestone[] = [];

      for (const key of keys) {
        const milestone = await this.memory.get<Milestone>(key);
        if (milestone) {
          milestones.push(milestone);
        }
      }

      milestones.sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());

      return ok(milestones.slice(0, limit));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async indexMetric(metric: ProductionMetric): Promise<void> {
    await this.memory.set(
      `production:metric:index:${metric.name}:${metric.domain}:${metric.id}`,
      metric.id,
      {
        namespace: 'learning-optimization',
        ttl: this.config.metricsRetentionDays * 86400,
      }
    );
  }

  private async indexIncident(incident: ProductionIncident): Promise<void> {
    await this.memory.set(
      `production:incident:index:domain:${incident.domain}:${incident.id}`,
      incident.id,
      { namespace: 'learning-optimization', persist: true }
    );

    await this.memory.set(
      `production:incident:index:severity:${incident.severity}:${incident.id}`,
      incident.id,
      { namespace: 'learning-optimization', persist: true }
    );
  }

  private async checkForAnomalies(metric: ProductionMetric): Promise<void> {
    // Get historical metrics for comparison
    const timeRange = TimeRange.lastNDays(7);
    const historyResult = await this.getMetricsHistory(
      metric.name,
      timeRange,
      metric.domain
    );

    if (!historyResult.success || historyResult.value.length < 10) {
      return;
    }

    const values = historyResult.value.map((m) => m.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );

    const deviation = Math.abs(metric.value - mean) / (stdDev || 1);

    if (deviation > this.config.anomalyThreshold) {
      // Record anomaly
      await this.memory.set(
        `production:anomaly:${uuidv4()}`,
        {
          metricId: metric.id,
          metricName: metric.name,
          value: metric.value,
          mean,
          stdDev,
          deviation,
          timestamp: new Date(),
        },
        { namespace: 'learning-optimization', ttl: 86400 * 7 }
      );
    }
  }

  private async createExperienceFromIncident(
    incident: ProductionIncident
  ): Promise<void> {
    const state: StateSnapshot = {
      context: {
        incidentId: incident.id,
        severity: incident.severity,
        domain: incident.domain,
      },
      metrics: incident.metrics,
    };

    const result: ExperienceResult = {
      success: false,
      outcome: incident.metrics,
      duration: 0,
    };

    const experience: Experience = {
      id: uuidv4(),
      agentId: {
        value: 'production-intel',
        domain: 'learning-optimization',
        type: 'analyzer',
      },
      domain: incident.domain,
      action: `incident-${incident.severity}`,
      state,
      result,
      reward: this.calculateIncidentReward(incident),
      timestamp: incident.startedAt,
    };

    await this.memory.set(
      `learning:experience:${experience.id}`,
      experience,
      { namespace: 'learning-optimization', ttl: 86400 * 30 }
    );
  }

  private async updateExperienceWithResolution(
    incident: ProductionIncident
  ): Promise<void> {
    // Create positive experience from resolution
    if (!incident.resolvedAt) return;

    const state: StateSnapshot = {
      context: {
        incidentId: incident.id,
        rootCause: incident.rootCause,
        resolution: incident.resolution,
      },
      metrics: incident.metrics,
    };

    const duration = incident.resolvedAt.getTime() - incident.startedAt.getTime();

    const result: ExperienceResult = {
      success: true,
      outcome: {
        ...incident.metrics,
        resolution_time_ms: duration,
      },
      duration,
    };

    const experience: Experience = {
      id: uuidv4(),
      agentId: {
        value: 'production-intel',
        domain: 'learning-optimization',
        type: 'analyzer',
      },
      domain: incident.domain,
      action: `resolution-${incident.severity}`,
      state,
      result,
      reward: 1 - this.calculateIncidentReward(incident), // Inverse - resolution is good
      timestamp: incident.resolvedAt,
    };

    await this.memory.set(
      `learning:experience:${experience.id}`,
      experience,
      { namespace: 'learning-optimization', ttl: 86400 * 30 }
    );
  }

  private calculateIncidentReward(incident: ProductionIncident): number {
    // Lower severity = higher reward (inverted)
    const severityScores: Record<string, number> = {
      critical: 0.9,
      high: 0.7,
      medium: 0.4,
      low: 0.2,
    };

    return -(severityScores[incident.severity] || 0.5);
  }

  private calculateRewardFromIncidents(incidents: ProductionIncident[]): number {
    if (incidents.length === 0) return 0.8;

    const severityWeights: Record<string, number> = {
      critical: 0.1,
      high: 0.3,
      medium: 0.6,
      low: 0.8,
    };

    let totalReward = 0;
    let count = 0;

    for (const incident of incidents) {
      const base = severityWeights[incident.severity] || 0.5;
      const resolved = incident.resolvedAt ? 0.2 : 0;
      totalReward += base + resolved;
      count++;
    }

    return count > 0 ? totalReward / count : 0.8;
  }

  private generateInsightRecommendations(
    metrics: ProductionMetric[],
    incidents: ProductionIncident[]
  ): string[] {
    const recommendations: string[] = [];

    // Analyze metric patterns
    const metricGroups = new Map<string, number[]>();
    for (const metric of metrics) {
      const existing = metricGroups.get(metric.name) || [];
      existing.push(metric.value);
      metricGroups.set(metric.name, existing);
    }

    for (const [name, values] of metricGroups) {
      const trend = this.calculateTrendDirection(values);
      if (trend === 'increasing' && name.includes('error')) {
        recommendations.push(`${name} is trending upward. Investigate root causes.`);
      } else if (trend === 'decreasing' && name.includes('success')) {
        recommendations.push(`${name} is declining. Review recent changes.`);
      }
    }

    // Analyze incident patterns
    if (incidents.length > 0) {
      const domainIncidents = new Map<string, number>();
      for (const incident of incidents) {
        domainIncidents.set(
          incident.domain,
          (domainIncidents.get(incident.domain) || 0) + 1
        );
      }

      for (const [domain, count] of domainIncidents) {
        if (count > 3) {
          recommendations.push(
            `Domain ${domain} has ${count} incidents. Consider preventive measures.`
          );
        }
      }
    }

    return recommendations;
  }

  private detectMetricAnomalies(metrics: ProductionMetric[]): Array<{
    experienceId: string;
    type: 'unexpected-failure' | 'unexpected-success' | 'outlier-reward';
    description: string;
    deviation: number;
  }> {
    const anomalies: Array<{
      experienceId: string;
      type: 'unexpected-failure' | 'unexpected-success' | 'outlier-reward';
      description: string;
      deviation: number;
    }> = [];

    // Group by metric name
    const groups = new Map<string, ProductionMetric[]>();
    for (const metric of metrics) {
      const existing = groups.get(metric.name) || [];
      existing.push(metric);
      groups.set(metric.name, existing);
    }

    for (const [name, groupMetrics] of groups) {
      if (groupMetrics.length < 5) continue;

      const values = groupMetrics.map((m) => m.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(
        values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
      );

      for (const metric of groupMetrics) {
        const deviation = Math.abs(metric.value - mean) / (stdDev || 1);
        if (deviation > this.config.anomalyThreshold) {
          anomalies.push({
            experienceId: metric.id,
            type: 'outlier-reward',
            description: `${name} value ${metric.value.toFixed(2)} is ${deviation.toFixed(1)} std deviations from mean`,
            deviation,
          });
        }
      }
    }

    return anomalies;
  }

  private calculateTrendDirection(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 3) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / (firstAvg || 1);

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }
}
