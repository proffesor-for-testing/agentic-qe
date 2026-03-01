/**
 * Agentic QE v3 - Agent Teams Communication Layer
 * ADR-064: Inter-agent messaging for the Fleet system
 *
 * Provides direct agent-to-agent communication layered on top of the
 * Queen Coordinator. Agents can send typed messages, broadcast to domain
 * teams, and subscribe to incoming messages.
 *
 * Usage:
 * ```typescript
 * import {
 *   createAgentTeamsAdapter,
 *   AgentTeamsAdapter,
 *   MailboxService,
 * } from '@agentic-qe/v3/coordination/agent-teams';
 *
 * // Create adapter
 * const adapter = createAgentTeamsAdapter({ defaultTtlMs: 30000 });
 * adapter.initialize();
 *
 * // Create a team
 * adapter.createTeam({
 *   domain: 'test-generation',
 *   leadAgentId: 'lead-1',
 *   maxTeammates: 5,
 *   teammateIds: ['agent-a', 'agent-b'],
 *   autoAssignEnabled: true,
 * });
 *
 * // Send messages
 * adapter.sendMessage('lead-1', 'agent-a', 'task-assignment', {
 *   task: 'Generate unit tests',
 * });
 *
 * // Subscribe to messages
 * const unsub = adapter.onMessage('agent-a', (msg) => {
 *   console.log(`Received: ${msg.type}`);
 * });
 *
 * // Cleanup
 * adapter.shutdown();
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  AgentMessageType,
  AgentMessage,
  AgentMailbox,
  DomainTeamConfig,
  MessageHandler,
  BroadcastHandler,
  AgentTeamsAdapterConfig,
  ReceiveOptions,
  TeamStatus,
} from './types.js';

export { DEFAULT_AGENT_TEAMS_CONFIG } from './types.js';

// ============================================================================
// Mailbox Service
// ============================================================================

export { MailboxService, createMailboxService } from './mailbox.js';

// ============================================================================
// Adapter
// ============================================================================

export {
  AgentTeamsAdapter,
  createAgentTeamsAdapter,
} from './adapter.js';

export type {
  SendMessageOptions,
  BroadcastOptions,
} from './adapter.js';

// ============================================================================
// Domain Team Manager
// ============================================================================

export {
  DomainTeamManager,
  createDomainTeamManager,
  DEFAULT_DOMAIN_TEAM_MANAGER_CONFIG,
} from './domain-team-manager.js';

export type {
  DomainTeamManagerConfig,
  DomainTeam,
  DomainTeamHealth,
  ScaleResult,
  RebalanceResult,
} from './domain-team-manager.js';

// ============================================================================
// Distributed Tracing (ADR-064 Phase 3)
// ============================================================================

export {
  TraceCollector,
  createTraceCollector,
  extractTraceContext,
  encodeTraceContext,
} from './tracing.js';

export type {
  TraceContext,
  TraceSpan,
  StartSpanOptions,
} from './tracing.js';
