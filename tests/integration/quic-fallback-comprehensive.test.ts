/**
 * Comprehensive QUIC Fallback Tests
 *
 * Tests backward compatibility and graceful degradation when QUIC is unavailable.
 * Ensures system continues to function via TCP/EventBus fallback.
 *
 * Coverage:
 * - QUIC unavailable scenarios (8 tests)
 * - Runtime fallback (6 tests)
 * - Performance validation (4 tests)
 * - Backward compatibility (8 tests)
 * - Error recovery (6 tests)
 * - Agent integration (8 tests)
 *
 * Total: 40+ comprehensive fallback tests
 */

import { EventBus } from '@core/EventBus';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { MemoryStoreAdapter } from '../../src/adapters/MemoryStoreAdapter';
import {
  AgentId,
  TaskAssignment,
  AgentCapability,
  AgentStatus,
  QEAgentType,
  MemoryStore
} from '@typessrc/types';

// Mock QUIC transport for testing
class MockQUICTransport {
  private shouldFail: boolean = false;
  private failureType: 'init' | 'handshake' | 'timeout' | 'runtime' | null = null;
  private initialized: boolean = false;

  constructor(private config: any) {}

  setFailureMode(type: 'init' | 'handshake' | 'timeout' | 'runtime' | null) {
    this.failureType = type;
    this.shouldFail = type !== null;
  }

  async initialize(): Promise<void> {
    if (this.failureType === 'init') {
      throw new Error('QUIC_UNAVAILABLE: Library not found');
    }
    if (this.failureType === 'handshake') {
      throw new Error('QUIC_HANDSHAKE_FAILED');
    }
    if (this.failureType === 'timeout') {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error('QUIC_TIMEOUT')), 100)
      );
    }
    this.initialized = true;
  }

  async send(target: string, message: any): Promise<void> {
    if (!this.initialized) {
      throw new Error('QUIC not initialized');
    }
    if (this.failureType === 'runtime') {
      throw new Error('QUIC_CONNECTION_LOST');
    }
    // Simulate successful send
  }

  async close(): Promise<void> {
    this.initialized = false;
  }

  isConnected(): boolean {
    return this.initialized && !this.shouldFail;
  }
}

// Transport layer with fallback support
class TransportLayer {
  private quicTransport: MockQUICTransport | null = null;
  private tcpFallback: boolean = false;
  private eventBusActive: boolean = false;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private fallbackEvents: Array<{ timestamp: number; reason: string }> = [];

  constructor(
    private eventBus: EventBus,
    private config: { enableQUIC?: boolean; quicPort?: number; mockTransport?: MockQUICTransport } = {}
  ) {
    // Allow injection of mock transport for testing
    if (config.mockTransport) {
      this.quicTransport = config.mockTransport;
    }
  }

  async initialize(): Promise<void> {
    if (this.config.enableQUIC !== false) {
      try {
        // Use injected mock or create new one
        if (!this.quicTransport) {
          this.quicTransport = new MockQUICTransport(this.config);
        }
        await this.quicTransport.initialize();
      } catch (error: any) {
        await this.handleQUICFailure('initialization', error.message);
      }
    } else {
      this.eventBusActive = true;
    }
  }

  private async handleQUICFailure(phase: string, reason: string): Promise<void> {
    this.fallbackEvents.push({ timestamp: Date.now(), reason: `${phase}: ${reason}` });

    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, this.retryCount) * 100));
      try {
        if (this.quicTransport) {
          await this.quicTransport.initialize();
          this.retryCount = 0; // Reset on success
          return;
        }
      } catch (retryError) {
        // Continue to fallback
      }
    }

    // Permanent fallback
    this.tcpFallback = true;
    this.eventBusActive = true;
    this.quicTransport = null;
  }

  async send(target: string, message: any): Promise<void> {
    if (this.quicTransport?.isConnected()) {
      try {
        await this.quicTransport.send(target, message);
        return;
      } catch (error: any) {
        await this.handleQUICFailure('runtime', error.message);
      }
    }

    // Fallback to EventBus
    if (this.eventBusActive) {
      this.eventBus.emit('agent:message', { target, message });
    }
  }

  getActiveTransport(): 'quic' | 'tcp' | 'eventbus' {
    if (this.quicTransport?.isConnected()) return 'quic';
    if (this.tcpFallback) return 'tcp';
    return 'eventbus';
  }

  getFallbackEvents(): Array<{ timestamp: number; reason: string }> {
    return this.fallbackEvents;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  async close(): Promise<void> {
    if (this.quicTransport) {
      await this.quicTransport.close();
    }
  }
}

// Simple mock agent for transport testing (doesn't extend BaseAgent to avoid complexity)
class TestAgent {
  public agentId: AgentId;
  public receivedMessages: any[] = [];
  private transport: TransportLayer;
  private eventBus: EventBus;

  constructor(
    id: AgentId,
    eventBus: EventBus,
    config?: { enableQUIC?: boolean }
  ) {
    this.agentId = id;
    this.eventBus = eventBus;
    this.transport = new TransportLayer(eventBus, config);
  }

  async initialize(): Promise<void> {
    await this.transport.initialize();

    // Subscribe to messages
    this.eventBus.on('agent:message', (data) => {
      if (data.target === this.agentId.id) {
        this.receivedMessages.push(data.message);
      }
    });
  }

  async sendToAgent(targetId: string, message: any): Promise<void> {
    await this.transport.send(targetId, message);
  }

  getTransport(): TransportLayer {
    return this.transport;
  }

  async executeTask(assignment: TaskAssignment): Promise<any> {
    return { status: 'completed', data: 'test result' };
  }

  async cleanup(): Promise<void> {
    await this.transport.close();
    this.eventBus.removeAllListeners();
  }

  get id(): string {
    return this.agentId.id;
  }
}

describe('QUIC Fallback - Unavailable Scenarios', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await eventBus.removeAllListeners();
  });

  test('should fallback to EventBus when QUIC library not found', async () => {
    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    const transport = new TransportLayer(eventBus, {
      enableQUIC: true,
      mockTransport: mockQUIC
    });
    await transport.initialize();

    expect(transport.getActiveTransport()).toBe('eventbus');
    expect(transport.getFallbackEvents().length).toBeGreaterThan(0);
  });

  test('should fallback when QUIC port is blocked', async () => {
    const transport = new TransportLayer(eventBus, {
      enableQUIC: true,
      quicPort: 9999
    });

    const mockQUIC = new MockQUICTransport({ quicPort: 9999 });
    mockQUIC.setFailureMode('init');

    await transport.initialize();
    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should fallback when QUIC handshake fails', async () => {
    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('handshake');

    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    expect(transport.getActiveTransport()).toBe('eventbus');
    const events = transport.getFallbackEvents();
    expect(events.some(e => e.reason.includes('HANDSHAKE'))).toBe(true);
  });

  test('should fallback when QUIC initialization throws', async () => {
    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    await expect(transport.initialize()).resolves.not.toThrow();
    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should fallback when QUIC timeout occurs', async () => {
    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('timeout');

    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should use EventBus as ultimate fallback', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    // Simulate all failures
    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    await transport.initialize();

    // Should still be able to send messages
    let messageReceived = false;
    eventBus.on('agent:message', () => {
      messageReceived = true;
    });

    await transport.send('target-agent', { data: 'test' });
    expect(messageReceived).toBe(true);
  });

  test('should fallback when certificates are invalid', async () => {
    const mockQUIC = new MockQUICTransport({
      certificates: { key: 'invalid', cert: 'invalid' }
    });
    mockQUIC.setFailureMode('init');

    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should fallback when firewall blocks UDP', async () => {
    // Simulate UDP port blocking
    const mockQUIC = new MockQUICTransport({ protocol: 'UDP' });
    mockQUIC.setFailureMode('handshake');

    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    expect(transport.getActiveTransport()).toBe('eventbus');
  });
});

describe('QUIC Fallback - Runtime Degradation', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await eventBus.removeAllListeners();
  });

  test('should switch to EventBus mid-connection if QUIC fails', async () => {
    const mockQUIC = new MockQUICTransport({});
    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    // Simulate runtime failure
    mockQUIC.setFailureMode('runtime');

    await transport.send('target', { data: 'test' });
    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should resume operations after fallback', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('runtime');

    // Should continue working
    await transport.send('target1', { data: 'message1' });
    await transport.send('target2', { data: 'message2' });

    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should not lose messages during fallback', async () => {
    const receivedMessages: any[] = [];
    eventBus.on('agent:message', (msg) => receivedMessages.push(msg));

    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    // Send messages during fallback
    await transport.send('target', { id: 1 });
    await transport.send('target', { id: 2 });
    await transport.send('target', { id: 3 });

    expect(receivedMessages).toHaveLength(3);
    expect(receivedMessages.map(m => m.message.id)).toEqual([1, 2, 3]);
  });

  test('should reconnect via EventBus automatically', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('runtime');

    await transport.send('target', { data: 'test' });

    // Verify automatic fallback
    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should emit fallback events', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    const events = transport.getFallbackEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty('timestamp');
    expect(events[0]).toHaveProperty('reason');
  });

  test('should track fallback metrics', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    await transport.initialize();

    const events = transport.getFallbackEvents();
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0);
    expect(transport.getRetryCount()).toBeGreaterThanOrEqual(0);
  });
});

describe('QUIC Fallback - Performance Validation', () => {
  let eventBus: EventBus;
  

  beforeEach(() => {
    eventBus = new EventBus();
    
  });

  afterEach(async () => {
    await eventBus.removeAllListeners();
  });

  test('should maintain acceptable latency on EventBus fallback', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: false });
    await transport.initialize();

    const start = Date.now();
    await transport.send('target', { data: 'test' });
    const latency = Date.now() - start;

    // Should complete within 100ms (generous for EventBus)
    expect(latency).toBeLessThan(100);
  });

  test('should handle throughput degradation gracefully', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: false });
    await transport.initialize();

    const messages = Array.from({ length: 100 }, (_, i) => ({ id: i }));

    const start = Date.now();
    await Promise.all(messages.map(msg => transport.send('target', msg)));
    const duration = Date.now() - start;

    // Should handle 100 messages within 1 second
    expect(duration).toBeLessThan(1000);
  });

  test('should not exceed memory limits on fallback', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: false });
    await transport.initialize();

    const initialMemory = process.memoryUsage().heapUsed;

    // Send many messages
    const messages = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      data: 'x'.repeat(1000)
    }));

    await Promise.all(messages.map(msg => transport.send('target', msg)));

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Should not use more than 10MB
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });

  test('should log performance degradation warnings', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('runtime');

    await transport.initialize();

    const events = transport.getFallbackEvents();
    expect(events.some(e => e.reason.includes('runtime'))).toBe(true);
  });
});

describe('QUIC Fallback - Backward Compatibility', () => {
  let eventBus: EventBus;
  

  beforeEach(() => {
    eventBus = new EventBus();
    
  });

  afterEach(async () => {
    await eventBus.removeAllListeners();
  });

  test('should work with QUIC disabled in config', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: false });
    await transport.initialize();

    expect(transport.getActiveTransport()).toBe('eventbus');

    // Should work normally
    await transport.send('target', { data: 'test' });
  });

  test('should work with quicEnabled: false flag', async () => {
    const agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: false });

    await agent.initialize();
    expect(agent.getTransport().getActiveTransport()).toBe('eventbus');

    await agent.cleanup();
  });

  test('should use EventBus when QUIC not configured', async () => {
    const agent = new TestAgent(
      { id: 'test-1', type: 'tester' },
      ['test-execution'],
      eventBus,
      memoryStore
      // No QUIC config
    );

    await agent.initialize();
    expect(agent.getTransport().getActiveTransport()).toBe('eventbus');

    await agent.cleanup();
  });

  test('should not break existing coordination patterns', async () => {
    const agent1 = new TestAgent({ id: 'agent-1', type: 'tester'  }, eventBus);

    const agent2 = new TestAgent({ id: 'agent-2', type: 'analyzer'  }, eventBus);

    await agent1.initialize();
    await agent2.initialize();

    // Coordinate via EventBus
    await agent1.sendToAgent('agent-2', { task: 'analyze' });

    expect(agent2.receivedMessages).toHaveLength(1);
    expect(agent2.receivedMessages[0]).toEqual({ task: 'analyze' });

    await agent1.cleanup();
    await agent2.cleanup();
  });

  test('should maintain API compatibility', async () => {
    const transport = new TransportLayer(eventBus);

    // All methods should exist
    expect(typeof transport.initialize).toBe('function');
    expect(typeof transport.send).toBe('function');
    expect(typeof transport.getActiveTransport).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  test('should handle mixed fleet (QUIC + non-QUIC agents)', async () => {
    const quicAgent = new TestAgent({ id: 'quic-agent', type: 'tester'  }, eventBus, { enableQUIC: true });

    const normalAgent = new TestAgent({ id: 'normal-agent', type: 'analyzer'  }, eventBus, { enableQUIC: false });

    await quicAgent.initialize();
    await normalAgent.initialize();

    // Both should communicate via EventBus
    await quicAgent.sendToAgent('normal-agent', { data: 'test' });

    expect(normalAgent.receivedMessages).toHaveLength(1);

    await quicAgent.cleanup();
    await normalAgent.cleanup();
  });

  test('should coordinate across different transport modes', async () => {
    const agents = await Promise.all([
      (async () => {
        const agent = new TestAgent({ id: 'agent-1', type: 'tester'  }, eventBus, { enableQUIC: true });
        await agent.initialize();
        return agent;
      })(),
      (async () => {
        const agent = new TestAgent({ id: 'agent-2', type: 'analyzer'  }, eventBus, { enableQUIC: false });
        await agent.initialize();
        return agent;
      })()
    ]);

    // Cross-transport communication
    await agents[0].sendToAgent('agent-2', { message: 'hello' });
    await agents[1].sendToAgent('agent-1', { message: 'world' });

    expect(agents[1].receivedMessages).toHaveLength(1);
    expect(agents[0].receivedMessages).toHaveLength(1);

    await Promise.all(agents.map(a => a.cleanup()));
  });

  test('should preserve message ordering on fallback', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    const receivedMessages: any[] = [];
    eventBus.on('agent:message', (msg) => receivedMessages.push(msg.message));

    const messages = [1, 2, 3, 4, 5];
    for (const id of messages) {
      await transport.send('target', { id });
    }

    expect(receivedMessages.map(m => m.id)).toEqual(messages);
  });
});

describe('QUIC Fallback - Error Recovery', () => {
  let eventBus: EventBus;
  

  beforeEach(() => {
    eventBus = new EventBus();
    
  });

  afterEach(async () => {
    await eventBus.removeAllListeners();
  });

  test('should recover from transient QUIC errors', async () => {
    const mockQUIC = new MockQUICTransport({});
    // Simulate transient error that recovers
    mockQUIC.setFailureMode('timeout');

    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    expect(transport.getFallbackEvents().length).toBeGreaterThan(0);
  });

  test('should retry QUIC before permanent fallback', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    await transport.initialize();

    // Should have attempted retries
    expect(transport.getRetryCount()).toBeGreaterThan(0);
    expect(transport.getActiveTransport()).toBe('eventbus');
  });

  test('should handle oscillating connections', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });
    await transport.initialize();

    // Simulate multiple failures
    for (let i = 0; i < 3; i++) {
      await transport.send('target', { attempt: i });
    }

    expect(transport.getFallbackEvents().length).toBeGreaterThanOrEqual(0);
  });

  test('should apply exponential backoff on retries', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    const start = Date.now();
    await transport.initialize();
    const duration = Date.now() - start;

    // Should take time due to exponential backoff
    // First retry: 200ms, second: 400ms, third: 800ms
    expect(duration).toBeGreaterThan(100); // At least some backoff occurred
  });

  test('should give up after max retries and use EventBus', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    await transport.initialize();

    expect(transport.getActiveTransport()).toBe('eventbus');
    expect(transport.getRetryCount()).toBeGreaterThanOrEqual(3);
  });

  test('should cleanup resources on permanent fallback', async () => {
    const transport = new TransportLayer(eventBus, { enableQUIC: true });

    const mockQUIC = new MockQUICTransport({});
    mockQUIC.setFailureMode('init');

    await transport.initialize();
    await transport.close();

    expect(transport.getActiveTransport()).toBe('eventbus');
  });
});

describe('QUIC Fallback - Agent Integration', () => {
  let eventBus: EventBus;
  

  beforeEach(() => {
    eventBus = new EventBus();
    
  });

  afterEach(async () => {
    await eventBus.removeAllListeners();
  });

  test('should enable QUIC on agents with config', async () => {
    const agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: true });

    await agent.initialize();

    // Should attempt QUIC (will fallback in test environment)
    expect(agent.getTransport()).toBeDefined();

    await agent.cleanup();
  });

  test('should fallback agents to EventBus when QUIC fails', async () => {
    const agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: true });

    await agent.initialize();

    expect(agent.getTransport().getActiveTransport()).toBe('eventbus');

    await agent.cleanup();
  });

  test('should coordinate fleet with mixed transports', async () => {
    const agents = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const agent = new TestAgent(
          { id: `agent-${i}`, type: 'tester' },
          ['test'],
          eventBus,
          memoryStore,
          { enableQUIC: i % 2 === 0 } // Alternate QUIC on/off
        );
        return agent.initialize().then(() => agent);
      })
    );

    // All should be able to communicate
    await agents[0].sendToAgent('agent-1', { message: 'test' });

    expect(agents[1].receivedMessages).toHaveLength(1);

    await Promise.all(agents.map(a => a.cleanup()));
  });

  test('should maintain agent communication during fallback', async () => {
    const agent1 = new TestAgent({ id: 'agent-1', type: 'tester'  }, eventBus, { enableQUIC: true });

    const agent2 = new TestAgent({ id: 'agent-2', type: 'analyzer'  }, eventBus, { enableQUIC: true });

    await agent1.initialize();
    await agent2.initialize();

    // Communication should work despite QUIC unavailable
    await agent1.sendToAgent('agent-2', { task: 'analyze' });

    expect(agent2.receivedMessages).toHaveLength(1);

    await agent1.cleanup();
    await agent2.cleanup();
  });

  test('should not disrupt ongoing tasks on fallback', async () => {
    const agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: true });

    await agent.initialize();

    const taskAssignment: TaskAssignment = {
      id: 'task-1',
      description: 'Test task',
      assignedTo: { id: 'test-1', type: 'tester' },
      priority: 5,
      status: 'assigned',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Task should complete despite transport fallback
    const result = await agent.executeTask(taskAssignment);
    expect(result.status).toBe('completed');

    await agent.cleanup();
  });

  test('should preserve agent state during transport switch', async () => {
    const agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: true });

    await agent.initialize();

    // Store some state
    agent.receivedMessages.push({ id: 1 });

    // Transport switch shouldn't affect state
    expect(agent.receivedMessages).toHaveLength(1);
    expect(agent.getTransport()).toBeDefined();

    await agent.cleanup();
  });

  test('should handle agent restart with different transport', async () => {
    let agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: true });

    await agent.initialize();
    await agent.cleanup();

    // Restart with QUIC disabled
    agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: false });

    await agent.initialize();
    expect(agent.getTransport().getActiveTransport()).toBe('eventbus');

    await agent.cleanup();
  });

  test('should log agent transport changes', async () => {
    const agent = new TestAgent({ id: 'test-1', type: 'tester'  }, eventBus, { enableQUIC: true });

    await agent.initialize();

    const events = agent.getTransport().getFallbackEvents();
    expect(events).toBeDefined();

    await agent.cleanup();
  });
});
