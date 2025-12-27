/**
 * PatternReplicationService - Pattern Replication with Health Monitoring
 *
 * Features:
 * - Multi-agent pattern replication with configurable replication factor
 * - Health monitoring for replication nodes
 * - Conflict resolution for concurrent updates
 * - Automatic failover and recovery
 * - Replication consistency tracking
 *
 * @module memory/PatternReplicationService
 * @version 1.0.0
 */

import { DistributedPatternLibrary, VersionedPattern } from './DistributedPatternLibrary';
import { TestPattern } from '../core/memory/IPatternStore';
import { EventEmitter } from 'events';

/**
 * Replication node status
 */
export enum ReplicationNodeStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  FAILED = 'failed',
  RECOVERING = 'recovering'
}

/**
 * Replication node information
 */
export interface ReplicationNode {
  agentId: string;
  library: DistributedPatternLibrary;
  status: ReplicationNodeStatus;
  lastHeartbeat: number;
  consecutiveFailures: number;
  totalPatterns: number;
  lastSyncTimestamp: number;
}

/**
 * Replication health metrics
 */
export interface ReplicationHealth {
  totalNodes: number;
  healthyNodes: number;
  degradedNodes: number;
  failedNodes: number;
  recoveringNodes: number;
  averageReplicationLag: number;
  consistencyPercentage: number;
  lastHealthCheck: number;
}

/**
 * Replication configuration
 */
export interface ReplicationConfig {
  /** Replication factor (number of copies) */
  replicationFactor: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Node failure threshold (consecutive failures) */
  failureThreshold?: number;
  /** Sync interval in milliseconds */
  syncInterval?: number;
  /** Enable automatic recovery */
  autoRecover?: boolean;
  /** Minimum healthy nodes required */
  minHealthyNodes?: number;
}

/**
 * Replication event types
 */
export type ReplicationEvent =
  | { type: 'pattern_replicated'; patternId: string; nodeCount: number }
  | { type: 'node_failed'; agentId: string; reason: string }
  | { type: 'node_recovered'; agentId: string }
  | { type: 'sync_completed'; duration: number; patternsReplicated: number }
  | { type: 'inconsistency_detected'; patternId: string; nodeIds: string[] };

/**
 * PatternReplicationService - Manages pattern replication across multiple agents
 *
 * This service provides:
 * - Automatic pattern replication to N nodes (configurable replication factor)
 * - Health monitoring with heartbeat mechanism
 * - Automatic failover and recovery
 * - Consistency checking and repair
 * - Event-driven notifications for replication events
 */
export class PatternReplicationService extends EventEmitter {
  private nodes: Map<string, ReplicationNode>;
  private config: ReplicationConfig;
  private heartbeatTimer?: NodeJS.Timeout;
  private syncTimer?: NodeJS.Timeout;
  private isRunning: boolean;
  private readonly DEFAULT_HEARTBEAT_INTERVAL = 5000; // 5 seconds
  private readonly DEFAULT_SYNC_INTERVAL = 30000; // 30 seconds
  private readonly DEFAULT_FAILURE_THRESHOLD = 3;

  constructor(config: ReplicationConfig) {
    super();
    this.config = {
      ...config,
      heartbeatInterval: config.heartbeatInterval || this.DEFAULT_HEARTBEAT_INTERVAL,
      failureThreshold: config.failureThreshold || this.DEFAULT_FAILURE_THRESHOLD,
      syncInterval: config.syncInterval || this.DEFAULT_SYNC_INTERVAL,
      autoRecover: config.autoRecover !== false,
      minHealthyNodes: config.minHealthyNodes || Math.ceil(config.replicationFactor / 2)
    };
    this.nodes = new Map();
    this.isRunning = false;
  }

  /**
   * Start the replication service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Replication service is already running');
    }

    this.isRunning = true;

    // Start heartbeat monitoring
    this.startHeartbeat();

    // Start periodic sync
    this.startSync();
  }

  /**
   * Stop the replication service
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /**
   * Register a replication node
   */
  async registerNode(agentId: string, library: DistributedPatternLibrary): Promise<void> {
    const stats = await library.getStats();

    const node: ReplicationNode = {
      agentId,
      library,
      status: ReplicationNodeStatus.HEALTHY,
      lastHeartbeat: Date.now(),
      consecutiveFailures: 0,
      totalPatterns: stats.totalPatterns,
      lastSyncTimestamp: stats.lastSyncTimestamp
    };

    this.nodes.set(agentId, node);

    // Trigger initial sync if service is running
    if (this.isRunning) {
      await this.syncNode(node);
    }
  }

  /**
   * Unregister a replication node
   */
  async unregisterNode(agentId: string): Promise<boolean> {
    return this.nodes.delete(agentId);
  }

  /**
   * Replicate a pattern to all healthy nodes
   */
  async replicatePattern(pattern: TestPattern, sourceAgentId?: string): Promise<number> {
    const healthyNodes = this.getHealthyNodes();

    if (healthyNodes.length < this.config.minHealthyNodes!) {
      throw new Error(
        `Insufficient healthy nodes: ${healthyNodes.length} < ${this.config.minHealthyNodes}`
      );
    }

    let replicatedCount = 0;
    const errors: Array<{ agentId: string; error: Error }> = [];

    // Replicate to nodes (up to replication factor)
    const targetNodes = healthyNodes.slice(0, this.config.replicationFactor);

    for (const node of targetNodes) {
      // Skip source node if specified
      if (sourceAgentId && node.agentId === sourceAgentId) {
        continue;
      }

      try {
        await node.library.storePattern(pattern, sourceAgentId);
        replicatedCount++;
      } catch (error) {
        errors.push({ agentId: node.agentId, error: error as Error });
        await this.handleNodeFailure(node, error as Error);
      }
    }

    // Emit replication event
    this.emit('pattern_replicated', {
      type: 'pattern_replicated',
      patternId: pattern.id,
      nodeCount: replicatedCount
    } as ReplicationEvent);

    if (errors.length > 0 && replicatedCount < this.config.minHealthyNodes!) {
      throw new Error(
        `Pattern replication failed: only ${replicatedCount} successful replications`
      );
    }

    return replicatedCount;
  }

  /**
   * Sync patterns across all nodes
   */
  async syncPatterns(): Promise<{ synced: number; duration: number }> {
    const startTime = Date.now();
    let totalSynced = 0;

    const healthyNodes = this.getHealthyNodes();

    if (healthyNodes.length < 2) {
      return { synced: 0, duration: 0 };
    }

    // Use first healthy node as source of truth
    const sourceNode = healthyNodes[0];
    const sourcePatterns = await sourceNode.library.exportPatterns();

    // Sync to other nodes
    for (let i = 1; i < healthyNodes.length; i++) {
      const targetNode = healthyNodes[i];

      try {
        const synced = await targetNode.library.mergePatterns(sourcePatterns);
        totalSynced += synced;
        targetNode.lastSyncTimestamp = Date.now();
      } catch (error) {
        await this.handleNodeFailure(targetNode, error as Error);
      }
    }

    const duration = Date.now() - startTime;

    this.emit('sync_completed', {
      type: 'sync_completed',
      duration,
      patternsReplicated: totalSynced
    } as ReplicationEvent);

    return { synced: totalSynced, duration };
  }

  /**
   * Check replication health
   */
  async checkHealth(): Promise<ReplicationHealth> {
    let totalReplicationLag = 0;
    let healthyCount = 0;
    let degradedCount = 0;
    let failedCount = 0;
    let recoveringCount = 0;

    const now = Date.now();

    for (const node of Array.from(this.nodes.values())) {
      // Update stats
      try {
        const stats = await node.library.getStats();
        node.totalPatterns = stats.totalPatterns;
        node.lastSyncTimestamp = stats.lastSyncTimestamp;
      } catch {
        // Ignore stats errors during health check
      }

      // Count by status
      switch (node.status) {
        case ReplicationNodeStatus.HEALTHY:
          healthyCount++;
          break;
        case ReplicationNodeStatus.DEGRADED:
          degradedCount++;
          break;
        case ReplicationNodeStatus.FAILED:
          failedCount++;
          break;
        case ReplicationNodeStatus.RECOVERING:
          recoveringCount++;
          break;
      }

      // Calculate replication lag
      const lag = now - node.lastSyncTimestamp;
      totalReplicationLag += lag;
    }

    const averageReplicationLag = this.nodes.size > 0 ? totalReplicationLag / this.nodes.size : 0;

    // Calculate consistency percentage
    const consistencyPercentage = await this.calculateConsistency();

    return {
      totalNodes: this.nodes.size,
      healthyNodes: healthyCount,
      degradedNodes: degradedCount,
      failedNodes: failedCount,
      recoveringNodes: recoveringCount,
      averageReplicationLag,
      consistencyPercentage,
      lastHealthCheck: now
    };
  }

  /**
   * Get replication statistics
   */
  async getStats(): Promise<{
    replicationFactor: number;
    registeredNodes: number;
    health: ReplicationHealth;
  }> {
    const health = await this.checkHealth();

    return {
      replicationFactor: this.config.replicationFactor,
      registeredNodes: this.nodes.size,
      health
    };
  }

  /**
   * Get all registered nodes
   */
  getNodes(): ReplicationNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get healthy nodes only
   */
  private getHealthyNodes(): ReplicationNode[] {
    return Array.from(this.nodes.values()).filter(
      node => node.status === ReplicationNodeStatus.HEALTHY
    );
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.performHeartbeat();
    }, this.config.heartbeatInterval!);
  }

  /**
   * Start periodic sync
   */
  private startSync(): void {
    this.syncTimer = setInterval(async () => {
      await this.syncPatterns();
    }, this.config.syncInterval!);
  }

  /**
   * Perform heartbeat check on all nodes
   */
  private async performHeartbeat(): Promise<void> {
    const now = Date.now();

    for (const node of Array.from(this.nodes.values())) {
      try {
        // Try to get stats as health check
        const stats = await node.library.getStats();
        node.totalPatterns = stats.totalPatterns;
        node.lastHeartbeat = now;
        node.consecutiveFailures = 0;

        // Update status if recovering
        if (node.status === ReplicationNodeStatus.RECOVERING) {
          node.status = ReplicationNodeStatus.HEALTHY;
          this.emit('node_recovered', {
            type: 'node_recovered',
            agentId: node.agentId
          } as ReplicationEvent);
        }
      } catch (error) {
        await this.handleNodeFailure(node, error as Error);
      }
    }
  }

  /**
   * Handle node failure
   */
  private async handleNodeFailure(node: ReplicationNode, error: Error): Promise<void> {
    node.consecutiveFailures++;

    if (node.consecutiveFailures >= this.config.failureThreshold!) {
      if (node.status !== ReplicationNodeStatus.FAILED) {
        node.status = ReplicationNodeStatus.FAILED;
        this.emit('node_failed', {
          type: 'node_failed',
          agentId: node.agentId,
          reason: error.message
        } as ReplicationEvent);

        // Attempt recovery if enabled
        if (this.config.autoRecover) {
          await this.attemptRecovery(node);
        }
      }
    } else if (node.status === ReplicationNodeStatus.HEALTHY) {
      node.status = ReplicationNodeStatus.DEGRADED;
    }
  }

  /**
   * Attempt to recover a failed node
   */
  private async attemptRecovery(node: ReplicationNode): Promise<void> {
    node.status = ReplicationNodeStatus.RECOVERING;

    try {
      // Reinitialize the library
      await node.library.initialize();

      // Sync patterns from healthy node
      await this.syncNode(node);

      node.status = ReplicationNodeStatus.HEALTHY;
      node.consecutiveFailures = 0;

      this.emit('node_recovered', {
        type: 'node_recovered',
        agentId: node.agentId
      } as ReplicationEvent);
    } catch (error) {
      node.status = ReplicationNodeStatus.FAILED;
    }
  }

  /**
   * Sync a single node with the cluster
   */
  private async syncNode(targetNode: ReplicationNode): Promise<void> {
    const healthyNodes = this.getHealthyNodes().filter(n => n.agentId !== targetNode.agentId);

    if (healthyNodes.length === 0) {
      return; // No healthy nodes to sync from
    }

    const sourceNode = healthyNodes[0];
    const patterns = await sourceNode.library.exportPatterns();

    await targetNode.library.mergePatterns(patterns);
    targetNode.lastSyncTimestamp = Date.now();
  }

  /**
   * Calculate consistency percentage across all nodes
   */
  private async calculateConsistency(): Promise<number> {
    if (this.nodes.size < 2) {
      return 100; // Single node is always consistent
    }

    const healthyNodes = this.getHealthyNodes();
    if (healthyNodes.length < 2) {
      return 0; // Need at least 2 healthy nodes to measure consistency
    }

    // Get all pattern IDs from all nodes
    const allPatternIds = new Set<string>();
    const nodePatterns = new Map<string, Set<string>>();

    for (const node of healthyNodes) {
      const patterns = await node.library.exportPatterns();
      const patternIds = new Set(patterns.map(p => p.pattern.id));

      nodePatterns.set(node.agentId, patternIds);

      for (const id of Array.from(patternIds)) {
        allPatternIds.add(id);
      }
    }

    // Count how many patterns are fully replicated
    let fullyReplicatedCount = 0;

    for (const patternId of Array.from(allPatternIds)) {
      let replicationCount = 0;

      for (const patternIds of Array.from(nodePatterns.values())) {
        if (patternIds.has(patternId)) {
          replicationCount++;
        }
      }

      if (replicationCount === healthyNodes.length) {
        fullyReplicatedCount++;
      }
    }

    return allPatternIds.size > 0 ? (fullyReplicatedCount / allPatternIds.size) * 100 : 100;
  }
}
