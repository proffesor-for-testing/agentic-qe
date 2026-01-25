import { MemoryEntryDAO } from '../dao/MemoryEntryDAO';
import {
  MemoryEntry,
  StoreOptions,
  RetrieveOptions,
  DeleteOptions,
  AccessLevel,
  Permission,
  AccessControlError
} from '../SwarmMemoryManager';
import { AccessControl } from '../AccessControl';

/**
 * MemoryStoreService - Business logic for memory storage operations
 *
 * Handles:
 * - Core store/retrieve/delete operations
 * - Access control permission checking
 * - TTL calculation
 * - Modification tracking for sync
 *
 * Separates business logic from data access (DAO)
 */
export class MemoryStoreService {
  private memoryDAO: MemoryEntryDAO;
  private accessControl: AccessControl;
  private lastModifiedTimestamps: Map<string, number>;

  constructor(
    memoryDAO: MemoryEntryDAO,
    accessControl: AccessControl
  ) {
    this.memoryDAO = memoryDAO;
    this.accessControl = accessControl;
    this.lastModifiedTimestamps = new Map();
  }

  /**
   * Store a value in memory with access control
   */
  async store(key: string, value: any, options: StoreOptions = {}): Promise<void> {
    const partition = options.partition || 'default';
    const owner = options.owner || 'system';
    const accessLevel = options.accessLevel || AccessLevel.PRIVATE;
    const createdAt = Date.now();
    const expiresAt = this.calculateExpiresAt(options.ttl, createdAt);

    // Check write permission if updating existing entry
    const existing = await this.memoryDAO.findByKey(key, partition);

    if (existing && options.owner) {
      await this.checkWritePermission(existing, options);
    }

    const entry: MemoryEntry = {
      key,
      value,
      partition,
      createdAt,
      expiresAt,
      owner,
      accessLevel,
      teamId: options.teamId,
      swarmId: options.swarmId
    };

    await this.memoryDAO.insert(entry);

    // Track modification for QUIC sync
    this.trackModification(partition, key, createdAt);
  }

  /**
   * Retrieve a value from memory with access control
   */
  async retrieve(key: string, options: RetrieveOptions = {}): Promise<any> {
    const partition = options.partition || 'default';
    const entry = await this.memoryDAO.findByKey(key, partition, options.includeExpired);

    if (!entry) {
      return null;
    }

    // Check read permission if agentId provided
    if (options.agentId) {
      await this.checkReadPermission(entry, options);
    }

    return entry.value;
  }

  /**
   * Query memory entries by pattern with access control
   */
  async query(pattern: string, options: RetrieveOptions = {}): Promise<MemoryEntry[]> {
    const partition = options.partition || 'default';
    const entries = await this.memoryDAO.findByPattern(pattern, partition, options.includeExpired);

    // Filter by access control if agentId provided
    if (options.agentId) {
      return this.filterByPermissions(entries, options);
    }

    return entries;
  }

  /**
   * Delete a memory entry with access control
   */
  async delete(key: string, partition: string = 'default', options: DeleteOptions = {}): Promise<void> {
    // Check delete permission if agentId provided
    if (options.agentId) {
      const entry = await this.memoryDAO.findByKey(key, partition);
      if (entry) {
        await this.checkDeletePermission(entry, options);
      }
    }

    await this.memoryDAO.deleteByKey(key, partition);
  }

  /**
   * Clear all entries in a partition
   */
  async clear(partition: string = 'default'): Promise<void> {
    await this.memoryDAO.deleteByPartition(partition);
  }

  /**
   * Get last modification timestamp for an entry (for QUIC sync)
   */
  getLastModified(key: string, partition: string = 'default'): number | undefined {
    const entryKey = `${partition}:${key}`;
    return this.lastModifiedTimestamps.get(entryKey);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Calculate expiration timestamp from TTL
   */
  private calculateExpiresAt(ttl: number | undefined, createdAt: number): number | undefined {
    return ttl ? createdAt + (ttl * 1000) : undefined;
  }

  /**
   * Track modification timestamp for sync
   */
  private trackModification(partition: string, key: string, timestamp: number): void {
    const entryKey = `${partition}:${key}`;
    this.lastModifiedTimestamps.set(entryKey, timestamp);
  }

  /**
   * Check write permission for updating entry
   */
  private async checkWritePermission(entry: MemoryEntry, options: StoreOptions): Promise<void> {
    if (!entry.owner || !entry.accessLevel || !options.owner) {
      return; // Skip check if missing required fields
    }

    const permCheck = this.accessControl.checkPermission({
      agentId: options.owner,
      resourceOwner: entry.owner,
      accessLevel: entry.accessLevel,
      permission: Permission.WRITE,
      teamId: options.teamId,
      resourceTeamId: entry.teamId,
      swarmId: options.swarmId,
      resourceSwarmId: entry.swarmId
    });

    if (!permCheck.allowed) {
      throw new AccessControlError(`Write denied: ${permCheck.reason}`);
    }
  }

  /**
   * Check read permission for retrieving entry
   */
  private async checkReadPermission(entry: MemoryEntry, options: RetrieveOptions): Promise<void> {
    if (!entry.owner || !entry.accessLevel || !options.agentId) {
      return; // Skip check if missing required fields
    }

    const permCheck = this.accessControl.checkPermission({
      agentId: options.agentId,
      resourceOwner: entry.owner,
      accessLevel: entry.accessLevel,
      permission: Permission.READ,
      teamId: options.teamId,
      resourceTeamId: entry.teamId,
      swarmId: options.swarmId,
      resourceSwarmId: entry.swarmId,
      isSystemAgent: options.isSystemAgent
    });

    if (!permCheck.allowed) {
      throw new AccessControlError(`Read denied: ${permCheck.reason}`);
    }
  }

  /**
   * Check delete permission for removing entry
   */
  private async checkDeletePermission(entry: MemoryEntry, options: DeleteOptions): Promise<void> {
    if (!entry.owner || !entry.accessLevel || !options.agentId) {
      return; // Skip check if missing required fields
    }

    const permCheck = this.accessControl.checkPermission({
      agentId: options.agentId,
      resourceOwner: entry.owner,
      accessLevel: entry.accessLevel,
      permission: Permission.DELETE,
      teamId: options.teamId,
      resourceTeamId: entry.teamId,
      swarmId: options.swarmId,
      resourceSwarmId: entry.swarmId,
      isSystemAgent: options.isSystemAgent
    });

    if (!permCheck.allowed) {
      throw new AccessControlError(`Delete denied: ${permCheck.reason}`);
    }
  }

  /**
   * Filter entries by access control permissions
   */
  private async filterByPermissions(
    entries: MemoryEntry[],
    options: RetrieveOptions
  ): Promise<MemoryEntry[]> {
    const filtered: MemoryEntry[] = [];

    for (const entry of entries) {
      if (!entry.owner || !entry.accessLevel || !options.agentId) {
        filtered.push(entry); // Include if missing permission fields
        continue;
      }

      const permCheck = this.accessControl.checkPermission({
        agentId: options.agentId,
        resourceOwner: entry.owner,
        accessLevel: entry.accessLevel,
        permission: Permission.READ,
        teamId: options.teamId,
        resourceTeamId: entry.teamId,
        swarmId: options.swarmId,
        resourceSwarmId: entry.swarmId,
        isSystemAgent: options.isSystemAgent
      });

      if (permCheck.allowed) {
        filtered.push(entry);
      }
    }

    return filtered;
  }
}
