# ADR-096: Route-Surface Q-Loop Closure + 3-Dim State-Key

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-096 |
| **Status** | Accepted |
| **Date** | 2026-05-19 |
| **Author** | Architecture Team |
| **Review Cadence** | 3 months |
| **Source** | Issue #499 — `route` hook reports `qWeight:0` structurally; `rl_q_values` never trained from the routing surface |

---

## WH(Y) Decision Statement

**In the context of** AQE's self-learning agent-routing path established by ADR-095 (`QEReasoningBank.routeTask` → `buildRoutingStateKey` → `buildQValueLookup` → `blendStaticAndQValue`), where the `route` hook (UserPromptSubmit) reads `rl_q_values` to produce a blended score and surfaces `qWeight` as a telemetry signal,

**facing** a structural producer/consumer mismatch *plus* a state-space fragmentation problem: the *consumer* (`route` hook) fires on every user prompt and looks up a state-action Q-value, but the *only producer* (`updateHookRouterQValue` at `hooks-dream-learning.ts:643`) is called from exactly one site — `task-hooks.ts:381`, gated by `if (outcome.bridge)` — which fires only on `PostToolUse ^(Task|Agent)$` with a matched pre-task bridge; AND the previous 4-dimensional `state_key = taskType|priority|domain|complexityBucket` where `complexityBucket = round(min(len/200, 1) * 10)` fragmented semantically identical tasks across cells (a 55-char vs 130-char phrasing of "write a unit test for X" → buckets 3 vs 7, different state_keys) so even when writes did fire, `QWEIGHT_RAMP_VISITS=20` was rarely reached per cell. Field evidence from #499 shows 139 `routing_outcomes` rows vs 2 `rl_q_values` rows after extended use, with `route --json` returning `"qWeight": 0` indefinitely; the route surface that displays qWeight cannot train the table it reads, and the Q-loop ADR-095 wired up never closes on the high-volume code path,

**we decided for** closing the loop on the routing surface itself with three complementary changes — (a) when the Stop-hook `post-route` resolves a `routing_outcomes` sentinel with a `quality_score`, also call `updateHookRouterQValue` using a state_key re-derived from the sentinel's `task_json.description` via the **exact same exported helpers** the route hook uses (`deriveTaskType`, `detectQEDomains`) — writer and reader address byte-identical rows in `rl_q_values`; (b) drop the `if (outcome.bridge)` gate at `task-hooks.ts:381` and derive state from `options.description` when the bridge payload is absent — adds a new `--description` CLI option to `post-task` so the hook command can pass `tool_input.description` for Task tools, restoring Q-updates for Task-tool runs where pre-task didn't fire (hook misconfiguration, expired bridge, kv_store write race); (c) **drop `complexityBucket` from `state_key` entirely** — the new key is 3-dim `taskType|priority|domain`, collapsing related tasks into the same Q-cell so `QWEIGHT_RAMP_VISITS=20` is reachable with a normal session cadence; the `deriveComplexityBucket` helper stays exported (and is still computed for the pre-task bridge payload's kv_store schema compatibility and any downstream telemetry) but is marked `@deprecated` for state_key construction,

**and neglected** persisting `state_key` as a dedicated column on `routing_outcomes` (cleaner long-term — eliminates re-derivation drift risk, schema migration cost is small; deferred to a follow-up ADR because re-derivation works today and the deferred work doesn't block #499's closure), training Q from a continuous reward signal instead of the binary `success ? 0.1 : -1.0` (would require widening `updateHookRouterQValue`'s reward parameter; `quality_score` is available at both call sites but the existing asymmetric reward shape from ADR-061 is intentionally aligned with pattern-promotion thresholds and we don't change it in this ADR), and the more elaborate alternatives to dropping the complexity dimension entirely — a 3-tier coarse bucket (small/medium/large by length) or a semantic complexity feature (identifier count, conjunction detection) — both add machinery without evidence the resulting state separation pays for itself; if post-deploy telemetry shows the 3-dim key conflating tasks that the routing system should differentiate, we can introduce a coarser bucket later with field data to inform threshold tuning,

**to achieve** a functioning closed-loop self-learning system on the routing surface (the surface that fires on every prompt now produces Q-signal in addition to consuming it; `qWeight` ramps from 0 → MAX_Q_WEIGHT over `QWEIGHT_RAMP_VISITS` visits as ADR-095 intended), defense-in-depth for the Task-tool path (post-task Q-updates fire even when the pre-task bridge is missing, which is the common case for hook misconfigurations and the unavoidable case for some kv_store race conditions), measurably faster convergence (the 3-dim key collapses the state space by ~11× relative to the previous 4-dim form, so a given (taskType, domain) pair accumulates visits at the rate of the *combined* historical buckets — ramp from 0 → MAX_Q_WEIGHT now requires ~20 same-domain tasks rather than ~20 same-length-and-same-domain tasks), and a regression test surface that asserts the producer/consumer alignment contract — if a future refactor desynchronizes writer/reader state_key construction, `tests/unit/cli/commands/route-q-loop-closure.test.ts` and `tests/unit/learning/agent-routing-exploration.test.ts` fail the build,

**accepting that** writer/reader state_key derivation is duplicated across `routing-hooks.ts post-route`, `task-hooks.ts post-task`, and `qe-reasoning-bank.ts:530` — three call sites that must all agree on `(deriveTaskType, detectQEDomains[0], 'normal')` (mitigated by the shared exports being the only correct path AND the regression tests pinning the contract; if we add a fourth caller, refactor to a `buildRoutingStateKeyFromDescription(description)` helper), the `state_key` reconstructed in `post-route` reflects the **resolved-at-Stop** value of `detectQEDomains` rather than the **decided-at-route** value (in practice these match because detectQEDomains is a pure function of description string; persisting state_key on the sentinel would eliminate even this theoretical drift — tracked as follow-up), adding `--description` to `post-task` requires the init template's hook command to pass `$tool_input.description` for Task tools to get full benefit (init template update lands in the same PR; older agentic-qe installs continue working with bridge-only state derivation as before), and existing `rl_q_values` rows written under the previous 4-dim key shape will never be hit by new lookups — field reports show installs have ~2 such rows at most (the loop was broken so no real Q-data accumulated), so we accept the orphan rows without a migration; if a future install ships with substantial 4-dim data, a one-shot migration that strips the trailing `|N` segment is straightforward.

---

## Context

### Reproduction (verified, v3.9.34/v3.9.35)

```sql
-- After a few hours of use on a real project:
SELECT (SELECT COUNT(*) FROM routing_outcomes) AS routes,
       (SELECT COUNT(*) FROM rl_q_values)      AS qrows;
-- routes = 139, qrows = 2
```

```bash
$ aqe hooks route --task "..." --json
{ "recommendedAgent": "...", "qWeight": 0, "reasoning": "Domain match: 20%; ..." }
```

`qWeight` is **structurally pinned** at 0: the `route` hook computes a `state_key` at `qe-reasoning-bank.ts:530` and looks up `rl_q_values`. The lookup returns no row, `blendStaticAndQValue` returns `qWeight: 0` via the `visits === 0` early-return at `agent-routing.ts:197`.

### Source-Level Findings

Verified by reading `src/`:

**Consumer (route hook):**
- `routing-hooks.ts:94` — `routeTask(request)` produces the routing decision including `qWeight`.
- `qe-reasoning-bank.ts:530-535` — builds `state_key` = `${taskType}|normal|${domain ?? 'any'}|${complexityBucket}` using `deriveTaskType(request.task)`, `detectQEDomains(request.task)[0]`, `deriveComplexityBucket(request.task)`.
- `qe-reasoning-bank.ts:618-631` — SQL query against `rl_q_values WHERE algorithm='q-learning' AND agent_id='aqe-hook-router' AND state_key=? AND action_key=?`.
- `agent-routing.ts:197-198` — `if (!qLookup || qLookup.visits === 0) return { qWeight: 0, ... }`.

**Producer (single site, pre-fix):**
- `hooks-dream-learning.ts:643-693` — `updateHookRouterQValue` builds the same state_key shape and performs the Bellman update.
- `task-hooks.ts:381` — `if (outcome.bridge) { await updateHookRouterQValue(...) }` was the ONLY caller. `outcome.bridge` comes from `persistTaskOutcome` reading the `task-bridge` kv_store namespace populated by pre-task. Without pre-task running (Bash/Edit/Read sessions, hook misconfigurations, kv_store TTL expiry), no Q-update fires.

**Routing surface ownership:**
- `route` hook writes a sentinel row to `routing_outcomes` with `quality_score = -1` (`routing-hooks.ts:166-194`). The row carries `task_json = {description, domain}` but **does NOT carry `state_key`** — the state_key is computed inside `routeTask` and thrown away.
- `post-route` (Stop hook) closes the sentinel with the 6-dim quality formula. Pre-fix: it did NOT touch `rl_q_values`.

This ADR closes the loop in two complementary places.

### Relationship to Existing ADRs

| ADR | Title | Relationship |
|-----|-------|--------------|
| ADR-021 | QE ReasoningBank for Pattern Learning | Owns `routeTask` + the state-key construction; this ADR doesn't change that — it makes the loop produce signal on the routing surface. |
| ADR-061 | Asymmetric Learning Rates | The `reward = success ? 0.1 : -1.0` shape inside `updateHookRouterQValue` is preserved verbatim; this ADR only widens the **call surface**, not the reward shape. |
| ADR-094 | Kernel-Side Dream Cycles | Producer side of the routing-outcomes pipeline runs in the hook subprocess per ADR-094's contract; this ADR keeps everything in-hook (~1ms additional per Stop hook for the Q-update). No kernel-side change. |
| ADR-095 | ε-Greedy Routing Exploration Policy | This ADR closes ADR-095's flagged Open Question: "the Q-table is now both populated AND consumed — the Bellman update has a routing-side reader to learn from." ADR-095 wired the reader assuming a healthy writer; we now wire the missing writer surface. |

---

## Decision

### Implementation

**State-key shape — 3-dim (was 4-dim):**

```typescript
// agent-routing.ts: buildRoutingStateKey now drops complexityBucket
export function buildRoutingStateKey(opts: {
  taskType: string;
  priority?: string;
  domain?: string;
}): string {
  return `${opts.taskType}|${opts.priority ?? 'normal'}|${opts.domain ?? 'any'}`;
}

// hooks-dream-learning.ts: writer-side state_key matches
const stateKey = `${opts.taskType}|${opts.priority}|${opts.domain || 'any'}`;
```

**Producer surface 1 — `post-route` (new path):**

```typescript
// routing-hooks.ts: after closing the routing_outcomes sentinel
if (sentinel) {
  try {
    const tj = JSON.parse(sentinel.task_json) as { description?: string };
    const description = String(tj.description ?? '');
    if (description) {
      await updateHookRouterQValue({
        taskType: deriveTaskType(description),
        priority: 'normal',
        domain: detectQEDomains(description)[0] ?? 'any',
        agent: sentinel.used_agent,
        success,
      });
    }
  } catch { /* swallow — Stop hook must not crash */ }
}
```

**Producer surface 2 — `post-task` (gate dropped):**

```typescript
// task-hooks.ts: replace `if (outcome.bridge) { ... }` with:
const taskDescription = String(options.description ?? '');
if (outcome.bridge || taskDescription) {
  await updateHookRouterQValue({
    taskType: outcome.bridge?.taskType ?? deriveTaskType(taskDescription),
    priority: outcome.bridge?.priority ?? 'normal',
    domain:   outcome.bridge?.domain ?? detectQEDomains(taskDescription)[0] ?? 'any',
    agent:    effectiveAgent,
    success,
  });
}
```

**CLI surface:** `aqe hooks post-task` gains `--description <desc>` so the PostToolUse hook command can pass `tool_input.description`.

**Compatibility:** `deriveComplexityBucket` stays exported (marked `@deprecated` for state_key use) — the pre-task bridge payload still carries `complexityBucket` for kv_store schema compatibility and any downstream telemetry. The `TaskBridgePayload` interface is unchanged.

### Test contract

`tests/unit/cli/commands/route-q-loop-closure.test.ts` pins:
1. `post-route` calls `updateHookRouterQValue` with state matching `(deriveTaskType, detectQEDomains[0])` from the sentinel description — no `complexityBucket` in the payload.
2. `post-route` no-ops when no route sentinel exists or task_json is malformed.
3. `post-task` calls the Q-update when the bridge is absent but `--description` is supplied.
4. `post-task` prefers bridge-supplied state when both are present (preserves pre-#499 behavior) — and does **not** leak `bridge.complexityBucket` into the Q-update payload.
5. `post-task` skips the Q-update when neither bridge nor description is available (prevents pollution of an "unknown" sentinel state).

`tests/unit/learning/agent-routing-exploration.test.ts` pins the 3-dim key shape itself: `buildRoutingStateKey` returns a 3-segment `|`-joined string. If a future refactor brings back the 4th dimension or desynchronizes producer/consumer derivation, these assertions fail.

---

## Open Questions

1. **Persist `state_key` on `routing_outcomes`** — eliminates re-derivation drift entirely. Schema migration (new nullable column) + one writer-side INSERT update + one consumer-side `SELECT state_key`. Small change; deferred only because re-derivation works today and matches Jordi's verified workaround. Worth doing in a follow-up release.
2. **Continuous reward** — `updateHookRouterQValue` takes `success: boolean`. Both call sites have `quality_score` available. Widening the writer to accept a continuous reward in `[0,1]` and reshape via `reward = (qualityScore - 0.5) * scale` is a small change but interacts with ADR-061's asymmetric ratio. Defer until we have post-deploy telemetry showing convergence behavior.
3. **Re-introducing complexity if convergence is too coarse** — the 3-dim state_key may conflate routing decisions that benefit from differentiation (e.g., "write one unit test" vs "write a comprehensive test suite" both land at `(test-generation, normal, test-generation)`). If telemetry post-deploy shows this conflation costing quality, the path forward is a *coarse* 3-tier complexity tier (small/medium/large by length, threshold-tuned from field data) — not a return to the previous 11-bucket linear-in-length form. Tracked as a "wait and measure" item rather than a planned change.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Builds On | ADR-095 | ε-Greedy Routing Exploration Policy | Closes the writer-side gap that ADR-095's Open Questions flagged as deferred. |
| Depends On | ADR-021 | QE ReasoningBank | Provides `routeTask` and the exported state-derivation helpers. |
| Preserves | ADR-061 | Asymmetric Learning Rates | Reward shape inside `updateHookRouterQValue` unchanged. |
| Co-exists With | ADR-094 | Kernel-Side Dream Cycles | Q-update runs in hook subprocess; ADR-094's hooks-as-producers contract preserved. |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| ISSUE-499 | route hook reports qWeight:0 structurally — rl_q_values is never trained from the routing surface | GitHub Issue | https://github.com/proffesor-for-testing/agentic-qe/issues/499 |
