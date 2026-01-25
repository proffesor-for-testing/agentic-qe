/**
 * DefaultCoordinationStrategy Unit Tests
 *
 * Tests for the coordination strategy implementation.
 */

import { EventEmitter } from 'events';
import {
  DefaultCoordinationStrategy,
  createCoordinationStrategy,
} from '../../../src/core/strategies/DefaultCoordinationStrategy';
import type { AgentId, QEEvent } from '../../../src/types';

describe('DefaultCoordinationStrategy', () => {
  let strategy: DefaultCoordinationStrategy;
  let eventBus: EventEmitter;
  let agentId: AgentId;

  beforeEach(() => {
    strategy = new DefaultCoordinationStrategy();
    eventBus = new EventEmitter();
    agentId = { id: 'test-agent', type: 'test' };
    strategy.initialize(eventBus, agentId);
  });

  afterEach(async () => {
    await strategy.shutdown();
    eventBus.removeAllListeners();
  });

  describe('initialization', () => {
    it('should report healthy after initialization', () => {
      expect(strategy.isHealthy()).toBe(true);
    });

    it('should throw if not initialized', () => {
      const uninitStrategy = new DefaultCoordinationStrategy();
      expect(() =>
        uninitStrategy.emit({ type: 'test', data: {} } as QEEvent)
      ).toThrow('Coordination strategy not initialized');
    });
  });

  describe('event emission', () => {
    it('should emit events with enriched data', (done) => {
      eventBus.on('test:event', (event: QEEvent) => {
        expect(event.id).toBeDefined();
        expect(event.source).toBe(agentId);
        expect(event.timestamp).toBeInstanceOf(Date);
        expect(event.data).toEqual({ message: 'hello' });
        done();
      });

      strategy.emit({
        type: 'test:event',
        data: { message: 'hello' },
      } as QEEvent);
    });

    it('should track event emission metrics', () => {
      strategy.emit({ type: 'test:event', data: {} } as QEEvent);
      strategy.emit({ type: 'test:event', data: {} } as QEEvent);

      const metrics = strategy.getMetrics();
      expect(metrics.eventsEmitted).toBe(2);
    });
  });

  describe('event subscription', () => {
    it('should handle event subscriptions', (done) => {
      const handler = (event: QEEvent) => {
        expect(event.data).toEqual({ test: true });
        done();
      };

      strategy.on('custom:event', handler);
      eventBus.emit('custom:event', { id: '1', type: 'custom:event', source: agentId, data: { test: true }, timestamp: new Date(), priority: 'medium', scope: 'local' });
    });

    it('should track active subscriptions', () => {
      const handler = () => {};
      strategy.on('event-1', handler);
      strategy.on('event-2', handler);

      const metrics = strategy.getMetrics();
      expect(metrics.activeSubscriptions).toBe(2);
    });

    it('should handle unsubscribe', () => {
      const initialMetrics = strategy.getMetrics();
      const initialSubs = initialMetrics.activeSubscriptions;

      const handler = () => {};
      strategy.on('test:event', handler);
      strategy.off('test:event', handler);

      const metrics = strategy.getMetrics();
      // After on + off, subscriptions should be same as initial (off decrements)
      expect(metrics.activeSubscriptions).toBe(initialSubs);
    });

    it('should handle once subscriptions', (done) => {
      let callCount = 0;
      const handler = () => {
        callCount++;
        if (callCount === 1) {
          // Emit again - should not trigger
          eventBus.emit('once:event', { id: '2', type: 'once:event', source: agentId, data: {}, timestamp: new Date(), priority: 'medium', scope: 'local' });
          setTimeout(() => {
            expect(callCount).toBe(1);
            done();
          }, 50);
        }
      };

      strategy.once('once:event', handler);
      eventBus.emit('once:event', { id: '1', type: 'once:event', source: agentId, data: {}, timestamp: new Date(), priority: 'medium', scope: 'local' });
    });
  });

  describe('messaging', () => {
    it('should broadcast messages', async () => {
      const received: any[] = [];
      eventBus.on('agent:broadcast', (msg) => received.push(msg));

      await strategy.broadcast({
        type: 'announcement',
        sender: agentId,
        payload: { info: 'test broadcast' },
      });

      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual({ info: 'test broadcast' });
    });

    it('should send direct messages', async () => {
      const targetId: AgentId = { id: 'target-agent', type: 'test' };
      const received: any[] = [];

      eventBus.on(`agent:message:${targetId.id}`, (msg) => received.push(msg));

      await strategy.send(targetId, {
        type: 'direct',
        sender: agentId,
        payload: { info: 'direct message' },
      });

      expect(received).toHaveLength(1);
      expect(received[0].target).toEqual(targetId);
    });

    it('should track message metrics', async () => {
      await strategy.broadcast({
        type: 'test',
        sender: agentId,
        payload: {},
      });
      await strategy.send({ id: 'other', type: 'test' }, {
        type: 'test',
        sender: agentId,
        payload: {},
      });

      const metrics = strategy.getMetrics();
      expect(metrics.messagesSent).toBe(2);
      expect(metrics.broadcastsSent).toBe(1);
    });

    it('should register message handlers', async () => {
      const received: any[] = [];
      const handler = (msg: any) => received.push(msg);

      strategy.onMessage(handler);

      // Simulate incoming message to this agent
      eventBus.emit(`agent:message:${agentId.id}`, {
        type: 'incoming',
        sender: { id: 'other', type: 'test' },
        payload: { data: 'test' },
      });

      expect(received).toHaveLength(1);
    });

    it('should receive broadcasts from other agents', async () => {
      const received: any[] = [];
      strategy.onMessage((msg) => received.push(msg));

      // Simulate broadcast from another agent
      eventBus.emit('agent:broadcast', {
        type: 'broadcast',
        sender: { id: 'other-agent', type: 'test' },
        payload: { data: 'broadcast' },
      });

      expect(received).toHaveLength(1);
    });

    it('should not receive own broadcasts', async () => {
      const received: any[] = [];
      strategy.onMessage((msg) => received.push(msg));

      // Simulate broadcast from self
      eventBus.emit('agent:broadcast', {
        type: 'broadcast',
        sender: agentId,
        payload: { data: 'self' },
      });

      expect(received).toHaveLength(0);
    });
  });

  describe('request-response', () => {
    it('should handle request-response pattern', async () => {
      const targetId: AgentId = { id: 'responder', type: 'test' };

      // Set up responder
      eventBus.on(`agent:message:${targetId.id}`, (msg) => {
        // Simulate response
        setTimeout(() => {
          eventBus.emit(`agent:response:${msg.correlationId}`, {
            data: { result: 'success' },
          });
        }, 10);
      });

      const result = await strategy.request<{ result: string }>(
        targetId,
        { type: 'request', sender: agentId, payload: { query: 'test' } },
        5000
      );

      expect(result).toEqual({ result: 'success' });
    });

    it('should timeout on no response', async () => {
      const targetId: AgentId = { id: 'non-responder', type: 'test' };

      await expect(
        strategy.request(
          targetId,
          { type: 'request', sender: agentId, payload: {} },
          100
        )
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('swarm operations', () => {
    it('should join a swarm', async () => {
      const swarmJoined: any[] = [];
      eventBus.on('swarm:join', (e) => swarmJoined.push(e));

      await strategy.joinSwarm('test-swarm', 'worker');

      const membership = strategy.getSwarmMembership();
      expect(membership).not.toBeNull();
      expect(membership!.swarmId).toBe('test-swarm');
      expect(membership!.role).toBe('worker');
      expect(swarmJoined).toHaveLength(1);
    });

    it('should leave a swarm', async () => {
      const swarmLeft: any[] = [];
      eventBus.on('swarm:leave', (e) => swarmLeft.push(e));

      await strategy.joinSwarm('test-swarm', 'worker');
      await strategy.leaveSwarm();

      const membership = strategy.getSwarmMembership();
      expect(membership).toBeNull();
      expect(swarmLeft).toHaveLength(1);
    });

    it('should discover peers', async () => {
      await strategy.joinSwarm('test-swarm');
      const peers = await strategy.discoverPeers();

      expect(Array.isArray(peers)).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should cleanup on shutdown', async () => {
      strategy.on('test:event', () => {});
      await strategy.joinSwarm('test-swarm');

      await strategy.shutdown();

      expect(strategy.isHealthy()).toBe(false);
    });

    it('should leave swarm on shutdown', async () => {
      await strategy.joinSwarm('test-swarm');
      await strategy.shutdown();

      expect(strategy.getSwarmMembership()).toBeNull();
    });
  });

  describe('metrics', () => {
    it('should track latency', async () => {
      await strategy.send({ id: 'target', type: 'test' }, {
        type: 'test',
        sender: agentId,
        payload: {},
      });

      const metrics = strategy.getMetrics();
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0);
    });

    it('should return complete metrics', () => {
      const metrics = strategy.getMetrics();

      expect(metrics).toHaveProperty('eventsEmitted');
      expect(metrics).toHaveProperty('eventsReceived');
      expect(metrics).toHaveProperty('messagesSent');
      expect(metrics).toHaveProperty('messagesReceived');
      expect(metrics).toHaveProperty('broadcastsSent');
      expect(metrics).toHaveProperty('averageLatency');
      expect(metrics).toHaveProperty('activeSubscriptions');
    });
  });
});

describe('createCoordinationStrategy factory', () => {
  it('should create default strategy', () => {
    const strategy = createCoordinationStrategy();
    expect(strategy).toBeInstanceOf(DefaultCoordinationStrategy);
  });
});
