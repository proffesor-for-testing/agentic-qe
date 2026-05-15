# ADR-094: Kernel-Side Dream Cycles + Hooks-as-Producers Boundary

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-094 |
| **Status** | Implemented |
| **Date** | 2026-05-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |
| **Source** | Issue #488 Phase 2 — production-readiness blind spots in the post-v3.9.29 self-learning loop |

---

## WH(Y) Decision Statement

**In the context of** the AQE self-learning loop where hook subprocesses (`npx aqe hooks post-edit`, `post-task`) currently invoke `checkAndTriggerDream` and run a full 10-second dream cycle in-process when the experience-count threshold is crossed,

**facing** an architectural mismatch where short-lived hook subprocesses hold a write transaction on the unified `memory.db` for up to 10 seconds while the kernel-owning MCP server, other hook subprocesses, and user-triggered MCP tool calls queue behind it, while `stderr` output from the dream cycle is consumed by Claude Code's hook reader and lost from operator visibility,

**we decided for** wiring the existing `src/learning/dream/dream-scheduler.ts` (built but unused as of v3.9.30) from `QEKernelImpl.initialize()` so dream cycles run inside the long-lived kernel process; hook subprocesses drop their in-process `checkAndTriggerDream` call and keep only the cheap `incrementDreamExperience` counter; the kernel-side scheduler polls the counter and runs the cycle on its own cadence — mirroring the proven `CapturedExperienceBridge` shape that already moved experience drain out of hooks in v3.9.27,

**and neglected** keeping the hook-side dream trigger (current behavior, locks the DB for 10s per ~20 edits and reinitializes the engine cold every time), spawning a separate dream worker process (introduces yet another lifecycle to manage on top of the daemon work in #488 Phase 1), and using SQLite advisory locks to coordinate concurrent dream cycles (papers over the boundary problem without fixing it),

**to achieve** elimination of the 10-second SQLite write block from hook subprocesses (other writers no longer queue behind dream cycles), single warm DreamEngine instance reused across cycles instead of cold init per ~20 edits, dream cycle progress observability through the existing kernel logger + the loop-health writer landed in #488 Phase 1 (`learning:loop-health.components.dreamScheduler` populates instead of staying `undefined`), and establishment of a maintainable boundary contract — **hook subprocesses MUST NOT do >100ms of work** — that future contributors can follow when adding new self-learning behavior,

**accepting that** dream cycles now depend on a kernel-owning process being alive (mitigated by #488 Phase 1 B.1 daemon-pidfile fix and B.2 loop-health observability — operators run `aqe learning loop-health` to verify the kernel-side scheduler is live), the in-hook trigger path is removed in a single cutover with no feature flag (per maintainer decision: shipping without a deprecation window keeps the boundary contract clean from day one), and the boundary contract requires enforcement (mitigated by a CI test that fails any new `import` from `src/learning/dream/` inside `src/cli/commands/hooks-handlers/`).

---

## Context

### Problem

After issue #480 was fixed in v3.9.30 (commit `66553141`), the `post-edit` hook correctly calls `checkAndTriggerDream(memoryBackend)`. This unblocks the hook-driven dream loop, but it surfaces a deeper architectural mismatch:

1. **10-second SQLite write block in a short-lived process.** `checkAndTriggerDream` at `src/cli/commands/hooks-handlers/hooks-dream-learning.ts:110` configures the engine with `maxDurationMs: 10_000`. During those 10 seconds the engine holds writer intent on the unified `memory.db` while loading patterns, generating insights, and writing to `dream_cycles` / `dream_insights` / `qe_patterns`. Concurrent writers (the kernel-side `aqe-mcp`, the worker daemon's `aqe-mcp`, other hook subprocesses, user-triggered MCP tool calls) queue behind it. `busy_timeout = 60000` handles short contention; 10-second blocks paired with bursts of `Edit`/`Write` tool use cause noticeable queue tails.

2. **Cold DreamEngine init per cycle.** Hook subprocesses are short-lived `npx` processes — they don't share an in-memory DreamEngine across invocations. Every ~20-edit cycle pays the cost of `createDreamEngine` + `engine.initialize` + `createQEReasoningBank` + `bank.initialize` + a full `searchPatterns` call.

3. **stderr is a black hole.** Errors thrown inside the dream cycle's `try/catch` go to stderr, which Claude Code's hook reader consumes for IPC framing. Operators cannot see `[hooks] Dream apply: ${err.message}` from outside the hook subprocess — confirmed by the issue reporter who needed source-level instrumentation to triage #480 originally.

4. **No retry / resume.** If the hook subprocess is killed mid-cycle (Claude Code reaping a slow hook, SIGTERM during deploy), the partial state is lost. The next cycle starts from scratch.

### Current State (v3.9.30)

`src/learning/dream/dream-scheduler.ts` exists as a fully-implemented kernel-side scheduler with:
- Time-based scheduling (configurable `autoScheduleIntervalMs`)
- Experience-count thresholds (`experienceThreshold`, default 20)
- Event-bus subscription for `quality-gate-failure` and domain milestones
- Cooldown enforcement (`minTimeBetweenDreamsMs`, default 5 min)
- Optional auto-apply of high-confidence insights

It is **not currently wired** anywhere in the kernel. The only callers of `checkAndTriggerDream` are `editing-hooks.ts:180` and `task-hooks.ts:402` — both in hook subprocesses.

### Prior Art — CapturedExperienceBridge

Issue #479 / v3.9.27 established the canonical pattern for moving expensive work out of hook subprocesses:

| Component | Process boundary | Trigger | Outcome |
|-----------|------------------|---------|---------|
| `captured_experiences` SQLite | Hook subprocess writes | Every Edit/Write/Task tool use | One row per experience |
| `CapturedExperienceBridge.drain` | Kernel-side, 5s poll | `setInterval` in `QEKernelImpl.initialize` | Publishes `learning.ExperienceCaptured` events to the in-process eventBus |

Hooks became pure **producers** (write to SQLite, exit fast). The kernel became the **consumer** (drain on its own cadence, publish into the long-lived process where the eventBus and domain plugins actually live). This ADR proposes the same shape for dream cycles.

### Relationship to Existing ADRs

| ADR | Title | Relationship |
|-----|-------|--------------|
| ADR-014 | Background Workers for QE Monitoring | Establishes the 30-min `LearningConsolidationWorker` tick. This ADR adds the dream scheduler as a kernel-side companion. |
| ADR-021 | QE ReasoningBank for Pattern Learning | DreamEngine consumes `qe_patterns` via `bank.searchPatterns` and writes `dream_insights` + bumps `qe_patterns` via `applyInsight`. |
| ADR-046 | v2 Feature Integration | Original integration of dream cycles into AQE v3. This ADR formalizes where those cycles execute. |
| ADR-069 | RVCOW Dream Cycle Branching | Provides the safety mechanism for irreversible dream cycle effects. Moving the cycle kernel-side does not change the RVCOW contract — the branched-validate-merge flow still applies. |

---

## Options Considered

### Option 1: Kernel-Side DreamScheduler via `QEKernelImpl.initialize` (Selected)

Wire the existing `src/learning/dream/dream-scheduler.ts` from the kernel's initialization phase, mirroring the `CapturedExperienceBridge` pattern. Hook subprocesses drop the in-process `checkAndTriggerDream` call and retain only `incrementDreamExperience` (a fast counter bump). The kernel-side scheduler polls `dream-scheduler:hook-state.experienceCount` and runs the cycle when conditions are met.

**Pros:**
- Reuses an existing, tested scheduler implementation (no new abstractions)
- Same shape as the proven `CapturedExperienceBridge` — pattern is already documented and operators understand it
- One warm `DreamEngine` instance per kernel process — no per-cycle cold init
- stderr from the cycle goes to the kernel's logger, not the hook reader's black hole
- Loop-health writer (#488 Phase 1 B.2) populates `components.dreamScheduler`, giving operators visibility
- 10-second SQLite write block moves to the long-lived process where it competes with one other writer per node (the worker daemon), not N hook subprocesses
- Establishes a maintainable boundary: hook subprocesses produce signals (counter bumps, table writes); kernel consumes them on its own cadence

**Cons:**
- Dream cycles depend on a kernel-owning process being alive. If the daemon dies and Claude Code isn't running, the loop stalls. Mitigated by #488 Phase 1 daemon pidfile fix + loop-health observability.
- The in-hook trigger path is removed. If `incrementDreamExperience` works but the kernel scheduler is broken, the loop silently stalls. Mitigated by loop-health alerting (`aqe learning loop-health` shows the `dreamScheduler` component as `stale` / `never-ran` if the scheduler isn't ticking) and the rollback path documented under Migration.
- Boundary rule requires enforcement. A future contributor could re-add a `checkAndTriggerDream` call to hooks and undo this ADR. Mitigated by a lint test that fails when `src/cli/commands/hooks-handlers/**` imports from `src/learning/dream/`.

### Option 2: Keep In-Hook Dream Trigger (Status Quo Post-#480, Rejected)

Leave `checkAndTriggerDream` in `editing-hooks.ts` and `task-hooks.ts`. Hooks pay the 10-second SQLite write block and cold engine init on every cycle.

**Why rejected:** Verifiable production issue. V0.03 evidence in #488 documents the 10s block; #480 issue body documents the stderr black hole. Continuing the status quo keeps both problems alive.

### Option 3: Separate Dream Worker Process (Rejected)

Spawn a dedicated `aqe dream-worker` process that polls the experience counter and runs cycles. Decoupled from the main MCP daemon.

**Why rejected:** Multiplies the lifecycle problem #488 Phase 1 just solved. The daemon's pidfile contract is already fragile (B.1 fix made it more reliable but not bulletproof); adding a second managed process doubles the surface area without addressing the root mismatch. The kernel-side scheduler is the right home because it shares the same eventBus and memory backend that domain plugins and the experience bridge already use.

### Option 4: SQLite Advisory Locks for Concurrent Dream Cycles (Rejected)

Keep the in-hook trigger but coordinate via `BEGIN EXCLUSIVE` or an advisory lock kv key. Only one dream cycle runs at a time across all hook subprocesses.

**Why rejected:** Papers over the architectural mismatch without fixing it. The cold engine init still runs in a short-lived process; stderr is still lost; failures still have no retry. Locking only reduces queue depth, not the fundamental cost.

### Option 5: Hybrid (Kernel-Side Primary + Hook Fallback) (Considered, Not Selected)

Run both paths simultaneously: kernel-side scheduler is the primary trigger; hook-side `checkAndTriggerDream` fires only when the kernel scheduler hasn't run in N minutes.

**Why not selected for this ADR but reserved as fallback:** Adds complexity (state coordination, "who ran last" arbitration, double-write avoidance) for marginal benefit. If post-deploy smoke reveals a gap, the rollback path (see Migration → Rollback) is simpler than maintaining a hybrid mode in code.

---

## Architecture

### Components

```
QEKernelImpl (src/kernel/kernel.ts) -- MODIFIED
├── new _dreamScheduler?: DreamScheduler  (private, owned by kernel)
├── initialize()
│     └── construct DreamScheduler with kernel's eventBus + memory + DreamEngine
│     └── dreamScheduler.start()  (mirrors _experienceBridge.start at line 325)
└── dispose()
      └── dreamScheduler.stop() before bus/memory dispose (mirrors _experienceBridge cleanup)

DreamScheduler (src/learning/dream/dream-scheduler.ts) -- EXISTING, NEWLY WIRED
├── start()        -- registers setInterval polling
├── stop()         -- clears interval
├── tick()         -- reads dream-scheduler:hook-state.experienceCount,
│                     checks cooldown, runs cycle if conditions met
└── (writes loop-health on each tick via the helper from ADR Phase 1)

editing-hooks.ts / task-hooks.ts (src/cli/commands/hooks-handlers/) -- MODIFIED
├── incrementDreamExperience(memoryBackend)   -- KEPT (cheap counter bump)
├── checkAndTriggerDream(memoryBackend)       -- REMOVED
├── JSON output retains dreamTriggered field   -- now always false from the hook side,
│                                                with a "deferred-to-kernel" reason
└── (operators reading the JSON see reason='deferred-to-kernel' so they're not
   surprised when dreamTriggered is always false in hook output)

src/learning/loop-health.ts -- ALREADY WIRED (Phase 1 B.2)
└── components.dreamScheduler populates on every kernel-side cycle
```

### Lifecycle

```
Kernel boot (MCP server start, daemon start, CLI command with --kernel)
  └── QEKernelImpl.initialize()
       ├── eventBus + memory + plugins
       ├── CapturedExperienceBridge.start()  (existing, since v3.9.27)
       └── DreamScheduler.start()            (NEW)
            └── setInterval(60_000, tick)    (poll once per minute by default)

Hook subprocess (npx aqe hooks post-edit ...)
  └── incrementDreamExperience(memory)        -- bumps counter, exits in ~50ms
       (NO checkAndTriggerDream call any more)

Kernel-side scheduler tick (every 60s)
  └── read dream-scheduler:hook-state.experienceCount
  └── enforce cooldown (minTimeBetweenDreamsMs = 5 min default)
  └── if (experienceCount >= 20 || timeSinceLastDream >= 1h):
        └── DreamEngine.dream(10_000)
              └── insight loop, applyInsight to qe_patterns
        └── reset experienceCount to 0
        └── update dream-scheduler:hook-state.lastDreamTime
        └── recordLoopHealth(memory, 'dreamScheduler', { success: true })

Kernel shutdown
  └── DreamScheduler.stop()                   (NEW, before bus/memory dispose)
  └── CapturedExperienceBridge.stop()
  └── dispose eventBus + memory + plugins
```

### Boundary Contract: Hooks-as-Producers

This ADR formalizes the architectural rule that emerged organically from #479's bridge work:

> **Hook subprocesses MUST NOT do work that exceeds ~100ms.**
>
> Acceptable hook-side work:
> - SQLite writes to producer tables (`captured_experiences`, `kv_store` cursor bumps)
> - Counter increments (`incrementDreamExperience`)
> - Routing lookups that read from the in-memory ReasoningBank
>
> Unacceptable hook-side work (must be moved to the kernel via the bridge pattern):
> - Multi-second engine initialization (`DreamEngine.initialize`, `QEReasoningBank.initialize`)
> - SQLite write transactions exceeding ~100ms (`dream cycle insights apply` loop)
> - LLM API calls (current LLM router is kernel-only; verify on review)
> - Anything that depends on long-lived in-memory state (event subscriptions, plugin handlers)

Enforcement: a new test in `tests/unit/architecture/hooks-boundary.test.ts` greps the `src/cli/commands/hooks-handlers/` tree for imports from `src/learning/dream/`, `src/learning/qe-reasoning-bank.ts` (full instance), or any module flagged as "kernel-only". The test fails on regression — a contributor adding a new `checkAndTriggerDream` style call gets a clear error in CI.

---

## Migration Plan

### Single Cutover (No Feature Flag)

Per maintainer decision: this ships in one release with no deprecation window. Rationale:

1. Hook-side `checkAndTriggerDream` was always best-effort — failures already silently fell through a `try { ... } catch { /* best-effort */ }` block. Removing the path doesn't introduce a new failure mode; it removes a slow path that was masking the real one.
2. The boundary contract is cleaner enforced from day one. A feature flag would invite "the hybrid worked for me" feedback that gradually erodes the contract.
3. Loop-health observability (#488 Phase 1 B.2) gives operators a clear post-deploy signal: `aqe learning loop-health` shows `components.dreamScheduler` as live or stale. If kernel-side coverage has a gap, it's visible immediately.
4. The kernel-side path defaults on (`enableDreamScheduler: true`). Short-lived CLI commands that don't need dream cycles can still opt out via `enableDreamScheduler: false` — that's a kernel config decision, not a user-facing flag.

### Post-Deploy Smoke (run after the release lands)

1. **Vanilla shop:** fresh `npm install -g agentic-qe@<new-version>` + `aqe init --auto` + start the daemon. Run 25 `aqe hooks post-edit` invocations. Wait 60s. Inspect:
   - `dream-scheduler:hook-state.lastDreamTime` advances (kernel-side scheduler ran)
   - `dream_cycles` row count grows by ≥1
   - `learning:loop-health.components.dreamScheduler.successesSinceBoot ≥ 1`
   - `aqe learning loop-health` reports `dreamScheduler` as `live`

2. **State-rich shop:** existing V0.03 / V0.04 shops with accumulated `captured_experiences`. After kernel restart, verify the same conditions hold within one `autoScheduleIntervalMs` window (default 1 hour).

3. **Concurrent writer test:** during a kernel-side dream cycle, run 5 parallel `aqe hooks post-edit` invocations. Assert:
   - None block for >100ms (the 10s SQLite write transaction is no longer in the hook subprocess)
   - All complete successfully
   - No `SQLITE_BUSY` errors in `daemon.log`

### Rollback

If kernel-side coverage proves unreliable, the rollback path is:

1. Set `enableDreamScheduler: false` in the kernel config of MCP server + daemon entry points (single env var or config override).
2. Reintroduce `checkAndTriggerDream` calls in `editing-hooks.ts` and `task-hooks.ts` (the function itself was kept in `hooks-dream-learning.ts` for exactly this reason — it's not deleted, just no longer imported by the hook handlers).
3. Update the boundary-enforcement test's `allowedFiles` list to permit the reintroduced imports.

The rollback is a 4-line change. The boundary test makes it impossible to do this accidentally.

---

## Risks

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Kernel-side scheduler doesn't fire because the daemon isn't running | Medium | High | #488 Phase 1 B.1 fixes daemon pidfile; B.2 loop-health makes the failure visible. `aqe daemon status` is the operator's first check. |
| Concurrent dream cycles between MCP server + worker daemon | Low | Medium | DreamScheduler's `minTimeBetweenDreamsMs` cooldown is process-local. Cross-process coordination via kv `dream-scheduler:hook-state.lastDreamTime` already exists (engine reads it). |
| Post-deploy smoke doesn't catch all edge cases | Medium | Medium | Rollback path is a 4-line change (set `enableDreamScheduler: false` + re-add the imports). Loop-health observability gives a clear go/no-go signal within 1 hour of deploy. |
| Boundary contract gets violated by a future contributor | Medium | Low | Boundary-enforcement test in CI. ADR linked from `CONTRIBUTING.md`. |
| Existing test fixtures that mock `checkAndTriggerDream` need updates | Low | Low | Mechanical refactor; tests that asserted hook-side invocation become tests that assert the deferred-to-kernel JSON output. |

---

## Telemetry

| Metric | Source | Purpose |
|--------|--------|---------|
| `learning:loop-health.components.dreamScheduler.successesSinceBoot` | Loop-health writer (ADR Phase 1 B.2) | Confirm scheduler is alive after deprecation flip |
| `learning:loop-health.components.dreamScheduler.lastError` | Loop-health writer | Alert on persistent dream cycle failures |
| `dream_cycles` row growth rate per hour | SQLite query | Verify cycle cadence matches `autoScheduleIntervalMs` config |
| Hook-side `dreamTriggered.reason='deferred-to-kernel'` count | Hook JSON output (post-cutover) | Confirms hooks are exiting cleanly with the new contract — operators reading the JSON see *where* the cycle actually runs, not a bare `false` literal |

---

## Implementation (Landed)

### `src/kernel/kernel.ts`

`QEKernelImpl` gains a `_dreamScheduler?: DreamScheduler` field and the `KernelConfig.enableDreamScheduler` option (default `true`). In `initialize()`, after the bridge starts:

```typescript
if (this._config.enableDreamScheduler !== false) {
  try {
    const dreamEngine = createDreamEngine({
      maxDurationMs: 10_000,
      minConceptsRequired: 3,
    });
    await dreamEngine.initialize();
    this._dreamScheduler = new DreamScheduler({
      dreamEngine,
      eventBus: this._eventBus,
      memoryBackend: this._memory,
    });
    await this._dreamScheduler.initialize();
    this._dreamScheduler.start();
  } catch (err) {
    console.warn('[QEKernel] DreamScheduler failed to start:', err instanceof Error ? err.message : err);
    this._dreamScheduler = undefined;
  }
}
```

`dispose()` stops the scheduler before bus/memory cleanup (mirrors the `_experienceBridge` shape).

### `src/learning/dream/dream-scheduler.ts`

`executeDream()` records loop-health on every tick:

```typescript
} catch (err) {
  dreamError = err instanceof Error ? err : new Error(String(err));
  throw err;
} finally {
  this.dreaming = false;
  if (this.memoryBackend) {
    await recordLoopHealth(this.memoryBackend, 'dreamScheduler', {
      success: !dreamError,
      error: dreamError,
    });
  }
}
```

### `src/cli/commands/hooks-handlers/editing-hooks.ts` and `task-hooks.ts`

Both handlers drop the `checkAndTriggerDream` import and call. They keep `incrementDreamExperience` (cheap counter bump). JSON output surfaces `dreamTriggered: false, dreamReason: 'deferred-to-kernel'` so operator scripts that grep the field see *where* the cycle runs.

### `src/cli/commands/hooks-handlers/hooks-shared.ts`

Removes the `checkAndTriggerDream` re-export. The function is still exported from `hooks-dream-learning.ts` for direct test access and the documented rollback path.

### `tests/unit/architecture/hooks-boundary.test.ts`

Greps the `src/cli/commands/hooks-handlers/` tree for forbidden patterns:

- imports from `src/learning/dream/`
- references to `checkAndTriggerDream` (with `hooks-dream-learning.ts` in `allowedFiles` since it defines the function)

Comments are skipped so explanatory mentions don't false-positive.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-014 | Background Workers for QE Monitoring | Daemon process owns the kernel that hosts the scheduler |
| Depends On | ADR-021 | QE ReasoningBank for Pattern Learning | DreamEngine consumes the pattern store |
| Depends On | ADR-046 | v2 Feature Integration | Original dream cycle integration |
| Relates To | ADR-069 | RVCOW Dream Cycle Branching | Cycle safety mechanism unchanged by this ADR |
| Builds On | Issue #479 / v3.9.27 | CapturedExperienceBridge | Same architectural pattern, applied to dream cycles |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| ISSUE-488 | Production-readiness blind spots in post-v3.9.29 self-learning loop | GitHub Issue | https://github.com/proffesor-for-testing/agentic-qe/issues/488 |
| ISSUE-480 | post-edit dream trigger never fires | GitHub Issue | https://github.com/proffesor-for-testing/agentic-qe/issues/480 |
| COMMIT-66553141 | #480 + #487 fixes | Git | working-april branch |
| COMMIT-4c0bdfaf | #488 Phase 1 (daemon pidfile + loop-health) | Git | working-april branch |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Maintainer Review | 2026-05-15 | **Accepted** (no feature flag, single cutover) | 2026-11-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-05-15 | Initial draft for maintainer review per #488 Phase 2 plan. |
| Accepted | 2026-05-15 | Maintainer reviewed and approved. Modification from draft: no feature flag, single cutover (rationale documented under Migration). |
| Implemented | 2026-05-15 | Wired in `src/kernel/kernel.ts`, dream-scheduler emits loop-health, hooks dropped `checkAndTriggerDream`, boundary test in `tests/unit/architecture/hooks-boundary.test.ts`. 583/583 tests pass across impacted suites; build clean. |
