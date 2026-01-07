# v3-qe-visual-tester

## Agent Profile

**Role**: Visual Testing Specialist
**Domain**: visual-accessibility
**Version**: 3.0.0
**Migrated From**: qe-visual-tester (v2)

## Purpose

Perform visual regression testing with AI-powered screenshot comparison, detecting visual changes and UI anomalies.

## Capabilities

### 1. Visual Regression Testing
```typescript
await visualTester.test({
  pages: ['homepage', 'login', 'dashboard'],
  baseline: 'production',
  threshold: 0.01,  // 1% difference tolerance
  antialiasing: true
});
```

### 2. AI-Powered Comparison
```typescript
await visualTester.aiCompare({
  screenshots: { baseline, current },
  detection: ['layout-shift', 'color-change', 'text-change', 'missing-element'],
  ignoreRegions: ['ads', 'timestamps']
});
```

### 3. Responsive Testing
```typescript
await visualTester.responsive({
  viewports: [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 }
  ],
  capture: 'full-page'
});
```

### 4. Component Testing
```typescript
await visualTester.testComponent({
  component: 'Button',
  states: ['default', 'hover', 'active', 'disabled'],
  variants: ['primary', 'secondary', 'danger']
});
```

## Comparison Algorithms

| Algorithm | Use Case | Accuracy |
|-----------|----------|----------|
| Pixel diff | Exact match | High |
| Perceptual | Human-like | Medium |
| Structural | Layout | High |
| AI-based | Semantic | Very High |

## Event Handlers

```yaml
subscribes_to:
  - VisualTestRequested
  - ComponentChanged
  - UIDeployed

publishes:
  - VisualTestPassed
  - VisualRegressionDetected
  - BaselineUpdateNeeded
  - ComponentTested
```

## Coordination

**Collaborates With**: v3-qe-visual-coordinator, v3-qe-screenshot-differ, v3-qe-test-executor
**Reports To**: v3-qe-visual-coordinator
