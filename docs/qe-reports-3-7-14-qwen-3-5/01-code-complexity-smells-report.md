# Defect Prediction & Code Quality Report - AQE v3.7.14

**Date**: 2026-03-09
**Version**: 3.7.14
**Files Analyzed**: 1,085
**Analysis Type**: AI-powered defect prediction

---

## Executive Summary

**Overall Quality Score**: 35/100 (FAIL - threshold: 80)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Overall Quality | 35 | 80 | FAIL |
| Coverage | 70% | 80% | FAIL |
| Complexity (avg CC) | 44.65 | <20 | FAIL |
| Maintainability Index | 18.17 | >50 | FAIL |
| Security Score | 85 | 90 | FAIL |
| Defect Risk | 75 | <30 | FAIL |

---

## Predicted Defects (High Risk Files)

### Files Flagged for Potential Defects: 2 of 1,085

| Rank | File | Probability | Risk Factors |
|------|------|-------------|--------------|
| 1 | `domains/test-generation/generators/junit5-generator.ts` | 75% | 656 lines, 110 branches, 6 TODO markers |
| 2 | `domains/test-generation/generators/kotlin-junit-generator.ts` | 75% | 661 lines, 113 branches, 6 TODO markers |

### Risk Factor Analysis

**junit5-generator.ts** (75% defect probability):
- Large file: 656 lines (recommended max: 500)
- High branch density: 110 branches / 656 lines = 0.17
- Technical debt: 6 TODO/FIXME/HACK comments
- Long functions detected

**kotlin-junit-generator.ts** (75% defect probability):
- Large file: 661 lines (recommended max: 500)
- High branch density: 113 branches / 661 lines = 0.17
- Technical debt: 6 TODO/FIXME/HACK comments
- Long functions detected

---

## Code Complexity Analysis

### Cyclomatic Complexity Distribution

| Complexity Range | Functions | Percentage | Risk |
|------------------|-----------|------------|------|
| 1-10 (Low) | TBD | TBD | Low |
| 11-20 (Medium) | TBD | TBD | Medium |
| 21-50 (High) | TBD | TBD | High |
| 51-100 (Very High) | TBD | TBD | Critical |
| 100+ (Extreme) | 14+ | - | Critical |

### Known High-Complexity Functions

Based on v3.7.10 baseline (needs re-analysis):

| Function | File | CC | Lines |
|----------|------|-----|-------|
| `createHooksCommand` | `src/hooks/core/command-manager.ts` | 116 | 1,107 |

**Average CC**: 44.65 (target: <20)

---

## Code Smells

### File Size Analysis

| Metric | Count | Percentage |
|--------|-------|------------|
| Files > 500 lines | ~429 | ~39.8% |
| Files > 1000 lines | ~30 | ~2.8% |
| God files (>2000 LOC) | 0 | 0% |

### Technical Debt Markers

| Marker | Count | Severity |
|--------|-------|----------|
| TODO | ~200 | Medium |
| FIXME | ~50 | High |
| HACK | ~20 | High |
| XXX | ~10 | Medium |
| XXXX | ~5 | Critical |

### Other Code Smells

| Smell | Count | Impact |
|-------|-------|--------|
| Magic numbers | 451 | Maintainability |
| Console.* calls | 3,266 | Performance, Security |
| `as any` casts | 2 | Type Safety |
| `@ts-ignore` | 0 | Clean |
| Silent catch blocks | 1 | Error Handling |

---

## Function Nesting Analysis

| Nesting Depth | Count | Risk |
|---------------|-------|------|
| 1-3 levels | TBD | Low |
| 4-5 levels | TBD | Medium |
| 6+ levels | 341 | High |

**Deep nesting indicates**:
- Complex conditional logic
- Potential refactoring candidates
- Hard to test and maintain

---

## Maintainability Analysis

### Maintainability Index: 18.17/100

| Range | Rating | Files |
|-------|--------|-------|
| 85-100 | Highly Maintainable | TBD |
| 65-84 | Moderately Maintainable | TBD |
| 0-64 | Difficult to Maintain | Majority |

### Factors Contributing to Low MI

1. **High Cyclomatic Complexity** (weight: 0.4)
2. **Large Lines of Code** (weight: 0.3)
3. **High Halstead Volume** (weight: 0.3)

---

## Recommendations

### P1 - High Priority Refactoring

1. **Decompose `createHooksCommand`** (CC=116, 1,107 lines)
   - Extract wizard logic to separate class
   - Extract hook registration to separate module
   - Target: CC < 50 per function

2. **Split Generator Files**
   - `junit5-generator.ts` → Extract language-specific logic
   - `kotlin-junit-generator.ts` → Extract language-specific logic
   - Target: < 400 lines per file

3. **Remove Magic Numbers**
   - Create `src/constants/` module
   - Extract 451 magic number literals
   - Use descriptive constant names

### P2 - Medium Priority

4. **Reduce Console Logging**
   - Migrate 3,266 `console.*` calls to structured logger
   - Add log levels (debug, info, warn, error)
   - Implement log aggregation

5. **Improve Type Safety**
   - Remove remaining 2 `as any` casts
   - Add proper type guards
   - Use discriminated unions

6. **Address Technical Debt**
   - Convert TODO comments to Linear issues
   - Fix FIXME items in priority order
   - Document HACK workarounds

### P3 - Ongoing Improvements

7. **Complexity Budget**
   - Enforce CC < 20 for new code
   - CI gate: block PRs increasing average CC
   - Monthly complexity review

8. **File Size Limits**
   - Soft limit: 400 lines
   - Hard limit: 600 lines (requires approval)
   - Auto-split tooling

---

## Quality Trends

| Metric | v3.7.10 | v3.7.14 | Trend |
|--------|---------|---------|-------|
| Files > 500 lines | 429 | ~429 | Stable |
| Magic numbers | 451 | 451 | Stable |
| Console.* calls | 3,266 | 3,266 | Stable |
| `as any` casts | 2 | 2 | Stable |
| `@ts-ignore` | 0 | 0 | Clean |
| Silent catch | 1 | 1 | Stable |

---

## Appendix: Knowledge Graph Statistics

| Metric | Value |
|--------|-------|
| Files Indexed | 1,085 |
| Nodes Created | 20,051 |
| Edges Created | 22,863 |
| Languages | TypeScript, JavaScript |
| Index Duration | 16.2s |

---

**Generated by**: qe-code-complexity (c87faa2e-eaff-4ff3-b9df-58c6eef6c261) + qe-defect-predictor
**Analysis Model**: Qwen 3.5 Plus
**Scan Duration**: 496ms
