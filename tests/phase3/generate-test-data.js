#!/usr/bin/env node
/**
 * Generate test data for Phase 3 visualization testing
 */

const { EventStore } = require('../../dist/persistence/event-store.js');
const { ReasoningStore } = require('../../dist/persistence/reasoning-store.js');

async function generateTestData() {
  console.log('📊 Generating test data for Phase 3 visualization...\n');

  // Initialize stores
  const eventStore = new EventStore({ dbPath: './data/agentic-qe.db' });
  const reasoningStore = new ReasoningStore({ dbPath: './data/agentic-qe.db' });

  const sessionId = 'test-session-' + Date.now();
  const agents = ['qe-test-generator', 'qe-coverage-analyzer', 'qe-api-tester', 'qe-perf-tester'];
  const eventTypes = ['test_generated', 'coverage_analyzed', 'test_executed', 'performance_tested'];

  console.log(`Session ID: ${sessionId}`);
  console.log(`Generating events for ${agents.length} agents...\n`);

  // Generate events for each agent
  for (let i = 0; i < 20; i++) {
    const agent = agents[i % agents.length];
    const eventType = eventTypes[i % eventTypes.length];

    const event = eventStore.recordEvent({
      session_id: sessionId,
      agent_id: agent,
      event_type: eventType,
      payload: {
        test_count: Math.floor(Math.random() * 100),
        coverage: Math.floor(Math.random() * 100),
        duration_ms: Math.floor(Math.random() * 5000),
        status: i % 5 === 0 ? 'error' : 'completed',
        metadata: {
          iteration: i + 1,
          total_iterations: 20
        }
      }
    });

    console.log(`✅ Event ${i + 1}/20: ${agent} - ${eventType}`);
  }

  // Skip reasoning chains for now - focusing on event data
  console.log('\n⏭️  Skipping reasoning chains (not required for visualization test)\n');

  // Get statistics
  const eventStats = eventStore.getStatistics();
  const reasoningStats = reasoningStore.getStatistics();

  console.log('\n📈 Statistics:');
  console.log(`  Total Events: ${eventStats.totalEvents}`);
  console.log(`  Unique Agents: ${eventStats.uniqueAgents}`);
  console.log(`  Unique Sessions: ${eventStats.uniqueSessions}`);
  console.log(`  Total Chains: ${reasoningStats.totalChains}`);
  console.log(`  Total Steps: ${reasoningStats.totalSteps}`);
  console.log(`  Avg Steps/Chain: ${reasoningStats.avgStepsPerChain}`);

  console.log('\n✅ Test data generated successfully!');
  console.log(`\nTest the APIs:`);
  console.log(`  curl http://localhost:3001/api/visualization/events`);
  console.log(`  curl http://localhost:3001/api/visualization/metrics`);
  console.log(`  curl http://localhost:3001/api/visualization/sessions/${sessionId}`);
}

generateTestData().catch(console.error);
