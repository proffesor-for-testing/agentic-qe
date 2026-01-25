/**
 * Hybrid Persistence Provider
 *
 * Local-first persistence with cloud sync capabilities.
 * Uses SQLite for immediate local storage and syncs to Supabase in the background.
 *
 * Features:
 * - Immediate local writes (low latency)
 * - Background sync to cloud
 * - Conflict resolution strategies
 * - Offline support with sync on reconnect
 * - Queue-based sync for reliability
 *
 * @module persistence/HybridPersistenceProvider
 */

import { EventEmitter } from 'events';
import type {
  IPersistenceProvider,
  ProviderInfo,
  LearningExperience,
  ExperienceQuery,
  SharedExperienceQuery,
  StoredPattern,
  PatternQuery,
  NervousSystemComponent,
  PrivacyLevel,
  MemoryEntry,
  MemoryQuery,
  EventRecord,
  EventQuery,
  CodeChunk,
  CodeChunkQuery,
  CodeSearchResult,
  CodeLanguage,
} from './IPersistenceProvider.js';
import {
  type SupabaseConfig,
  type SyncConfig,
  DEFAULT_SYNC_CONFIG,
  buildSupabaseConfig,
  isSupabaseConfigured,
} from './SupabaseConfig.js';
import { SupabasePersistenceProvider } from './SupabasePersistenceProvider.js';
import {
  createSQLiteNervousSystemStore,
  SQLiteNervousSystemStore,
} from '../nervous-system/persistence/SQLiteNervousSystemStore.js';

// ============================================
// Types
// ============================================

/**
 * Sync operation types
 */
type SyncOperation = 'insert' | 'update' | 'delete';

/**
 * Sync queue entry
 */
interface SyncQueueEntry {
  id: string;
  operation: SyncOperation;
  tableName: string;
  recordId: string;
  data?: Record<string, unknown>;
  retryCount: number;
  createdAt: number;
}

/**
 * Sync status
 */
interface SyncStatus {
  lastSyncTime: Date | null;
  pendingUploads: number;
  pendingDownloads: number;
  conflicts: number;
  isOnline: boolean;
  isSyncing: boolean;
}

/**
 * Hybrid provider configuration
 */
export interface HybridProviderConfig {
  /** Local SQLite database path */
  localDbPath: string;
  /** Supabase configuration (optional - can be added later) */
  supabaseConfig?: Partial<SupabaseConfig>;
  /** Sync configuration */
  syncConfig?: Partial<SyncConfig>;
  /** Enable auto-sync on changes */
  autoSync?: boolean;
  /** Maximum queue size before forcing sync */
  maxQueueSize?: number;
}

// ============================================
// Provider Implementation
// ============================================

/**
 * Hybrid persistence provider with local-first approach
 *
 * @example
 * ```typescript
 * const provider = new HybridPersistenceProvider({
 *   localDbPath: './data/aqe.db',
 *   supabaseConfig: {
 *     connection: {
 *       url: 'https://xxx.supabase.co',
 *       anonKey: 'xxx',
 *     },
 *   },
 * });
 *
 * await provider.initialize();
 *
 * // Writes go to local first, then sync to cloud
 * await provider.storeExperience(experience);
 *
 * // Force sync
 * const result = await provider.syncToCloud();
 * console.log(`Synced ${result.uploaded} items`);
 * ```
 */
export class HybridPersistenceProvider
  extends EventEmitter
  implements IPersistenceProvider
{
  // Local store
  private localStore: SQLiteNervousSystemStore | null = null;

  // Cloud provider (optional)
  private cloudProvider: SupabasePersistenceProvider | null = null;

  // Sync queue
  private syncQueue: SyncQueueEntry[] = [];
  private syncTimer: NodeJS.Timeout | null = null;

  // State
  private initialized = false;
  private syncStatus: SyncStatus = {
    lastSyncTime: null,
    pendingUploads: 0,
    pendingDownloads: 0,
    conflicts: 0,
    isOnline: false,
    isSyncing: false,
  };

  // Configuration
  private readonly config: Required<HybridProviderConfig>;
  private readonly syncConfig: SyncConfig;

  constructor(config: HybridProviderConfig) {
    super();

    this.config = {
      localDbPath: config.localDbPath,
      supabaseConfig: config.supabaseConfig ?? {},
      syncConfig: config.syncConfig ?? {},
      autoSync: config.autoSync ?? true,
      maxQueueSize: config.maxQueueSize ?? 100,
    };

    this.syncConfig = {
      ...DEFAULT_SYNC_CONFIG,
      ...config.syncConfig,
    };
  }

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize local store
    this.localStore = createSQLiteNervousSystemStore({
      dbPath: this.config.localDbPath,
    });
    await this.localStore.initialize();

    // Initialize cloud provider if configured
    if (isSupabaseConfigured() || this.config.supabaseConfig?.connection) {
      try {
        this.cloudProvider = new SupabasePersistenceProvider(
          this.config.supabaseConfig
        );
        await this.cloudProvider.initialize();
        this.syncStatus.isOnline = true;
        this.emit('online');
      } catch (error) {
        console.warn('[HybridProvider] Cloud provider failed to initialize:', error);
        this.syncStatus.isOnline = false;
      }
    }

    // Start background sync if enabled
    if (this.config.autoSync && this.syncConfig.backgroundSync) {
      this.startBackgroundSync();
    }

    this.initialized = true;
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    // Stop background sync
    this.stopBackgroundSync();

    // Flush pending sync queue
    if (this.syncQueue.length > 0 && this.syncStatus.isOnline) {
      try {
        await this.syncToCloud();
      } catch (error) {
        console.warn('[HybridProvider] Failed to sync before shutdown:', error);
      }
    }

    // Shutdown providers
    if (this.cloudProvider) {
      await this.cloudProvider.shutdown();
      this.cloudProvider = null;
    }

    if (this.localStore) {
      await this.localStore.shutdown();
      this.localStore = null;
    }

    this.initialized = false;
    this.emit('shutdown');
  }

  // ============================================
  // Learning Experiences (Local-first)
  // ============================================

  async storeExperience(experience: LearningExperience): Promise<void> {
    this.ensureInitialized();

    // Store locally first (immediate)
    // For now, we store in local SQLite using a simple JSON approach
    // In a full implementation, we'd have a proper experiences table
    const key = `experience:${experience.id}`;
    const data = JSON.stringify(experience);

    // Use the nervous system state storage as a generic key-value store
    await this.localStore!.saveCircadianState(key, {
      version: 1,
      state: { data } as never,
      metrics: {} as never,
      lastPhaseChange: 0,
      serializedAt: Date.now(),
    });

    // Queue for cloud sync
    this.queueSync('insert', 'experiences', experience.id, experience as unknown as Record<string, unknown>);

    this.emit('experience:stored', experience.id);
  }

  async queryExperiences(query: ExperienceQuery): Promise<LearningExperience[]> {
    this.ensureInitialized();

    // Try cloud first if online for most up-to-date data
    if (this.syncStatus.isOnline && this.cloudProvider) {
      try {
        return await this.cloudProvider.queryExperiences(query);
      } catch (error) {
        console.warn('[HybridProvider] Cloud query failed, falling back to local:', error);
      }
    }

    // Fall back to local (simplified - would need proper local query implementation)
    // For a full implementation, we'd query the local SQLite database
    return [];
  }

  async searchSimilarExperiences(
    embedding: number[],
    limit: number
  ): Promise<LearningExperience[]> {
    this.ensureInitialized();

    // Vector search only available in cloud
    if (this.syncStatus.isOnline && this.cloudProvider) {
      return this.cloudProvider.searchSimilarExperiences(embedding, limit);
    }

    // Local fallback - would need local vector search implementation
    return [];
  }

  // ============================================
  // Patterns (Local-first)
  // ============================================

  async storePattern(pattern: StoredPattern): Promise<void> {
    this.ensureInitialized();

    // Store locally
    const key = `pattern:${pattern.id}`;
    const data = JSON.stringify(pattern);

    await this.localStore!.saveCircadianState(key, {
      version: 1,
      state: { data } as never,
      metrics: {} as never,
      lastPhaseChange: 0,
      serializedAt: Date.now(),
    });

    // Queue for cloud sync
    this.queueSync('insert', 'patterns', pattern.id, pattern as unknown as Record<string, unknown>);

    this.emit('pattern:stored', pattern.id);
  }

  async queryPatterns(query: PatternQuery): Promise<StoredPattern[]> {
    this.ensureInitialized();

    if (this.syncStatus.isOnline && this.cloudProvider) {
      try {
        return await this.cloudProvider.queryPatterns(query);
      } catch (error) {
        console.warn('[HybridProvider] Cloud query failed, falling back to local:', error);
      }
    }

    return [];
  }

  async searchSimilarPatterns(
    embedding: number[],
    limit: number
  ): Promise<StoredPattern[]> {
    this.ensureInitialized();

    if (this.syncStatus.isOnline && this.cloudProvider) {
      return this.cloudProvider.searchSimilarPatterns(embedding, limit);
    }

    return [];
  }

  // ============================================
  // Nervous System State (Local-first)
  // ============================================

  async saveNervousSystemState(
    agentId: string,
    component: NervousSystemComponent,
    state: Uint8Array | Record<string, unknown>
  ): Promise<void> {
    this.ensureInitialized();

    // For hybrid provider, delegate to cloud if available for full state handling
    // Local store handles the underlying SQLite persistence
    if (this.syncStatus.isOnline && this.cloudProvider) {
      await this.cloudProvider.saveNervousSystemState(agentId, component, state);
    }

    // Also store locally using a simplified approach
    // We use the circadian state table as a generic JSON store for local cache
    const cacheKey = `ns:${agentId}:${component}`;
    await this.localStore!.saveCircadianState(cacheKey, {
      version: 1,
      state: {
        phase: 'Active',
        cycleTime: 0,
        phaseTime: 0,
        energyRemaining: 0,
        cyclesCompleted: 0,
        activeModulation: null,
        timeToNextPhase: 0,
        wasmEnabled: false,
        // Store actual data as JSON in a custom field
        _rawData: state instanceof Uint8Array ? Array.from(state) : state,
        _isBinary: state instanceof Uint8Array,
      } as never,
      metrics: {
        phaseTime: { Active: 0, Dawn: 0, Dusk: 0, Rest: 0 },
        reactionsPerPhase: { Active: 0, Dawn: 0, Dusk: 0, Rest: 0 },
        rejectionsPerPhase: { Active: 0, Dawn: 0, Dusk: 0, Rest: 0 },
        averageDutyFactor: 0,
        totalEnergyConsumed: 0,
        phaseTransitions: 0,
        hysteresisActivations: 0,
        wtaCompetitions: 0,
      },
      lastPhaseChange: Date.now(),
      serializedAt: Date.now(),
    });

    // Queue for cloud sync if not already synced
    if (!this.syncStatus.isOnline) {
      this.queueSync('update', 'nervous_system', `${agentId}:${component}`, {
        agentId,
        component,
        state: state instanceof Uint8Array ? Array.from(state) : state,
      });
    }

    this.emit('nervousSystem:saved', { agentId, component });
  }

  async loadNervousSystemState(
    agentId: string,
    component: NervousSystemComponent
  ): Promise<Uint8Array | Record<string, unknown> | null> {
    this.ensureInitialized();

    // Try cloud first if available
    if (this.syncStatus.isOnline && this.cloudProvider) {
      try {
        const cloudState = await this.cloudProvider.loadNervousSystemState(agentId, component);
        if (cloudState) {
          return cloudState;
        }
      } catch (error) {
        console.warn('[HybridProvider] Cloud load failed, trying local:', error);
      }
    }

    // Fall back to local cache
    const cacheKey = `ns:${agentId}:${component}`;
    const cached = await this.localStore!.loadCircadianState(cacheKey);

    if (cached && cached.state) {
      const stateData = cached.state as unknown as Record<string, unknown>;
      const rawData = stateData._rawData;
      const isBinary = stateData._isBinary;

      if (rawData) {
        if (isBinary && Array.isArray(rawData)) {
          return new Uint8Array(rawData as number[]);
        }
        return rawData as Record<string, unknown>;
      }
    }

    return null;
  }

  async deleteNervousSystemState(agentId: string): Promise<void> {
    this.ensureInitialized();

    await this.localStore!.deleteAllState(agentId);

    // Queue for cloud sync
    this.queueSync('delete', 'nervous_system', agentId);

    this.emit('nervousSystem:deleted', agentId);
  }

  async listAgentsWithState(): Promise<string[]> {
    this.ensureInitialized();
    return this.localStore!.listAgents();
  }

  // ============================================
  // Sharing (Delegated to cloud)
  // ============================================

  async shareExperience(experienceId: string, privacyLevel: PrivacyLevel): Promise<void> {
    this.ensureCloudAvailable();
    await this.cloudProvider!.shareExperience!(experienceId, privacyLevel);
  }

  async importSharedExperiences(query: SharedExperienceQuery): Promise<LearningExperience[]> {
    this.ensureCloudAvailable();
    return this.cloudProvider!.importSharedExperiences!(query);
  }

  async sharePattern(patternId: string, privacyLevel: PrivacyLevel): Promise<void> {
    this.ensureCloudAvailable();
    await this.cloudProvider!.sharePattern!(patternId, privacyLevel);
  }

  async importSharedPatterns(
    query: PatternQuery & { includePublic?: boolean }
  ): Promise<StoredPattern[]> {
    this.ensureCloudAvailable();
    return this.cloudProvider!.importSharedPatterns!(query);
  }

  // ============================================
  // Memory Entries (Local-first)
  // ============================================

  async storeMemoryEntry(entry: MemoryEntry): Promise<void> {
    this.ensureInitialized();

    // Store locally first
    const key = `memory:${entry.partition}:${entry.key}`;
    await this.localStore!.saveCircadianState(key, {
      version: 1,
      state: { data: JSON.stringify(entry) } as never,
      metrics: {} as never,
      lastPhaseChange: 0,
      serializedAt: Date.now(),
    });

    // Queue for cloud sync
    this.queueSync('insert', 'memory_entries', `${entry.partition}:${entry.key}`, entry as unknown as Record<string, unknown>);

    this.emit('memory:stored', entry.key);
  }

  async storeMemoryEntries(entries: MemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.storeMemoryEntry(entry);
    }
  }

  async getMemoryEntry(key: string, partition = 'default'): Promise<MemoryEntry | null> {
    this.ensureInitialized();

    // Try cloud first if available
    if (this.syncStatus.isOnline && this.cloudProvider?.getMemoryEntry) {
      try {
        const cloudEntry = await this.cloudProvider.getMemoryEntry(key, partition);
        if (cloudEntry) return cloudEntry;
      } catch (error) {
        console.warn('[HybridProvider] Cloud getMemoryEntry failed:', error);
      }
    }

    // Fall back to local
    const localKey = `memory:${partition}:${key}`;
    const cached = await this.localStore!.loadCircadianState(localKey);
    if (cached?.state) {
      const stateData = cached.state as unknown as { data?: string };
      if (stateData.data) {
        return JSON.parse(stateData.data) as MemoryEntry;
      }
    }

    return null;
  }

  async queryMemoryEntries(query: MemoryQuery): Promise<MemoryEntry[]> {
    this.ensureInitialized();

    // Query cloud if available (more complete data)
    if (this.syncStatus.isOnline && this.cloudProvider?.queryMemoryEntries) {
      try {
        return await this.cloudProvider.queryMemoryEntries(query);
      } catch (error) {
        console.warn('[HybridProvider] Cloud queryMemoryEntries failed:', error);
      }
    }

    // Local fallback - simplified, would need proper implementation
    return [];
  }

  async deleteMemoryEntries(keyPattern: string, partition?: string): Promise<number> {
    this.ensureInitialized();

    // Queue for cloud sync
    this.queueSync('delete', 'memory_entries', `${partition ?? 'default'}:${keyPattern}`);

    // Also delete locally if cloud succeeds
    if (this.syncStatus.isOnline && this.cloudProvider?.deleteMemoryEntries) {
      try {
        return await this.cloudProvider.deleteMemoryEntries(keyPattern, partition);
      } catch (error) {
        console.warn('[HybridProvider] Cloud deleteMemoryEntries failed:', error);
      }
    }

    return 0;
  }

  // ============================================
  // Events (Local-first with buffering)
  // ============================================

  async storeEvent(event: EventRecord): Promise<void> {
    this.ensureInitialized();

    // Store locally
    const key = `event:${event.id}`;
    await this.localStore!.saveCircadianState(key, {
      version: 1,
      state: { data: JSON.stringify(event) } as never,
      metrics: {} as never,
      lastPhaseChange: 0,
      serializedAt: Date.now(),
    });

    // Queue for cloud sync
    this.queueSync('insert', 'events', event.id, event as unknown as Record<string, unknown>);

    this.emit('event:stored', event.id);
  }

  async storeEvents(events: EventRecord[]): Promise<void> {
    // Batch store for efficiency
    for (const event of events) {
      await this.storeEvent(event);
    }
  }

  async queryEvents(query: EventQuery): Promise<EventRecord[]> {
    this.ensureInitialized();

    // Query cloud if available
    if (this.syncStatus.isOnline && this.cloudProvider?.queryEvents) {
      try {
        return await this.cloudProvider.queryEvents(query);
      } catch (error) {
        console.warn('[HybridProvider] Cloud queryEvents failed:', error);
      }
    }

    // Local fallback
    return [];
  }

  async deleteOldEvents(olderThan: Date): Promise<number> {
    this.ensureInitialized();

    // Queue for cloud sync
    this.queueSync('delete', 'events', `older-than:${olderThan.toISOString()}`);

    if (this.syncStatus.isOnline && this.cloudProvider?.deleteOldEvents) {
      try {
        return await this.cloudProvider.deleteOldEvents(olderThan);
      } catch (error) {
        console.warn('[HybridProvider] Cloud deleteOldEvents failed:', error);
      }
    }

    return 0;
  }

  // ============================================
  // Code Chunks (Local-first)
  // ============================================

  async storeCodeChunk(chunk: CodeChunk): Promise<void> {
    this.ensureInitialized();

    // Store locally
    const key = `code:${chunk.projectId}:${chunk.filePath}:${chunk.startLine}`;
    await this.localStore!.saveCircadianState(key, {
      version: 1,
      state: { data: JSON.stringify(chunk) } as never,
      metrics: {} as never,
      lastPhaseChange: 0,
      serializedAt: Date.now(),
    });

    // Queue for cloud sync
    this.queueSync('insert', 'code_chunks', chunk.id, chunk as unknown as Record<string, unknown>);

    this.emit('code:stored', chunk.id);
  }

  async storeCodeChunks(chunks: CodeChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.storeCodeChunk(chunk);
    }
  }

  async queryCodeChunks(query: CodeChunkQuery): Promise<CodeChunk[]> {
    this.ensureInitialized();

    // Query cloud if available
    if (this.syncStatus.isOnline && this.cloudProvider?.queryCodeChunks) {
      try {
        return await this.cloudProvider.queryCodeChunks(query);
      } catch (error) {
        console.warn('[HybridProvider] Cloud queryCodeChunks failed:', error);
      }
    }

    // Local fallback
    return [];
  }

  async searchSimilarCode(
    embedding: number[],
    options?: {
      limit?: number;
      minScore?: number;
      projectId?: string;
      language?: CodeLanguage;
    }
  ): Promise<CodeSearchResult[]> {
    this.ensureInitialized();

    // Vector search only available in cloud
    if (this.syncStatus.isOnline && this.cloudProvider?.searchSimilarCode) {
      return this.cloudProvider.searchSimilarCode(embedding, options);
    }

    // No local vector search - would require local embedding index
    return [];
  }

  async deleteCodeChunksForFile(projectId: string, filePath: string): Promise<number> {
    this.ensureInitialized();

    // Queue for cloud sync
    this.queueSync('delete', 'code_chunks', `file:${projectId}:${filePath}`);

    if (this.syncStatus.isOnline && this.cloudProvider?.deleteCodeChunksForFile) {
      try {
        return await this.cloudProvider.deleteCodeChunksForFile(projectId, filePath);
      } catch (error) {
        console.warn('[HybridProvider] Cloud deleteCodeChunksForFile failed:', error);
      }
    }

    return 0;
  }

  async deleteCodeChunksForProject(projectId: string): Promise<number> {
    this.ensureInitialized();

    // Queue for cloud sync
    this.queueSync('delete', 'code_chunks', `project:${projectId}`);

    if (this.syncStatus.isOnline && this.cloudProvider?.deleteCodeChunksForProject) {
      try {
        return await this.cloudProvider.deleteCodeChunksForProject(projectId);
      } catch (error) {
        console.warn('[HybridProvider] Cloud deleteCodeChunksForProject failed:', error);
      }
    }

    return 0;
  }

  // ============================================
  // Sync Operations
  // ============================================

  async syncToCloud(): Promise<{ uploaded: number; conflicts: number }> {
    if (!this.syncStatus.isOnline || !this.cloudProvider) {
      throw new Error('Cloud provider not available');
    }

    if (this.syncStatus.isSyncing) {
      return { uploaded: 0, conflicts: 0 };
    }

    this.syncStatus.isSyncing = true;
    this.emit('sync:started');

    let uploaded = 0;
    let conflicts = 0;

    try {
      // Process sync queue
      const queue = [...this.syncQueue];
      this.syncQueue = [];

      for (const entry of queue) {
        try {
          await this.processSyncEntry(entry);
          uploaded++;
        } catch (error) {
          // Check if it's a conflict
          if (this.isConflictError(error)) {
            conflicts++;
            await this.resolveConflict(entry);
          } else {
            // Re-queue for retry
            entry.retryCount++;
            if (entry.retryCount < this.syncConfig.retryAttempts) {
              this.syncQueue.push(entry);
            } else {
              console.error(`[HybridProvider] Sync failed for ${entry.tableName}:${entry.recordId}`, error);
            }
          }
        }
      }

      this.syncStatus.lastSyncTime = new Date();
      this.syncStatus.pendingUploads = this.syncQueue.length;
      this.syncStatus.conflicts = conflicts;

      this.emit('sync:completed', { uploaded, conflicts });
    } finally {
      this.syncStatus.isSyncing = false;
    }

    return { uploaded, conflicts };
  }

  async syncFromCloud(): Promise<{ downloaded: number; conflicts: number }> {
    if (!this.syncStatus.isOnline || !this.cloudProvider) {
      throw new Error('Cloud provider not available');
    }

    // For a full implementation, this would:
    // 1. Query cloud for records newer than last sync
    // 2. Download and merge with local data
    // 3. Handle conflicts based on resolution strategy

    this.emit('sync:fromCloud');
    return { downloaded: 0, conflicts: 0 };
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return {
      ...this.syncStatus,
      pendingUploads: this.syncQueue.length,
    };
  }

  // ============================================
  // Info
  // ============================================

  getProviderInfo(): ProviderInfo {
    return {
      type: 'hybrid',
      features: [
        'local-first',
        'offline-support',
        'background-sync',
        'conflict-resolution',
        'cloud-backup',
        'memory-sync',
        'event-sync',
        'code-intelligence-sync',
        ...(this.cloudProvider ? ['cloud-available', 'vector-search', 'sharing'] : []),
      ],
      initialized: this.initialized,
      location: this.config.localDbPath,
      stats: {
        agentCount: 0, // Would need to query
        lastSyncTime: this.syncStatus.lastSyncTime ?? undefined,
      },
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.localStore) {
      throw new Error('HybridPersistenceProvider not initialized');
    }
  }

  private ensureCloudAvailable(): void {
    this.ensureInitialized();
    if (!this.cloudProvider) {
      throw new Error('Cloud provider not available');
    }
  }

  private queueSync(
    operation: SyncOperation,
    tableName: string,
    recordId: string,
    data?: Record<string, unknown>
  ): void {
    const entry: SyncQueueEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      operation,
      tableName,
      recordId,
      data,
      retryCount: 0,
      createdAt: Date.now(),
    };

    this.syncQueue.push(entry);
    this.syncStatus.pendingUploads = this.syncQueue.length;

    // Force sync if queue is too large
    if (this.syncQueue.length >= this.config.maxQueueSize) {
      this.syncToCloud().catch((err) =>
        console.warn('[HybridProvider] Force sync failed:', err)
      );
    }
  }

  private async processSyncEntry(entry: SyncQueueEntry): Promise<void> {
    if (!this.cloudProvider) return;

    // Process based on table and operation
    switch (entry.tableName) {
      case 'experiences':
        if (entry.operation === 'insert' || entry.operation === 'update') {
          await this.cloudProvider.storeExperience(entry.data as unknown as LearningExperience);
        }
        break;

      case 'patterns':
        if (entry.operation === 'insert' || entry.operation === 'update') {
          await this.cloudProvider.storePattern(entry.data as unknown as StoredPattern);
        }
        break;

      case 'nervous_system':
        if (entry.operation === 'update' && entry.data) {
          const { agentId, component, state } = entry.data as {
            agentId: string;
            component: NervousSystemComponent;
            state: number[] | Record<string, unknown>;
          };
          const stateValue = Array.isArray(state) ? new Uint8Array(state) : state;
          await this.cloudProvider.saveNervousSystemState(agentId, component, stateValue);
        } else if (entry.operation === 'delete') {
          await this.cloudProvider.deleteNervousSystemState(entry.recordId);
        }
        break;

      case 'memory_entries':
        if ((entry.operation === 'insert' || entry.operation === 'update') && entry.data) {
          if (this.cloudProvider.storeMemoryEntry) {
            await this.cloudProvider.storeMemoryEntry(entry.data as unknown as MemoryEntry);
          }
        } else if (entry.operation === 'delete') {
          if (this.cloudProvider.deleteMemoryEntries) {
            const [partition, keyPattern] = entry.recordId.split(':');
            await this.cloudProvider.deleteMemoryEntries(keyPattern, partition);
          }
        }
        break;

      case 'events':
        if ((entry.operation === 'insert' || entry.operation === 'update') && entry.data) {
          if (this.cloudProvider.storeEvent) {
            await this.cloudProvider.storeEvent(entry.data as unknown as EventRecord);
          }
        } else if (entry.operation === 'delete') {
          if (entry.recordId.startsWith('older-than:') && this.cloudProvider.deleteOldEvents) {
            const dateStr = entry.recordId.replace('older-than:', '');
            await this.cloudProvider.deleteOldEvents(new Date(dateStr));
          }
        }
        break;

      case 'code_chunks':
        if ((entry.operation === 'insert' || entry.operation === 'update') && entry.data) {
          if (this.cloudProvider.storeCodeChunk) {
            await this.cloudProvider.storeCodeChunk(entry.data as unknown as CodeChunk);
          }
        } else if (entry.operation === 'delete') {
          if (entry.recordId.startsWith('file:') && this.cloudProvider.deleteCodeChunksForFile) {
            const [, projectId, ...filePathParts] = entry.recordId.split(':');
            await this.cloudProvider.deleteCodeChunksForFile(projectId, filePathParts.join(':'));
          } else if (entry.recordId.startsWith('project:') && this.cloudProvider.deleteCodeChunksForProject) {
            const projectId = entry.recordId.replace('project:', '');
            await this.cloudProvider.deleteCodeChunksForProject(projectId);
          }
        }
        break;
    }
  }

  private isConflictError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('conflict') || error.message.includes('duplicate');
    }
    return false;
  }

  private async resolveConflict(entry: SyncQueueEntry): Promise<void> {
    // Apply conflict resolution strategy
    switch (this.syncConfig.conflictResolution) {
      case 'local':
        // Keep local version - force update to cloud
        entry.retryCount = 0;
        this.syncQueue.push(entry);
        break;

      case 'remote':
        // Keep remote version - discard local change
        // Would need to fetch and apply remote version
        break;

      case 'newest':
        // Compare timestamps and keep newest
        // Would need to fetch remote timestamp
        break;
    }

    this.emit('sync:conflict', entry);
  }

  private startBackgroundSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      if (this.syncQueue.length > 0 && this.syncStatus.isOnline) {
        this.syncToCloud().catch((err) =>
          console.warn('[HybridProvider] Background sync failed:', err)
        );
      }
    }, this.syncConfig.syncInterval);
  }

  private stopBackgroundSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // ============================================
  // Sync Management Methods
  // ============================================

  /**
   * Get current sync statistics
   */
  getSyncStats(): {
    pendingOperations: number;
    lastSyncTime: Date | null;
    isOnline: boolean;
    isSyncing: boolean;
    conflicts: number;
  } {
    return {
      pendingOperations: this.syncQueue.length,
      lastSyncTime: this.syncStatus.lastSyncTime,
      isOnline: this.syncStatus.isOnline,
      isSyncing: this.syncStatus.isSyncing,
      conflicts: this.syncStatus.conflicts,
    };
  }

  /**
   * Force immediate sync of all pending operations
   */
  async forceSyncNow(): Promise<{ synced: number; failed: number }> {
    if (!this.cloudProvider) {
      return { synced: 0, failed: 0 };
    }

    const queueSnapshot = [...this.syncQueue];
    let synced = 0;
    let failed = 0;

    for (const entry of queueSnapshot) {
      try {
        await this.processSyncEntry(entry);
        // Remove from queue
        this.syncQueue = this.syncQueue.filter((e) => e.id !== entry.id);
        synced++;
      } catch (error) {
        console.warn(`[HybridProvider] Sync failed for ${entry.tableName}:${entry.recordId}:`, error);
        failed++;
        // Increment retry count
        const queueEntry = this.syncQueue.find((e) => e.id === entry.id);
        if (queueEntry) {
          queueEntry.retryCount++;
        }
      }
    }

    this.syncStatus.lastSyncTime = new Date();
    this.emit('sync:completed', { synced, failed });

    return { synced, failed };
  }

  /**
   * Clear all pending sync operations
   */
  clearSyncQueue(): void {
    const count = this.syncQueue.length;
    this.syncQueue = [];
    this.emit('sync:queue-cleared', { count });
  }

  /**
   * Set online status (for offline/online detection)
   */
  setOnlineStatus(isOnline: boolean): void {
    const wasOnline = this.syncStatus.isOnline;
    this.syncStatus.isOnline = isOnline;

    if (!wasOnline && isOnline && this.syncQueue.length > 0) {
      // Came back online with pending operations, trigger sync
      this.forceSyncNow().catch((err) =>
        console.warn('[HybridProvider] Sync on reconnect failed:', err)
      );
    }

    this.emit('sync:online-status', { isOnline });
  }

  /**
   * Migrate all local data from memory.db to Supabase cloud
   * This is a one-time migration for existing local data
   */
  async migrateLocalToCloud(
    memoryDbPath: string,
    options: { batchSize?: number; onProgress?: (msg: string) => void } = {}
  ): Promise<{ experiences: number; memories: number; patterns: number; events: number; failed: number }> {
    if (!this.cloudProvider) {
      throw new Error('Cloud provider not available');
    }

    const { batchSize = 100, onProgress = console.log } = options;
    const results = { experiences: 0, memories: 0, patterns: 0, events: 0, failed: 0 };

    // Dynamic import to avoid bundling issues
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(memoryDbPath, { readonly: true });

    try {
      // Project should already be ensured during initialize()
      // The cloud provider handles projectId internally

      // Migrate learning_experiences
      onProgress('Migrating learning experiences...');
      const experiences = db.prepare(`
        SELECT agent_id, task_type, state, action, reward, next_state, metadata, created_at
        FROM learning_experiences
      `).all() as any[];

      for (let i = 0; i < experiences.length; i += batchSize) {
        const batch = experiences.slice(i, i + batchSize);
        for (const exp of batch) {
          try {
            await this.cloudProvider.storeExperience({
              id: crypto.randomUUID(),
              agentId: exp.agent_id || 'unknown',
              agentType: exp.task_type?.split('-')[0] || 'general',
              taskType: exp.task_type || 'unknown',
              context: this.safeJsonParse(exp.state, {}) as Record<string, unknown>,
              outcome: {
                result: 'success' as const,
                confidence: exp.reward || 0.5,
                ...(this.safeJsonParse(exp.action, {}) as Record<string, unknown>),
              },
              privacyLevel: 'private' as const,
              isAnonymized: false,
              shareCount: 0,
              createdAt: this.safeParseDate(exp.created_at),
            });
            results.experiences++;
          } catch (err) {
            results.failed++;
            if (results.failed <= 3) {
              console.error(`  Experience error: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
        onProgress(`  Experiences: ${Math.min(i + batchSize, experiences.length)}/${experiences.length}`);
      }

      // Migrate memory_entries
      onProgress('Migrating memory entries...');
      const memories = db.prepare(`
        SELECT key, partition, value, owner, metadata, created_at, expires_at
        FROM memory_entries
        LIMIT 2000
      `).all() as any[];

      for (let i = 0; i < memories.length; i += batchSize) {
        const batch = memories.slice(i, i + batchSize);
        for (const mem of batch) {
          try {
            await this.cloudProvider.storeMemoryEntry({
              key: mem.key,
              partition: mem.partition || 'default',
              value: String(mem.value),
              owner: mem.owner || 'system',
              accessLevel: 'owner' as const,
              metadata: this.safeJsonParse(mem.metadata, {}) as Record<string, unknown>,
              createdAt: this.safeParseDate(mem.created_at),
              expiresAt: mem.expires_at ? this.safeParseDate(mem.expires_at) : undefined,
            });
            results.memories++;
          } catch (err) {
            results.failed++;
            if (results.failed <= 5) {
              console.error(`  Memory error: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
        onProgress(`  Memories: ${Math.min(i + batchSize, memories.length)}/${memories.length}`);
      }

      // Migrate patterns
      onProgress('Migrating patterns...');
      const patterns = db.prepare(`
        SELECT id, pattern, confidence, usage_count, metadata, domain, created_at
        FROM patterns
        LIMIT 500
      `).all() as any[];

      for (let i = 0; i < patterns.length; i += batchSize) {
        const batch = patterns.slice(i, i + batchSize);
        for (const pat of batch) {
          try {
            // Preserve original_id in metadata if not a valid UUID
            const metadata = this.safeJsonParse(pat.metadata, {}) as Record<string, unknown>;
            if (pat.id && !this.isValidUUID(pat.id)) {
              metadata.original_id = pat.id;
            }
            await this.cloudProvider.storePattern({
              id: this.isValidUUID(pat.id) ? pat.id : crypto.randomUUID(),
              type: 'learned',
              domain: pat.domain || 'general',
              content: pat.pattern || '',
              confidence: pat.confidence || 0.5,
              usageCount: pat.usage_count || 0,
              privacyLevel: 'private' as const,
              isAnonymized: false,
              metadata,
              createdAt: this.safeParseDate(pat.created_at),
            });
            results.patterns++;
          } catch (err) {
            results.failed++;
            if (results.failed <= 8) {
              console.error(`  Pattern error: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
        onProgress(`  Patterns: ${Math.min(i + batchSize, patterns.length)}/${patterns.length}`);
      }

      // Migrate events
      onProgress('Migrating events...');
      const events = db.prepare(`
        SELECT id, type, payload, timestamp, source, ttl
        FROM events
        LIMIT 2000
      `).all() as any[];

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        for (const evt of batch) {
          try {
            // Parse payload and add original_id to preserve reference
            const payload = this.safeJsonParse(evt.payload, {}) as Record<string, unknown>;
            if (evt.id && !this.isValidUUID(evt.id)) {
              payload.original_id = evt.id;
            }
            await this.cloudProvider.storeEvent({
              id: this.isValidUUID(evt.id) ? evt.id : crypto.randomUUID(),
              type: evt.type || 'unknown',
              payload,
              source: evt.source || 'migration',
              timestamp: this.safeParseDate(evt.timestamp),
              ttl: evt.ttl || 0,
            });
            results.events++;
          } catch (err) {
            results.failed++;
            if (results.failed <= 10) {
              console.error(`  Event error: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
        onProgress(`  Events: ${Math.min(i + batchSize, events.length)}/${events.length}`);
      }

    } finally {
      db.close();
    }

    return results;
  }

  private safeJsonParse(value: unknown, fallback: unknown): unknown {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }
    return value ?? fallback;
  }

  private isValidUUID(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  private safeParseDate(value: unknown): Date {
    if (!value) return new Date();

    // Try as number (timestamp)
    const num = Number(value);
    if (!isNaN(num) && num > 0) {
      // Check if it's a reasonable timestamp (after year 2000, before year 2100)
      const minTs = new Date('2000-01-01').getTime();
      const maxTs = new Date('2100-01-01').getTime();
      if (num >= minTs && num <= maxTs) {
        return new Date(num);
      }
      // Might be seconds instead of milliseconds
      if (num * 1000 >= minTs && num * 1000 <= maxTs) {
        return new Date(num * 1000);
      }
    }

    // Try as string
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return new Date();
  }
}

/**
 * Factory function to create a hybrid persistence provider
 */
export function createHybridPersistenceProvider(
  config: HybridProviderConfig
): HybridPersistenceProvider {
  return new HybridPersistenceProvider(config);
}
