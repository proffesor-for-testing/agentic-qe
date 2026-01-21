/**
 * Memory Store Handler
 *
 * Handles storage of QE data with TTL support, namespacing, and metadata.
 * Implements the memory_store MCP tool for agent coordination.
 *
 * Issue #79 Fix: Added actual SQLite persistence when persist: true
 *
 * @version 1.1.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';
import type { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';

export interface MemoryStoreParams {
  key: string;
  value: any;
  namespace?: string;
  ttl?: number;
  metadata?: Record<string, any>;
  persist?: boolean;
}

/**
 * Handles memory storage operations for QE agents
 */
export class MemoryStoreHandler extends BaseHandler {
  private ttlTimers: Map<string, NodeJS.Timeout>;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    private memoryStore: Map<string, any>,
    private persistentMemory?: SwarmMemoryManager
  ) {
    super();
    this.ttlTimers = new Map();
  }

  /**
   * Handle memory store request
   */
  async handle(args: MemoryStoreParams): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();

      // Validate required fields
      this.validateRequired(args, ['key', 'value']);

      const { key, value, namespace = 'default', ttl, metadata, persist = false } = args;

      // Create memory key with namespace
      const memoryKey = this.createMemoryKey(namespace, key);

      // Create memory record
      const record = {
        key: memoryKey,
        value,
        namespace,
        timestamp: Date.now(),
        ttl: ttl || 0,
        metadata: metadata || {},
        persistent: persist
      };

      // Store in memory (always - for fast in-session access)
      this.memoryStore.set(memoryKey, record);

      // Issue #79 Fix: Actually persist to SQLite when persist: true
      if (persist && this.persistentMemory) {
        try {
          await this.persistentMemory.store(key, value, {
            partition: namespace,
            ttl: ttl,
            metadata: metadata,
            owner: metadata?.agentId || 'system'
          });
          this.log('info', `Memory persisted to SQLite: ${memoryKey}`, { namespace, ttl });
        } catch (error) {
          this.log('warn', `Failed to persist to SQLite: ${memoryKey}`, {
            error: error instanceof Error ? error.message : String(error)
          });
          // Don't throw - in-memory storage succeeded
        }
      }

      // Set TTL if specified
      if (ttl && ttl > 0) {
        this.setTTL(memoryKey, ttl);
      }

      // Execute post-edit hook for memory coordination
      await this.hookExecutor.executePostEdit({
        file: `memory://${memoryKey}`,
        memoryKey: `qe/memory/${namespace}/${key}`,
        agentId: metadata?.agentId || 'system'
      });

      this.log('info', `Memory stored: ${memoryKey}`, { namespace, ttl, persist });

      return this.createSuccessResponse({
        stored: true,
        key: memoryKey,
        namespace,
        ttl: ttl || 0,
        timestamp: record.timestamp,
        persistent: persist,
        persistedToDb: persist && !!this.persistentMemory
      }, requestId);
    });
  }

  /**
   * Create namespaced memory key
   */
  private createMemoryKey(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Set TTL for memory key
   */
  private setTTL(memoryKey: string, ttl: number): void {
    // Clear existing timer if any
    if (this.ttlTimers.has(memoryKey)) {
      clearTimeout(this.ttlTimers.get(memoryKey)!);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.memoryStore.delete(memoryKey);
      this.ttlTimers.delete(memoryKey);
      this.log('info', `Memory expired: ${memoryKey}`);
    }, ttl * 1000);

    this.ttlTimers.set(memoryKey, timer);
  }

  /**
   * Clean up all timers
   */
  async cleanup(): Promise<void> {
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();
    this.memoryStore.clear();
  }
}
