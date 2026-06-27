# QCSD Development Swarm — Executive Summary (Round 2): MetaHarness

**Subject:** `ruvnet/agent-harness-generator` → `packages/create-agent-harness/src` (the TS generator) **+** `packages/darwin-mode/src` (the NEW self-evolution engine).
**Snapshot:** HEAD `5f63ac6`, `v0.1.15-467-g5f63ac6`, branch `claude/darwin-mode-evolve-polyglot`. **Date:** 2026-06-27.
**Swarm:** qcsd-development-swarm v1.0 (ADR-102), Task-tool protocol with specialized `qe-*` agents — 3 core + 3 conditional (security, mutation, performance) + defect-predictor. **Verification:** all metrics EXECUTED (build, vitest, coverage, mutation campaign, git archaeology) — not estimated.
**Prior round:** `working-may` (2026-06-15), generator only → gate **HOLD**. See `../../qcsd-development/`.

---

## FINAL GATE: **HOLD** (unchanged from round 1)

**Decision rule (Step 5):** *any* HIGH/CRITICAL security finding in security code forces HOLD. Two **HIGH** findings persist in the provenance/secret-handling code — the product's entire value proposition — and **both are the same findings from round 1, still unfixed**. Code structure is genuinely strong (SHIP on complexity and coverage for both packages), and the new `darwin-mode` package is well-engineered with a verified-strong safety boundary, but the generator's security guarantees remain non-functional.

| Dimension | create-agent-harness (generator) | darwin-mode (NEW) | Gate |
|---|---|---|---|
| **TDD adherence** | **67%** (0/21 test-first, 0 TDD-vocab commits/93) | **72%** (549 pass/14 skip, 0.73:1 test:code, real DI seams; 0 test-first) | CONDITIONAL |
| **Code complexity** | avg cyc **6.53** (median 4, max 33) — improved from 7.18 | avg cyc **3.53** (median 2, max 53 = `evolve()`) | SHIP |
| **Test coverage** | **84.86% L / 77.08% B / 87.88% F** (v8, src∪dist max-merge) | **84.19% L / 83.88% B / 91.47% F** | SHIP |
| **Mutation (critical code)** | **38.1%** survivor-weighted (~53.6% honest, unchanged); witness 25%, threat-model 25% in HOLD-band | **60%** — every primary safety-gate mutant KILLED | CONDITIONAL → gen blocks |
| **Security** | **2 HIGH · 6 MED · 5 LOW**; `npm audit` clean | safety boundary verified strong (credit) | **HOLD** |
| **Performance** | n/a (build-time scaffolder) | **CONDITIONAL** — serial mutation + no HTTP timeout | CONDITIONAL |
| **Defect risk** | top: `index.ts` 0.72, `subcommands.ts` 0.68 (realized) | top: `evolve.ts` **0.74** (repo-wide #1) | (informs) |

> **Build/test pipeline status:** `npm run build` and therefore `npm test` (via the new `pretest` hook) currently **FAIL** in this container — `@metaharness/router` hits `TS2307: Cannot find module '@ruvector/tiny-dancer'`. The dep IS in `package-lock.json` (dev, v0.1.21) but absent from `node_modules` here — the known `@ruvector` optional-prune / host-shared-node_modules pattern. **Assessed as ENVIRONMENTAL, not a code defect** (clean-CI `npm ci` very likely restores it); this could not be verified by reinstall and is marked INFERRED. Tests were run via `npx vitest run` (bypassing the broken pretest) → **1855 tests: 1831 pass / 14 skip / 10 fail** across 206 files.

---

## The two HIGH findings (gate-blockers) — BOTH CARRIED OVER FROM ROUND 1, STILL OPEN

### HIGH-1 — Witness verification is a guaranteed no-op (now *test-enshrined*)
No kernel backend exposes `witnessVerify` — native NAPI, WASM, and the JS floor all export only `kernelInfo`/`mcpValidate`/`version` (`kernel-js/src/index.ts:22-27,52-57,76-81`); `crates/kernel/src/witness.rs:110 verify_manifest` is never bridged (the Rust kernel crate is **byte-identical to round 1**, 2,259 LOC). The guard at `witness-client.ts:74` is therefore always false → `:86` always returns `{valid:true,…degraded}`. `publish.ts:128`'s gate is **dead code**, and it also skips entirely when `witness.json` is absent. `harness verify` prints VALID on a tampered manifest. **New since round 1:** `witness-client.test.ts:52-60` now *asserts* `valid:true` for an unverified signature — the fail-open is the **tested contract**, so the suite actively protects the regression. Docstring still claims "no path to publish a tampered harness." Mutation: witness boundary mutants (over-length key/sig, schema-0) survive (WC1/2/4).
**Status: STILL OPEN — arguably regressed (now defended by a test).**

### HIGH-2 — Support-bundle redaction is value-blind and partly dead code
`diag.ts:311` is **provably-dead code** — re-tests the object key `k` instead of the value `v`, so the intended value-redaction never executes; `diag.ts:303`'s `^`-anchored regex fails to redact `github_token`/`npm_token`/`ANTHROPIC_API_KEY` even by key name. `export-config.ts:31-39`, `threat-model.ts:186`, `genome.ts:186`, `score.ts:343` are all key-name-only / value-blind. This is the `harness diag --bundle` artifact users are explicitly told is safe to paste into public GitHub issues. **Mutation confirms (most dangerous survivor): `threat-model.ts:186` `SECRET_RE.test(k)` → `false` removes redaction ENTIRELY and all 8 tests still pass** — redaction has zero behavioral test coverage.
**Status: STILL OPEN + new confirmed dead-code bug.**

---

## What the green suite still hides (mutation)
The mutation campaign re-ran the prior round's survivors on the safety-critical generator files. **All 11 dangerous survivors from round 1 survive again** (source + tests byte-identical):
- `mcp-scan.ts` `allow-shell` **HIGH→MEDIUM** severity flip survives, and **flips `mcpScanCmd` exit 1→0** — the CI security gate silently stops blocking (M1/M6).
- `witness-client.ts` boundary mutants accept over-length keys/sigs and schema 0/negative (WC1/2/4).
- `secrets.ts` guards remain invertible because `check()` early-returns when gcloud isn't on PATH — mocked coverage is illusory (S2/S3).
- `renderer.ts` injection `{{var}}` regex can be loosened and all tests pass (R1).
- **+2 new survivors** this round.
**Darwin-mode is the bright spot:** every *primary* safety-gate mutant was killed (runtime safety gate, file allowlist, symlink reject, content scanner, generated-code validator, `process.env` detector, exit-99, validate-before-write). Its 6 survivors are redundant defense-in-depth / boundary off-by-ones, each backstopped by a killed gate. The darwin safety boundary is **mutation-proven**, the opposite of the generator's security code.

---

## New this round (not in round 1)
- **One realized functional regression (4 failing tests):** the **openclaw host can never pass `validate`** — `subcommands.ts:153-158` doctor allowlist omits `.openclaw/openclaw.json`, which `host-config.ts:100` emits. A shipped, broken host adapter.
- **Tier-2 darwin sandbox (MED):** `tier2-driver.ts:31-34` (routed from `evolve.ts:114`) dynamically imports + executes variant `.ts` **without calling `inspectVariant`**, contradicting its own comment (`tier2-sandbox.ts:8-9`); sole barrier is the bypassable regex scan (`constructor[` at `safety.ts:96` misses `constructor.constructor`). Opt-in (default `'real'`) → MED, not HIGH.
- **Darwin scaffold version drift:** generator pins `DARWIN_VERSION='^0.2.2'` while the in-repo package is `0.7.1` — generated harnesses pull a ~5-minor-stale Darwin.
- **Stale test badge (reversed direction):** README says **568 passing**; real count is **1855** (~3.2× understated; darwin-mode alone = 563).
- **Darwin perf (CONDITIONAL):** mutation phase fully serial (`evolve.ts:289-326`) and the OpenRouter/Requesty HTTP mutators issue `fetch()` with **no AbortController/timeout** (`openrouter-mutator.ts:87`, `requesty-mutator.ts:79`) — one stalled remote call hangs an entire evolve run; O(G²) archive serialization, O(N²) clade selection.

---

## What is genuinely strong (balance)
- **Generator complexity improved** (7.18→6.53 avg) while absorbing +1k LOC; high-complexity share fell 23%→18%.
- **Coverage is real and up** (84.86% generator / 84.19% darwin), behavioral assertions against a real FS in tmp dirs.
- **Round-1 top defect risk `upgrade.ts` is largely fixed** — risk 0.86→~0.40, `applyPlan` coverage 66→92%, now exercised by `upgrade-cmd.test.ts:70` (branch still 66% — not fully de-risked).
- **darwin-mode is a credible, well-tested engine** (62 test files, 1083 expectations, real DI seams, `it.fails` characterization, e2e safety invariants) with a **mutation-proven self-mutation safety boundary** (`safety.ts` allowlist + `lstat` + caps + scrubbed env; `sandbox.ts` gate-first, shell-free `execFile`; `mutator.ts` single shared write-gate inherited by all LLM mutators).

---

## Highest-value remediations (ranked)
1. **[HIGH-1] Wire `witnessVerify` end-to-end and FAIL CLOSED** — export it through NAPI+WASM, add to all JS backends, resolve `publish.ts:128`, and **fix `witness-client.test.ts` to assert that a tampered witness throws** (the test currently enshrines the bug). Or stop claiming "signed/witness-verified."
2. **[HIGH-2] Make redaction value-aware** — fix the `diag.ts:311` `k`→`v` dead-code bug, replace the anchored key regex with token-shape/entropy scrubbing, and add `[REDACTED]` behavioral assertions (kills the `threat-model.ts:186` survivor — the #1 dangerous mutant).
3. **Per-finding severity assertions in `mcp-scan.test.ts`** (`allow-shell`===high; exit 1 *because of* shell) — restores the CI security gate (kills M1/M6).
4. **Fix the openclaw host** — add `.openclaw/openclaw.json` to the doctor allowlist (`subcommands.ts:153-158`); it's a realized 4-test failure shipping broken.
5. **Darwin `evolve()` decompose** (cyc 53, repo-wide #1 defect risk) + add `AbortController`+timeout to the two HTTP mutators (perf HOLD-risk).
6. **Pin witness/renderer/secrets boundary cases** (65-char key, schema-0, `{{a.b}}`/`{{__proto__}}`, gcloud-absent path) — the unchanged survivor set.

*All findings EXECUTED against MetaHarness HEAD `5f63ac6`, 2026-06-27. Per-dimension detail in `02`–`12` in this folder. Cross-finding regression status in `../05-regression-vs-prior-findings.md`.*
