# Round-2 Regression Tracking — Prior Findings: Fixed / Open / Regressed

**Subject:** `ruvnet/agent-harness-generator` HEAD `5f63ac6` (`v0.1.15-467`), 2026-06-27.
**Baseline:** `working-may` round (2026-06-15), `docs/metaharness/00-executive-summary.md` + `qcsd-development/01-executive-summary.md`.
**Method:** each prior finding re-checked against current code by the round-2 `qe-*` swarm; status backed by file:line + EXECUTED evidence.

Legend: ✅ Fixed · ⚠️ Partially fixed · ❌ Still open · ⛔ Regressed (worse) · ➕ New this round

---

## P0 — beta feedback sent to Ruv last round

| # | Prior P0 | Status | Evidence (current) |
|---|---|---|---|
| **P0-1** | DRACO headline claim falsified by own benchmark ("tuned harness beats vanilla — measured"; ADR-038 measured the opposite) | ✅ **Fixed (reframed)** | README no longer claims "harness beats vanilla." Now (README ~L84): *"getting the right model on each task and getting out of the way… a small, cheap model delivers frontier-quality."* The new SWE-bench/DRACO leaderboard reports measured rows with **Wilson 95% CIs + committed prediction files** (51.3% Lite n=300, 55.6% Verified n=500, 21.2% Terminal-Bench n=80). The arc honestly published ~13 negatives/voids (cheap-Pareto FALSIFIED, sniper REFUTED, 2 VOID trace runs, Pro eval-artifact retraction). See `06-darwin-arc-review.md`. The framing now matches the evidence — and matches our own D3 finding. |
| **P0-2** | Fresh-clone `npm test` fails (no `pretest` build) | ⚠️ **Partially fixed** | `package.json` now has `"pretest": "npm run build"` (the hook we asked for). BUT in this container the build it triggers **fails** at `@metaharness/router` (`TS2307` missing `@ruvector/tiny-dancer`), so `npm test` still aborts. The missing dep is in the lockfile but pruned from `node_modules` → assessed **environmental** (clean-CI `npm ci` likely restores it; INFERRED, not reinstall-verified). The structural fix landed; the pipeline is currently red for an env reason. See `qcsd-development/04-coverage-analysis.md`. |
| **P0-3** | Status story self-contradicts (OVERVIEW "doesn't exist yet" vs README "production-ready"; counts 18≠19 packages, 6≠9 hosts, 17≠21 commands; stale tests badge) | ⚠️ **Partially fixed** | Improved but not eliminated. Tests badge still says **568**, now stale on the **low** side — real count is **1855** (~3.2×). Package/host/command/test counts still hand-maintained and drift. See `02-product-analysis.md`. |
| **P0-4** | CLI↔Studio byte-parity claim unenforced — ADR-027's "sole guard" `apps/web-ui/__tests__/parity.test.ts` does not exist | ❌ **Still open** | ADR-027 still names the file; it still does not exist. No cross-package `Buffer.equal` parity test found. See `03-technical-capabilities.md`. |

## HIGH — QCSD gate-blockers last round

| # | Prior HIGH | Status | Evidence (current) |
|---|---|---|---|
| **HIGH-1** | Witness verification is a guaranteed no-op (security theater) | ⛔ **Regressed** | Still fails open on 100% of installs — no backend exposes `witnessVerify`, `witness-client.ts:86` always returns `valid:true`, `publish.ts:128` gate is dead code, Rust `verify_manifest` (`witness.rs:110`) never bridged, kernel crate byte-identical. **Worse than round 1:** `witness-client.test.ts:52-60` now *asserts* `valid:true` for an unverified signature — the no-op is the tested contract. Confirmed by `quality`, `technical`, `security`. |
| **HIGH-2** | `secrets fetch` leaks raw secrets; bundle redaction keys on object-key names not values | ❌ **Still open (+ new bug)** | Value-blind redaction across `export-config.ts:31-39`, `threat-model.ts:186`, `genome.ts:186`, `score.ts:343`. New confirmed dead-code bug: `diag.ts:311` re-tests `k` not `v` so value-redaction never runs; `diag.ts:303` anchored regex misses `github_token`/`ANTHROPIC_API_KEY`. Mutation: `threat-model.ts:186` redaction fully removable, all 8 tests pass (#1 dangerous survivor). |

## MED / process findings

| Prior finding | Status | Evidence |
|---|---|---|
| `external-template.ts` arbitrary `import()` = RCE-by-install | ❌ Still open | `security` MED, re-confirmed |
| `publish.ts` `baseUrl` SSRF leaks Pinata JWT | ❌ Still open | `security` MED |
| `renderer` no JSON-escaping when emitting policy/JSON | ❌ Still open | `security` MED |
| `eject`/`upgrade` write paths lack `..` traversal guards | ❌ Still open | `security` MED |
| `writer.ts --force` symlink follow | ❌ Still open | `security` MED |
| `upgrade.applyPlan` untested destructive write path (defect 0.86) | ✅ **Fixed** | Coverage 66→92%, risk 0.86→~0.40, exercised by `upgrade-cmd.test.ts:70` (branch still 66% — not fully de-risked) |
| Mutation 53.6% on critical generator code; assertions don't protect security logic | ❌ Still open | 11/11 prior dangerous survivors survive again on byte-identical source+tests; +2 new |
| TDD: test-alongside not test-first (68%) | ❌ Still open | 67% generator / 72% darwin; still 0 test-first, 0 TDD-vocab commits |
| Coverage understated by CI (~27pts) due to dist→src attribution | ⚠️ Unchanged | Root `harness-*.test.ts` still `file://`-import `dist`; needs the dist→src alias still |
| `runWizard` three duplicated pick-loops | ❌ Still open | `wizard.ts:75/93/119` still triplicated |
| Fabricated `harness doctor` transcripts / unenforced safety in example READMEs | (re-check) | See `02-product-analysis.md` |

## New findings this round (➕)

| New finding | Severity | Evidence |
|---|---|---|
| openclaw host can never pass `validate` (doctor allowlist omits `.openclaw/openclaw.json`) | Realized regression (4 failing tests) | `subcommands.ts:153-158` vs `host-config.ts:100` |
| Tier-2 darwin sandbox dynamically imports+executes variant `.ts` without `inspectVariant` | MED (opt-in) | `tier2-driver.ts:31-34`, `evolve.ts:114`, regex bypass via `constructor.constructor` |
| Darwin scaffold version drift (`^0.2.2` pinned vs `0.7.1` in-repo) | LOW/MED | generator `index.ts` `DARWIN_VERSION` |
| Darwin HTTP mutators have no AbortController/timeout; serial mutation phase | Perf CONDITIONAL | `openrouter-mutator.ts:87`, `requesty-mutator.ts:79`, `evolve.ts:289-326` |
| `harness-diag.test.ts:229` hardcodes kernel_version `0.1.0` vs stamped `0.1.2` | Test failure | root `__tests__/harness-diag.test.ts:229` |

---

## Net regression read
**The product is meaningfully better where it was measured-and-honest (P0-1 DRACO reframe is a genuine, exemplary correction; `upgrade.ts` fixed; complexity and coverage up; a strong new darwin-mode engine with a mutation-proven safety boundary).** But **every security gate-blocker from round 1 is still open**, and **HIGH-1 regressed** (the no-op is now the tested contract). The QCSD gate is **HOLD** for the same root cause as 2026-06-15: the provenance/secret-handling code the product markets is still unproven or non-functional.
