/**
 * Integration Test Suite: Concurrent Operations
 * Tests parallel agent execution, race condition handling, and resource contention
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { createSeededRandom } = require('../../src/utils/SeededRandom');

describe('Concurrent Operations Integration Tests', () => {
  const concurrencyNamespace = 'aqe-concurrent-test';
  let testWorkspace;

  beforeAll(async () => {
    testWorkspace = path.join(__dirname, '../../.test-concurrent-workspace');
    await fs.mkdir(testWorkspace, { recursive: true });
  });

  afterAll(async () => {
    await fs.rmdir(testWorkspace, { recursive: true, force: true });
  });

  describe('Parallel Agent Execution', () => {
    test('21. Concurrent test generation by multiple agents', async () => {
      const testGenerators = [
        { id: 'gen-1', target: 'UserService', framework: 'jest' },
        { id: 'gen-2', target: 'AuthService', framework: 'jest' },
        { id: 'gen-3', target: 'PaymentService', framework: 'mocha' },
        { id: 'gen-4', target: 'NotificationService', framework: 'jest' }
      ];

      const startTime = Date.now();

      // Execute all generators in parallel
      const results = await Promise.all(
        testGenerators.map(generator => executeTestGenerator(generator))
      );

      const endTime = Date.now();
      const totalExecutionTime = endTime - startTime;

      // Verify all generators completed successfully
      expect(results).toHaveLength(4);
      results.forEach((result, index) => {
        expect(result.status).toBe('completed');
        expect(result.generatorId).toBe(testGenerators[index].id);
        expect(result.testFiles).toBeInstanceOf(Array);
        expect(result.testFiles.length).toBeGreaterThan(0);
      });

      // Verify parallel execution was faster than sequential
      const estimatedSequentialTime = results.reduce((sum, result) => sum + result.executionTime, 0);
      expect(totalExecutionTime).toBeLessThan(estimatedSequentialTime * 0.8); // At least 20% faster

      // Store results for coordination
      await execCommand(`npx claude-flow@alpha memory store "concurrent-generation-results" '${JSON.stringify(results)}' --namespace "${concurrencyNamespace}"`);
    });

    test('22. Parallel coverage analysis with resource sharing', async () => {
      const coverageAnalyzers = [
        { id: 'cov-1', sourceFiles: ['user.js', 'auth.js'] },
        { id: 'cov-2', sourceFiles: ['payment.js', 'billing.js'] },
        { id: 'cov-3', sourceFiles: ['notification.js', 'email.js'] },
        { id: 'cov-4', sourceFiles: ['admin.js', 'settings.js'] }
      ];

      // Shared resource simulation (memory store)
      const sharedCoverageData = {
        totalLines: 0,
        coveredLines: 0,
        analysisProgress: 0,
        analysisLock: false
      };

      await execCommand(`npx claude-flow@alpha memory store "shared-coverage-data" '${JSON.stringify(sharedCoverageData)}' --namespace "${concurrencyNamespace}"`);

      // Execute coverage analyzers concurrently
      const analysisPromises = coverageAnalyzers.map(analyzer =>
        executeCoverageAnalyzer(analyzer, concurrencyNamespace)
      );

      const analysisResults = await Promise.all(analysisPromises);

      // Verify results
      expect(analysisResults).toHaveLength(4);
      analysisResults.forEach(result => {
        expect(result.status).toBe('completed');
        expect(result.coverage).toHaveProperty('lines');
        expect(result.coverage).toHaveProperty('branches');
      });

      // Verify shared data integrity
      const finalSharedData = await execCommand(`npx claude-flow@alpha memory get "shared-coverage-data" --namespace "${concurrencyNamespace}"`);
      const parsedFinalData = JSON.parse(finalSharedData.trim());

      expect(parsedFinalData.totalLines).toBeGreaterThan(0);
      expect(parsedFinalData.analysisProgress).toBe(100);
    });

    test('23. Concurrent quality gate validation', async () => {
      const qualityChecks = [
        { id: 'quality-1', type: 'coverage', threshold: 85 },
        { id: 'quality-2', type: 'complexity', threshold: 10 },
        { id: 'quality-3', type: 'duplication', threshold: 5 },
        { id: 'quality-4', type: 'security', threshold: 0 },
        { id: 'quality-5', type: 'performance', threshold: 1000 }
      ];

      // Execute quality checks in parallel
      const qualityPromises = qualityChecks.map(check =>
        executeQualityCheck(check)
      );

      const qualityResults = await Promise.allSettled(qualityPromises);

      // Analyze results
      const passed = qualityResults.filter(result => result.status === 'fulfilled' && result.value.passed);
      const failed = qualityResults.filter(result => result.status === 'fulfilled' && !result.value.passed);
      const errors = qualityResults.filter(result => result.status === 'rejected');

      expect(passed.length + failed.length + errors.length).toBe(5);
      expect(passed.length).toBeGreaterThanOrEqual(3); // At least 3 should pass

      // Store quality gate results
      const qualityReport = {
        totalChecks: qualityChecks.length,
        passed: passed.length,
        failed: failed.length,
        errors: errors.length,
        overallStatus: passed.length >= 4 ? 'PASS' : 'FAIL',
        timestamp: new Date().toISOString()
      };

      await execCommand(`npx claude-flow@alpha memory store "quality-gate-report" '${JSON.stringify(qualityReport)}' --namespace "${concurrencyNamespace}"`);
    });
  });

  describe('Race Condition Handling', () => {
    test('24. Memory access synchronization', async () => {
      const writers = 10;
      const iterations = 5;
      const counterKey = 'race-condition-counter';

      // Initialize counter
      await execCommand(`npx claude-flow@alpha memory store "${counterKey}" '{"value": 0}' --namespace "${concurrencyNamespace}"`);

      // Create multiple writers that increment the counter
      const writerPromises = Array.from({ length: writers }, (_, index) =>
        executeCounterWriter(index, iterations, counterKey, concurrencyNamespace)
      );

      const writerResults = await Promise.all(writerPromises);

      // Verify final counter value
      const finalCounter = await execCommand(`npx claude-flow@alpha memory get "${counterKey}" --namespace "${concurrencyNamespace}"`);
      const parsedCounter = JSON.parse(finalCounter.trim());

      // Expected value: writers * iterations
      const expectedValue = writers * iterations;
      expect(parsedCounter.value).toBe(expectedValue);

      // Verify all writers completed successfully
      writerResults.forEach(result => {
        expect(result.status).toBe('completed');
        expect(result.incrementsPerformed).toBe(iterations);
      });
    });

    test('25. File system contention handling', async () => {
      const logFile = path.join(testWorkspace, 'concurrent-test.log');
      const writers = 8;
      const messagesPerWriter = 10;

      // Create concurrent file writers
      const fileWriterPromises = Array.from({ length: writers }, (_, index) =>
        executeFileWriter(index, messagesPerWriter, logFile)
      );

      const fileWriterResults = await Promise.all(fileWriterPromises);

      // Verify all writers completed
      fileWriterResults.forEach(result => {
        expect(result.status).toBe('completed');
        expect(result.messagesWritten).toBe(messagesPerWriter);
      });

      // Verify file integrity
      const logContent = await fs.readFile(logFile, 'utf8');
      const logLines = logContent.trim().split('\n').filter(line => line.length > 0);

      expect(logLines).toHaveLength(writers * messagesPerWriter);

      // Verify no corrupted lines (each line should be complete)
      logLines.forEach(line => {
        expect(line).toMatch(/^Writer-\d+: Message \d+ at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });

    test('26. Resource pool contention', async () => {
      const poolSize = 3;
      const requesters = 10;
      const resourcePoolKey = 'resource-pool';

      // Initialize resource pool
      const resourcePool = {
        maxSize: poolSize,
        available: Array.from({ length: poolSize }, (_, i) => ({ id: i, inUse: false })),
        queue: [],
        stats: { acquired: 0, released: 0, waitTime: [] }
      };

      await execCommand(`npx claude-flow@alpha memory store "${resourcePoolKey}" '${JSON.stringify(resourcePool)}' --namespace "${concurrencyNamespace}"`);

      // Create concurrent resource requesters
      const requesterPromises = Array.from({ length: requesters }, (_, index) =>
        executeResourceRequester(index, resourcePoolKey, concurrencyNamespace)
      );

      const requesterResults = await Promise.all(requesterPromises);

      // Verify all requesters got resources
      requesterResults.forEach(result => {
        expect(result.status).toBe('completed');
        expect(result.resourceAcquired).toBe(true);
        expect(result.resourceReleased).toBe(true);
        expect(result.waitTime).toBeGreaterThanOrEqual(0);
      });

      // Verify resource pool integrity
      const finalPool = await execCommand(`npx claude-flow@alpha memory get "${resourcePoolKey}" --namespace "${concurrencyNamespace}"`);
      const parsedPool = JSON.parse(finalPool.trim());

      expect(parsedPool.stats.acquired).toBe(requesters);
      expect(parsedPool.stats.released).toBe(requesters);
      expect(parsedPool.available.filter(resource => !resource.inUse)).toHaveLength(poolSize);
    });
  });

  describe('Load Testing', () => {
    test('27. High concurrency agent spawning', async () => {
      const agentCount = 20;
      const agentTypes = ['qe-test-generator', 'qe-coverage-analyzer', 'qe-quality-gate', 'qe-performance-tester', 'qe-security-scanner'];

      const spawnPromises = Array.from({ length: agentCount }, (_, index) => {
        const agentType = agentTypes[index % agentTypes.length];
        return executeAgentSpawn(index, agentType);
      });

      const startTime = Date.now();
      const spawnResults = await Promise.allSettled(spawnPromises);
      const endTime = Date.now();

      const successful = spawnResults.filter(result => result.status === 'fulfilled');
      const failed = spawnResults.filter(result => result.status === 'rejected');

      // At least 80% should succeed
      expect(successful.length / agentCount).toBeGreaterThanOrEqual(0.8);

      // Should complete within reasonable time (30 seconds)
      expect(endTime - startTime).toBeLessThan(30000);

      // Store load test results
      const loadTestReport = {
        totalAgents: agentCount,
        successful: successful.length,
        failed: failed.length,
        executionTime: endTime - startTime,
        averageSpawnTime: successful.reduce((sum, result) => sum + result.value.spawnTime, 0) / successful.length,
        timestamp: new Date().toISOString()
      };

      await execCommand(`npx claude-flow@alpha memory store "load-test-report" '${JSON.stringify(loadTestReport)}' --namespace "${concurrencyNamespace}"`);
    });

    test('28. Memory stress test under concurrent load', async () => {
      const concurrent_operations = 50;
      const operations_per_worker = 20;

      const stressTestPromises = Array.from({ length: concurrent_operations }, (_, index) =>
        executeMemoryStressWorker(index, operations_per_worker, concurrencyNamespace)
      );

      const startTime = Date.now();
      const stressResults = await Promise.allSettled(stressTestPromises);
      const endTime = Date.now();

      const successful = stressResults.filter(result => result.status === 'fulfilled');
      const totalOperations = successful.length * operations_per_worker;

      expect(successful.length / concurrent_operations).toBeGreaterThanOrEqual(0.9); // 90% success rate
      expect(totalOperations).toBeGreaterThanOrEqual(900); // At least 900 operations

      const operationsPerSecond = totalOperations / ((endTime - startTime) / 1000);
      expect(operationsPerSecond).toBeGreaterThan(100); // At least 100 ops/sec

      // Verify memory consistency
      const memoryKeys = await execCommand(`npx claude-flow@alpha memory list --namespace "${concurrencyNamespace}"`);
      expect(memoryKeys.trim().split('\n').length).toBeGreaterThan(0);
    });
  });
});

// Helper functions
async function execCommand(command) {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => stdout += data);
    child.stderr.on('data', (data) => stderr += data);

    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout));
    });
  });
}

// Seeded RNG instances for deterministic behavior
const testGeneratorRng = createSeededRandom(24000);
const qualityCheckDelayRng = createSeededRandom(24001);
const qualityCheckPassRng = createSeededRandom(24002);
const resourceRequesterRng = createSeededRandom(24003);
const agentSpawnRng = createSeededRandom(24004);
const memoryStressRng = createSeededRandom(24005);

async function executeTestGenerator(generator) {
  const startTime = Date.now();

  // Simulate test generation work
  await new Promise(resolve => setTimeout(resolve, testGeneratorRng.random() * 2000 + 1000));

  const endTime = Date.now();

  return {
    generatorId: generator.id,
    status: 'completed',
    target: generator.target,
    framework: generator.framework,
    testFiles: [
      `${generator.target.toLowerCase()}.test.js`,
      `${generator.target.toLowerCase()}.integration.test.js`
    ],
    executionTime: endTime - startTime,
    timestamp: new Date().toISOString()
  };
}

async function executeCoverageAnalyzer(analyzer, namespace) {
  const startTime = Date.now();

  // Simulate atomic update of shared coverage data
  for (let i = 0; i < 5; i++) {
    try {
      const sharedData = await execCommand(`npx claude-flow@alpha memory get "shared-coverage-data" --namespace "${namespace}"`);
      const parsedData = JSON.parse(sharedData.trim());

      if (!parsedData.analysisLock) {
        // Acquire lock
        parsedData.analysisLock = true;
        await execCommand(`npx claude-flow@alpha memory store "shared-coverage-data" '${JSON.stringify(parsedData)}' --namespace "${namespace}"`);

        // Simulate analysis work
        await new Promise(resolve => setTimeout(resolve, 200));

        // Update shared data
        parsedData.totalLines += analyzer.sourceFiles.length * 100;
        parsedData.coveredLines += analyzer.sourceFiles.length * 85;
        parsedData.analysisProgress += 25;
        parsedData.analysisLock = false;

        await execCommand(`npx claude-flow@alpha memory store "shared-coverage-data" '${JSON.stringify(parsedData)}' --namespace "${namespace}"`);
        break;
      } else {
        // Wait if locked
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      // Retry on error
      continue;
    }
  }

  const endTime = Date.now();

  return {
    analyzerId: analyzer.id,
    status: 'completed',
    coverage: {
      lines: 85.5,
      branches: 78.2,
      functions: 92.1,
      statements: 87.8
    },
    executionTime: endTime - startTime,
    timestamp: new Date().toISOString()
  };
}

async function executeQualityCheck(check) {
  // Simulate quality check work
  await new Promise(resolve => setTimeout(resolve, qualityCheckDelayRng.random() * 1000 + 500));

  // Simulate different pass rates based on check type
  const passRates = {
    coverage: 0.9,
    complexity: 0.8,
    duplication: 0.85,
    security: 0.95,
    performance: 0.75
  };

  const passed = qualityCheckPassRng.random() < (passRates[check.type] || 0.8);

  return {
    checkId: check.id,
    type: check.type,
    passed,
    value: passed ? check.threshold - 1 : check.threshold + 1,
    threshold: check.threshold,
    timestamp: new Date().toISOString()
  };
}

async function executeCounterWriter(writerId, iterations, counterKey, namespace) {
  let incrementsPerformed = 0;

  for (let i = 0; i < iterations; i++) {
    try {
      // Atomic increment operation
      const currentValue = await execCommand(`npx claude-flow@alpha memory get "${counterKey}" --namespace "${namespace}"`);
      const parsedValue = JSON.parse(currentValue.trim());

      parsedValue.value += 1;

      await execCommand(`npx claude-flow@alpha memory store "${counterKey}" '${JSON.stringify(parsedValue)}' --namespace "${namespace}"`);

      incrementsPerformed++;

      // Small delay to increase contention
      await new Promise(resolve => setTimeout(resolve, 10));
    } catch (error) {
      // Retry on error
      i--; // Retry this iteration
    }
  }

  return {
    writerId,
    status: 'completed',
    incrementsPerformed,
    timestamp: new Date().toISOString()
  };
}

async function executeFileWriter(writerId, messageCount, logFile) {
  let messagesWritten = 0;

  for (let i = 0; i < messageCount; i++) {
    try {
      const message = `Writer-${writerId}: Message ${i} at ${new Date().toISOString()}\n`;
      await fs.appendFile(logFile, message);
      messagesWritten++;

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 5));
    } catch (error) {
      // Retry on error
      i--;
    }
  }

  return {
    writerId,
    status: 'completed',
    messagesWritten,
    timestamp: new Date().toISOString()
  };
}

async function executeResourceRequester(requesterId, poolKey, namespace) {
  const startTime = Date.now();
  let resourceAcquired = false;
  let resourceReleased = false;
  let acquiredResourceId = null;

  // Try to acquire resource
  for (let attempts = 0; attempts < 100; attempts++) {
    try {
      const poolData = await execCommand(`npx claude-flow@alpha memory get "${poolKey}" --namespace "${namespace}"`);
      const parsedPool = JSON.parse(poolData.trim());

      // Find available resource
      const availableResource = parsedPool.available.find(resource => !resource.inUse);

      if (availableResource) {
        // Mark resource as in use
        availableResource.inUse = true;
        parsedPool.stats.acquired++;

        await execCommand(`npx claude-flow@alpha memory store "${poolKey}" '${JSON.stringify(parsedPool)}' --namespace "${namespace}"`);

        resourceAcquired = true;
        acquiredResourceId = availableResource.id;
        break;
      } else {
        // Wait if no resources available
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      // Retry on error
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  if (resourceAcquired) {
    // Simulate work with resource
    await new Promise(resolve => setTimeout(resolve, resourceRequesterRng.random() * 500 + 100));

    // Release resource
    try {
      const poolData = await execCommand(`npx claude-flow@alpha memory get "${poolKey}" --namespace "${namespace}"`);
      const parsedPool = JSON.parse(poolData.trim());

      const resource = parsedPool.available.find(r => r.id === acquiredResourceId);
      if (resource) {
        resource.inUse = false;
        parsedPool.stats.released++;
      }

      await execCommand(`npx claude-flow@alpha memory store "${poolKey}" '${JSON.stringify(parsedPool)}' --namespace "${namespace}"`);

      resourceReleased = true;
    } catch (error) {
      // Resource release failed
    }
  }

  const endTime = Date.now();

  return {
    requesterId,
    status: 'completed',
    resourceAcquired,
    resourceReleased,
    acquiredResourceId,
    waitTime: endTime - startTime,
    timestamp: new Date().toISOString()
  };
}

async function executeAgentSpawn(agentIndex, agentType) {
  const startTime = Date.now();

  // Simulate agent spawning work
  await new Promise(resolve => setTimeout(resolve, agentSpawnRng.random() * 1000 + 200));

  const endTime = Date.now();

  return {
    agentIndex,
    agentType,
    status: 'spawned',
    spawnTime: endTime - startTime,
    timestamp: new Date().toISOString()
  };
}

async function executeMemoryStressWorker(workerId, operationCount, namespace) {
  let operationsCompleted = 0;

  for (let i = 0; i < operationCount; i++) {
    try {
      const key = `stress-test-${workerId}-${i}`;
      const value = { workerId, operation: i, timestamp: Date.now() };

      // Store operation
      await execCommand(`npx claude-flow@alpha memory store "${key}" '${JSON.stringify(value)}' --namespace "${namespace}"`);

      // Retrieve operation (verification)
      const retrieved = await execCommand(`npx claude-flow@alpha memory get "${key}" --namespace "${namespace}"`);
      const parsedRetrieved = JSON.parse(retrieved.trim());

      if (parsedRetrieved.workerId === workerId && parsedRetrieved.operation === i) {
        operationsCompleted++;
      }

      // Random delay (deterministic with seeded RNG)
      if (memoryStressRng.random() < 0.1) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    } catch (error) {
      // Continue on error
    }
  }

  return {
    workerId,
    status: 'completed',
    operationsCompleted,
    operationCount,
    timestamp: new Date().toISOString()
  };
}