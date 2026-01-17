/**
 * Pattern Sync Manager for P2P Synchronization
 *
 * Manages pattern synchronization between peers including pull/push operations,
 * incremental sync using vector clocks, conflict resolution, and bandwidth management.
 *
 * @module edge/p2p/sharing/PatternSyncManager
 * @version 1.0.0
 */

import type { AgentChannel } from '../protocol';
import type {
  SharedPattern,
  PatternQuery,
  PatternSyncRequest,
  PatternSyncResponse,
  PatternConflict,
  ConflictResolution,
  PatternVersion,
  VectorClock,
  PatternSyncState,
  BandwidthConfig,
  SharingEvent,
  SharingEventHandler,
  PatternSignature,
} from './types';
import {
  SyncStatus,
  SharingError,
  SharingErrorCode,
  SharingEventType,
  DEFAULT_BANDWIDTH_CONFIG,
  MAX_BATCH_SIZE,
} from './types';
import { PatternIndex } from './PatternIndex';
import { PatternSerializer } from './PatternSerializer';

// ============================================
// Types
// ============================================

/**
 * Sync manager configuration
 */
export interface PatternSyncManagerConfig {
  /** Local agent ID */
  localAgentId: string;

  /** Pattern index to sync */
  index: PatternIndex;

  /** Communication channel */
  channel?: AgentChannel;

  /** Bandwidth configuration */
  bandwidth?: Partial<BandwidthConfig>;

  /** Conflict resolution strategy */
  conflictStrategy?: 'latest_wins' | 'prefer_local' | 'prefer_remote' | 'manual';

  /** Auto-sync interval (ms), 0 to disable */
  autoSyncInterval?: number;

  /** Maximum patterns per sync batch */
  maxBatchSize?: number;

  /** Enable signature verification */
  verifySignatures?: boolean;
}

/**
 * Sync session tracking
 */
interface SyncSession {
  sessionId: string;
  peerId: string;
  direction: 'pull' | 'push';
  startTime: number;
  patternsTransferred: number;
  bytesTransferred: number;
  status: SyncStatus;
  error?: string;
}

/**
 * Pending sync request
 */
interface PendingSync {
  requestId: string;
  peerId: string;
  resolve: (response: PatternSyncResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ============================================
// Pattern Sync Manager Class
// ============================================

/**
 * Manages pattern synchronization between P2P peers
 *
 * @example
 * ```typescript
 * const syncManager = new PatternSyncManager({
 *   localAgentId: 'my-agent',
 *   index: patternIndex,
 *   channel: agentChannel,
 * });
 *
 * // Pull patterns from peer
 * const patterns = await syncManager.pull('peer-agent', {
 *   categories: ['test'],
 *   limit: 50,
 * });
 *
 * // Push local patterns to peer
 * await syncManager.push('peer-agent', localPatterns);
 *
 * // Incremental sync
 * await syncManager.syncWithPeer('peer-agent');
 * ```
 */
export class PatternSyncManager {
  private localAgentId: string;
  private index: PatternIndex;
  private channel?: AgentChannel;
  private bandwidth: BandwidthConfig;
  private conflictStrategy: string;
  private maxBatchSize: number;
  private verifySignatures: boolean;

  // Serializer for pattern encoding
  private serializer: PatternSerializer;

  // Sync state tracking
  private syncStates: Map<string, PatternSyncState> = new Map();
  private activeSessions: Map<string, SyncSession> = new Map();
  private pendingSyncs: Map<string, PendingSync> = new Map();
  private vectorClocks: Map<string, VectorClock> = new Map();

  // Rate limiting
  private bytesThisSecond = 0;
  private lastRateReset = Date.now();

  // Event handlers
  private eventHandlers: SharingEventHandler[] = [];

  // Auto-sync
  private autoSyncInterval?: ReturnType<typeof setInterval>;

  constructor(config: PatternSyncManagerConfig) {
    this.localAgentId = config.localAgentId;
    this.index = config.index;
    this.channel = config.channel;
    this.bandwidth = { ...DEFAULT_BANDWIDTH_CONFIG, ...config.bandwidth };
    this.conflictStrategy = config.conflictStrategy ?? 'latest_wins';
    this.maxBatchSize = config.maxBatchSize ?? MAX_BATCH_SIZE;
    this.verifySignatures = config.verifySignatures ?? true;
    this.serializer = new PatternSerializer();

    // Setup channel handlers if provided
    if (this.channel) {
      this.setupChannelHandlers();
    }

    // Start auto-sync if configured
    if (config.autoSyncInterval && config.autoSyncInterval > 0) {
      this.startAutoSync(config.autoSyncInterval);
    }
  }

  // ============================================
  // Pull Operations
  // ============================================

  /**
   * Pull patterns from a peer
   */
  async pull(
    peerId: string,
    query?: PatternQuery
  ): Promise<SharedPattern[]> {
    if (!this.channel) {
      throw new SharingError(
        'No channel configured for sync',
        SharingErrorCode.NETWORK_ERROR
      );
    }

    const requestId = this.generateRequestId();
    const session = this.createSession(requestId, peerId, 'pull');

    try {
      // Build sync request
      const request: PatternSyncRequest = {
        requestId,
        requesterId: this.localAgentId,
        query,
        vectorClocks: this.getVectorClocksForPeer(peerId),
        timestamp: new Date().toISOString(),
        includeContent: true,
      };

      // Send request
      const response = await this.sendSyncRequest(peerId, request);

      // Process patterns
      const patterns: SharedPattern[] = [];
      for (const pattern of response.patterns) {
        await this.processReceivedPattern(pattern, peerId);
        patterns.push(pattern);
        session.patternsTransferred++;
      }

      // Handle conflicts
      if (response.conflicts && response.conflicts.length > 0) {
        for (const conflict of response.conflicts) {
          await this.resolveConflict(conflict, peerId);
        }
      }

      // Update sync state
      this.updateSyncState(peerId, SyncStatus.SYNCED, patterns.map((p) => p.id));
      session.status = SyncStatus.SYNCED;

      this.emit({
        type: SharingEventType.SYNC_COMPLETED,
        timestamp: Date.now(),
        details: {
          peerId,
          direction: 'pull',
          patternsReceived: patterns.length,
          conflicts: response.conflicts?.length ?? 0,
        },
      });

      return patterns;
    } catch (error) {
      session.status = SyncStatus.FAILED;
      session.error = error instanceof Error ? error.message : 'Unknown error';

      this.updateSyncState(peerId, SyncStatus.FAILED);

      this.emit({
        type: SharingEventType.SYNC_FAILED,
        timestamp: Date.now(),
        details: { peerId, direction: 'pull', error: session.error },
      });

      throw error;
    } finally {
      this.activeSessions.delete(session.sessionId);
    }
  }

  /**
   * Pull specific patterns by ID
   */
  async pullPatterns(peerId: string, patternIds: string[]): Promise<SharedPattern[]> {
    if (!this.channel) {
      throw new SharingError(
        'No channel configured for sync',
        SharingErrorCode.NETWORK_ERROR
      );
    }

    const requestId = this.generateRequestId();
    const session = this.createSession(requestId, peerId, 'pull');

    try {
      const request: PatternSyncRequest = {
        requestId,
        requesterId: this.localAgentId,
        patternIds,
        timestamp: new Date().toISOString(),
        includeContent: true,
      };

      const response = await this.sendSyncRequest(peerId, request);

      const patterns: SharedPattern[] = [];
      for (const pattern of response.patterns) {
        await this.processReceivedPattern(pattern, peerId);
        patterns.push(pattern);
      }

      session.status = SyncStatus.SYNCED;
      return patterns;
    } catch (error) {
      session.status = SyncStatus.FAILED;
      throw error;
    } finally {
      this.activeSessions.delete(session.sessionId);
    }
  }

  // ============================================
  // Push Operations
  // ============================================

  /**
   * Push patterns to a peer
   */
  async push(peerId: string, patterns: SharedPattern[]): Promise<void> {
    if (!this.channel) {
      throw new SharingError(
        'No channel configured for sync',
        SharingErrorCode.NETWORK_ERROR
      );
    }

    const session = this.createSession(this.generateRequestId(), peerId, 'push');

    this.emit({
      type: SharingEventType.SYNC_STARTED,
      timestamp: Date.now(),
      details: { peerId, direction: 'push', patternCount: patterns.length },
    });

    try {
      // Send in batches respecting bandwidth limits
      const batches = this.createBatches(patterns);

      for (const batch of batches) {
        await this.waitForBandwidth(batch.length * 1024); // Estimate

        // Send batch via channel
        await this.channel.publish('pattern:sync:push', {
          senderId: this.localAgentId,
          patterns: batch,
          timestamp: new Date().toISOString(),
        });

        session.patternsTransferred += batch.length;

        // Delay between batches
        if (this.bandwidth.batchDelay > 0) {
          await this.delay(this.bandwidth.batchDelay);
        }
      }

      // Update sync state
      const patternIds = patterns.map((p) => p.id);
      this.updateSyncState(peerId, SyncStatus.SYNCED, patternIds);
      session.status = SyncStatus.SYNCED;

      this.emit({
        type: SharingEventType.SYNC_COMPLETED,
        timestamp: Date.now(),
        details: { peerId, direction: 'push', patternsSent: patterns.length },
      });
    } catch (error) {
      session.status = SyncStatus.FAILED;
      session.error = error instanceof Error ? error.message : 'Unknown error';

      this.updateSyncState(peerId, SyncStatus.FAILED);

      this.emit({
        type: SharingEventType.SYNC_FAILED,
        timestamp: Date.now(),
        details: { peerId, direction: 'push', error: session.error },
      });

      throw error;
    } finally {
      this.activeSessions.delete(session.sessionId);
    }
  }

  /**
   * Push all local patterns to peer (full sync)
   */
  async pushAll(peerId: string): Promise<void> {
    const patterns = this.index.getAll();
    await this.push(peerId, patterns);
  }

  // ============================================
  // Incremental Sync
  // ============================================

  /**
   * Perform incremental sync with a peer
   * Uses vector clocks to sync only changed patterns
   */
  async syncWithPeer(peerId: string): Promise<{
    pulled: number;
    pushed: number;
    conflicts: number;
  }> {
    if (!this.channel) {
      throw new SharingError(
        'No channel configured for sync',
        SharingErrorCode.NETWORK_ERROR
      );
    }

    this.emit({
      type: SharingEventType.SYNC_STARTED,
      timestamp: Date.now(),
      details: { peerId, direction: 'bidirectional' },
    });

    try {
      // Get peer's vector clocks
      const peerClocks = await this.getPeerVectorClocks(peerId);

      // Determine what to pull (patterns peer has that are newer)
      const toPull = this.findPatternsToPull(peerClocks);

      // Determine what to push (patterns we have that are newer)
      const toPush = this.findPatternsToPush(peerClocks);

      // Execute sync
      let pulled = 0;
      let pushed = 0;
      let conflicts = 0;

      // Pull first
      if (toPull.length > 0) {
        const pulledPatterns = await this.pullPatterns(peerId, toPull);
        pulled = pulledPatterns.length;
      }

      // Then push
      if (toPush.length > 0) {
        const patterns = toPush
          .map((id) => this.index.get(id))
          .filter((p): p is SharedPattern => p !== undefined);
        await this.push(peerId, patterns);
        pushed = patterns.length;
      }

      // Update local vector clock
      this.updateLocalClock(peerId);

      this.emit({
        type: SharingEventType.SYNC_COMPLETED,
        timestamp: Date.now(),
        details: { peerId, pulled, pushed, conflicts },
      });

      return { pulled, pushed, conflicts };
    } catch (error) {
      this.emit({
        type: SharingEventType.SYNC_FAILED,
        timestamp: Date.now(),
        details: {
          peerId,
          error: error instanceof Error ? error.message : 'Unknown',
        },
      });
      throw error;
    }
  }

  // ============================================
  // Conflict Resolution
  // ============================================

  /**
   * Resolve a pattern conflict
   */
  async resolveConflict(
    conflict: PatternConflict,
    peerId: string
  ): Promise<ConflictResolution> {
    this.emit({
      type: SharingEventType.CONFLICT_DETECTED,
      timestamp: Date.now(),
      details: { conflict, peerId },
    });

    let resolution: ConflictResolution;

    switch (this.conflictStrategy) {
      case 'latest_wins':
        resolution = this.resolveLatestWins(conflict);
        break;

      case 'prefer_local':
        resolution = this.resolvePreferLocal(conflict);
        break;

      case 'prefer_remote':
        resolution = await this.resolvePreferRemote(conflict, peerId);
        break;

      case 'manual':
      default:
        resolution = {
          strategy: 'manual',
          resolvedAt: new Date().toISOString(),
        };
        break;
    }

    // Apply resolution if we have a resolved pattern
    if (resolution.resolvedPattern) {
      this.index.update(conflict.patternId, resolution.resolvedPattern);
    }

    this.emit({
      type: SharingEventType.CONFLICT_RESOLVED,
      timestamp: Date.now(),
      details: { conflict, resolution },
    });

    return resolution;
  }

  /**
   * Latest-wins conflict resolution
   */
  private resolveLatestWins(conflict: PatternConflict): ConflictResolution {
    const localPattern = this.index.get(conflict.patternId);
    if (!localPattern) {
      return {
        strategy: 'latest_wins',
        resolvedAt: new Date().toISOString(),
      };
    }

    // Compare timestamps
    const localTime = new Date(localPattern.updatedAt).getTime();
    const remoteVersion = conflict.remoteVersion;

    // Use vector clock comparison
    const comparison = this.index.compareVectorClocks(
      conflict.localVersion.vectorClock,
      conflict.remoteVersion.vectorClock
    );

    if (comparison === 'after') {
      // Local is newer, keep local
      return {
        strategy: 'latest_wins',
        resolvedPattern: localPattern,
        resolvedAt: new Date().toISOString(),
        resolvedBy: this.localAgentId,
      };
    }

    // Remote is newer or concurrent, need to fetch and use remote
    return {
      strategy: 'latest_wins',
      resolvedAt: new Date().toISOString(),
    };
  }

  /**
   * Prefer local pattern resolution
   */
  private resolvePreferLocal(conflict: PatternConflict): ConflictResolution {
    const localPattern = this.index.get(conflict.patternId);
    return {
      strategy: 'prefer_local',
      resolvedPattern: localPattern,
      resolvedAt: new Date().toISOString(),
      resolvedBy: this.localAgentId,
    };
  }

  /**
   * Prefer remote pattern resolution
   */
  private async resolvePreferRemote(
    conflict: PatternConflict,
    peerId: string
  ): Promise<ConflictResolution> {
    // Fetch the remote pattern
    const patterns = await this.pullPatterns(peerId, [conflict.patternId]);
    const remotePattern = patterns[0];

    return {
      strategy: 'prefer_remote',
      resolvedPattern: remotePattern,
      resolvedAt: new Date().toISOString(),
      resolvedBy: peerId,
    };
  }

  // ============================================
  // Request Handling
  // ============================================

  /**
   * Handle incoming sync request from a peer
   */
  async handleSyncRequest(request: PatternSyncRequest): Promise<PatternSyncResponse> {
    const patterns: SharedPattern[] = [];
    const conflicts: PatternConflict[] = [];

    if (request.patternIds) {
      // Specific patterns requested
      for (const id of request.patternIds) {
        const pattern = this.index.get(id);
        if (pattern && this.canShareWith(pattern, request.requesterId)) {
          patterns.push(pattern);
        }
      }
    } else if (request.query) {
      // Query-based request
      const results = this.index.search(request.query);
      for (const match of results.matches) {
        if (this.canShareWith(match.pattern, request.requesterId)) {
          patterns.push(match.pattern);
        }
      }
    }

    // Check for conflicts using vector clocks
    if (request.vectorClocks) {
      for (const pattern of patterns) {
        const peerClock = request.vectorClocks[pattern.id];
        if (peerClock) {
          const conflict = this.checkVectorClockConflict(pattern, peerClock);
          if (conflict) {
            conflicts.push(conflict);
          }
        }
      }
    }

    // Apply pagination
    const limit = request.query?.limit ?? this.maxBatchSize;
    const paginatedPatterns = patterns.slice(0, limit);

    return {
      requestId: request.requestId,
      responderId: this.localAgentId,
      patterns: paginatedPatterns,
      conflicts,
      hasMore: patterns.length > limit,
      continuationToken:
        patterns.length > limit ? this.generateContinuationToken() : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle incoming pushed patterns from a peer
   */
  async handlePushedPatterns(
    peerId: string,
    patterns: SharedPattern[]
  ): Promise<void> {
    for (const pattern of patterns) {
      await this.processReceivedPattern(pattern, peerId);
    }
  }

  // ============================================
  // Channel Setup
  // ============================================

  /**
   * Setup channel handlers for sync protocol
   */
  private setupChannelHandlers(): void {
    if (!this.channel) return;

    // Handle sync requests
    this.channel.onRequest<PatternSyncRequest, PatternSyncResponse>(
      'pattern:sync:request',
      async (request) => {
        return this.handleSyncRequest(request);
      }
    );

    // Handle pushed patterns
    this.channel.subscribe<{ senderId: string; patterns: SharedPattern[] }>(
      'pattern:sync:push',
      async (data) => {
        await this.handlePushedPatterns(data.senderId, data.patterns);
      }
    );

    // Handle vector clock requests
    this.channel.onRequest<{ peerId: string }, Record<string, VectorClock>>(
      'pattern:sync:clocks',
      () => {
        return this.getAllVectorClocks();
      }
    );
  }

  /**
   * Set communication channel
   */
  setChannel(channel: AgentChannel): void {
    this.channel = channel;
    this.setupChannelHandlers();
  }

  // ============================================
  // Vector Clock Management
  // ============================================

  /**
   * Get vector clocks for patterns to sync with peer
   */
  private getVectorClocksForPeer(peerId: string): Record<string, VectorClock> {
    const clocks: Record<string, VectorClock> = {};

    for (const pattern of this.index.getAll()) {
      clocks[pattern.id] = pattern.version.vectorClock;
    }

    return clocks;
  }

  /**
   * Get all local vector clocks
   */
  private getAllVectorClocks(): Record<string, VectorClock> {
    const clocks: Record<string, VectorClock> = {};

    for (const pattern of this.index.getAll()) {
      clocks[pattern.id] = pattern.version.vectorClock;
    }

    return clocks;
  }

  /**
   * Get peer's vector clocks
   */
  private async getPeerVectorClocks(
    peerId: string
  ): Promise<Record<string, VectorClock>> {
    if (!this.channel) {
      return {};
    }

    try {
      return await this.channel.request<{ peerId: string }, Record<string, VectorClock>>(
        'pattern:sync:clocks',
        { peerId: this.localAgentId }
      );
    } catch {
      return {};
    }
  }

  /**
   * Find patterns to pull based on peer's clocks
   */
  private findPatternsToPull(peerClocks: Record<string, VectorClock>): string[] {
    const toPull: string[] = [];

    for (const [patternId, peerClock] of Object.entries(peerClocks)) {
      const localPattern = this.index.get(patternId);

      if (!localPattern) {
        // Don't have it, need to pull
        toPull.push(patternId);
      } else {
        // Compare clocks
        const comparison = this.index.compareVectorClocks(
          localPattern.version.vectorClock,
          peerClock
        );
        if (comparison === 'before') {
          // Peer has newer version
          toPull.push(patternId);
        }
      }
    }

    return toPull;
  }

  /**
   * Find patterns to push based on peer's clocks
   */
  private findPatternsToPush(peerClocks: Record<string, VectorClock>): string[] {
    const toPush: string[] = [];

    for (const pattern of this.index.getAll()) {
      const peerClock = peerClocks[pattern.id];

      if (!peerClock) {
        // Peer doesn't have it
        toPush.push(pattern.id);
      } else {
        // Compare clocks
        const comparison = this.index.compareVectorClocks(
          pattern.version.vectorClock,
          peerClock
        );
        if (comparison === 'after') {
          // We have newer version
          toPush.push(pattern.id);
        }
      }
    }

    return toPush;
  }

  /**
   * Update local vector clock after sync
   */
  private updateLocalClock(peerId: string): void {
    for (const pattern of this.index.getAll()) {
      const newClock = this.index.incrementClock(
        pattern.version.vectorClock,
        this.localAgentId
      );
      this.index.update(pattern.id, {
        version: {
          ...pattern.version,
          vectorClock: newClock,
        },
      });
    }
  }

  /**
   * Check for conflict using vector clocks
   */
  private checkVectorClockConflict(
    pattern: SharedPattern,
    peerClock: VectorClock
  ): PatternConflict | null {
    const comparison = this.index.compareVectorClocks(
      pattern.version.vectorClock,
      peerClock
    );

    if (comparison === 'concurrent') {
      return {
        patternId: pattern.id,
        localVersion: pattern.version,
        remoteVersion: { ...pattern.version, vectorClock: peerClock },
        conflictType: 'concurrent_update',
      };
    }

    return null;
  }

  // ============================================
  // Sync State Management
  // ============================================

  /**
   * Get sync state for a peer
   */
  getSyncState(peerId: string): PatternSyncState | undefined {
    return this.syncStates.get(peerId);
  }

  /**
   * Get all sync states
   */
  getAllSyncStates(): Map<string, PatternSyncState> {
    return new Map(this.syncStates);
  }

  /**
   * Update sync state
   */
  private updateSyncState(
    peerId: string,
    status: SyncStatus,
    patternIds?: string[]
  ): void {
    const existing = this.syncStates.get(peerId);
    const now = new Date().toISOString();

    const state: PatternSyncState = {
      patternId: peerId, // Using peerId as the pattern sync identifier
      status,
      lastSyncAt: now,
      lastSuccessAt: status === SyncStatus.SYNCED ? now : existing?.lastSuccessAt,
      syncedPeers: patternIds ?? existing?.syncedPeers ?? [],
      pendingPeers: [],
    };

    this.syncStates.set(peerId, state);
  }

  // ============================================
  // Bandwidth Management
  // ============================================

  /**
   * Wait for available bandwidth
   */
  private async waitForBandwidth(bytes: number): Promise<void> {
    const now = Date.now();

    // Reset counter every second
    if (now - this.lastRateReset > 1000) {
      this.bytesThisSecond = 0;
      this.lastRateReset = now;
    }

    // Check if we need to wait
    if (this.bytesThisSecond + bytes > this.bandwidth.maxUploadBps) {
      const waitTime = 1000 - (now - this.lastRateReset);
      await this.delay(waitTime);
      this.bytesThisSecond = 0;
      this.lastRateReset = Date.now();
    }

    this.bytesThisSecond += bytes;
  }

  /**
   * Create batches for sending
   */
  private createBatches(patterns: SharedPattern[]): SharedPattern[][] {
    const batches: SharedPattern[][] = [];
    const batchSize = Math.min(this.maxBatchSize, this.bandwidth.batchSize);

    for (let i = 0; i < patterns.length; i += batchSize) {
      batches.push(patterns.slice(i, i + batchSize));
    }

    return batches;
  }

  // ============================================
  // Auto Sync
  // ============================================

  /**
   * Start automatic sync interval
   */
  startAutoSync(intervalMs: number): void {
    if (this.autoSyncInterval) {
      this.stopAutoSync();
    }

    this.autoSyncInterval = setInterval(() => {
      this.runAutoSync();
    }, intervalMs);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = undefined;
    }
  }

  /**
   * Run automatic sync with all known peers
   */
  private async runAutoSync(): Promise<void> {
    // Get peers from sync states
    for (const peerId of this.syncStates.keys()) {
      try {
        await this.syncWithPeer(peerId);
      } catch {
        // Log error but continue with other peers
      }
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Send sync request and wait for response
   */
  private async sendSyncRequest(
    peerId: string,
    request: PatternSyncRequest
  ): Promise<PatternSyncResponse> {
    if (!this.channel) {
      throw new SharingError(
        'No channel for sync',
        SharingErrorCode.NETWORK_ERROR
      );
    }

    return this.channel.request<PatternSyncRequest, PatternSyncResponse>(
      'pattern:sync:request',
      request,
      30000 // 30s timeout
    );
  }

  /**
   * Process a received pattern
   */
  private async processReceivedPattern(
    pattern: SharedPattern,
    fromPeer: string
  ): Promise<void> {
    // Validate pattern
    if (!this.serializer.validatePattern(pattern)) {
      throw new SharingError(
        `Invalid pattern: ${pattern.id}`,
        SharingErrorCode.INVALID_PATTERN
      );
    }

    // Check for conflicts
    const conflict = this.index.checkConflict(pattern);
    if (conflict) {
      await this.resolveConflict(conflict, fromPeer);
      return;
    }

    // Add or update pattern
    if (this.index.has(pattern.id)) {
      this.index.update(pattern.id, pattern);
    } else {
      try {
        this.index.add(pattern);
      } catch (error) {
        if (
          error instanceof SharingError &&
          error.code === SharingErrorCode.DUPLICATE_PATTERN
        ) {
          // Already exists (by content hash), skip
          return;
        }
        throw error;
      }
    }
  }

  /**
   * Check if pattern can be shared with peer
   */
  private canShareWith(pattern: SharedPattern, peerId: string): boolean {
    const { policy, allowedPeers, blockedPeers } = pattern.sharing;

    // Check blocked list
    if (blockedPeers?.includes(peerId)) {
      return false;
    }

    switch (policy) {
      case 'public':
        return true;

      case 'trusted':
        // For now, all connected peers are considered trusted
        return true;

      case 'selective':
        return allowedPeers?.includes(peerId) ?? false;

      case 'private':
        return false;

      default:
        return false;
    }
  }

  /**
   * Create a sync session
   */
  private createSession(
    sessionId: string,
    peerId: string,
    direction: 'pull' | 'push'
  ): SyncSession {
    const session: SyncSession = {
      sessionId,
      peerId,
      direction,
      startTime: Date.now(),
      patternsTransferred: 0,
      bytesTransferred: 0,
      status: SyncStatus.SYNCING,
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Generate unique request ID using cryptographically secure random
   */
  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const randomBytes = new Uint8Array(4);
    crypto.getRandomValues(randomBytes);
    const random = Array.from(randomBytes).map(b => b.toString(36)).join('').substring(0, 6);
    return `sync-${timestamp}-${random}`;
  }

  /**
   * Generate continuation token
   */
  private generateContinuationToken(): string {
    return Buffer.from(Date.now().toString()).toString('base64');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================
  // Events
  // ============================================

  /**
   * Subscribe to events
   */
  on(handler: SharingEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Unsubscribe from events
   */
  off(handler: SharingEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit an event
   */
  private emit(event: SharingEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Destroy the sync manager
   */
  destroy(): void {
    this.stopAutoSync();
    this.activeSessions.clear();
    this.pendingSyncs.clear();
    this.syncStates.clear();
    this.eventHandlers = [];
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new pattern sync manager
 */
export function createPatternSyncManager(
  config: PatternSyncManagerConfig
): PatternSyncManager {
  return new PatternSyncManager(config);
}
