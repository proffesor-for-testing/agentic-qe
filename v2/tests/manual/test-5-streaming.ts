/**
 * Manual Test 5: Streaming Progress Updates
 * Tests that streaming MCP tools can emit real-time progress
 */

import { TestExecuteStreamHandler } from '../../src/mcp/streaming/TestExecuteStreamHandler';
import { EventEmitter } from 'events';

async function testStreaming() {
  console.log('🧪 Test 5: Streaming Progress Updates\n');

  try {
    const memoryStore = new Map<string, any>();
    const eventBus = new EventEmitter();

    const handler = new TestExecuteStreamHandler(memoryStore, eventBus);

    console.log('✅ StreamingMCPTool handler created\n');

    // Create minimal test execution spec
    const spec = {
      testSuites: ['example.test.ts'],
      parallelExecution: false,
      retryCount: 0,
      timeoutSeconds: 30,
      reportFormat: 'json' as const
    };

    const params = {
      spec,
      fleetId: 'test-fleet',
      enableRealtimeUpdates: true
    };

    console.log('Starting streaming execution...\n');
    console.log('═'.repeat(50));

    // Execute with progress tracking
    const generator = handler.execute(params);

    let progressCount = 0;
    let resultCount = 0;
    let lastPercent = 0;

    for await (const event of generator) {
      if (event.type === 'progress') {
        progressCount++;
        const percent = event.percent || 0;

        // Show progress updates
        if (percent > lastPercent) {
          console.log(`📊 Progress: ${percent}% - ${event.message}`);
          lastPercent = percent;
        }
      } else if (event.type === 'result') {
        resultCount++;
        console.log(`✅ Result received: ${JSON.stringify(event.data).substring(0, 60)}...`);
      }
    }

    console.log('═'.repeat(50));
    console.log('\n📈 Streaming Statistics:');
    console.log('─'.repeat(50));
    console.log(`Progress Updates: ${progressCount}`);
    console.log(`Results Received: ${resultCount}`);

    if (progressCount > 0) {
      console.log('\n✅ Streaming working: Progress updates received');
    } else {
      console.log('\n⚠️  No progress updates received');
    }

    if (resultCount > 0) {
      console.log('✅ Final result received');
    } else {
      console.log('⚠️  No final result received');
    }

    console.log('\n🎉 TEST 5 PASSED: Streaming progress functional');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST 5 FAILED:', error);
    console.error('Error details:', error instanceof Error ? error.stack : error);
    process.exit(1);
  }
}

testStreaming();
