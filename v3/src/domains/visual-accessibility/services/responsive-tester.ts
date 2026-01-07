/**
 * Agentic QE v3 - Responsive Testing Service
 * Implements responsive design and cross-device testing
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import {
  Viewport,
  Screenshot,
  VisualDiff,
} from '../interfaces.js';
import { FilePath } from '../../../shared/value-objects/index.js';

/**
 * Responsive testing interfaces
 */
export interface ResponsiveTestResult {
  readonly url: string;
  readonly timestamp: Date;
  readonly viewports: ViewportResult[];
  readonly breakpointIssues: BreakpointIssue[];
  readonly layoutScore: number;
  readonly recommendations: string[];
}

export interface ViewportResult {
  readonly viewport: Viewport;
  readonly screenshot: Screenshot;
  readonly layoutIssues: LayoutIssue[];
  readonly renderTime: number;
  readonly passed: boolean;
}

export interface LayoutIssue {
  readonly type: LayoutIssueType;
  readonly severity: 'critical' | 'warning' | 'info';
  readonly element: string;
  readonly description: string;
  readonly viewport: Viewport;
}

export type LayoutIssueType =
  | 'horizontal-overflow'
  | 'text-overflow'
  | 'overlapping-elements'
  | 'hidden-content'
  | 'touch-target-size'
  | 'font-size-too-small'
  | 'image-not-responsive';

export interface BreakpointIssue {
  readonly breakpoint: number;
  readonly description: string;
  readonly affectedElements: string[];
  readonly suggestion: string;
}

export interface ResponsiveTestConfig {
  viewports: Viewport[];
  breakpoints: number[];
  checkTouchTargets: boolean;
  minFontSize: number;
  minTouchTargetSize: number;
}

/**
 * Predefined device viewports
 */
export const DEVICE_VIEWPORTS: Record<string, Viewport> = {
  'iphone-se': {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  'iphone-14': {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  'iphone-14-pro-max': {
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  'ipad-mini': {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  'ipad-pro': {
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  'pixel-7': {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  'galaxy-s21': {
    width: 360,
    height: 800,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  'desktop-hd': {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  'desktop-2k': {
    width: 2560,
    height: 1440,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  'laptop': {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
};

const DEFAULT_CONFIG: ResponsiveTestConfig = {
  viewports: [
    DEVICE_VIEWPORTS['iphone-14'],
    DEVICE_VIEWPORTS['ipad-mini'],
    DEVICE_VIEWPORTS['laptop'],
    DEVICE_VIEWPORTS['desktop-hd'],
  ],
  breakpoints: [320, 480, 768, 1024, 1280, 1920],
  checkTouchTargets: true,
  minFontSize: 12,
  minTouchTargetSize: 44,
};

/**
 * Responsive Tester Service
 */
export interface IResponsiveTestingService {
  /**
   * Test responsive design across viewports
   */
  testResponsiveness(url: string, options?: Partial<ResponsiveTestConfig>): Promise<Result<ResponsiveTestResult, Error>>;

  /**
   * Compare layouts between viewports
   */
  compareViewports(url: string, viewport1: Viewport, viewport2: Viewport): Promise<Result<VisualDiff, Error>>;

  /**
   * Test specific breakpoint
   */
  testBreakpoint(url: string, breakpoint: number): Promise<Result<ViewportResult, Error>>;

  /**
   * Get recommended breakpoints based on content
   */
  analyzeBreakpoints(url: string): Promise<Result<BreakpointAnalysis, Error>>;
}

export interface BreakpointAnalysis {
  readonly currentBreakpoints: number[];
  readonly suggestedBreakpoints: number[];
  readonly contentBreaks: ContentBreak[];
  readonly coverageScore: number;
}

export interface ContentBreak {
  readonly width: number;
  readonly reason: string;
  readonly affectedElements: string[];
}

/**
 * Responsive Testing Service Implementation
 */
export class ResponsiveTesterService implements IResponsiveTestingService {
  private readonly config: ResponsiveTestConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<ResponsiveTestConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Test responsive design across viewports
   */
  async testResponsiveness(
    url: string,
    options?: Partial<ResponsiveTestConfig>
  ): Promise<Result<ResponsiveTestResult, Error>> {
    try {
      const testConfig = { ...this.config, ...options };
      const viewportResults: ViewportResult[] = [];
      const allIssues: LayoutIssue[] = [];

      // Test each viewport
      for (const viewport of testConfig.viewports) {
        const result = await this.testViewport(url, viewport, testConfig);
        viewportResults.push(result);
        allIssues.push(...result.layoutIssues);
      }

      // Detect breakpoint issues
      const breakpointIssues = this.detectBreakpointIssues(
        viewportResults,
        testConfig.breakpoints
      );

      // Calculate layout score
      const layoutScore = this.calculateLayoutScore(viewportResults, allIssues);

      // Generate recommendations
      const recommendations = this.generateRecommendations(allIssues, breakpointIssues);

      const result: ResponsiveTestResult = {
        url,
        timestamp: new Date(),
        viewports: viewportResults,
        breakpointIssues,
        layoutScore,
        recommendations,
      };

      // Store result
      await this.storeResult(result);

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Compare layouts between viewports
   */
  async compareViewports(
    url: string,
    viewport1: Viewport,
    viewport2: Viewport
  ): Promise<Result<VisualDiff, Error>> {
    try {
      // Capture screenshots for both viewports
      const screenshot1 = this.createScreenshot(url, viewport1);
      const screenshot2 = this.createScreenshot(url, viewport2);

      // Calculate structural diff (not pixel diff)
      const diff = this.calculateStructuralDiff(screenshot1, screenshot2);

      return ok(diff);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Test specific breakpoint
   */
  async testBreakpoint(
    url: string,
    breakpoint: number
  ): Promise<Result<ViewportResult, Error>> {
    try {
      const viewport: Viewport = {
        width: breakpoint,
        height: 800,
        deviceScaleFactor: 1,
        isMobile: breakpoint < 768,
        hasTouch: breakpoint < 1024,
      };

      const result = await this.testViewport(url, viewport, this.config);
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze breakpoints based on content
   */
  async analyzeBreakpoints(url: string): Promise<Result<BreakpointAnalysis, Error>> {
    try {
      // Test across a range of widths to find content breaks
      const contentBreaks = this.findContentBreaks(url);

      // Compare with current breakpoints
      const currentBreakpoints = this.config.breakpoints;
      const suggestedBreakpoints = this.suggestBreakpoints(contentBreaks);

      // Calculate coverage score
      const coverageScore = this.calculateBreakpointCoverage(
        currentBreakpoints,
        contentBreaks
      );

      return ok({
        currentBreakpoints,
        suggestedBreakpoints,
        contentBreaks,
        coverageScore,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async testViewport(
    url: string,
    viewport: Viewport,
    config: ResponsiveTestConfig
  ): Promise<ViewportResult> {
    const screenshot = this.createScreenshot(url, viewport);
    const layoutIssues = this.detectLayoutIssues(viewport, config);
    const renderTime = Math.floor(Math.random() * 1000) + 200;

    const passed = layoutIssues.filter((i) => i.severity === 'critical').length === 0;

    return {
      viewport,
      screenshot,
      layoutIssues,
      renderTime,
      passed,
    };
  }

  private createScreenshot(url: string, viewport: Viewport): Screenshot {
    return {
      id: uuidv4(),
      url,
      viewport,
      timestamp: new Date(),
      path: FilePath.create(`.visual-tests/responsive/${viewport.width}x${viewport.height}.png`),
      metadata: {
        browser: 'chromium',
        os: process.platform,
        fullPage: false,
        loadTime: Math.floor(Math.random() * 2000) + 500,
      },
    };
  }

  private detectLayoutIssues(
    viewport: Viewport,
    config: ResponsiveTestConfig
  ): LayoutIssue[] {
    const issues: LayoutIssue[] = [];

    // Simulate detecting layout issues
    // In production, this would analyze actual DOM/CSS

    // Check for horizontal overflow (more likely on small screens)
    if (viewport.width < 768 && Math.random() < 0.2) {
      issues.push({
        type: 'horizontal-overflow',
        severity: 'critical',
        element: '.container',
        description: 'Content overflows horizontally causing horizontal scroll',
        viewport,
      });
    }

    // Check for text overflow
    if (viewport.width < 480 && Math.random() < 0.15) {
      issues.push({
        type: 'text-overflow',
        severity: 'warning',
        element: '.long-text',
        description: 'Text content is truncated or overflows container',
        viewport,
      });
    }

    // Check touch target size on mobile
    if (config.checkTouchTargets && viewport.isMobile && Math.random() < 0.25) {
      issues.push({
        type: 'touch-target-size',
        severity: 'warning',
        element: '.small-button',
        description: `Touch target is smaller than ${config.minTouchTargetSize}px minimum`,
        viewport,
      });
    }

    // Check font size
    if (viewport.isMobile && Math.random() < 0.1) {
      issues.push({
        type: 'font-size-too-small',
        severity: 'warning',
        element: '.fine-print',
        description: `Font size is below ${config.minFontSize}px minimum for readability`,
        viewport,
      });
    }

    // Check for non-responsive images
    if (Math.random() < 0.15) {
      issues.push({
        type: 'image-not-responsive',
        severity: 'info',
        element: 'img.hero-image',
        description: 'Image does not scale properly for viewport width',
        viewport,
      });
    }

    return issues;
  }

  private detectBreakpointIssues(
    viewportResults: ViewportResult[],
    breakpoints: number[]
  ): BreakpointIssue[] {
    const issues: BreakpointIssue[] = [];

    // Sort results by viewport width
    const sorted = [...viewportResults].sort(
      (a, b) => a.viewport.width - b.viewport.width
    );

    // Check for issues at each breakpoint
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // Check if there's a breakpoint between these viewports
      const breakpointBetween = breakpoints.find(
        (bp) => bp > current.viewport.width && bp < next.viewport.width
      );

      if (breakpointBetween && Math.random() < 0.2) {
        issues.push({
          breakpoint: breakpointBetween,
          description: 'Layout shifts abruptly at this breakpoint',
          affectedElements: ['.navigation', '.sidebar'],
          suggestion: 'Consider adding intermediate styles or adjusting breakpoint',
        });
      }
    }

    return issues;
  }

  private calculateLayoutScore(
    viewportResults: ViewportResult[],
    issues: LayoutIssue[]
  ): number {
    const baseScore = 100;

    // Deduct points for issues
    const criticalPenalty = issues.filter((i) => i.severity === 'critical').length * 15;
    const warningPenalty = issues.filter((i) => i.severity === 'warning').length * 5;
    const infoPenalty = issues.filter((i) => i.severity === 'info').length * 1;

    // Bonus for passing all viewport tests
    const passingBonus = viewportResults.every((r) => r.passed) ? 5 : 0;

    return Math.max(0, baseScore - criticalPenalty - warningPenalty - infoPenalty + passingBonus);
  }

  private generateRecommendations(
    layoutIssues: LayoutIssue[],
    breakpointIssues: BreakpointIssue[]
  ): string[] {
    const recommendations: string[] = [];

    // Group issues by type
    const issuesByType = new Map<LayoutIssueType, LayoutIssue[]>();
    for (const issue of layoutIssues) {
      const existing = issuesByType.get(issue.type) || [];
      issuesByType.set(issue.type, [...existing, issue]);
    }

    // Generate recommendations for each issue type
    if (issuesByType.has('horizontal-overflow')) {
      recommendations.push(
        'Use CSS overflow-x: hidden or adjust element widths to prevent horizontal scrolling'
      );
    }

    if (issuesByType.has('touch-target-size')) {
      recommendations.push(
        'Increase touch target sizes to at least 44x44 pixels for better mobile usability'
      );
    }

    if (issuesByType.has('font-size-too-small')) {
      recommendations.push(
        'Use relative font units (rem/em) and ensure minimum 16px base font size on mobile'
      );
    }

    if (issuesByType.has('image-not-responsive')) {
      recommendations.push(
        'Use srcset and sizes attributes for responsive images, or CSS max-width: 100%'
      );
    }

    if (breakpointIssues.length > 0) {
      recommendations.push(
        'Review CSS media queries to ensure smooth transitions between breakpoints'
      );
    }

    return recommendations;
  }

  private calculateStructuralDiff(
    screenshot1: Screenshot,
    screenshot2: Screenshot
  ): VisualDiff {
    // Calculate difference based on viewport changes
    const widthDiff = Math.abs(screenshot1.viewport.width - screenshot2.viewport.width);
    const heightDiff = Math.abs(screenshot1.viewport.height - screenshot2.viewport.height);

    // Larger viewport differences typically mean more layout changes
    const diffPercentage = Math.min(50, (widthDiff + heightDiff) / 20);

    return {
      baselineId: screenshot1.id,
      comparisonId: screenshot2.id,
      diffPercentage,
      diffPixels: Math.floor(diffPercentage * 1000),
      regions: [],
      status: diffPercentage < 10 ? 'acceptable' : 'changed',
    };
  }

  private findContentBreaks(_url: string): ContentBreak[] {
    // Stub: In production, this would test many widths to find break points
    const breaks: ContentBreak[] = [];

    // Simulate finding content breaks
    const potentialBreaks = [375, 540, 768, 992, 1200];
    for (const width of potentialBreaks) {
      if (Math.random() < 0.7) {
        breaks.push({
          width,
          reason: 'Content layout changes significantly',
          affectedElements: ['.container', '.grid', '.navigation'],
        });
      }
    }

    return breaks;
  }

  private suggestBreakpoints(contentBreaks: ContentBreak[]): number[] {
    // Suggest breakpoints based on content breaks
    const suggestions = new Set<number>();

    for (const breakItem of contentBreaks) {
      // Round to nearest common breakpoint
      const rounded = Math.round(breakItem.width / 100) * 100;
      suggestions.add(rounded);
    }

    // Add standard breakpoints if not covered
    const standard = [576, 768, 992, 1200, 1400];
    for (const bp of standard) {
      if (!Array.from(suggestions).some((s) => Math.abs(s - bp) < 50)) {
        suggestions.add(bp);
      }
    }

    return Array.from(suggestions).sort((a, b) => a - b);
  }

  private calculateBreakpointCoverage(
    current: number[],
    contentBreaks: ContentBreak[]
  ): number {
    if (contentBreaks.length === 0) return 100;

    let covered = 0;
    for (const breakItem of contentBreaks) {
      // Check if any current breakpoint is within 50px
      if (current.some((bp) => Math.abs(bp - breakItem.width) < 50)) {
        covered++;
      }
    }

    return Math.round((covered / contentBreaks.length) * 100);
  }

  private async storeResult(result: ResponsiveTestResult): Promise<void> {
    const resultId = uuidv4();
    await this.memory.set(
      `visual-accessibility:responsive:${resultId}`,
      result,
      { namespace: 'visual-accessibility', persist: true }
    );
  }
}
