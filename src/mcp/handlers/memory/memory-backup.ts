/**
 * Memory Backup Handler
 *
 * Handles backup and restore operations for memory namespaces.
 * Implements the memory_backup MCP tool for agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import { AgentRegistry } from '../../services/AgentRegistry';
import { HookExecutor } from '../../services/HookExecutor';

export interface MemoryBackupParams {
  action: 'create' | 'restore' | 'list' | 'delete';
  namespace?: string;
  backupId?: string;
  targetNamespace?: string;
}

interface BackupData {
  backupId: string;
  namespace: string;
  records: any[];
  createdAt: number;
  recordCount: number;
}

/**
 * Handles memory backup operations for QE agents
 */
export class MemoryBackupHandler extends BaseHandler {
  private memoryStore: Map<string, any>;
  private backups: Map<string, BackupData>;

  constructor(
    private registry: AgentRegistry,
    private hookExecutor: HookExecutor,
    memoryStore: Map<string, any>
  ) {
    super();
    this.memoryStore = memoryStore;
    this.backups = new Map();
  }

  /**
   * Handle memory backup request
   */
  async handle(args: MemoryBackupParams): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();

    try {
      const { action } = args;

      switch (action) {
        case 'create':
          return await this.createBackup(args, requestId);
        case 'restore':
          return await this.restoreBackup(args, requestId);
        case 'list':
          return await this.listBackups(args, requestId);
        case 'delete':
          return await this.deleteBackup(args, requestId);
        default:
          throw new Error(`Invalid action: ${action}`);
      }

    } catch (error) {
      this.log('error', 'Failed to execute backup operation', error);
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        requestId
      );
    }
  }

  /**
   * Create backup of namespace
   */
  private async createBackup(args: MemoryBackupParams, requestId: string): Promise<HandlerResponse> {
    this.validateRequired(args, ['namespace', 'backupId']);

    const { namespace, backupId } = args;

    // Get all records in namespace
    const records = Array.from(this.memoryStore.entries())
      .filter(([key, record]) => record.namespace === namespace)
      .map(([key, record]) => ({
        key,
        value: record.value,
        namespace: record.namespace,
        timestamp: record.timestamp,
        ttl: record.ttl,
        metadata: record.metadata
      }));

    // Store backup
    const backupData: BackupData = {
      backupId: backupId!,
      namespace: namespace!,
      records,
      createdAt: Date.now(),
      recordCount: records.length
    };
    this.backups.set(backupId!, backupData);

    this.log('info', `Backup created: ${backupId}`, { namespace, recordCount: records.length });

    return this.createSuccessResponse({
      created: true,
      backupId,
      namespace,
      recordCount: records.length,
      createdAt: Date.now()
    }, requestId);
  }

  /**
   * Restore backup to namespace
   */
  private async restoreBackup(args: MemoryBackupParams, requestId: string): Promise<HandlerResponse> {
    this.validateRequired(args, ['backupId']);

    const { backupId, targetNamespace } = args;

    const backup = this.backups.get(backupId!);
    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const namespace = targetNamespace || backup.namespace;
    let restoredCount = 0;

    // Restore records
    for (const record of backup.records) {
      const key = record.key.replace(`${backup.namespace}:`, `${namespace}:`);
      const restoredRecord = {
        ...record,
        namespace,
        key,
        timestamp: Date.now()
      };

      this.memoryStore.set(key, restoredRecord);
      restoredCount++;
    }

    this.log('info', `Backup restored: ${backupId}`, { namespace, restoredCount });

    return this.createSuccessResponse({
      restored: true,
      backupId,
      targetNamespace: namespace,
      restoredCount
    }, requestId);
  }

  /**
   * List available backups
   */
  private async listBackups(args: MemoryBackupParams, requestId: string): Promise<HandlerResponse> {
    const { namespace } = args;

    let backups = Array.from(this.backups.values());

    if (namespace) {
      backups = backups.filter(b => b.namespace === namespace);
    }

    this.log('info', `Listed backups`, { count: backups.length, namespace });

    return this.createSuccessResponse({
      backups: backups.map(b => ({
        backupId: b.backupId,
        namespace: b.namespace,
        recordCount: b.recordCount,
        createdAt: b.createdAt
      }))
    }, requestId);
  }

  /**
   * Delete backup
   */
  private async deleteBackup(args: MemoryBackupParams, requestId: string): Promise<HandlerResponse> {
    this.validateRequired(args, ['backupId']);

    const { backupId } = args;

    const deleted = this.backups.delete(backupId!);

    if (!deleted) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    this.log('info', `Backup deleted: ${backupId}`);

    return this.createSuccessResponse({
      deleted: true,
      backupId
    }, requestId);
  }
}
