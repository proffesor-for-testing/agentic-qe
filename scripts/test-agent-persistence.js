const path = require('path');
const db = require('better-sqlite3');

async function testAgentPersistence() {
  console.log('=== TESTING QE AGENT PERSISTENCE ===\n');

  // Import modules
  const { AgentRegistry } = require('../dist/mcp/services/AgentRegistry.js');

  const dbPath = path.join(process.cwd(), '.agentic-qe/memory.db');
  console.log('📁 Database path:', dbPath, '\n');

  // Check initial state (skip if database doesn't exist yet)
  let initialQValues = { count: 0 };
  let initialExperiences = { count: 0 };
  if (require('fs').existsSync(dbPath)) {
    const checkDb = db(dbPath, { readonly: true });
    initialQValues = checkDb.prepare('SELECT COUNT(*) as count FROM q_values').get();
    initialExperiences = checkDb.prepare('SELECT COUNT(*) as count FROM learning_experiences').get();
    checkDb.close();
  }
  console.log('📊 BEFORE Agent Execution:');
  console.log('   Q-values:', initialQValues.count);
  console.log('   Experiences:', initialExperiences.count);

  console.log('\n🤖 Spawning QE Agent via AgentRegistry...\n');

  try {
    // Create registry
    const registry = new AgentRegistry({
      maxAgents: 10,
      enableMetrics: true
    });

    // Wait for memory store initialization
    console.log('⏳ Waiting for memory store initialization...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Spawn test generator agent
    console.log('🚀 Spawning test-generator agent...');
    const { id, agent } = await registry.spawnAgent('test-generator', {
      name: 'TestGen-Persistence-Test',
      description: 'Agent for testing persistence',
      capabilities: ['unit-test-generation']
    });

    console.log('✅ Agent spawned successfully!');
    console.log('   Agent ID:', id);
    console.log('   Has learningEngine:', !!agent.learningEngine);
    if (agent.learningEngine) {
      console.log('   Learning enabled:', agent.learningEngine.isEnabled());
    }

    console.log('\n📝 Executing test task...\n');

    // Create a simple task
    const task = {
      id: 'task-' + Date.now(),
      type: 'unit-test-generation',
      targetFile: 'src/learning/LearningEngine.ts',
      framework: 'jest'
    };

    // Execute task
    const result = await registry.executeTask(id, task);

    console.log('✅ Task completed!');
    console.log('   Success:', result.success);

    // Wait for async persistence
    console.log('\n⏳ Waiting for data persistence...');
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('\n📊 AFTER Agent Execution:\n');

    // Check database again
    const checkDbAfter = db(dbPath, { readonly: true });
    const qValues = checkDbAfter.prepare('SELECT COUNT(*) as count FROM q_values').get();
    const experiences = checkDbAfter.prepare('SELECT COUNT(*) as count FROM learning_experiences').get();

    console.log('📈 Q-VALUES:', qValues.count, 'entries');
    console.log('🧪 EXPERIENCES:', experiences.count, 'entries');

    if (qValues.count > initialQValues.count || experiences.count > initialExperiences.count) {
      console.log('\n✅ SUCCESS: Data WAS persisted!');
      console.log('   Q-values: ' + initialQValues.count + ' → ' + qValues.count);
      console.log('   Experiences: ' + initialExperiences.count + ' → ' + experiences.count);

      if (qValues.count > 0) {
        console.log('\n📋 Sample Q-value:');
        const sample = checkDbAfter.prepare('SELECT agent_id, state_key, action_key, q_value FROM q_values LIMIT 1').get();
        console.log('   Agent:', sample.agent_id);
        console.log('   State:', sample.state_key.substring(0, 80));
        console.log('   Action:', sample.action_key.substring(0, 80));
        console.log('   Q-value:', sample.q_value);
      }

      if (experiences.count > 0) {
        console.log('\n📋 Sample Experience:');
        const sample = checkDbAfter.prepare('SELECT agent_id, task_type, reward FROM learning_experiences LIMIT 1').get();
        console.log('   Agent:', sample.agent_id);
        console.log('   Task:', sample.task_type);
        console.log('   Reward:', sample.reward);
      }
    } else {
      console.log('\n⚠️  NO NEW DATA persisted');
      console.log('   This may indicate learning is not enabled or task did not trigger learning hooks');
    }

    checkDbAfter.close();

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  }
}

testAgentPersistence()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
