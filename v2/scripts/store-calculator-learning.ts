#!/usr/bin/env tsx

/**
 * Store learning data for Calculator test generation
 * Demonstrates Q-learning integration with pattern storage
 */

import { LearningStorePatternHandler } from '../src/mcp/handlers/learning/learning-store-pattern';
import { LearningStoreExperienceHandler } from '../src/mcp/handlers/learning/learning-store-experience';
import { LearningStoreQValueHandler } from '../src/mcp/handlers/learning/learning-store-qvalue';
import { LearningQueryHandler } from '../src/mcp/handlers/learning/learning-query';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { AgentRegistry } from '../src/mcp/services/AgentRegistry';
import { HookExecutor } from '../src/mcp/services/HookExecutor';

async function main() {
  console.log('📚 Storing Calculator test generation learning data...\n');

  // Initialize required dependencies
  console.log('🔧 Initializing memory manager and services...');
  const memoryManager = new SwarmMemoryManager('.agentic-qe/db/memory.db');
  await memoryManager.initialize();
  const registry = new AgentRegistry(memoryManager);
  const hookExecutor = new HookExecutor(registry, memoryManager);
  console.log('✅ Initialization complete\n');

  // Initialize handlers with dependencies
  const patternHandler = new LearningStorePatternHandler(registry, hookExecutor, memoryManager);
  const experienceHandler = new LearningStoreExperienceHandler(registry, hookExecutor, memoryManager);
  const qvalueHandler = new LearningStoreQValueHandler(registry, hookExecutor, memoryManager);
  const queryHandler = new LearningQueryHandler(registry, hookExecutor, memoryManager);

  try {
    // 1. Store the successful pattern
    console.log('1️⃣ Storing test generation pattern...');
    const patternResult = await patternHandler.handle({
      pattern: 'Unit test generation for simple utility classes with error handling: Use comprehensive test suites with edge cases (NaN, Infinity, zero), boundary values, decimal precision testing with toBeCloseTo, and explicit error case validation using toThrow. Structure tests by method with nested describe blocks for better organization.',
      confidence: 0.95,
      domain: 'unit-testing',
      successRate: 1.0,
      usageCount: 1,
      agentId: 'qe-test-generator',
      metadata: {
        framework: 'jest',
        testCount: 31,
        coverageAreas: ['basic-operations', 'edge-cases', 'error-handling', 'boundary-values'],
        techniques: ['equivalence-partitioning', 'boundary-value-analysis', 'error-condition-testing'],
        bestPractices: ['nested-describe-blocks', 'beforeEach-setup', 'toBeCloseTo-for-decimals', 'toThrow-for-errors']
      }
    });
    console.log('✅ Pattern stored:', patternResult.success ? 'SUCCESS' : 'FAILED');
    if (patternResult.data) {
      console.log('   Pattern ID:', patternResult.data.pattern_id);
    }

    // 2. Store the learning experience
    console.log('\n2️⃣ Storing learning experience...');
    const experienceResult = await experienceHandler.handle({
      agentId: 'qe-test-generator',
      taskType: 'test-generation',
      reward: 0.9,
      outcome: {
        testsGenerated: 31,
        coverage: 0.95,
        framework: 'jest',
        testTypes: ['unit'],
        edgeCasesCovered: ['NaN', 'Infinity', 'zero', 'negative-numbers', 'decimals'],
        errorHandlingTests: 2,
        executionTime: 644
      },
      metadata: {
        className: 'Calculator',
        methodsTested: ['add', 'subtract', 'multiply', 'divide'],
        testOrganization: 'nested-describe-blocks',
        assertionTypes: ['toBe', 'toBeCloseTo', 'toThrow', 'toBeNaN']
      },
      timestamp: Date.now()
    });
    console.log('✅ Experience stored:', experienceResult.success ? 'SUCCESS' : 'FAILED');
    if (experienceResult.data) {
      console.log('   Experience ID:', experienceResult.data.experience_id);
    }

    // 3. Store the Q-value for decision-making
    console.log('\n3️⃣ Storing Q-value...');
    const qvalueResult = await qvalueHandler.handle({
      agentId: 'qe-test-generator',
      stateKey: 'simple-class-with-error-handling',
      actionKey: 'generate-comprehensive-unit-tests',
      qValue: 0.92,
      updateCount: 1,
      metadata: {
        context: 'calculator-utility',
        complexity: 'low',
        testStrategy: 'comprehensive-coverage',
        resultQuality: 'high',
        reusability: 'high'
      }
    });
    console.log('✅ Q-value stored:', qvalueResult.success ? 'SUCCESS' : 'FAILED');
    if (qvalueResult.data) {
      console.log('   Q-value ID:', qvalueResult.data.qvalue_id);
      console.log('   Q-value:', qvalueResult.data.q_value);
    }

    // 4. Query to verify storage
    console.log('\n4️⃣ Verifying stored data...');
    const queryResult = await queryHandler.handle({
      agentId: 'qe-test-generator',
      taskType: 'test-generation',
      queryType: 'all',
      limit: 5
    });
    console.log('✅ Query result:', queryResult.success ? 'SUCCESS' : 'FAILED');
    if (queryResult.data) {
      console.log('   Experiences found:', queryResult.data.experiences?.length || 0);
      console.log('   Q-values found:', queryResult.data.qvalues?.length || 0);
      console.log('   Patterns found:', queryResult.data.patterns?.length || 0);
    }

    console.log('\n✅ All learning data stored successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Tests Generated: 31');
    console.log('   - Coverage: 95%');
    console.log('   - Framework: Jest');
    console.log('   - Reward Score: 0.9/1.0');
    console.log('   - Q-value: 0.92');
    console.log('   - Pattern Confidence: 95%');

  } catch (error) {
    console.error('❌ Error storing learning data:', error);
    process.exit(1);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await memoryManager.shutdown();
    console.log('✅ Cleanup complete');
  }
}

// Run the script
main().catch(console.error);
