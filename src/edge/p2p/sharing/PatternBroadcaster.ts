/**
 * Pattern Broadcaster for Gossip-Based Distribution
 *
 * Broadcasts pattern announcements and updates across the P2P network
 * using a gossip protocol for efficient distribution. Includes rate limiting,
 * subscription filtering, and deduplication.
 *
 * @module edge/p2p/sharing/PatternBroadcaster
 * @version 1.0.0
 */

import type { AgentChannel } from '../protocol';
import type {
  SharedPattern,
  PatternSummary,
  PatternBroadcast,
  BroadcastPayload,
  NewPatternPayload,
  PatternUpdatePayload,
  PatternDeletePayload,
  PatternRequestPayload,
  PeerDiscoveryPayload,
  PeerCapabilities,
  PatternQuery,
  SharingRateLimitConfig,
  SharingEvent,
  SharingEventHandler,
} from './types';
import {
  BroadcastType,
  PatternCategory,
  SharingError,
  SharingErrorCode,
  SharingEventType,
  DEFAULT_RATE_LIMIT_CONFIG,
  SHARING_PROTOCOL_VERSION,
  DEFAULT_EMBEDDING_DIMENSION,
} from './types';
import { PatternIndex } from './PatternIndex';

// ============================================
// Types
// ============================================

/**
 * Broadcaster configuration
 */
export interface PatternBroadcasterConfig {
  /** Local agent ID */
  localAgentId: string;

  /** Pattern index */
  index: PatternIndex;

  /** Communication channel */
  channel?: AgentChannel;

  /** Rate limiting configuration */
  rateLimit?: Partial<SharingRateLimitConfig>;

  /** Time-to-live for broadcasts (hops) */
  defaultTtl?: number;

  /** Maximum seen broadcasts to track (for deduplication) */
  maxSeenBroadcasts?: number;

  /** Enable gossip protocol */
  enableGossip?: boolean;

  /** Gossip fanout (number of peers to forward to) */
  gossipFanout?: number;
}

/**
 * Subscription filter for incoming broadcasts
 */
export interface BroadcastSubscription {
  /** Subscription ID */
  id: string;

  /** Filter by broadcast types */
  types?: BroadcastType[];

  /** Filter by categories */
  categories?: PatternCategory[];

  /** Filter by domains */
  domains?: string[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by sender */
  senders?: string[];

  /** Exclude senders */
  excludeSenders?: string[];

  /** Handler callback */
  handler: BroadcastHandler;
}

/**
 * Broadcast handler function
 */
export type BroadcastHandler = (broadcast: PatternBroadcast) => void | Promise<void>;

/**
 * Rate limit state
 */
interface RateLimitState {
  broadcasts: number[];
  syncRequests: number[];
  patternsReceived: number;
  cooldownUntil?: number;
}

// ============================================
// Pattern Broadcaster Class
// ============================================

/**
 * Broadcasts pattern updates across the P2P network
 *
 * @example
 * ```typescript
 * const broadcaster = new PatternBroadcaster({
 *   localAgentId: 'my-agent',
 *   index: patternIndex,
 *   channel: agentChannel,
 * });
 *
 * // Announce new pattern
 * await broadcaster.announceNewPattern(pattern);
 *
 * // Subscribe to updates
 * broadcaster.subscribe({
 *   id: 'my-sub',
 *   types: [BroadcastType.NEW_PATTERN],
 *   categories: [PatternCategory.TEST],
 *   handler: (broadcast) => {
 *     console.log('New pattern:', broadcast.payload);
 *   },
 * });
 *
 * // Discover peers
 * await broadcaster.discoverPeers();
 * ```
 */
export class PatternBroadcaster {
  private localAgentId: string;
  private index: PatternIndex;
  private channel?: AgentChannel;
  private rateLimit: SharingRateLimitConfig;
  private defaultTtl: number;
  private maxSeenBroadcasts: number;
  private enableGossip: boolean;
  private gossipFanout: number;

  // State
  private subscriptions: Map<string, BroadcastSubscription> = new Map();
  private seenBroadcasts: Set<string> = new Set();
  private rateLimitState: RateLimitState;
  private knownPeers: Map<string, PeerCapabilities> = new Map();
  private eventHandlers: SharingEventHandler[] = [];

  // Local capabilities
  private capabilities: PeerCapabilities;

  constructor(config: PatternBroadcasterConfig) {
    this.localAgentId = config.localAgentId;
    this.index = config.index;
    this.channel = config.channel;
    this.rateLimit = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config.rateLimit };
    this.defaultTtl = config.defaultTtl ?? 3;
    this.maxSeenBroadcasts = config.maxSeenBroadcasts ?? 10000;
    this.enableGossip = config.enableGossip ?? true;
    this.gossipFanout = config.gossipFanout ?? 3;

    this.rateLimitState = {
      broadcasts: [],
      syncRequests: [],
      patternsReceived: 0,
    };

    this.capabilities = {
      protocolVersion: SHARING_PROTOCOL_VERSION,
      maxBatchSize: 100,
      categories: Object.values(PatternCategory),
      differentialPrivacy: true,
      vectorSearch: true,
      maxEmbeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
    };

    // Setup channel handlers
    if (this.channel) {
      this.setupChannelHandlers();
    }
  }

  // ============================================
  // Broadcasting
  // ============================================

  /**
   * Announce a new pattern to the network
   */
  async announceNewPattern(pattern: SharedPattern): Promise<void> {
    if (!this.checkRateLimit('broadcast')) {
      throw new SharingError(
        'Rate limit exceeded for broadcasts',
        SharingErrorCode.RATE_LIMITED
      );
    }

    const summary = this.createPatternSummary(pattern);
    const payload: NewPatternPayload = {
      type: 'new_pattern',
      summary,
    };

    await this.broadcast(BroadcastType.NEW_PATTERN, payload);
  }

  /**
   * Announce a pattern update
   */
  async announcePatternUpdate(
    pattern: SharedPattern,
    changes: string[]
  ): Promise<void> {
    if (!this.checkRateLimit('broadcast')) {
      throw new SharingError(
        'Rate limit exceeded for broadcasts',
        SharingErrorCode.RATE_LIMITED
      );
    }

    const payload: PatternUpdatePayload = {
      type: 'pattern_update',
      patternId: pattern.id,
      version: pattern.version,
      changes,
    };

    await this.broadcast(BroadcastType.PATTERN_UPDATE, payload);
  }

  /**
   * Announce a pattern deletion
   */
  async announcePatternDeletion(
    patternId: string,
    reason?: string
  ): Promise<void> {
    if (!this.checkRateLimit('broadcast')) {
      throw new SharingError(
        'Rate limit exceeded for broadcasts',
        SharingErrorCode.RATE_LIMITED
      );
    }

    const payload: PatternDeletePayload = {
      type: 'pattern_delete',
      patternId,
      reason,
    };

    await this.broadcast(BroadcastType.PATTERN_DELETE, payload);
  }

  /**
   * Request patterns from the network
   */
  async requestPatterns(query?: PatternQuery): Promise<void> {
    if (!this.checkRateLimit('syncRequest')) {
      throw new SharingError(
        'Rate limit exceeded for sync requests',
        SharingErrorCode.RATE_LIMITED
      );
    }

    const payload: PatternRequestPayload = {
      type: 'pattern_request',
      query,
    };

    await this.broadcast(BroadcastType.PATTERN_REQUEST, payload);
  }

  /**
   * Discover peers on the network
   */
  async discoverPeers(): Promise<void> {
    const stats = this.index.getStats();
    const availableCategories = Object.entries(stats.byCategory)
      .filter(([, count]) => count > 0)
      .map(([category]) => category as PatternCategory);

    const payload: PeerDiscoveryPayload = {
      type: 'peer_discovery',
      capabilities: this.capabilities,
      availableCategories,
      patternCount: stats.totalPatterns,
    };

    await this.broadcast(BroadcastType.PEER_DISCOVERY, payload);
  }

  /**
   * Send a broadcast message
   */
  private async broadcast(
    type: BroadcastType,
    payload: BroadcastPayload
  ): Promise<void> {
    if (!this.channel) {
      throw new SharingError(
        'No channel configured for broadcasting',
        SharingErrorCode.NETWORK_ERROR
      );
    }

    const broadcast: PatternBroadcast = {
      type,
      broadcastId: this.generateBroadcastId(),
      senderId: this.localAgentId,
      payload,
      ttl: this.defaultTtl,
      timestamp: new Date().toISOString(),
      signature: '', // Signature populated by crypto layer when available
    };

    // Mark as seen (to not process our own broadcasts)
    this.markSeen(broadcast.broadcastId);

    // Broadcast to channel
    await this.channel.broadcast('pattern:broadcast', broadcast);

    // Update rate limit state
    this.recordBroadcast();
  }

  // ============================================
  // Subscriptions
  // ============================================

  /**
   * Subscribe to broadcast events
   */
  subscribe(subscription: BroadcastSubscription): string {
    this.subscriptions.set(subscription.id, subscription);
    return subscription.id;
  }

  /**
   * Unsubscribe from broadcast events
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get all subscriptions
   */
  getSubscriptions(): BroadcastSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  // ============================================
  // Message Handling
  // ============================================

  /**
   * Handle incoming broadcast
   */
  async handleBroadcast(broadcast: PatternBroadcast): Promise<void> {
    // Check if already seen (deduplication)
    if (this.hasSeen(broadcast.broadcastId)) {
      return;
    }

    // Mark as seen
    this.markSeen(broadcast.broadcastId);

    // Filter incoming patterns for rate limiting
    if (
      broadcast.type === BroadcastType.NEW_PATTERN &&
      !this.checkPatternRateLimit()
    ) {
      return; // Silently drop due to rate limit
    }

    // Process based on type
    await this.processBroadcast(broadcast);

    // Emit event
    this.emit({
      type: SharingEventType.BROADCAST_RECEIVED,
      timestamp: Date.now(),
      details: {
        type: broadcast.type,
        senderId: broadcast.senderId,
        broadcastId: broadcast.broadcastId,
      },
    });

    // Notify subscriptions
    await this.notifySubscriptions(broadcast);

    // Gossip forward if enabled and TTL > 0
    if (this.enableGossip && broadcast.ttl > 1) {
      await this.gossipForward(broadcast);
    }
  }

  /**
   * Process broadcast by type
   */
  private async processBroadcast(broadcast: PatternBroadcast): Promise<void> {
    switch (broadcast.type) {
      case BroadcastType.NEW_PATTERN:
        this.handleNewPatternAnnouncement(
          broadcast.payload as NewPatternPayload,
          broadcast.senderId
        );
        break;

      case BroadcastType.PATTERN_UPDATE:
        this.handlePatternUpdateAnnouncement(
          broadcast.payload as PatternUpdatePayload,
          broadcast.senderId
        );
        break;

      case BroadcastType.PATTERN_DELETE:
        this.handlePatternDeletionAnnouncement(
          broadcast.payload as PatternDeletePayload,
          broadcast.senderId
        );
        break;

      case BroadcastType.PATTERN_REQUEST:
        await this.handlePatternRequest(
          broadcast.payload as PatternRequestPayload,
          broadcast.senderId
        );
        break;

      case BroadcastType.PEER_DISCOVERY:
        this.handlePeerDiscovery(
          broadcast.payload as PeerDiscoveryPayload,
          broadcast.senderId
        );
        break;
    }
  }

  /**
   * Handle new pattern announcement
   */
  private handleNewPatternAnnouncement(
    payload: NewPatternPayload,
    senderId: string
  ): void {
    // Store pattern summary for later retrieval if interested
    // The actual pattern can be pulled via sync manager
    this.recordPatternReceived();
  }

  /**
   * Handle pattern update announcement
   */
  private handlePatternUpdateAnnouncement(
    payload: PatternUpdatePayload,
    senderId: string
  ): void {
    // If we have this pattern, we might want to sync
    const existing = this.index.get(payload.patternId);
    if (existing) {
      // Compare versions and potentially trigger sync
      const comparison = this.index.compareVectorClocks(
        existing.version.vectorClock,
        payload.version.vectorClock
      );
      if (comparison === 'before' || comparison === 'concurrent') {
        // Our version is older or there's a conflict
        // The sync manager should be notified to pull updates
      }
    }
  }

  /**
   * Handle pattern deletion announcement
   */
  private handlePatternDeletionAnnouncement(
    payload: PatternDeletePayload,
    senderId: string
  ): void {
    // Optionally remove the pattern from local index
    // This is a policy decision - we might want to keep it
  }

  /**
   * Handle pattern request
   */
  private async handlePatternRequest(
    payload: PatternRequestPayload,
    senderId: string
  ): Promise<void> {
    // If we have matching patterns, we could respond
    // For now, this is handled by the sync manager
  }

  /**
   * Handle peer discovery
   */
  private handlePeerDiscovery(
    payload: PeerDiscoveryPayload,
    senderId: string
  ): void {
    // Store peer capabilities
    this.knownPeers.set(senderId, payload.capabilities);
  }

  // ============================================
  // Gossip Protocol
  // ============================================

  /**
   * Forward broadcast to subset of peers (gossip)
   */
  private async gossipForward(broadcast: PatternBroadcast): Promise<void> {
    if (!this.channel) return;

    // Decrement TTL
    const forwardBroadcast: PatternBroadcast = {
      ...broadcast,
      ttl: broadcast.ttl - 1,
    };

    // Select random peers to forward to (excluding sender)
    const peers = this.selectGossipPeers(broadcast.senderId);

    // Forward to selected peers
    // In a real implementation, we would send to specific peers
    // For now, we re-broadcast (the channel handles delivery)
    if (peers.length > 0) {
      await this.channel.broadcast('pattern:broadcast', forwardBroadcast);
    }
  }

  /**
   * Select peers for gossip forwarding
   */
  private selectGossipPeers(excludePeer: string): string[] {
    const peers = Array.from(this.knownPeers.keys()).filter(
      (p) => p !== excludePeer && p !== this.localAgentId
    );

    // Randomly select up to gossipFanout peers
    const selected: string[] = [];
    while (selected.length < this.gossipFanout && peers.length > 0) {
      const index = Math.floor(Math.random() * peers.length);
      selected.push(peers.splice(index, 1)[0]);
    }

    return selected;
  }

  // ============================================
  // Channel Setup
  // ============================================

  /**
   * Setup channel handlers
   */
  private setupChannelHandlers(): void {
    if (!this.channel) return;

    // Subscribe to broadcast messages
    this.channel.subscribe<PatternBroadcast>('pattern:broadcast', async (broadcast) => {
      await this.handleBroadcast(broadcast);
    });
  }

  /**
   * Set communication channel
   */
  setChannel(channel: AgentChannel): void {
    this.channel = channel;
    this.setupChannelHandlers();
  }

  // ============================================
  // Subscription Notification
  // ============================================

  /**
   * Notify matching subscriptions
   */
  private async notifySubscriptions(broadcast: PatternBroadcast): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      if (this.matchesSubscription(broadcast, subscription)) {
        try {
          await Promise.resolve(subscription.handler(broadcast));
        } catch {
          // Ignore subscription handler errors
        }
      }
    }
  }

  /**
   * Check if broadcast matches subscription filters
   */
  private matchesSubscription(
    broadcast: PatternBroadcast,
    subscription: BroadcastSubscription
  ): boolean {
    // Type filter
    if (
      subscription.types &&
      subscription.types.length > 0 &&
      !subscription.types.includes(broadcast.type)
    ) {
      return false;
    }

    // Sender filter
    if (
      subscription.senders &&
      subscription.senders.length > 0 &&
      !subscription.senders.includes(broadcast.senderId)
    ) {
      return false;
    }

    // Exclude sender filter
    if (subscription.excludeSenders?.includes(broadcast.senderId)) {
      return false;
    }

    // Category filter (for new pattern broadcasts)
    if (
      subscription.categories &&
      subscription.categories.length > 0 &&
      broadcast.type === BroadcastType.NEW_PATTERN
    ) {
      const payload = broadcast.payload as NewPatternPayload;
      if (!subscription.categories.includes(payload.summary.category)) {
        return false;
      }
    }

    // Domain filter (for new pattern broadcasts)
    if (
      subscription.domains &&
      subscription.domains.length > 0 &&
      broadcast.type === BroadcastType.NEW_PATTERN
    ) {
      const payload = broadcast.payload as NewPatternPayload;
      if (!subscription.domains.includes(payload.summary.domain)) {
        return false;
      }
    }

    // Tag filter (for new pattern broadcasts)
    if (
      subscription.tags &&
      subscription.tags.length > 0 &&
      broadcast.type === BroadcastType.NEW_PATTERN
    ) {
      const payload = broadcast.payload as NewPatternPayload;
      const tagSet = new Set(payload.summary.tags.map((t) => t.toLowerCase()));
      if (!subscription.tags.some((t) => tagSet.has(t.toLowerCase()))) {
        return false;
      }
    }

    return true;
  }

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Check if rate limit allows action
   */
  private checkRateLimit(type: 'broadcast' | 'syncRequest'): boolean {
    const now = Date.now();

    // Check cooldown
    if (
      this.rateLimitState.cooldownUntil &&
      now < this.rateLimitState.cooldownUntil
    ) {
      return false;
    }

    // Clean old entries (older than 1 minute)
    const cutoff = now - 60000;

    if (type === 'broadcast') {
      this.rateLimitState.broadcasts = this.rateLimitState.broadcasts.filter(
        (t) => t > cutoff
      );
      return this.rateLimitState.broadcasts.length < this.rateLimit.broadcastsPerMinute;
    } else {
      this.rateLimitState.syncRequests = this.rateLimitState.syncRequests.filter(
        (t) => t > cutoff
      );
      return (
        this.rateLimitState.syncRequests.length < this.rateLimit.syncRequestsPerMinute
      );
    }
  }

  /**
   * Check pattern reception rate limit
   */
  private checkPatternRateLimit(): boolean {
    // Simple hourly limit check
    // In production, this would use a sliding window
    return this.rateLimitState.patternsReceived < this.rateLimit.patternsPerHour;
  }

  /**
   * Record a broadcast for rate limiting
   */
  private recordBroadcast(): void {
    this.rateLimitState.broadcasts.push(Date.now());
  }

  /**
   * Record pattern received for rate limiting
   */
  private recordPatternReceived(): void {
    this.rateLimitState.patternsReceived++;
  }

  /**
   * Reset hourly pattern count (should be called periodically)
   */
  resetPatternCount(): void {
    this.rateLimitState.patternsReceived = 0;
  }

  // ============================================
  // Deduplication
  // ============================================

  /**
   * Check if broadcast has been seen
   */
  private hasSeen(broadcastId: string): boolean {
    return this.seenBroadcasts.has(broadcastId);
  }

  /**
   * Mark broadcast as seen
   */
  private markSeen(broadcastId: string): void {
    this.seenBroadcasts.add(broadcastId);

    // Evict old entries if at capacity
    if (this.seenBroadcasts.size > this.maxSeenBroadcasts) {
      const iterator = this.seenBroadcasts.values();
      const toRemove = this.maxSeenBroadcasts / 10; // Remove 10%
      for (let i = 0; i < toRemove; i++) {
        const result = iterator.next();
        if (!result.done) {
          this.seenBroadcasts.delete(result.value);
        }
      }
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Create pattern summary from full pattern
   */
  private createPatternSummary(pattern: SharedPattern): PatternSummary {
    return {
      id: pattern.id,
      category: pattern.category,
      type: pattern.type,
      domain: pattern.domain,
      contentHash: pattern.content.contentHash,
      quality: pattern.quality.level,
      tags: pattern.metadata.tags,
      // Include embedding only if privacy level allows
      embedding:
        pattern.sharing.privacyLevel !== 'embedding_only'
          ? undefined
          : pattern.embedding,
    };
  }

  /**
   * Generate unique broadcast ID
   */
  private generateBroadcastId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `bcast-${this.localAgentId.substring(0, 8)}-${timestamp}-${random}`;
  }

  // ============================================
  // Peer Management
  // ============================================

  /**
   * Get known peers
   */
  getKnownPeers(): Map<string, PeerCapabilities> {
    return new Map(this.knownPeers);
  }

  /**
   * Get peer capabilities
   */
  getPeerCapabilities(peerId: string): PeerCapabilities | undefined {
    return this.knownPeers.get(peerId);
  }

  /**
   * Remove peer
   */
  removePeer(peerId: string): boolean {
    return this.knownPeers.delete(peerId);
  }

  /**
   * Get local capabilities
   */
  getCapabilities(): PeerCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Update local capabilities
   */
  updateCapabilities(updates: Partial<PeerCapabilities>): void {
    this.capabilities = { ...this.capabilities, ...updates };
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get broadcaster statistics
   */
  getStats(): {
    subscriptions: number;
    knownPeers: number;
    seenBroadcasts: number;
    broadcastsThisMinute: number;
    patternsReceivedThisHour: number;
  } {
    const now = Date.now();
    const cutoff = now - 60000;

    return {
      subscriptions: this.subscriptions.size,
      knownPeers: this.knownPeers.size,
      seenBroadcasts: this.seenBroadcasts.size,
      broadcastsThisMinute: this.rateLimitState.broadcasts.filter((t) => t > cutoff)
        .length,
      patternsReceivedThisHour: this.rateLimitState.patternsReceived,
    };
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
   * Destroy the broadcaster
   */
  destroy(): void {
    this.subscriptions.clear();
    this.seenBroadcasts.clear();
    this.knownPeers.clear();
    this.eventHandlers = [];
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new pattern broadcaster
 */
export function createPatternBroadcaster(
  config: PatternBroadcasterConfig
): PatternBroadcaster {
  return new PatternBroadcaster(config);
}
