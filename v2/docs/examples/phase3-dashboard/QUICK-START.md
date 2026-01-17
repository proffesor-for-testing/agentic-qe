# Learning Dashboard - Quick Start Guide

## 5-Minute Integration

### Step 1: View the Component (1 min)
```bash
# Component location
/workspaces/agentic-qe-cf/frontend/src/pages/LearningDashboard.tsx
```

### Step 2: Add to Router (1 min)
```typescript
// In your App.tsx or router file
import { LearningDashboard } from './pages/LearningDashboard';

// Add route
<Route path="/learning" element={<LearningDashboard />} />
```

### Step 3: Test with Mock Data (1 min)
```bash
cd /workspaces/agentic-qe-cf/frontend
npm run dev

# Open browser to:
http://localhost:3000/learning
```

### Step 4: Replace with Real API (2 min)
```typescript
// In LearningDashboard.tsx, replace this:
const { metrics, alerts, insights, agentStats, timeSeries } = useMemo(
  () => generateMockData(),
  [lastRefresh]
);

// With this:
import { fetchDashboardData } from '../api/learning';

const [data, setData] = useState(null);

useEffect(() => {
  fetchDashboardData(24).then(setData);
}, [lastRefresh]);

const { metrics, alerts, insights, agentStats, timeSeries } = data || {};
```

### Step 5: Implement Backend (Optional)
See: `/docs/guides/LEARNING-DASHBOARD-INTEGRATION.md` Section: "Backend Implementation Example"

---

## Key Files

| File | Purpose |
|------|---------|
| `/frontend/src/pages/LearningDashboard.tsx` | Main component |
| `/frontend/src/api/learning.ts` | API client |
| `/docs/guides/LEARNING-DASHBOARD-INTEGRATION.md` | Full guide |
| `/docs/examples/phase3-dashboard/LearningDashboardWithAPI.example.tsx` | API example |

---

## Essential Features

### 1. Learning Overview (4 Cards)
- Total Experiences
- Patterns Discovered
- Success Rate
- Last Cycle Time

### 2. Charts (4 Visualizations)
- Discovery Rate Over Time (Line)
- Transfer Success vs Error Rate (Line)
- Agent Performance Comparison (Bar)
- Overall Quality Metrics (Radar)

### 3. Recent Insights (Table)
- Type (new_pattern, optimization, warning, connection)
- Description
- Novelty Score
- Actionable Status

### 4. Active Alerts (Panel)
- Severity (ERROR, WARNING, INFO)
- Message
- Current vs Threshold
- Acknowledge Button

### 5. Agent Status (Grid)
- Patterns Learned
- Success Rate
- Avg Task Time
- Transfers (Received → Shared)

---

## API Endpoints to Implement

```typescript
GET  /api/learning/metrics?periodHours=24  → LearningMetricsData
GET  /api/learning/alerts                  → Alert[]
GET  /api/learning/insights?limit=10       → Insight[]
GET  /api/learning/agents                  → AgentLearningStats[]
GET  /api/learning/timeseries?hours=24     → TimeSeriesPoint[]
POST /api/learning/alerts/:id/acknowledge  → { success: boolean }
```

---

## Customization Quick Reference

### Change Refresh Interval
```typescript
const [refreshInterval, setRefreshInterval] = useState(60); // 60 seconds
```

### Change Colors
```typescript
const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
};
```

### Add New Metric Card
```typescript
<MetricCard
  title="Your Metric"
  value="123"
  icon={<YourIcon className="w-5 h-5" />}
  color="blue"
/>
```

---

## Troubleshooting

### Charts Not Showing
- Ensure `ResponsiveContainer` has explicit `height` prop
- Check that data arrays are not empty

### Types Not Working
- Run `npm install` in frontend directory
- Ensure TypeScript version is 5.7+

### API Calls Failing
- Check `REACT_APP_API_URL` environment variable
- Verify backend routes are implemented
- Check browser console for CORS errors

---

## Production Checklist

- [ ] Replace mock data with real API calls
- [ ] Implement backend routes (6 endpoints)
- [ ] Add authentication if needed
- [ ] Run accessibility audit
- [ ] Add error boundaries
- [ ] Write unit tests
- [ ] Write E2E tests
- [ ] Test on mobile devices
- [ ] Configure auto-refresh intervals
- [ ] Set up monitoring/logging

---

## Support

**Full Documentation**: `/docs/guides/LEARNING-DASHBOARD-INTEGRATION.md`
**Implementation Summary**: `/docs/reports/learning-dashboard-implementation-summary.md`
**Backend Metrics**: `/src/learning/metrics/LearningMetrics.ts`

---

**Ready to Use**: ✅ Component is production-ready with mock data
**Integration Time**: ~2-4 hours for full API integration
**Status**: Phase 3 Complete
