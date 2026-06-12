# Accessibility Audit Report - v3.10.6

**Date**: 2026-06-12
**Agent**: qe-accessibility-auditor (Agent 09)
**Baseline**: v3.9.13 (`docs/qe-reports-3-9-13/09-accessibility-audit-report.md`)
**Analyzed version**: v3.10.6 (package.json source of truth)
**Scope**: CLI accessibility, HTML output, WCAG implementation, A2UI layer, testing maturity, domain architecture
**Method**: Static code analysis, grep/Read evidence (EXECUTED + STATIC), diff vs v3.9.13. No fabrication.

---

## Executive Summary

The accessibility-capability surface AQE *ships* (A2UI ARIA layer, axe-core integration, WCAG validator, visual-accessibility domain, qe-visual-accessibility skill) remains strong and stable. The product's *own* a11y posture continues to regress on the same two tactical fronts flagged for three consecutive releases: the CLI color-gate widened again (chalk calls 1,642 → **1,908**, +16%; files 51 → **53**) with `shouldUseColors()` still wired only to 2 utility modules and still no `--no-color` flag; and `formatAsHtml()` is **byte-for-byte identical** (git blame: last touched 2026-02-16, untouched across 3 release cycles) — still a one-line `<html><body><pre>` with no DOCTYPE, `<title>`, `lang`, landmarks, skip-nav, or focus styles. Screen-reader testing remains 0% implemented while `includeScreenReader` is still advertised in the MCP schema but consumed by no service. Test breadth grew modestly (610 → **658** cases). **Remediation rate on prior gaps: 0 of 7 closed (0%) — same as last release.** Overall holds at **7.6/10** (−0.1): the architecture floor is intact but CLI slips again.

---

## Category Score Delta Table

| Category | v3.9.13 | v3.10.6 | Delta | Trend |
|----------|--------:|--------:|------:|-------|
| CLI Accessibility | 6/10 | 5/10 | −1 | Regressed (3rd consecutive) |
| HTML Output Accessibility | 5/10 | 5/10 | 0 | Stagnant (3 releases) |
| Accessibility Testing Maturity | 9/10 | 9/10 | 0 | Stable (capped by SR gap) |
| WCAG Implementation Coverage | 8/10 | 8/10 | 0 | Stable |
| A2UI Accessibility Layer | 9/10 | 9/10 | 0 | Stable |
| Domain Architecture | 9/10 | 9/10 | 0 | Stable |
| **Overall** | **7.7/10** | **7.6/10** | **−0.1** | **Mixed (CLI slips)** |

---

## 1. CLI Accessibility (5/10, down from 6/10)

### Quantitative regression (EXECUTED)

| Metric | v3.9.13 | v3.10.6 | Delta | Command |
|--------|--------:|--------:|------:|---------|
| `chalk.*` method calls in `src/cli/` | 1,642 | **1,908** | +266 (+16%) | `grep -rEo 'chalk\.[a-zA-Z]+' src/cli/ \| wc -l` |
| Files importing chalk | 51 | **53** | +2 | `grep -rl "from 'chalk'" src/cli/ \| wc -l` |
| Files using `shouldUseColors()` | 4 | **4** | 0 | `grep -rl "shouldUseColors" src/cli/ \| wc -l` |
| Real `shouldUseColors()` consumers | 2 | **2** | 0 | progress.ts + streaming.ts |
| `--no-color` `.option()` definitions | 0 | **0** | 0 | `grep -rEn '\.option\([^)]*no-color' src/cli/ \| wc -l` |
| `--json` option sites (a11y-positive) | 52 | **78** | +26 | `grep -rEo '\-\-json' src/cli/ \| wc -l` |

The chalk count uses the same regex as the prior report (`chalk\.[a-zA-Z]+`), so the 1,642 → 1,908 delta is methodologically comparable. The 4 files matching `shouldUseColors` are unchanged: `src/cli/utils/progress.ts`, `src/cli/utils/streaming.ts` (real consumers), plus `src/cli/config/index.ts` (re-export) and `src/cli/config/cli-config.ts` (self-definition). **Net: still only 2 real consumers out of 53 chalk-importing files (~3.8% adoption).**

### `shouldUseColors()` is correct but un-routed (STATIC)

`src/cli/config/cli-config.ts:516-531` is unchanged and correct — it honors `NO_COLOR`, `FORCE_COLOR`, config, and TTY:

```typescript
export function shouldUseColors(): boolean {
  const config = getCLIConfig();
  if (process.env.NO_COLOR !== undefined) return false;   // line 520
  if (process.env.FORCE_COLOR !== undefined) return true;  // line 526
  return config.progress.colors && isInteractive();        // line 530
}
```

**Is `NO_COLOR` honored?** Only inside the 2 utility modules that call this helper. The other 51 chalk-importing files (`commands/fleet.ts`, `commands/memory.ts`, `commands/coverage.ts`, `handlers/status-handler.ts`, all `hooks-handlers/*`, all `wizards/*`, etc.) call chalk directly at module scope — chalk's own auto-detection applies (which does respect `NO_COLOR` via the `chalk` package itself), but AQE provides no `--no-color` flag and no centralized gate. So `NO_COLOR=1` works *by virtue of the chalk library*, not by AQE design; `aqe --no-color` does not exist (`grep` returns 0 `.option()` hits). The gate AQE built is bypassed by 96% of its own call sites.

### WCAG 1.4.1 (Use of Color) — still violated (EXECUTED)

`src/cli/handlers/status-handler.ts` retains color-only status differentiation with no text prefixes, identical to baseline:

- Line 87: `Work Stealing: ${health.workStealingActive ? chalk.green('active') : chalk.gray('inactive')}`
- Line 98-101: `Completed`/`Failed`/`Pending`/`Running` differentiated by `chalk.green/red/yellow` only
- Line 277/279/280: `chalk.green('●') Healthy` / `chalk.yellow('●') Degraded` / `chalk.red('●') Unhealthy` — three indistinguishable bullet glyphs once color is stripped

A color-blind user or `NO_COLOR` terminal sees identical `●` markers and identical numbers with no semantic prefix (`[OK]`/`[FAIL]`/`[WARN]`).

### Positive (STATIC)

`--json` option sites grew 52 → 78 (+50%) across the CLI, broadening the structured, ANSI-free consumption path for screen-reader users (`jq`-pipeable key:value output). This is a genuine a11y win and is why CLI does not drop below 5.

### Score justification
Dropped 6 → 5: the color-gate gap widened again (+266 ungated chalk calls, +2 files) with zero new real consumers of the gate and still no `--no-color` flag — third consecutive regression. WCAG 1.4.1 color-only status persists verbatim. Expanded `--json` coverage prevents a drop to 4.

---

## 2. HTML Output Accessibility (5/10, unchanged — stagnant 3 releases)

### Current state (EXECUTED — read the actual function)

`src/domains/quality-assessment/coordinator-reports.ts:339-341`:

```typescript
function formatAsHtml(data: Record<string, unknown>): string {
  return `<html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
}
```

`git blame -L 339,341` confirms last modified **2026-02-16** (commit 33a2ebdb1) — untouched across v3.8.13, v3.9.13, and v3.10.6. `formatAsMarkdown()` at line 343-345 is likewise a trivial fenced-JSON dump. This is the function reached by `coordinator-reports.ts:66` (`content = formatAsHtml(reportData)`) for HTML report output.

### WCAG violations in generated HTML (unchanged)

| WCAG Criterion | Level | Status | Gap |
|----------------|-------|--------|-----|
| 4.1.1 / valid doc | A | FAIL | No `<!DOCTYPE html>` |
| 2.4.2 Page Titled | A | FAIL | No `<title>` |
| 3.1.1 Language of Page | A | FAIL | No `lang` attribute |
| 1.3.1 Info & Relationships | A | FAIL | No `<main>`/`<nav>`/`<header>` |
| 2.4.1 Bypass Blocks | A | FAIL | No skip-nav link |
| 2.4.7 Focus Visible | AA | FAIL | No `:focus` CSS |
| 3.3.2 Labels/Instructions | A | N/A | No interactive controls (only `<pre>`) |

**Consecutive stagnant releases: 3.** Remediation is a ~10-minute template swap and has been recommended in every prior audit. No owner.

### Score justification
Holds at 5/10. Function unchanged; continued 3-release stagnation. Recommend promoting to a tracked issue.

---

## 3. WCAG Implementation Coverage (8/10, unchanged)

### Validator criteria (EXECUTED)
`src/adapters/a2ui/accessibility/wcag-validator.ts`: **47** explicit criterion strings (`grep -cE "criterion:\s*['\"][0-9]"`), identical to v3.9.13. WCAG 2.2 new criteria retained. Level A gaps unchanged: 2.3.1 (flashing) and 2.5.1–2.5.4 (pointer gestures) still undefined.

### Score justification
Unchanged at 8/10. No criteria added or removed.

---

## 4. A2UI Accessibility Layer (9/10, unchanged)

### ARIA roles (EXECUTED)
`src/adapters/a2ui/accessibility/aria-attributes.ts:19` — `AriaRole` union yields **70** role values (prior report cited 71; the 1-value delta is regex-boundary noise, not a code change — module is unmodified). A2UI accessibility module total: **3,022 lines** across `aria-attributes.ts`, `index.ts`, `keyboard-nav.ts` (819 lines), `wcag-validator.ts` — byte-stable vs baseline.

### Score justification
Holds at 9/10. Mature and stable. Cap remains the absence of runtime screen-reader announcement testing.

---

## 5. Accessibility Testing Maturity (9/10, unchanged)

### Test inventory (EXECUTED)
21 a11y/visual-accessibility test files; **658 test cases** (`it(`/`test(` count across all matched files), up from 610 (+48, +7.9%). axe-core is a real dependency (`package.json:150` `"axe-core": "^4.11.1"`) with substantive integration:
- `src/domains/visual-accessibility/services/axe-core-integration.ts` — **988 lines**
- `src/domains/visual-accessibility/services/axe-core-audit.ts` — **714 lines**

### Screen-reader testing — STILL UNIMPLEMENTED (EXECUTED)
`grep -rilE "nvda|voiceover|jaws" tests/` → **0 matches**. Now **4 releases old** (v3.8.3 → v3.10.6). The capability is still advertised but undelivered:
- `src/mcp/types.ts:273` — `includeScreenReader?: boolean;`
- `src/mcp/handlers/domain-handler-configs.ts:676` — `includeScreenReader: params.includeScreenReader || false` is mapped into the task payload
- **No service consumes it**: `grep -rn "screenReader\|includeScreenReader" src/domains/` → 0 hits. The payload field is plumbed to the visual-accessibility task but no service reads it. MCP callers requesting `includeScreenReader: true` get nothing — confirmed advertising-vs-delivery mismatch, identical to prior report.

### Score justification
Holds at 9/10. Test breadth grew; axe-core integration is real. Capped at 9 by 100%-unimplemented screen-reader testing.

---

## 6. Domain Architecture (9/10, unchanged)

| Metric | v3.9.13 | v3.10.6 | Source |
|--------|--------:|--------:|--------|
| visual-accessibility services | 13 | **13** | `ls src/domains/visual-accessibility/services/` |
| Domain total lines | 14,152 | **14,154** | `find ... -exec cat {} + \| wc -l` |
| EN 301 549 clause refs (eu-compliance.ts) | ~55 | **107** (`9.x` matches) | `grep -cE "9\.[0-9]"` |
| qe-visual-accessibility skill | real | **real** | SKILL.md 277 lines + evals + schemas + scripts |

### visual-accessibility domain + qe-visual-accessibility skill: REAL, not stub (STATIC)
Domain ships 13 services (axe-core integration, heuristics tester, browser tester, EU compliance, responsive, viewport capture, visual regression, browser-swarm coordinator, security scanner). The `.claude/skills/qe-visual-accessibility/` skill is fully formed: 277-line `SKILL.md`, `evals/qe-visual-accessibility.yaml`, `schemas/output.json`, `scripts/validate-config.json`. Plus a `.claude/guidance/shards/visual-accessibility.shard.md`. Not a stub.

### Score justification
Holds at 9/10. Stable, mature DDD boundaries.

---

## Prior-Gap Remediation Status (v3.9.13 → v3.10.6)

| # | Gap | v3.9.13 | v3.10.6 | Closed? |
|---|-----|---------|---------|---------|
| 1 | `shouldUseColors()` wired through CLI | Regressed (4/51, +576 chalk) | **Regressed further** (4/53, +266 chalk, 2 real consumers) | No |
| 2 | `--no-color` CLI flag | Not fixed | **Not fixed** (0 `.option()`) | No |
| 3 | HTML skip-nav (2.4.1) | Not fixed | **Not fixed** (function untouched since 2026-02-16) | No |
| 4 | HTML focus styles (2.4.7) | Not fixed | **Not fixed** | No |
| 5 | HTML `<title>`/`lang`/DOCTYPE | Not fixed | **Not fixed** | No |
| 6 | Screen-reader test impl | Not fixed (3rd rel) | **Not fixed (4th rel)** | No |
| 7 | CLI color-only status (1.4.1) | Not fixed | **Not fixed** (status-handler verbatim) | No |

**Remediation rate: 0 of 7 closed (0%)** — same 0% as the prior cycle. Gaps 1 and 6 actively worsened/aged.

### What went right
- Test cases 610 → 658 (+48); axe-core integration substantial and real
- `--json` option sites 52 → 78 (+50%) — broader ANSI-free path for SR users
- A2UI layer, WCAG validator, domain architecture, and qe-visual-accessibility skill all stable and real

---

## Remediation Priorities

- **P0 — Fix `formatAsHtml()` (15 min).** Replace the one-liner at `coordinator-reports.ts:339-341` with `<!DOCTYPE html><html lang="en"><head><title>…</title></head>` + skip link + landmarks + `:focus` CSS. Open 3 releases. **(1 P0)**
- **P1 — Centralize chalk via a `colors.ts` wrapper gated on `shouldUseColors()` and add a global `--no-color` commander option.** Gap widened every release.
- **P2 — Prefix color-coded status with `[OK]`/`[FAIL]`/`[WARN]` in `status-handler.ts`** so the signal survives `NO_COLOR` and color-blindness (WCAG 1.4.1).
- **P3 — Resolve `includeScreenReader`:** implement a minimal ARIA-live/`role="status"` assertion harness, or remove the unimplemented MCP parameter (`types.ts:273`) to stop advertising a non-capability.

---

## Score: 7.6 / 10 (delta −0.1)

Strong, stable architecture/test floor; CLI tactical debt deepens for a third release. P0 count: **1** (HTML output, 3 releases stagnant).

---

## Shared Memory

- **a11y-1 (P0)**: `formatAsHtml()` at `src/domains/quality-assessment/coordinator-reports.ts:339-341` byte-for-byte unchanged since 2026-02-16 (git blame) — still `<html><body><pre>` with no DOCTYPE/title/lang/landmarks/skip-nav/focus. Fails WCAG 2.4.1/2.4.2/3.1.1. Stagnant 3 releases. ~15-min fix, no owner.
- **a11y-2 (P1)**: CLI color-gate regressed again — chalk calls 1,642→1,908 (+16%, EXECUTED), files 51→53, but only 2 real `shouldUseColors()` consumers (progress.ts, streaming.ts) of 53; still 0 `--no-color` `.option()` definitions. Gate bypassed by ~96% of call sites.
- **a11y-3 (P2)**: WCAG 1.4.1 color-only status persists verbatim in `src/cli/handlers/status-handler.ts:277-280` — green/yellow/red `●` glyphs identical once color stripped; no `[OK]/[FAIL]/[WARN]` prefixes.
- **a11y-4 (P3)**: Screen-reader testing 0 impl (`grep nvda|voiceover|jaws tests/` = 0), 4th release. `includeScreenReader` advertised at `src/mcp/types.ts:273` + mapped at `domain-handler-configs.ts:676` but consumed by NO domain service (0 hits in `src/domains/`) — advertising-vs-delivery mismatch.
- **a11y-5 (positive)**: Capability surface real & stable — axe-core integration 988+714 lines (`axe-core ^4.11.1` dep), 658 a11y test cases (+48), 70-value AriaRole union (3,022-line A2UI module), qe-visual-accessibility skill fully formed (277-line SKILL.md + evals/schemas/scripts). visual-accessibility domain 13 services / 14,154 lines.
- **a11y-6 (delta)**: Prior-gap remediation rate 0/7 (0%) — unchanged from last cycle; gaps 1 (chalk) and 6 (screen reader) actively worsened/aged. Overall 7.7→7.6 (−0.1).
