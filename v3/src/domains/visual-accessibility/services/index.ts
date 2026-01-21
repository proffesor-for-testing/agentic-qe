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

export {
  ViewportCaptureService,
  createViewportCaptureService,
  VIEWPORT_PRESETS,
  DEFAULT_BREAKPOINTS,
  type IViewportCaptureService,
  type ViewportPreset,
  type ViewportCaptureResult,
  type MultiViewportCaptureResult,
  type ResponsiveAnalysis,
  type DetectedBreakpoint,
  type LayoutShift,
  type ScreenshotComparisonResult,
  type ViewportCaptureConfig,
  type CaptureAllOptions,
  type BreakpointCaptureOptions,
  type SingleCaptureOptions,
} from './viewport-capture.js';

export {
  VisualRegressionService,
  createVisualRegressionService,
  type VisualRegressionConfig,
  type BaselineMetadata,
  type VisualRegressionResult,
  type VisualRegressionTestOptions,
  type IVisualRegressionService,
} from './visual-regression.js';
