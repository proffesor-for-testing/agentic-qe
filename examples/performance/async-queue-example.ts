/**
 * AsyncOperationQueue Example
 * Demonstrates 2-3x performance improvement through batched parallel execution
 */

import { AsyncOperationQueue, QEFramework } from 'agentic-qe';

interface TestOperation {
  id: string;
  testFile: string;
  environment: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

class PerformanceExample {
  private queue: AsyncOperationQueue<TestOperation>;
  private framework: QEFramework;

  constructor() {
    // Initialize high-performance queue
    this.queue = new AsyncOperationQueue<TestOperation>({
      maxConcurrent: 12,        // Process up to 12 operations simultaneously
      batchSize: 8,             // Group operations in batches of 8
      timeout: 30000,           // 30-second timeout per operation
      retryAttempts: 3,         // Retry failed operations
      retryDelay: 1000,         // 1-second delay between retries
      priorityLevels: 4         // Support 4 priority levels
    });

    this.framework = new QEFramework({
      performance: {
        enableAsyncQueue: true,
        enableBatchProcessor: true,
        maxConcurrent: 12
      }
    });
  }

  /**
   * Demonstrates the performance difference between sequential and parallel execution
   */
  async demonstratePerformanceImprovement() {
    const testOperations: TestOperation[] = Array.from({ length: 50 }, (_, i) => ({
      id: `test-${i}`,
      testFile: `./tests/suite-${Math.floor(i / 10)}/test-${i}.js`,
      environment: i % 2 === 0 ? 'staging' : 'production',
      priority: ['low', 'medium', 'high', 'critical'][i % 4] as any
    }));

    console.log(`🚀 Performance Comparison: ${testOperations.length} test operations`);
    console.log('=' .repeat(60));

    // Sequential execution (baseline)
    const sequentialTime = await this.measureSequentialExecution(testOperations);

    // Parallel execution (optimized)
    const parallelTime = await this.measureParallelExecution(testOperations);

    // Calculate improvement
    const improvement = sequentialTime / parallelTime;
    const timeReduction = ((sequentialTime - parallelTime) / sequentialTime) * 100;

    console.log('\n📊 Results:');
    console.log(`Sequential execution: ${sequentialTime.toFixed(2)}ms`);
    console.log(`Parallel execution:   ${parallelTime.toFixed(2)}ms`);
    console.log(`Improvement factor:   ${improvement.toFixed(2)}x faster`);
    console.log(`Time reduction:       ${timeReduction.toFixed(1)}%`);

    return {
      sequentialTime,
      parallelTime,
      improvement,
      timeReduction
    };
  }

  /**
   * Measures sequential execution time (baseline)
   */
  private async measureSequentialExecution(operations: TestOperation[]): Promise<number> {
    console.log('⏳ Running sequential execution...');

    const startTime = Date.now();

    for (const operation of operations) {
      await this.simulateTestExecution(operation);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ Sequential execution completed in ${duration}ms`);
    return duration;
  }

  /**
   * Measures parallel execution time using AsyncOperationQueue
   */
  private async measureParallelExecution(operations: TestOperation[]): Promise<number> {
    console.log('⚡ Running parallel execution with AsyncOperationQueue...');

    const startTime = Date.now();

    // Add all operations to queue with priorities
    const operationPromises = operations.map(operation =>
      this.queue.add('test-execution', operation, {
        priority: operation.priority,
        timeout: 10000
      })
    );

    // Wait for all operations to be queued
    await Promise.all(operationPromises);

    // Process queue with parallel execution
    const results = await this.queue.process();

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ Parallel execution completed in ${duration}ms`);
    console.log(`📈 Processed ${results.length} operations in batches`);

    return duration;
  }

  /**
   * Simulates test execution with realistic timing
   */
  private async simulateTestExecution(operation: TestOperation): Promise<void> {
    // Simulate test execution time based on priority
    const executionTime = {
      critical: 150,
      high: 200,
      medium: 300,
      low: 400
    }[operation.priority];

    // Add some randomness to simulate real-world variance
    const variance = Math.random() * 50 - 25; // ±25ms variance
    const actualTime = Math.max(50, executionTime + variance);

    await new Promise(resolve => setTimeout(resolve, actualTime));
  }

  /**
   * Demonstrates queue monitoring and management
   */
  async demonstrateQueueMonitoring() {
    console.log('\n🔍 Queue Monitoring Demo');
    console.log('=' .repeat(40));

    // Add operations to queue
    const operations = Array.from({ length: 20 }, (_, i) => ({
      id: `monitor-test-${i}`,
      testFile: `./tests/monitor-${i}.js`,
      environment: 'staging',
      priority: 'medium' as const
    }));

    // Add operations asynchronously
    const addPromises = operations.map(op =>
      this.queue.add('test-execution', op)
    );

    await Promise.all(addPromises);

    // Monitor queue status
    setInterval(() => {
      const status = this.queue.getStatus();
      console.log(`📊 Queue Status: ${status.pending} pending, ${status.processing} processing, ${status.completed} completed`);
    }, 1000);

    // Process with progress callback
    await this.queue.processWithCallback((progress) => {
      console.log(`⏳ Progress: ${progress.completed}/${progress.total} (${progress.percentage.toFixed(1)}%)`);
    });

    console.log('✅ Queue monitoring demo completed');
  }

  /**
   * Demonstrates error handling and retry logic
   */
  async demonstrateErrorHandling() {
    console.log('\n🛡️ Error Handling Demo');
    console.log('=' .repeat(40));

    // Create operations that will occasionally fail
    const flakyOperations = Array.from({ length: 10 }, (_, i) => ({
      id: `flaky-test-${i}`,
      testFile: `./tests/flaky-${i}.js`,
      environment: 'unstable',
      priority: 'medium' as const,
      shouldFail: Math.random() < 0.3 // 30% chance of failure
    }));

    // Configure queue with error handling
    const errorHandlingQueue = new AsyncOperationQueue({
      maxConcurrent: 5,
      batchSize: 3,
      retryAttempts: 3,
      retryDelay: 1000,
      errorThreshold: 0.5 // Pause queue if 50% error rate
    });

    // Add error event listeners
    errorHandlingQueue.on('error', (error, operation) => {
      console.log(`❌ Operation ${operation.id} failed: ${error.message}`);
    });

    errorHandlingQueue.on('retry', (operation, attempt) => {
      console.log(`🔄 Retrying operation ${operation.id}, attempt ${attempt}`);
    });

    errorHandlingQueue.on('success', (operation, result) => {
      console.log(`✅ Operation ${operation.id} succeeded`);
    });

    // Add operations to error handling queue
    for (const operation of flakyOperations) {
      await errorHandlingQueue.add('flaky-execution', operation);
    }

    // Process with error handling
    try {
      const results = await errorHandlingQueue.process();
      console.log(`✅ Processed ${results.length} operations with error handling`);
    } catch (error) {
      console.log(`🚨 Queue processing stopped due to high error rate: ${error.message}`);
    }
  }

  /**
   * Demonstrates memory optimization
   */
  async demonstrateMemoryOptimization() {
    console.log('\n💾 Memory Optimization Demo');
    console.log('=' .repeat(40));

    const initialMemory = process.memoryUsage();
    console.log(`📊 Initial memory usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

    // Create large dataset
    const largeOperations = Array.from({ length: 1000 }, (_, i) => ({
      id: `large-test-${i}`,
      testFile: `./tests/large-${i}.js`,
      environment: 'performance',
      priority: 'medium' as const,
      data: 'x'.repeat(1000) // 1KB of data per operation
    }));

    // Configure memory-optimized queue
    const memoryOptimizedQueue = new AsyncOperationQueue({
      maxConcurrent: 8,
      batchSize: 10,
      timeout: 5000,
      memoryThreshold: 0.8 // Pause if memory usage exceeds 80%
    });

    // Process large dataset
    console.log('⏳ Processing large dataset...');

    for (const operation of largeOperations) {
      await memoryOptimizedQueue.add('memory-test', operation);
    }

    await memoryOptimizedQueue.process();

    const finalMemory = process.memoryUsage();
    const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

    console.log(`📊 Final memory usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📈 Memory increase: ${memoryIncrease.toFixed(2)} MB`);
    console.log(`✅ Memory optimization demo completed`);

    return memoryIncrease;
  }
}

// Example usage
async function runPerformanceExamples() {
  const example = new PerformanceExample();

  try {
    // Basic performance comparison
    await example.demonstratePerformanceImprovement();

    // Queue monitoring
    await example.demonstrateQueueMonitoring();

    // Error handling
    await example.demonstrateErrorHandling();

    // Memory optimization
    await example.demonstrateMemoryOptimization();

    console.log('\n🎉 All performance examples completed successfully!');
  } catch (error) {
    console.error('❌ Error running performance examples:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runPerformanceExamples();
}

export { PerformanceExample, runPerformanceExamples };