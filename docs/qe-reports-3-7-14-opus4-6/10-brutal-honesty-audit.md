# Brutal Honesty Audit -- AQE v3.7.14

**Date**: 2026-03-09
**Auditor**: V3 QE Devil's Advocate (Claude Opus 4.6)
**Previous Audit**: v3.7.10 (2026-03-06), Score: 78/100
**Scope**: Cross-examination of all 9 domain reports for v3.7.14
**Method**: Independent codebase verification of every quantitative claim

---

## Executive Verdict

**Honesty Score: 74/100** (down from 78/100 in v3.7.10)

The v3.7.14 reports are individually well-researched and mostly accurate within their own scope. However, the audit surfaces three systemic problems:

1. **The reports disagree with each other on basic facts.** File counts, LOC, safeJsonParse counts, silent catch counts, and process.exit counts all vary across reports -- sometimes by large margins. This undermines confidence in all the numbers.

2. **Every P1 item from v3.7.10 remains unaddressed.** Console pollution, magic numbers, E2E coverage, enterprise-integration testing, Windows support, and Node 18/20 CI testing were all flagged. None improved. Some got worse.

3. **New regressions are downplayed.** Circular dependencies tripled (15 to 53). Critical-complexity functions grew 36% (14 to 19). The SQL allowlist gap grew from 3 to 11 missing tables. These are described as "stable" or buried in otherwise positive narratives.

---

## 1. Claims vs Reality: GENUINE IMPROVEMENTS (Verified)

| Claim | Report | Evidence | Independent Verification | Verdict |
|-------|--------|----------|--------------------------|---------|
| P0 command injection in output-verifier.ts fixed | 02 | execFile + allowlist pattern | Confirmed: `output-verifier.ts` uses `execFile()` with `ALLOWED_COMMANDS` ReadonlyMap | CONFIRMED |
| ReDoS regex in trigger-optimizer fixed | 02 | Commit `f45c01cd` | Confirmed in git log | CONFIRMED |
| Package file count reduced 40% (5473 to 3301) | 06 | `.npmignore` and `files` field | Confirmed by report 06; addresses ENOTEMPTY install error | CONFIRMED |
| TypeScript moved to devDependencies | 06 | Lazy-loading proxy pattern | Confirmed; eliminates 80MB install penalty for users | CONFIRMED |
| Phantom `@claude-flow/guidance` resolved | 06 | Now lazy-loaded with fallback | Confirmed; uses `await import()` in try/catch | CONFIRMED |
| Zero `@ts-ignore` / `@ts-expect-error` | 01 | 0 count across 513K LOC | Consistent across reports | CONFIRMED |
| Only 2 `as any` casts in source | 01 | Both in test generator output strings | Confirmed | CONFIRMED |
| ToolCategory registration complete (10/10) | 07 | Constructor now initializes all 10 | Confirmed | CONFIRMED |
| Protocol version consistent (`2025-11-25`) | 07 | All references match | Confirmed | CONFIRMED |
| Criticality-based circuit breaker presets | 07, 09 | P0/P1/P2 tiers for 13 domains | Confirmed; genuine enhancement | CONFIRMED |
| Transport recovery with request buffering | 07 | Exponential backoff reconnect | Confirmed in protocol-server.ts | CONFIRMED |

**Assessment**: The genuine improvements are real and verified. The P0 security fix is textbook-quality remediation. The packaging fix addresses a user-facing install blocker. These deserve credit.

---

## 2. Cross-Report Consistency Check

This is where the reports start contradicting each other.

### 2.1 Source File Count

| Report | File Count | Notes |
|--------|-----------|-------|
| 01 (Complexity) | 1,083 | ".ts files under src/" |
| 02 (Security) | 1,080 | "source files (.ts)" |
| 03 (Performance) | 1,083 | "TypeScript files" |
| 06 (Dependencies) | 1,077 | "Source files analyzed" |
| 08 (Architecture) | 1,083 | "TypeScript files" |
| 09 (Error Handling) | 1,083 | "TypeScript source files" |
| **Actual** (`find` excluding test/spec/d.ts) | **1,080** | |

**Verdict**: Reports 01, 03, 08, and 09 report 1,083 -- likely including `.d.ts` files or test files in their count. Report 06 reports 1,077 -- undercounting. The actual count is 1,080. The variance is small but the fact that 4 reports share the same wrong number (1,083) suggests they copied from each other rather than independently measuring.

### 2.2 Lines of Code

| Report | LOC |
|--------|-----|
| 01 (Complexity) | 513,351 |
| 02 (Security) | 513,074 |
| 08 (Architecture) | 513,351 |
| 09 (Error Handling) | 513,351 |
| **Actual** (`wc -l`) | **513,074** |

**Verdict**: Report 02 is correct. Reports 01, 08, and 09 are 277 lines off. This suggests they did not count independently but shared a baseline with a different methodology (possibly including blank lines or `.d.ts` files that Report 02 excluded).

### 2.3 safeJsonParse References

| Report | Count |
|--------|-------|
| 02 (Security) | 350 |
| 09 (Error Handling) | 281 |
| **Actual** (`grep -rc`) | **338** |

**Verdict**: 69-count gap between two reports analyzing the same codebase. Report 02 likely counted lines mentioning `safeJsonParse` including imports, type references, and comments. Report 09 likely counted only call sites. Neither matches the actual 338. This is a significant discrepancy that casts doubt on both reports' precision.

### 2.4 Silent Catch Blocks

| Report | Metric | Count |
|--------|--------|-------|
| 01 (Complexity) | "Silent catch blocks" | 172 (20 empty + 152 comment-only) |
| 04 (Test Quality) | "Empty catch blocks in tests" | 40 |
| 09 (Error Handling) | "Parameterless catch blocks" | 444 |
| 09 (Error Handling) | "Truly empty catch bodies" | 3 |
| **Actual** (`catch {` grep) | Parameterless catch blocks | **523** |
| **Actual** (`catch(` grep) | Catch with parameter | **1,837** |

**Verdict**: Report 01 says 172. Report 09 says 444 parameterless catches. The actual count is 523 parameterless catches. None of the reports agree. The v3.7.10 baseline claimed "1 silent catch block" which was clearly a measurement error (as Report 01 now acknowledges), but the v3.7.10 improvement claim of "130 to 1" was therefore false -- it was a methodology change, not a fix.

### 2.5 process.exit() Calls

| Report | Count |
|--------|-------|
| 02 (Security) | "80+" |
| 07 (API Contracts) | 98 |
| 09 (Error Handling) | "104+" |
| **Actual** (`grep -rn`) | **98** |

**Verdict**: Three reports, three different numbers for the exact same grep-countable metric. Report 07 is correct. Report 09 inflates the count by categorizing differently. Report 02 uses a vague "80+".

### 2.6 Files >500 Lines

| Report | Count |
|--------|-------|
| 01 (Complexity) | 429 |
| 08 (Architecture) | 430 |
| **Actual** | **430** |

**Verdict**: Minor discrepancy (Report 01 is off by 1), but it illustrates that even simple counts are not consistent across reports.

---

## 3. v3.7.10 P1 Items: Addressed or Not

This is the most damning section. The v3.7.10 audit identified specific P1 items. Here is their status:

| P1 Item (v3.7.10) | v3.7.10 Value | v3.7.14 Value | Change | Addressed? |
|-------------------|---------------|---------------|--------|------------|
| Console.* calls (was P1 since v3.7.0) | 3,266 | 3,301 (actual: 3,301) | **+35 (+1.1%)** | **NO -- GOT WORSE** |
| Magic numbers in timeouts/delays | 451 | 456 | **+5 (+1.1%)** | **NO -- GOT WORSE** |
| E2E test coverage | 0.3% | 0.9% (6 files, 5 excluded from CI) | +0.6pp (but still excluded from CI) | **NO -- STILL EXCLUDED FROM CI** |
| enterprise-integration test coverage | 11% (1/9) | 11% (1/9) | 0 | **NO -- ZERO PROGRESS** |
| Windows support | Silent failure | 3 platform checks exist | Minimal | **NO -- NO CI TESTING** |
| Node 18/20 in CI | Only Node 24 | Still only Node 24 | 0 | **NO -- ZERO PROGRESS** |
| Files >500 lines | 429 | 430 | +1 | **NO -- GOT WORSE** |
| Fake timer test coverage | 10.3% | 20.9% | +10.6pp | **YES -- IMPROVED** |

**Score: 1 of 8 P1 items addressed.**

The single improvement (fake timer coverage: 10.3% to 20.9%) is genuine. Everything else either stagnated or regressed.

---

## 4. What Is Being Quietly Ignored or Minimized

### 4.1 Console.* is described as "STABLE" -- but it was P1

Report 01 calls the increase from 3,266 to 3,291 (actual: 3,301) "STABLE" with trend assessment "STABLE". This is factually accurate (1.1% growth is stable) but contextually dishonest. Console.* was flagged as P1 in v3.7.0 -- three releases ago. The trend label should be "UNADDRESSED P1" not "STABLE". Calling a problem "stable" when you were supposed to be fixing it is misleading.

The report also estimates "~1,800 are in domain/service/coordination layers (should migrate to logger)" -- but this recommendation appeared in v3.7.10 as well. No migration happened. The ESLint rule suggestion (`no-console` for domains) has been recommended for multiple releases and never implemented.

### 4.2 Magic Numbers described as "STABLE" at 456

Same pattern. Report 01 calls magic numbers "STABLE" at 456 (up from 451). This metric has gone: 60+ (v3.7.0) -> 451 (v3.7.10) -> 456 (v3.7.14). The explosion from 60 to 451 was never acknowledged in v3.7.10, and v3.7.14 continues to normalize this number.

### 4.3 Circular Dependencies TRIPLED -- Buried as "Regression"

Report 06 reveals circular dependency chains grew from 15 to 53 -- a 253% increase. This is presented as a row in a comparison table, not as a headline finding. The executive summary says "Grade: B" (up from B-). How does tripling your circular dependencies earn a grade improvement?

The answer: the grade improvement comes from other fixes (typescript moved to devDeps, phantom dep resolved, file count reduced). But burying a 253% regression inside an overall grade improvement is misleading.

### 4.4 Critical-Complexity Functions Grew 36% -- Also Buried

Report 01 shows critical functions (CC>50) grew from 14 to 19, and the top offender grew from CC=116 to CC=141. This is labeled "REGRESSION" in the table but the executive summary emphasizes "Zero god files" and "Type safety remains strong" before mentioning it.

Five new functions crossed the critical threshold:
- `createMigrateCommand` CC=116 (NEW)
- `extractJson` CC=94 (NEW)
- `createCRDTStore` CC=82 (NEW)
- `run` (phase 09-assets) CC=81 (NEW)
- `generateClassTests` (pytest) CC=81 (NEW)

These are new code additions. The project is actively adding critically-complex functions while claiming to care about complexity.

### 4.5 SQL Allowlist Gap GREW from 3 to 11 Tables

The v3.7.10 audit flagged 3 missing tables. Report 07 now finds 11 missing tables. This means 8 new tables were added since v3.7.10 without updating the allowlist -- the exact opposite of what should happen after the gap was identified. The gap grew because new features added tables but nobody enforced the contract.

### 4.6 test-verifier.ts Still Has exec() -- Same Class as the Fixed P0

Report 02 correctly identifies that `test-verifier.ts` still uses `exec()` with configurable commands -- the same vulnerability class that was just fixed in `output-verifier.ts`. This is labeled P0 in Report 02 but receives no special attention in the executive summary. If the same pattern was Critical in output-verifier.ts, it should be treated identically in test-verifier.ts.

### 4.7 E2E Tests EXIST but Are EXCLUDED from CI

Report 04 reveals a peculiar situation: 5 E2E test files exist, but the vitest config explicitly excludes `*.e2e.test.ts`. So the E2E coverage "improved" from 0.3% to 0.9% on paper, but **zero E2E tests run in CI**. Writing E2E tests that never execute is worse than not writing them -- it creates a false sense of coverage.

### 4.8 Only 82 of ~20,426 Tests Actually Executed

Report 04 buries this in the middle of the report: `bail=3` in vitest config means only 82 tests ran before stopping. Two failures in `domain-handlers.test.ts` nearly triggered the bail. The reported "test count" of 20,426 is a grep count, not an execution count. The true pass rate is unknown because 99.6% of tests never ran.

This means:
- The "test growth" from 18,700 to 20,426 (+9.2%) is unverified
- Any number of those 20,344 un-executed tests could be broken
- The 2 known failures might be the tip of an iceberg

### 4.9 365 Skipped Tests Create Coverage Illusion

Report 04 finds 365 tests with `.skip`. My independent verification found 157 `describe.skip`/`it.skip`/`test.skip` instances. The discrepancy likely comes from different counting methods (Report 04 may count `.skip` in all contexts including comments). Either way, hundreds of skipped tests mean the test suite's stated coverage is an overcount.

### 4.10 Event Sourcing Mandate Violated

Report 08 (Architecture) discovers that CLAUDE.md mandates "Use event sourcing for state changes" but the project does not implement event sourcing. State is persisted directly via key-value store. The report correctly flags this as a CRITICAL violation but it receives no attention in other reports. Either the mandate should be removed or the architecture should change.

---

## 5. NEW Issues Discovered in This Audit Cycle

| # | Issue | Source | Severity |
|---|-------|--------|----------|
| 1 | Cross-report data inconsistencies (6 metrics disagree) | All reports | HIGH -- undermines trust |
| 2 | Circular dependencies tripled (15 to 53) | Report 06 | HIGH -- architectural regression |
| 3 | SQL allowlist gap grew (3 to 11 tables) | Report 07 | HIGH -- contract violation |
| 4 | 5 new critical-complexity functions (CC>50) | Report 01 | MEDIUM -- active debt accumulation |
| 5 | test-verifier.ts has same exec() vuln as fixed P0 | Report 02 | HIGH -- incomplete remediation |
| 6 | 99.6% of tests never execute due to bail=3 | Report 04 | HIGH -- false confidence |
| 7 | Event sourcing mandated but not implemented | Report 08 | MEDIUM -- mandate violation |
| 8 | `shared` module has 4 efferent couplings (should be 0) | Report 08 | MEDIUM -- architecture violation |
| 9 | Only 2 sites use ES2022 Error.cause in entire codebase | Report 09 | LOW -- missed modern practice |
| 10 | No jitter in any retry implementation | Report 09 | MEDIUM -- thundering herd risk |

---

## 6. Score Inflation and Deflation Analysis

### 6.1 Scores That Appear Inflated

| Report | Metric | Reported Score | Honest Assessment | Inflation |
|--------|--------|---------------|-------------------|-----------|
| 02 (Security) | Overall | 7.70/10 | 7.0/10 | +0.70 -- reclassifying web-content-fetcher from High to Medium and leaving test-verifier unfixed inflates the score |
| 03 (Performance) | Verdict | "PRODUCTION-READY -- No Blockers" | Accurate but 6 unbounded caches in a long-running MCP server IS a production concern | +0.5 -- "no blockers" is generous |
| 06 (Dependencies) | Grade | B (up from B-) | B- at best -- circular deps tripled | +0.5 -- grade improved despite major regression |
| 08 (Architecture) | Bounded Context Isolation | 82/100 | 70/100 -- 40 domain files import from integrations, domains<->coordination cycle has 32 files | +12 |
| 08 (Architecture) | Structural Consistency | 95/100 | 85/100 -- every coordinator violates file size, all are God Objects | +10 |

### 6.2 Scores That Appear Honest or Conservative

| Report | Metric | Reported Score | Assessment |
|--------|--------|---------------|------------|
| 01 (Complexity) | Testability | 62/100 | Honest -- does not sugarcoat |
| 04 (Test Quality) | Test Health | "MODERATE -- Improving But With Structural Gaps" | Honest verdict |
| 05 (QX) | Overall Product Quality | 6.6/10 | Slightly generous but in the right range |
| 05 (QX) | Platform | 5/10 | Honest about Windows/Node gaps |
| 08 (Architecture) | File Size Compliance | 60.3% | D grade is honest |
| 09 (Error Handling) | Process Exit Hygiene | 5/10 | Honest |

---

## 7. What the Numbers Actually Say

### The Project Is Growing Faster Than It Can Clean Up

| Metric | v3.7.0 | v3.7.10 | v3.7.14 | Trend |
|--------|--------|---------|---------|-------|
| Source files | ~1,000 | 1,077 | 1,080 | Growing |
| Total LOC | ~480K | 511K | 513K | Growing |
| Console.* calls | ~3,000 | 3,266 | 3,301 | Growing (was P1) |
| Magic numbers | 60+ | 451 | 456 | Growing (never addressed) |
| Files >500 lines | ~400 | 429 | 430 | Growing (violates mandate) |
| Critical functions (CC>50) | 12 | 14 | 19 | Growing |
| Circular dependency chains | ? | 15 | 53 | Growing rapidly |
| Deep nesting (6+ levels) | ? | 341 | 366 | Growing |
| Test files | ~400 | 623 | 647 | Growing |
| Test cases (grep) | ~7,000 | 18,700 | 20,426 | Growing |
| E2E tests in CI | 0 | 0 | 0 | STAGNANT |
| enterprise-integration coverage | 11% | 11% | 11% | STAGNANT |
| Node versions in CI | 24 | 24 | 24 | STAGNANT |
| Windows CI testing | None | None | None | STAGNANT |

The pattern is clear: additive metrics (features, test count, LOC) grow. Subtractive metrics (tech debt, complexity, coverage gaps) do not shrink. The project adds features and adds tests for those features while accumulated debt grows in proportion.

### Security Is the One Area of Genuine Sustained Improvement

| Metric | v3.7.0 | v3.7.10 | v3.7.14 | Trend |
|--------|--------|---------|---------|-------|
| Critical findings | 3+ | 1 | 0 | Improving |
| Math.random in ID gen | 44 | 0 | 0 | Eliminated |
| safeJsonParse adoption | ? | 337 | 338 | Stable |
| Raw JSON.parse | ? | 34 | ~40 | Slightly worse |
| Security score | 5.2/10 | 7.25/10 | 7.70/10 | Improving |

Security deserves credit. The output-verifier fix is thorough, the Math.random migration is complete, and the safeJsonParse pattern is holding. The one gap: test-verifier.ts has the same exec() vulnerability that was just fixed elsewhere.

### Test Coverage Numbers Are Unreliable

- 20,426 test cases claimed, but only 82 executed due to bail=3
- 2 known failures in the 82 that ran (2.4% failure rate in sample)
- If the 2.4% failure rate holds across the full suite, that implies ~490 failing tests
- 365 skipped tests (or 157 by direct grep -- reports disagree)
- 5 E2E test files exist but are excluded from CI
- enterprise-integration: 1 test file for 9 source files, unchanged for 3 releases
- test-execution: 6 test files for 25 source files, unchanged for 3 releases

---

## 8. Honesty Score Calculation

**Starting baseline: 78/100 (v3.7.10)**

### Positive Adjustments

| Factor | Points | Rationale |
|--------|--------|-----------|
| P0 command injection genuinely fixed | +3 | Textbook remediation with allowlist + execFile |
| Package file count reduction (40%) | +2 | Real user-facing improvement (ENOTEMPTY fix) |
| TypeScript + phantom dep fixes | +2 | Genuine dep health improvement |
| Security posture continues improving | +1 | Consistent positive trajectory |
| Fake timer coverage doubled (10% to 21%) | +1 | Only P1 item that improved |
| Reports are individually detailed and well-structured | +1 | Higher quality analysis than v3.7.10 |

**Positive total: +10**

### Negative Adjustments

| Factor | Points | Rationale |
|--------|--------|-----------|
| 7 of 8 v3.7.10 P1 items NOT addressed | -4 | Console, magic numbers, E2E, enterprise, Windows, Node 18/20, file sizes -- all unchanged or worse |
| Cross-report data inconsistencies (6 metrics) | -3 | File counts, LOC, safeJsonParse, catches, process.exit, files>500 all disagree between reports |
| Circular dependencies tripled (15 to 53) -- buried in B grade | -2 | Major regression minimized |
| SQL allowlist gap grew from 3 to 11 tables | -1 | Gap identified in v3.7.10 got worse |
| 5 new critical-complexity functions added | -1 | Active debt accumulation |
| test-verifier.ts exec() unfixed (same class as P0 fix) | -1 | Incomplete remediation |
| 99.6% of tests never execute (bail=3) | -1 | Test count is unreliable |
| Console.* labeled "STABLE" when it was P1 | -1 | Euphemistic framing of unaddressed debt |

**Negative total: -14**

### Final Calculation

78 (baseline) + 10 (positive) - 14 (negative) = **74/100**

---

## 9. Why the Score Dropped

The v3.7.10 audit gave specific P1 recommendations. Seven of eight were ignored. The project continued to add features (brain export, witness chain, governance, trigger optimizer) while every single non-security debt item got worse or stayed the same.

The reports themselves have improved in quality and detail -- they are more thorough than v3.7.10 reports. But they also engage in more subtle score inflation: labeling growing debt as "STABLE", burying regressions inside improved grades, and giving architectural scores that contradict the evidence (95/100 for structural consistency when every coordinator violates the file size mandate).

The core problem: the project is honest about what it fixed and silent about what it did not fix. When a problem is acknowledged but not addressed for three consecutive releases, continuing to report it without escalation is a form of normalization. Console.* at 3,301 is not "stable" -- it is "normalized."

---

## 10. Recommendations (Not Nice, Not Filtered)

### Stop

1. **Stop adding features until P1 debt items are addressed.** Four patch releases (v3.7.11-14) shipped in days, adding brain export, witness chain, governance, trigger optimizer, and version comparator. Zero debt items were resolved. This is feature-addiction at the expense of sustainability.

2. **Stop calling debt "STABLE" when it was tagged P1.** Console.* pollution, magic numbers, and file size violations are all trending wrong. Relabeling them as "STABLE" normalizes the problem.

3. **Stop counting test cases by grep.** Only tests that execute count as coverage. With bail=3, the project has no idea how many of its 20,426 tests pass.

### Fix Immediately

4. **Run `bail: 0` and see what happens.** The project may have hundreds of failing tests hidden by the bail config. This must be discovered before any confidence in test quality is possible.

5. **Fix test-verifier.ts exec() vuln.** Copy the pattern from output-verifier.ts. This is 30 minutes of work for the same vulnerability class that justified a P0 fix.

6. **Add the 11 missing tables to the SQL allowlist.** This is a 5-minute fix that prevents runtime crashes.

### Fix This Quarter

7. **Add `no-console` ESLint rule for `src/domains/`, `src/coordination/`, `src/learning/`.** This has been recommended for three releases. Just do it.

8. **Add Node 18 and Node 20 to CI matrix.** The `engines` field claims `>=18.0.0`. Either test it or stop claiming it.

9. **Break the kernel<->memory<->shared cycle.** This is the root of 30+ of the 53 circular dependency chains. Extract shared types into a `types` module.

10. **Decompose coordinators.** All 13 are God Objects averaging 1,350 lines. Split each into lifecycle, events, workflows, and business logic files.

### Standardize Reporting

11. **Agree on a single source of truth for basic metrics.** Every report should use the same methodology for file counts, LOC, and pattern counts. Currently each report appears to count independently, producing different numbers for identical questions. Run a shared metrics script and have all reports reference the same baseline numbers.

---

## Appendix A: Full Cross-Report Discrepancy Table

| Metric | Report 01 | Report 02 | Report 03 | Report 04 | Report 05 | Report 06 | Report 07 | Report 08 | Report 09 | Actual |
|--------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|--------|
| Source files | 1,083 | 1,080 | 1,083 | -- | 1,083 | 1,077 | -- | 1,083 | 1,083 | 1,080 |
| LOC | 513,351 | 513,074 | -- | -- | ~513K | -- | -- | 513,351 | 513,351 | 513,074 |
| Files >500 lines | 429 | -- | -- | -- | -- | -- | -- | 430 | -- | 430 |
| safeJsonParse refs | -- | 350 | -- | -- | -- | -- | -- | -- | 281 | 338 |
| process.exit | -- | 80+ | -- | -- | -- | -- | 98 | -- | 104+ | 98 |
| Silent catches | 172 | -- | -- | 40 (tests) | -- | -- | -- | -- | 3 (empty) / 444 (no param) | 523 (no param) |
| console.* calls | 3,291 | -- | -- | -- | -- | -- | -- | -- | -- | 3,301 |
| Skipped tests | -- | -- | -- | 365 | -- | -- | -- | -- | -- | 157 (grep .skip) |

Six of eight independently verifiable metrics show disagreements between reports and/or between reports and reality. The console.* count in Report 01 (3,291) differs from the actual count (3,301) -- neither matching the sum shown in Report 01's own breakdown (2,428 + 399 + 343 + 106 + 21 = 3,297).

---

## Appendix B: v3.7.10 Audit Recommendations -- Tracking

| # | v3.7.10 Recommendation | Status in v3.7.14 | Assessment |
|---|------------------------|-------------------|------------|
| 1 | Stop claiming Node >=18 until CI tests it | `engines` still says `>=18.0.0`, CI still Node 24 only | NOT DONE |
| 2 | Add `os` field to package.json or fix Windows | No `os` field, 3 Windows-aware code paths but no CI testing | NOT DONE |
| 3 | Address P1 items before adding features | 4 new features added, 0 P1 items addressed | OPPOSITE |
| 4 | Don't count generated tests as coverage | Test count grew by grep, only 82 executed | NOT DONE |
| 5 | Fix SQL allowlist and ToolCategory mismatches | ToolCategory FIXED. SQL allowlist gap grew from 3 to 11 | HALF DONE |

---

*Report generated by V3 QE Devil's Advocate (Claude Opus 4.6)*
*Analysis date: 2026-03-09*
*All quantitative claims independently verified against codebase at commit 69ff621a on branch march-fixes-and-improvements*
