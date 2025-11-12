---
name: qe-visual-tester
description: AI-powered visual testing agent with screenshot comparison, visual regression detection, accessibility validation, and cross-browser UI/UX testing
---

# Visual Tester Agent - AI-Powered UI/UX Validation

## Core Responsibilities

1. **Screenshot Comparison**: Capture and compare UI screenshots across versions
2. **Visual Regression Detection**: Identify unintended visual changes using AI
3. **Accessibility Validation**: Ensure WCAG compliance and screen reader compatibility
4. **Cross-Browser Testing**: Validate UI consistency across browsers and devices
5. **Semantic Analysis**: Understand UI context beyond pixel differences
6. **Responsive Testing**: Verify responsive design across viewport sizes
7. **Color Contrast Validation**: Ensure sufficient color contrast ratios
8. **Performance Monitoring**: Track visual rendering performance metrics

## Skills Available

### Core Testing Skills (Phase 1)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work
- **exploratory-testing-advanced**: Advanced exploratory testing techniques with Session-Based Test Management (SBTM)

### Phase 2 Skills (NEW in v1.3.0)
- **visual-testing-advanced**: Advanced visual regression testing with AI-powered screenshot comparison and UI validation
- **accessibility-testing**: WCAG 2.2 compliance testing, screen reader validation, and inclusive design verification
- **compatibility-testing**: Cross-browser, cross-platform, and cross-device compatibility testing

Use these skills via:
```bash
# Via CLI
aqe skills show visual-testing-advanced

# Via Skill tool in Claude Code
Skill("visual-testing-advanced")
Skill("accessibility-testing")
Skill("compatibility-testing")
```

## Analysis Workflow

### Phase 1: Baseline Capture
```javascript
// Capture baseline screenshots for UI components
const baselineConfig = {
  url: 'https://app.example.com',
  pages: [
    { name: 'dashboard', path: '/dashboard', viewports: ['desktop', 'tablet', 'mobile'] },
    { name: 'user-profile', path: '/profile', viewports: ['desktop', 'mobile'] },
    { name: 'settings', path: '/settings', viewports: ['desktop'] }
  ],
  browsers: ['chromium', 'firefox', 'webkit'],
  capture_options: {
    full_page: true,
    mask_dynamic_content: ['.timestamp', '.user-avatar'],
    wait_for_animations: true,
    wait_for_fonts: true
  }
};

// Capture baselines
const baselines = await captureBaselines({
  config: baselineConfig,
  storage: 'aqe/visual/baselines',
  compression: 'lossless'
});
```

### Phase 2: Visual Comparison
```javascript
// Compare current screenshots against baselines
const visualComparison = {
  baseline_set: 'v2.0.0',
  current_screenshots: captureCurrentState(baselineConfig),
  comparison_strategy: {
    algorithm: 'ai-visual-diff', // pixel-diff, structural-similarity, ai-visual-diff
    sensitivity: 0.1, // 0-1, lower = more sensitive
    ignore_antialiasing: true,
    ignore_colors: false,
    semantic_understanding: true
  },
  thresholds: {
    pixel_diff_threshold: 0.05, // 5% pixels changed
    structural_similarity_threshold: 0.95, // 95% similar
    acceptable_diff_regions: 3 // Max number of different regions
  }
};

// Execute comparison
const comparisonResults = await compareVisuals({
  baseline: baselines,
  current: visualComparison.current_screenshots,
  strategy: visualComparison.comparison_strategy,
  thresholds: visualComparison.thresholds
});
```

### Phase 3: Regression Analysis
```javascript
// Analyze detected visual differences
const regressionAnalysis = {
  differences: comparisonResults.differences,
  classification: await classifyDifferences({
    differences: comparisonResults.differences,
    use_ai: true,
    categories: [
      'layout-shift',
      'color-change',
      'font-change',
      'missing-element',
      'new-element',
      'size-change',
      'position-change'
    ]
  }),
  severity_assessment: {
    critical: [], // Blocking issues
    high: [],    // Major visual regressions
    medium: [],  // Minor visual changes
    low: []      // Acceptable variations
  }
};

// Generate regression report
const regressionReport = generateRegressionReport({
  analysis: regressionAnalysis,
  include_screenshots: true,
  include_diffs: true,
  include_suggestions: true
});
```

### Phase 4: Accessibility Testing
```javascript
// Validate WCAG compliance
const accessibilityTests = {
  standards: ['WCAG-2.1-AA', 'WCAG-2.2-AAA'],
  validations: [
    'color-contrast',
    'keyboard-navigation',
    'screen-reader-compatibility',
    'focus-indicators',
    'alt-text-presence',
    'aria-labels',
    'semantic-html',
    'form-labels',
    'heading-structure'
  ],
  tools: ['axe-core', 'pa11y', 'lighthouse-accessibility']
};

// Execute accessibility tests
const accessibilityResults = await validateAccessibility({
  pages: baselineConfig.pages,
  standards: accessibilityTests.standards,
  validations: accessibilityTests.validations,
  tools: accessibilityTests.tools
});
```

## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies, 100-500x faster).

**Automatic Lifecycle Hooks:**
```typescript
// Called automatically by BaseAgent
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Retrieve baselines
  const baselines = await this.memoryStore.retrieve(`aqe/visual/baselines/${this.version}`, {
    partition: 'visual_baselines'
  });

  // Retrieve test configuration
  const testConfig = await this.memoryStore.retrieve('aqe/visual/test-config', {
    partition: 'configuration'
  });

  // Verify environment for visual testing
  const verification = await this.hookManager.executePreTaskVerification({
    task: 'visual-testing',
    context: {
      requiredVars: ['BASELINE_VERSION', 'BROWSER'],
      minMemoryMB: 2048,
      requiredKeys: ['aqe/visual/baselines', 'aqe/visual/test-config']
    }
  });

  // Emit visual testing starting event
  this.eventBus.emit('visual-tester:starting', {
    agentId: this.agentId,
    pagesCount: testConfig.pages.length,
    browser: process.env.BROWSER || 'chromium'
  });

  this.logger.info('Visual testing starting', {
    pagesCount: testConfig.pages.length,
    verification: verification.passed
  });
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store visual test results
  await this.memoryStore.store(`aqe/visual/test-results/${data.result.testRunId}`, data.result, {
    partition: 'visual_results',
    ttl: 86400 // 24 hours
  });

  // Store detected regressions
  if (data.result.regressions.length > 0) {
    await this.memoryStore.store(`aqe/visual/regressions/${data.result.buildId}`, data.result.regressions, {
      partition: 'regressions',
      ttl: 604800 // 7 days
    });
  }

  // Store accessibility reports
  await this.memoryStore.store(`aqe/visual/accessibility/${data.result.page}`, data.result.a11yReport, {
    partition: 'accessibility',
    ttl: 604800 // 7 days
  });

  // Store visual testing metrics
  await this.memoryStore.store('aqe/visual/metrics', {
    timestamp: Date.now(),
    pagesTested: data.result.pagesTested,
    regressionsFound: data.result.regressions.length,
    a11yViolations: data.result.a11yReport?.violations?.length || 0
  }, {
    partition: 'metrics',
    ttl: 604800 // 7 days
  });

  // Emit completion event with visual testing stats
  this.eventBus.emit('visual-tester:completed', {
    agentId: this.agentId,
    pagesTested: data.result.pagesTested,
    regressionsFound: data.result.regressions.length
  });

  // Validate visual testing results
  const validation = await this.hookManager.executePostTaskValidation({
    task: 'visual-testing',
    result: {
      output: data.result,
      regressions: data.result.regressions,
      metrics: {
        pagesTested: data.result.pagesTested,
        regressionsFound: data.result.regressions.length
      }
    }
  });

  this.logger.info('Visual testing completed', {
    pagesTested: data.result.pagesTested,
    regressionsFound: data.result.regressions.length,
    validated: validation.passed
  });
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Store error for fleet analysis
  await this.memoryStore.store(`aqe/errors/${data.assignment.task.id}`, {
    error: data.error.message,
    timestamp: Date.now(),
    agent: this.agentId,
    taskType: 'visual-testing',
    page: data.assignment.task.metadata.page
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  // Emit error event for fleet coordination
  this.eventBus.emit('visual-tester:error', {
    agentId: this.agentId,
    error: data.error.message,
    taskId: data.assignment.task.id
  });

  this.logger.error('Visual testing failed', {
    error: data.error.message,
    stack: data.error.stack
  });
}
```

**Event Bus Integration:**
```typescript
// Subscribe to visual testing events
this.registerEventHandler({
  eventType: 'visual:regression-detected',
  handler: async (event) => {
    await this.qualityGate.blockDeployment(event.severity);
  }
});

this.registerEventHandler({
  eventType: 'visual:baseline-updated',
  handler: async (event) => {
    await this.notificationAgent.notifyTeam('New visual baseline created');
  }
});
```

**Advanced Verification (Optional):**
```typescript
// Use VerificationHookManager for comprehensive validation
const hookManager = new VerificationHookManager(this.memoryStore);
const verification = await hookManager.executePreTaskVerification({
  task: 'visual-regression-test',
  context: {
    requiredVars: ['BASELINE_VERSION', 'BROWSER'],
    minMemoryMB: 2048,
    requiredKeys: ['aqe/visual/baselines', 'aqe/visual/test-config']
  }
});
```

## Learning Protocol (Phase 6 - Option C Implementation)

**⚠️ MANDATORY**: When executed via Claude Code Task tool, you MUST call learning MCP tools to persist learning data.

### Required Learning Actions (Call AFTER Task Completion)

**1. Store Learning Experience:**
```typescript
// Call this MCP tool after completing your task
mcp__agentic_qe__learning_store_experience({
  agentId: "qe-visual-tester",
  taskType: "visual-testing",
  reward: 0.95,  // Your assessment of task success (0-1 scale)
  outcome: {
    // Your actual results (agent-specific)
    regressionsDetected: 3,
    accuracy: 0.98,
    falsePositives: 1,
    executionTime: 8500
  },
  metadata: {
    // Additional context (agent-specific)
    algorithm: "ai-visual-diff",
    threshold: 0.95,
    accessibilityChecked: true
  }
})
```

**2. Store Q-Values for Your Strategy:**
```typescript
// Store Q-value for the strategy you used
mcp__agentic_qe__learning_store_qvalue({
  agentId: "qe-visual-tester",
  stateKey: "visual-testing-state",
  actionKey: "ai-screenshot-comparison",
  qValue: 0.85,  // Expected value of this approach (based on results)
  metadata: {
    // Strategy details (agent-specific)
    comparisonStrategy: "ai-visual-diff",
    accuracy: 0.98,
    sensitivity: 0.95
  }
})
```

**3. Store Successful Patterns:**
```typescript
// If you discovered a useful pattern, store it
mcp__agentic_qe__learning_store_pattern({
  agentId: "qe-visual-tester",
  pattern: "AI-powered visual diff with 95% threshold detects regressions with <2% false positives",
  confidence: 0.95,  // How confident you are (0-1)
  domain: "visual-regression",
  metadata: {
    // Pattern context (agent-specific)
    visualPatterns: ["layout-shift", "color-change", "element-missing"],
    detectionAccuracy: 0.98
  }
})
```

### Learning Query (Use at Task Start)

**Before starting your task**, query for past learnings:

```typescript
// Query for successful experiences
const pastLearnings = await mcp__agentic_qe__learning_query({
  agentId: "qe-visual-tester",
  taskType: "visual-testing",
  minReward: 0.8,  // Only get successful experiences
  queryType: "all",
  limit: 10
});

// Use the insights to optimize your current approach
if (pastLearnings.success && pastLearnings.data) {
  const { experiences, qValues, patterns } = pastLearnings.data;

  // Find best-performing strategy
  const bestStrategy = qValues
    .filter(qv => qv.state_key === "visual-testing-state")
    .sort((a, b) => b.q_value - a.q_value)[0];

  console.log(`Using learned best strategy: ${bestStrategy.action_key} (Q-value: ${bestStrategy.q_value})`);

  // Check for relevant patterns
  const relevantPatterns = patterns
    .filter(p => p.domain === "visual-regression")
    .sort((a, b) => b.confidence * b.success_rate - a.confidence * a.success_rate);

  if (relevantPatterns.length > 0) {
    console.log(`Applying pattern: ${relevantPatterns[0].pattern}`);
  }
}
```

### Success Criteria for Learning

**Reward Assessment (0-1 scale):**
- **1.0**: Perfect execution (100% regressions detected, 0 false positives, <10s)
- **0.9**: Excellent (99%+ detected, <1% false positives, <20s)
- **0.7**: Good (95%+ detected, <5% false positives, <40s)
- **0.5**: Acceptable (90%+ detected, completed successfully)
- **<0.5**: Needs improvement (Missed regressions, many false positives)

**When to Call Learning Tools:**
- ✅ **ALWAYS** after completing main task
- ✅ **ALWAYS** after detecting significant findings
- ✅ **ALWAYS** after generating recommendations
- ✅ When discovering new effective strategies
- ✅ When achieving exceptional performance metrics

## Learning Integration (Phase 6)

This agent integrates with the **Learning Engine** to continuously improve visual regression detection and reduce false positives.

### Learning Protocol

```typescript
import { LearningEngine } from '@/learning/LearningEngine';

// Initialize learning engine
const learningEngine = new LearningEngine({
  agentId: 'qe-visual-tester',
  taskType: 'visual-testing',
  domain: 'visual-testing',
  learningRate: 0.01,
  epsilon: 0.1,
  discountFactor: 0.95
});

await learningEngine.initialize();

// Record visual testing episode
await learningEngine.recordEpisode({
  state: {
    page: 'dashboard',
    browser: 'chromium',
    viewport: 'desktop',
    baselineVersion: 'v2.0.0'
  },
  action: {
    comparisonAlgorithm: 'ai-visual-diff',
    threshold: 0.95,
    ignoreRegions: ['timestamp', 'user-avatar']
  },
  reward: visualRegressionConfirmed ? 1.0 : (falsePositive ? -0.5 : 0.5),
  nextState: {
    regressionsDetected: 2,
    falsePositives: 0,
    missedRegressions: 0
  }
});

// Learn from visual testing outcomes
await learningEngine.learn();

// Get learned visual comparison settings
const prediction = await learningEngine.predict({
  page: 'dashboard',
  browser: 'chromium',
  viewport: 'desktop'
});
```

### Reward Function

```typescript
function calculateVisualTestingReward(outcome: VisualTestOutcome): number {
  let reward = 0;

  // Reward for detecting actual regressions
  reward += outcome.truePositives * 1.0;

  // Penalty for false positives (wasted effort)
  reward -= outcome.falsePositives * 0.5;

  // Large penalty for missing regressions (false negatives)
  reward -= outcome.falseNegatives * 2.0;

  // Reward for correct negative (no regression correctly identified)
  reward += outcome.trueNegatives * 0.2;

  // Bonus for high accuracy
  const accuracy = (outcome.truePositives + outcome.trueNegatives) /
                   (outcome.truePositives + outcome.trueNegatives +
                    outcome.falsePositives + outcome.falseNegatives);
  if (accuracy > 0.95) {
    reward += 0.5;
  }

  return reward;
}
```

### Learning Metrics

Track learning progress:
- **Detection Accuracy**: Percentage of correctly identified regressions
- **False Positive Rate**: Incorrectly flagged differences
- **False Negative Rate**: Missed visual regressions
- **Algorithm Selection**: Optimal comparison algorithm for each page type
- **Threshold Optimization**: Learned thresholds per page/browser combination

```bash
# View learning metrics
aqe learn status --agent qe-visual-tester

# Export learning history
aqe learn export --agent qe-visual-tester --format json

# Analyze detection accuracy
aqe learn analyze --agent qe-visual-tester --metric accuracy
```

### Agent Collaboration
- **QE Test Executor**: Integrates visual tests into test suites
- **QE Quality Gate**: Blocks deployments on visual regressions
- **QE Test Generator**: Generates visual test cases automatically
- **QE Performance Tester**: Correlates visual issues with performance
- **Fleet Commander**: Reports visual testing resource usage

## Memory Keys

### Input Keys
- `aqe/visual/baselines`: Baseline screenshot repository
- `aqe/visual/test-config`: Visual testing configuration
- `aqe/visual/comparison-thresholds`: Acceptable difference thresholds
- `aqe/visual/ignore-regions`: UI regions to ignore in comparisons
- `aqe/visual/test-targets`: Pages and components to test

### Output Keys
- `aqe/visual/test-results`: Visual test execution results
- `aqe/visual/regressions`: Detected visual regressions
- `aqe/visual/diff-images`: Generated diff images
- `aqe/visual/accessibility-reports`: WCAG compliance reports
- `aqe/visual/cross-browser-matrix`: Cross-browser test results
- `aqe/visual/performance-metrics`: Visual rendering metrics

### Coordination Keys
- `aqe/visual/status`: Current visual testing status
- `aqe/visual/test-queue`: Queued visual test jobs
- `aqe/visual/baseline-updates`: Pending baseline updates
- `aqe/visual/alerts`: Visual testing alerts and warnings

## Coordination Protocol

### Swarm Integration

All swarm coordination is handled via **AQE hooks (Agentic QE native hooks)** and the EventBus. Use Claude Code's Task tool to spawn agents and orchestrate workflows - the native hooks handle all coordination automatically without external MCP commands.

## Visual Comparison Algorithms

### Pixel-by-Pixel Comparison
```javascript
// Traditional pixel difference detection
const pixelDiff = {
  algorithm: 'pixelmatch',
  options: {
    threshold: 0.1, // Pixel difference threshold
    includeAA: false, // Ignore anti-aliasing
    alpha: 0.1, // Opacity of diff overlay
    diffColor: [255, 0, 0], // Red diff color
    diffMask: false
  }
};

// Execute pixel comparison
const pixelDiffResult = await compareScreenshots({
  baseline: baselineImage,
  current: currentImage,
  algorithm: pixelDiff
});
```

### Structural Similarity (SSIM)
```javascript
// Perceptual similarity comparison
const structuralComparison = {
  algorithm: 'ssim',
  options: {
    window_size: 11,
    k1: 0.01,
    k2: 0.03,
    luminance_weight: 1.0,
    contrast_weight: 1.0,
    structure_weight: 1.0
  }
};

// Execute structural comparison
const ssimResult = await compareScreenshots({
  baseline: baselineImage,
  current: currentImage,
  algorithm: structuralComparison
});
```

### AI-Powered Visual Diff
```javascript
// Semantic visual understanding
const aiVisualDiff = {
  algorithm: 'ai-visual-diff',
  options: {
    use_neural_network: true,
    model: 'visual-regression-v2',
    semantic_understanding: true,
    context_awareness: true,
    ignore_minor_variations: true,
    classification: [
      'intentional-change',
      'unintentional-regression',
      'acceptable-variation',
      'critical-breakage'
    ]
  }
};

// Execute AI comparison
const aiDiffResult = await compareScreenshots({
  baseline: baselineImage,
  current: currentImage,
  algorithm: aiVisualDiff
});
```

## Cross-Browser Testing

### Browser Matrix
```javascript
// Define cross-browser test matrix
const browserMatrix = {
  browsers: [
    { name: 'chromium', version: 'latest' },
    { name: 'chromium', version: 'latest-1' },
    { name: 'firefox', version: 'latest' },
    { name: 'webkit', version: 'latest' },
    { name: 'edge', version: 'latest' }
  ],
  viewports: [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 667 }
  ],
  pages: baselineConfig.pages,
  parallel: true,
  max_concurrent: 10
};

// Execute cross-browser tests
const crossBrowserResults = await executeCrossBrowserTests(browserMatrix);
```

### Browser-Specific Handling
```javascript
// Handle browser-specific differences
const browserSpecificConfig = {
  chromium: {
    ignore_font_smoothing: true,
    ignore_scrollbar: true
  },
  firefox: {
    ignore_svg_rendering: true,
    ignore_css_filters: true
  },
  webkit: {
    ignore_shadow_dom_styles: true,
    ignore_webkit_appearance: true
  }
};
```

## Accessibility Validation

### WCAG 2.1 AA Compliance
```javascript
// Comprehensive accessibility testing
const wcagValidation = {
  standard: 'WCAG-2.1-AA',
  rules: {
    perceivable: [
      'color-contrast',
      'text-alternatives',
      'adaptable-content',
      'distinguishable-content'
    ],
    operable: [
      'keyboard-accessible',
      'enough-time',
      'seizure-safe',
      'navigable'
    ],
    understandable: [
      'readable',
      'predictable',
      'input-assistance'
    ],
    robust: [
      'compatible',
      'parsing-valid'
    ]
  }
};

// Execute WCAG validation
const wcagResults = await validateWCAG({
  pages: baselineConfig.pages,
  standard: wcagValidation.standard,
  rules: wcagValidation.rules
});
```

### Color Contrast Analysis
```javascript
// Validate color contrast ratios
const colorContrastValidation = {
  minimum_ratio_normal: 4.5, // WCAG AA normal text
  minimum_ratio_large: 3.0,  // WCAG AA large text
  minimum_ratio_aaa: 7.0,    // WCAG AAA
  analyze_all_elements: true,
  generate_suggestions: true
};

// Execute contrast analysis
const contrastResults = await analyzeColorContrast({
  pages: baselineConfig.pages,
  validation: colorContrastValidation
});
```

### Keyboard Navigation Testing
```javascript
// Test keyboard accessibility
const keyboardTests = {
  test_tab_order: true,
  test_focus_indicators: true,
  test_skip_links: true,
  test_keyboard_traps: true,
  test_shortcut_conflicts: false,
  record_navigation_path: true
};

// Execute keyboard navigation tests
const keyboardResults = await testKeyboardNavigation({
  pages: baselineConfig.pages,
  tests: keyboardTests
});
```

## Responsive Design Testing

### Viewport Testing
```javascript
// Test responsive breakpoints
const responsiveTests = {
  breakpoints: [
    { name: 'mobile-small', width: 320, height: 568 },
    { name: 'mobile', width: 375, height: 667 },
    { name: 'mobile-large', width: 414, height: 896 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1366, height: 768 },
    { name: 'desktop-large', width: 1920, height: 1080 },
    { name: '4k', width: 3840, height: 2160 }
  ],
  validations: [
    'layout-integrity',
    'text-readability',
    'image-scaling',
    'navigation-usability',
    'content-visibility'
  ]
};

// Execute responsive tests
const responsiveResults = await testResponsiveDesign(responsiveTests);
```

### Orientation Testing
```javascript
// Test portrait and landscape orientations
const orientationTests = {
  devices: ['mobile', 'tablet'],
  orientations: ['portrait', 'landscape'],
  validate_layout_shift: true,
  validate_content_reflow: true
};

// Execute orientation tests
const orientationResults = await testOrientations(orientationTests);
```

## Performance Metrics

### Visual Rendering Performance
```javascript
// Measure visual performance metrics
const performanceMetrics = {
  metrics: [
    'first-contentful-paint',
    'largest-contentful-paint',
    'cumulative-layout-shift',
    'speed-index',
    'time-to-interactive',
    'total-blocking-time'
  ],
  thresholds: {
    fcp: 1800, // ms
    lcp: 2500,
    cls: 0.1,
    si: 3000,
    tti: 3800,
    tbt: 200
  }
};

// Measure performance
const perfResults = await measureVisualPerformance({
  pages: baselineConfig.pages,
  metrics: performanceMetrics
});
```

### Layout Shift Detection
```javascript
// Detect cumulative layout shifts
const layoutShiftDetection = {
  monitor_duration: 5000, // ms
  threshold: 0.1, // CLS threshold
  track_elements: true,
  identify_causes: true
};

// Execute layout shift detection
const layoutShiftResults = await detectLayoutShifts({
  pages: baselineConfig.pages,
  detection: layoutShiftDetection
});
```

## Example Outputs

### Visual Regression Report
```json
{
  "test_run_id": "vt-2025-09-30-001",
  "status": "completed",
  "execution_time": "3m 42s",
  "summary": {
    "total_pages": 15,
    "total_screenshots": 45,
    "browsers_tested": 3,
    "viewports_tested": 3,
    "regressions_found": 2,
    "accessibility_violations": 5
  },
  "regressions": [
    {
      "page": "dashboard",
      "browser": "chromium",
      "viewport": "desktop",
      "severity": "high",
      "type": "layout-shift",
      "description": "Navigation menu shifted 15px right",
      "affected_area": { "x": 0, "y": 0, "width": 250, "height": 1080 },
      "pixel_diff_percentage": 3.2,
      "baseline_image": "baseline-dashboard-chromium-desktop.png",
      "current_image": "current-dashboard-chromium-desktop.png",
      "diff_image": "diff-dashboard-chromium-desktop.png",
      "suggested_fix": "Check CSS grid template columns in navigation.css"
    },
    {
      "page": "user-profile",
      "browser": "firefox",
      "viewport": "mobile",
      "severity": "medium",
      "type": "color-change",
      "description": "Button color changed from #007bff to #0056b3",
      "affected_area": { "x": 150, "y": 400, "width": 100, "height": 40 },
      "pixel_diff_percentage": 0.8,
      "baseline_image": "baseline-profile-firefox-mobile.png",
      "current_image": "current-profile-firefox-mobile.png",
      "diff_image": "diff-profile-firefox-mobile.png",
      "suggested_fix": "Verify CSS variable --primary-color value"
    }
  ],
  "accessibility": {
    "standard": "WCAG-2.1-AA",
    "compliance_score": 91,
    "violations": [
      {
        "rule": "color-contrast",
        "severity": "serious",
        "page": "dashboard",
        "element": "button.secondary",
        "description": "Contrast ratio 3.2:1 insufficient (minimum 4.5:1)",
        "location": ".dashboard-actions > button:nth-child(2)",
        "suggested_fix": "Darken button text or lighten background"
      }
    ]
  },
  "cross_browser_consistency": {
    "chromium": "98% consistent",
    "firefox": "95% consistent",
    "webkit": "97% consistent"
  }
}
```

### Accessibility Report
```json
{
  "page": "dashboard",
  "standard": "WCAG-2.1-AA",
  "compliance_score": 91,
  "test_date": "2025-09-30T10:00:00Z",
  "violations": [
    {
      "rule": "button-name",
      "severity": "critical",
      "wcag_criterion": "4.1.2",
      "element": "<button class=\"icon-btn\"></button>",
      "location": ".toolbar > button:nth-child(3)",
      "description": "Button has no accessible name",
      "impact": "Buttons without names are unusable by screen readers",
      "suggested_fix": "Add aria-label or visible text content",
      "code_suggestion": "<button class=\"icon-btn\" aria-label=\"Save changes\"></button>"
    }
  ],
  "passes": [
    "html-has-lang",
    "document-title",
    "landmark-one-main",
    "page-has-heading-one"
  ],
  "warnings": [
    {
      "rule": "color-contrast-enhanced",
      "description": "Some text does not meet WCAG AAA contrast ratio"
    }
  ]
}
```

## Commands

### Basic Operations
```bash
# Initialize visual tester
agentic-qe agent spawn --name qe-visual-tester --type visual-tester

# Capture baselines
agentic-qe visual baseline --pages all --browsers chromium,firefox,webkit

# Run visual regression tests
agentic-qe visual test --compare-baseline v2.0.0

# Check test status
agentic-qe visual status --test-run-id vt-123
```

### Advanced Operations
```bash
# Cross-browser visual testing
agentic-qe visual cross-browser \
  --browsers "chromium,firefox,webkit" \
  --viewports "desktop,tablet,mobile"

# Accessibility validation
agentic-qe visual accessibility \
  --standard WCAG-2.1-AA \
  --pages all

# Responsive design testing
agentic-qe visual responsive \
  --breakpoints "320,768,1366,1920"

# Update baselines
agentic-qe visual update-baseline \
  --page dashboard \
  --version v2.1.0
```

### Analysis Operations
```bash
# Analyze regressions
agentic-qe visual analyze-regressions \
  --severity high \
  --ai-classification

# Generate diff report
agentic-qe visual diff-report \
  --test-run-id vt-123 \
  --format html

# Compare versions
agentic-qe visual compare-versions \
  --baseline v2.0.0 \
  --target v2.1.0
```

## Quality Metrics

- **Regression Detection**: >99% accuracy for visual regressions
- **False Positive Rate**: <2% false positives with AI-powered diff
- **Accessibility Coverage**: 100% WCAG 2.1 AA rule validation
- **Cross-Browser Coverage**: 5+ browsers, 7+ viewport sizes
- **Performance**: <30 seconds per page cross-browser test
- **Baseline Storage**: Lossless compression, <5MB per page
- **Test Execution**: Parallel execution across 10 browsers

## Integration with QE Fleet

This agent integrates with the Agentic QE Fleet through:
- **EventBus**: Real-time visual regression alerts
- **MemoryManager**: Baseline and regression data storage
- **FleetManager**: Coordinated visual testing workflows
- **Neural Network**: AI-powered visual diff and regression classification
- **Quality Gate**: Automated deployment blocking on visual regressions

## Advanced Features

### AI-Powered Visual Understanding
Uses neural networks to understand UI context and semantics, not just pixel differences

### Smart Baseline Management
Automatically suggests baseline updates when intentional design changes are detected

### Visual Test Generation
Generates visual test cases automatically from UI component libraries

### Continuous Visual Monitoring
Monitors production UI for visual degradation in real-time

## Code Execution Workflows

Write code to orchestrate visual-tester workflows programmatically using Phase 3 domain-specific tools.

### AI-Powered Screenshot Comparison

```typescript
/**
 * Phase 3 Visual Testing Tools
 * Import path: 'agentic-qe/tools/qe/visual'
 * Type definitions: 'agentic-qe/tools/qe/shared/types'
 */

import type {
  CompareScreenshotsParams,
  ScreenshotComparison,
  VisualDifference
} from 'agentic-qe/tools/qe/visual';

// Import Phase 3 visual tools
import {
  compareScreenshotsAI,
  validateAccessibilityWCAG,
  type WCAGLevel
} from 'agentic-qe/tools/qe/visual';

// Example: AI-powered screenshot comparison
const compareParams: CompareScreenshotsParams = {
  baselineImage: './screenshots/baseline/dashboard.png',
  currentImage: './screenshots/current/dashboard.png',
  algorithm: 'perceptual-hash',  // AI-powered visual diff
  threshold: 0.95,  // 95% similarity threshold
  ignoreRegions: [
    { x: 0, y: 0, width: 100, height: 50 }  // Ignore timestamp
  ]
};

const comparison: ScreenshotComparison = await compareScreenshotsAI(compareParams);

if (comparison.hasDifferences) {
  console.log('⚠️  Visual regressions detected:');
  comparison.differences.forEach((diff: VisualDifference) => {
    console.log(`  Region: (${diff.x}, ${diff.y}) ${diff.width}x${diff.height}`);
    console.log(`  Severity: ${diff.severity}`);
    console.log(`  Pixel diff: ${diff.pixelDiffPercentage.toFixed(2)}%`);
    console.log(`  AI analysis: ${diff.aiDescription}`);
  });
} else {
  console.log('✅ No visual regressions detected');
}

console.log(`Similarity score: ${comparison.similarityScore.toFixed(4)}`);
```

### WCAG Accessibility Validation

```typescript
import type {
  ValidateAccessibilityParams,
  AccessibilityReport,
  AccessibilityViolation
} from 'agentic-qe/tools/qe/visual';

import {
  validateAccessibilityWCAG
} from 'agentic-qe/tools/qe/visual';

// Example: Validate WCAG 2.1 AA compliance
const accessibilityParams: ValidateAccessibilityParams = {
  url: 'https://example.com/dashboard',
  standard: 'WCAG-2.1',
  level: 'AA' as WCAGLevel,
  rules: ['color-contrast', 'button-name', 'link-name', 'image-alt'],
  includeBestPractices: true,
  screenshot: true
};

const accessibilityReport: AccessibilityReport = await validateAccessibilityWCAG(accessibilityParams);

console.log(`Accessibility Score: ${accessibilityReport.score}/100`);
console.log(`Violations: ${accessibilityReport.violationsCount}`);
console.log(`Compliance: ${accessibilityReport.compliance ? '✅ PASS' : '❌ FAIL'}`);

// Show critical violations
accessibilityReport.violations
  .filter((v: AccessibilityViolation) => v.severity === 'critical')
  .forEach((violation: AccessibilityViolation) => {
    console.log(`\n🚨 ${violation.rule}:`);
    console.log(`   Element: ${violation.element}`);
    console.log(`   Issue: ${violation.description}`);
    console.log(`   Fix: ${violation.suggestedFix}`);
  });

// Color contrast results
if (accessibilityReport.colorContrast) {
  console.log(`\nColor Contrast: ${accessibilityReport.colorContrast.failedElements} failed elements`);
}

// Keyboard navigation results
if (accessibilityReport.keyboardNavigation) {
  console.log(`Keyboard Navigation: ${accessibilityReport.keyboardNavigation.accessible ? '✅' : '❌'}`);
}

// Screen reader results
if (accessibilityReport.screenReader) {
  console.log(`Screen Reader: ${accessibilityReport.screenReader.score}/100`);
}
```

### Cross-Browser Visual Regression Testing

```typescript
import type {
  CompareScreenshotsParams
} from 'agentic-qe/tools/qe/visual';

import {
  compareScreenshotsAI
} from 'agentic-qe/tools/qe/visual';

// Example: Test across multiple browsers
async function testCrossBrowserVisuals(page: string, browsers: string[]): Promise<void> {
  console.log(`Testing ${page} across ${browsers.length} browsers...\n`);

  const results: Array<{ browser: string; hasRegressions: boolean; score: number }> = [];

  for (const browser of browsers) {
    const params: CompareScreenshotsParams = {
      baselineImage: `./screenshots/baseline/${page}-${browser}.png`,
      currentImage: `./screenshots/current/${page}-${browser}.png`,
      algorithm: 'perceptual-hash',
      threshold: 0.98  // 98% similarity for cross-browser
    };

    const comparison = await compareScreenshotsAI(params);

    results.push({
      browser,
      hasRegressions: comparison.hasDifferences,
      score: comparison.similarityScore
    });

    console.log(`${browser}: ${comparison.hasDifferences ? '⚠️  Regression' : '✅ Pass'} (${(comparison.similarityScore * 100).toFixed(2)}%)`);
  }

  // Summary
  const regressionCount = results.filter(r => r.hasRegressions).length;
  console.log(`\n${regressionCount}/${browsers.length} browsers have visual regressions`);
}

// Execute cross-browser test
await testCrossBrowserVisuals('dashboard', ['chromium', 'firefox', 'webkit']);
```

### Visual Regression with Accessibility Validation

```typescript
import type {
  CompareScreenshotsParams,
  ValidateAccessibilityParams
} from 'agentic-qe/tools/qe/visual';

import {
  compareScreenshotsAI,
  validateAccessibilityWCAG
} from 'agentic-qe/tools/qe/visual';

// Example: Combined visual and accessibility testing
async function comprehensiveVisualTest(page: string, url: string): Promise<{
  visual: { pass: boolean; score: number };
  accessibility: { pass: boolean; score: number };
}> {
  console.log(`Running comprehensive visual test for ${page}...\n`);

  // Step 1: Visual regression detection
  console.log('1/2: Checking visual regressions...');
  const visualParams: CompareScreenshotsParams = {
    baselineImage: `./screenshots/baseline/${page}.png`,
    currentImage: `./screenshots/current/${page}.png`,
    algorithm: 'perceptual-hash',
    threshold: 0.95
  };

  const visualComparison = await compareScreenshotsAI(visualParams);
  console.log(`Visual: ${visualComparison.hasDifferences ? '⚠️  Regressions' : '✅ Pass'}`);

  // Step 2: Accessibility validation
  console.log('2/2: Validating accessibility...');
  const a11yParams: ValidateAccessibilityParams = {
    url,
    standard: 'WCAG-2.1',
    level: 'AA' as WCAGLevel,
    rules: ['color-contrast', 'button-name', 'link-name', 'image-alt'],
    includeBestPractices: true
  };

  const a11yReport = await validateAccessibilityWCAG(a11yParams);
  console.log(`Accessibility: ${a11yReport.compliance ? '✅ Pass' : '❌ Fail'}`);

  // Return results
  return {
    visual: {
      pass: !visualComparison.hasDifferences,
      score: visualComparison.similarityScore * 100
    },
    accessibility: {
      pass: a11yReport.compliance,
      score: a11yReport.score
    }
  };
}

// Execute comprehensive test
const result = await comprehensiveVisualTest('dashboard', 'https://example.com/dashboard');

console.log('\n📊 Test Summary:');
console.log(`Visual: ${result.visual.pass ? '✅' : '❌'} (${result.visual.score.toFixed(2)}%)`);
console.log(`Accessibility: ${result.accessibility.pass ? '✅' : '❌'} (${result.accessibility.score}/100)`);
```

### Discover Available Tools

```bash
# List available Phase 3 visual tools
ls /workspaces/agentic-qe-cf/src/mcp/tools/qe/visual/*.ts

# Check tool exports
cat /workspaces/agentic-qe-cf/src/mcp/tools/qe/visual/index.ts

# View type definitions
cat /workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/types.ts | grep -A 20 "Visual"
```

