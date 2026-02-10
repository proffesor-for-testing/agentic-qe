/**
 * Unit tests for Agent Teams — MailboxService and AgentTeamsAdapter
 * ADR-064: Inter-agent messaging, mailbox lifecycle, team management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MailboxService, createMailboxService } from '../../src/coordination/agent-teams/mailbox.js';
import { AgentTeamsAdapter, createAgentTeamsAdapter } from '../../src/coordination/agent-teams/adapter.js';
import type { AgentMessage, DomainTeamConfig } from '../../src/coordination/agent-teams/types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal AgentMessage for testing */
function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: overrides.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from: overrides.from ?? 'agent-sender',
    to: overrides.to ?? 'agent-receiver',
    domain: overrides.domain ?? 'test-generation',
    type: overrides.type ?? 'finding',
    payload: overrides.payload ?? { data: 'test-payload' },
    timestamp: overrides.timestamp ?? Date.now(),
    correlationId: overrides.correlationId,
    replyTo: overrides.replyTo,
    ttl: overrides.ttl,
  };
}

/** Build a DomainTeamConfig for testing */
function makeTeamConfig(overrides: Partial<DomainTeamConfig> = {}): DomainTeamConfig {
  return {
    domain: overrides.domain ?? 'test-generation',
    leadAgentId: overrides.leadAgentId ?? 'lead-1',
    maxTeammates: overrides.maxTeammates ?? 5,
    teammateIds: overrides.teammateIds ?? ['tm-1', 'tm-2'],
    autoAssignEnabled: overrides.autoAssignEnabled ?? false,
  };
}

// ============================================================================
// MailboxService Tests
// ============================================================================

describe('MailboxService', () => {
  let svc: MailboxService;

  beforeEach(() => {
    svc = createMailboxService();
  });

  // ---------- Mailbox lifecycle ----------

  it('should create a mailbox for an agent', () => {
    const mb = svc.createMailbox('agent-1', 'test-generation');
    expect(mb.agentId).toBe('agent-1');
    expect(mb.domain).toBe('test-generation');
    expect(mb.messages).toEqual([]);
    expect(mb.unreadCount).toBe(0);
  });

  it('should return existing mailbox when creating duplicate', () => {
    const mb1 = svc.createMailbox('agent-1', 'test-generation');
    const mb2 = svc.createMailbox('agent-1', 'test-generation');
    expect(mb1.agentId).toBe(mb2.agentId);
    expect(svc.size).toBe(1);
  });

  it('should delete a mailbox and return true', () => {
    svc.createMailbox('agent-1', 'test-generation');
    expect(svc.deleteMailbox('agent-1')).toBe(true);
    expect(svc.getMailbox('agent-1')).toBeUndefined();
    expect(svc.size).toBe(0);
  });

  it('should return false when deleting non-existent mailbox', () => {
    expect(svc.deleteMailbox('no-such-agent')).toBe(false);
  });

  it('should remove domain tracking when last agent in domain is deleted', () => {
    svc.createMailbox('agent-1', 'test-generation');
    svc.deleteMailbox('agent-1');
    expect(svc.getAgentsInDomain('test-generation')).toEqual([]);
    expect(svc.getDomains()).not.toContain('test-generation');
  });

  // ---------- Send / Receive ----------

  it('should deliver a point-to-point message', () => {
    svc.createMailbox('agent-receiver', 'test-generation');
    const msg = makeMessage({ to: 'agent-receiver' });
    svc.send(msg);

    const received = svc.receive('agent-receiver');
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(msg.id);
  });

  it('should throw when sending to non-existent mailbox', () => {
    const msg = makeMessage({ to: 'ghost-agent' });
    expect(() => svc.send(msg)).toThrow(/No mailbox found/);
  });

  it('should route broadcast-addressed messages to broadcast()', () => {
    svc.createMailbox('agent-1', 'test-generation');
    svc.createMailbox('agent-2', 'test-generation');
    const msg = makeMessage({ from: 'agent-1', to: 'broadcast', domain: 'test-generation' });
    svc.send(msg);

    // agent-2 gets the broadcast, agent-1 (sender) does not
    expect(svc.receive('agent-2')).toHaveLength(1);
    expect(svc.receive('agent-1')).toHaveLength(0);
  });

  // ---------- Broadcast ----------

  it('should broadcast to all agents in domain except sender', () => {
    svc.createMailbox('a1', 'security');
    svc.createMailbox('a2', 'security');
    svc.createMailbox('a3', 'security');
    const msg = makeMessage({ from: 'a1', domain: 'security' });
    svc.broadcast('security', msg);

    expect(svc.peek('a1')).toBe(0); // sender excluded
    expect(svc.peek('a2')).toBe(1);
    expect(svc.peek('a3')).toBe(1);
  });

  it('should do nothing when broadcasting to unknown domain', () => {
    const msg = makeMessage({ from: 'x', domain: 'no-domain' });
    // Should not throw
    svc.broadcast('no-domain', msg);
  });

  // ---------- Receive with options ----------

  it('should mark all as read after receive', () => {
    svc.createMailbox('r', 'dom');
    svc.send(makeMessage({ to: 'r' }));
    svc.send(makeMessage({ to: 'r' }));
    expect(svc.receive('r')).toHaveLength(2);
    expect(svc.receive('r')).toHaveLength(0); // already read
  });

  it('should filter messages by type', () => {
    svc.createMailbox('r', 'dom');
    svc.send(makeMessage({ to: 'r', type: 'alert' }));
    svc.send(makeMessage({ to: 'r', type: 'finding' }));
    svc.send(makeMessage({ to: 'r', type: 'alert' }));

    const alerts = svc.receive('r', { type: 'alert' });
    expect(alerts).toHaveLength(2);
    expect(alerts.every(m => m.type === 'alert')).toBe(true);
  });

  // ---------- TTL / Expiration ----------

  it('should filter expired messages on receive', () => {
    svc.createMailbox('r', 'dom');
    const expired = makeMessage({ to: 'r', ttl: 1, timestamp: Date.now() - 1000 });
    const valid = makeMessage({ to: 'r', ttl: 60_000 });
    svc.send(expired);
    svc.send(valid);

    const msgs = svc.receive('r');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe(valid.id);
  });

  // ---------- Peek ----------

  it('should return unread count without marking as read', () => {
    svc.createMailbox('r', 'dom');
    svc.send(makeMessage({ to: 'r' }));
    svc.send(makeMessage({ to: 'r' }));

    expect(svc.peek('r')).toBe(2);
    // Still unread after peek
    expect(svc.peek('r')).toBe(2);
    // Now consume
    svc.receive('r');
    expect(svc.peek('r')).toBe(0);
  });

  it('should return 0 for non-existent mailbox peek', () => {
    expect(svc.peek('no-agent')).toBe(0);
  });

  // ---------- Cleanup ----------

  it('should remove expired messages during cleanup', () => {
    svc.createMailbox('r', 'dom');
    const oldMsg = makeMessage({ to: 'r', timestamp: Date.now() - 120_000 });
    svc.send(oldMsg);
    svc.send(makeMessage({ to: 'r' })); // fresh

    const removed = svc.cleanup(60_000); // max age 60s
    expect(removed).toBe(1);
  });

  // ---------- Event callbacks ----------

  it('should fire message handler when message is delivered', () => {
    svc.createMailbox('r', 'dom');
    const handler = vi.fn();
    svc.onMessage('r', handler);
    const msg = makeMessage({ to: 'r' });
    svc.send(msg);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it('should allow unsubscribing message handler', () => {
    svc.createMailbox('r', 'dom');
    const handler = vi.fn();
    const unsub = svc.onMessage('r', handler);
    unsub();
    svc.send(makeMessage({ to: 'r' }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('should fire broadcast handler on domain broadcast', () => {
    svc.createMailbox('a1', 'sec');
    const handler = vi.fn();
    svc.onBroadcast('sec', handler);
    const msg = makeMessage({ from: 'ext', domain: 'sec' });
    svc.broadcast('sec', msg);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('sec', msg);
  });

  it('should not break delivery when handler throws', () => {
    svc.createMailbox('r', 'dom');
    svc.onMessage('r', () => { throw new Error('boom'); });
    const msg = makeMessage({ to: 'r' });

    // Should not throw
    expect(() => svc.send(msg)).not.toThrow();
    expect(svc.peek('r')).toBe(1);
  });
});

// ============================================================================
// AgentTeamsAdapter Tests
// ============================================================================

describe('AgentTeamsAdapter', () => {
  let adapter: AgentTeamsAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = createAgentTeamsAdapter({ cleanupIntervalMs: 0 }); // disable background cleanup for tests
  });

  afterEach(() => {
    adapter.shutdown();
    vi.useRealTimers();
  });

  // ---------- Team management ----------

  it('should create a team and register all members', () => {
    adapter.createTeam(makeTeamConfig());
    expect(adapter.isRegistered('lead-1')).toBe(true);
    expect(adapter.isRegistered('tm-1')).toBe(true);
    expect(adapter.isRegistered('tm-2')).toBe(true);
  });

  it('should throw when creating duplicate team for same domain', () => {
    adapter.createTeam(makeTeamConfig());
    expect(() => adapter.createTeam(makeTeamConfig())).toThrow(/Team already exists/);
  });

  it('should return team status with idle agents', () => {
    adapter.createTeam(makeTeamConfig());
    const status = adapter.getTeamStatus('test-generation');
    expect(status).toBeDefined();
    expect(status!.domain).toBe('test-generation');
    expect(status!.activeAgentCount).toBe(3); // lead + 2 teammates
    expect(status!.idleAgentIds).toHaveLength(3); // all idle, no messages
    expect(status!.totalUnreadMessages).toBe(0);
  });

  it('should return undefined for non-existent team status', () => {
    expect(adapter.getTeamStatus('no-domain')).toBeUndefined();
  });

  // ---------- Agent registration ----------

  it('should register an agent and track its domain', () => {
    adapter.registerAgent('solo-1', 'coverage-analysis');
    expect(adapter.isRegistered('solo-1')).toBe(true);
    expect(adapter.getAgentDomain('solo-1')).toBe('coverage-analysis');
  });

  it('should not double-register the same agent', () => {
    adapter.registerAgent('solo-1', 'coverage-analysis');
    adapter.registerAgent('solo-1', 'coverage-analysis');
    expect(adapter.getRegisteredAgents().filter(id => id === 'solo-1')).toHaveLength(1);
  });

  it('should unregister an agent and remove its mailbox', () => {
    adapter.registerAgent('solo-1', 'coverage-analysis');
    expect(adapter.unregisterAgent('solo-1')).toBe(true);
    expect(adapter.isRegistered('solo-1')).toBe(false);
  });

  it('should return false when unregistering unknown agent', () => {
    expect(adapter.unregisterAgent('no-agent')).toBe(false);
  });

  it('should auto-assign agent to team when autoAssignEnabled', () => {
    adapter.createTeam(makeTeamConfig({ autoAssignEnabled: true, teammateIds: [] }));
    adapter.registerAgent('new-agent', 'test-generation');

    const status = adapter.getTeamStatus('test-generation');
    expect(status!.teammateIds).toContain('new-agent');
  });

  // ---------- Messaging via adapter ----------

  it('should send a message between registered agents', () => {
    adapter.registerAgent('sender', 'dom');
    adapter.registerAgent('receiver', 'dom');
    const msg = adapter.sendMessage('sender', 'receiver', 'finding', { info: 'data' });

    expect(msg.from).toBe('sender');
    expect(msg.to).toBe('receiver');
    expect(adapter.getUnreadCount('receiver')).toBe(1);
  });

  it('should throw when sender is not registered', () => {
    adapter.registerAgent('receiver', 'dom');
    expect(() => adapter.sendMessage('ghost', 'receiver', 'alert', {})).toThrow(/Unknown sender/);
  });

  it('should throw when recipient is not registered', () => {
    adapter.registerAgent('sender', 'dom');
    expect(() => adapter.sendMessage('sender', 'ghost', 'alert', {})).toThrow(/Unknown recipient/);
  });

  // ---------- Broadcast via adapter ----------

  it('should broadcast to all agents in domain', () => {
    adapter.registerAgent('a1', 'dom');
    adapter.registerAgent('a2', 'dom');
    adapter.registerAgent('a3', 'dom');

    adapter.broadcast('dom', 'alert', { msg: 'heads-up' }, { from: 'a1' });

    expect(adapter.getUnreadCount('a1')).toBe(0); // sender excluded
    expect(adapter.getUnreadCount('a2')).toBe(1);
    expect(adapter.getUnreadCount('a3')).toBe(1);
  });

  it('should allow system broadcast without registered sender', () => {
    adapter.registerAgent('a1', 'dom');
    const msg = adapter.broadcast('dom', 'alert', { msg: 'system-alert' });
    expect(msg.from).toBe('__system__');
    expect(adapter.getUnreadCount('a1')).toBe(1);
  });

  // ---------- Idle agents ----------

  it('should return all agents as idle when no messages pending', () => {
    adapter.registerAgent('a1', 'dom');
    adapter.registerAgent('a2', 'dom');

    const idle = adapter.getIdleAgents();
    expect(idle).toContain('a1');
    expect(idle).toContain('a2');
  });

  it('should exclude agents with unread messages from idle list', () => {
    adapter.registerAgent('a1', 'dom');
    adapter.registerAgent('a2', 'dom');
    adapter.sendMessage('a1', 'a2', 'finding', {});

    const idle = adapter.getIdleAgents();
    expect(idle).toContain('a1');
    expect(idle).not.toContain('a2');
  });

  it('should filter idle agents by domain', () => {
    adapter.registerAgent('a1', 'dom-a');
    adapter.registerAgent('a2', 'dom-b');

    const idle = adapter.getIdleAgents('dom-a');
    expect(idle).toContain('a1');
    expect(idle).not.toContain('a2');
  });

  // ---------- Subscription callbacks ----------

  it('should fire subscription handler on message delivery', () => {
    adapter.registerAgent('sender', 'dom');
    adapter.registerAgent('receiver', 'dom');

    const handler = vi.fn();
    adapter.onMessage('receiver', handler);
    adapter.sendMessage('sender', 'receiver', 'finding', { x: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('finding');
  });

  it('should allow unsubscribing from messages', () => {
    adapter.registerAgent('sender', 'dom');
    adapter.registerAgent('receiver', 'dom');

    const handler = vi.fn();
    const unsub = adapter.onMessage('receiver', handler);
    unsub();
    adapter.sendMessage('sender', 'receiver', 'finding', {});

    expect(handler).not.toHaveBeenCalled();
  });

  // ---------- Initialize / Shutdown lifecycle ----------

  it('should initialize and start cleanup timer', () => {
    const adp = createAgentTeamsAdapter({ cleanupIntervalMs: 5000 });
    adp.initialize();
    // Second init is a no-op
    adp.initialize();
    adp.shutdown();
  });

  it('should clear all state on shutdown', () => {
    adapter.registerAgent('a1', 'dom');
    adapter.shutdown();
    expect(adapter.isRegistered('a1')).toBe(false);
    expect(adapter.getRegisteredAgents()).toHaveLength(0);
  });
});
