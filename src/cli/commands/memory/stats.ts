/**
 * Memory Stats Command
 * Display comprehensive memory statistics
 */

import { Database } from '../../../utils/Database';
import { MemoryManager } from '../../../core/MemoryManager';
import { Logger } from '../../../utils/Logger';

export interface StatsOptions {
  memoryManager: MemoryManager;
  database: Database;
}

export interface StatsResult {
  totalKeys: number;
  totalSizeMB: number;
  namespaces: string[];
  byNamespace: Record<string, NamespaceStats>;
  memoryKeys: number;
  diskKeys: number;
  expiringKeys: number;
  persistentKeys: number;
  fragmentation: number;
}

interface NamespaceStats {
  keys: number;
  sizeMB: number;
  ttlKeys: number;
  persistentKeys: number;
}

export async function stats(options: StatsOptions): Promise<StatsResult> {
  const logger = Logger.getInstance();

  try {
    // Get memory manager stats
    const memStats = options.memoryManager.getStats();

    // Calculate total size
    const totalSizeMB = memStats.totalSize / (1024 * 1024);

    // Get namespace breakdown
    const byNamespace: Record<string, NamespaceStats> = {};

    for (const namespace of memStats.namespaces) {
      const keys = await options.memoryManager.list(namespace);

      let sizeMB = 0;
      let ttlKeys = 0;
      let persistentKeys = 0;

      for (const key of keys) {
        const value = await options.memoryManager.retrieve(key, namespace);
        if (value) {
          sizeMB += JSON.stringify(value).length / (1024 * 1024);
        }

        const ttl = await options.memoryManager.getTTL(key, namespace);
        if (ttl === -1) {
          persistentKeys++;
        } else {
          ttlKeys++;
        }
      }

      byNamespace[namespace] = {
        keys: keys.length,
        sizeMB: parseFloat(sizeMB.toFixed(4)),
        ttlKeys,
        persistentKeys
      };
    }

    // Get disk storage stats
    let diskKeys = 0;
    try {
      const result = await options.database.get('SELECT COUNT(*) as count FROM memory_store');
      diskKeys = result?.count || 0;
    } catch (error) {
      logger.warn('Could not get disk key count');
    }

    // Calculate fragmentation
    const fragmentation = memStats.expiredKeys > 0
      ? (memStats.expiredKeys / memStats.totalKeys) * 100
      : 0;

    return {
      totalKeys: memStats.totalKeys,
      totalSizeMB: parseFloat(totalSizeMB.toFixed(2)),
      namespaces: memStats.namespaces,
      byNamespace,
      memoryKeys: memStats.totalKeys,
      diskKeys,
      expiringKeys: memStats.totalKeys - memStats.persistentKeys,
      persistentKeys: memStats.persistentKeys,
      fragmentation: parseFloat(fragmentation.toFixed(2))
    };

  } catch (error) {
    logger.error('Failed to get memory stats:', error);
    throw error;
  }
}
