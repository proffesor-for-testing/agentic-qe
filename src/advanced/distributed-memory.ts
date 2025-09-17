/**
 * Distributed Memory System for Agentic QE Framework
 * Inspired by Claude Flow's distributed memory implementation
 * Provides sharing capabilities across swarm agents with partitioning and replication
 */

import { EventEmitter } from 'events';

export interface DistributedMemoryConfig {
  namespace: string;
  distributed: boolean;
  consistency: 'eventual' | 'strong' | 'weak';
  replicationFactor: number;
  syncInterval: number;
  maxMemorySize: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  shardingEnabled: boolean;
  cacheSize: number;
  cacheTtl: number;
}

export interface MemoryPartition {
  id: string;
  name: string;
  type: 'knowledge' | 'state' | 'cache' | 'results';
  entries: MemoryEntry[];
  maxSize: number;
  ttl?: number;
  readOnly: boolean;
  shared: boolean;
  indexed: boolean;
  compressed: boolean;
}

export interface MemoryEntry {
  id: string;
  key: string;
  value: any;
  type: string;
  tags: string[];
  owner: { id: string; type: string };
  accessLevel: 'private' | 'agent' | 'swarm' | 'public';
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  version: number;
  references: string[];
  dependencies: string[];
}

export interface MemoryNode {
  id: string;
  address: string;
  port: number;
  status: 'online' | 'offline' | 'syncing' | 'failed';
  lastSeen: Date;
  partitions: string[];
  load: number;
  capacity: number;
}

export interface MemoryQuery {
  namespace?: string;
  partition?: string;
  type?: string;
  tags?: string[];
  owner?: string;
  accessLevel?: 'private' | 'agent' | 'swarm' | 'public';
  createdAfter?: Date;
  updatedAfter?: Date;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface MemoryStatistics {
  totalEntries: number;
  totalSize: number;
  partitionCount: number;
  nodeCount: number;
  replicationHealth: number;
  syncOperations: {
    pending: number;
    completed: number;
    failed: number;
  };
  performance: {
    readLatency: number;
    writeLatency: number;
    syncLatency: number;
    throughput: number;
  };
  utilization: {
    memoryUsage: number;
    diskUsage: number;
    networkUsage: number;
  };
}

interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'batch';
  partition: string;
  entry?: MemoryEntry;
  entries?: MemoryEntry[];
  timestamp: Date;
  version: number;
  origin: string;
  targets: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Distributed memory system for sharing data across QE swarm agents
 */
export class DistributedMemorySystem extends EventEmitter {
  private config: DistributedMemoryConfig;
  private partitions = new Map<string, MemoryPartition>();
  private entries = new Map<string, MemoryEntry>();
  private cache = new Map<string, { entry: MemoryEntry; expiry: number }>();

  // Distribution
  private nodes = new Map<string, MemoryNode>();
  private localNodeId: string;
  private syncQueue: SyncOperation[] = [];
  private replicationMap = new Map<string, string[]>();

  // Synchronization
  private syncTimer: NodeJS.Timeout | null = null;
  private vectorClock = new Map<string, number>();
  private conflictResolver?: (local: MemoryEntry, remote: MemoryEntry) => MemoryEntry;

  // Performance tracking
  private statistics: MemoryStatistics;
  private operationMetrics = new Map<string, { count: number; totalTime: number }>();

  constructor(config?: Partial<DistributedMemoryConfig>) {
    super();

    this.config = {
      namespace: 'default',
      distributed: true,
      consistency: 'eventual',
      replicationFactor: 3,
      syncInterval: 5000,
      maxMemorySize: 1024 * 1024 * 1024, // 1GB
      compressionEnabled: true,
      encryptionEnabled: false,
      shardingEnabled: true,
      cacheSize: 10000,
      cacheTtl: 300000, // 5 minutes
      ...config
    };

    this.localNodeId = this.generateId('memory-node');
    this.statistics = this.initializeStatistics();
  }

  async initialize(): Promise<void> {
    console.log('Initializing distributed memory system', {
      nodeId: this.localNodeId,
      namespace: this.config.namespace,
      distributed: this.config.distributed
    });

    // Register local node
    const localNode: MemoryNode = {
      id: this.localNodeId,
      address: 'localhost',
      port: 8080,
      status: 'online',
      lastSeen: new Date(),
      partitions: [],
      load: 0,
      capacity: this.config.maxMemorySize
    };

    this.nodes.set(this.localNodeId, localNode);

    // Initialize default partitions
    await this.createPartition('knowledge', 'knowledge');
    await this.createPartition('state', 'state');
    await this.createPartition('cache', 'cache');
    await this.createPartition('results', 'results');

    // Start synchronization if distributed
    if (this.config.distributed) {
      this.startSynchronization();
    }

    this.emit('initialized', { nodeId: this.localNodeId });
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down distributed memory system');

    // Stop synchronization
    if (this.syncTimer) {
      clearInterval(this.syncTimer as NodeJS.Timeout);
    }

    // Complete pending sync operations
    await this.completePendingSyncOperations();

    // Clear caches
    this.cache.clear();
    this.partitions.clear();
    this.entries.clear();

    this.emit('shutdown', { nodeId: this.localNodeId });
  }

  // === PARTITION MANAGEMENT ===

  async createPartition(
    name: string,
    type: 'knowledge' | 'state' | 'cache' | 'results',
    options: {
      maxSize?: number;
      ttl?: number;
      readOnly?: boolean;
      shared?: boolean;
      indexed?: boolean;
      compressed?: boolean;
    } = {}
  ): Promise<string> {
    const partitionId = this.generateId('partition');

    const partition: MemoryPartition = {
      id: partitionId,
      name,
      type,
      entries: [],
      maxSize: options.maxSize || this.config.maxMemorySize / 10,
      ttl: options.ttl,
      readOnly: options.readOnly || false,
      shared: options.shared !== false,
      indexed: options.indexed || false,
      compressed: options.compressed || this.config.compressionEnabled
    };

    this.partitions.set(partitionId, partition);

    // Update local node partition list
    const localNode = this.nodes.get(this.localNodeId)!;
    localNode.partitions.push(partitionId);

    console.log('Created partition', { partitionId, name, type });
    this.emit('partition:created', { partition });

    return partitionId;
  }

  // === ENTRY OPERATIONS ===

  async store(
    key: string,
    value: any,
    options: {
      type?: string;
      tags?: string[];
      owner?: { id: string; type: string };
      accessLevel?: 'private' | 'agent' | 'swarm' | 'public';
      partition?: string;
      ttl?: number;
      replicate?: boolean;
    } = {}
  ): Promise<string> {
    const startTime = Date.now();

    try {
      const entryId = this.generateId('entry');
      const now = new Date();

      // Determine partition
      const partitionId = options.partition || this.selectPartition(options.type || 'knowledge');
      const partition = this.partitions.get(partitionId);

      if (!partition) {
        throw new Error(`Partition ${partitionId} not found`);
      }

      if (partition.readOnly) {
        throw new Error('Cannot write to read-only partition');
      }

      // Check partition capacity
      if (this.getPartitionSize(partitionId) >= partition.maxSize) {
        await this.evictOldEntries(partitionId);
      }

      // Create entry
      const entry: MemoryEntry = {
        id: entryId,
        key,
        value: await this.processValue(value, partition),
        type: options.type || 'data',
        tags: options.tags || [],
        owner: options.owner || { id: 'system', type: 'coordinator' },
        accessLevel: options.accessLevel || 'swarm',
        createdAt: now,
        updatedAt: now,
        expiresAt: options.ttl ? new Date(now.getTime() + options.ttl) : undefined,
        version: 1,
        references: [],
        dependencies: []
      };

      // Store entry
      this.entries.set(entryId, entry);
      partition.entries.push(entry);

      // Update cache
      this.updateCache(entryId, entry);

      // Update vector clock
      this.incrementVectorClock(this.localNodeId);

      console.log('Stored entry', { entryId, key, partition: partitionId });
      this.emit('entry:stored', { entry });

      // Replicate if distributed and requested
      if (this.config.distributed && options.replicate !== false) {
        await this.replicateEntry(entry);
      }

      this.recordMetric('store', Date.now() - startTime);
      return entryId;
    } catch (error) {
      this.recordMetric('store-error', Date.now() - startTime);
      throw error;
    }
  }

  async retrieve(
    key: string,
    options: {
      partition?: string;
      consistency?: 'eventual' | 'strong' | 'weak';
      maxAge?: number;
    } = {}
  ): Promise<MemoryEntry | null> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cached = this.getCachedEntry(key);
      if (cached && this.isCacheValid(cached)) {
        this.recordMetric('retrieve-cache', Date.now() - startTime);
        return cached.entry;
      }

      // Search in specified partition or all partitions
      const partitions = options.partition
        ? [this.partitions.get(options.partition)].filter(Boolean)
        : Array.from(this.partitions.values());

      for (const partition of partitions) {
        const entry = partition!.entries.find(e => e.key === key);
        if (entry) {
          // Check if entry is expired
          if (entry.expiresAt && entry.expiresAt < new Date()) {
            await this.deleteEntry(entry.id);
            continue;
          }

          // Apply consistency model
          if (this.config.distributed && options.consistency === 'strong') {
            const latestEntry = await this.ensureConsistency(entry);
            this.updateCache(latestEntry.id, latestEntry);
            this.recordMetric('retrieve', Date.now() - startTime);
            return latestEntry;
          }

          this.updateCache(entry.id, entry);
          this.recordMetric('retrieve', Date.now() - startTime);
          return entry;
        }
      }

      this.recordMetric('retrieve-miss', Date.now() - startTime);
      return null;
    } catch (error) {
      this.recordMetric('retrieve-error', Date.now() - startTime);
      throw error;
    }
  }

  async update(
    key: string,
    value: any,
    options: {
      partition?: string;
      merge?: boolean;
      version?: number;
    } = {}
  ): Promise<boolean> {
    const startTime = Date.now();

    try {
      const entry = await this.retrieve(key, { partition: options.partition });
      if (!entry) {
        this.recordMetric('update-not-found', Date.now() - startTime);
        return false;
      }

      // Version check for optimistic locking
      if (options.version && entry.version !== options.version) {
        throw new Error('Version conflict: entry has been modified');
      }

      // Update entry
      const partition = this.partitions.get(this.getEntryPartition(entry.id))!;

      entry.value = options.merge
        ? await this.mergeValues(entry.value, value, partition)
        : await this.processValue(value, partition);

      entry.updatedAt = new Date();
      entry.version++;

      // Update cache
      this.updateCache(entry.id, entry);

      // Update vector clock
      this.incrementVectorClock(this.localNodeId);

      console.log('Updated entry', { entryId: entry.id, key });
      this.emit('entry:updated', { entry });

      // Sync with other nodes if distributed
      if (this.config.distributed) {
        await this.syncEntryUpdate(entry);
      }

      this.recordMetric('update', Date.now() - startTime);
      return true;
    } catch (error) {
      this.recordMetric('update-error', Date.now() - startTime);
      throw error;
    }
  }

  async deleteEntry(entryId: string): Promise<boolean> {
    const entry = this.entries.get(entryId);
    if (!entry) {
      return false;
    }

    // Remove from partition
    const partitionId = this.getEntryPartition(entryId);
    const partition = this.partitions.get(partitionId);
    if (partition) {
      partition.entries = partition.entries.filter(e => e.id !== entryId);
    }

    // Remove from storage
    this.entries.delete(entryId);

    // Remove from cache
    this.removeFromCache(entry.key);

    this.emit('entry:deleted', { entryId });
    return true;
  }

  // === QUERY OPERATIONS ===

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    const startTime = Date.now();

    try {
      let results: MemoryEntry[] = [];

      // Get relevant partitions
      const partitions = query.partition
        ? [this.partitions.get(query.partition)].filter(Boolean)
        : Array.from(this.partitions.values());

      for (const partition of partitions) {
        for (const entry of partition!.entries) {
          if (this.matchesQuery(entry, query)) {
            results.push(entry);
          }
        }
      }

      // Apply sorting
      if (query.sortBy) {
        results.sort((a, b) => {
          const aVal = this.getNestedProperty(a, query.sortBy!);
          const bVal = this.getNestedProperty(b, query.sortBy!);
          const order = query.sortOrder === 'desc' ? -1 : 1;

          if (aVal < bVal) return -1 * order;
          if (aVal > bVal) return 1 * order;
          return 0;
        });
      }

      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || results.length;
      results = results.slice(offset, offset + limit);

      this.recordMetric('query', Date.now() - startTime);
      return results;
    } catch (error) {
      this.recordMetric('query-error', Date.now() - startTime);
      throw error;
    }
  }

  // === SYNCHRONIZATION ===

  private startSynchronization(): void {
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.config.syncInterval);

    console.log('Started synchronization', {
      interval: this.config.syncInterval,
      consistency: this.config.consistency
    });
  }

  private async performSync(): Promise<void> {
    try {
      // Process pending sync operations
      await this.processSyncQueue();

      // Send heartbeat to other nodes
      await this.sendHeartbeat();

      // Update statistics
      this.updateStatistics();
    } catch (error) {
      console.error('Sync error', error);
    }
  }

  private async processSyncQueue(): Promise<void> {
    const pendingOps = this.syncQueue.filter(op => op.status === 'pending');

    for (const operation of pendingOps) {
      try {
        operation.status = 'in_progress';
        await this.executeSyncOperation(operation);
        operation.status = 'completed';
        this.statistics.syncOperations.completed++;
      } catch (error) {
        operation.status = 'failed';
        this.statistics.syncOperations.failed++;
        console.error('Sync operation failed', { operation, error });
      }
    }

    // Remove completed/failed operations older than 1 hour
    const cutoff = new Date(Date.now() - 3600000);
    this.syncQueue = this.syncQueue.filter(
      op => op.status === 'pending' || op.timestamp > cutoff
    );
  }

  // === UTILITY METHODS ===

  private async processValue(value: any, partition: MemoryPartition): Promise<any> {
    if (partition.compressed && this.config.compressionEnabled) {
      return this.compressValue(value);
    }
    return value;
  }

  private async mergeValues(
    oldValue: any,
    newValue: any,
    partition: MemoryPartition
  ): Promise<any> {
    if (typeof oldValue === 'object' && typeof newValue === 'object') {
      return { ...oldValue, ...newValue };
    }
    return newValue;
  }

  private compressValue(value: any): any {
    // Simple JSON stringification for now
    return JSON.stringify(value);
  }

  private selectPartition(type: string): string {
    for (const [id, partition] of this.partitions) {
      if (partition.type === type as any) {
        return id;
      }
    }
    return Array.from(this.partitions.keys())[0] || '';
  }

  private getPartitionSize(partitionId: string): number {
    const partition = this.partitions.get(partitionId);
    if (!partition) return 0;

    return partition.entries.reduce((size, entry) => {
      return size + JSON.stringify(entry).length;
    }, 0);
  }

  private getEntryPartition(entryId: string): string {
    for (const [partitionId, partition] of this.partitions) {
      if (partition.entries.some(e => e.id === entryId)) {
        return partitionId;
      }
    }
    return '';
  }

  private updateCache(entryId: string, entry: MemoryEntry): void {
    if (this.cache.size >= this.config.cacheSize) {
      this.evictCache();
    }

    this.cache.set(entry.key, {
      entry: { ...entry },
      expiry: Date.now() + this.config.cacheTtl
    });
  }

  private getCachedEntry(key: string): { entry: MemoryEntry; expiry: number } | null {
    return this.cache.get(key) || null;
  }

  private isCacheValid(cached: { entry: MemoryEntry; expiry: number }): boolean {
    return cached.expiry > Date.now();
  }

  private removeFromCache(key: string): void {
    this.cache.delete(key);
  }

  private evictCache(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].expiry - b[1].expiry);

    const toRemove = entries.slice(0, Math.floor(this.config.cacheSize * 0.1));
    toRemove.forEach(([key]) => this.cache.delete(key));
  }

  private async evictOldEntries(partitionId: string): Promise<void> {
    const partition = this.partitions.get(partitionId);
    if (!partition) return;

    const entries = partition.entries.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
    const toRemove = entries.slice(0, Math.floor(entries.length * 0.1));

    for (const entry of toRemove) {
      await this.deleteEntry(entry.id);
    }
  }

  private matchesQuery(entry: MemoryEntry, query: MemoryQuery): boolean {
    if (query.type && entry.type !== query.type) return false;
    if (query.owner && entry.owner.id !== query.owner) return false;
    if (query.accessLevel && entry.accessLevel !== query.accessLevel) return false;
    if (query.createdAfter && entry.createdAt < query.createdAfter) return false;
    if (query.updatedAfter && entry.updatedAt < query.updatedAfter) return false;

    if (query.tags && query.tags.length > 0) {
      const hasAllTags = query.tags.every(tag => entry.tags.includes(tag));
      if (!hasAllTags) return false;
    }

    return true;
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private incrementVectorClock(nodeId: string): void {
    const current = this.vectorClock.get(nodeId) || 0;
    this.vectorClock.set(nodeId, current + 1);
  }

  private recordMetric(operation: string, duration: number): void {
    const current = this.operationMetrics.get(operation) || { count: 0, totalTime: 0 };
    current.count++;
    current.totalTime += duration;
    this.operationMetrics.set(operation, current);
  }

  private initializeStatistics(): MemoryStatistics {
    return {
      totalEntries: 0,
      totalSize: 0,
      partitionCount: 0,
      nodeCount: 1,
      replicationHealth: 1.0,
      syncOperations: {
        pending: 0,
        completed: 0,
        failed: 0
      },
      performance: {
        readLatency: 0,
        writeLatency: 0,
        syncLatency: 0,
        throughput: 0
      },
      utilization: {
        memoryUsage: 0,
        diskUsage: 0,
        networkUsage: 0
      }
    };
  }

  private updateStatistics(): void {
    this.statistics.totalEntries = this.entries.size;
    this.statistics.partitionCount = this.partitions.size;
    this.statistics.nodeCount = this.nodes.size;

    // Calculate performance metrics
    const readMetrics = this.operationMetrics.get('retrieve') || { count: 0, totalTime: 0 };
    const writeMetrics = this.operationMetrics.get('store') || { count: 0, totalTime: 0 };

    this.statistics.performance.readLatency =
      readMetrics.count > 0 ? readMetrics.totalTime / readMetrics.count : 0;
    this.statistics.performance.writeLatency =
      writeMetrics.count > 0 ? writeMetrics.totalTime / writeMetrics.count : 0;
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // === DISTRIBUTED OPERATIONS (Stubs for now) ===

  private async replicateEntry(entry: MemoryEntry): Promise<void> {
    // Implementation would replicate to other nodes
    this.syncQueue.push({
      id: this.generateId('sync'),
      type: 'create',
      partition: this.getEntryPartition(entry.id),
      entry,
      timestamp: new Date(),
      version: 1,
      origin: this.localNodeId,
      targets: Array.from(this.nodes.keys()).filter(id => id !== this.localNodeId),
      status: 'pending'
    });
  }

  private async syncEntryUpdate(entry: MemoryEntry): Promise<void> {
    this.syncQueue.push({
      id: this.generateId('sync'),
      type: 'update',
      partition: this.getEntryPartition(entry.id),
      entry,
      timestamp: new Date(),
      version: entry.version,
      origin: this.localNodeId,
      targets: Array.from(this.nodes.keys()).filter(id => id !== this.localNodeId),
      status: 'pending'
    });
  }

  private async ensureConsistency(entry: MemoryEntry): Promise<MemoryEntry> {
    // Would implement strong consistency check across nodes
    return entry;
  }

  private async sendHeartbeat(): Promise<void> {
    // Would send heartbeat to other nodes
  }

  private async executeSyncOperation(operation: SyncOperation): Promise<void> {
    // Would execute sync with remote nodes
  }

  private async completePendingSyncOperations(): Promise<void> {
    // Would complete all pending operations
  }

  // === PUBLIC API ===

  getStatistics(): MemoryStatistics {
    this.updateStatistics();
    return { ...this.statistics };
  }

  getPartitions(): MemoryPartition[] {
    return Array.from(this.partitions.values());
  }

  getNodes(): MemoryNode[] {
    return Array.from(this.nodes.values());
  }

  async backup(): Promise<string> {
    const backup = {
      timestamp: new Date(),
      partitions: Array.from(this.partitions.values()),
      entries: Array.from(this.entries.values()),
      metadata: {
        version: '1.0',
        nodeId: this.localNodeId,
        config: this.config
      }
    };

    return JSON.stringify(backup);
  }

  async restore(backupData: string): Promise<void> {
    const backup = JSON.parse(backupData);

    // Clear current data
    this.partitions.clear();
    this.entries.clear();
    this.cache.clear();

    // Restore partitions
    for (const partition of backup.partitions) {
      this.partitions.set(partition.id, partition);
    }

    // Restore entries
    for (const entry of backup.entries) {
      this.entries.set(entry.id, entry);
    }

    console.log('Restored from backup', {
      partitions: backup.partitions.length,
      entries: backup.entries.length
    });
  }

  async clear(): Promise<void> {
    this.partitions.clear();
    this.entries.clear();
    this.cache.clear();
    this.syncQueue = [];
    this.statistics = this.initializeStatistics();

    console.log('Cleared all memory data');
    this.emit('memory:cleared');
  }
}

export default DistributedMemorySystem;