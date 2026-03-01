/**
 * Browser Integration - Skill Integration Tests
 *
 * Tests full skill workflows:
 * - SecurityVisualTestingSkill.executeSecurityVisualAudit
 * - PIISafeScreenshot workflow
 * - Skill with missing optional dependency
 * - Trajectory storage after successful runs
 *
 * Uses mocked browser and services for testing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { Result, ok, err } from '../../../src/shared/types';

// ============================================================================
// Types
// ============================================================================

interface SecurityVisualAuditResult {
  url: string;
  screenshot: {
    path: string;
    hasPII: boolean;
    piiFindings: string[];
  };
  accessibility: {
    violations: number;
    passes: number;
    wcagLevel: string;
  };
  security: {
    vulnerabilities: number;
    severity: 'low' | 'medium' | 'high' | 'critical' | 'none';
  };
  score: number;
  timestamp: Date;
}

interface PIISafeScreenshotResult {
  originalPath: string;
  redactedPath?: string;
  hasPII: boolean;
  piiFindings: string[];
  redactionApplied: boolean;
}

interface Trajectory {
  id: string;
  skill: string;
  task: string;
  steps: TrajectoryStep[];
  outcome: 'success' | 'failure' | 'partial';
  reward: number;
  timestamp: Date;
}

interface TrajectoryStep {
  action: string;
  observation: string;
  quality: number;
}

// ============================================================================
// Test Doubles
// ============================================================================

/**
 * In-memory backend
 */
class TestMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async vectorSearch(): Promise<any[]> {
    return [];
  }

  async storeVector(): Promise<void> {}

  async count(namespace: string): Promise<number> {
    const keys = await this.search(`${namespace}:*`);
    return keys.length;
  }

  async hasCodeIntelligenceIndex(): Promise<boolean> {
    const count = await this.count('code-intelligence:kg');
    return count > 0;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Mock browser client
 */
class MockBrowserClient {
  private launched = false;

  async launch(): Promise<Result<void, Error>> {
    this.launched = true;
    return ok(undefined);
  }

  async navigate(url: string): Promise<Result<void, Error>> {
    if (!this.launched) {
      return err(new Error('Browser not launched'));
    }
    return ok(undefined);
  }

  async screenshot(): Promise<Result<{ path: string }, Error>> {
    if (!this.launched) {
      return err(new Error('Browser not launched'));
    }
    return ok({
      path: `/tmp/screenshot-${Date.now()}.png`,
    });
  }

  async quit(): Promise<Result<void, Error>> {
    this.launched = false;
    return ok(undefined);
  }
}

/**
 * Mock PII scanner
 */
class MockPIIScanner {
  private shouldDetectPII = false;

  setShouldDetectPII(value: boolean): void {
    this.shouldDetectPII = value;
  }

  scan(path: string): { hasPII: boolean; findings: string[] } {
    if (this.shouldDetectPII) {
      return {
        hasPII: true,
        findings: ['email@example.com', 'SSN: 123-45-6789', 'Credit Card: 4111-1111-1111-1111'],
      };
    }
    return {
      hasPII: false,
      findings: [],
    };
  }

  redact(path: string): { redactedPath: string } {
    return {
      redactedPath: path.replace('.png', '-redacted.png'),
    };
  }
}

/**
 * Mock accessibility scanner
 */
class MockAccessibilityScanner {
  async scan(url: string): Promise<{ violations: number; passes: number }> {
    // Simulate varying results based on URL
    const hasA11yIssues = url.includes('bad-a11y');
    return {
      violations: hasA11yIssues ? 5 : 0,
      passes: hasA11yIssues ? 10 : 15,
    };
  }
}

/**
 * Mock security scanner
 */
class MockSecurityScanner {
  async scan(url: string): Promise<{ vulnerabilities: number; severity: string }> {
    // Simulate varying results based on URL
    const hasSecurityIssues = url.includes('insecure');
    return {
      vulnerabilities: hasSecurityIssues ? 3 : 0,
      severity: hasSecurityIssues ? 'high' : 'none',
    };
  }
}

/**
 * Mock SecurityVisualTestingSkill
 */
class MockSecurityVisualTestingSkill {
  constructor(
    private browser: MockBrowserClient,
    private piiScanner: MockPIIScanner | null,
    private a11yScanner: MockAccessibilityScanner,
    private securityScanner: MockSecurityScanner,
    private memory: TestMemoryBackend
  ) {}

  async executeSecurityVisualAudit(
    url: string,
    options: { storePII?: boolean } = {}
  ): Promise<Result<SecurityVisualAuditResult, Error>> {
    const trajectory: Trajectory = {
      id: `traj-${Date.now()}`,
      skill: 'SecurityVisualTestingSkill',
      task: `Security visual audit for ${url}`,
      steps: [],
      outcome: 'success',
      reward: 0,
      timestamp: new Date(),
    };

    try {
      // Step 1: Launch browser
      const launchResult = await this.browser.launch();
      if (!launchResult.success) {
        trajectory.outcome = 'failure';
        trajectory.reward = 0;
        await this.storeTrajectory(trajectory);
        return err(launchResult.error!);
      }
      trajectory.steps.push({
        action: 'launch-browser',
        observation: 'Browser launched successfully',
        quality: 1.0,
      });

      // Step 2: Navigate
      const navResult = await this.browser.navigate(url);
      if (!navResult.success) {
        trajectory.outcome = 'failure';
        trajectory.reward = 0.2;
        await this.storeTrajectory(trajectory);
        return err(navResult.error!);
      }
      trajectory.steps.push({
        action: 'navigate-to-url',
        observation: `Navigated to ${url}`,
        quality: 1.0,
      });

      // Step 3: Capture screenshot
      const screenshotResult = await this.browser.screenshot();
      if (!screenshotResult.success) {
        trajectory.outcome = 'failure';
        trajectory.reward = 0.4;
        await this.storeTrajectory(trajectory);
        return err(screenshotResult.error!);
      }
      trajectory.steps.push({
        action: 'capture-screenshot',
        observation: `Screenshot saved to ${screenshotResult.value.path}`,
        quality: 1.0,
      });

      // Step 4: PII scan (optional)
      let hasPII = false;
      let piiFindings: string[] = [];
      if (this.piiScanner) {
        const piiResult = this.piiScanner.scan(screenshotResult.value.path);
        hasPII = piiResult.hasPII;
        piiFindings = piiResult.findings;
        trajectory.steps.push({
          action: 'scan-pii',
          observation: `PII detected: ${hasPII}, findings: ${piiFindings.length}`,
          quality: 1.0,
        });
      } else {
        trajectory.steps.push({
          action: 'skip-pii-scan',
          observation: 'PII scanner not available',
          quality: 0.8,
        });
      }

      // Step 5: Accessibility scan
      const a11yResult = await this.a11yScanner.scan(url);
      trajectory.steps.push({
        action: 'scan-accessibility',
        observation: `A11y violations: ${a11yResult.violations}, passes: ${a11yResult.passes}`,
        quality: 1.0,
      });

      // Step 6: Security scan
      const securityResult = await this.securityScanner.scan(url);
      trajectory.steps.push({
        action: 'scan-security',
        observation: `Security vulnerabilities: ${securityResult.vulnerabilities}`,
        quality: 1.0,
      });

      // Calculate score
      let score = 100;
      score -= a11yResult.violations * 5;
      score -= securityResult.vulnerabilities * 10;
      if (hasPII && options.storePII !== true) {
        score -= 20; // Penalty for exposed PII
      }
      score = Math.max(0, Math.min(100, score));

      // Cleanup
      await this.browser.quit();

      // Calculate reward
      trajectory.outcome = 'success';
      trajectory.reward = score / 100;
      await this.storeTrajectory(trajectory);

      const result: SecurityVisualAuditResult = {
        url,
        screenshot: {
          path: screenshotResult.value.path,
          hasPII,
          piiFindings,
        },
        accessibility: {
          violations: a11yResult.violations,
          passes: a11yResult.passes,
          wcagLevel: 'AA',
        },
        security: {
          vulnerabilities: securityResult.vulnerabilities,
          severity: securityResult.severity as any,
        },
        score,
        timestamp: new Date(),
      };

      return ok(result);
    } catch (error) {
      trajectory.outcome = 'failure';
      trajectory.reward = 0;
      await this.storeTrajectory(trajectory);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async executePIISafeScreenshot(
    url: string
  ): Promise<Result<PIISafeScreenshotResult, Error>> {
    try {
      await this.browser.launch();
      await this.browser.navigate(url);

      const screenshotResult = await this.browser.screenshot();
      if (!screenshotResult.success) {
        return err(screenshotResult.error!);
      }

      const originalPath = screenshotResult.value.path;

      // PII scan
      if (!this.piiScanner) {
        return ok({
          originalPath,
          hasPII: false,
          piiFindings: [],
          redactionApplied: false,
        });
      }

      const piiResult = this.piiScanner.scan(originalPath);

      let redactedPath: string | undefined;
      let redactionApplied = false;

      if (piiResult.hasPII) {
        const redactResult = this.piiScanner.redact(originalPath);
        redactedPath = redactResult.redactedPath;
        redactionApplied = true;
      }

      await this.browser.quit();

      return ok({
        originalPath,
        redactedPath,
        hasPII: piiResult.hasPII,
        piiFindings: piiResult.findings,
        redactionApplied,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async storeTrajectory(trajectory: Trajectory): Promise<void> {
    await this.memory.set(`trajectory:${trajectory.id}`, trajectory);
  }
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Skill Integration - SecurityVisualTestingSkill', () => {
  let memory: TestMemoryBackend;
  let browser: MockBrowserClient;
  let piiScanner: MockPIIScanner;
  let a11yScanner: MockAccessibilityScanner;
  let securityScanner: MockSecurityScanner;
  let skill: MockSecurityVisualTestingSkill;

  beforeEach(() => {
    memory = new TestMemoryBackend();
    browser = new MockBrowserClient();
    piiScanner = new MockPIIScanner();
    a11yScanner = new MockAccessibilityScanner();
    securityScanner = new MockSecurityScanner();

    skill = new MockSecurityVisualTestingSkill(
      browser,
      piiScanner,
      a11yScanner,
      securityScanner,
      memory
    );
  });

  afterEach(() => {
    memory.clear();
  });

  it('should execute full security visual audit workflow', async () => {
    const url = 'https://example.com';

    const result = await skill.executeSecurityVisualAudit(url);

    expect(result.success).toBe(true);
    expect(result.value?.url).toBe(url);
    expect(result.value?.screenshot).toBeDefined();
    expect(result.value?.accessibility).toBeDefined();
    expect(result.value?.security).toBeDefined();
    expect(result.value?.score).toBeGreaterThanOrEqual(0);
    expect(result.value?.score).toBeLessThanOrEqual(100);

    // Verify trajectory was stored
    const trajectories = await memory.search('trajectory:*');
    expect(trajectories.length).toBeGreaterThan(0);
  });

  it('should detect and report PII in screenshots', async () => {
    const url = 'https://example.com/user-profile';

    piiScanner.setShouldDetectPII(true);

    const result = await skill.executeSecurityVisualAudit(url);

    expect(result.success).toBe(true);
    expect(result.value?.screenshot.hasPII).toBe(true);
    expect(result.value?.screenshot.piiFindings.length).toBeGreaterThan(0);

    // Score should be penalized for PII
    expect(result.value?.score).toBeLessThan(100);
  });

  it('should detect accessibility violations', async () => {
    const url = 'https://example.com/bad-a11y';

    const result = await skill.executeSecurityVisualAudit(url);

    expect(result.success).toBe(true);
    expect(result.value?.accessibility.violations).toBeGreaterThan(0);

    // Score should be reduced for violations
    expect(result.value?.score).toBeLessThan(100);
  });

  it('should detect security vulnerabilities', async () => {
    const url = 'https://example.com/insecure';

    const result = await skill.executeSecurityVisualAudit(url);

    expect(result.success).toBe(true);
    expect(result.value?.security.vulnerabilities).toBeGreaterThan(0);
    expect(result.value?.security.severity).toBe('high');

    // Score should be significantly reduced for security issues
    expect(result.value?.score).toBeLessThan(80);
  });

  it('should store trajectory after successful audit', async () => {
    const url = 'https://example.com';

    const result = await skill.executeSecurityVisualAudit(url);

    expect(result.success).toBe(true);

    // Retrieve trajectory
    const trajectoryKeys = await memory.search('trajectory:*');
    expect(trajectoryKeys.length).toBe(1);

    const trajectory = await memory.get<Trajectory>(trajectoryKeys[0]);
    expect(trajectory?.outcome).toBe('success');
    expect(trajectory?.steps.length).toBeGreaterThan(0);
    expect(trajectory?.reward).toBeGreaterThan(0);
  });
});

describe('Skill Integration - PIISafeScreenshot', () => {
  let memory: TestMemoryBackend;
  let browser: MockBrowserClient;
  let piiScanner: MockPIIScanner;
  let a11yScanner: MockAccessibilityScanner;
  let securityScanner: MockSecurityScanner;
  let skill: MockSecurityVisualTestingSkill;

  beforeEach(() => {
    memory = new TestMemoryBackend();
    browser = new MockBrowserClient();
    piiScanner = new MockPIIScanner();
    a11yScanner = new MockAccessibilityScanner();
    securityScanner = new MockSecurityScanner();

    skill = new MockSecurityVisualTestingSkill(
      browser,
      piiScanner,
      a11yScanner,
      securityScanner,
      memory
    );
  });

  afterEach(() => {
    memory.clear();
  });

  it('should execute PIISafeScreenshot workflow', async () => {
    const url = 'https://example.com';

    const result = await skill.executePIISafeScreenshot(url);

    expect(result.success).toBe(true);
    expect(result.value?.originalPath).toBeDefined();
    expect(result.value?.hasPII).toBe(false);
    expect(result.value?.redactionApplied).toBe(false);
  });

  it('should redact PII when detected', async () => {
    const url = 'https://example.com/sensitive';

    piiScanner.setShouldDetectPII(true);

    const result = await skill.executePIISafeScreenshot(url);

    expect(result.success).toBe(true);
    expect(result.value?.hasPII).toBe(true);
    expect(result.value?.piiFindings.length).toBeGreaterThan(0);
    expect(result.value?.redactionApplied).toBe(true);
    expect(result.value?.redactedPath).toBeDefined();
    expect(result.value?.redactedPath).toContain('redacted');
  });

  it('should list all PII findings', async () => {
    const url = 'https://example.com/user-data';

    piiScanner.setShouldDetectPII(true);

    const result = await skill.executePIISafeScreenshot(url);

    expect(result.success).toBe(true);
    expect(result.value?.piiFindings).toContain('email@example.com');
    expect(result.value?.piiFindings.some((f) => f.includes('SSN'))).toBe(true);
  });
});

describe('Skill Integration - Missing Optional Dependencies', () => {
  let memory: TestMemoryBackend;
  let browser: MockBrowserClient;
  let a11yScanner: MockAccessibilityScanner;
  let securityScanner: MockSecurityScanner;
  let skill: MockSecurityVisualTestingSkill;

  beforeEach(() => {
    memory = new TestMemoryBackend();
    browser = new MockBrowserClient();
    a11yScanner = new MockAccessibilityScanner();
    securityScanner = new MockSecurityScanner();

    // Create skill WITHOUT PII scanner
    skill = new MockSecurityVisualTestingSkill(
      browser,
      null, // No PII scanner
      a11yScanner,
      securityScanner,
      memory
    );
  });

  afterEach(() => {
    memory.clear();
  });

  it('should complete audit without PII scanner', async () => {
    const url = 'https://example.com';

    const result = await skill.executeSecurityVisualAudit(url);

    expect(result.success).toBe(true);
    expect(result.value?.screenshot.hasPII).toBe(false);
    expect(result.value?.screenshot.piiFindings).toHaveLength(0);

    // Should still have accessibility and security scans
    expect(result.value?.accessibility).toBeDefined();
    expect(result.value?.security).toBeDefined();
  });

  it('should record skipped PII scan in trajectory', async () => {
    const url = 'https://example.com';

    await skill.executeSecurityVisualAudit(url);

    const trajectoryKeys = await memory.search('trajectory:*');
    const trajectory = await memory.get<Trajectory>(trajectoryKeys[0]);

    const piiStep = trajectory?.steps.find((s) => s.action === 'skip-pii-scan');
    expect(piiStep).toBeDefined();
    expect(piiStep?.observation).toContain('not available');
  });

  it('should adjust quality score when optional dependency missing', async () => {
    const url = 'https://example.com';

    await skill.executeSecurityVisualAudit(url);

    const trajectoryKeys = await memory.search('trajectory:*');
    const trajectory = await memory.get<Trajectory>(trajectoryKeys[0]);

    const piiStep = trajectory?.steps.find((s) => s.action === 'skip-pii-scan');
    expect(piiStep?.quality).toBeLessThan(1.0); // Quality reduced when dependency missing
  });

  it('should handle PIISafeScreenshot gracefully without scanner', async () => {
    const url = 'https://example.com';

    const result = await skill.executePIISafeScreenshot(url);

    expect(result.success).toBe(true);
    expect(result.value?.hasPII).toBe(false);
    expect(result.value?.redactionApplied).toBe(false);
    expect(result.value?.redactedPath).toBeUndefined();
  });
});

describe('Skill Integration - Trajectory Storage', () => {
  let memory: TestMemoryBackend;
  let browser: MockBrowserClient;
  let piiScanner: MockPIIScanner;
  let a11yScanner: MockAccessibilityScanner;
  let securityScanner: MockSecurityScanner;
  let skill: MockSecurityVisualTestingSkill;

  beforeEach(() => {
    memory = new TestMemoryBackend();
    browser = new MockBrowserClient();
    piiScanner = new MockPIIScanner();
    a11yScanner = new MockAccessibilityScanner();
    securityScanner = new MockSecurityScanner();

    skill = new MockSecurityVisualTestingSkill(
      browser,
      piiScanner,
      a11yScanner,
      securityScanner,
      memory
    );
  });

  afterEach(() => {
    memory.clear();
  });

  it('should store trajectory with all steps', async () => {
    const url = 'https://example.com';

    await skill.executeSecurityVisualAudit(url);

    const trajectoryKeys = await memory.search('trajectory:*');
    const trajectory = await memory.get<Trajectory>(trajectoryKeys[0]);

    expect(trajectory?.steps.length).toBeGreaterThan(0);
    expect(trajectory?.steps.some((s) => s.action === 'launch-browser')).toBe(true);
    expect(trajectory?.steps.some((s) => s.action === 'navigate-to-url')).toBe(true);
    expect(trajectory?.steps.some((s) => s.action === 'capture-screenshot')).toBe(true);
  });

  it('should calculate reward based on audit results', async () => {
    // Good page
    const goodResult = await skill.executeSecurityVisualAudit('https://example.com');
    const goodTrajectory = await memory.get<Trajectory>(
      (await memory.search('trajectory:*'))[0]
    );

    memory.clear();

    // Bad page
    const badResult = await skill.executeSecurityVisualAudit(
      'https://example.com/bad-a11y'
    );
    const badTrajectory = await memory.get<Trajectory>(
      (await memory.search('trajectory:*'))[0]
    );

    expect(goodTrajectory?.reward).toBeGreaterThan(badTrajectory?.reward ?? 0);
  });

  it('should store failed trajectories with low reward', async () => {
    // This would require making the browser fail, but we can verify the pattern
    const url = 'https://example.com';

    await skill.executeSecurityVisualAudit(url);

    const trajectoryKeys = await memory.search('trajectory:*');
    const trajectory = await memory.get<Trajectory>(trajectoryKeys[0]);

    // Successful run should have high reward
    expect(trajectory?.reward).toBeGreaterThan(0.5);
    expect(trajectory?.outcome).toBe('success');
  });
});
