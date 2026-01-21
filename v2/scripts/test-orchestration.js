#!/usr/bin/env node
/**
 * Test Orchestration Script - Debug real agent execution
 */

const { TaskOrchestrateHandler } = require('../dist/mcp/handlers/task-orchestrate');
const { AgentRegistry } = require('../dist/mcp/services/AgentRegistry');
const { HookExecutor } = require('../dist/mcp/services/HookExecutor');

async function main() {
  console.log('='.repeat(60));
  console.log('TEST ORCHESTRATION - DEBUG MODE');
  console.log('='.repeat(60));

  // Create dependencies
  const registry = new AgentRegistry({ maxAgents: 20 });
  const hookExecutor = new HookExecutor();

  // Create handler
  const handler = new TaskOrchestrateHandler(registry, hookExecutor);

  console.log('\nStarting comprehensive-testing orchestration...\n');

  try {
    const result = await handler.handle({
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'sequential'
      },
      context: {
        project: 'test',
        environment: 'development'
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('ORCHESTRATION RESULT');
    console.log('='.repeat(60));
    console.log('Success:', result.success);

    if (result.data) {
      console.log('Steps completed:', result.data.progress?.completedSteps);
      console.log('Total steps:', result.data.progress?.totalSteps);

      console.log('\nStep Results:');
      result.data.workflow?.forEach((step) => {
        console.log(`  - ${step.name}: ${step.status}`);
        if (step.results) {
          console.log(`    Results: ${JSON.stringify(step.results).substring(0, 100)}...`);
        }
      });
    }

  } catch (error) {
    console.error('Orchestration failed:', error);
  }

  // Give some time for async operations
  await new Promise(resolve => setTimeout(resolve, 1000));

  process.exit(0);
}

main();
