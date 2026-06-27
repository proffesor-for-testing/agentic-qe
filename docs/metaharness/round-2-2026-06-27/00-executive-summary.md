# MetaHarness — Round-2 Re-Evaluation: Executive Summary

*Subject: `ruvnet/agent-harness-generator` (**MetaHarness**) · HEAD `5f63ac6` · `v0.1.15-467-g5f63ac6` · branch `claude/darwin-mode-evolve-polyglot`.*
*Evaluator: AQE fleet (agentic-qe), specialized `qe-*` swarm. Date: 2026-06-27.*
*Prior round: `working-may` snapshot, 2026-06-15 — reports in `docs/metaharness/00`–`07` + `qcsd-development/`.*

| # | Report | Covers |
|---|---|---|
| **00** | *this file* | Round-2 executive summary, verdict, what changed, beta feedback for Ruv |
| **01** | `01-quality-analysis.md` | Adversarial code review (generator + darwin-mode) |
| **02** | `02-product-analysis.md` | Thesis, personas, journeys, beta-readiness, status-story re-check |
| **03** | `03-technical-capabilities.md` | Live runtime vs roadmap; kernel surface; darwin-mode/router/sdk |
| **04** | `04-six-hats-cross-pollination.md` | Refreshed AQE ⇄ MetaHarness cross-pollination |
| **05** | `05-regression-vs-prior-findings.md` | Every prior P0/HIGH → Fixed / Open / Regressed |
| **06** | `06-darwin-arc-review.md` | Fact-check of the new benchmark/Darwin arc (ADR-180→196) vs its own evidence |
| — | `qcsd-development/01`–`12` | Full QCSD development swarm (TDD, complexity, coverage, security, mutation, performance, defect) |

> **Method note.** This round used the **full `qcsd-development-swarm` (ADR-102) with specialized `qe-*` agents** (3 core + qe-security-scanner + qe-mutation-tester + qe-performance-tester + qe-defect-predictor) plus four eval-pillar deep-reads — *not* the 3-dimension `qcsd-development-review` workflow (which skips security/mutation/defect and has a cross-repo path bug). All metrics EXECUTED against absolute paths in `/workspaces/agent-harness-generator`.

---

## Overall verdict: **Materially better where it was measured-and-honest; still HOLD on the security guarantees it markets.**

Since `working-may`, MetaHarness added **467 commits** of real engineering: a strong new **Darwin Mode** self-evolution engine (now default-on in scaffolded harnesses, ADR-147), a published cost-router, verticals, 9 host adapters, and a **rigorous, honestly-reported benchmark program** (ADR-180→196) that is the best part of the project's culture. The headline marketing problem we flagged last round (**P0-1, the falsified DRACO claim**) has been **genuinely fixed** — the README now sells "pick the right model and get out of the way," which is exactly what the evidence (and our own D3 experiment) shows. The benchmark arc published ~13 negative/void results and walked back its own over-reaches; it is the most intellectually honest log in the repo.

**But the QCSD gate is still HOLD — for the same root cause as 2026-06-15.** Both HIGH security findings in the generator's provenance/secret-handling code (the product's entire value proposition) are **still unfixed**, and one has **regressed**:

1. **HIGH-1 — witness verification is a guaranteed no-op, now *test-enshrined*.** No kernel backend exposes `witnessVerify`; `witness-client.ts:86` always returns `{valid:true}`; `publish.ts:128`'s gate is dead code; `harness verify` prints VALID on a tampered manifest. Worse than last round: `witness-client.test.ts` now *asserts* `valid:true` for an unverified signature — the fail-open is the tested contract. Any "signed/witness-verified harness" claim remains unsubstantiated.
2. **HIGH-2 — the "sanitised" support bundle leaks secrets.** Redaction is value-blind and partly **dead code** (`diag.ts:311` re-tests the key not the value); mutation proves `threat-model.ts:186` redaction can be removed entirely with all tests still green. This is the `harness diag --bundle` artifact users are told is safe to paste into public GitHub issues.

Supporting: **mutation re-ran 11/11 of last round's dangerous survivors and they all survive again** on byte-identical source+tests (incl. the `mcp-scan` severity-flip that silently turns the CI security gate off). The generator's green suite still does not protect its security logic.

**Bottom line:** treat `v0.1.15` as *"a stronger product with an exemplary benchmark culture and one fixed headline claim — but the same unshipped security guarantees."* The honesty that fixed P0-1 is the template; apply it to the witness/redaction claims next.

---

## Gate summary (QCSD development swarm)

**FINAL GATE: HOLD** (unchanged). Per-dimension, both packages:

| Dimension | generator | darwin-mode |
|---|---|---|
| TDD | 67% CONDITIONAL | 72% CONDITIONAL |
| Complexity | avg 6.53 SHIP (↑ from 7.18) | avg 3.53 SHIP (one cyc-53 `evolve()`) |
| Coverage | 84.86%L SHIP | 84.19%L SHIP |
| Mutation (critical) | ~38–53% CONDITIONAL (blocks) | 60%, **safety boundary mutation-proven** |
| Security | **2 HIGH → HOLD** | safety boundary strong (credit) |
| Performance | n/a | CONDITIONAL (serial mutation, no HTTP timeout) |

Real test count **1855** (1831 pass / 14 skip / 10 fail) — README badge "568" is now stale ~3.2×. Build/test pipeline currently RED in-container from a missing `@ruvector/tiny-dancer` dep — **assessed environmental** (lockfile-present, `node_modules`-pruned; CI `npm ci` should restore), marked inferred.

---

## What genuinely improved since working-may
- **P0-1 DRACO claim fixed** — reframed to the honest, measured conclusion; leaderboard rows carry Wilson 95% CIs + committed prediction files; arc publishes its negatives (`06`).
- **`upgrade.ts`** — last round's top defect-risk (0.86, untested destructive write) now covered (→0.40, `applyPlan` 66→92%).
- **Generator complexity down** (7.18→6.53) while growing +1k LOC.
- **darwin-mode** — a credible, well-tested (62 files, 1083 expectations) self-evolution engine with a **mutation-proven self-mutation safety boundary** (`safety.ts`/`sandbox.ts`/`mutator.ts`).
- **`pretest: npm run build`** added (the P0-2 structural fix we asked for).

## What's still open / regressed
- **HIGH-1 witness no-op** — ⛔ regressed (test-enshrined). **HIGH-2 redaction** — ❌ open + new dead-code bug.
- **P0-4 parity.test.ts** — ❌ still absent though ADR-027 still cites it as the sole guard.
- **Mutation on critical generator code** — ❌ 11/11 dangerous survivors recur.
- **P0-3 status drift** — ⚠️ tests badge now stale on the low side (568 vs 1855); counts still hand-maintained.

## New this round
- **Realized regression:** the **openclaw host can never pass `validate`** (doctor allowlist omits `.openclaw/openclaw.json`) — 4 failing tests, a shipped-broken adapter.
- **Tier-2 darwin sandbox (MED, opt-in):** dynamically imports+executes variant `.ts` without `inspectVariant`; regex barrier bypassable.
- **Darwin scaffold version drift** (`^0.2.2` pinned vs `0.7.1` in-repo); **HTTP mutators lack timeouts** (a stalled call hangs an evolve run).

---

## Cross-pollination with AQE (full Six Hats in `04`)
The two projects have **independently converged** on the same design from opposite ends — cold cascade, best-of-N union, writer≠evaluator Goodhart guard, objective-oracle acceptance gate, cost-Pareto value score (MetaHarness ADR-181/182/183 ↔ AQE ADR-111 + value-score). Our prior D3 conclusion ("the coder binds, not the oracle") is **confirmed and sharpened** by their §11 (`06`).

**Highest-leverage NEW move:** consume the now-**published `@metaharness/router`** (pure-TS, dependency-free k-NN + KRR quality predictor) as the learned start-tier predictor for AQE's escalation lane — this is AQE's planned-but-never-built A10 (router confidence stuck ~40% across 2165 requests), de-risked from "build (M)" to "wire (S)"; AQE already emits both inputs (query embeddings + `routing_outcomes`). Keep AQE's objective oracle as the acceptance gate; the router only picks the entry door. Two cheap companions: adopt ADR-183's precision-against-gold protocol to finish `adversarial-verify` calibration; cap cross-model ensembles at N=2 (their §23/§31/§32, corroborated by AQE A12). **`vertical:qe` stays retired** — the D3 gate already confirmed the generic-harness-beats-frontier composite is G-ABORT; darwin genome/clade/epistasis is machinery for that G-ABORTed product → decline.

---

## Top actions to send back to Ruv (round-2 beta feedback)

| Pri | Action |
|---|---|
| **P0** | **Wire `witnessVerify` end-to-end and FAIL CLOSED** (NAPI+WASM+JS backends; resolve `publish.ts:128`) — and **fix `witness-client.test.ts`**, which now *asserts* the fail-open bug. Or retract every "signed/witness-verified" claim. (HIGH-1, regressed) |
| **P0** | **Make `--bundle` redaction value-aware** — fix the `diag.ts:311` `k`→`v` dead-code bug, scrub by token-shape/entropy, add `[REDACTED]` assertions (kills the `threat-model.ts:186` #1 mutant). It's the artifact you tell users to paste publicly. (HIGH-2) |
| **P0** | **Fix the openclaw host** — add `.openclaw/openclaw.json` to the doctor allowlist (`subcommands.ts:153-158`); it ships broken (4 failing tests). |
| **P1** | **Restore the CI security gate** — per-finding severity assertions in `mcp-scan.test.ts` (`allow-shell`===high; exit 1 *because of* shell). Kills the M1/M6 severity-flip survivor. |
| **P1** | **Update the tests badge** (568→generate from the catalog; real ≈1855) and make `parity.test.ts` real or drop the ADR-027 claim. |
| **P1** | **Darwin:** add `AbortController`+timeout to the OpenRouter/Requesty mutators; decompose `evolve()` (cyc 53, repo-wide #1 defect risk); fix the `^0.2.2`→`0.7.1` scaffold version pin. |
| **P2** | Carried MEDs: `external-template.ts import()` RCE-by-install, `publish.ts` baseUrl SSRF, renderer JSON-escaping, eject/upgrade traversal guards, `writer --force` symlink; dedupe `runWizard`'s three pick-loops. |

---

## Credit where due
The benchmark/Darwin arc (`06`) is a model of empirical honesty — Wilson CIs, committed predictions, ~13 published negatives/voids, and a public retraction of an eval artifact. That culture already fixed our #1 prior finding. The darwin-mode safety boundary is the best-tested security code in the repo (mutation-proven). The gap is narrow and specific: the *generator's* provenance/secret guarantees haven't received the same rigor as its benchmarks.

*All findings EXECUTED against MetaHarness HEAD `5f63ac6`, 2026-06-27. Detail in `01`–`06` and `qcsd-development/`.*
