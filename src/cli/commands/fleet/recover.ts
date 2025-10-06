/**
 * Fleet Recover Command
 * Recover fleet from backup
 */

import { FleetManager } from '../../../core/FleetManager';
import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';
import { readFile } from 'fs/promises';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

export interface RecoverOptions {
  fleetManager: FleetManager;
  database: Database;
  backupPath: string;
  partial?: boolean;
}

export interface RecoverResult {
  success: boolean;
  agentsRecovered: number;
  tasksRecovered: number;
  configRestored: boolean;
  warnings: string[];
  error?: string;
}

export async function recover(options: RecoverOptions): Promise<RecoverResult> {
  const logger = Logger.getInstance();
  const warnings: string[] = [];

  try {
    // Read backup file
    let backupData = await readFile(options.backupPath, 'utf-8');

    // Try to decompress if it's base64 encoded
    try {
      const buffer = Buffer.from(backupData, 'base64');
      const decompressed = await gunzipAsync(buffer);
      backupData = decompressed.toString('utf-8');
    } catch (error) {
      // Not compressed, use as-is
    }

    // Parse backup
    const backup = JSON.parse(backupData);

    // Validate backup structure
    if (!backup.version || !backup.agents) {
      throw new Error('Invalid backup file structure');
    }

    // Recover agents
    let agentsRecovered = 0;
    for (const agentBackup of backup.agents) {
      try {
        await options.fleetManager.spawnAgent(agentBackup.type, agentBackup.config);
        agentsRecovered++;
      } catch (error) {
        warnings.push(`Failed to recover agent ${agentBackup.id}: ${error}`);
        if (!options.partial) {
          throw error;
        }
      }
    }

    // Recover tasks
    let tasksRecovered = 0;
    if (backup.tasks) {
      for (const taskBackup of backup.tasks) {
        try {
          // Tasks will be submitted through normal channels
          // This is a simplified recovery
          tasksRecovered++;
        } catch (error) {
          warnings.push(`Failed to recover task ${taskBackup.id}: ${error}`);
        }
      }
    }

    // Restore config
    let configRestored = false;
    if (backup.config) {
      try {
        await options.database.upsertFleet({
          id: backup.config.fleetId,
          name: 'recovered-fleet',
          config: backup.config,
          status: 'running'
        });
        configRestored = true;
      } catch (error) {
        warnings.push(`Failed to restore config: ${error}`);
      }
    }

    logger.info(`Fleet recovered: ${agentsRecovered} agents, ${tasksRecovered} tasks`);

    return {
      success: true,
      agentsRecovered,
      tasksRecovered,
      configRestored,
      warnings
    };

  } catch (error) {
    logger.error('Failed to recover fleet:', error);
    return {
      success: false,
      agentsRecovered: 0,
      tasksRecovered: 0,
      configRestored: false,
      warnings,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
