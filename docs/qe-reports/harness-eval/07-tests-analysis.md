# harness-eval — Test-Suite Analysis (07)

**Target:** `/tmp/harness-eval` (external repo — TypeScript/Bun framework that ranks agentic coding harnesses)
**Scope:** Static analysis of the existing test suite + the lead's captured run (`bun test ./tests`). No tests or source were run or modified by this review.
**Reviewer:** V3 QE Code Reviewer
**Date:** 2026-07-01

---

## Executive Summary

The suite is **broad and engineering-grade**: 31 test files / ~5,051 LOC / 609 `expect()` calls exercising 66 source modules / ~11,282 LOC. Assertions are mostly deep and behavioral (protocol fidelity, env-var propagation, artifact chains, secret redaction) rather than shallow not-null checks — only 6 files contain any `toBeDefined/toBeTruthy`-style assertion and never as the sole check. Hermetic seams are genuinely good: a `stub-app-server` fixture, a fake session executor that avoids LLM spend, a `worktree` provider that avoids cloud sandboxes, and disciplined `process.env` save/restore in the credential-sensitive tests.

Three real weaknesses drag the grade down:

1. **Four non-hermetic tests fail hard** (not skip) when a real authenticated Claude Code binary is absent — a test-design defect, not a product bug for 3 of the 4.
2. **One genuine brittle-assertion failure** — a hard-coded candidate count (`toHaveLength(6)`) that drifted to 8 as the registry grew. The product loader is correct.
3. **No CI test workflow exists at all.** The only GitHub Actions workflow is `pages.yml` (docs deploy). `bun test`, `tsc --noEmit`, and `biome check` are never run on push/PR.

**Overall grade: B-** (see rationale at the end).

---

## Test Inventory

| Test file | Primary module(s) under test | Covers |
|---|---|---|
| `unit.test.ts` (75 exp) | `registry.ts`, `driver/telemetry.ts`, `types.ts`, `models.ts` | Registry load/validation, stream-json parsing, session rendering, worker-env propagation |
| `zerocode.test.ts` (45) | `driver/zeroclaw.ts` | Zerocode/zeroclaw harness command generation, token env fallback |
| `models.test.ts` (32) | `models.ts` | Worker-model → env mapping (native vs GLM/z.ai routing) |
| `transcript-render.test.ts` (32) | `report/transcript-render.ts`, `grading/scrub.ts` | Transcript rendering + secret/LINEAR_API_KEY redaction |
| `studio-live-runs.test.ts` (32) | `studio/*`, `orchestrator/scheduler.ts` | Live job lifecycle queue (**1 failure**) |
| `providers-pluggable.test.ts` (32) | `providers/factory.ts`, docker/macos-vz/e2b | Provider selection + live docker/VM (env-gated, source of most skips) |
| `studio.test.ts` (28) | `studio/policy.ts`, `options.ts`, `run-exec.ts` | Studio policy/options/authorization |
| `targets.test.ts` (26) | `targets.ts` | Target catalog + PRD/conformance loading |
| `design-adherence.test.ts` (24) | `grading/design-adherence.ts` | Design-adherence scoring |
| `preview.test.ts` (24) | `preview/manager.ts`, `launcher.ts`, `backend.ts`, `router.ts` | Preview server lifecycle |
| `container-teardown.test.ts` (22) | `providers/reap.ts`, `cli-container.ts` | Container/VM teardown + leak reaping |
| `driver-layer.test.ts` (21) | `driver/session.ts`, `claude.ts`, `codex.ts` | Session-script driver behavior |
| `driver-contract.test.ts` (20) | `driver/index.ts`, `driver/types.ts` | Driver contract/interface conformance |
| `e2e-dry.test.ts` (18) | `orchestrator/scheduler.ts` + report chain | Full dry-run artifact chain (fake executor) |
| `live-stream.test.ts` (14) | `studio/live-stream.ts`, `live/tap.ts` | Live event streaming |
| `live-run-durability.test.ts` (13) | `studio/run-worker.ts`, `run-state.ts` | Detached-worker durability (**1 failure**) |
| `provider-availability.test.ts` (13) | `studio/provider-availability.ts` | Provider configured/available status |
| `stub-protocol.test.ts` (12) | `targets/symphony-daemon` stub | JSON-RPC app-server protocol fidelity |
| `studio-e2e.test.ts` (12) | `studio/*` orchestrator | Worktree dry run through studio (**1 failure**) |
| `report-models.test.ts` (11) | `report/results.ts`, `report/markdown.ts` | Results/scorecard modeling |
| `run-state.test.ts` (10) | `studio/run-state.ts` | Run-state read/write |
| `catalog.test.ts` (9) | `catalog.ts` | Candidate catalog |
| `harnesses.test.ts` (8) | `harnesses.ts` | Harness registry resolution |
| `cc-grading-capture.test.ts` (8) | `grading/cc-driver.ts` | Claude Code grading capture (bg process) |
| `providers.test.ts` (8) | `providers/*` HOME isolation | Per-trial HOME sandboxing |
| `e2b-provider.test.ts` (7) | `providers/e2b.ts` | E2B preflight (env-gated) |
| `dashboard.test.ts` (7) | `dashboard/data.ts`, `dashboard/index.ts` | Dashboard data assembly |
| `transcript-jump.test.ts` (7) | `report/transcript-render.ts` | Transcript navigation/jump |
| `design-adherence-e2e.test.ts` (6) | `grading/design-adherence.ts` | Design-adherence end-to-end |
| `e2e-dry-target.test.ts` (6) | `orchestrator/scheduler.ts` + target | Target dry run |
| `studio-transcript.test.ts` (4) | `studio/transcript.ts` | Studio transcript view |
| *(co-located)* `src/bracket/scoring.test.ts` | `bracket/scoring.ts` | Bracket scoring math |

---

## Coverage Map (tested vs untested)

**Well covered** (direct, meaningful tests): `registry.ts`, `harnesses.ts`, `catalog.ts`, `models.ts`, `targets.ts`, `types.ts`, `driver/session.ts|claude.ts|codex.ts|telemetry.ts|zeroclaw.ts`, `grading/design-adherence.ts|scrub.ts|testplan.ts|evaluator.ts`, `orchestrator/scheduler.ts`, `providers/factory.ts|e2b.ts|reap.ts|worktree.ts|cli-container.ts`, `studio/policy.ts|options.ts|run-state.ts|live-stream.ts|provider-availability.ts`, `report/results.ts|markdown.ts|transcript-render.ts`, `preview/*`, `dashboard/data.ts`, `bracket/scoring.ts`.

**Partially / indirectly covered:** `grading/scoring.ts`, `grading/integration.ts`, `grading/cc-driver.ts` (only capture path), `orchestrator/grade.ts` (only via `e2e-dry`), `providers/docker.ts|macos-vz.ts` (live tests skip without runtime), `bracket/bracket.ts` (only scoring math, not bracket orchestration), `studio/run-worker.ts|run-exec.ts` (via the failing durability/e2e tests).

**Untested (gaps):**
- **`src/cli.ts`** — the CLI entrypoint. No `cli.test.ts`; only referenced indirectly in teardown messages. This is the primary user-facing surface and is unverified end-to-end.
- **`src/grading/judge.ts`** — the blind LLM judge, the core scoring authority. Hard to unit-test (needs a real model) but has **no seam/stub test** proving prompt assembly / scrubbing / parsing. High-risk gap.
- **`src/report/inverse-scaling.ts`** — no dedicated test found.
- **`src/providers/daytona.ts`** — only reachable via `provider-availability` status; no preflight/behavior test (contrast with `e2b-provider.test.ts`).
- **UI:** `src/studio/frontend.tsx`, `src/studio/components/*`, `src/dashboard/app.tsx` — no React component/DOM tests. Only the data layer is tested.
- **`src/live/registry.ts`** — thin/no direct coverage.

Estimated behavioral coverage of non-UI, non-CLI logic: **strong (~70-80% of modules touched)**. Coverage of the two riskiest seams — the CLI entrypoint and the LLM judge — is **weak-to-absent**. There is **no coverage tooling configured** (`bunfig.toml` has no coverage gate; `package.json` `test` script is bare `bun test ./tests`), so this is a mapping estimate, not a measured number.

---

## Test Run Results (captured, authoritative)

```
197 pass · 11 skip · 4 fail · 609 expect() calls
Ran 212 tests across 31 files. [129.57s]  EXIT 1
```

- **11 skips** all originate from `providers-pluggable.test.ts` — the `test.if(hasDocker)`, `test.if(hasContainerCli)`, and four `describe.if(...)` live blocks (`macos-vz live`, `docker provider end-to-end (live)`, `scheduler e2e dry run on docker (live)`, `scheduler e2e dry run on macos-vz (live)`). These **degrade correctly by skipping** when no container runtime is present — the right hermetic pattern.
- **129.57s wall time** is dominated by the polling/timeout tests (30s and 60s poll loops, 90s scheduler teardowns).

---

## Failure Root-Cause Analysis

### Failure #1 — `unit.test.ts:116` "shipped registry loads" (GENUINE, but a brittle-test defect, not a product bug)

```ts
const registry = loadRegistry("config/registry.yaml");
expect(registry.candidates).toHaveLength(6);   // ← Received length: 8
```

**Root cause:** `config/registry.yaml` ships **8** candidates — `superpowers`, `compound-engineering`, `agent-skills`, `gsd`, `codex-baseline`, `gstack`, `ruflo`, `bare`. The loader (`src/registry.ts::loadRegistry`) parsed and validated all 8 **correctly**. The failure is a **stale hard-coded magic-number assertion**: the test was written when the registry had 6 candidates, and `gstack` + `ruflo` were added later (their YAML comments read as later additions) without updating the count. The product is fine; the test drifted.

**Severity: MEDIUM (test-maintenance).** **Fix:** don't assert a literal count. Either (a) assert the presence of specific expected IDs (`expect(registry.candidates.map(c => c.id)).toEqual(expect.arrayContaining([...]))`), or (b) drive the count from a shared constant / snapshot. The second assertion in the same test (`resolveCandidates(..., "opencode")` throws) is good and should be kept.

### Failures #2–#4 — non-hermetic live/worktree/detached dry-runs stuck at status `"running"` (ENVIRONMENTAL + test-design defect)

- `studio-live-runs.test.ts:207` — "authorized + confirmed live run … full lifecycle with no spend" (30.2s → `running`)
- `studio-e2e.test.ts:54` — "worktree dry run completes through the orchestrator" (30.3s → `running`)
- `live-run-durability.test.ts:112` — "6.3 a dry run executes in the detached worker and completes on its own" (60.4s → `running`; plus logged `[scheduler] teardown of mem-trial exceeded 90s — moving on`)

**Root cause:** all three drive a real worktree/detached worker that expects an authenticated Claude Code binary (or a completing detached process) which is absent in this sandbox. They **poll a fixed number of iterations then hard-assert `status === "completed"`** — so instead of degrading (skip / conditional), they time out and fail. Unlike the `providers-pluggable` live blocks (which are correctly gated behind `describe.if(hasDocker)`), these tests are **ungated**.

**Severity: HIGH (test hermeticity).** For #2–#4 the *product* is likely not at fault, but the *tests are non-hermetic and environment-coupled*, which is itself a finding: they cannot be trusted as pass/fail signal in CI or any machine without an authed binary. **Fix:** gate them behind an availability probe (`describe.if(claudeAvailable)` / `test.if(...)`) exactly like the docker blocks, OR route them through the existing fake-session executor seam used by `e2e-dry.test.ts` (which completes the same chain with no binary and no spend). The 90s teardown-exceeded log also indicates a real resource-leak risk when the worker never completes.

---

## Test Quality Findings

**Strengths**
- **Deep, behavioral assertions.** `stub-protocol.test.ts` asserts exactly-one-response-per-JSON-RPC-id, notification ordering, pre-handshake error text, and a specific crash exit code (3) — real protocol fidelity, not smoke. `unit.test.ts` asserts worker env (`ANTHROPIC_AUTH_TOKEN`) actually propagates to the spawned process. `transcript-render.test.ts` proves secret redaction happens.
- **Real seams over heavy mocking.** The fake session executor (`e2e-dry.test.ts`) and `worktree` provider exercise the full provision→install→build→archive→grade→results→scorecard chain with **no LLM spend and no cloud** — a clean, honest end-to-end seam. Install steps are overridden to `["true"]` so dry runs never hit plugin marketplaces.
- **Disciplined env isolation.** `e2b-provider.test.ts` and `transcript-render.test.ts` save and restore `process.env` keys in `beforeEach/afterEach`, preventing cross-test env bleed (27 lifecycle hooks across the suite).
- **Good naming.** Tests are named by behavior and spec id (e.g., "pre-handshake request errors with Not initialized", "missing E2B_API_KEY fails fast with a PreflightError").
- Almost no tautological/shallow assertions — the not-null-only smell is essentially absent.

**Weaknesses**
- The brittle `toHaveLength(6)` count (Failure #1) is the clearest anti-pattern.
- The LLM **judge** — the component that determines the entire ranking — has no stubbed seam test, so its prompt assembly and output parsing are unverified. This is the single most consequential coverage gap for a *ranking* tool.
- The CLI entrypoint (`cli.ts`) is untested; argument parsing / command dispatch is unverified.

---

## Test Smells & Flakiness / Hermeticity Risks

| Smell | Location | Severity | Note |
|---|---|---|---|
| Fixed-count poll then hard-assert (timing flakiness) | `studio-live-runs.test.ts:203-207`, `studio-e2e.test.ts:50-54`, `live-run-durability.test.ts:107-112` | HIGH | 30-60s `sleep(500)`×N loops; fail (not skip) when the awaited process never completes. Root of failures #2-#4. |
| 90s scheduler teardown | `live-run-durability.test.ts` (logged) | MEDIUM | Slow + risks leaked VM/worker ("run `bun run src/cli.ts cleanup`"). Resource-leak signal. |
| Real-time `sleep` waits | `cc-grading-capture.test.ts:37` (3.5s), `:54` (1.5s), `preview.test.ts` (1s), `e2e-dry*.test.ts` (`sleep 60`) | MEDIUM | Wall-clock waits inflate runtime (129s total) and can flake under load. Prefer polling on a condition with a bound, not fixed sleeps. |
| Environment-coupled (needs real binary/creds) | studio live/e2e, live-run-durability | HIGH | Not gated; contrast with correctly-gated `providers-pluggable` `describe.if`. |
| Magic-number assertion | `unit.test.ts:116` | MEDIUM | Drifts whenever a candidate is added. |
| Shared `process.env` mutation | `e2b-provider.test.ts`, `transcript-render.test.ts` | LOW | Handled correctly (save/restore), but any early throw before restore would leak — wrap in try/finally (transcript-render does; verify all do). |
| Hard-coded `/tmp` / `tmpdir()` paths | many (`mkdtempSync(join(tmpdir(), ...))`) | LOW | Uses `mkdtempSync` (unique) — acceptable; not order-dependent. |
| No global test timeout / retry policy | suite-wide | LOW | Long tests rely on internal loop bounds; no bun `--timeout` guard configured. |

No `.only` and no committed `.skip`/`.todo` were found — good. All skips are dynamic `test.if/describe.if` on runtime capability, which is the correct pattern.

---

## CI / Automation Gaps

**KEY FINDING: there is no test CI.** The only workflow is `.github/workflows/pages.yml`, which deploys the `pages/` docs on push to `main`. It never runs `bun test`, `bunx tsc --noEmit`, or `biome check`.

Consequences:
- The **4 failing tests + brittle count would never have been caught by automation** — they surface only when a human runs the suite locally.
- `package.json` already defines the right scripts (`test`, `check` = `tsc --noEmit && biome check`, `lint`), so wiring CI is low-effort.
- No coverage measurement, no coverage gate, no required-check on PRs.

**Recommended CI (minimal):** a `test.yml` on `push`/`pull_request` that runs `oven-sh/setup-bun`, `bun install`, `bun run check`, and a **hermetic** `bun test` subset (exclude or gate the live studio/worktree/detached tests behind an env flag, since they cannot pass without an authed binary). Optionally a separate manually-dispatched `live-e2e.yml` for the binary/creds-dependent tests.

---

## Prioritized Recommendations

1. **(HIGH) Make the 3 live tests hermetic.** Gate `studio-live-runs`, `studio-e2e`, and `live-run-durability` behind a `claudeAvailable()` probe (mirror `describe.if(hasDocker)`), or reroute them through the fake-session seam already proven in `e2e-dry.test.ts`. This turns 3 red tests green-or-skipped and makes the suite CI-runnable.
2. **(HIGH) Add a test CI workflow** running `bun run check` + hermetic `bun test` on every PR, as a required status check. Move binary/creds-dependent tests to a separate opt-in job.
3. **(MEDIUM) Fix the brittle count** at `unit.test.ts:116` — assert specific candidate IDs instead of `toHaveLength(6)`.
4. **(MEDIUM) Add a stubbed test for `grading/judge.ts`** — the ranking authority. Verify prompt assembly, marker/secret scrubbing, and judge-output parsing against a canned model response. This is the highest-value new coverage.
5. **(MEDIUM) Add a `cli.ts` smoke/dispatch test** — parse args and route to the right command with a fake orchestrator; verify the `cleanup` command referenced in teardown messages actually exists and reaps.
6. **(LOW) Replace fixed `sleep()` waits with bounded condition-polling** and add a bun `--timeout`; investigate the 90s teardown leak path in the scheduler.
7. **(LOW) Add coverage measurement** (`bun test --coverage`) with an advisory threshold to make the untested CLI/judge/UI gaps visible over time.

---

## Overall Test Suite Grade: **B-**

**Why not higher:** four failing tests out of the box (one a genuine brittle-assertion defect, three non-hermetic and ungated), **zero test CI**, and the two riskiest surfaces for a *ranking* tool — the CLI entrypoint and the LLM judge — are essentially untested. A 129s runtime with 30-90s timing loops is a maintainability/flakiness liability.

**Why not lower:** the suite is broad (66 modules touched), assertions are deep and behavioral rather than shallow, hermetic seams (stub app-server, fake executor, worktree provider, env save/restore) are thoughtfully engineered, live tests that *are* gated degrade correctly by skipping, and there is no `.only`/committed-`.skip` hygiene problem. The failures are concentrated and fixable; the underlying test engineering is sound.
