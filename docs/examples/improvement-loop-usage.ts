/**
 * Improvement Loop Usage Examples
 *
 * Demonstrates how to use the continuous improvement loop system
 * for automated learning and optimization.
 */

import {
  ImprovementLoop,
  ImprovementWorker,
  LearningEngine,
  PerformanceTracker,
  SwarmMemoryManager
} from '@agentic-qe/learning';
import {
  loadImprovementConfig,
  DEFAULT_IMPROVEMENT_CONFIG,
  AGGRESSIVE_IMPROVEMENT_CONFIG,
  DEV_IMPROVEMENT_CONFIG
} from '../config/improvement-loop.config';

// ============================================================================
// Example 1: Basic Setup (Production)
// ============================================================================

async function basicSetup() {
  // Initialize components
  const memoryStore = new SwarmMemoryManager({
    persistence: true,
    maxSize: 100 * 1024 * 1024 // 100MB
  });
  await memoryStore.initialize();

  const agentId = 'agent-qe-001';

  // Create learning components
  const learningEngine = new LearningEngine(agentId, memoryStore);
  await learningEngine.initialize();

  const performanceTracker = new PerformanceTracker(agentId, memoryStore);
  await performanceTracker.initialize();

  // Create improvement loop
  const improvementLoop = new ImprovementLoop(
    agentId,
    memoryStore,
    learningEngine,
    performanceTracker
  );
  await improvementLoop.initialize();

  // Load configuration (uses DEFAULT_IMPROVEMENT_CONFIG in production)
  const config = loadImprovementConfig();

  // Create and start background worker
  const worker = new ImprovementWorker(improvementLoop, {
    intervalMs: config.cycleIntervalMs,
    maxRetries: config.worker.maxRetries,
    retryDelayMs: config.worker.retryDelayMs,
    enabled: config.worker.enabled
  });

  await worker.start();
  console.log('Improvement loop started with default (conservative) configuration');
  console.log('Auto-apply: DISABLED (default for safety)');

  // Monitor status
  setInterval(() => {
    const status = worker.getStatus();
    const stats = worker.getStatistics();
    console.log('Status:', {
      running: status.isRunning,
      completed: status.cyclesCompleted,
      failed: status.cyclesFailed,
      successRate: (stats.successRate * 100).toFixed(1) + '%',
      nextCycle: status.nextCycleAt
    });
  }, 60000); // every minute

  return { worker, improvementLoop, learningEngine, performanceTracker };
}

// ============================================================================
// Example 2: Enable Auto-Apply (Opt-In)
// ============================================================================

async function enableAutoApply(improvementLoop: ImprovementLoop) {
  console.log('⚠️  ENABLING AUTO-APPLY - Use with caution!');

  // Step 1: Review current patterns
  const patterns = improvementLoop.getStrategies();
  console.log('\nCurrent strategies:');
  patterns.forEach(s => {
    console.log(`- ${s.name}: ${s.usageCount} uses, ${s.successRate?.toFixed(2) || 'N/A'} success rate`);
  });

  // Step 2: Enable auto-apply (opt-in)
  await improvementLoop.setAutoApply(true);
  console.log('\n✓ Auto-apply ENABLED');
  console.log('  - Only strategies with confidence >0.9 and success >0.8 will be applied');
  console.log('  - Maximum 3 strategies per cycle');
  console.log('  - Review logs regularly for applied strategies');

  // Step 3: Monitor applied strategies
  // Auto-apply will happen during next improvement cycle
  console.log('\nMonitor applied strategies in logs or via:');
  console.log('  improvementLoop.getStrategies()');
}

// ============================================================================
// Example 3: Running A/B Tests
// ============================================================================

async function runABTests(improvementLoop: ImprovementLoop) {
  console.log('Creating A/B tests...\n');

  // Test 1: Parallelization strategies
  const test1Id = await improvementLoop.createABTest(
    'Parallelization Optimization',
    [
      { name: 'high-parallel', config: { parallelization: 0.9, batchSize: 10 } },
      { name: 'medium-parallel', config: { parallelization: 0.5, batchSize: 5 } },
      { name: 'low-parallel', config: { parallelization: 0.2, batchSize: 2 } }
    ],
    150 // sample size (50 per strategy)
  );
  console.log(`✓ Created test: Parallelization Optimization (${test1Id})`);

  // Test 2: Retry policies
  const test2Id = await improvementLoop.createABTest(
    'Retry Policy Comparison',
    [
      { name: 'exponential-backoff', config: { retryPolicy: 'exponential', maxRetries: 3 } },
      { name: 'linear-backoff', config: { retryPolicy: 'linear', maxRetries: 3 } }
    ],
    100
  );
  console.log(`✓ Created test: Retry Policy Comparison (${test2Id})`);

  // Monitor tests
  console.log('\nActive A/B tests:');
  const activeTests = improvementLoop.getActiveTests();
  activeTests.forEach(test => {
    console.log(`\n${test.name}:`);
    console.log(`  Status: ${test.status}`);
    console.log(`  Sample size: ${test.sampleSize}`);
    console.log(`  Strategies: ${test.strategies.map(s => s.name).join(', ')}`);

    const totalSamples = test.results.reduce((sum, r) => sum + r.sampleCount, 0);
    console.log(`  Progress: ${totalSamples}/${test.sampleSize}`);
  });

  return { test1Id, test2Id };
}

// ============================================================================
// Example 4: Recording Test Results
// ============================================================================

async function recordTestResults(
  improvementLoop: ImprovementLoop,
  testId: string
) {
  console.log(`Recording results for test ${testId}...\n`);

  // Simulate test executions with different strategies
  const strategies = ['high-parallel', 'medium-parallel', 'low-parallel'];

  for (let i = 0; i < 50; i++) {
    for (const strategy of strategies) {
      // Simulate execution
      const success = Math.random() > 0.1; // 90% success rate
      const baseTime = strategy === 'high-parallel' ? 1000 :
                      strategy === 'medium-parallel' ? 1500 : 2000;
      const executionTime = baseTime + (Math.random() * 500);

      await improvementLoop.recordTestResult(
        testId,
        strategy,
        success,
        executionTime
      );
    }
  }

  console.log('✓ Test results recorded');
  console.log('  Test will auto-complete when sample size is reached');
  console.log('  Winner will be determined automatically');
}

// ============================================================================
// Example 5: Analyzing Failure Patterns
// ============================================================================

async function analyzeFailurePatterns(
  learningEngine: LearningEngine,
  improvementLoop: ImprovementLoop
) {
  console.log('Analyzing failure patterns...\n');

  // Simulate some failures to create patterns
  const failureTypes = [
    { type: 'timeout', count: 8, error: 'timeout:network' },
    { type: 'validation', count: 6, error: 'validation:missing_field' },
    { type: 'memory', count: 12, error: 'memory:out_of_memory' }
  ];

  for (const failure of failureTypes) {
    for (let i = 0; i < failure.count; i++) {
      await learningEngine.learnFromExecution(
        { id: `task-${failure.type}-${i}`, type: failure.type, timeout: 5000 },
        { success: false, errors: [failure.error], executionTime: 5100 }
      );
    }
  }

  // Run improvement cycle to analyze patterns
  const result = await improvementLoop.runImprovementCycle();

  // Review detected patterns
  const patterns = learningEngine.getFailurePatterns();
  console.log(`Detected ${patterns.length} failure patterns:\n`);

  patterns
    .filter(p => p.frequency > 5 && p.confidence > 0.7)
    .forEach(pattern => {
      console.log(`Pattern: ${pattern.pattern}`);
      console.log(`  Frequency: ${pattern.frequency}`);
      console.log(`  Confidence: ${pattern.confidence.toFixed(2)}`);
      console.log(`  Mitigation: ${pattern.mitigation || 'Analyzing...'}`);
      console.log('');
    });
}

// ============================================================================
// Example 6: Performance Monitoring
// ============================================================================

async function monitorPerformance(
  performanceTracker: PerformanceTracker,
  improvementLoop: ImprovementLoop
) {
  console.log('Performance Monitoring\n');

  // Record performance snapshots over time
  console.log('Recording performance snapshots...');

  // Initial snapshot (baseline)
  await performanceTracker.recordSnapshot({
    metrics: {
      tasksCompleted: 50,
      successRate: 0.75,
      averageExecutionTime: 3000,
      errorRate: 0.25,
      userSatisfaction: 0.7,
      resourceEfficiency: 0.65
    },
    trends: []
  });

  // Simulate improvement over time
  await new Promise(resolve => setTimeout(resolve, 1000));

  await performanceTracker.recordSnapshot({
    metrics: {
      tasksCompleted: 75,
      successRate: 0.82,
      averageExecutionTime: 2500,
      errorRate: 0.18,
      userSatisfaction: 0.78,
      resourceEfficiency: 0.73
    },
    trends: []
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  await performanceTracker.recordSnapshot({
    metrics: {
      tasksCompleted: 100,
      successRate: 0.88,
      averageExecutionTime: 2000,
      errorRate: 0.12,
      userSatisfaction: 0.85,
      resourceEfficiency: 0.82
    },
    trends: []
  });

  // Calculate improvement
  const improvement = await performanceTracker.calculateImprovement();

  console.log('\nImprovement Analysis:');
  console.log(`  Improvement rate: ${improvement.improvementRate.toFixed(2)}%`);
  console.log(`  Days elapsed: ${improvement.daysElapsed.toFixed(1)}`);
  console.log(`  Target achieved: ${improvement.targetAchieved ? '✓ YES' : '✗ NO'}`);
  console.log(`  Target: 20% improvement over 30 days`);

  // Generate report
  const report = await performanceTracker.generateReport();
  console.log(`\n${report.summary}`);

  if (report.recommendations.length > 0) {
    console.log('\nRecommendations:');
    report.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }
}

// ============================================================================
// Example 7: Manual Cycle Execution
// ============================================================================

async function manualCycleExecution(improvementLoop: ImprovementLoop) {
  console.log('Running manual improvement cycle...\n');

  try {
    const result = await improvementLoop.runImprovementCycle();

    console.log('Cycle Results:');
    console.log(`  Improvement rate: ${result.improvement.improvementRate.toFixed(2)}%`);
    console.log(`  Failure patterns analyzed: ${result.failurePatternsAnalyzed}`);
    console.log(`  Optimization opportunities: ${result.opportunitiesFound}`);
    console.log(`  Active A/B tests: ${result.activeTests}`);
    console.log(`  Strategies applied: ${result.strategiesApplied}`);
    console.log('');

    if (result.strategiesApplied > 0) {
      console.log('✓ Strategies were auto-applied (auto-apply is enabled)');
    } else {
      console.log('ℹ No strategies applied (auto-apply disabled or no high-confidence strategies)');
    }
  } catch (error) {
    console.error('Cycle execution failed:', error);
  }
}

// ============================================================================
// Example 8: Worker Management
// ============================================================================

async function workerManagement(worker: ImprovementWorker) {
  console.log('Worker Management\n');

  // Check status
  const status = worker.getStatus();
  console.log('Current Status:');
  console.log(`  Running: ${status.isRunning}`);
  console.log(`  Last cycle: ${status.lastCycleAt}`);
  console.log(`  Next cycle: ${status.nextCycleAt}`);
  console.log(`  Completed cycles: ${status.cyclesCompleted}`);
  console.log(`  Failed cycles: ${status.cyclesFailed}`);

  // Get statistics
  const stats = worker.getStatistics();
  console.log('\nStatistics:');
  console.log(`  Total cycles: ${stats.cyclesCompleted + stats.cyclesFailed}`);
  console.log(`  Success rate: ${(stats.successRate * 100).toFixed(1)}%`);

  // Update configuration
  console.log('\nUpdating worker configuration...');
  worker.updateConfig({
    intervalMs: 7200000, // 2 hours
    maxRetries: 5
  });
  console.log('✓ Configuration updated');

  // Manual trigger
  console.log('\nTriggering manual cycle...');
  await worker.runNow();
  console.log('✓ Manual cycle completed');

  // Stop worker
  console.log('\nStopping worker...');
  await worker.stop();
  console.log('✓ Worker stopped');
}

// ============================================================================
// Example 9: Complete Integration
// ============================================================================

async function completeIntegration() {
  console.log('='.repeat(80));
  console.log('IMPROVEMENT LOOP - COMPLETE INTEGRATION EXAMPLE');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Basic setup
  console.log('STEP 1: Basic Setup');
  console.log('-'.repeat(80));
  const { worker, improvementLoop, learningEngine, performanceTracker } = await basicSetup();
  console.log('');

  // Step 2: Record some performance data
  console.log('STEP 2: Recording Performance Data');
  console.log('-'.repeat(80));
  await monitorPerformance(performanceTracker, improvementLoop);
  console.log('');

  // Step 3: Create A/B tests
  console.log('STEP 3: Creating A/B Tests');
  console.log('-'.repeat(80));
  const { test1Id } = await runABTests(improvementLoop);
  console.log('');

  // Step 4: Simulate test executions (in production, this happens naturally)
  console.log('STEP 4: Recording Test Results');
  console.log('-'.repeat(80));
  await recordTestResults(improvementLoop, test1Id);
  console.log('');

  // Step 5: Analyze failure patterns
  console.log('STEP 5: Analyzing Failure Patterns');
  console.log('-'.repeat(80));
  await analyzeFailurePatterns(learningEngine, improvementLoop);
  console.log('');

  // Step 6: Run manual cycle
  console.log('STEP 6: Manual Cycle Execution');
  console.log('-'.repeat(80));
  await manualCycleExecution(improvementLoop);
  console.log('');

  // Step 7: (Optional) Enable auto-apply
  console.log('STEP 7: Enable Auto-Apply (Optional)');
  console.log('-'.repeat(80));
  console.log('To enable auto-apply, run:');
  console.log('  await improvementLoop.setAutoApply(true);');
  console.log('');
  console.log('⚠️  Use with caution! Monitor results closely.');
  console.log('');

  // Step 8: Monitor worker
  console.log('STEP 8: Worker Status');
  console.log('-'.repeat(80));
  const finalStatus = worker.getStatus();
  const finalStats = worker.getStatistics();
  console.log('Final Status:', {
    running: finalStatus.isRunning,
    completed: finalStatus.cyclesCompleted,
    successRate: (finalStats.successRate * 100).toFixed(1) + '%'
  });
  console.log('');

  console.log('='.repeat(80));
  console.log('Integration complete! Monitor logs for ongoing improvements.');
  console.log('='.repeat(80));

  return { worker, improvementLoop, learningEngine, performanceTracker };
}

// ============================================================================
// Run Example
// ============================================================================

if (require.main === module) {
  completeIntegration()
    .then(() => {
      console.log('\n✓ All examples completed successfully');
    })
    .catch(error => {
      console.error('\n✗ Error running examples:', error);
      process.exit(1);
    });
}

export {
  basicSetup,
  enableAutoApply,
  runABTests,
  recordTestResults,
  analyzeFailurePatterns,
  monitorPerformance,
  manualCycleExecution,
  workerManagement,
  completeIntegration
};
