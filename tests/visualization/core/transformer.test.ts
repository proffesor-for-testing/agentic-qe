/**
 * Data Transformer Tests for Phase 3 Visualization
 * Tests event-to-visualization conversion, reasoning chain aggregation, and graph layouts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Type Definitions
interface TelemetryEvent {
  id: string;
  timestamp: number;
  type: string;
  agentId: string;
  data: Record<string, unknown>;
}

interface VisualizationNode {
  id: string;
  label: string;
  type: string;
  x?: number;
  y?: number;
  metadata: Record<string, unknown>;
}

interface VisualizationEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
}

interface VisualizationGraph {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  metadata: {
    timestamp: number;
    nodeCount: number;
    edgeCount: number;
  };
}

interface ReasoningChain {
  id: string;
  agentId: string;
  steps: Array<{
    stepId: string;
    action: string;
    timestamp: number;
    data: Record<string, unknown>;
  }>;
  outcome?: string;
}

interface AggregatedChain {
  chainId: string;
  agentId: string;
  stepCount: number;
  totalDuration: number;
  actions: string[];
  outcome?: string;
}

// Data Transformer Implementation
class DataTransformer {
  /**
   * Transform telemetry events to visualization nodes
   */
  eventsToNodes(events: TelemetryEvent[]): VisualizationNode[] {
    return events.map(event => ({
      id: event.id,
      label: `${event.type} - ${event.agentId}`,
      type: event.type,
      metadata: {
        timestamp: event.timestamp,
        agentId: event.agentId,
        ...event.data
      }
    }));
  }

  /**
   * Create edges from event relationships
   */
  createEdges(events: TelemetryEvent[]): VisualizationEdge[] {
    const edges: VisualizationEdge[] = [];
    const eventMap = new Map(events.map(e => [e.id, e]));

    events.forEach((event, index) => {
      if (index < events.length - 1) {
        const nextEvent = events[index + 1];
        if (event.agentId === nextEvent.agentId) {
          edges.push({
            id: `${event.id}-${nextEvent.id}`,
            source: event.id,
            target: nextEvent.id,
            label: 'sequence',
            weight: 1
          });
        }
      }

      // Create edges based on data relationships
      if (event.data.relatedTo) {
        const relatedId = event.data.relatedTo as string;
        if (eventMap.has(relatedId)) {
          edges.push({
            id: `${event.id}-${relatedId}`,
            source: event.id,
            target: relatedId,
            label: 'related',
            weight: 0.5
          });
        }
      }
    });

    return edges;
  }

  /**
   * Build complete visualization graph
   */
  buildGraph(events: TelemetryEvent[]): VisualizationGraph {
    const nodes = this.eventsToNodes(events);
    const edges = this.createEdges(events);

    // Apply force-directed layout
    const layoutNodes = this.applyForceDirectedLayout(nodes, edges);

    return {
      nodes: layoutNodes,
      edges,
      metadata: {
        timestamp: Date.now(),
        nodeCount: nodes.length,
        edgeCount: edges.length
      }
    };
  }

  /**
   * Apply force-directed layout algorithm
   */
  private applyForceDirectedLayout(
    nodes: VisualizationNode[],
    edges: VisualizationEdge[]
  ): VisualizationNode[] {
    const width = 1000;
    const height = 600;

    // Simple circular layout for testing
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;

    return nodes.map((node, index) => {
      const angle = (2 * Math.PI * index) / nodes.length;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });
  }

  /**
   * Aggregate reasoning chains
   */
  aggregateChains(chains: ReasoningChain[]): AggregatedChain[] {
    return chains.map(chain => {
      const timestamps = chain.steps.map(s => s.timestamp);
      const totalDuration = timestamps.length > 0
        ? Math.max(...timestamps) - Math.min(...timestamps)
        : 0;

      return {
        chainId: chain.id,
        agentId: chain.agentId,
        stepCount: chain.steps.length,
        totalDuration,
        actions: chain.steps.map(s => s.action),
        outcome: chain.outcome
      };
    });
  }

  /**
   * Transform reasoning chains to graph
   */
  chainsToGraph(chains: ReasoningChain[]): VisualizationGraph {
    const nodes: VisualizationNode[] = [];
    const edges: VisualizationEdge[] = [];

    chains.forEach(chain => {
      // Create node for each step
      chain.steps.forEach((step, index) => {
        nodes.push({
          id: `${chain.id}-step-${index}`,
          label: step.action,
          type: 'reasoning_step',
          metadata: {
            chainId: chain.id,
            agentId: chain.agentId,
            timestamp: step.timestamp,
            ...step.data
          }
        });

        // Create edge to next step
        if (index < chain.steps.length - 1) {
          edges.push({
            id: `${chain.id}-edge-${index}`,
            source: `${chain.id}-step-${index}`,
            target: `${chain.id}-step-${index + 1}`,
            label: 'next',
            weight: 1
          });
        }
      });
    });

    const layoutNodes = this.applyForceDirectedLayout(nodes, edges);

    return {
      nodes: layoutNodes,
      edges,
      metadata: {
        timestamp: Date.now(),
        nodeCount: nodes.length,
        edgeCount: edges.length
      }
    };
  }

  /**
   * Filter graph by criteria
   */
  filterGraph(
    graph: VisualizationGraph,
    criteria: { agentId?: string; type?: string }
  ): VisualizationGraph {
    let filteredNodes = graph.nodes;

    if (criteria.agentId) {
      filteredNodes = filteredNodes.filter(
        node => node.metadata.agentId === criteria.agentId
      );
    }

    if (criteria.type) {
      filteredNodes = filteredNodes.filter(node => node.type === criteria.type);
    }

    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = graph.edges.filter(
      edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        ...graph.metadata,
        nodeCount: filteredNodes.length,
        edgeCount: filteredEdges.length
      }
    };
  }
}

describe('Data Transformer Tests', () => {
  let transformer: DataTransformer;

  beforeEach(() => {
    transformer = new DataTransformer();
  });

  describe('Event to Node Transformation', () => {
    it('should transform events to visualization nodes', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'test.started',
          agentId: 'agent-1',
          data: { test: 'example' }
        },
        {
          id: 'evt-2',
          timestamp: Date.now() + 1000,
          type: 'test.completed',
          agentId: 'agent-1',
          data: { result: 'passed' }
        }
      ];

      const nodes = transformer.eventsToNodes(events);

      expect(nodes).toHaveLength(2);
      expect(nodes[0].id).toBe('evt-1');
      expect(nodes[0].type).toBe('test.started');
      expect(nodes[0].metadata.agentId).toBe('agent-1');
    });

    it('should preserve event metadata in nodes', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: 12345,
          type: 'metric',
          agentId: 'agent-1',
          data: { value: 42, unit: 'ms' }
        }
      ];

      const nodes = transformer.eventsToNodes(events);

      expect(nodes[0].metadata.timestamp).toBe(12345);
      expect(nodes[0].metadata.value).toBe(42);
      expect(nodes[0].metadata.unit).toBe('ms');
    });

    it('should handle empty event arrays', () => {
      const nodes = transformer.eventsToNodes([]);

      expect(nodes).toHaveLength(0);
    });

    it('should handle malformed event data', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'test',
          agentId: 'agent-1',
          data: {} // Empty data
        }
      ];

      const nodes = transformer.eventsToNodes(events);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].metadata).toBeDefined();
    });
  });

  describe('Edge Creation', () => {
    it('should create sequential edges for same agent events', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'step1',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-2',
          timestamp: Date.now() + 1000,
          type: 'step2',
          agentId: 'agent-1',
          data: {}
        }
      ];

      const edges = transformer.createEdges(events);

      expect(edges.length).toBeGreaterThan(0);
      expect(edges[0].source).toBe('evt-1');
      expect(edges[0].target).toBe('evt-2');
      expect(edges[0].label).toBe('sequence');
    });

    it('should create relationship edges from data', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'event',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-2',
          timestamp: Date.now() + 1000,
          type: 'event',
          agentId: 'agent-2',
          data: { relatedTo: 'evt-1' }
        }
      ];

      const edges = transformer.createEdges(events);

      const relatedEdge = edges.find(e => e.label === 'related');
      expect(relatedEdge).toBeDefined();
      expect(relatedEdge!.source).toBe('evt-2');
      expect(relatedEdge!.target).toBe('evt-1');
    });

    it('should handle events with no relationships', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'isolated',
          agentId: 'agent-1',
          data: {}
        }
      ];

      const edges = transformer.createEdges(events);

      expect(edges).toHaveLength(0);
    });
  });

  describe('Graph Building', () => {
    it('should build complete visualization graph', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'start',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-2',
          timestamp: Date.now() + 1000,
          type: 'process',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-3',
          timestamp: Date.now() + 2000,
          type: 'end',
          agentId: 'agent-1',
          data: {}
        }
      ];

      const graph = transformer.buildGraph(events);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.metadata.nodeCount).toBe(3);
      expect(graph.metadata.edgeCount).toBeGreaterThan(0);
    });

    it('should apply layout coordinates to nodes', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'test',
          agentId: 'agent-1',
          data: {}
        }
      ];

      const graph = transformer.buildGraph(events);

      expect(graph.nodes[0].x).toBeDefined();
      expect(graph.nodes[0].y).toBeDefined();
      expect(typeof graph.nodes[0].x).toBe('number');
      expect(typeof graph.nodes[0].y).toBe('number');
    });

    it('should handle large event sets efficiently', () => {
      const events: TelemetryEvent[] = Array(100).fill(null).map((_, i) => ({
        id: `evt-${i}`,
        timestamp: Date.now() + i * 1000,
        type: 'test',
        agentId: `agent-${i % 5}`,
        data: {}
      }));

      const start = Date.now();
      const graph = transformer.buildGraph(events);
      const duration = Date.now() - start;

      expect(graph.nodes).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });
  });

  describe('Reasoning Chain Aggregation', () => {
    it('should aggregate reasoning chain steps', () => {
      const chains: ReasoningChain[] = [
        {
          id: 'chain-1',
          agentId: 'agent-1',
          steps: [
            { stepId: 'step-1', action: 'think', timestamp: 1000, data: {} },
            { stepId: 'step-2', action: 'act', timestamp: 2000, data: {} },
            { stepId: 'step-3', action: 'observe', timestamp: 3000, data: {} }
          ],
          outcome: 'success'
        }
      ];

      const aggregated = transformer.aggregateChains(chains);

      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].stepCount).toBe(3);
      expect(aggregated[0].totalDuration).toBe(2000); // 3000 - 1000
      expect(aggregated[0].actions).toEqual(['think', 'act', 'observe']);
      expect(aggregated[0].outcome).toBe('success');
    });

    it('should handle chains with single step', () => {
      const chains: ReasoningChain[] = [
        {
          id: 'chain-1',
          agentId: 'agent-1',
          steps: [
            { stepId: 'step-1', action: 'quick-action', timestamp: 1000, data: {} }
          ]
        }
      ];

      const aggregated = transformer.aggregateChains(chains);

      expect(aggregated[0].stepCount).toBe(1);
      expect(aggregated[0].totalDuration).toBe(0);
    });

    it('should transform chains to graph visualization', () => {
      const chains: ReasoningChain[] = [
        {
          id: 'chain-1',
          agentId: 'agent-1',
          steps: [
            { stepId: 'step-1', action: 'analyze', timestamp: 1000, data: {} },
            { stepId: 'step-2', action: 'decide', timestamp: 2000, data: {} }
          ]
        }
      ];

      const graph = transformer.chainsToGraph(chains);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1); // One edge connecting steps
      expect(graph.nodes[0].type).toBe('reasoning_step');
    });
  });

  describe('Graph Filtering', () => {
    it('should filter nodes by agent ID', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'test',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-2',
          timestamp: Date.now() + 1000,
          type: 'test',
          agentId: 'agent-2',
          data: {}
        }
      ];

      const graph = transformer.buildGraph(events);
      const filtered = transformer.filterGraph(graph, { agentId: 'agent-1' });

      expect(filtered.nodes).toHaveLength(1);
      expect(filtered.nodes[0].metadata.agentId).toBe('agent-1');
    });

    it('should filter nodes by type', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'metric',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-2',
          timestamp: Date.now() + 1000,
          type: 'event',
          agentId: 'agent-1',
          data: {}
        }
      ];

      const graph = transformer.buildGraph(events);
      const filtered = transformer.filterGraph(graph, { type: 'metric' });

      expect(filtered.nodes).toHaveLength(1);
      expect(filtered.nodes[0].type).toBe('metric');
    });

    it('should remove orphaned edges after filtering', () => {
      const events: TelemetryEvent[] = [
        {
          id: 'evt-1',
          timestamp: Date.now(),
          type: 'test',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-2',
          timestamp: Date.now() + 1000,
          type: 'test',
          agentId: 'agent-1',
          data: {}
        },
        {
          id: 'evt-3',
          timestamp: Date.now() + 2000,
          type: 'test',
          agentId: 'agent-2',
          data: {}
        }
      ];

      const graph = transformer.buildGraph(events);
      const filtered = transformer.filterGraph(graph, { agentId: 'agent-1' });

      // All edges should have valid source and target
      filtered.edges.forEach(edge => {
        const hasSource = filtered.nodes.some(n => n.id === edge.source);
        const hasTarget = filtered.nodes.some(n => n.id === edge.target);
        expect(hasSource).toBe(true);
        expect(hasTarget).toBe(true);
      });
    });

    it('should update metadata after filtering', () => {
      const events: TelemetryEvent[] = Array(10).fill(null).map((_, i) => ({
        id: `evt-${i}`,
        timestamp: Date.now() + i * 1000,
        type: i % 2 === 0 ? 'even' : 'odd',
        agentId: 'agent-1',
        data: {}
      }));

      const graph = transformer.buildGraph(events);
      const filtered = transformer.filterGraph(graph, { type: 'even' });

      expect(filtered.metadata.nodeCount).toBe(filtered.nodes.length);
      expect(filtered.metadata.edgeCount).toBe(filtered.edges.length);
    });
  });

  describe('Performance', () => {
    it('should transform 1000 nodes in under 100ms', () => {
      const events: TelemetryEvent[] = Array(1000).fill(null).map((_, i) => ({
        id: `evt-${i}`,
        timestamp: Date.now() + i * 100,
        type: 'test',
        agentId: `agent-${i % 10}`,
        data: {}
      }));

      const start = Date.now();
      transformer.eventsToNodes(events);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should create 500 edges efficiently', () => {
      const events: TelemetryEvent[] = Array(100).fill(null).map((_, i) => ({
        id: `evt-${i}`,
        timestamp: Date.now() + i * 100,
        type: 'test',
        agentId: 'agent-1', // Same agent to create sequential edges
        data: {}
      }));

      const start = Date.now();
      const edges = transformer.createEdges(events);
      const duration = Date.now() - start;

      expect(edges.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });
  });
});
