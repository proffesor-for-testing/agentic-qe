/**
 * ExperienceSharingProtocol - Inter-Agent Learning Experience Sharing
 *
 * Enables agents to share learning experiences using gossip protocol
 * for distributed, eventually consistent knowledge transfer.
 *
 * Features:
 * - Gossip-based experience propagation
 * - Experience compression and deduplication
 * - Priority-based sharing (high-value experiences first)
 * - Conflict resolution for overlapping experiences
 * - Bandwidth-aware transmission
 *
 * @module learning/ExperienceSharingProtocol
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { TaskExperience, TaskState, AgentAction } from './types';
import { DistributedPatternLibrary, VectorClock } from '../memory/DistributedPatternLibrary';
import { Logger } from '../utils/Logger';
import { seededRandom } from '../utils/SeededRandom';

/**
 * Shared experience with metadata for cross-agent transfer
 */
export interface SharedExperience {
  id: string;
  experience: TaskExperience;
  sourceAgentId: string;
  vectorClock: VectorClock;
  priority: number; // 0-1, higher = more valuable
  shareCount: number; // Number of times shared
  createdAt: number;
  expiresAt: number;
  checksum: string;
}

/**
 * Experience sharing configuration
 */
export interface ExperienceSharingConfig {
  /** This agent's ID */
  agentId: string;
  /** Maximum experiences to store */
  maxExperiences?: number;
  /** TTL for shared experiences in milliseconds */
  experienceTTL?: number;
  /** Gossip interval in milliseconds */
  gossipInterval?: number;
  /** Number of peers to gossip with each round */
  fanout?: number;
  /** Minimum priority to share (0-1) */
  minSharePriority?: number;
  /** Enable experience compression */
  enableCompression?: boolean;
  /** Maximum bandwidth in bytes per second */
  maxBandwidth?: number;
}

/**
 * Experience sharing statistics
 */
export interface SharingStats {
  experiencesShared: number;
  experiencesReceived: number;
  duplicatesFiltered: number;
  expiredPurged: number;
  bytesTransferred: number;
  activeConnections: number;
  lastGossipRound: number;
}

/**
 * Peer connection for experience sharing
 */
export interface PeerConnection {
  peerId: string;
  agentType: string;
  vectorClock: VectorClock;
  lastSeen: number;
  experienceCount: number;
  isActive: boolean;
}

/**
 * Experience sharing event types
 */
export type SharingEvent =
  | { type: 'experience_shared'; experienceId: string; targetPeers: string[] }
  | { type: 'experience_received'; experienceId: string; sourceAgentId: string }
  | { type: 'peer_connected'; peerId: string }
  | { type: 'peer_disconnected'; peerId: string }
  | { type: 'conflict_resolved'; experienceId: string; resolution: 'local' | 'remote' | 'merge' };

/**
 * ExperienceSharingProtocol - Gossip-based experience sharing between agents
 *
 * This protocol enables agents to learn from each other's experiences
 * through decentralized, eventually consistent knowledge transfer.
 *
 * Key features:
 * - Gossip protocol for scalable experience propagation
 * - Vector clock-based conflict resolution
 * - Priority-based experience selection
 * - Automatic deduplication and expiration
 * - Bandwidth throttling for network efficiency
 */
export class ExperienceSharingProtocol extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: Required<ExperienceSharingConfig>;
  private experiences: Map<string, SharedExperience>;
  private peers: Map<string, PeerConnection>;
  private vectorClock: VectorClock;
  private stats: SharingStats;
  private gossipTimer?: NodeJS.Timeout;
  private isRunning: boolean;
  private seenExperiences: Set<string>; // For deduplication

  // Default configuration values
  private readonly DEFAULT_MAX_EXPERIENCES = 10000;
  private readonly DEFAULT_EXPERIENCE_TTL = 86400000; // 24 hours
  private readonly DEFAULT_GOSSIP_INTERVAL = 5000; // 5 seconds
  private readonly DEFAULT_FANOUT = 3;
  private readonly DEFAULT_MIN_SHARE_PRIORITY = 0.3;
  private readonly DEFAULT_MAX_BANDWIDTH = 1024 * 1024; // 1 MB/s

  constructor(config: ExperienceSharingConfig) {
    super();
    this.logger = Logger.getInstance();

    this.config = {
      agentId: config.agentId,
      maxExperiences: config.maxExperiences ?? this.DEFAULT_MAX_EXPERIENCES,
      experienceTTL: config.experienceTTL ?? this.DEFAULT_EXPERIENCE_TTL,
      gossipInterval: config.gossipInterval ?? this.DEFAULT_GOSSIP_INTERVAL,
      fanout: config.fanout ?? this.DEFAULT_FANOUT,
      minSharePriority: config.minSharePriority ?? this.DEFAULT_MIN_SHARE_PRIORITY,
      enableCompression: config.enableCompression ?? true,
      maxBandwidth: config.maxBandwidth ?? this.DEFAULT_MAX_BANDWIDTH
    };

    this.experiences = new Map();
    this.peers = new Map();
    this.vectorClock = { [config.agentId]: 0 };
    this.seenExperiences = new Set();
    this.isRunning = false;

    this.stats = {
      experiencesShared: 0,
      experiencesReceived: 0,
      duplicatesFiltered: 0,
      expiredPurged: 0,
      bytesTransferred: 0,
      activeConnections: 0,
      lastGossipRound: 0
    };

    this.logger.info('ExperienceSharingProtocol initialized', { agentId: config.agentId });
  }

  /**
   * Start the experience sharing protocol
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Experience sharing protocol already running');
      return;
    }

    this.isRunning = true;

    // Start gossip rounds
    this.gossipTimer = setInterval(async () => {
      await this.performGossipRound();
    }, this.config.gossipInterval);

    this.logger.info('Experience sharing protocol started');
  }

  /**
   * Stop the experience sharing protocol
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.gossipTimer) {
      clearInterval(this.gossipTimer);
      this.gossipTimer = undefined;
    }

    this.logger.info('Experience sharing protocol stopped');
  }

  /**
   * Register a peer for experience sharing
   */
  async registerPeer(peerId: string, agentType: string): Promise<void> {
    if (peerId === this.config.agentId) {
      return; // Don't register self as peer
    }

    const peer: PeerConnection = {
      peerId,
      agentType,
      vectorClock: { [peerId]: 0 },
      lastSeen: Date.now(),
      experienceCount: 0,
      isActive: true
    };

    this.peers.set(peerId, peer);
    this.stats.activeConnections = this.getActivePeerCount();

    this.emit('peer_connected', { type: 'peer_connected', peerId } as SharingEvent);
    this.logger.info(`Peer registered: ${peerId} (${agentType})`);
  }

  /**
   * Unregister a peer
   */
  async unregisterPeer(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.isActive = false;
      this.peers.delete(peerId);
      this.stats.activeConnections = this.getActivePeerCount();

      this.emit('peer_disconnected', { type: 'peer_disconnected', peerId } as SharingEvent);
      this.logger.info(`Peer unregistered: ${peerId}`);
    }
  }

  /**
   * Share an experience from this agent
   */
  async shareExperience(experience: TaskExperience, priority?: number): Promise<string> {
    // Increment vector clock for this agent
    this.vectorClock[this.config.agentId] =
      (this.vectorClock[this.config.agentId] || 0) + 1;

    // Calculate experience value/priority if not provided
    const calculatedPriority = priority ?? this.calculateExperiencePriority(experience);

    // Create shared experience
    const id = this.generateExperienceId(experience);
    const checksum = this.calculateChecksum(experience);

    const sharedExperience: SharedExperience = {
      id,
      experience,
      sourceAgentId: this.config.agentId,
      vectorClock: { ...this.vectorClock },
      priority: calculatedPriority,
      shareCount: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.experienceTTL,
      checksum
    };

    // Store locally
    this.experiences.set(id, sharedExperience);
    this.seenExperiences.add(id);

    // Enforce max experiences limit
    this.enforceExperienceLimit();

    this.logger.debug(`Experience shared locally: ${id}`, { priority: calculatedPriority });

    return id;
  }

  /**
   * Receive an experience from another agent
   */
  async receiveExperience(sharedExperience: SharedExperience): Promise<boolean> {
    // Check if already seen (deduplication)
    if (this.seenExperiences.has(sharedExperience.id)) {
      this.stats.duplicatesFiltered++;
      return false;
    }

    // Verify checksum
    const calculatedChecksum = this.calculateChecksum(sharedExperience.experience);
    if (calculatedChecksum !== sharedExperience.checksum) {
      this.logger.warn(`Checksum mismatch for experience: ${sharedExperience.id}`);
      return false;
    }

    // Check if expired
    if (Date.now() > sharedExperience.expiresAt) {
      this.logger.debug(`Ignoring expired experience: ${sharedExperience.id}`);
      return false;
    }

    // Check for conflicts with existing experience
    const existing = this.experiences.get(sharedExperience.id);
    if (existing) {
      const resolved = this.resolveConflict(existing, sharedExperience);
      if (resolved === existing) {
        return false; // Keep local version
      }
    }

    // Store experience
    this.experiences.set(sharedExperience.id, sharedExperience);
    this.seenExperiences.add(sharedExperience.id);

    // Merge vector clocks
    this.mergeVectorClocks(sharedExperience.vectorClock);

    // Update stats
    this.stats.experiencesReceived++;
    this.stats.bytesTransferred += JSON.stringify(sharedExperience).length;

    // Emit event
    this.emit('experience_received', {
      type: 'experience_received',
      experienceId: sharedExperience.id,
      sourceAgentId: sharedExperience.sourceAgentId
    } as SharingEvent);

    // Enforce max experiences limit
    this.enforceExperienceLimit();

    this.logger.debug(`Experience received: ${sharedExperience.id}`, {
      from: sharedExperience.sourceAgentId
    });

    return true;
  }

  /**
   * Get experiences relevant to a specific state/context
   */
  async getRelevantExperiences(
    state: TaskState,
    limit: number = 10
  ): Promise<SharedExperience[]> {
    const now = Date.now();
    const validExperiences: SharedExperience[] = [];

    for (const exp of this.experiences.values()) {
      // Skip expired
      if (now > exp.expiresAt) {
        continue;
      }

      // Calculate relevance to the given state
      const relevance = this.calculateStateRelevance(exp.experience.state, state);
      if (relevance > 0.3) {
        validExperiences.push(exp);
      }
    }

    // Sort by priority * relevance
    validExperiences.sort((a, b) => {
      const relevanceA = this.calculateStateRelevance(a.experience.state, state);
      const relevanceB = this.calculateStateRelevance(b.experience.state, state);
      return (b.priority * relevanceB) - (a.priority * relevanceA);
    });

    return validExperiences.slice(0, limit);
  }

  /**
   * Get all experiences from a specific agent
   */
  async getAgentExperiences(agentId: string): Promise<SharedExperience[]> {
    const result: SharedExperience[] = [];

    for (const exp of this.experiences.values()) {
      if (exp.sourceAgentId === agentId && Date.now() <= exp.expiresAt) {
        result.push(exp);
      }
    }

    return result;
  }

  /**
   * Get sharing statistics
   */
  getStats(): SharingStats {
    return { ...this.stats };
  }

  /**
   * Get connected peers
   */
  getPeers(): PeerConnection[] {
    return Array.from(this.peers.values()).filter(p => p.isActive);
  }

  /**
   * Get experience count
   */
  getExperienceCount(): number {
    return this.experiences.size;
  }

  /**
   * Clear all experiences
   */
  clear(): void {
    this.experiences.clear();
    this.seenExperiences.clear();
    this.vectorClock = { [this.config.agentId]: 0 };

    this.stats = {
      experiencesShared: 0,
      experiencesReceived: 0,
      duplicatesFiltered: 0,
      expiredPurged: 0,
      bytesTransferred: 0,
      activeConnections: this.getActivePeerCount(),
      lastGossipRound: 0
    };

    this.logger.info('Experience sharing protocol cleared');
  }

  /**
   * Export experiences for persistence
   */
  exportExperiences(): SharedExperience[] {
    return Array.from(this.experiences.values());
  }

  /**
   * Import experiences from persistence
   */
  async importExperiences(experiences: SharedExperience[]): Promise<number> {
    let importedCount = 0;

    for (const exp of experiences) {
      if (await this.receiveExperience(exp)) {
        importedCount++;
      }
    }

    this.logger.info(`Imported ${importedCount} experiences`);
    return importedCount;
  }

  /**
   * Perform a gossip round
   */
  private async performGossipRound(): Promise<void> {
    if (!this.isRunning) return;

    const activePeers = this.getPeers();
    if (activePeers.length === 0) return;

    // Select random peers up to fanout
    const selectedPeers = this.selectRandomPeers(activePeers, this.config.fanout);

    // Get high-priority experiences to share
    const experiencesToShare = this.selectExperiencesToShare();

    if (experiencesToShare.length === 0) return;

    // Simulate sharing with each peer
    for (const peer of selectedPeers) {
      await this.gossipWithPeer(peer, experiencesToShare);
    }

    this.stats.lastGossipRound = Date.now();
    this.stats.experiencesShared += experiencesToShare.length * selectedPeers.length;

    this.logger.debug(`Gossip round completed`, {
      peers: selectedPeers.length,
      experiences: experiencesToShare.length
    });
  }

  /**
   * Gossip with a specific peer
   */
  private async gossipWithPeer(
    peer: PeerConnection,
    experiences: SharedExperience[]
  ): Promise<void> {
    // Update peer's last seen
    peer.lastSeen = Date.now();

    // Emit share event
    this.emit('experience_shared', {
      type: 'experience_shared',
      experienceId: experiences.map(e => e.id).join(','),
      targetPeers: [peer.peerId]
    } as SharingEvent);

    // Increment share count for each experience
    for (const exp of experiences) {
      exp.shareCount++;
    }
  }

  /**
   * Select experiences to share based on priority and share count
   */
  private selectExperiencesToShare(): SharedExperience[] {
    const now = Date.now();
    const candidates: SharedExperience[] = [];

    for (const exp of this.experiences.values()) {
      // Skip expired
      if (now > exp.expiresAt) continue;

      // Skip low priority
      if (exp.priority < this.config.minSharePriority) continue;

      // Prioritize less-shared experiences
      candidates.push(exp);
    }

    // Sort by priority / (shareCount + 1) to balance priority and distribution
    candidates.sort((a, b) => {
      const scoreA = a.priority / (a.shareCount + 1);
      const scoreB = b.priority / (b.shareCount + 1);
      return scoreB - scoreA;
    });

    // Return top experiences within bandwidth limit
    const maxExperiences = Math.min(10, candidates.length);
    return candidates.slice(0, maxExperiences);
  }

  /**
   * Select random peers for gossip
   */
  private selectRandomPeers(peers: PeerConnection[], count: number): PeerConnection[] {
    const shuffled = seededRandom.shuffle(peers);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * Calculate experience priority based on reward and novelty
   */
  private calculateExperiencePriority(experience: TaskExperience): number {
    // Factors: reward magnitude, complexity, success/failure
    const rewardFactor = Math.abs(experience.reward) / 10; // Normalize reward
    const complexityFactor = experience.state.taskComplexity;
    const successFactor = experience.reward > 0 ? 0.3 : 0.5; // Failures are more valuable for learning

    return Math.min(1, (rewardFactor + complexityFactor + successFactor) / 3);
  }

  /**
   * Calculate relevance between two states
   */
  private calculateStateRelevance(state1: TaskState, state2: TaskState): number {
    // Compare complexity
    const complexityDiff = Math.abs(state1.taskComplexity - state2.taskComplexity);

    // Compare capabilities overlap
    const caps1 = new Set(state1.requiredCapabilities);
    const caps2 = new Set(state2.requiredCapabilities);
    const intersection = [...caps1].filter(x => caps2.has(x)).length;
    const union = new Set([...caps1, ...caps2]).size;
    const capsOverlap = union > 0 ? intersection / union : 1;

    // Compare resources
    const resourceDiff = Math.abs(state1.availableResources - state2.availableResources);

    // Weighted relevance score
    return (
      (1 - complexityDiff) * 0.3 +
      capsOverlap * 0.5 +
      (1 - resourceDiff) * 0.2
    );
  }

  /**
   * Resolve conflict between two experiences
   */
  private resolveConflict(
    local: SharedExperience,
    remote: SharedExperience
  ): SharedExperience {
    // Compare vector clocks
    const comparison = this.compareVectorClocks(local.vectorClock, remote.vectorClock);

    if (comparison === 1) {
      // Local is newer
      this.emit('conflict_resolved', {
        type: 'conflict_resolved',
        experienceId: local.id,
        resolution: 'local'
      } as SharingEvent);
      return local;
    } else if (comparison === -1) {
      // Remote is newer
      this.emit('conflict_resolved', {
        type: 'conflict_resolved',
        experienceId: remote.id,
        resolution: 'remote'
      } as SharingEvent);
      return remote;
    } else {
      // Concurrent - use higher priority as tiebreaker
      const winner = local.priority >= remote.priority ? local : remote;
      this.emit('conflict_resolved', {
        type: 'conflict_resolved',
        experienceId: winner.id,
        resolution: winner === local ? 'local' : 'remote'
      } as SharingEvent);
      return winner;
    }
  }

  /**
   * Compare two vector clocks
   */
  private compareVectorClocks(v1: VectorClock, v2: VectorClock): number {
    const allAgents = new Set([...Object.keys(v1), ...Object.keys(v2)]);
    let v1Greater = false;
    let v2Greater = false;

    for (const agent of allAgents) {
      const t1 = v1[agent] || 0;
      const t2 = v2[agent] || 0;

      if (t1 > t2) v1Greater = true;
      if (t2 > t1) v2Greater = true;
    }

    if (v1Greater && !v2Greater) return 1;
    if (v2Greater && !v1Greater) return -1;
    return 0; // Concurrent
  }

  /**
   * Merge remote vector clock into local
   */
  private mergeVectorClocks(remoteClock: VectorClock): void {
    for (const [agent, timestamp] of Object.entries(remoteClock)) {
      this.vectorClock[agent] = Math.max(this.vectorClock[agent] || 0, timestamp);
    }
  }

  /**
   * Generate unique experience ID
   */
  private generateExperienceId(experience: TaskExperience): string {
    // Handle missing or invalid timestamp - use current time as fallback
    const timestamp = experience.timestamp instanceof Date
      ? experience.timestamp.getTime()
      : (typeof experience.timestamp === 'number' ? experience.timestamp : Date.now());
    const content = `${experience.taskId || 'unknown'}:${experience.agentId || 'unknown'}:${timestamp}`;
    return this.hashString(content);
  }

  /**
   * Calculate checksum for experience
   */
  private calculateChecksum(experience: TaskExperience): string {
    return this.hashString(JSON.stringify(experience));
  }

  /**
   * Simple hash function for IDs and checksums
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Enforce maximum experience limit
   */
  private enforceExperienceLimit(): void {
    if (this.experiences.size <= this.config.maxExperiences) {
      return;
    }

    // Remove expired first
    const now = Date.now();
    const expiredIds: string[] = [];
    for (const [id, exp] of this.experiences.entries()) {
      if (now > exp.expiresAt) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      this.experiences.delete(id);
      this.stats.expiredPurged++;
    }

    // If still over limit, remove lowest priority
    if (this.experiences.size > this.config.maxExperiences) {
      const sorted = Array.from(this.experiences.entries())
        .sort((a, b) => a[1].priority - b[1].priority);

      const toRemove = sorted.slice(0, this.experiences.size - this.config.maxExperiences);
      for (const [id] of toRemove) {
        this.experiences.delete(id);
      }
    }
  }

  /**
   * Get count of active peers
   */
  private getActivePeerCount(): number {
    return Array.from(this.peers.values()).filter(p => p.isActive).length;
  }
}
