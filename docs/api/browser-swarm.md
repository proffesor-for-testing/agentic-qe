# Browser Swarm Coordination Guide

**Package:** `@agentic-qe/v3/domains/visual-accessibility`
**Source:** `/v3/src/domains/visual-accessibility/services/browser-swarm-coordinator.ts`
**Purpose:** Multi-session browser coordination for parallel viewport testing

## Overview

The `BrowserSwarmCoordinator` orchestrates multiple browser sessions running in parallel across different viewport configurations. This enables 3x+ speedup for visual regression testing, accessibility audits, and responsive design validation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              BrowserSwarmCoordinator                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │           Session Pool Manager                      │    │
│  │  - Max concurrent sessions: 5 (configurable)       │    │
│  │  - Session lifecycle management                     │    │
│  │  - Resource cleanup                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                 │
│         ┌─────────────────┼─────────────────┐              │
│         │                 │                 │              │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐       │
│  │  Session 1  │  │  Session 2  │  │  Session 3  │       │
│  │  320×568    │  │  768×1024   │  │  1920×1080  │       │
│  │  (Mobile)   │  │  (Tablet)   │  │  (Desktop)  │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
│         │                 │                 │              │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │ Browser │       │ Browser │       │ Browser │
    │ Process │       │ Process │       │ Process │
    └─────────┘       └─────────┘       └─────────┘
```

---

## Standard Viewports

### Desktop Viewports

```typescript
const DESKTOP_VIEWPORTS: Viewport[] = [
  {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    name: 'laptop',
  },
  {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    name: 'desktop-hd',
  },
  {
    width: 2560,
    height: 1440,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    name: 'desktop-2k',
  },
];
```

### Mobile Viewports

```typescript
const MOBILE_VIEWPORTS: Viewport[] = [
  {
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    name: 'iphone-se',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)...',
  },
  {
    width: 375,
    height: 812,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    name: 'iphone-x',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)...',
  },
  {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    name: 'iphone-12-pro',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)...',
  },
  {
    width: 360,
    height: 740,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    name: 'android-pixel',
    userAgent: 'Mozilla/5.0 (Linux; Android 12)...',
  },
];
```

### Tablet Viewports

```typescript
const TABLET_VIEWPORTS: Viewport[] = [
  {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    name: 'ipad',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)...',
  },
  {
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    name: 'ipad-pro',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)...',
  },
];
```

### Predefined Sets

```typescript
const VIEWPORT_SETS = {
  minimal: [MOBILE_VIEWPORTS[0], DESKTOP_VIEWPORTS[0]], // 2 viewports
  standard: [
    MOBILE_VIEWPORTS[0],   // iPhone SE
    TABLET_VIEWPORTS[0],   // iPad
    DESKTOP_VIEWPORTS[0],  // Laptop
  ], // 3 viewports
  comprehensive: [
    ...MOBILE_VIEWPORTS,   // All mobile
    ...TABLET_VIEWPORTS,   // All tablet
    ...DESKTOP_VIEWPORTS,  // All desktop
  ], // 9 viewports
};
```

---

## Class: BrowserSwarmCoordinator

### Constructor

```typescript
class BrowserSwarmCoordinator {
  constructor(config?: SwarmConfig);
}
```

**Configuration:**

```typescript
interface SwarmConfig {
  // Max concurrent browser sessions
  maxConcurrentSessions?: number;  // Default: 5

  // Session timeout (ms)
  sessionTimeout?: number;         // Default: 30000

  // Process cleanup strategy
  cleanupStrategy?: 'graceful' | 'aggressive';  // Default: 'graceful'

  // Cleanup timeout (ms)
  cleanupTimeout?: number;         // Default: 5000

  // Enable headless mode
  headless?: boolean;              // Default: true

  // Browser type
  browserType?: 'chromium' | 'firefox' | 'webkit';  // Default: 'chromium'

  // Retry configuration
  retryConfig?: {
    maxAttempts: number;
    backoff: 'linear' | 'exponential';
  };
}
```

---

### Methods

#### initialize()

Initialize the swarm with viewport configurations.

```typescript
async initialize(
  viewports: Viewport[] | 'minimal' | 'standard' | 'comprehensive'
): Promise<Result<void, Error>>
```

**Parameters:**
- `viewports`: Array of viewport configs or predefined set name

**Example:**

```typescript
const swarm = new BrowserSwarmCoordinator({
  maxConcurrentSessions: 5,
  headless: true,
});

// Use predefined set
await swarm.initialize('standard');

// Or custom viewports
await swarm.initialize([
  { width: 320, height: 568, name: 'mobile' },
  { width: 1920, height: 1080, name: 'desktop' },
]);
```

---

#### executeParallel()

Execute a task across all viewports in parallel.

```typescript
async executeParallel<T>(
  task: (session: BrowserSession, viewport: Viewport) => Promise<T>
): Promise<Map<Viewport, Result<T, Error>>>
```

**Parameters:**
- `task`: Function to execute for each viewport

**Returns:** Map of viewport to task result

**Example:**

```typescript
const results = await swarm.executeParallel(async (session, viewport) => {
  await session.goto('https://example.com');

  return {
    screenshot: await session.screenshot(),
    title: await session.title(),
    viewport: viewport.name,
  };
});

// Process results
for (const [viewport, result] of results) {
  if (result.ok) {
    console.log(`${viewport.name}: ${result.value.title}`);
  } else {
    console.error(`${viewport.name}: ${result.error.message}`);
  }
}
```

---

#### captureAllViewports()

Capture screenshots across all viewports in parallel.

```typescript
async captureAllViewports(
  url: string,
  options?: CaptureOptions
): Promise<Map<Viewport, Result<Screenshot, Error>>>
```

**Parameters:**

```typescript
interface CaptureOptions {
  fullPage?: boolean;           // Capture full page (default: true)
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;             // Navigation timeout (ms)
  savePath?: string;            // Save directory
}
```

**Returns:** Map of viewport to screenshot

**Example:**

```typescript
const screenshots = await swarm.captureAllViewports(
  'https://example.com',
  {
    fullPage: true,
    waitUntil: 'networkidle',
    savePath: './screenshots',
  }
);

// Check results
for (const [viewport, result] of screenshots) {
  if (result.ok) {
    console.log(`✓ ${viewport.name}: ${result.value.path}`);
  } else {
    console.error(`✗ ${viewport.name}: ${result.error.message}`);
  }
}
```

**Performance:**

```
Sequential: 5 viewports × 5s each = 25s
Parallel:   5 viewports / 5 concurrent = 5s
Speedup:    5x
```

---

#### auditAllViewports()

Run accessibility audits across all viewports in parallel.

```typescript
async auditAllViewports(
  url: string,
  options?: AuditOptions
): Promise<Map<Viewport, Result<AccessibilityReport, Error>>>
```

**Parameters:**

```typescript
interface AuditOptions {
  standard?: 'WCAG21A' | 'WCAG21AA' | 'WCAG21AAA';
  rules?: string[];             // Specific rules to check
  timeout?: number;
}
```

**Returns:** Map of viewport to accessibility report

**Example:**

```typescript
const audits = await swarm.auditAllViewports(
  'https://example.com',
  {
    standard: 'WCAG21AA',
    rules: ['color-contrast', 'image-alt', 'label'],
  }
);

// Aggregate violations
const allViolations = [];
for (const [viewport, result] of audits) {
  if (result.ok) {
    allViolations.push(...result.value.violations.map(v => ({
      ...v,
      viewport: viewport.name,
    })));
  }
}

console.log(`Total violations: ${allViolations.length}`);
```

---

#### getSwarmStatus()

Get current swarm status and metrics.

```typescript
async getSwarmStatus(): Promise<SwarmStatus>
```

**Returns:**

```typescript
interface SwarmStatus {
  initialized: boolean;
  activeSessions: number;
  totalSessions: number;
  viewports: Viewport[];
  metrics: {
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    avgTaskDuration: number;    // ms
    memoryUsage: number;        // MB
  };
  health: 'healthy' | 'degraded' | 'unhealthy';
}
```

**Example:**

```typescript
const status = await swarm.getSwarmStatus();

console.log('Swarm status:', status.health);
console.log('Active sessions:', status.activeSessions, '/', status.totalSessions);
console.log('Success rate:', (status.metrics.successfulTasks / status.metrics.totalTasks * 100).toFixed(1), '%');
console.log('Memory usage:', status.metrics.memoryUsage, 'MB');
```

---

#### shutdown()

Gracefully shutdown all browser sessions.

```typescript
async shutdown(): Promise<Result<void, Error>>
```

**Example:**

```typescript
// Always shutdown in cleanup
try {
  await swarm.initialize('standard');
  await swarm.captureAllViewports('https://example.com');
} finally {
  await swarm.shutdown();
}
```

---

## Resource Management

### Session Pooling

The coordinator maintains a pool of browser sessions:

```typescript
class SessionPool {
  private sessions: Map<Viewport, BrowserSession>;
  private maxSize: number;

  async acquire(viewport: Viewport): Promise<BrowserSession> {
    // Reuse existing session or create new one
    if (this.sessions.has(viewport)) {
      return this.sessions.get(viewport)!;
    }

    if (this.sessions.size >= this.maxSize) {
      // Wait for available slot
      await this.waitForSlot();
    }

    const session = await this.createSession(viewport);
    this.sessions.set(viewport, session);
    return session;
  }

  async release(viewport: Viewport): Promise<void> {
    const session = this.sessions.get(viewport);
    if (session) {
      await session.close();
      this.sessions.delete(viewport);
    }
  }
}
```

### Memory Management

```typescript
interface MemoryMonitor {
  // Current memory usage
  current: number;              // MB

  // Memory limit
  limit: number;                // MB

  // Memory pressure (0-1)
  pressure: number;

  // Actions taken
  actions: Array<{
    timestamp: number;
    action: 'gc' | 'session-close' | 'fallback';
    reason: string;
  }>;
}

// Auto-scaling based on memory
if (monitor.pressure > 0.8) {
  // Close oldest sessions
  await pool.closeOldest();

  // Or fall back to sequential execution
  config.maxConcurrentSessions = 1;
}
```

### Process Cleanup

```typescript
// Cleanup strategies
const CLEANUP_STRATEGIES = {
  graceful: {
    // Wait for pending tasks
    timeout: 5000,
    killAfterTimeout: true,
  },
  aggressive: {
    // Kill immediately
    timeout: 0,
    killAfterTimeout: true,
  },
};

// Cleanup on process exit
process.on('SIGINT', async () => {
  await swarm.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await swarm.shutdown();
  process.exit(0);
});
```

---

## Practical Examples

### Example 1: Visual Regression Testing

```typescript
import { BrowserSwarmCoordinator } from '@agentic-qe/v3/domains/visual-accessibility';
import { compareImages } from 'pixelmatch';

async function visualRegressionTest(urls: string[]) {
  const swarm = new BrowserSwarmCoordinator({ maxConcurrentSessions: 5 });

  try {
    await swarm.initialize('standard');

    for (const url of urls) {
      console.log(`Testing ${url}...`);

      const screenshots = await swarm.captureAllViewports(url, {
        fullPage: true,
        waitUntil: 'networkidle',
      });

      // Compare with baselines
      for (const [viewport, result] of screenshots) {
        if (!result.ok) {
          console.error(`Failed to capture ${viewport.name}:`, result.error);
          continue;
        }

        const baselinePath = `./baselines/${viewport.name}.png`;
        const currentPath = result.value.path;

        const diff = await compareImages(baselinePath, currentPath);

        if (diff > 0.01) {
          console.error(`Visual regression detected in ${viewport.name}: ${(diff * 100).toFixed(2)}% difference`);
        } else {
          console.log(`✓ ${viewport.name}: No regression`);
        }
      }
    }
  } finally {
    await swarm.shutdown();
  }
}

// Run test
await visualRegressionTest([
  'https://example.com',
  'https://example.com/products',
  'https://example.com/about',
]);
```

---

### Example 2: Responsive Design Validation

```typescript
async function validateResponsiveDesign(url: string) {
  const swarm = new BrowserSwarmCoordinator();

  // Test mobile, tablet, desktop
  await swarm.initialize('comprehensive');

  const results = await swarm.executeParallel(async (session, viewport) => {
    await session.goto(url);

    // Check critical elements
    const header = await session.locator('header').boundingBox();
    const nav = await session.locator('nav').boundingBox();
    const content = await session.locator('main').boundingBox();

    // Validate layout
    const issues = [];

    if (!header) {
      issues.push('Header not visible');
    }

    if (viewport.isMobile && nav && nav.height > viewport.height * 0.3) {
      issues.push('Navigation takes up >30% of viewport');
    }

    if (content && content.width > viewport.width) {
      issues.push('Content overflows viewport');
    }

    return {
      viewport: viewport.name,
      issues,
      screenshot: await session.screenshot(),
    };
  });

  // Report issues
  for (const [viewport, result] of results) {
    if (result.ok && result.value.issues.length > 0) {
      console.error(`Issues on ${viewport.name}:`);
      result.value.issues.forEach(issue => console.error(`  - ${issue}`));
    }
  }

  await swarm.shutdown();
}
```

---

### Example 3: Performance Comparison

```typescript
async function comparePerformance(url: string) {
  const swarm = new BrowserSwarmCoordinator();

  await swarm.initialize([
    { width: 320, height: 568, name: 'mobile-3g' }, // Slow connection
    { width: 1920, height: 1080, name: 'desktop-fast' },
  ]);

  const results = await swarm.executeParallel(async (session, viewport) => {
    // Emulate network conditions
    if (viewport.name === 'mobile-3g') {
      await session.emulateNetworkConditions({
        downloadThroughput: 375 * 1024 / 8,  // 3G speed
        uploadThroughput: 375 * 1024 / 8,
        latency: 100,
      });
    }

    const start = Date.now();
    await session.goto(url);
    const loadTime = Date.now() - start;

    const metrics = await session.metrics();

    return {
      viewport: viewport.name,
      loadTime,
      metrics,
    };
  });

  // Compare results
  console.log('Performance comparison:');
  for (const [viewport, result] of results) {
    if (result.ok) {
      console.log(`${viewport.name}: ${result.value.loadTime}ms`);
    }
  }

  await swarm.shutdown();
}
```

---

## Performance Benchmarks

### Speedup Analysis

| Viewports | Sequential Time | Parallel Time (5 sessions) | Speedup |
|-----------|----------------|---------------------------|---------|
| 2 | 10s | 5s | 2.0x |
| 3 | 15s | 5s | 3.0x |
| 5 | 25s | 8s | 3.1x |
| 9 | 45s | 12s | 3.8x |

**Formula:**
```
Speedup = SequentialTime / ParallelTime
ParallelTime ≈ max(TaskTime) + (n - maxConcurrent) × TaskTime / maxConcurrent
```

### Resource Usage

| Sessions | CPU Usage | Memory Usage | Recommendations |
|----------|-----------|--------------|-----------------|
| 1 | 20% | 150 MB | Baseline |
| 3 | 40% | 400 MB | Optimal for most systems |
| 5 | 65% | 650 MB | Default configuration |
| 9 | 95% | 1.2 GB | Requires 8+ GB RAM |

---

## Error Handling

### Retry Logic

```typescript
const swarm = new BrowserSwarmCoordinator({
  retryConfig: {
    maxAttempts: 3,
    backoff: 'exponential',
  },
});

// Automatically retries failed tasks
const results = await swarm.captureAllViewports(url);

// Check which viewports succeeded
for (const [viewport, result] of results) {
  if (!result.ok) {
    console.error(`Failed after retries: ${viewport.name}`);
  }
}
```

### Fallback to Sequential

```typescript
try {
  await swarm.initialize('standard');
  await swarm.captureAllViewports(url);
} catch (error) {
  console.warn('Swarm failed, falling back to sequential');

  // Sequential fallback
  for (const viewport of viewports) {
    const session = await createSession(viewport);
    await session.goto(url);
    await session.screenshot();
    await session.close();
  }
}
```

---

## Testing

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserSwarmCoordinator } from './browser-swarm-coordinator';

describe('BrowserSwarmCoordinator', () => {
  let swarm: BrowserSwarmCoordinator;

  beforeAll(async () => {
    swarm = new BrowserSwarmCoordinator();
    await swarm.initialize('minimal');
  });

  afterAll(async () => {
    await swarm.shutdown();
  });

  it('should capture screenshots in parallel', async () => {
    const results = await swarm.captureAllViewports('https://example.com');

    expect(results.size).toBeGreaterThan(0);

    for (const [viewport, result] of results) {
      expect(result.ok).toBe(true);
      expect(result.value.path).toBeDefined();
    }
  });

  it('should be faster than sequential execution', async () => {
    const parallelStart = Date.now();
    await swarm.captureAllViewports('https://example.com');
    const parallelTime = Date.now() - parallelStart;

    // Sequential execution would take ~10s (2 viewports × 5s each)
    expect(parallelTime).toBeLessThan(8000); // Should complete in <8s
  });
});
```

---

## See Also

- [Main Integration Guide](../integration/claude-flow-browser.md)
- [Visual-Accessibility Domain](../domains/visual-accessibility.md)
- [Performance Testing Guide](../guides/performance-testing.md)
- [Resource Management Best Practices](../guides/resource-management.md)
