# System Integrity Remediation — GOAP Plan

**Source:** [`docs/analysis/SYSTEM-INTEGRITY-AUDIT-2026-07-04.md`](../analysis/SYSTEM-INTEGRITY-AUDIT-2026-07-04.md)
**Date:** 2026-07-04
**Method:** Goal-Oriented Action Planning — goal state, current state, gap, action inventory (precondition/effect/cost), A*-ordered plan, replanning triggers.
**Constraint set (from CLAUDE.md, binding on every action below):**
- No destructive DB operation without explicit user confirmation + `cp file.db file.db.bak-$(date +%s)` backup + row-count verification before/after.
- No mocked/simulated test runs when a fix touches production code — reproduce with real commands first.
- Every CLI-touching fix needs MCP-CLI parity verification (real MCP tool call **and** real CLI invocation).
- Files stay under 500 lines; no new files unless necessary; nothing lands in the repo root.
- Adapter/production-path changes get explained + confirmed before applying (Production Safety section).
- Grep the whole codebase for the problematic pattern before patching — several audit findings (e.g. `recordUsage` not called, mock executor) are single-symptom evidence of a broader class.

---

## 1. Goal State (what "done" looks like)

Organized as testable predicates, grouped by the audit's own priority tiers. A predicate is "true" only when its **Validation** (§6/§7/§8, user-observable) column can be demonstrated with a real command, not just a passing unit test.

**P0 — regressions closed:**
- G1: The 2026-05-14 write-freeze root cause is identified and named (not necessarily "fixed" as one action — may fan out into G7/G10/G13 fixes).
- G2: `routing_outcomes` receives new rows on real prompt submission (post-fix `MAX(created_at)` advances beyond 2026-06-02).
- G3: A real MCP test-execution produces a row in `test_outcomes`/`execution_results`/`coverage_sessions` in the *canonical* `.agentic-qe/memory.db`, not an orphan.
- G4: Running AQE commands from any CWD writes to one canonical `.agentic-qe/memory.db`; orphan clones are inventoried, backed up, and consolidated or removed with verified row counts.

**P1 — feedback loops closed:**
- G5: A dream cycle's insights, when applied, produce a real row in `qe_patterns` (not a fake `dream-pattern-<uuid>`).
- G6: `rl_q_values` accumulates rows tied to a real agent identity (not `'unknown'`) as normal Bash/Edit/Task work happens — no synthetic driver needed.
- G7: `qe_pattern_usage` gets a row every time a pattern created via consolidation or dream is subsequently matched/retrieved.
- G8: `sona_fisher_matrices` gets at least one row after a normal multi-invocation session (no manual test harness required).
- G9: `qe_pattern_nulls` gets a row when a real (production-path) experience capture fails with `appliedPatterns` populated.

**P2 — hygiene & enforcement:**
- G10: ADR-047/068/069/036 status fields match runtime reality (downgraded, or the gap is closed and then re-upgraded).
- G11: `npm run` (or CI) has a step that runs full-chain `verify()` over `witness_chain` and fails the build on a broken link; Ed25519 signing populates `signature`/`signer_key_id` on new rows.
- G12: `goap_plan` → `goap_execute` succeeds end-to-end via MCP on a fresh goal, OR the tools are marked experimental in their MCP descriptions until it does.
- G13: `captured_experiences` noise (cli-hook generic rows) is filtered/tagged so aggregates (pattern success rate, etc.) are computed over signal, not noise.
- G14: `mincut_snapshots` reflects a non-constant graph when agents are actually spawned, or the heartbeat is disabled until it does.
- G15: CLI `memory search` and MCP `memory_search` return equivalent (HNSW-backed) results for the same natural-language query.
- G16: `aqe health` reports whether the background worker daemon is up, and consolidation/snapshot jobs don't silently no-op when it's down.

## 2. Current State

Full detail in the audit; the load-bearing facts for planning:
- Capture-side writers (`captured_experiences`, `qe_trajectories`, `dream_cycles`, `queen:metrics`) are alive **today**.
- Four independent tables froze on **2026-05-14** (`qe_pattern_usage`, `sona_patterns`, `witness_chain`, `witness_chain_receipts`) — same day, unexplained; strong prior that one shared dependency changed.
- `routing_outcomes` froze **2026-06-02** — different date, likely unrelated cause (best-effort `catch` swallowing an insert error).
- `execution_results`/`test_outcomes`/`coverage_sessions` have been dormant for months, independent of the above two dates — likely explained by CWD-relative DB pollution (orphan clones absorbing writes).
- Several "loop closure" bugs are **not** regressions — they're code that was *never* wired (dream `applyInsight` stub, `qe_pattern_nulls` writer, mincut self-healing, GOAP plan persistence). These don't need bisection, just implementation.

## 3. Gap → Action Map

| Gap | Closing action(s) |
|---|---|
| G1 (freeze root cause) | A1 |
| G2 (routing_outcomes) | A3 |
| G3 (result persistence) | A4, A5 |
| G4 (CWD pollution) | A5, A6 |
| G5 (dream flow-back) | A8 |
| G6 (Q-loop throughput) | A9 |
| G7 (pattern usage feedback) | A7 |
| G8 (SONA Fisher) | A10 |
| G9 (ADR-110 nulls) | A11 |
| G10 (ADR statuses) | A12 |
| G11 (witness enforcement) | A13 |
| G12 (GOAP e2e) | A14 |
| G13 (noise control) | A15 |
| G14 (mincut realism) | A16 |
| G15 (CLI/MCP parity) | A17 |
| G16 (daemon visibility) | A18 |

## 4. Action Inventory (precondition → effect → cost)

Cost = relative effort/risk (S=hours, M=1 day, L=2-3 days, XL=needs a design decision from the user first). Costs are directional, for A* ordering, not commitments.

| # | Action | Precondition | Effect | Cost |
|---|---|---|---|---|
| A1 | Bisect 2026-05-14 freeze | read access to git history | root cause named, G1 satisfied | M |
| A2 | Fix root cause from A1 | A1 done | writes resume on the affected table(s) | M–L (depends on finding) |
| A3 | Fix route-persist swallow | none | `routing_outcomes` INSERT errors are surfaced/fixed | S |
| A4 | Trace ADR-036 dormancy | none | root cause named (dead call site vs. orphan-DB absorption) | S |
| A5 | Fix CWD-relative DB resolver | A4 (informs whether this is the cause) | new DB ops always target canonical path regardless of CWD | M |
| A6 | Consolidate/remove orphan DB clones | A5 done (else orphans regenerate); explicit user confirmation + backup | one canonical DB, verified row counts | S (mechanical, gated on confirmation) |
| A7 | Wire `recordUsage()` into consolidation/dream pattern-creation paths | none (independent of A1/A2) | new patterns get usage rows on match; add FK cascade for orphaned usage rows | M |
| A8 | Replace `applyInsight` stub with real promotion; disable/fix dead insight detectors; clear 2 stuck cycles | none | dream insights become real patterns | M |
| A9 | Capture real agent identity in PostToolUse hooks; widen Q-training trigger | none | `rl_q_values` accumulates under normal use | M |
| A10 | Break SONA EWC++ cold-start deadlock | none | `sona_fisher_matrices` populates after normal multi-session use | S–M |
| A11 | Wire null recorder into `LearningService.recordExperience` (the path that actually runs) | none | `qe_pattern_nulls` populates on real failures | S |
| A12 | Re-status ADR-047/068/069/036 | A1-A11 outcomes known (so the re-status is accurate, not another stale claim) | ADR status matches reality | S |
| A13 | Witness CI gate + Ed25519 signing + archival bugfix | none (independent) | tamper-evidence enforced, not latent | M |
| A14 | GOAP: persist plans, wire real executor or mark experimental, purge fixture pollution | user decision: fix vs. mark-experimental (XL vs S) | `goap_plan`→`goap_execute` works, or is honestly labeled | S or XL |
| A15 | Noise control: tag/filter cli-hook experiences; TTL/rollup `queen:metrics` | none | aggregates computed over signal | S |
| A16 | Mincut: emit `agent:spawned` or disable heartbeat; guard exploration-gate false-critical | none | graph reflects reality or heartbeat is honestly off | S–M |
| A17 | CLI `memory search` gets HNSW path | none | CLI/MCP parity for search | S |
| A18 | `aqe health` surfaces daemon status; snapshot job scheduled from worker | none | user sees why learning stalled | S |

## 5. Plan Sequencing (A* path)

Diagnostics before fixes, independent work in parallel, destructive ops gated last within their group.

```
Phase 0 (guardrails, run once, parallel):
  A1  Bisect 2026-05-14 freeze         ─┐
  A3  Fix route-persist swallow        ├─ P0 diagnostics/quick fixes, no interdependency
  A4  Trace ADR-036 dormancy           ─┘

Phase 1 (P0 fixes, sequenced on Phase 0 results):
  A2  Fix freeze root cause  (needs A1)
  A5  Fix CWD DB resolver    (informed by A4)
  A6  Consolidate orphan DBs (needs A5 + user confirmation + backup)

Phase 2 (P1, independent of each other and of Phase 1 — start in parallel):
  A7  Pattern usage feedback wiring
  A8  Dream flow-back
  A9  Q-loop throughput
  A10 SONA Fisher deadlock
  A11 ADR-110 nulls wiring

Phase 3 (P2, mostly independent; A12 waits on Phase 1+2 outcomes):
  A13 Witness CI gate + signing
  A14 GOAP persistence/executor (needs explicit user decision: real spawner vs. experimental-label)
  A15 Noise control
  A16 Mincut realism
  A17 CLI/MCP search parity
  A18 Daemon visibility
  A12 Re-status ADRs (LAST — needs A2/A7/A8/A9/A10/A11/A13/A14/A16 outcomes to write accurate status)
```

**Why this order:** A1/A3/A4 cost nothing to run in parallel and de-risk everything downstream — e.g., if A1's bisection reveals the freeze was caused by the *same* CWD-resolver bug behind A4/A5, then A2 collapses into A5 and effort drops. Re-statusing ADRs (A12) is deliberately last: writing "Status: Implemented" before the fix is verified is exactly the mistake this audit found four times.

---

## 6. Phase 0 — Diagnostics & Quick Fixes

### A1 — Bisect the 2026-05-14 write freeze
- **Precondition:** none.
- **Effect:** root cause named for why `qe_pattern_usage`, `sona_patterns`, `witness_chain`, `witness_chain_receipts` all stopped writing the same day.
- **Cost:** M.
- **Implementation:** `git log --since=2026-05-10 --until=2026-05-18 --oneline -- src/learning/pattern-usage-recorder.ts src/integrations/ruvector/sona-persistence.ts src/audit/witness-chain.ts src/governance/witness-chain.ts src/learning/experience-capture.ts src/learning/experience-capture-middleware.ts`. Look for a shared dependency touched in that window (a feature-flag default flip in `feature-flags.ts`, a refactor of the experience-capture entrypoint, or a hook config change in `.claude/settings.json` history). Cross-reference with `docs/analysis/project_memorydb_wal_bind_mount_corruption.md`-adjacent incident notes (memory says WAL corruption was 2026-06-08 — a different date; confirm it's not the same event misdated).
- **Integration:** N/A — this is investigation only, produces a written finding (append to this plan's "Findings Log" §9).
- **Verification:** the finding must cite a specific commit/PR and explain the causal mechanism (not just "something changed around then"). Cross-check by reverting the suspected change locally (in a worktree, not the working tree) and confirming a write would have succeeded before it.
- **Validation (user perspective):** none yet — this action only produces the diagnosis that A2 acts on.

### A3 — Fix route-persist swallow (`routing_outcomes` frozen 2026-06-02)
- **Precondition:** none.
- **Effect:** `routing_outcomes` INSERT failures are either fixed or surfaced (no longer silently swallowed).
- **Cost:** S.
- **Implementation:** `src/*/routing-hooks.ts:168` (INSERT), `:203` (catch). Reproduce first per CLAUDE.md: run the real `UserPromptSubmit` hook with a real stdin event (`echo '{"prompt":"..."}' | node .claude/hooks/aqe-hook.cjs route`) and observe whether the catch fires and what error it swallows. Fix the actual cause (likely a schema mismatch, a null `$PROMPT`, or a changed column) rather than just removing the catch.
- **Integration:** already wired via `UserPromptSubmit` in `.claude/settings.json` — no new wiring needed, just make the existing path succeed.
- **Verification:** real hook invocation (not a mock) → `sqlite3 memory.db "SELECT MAX(created_at) FROM routing_outcomes"` advances past today's run. Add a regression test that asserts the INSERT path throws loud on malformed input instead of silently catching.
- **Validation (user perspective):** after a normal Claude Code session with several prompts, `sqlite3 memory.db "SELECT COUNT(*) FROM routing_outcomes WHERE created_at > '2026-06-02'"` is non-zero, and `aqe learning status` (or equivalent) routing-confidence figure is computed from fresh data.

### A4 — Trace ADR-036 result-persistence dormancy
- **Precondition:** none.
- **Effect:** root cause named — is it a dead call site, or are results landing in an orphan CWD-polluted DB (§A5/A6)?
- **Cost:** S.
- **Implementation:** instrument (temporarily, with `console.error`/debug logging — not permanent) `handler-factory.ts:919` and `command-hooks.ts:65,109`. Run one real MCP tool call that should produce a `test_outcomes`/`execution_results` row (a real test-execution through an MCP client, not a mock), then check **both** the canonical `.agentic-qe/memory.db` and any orphan clones found by `find / -name "memory.db" -path "*.agentic-qe*" 2>/dev/null` for the new row.
- **Integration:** N/A — diagnostic.
- **Verification:** finding must show the actual row landing (or not) in a specific file path.
- **Validation:** feeds A5 (if orphan) or A2/direct-fix (if dead call site).

---

## 7. Phase 1 — P0 Fixes

### A2 — Fix the 2026-05-14 freeze root cause
- **Precondition:** A1 complete.
- **Effect:** the four frozen tables resume accepting writes on their normal triggers.
- **Cost:** M–L, depends on A1's finding. If it's a shared feature flag: S. If it's a middleware refactor that needs re-threading through both `AQELearningEngine` and `LearningService`: L.
- **Implementation:** whatever A1 identifies. **If** it turns out to be the same `AQELearningEngine` vs `LearningService` split that kills ADR-110 (audit §3), fix both symptoms with one change: make `LearningService.recordExperience` (the path that actually runs in production) call the same downstream writers `AQELearningEngine.startCapture` does, rather than patching each dead writer individually. Grep for every other writer gated behind `AQELearningEngine` (per CLAUDE.md: "grep for ALL instances of the problematic pattern") before declaring this done.
- **Integration:** whichever hook/worker/service owns the fixed writer — confirm it's the production entrypoint (`LearningService`), not the parallel one nobody calls.
- **Verification:** real (non-mocked) session exercising the fixed path; confirm new rows in `qe_pattern_usage`, `sona_patterns`, `witness_chain`, `witness_chain_receipts` with `created_at` after the fix, via direct sqlite query on the canonical DB.
- **Validation:** `sqlite3 memory.db "SELECT MAX(created_at) FROM qe_pattern_usage"` (and the other 3 tables) shows today's date after a normal work session — no special test harness invoked.

### A5 — Fix CWD-relative `.agentic-qe/` root resolver
- **Precondition:** A4's finding (confirms this is worth fixing now vs. deferring).
- **Effect:** DB path resolution is anchored to the project root (or the explicitly configured `AQE_HOME`/similar), never to `process.cwd()` at hook/test/eval invocation time.
- **Cost:** M.
- **Implementation:** `src/learning/pattern-store.ts:11` (Issue #516) — replace CWD-relative resolution with a fixed anchor: walk up from `__dirname`/module location to find the project marker (`package.json` with the AQE package name, or a `.agentic-qe-root` marker file), or read an explicit env var set once at init. Grep the whole repo for the same CWD-relative pattern (other files may share it — the audit found `.rvf` branch files spawned the same way) before considering this done, per CLAUDE.md's "grep ALL instances" rule.
- **Integration:** every hook, CLI command, MCP handler, and test fixture that touches `.agentic-qe/` — confirm none of them override the resolved path with their own `process.cwd()`-based logic.
- **Verification:** write a regression test that `chdir`s into a nested subdirectory (e.g. `docs/`) before invoking a hook/CLI command that touches memory.db, and asserts no new `.agentic-qe/` directory is created there. Real command run, not mocked (per CLAUDE.md).
- **Validation (user perspective):** running any `aqe`/hook command from inside `docs/` or `.test-tmp/` no longer creates a `.agentic-qe/memory.db` in that directory — `find . -name memory.db` after a full test run shows exactly one file, at the project root.

### A6 — Consolidate/remove orphan `.agentic-qe/memory.db` clones
- **Precondition:** A5 complete (fixed the resolver — otherwise cleanup regenerates immediately); **explicit user confirmation**; backups taken.
- **Effect:** one canonical DB; orphan clones' unique data (if any) merged in, verified by row count; the rest removed.
- **Cost:** S (mechanical), but strictly gated.
- **Implementation:** **STOP before executing — this is a destructive operation and requires explicit user sign-off per CLAUDE.md Data Protection rules.** Procedure once confirmed: (1) `cp` every orphan `memory.db` to a timestamped backup; (2) `sqlite3 orphan.db "SELECT COUNT(*) FROM qe_patterns"` etc. for every populated table, record counts; (3) for any row not already present in canonical DB (compare by content hash / natural key, not just count), decide with the user whether to merge or discard (test-fixture data, per the audit, should likely be discarded, not merged); (4) only after merge is verified, delete orphan files; (5) re-run `PRAGMA integrity_check` and row counts on canonical DB post-merge.
- **Integration:** N/A (filesystem cleanup).
- **Verification:** before/after row counts on the canonical DB recorded and shown to the user; `PRAGMA integrity_check` passes.
- **Validation (user perspective):** `find /workspaces/agentic-qe -name "memory.db*" -not -path "*/node_modules/*"` returns exactly the canonical file (+ its `-wal`/`-shm`) and named `.bak-*` backups — no more surprise clones under `src/`, `docs/`, `.test-tmp/`.

---

## 8. Phase 2 — P1 Loop Closures

### A7 — Wire pattern-usage feedback into consolidation/dream creation paths
- **Precondition:** none (independent of Phase 1, though verifying against a post-A2 fresh baseline is cleaner).
- **Effect:** every pattern retrieval/match — regardless of which path created the pattern — calls `recordUsage()`.
- **Cost:** M.
- **Implementation:** add `recordUsage()` calls (`pattern-usage-recorder.ts:86`) at the actual **retrieval** sites (`test-generator.ts:1122/1140`, `pattern-matcher.ts:557`, context sources) rather than only at creation-time reinforcement — usage should be recorded on use, not creation, so it doesn't matter which path created the pattern. Add an `ON DELETE CASCADE` (or explicit cleanup query) so consolidation/pruning of a pattern also removes its orphaned usage rows — closing the 273-orphan gap the audit found.
- **Integration:** this affects every consumer of pattern retrieval (test generation, context sources, task hooks) — confirm each call site is updated, not just one.
- **Verification:** real test-generation run against a fixture project; confirm `qe_pattern_usage` gets a new row referencing the pattern that was actually matched, via direct query.
- **Validation (user perspective):** after running `qe-test-architect` (or equivalent) twice against similar code, `sqlite3 memory.db "SELECT pattern_id, usage_count FROM qe_pattern_usage ORDER BY updated_at DESC LIMIT 5"` shows a fresh, non-orphaned row; the "pattern success rate" banner reflects current, not 7-week-stale, data.

### A8 — Real dream insight → pattern promotion
- **Precondition:** none.
- **Effect:** applying a dream insight creates a genuine `qe_patterns` row (or explicitly declines with a reason), never a fake ID.
- **Cost:** M.
- **Implementation:** replace the stub in `dream-engine.ts:661-701` with the logic already proven correct in the MCP `apply` action (`dream.ts:419-527`, which calls `reasoningBank.storePattern`) — i.e., make the hook/scheduler auto-apply path call the *same* real promotion code the manual MCP path uses, instead of maintaining two implementations. Fix or explicitly disable the 3 dead insight detectors (`insight-generator.ts:289,432,521`) — if the fix isn't feasible short-term, turn them off rather than leave dead code implying capability. Manually clear (or add a stale-cycle reaper for) the 2 stuck `running` cycles, with backup per data-protection rules since this touches `dream_cycles` rows.
- **Integration:** `dream-scheduler.ts:638` (auto-apply) and the CLI/MCP dream commands both route through the same promotion function after this change.
- **Verification:** trigger a real dream cycle (`aqe learning dream` or MCP `qe/learning/dream`) end-to-end; confirm a new row in `qe_patterns` with real content, and that its `pattern_id` in `dream_insights.applied_pattern_id` (or equivalent) resolves to that real row — not a dangling fake UUID.
- **Validation (user perspective):** `sqlite3 memory.db "SELECT COUNT(*) FROM qe_patterns WHERE source='dream'"` is > 0 after a dream cycle runs and its insights are applied (manually or via scheduler); previously this was always 0.

### A9 — RL Q-loop throughput (agent identity + trigger breadth)
- **Precondition:** none.
- **Effect:** `rl_q_values` accumulates real state-action cells during ordinary use, not just synthetic test rows.
- **Cost:** M.
- **Implementation:** `task-hooks.ts:440` currently collapses `effectiveAgent` to `'unknown'` because `PostToolUse` doesn't expose agent identity — thread the actual subagent name through via `SubagentStop` correlation (session/task-id join) or by having agent invocations self-report identity into the hook payload. Widen the Q-training trigger beyond `^(Task|Agent)$` tool use (`task-hooks.ts:465`) to also fire on `SubagentStop`, since that's where real multi-agent work concludes.
- **Integration:** `.claude/settings.json` hook registrations for `PostToolUse`/`SubagentStop`; `hooks-dream-learning.ts:713` Bellman update consumer.
- **Verification:** run a real multi-agent task (e.g. spawn 2+ named agents via the Agent tool) and confirm `rl_q_values` gains a row with a **non-`unknown`** `state_key`/`agent_id`.
- **Validation (user perspective):** after a normal session involving subagents, `sqlite3 memory.db "SELECT COUNT(*) FROM rl_q_values WHERE agent_id != 'unknown' AND created_at > date('now','-1 day')"` is non-zero; over subsequent sessions, routing confidence (currently pinned at 40%) begins to move.

### A10 — Break the SONA EWC++ cold-start deadlock
- **Precondition:** none.
- **Effect:** `sona_fisher_matrices` gets populated after normal (not synthetic) multi-invocation use.
- **Cost:** S–M.
- **Implementation:** per the audit's own diagnosed fix surface (`sona-three-loop.ts:829-834`): persist `requestCount` independently of the Fisher row (e.g. its own small counter row in `kv_store` or a dedicated column), so restarts don't reset to 0 waiting on a Fisher write that can never happen; **or** drive `backgroundConsolidate()`/`forceLearn` from the existing 30-min consolidation worker (`10-workers.ts:77`) instead of relying purely on per-process request counts.
- **Integration:** the worker cron (if choosing the daemon-driven option) or the persistence layer (if choosing independent counter persistence).
- **Verification:** run several real CLI/MCP invocations that hit `instantAdapt` across separate processes; confirm the counter advances cross-process and a consolidation eventually fires, producing a `sona_fisher_matrices` row.
- **Validation (user perspective):** after a normal multi-session day of QE agent use, `sqlite3 memory.db "SELECT COUNT(*) FROM sona_fisher_matrices"` is > 0 for the first time; `sona_patterns.last_used_at` starts getting populated instead of staying NULL on every row.

### A11 — Wire ADR-110 kept-nulls into the production capture path
- **Precondition:** none (but re-check after A2 in case A1/A2 already touches this exact code).
- **Effect:** `qe_pattern_nulls` gets rows when real experience capture fails with applied patterns.
- **Cost:** S.
- **Implementation:** `LearningService.recordExperience` (`domains/learning-optimization/plugin.ts:658` / `coordinator.ts:1311`) — the path that actually runs — needs to (a) populate `appliedPatterns` the way `AQELearningEngine.startCapture` does, and (b) wire the same `nullRecorder` (`pattern-null-store.ts:53`). Prefer unifying on one capture engine over patching both, if A2's finding makes that feasible — two parallel capture services drifting is the root cause of this whole gap class.
- **Integration:** wherever `LearningService.recordExperience` is invoked from hooks/CLI/MCP.
- **Verification:** force a real failed experience with a known applied pattern (not a mock), confirm a row lands in `qe_pattern_nulls`.
- **Validation (user perspective):** after a real QE run that fails while a specific pattern was in play, `sqlite3 memory.db "SELECT COUNT(*) FROM qe_pattern_nulls"` moves off zero for the first time since the table shipped (2026-06-11).

---

## 9. Phase 3 — P2 Hygiene & Enforcement

### A13 — Enforce witness-chain verification + signing
- **Precondition:** none.
- **Effect:** a broken chain link fails CI/publish; new entries are signed.
- **Cost:** M.
- **Implementation:** add a script (or extend an existing one) that runs full-chain `verify()` over `witness_chain` (the 13,460-row audit chain, **not** the 29-row governance receipts `aqe audit verify` currently checks) and wire it into `.github/workflows/` (or the existing test/CI job) so a broken link fails the build. Instantiate `WitnessKeyManager` at the real construction sites (`witness-chain.ts:177,322`, `cli/brain-commands.ts:188`, `rvf-migration-coordinator.ts:162`) so `signature`/`signer_key_id` populate going forward. Fix the archival `DELETE`-breaks-link-recomputation bug (`witness-chain.ts:285-299`) **before** wiring any rotation trigger — do not enable archival until this is fixed.
- **Integration:** CI workflow; whichever service constructs `WitnessChain` in production.
- **Verification:** intentionally corrupt a row in a scratch copy of the DB and confirm the new CI check fails; confirm a real new witness-chain write (from a real pattern mutation) has a non-null signature after the fix.
- **Validation (user perspective):** a PR that (hypothetically) corrupted the chain would fail CI with a clear "witness chain integrity check failed at id=N" message instead of silently passing; `aqe audit verify --chain=audit` (new or corrected flag) reports on the 13,460-row chain, not just the 29 receipts.

### A14 — GOAP plan persistence + real executor (or honest experimental label)
- **Precondition:** explicit user decision on scope (S: label experimental; XL: build the real thing).
- **Effect:** `goap_plan` → `goap_execute` succeeds end-to-end, or the MCP tool descriptions say clearly that execution is simulated.
- **Cost:** S (labeling) or XL (real executor — needs a design decision on how `ClaudeFlowSpawner` wiring should work, out of scope for this plan to unilaterally choose).
- **Implementation (S path):** add `savePlan()` call inside `findPlan()` (`goap-planner.ts:306`) so `goap_execute` can actually find plans by ID — this alone fixes the "Plan not found" break even before tackling the mock executor. Update the MCP tool descriptions for `goap_execute`/`goap_status` to state execution is simulated (`successRate: 0.95` mock) until `ClaudeFlowSpawner` is wired. Also: guard test suites so they don't run GOAP tests against the production `.agentic-qe/memory.db` (root cause of the 45% fixture pollution) — point test fixtures at an isolated `:memory:` or temp DB. Migrate `plan-executor.ts` off inventing parallel tables onto the canonical `goap_execution_steps` schema, or formally drop that dead table via migration.
- **Integration:** MCP tool registry descriptions; test harness DB configuration.
- **Verification:** `goap_plan` then `goap_execute` on the same `planId` succeeds (no "Plan not found") via a real MCP call; a fresh test run leaves zero new fixture rows in the production DB (`sqlite3 memory.db "SELECT COUNT(*) FROM goap_actions WHERE name LIKE 'Test Action%'"` unchanged before/after `npm test`).
- **Validation (user perspective):** a user calling `goap_plan` then `goap_execute` via MCP with the returned `planId` no longer gets an error; if execution is still simulated, the tool's own description/response says so explicitly instead of returning results indistinguishable from real execution.

### A15 — Noise control
- **Precondition:** none.
- **Effect:** aggregate metrics (pattern success rate, experience quality) are computed over signal, with generic hook noise tagged or filtered; `queen:metrics` kv telemetry doesn't grow unbounded.
- **Cost:** S.
- **Implementation:** tag `cli-hook-post-command`/`cli-hook-post-edit` rows with a distinguishing `source`/`quality_basis` flag (already partially present — `agent='cli-hook'`) and update aggregate queries (`metrics-tracker.ts`, the session-start `[INTELLIGENCE]` banner computation) to exclude or downweight them by default. Add TTL/rollup for `kv_store` keys under `queen:metrics:*` — either an `expires_at` sweep (the column already exists unused) or a daily rollup into a single summary row.
- **Integration:** wherever aggregate stats are computed for user-facing banners/CLI output.
- **Verification:** re-run the pattern-success-rate query with and without the noise filter and confirm the numbers differ meaningfully (proving the filter isn't a no-op); confirm `kv_store` row count for `queen:metrics:*` stops growing unbounded after a TTL sweep runs.
- **Validation (user perspective):** the session-start `[INTELLIGENCE]`/pattern-success banners report a number that changes meaningfully when real qe-agent activity happens, rather than being dominated by every Bash/Edit call; `kv_store` size stabilizes instead of growing ~1,440 rows/day forever.

### A16 — Mincut realism
- **Precondition:** none.
- **Effect:** `mincut_snapshots` either reflects real agent topology, or the heartbeat is disabled rather than recording a constant fake reading; the ADR-095 exploration gate can't get permanently stuck "critical" on a degenerate graph.
- **Cost:** S–M.
- **Implementation:** wire `agent:spawned` domain events to actually fire from the Queen coordinator's real agent-spawn path so `onAgentSpawned` (`queen-integration.ts:327-336`) adds real vertices — or, if that's out of scope right now, gate the snapshot timer off `isEmptyTopology()` so it stops recording a constant, uninformative 14-node/mincut-0.0 reading every minute. Separately, patch `routing-topology-gate.ts` to not treat a graph with zero agent vertices as "critical" — that's the degenerate-topology false-positive hazard the audit flagged.
- **Integration:** `queen-coordinator.ts` agent-spawn lifecycle; `routing-topology-gate.ts` used by `qe-reasoning-bank.ts:560`.
- **Verification:** spawn 2+ real agents through the Queen coordinator and confirm `mincut_snapshots.vertex_count` increases beyond 14; confirm the exploration gate does not report `critical=true` when the graph is simply empty.
- **Validation (user perspective):** `mincut_snapshots` rows vary over time instead of being 200 identical copies; agent routing/exploration behavior isn't permanently dampened to 0.2× regardless of real system health.

### A17 — CLI/MCP search parity
- **Precondition:** none.
- **Effect:** `aqe memory search "<query>"` uses the same HNSW vector search as MCP `memory_search` for natural-language queries.
- **Cost:** S.
- **Implementation:** `src/cli/commands/memory.ts` — add the same NL-query detection and `kernel.memory.vectorSearch()` call path used in `src/mcp/handlers/memory-handlers.ts:240-248`, rather than keyword/LIKE only.
- **Integration:** none beyond the CLI command itself, since it should call into the same kernel service the MCP handler uses (reinforcing, not duplicating, the parity).
- **Verification:** run the identical natural-language query through both `aqe memory search` and MCP `memory_search`; results should overlap substantially (same underlying index).
- **Validation (user perspective):** a user gets semantically relevant results from the CLI, not just literal substring matches — e.g. searching for "flaky test detection" from the CLI now surfaces patterns about retry/quarantine even without the exact words.

### A18 — Daemon visibility + snapshot scheduling
- **Precondition:** none.
- **Effect:** `aqe health` reports background-worker daemon status; `learning_daily_snapshots` populates without a manual flag.
- **Cost:** S.
- **Implementation:** add a daemon-liveness check to `aqe health` output (PID file / heartbeat check against the worker process). Move `MetricsTracker.saveSnapshot()` (`metrics-tracker.ts:590`) from being reachable only via `learning.ts:531`'s manual `--save-snapshot` CLI flag into the existing 30-min consolidation worker cadence (`10-workers.ts:77`), so it fires automatically.
- **Integration:** `aqe health` command; consolidation worker's periodic tick.
- **Verification:** stop the daemon and confirm `aqe health` reports it down (not silently "healthy"); start the daemon, wait one tick, confirm a new `learning_daily_snapshots` row without any manual flag.
- **Validation (user perspective):** a user running `aqe health` can tell *why* learning/consolidation looks stalled ("daemon not running") instead of silently getting stale data with no explanation; `learning_daily_snapshots` has rows without ever having typed `--save-snapshot`.

### A12 — Re-status ADRs to match reality (run last)
- **Precondition:** outcomes of A1/A2/A7/A8/A9/A10/A11/A13/A14/A16 known.
- **Effect:** ADR-047, ADR-068, ADR-069, ADR-036 status fields (and any others touched above) accurately reflect what's implemented vs. designed vs. abandoned.
- **Cost:** S.
- **Implementation:** for each ADR, either (a) downgrade status from "Implemented" to "Partially Implemented" / "Proposed" with a dated note citing this audit and the remediation PR, or (b) if the corresponding action above fully closed the gap, keep "Implemented" and add a verification note (what test/command proves it). Do **not** mark anything "Implemented" without a command or test that a reader can run to confirm it — the exact gap this whole audit exists to close.
- **Integration:** N/A — documentation.
- **Verification:** each status claim in the ADR has an adjacent "Verified by: <command/test>" note.
- **Validation (user perspective):** a future engineer reading ADR-068 doesn't get misled the way this audit's authors could have been — the doc either says "not yet gating routing" plainly, or points at a passing test that proves it does.

---

## 10. Risk Factors & Replanning Triggers

- **A1 finds no single cause** (e.g. three unrelated bugs coincidentally landed the same day) → replan: split A2 into three independent sub-actions, re-cost as 3×S instead of 1×M-L, re-run Phase 1 in parallel instead of sequenced.
- **A5's resolver fix breaks an existing test fixture that intentionally uses a scratch CWD-relative DB** → replan: add an explicit `AQE_TEST_DB_PATH` override so tests keep isolation without relying on the bug being fixed accidentally providing it.
- **A6 orphan-DB row comparison finds genuinely unique, non-fixture data** (e.g. a real pattern only present in one clone) → replan: pause deletion, escalate to user for a merge decision before proceeding — do not silently discard.
- **A9's agent-identity threading requires a Claude Code hook API that doesn't expose what's needed** → fallback: correlate via session/task-id join against the Task tool's own logging instead of relying on PostToolUse payload changes.
- **A14's XL path (real executor) gets chosen** → this becomes its own follow-up GOAP plan; out of scope to sequence here beyond noting the design decision is needed before costing it.
- **Any action's "Verification" step fails on first real run** → do not proceed to the next dependent action; treat as a new finding, feed back into this plan's action inventory (per CLAUDE.md: reproduce, don't guess).
- **A13's CI gate produces false positives on legitimate archival/rotation** → block enabling archival until the link-recomputation bug is actually fixed (already sequenced this way above — flagging as a hard gate, not a suggestion).

## 11. Fallback

If Phase 1 diagnostics (A1/A4) don't converge on a clean root cause within the investigation budget, do not block Phase 2/3 — they are independent (per §5's dependency graph, only A2/A6/A12 have hard preconditions on Phase 0/1 outcomes). Proceed with P1/P2 actions and leave A1/A2/A6 as an open, explicitly documented investigation rather than stalling the whole remediation on one unresolved mystery.

## 12. Execution Tracking

This plan is the basis for follow-up task tracking (one task per action, dependency-ordered per §5). Findings from Phase 0 diagnostics should be appended to a "Findings Log" section added to this file as they're discovered, so A2/A5/A12 have a written record to act on rather than relying on conversation memory.

## 13. Findings Log

### A3 — CLOSED (2026-07-05)

**Root cause (not the swallowed-exception theory originally hypothesized):** `git log` on `.claude/settings.json` showed three commits landing on **2026-06-02** — the exact freeze date — introducing the "resilient hook shim" (`.claude/hooks/aqe-hook.cjs`, commit `1a695f56`). That commit's own message admits: *"the route/session-start hooks cold-start the full system (~30-60s) on each fire — logged for a perf follow-up."* The `route` hook's harness-level timeout in `settings.json` stayed at 5000ms. The shim's `spawnSync` call never checked `res.error`/`res.status`/`res.signal`, and the shim's own contract is "ALWAYS exit 0" — so a harness-timeout-kill, a spawn failure, or a child exiting non-zero with no output (e.g. `routing-hooks.ts`'s "No task provided" throw when `$PROMPT` resolves empty) were all silently indistinguishable from success. `.agentic-qe/hooks-health.log` never existed, confirming this wasn't a native-binary crash (that path *was* already instrumented) — it was a class of failure with zero observability.

Reproduced directly: invoking the exact real hook path with `$PROMPT` unset produced exit 0, empty stdout, zero DB row, in 69ms — indistinguishable from a no-op success. Invoking it with a real prompt succeeded in <1s with a genuine `routing_outcomes` row. Both confirmed by direct sqlite query.

**Fix applied (user-approved: "add observability + raise timeout"):**
- `.claude/hooks/aqe-hook.cjs`: added an internal `SPAWN_TIMEOUT_MS` (default 18000ms, overridable via `AQE_HOOK_TIMEOUT_MS`) passed to `spawnSync`, set below the harness timeout so the shim itself observes a stall before the harness kills it. Added checks for `res.signal` (timeout), `res.error` (spawn failure), and `res.status !== 0` with no JSON output (empty-result), each logged to `.agentic-qe/hooks-health.log` with cause and subcommand. `recordHookHealth` now also creates `.agentic-qe/` if missing.
- `.claude/settings.json`: raised `route` hook timeout 5000ms → 20000ms, `session-start` 10000ms → 25000ms (both flagged as cold-start-heavy in the original commit message).
- Tests: added 3 regression tests to `tests/unit/hooks/aqe-hook-shim.test.ts` (timeout→log, non-zero-exit→log, success→no log). All 10 tests in that file pass; full `tests/unit/hooks/` suite (38 tests) passes.
- Verified against the REAL (not fake-bundle) shim + current `dist/cli/bundle.js`: empty-`$PROMPT` repro now produces a clear `EMPTY-RESULT` log line (previously: nothing); a real prompt still succeeds and writes zero log noise, and `routing_outcomes` row count advanced 2167→2168.

**UPDATE (2026-07-05, same-day follow-up) — the real root cause was found and fixed, not just observed.** The observability fix immediately paid off: within this same live session, `hooks-health.log` recorded 3 real `EMPTY-RESULT (cmd=route)` failures from genuine Claude Code turns (not test invocations) plus one `SPAWN-FAILED ... ETIMEDOUT`, while `routing_outcomes` received **zero** organically-created rows all session (the only row was my own manual CLI test). This proved the failure was still live, not historical.

Root cause: `$PROMPT` is not reliably populated as an env var by Claude Code on every hook surface — confirmed by `hooks-shared.ts:344-347`'s own docstring: *"`$PROMPT`/`$TOOL_INPUT_*` are NOT exposed as env vars in every hook surface, so reading stdin is the only reliable fallback."* Claude Code actually delivers the event as JSON on **stdin** (confirmed by the sibling `hook-handler.cjs`'s own comment: *"Claude Code sends hook data as JSON via stdin"* — and that hook works correctly every turn). But `aqe-hook.cjs`'s `spawnSync` used `stdio: ['ignore', 'pipe', 'pipe']` — **discarding stdin before the child CLI process ever saw it**, breaking the CLI's own pre-existing, already-safe stdin fallback (`readStdinJsonEvent()`, which has its own internal 500ms timeout and can never hang).

**Fix:** changed `stdio: ['ignore', 'pipe', 'pipe']` → `['inherit', 'pipe', 'pipe']` in `.claude/hooks/aqe-hook.cjs`, letting the child inherit the shim's real stdin instead of discarding it. No CLI-side code change was needed — `extractPromptFromEvent`/`readStdinJsonEvent` already existed and were simply unreachable.

**Verification:**
- New regression test (`tests/unit/hooks/aqe-hook-shim.test.ts`): a fake bundle that echoes back whatever it receives on stdin, invoked with a real JSON payload — confirms stdin now reaches the child (previously would have received nothing). All 11 tests pass (10 prior + 1 new).
- Rebuilt `dist/cli/bundle.js`, then reproduced the **exact real Claude Code scenario** — `$PROMPT` unset, real JSON piped to stdin — against the rebuilt production bundle: real routing result returned, zero errors, no `hooks-health.log` entry, and a genuine new row landed in `routing_outcomes` (2168→2169). This is the precise scenario that had been failing all session (and, per A1's evidence, since 2026-06-02).

This closes the loop the earlier entry left open: the failure mode was neither a timeout nor a sandbox restriction — it was stdin being deliberately discarded by the shim while the harness had moved on from env-var-based prompt delivery.

**Blast radius is much larger than `route` alone.** `aqe-hook.cjs` is the shared shim for **every** hook subcommand (`guard`, `pre-edit`, `pre-command`, `pre-task`, `post-edit`, `post-command`, `post-task`, `route`, `session-start`, `session-end`) — the stdin-discard bug degraded all of them equally since 2026-06-02, not just routing. Direct evidence found in `captured_experiences`: **5,201 of 6,119 (85%) of `cli-hook-post-edit` rows have an empty file path** (`task = 'edit: '`), exactly matching the failure mode issue #453's code comment warned about (`editing-hooks.ts:110-114`: *"without this fallback, `$TOOL_INPUT_file_path` expansion silently produces `--file ""`"*) — the same env-var-unreliable/stdin-discarded mechanism, just for file paths instead of prompts. This is a material, previously-unattributed contributor to the original audit's "96.5% of captured_experiences is fixed-quality noise" finding: real edits were happening, but their identifying metadata was being silently stripped.

**Confirmed fixed going forward, in real usage, without any additional test:** the 3 real Edit-tool calls made immediately after this fix (to `aqe-hook.cjs` itself, the test file, and this plan file) all captured their correct file paths in `captured_experiences` — the first 3-for-3 clean run this session. The 5,201 historical empty-path rows are not retroactively fixable (the file path was never received), but the mechanism producing new ones going forward is now closed.

### A4 — CLOSED, no code fix needed (2026-07-05)

**Verdict: Hypothesis 3 — "simply not exercised."** Both ADR-036 writers resolve correctly to the canonical DB (via `getUnifiedMemory()`/`findProjectRoot()`, `src/kernel/unified-memory.ts:90-94`), NOT through `pattern-store.ts:11`'s CWD-relative resolver — so the orphan-DB-absorption hypothesis (A5/A6's target bug) does not apply here. All 8 orphan `.agentic-qe/memory.db` clones checked directly: every one is empty or table-less for `test_outcomes`/`execution_results`/`coverage_sessions` — none fresher than canonical. Absorption is ruled out.

Provenance proves the tables are simply unexercised, not broken:
- `test_outcomes` (22 rows) / `coverage_sessions` (7 rows): 100% tagged `generated_by='qe-test-generation'`/`'qe-coverage-analysis'` (the MCP path, `handler-factory.ts:283,308`). **Zero rows** carry the CLI path's tag (`'cli-hook-post-command'`, `command-hooks.ts:68`) — that writer (added 2026-05-05, live at `command-hooks.ts:404-406`, gated on `detectTestFramework` matching jest/vitest/pytest/mocha) has simply never fired because this repo's own `npm test` runs aren't routed through `aqe hooks post-command`.
- `execution_results` (530 rows, last 2026-02-26): written by a different subsystem (`src/planning/plan-executor.ts`, the GOAP mock executor from the audit's §7) — unrelated to ADR-036's writers, and that path stopped being exercised in February.
- No writer-string evidence (`recordDomainFeedback`, `cli-hook-post-command`) appears anywhere in `.agentic-qe/v3-hooks.log` for Jun–Jul, consistent with the MCP test-gen/coverage tools and the CLI test-hook simply not having been invoked, not with a crash.

**No code change warranted** — reclassify this from "P0 regression" to "expected dormancy, pending real usage." To positively confirm liveness (not required to close A4, but recommended before assuming it's fine), the sub-agent proposed a controlled exercise of each writer (one real MCP `qe-test-generation`/`qe-coverage-analysis` call, one real `aqe hooks post-command --command "npx vitest run ..."`) with a `memory.db` backup taken first per data-protection rules. **Awaiting user go-ahead before performing that write test** — it touches the shared production DB, even though the operation is an additive INSERT, not destructive.

### A1 — REVISED, converges with A4 (2026-07-05)

**Background agent's forensic finding (solid, keep):** all four tables (`qe_pattern_usage`, `sona_patterns`, `witness_chain`, `witness_chain_receipts`) share the IDENTICAL last-write timestamp `2026-05-14 13:37:53`, pointing to one shared writer path: `src/learning/qe-reasoning-bank.ts:418 recordOutcome()`. Two commits landed that day (`4e011a81` v3.9.27 — added a 10s `AbortSignal` around `reasoningBank.initialize()` whose failure path falls back to a fully in-memory backend, `hooks-shared.ts:158-179`; `b64540fe` #469 — swapped a mock embedding generator for a real `@xenova/transformers` load). Primary hypothesis (H1): the real transformer stalls/throws in this container → init falls into the in-memory fallback → every `recordOutcome()` call after that point succeeds (no exception) but persists nothing, because it's operating on RAM only.

**Direct live test REFUTES H1 as a *currently active* cause and reframes the finding:**
1. Ran `getHooksSystem()` directly (bypassing the CLI shim) — full log output shows normal initialization completing (`"[QEReasoningBank] Found existing patterns {"totalPatterns":154}"`, `"[hooks] System initialized"`), **no** `"Using fallback mode"` warning. The transformer/embedding load is NOT currently failing.
2. Triggered `recordOutcome()` via the real production `post-edit` hook (real `aqe-hook.cjs` → `dist/cli/bundle.js` path) — succeeded (exit 0) but wrote **zero** new rows. Root cause: all three CLI-hook call sites (`editing-hooks.ts:142`, `task-hooks.ts:420`, `command-hooks.ts:377`) pass **synthetic, never-matching pattern IDs** (`edit:domain:file`, `task:agent:id`, `cmd:slug`) — `patternStore.recordUsage()`'s in-memory lookup fails for these by construction, which gates `qe-reasoning-bank.ts:446`'s `if (result.success)` block — **witness_chain.append() and the SQLite pattern-usage insert for these specific call sites never fire, historically or today.** This is a separate, always-present design quirk in the CLI hooks, unrelated to the May 14 date.
3. Called `recordOutcome()` directly with a **real, existing** `qe_patterns.id` (bypassing the CLI hooks' synthetic-ID problem entirely) — **succeeded and wrote real rows, live, right now**: `qe_pattern_usage` 306→310, `witness_chain` 13460→13462 (verified via direct sqlite query with real timestamps `2026-07-05 06:54:51`).

**Revised conclusion:** the persistence code path is NOT currently broken. The May-14 freeze is not an ongoing regression in `recordOutcome`/witness-chain/pattern-usage machinery — it's that **nothing has invoked this path with a real, pattern-matched ID since that date**. This converges with A4's "simply not exercised" verdict for `test_outcomes`/`coverage_sessions`: both point to the same underlying fact — real MCP-tool-driven QE work (test-generation/coverage-analysis calls that produce genuine pattern matches) has not happened in this project since mid-May, for reasons external to this codebase (this session's own work has been audit/analysis, not QE-agent invocation). A secondary, real, previously-undiagnosed bug was found along the way: `[PatternStore] Delta recordDelta ...: fastJsonPatch.compare is not a function` — a broken `fast-json-patch` call in the delta-tracking path (feeds `pattern_deltas`), caught/logged internally so it doesn't block `recordOutcome`'s own success, but likely explains why `pattern_deltas`/`pattern_evolution_events` looked stale in the original audit (worth a small follow-up fix, not P0).

**`sona_patterns`'s freeze on the same date was NOT independently re-tested** (different write path, per the SONA audit — `sona-persistence.ts` savePatternToDb + a separate raw-SQL middleware path) — flagged as a residual open question rather than assumed to share this same "not exercised" explanation.

**Action-plan impact:** A2 ("fix root cause from A1") is **no longer needed as a code fix**. Downgrading from a P0 regression to: (a) note in ADR re-statusing (A12) that this was investigated and is not a bug; (b) fix the real, small `fastJsonPatch.compare is not a function` bug found along the way (new, small follow-up item); (c) leave `sona_patterns`'s exact mechanism as unconfirmed — either re-test directly (cheap, same technique as above) or accept the "not exercised" explanation by analogy.

**Housekeeping:** this investigation wrote 4 real rows to `qe_pattern_usage` and 2 to `witness_chain` in the live canonical DB (tagged `feedback = 'direct A1 confirming test — real pattern id'`, easily identifiable) as a deliberate, disclosed side effect of proving persistence works. A `memory.db` backup was taken beforehand (`memory.db.bak-1783234272`). **User decision: leave them** — real, correctly-formed, clearly tagged rows; not worth a DELETE operation for a documented test artifact.

### fastJsonPatch bug — FIXED (2026-07-05)

**Root cause:** `fast-json-patch` (`src/integrations/ruvector/delta-tracker.ts:13`) ships two entry points with different export shapes — its CJS entry (`index.js`) attaches named exports via `Object.assign(exports, core)`, but its ESM entry (`index.mjs`) exports **only a default object** bundling everything, with no named `compare`/`applyPatch` exports. `import * as fastJsonPatch from 'fast-json-patch'` lands on whichever shape the resolving loader picks — Node's native ESM resolution (used by `tsx` and, critically, by the production `esbuild` CLI bundle) picks the ESM entry, leaving `fastJsonPatch.compare` `undefined`. Confirmed this reproduces in the actual shipped `dist/cli/bundle.js`, not just ad hoc scripts — a real, live production bug, not a test artifact.

**Fix:** normalized the import in `delta-tracker.ts` to unwrap `.default` when present, falling back to the namespace itself otherwise (`const fastJsonPatch = (fastJsonPatchNs as {default?}).default ?? fastJsonPatchNs`), and fixed the one type reference (`fastJsonPatchNs.Operation`) that needed to stay on the original namespace import for type-only purposes.

**Verification:**
- `npx tsc --noEmit` — clean, no errors.
- Existing `tests/unit/integrations/ruvector/delta-tracker.test.ts` — 34/34 pass (both before and after; these tests never caught the bug because vitest's own module resolution happens to land on the working CJS shape — an instance of the audit's own "tests pass ≠ feature works" warning, since the bug only manifested under the bundler/ESM path real users hit).
- Re-ran the exact original repro (`reasoningBank.recordOutcome()` with a real pattern ID) via `tsx` against current `src/` — error gone, `{"success":true}`.
- Ran `npm run build:cli` to rebuild the actual shipped bundle, then re-ran the exact original repro (`node dist/cli/bundle.js hooks post-edit ...`) against it — confirmed **zero occurrences** of the error string in a fresh build. Fixed end-to-end, not just in source.

### A5 — REVISED: no source bug found; resolver already correct (2026-07-05)

The shared resolver (`src/kernel/project-root.ts`, extracted 2026-06-08 per commit `dc0ac612`) already implements "nearest `.agentic-qe` wins" correctly — walks up from CWD, prefers the nearest existing `.agentic-qe`, falls back to `.git` root, then `package.json`, then CWD. This is used by both `pattern-store.ts` and (via re-export) `unified-memory.ts` — the same resolver A4 already confirmed the ADR-036 writers use correctly. No currently-reproducible bug was found in this algorithm itself, and no eval/harness script was found setting `AQE_PROJECT_ROOT` to explain the orphans either. Given the reproduce-first principle, no speculative source change was made — this converges with A1/A4's pattern: the finding is about stale artifacts, not live code.

### A6 — DONE: orphan cleanup (2026-07-05)

Initially found 5 orphan `.agentic-qe` directories (the original audit's list); moved (not `rm -rf`, which was denied by the permission system — used `mv` to session scratchpad instead) after user review of exact contents and explicit approval, with the user waiving the backup requirement for these specific directories. Post-move verification (`find -name .agentic-qe`) surfaced **5 more previously-undiscovered orphans**, disclosed and separately approved before touching:
- `fixtures/arena-demo/.agentic-qe`, `benchmarks/interaction/scenarios/scenario-001-off-by-one/.agentic-qe`, `.claude/agents/v3/.agentic-qe` — RVF-only (no `memory.db`), nested inside otherwise-legitimate directories (a real arena fixture referenced by `tests/unit/arena/arena.test.ts`, a real benchmark scenario, and the actual agent-definitions folder) — only the nested `.agentic-qe` subdirectory was removed in each case, parent content untouched.
- `.agentic-qe/.agentic-qe` — a stray RVF-only duplicate nested *inside the canonical directory itself*.
- `.test-tmp/fixproof/.test-tmp/fixproof/.agentic-qe` — inside an already-fully-gitignored disposable nested test fixture.

All 10 total orphans confirmed via `git status --ignored` to be untracked/gitignored (via the blanket `*.db` rule or `.test-tmp/`, not a dedicated `.agentic-qe` ignore) before removal — none were shipped or committed. `find -name .agentic-qe` now shows exactly one directory in the whole repo (the canonical one). Post-cleanup verification: `PRAGMA integrity_check` = `ok`, `qe_patterns` count unchanged (154), real parent directories (`fixtures/arena-demo`, the benchmark scenario, `.claude/agents/v3`) confirmed intact with their actual content, and `git status` shows only the expected tracked diffs from the A3/fastJsonPatch fixes — no tracked file was affected by this cleanup.

## Phase 2 (P1 loop-closures) — in progress

### A9 — PARTIALLY FIXED: agent-identity stdin fallback (2026-07-05)

The stdin-discard bug fixed under A3 turned out to be the exact mechanism behind A9's "agent identity collapses to `'unknown'`" compounding cause too — `$TOOL_INPUT_subagent_type` (like `$PROMPT`) is not reliably populated as an env var, and `task-hooks.ts`'s `post-task` handler had no stdin fallback at all (unlike `editing-hooks.ts`'s file-path fallback and `routing-hooks.ts`'s prompt fallback).

**Fix:** added `extractAgentFromEvent()` to `hooks-shared.ts` (same convention as `extractFilePathFromEvent`/`extractPromptFromEvent` — checks `tool_input.subagent_type`/`toolInput.subagentType`/top-level variants) and wired it into `task-hooks.ts`'s `post-task` handler as a stdin fallback when `--agent` resolves empty, running *before* the existing `bridge.agent` fallback (issue #460) so the two layer cleanly: explicit `--agent` → stdin `subagent_type` → `bridge.agent` → `'unknown'`.

**Verification:**
- New unit tests (`tests/unit/cli/commands/hooks-agent-extraction.test.ts`, 7 tests) for the extractor.
- Confirmed the existing `post-task-agent-fallback.test.ts` (issue #460's own regression tests, including its "stays on unknown when nothing available" case) still passes unchanged — the new fallback is additive, not conflicting.
- **Real end-to-end verification** (learned from the A3 near-miss below): rebuilt with the **full** `npm run build` (not just `build:cli` — see build-process note), then reproduced the exact real scenario — empty `$TOOL_INPUT_subagent_type`/`$TOOL_RESULT_agent_id` env vars, real `PostToolUse` event JSON on stdin (`tool_input.subagent_type: 'qe-flaky-hunter'`) — against the rebuilt `dist/cli/commands/hooks-handlers/task-hooks.js`. Confirmed a new `rl_q_values` row with `action_key='qe-flaky-hunter'` (not `'unknown'`).
- Broader regression check: `tests/unit/hooks/` + `tests/unit/cli/commands/` — 184/184 pass.

**Build-process note (apply to all future dist-verification steps in this plan):** `npm run build:cli` alone only reruns the esbuild bundling step (`bundle.js` + `chunks/*.js`). The hook command handlers (`task-hooks.ts`, `editing-hooks.ts`, etc.) are served at runtime from a **separate, plain-`tsc`-compiled mirror** (`dist/cli/commands/hooks-handlers/*.js`) that only the full `npm run build` (`tsc && build:cli && build:mcp`) regenerates. A `build:cli`-only rebuild silently verifies against stale hook-handler code — always use the full `npm run build` when verifying a fix that touches `src/cli/commands/hooks-handlers/**`.

**Still open (not fixed, by design — needs a scope decision):** the plan's other A9 compounding cause — "`post-task` only fires on `^(Task|Agent)$` tool use, rare vs. direct Bash/Edit work" — is a `.claude/settings.json` hook-trigger-breadth question, not a code bug. Widening it (e.g. to also fire from `SubagentStop`) is a bigger, more architecturally visible change than this fallback and should be a separate, explicitly-scoped decision rather than bundled silently into this fix.

### A11 — FIXED: ADR-110 kept-nulls, real threading (2026-07-05)

**Real scope turned out narrower than the original "S" estimate, then required real investigation to resolve honestly** (user chose "do the full threading" after being told the true complexity):

1. Added `appliedPatternIds?: readonly string[]` to the `Experience` type (`domains/learning-optimization/interfaces.ts`).
2. Wired the ADR-110 null recorder into `LearningCoordinatorService.recordExperience` (`learning-coordinator.ts`) — the actual production capture path (`domains/learning-optimization/plugin.ts`'s 6 event handlers all funnel through it) — mirroring `AQELearningEngine`'s fail-soft lazy-wiring pattern (dynamic `getUnifiedPersistence()` + `PatternNullStore`, cached, never throws). Fires only when `!result.success && appliedPatternIds?.length`.
3. **Investigated all 6 domain event handlers for real pattern-application data before threading anything** (dispatched to a sub-agent first): only **test-generation** had real data ready (`GeneratedTests.patternsUsed`, already used elsewhere in the coordinator) — threaded through `TestGeneratedPayload` → `handleTestGenerated`. The other 5 (test-execution, coverage-analysis, quality-assessment, defect-intelligence, code-intelligence) genuinely have no pattern-ID tracking near their event payloads.
4. User asked to build new tracking in the "2 best candidates" the investigation suggested (defect-intelligence, coverage-analysis) — **both turned out to be dead ends for THIS goal, for two different reasons**, discovered only by tracing the actual data, not assuming the investigation's surface-level suggestion was sufficient:
   - **defect-intelligence**: `getHistoricalDefectPatterns` reads `defect-patterns:${file}`/`common-defect-patterns` KV keys that **nothing anywhere writes** — dead code, always returns empty.
   - **coverage-analysis**: `findSimilarAddressedGaps` returns real vector-search results, but `storeGapPatterns` writes them keyed `gap-pattern:${gap.id}` — a **self-referential coverage-gap ID space, not `qe_patterns.id`**. Threading these into `qe_pattern_nulls.pattern_id` would have corrupted the null store with IDs that never match a real pattern (worse than a no-op — silently breaks the null-discount lookup). Declined to implement this one.
5. Fixed defect-intelligence's dead code anyway, as a **separate, small, honest improvement** (not serving A11's goal, since `defectType` is a free-text category like `"null-pointer"`, never a `qe_patterns.id`): wired `updateModel()` to actually populate `defect-patterns:${file}`/`common-defect-patterns` from confirmed feedback (`actualDefect && defectType`), with dedup/capping matching the reader's expectations. This makes a previously-nonfunctional stated feature (historical defect pattern context for LLM-enhanced predictions) actually work, independent of ADR-110.

**Verification:**
- New tests: `hooks-agent-extraction.test.ts`-style coverage isn't relevant here, but added 4 new tests in `learning-coordinator.test.ts` (mocking `getUnifiedPersistence`/`PatternNullStore` via `vi.mock`) covering fire/no-fire-on-success/no-fire-without-patterns/fail-soft-when-unavailable — caught and fixed a real bug in the process: the file's existing `createTestExperience` test helper manually reconstructs the `Experience` object field-by-field and was silently dropping the new `appliedPatternIds` override until fixed.
- 5 new tests in `defect-predictor.test.ts` for the write-side fix (records/dedupes/skips-on-false-positive/skips-without-defectType).
- Broad regression: `tests/unit/domains/learning-optimization/`, `tests/unit/domains/test-generation/`, `tests/unit/domains/defect-intelligence/`, `tests/unit/hooks/`, `tests/unit/cli/commands/`, `tests/unit/integrations/ruvector/delta-tracker.test.ts` — 822/822 pass.
- **Real end-to-end verification** (full `npm run build`, real `.agentic-qe/memory.db`, real `initializeUnifiedPersistence()`, real `LearningCoordinatorService`, a real existing `qe_patterns.id`): called `recordExperience` with a failing test-generation outcome and the real pattern ID applied. `qe_pattern_nulls` went from **0 → 1** — the first row this table has received since it shipped on 2026-06-11. Row content confirmed correct: real `pattern_id`, `context_fingerprint = 'test-generation:test-generated'`, real `failure_mode`, `evidence_class = 'EXECUTED'`.

**Honest residual scope:** only test-generation experiences can produce real nulls today (and per the note in its handler, that specific event always represents success, so nulls won't fire from it in practice either — the wiring is correct and will fire the moment any domain records a real failed, pattern-guided experience). The other 5 domains remain honest no-ops until they get real pattern-tracking built (a separate, larger feature per domain, not part of this fix).

### A7 — FIXED: pattern usage feedback wiring (2026-07-05)

**Found while implementing A11 and worth calling out**: tracing `test-generator.ts`'s pattern-retrieval code exposed **two compounding, pre-existing bugs**, not just a missing call:

1. **Name-vs-ID confusion**: `patternsUsed.push(...applicablePatterns.map((p) => p.name))` — the shared `patternsUsed` array (used both for human-readable display in `result-saver.ts`/`cli/commands/test.ts` reports AND, after my A11 work, threaded into ADR-110's `appliedPatternIds`) contained pattern **names**, never `qe_patterns.id` values. Any usage/null-recording keyed on this array would have silently no-opped or matched nothing — the exact class of bug I declined to introduce for coverage-analysis under A11.
2. **Dead stub with a misleading comment**: the only *live* pattern-usage-recording call site, `coordinator.ts`'s `learnFromGeneration()` (confirmed live — called from the real `generateTests` success path at coordinator.ts:618; the *other* candidate, `PatternMatcherService.applyPattern`/`recordPatternUsage`, is dead code, never invoked from the real generation flow), had a loop that called `getPattern()`, checked `if (pattern)`, and then did **nothing** — with a comment claiming *"this is handled internally by recordPatternUsage"*. Nothing was ever called. This also would have failed the name-vs-ID problem above even if a call had existed.

**Fix:**
- Added a parallel `patternIds?: string[]` field to `IGeneratedTests` alongside the existing `patternsUsed: string[]` (names) — deliberately NOT repurposing the existing field, since two real display consumers (`coordination/result-saver.ts`'s markdown report, `cli/commands/test.ts`'s console output) expect readable names and would have degraded to raw UUIDs.
- Threaded `patternIds` through `test-generator.ts`'s per-file and aggregate return paths (parallel to the existing `patternsUsed` threading).
- Replaced `learnFromGeneration`'s dead stub with a real call to the canonical `pattern-usage-recorder.ts:recordPatternUsage()` (the same single-writer SQLite function A1 confirmed works correctly) for each real pattern ID, `success: true` (honest — this handler only fires on the generation-success path).

**Verification:**
- New tests in `tests/unit/domains/test-generation/coordinator.test.ts` (3 tests: records for each ID, no-op when `patternIds` absent, no-op when empty) — required a partial `vi.mock` with `importOriginal` for `unified-memory.js` after a naive full mock broke transitive imports (`DEFAULT_UNIFIED_MEMORY_CONFIG` used by `unified-persistence.ts`/`sona-persistence.ts`).
- Broad regression: `tests/unit/domains/test-generation/`, `tests/unit/domains/learning-optimization/`, `tests/unit/domains/defect-intelligence/`, `tests/unit/hooks/`, `tests/unit/cli/commands/`, `tests/unit/integrations/ruvector/delta-tracker.test.ts` — 825/825 pass. `tsc --noEmit` clean.
- **Real end-to-end verification** against the live database: called the exact dynamic-import path `learnFromGeneration` uses (`getUnifiedMemory()` + `recordPatternUsage()`) with a real existing pattern ID. `qe_patterns.usage_count` 22→23, `qe_pattern_usage` 312→313 — both the audit-trail INSERT and the aggregate UPDATE landed atomically, exactly as designed.

**Scope note:** this fixes the one *confirmed-live* pattern-usage call site in test-generation. The original audit's broader claim that `pattern-matcher.ts:557` was a "real writer" was imprecise — that call site writes to a separate, dead, KV-blob-based tracking mechanism (`PatternMatcherService.recordPatternUsage`), unrelated to `qe_pattern_usage`. Other domains' pattern-retrieval sites (context sources, etc.) were not audited in this pass — the plan's original A7 scope ("test-generator.ts, context sources, pattern-matcher.ts") turned out to have only one real, live target once traced.

### A8 (continued) — dream flow-back core FIXED (2026-07-05); real pattern creation verified end-to-end

**Root cause confirmed exactly as the audit described:** `dream-engine.ts:applyInsight()` minted a fake `dream-pattern-<uuid>` and never inserted into `qe_patterns`. The MCP `apply` action (`dream.ts`) had ALREADY been fixed to create a real pattern via `reasoningBank.storePattern()` — but even that "fixed" version still called the stub `engine.applyInsight()` afterward, which overwrote `dream_insights.pattern_id` with the fake ID anyway (discarding the real one it just created). So even the "correct" path left the DB column pointing at a dangling fake ID — the exact audit complaint ("753 insights carry a pattern_id but none resolve to a real row") would have persisted even after wiring the scheduler to use the "already correct" code.

**Fix:** consolidated into ONE implementation. Moved the real pattern-creation logic (previously duplicated only in the MCP handler) into `dream-engine.ts:applyInsight()` itself — the scheduler's `autoApplyInsights()` already calls `this.dreamEngine.applyInsight()` directly, so fixing the engine method fixes both callers simultaneously. `dream.ts`'s MCP handler is now a thin wrapper. Failure to create a pattern no longer marks the insight applied (retryable), instead of the old always-succeeds stub.

**Verification:** 4 new mocked unit tests in `dream-engine.test.ts` (fire/fail-soft/non-actionable/already-applied — mocking `getSharedMemoryBackend` was required since it resolves to the REAL project DB via `findProjectRoot()`, not the test's isolated temp DB) + the existing real (non-mocked) integration test `dream-cycle-tool.test.ts > should create REAL pattern in ReasoningBank when applying insight` still passes against the refactored code. 28+14 tests pass. `tsc` clean.

**Still open at this point (moved to the tracked sub-plan below, per explicit user instruction — no partial/disabled fixes):** the 3 dead insight detectors (`detectGaps`, `detectOptimizations`, `detectPatternMerges`) and the 2 stuck `running` dream cycles.

### A8-EXT — Dead insight detectors: proper fix (tracked 2026-07-05, user explicitly rejected disabling)

**Investigation findings (all three have different root causes):**
1. **`detectGaps`** — structurally unreachable. Requires concept nodes of type `'error'`/`'outcome'`, but `ConceptGraph`'s own module docstring says it was designed to store "patterns, techniques, domains, outcomes, errors" as node types (`ConceptType = 'pattern' | 'technique' | 'domain' | 'outcome' | 'error'` in `types.ts`) — yet `loadFromPatterns()` (the only node-loading code path, called from `dream-engine.ts`) only ever creates `'pattern'` and `'domain'` nodes. `'technique'`/`'outcome'`/`'error'` were designed-for but never implemented.
2. **`detectOptimizations`** — implementation is correct; real `successRate`/`confidence` data IS populated on pattern nodes. But `dream-engine.ts`'s pattern-loading query (`ORDER BY quality_score DESC LIMIT 200`) only ever feeds the *best* 200 patterns into dreams, and `quality_score` already weights `success_rate` at 0.5 — so the fed population is inherently biased away from the `successRate < 0.7` "room for improvement" signal this detector looks for. Sampling bias, not a logic bug.
3. **`detectPatternMerges`** — checks `conceptType === 'pattern' || 'technique'` pairs, but since `'technique'` nodes never exist, only same-type `'pattern'`-`'pattern'` pairs are ever compared, likely under-supplying qualifying pairs; needs the same technique/pattern split as (1) to get a fair chance to fire.

**Approved fix plan (real data sources only, no fabrication):**
- **Pattern/technique split**: reclassify `QEPatternType` values into `'technique'` (methodology/approach: `coverage-strategy`, `mutation-strategy`, `refactor-safe`, `error-handling`, `meta-optimization`) vs `'pattern'` (structural/template: `test-template`, `assertion-pattern`, `mock-pattern`, `api-contract`, `visual-baseline`, `a11y-check`, `perf-benchmark`, `flaky-fix`) in `loadFromPatterns()`. Extend `discoverSameDomainEdges()`'s hardcoded `WHERE concept_type = 'pattern'` to `IN ('pattern', 'technique')` so technique nodes actually get domain edges too.
- **Error nodes from real ADR-110 data**: load `qe_pattern_nulls` rows (real failure records, freshly wired up by A11 this session) as `'error'` concept nodes. Connect via the *same* domain-edge-discovery mechanism as patterns (join `qe_patterns.qe_domain` via `pattern_id` to find the failure's domain) — deliberately NOT wiring an edge directly to the pattern that caused the failure (that would trivially satisfy "hasResolution" and defeat the check's purpose); only genuine domain-mate patterns/techniques count as a resolution.
- **Outcome nodes from real usage data**: load successful `qe_pattern_usage` rows as `'outcome'` concept nodes, same domain-edge treatment.
- **Sampling-bias fix for `detectOptimizations`**: broaden `dream-engine.ts`'s pattern-loading query beyond pure `ORDER BY quality_score DESC LIMIT 200` to also include a sample of lower-performing patterns, so genuine "room for improvement" candidates reach the detector.
- Scope explicitly limited to making all three detectors *reachable with real data* — not fabricating synthetic signal to force them to fire.

### A8-EXT — FIXED and verified (2026-07-05)

**Implementation:**
- `concept-graph.ts`: `loadFromPatterns()` now classifies `patternType` into `conceptType: 'technique'` (methodology: `coverage-strategy`, `mutation-strategy`, `refactor-safe`, `error-handling`, `meta-optimization`) vs `'pattern'` (structural). `discoverSameDomainEdges()` and `countDomainSimilarityEdges()`'s hardcoded `concept_type = 'pattern'` filters extended to `IN ('pattern', 'technique')`.
- New `ConceptGraph.loadFailuresAsErrors()` / `loadSuccessesAsOutcomes()`: load real `qe_pattern_nulls`/`qe_pattern_usage` rows as `'error'`/`'outcome'` concept nodes, idempotent via a synthetic `error:<id>`/`outcome:<id>` key stored in the (unconstrained) `pattern_id` column. New shared `connectToDomainMates()` helper connects them to same-domain `pattern`/`technique` nodes — explicitly excluding the node's own `sourcePatternId` so an error is never trivially "resolved" by the very pattern that caused it.
- `dream-engine.ts`: `ensureConceptsLoaded()`'s pattern query changed from a single `ORDER BY quality_score DESC LIMIT 200` to a `UNION` of top-160-by-quality + bottom-40-by-`success_rate` (confidence-filtered) — closing the sampling-bias gap that starved `detectOptimizations`. Also now loads real failures/successes via the new loaders (best-effort, schema-absence-tolerant). New public `DreamEngine.loadFailuresAsConcepts()`/`loadSuccessesAsConcepts()` wrappers added for direct/test use, mirroring the existing `loadPatternsAsConcepts()`.
- New types `FailureImportData`/`SuccessImportData` (`types.ts`), exported from the module's public `index.ts` alongside the existing `PatternImportData`.

**A real architectural discovery made testing this correctly:** `InsightGenerator` in production is *always* constructed with `dream-engine.ts`'s private `ConceptGraphAdapter` (an in-memory edge cache built from `getNeighbors()`) — never the raw `ConceptGraph` class, which has no `getEdge`/`getEdges` methods at all. An initial attempt to unit-test `detectGaps`/`detectPatternMerges` by calling them directly against the raw graph threw `TypeError: this.graph.getEdge is not a function` — a real distinction, not a mistake in the fix itself. A second attempt routed through a real `DreamEngine.dream()` cycle (exercising the real adapter) but proved inherently flaky: final co-activation levels depend on which nodes a 5-second random spreading-activation walk happens to hit last, exactly matching the existing test suite's own "insights may or may not be generated" caveat. The tests that shipped use a small local test adapter implementing the same 3-method sync interface (`getConcept`/`getEdges`/`getEdge`) wrapping data from the *real* `loadFromPatterns`/`loadFailuresAsErrors` calls, with activation levels under explicit test control — real node/edge creation, deterministic detector-triggering.

**Verification:**
- 10 new deterministic unit tests in `dream-engine.test.ts`'s `ConceptGraph`/`InsightGenerator` describe blocks: technique/pattern classification (2), technique-domain-edge wiring (1), error/outcome idempotent loading (2), error-node domain-mate exclusion of its own source pattern (1), and — the actual payoff — `detectGaps` firing on an isolated error / not firing when domain-resolved (2), `detectOptimizations` firing on a real low-success pattern (1), `detectPatternMerges` firing on a real similar co-activated pair (1).
- Full `tests/unit/learning/dream/` + related hook/MCP dream suites: 163/163 pass. `tsc --noEmit` clean.
- **Real end-to-end verification against the live production database**: ran the new SQL queries directly (sampling-bias UNION query, failure/success JOIN queries) — all syntactically valid, returned real rows including data from this session's own earlier A11 verification. Called `DreamEngine.loadFailuresAsConcepts()`/`loadSuccessesAsConcepts()` directly against the real `.agentic-qe/memory.db`: `concept_nodes` gained its **first-ever** `'error'` (1) and `'outcome'` (40) rows — previously 0 of either type had existed since the table shipped, exactly matching the audit's finding that only `'pattern'`/`'domain'` were ever used out of the 5 designed types. (Left in place per this session's established precedent for real, non-fabricated verification data — not test pollution.)

**Stuck cycles cleanup — DONE (2026-07-05):** both were still present, unchanged, weeks/months after the original audit (no reaper mechanism exists to auto-close them — confirmed via repo-wide search, not built as part of this fix, since it wasn't in scope and wasn't requested). Backed up `memory.db` first (`memory.db.bak-1783255786`), then `UPDATE dream_cycles SET status='abandoned', end_time=datetime('now'), error='Reaped: ...' WHERE id IN (...)`. Verified: total `dream_cycles` row count unchanged (3221 before/after — no rows lost), `abandoned` count went 18→20 exactly, `running` status now has zero rows, `PRAGMA integrity_check` = `ok`.

**A8 is now fully closed** — real pattern creation, all three previously-dead detectors reachable with real data, and the stuck-cycle cleanup done.

### A10 — FIXED: SONA EWC++ cold-start deadlock (2026-07-05)

**Root cause confirmed exactly as diagnosed:** `sona_fisher_matrices` had 0 rows because writing the *first* row requires `SONAThreeLoopEngine.shouldConsolidate()` to trip (`requestCount - lastConsolidationRequest >= consolidationInterval`, default 100) — but `requestCount` previously only survived a process restart via `restoreFisher()`, which only runs `if (saved)`, i.e. only after a Fisher row *already exists*. Circular: no Fisher row until 100 requests accumulate; no accumulation across the short-lived CLI/MCP processes (each doing ~1 `instantAdapt()` call) because nothing else persisted the counter.

**Fix:** persist `requestCount` independently of the Fisher row.
- `sona-three-loop.ts`: new `restoreRequestCount(count)` setter (separate from the heavier `restoreFisher()`, which needs fisher/optimal/base arrays this path doesn't have yet).
- `sona-persistence.ts`: new `saveRequestCount()`/`loadRequestCount()` using `kv_store` (namespace `'sona'`, key `request-count:<domain>`) — no new table/migration needed. Wired into `_doInitialize()`'s existing Fisher-restore branch: when no Fisher row exists yet, independently restore the persisted count instead of leaving it at 0. Wired into `close()`: checkpoint the current count once per process lifetime (cheap — NOT on the `instantAdapt()` hot path, which must stay under 100us). New `getRequestCount()` pass-through on `PersistentSONAEngine` for observability/testing.

**Verification:**
- New test in `sona-persistence.test.ts`: 3 sessions (create → adapt 3x → close → recreate → verify count=3, not 0 → adapt again → close → recreate → verify count=4) — all 35 tests in the file pass (34 + 1 pre-existing skip), confirming the exact accumulation sequence in the logs.
- Broader regression: full `tests/unit/integrations/ruvector/` — 1408/1408 pass. `tsc --noEmit` clean.
- **Real end-to-end verification against the live production database**: ran two genuinely separate script invocations (simulating real process restarts) against `.agentic-qe/memory.db` — session 1 adapted 3x and closed; session 2 (a fresh `createPersistentSONAEngine` call) restored `requestCount=3`, not 0. Confirmed the real persisted row: `kv_store` namespace `'sona'`, key `request-count:test-generation`, value `3`. Left in place as disclosed, non-fabricated verification data (same precedent as A1/A11).

**Honest scope note:** this closes the *counter-accumulation* deadlock — the mechanical reason `sona_fisher_matrices` could never get its first row. It does not itself guarantee 100 real requests will accumulate quickly in practice (that depends on how often SONA-enabled code paths actually run), but the counter will now correctly survive every process restart and count toward the threshold instead of resetting, which is the entire fix this item called for.

## Phase 3 (P2 hygiene/enforcement) — in progress

### A17 — ALREADY DONE, no fix needed (verified 2026-07-05)

The original audit's finding ("CLI `memory search` has no vector path — keyword/LIKE only") was **imprecise, not a real gap**. `src/cli/commands/memory.ts`'s `search` command already calls the exact same `handleMemoryQuery()` MCP handler with `semantic: useSemantic` (auto-detected from natural-language queries or explicit `--semantic`/`--query` flags) — this code has existed since commit `0f44d723` (2026-03-24), **months before** the audit ran.

**Real functional verification** (not just code-reading, per this session's standard): ran `aqe memory search --query "flaky test detection and retry" --limit 5 --json` against the real project DB. Result: `"searchType": "semantic"`, real cosine-similarity scores (0.64, 0.43, 0.40...), and the top-ranked result (`scenario3-flaky-retry`) is genuinely, correctly relevant to the query — proving real HNSW vector search works end-to-end via the CLI, with no code change required.

This is at least the third time this session an audit finding turned out to be imprecise on closer inspection (see A1's `pattern-matcher.ts:557` mischaracterization, A7's narrower-than-described real scope) — a pattern worth remembering: verify audit claims against current code before implementing a fix for them.

### A15 — FIXED: noise control (2026-07-05)

A15 had two independent parts. One was a real, previously-unknown bug (found while investigating this item, not in the original audit); the other turned out to already be implemented.

**Part 1 — `queen:metrics:*` kv_store TTL units bug (the real find).** Investigating why `queen:metrics:*` kv_store rows were accumulating unbounded (4,195 rows spanning ~6.25 days at investigation time) led to `queen-lifecycle.ts:135-141`'s `ttl: 86400000` (intending 24h). `unified-memory.ts:607`'s `kvSet` computes `expiresAt = Date.now() + ttl * 1000` — i.e. **`ttl` is a SECONDS value**, confirmed as the dominant, correct convention across dozens of other call sites (`ttl: 86400`, `ttl: 3600`, etc.). Passing `86400000` (already milliseconds) made the row live **1000 days**, not 1 — explaining the unbounded growth the audit worried about.

Grepped the entire codebase for `ttl:\s*[0-9]` and found **9 confirmed millisecond-scale call sites** (one further latent site, `agent-teams/adapter.ts`'s `defaultTtlMs`, defaults to 0/inert and was excluded — not a live bug). Fixed all 9:
- `src/domains/code-intelligence/services/product-factors-bridge.ts:896`
- `src/coordination/queen-lifecycle.ts:136`
- `src/coordination/protocol-executor.ts:702`
- `src/domains/test-execution/plugin.ts:245,265`
- `src/domains/test-execution/services/flaky-detector.ts:273`
- `src/domains/code-intelligence/coordinator.ts` (6 sites, ~1300/1307/1313/1404/1411/1417)
- `src/learning/aqe-learning-engine.ts:590`

**Verification:**
- `tsc --noEmit` clean.
- Full existing test suites for all 9 touched files (`plugin.test.ts`, `coordinator.test.ts`, `coordinator-hypergraph.test.ts`, `product-factors-bridge.test.ts`, 4× `aqe-learning-engine*.test.ts`, `flaky-detector.test.ts`, `protocol-executor.test.ts` integration) — **10 files, 160/160 tests pass**, no regressions. (No dedicated `queen-lifecycle.ts` test file exists — nothing to regress there beyond the shared suites.)
- **Real end-to-end verification against a COPY of the production DB** (per CLAUDE.md: never test migrations against the original) — copied `.agentic-qe/memory.db` to scratchpad, ran the exact post-fix `queen-lifecycle.ts` call (`kvSet(key, metrics, 'queen-coordinator', 86400)`) via `UnifiedMemoryManager`, and confirmed the resulting `expires_at` is exactly `Date.now() + 86,400,000ms` = 24.00h out — not the pre-fix ~1000 days. Original production DB untouched.
- Also confirmed the periodic sweep this fix now makes meaningful actually exists and runs: `HybridMemoryBackend`'s `cleanup()` (`hybrid-backend.ts:393-410`) calls `kvCleanupExpired()` on a `setInterval(..., cleanupInterval)` (unref'd), so `expires_at` isn't a dead/unused column — it drives real periodic deletion once TTLs are sane.

**Part 2 — `captured_experiences` cli-hook noise filter — already correctly implemented, no code change needed.** `src/learning/metrics-tracker.ts`'s two aggregate queries (`getExperienceStats`, `getHistoricalAvgReward`) already filter `WHERE agent != 'cli-hook'` — this predates the current session (last touched 2026-04-05, not part of this remediation's diffs). Verified it isn't a no-op against the real production DB: `captured_experiences` has 20,881 total rows, of which **20,150 (96.5%) are `cli-hook`** — filtering them changes the reported success rate from 32.6% (all rows) to 82.6% (`agent != 'cli-hook'`), a dramatic, meaningful difference. The filter is real and load-bearing, not decorative.

Separately checked the session-start `[INTELLIGENCE]` banner's data path (`session-hooks.ts` → `qe-reasoning-bank.ts:getStats()` → `sqlite-persistence.ts:getAggregateOutcomeStats()`), since the audit named it as a second place noise could leak in. That path queries `routing_outcomes` and `qe_pattern_usage`, not `captured_experiences` — and neither table has a `cli-hook`-style noise concept: `qe_pattern_usage` has no agent column at all, and `routing_outcomes.used_agent` in the live DB is populated entirely with real QE agent names (`qe-test-architect`, `qe-coverage-analyzer`, etc.) plus a small number of numeric placeholder values (`'0'`/`'1'`/`'2'`, ~11% of rows, predating the 2026-06-02 `routing_outcomes` freeze A11 already fixed) — no `cli-hook` noise present there to filter. **No code change was needed or made for this part.**

**Honest scope note:** the numeric (`'0'`/`'1'`/`'2'`) `used_agent` placeholder rows in `routing_outcomes` are a separate, pre-existing data-quality artifact — not part of A15's cli-hook-noise scope and not touched here. Flagged for future visibility only.

### A13 — FIXED: witness-chain enforcement (signing + archival bug + CI gate) (2026-07-06)

User explicitly chose the full Cost:M scope (all 3 parts) over the cheaper options, given this touches production audit/security code and a CI workflow.

**Part 1 — Ed25519 signing was never wired in production (confirmed as described).** `WitnessKeyManager` was constructed only in tests; the 3 real `WitnessChain` construction sites (`getWitnessChain()` singleton in `witness-chain.ts:322`, `witnessBackfill()` in `brain-commands.ts:188`, `RvfMigrationCoordinator`'s witness attach in `rvf-migration-coordinator.ts:162`) all called `new WitnessChain()`/`createWitnessChain(db)` with no key manager — so `signature`/`signer_key_id` were always null on every real row (confirmed: the live 13,463-row chain has 0 signed entries).

Fixed by adding `getDefaultWitnessKeyManager()` (`witness-key-manager.ts`) — a process-wide singleton backed by a **persistent** `keyDir` (`<projectRoot>/.agentic-qe/witness-keys/`), wired into all 3 sites. This matters specifically because an ephemeral (no-`keyDir`) key manager auto-generates a NEW key every process start — every CLI/MCP invocation is a fresh process, so without persistence every signature would be permanently unverifiable by the next invocation. Added `.gitignore` entry for `.agentic-qe/witness-keys/` — this directory holds real Ed25519 private key PEM files and must never be committed.

**Part 2 — Archival breaks chain verification for everything after it (confirmed, and worse than described).** `archiveEntries()` deletes archived rows from the live `witness_chain` table. The original `verify()` compared each live row against whatever happened to be array-adjacent in the *live-only* query result — after any archival, the first surviving entry's real predecessor is gone, so verification would falsely report the chain broken starting at that entry, permanently, for the rest of the table's life. Confirmed dormant: `archiveEntries()` is never called anywhere in production, so this bug has not yet corrupted a real audit trail — but it would have on first use, and the plan explicitly called for fixing it before any rotation/archival trigger gets wired.

Fix required two iterations to get right (both caught by new tests, not shipped):
1. First attempt: on a live-table gap, look up the missing predecessor by `id = current.id - 1` in `witness_chain_archive`. This fixed the "predecessor got archived out from under an existing entry" case but **broke a different, equally-real case**: an entry appended *after* archival already happened correctly chains to whatever the live tail is (not to `id - 1`, which may itself be long gone) — the id-minus-1 lookup found a real-but-wrong archived row and falsely reported it broken.
2. Final fix: try the array-adjacent entry first (this is what `append()` actually used, and covers new post-archival appends correctly); only fall back to a cross-table (`witness_chain` ∪ `witness_chain_archive`) lookup by `id - 1` on a mismatch. Applied via two independent scans — live-table (always) and, when `verify({includeArchive: true})` is requested, the archived segment on its own — rather than merging both into one id-sorted array, which reintroduces the same wrong-predecessor bug for entries appended post-archival (see test: "should validate the full historical chain, archive included").

`VerifyOptions.includeArchive` is new: off by default (fast, live-only, still archival-boundary-correct), on for a deep CI check that also re-validates the archived segment's own internal chain and catches tampering with already-archived rows (which live-only verification structurally cannot see).

**Part 3 — CI gate + `aqe audit verify --chain` flag.** `aqe audit verify` previously only checked `governance/witness-chain.ts`'s 29-row decision-receipt chain (imprecise but real — the plan's claim was correct). Added `--chain <governance|audit>` (default `governance`, preserving existing behavior) and a new `handleAuditChainVerify()` that checks the real `audit/witness-chain.ts` chain with `{includeArchive: true, checkSignatures: true}`. **Also fixed a latent bug found while wiring this**: the `verify` command's `action()` handler always called `cleanupAndExit(0)` regardless of the result's `integrity` field — meaning a broken chain could never fail the CLI's exit code, so it could never have failed CI even for the existing governance chain. Now exits 1 on `!integrity`.

Added `scripts/witness-chain-audit-gate.ts` (run via `npx tsx`, no build required) and a new `witness-chain-audit-gate` CI job in `.github/workflows/optimized-ci.yml`, parallel to the existing security-audit job. It seeds a throwaway chain in a temp project root (append → archive → append-after-archival → verify clean, then deliberately tamper and confirm it's caught) — exercising the exact real CLI path (`handleAuditChainVerify`) end-to-end, not internals directly, since there's no committed `memory.db` for CI to check against.

**Bonus fix found en route**: `handleAuditChainVerify` initially used `require('better-sqlite3')` (copying the existing pattern in `tryLoadPersistentChain()`) — this worked when called synchronously from a top-level script, but threw `ReferenceError: require is not defined` when called from an `async` function reached via a dynamic `import()` chain (reproduced via `npx tsx src/cli/index.ts audit verify --chain=audit`). Fixed by using `await import('better-sqlite3')` instead — more portable and avoids the whole class of ESM/CJS interop fragility.

**Verification:**
- `tsc --noEmit` clean throughout.
- `tests/unit/audit/witness-chain.test.ts`: 30/30 (6 new archival tests, including the two-iteration bug found above — the failing test that caught iteration 1's regression is kept as `"verify({includeArchive:true}) should validate the full historical chain, archive included"`).
- `tests/unit/witness-chain-v3.test.ts`: 43/43 (4 new tests for `getDefaultWitnessKeyManager`, including a cross-"process" signature-verification test: sign with one instance, reset the singleton, verify with a fresh instance pointed at the same `keyDir`).
- `tests/unit/cli/commands/audit-chain-verify.test.ts` (new file): 4/4, covering empty-db, clean chain, tampered chain, and archival-boundary via the real `handleAuditChainVerify` function.
- Full related-suite regression: `tests/unit/audit/`, `tests/unit/witness-chain-v3.test.ts`, `tests/integration/witness-chain.integration.test.ts`, `tests/unit/governance/witness-chain.test.ts`, `tests/integration/persistence/rvf-migration-lifecycle.test.ts` — **162/162 pass**.
- **Real end-to-end verification against the live production database**: `npx tsx src/cli/index.ts audit verify --chain=audit --format=json` against the actual `.agentic-qe/memory.db` reports `"integrity": true, "chainLength": 13463, "signatureFailures": 0` (0 signed, as expected pre-fix — this run predates any production entry created with the new default key manager). No `.agentic-qe/witness-keys/` directory was created by this read-only verification run (confirmed: `checkSignatures` only activates when a `keyManager` is attached, and verification attaches none).
- CI gate script (`npx tsx scripts/witness-chain-audit-gate.ts`) run standalone: 3/3 checks pass (clean chain valid, correct post-archival entry count, tampering correctly detected).
- `.gitignore` updated and confirmed: no `witness-keys/` directory exists in the real project (nothing was ever signed there yet, so nothing to accidentally leak).

**Honest scope note:** signing is now wired for all *future* entries; the existing 13,463 historical rows remain unsigned (expected — signing can't be retroactively applied without re-deriving what each entry's signature would have been at write time, which is out of scope). The CI gate validates the verify()/CLI machinery itself against a synthetic chain, not this repo's own (gitignored, non-existent-in-CI) audit history — that's correct: `memory.db` is dev-machine state, not something CI should have or gate on.

### A16 — FIXED: mincut realism (2026-07-06)

Investigated via a dedicated research pass before implementing, to confirm the audit's claims with file:line evidence rather than assuming them. All three claims confirmed, one worse than described.

**Confirmed via the real production DB**: `mincut_snapshots` had exactly 200 rows, every single one identical (`vertex_count=14, edge_count=11, total_weight=16.5, is_connected=0, component_count=10`), on a precise 60-second cadence. `mincut_history`: 501 rows, all `mincut_value=0.0`, same shape. Zero `agent:*` vertices in any snapshot — only the static `domain:*` coordinator scaffold.

**Root cause 1 — `agent:spawned` handling was never actually wired, and worse: it was never wired at all, for any event.** `QueenMinCutBridge.subscribeToEvents()` (`queen-integration.ts`) defined four real, correct handlers (`onAgentSpawned`, `onAgentTerminated`, `onAgentStatusChanged`, `onTaskCoordination`) but its `eventBus.subscribe(...)` call was a literal no-op: `// Subscribe to events (would use eventBus.subscribe in real implementation) ... this.eventSubscriptions.push(() => { /* Cleanup placeholder */ })`. Meanwhile `QueenCoordinator` *does* publish a real spawn event (`queen-coordinator.ts:632`, `publishEvent('AgentSpawned', {...})`) — but `publishEvent()` prefixes every event with `"Queen"` (`queen-coordinator.ts:800-808`), so the actual wire type is `QueenAgentSpawned`, not `AgentSpawned`/`agent:spawned` as the audit assumed. Fixed by wiring all four handlers to real `eventBus.subscribe()` calls (with real `Subscription.unsubscribe()` cleanup, fixing a second latent bug — the cleanup was ALSO a no-op) using the correct `Queen`-prefixed names. Only `QueenAgentSpawned` has a real publisher today; the other three activate automatically if/when a publisher for agent termination/status-change/coordination is added following the same convention — documented as such, not silently pretended to be fully wired.

**Root cause 2 — the snapshot timer had no gate at all.** `startSnapshotTimer()` unconditionally wrote a snapshot + history row every `snapshotIntervalMs` (default 60s) regardless of graph state. A correct `isEmptyTopology()` helper already existed (checks `getVerticesByType('agent').length === 0`, not raw vertex count — it already correctly excludes the domain scaffold) but was only used to suppress health-*issue* reporting, never to gate the timer itself. Fixed by short-circuiting the timer tick when `isEmptyTopology()` is true — stops the unbounded identical-row accumulation. The dispose()-time final snapshot still runs unconditionally (a single row, not the growth problem).

**Root cause 3 — `routing-topology-gate.ts`'s empty-graph guard was defeated by the same scaffold.** `resolveTopologyCriticalFromSharedMincut()` already had an "empty graph = no signal" guard (added for a prior regression, per its own doc comment) — but it checked `graph.isEmpty()` (raw `vertices.size === 0`), which is **always false** once `QueenMinCutBridge` initializes, because it unconditionally seeds ~14 `domain:*` vertices + one-directional workflow edges. Since `domain:defect-intelligence` is a pure sink in that edge list (never a source), its weighted degree is 0, so `MinCutCalculator.getMinCutValue()` computes exactly 0.0 — below the 2.0 warning threshold — so `isCritical()` returns true on a graph with **zero real agents**, permanently applying the ADR-095 `0.2×` exploration-dampening multiplier (`agent-routing.ts:251`) regardless of actual system health. Fixed by checking `graph.getVerticesByType('agent').length === 0` instead of `graph.isEmpty()` — the same real-agent-vertex semantics `isEmptyTopology()` already used internally, just not shared across the two call sites.

**Verification:**
- `tsc --noEmit` and `eslint` clean (also fixed 2 pre-existing lint errors on unused destructured fields in `onAgentStatusChanged`/`onTaskCoordination`, surfaced once those functions became reachable).
- `tests/unit/learning/routing-mincut-safety-gate.test.ts`: 5/5 (1 new test reproducing the exact production scenario — domain-scaffold-only graph, `isEmpty()===false` but `getVerticesByType('agent')===[]`, `isCritical()===true` pre-fix, gate now correctly returns `false`).
- `tests/unit/coordination/mincut/queen-integration.test.ts`: 37/37 (6 new tests: real `QueenAgentSpawned` subscription with exact event-name assertion, a fired-event test proving a real agent vertex gets added end-to-end, unsubscribe-on-dispose without throwing, and 2 snapshot-timer tests proving zero writes with no real agents vs. exactly 1 write once agents exist).
- Full related-suite regression: `tests/unit/coordination/mincut/`, `tests/integration/mincut-queen-integration.test.ts`, `tests/unit/learning/routing-mincut-safety-gate.test.ts`, `tests/unit/routing/queen-integration.test.ts`, `tests/routing/advisor/queen-integration-advisor.test.ts`, `tests/integration/governance/queen-integration.test.ts` — **95/95 pass**.
- Re-queried the live `.agentic-qe/memory.db` after the fix (read-only, no test writes leaked into it): confirms the exact 200-row/501-row degenerate pattern this fix targets, unchanged by testing (all new tests use a mocked `EventBus`/`AgentCoordinator`, zero real DB writes).

**Honest scope note:** this fixes the mechanism (real events wired, timer gated, false-positive-critical eliminated) — it does not retroactively clean the 200/501 existing degenerate rows in the live DB (a data-cleanup action, out of scope without explicit user confirmation per the data-protection rules, and not requested). `onAgentTerminated`/`onAgentStatusChanged`/`onTaskCoordination` remain dormant until a corresponding publisher exists elsewhere — wiring speculative new publish-call-sites for agent termination/status-change was judged out of scope for A16 (a materially different, larger change than "wire the existing handler to the event that already gets published").

### A18 — FIXED: daemon visibility + snapshot scheduling (2026-07-06)

Both audit claims confirmed via research pass before implementing, with one added nuance (two *separate* daemon concepts exist in this codebase, only one of them relevant here).

**Part 1 — `aqe health` had zero daemon-liveness signal.** `HealthHandler.executeHealth()` (`status-handler.ts`) only ever called `context.queen!.getHealth()` — pure in-process domain/agent-pool status. A genuinely separate, detached OS-level daemon *does* exist (`.agentic-qe/workers/start-daemon.cjs`, generated by `10-workers.ts`, PID recorded to `.agentic-qe/workers/daemon.pid`), with its own `stop-daemon.cjs` liveness check (`process.kill(pid, 0)`) — but nothing in `aqe health`, nor even `aqe daemon status` (a *different*, unrelated in-process `QualityDaemon` concept tracked via a module-level variable that can't see a truly detached process anyway), ever read `daemon.pid`. A stopped daemon was indistinguishable from a running one.

Fixed by adding `checkDaemonLiveness()` (`status-handler.ts`), mirroring `stop-daemon.cjs`'s exact check (`process.kill(pid, 0)` against the recorded PID) rather than inventing a new protocol, and surfacing it in both the text and JSON paths of the overall (non `--domain`) `aqe health` output as a `daemon: {configured, running, pid}` field.

**Part 2 — `learning_daily_snapshots` only ever populated via a manual flag.** Confirmed: the *only* production call site for `LearningMetricsTracker.saveSnapshot()` was `learning.ts:531`'s `--save-snapshot` CLI option — the real dev DB has **0 rows** in `learning_daily_snapshots` despite months of real activity. A real ~30-min periodic worker (`LearningConsolidationWorker`, cadence confirmed at `10-workers.ts:77`) already runs every tick and was the obvious place to piggyback rather than adding a new timer.

Fixed by calling `saveSnapshot()` from a self-contained `createLearningMetricsTracker(findProjectRoot())` instance inside `doExecute()`'s existing `finally` block, alongside (not replacing) the existing `recordLoopHealth` call — same best-effort, never-shadow-the-original-error contract. `saveSnapshot()` is `INSERT OR REPLACE` keyed on `snapshot_date` (`UNIQUE`), so re-running every 30 minutes just refreshes the same day's row rather than accumulating duplicates. Used `findProjectRoot()` explicitly rather than `LearningMetricsTracker`'s `process.cwd()` default, to avoid the exact CWD-relative-resolution class of bug this same audit flagged elsewhere (orphan `.agentic-qe` dirs, G4). The tracker opens its own DB handle (separate from the shared unified-memory connection `context.memory` uses) and is explicitly `close()`d in a nested `finally` every tick, so a long-running daemon doesn't accumulate open handles.

**Verification:**
- `tsc --noEmit` and `eslint` clean.
- `tests/unit/cli/handlers/status-handler.test.ts` (new file): 4/4 — not-configured, real-live-PID (exercises the actual `process.kill(pid,0)` against the test runner's own PID, not mocked), stale-PID (mocked `process.kill` throwing ESRCH), and non-numeric-PID-doesn't-throw.
- `tests/unit/workers/workers/learning-consolidation-snapshot.test.ts` (new file): 3/3 — snapshot saved + tracker closed on success, snapshot still saved on the worker-body-throws path (same `finally` as `recordLoopHealth`), and a `saveSnapshot()` failure doesn't shadow a successful tick's result.
- Full related-suite regression: `tests/unit/cli/handlers/`, `tests/unit/workers/workers/learning-consolidation*.test.ts`, `tests/unit/coordination/protocols/learning-consolidation.test.ts` — **71/71 pass**.
- **Real end-to-end verification against the live project**: `npx tsx src/cli/index.ts health` (both text and `--format=json`) against the actual `.agentic-qe/` state — genuinely, currently reports `"daemon": {"configured": true, "running": false, "pid": 17513}` (a real stale PID left over from an earlier session in this exact dev environment), exactly the failure mode this fix makes visible instead of silently reporting "healthy". Confirmed `learning_daily_snapshots` still has 0 rows in the real DB post-testing (all new tests mock `createLearningMetricsTracker`/`process.kill`, zero real DB writes).

**Honest scope note:** this makes daemon-down and never-snapshotted states *visible* and gets snapshots flowing automatically going forward; it does not start the stale daemon found during verification (out of scope, not requested) or backfill historical `learning_daily_snapshots` rows for days the daemon wasn't running (not reconstructable after the fact).

### A14 — FIXED: GOAP plan persistence + real executor (full XL build) (2026-07-06)

User explicitly chose the XL path (design and build a real executor now) over the cheaper S-path (fix + honestly label as simulated). Investigation before implementing revealed the XL scope was larger than the original plan anticipated: a real executor needs kernel-access plumbing that doesn't exist anywhere in the MCP tool layer today (`MCPToolContext` only carries `memory`/`llmRouter`). User confirmed the full build including that plumbing. Delivered across 8 tracked sub-tasks:

**1. Plan persistence bug ("Plan not found").** `GOAPPlanner.findPlan()` built a full plan via A* but never called the already-working `savePlan()` — only a reuse-lookup signature was persisted. `getPlan(planId)` always returned null for a plan `goap_plan` had just returned, so `goap_execute` 404'd on every real call. Fixed both `findPlan()`'s primary path AND its plan-reuse branch (`findSimilarPlan` hit) — the reused-plan clone was ALSO never persisted, an identical bug in a second code path.

**2. Canonical `goap_execution_steps` schema.** `plan-executor.ts` invented parallel `execution_results`/`executed_steps` tables instead of the canonical `goap_execution_steps` table — which, on inspection, wasn't even in the current `unified-memory-schemas.ts` schema list at all (a genuine pre-existing gap: a fresh install would never get this table). Added it via a new `SCHEMA_VERSION = 11` migration, with column-presence-checked `ALTER TABLE` backfill for databases (including this project's own dev DB) that already had a *different*, narrower `goap_execution_steps` table left over from an older, undocumented schema era. Rewrote `persistExecutionResult()`/`getExecutionHistory()`/`getExecutedSteps()` to use it; removed the FK constraints the canonical schema originally specified after discovering they'd reject the (legitimate) ad-hoc/programmatic-plan usage pattern every existing test already relied on. The old `execution_results`/`executed_steps` tables (530/705 rows, confirmed test-fixture noise via `plan_id: test-plan-*` naming) are left in place, untouched — not dropped without explicit confirmation per the data-protection rules, and not necessary for the fix.

**3. Test DB isolation.** Neither `goap-planner.test.ts` nor `plan-executor.test.ts` isolated their database — both resolved to the real project `.agentic-qe/memory.db` via `findProjectRoot()`, the root cause of the audit's "45%/2,325 rows are test fixtures" figure. Fixed by pre-configuring `getUnifiedPersistence()`/`getUnifiedMemory()` (two *separate* singletons, both needed isolating) with an isolated temp path before constructing `GOAPPlanner`/`PlanExecutor`.

**4. `MCPToolContext.kernel` field.** Added an optional `kernel` field to `MCPToolContext`, threaded through `MCPToolBase.invoke()` following the existing `memory`/`llmRouter` pattern, plus a new `getKernel(context)` helper (dynamic-imports `core-handlers.ts`'s `getFleetState()` to avoid a circular import with `tools/registry.ts`). Wired into **both** real MCP dispatch paths that reach `tool.invoke()` — `tools/registry.ts` (the actual path GOAP tools go through) and `qe-tool-bridge.ts` (the fallback bridge for unregistered tools). Fixed a related, previously-dead feature as a side effect: `coverage-analysis`'s ghost-coverage branch already cast `context as MCPToolContext & {kernel?: GhostKernel}`, but nothing ever set `context.kernel` — now it's real.

**5. `GOAPAction.method`/`params`/`implemented` bindings.** Extended the data model (mirroring `ProtocolAction.targetDomain/method/params`) and wired all 40 actions in `qe-action-library.ts`: 27 mapped to real, verified non-stub domain methods (e.g. `measure-coverage` → `coverage-analysis.analyze()`); 13 explicitly marked `implemented: false` (mutation testing, vulnerability remediation, fleet-topology actions, etc. — confirmed no real backing exists anywhere in `src/domains`). Fixed a real domain-assignment bug found during mapping: `analyze-complexity` pointed at `code-intelligence`, but the real `analyzeComplexity()` method lives in `quality-assessment`. Added `GOAPPlanner.backfillActionMethodBindings()` — matches already-seeded action rows by `name` (seed-time ids are random, not stable across the library source) and backfills bindings idempotently on every `initialize()`, so existing databases pick up newly-added real bindings without a full re-seed.

**6. Real `GOAPExecutor` dispatch.** `PlanExecutor.executeStep()` now: (a) hard-fails `implemented: false` actions with a clear message, unconditionally — the actual fix for "mock fabricates `successRate: 0.95` results indistinguishable from real execution"; (b) for `implemented: true` actions, dispatches to `getDomainAPI(action.qeDomain)[action.method](action.params)` — mirroring `DefaultProtocolExecutor.executeAction()`'s resolve → lookup → invoke pattern — under the existing timeout logic, reporting the specific failure reason (domain not available, no such method, real error thrown) rather than a generic one. `getDomainAPI` is **constructor-injected and opt-in**: every existing caller/test that constructs a `PlanExecutor` without it keeps today's simulated behavior byte-for-byte unchanged — zero backward-compat breakage, confirmed by the full pre-existing test suite passing unmodified.

**7. `goap-execute.ts` MCP tool wiring.** Replaced the unconditional `createMockExecutor(planner, {successRate: 0.95, ...})` with a real `new PlanExecutor(planner, spawner, undefined, config, getDomainAPI)`, where `getDomainAPI = (domain) => kernel?.getDomainAPI(domain)` — passed even when `kernel` is undefined, so `executeRealAction()`'s existing "domain not available" diagnostic fires naturally per-step instead of silently falling back to simulation. Updated the tool's own description to state real dispatch happens for implemented actions with a kernel available, and that unimplemented/kernel-unavailable actions fail with a specific reason — matching the plan's original validation criterion exactly ("if execution is still simulated, the tool's own description/response says so explicitly").

**8. Verification.**
- `tsc --noEmit` and `eslint` clean throughout (2 pre-existing lint errors surfaced in `goap-planner.ts` and 1 in `goap-execute.ts`, confirmed via `git stash`/direct lint-on-original-content to predate this work — not introduced, not fixed, out of scope).
- **201 tests pass** across `tests/unit/planning/` (goap-planner + plan-executor), the new `tests/unit/mcp/tools/planning/goap-execute.test.ts` (first-ever coverage for this MCP tool class), `tests/unit/mcp/tools/base.test.ts` (new `getKernel`/kernel-threading tests), `tests/unit/mcp/tools/registry.test.ts`, and `tests/unit/kernel/unified-memory.test.ts` + `unified-persistence.test.ts` (schema/migration regression).
- New tests specifically prove: the reuse-path persistence fix; method/params/implemented round-tripping through the DB across a fresh `loadActions()`; the backfill mechanism against the real 40-action seeded library; `implemented: false` hard-failing without ever touching the spawner; real dispatch calling the injected domain method with the right params; honest, specific failures for domain-not-available / no-such-method / thrown-error; `dryRun: true` still forcing simulation even with a kernel injected; and full backward compatibility for actions with no `implemented` classification at all.
- **Real migration verification against a scratch copy of the production DB** (never the original, per the data-protection rules): confirmed the v11 migration correctly bumps `schema_version` 10→11, backfills all 4 new `goap_execution_steps` columns and the 3 new `goap_actions` columns onto the pre-existing narrower tables, and leaves `goap_actions`'s 2,325 rows and all other data byte-for-byte unchanged.
- **Real CLI verification**: `npx tsx src/cli/index.ts audit verify --chain=audit` (unrelated to A14 directly, but run in this same session) incidentally proved the A13 signing wiring is genuinely live in this exact project — a real Ed25519 key pair now exists at `.agentic-qe/witness-keys/` (correctly gitignored, confirmed via `git check-ignore`), generated the first time `getWitnessChain()`'s singleton was constructed during this session's real CLI testing.

**Attempted but not completed: a full live-kernel end-to-end run.** Tried constructing a real (non-mocked) `QEKernelImpl` with `coverage-analysis` + its dependencies loaded, against a scratch DB copy, to prove genuine dispatch through a real domain plugin (not just a realistic mock). This repeatedly hung (3 attempts, up to several minutes each) during kernel/plugin initialization in this sandboxed environment — likely real embedding-model loading (`Xenova/all-MiniLM-L6-v2`) or a similar heavyweight init step, based on log output before the hang. Killed the hung process each time; confirmed via `git status` and direct row-count checks that no partial state ever reached the real production DB. Given the mechanism is already proven correct by 201 passing unit/integration tests (including one exercising the actual `GOAPExecuteTool` class with a mocked-but-realistic kernel), a full live-kernel smoke test was judged not essential to closing this item — noted here honestly rather than silently skipped.

**Honest scope note:** 13 of 40 actions remain `implemented: false` by design — they have no real backing anywhere in the codebase (mutation testing, vulnerability remediation, memory profiling, fleet-topology management, etc.), and building those real capabilities is separate, substantially larger work outside A14's scope (which was specifically "make GOAP execution honest," not "implement every QE capability"). The 530/705-row test-fixture pollution in the now-dead `execution_results`/`executed_steps` tables was identified but not cleaned up (requires explicit destructive-DB confirmation per the data-protection rules, not requested here).

### A12 — DONE: re-status ADRs to match reality (2026-07-06, run last as planned)

Precondition satisfied: outcomes of A1, A2/A4, A7, A8/A8-EXT, A9, A10, A11, A13, A14, A16 all known by this point. Added a dated verification note to each ADR this remediation directly touched or found evidence about — additive only (new "Status History" row, or a new section where no such table existed), never rewriting existing entries, per the plan's own instruction not to silently overwrite prior claims.

**8 ADRs updated** (all diffs are pure additions, `git diff --stat`: 16 lines added across 8 files, 0 removed):
- **ADR-047** (MinCut Self-Organizing QE) — noted A16's topology/snapshot fix; explicitly scoped to NOT claim verification of the other 5 RuVector patterns (Strange Loop, Morphogenetic, Temporal Attractors, Causal Discovery, Time Crystal) this ADR also claims.
- **ADR-068** (MinCut-Gated Model Routing) — noted A16's false-positive-criticality fix; also flagged a pre-existing inconsistency found while editing (top-of-doc Status says "Implemented" but the Status History table only ever recorded "Proposed" — never updated at the time, left as a visible discrepancy rather than silently resolved).
- **ADR-095** (ε-Greedy Routing Exploration Policy) — noted the same false-positive-criticality bug from the consuming side (the exploration-dampening multiplier).
- **ADR-070** (Witness Chain Audit Compliance) — noted A13's signing-wiring + archival-verify bug fixes, with the real production evidence (13,463-row chain verified valid, a real Ed25519 key now exists in this project).
- **ADR-046** (V2 Feature Integration: Q-Values/GOAP/Dream) — noted A14's real-executor build and A8/A8-EXT's dream-cycle fixes (from the prior context window); explicitly noted Q-Values/RL throughput was NOT re-verified this pass beyond A9's narrower agent-identity fix.
- **ADR-110** (Kept Nulls) — added a "Status Verification" section (this ADR had no Status History table at all) citing A11's production-path wiring fix.
- **ADR-036** (Language-Aware Result Persistence) — noted A1/A4's "not broken, simply not exercised" verdict, with the real live write-test evidence, and cross-referenced the *actually*-broken subsystem (the pre-A14 GOAP mock executor) that the original audit's `execution_results` staleness finding was really pointing at.
- **ADR-014** (Background Workers) — noted A18's daemon-visibility + auto-snapshot fixes.

**Deliberately NOT touched: ADR-069** (RVCOW Branching for Reversible Dream Cycles). Its status was already honestly "In Progress" (not overclaiming "Implemented"), and this remediation found no direct evidence about its specific claim (copy-on-write branching + validation-gated merge + parallel speculative dreaming) — A8/A8-EXT fixed the *core* dream engine's insight-application and detector correctness, which is a different, narrower layer than the branching/COW mechanism ADR-069 describes. Touching it without direct evidence would have been exactly the kind of unverified status claim this whole audit exists to prevent.

**Verification:** every added note cites the specific plan-doc section (A-number) and, where applicable, the exact test files/counts that prove the claim — matching the plan's own requirement ("each status claim in the ADR has an adjacent 'Verified by' note").

**Validation (user perspective):** an engineer reading any of these 8 ADRs today sees, inline, exactly what was independently re-verified in this remediation pass, what specific bug was found and fixed, which tests prove it, and — just as importantly — what was explicitly *not* re-verified, rather than a blanket unqualified "Implemented" that could mislead the way the original audit's authors were misled.

---

## Remediation complete

All Phase 0–3 items from this plan are now closed: A1/A2/A4 (revised — no code bug, dormancy explained), A5/A6 (orphan DB cleanup), A7/A8/A8-EXT (dream cycle), A9 (partial — stdin fallback), A10 (SONA deadlock), A11 (ADR-110 threading), A13 (witness chain), A15 (TTL bug + noise-filter verification), A16 (mincut realism), A17 (already done, verified), A18 (daemon visibility + auto-snapshot), A14 (GOAP real executor, XL build), A12 (this section). The one deliberately deferred item (A9's "widen hook triggers beyond Task/Agent tool use" half) remains open and is not silently marked done — see A9's own section above for the honest scope note.

### Post-completion gap-check (2026-07-06): two data-cleanup items from the original audit's P1/P2 lists had been silently dropped

A self-audit against the original audit's numbered P0–P2 recommendation list (not just this plan's own A-numbered sections) found two items whose *code* fix landed but whose *data* cleanup half never happened, with no honest scope note recorded at the time:

- **Item 7 (pattern usage feedback)**: A7's plan explicitly scoped "add FK cascade... closing the 273-orphan gap," but A7's completion note only covers the `recordUsage()` wiring fix — the cleanup was never done and never flagged as deferred. Re-verified against the live DB: exactly 273 orphaned `qe_pattern_usage` rows (referencing deleted `qe_patterns`) and 11 "ghost" patterns (`usage_count > 0` with zero backing usage rows) were still present.
- **Item 4/executive-summary #4 ("94% duplicate dream insights")**: A8/A8-EXT fixed the detectors going forward (real data in, less duplicative insights going forward) but never cleaned up existing duplicate rows. Re-verified: 13,171 total `dream_insights` rows, only 638 distinct `description` values (95%+ duplicate).

**Fixed, with explicit user confirmation and the full data-protection protocol** (backup first, verify counts before/after, integrity check):
- Backed up: `cp memory.db memory.db.bak-1783336836` (pre-cleanup snapshot).
- `DELETE FROM qe_pattern_usage WHERE pattern_id NOT IN (SELECT id FROM qe_patterns)` — 273 rows removed (313 → 40), 0 orphans remain.
- `UPDATE qe_patterns SET usage_count = 0 WHERE usage_count > 0 AND id NOT IN (SELECT DISTINCT pattern_id FROM qe_pattern_usage)` — 11 ghost patterns corrected to match real backing data (157 total patterns unchanged — no patterns deleted, only the inflated metric corrected), 0 ghosts remain.
- Deduplicated `dream_insights`: `DELETE FROM dream_insights WHERE applied = 0 AND id NOT IN (SELECT MIN(id) FROM dream_insights GROUP BY description)` — dry-run counted first, then executed: 13,171 → 1,093 rows. Deliberately conservative rule: **every row with `applied = 1` is preserved unconditionally** (all 840 applied insights survive intact, including cases where two applied rows happened to share identical description text), and among never-applied rows only the earliest (`MIN(id)`) representative per distinct description survives. `PRAGMA integrity_check` clean before and after; `wal_checkpoint(TRUNCATE)` run and re-verified from a fresh connection.

No schema/table structure changed — only row-level cleanup of already-orphaned/ghost/duplicate data, all additive-safe (nothing with real provenance — a valid parent pattern, or `applied=1` status — was touched).

### Correction to A8-EXT's "fully closed" claim + `dream_insights.applied` dual-writer fix (2026-07-06)

An adversarial review (`qe-devils-advocate` agent, tasked with independently re-verifying this plan's claims against source/tests/git history rather than trusting its prose) found two real gaps the work above missed. Both are now fixed; this section corrects the record rather than silently editing the earlier claims above.

**Gap 1 — A8-EXT's "fully closed" (line 510) was not true for real, automatic operation.** `dream-engine.ts`'s `ensureConceptsLoaded()` — the sole production entry point, called every scheduled dream cycle from `dream-scheduler.ts:549` — placed the new failure/success concept-loading block *after* an early-return gate (`if (existing.length >= minConceptsRequired) return 0`). On any project that's dreamed more than a handful of times (`concept_nodes` permanently above the default threshold of 10 — this project has 5,051), that gate fires on every call and the failure/success block is never reached. The only way this session's earlier "1 error, 40 outcome" verification (§A8-EXT above) ever exercised the loaders was via the direct `loadFailuresAsConcepts()`/`loadSuccessesAsConcepts()` test/manual wrappers — never the real automatic path. **Fix:** moved the failure/success refresh to run unconditionally, before the gate (the gate and the expensive bulk pattern-loading query below it are unchanged and still only run when under-populated). Idempotent (synthetic `error:<id>`/`outcome:<id>` keys) and cheap (two indexed `LIMIT 100` reads), so refreshing every dream cycle has negligible cost.

**Gap 2 — the exact fake-applied-counter bug the original audit named by name was still live**, untouched by any part of this remediation despite A8/A8-EXT's "dream flow-back" fix elsewhere. `hooks-dream-learning.ts`'s `persistTaskOutcome()` (step 7) ran `UPDATE dream_insights SET applied = COALESCE(applied, 0) + 1 WHERE id IN (SELECT id FROM dream_insights WHERE actionable = 1 ORDER BY created_at DESC LIMIT 3)` on **every successful task**, regardless of whether any insight was genuinely promoted — semantically incompatible with `dream-engine.ts`'s real `applyInsight()`, which treats `applied` as a boolean and sets it to exactly `1` on real `qe_patterns` promotion. Live production data proved this: `applied` values up to 16 are only reachable via unconditional increment. Worse, the query always re-touched the *same newest 3* actionable rows forever instead of draining the actual backlog of never-applied ones. **Fix:** replaced the raw UPDATE with a call to the same genuine promotion path `checkAndTriggerDream()` already uses (`DreamEngine.applyInsight()`), scoped to actually-pending rows (`actionable = 1 AND (applied = 0 OR applied IS NULL)`, limit 3, most recent first) and run outside the sqlite transaction (applyInsight is async and opens its own ReasoningBank). Self-limiting: once the backlog is drained, steady-state cost is one indexed `SELECT` per successful task.

**This also revises the gap-check section above (2026-07-06, earlier same day):** its "all 840 applied insights survive intact" framing for the `dream_insights` dedup was written before Gap 2 was found — at the time, `applied=1` was assumed to mean genuine promotion, but 72 of those rows actually had `applied > 1` (only possible via the counter bug), i.e. a meaningful fraction of "applied" rows reflected fake increments, not real promotions. The dedup itself was still safe (it preserved every row with any nonzero `applied` value, so no real data was lost), but the *interpretation* of what `applied` meant at the time was corrupted by the still-live bug. Gap 2's fix does not retroactively clean up the 72 pre-existing over-counted rows (no user confirmation was sought for that separate cleanup; the fix only stops new corruption from being added).

**Verification:**
- New regression test in `tests/unit/learning/dream/dream-engine.test.ts` (`ensureConceptsLoaded gate bypass (A8-EXT follow-up)`): seeds a graph already above `minConceptsRequired`, inserts real `qe_pattern_nulls`/`qe_pattern_usage` rows, calls `ensureConceptsLoaded()`, asserts the error/outcome concept nodes exist afterward. Confirmed to fail under the pre-fix gate placement (verified by temporarily reintroducing the old gate order and re-running), pass after the fix.
- New test file `tests/unit/cli/commands/post-task-insight-promotion.test.ts` (4 tests): asserts `persistTaskOutcome()` calls `applyInsight()` only for genuinely pending rows, never re-touches an already-applied row on a later successful task, does nothing on task failure, and only counts genuinely successful promotions. 3 of the 4 assertions confirmed to fail under the pre-fix counter logic (verified via a scoped `git stash` of just this file, re-run, `git stash pop` to restore).
- Full `tests/unit/learning/dream/` + `tests/unit/cli/commands/` suites: 254/254 pass. `tsc --noEmit` and lint clean.
- **Real end-to-end verification against a backed-up copy of the live production database** (never the original — copied to a scratch path first, `PRAGMA integrity_check` before/after): `ensureConceptsLoaded()` ran cleanly against the real 5,051-node graph (idempotent no-op, since this session's earlier manual verification had already populated the 1 error/40 outcome nodes); `applyInsight()` genuinely promoted 3 of the real 208 pending (`applied=0`, `actionable=1`) production insights into real new `qe_patterns` rows, backlog count dropped 208 → 205, and the pre-existing 72 over-counted (`applied > 1`) rows were confirmed unchanged (no new corruption added). Copy discarded after verification; live `.agentic-qe/memory.db` untouched (mtime/checksum confirmed unchanged).

### Value-less data cleanup + pre-existing lint fixes (2026-07-06, explicit user request)

With explicit user confirmation, the data-cleanup items previously left in place across A14/A16/this section (all documented above as "identified but not cleaned, requires explicit confirmation") were executed against the **live** `.agentic-qe/memory.db`, following the full data-protection protocol: timestamped backup first (`memory.db.bak-1783357935`), before/after row counts, `PRAGMA integrity_check`, `wal_checkpoint(TRUNCATE)`.

**Investigated and confirmed 100%-junk before deleting anything** (every row matched the degenerate/test-fixture signature — no legitimate rows were mixed in, verified via explicit `NOT LIKE`/anti-join counts before running any DELETE):
- `mincut_snapshots` (A16): 200/200 rows matched the exact degenerate tuple (`vertex_count=14, edge_count=11, total_weight=16.5, is_connected=0, component_count=10`) → deleted.
- `mincut_history` (A16): 501/501 rows matched (`mincut_value=0.0, vertex_count=14, edge_count=11, algorithm='weighted-degree'`); zero rows had a `snapshot_id` link (confirms no dependency ordering issue) → deleted.
- `executed_steps` (A14): 705/705 rows had `plan_id LIKE 'test-plan-%'` (zero legitimate rows) → deleted (before its parent, for FK cleanliness even though `PRAGMA foreign_keys` is off in this DB).
- `execution_results` (A14): 530/530 rows had `plan_id LIKE 'test-plan-%'` → deleted. The canonical replacement table `goap_execution_steps` (A14's fix) currently has 0 rows in this dev DB, confirming these two legacy tables were purely dead.
- `dream_insights.applied` (this section's Gap 2): the 72 pre-existing over-counted rows (`applied` values 2–16, only reachable via the now-fixed counter bug) were corrected to `applied = 1` — a value **correction**, not a row deletion; total `dream_insights` row count (1,333) is unchanged before/after, only the corrupted counter values were clamped to the correct boolean semantic. Post-fix distribution: `applied=0` → 418 (genuinely pending), `applied=1` → 915 (843 previously-correct + 72 corrected).

**Verified**: `PRAGMA integrity_check` = `ok` after all five operations (single transaction); WAL fully checkpointed (`0|0|0`); live DB mtime/row-count deltas match exactly what was intended, nothing else touched.

**Lint**: the 3 pre-existing `unused-imports/no-unused-vars` errors noted earlier (2 in `goap-planner.ts`, 1 in `goap-execute.ts`) were fixed — plus a 4th that surfaced only after the first fix (removing the unused `SimilarPlan` interface exposed that `PlanSignature`, which only `SimilarPlan` had referenced, was itself now unused too):
- `goap-execute.ts`: removed the genuinely-unused `i` index param from a `.map()` callback.
- `goap-planner.ts`: removed the dead `SimilarPlan`/`PlanSignature` interfaces (referenced nowhere outside each other); prefixed `updateActionStats(actionId, success, _durationMs)` and `findSimilarPlan(goal, _similarityThreshold)`'s unused parameters with `_` per this codebase's existing convention — both are genuine "designed but not implemented" gaps (no schema column exists to persist a rolling average duration; `findSimilarPlan` only ever does exact goal-hash matching, never fuzzy similarity, despite the parameter's name), left as honestly-unimplemented rather than expanded in scope for a lint fix. Tracked as remaining work in the follow-up issue below.
- Verified: `tsc --noEmit` and `eslint` clean on both files; `tests/unit/planning/` + `tests/unit/mcp/tools/planning/` — 49/49 pass.

**Remaining work tracked in follow-up GitHub issue [#554](https://github.com/proffesor-for-testing/agentic-qe/issues/554)** (everything in this plan that is deliberately deferred/out-of-scope, not silently dropped): A9's hook-trigger-breadth half, A14's 13/40 unimplemented GOAP actions (including the two stub params just found), ADR-069 (RVCOW branching) unverified, dormant mincut event handlers (`onAgentTerminated`/`onAgentStatusChanged`/`onTaskCoordination`), and the inherently-unfixable historical data (5,201 empty-path `captured_experiences` rows, 13,463 unsigned witness-chain rows).
