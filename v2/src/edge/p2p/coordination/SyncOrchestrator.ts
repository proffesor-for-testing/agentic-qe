/**
 * Sync Orchestrator for Pattern Synchronization
 *
 * Orchestrates pattern synchronization between peers including
 * initial sync, incremental updates, conflict resolution, and progress tracking.
 *
 * @module edge/p2p/coordination/SyncOrchestrator
 * @version 1.0.0
 */

import type { PeerId } from '../webrtc/types';
import type { SharedPattern, VectorClock, PatternConflict, ConflictResolution } from '../sharing/types';
import type {
  SyncStatus,
  SyncConfig,
  CoordinationMessage,
} from './types';
import {
  CoordinationMessageType,
  CoordinationErrorCode,
  CoordinationError,
  generateMessageId,
  createDefaultSyncStatus,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Sync orchestrator configuration
 */
export interface SyncOrchestratorConfig {
  /** Local agent ID */
  localAgentId: string;

  /** Remote peer ID */
  peerId: PeerId;

  /** Sync configuration */
  config: SyncConfig;

  /** Message send callback */
  sendMessage: (message: CoordinationMessage) => Promise<void>;

  /** Progress update callback */
  onSyncProgress: (status: SyncStatus) => void;

  /** Conflict detected callback */
  onConflict?: (conflict: PatternConflict) => void;

  /** Pattern received callback */
  onPatternReceived?: (pattern: SharedPattern) => void;

  /** Enable logging */
  enableLogging?: boolean;
}

/**
 * Sync request payload
 */
interface SyncRequestPayload {
  /** Request ID */
  requestId: string;

  /** Vector clocks for incremental sync */
  vectorClocks?: Record<string, VectorClock>;

  /** Pattern IDs to request (if specific) */
  patternIds?: string[];

  /** Query for patterns */
  query?: {
    categories?: string[];
    tags?: string[];
    minQuality?: string;
    limit?: number;
  };

  /** Whether to include pattern content */
  includeContent: boolean;

  /** Batch size for response */
  batchSize: number;

  /** Continuation token for pagination */
  continuationToken?: string;
}

/**
 * Sync response payload
 */
interface SyncResponsePayload {
  /** Request ID this responds to */
  requestId: string;

  /** Patterns in this batch */
  patterns: SharedPattern[];

  /** Conflicts detected */
  conflicts?: PatternConflict[];

  /** Vector clocks of patterns */
  vectorClocks: Record<string, VectorClock>;

  /** Total patterns available */
  totalPatterns: number;

  /** Whether more patterns are available */
  hasMore: boolean;

  /** Continuation token for next batch */
  continuationToken?: string;

  /** Batch number */
  batchNumber: number;

  /** Total batches */
  totalBatches: number;
}

/**
 * Pattern batch payload
 */
interface PatternBatchPayload {
  /** Batch ID */
  batchId: string;

  /** Request ID this belongs to */
  requestId: string;

  /** Patterns in this batch */
  patterns: SharedPattern[];

  /** Batch number */
  batchNumber: number;

  /** Total batches */
  totalBatches: number;

  /** Is final batch */
  isFinal: boolean;
}

/**
 * Sync complete payload
 */
interface SyncCompletePayload {
  /** Request ID */
  requestId: string;

  /** Total patterns synced */
  totalPatterns: number;

  /** Conflicts resolved */
  conflictsResolved: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Success flag */
  success: boolean;

  /** Error if failed */
  error?: string;
}

/**
 * Active sync session
 */
interface SyncSession {
  /** Session ID */
  sessionId: string;

  /** Direction */
  direction: 'push' | 'pull';

  /** Start time */
  startedAt: number;

  /** Patterns to sync */
  patterns: SharedPattern[];

  /** Patterns synced so far */
  syncedPatterns: SharedPattern[];

  /** Current batch number */
  currentBatch: number;

  /** Total batches */
  totalBatches: number;

  /** Conflicts detected */
  conflicts: PatternConflict[];

  /** Conflicts resolved */
  resolvedConflicts: number;

  /** Promise resolve */
  resolve: (status: SyncStatus) => void;

  /** Promise reject */
  reject: (error: Error) => void;

  /** Timeout handle */
  timeout: ReturnType<typeof setTimeout>;
}

// ============================================
// Sync Orchestrator Class
// ============================================

/**
 * SyncOrchestrator - Orchestrates pattern synchronization
 *
 * @example
 * ```typescript
 * const orchestrator = new SyncOrchestrator({
 *   localAgentId: 'local',
 *   peerId: 'peer-123',
 *   config: syncConfig,
 *   sendMessage: async (msg) => await channel.send(msg),
 *   onSyncProgress: (status) => console.log('Progress:', status.progressPercent),
 * });
 *
 * // Start sync with local patterns
 * const result = await orchestrator.startSync(localPatterns);
 * console.log('Synced:', result.syncedPatterns);
 *
 * // Handle incoming sync messages
 * orchestrator.handleMessage(message);
 * ```
 */
export class SyncOrchestrator {
  private readonly localAgentId: string;
  private readonly peerId: PeerId;
  private readonly config: SyncConfig;
  private readonly sendMessage: (message: CoordinationMessage) => Promise<void>;
  private readonly onSyncProgress: (status: SyncStatus) => void;
  private readonly onConflict?: (conflict: PatternConflict) => void;
  private readonly onPatternReceived?: (pattern: SharedPattern) => void;

  // Local pattern storage for sync
  private localPatterns: Map<string, SharedPattern> = new Map();
  private localVectorClocks: Map<string, VectorClock> = new Map();

  // Active sessions
  private activeSession?: SyncSession;
  private pendingRequests: Map<string, SyncSession> = new Map();

  // State
  private currentStatus: SyncStatus;
  private isRunning = false;
  private syncInterval?: ReturnType<typeof setInterval>;

  // Logging
  private log: (...args: unknown[]) => void;

  /**
   * Create a new SyncOrchestrator
   */
  constructor(config: SyncOrchestratorConfig) {
    this.localAgentId = config.localAgentId;
    this.peerId = config.peerId;
    this.config = config.config;
    this.sendMessage = config.sendMessage;
    this.onSyncProgress = config.onSyncProgress;
    this.onConflict = config.onConflict;
    this.onPatternReceived = config.onPatternReceived;

    this.currentStatus = createDefaultSyncStatus();

    this.log = config.enableLogging
      ? (...args) => console.log(`[SyncOrchestrator:${this.peerId}]`, ...args)
      : () => {};
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Start a sync operation
   *
   * @param patterns - Local patterns to sync
   * @returns Promise resolving to final sync status
   */
  async startSync(patterns?: SharedPattern[]): Promise<SyncStatus> {
    if (this.activeSession) {
      throw new CoordinationError(
        'Sync already in progress',
        CoordinationErrorCode.SYNC_FAILED,
        this.peerId
      );
    }

    // Store local patterns
    if (patterns) {
      for (const pattern of patterns) {
        this.localPatterns.set(pattern.id, pattern);
        this.localVectorClocks.set(pattern.id, pattern.version.vectorClock);
      }
    }

    this.log(`Starting sync with ${this.localPatterns.size} local patterns`);

    // Create sync session
    const sessionId = generateMessageId();
    const startedAt = Date.now();

    this.currentStatus = {
      state: 'syncing',
      totalPatterns: this.localPatterns.size,
      syncedPatterns: 0,
      pendingPatterns: this.localPatterns.size,
      conflicts: 0,
      conflictsResolved: 0,
      startedAt: new Date(startedAt).toISOString(),
      progressPercent: 0,
      direction: 'bidirectional',
      bytesTransferred: 0,
      patternsPerSecond: 0,
    };

    this.onSyncProgress(this.currentStatus);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handleSyncTimeout(sessionId);
      }, this.config.syncTimeout);

      this.activeSession = {
        sessionId,
        direction: 'pull',
        startedAt,
        patterns: patterns ?? [],
        syncedPatterns: [],
        currentBatch: 0,
        totalBatches: 0,
        conflicts: [],
        resolvedConflicts: 0,
        resolve,
        reject,
        timeout,
      };

      // Send sync request
      this.sendSyncRequest(sessionId).catch((error) => {
        this.log('Failed to send sync request:', error);
        this.completeSync(false, error.message);
      });
    });
  }

  /**
   * Request specific patterns
   */
  async requestPatterns(patternIds: string[]): Promise<SharedPattern[]> {
    const sessionId = generateMessageId();

    const payload: SyncRequestPayload = {
      requestId: sessionId,
      patternIds,
      includeContent: true,
      batchSize: this.config.batchSize,
    };

    await this.sendMessage({
      type: CoordinationMessageType.SYNC_REQUEST,
      messageId: generateMessageId(),
      senderId: this.localAgentId,
      payload,
      timestamp: Date.now(),
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(sessionId);
        reject(new Error('Pattern request timeout'));
      }, this.config.syncTimeout);

      const session: SyncSession = {
        sessionId,
        direction: 'pull',
        startedAt: Date.now(),
        patterns: [],
        syncedPatterns: [],
        currentBatch: 0,
        totalBatches: 0,
        conflicts: [],
        resolvedConflicts: 0,
        resolve: (status) => {
          const receivedPatterns = Array.from(this.localPatterns.values())
            .filter((p) => patternIds.includes(p.id));
          resolve(receivedPatterns);
        },
        reject,
        timeout,
      };

      this.pendingRequests.set(sessionId, session);
    });
  }

  /**
   * Push patterns to peer
   */
  async pushPatterns(patterns: SharedPattern[]): Promise<void> {
    if (patterns.length === 0) {
      return;
    }

    this.log(`Pushing ${patterns.length} patterns`);

    const batchSize = this.config.batchSize;
    const totalBatches = Math.ceil(patterns.length / batchSize);
    const requestId = generateMessageId();

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, patterns.length);
      const batch = patterns.slice(start, end);

      const payload: PatternBatchPayload = {
        batchId: generateMessageId(),
        requestId,
        patterns: batch,
        batchNumber: i + 1,
        totalBatches,
        isFinal: i === totalBatches - 1,
      };

      await this.sendMessage({
        type: CoordinationMessageType.PATTERN_BATCH,
        messageId: generateMessageId(),
        senderId: this.localAgentId,
        payload,
        timestamp: Date.now(),
      });

      // Update status
      this.updateProgress({
        syncedPatterns: this.currentStatus.syncedPatterns + batch.length,
        bytesTransferred: this.currentStatus.bytesTransferred + JSON.stringify(batch).length,
        direction: 'push',
      });
    }
  }

  /**
   * Handle incoming sync message
   */
  async handleMessage(message: CoordinationMessage): Promise<void> {
    switch (message.type) {
      case CoordinationMessageType.SYNC_REQUEST:
        await this.handleSyncRequest(message.payload as SyncRequestPayload);
        break;

      case CoordinationMessageType.SYNC_RESPONSE:
        await this.handleSyncResponse(message.payload as SyncResponsePayload);
        break;

      case CoordinationMessageType.PATTERN_BATCH:
        await this.handlePatternBatch(message.payload as PatternBatchPayload);
        break;

      case CoordinationMessageType.SYNC_COMPLETE:
        await this.handleSyncComplete(message.payload as SyncCompletePayload);
        break;

      case CoordinationMessageType.CONFLICT:
        await this.handleConflictMessage(message.payload as PatternConflict);
        break;
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.currentStatus };
  }

  /**
   * Check if sync is in progress
   */
  isSyncing(): boolean {
    return this.currentStatus.state === 'syncing';
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(patterns: SharedPattern[]): void {
    if (this.config.syncInterval <= 0) {
      return;
    }

    this.isRunning = true;

    // Store patterns for periodic sync
    for (const pattern of patterns) {
      this.localPatterns.set(pattern.id, pattern);
    }

    this.syncInterval = setInterval(async () => {
      if (!this.activeSession && this.isRunning) {
        try {
          await this.startSync(Array.from(this.localPatterns.values()));
        } catch (error) {
          this.log('Periodic sync failed:', error);
        }
      }
    }, this.config.syncInterval);
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    // Cancel active session
    if (this.activeSession) {
      clearTimeout(this.activeSession.timeout);
      this.activeSession.reject(new Error('Sync cancelled'));
      this.activeSession = undefined;
    }

    // Cancel pending requests
    this.pendingRequests.forEach((session) => {
      clearTimeout(session.timeout);
      session.reject(new Error('Sync cancelled'));
    });
    this.pendingRequests.clear();
  }

  /**
   * Add or update local pattern
   */
  addLocalPattern(pattern: SharedPattern): void {
    this.localPatterns.set(pattern.id, pattern);
    this.localVectorClocks.set(pattern.id, pattern.version.vectorClock);
  }

  /**
   * Remove local pattern
   */
  removeLocalPattern(patternId: string): void {
    this.localPatterns.delete(patternId);
    this.localVectorClocks.delete(patternId);
  }

  /**
   * Get received patterns
   */
  getReceivedPatterns(): SharedPattern[] {
    return this.activeSession?.syncedPatterns ?? [];
  }

  // ============================================
  // Private - Message Handlers
  // ============================================

  private async handleSyncRequest(payload: SyncRequestPayload): Promise<void> {
    this.log(`Received sync request: ${payload.requestId}`);

    // Determine patterns to send
    let patternsToSend: SharedPattern[] = [];
    const conflicts: PatternConflict[] = [];

    if (payload.patternIds) {
      // Specific patterns requested
      patternsToSend = payload.patternIds
        .map((id) => this.localPatterns.get(id))
        .filter((p): p is SharedPattern => p !== undefined);
    } else {
      // All patterns or query-based
      patternsToSend = Array.from(this.localPatterns.values());

      // Apply query filters if provided
      if (payload.query) {
        patternsToSend = this.applyQueryFilters(patternsToSend, payload.query);
      }

      // Check for conflicts using vector clocks
      if (payload.vectorClocks && this.config.incrementalSync) {
        const { toSend, conflictsFound } = this.checkForConflicts(
          patternsToSend,
          payload.vectorClocks
        );
        patternsToSend = toSend;
        conflicts.push(...conflictsFound);
      }
    }

    // Limit patterns
    if (patternsToSend.length > this.config.maxPatternsPerSync) {
      patternsToSend = patternsToSend.slice(0, this.config.maxPatternsPerSync);
    }

    // Collect vector clocks
    const vectorClocks: Record<string, VectorClock> = {};
    for (const pattern of patternsToSend) {
      vectorClocks[pattern.id] = pattern.version.vectorClock;
    }

    // Calculate batches
    const batchSize = Math.min(payload.batchSize, this.config.batchSize);
    const totalBatches = Math.ceil(patternsToSend.length / batchSize);

    // Send first batch as response
    const firstBatch = patternsToSend.slice(0, batchSize);
    const hasMore = patternsToSend.length > batchSize;

    const response: SyncResponsePayload = {
      requestId: payload.requestId,
      patterns: firstBatch,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      vectorClocks,
      totalPatterns: patternsToSend.length,
      hasMore,
      continuationToken: hasMore ? this.generateContinuationToken(payload.requestId, 1) : undefined,
      batchNumber: 1,
      totalBatches,
    };

    await this.sendMessage({
      type: CoordinationMessageType.SYNC_RESPONSE,
      messageId: generateMessageId(),
      correlationId: payload.requestId,
      senderId: this.localAgentId,
      payload: response,
      timestamp: Date.now(),
    });

    // Send remaining batches
    if (hasMore) {
      await this.sendRemainingBatches(payload.requestId, patternsToSend.slice(batchSize), 2, totalBatches);
    }
  }

  private async handleSyncResponse(payload: SyncResponsePayload): Promise<void> {
    const session = this.activeSession ?? this.pendingRequests.get(payload.requestId);
    if (!session) {
      this.log(`Received response for unknown request: ${payload.requestId}`);
      return;
    }

    this.log(`Received sync response: batch ${payload.batchNumber}/${payload.totalBatches}`);

    // Process received patterns
    for (const pattern of payload.patterns) {
      if (this.config.validatePatterns && !this.validatePattern(pattern)) {
        this.log(`Invalid pattern received: ${pattern.id}`);
        continue;
      }

      session.syncedPatterns.push(pattern);
      this.localPatterns.set(pattern.id, pattern);
      this.localVectorClocks.set(pattern.id, pattern.version.vectorClock);

      this.onPatternReceived?.(pattern);
    }

    // Track conflicts
    if (payload.conflicts) {
      session.conflicts.push(...payload.conflicts);
      for (const conflict of payload.conflicts) {
        this.onConflict?.(conflict);
      }
    }

    session.currentBatch = payload.batchNumber;
    session.totalBatches = payload.totalBatches;

    // Update progress
    this.updateProgress({
      syncedPatterns: session.syncedPatterns.length,
      pendingPatterns: payload.totalPatterns - session.syncedPatterns.length,
      conflicts: session.conflicts.length,
      totalPatterns: payload.totalPatterns,
      bytesTransferred: this.currentStatus.bytesTransferred + JSON.stringify(payload.patterns).length,
    });

    // Check if sync is complete
    if (!payload.hasMore && payload.batchNumber === payload.totalBatches) {
      // Resolve conflicts
      await this.resolveConflicts(session);

      // Send sync complete
      await this.sendSyncComplete(session, true);

      this.completeSync(true);
    }
  }

  private async handlePatternBatch(payload: PatternBatchPayload): Promise<void> {
    this.log(`Received pattern batch: ${payload.batchNumber}/${payload.totalBatches}`);

    // Process patterns
    for (const pattern of payload.patterns) {
      if (this.config.validatePatterns && !this.validatePattern(pattern)) {
        continue;
      }

      // Check for conflicts
      const existingPattern = this.localPatterns.get(pattern.id);
      if (existingPattern) {
        const conflict = this.detectConflict(existingPattern, pattern);
        if (conflict) {
          const resolution = this.resolveConflict(conflict);
          if (resolution.resolvedPattern) {
            this.localPatterns.set(pattern.id, resolution.resolvedPattern);
          }
          this.onConflict?.(conflict);
          continue;
        }
      }

      this.localPatterns.set(pattern.id, pattern);
      this.localVectorClocks.set(pattern.id, pattern.version.vectorClock);
      this.onPatternReceived?.(pattern);
    }

    // Update progress
    this.updateProgress({
      syncedPatterns: this.currentStatus.syncedPatterns + payload.patterns.length,
      bytesTransferred: this.currentStatus.bytesTransferred + JSON.stringify(payload.patterns).length,
    });

    // Check if this is the final batch
    if (payload.isFinal) {
      if (this.activeSession) {
        await this.sendSyncComplete(this.activeSession, true);
        this.completeSync(true);
      }
    }
  }

  private async handleSyncComplete(payload: SyncCompletePayload): Promise<void> {
    this.log(`Sync complete: ${payload.success ? 'success' : 'failed'}`);

    if (!payload.success && this.activeSession) {
      this.completeSync(false, payload.error);
      return;
    }

    // If we were the responder, sync is now complete
    const session = this.pendingRequests.get(payload.requestId);
    if (session) {
      clearTimeout(session.timeout);
      this.pendingRequests.delete(payload.requestId);

      const finalStatus: SyncStatus = {
        ...this.currentStatus,
        state: 'completed',
        completedAt: new Date().toISOString(),
        conflictsResolved: session.resolvedConflicts,
      };

      session.resolve(finalStatus);
    }
  }

  private async handleConflictMessage(conflict: PatternConflict): Promise<void> {
    this.log(`Received conflict notification: ${conflict.patternId}`);

    if (this.activeSession) {
      this.activeSession.conflicts.push(conflict);
    }

    this.onConflict?.(conflict);

    // Resolve conflict
    const resolution = this.resolveConflict(conflict);

    if (resolution.resolvedPattern) {
      this.localPatterns.set(conflict.patternId, resolution.resolvedPattern);
    }
  }

  // ============================================
  // Private - Sync Operations
  // ============================================

  private async sendSyncRequest(sessionId: string): Promise<void> {
    const vectorClocks: Record<string, VectorClock> = {};

    if (this.config.incrementalSync) {
      this.localVectorClocks.forEach((clock, id) => {
        vectorClocks[id] = clock;
      });
    }

    const payload: SyncRequestPayload = {
      requestId: sessionId,
      vectorClocks: Object.keys(vectorClocks).length > 0 ? vectorClocks : undefined,
      includeContent: true,
      batchSize: this.config.batchSize,
    };

    await this.sendMessage({
      type: CoordinationMessageType.SYNC_REQUEST,
      messageId: generateMessageId(),
      senderId: this.localAgentId,
      payload,
      timestamp: Date.now(),
    });
  }

  private async sendRemainingBatches(
    requestId: string,
    patterns: SharedPattern[],
    startBatch: number,
    totalBatches: number
  ): Promise<void> {
    const batchSize = this.config.batchSize;
    let batchNumber = startBatch;

    for (let i = 0; i < patterns.length; i += batchSize) {
      const batch = patterns.slice(i, i + batchSize);
      const isFinal = batchNumber === totalBatches;

      const payload: PatternBatchPayload = {
        batchId: generateMessageId(),
        requestId,
        patterns: batch,
        batchNumber,
        totalBatches,
        isFinal,
      };

      await this.sendMessage({
        type: CoordinationMessageType.PATTERN_BATCH,
        messageId: generateMessageId(),
        senderId: this.localAgentId,
        payload,
        timestamp: Date.now(),
      });

      batchNumber++;
    }
  }

  private async sendSyncComplete(session: SyncSession, success: boolean): Promise<void> {
    const durationMs = Date.now() - session.startedAt;

    const payload: SyncCompletePayload = {
      requestId: session.sessionId,
      totalPatterns: session.syncedPatterns.length,
      conflictsResolved: session.resolvedConflicts,
      durationMs,
      success,
    };

    await this.sendMessage({
      type: CoordinationMessageType.SYNC_COMPLETE,
      messageId: generateMessageId(),
      senderId: this.localAgentId,
      payload,
      timestamp: Date.now(),
    });
  }

  private completeSync(success: boolean, error?: string): void {
    if (!this.activeSession) {
      return;
    }

    clearTimeout(this.activeSession.timeout);

    const durationMs = Date.now() - this.activeSession.startedAt;
    const patternsPerSecond = durationMs > 0
      ? (this.activeSession.syncedPatterns.length / durationMs) * 1000
      : 0;

    const finalStatus: SyncStatus = {
      state: success ? 'completed' : 'failed',
      totalPatterns: this.activeSession.syncedPatterns.length + this.activeSession.conflicts.length,
      syncedPatterns: this.activeSession.syncedPatterns.length,
      pendingPatterns: 0,
      conflicts: this.activeSession.conflicts.length,
      conflictsResolved: this.activeSession.resolvedConflicts,
      startedAt: new Date(this.activeSession.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      progressPercent: 100,
      estimatedTimeRemaining: 0,
      lastError: error,
      direction: this.activeSession.direction,
      bytesTransferred: this.currentStatus.bytesTransferred,
      patternsPerSecond,
    };

    this.currentStatus = finalStatus;
    this.onSyncProgress(finalStatus);

    if (success) {
      this.activeSession.resolve(finalStatus);
    } else {
      this.activeSession.reject(new Error(error ?? 'Sync failed'));
    }

    this.activeSession = undefined;
  }

  private handleSyncTimeout(sessionId: string): void {
    if (this.activeSession?.sessionId === sessionId) {
      this.log('Sync timeout');
      this.completeSync(false, 'Sync timeout');
    }
  }

  // ============================================
  // Private - Conflict Resolution
  // ============================================

  private checkForConflicts(
    patterns: SharedPattern[],
    remoteClocks: Record<string, VectorClock>
  ): { toSend: SharedPattern[]; conflictsFound: PatternConflict[] } {
    const toSend: SharedPattern[] = [];
    const conflictsFound: PatternConflict[] = [];

    for (const pattern of patterns) {
      const remoteClock = remoteClocks[pattern.id];

      if (!remoteClock) {
        // Remote doesn't have this pattern, send it
        toSend.push(pattern);
        continue;
      }

      const comparison = this.compareVectorClocks(pattern.version.vectorClock, remoteClock);

      if (comparison === 'after') {
        // Local is newer, send it
        toSend.push(pattern);
      } else if (comparison === 'concurrent') {
        // Conflict detected
        conflictsFound.push({
          patternId: pattern.id,
          localVersion: pattern.version,
          remoteVersion: { ...pattern.version, vectorClock: remoteClock },
          conflictType: 'concurrent_update',
        });
        // Still send local version, let receiver resolve
        toSend.push(pattern);
      }
      // If 'before' or 'equal', don't send (remote has same or newer)
    }

    return { toSend, conflictsFound };
  }

  private detectConflict(local: SharedPattern, remote: SharedPattern): PatternConflict | null {
    const comparison = this.compareVectorClocks(
      local.version.vectorClock,
      remote.version.vectorClock
    );

    if (comparison === 'concurrent') {
      return {
        patternId: local.id,
        localVersion: local.version,
        remoteVersion: remote.version,
        conflictType: 'concurrent_update',
      };
    }

    return null;
  }

  private async resolveConflicts(session: SyncSession): Promise<void> {
    for (const conflict of session.conflicts) {
      const resolution = this.resolveConflict(conflict);

      if (resolution.resolvedPattern) {
        this.localPatterns.set(conflict.patternId, resolution.resolvedPattern);
        session.resolvedConflicts++;
      }
    }
  }

  private resolveConflict(conflict: PatternConflict): ConflictResolution {
    const localPattern = this.localPatterns.get(conflict.patternId);

    switch (this.config.conflictStrategy) {
      case 'latest_wins': {
        // Compare update timestamps
        if (localPattern) {
          const localTime = new Date(localPattern.updatedAt).getTime();
          // For remote, we don't have full pattern, use vector clock logic
          // Prefer local in case of concurrent updates with same timestamp
          return {
            strategy: 'latest_wins',
            resolvedPattern: localPattern,
            resolvedAt: new Date().toISOString(),
          };
        }
        break;
      }

      case 'prefer_local':
        return {
          strategy: 'prefer_local',
          resolvedPattern: localPattern,
          resolvedAt: new Date().toISOString(),
        };

      case 'prefer_remote':
        return {
          strategy: 'prefer_remote',
          // We would need the remote pattern here
          resolvedAt: new Date().toISOString(),
        };

      case 'merge':
        // Merge requires both patterns, fall back to latest_wins for now
        return {
          strategy: 'merge',
          resolvedPattern: localPattern,
          resolvedAt: new Date().toISOString(),
        };
    }

    return {
      strategy: 'latest_wins',
      resolvedAt: new Date().toISOString(),
    };
  }

  private compareVectorClocks(a: VectorClock, b: VectorClock): 'before' | 'after' | 'equal' | 'concurrent' {
    const allAgents = Array.from(new Set([...Object.keys(a.clock), ...Object.keys(b.clock)]));

    let aBeforeB = false;
    let bBeforeA = false;

    for (let i = 0; i < allAgents.length; i++) {
      const agent = allAgents[i];
      const aVal = a.clock[agent] ?? 0;
      const bVal = b.clock[agent] ?? 0;

      if (aVal < bVal) {
        aBeforeB = true;
      }
      if (bVal < aVal) {
        bBeforeA = true;
      }
    }

    if (aBeforeB && bBeforeA) {
      return 'concurrent';
    }
    if (aBeforeB) {
      return 'before';
    }
    if (bBeforeA) {
      return 'after';
    }
    return 'equal';
  }

  // ============================================
  // Private - Utilities
  // ============================================

  private applyQueryFilters(
    patterns: SharedPattern[],
    query: { categories?: string[]; tags?: string[]; minQuality?: string; limit?: number }
  ): SharedPattern[] {
    let filtered = patterns;

    if (query.categories && query.categories.length > 0) {
      filtered = filtered.filter((p) => query.categories!.includes(p.category));
    }

    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter((p) =>
        p.metadata.tags?.some((t) => query.tags!.includes(t))
      );
    }

    if (query.limit && query.limit > 0) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }

  private validatePattern(pattern: SharedPattern): boolean {
    // Basic validation
    if (!pattern.id || !pattern.category || !pattern.content) {
      return false;
    }

    if (!pattern.version?.vectorClock) {
      return false;
    }

    if (!Array.isArray(pattern.embedding) && !(pattern.embedding instanceof Float32Array)) {
      return false;
    }

    return true;
  }

  private updateProgress(updates: Partial<SyncStatus>): void {
    const now = Date.now();
    const startTime = this.activeSession?.startedAt ?? now;
    const elapsed = now - startTime;

    const totalPatterns = updates.totalPatterns ?? this.currentStatus.totalPatterns;
    const syncedPatterns = updates.syncedPatterns ?? this.currentStatus.syncedPatterns;
    const pendingPatterns = updates.pendingPatterns ?? Math.max(0, totalPatterns - syncedPatterns);

    const progressPercent = totalPatterns > 0
      ? Math.min(100, Math.round((syncedPatterns / totalPatterns) * 100))
      : 0;

    const patternsPerSecond = elapsed > 0 ? (syncedPatterns / elapsed) * 1000 : 0;

    const estimatedTimeRemaining = patternsPerSecond > 0
      ? Math.round((pendingPatterns / patternsPerSecond) * 1000)
      : undefined;

    this.currentStatus = {
      ...this.currentStatus,
      ...updates,
      syncedPatterns,
      pendingPatterns,
      progressPercent,
      patternsPerSecond,
      estimatedTimeRemaining,
    };

    this.onSyncProgress(this.currentStatus);
  }

  private generateContinuationToken(requestId: string, nextBatch: number): string {
    const data = JSON.stringify({ requestId, nextBatch, timestamp: Date.now() });
    // Simple base64 encoding - in production, use signed tokens
    return btoa(data);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new SyncOrchestrator instance
 */
export function createSyncOrchestrator(config: SyncOrchestratorConfig): SyncOrchestrator {
  return new SyncOrchestrator(config);
}
