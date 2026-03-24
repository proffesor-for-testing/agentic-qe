---
name: "qe-visual-accessibility"
description: "Detect visual regressions, validate responsive design across viewports, and test WCAG 2.2 accessibility compliance. Use when checking UI consistency after changes, auditing accessibility, or testing cross-browser rendering."
---

# QE Visual Accessibility

Visual regression testing, responsive design validation, WCAG 2.2 compliance verification, and cross-browser rendering checks.

## Quick Start

```bash
# Visual regression test
aqe visual test --baseline production --current staging

# Responsive design test
aqe visual responsive --url https://example.com --viewports all

# Accessibility audit
aqe a11y audit --url https://example.com --standard wcag22-aa

# Cross-browser test
aqe visual cross-browser --url https://example.com --browsers chrome,firefox,safari
```

## Workflow

### Step 1: Visual Regression

```typescript
await visualTester.compareScreenshots({
  baseline: { source: 'production', pages: ['/', '/login', '/dashboard', '/settings'] },
  current: { source: 'staging', pages: ['/', '/login', '/dashboard', '/settings'] },
  comparison: {
    threshold: 0.1,       // 0.1% pixel difference
    antialiasing: true,
    ignoreRegions: ['#dynamic-content', '.timestamp']
  }
});
```

**Checkpoint:** Review all diffs > 0.1% before approving.

### Step 2: Responsive Testing

```typescript
await responsiveTester.test({
  url: 'https://example.com',
  viewports: [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 }
  ],
  checks: { layoutShift: true, contentOverflow: true, touchTargets: true, fontScaling: true }
});
```

**Checkpoint:** Verify no content overflow or layout shift issues.

### Step 3: Accessibility Audit

```typescript
await accessibilityAgent.audit({
  url: 'https://example.com',
  standard: 'WCAG22-AA',
  checks: {
    perceivable: { colorContrast: true, textAlternatives: true, captions: true },
    operable: { keyboardAccessible: true, noTimingIssues: true, navigable: true },
    understandable: { readable: true, predictable: true, inputAssistance: true },
    robust: { compatible: true, parseErrors: true }
  }
});
```

**Checkpoint:** Zero critical/serious violations before passing.

### Step 4: Cross-Browser Testing

```typescript
await visualTester.crossBrowser({
  url: 'https://example.com',
  browsers: ['chrome', 'firefox', 'safari', 'edge'],
  versions: 'latest-2',
  comparisons: { betweenBrowsers: true, betweenVersions: true, againstBaseline: true }
});
```

## WCAG 2.2 Auto-Testable Criteria

| Level | Criteria | Auto-Testable |
|-------|----------|---------------|
| A | Non-text Content | Yes |
| A | Info and Relationships | Partial |
| A | Color Contrast (4.5:1) | Yes |
| A | Keyboard Accessible | Yes |
| A | Focus Visible | Yes |
| AA | Reflow | Yes |
| AA | Text Spacing | Yes |
| AAA | Enhanced Contrast (7:1) | Yes |

## CI/CD Integration

```yaml
visual_testing:
  on_pr:
    - capture_screenshots
    - compare_to_baseline
    - run_a11y_audit
  thresholds:
    visual_diff: 0.1
    a11y_violations: 0
  artifacts:
    - screenshots/
    - diffs/
    - a11y-report.html
```

## Coordination

**Primary Agents**: qe-visual-tester, qe-accessibility-agent, qe-responsive-tester
**Related Skills**: qe-test-execution, qe-quality-assessment
