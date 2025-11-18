/**
 * Memory Compact Command
 * Compacts the database to reclaim unused space
 */

import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';
import { stat } from 'fs/promises';

export interface CompactOptions {
  database: Database;
  verbose?: boolean;
}

export interface CompactResult {
  success: boolean;
  sizeBeforeMB: number;
  sizeAfterMB: number;
  spaceReclaimed: number;
  duration: number;
  error?: string;
}

export async function compact(options: CompactOptions): Promise<CompactResult> {
  const logger = Logger.getInstance();
  const startTime = Date.now();

  try {
    // Get database file path
    const dbPath = (options.database as any).dbPath || './data/fleet.db';

    // Measure size before
    let sizeBeforeMB = 0;
    try {
      const statsBefore = await stat(dbPath);
      sizeBeforeMB = statsBefore.size / (1024 * 1024);
    } catch (error) {
      logger.warn('Could not measure database size before compact');
    }

    // Perform database compaction operations
    // 1. Delete expired memory records
    await options.database.run(`
      DELETE FROM memory_store
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    `);

    // 2. Compact database using PRAGMA optimize
    await options.database.exec('PRAGMA optimize');

    // 3. Reindex all tables
    await options.database.exec('REINDEX');

    // 4. Analyze tables for query optimization
    await options.database.exec('ANALYZE');

    // Measure size after
    let sizeAfterMB = 0;
    try {
      const statsAfter = await stat(dbPath);
      sizeAfterMB = statsAfter.size / (1024 * 1024);
    } catch (error) {
      logger.warn('Could not measure database size after compact');
    }

    const spaceReclaimed = Math.max(0, sizeBeforeMB - sizeAfterMB);
    const duration = Date.now() - startTime;

    logger.info(`Database compacted: ${spaceReclaimed.toFixed(2)}MB reclaimed in ${duration}ms`);

    return {
      success: true,
      sizeBeforeMB: parseFloat(sizeBeforeMB.toFixed(2)),
      sizeAfterMB: parseFloat(sizeAfterMB.toFixed(2)),
      spaceReclaimed: parseFloat(spaceReclaimed.toFixed(2)),
      duration
    };

  } catch (error) {
    logger.error('Failed to compact database:', error);
    return {
      success: false,
      sizeBeforeMB: 0,
      sizeAfterMB: 0,
      spaceReclaimed: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
