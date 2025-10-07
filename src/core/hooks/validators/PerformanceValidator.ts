/**
 * PerformanceValidator - Validates performance metrics and detects regressions
 */

export interface PerformanceValidationOptions {
  metrics: {
    executionTime?: number;
    memoryUsage?: number;
    totalOperations?: number;
    latencies?: number[];
  };
  thresholds?: {
    maxExecutionTime?: number;
    maxMemoryMB?: number;
    minThroughput?: number;
    p50?: number;
    p95?: number;
    p99?: number;
  };
  baseline?: {
    executionTime?: number;
    memoryUsage?: number;
  };
  regressionThreshold?: number;
}

export interface PerformanceValidationResult {
  valid: boolean;
  validations: string[];
  regressions?: Record<string, number>;
  details: {
    throughput?: number;
    percentiles?: Record<string, number>;
    passed?: Record<string, boolean>;
  };
}

export class PerformanceValidator {
  async validate(options: PerformanceValidationOptions): Promise<PerformanceValidationResult> {
    const validations: string[] = ['performance'];
    const details: PerformanceValidationResult['details'] = {
      passed: {}
    };

    let valid = true;
    let regressions: Record<string, number> | undefined;

    // Validate execution time
    if (options.thresholds?.maxExecutionTime !== undefined && options.metrics.executionTime !== undefined) {
      details.passed!.executionTime = options.metrics.executionTime <= options.thresholds.maxExecutionTime;
      if (!details.passed!.executionTime) {
        valid = false;
      }
    }

    // Validate memory usage
    if (options.thresholds?.maxMemoryMB !== undefined && options.metrics.memoryUsage !== undefined) {
      const memoryMB = options.metrics.memoryUsage / (1024 * 1024);
      details.passed!.memory = memoryMB <= options.thresholds.maxMemoryMB;
      if (!details.passed!.memory) {
        valid = false;
      }
    }

    // Calculate and validate throughput
    if (options.metrics.totalOperations !== undefined && options.metrics.executionTime !== undefined) {
      const throughput = (options.metrics.totalOperations / options.metrics.executionTime) * 1000; // ops/sec
      details.throughput = throughput;

      if (options.thresholds?.minThroughput !== undefined) {
        details.passed!.throughput = throughput >= options.thresholds.minThroughput;
        if (!details.passed!.throughput) {
          valid = false;
        }
      }
    }

    // Validate latency percentiles
    if (options.metrics.latencies && options.metrics.latencies.length > 0) {
      const sortedLatencies = [...options.metrics.latencies].sort((a, b) => a - b);
      details.percentiles = {
        p50: this.percentile(sortedLatencies, 50),
        p95: this.percentile(sortedLatencies, 95),
        p99: this.percentile(sortedLatencies, 99)
      };

      if (options.thresholds?.p50 !== undefined) {
        details.passed!.p50 = details.percentiles.p50 <= options.thresholds.p50;
        if (!details.passed!.p50) valid = false;
      }

      if (options.thresholds?.p95 !== undefined) {
        details.passed!.p95 = details.percentiles.p95 <= options.thresholds.p95;
        if (!details.passed!.p95) valid = false;
      }

      if (options.thresholds?.p99 !== undefined) {
        details.passed!.p99 = details.percentiles.p99 <= options.thresholds.p99;
        if (!details.passed!.p99) valid = false;
      }
    }

    // Detect regressions from baseline
    if (options.baseline && options.regressionThreshold !== undefined) {
      validations.push('regression-detection');
      regressions = {};

      if (options.baseline.executionTime !== undefined && options.metrics.executionTime !== undefined) {
        const regression = (options.metrics.executionTime - options.baseline.executionTime) / options.baseline.executionTime;
        regressions.executionTime = regression;

        if (regression > options.regressionThreshold) {
          valid = false;
        }
      }

      if (options.baseline.memoryUsage !== undefined && options.metrics.memoryUsage !== undefined) {
        const regression = (options.metrics.memoryUsage - options.baseline.memoryUsage) / options.baseline.memoryUsage;
        regressions.memoryUsage = regression;

        if (regression > options.regressionThreshold) {
          valid = false;
        }
      }
    }

    return {
      valid,
      validations,
      regressions,
      details
    };
  }

  private percentile(sortedArray: number[], p: number): number {
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }
}
