/**
 * Agentic QE v3 - Cross-Fleet Federation Types
 * ADR-064 Phase 4B: Multi-Service Communication
 *
 * Defines the type contracts for cross-fleet federation, enabling multiple
 * fleet instances (e.g., running in different services/repos) to exchange
 * messages through a federation layer.
 *
 * Types are intentionally readonly to enforce immutability at public API
 * boundaries. Mutable counterparts live inside the FederationMailbox class.
 */

// ============================================================================
// Identifiers
// ============================================================================

/** Unique identifier for a fleet instance in the federation */
export type FleetId = string;

// ============================================================================
// Service Registration
// ============================================================================

/** Service registration in the federation */
export interface FederatedService {
  /** Unique fleet identifier for this service */
  readonly fleetId: FleetId;

  /** Human-readable service name */
  readonly name: string;

  /** QE domains this service handles (e.g., 'test-generation', 'coverage-analysis') */
  readonly domains: string[];

  /** Optional transport endpoint for remote communication */
  readonly endpoint?: string;

  /** Current health status of the service */
  readonly status: ServiceStatus;

  /** Epoch timestamp when the service was registered */
  readonly registeredAt: number;

  /** Epoch timestamp of the last heartbeat received */
  readonly lastHeartbeat: number;

  /** Arbitrary metadata attached to the service */
  readonly metadata?: Record<string, string>;
}

/** Health status of a federated service */
export type ServiceStatus = 'active' | 'degraded' | 'unreachable' | 'deregistered';

// ============================================================================
// Federated Messages
// ============================================================================

/** Message routed between fleet instances */
export interface FederatedMessage {
  /** Unique message identifier */
  readonly id: string;

  /** Fleet that originated this message */
  readonly sourceFleetId: FleetId;

  /** Target fleet ID, or 'any' for route-based resolution */
  readonly targetFleetId: FleetId | 'any';

  /** Domain context of the sender */
  readonly sourceDomain: string;

  /** Domain context the message is intended for */
  readonly targetDomain: string;

  /** Classification of the message */
  readonly type: FederatedMessageType;

  /** Message payload (type depends on message type) */
  readonly payload: unknown;

  /** Epoch timestamp when the message was created */
  readonly timestamp: number;

  /** Time-to-live in milliseconds (message expires after this duration) */
  readonly ttl?: number;

  /** Correlation ID for tracking related messages across fleets */
  readonly correlationId?: string;
}

/** Types of messages exchanged between federated fleets */
export type FederatedMessageType =
  | 'task-request'
  | 'task-response'
  | 'finding-share'
  | 'pattern-share'
  | 'health-report'
  | 'capability-query'
  | 'capability-response';

// ============================================================================
// Routing
// ============================================================================

/** Route definition for cross-fleet message routing */
export interface FederationRoute {
  /** Source domain that sends messages via this route */
  readonly sourceDomain: string;

  /** Target domain that receives messages via this route */
  readonly targetDomain: string;

  /** Fleet ID this route delivers to */
  readonly targetFleetId: FleetId;

  /** Priority for route selection (higher = preferred) */
  readonly priority: number;

  /** Whether this route is currently active */
  readonly active: boolean;
}

// ============================================================================
// Health
// ============================================================================

/** Federation health summary */
export interface FederationHealth {
  /** This fleet's identifier */
  readonly localFleetId: FleetId;

  /** Number of services currently in 'active' status */
  readonly connectedServices: number;

  /** Number of active routing rules */
  readonly activeRoutes: number;

  /** Total pending messages in inbox + outbox */
  readonly pendingMessages: number;

  /** Total messages sent since creation */
  readonly messagesSent: number;

  /** Total messages received since creation */
  readonly messagesReceived: number;
}

// ============================================================================
// Configuration
// ============================================================================

/** Configuration for the federation mailbox */
export interface FederationConfig {
  /** This fleet's unique identifier in the federation */
  readonly localFleetId: FleetId;

  /** Interval between heartbeat checks in milliseconds */
  readonly heartbeatIntervalMs: number;

  /** Time after last heartbeat before a service is marked unreachable */
  readonly serviceTimeoutMs: number;

  /** Maximum number of pending messages (inbox + outbox each) */
  readonly maxPendingMessages: number;

  /** Maximum number of routing rules */
  readonly maxRoutes: number;
}

/** Sensible defaults for federation configuration */
export const DEFAULT_FEDERATION_CONFIG: FederationConfig = {
  localFleetId: 'local',
  heartbeatIntervalMs: 30_000,
  serviceTimeoutMs: 90_000,
  maxPendingMessages: 5000,
  maxRoutes: 100,
};
