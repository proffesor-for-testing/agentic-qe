/**
 * @fileoverview Agent event emitter for visualization
 * @module visualization/emit-event
 *
 * This module provides a simple API to emit agent events to the EventStore
 * and broadcast them via WebSocket for real-time visualization.
 */

import { EventStore } from '../persistence/event-store';
import { EventType } from '../persistence/schema';
import { WebSocket } from 'ws';

const DEFAULT_DB_PATH = './data/agentic-qe.db';
const DEFAULT_WS_URL = 'ws://localhost:8080';

/**
 * Map visualization event types to persistence EventType
 */
function mapToEventType(eventType: string): EventType {
  const mapping: Record<string, EventType> = {
    'agent:spawned': 'agent_started',
    'agent:started': 'agent_started',
    'agent:completed': 'agent_completed',
    'agent:error': 'agent_error',
    'test:generated': 'test_generated',
    'test:executed': 'test_executed',
    'coverage:analyzed': 'coverage_analyzed',
    'quality:passed': 'quality_gate_passed',
    'quality:failed': 'quality_gate_failed',
    'pattern:matched': 'pattern_matched',
    'learning:completed': 'learning_completed',
  };
  return mapping[eventType] || 'custom';
}

/**
 * Agent event data structure
 */
export interface AgentEventData {
  agentId: string;
  agentType?: string;
  status: string;
  timestamp?: string;
  duration?: number;
  error?: string;
  sessionId?: string;
}

/**
 * Event emitter configuration
 */
export interface EventEmitterConfig {
  dbPath?: string;
  wsUrl?: string;
  sessionId?: string;
}

/**
 * Result of event emission
 */
export interface EmitResult {
  success: boolean;
  eventId?: string;
  dbRecorded: boolean;
  wsBroadcast: boolean;
  error?: string;
}

/**
 * Emit an agent event to the EventStore and broadcast via WebSocket
 *
 * @param eventType - Type of event (e.g., 'agent:spawned', 'agent:started')
 * @param data - Event data including agentId, status, etc.
 * @param config - Optional configuration for db path and ws url
 * @returns EmitResult with success status and details
 *
 * @example
 * ```typescript
 * import { emitEvent } from './visualization/emit-event';
 *
 * // Emit spawn event
 * await emitEvent('agent:spawned', {
 *   agentId: 'qe-test-generator',
 *   agentType: 'researcher',
 *   status: 'idle'
 * });
 * ```
 */
export async function emitEvent(
  eventType: string,
  data: AgentEventData,
  config: EventEmitterConfig = {}
): Promise<EmitResult> {
  const dbPath = config.dbPath || DEFAULT_DB_PATH;
  const wsUrl = config.wsUrl || DEFAULT_WS_URL;
  const sessionId = config.sessionId || data.sessionId || `session-${Date.now()}`;
  const timestamp = data.timestamp || new Date().toISOString();

  const result: EmitResult = {
    success: false,
    dbRecorded: false,
    wsBroadcast: false,
  };

  let eventStore: EventStore | null = null;

  try {
    // Record event to database
    eventStore = new EventStore({ dbPath });
    const event = eventStore.recordEvent({
      agent_id: data.agentId,
      event_type: mapToEventType(eventType),
      payload: {
        agentType: data.agentType,
        status: data.status,
        duration: data.duration,
        error: data.error,
        originalEventType: eventType,
      },
      session_id: sessionId,
    });

    result.eventId = event.id;
    result.dbRecorded = true;

    // Try to broadcast via WebSocket
    try {
      await broadcastEvent(wsUrl, {
        id: event.id,
        agentId: data.agentId,
        agentType: data.agentType,
        eventType,
        status: data.status,
        timestamp,
        duration: data.duration,
        error: data.error,
      });
      result.wsBroadcast = true;
    } catch {
      // WebSocket broadcast is optional - service may not be running
    }

    result.success = true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    if (eventStore) {
      eventStore.close();
    }
  }

  return result;
}

/**
 * Broadcast event to WebSocket server
 */
async function broadcastEvent(
  wsUrl: string,
  eventData: {
    id: string;
    agentId: string;
    agentType?: string;
    eventType: string;
    status: string;
    timestamp: string;
    duration?: number;
    error?: string;
  }
): Promise<void> {
  return new Promise((resolve, _reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      resolve(); // Don't fail if WS not available
    }, 2000);

    ws.on('open', () => {
      clearTimeout(timeout);

      // Send lifecycle event
      ws.send(
        JSON.stringify({
          type: 'lifecycle-event',
          timestamp: new Date().toISOString(),
          data: {
            id: eventData.id,
            agentId: eventData.agentId,
            type: eventData.eventType,
            status: eventData.status,
            timestamp: eventData.timestamp,
            duration: eventData.duration,
            details: {
              agentType: eventData.agentType,
              error: eventData.error,
            },
          },
        })
      );

      // Send graph update with node
      ws.send(
        JSON.stringify({
          type: 'graph-update',
          timestamp: new Date().toISOString(),
          data: {
            nodes: [
              {
                id: eventData.agentId,
                label: eventData.agentId,
                type: eventData.agentType || 'coder',
                status: eventData.status,
                metrics: {
                  tasksCompleted: 0,
                  successRate: 100,
                  avgDuration: eventData.duration || 0,
                },
              },
            ],
            edges: [],
          },
        })
      );

      ws.close();
      resolve();
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(); // Don't fail if WS not available
    });
  });
}

/**
 * Convenience function to emit agent spawn event
 */
export async function emitAgentSpawn(
  agentId: string,
  agentType: string,
  config?: EventEmitterConfig
): Promise<EmitResult> {
  return emitEvent(
    'agent:spawned',
    {
      agentId,
      agentType,
      status: 'idle',
    },
    config
  );
}

/**
 * Convenience function to emit agent start event
 */
export async function emitAgentStart(
  agentId: string,
  config?: EventEmitterConfig
): Promise<EmitResult> {
  return emitEvent(
    'agent:started',
    {
      agentId,
      status: 'running',
    },
    config
  );
}

/**
 * Convenience function to emit agent completion event
 */
export async function emitAgentComplete(
  agentId: string,
  duration?: number,
  config?: EventEmitterConfig
): Promise<EmitResult> {
  return emitEvent(
    'agent:completed',
    {
      agentId,
      status: 'completed',
      duration,
    },
    config
  );
}

/**
 * Convenience function to emit agent error event
 */
export async function emitAgentError(
  agentId: string,
  errorMessage: string,
  config?: EventEmitterConfig
): Promise<EmitResult> {
  return emitEvent(
    'agent:error',
    {
      agentId,
      status: 'error',
      error: errorMessage,
    },
    config
  );
}
