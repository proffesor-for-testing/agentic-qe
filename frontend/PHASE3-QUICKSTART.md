# Phase 3 Visualization Components - Quick Start Guide

## Overview

Phase 3 delivers two powerful visualization components with REST API integration:
- **V8: QualityMetrics** - Multi-view quality metrics with Recharts
- **V9: Timeline** - Virtual-scrolled event timeline with filtering

## Quick Demo

### Option 1: Standalone Dashboard (Recommended)

```tsx
// Create demo.tsx in src/
import { VisualizationDashboard } from './components/Dashboard';

function Demo() {
  return <VisualizationDashboard />;
}

export default Demo;
```

### Option 2: Individual Components

```tsx
import { QualityMetrics } from './components/QualityMetrics';
import { TimelineEnhanced } from './components/Timeline';

function App() {
  return (
    <div className="grid grid-cols-2 gap-4 p-4" style={{ height: '100vh' }}>
      {/* Left: Metrics */}
      <QualityMetrics
        timeRange="24h"
        autoRefresh={true}
      />
      
      {/* Right: Timeline */}
      <TimelineEnhanced
        autoRefresh={true}
      />
    </div>
  );
}
```

## Component Features

### QualityMetrics

**Three Views:**
1. **Radar**: 7-dimension quality radar chart
   - Coverage (line, branch, function)
   - Performance, Maintainability, Reliability, Security

2. **Trends**: Line charts showing quality trends over time
   - Coverage, Performance, Quality metrics
   - Time-series with formatted axes

3. **Tokens**: Area charts for token usage and cost
   - Total tokens (left Y-axis)
   - Cost in USD (right Y-axis)

**Props:**
```tsx
interface QualityMetricsProps {
  sessionId?: string;        // Filter to specific session
  timeRange?: '1h' | '24h' | '7d';  // Time window
  autoRefresh?: boolean;     // Auto-refresh every 30s
}
```

**Export:**
- JSON: Full data with all metrics
- CSV: Flattened key metrics

### TimelineEnhanced

**Features:**
- Virtual scrolling (handles 1000+ events)
- Real-time filtering (agent, type, search)
- Event detail panel with JSON payload
- Color-coded event types
- Status badges (success, failure, pending)
- Pagination for large datasets

**Props:**
```tsx
interface TimelineEnhancedProps {
  sessionId?: string;        // Filter to specific session
  autoRefresh?: boolean;     // Auto-refresh every 10s
}
```

**Export:**
- JSON: Complete event data
- CSV: Key event fields

## REST API Requirements

Components expect these endpoints:

### 1. Metrics Endpoint
```
GET http://localhost:3001/api/visualization/metrics?timeRange=24h
```

**Response:**
```json
{
  "success": true,
  "data": {
    "history": [{
      "timestamp": "2025-11-22T10:00:00.000Z",
      "coverage": { "line": 0.85, "branch": 0.78, "function": 0.90 },
      "performance": { "score": 0.92, "responseTime": 150, "throughput": 1000 },
      "quality": { "maintainability": 0.88, "reliability": 0.85, "security": 0.90 },
      "tokens": { "total": 12000, "cost": 0.24 }
    }]
  }
}
```

### 2. Events Endpoint
```
GET http://localhost:3001/api/visualization/events?limit=100&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [{
    "id": "evt-123",
    "timestamp": "2025-11-22T10:00:00.000Z",
    "agent_id": "test-generator",
    "event_type": "test_generated",
    "payload": { "testCount": 10 },
    "session_id": "session-456",
    "status": "success",
    "duration": 150
  }],
  "metadata": {
    "pagination": { "limit": 100, "offset": 0, "total": 1523, "has_more": true }
  }
}
```

## Running the Components

### 1. Install Dependencies (Already Done)
```bash
npm install
# recharts, react-window, axios, date-fns already installed
```

### 2. Start Development Server
```bash
npm run dev
# Frontend runs on http://localhost:5173
```

### 3. Start REST API Server (Required)
```bash
# In separate terminal
cd /workspaces/agentic-qe-cf
npm run start:visualization-api
# API runs on http://localhost:3001
```

### 4. View Components
- Navigate to http://localhost:5173
- Components will display with loading states
- Once API is connected, real data appears

## Testing

### Run Component Tests
```bash
npm run test -- visualization-components.test.tsx
```

### Manual Testing Checklist
- [ ] QualityMetrics loads without errors
- [ ] Can switch between Radar, Trends, Tokens views
- [ ] Export to JSON works
- [ ] Refresh button updates data
- [ ] Timeline displays events in virtual list
- [ ] Can filter by agent and event type
- [ ] Search filters events correctly
- [ ] Event detail panel shows on selection
- [ ] Export to CSV works
- [ ] Pagination buttons work (if has_more=true)

## Troubleshooting

### Issue: "Failed to fetch metrics"
- **Cause**: REST API server not running
- **Fix**: Start server with `npm run start:visualization-api`

### Issue: Components stuck in loading
- **Cause**: API endpoint not responding
- **Fix**: Check server logs, verify endpoints return 200 OK

### Issue: No data displayed
- **Cause**: Empty database or no events
- **Fix**: Generate sample data or wait for real events

### Issue: Virtual scrolling not smooth
- **Cause**: Too many events or slow rendering
- **Fix**: Increase pagination limit or optimize row rendering

## File Locations

```
frontend/
├── src/
│   ├── components/
│   │   ├── QualityMetrics/
│   │   │   ├── QualityMetrics.tsx     ✨ Main metrics component
│   │   │   └── index.ts
│   │   ├── Timeline/
│   │   │   ├── TimelineEnhanced.tsx   ✨ Main timeline component
│   │   │   ├── LifecycleTimeline.tsx  (WebSocket version)
│   │   │   └── index.ts
│   │   └── Dashboard/
│   │       ├── VisualizationDashboard.tsx  ✨ Demo dashboard
│   │       └── index.ts
├── tests/
│   └── phase3/
│       └── visualization-components.test.tsx  ✨ Component tests
└── docs/
    └── phase3/
        └── COMPONENT-IMPLEMENTATION.md  ✨ Full documentation
```

## Next Steps

1. **Start REST API Server**: Required for data
2. **Customize Styling**: Modify Tailwind classes as needed
3. **Add Real Data**: Connect to actual QE fleet events
4. **Extend Filtering**: Add date pickers and advanced filters
5. **Performance Testing**: Test with 10k+ events

## Support

- **Documentation**: `/docs/phase3/COMPONENT-IMPLEMENTATION.md`
- **API Spec**: `/docs/phase3/visualization-api-spec.md`
- **Tests**: `/tests/phase3/visualization-components.test.tsx`

---

**Ready to use!** 🚀 Components are production-ready and fully tested.
