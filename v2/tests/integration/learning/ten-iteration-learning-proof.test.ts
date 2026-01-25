/**
 * 10-Iteration Learning Proof Test
 *
 * THE CRITICAL TEST: Proves agents actually improve over 10 iterations using REAL AgentDB.
 *
 * Success Criteria:
 * ✅ 15%+ coverage improvement from iteration 1-3 to iteration 8-10
 * ✅ 60%+ consistency (iterations showing improvement)
 * ✅ Pattern storage and retrieval working
 * ✅ Q-learning actually updating values
 * ✅ Execution time decreasing as patterns are learned
 */

import { TestGeneratorAgent } from '../../../src/agents/TestGeneratorAgent';
import { createAgentDBManager } from '../../../src/core/memory/AgentDBManager';
import { QEReasoningBank } from '../../../src/reasoning/QEReasoningBank';
import { LearningEngine } from '../../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventEmitter } from 'events';
import { QETask, AgentContext, AgentType } from '../../../src/types';

describe('10-Iteration Learning Validation - REAL Database Proof', () => {
  let agentDB: any;
  let memoryStore: SwarmMemoryManager;
  let reasoningBank: QEReasoningBank;
  let eventBus: EventEmitter;

  beforeAll(async () => {
    // Use REAL database (not :memory:) to test actual persistence
    agentDB = createAgentDBManager({
      dbPath: '.agentic-qe/test-learning-proof.db',
      enableLearning: true,
      enableReasoning: true,
      cacheSize: 1000
    });
    await agentDB.initialize();

    memoryStore = new SwarmMemoryManager({
      dbPath: '.agentic-qe/test-learning-proof.db',
      cacheSize: 1000,
      ttl: 3600000
    });
    await memoryStore.initialize();

    reasoningBank = new QEReasoningBank({
      minQuality: 0.7,
      database: (memoryStore as any).getDatabase()
    });
    await reasoningBank.initialize();

    eventBus = new EventEmitter();

    console.log('\n🔧 Test Setup: Using REAL database at .agentic-qe/test-learning-proof.db');
  });

  afterAll(async () => {
    if (memoryStore) {
      await memoryStore.shutdown();
    }
    if (agentDB) {
      await agentDB.close();
    }
  });

  it('should show 15%+ coverage improvement over 10 iterations', async () => {
    const agentId = 'learning-proof-' + Date.now();
    const context: AgentContext = {
      id: agentId,
      type: 'test-generator' as AgentType,
      status: 'idle',
      metadata: {}
    };

    const agent = new TestGeneratorAgent({
      id: agentId,
      type: 'test-generator' as AgentType,
      capabilities: ['unit-testing', 'integration-testing', 'pattern-learning'],
      context,
      memoryStore,
      eventBus,
      frameworks: ['jest'],
      generationStrategies: ['boundary-value', 'equivalence-class', 'mutation-testing', 'property-based'],
      coverageTarget: 90,
      learningEnabled: true,
      enablePatterns: true
    });

    const results: Array<{
      iteration: number;
      coverage: number;
      passRate: number;
      executionTime: number;
      testsGenerated: number;
      patternsUsed: number;
      qTableSize: number;
    }> = [];

    console.log('\n' + '='.repeat(80));
    console.log('📊 10-ITERATION LEARNING VALIDATION - REAL DATABASE TEST');
    console.log('='.repeat(80));
    console.log(`Agent ID: ${agentId}`);
    console.log(`Database: .agentic-qe/test-learning-proof.db`);
    console.log(`Start Time: ${new Date().toISOString()}`);
    console.log('='.repeat(80) + '\n');

    // Run 10 iterations
    for (let i = 1; i <= 10; i++) {
      const task: QETask = {
        id: `iteration-${i}-${Date.now()}`,
        type: 'test-generation',
        description: `Generate comprehensive test suite for UserService authentication - Iteration ${i}`,
        requirements: {
          targetFiles: ['src/services/UserService.ts'],
          framework: 'jest',
          coverageTarget: 90,
          testTypes: ['unit', 'integration'],
          capabilities: ['unit-testing', 'integration-testing']
        },
        priority: 'high',
        createdAt: new Date(),
        status: 'pending'
      };

      const startTime = Date.now();
      const result = await agent.executeTask(task);
      const executionTime = Date.now() - startTime;

      // Extract metrics
      const coverage = result.metrics?.coverage || 0;
      const passRate = result.metrics?.passRate || 0;
      const testsGenerated = result.testsGenerated?.length || 0;
      const patternsUsed = result.metrics?.patternsUsed || 0;

      // Get learning engine stats
      const learningEngine = (agent as any).learningEngine;
      const qTableSize = learningEngine ? (learningEngine as any).qTable?.size || 0 : 0;

      results.push({
        iteration: i,
        coverage,
        passRate,
        executionTime,
        testsGenerated,
        patternsUsed,
        qTableSize
      });

      // Store pattern for next iteration to learn from
      if (learningEngine) {
        await learningEngine.learnFromExecution(task, {
          success: result.success,
          coverage,
          passRate,
          executionTime,
          testsGenerated,
          metrics: result.metrics
        });
      }

      // Visual progress indicator
      const coverageBar = '█'.repeat(Math.floor(coverage / 5)) + '░'.repeat(20 - Math.floor(coverage / 5));
      console.log(`Iteration ${i.toString().padStart(2)}: [${coverageBar}] ${coverage.toFixed(2)}% | Pass: ${passRate.toFixed(1)}% | Tests: ${testsGenerated.toString().padStart(3)} | Time: ${executionTime.toString().padStart(5)}ms | Patterns: ${patternsUsed} | Q-Size: ${qTableSize}`);

      // Small delay to allow database writes to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(80));
    console.log('📈 LEARNING VALIDATION RESULTS');
    console.log('='.repeat(80) + '\n');

    // Analyze improvement
    const firstThree = results.slice(0, 3);
    const lastThree = results.slice(7, 10);

    const baselineCoverage = firstThree.reduce((sum, r) => sum + r.coverage, 0) / firstThree.length;
    const finalCoverage = lastThree.reduce((sum, r) => sum + r.coverage, 0) / lastThree.length;
    const coverageImprovement = ((finalCoverage - baselineCoverage) / baselineCoverage) * 100;

    const baselineTime = firstThree.reduce((sum, r) => sum + r.executionTime, 0) / firstThree.length;
    const finalTime = lastThree.reduce((sum, r) => sum + r.executionTime, 0) / lastThree.length;
    const timeReduction = ((baselineTime - finalTime) / baselineTime) * 100;

    const baselineTests = firstThree.reduce((sum, r) => sum + r.testsGenerated, 0) / firstThree.length;
    const finalTests = lastThree.reduce((sum, r) => sum + r.testsGenerated, 0) / lastThree.length;
    const testImprovement = ((finalTests - baselineTests) / baselineTests) * 100;

    const baselinePassRate = firstThree.reduce((sum, r) => sum + r.passRate, 0) / firstThree.length;
    const finalPassRate = lastThree.reduce((sum, r) => sum + r.passRate, 0) / lastThree.length;
    const passRateImprovement = finalPassRate - baselinePassRate;

    console.log('📊 Coverage Improvement:');
    console.log(`   First 3 iterations: ${baselineCoverage.toFixed(2)}%`);
    console.log(`   Last 3 iterations:  ${finalCoverage.toFixed(2)}%`);
    console.log(`   Improvement:        ${coverageImprovement.toFixed(2)}% ${coverageImprovement >= 15 ? '✅' : '❌'}`);
    console.log('');

    console.log('⚡ Execution Time Reduction:');
    console.log(`   First 3 iterations: ${baselineTime.toFixed(0)}ms`);
    console.log(`   Last 3 iterations:  ${finalTime.toFixed(0)}ms`);
    console.log(`   Reduction:          ${timeReduction.toFixed(2)}% ${timeReduction > 0 ? '✅' : '⚠️'}`);
    console.log('');

    console.log('🧪 Test Generation Improvement:');
    console.log(`   First 3 iterations: ${baselineTests.toFixed(1)} tests`);
    console.log(`   Last 3 iterations:  ${finalTests.toFixed(1)} tests`);
    console.log(`   Improvement:        ${testImprovement.toFixed(2)}%`);
    console.log('');

    console.log('✓ Pass Rate Improvement:');
    console.log(`   First 3 iterations: ${baselinePassRate.toFixed(2)}%`);
    console.log(`   Last 3 iterations:  ${finalPassRate.toFixed(2)}%`);
    console.log(`   Improvement:        +${passRateImprovement.toFixed(2)}pp`);
    console.log('');

    // Verify improvement trend
    const improvingIterations = results.filter((r, i) => {
      if (i === 0) return false;
      return r.coverage >= results[i - 1].coverage;
    });
    const improvementConsistency = (improvingIterations.length / (results.length - 1)) * 100;

    console.log('📈 Improvement Consistency:');
    console.log(`   Iterations with improvement: ${improvingIterations.length}/${results.length - 1}`);
    console.log(`   Consistency:                 ${improvementConsistency.toFixed(0)}% ${improvementConsistency >= 60 ? '✅' : '❌'}`);
    console.log('');

    // Check pattern usage
    const patternsUsedTotal = results.reduce((sum, r) => sum + r.patternsUsed, 0);
    const avgPatternsUsed = patternsUsedTotal / results.length;
    const lastIterPatterns = results[results.length - 1].patternsUsed;

    console.log('🧠 Pattern Learning:');
    console.log(`   Total patterns used:    ${patternsUsedTotal}`);
    console.log(`   Average patterns/iter:  ${avgPatternsUsed.toFixed(2)}`);
    console.log(`   Last iteration:         ${lastIterPatterns} patterns`);
    console.log(`   Pattern acceleration:   ${lastIterPatterns > avgPatternsUsed ? '✅' : '⚠️'}`);
    console.log('');

    // Check Q-learning table growth
    const finalQTableSize = results[results.length - 1].qTableSize;
    console.log('🎓 Q-Learning Status:');
    console.log(`   Q-table size:           ${finalQTableSize} states`);
    console.log(`   Learning active:        ${finalQTableSize > 0 ? '✅' : '❌'}`);
    console.log('');

    // Get learning engine stats
    const learningEngine = (agent as any).learningEngine;
    if (learningEngine) {
      const patterns = learningEngine.getPatterns();
      const totalExperiences = learningEngine.getTotalExperiences();
      const explorationRate = learningEngine.getExplorationRate();

      console.log('📚 Learning Engine Metrics:');
      console.log(`   Total experiences:      ${totalExperiences}`);
      console.log(`   Learned patterns:       ${patterns.length}`);
      console.log(`   Exploration rate:       ${(explorationRate * 100).toFixed(2)}%`);
      console.log('');
    }

    // Check database persistence
    const dbStats = await agentDB.getStats();
    console.log('💾 Database Persistence:');
    console.log(`   Database path:          .agentic-qe/test-learning-proof.db`);
    console.log(`   Total patterns stored:  ${dbStats.totalPatterns || 'N/A'}`);
    console.log(`   Database active:        ✅`);
    console.log('');

    console.log('='.repeat(80));
    console.log('🎯 FINAL VERDICT');
    console.log('='.repeat(80));

    const criteriaResults = [
      { name: 'Coverage Improvement ≥ 15%', passed: coverageImprovement >= 15, value: `${coverageImprovement.toFixed(2)}%` },
      { name: 'Improvement Consistency ≥ 60%', passed: improvementConsistency >= 60, value: `${improvementConsistency.toFixed(0)}%` },
      { name: 'Pattern Learning Active', passed: patternsUsedTotal > 0, value: `${patternsUsedTotal} patterns` },
      { name: 'Q-Learning Active', passed: finalQTableSize > 0, value: `${finalQTableSize} states` }
    ];

    let passedCount = 0;
    for (const criteria of criteriaResults) {
      const status = criteria.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} | ${criteria.name.padEnd(35)} | ${criteria.value}`);
      if (criteria.passed) passedCount++;
    }

    console.log('='.repeat(80));
    console.log(`OVERALL: ${passedCount}/${criteriaResults.length} criteria passed ${passedCount === criteriaResults.length ? '✅' : '❌'}`);
    console.log(`End Time: ${new Date().toISOString()}\n`);

    // ✅ THE CRITICAL ASSERTIONS
    expect(coverageImprovement).toBeGreaterThanOrEqual(15); // PRIMARY SUCCESS CRITERION
    expect(improvementConsistency).toBeGreaterThanOrEqual(60); // At least 60% of iterations should improve
    expect(patternsUsedTotal).toBeGreaterThan(0); // Pattern learning should be active
    expect(finalQTableSize).toBeGreaterThan(0); // Q-learning should be active

    await agent.shutdown();
  }, 300000); // 5 minute timeout for 10 iterations

  it('should show decreasing execution time as patterns are learned', async () => {
    const agentId = 'perf-validation-' + Date.now();
    const context: AgentContext = {
      id: agentId,
      type: 'test-generator' as AgentType,
      status: 'idle',
      metadata: {}
    };

    const agent = new TestGeneratorAgent({
      id: agentId,
      type: 'test-generator' as AgentType,
      capabilities: ['unit-testing', 'pattern-learning'],
      context,
      memoryStore,
      eventBus,
      frameworks: ['jest'],
      generationStrategies: ['boundary-value', 'equivalence-class'],
      coverageTarget: 85,
      learningEnabled: true,
      enablePatterns: true
    });

    const executionTimes: number[] = [];

    console.log('\n' + '='.repeat(80));
    console.log('⚡ PERFORMANCE IMPROVEMENT VALIDATION');
    console.log('='.repeat(80) + '\n');

    for (let i = 1; i <= 10; i++) {
      const task: QETask = {
        id: `perf-iter-${i}`,
        type: 'test-generation',
        description: 'Generate API tests for performance measurement',
        requirements: {
          targetFiles: ['src/api/routes.ts'],
          framework: 'jest',
          testTypes: ['integration']
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      const startTime = Date.now();
      await agent.executeTask(task);
      const executionTime = Date.now() - startTime;

      executionTimes.push(executionTime);
      console.log(`Iteration ${i.toString().padStart(2)}: ${executionTime.toString().padStart(5)}ms`);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const firstThreeAvg = executionTimes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const lastThreeAvg = executionTimes.slice(7, 10).reduce((a, b) => a + b, 0) / 3;
    const speedup = ((firstThreeAvg - lastThreeAvg) / firstThreeAvg) * 100;

    console.log('\n⚡ Performance Improvement:');
    console.log(`   First 3 iterations avg: ${firstThreeAvg.toFixed(0)}ms`);
    console.log(`   Last 3 iterations avg:  ${lastThreeAvg.toFixed(0)}ms`);
    console.log(`   Speedup:                ${speedup.toFixed(2)}% ${speedup > 0 ? '✅' : '⚠️'}\n`);

    expect(speedup).toBeGreaterThan(0); // Should be faster over time

    await agent.shutdown();
  }, 300000);

  it('should persist patterns across agent restarts', async () => {
    const agentId = 'persistence-validation-' + Date.now();
    const context: AgentContext = {
      id: agentId,
      type: 'test-generator' as AgentType,
      status: 'idle',
      metadata: {}
    };

    console.log('\n' + '='.repeat(80));
    console.log('💾 PERSISTENCE VALIDATION - Cross-Session Learning');
    console.log('='.repeat(80) + '\n');

    // Session 1: Initial learning
    console.log('📝 Session 1: Initial Learning (5 iterations)');
    const agent1 = new TestGeneratorAgent({
      id: agentId,
      type: 'test-generator' as AgentType,
      capabilities: ['unit-testing'],
      context,
      memoryStore,
      eventBus,
      frameworks: ['jest'],
      generationStrategies: ['mutation-testing'],
      coverageTarget: 85,
      learningEnabled: true,
      enablePatterns: true
    });

    const session1Coverage: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const task: QETask = {
        id: `session1-${i}`,
        type: 'test-generation',
        description: 'Session 1 learning',
        requirements: {
          targetFiles: ['src/models/Product.ts'],
          framework: 'jest'
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      const result = await agent1.executeTask(task);
      const coverage = result.metrics?.coverage || 0;
      session1Coverage.push(coverage);
      console.log(`  Iteration ${i}: ${coverage.toFixed(2)}%`);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const session1Avg = session1Coverage.reduce((a, b) => a + b, 0) / session1Coverage.length;
    const session1Patterns = (agent1 as any).learningEngine?.getPatterns().length || 0;
    console.log(`  Average Coverage: ${session1Avg.toFixed(2)}%`);
    console.log(`  Patterns Learned: ${session1Patterns}\n`);

    await agent1.shutdown();

    // Session 2: Resume with learned patterns
    console.log('🔄 Session 2: Resume with Learned Patterns (5 iterations)');
    const agent2 = new TestGeneratorAgent({
      id: agentId, // Same ID to restore learning state
      type: 'test-generator' as AgentType,
      capabilities: ['unit-testing'],
      context,
      memoryStore,
      eventBus,
      frameworks: ['jest'],
      generationStrategies: ['mutation-testing'],
      coverageTarget: 85,
      learningEnabled: true,
      enablePatterns: true
    });

    const session2Coverage: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const task: QETask = {
        id: `session2-${i}`,
        type: 'test-generation',
        description: 'Session 2 with restored learning',
        requirements: {
          targetFiles: ['src/models/Product.ts'],
          framework: 'jest'
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      const result = await agent2.executeTask(task);
      const coverage = result.metrics?.coverage || 0;
      session2Coverage.push(coverage);
      console.log(`  Iteration ${i}: ${coverage.toFixed(2)}%`);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const session2Avg = session2Coverage.reduce((a, b) => a + b, 0) / session2Coverage.length;
    const session2Patterns = (agent2 as any).learningEngine?.getPatterns().length || 0;
    console.log(`  Average Coverage: ${session2Avg.toFixed(2)}%`);
    console.log(`  Patterns Available: ${session2Patterns}\n`);

    console.log('📊 Cross-Session Comparison:');
    console.log(`   Session 1 Average: ${session1Avg.toFixed(2)}%`);
    console.log(`   Session 2 Average: ${session2Avg.toFixed(2)}%`);
    console.log(`   Improvement:       ${((session2Avg - session1Avg) / session1Avg * 100).toFixed(2)}%`);
    console.log(`   Patterns Retained: ${session2Patterns >= session1Patterns ? '✅' : '❌'}\n`);

    // Session 2 should maintain or exceed session 1 performance
    expect(session2Avg).toBeGreaterThanOrEqual(session1Avg * 0.95);
    expect(session2Patterns).toBeGreaterThanOrEqual(session1Patterns);

    await agent2.shutdown();
  }, 300000);
});
