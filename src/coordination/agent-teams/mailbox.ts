/**
 * Agentic QE v3 - Agent Teams Mailbox Service
 * ADR-064: Per-agent message queue management
 *
 * Manages in-memory mailboxes for inter-agent communication.
 * Each agent gets a dedicated mailbox that supports:
 * - Direct message delivery (point-to-point)
 * - Domain-wide broadcasts
 * - TTL-based message expiration
 * - Unread tracking with peek support
 * - Event callbacks for message arrival
 */

import {
  AgentMessage,
  AgentMailbox,
  MessageHandler,
  BroadcastHandler,
  ReceiveOptions,
} from './types.js';

// ============================================================================
// Mailbox Service
// ============================================================================

/**
 * Service managing per-agent message queues with in-memory storage.
 * Provides thread-safe message delivery, broadcast support, and TTL expiration.
 */
export class MailboxService {
  /** Agent mailboxes keyed by agent ID */
  private readonly mailboxes = new Map<string, MutableMailbox>();

  /** Message delivery listeners keyed by agent ID */
  private readonly messageHandlers = new Map<string, MessageHandler[]>();

  /** Broadcast listeners keyed by domain */
  private readonly broadcastHandlers = new Map<string, BroadcastHandler[]>();

  /** Index of agents by domain for efficient broadcast */
  private readonly domainAgents = new Map<string, Set<string>>();

  // ============================================================================
  // Mailbox Lifecycle
  // ============================================================================

  /**
   * Create a mailbox for an agent. If a mailbox already exists for this
   * agent ID, the existing mailbox is returned unchanged.
   *
   * @param agentId - Unique agent identifier
   * @param domain - Domain the agent belongs to
   * @returns The created or existing mailbox snapshot
   */
  createMailbox(agentId: string, domain: string): AgentMailbox {
    const existing = this.mailboxes.get(agentId);
    if (existing) {
      return this.toSnapshot(existing);
    }

    const mailbox: MutableMailbox = {
      agentId,
      domain,
      messages: [],
      unreadCount: 0,
      lastRead: Date.now(),
    };

    this.mailboxes.set(agentId, mailbox);

    // Track agent in domain index
    let agents = this.domainAgents.get(domain);
    if (!agents) {
      agents = new Set();
      this.domainAgents.set(domain, agents);
    }
    agents.add(agentId);

    return this.toSnapshot(mailbox);
  }

  /**
   * Get the full mailbox state for an agent.
   *
   * @param agentId - Agent whose mailbox to retrieve
   * @returns Mailbox snapshot or undefined if agent has no mailbox
   */
  getMailbox(agentId: string): AgentMailbox | undefined {
    const mailbox = this.mailboxes.get(agentId);
    if (!mailbox) return undefined;
    return this.toSnapshot(mailbox);
  }

  /**
   * Delete an agent's mailbox and remove the agent from domain tracking.
   *
   * @param agentId - Agent whose mailbox to delete
   * @returns True if a mailbox was deleted, false if none existed
   */
  deleteMailbox(agentId: string): boolean {
    const mailbox = this.mailboxes.get(agentId);
    if (!mailbox) return false;

    // Remove from domain index
    const agents = this.domainAgents.get(mailbox.domain);
    if (agents) {
      agents.delete(agentId);
      if (agents.size === 0) {
        this.domainAgents.delete(mailbox.domain);
      }
    }

    // Remove handlers
    this.messageHandlers.delete(agentId);

    // Remove mailbox
    this.mailboxes.delete(agentId);

    return true;
  }

  // ============================================================================
  // Message Delivery
  // ============================================================================

  /**
   * Send a message to a specific agent's mailbox.
   * If the target is 'broadcast', use the `broadcast()` method instead.
   *
   * @param message - The message to deliver
   * @throws Error if the target agent has no mailbox
   */
  send(message: AgentMessage): void {
    if (message.to === 'broadcast') {
      this.broadcast(message.domain, message);
      return;
    }

    const mailbox = this.mailboxes.get(message.to);
    if (!mailbox) {
      throw new Error(
        `No mailbox found for agent '${message.to}'. ` +
        `Create a mailbox first with createMailbox().`
      );
    }

    mailbox.messages.push(message);
    mailbox.unreadCount++;

    // Notify listeners
    const handlers = this.messageHandlers.get(message.to);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch {
          // Swallow handler errors to avoid breaking delivery
        }
      }
    }
  }

  /**
   * Broadcast a message to all agents in a domain.
   * The sender (if they have a mailbox in the domain) is excluded.
   *
   * @param domain - Domain to broadcast to
   * @param message - The message to broadcast
   */
  broadcast(domain: string, message: AgentMessage): void {
    const agents = this.domainAgents.get(domain);
    if (!agents) return;

    for (const agentId of agents) {
      // Skip the sender
      if (agentId === message.from) continue;

      const mailbox = this.mailboxes.get(agentId);
      if (mailbox) {
        mailbox.messages.push(message);
        mailbox.unreadCount++;

        // Notify per-agent listeners
        const handlers = this.messageHandlers.get(agentId);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(message);
            } catch {
              // Swallow handler errors
            }
          }
        }
      }
    }

    // Notify broadcast listeners
    const broadcastListeners = this.broadcastHandlers.get(domain);
    if (broadcastListeners) {
      for (const handler of broadcastListeners) {
        try {
          handler(domain, message);
        } catch {
          // Swallow handler errors
        }
      }
    }
  }

  // ============================================================================
  // Message Retrieval
  // ============================================================================

  /**
   * Retrieve unread messages for an agent, marking them as read.
   *
   * @param agentId - Agent whose messages to retrieve
   * @param options - Optional filtering and limiting
   * @returns Array of unread messages (empty if no mailbox or no unread)
   */
  receive(agentId: string, options?: ReceiveOptions): AgentMessage[] {
    const mailbox = this.mailboxes.get(agentId);
    if (!mailbox || mailbox.unreadCount === 0) return [];

    const now = Date.now();
    const readIndex = mailbox.messages.length - mailbox.unreadCount;

    // Get unread messages
    let unread = mailbox.messages.slice(readIndex);

    // Filter expired messages
    unread = unread.filter(msg => !this.isExpired(msg, now));

    // Apply type filter
    if (options?.type) {
      unread = unread.filter(msg => msg.type === options.type);
    }

    // Apply since filter
    if (options?.since !== undefined) {
      unread = unread.filter(msg => msg.timestamp >= options.since!);
    }

    // Apply limit
    if (options?.limit !== undefined && options.limit > 0) {
      unread = unread.slice(0, options.limit);
    }

    // Mark all as read (regardless of filters, reading marks the mailbox)
    mailbox.unreadCount = 0;
    mailbox.lastRead = now;

    return unread;
  }

  /**
   * Check unread message count without marking any as read.
   *
   * @param agentId - Agent whose unread count to check
   * @returns Number of unread messages (0 if no mailbox)
   */
  peek(agentId: string): number {
    const mailbox = this.mailboxes.get(agentId);
    if (!mailbox) return 0;

    // Count non-expired unread messages
    const now = Date.now();
    const readIndex = mailbox.messages.length - mailbox.unreadCount;
    let validCount = 0;

    for (let i = readIndex; i < mailbox.messages.length; i++) {
      if (!this.isExpired(mailbox.messages[i], now)) {
        validCount++;
      }
    }

    return validCount;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Remove expired messages from all mailboxes.
   * Messages older than `maxAge` milliseconds are removed regardless of TTL.
   * Messages with TTL that have expired are also removed.
   *
   * @param maxAge - Maximum message age in milliseconds
   * @returns Number of messages removed
   */
  cleanup(maxAge: number): number {
    const now = Date.now();
    const cutoff = now - maxAge;
    let removed = 0;

    for (const mailbox of this.mailboxes.values()) {
      const before = mailbox.messages.length;
      const readIndex = mailbox.messages.length - mailbox.unreadCount;

      mailbox.messages = mailbox.messages.filter((msg, index) => {
        // Remove if older than max age
        if (msg.timestamp < cutoff) return false;

        // Remove if TTL expired
        if (this.isExpired(msg, now)) return false;

        return true;
      });

      const removedFromMailbox = before - mailbox.messages.length;
      removed += removedFromMailbox;

      // Recalculate unread count
      if (removedFromMailbox > 0) {
        // The unread messages are at the tail. After filtering, we need
        // to recalculate based on the new message array and lastRead.
        mailbox.unreadCount = mailbox.messages.filter(
          msg => msg.timestamp > mailbox.lastRead
        ).length;
      }
    }

    return removed;
  }

  // ============================================================================
  // Event Subscriptions
  // ============================================================================

  /**
   * Register a handler for messages delivered to a specific agent.
   *
   * @param agentId - Agent whose messages to listen for
   * @param handler - Callback invoked on each message delivery
   * @returns Unsubscribe function
   */
  onMessage(agentId: string, handler: MessageHandler): () => void {
    let handlers = this.messageHandlers.get(agentId);
    if (!handlers) {
      handlers = [];
      this.messageHandlers.set(agentId, handlers);
    }
    handlers.push(handler);

    return () => {
      const list = this.messageHandlers.get(agentId);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  /**
   * Register a handler for broadcasts to a specific domain.
   *
   * @param domain - Domain to listen for broadcasts on
   * @param handler - Callback invoked on each broadcast
   * @returns Unsubscribe function
   */
  onBroadcast(domain: string, handler: BroadcastHandler): () => void {
    let handlers = this.broadcastHandlers.get(domain);
    if (!handlers) {
      handlers = [];
      this.broadcastHandlers.set(domain, handlers);
    }
    handlers.push(handler);

    return () => {
      const list = this.broadcastHandlers.get(domain);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get all agent IDs that have mailboxes in a given domain.
   *
   * @param domain - Domain to query
   * @returns Array of agent IDs
   */
  getAgentsInDomain(domain: string): string[] {
    const agents = this.domainAgents.get(domain);
    return agents ? Array.from(agents) : [];
  }

  /**
   * Get all registered domains.
   *
   * @returns Array of domain names
   */
  getDomains(): string[] {
    return Array.from(this.domainAgents.keys());
  }

  /**
   * Get total number of mailboxes.
   */
  get size(): number {
    return this.mailboxes.size;
  }

  /**
   * Clear all mailboxes, handlers, and domain indexes.
   */
  clear(): void {
    this.mailboxes.clear();
    this.messageHandlers.clear();
    this.broadcastHandlers.clear();
    this.domainAgents.clear();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Check if a message has expired based on its TTL.
   */
  private isExpired(message: AgentMessage, now: number): boolean {
    if (!message.ttl || message.ttl <= 0) return false;
    return now > message.timestamp + message.ttl;
  }

  /**
   * Create an immutable snapshot of a mutable mailbox.
   */
  private toSnapshot(mailbox: MutableMailbox): AgentMailbox {
    return {
      agentId: mailbox.agentId,
      domain: mailbox.domain,
      messages: [...mailbox.messages],
      unreadCount: mailbox.unreadCount,
      lastRead: mailbox.lastRead,
    };
  }
}

// ============================================================================
// Internal Mutable Mailbox
// ============================================================================

/**
 * Internal mutable representation of a mailbox.
 * The public API only exposes immutable AgentMailbox snapshots.
 */
interface MutableMailbox {
  readonly agentId: string;
  readonly domain: string;
  messages: AgentMessage[];
  unreadCount: number;
  lastRead: number;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new MailboxService instance.
 *
 * @returns A fresh MailboxService
 */
export function createMailboxService(): MailboxService {
  return new MailboxService();
}
