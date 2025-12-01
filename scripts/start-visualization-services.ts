#!/usr/bin/env node
/**
 * Start all Phase 3 visualization services
 * - WebSocket server on port 8080
 * - REST API server on port 3001
 */

import { EventStore } from '../dist/persistence/event-store.js';
import { ReasoningStore } from '../dist/persistence/reasoning-store.js';
import { WebSocketServer } from '../dist/visualization/api/WebSocketServer.js';
import { RestApiServer } from '../dist/visualization/api/RestEndpoints.js';

async function main() {
  console.log('🚀 Starting Phase 3 Visualization Services...\n');

  try {
    // Initialize stores (database is created in constructor)
    const eventStore = new EventStore({ dbPath: './data/agentic-qe.db' });
    const reasoningStore = new ReasoningStore({ dbPath: './data/agentic-qe.db' });
    console.log('✅ Database stores initialized\n');

    // Start WebSocket server
    const wsServer = new WebSocketServer(eventStore, reasoningStore, {
      port: 8080,
      heartbeatInterval: 30000,
    });
    await wsServer.start();
    console.log('✅ WebSocket server started on port 8080');

    // Start REST API server
    const restServer = new RestApiServer(eventStore, reasoningStore, {
      port: 3001,
    });
    await restServer.start();
    console.log('✅ REST API server started on port 3001');

    console.log('\n📊 Services running:');
    console.log('  • WebSocket server: ws://localhost:8080');
    console.log('  • REST API server:  http://localhost:3001');
    console.log('\n💡 To start the React frontend, run in a separate terminal:');
    console.log('  cd frontend && npm run dev\n');
    console.log('Press Ctrl+C to stop services');

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down services...');
      await wsServer.stop();
      await restServer.stop();
      console.log('✅ Services stopped');
      process.exit(0);
    });

    // Prevent process from exiting
    await new Promise(() => {});
  } catch (error) {
    console.error('❌ Failed to start services:', error);
    console.error(error);
    process.exit(1);
  }
}

main();
