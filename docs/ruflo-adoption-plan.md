# Ruflo Adoption Plan — Self-Learning, Routing, MCP & Benchmark Improvements

**Source:** Analysis of `ruvnet/ruflo` changes (307 commits, 2026-05-02 → 2026-06-01, ADR-120 → ADR-143).
**Goal:** Port the highest-value mechanisms and disciplines from Ruflo's last month into the AQE platform.
**Branch:** `working-april` · **Tracking issue:** [proffesor-for-testing/agentic-qe#510](https://github.com/proffesor-for-testing/agentic-qe/issues/510)
**Working rule:** implement → integrate → verify *from a user's perspective* → commit each item separately. **Do not push until requested.**

> Theme of Ruv's month: **"proof, not theater."** An audit (#2245) found the self-learning system "reports success but persists nothing queryable." ~20 ADRs went into wiring engines to their advertised surfaces and benchmarking against public baselines. That measurement discipline — not any single algorithm — is the core thing AQE adopts here.

---

## Status legend
`TODO` · `IN-PROGRESS` · `VERIFIED` (user-perspective check passed) · `COMMITTED` (sha recorded) · `BLOCKED`

## Progress table

| # | Item | Tier | Risk | Status | Commit |
|---|------|------|------|--------|--------|
| 1 | Self-learning verification harness | 1 | Low (new script) | VERIFIED | 9cb44d32 |
| 2 | Routing-confidence fix (domain-score de-dilution; ruflo per-bucket priors N/A) | 1 | Med (router) | VERIFIED | 1bb91b40 |
| 3 | Router bug audit: stale cache + state-encoder truncation | 1 | Low (audit) | VERIFIED | 28fa643e |
| 4 | MCP protocol-compliance smoke + tool-parity audit | 1 | Low (new tests) | VERIFIED | b1a462fb |
| 5 | Resilient hook shim (local→exit 0→swallow stderr→JSON-only stdout) | 1 | Low | VERIFIED | 1a695f56 |
| 6 | EWC++ catastrophic-forgetting protection | 2 | Med (learning) | VERIFIED | ef4738de |
| 7 | Contradiction detection in consolidation | 2 | Med (learning) | VERIFIED | 43918b3b |
| 8 | RaBitQ 1-bit signatures (utility + benchmark; 32× mem, ~1.3× speed, UNWIRED) | 2 | Med (perf) | VERIFIED | 0d80eb56 |
| 9 | Pretrain-from-history bootstrap | 2 | Low (new script) | TODO | — |
| 10 | marketplace.json + lean skill packaging | 2 | Low | TODO | — |
| 11 | Committed-baseline benchmark convention | 3 | Low | TODO | — |
| 12 | Honest-CI ethos (bootstrap CIs for mincut on/off) | 3 | Low | TODO | — |
| 13 | Supply-chain hardening (expiring accepted-findings) | 3 | Low | TODO | — |
| 14 | Init-bundle invariants smoke | 3 | Low | TODO | — |

---

## Execution order (compounding clusters)
1. **#3** (router audit — near-free, reveals correctness bugs) → **#1** (verification harness — exposes whether 338/73%/40% are real).
2. **#2 + #6 + #7** (routing-confidence + forgetting + contradiction — they compound on the learning store).
3. **#4 + #5** (MCP smoke + hook shim — CI/runtime hygiene).
4. **#8 + #9** (perf + bootstrap).
5. **#10–#14** opportunistic packaging/benchmark work.

Each item below has: **What Ruflo does**, **AQE target**, **Acceptance (user-perspective verification)**, **Ruflo reference**.

---

### #1 — Self-learning verification harness `[Tier 1]`
- **Ruflo:** Runs each learning entry-point N× in an isolated temp store, asserts the store actually moved; includes a **negative control** (record-only → 0 delta) and a **unified-stats consistency check** across aggregators. Built after #2245 found counters that never incremented and `pretrain` claiming patterns that `list` returned empty.
- **AQE target:** A script that runs AQE's learning entry-points against a **temp copy** of `patterns.rvf` / a throwaway namespace, asserts pattern/trajectory count deltas, a record-only negative control, and that the reported `338 patterns / 73% success / 40% confidence` round-trip through a query **and survive a restart**.
- **Acceptance:** Run the harness; it prints measured before/after deltas, exits non-zero if any store fails to persist. Independently confirm (or refute) the session-banner numbers.
- **Ref:** `v3/@claude-flow/cli/scripts/benchmark-self-learning.mjs`

### #2 — Per-bucket bandit priors (the 40% routing-confidence fix) `[Tier 1]` — RECLASSIFIED
- **Ruflo (ADR-142):** Beta(α,β) routing priors keyed by complexity bucket (low/med/high) instead of one global prior — fixes "8 failures on one hard task suppress a model for *all* tasks." Lossless forward-migration of flat priors into 3 buckets.
- **Investigation (2026-06-02, verified with real routes):** AQE's routing confidence is **NOT a Beta-bandit prior**, so ruflo's ADR-142 fix does not apply. Confidence (`QERoutingResult.confidence`) is the top agent's combined **static score** from `calculateAgentScores` (`src/learning/agent-routing.ts:338`), blended with an immature Q-table (`qWeight` ramps 0→0.4 only after 20 visits/state; live telemetry shows `qWeight: 0`). The one Beta sampler in the codebase (`src/integrations/ruvector/thompson-sampler.ts`, ADR-084) is for **cross-domain transfer**, keyed per domain-pair (already bucketed), and never feeds the 40% number.
- **Real root cause:** **domain-score dilution.** `agent-routing.ts:363` computes `domainScore = (domainMatch / detectedDomains.length) * 0.4`. AQE's domain detector returns 7–12 domains per task, so a perfect single-domain match yields `(1/11)*0.4 ≈ 0.04`. Confidence is therefore dominated by the fixed performance term (`profile.performanceScore * 0.3 ≈ 0.27`) + a default capability term (`0.15`), which is why a clean easy task lands at **37.3%** and a hard task at **20.5%** (measured via `aqe hooks pre-task`). The byzantine-consensus task also mis-routed to `qe-performance-tester`.
- **Proposed scoped fix (needs sign-off — published hot path):** de-dilute the domain term — divide by matched-or-`min(detectedDomains.length, K)` rather than the full breadth of *detected* domains, so relevance isn't washed out when the detector is broad. Keep it behind the existing `routingWeights` so it's tunable/reversible. Affects every routing decision + all confidence telemetry → requires explicit confirmation per CLAUDE.md production-safety.
- **Acceptance (unchanged):** reproduce low confidence (done: 37.3%/20.5%), apply fix, show easy-task confidence recovers and good matches rank correctly, verified via real `aqe hooks pre-task` calls.
- **Ref:** AQE `src/learning/agent-routing.ts:338-405`; ruflo `ADR-142-per-task-bandit-priors.md` (not a structural match).

### #3 — Router bug audit `[Tier 1]`
- **Ruflo (2026-05-29):** (#2229) learned Q-update hidden behind a stale route cache until 50 updates accrued → invalidate the state's cache entry on every update. (#2239) task→state hash shifted the keyword feature block past a 31-bit mask, collapsing all tasks into one state → full-width FNV-1a + `encoderVersion` migration guard.
- **AQE target:** Grep AQE routing/caching/state-encoding for both patterns; fix if present, document if absent.
- **Acceptance:** A test demonstrating a learned update is visible immediately (no stale cache) and two distinct tasks map to distinct states.
- **Ref:** `v3/@claude-flow/cli/src/ruvector/q-learning-router.ts` L274-281, L449-491

### #4 — MCP protocol-compliance smoke + CLI↔MCP parity audit `[Tier 1]`
- **Ruflo (#1874):** Boots the **real** MCP server (`spawn`), sends a real `initialize` JSON-RPC request, validates wire format against the spec (`protocolVersion` matches `YYYY-MM-DD`). Plus `audit-cli-mcp-tools.mjs` (monotone baseline) caught ~20 dangling CLI→MCP references.
- **AQE target:** A smoke test that boots AQE's MCP server and validates the `initialize` handshake; an audit asserting every CLI `callMCPTool('x')` resolves to a registered tool. Enforces CLAUDE.md's existing (currently unenforced) "MCP-CLI Parity" + "Integration Tests Required for MCP" mandates.
- **Acceptance:** Smoke connects to the live server and passes; parity audit reports 0 new dangling refs against a baseline.
- **Ref:** `plugins/ruflo-core/scripts/test-mcp-protocol.mjs`, `scripts/audit-cli-mcp-tools.mjs`

### #5 — Resilient hook shim `[Tier 1]`
- **Ruflo:** `ruflo-hook.{sh,cjs}` — prefer local binary → npx offline fallback → swallow stderr → always `exit 0`; Windows `.cjs` parity. Prevents a hook failure (or `npx @alpha` re-resolve crash) from blocking a Claude Code turn.
- **AQE target:** Harden AQE's `.claude/hooks` to never block a turn and never dump init noise into the transcript.
- **Acceptance:** Force a hook-internal error; confirm the turn proceeds and stderr is suppressed.
- **Ref:** `.claude-plugin/scripts/ruflo-hook.{sh,cjs}`, `hooks/hooks.json`

### #6 — EWC++ catastrophic-forgetting protection `[Tier 2]`
- **Ruflo:** Blends high-importance patterns instead of letting new low-value ones clobber them, weighted by per-dimension importance × recency. Honest framing: `F_i` is an embedding-importance proxy, not true Fisher.
- **AQE target:** Add importance-weighted blending to AQE's consolidation/dream cycle so success rate doesn't erode as patterns accumulate.
- **Acceptance:** Simulate an influx of low-value patterns; show high-value patterns survive and recall@k for known-good patterns is preserved.
- **Ref:** `v3/@claude-flow/cli/src/memory/ewc-consolidation.ts`

### #7 — Contradiction detection in consolidation `[Tier 2]`
- **Ruflo:** Flags pairs with cosine > 0.8 but quality delta > 0.4 ("similar context, opposite outcome") and excludes the loser from retrieval.
- **AQE target:** Extend AQE's dedup (which merges *agreeing* near-duplicates) to also detect *conflicting* ones and suppress the loser.
- **Acceptance:** Inject a contradictory pattern pair; show the lower-quality one stops being recalled.
- **Ref:** `v3/@claude-flow/neural/src/reasoning-bank.ts:1202`

### #8 — RaBitQ 1-bit signatures for HNSW retrieval `[Tier 2]`
- **Ruflo (perf M4):** Sign-random-projection + Hamming popcount, gated at N≥100: 10.9× per-pair, 2.7× end-to-end at N=1000, 32× index-memory reduction.
- **AQE target:** Apply to `qe-embeddings` / `patterns.rvf` similarity used in defect-prediction and coverage-gap search.
- **Acceptance:** Benchmark before/after on a fixed corpus; show speedup and memory reduction with recall@10 preserved.
- **Ref:** `v3/@claude-flow/guidance/src/retriever.ts`

### #9 — Pretrain-from-history bootstrap `[Tier 2]`
- **Ruflo (ADR-077):** Seeds the store from git history (commits = success trajectories) + closed issues at ~3 ms/trajectory through the same live-learning code path.
- **AQE target:** A bootstrap script so a fresh repo starts with a non-empty, project-specific pattern store.
- **Acceptance:** Run on a clean fixture repo; show the store goes from 0 to N patterns, queryable.
- **Ref:** `scripts/pretrain-from-github.mjs`

### #10 — marketplace.json + lean skill packaging `[Tier 2]`
- **Ruflo:** Flat marketplace index of plugins (`{name, source, description}`); versions per-plugin; skills auto-discovered (no skill/command/agent arrays in the manifest); per-bundle `smoke.sh` as a machine-checkable contract.
- **AQE target:** Package AQE's ~84 skills into installable bundles (`aqe-core`, `aqe-security`, `aqe-browser`, …) so users `/plugin install aqe-security@agentic-qe`.
- **Acceptance:** A generated `marketplace.json` + at least one bundle that passes its smoke contract.
- **Ref:** `.claude-plugin/marketplace.json`, `plugins/ruflo-plugin-creator/skills/create-plugin/SKILL.md`

### #11 — Committed-baseline benchmark convention `[Tier 3]`
- **Ruflo:** Every benchmark writes `runs/<name>-latest.json` + a timestamped run; regressions show as a git diff. CI: soft-gate + artifact upload + one hard "history summary" gate on *newly-regressed* metrics; `process.exit(0)` guards against native-handle hangs.
- **AQE target:** Adopt the convention for qe-* benchmarks on the `benchmarks` branch.
- **Acceptance:** One AQE benchmark emits the run-JSON pair and a CI step diffs it.
- **Ref:** `docs/benchmarks/runs/`, `.github/workflows/v3-ci.yml`

### #12 — Honest-CI ethos for mincut on/off `[Tier 3]`
- **Ruflo (BEIR):** Reports retrieval quality with bootstrap 95% CIs and labels non-significant wins as such.
- **AQE target:** Re-report the existing `mincut on/off` benchmark (branch `benchmarks`, commit 914dc934) with point estimate + CI; bench `qe_mincut_*` like Ruflo benches `dynamic-mincut` vs `personalized-pagerank` (p50/p99 at fixed graph size, baseline JSON).
- **Acceptance:** Mincut benchmark output includes CIs and a significance label.
- **Ref:** `docs/benchmarks/BEIR-MATRIX.md`, `scripts/benchmark-graph.mjs`

### #13 — Supply-chain hardening `[Tier 3]`
- **Ruflo:** `accepted-findings.json` with `expiresAt` (auto re-fail after the window); lesson #2112 — CVE overrides must be duplicated into *every* published package, not just root.
- **AQE target:** Add an expiring accepted-findings file; verify overrides in every published package (reinforces the documented consumer-audit rule).
- **Acceptance:** Audit step fails on an expired finding; tarball-install audit confirms overrides apply in the published package.
- **Ref:** `.github/supply-chain/{allowed-deps,accepted-findings}.json`, `scripts/audit-supply-chain.mjs`

### #14 — Init-bundle invariants smoke `[Tier 3]`
- **Ruflo (ADR-128):** Init silently shipped 0 skills because a dir-walk only resolved on the maintainer's machine; a static smoke ("every SKILLS_MAP entry resolves, no orphans") guards it.
- **AQE target:** A smoke asserting every shipped skill/agent resolves in the packed npm tarball.
- **Acceptance:** Pack the tarball, run the smoke; it fails if a declared skill is missing.
- **Ref:** `scripts/smoke-init-bundle-invariants.mjs`

---

## Discovered side-findings (from running the new harnesses)
- **Hook cold-start latency** (found by #5, 2026-06-02): the `route`/`session-start` bundle hooks cold-start the full system (CoherenceService, RVF, fleet, daemons) on each fire — observed ~30–60s. They run on every UserPromptSubmit/SessionStart. The shim doesn't change this; candidate perf follow-up (warm daemon / lighter route path / cache). Tracked in issue #510.
- **Windows `.cjs` hook parity** (follow-up from #5): AQE's hook config is entirely POSIX `sh -c`, so a Windows `.cjs` shim twin (as ruflo ships) also needs a settings rewrite — deferred.
- **MCP unknown-tool error loses its JSON-RPC code** (found by #4, 2026-06-02): `handleToolsCall` throws a plain object `{ code: -32601, message: 'Unknown tool: …' }` for unknown tools; it escapes the request-handler safety net where `err instanceof Error` is false, surfacing as `content` `{"success":false,"error":"Internal error: [object Object]"}` instead of a proper JSON-RPC `-32601` error. Tool is still correctly NOT executed. Candidate fix: throw a real `Error`/`McpError`. Tracked in issue #510.
- **`consecutive_failures` deprecation branch never fires** (found by #6, 2026-06-02): `PatternLifecycleManager.checkDeprecation` reads `(pattern as PatternWithDeprecation).consecutive_failures`, but `rowToPattern` (used by `getPattern`) does not surface that column, so the value is always `undefined→0` and the `'failures'` deprecation reason is dead via this path. Pre-existing (not introduced by #6). Candidate dedicated fix: include `consecutive_failures`/`deprecated_at` in `rowToPattern`. Tracked in issue #510.
- **RVF↔SQLite pattern drift** (found by #1 audit-real, 2026-06-02): live store shows RVF vector count **338** vs SQLite `qe_patterns` rows **345** (−7). Banner numbers (72.5% success / 39.7% confidence / 2131 routings) corroborate the session banner, but ~7 patterns exist in the table with no vector in the index. Non-gating note today; candidate for a dedicated reconciliation fix (a `qe_patterns` row without an RVF vector is invisible to semantic recall). Tracked in issue #510.

## Skip list (analyzed, not adopting)
- Legacy `install.sh`/`uninstall.sh` (`cp -r` into `~/.claude`) — superseded by native `/plugin install`.
- The neural-trader plugin itself — domain-specific; only its substrate-consumption pattern is reusable.

## Reference clone
`/tmp/ruflo-analysis` (depth-200 clone of `ruvnet/ruflo`).
