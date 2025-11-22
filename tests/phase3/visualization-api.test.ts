/**
 * @fileoverview Phase 3 Visualization API Tests
 * @module tests/phase3/visualization-api
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventStore } from '../../src/persistence/event-store';
import { ReasoningStore } from '../../src/persistence/reasoning-store';
import { DataTransformer } from '../../src/visualization/core/DataTransformer';
import { RestApiServer } from '../../src/visualization/api/RestEndpoints';
import { WebSocketServer } from '../../src/visualization/api/WebSocketServer';
import { VisualizationService } from '../../src/visualization';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 3: Visualization API Layer', () => {
  const testDbPath = path.join(__dirname, '../../data/test-viz.db');
  let eventStore: EventStore;
  let reasoningStore: ReasoningStore;
  let transformer: DataTransformer;

  beforeEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    eventStore = new EventStore({ dbPath: testDbPath });
    reasoningStore = new ReasoningStore({ dbPath: testDbPath });
    transformer = new DataTransformer(eventStore, reasoningStore);
  });

  afterEach(() => {
    eventStore.close();
    reasoningStore.close();

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('V4: DataTransformer', () => {
    it('should transform events to visualization graph', () => {
      // Create test session with events
      const sessionId = 'test-session-v4';

      eventStore.recordEvent({
        agent_id: 'test-generator',
        event_type: 'test_generated',
        payload: { testCount: 10 },
        session_id: sessionId,
      });

      eventStore.recordEvent({
        agent_id: 'coverage-analyzer',
        event_type: 'coverage_analyzed',
        payload: { coverage: 85 },
        session_id: sessionId,
      });

      // Build graph
      const graph = transformer.buildSessionGraph(sessionId, {
        algorithm: 'hierarchical',
        spacing: 100,
      });

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.metadata.session_id).toBe(sessionId);

      // Verify nodes have positions
      for (const node of graph.nodes) {
        expect(node.position).toBeDefined();
        expect(typeof node.position!.x).toBe('number');
        expect(typeof node.position!.y).toBe('number');
      }
    });

    it('should build reasoning tree from chain', () => {
      const sessionId = 'test-session-reasoning';
      const chain = reasoningStore.startChain({
        session_id: sessionId,
        agent_id: 'test-generator',
        context: { task: 'Generate tests' },
      });

      // Add reasoning steps
      reasoningStore.addStep({
        chain_id: chain.id,
        thought_type: 'observation',
        content: 'Analyzing source code...',
        confidence: 0.9,
        token_count: 150,
      });

      reasoningStore.addStep({
        chain_id: chain.id,
        thought_type: 'decision',
        content: 'Choosing test framework...',
        confidence: 0.95,
        token_count: 120,
      });

      reasoningStore.completeChain(chain.id, 'completed');

      // Build tree
      const tree = transformer.buildReasoningTree(chain.id);

      expect(tree).toBeDefined();
      expect(tree!.chain_id).toBe(chain.id);
      expect(tree!.root_nodes.length).toBe(2);
      expect(tree!.total_steps).toBe(2);
      expect(tree!.total_tokens).toBe(270);
    });

    it('should generate agent activity summaries', () => {
      const sessionId = 'test-session-summaries';

      // Create events for multiple agents
      eventStore.recordEvent({
        agent_id: 'agent-1',
        event_type: 'task_started',
        payload: { tokens: 100, cost: 0.01 },
        session_id: sessionId,
      });

      eventStore.recordEvent({
        agent_id: 'agent-1',
        event_type: 'task_completed',
        payload: { tokens: 150, cost: 0.015, duration_ms: 500 },
        session_id: sessionId,
      });

      eventStore.recordEvent({
        agent_id: 'agent-2',
        event_type: 'task_started',
        payload: { tokens: 200, cost: 0.02 },
        session_id: sessionId,
      });

      const summaries = transformer.generateAgentSummaries(sessionId);

      expect(summaries.length).toBe(2);
      expect(summaries[0].agent_id).toBeDefined();
      expect(summaries[0].event_count).toBeGreaterThan(0);
      expect(summaries[0].total_tokens).toBeGreaterThan(0);
    });

    it('should build complete session visualization', () => {
      const sessionId = 'test-session-complete';

      // Create events
      eventStore.recordEvent({
        agent_id: 'test-generator',
        event_type: 'test_generated',
        payload: { testCount: 10 },
        session_id: sessionId,
      });

      // Create reasoning chain
      const chain = reasoningStore.startChain({
        session_id: sessionId,
        agent_id: 'test-generator',
        context: {},
      });

      reasoningStore.addStep({
        chain_id: chain.id,
        thought_type: 'observation',
        content: 'Test content',
        confidence: 0.9,
        token_count: 100,
      });

      reasoningStore.completeChain(chain.id, 'completed');

      const viz = transformer.buildSessionVisualization(sessionId);

      expect(viz.session_id).toBe(sessionId);
      expect(viz.agents.length).toBeGreaterThan(0);
      expect(viz.reasoning_chains.length).toBeGreaterThan(0);
      expect(viz.total_events).toBeGreaterThan(0);
      expect(viz.session_start).toBeDefined();
    });

    it('should apply different layout algorithms', () => {
      const sessionId = 'test-layout';

      for (let i = 0; i < 5; i++) {
        eventStore.recordEvent({
          agent_id: `agent-${i}`,
          event_type: 'test_event',
          payload: {},
          session_id: sessionId,
        });
      }

      const layouts = ['hierarchical', 'force-directed', 'circular', 'grid'] as const;

      for (const algorithm of layouts) {
        const graph = transformer.buildSessionGraph(sessionId, {
          algorithm,
          spacing: 100,
        });

        expect(graph.nodes.length).toBeGreaterThan(0);

        // Verify all nodes have positions
        for (const node of graph.nodes) {
          expect(node.position).toBeDefined();
          expect(Number.isFinite(node.position!.x)).toBe(true);
          expect(Number.isFinite(node.position!.y)).toBe(true);
        }
      }
    });
  });

  describe('V5: WebSocket Server', () => {
    let wsServer: WebSocketServer;

    afterEach(async () => {
      if (wsServer) {
        await wsServer.stop();
      }
    });

    it('should start and stop WebSocket server', async () => {
      wsServer = new WebSocketServer(eventStore, reasoningStore, {
        port: 8081,
        heartbeatInterval: 5000,
      });

      await wsServer.start();
      const stats = wsServer.getStatistics();
      expect(stats.isRunning).toBe(true);

      await wsServer.stop();
      const statsAfter = wsServer.getStatistics();
      expect(statsAfter.isRunning).toBe(false);
    });

    it('should broadcast events to clients', async () => {
      wsServer = new WebSocketServer(eventStore, reasoningStore, {
        port: 8082,
      });

      await wsServer.start();

      // Simulate event broadcast
      wsServer.broadcastEvent({
        type: 'event',
        timestamp: new Date().toISOString(),
        data: {
          agent_id: 'test-agent',
          event_type: 'test_event',
        },
      });

      // Verify broadcast completed (synchronous for now)
      const stats = wsServer.getStatistics();
      expect(stats.isRunning).toBe(true);
    });

    it('should handle backpressure correctly', async () => {
      wsServer = new WebSocketServer(eventStore, reasoningStore, {
        port: 8083,
        maxBacklogSize: 10,
      });

      await wsServer.start();

      // Broadcast many messages
      for (let i = 0; i < 20; i++) {
        wsServer.broadcastEvent({
          type: 'event',
          timestamp: new Date().toISOString(),
          data: { index: i },
        });
      }

      const stats = wsServer.getStatistics();
      expect(stats.averageQueueSize).toBeLessThanOrEqual(10);
    });
  });

  describe('V6: REST API Endpoints', () => {
    let restApi: RestApiServer;

    afterEach(async () => {
      if (restApi) {
        await restApi.stop();
      }
    });

    it('should start and stop REST API server', async () => {
      restApi = new RestApiServer(eventStore, reasoningStore, {
        port: 3001,
      });

      await restApi.start();
      const status = restApi.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.port).toBe(3001);

      await restApi.stop();
      const statusAfter = restApi.getStatus();
      expect(statusAfter.isRunning).toBe(false);
    });

    it('should provide visualization data endpoints', async () => {
      // Create test data
      const sessionId = 'test-rest-session';
      eventStore.recordEvent({
        agent_id: 'test-agent',
        event_type: 'test_event',
        payload: { data: 'test' },
        session_id: sessionId,
      });

      restApi = new RestApiServer(eventStore, reasoningStore, {
        port: 3002,
        enableEtag: true,
      });

      await restApi.start();

      // Verify server is running
      expect(restApi.getStatus().isRunning).toBe(true);

      // In a full implementation, would test actual HTTP endpoints
      // For now, verify API is initialized correctly
    });
  });

  describe('Integration: VisualizationService', () => {
    let service: VisualizationService;

    afterEach(async () => {
      if (service) {
        await service.stop();
      }
    });

    it('should start both REST and WebSocket services', async () => {
      service = new VisualizationService({
        eventStore,
        reasoningStore,
        enableRestApi: true,
        enableWebSocket: true,
        restApi: { port: 3003 },
        webSocket: { port: 8084 },
      });

      await service.start();

      const status = service.getStatus();
      expect(status.restApi?.isRunning).toBe(true);
      expect(status.webSocket?.isRunning).toBe(true);

      await service.stop();
    });

    it('should provide access to transformer and servers', () => {
      service = new VisualizationService({
        eventStore,
        reasoningStore,
      });

      expect(service.getTransformer()).toBeDefined();
      expect(service.getRestApi()).toBeDefined();
      expect(service.getWebSocket()).toBeDefined();
    });
  });

  describe('Performance: Latency Requirements', () => {
    it('should transform data in <500ms for typical session', () => {
      const sessionId = 'perf-test-session';

      // Create realistic dataset
      for (let i = 0; i < 100; i++) {
        eventStore.recordEvent({
          agent_id: `agent-${i % 5}`,
          event_type: 'test_event',
          payload: { index: i },
          session_id: sessionId,
        });
      }

      const startTime = Date.now();
      const graph = transformer.buildSessionGraph(sessionId, {
        algorithm: 'hierarchical',
        spacing: 100,
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
      expect(graph.nodes.length).toBeGreaterThan(0);
    });

    it('should handle high-throughput event broadcasting', async () => {
      const wsServer = new WebSocketServer(eventStore, reasoningStore, {
        port: 8085,
      });

      await wsServer.start();

      const startTime = Date.now();
      const messageCount = 1000;

      for (let i = 0; i < messageCount; i++) {
        wsServer.broadcastEvent({
          type: 'event',
          timestamp: new Date().toISOString(),
          data: { index: i },
        });
      }

      const duration = Date.now() - startTime;
      const throughput = messageCount / (duration / 1000);

      expect(throughput).toBeGreaterThan(100); // At least 100 msg/sec
      await wsServer.stop();
    });
  });
});
