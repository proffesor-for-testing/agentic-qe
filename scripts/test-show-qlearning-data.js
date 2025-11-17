/**
 * Direct demonstration of Q-learning persistence using LearningEngine API
 * This bypasses BaseAgent to directly test the learning system
 */

const path = require('path');
const fs = require('fs');
const db = require('better-sqlite3');

async function showQLearningData() {
  console.log('=== Q-LEARNING PERSISTENCE DEMONSTRATION ===\n');

  // Import required modules
  const { LearningEngine } = require('../dist/learning/LearningEngine.js');
  const { SwarmMemoryManager } = require('../dist/core/memory/SwarmMemoryManager.js');
  const { Database } = require('../dist/utils/Database.js');

  const dbPath = path.join(process.cwd(), '.agentic-qe/memory.db');
  const testDbPath = path.join(process.cwd(), '.agentic-qe/demo-learning.db');

  // Remove old demo database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('🗑️  Removed old demo database\n');
  }

  console.log('📁 Demo database:', testDbPath, '\n');

  try {
    // Create memory manager and database
    const memoryManager = new SwarmMemoryManager(testDbPath);
    await memoryManager.initialize();

    const database = new Database(testDbPath);
    await database.initialize();

    // Create learning engine
    const agentId = 'demo-test-generator';
    const learningEngine = new LearningEngine(
      agentId,
      memoryManager,
      {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95,
        explorationRate: 0.3
      },
      database
    );
    await learningEngine.initialize();

    console.log('✅ LearningEngine initialized\n');

    // Check initial state
    const checkDb = db(testDbPath, { readonly: true });
    const initialQValues = checkDb.prepare('SELECT COUNT(*) as count FROM q_values').get();
    const initialExperiences = checkDb.prepare('SELECT COUNT(*) as count FROM learning_experiences').get();
    const initialPatterns = checkDb.prepare('SELECT COUNT(*) as count FROM patterns').get();
    checkDb.close();

    console.log('📊 BEFORE Learning:');
    console.log('   Q-values:', initialQValues.count);
    console.log('   Experiences:', initialExperiences.count);
    console.log('');

    // Simulate 5 task executions with varying outcomes
    console.log('🚀 Executing 5 tasks to generate learning data...\n');

    const tasks = [
      {
        type: 'unit-test-generation',
        context: { framework: 'jest', complexity: 'simple' },
        requirements: { capabilities: ['code-analysis', 'test-generation'] }
      },
      {
        type: 'unit-test-generation',
        context: { framework: 'jest', complexity: 'moderate' },
        requirements: { capabilities: ['code-analysis', 'test-generation'] }
      },
      {
        type: 'integration-test-generation',
        context: { framework: 'jest', complexity: 'complex' },
        requirements: { capabilities: ['api-testing', 'test-generation'] }
      },
      {
        type: 'unit-test-generation',
        context: { framework: 'vitest', complexity: 'simple' },
        requirements: { capabilities: ['code-analysis', 'test-generation'] }
      },
      {
        type: 'unit-test-generation',
        context: { framework: 'jest', complexity: 'simple' },
        requirements: { capabilities: ['code-analysis', 'test-generation'] }
      }
    ];

    const results = [
      {
        success: true,
        executionTime: 1200,
        errors: [],
        coverage: 0.92,
        metadata: { strategy: 'template-based', testsGenerated: 15 }
      },
      {
        success: true,
        executionTime: 2100,
        errors: [],
        coverage: 0.87,
        metadata: { strategy: 'ast-analysis', testsGenerated: 23 }
      },
      {
        success: true,
        executionTime: 3400,
        errors: [],
        coverage: 0.78,
        metadata: { strategy: 'integration', testsGenerated: 12 }
      },
      {
        success: false,
        executionTime: 500,
        errors: ['Framework not supported'],
        coverage: 0,
        metadata: { strategy: 'template-based', testsGenerated: 0 }
      },
      {
        success: true,
        executionTime: 1100,
        errors: [],
        coverage: 0.95,
        metadata: { strategy: 'template-based', testsGenerated: 18 }
      }
    ];

    for (let i = 0; i < tasks.length; i++) {
      console.log(`   Task ${i + 1}/5: ${tasks[i].type} (${tasks[i].context.complexity})`);
      await learningEngine.learnFromExecution(tasks[i], results[i]);
    }

    // CRITICAL: Flush batched writes before checking database
    await learningEngine.flush();
    console.log('\n✅ All tasks completed and learning data persisted\n');

    // Check final state
    const finalDb = db(testDbPath, { readonly: true });
    const finalQValues = finalDb.prepare('SELECT COUNT(*) as count FROM q_values').get();
    const finalExperiences = finalDb.prepare('SELECT COUNT(*) as count FROM learning_experiences').get();
    const finalPatterns = finalDb.prepare('SELECT COUNT(*) as count FROM patterns').get();

    console.log('📊 AFTER Learning:');
    console.log('   Q-values:', finalQValues.count);
    console.log('   Experiences:', finalExperiences.count);
    console.log('   Patterns:', finalPatterns.count);
    console.log('');

    // Show the delta
    console.log('🎉 DATA PERSISTED:');
    console.log('   Q-values: +' + (finalQValues.count - initialQValues.count));
    console.log('   Experiences: +' + (finalExperiences.count - initialExperiences.count));
    console.log('   Patterns: +' + (finalPatterns.count - initialPatterns.count));
    console.log('');

    // Show sample data
    if (finalQValues.count > 0) {
      console.log('📈 Sample Q-Values (top 3 by Q-value):');
      const qvalues = finalDb.prepare(`
        SELECT agent_id, state_key, action_key, q_value, update_count
        FROM q_values
        ORDER BY q_value DESC
        LIMIT 3
      `).all();

      qvalues.forEach((qv, idx) => {
        console.log(`   ${idx + 1}. Q=${qv.q_value.toFixed(4)} updates=${qv.update_count}`);
        console.log(`      State: ${qv.state_key.substring(0, 60)}...`);
        console.log(`      Action: ${qv.action_key.substring(0, 60)}...`);
      });
      console.log('');
    }

    if (finalExperiences.count > 0) {
      console.log('🧪 Sample Experiences (most recent 3):');
      const experiences = finalDb.prepare(`
        SELECT agent_id, task_type, reward, state, action, timestamp
        FROM learning_experiences
        ORDER BY timestamp DESC
        LIMIT 3
      `).all();

      experiences.forEach((exp, idx) => {
        const outcome = exp.reward > 0 ? 'success' : 'failure';
        console.log(`   ${idx + 1}. ${exp.task_type} → ${outcome} (reward: ${exp.reward.toFixed(4)})`);
        console.log(`      State: ${exp.state.substring(0, 50)}...`);
        console.log(`      Action: ${exp.action.substring(0, 50)}...`);
      });
      console.log('');
    }

    finalDb.close();

    console.log('✅ Q-Learning persistence demonstration complete!');
    console.log('📁 Demo database preserved at:', testDbPath);
    console.log('');

    // Clean up
    await database.close();
    if (memoryManager.db) {
      memoryManager.db.close();
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

showQLearningData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
