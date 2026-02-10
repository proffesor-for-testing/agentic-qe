/**
 * Unit tests for FederationMailbox and createFederationMailbox factory
 * ADR-064 Phase 4B: Cross-Fleet Federation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FederationMailbox,
  createFederationMailbox,
} from '../../src/coordination/federation/federation-mailbox.js';
import type {
  FederatedMessage,
  FederatedMessageType,
} from '../../src/coordination/federation/types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal FederatedMessage for testing */
function makeMessage(overrides: Partial<FederatedMessage> = {}): FederatedMessage {
  return {
    id: overrides.id ?? `msg-${Date.now()}`,
    sourceFleetId: overrides.sourceFleetId ?? 'remote-fleet',
    targetFleetId: overrides.targetFleetId ?? 'local',
    sourceDomain: overrides.sourceDomain ?? 'test-generation',
    targetDomain: overrides.targetDomain ?? 'coverage-analysis',
    type: overrides.type ?? 'task-request',
    payload: overrides.payload ?? { data: 'test' },
    timestamp: overrides.timestamp ?? Date.now(),
    ttl: overrides.ttl,
    correlationId: overrides.correlationId,
  };
}

// ============================================================================
// FederationMailbox
// ============================================================================

describe('FederationMailbox', () => {
  let mailbox: FederationMailbox;

  beforeEach(() => {
    mailbox = new FederationMailbox({ localFleetId: 'fleet-a' });
  });

  afterEach(() => {
    mailbox.dispose();
  });

  // --------------------------------------------------------------------------
  // Service Registration
  // --------------------------------------------------------------------------

  describe('registerService', () => {
    it('registers with active status', () => {
      const service = mailbox.registerService(
        'fleet-b',
        'Coverage Fleet',
        ['coverage-analysis'],
      );
      expect(service.fleetId).toBe('fleet-b');
      expect(service.name).toBe('Coverage Fleet');
      expect(service.domains).toEqual(['coverage-analysis']);
      expect(service.status).toBe('active');
      expect(service.registeredAt).toBeGreaterThan(0);
      expect(service.lastHeartbeat).toBe(service.registeredAt);
    });

    it('throws for duplicate fleetId', () => {
      mailbox.registerService('fleet-b', 'Fleet B', ['domain-a']);
      expect(() =>
        mailbox.registerService('fleet-b', 'Fleet B Dup', ['domain-b']),
      ).toThrowError("Service 'fleet-b' already registered");
    });
  });

  // --------------------------------------------------------------------------
  // Service Deregistration
  // --------------------------------------------------------------------------

  describe('deregisterService', () => {
    it('removes service and routes targeting it', () => {
      mailbox.registerService('fleet-b', 'Fleet B', ['coverage-analysis']);
      mailbox.addRoute('test-gen', 'coverage-analysis', 'fleet-b', 5);

      const removed = mailbox.deregisterService('fleet-b');
      expect(removed).toBe(true);

      // Service gone
      expect(mailbox.getService('fleet-b')).toBeUndefined();

      // Route gone
      expect(mailbox.listRoutes()).toHaveLength(0);
    });

    it('returns false for unknown fleetId', () => {
      expect(mailbox.deregisterService('no-such-fleet')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Heartbeat
  // --------------------------------------------------------------------------

  describe('heartbeat', () => {
    it('updates lastHeartbeat and restores status to active', () => {
      mailbox.registerService('fleet-b', 'Fleet B', ['domain-a']);

      // Manually trigger degradation via checkHealth after faking time
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 100_000);
      mailbox.checkHealth();
      const degraded = mailbox.getService('fleet-b');
      expect(degraded?.status).not.toBe('active');

      // Heartbeat restores to active
      mailbox.heartbeat('fleet-b');
      const restored = mailbox.getService('fleet-b');
      expect(restored?.status).toBe('active');
      expect(restored!.lastHeartbeat).toBe(now + 100_000);

      vi.restoreAllMocks();
    });

    it('returns false for unknown fleetId', () => {
      expect(mailbox.heartbeat('ghost')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Routing
  // --------------------------------------------------------------------------

  describe('addRoute', () => {
    it('adds routes sorted by priority (descending)', () => {
      mailbox.addRoute('a', 'b', 'fleet-x', 1);
      mailbox.addRoute('c', 'd', 'fleet-y', 10);
      mailbox.addRoute('e', 'f', 'fleet-z', 5);

      const routes = mailbox.listRoutes();
      expect(routes).toHaveLength(3);
      expect(routes[0].priority).toBe(10);
      expect(routes[1].priority).toBe(5);
      expect(routes[2].priority).toBe(1);
    });

    it('throws when maxRoutes reached', () => {
      const small = new FederationMailbox({
        localFleetId: 'fleet-a',
        maxRoutes: 2,
      });
      small.addRoute('a', 'b', 'f1');
      small.addRoute('c', 'd', 'f2');
      expect(() => small.addRoute('e', 'f', 'f3')).toThrowError(
        'Maximum routes (2) reached',
      );
      small.dispose();
    });
  });

  describe('removeRoute', () => {
    it('removes matching route and returns true', () => {
      mailbox.addRoute('src', 'tgt', 'fleet-b', 5);
      expect(mailbox.removeRoute('src', 'fleet-b')).toBe(true);
      expect(mailbox.listRoutes()).toHaveLength(0);
    });

    it('returns false when no match', () => {
      expect(mailbox.removeRoute('nope', 'nope')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Sending
  // --------------------------------------------------------------------------

  describe('send', () => {
    it('creates message with correct fields', () => {
      const msg = mailbox.send(
        'fleet-b',
        'test-gen',
        'coverage',
        'task-request',
        { spec: 'auth' },
        { correlationId: 'corr-1', ttl: 5000 },
      );

      expect(msg.id).toBeDefined();
      expect(msg.sourceFleetId).toBe('fleet-a');
      expect(msg.targetFleetId).toBe('fleet-b');
      expect(msg.sourceDomain).toBe('test-gen');
      expect(msg.targetDomain).toBe('coverage');
      expect(msg.type).toBe('task-request');
      expect(msg.payload).toEqual({ spec: 'auth' });
      expect(msg.correlationId).toBe('corr-1');
      expect(msg.ttl).toBe(5000);
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('with "any" target routes via matching route', () => {
      mailbox.registerService('fleet-b', 'Fleet B', ['coverage-analysis']);
      mailbox.addRoute('test-gen', 'coverage-analysis', 'fleet-b', 10);

      const msg = mailbox.send(
        'any',
        'test-gen',
        'coverage-analysis',
        'task-request',
        {},
      );
      expect(msg.targetFleetId).toBe('fleet-b');
    });

    it('with "any" target falls back to domain-based discovery', () => {
      mailbox.registerService('fleet-c', 'Fleet C', ['security']);
      // No explicit route, but fleet-c handles the target domain
      const msg = mailbox.send('any', 'some-domain', 'security', 'capability-query', {});
      expect(msg.targetFleetId).toBe('fleet-c');
    });

    it('throws when no route found for "any" target', () => {
      expect(() =>
        mailbox.send('any', 'unknown-src', 'unknown-tgt', 'task-request', {}),
      ).toThrowError('No route found for unknown-src -> unknown-tgt');
    });
  });

  // --------------------------------------------------------------------------
  // Receiving
  // --------------------------------------------------------------------------

  describe('receive', () => {
    it('adds to inbox and notifies handlers', () => {
      const handler = vi.fn();
      mailbox.onMessage(handler);

      const msg = makeMessage();
      mailbox.receive(msg);

      const inbox = mailbox.drainInbox();
      expect(inbox).toHaveLength(1);
      expect(inbox[0]).toBe(msg);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('swallows handler errors without breaking delivery', () => {
      const bad = vi.fn(() => { throw new Error('boom'); });
      const good = vi.fn();
      mailbox.onMessage(bad);
      mailbox.onMessage(good);

      const msg = makeMessage();
      mailbox.receive(msg);

      expect(bad).toHaveBeenCalledOnce();
      expect(good).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  describe('onMessage', () => {
    it('subscribes and unsubscribes', () => {
      const handler = vi.fn();
      const unsub = mailbox.onMessage(handler);

      mailbox.receive(makeMessage());
      expect(handler).toHaveBeenCalledOnce();

      unsub();
      mailbox.receive(makeMessage({ id: 'msg-2' }));
      // Handler should not be called again after unsubscribe
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------------------------------
  // Queue Draining
  // --------------------------------------------------------------------------

  describe('drainOutbox', () => {
    it('returns and clears outbox', () => {
      mailbox.send('fleet-x', 'a', 'b', 'task-request', {});
      mailbox.send('fleet-x', 'a', 'b', 'task-request', {});

      const drained = mailbox.drainOutbox();
      expect(drained).toHaveLength(2);

      // Second drain returns empty
      expect(mailbox.drainOutbox()).toHaveLength(0);
    });
  });

  describe('drainInbox', () => {
    it('returns and clears inbox', () => {
      mailbox.receive(makeMessage({ id: 'in-1' }));
      mailbox.receive(makeMessage({ id: 'in-2' }));

      const drained = mailbox.drainInbox();
      expect(drained).toHaveLength(2);

      // Second drain returns empty
      expect(mailbox.drainInbox()).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Service Discovery
  // --------------------------------------------------------------------------

  describe('findServicesByDomain', () => {
    it('returns only active matching services', () => {
      mailbox.registerService('fleet-b', 'B', ['coverage', 'security']);
      mailbox.registerService('fleet-c', 'C', ['coverage']);
      mailbox.registerService('fleet-d', 'D', ['test-gen']);

      // Make fleet-c unreachable so it should be excluded
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 200_000);
      mailbox.checkHealth();

      const results = mailbox.findServicesByDomain('coverage');
      // fleet-b and fleet-c both handle 'coverage' but fleet-c timed out
      // Actually both should be unreachable after 200s (timeout default 90s)
      // So neither should be returned
      expect(results.every(s => s.status === 'active')).toBe(true);

      vi.restoreAllMocks();
    });

    it('returns empty array for unmatched domain', () => {
      mailbox.registerService('fleet-b', 'B', ['coverage']);
      expect(mailbox.findServicesByDomain('nonexistent')).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Health Monitoring
  // --------------------------------------------------------------------------

  describe('checkHealth', () => {
    it('marks timed-out services as unreachable', () => {
      mailbox.registerService('fleet-b', 'B', ['domain-a']);

      const now = Date.now();
      // Jump past the 90s default timeout
      vi.spyOn(Date, 'now').mockReturnValue(now + 100_000);
      mailbox.checkHealth();

      const service = mailbox.getService('fleet-b');
      expect(service?.status).toBe('unreachable');

      vi.restoreAllMocks();
    });

    it('marks services past 60% timeout as degraded', () => {
      mailbox.registerService('fleet-b', 'B', ['domain-a']);

      const now = Date.now();
      // 60% of 90_000 = 54_000; jump to 60_000 which is past 60%
      vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
      mailbox.checkHealth();

      const service = mailbox.getService('fleet-b');
      expect(service?.status).toBe('degraded');

      vi.restoreAllMocks();
    });
  });

  describe('getHealth', () => {
    it('returns correct summary', () => {
      mailbox.registerService('fleet-b', 'B', ['domain-a']);
      mailbox.addRoute('src', 'tgt', 'fleet-b');
      mailbox.send('fleet-b', 'src', 'tgt', 'task-request', {});
      mailbox.receive(makeMessage());

      const health = mailbox.getHealth();
      expect(health.localFleetId).toBe('fleet-a');
      expect(health.connectedServices).toBe(1);
      expect(health.activeRoutes).toBe(1);
      expect(health.pendingMessages).toBe(2); // 1 outbox + 1 inbox
      expect(health.messagesSent).toBe(1);
      expect(health.messagesReceived).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  describe('dispose', () => {
    it('clears all state', () => {
      mailbox.registerService('fleet-b', 'B', ['domain-a']);
      mailbox.addRoute('src', 'tgt', 'fleet-b');
      mailbox.send('fleet-b', 'src', 'tgt', 'task-request', {});
      mailbox.receive(makeMessage());
      mailbox.onMessage(() => {});

      mailbox.dispose();

      expect(mailbox.listServices()).toHaveLength(0);
      expect(mailbox.listRoutes()).toHaveLength(0);
      expect(mailbox.drainOutbox()).toHaveLength(0);
      expect(mailbox.drainInbox()).toHaveLength(0);
      // Counters are not reset but queues are cleared
      expect(mailbox.getHealth().pendingMessages).toBe(0);
    });
  });
});

// ============================================================================
// Factory
// ============================================================================

describe('createFederationMailbox', () => {
  it('creates with default config', () => {
    const mailbox = createFederationMailbox();
    const health = mailbox.getHealth();
    expect(health.localFleetId).toBe('local'); // DEFAULT_FEDERATION_CONFIG default
    expect(health.connectedServices).toBe(0);
    expect(health.activeRoutes).toBe(0);
    expect(health.pendingMessages).toBe(0);
    expect(health.messagesSent).toBe(0);
    expect(health.messagesReceived).toBe(0);
    mailbox.dispose();
  });

  it('creates with custom config', () => {
    const mailbox = createFederationMailbox({ localFleetId: 'my-fleet' });
    expect(mailbox.getHealth().localFleetId).toBe('my-fleet');
    mailbox.dispose();
  });
});
