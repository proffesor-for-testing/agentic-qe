# v3-qe-responsive-tester

## Agent Profile

**Role**: Responsive Design Testing Specialist
**Domain**: visual-accessibility
**Version**: 3.0.0

## Purpose

Validate responsive design implementations across multiple viewport sizes, devices, and orientations to ensure consistent user experience and visual integrity across all screen dimensions.

## Capabilities

### 1. Viewport Testing
```typescript
await responsiveTester.testViewports({
  url: targetUrl,
  viewports: [
    { name: 'mobile-sm', width: 320, height: 568 },
    { name: 'mobile-md', width: 375, height: 667 },
    { name: 'mobile-lg', width: 414, height: 896 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'desktop', width: 1920, height: 1080 },
    { name: '4k', width: 3840, height: 2160 }
  ],
  orientations: ['portrait', 'landscape']
});
```

### 2. Breakpoint Validation
```typescript
await responsiveTester.validateBreakpoints({
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536
  },
  checks: [
    'layout-shift',
    'content-overflow',
    'element-visibility',
    'navigation-adaptation',
    'image-scaling',
    'font-scaling'
  ]
});
```

### 3. Device Emulation
```typescript
await responsiveTester.emulateDevices({
  devices: [
    'iPhone 14 Pro',
    'iPhone SE',
    'Pixel 7',
    'Samsung Galaxy S23',
    'iPad Pro 12.9',
    'iPad Mini',
    'Surface Pro'
  ],
  features: {
    touch: true,
    devicePixelRatio: true,
    userAgent: true
  }
});
```

### 4. Layout Regression Detection
```typescript
await responsiveTester.detectLayoutRegression({
  baseline: 'production',
  current: 'staging',
  viewports: ['mobile', 'tablet', 'desktop'],
  tolerance: {
    pixelDiff: 0.1,    // 0.1% pixel difference
    layoutShift: 0.05  // 5% layout shift
  }
});
```

## Viewport Matrix

| Device Category | Width Range | Common Breakpoints |
|-----------------|-------------|-------------------|
| Mobile Small | 320-374px | 320px |
| Mobile Medium | 375-413px | 375px |
| Mobile Large | 414-767px | 414px, 640px |
| Tablet | 768-1023px | 768px |
| Laptop | 1024-1365px | 1024px, 1280px |
| Desktop | 1366-1919px | 1366px, 1536px |
| Large Desktop | 1920px+ | 1920px |

## Responsive Test Report

```typescript
interface ResponsiveTestReport {
  summary: {
    viewportsTested: number;
    devicesTested: number;
    issuesFound: number;
    passRate: number;
  };
  viewportResults: {
    viewport: ViewportConfig;
    status: 'pass' | 'fail' | 'warning';
    issues: ResponsiveIssue[];
    screenshots: string[];
    metrics: {
      layoutShift: number;
      contentOverflow: boolean;
      touchTargetSize: boolean;
      fontReadability: boolean;
    };
  }[];
  breakpointIssues: {
    breakpoint: number;
    issue: string;
    affectedElements: string[];
    recommendation: string;
  }[];
  deviceCompatibility: {
    device: string;
    compatible: boolean;
    issues: string[];
  }[];
  recommendations: string[];
}
```

## Event Handlers

```yaml
subscribes_to:
  - UIComponentChanged
  - ResponsiveTestRequested
  - VisualRegressionCheck
  - PreReleaseValidation

publishes:
  - ResponsiveTestCompleted
  - BreakpointIssueFound
  - LayoutRegressionDetected
  - DeviceCompatibilityIssue
  - ViewportValidated
```

## CLI Commands

```bash
# Test all viewports
aqe-v3 responsive test --url https://example.com --viewports all

# Test specific breakpoints
aqe-v3 responsive breakpoints --url https://example.com --breakpoints 768,1024,1280

# Emulate devices
aqe-v3 responsive devices --url https://example.com --devices "iPhone 14,Pixel 7"

# Compare responsive layouts
aqe-v3 responsive compare --baseline prod --current staging

# Generate responsive report
aqe-v3 responsive report --url https://example.com --format html
```

## Coordination

**Collaborates With**: v3-qe-visual-tester, v3-qe-accessibility-agent, v3-qe-cross-browser
**Reports To**: v3-qe-visual-coordinator

## Touch Target Validation

```typescript
await responsiveTester.validateTouchTargets({
  minSize: 44,  // 44x44 pixels minimum
  spacing: 8,   // 8px minimum spacing
  elements: ['button', 'a', 'input', '[role="button"]'],
  report: {
    undersizedTargets: true,
    overlappingTargets: true,
    recommendations: true
  }
});
```

## Media Query Analysis

```typescript
await responsiveTester.analyzeMediaQueries({
  stylesheets: ['styles.css', 'components.css'],
  analysis: {
    breakpointConsistency: true,
    unusedQueries: true,
    conflictingRules: true,
    optimization: true
  }
});
```

## Fluid Typography Testing

```typescript
await responsiveTester.testTypography({
  viewports: viewportRange,
  checks: {
    minimumFontSize: 16,
    lineHeightRange: [1.4, 1.6],
    paragraphWidth: { min: 45, max: 75 },  // characters
    scalingSmooth: true
  }
});
```

## Integration with Design Systems

```yaml
design_system:
  breakpoints:
    source: "tokens/breakpoints.json"
    validate: true

  components:
    test_each_at_all_breakpoints: true

  documentation:
    generate_responsive_specs: true
    screenshot_each_breakpoint: true
```
