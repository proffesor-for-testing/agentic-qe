#!/usr/bin/env ts-node
/**
 * Test script for Express REST API server
 * Verifies that the server starts correctly and responds to requests
 */

import { RestApiServer } from '../src/visualization/api/RestEndpoints';
import { EventStore } from '../src/persistence/event-store';
import { ReasoningStore } from '../src/persistence/reasoning-store';
import * as http from 'http';

async function testRestApi() {
  console.log('🚀 Testing Express REST API Server...\n');

  // Initialize stores
  const eventStore = new EventStore();
  const reasoningStore = new ReasoningStore();

  // Create REST API server with port 3001
  const server = new RestApiServer(eventStore, reasoningStore, {
    port: 3001,
    enableCors: true,
    enableEtag: true,
  });

  try {
    // Start server
    console.log('📡 Starting REST API server on port 3001...');
    await server.start();
    console.log('✅ Server started successfully!\n');

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test endpoints
    console.log('🧪 Testing endpoints:\n');

    const tests = [
      { name: 'GET /api/visualization/events', path: '/api/visualization/events' },
      { name: 'GET /api/visualization/metrics', path: '/api/visualization/metrics' },
      { name: 'GET /api/visualization/reasoning/test-chain', path: '/api/visualization/reasoning/test-chain' },
    ];

    for (const test of tests) {
      try {
        const response = await makeRequest(test.path);
        console.log(`✅ ${test.name}: ${response.statusCode} ${response.statusMessage}`);
        if (response.body) {
          const json = JSON.parse(response.body);
          console.log(`   Response: ${JSON.stringify(json).substring(0, 100)}...`);
        }
      } catch (error: any) {
        console.log(`❌ ${test.name}: ${error.message}`);
      }
      console.log();
    }

    // Check port binding
    console.log('🔍 Checking port binding...');
    const portCheck = await checkPort(3001);
    console.log(`${portCheck ? '✅' : '❌'} Port 3001 is ${portCheck ? 'bound' : 'not bound'}\n`);

    // Stop server
    console.log('🛑 Stopping server...');
    await server.stop();
    console.log('✅ Server stopped successfully!\n');

    console.log('✨ All tests completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await server.stop();
    process.exit(1);
  }
}

function makeRequest(path: string): Promise<{ statusCode: number; statusMessage: string; body: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          statusMessage: res.statusMessage || '',
          body,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, () => {
      server.close();
      resolve(false); // Port is available (not bound)
    });
    server.on('error', () => {
      resolve(true); // Port is in use (bound)
    });
  });
}

testRestApi();
