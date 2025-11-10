/**
 * Visual Testing Domain Tools
 *
 * This module provides domain-specific tools for visual testing including:
 * - AI-powered screenshot comparison
 * - Visual regression detection
 * - WCAG accessibility validation
 *
 * @module visual
 * @version 1.0.0
 * @author Agentic QE Team
 */

// Screenshot Comparison
export {
  compareScreenshotsAI,
  type CompareScreenshotsParams,
  type ScreenshotComparison,
  type VisualDifference
} from './compare-screenshots'

// Accessibility Validation
export {
  validateAccessibilityWCAG,
  type ValidateAccessibilityParams,
  type AccessibilityReport,
  type AccessibilityViolation,
  type ColorContrastResults,
  type KeyboardNavigationResults,
  type ScreenReaderResults,
  type AccessibilityRecommendation,
  type WCAGLevel
} from './validate-accessibility'

// Visual Regression Detection (migrated from handlers/prediction)
export type { VisualTestRegressionArgs, VisualRegressionResult } from './detect-regression'
