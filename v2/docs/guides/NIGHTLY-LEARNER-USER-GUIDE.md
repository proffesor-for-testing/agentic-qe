# Nightly-Learner System User Guide

## Overview

The Nightly-Learner is an autonomous learning system for the Agentic QE Fleet that enables agents to learn from their experiences, discover patterns, and continuously improve their performance. The system operates in phases during low-activity periods (like overnight), processing agent experiences to generate insights and optimizations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Nightly-Learner System                          │
├─────────────────────────────────────────────────────────────────────┤
│  Phase 0: Baselines     │  Phase 1: Experience Capture              │
│  ├─ StandardTaskSuite   │  ├─ ExperienceCapture                     │
│  └─ BaselineCollector   │  └─ Agent Integration                     │
├─────────────────────────┼───────────────────────────────────────────┤
│  Phase 2: Dream Engine  │  Phase 3: Metrics & Dashboard             │
│  ├─ ConceptGraph        │  ├─ LearningMetrics                       │
│  ├─ PatternSynthesizer  │  ├─ TrendAnalyzer                         │
│  ├─ InsightGenerator    │  ├─ AlertManager                          │
│  └─ TransferProtocol    │  └─ MetricsDashboard                      │
├─────────────────────────┴───────────────────────────────────────────┤
│  SleepCycle Scheduler - Orchestrates all phases                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Initialize the Learning System

```bash
# Initialize with default settings
npx aqe learn init

# Initialize with custom schedule (2 AM daily)
npx aqe learn init --schedule "0 2 * * *"
```

### Check Learning Status

```bash
# View overall learning status
npx aqe learn status

# View status for specific agent type
npx aqe learn status --agent test-generator

# View detailed metrics
npx aqe learn status --verbose
```

### View Learning Metrics

```bash
# View all metrics
npx aqe learn metrics

# View trends
npx aqe learn trends

# View active alerts
npx aqe learn alerts
```

## Phase 0: Baselines

### Purpose

Establishes performance baselines for all 19 QE agent types using standardized tasks. These baselines serve as the foundation for measuring learning progress and setting improvement targets.

### Components

#### StandardTaskSuite

Defines 10 standard tasks per agent type (180 tasks total) covering typical workloads:

```typescript
import { StandardTaskSuite } from 'agentic-qe/learning/baselines';
import { QEAgentType } from 'agentic-qe';

const suite = new StandardTaskSuite();

// Get all tasks for an agent type
const tasks = suite.getTasksForAgent(QEAgentType.TEST_GENERATOR);

// Get task count
console.log(`Total tasks: ${suite.getTotalTaskCount()}`); // 180
console.log(`Test Generator tasks: ${suite.getTaskCount(QEAgentType.TEST_GENERATOR)}`); // 10
```

#### BaselineCollector

Collects and stores performance baselines:

```typescript
import { BaselineCollector } from 'agentic-qe/learning/baselines';

const collector = new BaselineCollector();
await collector.initialize();

// Collect baseline for an agent type
const baseline = await collector.collectBaseline(
  'agent-001',
  QEAgentType.TEST_GENERATOR,
  'unit-test-generation'
);

console.log(`Success Rate: ${baseline.metrics.successRate * 100}%`);
console.log(`Avg Time: ${baseline.metrics.avgCompletionTime}ms`);

// Get improvement targets
const target = collector.getImprovementTarget(baseline);
console.log(`Target Success Rate: ${target.targets.targetSuccessRate * 100}%`);
```

### Baseline Metrics

| Metric | Description | Target Improvement |
|--------|-------------|-------------------|
| `avgCompletionTime` | Average task completion time (ms) | 20% faster |
| `successRate` | Ratio of successful completions | 20% higher |
| `patternRecallAccuracy` | Accuracy of pattern application | 20% higher |
| `coverageAchieved` | Test coverage percentage | 20% higher |

## Phase 1: Experience Capture

### Purpose

Captures agent execution experiences in real-time for later analysis by the Dream Engine.

### Integration with Agents

All QE agents automatically capture experiences through the `ExperienceCapture` singleton:

```typescript
import { ExperienceCapture } from 'agentic-qe/learning/capture';

// Experiences are automatically captured during agent execution
const capture = ExperienceCapture.getInstance();
```

## Phase 2: Dream Engine

### Purpose

The Dream Engine processes captured experiences during sleep cycles to:
- Build concept graphs from experience patterns
- Synthesize new patterns from successful executions
- Generate actionable insights
- Transfer learning across agent types

### Running Dream Cycles

```bash
# Manually trigger a dream cycle
npx aqe dream run

# Run with specific phases
npx aqe dream run --phases concept,synthesize,insight

# Run with verbose output
npx aqe dream run --verbose
```

## Phase 3: Metrics & Dashboard

### Purpose

Provides visibility into learning progress through metrics collection, trend analysis, and alerting.

### TrendAnalyzer

Analyzes trends using moving averages:

```typescript
import { TrendAnalyzer } from 'agentic-qe/learning/dashboard';

const analyzer = new TrendAnalyzer();

// Calculate trend for a metric
const trend = await analyzer.calculateTrend('success_rate', 'daily', 30);
console.log(`Direction: ${trend.direction}`); // upward, downward, stable
console.log(`Change: ${trend.changePercent.toFixed(1)}%`);

// Detect anomalies
const anomalies = await analyzer.detectAnomalies('completion_time', 7);
```

### AlertManager

Monitors metrics and generates alerts:

```typescript
import { AlertManager } from 'agentic-qe/learning/dashboard';

const alertManager = new AlertManager();

// Check metrics and generate alerts
const alerts = await alertManager.checkMetrics();

// Get active alerts
const active = alertManager.getActiveAlerts();

// Acknowledge an alert
alertManager.acknowledgeAlert(alert.id, 'Investigating...');

// Resolve an alert
alertManager.resolveAlert(alert.id, 'Fixed by retraining');
```

### Alert Thresholds

| Metric | Sudden Drop | Sustained Drop | Min Value |
|--------|------------|----------------|-----------|
| `success_rate` | 15% | 10% over 3 cycles | 70% |
| `completion_time` | 20% slower | 15% over 3 cycles | - |
| `coverage` | 15% | 10% over 3 cycles | 70% |
| `pattern_recall` | 15% | 10% over 3 cycles | 60% |

### CLI Commands

```bash
# View metrics summary
npx aqe learn metrics

# View trend analysis
npx aqe learn trends

# View alerts
npx aqe learn alerts
npx aqe learn alerts --severity high
```

## SleepCycle Scheduler

### Purpose

Orchestrates all learning phases during low-activity periods.

### Configuration

```typescript
import { SleepCycle } from 'agentic-qe/learning/scheduler';

const sleepCycle = new SleepCycle({
  schedule: '0 2 * * *',  // 2 AM daily
  phases: ['baseline', 'capture', 'dream', 'metrics'],
  maxDuration: 4 * 60 * 60 * 1000, // 4 hours max
  enabled: true
});

await sleepCycle.initialize();
await sleepCycle.start();
```

### Manual Execution

```bash
# Run a complete sleep cycle
npx aqe learn cycle

# Run specific phases
npx aqe learn cycle --phases baseline,dream
```

## Database Schema

All learning data is stored in `.agentic-qe/memory.db`:

| Table | Purpose |
|-------|---------|
| `learning_baselines` | Performance baselines |
| `baseline_executions` | Individual execution records |
| `agent_experiences` | Captured experiences |
| `concept_nodes` | Concept graph nodes |
| `concept_edges` | Concept graph relationships |
| `synthesized_patterns` | Discovered patterns |
| `dream_insights` | Generated insights |
| `transfer_results` | Transfer learning outcomes |
| `metric_trends` | Calculated trends |
| `learning_alerts` | Alert records |
| `dream_cycles` | Sleep cycle history |

## Best Practices

### 1. Regular Baseline Updates

Run baseline collection weekly to track improvement:

```bash
npx aqe learn baseline --all-agents
```

### 2. Monitor Alert Dashboard

Check alerts daily for performance issues:

```bash
npx aqe learn alerts --unacknowledged
```

### 3. Review Insights

Periodically review generated insights:

```bash
npx aqe learn insights --confidence 0.8
```

## Troubleshooting

### Learning System Not Starting

```bash
# Check if database exists
ls -la .agentic-qe/memory.db

# Reinitialize if needed
npx aqe learn init --force
```

### No Experiences Being Captured

```bash
# Verify agent integration
npx aqe learn status --verbose

# Check experience count
sqlite3 .agentic-qe/memory.db "SELECT COUNT(*) FROM agent_experiences"
```

### Dream Cycle Failing

```bash
# View dream cycle logs
npx aqe learn history --last --verbose

# Run with debug output
DEBUG=agentic-qe:* npx aqe dream run
```

## API Reference

### BaselineCollector

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize the collector |
| `collectBaseline(agentId, agentType, taskType)` | Collect baseline |
| `getBaseline(agentType, taskType)` | Get stored baseline |
| `getImprovementTarget(baseline)` | Calculate improvement target |
| `meetsImprovementTarget(current, baseline)` | Check if target met |

### StandardTaskSuite

| Method | Description |
|--------|-------------|
| `getTasksForAgent(agentType)` | Get all tasks for agent |
| `getTaskCount(agentType)` | Get task count |
| `getTotalTaskCount()` | Get total tasks (180) |
| `getTask(taskId)` | Get specific task |

### TrendAnalyzer

| Method | Description |
|--------|-------------|
| `calculateTrend(metric, period, days)` | Calculate trend |
| `detectAnomalies(metric, days)` | Detect anomalies |
| `forecast(metric, trendId, daysAhead)` | Generate forecast |

### AlertManager

| Method | Description |
|--------|-------------|
| `checkMetrics()` | Check and generate alerts |
| `getActiveAlerts(category?)` | Get active alerts |
| `acknowledgeAlert(id, note)` | Acknowledge alert |
| `resolveAlert(id, resolution)` | Resolve alert |

---

**Agentic QE Fleet - Nightly-Learner System v1.0.0**

*Continuous learning for continuous quality*
