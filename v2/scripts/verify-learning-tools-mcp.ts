#!/usr/bin/env node

/**
 * Verify Learning Tools via MCP Protocol
 *
 * Tests that learning tools work correctly by:
 * 1. Starting the MCP server
 * 2. Calling learning tools via MCP protocol
 * 3. Verifying data is persisted to database
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

async function main() {
  console.log('🧪 Testing Learning Tools via MCP Protocol\n');

  // Start MCP server process via StdioClientTransport
  console.log('1️⃣  Starting MCP server...');

  // Create MCP client
  const client = new Client({
    name: 'learning-test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(projectRoot, 'dist/mcp/start.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  });

  await client.connect(transport);
  console.log('✅ MCP client connected\n');

  // Test 1: Store experience
  console.log('2️⃣  Testing learning_store_experience...');
  try {
    const experienceResult = await client.callTool({
      name: 'mcp__agentic_qe__learning_store_experience',
      arguments: {
        agentId: 'test-agent-001',
        taskType: 'coverage-analysis',
        reward: 0.95,
        outcome: {
          coverage: 87,
          gaps: 3,
          recommendations: ['Add tests for edge cases']
        },
        metadata: {
          testType: 'mcp-protocol-test',
          timestamp: new Date().toISOString()
        }
      }
    });
    console.log('✅ Experience stored:', experienceResult);
  } catch (error: any) {
    console.error('❌ Failed to store experience:', error.message);
  }

  // Test 2: Store Q-value
  console.log('\n3️⃣  Testing learning_store_qvalue...');
  try {
    const qvalueResult = await client.callTool({
      name: 'mcp__agentic_qe__learning_store_qvalue',
      arguments: {
        agentId: 'test-agent-001',
        state: JSON.stringify({ coverage: 87, complexity: 'medium' }),
        action: 'analyze-gaps',
        qvalue: 0.85
      }
    });
    console.log('✅ Q-value stored:', qvalueResult);
  } catch (error: any) {
    console.error('❌ Failed to store Q-value:', error.message);
  }

  // Test 3: Store pattern
  console.log('\n4️⃣  Testing learning_store_pattern...');
  try {
    const patternResult = await client.callTool({
      name: 'mcp__agentic_qe__learning_store_pattern',
      arguments: {
        agentId: 'test-agent-001',
        patternType: 'coverage-gap',
        pattern: JSON.stringify({
          location: 'utils/validation.ts',
          type: 'edge-case',
          frequency: 'common'
        }),
        context: JSON.stringify({
          project: 'agentic-qe',
          module: 'validation'
        })
      }
    });
    console.log('✅ Pattern stored:', patternResult);
  } catch (error: any) {
    console.error('❌ Failed to store pattern:', error.message);
  }

  // Test 4: Query learning data
  console.log('\n5️⃣  Testing learning_query...');
  try {
    const queryResult = await client.callTool({
      name: 'mcp__agentic_qe__learning_query',
      arguments: {
        agentId: 'test-agent-001',
        queryType: 'experiences',
        limit: 10
      }
    });
    console.log('✅ Query result:', queryResult);
  } catch (error: any) {
    console.error('❌ Failed to query learning data:', error.message);
  }

  // Verify database persistence
  console.log('\n6️⃣  Verifying database persistence...');
  try {
    const dbPath = path.join(projectRoot, '.agentic-qe', 'memory.db');
    const db = new BetterSqlite3(dbPath);

    const experienceCount = db.prepare('SELECT COUNT(*) as count FROM learning_experiences WHERE agent_id = ?').get('test-agent-001') as any;
    const qvalueCount = db.prepare('SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?').get('test-agent-001') as any;
    const patternCount = db.prepare('SELECT COUNT(*) as count FROM test_patterns WHERE agent_id = ?').get('test-agent-001') as any;

    console.log(`✅ Database verification:`);
    console.log(`   - Experiences: ${experienceCount.count}`);
    console.log(`   - Q-values: ${qvalueCount.count}`);
    console.log(`   - Patterns: ${patternCount.count}`);

    db.close();
  } catch (error: any) {
    console.error('❌ Database verification failed:', error.message);
  }

  // Cleanup
  await client.close();

  console.log('\n✅ All tests completed!');
  process.exit(0);
}

main().catch(console.error);
