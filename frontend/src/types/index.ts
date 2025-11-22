export interface AgentNode {
  id: string;
  label: string;
  type: 'coordinator' | 'researcher' | 'coder' | 'tester' | 'reviewer' | 'analyzer';
  status: 'idle' | 'running' | 'completed' | 'error';
  parent?: string;
  metadata: {
    startTime?: number;
    endTime?: number;
    duration?: number;
    taskCount?: number;
    errorCount?: number;
  };
  position?: { x: number; y: number };
}

export interface AgentEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: 'coordination' | 'data-flow' | 'dependency';
}

export interface GraphData {
  nodes: AgentNode[];
  edges: AgentEdge[];
}

// Extended types for reasoning chain visualization
export type NodeType = 'agent' | 'task' | 'event';
export type EdgeType = 'communication' | 'dependency' | 'sequence';

export interface ExtendedNode extends Omit<AgentNode, 'type'> {
  nodeType: NodeType;
  agentType?: AgentNode['type'];
  shape?: 'ellipse' | 'rectangle' | 'diamond' | 'hexagon';
  data?: Record<string, unknown>;
}

export interface ExtendedEdge extends Omit<AgentEdge, 'type'> {
  edgeType: EdgeType;
  weight?: number;
  animated?: boolean;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface ExtendedGraphData {
  nodes: ExtendedNode[];
  edges: ExtendedEdge[];
}

export interface QualityMetrics {
  timestamp: number;
  coverage: number;
  performance: number;
  security: number;
  maintainability: number;
  reliability: number;
  efficiency: number;
}

export interface LifecycleEvent {
  id: string;
  agentId: string;
  agentName: string;
  type: 'spawn' | 'execute' | 'complete' | 'error' | 'retry';
  timestamp: number;
  duration?: number;
  details: Record<string, unknown>;
  status?: 'success' | 'failure' | 'pending';
}

export interface DetailedEventData {
  event: LifecycleEvent;
  reasoning?: string;
  traceId?: string;
  spanId?: string;
  logs?: string[];
  metadata?: Record<string, unknown>;
}

export interface FilterState {
  agentTypes: string[];
  statuses: string[];
  timeRange: { start: number; end: number } | null;
  searchQuery: string;
}

export type LayoutAlgorithm =
  | 'hierarchical'
  | 'circular'
  | 'force'
  | 'cose-bilkent'
  | 'breadthfirst'
  | 'concentric';

export interface MindMapControls {
  algorithm: LayoutAlgorithm;
  showLabels: boolean;
  showEdgeLabels: boolean;
  animateLayout: boolean;
  nodeSize: number;
}

// Event Timeline Types
export interface TimelineEvent {
  id: string;
  timestamp: string;
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  session_id: string;
  correlation_id?: string;
}

export interface EventFilterCriteria {
  agent_id?: string;
  event_type?: string;
  session_id?: string;
  start_date?: string;
  end_date?: string;
  search_query?: string;
}

export interface EventsResponse {
  success: boolean;
  data: TimelineEvent[];
  metadata: {
    timestamp: string;
    request_id: string;
    pagination: {
      limit: number;
      offset: number;
      total: number;
      has_more: boolean;
    };
  };
}

export interface EventGroup {
  date: string;
  events: TimelineEvent[];
}
