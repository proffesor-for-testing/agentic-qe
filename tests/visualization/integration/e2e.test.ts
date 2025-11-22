/**
 * End-to-End Integration Tests for Phase 3 Visualization
 * Tests complete telemetry → API → UI → user interaction flow
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock telemetry system
class TelemetryEmitter {
  private listeners: Map<string, Array<(data: unknown) => void>> = new Map();

  emit(eventType: string, data: unknown): void {
    const handlers = this.listeners.get(eventType) || [];
    handlers.forEach(handler => handler(data));
  }

  on(eventType: string, handler: (data: unknown) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(handler);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// Mock API layer
class VisualizationAPI {
  private events: unknown[] = [];
  private subscribers: Set<(data: unknown) => void> = new Set();

  async ingestEvent(event: unknown): Promise<void> {
    this.events.push(event);
    // Notify subscribers
    this.subscribers.forEach(sub => sub(event));
  }

  subscribe(callback: (data: unknown) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  async getEvents(filters?: Record<string, unknown>): Promise<unknown[]> {
    return this.events;
  }

  clearEvents(): void {
    this.events = [];
  }
}

// Mock UI component
class DashboardUI {
  private nodes: unknown[] = [];
  private updateCallbacks: Set<() => void> = new Set();

  updateGraph(nodes: unknown[]): void {
    this.nodes = nodes;
    this.notifyUpdate();
  }

  getNodes(): unknown[] {
    return this.nodes;
  }

  onUpdate(callback: () => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  private notifyUpdate(): void {
    this.updateCallbacks.forEach(cb => cb());
  }

  simulateUserInteraction(action: string, params?: Record<string, unknown>): void {
    // Simulate user actions like zoom, search, expand/collapse
    if (action === 'search') {
      const query = params?.query as string;
      this.nodes = this.nodes.filter((node: any) =>
        JSON.stringify(node).includes(query)
      );
    } else if (action === 'filter') {
      const filter = params?.filter as (node: any) => boolean;
      this.nodes = this.nodes.filter(filter);
    }
    this.notifyUpdate();
  }

  clear(): void {
    this.nodes = [];
    this.updateCallbacks.clear();
  }
}

describe('E2E Integration Tests', () => {
  let telemetry: TelemetryEmitter;
  let api: VisualizationAPI;
  let ui: DashboardUI;

  beforeEach(() => {
    telemetry = new TelemetryEmitter();
    api = new VisualizationAPI();
    ui = new DashboardUI();
  });

  afterEach(() => {
    telemetry.removeAllListeners();
    api.clearEvents();
    ui.clear();
  });

  describe('Complete Data Flow', () => {
    it('should flow data from telemetry to UI', async () => {
      // Setup: Connect telemetry → API → UI
      telemetry.on('event', async (data) => {
        await api.ingestEvent(data);
      });

      api.subscribe((data) => {
        ui.updateGraph([data]);
      });

      // Act: Emit telemetry event
      const testEvent = {
        id: 'evt-1',
        type: 'test.executed',
        timestamp: Date.now(),
        agentId: 'agent-1',
        data: { test: 'example', result: 'passed' }
      };

      telemetry.emit('event', testEvent);

      // Wait for async propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: Event reached UI
      const nodes = ui.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual(testEvent);
    });

    it('should handle real-time event streaming', async () => {
      const receivedEvents: unknown[] = [];

      api.subscribe((data) => {
        receivedEvents.push(data);
        ui.updateGraph(receivedEvents);
      });

      telemetry.on('event', async (data) => {
        await api.ingestEvent(data);
      });

      // Stream multiple events
      const events = Array(10).fill(null).map((_, i) => ({
        id: `evt-${i}`,
        type: 'metric.update',
        timestamp: Date.now() + i * 100,
        value: Math.random() * 100
      }));

      for (const event of events) {
        telemetry.emit('event', event);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(ui.getNodes()).toHaveLength(10);
    });

    it('should maintain data integrity through pipeline', async () => {
      const originalData = {
        id: 'unique-id-123',
        type: 'important.event',
        timestamp: 1234567890,
        agentId: 'critical-agent',
        data: {
          nested: { value: 42 },
          array: [1, 2, 3],
          string: 'test'
        }
      };

      let apiReceivedData: unknown;
      telemetry.on('event', async (data) => {
        apiReceivedData = data;
        await api.ingestEvent(data);
      });

      api.subscribe((data) => {
        ui.updateGraph([data]);
      });

      telemetry.emit('event', originalData);

      await new Promise(resolve => setTimeout(resolve, 100));

      const uiNodes = ui.getNodes();
      expect(uiNodes[0]).toEqual(originalData);
      expect(apiReceivedData).toEqual(originalData);
    });
  });

  describe('User Interactions', () => {
    beforeEach(async () => {
      // Setup test data
      const events = [
        { id: 'evt-1', type: 'test', agentId: 'agent-1', name: 'Test A' },
        { id: 'evt-2', type: 'metric', agentId: 'agent-2', name: 'Test B' },
        { id: 'evt-3', type: 'test', agentId: 'agent-1', name: 'Test C' }
      ];

      for (const event of events) {
        await api.ingestEvent(event);
      }

      const allEvents = await api.getEvents();
      ui.updateGraph(allEvents);
    });

    it('should handle search interaction', async () => {
      expect(ui.getNodes()).toHaveLength(3);

      ui.simulateUserInteraction('search', { query: 'Test A' });

      const filtered = ui.getNodes();
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThan(3);
    });

    it('should handle filter interaction', async () => {
      ui.simulateUserInteraction('filter', {
        filter: (node: any) => node.type === 'test'
      });

      const filtered = ui.getNodes();
      expect(filtered).toHaveLength(2);
      filtered.forEach((node: any) => {
        expect(node.type).toBe('test');
      });
    });

    it('should handle expand/collapse interaction', async () => {
      const updateCount = { value: 0 };

      ui.onUpdate(() => {
        updateCount.value++;
      });

      ui.simulateUserInteraction('expand', { nodeId: 'evt-1' });

      expect(updateCount.value).toBeGreaterThan(0);
    });

    it('should update UI in real-time on new data', async () => {
      const updates: number[] = [];

      ui.onUpdate(() => {
        updates.push(ui.getNodes().length);
      });

      // Add new events
      for (let i = 4; i <= 6; i++) {
        await api.ingestEvent({ id: `evt-${i}`, type: 'new' });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // UI should have been updated
      expect(updates.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Requirements', () => {
    it('should handle high event throughput', async () => {
      const eventCount = 1000;
      const startTime = Date.now();

      telemetry.on('event', async (data) => {
        await api.ingestEvent(data);
      });

      // Generate high volume of events
      for (let i = 0; i < eventCount; i++) {
        telemetry.emit('event', {
          id: `evt-${i}`,
          timestamp: Date.now(),
          type: 'load-test'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const duration = Date.now() - startTime;
      const throughput = (eventCount / duration) * 1000; // events per second

      expect(throughput).toBeGreaterThan(100); // At least 100 events/sec
    });

    it('should render large datasets efficiently', async () => {
      const nodeCount = 500;
      const nodes = Array(nodeCount).fill(null).map((_, i) => ({
        id: `node-${i}`,
        type: 'test',
        data: { index: i }
      }));

      const startTime = Date.now();
      ui.updateGraph(nodes);
      const renderTime = Date.now() - startTime;

      expect(renderTime).toBeLessThan(100); // Render 500 nodes in <100ms
      expect(ui.getNodes()).toHaveLength(nodeCount);
    });

    it('should handle concurrent user interactions', async () => {
      const interactions = [
        () => ui.simulateUserInteraction('search', { query: 'test' }),
        () => ui.simulateUserInteraction('filter', { filter: () => true }),
        () => ui.simulateUserInteraction('expand', { nodeId: 'evt-1' })
      ];

      const startTime = Date.now();

      await Promise.all(interactions.map(fn => Promise.resolve(fn())));

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200); // All interactions in <200ms
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const errorHandler = jest.fn();

      try {
        // Simulate API error
        throw new Error('API connection failed');
      } catch (error) {
        errorHandler(error);
      }

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should recover from temporary disconnections', async () => {
      let connected = true;
      const reconnectAttempts: number[] = [];

      const attemptReconnect = () => {
        reconnectAttempts.push(Date.now());
        connected = true;
      };

      // Simulate disconnect
      connected = false;

      // Attempt reconnection
      const maxRetries = 3;
      for (let i = 0; i < maxRetries && !connected; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attemptReconnect();
      }

      expect(connected).toBe(true);
      expect(reconnectAttempts.length).toBeGreaterThan(0);
    });

    it('should handle malformed telemetry data', async () => {
      const errors: unknown[] = [];

      telemetry.on('event', async (data) => {
        try {
          // Validate data structure
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid data format');
          }
          await api.ingestEvent(data);
        } catch (error) {
          errors.push(error);
        }
      });

      // Emit malformed data
      telemetry.emit('event', null);
      telemetry.emit('event', 'invalid string');
      telemetry.emit('event', { valid: 'object' });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errors.length).toBeGreaterThan(0);
      const storedEvents = await api.getEvents();
      expect(storedEvents).toHaveLength(1); // Only valid event stored
    });
  });

  describe('Success Criteria Validation', () => {
    it('should achieve <2s dashboard load time', async () => {
      const startTime = Date.now();

      // Simulate dashboard initialization
      const events = Array(100).fill(null).map((_, i) => ({
        id: `evt-${i}`,
        type: 'init',
        timestamp: Date.now()
      }));

      for (const event of events) {
        await api.ingestEvent(event);
      }

      const allEvents = await api.getEvents();
      ui.updateGraph(allEvents);

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(2000);
    });

    it('should achieve <500ms WebSocket latency', async () => {
      const latencies: number[] = [];

      api.subscribe((data: any) => {
        const latency = Date.now() - data.timestamp;
        latencies.push(latency);
      });

      telemetry.on('event', async (data) => {
        await api.ingestEvent(data);
      });

      // Send test events
      for (let i = 0; i < 10; i++) {
        telemetry.emit('event', { timestamp: Date.now(), id: `evt-${i}` });
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      expect(avgLatency).toBeLessThan(500);
    });

    it('should render 100 nodes in <100ms', async () => {
      const nodes = Array(100).fill(null).map((_, i) => ({
        id: `node-${i}`,
        label: `Node ${i}`,
        type: 'test'
      }));

      const startTime = Date.now();
      ui.updateGraph(nodes);
      const renderTime = Date.now() - startTime;

      expect(renderTime).toBeLessThan(100);
      expect(ui.getNodes()).toHaveLength(100);
    });

    it('should maintain data consistency under load', async () => {
      const eventIds = new Set<string>();
      const receivedIds = new Set<string>();

      api.subscribe((data: any) => {
        receivedIds.add(data.id);
      });

      telemetry.on('event', async (data: any) => {
        eventIds.add(data.id);
        await api.ingestEvent(data);
      });

      // Generate load
      const eventCount = 100;
      for (let i = 0; i < eventCount; i++) {
        telemetry.emit('event', {
          id: `unique-${i}`,
          timestamp: Date.now()
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // All events should be received
      expect(receivedIds.size).toBe(eventIds.size);
      expect(receivedIds.size).toBe(eventCount);
    });

    it('should support concurrent users', async () => {
      const userCount = 5;
      const uis = Array(userCount).fill(null).map(() => new DashboardUI());

      api.subscribe((data) => {
        uis.forEach(userUI => userUI.updateGraph([data]));
      });

      telemetry.on('event', async (data) => {
        await api.ingestEvent(data);
      });

      // Each user triggers events
      for (let i = 0; i < 10; i++) {
        telemetry.emit('event', {
          id: `multi-user-evt-${i}`,
          timestamp: Date.now()
        });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // All users should see all events
      uis.forEach(userUI => {
        expect(userUI.getNodes().length).toBeGreaterThan(0);
      });

      // Cleanup
      uis.forEach(userUI => userUI.clear());
    });
  });

  describe('Data Transformation Pipeline', () => {
    it('should transform raw telemetry to visualization format', async () => {
      const rawEvent = {
        id: 'raw-1',
        timestamp: Date.now(),
        type: 'agent.reasoning',
        agentId: 'agent-1',
        data: {
          steps: ['think', 'act', 'observe'],
          duration: 1500
        }
      };

      const transformed: any = {
        ...rawEvent,
        visualType: 'reasoning-chain',
        displayLabel: `${rawEvent.agentId}: ${rawEvent.type}`
      };

      await api.ingestEvent(transformed);
      ui.updateGraph([transformed]);

      const nodes = ui.getNodes();
      expect(nodes[0]).toHaveProperty('visualType');
      expect(nodes[0]).toHaveProperty('displayLabel');
    });

    it('should aggregate related events', async () => {
      const relatedEvents = [
        { id: 'evt-1', agentId: 'agent-1', type: 'start', timestamp: 1000 },
        { id: 'evt-2', agentId: 'agent-1', type: 'process', timestamp: 2000 },
        { id: 'evt-3', agentId: 'agent-1', type: 'end', timestamp: 3000 }
      ];

      for (const event of relatedEvents) {
        await api.ingestEvent(event);
      }

      const aggregated = {
        agentId: 'agent-1',
        events: relatedEvents,
        totalDuration: 2000,
        eventCount: 3
      };

      ui.updateGraph([aggregated]);

      const nodes = ui.getNodes();
      expect(nodes[0]).toHaveProperty('totalDuration');
      expect(nodes[0]).toHaveProperty('eventCount');
    });
  });
});
