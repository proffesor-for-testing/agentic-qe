#!/usr/bin/env ts-node
/**
 * Test Learning MCP Tools Registration
 *
 * Verifies that the three new learning service MCP tools are properly registered
 * in the AQE MCP server and can be instantiated without errors.
 *
 * Phase 1 implementation - Option C (Hybrid Approach)
 */

import { AgenticQEMCPServer } from '../src/mcp/server';

async function testLearningMCPTools() {
  console.log('🧪 Testing Learning MCP Tools Registration\n');

  try {
    // Step 1: Instantiate MCP server
    console.log('1️⃣  Instantiating AQE MCP Server...');
    const server = new AgenticQEMCPServer();
    console.log('   ✅ Server instantiated successfully\n');

    // Step 2: Check handler registration
    console.log('2️⃣  Checking learning tool handlers...');
    const handlers = (server as any).handlers;

    const learningTools = [
      'mcp__agentic_qe__learning_store_experience',
      'mcp__agentic_qe__learning_store_qvalue',
      'mcp__agentic_qe__learning_query'
    ];

    let allRegistered = true;
    for (const toolName of learningTools) {
      const hasHandler = handlers.has(toolName);
      console.log(`   ${hasHandler ? '✅' : '❌'} ${toolName}`);
      if (!hasHandler) {
        allRegistered = false;
      }
    }

    if (!allRegistered) {
      throw new Error('Not all learning tools are registered!');
    }

    console.log('   ✅ All learning tools registered\n');

    // Step 3: Verify handler types
    console.log('3️⃣  Verifying handler types...');
    for (const toolName of learningTools) {
      const handler = handlers.get(toolName);
      if (!handler || typeof handler.handle !== 'function') {
        throw new Error(`Handler for ${toolName} is invalid!`);
      }
      console.log(`   ✅ ${toolName.split('__').pop()}: has handle() method`);
    }
    console.log('\n');

    // Step 4: Count total MCP tools
    console.log('4️⃣  Tool count verification...');
    const totalTools = handlers.size;
    console.log(`   📊 Total MCP tools: ${totalTools}`);
    console.log(`   📊 Expected: 101 (98 existing + 3 new learning tools)`);

    if (totalTools < 101) {
      console.warn(`   ⚠️  Warning: Expected at least 101 tools, found ${totalTools}`);
    } else {
      console.log('   ✅ Tool count matches expectations\n');
    }

    // Step 5: Summary
    console.log('✅ VERIFICATION PASSED\n');
    console.log('Summary:');
    console.log('  • All 3 learning service tools registered');
    console.log('  • Handlers properly instantiated');
    console.log('  • Total tools: ' + totalTools);
    console.log('\nNext Steps:');
    console.log('  1. Connect MCP server to Claude Code');
    console.log('  2. Update qe-coverage-analyzer agent prompt');
    console.log('  3. Test learning persistence with actual agent\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED\n');
    console.error('Error:', error);
    process.exit(1);
  }
}

testLearningMCPTools();
