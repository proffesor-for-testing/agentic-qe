/**
 * AgentCoordinator - Handles inter-agent coordination and communication
 *
 * Responsibilities:
 * - Event emission and handling
 * - Message broadcasting to other agents
 * - Status reporting to coordination system
 * - Event handler registration and lifecycle
 *
 * Part of BaseAgent refactoring (Phase 2)
 * Reduces BaseAgent complexity by ~200 LOC
 */

import { EventEmitter } from 'events';
import { SecureRandom } from '../../utils/SecureRandom.js';
import {
  AgentId,
  QEEvent,
  EventHandler,
  AgentMessage,
  MessageType,
  QEAgentType as AgentType,
  MemoryStore
} from '../../types';

export interface AgentCoordinatorConfig {
  agentId: AgentId;
  eventBus: EventEmitter;
  memoryStore?: MemoryStore;
}

export class AgentCoordinator {
  private readonly agentId: AgentId;
  private readonly eventBus: EventEmitter;
  private readonly memoryStore?: MemoryStore;
  private readonly eventHandlers: Map<string, EventHandler[]> = new Map();

  constructor(config: AgentCoordinatorConfig) {
    this.agentId = config.agentId;
    this.eventBus = config.eventBus;
    this.memoryStore = config.memoryStore;
  }

  /**
   * Register an event handler for a specific event type
   * @param handler Event handler configuration
   */
  public registerEventHandler<T = any>(handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(handler.eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(handler.eventType, handlers);

    // Register with event bus
    this.eventBus.on(handler.eventType, handler.handler);
  }

  /**
   * Unregister an event handler
   * @param eventType Event type to unregister
   * @param handler Handler function to remove
   */
  public unregisterEventHandler(eventType: string, handler: Function): void {
    const handlers = this.eventHandlers.get(eventType);
    if (!handlers) return;

    const index = handlers.findIndex(h => h.handler === handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      this.eventBus.off(eventType, handler as any);
    }

    if (handlers.length === 0) {
      this.eventHandlers.delete(eventType);
    }
  }

  /**
   * Emit an event to the event bus
   * @param type Event type
   * @param data Event payload
   * @param priority Event priority
   */
  public emitEvent(
    type: string,
    data: any,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): void {
    const event: QEEvent = {
      id: this.generateEventId(),
      type,
      source: this.agentId,
      data,
      timestamp: new Date(),
      priority,
      scope: 'global'
    };

    this.eventBus.emit(type, event);
  }

  /**
   * Broadcast message to other agents
   * @param type Message type
   * @param payload Message payload
   * @param priority Message priority
   */
  public async broadcastMessage(
    type: string,
    payload: any,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to: { id: 'broadcast', type: 'all' as AgentType, created: new Date() },
      type: type as MessageType,
      payload,
      timestamp: new Date(),
      priority
    };

    this.eventBus.emit('agent.message', message);
  }

  /**
   * Send direct message to specific agent
   * @param toAgentId Target agent ID
   * @param type Message type
   * @param payload Message payload
   * @param priority Message priority
   */
  public async sendMessage(
    toAgentId: AgentId,
    type: string,
    payload: any,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: this.agentId,
      to: toAgentId,
      type: type as MessageType,
      payload,
      timestamp: new Date(),
      priority
    };

    this.eventBus.emit(`agent.message.${toAgentId.id}`, message);
  }

  /**
   * Report agent status to coordination system
   * @param status Status information to report
   */
  public async reportStatus(status: string, metrics?: any): Promise<void> {
    if (!this.memoryStore) {
      console.warn(`[${this.agentId.id}] Cannot report status: memory store not available`);
      return;
    }

    try {
      const sharedKey = `shared:${this.agentId.type}:status`;
      await this.memoryStore.store(sharedKey, {
        agentId: this.agentId.id,
        status,
        metrics,
        timestamp: new Date()
      });

      // Also emit event
      this.emitEvent('agent.status.updated', {
        agentId: this.agentId,
        status,
        metrics
      });
    } catch (error) {
      console.warn(`[${this.agentId.id}] Failed to report status:`, error);
    }
  }

  /**
   * Clean up all event handlers
   * Should be called during agent termination
   */
  public cleanup(): void {
    for (const [eventType, handlers] of this.eventHandlers.entries()) {
      for (const handler of handlers) {
        this.eventBus.off(eventType, handler.handler);
      }
    }
    this.eventHandlers.clear();
  }

  /**
   * Get registered event types
   */
  public getRegisteredEventTypes(): string[] {
    return Array.from(this.eventHandlers.keys());
  }

  /**
   * Get handler count for specific event type
   */
  public getHandlerCount(eventType: string): number {
    return this.eventHandlers.get(eventType)?.length || 0;
  }

  /**
   * Get total handler count
   */
  public getTotalHandlerCount(): number {
    let count = 0;
    for (const handlers of this.eventHandlers.values()) {
      count += handlers.length;
    }
    return count;
  }

  /**
   * Get event handlers map (for backward compatibility)
   */
  public getEventHandlers(): Map<string, EventHandler[]> {
    return this.eventHandlers;
  }

  /**
   * Clear all event handlers
   */
  public clearAllHandlers(): void {
    this.cleanup();
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event-${Date.now()}-${SecureRandom.generateId(5)}`;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${SecureRandom.generateId(5)}`;
  }
}
