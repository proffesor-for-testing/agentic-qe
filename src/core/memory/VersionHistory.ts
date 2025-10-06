import { SwarmMemoryManager, StoreOptions, RetrieveOptions } from './SwarmMemoryManager';
import * as crypto from 'crypto';

export interface VersionEntry {
  key: string;
  value: any;
  version: number;
  timestamp: number;
  checksum: string;
  partition?: string;
  metadata?: Record<string, any>;
}

export interface VersionStoreOptions extends StoreOptions {
  metadata?: Record<string, any>;
}

export interface VersionRetrieveOptions extends RetrieveOptions {
  includeExpired?: boolean;
}

/**
 * VersionHistory - Manages version history for memory entries
 *
 * Features:
 * - Stores last 10 versions of each entry
 * - Checksum validation for data integrity
 * - Rollback to previous versions
 * - Version metadata tracking
 * - Partition support
 */
export class VersionHistory {
  private static readonly MAX_VERSIONS = 10;
  private static readonly VERSION_PARTITION_PREFIX = 'versions:';

  constructor(private memoryManager: SwarmMemoryManager) {}

  /**
   * Calculate SHA-256 checksum for data
   */
  private calculateChecksum(data: any): string {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
  }

  /**
   * Get version partition key
   */
  private getVersionPartition(partition: string = 'default'): string {
    return `${VersionHistory.VERSION_PARTITION_PREFIX}${partition}`;
  }

  /**
   * Get version storage key
   */
  private getVersionKey(key: string, timestamp: number): string {
    return `${key}:v:${timestamp}`;
  }

  /**
   * Store a new version
   */
  async store(
    key: string,
    value: any,
    options: VersionStoreOptions = {}
  ): Promise<number> {
    const timestamp = Date.now();
    const checksum = this.calculateChecksum(value);
    const partition = options.partition || 'default';
    const versionPartition = this.getVersionPartition(partition);

    // Get existing versions
    const existingVersions = await this.getHistory(key, { partition });

    // Create new version entry
    const versionEntry: VersionEntry = {
      key,
      value,
      version: existingVersions.length + 1,
      timestamp,
      checksum,
      partition,
      metadata: options.metadata
    };

    // Store version
    const versionKey = this.getVersionKey(key, timestamp);
    await this.memoryManager.store(versionKey, versionEntry, {
      partition: versionPartition,
      ttl: options.ttl,
      metadata: {
        ...options.metadata,
        isVersion: true,
        originalKey: key
      }
    });

    // Clean up old versions (keep only last 10)
    if (existingVersions.length >= VersionHistory.MAX_VERSIONS) {
      const versionsToDelete = existingVersions.slice(
        0,
        existingVersions.length - VersionHistory.MAX_VERSIONS + 1
      );

      for (const version of versionsToDelete) {
        const deleteKey = this.getVersionKey(key, version.timestamp);
        await this.memoryManager.delete(deleteKey, versionPartition);
      }
    }

    // Update current value in main partition
    await this.memoryManager.store(key, value, {
      partition,
      ttl: options.ttl,
      metadata: {
        ...options.metadata,
        latestVersion: timestamp,
        checksum
      }
    });

    return timestamp;
  }

  /**
   * Get version history for a key
   */
  async getHistory(
    key: string,
    options: VersionRetrieveOptions = {}
  ): Promise<VersionEntry[]> {
    const partition = options.partition || 'default';
    const versionPartition = this.getVersionPartition(partition);
    const pattern = `${key}:v:%`;

    const entries = await this.memoryManager.query(pattern, {
      partition: versionPartition,
      includeExpired: options.includeExpired
    });

    const versions = entries
      .map(entry => entry.value as VersionEntry)
      .sort((a, b) => a.timestamp - b.timestamp);

    return versions;
  }

  /**
   * Get specific version by timestamp
   */
  async getVersion(
    key: string,
    timestamp: number,
    options: VersionRetrieveOptions = {}
  ): Promise<VersionEntry | null> {
    const partition = options.partition || 'default';
    const versionPartition = this.getVersionPartition(partition);
    const versionKey = this.getVersionKey(key, timestamp);

    const value = await this.memoryManager.retrieve(versionKey, {
      partition: versionPartition,
      includeExpired: options.includeExpired
    });

    return value || null;
  }

  /**
   * Get latest version
   */
  async getLatest(
    key: string,
    options: VersionRetrieveOptions = {}
  ): Promise<VersionEntry | null> {
    const history = await this.getHistory(key, options);
    return history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Rollback to a specific version
   */
  async rollback(
    key: string,
    timestamp: number,
    options: StoreOptions = {}
  ): Promise<void> {
    const version = await this.getVersion(key, timestamp, options);

    if (!version) {
      throw new Error(`Version not found: ${key}@${timestamp}`);
    }

    const partition = options.partition || 'default';

    // Verify checksum
    const calculatedChecksum = this.calculateChecksum(version.value);
    if (calculatedChecksum !== version.checksum) {
      throw new Error(`Checksum validation failed for ${key}@${timestamp}`);
    }

    // Store as new current version
    await this.memoryManager.store(key, version.value, {
      partition,
      metadata: {
        ...options.metadata,
        rolledBackFrom: timestamp,
        checksum: version.checksum
      }
    });

    // Add rollback entry to history
    await this.store(key, version.value, {
      ...options,
      metadata: {
        ...options.metadata,
        ...version.metadata,
        isRollback: true,
        rolledBackFrom: timestamp
      }
    });
  }

  /**
   * Validate checksum for a version
   */
  async validateChecksum(
    key: string,
    timestamp: number,
    options: VersionRetrieveOptions = {}
  ): Promise<boolean> {
    const version = await this.getVersion(key, timestamp, options);

    if (!version) {
      return false;
    }

    const calculatedChecksum = this.calculateChecksum(version.value);
    return calculatedChecksum === version.checksum;
  }

  /**
   * Get version count for a key
   */
  async getVersionCount(
    key: string,
    options: VersionRetrieveOptions = {}
  ): Promise<number> {
    const history = await this.getHistory(key, options);
    return history.length;
  }

  /**
   * Delete all versions for a key
   */
  async deleteHistory(
    key: string,
    options: { partition?: string } = {}
  ): Promise<void> {
    const partition = options.partition || 'default';
    const versionPartition = this.getVersionPartition(partition);
    const history = await this.getHistory(key, options);

    for (const version of history) {
      const versionKey = this.getVersionKey(key, version.timestamp);
      await this.memoryManager.delete(versionKey, versionPartition);
    }
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    key: string,
    timestamp1: number,
    timestamp2: number,
    options: VersionRetrieveOptions = {}
  ): Promise<{
    version1: VersionEntry | null;
    version2: VersionEntry | null;
    identical: boolean;
    checksumMatch: boolean;
  }> {
    const version1 = await this.getVersion(key, timestamp1, options);
    const version2 = await this.getVersion(key, timestamp2, options);

    if (!version1 || !version2) {
      return {
        version1,
        version2,
        identical: false,
        checksumMatch: false
      };
    }

    const identical = JSON.stringify(version1.value) === JSON.stringify(version2.value);
    const checksumMatch = version1.checksum === version2.checksum;

    return {
      version1,
      version2,
      identical,
      checksumMatch
    };
  }
}
