# Security-Visual Testing Skill

Comprehensive security-first visual testing skill that integrates browser automation, URL validation, PII detection, visual regression, and accessibility testing.

## Overview

This skill combines multiple testing concerns into a unified workflow:

- **Security Validation**: URL validation, XSS/SQL injection detection
- **PII Detection**: Automatic detection and masking of sensitive data
- **Visual Regression**: Multi-viewport screenshot comparison with baselines
- **Accessibility Testing**: WCAG 2.1 compliance auditing (A/AA/AAA)
- **Parallel Execution**: Concurrent testing across multiple viewports

## Architecture

```
SecurityVisualTestingSkill
├── Browser Integration (@claude-flow/browser)
│   ├── Vibium (MCP) - preferred for real browser control
│   └── agent-browser (CLI) - fallback for CLI environments
├── Visual-Accessibility Domain
│   ├── Visual regression testing
│   ├── Accessibility auditing (axe-core)
│   └── Responsive testing
├── Security Scanner
│   ├── URL validation
│   ├── XSS detection
│   └── SQL injection detection
└── PII Detector
    ├── Email, phone, SSN detection
    ├── Credit card, API key detection
    └── Automatic masking with blur/redact
```

## Integration Pattern

**CRITICAL**: This skill follows proper dependency injection. All dependencies are passed via constructor:

```typescript
// ✅ CORRECT: Dependencies injected
const skill = new SecurityVisualTestingSkill(
  visualCoordinator,  // Required: IVisualAccessibilityCoordinator
  config              // Optional: SecurityVisualTestingConfig
);

// ❌ WRONG: Internal dependency creation (don't do this!)
const skill = new SecurityVisualTestingSkill();
skill.createBrowser(); // Internal creation is not integrated!
```

### Required Dependencies

1. **IVisualAccessibilityCoordinator**: From visual-accessibility domain
   - Handles visual regression testing
   - Manages baselines and diffs
   - Runs accessibility audits

2. **Browser Client**: Created automatically from @claude-flow/browser
   - Prefers Vibium MCP if available
   - Falls back to agent-browser CLI
   - Throws error if neither is available

## Workflows

### 1. Security-Visual Audit

Full pipeline with URL validation, visual testing, and accessibility auditing.

```typescript
const result = await skill.executeSecurityVisualAudit({
  urls: [
    'https://example.com/dashboard',
    'https://example.com/profile',
    'https://example.com/checkout',
  ],
  viewports: [
    { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },   // iPhone
    { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },  // iPad
    { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, // Desktop
  ],
  wcagLevel: 'AA',
  validateSecurity: true,
  detectPII: true,
  parallel: true,
  maxConcurrent: 4,
});

if (result.success) {
  const report = result.value;
  console.log(`Audit Summary:
    - Total URLs: ${report.summary.totalUrls}
    - Secure URLs: ${report.summary.secureUrls}
    - Visual Tests Passed: ${report.summary.visualTestsPassed}
    - Visual Tests Failed: ${report.summary.visualTestsFailed}
    - Accessibility Issues: ${report.summary.accessibilityIssues}
    - PII Detections: ${report.summary.piiDetections}
  `);

  // Review recommendations
  for (const rec of report.recommendations) {
    console.log(`[${rec.severity}] ${rec.type}: ${rec.description}`);
    console.log(`  Action: ${rec.action}`);
  }
}
```

**Pipeline Steps:**

1. **Validate URLs**: Check for XSS, SQL injection, unsafe protocols
2. **Security Scan**: Block malicious URLs (if configured)
3. **Capture Screenshots**: Multi-viewport in parallel
4. **Visual Comparison**: Diff against baselines
5. **Accessibility Audit**: WCAG compliance check
6. **PII Detection**: Scan for sensitive data
7. **Generate Report**: Unified findings and recommendations

### 2. PII-Safe Screenshot

Capture screenshots with automatic PII detection and masking.

```typescript
const result = await skill.executePIISafeScreenshot({
  url: 'https://example.com/dashboard',
  viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  fullPage: true,
  maskPII: true,
  maskingStrategy: {
    method: 'blur',
    intensity: 'high',
  },
  savePath: './screenshots/dashboard-safe.png',
});

if (result.success) {
  const screenshot = result.value;
  if (screenshot.piiDetected) {
    console.log(`PII detected: ${screenshot.piiTypes.join(', ')}`);
    console.log(`Masked screenshot saved to: ${screenshot.screenshot.masked}`);
  } else {
    console.log(`No PII detected, screenshot saved to: ${screenshot.screenshot.original}`);
  }
}
```

**PII Types Detected:**

- Email addresses
- Phone numbers
- Social Security Numbers (SSN)
- Credit card numbers
- API keys and tokens
- Passwords (in forms)
- Physical addresses
- Names (when in sensitive contexts)

**Masking Strategies:**

- `blur`: Gaussian blur over sensitive areas (default)
- `redact`: Black boxes over sensitive areas
- `pixelate`: Pixelation effect
- `overlay`: Custom color overlay

### 3. Responsive Visual Audit

Test visual consistency across multiple viewports with layout shift detection.

```typescript
const result = await skill.executeResponsiveVisualAudit({
  url: 'https://example.com/pricing',
  viewports: [
    { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },   // iPhone SE
    { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },   // iPhone X
    { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },  // iPad
    { width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true },  // iPad Landscape
    { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, // Laptop
    { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, // Desktop
  ],
  compareBaselines: true,
  detectLayoutShifts: true,
});

if (result.success) {
  const report = result.value;
  console.log(`Responsive Audit for ${report.url}:`);

  // Layout shifts
  for (const shift of report.layoutShifts) {
    if (shift.severity === 'high') {
      console.log(`  ⚠️ Layout shift at ${shift.viewport.width}x${shift.viewport.height}`);
      console.log(`     Score: ${shift.score}, Affected: ${shift.affectedElements.join(', ')}`);
    }
  }

  // Visual regressions per viewport
  for (const regression of report.visualRegressions) {
    if (regression.status === 'failed') {
      console.log(`  ❌ Visual regression at ${regression.viewport.width}x${regression.viewport.height}`);
      console.log(`     Diff: ${regression.diffPercentage.toFixed(2)}%`);
    }
  }

  // Recommendations
  for (const rec of report.recommendations) {
    console.log(`  💡 ${rec}`);
  }
}
```

## Configuration

```typescript
const config: SecurityVisualTestingConfig = {
  browser: {
    headless: true,           // Run headless browser
    timeout: 30000,           // 30s timeout
    userAgent: 'custom-ua',   // Optional custom user agent
  },
  security: {
    validateUrls: true,       // Enable URL validation
    blockMaliciousUrls: true, // Block URLs with critical risk
    allowedProtocols: ['https', 'http'],
  },
  pii: {
    enabled: true,            // Enable PII detection
    autoMask: true,           // Automatically mask PII
    maskingStrategy: {
      method: 'blur',
      intensity: 'high',
    },
    detectionThreshold: 0.7,  // 70% confidence threshold
  },
  visual: {
    compareBaselines: true,   // Compare against baselines
    diffThreshold: 0.01,      // 1% diff threshold
    captureFullPage: false,   // Viewport only (not full page scroll)
  },
  accessibility: {
    enabled: true,            // Enable accessibility audits
    wcagLevel: 'AA',          // WCAG 2.1 Level AA
    runOnFailure: false,      // Don't run a11y if visual tests fail
  },
  parallel: {
    enabled: true,            // Enable parallel execution
    maxConcurrent: 4,         // Max 4 concurrent browser sessions
  },
};
```

## Usage Examples

### Example 1: E-commerce Visual Testing

```typescript
import { createSecurityVisualTestingSkill } from './skills/security-visual-testing';

const skill = createSecurityVisualTestingSkill(visualCoordinator, {
  visual: { diffThreshold: 0.005 }, // Stricter diff threshold for e-commerce
  accessibility: { wcagLevel: 'AAA' }, // Highest accessibility standard
});

await skill.initialize();

const result = await skill.executeSecurityVisualAudit({
  urls: [
    'https://shop.example.com',
    'https://shop.example.com/products',
    'https://shop.example.com/cart',
    'https://shop.example.com/checkout',
  ],
  viewports: [
    { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  ],
  wcagLevel: 'AAA',
  detectPII: true, // Important for checkout pages
});

await skill.dispose();
```

### Example 2: PII-Safe Documentation Screenshots

```typescript
const skill = createSecurityVisualTestingSkill(visualCoordinator, {
  pii: {
    autoMask: true,
    maskingStrategy: { method: 'redact', intensity: 'high' },
  },
});

await skill.initialize();

// Capture screenshots for documentation
const dashboardScreenshot = await skill.executePIISafeScreenshot({
  url: 'https://app.example.com/dashboard',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  fullPage: true,
  savePath: './docs/screenshots/dashboard.png',
});

const profileScreenshot = await skill.executePIISafeScreenshot({
  url: 'https://app.example.com/profile',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  fullPage: true,
  savePath: './docs/screenshots/profile.png',
});

await skill.dispose();
```

### Example 3: Mobile-First Responsive Testing

```typescript
const skill = createSecurityVisualTestingSkill(visualCoordinator, {
  parallel: { maxConcurrent: 6 }, // Test 6 devices in parallel
});

await skill.initialize();

const result = await skill.executeResponsiveVisualAudit({
  url: 'https://mobile-first.example.com',
  viewports: [
    // Mobile portrait
    { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },   // iPhone SE
    { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },   // iPhone 8
    { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true },   // iPhone X
    { width: 414, height: 896, deviceScaleFactor: 3, isMobile: true, hasTouch: true },   // iPhone 11 Pro Max
    // Mobile landscape
    { width: 667, height: 375, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { width: 896, height: 414, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ],
  detectLayoutShifts: true,
});

await skill.dispose();
```

## Integration Tests

See [Milestone 5, Action A13](../../docs/milestones/milestone-5-browser-integration.md) for integration test examples.

## Error Handling

All methods return `Result<T, Error>` for type-safe error handling:

```typescript
const result = await skill.executeSecurityVisualAudit(options);

if (result.success) {
  const report = result.value;
  // Process successful result
} else {
  const error = result.error;
  console.error(`Audit failed: ${error.message}`);
  // Handle error
}
```

## Performance

- **Parallel Execution**: Test multiple viewports concurrently (configurable via `maxConcurrent`)
- **Browser Reuse**: Single browser instance across all tests
- **Baseline Caching**: Visual baselines stored in memory for fast comparison
- **PII Detection**: Optimized pattern matching with configurable threshold

## Security

- **URL Validation**: All URLs validated before navigation
- **Malicious URL Blocking**: Critical-risk URLs blocked by default
- **PII Protection**: Automatic detection and masking of sensitive data
- **Protocol Restrictions**: Only HTTPS/HTTP allowed by default
- **XSS Prevention**: Pattern detection for common XSS vectors
- **SQL Injection Prevention**: Pattern detection for SQL injection attempts

## Limitations

1. **PII Detection**: Current implementation is placeholder (OCR not implemented)
2. **Layout Shift Detection**: Requires element position tracking (not implemented)
3. **Browser Support**: Requires @claude-flow/browser (Vibium MCP) or agent-browser CLI
4. **Viewport Limitation**: Max concurrent sessions limited by browser client

## Future Enhancements

- [ ] Real PII detection with OCR (Tesseract.js or cloud OCR)
- [ ] Layout shift detection with element tracking
- [ ] Advanced masking strategies (face detection, custom patterns)
- [ ] Performance metrics (Web Vitals, CLS, LCP)
- [ ] Video recording for test sessions
- [ ] Multi-browser support (Firefox, Safari)
- [ ] Cloud screenshot storage integration

## Related Documentation

- [Browser Integration](../../integrations/browser/README.md)
- [Visual-Accessibility Domain](../../domains/visual-accessibility/README.md)
- [Milestone 5: Browser Integration](../../docs/milestones/milestone-5-browser-integration.md)
