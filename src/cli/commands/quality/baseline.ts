/**
 * Quality Baseline Command
 * Set and manage quality baselines
 */

import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';

export interface BaselineOptions {
  database: Database;
  metrics?: Record<string, number>;
  name?: string;
  action?: 'set' | 'get' | 'list' | 'delete';
}

export interface BaselineResult {
  success: boolean;
  baselineSet?: boolean;
  baseline?: Baseline;
  baselines?: Baseline[];
  deleted?: boolean;
}

interface Baseline {
  name: string;
  metrics: Record<string, number>;
  timestamp: string;
  description?: string;
}

/**
 * Database row for baseline queries
 */
interface BaselineRow {
  name: string;
  metrics: string;
  timestamp: string;
  description: string | null;
}

export async function baseline(options: BaselineOptions): Promise<BaselineResult> {
  const logger = Logger.getInstance();
  const action = options.action || 'set';

  try {
    // Ensure baselines table exists
    await ensureBaselinesTable(options.database);

    switch (action) {
      case 'set':
        return await setBaseline(options, logger);
      case 'get':
        return await getBaseline(options, logger);
      case 'list':
        return await listBaselines(options, logger);
      case 'delete':
        return await deleteBaseline(options, logger);
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    logger.error('Failed to manage baseline:', error);
    throw error;
  }
}

async function ensureBaselinesTable(database: Database): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS quality_baselines (
      name TEXT PRIMARY KEY,
      metrics TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      description TEXT
    )
  `);
}

async function setBaseline(
  options: BaselineOptions,
  logger: Logger
): Promise<BaselineResult> {
  if (!options.metrics || !options.name) {
    throw new Error('metrics and name are required for setting baseline');
  }

  const timestamp = new Date().toISOString();

  await options.database.run(`
    INSERT OR REPLACE INTO quality_baselines (name, metrics, timestamp, description)
    VALUES (?, ?, ?, ?)
  `, [
    options.name,
    JSON.stringify(options.metrics),
    timestamp,
    `Baseline set at ${timestamp}`
  ]);

  logger.info(`Quality baseline "${options.name}" set with ${Object.keys(options.metrics).length} metrics`);

  return {
    success: true,
    baselineSet: true,
    baseline: {
      name: options.name,
      metrics: options.metrics,
      timestamp
    }
  };
}

async function getBaseline(
  options: BaselineOptions,
  logger: Logger
): Promise<BaselineResult> {
  if (!options.name) {
    throw new Error('name is required for getting baseline');
  }

  const row = await options.database.get<BaselineRow>(`
    SELECT name, metrics, timestamp, description
    FROM quality_baselines
    WHERE name = ?
  `, [options.name]);

  if (!row) {
    throw new Error(`Baseline "${options.name}" not found`);
  }

  const baseline: Baseline = {
    name: row.name,
    metrics: JSON.parse(row.metrics),
    timestamp: row.timestamp,
    description: row.description ?? undefined
  };

  logger.info(`Retrieved baseline "${options.name}"`);

  return {
    success: true,
    baseline
  };
}

async function listBaselines(
  options: BaselineOptions,
  logger: Logger
): Promise<BaselineResult> {
  const rows = await options.database.all<BaselineRow>(`
    SELECT name, metrics, timestamp, description
    FROM quality_baselines
    ORDER BY timestamp DESC
  `);

  const baselines: Baseline[] = rows.map(row => ({
    name: row.name,
    metrics: JSON.parse(row.metrics),
    timestamp: row.timestamp,
    description: row.description ?? undefined
  }));

  logger.info(`Listed ${baselines.length} baselines`);

  return {
    success: true,
    baselines
  };
}

async function deleteBaseline(
  options: BaselineOptions,
  logger: Logger
): Promise<BaselineResult> {
  if (!options.name) {
    throw new Error('name is required for deleting baseline');
  }

  await options.database.run(`
    DELETE FROM quality_baselines
    WHERE name = ?
  `, [options.name]);

  logger.info(`Deleted baseline "${options.name}"`);

  return {
    success: true,
    deleted: true
  };
}
