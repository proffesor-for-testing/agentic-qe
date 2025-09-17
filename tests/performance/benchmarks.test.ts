/**
 * Performance Benchmarks for Claude Flow Integration Tests
 * Comprehensive performance testing with realistic load simulation,
 * memory usage analysis, and scalability validation
 */

import { QEMemory } from '../../src/memory/QEMemory';
import { TaskExecutor } from '../../src/advanced/task-executor';
import { EnhancedMockMemory, EnhancedMockTaskExecutor } from '../mocks/enhanced-mocks';
import { Logger } from '../../src/utils/Logger';
import { QEMemoryEntry, MemoryType, QEAgent, TestResult } from '../../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Performance Test Configuration
interface BenchmarkConfig {
  warmupIterations: number;
  measurementIterations: number;
  timeoutMs: number;
  memoryThresholdMB: number;
  cpuThresholdPercent: number;
}

interface BenchmarkResult {
  testName: string;
  averageTime: number;
  minTime: number;
  maxTime: number;
  standardDeviation: number;
  throughput: number;
  memoryUsage: {
    peak: number;
    average: number;
    final: number;
  };
  cpuUsage: {
    average: number;
    peak: number;
  };
  successRate: number;
  iterations: number;
}

interface LoadTestResult {
  testName: string;
  concurrency: number;
  totalOperations: number;
  duration: number;
  throughput: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  memoryEfficiency: number;
}

// Performance Testing Utilities
class PerformanceBenchmark {
  private static measureMemory(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // Convert to MB
  }

  private static measureCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime.bigint();
      
      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const currentTime = process.hrtime.bigint();
        const elapsedTime = Number(currentTime - startTime) / 1000000; // Convert to ms
        
        const cpuPercent = (currentUsage.user + currentUsage.system) / 1000 / elapsedTime * 100;
        resolve(Math.min(cpuPercent, 100)); // Cap at 100%
      }, 100);
    });
  }

  static async runBenchmark<T>(
    testName: string,
    operation: () => Promise<T>,
    config: BenchmarkConfig
  ): Promise<BenchmarkResult> {
    console.log(`\n🚀 Running benchmark: ${testName}`);
    
    // Warmup
    console.log(`  Warming up (${config.warmupIterations} iterations)...`);
    for (let i = 0; i < config.warmupIterations; i++) {
      try {
        await operation();
      } catch (error) {
        // Ignore warmup errors
      }
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    const times: number[] = [];
    const memoryReadings: number[] = [];
    const cpuReadings: number[] = [];
    let successCount = 0;
    
    const initialMemory = this.measureMemory();
    
    console.log(`  Measuring (${config.measurementIterations} iterations)...`);
    
    for (let i = 0; i < config.measurementIterations; i++) {
      const memoryBefore = this.measureMemory();
      const cpuPromise = this.measureCpuUsage();
      
      const startTime = process.hrtime.bigint();
      
      try {
        await Promise.race([
          operation(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), config.timeoutMs)
          )
        ]);
        
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to ms
        
        times.push(duration);
        successCount++;
        
      } catch (error) {
        // Record failed operations
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        times.push(duration);
      }
      
      const memoryAfter = this.measureMemory();
      const cpuUsage = await cpuPromise;
      
      memoryReadings.push(memoryAfter);
      cpuReadings.push(cpuUsage);
      
      // Brief pause to allow system recovery
      if (i % 100 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    const finalMemory = this.measureMemory();
    
    // Calculate statistics
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);
    
    const averageMemory = memoryReadings.reduce((sum, mem) => sum + mem, 0) / memoryReadings.length;
    const peakMemory = Math.max(...memoryReadings);
    
    const averageCpu = cpuReadings.reduce((sum, cpu) => sum + cpu, 0) / cpuReadings.length;
    const peakCpu = Math.max(...cpuReadings);
    
    const throughput = (successCount / averageTime) * 1000; // operations per second
    const successRate = successCount / config.measurementIterations;
    
    const result: BenchmarkResult = {
      testName,
      averageTime,
      minTime,
      maxTime,
      standardDeviation,
      throughput,
      memoryUsage: {
        peak: peakMemory,
        average: averageMemory,
        final: finalMemory
      },
      cpuUsage: {
        average: averageCpu,
        peak: peakCpu
      },
      successRate,
      iterations: config.measurementIterations
    };
    
    console.log(`  ✅ Completed: ${averageTime.toFixed(2)}ms avg, ${throughput.toFixed(2)} ops/sec`);
    
    return result;
  }

  static async runLoadTest<T>(
    testName: string,
    operation: () => Promise<T>,
    concurrency: number,
    duration: number
  ): Promise<LoadTestResult> {
    console.log(`\n🔥 Running load test: ${testName} (${concurrency} concurrent, ${duration}ms)`);
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    const results: Array<{ latency: number; success: boolean }> = [];
    const activePromises = new Set<Promise<void>>();
    
    const memoryBefore = this.measureMemory();
    
    // Launch concurrent operations
    const launchOperation = async () => {
      while (Date.now() < endTime) {
        const operationStart = Date.now();
        
        const operationPromise = (async () => {
          try {
            await operation();
            const latency = Date.now() - operationStart;
            results.push({ latency, success: true });
          } catch (error) {
            const latency = Date.now() - operationStart;
            results.push({ latency, success: false });
          }
        })();
        
        activePromises.add(operationPromise);
        operationPromise.finally(() => activePromises.delete(operationPromise));
        
        // Maintain concurrency level
        if (activePromises.size >= concurrency) {
          await Promise.race(Array.from(activePromises));
        }
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    };
    
    // Start concurrent workers
    const workers = Array.from({ length: Math.min(concurrency, 10) }, () => launchOperation());
    await Promise.all(workers);
    
    // Wait for remaining operations
    await Promise.all(Array.from(activePromises));
    
    const memoryAfter = this.measureMemory();
    const actualDuration = Date.now() - startTime;
    
    // Calculate metrics
    const totalOperations = results.length;
    const successfulOperations = results.filter(r => r.success).length;
    const errorRate = (totalOperations - successfulOperations) / totalOperations;
    
    const latencies = results.map(r => r.latency).sort((a, b) => a - b);
    const averageLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);
    const p95Latency = latencies[p95Index] || 0;
    const p99Latency = latencies[p99Index] || 0;
    
    const throughput = totalOperations / (actualDuration / 1000);
    const memoryEfficiency = totalOperations / Math.max(memoryAfter - memoryBefore, 1);
    
    const result: LoadTestResult = {
      testName,
      concurrency,
      totalOperations,
      duration: actualDuration,
      throughput,
      averageLatency,
      p95Latency,
      p99Latency,
      errorRate,
      memoryEfficiency
    };
    
    console.log(`  ✅ Completed: ${totalOperations} ops, ${throughput.toFixed(2)} ops/sec, ${(errorRate * 100).toFixed(2)}% errors`);
    
    return result;
  }

  static printBenchmarkResults(results: BenchmarkResult[]): void {
    console.log('\n📊 BENCHMARK RESULTS');
    console.log('=' .repeat(80));
    
    results.forEach(result => {
      console.log(`\n${result.testName}:`);
      console.log(`  Performance: ${result.averageTime.toFixed(2)}ms avg (${result.minTime.toFixed(2)}-${result.maxTime.toFixed(2)}ms range)`);
      console.log(`  Throughput: ${result.throughput.toFixed(2)} ops/sec`);
      console.log(`  Success Rate: ${(result.successRate * 100).toFixed(1)}%`);
      console.log(`  Memory: ${result.memoryUsage.peak.toFixed(1)}MB peak, ${result.memoryUsage.average.toFixed(1)}MB avg`);
      console.log(`  CPU: ${result.cpuUsage.peak.toFixed(1)}% peak, ${result.cpuUsage.average.toFixed(1)}% avg`);
      console.log(`  Std Dev: ±${result.standardDeviation.toFixed(2)}ms`);
    });
  }

  static printLoadTestResults(results: LoadTestResult[]): void {
    console.log('\n🔥 LOAD TEST RESULTS');
    console.log('=' .repeat(80));
    
    results.forEach(result => {
      console.log(`\n${result.testName}:`);
      console.log(`  Concurrency: ${result.concurrency}`);
      console.log(`  Operations: ${result.totalOperations} in ${result.duration}ms`);
      console.log(`  Throughput: ${result.throughput.toFixed(2)} ops/sec`);
      console.log(`  Latency: ${result.averageLatency.toFixed(2)}ms avg, ${result.p95Latency.toFixed(2)}ms p95, ${result.p99Latency.toFixed(2)}ms p99`);
      console.log(`  Error Rate: ${(result.errorRate * 100).toFixed(2)}%`);
      console.log(`  Memory Efficiency: ${result.memoryEfficiency.toFixed(2)} ops/MB`);
    });
  }
}

describe('Claude Flow Performance Benchmarks', () => {
  let testDir: string;
  let logger: Logger;
  
  const defaultBenchmarkConfig: BenchmarkConfig = {
    warmupIterations: 10,
    measurementIterations: 100,
    timeoutMs: 10000,
    memoryThresholdMB: 500,
    cpuThresholdPercent: 80
  };

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'performance-benchmarks', Date.now().toString());
    await fs.ensureDir(testDir);
    logger = new Logger('PerfTest', { level: 'error' }); // Reduce noise during benchmarks
  });

  afterAll(async () => {
    await fs.remove(testDir);
  });

  describe('Memory System Performance', () => {
    let memory: QEMemory;
    let mockMemory: EnhancedMockMemory;

    beforeEach(async () => {
      memory = new QEMemory({
        persistPath: path.join(testDir, `memory-${Date.now()}.json`),
        maxEntries: 10000,
        defaultTTL: 300000,
        autoCleanup: false // Disable for consistent benchmarks
      }, logger);
      
      mockMemory = new EnhancedMockMemory({ operationDelay: 0, failureRate: 0 });
    });

    afterEach(async () => {
      if (memory) {
        await memory.destroy();
      }
      if (mockMemory) {
        await mockMemory.destroy();
      }
    });

    it('should benchmark memory store operations', async () => {
      const results: BenchmarkResult[] = [];
      
      // Benchmark real memory
      const realMemoryResult = await PerformanceBenchmark.runBenchmark(
        'Real Memory Store',
        async () => {
          const entry: QEMemoryEntry = {
            key: `test-${Date.now()}-${Math.random()}`,
            value: {
              data: 'test data',
              timestamp: Date.now(),
              metadata: { test: true }
            },
            type: 'test-data' as MemoryType,
            sessionId: 'benchmark-session',
            timestamp: new Date(),
            tags: ['benchmark', 'performance']
          };
          await memory.store(entry);
        },
        defaultBenchmarkConfig
      );
      results.push(realMemoryResult);
      
      // Benchmark mock memory
      const mockMemoryResult = await PerformanceBenchmark.runBenchmark(
        'Mock Memory Store',
        async () => {
          const entry: QEMemoryEntry = {
            key: `test-${Date.now()}-${Math.random()}`,
            value: {
              data: 'test data',
              timestamp: Date.now(),
              metadata: { test: true }
            },
            type: 'test-data' as MemoryType,
            sessionId: 'benchmark-session',
            timestamp: new Date(),
            tags: ['benchmark', 'performance']
          };
          await mockMemory.store(entry);
        },
        defaultBenchmarkConfig
      );
      results.push(mockMemoryResult);
      
      PerformanceBenchmark.printBenchmarkResults(results);
      
      // Assertions
      expect(realMemoryResult.successRate).toBeGreaterThan(0.95);
      expect(mockMemoryResult.successRate).toBeGreaterThan(0.95);
      expect(realMemoryResult.averageTime).toBeLessThan(100); // <100ms for store operations
      expect(mockMemoryResult.averageTime).toBeLessThan(50);  // Mock should be faster
    }, 60000);

    it('should benchmark memory query operations with large datasets', async () => {
      // Pre-populate memory with test data
      const entryCount = 1000;
      console.log(`Populating memory with ${entryCount} entries...`);
      
      for (let i = 0; i < entryCount; i++) {
        await memory.store({
          key: `bulk-entry-${i}`,
          value: {
            index: i,
            data: `Data for entry ${i}`,
            metadata: {
              batch: Math.floor(i / 100),
              category: ['A', 'B', 'C'][i % 3],
              priority: i % 10
            }
          },
          type: 'test-data' as MemoryType,
          sessionId: `session-${Math.floor(i / 200)}`,
          agentId: `agent-${i % 5}`,
          timestamp: new Date(Date.now() + i * 1000),
          tags: [`batch-${Math.floor(i / 100)}`, `category-${['A', 'B', 'C'][i % 3]}`]
        });
      }
      
      const results: BenchmarkResult[] = [];
      
      // Benchmark different query types
      const queryBenchmarks = [
        {
          name: 'Query by Session',
          operation: () => memory.query({ sessionId: 'session-2' })
        },
        {
          name: 'Query by Tags',
          operation: () => memory.query({ tags: ['batch-5'] })
        },
        {
          name: 'Query with Pagination',
          operation: () => memory.query({ limit: 50, offset: 100 })
        },
        {
          name: 'Query with Sorting',
          operation: () => memory.query({ sortBy: 'timestamp', sortOrder: 'desc', limit: 100 })
        },
        {
          name: 'Complex Query',
          operation: () => memory.query({
            sessionId: 'session-1',
            tags: ['category-A'],
            sortBy: 'timestamp',
            limit: 25
          })
        }
      ];
      
      for (const benchmark of queryBenchmarks) {
        const result = await PerformanceBenchmark.runBenchmark(
          benchmark.name,
          benchmark.operation,
          { ...defaultBenchmarkConfig, measurementIterations: 50 }
        );
        results.push(result);
      }
      
      PerformanceBenchmark.printBenchmarkResults(results);
      
      // Verify all benchmarks completed successfully
      results.forEach(result => {
        expect(result.successRate).toBeGreaterThan(0.95);
        expect(result.averageTime).toBeLessThan(500); // <500ms for complex queries
      });
    }, 120000);

    it('should benchmark concurrent memory operations', async () => {
      const loadTestResults: LoadTestResult[] = [];
      
      // Test different concurrency levels
      const concurrencyLevels = [1, 5, 10, 20];
      
      for (const concurrency of concurrencyLevels) {
        const result = await PerformanceBenchmark.runLoadTest(
          `Concurrent Memory Operations (${concurrency} concurrent)`,
          async () => {
            const entry: QEMemoryEntry = {
              key: `concurrent-${Date.now()}-${Math.random()}`,
              value: { data: `concurrent test data` },
              type: 'test-data' as MemoryType,
              sessionId: 'concurrent-session',
              timestamp: new Date(),
              tags: ['concurrent', 'load-test']
            };
            
            await memory.store(entry);
            await memory.get(entry.key);
          },
          concurrency,
          5000 // 5 second test
        );
        
        loadTestResults.push(result);
      }
      
      PerformanceBenchmark.printLoadTestResults(loadTestResults);
      
      // Verify performance doesn't degrade significantly with concurrency
      loadTestResults.forEach((result, index) => {
        expect(result.errorRate).toBeLessThan(0.05); // <5% error rate
        expect(result.throughput).toBeGreaterThan(10); // >10 ops/sec minimum
        
        if (index > 0) {
          const previousResult = loadTestResults[index - 1];
          // Throughput shouldn't drop by more than 50% with increased concurrency
          expect(result.throughput).toBeGreaterThan(previousResult.throughput * 0.5);
        }
      });
    }, 90000);
  });

  describe('Task Executor Performance', () => {
    let taskExecutor: TaskExecutor;
    let mockTaskExecutor: EnhancedMockTaskExecutor;

    beforeEach(async () => {
      taskExecutor = new TaskExecutor({ maxConcurrent: 10 });
      mockTaskExecutor = new EnhancedMockTaskExecutor({ 
        executionDelay: 50, 
        failureRate: 0.02 
      });
    });

    afterEach(async () => {
      if (taskExecutor) {
        await taskExecutor.shutdown();
      }
      if (mockTaskExecutor) {
        await mockTaskExecutor.shutdown();
      }
    });

    it('should benchmark task execution performance', async () => {
      const results: BenchmarkResult[] = [];
      
      const taskTypes = ['development', 'analysis', 'testing', 'optimization'];
      
      for (const taskType of taskTypes) {
        const result = await PerformanceBenchmark.runBenchmark(
          `Task Execution - ${taskType}`,
          async () => {
            const task = {
              id: `task-${Date.now()}-${Math.random()}`,
              name: `${taskType} task`,
              type: taskType as any,
              priority: Math.floor(Math.random() * 10) + 1,
              dependencies: [],
              timeout: 30000,
              retryCount: 1,
              resources: {
                maxMemory: 100 * 1024 * 1024,
                maxCpuPercent: 50,
                maxDiskSpace: 10 * 1024 * 1024,
                maxNetworkBandwidth: 1024 * 1024,
                requiredAgents: 1
              },
              metadata: { benchmark: true }
            };
            
            await mockTaskExecutor.executeTask(task, `agent-${taskType}`);
          },
          { ...defaultBenchmarkConfig, measurementIterations: 50 }
        );
        
        results.push(result);
      }
      
      PerformanceBenchmark.printBenchmarkResults(results);
      
      // Verify performance characteristics
      results.forEach(result => {
        expect(result.successRate).toBeGreaterThan(0.95);
        expect(result.averageTime).toBeLessThan(1000); // <1s for task execution
        expect(result.memoryUsage.peak).toBeLessThan(200); // <200MB memory usage
      });
    }, 120000);

    it('should benchmark concurrent task execution', async () => {
      const loadTestResults: LoadTestResult[] = [];
      
      const concurrencyLevels = [1, 3, 5, 8];
      
      for (const concurrency of concurrencyLevels) {
        const result = await PerformanceBenchmark.runLoadTest(
          `Concurrent Task Execution (${concurrency} concurrent)`,
          async () => {
            const task = {
              id: `load-task-${Date.now()}-${Math.random()}`,
              name: 'Load test task',
              type: 'testing' as any,
              priority: 5,
              dependencies: [],
              timeout: 10000,
              retryCount: 1,
              resources: {
                maxMemory: 50 * 1024 * 1024,
                maxCpuPercent: 30,
                maxDiskSpace: 5 * 1024 * 1024,
                maxNetworkBandwidth: 512 * 1024,
                requiredAgents: 1
              },
              metadata: { loadTest: true }
            };
            
            await mockTaskExecutor.executeTask(task, 'load-test-agent');
          },
          concurrency,
          8000 // 8 second test
        );
        
        loadTestResults.push(result);
      }
      
      PerformanceBenchmark.printLoadTestResults(loadTestResults);
      
      // Verify scalability
      loadTestResults.forEach((result, index) => {
        expect(result.errorRate).toBeLessThan(0.10); // <10% error rate under load
        expect(result.throughput).toBeGreaterThan(1); // >1 task/sec minimum
        
        if (index === 0) {
          // First result should have good performance
          expect(result.averageLatency).toBeLessThan(500);
        }
      });
    }, 100000);
  });

  describe('Integrated System Performance', () => {
    let memory: QEMemory;
    let taskExecutor: TaskExecutor;

    beforeEach(async () => {
      memory = new QEMemory({
        persistPath: path.join(testDir, `integrated-${Date.now()}.json`),
        maxEntries: 5000,
        defaultTTL: 300000,
        autoCleanup: false
      }, logger);
      
      taskExecutor = new TaskExecutor({ maxConcurrent: 5 });
    });

    afterEach(async () => {
      if (memory) {
        await memory.destroy();
      }
      if (taskExecutor) {
        await taskExecutor.shutdown();
      }
    });

    it('should benchmark complete workflow performance', async () => {
      const result = await PerformanceBenchmark.runBenchmark(
        'Complete Workflow',
        async () => {
          const sessionId = `workflow-${Date.now()}-${Math.random()}`;
          
          // Phase 1: Store requirements
          await memory.store({
            key: `${sessionId}-requirements`,
            value: {
              functional: ['Feature A', 'Feature B'],
              nonFunctional: ['Performance', 'Security']
            },
            type: 'session' as MemoryType,
            sessionId,
            timestamp: new Date(),
            tags: ['requirements', 'workflow']
          });
          
          // Phase 2: Execute planning task
          const planningTask = {
            id: `${sessionId}-planning`,
            name: 'Planning Task',
            type: 'analysis' as any,
            priority: 8,
            dependencies: [],
            timeout: 15000,
            retryCount: 1,
            resources: {
              maxMemory: 100 * 1024 * 1024,
              maxCpuPercent: 50,
              maxDiskSpace: 10 * 1024 * 1024,
              maxNetworkBandwidth: 1024 * 1024,
              requiredAgents: 1
            },
            metadata: { phase: 'planning' }
          };
          
          const planningResult = await taskExecutor.executeTask(planningTask, 'planning-agent');
          
          // Phase 3: Store planning results
          await memory.store({
            key: `${sessionId}-planning-result`,
            value: planningResult,
            type: 'session' as MemoryType,
            sessionId,
            agentId: 'planning-agent',
            timestamp: new Date(),
            tags: ['planning', 'result', 'workflow']
          });
          
          // Phase 4: Execute test task
          const testTask = {
            id: `${sessionId}-testing`,
            name: 'Testing Task',
            type: 'testing' as any,
            priority: 7,
            dependencies: [planningTask.id],
            timeout: 10000,
            retryCount: 2,
            resources: {
              maxMemory: 150 * 1024 * 1024,
              maxCpuPercent: 70,
              maxDiskSpace: 15 * 1024 * 1024,
              maxNetworkBandwidth: 1.5 * 1024 * 1024,
              requiredAgents: 1
            },
            metadata: { phase: 'testing' }
          };
          
          const testResult = await taskExecutor.executeTask(testTask, 'test-agent');
          
          // Phase 5: Query workflow data
          const workflowData = await memory.query({
            sessionId,
            tags: ['workflow']
          });
          
          return {
            sessionId,
            planningResult,
            testResult,
            workflowData: workflowData.length
          };
        },
        { ...defaultBenchmarkConfig, measurementIterations: 25, timeoutMs: 30000 }
      );
      
      PerformanceBenchmark.printBenchmarkResults([result]);
      
      // Verify integrated performance
      expect(result.successRate).toBeGreaterThan(0.90);
      expect(result.averageTime).toBeLessThan(5000); // <5s for complete workflow
      expect(result.memoryUsage.peak).toBeLessThan(300); // <300MB memory usage
      expect(result.throughput).toBeGreaterThan(0.1); // >0.1 workflows/sec
    }, 180000);

    it('should benchmark system under sustained load', async () => {
      const loadTestResult = await PerformanceBenchmark.runLoadTest(
        'Sustained System Load',
        async () => {
          const sessionId = `load-${Date.now()}-${Math.random()}`;
          
          // Simulate mini-workflow
          await memory.store({
            key: `${sessionId}-data`,
            value: { timestamp: Date.now(), data: 'load test data' },
            type: 'test-data' as MemoryType,
            sessionId,
            timestamp: new Date(),
            tags: ['load-test']
          });
          
          const task = {
            id: `${sessionId}-task`,
            name: 'Load Test Task',
            type: 'testing' as any,
            priority: 5,
            dependencies: [],
            timeout: 5000,
            retryCount: 1,
            resources: {
              maxMemory: 50 * 1024 * 1024,
              maxCpuPercent: 30,
              maxDiskSpace: 5 * 1024 * 1024,
              maxNetworkBandwidth: 512 * 1024,
              requiredAgents: 1
            },
            metadata: { loadTest: true }
          };
          
          await taskExecutor.executeTask(task, 'load-agent');
          
          const data = await memory.query({
            sessionId,
            tags: ['load-test']
          });
          
          return data.length;
        },
        3, // 3 concurrent operations
        15000 // 15 second test
      );
      
      PerformanceBenchmark.printLoadTestResults([loadTestResult]);
      
      // Verify sustained performance
      expect(loadTestResult.errorRate).toBeLessThan(0.15); // <15% error rate
      expect(loadTestResult.throughput).toBeGreaterThan(0.5); // >0.5 ops/sec
      expect(loadTestResult.averageLatency).toBeLessThan(3000); // <3s average latency
      expect(loadTestResult.p95Latency).toBeLessThan(5000); // <5s p95 latency
    }, 120000);
  });

  describe('Memory Scalability and Limits', () => {
    it('should test memory performance under different data sizes', async () => {
      const results: BenchmarkResult[] = [];
      const dataSizes = [1, 10, 100, 1000]; // KB
      
      for (const sizeKB of dataSizes) {
        const memory = new QEMemory({
          persistPath: path.join(testDir, `size-test-${sizeKB}kb-${Date.now()}.json`),
          maxEntries: 1000,
          autoCleanup: false
        }, logger);
        
        try {
          const result = await PerformanceBenchmark.runBenchmark(
            `Memory Store ${sizeKB}KB entries`,
            async () => {
              const largeData = 'x'.repeat(sizeKB * 1024); // Create data of specified size
              
              const entry: QEMemoryEntry = {
                key: `large-entry-${Date.now()}-${Math.random()}`,
                value: { data: largeData },
                type: 'test-data' as MemoryType,
                sessionId: 'size-test',
                timestamp: new Date(),
                tags: ['size-test', `${sizeKB}kb`]
              };
              
              await memory.store(entry);
            },
            { ...defaultBenchmarkConfig, measurementIterations: 25 }
          );
          
          results.push(result);
        } finally {
          await memory.destroy();
        }
      }
      
      PerformanceBenchmark.printBenchmarkResults(results);
      
      // Verify scalability characteristics
      results.forEach((result, index) => {
        expect(result.successRate).toBeGreaterThan(0.95);
        
        if (index > 0) {
          // Performance should degrade gracefully with larger data
          const previousResult = results[index - 1];
          const performanceRatio = result.averageTime / previousResult.averageTime;
          expect(performanceRatio).toBeLessThan(5); // No more than 5x slower
        }
      });
    }, 180000);

    it('should test memory limits and cleanup performance', async () => {
      const memory = new QEMemory({
        persistPath: path.join(testDir, `limits-test-${Date.now()}.json`),
        maxEntries: 100, // Small limit for testing
        defaultTTL: 1000, // 1 second TTL
        autoCleanup: true,
        cleanupInterval: 500 // Cleanup every 500ms
      }, logger);
      
      try {
        // Fill memory beyond capacity
        for (let i = 0; i < 150; i++) {
          await memory.store({
            key: `limit-test-${i}`,
            value: { index: i, data: `test data ${i}` },
            type: 'test-data' as MemoryType,
            sessionId: 'limit-test',
            timestamp: new Date(),
            tags: ['limit-test']
          });
        }
        
        // Verify memory respected limits
        const stats1 = memory.getStats();
        expect(stats1.totalEntries).toBeLessThanOrEqual(100);
        
        // Wait for TTL expiration and cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Force cleanup
        const cleanedCount = await memory.cleanup();
        
        const stats2 = memory.getStats();
        
        // Verify cleanup worked
        expect(cleanedCount).toBeGreaterThan(0);
        expect(stats2.totalEntries).toBeLessThan(stats1.totalEntries);
        
        console.log(`\n🧹 Memory Cleanup Results:`);
        console.log(`  Before cleanup: ${stats1.totalEntries} entries`);
        console.log(`  After cleanup: ${stats2.totalEntries} entries`);
        console.log(`  Cleaned: ${cleanedCount} entries`);
        
      } finally {
        await memory.destroy();
      }
    }, 30000);
  });
});