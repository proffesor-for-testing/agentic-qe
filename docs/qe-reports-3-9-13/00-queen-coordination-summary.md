# QE Queen Coordination Summary — v3.9.13

**Date**: 2026-04-20
**Version**: 3.9.13 (baseline: v3.8.13, 10 patch releases elapsed)
**Swarm Size**: 11 specialized agents + 1 Queen coordinator
**Topology**: Hierarchical (Queen-led parallel execution)
**Shared Memory Namespace**: aqe/v3/qe-reports-3-9-13
**Reports Generated**: 12 (11 domain reports + this summary)

---

## Executive Summary

AQE v3.9.13 is the **first release in four measurement cycles where the composite score improves and the honesty score reverses its multi-release decline**. The release delivered the single biggest structural fix in the project's audit history: `.github/workflows/npm-publish.yml` now gates the publish step on `needs: [build, pre-publish-gate, tests-on-tag-sha]`, and v3.9.13 shipped through all four gates green (run 24578317724, SHA 4742c41f). The v3.8.13 #1 CRITICAL — dual MCP server divergence — is also fully retired: `src/mcp/server.ts` was deleted. Top complexity hotspot `calculateComplexity` was decomposed 13×. Skip debt was cut from 72 to 30. CI went from **3/10 → 7.5/10 (+4.5)**, the largest single-dimension gain ever recorded.

However, the release introduced one new release-blocker: `npm audit --omit=dev` reports **15 CRITICAL runtime vulnerabilities** (was 0 at v3.8.13), all traced to `protobufjs <7.5.5` (CWE-94 arbitrary code execution, GHSA-xq3m-2v4x-88gg) reaching production through `@xenova/transformers → @claude-flow/guidance + @claude-flow/browser`. The tarball also ballooned 79% (11.1 MB → 19.9 MB) because `build-cli.mjs` enabled code-splitting without a pre-build clean, shipping 799 stale chunks.

**Net assessment**: Structural foundations (CI discipline, MCP contract integrity, top hotspot cleanup) are the strongest they have ever been. Supply-chain posture is the weakest it has ever been. Ship decision depends on whether the protobufjs override and tarball clean can land before v3.9.14.

---

## Overall Quality Scorecard

| Dimension | v3.8.13 | v3.9.13 | Delta | Trend |
|-----------|--------:|--------:|------:|-------|
| **Code Complexity** | 6.5/10 | 7.0/10 | +0.5 | Improving (4 cycles) |
| **Security** | 7.5/10 | 6.8/10 | -0.7 | Regression (supply chain) |
| **Performance** | 8.9/10 | 9.0/10 | +0.1 | Still strongest |
| **Test Quality** | 5.5/10 | 6.0/10 | +0.5 | Recovering |
| **Product/QX** | 6.4/10 | 6.6/10 | +0.2 | Slow progress |
| **Dependency/Build** | 7.8/10 (B+) | 5.5/10 (C) | -2.3 | Sharp regression |
| **API Contracts** | 5.5/10 | 7.0/10 | +1.5 | Strong recovery |
| **Architecture/DDD** | 6.6/10 | 6.4/10 | -0.2 | Orphan drift |
| **Accessibility** | 7.7/10 | 7.7/10 | 0.0 | Stagnant |
| **CI Health** | 3.0/10 | 7.5/10 | +4.5 | **Largest gain ever** |
| **Honesty Score** | 68/100 | 74/100 | +6.0 | **First reversal in 5 cycles** |
| **COMPOSITE** | **6.9/10** | **7.0/10** | **+0.1** | **Slight improvement** |

---

## Swarm Agent Results

### Report 01 — Code Complexity & Smells
**Agent**: `qe-code-complexity` | **Score**: 7.0/10 (+0.5)

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|--------:|--------:|------:|
| Source files (`src/**/*.ts`) | 1,195 | 1,263 | +5.7% |
| Total LOC | ~549K | ~564,564 | +2.8% |
| Files >500 lines | 442 | 447 | +1.1% |
| Critical functions (CC>50) | 11 | 16 | +45% |
| High complexity (CC 20-49) | 115 | 113 | -1.7% |
| Functions >100 lines | 147 | 139 | -5.4% |
| `console.*` calls | 3,143 | 3,278 | +4.3% (tracks file growth) |
| `as any` casts | 4 | 18 | +350% |
| `as unknown as` casts | 43 | 136 | +216% |
| Silent catch blocks | 36 | 5 | **-86%** |
| `toErrorMessage()` adoption | 620+ | 439 | Regression — investigate |
| Files with >100 decision points | 132 | 61 | **-54%** |

**Major wins**: `calculateComplexity` (defect-predictor.ts) decomposed from CC=104/526 lines → CC=8/58 lines (13×). `extractJson` (flaky-detector.ts): 652 → 52 lines. `multi-language-parser.ts` nesting depth 348 → 30. `registerAllTools` 778 → 416 lines. Silent catches dropped 86%.

**New concerns**: Type-safety regression — `as any` up 350%, `as unknown as` up 216% (43 in protocol-server.ts unchanged, +93 new elsewhere — 6 in rvf-migration-coordinator.ts, 3 in ADR-092 llm-router.ts). New 1,023-line `validateGraphQLSchema` function. 4 new functions with >7 parameters.

**ADR-092 advisor**: Well-decomposed (6 files, 830 LOC, zero hotspots) — exemplary structure.

---

### Report 02 — Security Analysis
**Agent**: `qe-security-scanner` | **Score**: 6.8/10 (-0.7)

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|--------:|--------:|------:|
| **Critical (runtime)** | 0 | **15** | **RELEASE BLOCKER** |
| High | 2 | 1 | Improved |
| Medium | 8 | 6 | Improved |
| Low | 5 | 4 | Improved |
| Overall risk | MEDIUM | **MEDIUM-HIGH** | Supply chain |
| `process.exit()` | 41 | 52 | +27% |
| `Math.random()` | 28 | 31 | +11% |

**C-01 NEW CRITICAL (release blocker)**: 15 runtime vulns via `protobufjs <7.5.5` (CWE-94 arbitrary code execution, GHSA-xq3m-2v4x-88gg). Chain: `@claude-flow/browser` + `@claude-flow/guidance` + `@xenova/transformers` → `onnxruntime-web` → `onnx-proto` → `protobufjs`. Fix: add `overrides: { "protobufjs": "^7.5.5" }` to package.json.

**M-01 NEW MEDIUM**: `aqe learning repair -f <path>` interpolates user-supplied path into `execSync` shell commands at `learning.ts:1236-1242` — local CLI command injection.

**v3.8.13 fixes verified intact**:
- Command injection in test-verifier.ts (execFile + ALLOWED_TEST_COMMANDS allowlist) ✓
- SQL allowlist sync (51 tables, unified validateTableName at all 5 sites) ✓
- LIMIT/OFFSET parameterized in witness-chain.ts:248-257 ✓ (H-02 resolved)

**ADR-092/093 clean**: Advisor uses regex redaction, provider allowlist (OpenRouter excluded for qe-security/qe-pentest), SHA-256 hashing, no eval of model output. ADR-093 cyber-pin gates Opus 4.7 for security agents behind `AQE_CYBER_VERIFIED=true`. No hardcoded secrets, no `eval`/`new Function` in app code. **qe-browser skill** ships exemplary `safeRegex` (type/length/allowlist/try-catch) — recommend porting to core.

---

### Report 03 — Performance Analysis
**Agent**: `qe-performance-reviewer` | **Score**: 9.0/10 (+0.1)

**Major win**: CLI bundle restructured from 7.0 MB monolithic file into **12 KB thin loader + 799 lazy-loaded chunks** — fixes PERF-10-04 (CLI static imports), a 4-cycle carried finding. MCP bundle grew modestly to 7.18 MB.

**All 8 v3.7.0 fixes INTACT**: MinHeap, CircularBuffer, taskTraceContexts bound, hashState copy-before-sort, cloneState manual clone, BinaryHeap in HNSW — verified via direct reads.

**Regressions (v3.8.13 findings NOT fixed)**:
- SessionOperationCache O(n) eviction at `session-cache.ts:220-230` — still scans all 500 entries on every set at capacity
- e-prop rewardHistory push+shift at `eprop-learner.ts:240-243` — should use CircularBuffer
- SONA PatternRegistry O(n log n) sort on every eviction (carried 3+ cycles)

**5 new findings**:
1. MEDIUM: `routing-feedback.ts:67-74` OutcomeStore does `slice(-10000)` on every add at capacity — 10K copies per call
2. LOW: ADR-092 advisor circuit-breaker sync I/O per call
3. LOW: advisor sidecar `readdirSync` on every routing outcome
4. LOW: new push+shift patterns in sona-three-loop training
5. INFORMATIONAL: advisor consultations directory unbounded on disk

**ADR-092/093**: Advisor strategy is bounded (10-call circuit breaker) but adds file-based IPC in warm path.

---

### Report 04 — Test Quality & Coverage
**Agent**: `qe-coverage-specialist` | **Score**: 6.0/10 (+0.5)

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|--------:|--------:|------:|
| Test files | 730 | 777 | +6.4% |
| Test-to-source ratio | 0.60 | 0.63 | +0.03 |
| `.skip` / `.only` count | 72 | **30** | **-58.3%** |
| `.only()` | — | 0 | Clean |
| E2E test cases | 346 | 323 | -6.6% |
| enterprise-integration coverage | 9% | 9% | **Frozen 5 releases** |
| test-execution coverage | 16.7% | 18.2% | +1.5pp |
| requirements-validation coverage | 25% | 25% | Flat |
| Files missing afterEach | 113 | 186 | +65% (regression) |
| Property-based test files | 1 | 1 | **Stuck 3 releases** |
| Mutation testing (Stryker) | absent | absent | No progress |
| Assertions per test | 2.01 | 2.09 | +0.08 |

**Strongest improvement**: skip debt cut 58.3% (72 → 30). Of 30 remaining: 9 quarantined-for-cause, 10 browser/env-gated, 5 deferred-feature, 1 load-gated, 5 need triage.

**Persistent crisis**: Enterprise-integration freeze unbroken for **5th consecutive release**. All 6 critical services (sap, odata, soap-wsdl, esb-middleware, message-broker, sod-analysis) still have zero tests. test-execution components (browser-orchestrator, step-executors, retry-handler) still zero tests — only adaptive-locator gained one.

**TDD adherence on new code**: 8/15 sampled = 53%. cli/commands/plugin/workflow/lazy-registry, hooks/security/*, RVF migration layer, hnsw-legacy-bridge all ship untested.

---

### Report 05 — Product/QX (SFDIPOT)
**Agent**: `qe-product-factors-assessor` | **Composite Score**: 6.6/10 (+0.2)

| Factor | v3.8.13 | v3.9.13 | Delta |
|--------|--------:|--------:|------:|
| Structure | 5/10 | 5/10 | 0 |
| Function | 8/10 | 8/10 | 0 |
| Data | 7.5/10 | 7/10 | -0.5 |
| Interfaces | 7/10 | 7/10 | 0 |
| Platform | 5/10 | 5/10 | 0 |
| Operations | 7.5/10 | 7.5/10 | 0 |
| Time | 6.5/10 | 7/10 | +0.5 |
| QX | 6/10 | 6/10 | 0 |

**v3.8.13 P0 partial fix**: ESLint config renamed `.eslintrc.js → .eslintrc.cjs` — but `npm run lint` still fails with "tests glob ignored" error. Zero net enforcement.

**Verified new features**: ADR-091 qe-browser skill with Vibium 0.1.8 (v3.9.8), ADR-092 advisor strategy (v3.9.10, `src/routing/advisor/*`), ADR-093 Opus 4.7/Sonnet 4.6/Haiku 4.5 migration (v3.9.13, 99 occurrences across 20 files).

**Data reality check**: `.agentic-qe/memory.db` integrity OK. 22,981 rows across learning tables (not 150K as previously claimed, not 1K+ as currently claimed). `qe_patterns`=468, `captured_experiences`=17,145. Three DBs co-exist (live 54MB + corrupted 61MB + Feb snapshot 58MB) with no retention policy.

**Top P0s for v3.9.14**: (1) Make `npm run lint` actually pass. (2) Add Node 18/20/22 CI matrix — still Ubuntu+Node24 only. (3) Rewrite 14 stale `ruflo` → `aqe` references in CLAUDE.md.

---

### Report 06 — Dependency & Build Health
**Agent**: `qe-dependency-mapper` | **Grade**: **C** (was B+)

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|--------:|--------:|------:|
| CLI bundle (primary file) | 7.0 MB | 12 KB loader + 799 chunks | Restructured |
| MCP bundle | 6.8 MB | 7.18 MB | +5.6% |
| **npm tarball** | 11.1 MB | **19.9 MB** | **+79%** |
| Unpacked size | 54 MB | 88.5 MB | +64% |
| Circular deps | 9 | 12 | +33% (regression) |
| Runtime vulns (npm audit --omit=dev) | 0 | **15 CRITICAL** | Supply chain |
| devDep vulns | 7 | varies | — |
| Hardcoded "3.0.0" version refs in src/ | 2 | 15 | +650% |
| Bundle minification | ON | ON | Held |

**Two critical regressions**:
1. 15 CRITICAL runtime vulns (same as Security 02 C-01 — protobufjs chain)
2. Tarball +79% — root cause: `build-cli.mjs` enables code-splitting but has no pre-build clean, so `dist/cli/chunks/` accumulates across builds. 799 chunks shipped, only 240 fresh.

**v3.8.13 P1 remediation partial**: Two originally-flagged faker imports (swift-testing-generator.ts, base-test-generator.ts) are gone, but `services/test-data-generator.ts:8` still statically imports `@faker-js/faker` (still devDep-only — bundled). `@claude-flow/guidance@3.0.0-alpha.1` still pinned in prod deps.

**Two 5-minute fixes restore Grade B**: add `overrides: { "protobufjs": "^7.5.5" }` to package.json + add `rimraf dist/cli/chunks` to build-cli.mjs.

---

### Report 07 — API Contracts & Integration
**Agent**: `qe-integration-reviewer` | **Score**: 7.0/10 (+1.5)

**Major win**: `src/mcp/server.ts` was deleted — dual-server divergence (v3.8.13 #1 CRITICAL) is fully retired. Both remaining servers now read `version` from package.json (startup confirms `v3.9.13`). Live MCP handshake against `aqe mcp` enumerates **86 tools (60 hardcoded + 26 QE bridge)**, matching startup log.

**v3.8.13 remediation table**:

| v3.8.13 Item | Severity | v3.9.13 Status |
|--------------|----------|----------------|
| Dual MCP server divergence | CRITICAL | **FIXED** — server.ts deleted |
| 43 `as unknown as` in protocol-server.ts | CRITICAL | **UNCHANGED** (47 total in src/mcp/, +4) |
| Hardcoded version `3.0.0` | HIGH | **FIXED** — both servers now dynamic |
| MCP params missing required:true | HIGH | **PARTIAL** — 12 still optional |
| 124 `.on()` vs 26 cleanup | HIGH | **UNCHANGED** (123/26/0) |
| E2EExecuteTool dead code | HIGH | **UNCHANGED** |
| Zod adoption | MEDIUM | **UNCHANGED** — zero |

**New findings (v3.9.13)**:
- F-01 CRITICAL: `advisor_consult` contract (ADR-092) — both `agent` and `task` params fall back to empty-string when missing, then shell out to `aqe llm advise`
- handleShutdown still fires `process.exit(0)` without awaiting `this.stop()`
- `process.exit()` in mcp/ grew 41 → 49

**Weighted score**: 18.0 (findings weighted by severity). Tool inventory parity confirmed via live handshake.

---

### Report 08 — Architecture & DDD Health
**Agent**: `qe-code-intelligence` | **Score**: 6.4/10 (-0.2)

| Dimension | v3.8.13 | v3.9.13 | Delta |
|-----------|--------:|--------:|------:|
| Bounded Context Health | 8/10 | 8/10 | 0 |
| Dependency Direction | 7/10 | 7/10 | 0 |
| Module Cohesion | 5/10 | 5/10 | 0 |
| Layer Separation | 6.5/10 | 6/10 | -0.5 |
| Overall | 6.6/10 | 6.4/10 | -0.2 |

**Verified**: Cross-domain imports **remain at zero** (13×13 matrix grep). MCP/CLI boundary fix from v3.8.13 held — zero imports from `src/mcp/` or `src/cli/` into `src/domains/`. Other boundary imports unchanged (integrations 98, coordination 66, logging 64, learning 7).

**Regression**: Orphan LOC share grew 40.2% → **41.6%** (235,781 lines across **34 dirs**, +3 new: `plugins/`, `persistence/`, `boot/`). `coordination/` now 56,259 lines — functioning as a shadow application layer. 33 god-files >1K lines in domains unchanged (91 project-wide).

**Honesty confirmation**: Domain-level structured logger adoption holds (23 console in 12 domain files) but project-wide went **3,147 → 3,405 console.* calls (+8.2%)**, LoggerFactory 255 (13.4:1 ratio). The v3.8.13 "biggest single improvement" narrative was scoped-misleading.

**DomainServiceRegistry still 5/13**. Direct `new Service()` only modestly down 121 → 113.

**ADR-092**: advisor code lives in orphan `src/routing/advisor/` (830 LOC) — correct as cross-cutting, wrong location. **ADR-093**: pure config migration in `shared/llm/` — no DDD impact.

---

### Report 09 — Accessibility Audit
**Agent**: `qe-accessibility-auditor` | **Score**: 7.7/10 (0.0)

| Category | v3.8.13 | v3.9.13 | Delta |
|----------|--------:|--------:|------:|
| CLI Accessibility | 7/10 | **6/10** | -1 (regression) |
| HTML Output | 5/10 | 5/10 | 0 |
| Testing Maturity | 8/10 | 9/10 | +1 |
| WCAG Coverage | 8/10 | 8/10 | 0 |
| A2UI Layer | 9/10 | 9/10 | 0 |
| Domain Architecture | 9/10 | 9/10 | 0 |

**Positives**: Accessibility test cases doubled (290 → 610, +110%). JSON output mode broadly available (52 sites across 15 CLI files), giving screen-reader users a clean consumption path.

**Negatives — all v3.8.13 gaps persist or worsened**:
- **Chalk color-gate regressed**: 1,066 → **1,642 method calls (+54%)**, 30 → 51 files importing chalk (+70%), while `shouldUseColors()` gained only 2 real consumers. `NO_COLOR=1` even less effective now.
- HTML `formatAsHtml()` byte-identical to v3.8.13 — still `<html><body><pre>...`, no DOCTYPE/title/lang/skip-nav/focus-styles. Two releases stagnant.
- Screen reader tests still zero — now **3 releases of declared-but-unimplemented** capability (MCP `includeScreenReader` parameter advertises what doesn't exist).
- `--no-color` CLI flag still absent, color-only status (green/red/yellow bullets) still violates WCAG 1.4.1.

**ARIA roles authoritatively recounted at 71** (stable; historical 82/96 were methodology artifacts).

**Remediation rate v3.8.13 → v3.9.13**: 0 of 7 applicable gaps closed.

---

### Report 10 — Brutal Honesty Audit
**Agent**: `qe-devils-advocate` | **Honesty Score**: **74/100 (+6)**

**First reversal in 5 measurements** (82 → 78 → 72 → 68 → 74). The reversal is carried almost entirely by one real structural fix: `.github/workflows/npm-publish.yml` now gates publish on `needs: [build, pre-publish-gate, tests-on-tag-sha]` (L228-237). v3.9.13 publish run 24578317724 (SHA 4742c41f) passed all four gates including unit tests. v3.8.13's worst finding is genuinely resolved.

**Claims that still don't survive grep**:
1. "60 specialized QE agents" (README + package.json + ADR-093) — repo ships **53**.
2. ADR-093 "migration complete" — 22 live retiring-model refs remain in src/ (constants.ts:608 hardcodes `claude-3-haiku-20240307` at tier 1; 5 domain services mirror it; Haiku 3 retirement will 404 them).
3. CLAUDE.md "1K+ irreplaceable learning records" — pendulum swung from overclaim (150K) to vague-but-still-wrong. `qe_patterns=468`, recovered from 129 but still 97% short of February's 15,625.
4. Structured logger — **3,272 console vs 1 logger import** at project scope (worse than v3.8.13's 21.7:1).
5. 500-line limit — **446 files violate** (up from 442). Top file 1,862 LOC.
6. Mar 19 DB corruption still undocumented; `memory-corrupted.db` (61MB) still sitting next to live DB.

**Genuinely honest improvements**:
- qe-browser eval self-declares "design-spec, NOT runnable"
- ADR-092 admits OpenRouter is a proxy, not an independent provider
- Devil's-advocate feedback visible in commits 1aac5206 and 4a641e7e (C1-C4 critical findings addressed pre-merge)

---

### Report 11 — CI Deep Analysis
**Agent**: `cicd-engineer` | **Score**: **7.5/10 (+4.5)** — Largest single-dimension gain in audit history

**P0 from v3.8.13 FULLY RESOLVED**:
- npm publish now gates on tests (`needs: [build, pre-publish-gate, tests-on-tag-sha]`)
- v3.9.13 shipped through all 4 gates green
- New `post-publish-canary.yml` re-runs 4-fixture init corpus against live npm tarball after publish
- `publish-v3-alpha.yml` **deleted** — alpha-misuse risk structurally closed
- `optimized-ci.yml`: 0/10 → 5/10 success (no more `continue-on-error` on test steps; sharded journeys)
- `mcp-tools-test.yml`: now 10/10 success
- `actionlint` clean on all 12 workflow files (satisfies feedback_actionlint_for_workflows memory rule)

**P1 unresolved**:
- `qcsd-production-trigger.yml` still `git push`es to protected `main` — 8/10 failures, unchanged since v3.8.13
- `init-chaos.yml` 0/2 failing on `npm install`

**P2**:
- No Node matrix (18/20/22/24 untested despite `engines: ">=18.0.0"`)
- No macOS/Windows runners
- 80+ actions on floating `@v4` tags (zero SHA-pinned)
- No `.github/dependabot.yml`

---

## Priority Matrix

### P0 — Release Blockers (v3.9.14)

1. **15 CRITICAL runtime npm vulns** — add `overrides: { "protobufjs": "^7.5.5" }` to package.json to break the `@xenova/transformers → @claude-flow/*` chain (GHSA-xq3m-2v4x-88gg CWE-94). (Security C-01, Dependency)
2. **Tarball bloat 79%** — add `rimraf dist/cli/chunks` to build-cli.mjs before code-split step so only fresh chunks ship. (Dependency)
3. **22 retiring-model refs** in src/ including `claude-3-haiku-20240307` hardcoded at `constants.ts:608` tier 1 — Haiku 3 retirement will 404 these paths. (Honesty, ADR-093)
4. **ESLint still broken** — `.eslintrc.cjs` rename fixed the ESM error but `npm run lint` still fails with "tests glob ignored". Zero lint enforcement. (Product/QX)
5. **`advisor_consult` contract bug** (ADR-092) — empty-string fallbacks for `agent` and `task` then shell out to `aqe llm advise`. (API Contracts F-01)

### P1 — Next Sprint

6. **43 `as unknown as` in protocol-server.ts** — unchanged since v3.8.13. Bypasses type checking at MCP boundary. (API Contracts)
7. **Command injection in `aqe learning repair`** — `learning.ts:1236-1242` interpolates user path into execSync. (Security M-01)
8. **SessionOperationCache O(n) eviction** — still not fixed, carried from v3.8.13. (Performance)
9. **`test-data-generator.ts:8` still imports @faker-js/faker** — bundled at build time despite devDep move. (Dependency)
10. **Remove `@claude-flow/guidance@3.0.0-alpha.1`** from production deps — carried from v3.8.13. (Dependency)
11. **Enterprise-integration coverage frozen 5 releases** — 6 services with zero tests. Needs dedicated sprint. (Test Quality)
12. **Fix `qcsd-production-trigger.yml`** — stops pushing to protected main. (CI)
13. **Wire `shouldUseColors()` into remaining 49 chalk files** — adoption regressed: 1,642 calls now bypass the gate. (Accessibility)
14. **Listener leaks** — 123 `.on()` vs 26 cleanup vs 0 setMaxListeners, unchanged. (API Contracts)
15. **14 stale `ruflo` refs in CLAUDE.md** — CLI binary is `aqe`. (Product/QX)

### P2 — Medium Term

16. Test skip debt audit the remaining 30 skips (5 need triage).
17. Orphan LOC grew to 41.6% (34 dirs, 235K lines) — especially coordination/ (56K lines).
18. Node 18/20/22 CI matrix (still Ubuntu+Node24 only).
19. macOS/Windows CI runners.
20. Property-based testing recovery (still 1 file, 3 releases stuck).
21. Mutation testing via Stryker — not configured.
22. Files missing afterEach regressed 113 → 186.
23. HTML report accessibility (WCAG 2.4.1, 2.4.7, 3.3.2 still gapped).
24. Three DBs co-exist (live 54MB + corrupted 61MB + Feb snapshot 58MB) — document or archive.
25. 446 files violate 500-line project standard.
26. Pin action SHAs (80+ on floating `@v4`).
27. Add `.github/dependabot.yml`.
28. Zod adoption at MCP boundaries — still zero.
29. e-prop push+shift → CircularBuffer (`eprop-learner.ts:240-243`).
30. SONA PatternRegistry O(n log n) eviction sort (carried 3+ cycles).

### P3 — Backlog

31. `validateGraphQLSchema` at 1,023 lines — decompose.
32. 33 god-files >1K lines in domains.
33. DomainServiceRegistry only covers 5/13 domains.
34. No formal DI container (113 direct `new ...Service()` calls).
35. `--no-color` CLI flag (env var only).
36. Screen reader testing implementation (declared-but-unimplemented 3 releases).
37. 4 new functions with >7 parameters (was 0).
38. Column-name injection in dynamicInsert/dynamicUpdate (carried from v3.8.3).
39. `toErrorMessage()` usage dropped 620 → 439 — investigate regression.
40. Document Mar 19 DB corruption incident.

---

## v3.8.13 Remediation Tracker

### P0 Items

| v3.8.13 P0 | v3.9.13 Status | Evidence |
|------------|----------------|----------|
| Dual MCP server divergence | **FIXED** | `src/mcp/server.ts` deleted; live handshake 86 tools match |
| CI health crisis (0% success, npm bypass) | **FIXED** | npm-publish.yml gates on tests; v3.9.13 shipped green through 4 gates |
| ESLint broken (.eslintrc.js CommonJS in ESM) | **PARTIAL** | Renamed to .cjs but lint still fails with different error |

### P1 Items

| v3.8.13 P1 | v3.9.13 Status | Evidence |
|------------|----------------|----------|
| 43 `as unknown as` in protocol-server.ts | **UNCHANGED** | Still 43; +4 elsewhere in src/mcp/ |
| Hardcoded `3.0.0` in server files | **FIXED** | Both servers now read from package.json |
| LIMIT/OFFSET integer interpolation | **FIXED** | witness-chain.ts:248-257 parameterized |
| test.skip debt at 72 | **FIXED** | Cut to 30 (-58%) |
| `@faker-js/faker` in 2 prod files | **PARTIAL** | 2 fixed; 1 remaining in test-data-generator.ts |
| `@claude-flow/guidance@3.0.0-alpha.1` | **UNCHANGED** | Still in prod deps |
| CLAUDE.md "150K+" claim | **PARTIAL** | Changed to "1K+" — still inaccurate (qe_patterns=468) |
| `calculateComplexity` CC=104 | **FIXED** | Decomposed 13× (CC=8, 58 lines) |
| `shouldUseColors()` 7% adoption | **REGRESSED** | Chalk calls +54%, 2 real consumers |
| EventEmitter leaks | **UNCHANGED** | 123/26/0 ratio |

### P2/P3 Items

| v3.8.13 Item | v3.9.13 Status |
|--------------|----------------|
| Enterprise-integration 9% coverage | **FROZEN** (5th release) |
| test-execution coverage | **IMPROVED** 16.7% → 18.2% |
| 442 files >500 lines | **WORSE** 446 |
| 31 orphan dirs (40.2% LOC) | **WORSE** 34 dirs (41.6% LOC) |
| Zero Zod validation | **UNCHANGED** |
| Platform testing (Node matrix) | **UNCHANGED** |
| SessionOperationCache O(n) | **UNCHANGED** |
| Property-based testing | **UNCHANGED** (still 1 file) |
| SONA O(n log n) eviction | **UNCHANGED** |
| `multi-language-parser` nesting 47 | **FIXED** (depth 30) |
| `registerAllTools` 778 lines | **PARTIAL** (416 lines) |

**Resolution rate**: 2/3 P0 FIXED + 1 PARTIAL = 83% P0 touched; 4/10 P1 FIXED + 2/10 PARTIAL + 1/10 REGRESSED + 3/10 UNCHANGED.

---

## Comparison: v3.8.13 vs v3.9.13 Report Coverage

| Report | v3.8.13 | v3.9.13 | Notes |
|--------|:------:|:------:|-------|
| Queen Coordination Summary | ✓ | ✓ | v3.8.13 remediation tracking continued |
| Code Complexity & Smells | ✓ | ✓ | Type-safety regression surfaced |
| Security Analysis | ✓ | ✓ | New CRITICAL runtime vuln chain |
| Performance Analysis | ✓ | ✓ | CLI lazy-loading restructure |
| Test Quality & Coverage | ✓ | ✓ | Skip debt remediation tracked |
| Product/QX (SFDIPOT) | ✓ | ✓ | ESLint partial fix tracked |
| Dependency/Build Health | ✓ | ✓ | Tarball size regression surfaced |
| API Contracts/Integration | ✓ | ✓ | Dual-server fix verified |
| Architecture/DDD Health | ✓ | ✓ | Orphan drift tracked |
| Accessibility Audit | ✓ | ✓ | Chalk gate regression surfaced |
| Brutal Honesty Audit | ✓ | ✓ | First reversal in 5 cycles |
| CI Deep Analysis | ✓ | ✓ | Largest single-dim gain (+4.5) |

**Coverage parity**: 11/11 reports reproduced. No gaps identified vs the v3.8.13 scope.

**New-in-v3.9.13 concerns added to audit** (not present in v3.8.13):
- Supply-chain vulnerability triage (protobufjs chain)
- Tarball hygiene (pre-build clean regression)
- ADR-092 advisor contract review
- ADR-093 retiring-model grep sweep
- qe-browser skill verification

---

## What Improved (Genuine Credit)

1. **CI fully recovered** — npm-publish gates on tests, v3.9.13 shipped green through 4 gates, post-publish canary added, publish-v3-alpha.yml deleted. (+4.5 points)
2. **Honesty reversal** — first in 5 cycles (68 → 74). CI fix is the actual win.
3. **Dual MCP server divergence RESOLVED** — server.ts deleted, version now dynamic. (+1.5 API Contracts)
4. **Top complexity hotspot decomposed 13×** — `calculateComplexity` CC=104 → CC=8.
5. **Silent catch blocks -86%** — 36 → 5.
6. **Skip debt -58%** — 72 → 30, zero `.only()`.
7. **CLI bundle lazy-loaded** — 7.0 MB monolith → 12 KB loader + 799 chunks.
8. **LIMIT/OFFSET parameterized** — witness-chain.ts HIGH fix.
9. **Accessibility test cases doubled** — 290 → 610.
10. **v3.8.13 P0 security fixes still intact** — command injection, SQL allowlist, witness-chain SQL.

## What Got Worse

1. **15 CRITICAL runtime npm vulns** — protobufjs CWE-94 via @claude-flow/browser+guidance+transformers. New release blocker.
2. **Tarball +79%** — 11.1 → 19.9 MB from missing pre-build clean.
3. **Grade C on Dependency/Build** — was B+.
4. **Type-safety regression** — `as any` +350%, `as unknown as` +216%.
5. **Chalk color-gate regression** — +54% calls bypassing shouldUseColors().
6. **Orphan LOC grew** — 40.2% → 41.6% (34 dirs, 235K lines).
7. **Files missing afterEach +65%** — 113 → 186.
8. **Circular deps +33%** — 9 → 12.
9. **`process.exit()` in mcp/ +27%** — 41 → 49.
10. **22 retiring-model refs** despite ADR-093 "migration complete" claim.

---

## Fleet Metrics

| Metric | Value |
|--------|-------|
| Total agents spawned | 11 |
| Reports generated | 12 |
| Total analysis duration | ~9.4 min (parallel; longest ~9.4 min) |
| Total report LOC | 3,662 |
| Findings identified | ~100+ |
| P0 (release blockers) | 5 |
| P1 (next sprint) | 10 |
| P2 (medium term) | 15 |
| P3 (backlog) | 10 |
| v3.8.13 P0 resolved | 2/3 FIXED + 1 PARTIAL (83% touched) |
| v3.8.13 P1 resolved | 4/10 FIXED, 2/10 PARTIAL, 1/10 REGRESSED |
| Composite score | 7.0/10 (up 0.1) |
| Honesty score | 74/100 (up 6, first reversal in 5 cycles) |

---

## Decision Guidance

**Can v3.9.13 remain on npm?** Yes, with a patch plan. The 15 protobufjs CRITICAL vulns are reachable only through opt-in features (`@claude-flow/browser` / embeddings via `@xenova/transformers`). Users who do not invoke these paths are not exposed. However, the vulns SHOULD be patched in v3.9.14 within days — GHSA-xq3m-2v4x-88gg is publicly scored CRITICAL.

**What to ship in v3.9.14 (scope ≤ 4 hours)**:
1. `overrides.protobufjs: ^7.5.5` in package.json (5 min)
2. `rimraf dist/cli/chunks` in build-cli.mjs before code-split (5 min)
3. Kill the 22 retiring-model refs (~30 min grep + replace + test)
4. Fix `npm run lint` glob (~15 min)
5. `advisor_consult` required-field enforcement (~30 min)

That restores Grade B on Dependency/Build, closes all 5 P0s, and lifts the composite to ~7.3/10.

**What requires a dedicated sprint**:
- Enterprise-integration 6-service test coverage (frozen 5 releases)
- 43 `as unknown as` in protocol-server.ts (carried CRITICAL)
- Zod adoption at MCP boundaries (zero adoption across 86 tools)
- Orphan dir reduction / shadow-application-layer breakdown

---

**Queen Coordinator**: `qe-queen-coordinator` (synthesized)
**Session**: session-1776676871298
**Shared Memory**: aqe/v3/qe-reports-3-9-13
**Audit Completed**: 2026-04-20
