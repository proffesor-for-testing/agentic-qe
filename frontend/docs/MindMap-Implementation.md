# MindMap Component Implementation

## Overview

The MindMap component provides an interactive graph visualization for agent decision trees using Cytoscape.js. It meets Phase 3 (V7) requirements with support for 1000+ nodes, real-time WebSocket updates, and comprehensive interaction controls.

## Features

### Core Functionality
- ✅ Interactive graph visualization with Cytoscape.js
- ✅ Multiple layout algorithms (hierarchical, circular, force-directed, COSE)
- ✅ Real-time updates via WebSocket
- ✅ REST API integration for data loading
- ✅ Expand/collapse nodes (double-click)
- ✅ Zoom and pan controls
- ✅ Search and filter functionality
- ✅ Node selection and highlighting
- ✅ Export to PNG and JSON

### Performance
- ✅ <100ms render time for 100 nodes
- ✅ <250ms render time for 500 nodes
- ✅ <500ms render time for 1000 nodes
- ✅ Efficient filtering and re-rendering
- ✅ Optimized memory usage

## Architecture

### Component Structure
```
MindMap/
├── MindMap.tsx           # Main component
├── MindMapControls.tsx   # Control panel
├── index.ts              # Exports
└── __tests__/
    ├── MindMap.test.tsx           # Unit tests
    └── MindMapPerformance.test.tsx # Performance tests
```

### Data Flow
1. **Initial Load**: REST API → GraphData → Cytoscape
2. **Real-time Updates**: WebSocket → GraphData → Cytoscape
3. **User Interactions**: Controls → State → Cytoscape

### State Management
```typescript
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
```

## Usage

### Basic Usage
```typescript
import { MindMap } from '@/components/MindMap';

function App() {
  return (
    <WebSocketProvider>
      <MindMap sessionId="my-session" />
    </WebSocketProvider>
  );
}
```

### With Custom Configuration
```typescript
<MindMap
  sessionId="custom-session"
  defaultAlgorithm="hierarchical"
  showLabels={true}
  showEdgeLabels={false}
/>
```

## Layout Algorithms

### 1. COSE-Bilkent (Default)
- **Best for**: Large graphs with complex relationships
- **Performance**: Excellent for 100-1000 nodes
- **Features**: Compound spring embedder, optimal spacing

### 2. Hierarchical (Breadthfirst)
- **Best for**: Tree structures, parent-child relationships
- **Performance**: Fast, consistent
- **Features**: Clear hierarchy, top-down layout

### 3. Circular
- **Best for**: Small to medium graphs
- **Performance**: Good for <200 nodes
- **Features**: Circular arrangement, symmetrical

### 4. Force-Directed
- **Best for**: Network visualization
- **Performance**: Good for <500 nodes
- **Features**: Physics-based, natural clustering

## Interaction Features

### Node Interactions
- **Single Click**: Select node, show details
- **Double Click**: Expand/collapse node
- **Hover**: Show tooltip (if enabled)

### Controls
- **Zoom In/Out**: Buttons or mouse wheel
- **Fit to Screen**: Auto-fit all nodes
- **Export PNG**: Download as image
- **Export JSON**: Download graph data

### Filtering
- **Agent Type**: Filter by coordinator, researcher, coder, etc.
- **Status**: Filter by idle, running, completed, error
- **Search**: Text search across node labels and IDs

## Styling

### Node Colors
```typescript
const AGENT_TYPE_COLORS = {
  coordinator: '#3b82f6',  // blue
  researcher: '#10b981',   // green
  coder: '#f59e0b',        // amber
  tester: '#ef4444',       // red
  reviewer: '#8b5cf6',     // purple
  analyzer: '#06b6d4',     // cyan
};
```

### Status Indicators
```typescript
const STATUS_COLORS = {
  idle: '#94a3b8',         // gray
  running: '#3b82f6',      // blue
  completed: '#10b981',    // green
  error: '#ef4444',        // red
};
```

### Edge Styles
```typescript
const EDGE_TYPE_STYLES = {
  communication: { color: '#3b82f6', style: 'solid', width: 2 },
  dependency: { color: '#ef4444', style: 'dashed', width: 2 },
  sequence: { color: '#10b981', style: 'dotted', width: 2 },
};
```

## Performance Optimization

### Techniques Used
1. **useMemo**: Memoize filtered data
2. **useCallback**: Stable function references
3. **Efficient Rendering**: Only update changed elements
4. **Layout Optimization**: Configurable animation duration
5. **Memory Management**: Cleanup on unmount

### Performance Benchmarks
```
100 nodes:  < 100ms
500 nodes:  < 250ms
1000 nodes: < 500ms
```

## WebSocket Integration

### Message Types
```typescript
// Initial state
{ type: 'initial-state', graphData, metrics, events }

// Graph update
{ type: 'graph-update', data: GraphData }

// Metrics update
{ type: 'metrics-update', data: QualityMetrics }

// Lifecycle event
{ type: 'lifecycle-event', data: LifecycleEvent }
```

### Real-time Updates
The component automatically subscribes to WebSocket updates and applies them to the graph without full re-render.

## API Integration

### Endpoints
```typescript
// Get graph data
GET /api/visualization/graph/:sessionId?algorithm=cose-bilkent

// Export as JSON
GET /api/visualization/export/:sessionId?format=json
```

### Response Format
```typescript
interface SessionGraphData {
  sessionId: string;
  timestamp: number;
  nodes: AgentNode[];
  edges: AgentEdge[];
  metadata?: {
    topology: string;
    agentCount: number;
    duration?: number;
  };
}
```

## Testing

### Unit Tests
```bash
npm run test:unit -- MindMap.test.tsx
```

### Performance Tests
```bash
npm run test:performance -- MindMapPerformance.test.tsx
```

### E2E Tests
```bash
npm run test:e2e -- mindmap.spec.ts
```

## Troubleshooting

### Common Issues

#### Graph not rendering
- Check WebSocket connection status
- Verify API endpoint is accessible
- Check browser console for errors

#### Performance issues
- Reduce node count (use filtering)
- Switch to simpler layout algorithm
- Disable labels for large graphs

#### Layout issues
- Try different layout algorithms
- Adjust layout parameters
- Use "Fit to Screen" button

## Future Enhancements

### Planned Features
- [ ] Virtual rendering for 10,000+ nodes
- [ ] Custom node shapes
- [ ] Edge bundling for dense graphs
- [ ] Mini-map navigation
- [ ] Animation on data changes
- [ ] Touch gestures for mobile
- [ ] Keyboard navigation
- [ ] Accessibility improvements

### Performance Goals
- [ ] <50ms for 100 nodes
- [ ] <200ms for 1000 nodes
- [ ] <1s for 10,000 nodes (virtual rendering)

## Dependencies

- **cytoscape**: ^3.30.2
- **cytoscape-cose-bilkent**: ^4.1.0
- **lucide-react**: ^0.468.0
- **react**: ^18.3.1

## References

- [Cytoscape.js Documentation](https://js.cytoscape.org/)
- [COSE-Bilkent Layout](https://github.com/cytoscape/cytoscape.js-cose-bilkent)
- [WebSocket API](../../docs/websocket-server-implementation.md)
- [Visualization API](../../docs/phase3/visualization-api-spec.md)
