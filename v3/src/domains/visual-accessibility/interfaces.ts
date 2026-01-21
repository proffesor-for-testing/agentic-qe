/**
 * Agentic QE v3 - Visual & Accessibility Testing Domain Interfaces
 *
 * Bounded Context: Visual & Accessibility Testing
 * Responsibility: Visual regression, screenshot comparison, WCAG compliance
 */

import type { DomainEvent, Result } from '../../shared/types/index.js';
import type { FilePath } from '../../shared/value-objects/index.js';

// ============================================================================
// Value Objects
// ============================================================================

/**
 * Screenshot metadata and content
 */
export interface Screenshot {
  readonly id: string;
  readonly url: string;
  readonly viewport: Viewport;
  readonly timestamp: Date;
  readonly path: FilePath;
  readonly metadata: ScreenshotMetadata;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}

export interface ScreenshotMetadata {
  readonly browser: string;
  readonly os: string;
  readonly selector?: string;
  readonly fullPage: boolean;
  readonly loadTime: number;
}

/**
 * Visual difference between screenshots
 */
export interface VisualDiff {
  readonly baselineId: string;
  readonly comparisonId: string;
  readonly diffPercentage: number;
  readonly diffPixels: number;
  readonly diffImagePath?: FilePath;
  readonly regions: DiffRegion[];
  readonly status: DiffStatus;
}

export interface DiffRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly changeType: 'added' | 'removed' | 'modified';
  readonly significance: 'high' | 'medium' | 'low';
}

export type DiffStatus = 'identical' | 'acceptable' | 'changed' | 'failed';

/**
 * Accessibility violation
 */
export interface AccessibilityViolation {
  readonly id: string;
  readonly impact: 'critical' | 'serious' | 'moderate' | 'minor';
  readonly wcagCriteria: WCAGCriterion[];
  readonly description: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly nodes: ViolationNode[];
}

export interface WCAGCriterion {
  readonly id: string;
  readonly level: 'A' | 'AA' | 'AAA';
  readonly title: string;
}

export interface ViolationNode {
  readonly selector: string;
  readonly html: string;
  readonly target: string[];
  readonly failureSummary: string;
  readonly fixSuggestion?: string;
}

/**
 * Color contrast analysis
 */
export interface ContrastAnalysis {
  readonly element: string;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly requiredRatio: number;
  readonly passes: boolean;
  readonly wcagLevel: 'A' | 'AA' | 'AAA';
}

// ============================================================================
// Domain Events
// ============================================================================

export interface VisualRegressionDetectedEvent extends DomainEvent {
  readonly type: 'VisualRegressionDetectedEvent';
  readonly testId: string;
  readonly url: string;
  readonly diffPercentage: number;
  readonly diffImagePath: string;
}

export interface AccessibilityAuditCompletedEvent extends DomainEvent {
  readonly type: 'AccessibilityAuditCompletedEvent';
  readonly auditId: string;
  readonly url: string;
  readonly violations: AccessibilityViolation[];
  readonly passedRules: number;
  readonly score: number;
}

export interface BaselineUpdatedEvent extends DomainEvent {
  readonly type: 'BaselineUpdatedEvent';
  readonly screenshotId: string;
  readonly url: string;
  readonly viewport: Viewport;
  readonly reason: string;
}

export interface ContrastFailureEvent extends DomainEvent {
  readonly type: 'ContrastFailureEvent';
  readonly element: string;
  readonly ratio: number;
  readonly requiredRatio: number;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Visual Testing Service
 * Captures and compares screenshots
 */
export interface IVisualTestingService {
  /**
   * Capture screenshot of URL
   */
  captureScreenshot(url: string, options?: CaptureOptions): Promise<Result<Screenshot>>;

  /**
   * Capture screenshot of specific element
   */
  captureElement(url: string, selector: string, options?: CaptureOptions): Promise<Result<Screenshot>>;

  /**
   * Compare screenshot against baseline
   */
  compare(screenshot: Screenshot, baselineId: string): Promise<Result<VisualDiff>>;

  /**
   * Set screenshot as new baseline
   */
  setBaseline(screenshot: Screenshot): Promise<Result<string>>;

  /**
   * Get baseline for URL and viewport
   */
  getBaseline(url: string, viewport: Viewport): Promise<Screenshot | null>;
}

export interface CaptureOptions {
  readonly viewport?: Viewport;
  readonly fullPage?: boolean;
  readonly waitForSelector?: string;
  readonly waitForTimeout?: number;
  readonly hideSelectors?: string[];
  readonly maskSelectors?: string[];
}

/**
 * Accessibility Auditing Service
 * WCAG compliance checking
 */
export interface IAccessibilityAuditingService {
  /**
   * Run full accessibility audit
   */
  audit(url: string, options?: AuditOptions): Promise<Result<AccessibilityReport>>;

  /**
   * Audit specific element
   */
  auditElement(url: string, selector: string): Promise<Result<AccessibilityReport>>;

  /**
   * Check color contrast
   */
  checkContrast(url: string): Promise<Result<ContrastAnalysis[]>>;

  /**
   * Validate against specific WCAG level
   */
  validateWCAGLevel(url: string, level: 'A' | 'AA' | 'AAA'): Promise<Result<WCAGValidationResult>>;

  /**
   * Check keyboard navigation
   */
  checkKeyboardNavigation(url: string): Promise<Result<KeyboardNavigationReport>>;
}

export interface AuditOptions {
  readonly wcagLevel?: 'A' | 'AA' | 'AAA';
  readonly includeWarnings?: boolean;
  readonly rules?: string[];
  readonly excludeSelectors?: string[];
}

export interface AccessibilityReport {
  readonly url: string;
  readonly timestamp: Date;
  readonly violations: AccessibilityViolation[];
  readonly passes: PassedRule[];
  readonly incomplete: IncompleteCheck[];
  readonly score: number;
  readonly wcagLevel: 'A' | 'AA' | 'AAA';
}

export interface PassedRule {
  readonly id: string;
  readonly description: string;
  readonly nodes: number;
}

export interface IncompleteCheck {
  readonly id: string;
  readonly description: string;
  readonly reason: string;
  readonly nodes: ViolationNode[];
}

export interface WCAGValidationResult {
  readonly level: 'A' | 'AA' | 'AAA';
  readonly passed: boolean;
  readonly failedCriteria: WCAGCriterion[];
  readonly passedCriteria: WCAGCriterion[];
  readonly score: number;
}

export interface KeyboardNavigationReport {
  readonly url: string;
  readonly focusableElements: number;
  readonly tabOrder: TabOrderItem[];
  readonly issues: KeyboardIssue[];
  readonly traps: FocusTrap[];
}

export interface TabOrderItem {
  readonly index: number;
  readonly selector: string;
  readonly elementType: string;
  readonly hasVisibleFocus: boolean;
}

export interface KeyboardIssue {
  readonly type: 'no-focus-indicator' | 'skip-link-missing' | 'incorrect-tab-order' | 'non-interactive-focusable';
  readonly selector: string;
  readonly description: string;
}

export interface FocusTrap {
  readonly selector: string;
  readonly description: string;
  readonly escapePath?: string;
}

/**
 * Screenshot Diff Service
 * Advanced image comparison
 */
export interface IScreenshotDiffService {
  /**
   * Calculate visual difference
   */
  calculateDiff(baseline: Screenshot, comparison: Screenshot): Promise<Result<VisualDiff>>;

  /**
   * Generate diff image
   */
  generateDiffImage(diff: VisualDiff): Promise<Result<FilePath>>;

  /**
   * Detect significant regions
   */
  detectSignificantRegions(diff: VisualDiff): Promise<Result<DiffRegion[]>>;

  /**
   * Apply AI-based comparison
   */
  aiCompare(baseline: Screenshot, comparison: Screenshot): Promise<Result<AIComparisonResult>>;
}

export interface AIComparisonResult {
  readonly isSignificantChange: boolean;
  readonly confidence: number;
  readonly changeDescription: string;
  readonly detectedChanges: DetectedChange[];
}

export interface DetectedChange {
  readonly type: 'text' | 'layout' | 'color' | 'image' | 'element';
  readonly description: string;
  readonly region: DiffRegion;
  readonly severity: 'breaking' | 'visual' | 'minor';
}

// ============================================================================
// Repository Interfaces
// ============================================================================

export interface IScreenshotRepository {
  findById(id: string): Promise<Screenshot | null>;
  findByUrl(url: string): Promise<Screenshot[]>;
  findBaseline(url: string, viewport: Viewport): Promise<Screenshot | null>;
  save(screenshot: Screenshot): Promise<void>;
  setAsBaseline(id: string): Promise<void>;
}

export interface IVisualDiffRepository {
  findById(id: string): Promise<VisualDiff | null>;
  findByBaselineId(baselineId: string): Promise<VisualDiff[]>;
  findFailed(since: Date): Promise<VisualDiff[]>;
  save(diff: VisualDiff): Promise<void>;
}

export interface IAccessibilityReportRepository {
  findLatest(url: string): Promise<AccessibilityReport | null>;
  findByDateRange(url: string, startDate: Date, endDate: Date): Promise<AccessibilityReport[]>;
  save(report: AccessibilityReport): Promise<void>;
}

// ============================================================================
// Coordinator Interface
// ============================================================================

/**
 * Visual test item for prioritization
 */
export interface VisualTestItem {
  readonly url: string;
  readonly viewport: Viewport;
  readonly priority?: number;
}

/**
 * Context for visual test prioritization
 */
export interface VisualTestPrioritizationContext {
  readonly urgency: number;
  readonly availableResources: number;
  readonly historicalFailureRate: number;
}

/**
 * Prioritized visual test with reasoning
 */
export interface PrioritizedVisualTest {
  readonly url: string;
  readonly viewport: Viewport;
  readonly priority: number;
  readonly reason: string;
}

/**
 * Result of visual test prioritization
 */
export interface VisualTestPrioritizationResult {
  readonly orderedTests: PrioritizedVisualTest[];
  readonly strategy: string;
  readonly confidence: number;
}

export interface IVisualAccessibilityCoordinator {
  /**
   * Run visual regression test suite
   */
  runVisualTests(urls: string[], viewports: Viewport[]): Promise<Result<VisualTestReport>>;

  /**
   * Run accessibility audit suite
   */
  runAccessibilityAudit(urls: string[], level: 'A' | 'AA' | 'AAA'): Promise<Result<AccessibilityAuditReport>>;

  /**
   * Update baselines for approved changes
   */
  approveVisualChanges(diffIds: string[], reason: string): Promise<Result<void>>;

  /**
   * Generate remediation plan for violations
   */
  generateRemediationPlan(violations: AccessibilityViolation[]): Promise<Result<RemediationPlan>>;

  /**
   * Get visual testing status
   */
  getVisualTestingStatus(): Promise<Result<VisualTestingStatus>>;

  /**
   * Prioritize visual tests using A2C RL
   * Uses multi-worker actor-critic to determine optimal test order
   */
  prioritizeVisualTests(
    tests: VisualTestItem[],
    context: VisualTestPrioritizationContext
  ): Promise<Result<VisualTestPrioritizationResult>>;
}

export interface VisualTestReport {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly newBaselines: number;
  readonly results: VisualTestResult[];
  readonly duration: number;
}

export interface VisualTestResult {
  readonly url: string;
  readonly viewport: Viewport;
  readonly status: 'passed' | 'failed' | 'new';
  readonly diff?: VisualDiff;
  readonly screenshot: Screenshot;
}

export interface AccessibilityAuditReport {
  readonly totalUrls: number;
  readonly passingUrls: number;
  readonly totalViolations: number;
  readonly criticalViolations: number;
  readonly averageScore: number;
  readonly reports: AccessibilityReport[];
  readonly topIssues: TopAccessibilityIssue[];
}

export interface TopAccessibilityIssue {
  readonly ruleId: string;
  readonly description: string;
  readonly occurrences: number;
  readonly impact: AccessibilityViolation['impact'];
  readonly affectedUrls: string[];
}

export interface RemediationPlan {
  readonly violations: ViolationRemediation[];
  readonly totalEffort: 'trivial' | 'minor' | 'moderate' | 'major';
  readonly prioritizedOrder: string[];
}

export interface ViolationRemediation {
  readonly violationId: string;
  readonly description: string;
  readonly fix: string;
  readonly codeExample?: string;
  readonly effort: 'trivial' | 'minor' | 'moderate' | 'major';
  readonly wcagReference: string;
}

export interface VisualTestingStatus {
  readonly baselineCount: number;
  readonly pendingReviews: number;
  readonly lastTestRun: Date;
  readonly failureRate: number;
  readonly coverageByViewport: Map<string, number>;
}
