# Round-2 MetaHarness Re-Evaluation — Shared Agent Brief

**You are part of the AQE fleet re-running our MetaHarness evaluation.** Read this fully before starting.

## Target (ALWAYS use absolute paths)
- **Subject repo:** `/workspaces/agent-harness-generator` (MetaHarness / `ruvnet/agent-harness-generator`)
- **Snapshot:** HEAD `5f63ac6`, `v0.1.15-467-g5f63ac6`, branch `claude/darwin-mode-evolve-polyglot`, date **2026-06-27**.
- **AQE repo (where reports are written):** `/workspaces/agentic-qe`

## CRITICAL — cross-repo hazard (learned the hard way last round)
- Our QCSD tooling has a relative-path bug: finders silently analyze the CWD repo (AQE itself) instead of the target. **Every file you read/analyze/score MUST be an absolute path under `/workspaces/agent-harness-generator`.** Never analyze AQE's own source by accident.
- Finders previously **missed co-located `__tests__/` directories**. Tests for `packages/X/src/foo.ts` live in `packages/X/__tests__/` AND sometimes alongside. Always `find` for tests before claiming code is untested.

## Evidence standard (non-negotiable)
- **Reproduction-first.** Run real commands (`npm run build`, `npm test`, coverage, etc.) — do not estimate metrics you can execute. Quote command + actual output.
- **Never claim "fixed" or a metric without showing the evidence.** Cite `file:line`.
- If a command OOMs or is infeasible, say so explicitly and mark the metric as "not executed" rather than guessing.

## What the prior round (working-may, 2026-06-15) concluded — diff against this
Read your assigned prior report under `/workspaces/agentic-qe/docs/metaharness/`. Top-line prior findings (verify current status of each you touch):
- **P0 #1 — DRACO claim falsified by own benchmark.** README sold "tuned harness beats vanilla — measured"; ADR-038 measured the opposite at frontier. **Now reworded** (README ~L84: "pick the right model and get out of the way; a small cheap model delivers frontier-quality"). Verify the new wording is substantiated by current evidence (ADR-037/038 + the new bench arc).
- **P0 #2 — fresh-clone `npm test` failed (no pretest build).** Now `package.json` has `"pretest": "npm run build"`. Verify it actually works fresh.
- **P0 #3 — status story self-contradicts** (OVERVIEW "doesn't exist yet" vs README "production-ready"; counts disagree: hosts/verticals/commands/packages/tests). Re-check. Tests badge still says **568** — verify real count.
- **P0 #4 — ADR-027 names `apps/web-ui/__tests__/parity.test.ts` as the SOLE CLI↔Studio parity guard; file did not exist.** Still absent at last check. Verify.
- **HIGH-1 — witness verification is a guaranteed no-op.** `packages/create-agent-harness/src/witness-client.ts:86` returns `{valid:true,...degraded}`; no kernel backend exposes `witnessVerify`; `crates/kernel-wasm/src/lib.rs` still exports only `kernel_info`/`mcp_validate`/`version`. Appears STILL OPEN — verify the full publish path fails open.
- **HIGH-2 — `secrets fetch` leaks raw secrets; bundle redaction keys on object-key names not values** (`secrets.ts`, `diag.ts`, `export-config.ts`, `threat-model.ts` SECRET_RE). Verify current state.
- Prior QCSD gate = **HOLD** (the two HIGH security findings). Prior metrics: TDD 68%, avg cyclomatic 7.18, coverage 82.32% lines/73.33% branch, mutation 53.6% on critical code, top defect risk `upgrade.ts` 0.86.

## New surface since working-may (467 commits)
- `packages/darwin-mode` (19k LOC, 62 test files) — self-evolving harness config (genome, mutator, scorer, sandbox, pareto, safety, curriculum, clade, epistasis).
- New: `packages/router`, `packages/sdk`, `packages/vertical-base`, `packages/vertical-trading`, `packages/bench`, 9 `host-*` adapters, `crates/{kernel,kernel-napi,kernel-wasm,poker-darwin}`.
- ADR-180→196: a large Darwin/benchmark research arc (GCP distributed runs, cost-Pareto fleet, cost-cascade Best-of-N ADR-182, judge-validated repro gate ADR-183, sovereign genome engine ADR-184, AST-mincut + execution-trace localization ADR-190/196).

## Output rules
- Write ONLY your assigned report file (absolute path given in your task). Markdown. Match the rigor/structure of the corresponding prior report.
- Be balanced: call out what's genuinely strong AND what's weak. Quote evidence.
- End with a short "Status vs prior round" table for any prior findings in your scope: Fixed / Still-open / Regressed / New, each with file:line evidence.
