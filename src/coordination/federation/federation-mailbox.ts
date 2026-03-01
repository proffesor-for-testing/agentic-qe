/**
 * Agentic QE v3 - Federation Mailbox
 * ADR-064 Phase 4B: Routes messages between fleet instances
 *
 * The FederationMailbox manages cross-fleet communication for the AQE
 * federation layer. It provides:
 * - Service registration and discovery by domain
 * - Heartbeat-based health monitoring with automatic degradation
 * - Priority-based routing with fallback to domain-based discovery
 * - Outbox/inbox queues for asynchronous transport integration
 * - Subscription-based message delivery to local handlers
 *
 * Usage:
 * ```typescript
 * import { createFederationMailbox } from './federation-mailbox.js';
 *
 * const mailbox = createFederationMailbox({ localFleetId: 'fleet-a' });
 *
 * // Register a remote fleet
 * mailbox.registerService('fleet-b', 'Coverage Fleet', ['coverage-analysis']);
 *
 * // Add a route
 * mailbox.addRoute('test-generation', 'coverage-analysis', 'fleet-b', 10);
 *
 * // Send a message
 * const msg = mailbox.send('fleet-b', 'test-generation', 'coverage-analysis',
 *   'task-request', { spec: 'auth-module' });
 *
 * // Transport layer drains outbox and delivers
 * const pending = mailbox.drainOutbox();
 *
 * // Subscribe to incoming messages
 * const unsub = mailbox.onMessage((msg) => console.log(msg.type));
 * mailbox.receive(incomingMessage);
 * ```
 */

import { randomUUID } from 'node:crypto';
import type {
  FleetId,
  FederatedService,
  FederatedMessage,
  FederatedMessageType,
  FederationRoute,
  FederationHealth,
  FederationConfig,
  ServiceStatus,
} from './types.js';
import { DEFAULT_FEDERATION_CONFIG } from './types.js';

// ============================================================================
// Handler Type
// ============================================================================

/** Handler for incoming federated messages */
export type FederatedMessageHandler = (message: FederatedMessage) => void;

// ============================================================================
// Federation Mailbox
// ============================================================================

/**
 * Routes messages between fleet instances in a federated AQE deployment.
 * Manages service registration, routing rules, and message queues.
 *
 * Messages flow through an outbox (for sending) and inbox (for receiving).
 * A transport layer (not included) is responsible for physically moving
 * messages between fleet instances by draining the outbox and calling
 * `receive()` on the target mailbox.
 */
export class FederationMailbox {
  private readonly config: FederationConfig;
  private readonly services = new Map<FleetId, MutableService>();
  private readonly routes: MutableRoute[] = [];
  private readonly outbox: FederatedMessage[] = [];
  private readonly inbox: FederatedMessage[] = [];
  private readonly handlers: FederatedMessageHandler[] = [];
  private messagesSent = 0;
  private messagesReceived = 0;

  constructor(config?: Partial<FederationConfig>) {
    this.config = { ...DEFAULT_FEDERATION_CONFIG, ...config };
  }

  // ============================================================================
  // Service Registration
  // ============================================================================

  /**
   * Register a remote fleet service in the federation.
   * The service is immediately marked as 'active' with a fresh heartbeat.
   *
   * @param fleetId - Unique fleet identifier
   * @param name - Human-readable service name
   * @param domains - QE domains this service handles
   * @param metadata - Optional key-value metadata
   * @returns Immutable snapshot of the registered service
   * @throws Error if a service with the same fleetId is already registered
   */
  registerService(
    fleetId: FleetId,
    name: string,
    domains: string[],
    metadata?: Record<string, string>,
  ): FederatedService {
    if (this.services.has(fleetId)) {
      throw new Error(`Service '${fleetId}' already registered`);
    }
    const now = Date.now();
    const service: MutableService = {
      fleetId,
      name,
      domains: [...domains],
      status: 'active',
      registeredAt: now,
      lastHeartbeat: now,
      metadata,
    };
    this.services.set(fleetId, service);
    return toServiceSnapshot(service);
  }

  /**
   * Deregister a service, removing it and all routes targeting it.
   *
   * @param fleetId - Fleet to deregister
   * @returns True if the service existed and was removed
   */
  deregisterService(fleetId: FleetId): boolean {
    const service = this.services.get(fleetId);
    if (!service) return false;
    service.status = 'deregistered';

    // Remove routes pointing to this fleet
    for (let i = this.routes.length - 1; i >= 0; i--) {
      if (this.routes[i].targetFleetId === fleetId) {
        this.routes.splice(i, 1);
      }
    }

    this.services.delete(fleetId);
    return true;
  }

  /**
   * Record a heartbeat from a remote service, updating its last-seen
   * timestamp. If the service was degraded or unreachable, it is
   * promoted back to 'active'.
   *
   * @param fleetId - Fleet sending the heartbeat
   * @returns True if the service exists and the heartbeat was recorded
   */
  heartbeat(fleetId: FleetId): boolean {
    const service = this.services.get(fleetId);
    if (!service) return false;
    service.lastHeartbeat = Date.now();
    if (service.status === 'degraded' || service.status === 'unreachable') {
      service.status = 'active';
    }
    return true;
  }

  // ============================================================================
  // Routing
  // ============================================================================

  /**
   * Add a routing rule for cross-fleet message delivery.
   * Routes are sorted by priority (descending) so highest-priority routes
   * are evaluated first during resolution.
   *
   * @param sourceDomain - Source domain that sends messages
   * @param targetDomain - Target domain that receives messages
   * @param targetFleetId - Fleet this route delivers to
   * @param priority - Route priority (higher = preferred, default 0)
   * @returns Immutable snapshot of the created route
   * @throws Error if the maximum number of routes has been reached
   */
  addRoute(
    sourceDomain: string,
    targetDomain: string,
    targetFleetId: FleetId,
    priority: number = 0,
  ): FederationRoute {
    if (this.routes.length >= this.config.maxRoutes) {
      throw new Error(`Maximum routes (${this.config.maxRoutes}) reached`);
    }
    const route: MutableRoute = {
      sourceDomain,
      targetDomain,
      targetFleetId,
      priority,
      active: true,
    };
    this.routes.push(route);
    this.routes.sort((a, b) => b.priority - a.priority);
    return toRouteSnapshot(route);
  }

  /**
   * Remove a routing rule matching the source domain and target fleet.
   *
   * @param sourceDomain - Source domain of the route
   * @param targetFleetId - Target fleet of the route
   * @returns True if a matching route was found and removed
   */
  removeRoute(sourceDomain: string, targetFleetId: FleetId): boolean {
    const idx = this.routes.findIndex(
      r => r.sourceDomain === sourceDomain && r.targetFleetId === targetFleetId,
    );
    if (idx < 0) return false;
    this.routes.splice(idx, 1);
    return true;
  }

  // ============================================================================
  // Message Sending
  // ============================================================================

  /**
   * Send a message to a specific fleet or resolve the target via routing.
   * When `targetFleetId` is `'any'`, the mailbox uses priority-based route
   * resolution with fallback to domain-based service discovery.
   *
   * Messages are placed in the outbox for the transport layer to drain
   * and deliver to the target fleet's mailbox.
   *
   * @param targetFleetId - Specific fleet ID or 'any' for route resolution
   * @param sourceDomain - Domain context of the sender
   * @param targetDomain - Domain the message is intended for
   * @param type - Message type classification
   * @param payload - Message payload
   * @param options - Optional correlation ID and TTL
   * @returns The created message
   * @throws Error if no route can be resolved when targetFleetId is 'any'
   */
  send(
    targetFleetId: FleetId | 'any',
    sourceDomain: string,
    targetDomain: string,
    type: FederatedMessageType,
    payload: unknown,
    options?: { correlationId?: string; ttl?: number },
  ): FederatedMessage {
    const resolvedTarget = targetFleetId === 'any'
      ? this.resolveRoute(sourceDomain, targetDomain)
      : targetFleetId;

    if (!resolvedTarget) {
      throw new Error(`No route found for ${sourceDomain} -> ${targetDomain}`);
    }

    const message: FederatedMessage = {
      id: randomUUID(),
      sourceFleetId: this.config.localFleetId,
      targetFleetId: resolvedTarget,
      sourceDomain,
      targetDomain,
      type,
      payload,
      timestamp: Date.now(),
      ttl: options?.ttl,
      correlationId: options?.correlationId,
    };

    if (this.outbox.length >= this.config.maxPendingMessages) {
      this.outbox.shift(); // Drop oldest to stay within limit
    }
    this.outbox.push(message);
    this.messagesSent++;
    return message;
  }

  // ============================================================================
  // Message Receiving
  // ============================================================================

  /**
   * Receive a message from a remote fleet. The message is placed in the
   * inbox and all registered handlers are notified synchronously.
   *
   * @param message - The incoming federated message
   */
  receive(message: FederatedMessage): void {
    if (this.inbox.length >= this.config.maxPendingMessages) {
      this.inbox.shift(); // Drop oldest to stay within limit
    }
    this.inbox.push(message);
    this.messagesReceived++;
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch {
        // Swallow handler errors to avoid breaking delivery
      }
    }
  }

  /**
   * Subscribe to incoming federated messages.
   *
   * @param handler - Callback invoked on each received message
   * @returns Unsubscribe function
   */
  onMessage(handler: FederatedMessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  // ============================================================================
  // Queue Draining
  // ============================================================================

  /**
   * Drain the outbox, returning all pending outbound messages.
   * The outbox is cleared after draining. The transport layer should
   * call this periodically to deliver messages to remote fleets.
   *
   * @returns Array of messages that were in the outbox
   */
  drainOutbox(): FederatedMessage[] {
    const messages = [...this.outbox];
    this.outbox.length = 0;
    return messages;
  }

  /**
   * Drain the inbox, returning all pending inbound messages.
   * The inbox is cleared after draining.
   *
   * @returns Array of messages that were in the inbox
   */
  drainInbox(): FederatedMessage[] {
    const messages = [...this.inbox];
    this.inbox.length = 0;
    return messages;
  }

  // ============================================================================
  // Service Discovery
  // ============================================================================

  /**
   * Find active services that handle a specific domain.
   *
   * @param domain - QE domain to search for
   * @returns Array of active services that list the domain
   */
  findServicesByDomain(domain: string): FederatedService[] {
    return Array.from(this.services.values())
      .filter(s => s.status === 'active' && s.domains.includes(domain))
      .map(toServiceSnapshot);
  }

  /**
   * Get a service by its fleet ID.
   *
   * @param fleetId - Fleet identifier to look up
   * @returns Service snapshot or undefined if not found
   */
  getService(fleetId: FleetId): FederatedService | undefined {
    const s = this.services.get(fleetId);
    return s ? toServiceSnapshot(s) : undefined;
  }

  /**
   * List all registered services (regardless of status).
   *
   * @returns Array of service snapshots
   */
  listServices(): FederatedService[] {
    return Array.from(this.services.values()).map(toServiceSnapshot);
  }

  /**
   * List all routing rules.
   *
   * @returns Array of route snapshots
   */
  listRoutes(): FederationRoute[] {
    return this.routes.map(toRouteSnapshot);
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Check service health and update statuses based on heartbeat age.
   * Services that have not sent a heartbeat within `serviceTimeoutMs`
   * are marked 'unreachable'. Services past 60% of the timeout are
   * marked 'degraded'.
   */
  checkHealth(): void {
    const now = Date.now();
    for (const service of this.services.values()) {
      if (service.status === 'deregistered') continue;
      const elapsed = now - service.lastHeartbeat;
      if (elapsed > this.config.serviceTimeoutMs) {
        service.status = 'unreachable';
      } else if (elapsed > this.config.serviceTimeoutMs * 0.6) {
        service.status = 'degraded';
      }
    }
  }

  /**
   * Get a summary of the federation's current health.
   *
   * @returns Health snapshot with counts and counters
   */
  getHealth(): FederationHealth {
    return {
      localFleetId: this.config.localFleetId,
      connectedServices: Array.from(this.services.values())
        .filter(s => s.status === 'active').length,
      activeRoutes: this.routes.filter(r => r.active).length,
      pendingMessages: this.outbox.length + this.inbox.length,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Dispose all state, clearing services, routes, queues, and handlers.
   */
  dispose(): void {
    this.services.clear();
    this.routes.length = 0;
    this.outbox.length = 0;
    this.inbox.length = 0;
    this.handlers.length = 0;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Resolve a route for the given source -> target domain pair.
   * First checks explicit routes (sorted by priority), then falls back
   * to domain-based service discovery.
   */
  private resolveRoute(
    sourceDomain: string,
    targetDomain: string,
  ): FleetId | undefined {
    // Check explicit routes in priority order
    for (const route of this.routes) {
      if (!route.active) continue;
      if (
        route.sourceDomain === sourceDomain &&
        route.targetDomain === targetDomain
      ) {
        const service = this.services.get(route.targetFleetId);
        if (service && service.status === 'active') {
          return route.targetFleetId;
        }
      }
    }

    // Fallback: find any active service that handles the target domain
    const candidates = this.findServicesByDomain(targetDomain);
    return candidates.length > 0 ? candidates[0].fleetId : undefined;
  }
}

// ============================================================================
// Internal Mutable Types
// ============================================================================

/**
 * Internal mutable representation of a federated service.
 * Public API only exposes immutable FederatedService snapshots.
 */
interface MutableService {
  fleetId: FleetId;
  name: string;
  domains: string[];
  status: ServiceStatus;
  registeredAt: number;
  lastHeartbeat: number;
  metadata?: Record<string, string>;
}

/**
 * Internal mutable representation of a federation route.
 * Public API only exposes immutable FederationRoute snapshots.
 */
interface MutableRoute {
  sourceDomain: string;
  targetDomain: string;
  targetFleetId: FleetId;
  priority: number;
  active: boolean;
}

// ============================================================================
// Snapshot Helpers
// ============================================================================

/** Create an immutable snapshot of a mutable service */
function toServiceSnapshot(service: MutableService): FederatedService {
  return {
    fleetId: service.fleetId,
    name: service.name,
    domains: [...service.domains],
    status: service.status,
    registeredAt: service.registeredAt,
    lastHeartbeat: service.lastHeartbeat,
    metadata: service.metadata,
    endpoint: undefined,
  };
}

/** Create an immutable snapshot of a mutable route */
function toRouteSnapshot(route: MutableRoute): FederationRoute {
  return {
    sourceDomain: route.sourceDomain,
    targetDomain: route.targetDomain,
    targetFleetId: route.targetFleetId,
    priority: route.priority,
    active: route.active,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new FederationMailbox instance.
 *
 * @param config - Optional partial configuration (merged with defaults)
 * @returns A fresh FederationMailbox
 */
export function createFederationMailbox(
  config?: Partial<FederationConfig>,
): FederationMailbox {
  return new FederationMailbox(config);
}
