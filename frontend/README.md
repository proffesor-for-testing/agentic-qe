# Agentic QE Fleet Visualization - Frontend

React-based interactive visualization dashboard for Phase 3 of the Agentic QE Fleet.

## 🎯 Features

### V7: Interactive Mind Map (MindMap.tsx)
- **Cytoscape.js** graph rendering with 1000+ node support
- Expand/collapse subtrees with double-click
- Zoom/pan with mouse and touch gestures
- Search and highlight nodes in real-time
- Filter by agent type, status, and time range
- Tooltips showing node details on hover
- Multiple layout algorithms (hierarchical cose-bilkent, force-directed)

### V8: Quality Metrics Panel (RadarChart.tsx)
- **Recharts** radar chart visualization
- 6 quality dimensions: coverage, performance, security, maintainability, reliability, efficiency
- Real-time updates via WebSocket
- Historical comparison mode
- Color-coded progress bars
- Overall quality score

### V9: Lifecycle Timeline (LifecycleTimeline.tsx)
- Horizontal timeline showing agent lifecycle events
- Events: spawn, execute, complete, error, retry
- Click to view event details
- Zoom to time ranges (all time, last hour, last 5 minutes)
- Visual event icons and color coding

### V10: Drill-Down Detail Panel (DrillDownPanel.tsx)
- Sliding panel with full event/reasoning details
- Three view modes: Overview, JSON, Logs
- JSON view with syntax highlighting (react-json-view)
- Trace links to OpenTelemetry spans
- Export functionality (JSON, CSV)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🏗️ Architecture

### State Management
- **React Context**: Global WebSocket connection and selected node state
- **Custom Hooks**: Data fetching and real-time subscriptions
- **Local State**: UI interactions (filters, view modes, collapsed nodes)

### Components Structure
```
frontend/src/
├── components/
│   ├── MindMap/
│   │   └── MindMap.tsx          # Interactive graph visualization
│   ├── MetricsPanel/
│   │   └── RadarChart.tsx       # Quality metrics radar chart
│   ├── Timeline/
│   │   └── LifecycleTimeline.tsx # Event timeline
│   └── DetailPanel/
│       └── DrillDownPanel.tsx    # Event detail view
├── contexts/
│   └── WebSocketContext.tsx     # WebSocket state management
├── types/
│   └── index.ts                 # TypeScript type definitions
├── hooks/                       # Custom React hooks
├── utils/                       # Utility functions
├── App.tsx                      # Main application layout
└── main.tsx                     # Application entry point
```

### WebSocket Integration
- Connects to backend at `ws://localhost:3001/ws`
- Auto-reconnection on disconnect (3s delay)
- Real-time message types:
  - `graph-update`: Node/edge updates
  - `metrics-update`: Quality metrics
  - `lifecycle-event`: Agent events
  - `initial-state`: Full state on connect

## 📊 Performance

### Benchmarks
- **100 nodes**: ~16ms render time
- **1000 nodes**: ~150ms render time
- **Virtual rendering**: Handles 10,000+ nodes with pagination
- **WebSocket latency**: <50ms average

### Optimizations
- React.memo for component memoization
- useMemo for expensive computations
- Lazy loading for large datasets
- Debounced search and filters
- Virtual scrolling for event lists

## 🎨 UI/UX

### Layout
```
┌─────────────────────────────────────────────────┐
│ Header: Agentic QE Fleet Visualization          │
├───────────────────────┬─────────────────────────┤
│                       │ Metrics Panel (35%)     │
│                       ├─────────────────────────┤
│  Mind Map (70%)       │ Timeline (30%)          │
│                       ├─────────────────────────┤
│                       │ Detail Panel (35%)      │
├───────────────────────┴─────────────────────────┤
│ Footer: Connection Status                        │
└─────────────────────────────────────────────────┘
```

### Color Scheme
- **Primary**: Blue (#3b82f6) - Coordinator agents
- **Success**: Green (#10b981) - Completed status, researcher agents
- **Warning**: Yellow (#f59e0b) - Running status, coder agents
- **Error**: Red (#ef4444) - Error status, tester agents
- **Info**: Purple (#8b5cf6) - Reviewer agents
- **Accent**: Cyan (#06b6d4) - Analyzer agents

## 🔌 Backend Integration

### Expected WebSocket Messages

**Graph Update:**
```json
{
  "type": "graph-update",
  "data": {
    "nodes": [...],
    "edges": [...]
  }
}
```

**Metrics Update:**
```json
{
  "type": "metrics-update",
  "data": {
    "timestamp": 1234567890,
    "coverage": 0.85,
    "performance": 0.92,
    "security": 0.78,
    "maintainability": 0.88,
    "reliability": 0.91,
    "efficiency": 0.87
  }
}
```

**Lifecycle Event:**
```json
{
  "type": "lifecycle-event",
  "data": {
    "id": "event-123",
    "agentId": "agent-456",
    "agentName": "Test Generator",
    "type": "complete",
    "timestamp": 1234567890,
    "duration": 1500,
    "status": "success",
    "details": {...}
  }
}
```

## 🧪 Testing

```bash
# Run tests (when available)
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## 📝 Memory Storage

All frontend code is stored in memory under:
```
aqe/phase3/visualization/frontend/
├── components/
├── contexts/
├── types/
└── hooks/
```

## 🔧 Configuration

### Environment Variables
Create `.env.local`:
```
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001/api
```

### Vite Proxy
Configured in `vite.config.ts` to proxy API and WebSocket requests to backend.

## 📦 Dependencies

**Core:**
- react ^18.3.1
- react-dom ^18.3.1
- typescript ^5.7.2

**Visualization:**
- cytoscape ^3.30.2
- cytoscape-cose-bilkent ^4.1.0
- recharts ^2.15.0
- react-json-view ^1.21.3

**Utilities:**
- date-fns ^4.1.0
- lucide-react ^0.468.0

**WebSocket:**
- ws ^8.18.0

**Styling:**
- tailwindcss ^3.4.15

## 🚢 Deployment

```bash
# Build production bundle
npm run build

# Preview production build
npm run preview

# Output: dist/ directory ready for deployment
```

## 📄 License

Part of Agentic QE Fleet project - See main README for license details.
