# harness-eval — Product Factors & Test Strategy

**Target:** `/tmp/harness-eval` (branch state as checked out; `node_modules` installed)
**Method:** James Bach's HTSM Product Factors (SFDIPOT) → context-driven test strategy + plan
**Analyst evidence classes** (ADR-105): `STATIC` = read from repo files/AST; `INFERRED` = reasoning over code without execution; `EXECUTED` = ran a command. Suite-state figures below are `EXECUTED` (captured by the team lead: `bun test ./tests` = 212 tests / 31 files, 197 pass / 11 skip / 4 fail, 129.6s). Everything else in this report is `STATIC`/`INFERRED` from a read-only pass over the source — no builds or runs were performed by this analyst.

**What this system is (one paragraph).** harness-eval is a TypeScript/Bun framework that *definitively ranks agentic coding frameworks* by making each build the same PRD in an isolated sandbox, driven by a fixed harness+model, then grading the artifact with two independent instruments: an evidence-based **evaluator agent** that executes a frozen, hash-bound test plan against the *running* build, and a **blind code-quality judge** (framework-marker-scrubbed copy, judge ≠ worker model). Outputs are a stable-schema `results.json` + `scorecard.md` + a read-only dashboard and an in-review Eval Studio web UI. The whole value proposition is **fairness + reproducibility + evidence** — so the product's own quality risks are overwhelmingly about *measurement validity* (a wrong number that looks authoritative) and *real-spend safety* (burning subscription/API budget), not conventional feature bugs.

---

# PART A — SFDIPOT Product Factors

Each dimension lists the concrete elements found in the repo, the quality risks, and prioritized test ideas. Priorities are risk-weighted for *this* product: **P0 = a defect here silently corrupts a published ranking or spends real money unsafely; P1 = fairness/reproducibility erosion or operational data loss; P2 = UX, polish, breadth.**

## S — Structure (what the product IS)

**Elements (STATIC).** `src/` ~11.3k LOC across bounded modules: `orchestrator/` (scheduler, grade), `providers/` (daytona, e2b, docker, macos-vz, worktree, cli-container, factory, reap), `driver/` (claude, codex, zeroclaw, session, telemetry, archive), `grading/` (evaluator, judge, scoring, scrub, testplan, integration, design-adherence, cc-driver), `report/`, `dashboard/`, `studio/`, `live/`, `preview/`, plus `registry.ts`, `models.ts`, `targets.ts`, `types.ts` (415-line Zod schema — the spine). `config/*.yaml` (registry, models, harnesses, run.defaults, fixtures-manifest). CLI: `src/cli.ts` (validate/init/catalog/model/run/report/cleanup). Files are disciplined (<500 LOC; largest is `cli.ts` at 502). `infra/trial-image/Dockerfile` is the single pinned image shared by all image-backed providers.

**Risks.**
- R-S1 (`INFERRED`): The Zod `types.ts` schema is the single source of truth for `results.json` (`schemaVersion: z.literal(1)`) and every provenance record. A silent widening/narrowing of a field is a schema-drift defect that corrupts cross-run comparison and dashboard rendering. Fields with `.optional()`/`.default()` (e.g. `workerModel`, `costSource`, `designAdherence`) are back-compat seams that can mask missing data as "fine."
- R-S2 (`INFERRED`): `providers/factory.ts` hard-couples harness↔image (`resolveProviderSnapshot` throws for `zerocode`+`worktree`; pins `ZEROCLAW_DAYTONA_SNAPSHOT = harness-eval-base:v4`). A stale/mismatched image name is a structural mistake that fails at run time, not load time.
- R-S3 (`STATIC`): Config lives in five YAML files parsed at different call sites; `validate` only checks registry+target+fixtures+catalog, not `models.yaml` or `harnesses.yaml` coherence with the registry's declared harness keys in one place.

**Test ideas.**
- **P0** — Load `config/registry.yaml`, mutate one candidate to declare an undeclared harness key, assert `loadRegistry` rejects it at load time (already covered by `unit.test.ts` "rejects unimplemented harness keys"; extend to assert *every* harness key in the registry exists in `harnesses.yaml`).
- **P0** — Round-trip a golden `results.json` through `RunResults.parse()` → serialize → re-parse; byte-diff and assert schema stability for `schemaVersion: 1`. Guards R-S1 against accidental required→optional flips.
- **P1** — Snapshot-test `resolveProviderSnapshot` for the full `provider × harness` matrix (5×3) including the two throw paths; assert image identity strings match `factory.ts` constants and the Dockerfile tag.
- **P2** — Enforce the <500-LOC rule and cyclomatic ceiling in CI (biome/tsc already wired via `npm run check`); fail the build on a new >500-LOC file.

## F — Function (what the product DOES)

**Elements (STATIC).** Candidate registry + fairness rendering (`registry.ts renderSessionScript`, `{{BASE_PROMPT}}` substitution). Orchestration (`orchestrator/scheduler.ts runMatrix/runTrial`: bounded concurrency, `RunLedger` run-cost ceiling, infra-vs-candidate failure classification `isInfraFailure`, infra retry with backoff, provenance at every terminal state, teardown time-box `TEARDOWN_CAP_MS`). Two-instrument grading: `grading/evaluator.ts` (frozen test plan, tool-augmented REPL agent, fatal-halt semantics, per-step checkpoint via `onRecord`), `grading/judge.ts` (5 criteria × 3 samples, median, `onCriterion` checkpoint), `grading/scrub.ts` (marker + harness-trace removal). Scoring/re-weighting: `grading/scoring.ts` (min-max normalize speed/spend, absolute adherence/quality, weighted composite, `isInconclusive` top-two overlap). Freeze/hash invariants: `grading/testplan.ts` (`REQUIRED_COVERAGE` §18.1 map, PRD-sha binding, duplicate-id guard). Model/provider/harness pluggability (`models.ts`, `harnesses.ts`, `providers/factory.ts`). Fairness enforcement: identical base prompt, allowlist-only continuations, judge≠worker guard (`judgeWorkerRelation`).

**Risks.**
- R-F1 (`INFERRED`, **highest-value risk in the product**): The evaluator/judge are LLM agents. Non-determinism, a "helpful" evaluator that repairs the artifact, or an evaluator that verdicts from source-reading instead of observed behavior all produce *invalid but authoritative* scores. Mitigations are prompt-only (`EVALUATOR_SYSTEM` "NEVER repair… evidence-based verdicts only"), which cannot be unit-tested — only guarded structurally (evidence non-empty, `record_step` schema) and via meta-evaluation.
- R-F2 (`STATIC`): `scoreAdherence` computes `passAt1` as `allPass && scoring.length > 0` and `completeFailure` as `!anyPass`. A fatal-halt zeros remaining steps *only if the harness pre-fills them* (comment line 42 in evaluator.ts fills unrecorded steps as fail). If a fatal step is verdicted `partial` (credit>0) rather than `fail`, the halt never triggers — a spec-semantics edge that changes the score materially.
- R-F3 (`STATIC`): Normalization is *within-run min-max* (`normalizeAcrossCandidates`): speed/spend of 100 and 0 are assigned to the fastest/slowest candidate *in that run only*. A single-candidate run makes speed/spend degenerate to 100 (all-equal → 100). Cross-run leaderboard rows are therefore not comparable on those axes — the README says so, but nothing enforces that a consumer doesn't average them.
- R-F4 (`STATIC`): `judgeWorkerRelation`/cross-vendor flag is a *caveat*, not a *block* — a run where judge==worker vendor still proceeds and is flagged. The judge≠worker *model* invariant (CLAUDE.md) is asserted where? (needs a test that a run with judgeModel==workerModel is rejected or at least flagged).
- R-F5 (`STATIC`): `isInfraFailure` uses a message-regex heuristic (`/provision|sandbox|network|econnre|…|memory limit|quota|…/`). A candidate failure whose message coincidentally matches (e.g. a build that prints "network") would be *retried and re-billed* as infra, or an infra failure with a novel message would be graded as a candidate artifact — both distort results and spend.
- R-F6 (`STATIC`): `testplan.ts REQUIRED_COVERAGE` is a hardcoded map for Symphony only. Other targets (`kanban`, `rest-api`, `web-app`, etc.) have no §18.1-style coverage gate — their frozen plans could silently under-cover their PRD.

**Test ideas.**
- **P0** — `scoreAdherence`: fatal step verdicted `partial` (credit 0.4) → assert defined behavior (does the plan halt? currently NO). Add a test pinning the intended semantics; today this is untested and ambiguous. (Extends `unit.test.ts` "adherence scoring".)
- **P0** — Evaluator contract test with a mock `Anthropic` client: feed a scripted tool-use stream that (a) omits `record_step` for a step → assert it's filled as `fail` with the "not recorded" evidence; (b) returns a fatal `fail` → assert subsequent steps zeroed with "halted at fatal step" evidence; (c) returns `record_step` with empty evidence → assert schema rejects (evidence `.min(1)`). Guards R-F1/R-F2 structurally without spend.
- **P0** — Judge determinism/aggregation: mock client returns samples `[9,6,7]` → assert `median`=7 and `medianRun.justification` is the one at the median (guards the `runs.find(r=>r.score===med)` selection). Add a 3-way-tie and even-count case.
- **P0** — `isInfraFailure` adversarial corpus: a candidate build log containing "network timeout" / "rate limit" strings → assert it is NOT misclassified as infra (today's regex would misfire). This directly protects real spend and result validity. (Extends `unit.test.ts` "infra vs candidate failure classification".)
- **P1** — Fairness invariant test: for every candidate in the shipped registry, `renderSessionScript` produces a script whose only task content is the identical rendered base prompt; assert no session step introduces target-specific hints beyond `{{BASE_PROMPT}}`/allowlist continuations.
- **P1** — `scrubWorkspace`: create a workspace containing markers from *multiple* candidates + harness traces (`.claude/`, `CLAUDE.md`, `.planning/`); assert ALL are removed from the blind copy (so absence isn't a signal) and the original is untouched.
- **P1** — Judge≠worker enforcement: run config with `judgeModel == workerModel` → assert the run flags/rejects per the CLAUDE.md invariant.
- **P1** — `REQUIRED_COVERAGE`: for Symphony, assert every §18.1 key maps to ≥1 non-bonus step (covered); replicate a coverage-gate for at least one other target or assert the gap is intentional.
- **P2** — `isInconclusive`: property test over composite means ± σ; assert the top-two-overlap flag is symmetric and monotonic.

## D — Data (what it PROCESSES)

**Elements (STATIC).** Inputs: `targets/*/PRD.md` (Symphony PRD is 81KB), frozen `testplan.yaml` (Symphony: 22 steps, `prdSha256` bound), `target.yaml`, `config/*.yaml`, `.env` secrets. Content hashes: `prdSha256`, `testPlanSha256`, `manifestSha256`, `designSha256` (length-64 enforced). Outputs: `results.json` (`RunResults`), `scorecard.md`, per-trial `provenance.json`/`grades.json`/`run-state.json`, transcripts (`session-NNN.jsonl` + rendered `.md`), telemetry (tokens/cost/turns/duration). Fixtures: `config/fixtures-manifest.yaml` (live Linear project baseline for the real-integration tier), `targets/symphony-daemon/fixtures/` (mock-linear.ts, stub-app-server.ts).

**Risks.**
- R-D1 (`STATIC`, **critical**): Secret redaction (`driver/archive.ts`) is the only barrier between real API keys and archived-then-committed-to-dashboard workspaces/transcripts. It relies on (a) an env-var value list `collectSecretValues` (min length 8) and (b) a fixed regex set (`sk-ant-`, `dtn_`, `lin_api_`, `e2b_`, `gh[pousr]_`, etc.). Any *new* provider key shape not in the pattern list, a secret <8 chars, a base64/gzip-embedded secret, or a secret in a *binary/non-text* file (skipped by `TEXT_EXTENSIONS`) leaks. CLAUDE.md explicitly says "add new key patterns when adding providers" — a manual, forgettable step.
- R-D2 (`STATIC`): The frozen-hash contract fails loudly *only if* the loader is invoked with the expected sha (`loadTestPlan(path, expectedPrdSha256)`). `cli.ts run` loads via `loadTarget` which computes hashes but the binding of testplan→PRD is checked inside `testplan.ts`; a target whose `testplan.yaml prdSha256` was hand-edited to match a drifted PRD would pass. Freeze integrity is only as strong as the discipline of not editing both together.
- R-D3 (`STATIC`): `results.json` back-compat: `workerModel`/`judgeModel` optional, `costSource` defaults `harness-reported`. A token-only harness (Codex/ZeroClaw, `reportsCost:false`) whose `costSource` is mis-resolved would report a *dollar* figure of 0 and normalize spend to a misleading 100/0.
- R-D4 (`STATIC`): Transcripts are JSONL ground truth; the rendered `.md` is derived and best-effort (try/catch swallows render errors). A malformed transcript silently produces no readable audit — acceptable, but the audit gap is invisible.

**Test ideas.**
- **P0** — Redaction breadth: table-test `redactSecrets` across every key shape in `models.yaml` (ZAI_API_KEY, KIMI_API_KEY, MINIMAX_API_KEY, DASHSCOPE_API_KEY, OPENAI_API_KEY, CLAUDE_CODE_OAUTH_TOKEN) — assert each configured provider's realistic token *format* is caught by a pattern OR by env-value collection. **Finding: `DASHSCOPE`/`KIMI`/`MINIMAX`/`ZAI` and `CLAUDE_CODE_OAUTH_TOKEN` have no dedicated regex** — they rely solely on the env-value list, so a token that appears in a transcript but wasn't in this process's env (e.g. an agent that echoed a key from a config file it wrote) is NOT redacted. This is the top data-safety gap. (Extends `unit.test.ts` "redaction".)
- **P0** — Redaction file-type coverage: place a secret in a `.pem`, a `.tar`, and an extensionless binary inside the workspace; assert the archiver's behavior is defined (skips binary — so document that agents must not write secrets to binaries) and that `.env`/`.log`/`.json` are covered.
- **P1** — Hash-freeze drift: corrupt `testplan.yaml prdSha256` by one char and load against the real PRD → assert `TestPlanError` "targets PRD … but vendored PRD is …". (Covered indirectly by `unit.test.ts` "test plan loads with coverage and PRD hash binding" — extend to assert the drift message.)
- **P1** — `costSource` resolution matrix: worker profile with `reportsCost:false` harness → assert `costSource` is `profile-priced` or `tokens-only`, never `harness-reported`; assert spend normalization handles all-zero cost gracefully (currently all-equal→100).
- **P2** — Round-trip a pre-registry `results.json` (no `workerModel`) → assert it still parses (back-compat) and the dashboard's "unknown schema version" path is exercised for `schemaVersion !== 1`.

## I — Interfaces (how it CONNECTS)

**Elements (STATIC).** CLI (`cli.ts`, 7 commands). Dashboard HTTP (`dashboard/index.ts`, `Bun.serve` 127.0.0.1:4870, read-only). Eval Studio HTTP (`studio/index.ts`, 4871, shadcn/ui + live run config/exec). `SandboxProvider` contract (`providers/types.ts`: provision/exec/copyOut/writeFile/destroy + optional preflight) — the seam all 5 providers implement. Harness drivers (`driver/`): Claude Code stream-JSON (`claude.ts parseStreamJson`), Codex `codex exec --json` (`codex.ts`), ZeroClaw ACP JSON-RPC (`zeroclaw.ts`). Mock/stub services: mock Linear GraphQL (`fixtures/mock-linear.ts`, `/control/*` endpoints), stub Codex app-server (`fixtures/stub-app-server.ts`, JSON-line, `STUB_MODE=normal|crash|stall`). Anthropic SDK (`@anthropic-ai/sdk` in evaluator/judge). z.ai + other Anthropic-compatible endpoints via base-URL slot-mapping.

**Risks.**
- R-I1 (`STATIC`, **critical for validity**): `parseStreamJson` is the sole extractor of telemetry (duration/turns/cost/usage) from Claude Code's stream. It throws without a `result` message (`unit.test.ts` covers this) — but an *upstream Claude Code output-format change* (renamed field, moved `usage`, new cache-token key) would silently zero telemetry or crash mid-run. This is an un-versioned external contract.
- R-I2 (`STATIC`): Three harness drivers with three wire protocols (stream-JSON, `codex exec --json`, ACP JSON-RPC). Each must map to the same `SessionRecord`. Contract tests exist (`driver-contract.test.ts`, `driver-layer.test.ts`, `zerocode.test.ts`, `cc-grading-capture.test.ts`) — this is the best-covered interface area.
- R-I3 (`STATIC`): The mock Linear API and stub app-server *define the oracle* for the Symphony evaluator. A bug in a fixture (wrong `/control` semantics, wrong blocked-by handling for JAZ-10) produces false evaluator verdicts. Fixture correctness is itself under-tested relative to its leverage. `stub-protocol.test.ts` covers the stub protocol; mock-linear control endpoints coverage is thinner.
- R-I4 (`STATIC`): Studio/dashboard bind localhost-only (good), but Studio *launches real spend* over HTTP behind an operator-token policy (`studio/policy.ts`, `resolveLaunchPolicy`, `STUDIO_OPERATOR_TOKEN`). The authorization seam is security-relevant.

**Test ideas.**
- **P0** — `parseStreamJson` golden-corpus + malformation suite: current-format success (covered), missing `result` (covered), plus: missing `usage`, missing `total_cost_usd`, extra unknown fields, truncated final line. Assert graceful/typed failure, never a wrong non-zero number. Pin against a captured real Claude Code stream sample as a canary for R-I1.
- **P0** — Studio launch authorization: no real provider/session is constructed unless all four gates pass (already covered — `studio-live-runs.test.ts` "no real session/provider is constructed unless ALL four gates pass" and "denied real launch provisions nothing"). Keep these green; they are the spend-safety firewall. **These are strong existing tests — protect them.**
- **P1** — Provider contract conformance: a shared test battery run against every `SandboxProvider` (worktree in-proc; e2b/docker/macos-vz mocked) asserting provision→writeFile→exec→copyOut→destroy invariants and that `destroy` is idempotent/bounded. Partially present across `providers-pluggable.test.ts` (403 LOC) + `providers.test.ts`.
- **P1** — Mock-linear `/control` oracle: seed → set-state → get-requests round trip; JAZ-10 blocked-by-JAZ-7 not dispatched while blocked; assert the fixture enforces the `notDispatchedWhileBlocked` acceptance. Protects R-I3.
- **P2** — Codex/ZeroClaw cost-source: assert token-only harnesses never emit `harness-reported` cost through their drivers.

## P — Platform (what it DEPENDS ON)

**Elements (STATIC).** Bun runtime (`bunfig.toml`, `bun:test`, `Bun.serve`, `Bun.spawn`). Node 22 + Bun + pinned Claude Code in `infra/trial-image/Dockerfile` (shared image). Five sandbox backends with tier limits: Daytona (free tier 10GiB → cloud concurrency 1; quota-lag retries), E2B (`e2b.ts`: Hobby 1h / Pro 24h lifetime caps enforced in `preflight`), Docker + macOS Virtualization (`cli-container.ts`, Apple `container` CLI quirks: no `cp`, `system status` health, base64 copy), worktree (host, weakest isolation). External SaaS: Daytona/E2B/Anthropic/z.ai + Kimi/MiniMax/Qwen/OpenAI endpoints. OS quirks documented in CLAUDE.md (uid-1000 users, `bash -lc` env export, subscription-token auth precedence).

**Risks.**
- R-P1 (`STATIC`): E2B lifetime cap is enforced in `preflight` (`this.lifetimeMs > cap` throws) — good, tested (`e2b-provider.test.ts`). But the cap depends on `tier` defaulting to `hobby`; a Pro account mis-declared as hobby needlessly blocks, and a hobby mis-declared as pro would exceed and get killed mid-trial (right-censored, wasted spend).
- R-P2 (`STATIC`): Worktree provider runs on the host (`zsh -c`, host `HOME`/`CLAUDE_CONFIG_DIR` overridden per trial). Isolation is weaker (shared OS/network) and *recorded as such* — but a test that a worktree trial cannot see another trial's config/plugins is the contamination guard.
- R-P3 (`STATIC`): Image identity drift: `factory.ts` pins `harness-eval-base:v4` and template names; the trial image bundles a *pinned Claude Code version*. Upstream Claude Code moving under a rebuilt image is the R-I1 platform vector.
- R-P4 (`STATIC`): Provider preflights (image present, tier caps, daemon health, `requiredProbe` for zerocode) are the fail-before-spend gate. `provider-availability.test.ts` (44 LOC) covers availability but the full preflight ladder per provider is thin.
- R-P5 (`INFERRED`): The evaluator/judge run `bash -c` with `execFileAsync` on the *host* (evaluator.ts/judge.ts), not in a sandbox, against the *built artifact* (which may contain agent-authored code). Grading executes untrusted build output on the host. The evaluator blanks `ANTHROPIC_API_KEY` for the artifact — but arbitrary code still runs on the grader host.

**Test ideas.**
- **P0** — E2B tier preflight: hobby tier + trial budget forcing `lifetimeMs > 1h` → assert `PreflightError` before any sandbox is created (covered by `e2b-provider.test.ts`); add the boundary case (exactly at cap) and the Pro path.
- **P0** — Grader host-safety (R-P5): document + test that evaluator/judge `bash` execution is intended to run in a disposable/isolated grading environment; assert the evaluator's env blanks `ANTHROPIC_API_KEY` (present in code) and add a test that the judge does likewise. Flag as a **security-review item**: grading executes artifact code on the grader host.
- **P1** — Worktree contamination: run two worktree trials, install a plugin/write a file in trial A's HOME, assert trial B's isolated `CLAUDE_CONFIG_DIR`/HOME cannot see it.
- **P1** — Preflight ladder per provider: mock a missing image / dead daemon / failing zerocode `requiredProbe` → assert each fails at preflight with an actionable message, before spend.
- **P2** — Apple `container` CLI quirks: assert `parseContainerListNames` handles the non-docker list format (`cli.ts cleanup` depends on it; `container-teardown.test.ts` 159 LOC covers teardown).

## O — Operations (how it's USED)

**Elements (STATIC).** Eval flow: `validate` → smoke n=1 (`--trials 1 --provider worktree`) → matrix → `--grade` → `report`. Real-spend safety: per-trial wall-clock + cost caps, per-run `RunLedger` ceiling (`runCostUsd` default 400), `capped` status (not silent truncation), `skipped:budget`. Resumable/checkpointed grading: evaluator `onRecord`/`preRecorded`, judge `onCriterion`/`preScored`, `grades.json` append-on-grade. Preflight before spend. Archiving + redaction before teardown. Concurrency per tier (Daytona 1, others 2 default). Failure classification + infra retry with backoff. Studio detached run-worker (`run-worker.ts`, own process group, SIGTERM→graceful cancel) + durable `run-state.json` + `reconcileRunStates` (dead-owner → `interrupted`, relabel-only never re-execute) + `runNeedsGrading` (resume affordance). `cli.ts cleanup` reaps orphaned `he-*` containers.

**Risks.**
- R-O1 (`STATIC`, **operational money risk**): `RunLedger` ceiling is checked *before dispatching* a trial (`ledger.exceeded()` in the worker loop), and `ledger.add(telemetry.totalCostUsd)` happens *after* a trial completes. A single trial can therefore overshoot the run ceiling by up to one full `trialCostUsd` (default $50) — the ceiling is a soft gate, not a hard cap. In-flight concurrent trials compound this (concurrency × trialCost overshoot).
- R-O2 (`STATIC`): Checkpoint/resume correctness: grading resumes from `preRecorded`/`preScored`. A partially-written `grades.json` or a checkpoint that double-counts a step on resume would corrupt the score. `run-state.test.ts` (68 LOC) + `live-run-durability.test.ts` (118 LOC) cover reconciliation/visibility.
- R-O3 (`STATIC`): `reconcileRunStates` relabels dead-owner `running` → `interrupted` via `isPidAlive` (pid reuse risk on long-lived boxes: a recycled pid reads as alive, leaving a dead run stuck `running`). Low-probability, documented as best-effort.
- R-O4 (`STATIC`): `cleanup` reaps only `he-*`-prefixed containers via each CLI's own list verb. A leaked VM with a different name (or a provider whose list changes format) is not reaped → cloud cost leak. Teardown is time-boxed (`TEARDOWN_CAP_MS` 90s) and logs a leak warning rather than hanging — correct, but leaks are only *logged*.
- R-O5 (`STATIC`): `--grade` runs evaluator+judge as **API spend** (Anthropic SDK), separate from the subscription-billed build. An operator running `--grade` with a large matrix incurs uncapped judge/evaluator API cost (no per-run *grading* budget ceiling analogous to `RunLedger`).

**Test ideas.**
- **P0** — Run-ledger overshoot: matrix of trials each costing near `trialCostUsd`, concurrency 2, run ceiling set so the 2nd trial crosses it → assert the *next* trial is `skipped:budget` and quantify max overshoot = concurrency × trialCost. Make the soft-gate behavior explicit and asserted (guards R-O1). (`RunLedger` is unit-testable in isolation.)
- **P0** — Grade-resume idempotence: pre-record 2 of 4 evaluator steps + 2 of 5 judge criteria, resume → assert only the missing steps/criteria are executed, no step double-counted, final score identical to a fresh full run given the same verdicts. Guards R-O2. (Extend `cc-grading-capture.test.ts`.)
- **P0** — Budget-skip semantics: `runMatrix` with an already-exceeded ledger → assert every remaining plan yields `skipped:budget` provenance with a reason and *no sandbox provisioned* (mirror the studio "provisions nothing" pattern). Partially in `unit.test.ts` scheduler tests.
- **P1** — Reconciliation: `running` state with a dead `ownerPid` → `interrupted` and stays visible in `getQueue`; a `running` state with a live pid → untouched. (Covered by `live-run-durability.test.ts` "interrupted run … reconciled and surfaced" — **this is one of the 4 failing tests via the sibling dry-run case, see Part B**.)
- **P1** — Cancel path: abort mid-trial → in-flight sandbox torn down, trial `infra-failed`/cancelled note, no leaked sandbox, remaining plans `skipped`. (Covered by scheduler `abortSignal` logic + `studio-live-runs.test.ts` "cancel before completion".)
- **P2** — `cleanup`: orphaned `he-*` containers across docker + Apple `container` list formats reaped; a non-`he-` container untouched.
- **P2** — Add a *grading* cost ceiling (R-O5) and test it once introduced.

## T — Time (WHEN things happen)

**Elements (STATIC).** Freeze-then-run ordering (hashes computed at run start, bound into provenance; plan frozen for the run). Timeouts/wall-clock caps (`trialWallClockMs` default 2h; `--trial-minutes`; per-exec `timeoutMs`; teardown `TEARDOWN_CAP_MS`; evaluator per-bash `timeout_seconds` max 300; judge 120s). Sandbox lifetime caps (E2B 1h hobby, heartbeat `setTimeout` extension on each exec). Concurrency scheduling (`runMatrix` worker pool, interleaved matrix `buildMatrix _order`). Live streaming (`studio/live-stream.ts`, `live/tap.ts`). Append-on-grade ordering (`grades.json` written per checkpoint; `report` reattaches grades persisted after results.json). Quota-accounting lag (Daytona; backoff `60_000 * (attempt+1)`). Upstream plugin HEAD drift (git-source plugins install HEAD; pins are assert-only and *fail by design* on drift — `superpowers`, `ruflo`, `gstack` post-install asserts).

**Risks.**
- R-T1 (`STATIC`): Heartbeat vs step duration on E2B: `exec` calls `setTimeout(lifetimeMs)` before each command, but a *single* session step longer than the remaining lifetime (a multi-minute agent build with no intermediate exec) can outlive the sandbox → mid-trial death, right-censored/wasted spend. The heartbeat only extends *at exec boundaries*.
- R-T2 (`STATIC`): Concurrency + shared `RunLedger`: the ledger is not synchronized across the async workers (JS single-threaded, so no data race, but the *check-then-act* window across `await` points allows the R-O1 overshoot). Interleave ordering (`buildMatrix`) is deterministic and tested.
- R-T3 (`STATIC`): Append-on-grade + `report` reattachment: `cli.ts report` reads `results.json.trials`, then reattaches `grades.json` for trials where `t.grades === null`. If a trial was graded *and* included in results, the reattach is skipped — but a re-grade that updated `grades.json` after results.json would be ignored by report unless grades were null. Ordering-sensitive; the CLAUDE.md "append-on-grade" invariant depends on never mutating in place.
- R-T4 (`STATIC`, **fairness-relevant**): Plugin HEAD drift is *intended* to fail the version assert (post-install `grep -q 'Version: X'` / `rev-parse … | grep`). So a run is only fair/reproducible at the moment the pins match upstream HEAD; between re-pins, a candidate silently gets a different framework version → the assert is the guard, and it must actually fire.
- R-T5 (`STATIC`): Live-stream races (`live-stream.ts`, `live/tap.ts`): concurrent readers tailing an in-progress transcript; a partially-written JSONL line could mis-parse. Best-effort rendering mitigates in archive, but live view is a separate path (`live-stream.test.ts` 132 LOC).

**Test ideas.**
- **P0** — Plugin-pin assert fires (R-T4): simulate a post-install version check where installed HEAD ≠ pinned version → assert the install step's non-zero exit is classified as a candidate/install failure and the trial is not silently graded as if pinned. This protects the core fairness claim.
- **P1** — E2B heartbeat boundary (R-T1): a step whose duration approaches `lifetimeMs` → assert the heartbeat extension logic and that the preflight-sized lifetime exceeds `trialWallClockMs` + setup margin (present: `setupMarginMs` 15m). Boundary test at the margin.
- **P1** — `report` grade-reattachment ordering (R-T3): a run where `grades.json` is written after `results.json` with `t.grades===null` → assert `report` picks up the later grades; a run where grades were already embedded → assert stable re-report (idempotent, preserves worker/judge metadata — code preserves `prior.workerModel` etc.).
- **P1** — Live-stream partial-line: feed a truncated JSONL line to the tap → assert no crash and eventual consistency once the line completes. (`live-stream.test.ts`.)
- **P2** — Freeze ordering: assert `prdSha256`/`testPlanSha256` are captured into provenance at run start and identical across all trials of a run (no mid-run re-hash).

---

# PART B — Test Strategy & Test Plan (context-driven)

## B.1 Quality Risk Analysis (ranked)

| # | Risk | SFDIPOT | Impact | Likelihood | Priority |
|---|------|---------|--------|-----------|----------|
| QR-1 | **Invalid-but-authoritative scores** — LLM evaluator repairs artifact / verdicts from source / non-determinism; judge sampling anomaly | F, I | Corrupts the product's only output | Med | **P0** |
| QR-2 | **Secret leakage into archived/published artifacts** — redaction misses a key shape, short secret, or binary file | D | Credential exposure on a public dashboard | Med | **P0** |
| QR-3 | **Real-spend overrun** — run-ledger soft gate overshoot; uncapped grading API cost; mid-trial sandbox death | O, T | Direct money loss | Med | **P0** |
| QR-4 | **Failure misclassification** — `isInfraFailure` regex misfires → wrong retry/billing or grading an infra-failed shell as a candidate artifact | F | Distorted results + spend | Med | **P0** |
| QR-5 | **Schema/telemetry drift** — `types.ts` change or upstream Claude Code stream-format change silently zeros/mis-parses telemetry | S, I | Silent wrong numbers | Low-Med | **P1** |
| QR-6 | **Fairness erosion** — non-identical prompts, unscrubbed markers, judge==worker, plugin HEAD drift past the assert | F, T | Undermines the core claim | Low | **P1** |
| QR-7 | **Freeze-integrity bypass** — hand-edited PRD+testplan hashes drift together | D | Non-reproducible grade | Low | **P1** |
| QR-8 | **Operational data loss / stuck runs** — bad reconciliation, pid reuse, leaked VMs | O | Wasted work / cloud cost | Low | **P2** |

## B.2 Objectives, Scope, Levels

**Primary objective:** protect *measurement validity* and *spend safety*. A test suite for this product succeeds when a wrong ranking or an unsafe spend cannot ship undetected. Feature breadth is secondary.

**In scope:** scoring/aggregation math; evaluator/judge agent contracts (via mock transport); redaction; failure classification; budget/ledger gates; provider `SandboxProvider` contract conformance; freeze/hash invariants; fairness enforcement (prompt rendering, scrub, judge≠worker); driver stream parsing; studio authorization + live-run durability; config validation.

**Out of scope (by design, and correctly so):** real end-to-end paid runs against live Claude Code/Anthropic/Daytona/E2B in CI (cost + non-determinism); the *quality* of any specific candidate framework's output; upstream provider correctness. These are covered by **dry-run modes, fixtures, and stub protocols**, which is the right context-driven choice for a real-spend LLM harness.

**Test levels & approach:**
- **Unit** (`bun:test`): pure functions — scoring, normalization, median, `isInfraFailure`, `redactSecrets`, `scoreAdherence`, hash binding. Fast, deterministic, the backbone. Heavily present in `unit.test.ts` (641 LOC).
- **Contract** (mock transport): evaluator/judge with an injected `Anthropic` client (`opts.client`) and drivers with mock sandboxes — the key technique that lets an LLM harness be tested *without spend*. Present: `driver-contract.test.ts`, `cc-grading-capture.test.ts`, `zerocode.test.ts`.
- **Integration** (in-proc): scheduler + worktree/memory provider + mock exec; studio run lifecycle with fake providers; provider-pluggable battery. Present: `unit.test.ts` scheduler integration, `providers-pluggable.test.ts`, `studio.test.ts`, `studio-live-runs.test.ts`.
- **E2E-dry** (real orchestrator, no spend): `e2e-dry.test.ts`, `e2e-dry-target.test.ts`, `design-adherence-e2e.test.ts`, `studio-e2e.test.ts` drive the actual orchestrator through worktree with a dry/stub driver — the closest safe approximation of a real run. **This is where 3 of the 4 failures live** (see B.5).
- **Manual/exploratory** (real spend, operator-gated): actual paid smoke runs (`--trials 1 --provider worktree`), model probes (`model probe`), provider preflights against live SaaS. Not automatable in CI; belongs to a documented pre-release checklist.

**Oracles:** frozen test plans + content hashes (adherence); the mock Linear + stub app-server (functional evaluator oracle); Zod schemas (structural oracle for every artifact); min-max/median math (computational oracle); prompt-embedded "hard rules" (heuristic oracle for the LLM instruments — *not* mechanically checkable, the residual risk).

**Entry criteria:** `npm run check` (tsc + biome) green; `validate` passes; fixtures/manifest hashes current.
**Exit criteria (proposed):** unit+contract+integration+e2e-dry all green (**today: 4 failing — not met**); redaction table covers every configured provider key shape; a paid n=1 smoke on worktree produces a well-formed `results.json` + non-empty evidence per step; no P0 risk without a guarding test.

## B.3 Environments & the "test a real-spend harness without spend" challenge

The repo already embodies the correct answer, and it is the strategic headline: **substitute every paid/nondeterministic boundary with an injectable seam.**
- LLM calls → `opts.client` injectable `Anthropic` transport in evaluator/judge; mock stream lines in driver tests.
- Sandboxes → `worktree` (host, free) for e2e-dry; `MemorySandbox`/`MemoryProvider` for scheduler unit tests.
- External SaaS (Linear/Codex) → in-repo `mock-linear.ts` + `stub-app-server.ts` with `STUB_MODE` fault injection.
- Real spend → dry-run modes (`e2e-dry`, studio `dryRun`), plus a hard authorization+confirmation firewall (`studio/policy.ts`) that provisions *nothing* until four gates pass.

The residual, un-substitutable risks are exactly the ones that need **manual/operator** coverage: real provider preflight behavior, real Claude Code stream-format stability (R-I1), and true end-to-end score calibration. These should be a documented pre-release smoke checklist, not CI.

## B.4 Test Plan — prioritized scenarios mapped to SFDIPOT & existing tests

| ID | Scenario | SFDIPOT / Risk | Priority | Existing test (coverage) | Automate / Explore |
|----|----------|----------------|----------|--------------------------|--------------------|
| TP-01 | Evaluator fills unrecorded steps as fail; fatal fail halts + zeros remainder; empty evidence rejected | F/QR-1 | P0 | *gap* (scoreAdherence math only in `unit.test.ts`) | Automate (mock client) |
| TP-02 | Judge median selection + tie/even cases; per-criterion checkpoint | F/QR-1 | P0 | partial (`unit.test.ts` median) | Automate (mock client) |
| TP-03 | Fatal step verdicted `partial` — define & pin semantics | F/QR-1 R-F2 | P0 | *gap* | Automate |
| TP-04 | `isInfraFailure` does NOT misclassify candidate logs containing "network"/"rate limit"/"timeout" | F/QR-4 | P0 | partial (`unit.test.ts` classification — positive cases only) | Automate |
| TP-05 | Redaction covers every provider key shape in `models.yaml` incl. DASHSCOPE/KIMI/MINIMAX/ZAI/OAuth token | D/QR-2 | P0 | partial (`unit.test.ts` redaction — 3 shapes) | Automate |
| TP-06 | Redaction file-type behavior (binary/pem/extensionless) documented + asserted | D/QR-2 | P0 | *gap* | Automate + Explore |
| TP-07 | Run-ledger soft-gate overshoot bounded to concurrency×trialCost; next trial `skipped:budget`, no provision | O/QR-3 R-O1 | P0 | partial (scheduler tests) | Automate |
| TP-08 | Grade-resume idempotence (preRecorded/preScored) — no double count, identical score | O/QR-3 R-O2 | P0 | partial (`cc-grading-capture.test.ts`) | Automate |
| TP-09 | Studio launch: no real provider/session unless 4 gates pass; denied → provisions nothing | I,O/QR-3 | P0 | **covered** (`studio-live-runs.test.ts`) | Automate — protect |
| TP-10 | E2B tier lifetime preflight throws before provisioning; boundary at cap; Pro path | P/QR-3 R-P1 | P0 | **covered** (`e2b-provider.test.ts`) | Automate |
| TP-11 | Grader executes artifact `bash` on host — assert key-blanking; flag security-review | P/QR-1 R-P5 | P0 | partial (env-blank in code, untested for judge) | Automate + security review |
| TP-12 | `parseStreamJson` malformation corpus + captured real-stream canary | I,S/QR-5 R-I1 | P1 | partial (`unit.test.ts` 2 cases) | Automate |
| TP-13 | Fairness: identical rendered base prompt per candidate; allowlist-only continuations | F/QR-6 | P1 | partial (render tests) | Automate |
| TP-14 | `scrubWorkspace` removes ALL candidates' markers + harness traces; original untouched | F/QR-6 | P1 | *gap* (scrub.ts has no dedicated test) | Automate |
| TP-15 | Judge≠worker model enforced/flagged when configured equal | F/QR-6 R-F4 | P1 | partial (`models.test.ts` cross-vendor) | Automate |
| TP-16 | Hash-freeze drift message on testplan/PRD sha mismatch | D/QR-7 | P1 | partial (`unit.test.ts` PRD binding) | Automate |
| TP-17 | Plugin-pin post-install assert fires on HEAD drift → install failure, not silent grade | T/QR-6 R-T4 | P1 | *gap* (assert only in registry YAML, no test) | Automate |
| TP-18 | Reconcile dead-owner run → `interrupted`, stays visible; live pid untouched | O/QR-8 | P1 | **covered** (`live-run-durability.test.ts`, `run-state.test.ts`) | Automate |
| TP-19 | Provider contract conformance battery across all 5 providers | I,P | P1 | partial (`providers-pluggable.test.ts`) | Automate |
| TP-20 | Mock-linear `/control` oracle + JAZ-10 blocked-by dispatch guard | I/QR-1 R-I3 | P1 | partial (`stub-protocol.test.ts` = stub only) | Automate |
| TP-21 | `report` grade-reattachment ordering + idempotent re-report preserving model metadata | T/QR-5 R-T3 | P1 | partial (`report-models.test.ts`) | Automate |
| TP-22 | Worktree cross-trial contamination guard | P/QR-6 R-P2 | P1 | partial (`providers.test.ts`) | Automate |
| TP-23 | `results.json` schema round-trip + unknown-schema-version dashboard path | S,D/QR-5 | P2 | partial (`dashboard.test.ts`, `report-models.test.ts`) | Automate |
| TP-24 | `cleanup` reaps `he-*` across docker + Apple `container` list formats; leaves others | O/QR-8 R-O4 | P2 | **covered** (`container-teardown.test.ts`) | Automate |
| TP-25 | Live-stream partial-JSONL-line resilience | T/QR-1 R-T5 | P2 | partial (`live-stream.test.ts`) | Automate |
| TP-26 | Add + test a grading (evaluator+judge) API cost ceiling | O/QR-3 R-O5 | P2 | *gap* (feature absent) | Automate after build |

## B.5 Coverage vs Gaps — grounded in the 4 failing tests & missing CI

**Test suite reality (EXECUTED, lead-captured):** 212 tests / 31 files, **197 pass / 11 skip / 4 fail**. The 4 failures:

1. **`unit.test.ts` — "shipped registry loads; unknown harness fails at load time"** — a **real logic-level failure**, and the most important signal in the suite. It asserts `expect(registry.candidates).toHaveLength(6)` (line 116), but the shipped `config/registry.yaml` now declares **8 candidates** (`superpowers, compound-engineering, agent-skills, gsd, codex-baseline, gstack, ruflo, bare` — confirmed by count). `gstack` and `ruflo` were added without updating the assertion. This is **test-data drift**, not a product bug — but it is exactly the class of stale-oracle failure this product exists to prevent, and it means the registry-integrity test is currently red and unmaintained. **Fix: assert against `registry.candidates.length` dynamically or bump to 8; better, assert the set of expected ids.**
2. **`studio-e2e.test.ts` — "a worktree dry run completes through the orchestrator and writes results"**
3. **`studio-live-runs.test.ts` — live job lifecycle** (dry run through the orchestrator)
4. **`live-run-durability.test.ts` — detached-worker dry run**

Failures 2–4 are **environment-dependent, not necessarily product bugs**: each drives a *real* worktree run through the orchestrator, which ultimately needs an authenticated Claude Code binary present on the box. In this container/CI sandbox that binary is absent, so the run **stalls at status `running`** and the test times out waiting for a terminal state. This is the classic "the harness's own e2e-dry path still needs the real agent CLI" seam. **These are correctly authored tests exposing an environment assumption**; they should either (a) inject a fully synthetic driver for the dry path so no `claude` binary is required, or (b) be tagged as requiring an authed environment and excluded from the default CI lane.

**The structural gap — no test CI workflow.** `.github/workflows/` contains **only `pages.yml`** (dashboard deploy). There is **no workflow that runs `bun test ./tests` or `npm run check`** on push/PR. Consequently: the registry-length drift (failure 1) could sit red indefinitely; nothing enforces the redaction-breadth or scoring invariants on change; the exit criteria in B.2 are unenforceable. **This is the single highest-leverage remediation: add a CI workflow running `npm run check` + `bun test ./tests` (with the environment-dependent e2e-dry tests gated behind a labeled lane or a synthetic driver), so the 197 green tests actually gate merges.**

**Under-tested product factors (tie to risks):**
- **Redaction breadth (D/QR-2)** — only 3 key shapes tested; 5 configured providers + the OAuth token rely on env-value collection alone. **Highest-severity coverage gap.**
- **`scrub.ts` (F/QR-6)** — no dedicated test for the blind-judge marker/trace removal, despite being the mechanism the entire "blind judging" fairness claim rests on.
- **Evaluator fatal/partial semantics & unrecorded-step fill (F/QR-1)** — the scoring math is tested but the *agent-contract* behavior (via mock client) around fatal-halt and empty evidence is not.
- **Plugin-pin drift assert (T/QR-6)** — the fairness guard exists only as shell greps in YAML with no test that they actually fail a drifted run.
- **Run-ledger overshoot bound (O/QR-3)** — the soft-gate nature (up to concurrency×$50 overshoot) is neither documented nor asserted.

## B.6 Quality Gates (proposed)

| Gate | Threshold | Enforcement |
|------|-----------|-------------|
| Static | `tsc --noEmit` + `biome check src tests` clean | CI (`npm run check`) — **workflow missing today** |
| Unit/contract/integration | 100% pass on the deterministic lane | CI `bun test ./tests` excluding env-dependent e2e-dry — **workflow missing today** |
| e2e-dry (authed lane) | pass when a Claude Code binary is available | separate labeled CI lane or nightly on an authed runner |
| Redaction breadth | every provider key shape in `models.yaml` has a redaction test | new test (TP-05) + review checklist when adding a provider |
| Freeze integrity | `validate` green; PRD/testplan hashes bound; catalog not stale | CI `bun run src/cli.ts validate` |
| Fairness | judge≠worker asserted; scrub-all-markers test green; identical-prompt test green | TP-13/14/15 |
| Spend safety (pre-release, manual) | n=1 paid worktree smoke → well-formed `results.json`, non-empty per-step evidence, cost within `trialCostUsd` | operator checklist (not CI) |
| Schema stability | `RunResults` round-trip test green; `schemaVersion` bump requires a migration note | TP-23 |

---

## Headlines

**Biggest product risks (in order):**
1. **Invalid-but-authoritative scores (QR-1).** The evaluator and judge are LLM agents guarded only by prompt "hard rules" (no repairing, evidence-only verdicts, judge≠worker). These can't be mechanically proven; the structural guards (schema-required evidence, fatal-halt fill, scrub) that *can* be tested are partly untested (`scrub.ts`, evaluator fatal/partial contract).
2. **Secret leakage via incomplete redaction (QR-2).** `driver/archive.ts` redacts a fixed regex set + env-value list; 5 of the configured providers' key shapes (DASHSCOPE/KIMI/MINIMAX/ZAI) and the Claude OAuth token have no dedicated pattern, and binary files are skipped — a real exposure path into a publicly-deployable dashboard.
3. **Real-spend overrun (QR-3).** `RunLedger` is a soft pre-dispatch gate (overshoot up to concurrency×`trialCostUsd`), grading (`--grade`) API cost is uncapped, and an over-budget E2B lifetime kills trials mid-flight.
4. **Failure misclassification (QR-4).** `isInfraFailure`'s message regex can retry-and-rebill a candidate failure or grade an infra-failed shell as a real artifact.

**Test-strategy headline:** The product is a *measurement instrument for money*, so the strategy is validity-and-spend-first: exhaustively unit-test the scoring/normalization/redaction/classification math, contract-test the LLM instruments through their injectable `Anthropic` transport and the mock-Linear/stub-app-server oracles (never real spend in CI), reserve true paid runs for a documented operator smoke checklist, and — the one missing keystone — **stand up a test CI workflow** so the already-substantial 197-test green suite actually gates merges. The repo has excellent seams for spend-free testing (`opts.client`, `MemoryProvider`, worktree, `dryRun`, `STUB_MODE`, the four-gate launch firewall); the strategy is to exploit them harder where risk is highest.

**Top coverage gaps:**
- **No test CI workflow** — only `pages.yml` exists; `bun test`/`npm run check` never run on push/PR, so the red registry-length test and any future regression sit unguarded. *Highest-leverage fix.*
- **Redaction breadth** — 5 configured provider key shapes + OAuth token untested; binary-file leak path undocumented.
- **`scrub.ts` blind-judge marker removal** — zero dedicated tests under the mechanism the whole fairness claim rests on.
- **Evaluator agent-contract semantics** (fatal/partial halt, unrecorded-step fill, empty-evidence rejection) and **plugin-pin drift assert** — both untested despite being core to score validity and fairness.
- **The 4 failing tests:** 1 is a genuine stale assertion (registry now has 8 candidates, test asserts 6 — fix the oracle); 3 are environment-dependent worktree dry runs that stall without an authed Claude Code binary — inject a synthetic driver or gate them to an authed lane.
