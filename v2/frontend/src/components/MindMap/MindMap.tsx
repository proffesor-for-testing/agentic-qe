import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import cytoscape, { Core, NodeSingular } from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { FilterState, LayoutAlgorithm, NodeType, EdgeType } from '../../types';
import { visualizationApi } from '../../services/visualizationApi';
import { MindMapControls } from './MindMapControls';
import { Search, Filter, AlertCircle, Loader2 } from 'lucide-react';

// Register layout
cytoscape.use(coseBilkent);

// Enhanced color scheme for different node and edge types
const NODE_TYPE_COLORS: Record<NodeType, string> = {
  agent: '#3b82f6', // blue
  task: '#10b981', // green
  event: '#f59e0b', // amber
};

const AGENT_TYPE_COLORS = {
  coordinator: '#3b82f6',
  researcher: '#10b981',
  coder: '#f59e0b',
  tester: '#ef4444',
  reviewer: '#8b5cf6',
  analyzer: '#06b6d4',
};

const STATUS_COLORS = {
  idle: '#94a3b8',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
};

const EDGE_TYPE_STYLES: Record<
  EdgeType,
  { color: string; style: 'solid' | 'dashed' | 'dotted'; width: number }
> = {
  communication: { color: '#3b82f6', style: 'solid', width: 2 },
  dependency: { color: '#ef4444', style: 'dashed', width: 2 },
  sequence: { color: '#10b981', style: 'dotted', width: 2 },
};

// Node shape mapping
const NODE_SHAPES: Record<NodeType, string> = {
  agent: 'ellipse',
  task: 'rectangle',
  event: 'diamond',
};

export const MindMap: React.FC<{ sessionId?: string }> = ({ sessionId = 'default' }) => {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<Core | null>(null);
  const { graphData, selectedNode, setSelectedNode } = useWebSocket();

  // State
  const [filters, setFilters] = useState<FilterState>({
    agentTypes: [],
    statuses: [],
    timeRange: null,
    searchQuery: '',
  });
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [algorithm, setAlgorithm] = useState<LayoutAlgorithm>('cose-bilkent');
  const [showLabels, setShowLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiGraphData, setApiGraphData] = useState<any>(null);

  // Load graph data from API
  useEffect(() => {
    const loadGraphData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await visualizationApi.getGraphData(sessionId, algorithm);
        setApiGraphData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load graph data');
        console.error('Failed to load graph data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadGraphData();
  }, [sessionId, algorithm]);

  // Use API data if available, otherwise fall back to WebSocket data
  const currentGraphData = apiGraphData || graphData;

  // Filter graph data
  const filteredData = useMemo(() => {
    let nodes = currentGraphData?.nodes || [];
    const edges = currentGraphData?.edges || [];

    if (filters.agentTypes.length > 0) {
      nodes = nodes.filter((n: { type: string }) => filters.agentTypes.includes(n.type));
    }

    if (filters.statuses.length > 0) {
      nodes = nodes.filter((n: { status: string }) => filters.statuses.includes(n.status));
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      nodes = nodes.filter(
        (n: { label: string; id: string }) =>
          n.label?.toLowerCase().includes(query) || n.id?.toLowerCase().includes(query)
      );
    }

    const nodeIds = new Set(nodes.map((n: { id: string }) => n.id));
    const filteredEdges = edges.filter(
      (e: { source: string; target: string }) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes, edges: filteredEdges };
  }, [currentGraphData, filters]);

  // Get layout configuration based on algorithm
  const getLayoutConfig = useCallback(
    (layoutAlgorithm: LayoutAlgorithm) => {
      const baseConfig = {
        animationDuration: 500,
        fit: true,
        padding: 30,
      };

      switch (layoutAlgorithm) {
        case 'hierarchical':
          return {
            name: 'breadthfirst',
            ...baseConfig,
            directed: true,
            spacingFactor: 1.5,
          };
        case 'circular':
          return {
            name: 'circle',
            ...baseConfig,
            avoidOverlap: true,
            radius: 200,
          };
        case 'force':
          return {
            name: 'cose',
            ...baseConfig,
            idealEdgeLength: 100,
            nodeRepulsion: 400000,
            edgeElasticity: 100,
          };
        case 'cose-bilkent':
          return {
            name: 'cose-bilkent',
            ...baseConfig,
            nodeDimensionsIncludeLabels: true,
            idealEdgeLength: 100,
            nodeRepulsion: 4500,
            numIter: 2500,
            tile: true,
          };
        case 'breadthfirst':
          return {
            name: 'breadthfirst',
            ...baseConfig,
            directed: true,
          };
        case 'concentric':
          return {
            name: 'concentric',
            ...baseConfig,
            concentric: (node: NodeSingular) => node.degree(),
            levelWidth: () => 2,
          };
        default:
          return { name: layoutAlgorithm, ...baseConfig };
      }
    },
    []
  );

  // Cytoscape stylesheet
  const getStylesheet = useCallback(() => {
    return [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          label: showLabels ? 'data(label)' : '',
          shape: 'data(shape)',
          'text-valign': 'center',
          'text-halign': 'center',
          color: '#fff',
          'font-size': '12px',
          'font-weight': 'bold',
          width: 60,
          height: 60,
          'border-width': 3,
          'border-color': 'data(borderColor)',
          'text-wrap': 'wrap',
          'text-max-width': '80px',
        } as any,
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 5,
          'border-color': '#fbbf24',
        } as any,
      },
      {
        selector: 'edge',
        style: {
          width: 'data(width)',
          'line-color': 'data(color)',
          'line-style': 'data(style)',
          'target-arrow-color': 'data(color)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          label: showEdgeLabels ? 'data(label)' : '',
          'font-size': '10px',
          color: '#64748b',
          'text-background-color': '#fff',
          'text-background-opacity': 0.8,
          'text-background-padding': '3px',
        } as any,
      },
      {
        selector: '.collapsed',
        style: {
          'background-color': '#64748b',
          opacity: 0.6,
        } as any,
      },
      {
        selector: '.highlighted',
        style: {
          'border-width': 5,
          'border-color': '#fbbf24',
        } as any,
      },
      {
        selector: '.animated-edge',
        style: {
          'line-dash-pattern': [6, 3],
          'line-dash-offset': 24,
        } as any,
      },
    ];
  }, [showLabels, showEdgeLabels]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!cyRef.current) return;

    cyInstance.current = cytoscape({
      container: cyRef.current,
      style: getStylesheet(),
      layout: getLayoutConfig(algorithm) as any,
      minZoom: 0.1,
      maxZoom: 3,
    });

    // Node click handler
    cyInstance.current.on('tap', 'node', (event) => {
      const nodeId = event.target.id();
      setSelectedNode(nodeId);
    });

    // Double-click to expand/collapse
    let tapped = false;
    cyInstance.current.on('tap', 'node', (event) => {
      const node = event.target;
      if (tapped) {
        tapped = false;
        toggleNodeCollapse(node);
      } else {
        tapped = true;
        setTimeout(() => {
          tapped = false;
        }, 300);
      }
    });

    return () => {
      if (cyInstance.current) {
        cyInstance.current.destroy();
      }
    };
  }, [algorithm, showLabels, showEdgeLabels]);

  // Update graph data
  useEffect(() => {
    if (!cyInstance.current) return;

    const elements: any[] = [
      ...filteredData.nodes.map((node: {
        id: string;
        label: string;
        type: string;
        status: string;
        parent?: string;
        nodeType?: string;
      }) => {
        // Determine node type for visualization
        const nodeType: NodeType = node.nodeType as NodeType || 'agent';
        const agentType = node.type as keyof typeof AGENT_TYPE_COLORS;

        return {
          data: {
            id: node.id,
            label: node.label,
            color: AGENT_TYPE_COLORS[agentType] || NODE_TYPE_COLORS[nodeType],
            borderColor: STATUS_COLORS[node.status as keyof typeof STATUS_COLORS] || '#94a3b8',
            shape: NODE_SHAPES[nodeType] || 'ellipse',
            parent: node.parent,
          },
          classes: collapsedNodes.has(node.id) ? 'collapsed' : '',
        };
      }),
      ...filteredData.edges.map((edge: {
        id: string;
        source: string;
        target: string;
        label?: string;
        type: string;
        edgeType?: string;
        animated?: boolean;
      }) => {
        // Determine edge type for visualization
        const edgeType: EdgeType = edge.edgeType as EdgeType || edge.type === 'coordination'
          ? 'communication'
          : edge.type === 'data-flow'
          ? 'dependency'
          : 'sequence';

        const edgeStyle = EDGE_TYPE_STYLES[edgeType];

        return {
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label || '',
            color: edgeStyle.color,
            style: edgeStyle.style,
            width: edgeStyle.width,
          },
          classes: edge.animated ? 'animated-edge' : '',
        };
      }),
    ];

    cyInstance.current.elements().remove();
    cyInstance.current.add(elements);
    cyInstance.current.layout(getLayoutConfig(algorithm) as unknown as cytoscape.LayoutOptions).run();
  }, [filteredData, collapsedNodes, algorithm, getLayoutConfig]);

  // Update stylesheet when showLabels or showEdgeLabels changes
  useEffect(() => {
    if (cyInstance.current) {
      cyInstance.current.style(getStylesheet());
    }
  }, [showLabels, showEdgeLabels, getStylesheet]);

  // Highlight selected node
  useEffect(() => {
    if (!cyInstance.current) return;

    cyInstance.current.elements().removeClass('highlighted');
    if (selectedNode) {
      cyInstance.current.getElementById(selectedNode).addClass('highlighted');
    }
  }, [selectedNode]);

  // Helper functions
  const toggleNodeCollapse = (node: NodeSingular) => {
    const nodeId = node.id();
    setCollapsedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleZoomIn = () => {
    if (cyInstance.current) {
      cyInstance.current.zoom(cyInstance.current.zoom() * 1.2);
      cyInstance.current.center();
    }
  };

  const handleZoomOut = () => {
    if (cyInstance.current) {
      cyInstance.current.zoom(cyInstance.current.zoom() * 0.8);
      cyInstance.current.center();
    }
  };

  const handleFit = () => {
    if (cyInstance.current) {
      cyInstance.current.fit(undefined, 30);
    }
  };

  const handleExportPNG = () => {
    if (cyInstance.current) {
      const png = cyInstance.current.png({
        output: 'blob',
        bg: 'white',
        full: true,
        scale: 2,
      });
      const url = URL.createObjectURL(png as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mindmap-${sessionId}-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportJSON = async () => {
    try {
      const blob = await visualizationApi.exportGraphJSON(sessionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mindmap-${sessionId}-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export JSON:', err);
      // Fallback: export current graph data
      const data = JSON.stringify(currentGraphData, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mindmap-${sessionId}-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const toggleFilter = (type: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const currentValues = prev[type] as string[];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      return { ...prev, [type]: newValues };
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <MindMapControls
        algorithm={algorithm}
        onAlgorithmChange={setAlgorithm}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels(!showLabels)}
        showEdgeLabels={showEdgeLabels}
        onToggleEdgeLabels={() => setShowEdgeLabels(!showEdgeLabels)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFit}
        onExportPNG={handleExportPNG}
        onExportJSON={handleExportJSON}
      />

      {/* Search and Filters */}
      <div className="bg-white border-b p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search nodes..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={filters.searchQuery}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="font-medium">Agent Type:</span>
            {Object.keys(AGENT_TYPE_COLORS).map((type) => (
              <button
                key={type}
                onClick={() => toggleFilter('agentTypes', type)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  filters.agentTypes.includes(type)
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span>
            {Object.keys(STATUS_COLORS).map((status) => (
              <button
                key={status}
                onClick={() => toggleFilter('statuses', status)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  filters.statuses.includes(status)
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 relative bg-gray-50">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
              <span className="text-sm text-gray-600">Loading graph data...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 z-10 shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}
        <div ref={cyRef} className="w-full h-full" />
      </div>

      {/* Legend */}
      <div className="bg-white border-t p-3">
        <div className="flex gap-6 text-xs">
          <div>
            <h4 className="font-semibold text-gray-600 mb-1">Agent Types</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(AGENT_TYPE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-gray-600">{type}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-600 mb-1">Status</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: color }} />
                  <span className="text-gray-600">{status}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-600 mb-1">Edge Types</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(EDGE_TYPE_STYLES).map(([type, style]) => (
                <div key={type} className="flex items-center gap-1">
                  <div
                    className="w-6 h-0.5"
                    style={{
                      backgroundColor: style.color,
                      borderStyle: style.style,
                      borderWidth: style.style !== 'solid' ? '1px' : '0',
                      borderColor: style.color,
                    }}
                  />
                  <span className="text-gray-600">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
