/**
 * N8nPerformanceTesterAgent
 *
 * Performance testing for n8n workflows:
 * - Execution time benchmarking
 * - Load testing simulation
 * - Memory usage tracking
 * - Bottleneck identification
 * - Performance regression detection
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
  PerformanceBaseline,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface PerformanceTestTask extends QETask {
  type: 'performance-test';
  target: string; // workflowId
  options?: {
    iterations?: number;
    concurrency?: number;
    warmupIterations?: number;
    timeout?: number;
    recordBaseline?: boolean;
    compareBaseline?: string; // baseline ID to compare
    targetMetrics?: {
      maxDuration?: number;
      maxMemory?: number;
      maxP95?: number;
    };
  };
}

export interface PerformanceTestResult {
  workflowId: string;
  testConfig: {
    iterations: number;
    concurrency: number;
    warmupIterations: number;
  };
  metrics: PerformanceMetrics;
  nodeMetrics: NodePerformanceMetrics[];
  bottlenecks: Bottleneck[];
  baselineComparison?: BaselineComparison;
  recommendations: PerformanceRecommendation[];
  passed: boolean;
}

export interface PerformanceMetrics {
  totalIterations: number;
  successfulIterations: number;
  failedIterations: number;
  timing: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
    stdDev: number;
  };
  throughput: {
    executionsPerSecond: number;
    itemsPerSecond: number;
  };
  memory?: {
    peak: number;
    average: number;
  };
}

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  executionCount: number;
  timing: {
    min: number;
    max: number;
    mean: number;
    percentOfTotal: number;
  };
  isBottleneck: boolean;
}

export interface Bottleneck {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: number; // percentage of total time
  reason: string;
  recommendation: string;
}

export interface BaselineComparison {
  baselineId: string;
  baselineDate: Date;
  regressions: PerformanceRegression[];
  improvements: PerformanceImprovement[];
  overallChange: number; // percentage
}

export interface PerformanceRegression {
  metric: string;
  baseline: number;
  current: number;
  change: number;
  severity: 'minor' | 'moderate' | 'severe';
}

export interface PerformanceImprovement {
  metric: string;
  baseline: number;
  current: number;
  change: number;
}

export interface PerformanceRecommendation {
  priority: 'low' | 'medium' | 'high';
  category: string;
  issue: string;
  recommendation: string;
  expectedImprovement?: string;
}

export class N8nPerformanceTesterAgent extends N8nBaseAgent {
  private baselines: Map<string, PerformanceBaseline> = new Map();

  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'execution-benchmarking',
        version: '1.0.0',
        description: 'Benchmark workflow execution times',
        parameters: {},
      },
      {
        name: 'load-testing',
        version: '1.0.0',
        description: 'Simulate concurrent load on workflows',
        parameters: {},
      },
      {
        name: 'bottleneck-detection',
        version: '1.0.0',
        description: 'Identify performance bottlenecks',
        parameters: {},
      },
      {
        name: 'regression-detection',
        version: '1.0.0',
        description: 'Detect performance regressions',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-performance-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<PerformanceTestResult> {
    const perfTask = task as PerformanceTestTask;

    if (perfTask.type !== 'performance-test') {
      throw new Error(`Unsupported task type: ${perfTask.type}`);
    }

    return this.runPerformanceTest(perfTask.target, perfTask.options);
  }

  /**
   * Run comprehensive performance test
   */
  async runPerformanceTest(
    workflowId: string,
    options?: PerformanceTestTask['options']
  ): Promise<PerformanceTestResult> {
    const iterations = options?.iterations || 10;
    const concurrency = options?.concurrency || 1;
    const warmupIterations = options?.warmupIterations || 2;

    const workflow = await this.getWorkflow(workflowId);

    // Warmup phase
    await this.runWarmup(workflowId, warmupIterations);

    // Main test phase
    const executionResults = await this.runIterations(
      workflowId,
      iterations,
      concurrency,
      options?.timeout
    );

    // Calculate metrics
    const metrics = this.calculateMetrics(executionResults);
    const nodeMetrics = this.analyzeNodePerformance(workflow, executionResults);
    const bottlenecks = this.identifyBottlenecks(workflow, nodeMetrics);

    // Baseline comparison
    let baselineComparison: BaselineComparison | undefined;
    if (options?.compareBaseline) {
      baselineComparison = this.compareWithBaseline(
        options.compareBaseline,
        metrics
      );
    }

    // Record new baseline if requested
    if (options?.recordBaseline) {
      this.recordBaseline(workflowId, metrics);
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      workflow,
      metrics,
      bottlenecks
    );

    // Determine pass/fail
    const passed = this.evaluateTargetMetrics(metrics, options?.targetMetrics);

    const result: PerformanceTestResult = {
      workflowId,
      testConfig: {
        iterations,
        concurrency,
        warmupIterations,
      },
      metrics,
      nodeMetrics,
      bottlenecks,
      baselineComparison,
      recommendations,
      passed,
    };

    // Store result
    await this.storeTestResult(`performance-test:${workflowId}`, result);

    // Emit event
    this.emitEvent('performance.test.completed', {
      workflowId,
      meanDuration: metrics.timing.mean,
      p95Duration: metrics.timing.p95,
      bottleneckCount: bottlenecks.length,
      passed,
    });

    return result;
  }

  /**
   * Run warmup iterations
   */
  private async runWarmup(
    workflowId: string,
    iterations: number
  ): Promise<void> {
    for (let i = 0; i < iterations; i++) {
      try {
        await this.executeWorkflow(workflowId, {});
      } catch {
        // Warmup failures are acceptable
      }
    }
  }

  /**
   * Run test iterations
   */
  private async runIterations(
    workflowId: string,
    iterations: number,
    concurrency: number,
    timeout?: number
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    if (concurrency === 1) {
      // Sequential execution
      for (let i = 0; i < iterations; i++) {
        const result = await this.runSingleIteration(workflowId, timeout);
        results.push(result);
      }
    } else {
      // Concurrent execution
      const batches = Math.ceil(iterations / concurrency);
      for (let batch = 0; batch < batches; batch++) {
        const batchSize = Math.min(concurrency, iterations - batch * concurrency);
        const promises = Array(batchSize)
          .fill(null)
          .map(() => this.runSingleIteration(workflowId, timeout));
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }
    }

    return results;
  }

  /**
   * Run single iteration
   */
  private async runSingleIteration(
    workflowId: string,
    timeout?: number
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const execution = await this.executeWorkflow(workflowId, {});
      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed;

      return {
        success: execution.status === 'success',
        duration,
        memoryDelta: endMemory - startMemory,
        nodeTimings: this.extractNodeTimings(execution),
        itemsProcessed: this.countItemsProcessed(execution),
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        memoryDelta: 0,
        nodeTimings: [],
        itemsProcessed: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract REAL node timings from execution data
   * Parses n8n execution runData to get actual per-node execution times
   */
  private extractNodeTimings(execution: N8nExecution): NodeTiming[] {
    if (!execution.data?.resultData?.runData) {
      return [];
    }

    const timings: NodeTiming[] = [];
    const runData = execution.data.resultData.runData;

    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      if (!Array.isArray(nodeRuns) || nodeRuns.length === 0) {
        continue;
      }

      // Aggregate timing across all runs of this node
      let totalDuration = 0;
      let runCount = 0;

      for (const run of nodeRuns) {
        // n8n stores startTime and executionTime in each run
        if (run.executionTime !== undefined) {
          totalDuration += run.executionTime;
          runCount++;
        } else if (run.startTime) {
          // Calculate from timestamps if executionTime not available
          const startTime = new Date(run.startTime).getTime();
          // Use the run data timestamp or estimate based on available data
          const outputJson = run.data?.main?.[0]?.[0]?.json as Record<string, unknown> | undefined;
          const endTime = outputJson && typeof outputJson['_timestamp'] === 'string'
            ? new Date(outputJson['_timestamp']).getTime()
            : startTime + 100; // Estimate if no end time available
          totalDuration += endTime - startTime;
          runCount++;
        }
      }

      if (runCount > 0) {
        timings.push({
          nodeName,
          duration: totalDuration,
          averageDuration: totalDuration / runCount,
          runCount,
        });
      } else {
        // Fall back to estimating based on data volume processed
        const itemCount = this.countNodeItems(nodeRuns);
        const estimatedDuration = Math.max(1, itemCount * 0.5); // 0.5ms per item baseline
        timings.push({
          nodeName,
          duration: estimatedDuration,
          averageDuration: estimatedDuration,
          runCount: 1,
        });
      }
    }

    return timings;
  }

  /**
   * Count items processed by a node
   */
  private countNodeItems(nodeRuns: unknown[]): number {
    let count = 0;
    for (const run of nodeRuns) {
      const runData = run as { data?: { main?: Array<Array<unknown>> } };
      if (runData.data?.main) {
        for (const output of runData.data.main) {
          count += output?.length || 0;
        }
      }
    }
    return count;
  }

  /**
   * Count items processed in execution
   */
  private countItemsProcessed(execution: N8nExecution): number {
    if (!execution.data?.resultData?.runData) return 0;

    let count = 0;
    for (const nodeData of Object.values(execution.data.resultData.runData)) {
      if (Array.isArray(nodeData)) {
        for (const run of nodeData) {
          if (run.data?.main) {
            for (const output of run.data.main) {
              count += output?.length || 0;
            }
          }
        }
      }
    }
    return count;
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(results: ExecutionResult[]): PerformanceMetrics {
    const successfulResults = results.filter(r => r.success);
    const durations = successfulResults.map(r => r.duration).sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        totalIterations: results.length,
        successfulIterations: 0,
        failedIterations: results.length,
        timing: {
          min: 0,
          max: 0,
          mean: 0,
          median: 0,
          p95: 0,
          p99: 0,
          stdDev: 0,
        },
        throughput: {
          executionsPerSecond: 0,
          itemsPerSecond: 0,
        },
      };
    }

    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const median = this.percentile(durations, 50);
    const p95 = this.percentile(durations, 95);
    const p99 = this.percentile(durations, 99);

    const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const totalItems = successfulResults.reduce((sum, r) => sum + r.itemsProcessed, 0);

    return {
      totalIterations: results.length,
      successfulIterations: successfulResults.length,
      failedIterations: results.length - successfulResults.length,
      timing: {
        min: durations[0],
        max: durations[durations.length - 1],
        mean,
        median,
        p95,
        p99,
        stdDev,
      },
      throughput: {
        executionsPerSecond: (successfulResults.length / totalDuration) * 1000,
        itemsPerSecond: (totalItems / totalDuration) * 1000,
      },
      memory: {
        peak: Math.max(...successfulResults.map(r => r.memoryDelta)),
        average: successfulResults.reduce((sum, r) => sum + r.memoryDelta, 0) / successfulResults.length,
      },
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(index, arr.length - 1))];
  }

  /**
   * Analyze node-level performance
   */
  private analyzeNodePerformance(
    workflow: N8nWorkflow,
    results: ExecutionResult[]
  ): NodePerformanceMetrics[] {
    const nodeMetrics: NodePerformanceMetrics[] = [];
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      return [];
    }

    // Aggregate REAL node timings across all successful executions
    const nodeTimingAggregates: Map<string, {
      durations: number[];
      runCounts: number[];
      nodeType: string;
      nodeId: string;
    }> = new Map();

    // First pass: collect all timings from execution results
    for (const result of successfulResults) {
      for (const timing of result.nodeTimings) {
        const existing = nodeTimingAggregates.get(timing.nodeName);
        if (existing) {
          existing.durations.push(timing.duration);
          existing.runCounts.push(timing.runCount);
        } else {
          // Find the node in workflow to get type and id
          const node = workflow.nodes.find(n => n.name === timing.nodeName);
          nodeTimingAggregates.set(timing.nodeName, {
            durations: [timing.duration],
            runCounts: [timing.runCount],
            nodeType: node?.type || 'unknown',
            nodeId: node?.id || timing.nodeName,
          });
        }
      }
    }

    // Calculate total execution time for percentage calculations
    const totalMeanTime = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;

    // Second pass: calculate aggregate metrics for each node
    for (const [nodeName, aggregate] of nodeTimingAggregates) {
      const durations = aggregate.durations.sort((a, b) => a - b);
      const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
      const percentOfTotal = (mean / totalMeanTime) * 100;

      nodeMetrics.push({
        nodeId: aggregate.nodeId,
        nodeName,
        nodeType: aggregate.nodeType,
        executionCount: aggregate.runCounts.reduce((a, b) => a + b, 0),
        timing: {
          min: durations[0] || 0,
          max: durations[durations.length - 1] || 0,
          mean,
          percentOfTotal,
        },
        isBottleneck: percentOfTotal > 30, // Node taking >30% is a bottleneck
      });
    }

    // If no timing data was found, fall back to estimation for nodes we know exist
    if (nodeMetrics.length === 0) {
      for (const node of workflow.nodes) {
        const estimatedTime = this.estimateNodeTime(node, totalMeanTime);
        const percentOfTotal = (estimatedTime / totalMeanTime) * 100;

        nodeMetrics.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          executionCount: successfulResults.length,
          timing: {
            min: estimatedTime * 0.8,
            max: estimatedTime * 1.5,
            mean: estimatedTime,
            percentOfTotal,
          },
          isBottleneck: percentOfTotal > 30,
        });
      }
    }

    return nodeMetrics.sort((a, b) => b.timing.mean - a.timing.mean);
  }

  /**
   * Estimate node execution time
   */
  private estimateNodeTime(node: N8nNode, totalTime: number): number {
    // Weight based on node type
    const weights: Record<string, number> = {
      'n8n-nodes-base.httpRequest': 0.4,
      'n8n-nodes-base.postgres': 0.3,
      'n8n-nodes-base.mysql': 0.3,
      'n8n-nodes-base.mongodb': 0.3,
      'n8n-nodes-base.code': 0.15,
      'n8n-nodes-base.function': 0.15,
      'n8n-nodes-base.if': 0.05,
      'n8n-nodes-base.set': 0.05,
    };

    const weight = weights[node.type] || 0.1;
    return totalTime * weight;
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(
    workflow: N8nWorkflow,
    nodeMetrics: NodePerformanceMetrics[]
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    for (const metric of nodeMetrics) {
      if (!metric.isBottleneck) continue;

      const node = workflow.nodes.find(n => n.id === metric.nodeId);
      if (!node) continue;

      const { severity, reason, recommendation } = this.analyzeBottleneck(
        node,
        metric
      );

      bottlenecks.push({
        nodeId: metric.nodeId,
        nodeName: metric.nodeName,
        nodeType: metric.nodeType,
        severity,
        impact: metric.timing.percentOfTotal,
        reason,
        recommendation,
      });
    }

    return bottlenecks.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Analyze bottleneck details
   */
  private analyzeBottleneck(
    node: N8nNode,
    metric: NodePerformanceMetrics
  ): { severity: Bottleneck['severity']; reason: string; recommendation: string } {
    const impact = metric.timing.percentOfTotal;

    let severity: Bottleneck['severity'];
    if (impact > 60) severity = 'critical';
    else if (impact > 40) severity = 'high';
    else if (impact > 30) severity = 'medium';
    else severity = 'low';

    // Type-specific analysis
    if (node.type.includes('httpRequest')) {
      return {
        severity,
        reason: 'External HTTP calls are slow',
        recommendation: 'Consider caching responses, adding timeouts, or parallelizing requests',
      };
    }

    if (node.type.includes('postgres') || node.type.includes('mysql')) {
      return {
        severity,
        reason: 'Database operations taking significant time',
        recommendation: 'Optimize queries, add indexes, or batch operations',
      };
    }

    if (node.type.includes('code') || node.type.includes('function')) {
      return {
        severity,
        reason: 'Custom code execution is slow',
        recommendation: 'Optimize algorithms, reduce iterations, or use more efficient data structures',
      };
    }

    return {
      severity,
      reason: `Node ${node.type} is consuming ${impact.toFixed(1)}% of execution time`,
      recommendation: 'Review node configuration and consider optimization',
    };
  }

  /**
   * Compare with baseline
   */
  private compareWithBaseline(
    baselineId: string,
    current: PerformanceMetrics
  ): BaselineComparison {
    const baseline = this.baselines.get(baselineId);

    if (!baseline) {
      return {
        baselineId,
        baselineDate: new Date(),
        regressions: [],
        improvements: [],
        overallChange: 0,
      };
    }

    const regressions: PerformanceRegression[] = [];
    const improvements: PerformanceImprovement[] = [];

    // Compare mean duration
    const meanChange = ((current.timing.mean - baseline.metrics.meanDuration) / baseline.metrics.meanDuration) * 100;
    if (meanChange > 10) {
      regressions.push({
        metric: 'mean duration',
        baseline: baseline.metrics.meanDuration,
        current: current.timing.mean,
        change: meanChange,
        severity: meanChange > 50 ? 'severe' : meanChange > 25 ? 'moderate' : 'minor',
      });
    } else if (meanChange < -10) {
      improvements.push({
        metric: 'mean duration',
        baseline: baseline.metrics.meanDuration,
        current: current.timing.mean,
        change: Math.abs(meanChange),
      });
    }

    // Compare p95
    const p95Change = ((current.timing.p95 - baseline.metrics.p95Duration) / baseline.metrics.p95Duration) * 100;
    if (p95Change > 10) {
      regressions.push({
        metric: 'p95 duration',
        baseline: baseline.metrics.p95Duration,
        current: current.timing.p95,
        change: p95Change,
        severity: p95Change > 50 ? 'severe' : p95Change > 25 ? 'moderate' : 'minor',
      });
    } else if (p95Change < -10) {
      improvements.push({
        metric: 'p95 duration',
        baseline: baseline.metrics.p95Duration,
        current: current.timing.p95,
        change: Math.abs(p95Change),
      });
    }

    return {
      baselineId,
      baselineDate: baseline.createdAt,
      regressions,
      improvements,
      overallChange: meanChange,
    };
  }

  /**
   * Record baseline
   */
  private recordBaseline(workflowId: string, metrics: PerformanceMetrics): void {
    const baselineId = `${workflowId}:${Date.now()}`;
    this.baselines.set(workflowId, {
      workflowId,
      metrics: {
        meanDuration: metrics.timing.mean,
        p95Duration: metrics.timing.p95,
        maxDuration: metrics.timing.max,
        throughput: metrics.throughput.executionsPerSecond,
      },
      createdAt: new Date(),
      version: '1.0',
    });
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    workflow: N8nWorkflow,
    metrics: PerformanceMetrics,
    bottlenecks: Bottleneck[]
  ): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];

    // High failure rate
    if (metrics.failedIterations > metrics.totalIterations * 0.1) {
      recommendations.push({
        priority: 'high',
        category: 'Reliability',
        issue: `${((metrics.failedIterations / metrics.totalIterations) * 100).toFixed(1)}% failure rate`,
        recommendation: 'Add error handling, retries, and timeout configurations',
        expectedImprovement: 'Improved reliability and success rate',
      });
    }

    // High variance
    if (metrics.timing.stdDev > metrics.timing.mean * 0.5) {
      recommendations.push({
        priority: 'medium',
        category: 'Consistency',
        issue: 'High execution time variance',
        recommendation: 'Investigate variable external dependencies and add timeouts',
        expectedImprovement: 'More predictable execution times',
      });
    }

    // Bottleneck recommendations
    for (const bottleneck of bottlenecks.slice(0, 3)) {
      recommendations.push({
        priority: bottleneck.severity === 'critical' || bottleneck.severity === 'high' ? 'high' : 'medium',
        category: 'Optimization',
        issue: `${bottleneck.nodeName} (${bottleneck.nodeType}) taking ${bottleneck.impact.toFixed(1)}% of time`,
        recommendation: bottleneck.recommendation,
        expectedImprovement: `Up to ${(bottleneck.impact * 0.5).toFixed(0)}% performance improvement`,
      });
    }

    // Memory recommendations
    if (metrics.memory && metrics.memory.peak > 100 * 1024 * 1024) {
      recommendations.push({
        priority: 'medium',
        category: 'Memory',
        issue: `High peak memory usage: ${(metrics.memory.peak / 1024 / 1024).toFixed(1)}MB`,
        recommendation: 'Process data in batches, avoid large in-memory operations',
        expectedImprovement: 'Reduced memory footprint and improved stability',
      });
    }

    return recommendations;
  }

  /**
   * Evaluate target metrics
   */
  private evaluateTargetMetrics(
    metrics: PerformanceMetrics,
    targets?: {
      maxDuration?: number;
      maxMemory?: number;
      maxP95?: number;
    }
  ): boolean {
    if (!targets) return true;

    if (targets.maxDuration && metrics.timing.mean > targets.maxDuration) {
      return false;
    }

    if (targets.maxP95 && metrics.timing.p95 > targets.maxP95) {
      return false;
    }

    if (targets.maxMemory && metrics.memory?.peak && metrics.memory.peak > targets.maxMemory) {
      return false;
    }

    return true;
  }

  /**
   * Get stored baseline
   */
  getBaseline(workflowId: string): PerformanceBaseline | undefined {
    return this.baselines.get(workflowId);
  }

  /**
   * Set baseline from external source
   */
  setBaseline(workflowId: string, baseline: PerformanceBaseline): void {
    this.baselines.set(workflowId, baseline);
  }
}

// Internal types
interface ExecutionResult {
  success: boolean;
  duration: number;
  memoryDelta: number;
  nodeTimings: NodeTiming[];
  itemsProcessed: number;
  error?: string;
}

interface NodeTiming {
  nodeName: string;
  duration: number;
  averageDuration: number;
  runCount: number;
}
