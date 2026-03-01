# ADR-056: Infrastructure Self-Healing Extension for Strange Loop

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-056 |
| **Status** | Accepted |
| **Date** | 2026-02-02 |
| **Author** | Architecture Team |
| **Extends** | ADR-031 (Strange Loop Self-Awareness) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** Strange Loop (ADR-031) operating exclusively on swarm agent health metrics without visibility into infrastructure service availability during test execution,

**facing** tests failing due to infrastructure outages (DB down, Redis unreachable, Selenium Grid unresponsive) being misclassified as test bugs or flaky tests, requiring manual operator intervention to restart services, and loss of test execution time while waiting for human response,

**we decided for** extending Strange Loop through its existing DI seams (AgentProvider wrapping, ActionExecutor composition) to detect infrastructure failures from test output, classify them using OS-level error signatures, and execute YAML-driven recovery playbooks — all without modifying the core Observe-Model-Decide-Act cycle,

**and neglected** modifying the core healing controller's decide/act logic directly, building a separate independent healing system, and hardcoding recovery commands per framework,

**to achieve** automatic detection and recovery of infrastructure service failures during test execution across any test framework (Jest, Pytest, JUnit, etc.) with zero code changes — only YAML playbook customization needed, recovery within seconds instead of minutes-to-hours of manual intervention, and seamless composition with existing Strange Loop capabilities,

**accepting that** pattern-based detection has false positive/negative risk for ambiguous error messages, shell-based recovery commands require appropriate host permissions, and the in-process coordination lock is single-node scoped (not distributed).

---

## Context

Strange Loop (ADR-031) provides a continuous Observe-Model-Decide-Act cycle that detects and heals swarm agent health issues. However, it has no visibility into infrastructure services that test suites depend on. When a PostgreSQL database, Redis cache, or Selenium Grid goes down during test execution, the resulting test failures are observed only as degraded agent metrics — the system cannot distinguish "agent is slow" from "the database that the agent's tests depend on is offline."

This gap leads to:
- Wasted test execution cycles running tests against unavailable infrastructure
- Manual operator intervention to restart services
- Incorrect self-healing actions (e.g., restarting agents when the DB is down)
- Extended downtime during CI/CD pipelines

### Design Principle: Composition + Controlled Extension

The extension primarily uses composition through existing DI interfaces, with minimal additive changes to the core controller:

1. **AgentProvider** — wrapped by `InfraAwareAgentProvider` to inject synthetic infrastructure agents
2. **ActionExecutor** — composed by `CompositeActionExecutor` to route infra actions to the recovery engine
3. **SelfHealingController** — extended with new type union members, `restart_service`/`run_playbook_recovery` action handling, and infra-agent override logic in `mapVulnerabilityToAction()`

The core `decide()` algorithm is unchanged — the same vulnerability-to-action mapping, bottleneck analysis, and deduplication logic handles infra agents naturally. The `act()` method was extended with two new action type cases that delegate to the executor.

---

## Architecture

```
TestOutputObserver ──> InfraAwareAgentProvider ──> SwarmObserver.observe()
                                                        │
                                              existing decide/act cycle
                                                        │
                                              CompositeActionExecutor
                                                ├── swarm executor (existing)
                                                └── InfraActionExecutor (new)
                                                     ├── RecoveryPlaybook (YAML)
                                                     └── CoordinationLock
```

### Components

| Component | Responsibility |
|-----------|---------------|
| `TestOutputObserver` | Parse test stdout/stderr, pattern-match infra errors (ECONNREFUSED, ETIMEDOUT, etc.), classify as `test_bug` / `infra_failure` / `flaky` / `unknown` |
| `RecoveryPlaybook` | Load YAML playbook, resolve `${VAR}` interpolation, provide `ServiceRecoveryPlan` per service |
| `CoordinationLock` | In-process TTL-based mutex preventing duplicate recovery of the same service |
| `InfraActionExecutor` | Execute recovery cycle: healthCheck → recover → backoff → verify |
| `CompositeActionExecutor` | Route swarm actions to original executor, infra actions to `InfraActionExecutor` |
| `InfraAwareAgentProvider` | Wrap `AgentProvider`, add synthetic infra agents with health derived from observer state |
| `InfraHealingOrchestrator` | Top-level coordinator: `feedTestOutput()` → `runRecoveryCycle()` → stats |

### Recovery Cycle

1. **Health Check** — Confirm service is actually down (avoids recovering healthy services)
2. **Recovery Commands** — Execute playbook commands in order (e.g., `docker compose up -d postgres`)
3. **Backoff** — Exponential wait between retry attempts
4. **Verification** — Confirm service is back up before reporting success

### YAML Playbook Format

```yaml
version: "1.0.0"
defaults:
  timeoutMs: 10000
  maxRetries: 3
  backoffMs: [2000, 5000, 10000]

services:
  postgres:
    description: "PostgreSQL database server"
    healthCheck:
      command: "pg_isready -h ${PGHOST:-localhost} -p ${PGPORT:-5432}"
      timeoutMs: 5000
    recover:
      - command: "docker compose up -d postgres"
        timeoutMs: 30000
      - command: "sleep 3"
        timeoutMs: 5000
        required: false
    verify:
      command: "pg_isready -h ${PGHOST:-localhost} -p ${PGPORT:-5432}"
      timeoutMs: 5000
```

---

## Options Considered

### Option 1: Composition via DI Seams (Selected)

Extend Strange Loop through existing `AgentProvider` and `ActionExecutor` interfaces. Infrastructure services appear as synthetic agents. Recovery handled by YAML playbooks.

**Pros:** Zero core modifications, framework-agnostic, YAML-driven configuration, seamless composition
**Cons:** Indirect integration via synthetic agents adds conceptual complexity

### Option 2: Direct Controller Modification (Rejected)

Add infrastructure-specific logic directly into `SelfHealingController.decide()` and `.act()`.

**Why rejected:** Violates the Open-Closed Principle. The controller's decision logic is well-tested and domain-specific to swarm health. Mixing infrastructure concerns would create coupling and maintenance burden.

### Option 3: Separate Independent System (Rejected)

Build a standalone infrastructure monitor with its own detection and recovery loop.

**Why rejected:** Duplicates observation infrastructure. Cannot leverage existing Strange Loop's scheduling, safety mechanisms (max actions per cycle, cooldown), or statistics collection.

---

## Modifications to Existing Files

| File | Change |
|------|--------|
| `types.ts` | Added 8 infra vulnerability types to `SwarmVulnerability['type']` union, 1 infra action type (`restart_service`) to `SelfHealingActionType` union |
| `healing-controller.ts` | (1) Mapped 8 infra vulnerability types to `'restart_service'` in `typeToAction`. (2) Added infra-agent override in `mapVulnerabilityToAction()` — when target is `infra-*`, `single_point_of_failure` overrides to `restart_service`, other topology actions are suppressed. (3) Added `restart_service` case to `act()` that delegates to `this.executor.restartAgent()` |
| `strange-loop.ts` | Added `createStrangeLoopWithInfraHealing()` and `createInMemoryStrangeLoopWithInfraHealing()` factory functions that wire `InfraAwareAgentProvider`, `CompositeActionExecutor`, and `InfraHealingOrchestrator` into `StrangeLoopOrchestrator` |
| `index.ts` | Added barrel re-export of `./infra-healing/index.js` and new factory function exports |

---

## New Files

| File | Purpose |
|------|---------|
| `infra-healing/types.ts` | All types, interfaces, config, stats |
| `infra-healing/coordination-lock.ts` | In-process async mutex with TTL |
| `infra-healing/test-output-observer.ts` | Pattern matching with 22+ error signatures |
| `infra-healing/recovery-playbook.ts` | YAML loader with `${VAR}` interpolation |
| `infra-healing/infra-action-executor.ts` | Recovery engine + NoOpCommandRunner + ShellCommandRunner |
| `infra-healing/composite-action-executor.ts` | ActionExecutor router |
| `infra-healing/infra-aware-agent-provider.ts` | AgentProvider wrapper |
| `infra-healing/infra-healing-orchestrator.ts` | Top-level coordinator with factory functions |
| `infra-healing/default-playbook.yaml` | Reference playbook template (8 services). **Not auto-loaded** — users must pass playbook content to factory functions. Exists as a copy-and-customize starting point. |
| `infra-healing/index.ts` | Barrel exports |

---

## Integration Wiring

The critical factory functions that wire everything together:

```typescript
// createStrangeLoopWithInfraHealing() (strange-loop.ts)
// 1. Creates InfraHealingOrchestrator (observer + playbook + lock + executor)
// 2. Wraps provider with InfraAwareAgentProvider
// 3. Wraps executor with CompositeActionExecutor
// 4. Constructs StrangeLoopOrchestrator with wrapped dependencies

const { orchestrator, infraHealing } = createStrangeLoopWithInfraHealing({
  provider, executor, commandRunner, playbook,
});

infraHealing.feedTestOutput(testStderr);
await orchestrator.runCycle(); // detects degraded infra → heals via playbook
```

### Data Flow When Infrastructure Fails

1. `infraHealing.feedTestOutput(stderr)` → `TestOutputObserver` classifies errors, marks `postgres` as failed
2. `orchestrator.runCycle()` → `SwarmObserver.observe()` calls `InfraAwareAgentProvider.getAgents()`
3. `InfraAwareAgentProvider` adds synthetic `infra-postgres` agent with `responsiveness: 0.0`
4. `SwarmObserver.detectVulnerabilities()` detects `single_point_of_failure` for `infra-postgres`
5. `SelfHealingController.decide()` → `mapVulnerabilityToAction()` overrides to `restart_service`
6. `SelfHealingController.act()` → `executor.restartAgent('infra-postgres')`
7. `CompositeActionExecutor.restartAgent()` detects `infra-` prefix → `infraExecutor.recoverService('postgres')`
8. `InfraActionExecutor` runs healthCheck → recover → verify via `CommandRunner`

### Configuration for Testing

```typescript
// Important: disable cooldown and increase max actions for integration tests
const config = { actionCooldownMs: 0, maxActionsPerCycle: 10 };
```

The default `actionCooldownMs: 10000` prevents multiple actions within the same cycle, which blocks infra recovery from executing in tests. Set to `0` for deterministic testing.

---

## Test Coverage

- **144 unit tests** across 6 test files (5 unit + 1 integration)
- **238 total tests** (including existing strange-loop tests) with zero regressions
- **14 integration tests** prove end-to-end wiring through `StrangeLoopOrchestrator`
- Tests use `NoOpCommandRunner` for deterministic execution without shell dependencies
- Coverage includes: pattern matching, classification, deduplication, YAML loading, variable interpolation, recovery cycle, lock coordination, TTL expiry, synthetic agent observation, vulnerability-to-action mapping, CompositeActionExecutor routing, stats propagation, multi-service failure handling

---

## Key Design Decisions

1. **CommandRunner DI interface** — Shell execution abstracted behind `run(command, timeout) → CommandResult`. `NoOpCommandRunner` for tests, `ShellCommandRunner` for production using `child_process.execFile` (not `exec`) for security.

2. **Synthetic agents** — Infrastructure services appear as `AgentNode` with `type: 'infrastructure'`, `role: 'specialist'`. Failing services get `responsiveness: 0.0`, triggering existing controller restart logic.

3. **Framework-agnostic patterns** — Error signatures match OS-level errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ENOMEM, ENOSPC) that are identical regardless of Jest, Pytest, JUnit, or any other framework.

4. **YAML playbook** — Users customize recovery via YAML configuration. Default playbook includes postgres, mysql, mongodb, redis, elasticsearch, rabbitmq, selenium-grid, and generic-service.

5. **CoordinationLock** — In-process Map-based mutex with TTL auto-expiry. Prevents concurrent recovery attempts for the same service. Single-process scope (not distributed).

### Security: Trust Boundary

Playbook commands support `${VAR}` interpolation from environment variables. Since commands execute via `/bin/sh -c`, a poisoned environment variable (e.g. `PGHOST="localhost; rm -rf /"`) could inject arbitrary shell commands.

**Mitigations:**
- Playbook YAML must come from trusted configuration (source control, operator-managed)
- Do NOT load playbooks from untrusted user input
- Do NOT allow untrusted processes to set environment variables referenced by playbook commands
- `ShellCommandRunner` uses `execFile` (not `exec`) and enforces timeouts and buffer limits
- `default-playbook.yaml` is a reference template — it is never auto-loaded
