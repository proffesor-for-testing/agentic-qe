/**
 * QUIC Synchronization Example
 * Demonstrates real-time pattern sharing between agents
 */

import { QUICServer } from '../core/sync/QUICServer';
import { Pattern, QUICConfig } from '../types/quic';

/**
 * Example: Basic QUIC synchronization setup
 */
async function basicExample() {
  console.log('\n=== Basic QUIC Sync Example ===\n');

  // Configuration
  const config: QUICConfig = {
    enabled: true,
    port: 4433,
    host: '127.0.0.1',
    peers: [],
    syncInterval: 1000,
    batchSize: 100,
    compression: true,
    tls: {
      rejectUnauthorized: false
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    }
  };

  // Create server
  const server = new QUICServer(config);

  // Event handlers
  server.on('server:started', ({ port }) => {
    console.log(`✅ QUIC server started on port ${port}`);
  });

  server.on('peer:connected', ({ peerId, address }) => {
    console.log(`✅ Peer connected: ${peerId} (${address})`);
  });

  server.on('pattern:received', ({ pattern, sourceId }) => {
    console.log(`📥 Received pattern: ${pattern.id} from ${sourceId}`);
    console.log(`   Type: ${pattern.type}`);
    console.log(`   Data:`, JSON.stringify(pattern.data, null, 2));
  });

  server.on('sync:completed', ({ peerId, patternCount, latency }) => {
    console.log(`✅ Synced ${patternCount} patterns to ${peerId} (${latency}ms)`);
  });

  // Start server
  await server.start();

  // Connect to peers
  await server.connectToPeer('127.0.0.1', 4434, 'test-executor');
  await server.connectToPeer('127.0.0.1', 4435, 'coverage-analyzer');

  // Create pattern
  const pattern: Pattern = {
    id: `test_${Date.now()}`,
    agentId: 'test-generator',
    type: 'test_execution',
    data: {
      testCase: 'UserLogin',
      result: 'passed',
      duration: 152,
      coverage: 0.85
    },
    metadata: {
      source: 'test-generator',
      tags: ['unit', 'auth'],
      priority: 1
    },
    timestamp: Date.now(),
    version: 1
  };

  // Sync pattern
  await server.syncPattern(pattern);

  // Wait for sync
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Display stats
  const state = server.getState();
  console.log('\nServer Statistics:');
  console.log(`  Total syncs: ${state.stats.totalSyncs}`);
  console.log(`  Successful: ${state.stats.successfulSyncs}`);
  console.log(`  Failed: ${state.stats.failedSyncs}`);
  console.log(`  Average latency: ${state.stats.averageLatency.toFixed(2)}ms`);

  // Cleanup
  await server.stop();
  console.log('\n✅ Server stopped\n');
}

/**
 * Example: Batch synchronization
 */
async function batchSyncExample() {
  console.log('\n=== Batch Sync Example ===\n');

  const config: QUICConfig = {
    enabled: true,
    port: 4433,
    host: '127.0.0.1',
    peers: [],
    syncInterval: 0, // Disable periodic sync
    batchSize: 50,
    compression: true,
    tls: { rejectUnauthorized: false },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    }
  };

  const server = new QUICServer(config);

  await server.start();
  await server.connectToPeer('127.0.0.1', 4434, 'test-executor');

  // Generate multiple patterns
  const patterns: Pattern[] = Array.from({ length: 150 }, (_, i) => ({
    id: `pattern_${i}`,
    agentId: 'test-generator',
    type: 'test_execution',
    data: {
      testCase: `Test_${i}`,
      result: Math.random() > 0.1 ? 'passed' : 'failed',
      duration: Math.floor(Math.random() * 500)
    },
    metadata: {
      source: 'test-generator',
      tags: ['unit'],
      priority: 1
    },
    timestamp: Date.now(),
    version: 1
  }));

  console.log(`Syncing ${patterns.length} patterns in batches of ${config.batchSize}...`);

  const startTime = Date.now();
  await server.syncPatterns(patterns);
  const duration = Date.now() - startTime;

  console.log(`\n✅ Batch sync completed in ${duration}ms`);
  console.log(`   Throughput: ${(patterns.length / duration * 1000).toFixed(0)} patterns/sec`);

  const state = server.getState();
  console.log(`\nCache size: ${server.getCachedPatterns().length} patterns`);

  await server.stop();
  console.log('\n✅ Server stopped\n');
}

/**
 * Example: Multi-agent coordination
 */
async function multiAgentExample() {
  console.log('\n=== Multi-Agent Coordination Example ===\n');

  const config: QUICConfig = {
    enabled: true,
    port: 4433,
    host: '127.0.0.1',
    peers: [
      { id: 'test-executor', address: '127.0.0.1', port: 4434 },
      { id: 'coverage-analyzer', address: '127.0.0.1', port: 4435 },
      { id: 'quality-gate', address: '127.0.0.1', port: 4436 }
    ],
    syncInterval: 0,
    batchSize: 100,
    compression: true,
    tls: { rejectUnauthorized: false },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    }
  };

  const server = new QUICServer(config);

  // Track received patterns
  const receivedPatterns: Pattern[] = [];

  server.on('pattern:received', ({ pattern }) => {
    receivedPatterns.push(pattern);
    console.log(`📥 ${pattern.type}: ${pattern.id}`);
  });

  await server.start();

  // Simulate test execution pattern
  const testPattern: Pattern = {
    id: 'test_exec_1',
    agentId: 'test-generator',
    type: 'test_execution',
    data: {
      tests: ['UserLogin', 'UserLogout'],
      passed: 2,
      failed: 0,
      coverage: 0.78
    },
    metadata: {
      source: 'test-generator',
      tags: ['execution']
    },
    timestamp: Date.now(),
    version: 1
  };

  await server.syncPattern(testPattern, ['test-executor']);

  // Simulate coverage gap pattern
  const gapPattern: Pattern = {
    id: 'coverage_gap_1',
    agentId: 'coverage-analyzer',
    type: 'coverage_gap',
    data: {
      file: 'user-service.ts',
      uncoveredLines: [45, 67, 89],
      coverage: 0.78,
      targetCoverage: 0.80
    },
    metadata: {
      source: 'coverage-analyzer',
      tags: ['gap', 'priority']
    },
    timestamp: Date.now(),
    version: 1
  };

  await server.syncPattern(gapPattern, ['test-generator']);

  // Simulate quality metrics pattern
  const qualityPattern: Pattern = {
    id: 'quality_1',
    agentId: 'quality-gate',
    type: 'quality_metrics',
    data: {
      complexity: 12,
      maintainability: 85,
      testCoverage: 0.78,
      passed: false,
      reason: 'Coverage below 80%'
    },
    metadata: {
      source: 'quality-gate',
      tags: ['metrics']
    },
    timestamp: Date.now(),
    version: 1
  };

  await server.syncPattern(qualityPattern);

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n=== Coordination Summary ===');
  console.log(`Patterns synced: ${server.getCachedPatterns().length}`);
  console.log(`Patterns received: ${receivedPatterns.length}`);

  const state = server.getState();
  console.log(`\nConnected peers: ${state.connections}`);
  state.peers.forEach((peerState, id) => {
    console.log(`  ${peerState.peerId}: ${peerState.syncCount} syncs, ${peerState.errorCount} errors`);
  });

  await server.stop();
  console.log('\n✅ Multi-agent coordination completed\n');
}

/**
 * Example: Error handling and recovery
 */
async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===\n');

  const config: QUICConfig = {
    enabled: true,
    port: 4433,
    host: '127.0.0.1',
    peers: [],
    syncInterval: 0,
    batchSize: 100,
    compression: true,
    tls: { rejectUnauthorized: false },
    retry: {
      maxAttempts: 3,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 2
    }
  };

  const server = new QUICServer(config);

  // Error event handlers
  server.on('peer:error', ({ peerId, error }) => {
    console.error(`❌ Peer error (${peerId}):`, error.message);
  });

  server.on('sync:failed', ({ peerId, patternId, error }) => {
    console.error(`❌ Sync failed (${peerId}, ${patternId}):`, error.message);
  });

  server.on('peer:health:degraded', ({ peerId, state }) => {
    console.warn(`⚠️  Peer health degraded (${peerId}):`, {
      errorCount: state.errorCount,
      lastSync: new Date(state.lastSync).toISOString()
    });
  });

  await server.start();

  // Try to sync without peers
  const pattern: Pattern = {
    id: 'test_1',
    agentId: 'test-generator',
    type: 'test_execution',
    data: {},
    metadata: { source: 'test', tags: [] },
    timestamp: Date.now(),
    version: 1
  };

  console.log('Attempting sync with no peers...');
  await server.syncPattern(pattern);

  // Connect to peer
  await server.connectToPeer('127.0.0.1', 4434, 'test-peer');

  // Sync successfully
  console.log('\nAttempting sync with connected peer...');
  await server.syncPattern(pattern);

  await new Promise(resolve => setTimeout(resolve, 500));

  await server.stop();
  console.log('\n✅ Error handling example completed\n');
}

/**
 * Run all examples
 */
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  QUIC Synchronization Examples          ║');
  console.log('╚══════════════════════════════════════════╝');

  try {
    await basicExample();
    await batchSyncExample();
    await multiAgentExample();
    await errorHandlingExample();

    console.log('╔══════════════════════════════════════════╗');
    console.log('║  All examples completed successfully!   ║');
    console.log('╚══════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

// Run examples if executed directly
if (require.main === module) {
  main();
}

export {
  basicExample,
  batchSyncExample,
  multiAgentExample,
  errorHandlingExample
};
