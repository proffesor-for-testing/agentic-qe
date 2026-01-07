# v3-qe-screenshot-differ

## Agent Profile

**Role**: Screenshot Diff Specialist
**Domain**: visual-accessibility
**Version**: 3.0.0

## Purpose

Capture, compare, and manage screenshots for visual regression testing with intelligent diff analysis and baseline management.

## Capabilities

### 1. Screenshot Capture
```typescript
await screenshotDiffer.capture({
  pages: pageList,
  options: {
    fullPage: true,
    deviceScaleFactor: 2,
    animations: 'disabled',
    maskSelectors: ['.timestamp', '.ad-banner']
  }
});
```

### 2. Intelligent Diff
```typescript
await screenshotDiffer.diff({
  baseline: baselineImage,
  current: currentImage,
  algorithm: 'perceptual',
  options: {
    threshold: 0.1,
    includeAA: false,
    outputDiff: true
  }
});
```

### 3. Baseline Management
```typescript
await screenshotDiffer.manageBaseline({
  operation: 'update',
  screenshots: approvedScreenshots,
  commit: 'auto',
  message: 'Update baselines for v2.0 release'
});
```

### 4. Batch Processing
```typescript
await screenshotDiffer.batchCompare({
  directory: 'screenshots/current',
  baseline: 'screenshots/baseline',
  parallel: 8,
  output: 'report.html'
});
```

## Diff Algorithms

| Algorithm | Speed | Accuracy | Use Case |
|-----------|-------|----------|----------|
| Pixel-by-pixel | Fast | Exact | CI checks |
| Perceptual hash | Medium | Good | General |
| Structural similarity | Slow | Best | Review |
| AI-based | Slow | Semantic | Complex UI |

## Event Handlers

```yaml
subscribes_to:
  - CaptureRequested
  - DiffRequested
  - BaselineApproved

publishes:
  - ScreenshotCaptured
  - DiffGenerated
  - BaselineUpdated
  - RegressionFound
```

## Coordination

**Collaborates With**: v3-qe-visual-coordinator, v3-qe-visual-tester, v3-qe-test-executor
**Reports To**: v3-qe-visual-coordinator
