#!/usr/bin/env node
/**
 * Query AQE Memory - Simple utility to query SwarmMemoryManager
 *
 * Usage:
 *   npm run query-memory -- <key>
 *   ts-node scripts/query-aqe-memory-single.ts <key>
 *
 * Examples:
 *   npm run query-memory -- aqe/orchestrator/status
 *   npm run query-memory -- "aqe/validation/checkpoint-*"
 *   npm run query-memory -- aqe/final-go-decision
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function queryMemory(key: string) {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(dbPath);

  try {
    await memoryStore.initialize();

    console.log(`\n🔍 Querying memory for key: ${key}\n`);

    // Check if key contains wildcard
    if (key.includes('*')) {
      // Query pattern
      const results = await memoryStore.query(key, { partition: 'coordination' });

      if (results.length === 0) {
        console.log('❌ No results found');
      } else {
        console.log(`✅ Found ${results.length} results:\n`);
        results.forEach((entry, index) => {
          console.log(`[${index + 1}] ${entry.key}`);
          console.log(JSON.stringify(entry.value, null, 2));
          console.log(`Created: ${new Date(entry.createdAt).toISOString()}`);
          console.log('---');
        });
      }
    } else {
      // Single key retrieval
      const result = await memoryStore.retrieve(key, { partition: 'coordination' });

      if (!result) {
        console.log('❌ Key not found');
      } else {
        console.log('✅ Result:\n');
        console.log(JSON.stringify(result, null, 2));
      }
    }

    await memoryStore.close();
  } catch (error) {
    console.error('❌ Error querying memory:', error);
    process.exit(1);
  }
}

// Main execution
const key = process.argv[2];

if (!key) {
  console.error(`
Usage: npm run query-memory -- <key>

Examples:
  npm run query-memory -- aqe/orchestrator/status
  npm run query-memory -- "aqe/validation/checkpoint-*"
  npm run query-memory -- aqe/final-go-decision
  npm run query-memory -- tasks/BATCH-004-COMPLETION/status
`);
  process.exit(1);
}

queryMemory(key);
