/**
 * Performance Bottleneck Analysis Tool
 *
 * Analyzes performance metrics to detect CPU, memory, I/O bottlenecks
 * and generate optimization recommendations.
 *
 * @module performance/analyze-bottlenecks
 * @version 1.0.0
 */

import type { PerformanceMetrics, ResourceUsage } from '../shared/types.js';

/**
 * Parameters for bottleneck analysis
 */
export interface BottleneckAnalysisParams {
  /** Performance metrics to analyze */
  performanceData: PerformanceMetrics;

  /** Threshold configuration */
  thresholds: BottleneckThresholds;

  /** Include optimization recommendations */
  includeRecommendations: boolean;

  /** Historical performance data for comparison */
  historicalData?: PerformanceMetrics[];
}

/**
 * Threshold configuration for bottleneck detection
 */
export interface BottleneckThresholds {
  /** CPU usage threshold (percentage) */
  cpu: number;

  /** Memory usage threshold (MB) */
  memory: number;

  /** Response time threshold (ms) */
  responseTime: number;

  /** Error rate threshold (0-1) */
  errorRate?: number;

  /** Throughput minimum (requests/sec) */
  throughputMin?: number;
}

/**
 * Bottleneck analysis result
 */
export interface BottleneckAnalysis {
  /** Detected bottlenecks */
  bottlenecks: Bottleneck[];

  /** Overall severity */
  overallSeverity: 'none' | 'low' | 'medium' | 'high' | 'critical';

  /** Performance score (0-100) */
  performanceScore: number;

  /** Resource utilization summary */
  resourceUtilization: ResourceUtilizationSummary;

  /** Optimization recommendations */
  recommendations?: OptimizationRecommendation[];

  /** Trend analysis (if historical data provided) */
  trends?: TrendAnalysis;
}

/**
 * Individual bottleneck detection
 */
export interface Bottleneck {
  /** Bottleneck type */
  type: 'cpu' | 'memory' | 'io' | 'network' | 'response-time' | 'throughput';

  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Current value */
  currentValue: number;

  /** Threshold value */
  thresholdValue: number;

  /** Percentage above threshold */
  percentageAboveThreshold: number;

  /** Description */
  description: string;

  /** Affected components */
  affectedComponents?: string[];
}

/**
 * Resource utilization summary
 */
export interface ResourceUtilizationSummary {
  /** CPU utilization */
  cpu: {
    current: number;
    average: number;
    peak: number;
    status: 'normal' | 'warning' | 'critical';
  };

  /** Memory utilization */
  memory: {
    current: number;
    average: number;
    peak: number;
    status: 'normal' | 'warning' | 'critical';
  };

  /** Disk utilization */
  disk?: {
    current: number;
    average: number;
    peak: number;
    status: 'normal' | 'warning' | 'critical';
  };

  /** Network utilization */
  network?: {
    current: number;
    average: number;
    peak: number;
    status: 'normal' | 'warning' | 'critical';
  };
}

/**
 * Optimization recommendation
 */
export interface OptimizationRecommendation {
  /** Recommendation priority */
  priority: 'low' | 'medium' | 'high' | 'critical';

  /** Recommendation category */
  category: 'code' | 'infrastructure' | 'configuration' | 'architecture';

  /** Recommendation title */
  title: string;

  /** Detailed description */
  description: string;

  /** Expected impact */
  expectedImpact: {
    /** Performance improvement (percentage) */
    performanceImprovement: number;

    /** Implementation effort (hours) */
    implementationEffort: number;

    /** Return on investment score (0-10) */
    roiScore: number;
  };

  /** Implementation steps */
  implementationSteps?: string[];

  /** Related bottlenecks */
  relatedBottlenecks?: string[];
}

/**
 * Trend analysis from historical data
 */
export interface TrendAnalysis {
  /** Performance trend direction */
  direction: 'improving' | 'stable' | 'degrading';

  /** Percentage change from baseline */
  percentageChange: number;

  /** Prediction for next period */
  prediction?: {
    expectedPerformance: number;
    confidence: number;
  };

  /** Anomalies detected */
  anomalies?: string[];
}

/**
 * Analyze performance bottlenecks
 *
 * Detects CPU, memory, I/O bottlenecks and generates optimization recommendations.
 *
 * @param params - Bottleneck analysis parameters
 * @returns Promise resolving to bottleneck analysis results
 *
 * @example
 * ```typescript
 * const analysis = await analyzePerformanceBottlenecks({
 *   performanceData: {
 *     responseTime: { p50: 100, p95: 500, p99: 1000, max: 2000 },
 *     throughput: 100,
 *     errorRate: 0.01,
 *     resourceUsage: { cpu: 85, memory: 1500, disk: 500 }
 *   },
 *   thresholds: {
 *     cpu: 80,
 *     memory: 1024,
 *     responseTime: 200
 *   },
 *   includeRecommendations: true
 * });
 *
 * console.log(`Found ${analysis.bottlenecks.length} bottlenecks`);
 * console.log(`Performance score: ${analysis.performanceScore}/100`);
 * ```
 */
export async function analyzePerformanceBottlenecks(
  params: BottleneckAnalysisParams
): Promise<BottleneckAnalysis> {
  const { performanceData, thresholds, includeRecommendations, historicalData } = params;

  // Detect bottlenecks
  const bottlenecks = detectBottlenecks(performanceData, thresholds);

  // Calculate overall severity
  const overallSeverity = calculateOverallSeverity(bottlenecks);

  // Calculate performance score
  const performanceScore = calculatePerformanceScore(performanceData, thresholds);

  // Analyze resource utilization
  const resourceUtilization = analyzeResourceUtilization(
    performanceData.resourceUsage,
    thresholds
  );

  // Generate recommendations (if requested)
  const recommendations = includeRecommendations
    ? generateRecommendations(bottlenecks, performanceData)
    : undefined;

  // Perform trend analysis (if historical data provided)
  const trends = historicalData
    ? analyzeTrends(performanceData, historicalData)
    : undefined;

  return {
    bottlenecks,
    overallSeverity,
    performanceScore,
    resourceUtilization,
    recommendations,
    trends
  };
}

/**
 * Detect bottlenecks in performance metrics
 */
function detectBottlenecks(
  performanceData: PerformanceMetrics,
  thresholds: BottleneckThresholds
): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];

  // Check CPU bottleneck
  if (performanceData.resourceUsage.cpu > thresholds.cpu) {
    const percentageAbove = ((performanceData.resourceUsage.cpu - thresholds.cpu) / thresholds.cpu) * 100;

    bottlenecks.push({
      type: 'cpu',
      severity: getSeverity(percentageAbove),
      currentValue: performanceData.resourceUsage.cpu,
      thresholdValue: thresholds.cpu,
      percentageAboveThreshold: percentageAbove,
      description: `CPU usage (${performanceData.resourceUsage.cpu.toFixed(1)}%) exceeds threshold (${thresholds.cpu}%)`,
      affectedComponents: ['compute', 'processing']
    });
  }

  // Check memory bottleneck
  if (performanceData.resourceUsage.memory > thresholds.memory) {
    const percentageAbove = ((performanceData.resourceUsage.memory - thresholds.memory) / thresholds.memory) * 100;

    bottlenecks.push({
      type: 'memory',
      severity: getSeverity(percentageAbove),
      currentValue: performanceData.resourceUsage.memory,
      thresholdValue: thresholds.memory,
      percentageAboveThreshold: percentageAbove,
      description: `Memory usage (${performanceData.resourceUsage.memory.toFixed(0)}MB) exceeds threshold (${thresholds.memory}MB)`,
      affectedComponents: ['memory', 'caching']
    });
  }

  // Check response time bottleneck
  if (performanceData.responseTime.p95 > thresholds.responseTime) {
    const percentageAbove = ((performanceData.responseTime.p95 - thresholds.responseTime) / thresholds.responseTime) * 100;

    bottlenecks.push({
      type: 'response-time',
      severity: getSeverity(percentageAbove),
      currentValue: performanceData.responseTime.p95,
      thresholdValue: thresholds.responseTime,
      percentageAboveThreshold: percentageAbove,
      description: `Response time p95 (${performanceData.responseTime.p95.toFixed(0)}ms) exceeds threshold (${thresholds.responseTime}ms)`,
      affectedComponents: ['latency', 'user-experience']
    });
  }

  // Check error rate (if threshold provided)
  if (thresholds.errorRate && performanceData.errorRate > thresholds.errorRate) {
    const percentageAbove = ((performanceData.errorRate - thresholds.errorRate) / thresholds.errorRate) * 100;

    bottlenecks.push({
      type: 'io',
      severity: getSeverity(percentageAbove),
      currentValue: performanceData.errorRate,
      thresholdValue: thresholds.errorRate,
      percentageAboveThreshold: percentageAbove,
      description: `Error rate (${(performanceData.errorRate * 100).toFixed(2)}%) exceeds threshold (${(thresholds.errorRate * 100).toFixed(2)}%)`,
      affectedComponents: ['reliability', 'stability']
    });
  }

  // Check throughput (if threshold provided)
  if (thresholds.throughputMin && performanceData.throughput < thresholds.throughputMin) {
    const percentageBelow = ((thresholds.throughputMin - performanceData.throughput) / thresholds.throughputMin) * 100;

    bottlenecks.push({
      type: 'throughput',
      severity: getSeverity(percentageBelow),
      currentValue: performanceData.throughput,
      thresholdValue: thresholds.throughputMin,
      percentageAboveThreshold: percentageBelow,
      description: `Throughput (${performanceData.throughput.toFixed(1)} req/s) below threshold (${thresholds.throughputMin} req/s)`,
      affectedComponents: ['capacity', 'scalability']
    });
  }

  return bottlenecks;
}

/**
 * Get severity based on percentage above threshold
 */
function getSeverity(percentage: number): 'low' | 'medium' | 'high' | 'critical' {
  if (percentage < 10) return 'low';
  if (percentage < 25) return 'medium';
  if (percentage < 50) return 'high';
  return 'critical';
}

/**
 * Calculate overall severity from bottlenecks
 */
function calculateOverallSeverity(
  bottlenecks: Bottleneck[]
): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  if (bottlenecks.length === 0) return 'none';

  const severityScores = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };

  const maxSeverity = Math.max(...bottlenecks.map(b => severityScores[b.severity]));

  if (maxSeverity === 4) return 'critical';
  if (maxSeverity === 3) return 'high';
  if (maxSeverity === 2) return 'medium';
  return 'low';
}

/**
 * Calculate performance score (0-100)
 */
function calculatePerformanceScore(
  performanceData: PerformanceMetrics,
  thresholds: BottleneckThresholds
): number {
  let score = 100;

  // Deduct points for CPU
  const cpuRatio = performanceData.resourceUsage.cpu / thresholds.cpu;
  if (cpuRatio > 1) {
    score -= Math.min(20, (cpuRatio - 1) * 30);
  }

  // Deduct points for memory
  const memoryRatio = performanceData.resourceUsage.memory / thresholds.memory;
  if (memoryRatio > 1) {
    score -= Math.min(20, (memoryRatio - 1) * 30);
  }

  // Deduct points for response time
  const responseRatio = performanceData.responseTime.p95 / thresholds.responseTime;
  if (responseRatio > 1) {
    score -= Math.min(30, (responseRatio - 1) * 40);
  }

  // Deduct points for error rate
  if (thresholds.errorRate && performanceData.errorRate > thresholds.errorRate) {
    const errorRatio = performanceData.errorRate / thresholds.errorRate;
    score -= Math.min(20, (errorRatio - 1) * 25);
  }

  // Deduct points for throughput
  if (thresholds.throughputMin && performanceData.throughput < thresholds.throughputMin) {
    const throughputRatio = thresholds.throughputMin / performanceData.throughput;
    score -= Math.min(10, (throughputRatio - 1) * 15);
  }

  return Math.max(0, Math.round(score));
}

/**
 * Analyze resource utilization
 */
function analyzeResourceUtilization(
  resourceUsage: ResourceUsage,
  thresholds: BottleneckThresholds
): ResourceUtilizationSummary {
  return {
    cpu: {
      current: resourceUsage.cpu,
      average: resourceUsage.cpu, // In real implementation, calculate from time-series data
      peak: resourceUsage.cpu,
      status: resourceUsage.cpu > thresholds.cpu * 1.2 ? 'critical'
            : resourceUsage.cpu > thresholds.cpu ? 'warning'
            : 'normal'
    },
    memory: {
      current: resourceUsage.memory,
      average: resourceUsage.memory,
      peak: resourceUsage.memory,
      status: resourceUsage.memory > thresholds.memory * 1.2 ? 'critical'
            : resourceUsage.memory > thresholds.memory ? 'warning'
            : 'normal'
    },
    disk: resourceUsage.disk ? {
      current: resourceUsage.disk,
      average: resourceUsage.disk,
      peak: resourceUsage.disk,
      status: 'normal' // No disk threshold defined
    } : undefined,
    network: resourceUsage.network ? {
      current: resourceUsage.network,
      average: resourceUsage.network,
      peak: resourceUsage.network,
      status: 'normal' // No network threshold defined
    } : undefined
  };
}

/**
 * Generate optimization recommendations
 */
function generateRecommendations(
  bottlenecks: Bottleneck[],
  performanceData: PerformanceMetrics
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];

  // CPU optimization recommendations
  const cpuBottleneck = bottlenecks.find(b => b.type === 'cpu');
  if (cpuBottleneck) {
    recommendations.push({
      priority: cpuBottleneck.severity === 'critical' ? 'critical' : 'high',
      category: 'code',
      title: 'Optimize CPU-intensive operations',
      description: 'CPU usage is high. Consider optimizing algorithms, implementing caching, or offloading work to background jobs.',
      expectedImpact: {
        performanceImprovement: 30,
        implementationEffort: 8,
        roiScore: 8
      },
      implementationSteps: [
        'Profile code to identify hotspots',
        'Implement algorithmic optimizations',
        'Add caching for repeated computations',
        'Consider async processing for heavy operations'
      ],
      relatedBottlenecks: ['cpu']
    });
  }

  // Memory optimization recommendations
  const memoryBottleneck = bottlenecks.find(b => b.type === 'memory');
  if (memoryBottleneck) {
    recommendations.push({
      priority: memoryBottleneck.severity === 'critical' ? 'critical' : 'high',
      category: 'code',
      title: 'Reduce memory footprint',
      description: 'Memory usage is high. Check for memory leaks, optimize data structures, and implement pagination.',
      expectedImpact: {
        performanceImprovement: 25,
        implementationEffort: 6,
        roiScore: 7
      },
      implementationSteps: [
        'Run memory profiler to detect leaks',
        'Implement pagination for large datasets',
        'Optimize data structures',
        'Add memory limits and circuit breakers'
      ],
      relatedBottlenecks: ['memory']
    });
  }

  // Response time optimization recommendations
  const responseTimeBottleneck = bottlenecks.find(b => b.type === 'response-time');
  if (responseTimeBottleneck) {
    recommendations.push({
      priority: responseTimeBottleneck.severity === 'critical' ? 'critical' : 'high',
      category: 'architecture',
      title: 'Optimize response times',
      description: 'Response times are high. Consider adding caching, database indexing, or CDN integration.',
      expectedImpact: {
        performanceImprovement: 40,
        implementationEffort: 12,
        roiScore: 9
      },
      implementationSteps: [
        'Add Redis/Memcached for caching',
        'Optimize database queries and add indexes',
        'Implement CDN for static assets',
        'Enable HTTP/2 and compression'
      ],
      relatedBottlenecks: ['response-time']
    });
  }

  return recommendations;
}

/**
 * Analyze trends from historical data
 */
function analyzeTrends(
  current: PerformanceMetrics,
  historical: PerformanceMetrics[]
): TrendAnalysis {
  if (historical.length === 0) {
    return {
      direction: 'stable',
      percentageChange: 0
    };
  }

  // Calculate average of historical data
  const avgHistorical = historical.reduce((sum, h) => sum + h.responseTime.p95, 0) / historical.length;
  const percentageChange = ((current.responseTime.p95 - avgHistorical) / avgHistorical) * 100;

  // Determine trend direction
  let direction: 'improving' | 'stable' | 'degrading';
  if (percentageChange < -5) {
    direction = 'improving';
  } else if (percentageChange > 5) {
    direction = 'degrading';
  } else {
    direction = 'stable';
  }

  return {
    direction,
    percentageChange,
    prediction: {
      expectedPerformance: current.responseTime.p95 * (1 + (percentageChange / 100)),
      confidence: 0.75
    }
  };
}
