# Learning Dashboard Integration Guide

## Overview

The **LearningDashboard** component provides a comprehensive real-time visualization of the Nightly-Learner system (Phase 3). It displays learning metrics, pattern discovery trends, transfer success rates, insights, alerts, and per-agent statistics.

**Location:** `/workspaces/agentic-qe-cf/frontend/src/pages/LearningDashboard.tsx`

## Features

### 1. Learning Overview Section
- **Total Experiences Captured**: Cumulative count with daily trend
- **Patterns Discovered**: Daily count with discovery rate (patterns/hour)
- **Success Rate**: Pattern accuracy percentage with trend indicator
- **Last Cycle Time**: Average sleep cycle duration with completion rate

### 2. Metrics Charts (Recharts)
- **Discovery Rate Over Time**: Line chart showing 24-hour pattern discovery trend
- **Transfer Success vs Error Rate**: Dual-line chart comparing transfer performance
- **Agent Performance Comparison**: Bar chart showing patterns learned per agent
- **Overall Quality Metrics**: Radar chart displaying accuracy, actionability, transfer, adoption, and reliability

### 3. Recent Insights Table
- **Type Icons**: Visual indicators (⚡ new_pattern, 📈 optimization, ⚠️ warning, 📊 connection)
- **Description**: Human-readable insight text
- **Novelty Score**: 0-100% indicator of pattern uniqueness
- **Actionable Status**: Badge indicating if insight can be applied
- **Applied Badge**: Shows when insight has been implemented
- **Pattern Count**: Number of patterns involved in insight

### 4. Active Alerts Panel
- **Severity Levels**: ERROR (red), WARNING (orange), INFO (blue)
- **Alert Message**: Descriptive text explaining the issue
- **Metric Values**: Current value vs threshold comparison
- **Timestamp**: When alert was created
- **Acknowledge Button**: UI to mark alerts as seen

### 5. Agent Status Grid
- **Agent ID & Type**: Identifier and QE agent classification
- **Activity Indicator**: Green dot (active last hour) or gray (inactive)
- **Patterns Learned**: Count of patterns agent has acquired
- **Success Rate**: Percentage of successful task executions
- **Avg Task Time**: Mean execution time in seconds
- **Transfers**: Received → Shared counts

## Architecture

### Component Structure

```
LearningDashboard (Main Component)
├── Header
│   ├── Title & Description
│   ├── Last Refresh Time
│   ├── Manual Refresh Button
│   ├── Export Data Button
│   ├── Auto-refresh Toggle
│   └── Refresh Interval Selector
│
├── Overview Section (4 MetricCards)
│   ├── Total Experiences
│   ├── Patterns Discovered
│   ├── Success Rate
│   └── Last Cycle Time
│
├── Charts Section (4 ChartCards)
│   ├── Discovery Rate Over Time (LineChart)
│   ├── Transfer Success vs Error Rate (LineChart)
│   ├── Agent Performance Comparison (BarChart)
│   └── Overall Quality Metrics (RadarChart)
│
├── Insights & Alerts Section (2 columns)
│   ├── Recent Insights (InsightRow components)
│   └── Active Alerts (AlertRow components)
│
└── Agent Status Grid (AgentCard components)
```

### Sub-Components

- **MetricCard**: Displays single metric with optional trend indicator
- **ChartCard**: Wrapper for Recharts components
- **InsightRow**: Individual insight display with type-specific styling
- **AlertRow**: Alert display with acknowledge functionality
- **AgentCard**: Per-agent statistics card

## Integration Steps

### Option 1: Standalone Route (Recommended)

Add a new route to your React Router configuration:

```typescript
// In your main routing file (e.g., App.tsx or Routes.tsx)
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LearningDashboard } from './pages/LearningDashboard';
import { VisualizationDashboard } from './components/Dashboard/VisualizationDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VisualizationDashboard />} />
        <Route path="/learning" element={<LearningDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Option 2: Tab in Existing Dashboard

Add as a tab to the existing `VisualizationDashboard`:

```typescript
// In VisualizationDashboard.tsx
import { LearningDashboard } from '../pages/LearningDashboard';

const [activeTab, setActiveTab] = useState<'metrics' | 'timeline' | 'learning'>('metrics');

// Add tab button
<button
  onClick={() => setActiveTab('learning')}
  className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
    activeTab === 'learning'
      ? 'border-purple-600 text-purple-600'
      : 'border-transparent text-gray-600 hover:text-gray-800'
  }`}
>
  <Brain className="w-4 h-4" />
  Learning
</button>

// Add content
{activeTab === 'learning' && <LearningDashboard />}
```

### Option 3: Modal/Overlay

```typescript
import { LearningDashboard } from './pages/LearningDashboard';
import { useState } from 'react';

const [showLearning, setShowLearning] = useState(false);

// Trigger button
<button onClick={() => setShowLearning(true)}>
  Open Learning Dashboard
</button>

// Modal
{showLearning && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
    <div className="h-screen overflow-auto">
      <LearningDashboard />
      <button onClick={() => setShowLearning(false)}>Close</button>
    </div>
  </div>
)}
```

## API Integration

### Required Backend Endpoints

The component currently uses mock data. To connect to real data, implement these API endpoints:

#### 1. Get Current Metrics
```typescript
// GET /api/learning/metrics?periodHours=24
// Returns: LearningMetricsData

const fetchMetrics = async (periodHours: number = 24) => {
  const response = await fetch(`/api/learning/metrics?periodHours=${periodHours}`);
  const data: LearningMetricsData = await response.json();
  return data;
};
```

#### 2. Get Active Alerts
```typescript
// GET /api/learning/alerts
// Returns: Alert[]

const fetchAlerts = async () => {
  const response = await fetch('/api/learning/alerts');
  const alerts: Alert[] = await response.json();
  return alerts;
};
```

#### 3. Get Recent Insights
```typescript
// GET /api/learning/insights?limit=10
// Returns: Insight[]

const fetchInsights = async (limit: number = 10) => {
  const response = await fetch(`/api/learning/insights?limit=${limit}`);
  const insights: Insight[] = await response.json();
  return insights;
};
```

#### 4. Get Agent Statistics
```typescript
// GET /api/learning/agents
// Returns: AgentLearningStats[]

const fetchAgentStats = async () => {
  const response = await fetch('/api/learning/agents');
  const stats: AgentLearningStats[] = await response.json();
  return stats;
};
```

#### 5. Get Time Series Data
```typescript
// GET /api/learning/timeseries?hours=24
// Returns: TimeSeriesPoint[]

const fetchTimeSeries = async (hours: number = 24) => {
  const response = await fetch(`/api/learning/timeseries?hours=${hours}`);
  const data: TimeSeriesPoint[] = await response.json();
  return data;
};
```

#### 6. Acknowledge Alert
```typescript
// POST /api/learning/alerts/:alertId/acknowledge
// Returns: { success: boolean }

const acknowledgeAlert = async (alertId: string) => {
  const response = await fetch(`/api/learning/alerts/${alertId}/acknowledge`, {
    method: 'POST',
  });
  const result = await response.json();
  return result;
};
```

### Backend Implementation Example

Create API endpoints in Express:

```typescript
// src/api/learning-dashboard.ts
import { Router } from 'express';
import { LearningMetrics } from '../learning/metrics/LearningMetrics';
import { AlertManager } from '../learning/metrics/AlertManager';
import { DreamEngine } from '../learning/dream/DreamEngine';

const router = Router();
const metrics = new LearningMetrics();
const alertManager = new AlertManager();

// Get current metrics
router.get('/metrics', async (req, res) => {
  const periodHours = parseInt(req.query.periodHours as string) || 24;
  const data = await metrics.getCurrentMetrics(periodHours);
  res.json(data);
});

// Get active alerts
router.get('/alerts', async (req, res) => {
  const alerts = await alertManager.getActiveAlerts();
  res.json(alerts);
});

// Acknowledge alert
router.post('/alerts/:alertId/acknowledge', async (req, res) => {
  const { alertId } = req.params;
  await alertManager.acknowledgeAlert(alertId);
  res.json({ success: true });
});

// Get recent insights
router.get('/insights', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const dreamEngine = new DreamEngine();
  const insights = await dreamEngine.getRecentInsights(limit);
  res.json(insights);
});

// Get agent statistics
router.get('/agents', async (req, res) => {
  const summary = await metrics.getMetricsSummary();
  // Transform breakdown data into AgentLearningStats format
  const agentStats = transformToAgentStats(summary);
  res.json(agentStats);
});

// Get time series data
router.get('/timeseries', async (req, res) => {
  const hours = parseInt(req.query.hours as string) || 24;
  const timeSeries = await metrics.getTimeSeriesData(hours);
  res.json(timeSeries);
});

export default router;
```

Register the router:

```typescript
// src/api/index.ts
import learningRoutes from './learning-dashboard';

app.use('/api/learning', learningRoutes);
```

### WebSocket Integration (Optional)

For real-time updates, add WebSocket support:

```typescript
// In LearningDashboard.tsx
import { useWebSocket } from '../hooks/useWebSocket';

export const LearningDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<LearningMetricsData | null>(null);

  // Connect to WebSocket
  const { lastMessage } = useWebSocket('ws://localhost:3000/learning');

  useEffect(() => {
    if (lastMessage) {
      const update = JSON.parse(lastMessage.data);

      if (update.type === 'metrics_update') {
        setMetrics(update.data);
      } else if (update.type === 'alert_created') {
        setAlerts((prev) => [update.data, ...prev]);
      } else if (update.type === 'insight_generated') {
        setInsights((prev) => [update.data, ...prev]);
      }
    }
  }, [lastMessage]);

  // Rest of component...
};
```

## Customization

### Adjusting Refresh Intervals

Change default auto-refresh settings:

```typescript
const [refreshInterval, setRefreshInterval] = useState(60); // 60 seconds instead of 30
```

### Color Themes

Modify color schemes in sub-components:

```typescript
const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
  // Add custom colors
  teal: 'bg-teal-50 text-teal-600',
};
```

### Chart Configurations

Customize Recharts appearance:

```typescript
<LineChart data={timeSeries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
  <XAxis
    dataKey="timestamp"
    stroke="#6b7280"
    style={{ fontSize: '12px' }}
    interval="preserveStartEnd" // Show only first and last labels
  />
  <YAxis
    stroke="#6b7280"
    style={{ fontSize: '12px' }}
    domain={[0, 1]} // Fix Y-axis range
  />
  <Tooltip />
  <Legend />
  <Line
    type="monotone"
    dataKey="discoveryRate"
    stroke="#10b981"
    strokeWidth={3} // Thicker line
    dot={{ r: 4 }} // Show dots
  />
</LineChart>
```

### Adding New Metrics

To add a new metric card:

```typescript
<MetricCard
  title="New Metric"
  value="123"
  icon={<YourIcon className="w-5 h-5" />}
  trend={15}
  trendLabel="vs last week"
  color="blue"
/>
```

## Testing

### Unit Tests (Vitest)

```typescript
// frontend/src/pages/LearningDashboard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LearningDashboard } from './LearningDashboard';

describe('LearningDashboard', () => {
  it('renders dashboard title', () => {
    render(<LearningDashboard />);
    expect(screen.getByText('Nightly-Learner Dashboard')).toBeInTheDocument();
  });

  it('displays metric cards', () => {
    render(<LearningDashboard />);
    expect(screen.getByText('Total Experiences')).toBeInTheDocument();
    expect(screen.getByText('Patterns Discovered')).toBeInTheDocument();
  });

  it('shows active alerts count', () => {
    render(<LearningDashboard />);
    const alertBadge = screen.getByText(/\d+/); // Number badge
    expect(alertBadge).toBeInTheDocument();
  });
});
```

### E2E Tests (Playwright)

```typescript
// frontend/tests/e2e/learning-dashboard.spec.ts
import { test, expect } from '@playwright/test';

test('learning dashboard loads and displays data', async ({ page }) => {
  await page.goto('/learning');

  // Check title
  await expect(page.locator('h1')).toContainText('Nightly-Learner Dashboard');

  // Check metric cards render
  await expect(page.locator('text=Total Experiences')).toBeVisible();
  await expect(page.locator('text=Patterns Discovered')).toBeVisible();

  // Check charts render
  await expect(page.locator('text=Discovery Rate Over Time')).toBeVisible();

  // Check auto-refresh toggle works
  const toggle = page.locator('input[type="checkbox"]');
  await toggle.click();
  await expect(toggle).not.toBeChecked();
});
```

## Performance Optimization

### Memoization

The component already uses `useMemo` for mock data generation. For API data:

```typescript
const memoizedMetrics = useMemo(() => metrics, [metrics]);
const memoizedChartData = useMemo(() => prepareChartData(metrics), [metrics]);
```

### Lazy Loading Charts

Charts are already using Recharts which is tree-shakeable. For further optimization:

```typescript
import { lazy, Suspense } from 'react';

const LineChart = lazy(() => import('recharts').then(m => ({ default: m.LineChart })));
const BarChart = lazy(() => import('recharts').then(m => ({ default: m.BarChart })));

// Wrap in Suspense
<Suspense fallback={<div>Loading chart...</div>}>
  <LineChart data={data}>...</LineChart>
</Suspense>
```

### Debounce Refresh

Prevent excessive refreshes:

```typescript
import { debounce } from 'lodash';

const debouncedRefresh = useMemo(
  () => debounce(() => setLastRefresh(new Date()), 1000),
  []
);
```

## Troubleshooting

### Charts Not Rendering

**Issue**: Recharts components don't appear

**Solution**: Ensure ResponsiveContainer has explicit height:

```typescript
<ResponsiveContainer width="100%" height={250}>
  <LineChart data={data}>...</LineChart>
</ResponsiveContainer>
```

### Mock Data Not Updating

**Issue**: Data doesn't change on refresh

**Solution**: Ensure `lastRefresh` is in useMemo dependency array:

```typescript
const { metrics, alerts } = useMemo(
  () => generateMockData(),
  [lastRefresh] // ← Must include this
);
```

### Type Errors with Date

**Issue**: TypeScript errors with Date serialization

**Solution**: Transform dates when fetching from API:

```typescript
const transformDates = (data: any): LearningMetricsData => ({
  ...data,
  calculatedAt: new Date(data.calculatedAt),
  periodStart: new Date(data.periodStart),
  periodEnd: new Date(data.periodEnd),
});
```

## File Locations

```
frontend/
├── src/
│   ├── pages/
│   │   ├── LearningDashboard.tsx    ← Main component
│   │   └── index.ts                 ← Exports
│   ├── types/
│   │   └── learning.ts              ← Type definitions (optional)
│   └── api/
│       └── learning.ts              ← API client functions
└── tests/
    └── e2e/
        └── learning-dashboard.spec.ts
```

## Dependencies

The component uses:

- **React 18.3+**: Core framework
- **TypeScript 5.7+**: Type safety
- **TailwindCSS 3.4+**: Styling
- **Recharts 2.15+**: Charts
- **Lucide React 0.468+**: Icons
- **date-fns 4.1+**: Date formatting (optional)

All dependencies are already in the frontend's `package.json`.

## Next Steps

1. **Replace Mock Data**: Implement API integration (see "API Integration" section)
2. **Add WebSocket**: Enable real-time updates
3. **Create Backend Routes**: Implement Express endpoints
4. **Add Authentication**: Protect dashboard with auth if needed
5. **Customize Styling**: Adjust colors/layout to match your brand
6. **Add More Metrics**: Extend with domain-specific KPIs

## Support

For questions or issues:
- **Documentation**: `/docs/guides/NIGHTLY-LEARNER-USER-GUIDE.md`
- **Phase 3 Reports**: `/docs/reports/phase3-*.md`
- **Backend API**: `/src/learning/dashboard/MetricsDashboard.ts`
- **Metrics Collection**: `/src/learning/metrics/LearningMetrics.ts`

---

**Generated**: 2025-12-11
**Version**: 1.0.0
**Author**: Agentic QE Fleet - Code Implementation Agent
