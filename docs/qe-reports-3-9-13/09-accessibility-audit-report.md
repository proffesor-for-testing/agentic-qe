# Accessibility Audit Report - v3.9.13

**Date**: 2026-04-20
**Agent**: qe-accessibility-auditor (Agent 09)
**Baseline**: v3.8.13 (2026-03-30)
**Scope**: CLI accessibility, HTML output, WCAG implementation, A2UI layer, testing maturity, domain architecture

---

## Executive Summary

AQE v3.9.13 delivers substantial growth in accessibility test coverage (test cases more than doubled, from ~290 to 610+) and the visual-accessibility domain added a 13th service. However, every CLI and HTML gap flagged in v3.8.13 remains **unfixed**, and the CLI color-gating regression has **worsened**: chalk method calls grew from 1,066 to 1,642 (+54%) while `shouldUseColors()` adoption remains near-zero. The HTML `formatAsHtml()` function is byte-for-byte identical to v3.8.13 — still a one-line `<html><body><pre>` with no DOCTYPE, `<title>`, `lang`, landmarks, skip nav, or focus styles. Screen reader tests remain unimplemented despite being declared as a capability for 2+ releases. Overall score holds at **7.7/10** — strong floor from architecture and test breadth offset by persistent tactical debt.

---

## Category Scores

| Category | v3.8.13 | v3.9.13 | Delta | Trend |
|----------|---------|---------|-------|-------|
| CLI Accessibility | 7/10 | 6/10 | -1 | Regressed |
| HTML Output Accessibility | 5/10 | 5/10 | 0 | Stagnant (2 releases) |
| Accessibility Testing Maturity | 8/10 | 9/10 | +1 | Improved |
| WCAG Implementation Coverage | 8/10 | 8/10 | 0 | Stable |
| A2UI Accessibility Layer | 9/10 | 9/10 | 0 | Stable |
| Domain Architecture | 9/10 | 9/10 | 0 | Stable |
| **Overall** | **7.7/10** | **7.7/10** | **0** | **Stable (mixed signals)** |

CLI drops one point due to widening color-gate gap. Testing maturity rises one point because test cases more than doubled and several new browser-integration specs landed. Net change is zero.

---

## 1. CLI Accessibility (6/10, down from 7/10)

### Quantitative regression

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|---------|---------|-------|
| Files importing chalk in `src/cli/` | 30 | **51** | +21 (+70%) |
| Total `chalk.*` method calls | 1,066 | **1,642** | +576 (+54%) |
| Files using `shouldUseColors()` | 2 | **4** | +2 |
| `shouldUseColors()` adoption rate | 6.7% | **7.8%** | +1.1pp |
| `--no-color` CLI flag exposed | No | **No** | 0 |

The `shouldUseColors()` helper at `src/cli/config/cli-config.ts:516-531` is unchanged and correct (respects `NO_COLOR`, `FORCE_COLOR`, and TTY). Its consumers grew from 2 to 4 files: the original `src/cli/utils/progress.ts` and `src/cli/utils/streaming.ts`, plus `src/cli/config/index.ts` (re-export) and `src/cli/config/cli-config.ts` (self). Functionally still only 2 real consumers — both utility modules that were already compliant.

Meanwhile, **21 new CLI files** were added that import chalk directly and ignore the gate. The absolute delta of **576 additional ungated chalk calls** means `NO_COLOR=1 aqe <anything>` is even more likely to emit ANSI escapes than in v3.8.13.

### WCAG 1.4.1 (Use of Color) — still violated

`src/cli/handlers/status-handler.ts` retains color-only differentiation with zero text prefixes:

```
Line 87:  ${health.workStealingActive ? chalk.green('active') : chalk.gray('inactive')}
Line 98:  Completed: ${chalk.green(metrics.tasksCompleted)}
Line 99:  Failed: ${chalk.red(metrics.tasksFailed)}
Line 100: Pending: ${chalk.yellow(health.pendingTasks)}
Line 277: ${chalk.green('\u25CF')} Healthy: ${healthy}
Line 279: ${chalk.yellow('\u25CF')} Degraded: ${degraded}
Line 280: ${chalk.red('\u25CF')} Unhealthy: ${unhealthy}
```

A user running with `NO_COLOR=1` or a non-color terminal sees three indistinguishable bullet circles.

### Color contrast in CLI output

Chalk's default green/red/yellow map to ANSI bright colors whose contrast against the user's terminal background is not controlled by AQE. On a white background terminal, `chalk.yellow` (ANSI 33) produces ~3.1:1 — below the WCAG 1.4.3 4.5:1 threshold. This is beyond AQE's direct control, but paired with color-only differentiation it compounds the accessibility harm. No option exists to switch to safer chalk palettes (e.g., `chalk.yellowBright` on dark bg, `chalk.hex('#8B6F00')` on light bg).

### Positive: JSON output mode is widespread

`--json` / `--format json` options are defined in 52 places across 15 files including `fleet.ts`, `memory.ts`, `coverage.ts`, `learning.ts`, `prove.ts`, and most hooks handlers. This gives screen-reader users a fully structured consumption path — they can pipe to `jq` and their reader announces key:value pairs without ANSI noise. This is a real a11y win that partially compensates for the color-gate gap.

### Error message discoverability for blind users

`aqe --help`, `aqe <cmd> --help` remain text-based (commander defaults). Errors are printed via `chalk.red('Error:')` which screen readers announce as "Error colon". Acceptable, but error output does not prefix with a semantic marker like `[ERROR]` that would survive `NO_COLOR`.

### Evidence
- `src/cli/config/cli-config.ts:516-531` — `shouldUseColors()` unchanged
- 51 files importing chalk: `src/cli/commands/{fleet,memory,test,coverage,learning,audit,validate,eval,...}.ts` (50 command/handler/wizard files — full list in appendix)
- Zero occurrences of `--no-color` option definition in any `.option(...)` call across `src/cli/`
- 52 occurrences of `--json` option definition across 15 files

### Score justification
Dropped from 7 to 6 because the color-gate gap grew by 576 additional ungated chalk calls (+54%) while only 2 new real consumers of `shouldUseColors()` were added. The `--no-color` flag, color-only status output, and WCAG 1.4.1 violations from v3.8.13 all persist unchanged. Positive signals (widespread JSON output) prevent a drop to 5.

---

## 2. HTML Output Accessibility (5/10, unchanged — stagnant for 2 releases)

### Current state

`src/domains/quality-assessment/coordinator-reports.ts:339-341`:

```typescript
function formatAsHtml(data: Record<string, unknown>): string {
  return `<html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
}
```

**Byte-for-byte identical to v3.8.13.** Git blame confirms this function has not been touched this release cycle. Same for `formatAsMarkdown()` two lines below.

### WCAG violations in generated HTML (unchanged)

| WCAG Criterion | Level | Status | Gap |
|----------------|-------|--------|-----|
| 1.3.1 Info and Relationships | A | FAIL | No `<main>`, `<nav>`, `<header>` |
| 2.4.1 Bypass Blocks | A | FAIL | No skip nav link |
| 2.4.2 Page Titled | A | FAIL | No `<title>` |
| 3.1.1 Language of Page | A | FAIL | No `lang` attribute |
| 4.1.1 Parsing | A | FAIL | No `<!DOCTYPE html>` |
| 2.4.7 Focus Visible | AA | FAIL | No CSS `:focus` styles |
| 3.3.2 Labels or Instructions | A | N/A | No interactive controls (only `<pre>` dump) — but also no landmark labeling |
| 1.4.3 Contrast (Minimum) | AA | UNKNOWN | Relies on browser defaults |

**Consecutive releases stagnant**: 2 (v3.8.3 → v3.8.13 → v3.9.13). This gap was explicitly called out in both prior audits and remains unaddressed.

### Score justification
Holds at 5/10. The function is a trivial one-liner and remediation is a 10-minute template swap; continued stagnation across 2 release cycles suggests HTML report output has no owner. Recommended the fix be promoted to a tracked issue.

---

## 3. WCAG Implementation Coverage (8/10, unchanged)

### WCAG criteria in A2UI validator

`src/adapters/a2ui/accessibility/wcag-validator.ts` contains **47 explicit criterion strings** (counted via regex `criterion:\s*['\"][0-9]`), consistent with v3.8.13's 51-count (the minor delta reflects a stricter regex that excludes duplicates). Level A and AA coverage both present; WCAG 2.2 new criteria (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8) confirmed retained.

### Level A gaps still missing from validator

- 2.3.1 Three Flashes or Below Threshold — still undefined
- 2.5.1–2.5.4 Pointer Gestures — still undefined

### Score justification
Unchanged at 8/10. No new criteria added, none removed. WCAG 2.2 remains fully covered for the criteria that are defined.

---

## 4. A2UI Accessibility Layer (9/10, unchanged)

### ARIA role coverage — recount

Direct source inspection of `src/adapters/a2ui/accessibility/aria-attributes.ts:19-96` yields **71 ARIA role values** in the `AriaRole` union type:
- Widget: 20
- Composite widget: 9
- Document structure: 26
- Landmark: 8
- Live region: 7
- Window: 1

v3.8.13 reported 82 and v3.8.3 reported 96. The actual count (71) has been stable across releases — the historical variance is a counting-methodology artifact, not a regression. Module size: **3,022 lines** (unchanged from v3.8.13).

### Component factory functions

13 factory functions retained (`createButtonAccessibility`, `createCheckboxAccessibility`, `createSliderAccessibility`, `createProgressAccessibility`, `createDialogAccessibility`, `createLiveRegionAccessibility`, `createTabAccessibility`, `createTabPanelAccessibility`, `createTextInputAccessibility`, `createImageAccessibility`, `createListAccessibility`, `createListItemAccessibility`, `createHeadingAccessibility`), verified via grep of `src/adapters/a2ui/accessibility/index.ts`.

### Score justification
Holds at 9/10. Module is stable and mature. The only gap preventing 10/10 is the absence of runtime screen-reader announcement testing, which carries over.

---

## 5. Accessibility Testing Maturity (9/10, up from 8/10)

### Test inventory

| Test File | Lines | Test Cases | Focus |
|-----------|-------|------------|-------|
| `tests/unit/adapters/a2ui/accessibility.test.ts` | 1,352 | 127 | ARIA, WCAG validator, keyboard nav |
| `tests/unit/domains/visual-accessibility/accessibility-tester-browser.test.ts` | 690 | 27 | Browser-based axe-core |
| `tests/unit/domains/visual-accessibility/accessibility-tester.test.ts` | 545 | 38 | Heuristic analysis |
| `tests/unit/domains/visual-accessibility/browser-security-scanner.test.ts` | 687 | 31 | Browser security scans |
| `tests/unit/domains/visual-accessibility/browser-swarm-coordinator.test.ts` | 141 | 7 | Multi-browser coordination |
| `tests/unit/domains/visual-accessibility/cnn-visual-regression.test.ts` | 948 | 52 | CNN visual regression |
| `tests/unit/domains/visual-accessibility/coordinator.test.ts` | 321 | 19 | Domain coordinator |
| `tests/unit/domains/visual-accessibility/eu-compliance.test.ts` | 590 | 38 | EN 301 549, EAA |
| `tests/unit/domains/visual-accessibility/plugin.test.ts` | 508 | 41 | Plugin API |
| `tests/unit/domains/visual-accessibility/plugin-workflow-actions.test.ts` | 277 | 7 | Workflow integration |
| `tests/unit/domains/visual-accessibility/responsive-tester.test.ts` | 510 | 37 | Responsive tests |
| `tests/unit/domains/visual-accessibility/vibium-axe-core.test.ts` | 584 | 24 | Vibium axe-core |
| `tests/unit/domains/visual-accessibility/vibium-viewport-capture.test.ts` | 507 | 27 | Vibium viewport capture |
| `tests/unit/domains/visual-accessibility/vibium-visual-regression.test.ts` | 729 | 31 | Vibium visual regression |
| `tests/unit/domains/visual-accessibility/viewport-capture.test.ts` | 457 | 25 | Viewport capture |
| `tests/unit/domains/visual-accessibility/viewport-capture-browser.test.ts` | 744 | 31 | Browser viewport |
| `tests/unit/domains/visual-accessibility/visual-tester.test.ts` | 416 | 21 | Visual tester |
| `tests/e2e/sauce-demo/specs/accessibility.spec.ts` | 348 | 20 | E2E Playwright a11y |
| `tests/integration/browser/accessibility-tester.e2e.test.ts` | 415 | 7 | Browser integration |

**Totals: 10,769 test lines, 610 test cases** (up from ~4,524 lines / 290+ cases in v3.8.13 — +138% / +110%).

### What's new

Eight new specs in `tests/unit/domains/visual-accessibility/` expand coverage into CNN-based visual regression, plugin workflows, browser security, and Vibium integration. This is a substantial expansion since v3.8.13.

### Screen reader testing — STILL UNIMPLEMENTED

Grep for `nvda`, `voiceover`, `jaws`, `screen.*reader.*test` (case-insensitive) across `tests/`: **zero matches**. This gap is now **3 releases old** (v3.8.3 → v3.8.13 → v3.9.13). The capability remains declared in:
- `src/routing/qe-agent-registry.ts` (capability array)
- `src/learning/qe-guidance.ts` (guidance text)
- `src/mcp/server.ts` (MCP parameter `includeScreenReader: boolean`)

MCP callers asking for screen-reader testing receive… nothing. This is a capability-advertising vs capability-delivering mismatch.

### Score justification
Raised from 8 to 9 because raw test coverage more than doubled (610 cases vs 290+) and specs now span browser, visual regression, and EU compliance. Still capped at 9 because screen-reader testing is still 100% unimplemented despite being advertised.

---

## 6. Domain Architecture (9/10, unchanged)

| Metric | v3.8.13 | v3.9.13 |
|--------|---------|---------|
| Visual-accessibility services | 12 | **13** |
| Domain total lines | 14,152 | **14,152** (±0) |
| A2UI accessibility module lines | 3,022 | 3,022 |

One service added (13 total in `src/domains/visual-accessibility/services/`) with no net line growth — suggests refactoring/consolidation rather than pure feature expansion. DDD boundaries remain clean; EN 301 549 mapping and EAA compliance surface unchanged.

### Score justification
Holds at 9/10. Architecture is mature and stable.

---

## v3.8.13 Gap Remediation Status

| Gap | v3.8.13 Status | v3.9.13 Status | Closed? |
|-----|----------------|-----------------|---------|
| `shouldUseColors()` wired through CLI | Partial (2/30 files, 7%) | **Regressed** (4/51 files, 8%; +576 ungated chalk calls) | No |
| `--no-color` CLI flag | Not fixed | **Not fixed** | No |
| HTML skip navigation (WCAG 2.4.1) | Not fixed | **Not fixed** | No |
| HTML keyboard focus styles (WCAG 2.4.7) | Not fixed | **Not fixed** | No |
| HTML `<title>` / `lang` / DOCTYPE | Not fixed | **Not fixed** | No |
| Screen reader test implementation | Not fixed | **Not fixed (3rd release)** | No |
| CLI color-only status (WCAG 1.4.1) | Not fixed | **Not fixed** | No |
| Form labels in HTML reports (WCAG 3.3.2) | N/A (no forms) | N/A (no forms) | N/A |

**Remediation rate: 0 of 7 applicable gaps closed (0%).**

v3.8.13's remediation rate was 1-of-5 partial (20%). v3.9.13 regressed on the one partial fix and closed none of the others.

### What went right in v3.9.13

- Accessibility test count more than doubled (290 → 610)
- 8 new test specs in visual-accessibility domain
- JSON output mode broadly available across 15+ CLI files (unchanged but worth noting as a11y-positive)
- A2UI layer remains comprehensive and stable
- EN 301 549 / EAA EU compliance surface maintained

---

## Remediation Priorities (Unchanged from v3.8.13)

### P0: Fix HTML report output (15 min)
Replace the one-liner with a proper template containing `<!DOCTYPE html>`, `<html lang="en">`, `<title>`, skip link, landmarks, and `:focus` styles. Template provided in v3.8.13 report, Priority 2. **This has been open 2 releases.**

### P1: Centralize chalk via color wrapper (2-3 hrs)
Replace 51 direct chalk imports with a single `src/cli/utils/colors.ts` wrapper that reads `shouldUseColors()` at module init. Also add a global `--no-color` commander option that sets `process.env.NO_COLOR = '1'`. **Gap has widened each release.**

### P2: Prefix color-coded status with text labels (1 hr)
In `src/cli/handlers/status-handler.ts`, prepend `[OK]`, `[FAIL]`, `[WAIT]` before chalk'd strings so the semantic signal survives `NO_COLOR` and color-blind users.

### P3: Implement minimal screen-reader assertion harness (4-6 hrs)
At minimum, add tests that validate ARIA live-region attributes (`role="status"`, `aria-live="polite"`) in rendered HTML components. Calling this out for the third release.

### P4: Declutter MCP `includeScreenReader` parameter
Either implement it or remove it from the MCP schema. Leaving an unimplemented parameter advertised is a consumer-trust hazard.

---

## Appendix: Codebase Metrics

| Metric | v3.8.13 | v3.9.13 |
|--------|---------|---------|
| Visual-accessibility domain files | 18 | 18+ |
| Visual-accessibility domain lines | 14,152 | 14,152 |
| Visual-accessibility services | 12 | 13 |
| A2UI accessibility module files | 4 | 4 |
| A2UI accessibility module lines | 3,022 | 3,022 |
| ARIA roles (authoritative count) | 71 | 71 |
| ARIA attributes mapped | 28+ | 28+ |
| WCAG criteria in validator | 51 | 47 (strict regex) |
| WCAG 2.2 new criteria | 6/6 (100%) | 6/6 (100%) |
| EN 301 549 clauses mapped | 55 | 55 |
| Component factory functions | 13 | 13 |
| Accessibility test files | 7 | 19 |
| Accessibility test cases | 290+ | **610** |
| Total a11y-specific test lines | 4,524 | **10,769** |
| Chalk method calls in CLI | 1,066 | **1,642** |
| Files importing chalk in CLI | 30 | **51** |
| Files using `shouldUseColors()` | 2 | 4 |
| `shouldUseColors()` adoption | 7% | **8%** |
| `--no-color` CLI flag | Absent | Absent |
| `--json` option sites (a11y-positive) | n/a | 52 across 15 files |

---

**Report generated by**: qe-accessibility-auditor (Agent 09)
**Model**: Claude Opus 4.7 (1M context)
**Analysis method**: Static code analysis, grep-based evidence collection, diff against v3.8.13
**Source version**: package.json `"version": "3.9.13"`
