/**
 * API Type Definitions
 * Matches backend REST API and WebSocket message types from Phase 3
 */

// ============================================================================
// Event Types (from EventStore)
// ============================================================================

export interface EventRecord {
  id: string;
  timestamp: string; // ISO 8601
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  session_id: string;
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Reasoning Types (from ReasoningStore)
// ============================================================================

export interface ReasoningStep {
  id: string;
  step_order: number;
  thought_type: 'observation' | 'analysis' | 'plan' | 'action' | 'reflection';
  content: string;
  confidence: number;
  token_count: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ReasoningChain {
  chain_id: string;
  agent_id: string;
  session_id: string;
  task_description?: string;
  status: 'active' | 'completed' | 'failed';
  total_steps: number;
  total_tokens: number;
  avg_confidence: number;
  created_at: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ReasoningTreeNode extends ReasoningStep {
  children: ReasoningTreeNode[];
}

export interface ReasoningTree {
  chain_id: string;
  agent_id: string;
  session_id: string;
  root_nodes: ReasoningTreeNode[];
  total_steps: number;
  total_tokens: number;
  avg_confidence: number;
  created_at: string;
  completed_at?: string;
  status: string;
}

// ============================================================================
// Visualization Types (from DataTransformer)
// ============================================================================

export interface VisualizationNode {
  id: string;
  label: string;
  type: 'event' | 'reasoning' | 'agent' | 'session';
  data: Record<string, unknown>;
  position?: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface VisualizationEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: 'sequence' | 'causality' | 'correlation';
  weight?: number;
  metadata?: Record<string, unknown>;
}

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

export interface SessionVisualization {
  session_id: string;
  agents: AgentActivitySummary[];
  events_timeline: Array<{
    timestamp: string;
    value: number;
  }>;
  reasoning_chains: ReasoningChain[];
  total_events: number;
  session_duration_ms: number;
  session_start: string;
  session_end?: string;
}

// ============================================================================
// REST API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata: {
    timestamp: string;
    request_id: string;
    pagination?: {
      limit: number;
      offset: number;
      total: number;
      has_more: boolean;
      cursor?: string;
    };
  };
}

export interface MetricsData {
  time_range: {
    start: string;
    end: string;
    duration_ms: number;
  };
  events: {
    total: number;
    by_type: Record<string, number>;
    by_agent: Record<string, number>;
  };
  reasoning: {
    total_chains: number;
    total_steps: number;
    completed_chains: number;
    failed_chains: number;
    avg_steps_per_chain: number;
    avg_confidence: number;
  };
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WebSocketMessageType = 'event' | 'reasoning' | 'metrics' | 'heartbeat';

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  timestamp: string;
  data: T;
}

export interface EventMessage extends WebSocketMessage<EventRecord> {
  type: 'event';
}

export interface ReasoningMessage extends WebSocketMessage<ReasoningChain> {
  type: 'reasoning';
}

export interface MetricsMessage extends WebSocketMessage<{
  connected_clients: number;
  events_per_second: number;
}> {
  type: 'metrics';
}

export interface HeartbeatMessage extends WebSocketMessage<{
  status: 'ok';
  uptime_ms: number;
}> {
  type: 'heartbeat';
}

// ============================================================================
// Client Subscription Types
// ============================================================================

export interface SubscriptionOptions {
  session_id?: string;
  agent_id?: string;
  event_types?: string[];
  since?: string; // ISO timestamp
}

export interface SubscribeMessage {
  type: 'subscribe';
  options: SubscriptionOptions;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

// ============================================================================
// Quality Metrics Types (for visualization)
// ============================================================================

export interface QualityMetrics {
  timestamp: string;
  coverage: number;
  performance: number;
  security: number;
  maintainability: number;
  reliability: number;
  efficiency: number;
}

// ============================================================================
// Query Parameters
// ============================================================================

export interface EventQueryParams {
  since?: string;
  limit?: number;
  offset?: number;
}

export interface GraphQueryParams {
  algorithm?: 'hierarchical' | 'force-directed' | 'circular' | 'grid';
  spacing?: number;
}

export interface MetricsQueryParams {
  timeRange?: '1h' | '24h' | '7d';
}

export interface AgentHistoryParams {
  limit?: number;
  offset?: number;
}

// ============================================================================
// Additional Query Types for Hooks
// ============================================================================

export interface EventQueryOptions {
  limit?: number;
  offset?: number;
  agent_id?: string;
  event_type?: string;
  session_id?: string;
  start_time?: string;
  end_time?: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
}

export interface TimeRange {
  start: string;
  end: string;
}

export type EventsResponse = ApiResponse<EventRecord[]>;
export type Metrics = MetricsData;
export type AgentHistory = ApiResponse<EventRecord[]>;
export type Session = SessionVisualization;
export type Graph = VisualizationGraph;

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}
