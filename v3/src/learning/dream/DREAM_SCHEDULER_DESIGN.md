# DreamScheduler Design Document

**Version**: 1.0.0
**Status**: Design Phase
**Author**: Architecture Agent
**Date**: 2026-01-26
**ADR Reference**: Extends ADR-021 (QE ReasoningBank - Dream Cycle Integration)

---

## 1. Overview

The DreamScheduler provides automatic dream cycle scheduling for Agentic QE v3. It orchestrates when dreams should occur based on experience accumulation, quality gate failures, and time-based intervals. This design follows the v3 dependency injection pattern and integrates with the existing DreamEngine, PersistentSONAEngine, and EventBus infrastructure.

### 1.1 Goals

1. **Automatic Scheduling**: Trigger dream cycles without manual intervention
2. **Event-Driven**: React to quality gate failures for immediate correlation search
3. **Experience-Based**: Dream after sufficient experience accumulation
4. **Time-Based Fallback**: Ensure periodic dreaming even during low activity
5. **Resource-Aware**: Respect system resources and concurrent operation limits

### 1.2 Non-Goals

- Does NOT replace manual dream triggering (still available via DreamEngine)
- Does NOT modify the dream cycle algorithm (handled by DreamEngine)
- Does NOT persist dream schedules across restarts (recalculates on init)

---

## 2. Architecture

### 2.1 High-Level Architecture Diagram

```
+------------------------------------------------------------------+
|                         EventBus                                  |
|  +------------------+  +------------------+  +-----------------+  |
|  | QualityGate      |  | ExperienceCaptured|  | TestRunCompleted| |
|  | Evaluated        |  |                  |  |                 |  |
|  +--------+---------+  +--------+---------+  +--------+--------+  |
|           |                     |                     |           |
+-----------+---------------------+---------------------+-----------+
            |                     |                     |
            v                     v                     v
+------------------------------------------------------------------+
|                      DreamScheduler                               |
|                                                                   |
|  +-------------------+  +-------------------+  +----------------+ |
|  | TriggerEvaluator  |  | ScheduleManager   |  | ResourceGuard  | |
|  |                   |  |                   |  |                | |
|  | - Quality gate    |  | - Time intervals  |  | - Memory check | |
|  |   failure check   |  | - Next dream time |  | - CPU check    | |
|  | - Experience      |  | - Cooldown mgmt   |  | - Lock acquire | |
|  |   threshold check |  |                   |  |                | |
|  +--------+----------+  +--------+----------+  +--------+-------+ |
|           |                     |                     |           |
|           +----------+----------+----------+----------+           |
|                      |                     |                      |
|                      v                     v                      |
|               +------+------+       +------+------+               |
|               | DreamEngine |       | Experience  |               |
|               | (injected)  |       | CaptureStats|               |
|               +-------------+       +-------------+               |
+------------------------------------------------------------------+
            |
            v
+------------------------------------------------------------------+
|                    Learning Coordinator                           |
|  +-------------------+  +-------------------+                     |
|  | PersistentSONA    |  | PatternStore      |                     |
|  | Engine            |  |                   |                     |
|  +-------------------+  +-------------------+                     |
+------------------------------------------------------------------+
```

### 2.2 Component Flow Diagram

```
    +---------------+
    | System Start  |
    +-------+-------+
            |
            v
    +-------+--------+
    | Initialize     |
    | DreamScheduler |
    +-------+--------+
            |
            +----------------+----------------+
            |                |                |
            v                v                v
    +-------+------+  +------+------+  +------+-------+
    | Subscribe to |  | Start Time  |  | Load Last    |
    | Events       |  | Scheduler   |  | Dream Stats  |
    +-------+------+  +------+------+  +------+-------+
            |                |                |
            +----------------+----------------+
            |
            v
    +-------+---------+
    | Scheduler Loop  |<----------------------------------+
    +-------+---------+                                   |
            |                                             |
            v                                             |
    +-------+--------+                                    |
    | Check Triggers |                                    |
    +-------+--------+                                    |
            |                                             |
            +--------+--------+--------+                  |
            |        |        |        |                  |
            v        v        v        v                  |
    +-------+--+ +---+---+ +--+----+ +--+-----+          |
    | Quality  | | Exp.  | | Time  | | Manual |          |
    | Failure  | | Count | | Based | | Request|          |
    +-------+--+ +---+---+ +--+----+ +--+-----+          |
            |        |        |        |                  |
            +--------+--------+--------+                  |
            |                                             |
            v                                             |
    +-------+---------+    +---------------+              |
    | Trigger Fired?  |-No>| Wait Interval +------------->+
    +-------+---------+    +---------------+
            |Yes
            v
    +-------+---------+
    | Check Resources |
    +-------+---------+
            |
            v
    +-------+---------+    +---------------+
    | Resources OK?   |-No>| Queue Pending +------------->+
    +-------+---------+    +---------------+
            |Yes
            v
    +-------+---------+
    | Execute Dream   |
    | via DreamEngine |
    +-------+---------+
            |
            v
    +-------+---------+
    | Process Results |
    | Update Stats    |
    +-------+---------+
            |
            v
    +-------+---------+
    | Set Cooldown    |
    +-------+---------+
            |
            +-------------------------------------------->+
```

---

## 3. Interface Definitions

### 3.1 DreamScheduler Interface

```typescript
/**
 * Configuration for the DreamScheduler
 */
export interface DreamSchedulerConfig {
  /**
   * Time-based scheduling interval in milliseconds
   * Default: 3600000 (1 hour)
   * Set to 0 to disable time-based scheduling
   */
  scheduleIntervalMs: number;

  /**
   * Minimum experiences required before triggering dream
   * Default: 20
   */
  experienceThreshold: number;

  /**
   * Trigger dream immediately on quality gate failure
   * Default: true
   */
  dreamOnQualityFailure: boolean;

  /**
   * Cooldown period after a dream cycle (milliseconds)
   * Prevents too frequent dreaming
   * Default: 600000 (10 minutes)
   */
  cooldownMs: number;

  /**
   * Maximum dream duration before timeout (milliseconds)
   * Default: 60000 (60 seconds)
   */
  maxDreamDurationMs: number;

  /**
   * Whether to enable automatic scheduling
   * Default: true
   */
  enabled: boolean;

  /**
   * Maximum pending dreams to queue
   * Default: 3
   */
  maxPendingDreams: number;

  /**
   * Time window for experience counting (milliseconds)
   * Only experiences within this window count toward threshold
   * Default: 86400000 (24 hours)
   */
  experienceWindowMs: number;
}

/**
 * Dream trigger types
 */
export type DreamTriggerType =
  | 'scheduled'        // Time-based interval trigger
  | 'experience'       // Experience accumulation threshold
  | 'quality-failure'  // Quality gate failure
  | 'manual';          // Manual request

/**
 * Dream trigger event
 */
export interface DreamTrigger {
  type: DreamTriggerType;
  timestamp: Date;
  reason: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
}

/**
 * Scheduler status
 */
export interface DreamSchedulerStatus {
  /** Whether scheduler is currently enabled */
  enabled: boolean;

  /** Whether a dream is currently running */
  dreaming: boolean;

  /** Current pending dreams in queue */
  pendingDreams: number;

  /** Last dream completion time */
  lastDreamAt?: Date;

  /** Next scheduled dream time */
  nextScheduledDream?: Date;

  /** Current experience count in window */
  currentExperienceCount: number;

  /** Experience threshold for trigger */
  experienceThreshold: number;

  /** Time until cooldown expires (ms), 0 if not in cooldown */
  cooldownRemainingMs: number;

  /** Dream statistics */
  stats: DreamSchedulerStats;
}

/**
 * Scheduler statistics
 */
export interface DreamSchedulerStats {
  /** Total dreams scheduled */
  totalDreamsScheduled: number;

  /** Dreams completed successfully */
  dreamsCompleted: number;

  /** Dreams failed */
  dreamsFailed: number;

  /** Dreams skipped (cooldown/resources) */
  dreamsSkipped: number;

  /** By trigger type */
  byTrigger: Record<DreamTriggerType, number>;

  /** Average dream duration (ms) */
  avgDreamDurationMs: number;

  /** Total insights generated */
  totalInsights: number;
}

/**
 * Dream schedule request
 */
export interface DreamScheduleRequest {
  /** Trigger type */
  trigger: DreamTriggerType;

  /** Priority level */
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  /** Force immediate execution (bypasses cooldown) */
  force?: boolean;

  /** Custom dream duration override (ms) */
  durationMs?: number;

  /** Correlation ID for tracing */
  correlationId?: string;

  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Dream schedule result
 */
export interface DreamScheduleResult {
  /** Whether dream was scheduled/executed */
  scheduled: boolean;

  /** Dream cycle ID if started */
  dreamId?: string;

  /** If not scheduled, reason why */
  reason?: string;

  /** Position in queue if pending */
  queuePosition?: number;
}

/**
 * Main DreamScheduler interface
 */
export interface IDreamScheduler extends Initializable, Disposable {
  /**
   * Get current scheduler status
   */
  getStatus(): DreamSchedulerStatus;

  /**
   * Get scheduler configuration
   */
  getConfig(): DreamSchedulerConfig;

  /**
   * Update configuration (partial update supported)
   */
  updateConfig(config: Partial<DreamSchedulerConfig>): void;

  /**
   * Enable the scheduler
   */
  enable(): void;

  /**
   * Disable the scheduler (completes current dream if running)
   */
  disable(): Promise<void>;

  /**
   * Request a dream manually
   */
  requestDream(request?: Partial<DreamScheduleRequest>): Promise<DreamScheduleResult>;

  /**
   * Cancel pending dreams
   */
  cancelPending(): number;

  /**
   * Get pending dream queue
   */
  getPendingDreams(): DreamTrigger[];

  /**
   * Force reset cooldown
   */
  resetCooldown(): void;

  /**
   * Subscribe to dream events
   */
  onDreamStart(handler: (trigger: DreamTrigger) => void): () => void;
  onDreamComplete(handler: (result: DreamCycleResult) => void): () => void;
  onDreamFailed(handler: (error: Error, trigger: DreamTrigger) => void): () => void;
}

/**
 * Required external dependencies (injected)
 */
export interface DreamSchedulerDependencies {
  /** Event bus for subscribing to domain events */
  eventBus: EventBus;

  /** Dream engine for executing dreams */
  dreamEngine: DreamEngine;

  /** Experience capture service for counting experiences */
  experienceCapture: ExperienceCaptureService;

  /** Memory backend for stats persistence (optional) */
  memory?: MemoryBackend;
}
```

### 3.2 Event Subscriptions

The DreamScheduler subscribes to the following domain events:

```typescript
// Quality gate evaluation - triggers dream on failure
'quality-assessment.QualityGateEvaluated' -> handleQualityGateEvent(payload: QualityGatePayload)

// Experience captured - tracks for threshold
'learning.ExperienceCaptured' -> handleExperienceCaptured(payload: { experience: TaskExperience })

// Test run completed - tracks for threshold
'test-execution.TestRunCompleted' -> handleTestRunCompleted(payload: TestRunCompletedPayload)
```

### 3.3 Published Events

The DreamScheduler publishes:

```typescript
// New events to add to domain-events.ts
export const DreamSchedulerEvents = {
  DreamScheduled: 'learning-optimization.DreamScheduled',
  DreamStarted: 'learning-optimization.DreamStarted',
  DreamCompleted: 'learning-optimization.DreamCompleted',
  DreamFailed: 'learning-optimization.DreamFailed',
  DreamSkipped: 'learning-optimization.DreamSkipped',
} as const;

export interface DreamScheduledPayload {
  trigger: DreamTriggerType;
  priority: string;
  dreamId?: string;
  scheduledFor: Date;
}

export interface DreamCompletedPayload {
  dreamId: string;
  trigger: DreamTriggerType;
  durationMs: number;
  insightsGenerated: number;
  associationsFound: number;
}

export interface DreamFailedPayload {
  dreamId?: string;
  trigger: DreamTriggerType;
  error: string;
}

export interface DreamSkippedPayload {
  trigger: DreamTriggerType;
  reason: 'cooldown' | 'resources' | 'disabled' | 'queue_full';
}
```

---

## 4. Trigger Conditions

### 4.1 Time-Based Trigger

**When**: Interval timer fires (default: every 1 hour)

**Rationale**: Ensures the system consolidates learnings regularly, even during low activity periods. Sleep research shows periodic consolidation is essential for long-term memory formation.

**Priority**: `low`

**Configuration**:
- `scheduleIntervalMs`: Interval between scheduled dreams
- Can be disabled by setting to 0

### 4.2 Experience Accumulation Trigger

**When**: Experience count within window exceeds threshold (default: 20 experiences in 24 hours)

**Rationale**: After significant learning activity, the system should consolidate patterns. This mirrors how the brain consolidates information after intensive learning sessions.

**Priority**: `normal`

**Configuration**:
- `experienceThreshold`: Minimum experiences required
- `experienceWindowMs`: Time window for counting

**Implementation**:
```typescript
// Experience types that count toward threshold:
// 1. TaskExperience from ExperienceCaptureService (learning.ExperienceCaptured)
// 2. Test executions (test-execution.TestRunCompleted)
// 3. Quality assessments (quality-assessment.QualityGateEvaluated)
```

### 4.3 Quality Gate Failure Trigger

**When**: A quality gate fails (`QualityGateEvaluated` with `passed: false`)

**Rationale**: Quality gate failures indicate potential issues. Running a dream cycle immediately can help find correlations between recent changes and failures, potentially identifying root causes through pattern association.

**Priority**: `high`

**Configuration**:
- `dreamOnQualityFailure`: Enable/disable this trigger

**Special Behavior**:
- Bypasses normal cooldown (but respects minimum 1-minute gap)
- Adds gate failure context to dream metadata
- Prioritizes patterns related to failing checks

### 4.4 Manual Request Trigger

**When**: Explicit call to `requestDream()`

**Rationale**: Allows operators or automated systems to trigger dreams on-demand.

**Priority**: Configurable (default: `normal`, can be set to `urgent`)

**Options**:
- `force: true` bypasses all cooldowns
- Custom duration override available

---

## 5. Integration Points

### 5.1 LearningOptimizationCoordinator Integration

The DreamScheduler integrates with the existing `LearningOptimizationCoordinator`:

```typescript
// In LearningOptimizationCoordinator constructor (updated)
constructor(
  private readonly eventBus: EventBus,
  private readonly memory: MemoryBackend,
  private readonly agentCoordinator: AgentCoordinator,
  private readonly dreamScheduler?: IDreamScheduler, // NEW: Optional dream scheduler
  config: Partial<LearningCoordinatorConfig> = {}
) {
  // ...existing code...
}

// Integration method
async runDreamCycle(): Promise<Result<DreamCycleResult>> {
  if (this.dreamScheduler) {
    const result = await this.dreamScheduler.requestDream({
      trigger: 'manual',
      priority: 'normal',
    });

    if (!result.scheduled) {
      return err(new Error(result.reason));
    }

    // Dream is running, result will come via events
  }
  // Fallback to direct DreamEngine call if no scheduler
}
```

### 5.2 ExperienceCaptureService Integration

The scheduler tracks experiences through event subscription, not direct coupling:

```typescript
// Event handler in DreamScheduler
private handleExperienceCaptured(event: {
  payload: { experience: TaskExperience }
}): void {
  const { experience } = event.payload;

  // Only count high-quality successful experiences
  if (experience.success && experience.quality >= 0.5) {
    this.incrementExperienceCount();
    this.checkExperienceThreshold();
  }
}
```

### 5.3 DreamEngine Integration

Direct dependency injection:

```typescript
// In DreamScheduler
constructor(
  private readonly deps: DreamSchedulerDependencies,
  config?: Partial<DreamSchedulerConfig>
) {
  // Validate required dependencies
  if (!deps.dreamEngine) {
    throw new Error('DreamEngine is required');
  }
  if (!deps.eventBus) {
    throw new Error('EventBus is required');
  }
  if (!deps.experienceCapture) {
    throw new Error('ExperienceCaptureService is required');
  }
}

// Dream execution
private async executeDream(trigger: DreamTrigger): Promise<DreamCycleResult> {
  const engine = this.deps.dreamEngine;

  // Ensure initialized
  await engine.initialize();

  // Execute dream with configured duration
  return engine.dream(this.config.maxDreamDurationMs);
}
```

### 5.4 EventBus Integration

Subscribe to domain events:

```typescript
async initialize(): Promise<void> {
  // Subscribe to quality gate events
  this.subscriptions.push(
    this.deps.eventBus.subscribe(
      QualityAssessmentEvents.QualityGateEvaluated,
      this.handleQualityGateEvent.bind(this)
    )
  );

  // Subscribe to experience events
  this.subscriptions.push(
    this.deps.eventBus.subscribe(
      'learning.ExperienceCaptured',
      this.handleExperienceCaptured.bind(this)
    )
  );

  // Subscribe to test completion events
  this.subscriptions.push(
    this.deps.eventBus.subscribe(
      TestExecutionEvents.TestRunCompleted,
      this.handleTestRunCompleted.bind(this)
    )
  );
}
```

---

## 6. Configuration Options

### 6.1 Default Configuration

```typescript
export const DEFAULT_DREAM_SCHEDULER_CONFIG: DreamSchedulerConfig = {
  // Time-based scheduling: every hour
  scheduleIntervalMs: 3600000,

  // Require 20 experiences before triggering
  experienceThreshold: 20,

  // Dream on quality failures
  dreamOnQualityFailure: true,

  // 10-minute cooldown between dreams
  cooldownMs: 600000,

  // Max 60 seconds per dream
  maxDreamDurationMs: 60000,

  // Enabled by default
  enabled: true,

  // Queue up to 3 pending dreams
  maxPendingDreams: 3,

  // 24-hour window for experience counting
  experienceWindowMs: 86400000,
};
```

### 6.2 Environment Variable Overrides

```bash
# Disable automatic scheduling
AQE_DREAM_SCHEDULER_ENABLED=false

# Shorter interval for development
AQE_DREAM_SCHEDULE_INTERVAL_MS=300000

# Higher threshold for production
AQE_DREAM_EXPERIENCE_THRESHOLD=50

# Disable quality failure trigger
AQE_DREAM_ON_QUALITY_FAILURE=false
```

### 6.3 Runtime Configuration Updates

```typescript
// Example: Temporarily increase threshold during high load
scheduler.updateConfig({
  experienceThreshold: 100,
  cooldownMs: 1800000, // 30 minutes
});

// Disable for maintenance
await scheduler.disable();

// Re-enable with different config
scheduler.updateConfig({
  enabled: true,
  scheduleIntervalMs: 7200000, // 2 hours
});
scheduler.enable();
```

---

## 7. Resource Management

### 7.1 Concurrency Control

```typescript
// Only one dream at a time
private dreamLock: boolean = false;

private async acquireDreamLock(): Promise<boolean> {
  if (this.dreamLock) {
    return false;
  }
  this.dreamLock = true;
  return true;
}

private releaseDreamLock(): void {
  this.dreamLock = false;
}
```

### 7.2 Memory Check (Future Enhancement)

```typescript
// Check system resources before dreaming
private checkResources(): boolean {
  // For now, always return true
  // Future: Check memory, CPU, active agent count
  return true;
}
```

### 7.3 Graceful Shutdown

```typescript
async dispose(): Promise<void> {
  // Stop scheduler timer
  if (this.schedulerTimer) {
    clearInterval(this.schedulerTimer);
  }

  // Wait for current dream to complete (with timeout)
  if (this.dreamLock) {
    await Promise.race([
      this.waitForDreamComplete(),
      this.timeout(30000), // 30s max wait
    ]);

    // Force cancel if still running
    if (this.dreamLock) {
      await this.deps.dreamEngine.cancelDream();
    }
  }

  // Clear subscriptions
  for (const sub of this.subscriptions) {
    sub.unsubscribe();
  }

  // Save stats
  await this.saveStats();
}
```

---

## 8. State Diagram

```
                              +----------------+
                              |   DISABLED     |
                              +-------+--------+
                                      |
                                      | enable()
                                      v
+-------------+  cooldown   +--------+--------+  trigger  +-------------+
|   COOLING   |<-----------+|     IDLE        |---------->|   QUEUED    |
|   DOWN      |             +--------+--------+           +------+------+
+------+------+                      ^                           |
       |                             |                           |
       | cooldown                    |                           | resource
       | expires                     | complete/fail             | available
       v                             |                           v
+------+------+                +-----+-----+             +------+------+
|    IDLE     |                |  DREAMING |<------------+   QUEUED    |
+-------------+                +-----------+             +-------------+
```

---

## 9. File Structure

```
v3/src/learning/dream/
  +-- DREAM_SCHEDULER_DESIGN.md  (this document)
  +-- dream-engine.ts            (existing)
  +-- dream-scheduler.ts         (to implement)
  +-- dream-scheduler.test.ts    (to implement)
  +-- types.ts                   (existing, extend)
  +-- index.ts                   (update exports)
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

- Configuration validation
- Trigger evaluation logic
- Cooldown management
- Queue management
- Stats tracking

### 10.2 Integration Tests

- EventBus subscription/publishing
- DreamEngine integration
- ExperienceCaptureService integration
- LearningOptimizationCoordinator integration

### 10.3 Test Scenarios

1. **Time-based trigger fires correctly**
2. **Experience threshold triggers dream**
3. **Quality failure triggers immediate dream**
4. **Cooldown prevents rapid re-triggering**
5. **Queue management respects max pending**
6. **Graceful shutdown completes current dream**
7. **Configuration updates take effect**

---

## 11. Implementation Phases

### Phase 1: Core Scheduler (This Design)
- Basic time-based scheduling
- Experience threshold trigger
- Quality failure trigger
- Configuration management
- Stats tracking

### Phase 2: Advanced Features
- Resource-aware scheduling
- Priority queue with preemption
- Distributed locking for multi-process
- Adaptive threshold adjustment

### Phase 3: Intelligence
- ML-based optimal dream timing
- Automatic threshold tuning
- Predictive resource allocation
- Cross-session dream continuity

---

## 12. Comparison with v2 SleepCycle

| Feature | v2 SleepCycle | v3 DreamScheduler |
|---------|--------------|-------------------|
| Phase Model | N1/N2/N3/REM phases | Delegates to DreamEngine |
| Scheduling | Manual execution only | Automatic + Event-driven |
| Dependencies | Internal factory creation | Dependency injection |
| Event Integration | None | Full EventBus integration |
| Configuration | Fixed at construction | Runtime configurable |
| Persistence | None | Stats persist via MemoryBackend |
| Quality Trigger | None | Quality gate failure trigger |
| Resource Guards | Budget limits | Cooldown + resource checks |

---

## 13. Open Questions

1. **Should dreams be distributed across processes?**
   Current design assumes single-process. For multi-process, would need distributed locking.

2. **Should dream results feed back into scheduling?**
   E.g., if a dream produces many insights, should we schedule more frequent dreams?

3. **Integration with CI/CD pipelines?**
   Should dreams be triggered as part of deployment pipelines?

---

## 14. References

- ADR-021: QE ReasoningBank - Dream Cycle Integration
- v2 SleepCycle: `v2/src/learning/scheduler/SleepCycle.ts`
- v3 DreamEngine: `v3/src/learning/dream/dream-engine.ts`
- v3 LearningOptimizationCoordinator: `v3/src/domains/learning-optimization/coordinator.ts`
- v3 ExperienceCaptureService: `v3/src/learning/experience-capture.ts`
- v3 Domain Events: `v3/src/shared/events/domain-events.ts`
