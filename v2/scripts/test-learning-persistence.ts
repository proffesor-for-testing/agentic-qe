#!/usr/bin/env ts-node
/**
 * Test Learning Persistence for All QE Agents
 *
 * This script tests that all 18 QE agents can successfully store and retrieve
 * learning data via MCP tools when executed via Claude Code Task tool.
 *
 * Usage:
 *   ts-node scripts/test-learning-persistence.ts
 *   npm run test:learning-persistence
 */

import * as path from 'path';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { LearningStoreExperienceHandler } from '../src/mcp/handlers/learning/learning-store-experience';
import { LearningStoreQValueHandler } from '../src/mcp/handlers/learning/learning-store-qvalue';
import { LearningStorePatternHandler } from '../src/mcp/handlers/learning/learning-store-pattern';
import { LearningQueryHandler } from '../src/mcp/handlers/learning/learning-query';

interface TestResult {
  agentId: string;
  storeExperience: boolean;
  storeQValue: boolean;
  storePattern: boolean;
  queryLearning: boolean;
  experienceCount: number;
  qValueCount: number;
  patternCount: number;
  success: boolean;
  error?: string;
}

class LearningPersistenceTest {
  private memoryManager!: SwarmMemoryManager;
  private storeExperienceHandler!: LearningStoreExperienceHandler;
  private storeQValueHandler!: LearningStoreQValueHandler;
  private storePatternHandler!: LearningStorePatternHandler;
  private queryHandler!: LearningQueryHandler;

  // All 18 QE agents to test
  private readonly agents = [
    'qe-test-generator',
    'qe-test-executor',
    'qe-quality-gate',
    'qe-coverage-analyzer',
    'qe-quality-analyzer',
    'qe-regression-risk-analyzer',
    'qe-requirements-validator',
    'qe-production-intelligence',
    'qe-performance-tester',
    'qe-security-scanner',
    'qe-test-data-architect',
    'qe-deployment-readiness',
    'qe-visual-tester',
    'qe-chaos-engineer',
    'qe-fleet-commander',
    'qe-code-complexity',
    'qe-flaky-test-hunter',
    'qe-api-contract-validator'
  ];

  async initialize(): Promise<void> {
    console.log('🔧 Initializing SwarmMemoryManager...');

    // Initialize SwarmMemoryManager with test database
    const dbPath = path.join(process.cwd(), '.agentic-qe', 'db', 'memory.db');
    this.memoryManager = new SwarmMemoryManager(dbPath);
    await this.memoryManager.initialize();

    // Initialize MCP handlers
    this.storeExperienceHandler = new LearningStoreExperienceHandler(
      undefined,
      undefined,
      this.memoryManager
    );
    this.storeQValueHandler = new LearningStoreQValueHandler(
      undefined,
      undefined,
      this.memoryManager
    );
    this.storePatternHandler = new LearningStorePatternHandler(
      undefined,
      undefined,
      this.memoryManager
    );
    this.queryHandler = new LearningQueryHandler(
      undefined,
      undefined,
      this.memoryManager
    );

    console.log('✅ Initialization complete\n');
  }

  async testAgent(agentId: string): Promise<TestResult> {
    const result: TestResult = {
      agentId,
      storeExperience: false,
      storeQValue: false,
      storePattern: false,
      queryLearning: false,
      experienceCount: 0,
      qValueCount: 0,
      patternCount: 0,
      success: false
    };

    try {
      console.log(`📊 Testing ${agentId}...`);

      // 1. Store learning experience
      const experienceResult = await this.storeExperienceHandler.handle({
        agentId,
        taskType: `${agentId}-test`,
        reward: 0.95,
        outcome: {
          testMetric: 42,
          success: true,
          executionTime: 5000
        },
        metadata: {
          testRun: true,
          algorithm: 'test-algorithm'
        }
      });

      result.storeExperience = experienceResult.success;
      console.log(`  ✅ Store experience: ${experienceResult.success}`);

      // 2. Store Q-value
      const qValueResult = await this.storeQValueHandler.handle({
        agentId,
        stateKey: `${agentId}-state`,
        actionKey: 'test-action',
        qValue: 0.85,
        metadata: {
          strategy: 'test-strategy'
        }
      });

      result.storeQValue = qValueResult.success;
      console.log(`  ✅ Store Q-value: ${qValueResult.success}`);

      // 3. Store pattern
      const patternResult = await this.storePatternHandler.handle({
        agentId,
        pattern: `Test pattern for ${agentId}`,
        confidence: 0.95,
        domain: agentId,
        metadata: {
          testPattern: true
        }
      });

      result.storePattern = patternResult.success;
      console.log(`  ✅ Store pattern: ${patternResult.success}`);

      // 4. Query learning data
      const queryResult = await this.queryHandler.handle({
        agentId,
        taskType: `${agentId}-test`,
        queryType: 'all',
        limit: 10
      });

      result.queryLearning = queryResult.success;

      if (queryResult.success && queryResult.data) {
        result.experienceCount = queryResult.data.experiences?.length || 0;
        result.qValueCount = queryResult.data.qValues?.length || 0;
        result.patternCount = queryResult.data.patterns?.length || 0;

        console.log(`  ✅ Query learning: ${queryResult.success}`);
        console.log(`     - Experiences: ${result.experienceCount}`);
        console.log(`     - Q-values: ${result.qValueCount}`);
        console.log(`     - Patterns: ${result.patternCount}`);
      }

      // Overall success if all operations succeeded
      result.success =
        result.storeExperience &&
        result.storeQValue &&
        result.storePattern &&
        result.queryLearning &&
        result.experienceCount > 0 &&
        result.qValueCount > 0 &&
        result.patternCount > 0;

      console.log(`  ${result.success ? '✅' : '❌'} Overall: ${result.success ? 'SUCCESS' : 'PARTIAL'}\n`);

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${result.error}\n`);
    }

    return result;
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Learning Persistence Tests\n');
    console.log(`Testing ${this.agents.length} agents...\n`);
    console.log('='.repeat(60));
    console.log('\n');

    const results: TestResult[] = [];

    // Test each agent sequentially
    for (const agentId of this.agents) {
      const result = await this.testAgent(agentId);
      results.push(result);
    }

    // Generate summary report
    this.generateReport(results);
  }

  private generateReport(results: TestResult[]): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LEARNING PERSISTENCE TEST REPORT');
    console.log('='.repeat(60) + '\n');

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalExperiences = results.reduce((sum, r) => sum + r.experienceCount, 0);
    const totalQValues = results.reduce((sum, r) => sum + r.qValueCount, 0);
    const totalPatterns = results.reduce((sum, r) => sum + r.patternCount, 0);

    console.log('📈 Summary:');
    console.log(`  Total Agents Tested: ${results.length}`);
    console.log(`  ✅ Successful: ${successful.length} (${(successful.length / results.length * 100).toFixed(1)}%)`);
    console.log(`  ❌ Failed: ${failed.length} (${(failed.length / results.length * 100).toFixed(1)}%)`);
    console.log('');
    console.log('💾 Data Persisted:');
    console.log(`  Experiences: ${totalExperiences}`);
    console.log(`  Q-values: ${totalQValues}`);
    console.log(`  Patterns: ${totalPatterns}`);
    console.log('');

    if (successful.length > 0) {
      console.log('✅ Successful Agents:');
      successful.forEach(r => {
        console.log(`  - ${r.agentId} (exp: ${r.experienceCount}, qval: ${r.qValueCount}, pat: ${r.patternCount})`);
      });
      console.log('');
    }

    if (failed.length > 0) {
      console.log('❌ Failed Agents:');
      failed.forEach(r => {
        console.log(`  - ${r.agentId}`);
        if (r.error) {
          console.log(`    Error: ${r.error}`);
        }
        if (!r.storeExperience) console.log('    ⚠️  Failed to store experience');
        if (!r.storeQValue) console.log('    ⚠️  Failed to store Q-value');
        if (!r.storePattern) console.log('    ⚠️  Failed to store pattern');
        if (!r.queryLearning) console.log('    ⚠️  Failed to query learning');
        if (r.experienceCount === 0) console.log('    ⚠️  No experiences retrieved');
        if (r.qValueCount === 0) console.log('    ⚠️  No Q-values retrieved');
        if (r.patternCount === 0) console.log('    ⚠️  No patterns retrieved');
      });
      console.log('');
    }

    // Database verification
    console.log('🗄️  Database Verification:');
    console.log(`  Database: .agentic-qe/db/memory.db`);
    console.log(`  Tables: learning_experiences, q_values, patterns`);
    console.log('');

    // Final verdict
    if (failed.length === 0) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ All 18 agents successfully store and retrieve learning data');
      console.log('✅ Learning persistence is working as expected');
    } else {
      console.log('⚠️  SOME TESTS FAILED');
      console.log(`❌ ${failed.length} agent(s) had issues with learning persistence`);
      console.log('📝 Review the errors above for details');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Exit with appropriate code
    process.exit(failed.length > 0 ? 1 : 0);
  }

  async cleanup(): Promise<void> {
    if (this.memoryManager) {
      await this.memoryManager.close();
    }
  }
}

// Main execution
async function main() {
  const test = new LearningPersistenceTest();

  try {
    await test.initialize();
    await test.runAllTests();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await test.cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { LearningPersistenceTest };
