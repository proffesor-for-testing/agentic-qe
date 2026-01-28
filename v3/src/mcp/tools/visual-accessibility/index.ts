/**
 * Agentic QE v3 - Visual & Accessibility MCP Tools
 *
 * qe/visual/compare - Visual regression testing
 * qe/a11y/audit - Accessibility auditing
 *
 * This module wraps the REAL visual-accessibility domain services:
 * - VisualTesterService for screenshot capture and comparison
 * - AccessibilityTesterService for WCAG compliance auditing
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend } from '../base';
import { ToolResult } from '../../types';
import { createVisualTesterService, VisualTesterService } from '../../../domains/visual-accessibility/services/visual-tester';
import { AccessibilityTesterService } from '../../../domains/visual-accessibility/services/accessibility-tester';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';

// ============================================================================
// Visual Compare Types
// ============================================================================

export interface VisualCompareParams {
  urls: string[];
  viewports?: Viewport[];
  baselineDir?: string;
  threshold?: number;
  fullPage?: boolean;
  hideSelectors?: string[];
  waitForSelector?: string;
  [key: string]: unknown;
}

export interface Viewport {
  width: number;
  height: number;
  name?: string;
  isMobile?: boolean;
}

export interface VisualCompareResult {
  comparisons: VisualComparison[];
  summary: VisualSummary;
  newBaselines: string[];
  recommendations: string[];
}

export interface VisualComparison {
  url: string;
  viewport: Viewport;
  status: 'passed' | 'failed' | 'new';
  diffPercentage: number;
  diffPixels: number;
  screenshotPath?: string;
  diffImagePath?: string;
  baselinePath?: string;
  regions?: DiffRegion[];
}

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  changeType: 'added' | 'removed' | 'modified';
  significance: 'high' | 'medium' | 'low';
}

export interface VisualSummary {
  total: number;
  passed: number;
  failed: number;
  new: number;
  avgDiffPercentage: number;
}

// ============================================================================
// Accessibility Audit Types
// ============================================================================

export interface A11yAuditParams {
  urls: string[];
  standard?: 'wcag21-aa' | 'wcag21-aaa' | 'wcag22-aa' | 'section508';
  includeWarnings?: boolean;
  checkContrast?: boolean;
  checkKeyboard?: boolean;
  rules?: string[];
  [key: string]: unknown;
}

export interface A11yAuditResult {
  audits: UrlAudit[];
  summary: A11ySummary;
  topIssues: TopIssue[];
  remediationPlan: RemediationItem[];
}

export interface UrlAudit {
  url: string;
  score: number;
  passed: boolean;
  violations: A11yViolation[];
  warnings: A11yWarning[];
  passedRules: number;
}

export interface A11yViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  wcagCriteria: string[];
  nodes: ViolationNode[];
}

export interface ViolationNode {
  selector: string;
  html: string;
  failureSummary: string;
  fixSuggestion?: string;
}

export interface A11yWarning {
  id: string;
  description: string;
  nodes: number;
}

export interface A11ySummary {
  totalUrls: number;
  passingUrls: number;
  avgScore: number;
  criticalViolations: number;
  seriousViolations: number;
  totalViolations: number;
}

export interface TopIssue {
  ruleId: string;
  description: string;
  occurrences: number;
  impact: string;
  affectedUrls: string[];
}

export interface RemediationItem {
  violationId: string;
  description: string;
  fix: string;
  effort: 'trivial' | 'minor' | 'moderate' | 'major';
  priority: number;
}

// ============================================================================
// Visual Compare Tool
// ============================================================================

export class VisualCompareTool extends MCPToolBase<VisualCompareParams, VisualCompareResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/visual/compare',
    description: 'Visual regression testing with screenshot comparison, diff detection, and baseline management.',
    domain: 'visual-accessibility',
    schema: VISUAL_COMPARE_SCHEMA,
    streaming: true,
    timeout: 300000,
  };

  private visualTester: VisualTesterService | null = null;

  /**
   * Get or create the visual tester service
   */
  private async getService(context: MCPToolContext): Promise<VisualTesterService> {
    if (!this.visualTester) {
      const memory = (context as any).memory as MemoryBackend | undefined;
      this.visualTester = createVisualTesterService(
        memory || await getSharedMemoryBackend()
      );
    }
    return this.visualTester;
  }

  async execute(
    params: VisualCompareParams,
    context: MCPToolContext
  ): Promise<ToolResult<VisualCompareResult>> {
    const {
      urls,
      viewports = [{ width: 1920, height: 1080, name: 'desktop' }],
      baselineDir = '.visual-baselines',
      threshold = 0.1,
      fullPage = true,
    } = params;

    try {
      this.emitStream(context, {
        status: 'capturing',
        message: `Capturing ${urls.length} URLs across ${viewports.length} viewports`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // Mark as real data - this tool always uses real services
      this.markAsRealData();

      const service = await this.getService(context);
      const comparisons: VisualComparison[] = [];
      const newBaselines: string[] = [];

      for (const url of urls) {
        for (const viewport of viewports) {
          this.emitStream(context, {
            status: 'comparing',
            message: `Comparing ${url} at ${viewport.width}x${viewport.height}`,
          });

          // Convert viewport format
          const domainViewport = {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            isMobile: viewport.isMobile || false,
            hasTouch: viewport.isMobile || false,
          };

          // Capture screenshot using real service
          const captureResult = await service.captureScreenshot(url, {
            viewport: domainViewport,
            fullPage,
          });

          if (!captureResult.success) {
            comparisons.push({
              url,
              viewport,
              status: 'failed',
              diffPercentage: 100,
              diffPixels: 0,
            });
            continue;
          }

          const screenshot = captureResult.value;

          // Check for existing baseline
          const existingBaseline = await service.getBaseline(url, domainViewport);

          if (!existingBaseline) {
            // No baseline exists - set this as the new baseline
            await service.setBaseline(screenshot);
            newBaselines.push(screenshot.path.value);

            comparisons.push({
              url,
              viewport,
              status: 'new',
              diffPercentage: 0,
              diffPixels: 0,
              screenshotPath: screenshot.path.value,
            });
          } else {
            // Compare against baseline using real service
            const diffResult = await service.compare(screenshot, existingBaseline.id);

            if (!diffResult.success) {
              comparisons.push({
                url,
                viewport,
                status: 'failed',
                diffPercentage: 100,
                diffPixels: 0,
              });
              continue;
            }

            const diff = diffResult.value;
            const passed = diff.diffPercentage <= threshold;

            comparisons.push({
              url,
              viewport,
              status: passed ? 'passed' : 'failed',
              diffPercentage: diff.diffPercentage,
              diffPixels: diff.diffPixels,
              screenshotPath: screenshot.path.value,
              baselinePath: existingBaseline.path.value,
              diffImagePath: diff.diffImagePath?.value,
              regions: diff.regions?.map((r) => ({
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                changeType: r.changeType,
                significance: r.significance,
              })),
            });
          }
        }
      }

      const summary: VisualSummary = {
        total: comparisons.length,
        passed: comparisons.filter((c) => c.status === 'passed').length,
        failed: comparisons.filter((c) => c.status === 'failed').length,
        new: comparisons.filter((c) => c.status === 'new').length,
        avgDiffPercentage:
          comparisons.length > 0
            ? comparisons.reduce((sum, c) => sum + c.diffPercentage, 0) / comparisons.length
            : 0,
      };

      this.emitStream(context, {
        status: 'complete',
        message: `Visual comparison complete: ${summary.passed}/${summary.total} passed`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          comparisons,
          summary,
          newBaselines,
          recommendations: generateVisualRecommendations(comparisons, summary),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Visual comparison failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Accessibility Audit Tool
// ============================================================================

export class A11yAuditTool extends MCPToolBase<A11yAuditParams, A11yAuditResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/a11y/audit',
    description: 'WCAG accessibility auditing with violation detection, contrast checking, and keyboard navigation testing.',
    domain: 'visual-accessibility',
    schema: A11Y_AUDIT_SCHEMA,
    streaming: true,
    timeout: 180000,
  };

  private accessibilityTester: AccessibilityTesterService | null = null;

  /**
   * Get or create the accessibility tester service
   */
  private async getService(context: MCPToolContext): Promise<AccessibilityTesterService> {
    if (!this.accessibilityTester) {
      const memory = (context as any).memory as MemoryBackend | undefined;
      this.accessibilityTester = new AccessibilityTesterService(
        memory || await getSharedMemoryBackend(),
        {
          enableColorContrastCheck: true,
          enableKeyboardCheck: true,
        }
      );
    }
    return this.accessibilityTester;
  }

  async execute(
    params: A11yAuditParams,
    context: MCPToolContext
  ): Promise<ToolResult<A11yAuditResult>> {
    const {
      urls,
      standard = 'wcag21-aa',
      includeWarnings = true,
      checkContrast = true,
      checkKeyboard = true,
    } = params;

    try {
      this.emitStream(context, {
        status: 'auditing',
        message: `Auditing ${urls.length} URLs against ${standard}`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // Mark as real data - this tool always uses real services
      this.markAsRealData();

      const service = await this.getService(context);
      const audits: UrlAudit[] = [];

      // Map standard to WCAG level
      const wcagLevel = standardToWcagLevel(standard);

      for (const url of urls) {
        this.emitStream(context, {
          status: 'scanning',
          message: `Scanning ${url}`,
        });

        // Use real accessibility audit service
        const auditResult = await service.audit(url, {
          wcagLevel,
          includeWarnings,
        });

        if (!auditResult.success) {
          // Add failed audit with error info
          audits.push({
            url,
            score: 0,
            passed: false,
            violations: [],
            warnings: [],
            passedRules: 0,
          });
          continue;
        }

        const report = auditResult.value;

        // Optionally check contrast
        let contrastViolations: A11yViolation[] = [];
        if (checkContrast) {
          const contrastResult = await service.checkContrast(url);
          if (contrastResult.success) {
            const failingContrast = contrastResult.value.filter((c) => !c.passes);
            if (failingContrast.length > 0) {
              contrastViolations = failingContrast.map((c) => ({
                id: 'color-contrast',
                impact: 'serious' as const,
                description: 'Elements must have sufficient color contrast',
                help: `Element ${c.element} has contrast ratio ${c.ratio}:1 but requires ${c.requiredRatio}:1`,
                helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum',
                wcagCriteria: ['1.4.3'],
                nodes: [
                  {
                    selector: c.element,
                    html: `<${c.element.replace('.', ' class="')}>...</${c.element.split('.')[0]}>`,
                    failureSummary: `Contrast ratio ${c.ratio}:1 is below required ${c.requiredRatio}:1`,
                    fixSuggestion: `Change foreground color to achieve at least ${c.requiredRatio}:1 contrast`,
                  },
                ],
              }));
            }
          }
        }

        // Optionally check keyboard navigation
        let keyboardViolations: A11yViolation[] = [];
        if (checkKeyboard) {
          const keyboardResult = await service.checkKeyboardNavigation(url);
          if (keyboardResult.success) {
            const kbReport = keyboardResult.value;

            // Convert keyboard issues to violations
            for (const issue of kbReport.issues) {
              keyboardViolations.push({
                id: issue.type,
                impact: issue.type === 'no-focus-indicator' ? 'serious' : 'moderate',
                description: issue.description,
                help: 'Ensure keyboard navigation is fully supported',
                helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible',
                wcagCriteria: ['2.4.7'],
                nodes: [
                  {
                    selector: issue.selector,
                    html: `<element>${issue.selector}</element>`,
                    failureSummary: issue.description,
                    fixSuggestion: 'Add visible focus styles with :focus or :focus-visible',
                  },
                ],
              });
            }

            // Add focus trap issues
            for (const trap of kbReport.traps) {
              keyboardViolations.push({
                id: 'keyboard-trap',
                impact: 'critical' as const,
                description: trap.description,
                help: trap.escapePath || 'No escape path available',
                helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap',
                wcagCriteria: ['2.1.2'],
                nodes: [
                  {
                    selector: trap.selector,
                    html: `<element>${trap.selector}</element>`,
                    failureSummary: trap.description,
                    fixSuggestion: trap.escapePath,
                  },
                ],
              });
            }
          }
        }

        // Convert report violations to output format
        const violations: A11yViolation[] = [
          ...report.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            wcagCriteria: v.wcagCriteria.map((c) => c.id),
            nodes: v.nodes.map((n) => ({
              selector: n.selector,
              html: n.html,
              failureSummary: n.failureSummary,
              fixSuggestion: n.fixSuggestion,
            })),
          })),
          ...contrastViolations,
          ...keyboardViolations,
        ];

        // Convert warnings (from incomplete checks)
        const warnings: A11yWarning[] = report.incomplete.map((i) => ({
          id: i.id,
          description: i.description,
          nodes: i.nodes.length,
        }));

        const hasCriticalOrSerious = violations.some(
          (v) => v.impact === 'critical' || v.impact === 'serious'
        );

        audits.push({
          url,
          score: report.score,
          passed: !hasCriticalOrSerious,
          violations,
          warnings,
          passedRules: report.passes.length,
        });
      }

      const summary: A11ySummary = {
        totalUrls: audits.length,
        passingUrls: audits.filter((a) => a.passed).length,
        avgScore: audits.length > 0
          ? Math.round(audits.reduce((sum, a) => sum + a.score, 0) / audits.length)
          : 0,
        criticalViolations: audits.reduce(
          (sum, a) => sum + a.violations.filter((v) => v.impact === 'critical').length,
          0
        ),
        seriousViolations: audits.reduce(
          (sum, a) => sum + a.violations.filter((v) => v.impact === 'serious').length,
          0
        ),
        totalViolations: audits.reduce((sum, a) => sum + a.violations.length, 0),
      };

      const topIssues = aggregateTopIssues(audits);
      const remediationPlan = generateRemediationPlan(topIssues);

      this.emitStream(context, {
        status: 'complete',
        message: `Audit complete: avg score ${summary.avgScore}%`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          audits,
          summary,
          topIssues,
          remediationPlan,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Accessibility audit failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Schemas
// ============================================================================

const VISUAL_COMPARE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    urls: {
      type: 'array',
      description: 'URLs to capture and compare',
      items: { type: 'string', description: 'URL' },
    },
    viewports: {
      type: 'array',
      description: 'Viewport configurations',
      items: {
        type: 'object',
        description: 'Viewport',
        properties: {
          width: { type: 'number', description: 'Width in pixels' },
          height: { type: 'number', description: 'Height in pixels' },
          name: { type: 'string', description: 'Viewport name' },
        },
      },
    },
    baselineDir: {
      type: 'string',
      description: 'Directory for baseline images',
      default: '.visual-baselines',
    },
    threshold: {
      type: 'number',
      description: 'Acceptable diff percentage (0-1)',
      minimum: 0,
      maximum: 1,
      default: 0.1,
    },
    fullPage: {
      type: 'boolean',
      description: 'Capture full page',
      default: true,
    },
    hideSelectors: {
      type: 'array',
      description: 'CSS selectors to hide before capture',
      items: { type: 'string', description: 'Selector' },
    },
    waitForSelector: {
      type: 'string',
      description: 'Wait for selector before capture',
    },
  },
  required: ['urls'],
};

const A11Y_AUDIT_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    urls: {
      type: 'array',
      description: 'URLs to audit',
      items: { type: 'string', description: 'URL' },
    },
    standard: {
      type: 'string',
      description: 'WCAG standard to validate against',
      enum: ['wcag21-aa', 'wcag21-aaa', 'wcag22-aa', 'section508'],
      default: 'wcag21-aa',
    },
    includeWarnings: {
      type: 'boolean',
      description: 'Include warnings in results',
      default: true,
    },
    checkContrast: {
      type: 'boolean',
      description: 'Check color contrast',
      default: true,
    },
    checkKeyboard: {
      type: 'boolean',
      description: 'Check keyboard navigation',
      default: true,
    },
    rules: {
      type: 'array',
      description: 'Specific rules to check',
      items: { type: 'string', description: 'Rule ID' },
    },
  },
  required: ['urls'],
};

// ============================================================================
// Helper Functions
// ============================================================================

function standardToWcagLevel(standard: string): 'A' | 'AA' | 'AAA' {
  switch (standard) {
    case 'wcag21-aaa':
      return 'AAA';
    case 'wcag21-aa':
    case 'wcag22-aa':
    case 'section508':
    default:
      return 'AA';
  }
}

function generateVisualRecommendations(comparisons: VisualComparison[], summary: VisualSummary): string[] {
  const recs: string[] = [];

  if (summary.failed > 0) {
    recs.push(`Review ${summary.failed} failed comparisons for intentional vs unintentional changes`);
  }
  if (summary.new > 0) {
    recs.push(`${summary.new} new baselines created - review and approve if correct`);
  }
  if (summary.avgDiffPercentage > 1) {
    recs.push('Consider increasing diff threshold or reviewing major changes');
  }

  return recs.length > 0 ? recs : ['All visual tests passed'];
}

function aggregateTopIssues(audits: UrlAudit[]): TopIssue[] {
  const issueMap = new Map<string, TopIssue>();

  for (const audit of audits) {
    for (const v of audit.violations) {
      const existing = issueMap.get(v.id);
      if (existing) {
        existing.occurrences++;
        if (!existing.affectedUrls.includes(audit.url)) {
          existing.affectedUrls.push(audit.url);
        }
      } else {
        issueMap.set(v.id, {
          ruleId: v.id,
          description: v.description,
          occurrences: 1,
          impact: v.impact,
          affectedUrls: [audit.url],
        });
      }
    }
  }

  return Array.from(issueMap.values()).sort((a, b) => b.occurrences - a.occurrences);
}

function generateRemediationPlan(topIssues: TopIssue[]): RemediationItem[] {
  return topIssues.map((issue, idx) => ({
    violationId: issue.ruleId,
    description: issue.description,
    fix: `Fix ${issue.ruleId} across ${issue.occurrences} occurrences`,
    effort: issue.occurrences > 10 ? 'moderate' : 'minor',
    priority: idx + 1,
  }));
}

