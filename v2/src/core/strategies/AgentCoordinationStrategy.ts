/**
 * AgentCoordinationStrategy - Strategy interface for agent coordination
 *
 * Handles event emission, message passing, and swarm coordination.
 * Part of Phase 2 layered architecture refactoring.
 *
 * @module core/strategies/AgentCoordinationStrategy
 * @version 1.0.0
 */

import type { EventEmitter } from 'events';
import type { AgentId, QEEvent, MessageType } from '../../types';

/**
 * Simple event handler function type for coordination
 */
export type CoordinationEventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Agent message for inter-agent communication
 */
export interface AgentMessage {
  id?: string;
  type: MessageType | string;
  sender: AgentId;
  target?: AgentId;
  payload: unknown;
  timestamp?: Date;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Message handler function
 */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/**
 * Swarm membership info
 */
export interface SwarmMembership {
  swarmId: string;
  role: 'coordinator' | 'worker' | 'observer';
  joinedAt: Date;
  topology: 'mesh' | 'hierarchical' | 'ring' | 'star';
  peers: AgentId[];
}

/**
 * Coordination metrics
 */
export interface CoordinationMetrics {
  eventsEmitted: number;
  eventsReceived: number;
  messagesSent: number;
  messagesReceived: number;
  broadcastsSent: number;
  averageLatency: number;
  activeSubscriptions: number;
}

/**
 * AgentCoordinationStrategy interface
 *
 * Implementations:
 * - DefaultCoordinationStrategy: EventEmitter-based
 * - SwarmCoordinationStrategy: Claude Flow integration
 * - DistributedCoordinationStrategy: QUIC-based (Phase 4)
 */
export interface AgentCoordinationStrategy {
  // === Event Operations ===

  /**
   * Emit an event to the event bus
   * @param event - Event to emit
   */
  emit(event: QEEvent): void;

  /**
   * Subscribe to events of a specific type
   * @param eventType - Event type to subscribe to
   * @param handler - Handler function
   */
  on<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void;

  /**
   * Unsubscribe from events
   * @param eventType - Event type
   * @param handler - Handler function to remove
   */
  off<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void;

  /**
   * Subscribe to a single event occurrence
   * @param eventType - Event type
   * @param handler - Handler function
   */
  once<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void;

  // === Message Operations ===

  /**
   * Broadcast a message to all agents
   * @param message - Message to broadcast
   */
  broadcast(message: AgentMessage): Promise<void>;

  /**
   * Send a message to a specific agent
   * @param targetAgent - Target agent ID
   * @param message - Message to send
   */
  send(targetAgent: AgentId, message: AgentMessage): Promise<void>;

  /**
   * Subscribe to messages
   * @param handler - Message handler
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Unsubscribe from messages
   * @param handler - Handler to remove
   */
  offMessage(handler: MessageHandler): void;

  /**
   * Request-response pattern
   * @param targetAgent - Target agent
   * @param message - Request message
   * @param timeout - Response timeout
   */
  request<T = unknown>(
    targetAgent: AgentId,
    message: AgentMessage,
    timeout?: number
  ): Promise<T>;

  // === Swarm Coordination ===

  /**
   * Join a swarm
   * @param swarmId - Swarm identifier
   * @param role - Role in the swarm
   */
  joinSwarm?(swarmId: string, role?: 'coordinator' | 'worker'): Promise<void>;

  /**
   * Leave the current swarm
   */
  leaveSwarm?(): Promise<void>;

  /**
   * Get current swarm membership
   */
  getSwarmMembership?(): SwarmMembership | null;

  /**
   * Discover peers in the swarm
   */
  discoverPeers?(): Promise<AgentId[]>;

  // === Lifecycle ===

  /**
   * Initialize the coordination strategy
   * @param eventBus - Event bus to use
   * @param agentId - This agent's ID
   */
  initialize(eventBus: EventEmitter, agentId: AgentId): void;

  /**
   * Shutdown coordination
   */
  shutdown(): Promise<void>;

  // === Metrics ===

  /**
   * Get coordination metrics
   */
  getMetrics(): CoordinationMetrics;

  /**
   * Check if coordination is healthy
   */
  isHealthy(): boolean;
}

/**
 * Factory function type for creating coordination strategies
 */
export type CoordinationStrategyFactory = (
  config?: Record<string, unknown>
) => AgentCoordinationStrategy;
