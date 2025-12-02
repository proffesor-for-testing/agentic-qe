/**
 * @fileoverview Data transformer for converting telemetry data to visualization formats
 * @module visualization/core/DataTransformer
 */

import { EventStore, EventQueryOptions, TimeRange } from '../../persistence/event-store';
import { ReasoningStore, ChainQueryOptions } from '../../persistence/reasoning-store';
import { EventRecord, ReasoningChain, ReasoningChainWithSteps } from '../../persistence/schema';
import {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  ReasoningTree,
  ReasoningTreeNode,
  AgentActivitySummary,
  SessionVisualization,
  TimeSeriesMetric,
  LayoutOptions,
  VisualizationFilter,
} from '../types';

/**
 * Type guard for ReasoningChainWithSteps
 */
function hasSteps(chain: ReasoningChain | ReasoningChainWithSteps): chain is ReasoningChainWithSteps {
  return 'steps' in chain && Array.isArray((chain as ReasoningChainWithSteps).steps);
}

/**
 * DataTransformer converts raw telemetry data into visualization-friendly structures
 *
 * @example
 * ```typescript
 * const transformer = new DataTransformer(eventStore, reasoningStore);
 *
 * // Build visualization graph for a session
 * const graph = transformer.buildSessionGraph('session-123', {
 *   algorithm: 'hierarchical',
 *   spacing: 100
 * });
 *
 * // Transform reasoning chain to tree
 * const tree = transformer.buildReasoningTree('chain-456');
 * ```
 */
export class DataTransformer {
  constructor(
    private eventStore: EventStore,
    private reasoningStore: ReasoningStore
  ) {}

  /**
   * Build a visualization graph from events in a session
   * @param sessionId - Session identifier
   * @param layoutOptions - Graph layout configuration
   * @param filter - Optional filters
   * @returns Complete visualization graph with positioned nodes
   */
  buildSessionGraph(
    sessionId: string,
    layoutOptions: LayoutOptions,
    filter?: VisualizationFilter
  ): VisualizationGraph {
    // Get events - for "default" session, fetch all recent events
    let events: EventRecord[] = [];
    if (sessionId && sessionId !== 'default') {
      events = this.eventStore.getEventsBySession(sessionId);
    }
    // If no events found for specific session, get all recent events
    if (events.length === 0) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      events = this.eventStore.getEventsByTimeRange({ start: oneHourAgo, end: now }, { limit: 100 });
    }
    const chains = this.reasoningStore.getChainsBySession(sessionId, { includeSteps: false });

    // Filter events if criteria provided
    const filteredEvents: EventRecord[] = filter ? this.applyEventFilter(events, filter) : events;

    // Build nodes from events and chains
    const nodes: VisualizationNode[] = [];
    const edges: VisualizationEdge[] = [];
    const nodeMap = new Map<string, VisualizationNode>();

    // Create nodes for each agent
    const agentNodes = new Map<string, VisualizationNode>();
    for (const event of filteredEvents) {
      if (!agentNodes.has(event.agent_id)) {
        // Infer agent type from agent_id for proper coloring
        const agentType = this.inferAgentType(event.agent_id, event.event_type);
        // Infer status from event type
        const status = this.inferAgentStatus(event.event_type);

        const agentNode: VisualizationNode = {
          id: event.agent_id, // Use clean ID without prefix for frontend compatibility
          type: agentType as any, // Use inferred agent type (coordinator, researcher, coder, etc.)
          label: event.agent_id,
          timestamp: event.timestamp,
          status: status as any,
          metadata: {
            agent_id: event.agent_id,
            first_event: event.timestamp,
          },
        };
        agentNodes.set(event.agent_id, agentNode);
        nodes.push(agentNode);
        nodeMap.set(agentNode.id, agentNode);
      }
    }

    // Create nodes for events
    for (const event of filteredEvents) {
      const eventNode: VisualizationNode = {
        id: `event-${event.id}`,
        type: 'event',
        label: event.event_type,
        timestamp: event.timestamp,
        metadata: {
          event_type: event.event_type,
          payload: event.payload,
          agent_id: event.agent_id,
        },
      };
      nodes.push(eventNode);
      nodeMap.set(eventNode.id, eventNode);

      // Create edge from agent to event
      edges.push({
        id: `edge-agent-${event.agent_id}-event-${event.id}`,
        source: event.agent_id, // Match the agent node ID (no prefix)
        target: `event-${event.id}`,
        type: 'trigger',
      });

      // Create correlation edges if present
      if (event.correlation_id) {
        const correlatedEvents = filteredEvents.filter(
          e => e.correlation_id === event.correlation_id && e.id !== event.id
        );
        for (const correlated of correlatedEvents) {
          edges.push({
            id: `edge-corr-${event.id}-${correlated.id}`,
            source: `event-${event.id}`,
            target: `event-${correlated.id}`,
            type: 'correlation',
            label: event.correlation_id,
          });
        }
      }
    }

    // Create nodes for reasoning chains
    for (const chain of chains) {
      const chainNode: VisualizationNode = {
        id: `chain-${chain.id}`,
        type: 'reasoning_chain',
        label: `Reasoning: ${chain.agent_id}`,
        timestamp: chain.created_at,
        status: chain.status === 'completed' ? 'completed' : chain.status === 'failed' ? 'failed' : 'active',
        metadata: {
          chain_id: chain.id,
          agent_id: chain.agent_id,
          step_count: this.reasoningStore.getStepCount(chain.id),
          total_tokens: this.reasoningStore.getTotalTokens(chain.id),
        },
      };
      nodes.push(chainNode);
      nodeMap.set(chainNode.id, chainNode);

      // Link chain to agent
      edges.push({
        id: `edge-agent-${chain.agent_id}-chain-${chain.id}`,
        source: `agent-${chain.agent_id}`,
        target: `chain-${chain.id}`,
        type: 'parent-child',
      });
    }

    // Apply layout algorithm to calculate positions
    this.applyLayout(nodes, edges, layoutOptions);

    return {
      nodes,
      edges,
      metadata: {
        session_id: sessionId,
        generated_at: new Date().toISOString(),
        total_nodes: nodes.length,
        total_edges: edges.length,
      },
    };
  }

  /**
   * Build a reasoning tree from a reasoning chain
   * @param chainId - Chain identifier
   * @returns Hierarchical tree structure
   */
  buildReasoningTree(chainId: string): ReasoningTree | null {
    const chainWithSteps = this.reasoningStore.getChainWithSteps(chainId);
    if (!chainWithSteps) return null;

    // Build tree structure from steps (simplified - assumes linear for now)
    const rootNodes: ReasoningTreeNode[] = chainWithSteps.steps.map(step => ({
      id: step.id,
      step_order: step.step_order,
      thought_type: step.thought_type,
      content: step.content,
      confidence: step.confidence,
      token_count: step.token_count,
      timestamp: step.created_at,
      children: [], // Could be enhanced to build actual tree based on metadata
      metadata: step.metadata,
    }));

    return {
      chain_id: chainWithSteps.id,
      agent_id: chainWithSteps.agent_id,
      session_id: chainWithSteps.session_id,
      root_nodes: rootNodes,
      total_steps: chainWithSteps.steps.length,
      total_tokens: this.reasoningStore.getTotalTokens(chainId),
      avg_confidence: this.reasoningStore.getAverageConfidence(chainId),
      created_at: chainWithSteps.created_at,
      completed_at: chainWithSteps.completed_at,
      status: chainWithSteps.status,
    };
  }

  /**
   * Generate agent activity summaries for a session
   * @param sessionId - Session identifier
   * @returns Array of agent summaries
   */
  generateAgentSummaries(sessionId: string): AgentActivitySummary[] {
    const events: EventRecord[] = this.eventStore.getEventsBySession(sessionId);
    const agentMap = new Map<string, AgentActivitySummary>();

    for (const event of events) {
      if (!agentMap.has(event.agent_id)) {
        agentMap.set(event.agent_id, {
          agent_id: event.agent_id,
          agent_type: event.event_type.split(':')[0] || 'unknown',
          event_count: 0,
          task_count: 0,
          success_rate: 0,
          avg_duration_ms: 0,
          total_tokens: 0,
          cost_usd: 0,
          first_seen: event.timestamp,
          last_seen: event.timestamp,
        });
      }

      const summary = agentMap.get(event.agent_id)!;
      summary.event_count++;
      summary.last_seen = event.timestamp;

      // Extract metrics from payload
      if (event.payload && typeof event.payload === 'object') {
        const payload = event.payload as Record<string, unknown>;
        if (typeof payload.tokens === 'number') {
          summary.total_tokens += payload.tokens;
        }
        if (typeof payload.cost === 'number') {
          summary.cost_usd += payload.cost;
        }
        if (typeof payload.duration_ms === 'number') {
          summary.avg_duration_ms =
            (summary.avg_duration_ms * (summary.event_count - 1) + payload.duration_ms) /
            summary.event_count;
        }
      }
    }

    return Array.from(agentMap.values());
  }

  /**
   * Build complete session visualization
   * @param sessionId - Session identifier
   * @returns Complete session visualization data
   */
  buildSessionVisualization(sessionId: string): SessionVisualization {
    const events: EventRecord[] = this.eventStore.getEventsBySession(sessionId);
    const chains = this.reasoningStore.getChainsBySession(sessionId, { includeSteps: true });

    // Build agent summaries
    const agents = this.generateAgentSummaries(sessionId);

    // Build events timeline (aggregated by minute)
    const timeline = this.buildEventsTimeline(events);

    // Build reasoning trees
    const reasoningTrees: ReasoningTree[] = [];
    for (const chain of chains) {
      const tree = this.buildReasoningTree(chain.id);
      if (tree) {
        reasoningTrees.push(tree);
      }
    }

    // Calculate session duration
    const sessionStart = events.length > 0 ? events[0].timestamp : new Date().toISOString();
    const sessionEnd = events.length > 0 ? events[events.length - 1].timestamp : null;
    const sessionDuration = sessionEnd
      ? new Date(sessionEnd).getTime() - new Date(sessionStart).getTime()
      : 0;

    // Calculate total reasoning steps using type guard
    const totalReasoningSteps = chains.reduce((sum, chain) => {
      if (hasSteps(chain)) {
        return sum + chain.steps.length;
      }
      return sum;
    }, 0);

    return {
      session_id: sessionId,
      agents,
      events_timeline: timeline,
      reasoning_chains: reasoningTrees,
      total_events: events.length,
      total_reasoning_steps: totalReasoningSteps,
      session_duration_ms: sessionDuration,
      session_start: sessionStart,
      session_end: sessionEnd,
    };
  }

  /**
   * Build time-series metrics from events
   * @param events - Array of events
   * @returns Aggregated time-series data
   */
  private buildEventsTimeline(events: EventRecord[]): TimeSeriesMetric[] {
    const timelineMap = new Map<string, number>();

    for (const event of events) {
      // Aggregate by minute
      const minute = event.timestamp.substring(0, 16); // YYYY-MM-DDTHH:mm
      timelineMap.set(minute, (timelineMap.get(minute) || 0) + 1);
    }

    return Array.from(timelineMap.entries())
      .map(([timestamp, count]) => ({
        timestamp: `${timestamp}:00.000Z`,
        value: count,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Apply layout algorithm to position nodes
   * @param nodes - Graph nodes
   * @param edges - Graph edges
   * @param options - Layout options
   */
  private applyLayout(
    nodes: VisualizationNode[],
    edges: VisualizationEdge[],
    options: LayoutOptions
  ): void {
    switch (options.algorithm) {
      case 'hierarchical':
        this.applyHierarchicalLayout(nodes, edges, options);
        break;
      case 'force-directed':
        this.applyForceDirectedLayout(nodes, edges, options);
        break;
      case 'circular':
        this.applyCircularLayout(nodes, options);
        break;
      case 'grid':
        this.applyGridLayout(nodes, options);
        break;
    }
  }

  /**
   * Apply hierarchical layout (top-down or left-right)
   */
  private applyHierarchicalLayout(
    nodes: VisualizationNode[],
    edges: VisualizationEdge[],
    options: LayoutOptions
  ): void {
    const direction = options.direction || 'TB';
    const spacing = options.spacing;

    // Build adjacency list
    const adjList = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjList.has(edge.source)) {
        adjList.set(edge.source, []);
      }
      adjList.get(edge.source)!.push(edge.target);
    }

    // Find root nodes (no incoming edges)
    const hasIncoming = new Set(edges.map(e => e.target));
    const roots = nodes.filter(n => !hasIncoming.has(n.id));

    // Assign levels via BFS
    const levels = new Map<string, number>();
    const queue = roots.map(r => ({ id: r.id, level: 0 }));
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      levels.set(id, level);
      const children = adjList.get(id) || [];
      for (const child of children) {
        if (!levels.has(child)) {
          queue.push({ id: child, level: level + 1 });
        }
      }
    }

    // Position nodes
    const levelGroups = new Map<number, string[]>();
    for (const [nodeId, level] of levels.entries()) {
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(nodeId);
    }

    for (const [level, nodeIds] of levelGroups.entries()) {
      nodeIds.forEach((nodeId, index) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          if (direction === 'TB' || direction === 'BT') {
            node.position = {
              x: index * spacing,
              y: direction === 'TB' ? level * spacing : -level * spacing,
            };
          } else {
            node.position = {
              x: direction === 'LR' ? level * spacing : -level * spacing,
              y: index * spacing,
            };
          }
        }
      });
    }
  }

  /**
   * Apply force-directed layout (simplified spring model)
   */
  private applyForceDirectedLayout(
    nodes: VisualizationNode[],
    edges: VisualizationEdge[],
    options: LayoutOptions
  ): void {
    const spacing = options.spacing;
    const iterations = 50;
    const repulsionStrength = spacing * 2;
    const attractionStrength = 0.1;

    // Initialize random positions
    nodes.forEach((node, index) => {
      node.position = {
        x: Math.random() * spacing * nodes.length,
        y: Math.random() * spacing * nodes.length,
      };
    });

    // Simulate forces
    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map<string, { x: number; y: number }>();
      nodes.forEach(n => forces.set(n.id, { x: 0, y: 0 }));

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i];
          const nodeB = nodes[j];
          const dx = nodeB.position!.x - nodeA.position!.x;
          const dy = nodeB.position!.y - nodeA.position!.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsionStrength / (dist * dist);
          const fx = (force * dx) / dist;
          const fy = (force * dy) / dist;

          forces.get(nodeA.id)!.x -= fx;
          forces.get(nodeA.id)!.y -= fy;
          forces.get(nodeB.id)!.x += fx;
          forces.get(nodeB.id)!.y += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (source && target && source.position && target.position) {
          const dx = target.position.x - source.position.x;
          const dy = target.position.y - source.position.y;
          const force = attractionStrength;
          const fx = force * dx;
          const fy = force * dy;

          forces.get(source.id)!.x += fx;
          forces.get(source.id)!.y += fy;
          forces.get(target.id)!.x -= fx;
          forces.get(target.id)!.y -= fy;
        }
      }

      // Apply forces
      nodes.forEach(node => {
        const force = forces.get(node.id)!;
        node.position!.x += force.x;
        node.position!.y += force.y;
      });
    }
  }

  /**
   * Apply circular layout
   */
  private applyCircularLayout(nodes: VisualizationNode[], options: LayoutOptions): void {
    const radius = (nodes.length * options.spacing) / (2 * Math.PI);
    const angleStep = (2 * Math.PI) / nodes.length;

    nodes.forEach((node, index) => {
      const angle = index * angleStep;
      node.position = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      };
    });
  }

  /**
   * Apply grid layout
   */
  private applyGridLayout(nodes: VisualizationNode[], options: LayoutOptions): void {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const spacing = options.spacing;

    nodes.forEach((node, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      node.position = {
        x: col * spacing,
        y: row * spacing,
      };
    });
  }

  /**
   * Infer agent type from agent ID for proper visualization coloring
   * Returns: coordinator, researcher, coder, tester, reviewer, analyzer
   */
  private inferAgentType(agentId: string, eventType: string): string {
    const id = agentId.toLowerCase();
    if (id.includes('coord') || id.includes('fleet')) return 'coordinator';
    if (id.includes('test') || id.includes('gen')) return 'researcher';
    if (id.includes('code') || id.includes('impl') || id.includes('coder')) return 'coder';
    if (id.includes('review')) return 'reviewer';
    if (id.includes('analy') || id.includes('cover')) return 'analyzer';
    if (id.includes('tester') || id.includes('qa')) return 'tester';
    // Default based on event type prefix
    if (eventType.startsWith('test')) return 'tester';
    if (eventType.startsWith('review')) return 'reviewer';
    return 'coder';
  }

  /**
   * Infer agent status from event type
   * Returns: idle, running, completed, error
   */
  private inferAgentStatus(eventType: string): string {
    const type = eventType.toLowerCase();
    if (type.includes('spawned') || type.includes('idle')) return 'idle';
    if (type.includes('started') || type.includes('running') || type.includes('progress')) return 'running';
    if (type.includes('completed') || type.includes('done') || type.includes('finished')) return 'completed';
    if (type.includes('error') || type.includes('failed')) return 'error';
    return 'idle';
  }

  /**
   * Apply filter to events
   */
  private applyEventFilter(events: EventRecord[], filter: VisualizationFilter): EventRecord[] {
    return events.filter((event: EventRecord) => {
      if (filter.time_range) {
        if (event.timestamp < filter.time_range.start || event.timestamp > filter.time_range.end) {
          return false;
        }
      }
      if (filter.agent_ids && !filter.agent_ids.includes(event.agent_id)) {
        return false;
      }
      if (filter.event_types && !filter.event_types.includes(event.event_type)) {
        return false;
      }
      return true;
    });
  }
}
