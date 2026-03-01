/**
 * Agentic QE v3 - Cross-Fleet Federation Module
 * ADR-064 Phase 4B: Multi-Service Communication
 *
 * Enables multiple fleet instances (e.g., running in different services or
 * repositories) to exchange messages through a federation layer. Services
 * register with the FederationMailbox, which handles routing, health
 * monitoring, and queue management.
 *
 * Usage:
 * ```typescript
 * import {
 *   createFederationMailbox,
 *   FederationMailbox,
 * } from '@agentic-qe/v3/coordination/federation';
 *
 * const mailbox = createFederationMailbox({ localFleetId: 'fleet-a' });
 *
 * // Register a remote fleet service
 * mailbox.registerService('fleet-b', 'Coverage Service', ['coverage-analysis']);
 *
 * // Route and send messages
 * mailbox.addRoute('test-generation', 'coverage-analysis', 'fleet-b', 10);
 * mailbox.send('fleet-b', 'test-generation', 'coverage-analysis',
 *   'task-request', { spec: 'auth-module' });
 *
 * // Transport layer drains outbox
 * const pending = mailbox.drainOutbox();
 *
 * // Cleanup
 * mailbox.dispose();
 * ```
 */

// ============================================================================
// Federation Mailbox
// ============================================================================

export {
  FederationMailbox,
  createFederationMailbox,
} from './federation-mailbox.js';

export type { FederatedMessageHandler } from './federation-mailbox.js';

// ============================================================================
// Types
// ============================================================================

export type {
  FleetId,
  FederatedService,
  FederatedMessage,
  FederatedMessageType,
  FederationRoute,
  FederationHealth,
  FederationConfig,
  ServiceStatus,
} from './types.js';

export { DEFAULT_FEDERATION_CONFIG } from './types.js';
