/**
 * ConflictResolver - Sync Conflict Resolution
 *
 * Handles conflicts that arise when local and remote data
 * have diverged. Supports multiple resolution strategies.
 *
 * Features:
 * - Multiple resolution strategies
 * - Pattern-specific merge logic
 * - Audit logging for resolutions
 * - Manual resolution support
 *
 * Phase 1: P1-005 - Offline-First Storage Layer
 *
 * @module vscode-extension/storage/ConflictResolver
 * @version 0.1.0
 */

import type { StorageEntry, StorageNamespace } from './StorageAdapter';

/**
 * Conflict resolution strategy
 */
export type ResolutionStrategy =
  | 'local-wins'
  | 'remote-wins'
  | 'merge'
  | 'newest-wins'
  | 'manual';

/**
 * Conflict type
 */
export type ConflictType =
  | 'value-mismatch'
  | 'concurrent-edit'
  | 'delete-update'
  | 'schema-mismatch';

/**
 * Conflict details
 */
export interface Conflict {
  /** Unique conflict ID */
  id: string;
  /** Type of conflict */
  type: ConflictType;
  /** Storage namespace */
  namespace: StorageNamespace;
  /** Entry key */
  key: string;
  /** Local entry */
  localEntry: StorageEntry;
  /** Remote entry */
  remoteEntry: StorageEntry;
  /** Timestamp when conflict was detected */
  detectedAt: number;
}

/**
 * Resolution result
 */
export interface ConflictResolution {
  /** Conflict that was resolved */
  conflict: Conflict;
  /** Strategy used */
  strategy: ResolutionStrategy;
  /** Resolved entry (if applicable) */
  resolvedEntry?: StorageEntry;
  /** Resolution timestamp */
  resolvedAt: number;
  /** Additional audit information */
  auditLog: ResolutionAuditEntry[];
}

/**
 * Audit log entry for resolution tracking
 */
export interface ResolutionAuditEntry {
  timestamp: number;
  action: string;
  details: string;
  metadata?: Record<string, unknown>;
}

/**
 * Manual resolution callback
 */
export type ManualResolutionCallback = (
  conflict: Conflict
) => Promise<StorageEntry | null>;

/**
 * Merge function for custom merge logic
 */
export type MergeFunction<T = unknown> = (
  localValue: T,
  remoteValue: T,
  context: MergeContext
) => T;

/**
 * Context for merge operations
 */
export interface MergeContext {
  namespace: StorageNamespace;
  key: string;
  localTimestamp: number;
  remoteTimestamp: number;
}

/**
 * Configuration for ConflictResolver
 */
export interface ConflictResolverConfig {
  /** Default resolution strategy */
  defaultStrategy?: ResolutionStrategy;
  /** Strategy overrides by namespace */
  namespaceStrategies?: Partial<Record<StorageNamespace, ResolutionStrategy>>;
  /** Custom merge functions by namespace */
  mergeFunctions?: Partial<Record<StorageNamespace, MergeFunction>>;
  /** Manual resolution callback */
  manualResolutionCallback?: ManualResolutionCallback;
  /** Enable audit logging */
  enableAuditLog?: boolean;
  /** Enable debug logging */
  debugMode?: boolean;
}

/**
 * ConflictResolver - Resolves sync conflicts
 */
export class ConflictResolver {
  private readonly defaultStrategy: ResolutionStrategy;
  private readonly namespaceStrategies: Partial<Record<StorageNamespace, ResolutionStrategy>>;
  private readonly mergeFunctions: Partial<Record<StorageNamespace, MergeFunction>>;
  private manualResolutionCallback: ManualResolutionCallback | null;
  private readonly enableAuditLog: boolean;
  private readonly debugMode: boolean;

  /** History of resolved conflicts */
  private resolutionHistory: ConflictResolution[] = [];

  /** Maximum history size */
  private static readonly MAX_HISTORY_SIZE = 100;

  constructor(config: ConflictResolverConfig = {}) {
    this.defaultStrategy = config.defaultStrategy ?? 'newest-wins';
    this.namespaceStrategies = config.namespaceStrategies ?? {};
    this.mergeFunctions = config.mergeFunctions ?? {};
    this.manualResolutionCallback = config.manualResolutionCallback ?? null;
    this.enableAuditLog = config.enableAuditLog ?? true;
    this.debugMode = config.debugMode ?? false;
  }

  /**
   * Resolve a conflict between local and remote entries
   */
  async resolve(
    localEntry: StorageEntry,
    remoteEntry: StorageEntry,
    strategy?: ResolutionStrategy
  ): Promise<ConflictResolution> {
    // Create conflict object
    const conflict = this.createConflict(localEntry, remoteEntry);

    // Determine strategy to use
    const resolveStrategy =
      strategy ??
      this.namespaceStrategies[conflict.namespace] ??
      this.defaultStrategy;

    this.log(`Resolving conflict ${conflict.id} using strategy: ${resolveStrategy}`);

    // Initialize audit log
    const auditLog: ResolutionAuditEntry[] = [];

    if (this.enableAuditLog) {
      auditLog.push({
        timestamp: Date.now(),
        action: 'conflict-detected',
        details: `Conflict detected for ${conflict.namespace}/${conflict.key}`,
        metadata: {
          localUpdatedAt: localEntry.updatedAt,
          remoteUpdatedAt: remoteEntry.updatedAt,
          conflictType: conflict.type,
        },
      });
    }

    // Resolve based on strategy
    let resolvedEntry: StorageEntry | undefined;

    switch (resolveStrategy) {
      case 'local-wins':
        resolvedEntry = await this.resolveLocalWins(conflict, auditLog);
        break;

      case 'remote-wins':
        resolvedEntry = await this.resolveRemoteWins(conflict, auditLog);
        break;

      case 'newest-wins':
        resolvedEntry = await this.resolveNewestWins(conflict, auditLog);
        break;

      case 'merge':
        resolvedEntry = await this.resolveMerge(conflict, auditLog);
        break;

      case 'manual':
        resolvedEntry = await this.resolveManual(conflict, auditLog);
        break;

      default:
        throw new Error(`Unknown resolution strategy: ${resolveStrategy}`);
    }

    // Create resolution result
    const resolution: ConflictResolution = {
      conflict,
      strategy: resolveStrategy,
      resolvedEntry,
      resolvedAt: Date.now(),
      auditLog,
    };

    // Add to history
    this.addToHistory(resolution);

    if (this.enableAuditLog) {
      auditLog.push({
        timestamp: Date.now(),
        action: 'conflict-resolved',
        details: `Conflict resolved using ${resolveStrategy}`,
        metadata: {
          hasResolvedEntry: !!resolvedEntry,
        },
      });
    }

    this.log(`Conflict ${conflict.id} resolved`);

    return resolution;
  }

  /**
   * Set the manual resolution callback
   */
  setManualResolutionCallback(callback: ManualResolutionCallback): void {
    this.manualResolutionCallback = callback;
  }

  /**
   * Set a custom merge function for a namespace
   */
  setMergeFunction(namespace: StorageNamespace, fn: MergeFunction): void {
    this.mergeFunctions[namespace] = fn;
  }

  /**
   * Get resolution history
   */
  getHistory(): ConflictResolution[] {
    return [...this.resolutionHistory];
  }

  /**
   * Clear resolution history
   */
  clearHistory(): void {
    this.resolutionHistory = [];
  }

  /**
   * Get statistics about conflict resolutions
   */
  getStats(): {
    totalResolutions: number;
    byStrategy: Record<ResolutionStrategy, number>;
    byNamespace: Partial<Record<StorageNamespace, number>>;
  } {
    const byStrategy: Record<ResolutionStrategy, number> = {
      'local-wins': 0,
      'remote-wins': 0,
      'merge': 0,
      'newest-wins': 0,
      'manual': 0,
    };

    const byNamespace: Partial<Record<StorageNamespace, number>> = {};

    for (const resolution of this.resolutionHistory) {
      byStrategy[resolution.strategy]++;

      const ns = resolution.conflict.namespace;
      byNamespace[ns] = (byNamespace[ns] ?? 0) + 1;
    }

    return {
      totalResolutions: this.resolutionHistory.length,
      byStrategy,
      byNamespace,
    };
  }

  // ==================== Resolution strategies ====================

  /**
   * Local wins - keep local entry
   */
  private async resolveLocalWins(
    conflict: Conflict,
    auditLog: ResolutionAuditEntry[]
  ): Promise<StorageEntry> {
    if (this.enableAuditLog) {
      auditLog.push({
        timestamp: Date.now(),
        action: 'strategy-applied',
        details: 'Local entry selected (local-wins)',
      });
    }

    return {
      ...conflict.localEntry,
      updatedAt: Date.now(),
    };
  }

  /**
   * Remote wins - use remote entry
   */
  private async resolveRemoteWins(
    conflict: Conflict,
    auditLog: ResolutionAuditEntry[]
  ): Promise<StorageEntry> {
    if (this.enableAuditLog) {
      auditLog.push({
        timestamp: Date.now(),
        action: 'strategy-applied',
        details: 'Remote entry selected (remote-wins)',
      });
    }

    return {
      ...conflict.remoteEntry,
      updatedAt: Date.now(),
    };
  }

  /**
   * Newest wins - use the most recently updated entry
   */
  private async resolveNewestWins(
    conflict: Conflict,
    auditLog: ResolutionAuditEntry[]
  ): Promise<StorageEntry> {
    const localNewer = conflict.localEntry.updatedAt > conflict.remoteEntry.updatedAt;
    const winner = localNewer ? conflict.localEntry : conflict.remoteEntry;

    if (this.enableAuditLog) {
      auditLog.push({
        timestamp: Date.now(),
        action: 'strategy-applied',
        details: `${localNewer ? 'Local' : 'Remote'} entry selected (newest-wins)`,
        metadata: {
          localTimestamp: conflict.localEntry.updatedAt,
          remoteTimestamp: conflict.remoteEntry.updatedAt,
        },
      });
    }

    return {
      ...winner,
      updatedAt: Date.now(),
    };
  }

  /**
   * Merge - attempt to merge local and remote values
   */
  private async resolveMerge(
    conflict: Conflict,
    auditLog: ResolutionAuditEntry[]
  ): Promise<StorageEntry> {
    // Check for custom merge function
    const customMergeFn = this.mergeFunctions[conflict.namespace];

    if (customMergeFn) {
      const context: MergeContext = {
        namespace: conflict.namespace,
        key: conflict.key,
        localTimestamp: conflict.localEntry.updatedAt,
        remoteTimestamp: conflict.remoteEntry.updatedAt,
      };

      const mergedValue = customMergeFn(
        conflict.localEntry.value,
        conflict.remoteEntry.value,
        context
      );

      if (this.enableAuditLog) {
        auditLog.push({
          timestamp: Date.now(),
          action: 'strategy-applied',
          details: 'Custom merge function applied',
        });
      }

      return {
        ...conflict.localEntry,
        value: mergedValue,
        updatedAt: Date.now(),
      };
    }

    // Default merge logic based on namespace
    const mergedValue = this.defaultMerge(
      conflict.namespace,
      conflict.localEntry.value,
      conflict.remoteEntry.value
    );

    if (this.enableAuditLog) {
      auditLog.push({
        timestamp: Date.now(),
        action: 'strategy-applied',
        details: 'Default merge applied',
      });
    }

    return {
      ...conflict.localEntry,
      value: mergedValue,
      updatedAt: Date.now(),
    };
  }

  /**
   * Manual - delegate to user/callback
   */
  private async resolveManual(
    conflict: Conflict,
    auditLog: ResolutionAuditEntry[]
  ): Promise<StorageEntry | undefined> {
    if (!this.manualResolutionCallback) {
      // Fall back to newest-wins if no callback
      if (this.enableAuditLog) {
        auditLog.push({
          timestamp: Date.now(),
          action: 'fallback',
          details: 'No manual callback, falling back to newest-wins',
        });
      }
      return this.resolveNewestWins(conflict, auditLog);
    }

    const resolved = await this.manualResolutionCallback(conflict);

    if (this.enableAuditLog) {
      auditLog.push({
        timestamp: Date.now(),
        action: 'strategy-applied',
        details: resolved ? 'Manual resolution provided' : 'Manual resolution skipped',
      });
    }

    return resolved ?? undefined;
  }

  /**
   * Default merge logic for different value types
   */
  private defaultMerge(
    namespace: StorageNamespace,
    localValue: unknown,
    remoteValue: unknown
  ): unknown {
    // Handle specific namespaces
    if (namespace === 'patterns') {
      return this.mergePatterns(localValue, remoteValue);
    }

    // Generic merge for objects
    if (this.isObject(localValue) && this.isObject(remoteValue)) {
      return this.deepMerge(
        localValue as Record<string, unknown>,
        remoteValue as Record<string, unknown>
      );
    }

    // For arrays, concatenate and dedupe
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      return this.mergeArrays(localValue, remoteValue);
    }

    // For primitives, prefer remote (could be local based on config)
    return remoteValue;
  }

  /**
   * Merge patterns - keep both if different, merge by timestamp
   */
  private mergePatterns(localValue: unknown, remoteValue: unknown): unknown {
    if (!this.isObject(localValue) || !this.isObject(remoteValue)) {
      return remoteValue;
    }

    const local = localValue as Record<string, unknown>;
    const remote = remoteValue as Record<string, unknown>;

    // For patterns, merge by keeping all unique entries
    // If same ID, keep the one with newer timestamp
    const merged: Record<string, unknown> = { ...local };

    for (const [key, value] of Object.entries(remote)) {
      if (!(key in merged)) {
        merged[key] = value;
      } else {
        // Compare timestamps if available
        const localItem = merged[key] as Record<string, unknown>;
        const remoteItem = value as Record<string, unknown>;

        if (localItem?.updatedAt && remoteItem?.updatedAt) {
          if ((remoteItem.updatedAt as number) > (localItem.updatedAt as number)) {
            merged[key] = value;
          }
        }
      }
    }

    return merged;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (this.isObject(value) && this.isObject(result[key])) {
        result[key] = this.deepMerge(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Merge arrays by concatenating and deduplicating
   */
  private mergeArrays(local: unknown[], remote: unknown[]): unknown[] {
    const combined = [...local];

    for (const item of remote) {
      // Check if item already exists (by JSON comparison for objects)
      const itemJson = JSON.stringify(item);
      const exists = combined.some((c) => JSON.stringify(c) === itemJson);

      if (!exists) {
        combined.push(item);
      }
    }

    return combined;
  }

  /**
   * Check if value is a plain object
   */
  private isObject(value: unknown): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Create a conflict object
   */
  private createConflict(local: StorageEntry, remote: StorageEntry): Conflict {
    // Determine conflict type
    let type: ConflictType = 'value-mismatch';

    if (local.schemaVersion !== remote.schemaVersion) {
      type = 'schema-mismatch';
    } else if (
      Math.abs(local.updatedAt - remote.updatedAt) < 5000 // Within 5 seconds
    ) {
      type = 'concurrent-edit';
    }

    return {
      id: this.generateConflictId(),
      type,
      namespace: local.namespace,
      key: local.key,
      localEntry: local,
      remoteEntry: remote,
      detectedAt: Date.now(),
    };
  }

  /**
   * Generate a unique conflict ID
   */
  private generateConflictId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `conflict-${timestamp}-${random}`;
  }

  /**
   * Add resolution to history
   */
  private addToHistory(resolution: ConflictResolution): void {
    this.resolutionHistory.push(resolution);

    // Trim history if too large
    if (this.resolutionHistory.length > ConflictResolver.MAX_HISTORY_SIZE) {
      this.resolutionHistory = this.resolutionHistory.slice(-ConflictResolver.MAX_HISTORY_SIZE);
    }
  }

  /**
   * Log message for debugging
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.debugMode) {
      const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
      console.log(`[ConflictResolver] ${prefix} ${message}`);
    }
  }
}

/**
 * Create a ConflictResolver instance
 */
export function createConflictResolver(config?: ConflictResolverConfig): ConflictResolver {
  return new ConflictResolver(config);
}

/**
 * Default merge function for patterns
 * Keeps both entries if different, merges by timestamp
 */
export function defaultPatternMergeFn<T extends { id?: string; updatedAt?: number }>(
  local: T,
  remote: T,
  context: MergeContext
): T {
  // If both have IDs and they differ, this is unexpected
  if (local.id && remote.id && local.id !== remote.id) {
    // Return remote as it might be the newer canonical version
    return remote;
  }

  // Merge by timestamp - newer properties win
  const localTs = local.updatedAt ?? context.localTimestamp;
  const remoteTs = remote.updatedAt ?? context.remoteTimestamp;

  if (remoteTs > localTs) {
    return { ...local, ...remote, updatedAt: Date.now() };
  }

  return { ...remote, ...local, updatedAt: Date.now() };
}

/**
 * Merge function for test history
 * Concatenates arrays and keeps unique entries
 */
export function defaultTestHistoryMergeFn<T extends { id?: string }>(
  local: T[],
  remote: T[],
  _context: MergeContext
): T[] {
  if (!Array.isArray(local) || !Array.isArray(remote)) {
    return remote as T[];
  }

  const merged: T[] = [...local];
  const localIds = new Set(local.map((item) => item.id).filter(Boolean));

  for (const item of remote) {
    if (!item.id || !localIds.has(item.id)) {
      merged.push(item);
    }
  }

  return merged;
}
