#!/usr/bin/env node
/**
 * Performance test for Phase 3 visualization
 * Tests handling of 1000+ events
 */

const { EventStore } = require('../../dist/persistence/event-store.js');

async function performanceTest() {
  console.log('🚀 Phase 3 Performance Test - 1000+ Events\n');

  const eventStore = new EventStore({ dbPath: './data/agentic-qe.db' });
  const sessionId = 'perf-test-' + Date.now();
  const totalEvents = 1000;
  const agents = [
    'qe-test-generator',
    'qe-coverage-analyzer',
    'qe-api-tester',
    'qe-perf-tester',
    'qe-security-scanner',
    'qe-flaky-detector'
  ];

  console.log(`Session ID: ${sessionId}`);
  console.log(`Target: ${totalEvents} events`);
  console.log(`Agents: ${agents.length}\n`);

  // Performance metrics
  const startTime = Date.now();
  let eventsCreated = 0;

  console.log('⏱️  Starting event generation...\n');

  // Generate events in batches for better performance
  const batchSize = 100;
  for (let batch = 0; batch < totalEvents / batchSize; batch++) {
    const batchStart = Date.now();

    for (let i = 0; i < batchSize; i++) {
      const eventIndex = batch * batchSize + i;
      const agent = agents[eventIndex % agents.length];

      eventStore.recordEvent({
        session_id: sessionId,
        agent_id: agent,
        event_type: 'test_executed',
        payload: {
          test_id: `test-${eventIndex}`,
          status: eventIndex % 10 === 0 ? 'failed' : 'passed',
          duration_ms: Math.floor(Math.random() * 1000),
          coverage: 70 + Math.floor(Math.random() * 30),
          assertions: Math.floor(Math.random() * 50)
        }
      });
      eventsCreated++;
    }

    const batchDuration = Date.now() - batchStart;
    const batchThroughput = (batchSize / batchDuration * 1000).toFixed(2);
    console.log(`  Batch ${batch + 1}/${totalEvents / batchSize}: ${batchSize} events in ${batchDuration}ms (${batchThroughput} events/sec)`);
  }

  const totalDuration = Date.now() - startTime;
  const throughput = (eventsCreated / totalDuration * 1000).toFixed(2);

  console.log('\n📊 Performance Results:');
  console.log(`  Events Created: ${eventsCreated}`);
  console.log(`  Total Duration: ${totalDuration}ms`);
  console.log(`  Average Throughput: ${throughput} events/sec`);
  console.log(`  Average Latency: ${(totalDuration / eventsCreated).toFixed(2)}ms per event`);

  // Test API query performance
  console.log('\n🔍 Testing API Query Performance...\n');

  const queryStart = Date.now();
  const stats = eventStore.getStatistics();
  const queryDuration = Date.now() - queryStart;

  console.log(`  Statistics Query: ${queryDuration}ms`);
  console.log(`  Total Events in DB: ${stats.totalEvents}`);
  console.log(`  Unique Agents: ${stats.uniqueAgents}`);
  console.log(`  Unique Sessions: ${stats.uniqueSessions}`);

  // Test recent events query
  const recentStart = Date.now();
  const recentEvents = eventStore.getRecentEvents(100);
  const recentDuration = Date.now() - recentStart;

  console.log(`  Recent Events Query (100): ${recentDuration}ms`);

  // Test agent-specific query
  const agentStart = Date.now();
  const agentEvents = eventStore.getEventsByAgent('qe-test-generator', { limit: 100 });
  const agentDuration = Date.now() - agentStart;

  console.log(`  Agent Events Query (100): ${agentDuration}ms`);

  // Performance assessment
  console.log('\n✅ Performance Assessment:');
  const writePerf = throughput > 100 ? 'EXCELLENT' : throughput > 50 ? 'GOOD' : 'NEEDS IMPROVEMENT';
  const queryPerf = queryDuration < 100 ? 'EXCELLENT' : queryDuration < 500 ? 'GOOD' : 'NEEDS IMPROVEMENT';

  console.log(`  Write Performance: ${writePerf} (${throughput} events/sec)`);
  console.log(`  Query Performance: ${queryPerf} (${queryDuration}ms for stats)`);

  if (throughput > 100 && queryDuration < 100) {
    console.log('\n🎉 All performance benchmarks PASSED!');
  } else {
    console.log('\n⚠️  Some performance benchmarks need improvement');
  }

  console.log('\nTest API endpoint:');
  console.log(`  curl http://localhost:3001/api/visualization/metrics`);
  console.log(`  curl http://localhost:3001/api/visualization/sessions/${sessionId}`);
}

performanceTest().catch(console.error);
