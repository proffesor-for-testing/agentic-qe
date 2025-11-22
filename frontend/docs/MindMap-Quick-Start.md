# MindMap Quick Start Guide

## Installation

The MindMap component is already included in the Phase 3 frontend. No additional installation required.

## Basic Usage

### 1. Import the Component

```typescript
import { MindMap } from '@/components/MindMap';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
```

### 2. Add to Your Page

```typescript
function DashboardPage() {
  return (
    <WebSocketProvider>
      <div className="h-screen">
        <MindMap sessionId="my-session" />
      </div>
    </WebSocketProvider>
  );
}
```

### 3. Start the Backend Services

```bash
# Terminal 1: Start REST API server
cd /workspaces/agentic-qe-cf
npm run start:express

# Terminal 2: Start WebSocket server
npm run start:websocket

# Terminal 3: Start frontend
cd frontend
npm run dev
```

### 4. Open the Application

Navigate to `http://localhost:5173`

## Quick Controls

### Layout Algorithms
- **Hierarchical**: Tree structure, top-down
- **Circular**: Nodes in a circle
- **Force**: Physics-based layout
- **COSE**: Optimized for large graphs (default)

### View Controls
- **Eye Icon**: Toggle node labels
- **E on/off**: Toggle edge labels
- **Zoom +/-**: Zoom in/out
- **Maximize**: Fit to screen

### Export
- **PNG**: Export as image
- **JSON**: Export graph data

## Filtering

### By Agent Type
Click agent type buttons to filter:
- coordinator
- researcher
- coder
- tester
- reviewer
- analyzer

### By Status
Click status buttons to filter:
- idle
- running
- completed
- error

### Search
Type in the search box to find nodes by name or ID.

## Interactions

### Select a Node
Click on any node to select it and view details in the side panel.

### Expand/Collapse
Double-click a node to expand or collapse its connections.

### Zoom and Pan
- Mouse wheel: Zoom
- Click and drag: Pan
- Pinch (touch): Zoom

## Performance Tips

### For Small Graphs (<100 nodes)
- Use any layout algorithm
- Keep all labels visible
- Enable animations

### For Medium Graphs (100-500 nodes)
- Use COSE or Hierarchical layout
- Keep node labels, hide edge labels
- Reduce animation duration

### For Large Graphs (500-1000+ nodes)
- Use COSE layout
- Hide edge labels
- Use filtering to show subsets
- Disable animations

## Common Scenarios

### Scenario 1: Monitor Agent Coordination
1. Start with COSE layout
2. Filter by status: "running"
3. Watch real-time updates via WebSocket

### Scenario 2: Debug Agent Relationships
1. Search for specific agent
2. Double-click to expand connections
3. Switch to Hierarchical layout

### Scenario 3: Export for Documentation
1. Fit to screen
2. Adjust labels as needed
3. Export as PNG
4. Include in reports

### Scenario 4: Analyze Performance
1. Load historical session
2. Filter by agent type
3. Export JSON for analysis

## Integration Examples

### With Custom Session Data
```typescript
const [sessionId, setSessionId] = useState('default');

return (
  <div>
    <select onChange={(e) => setSessionId(e.target.value)}>
      <option value="session-1">Session 1</option>
      <option value="session-2">Session 2</option>
    </select>
    <MindMap sessionId={sessionId} />
  </div>
);
```

### With State Management
```typescript
const [selectedNode, setSelectedNode] = useState<string | null>(null);
const { setSelectedNode: setWsSelectedNode } = useWebSocket();

useEffect(() => {
  if (selectedNode) {
    setWsSelectedNode(selectedNode);
  }
}, [selectedNode, setWsSelectedNode]);

return <MindMap sessionId="my-session" />;
```

### With Detail Panel
```typescript
import { MindMap } from '@/components/MindMap';
import { DetailPanel } from '@/components/DetailPanel';
import { useWebSocket } from '@/contexts/WebSocketContext';

function GraphView() {
  const { selectedNode } = useWebSocket();

  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <MindMap sessionId="current" />
      </div>
      {selectedNode && (
        <div className="w-96 border-l">
          <DetailPanel nodeId={selectedNode} />
        </div>
      )}
    </div>
  );
}
```

## Troubleshooting

### Problem: Graph not loading
**Solution**: Check that backend services are running:
```bash
curl http://localhost:3000/api/health
curl http://localhost:3001/health
```

### Problem: WebSocket not connecting
**Solution**: Verify WebSocket server is running on port 3001:
```bash
npm run start:websocket
```

### Problem: Slow performance
**Solutions**:
1. Reduce visible nodes with filtering
2. Switch to COSE layout
3. Hide edge labels
4. Use search to find specific nodes

### Problem: Layout looks messy
**Solutions**:
1. Try different layout algorithms
2. Use "Fit to Screen" button
3. Manually zoom and pan
4. Filter to reduce node count

## Next Steps

- Read the full [MindMap Implementation Guide](./MindMap-Implementation.md)
- Check out [Performance Testing](./MindMap-Performance.md)
- Learn about [WebSocket Integration](../../docs/websocket-server-implementation.md)
- Explore [Visualization API](../../docs/phase3/visualization-api-spec.md)

## Support

For issues or questions:
1. Check the [documentation](./MindMap-Implementation.md)
2. Review [common issues](./MindMap-Implementation.md#troubleshooting)
3. Open an issue on GitHub
