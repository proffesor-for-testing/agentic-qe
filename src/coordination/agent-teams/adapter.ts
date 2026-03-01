/**
 * Agentic QE v3 - Agent Teams Adapter
 * ADR-064: High-level communication adapter for agent teams
 *
 * Wraps MailboxService with team management, message validation,
 * and a subscription-based event model for the Fleet system.
 */

import { randomUUID } from 'node:crypto';
import { MailboxService } from './mailbox.js';
import {
  AgentMessage,
  AgentMessageType,
  DomainTeamConfig,
  AgentTeamsAdapterConfig,
  DEFAULT_AGENT_TEAMS_CONFIG,
  MessageHandler,
  TeamStatus,
} from './types.js';
import type { TraceContext } from './tracing.js';
import { encodeTraceContext } from './tracing.js';

// ============================================================================
// Agent Teams Adapter
// ============================================================================

/**
 * High-level adapter for agent teams communication.
 * Manages team membership, validates message targets, and provides
 * a subscription-based interface for incoming messages.
 */
export class AgentTeamsAdapter {
  private readonly mailbox: MailboxService;
  private readonly config: AgentTeamsAdapterConfig;
  private readonly teams = new Map<string, MutableTeamConfig>();
  private readonly registeredAgents = new Set<string>();
  private readonly agentDomains = new Map<string, string>();
  private readonly subscriptions = new Map<string, MessageHandler[]>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(
    mailboxService?: MailboxService,
    config?: Partial<AgentTeamsAdapterConfig>
  ) {
    this.mailbox = mailboxService ?? new MailboxService();
    this.config = { ...DEFAULT_AGENT_TEAMS_CONFIG, ...config };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /** Initialize the adapter and start background cleanup. */
  initialize(config?: Partial<AgentTeamsAdapterConfig>): void {
    if (this.initialized) return;
    if (config) Object.assign(this.config, config);

    if (this.config.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.performCleanup();
      }, this.config.cleanupIntervalMs);
    }
    this.initialized = true;
  }

  /** Shut down the adapter and release all resources. */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.mailbox.clear();
    this.teams.clear();
    this.registeredAgents.clear();
    this.agentDomains.clear();
    this.subscriptions.clear();
    this.initialized = false;
  }

  // ============================================================================
  // Team Management
  // ============================================================================

  /**
   * Create a domain team. The lead and all teammates are auto-registered.
   * @throws Error if the domain already has a team
   */
  createTeam(config: DomainTeamConfig): void {
    if (this.teams.has(config.domain)) {
      throw new Error(
        `Team already exists for domain '${config.domain}'. ` +
        `Use getTeamStatus() to inspect the existing team.`
      );
    }

    const team: MutableTeamConfig = {
      domain: config.domain,
      leadAgentId: config.leadAgentId,
      maxTeammates: config.maxTeammates,
      teammateIds: [...config.teammateIds],
      autoAssignEnabled: config.autoAssignEnabled,
    };
    this.teams.set(config.domain, team);

    this.registerAgent(config.leadAgentId, config.domain);
    for (const teammateId of config.teammateIds) {
      this.registerAgent(teammateId, config.domain);
    }
  }

  /** Get team status or undefined if no team exists for this domain. */
  getTeamStatus(domain: string): TeamStatus | undefined {
    const team = this.teams.get(domain);
    if (!team) return undefined;

    const allAgentIds = [team.leadAgentId, ...team.teammateIds];
    const idleAgentIds = allAgentIds.filter(id => this.mailbox.peek(id) === 0);
    let totalUnread = 0;
    for (const id of allAgentIds) {
      totalUnread += this.mailbox.peek(id);
    }

    return {
      domain: team.domain,
      leadAgentId: team.leadAgentId,
      teammateIds: [...team.teammateIds],
      activeAgentCount: allAgentIds.filter(id => this.registeredAgents.has(id)).length,
      idleAgentIds,
      totalUnreadMessages: totalUnread,
    };
  }

  // ============================================================================
  // Agent Registration
  // ============================================================================

  /**
   * Register an agent, creating a mailbox and tracking its domain.
   * Auto-assigns to team if applicable.
   */
  registerAgent(agentId: string, domain: string): void {
    if (this.registeredAgents.has(agentId)) return;

    this.registeredAgents.add(agentId);
    this.agentDomains.set(agentId, domain);
    this.mailbox.createMailbox(agentId, domain);

    const team = this.teams.get(domain);
    if (
      team &&
      team.autoAssignEnabled &&
      agentId !== team.leadAgentId &&
      !team.teammateIds.includes(agentId) &&
      team.teammateIds.length < team.maxTeammates
    ) {
      team.teammateIds.push(agentId);
    }
  }

  /** Unregister an agent, removing its mailbox and team membership. */
  unregisterAgent(agentId: string): boolean {
    if (!this.registeredAgents.has(agentId)) return false;

    const domain = this.agentDomains.get(agentId);
    if (domain) {
      const team = this.teams.get(domain);
      if (team) {
        const idx = team.teammateIds.indexOf(agentId);
        if (idx >= 0) team.teammateIds.splice(idx, 1);
      }
    }

    this.mailbox.deleteMailbox(agentId);
    this.subscriptions.delete(agentId);
    this.registeredAgents.delete(agentId);
    this.agentDomains.delete(agentId);
    return true;
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  /**
   * Send a typed message from one agent to another.
   * Both sender and receiver must be registered agents.
   * @throws Error if sender or receiver is not registered
   */
  sendMessage(
    from: string,
    to: string,
    type: AgentMessageType,
    payload: unknown,
    options?: SendMessageOptions
  ): AgentMessage {
    this.validateAgent(from, 'sender');
    this.validateAgent(to, 'recipient');

    const senderDomain = this.agentDomains.get(from)!;
    // ADR-064 Phase 3: Encode trace context into correlationId if provided
    const correlationId = options?.traceContext
      ? encodeTraceContext(options.traceContext)
      : options?.correlationId;

    const message: AgentMessage = {
      id: randomUUID(),
      from,
      to,
      domain: options?.domain ?? senderDomain,
      type,
      payload,
      timestamp: Date.now(),
      correlationId,
      replyTo: options?.replyTo,
      ttl: options?.ttl ?? (this.config.defaultTtlMs > 0 ? this.config.defaultTtlMs : undefined),
    };

    this.mailbox.send(message);
    this.notifySubscribers(to, message);
    return message;
  }

  /**
   * Broadcast a message to all agents in a domain.
   * @throws Error if the sender (when provided) is not registered
   */
  broadcast(
    domain: string,
    type: AgentMessageType,
    payload: unknown,
    options?: BroadcastOptions
  ): AgentMessage {
    const from = options?.from ?? '__system__';
    if (from !== '__system__') {
      this.validateAgent(from, 'broadcast sender');
    }

    // ADR-064 Phase 3: Encode trace context into correlationId if provided
    const correlationId = options?.traceContext
      ? encodeTraceContext(options.traceContext)
      : options?.correlationId;

    const message: AgentMessage = {
      id: randomUUID(),
      from,
      to: 'broadcast',
      domain,
      type,
      payload,
      timestamp: Date.now(),
      correlationId,
      ttl: options?.ttl ?? (this.config.defaultTtlMs > 0 ? this.config.defaultTtlMs : undefined),
    };

    this.mailbox.broadcast(domain, message);

    const agents = this.mailbox.getAgentsInDomain(domain);
    for (const agentId of agents) {
      if (agentId !== from) {
        this.notifySubscribers(agentId, message);
      }
    }
    return message;
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Subscribe to incoming messages for a specific agent.
   * @returns Unsubscribe function
   * @throws Error if the agent is not registered
   */
  onMessage(agentId: string, handler: MessageHandler): () => void {
    this.validateAgent(agentId, 'subscription target');

    let handlers = this.subscriptions.get(agentId);
    if (!handlers) {
      handlers = [];
      this.subscriptions.set(agentId, handlers);
    }
    handlers.push(handler);

    return () => {
      const list = this.subscriptions.get(agentId);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /** Get agents with no pending (unread) messages, optionally filtered by domain. */
  getIdleAgents(domain?: string): string[] {
    const idle: string[] = [];
    const source = domain
      ? this.mailbox.getAgentsInDomain(domain)
      : Array.from(this.registeredAgents);

    for (const agentId of source) {
      if (this.mailbox.peek(agentId) === 0) idle.push(agentId);
    }
    return idle;
  }

  /** Check if an agent is registered. */
  isRegistered(agentId: string): boolean {
    return this.registeredAgents.has(agentId);
  }

  /** Get the domain an agent belongs to. */
  getAgentDomain(agentId: string): string | undefined {
    return this.agentDomains.get(agentId);
  }

  /** Get all registered agent IDs. */
  getRegisteredAgents(): string[] {
    return Array.from(this.registeredAgents);
  }

  /** Get unread message count for an agent without consuming messages. */
  getUnreadCount(agentId: string): number {
    return this.mailbox.peek(agentId);
  }

  /** Retrieve and consume unread messages for an agent. */
  receiveMessages(agentId: string): AgentMessage[] {
    return this.mailbox.receive(agentId);
  }

  /** Get the underlying MailboxService (for testing and advanced usage). */
  getMailboxService(): MailboxService {
    return this.mailbox;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private validateAgent(agentId: string, role: string): void {
    if (!this.registeredAgents.has(agentId)) {
      throw new Error(
        `Unknown ${role} '${agentId}'. ` +
        `Register the agent first with registerAgent() or createTeam().`
      );
    }
  }

  private notifySubscribers(agentId: string, message: AgentMessage): void {
    const handlers = this.subscriptions.get(agentId);
    if (!handlers || handlers.length === 0) return;
    for (const handler of handlers) {
      try {
        handler(message);
      } catch {
        // Swallow subscriber errors to avoid breaking message flow
      }
    }
  }

  private performCleanup(): void {
    const maxAge = this.config.defaultTtlMs > 0
      ? this.config.defaultTtlMs * 10
      : this.config.cleanupIntervalMs * 60;
    this.mailbox.cleanup(maxAge);
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

/** Options for sending a direct message */
export interface SendMessageOptions {
  /** Override domain context */
  readonly domain?: string;
  /** Correlation ID for tracking (overridden if traceContext is provided) */
  readonly correlationId?: string;
  /** Message ID this is replying to */
  readonly replyTo?: string;
  /** Time-to-live in milliseconds */
  readonly ttl?: number;
  /** ADR-064 Phase 3: Trace context to propagate (encoded into correlationId) */
  readonly traceContext?: TraceContext;
}

/** Options for broadcasting a message */
export interface BroadcastOptions {
  /** Sender agent ID (defaults to '__system__') */
  readonly from?: string;
  /** Correlation ID for tracking (overridden if traceContext is provided) */
  readonly correlationId?: string;
  /** Time-to-live in milliseconds */
  readonly ttl?: number;
  /** ADR-064 Phase 3: Trace context to propagate (encoded into correlationId) */
  readonly traceContext?: TraceContext;
}

/** Internal mutable team config for adapter management */
interface MutableTeamConfig {
  readonly domain: string;
  readonly leadAgentId: string;
  readonly maxTeammates: number;
  teammateIds: string[];
  readonly autoAssignEnabled: boolean;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AgentTeamsAdapter with optional configuration.
 * Call `initialize()` after creation to start background cleanup.
 */
export function createAgentTeamsAdapter(
  config?: Partial<AgentTeamsAdapterConfig>
): AgentTeamsAdapter {
  return new AgentTeamsAdapter(undefined, config);
}
