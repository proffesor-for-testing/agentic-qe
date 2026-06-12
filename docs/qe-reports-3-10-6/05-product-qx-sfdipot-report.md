# Product/QX SFDIPOT Report - v3.10.6

**Date**: 2026-06-12
**Agent**: qe-product-factors-assessor (agent 05)
**Baseline**: v3.9.13 (2026-04-20, composite 6.6/10)
**Methodology**: SFDIPOT (Bach's HTSM) + QX
**Source Version**: 3.10.6 (`package.json` source of truth; folder labeled `3-10-6` per request)
**Commits since baseline**: 270 non-merge (`git rev-list --count v3.9.13..HEAD` = 270)
**Releases since baseline**: 30 (v3.9.14 → v3.10.6)
**Window**: 2026-04-17 → 2026-06-12 (~56 days)

> Evidence rule: every claim cites a real command/`file:line` I ran. Evidence classes (ADR-105): **EXECUTED** = I ran the command and show output; **STATIC** = derived from DB/file content; **INFERRED** = reasoning over code. Read-only against `memory.db`.

---

## Executive Summary

v3.10.6 is the strongest product release in this series on the **prior-P0 remediation** axis: **3 of the 5 re-verified prior P0s are now FIXED with hard evidence** — the 15 CRITICAL npm vulns (`npm audit --omit=dev` = **0 vulnerabilities**, override `protobufjs: ^7.5.6`), the +79% tarball bloat (266 chunks, was 799; `rmSync` clean at `scripts/build-cli.mjs:29`), and the `advisor_consult` empty-string fallback (now `response.content.trim()` at `src/routing/advisor/multi-model-executor.ts:152`). The **CLI `memory store` is NOT broken** — it writes to `kv_store`, and store+get round-tripped successfully in live testing; the `memory_entries has no column named id` failure is **not reproducible** at v3.10.6 (that table never exists in the schema). The `qe_patterns` 468→276 drop is **consolidation, not corruption**: integrity ok, distinct=total, driven by the ADR-110 single-writer refactor that split usage/null records into `qe_pattern_usage` (306 rows) and `qe_pattern_nulls` (0 rows).

The new ADR-105..110 pattern-space work is **mostly real and reachable**, with one honestly-stubbed seam: ADR-110 negative-pattern store ships (`src/learning/pattern-null-store.ts` + migration, `qe_pattern_nulls` table exists), ADR-108 lineage/invariant gates are live workflows, but **ADR-106 live safety eval is declared-but-unimplemented by design** (`tests/safety/behavioral/runner.ts:28` `--live` exits 2, wired to fail loudly per issue #522) — the deterministic layer is real.

The drag is the **unchanged platform/QX debt that has now survived two reporting cycles**: still zero Node 18/20/22 CI matrix (every job pins `24.13.0`), still zero macOS/Windows CI, still **15 stale `ruflo` refs in CLAUDE.md** (user flagged personally; +1 vs prior 14), `NO_COLOR` still 1 ref vs 1,777 chalk calls, Zod still 0, and the startup-noise + `[object Object]` log leak persists on every command. Lint is now **reachable** (script fixed to `eslint src --ext .ts`) but **fails with 404 errors / 66 warnings** — the failure mode improved but enforcement is still off.

**Composite Score: 7.1 / 10** (v3.9.13: 6.6, Δ **+0.5**) — driven entirely by prior-P0 remediation (security, tarball, advisor, memory CLI) and genuine ADR-105..110 delivery; held back by flat platform matrix, docs drift, and lint that runs-but-fails.

---

## Prior P0 / P1 Remediation Table

| Prior Risk | Sev | Status @ v3.10.6 | Evidence (EXECUTED / STATIC) |
|---|---|---|---|
| 15 CRITICAL npm vulns (protobufjs) | P0 | **FIXED** | `npm audit --omit=dev` → "found 0 vulnerabilities" (EXECUTED); `overrides.protobufjs: "^7.5.6"` in `package.json` (STATIC) |
| Tarball bloat +79% (799 chunks) | P0 | **FIXED** | `ls dist/cli/chunks \| wc -l` = **266** (EXECUTED); `rmSync(chunksDir...)` at `scripts/build-cli.mjs:29` (STATIC); `npm pack --dry-run` = 10.4 MB packed / 54.8 MB unpacked (EXECUTED) |
| 22 retiring-model refs (`claude-3-haiku-20240307`) | P0 | **PARTIAL** | `grep` retiring refs in `src/` = **11** (down from 22), all in cost/provider mapping tables (`src/shared/llm/cost-tracker.ts:39,85`, `providers/bedrock.ts:131`, `providers/claude.ts:372`) — legitimate price/legacy mappings, not active routing (EXECUTED) |
| ESLint `npm run lint` failing ("tests glob ignored") | P0→P1 | **PARTIAL** | Script now `eslint src --ext .ts` (no tests glob) — **runs** but exits **1** with **470 problems (404 errors, 66 warnings)** (EXECUTED). Reachable, not enforcing. |
| `advisor_consult` empty-string fallback (ADR-092) | P0 | **FIXED** | `src/routing/advisor/multi-model-executor.ts:152` → `const advice = response.content.trim();` (no blind `\|\| ''` fallback) (STATIC) |
| Node 18/20/22 CI matrix | P0 (prior R-P1) | **UNCHANGED** | All `optimized-ci.yml`/`npm-publish.yml`/`mcp-tools-test.yml` jobs pin `24.13.0`; only `init-chaos.yml:54` + `test-qe-browser.yml:60` use `20`. Zero 18/22. (EXECUTED grep) |
| Zero macOS/Windows CI | P1 | **UNCHANGED** | `grep -rln "macos-latest\|windows-latest" .github/workflows` = **0 hits** (EXECUTED) |
| 15 stale `ruflo` refs in CLAUDE.md | P0 (prior R-QX3) | **REGRESSED** | `grep -c ruflo CLAUDE.md` = **15** (was 14); lines 136,175,204-207,232-241,247-249,261-262 (EXECUTED) |
| `NO_COLOR` not honored | P1 | **UNCHANGED** | 1 ref vs **1,777** chalk calls in `src/` (EXECUTED) |
| Zero Zod runtime validation | P1 | **UNCHANGED** | `grep -rln "from 'zod'" src` = **0** (EXECUTED) |
| Startup noise + `[object Object]` log | P1 | **UNCHANGED** | `aqe health` emits 20+ init lines incl. `[QueenGovernance] Initialized with flags: [object Object]` + RVF lock messages before output (EXECUTED) |

**Net: 3 prior P0s FIXED, 2 PARTIAL, 1 REGRESSED (docs); platform/QX debt flat across two cycles.**

---

## S — Structure: 5.5/10 (Δ +0.5)

- Source files 1,295 (+32), test files 871 (+94), LOC +2.1% per SHARED-CONTEXT snapshot (reconciled — not independently re-counted, accepted as central baseline).
- Files >500 lines: 453 (+6). No decomposition pressure; structural debt creep continues but the **test-file growth (+94)** is a genuine quality investment that lifts this factor +0.5.
- `console.*` in `src` (excl. tests, `--include="*.ts"`): **3,413** across **352 files** (EXECUTED) — matches snapshot exactly (reconciled my initial 3,549 included non-.ts/test matches).
- New first-class learning structure: `src/learning/pattern-null-store.ts`, `src/learning/pattern-store.ts`, `src/migrations/20260611_add_pattern_nulls_table.ts` (ADR-110) — a coherent addition, not sprawl.

**Risk R-S1 (MEDIUM, unchanged):** 453 files >500 LOC.

---

## F — Function: 8.5/10 (Δ 0)

**ADR-105..110 feature verification (read code, not README):**

| ADR | Claim | Verified | Evidence class |
|---|---|---|---|
| 110 | Kept-nulls negative pattern records | **REAL** | `src/learning/pattern-null-store.ts`, migration `20260611_add_pattern_nulls_table.ts`; DB table `qe_pattern_nulls` exists (0 rows yet); single-writer commit `e266bae9` | STATIC |
| 106 | Behavioral safety evals | **PARTIAL/HONEST** | Deterministic layer real (`tests/safety/behavioral/runner.ts`, 63 lines + `.github/workflows/safety-eval.yml`); **live layer NOT implemented** — `runner.ts:28` `--live` → `process.exit(2)` "see issue #522"; workflow comment: "wired to fail loudly rather than fake a pass" | EXECUTED |
| 108 | Benchmark lineage pre-registered rubrics | **REAL** | `.github/workflows/coherence.yml`, `invariant-check.yml`; `docs/benchmarks/LINEAGE.md`; ADR doc present | STATIC |
| 107 | Shipped-agent invariant verification | **REAL** | `.github/workflows/invariant-check.yml` | STATIC |
| 105 | Evidence-class labels on findings | **DOC/CONVENTION** | ADR doc present; convention (this report applies it) — not a runtime feature in `src` | INFERRED |
| 109 | Interaction benchmark qualitative agents | **DOC** | ADR + `docs/benchmarks/LINEAGE.md`; rubric pre-registration | STATIC |

- ADR-092 advisor: real, `src/routing/advisor/index.ts` header + 6 modules; empty-string contract handled (`multi-model-executor.ts:152`).
- ADR-093 model migration: 38 files reference `claude-opus-4-7\|sonnet-4-6\|haiku-4-5\|opus-4-8` (EXECUTED).
- `npm run build`: artifacts present (`dist/cli/bundle.js`, `dist/mcp/bundle.js` @ 2026-06-11) (STATIC).

**Risk R-F1 (P1):** lint runs but 404 errors — enforcement off. **R-F2 (LOW):** ADR-106 live eval stubbed (tracked, issue #522) — acceptable for now but is a declared capability users cannot run.

---

## D — Data: 7.5/10 (Δ +0.5)

**`.agentic-qe/memory.db` — actual state (read-only):**

| Attribute | v3.10.6 | v3.9.13 | Note |
|---|---|---|---|
| `PRAGMA integrity_check` | **ok** | ok | EXECUTED, mode=ro |
| File size | 62.2 MB | 53.9 MB | grows with experiences |
| `qe_patterns` | **276** (distinct=total) | 468 | **-192 — investigated below** |
| `qe_pattern_usage` | 306 | — | NEW (single-writer split) |
| `qe_pattern_nulls` | 0 | — | NEW (ADR-110 table, unpopulated) |
| `captured_experiences` | 19,822 | 17,145 | +2,677 (active learning) |
| `qe_trajectories` | 389 | 335 | +54 |
| `sona_patterns` | 1,067 | — | NEW |
| `kv_store` | 5,011 | 5,019 | CLI memory target |

**qe_patterns 468→276 — INVESTIGATED (consolidation, NOT data loss):**
- `integrity_check` = ok; `COUNT(*)=COUNT(DISTINCT id)=276` — no duplicate/orphan rows (EXECUTED).
- `created_at` spans **2026-03-09 → 2026-06-12** (full window intact; oldest records preserved) (STATIC).
- Monthly: March 68 / April 207 / June 1 — the drop is in April-era rows, coincident with `e266bae9 "single writer for pattern usage — qe_pattern_usage + qe_patterns columns"` and ADR-110 null-split (`687874fe`, `8663df13`).
- `.bak-investigate-1781245694` (April 30 snapshot) holds 279 — i.e. the reduction predates June and tracks the refactor, not a corruption event.
- **Conclusion (INFERRED):** the -192 is the learning engine moving usage/failure data out of `qe_patterns` into dedicated tables, plus dedup under the single-writer model. Not a loss incident — but it **silently invalidates any external dashboard counting `qe_patterns` as the learning-corpus size**, and CLAUDE.md's "1K+ irreplaceable records" framing now spans multiple tables.

**Stale DB co-existence (R-D3, MEDIUM, unchanged):** `.agentic-qe/` carries `memory.db.bak-1781078928` (**unreadable** — "file is not a database (26)", likely WAL-truncated bind-mount artifact) and `memory.db.bak-investigate-1781245694`. No retention policy. Per CLAUDE.md data-safety rules these should be relocated/archived, not left adjacent to the live DB.

**Zod still 0 (R-D1, HIGH, unchanged)** — biggest data-integrity gap; advisor consumes LLM JSON with no runtime schema.

---

## I — Interfaces: 8/10 (Δ +0.5)

- **CLI `memory` fully functional** (prior "broken store" claim refuted): `store`/`get`/`search`/`list`/`delete`/`share`/`usage` subcommands present (EXECUTED `memory --help`). Live test: `memory store --key qe-sfdipot-test-... --namespace aqe/v3/qe-reports-3-10-6` → "✓ Stored"; persisted to `kv_store` (verified via read-only SELECT); `memory get` round-tripped the value. (EXECUTED)
- **`--json` output works**: `memory list --json` returns clean structured `{"success":true,"data":{"entries":[...]}}` (EXECUTED) — programmatic consumption is viable.
- **Error message UX**: `npm run lint` now produces actionable per-file errors (real lint output) instead of the opaque tests-glob error.
- **CLAUDE.md `ruflo` drift (R-I4, MEDIUM, REGRESSED to 15):** every CLI example still tells users `npx ruflo ...` — a binary this project does not ship (`aqe`/`agentic-qe` per `package.json bin`). Lines 136,175,204-207,232-241,247-249,261-262.
- **Startup noise (R-I1, HIGH, unchanged) + `[object Object]` (R-I3, LOW, unchanged):** 20+ init lines + `[QueenGovernance] Initialized with flags: [object Object]` on every command.

---

## P — Platform: 5/10 (Δ 0)

- **Node CI matrix: still absent.** `engines: ">=18.0.0"` but every production job (`optimized-ci.yml`, `npm-publish.yml`, `mcp-tools-test.yml`, `benchmark.yml`) pins `24.13.0`. Only `init-chaos.yml:54` and `test-qe-browser.yml:60` use Node `20`. **Zero coverage for the claimed 18/22 floor/ceiling.** (EXECUTED grep across all workflows)
- **OS matrix: zero macOS/Windows** (`grep macos-latest\|windows-latest` = 0). (EXECUTED)
- The `>=18` engines claim is **untested in CI** — a published-package compatibility risk unchanged across two cycles.

**Risk R-P1 (P0, unchanged):** Node 18/20/22 matrix. **R-P2 (HIGH, unchanged):** no cross-OS CI.

---

## O — Operations: 7.5/10 (Δ +0.5)

- `aqe health` runs end-to-end, exit 0, "Overall: healthy", 14 idle domains, 53 agents, 2 MCP servers (EXECUTED).
- **Safety-eval workflow is a genuine defense-in-depth add** (`.github/workflows/safety-eval.yml`): deterministic gate always runs; live gate honestly fails (exit 2) rather than faking a pass — good operational integrity.
- Lint config correct (`.eslintrc.cjs`, no `.eslintignore` needed since tests glob removed); the script now reaches real code — a real operability improvement even though it fails on 404 errors.
- **Logging discipline still poor** (R-O3, unchanged): 3,413 console calls, RVF stale-lock messages surface on commands.

**Risk R-O1 (P1):** lint reachable but 404 errors block clean enforcement. **R-O2 (MEDIUM):** stale `.bak` DBs in working dir (one unreadable) — operational hygiene.

---

## T — Time: 6.5/10 (Δ +0.5)

| Metric | v3.10.6 | v3.9.13 |
|---|---|---|
| Releases since baseline | **30** (v3.9.14→v3.10.6) | 13 |
| Commits since baseline | 270 | 91 |
| Window | ~56 days | 21 days |
| Avg cadence | ~1.9 days | 1.6 days |

- Cadence steadied (~1.9d vs 1.6d) over a longer, calmer window. v3.10.0 minor bump appropriately gated the ADR-105..110 pattern-space work (semver signal improved vs prior "feature-as-patch" pattern).
- ADR discipline remains strong: 6 new ADRs (105-110) with on-disk docs, dedicated CI gates (lineage, invariant, safety-eval), and an explicit "not-yet-implemented, fail-loud" stub for the live safety layer — mature handling of partial delivery.

**Risk R-T1 (LOW, improved):** 30 releases/56d is high but the minor bump at v3.10.0 restored semver signaling.

---

## QX — Quality Experience: 6.5/10 (Δ +0.5)

- **First-run security posture materially better**: a user installing v3.10.6 gets 0 prod vulns and a 10.4 MB tarball (was bloated). This is the single biggest QX win.
- **Memory CLI is trustworthy**: store/get/list/--json all work in live testing — the user-facing memory surface is not broken.
- **Docs accuracy still the weak point**: 15 stale `ruflo` refs in CLAUDE.md (a user running `npx ruflo init` hits a different npm package). README clean.
- `NO_COLOR` effectively unadopted (1 ref / 1,777 chalk); startup noise + `[object Object]` persist.

**Risk R-QX1 (HIGH, unchanged):** startup noise. **R-QX3 (MEDIUM, REGRESSED):** CLAUDE.md `ruflo` drift now 15.

---

## Score Summary

| Factor | v3.10.6 | v3.9.13 | Δ | Key Evidence |
|---|---|---|---|---|
| Structure | 5.5 | 5 | +0.5 | +94 test files; 453 >500 LOC; console 3,413 |
| Function | 8.5 | 8.5 | 0 | ADR-110/108/107 real; ADR-106 live eval honestly stubbed; lint runs-but-404-errors |
| Data | 7.5 | 7 | +0.5 | integrity ok; qe_patterns 468→276 = consolidation (ADR-110 split, distinct=total); Zod still 0 |
| Interfaces | 8 | 7.5 | +0.5 | memory CLI works (store/get/--json verified); ruflo drift +1; startup noise |
| Platform | 5 | 5 | 0 | zero Node 18/20/22, zero macOS/Windows CI |
| Operations | 7.5 | 7 | +0.5 | health ok; safety-eval gate; lint reachable; stale .bak DBs |
| Time | 6.5 | 6 | +0.5 | 30 rel/270 commits/56d; v3.10.0 minor gate; strong ADR discipline |
| QX | 6.5 | 6 | +0.5 | 0 prod vulns; trustworthy memory CLI; CLAUDE.md ruflo drift |
| **Composite** | **7.1** | **6.6** | **+0.5** | 3 prior P0s fixed; ADR-105..110 real; platform/docs debt flat |

---

## Top P0s for Next Release (v3.10.7+)

| # | Risk | Factor | Sev | Action |
|---|---|---|---|---|
| 1 | Lint 404 errors | Function/Ops | **P0** | `npm run lint` now reaches code but emits 404 errors. Fix or `// eslint-disable` the unused-var/`no-explicit-any` set so lint can gate CI. Reachable-but-failing is worse than visibly-broken — it looks green in the script name. |
| 2 | Node CI matrix absent | Platform | **P0** | `engines: ">=18"` untested. Add `[18.x, 20.x, 22.x, 24.x]` matrix to `optimized-ci.yml` — a published-package floor must be CI-verified. |
| 3 | CLAUDE.md `ruflo` drift (15) | QX/Docs | **P0** | Rewrite all 15 `npx ruflo ...` to `aqe`/`npx agentic-qe` in one commit. User has flagged personally; regressed +1. |

**P1:** macOS/Windows CI (0); Zod schemas on advisor/MCP inputs (0); startup-noise + `[object Object]` gate behind `AQE_VERBOSE`; relocate/archive stale `.bak` DBs (one unreadable) per data-safety rules; populate/exercise `qe_pattern_nulls` (0 rows — ADR-110 wired but cold); land ADR-106 live safety eval (issue #522).

---

## Methodology Notes

- All counts via real `grep`/`sqlite3`/`node dist/cli/bundle.js` invocations on the working tree at HEAD (`d8745cfb`).
- `memory.db` inspected **read-only** (`file:...?mode=ro`); no rows modified by SELECTs. The 6 `memory store` writes (findings + 1 probe) are additive `kv_store` rows in namespace `aqe/v3/qe-reports-3-10-6`, no learning-table mutation.
- Console count reconciled to snapshot (3,413) using `--include="*.ts"` excluding `.test.ts`.
- Feature claims verified by reading `src/` + workflows + ADR docs and invoking the CLI — not by trusting README/release notes.
- ADR-106 live-eval status confirmed by reading `tests/safety/behavioral/runner.ts` and `.github/workflows/safety-eval.yml` directly.

---

## Shared Memory

Stored to namespace `aqe/v3/qe-reports-3-10-6` (verified via CLI):

- **product-1**: Prior P0 npm-vulns FIXED (`npm audit --omit=dev` = 0; `protobufjs ^7.5.6` override). Tarball bloat FIXED (266 chunks vs 799; `rmSync` at `build-cli.mjs:29`; 10.4 MB packed).
- **product-2**: Lint now REACHABLE (`eslint src --ext .ts`, no tests-glob error) but FAILS exit 1 with 404 errors + 66 warnings — enforcement still off; P0→P1 different failure mode.
- **product-3**: CLI `memory store`/`get` NOT broken — writes to `kv_store`, store+get verified; `memory_entries` table never existed; prior schema bug not reproducible at v3.10.6.
- **product-4**: `qe_patterns` 468→276 is consolidation not corruption (integrity ok, distinct=total, ADR-110 single-writer split into `qe_pattern_usage` 306 / `qe_pattern_nulls` 0); 2 stale `.bak` DBs co-exist (one unreadable).
- **product-5**: ADR-105..110 mostly real — ADR-110 null-store shipped (table exists, 0 rows), ADR-108 lineage/invariant workflows live, ADR-106 live safety eval honestly stubbed (`runner.ts:28` exit 2, issue #522).
- **product-6**: Prior P0/P1 UNCHANGED — zero Node 18/20/22 CI (all pin 24.13.0), zero macOS/Windows, 15 stale `ruflo` refs in CLAUDE.md (+1), `NO_COLOR` 1 vs 1,777 chalk, Zod 0, startup noise + `[object Object]` persist.
