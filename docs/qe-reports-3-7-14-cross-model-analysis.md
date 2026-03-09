# Cross-Model QE Fleet Report Analysis: AQE v3.7.14

**Date**: 2026-03-09
**Models Compared**: Claude Opus 4.6 | GLM-5 | Qwen 3.5 Plus
**Methodology**: 5 parallel research agents (3 model-specific analysts, 1 cross-model comparator, 1 devils-advocate verifier)
**Codebase Commit**: `c0c0ae9f` on branch `testing-models`

---

## Executive Summary

Three AI models analyzed the same AQE v3.7.14 codebase and produced dramatically different assessments. A devils-advocate agent independently verified claims against the actual codebase. The key finding: **model choice fundamentally determines report reliability**, with fabrication rates ranging from ~3% (Opus) to >70% (Qwen).

| Dimension | Opus 4.6 | GLM-5 | Qwen 3.5 |
|-----------|----------|-------|----------|
| Reports produced | 11 (333 KB) | 9 (199 KB) | 9 (60 KB) |
| Factual accuracy | 88% | 70% | 25% |
| False positive rate | ~3% | ~12% | >70% |
| Self-awareness | High | Moderate | Low |
| Overall quality score | 92/100 | 68/100 | 25/100 |
| Composite project score | 7.4/10 | 7.4/10 | 3.5/10 |
| Release verdict | Conditional pass | Proceed with reservations | NOT PRODUCTION READY |

---

## Part 1: Model-Specific Report Analysis

### 1.1 Claude Opus 4.6 (11 Reports)

**Reports**: Queen Summary, Code Complexity, Security, Performance, Test Quality, Product/QX, Dependency/Build, API Contracts, Architecture/DDD, Error Handling, Brutal Honesty Audit

**Strengths**:
- Most comprehensive suite (11 reports vs 9 for others)
- Nearly every finding backed by file:line references
- Self-auditing via Report 10 catches its own cross-report inconsistencies
- Unique reports on Architecture/DDD compliance and Error Handling resilience
- 43 deduplicated priority items with effort estimates

**Weaknesses**:
- 6 basic metrics disagree across its own reports (source files: 1,077/1,080/1,083; LOC: 513,074/513,351)
- Some score inflation identified (Security +0.70, Architecture Bounded Context +12)
- console.* calls undercounted by ~100 (3,291-3,301 claimed vs 3,399 actual)
- safeJsonParse references: two reports disagree by 69 (281 vs 350; actual: 338)

**Key Findings (Verified)**:

| Finding | Evidence |
|---------|----------|
| Security posture improved: 5.2 -> 7.25 -> 7.70/10 | Sustained trajectory across 3 releases |
| 53 circular dependency chains (+253% from v3.7.10) | Regression identified |
| 19 critical-complexity functions (CC>50) | Up from 14 in v3.7.10 |
| createHooksCommand: CC=141, 1,108 lines | Largest single function |
| bail=3 limits test execution visibility | vitest.config.ts:60 confirmed |
| 80 CLI commands bypass cleanup via process.exit | 99 actual calls across 19 files |
| Only 4 of 2,109 catch blocks use `catch(error: unknown)` | 99.8% use implicit any |
| 44 Promise.all vs 7 Promise.allSettled | Single failure kills parallel ops |

**Composite Scores (v3.7.10 -> v3.7.14)**:

| Dimension | v3.7.10 | v3.7.14 | Delta |
|-----------|---------|---------|-------|
| Security | 7.25 | 7.70 | +0.45 |
| Dependency/Build | 7.0 | 7.5 | +0.5 |
| Code Quality | 7.5 | 7.0 | -0.5 |
| Test Quality | 7.0 | 6.5 | -0.5 |
| Performance | 9.0 | 8.8 | -0.2 |
| **Composite** | **7.3** | **7.4** | **+0.1** |

---

### 1.2 GLM-5 (9 Reports)

**Reports**: Queen Summary, Code Complexity, Security, Performance, Test Quality, Product/QX, Dependency/Build, API Contracts, Brutal Honesty Audit

**Strengths**:
- Best contrarian pushback -- challenges whether findings like process.exit() and circular deps cause actual runtime problems
- Demands ROI justification for recommendations
- Identifies missing analysis categories (supply chain security, runtime profiling, i18n)
- Correct on safeJsonParse count (337 vs actual 338) and JSON.parse count (34, exact match)

**Weaknesses**:
- Queen Summary has swapped source/test file counts (905 source files claimed vs actual 1,080)
- Security report claims 319,756 LOC (61% of actual 513,074)
- Some numbers suspiciously aligned with Opus, suggesting shared data rather than independent measurement
- Claims magic numbers decreased 49% (unverified, contradicts other models showing stable/increasing)
- Claims zero silent catch blocks (Opus finds 172)

**Key Unique Findings**:
- Stronger severity rating for test-verifier.ts (CRITICAL vs Opus HIGH) -- reasoning: "if the pattern justified P0 in output-verifier, same pattern in sibling file should be treated equivalently"
- Questions process.exit() severity in CLI tools -- valid challenge for a CLI-primary tool
- Raises supply chain security gap as a missing analysis dimension
- Most balanced assessment of whether circular deps cause runtime issues vs just being cosmetic

**Overall Assessment**: Good second-opinion validator. When GLM disagrees with Opus, the truth is often between them. When GLM agrees with Opus, the finding is almost certainly real.

---

### 1.3 Qwen 3.5 Plus (9 Reports)

**Reports**: Queen Summary, Code Complexity (Defect Prediction), Security, Performance, Test Quality, Product/QX, Dependency/Build, API Contracts, Brutal Honesty Audit

**Strengths**:
- Uses recognized frameworks (OWASP Top 10, SFDIPOT/HTSM, CWE classifications)
- Cross-domain connections between defect prediction and coverage gaps
- "Cobbler's children" observation about a test generation platform lacking its own tests
- Effective executive communication style in Brutal Honesty audit

**Critical Weaknesses -- FABRICATED FINDINGS**:

| Fabricated Claim | Reality |
|-----------------|---------|
| "27 CRITICAL vulnerabilities" | **0-1 actual** (Qwen confused SQLite `db.exec()` with `child_process.exec()`) |
| "Hardcoded AWS credentials in wizard-utils.ts lines 50,52,65,67" | **Lines contain `console.log(chalk.blue(...))` -- zero credentials exist** |
| "1,426 total vulnerabilities" | Based on cascading false positives from the exec() confusion |
| "eval() in 2 production files" | Scanner rules ABOUT eval, not eval usage |
| "Math.random() for security in 13 files" | 5 calls in 1 file, all non-security; "13" includes comments saying "stopped using Math.random" |
| "0 known CVEs in dependencies" | 6 high minimatch vulns confirmed by npm audit |
| Quality Score "35/100" | Computed from fabricated vulnerability inputs |
| "F grade -- NOT PRODUCTION READY" | Verdict based entirely on phantom findings |

**Performance Report**: Functionally empty -- 70%+ of data fields are "TBD" with no actual measurements.

**Test Quality Report**: Uses v3.7.10 numbers carried forward as proxy. References `jest.useFakeTimers()` instead of `vi.useFakeTimers()` (wrong framework).

**Overall Assessment**: **Dangerous if acted upon without verification.** The inflammatory rhetoric ("Security claims are marketing fiction", "inexcusable in 2026") is based on fabricated evidence. Engineers following Qwen's recommendations would waste weeks investigating phantom vulnerabilities while the one real issue (test-verifier.ts) goes unidentified because Qwen doesn't find it.

---

## Part 2: Devils Advocate Verification Results

### Ground Truth Metrics (Independently Measured)

| Metric | Actual | Opus | GLM | Qwen |
|--------|--------|------|-----|------|
| Source files (.ts, excl tests) | **1,080** | 1,080-1,083 | 905/1,083 | 1,085 |
| Source LOC | **513,074** | 513,074/513,351 | 319,756/513,351 | 515,777 |
| Test files | **647** | ~647 | ~647 | ~647 |
| Files >500 lines | **429** | 429-430 | 429 | ~429 |
| safeJsonParse refs | **338** | 281/350 | 337 | 337 |
| Raw JSON.parse calls | **34** | 29 | 34 | N/A |
| process.exit() calls | **99** | 80+/98/104+ | ~98 | 20 |
| console.* calls | **3,399** | 3,291/3,301 | ~3,266 | 3,266 |
| `as any` in source | **2** | 2 | 2 | 2 |
| `as any` in tests | **418** | 418 | 418 | N/A |
| Skipped test blocks | **122** | 157/365 | 194 | N/A |
| npm audit high vulns | **6** (devDeps) | 6 | 6 | 0 |
| Math.random() calls | **5** (1 file, safe) | 5 | 6 | "13 in 10 files" |

### Verification Verdicts by Claim Category

**VERIFIED (All three models agree -- high confidence)**:
- output-verifier.ts fixed with execFile + allowlist
- E2E tests excluded from CI (5 files exist but pattern-excluded)
- enterprise-integration critically undertested (~11% coverage)
- No property-based or mutation testing
- ~429 files exceed 500-line mandate
- createHooksCommand is critically complex (~1,118-line function)
- No API documentation exists
- Windows is silently unsupported
- TypeScript strict mode fully enabled (0 @ts-ignore, 2 as any)
- safeJsonParse has strong adoption (338 sites)

**VERIFIED (Opus/GLM only)**:
- test-verifier.ts uses child_process.exec() -- genuine HIGH/CRITICAL vulnerability
- brain-shared.ts lacks SQL validation (6 functions, 0 validateTableName refs)
- Dual SQL allowlists create drift risk (13 vs 40 entries)
- 6 high minimatch vulns in devDependencies
- RegExp compiled per event match without caching
- @faker-js/faker misplaced in production dependencies

**VERIFIED (Opus only)**:
- Event sourcing mandated in CLAUDE.md but not implemented
- Source maps disabled in build
- @faker-js/faker in prod deps (5.3MB unnecessary)

**FABRICATED (Qwen only)**:
- AWS credentials in wizard-utils.ts (lines contain chalk formatting, zero secrets)
- 27 CRITICAL command injection findings (SQLite db.exec confused with child_process.exec)
- eval() in 2 production files (scanner rules, not usage)
- 1,426 total vulnerabilities (cascading from exec() confusion)
- "F grade" and "NOT PRODUCTION READY" (based on fabricated inputs)

---

## Part 3: Cross-Model Comparison

### 3.1 Report Coverage Matrix

| Report Topic | Opus 4.6 | GLM-5 | Qwen 3.5 |
|-------------|----------|-------|----------|
| Queen Coordination Summary | Full | Full | Full (partial data) |
| Code Complexity/Smells | Full | Full | Partial (many TBD) |
| Security Analysis | Full | Full | Full (high false positive) |
| Performance Analysis | Full | Full | Template (70% TBD) |
| Test Quality/Coverage | Full | Full | Partial (v3.7.10 data) |
| Product/QX (SFDIPOT) | Full | Full | Full |
| Dependency/Build Health | Full | Full | Full |
| API Contracts/Integration | Full | Full | Full |
| Architecture/DDD | Full | N/A | N/A |
| Error Handling/Resilience | Full | N/A | N/A |
| Brutal Honesty Audit | Full | Full | Full |

### 3.2 Scoring Divergence

| Dimension | Opus | GLM | Qwen | Spread |
|-----------|------|-----|------|--------|
| Security | 7.70/10 | 7.25/10 | "F" (~1.5/10) | 6.2 points |
| Quality (composite) | 7.4/10 | 7.4/10 | 3.5/10 | 3.9 points |
| Code Complexity | 5.5/10 | ~6/10 | N/A (CC=44.65) | Low divergence |
| Test Coverage | 6.5/10 | ~7/10 | "FAIL" (70%) | Moderate |
| Dependencies | 7.5/10 (B+) | ~7/10 (B-) | B- (72/100) | Low divergence |
| Product/QX | 6.6/10 | ~6.4/10 | 6.4/10 | Low divergence |

**Key Insight**: Opus and GLM converge within ~0.5 points on most dimensions. Qwen diverges by 3-6 points primarily due to fabricated security findings inflating severity across all dimensions.

### 3.3 Model Strengths by Domain

| Domain | Best Model | Why |
|--------|-----------|-----|
| Security analysis | **Opus 4.6** | Distinguishes db.exec from child_process.exec; tracks remediation trajectory |
| Code complexity | **Opus 4.6** | Most specific function-level CC values with line numbers |
| Test coverage | **Opus 4.6** | Cross-correlates with security and provides v3.7.10 -> v3.7.14 deltas |
| Architecture/DDD | **Opus 4.6** (exclusive) | Only model that produced this report |
| Error handling | **Opus 4.6** (exclusive) | Only model that analyzed catch blocks, Error.cause, Promise patterns |
| Business perspective | **GLM-5** | Challenges findings with ROI and practical impact questions |
| Contrarian analysis | **GLM-5** | Pushes back on severity of process.exit in CLI tools |
| Executive communication | **Qwen 3.5** | Effective "Marketing vs Reality" framing -- but based on bad data |
| Self-correction | **Opus 4.6** | Brutal honesty audit independently verifies its own claims |

### 3.4 Brutal Honesty Audit Comparison

| Aspect | Opus (Report 10) | GLM (Report 08) | Qwen (Report 08) |
|--------|-----------------|-----------------|-------------------|
| Tone | Measured, evidence-based | Contrarian, practical | Inflammatory, dramatic |
| Key thesis | Stagnant progress on known debt | Need ROI justification | Everything is broken |
| Self-criticism | Audits own report inconsistencies | Questions methodology gaps | No self-correction |
| Unique value | Metric verification tables | Supply chain gap, i18n gap | "Cobbler's children" metaphor |
| Reliability | High | Moderate | Low (fabricated basis) |

---

## Part 4: Verified Priority Matrix (Post-Devils-Advocate)

Stripped of fabrications and exaggerations, these are the actual verified issues:

### P0 -- Fix Before Release (1 item)

| # | Finding | File | Verified By |
|---|---------|------|-------------|
| 1 | test-verifier.ts uses `child_process.exec()` with configurable command | `src/agents/claim-verifier/verifiers/test-verifier.ts:13` | Devils Advocate + Opus + GLM |

### P1 -- Fix This Sprint (6 items)

| # | Finding | File | Verified By |
|---|---------|------|-------------|
| 2 | brain-shared.ts: 6 SQL functions lack validateTableName() | `src/integrations/ruvector/brain-shared.ts:220+` | Devils Advocate + Opus |
| 3 | Dual SQL allowlists drift (13 vs 40 entries) | `unified-memory.ts:709` vs `sql-safety.ts:13` | Devils Advocate + Opus |
| 4 | E2E tests excluded from CI (5 files) | `vitest.config.ts:32` | All 3 models + DA |
| 5 | @faker-js/faker in production dependencies | `package.json:152` | Devils Advocate + Opus |
| 6 | enterprise-integration at ~11% test coverage | `src/domains/enterprise-integration/` | All 3 models |
| 7 | 2 active test failures in domain-handlers.test.ts | `tests/mcp/domain-handlers.test.ts` | Opus |

### P2 -- Fix Next Sprint (6 items)

| # | Finding | File | Verified By |
|---|---------|------|-------------|
| 8 | RegExp compiled per event without caching | `src/coordination/cross-domain-router.ts:414-424` | DA + Opus + GLM |
| 9 | createHooksCommand: ~1,118-line function | `src/cli/commands/hooks.ts:584+` | All 3 models + DA |
| 10 | 6 high minimatch vulns in devDeps | `package-lock.json` | npm audit + Opus + GLM |
| 11 | 429 files exceed 500-line mandate | src/ | All 3 models + DA |
| 12 | bail=3/5 limits test execution visibility | `vitest.config.ts:60` | Opus + DA |
| 13 | No property-based or mutation testing | N/A | All 3 models |

### Informational

| # | Finding | Notes |
|---|---------|-------|
| 14 | 99 process.exit() calls (mostly CLI) | GLM correctly challenges severity for CLI tools |
| 15 | Event sourcing mandated but not implemented | CLAUDE.md vs reality mismatch |
| 16 | 122 skipped test blocks | Lower than all model estimates (157-365) |
| 17 | 418 `as any` in tests | Verified exactly |
| 18 | 3,399 console.* calls | Higher than any model reported |
| 19 | Windows silently unsupported | Node 18/20 CI testing also missing |

---

## Part 5: Key Insights and Recommendations

### 5.1 For Report Consumers

1. **Never act on Qwen 3.5 findings without independent verification.** This model fabricated 27 CRITICAL vulnerabilities from SQLite/shell API confusion and hallucinated AWS credentials that don't exist. Its "NOT PRODUCTION READY" verdict is based on phantom findings.

2. **Opus 4.6 is the most reliable source** but has internal metric inconsistencies across its own reports. Its brutal honesty audit (Report 10) is the single most valuable document produced.

3. **GLM-5 provides useful second-opinion validation** and occasionally raises stronger challenges. When GLM disagrees with Opus, investigate; when they agree, act.

4. **When all three models agree, the finding is almost certainly real.** 10 consensus findings all verified against the codebase.

5. **When only one model claims something, verify first.** Single-model claims have ~50% accuracy (Opus single-claims mostly verify; Qwen single-claims mostly fabricate).

### 5.2 For Multi-Model QE Workflows

- **Use Opus as primary analyst** for depth and accuracy
- **Use GLM as challenger/reviewer** to push back on severity and demand evidence
- **Use Qwen for alarm-level communication only** after filtering out false positives
- **Always run a devils-advocate verification pass** against actual codebase before acting on any model's findings
- **Establish a shared metrics baseline script** that all models reference to eliminate measurement inconsistencies

### 5.3 For the AQE Project

The actual security posture of v3.7.14 is **MEDIUM-LOW risk** (Opus/GLM assessment), not "F/NOT PRODUCTION READY" (Qwen assessment). The single genuine remaining vulnerability (test-verifier.ts exec()) is a straightforward fix. Structural and test coverage debt is real but not a release blocker.

**Most important process improvement**: Establish a shared metrics script that all agents reference, eliminating cross-report data inconsistencies that undermine trust in all quantitative claims. Six basic metrics (source files, LOC, console.* calls, process.exit calls, safeJsonParse refs, skip count) disagreed not just between models but within the same model's reports.

---

## Part 6: Cross-Report Data Accuracy Table

| Metric | Actual | Opus Best | Opus Worst | GLM Best | GLM Worst | Qwen |
|--------|--------|-----------|------------|----------|-----------|------|
| Source files | 1,080 | 1,080 | 1,083 (+3) | 1,083 (+3) | 905 (-175) | 1,085 (+5) |
| Source LOC | 513,074 | 513,074 | 513,351 (+277) | 513,351 (+277) | 319,756 (-193K) | 515,777 (+2.7K) |
| Files >500 lines | 429 | 429 | 430 (+1) | 429 | 429 | ~429 |
| console.* calls | 3,399 | 3,291 (-108) | 3,301 (-98) | 3,266 (-133) | 3,266 (-133) | 3,266 (-133) |
| process.exit() | 99 | 98 (-1) | 104+ (+5) | ~98 (-1) | ~98 (-1) | 20 (-79) |
| safeJsonParse | 338 | 350 (+12) | 281 (-57) | 337 (-1) | 337 (-1) | 337 (-1) |
| JSON.parse raw | 34 | 29 (-5) | 29 (-5) | 34 (exact) | 34 (exact) | N/A |
| Skipped tests | 122 | 157 (+35) | 365 (+243) | 194 (+72) | 194 (+72) | N/A |
| as any (src) | 2 | 2 (exact) | 2 (exact) | 2 (exact) | 2 (exact) | 2 (exact) |
| as any (tests) | 418 | 418 (exact) | 418 (exact) | 418 (exact) | 418 (exact) | N/A |
| npm audit high | 6 | 6 (exact) | 6 (exact) | 6 (exact) | 6 (exact) | 0 (-6) |
| Math.random() | 5 (safe) | 5 (correct) | 5 (correct) | 6 (+1) | 6 (+1) | 13 (+8, wrong) |

**Accuracy ranking**: Opus Report 02 > GLM Security > Opus Reports 01/08/09 > Qwen (distant last)

---

## Appendix: Report-Level Quality Tiers

### Opus 4.6 Report Tiers
- **Tier 1 (Strong)**: Security (02), Brutal Honesty (10), Architecture/DDD (08), Error Handling (09)
- **Tier 2 (Good)**: API Contracts (07), Code Complexity (01), Performance (03), Dependency/Build (06)
- **Tier 3 (Adequate)**: Queen Summary (00), Test Quality (04), Product/QX (05)

### GLM-5 Report Tiers
- **Tier 1 (Strong)**: Security (02), Brutal Honesty (08)
- **Tier 2 (Good)**: Performance (03), Dependency/Build (06), API Contracts (07)
- **Tier 3 (Adequate)**: Queen Summary (00), Code Complexity (01), Test Quality (04), Product/QX (05)

### Qwen 3.5 Report Tiers
- **Tier 1 (Strong)**: API Contracts (07), Dependency/Build (06)
- **Tier 2 (Adequate)**: Queen Summary (00), Product/QX (05), Brutal Honesty (08)
- **Tier 3 (Weak)**: Code Complexity (01), Test Quality (04), Security (02, high fabrication)
- **Tier 4 (Incomplete)**: Performance (03, 70% TBD)

---

*Analysis performed by 5 parallel AI research agents. Devils-advocate verification used 16 independent codebase queries against actual source files.*
