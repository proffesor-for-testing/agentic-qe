/**
 * DefaultCoordinationStrategy - Standard agent coordination implementation
 *
 * Wraps EventEmitter for backward compatibility.
 * Provides event emission, message passing, and basic coordination.
 *
 * @module core/strategies/DefaultCoordinationStrategy
 * @version 1.0.0
 */

import type { EventEmitter } from 'events';
import type { AgentId, QEEvent } from '../../types';
import type {
  AgentCoordinationStrategy,
  AgentMessage,
  MessageHandler,
  SwarmMembership,
  CoordinationMetrics,
  CoordinationEventHandler,
} from './AgentCoordinationStrategy';
import { SecureRandom } from '../../utils/SecureRandom';

/**
 * DefaultCoordinationStrategy - EventEmitter-based coordination
 */
export class DefaultCoordinationStrategy implements AgentCoordinationStrategy {
  private eventBus?: EventEmitter;
  private agentId?: AgentId;
  private messageHandlers: Set<MessageHandler> = new Set();
  private swarmMembership: SwarmMembership | null = null;

  // Metrics
  private metrics: CoordinationMetrics = {
    eventsEmitted: 0,
    eventsReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    broadcastsSent: 0,
    averageLatency: 0,
    activeSubscriptions: 0,
  };

  private eventSubscriptions: Map<string, Set<CoordinationEventHandler>> = new Map();
  private latencySum = 0;
  private latencyCount = 0;

  /**
   * Initialize the coordination strategy
   */
  initialize(eventBus: EventEmitter, agentId: AgentId): void {
    this.eventBus = eventBus;
    this.agentId = agentId;

    // Subscribe to messages targeted at this agent
    this.setupMessageListener();
  }

  /**
   * Emit an event to the event bus
   */
  emit(event: QEEvent): void {
    if (!this.eventBus) {
      throw new Error('Coordination strategy not initialized');
    }

    const enrichedEvent: QEEvent = {
      id: event.id ?? SecureRandom.generateId(16),
      type: event.type,
      source: event.source ?? this.agentId!,
      target: event.target,
      data: event.data,
      timestamp: event.timestamp ?? new Date(),
      priority: event.priority ?? 'medium',
      scope: event.scope ?? 'local',
      category: event.category,
    };

    this.eventBus.emit(event.type, enrichedEvent);
    this.metrics.eventsEmitted++;
  }

  /**
   * Subscribe to events of a specific type
   */
  on<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void {
    if (!this.eventBus) {
      throw new Error('Coordination strategy not initialized');
    }

    // Track subscriptions
    if (!this.eventSubscriptions.has(eventType)) {
      this.eventSubscriptions.set(eventType, new Set());
    }
    this.eventSubscriptions.get(eventType)!.add(handler as CoordinationEventHandler);

    // Wrap handler to track metrics
    const wrappedHandler = (event: T) => {
      this.metrics.eventsReceived++;
      handler(event);
    };

    this.eventBus.on(eventType, wrappedHandler);
    this.metrics.activeSubscriptions++;
  }

  /**
   * Unsubscribe from events
   */
  off<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void {
    if (!this.eventBus) return;

    const handlers = this.eventSubscriptions.get(eventType);
    if (handlers) {
      handlers.delete(handler as CoordinationEventHandler);
      if (handlers.size === 0) {
        this.eventSubscriptions.delete(eventType);
      }
    }

    this.eventBus.off(eventType, handler as (...args: unknown[]) => void);
    this.metrics.activeSubscriptions = Math.max(0, this.metrics.activeSubscriptions - 1);
  }

  /**
   * Subscribe to a single event occurrence
   */
  once<T = unknown>(eventType: string, handler: CoordinationEventHandler<T>): void {
    if (!this.eventBus) {
      throw new Error('Coordination strategy not initialized');
    }

    const wrappedHandler = (event: T) => {
      this.metrics.eventsReceived++;
      handler(event);
    };

    this.eventBus.once(eventType, wrappedHandler);
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(message: AgentMessage): Promise<void> {
    if (!this.eventBus) {
      throw new Error('Coordination strategy not initialized');
    }

    const enrichedMessage: AgentMessage = {
      ...message,
      id: message.id ?? this.generateMessageId(),
      sender: message.sender ?? this.agentId!,
      timestamp: message.timestamp ?? new Date(),
    };

    this.eventBus.emit('agent:broadcast', enrichedMessage);
    this.metrics.broadcastsSent++;
    this.metrics.messagesSent++;
  }

  /**
   * Send a message to a specific agent
   */
  async send(targetAgent: AgentId, message: AgentMessage): Promise<void> {
    if (!this.eventBus) {
      throw new Error('Coordination strategy not initialized');
    }

    const startTime = performance.now();

    const enrichedMessage: AgentMessage = {
      ...message,
      id: message.id ?? this.generateMessageId(),
      sender: message.sender ?? this.agentId!,
      target: targetAgent,
      timestamp: message.timestamp ?? new Date(),
    };

    // Emit to specific agent channel
    this.eventBus.emit(`agent:message:${targetAgent.id}`, enrichedMessage);
    this.metrics.messagesSent++;

    // Update latency metrics
    const latency = performance.now() - startTime;
    this.updateLatency(latency);
  }

  /**
   * Subscribe to messages
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler);
  }

  /**
   * Unsubscribe from messages
   */
  offMessage(handler: MessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  /**
   * Request-response pattern
   */
  async request<T = unknown>(
    targetAgent: AgentId,
    message: AgentMessage,
    timeout = 30000
  ): Promise<T> {
    if (!this.eventBus) {
      throw new Error('Coordination strategy not initialized');
    }

    const correlationId = this.generateMessageId();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.eventBus!.off(`agent:response:${correlationId}`, responseHandler);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      const responseHandler = (response: { data: T }) => {
        clearTimeout(timeoutId);
        resolve(response.data);
      };

      this.eventBus!.once(`agent:response:${correlationId}`, responseHandler);

      // Send request with correlation ID
      this.send(targetAgent, {
        ...message,
        correlationId,
      });
    });
  }

  /**
   * Join a swarm
   */
  async joinSwarm(swarmId: string, role: 'coordinator' | 'worker' = 'worker'): Promise<void> {
    this.swarmMembership = {
      swarmId,
      role,
      joinedAt: new Date(),
      topology: 'mesh',
      peers: [],
    };

    // Emit swarm join event
    this.emitSimple('swarm:join', {
      agentId: this.agentId,
      swarmId,
      role,
    });
  }

  /**
   * Leave the current swarm
   */
  async leaveSwarm(): Promise<void> {
    if (this.swarmMembership) {
      this.emitSimple('swarm:leave', {
        agentId: this.agentId,
        swarmId: this.swarmMembership.swarmId,
      });

      this.swarmMembership = null;
    }
  }

  /**
   * Get current swarm membership
   */
  getSwarmMembership(): SwarmMembership | null {
    return this.swarmMembership;
  }

  /**
   * Discover peers in the swarm
   */
  async discoverPeers(): Promise<AgentId[]> {
    // In default implementation, peers are tracked via events
    return this.swarmMembership?.peers ?? [];
  }

  /**
   * Shutdown coordination
   */
  async shutdown(): Promise<void> {
    // Leave swarm if member
    if (this.swarmMembership) {
      await this.leaveSwarm();
    }

    // Clear all subscriptions
    for (const [eventType, handlers] of this.eventSubscriptions) {
      for (const handler of handlers) {
        this.eventBus?.off(eventType, handler as (...args: unknown[]) => void);
      }
    }
    this.eventSubscriptions.clear();

    // Clear message handlers
    this.messageHandlers.clear();

    this.eventBus = undefined;
    this.agentId = undefined;
  }

  /**
   * Get coordination metrics
   */
  getMetrics(): CoordinationMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if coordination is healthy
   */
  isHealthy(): boolean {
    return this.eventBus !== undefined && this.agentId !== undefined;
  }

  // === Private Helpers ===

  /**
   * Emit a simple event (not a full QEEvent)
   */
  private emitSimple(type: string, data: unknown): void {
    if (!this.eventBus) return;

    const event: QEEvent = {
      id: SecureRandom.generateId(16),
      type,
      source: this.agentId!,
      data,
      timestamp: new Date(),
      priority: 'medium',
      scope: 'local',
    };

    this.eventBus.emit(type, event);
    this.metrics.eventsEmitted++;
  }

  private setupMessageListener(): void {
    if (!this.eventBus || !this.agentId) return;

    // Listen for direct messages
    this.eventBus.on(`agent:message:${this.agentId.id}`, (message: AgentMessage) => {
      this.metrics.messagesReceived++;
      for (const handler of this.messageHandlers) {
        try {
          handler(message);
        } catch (error) {
          console.error('[DefaultCoordinationStrategy] Message handler error:', error);
        }
      }
    });

    // Listen for broadcasts
    this.eventBus.on('agent:broadcast', (message: AgentMessage) => {
      // Don't process own broadcasts
      if (message.sender?.id === this.agentId?.id) return;

      this.metrics.messagesReceived++;
      for (const handler of this.messageHandlers) {
        try {
          handler(message);
        } catch (error) {
          console.error('[DefaultCoordinationStrategy] Broadcast handler error:', error);
        }
      }
    });
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${SecureRandom.generateId(7)}`;
  }

  private updateLatency(latency: number): void {
    this.latencySum += latency;
    this.latencyCount++;
    this.metrics.averageLatency = this.latencySum / this.latencyCount;
  }
}

/**
 * Factory function for creating coordination strategies
 */
export function createCoordinationStrategy(): AgentCoordinationStrategy {
  return new DefaultCoordinationStrategy();
}
