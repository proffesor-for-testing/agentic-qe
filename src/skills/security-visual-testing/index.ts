/**
 * Security-Visual Testing Skill
 * Combines browser integration, security validation, PII detection, and visual testing
 */

import type { Result } from '../../shared/types/index.js';
import { ok, err } from '../../shared/types/index.js';
import type {
  IVisualAccessibilityCoordinator,
  VisualTestReport,
  AccessibilityAuditReport,
} from '../../domains/visual-accessibility/interfaces.js';
import type { IBrowserClient } from '../../integrations/browser/types.js';
import {
  createBrowserClient,
  isVibiumAvailable,
  isAgentBrowserAvailable,
} from '../../integrations/browser/client-factory.js';
import type {
  ISecurityVisualTestingSkill,
  SecurityVisualAuditOptions,
  SecurityVisualAuditReport,
  PIISafeScreenshotOptions,
  PIISafeScreenshot,
  ResponsiveVisualAuditOptions,
  ResponsiveVisualAuditReport,
  URLSecurityValidation,
  PIIDetectionResult,
  SecurityIssue,
  PIIType,
  SecurityVisualRecommendation,
  SecurityVisualTestingConfig,
  LayoutShift,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { toError } from '../../shared/error-utils.js';

/**
 * Security-Visual Testing Skill Implementation
 *
 * This skill provides comprehensive security-first visual testing by integrating:
 * - @claude-flow/browser: Browser automation (Vibium MCP or agent-browser CLI)
 * - Visual-Accessibility Domain: Visual regression and accessibility testing
 * - Security Scanning: URL validation and threat detection
 * - PII Detection: Sensitive data identification and masking
 *
 * Key Features:
 * 1. Security-Visual Audit: Full pipeline with URL validation, visual testing, and accessibility
 * 2. PII-Safe Screenshots: Automatic PII detection and masking
 * 3. Responsive Visual Audit: Multi-viewport testing with layout shift detection
 * 4. Parallel Execution: Test multiple viewports concurrently
 * 5. Comprehensive Reporting: Unified security, visual, and accessibility findings
 *
 * Integration Pattern:
 * - Dependencies are injected via constructor (no internal creation)
 * - Browser client is created dynamically based on availability
 * - Visual coordinator is required for visual testing
 * - Configuration is merged with defaults
 *
 * @example
 * ```typescript
 * const skill = new SecurityVisualTestingSkill(
 *   visualCoordinator,
 *   { parallel: { enabled: true, maxConcurrent: 4 } }
 * );
 *
 * await skill.initialize();
 *
 * const result = await skill.executeSecurityVisualAudit({
 *   urls: ['https://example.com/dashboard', 'https://example.com/profile'],
 *   viewports: [
 *     { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
 *     { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
 *   ],
 *   wcagLevel: 'AA',
 * });
 *
 * if (result.success) {
 *   console.log(`Audit complete: ${result.value.summary.secureUrls}/${result.value.summary.totalUrls} URLs secure`);
 *   console.log(`Visual tests: ${result.value.summary.visualTestsPassed} passed, ${result.value.summary.visualTestsFailed} failed`);
 * }
 *
 * await skill.dispose();
 * ```
 */
export class SecurityVisualTestingSkill implements ISecurityVisualTestingSkill {
  private readonly config: SecurityVisualTestingConfig;
  private browserClient?: IBrowserClient;
  private initialized = false;

  constructor(
    private readonly visualCoordinator: IVisualAccessibilityCoordinator,
    config: Partial<SecurityVisualTestingConfig> = {}
  ) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
  }

  /**
   * Initialize the skill and browser client
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check browser availability
    const vibiumAvailable = await isVibiumAvailable();
    const agentBrowserAvailable = await isAgentBrowserAvailable();

    if (!vibiumAvailable && !agentBrowserAvailable) {
      throw new Error(
        'No browser tool available. Install @claude-flow/browser (Vibium MCP) or ensure agent-browser CLI is accessible.'
      );
    }

    // Create browser client (returns IBrowserClient directly)
    this.browserClient = await createBrowserClient({
      useCase: 'visual-regression',
      preference: vibiumAvailable ? 'vibium' : 'agent-browser',
    });

    // Launch browser
    const launchResult = await this.browserClient.launch({
      headless: this.config.browser.headless,
      viewport: { width: 1920, height: 1080 },
    });

    if (!launchResult.success) {
      throw new Error(`Failed to launch browser: ${launchResult.error.message}`);
    }

    console.log(`[security-visual-testing] Initialized with ${this.browserClient.tool}`);
    this.initialized = true;
  }

  /**
   * Dispose and cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.browserClient) {
      await this.browserClient.quit();
      await this.browserClient.dispose();
      this.browserClient = undefined;
    }
    this.initialized = false;
  }

  /**
   * Execute full security-visual audit pipeline
   */
  async executeSecurityVisualAudit(
    options: SecurityVisualAuditOptions
  ): Promise<Result<SecurityVisualAuditReport, Error>> {
    this.ensureInitialized();

    const startTime = Date.now();
    const urlValidations: URLSecurityValidation[] = [];
    const piiDetections: PIIDetectionResult[] = [];
    const secureUrls: string[] = [];

    try {
      // Step 1: Validate URLs for security issues
      if (this.config.security.validateUrls) {
        for (const url of options.urls) {
          const validation = await this.validateURLSecurity(url);
          if (validation.success) {
            urlValidations.push(validation.value);
            if (validation.value.valid && validation.value.riskLevel !== 'critical') {
              secureUrls.push(url);
            }
          }
        }
      } else {
        // Skip validation, assume all URLs are secure
        secureUrls.push(...options.urls);
      }

      // Step 2: Run visual regression tests on secure URLs
      const visualResult = await this.visualCoordinator.runVisualTests(
        secureUrls,
        options.viewports
      );

      if (!visualResult.success) {
        return err(new Error(`Visual testing failed: ${visualResult.error.message}`));
      }

      const visualReport = visualResult.value;

      // Step 3: Run accessibility audit if enabled
      let accessibilityReport: AccessibilityAuditReport | undefined;
      if (this.config.accessibility.enabled && options.wcagLevel) {
        const accessibilityResult = await this.visualCoordinator.runAccessibilityAudit(
          secureUrls,
          options.wcagLevel
        );

        if (accessibilityResult.success) {
          accessibilityReport = accessibilityResult.value;
        }
      }

      // Step 4: Detect PII in screenshots if enabled. #1228: no scanner exists,
      // so each screenshot is reported as not scanned, never as free of PII.
      if (this.config.pii.enabled && options.detectPII !== false) {
        for (const url of secureUrls) {
          const screenshot = visualReport.results.find((r) => r.url === url)?.screenshot.path.value ?? '';
          const detection = await this.detectPII(screenshot);
          if (detection.success) piiDetections.push(detection.value);
        }
      }
      const piiScanned = piiDetections.filter((p) => p.measured);

      // Step 5: Generate recommendations
      const recommendations = this.generateRecommendations(
        urlValidations,
        visualReport,
        accessibilityReport,
        piiDetections
      );

      // Build report
      const report: SecurityVisualAuditReport = {
        summary: {
          totalUrls: options.urls.length,
          secureUrls: secureUrls.length,
          visualTestsPassed: visualReport.passed,
          visualTestsFailed: visualReport.failed,
          accessibilityIssues: accessibilityReport?.totalViolations ?? 0,
          piiDetections: piiScanned.length > 0 ? piiScanned.filter((p) => p.detected === true).length : -1,
          duration: Date.now() - startTime,
        },
        urlValidations,
        visualReport,
        accessibilityReport,
        piiDetections,
        recommendations,
        timestamp: new Date(),
      };

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Capture PII-safe screenshot
   */
  async executePIISafeScreenshot(
    options: PIISafeScreenshotOptions
  ): Promise<Result<PIISafeScreenshot, Error>> {
    this.ensureInitialized();

    try {
      // Step 1: Validate URL security
      const validationResult = await this.validateURLSecurity(options.url);
      if (!validationResult.success) {
        return err(validationResult.error);
      }

      const validation = validationResult.value;
      if (!validation.valid && this.config.security.blockMaliciousUrls) {
        return err(new Error(`URL failed security validation: ${validation.riskLevel} risk`));
      }

      // Step 2: Navigate to URL
      const navResult = await this.browserClient!.navigate(options.url);
      if (!navResult.success) {
        return err(new Error(`Navigation failed: ${navResult.error.message}`));
      }

      // Step 3: Set viewport if specified
      if (options.viewport) {
        // Note: Viewport setting depends on browser client capabilities
        // Vibium supports this, agent-browser may need session config
      }

      // Step 4: Capture screenshot
      const screenshotResult = await this.browserClient!.screenshot({
        fullPage: options.fullPage ?? this.config.visual.captureFullPage,
        path: options.savePath,
      });

      if (!screenshotResult.success) {
        return err(new Error(`Screenshot capture failed: ${screenshotResult.error.message}`));
      }

      const screenshot = screenshotResult.value;

      // Step 5: Detect PII if enabled. #1228: unscanned is null, not false.
      let piiDetected: boolean | null = null;
      let piiNotMeasuredReason: string | undefined = 'PII NOT MEASURED: no PII scan was requested';
      let piiTypes: PIIType[] = [];
      let maskedPath: string | undefined;

      if (this.config.pii.enabled && (options.maskPII ?? this.config.pii.autoMask)) {
        const piiResult = await this.detectPII(screenshot.path || '');
        if (!piiResult.success) {
          piiNotMeasuredReason = `PII NOT MEASURED: ${piiResult.error.message}`;
        } else if (!piiResult.value.measured) {
          piiNotMeasuredReason = piiResult.value.notMeasuredReason;
        } else {
          piiDetected = piiResult.value.detected;
          piiNotMeasuredReason = undefined;
          piiTypes = piiResult.value.types;
          maskedPath = piiResult.value.screenshot.masked;
        }
      }

      const result: PIISafeScreenshot = {
        url: options.url,
        viewport: options.viewport || {
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        },
        screenshot: {
          original: screenshot.path || screenshot.base64 || '',
          masked: maskedPath,
        },
        piiDetected,
        ...(piiNotMeasuredReason ? { piiNotMeasuredReason } : {}),
        piiTypes,
        securityValidation: validation,
        timestamp: new Date(),
      };

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Execute responsive visual audit
   */
  async executeResponsiveVisualAudit(
    options: ResponsiveVisualAuditOptions
  ): Promise<Result<ResponsiveVisualAuditReport, Error>> {
    this.ensureInitialized();

    try {
      // Run visual tests across all viewports
      const visualResult = await this.visualCoordinator.runVisualTests(
        [options.url],
        options.viewports
      );

      if (!visualResult.success) {
        return err(visualResult.error);
      }

      const visualReport = visualResult.value;

      // Extract viewport-specific results
      const screenshots = visualReport.results.map((result) => ({
        viewport: result.viewport,
        path: result.screenshot.path.value,
        timestamp: result.screenshot.timestamp,
      }));

      // #1228: a missing diff is -1 and a new baseline is `new`, not a 0% pass or a failure
      const visualRegressions = visualReport.results.map((result) => ({
        viewport: result.viewport,
        diffPercentage: result.diff?.diffPercentage ?? -1,
        status: result.status,
      }));

      // #1228: element positions are not compared across viewports, so layout
      // shifts are reported as not measured instead of "no shifts detected".
      const layoutShifts: LayoutShift[] = [];
      const layoutShiftsNotMeasured = options.detectLayoutShifts
        ? { layoutShiftsMeasured: false, layoutShiftsNotMeasuredReason: 'layout shift detection is not implemented: element positions were not compared across viewports' }
        : {};

      // Generate recommendations
      const recommendations: string[] = [];
      if (visualReport.failed > 0) {
        recommendations.push(
          `Fix ${visualReport.failed} visual regression(s) across viewports`
        );
      }
      if (layoutShifts.some((shift) => shift.severity === 'high')) {
        recommendations.push('Address high-severity layout shifts for better UX');
      }

      const report: ResponsiveVisualAuditReport = {
        url: options.url,
        viewports: options.viewports,
        screenshots,
        layoutShifts,
        ...layoutShiftsNotMeasured,
        visualRegressions,
        recommendations,
      };

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Validate URL security
   */
  async validateURLSecurity(url: string): Promise<Result<URLSecurityValidation, Error>> {
    try {
      const issues: SecurityIssue[] = [];
      let riskLevel: URLSecurityValidation['riskLevel'] = 'none';

      // Check protocol
      const protocol = new URL(url).protocol;
      if (!this.config.security.allowedProtocols.includes(protocol.replace(':', ''))) {
        issues.push({
          type: 'unsafe-protocol',
          description: `Protocol ${protocol} is not allowed`,
          severity: 'high',
        });
        riskLevel = 'high';
      }

      // Check for potential XSS patterns in URL
      const xssPatterns = [/<script/i, /javascript:/i, /on\w+=/i];
      for (const pattern of xssPatterns) {
        if (pattern.test(url)) {
          issues.push({
            type: 'xss',
            description: 'Potential XSS pattern detected in URL',
            severity: 'critical',
          });
          riskLevel = 'critical';
          break;
        }
      }

      // Check for SQL injection patterns
      const sqlPatterns = [/'.*or.*'/i, /union.*select/i, /drop.*table/i];
      for (const pattern of sqlPatterns) {
        if (pattern.test(url)) {
          issues.push({
            type: 'sql-injection',
            description: 'Potential SQL injection pattern detected in URL',
            severity: 'critical',
          });
          riskLevel = 'critical';
          break;
        }
      }

      const validation: URLSecurityValidation = {
        url,
        valid: issues.length === 0,
        issues,
        riskLevel,
        timestamp: new Date(),
      };

      return ok(validation);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Detect PII in screenshot.
   * No OCR scanner is available, so the result says the screenshot was not
   * scanned (#1228): detected is null and confidence -1, never "no PII found".
   */
  async detectPII(screenshotPath: string): Promise<Result<PIIDetectionResult, Error>> {
    try {
      const result: PIIDetectionResult = {
        detected: null,
        types: [],
        locations: [],
        screenshot: {
          original: screenshotPath,
        },
        confidence: -1,
        measured: false,
        notMeasuredReason: 'PII NOT MEASURED: no screenshot PII scanner (OCR) is available, so the screenshot was not scanned',
      };

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.browserClient) {
      throw new Error('Skill not initialized. Call initialize() first.');
    }
  }

  private mergeConfig(
    defaults: SecurityVisualTestingConfig,
    overrides: Partial<SecurityVisualTestingConfig>
  ): SecurityVisualTestingConfig {
    return {
      browser: { ...defaults.browser, ...overrides.browser },
      security: { ...defaults.security, ...overrides.security },
      pii: { ...defaults.pii, ...overrides.pii },
      visual: { ...defaults.visual, ...overrides.visual },
      accessibility: { ...defaults.accessibility, ...overrides.accessibility },
      parallel: { ...defaults.parallel, ...overrides.parallel },
    };
  }

  private generateRecommendations(
    urlValidations: URLSecurityValidation[],
    visualReport: VisualTestReport,
    accessibilityReport: AccessibilityAuditReport | undefined,
    piiDetections: PIIDetectionResult[]
  ): SecurityVisualRecommendation[] {
    const recommendations: SecurityVisualRecommendation[] = [];

    // Security recommendations
    const insecureUrls = urlValidations.filter((v) => !v.valid);
    if (insecureUrls.length > 0) {
      recommendations.push({
        type: 'security',
        severity: 'critical',
        description: `${insecureUrls.length} URL(s) failed security validation`,
        action: 'Review and fix security issues before testing',
        affectedUrls: insecureUrls.map((v) => v.url),
      });
    }

    // Visual recommendations
    if (visualReport.failed > 0) {
      recommendations.push({
        type: 'visual',
        severity: 'high',
        description: `${visualReport.failed} visual regression(s) detected`,
        action: 'Review visual differences and update baselines if intentional',
        affectedUrls: visualReport.results
          .filter((r) => r.status === 'failed')
          .map((r) => r.url),
      });
    }

    // Accessibility recommendations
    if (accessibilityReport && accessibilityReport.criticalViolations > 0) {
      recommendations.push({
        type: 'accessibility',
        severity: 'critical',
        description: `${accessibilityReport.criticalViolations} critical accessibility issue(s) found`,
        action: 'Fix critical WCAG violations to ensure compliance',
        affectedUrls: accessibilityReport.reports
          .filter((r) => r.violations.some((v) => v.impact === 'critical'))
          .map((r) => r.url),
      });
    }

    // PII recommendations
    const piiFound = piiDetections.filter((p) => p.detected);
    if (piiFound.length > 0) {
      recommendations.push({
        type: 'pii',
        severity: 'high',
        description: `PII detected in ${piiFound.length} screenshot(s)`,
        action: 'Ensure sensitive data is masked before sharing screenshots',
        affectedUrls: [], // Would need to track which URLs had PII
      });
    }

    // #1228: an unscanned screenshot needs a manual check, it is not clean
    const piiUnscanned = piiDetections.filter((p) => !p.measured);
    if (piiUnscanned.length > 0) {
      recommendations.push({
        type: 'pii',
        severity: 'medium',
        description: `PII NOT MEASURED for ${piiUnscanned.length} screenshot(s): ${piiUnscanned[0].notMeasuredReason ?? 'not scanned'}`,
        action: 'Review the screenshots for PII manually before sharing them',
        affectedUrls: [],
      });
    }

    return recommendations;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new security-visual testing skill instance
 */
export function createSecurityVisualTestingSkill(
  visualCoordinator: IVisualAccessibilityCoordinator,
  config: Partial<SecurityVisualTestingConfig> = {}
): SecurityVisualTestingSkill {
  return new SecurityVisualTestingSkill(visualCoordinator, config);
}

// ============================================================================
// Exports
// ============================================================================

// SecurityVisualTestingSkill is already exported via the class declaration
export type {
  ISecurityVisualTestingSkill,
  SecurityVisualAuditOptions,
  SecurityVisualAuditReport,
  PIISafeScreenshotOptions,
  PIISafeScreenshot,
  ResponsiveVisualAuditOptions,
  ResponsiveVisualAuditReport,
  URLSecurityValidation,
  PIIDetectionResult,
  SecurityVisualTestingConfig,
} from './types.js';
export { DEFAULT_CONFIG } from './types.js';
