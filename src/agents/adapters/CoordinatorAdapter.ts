/**
 * CoordinatorAdapter - Adapts EventEmitter to AgentCoordinationStrategy
 *
 * Provides backward compatibility during the B1.2 migration.
 * Wraps the existing EventEmitter-based coordination to implement the strategy interface.
 *
 * @module agents/adapters/CoordinatorAdapter
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentCoordinationStrategy,
  CoordinationEventHandler,
  AgentMessage,
  MessageHandler,
  SwarmMembership,
  CoordinationMetrics,
} from '../../core/strategies';
import type { AgentId, QEEvent } from '../../types';

/**
 * Adapts EventEmitter to AgentCoordinationStrategy interface
 */
export class CoordinatorAdapter implements AgentCoordinationStrategy {
  private eventBus?: EventEmitter;
  private agentId?: AgentId;
  private messageHandlers: Set<MessageHandler> = new Set();
  private swarmMembership: SwarmMembership | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  private metrics: CoordinationMetrics = {
    eventsEmitted: 0,
    eventsReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    broadcastsSent: 0,
    averageLatency: 0,
    activeSubscriptions: 0,
  };

  constructor(eventBus?: EventEmitter, agentId?: AgentId) {
    if (eventBus && agentId) {
      this.initialize(eventBus, agentId);
    }
  }

  // === Event Operations ===

  emit(event: QEEvent): void {
    if (!this.eventBus) {
      throw new Error('Coordination not initialized');
    }

    this.eventBus.emit(event.type, event);
    this.metrics.eventsEmitted++;
  }

  on<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void {
    if (!this.eventBus) {
      throw new Error('Coordination not initialized');
    }

    const wrappedHandler = (data: T) => {
      this.metrics.eventsReceived++;
      handler(data);
    };

    // Store original -> wrapped mapping for removal
    (handler as any).__wrapped = wrappedHandler;
    this.eventBus.on(eventType, wrappedHandler);
    this.metrics.activeSubscriptions++;
  }

  off<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void {
    if (!this.eventBus) {
      return;
    }

    const wrappedHandler = (handler as any).__wrapped;
    if (wrappedHandler) {
      this.eventBus.off(eventType, wrappedHandler);
      this.metrics.activeSubscriptions = Math.max(0, this.metrics.activeSubscriptions - 1);
    }
  }

  once<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void {
    if (!this.eventBus) {
      throw new Error('Coordination not initialized');
    }

    this.eventBus.once(eventType, (data: T) => {
      this.metrics.eventsReceived++;
      handler(data);
    });
  }

  // === Message Operations ===

  async broadcast(message: AgentMessage): Promise<void> {
    if (!this.eventBus || !this.agentId) {
      throw new Error('Coordination not initialized');
    }

    const fullMessage: AgentMessage = {
      ...message,
      id: message.id || uuidv4(),
      sender: this.agentId,
      timestamp: message.timestamp || new Date(),
    };

    this.eventBus.emit('agent.broadcast', fullMessage);
    this.metrics.broadcastsSent++;
    this.metrics.messagesSent++;
  }

  async send(targetAgent: AgentId, message: AgentMessage): Promise<void> {
    if (!this.eventBus || !this.agentId) {
      throw new Error('Coordination not initialized');
    }

    const fullMessage: AgentMessage = {
      ...message,
      id: message.id || uuidv4(),
      sender: this.agentId,
      target: targetAgent,
      timestamp: message.timestamp || new Date(),
    };

    this.eventBus.emit(`agent.message.${targetAgent.id}`, fullMessage);
    this.metrics.messagesSent++;
  }

  onMessage(handler: MessageHandler): void {
    if (!this.eventBus || !this.agentId) {
      throw new Error('Coordination not initialized');
    }

    this.messageHandlers.add(handler);

    // Subscribe to direct messages for this agent
    if (this.messageHandlers.size === 1) {
      this.eventBus.on(`agent.message.${this.agentId.id}`, this.handleIncomingMessage);
      this.eventBus.on('agent.broadcast', this.handleIncomingMessage);
    }
  }

  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);

    // Unsubscribe if no handlers remain
    if (this.messageHandlers.size === 0 && this.eventBus && this.agentId) {
      this.eventBus.off(`agent.message.${this.agentId.id}`, this.handleIncomingMessage);
      this.eventBus.off('agent.broadcast', this.handleIncomingMessage);
    }
  }

  async request<T = unknown>(
    targetAgent: AgentId,
    message: AgentMessage,
    timeout = 30000
  ): Promise<T> {
    if (!this.eventBus || !this.agentId) {
      throw new Error('Coordination not initialized');
    }

    const correlationId = uuidv4();
    const requestMessage: AgentMessage = {
      ...message,
      id: uuidv4(),
      sender: this.agentId,
      target: targetAgent,
      correlationId,
      timestamp: new Date(),
    };

    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(correlationId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
      });

      // Subscribe to response
      const responseHandler = (response: AgentMessage) => {
        if (response.correlationId === correlationId) {
          const pending = this.pendingRequests.get(correlationId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(correlationId);
            this.eventBus?.off(`agent.response.${this.agentId?.id}`, responseHandler);
            pending.resolve(response.payload);
          }
        }
      };

      this.eventBus!.on(`agent.response.${this.agentId!.id}`, responseHandler);
      this.eventBus!.emit(`agent.message.${targetAgent.id}`, requestMessage);
      this.metrics.messagesSent++;
    });
  }

  // === Swarm Coordination ===

  async joinSwarm(swarmId: string, role: 'coordinator' | 'worker' = 'worker'): Promise<void> {
    if (!this.eventBus || !this.agentId) {
      throw new Error('Coordination not initialized');
    }

    this.swarmMembership = {
      swarmId,
      role,
      joinedAt: new Date(),
      topology: 'mesh', // Default topology
      peers: [],
    };

    // Emit join event
    this.eventBus.emit('swarm.agent.joined', {
      swarmId,
      agentId: this.agentId,
      role,
    });
  }

  async leaveSwarm(): Promise<void> {
    if (!this.eventBus || !this.agentId || !this.swarmMembership) {
      return;
    }

    const swarmId = this.swarmMembership.swarmId;
    this.swarmMembership = null;

    this.eventBus.emit('swarm.agent.left', {
      swarmId,
      agentId: this.agentId,
    });
  }

  getSwarmMembership(): SwarmMembership | null {
    return this.swarmMembership;
  }

  async discoverPeers(): Promise<AgentId[]> {
    if (!this.swarmMembership) {
      return [];
    }
    return this.swarmMembership.peers;
  }

  // === Lifecycle ===

  initialize(eventBus: EventEmitter, agentId: AgentId): void {
    this.eventBus = eventBus;
    this.agentId = agentId;

    // Subscribe to peer discovery updates
    this.eventBus.on('swarm.peers.updated', (data: { swarmId: string; peers: AgentId[] }) => {
      if (this.swarmMembership && this.swarmMembership.swarmId === data.swarmId) {
        this.swarmMembership.peers = data.peers;
      }
    });
  }

  async shutdown(): Promise<void> {
    // Leave swarm if joined
    await this.leaveSwarm();

    // Clear pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Coordination shutdown'));
    }
    this.pendingRequests.clear();

    // Clear message handlers
    if (this.eventBus && this.agentId) {
      this.eventBus.off(`agent.message.${this.agentId.id}`, this.handleIncomingMessage);
      this.eventBus.off('agent.broadcast', this.handleIncomingMessage);
    }
    this.messageHandlers.clear();

    this.eventBus = undefined;
    this.agentId = undefined;
  }

  // === Metrics ===

  getMetrics(): CoordinationMetrics {
    return { ...this.metrics };
  }

  isHealthy(): boolean {
    return this.eventBus !== undefined && this.agentId !== undefined;
  }

  // === Private Helpers ===

  private handleIncomingMessage = (message: AgentMessage): void => {
    this.metrics.messagesReceived++;

    // Check if this is a response to a pending request
    if (message.correlationId && this.pendingRequests.has(message.correlationId)) {
      // Handled by request() method
      return;
    }

    // Dispatch to registered handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        // Log but don't propagate handler errors
        console.error('Message handler error:', error);
      }
    }
  };
}

/**
 * Create a coordination strategy adapter from event bus and agent ID
 */
export function createCoordinationAdapter(
  eventBus: EventEmitter,
  agentId: AgentId
): AgentCoordinationStrategy {
  return new CoordinatorAdapter(eventBus, agentId);
}
