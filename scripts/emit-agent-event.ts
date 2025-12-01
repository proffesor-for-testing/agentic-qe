#!/usr/bin/env npx tsx
/**
 * Emit agent events to the EventStore for visualization
 *
 * Usage:
 *   npx tsx scripts/emit-agent-event.ts spawn <agentId> <agentType>
 *   npx tsx scripts/emit-agent-event.ts start <agentId>
 *   npx tsx scripts/emit-agent-event.ts complete <agentId> [duration]
 *   npx tsx scripts/emit-agent-event.ts error <agentId> <errorMessage>
 */

import { EventStore } from '../dist/persistence/event-store.js';
import { WebSocket } from 'ws';

const DB_PATH = './data/agentic-qe.db';
const WS_URL = 'ws://localhost:8080';

interface AgentEventData {
  agentId: string;
  agentType?: string;
  status: string;
  timestamp: string;
  duration?: number;
  error?: string;
  sessionId?: string;
}

async function emitEvent(eventType: string, data: AgentEventData): Promise<void> {
  const eventStore = new EventStore({ dbPath: DB_PATH });
  const sessionId = data.sessionId || `session-${Date.now()}`;

  // Record event to database
  const event = eventStore.recordEvent({
    agent_id: data.agentId,
    event_type: eventType,
    payload: {
      agentType: data.agentType,
      status: data.status,
      duration: data.duration,
      error: data.error,
    },
    session_id: sessionId,
  });

  console.log(`Event recorded: ${eventType} for agent ${data.agentId}`);

  // Try to broadcast via WebSocket
  try {
    const ws = new WebSocket(WS_URL);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(); // Don't fail if WS not available
      }, 2000);

      ws.on('open', () => {
        clearTimeout(timeout);

        // Send lifecycle event
        ws.send(JSON.stringify({
          type: 'lifecycle-event',
          timestamp: new Date().toISOString(),
          data: {
            id: event.id,
            agentId: data.agentId,
            type: eventType,
            status: data.status,
            timestamp: data.timestamp,
            duration: data.duration,
            details: {
              agentType: data.agentType,
              error: data.error,
            },
          },
        }));

        // Send graph update with new node
        ws.send(JSON.stringify({
          type: 'graph-update',
          timestamp: new Date().toISOString(),
          data: {
            nodes: [{
              id: data.agentId,
              label: data.agentId,
              type: data.agentType || 'coder',
              status: data.status,
              metrics: {
                tasksCompleted: 0,
                successRate: 100,
                avgDuration: data.duration || 0,
              },
            }],
            edges: [],
          },
        }));

        ws.close();
        resolve();
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(); // Don't fail if WS not available
      });
    });

    console.log('Event broadcasted via WebSocket');
  } catch (err) {
    console.log('WebSocket broadcast skipped (server may not be running)');
  }

  // Close database
  eventStore.close();
}

async function main(): Promise<void> {
  const [,, action, agentId, ...args] = process.argv;

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

  const timestamp = new Date().toISOString();

  switch (action) {
    case 'spawn':
      await emitEvent('agent:spawned', {
        agentId,
        agentType: args[0] || 'coder',
        status: 'idle',
        timestamp,
      });
      break;

    case 'start':
      await emitEvent('agent:started', {
        agentId,
        status: 'running',
        timestamp,
      });
      break;

    case 'complete':
      await emitEvent('agent:completed', {
        agentId,
        status: 'completed',
        timestamp,
        duration: parseInt(args[0]) || 0,
      });
      break;

    case 'error':
      await emitEvent('agent:error', {
        agentId,
        status: 'error',
        timestamp,
        error: args.join(' ') || 'Unknown error',
      });
      break;

    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

main().catch(console.error);
