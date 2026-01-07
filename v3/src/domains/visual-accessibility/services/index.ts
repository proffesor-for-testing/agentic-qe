/**
 * Agentic QE v3 - Visual & Accessibility Testing Services
 * Service layer exports for the visual-accessibility domain
 */

export {
  VisualTesterService,
  type VisualTesterConfig,
} from './visual-tester.js';

export {
  AccessibilityTesterService,
  type AccessibilityTesterConfig,
} from './accessibility-tester.js';

export {
  ResponsiveTesterService,
  DEVICE_VIEWPORTS,
  type IResponsiveTestingService,
  type ResponsiveTestConfig,
  type ResponsiveTestResult,
  type ViewportResult,
  type LayoutIssue,
  type LayoutIssueType,
  type BreakpointIssue,
  type BreakpointAnalysis,
  type ContentBreak,
} from './responsive-tester.js';
