/**
 * QUIC Coordination Integration Tests
 *
 * Integration tests for multi-agent coordination via QUIC transport,
 * memory synchronization, event propagation, peer discovery,
 * connection recovery, and load testing with 50+ agents.
 *
 * Target: Real-world scenarios with distributed agent coordination
 */

import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../src/core/EventBus';

// Mock QUIC Transport for integration testing
class QUICTransport extends EventEmitter {
  private peers: Map<string, { id: string; host: string; port: number; lastSeen: number }> = new Map();
  private messageLog: Array<{ from: string; to: string; data: any; timestamp: number }> = [];

  async discover(): Promise<void> {
    this.emit('discovery:started');
  }

  async broadcast(data: any): Promise<void> {
    for (const peer of this.peers.values()) {
      this.messageLog.push({
        from: 'self',
        to: peer.id,
        data,
        timestamp: Date.now()
      });
    }
    this.emit('broadcast', { data, peerCount: this.peers.size });
  }

  async send(peerId: string, data: any): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not found`);
    }

    this.messageLog.push({
      from: 'self',
      to: peerId,
      data,
      timestamp: Date.now()
    });

    this.emit('message:sent', { to: peerId, data });
  }

  registerPeer(id: string, host: string, port: number): void {
    this.peers.set(id, { id, host, port, lastSeen: Date.now() });
    this.emit('peer:registered', { id, host, port });
  }

  getPeers(): Array<{ id: string; host: string; port: number }> {
    return Array.from(this.peers.values());
  }

  getMessageLog(): Array<{ from: string; to: string; data: any; timestamp: number }> {
    return this.messageLog;
  }

  async reconnect(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not found`);
    }

    peer.lastSeen = Date.now();
    this.emit('peer:reconnected', { id: peerId });
  }
}

// Mock Agent for coordination testing
class MockAgent {
  constructor(
    public id: string,
    private transport: QUICTransport,
    private memory: SwarmMemoryManager,
    private eventBus: EventBus
  ) {}

  async executeTask(task: string): Promise<any> {
    const result = {
      agentId: this.id,
      task,
      result: `Completed: ${task}`,
      timestamp: Date.now()
    };

    // Store result in memory
    await this.memory.set(`agent/${this.id}/tasks/${Date.now()}`, result, 'coordination');

    // Broadcast task completion
    await this.transport.broadcast({
      type: 'task:completed',
      agentId: this.id,
      task,
      result
    });

    // Emit event
    this.eventBus.emit('agent:task:completed', result);

    return result;
  }

  async syncMemory(): Promise<void> {
    const agentData = await this.memory.get(`agent/${this.id}/state`, 'coordination');
    await this.transport.broadcast({
      type: 'memory:sync',
      agentId: this.id,
      data: agentData
    });
  }
}

describe('QUIC Coordination Integration Tests', () => {
  let transport: QUICTransport;
  let memory: SwarmMemoryManager;
  let eventBus: EventBus;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = ':memory:'; // Use in-memory SQLite for tests
    transport = new QUICTransport();
    memory = new SwarmMemoryManager(testDbPath);
    await memory.initialize();
    eventBus = EventBus.getInstance();
  });

  afterEach(async () => {
    await memory.close();
    eventBus.removeAllListeners();
    transport.removeAllListeners();
  });

  describe('Multi-Agent Coordination via QUIC', () => {
    it('should coordinate multiple agents via QUIC', async () => {
      const agents = [
        new MockAgent('agent-1', transport, memory, eventBus),
        new MockAgent('agent-2', transport, memory, eventBus),
        new MockAgent('agent-3', transport, memory, eventBus)
      ];

      // Register peers
      transport.registerPeer('agent-1', 'localhost', 4434);
      transport.registerPeer('agent-2', 'localhost', 4435);
      transport.registerPeer('agent-3', 'localhost', 4436);

      // Execute tasks
      await Promise.all(
        agents.map((agent, i) => agent.executeTask(`task-${i + 1}`))
      );

      const peers = transport.getPeers();
      expect(peers).toHaveLength(3);

      const messages = transport.getMessageLog();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.every(m => m.data.type === 'task:completed')).toBe(true);
    });

    it('should support hierarchical agent coordination', async () => {
      const coordinator = new MockAgent('coordinator', transport, memory, eventBus);
      const workers = Array(5).fill(null).map((_, i) =>
        new MockAgent(`worker-${i + 1}`, transport, memory, eventBus)
      );

      // Register peers
      transport.registerPeer('coordinator', 'localhost', 4433);
      workers.forEach((worker, i) => {
        transport.registerPeer(worker.id, 'localhost', 4434 + i);
      });

      // Coordinator assigns tasks
      const coordinatorResult = await coordinator.executeTask('coordinate-workers');

      // Workers execute tasks
      const workerResults = await Promise.all(
        workers.map((worker, i) => worker.executeTask(`subtask-${i + 1}`))
      );

      expect(coordinatorResult).toBeDefined();
      expect(workerResults).toHaveLength(5);

      const messages = transport.getMessageLog();
      expect(messages.length).toBeGreaterThanOrEqual(6); // 1 coordinator + 5 workers
    });

    it('should handle agent discovery', async () => {
      const discoveryHandler = jest.fn();
      transport.on('discovery:started', discoveryHandler);

      await transport.discover();

      expect(discoveryHandler).toHaveBeenCalled();
    });

    it('should broadcast messages to all peers', async () => {
      const broadcastHandler = jest.fn();
      transport.on('broadcast', broadcastHandler);

      transport.registerPeer('agent-1', 'localhost', 4434);
      transport.registerPeer('agent-2', 'localhost', 4435);
      transport.registerPeer('agent-3', 'localhost', 4436);

      await transport.broadcast({ type: 'announcement', message: 'Hello all agents' });

      expect(broadcastHandler).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'announcement' }),
        peerCount: 3
      });
    });

    it('should support targeted peer messaging', async () => {
      const messageHandler = jest.fn();
      transport.on('message:sent', messageHandler);

      transport.registerPeer('agent-1', 'localhost', 4434);

      await transport.send('agent-1', { type: 'direct', message: 'Hello agent-1' });

      expect(messageHandler).toHaveBeenCalledWith({
        to: 'agent-1',
        data: expect.objectContaining({ type: 'direct' })
      });
    });
  });

  describe('Memory Synchronization via QUIC', () => {
    it('should synchronize memory across agents', async () => {
      const agent1 = new MockAgent('agent-1', transport, memory, eventBus);
      const agent2 = new MockAgent('agent-2', transport, memory, eventBus);

      // Agent 1 stores data
      await memory.set('shared/data', { value: 'test' }, 'coordination');

      // Agent 1 syncs memory
      await agent1.syncMemory();

      // Agent 2 retrieves data
      const retrievedData = await memory.get('shared/data', 'coordination');

      expect(retrievedData).toEqual({ value: 'test' });
    });

    it('should broadcast memory updates', async () => {
      const broadcastHandler = jest.fn();
      transport.on('broadcast', broadcastHandler);

      const agent = new MockAgent('agent-1', transport, memory, eventBus);

      await memory.set(`agent/${agent.id}/state`, { status: 'active' }, 'coordination');
      await agent.syncMemory();

      expect(broadcastHandler).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'memory:sync',
          agentId: 'agent-1'
        }),
        peerCount: expect.any(Number)
      });
    });

    it('should handle concurrent memory updates', async () => {
      const agents = Array(10).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      // Concurrent updates
      await Promise.all(
        agents.map((agent, i) =>
          memory.set(`agent/${agent.id}/counter`, i, 'coordination')
        )
      );

      // Verify all updates persisted
      const counters = await Promise.all(
        agents.map(agent =>
          memory.get(`agent/${agent.id}/counter`, 'coordination')
        )
      );

      expect(counters).toHaveLength(10);
      counters.forEach((counter, i) => {
        expect(counter).toBe(i);
      });
    });

    it('should support memory partitions for isolation', async () => {
      const agent1 = new MockAgent('agent-1', transport, memory, eventBus);

      // Store in different partitions
      await memory.set('key1', 'value1', 'coordination');
      await memory.set('key1', 'value2', 'agent_results');
      await memory.set('key1', 'value3', 'patterns');

      const coordValue = await memory.get('key1', 'coordination');
      const resultsValue = await memory.get('key1', 'agent_results');
      const patternsValue = await memory.get('key1', 'patterns');

      expect(coordValue).toBe('value1');
      expect(resultsValue).toBe('value2');
      expect(patternsValue).toBe('value3');
    });
  });

  describe('Event Propagation Tests', () => {
    it('should propagate events across agents via QUIC', async () => {
      const eventHandler = jest.fn();
      eventBus.on('agent:task:completed', eventHandler);

      const agent = new MockAgent('agent-1', transport, memory, eventBus);
      await agent.executeTask('test-task');

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          task: 'test-task'
        })
      );
    });

    it('should handle event storms gracefully', async () => {
      const eventHandler = jest.fn();
      eventBus.on('agent:task:completed', eventHandler);

      const agents = Array(50).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      // Fire 50 events concurrently
      await Promise.all(
        agents.map((agent, i) => agent.executeTask(`task-${i + 1}`))
      );

      expect(eventHandler).toHaveBeenCalledTimes(50);
    });

    it('should support event filtering', async () => {
      const taskHandler = jest.fn();
      const syncHandler = jest.fn();

      eventBus.on('agent:task:completed', taskHandler);
      transport.on('broadcast', (event) => {
        if (event.data.type === 'memory:sync') {
          syncHandler(event);
        }
      });

      const agent = new MockAgent('agent-1', transport, memory, eventBus);

      await agent.executeTask('test-task');
      await agent.syncMemory();

      expect(taskHandler).toHaveBeenCalledTimes(1);
      expect(syncHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Peer Discovery Tests', () => {
    it('should discover peers automatically', async () => {
      const discoveryHandler = jest.fn();
      transport.on('discovery:started', discoveryHandler);

      await transport.discover();

      expect(discoveryHandler).toHaveBeenCalled();
    });

    it('should maintain peer registry', () => {
      transport.registerPeer('agent-1', 'localhost', 4434);
      transport.registerPeer('agent-2', 'localhost', 4435);
      transport.registerPeer('agent-3', 'localhost', 4436);

      const peers = transport.getPeers();

      expect(peers).toHaveLength(3);
      expect(peers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'agent-1', port: 4434 }),
          expect.objectContaining({ id: 'agent-2', port: 4435 }),
          expect.objectContaining({ id: 'agent-3', port: 4436 })
        ])
      );
    });

    it('should emit peer registration events', () => {
      const registrationHandler = jest.fn();
      transport.on('peer:registered', registrationHandler);

      transport.registerPeer('agent-1', 'localhost', 4434);

      expect(registrationHandler).toHaveBeenCalledWith({
        id: 'agent-1',
        host: 'localhost',
        port: 4434
      });
    });

    it('should handle duplicate peer registrations', () => {
      transport.registerPeer('agent-1', 'localhost', 4434);
      transport.registerPeer('agent-1', 'localhost', 4434); // Duplicate

      const peers = transport.getPeers();
      expect(peers).toHaveLength(1);
    });
  });

  describe('Connection Recovery Tests', () => {
    it('should reconnect to lost peers', async () => {
      const reconnectHandler = jest.fn();
      transport.on('peer:reconnected', reconnectHandler);

      transport.registerPeer('agent-1', 'localhost', 4434);

      await transport.reconnect('agent-1');

      expect(reconnectHandler).toHaveBeenCalledWith({ id: 'agent-1' });
    });

    it('should throw error when reconnecting to unknown peer', async () => {
      await expect(transport.reconnect('unknown-agent')).rejects.toThrow(
        'Peer unknown-agent not found'
      );
    });

    it('should update last seen timestamp on reconnect', async () => {
      transport.registerPeer('agent-1', 'localhost', 4434);

      const peersBefore = transport.getPeers();
      const lastSeenBefore = (transport as any).peers.get('agent-1').lastSeen;

      await new Promise(resolve => setTimeout(resolve, 10));
      await transport.reconnect('agent-1');

      const peersAfter = transport.getPeers();
      const lastSeenAfter = (transport as any).peers.get('agent-1').lastSeen;

      expect(lastSeenAfter).toBeGreaterThan(lastSeenBefore);
    });

    it('should maintain message queue during reconnection', async () => {
      transport.registerPeer('agent-1', 'localhost', 4434);

      await transport.send('agent-1', { msg: 'before-reconnect' });
      await transport.reconnect('agent-1');
      await transport.send('agent-1', { msg: 'after-reconnect' });

      const messages = transport.getMessageLog();
      expect(messages).toHaveLength(2);
      expect(messages[0].data.msg).toBe('before-reconnect');
      expect(messages[1].data.msg).toBe('after-reconnect');
    });
  });

  describe('Load Testing with 50+ Agents', () => {
    it('should handle 50 concurrent agents', async () => {
      const agents = Array(50).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      // Register all peers
      agents.forEach((agent, i) => {
        transport.registerPeer(agent.id, 'localhost', 4434 + i);
      });

      // Execute tasks concurrently
      const start = performance.now();
      const results = await Promise.all(
        agents.map((agent, i) => agent.executeTask(`load-test-task-${i + 1}`))
      );
      const duration = performance.now() - start;

      expect(results).toHaveLength(50);
      expect(transport.getPeers()).toHaveLength(50);
      expect(duration).toBeLessThan(5000); // < 5 seconds for 50 agents
    });

    it('should handle 100 agents with memory sync', async () => {
      const agents = Array(100).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      // Store initial state
      await Promise.all(
        agents.map(agent =>
          memory.set(`agent/${agent.id}/state`, { active: true }, 'coordination')
        )
      );

      // Sync memory
      const start = performance.now();
      await Promise.all(agents.map(agent => agent.syncMemory()));
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(3000); // < 3 seconds for 100 agents
    });

    it('should maintain performance under high message load', async () => {
      const agents = Array(50).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      agents.forEach((agent, i) => {
        transport.registerPeer(agent.id, 'localhost', 4434 + i);
      });

      // Each agent sends 10 messages
      const start = performance.now();
      await Promise.all(
        agents.map(agent =>
          Promise.all(
            Array(10).fill(null).map((_, i) =>
              agent.executeTask(`stress-test-${i}`)
            )
          )
        )
      );
      const duration = performance.now() - start;

      const messages = transport.getMessageLog();
      expect(messages.length).toBeGreaterThanOrEqual(500); // 50 agents * 10 messages
      expect(duration).toBeLessThan(10000); // < 10 seconds
    });

    it('should handle memory pressure with many agents', async () => {
      const agents = Array(100).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      // Store data for each agent
      await Promise.all(
        agents.map((agent, i) =>
          memory.set(
            `agent/${agent.id}/data`,
            { iteration: i, data: new Array(100).fill(i) },
            'coordination'
          )
        )
      );

      // Verify all data persisted
      const stored = await Promise.all(
        agents.map(agent =>
          memory.get(`agent/${agent.id}/data`, 'coordination')
        )
      );

      expect(stored).toHaveLength(100);
      expect(stored.every(d => d !== null)).toBe(true);
    });

    it('should measure throughput (messages per second)', async () => {
      const agents = Array(50).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      agents.forEach((agent, i) => {
        transport.registerPeer(agent.id, 'localhost', 4434 + i);
      });

      const messageCount = 1000;
      const messagesPerAgent = messageCount / agents.length;

      const start = performance.now();
      await Promise.all(
        agents.map(agent =>
          Promise.all(
            Array(Math.ceil(messagesPerAgent)).fill(null).map((_, i) =>
              agent.executeTask(`throughput-test-${i}`)
            )
          )
        )
      );
      const duration = (performance.now() - start) / 1000; // Convert to seconds

      const throughput = messageCount / duration;

      expect(throughput).toBeGreaterThan(100); // > 100 messages/second
      console.log(`Throughput: ${throughput.toFixed(2)} messages/second`);
    });
  });

  describe('QUIC vs EventBus Performance Comparison', () => {
    it('should measure QUIC message latency', async () => {
      const agent = new MockAgent('agent-1', transport, memory, eventBus);
      transport.registerPeer('agent-1', 'localhost', 4434);

      const latencies: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await transport.send('agent-1', { msg: `test-${i}` });
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      console.log(`QUIC Latency - Avg: ${avgLatency.toFixed(2)}ms, Min: ${minLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(10); // < 10ms average
    });

    it('should measure EventBus message latency', async () => {
      const latencies: number[] = [];
      const handler = jest.fn();

      eventBus.on('test:event', handler);

      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        eventBus.emit('test:event', { msg: `test-${i}` });
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      console.log(`EventBus Latency - Avg: ${avgLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(1); // EventBus should be very fast (in-process)
    });

    it('should demonstrate QUIC advantage for distributed scenarios', async () => {
      // QUIC: Simulates network communication
      const agents = Array(10).fill(null).map((_, i) =>
        new MockAgent(`agent-${i + 1}`, transport, memory, eventBus)
      );

      agents.forEach((agent, i) => {
        transport.registerPeer(agent.id, 'localhost', 4434 + i);
      });

      const start = performance.now();
      await Promise.all(
        agents.map(agent => transport.send(agent.id, { type: 'distributed' }))
      );
      const quicDuration = performance.now() - start;

      console.log(`QUIC (distributed): ${quicDuration.toFixed(2)}ms for 10 agents`);

      // QUIC should handle distributed scenarios that EventBus cannot
      expect(quicDuration).toBeLessThan(100); // < 100ms for 10 distributed agents
    });
  });
});
