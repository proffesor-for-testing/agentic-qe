/**
 * Agentic QE v3 - Axe-Core Accessibility Audit
 *
 * Lightweight implementation using vibium + axe-core for accessibility testing.
 * Vibium provides browser automation via WebDriver BiDi (~202KB),
 * axe-core provides accessibility rules (~3MB).
 *
 * Features:
 * - WCAG 2.0/2.1/2.2 compliance testing
 * - Section 508 compliance
 * - Best practices validation
 * - Custom rule configuration
 *
 * @module visual-accessibility/axe-core-audit
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';

// ============================================================================
// Types
// ============================================================================

/**
 * WCAG conformance levels
 */
export type WCAGLevel = 'A' | 'AA' | 'AAA';

/**
 * WCAG versions
 */
export type WCAGVersion = '2.0' | '2.1' | '2.2';

/**
 * Accessibility issue impact levels
 */
export type A11yImpact = 'critical' | 'serious' | 'moderate' | 'minor';

/**
 * Accessibility violation
 */
export interface A11yViolation {
  /** Unique rule ID */
  id: string;
  /** Human-readable description */
  description: string;
  /** Detailed help text */
  help: string;
  /** URL to learn more */
  helpUrl: string;
  /** Impact level */
  impact: A11yImpact;
  /** WCAG tags (e.g., 'wcag2a', 'wcag21aa') */
  tags: string[];
  /** Affected elements */
  nodes: A11yNode[];
}

/**
 * DOM node with accessibility issue
 */
export interface A11yNode {
  /** HTML snippet */
  html: string;
  /** CSS selector path to element */
  target: string[];
  /** XPath to element */
  xpath?: string[];
  /** Failure summary */
  failureSummary: string;
  /** Impact level for this specific node */
  impact: A11yImpact;
  /** Specific check failures */
  any?: A11yCheck[];
  /** All checks that must pass */
  all?: A11yCheck[];
  /** None checks (must all fail) */
  none?: A11yCheck[];
}

/**
 * Individual accessibility check result
 */
export interface A11yCheck {
  /** Check ID */
  id: string;
  /** Check result data */
  data?: unknown;
  /** Related nodes */
  relatedNodes?: Array<{ html: string; target: string[] }>;
  /** Impact if failed */
  impact?: A11yImpact;
  /** Human-readable message */
  message: string;
}

/**
 * Accessibility audit configuration
 */
export interface A11yAuditConfig {
  /** URL to audit */
  url: string;
  /** WCAG conformance level to test against */
  wcagLevel: WCAGLevel;
  /** WCAG version */
  wcagVersion: WCAGVersion;
  /** Include best practices checks */
  includeBestPractices: boolean;
  /** Include experimental rules */
  includeExperimental: boolean;
  /** CSS selector to scope the audit */
  context?: string;
  /** Rules to exclude */
  excludeRules?: string[];
  /** Additional rule tags to include */
  includeTags?: string[];
  /** Timeout for page load in ms */
  timeout?: number;
  /** Wait for selector before auditing */
  waitForSelector?: string;
}

/**
 * Accessibility audit result
 */
export interface A11yAuditResult {
  /** URL that was audited */
  url: string;
  /** Timestamp of the audit */
  timestamp: Date;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the audit completed successfully */
  success: boolean;
  /** All violations found */
  violations: A11yViolation[];
  /** Passing checks */
  passes: number;
  /** Incomplete checks (need manual review) */
  incomplete: A11yViolation[];
  /** Rules that don't apply */
  inapplicable: number;
  /** Summary statistics */
  summary: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
    passed: number;
  };
  /** WCAG compliance status */
  wcagCompliance: {
    level: WCAGLevel;
    version: WCAGVersion;
    compliant: boolean;
    violationsBlockingCompliance: number;
  };
  /** Tool information */
  toolInfo: {
    axeCoreAvailable: boolean;
    vibiumAvailable: boolean;
    version?: string;
  };
  /** Error messages if any */
  errors?: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Omit<A11yAuditConfig, 'url'> = {
  wcagLevel: 'AA',
  wcagVersion: '2.1',
  includeBestPractices: true,
  includeExperimental: false,
  timeout: 30000,
};

// ============================================================================
// Axe-Core Source Loader
// ============================================================================

let axeCoreSource: string | null = null;

/**
 * Load axe-core source code for injection
 */
function loadAxeCoreSource(): string {
  if (axeCoreSource) {
    return axeCoreSource;
  }

  try {
    // Use createRequire for ESM compatibility
    const require = createRequire(import.meta.url);
    const axeCorePath = require.resolve('axe-core');
    axeCoreSource = readFileSync(axeCorePath, 'utf-8');
    return axeCoreSource;
  } catch {
    throw new Error('axe-core not installed. Run: npm install axe-core');
  }
}

// ============================================================================
// Accessibility Auditor
// ============================================================================

/**
 * Accessibility auditor using vibium + axe-core
 *
 * Vibium provides lightweight browser automation via WebDriver BiDi.
 * Axe-core is injected directly into the page for accessibility testing.
 */
export class AccessibilityAuditor {
  private config: A11yAuditConfig;
  private toolsAvailable: { axeCore: boolean; vibium: boolean } = {
    axeCore: false,
    vibium: false,
  };

  constructor(config: Partial<A11yAuditConfig> & { url: string }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Check if required tools are available
   */
  async checkToolAvailability(): Promise<void> {
    // Check for axe-core
    try {
      loadAxeCoreSource();
      this.toolsAvailable.axeCore = true;
    } catch {
      this.toolsAvailable.axeCore = false;
    }

    // Check for vibium
    try {
      await import('vibium');
      this.toolsAvailable.vibium = true;
    } catch {
      this.toolsAvailable.vibium = false;
    }
  }

  /**
   * Run accessibility audit
   */
  async audit(): Promise<A11yAuditResult> {
    const startTime = Date.now();
    await this.checkToolAvailability();

    if (!this.toolsAvailable.axeCore || !this.toolsAvailable.vibium) {
      return this.createFallbackResult(startTime);
    }

    try {
      return await this.runAxeCoreAudit(startTime);
    } catch (error) {
      return {
        url: this.config.url,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        success: false,
        violations: [],
        passes: 0,
        incomplete: [],
        inapplicable: 0,
        summary: {
          critical: 0,
          serious: 0,
          moderate: 0,
          minor: 0,
          total: 0,
          passed: 0,
        },
        wcagCompliance: {
          level: this.config.wcagLevel,
          version: this.config.wcagVersion,
          compliant: false,
          violationsBlockingCompliance: 0,
        },
        toolInfo: {
          axeCoreAvailable: this.toolsAvailable.axeCore,
          vibiumAvailable: this.toolsAvailable.vibium,
        },
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Run actual axe-core audit using vibium
   */
  private async runAxeCoreAudit(startTime: number): Promise<A11yAuditResult> {
    const { browser } = await import('vibium');

    let vibe: Awaited<ReturnType<typeof browser.launch>> | null = null;
    try {
      // Launch browser
      vibe = await browser.launch();

      // Navigate to URL
      await vibe.go(this.config.url);

      // Wait for selector if configured
      if (this.config.waitForSelector) {
        await vibe.find(this.config.waitForSelector, {
          timeout: this.config.timeout,
        });
      }

      // Inject axe-core library
      const axeSource = loadAxeCoreSource();
      await vibe.evaluate(axeSource);

      // Build axe configuration
      const axeConfig = this.buildAxeConfig();

      // Run axe-core audit
      const axeScript = `
        return axe.run(${this.config.context ? `'${this.config.context}'` : 'document'}, ${JSON.stringify(axeConfig)});
      `;
      const results = await vibe.evaluate<AxeResults>(axeScript);

      // Convert results
      const violations = this.convertViolations(results.violations);
      const incomplete = this.convertViolations(results.incomplete);

      // Calculate summary
      const summary = this.calculateSummary(violations);
      summary.passed = results.passes?.length || 0;

      // Check WCAG compliance
      const wcagCompliance = this.checkWCAGCompliance(violations);

      return {
        url: this.config.url,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        success: true,
        violations,
        passes: results.passes?.length || 0,
        incomplete,
        inapplicable: results.inapplicable?.length || 0,
        summary,
        wcagCompliance,
        toolInfo: {
          axeCoreAvailable: true,
          vibiumAvailable: true,
          version: results.testEngine?.version,
        },
      };
    } finally {
      if (vibe) {
        await vibe.quit();
      }
    }
  }

  /**
   * Build axe-core configuration based on audit config
   */
  private buildAxeConfig(): AxeRunOptions {
    const runOnly: { type: 'tag'; values: string[] } = {
      type: 'tag',
      values: this.getWCAGTags(),
    };

    const rules: Record<string, { enabled: boolean }> = {};
    if (this.config.excludeRules?.length) {
      for (const rule of this.config.excludeRules) {
        rules[rule] = { enabled: false };
      }
    }

    return {
      runOnly,
      rules: Object.keys(rules).length > 0 ? rules : undefined,
    };
  }

  /**
   * Create fallback result when tools are not available
   */
  private createFallbackResult(startTime: number): A11yAuditResult {
    const errors: string[] = [];

    if (!this.toolsAvailable.vibium) {
      errors.push('vibium is not installed. Install with: npm install vibium');
    }
    if (!this.toolsAvailable.axeCore) {
      errors.push('axe-core is not installed. Install with: npm install axe-core');
    }

    return {
      url: this.config.url,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
      success: false,
      violations: [],
      passes: 0,
      incomplete: [],
      inapplicable: 0,
      summary: {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        total: 0,
        passed: 0,
      },
      wcagCompliance: {
        level: this.config.wcagLevel,
        version: this.config.wcagVersion,
        compliant: false,
        violationsBlockingCompliance: 0,
      },
      toolInfo: {
        axeCoreAvailable: this.toolsAvailable.axeCore,
        vibiumAvailable: this.toolsAvailable.vibium,
      },
      errors,
    };
  }

  /**
   * Get WCAG tags based on configuration
   */
  private getWCAGTags(): string[] {
    const tags: string[] = [];

    // Base WCAG version tags
    const versionTag = `wcag${this.config.wcagVersion.replace('.', '')}`;

    // Level tags
    switch (this.config.wcagLevel) {
      case 'AAA':
        tags.push(`${versionTag}aaa`, `${versionTag}aa`, `${versionTag}a`);
        break;
      case 'AA':
        tags.push(`${versionTag}aa`, `${versionTag}a`);
        break;
      case 'A':
        tags.push(`${versionTag}a`);
        break;
    }

    // Add WCAG 2.0 as baseline
    if (this.config.wcagVersion !== '2.0') {
      tags.push('wcag2a', 'wcag2aa');
    }

    // Best practices
    if (this.config.includeBestPractices) {
      tags.push('best-practice');
    }

    // Experimental
    if (this.config.includeExperimental) {
      tags.push('experimental');
    }

    // Additional tags
    if (this.config.includeTags?.length) {
      tags.push(...this.config.includeTags);
    }

    return tags;
  }

  /**
   * Convert axe-core violations to our format
   */
  private convertViolations(axeViolations: AxeViolation[]): A11yViolation[] {
    return (axeViolations || []).map((v) => ({
      id: v.id,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      impact: v.impact as A11yImpact,
      tags: v.tags || [],
      nodes: (v.nodes || []).map((n) => ({
        html: n.html,
        target: n.target as string[],
        xpath: n.xpath as string[] | undefined,
        failureSummary: n.failureSummary || '',
        impact: (n.impact || v.impact) as A11yImpact,
        any: n.any,
        all: n.all,
        none: n.none,
      })),
    }));
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(violations: A11yViolation[]): A11yAuditResult['summary'] {
    const summary = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      total: 0,
      passed: 0,
    };

    for (const v of violations) {
      summary.total++;
      switch (v.impact) {
        case 'critical':
          summary.critical++;
          break;
        case 'serious':
          summary.serious++;
          break;
        case 'moderate':
          summary.moderate++;
          break;
        case 'minor':
          summary.minor++;
          break;
      }
    }

    return summary;
  }

  /**
   * Check WCAG compliance based on violations
   */
  private checkWCAGCompliance(violations: A11yViolation[]): A11yAuditResult['wcagCompliance'] {
    // Count violations that block compliance
    const blockingViolations = violations.filter((v) =>
      v.tags.some((t) => t.includes('wcag'))
    );

    return {
      level: this.config.wcagLevel,
      version: this.config.wcagVersion,
      compliant: blockingViolations.length === 0,
      violationsBlockingCompliance: blockingViolations.length,
    };
  }
}

// ============================================================================
// Axe-Core Types (minimal subset)
// ============================================================================

interface AxeRunOptions {
  runOnly?: { type: 'tag'; values: string[] };
  rules?: Record<string, { enabled: boolean }>;
}

interface AxeResults {
  violations: AxeViolation[];
  passes: AxeViolation[];
  incomplete: AxeViolation[];
  inapplicable: AxeViolation[];
  testEngine?: { version: string };
}

interface AxeViolation {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  impact: string;
  tags: string[];
  nodes: AxeNode[];
}

interface AxeNode {
  html: string;
  target: unknown[];
  xpath?: unknown[];
  failureSummary?: string;
  impact?: string;
  any?: A11yCheck[];
  all?: A11yCheck[];
  none?: A11yCheck[];
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an accessibility auditor
 */
export function createAccessibilityAuditor(
  config: Partial<A11yAuditConfig> & { url: string }
): AccessibilityAuditor {
  return new AccessibilityAuditor(config);
}

/**
 * Quick accessibility audit with default settings
 */
export async function quickA11yAudit(url: string): Promise<A11yAuditResult> {
  const auditor = new AccessibilityAuditor({ url });
  return auditor.audit();
}

/**
 * Run WCAG 2.1 AA compliance check (most common standard)
 */
export async function checkWCAG21AA(url: string): Promise<A11yAuditResult> {
  const auditor = new AccessibilityAuditor({
    url,
    wcagLevel: 'AA',
    wcagVersion: '2.1',
    includeBestPractices: false,
  });
  return auditor.audit();
}

/**
 * Run comprehensive accessibility audit (all levels)
 */
export async function fullA11yAudit(url: string): Promise<A11yAuditResult> {
  const auditor = new AccessibilityAuditor({
    url,
    wcagLevel: 'AAA',
    wcagVersion: '2.2',
    includeBestPractices: true,
    includeExperimental: true,
  });
  return auditor.audit();
}

/**
 * Generate accessibility report in markdown format
 */
export function generateA11yReport(result: A11yAuditResult): string {
  const lines: string[] = [];

  lines.push(`# Accessibility Audit Report`);
  lines.push('');
  lines.push(`**URL:** ${result.url}`);
  lines.push(`**Date:** ${result.timestamp.toISOString()}`);
  lines.push(`**Duration:** ${result.durationMs}ms`);
  lines.push(`**Tools:** vibium + axe-core${result.toolInfo.version ? ` v${result.toolInfo.version}` : ''}`);
  lines.push('');

  // Compliance status
  lines.push('## WCAG Compliance');
  lines.push('');
  const complianceStatus = result.wcagCompliance.compliant ? 'COMPLIANT' : 'NON-COMPLIANT';
  lines.push(`**WCAG ${result.wcagCompliance.version} Level ${result.wcagCompliance.level}:** ${complianceStatus}`);
  if (!result.wcagCompliance.compliant) {
    lines.push(`**Blocking Violations:** ${result.wcagCompliance.violationsBlockingCompliance}`);
  }
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| Critical | ${result.summary.critical} |`);
  lines.push(`| Serious | ${result.summary.serious} |`);
  lines.push(`| Moderate | ${result.summary.moderate} |`);
  lines.push(`| Minor | ${result.summary.minor} |`);
  lines.push(`| **Total** | **${result.summary.total}** |`);
  lines.push(`| Passed | ${result.summary.passed} |`);
  lines.push('');

  // Violations
  if (result.violations.length > 0) {
    lines.push('## Violations');
    lines.push('');

    for (const v of result.violations) {
      lines.push(`### ${v.id}`);
      lines.push('');
      lines.push(`**Impact:** ${v.impact}`);
      lines.push(`**Description:** ${v.description}`);
      lines.push(`**Help:** ${v.help}`);
      lines.push(`**More Info:** [${v.helpUrl}](${v.helpUrl})`);
      lines.push('');

      lines.push('**Affected Elements:**');
      for (const node of v.nodes.slice(0, 5)) {
        lines.push(`- \`${node.target.join(' > ')}\``);
        lines.push(`  - ${node.failureSummary}`);
      }
      if (v.nodes.length > 5) {
        lines.push(`  - ... and ${v.nodes.length - 5} more`);
      }
      lines.push('');
    }
  }

  // Tool info
  if (result.errors?.length) {
    lines.push('## Errors');
    lines.push('');
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
