/**
 * Performance Test Setup and Teardown Procedures
 * Manages performance monitoring, resource tracking, and benchmark data collection
 */

import { EventEmitter } from 'events';
import { performance, PerformanceObserver } from 'perf_hooks';

export interface PerformanceTestEnvironment {
  startMonitoring(): Promise<void>;
  stopMonitoring(): Promise<PerformanceReport>;
  cleanup(): Promise<void>;
  markStart(label: string): void;
  markEnd(label: string): number;
  getMetrics(): PerformanceMetrics;
}

export interface PerformanceMetrics {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpu: {
    userTime: number;
    systemTime: number;
    totalTime: number;
  };
  gc: {
    collections: number;
    totalTime: number;
    avgTime: number;
  };
  operations: {
    completed: number;
    failed: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
  };
  network: {
    requests: number;
    errors: number;
    avgResponseTime: number;
  };
}

export interface PerformanceReport {
  testName: string;
  duration: number;
  startTime: Date;
  endTime: Date;
  metrics: PerformanceMetrics;
  marks: PerformanceMark[];
  measures: PerformanceMeasure[];
  memorySnapshots: MemorySnapshot[];
  recommendations: string[];
  warnings: string[];
}

export interface PerformanceMark {
  name: string;
  timestamp: number;
  duration?: number;
}

export interface PerformanceMeasure {
  name: string;
  startMark: string;
  endMark: string;
  duration: number;
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface PerformanceThresholds {
  maxMemoryMB: number;
  maxExecutionTimeMs: number;
  maxGCTime: number;
  maxResponseTimeMs: number;
  minThroughputOps: number;
}

class PerformanceTestManager extends EventEmitter implements PerformanceTestEnvironment {
  private testName: string;
  private startTime: Date;
  private endTime?: Date;
  private marks: Map<string, PerformanceMark> = new Map();
  private measures: PerformanceMeasure[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private performanceObserver?: PerformanceObserver;
  private monitoringInterval?: NodeJS.Timeout;
  private gcObserver?: PerformanceObserver;
  private operationTimes: number[] = [];
  private networkMetrics = {
    requests: 0,
    errors: 0,
    responseTimes: [] as number[]
  };
  private thresholds: PerformanceThresholds;
  private gcMetrics = {
    collections: 0,
    totalTime: 0
  };

  constructor(testName: string, thresholds: PerformanceThresholds) {
    super();
    this.testName = testName;
    this.startTime = new Date();
    this.thresholds = thresholds;
  }

  async startMonitoring(): Promise<void> {
    this.emit('monitoring:started');
    
    // Setup performance observer for marks and measures
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === 'mark') {
          this.marks.set(entry.name, {
            name: entry.name,
            timestamp: entry.startTime
          });
        } else if (entry.entryType === 'measure') {
          this.measures.push({
            name: entry.name,
            startMark: entry.name,
            endMark: entry.name,
            duration: entry.duration
          });
        }
      }
    });
    
    this.performanceObserver.observe({ entryTypes: ['mark', 'measure'] });

    // Setup GC observer if available
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            this.gcMetrics.collections++;
            this.gcMetrics.totalTime += entry.duration;
          }
        }
      });
      
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch (error) {
      // GC observer not available in all Node.js versions
      console.warn('GC performance monitoring not available');
    }

    // Start periodic memory monitoring
    this.monitoringInterval = setInterval(() => {
      this.captureMemorySnapshot();
    }, 100); // Capture every 100ms

    // Setup network monitoring
    this.setupNetworkMonitoring();

    // Initial memory snapshot
    this.captureMemorySnapshot();
  }

  async stopMonitoring(): Promise<PerformanceReport> {
    this.endTime = new Date();
    this.emit('monitoring:stopped');

    // Stop observers and intervals
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    if (this.gcObserver) {
      this.gcObserver.disconnect();
    }
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Final memory snapshot
    this.captureMemorySnapshot();

    // Generate report
    const report = this.generateReport();
    this.emit('report:generated', report);
    
    return report;
  }

  markStart(label: string): void {
    const markName = `${label}-start`;
    performance.mark(markName);
    
    this.marks.set(markName, {
      name: markName,
      timestamp: performance.now()
    });
  }

  markEnd(label: string): number {
    const startMarkName = `${label}-start`;
    const endMarkName = `${label}-end`;
    const measureName = `${label}-duration`;
    
    performance.mark(endMarkName);
    performance.measure(measureName, startMarkName, endMarkName);
    
    const startMark = this.marks.get(startMarkName);
    const endTimestamp = performance.now();
    
    if (startMark) {
      const duration = endTimestamp - startMark.timestamp;
      
      this.marks.set(endMarkName, {
        name: endMarkName,
        timestamp: endTimestamp,
        duration
      });
      
      this.operationTimes.push(duration);
      
      return duration;
    }
    
    return 0;
  }

  private captureMemorySnapshot(): void {
    const memUsage = process.memoryUsage();
    
    this.memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    });
  }

  private setupNetworkMonitoring(): void {
    // Mock network monitoring by intercepting common HTTP libraries
    const originalFetch = global.fetch;
    
    if (originalFetch) {
      global.fetch = async (...args) => {
        const startTime = performance.now();
        this.networkMetrics.requests++;
        
        try {
          const response = await originalFetch(...args);
          const endTime = performance.now();
          
          this.networkMetrics.responseTimes.push(endTime - startTime);
          
          if (!response.ok) {
            this.networkMetrics.errors++;
          }
          
          return response;
        } catch (error) {
          this.networkMetrics.errors++;
          throw error;
        }
      };
    }
  }

  getMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      cpu: {
        userTime: cpuUsage.user,
        systemTime: cpuUsage.system,
        totalTime: cpuUsage.user + cpuUsage.system
      },
      gc: {
        collections: this.gcMetrics.collections,
        totalTime: this.gcMetrics.totalTime,
        avgTime: this.gcMetrics.collections > 0 ? this.gcMetrics.totalTime / this.gcMetrics.collections : 0
      },
      operations: {
        completed: this.operationTimes.length,
        failed: 0, // Would need to be tracked separately
        avgDuration: this.operationTimes.length > 0 ? 
          this.operationTimes.reduce((sum, time) => sum + time, 0) / this.operationTimes.length : 0,
        maxDuration: this.operationTimes.length > 0 ? Math.max(...this.operationTimes) : 0,
        minDuration: this.operationTimes.length > 0 ? Math.min(...this.operationTimes) : 0
      },
      network: {
        requests: this.networkMetrics.requests,
        errors: this.networkMetrics.errors,
        avgResponseTime: this.networkMetrics.responseTimes.length > 0 ?
          this.networkMetrics.responseTimes.reduce((sum, time) => sum + time, 0) / this.networkMetrics.responseTimes.length : 0
      }
    };
  }

  private generateReport(): PerformanceReport {
    const metrics = this.getMetrics();
    const duration = this.endTime ? this.endTime.getTime() - this.startTime.getTime() : 0;
    
    const recommendations = this.generateRecommendations(metrics, duration);
    const warnings = this.generateWarnings(metrics, duration);
    
    return {
      testName: this.testName,
      duration,
      startTime: this.startTime,
      endTime: this.endTime || new Date(),
      metrics,
      marks: Array.from(this.marks.values()),
      measures: this.measures,
      memorySnapshots: this.memorySnapshots,
      recommendations,
      warnings
    };
  }

  private generateRecommendations(metrics: PerformanceMetrics, duration: number): string[] {
    const recommendations: string[] = [];
    
    // Memory recommendations
    const heapUsedMB = metrics.memory.heapUsed / 1024 / 1024;
    if (heapUsedMB > this.thresholds.maxMemoryMB * 0.8) {
      recommendations.push(`Memory usage is high (${heapUsedMB.toFixed(1)}MB). Consider optimizing memory allocation.`);
    }
    
    // Performance recommendations
    if (metrics.operations.avgDuration > this.thresholds.maxExecutionTimeMs * 0.8) {
      recommendations.push(`Average operation time is high (${metrics.operations.avgDuration.toFixed(1)}ms). Consider optimization.`);
    }
    
    // GC recommendations
    if (metrics.gc.avgTime > this.thresholds.maxGCTime) {
      recommendations.push(`Garbage collection time is high (${metrics.gc.avgTime.toFixed(1)}ms). Review object allocation patterns.`);
    }
    
    // Network recommendations
    if (metrics.network.avgResponseTime > this.thresholds.maxResponseTimeMs) {
      recommendations.push(`Network response time is slow (${metrics.network.avgResponseTime.toFixed(1)}ms). Consider caching or optimization.`);
    }
    
    return recommendations;
  }

  private generateWarnings(metrics: PerformanceMetrics, duration: number): string[] {
    const warnings: string[] = [];
    
    // Memory warnings
    const heapUsedMB = metrics.memory.heapUsed / 1024 / 1024;
    if (heapUsedMB > this.thresholds.maxMemoryMB) {
      warnings.push(`Memory threshold exceeded: ${heapUsedMB.toFixed(1)}MB > ${this.thresholds.maxMemoryMB}MB`);
    }
    
    // Duration warnings
    if (duration > this.thresholds.maxExecutionTimeMs) {
      warnings.push(`Execution time threshold exceeded: ${duration}ms > ${this.thresholds.maxExecutionTimeMs}ms`);
    }
    
    // Network error warnings
    if (metrics.network.errors > 0) {
      warnings.push(`Network errors detected: ${metrics.network.errors} out of ${metrics.network.requests} requests`);
    }
    
    return warnings;
  }

  async cleanup(): Promise<void> {
    this.emit('cleanup:started');
    
    // Restore original fetch if it was mocked
    if (global.fetch && global.fetch !== fetch) {
      // Restore would need original reference
    }
    
    // Clear all intervals and observers
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    if (this.gcObserver) {
      this.gcObserver.disconnect();
    }
    
    // Clear performance marks and measures
    performance.clearMarks();
    performance.clearMeasures();
    
    this.emit('cleanup:completed');
    this.removeAllListeners();
  }
}

// Default performance thresholds
export const PERFORMANCE_THRESHOLDS = {
  unit: {
    maxMemoryMB: 50,
    maxExecutionTimeMs: 1000,
    maxGCTime: 10,
    maxResponseTimeMs: 100,
    minThroughputOps: 100
  },
  
  integration: {
    maxMemoryMB: 128,
    maxExecutionTimeMs: 5000,
    maxGCTime: 50,
    maxResponseTimeMs: 500,
    minThroughputOps: 50
  },
  
  e2e: {
    maxMemoryMB: 256,
    maxExecutionTimeMs: 30000,
    maxGCTime: 100,
    maxResponseTimeMs: 1000,
    minThroughputOps: 10
  }
};

// Global performance test manager
let globalPerformanceManager: PerformanceTestManager | null = null;

/**
 * Setup performance monitoring for tests
 */
export async function setupPerformanceMonitoring(
  testName: string,
  thresholds: PerformanceThresholds = PERFORMANCE_THRESHOLDS.integration
): Promise<PerformanceTestEnvironment> {
  if (globalPerformanceManager) {
    await globalPerformanceManager.cleanup();
  }
  
  globalPerformanceManager = new PerformanceTestManager(testName, thresholds);
  await globalPerformanceManager.startMonitoring();
  
  return globalPerformanceManager;
}

/**
 * Stop performance monitoring and get report
 */
export async function getPerformanceReport(): Promise<PerformanceReport | null> {
  if (!globalPerformanceManager) {
    return null;
  }
  
  const report = await globalPerformanceManager.stopMonitoring();
  await globalPerformanceManager.cleanup();
  globalPerformanceManager = null;
  
  return report;
}

/**
 * Create isolated performance monitor for specific test
 */
export async function createPerformanceMonitor(
  testName: string,
  thresholds?: PerformanceThresholds
): Promise<PerformanceTestEnvironment> {
  const monitor = new PerformanceTestManager(
    testName,
    thresholds || PERFORMANCE_THRESHOLDS.integration
  );
  
  await monitor.startMonitoring();
  return monitor;
}

/**
 * Jest hooks for performance monitoring
 */
export const performanceTestHooks = {
  beforeAll: async (testSuiteName: string, thresholds?: PerformanceThresholds) => {
    await setupPerformanceMonitoring(testSuiteName, thresholds);
  },
  
  afterAll: async () => {
    const report = await getPerformanceReport();
    
    if (report) {
      // Log performance summary
      console.log(`\n📊 Performance Report for ${report.testName}:`);
      console.log(`Duration: ${report.duration}ms`);
      console.log(`Memory Peak: ${(report.metrics.memory.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      console.log(`Operations: ${report.metrics.operations.completed}`);
      console.log(`Avg Operation Time: ${report.metrics.operations.avgDuration.toFixed(1)}ms`);
      
      if (report.warnings.length > 0) {
        console.warn('⚠️ Performance Warnings:');
        report.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }
      
      if (report.recommendations.length > 0) {
        console.info('💡 Performance Recommendations:');
        report.recommendations.forEach(rec => console.info(`  - ${rec}`));
      }
    }
  },
  
  beforeEach: (testName: string) => {
    if (globalPerformanceManager) {
      globalPerformanceManager.markStart(testName);
    }
  },
  
  afterEach: (testName: string) => {
    if (globalPerformanceManager) {
      const duration = globalPerformanceManager.markEnd(testName);
      
      if (duration > PERFORMANCE_THRESHOLDS.integration.maxExecutionTimeMs) {
        console.warn(`⚠️ Test "${testName}" exceeded time threshold: ${duration.toFixed(1)}ms`);
      }
    }
  }
};

// Export manager class for custom usage
export { PerformanceTestManager };