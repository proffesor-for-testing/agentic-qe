# Phase 3 Dashboard Requirements

## Overview

Create dashboard components for the Nightly-Learner system that provide visibility into learning metrics, trends, and alerts.

## Directory Structure

```
src/learning/dashboard/
├── TrendAnalyzer.ts      - Analyze trends using moving averages
├── AlertManager.ts        - Alert on anomalies
├── MetricsDashboard.ts    - Main dashboard service
└── index.ts              - Export all
```

## 1. TrendAnalyzer.ts

### Purpose
Analyze trends in learning metrics over time.

### Key Features
- Calculate trends using moving averages (SMA, EMA)
- Detect significant changes (>10% deviation)
- Generate forecasts
- Support daily/weekly/monthly periods

### Implementation Requirements

**Moving Averages:**
- Simple Moving Average (SMA): Average of last N values
- Exponential Moving Average (EMA): Weighted average favoring recent values
- Configurable window size (default: 7)

**Trend Detection:**
- `upward`: Positive slope, increasing values
- `downward`: Negative slope, decreasing values
- `stable`: Near-zero slope, minimal change

**Significant Changes:**
- Threshold: 10% deviation from trend
- Compare actual value vs expected (from linear regression)
- Flag any point exceeding threshold

**Forecasting:**
- Use linear regression to project future values
- Calculate confidence intervals (95%)
- Confidence decreases with distance from data

**Data Source:**
- Primary: `learning_baselines` table
- Metrics: `success_rate`, `avg_completion_time`, `coverage_achieved`, `pattern_recall_accuracy`

### API Example

```typescript
const analyzer = new TrendAnalyzer();

// Calculate trend for a metric
const trend = await analyzer.calculateTrend('success_rate', 'daily', 30);
console.log(`Trend: ${trend.direction}, Change: ${trend.changePercent.toFixed(1)}%`);

// Detect anomalies
const anomalies = await analyzer.detectAnomalies('completion_time', 7);
console.log(`Found ${anomalies.length} anomalies`);

// Generate forecast
const forecast = await analyzer.forecast('coverage', trend.id, 7);
console.log(`Predicted value in 7 days: ${forecast.predictedValue.toFixed(1)}`);
```

## 2. AlertManager.ts

### Purpose
Alert on anomalies and performance degradation.

### Key Features
- Define thresholds for key metrics
- Detect sudden drops (>15% in single cycle)
- Detect sustained degradation (>10% over multiple cycles)
- Categories: performance, quality, system
- Persist alerts to database

### Alert Conditions

**Sudden Drop:**
- Compare current value vs previous value
- Threshold: 15% decrease in single cycle
- Severity: Based on magnitude (15% = low, 30% = high, 45% = critical)

**Sustained Degradation:**
- Compare current value vs baseline N cycles ago
- Threshold: 10% decrease over 3+ cycles
- Indicates persistent performance issues

**Threshold Violations:**
- Min/max absolute thresholds per metric
- Example: success_rate min 70%, completion_time max 30s

### Default Thresholds

**Performance Metrics:**
- `success_rate`: min 0.7, sudden drop 15%, sustained drop 10%
- `completion_time`: max 30000ms, sudden drop 20%, sustained drop 15%

**Quality Metrics:**
- `coverage`: min 70%, sudden drop 15%, sustained drop 10%
- `pattern_recall`: min 0.6, sudden drop 15%, sustained drop 10%

### API Example

```typescript
const alertManager = new AlertManager();

// Check metrics and generate alerts
const alerts = await alertManager.checkMetrics();
console.log(`Generated ${alerts.length} alerts`);

// Get active alerts
const active = alertManager.getActiveAlerts();
console.log(`${active.length} active alerts`);

// Acknowledge an alert
alertManager.acknowledgeAlert(alert.id, 'Investigating...');

// Resolve an alert
alertManager.resolveAlert(alert.id, 'Fixed by retraining');
```

## 3. MetricsDashboard.ts

### Purpose
Main dashboard service that aggregates metrics, trends, and alerts.

### Key Features
- Aggregate metrics from multiple sources
- Combine with trend analysis
- Surface active alerts
- Provide unified dashboard view

### API Example

```typescript
const dashboard = new MetricsDashboard();

// Get complete dashboard summary
const summary = await dashboard.getSummary();
console.log('Metrics:', summary.metrics);
console.log('Trends:', summary.trends);
console.log('Alerts:', summary.alerts);

// Get dashboard for specific agent
const agentDashboard = await dashboard.getAgentDashboard('test-generator');

// Get dashboard for time period
const weeklyDashboard = await dashboard.getPeriodDashboard('weekly');
```

## Database Schema

### Trend Storage

```sql
CREATE TABLE IF NOT EXISTS metric_trends (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  period TEXT NOT NULL,
  direction TEXT NOT NULL,
  slope REAL NOT NULL,
  confidence REAL NOT NULL,
  moving_average REAL NOT NULL,
  current_value REAL NOT NULL,
  previous_value REAL NOT NULL,
  change_percent REAL NOT NULL,
  significant_change INTEGER NOT NULL,
  data_points TEXT NOT NULL,
  calculated_at INTEGER NOT NULL
);
```

### Alert Storage

```sql
CREATE TABLE IF NOT EXISTS learning_alerts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  agent_type TEXT,
  actual_value REAL,
  expected_value REAL,
  threshold REAL,
  triggered_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  resolved_at INTEGER,
  metadata TEXT
);
```

### Forecast Storage

```sql
CREATE TABLE IF NOT EXISTS metric_forecasts (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  forecast_date INTEGER NOT NULL,
  predicted_value REAL NOT NULL,
  confidence REAL NOT NULL,
  lower_bound REAL NOT NULL,
  upper_bound REAL NOT NULL,
  based_on_trend TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (based_on_trend) REFERENCES metric_trends(id)
);
```

## Integration with Existing Systems

### Data Sources
- `learning_baselines` table - Performance baselines from Phase 0
- `dream_insights` table - Insights from Phase 2
- `synthesized_patterns` table - Patterns from Phase 2
- `transfer_results` table - Transfer outcomes from Phase 2

### Usage in CLI

```bash
# View dashboard
aqe learn dashboard

# View trends
aqe learn dashboard --trends

# View alerts
aqe learn dashboard --alerts

# View specific agent
aqe learn dashboard --agent test-generator

# View specific period
aqe learn dashboard --period weekly
```

## Testing Requirements

### Unit Tests
- Moving average calculations (SMA, EMA)
- Linear regression accuracy
- Anomaly detection thresholds
- Alert rule evaluation
- Forecast confidence intervals

### Integration Tests
- Query learning_baselines table
- Store and retrieve trends
- Generate and manage alerts
- Dashboard aggregation logic

### Test Data
- Use BaselineCollector to generate test baselines
- Create known trend patterns (upward, downward, stable)
- Simulate alert conditions (sudden drops, sustained degradation)

## Performance Targets

- Trend calculation: <100ms for 30 days of data
- Anomaly detection: <50ms per metric
- Alert checking: <200ms for all metrics
- Dashboard summary: <500ms complete

## References

Follow patterns from:
- `/src/learning/dream/InsightGenerator.ts` - Database integration
- `/src/learning/baselines/BaselineCollector.ts` - Metrics calculation
- `/src/learning/scheduler/SleepCycle.ts` - Phase integration
