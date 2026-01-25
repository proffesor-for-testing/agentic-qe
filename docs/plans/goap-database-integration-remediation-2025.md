# GOAP Plan: Database Integration Gap Remediation

**Version**: 1.0.0
**Created**: 2025-12-29
**Status**: Planning Phase
**Algorithm**: A* Search with Precondition/Effect Analysis
**Priority**: High - Core functionality not persisting

---

## Executive Summary

A Sherlock investigation of `.agentic-qe/memory.db` revealed 18 empty tables that should contain data based on developed features. This GOAP plan addresses 6 critical database integration gaps where features exist in code but fail to persist data, creating blind spots in learning, analytics, and cross-session continuity.

---

## Current State (World State)

```
WORLD_STATE = {
  project_version: "2.7.1",
  database: "SQLite memory.db",
  total_tables: 36,
  empty_tables_that_should_have_data: 18,

  active_tables: {
    memory_entries: 1965,
    events: 1038,
    learning_experiences: 656,
    q_values: 487,
    patterns: 6,
    captured_experiences: 180
  },

  empty_critical_tables: [
    "goap_goals", "goap_actions", "goap_plans",  // Issue 1
    "agent_registry",                              // Issue 2
    "pattern_usage",                               // Issue 3
    "learning_metrics", "learning_history",        // Issue 4
    "fleets", "agents", "tasks",                   // Issue 5
    "dream_cycles (stale - Dec 15)"               // Issue 6
  ]
}
```

---

## Goal State Definition

```
GOAL_STATE = {
  goap_persistence: true,           // Plans stored and reusable
  agent_registry_active: true,      // Agent lifecycle tracked
  pattern_usage_tracked: true,      // Pattern effectiveness measured
  learning_metrics_stored: true,    // Training progress visible
  fleet_persistence: true,          // Cross-session fleet continuity
  dream_cycles_running: true        // Background learning active
}
```

---

## Issue Analysis with GOAP Decomposition

### Issue 1: GOAP System Not Persisting

**Tables**: `goap_goals`, `goap_actions`, `goap_plans`

**Current Implementation**:
- No dedicated GOAP module exists in codebase (search returned no files matching `*goap*`)
- The concept exists in planning documentation but lacks implementation
- Schema exists in `Database.ts` (not explicitly, would need to be added)

**Root Cause**: GOAP planning is conceptual/documented but not implemented with database persistence.

**Impact**:
- Cannot learn from past planning successes/failures
- No plan reuse across sessions
- Duplicate planning efforts for similar goals

**Complexity**: HIGH (5 points) - Requires new module creation

---

### Issue 2: Agent Registry Not Used

**Table**: `agent_registry`

**Current Implementation**:
```typescript
// src/mcp/services/AgentRegistry.ts
export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  // Stores agents in memory only!
  // No database persistence
}
```

**Root Cause**: `AgentRegistry` stores agents in memory (`Map<string, RegisteredAgent>`) but never writes to `agent_registry` table.

**Impact**:
- No visibility into agent lifecycle across restarts
- Cannot track which agents have been spawned historically
- No agent discovery for coordination

**Complexity**: LOW (2 points) - Add DB writes to existing code

**Files to Modify**:
- `/workspaces/agentic-qe/src/mcp/services/AgentRegistry.ts`

---

### Issue 3: Pattern Usage Not Tracked

**Table**: `pattern_usage`

**Current Implementation**:
```typescript
// src/mcp/handlers/learning/learning-store-pattern.ts
// Stores patterns but doesn't track usage
db.prepare(`
  INSERT INTO patterns (id, pattern, confidence, usage_count, ...)
  VALUES (?, ?, ?, ?, ...)
`).run(...);
// usage_count is stored but pattern_usage table is never populated
```

**Root Cause**: `usage_count` is tracked as a counter on `patterns` table but individual usage events aren't logged to `pattern_usage`.

**Impact**:
- Cannot measure pattern effectiveness per project/agent
- No feedback loop for pattern improvement
- Missing context for why patterns succeed/fail

**Complexity**: LOW (2 points) - Add usage logging calls

**Files to Modify**:
- `/workspaces/agentic-qe/src/mcp/handlers/learning/learning-store-pattern.ts`
- Any file that uses patterns during execution

---

### Issue 4: Learning Metrics Missing

**Tables**: `learning_metrics`, `learning_history`

**Current Implementation**:
```typescript
// src/learning/metrics/LearningMetrics.ts
// Reads FROM these tables but doesn't write TO them!
private calculateDiscoveryMetrics(periodStart: number, periodEnd: number): {...}
// All methods are read-only SQL queries
```

**Root Cause**: `LearningMetrics` class is designed for analytics/reporting (read) but no writer exists.

**Impact**:
- Cannot track learning progress over time
- No training analytics or improvement graphs
- `aqe learn status` shows empty data

**Complexity**: MEDIUM (3 points) - Need to add write methods and call sites

**Files to Modify**:
- `/workspaces/agentic-qe/src/learning/metrics/LearningMetrics.ts` (add write methods)
- `/workspaces/agentic-qe/src/learning/LearningEngine.ts` (call write methods)
- `/workspaces/agentic-qe/src/learning/QLearning.ts` (record metrics after updates)

---

### Issue 5: Fleet Persistence Missing

**Tables**: `fleets`, `agents`, `tasks`

**Current Implementation**:
```typescript
// src/mcp/handlers/fleet-init.ts
export class FleetInitHandler extends BaseHandler {
  private activeFleets: Map<string, FleetInstance> = new Map();
  // In-memory only! Never calls Database.upsertFleet()

  private async initializeFleet(...): Promise<FleetInstance> {
    // ...
    this.activeFleets.set(fleetId, fleetInstance);  // Memory only
    // Missing: await this.db.upsertFleet({...});
    return fleetInstance;
  }
}
```

**Root Cause**: `Database.ts` has `upsertFleet()`, `upsertAgent()`, `upsertTask()` methods but `FleetInitHandler` doesn't call them.

**Impact**:
- Fleet state lost on restart
- No task history for replay/debugging
- Cannot correlate fleet performance over time

**Complexity**: MEDIUM (3 points) - Wire existing DB methods to handlers

**Files to Modify**:
- `/workspaces/agentic-qe/src/mcp/handlers/fleet-init.ts`
- `/workspaces/agentic-qe/src/mcp/handlers/agent-spawn.ts`
- `/workspaces/agentic-qe/src/mcp/handlers/task-orchestrate.ts` (if exists)

---

### Issue 6: Dream/Sleep System Stale

**Table**: `dream_cycles` (147 records, last entry Dec 15)

**Current Implementation**:
```typescript
// src/learning/dream/DreamEngine.ts
// DreamEngine DOES write to dream_cycles table!
this.db.prepare(`
  INSERT INTO dream_cycles (id, start_time, status, created_at)
  VALUES (?, ?, 'running', ?)
`).run(cycleId, startTime.getTime(), startTime.getTime());

// src/learning/scheduler/SleepScheduler.ts
// SleepScheduler orchestrates but needs to be running
```

**Root Cause**: DreamEngine works but SleepScheduler isn't being started automatically. Either:
1. `aqe init` doesn't start the scheduler
2. Scheduler was manually stopped and never restarted
3. Idle detection never triggers (always busy)

**Impact**:
- Pattern synthesis not happening
- No background learning during idle periods
- Insights from experience consolidation lost

**Complexity**: LOW (2 points) - Add scheduler auto-start

**Files to Investigate**:
- `/workspaces/agentic-qe/src/cli/commands/init.ts`
- `/workspaces/agentic-qe/src/learning/scheduler/SleepScheduler.ts`
- Check for daemon/background process management

---

## GOAP Action Library

### Action 1: Implement Agent Registry Persistence

| Property | Value |
|----------|-------|
| **ID** | `ACTION_AGENT_REGISTRY_PERSIST` |
| **Preconditions** | `AgentRegistry` class exists, `Database.upsertAgent()` exists |
| **Effects** | `agent_registry_active = true` |
| **Cost** | 2 (LOW) |
| **Priority** | HIGH |
| **Dependencies** | None (foundational) |

**Implementation Steps**:
1. Inject `Database` instance into `AgentRegistry` constructor
2. Add `persistAgent()` private method
3. Call `persistAgent()` in `spawnAgent()` after `this.agents.set()`
4. Call `persistAgent()` with status update in `terminateAgent()`
5. Add `loadPersistedAgents()` for session recovery

**Code Changes**:
```typescript
// AgentRegistry.ts - Add to spawnAgent() after line 242
await this.persistAgentToDb(registeredAgent);

private async persistAgentToDb(agent: RegisteredAgent): Promise<void> {
  await this.db.run(`
    INSERT OR REPLACE INTO agent_registry (
      id, type, status, fleet_id, capabilities, spawned_at, last_activity
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    agent.id,
    agent.mcpType,
    agent.status,
    agent.fleetId || null,
    JSON.stringify(agent.agent.getCapabilities()),
    agent.spawnedAt.toISOString(),
    agent.lastActivity.toISOString()
  ]);
}
```

---

### Action 2: Add Pattern Usage Tracking

| Property | Value |
|----------|-------|
| **ID** | `ACTION_PATTERN_USAGE_TRACK` |
| **Preconditions** | `patterns` table has records, `pattern_usage` table exists |
| **Effects** | `pattern_usage_tracked = true` |
| **Cost** | 2 (LOW) |
| **Priority** | HIGH |
| **Dependencies** | None |

**Implementation Steps**:
1. Create `PatternUsageTracker` utility class
2. Add `trackUsage(patternId, context, success)` method
3. Call tracker when patterns are applied during test generation
4. Call tracker when patterns are evaluated in quality gates

**Files to Modify**:
- Create: `/workspaces/agentic-qe/src/learning/PatternUsageTracker.ts`
- Modify: `/workspaces/agentic-qe/src/agents/TestGeneratorAgent.ts` (if using patterns)
- Modify: `/workspaces/agentic-qe/src/mcp/handlers/learning/learning-store-pattern.ts`

**Code Changes**:
```typescript
// PatternUsageTracker.ts (new file)
export class PatternUsageTracker {
  async trackUsage(
    patternId: string,
    context: { agentId?: string; projectId?: string; taskType?: string },
    success: boolean,
    executionTimeMs: number
  ): Promise<void> {
    await this.db.run(`
      INSERT INTO pattern_usage (
        pattern_id, agent_id, project_id, context, success,
        execution_time_ms, used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      patternId,
      context.agentId || null,
      context.projectId || null,
      JSON.stringify(context),
      success ? 1 : 0,
      executionTimeMs,
      new Date().toISOString()
    ]);
  }
}
```

---

### Action 3: Add Learning Metrics Writer

| Property | Value |
|----------|-------|
| **ID** | `ACTION_LEARNING_METRICS_WRITE` |
| **Preconditions** | `LearningMetrics` class exists (read-only), learning events occur |
| **Effects** | `learning_metrics_stored = true` |
| **Cost** | 3 (MEDIUM) |
| **Priority** | HIGH |
| **Dependencies** | None |

**Implementation Steps**:
1. Add `recordMetric()` method to `LearningMetrics` class
2. Add `recordLearningHistory()` method for Q-value updates
3. Integrate with `QLearning.ts` to record after each update
4. Integrate with `ExperienceReplayBuffer.ts` for batch metrics

**Files to Modify**:
- `/workspaces/agentic-qe/src/learning/metrics/LearningMetrics.ts`
- `/workspaces/agentic-qe/src/learning/QLearning.ts`
- `/workspaces/agentic-qe/src/learning/LearningEngine.ts`

**Code Changes**:
```typescript
// LearningMetrics.ts - Add write methods
async recordMetric(data: {
  agentId: string;
  metricType: 'accuracy' | 'latency' | 'quality' | 'success_rate' | 'improvement';
  metricValue: number;
  baselineValue?: number;
  context?: string;
}): Promise<void> {
  const improvement = data.baselineValue
    ? ((data.metricValue - data.baselineValue) / data.baselineValue) * 100
    : null;

  this.db.prepare(`
    INSERT INTO learning_metrics (
      agent_id, metric_type, metric_value, baseline_value,
      improvement_percentage, context, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.agentId,
    data.metricType,
    data.metricValue,
    data.baselineValue || null,
    improvement,
    data.context || null,
    Date.now()
  );
}
```

---

### Action 4: Implement Fleet Persistence

| Property | Value |
|----------|-------|
| **ID** | `ACTION_FLEET_PERSIST` |
| **Preconditions** | `FleetInitHandler` exists, `Database.upsertFleet()` exists |
| **Effects** | `fleet_persistence = true` |
| **Cost** | 3 (MEDIUM) |
| **Priority** | MEDIUM-HIGH |
| **Dependencies** | `ACTION_AGENT_REGISTRY_PERSIST` (to link agents to fleets) |

**Implementation Steps**:
1. Inject `Database` instance into `FleetInitHandler`
2. Call `upsertFleet()` after fleet creation
3. Update fleet status on changes
4. Persist task assignments via `upsertTask()`

**Files to Modify**:
- `/workspaces/agentic-qe/src/mcp/handlers/fleet-init.ts`
- `/workspaces/agentic-qe/src/mcp/handlers/fleet-status.ts`

**Code Changes**:
```typescript
// fleet-init.ts - Add after line 212 (this.activeFleets.set)
await this.persistFleetToDb(fleetInstance);

private async persistFleetToDb(fleet: FleetInstance): Promise<void> {
  await this.db.upsertFleet({
    id: fleet.id,
    name: `Fleet ${fleet.id}`,
    config: fleet.configuration,
    status: fleet.status
  });
}
```

---

### Action 5: Restart Dream/Sleep Scheduler

| Property | Value |
|----------|-------|
| **ID** | `ACTION_DREAM_SCHEDULER_AUTO_START` |
| **Preconditions** | `SleepScheduler` exists, `DreamEngine` writes to DB |
| **Effects** | `dream_cycles_running = true` |
| **Cost** | 2 (LOW) |
| **Priority** | MEDIUM |
| **Dependencies** | None |

**Implementation Steps**:
1. Investigate why scheduler stopped (check logs, init code)
2. Add scheduler start to `aqe init` completion hook
3. Add health check endpoint for scheduler status
4. Consider cron-based fallback if idle detection unreliable

**Files to Investigate/Modify**:
- `/workspaces/agentic-qe/src/cli/commands/init.ts`
- `/workspaces/agentic-qe/src/learning/scheduler/SleepScheduler.ts`

**Code Changes**:
```typescript
// init.ts - Add scheduler auto-start
import { SleepScheduler } from '../learning/scheduler/SleepScheduler';

async function initializeFleet(...) {
  // ... existing init code ...

  // Start background learning scheduler
  const scheduler = new SleepScheduler({
    mode: 'hybrid',
    learningBudget: {
      maxPatternsPerCycle: 50,
      maxAgentsPerCycle: 5,
      maxDurationMs: 3600000
    }
  });
  await scheduler.start();

  // Store scheduler reference for CLI commands
  global.sleepScheduler = scheduler;
}
```

---

### Action 6: Create GOAP Persistence Module

| Property | Value |
|----------|-------|
| **ID** | `ACTION_GOAP_PERSIST` |
| **Preconditions** | Schema for GOAP tables exists or needs creation |
| **Effects** | `goap_persistence = true` |
| **Cost** | 5 (HIGH) |
| **Priority** | LOW (not blocking other features) |
| **Dependencies** | None, but benefits from `ACTION_AGENT_REGISTRY_PERSIST` |

**Implementation Steps**:
1. Create schema migration for `goap_goals`, `goap_actions`, `goap_plans` tables
2. Create `GOAPPersistence` class with CRUD operations
3. Integrate with planning workflows (if/when GOAP planning is actively used)
4. Add CLI commands for plan inspection

**Note**: This is lower priority because GOAP planning exists in documentation but isn't actively used in production workflows. The other issues have more immediate impact.

---

## Optimal Action Sequence (A* Path)

Based on dependencies, impact, and cost:

```
START STATE (Current)
    |
    +--[1]--> ACTION_AGENT_REGISTRY_PERSIST (cost: 2)
    |         Effect: Agents tracked in DB
    |         Enables: Fleet agent correlation
    |
    +--[2]--> ACTION_PATTERN_USAGE_TRACK (cost: 2) [parallel]
    |         Effect: Pattern effectiveness measured
    |         Enables: Pattern improvement loop
    |
    +--[3]--> ACTION_LEARNING_METRICS_WRITE (cost: 3) [parallel]
    |         Effect: Training progress visible
    |         Enables: Analytics dashboards
    |
    +--[4]--> ACTION_FLEET_PERSIST (cost: 3)
              Precondition: ACTION_AGENT_REGISTRY_PERSIST complete
    |         Effect: Fleet state survives restarts
    |
    +--[5]--> ACTION_DREAM_SCHEDULER_AUTO_START (cost: 2)
    |         Effect: Background learning resumes
    |
    +--[6]--> ACTION_GOAP_PERSIST (cost: 5) [optional/future]
              Effect: Plans reusable
    |
GOAL STATE
```

**Total Minimum Path Cost**: 12 points (excluding optional GOAP)
**Including GOAP**: 17 points

---

## Implementation Priority Matrix

| Priority | Action | Cost | Impact | Dependencies |
|----------|--------|------|--------|--------------|
| **P0** | Agent Registry Persist | 2 | HIGH | None |
| **P0** | Pattern Usage Track | 2 | HIGH | None |
| **P0** | Learning Metrics Write | 3 | HIGH | None |
| **P1** | Fleet Persistence | 3 | MEDIUM-HIGH | Agent Registry |
| **P1** | Dream Scheduler Auto-Start | 2 | MEDIUM | None |
| **P2** | GOAP Persistence | 5 | LOW | Optional |

---

## File Change Summary

### Files to Modify

| File | Action(s) | Change Type |
|------|-----------|-------------|
| `src/mcp/services/AgentRegistry.ts` | 1 | Add DB injection + persist calls |
| `src/mcp/handlers/learning/learning-store-pattern.ts` | 2 | Add usage tracking |
| `src/learning/metrics/LearningMetrics.ts` | 3 | Add write methods |
| `src/learning/QLearning.ts` | 3 | Call metrics recorder |
| `src/mcp/handlers/fleet-init.ts` | 4 | Add fleet DB persistence |
| `src/cli/commands/init.ts` | 5 | Start sleep scheduler |

### Files to Create

| File | Action | Purpose |
|------|--------|---------|
| `src/learning/PatternUsageTracker.ts` | 2 | Track pattern usage events |
| `src/planning/GOAPPersistence.ts` | 6 | GOAP plan storage (future) |

---

## Verification Queries

After implementation, run these queries to verify data is flowing:

```sql
-- Verify agent_registry populated
SELECT COUNT(*) as agent_count,
       COUNT(DISTINCT type) as unique_types
FROM agent_registry;

-- Verify pattern_usage populated
SELECT pattern_id, COUNT(*) as usage_count,
       AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) as success_rate
FROM pattern_usage
GROUP BY pattern_id;

-- Verify learning_metrics populated
SELECT agent_id, metric_type,
       COUNT(*) as records,
       AVG(metric_value) as avg_value
FROM learning_metrics
GROUP BY agent_id, metric_type;

-- Verify fleet persistence
SELECT id, status, created_at
FROM fleets
ORDER BY created_at DESC
LIMIT 10;

-- Verify dream_cycles active
SELECT status, COUNT(*) as count,
       MAX(start_time) as latest
FROM dream_cycles
GROUP BY status;
```

---

## OODA Loop Integration

After each action is implemented:

1. **Observe**: Run verification queries, check MCP tool outputs
2. **Orient**: Compare actual data with expected patterns
3. **Decide**: If data flowing correctly, proceed to next action
4. **Act**: Execute next action or adjust implementation if gaps remain

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Database write performance | Low | Medium | Use prepared statements (already done) |
| Breaking existing features | Low | High | Add DB writes after existing logic, not instead of |
| Memory/DB inconsistency | Medium | Medium | Always update memory first, then DB (current pattern) |
| DevPod memory limits | Medium | Medium | Use batched writes, don't hold large result sets |

---

## Success Criteria

- [ ] `agent_registry` has records for spawned agents
- [ ] `pattern_usage` logs each pattern application
- [ ] `learning_metrics` records training progress
- [ ] `fleets`/`agents`/`tasks` survive restart
- [ ] `dream_cycles` has recent entries (< 24 hours old)
- [ ] All verification queries return non-zero counts

---

**Generated by**: GOAP Specialist
**Algorithm**: A* Search with Precondition/Effect Analysis
**Context**: Sherlock Investigation of memory.db integration gaps
