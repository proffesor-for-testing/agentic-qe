/**
 * CoordinatorAdapter Unit Tests
 *
 * Tests the adapter that bridges EventEmitter to AgentCoordinationStrategy.
 */

import { EventEmitter } from 'events';
import { CoordinatorAdapter, createCoordinationAdapter } from '../../../src/agents/adapters';
import type { AgentId, QEEvent } from '../../../src/types';
import type { AgentMessage } from '../../../src/core/strategies';

describe('CoordinatorAdapter', () => {
  let eventBus: EventEmitter;
  let adapter: CoordinatorAdapter;
  let agentId: AgentId;

  beforeEach(() => {
    eventBus = new EventEmitter();
    agentId = {
      id: 'test-agent-1',
      type: 'test-generator',
      created: new Date(),
    };
    adapter = new CoordinatorAdapter(eventBus, agentId);
  });

  afterEach(async () => {
    await adapter.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with eventBus and agentId', () => {
      expect(adapter.isHealthy()).toBe(true);
    });

    it('should support delayed initialization', () => {
      const delayedAdapter = new CoordinatorAdapter();
      expect(delayedAdapter.isHealthy()).toBe(false);

      delayedAdapter.initialize(eventBus, agentId);
      expect(delayedAdapter.isHealthy()).toBe(true);
    });
  });

  describe('emit', () => {
    it('should emit events to the event bus', () => {
      const handler = jest.fn();
      eventBus.on('test.event', handler);

      const event: QEEvent = {
        type: 'test.event',
        payload: { data: 'test' },
        source: 'test-agent',
        timestamp: Date.now(),
      };

      adapter.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should increment eventsEmitted metric', () => {
      adapter.emit({
        type: 'test.event',
        payload: {},
        source: 'test',
        timestamp: Date.now(),
      });

      const metrics = adapter.getMetrics();
      expect(metrics.eventsEmitted).toBe(1);
    });

    it('should throw if not initialized', () => {
      const uninitAdapter = new CoordinatorAdapter();
      expect(() => uninitAdapter.emit({
        type: 'test',
        payload: {},
        source: 'test',
        timestamp: Date.now(),
      })).toThrow('Coordination not initialized');
    });
  });

  describe('on/off', () => {
    it('should subscribe to events', () => {
      const handler = jest.fn();
      adapter.on('test.event', handler);

      eventBus.emit('test.event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should increment eventsReceived on event', () => {
      adapter.on('test.event', jest.fn());
      eventBus.emit('test.event', {});

      const metrics = adapter.getMetrics();
      expect(metrics.eventsReceived).toBe(1);
    });

    it('should unsubscribe from events', () => {
      const handler = jest.fn();
      adapter.on('test.event', handler);
      adapter.off('test.event', handler);

      eventBus.emit('test.event', { data: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should track active subscriptions', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      adapter.on('event1', handler1);
      adapter.on('event2', handler2);

      expect(adapter.getMetrics().activeSubscriptions).toBe(2);

      adapter.off('event1', handler1);
      expect(adapter.getMetrics().activeSubscriptions).toBe(1);
    });
  });

  describe('once', () => {
    it('should subscribe to single event occurrence', () => {
      const handler = jest.fn();
      adapter.once('test.event', handler);

      eventBus.emit('test.event', { data: 'first' });
      eventBus.emit('test.event', { data: 'second' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'first' });
    });
  });

  describe('broadcast', () => {
    it('should emit broadcast message', async () => {
      const handler = jest.fn();
      eventBus.on('agent.broadcast', handler);

      const message: AgentMessage = {
        type: 'test-message',
        sender: agentId,
        payload: { data: 'broadcast' },
      };

      await adapter.broadcast(message);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test-message',
          payload: { data: 'broadcast' },
          sender: agentId,
        })
      );
    });

    it('should increment broadcast metrics', async () => {
      await adapter.broadcast({
        type: 'test',
        sender: agentId,
        payload: {},
      });

      const metrics = adapter.getMetrics();
      expect(metrics.broadcastsSent).toBe(1);
      expect(metrics.messagesSent).toBe(1);
    });
  });

  describe('send', () => {
    it('should send message to specific agent', async () => {
      const targetAgent: AgentId = {
        id: 'target-agent',
        type: 'test',
        created: new Date(),
      };

      const handler = jest.fn();
      eventBus.on(`agent.message.${targetAgent.id}`, handler);

      const message: AgentMessage = {
        type: 'direct-message',
        sender: agentId,
        payload: { data: 'hello' },
      };

      await adapter.send(targetAgent, message);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'direct-message',
          target: targetAgent,
          payload: { data: 'hello' },
        })
      );
    });

    it('should increment messagesSent metric', async () => {
      const targetAgent: AgentId = {
        id: 'target-agent',
        type: 'test',
        created: new Date(),
      };

      await adapter.send(targetAgent, {
        type: 'test',
        sender: agentId,
        payload: {},
      });

      const metrics = adapter.getMetrics();
      expect(metrics.messagesSent).toBe(1);
    });
  });

  describe('onMessage/offMessage', () => {
    it('should receive direct messages', async () => {
      const handler = jest.fn();
      adapter.onMessage(handler);

      const message: AgentMessage = {
        id: 'msg-1',
        type: 'test',
        sender: {
          id: 'other-agent',
          type: 'test',
          created: new Date(),
        },
        payload: { data: 'hello' },
        timestamp: new Date(),
      };

      eventBus.emit(`agent.message.${agentId.id}`, message);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should receive broadcast messages', async () => {
      const handler = jest.fn();
      adapter.onMessage(handler);

      const message: AgentMessage = {
        id: 'msg-1',
        type: 'broadcast',
        sender: {
          id: 'other-agent',
          type: 'test',
          created: new Date(),
        },
        payload: { data: 'broadcast' },
        timestamp: new Date(),
      };

      eventBus.emit('agent.broadcast', message);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should unsubscribe from messages', () => {
      const handler = jest.fn();
      adapter.onMessage(handler);
      adapter.offMessage(handler);

      eventBus.emit(`agent.message.${agentId.id}`, { type: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('request', () => {
    it('should send request and receive response', async () => {
      const targetAgent: AgentId = {
        id: 'responder',
        type: 'test',
        created: new Date(),
      };

      // Simulate responder
      eventBus.on(`agent.message.${targetAgent.id}`, (msg: AgentMessage) => {
        setTimeout(() => {
          eventBus.emit(`agent.response.${agentId.id}`, {
            type: 'response',
            sender: targetAgent,
            target: agentId,
            correlationId: msg.correlationId,
            payload: { result: 'success' },
            timestamp: new Date(),
          });
        }, 10);
      });

      const result = await adapter.request<{ result: string }>(
        targetAgent,
        {
          type: 'request',
          sender: agentId,
          payload: { action: 'test' },
        },
        5000
      );

      expect(result).toEqual({ result: 'success' });
    });

    it('should timeout if no response', async () => {
      const targetAgent: AgentId = {
        id: 'non-responder',
        type: 'test',
        created: new Date(),
      };

      await expect(
        adapter.request(
          targetAgent,
          { type: 'request', sender: agentId, payload: {} },
          100 // Short timeout
        )
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('swarm operations', () => {
    it('should join a swarm', async () => {
      const handler = jest.fn();
      eventBus.on('swarm.agent.joined', handler);

      await adapter.joinSwarm?.('swarm-1', 'worker');

      expect(handler).toHaveBeenCalledWith({
        swarmId: 'swarm-1',
        agentId,
        role: 'worker',
      });
    });

    it('should track swarm membership', async () => {
      expect(adapter.getSwarmMembership?.()).toBeNull();

      await adapter.joinSwarm?.('swarm-1', 'coordinator');

      const membership = adapter.getSwarmMembership?.();
      expect(membership).not.toBeNull();
      expect(membership?.swarmId).toBe('swarm-1');
      expect(membership?.role).toBe('coordinator');
    });

    it('should leave swarm', async () => {
      const handler = jest.fn();
      eventBus.on('swarm.agent.left', handler);

      await adapter.joinSwarm?.('swarm-1');
      await adapter.leaveSwarm?.();

      expect(adapter.getSwarmMembership?.()).toBeNull();
      expect(handler).toHaveBeenCalledWith({
        swarmId: 'swarm-1',
        agentId,
      });
    });

    it('should discover peers', async () => {
      await adapter.joinSwarm?.('swarm-1');

      const peer: AgentId = {
        id: 'peer-agent',
        type: 'test',
        created: new Date(),
      };

      eventBus.emit('swarm.peers.updated', {
        swarmId: 'swarm-1',
        peers: [peer],
      });

      const peers = await adapter.discoverPeers?.();
      expect(peers).toContainEqual(peer);
    });
  });

  describe('shutdown', () => {
    it('should clean up resources', async () => {
      await adapter.joinSwarm?.('swarm-1');
      adapter.onMessage(jest.fn());

      await adapter.shutdown();

      expect(adapter.isHealthy()).toBe(false);
      expect(adapter.getSwarmMembership?.()).toBeNull();
    });

    it('should reject pending requests', async () => {
      const targetAgent: AgentId = { id: 'target', type: 'test', created: new Date() };

      const requestPromise = adapter.request(
        targetAgent,
        { type: 'test', sender: agentId, payload: {} },
        10000
      );

      // Shutdown while request is pending
      await adapter.shutdown();

      await expect(requestPromise).rejects.toThrow('Coordination shutdown');
    });
  });

  describe('getMetrics', () => {
    it('should return coordination metrics', async () => {
      adapter.emit({ type: 'event1', payload: {}, source: 'test', timestamp: Date.now() });
      await adapter.broadcast({ type: 'msg1', sender: agentId, payload: {} });

      const metrics = adapter.getMetrics();

      expect(metrics.eventsEmitted).toBe(1);
      expect(metrics.broadcastsSent).toBe(1);
      expect(metrics.messagesSent).toBe(1);
    });
  });

  describe('createCoordinationAdapter factory', () => {
    it('should create an adapter from eventBus and agentId', () => {
      const factoryAdapter = createCoordinationAdapter(eventBus, agentId);
      expect(factoryAdapter.isHealthy()).toBe(true);
    });
  });
});
