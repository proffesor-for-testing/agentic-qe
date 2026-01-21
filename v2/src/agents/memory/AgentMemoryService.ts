/**
 * AgentMemoryService - Manages agent memory operations with automatic namespacing
 *
 * Responsibilities:
 * - Namespaced memory operations (agent-specific and shared)
 * - Task result storage and retrieval
 * - State persistence and restoration
 * - Memory key generation and validation
 *
 * Part of BaseAgent refactoring (Phase 3)
 * Reduces BaseAgent complexity by ~150 LOC
 */

import { MemoryStore, AgentId, QEAgentType as AgentType } from '../../types';

export interface AgentMemoryServiceConfig {
  agentId: AgentId;
  memoryStore: MemoryStore;
}

export interface TaskResultData {
  result: any;
  timestamp: Date;
  agentId: string;
}

export interface AgentStateData {
  performanceMetrics?: any;
  timestamp: Date;
  [key: string]: any;
}

export interface ErrorRecord {
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  assignment: {
    id: string;
    taskType: string;
  };
  timestamp: Date;
  agentId: string;
}

export class AgentMemoryService {
  private readonly agentId: AgentId;
  private readonly memoryStore: MemoryStore;

  constructor(config: AgentMemoryServiceConfig) {
    this.agentId = config.agentId;
    this.memoryStore = config.memoryStore;
  }

  // ============================================================================
  // Agent-Specific Memory (Namespaced by agent ID)
  // ============================================================================

  /**
   * Store data in agent-specific memory namespace
   * @param key Memory key (will be prefixed with agent:agentId:)
   * @param value Value to store
   * @param ttl Optional time-to-live in seconds
   */
  public async store(key: string, value: any, ttl?: number): Promise<void> {
    this.validateKey(key);

    const namespacedKey = this.buildAgentKey(key);

    try {
      await this.memoryStore.store(namespacedKey, value, ttl);
    } catch (error) {
      console.warn(`[${this.agentId.id}] Failed to store memory at ${namespacedKey}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve data from agent-specific memory namespace
   * @param key Memory key (will be prefixed with agent:agentId:)
   * @returns Stored value or null if not found
   */
  public async retrieve(key: string): Promise<any> {
    this.validateKey(key);

    const namespacedKey = this.buildAgentKey(key);

    try {
      return await this.memoryStore.retrieve(namespacedKey);
    } catch (error) {
      console.warn(`[${this.agentId.id}] Failed to retrieve memory from ${namespacedKey}:`, error);
      return null;
    }
  }

  /**
   * Check if key exists in agent memory
   * @param key Memory key to check
   */
  public async has(key: string): Promise<boolean> {
    const value = await this.retrieve(key);
    return value !== null && value !== undefined;
  }

  /**
   * Delete data from agent memory
   * @param key Memory key to delete
   */
  public async delete(key: string): Promise<void> {
    this.validateKey(key);

    const namespacedKey = this.buildAgentKey(key);

    try {
      // MemoryStore interface doesn't have delete, so we store null with TTL=1
      await this.memoryStore.store(namespacedKey, null, 1);
    } catch (error) {
      console.warn(`[${this.agentId.id}] Failed to delete memory at ${namespacedKey}:`, error);
    }
  }

  // ============================================================================
  // Shared Memory (Accessible by other agents)
  // ============================================================================

  /**
   * Store data in shared memory accessible by agents of the same type
   * @param key Memory key (will be prefixed with shared:agentType:)
   * @param value Value to store
   * @param ttl Optional time-to-live in seconds
   */
  public async storeShared(key: string, value: any, ttl?: number): Promise<void> {
    this.validateKey(key);

    const sharedKey = this.buildSharedKey(key);

    try {
      await this.memoryStore.store(sharedKey, value, ttl);
    } catch (error) {
      console.warn(`[${this.agentId.id}] Failed to store shared memory at ${sharedKey}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve data from shared memory of a specific agent type
   * @param agentType Type of agent that stored the data
   * @param key Memory key (will be prefixed with shared:agentType:)
   * @returns Stored value or null if not found
   */
  public async retrieveShared(agentType: AgentType, key: string): Promise<any> {
    this.validateKey(key);

    const sharedKey = `shared:${agentType}:${key}`;

    try {
      return await this.memoryStore.retrieve(sharedKey);
    } catch (error) {
      console.warn(`[${this.agentId.id}] Failed to retrieve shared memory from ${sharedKey}:`, error);
      return null;
    }
  }

  /**
   * Retrieve shared memory from this agent's type
   * @param key Memory key
   */
  public async retrieveOwnShared(key: string): Promise<any> {
    return this.retrieveShared(this.agentId.type, key);
  }

  // ============================================================================
  // Task-Specific Memory
  // ============================================================================

  /**
   * Store task execution result
   * @param taskId Task identifier
   * @param result Task result data
   */
  public async storeTaskResult(taskId: string, result: any): Promise<void> {
    const data: TaskResultData = {
      result,
      timestamp: new Date(),
      agentId: this.agentId.id
    };

    await this.store(`task:${taskId}:result`, data);
  }

  /**
   * Retrieve task execution result
   * @param taskId Task identifier
   * @returns Task result or null if not found
   */
  public async retrieveTaskResult(taskId: string): Promise<TaskResultData | null> {
    return await this.retrieve(`task:${taskId}:result`);
  }

  /**
   * Store task error information
   * @param taskId Task identifier
   * @param assignment Task assignment details
   * @param error Error object
   */
  public async storeTaskError(
    taskId: string,
    assignment: { id: string; taskType: string },
    error: Error
  ): Promise<void> {
    const errorRecord: ErrorRecord = {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      assignment,
      timestamp: new Date(),
      agentId: this.agentId.id
    };

    await this.store(`error:${taskId}`, errorRecord);
  }

  /**
   * Retrieve task error information
   * @param taskId Task identifier
   * @returns Error record or null if not found
   */
  public async retrieveTaskError(taskId: string): Promise<ErrorRecord | null> {
    return await this.retrieve(`error:${taskId}`);
  }

  // ============================================================================
  // State Persistence
  // ============================================================================

  /**
   * Save agent state to memory
   * @param state State data to persist
   */
  public async saveState(state: AgentStateData): Promise<void> {
    const stateWithTimestamp: AgentStateData = {
      ...state,
      timestamp: new Date()
    };

    await this.store('state', stateWithTimestamp);
  }

  /**
   * Restore agent state from memory
   * @returns Stored state or null if not found
   */
  public async restoreState(): Promise<AgentStateData | null> {
    try {
      const state = await this.retrieve('state');

      if (!state) {
        console.info(`[${this.agentId.id}] No saved state found`);
        return null;
      }

      return state;
    } catch (error) {
      console.warn(`[${this.agentId.id}] Could not restore state:`, error);
      return null;
    }
  }

  /**
   * Clear saved state
   */
  public async clearState(): Promise<void> {
    await this.delete('state');
  }

  // ============================================================================
  // Status Reporting
  // ============================================================================

  /**
   * Report agent status to coordination system
   * @param status Status string
   * @param metrics Optional metrics data
   */
  public async reportStatus(status: string, metrics?: any): Promise<void> {
    try {
      await this.storeShared('status', {
        agentId: this.agentId.id,
        status,
        metrics,
        timestamp: new Date()
      });
    } catch (error) {
      console.warn(`[${this.agentId.id}] Failed to report status:`, error);
    }
  }

  /**
   * Retrieve status of another agent of the same type
   * @param agentId Agent identifier
   * @returns Status information or null if not found
   */
  public async retrieveAgentStatus(agentId: string): Promise<any> {
    return await this.retrieveOwnShared('status');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Build agent-specific namespaced key
   * @param key Original key
   * @returns Namespaced key (agent:agentId:key)
   */
  private buildAgentKey(key: string): string {
    return `agent:${this.agentId.id}:${key}`;
  }

  /**
   * Build shared memory key
   * @param key Original key
   * @returns Shared key (shared:agentType:key)
   */
  private buildSharedKey(key: string): string {
    return `shared:${this.agentId.type}:${key}`;
  }

  /**
   * Validate memory key format
   * @param key Key to validate
   * @throws Error if key is invalid
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Memory key must be a non-empty string');
    }

    if (key.includes('..')) {
      throw new Error('Memory key cannot contain ".." (path traversal)');
    }

    if (key.length > 256) {
      throw new Error('Memory key too long (max 256 characters)');
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get memory usage statistics (if supported by MemoryStore)
   * @returns Statistics object or null if not supported
   */
  public async getStatistics(): Promise<{
    totalKeys: number;
    agentKeys: number;
    sharedKeys: number;
  } | null> {
    // This would require additional methods on MemoryStore interface
    // For now, return null
    return null;
  }

  /**
   * Get agent ID
   */
  public getAgentId(): AgentId {
    return this.agentId;
  }
}
