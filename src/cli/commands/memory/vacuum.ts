/**
 * Memory Vacuum Command
 * Performs VACUUM operation to rebuild database and optimize performance
 */

import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';
import { stat } from 'fs/promises';

export interface VacuumOptions {
  database: Database;
  mode?: 'full' | 'incremental';
  analyze?: boolean;
}

export interface VacuumResult {
  success: boolean;
  sizeBeforeMB: number;
  sizeAfterMB: number;
  pagesBefore: number;
  pagesAfter: number;
  indexesRebuilt: number;
  analyzed: boolean;
  mode: string;
  duration: number;
  error?: string;
}

export async function vacuum(options: VacuumOptions): Promise<VacuumResult> {
  const logger = Logger.getInstance();
  const startTime = Date.now();
  const mode = options.mode || 'full';

  try {
    const dbPath = (options.database as any).dbPath || './data/fleet.db';

    // Measure initial stats
    let sizeBeforeMB = 0;
    let pagesBefore = 0;

    try {
      const statsBefore = await stat(dbPath);
      sizeBeforeMB = statsBefore.size / (1024 * 1024);
    } catch (error) {
      logger.warn('Could not measure database size');
    }

    // Get page count before
    try {
      const result = await options.database.get<{ page_count: number }>('PRAGMA page_count');
      pagesBefore = result?.page_count ?? 0;
    } catch (error) {
      logger.warn('Could not get page count');
    }

    // Perform vacuum operation
    if (mode === 'full') {
      await options.database.exec('VACUUM');
    } else {
      // Incremental vacuum
      await options.database.exec('PRAGMA auto_vacuum = INCREMENTAL');
      await options.database.exec('PRAGMA incremental_vacuum');
    }

    // Rebuild indexes
    await options.database.exec('REINDEX');

    // Count indexes rebuilt
    const indexResult = await options.database.all<{ count: number }>(`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    `);
    const indexesRebuilt = indexResult[0]?.count ?? 0;

    // Analyze if requested
    let analyzed = false;
    if (options.analyze) {
      await options.database.exec('ANALYZE');
      analyzed = true;
    }

    // Measure final stats
    let sizeAfterMB = 0;
    let pagesAfter = 0;

    try {
      const statsAfter = await stat(dbPath);
      sizeAfterMB = statsAfter.size / (1024 * 1024);
    } catch (error) {
      logger.warn('Could not measure database size after vacuum');
    }

    try {
      const result = await options.database.get<{ page_count: number }>('PRAGMA page_count');
      pagesAfter = result?.page_count ?? 0;
    } catch (error) {
      logger.warn('Could not get page count after vacuum');
    }

    const duration = Date.now() - startTime;

    logger.info(`Database vacuumed (${mode}): ${pagesBefore} -> ${pagesAfter} pages in ${duration}ms`);

    return {
      success: true,
      sizeBeforeMB: parseFloat(sizeBeforeMB.toFixed(2)),
      sizeAfterMB: parseFloat(sizeAfterMB.toFixed(2)),
      pagesBefore,
      pagesAfter,
      indexesRebuilt,
      analyzed,
      mode,
      duration
    };

  } catch (error) {
    logger.error('Failed to vacuum database:', error);
    return {
      success: false,
      sizeBeforeMB: 0,
      sizeAfterMB: 0,
      pagesBefore: 0,
      pagesAfter: 0,
      indexesRebuilt: 0,
      analyzed: false,
      mode,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
