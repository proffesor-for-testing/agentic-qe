/**
 * QE Memory Management System
 * Handles persistent and session-based memory for test execution and agent coordination
 */

import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { QEMemoryEntry, MemoryType } from '../types';
import { Logger } from '../utils/Logger';

/**
 * Memory configuration options
 */
export interface QEMemoryConfig {
  persistPath?: string;
  maxEntries?: number;
  defaultTTL?: number;
  autoCleanup?: boolean;
  cleanupInterval?: number;
  compression?: boolean;
  encryption?: {
    enabled: boolean;
    key?: string;
  };
}

/**
 * Memory query options for filtering and searching
 */
export interface MemoryQueryOptions {
  sessionId?: string;
  agentId?: string;
  type?: MemoryType;
  tags?: string[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'key' | 'type';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Memory statistics and metrics
 */
export interface MemoryStats {
  totalEntries: number;
  entriesByType: Record<MemoryType, number>;
  entriesBySession: Record<string, number>;
  entriesByAgent: Record<string, number>;
  memoryUsage: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  expiredEntries: number;
}

/**
 * QE Memory Management System
 * Provides sophisticated memory operations for test sessions and agent coordination
 */
export class QEMemory extends EventEmitter {
  private readonly config: Required<QEMemoryConfig>;
  private readonly logger: Logger;
  private readonly memory: Map<string, QEMemoryEntry> = new Map();
  private readonly indices: {
    bySession: Map<string, Set<string>>;
    byAgent: Map<string, Set<string>>;
    byType: Map<MemoryType, Set<string>>;
    byTags: Map<string, Set<string>>;
  };
  private cleanupInterval?: NodeJS.Timeout;
  private persistTimer?: NodeJS.Timeout;
  private stats: MemoryStats;

  constructor(config: QEMemoryConfig = {}, logger?: Logger) {
    super();
    
    this.config = {
      persistPath: config.persistPath || path.join(process.cwd(), '.qe-memory'),
      maxEntries: config.maxEntries || 10000,
      defaultTTL: config.defaultTTL || 3600000, // 1 hour
      autoCleanup: config.autoCleanup ?? true,
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      compression: config.compression ?? false,
      encryption: {
        enabled: config.encryption?.enabled ?? false,
        key: config.encryption?.key
      }
    };
    
    this.logger = logger || new Logger('QEMemory');
    
    this.indices = {
      bySession: new Map(),
      byAgent: new Map(),
      byType: new Map(),
      byTags: new Map()
    };
    
    this.stats = this.initializeStats();
    
    this.initialize();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Store a memory entry
   */
  public async store(entry: QEMemoryEntry): Promise<void> {
    try {
      // Validate entry
      this.validateEntry(entry);
      
      // Check memory limits
      if (this.memory.size >= this.config.maxEntries) {
        await this.evictOldestEntries(Math.floor(this.config.maxEntries * 0.1));
      }
      
      // Store the entry
      this.memory.set(entry.key, { ...entry });
      
      // Update indices
      this.updateIndices(entry, 'add');
      
      // Update statistics
      this.updateStats(entry, 'add');
      
      this.logger.debug(`Stored memory entry: ${entry.key}`, {
        type: entry.type,
        sessionId: entry.sessionId,
        agentId: entry.agentId,
        size: JSON.stringify(entry.value).length
      });
      
      this.emit('entry-stored', entry);
      
      // Schedule persistence if configured
      this.schedulePersistence();
      
    } catch (error) {
      this.logger.error(`Failed to store memory entry: ${entry.key}`, { error });
      throw error;
    }
  }

  /**
   * Retrieve a memory entry by key
   */
  public async get(key: string): Promise<QEMemoryEntry | null> {
    const entry = this.memory.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if entry has expired
    if (this.isExpired(entry)) {
      await this.delete(key);
      return null;
    }
    
    this.logger.debug(`Retrieved memory entry: ${key}`, {
      type: entry.type,
      sessionId: entry.sessionId,
      agentId: entry.agentId
    });
    
    this.emit('entry-accessed', entry);
    
    return { ...entry }; // Return a copy
  }

  /**
   * Query memory entries with filtering options
   */
  public async query(options: MemoryQueryOptions = {}): Promise<QEMemoryEntry[]> {
    let keys = new Set<string>();
    
    // Build initial key set based on indices
    if (options.sessionId) {
      const sessionKeys = this.indices.bySession.get(options.sessionId);
      if (sessionKeys) {
        keys = new Set(sessionKeys);
      } else {
        return [];
      }
    }
    
    if (options.agentId) {
      const agentKeys = this.indices.byAgent.get(options.agentId);
      if (agentKeys) {
        keys = keys.size > 0 ? this.intersect(keys, agentKeys) : new Set(agentKeys);
      } else {
        return [];
      }
    }
    
    if (options.type) {
      const typeKeys = this.indices.byType.get(options.type);
      if (typeKeys) {
        keys = keys.size > 0 ? this.intersect(keys, typeKeys) : new Set(typeKeys);
      } else {
        return [];
      }
    }
    
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        const tagKeys = this.indices.byTags.get(tag);
        if (tagKeys) {
          keys = keys.size > 0 ? this.intersect(keys, tagKeys) : new Set(tagKeys);
        } else {
          return [];
        }
      }
    }
    
    // If no filters applied, get all keys
    if (keys.size === 0) {
      keys = new Set(this.memory.keys());
    }
    
    // Filter by time range
    let entries = Array.from(keys)
      .map(key => this.memory.get(key)!)
      .filter(entry => !this.isExpired(entry));
    
    if (options.startTime || options.endTime) {
      entries = entries.filter(entry => {
        const timestamp = entry.timestamp;
        if (options.startTime && timestamp < options.startTime) return false;
        if (options.endTime && timestamp > options.endTime) return false;
        return true;
      });
    }
    
    // Sort entries
    if (options.sortBy) {
      entries.sort((a, b) => {
        let aVal: any, bVal: any;
        
        switch (options.sortBy) {
          case 'timestamp':
            aVal = a.timestamp.getTime();
            bVal = b.timestamp.getTime();
            break;
          case 'key':
            aVal = a.key;
            bVal = b.key;
            break;
          case 'type':
            aVal = a.type;
            bVal = b.type;
            break;
          default:
            return 0;
        }
        
        const order = options.sortOrder === 'desc' ? -1 : 1;
        return aVal < bVal ? -order : aVal > bVal ? order : 0;
      });
    }
    
    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit;
    
    if (limit) {
      entries = entries.slice(offset, offset + limit);
    } else if (offset > 0) {
      entries = entries.slice(offset);
    }
    
    this.logger.debug(`Queried memory entries`, {
      totalFound: entries.length,
      options
    });
    
    return entries.map(entry => ({ ...entry })); // Return copies
  }

  /**
   * Update an existing memory entry
   */
  public async update(
    key: string,
    updates: Partial<Omit<QEMemoryEntry, 'key'>>
  ): Promise<boolean> {
    const existing = this.memory.get(key);
    
    if (!existing || this.isExpired(existing)) {
      return false;
    }
    
    // Update indices if necessary
    if (updates.sessionId || updates.agentId || updates.type || updates.tags) {
      this.updateIndices(existing, 'remove');
    }
    
    // Apply updates
    const updated: QEMemoryEntry = {
      ...existing,
      ...updates,
      key, // Ensure key doesn't change
      timestamp: new Date() // Update timestamp
    };
    
    this.memory.set(key, updated);
    
    // Update indices with new values
    if (updates.sessionId || updates.agentId || updates.type || updates.tags) {
      this.updateIndices(updated, 'add');
    }
    
    this.logger.debug(`Updated memory entry: ${key}`, { updates });
    this.emit('entry-updated', updated);
    
    this.schedulePersistence();
    return true;
  }

  /**
   * Delete a memory entry
   */
  public async delete(key: string): Promise<boolean> {
    const entry = this.memory.get(key);
    
    if (!entry) {
      return false;
    }
    
    this.memory.delete(key);
    this.updateIndices(entry, 'remove');
    this.updateStats(entry, 'remove');
    
    this.logger.debug(`Deleted memory entry: ${key}`);
    this.emit('entry-deleted', entry);
    
    this.schedulePersistence();
    return true;
  }

  /**
   * Clear memory entries with optional filtering
   */
  public async clear(options: MemoryQueryOptions = {}): Promise<number> {
    const entries = await this.query(options);
    
    let deleted = 0;
    for (const entry of entries) {
      if (await this.delete(entry.key)) {
        deleted++;
      }
    }
    
    this.logger.info(`Cleared ${deleted} memory entries`, { options });
    this.emit('memory-cleared', { deleted, options });
    
    return deleted;
  }

  /**
   * Get memory statistics
   */
  public getStats(): MemoryStats {
    return { ...this.stats };
  }

  /**
   * Clean up expired entries
   */
  public async cleanup(): Promise<number> {
    const startTime = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.memory.entries()) {
      if (this.isExpired(entry)) {
        await this.delete(key);
        cleaned++;
      }
    }
    
    const duration = Date.now() - startTime;
    this.logger.info(`Cleanup completed: ${cleaned} entries removed in ${duration}ms`);
    this.emit('cleanup-completed', { cleaned, duration });
    
    return cleaned;
  }

  /**
   * Persist memory to disk
   */
  public async persist(): Promise<void> {
    if (!this.config.persistPath) {
      return;
    }
    
    try {
      const startTime = Date.now();
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.config.persistPath));
      
      // Prepare data for persistence
      const data = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        entries: Array.from(this.memory.entries()),
        stats: this.stats
      };
      
      // Write to temporary file first
      const tempPath = `${this.config.persistPath}.tmp`;
      await fs.writeJSON(tempPath, data, { spaces: this.config.compression ? 0 : 2 });
      
      // Atomic move
      await fs.move(tempPath, this.config.persistPath, { overwrite: true });
      
      const duration = Date.now() - startTime;
      this.logger.debug(`Memory persisted to disk in ${duration}ms`, {
        path: this.config.persistPath,
        entries: this.memory.size
      });
      
      this.emit('memory-persisted', { duration, entries: this.memory.size });
      
    } catch (error) {
      this.logger.error('Failed to persist memory to disk', { error });
      throw error;
    }
  }

  /**
   * Load memory from disk
   */
  public async load(): Promise<void> {
    if (!this.config.persistPath || !await fs.pathExists(this.config.persistPath)) {
      return;
    }
    
    try {
      const startTime = Date.now();
      
      const data = await fs.readJSON(this.config.persistPath);
      
      // Clear current memory
      this.memory.clear();
      this.clearIndices();
      
      // Load entries
      for (const [key, entry] of data.entries || []) {
        // Convert timestamp back to Date object
        entry.timestamp = new Date(entry.timestamp);
        
        // Skip expired entries
        if (this.isExpired(entry)) {
          continue;
        }
        
        this.memory.set(key, entry);
        this.updateIndices(entry, 'add');
      }
      
      // Rebuild stats
      this.rebuildStats();
      
      const duration = Date.now() - startTime;
      this.logger.info(`Memory loaded from disk in ${duration}ms`, {
        path: this.config.persistPath,
        entries: this.memory.size
      });
      
      this.emit('memory-loaded', { duration, entries: this.memory.size });
      
    } catch (error) {
      this.logger.error('Failed to load memory from disk', { error });
      throw error;
    }
  }

  /**
   * Export memory data
   */
  public async export(format: 'json' | 'csv' = 'json'): Promise<string> {
    const entries = Array.from(this.memory.values());
    
    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['key', 'type', 'sessionId', 'agentId', 'timestamp', 'tags', 'value'];
      const rows = entries.map(entry => [
        entry.key,
        entry.type,
        entry.sessionId,
        entry.agentId || '',
        entry.timestamp.toISOString(),
        entry.tags.join(';'),
        JSON.stringify(entry.value)
      ]);
      
      return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }
    
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Import memory data
   */
  public async import(data: string, format: 'json' | 'csv' = 'json'): Promise<number> {
    let entries: QEMemoryEntry[];
    
    if (format === 'csv') {
      // Parse CSV format
      const lines = data.split('\n');
      // Skip header row

      entries = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.replace(/"/g, ''));
        return {
          key: values[0],
          type: values[1] as MemoryType,
          sessionId: values[2],
          agentId: values[3] || undefined,
          timestamp: new Date(values[4]),
          tags: values[5] ? values[5].split(';') : [],
          value: JSON.parse(values[6])
        };
      }).filter(entry => entry.key); // Filter out empty lines
    } else {
      entries = JSON.parse(data);
    }
    
    let imported = 0;
    for (const entry of entries) {
      try {
        await this.store(entry);
        imported++;
      } catch (error) {
        this.logger.warn(`Failed to import entry: ${entry.key}`, { error });
      }
    }
    
    this.logger.info(`Imported ${imported} memory entries`);
    return imported;
  }

  /**
   * Destroy memory manager and cleanup resources
   */
  public async destroy(): Promise<void> {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clear persistence timer
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    
    // Persist final state
    if (this.config.persistPath) {
      await this.persist();
    }
    
    // Clear memory
    this.memory.clear();
    this.clearIndices();
    
    // Remove listeners
    this.removeAllListeners();
    
    this.logger.info('QE Memory destroyed');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async initialize(): Promise<void> {
    // Load persisted memory
    if (this.config.persistPath) {
      await this.load();
    }
    
    // Setup automatic cleanup
    if (this.config.autoCleanup) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup().catch(error => {
          this.logger.error('Auto-cleanup failed', { error });
        });
      }, this.config.cleanupInterval);
    }
    
    this.logger.info('QE Memory initialized', {
      config: this.config,
      entries: this.memory.size
    });
  }

  private validateEntry(entry: QEMemoryEntry): void {
    if (!entry.key || typeof entry.key !== 'string') {
      throw new Error('Memory entry must have a valid key');
    }
    
    if (!entry.sessionId || typeof entry.sessionId !== 'string') {
      throw new Error('Memory entry must have a valid sessionId');
    }
    
    if (!entry.type || typeof entry.type !== 'string') {
      throw new Error('Memory entry must have a valid type');
    }
    
    if (!Array.isArray(entry.tags)) {
      throw new Error('Memory entry tags must be an array');
    }
  }

  private updateIndices(entry: QEMemoryEntry, operation: 'add' | 'remove'): void {
    const { key, sessionId, agentId, type, tags } = entry;
    
    if (operation === 'add') {
      // Session index
      if (!this.indices.bySession.has(sessionId)) {
        this.indices.bySession.set(sessionId, new Set());
      }
      this.indices.bySession.get(sessionId)!.add(key);
      
      // Agent index
      if (agentId) {
        if (!this.indices.byAgent.has(agentId)) {
          this.indices.byAgent.set(agentId, new Set());
        }
        this.indices.byAgent.get(agentId)!.add(key);
      }
      
      // Type index
      if (!this.indices.byType.has(type)) {
        this.indices.byType.set(type, new Set());
      }
      this.indices.byType.get(type)!.add(key);
      
      // Tags index
      for (const tag of tags) {
        if (!this.indices.byTags.has(tag)) {
          this.indices.byTags.set(tag, new Set());
        }
        this.indices.byTags.get(tag)!.add(key);
      }
    } else {
      // Remove from indices
      this.indices.bySession.get(sessionId)?.delete(key);
      if (agentId) {
        this.indices.byAgent.get(agentId)?.delete(key);
      }
      this.indices.byType.get(type)?.delete(key);
      for (const tag of tags) {
        this.indices.byTags.get(tag)?.delete(key);
      }
    }
  }

  private clearIndices(): void {
    this.indices.bySession.clear();
    this.indices.byAgent.clear();
    this.indices.byType.clear();
    this.indices.byTags.clear();
  }

  private updateStats(entry: QEMemoryEntry, operation: 'add' | 'remove'): void {
    if (operation === 'add') {
      this.stats.totalEntries++;
      this.stats.entriesByType[entry.type] = (this.stats.entriesByType[entry.type] || 0) + 1;
      this.stats.entriesBySession[entry.sessionId] = (this.stats.entriesBySession[entry.sessionId] || 0) + 1;
      if (entry.agentId) {
        this.stats.entriesByAgent[entry.agentId] = (this.stats.entriesByAgent[entry.agentId] || 0) + 1;
      }
      
      if (!this.stats.oldestEntry || entry.timestamp < this.stats.oldestEntry) {
        this.stats.oldestEntry = entry.timestamp;
      }
      if (!this.stats.newestEntry || entry.timestamp > this.stats.newestEntry) {
        this.stats.newestEntry = entry.timestamp;
      }
    } else {
      this.stats.totalEntries = Math.max(0, this.stats.totalEntries - 1);
      this.stats.entriesByType[entry.type] = Math.max(0, (this.stats.entriesByType[entry.type] || 0) - 1);
      this.stats.entriesBySession[entry.sessionId] = Math.max(0, (this.stats.entriesBySession[entry.sessionId] || 0) - 1);
      if (entry.agentId) {
        this.stats.entriesByAgent[entry.agentId] = Math.max(0, (this.stats.entriesByAgent[entry.agentId] || 0) - 1);
      }
    }
    
    this.stats.memoryUsage = this.calculateMemoryUsage();
  }

  private rebuildStats(): void {
    this.stats = this.initializeStats();
    
    for (const entry of this.memory.values()) {
      this.updateStats(entry, 'add');
    }
  }

  private initializeStats(): MemoryStats {
    return {
      totalEntries: 0,
      entriesByType: {} as Record<MemoryType, number>,
      entriesBySession: {},
      entriesByAgent: {},
      memoryUsage: 0,
      expiredEntries: 0
    };
  }

  private calculateMemoryUsage(): number {
    let size = 0;
    for (const entry of this.memory.values()) {
      size += JSON.stringify(entry).length;
    }
    return size;
  }

  private isExpired(entry: QEMemoryEntry): boolean {
    if (!entry.ttl) {
      return false;
    }
    
    const age = Date.now() - entry.timestamp.getTime();
    return age > entry.ttl;
  }

  private async evictOldestEntries(count: number): Promise<void> {
    const entries = Array.from(this.memory.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(0, count);
    
    for (const entry of entries) {
      await this.delete(entry.key);
    }
    
    this.logger.debug(`Evicted ${count} oldest entries`);
  }

  private intersect<T>(setA: Set<T>, setB: Set<T>): Set<T> {
    return new Set([...setA].filter(x => setB.has(x)));
  }

  private schedulePersistence(): void {
    if (!this.config.persistPath || this.persistTimer) {
      return;
    }
    
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      this.persist().catch(error => {
        this.logger.error('Scheduled persistence failed', { error });
      });
    }, 5000); // Debounce persistence for 5 seconds
  }
}
