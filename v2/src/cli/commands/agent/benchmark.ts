/**
 * Agent Benchmark Command
 * Benchmark agent performance with detailed metrics
 */

import { FleetManager } from '../../../core/FleetManager';
import { Task, TaskPriority } from '../../../core/Task';
import { Logger } from '../../../utils/Logger';
import { SecureRandom } from '../../../utils/SecureRandom.js';

export interface BenchmarkOptions {
  fleetManager: FleetManager;
  agentId: string;
  iterations?: number;
  baseline?: BenchmarkBaseline;
}

interface BenchmarkBaseline {
  averageLatency: number;
  throughput: number;
}

export interface BenchmarkResult {
  success: boolean;
  averageLatency: number;
  throughput: number;
  taskMetrics: TaskMetrics;
  percentiles: Percentiles;
  comparison?: ComparisonResult;
  error?: string;
}

interface TaskMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgCompletionTime: number;
  minCompletionTime: number;
  maxCompletionTime: number;
}

interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
}

interface ComparisonResult {
  improvement: number;
  latencyDiff: number;
  throughputDiff: number;
}

export async function benchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
  const logger = Logger.getInstance();
  const iterations = options.iterations || 10;

  try {
    const agent = options.fleetManager.getAgent(options.agentId);
    if (!agent) {
      throw new Error(`Agent ${options.agentId} not found`);
    }

    const latencies: number[] = [];
    const completionTimes: number[] = [];
    let completedTasks = 0;
    let failedTasks = 0;

    const startTime = Date.now();

    // Run benchmark iterations
    for (let i = 0; i < iterations; i++) {
      const iterationStart = Date.now();

      // Create test task
      const task = new Task(
        'benchmark',
        `Benchmark task ${i}`,
        { benchmarkIteration: i },
        {},
        TaskPriority.MEDIUM
      );

      try {
        await agent.assignTask(task);

        // Wait for task completion (simplified)
        await new Promise(resolve => setTimeout(resolve, 50 + SecureRandom.randomFloat() * 100));

        const iterationEnd = Date.now();
        const latency = iterationEnd - iterationStart;

        latencies.push(latency);
        completionTimes.push(latency);
        completedTasks++;

      } catch (error) {
        failedTasks++;
        logger.warn(`Benchmark iteration ${i} failed:`, error);
      }
    }

    const totalDuration = Date.now() - startTime;

    // Calculate metrics
    const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const throughput = (completedTasks / totalDuration) * 1000; // tasks per second

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const percentiles: Percentiles = {
      p50: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0,
      p95: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
      p99: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0
    };

    const taskMetrics: TaskMetrics = {
      totalTasks: iterations,
      completedTasks,
      failedTasks,
      avgCompletionTime: averageLatency,
      minCompletionTime: Math.min(...completionTimes),
      maxCompletionTime: Math.max(...completionTimes)
    };

    // Compare with baseline if provided
    let comparison: ComparisonResult | undefined;
    if (options.baseline) {
      const latencyDiff = averageLatency - options.baseline.averageLatency;
      const throughputDiff = throughput - options.baseline.throughput;
      const improvement = ((options.baseline.averageLatency - averageLatency) / options.baseline.averageLatency) * 100;

      comparison = {
        improvement: parseFloat(improvement.toFixed(2)),
        latencyDiff: parseFloat(latencyDiff.toFixed(2)),
        throughputDiff: parseFloat(throughputDiff.toFixed(2))
      };
    }

    logger.info(`Benchmark complete: ${averageLatency.toFixed(2)}ms avg, ${throughput.toFixed(2)} tasks/sec`);

    return {
      success: true,
      averageLatency: parseFloat(averageLatency.toFixed(2)),
      throughput: parseFloat(throughput.toFixed(2)),
      taskMetrics,
      percentiles,
      comparison
    };

  } catch (error) {
    logger.error('Failed to benchmark agent:', error);
    return {
      success: false,
      averageLatency: 0,
      throughput: 0,
      taskMetrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        avgCompletionTime: 0,
        minCompletionTime: 0,
        maxCompletionTime: 0
      },
      percentiles: { p50: 0, p95: 0, p99: 0 },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
