/**
 * Chaos Resilience Test Handler
 * Comprehensive resilience testing with multiple chaos scenarios
 */

import type {
  ChaosResilienceConfig,
  ChaosResilienceReport,
  ChaosScenario,
  ScenarioResult,
  ResilienceMetrics,
  ResilienceBehavior,
  BlastRadiusProgression,
  ResilienceRecommendation,
  ChaosTemplate,
} from '../../types/chaos';
import { chaosInjectLatency } from './chaos-inject-latency';
import { chaosInjectFailure } from './chaos-inject-failure';
import { generateId } from '../../../utils/validation';

/**
 * Predefined chaos templates
 */
const CHAOS_TEMPLATES: Record<string, ChaosTemplate> = {
  'network-partition': {
    name: 'network-partition',
    description: 'Simulates network partition with connection failures',
    scenarios: [
      {
        type: 'failure',
        config: { failureType: 'connection_refused' },
        weight: 1.0,
      },
    ],
    defaultBlastRadius: { percentage: 50, targetServices: [] },
    defaultDuration: 30000,
    category: 'network',
    tags: ['network', 'partition', 'connectivity'],
  },
  'high-latency': {
    name: 'high-latency',
    description: 'Tests system behavior under high latency conditions',
    scenarios: [
      {
        type: 'latency',
        config: { latencyMs: 2000, distribution: 'normal' },
        weight: 1.0,
      },
    ],
    defaultBlastRadius: { percentage: 100, targetServices: [] },
    defaultDuration: 60000,
    category: 'performance',
    tags: ['latency', 'performance', 'slow-network'],
  },
  'cascading-failure': {
    name: 'cascading-failure',
    description: 'Tests cascading failure scenarios',
    scenarios: [
      {
        type: 'failure',
        config: { failureType: 'http_error', httpErrorCode: 503 },
        weight: 0.7,
      },
      {
        type: 'failure',
        config: { failureType: 'timeout', timeoutMs: 5000 },
        weight: 0.3,
      },
    ],
    defaultBlastRadius: { percentage: 75, targetServices: [] },
    defaultDuration: 45000,
    category: 'reliability',
    tags: ['failure', 'cascading', 'reliability'],
  },
};

/**
 * Response time tracker
 */
class ResponseTimeTracker {
  private responseTimes: number[] = [];

  add(timeMs: number): void {
    this.responseTimes.push(timeMs);
  }

  getAverage(): number {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }

  getPercentile(p: number): number {
    if (this.responseTimes.length === 0) return 0;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getAll(): number[] {
    return [...this.responseTimes];
  }
}

/**
 * Test service health with retries
 */
async function testServiceHealth(
  target: string,
  retryConfig?: { maxRetries: number; backoffMs: number; exponential?: boolean }
): Promise<{
  success: boolean;
  responseTimeMs: number;
  retriesAttempted: number;
  error?: string;
}> {
  const maxRetries = retryConfig?.maxRetries ?? 0;
  let retriesAttempted = 0;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(target, {
        method: 'GET',
        headers: { 'X-Chaos-Health-Check': 'true' },
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          responseTimeMs,
          retriesAttempted,
        };
      }
    } catch (error) {
      retriesAttempted++;

      if (attempt < maxRetries) {
        // Calculate backoff
        const backoffMs = retryConfig?.exponential
          ? retryConfig.backoffMs * Math.pow(2, attempt)
          : retryConfig!.backoffMs;

        await new Promise(resolve => setTimeout(resolve, backoffMs));
      } else {
        return {
          success: false,
          responseTimeMs: Date.now() - startTime,
          retriesAttempted,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  }

  return {
    success: false,
    responseTimeMs: Date.now() - startTime,
    retriesAttempted,
    error: 'Max retries exceeded',
  };
}

/**
 * Run a single chaos scenario
 */
async function runScenario(
  scenario: ChaosScenario,
  config: ChaosResilienceConfig
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const tracker = new ResponseTimeTracker();
  let successCount = 0;
  let failureCount = 0;
  let circuitBreakerTriggered = false;
  let retriesAttempted = 0;
  const errors: string[] = [];

  try {
    // Inject chaos based on scenario type
    let injectionResult;

    if (scenario.type === 'latency') {
      injectionResult = await chaosInjectLatency({
        target: config.target,
        latencyMs: (scenario.config as any).latencyMs ?? 500,
        distribution: (scenario.config as any).distribution ?? 'fixed',
        blastRadius: config.blastRadius,
        duration: config.duration,
      });
    } else {
      injectionResult = await chaosInjectFailure({
        target: config.target,
        failureType: (scenario.config as any).failureType ?? 'http_error',
        httpErrorCode: (scenario.config as any).httpErrorCode,
        blastRadius: config.blastRadius,
        duration: config.duration,
      });
    }

    if (!injectionResult.success) {
      throw new Error(injectionResult.error);
    }

    // Test service health during chaos
    const testDuration = config.duration ?? 10000;
    const testInterval = 1000; // Test every second
    const testCount = Math.floor(testDuration / testInterval);

    for (let i = 0; i < testCount; i++) {
      const healthResult = await testServiceHealth(
        config.target,
        config.resilience?.retryPolicy
      );

      tracker.add(healthResult.responseTimeMs);
      retriesAttempted += healthResult.retriesAttempted;

      if (healthResult.success) {
        successCount++;
      } else {
        failureCount++;
        if (healthResult.error) {
          errors.push(healthResult.error);
        }

        // Check for circuit breaker pattern
        if (failureCount >= 3) {
          circuitBreakerTriggered = true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, testInterval));
    }

    // Rollback injection
    if (scenario.type === 'latency') {
      await chaosInjectLatency({
        ...scenario.config as any,
        target: config.target,
        rollback: true,
        injectionId: injectionResult.injectionId,
        blastRadius: config.blastRadius,
      });
    } else {
      await chaosInjectFailure({
        ...scenario.config as any,
        target: config.target,
        rollback: true,
        injectionId: injectionResult.injectionId,
        blastRadius: config.blastRadius,
      });
    }

    const durationMs = Date.now() - startTime;
    const totalRequests = successCount + failureCount;

    const metrics: ResilienceMetrics = {
      totalRequests,
      successfulRequests: successCount,
      failedRequests: failureCount,
      avgResponseTimeMs: tracker.getAverage(),
      p95ResponseTimeMs: tracker.getPercentile(95),
      p99ResponseTimeMs: tracker.getPercentile(99),
      availabilityScore: totalRequests > 0 ? successCount / totalRequests : 0,
      errorRate: totalRequests > 0 ? failureCount / totalRequests : 0,
    };

    const behavior: ResilienceBehavior = {
      circuitBreakerTriggered,
      retriesAttempted,
      fallbackUsed: false,
      timeoutOccurred: errors.some(e => e.includes('timeout')),
      gracefulDegradation: successCount > 0 && failureCount > 0,
    };

    return {
      type: scenario.type,
      passed: metrics.availabilityScore > 0.5,
      durationMs,
      metrics,
      behavior,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    };
  } catch (error) {
    return {
      type: scenario.type,
      passed: false,
      durationMs: Date.now() - startTime,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
        p99ResponseTimeMs: 0,
        availabilityScore: 0,
        errorRate: 1,
      },
      behavior: {
        circuitBreakerTriggered: false,
        retriesAttempted: 0,
      },
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Generate resilience recommendations
 */
function generateRecommendations(
  report: ChaosResilienceReport
): ResilienceRecommendation[] {
  const recommendations: ResilienceRecommendation[] = [];

  // Check availability score
  if (report.overallScore < 70) {
    recommendations.push({
      priority: 'critical',
      category: 'reliability',
      title: 'Improve System Availability',
      description: 'System availability is below acceptable threshold. Consider implementing circuit breakers, retries, and fallback mechanisms.',
      effort: 'high',
      impact: 'high',
    });
  }

  // Check error rate
  const avgErrorRate = report.scenarios.reduce((sum, s) => sum + s.metrics.errorRate, 0) / report.scenarios.length;
  if (avgErrorRate > 0.3) {
    recommendations.push({
      priority: 'high',
      category: 'error-handling',
      title: 'Reduce Error Rate',
      description: 'High error rate detected. Implement better error handling and retry strategies.',
      effort: 'medium',
      impact: 'high',
    });
  }

  // Check response times
  const avgResponseTime = report.scenarios.reduce((sum, s) => sum + s.metrics.avgResponseTimeMs, 0) / report.scenarios.length;
  if (avgResponseTime > 5000) {
    recommendations.push({
      priority: 'medium',
      category: 'performance',
      title: 'Optimize Response Times',
      description: 'Average response time is high. Consider caching, connection pooling, and timeout tuning.',
      effort: 'medium',
      impact: 'medium',
    });
  }

  // Check circuit breaker usage
  const circuitBreakerUsed = report.scenarios.some(s => s.behavior.circuitBreakerTriggered);
  if (!circuitBreakerUsed && avgErrorRate > 0.2) {
    recommendations.push({
      priority: 'high',
      category: 'resilience',
      title: 'Implement Circuit Breaker',
      description: 'Circuit breaker pattern not detected. This can prevent cascading failures.',
      effort: 'medium',
      impact: 'high',
    });
  }

  return recommendations;
}

/**
 * Main handler for chaos resilience testing
 */
export async function chaosResilienceTest(
  config: ChaosResilienceConfig
): Promise<ChaosResilienceReport> {
  const testId = generateId('chaos-resilience');
  const startTime = new Date();

  try {
    // Get scenarios from template or config
    let scenarios = config.scenarios ?? [];

    if (config.template) {
      const template = CHAOS_TEMPLATES[config.template];
      if (!template) {
        throw new Error(`Template ${config.template} not found`);
      }

      scenarios = template.scenarios;
      config.blastRadius = config.blastRadius ?? template.defaultBlastRadius;
      config.duration = config.duration ?? template.defaultDuration;
    }

    if (scenarios.length === 0) {
      throw new Error('No scenarios defined');
    }

    // Update blast radius with target services
    config.blastRadius.targetServices = config.blastRadius.targetServices.length > 0
      ? config.blastRadius.targetServices
      : ['default-service'];

    // Run all scenarios
    const scenarioResults: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const result = await runScenario(scenario, config);
      scenarioResults.push(result);
    }

    // Calculate overall metrics
    const totalRequests = scenarioResults.reduce((sum, r) => sum + r.metrics.totalRequests, 0);
    const successfulRequests = scenarioResults.reduce((sum, r) => sum + r.metrics.successfulRequests, 0);
    const failedRequests = scenarioResults.reduce((sum, r) => sum + r.metrics.failedRequests, 0);

    const aggregatedMetrics: ResilienceMetrics = {
      totalRequests,
      successfulRequests,
      failedRequests,
      avgResponseTimeMs: scenarioResults.reduce((sum, r) => sum + r.metrics.avgResponseTimeMs, 0) / scenarioResults.length,
      p95ResponseTimeMs: Math.max(...scenarioResults.map(r => r.metrics.p95ResponseTimeMs)),
      p99ResponseTimeMs: Math.max(...scenarioResults.map(r => r.metrics.p99ResponseTimeMs)),
      availabilityScore: totalRequests > 0 ? successfulRequests / totalRequests : 0,
      errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
    };

    // Calculate overall score (0-100)
    const overallScore = Math.round(
      (aggregatedMetrics.availabilityScore * 60) + // 60% weight on availability
      ((1 - aggregatedMetrics.errorRate) * 30) + // 30% weight on error rate
      (Math.min(aggregatedMetrics.avgResponseTimeMs / 10000, 1) * 10) // 10% weight on response time
    );

    const endTime = new Date();

    const report: ChaosResilienceReport = {
      success: true,
      target: config.target,
      template: config.template,
      scenarios: scenarioResults,
      overallScore,
      metrics: aggregatedMetrics,
      resilience: {
        circuitBreakerTriggered: scenarioResults.some(r => r.behavior.circuitBreakerTriggered),
        retriesAttempted: scenarioResults.reduce((sum, r) => r.behavior.retriesAttempted ?? 0, 0),
        fallbackUsed: scenarioResults.some(r => r.behavior.fallbackUsed),
        timeoutOccurred: scenarioResults.some(r => r.behavior.timeoutOccurred),
        gracefulDegradation: scenarioResults.some(r => r.behavior.gracefulDegradation),
      },
      rolledBack: config.autoRollback ?? true,
      totalDurationMs: endTime.getTime() - startTime.getTime(),
      startTime,
      endTime,
      metadata: {
        testId,
        environment: 'test',
        scenarioCount: scenarios.length,
      },
    };

    // Generate recommendations
    report.recommendations = generateRecommendations(report);

    return report;
  } catch (error) {
    return {
      success: false,
      target: config.target,
      scenarios: [],
      overallScore: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      rolledBack: false,
      startTime,
      endTime: new Date(),
    };
  }
}

/**
 * Get available chaos templates
 */
export function getChaosTemplates(): ChaosTemplate[] {
  return Object.values(CHAOS_TEMPLATES);
}

/**
 * Get specific chaos template
 */
export function getChaosTemplate(name: string): ChaosTemplate | undefined {
  return CHAOS_TEMPLATES[name];
}
