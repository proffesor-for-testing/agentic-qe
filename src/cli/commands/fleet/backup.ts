/**
 * Fleet Backup Command
 * Create complete fleet state backup
 */

import { FleetManager } from '../../../core/FleetManager';
import { Database } from '../../../utils/Database';
import { Logger } from '../../../utils/Logger';
import { writeFile } from 'fs/promises';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

export interface BackupOptions {
  fleetManager: FleetManager;
  database: Database;
  output: string;
  compress?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  compressed: boolean;
  backup: FleetBackup;
  error?: string;
}

interface FleetBackup {
  version: string;
  timestamp: string;
  config: any;
  agents: AgentBackup[];
  tasks: TaskBackup[];
  metrics: MetricBackup[];
}

interface AgentBackup {
  id: string;
  type: string;
  status: string;
  config: any;
  metrics: any;
}

interface TaskBackup {
  id: string;
  type: string;
  status: string;
  data: any;
}

interface MetricBackup {
  type: string;
  name: string;
  value: number;
  timestamp: string;
}

export async function backup(options: BackupOptions): Promise<BackupResult> {
  const logger = Logger.getInstance();

  try {
    const status = options.fleetManager.getStatus();
    const agents = options.fleetManager.getAllAgents();
    const tasks = options.fleetManager.getAllTasks();

    // Build backup data
    const agentBackups: AgentBackup[] = agents.map(agent => ({
      id: agent.getId(),
      type: agent.getType(),
      status: agent.getStatus(),
      config: (agent as any).config || {},
      metrics: (agent as any).metrics || {}
    }));

    const taskBackups: TaskBackup[] = tasks.map(task => ({
      id: task.getId(),
      type: task.getType(),
      status: task.getStatus(),
      data: task.getData()
    }));

    // Get recent metrics from database
    const metricsRows = await options.database.all(`
      SELECT metric_type, metric_name, metric_value, timestamp
      FROM metrics
      WHERE timestamp > datetime('now', '-7 days')
      ORDER BY timestamp DESC
      LIMIT 1000
    `);

    const metricBackups: MetricBackup[] = metricsRows.map(row => ({
      type: row.metric_type,
      name: row.metric_name,
      value: row.metric_value,
      timestamp: row.timestamp
    }));

    const backup: FleetBackup = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      config: {
        fleetId: status.id,
        status: status.status
      },
      agents: agentBackups,
      tasks: taskBackups,
      metrics: metricBackups
    };

    // Serialize backup
    let backupData = JSON.stringify(backup, null, 2);

    // Compress if requested
    let compressed = false;
    if (options.compress) {
      const buffer = await gzipAsync(Buffer.from(backupData));
      backupData = buffer.toString('base64');
      compressed = true;
    }

    // Write to file
    await writeFile(options.output, backupData, 'utf-8');

    logger.info(`Fleet backup created: ${options.output} (${compressed ? 'compressed' : 'uncompressed'})`);

    return {
      success: true,
      backupPath: options.output,
      compressed,
      backup
    };

  } catch (error) {
    logger.error('Failed to create backup:', error);
    return {
      success: false,
      backupPath: options.output,
      compressed: false,
      backup: {} as FleetBackup,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
