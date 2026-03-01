/**
 * Agentic QE v3 - Agent Teams Communication Types
 * ADR-064: Core type definitions for inter-agent messaging
 *
 * Defines the message protocol, mailbox structures, and team configuration
 * used by the Agent Teams communication layer that sits on top of the
 * Queen Coordinator for direct agent-to-agent messaging.
 */

// ============================================================================
// Message Types
// ============================================================================

/**
 * Types of messages that agents can exchange
 */
export type AgentMessageType =
  | 'task-assignment'
  | 'finding'
  | 'challenge'
  | 'consensus'
  | 'alert'
  | 'heartbeat'
  | 'idle-notification'
  | 'completion-report';

/**
 * Agent message for direct inter-agent communication.
 * Supports request-response patterns via `replyTo` and TTL-based expiration.
 */
export interface AgentMessage {
  /** Unique message identifier */
  readonly id: string;

  /** Sender agent ID */
  readonly from: string;

  /** Target agent ID or 'broadcast' for domain-wide delivery */
  readonly to: string | 'broadcast';

  /** Domain context for the message */
  readonly domain: string;

  /** Message type classification */
  readonly type: AgentMessageType;

  /** Message payload (type depends on message type) */
  readonly payload: unknown;

  /** Epoch timestamp when the message was created */
  readonly timestamp: number;

  /** Correlation ID for tracking related messages */
  readonly correlationId?: string;

  /** Message ID this is a reply to (for request-response patterns) */
  readonly replyTo?: string;

  /** Time-to-live in milliseconds (message expires after this duration) */
  readonly ttl?: number;
}

// ============================================================================
// Mailbox Types
// ============================================================================

/**
 * Per-agent mailbox holding inbound messages
 */
export interface AgentMailbox {
  /** Agent that owns this mailbox */
  readonly agentId: string;

  /** Domain the agent belongs to */
  readonly domain: string;

  /** Messages in the mailbox (ordered by arrival time) */
  readonly messages: AgentMessage[];

  /** Number of unread messages */
  readonly unreadCount: number;

  /** Epoch timestamp of the last read operation */
  readonly lastRead: number;
}

// ============================================================================
// Team Configuration
// ============================================================================

/**
 * Configuration for a domain team - a group of agents coordinating
 * within a single domain context
 */
export interface DomainTeamConfig {
  /** Domain this team operates in */
  readonly domain: string;

  /** Agent ID of the team lead */
  readonly leadAgentId: string;

  /** Maximum number of teammates allowed */
  readonly maxTeammates: number;

  /** Current teammate agent IDs */
  readonly teammateIds: string[];

  /** Whether new agents are automatically assigned to this team */
  readonly autoAssignEnabled: boolean;
}

// ============================================================================
// Event Callback Types
// ============================================================================

/**
 * Handler invoked when a message is delivered to a mailbox
 */
export type MessageHandler = (message: AgentMessage) => void;

/**
 * Handler invoked when a broadcast is sent to a domain
 */
export type BroadcastHandler = (domain: string, message: AgentMessage) => void;

// ============================================================================
// Adapter Configuration
// ============================================================================

/**
 * Configuration for the AgentTeamsAdapter
 */
export interface AgentTeamsAdapterConfig {
  /** Default TTL for messages in milliseconds (0 = no expiration) */
  readonly defaultTtlMs: number;

  /** Interval for cleanup of expired messages in milliseconds */
  readonly cleanupIntervalMs: number;

  /** Maximum messages per mailbox before oldest are pruned */
  readonly maxMailboxSize: number;
}

/**
 * Default adapter configuration
 */
export const DEFAULT_AGENT_TEAMS_CONFIG: AgentTeamsAdapterConfig = {
  defaultTtlMs: 0,
  cleanupIntervalMs: 60_000,
  maxMailboxSize: 1000,
};

// ============================================================================
// Receive Options
// ============================================================================

/**
 * Options for receiving messages from a mailbox
 */
export interface ReceiveOptions {
  /** Maximum number of messages to retrieve */
  readonly limit?: number;

  /** Filter by message type */
  readonly type?: AgentMessageType;

  /** Only messages after this timestamp */
  readonly since?: number;
}

// ============================================================================
// Team Status
// ============================================================================

/**
 * Status report for a domain team
 */
export interface TeamStatus {
  /** Domain this team operates in */
  readonly domain: string;

  /** Agent ID of the team lead */
  readonly leadAgentId: string;

  /** Current teammate agent IDs */
  readonly teammateIds: string[];

  /** Number of active (registered) agents */
  readonly activeAgentCount: number;

  /** Agents with no pending messages */
  readonly idleAgentIds: string[];

  /** Total unread messages across all agents */
  readonly totalUnreadMessages: number;
}
