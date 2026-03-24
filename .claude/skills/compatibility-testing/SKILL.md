---
name: compatibility-testing
description: "Test cross-browser, cross-platform, and responsive design compatibility with Playwright and BrowserStack, targeting 95%+ user coverage. Use when validating browser support matrices, testing responsive breakpoints, or ensuring cross-device consistency."
---

# Compatibility Testing

<default_to_action>
When validating cross-browser/platform compatibility:
1. DEFINE browser matrix (cover 95%+ of users)
2. TEST responsive breakpoints (mobile, tablet, desktop)
3. RUN in parallel across browsers/devices
4. USE cloud services for device coverage (BrowserStack, Sauce Labs)
5. COMPARE visual screenshots across platforms

**Quick Compatibility Checklist:**
- Chrome, Firefox, Safari, Edge (latest + N-1)
- Mobile Safari (iOS), Mobile Chrome (Android)
- Screen sizes: 320px, 768px, 1920px
- Test on actual target devices for critical flows

**Critical Success Factors:**
- Users access from 100+ browser/device combinations
- Test where users are, not where you develop
- Cloud testing reduces 10 hours to 15 minutes
</default_to_action>

## Quick Reference Card

### When to Use
- Before release
- After CSS/layout changes
- Launching in new markets
- Responsive design validation

---

## Cross-Browser with Playwright

```javascript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } }
  ]
});

// Run: npx playwright test --project=chromium --project=firefox
```

---

## Cloud Testing Integration

```javascript
// BrowserStack configuration
const capabilities = {
  'browserName': 'Chrome',
  'browser_version': '118.0',
  'os': 'Windows',
  'os_version': '11',
  'browserstack.user': process.env.BROWSERSTACK_USER,
  'browserstack.key': process.env.BROWSERSTACK_KEY
};

// Parallel execution across devices
const deviceMatrix = [
  { os: 'Windows', browser: 'Chrome' },
  { os: 'OS X', browser: 'Safari' },
  { os: 'Android', device: 'Samsung Galaxy S24' },
  { os: 'iOS', device: 'iPhone 15' }
];
```

---

## Agent-Driven Compatibility Testing

```typescript
// Cross-platform visual comparison
await Task("Compatibility Testing", {
  url: 'https://example.com',
  browsers: ['chrome', 'firefox', 'safari', 'edge'],
  devices: ['desktop', 'tablet', 'mobile'],
  platform: 'browserstack',
  parallel: true
}, "qe-visual-tester");

// Returns:
// {
//   combinations: 12,  // 4 browsers × 3 devices
//   passed: 11,
//   differences: [{ browser: 'safari', device: 'mobile', diff: 0.02 }]
// }
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/compatibility-testing/
├── browser-matrix/*     - Browser/version configurations
├── device-matrix/*      - Device configurations
├── visual-diffs/*       - Cross-browser visual differences
└── reports/*            - Compatibility reports
```

### Fleet Coordination
```typescript
const compatFleet = await FleetManager.coordinate({
  strategy: 'compatibility-testing',
  agents: [
    'qe-visual-tester',       // Visual comparison
    'qe-test-executor',       // Cross-browser execution
    'qe-performance-tester'   // Performance by platform
  ],
  topology: 'parallel'
});
```

---

## Related Skills
- [mobile-testing](../mobile-testing/) - Mobile-specific testing
- [visual-testing-advanced](../visual-testing-advanced/) - Visual regression
- [accessibility-testing](../accessibility-testing/) - Cross-platform a11y

---

## Remember

**Cover 95%+ of your user base.** Use analytics to identify actual browser/device usage. Don't waste time on browsers nobody uses.

**With Agents:** Agents orchestrate parallel cross-browser testing across cloud platforms. `qe-visual-tester` catches visual inconsistencies across platforms automatically.
