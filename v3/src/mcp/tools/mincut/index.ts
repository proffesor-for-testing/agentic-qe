/**
 * Agentic QE v3 - MinCut MCP Tools
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * MCP tools exposing MinCut functionality to QE agents.
 * These tools provide real integration with the MinCut modules.
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
} from '../base';
import { ToolResult } from '../../types';
import { DomainName } from '../../../shared/types';

// Import actual MinCut implementations
import {
  SwarmGraph,
  MinCutCalculator,
  createMinCutCalculator,
  MinCutHealthMonitor,
  // Use shared singleton for MCP tools + Queen integration
  getSharedMinCutGraph,
  getSharedMinCutMonitor,
  resetSharedMinCutState,
} from '../../../coordination/mincut';

// ============================================================================
// Tool Names
// ============================================================================

export const MINCUT_TOOL_NAMES = {
  HEALTH: 'qe/mincut/health',
  ANALYZE: 'qe/mincut/analyze',
  STRENGTHEN: 'qe/mincut/strengthen',
} as const;

// ============================================================================
// Shared State (Uses central singleton from MinCut module)
// ============================================================================

// Delegate to the central MinCut singleton for proper MCP↔Queen integration
function getSharedGraph(): SwarmGraph {
  return getSharedMinCutGraph();
}

function getSharedMonitor(): MinCutHealthMonitor {
  return getSharedMinCutMonitor();
}

// ============================================================================
// MinCut Health Tool
// ============================================================================

export interface MinCutHealthParams extends Record<string, unknown> {
  /** Add agent vertices before analysis */
  agents?: Array<{
    id: string;
    domain: DomainName;
    weight?: number;
  }>;
  /** Add edges between agents */
  edges?: Array<{
    source: string;
    target: string;
    weight?: number;
  }>;
  /** Include weak vertex analysis */
  includeWeakVertices?: boolean;
  /** Include history */
  includeHistory?: boolean;
}

export interface MinCutHealthResult {
  health: {
    status: 'healthy' | 'warning' | 'critical';
    minCutValue: number;
    healthyThreshold: number;
    warningThreshold: number;
    weakVertexCount: number;
    trend: 'improving' | 'stable' | 'degrading';
  };
  weakVertices?: Array<{
    id: string;
    domain?: string;
    weightedDegree: number;
    riskScore: number;
    reason: string;
  }>;
  topology: {
    vertexCount: number;
    edgeCount: number;
    isConnected: boolean;
  };
  history?: Array<{
    timestamp: Date;
    value: number;
  }>;
}

export class MinCutHealthTool extends MCPToolBase<MinCutHealthParams, MinCutHealthResult> {
  readonly config: MCPToolConfig = {
    name: MINCUT_TOOL_NAMES.HEALTH,
    description: 'Analyze swarm topology health using MinCut algorithms. Reports connectivity, weak points, and health trends.',
    domain: 'coordination' as DomainName,
    schema: {
      type: 'object',
      properties: {
        agents: {
          type: 'array',
          description: 'Agent vertices to add to the graph before analysis',
        },
        edges: {
          type: 'array',
          description: 'Edges to add between agents',
        },
        includeWeakVertices: {
          type: 'boolean',
          description: 'Include detailed weak vertex analysis',
          default: true,
        },
        includeHistory: {
          type: 'boolean',
          description: 'Include historical health data',
          default: false,
        },
      },
      additionalProperties: true,
    },
  };

  async execute(
    params: MinCutHealthParams,
    context: MCPToolContext
  ): Promise<ToolResult<MinCutHealthResult>> {
    const graph = getSharedGraph();
    const monitor = getSharedMonitor();
    const calculator = createMinCutCalculator();

    // Add agents if provided
    if (params.agents) {
      for (const agent of params.agents) {
        if (!graph.hasVertex(agent.id)) {
          graph.addVertex({
            id: agent.id,
            type: 'agent',
            domain: agent.domain,
            weight: agent.weight ?? 1.0,
            createdAt: new Date(),
          });
        }
      }
    }

    // Add edges if provided
    if (params.edges) {
      for (const edge of params.edges) {
        if (graph.hasVertex(edge.source) && graph.hasVertex(edge.target)) {
          if (!graph.hasEdge(edge.source, edge.target)) {
            graph.addEdge({
              source: edge.source,
              target: edge.target,
              weight: edge.weight ?? 1.0,
              type: 'coordination',
              bidirectional: true,
            });
          }
        }
      }
    }

    // Get health status
    const health = monitor.checkHealth();
    const weakVertices = params.includeWeakVertices !== false
      ? calculator.findWeakVertices(graph)
      : [];

    const result: MinCutHealthResult = {
      health: {
        status: health.status,
        minCutValue: health.minCutValue,
        healthyThreshold: health.healthyThreshold,
        warningThreshold: health.warningThreshold,
        weakVertexCount: health.weakVertexCount,
        trend: health.trend,
      },
      topology: {
        vertexCount: graph.vertexCount,
        edgeCount: graph.edgeCount,
        isConnected: graph.isConnected(),
      },
    };

    if (params.includeWeakVertices !== false && weakVertices.length > 0) {
      result.weakVertices = weakVertices.map(wv => ({
        id: wv.vertexId,
        domain: wv.vertex?.domain,
        weightedDegree: wv.weightedDegree,
        riskScore: wv.riskScore,
        reason: wv.reason,
      }));
    }

    if (params.includeHistory) {
      result.history = health.history.map(h => ({
        timestamp: h.timestamp,
        value: h.value,
      }));
    }

    this.markAsRealData();

    return {
      success: true,
      data: result,
      metadata: this.createMetadata(context.startTime, context.requestId),
    };
  }
}

// ============================================================================
// MinCut Analyze Tool
// ============================================================================

export interface MinCutAnalyzeParams extends Record<string, unknown> {
  /** Threshold for weak vertex detection */
  weaknessThreshold?: number;
  /** Include partitioning point analysis */
  includePartitioningPoints?: boolean;
}

export interface MinCutAnalyzeResult {
  minCutValue: number;
  minDegreeVertex: {
    vertexId: string;
    degree: number;
  } | null;
  weakVertices: Array<{
    id: string;
    weightedDegree: number;
    riskScore: number;
    reason: string;
    suggestions: Array<{
      type: string;
      priority: string;
      estimatedImprovement: number;
    }>;
  }>;
  partitioningPoints?: Array<{
    vertexId: string;
    localMinCut: number;
    wouldDisconnect: boolean;
  }>;
  suggestedEdges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

export class MinCutAnalyzeTool extends MCPToolBase<MinCutAnalyzeParams, MinCutAnalyzeResult> {
  readonly config: MCPToolConfig = {
    name: MINCUT_TOOL_NAMES.ANALYZE,
    description: 'Deep analysis of swarm topology using MinCut algorithms. Identifies weak points, suggests improvements.',
    domain: 'coordination' as DomainName,
    schema: {
      type: 'object',
      properties: {
        weaknessThreshold: {
          type: 'number',
          description: 'Threshold for weak vertex detection',
        },
        includePartitioningPoints: {
          type: 'boolean',
          description: 'Include analysis of potential partitioning points',
          default: false,
        },
      },
      additionalProperties: true,
    },
  };

  async execute(
    params: MinCutAnalyzeParams,
    context: MCPToolContext
  ): Promise<ToolResult<MinCutAnalyzeResult>> {
    const graph = getSharedGraph();
    const calculator = createMinCutCalculator();

    const minCutValue = calculator.getMinCutValue(graph);
    const minDegreeVertex = calculator.getMinDegreeVertex(graph);
    const weakVertices = calculator.findWeakVertices(graph, params.weaknessThreshold);
    const suggestedEdges = calculator.suggestEdgeAdditions(graph, 2.0);

    const result: MinCutAnalyzeResult = {
      minCutValue,
      minDegreeVertex,
      weakVertices: weakVertices.map(wv => ({
        id: wv.vertexId,
        weightedDegree: wv.weightedDegree,
        riskScore: wv.riskScore,
        reason: wv.reason,
        suggestions: wv.suggestions.map(s => ({
          type: s.type,
          priority: s.priority,
          estimatedImprovement: s.estimatedImprovement,
        })),
      })),
      suggestedEdges: suggestedEdges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      })),
    };

    if (params.includePartitioningPoints) {
      result.partitioningPoints = calculator.findPartitioningPoints(graph);
    }

    this.markAsRealData();

    return {
      success: true,
      data: result,
      metadata: this.createMetadata(context.startTime, context.requestId),
    };
  }
}

// ============================================================================
// MinCut Strengthen Tool
// ============================================================================

export interface MinCutStrengthenParams extends Record<string, unknown> {
  /** Target improvement in MinCut value */
  targetImprovement?: number;
  /** Specific vertices to strengthen */
  targetVertices?: string[];
  /** Apply changes (true) or just simulate (false) */
  apply?: boolean;
}

export interface MinCutStrengthenResult {
  beforeMinCut: number;
  afterMinCut: number;
  improvement: number;
  actionsApplied: Array<{
    type: 'add_edge' | 'increase_weight';
    source?: string;
    target?: string;
    weight?: number;
  }>;
  applied: boolean;
}

export class MinCutStrengthenTool extends MCPToolBase<MinCutStrengthenParams, MinCutStrengthenResult> {
  readonly config: MCPToolConfig = {
    name: MINCUT_TOOL_NAMES.STRENGTHEN,
    description: 'Strengthen swarm topology by adding edges between weak and strong vertices.',
    domain: 'coordination' as DomainName,
    schema: {
      type: 'object',
      properties: {
        targetImprovement: {
          type: 'number',
          description: 'Target improvement in MinCut value',
          default: 1.0,
        },
        targetVertices: {
          type: 'array',
          description: 'Specific vertices to strengthen',
        },
        apply: {
          type: 'boolean',
          description: 'Apply changes (true) or simulate (false)',
          default: false,
        },
      },
      additionalProperties: true,
    },
  };

  async execute(
    params: MinCutStrengthenParams,
    context: MCPToolContext
  ): Promise<ToolResult<MinCutStrengthenResult>> {
    const graph = getSharedGraph();
    const calculator = createMinCutCalculator();

    const beforeMinCut = calculator.getMinCutValue(graph);
    const targetImprovement = params.targetImprovement ?? 1.0;

    // Get suggested edges
    const suggestedEdges = calculator.suggestEdgeAdditions(graph, targetImprovement);

    const actionsApplied: MinCutStrengthenResult['actionsApplied'] = [];

    if (params.apply) {
      // Actually apply the changes
      for (const edge of suggestedEdges) {
        graph.addEdge({
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          type: 'coordination',
          bidirectional: true,
        });
        actionsApplied.push({
          type: 'add_edge',
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
        });
      }
    } else {
      // Simulate - report what would be done
      for (const edge of suggestedEdges) {
        actionsApplied.push({
          type: 'add_edge',
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
        });
      }
    }

    const afterMinCut = calculator.getMinCutValue(graph);

    this.markAsRealData();

    return {
      success: true,
      data: {
        beforeMinCut,
        afterMinCut: params.apply ? afterMinCut : beforeMinCut + targetImprovement,
        improvement: params.apply ? afterMinCut - beforeMinCut : targetImprovement,
        actionsApplied,
        applied: params.apply ?? false,
      },
      metadata: this.createMetadata(context.startTime, context.requestId),
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export const MINCUT_TOOLS = [
  new MinCutHealthTool(),
  new MinCutAnalyzeTool(),
  new MinCutStrengthenTool(),
];

/**
 * Reset shared state (for testing)
 * Delegates to the central MinCut singleton reset
 */
export function resetMinCutState(): void {
  resetSharedMinCutState();
}

/**
 * Get shared graph (for integration with other systems)
 * Returns the central MinCut singleton, shared with QueenCoordinator
 */
export function getMinCutGraph(): SwarmGraph {
  return getSharedMinCutGraph();
}

/**
 * Get shared monitor (for integration with other systems)
 * Returns the central MinCut singleton, shared with QueenCoordinator
 */
export function getMinCutMonitor(): MinCutHealthMonitor {
  return getSharedMinCutMonitor();
}
