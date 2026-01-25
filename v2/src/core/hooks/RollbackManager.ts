/**
 * RollbackManager - Manages snapshots and automatic rollback on errors/regressions
 */

import { ISwarmMemoryManager } from '../../types/memory-interfaces';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';

export interface Snapshot {
  id: string;
  timestamp: number;
  files: Array<{
    path: string;
    hash: string;
    content: string;
  }>;
  metadata?: Record<string, unknown>;
}

/**
 * Structure for rollback history entries stored in memory
 */
interface RollbackHistoryEntry {
  snapshotId: string;
  reason?: string;
  timestamp: number;
}

/**
 * Type guard to check if a value is a valid Snapshot object
 */
function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.timestamp === 'number' &&
    Array.isArray(obj.files)
  );
}

/**
 * Type guard to check if a value is a valid RollbackHistoryEntry
 */
function isRollbackHistoryEntry(value: unknown): value is RollbackHistoryEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.snapshotId === 'string' &&
    typeof obj.timestamp === 'number' &&
    (obj.reason === undefined || typeof obj.reason === 'string')
  );
}

export interface SnapshotOptions {
  id: string;
  files: string[];
  metadata?: Record<string, unknown>;
}

export interface RollbackTriggerOptions {
  metrics: {
    errorCount?: number;
    totalOperations?: number;
    errorRate?: number;
    currentAccuracy?: number;
    baselineAccuracy?: number;
    degradation?: number;
  };
  thresholds: {
    maxErrorRate?: number;
    maxErrors?: number;
    maxAccuracyDegradation?: number;
    minAccuracy?: number;
  };
}

export interface RollbackResult {
  success: boolean;
  snapshotId: string;
  filesRestored: number;
  errors: string[];
}

export interface CleanupOptions {
  maxAge?: number; // milliseconds
  keepMinimum?: number;
}

export class RollbackManager {
  private snapshots: Map<string, Snapshot> = new Map();

  constructor(private memory: ISwarmMemoryManager) {}

  /**
   * Create a snapshot of specified files
   */
  async createSnapshot(options: SnapshotOptions): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: options.id,
      timestamp: Date.now(),
      files: [],
      metadata: options.metadata
    };

    for (const filePath of options.files) {
      try {
        const exists = await fs.pathExists(filePath);
        if (!exists) {
          continue;
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');

        snapshot.files.push({
          path: filePath,
          hash,
          content
        });
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Store snapshot in memory
    this.snapshots.set(snapshot.id, snapshot);

    // Persist to memory manager
    await this.memory.store(`snapshot:${snapshot.id}`, snapshot, {
      partition: 'snapshots'
    });

    return snapshot;
  }

  /**
   * Restore files from a snapshot
   */
  async restoreSnapshot(snapshotId: string): Promise<RollbackResult> {
    const cachedSnapshot = this.snapshots.get(snapshotId);
    const retrievedValue = cachedSnapshot ||
      await this.memory.retrieve(`snapshot:${snapshotId}`, { partition: 'snapshots' });

    // Validate the snapshot using type guard
    if (!isSnapshot(retrievedValue)) {
      return {
        success: false,
        snapshotId,
        filesRestored: 0,
        errors: [`Snapshot not found: ${snapshotId}`]
      };
    }

    const snapshot = retrievedValue;

    const errors: string[] = [];
    let filesRestored = 0;

    for (const file of snapshot.files) {
      try {
        await fs.ensureDir(path.dirname(file.path));
        await fs.writeFile(file.path, file.content, 'utf-8');
        filesRestored++;
      } catch (error) {
        errors.push(`Failed to restore ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      success: errors.length === 0,
      snapshotId,
      filesRestored,
      errors
    };
  }

  /**
   * Determine if rollback should be triggered based on metrics
   */
  async shouldTriggerRollback(options: RollbackTriggerOptions): Promise<boolean> {
    const { metrics, thresholds } = options;

    // Check error rate
    if (thresholds.maxErrorRate !== undefined && metrics.errorRate !== undefined) {
      if (metrics.errorRate > thresholds.maxErrorRate) {
        return true;
      }
    }

    // Check error count
    if (thresholds.maxErrors !== undefined && metrics.errorCount !== undefined) {
      if (metrics.errorCount > thresholds.maxErrors) {
        return true;
      }
    }

    // Check accuracy degradation
    if (thresholds.maxAccuracyDegradation !== undefined &&
        metrics.currentAccuracy !== undefined &&
        metrics.baselineAccuracy !== undefined) {
      const degradation = metrics.baselineAccuracy - metrics.currentAccuracy;
      if (degradation > thresholds.maxAccuracyDegradation) {
        return true;
      }
    }

    // Check minimum accuracy
    if (thresholds.minAccuracy !== undefined && metrics.currentAccuracy !== undefined) {
      if (metrics.currentAccuracy < thresholds.minAccuracy) {
        return true;
      }
    }

    return false;
  }

  /**
   * Execute rollback to a specific snapshot
   */
  async executeRollback(options: {
    snapshotId: string;
    reason?: string;
  }): Promise<RollbackResult> {
    // Log rollback attempt
    await this.memory.store(
      `rollback:${Date.now()}`,
      {
        snapshotId: options.snapshotId,
        reason: options.reason,
        timestamp: Date.now()
      },
      { partition: 'rollback_history' }
    );

    // Restore the snapshot
    return this.restoreSnapshot(options.snapshotId);
  }

  /**
   * List available snapshots
   */
  async listSnapshots(): Promise<Array<{ id: string; timestamp: number; fileCount: number }>> {
    const snapshotList: Array<{ id: string; timestamp: number; fileCount: number }> = [];

    // Get from in-memory cache
    for (const [id, snapshot] of this.snapshots) {
      snapshotList.push({
        id,
        timestamp: snapshot.timestamp,
        fileCount: snapshot.files.length
      });
    }

    // Get from memory manager
    const stored = await this.memory.query('snapshot:%', { partition: 'snapshots' });
    for (const entry of stored) {
      // Validate entry.value is a valid snapshot
      if (!isSnapshot(entry.value)) {
        continue;
      }
      if (!this.snapshots.has(entry.value.id)) {
        snapshotList.push({
          id: entry.value.id,
          timestamp: entry.value.timestamp,
          fileCount: entry.value.files?.length || 0
        });
      }
    }

    return snapshotList.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clean up old snapshots
   */
  async cleanSnapshots(options: CleanupOptions = {}): Promise<number> {
    const maxAge = options.maxAge !== undefined ? options.maxAge : 24 * 60 * 60 * 1000; // 24 hours default
    const keepMinimum = options.keepMinimum !== undefined ? options.keepMinimum : 5;

    const snapshots = await this.listSnapshots();
    const now = Date.now();

    let cleaned = 0;

    // Keep at least keepMinimum snapshots
    const snapshotsToCheck = snapshots.slice(keepMinimum);

    for (const snapshot of snapshotsToCheck) {
      const age = now - snapshot.timestamp;
      if (age > maxAge) {
        this.snapshots.delete(snapshot.id);
        await this.memory.delete(`snapshot:${snapshot.id}`, 'snapshots');
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get rollback history
   */
  async getRollbackHistory(limit: number = 10): Promise<Array<{
    snapshotId: string;
    reason?: string;
    timestamp: number;
  }>> {
    const history = await this.memory.query('rollback:%', { partition: 'rollback_history' });

    // Filter and validate entries using type guard
    const validEntries: RollbackHistoryEntry[] = [];
    for (const entry of history) {
      if (isRollbackHistoryEntry(entry.value)) {
        validEntries.push(entry.value);
      }
    }

    return validEntries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}
