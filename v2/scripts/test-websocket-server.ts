#!/usr/bin/env ts-node
/**
 * Test script to verify WebSocket server implementation
 */

import { WebSocketServer } from '../src/visualization/api/WebSocketServer';
import { EventStore } from '../src/persistence/event-store';
import { ReasoningStore } from '../src/persistence/reasoning-store';
import { WebSocket } from 'ws';

async function testWebSocketServer() {
  console.log('🧪 Testing WebSocket Server Implementation\n');

  // Create stores
  const eventStore = new EventStore();
  const reasoningStore = new ReasoningStore();

  // Create WebSocket server
  const wsServer = new WebSocketServer(eventStore, reasoningStore, {
    port: 8080,
    heartbeatInterval: 5000,
    clientTimeout: 10000,
  });

  // Setup event listeners
  wsServer.on('started', ({ port }) => {
    console.log(`✅ Server started on port ${port}`);

    // Wait a moment then verify port binding
    setTimeout(async () => {
      try {
        // Verify port is bound
        const { exec } = require('child_process');
        exec('netstat -an | grep 8080', (error: any, stdout: string) => {
          if (stdout.includes('8080')) {
            console.log('✅ Port 8080 is bound and listening');
            console.log('   ' + stdout.trim().split('\n')[0]);
          } else {
            console.log('❌ Port 8080 not found in netstat output');
          }
        });

        // Test WebSocket client connection
        console.log('\n🔌 Testing WebSocket client connection...');
        const client = new WebSocket('ws://localhost:8080');

        client.on('open', () => {
          console.log('✅ Client connected successfully');
          client.close();
        });

        client.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString());
          console.log(`📨 Received message type: ${message.type}`);
        });

        client.on('error', (error: Error) => {
          console.log(`❌ Client error: ${error.message}`);
        });

        client.on('close', async () => {
          console.log('✅ Client disconnected');

          // Stop server after tests
          setTimeout(async () => {
            console.log('\n🛑 Stopping server...');
            await wsServer.stop();
            console.log('✅ Server stopped successfully');
            process.exit(0);
          }, 1000);
        });

      } catch (error) {
        console.error('❌ Error during test:', error);
        await wsServer.stop();
        process.exit(1);
      }
    }, 500);
  });

  wsServer.on('error', ({ error, source }) => {
    console.error(`❌ Server error (${source}):`, error);
  });

  wsServer.on('client_connected', ({ clientId, subscriptions }) => {
    console.log(`✅ Client connected: ${clientId}`);
  });

  wsServer.on('client_disconnected', ({ clientId, reason }) => {
    console.log(`✅ Client disconnected: ${clientId} (${reason})`);
  });

  // Start the server
  try {
    console.log('🚀 Starting WebSocket server...\n');
    await wsServer.start();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run the test
testWebSocketServer().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
