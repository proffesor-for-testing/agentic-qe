/**
 * Nervous System Persistence Manager
 *
 * Coordinates persistence across all nervous system components.
 * Provides a unified API for saving and restoring agent nervous system state.
 *
 * @module nervous-system/persistence/NervousSystemPersistenceManager
 */

import { EventEmitter } from 'events';
import type {
  INervousSystemStore,
  NervousSystemComponent,
  HdcSerializedState,
  BTSPSerializedState,
  CircadianSerializedState,
  StoredStateMetadata,
} from './INervousSystemStore.js';
import { SQLiteNervousSystemStore, createSQLiteNervousSystemStore } from './SQLiteNervousSystemStore.js';
import { Logger } from '../../utils/Logger.js';

/**
 * Configuration for NervousSystemPersistenceManager
 */
export interface NervousSystemPersistenceManagerConfig {
  /** Store implementation to use */
  store?: INervousSystemStore;
  /** Auto-save interval in milliseconds (0 = disabled) */
  autoSaveIntervalMs?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Database path for default SQLite store */
  dbPath?: string;
}

/**
 * Events emitted by the persistence manager
 */
export interface PersistenceManagerEvents {
  'state:saved': { agentId: string; component: NervousSystemComponent; sizeBytes: number };
  'state:loaded': { agentId: string; component: NervousSystemComponent };
  'state:deleted': { agentId: string; component?: NervousSystemComponent };
  'error': { agentId: string; operation: string; error: Error };
  'auto-save': { agentId: string; savedComponents: NervousSystemComponent[] };
}

/**
 * Pending state for auto-save
 */
interface PendingState {
  hdc?: HdcSerializedState;
  btsp?: BTSPSerializedState;
  circadian?: CircadianSerializedState;
}

/**
 * Manages persistence of nervous system state across agents
 */
export class NervousSystemPersistenceManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: Required<NervousSystemPersistenceManagerConfig>;
  private store: INervousSystemStore;
  private initialized = false;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  // Track pending state changes for auto-save
  private pendingStates: Map<string, PendingState> = new Map();

  // Track agents registered for auto-save
  private registeredAgents: Set<string> = new Set();

  constructor(config: NervousSystemPersistenceManagerConfig = {}) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      store: config.store ?? null as unknown as INervousSystemStore,
      autoSaveIntervalMs: config.autoSaveIntervalMs ?? 0,
      debug: config.debug ?? false,
      dbPath: config.dbPath ?? '.agentic-qe/memory.db',
    };

    // Create default store if not provided
    if (!this.config.store) {
      this.store = createSQLiteNervousSystemStore({ dbPath: this.config.dbPath });
    } else {
      this.store = this.config.store;
    }
  }

  /**
   * Initialize the persistence manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.store.initialize();

      // Start auto-save timer if configured
      if (this.config.autoSaveIntervalMs > 0) {
        this.startAutoSave();
      }

      this.initialized = true;
      this.logger.info('NervousSystemPersistenceManager initialized', {
        storeType: this.store.getStoreInfo().type,
        autoSaveInterval: this.config.autoSaveIntervalMs,
      });
    } catch (error) {
      this.logger.error('Failed to initialize NervousSystemPersistenceManager:', error);
      throw error;
    }
  }

  /**
   * Shutdown the persistence manager
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Stop auto-save
      this.stopAutoSave();

      // Flush any pending state
      await this.flushPendingStates();

      // Shutdown store
      await this.store.shutdown();

      this.initialized = false;
      this.logger.info('NervousSystemPersistenceManager shutdown complete');
    } catch (error) {
      this.logger.error('Error during NervousSystemPersistenceManager shutdown:', error);
    }
  }

  /**
   * Ensure manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('NervousSystemPersistenceManager not initialized. Call initialize() first.');
    }
  }

  // ============================================
  // HDC State Operations
  // ============================================

  /**
   * Save HDC memory state
   */
  async saveHdcState(agentId: string, state: HdcSerializedState): Promise<void> {
    this.ensureInitialized();

    try {
      await this.store.saveHdcState(agentId, state);

      const sizeBytes = JSON.stringify(state).length;
      this.emit('state:saved', { agentId, component: 'hdc', sizeBytes });

      if (this.config.debug) {
        this.logger.debug('Saved HDC state', { agentId, patterns: state.patterns.length });
      }
    } catch (error) {
      this.emit('error', { agentId, operation: 'saveHdcState', error: error as Error });
      throw error;
    }
  }

  /**
   * Load HDC memory state
   */
  async loadHdcState(agentId: string): Promise<HdcSerializedState | null> {
    this.ensureInitialized();

    try {
      const state = await this.store.loadHdcState(agentId);

      if (state) {
        this.emit('state:loaded', { agentId, component: 'hdc' });
      }

      return state;
    } catch (error) {
      this.emit('error', { agentId, operation: 'loadHdcState', error: error as Error });
      throw error;
    }
  }

  // ============================================
  // BTSP State Operations
  // ============================================

  /**
   * Save BTSP learner state
   */
  async saveBtspState(agentId: string, state: BTSPSerializedState): Promise<void> {
    this.ensureInitialized();

    try {
      await this.store.saveBtspState(agentId, state);

      const sizeBytes = JSON.stringify(state).length;
      this.emit('state:saved', { agentId, component: 'btsp', sizeBytes });

      if (this.config.debug) {
        this.logger.debug('Saved BTSP state', { agentId, associations: state.associationCount });
      }
    } catch (error) {
      this.emit('error', { agentId, operation: 'saveBtspState', error: error as Error });
      throw error;
    }
  }

  /**
   * Load BTSP learner state
   */
  async loadBtspState(agentId: string): Promise<BTSPSerializedState | null> {
    this.ensureInitialized();

    try {
      const state = await this.store.loadBtspState(agentId);

      if (state) {
        this.emit('state:loaded', { agentId, component: 'btsp' });
      }

      return state;
    } catch (error) {
      this.emit('error', { agentId, operation: 'loadBtspState', error: error as Error });
      throw error;
    }
  }

  // ============================================
  // Circadian State Operations
  // ============================================

  /**
   * Save circadian controller state
   */
  async saveCircadianState(agentId: string, state: CircadianSerializedState): Promise<void> {
    this.ensureInitialized();

    try {
      await this.store.saveCircadianState(agentId, state);

      const sizeBytes = JSON.stringify(state).length;
      this.emit('state:saved', { agentId, component: 'circadian', sizeBytes });

      if (this.config.debug) {
        this.logger.debug('Saved Circadian state', { agentId, phase: state.state.phase });
      }
    } catch (error) {
      this.emit('error', { agentId, operation: 'saveCircadianState', error: error as Error });
      throw error;
    }
  }

  /**
   * Load circadian controller state
   */
  async loadCircadianState(agentId: string): Promise<CircadianSerializedState | null> {
    this.ensureInitialized();

    try {
      const state = await this.store.loadCircadianState(agentId);

      if (state) {
        this.emit('state:loaded', { agentId, component: 'circadian' });
      }

      return state;
    } catch (error) {
      this.emit('error', { agentId, operation: 'loadCircadianState', error: error as Error });
      throw error;
    }
  }

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Save all nervous system state for an agent
   */
  async saveAllState(
    agentId: string,
    state: {
      hdc?: HdcSerializedState;
      btsp?: BTSPSerializedState;
      circadian?: CircadianSerializedState;
    }
  ): Promise<void> {
    this.ensureInitialized();

    const promises: Promise<void>[] = [];

    if (state.hdc) {
      promises.push(this.saveHdcState(agentId, state.hdc));
    }
    if (state.btsp) {
      promises.push(this.saveBtspState(agentId, state.btsp));
    }
    if (state.circadian) {
      promises.push(this.saveCircadianState(agentId, state.circadian));
    }

    await Promise.all(promises);
  }

  /**
   * Load all nervous system state for an agent
   */
  async loadAllState(agentId: string): Promise<{
    hdc: HdcSerializedState | null;
    btsp: BTSPSerializedState | null;
    circadian: CircadianSerializedState | null;
  }> {
    this.ensureInitialized();

    const [hdc, btsp, circadian] = await Promise.all([
      this.loadHdcState(agentId),
      this.loadBtspState(agentId),
      this.loadCircadianState(agentId),
    ]);

    return { hdc, btsp, circadian };
  }

  /**
   * Delete all state for an agent
   */
  async deleteAllState(agentId: string): Promise<void> {
    this.ensureInitialized();

    await this.store.deleteAllState(agentId);
    this.emit('state:deleted', { agentId });

    // Remove from pending and registered
    this.pendingStates.delete(agentId);
    this.registeredAgents.delete(agentId);
  }

  /**
   * List all agents with stored state
   */
  async listAgents(): Promise<string[]> {
    this.ensureInitialized();
    return this.store.listAgents();
  }

  /**
   * Get metadata about stored state
   */
  async getStateMetadata(
    agentId: string,
    component?: NervousSystemComponent
  ): Promise<StoredStateMetadata[]> {
    this.ensureInitialized();
    return this.store.getStateMetadata(agentId, component);
  }

  // ============================================
  // Auto-Save Management
  // ============================================

  /**
   * Register an agent for auto-save
   */
  registerForAutoSave(agentId: string): void {
    this.registeredAgents.add(agentId);
    if (!this.pendingStates.has(agentId)) {
      this.pendingStates.set(agentId, {});
    }
  }

  /**
   * Unregister an agent from auto-save
   */
  unregisterFromAutoSave(agentId: string): void {
    this.registeredAgents.delete(agentId);
    this.pendingStates.delete(agentId);
  }

  /**
   * Queue state for auto-save
   */
  queueStateForAutoSave(
    agentId: string,
    state: {
      hdc?: HdcSerializedState;
      btsp?: BTSPSerializedState;
      circadian?: CircadianSerializedState;
    }
  ): void {
    if (!this.registeredAgents.has(agentId)) {
      this.registerForAutoSave(agentId);
    }

    const pending = this.pendingStates.get(agentId) || {};

    if (state.hdc) pending.hdc = state.hdc;
    if (state.btsp) pending.btsp = state.btsp;
    if (state.circadian) pending.circadian = state.circadian;

    this.pendingStates.set(agentId, pending);
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(async () => {
      await this.flushPendingStates();
    }, this.config.autoSaveIntervalMs);

    this.logger.debug('Auto-save started', { intervalMs: this.config.autoSaveIntervalMs });
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Flush all pending state to storage
   */
  private async flushPendingStates(): Promise<void> {
    for (const [agentId, pending] of this.pendingStates.entries()) {
      const savedComponents: NervousSystemComponent[] = [];

      try {
        if (pending.hdc) {
          await this.store.saveHdcState(agentId, pending.hdc);
          savedComponents.push('hdc');
          delete pending.hdc;
        }

        if (pending.btsp) {
          await this.store.saveBtspState(agentId, pending.btsp);
          savedComponents.push('btsp');
          delete pending.btsp;
        }

        if (pending.circadian) {
          await this.store.saveCircadianState(agentId, pending.circadian);
          savedComponents.push('circadian');
          delete pending.circadian;
        }

        if (savedComponents.length > 0) {
          this.emit('auto-save', { agentId, savedComponents });

          if (this.config.debug) {
            this.logger.debug('Auto-saved state', { agentId, components: savedComponents });
          }
        }
      } catch (error) {
        this.logger.error('Auto-save failed', { agentId, error });
        this.emit('error', { agentId, operation: 'autoSave', error: error as Error });
      }
    }
  }

  // ============================================
  // Store Information
  // ============================================

  /**
   * Get information about the underlying store
   */
  getStoreInfo(): {
    type: 'sqlite' | 'supabase' | 'file' | 'memory';
    version: string;
    location?: string;
  } {
    return this.store.getStoreInfo();
  }

  /**
   * Get statistics about the persistence manager
   */
  getStats(): {
    initialized: boolean;
    registeredAgents: number;
    pendingStates: number;
    autoSaveEnabled: boolean;
    autoSaveIntervalMs: number;
    storeType: string;
  } {
    return {
      initialized: this.initialized,
      registeredAgents: this.registeredAgents.size,
      pendingStates: this.pendingStates.size,
      autoSaveEnabled: this.config.autoSaveIntervalMs > 0,
      autoSaveIntervalMs: this.config.autoSaveIntervalMs,
      storeType: this.store.getStoreInfo().type,
    };
  }
}

/**
 * Factory function to create persistence manager
 */
export function createNervousSystemPersistenceManager(
  config?: NervousSystemPersistenceManagerConfig
): NervousSystemPersistenceManager {
  return new NervousSystemPersistenceManager(config);
}

/**
 * Singleton instance for shared use
 */
let sharedManager: NervousSystemPersistenceManager | null = null;

/**
 * Get or create shared persistence manager instance
 */
export async function getSharedPersistenceManager(
  config?: NervousSystemPersistenceManagerConfig
): Promise<NervousSystemPersistenceManager> {
  if (!sharedManager) {
    sharedManager = createNervousSystemPersistenceManager(config);
    await sharedManager.initialize();
  }
  return sharedManager;
}

/**
 * Reset shared instance (for testing)
 */
export async function resetSharedPersistenceManager(): Promise<void> {
  if (sharedManager) {
    await sharedManager.shutdown();
    sharedManager = null;
  }
}
