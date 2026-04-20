# Product/QX SFDIPOT Report - v3.9.13

**Date**: 2026-04-20
**Agent**: qe-product-factors-assessor (agent 05)
**Baseline**: v3.8.13 (2026-03-30, composite 6.4/10)
**Methodology**: SFDIPOT (Bach's HTSM) + QX
**Source Version**: 3.9.13 (commit 4742c41f on `working-april`)
**Source Files**: 1,263 TypeScript non-test (+68 since v3.8.13) / 564,564 LOC
**Test Files**: 790 (+73 since v3.8.13)
**Commits Since v3.8.13**: 91 non-merge, +65,679 / −8,775 lines in 21 days

---

## Executive Summary

v3.9.13 shipped 13 releases in 21 days (v3.8.14, v3.9.0–v3.9.13), driven by three large initiatives: **ADR-091** (qe-browser skill with Vibium WebDriver-BiDi engine, shipped v3.9.8), **ADR-092** (provider-agnostic advisor strategy, shipped v3.9.10), and **ADR-093** (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 model migration, shipped v3.9.13). A pile of init-path regressions was chased down across v3.9.1–v3.9.5 (patterns.rvf deadlock, CLI exit hang, governance phase, code-index walk, HNSW backend deadlocks, duplicated ruflo hooks). The v3.8.13 P0 ESLint ESM/CJS break was fixed (`.eslintrc.js` → `.eslintrc.cjs`) but `npm run lint` still fails with a *different* error — tests glob is ignored — so lint enforcement remains broken. Node-version and cross-OS CI matrices were *not* expanded. Zod validation adoption is still zero. Structural debt crept up: 92 files >1,000 lines (+1), 447 files >500 lines (+5). The memory.db is healthy (22,981 rows, integrity ok) but the repo still carries a 61MB `memory-corrupted.db` and a March backup, undermining the "150K+ irreplaceable records" claim in CLAUDE.md.

**Composite Score: 6.6 / 10** (v3.8.13: 6.4/10, Δ +0.2) — feature velocity and ADR discipline up; lint, platform matrix, and QX debt unchanged.

---

## v3.8.13 Remediation Table

| v3.8.13 Risk | Severity | Status in v3.9.13 | Evidence |
|---|---|---|---|
| R-F1: ESLint broken (CJS/ESM) | P0 | **Partially Fixed** — config renamed to `.eslintrc.cjs`, but `npm run lint` still fails ("linting tests, but all files matching the glob 'tests' are ignored") | `.eslintrc.cjs` exists; `npm run lint` exit-code 2, no `.eslintignore` present |
| R-P1: `engines >=18` but CI only Node 24 | P0 | **Not Fixed** | `"node": ">=18.0.0"` in package.json; every workflow pins Node `24.13.0` (only init-chaos uses `20`) |
| R-D1: Zero Zod/runtime schema validation | P1 | **Not Fixed** | `grep z.object\|from 'zod'` in src = 0 matches; MCP tool inputs still rely on TS compile-time types |
| R-P2: Zero macOS/Windows CI coverage | P1 | **Not Fixed** | `grep -r "macos-latest\|windows-latest" .github/workflows` = 0 hits |
| R-S1: 442 files >500 lines, 91 >1K | P1 | **Regressed** — now 447 >500, 92 >1K, 1 >2K (`pattern-store.ts` @ 1,862) | `find src -name *.ts ... xargs wc -l` |
| R-I1: Noisy CLI startup | P1 | **Not Fixed** — still ~15 lines of init log before `aqe health` output | `node dist/cli/bundle.js health` emits `[AdversarialDefense]`, `[UnifiedMemory]`, `[RVF] Shared adapter init failed: RVF error 0x0303: FsyncFailed`, etc. |
| R-T1: 10 releases in 11 days | P2 | **Worsened** — 13 releases in 21 days; still patch-version velocity | `git tag --sort=-creatordate` |
| R-S2: 78.7% code outside `domains/` | P2 | **Marginally Worsened** — 1,009 non-domain vs 254 domain files (79.9%) | `find src -name *.ts ... ` |
| R-O3: 3,010 `console.*` calls | P2 | **Regressed** — 3,272 calls; structured logger in 125 files (was 149) | `grep -rc console\\. src` |
| R-D2: 674 try-without-catch | P2 | Not re-measured; no remediation commits | — |
| R-QX1: Startup noise | P2 | **Not Fixed** — same 15-line init dump on every command | same evidence as R-I1 |

**Net v3.8.13 remediation: 1 of 11 risks fixed (partial). Most P0/P1 risks persist.**

---

## S — Structure: 5/10 (Δ 0 from v3.8.13)

### File-Size Distribution

| Threshold | v3.9.13 | v3.8.13 | Δ |
|---|---|---|---|
| >2,000 lines | 1 (`src/learning/pattern-store.ts` @ 1,862 — just above prior max) | 0 | +1 |
| >1,000 lines | 92 | 91 | +1 |
| >500 lines | 447 | 442 | +5 |
| Project rule violations (>500 LOC) | 447 / 1,263 = 35.4% | 37.0% | slight improvement (ratio) |

**Top 11 largest files** (all ≥1,639 LOC):

1. `learning/pattern-store.ts` — 1,862 *(new to top-11; pushes past prior max)*
2. `domains/requirements-validation/qcsd-refinement-plugin.ts` — 1,861
3. `domains/contract-testing/services/contract-validator.ts` — 1,827
4. `domains/learning-optimization/coordinator.ts` — 1,778
5. `cli/completions/index.ts` — 1,778
6. `domains/test-generation/services/pattern-matcher.ts` — 1,769
7. `domains/chaos-resilience/coordinator.ts` — 1,704
8. `domains/test-generation/coordinator.ts` — 1,703
9. `domains/requirements-validation/qcsd-ideation-plugin.ts` — 1,699
10. `mcp/protocol-server.ts` — 1,641 *(grew from baseline; not in prior top-10)*
11. `domains/visual-accessibility/coordinator.ts` — 1,639

### DDD Layering

254 domain files vs 1,009 non-domain = **20.1% inside `domains/`** (vs 21.2% in v3.8.13). Sprawl continues: `src/governance/`, `src/coordination/`, `src/learning/`, `src/planning/`, `src/routing/`, `src/strange-loop/`, `src/causal-discovery/`, `src/early-exit/`, `src/feedback/`, `src/optimization/`, `src/performance/`, `src/benchmarks/`, `src/monitoring/`, `src/test-scheduling/`, `src/workflows/` — 15+ de-facto domains living outside the bounded-context boundary. The previous "31 orphan dirs = 40.2% of LOC" observation holds.

`src/migration/` + `src/migrations/` coexistence (v3.8.13 R-S3) persists.

### Risks

- **R-S1 (HIGH, unchanged)**: 447 files >500 LOC, 92 >1K, one crossed 1,800. No decomposition pressure.
- **R-S2 (MEDIUM, unchanged)**: 79.9% of source outside `domains/` — DDD claim in CLAUDE.md remains aspirational.
- **R-S3 (LOW, unchanged)**: `src/migration` + `src/migrations`.

---

## F — Function: 8.5/10 (Δ +0.5 from v3.8.13)

### Features Since v3.8.13 (all claims spot-checked against source)

| Version | Feature | Verified |
|---|---|---|
| v3.8.14 | (bump) | tag exists |
| v3.9.0 | Major bump — 91 commits of accumulated work | tag exists |
| v3.9.1 | Regex-special char escaping (CWE-1333) | commit c0fd0d84 |
| v3.9.2 | Fix patterns.rvf deadlock + CLI exit hang | commit 76383372 |
| v3.9.3 | Watchdog + lazy bootstrap + 5 init fixes | commits 1da5..8ea5 |
| v3.9.4 | Governance phase fix + `AQE_SKIP_CODE_INDEX` escape hatch | commits 8dd4..fed2 |
| v3.9.5 | HNSW-native disabled by default (deadlocks) | commit 3a1d9636 |
| v3.9.6 | CI failures unblock (hnswlib-node migration issue #399) | commit 65d55149 |
| v3.9.7 | Release-gate corpus + `--json` contract (#401) | commit 05dcfe92 |
| v3.9.8 | **qe-browser skill with Vibium engine (ADR-091)** | verified: `.claude/skills/qe-browser/SKILL.md` (15,933 bytes), `package.json` deps `"vibium": "^0.1.2"`, `node_modules/vibium/package.json` = v0.1.8 |
| v3.9.9 | qe-browser CodeQL regex-injection fixes + optionalTools | commits 3 x fix(qe-browser) |
| v3.9.10 | **ADR-092 provider-agnostic advisor strategy** | verified: `src/routing/advisor/{index,types,multi-model-executor,circuit-breaker,redaction,domain-prompts}.ts`; header reads `ADR-092: Provider-Agnostic Advisor Strategy for QE Agents` |
| v3.9.11 | Init detects upgrade when config.yaml missing | commit 6b7cf77e |
| v3.9.12 | **Init-duplication + hang fix**: `aqe init` no longer duplicates ruflo hooks | commit b25956f2 |
| v3.9.13 | **ADR-093 Opus 4.7 / Sonnet 4.6 / Haiku 4.5 migration** | verified: 99 occurrences of `claude-opus-4-7\|claude-sonnet-4-6\|claude-haiku-4-5` across 20 src files; `src/shared/llm/model-registry.ts` has all three; ADR-093 doc marks Status = Accepted; Phases 1/2/4 implemented |

**Earlier v3.8.x features still verified present**:
- Session caching: `src/optimization/session-cache.ts` exists, SHA-256 fingerprint, 500-entry LRU, SQLite persistence via `kv_store` namespace `session_cache`
- Economic routing: `src/routing/economic-routing.ts` exists with `TIER_COST_ESTIMATES` for booster/haiku/sonnet

### Build & Lint

| Operation | v3.9.13 | v3.8.13 |
|---|---|---|
| `npm run build` | **PASS** (clean; 1 residual empty-glob warning for `init/**/*-installer.js`) | PASS |
| `npm run lint` | **FAIL** — "linting 'tests', but all files matching the glob 'tests' are ignored" | FAIL (different error: CJS/ESM) |
| Output: `node dist/cli/bundle.js --version` | `3.9.13` | n/a |

### Stale Platform-Installer Warning

The build-time warning `import("../../init/${name}-installer.js") did not match any files` still fires. However, `dist/init/` *does* contain compiled installers (`kilocode-installer.js`, `cursor-installer.js`, `cline-installer.js`, `kiro-installer.js` verified). So the glob pattern is wrong, not the feature — the warning has been cosmetic for 10+ releases and nobody has fixed it.

### Risks

- **R-F1 (P1, was P0)**: Lint is still broken, though the failure mode changed. Config is `.eslintrc.cjs` (correct) but `npm run lint` attempts to lint a `tests` directory that is being ignored by the config. Zero local lint enforcement remains.
- **R-F2 (LOW, unchanged)**: Platform installer glob warning is cosmetic but uncorrected.
- **R-F3 (LOW, regressed)**: 3,272 `console.*` calls (was 3,010). Structured logger adoption dropped from 149 → 125 files. Logging discipline is going backwards.

---

## D — Data: 7/10 (Δ −0.5 from v3.8.13)

### `.agentic-qe/memory.db` — Actual State

| Attribute | Value |
|---|---|
| File size | 53.9 MB (memory.db) |
| `PRAGMA integrity_check` | **ok** |
| Total tables | 52 |
| `qe_patterns` | **468 rows** |
| `kv_store` | 5,019 rows |
| `captured_experiences` | 17,145 rows |
| `qe_trajectories` | 335 rows |
| `concept_nodes` | 5,032 rows |
| `concept_edges` | 69,883 rows |
| `goap_actions` | 2,325 rows |
| `embeddings` | 0 rows *(empty — suspect)* |
| `hypergraph_nodes / edges` | 0 / 0 *(empty — suspect)* |
| **Sum across main learning tables** | **~22,981 rows** |

**Reality check**: CLAUDE.md today says `"The .agentic-qe/memory.db contains 1K+ irreplaceable learning records — treat it like production data"`, which is consistent with the actual 468 `qe_patterns` rows and 22K-total across all tables. Earlier claims of **"150K+ irreplaceable learning records"** (referenced in the audit prompt) are not supported by the current database. Two co-existing DBs raise concern:

- `memory-aqe-root-Feb-27-2026.db` — 57.9 MB, stale Feb-27 snapshot
- `memory-corrupted.db` — 61.0 MB, March 19 (confirming the known corruption incident)
- `memory.db.bak-1773917709` — 61.0 MB, March 19 backup
- Active `memory.db` is *smaller* (53.9 MB) than the corrupted / backup versions, implying some data loss vs the pre-corruption state was accepted.

### Schema Validation

**Zod adoption still zero**: `grep -r "from 'zod'\|z\.object" src` = 0 matches. MCP-tool inputs, CLI flags, and cross-phase memory operations rely entirely on TypeScript compile-time types plus ad-hoc runtime checks. For a system that now ships the ADR-092 advisor taking LLM-produced JSON, the lack of runtime schema validation is the single biggest data-integrity gap.

### Risks

- **R-D1 (HIGH, unchanged)**: Zero Zod/runtime schema validation across 1,263 source files.
- **R-D2 (MEDIUM, unchanged)**: Try-without-catch count not re-measured; no commits addressing error-swallowing patterns.
- **R-D3 (MEDIUM, NEW)**: 3 co-located memory DBs (live + corrupted + February snapshot) in `.agentic-qe/` with no retention policy. Current memory.db is 53.9 MB vs 61 MB backup — some rows dropped during recovery.

---

## I — Interfaces: 7.5/10 (Δ +0.5 from v3.8.13)

### CLI

- Binary: `aqe` / `aqe-v3` / `agentic-qe` — all route to `dist/cli/bundle.js` (verified in package.json `bin` field). **Not "ruflo"** for this project's binary.
- 29 command files in `src/cli/commands/` (was 34 reported — one count likely included subdirs)
- `node dist/cli/bundle.js --version` returns clean `3.9.13`
- `aqe health` runs end-to-end in ~5 s, returns 14 idle domains, 53 agents

### MCP — Dual-Server Topology Resolved

The v3.8.13 report noted a "previous dual-server issue." Current state in `.mcp.json`:

```
mcpServers:
  ruflo:       command=npx, args=[-y, ruflo@3.5.18, mcp, start], autoStart=false
  agentic-qe:  command=node, args=[.../dist/mcp/bundle.js]
```

Two *distinct* MCP servers are declared with distinct roles — `ruflo` is the Claude-Flow coordination daemon, `agentic-qe` is the QE-tool surface. They are intentional, not a bug. The AQE MCP tool surface exposed via `mcp__agentic-qe__*` has **>80 tools** (verified against deferred-tools list — e.g., `qe_coverage_gaps`, `advisor_consult`, `model_route`, `pipeline_*`, `routing_economics`, `test_generate_enhanced`, `security_scan_comprehensive`).

### CLAUDE.md Staleness (User Feedback Confirmed)

**`ruflo` appears 14 times in CLAUDE.md** — every CLI example tells the user `npx ruflo swarm init`, `npx ruflo memory store`, etc. The user's explicit feedback (stored in agent memory) is: *"CLI binary is 'aqe' not 'ruflo' — CLAUDE.md has stale upstream refs."* This is a documentation-UX regression that has not been cleaned up. README.md is clean (zero `ruflo` hits), so the issue is isolated to CLAUDE.md. Representative stale lines:

- L136: `Run \`npx ruflo security scan\` after security-related changes`
- L204-207: `npx ruflo init --wizard` / `npx ruflo agent spawn` / `npx ruflo memory search`
- L247: `claude mcp add ruflo -- npx -y ruflo@3.5.18`

### Startup Noise (Still Bad)

`node dist/cli/bundle.js health` emits this **before** the 4-line answer:

```
Auto-initializing v3 system...
[AdversarialDefense] Guidance ThreatDetector loaded
[AdversarialDefense] Guidance CollusionDetector loaded
[INFO] [ParserRegistry] tree-sitter WASM parsers available for: python, java, csharp, rust, swift
[UnifiedMemory] Initialized: /workspaces/agentic-qe/.agentic-qe/memory.db
[HybridBackend] Initialized with unified memory: ...
[RVF] Shared adapter init failed: RVF error 0x0303: FsyncFailed
[ContinueGateIntegration] Guidance ContinueGate loaded
[QueenGovernance] Initialized with flags: [object Object]
[INFO] [QueenCoordinator] Governance adapter initialized
[INFO] [QueenCoordinator] Domain circuit breaker registry initialized
[INFO] [QueenCoordinator] Domain team manager initialized
[INFO] [QueenCoordinator] Fleet tier selector initialized
[INFO] [QueenCoordinator] Trace collector initialized
[INFO] [QueenCoordinator] Phase 4 modules initialized (hypotheses, federation, scaling)
[RealEmbeddings] Loading model: Xenova/all-MiniLM-L6-v2
[INFO] [QueenCoordinator] Dependency intelligence initialized {"agents":53,"mcpServers":2}
System ready
```

Two new leaks: **`[RVF] Shared adapter init failed: RVF error 0x0303: FsyncFailed`** is a silent error the user sees every command, and **`Initialized with flags: [object Object]`** is clearly a missed `JSON.stringify`. Neither is fatal but both are QX smells on a published binary.

### Risks

- **R-I1 (HIGH, unchanged)**: 15+ lines of init noise before useful output on every CLI invocation.
- **R-I2 (NEW, MEDIUM)**: Visible error on every startup (`RVF 0x0303: FsyncFailed`) that is non-fatal but user-visible. Either fix or route to debug-level.
- **R-I3 (NEW, LOW)**: `[object Object]` log line indicates a missing `JSON.stringify` in `QueenGovernance.init`.
- **R-I4 (NEW, MEDIUM)**: CLAUDE.md instructs users to use `npx ruflo ...` commands that do not exist in this project. All 14 references must be rewritten to `aqe`/`npx agentic-qe`.

---

## P — Platform: 5/10 (Δ 0 from v3.8.13)

### CI Matrix — Unchanged

Grep of all 12 workflows:

| Dimension | Actual | `engines` Claim |
|---|---|---|
| Node version | **`24.13.0` on every job** except `init-chaos` which uses `20` | `>=18.0.0` |
| OS | **Every `runs-on` is `ubuntu-latest`** (zero matches for macos-latest or windows-latest) | No claim |

Not a single workflow added macOS or Windows runs in the 21 days since v3.8.13. Not a single workflow added Node 18 / 20 / 22 testing. The `init-chaos.yml` workflow pinning Node 20 is the only hint of cross-version coverage, and it runs only on init-chaos triggers.

### Node_modules reality

`node_modules/vibium/package.json` version = **0.1.8** (published to npm), while `package.json` pins `"vibium": "^0.1.2"` and the `qe-browser` SKILL.md claims verification against `v26.3.18`. The SKILL.md's version string (26.3.18) does not correspond to any published Vibium release on npm today — a documentation drift for the qe-browser skill that users will run into.

### Risks

- **R-P1 (P0, unchanged)**: `engines >=18` unverified. Node 18/20/22 compatibility is claimed but untested in CI.
- **R-P2 (HIGH, unchanged)**: Zero macOS/Windows CI.
- **R-P3 (NEW, MEDIUM)**: qe-browser SKILL.md documents `Vibium v26.3.18` but installed version is `0.1.8`. Either the documentation is wrong or the version pin is, and the discrepancy will mislead users who upgrade.

---

## O — Operations: 7/10 (Δ −0.5 from v3.8.13)

### `aqe init` — v3.9.11 + v3.9.12 Fixes Verified

Four init-path fixes shipped to address user-reported regressions:

- **v3.9.11** (`6b7cf77e`): Detect upgrade when config.yaml is missing from prior install
- **v3.9.12** (`b25956f2`): Prevent `aqe init` from duplicating ruflo hooks *and* eliminate init hang
- **v3.9.2–v3.9.4**: patterns.rvf deadlock, phase 06 per-file watchdog, governance asset walk, AQE_SKIP_CODE_INDEX escape hatch
- **v3.9.5**: Native HNSW disabled by default due to deadlocks on certain inputs

This is a lot of fire-fighting in the init path. It indicates the init pipeline grew too complex and the v3.9.x patches are papering over phase-ordering issues rather than redesigning the sequence. The fact that v3.9.12 had to fix "duplicating ruflo hooks" suggests `aqe init` is writing to Claude Flow integration files without idempotency checks.

### ESLint — Moved, Still Broken

| State | v3.8.13 | v3.9.13 |
|---|---|---|
| Config file | `.eslintrc.js` (CJS, incompatible with `"type": "module"`) | **`.eslintrc.cjs`** (correct) |
| `npm run lint` exit code | Non-zero — `module is not defined in ES module scope` | **Non-zero — `all of the files matching the glob "tests" are ignored`** |

The v3.8.13 P0 was "fix ESLint". The fix renamed the file (good) but left the `eslint src tests --ext .ts` script pointing at a `tests` directory whose contents are being filtered out by an ignore rule. No `.eslintignore` file exists in the repo. Result: lint never ran cleanly in either version.

### CI Workflows

12 workflows (v3.8.13 had 9). New: `init-chaos.yml`, `init-corpus-mirror-test.yml`, `pr-template-check.yml`, `post-publish-canary.yml`. This is meaningful defense-in-depth for the init/release pipeline that matches the stated priority on `aqe init` stability.

### Risks

- **R-O1 (P0, unchanged)**: ESLint still broken locally — different error, same outcome.
- **R-O2 (NEW, MEDIUM)**: `aqe init` pipeline has absorbed 6+ hotfixes across v3.9.1–v3.9.5. Suggests root-cause is architectural (phase ordering), not tactical. Redesign may be cheaper than the next patch.
- **R-O3 (MEDIUM, regressed)**: 3,272 console calls (up from 3,010), structured logger in 125 files (down from 149). Logging discipline regressed across the 21-day sprint.

---

## T — Time: 6/10 (Δ −0.5 from v3.8.13)

### Release Velocity

| Metric | v3.9.13 | v3.8.13 |
|---|---|---|
| Releases since baseline | **13** (v3.8.14, v3.9.0–v3.9.13) | 10 |
| Window | 21 days | 11 days |
| Avg cadence | 1.6 days | 1.1 days |
| Non-merge commits | 91 | 50 |
| Lines changed | +65,679 / −8,775 (net +56,904) | +27,484 / −13,650 |

Cadence slowed slightly, but net line delta nearly doubled. v3.9.0 was the first minor bump in the v3.x line — appropriate, since qe-browser, advisor strategy, and model migration are each minor-scope features. After v3.9.0 however, the fleet fell back to patch-version-as-feature-vehicle (v3.9.8 added Vibium engine as a patch; v3.9.10 added ADR-092 advisor strategy as a patch; v3.9.13 landed ADR-093 model migration as a patch). By strict SemVer, at least two of those warrant minor bumps.

### ADR Discipline — Materially Improved

Three ADRs shipped with full lifecycle traceability:

- **ADR-091** (qe-browser, Proposed 2026-04-08): 5 implementation phases + devil's-advocate review, documented on disk
- **ADR-092** (advisor strategy, Proposed 2026-04-11): Phase 0/0a trial reports, multi-model trial report, statistical test, all JSON artefacts preserved in `scripts/`
- **ADR-093** (model migration, Accepted 2026-04-17): Status-table with commit-SHA traceability from `3ee1fbf5`..`1aac5206`, Phase 3 explicitly justified as "not required", Phases 5–6 scheduled

This is the best ADR discipline this project has shown. The process worked end-to-end for three non-trivial changes in three weeks.

### Risks

- **R-T1 (MEDIUM, worsened)**: 13 releases in 21 days; major feature work (ADR-091/092/093) shipped as patches. Consumers pulling `^3.9.0` get behavioral changes (new advisor routing, new model names, new browser skill) without semver signal.
- **R-T2 (LOW, unchanged)**: Rapid cadence interleaves security fixes (v3.9.1 CWE-1333) with feature releases. Consumers on older pins may miss security content unless they track weekly.

---

## QX — Quality Experience: 6/10 (Δ 0)

### Onboarding

`aqe init` has seen 6 hotfixes in 21 days addressing real user friction (hangs, duplicate hooks, missing asset walk). The *pain* is being addressed; the *architecture that causes the pain* is not. `aqe init --wizard` and `--auto` still exist and still work.

### Color / NO_COLOR

Chalk usage: **1,656 calls across src**. `NO_COLOR` / `noColor` references: **2 files, 1 reference** (`src/cli/config/cli-config.ts`). The v3.8.13 report cited 7% adoption — v3.9.13 is worse, effectively ~0.1%. The `NO_COLOR` environment variable (standard since 2018) is not honored across the CLI, making it impossible to pipe `aqe` output into tools that choke on ANSI escapes.

### Error Messages

New QX smells introduced since v3.8.13:

- `[RVF] Shared adapter init failed: RVF error 0x0303: FsyncFailed` — visible on every command
- `[QueenGovernance] Initialized with flags: [object Object]` — stringify bug
- `npm run lint` error message (`all of the files matching "tests" are ignored`) gives no hint how to fix the underlying `--ext .ts` + ignore-rule interaction

### Docs Freshness

- CLAUDE.md: 14 stale `ruflo` references (user reported this in personal memory on March feedback — unaddressed in 21 days)
- `qe-browser` SKILL.md: documents Vibium v26.3.18, installed 0.1.8
- README.md: clean (no stale refs)

### Risks

- **R-QX1 (HIGH, unchanged)**: CLI startup noise unchanged; two *new* visible error/debug leaks added.
- **R-QX2 (HIGH, NEW)**: `NO_COLOR` effectively not adopted — 1 reference across 1,656 chalk calls.
- **R-QX3 (MEDIUM, NEW)**: CLAUDE.md documents a binary (`ruflo`) that does not ship with this project. First-run users running `npx ruflo init` will hit npm's registry and install a different package.
- **R-QX4 (MEDIUM, NEW)**: qe-browser SKILL.md's Vibium version claim does not match the pinned dependency.

---

## Score Summary

| Factor | v3.9.13 | v3.8.13 | Δ | Key Evidence |
|---|---|---|---|---|
| Structure | 5 | 5 | 0 | 92 >1K LOC (+1); 447 >500 LOC (+5); first file crossed 1,800; 79.9% non-domain |
| Function | 8.5 | 8 | +0.5 | 3 ADRs shipped (091/092/093), all verified in code; build clean; lint still broken |
| Data | 7 | 7.5 | −0.5 | 22,981 live rows (not 150K); integrity ok; zero Zod; 3 DBs in `.agentic-qe/` |
| Interfaces | 7.5 | 7 | +0.5 | MCP dual-server intentional and working; 80+ AQE MCP tools; startup noise + CLAUDE.md `ruflo` drift |
| Platform | 5 | 5 | 0 | Zero macOS/Windows, zero Node 18/20/22; vibium version doc drift |
| Operations | 7 | 7.5 | −0.5 | Init pipeline absorbed 6 hotfixes; lint config fixed but script still fails; logging regressed |
| Time | 6 | 6.5 | −0.5 | 13 releases / 21d; major features shipped as patches; ADR discipline up |
| QX | 6 | 6 | 0 | NO_COLOR effectively absent; 14 stale `ruflo` refs in CLAUDE.md; new error leaks visible on every command |
| **Composite** | **6.6** | **6.4** | **+0.2** | Feature/ADR discipline up; lint, platform matrix, logging, doc freshness flat-to-down |

---

## Top 10 Risks (Prioritized for v3.9.14+)

| # | Risk | Factor | Severity | Description |
|---|---|---|---|---|
| 1 | R-F1 | Function/Ops | **P0** | `npm run lint` still fails (different error than v3.8.13, same outcome). Fix the `eslint src tests --ext .ts` script: add `.eslintignore` or change args. |
| 2 | R-P1 | Platform | **P0** | `engines: ">=18.0.0"` but CI pins Node 24.13.0 on every job. Add Node 18/20/22 matrix to at least `optimized-ci.yml` before next release. |
| 3 | R-QX3 | QX/Docs | **P0** | CLAUDE.md instructs users to run `npx ruflo ...` commands; the binary is `aqe`. 14 occurrences. User has flagged this personally. Rewrite in one commit. |
| 4 | R-D1 | Data | P1 | Zero Zod validation on MCP inputs, advisor outputs, CLI flags. Start with `advisor_consult` and `fleet_init` schemas. |
| 5 | R-P2 | Platform | P1 | Zero macOS/Windows CI. Adding `macos-latest` to `optimized-ci.yml` is a 3-line change. |
| 6 | R-I1 + R-I2 | Interfaces | P1 | 15-line startup noise + visible `RVF 0x0303: FsyncFailed` error on every command + `[object Object]` log. Gate non-fatal init logs behind `AQE_VERBOSE`. |
| 7 | R-O2 | Operations | P1 | `aqe init` has absorbed 6 hotfixes in 21 days. The phase ordering is fragile. Consider redesigning with explicit DAG and idempotent writes. |
| 8 | R-QX2 | QX | P1 | NO_COLOR is 2 refs vs 1,656 chalk calls. Introduce `src/cli/output.ts` wrapper; rewrite callers. |
| 9 | R-F3 / R-O3 | Function/Ops | P2 | Logging discipline regressed: 3,272 console calls (+262), structured-logger files 125 (−24). Reverse the trend. |
| 10 | R-D3 | Data | P2 | 3 memory DBs in `.agentic-qe/` (live 54MB, corrupted 61MB, Feb snapshot 58MB). Retention policy and cleanup script needed — data-safety risk per CLAUDE.md rules. |

---

## Recommended Improvements

### Immediate (P0, before v3.9.14)

1. **Make `npm run lint` pass**: add `.eslintignore` or rewrite the script to exclude ignored files.
2. **Add Node matrix to `optimized-ci.yml`**: `[18.x, 20.x, 22.x, 24.x]`.
3. **Rewrite 14 `ruflo` refs in CLAUDE.md** to `aqe` / `npx agentic-qe`.

### Short-term (P1, within 2 weeks)

4. **Zod schemas on MCP tool inputs**: start with the 5 most-used tools (`advisor_consult`, `fleet_init`, `aqe_health`, `memory_store`, `test_generate_enhanced`).
5. **Add macOS + Windows to key workflows**: `optimized-ci.yml` and `npm-publish.yml`.
6. **Silence startup**: gate `[AdversarialDefense]`, `[QueenCoordinator]`, `[RVF]` init logs behind `AQE_VERBOSE=1`. Fix the `[object Object]` stringify bug in `QueenGovernance.init`.
7. **Redesign `aqe init` phase ordering**: move from procedural sequence to explicit DAG with idempotency assertions; stop catching upgrade cases in hotfixes.

### Medium-term (P2, within a quarter)

8. **NO_COLOR adoption**: wrap chalk in an output helper that checks `process.env.NO_COLOR`.
9. **DDD cleanup**: either move `governance/`, `coordination/`, `learning/`, `planning/`, `routing/`, `strange-loop/` under `domains/`, or update CLAUDE.md to describe the hybrid reality.
10. **File-size attack**: decompose the 11 files >1,600 LOC. `pattern-store.ts` at 1,862 is a good first target since it owns a single learning concept.

---

## Methodology Notes

- Analyzed on `working-april` branch at commit `4742c41f` (HEAD of main after PR #429 merge).
- File counts exclude `*.test.ts` and `*.spec.ts`.
- Line counts via `wc -l`.
- CI grep covers all 12 `.github/workflows/*.yml`.
- Build: `npm run build` — PASS.
- Lint: `npm run lint` — FAIL (documented above).
- Memory DB inspection via `sqlite3` directly on `.agentic-qe/memory.db`; integrity check passed; no rows modified during audit (read-only queries).
- Feature verification: each of the v3.8.14→v3.9.13 feature claims was spot-checked against source or commit. Four claims verified in depth (ADR-091 qe-browser, ADR-092 advisor, ADR-093 model migration, session caching).
- Baseline comparison uses v3.8.13 SFDIPOT report at `docs/qe-reports-3-8-13/05-product-qx-sfdipot-report.md`.
