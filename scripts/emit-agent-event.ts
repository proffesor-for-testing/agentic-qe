#!/usr/bin/env npx tsx
/**
 * CLI to emit agent events to the EventStore for visualization
 *
 * Usage:
 *   npx tsx scripts/emit-agent-event.ts spawn <agentId> <agentType>
 *   npx tsx scripts/emit-agent-event.ts start <agentId>
 *   npx tsx scripts/emit-agent-event.ts complete <agentId> [duration]
 *   npx tsx scripts/emit-agent-event.ts error <agentId> <errorMessage>
 *
 * Examples:
 *   npx tsx scripts/emit-agent-event.ts spawn qe-test-generator researcher
 *   npx tsx scripts/emit-agent-event.ts start qe-test-generator
 *   npx tsx scripts/emit-agent-event.ts complete qe-test-generator 5000
 *   npx tsx scripts/emit-agent-event.ts error qe-test-generator "Connection failed"
 */

import {
  emitAgentSpawn,
  emitAgentStart,
  emitAgentComplete,
  emitAgentError,
  type EmitResult,
} from '../src/visualization/emit-event';

async function main(): Promise<void> {
  const [, , action, agentId, ...args] = process.argv;

  if (!action || !agentId) {
    console.log(`
Usage:
  npx tsx scripts/emit-agent-event.ts spawn <agentId> <agentType>
  npx tsx scripts/emit-agent-event.ts start <agentId>
  npx tsx scripts/emit-agent-event.ts complete <agentId> [duration]
  npx tsx scripts/emit-agent-event.ts error <agentId> <errorMessage>

Examples:
  npx tsx scripts/emit-agent-event.ts spawn qe-test-generator researcher
  npx tsx scripts/emit-agent-event.ts start qe-test-generator
  npx tsx scripts/emit-agent-event.ts complete qe-test-generator 5000
  npx tsx scripts/emit-agent-event.ts error qe-test-generator "Connection failed"
`);
    process.exit(1);
  }

  let result: EmitResult;

  switch (action) {
    case 'spawn':
      result = await emitAgentSpawn(agentId, args[0] || 'coder');
      break;

    case 'start':
      result = await emitAgentStart(agentId);
      break;

    case 'complete':
      result = await emitAgentComplete(agentId, parseInt(args[0]) || 0);
      break;

    case 'error':
      result = await emitAgentError(agentId, args.join(' ') || 'Unknown error');
      break;

    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }

  if (result.success) {
    console.log(`✓ Event recorded: ${action} for agent ${agentId}`);
    if (result.wsBroadcast) {
      console.log('✓ Event broadcasted via WebSocket');
    } else {
      console.log('○ WebSocket broadcast skipped (server may not be running)');
    }
  } else {
    console.error(`✗ Event failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch(console.error);
