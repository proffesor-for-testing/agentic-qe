# Phase 3 Dashboard - File Locations

## Implementation Files

### Primary Location: `/src/learning/dashboard/`

All four requested files exist in this directory:

1. **TrendAnalyzer.ts** (`/workspaces/agentic-qe-cf/src/learning/dashboard/TrendAnalyzer.ts`)
   - 495 lines
   - Implements trend analysis using linear regression
   - Calculates moving averages
   - Detects significant changes
   - Generates forecasts

2. **AlertManager.ts** (`/workspaces/agentic-qe-cf/src/learning/dashboard/AlertManager.ts`)
   - 795 lines
   - Configurable alert rules
   - Anomaly detection using Z-scores
   - Sustained degradation detection
   - Alert acknowledgment and resolution

3. **MetricsDashboard.ts** (`/workspaces/agentic-qe-cf/src/learning/dashboard/MetricsDashboard.ts`)
   - 277 lines
   - Display utilities for CLI
   - Formats metrics, trends, and alerts
   - Creates summary tables

4. **index.ts** (`/workspaces/agentic-qe-cf/src/learning/dashboard/index.ts`)
   - 8 lines
   - Currently only exports MetricsDashboard
   - Needs to export TrendAnalyzer and AlertManager

## Duplicate Files (Conflicting)

### Metrics Directory: `/src/learning/metrics/`

Duplicate implementations exist that may cause confusion:

1. **TrendAnalyzer.ts** (`/workspaces/agentic-qe-cf/src/learning/metrics/TrendAnalyzer.ts`)
   - Different implementation
   - May be referenced incorrectly

2. **AlertManager.ts** (`/workspaces/agentic-qe-cf/src/learning/metrics/AlertManager.ts`)
   - Different implementation
   - May be referenced incorrectly

**Action Required:** Consolidate or remove duplicates to avoid import confusion.

## Related Files

### Baseline System (Data Source)

**BaselineCollector.ts** (`/workspaces/agentic-qe-cf/src/learning/baselines/BaselineCollector.ts`)
- 528 lines
- Collects performance baselines
- Stores in `learning_baselines` table
- Primary data source for dashboard metrics

### Documentation

1. **Requirements** (`/workspaces/agentic-qe-cf/docs/examples/phase3-dashboard/REQUIREMENTS.md`)
   - Full specification for Phase 3 Dashboard
   - API examples
   - Database schema
   - Testing requirements

2. **Status Report** (`/workspaces/agentic-qe-cf/docs/reports/phase3-dashboard-status.md`)
   - Analysis of current vs requested implementation
   - Recommendations for next steps

3. **Implementation Summary** (`/workspaces/agentic-qe-cf/docs/reports/phase3-dashboard-implementation-summary.md`)
   - Detailed gap analysis
   - Code quality assessment
   - Fix recommendations with code examples

4. **This File** (`/workspaces/agentic-qe-cf/docs/reports/phase3-dashboard-files.md`)
   - Quick reference for file locations

## Database

**Location:** `/workspaces/agentic-qe-cf/.agentic-qe/memory.db`

**Relevant Tables:**
- `learning_baselines` - Performance baseline data (PRIMARY DATA SOURCE)
- `metric_trends` - Stored trend analyses
- `alerts` - Alert records
- `alert_rules` - Alert rule configuration
- `metric_forecasts` - Forecast data
- `metric_anomalies` - Detected anomalies

## Quick Access Commands

```bash
# View TrendAnalyzer
code /workspaces/agentic-qe-cf/src/learning/dashboard/TrendAnalyzer.ts

# View AlertManager
code /workspaces/agentic-qe-cf/src/learning/dashboard/AlertManager.ts

# View MetricsDashboard
code /workspaces/agentic-qe-cf/src/learning/dashboard/MetricsDashboard.ts

# View index
code /workspaces/agentic-qe-cf/src/learning/dashboard/index.ts

# View BaselineCollector (data source)
code /workspaces/agentic-qe-cf/src/learning/baselines/BaselineCollector.ts

# View database
sqlite3 /workspaces/agentic-qe-cf/.agentic-qe/memory.db

# List all dashboard files
ls -lah /workspaces/agentic-qe-cf/src/learning/dashboard/

# Check for duplicate files
ls -lah /workspaces/agentic-qe-cf/src/learning/metrics/TrendAnalyzer.ts
ls -lah /workspaces/agentic-qe-cf/src/learning/metrics/AlertManager.ts
```

## Import Statements (Correct)

When importing dashboard components, use:

```typescript
// Correct imports from dashboard
import { TrendAnalyzer } from './src/learning/dashboard/TrendAnalyzer';
import { AlertManager } from './src/learning/dashboard/AlertManager';
import { MetricsDashboard } from './src/learning/dashboard/MetricsDashboard';

// Or from index (after fixing)
import { 
  TrendAnalyzer, 
  AlertManager, 
  MetricsDashboard 
} from './src/learning/dashboard';
```

## Summary

✅ **All 4 requested files exist** in `/src/learning/dashboard/`

⚠️ **Implementation gaps:**
- Not querying from `learning_baselines` table
- Falls back to synthetic data
- Import path issues in MetricsDashboard
- Incomplete index.ts exports

📋 **Recommended action:**
Follow Option 1 from Implementation Summary to fix current implementation quickly (2-3 hours effort).

---

**Quick Links:**
- [Requirements](/workspaces/agentic-qe-cf/docs/examples/phase3-dashboard/REQUIREMENTS.md)
- [Status Report](/workspaces/agentic-qe-cf/docs/reports/phase3-dashboard-status.md)
- [Implementation Summary](/workspaces/agentic-qe-cf/docs/reports/phase3-dashboard-implementation-summary.md)
