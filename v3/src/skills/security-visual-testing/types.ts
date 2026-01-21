/**
 * Security-Visual Testing Skill - Type Definitions
 * Combines security validation, PII detection, and visual testing
 */

import type { Result, Viewport, Severity } from '../../shared/types/index.js';
import type {
  VisualTestReport,
  AccessibilityAuditReport,
} from '../../domains/visual-accessibility/interfaces.js';

// ============================================================================
// Security-Visual Audit Types
// ============================================================================

/**
 * URL security validation result
 */
export interface URLSecurityValidation {
  url: string;
  valid: boolean;
  issues: SecurityIssue[];
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

/**
 * Security issue detected during URL validation
 */
export interface SecurityIssue {
  type: 'xss' | 'sql-injection' | 'malicious-script' | 'phishing' | 'unsafe-protocol';
  description: string;
  severity: Severity;
  location?: string;
}

/**
 * PII detection result in screenshot
 */
export interface PIIDetectionResult {
  detected: boolean;
  types: PIIType[];
  locations: PIILocation[];
  screenshot: {
    original: string;
    masked?: string;
  };
  confidence: number;
}

/**
 * Types of PII that can be detected
 */
export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit-card'
  | 'api-key'
  | 'password'
  | 'address'
  | 'name';

/**
 * Location of detected PII in screenshot
 */
export interface PIILocation {
  type: PIIType;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  maskedValue: string;
}

/**
 * Options for security-visual audit
 */
export interface SecurityVisualAuditOptions {
  urls: string[];
  viewports: Viewport[];
  wcagLevel?: 'A' | 'AA' | 'AAA';
  validateSecurity?: boolean;
  detectPII?: boolean;
  parallel?: boolean;
  maxConcurrent?: number;
  timeout?: number;
}

/**
 * Complete security-visual audit report
 */
export interface SecurityVisualAuditReport {
  summary: {
    totalUrls: number;
    secureUrls: number;
    visualTestsPassed: number;
    visualTestsFailed: number;
    accessibilityIssues: number;
    piiDetections: number;
    duration: number;
  };
  urlValidations: URLSecurityValidation[];
  visualReport: VisualTestReport;
  accessibilityReport?: AccessibilityAuditReport;
  piiDetections: PIIDetectionResult[];
  recommendations: SecurityVisualRecommendation[];
  timestamp: Date;
}

/**
 * Recommendation based on security-visual findings
 */
export interface SecurityVisualRecommendation {
  type: 'security' | 'visual' | 'accessibility' | 'pii';
  severity: Severity;
  description: string;
  action: string;
  affectedUrls: string[];
}

// ============================================================================
// PII-Safe Screenshot Types
// ============================================================================

/**
 * Options for PII-safe screenshot capture
 */
export interface PIISafeScreenshotOptions {
  url: string;
  viewport?: Viewport;
  fullPage?: boolean;
  maskPII?: boolean;
  maskingStrategy?: PIIMaskingStrategy;
  savePath?: string;
}

/**
 * PII masking strategy
 */
export interface PIIMaskingStrategy {
  method: 'blur' | 'redact' | 'pixelate' | 'overlay';
  intensity: 'low' | 'medium' | 'high';
  color?: string;
}

/**
 * PII-safe screenshot result
 */
export interface PIISafeScreenshot {
  url: string;
  viewport: Viewport;
  screenshot: {
    original: string;
    masked?: string;
  };
  piiDetected: boolean;
  piiTypes: PIIType[];
  securityValidation: URLSecurityValidation;
  timestamp: Date;
}

// ============================================================================
// Responsive Visual Audit Types
// ============================================================================

/**
 * Options for responsive visual audit
 */
export interface ResponsiveVisualAuditOptions {
  url: string;
  viewports: Viewport[];
  compareBaselines?: boolean;
  detectLayoutShifts?: boolean;
  timeout?: number;
}

/**
 * Layout shift detection result
 */
export interface LayoutShift {
  viewport: Viewport;
  affectedElements: string[];
  score: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

/**
 * Responsive visual audit report
 */
export interface ResponsiveVisualAuditReport {
  url: string;
  viewports: Viewport[];
  screenshots: Array<{
    viewport: Viewport;
    path: string;
    timestamp: Date;
  }>;
  layoutShifts: LayoutShift[];
  visualRegressions: Array<{
    viewport: Viewport;
    diffPercentage: number;
    status: 'passed' | 'failed';
  }>;
  recommendations: string[];
}

// ============================================================================
// Skill Configuration Types
// ============================================================================

/**
 * Security-visual testing skill configuration
 */
export interface SecurityVisualTestingConfig {
  browser: {
    headless: boolean;
    timeout: number;
    userAgent?: string;
  };
  security: {
    validateUrls: boolean;
    blockMaliciousUrls: boolean;
    allowedProtocols: string[];
  };
  pii: {
    enabled: boolean;
    autoMask: boolean;
    maskingStrategy: PIIMaskingStrategy;
    detectionThreshold: number;
  };
  visual: {
    compareBaselines: boolean;
    diffThreshold: number;
    captureFullPage: boolean;
  };
  accessibility: {
    enabled: boolean;
    wcagLevel: 'A' | 'AA' | 'AAA';
    runOnFailure: boolean;
  };
  parallel: {
    enabled: boolean;
    maxConcurrent: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: SecurityVisualTestingConfig = {
  browser: {
    headless: true,
    timeout: 30000,
  },
  security: {
    validateUrls: true,
    blockMaliciousUrls: true,
    allowedProtocols: ['https', 'http'],
  },
  pii: {
    enabled: true,
    autoMask: true,
    maskingStrategy: {
      method: 'blur',
      intensity: 'high',
    },
    detectionThreshold: 0.7,
  },
  visual: {
    compareBaselines: true,
    diffThreshold: 0.01,
    captureFullPage: false,
  },
  accessibility: {
    enabled: true,
    wcagLevel: 'AA',
    runOnFailure: false,
  },
  parallel: {
    enabled: true,
    maxConcurrent: 4,
  },
};

// ============================================================================
// Skill Interface
// ============================================================================

/**
 * Security-visual testing skill interface
 */
export interface ISecurityVisualTestingSkill {
  /**
   * Execute full security-visual audit pipeline
   */
  executeSecurityVisualAudit(
    options: SecurityVisualAuditOptions
  ): Promise<Result<SecurityVisualAuditReport, Error>>;

  /**
   * Capture PII-safe screenshot
   */
  executePIISafeScreenshot(
    options: PIISafeScreenshotOptions
  ): Promise<Result<PIISafeScreenshot, Error>>;

  /**
   * Execute responsive visual audit
   */
  executeResponsiveVisualAudit(
    options: ResponsiveVisualAuditOptions
  ): Promise<Result<ResponsiveVisualAuditReport, Error>>;

  /**
   * Validate URL security
   */
  validateURLSecurity(url: string): Promise<Result<URLSecurityValidation, Error>>;

  /**
   * Detect PII in screenshot
   */
  detectPII(screenshotPath: string): Promise<Result<PIIDetectionResult, Error>>;

  /**
   * Initialize the skill
   */
  initialize(): Promise<void>;

  /**
   * Dispose and cleanup
   */
  dispose(): Promise<void>;
}
