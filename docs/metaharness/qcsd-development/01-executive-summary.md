# QCSD Development Swarm — Executive Summary: MetaHarness generator

**Subject:** `ruvnet/agent-harness-generator` → `packages/create-agent-harness/src` (the TypeScript generator — the real product surface)
**Swarm:** qcsd-development-swarm v1.0 (ADR-102). 6 agents: 3 core + 2 conditional (security, mutation) + defect-predictor.
**Evaluator:** AQE fleet. **Date:** 2026-06-15. **Verification:** all metrics EXECUTED (build, test, coverage, mutation campaign, git archaeology) — not estimated.

---

## FINAL GATE: **HOLD**

**Decision rule (Step 5):** *any* HIGH/CRITICAL security finding in security code forces HOLD. The generator's **code quality is genuinely strong** (SHIP on complexity and line coverage), but two **HIGH** findings in the provenance/secret-handling code — the product's entire value proposition — block the gate. This **supersedes** the earlier 3-dimension workflow pass that rated the generator "SHIP-grade": that pass never ran security, mutation, or defect analysis.

| Dimension | Metric (measured) | Gate |
|---|---|---|
| TDD adherence | **68%** — 530 tests pass; test:code 1.11:1; but 0 red-green-refactor evidence (16/16 modules add src+test in one commit) | CONDITIONAL |
| Code complexity | **avg cyc 7.18** (median 4, max 52); real debt in ~5 functions | SHIP |
| Test coverage | **82.32% lines / 73.33% branch / 94.59% func** (v8) | SHIP |
| Mutation (critical code) | **53.6% measured** (15/28 killed) | CONDITIONAL |
| Security | **2 HIGH · 5 MED · 4 LOW**; `npm audit` clean | **HOLD** |
| Defect risk | top module `upgrade.ts` 0.86; untested destructive write path | (informs above) |

---

## The two HIGH findings (gate-blockers)

### HIGH-1 — Witness verification is a guaranteed no-op (security theater)
`witness-client.ts:86` always returns `{valid:true, reason:'…degraded'}`. The guard at `:74` checks `typeof kernel.witnessVerify === 'function'`, but **no kernel backend exposes `witnessVerify`** — the `KernelBackend` interface (`kernel-js/src/index.ts:22-27`) and all three backends (native/wasm/js) omit it, and `crates/kernel-wasm/src/lib.rs` exports only `kernelInfo/mcpValidate/version`. So the degrade branch is the **only** path on every platform. The real Rust verifier (`crates/kernel/src/witness.rs:110`) is never wired out; the Rust tamper tests exercise it directly and never touch the shipping JS path.
**Exploit:** a shape-valid `witness.json` (64-hex key, 128-hex sig, schema 1) with a garbage signature passes the shape gates, finds no verifier, returns `valid:true`, and `publish.ts:125-131` publishes a "signed" harness whose signature was never checked.
**This is not graceful degradation — it is a non-functional control presented as functional.** Any "signed/witness-verified harness" claim from v0.1.x is unsubstantiated.
**Fix:** export `witnessVerify` through NAPI+WASM, add to all JS backends, **fail closed** for publish when no verifier is present, resolve the `publish.ts:106` TODO, and add an integration test that publishes a tampered witness and asserts it throws.

### HIGH-2 — `secrets fetch` leaks raw secrets into "sanitised" bundles
`secrets.ts:156` prints the raw secret to stdout (and leaks its length at `:182`). The bundle redaction in `diag.ts:303` and `export-config.ts:29` keys on **object-key names, not values**, so a token captured into a log or a `harness diag` support bundle is **never redacted** — directly contradicting the "bundle is sanitised" promise (`validate.ts:255`). **Mutation testing independently confirms this:** `threat-model.ts:178` `SECRET_RE` can be reduced to drop `token`/`key` redaction and the `--bundle` output still passes every test.
**Fix:** don't echo raw secrets by default (require `--out-file`/`--unsafe-print`), hide length, make the sanitiser value-aware (token-shape/entropy), and assert `[REDACTED]` on real key names in tests.

---

## What the green test suite hides (mutation + TDD evidence)

The suite is 530 passing tests, but **mutation score on safety-critical code is 53.6%** — surviving mutants prove the assertions don't protect the security logic:
- `mcp-scan.ts:77` — `allow-shell` **HIGH→MEDIUM** severity flip survives, and downgrading it flips `mcpScanCmd` exit **1→0**, so the CI security gate silently stops blocking. Tests assert `worst`/`id`, never per-finding `severity`.
- `witness-client.ts:51/54/57` — `!==`→`<`/`>` boundary mutants accept over-length keys/sigs and schema 0/negative (only too-short/`999` are tested).
- `renderer.ts:34/52` — the injection-safety `{{var}}` regex can be loosened to admit `.`/`-`/leading-digit and all 17 tests still pass.
- `secrets.ts:86/90` — guards are invertible because `check()` early-returns when gcloud isn't on PATH, so the mocked-runner coverage is **illusory** (the test body never runs). TDD agent found the same: `secrets.test.ts:26-32,40-44,60` escape-hatch `return`s that silently no-op in CI.
- **Well-defended (no survivors):** `writer.ts` atomic-rename/`--force` guard (3/3 killed), `validate.ts` aggregation + path-guard core.

**TDD process:** git archaeology shows **0** TDD-vocabulary commits and **16/16** modules adding source + test in the same `feat(iter-N)` commit — test-alongside, not test-first. Honest TDD score 68%, not SHIP.

---

## Coverage truth correction (process finding)

A naive `vitest --coverage` read shows ~55% (HOLD) because many root `__tests__/harness-*.test.ts` import the compiled **`dist/*.js`** via `file://` dynamic imports, and v8 attributes that execution to the excluded `dist/` files (`score.ts`, `wizard.ts`, `threat-model.ts`, `diag.ts`, etc. appear at 0–8% — all false positives). Aliasing `dist→src` and instrumenting `dist/**` gives the true **82.32%**. **MetaHarness's own CI understates its coverage by ~27 points** and silently produces no report when 3 repo-hygiene tests fail (`reportOnFailure:false`). Recommend a `dist→src` resolve alias.

---

## Highest-value remediations (ranked)

1. **[HIGH-1] Wire `witnessVerify` end-to-end and fail closed** — or stop claiming "signed." Add a tampered-witness publish integration test.
2. **[HIGH-2] Stop leaking secrets** — no raw stdout by default; value-aware sanitiser; `[REDACTED]` assertions.
3. **Per-finding severity assertions in `mcp-scan.test.ts`** (`allow-shell`===high, exit 1 *because of* shell) — restores the CI security gate. Kills the most dangerous surviving mutants.
4. **Test `upgrade.applyPlan` (`upgrade.ts:127-159`)** against a temp dir — the package's largest untested destructive write path; note the advertised "3-way merge" is actually SHA-fingerprint conflict detection + whole-file marker dump, not a line-level merge.
5. **Make `isGcloudOnPath()` injectable** so `secrets`/`check()` tests run their full body under the mock (removes the CI escape hatch).
6. **Pin the `renderer` injection regex** (`{{a.b}}`, `{{1bad}}`, `{{__proto__}}` must not substitute) and witness boundary cases (65-char key, 129-char sig, schema 0 → invalid).
7. **Add dedicated unit tests** for `genome-scorers.ts` (5 pure functions), `score.ts`, `diag.ts`, `threat-model.ts` (0 dedicated tests, 45–66 branch points — cheap, high yield).
8. **MED:** `external-template.ts:31` arbitrary `import()` = RCE-by-install; `publish.ts` `baseUrl` SSRF leaks Pinata JWT; `renderer` no-JSON-escaping when emitting policy/JSON; `eject`/`upgrade` write paths lack `..` traversal guards.

---

## What is genuinely strong (balance)

- **Code structure:** avg complexity 7.18; flat dispatch ladders (not god-functions); `writer.ts` atomic writer and `validate.ts` path-guard are mutation-proven robust.
- **Cleared security concerns:** no command injection in `secrets.ts` (`execFile` argv-array), no template-eval escape in `renderer.ts`, no SSRF in `analyze-repo.ts` (local-file-only), `federate.ts` tier enum validated.
- **Real coverage** is 82.32% with behavioral assertions against a real filesystem in tmp dirs, and a genuine DI seam in `secrets.ts`.

The product is well-built **engineering**; it is the **security guarantees** (provenance, secret handling) — the things it markets — that are currently unproven or non-functional, which is why a quality-aware gate must say HOLD until HIGH-1/HIGH-2 are fixed.

*All findings EXECUTED against the MetaHarness source at the `working-may` snapshot, 2026-06-15. Per-dimension detail in `02`–`12` in this folder.*
