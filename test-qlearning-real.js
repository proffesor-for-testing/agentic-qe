const path = require('path');
const db = require('better-sqlite3');

async function testRealQLearning() {
  console.log('=== TESTING REAL Q-LEARNING PERSISTENCE ===\n');

  const { AgentRegistry } = require('./dist/mcp/services/AgentRegistry.js');
  const { TaskAssignment, TaskPriority } = require('./dist/types');

  const dbPath = path.join(process.cwd(), '.agentic-qe/memory.db');
  console.log('📁 Database path:', dbPath, '\n');

  // Check initial state
  const checkDb = db(dbPath, { readonly: true });
  const initialQValues = checkDb.prepare('SELECT COUNT(*) as count FROM q_values').get();
  const initialExperiences = checkDb.prepare('SELECT COUNT(*) as count FROM learning_experiences').get();
  checkDb.close();

  console.log('📊 BEFORE Task Execution:');
  console.log('   Q-values:', initialQValues.count);
  console.log('   Experiences:', initialExperiences.count);
  console.log('');

  try {
    // Create registry
    const registry = new AgentRegistry({
      maxAgents: 10,
      enableMetrics: true
    });

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Spawn test generator agent
    console.log('🚀 Spawning test-generator agent...\n');
    const { id, agent } = await registry.spawnAgent('test-generator', {
      name: 'TestGen-QLearning',
      capabilities: ['unit-test-generation']
    });

    console.log('✅ Agent spawned:');
    console.log('   ID:', id);
    console.log('   Has learningEngine:', !!agent.learningEngine);
    console.log('   Learning enabled:', agent.learningEngine?.isEnabled());
    console.log('');

    // Create proper TaskAssignment
    const taskAssignment = {
      id: `task-${Date.now()}`,
      agentId: id,
      task: {
        type: 'unit-test-generation',
        description: 'Generate unit tests for a simple utility function',
        targetFile: 'src/utils/Logger.ts',
        framework: 'jest',
        coverage: true
      },
      priority: 'medium',
      assignedAt: new Date(),
      status: 'pending'
    };

    console.log('📝 Executing task with proper TaskAssignment...\n');

    // Execute via agent's executeTask method (which triggers onPostTask hook)
    const result = await agent.executeTask(taskAssignment.task);

    console.log('✅ Task execution completed:');
    console.log('   Status:', result.status || 'completed');
    console.log('   Success:', result.success !== false);
    console.log('');

    // Wait for async persistence
    console.log('⏳ Waiting for Q-learning persistence (2 seconds)...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check database after execution
    const checkDbAfter = db(dbPath, { readonly: true });
    const finalQValues = checkDbAfter.prepare('SELECT COUNT(*) as count FROM q_values').get();
    const finalExperiences = checkDbAfter.prepare('SELECT COUNT(*) as count FROM learning_experiences').get();

    console.log('📊 AFTER Task Execution:');
    console.log('   Q-values:', finalQValues.count);
    console.log('   Experiences:', finalExperiences.count);
    console.log('');

    // Show the difference
    const qValuesDelta = finalQValues.count - initialQValues.count;
    const experiencesDelta = finalExperiences.count - initialExperiences.count;

    if (qValuesDelta > 0 || experiencesDelta > 0) {
      console.log('🎉 SUCCESS! Q-Learning data WAS persisted:');
      console.log('   Q-values: +' + qValuesDelta + ' entries');
      console.log('   Experiences: +' + experiencesDelta + ' entries');
      console.log('');

      // Show sample Q-value
      if (finalQValues.count > 0) {
        const qvalue = checkDbAfter.prepare(`
          SELECT agent_id, state_key, action_key, q_value, visit_count
          FROM q_values
          ORDER BY updated_at DESC
          LIMIT 1
        `).get();

        console.log('📈 Sample Q-Value (most recent):');
        console.log('   Agent:', qvalue.agent_id);
        console.log('   State:', qvalue.state_key.substring(0, 60) + '...');
        console.log('   Action:', qvalue.action_key.substring(0, 60) + '...');
        console.log('   Q-value:', qvalue.q_value.toFixed(4));
        console.log('   Visits:', qvalue.visit_count);
        console.log('');
      }

      // Show sample experience
      if (finalExperiences.count > 0) {
        const exp = checkDbAfter.prepare(`
          SELECT agent_id, task_type, reward, outcome
          FROM learning_experiences
          ORDER BY timestamp DESC
          LIMIT 1
        `).get();

        console.log('🧪 Sample Experience (most recent):');
        console.log('   Agent:', exp.agent_id);
        console.log('   Task Type:', exp.task_type);
        console.log('   Reward:', exp.reward.toFixed(4));
        console.log('   Outcome:', exp.outcome);
        console.log('');
      }
    } else {
      console.log('⚠️  NO Q-learning data persisted');
      console.log('   This indicates the onPostTask hook may not have triggered');
      console.log('');
    }

    checkDbAfter.close();

    // Clean up
    await registry.terminateAgent(id);
    console.log('✅ Agent terminated successfully');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testRealQLearning()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
