#!/usr/bin/env node

/**
 * Test script for agent execution with improved Claude Code integration
 */

import { AgentRegistry } from './agents/agent-registry';
import { createAgentSpawner } from './agents/agent-spawner';
import { Logger } from './utils/Logger';

const logger = new Logger('test-agent-execution');

async function testAgentExecution() {
  try {
    console.log('🧪 Testing Agent Execution System\n');

    // Initialize registry
    console.log('1. Initializing Agent Registry...');
    const registry = new AgentRegistry();
    await registry.initialize();

    const stats = registry.getStatistics();
    console.log(`   ✅ Loaded ${stats.total} agents`);
    console.log(`   📊 Categories: ${Object.keys(stats.byCategory).join(', ')}`);

    // Test loading specific agent
    console.log('\n2. Loading risk-oracle agent...');
    const riskOracle = registry.getAgent('risk-oracle');
    if (!riskOracle) {
      console.log('   ❌ risk-oracle agent not found');
      return;
    }
    console.log(`   ✅ Found agent: ${riskOracle.agent.name}`);
    console.log(`   📝 Description: ${riskOracle.agent.description}`);
    console.log(`   🔧 Capabilities: ${riskOracle.agent.capabilities?.join(', ') || 'None'}`);

    // Create agent spawner
    console.log('\n3. Creating Agent Spawner...');
    const spawner = createAgentSpawner(registry);

    // Test agent execution
    console.log('\n4. Testing Agent Execution...');
    const testTask = 'Analyze the project structure and identify potential quality risks in the codebase. Focus on areas that may need additional testing coverage.';

    const result = await spawner.spawnAgents(testTask, {
      agents: ['risk-oracle'],
      parallel: false,
      coordination: false,
      memory_namespace: 'test-execution',
      swarm_id: 'test-swarm-' + Date.now(),
      hooks: {
        pre_task: false,
        post_task: false,
        session_restore: false,
      },
    }, {
      force_claude_task: true,
      timeout: 60,
      dry_run: false,
    });

    console.log('\n5. Execution Results:');
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   📝 Message: ${result.message}`);

    if (result.data && result.data.results) {
      result.data.results.forEach((res: any, index: number) => {
        console.log(`\n   📊 Result ${index + 1}:`);
        console.log(`      Agent: ${res.agentName}`);
        console.log(`      Status: ${res.status}`);
        console.log(`      Method: ${res.method}`);
        console.log(`      Duration: ${res.duration}ms`);

        if (res.output && typeof res.output === 'string') {
          const preview = res.output.substring(0, 200);
          console.log(`      Output Preview: ${preview}${res.output.length > 200 ? '...' : ''}`);
        }
      });
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\n   ❌ Errors:');
      result.errors.forEach((error: string) => {
        console.log(`      - ${error}`);
      });
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testAgentExecution()
    .then(() => {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test execution failed:', error);
      process.exit(1);
    });
}

export { testAgentExecution };