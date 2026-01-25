/**
 * @fileoverview Visualization data types and interfaces
 * @module visualization/types
 */

/**
 * Visual node representing an agent or event in the visualization graph
 */
export interface VisualizationNode {
  id: string;
  type: 'agent' | 'task' | 'event' | 'reasoning_chain';
  label: string;
  position?: { x: number; y: number };
  metadata: Record<string, unknown>;
  timestamp: string;
  status?: 'active' | 'completed' | 'failed' | 'pending';
}

/**
 * Visual edge representing a relationship between nodes
 */
export interface VisualizationEdge {
  id: string;
  source: string;
  target: string;
  type: 'correlation' | 'parent-child' | 'sequence' | 'trigger';
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete visualization graph
 */
export interface VisualizationGraph {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  metadata: {
    session_id: string;
    generated_at: string;
    total_nodes: number;
    total_edges: number;
  };
}

/**
 * Reasoning tree node for hierarchical visualization
 */
export interface ReasoningTreeNode {
  id: string;
  step_order: number;
  thought_type: string;
  content: string;
  confidence: number;
  token_count: number;
  timestamp: string;
  children: ReasoningTreeNode[];
  metadata?: Record<string, unknown>;
}

/**
 * Complete reasoning tree visualization
 */
export interface ReasoningTree {
  chain_id: string;
  agent_id: string;
  session_id: string;
  root_nodes: ReasoningTreeNode[];
  total_steps: number;
  total_tokens: number;
  avg_confidence: number;
  created_at: string;
  completed_at: string | null;
  status: string;
}

/**
 * Aggregated metrics for time-series visualization
 */
export interface TimeSeriesMetric {
  timestamp: string;
  value: number;
  metadata?: Record<string, unknown>;
}

/**
 * Agent activity summary
 */
export interface AgentActivitySummary {
  agent_id: string;
  agent_type: string;
  event_count: number;
  task_count: number;
  success_rate: number;
  avg_duration_ms: number;
  total_tokens: number;
  cost_usd: number;
  first_seen: string;
  last_seen: string;
}

/**
 * Session visualization data
 */
export interface SessionVisualization {
  session_id: string;
  agents: AgentActivitySummary[];
  events_timeline: TimeSeriesMetric[];
  reasoning_chains: ReasoningTree[];
  total_events: number;
  total_reasoning_steps: number;
  session_duration_ms: number;
  session_start: string;
  session_end: string | null;
}

/**
 * Real-time event message for WebSocket streaming
 */
export interface RealtimeEventMessage {
  type: 'event' | 'reasoning' | 'metrics' | 'heartbeat';
  timestamp: string;
  data: unknown;
}

/**
 * WebSocket subscription options
 */
export interface SubscriptionOptions {
  session_id?: string;
  agent_id?: string;
  event_types?: string[];
  since?: string;
}

/**
 * Graph layout algorithm options
 */
export interface LayoutOptions {
  algorithm: 'force-directed' | 'hierarchical' | 'circular' | 'grid';
  spacing: number;
  direction?: 'TB' | 'LR' | 'BT' | 'RL'; // Top-Bottom, Left-Right, etc.
}

/**
 * Visualization filter criteria
 */
export interface VisualizationFilter {
  time_range?: {
    start: string;
    end: string;
  };
  agent_ids?: string[];
  event_types?: string[];
  status?: string[];
  min_confidence?: number;
}
