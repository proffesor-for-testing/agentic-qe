# Extending Strange Loop Self-Healing to Infrastructure Recovery

> How the existing swarm-level self-healing system can be extended to detect and recover from infrastructure failures (DB down, Redis unreachable, etc.) during automated test execution.

---

## Three Extension Points in the Existing Code

### Extension Point 1: `ActionExecutor` Interface

The primary plug point. Today only `NoOpActionExecutor` exists (`healing-controller.ts:63`). The interface at line 31 defines 8 methods:

```typescript
// What exists today (healing-controller.ts:31-58)
export interface ActionExecutor {
  spawnAgent(agentId: string, config?: Record<string, unknown>): Promise<string>;
  terminateAgent(agentId: string): Promise<void>;
  addConnection(sourceId: string, targetId: string): Promise<void>;
  removeConnection(sourceId: string, targetId: string): Promise<void>;
  redistributeLoad(agentId: string): Promise<void>;
  restartAgent(agentId: string): Promise<void>;
  promoteToCoordinator(agentId: string): Promise<void>;
  demoteCoordinator(agentId: string): Promise<void>;
  observe(): Promise<SwarmHealthObservation>;
}
```

The extension:

```typescript
// NEW: Extended interface for infrastructure healing
export interface InfraActionExecutor extends ActionExecutor {
  restartService(serviceId: string): Promise<void>;
  checkServiceHealth(serviceId: string): Promise<ServiceHealthStatus>;
  runDiagnostic(serviceId: string): Promise<DiagnosticResult>;
  rerunFailedTests(testIds: string[]): Promise<TestRunResult>;
}
```

### Extension Point 2: `SwarmVulnerability.type`

At `types.ts:154`, the vulnerability types are limited to swarm concerns:

```typescript
// Current types
type: 'bottleneck' | 'isolated_agent' | 'overloaded_agent' |
      'single_point_of_failure' | 'network_partition' | 'degraded_connectivity';
```

Extended with infrastructure awareness:

```typescript
// Extended with infra awareness
type: 'bottleneck' | 'isolated_agent' | 'overloaded_agent' |
      'single_point_of_failure' | 'network_partition' | 'degraded_connectivity' |
      'db_connection_failure' | 'service_unreachable' | 'port_unavailable' |
      'disk_full' | 'certificate_expired' | 'dependency_timeout';
```

### Extension Point 3: `SelfHealingActionType`

The 12 current actions are all swarm-topology operations. New infra actions:

```typescript
// New action types
type InfraHealingActionType =
  | 'restart_database'        // docker restart postgres
  | 'restart_service'         // systemctl restart redis
  | 'clear_connection_pool'   // flush stale DB connections
  | 'flush_cache'             // clear Redis/Memcached
  | 'rotate_credentials'      // refresh expired tokens
  | 'rerun_failed_tests'      // re-execute failed subset
  | 'switch_to_backup'        // failover to replica DB
  | 'wait_and_retry'          // backoff + health check + retry
```

---

## Extended System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Extended Strange Loop                          │
│                                                                  │
│  OBSERVE (existing)              OBSERVE (new)                   │
│  ┌─────────────────┐            ┌──────────────────────────┐     │
│  │ Swarm Observer   │            │ TestOutputObserver        │     │
│  │ MinCut Monitor   │            │ • Parse stderr/stdout     │     │
│  │ Agent Health     │            │ • Pattern match errors    │     │
│  └────────┬────────┘            │ • Classify: infra vs test │     │
│           │                     └────────────┬─────────────┘     │
│           │                                  │                   │
│           ▼                                  ▼                   │
│  MODEL (existing)               MODEL (new)                      │
│  ┌─────────────────┐            ┌──────────────────────────┐     │
│  │ Topology trends  │            │ InfraHealthModel          │     │
│  │ Bottleneck detect│            │ • Service dependency map   │     │
│  │ Vulnerability    │            │ • Failure history          │     │
│  │ prediction       │            │ • Recovery success rates   │     │
│  └────────┬────────┘            └────────────┬─────────────┘     │
│           │                                  │                   │
│           ▼                                  ▼                   │
│  DECIDE (extended)                                               │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ SelfHealingController.decide()                             │   │
│  │                                                            │   │
│  │  1. Check critical vulns (existing)                        │   │
│  │  2. Check bottlenecks (existing)                           │   │
│  │  3. Check predictive vulns (existing)                      │   │
│  │  4. Check agent memory/responsiveness (existing)           │   │
│  │  5. Check infra service health (NEW)                       │   │
│  │  6. Check test failure patterns (NEW)                      │   │
│  │  7. Deduplicate + prioritize                               │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             ▼                                    │
│  ACT (extended)                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Existing 12 actions (swarm topology)                      │   │
│  │  + NEW infra actions:                                      │   │
│  │    restart_database → docker compose up -d postgres         │   │
│  │    restart_service → systemctl restart redis                │   │
│  │    clear_connection_pool → app.db.pool.end() + reconnect   │   │
│  │    rerun_failed_tests → npx jest --onlyFailures            │   │
│  │    switch_to_backup → update connection string to replica   │   │
│  │    wait_and_retry → sleep(backoff) + health_check + retry  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## The New Component: TestOutputObserver

Today's observers watch agents. The new observer watches test execution output:

```typescript
class TestOutputObserver {

  // Pattern registry — what errors map to what infra failures
  private patterns = [
    { regex: /ECONNREFUSED.*:5432/,    service: 'postgres',  action: 'restart_database' },
    { regex: /ECONNREFUSED.*:6379/,    service: 'redis',     action: 'restart_service' },
    { regex: /ECONNREFUSED.*:27017/,   service: 'mongodb',   action: 'restart_service' },
    { regex: /ETIMEDOUT/,              service: 'network',   action: 'wait_and_retry' },
    { regex: /ENOSPC/,                 service: 'disk',      action: 'clear_temp_files' },
    { regex: /certificate.*expired/i,  service: 'tls',       action: 'rotate_credentials' },
    { regex: /pool.*exhausted/i,       service: 'db-pool',   action: 'clear_connection_pool' },
    { regex: /Too many connections/i,  service: 'db-conn',   action: 'clear_connection_pool' },
    { regex: /ENOMEM/,                 service: 'memory',    action: 'restart_service' },
  ];

  // Classifies a test failure: is it a TEST bug or INFRA issue?
  classify(stderr: string): 'test_bug' | 'infra_failure' | 'flaky' | 'unknown'

  // Converts classified failure into a SwarmVulnerability
  // so the existing decide() pipeline can handle it
  toVulnerability(failure: ClassifiedFailure): SwarmVulnerability
}
```

---

## Recovery Playbook (Config-Driven)

The system does NOT guess what to do. You define a recovery playbook — a mapping from detected failure to specific recovery command:

```typescript
const recoveryPlaybook: Record<string, RecoveryAction> = {
  'postgres': {
    healthCheck: 'pg_isready -h localhost -p 5432',
    recover: 'docker compose up -d postgres',
    verify: 'pg_isready -h localhost -p 5432',
    maxRetries: 3,
    backoffMs: [2000, 5000, 10000],
    escalation: 'alert-ops-team'
  },
  'redis': {
    healthCheck: 'redis-cli ping',
    recover: 'docker compose up -d redis',
    verify: 'redis-cli ping',
    maxRetries: 2,
    backoffMs: [1000, 3000],
    escalation: 'switch-to-in-memory-cache'
  },
  'selenium-grid': {
    healthCheck: 'curl -s http://localhost:4444/status',
    recover: 'docker compose restart selenium-hub selenium-node-chrome',
    verify: 'curl -s http://localhost:4444/status | jq .value.ready',
    maxRetries: 2,
    backoffMs: [5000, 10000],
    escalation: 'run-tests-locally'
  }
};
```

---

## Full Recovery Flow

```
Test executor running Selenium suite
         │
         │ Test #47 fails: "ECONNREFUSED :5432"
         │
         ▼
  TestOutputObserver.classify()
         │
         │ Result: infra_failure (postgres)
         │
         ▼
  TestOutputObserver.toVulnerability()
         │
         │ → SwarmVulnerability {
         │     type: 'db_connection_failure',
         │     severity: 0.95,
         │     affectedAgents: ['test-executor-1'],
         │     description: 'PostgreSQL unreachable on :5432',
         │     suggestedAction: 'restart_database'
         │   }
         │
         ▼
  SelfHealingController.decide()
         │
         │ Maps to action: restart_database (priority: critical)
         │
         ▼
  SelfHealingController.act()
         │
         │ 1. Run healthCheck: pg_isready → FAIL (confirms down)
         │ 2. Run recover: docker compose up -d postgres
         │ 3. Wait backoff: 2000ms
         │ 4. Run verify: pg_isready → PASS
         │ 5. Log action to history
         │
         ▼
  Re-run failed tests
         │
         │ npx jest --onlyFailures
         │ or: pytest --lf
         │ or: mvn -Dsurefire.rerunFailingTestsCount=1
         │
         ▼
  Report: 3 tests healed, 0 still failing
```

---

## Guardrails: What the System Will NOT Do

| Scenario | System Response |
|----------|----------------|
| DB crashed due to test-induced corruption | Detects repeated restart failures → **escalates** instead of looping |
| 3 retries exhausted | Stops, marks tests as `infra_blocked`, alerts team |
| Multiple agents try to restart same DB | **Coordination lock** — first agent wins, others wait for health check |
| Recovery action makes things worse | **Health delta tracking** — if post-action health < pre-action, rolls back |
| Unknown error pattern | Classifies as `unknown` → **does NOT attempt recovery**, logs for human review |

---

## Build vs Reuse Summary

| Layer | Exists Today | Needs Building |
|-------|-------------|----------------|
| Observation loop (5s cycle) | Yes | -- |
| Agent health monitoring | Yes | -- |
| Vulnerability detection | Yes | Extend types for infra |
| Decision engine with priorities | Yes | Add infra rules to `decide()` |
| Action execution with cooldown | Yes | -- |
| Action history + audit trail | Yes | -- |
| `ActionExecutor` interface | Yes | Implement `InfraActionExecutor` |
| `NoOpActionExecutor` (test) | Yes | -- |
| **Test output parsing** | **No** | `TestOutputObserver` |
| **Failure classification** | **No** | Pattern matching engine |
| **Recovery playbook** | **No** | Config-driven service map |
| **Test re-run orchestration** | **No** | Framework-specific retry logic |
| **Coordination lock** | **No** | Prevent duplicate recoveries |

**The architecture is ready. The extension is ~4 new files, not a rewrite.**
