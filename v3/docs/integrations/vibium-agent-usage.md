# Using Vibium in AQE v3 Agents

## Quick Reference

### Available Vibium Capabilities

| Capability | MCP Tool | Use Case |
|-----------|----------|----------|
| Visual Regression | `screenshot` | Compare UI against baseline |
| Accessibility Audit | `audit` | WCAG compliance checking |
| E2E Testing | `interact` | User workflow automation |
| Performance | `metrics` | Load time, FCP, LCP analysis |
| Mobile Testing | `emulate` | Device simulation |
| Network Throttling | `throttle` | Connection speed testing |

## Agent Spawning with Vibium

### Initialize Fleet

```javascript
// In AQE v3 initialization
const { agentic_qe__fleet_init } = require('@agentic-qe/v3');

await agentic_qe__fleet_init({
  enabledDomains: [
    'test-generation',
    'test-execution',
    'coverage-analysis',
    'visual-testing'  // New domain using Vibium
  ],
  topology: 'hierarchical',
  maxAgents: 15,
  lazyLoading: true
});
```

### Spawn Visual Testing Agent

```javascript
const { agentic_qe__agent_spawn } = require('@agentic-qe/v3');

const visualAgent = await agentic_qe__agent_spawn({
  domain: 'visual-testing',
  type: 'specialist'
});

// Returns: agent-id (e.g., "visual-tester-001")
```

## MCP Tool Integration Examples

### 1. Visual Regression Testing

```javascript
// Store baseline
await vibiumClient.saveBaseline({
  id: 'home-page-desktop',
  url: 'https://app.example.com',
  viewport: { width: 1920, height: 1080 },
  name: 'Homepage Desktop View'
});

// Compare against baseline
const result = await vibiumClient.visualRegression({
  baseline: 'home-page-desktop',
  url: 'https://app.example.com',
  threshold: 0.99,  // 99% match required
  includeElements: ['.header', '.hero', '.cta-button']
});

// Result structure:
{
  passed: true,
  similarity: 0.998,
  diffPixels: 45,
  totalPixels: 2073600,
  timestamp: '2026-01-19T10:30:00Z'
}
```

### 2. Accessibility Auditing

```javascript
const audit = await vibiumClient.accessibility({
  url: 'https://app.example.com/products',
  standard: 'WCAG2AA',  // WCAG2A, WCAG2AA, WCAG2AAA
  includeWarnings: true
});

// Result structure:
{
  violations: [
    {
      id: 'color-contrast',
      impact: 'serious',
      tags: ['wcag2aa', 'wcag21a'],
      elements: 3,
      description: 'Elements must have sufficient color contrast'
    }
  ],
  passes: 24,
  incomplete: 2,
  scanTime: 156,
  score: 87
}
```

### 3. E2E User Workflows

```javascript
// Define user scenario
const scenario = {
  url: 'https://app.example.com',
  steps: [
    {
      action: 'click',
      selector: '[data-testid="login-button"]'
    },
    {
      action: 'fill',
      selector: 'input[name="email"]',
      value: 'test@example.com'
    },
    {
      action: 'fill',
      selector: 'input[name="password"]',
      value: process.env.TEST_PASSWORD
    },
    {
      action: 'click',
      selector: 'button[type="submit"]'
    },
    {
      action: 'waitFor',
      selector: '.dashboard',
      timeout: 5000
    },
    {
      action: 'screenshot',
      name: 'dashboard-view'
    }
  ]
};

const result = await vibiumClient.runScenario(scenario);

// Result structure:
{
  success: true,
  duration: 2341,
  screenshots: {
    'dashboard-view': '/path/to/screenshot.png'
  },
  logs: [...]
}
```

### 4. Performance Metrics

```javascript
const metrics = await vibiumClient.performance({
  url: 'https://app.example.com',
  viewport: { width: 1920, height: 1080 },
  network: 'fast-4g'
});

// Result structure:
{
  metrics: {
    firstContentfulPaint: 1245,      // ms
    largestContentfulPaint: 2156,     // ms
    cumulativeLayoutShift: 0.012,     // unitless
    timeToInteractive: 3421,          // ms
    totalBlockingTime: 145            // ms
  },
  score: {
    performance: 92,
    accessibility: 87,
    bestPractices: 88,
    seo: 95,
    pwa: 79
  }
}
```

### 5. Mobile Device Emulation

```javascript
const mobileResult = await vibiumClient.emulate({
  url: 'https://app.example.com',
  device: 'iPhone 14 Pro',  // or custom device
  scenarios: ['portrait', 'landscape']
});

// Supports devices:
// - iPhone 14 Pro, iPhone 13, iPhone 12
// - Pixel 7, Pixel 6, Pixel 5
// - iPad Pro, iPad Air, iPad Mini
// - Galaxy S22, Galaxy S21, Galaxy S20
// - Custom: { width, height, userAgent }
```

### 6. Network Throttling

```javascript
const throttledResult = await vibiumClient.networkTest({
  url: 'https://app.example.com',
  profiles: [
    {
      name: 'Slow 4G',
      download: 400,    // kbps
      upload: 100,      // kbps
      latency: 400      // ms
    },
    {
      name: 'Fast 4G',
      download: 1600,
      upload: 750,
      latency: 50
    }
  ]
});
```

## Orchestrating Multi-Agent Workflows

### Parallel Visual Testing

```javascript
const { agentic_qe__task_orchestrate } = require('@agentic-qe/v3');

const results = await agentic_qe__task_orchestrate({
  task: 'parallel-visual-regression',
  strategy: 'parallel',
  payload: {
    baselines: [
      'home-page-desktop',
      'product-page-mobile',
      'checkout-flow',
      'user-profile'
    ],
    threshold: 0.99
  }
});

// Each agent handles one baseline in parallel
```

### Sequential Accessibility Audits

```javascript
const auditResults = await agentic_qe__task_orchestrate({
  task: 'accessibility-audit-suite',
  strategy: 'sequential',
  payload: {
    urls: [
      'https://app.example.com',
      'https://app.example.com/products',
      'https://app.example.com/checkout'
    ],
    standard: 'WCAG2AA',
    failOnViolations: true
  }
});
```

### Adaptive E2E Testing

```javascript
const adaptiveResult = await agentic_qe__task_orchestrate({
  task: 'adaptive-e2e-testing',
  strategy: 'adaptive',  // Adjusts based on real-time results
  payload: {
    scenarios: userScenarios,
    retryFailed: true,
    maxRetries: 3
  }
});
```

## Memory Integration

### Store Visual Test Results

```javascript
const { agentic_qe__memory_store } = require('@agentic-qe/v3');

await agentic_qe__memory_store({
  key: 'visual-test-home-page-2026-01-19',
  namespace: 'visual-testing',
  value: {
    baseline: 'home-page-desktop',
    timestamp: new Date().toISOString(),
    result: visualResult,
    passed: visualResult.similarity > 0.99,
    diffPixels: visualResult.diffPixels
  }
});
```

### Query Previous Results

```javascript
const { agentic_qe__memory_query } = require('@agentic-qe/v3');

const recentResults = await agentic_qe__memory_query({
  pattern: 'visual-test-*',
  namespace: 'visual-testing'
});

// Use for trend analysis and baseline selection
```

### Share Findings Between Agents

```javascript
const { agentic_qe__memory_share } = require('@agentic-qe/v3');

await agentic_qe__memory_share({
  sourceAgentId: 'visual-tester-001',
  targetAgentIds: ['accessibility-auditor-001', 'e2e-tester-001'],
  knowledgeDomain: 'ui-issues-detected'
});
```

## Environment-Specific Configuration

### Development Mode

```bash
# Enable debug logging and visible browser
export VIBIUM_HEADLESS=false
export VIBIUM_DEBUG=true
export VIBIUM_TIMEOUT=60000

# Run tests
npm run test:visual
```

### CI/CD Environment (GitHub Actions)

```yaml
name: Visual Testing with Vibium

on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest

    env:
      VIBIUM_HEADLESS: 'true'
      VIBIUM_DEBUG: 'false'
      NODE_OPTIONS: '--max-old-space-size=4096'

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Run visual tests
        run: npm run test:visual:ci
```

### Production Environment

```javascript
// config/vibium.prod.js
module.exports = {
  headless: true,
  debug: false,
  timeout: 30000,
  retryFailed: true,
  maxRetries: 2,
  parallel: true,
  maxConcurrent: 10
};
```

## Error Handling

### Common Errors and Solutions

```javascript
// Error: Baseline not found
try {
  const result = await vibiumClient.visualRegression({
    baseline: 'non-existent-baseline'
  });
} catch (error) {
  if (error.code === 'BASELINE_NOT_FOUND') {
    // Create baseline first
    await vibiumClient.saveBaseline({ /* ... */ });
  }
}

// Error: Timeout
try {
  const result = await vibiumClient.runScenario(scenario);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    // Increase timeout or simplify scenario
    scenario.timeout = 10000;
  }
}

// Error: Chrome not available
try {
  await vibiumClient.screenshot({ url });
} catch (error) {
  if (error.message.includes('Chrome')) {
    // Install Chrome
    exec('npx @vibium/cli install-chrome');
  }
}
```

## Performance Tuning

### For Local Development

```javascript
// Faster feedback loop
const config = {
  headless: false,        // Visible for debugging
  timeout: 60000,         // Longer timeout
  screenshot: true,       // Capture each step
  slowMo: 100            // Slow down for visibility
};
```

### For CI/CD Pipeline

```javascript
// Optimized for speed
const config = {
  headless: true,         // No UI overhead
  timeout: 30000,
  parallel: true,
  maxConcurrent: 10,
  screenshot: false,      // Only on failure
  retryFailed: true,
  maxRetries: 2
};
```

## Troubleshooting in Agents

### Debug Logging

```javascript
class VibiumTestAgent {
  async runTest(config) {
    if (process.env.VIBIUM_DEBUG) {
      console.log('[Vibium] Starting test:', config);
    }

    try {
      const result = await this.vibiumClient.visualRegression(config);
      console.log('[Vibium] Result:', result);
      return result;
    } catch (error) {
      console.error('[Vibium] Error:', error.message);
      throw error;
    }
  }
}
```

### Collecting Diagnostics

```javascript
// Get Vibium server health
const health = await vibiumClient.health();
console.log('Vibium Status:', {
  available: health.status === 'ok',
  chromeVersion: health.chromeVersion,
  uptime: health.uptime,
  memory: health.memory
});
```

## Next Steps

1. **Review**: Read the main setup guide at `vibium-setup.md`
2. **Integrate**: Add Vibium agents to your AQE v3 fleet
3. **Test**: Run visual tests against your application
4. **Monitor**: Track visual regression metrics over time
5. **Scale**: Deploy to CI/CD for continuous visual testing
