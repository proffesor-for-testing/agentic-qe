# ADR-014: Background Workers for QE Monitoring

## Status

**Accepted** (2026-01-09)

## Context

Agentic QE v3 requires continuous monitoring and optimization of the quality engineering system. Manual intervention should be minimized while maintaining visibility into system health, test reliability, security posture, and compliance status.

The system needs to:
1. Monitor test suite health without manual triggers
2. Track coverage trends over time
3. Detect flaky tests proactively
4. Continuously scan for security vulnerabilities
5. Evaluate quality gates automatically
6. Consolidate learning patterns across domains
7. Predict potential defects before they manifest
8. Watch for regressions in metrics
9. Track performance baselines
10. Verify ADR and DDD compliance

## Decision

We will implement a background worker system with the following components:

### Architecture

```
                    ┌─────────────────────────────────────┐
                    │           QEDaemon                   │
                    │  - Start/Stop/Restart                │
                    │  - Health Monitoring                 │
                    │  - Worker Lifecycle                  │
                    └───────────────┬─────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────┐
                    │         WorkerManager               │
                    │  - Registration                      │
                    │  - Scheduling                        │
                    │  - Event Bus                         │
                    └───────────────┬─────────────────────┘
                                    │
        ┌───────────┬───────────────┼───────────────┬───────────┐
        │           │               │               │           │
        ▼           ▼               ▼               ▼           ▼
   ┌─────────┐ ┌─────────┐    ┌─────────┐    ┌─────────┐ ┌─────────┐
   │ Worker  │ │ Worker  │    │ Worker  │    │ Worker  │ │ Worker  │
   │   1     │ │   2     │    │   3     │    │   ...   │ │   10    │
   └─────────┘ └─────────┘    └─────────┘    └─────────┘ └─────────┘
```

### Worker Specifications

| Worker ID | Name | Interval | Priority | Description |
|-----------|------|----------|----------|-------------|
| `test-health` | Test Health Monitor | 5 min | high | Monitor test suite health metrics |
| `coverage-tracker` | Coverage Tracker | 10 min | high | Track coverage trends over time |
| `flaky-detector` | Flaky Test Detector | 15 min | high | Detect flaky test patterns |
| `security-scan` | Security Scanner | 30 min | critical | Security vulnerability scanning |
| `quality-gate` | Quality Gate Evaluator | 5 min | critical | Continuous gate evaluation |
| `learning-consolidation` | Learning Consolidation | 30 min | normal | Pattern consolidation |
| `defect-predictor` | Defect Predictor | 15 min | high | ML defect prediction |
| `regression-monitor` | Regression Monitor | 10 min | high | Watch for regressions |
| `performance-baseline` | Performance Baseline | 1 hour | normal | Performance trend tracking |
| `compliance-checker` | Compliance Checker | 30 min | normal | ADR/DDD compliance checking |

### Implementation Details

#### BaseWorker Abstract Class
All workers extend `BaseWorker` which provides:
- Retry logic with configurable attempts and delay
- Timeout handling
- Abort signal support
- Health tracking (success rate, duration metrics)
- Event publishing

#### WorkerManager
- Registers and manages worker lifecycle
- Schedules workers at configured intervals
- Provides immediate execution via `runNow()`
- Tracks aggregate health metrics
- Event bus for cross-worker communication

#### QEDaemon
- Singleton daemon process management
- Auto-start on initialization (configurable)
- Health check monitoring
- Worker filtering by enabled list

### Worker Result Format

Each worker produces a standardized result:
```typescript
interface WorkerResult {
  workerId: string;
  timestamp: Date;
  durationMs: number;
  success: boolean;
  error?: string;
  metrics: WorkerMetrics;
  findings: WorkerFinding[];
  recommendations: WorkerRecommendation[];
}
```

### Domain Integration

Workers interact with domains through the `WorkerContext`:
- `eventBus`: Publish findings as domain events
- `memory`: Store results and historical data
- `logger`: Structured logging
- `domains`: Access domain APIs and health status

## Consequences

### Positive

1. **Continuous Monitoring**: System health is monitored 24/7 without manual intervention
2. **Early Detection**: Issues are caught before they impact users
3. **Standardized Output**: All workers produce consistent, actionable results
4. **Configurable**: Workers can be enabled/disabled and intervals adjusted
5. **Observable**: Health metrics exposed for dashboards and alerting
6. **Extensible**: New workers can be added by extending `BaseWorker`

### Negative

1. **Resource Usage**: Background workers consume CPU and memory
2. **Complexity**: Additional infrastructure to maintain
3. **Timing Sensitivity**: Intervals must be tuned for optimal performance

### Mitigations

1. Workers have configurable intervals and can be disabled
2. Priority system ensures critical workers run first
3. Timeout and retry logic prevents runaway executions
4. Health checks identify underperforming workers

## Implementation

### Files Created

```
v3/src/workers/
├── index.ts                    # Main exports
├── interfaces.ts               # Type definitions
├── base-worker.ts              # Abstract base class
├── worker-manager.ts           # Manager implementation
├── daemon.ts                   # Daemon process
└── workers/
    ├── index.ts                # Worker exports
    ├── test-health.ts          # Test health monitoring
    ├── coverage-tracker.ts     # Coverage tracking
    ├── flaky-detector.ts       # Flaky test detection
    ├── security-scan.ts        # Security scanning
    ├── quality-gate.ts         # Quality gate evaluation
    ├── learning-consolidation.ts # Pattern consolidation
    ├── defect-predictor.ts     # Defect prediction
    ├── regression-monitor.ts   # Regression monitoring
    ├── performance-baseline.ts # Performance tracking
    └── compliance-checker.ts   # Compliance checking
```

### Tests

```
v3/tests/unit/workers/
├── base-worker.test.ts         # 23 tests
├── worker-manager.test.ts      # 20 tests
└── daemon.test.ts              # 23 tests
```

**Total: 66 tests passing**

## Usage

### Starting the Daemon

```typescript
import { createDaemon, getDaemon } from '@agentic-qe/v3/workers';

// Create and start daemon
const daemon = createDaemon({
  autoStart: true,
  enabledWorkers: [], // Empty = all workers
  logLevel: 'info',
  healthCheckIntervalMs: 60000,
});

await daemon.start();

// Or use singleton
const daemon = getDaemon();
await daemon.start();
```

### Running a Worker Manually

```typescript
const daemon = getDaemon();
await daemon.runWorker('test-health');
```

### Checking Status

```typescript
const status = daemon.getStatus();
console.log({
  running: status.running,
  uptime: status.uptime,
  workers: status.workerManager.totalWorkers,
  healthScore: status.workerManager.healthScore,
});
```

### Creating a Custom Worker

```typescript
import { BaseWorker, WorkerConfig, WorkerContext, WorkerResult } from '@agentic-qe/v3/workers';

class CustomWorker extends BaseWorker {
  constructor() {
    super({
      id: 'custom-worker',
      name: 'Custom Worker',
      description: 'My custom worker',
      intervalMs: 10 * 60 * 1000,
      priority: 'normal',
      targetDomains: ['test-execution'],
      enabled: true,
      timeoutMs: 60000,
      retryCount: 2,
      retryDelayMs: 5000,
    });
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    // Implementation
    return this.createResult(durationMs, metrics, findings, recommendations);
  }
}
```

## References

- [v3 Architecture Overview](./overview.md)
- [DDD Domains Documentation](./ddd-domains.md)
- [Claude Flow Hooks System](https://github.com/ruvnet/claude-flow)

## Decision Record

- **Date**: 2026-01-09
- **Author**: Agentic QE Team
- **Status**: Accepted
- **Supersedes**: None
