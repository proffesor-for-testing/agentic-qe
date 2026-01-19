/**
 * Agentic QE v3 - E2E Test Step Definition Types
 *
 * Comprehensive TypeScript types for E2E test step definitions
 * to be used with Vibium browser automation.
 *
 * @module test-execution/types/e2e-step
 */

import type {
  ClickOptions,
  TypeOptions,
  ScreenshotResult,
  ScreenshotOptions,
  AccessibilityCheckOptions,
  AccessibilityResult,
  NavigateOptions,
  FindOptions,
} from '../../../integrations/vibium/types';

// ============================================================================
// Step Type Enumeration
// ============================================================================

/**
 * E2E step type enumeration
 * Defines all possible step types in an E2E test scenario
 */
export const E2EStepType = {
  /** Navigate to a URL */
  NAVIGATE: 'navigate',
  /** Click an element */
  CLICK: 'click',
  /** Type text into an element */
  TYPE: 'type',
  /** Wait for a condition */
  WAIT: 'wait',
  /** Make an assertion */
  ASSERT: 'assert',
  /** Take a screenshot */
  SCREENSHOT: 'screenshot',
  /** Perform accessibility check */
  A11Y_CHECK: 'a11y-check',
} as const;

export type E2EStepType = (typeof E2EStepType)[keyof typeof E2EStepType];

// ============================================================================
// Step Options - Per Type
// ============================================================================

/**
 * Options for navigate steps
 */
export interface NavigateStepOptions extends Omit<NavigateOptions, 'url'> {
  /** Wait until specific load state (default: 'load') */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Clear cookies before navigation */
  clearCookies?: boolean;
  /** Clear local storage before navigation */
  clearLocalStorage?: boolean;
  /** HTTP headers to send with navigation */
  headers?: Record<string, string>;
  /** Basic auth credentials */
  auth?: {
    username: string;
    password: string;
  };
}

/**
 * Options for click steps
 * Extends Vibium ClickOptions with additional E2E-specific options
 */
export interface ClickStepOptions extends Omit<ClickOptions, 'selector'> {
  /** Wait for navigation after click */
  waitForNavigation?: boolean;
  /** Expected URL pattern after click (regex or string) */
  expectedUrlPattern?: string | RegExp;
  /** Scroll element into view before clicking */
  scrollIntoView?: boolean;
  /** Hover before clicking */
  hoverFirst?: boolean;
  /** Wait for element to be stable before clicking */
  waitForStable?: boolean;
}

/**
 * Options for type steps
 * Extends Vibium TypeOptions with additional E2E-specific options
 */
export interface TypeStepOptions extends Omit<TypeOptions, 'selector' | 'text'> {
  /** Validate input after typing */
  validateInput?: boolean;
  /** Expected validation error message (if validation should fail) */
  expectedValidationError?: string;
  /** Mask sensitive data in logs */
  sensitive?: boolean;
  /** Trigger blur event after typing */
  blur?: boolean;
  /** Fill using native browser autofill */
  useAutofill?: boolean;
}

/**
 * Wait condition types
 */
export type WaitConditionType =
  | 'element-visible'
  | 'element-hidden'
  | 'element-enabled'
  | 'element-disabled'
  | 'element-text'
  | 'element-attribute'
  | 'url-match'
  | 'network-idle'
  | 'dom-loaded'
  | 'page-loaded'
  | 'custom';

/**
 * Options for wait steps
 */
export interface WaitStepOptions {
  /** Type of wait condition */
  condition: WaitConditionType;
  /** Polling interval in milliseconds */
  pollingInterval?: number;
  /** Expected text content (for element-text condition) */
  expectedText?: string;
  /** Text match mode */
  textMatchMode?: 'exact' | 'contains' | 'regex';
  /** Attribute name (for element-attribute condition) */
  attributeName?: string;
  /** Expected attribute value */
  attributeValue?: string;
  /** URL pattern to match (for url-match condition) */
  urlPattern?: string | RegExp;
  /** Custom condition function serialized as string (for custom condition) */
  customCondition?: string;
  /** Invert the condition (wait until NOT true) */
  negate?: boolean;
}

/**
 * Assertion types
 */
export type AssertionType =
  | 'element-exists'
  | 'element-not-exists'
  | 'element-visible'
  | 'element-hidden'
  | 'element-enabled'
  | 'element-disabled'
  | 'element-text'
  | 'element-attribute'
  | 'element-value'
  | 'element-count'
  | 'element-class'
  | 'url-equals'
  | 'url-contains'
  | 'url-matches'
  | 'title-equals'
  | 'title-contains'
  | 'page-has-text'
  | 'cookie-exists'
  | 'cookie-value'
  | 'local-storage'
  | 'session-storage'
  | 'console-no-errors'
  | 'network-request-made'
  | 'custom';

/**
 * Options for assert steps
 */
export interface AssertStepOptions {
  /** Type of assertion */
  assertion: AssertionType;
  /** Expected value for the assertion */
  expected?: string | number | boolean | RegExp;
  /** Comparison operator for numeric assertions */
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches';
  /** Attribute name (for element-attribute assertions) */
  attributeName?: string;
  /** Cookie name (for cookie assertions) */
  cookieName?: string;
  /** Storage key (for storage assertions) */
  storageKey?: string;
  /** Custom assertion function serialized as string */
  customAssertion?: string;
  /** Allow soft assertions (continue on failure) */
  soft?: boolean;
  /** Custom error message on assertion failure */
  errorMessage?: string;
  /** Expected element count (for element-count assertion) */
  count?: number;
  /** Class name to check (for element-class assertion) */
  className?: string;
  /** Network request URL pattern (for network assertions) */
  requestUrlPattern?: string;
}

/**
 * Options for screenshot steps
 * Extends Vibium ScreenshotOptions with E2E-specific options
 */
export interface ScreenshotStepOptions extends Omit<ScreenshotOptions, 'selector' | 'path'> {
  /** Screenshot name/label for identification */
  name?: string;
  /** Compare with baseline image */
  compareWithBaseline?: boolean;
  /** Baseline image path or identifier */
  baselineId?: string;
  /** Difference threshold percentage (0-100) */
  diffThreshold?: number;
  /** Regions to mask/ignore in comparison */
  maskRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** Elements to mask by selector */
  maskSelectors?: string[];
  /** Capture only above the fold */
  aboveTheFold?: boolean;
  /** Wait for animations to complete before capture */
  waitForAnimations?: boolean;
  /** Animation timeout in milliseconds */
  animationTimeout?: number;
}

/**
 * Options for accessibility check steps
 * Extends Vibium AccessibilityCheckOptions with E2E-specific options
 */
export interface A11yCheckStepOptions extends Omit<AccessibilityCheckOptions, 'selector' | 'target'> {
  /** Fail test on violations of specified severity or higher */
  failOnSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Maximum allowed violations before failure */
  maxViolations?: number;
  /** Include passed rules in result */
  includePassed?: boolean;
  /** Include incomplete checks in result */
  includeIncomplete?: boolean;
  /** Custom reporter for violations */
  reporter?: 'default' | 'json' | 'html' | 'custom';
  /** Tags to run (e.g., 'wcag2a', 'wcag2aa', 'best-practice') */
  tags?: string[];
  /** Context to check (iframe, shadowDOM) */
  context?: {
    include?: string[];
    exclude?: string[];
  };
}

/**
 * Union type for all step options
 */
export type StepOptions =
  | NavigateStepOptions
  | ClickStepOptions
  | TypeStepOptions
  | WaitStepOptions
  | AssertStepOptions
  | ScreenshotStepOptions
  | A11yCheckStepOptions;

// ============================================================================
// E2E Step Interface
// ============================================================================

/**
 * Base E2E step interface
 */
export interface E2EStepBase {
  /** Unique step identifier */
  id: string;
  /** Human-readable step description */
  description: string;
  /** Target element selector or URL (depends on step type) */
  target?: string;
  /** Value to use (text to type, expected value, etc.) */
  value?: string;
  /** Step timeout in milliseconds (overrides test case timeout) */
  timeout?: number;
  /** Whether this step is required (fails test on failure) */
  required: boolean;
  /** Retry count for this specific step */
  retries?: number;
  /** Delay before executing step (in milliseconds) */
  delayBefore?: number;
  /** Delay after executing step (in milliseconds) */
  delayAfter?: number;
  /** Continue execution even if this step fails */
  continueOnFailure?: boolean;
  /** Conditional execution expression */
  condition?: string;
  /** Tags for filtering and organization */
  tags?: string[];
}

/**
 * Navigate step
 */
export interface NavigateStep extends E2EStepBase {
  type: typeof E2EStepType.NAVIGATE;
  /** URL to navigate to */
  target: string;
  options?: NavigateStepOptions;
}

/**
 * Click step
 */
export interface ClickStep extends E2EStepBase {
  type: typeof E2EStepType.CLICK;
  /** Element selector to click */
  target: string;
  options?: ClickStepOptions;
}

/**
 * Type step
 */
export interface TypeStep extends E2EStepBase {
  type: typeof E2EStepType.TYPE;
  /** Element selector to type into */
  target: string;
  /** Text to type */
  value: string;
  options?: TypeStepOptions;
}

/**
 * Wait step
 */
export interface WaitStep extends E2EStepBase {
  type: typeof E2EStepType.WAIT;
  /** Element selector or URL pattern to wait for */
  target?: string;
  /** Duration in milliseconds (for fixed delay) or condition value */
  value?: string;
  options: WaitStepOptions;
}

/**
 * Assert step
 */
export interface AssertStep extends E2EStepBase {
  type: typeof E2EStepType.ASSERT;
  /** Element selector for element assertions */
  target?: string;
  /** Expected value */
  value?: string;
  options: AssertStepOptions;
}

/**
 * Screenshot step
 */
export interface ScreenshotStep extends E2EStepBase {
  type: typeof E2EStepType.SCREENSHOT;
  /** Element selector for element screenshot (optional) */
  target?: string;
  options?: ScreenshotStepOptions;
}

/**
 * Accessibility check step
 */
export interface A11yCheckStep extends E2EStepBase {
  type: typeof E2EStepType.A11Y_CHECK;
  /** Element selector to check (optional, checks full page if not specified) */
  target?: string;
  options?: A11yCheckStepOptions;
}

/**
 * Union type for all E2E steps
 */
export type E2EStep =
  | NavigateStep
  | ClickStep
  | TypeStep
  | WaitStep
  | AssertStep
  | ScreenshotStep
  | A11yCheckStep;

// ============================================================================
// E2E Step Result
// ============================================================================

/**
 * Result of executing an E2E step
 */
export interface E2EStepResult {
  /** ID of the step that was executed */
  stepId: string;
  /** Step type */
  stepType: E2EStepType;
  /** Whether the step executed successfully */
  success: boolean;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Error if step failed */
  error?: {
    /** Error message */
    message: string;
    /** Error code */
    code?: string;
    /** Stack trace */
    stack?: string;
    /** Screenshot at time of failure */
    failureScreenshot?: ScreenshotResult;
  };
  /** Screenshot taken during this step */
  screenshot?: ScreenshotResult;
  /** Accessibility result (for a11y-check steps) */
  accessibilityResult?: AccessibilityResult;
  /** Additional data returned by the step */
  data?: {
    /** Final URL after navigation */
    url?: string;
    /** Page title */
    title?: string;
    /** Element text content */
    elementText?: string;
    /** Element attribute value */
    attributeValue?: string;
    /** Assertion actual value */
    actualValue?: unknown;
    /** Assertion expected value */
    expectedValue?: unknown;
    /** Number of elements found */
    elementCount?: number;
    /** Visual comparison result */
    visualComparison?: {
      matches: boolean;
      differencePercent: number;
      diffImagePath?: string;
    };
  };
  /** Retry information */
  retryInfo?: {
    /** Number of retries attempted */
    attempts: number;
    /** Duration of all retries combined */
    totalDurationMs: number;
  };
  /** Timestamp when step started */
  startedAt: Date;
  /** Timestamp when step completed */
  completedAt: Date;
}

// ============================================================================
// E2E Test Case
// ============================================================================

/**
 * Viewport configuration
 */
export interface Viewport {
  width: number;
  height: number;
  /** Device scale factor (for retina displays) */
  deviceScaleFactor?: number;
  /** Whether viewport supports touch */
  hasTouch?: boolean;
  /** Whether viewport is mobile */
  isMobile?: boolean;
  /** Whether viewport is landscape */
  isLandscape?: boolean;
}

/**
 * Browser context options for the test case
 */
export interface BrowserContextOptions {
  /** User agent string */
  userAgent?: string;
  /** Locale (e.g., 'en-US') */
  locale?: string;
  /** Timezone ID (e.g., 'America/New_York') */
  timezoneId?: string;
  /** Geolocation coordinates */
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  /** Grant permissions */
  permissions?: string[];
  /** Extra HTTP headers */
  extraHTTPHeaders?: Record<string, string>;
  /** Whether to ignore HTTPS errors */
  ignoreHTTPSErrors?: boolean;
  /** Record video of the test */
  recordVideo?: {
    dir: string;
    size?: { width: number; height: number };
  };
  /** Color scheme preference */
  colorScheme?: 'light' | 'dark' | 'no-preference';
  /** Reduced motion preference */
  reducedMotion?: 'reduce' | 'no-preference';
  /** Forced colors preference */
  forcedColors?: 'active' | 'none';
}

/**
 * Hook definitions for test lifecycle
 */
export interface E2ETestHooks {
  /** Run before all steps */
  beforeAll?: E2EStep[];
  /** Run after all steps */
  afterAll?: E2EStep[];
  /** Run before each step */
  beforeEach?: E2EStep[];
  /** Run after each step */
  afterEach?: E2EStep[];
  /** Run on step failure */
  onFailure?: E2EStep[];
}

/**
 * E2E test case definition
 */
export interface E2ETestCase {
  /** Unique test case identifier */
  id: string;
  /** Test case name */
  name: string;
  /** Test case description */
  description: string;
  /** Steps to execute */
  steps: E2EStep[];
  /** Base URL for the test (prepended to relative URLs) */
  baseUrl: string;
  /** Viewport configuration */
  viewport?: Viewport;
  /** Global timeout for all steps in milliseconds */
  timeout?: number;
  /** Number of retries for the entire test case */
  retries?: number;
  /** Browser context options */
  browserContext?: BrowserContextOptions;
  /** Test lifecycle hooks */
  hooks?: E2ETestHooks;
  /** Tags for filtering and organization */
  tags?: string[];
  /** Test priority */
  priority?: 'critical' | 'high' | 'medium' | 'low';
  /** Skip this test */
  skip?: boolean;
  /** Only run this test (useful for debugging) */
  only?: boolean;
  /** Test metadata */
  metadata?: Record<string, unknown>;
  /** Required environment variables */
  requiredEnvVars?: string[];
  /** Test data for parameterized tests */
  testData?: Record<string, unknown>;
}

// ============================================================================
// E2E Test Result
// ============================================================================

/**
 * E2E test execution result
 */
export interface E2ETestResult {
  /** Test case ID */
  testCaseId: string;
  /** Test case name */
  testCaseName: string;
  /** Overall success status */
  success: boolean;
  /** Detailed status */
  status: 'passed' | 'failed' | 'skipped' | 'error' | 'timeout';
  /** Results for each step */
  stepResults: E2EStepResult[];
  /** Total execution duration in milliseconds */
  totalDurationMs: number;
  /** All screenshots taken during the test */
  screenshots?: ScreenshotResult[];
  /** Video recording path (if enabled) */
  videoPath?: string;
  /** Browser console logs */
  consoleLogs?: Array<{
    type: 'log' | 'warning' | 'error' | 'info' | 'debug';
    message: string;
    timestamp: Date;
  }>;
  /** Network requests made during the test */
  networkRequests?: Array<{
    url: string;
    method: string;
    status: number;
    durationMs: number;
    resourceType: string;
  }>;
  /** Execution timestamp */
  startedAt: Date;
  /** Completion timestamp */
  completedAt: Date;
  /** Retry information */
  retryInfo?: {
    attempt: number;
    maxAttempts: number;
    previousFailures: string[];
  };
  /** Browser and viewport info */
  browserInfo?: {
    browserType: 'chromium' | 'firefox' | 'webkit';
    viewport: Viewport;
    userAgent: string;
  };
  /** Aggregated accessibility results */
  accessibilityResults?: AccessibilityResult[];
  /** Error summary (if test failed) */
  errorSummary?: {
    failedStep: string;
    errorMessage: string;
    errorCode?: string;
    screenshot?: ScreenshotResult;
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Generate a unique step ID
 */
function generateStepId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a navigate step
 */
export function createNavigateStep(
  url: string,
  description: string,
  options?: Partial<Omit<NavigateStep, 'type' | 'target'>>
): NavigateStep {
  return {
    id: options?.id ?? generateStepId('nav'),
    type: E2EStepType.NAVIGATE,
    target: url,
    description,
    required: options?.required ?? true,
    timeout: options?.timeout,
    options: options?.options,
    retries: options?.retries,
    delayBefore: options?.delayBefore,
    delayAfter: options?.delayAfter,
    continueOnFailure: options?.continueOnFailure,
    condition: options?.condition,
    tags: options?.tags,
  };
}

/**
 * Create a click step
 */
export function createClickStep(
  selector: string,
  description: string,
  options?: Partial<Omit<ClickStep, 'type' | 'target'>>
): ClickStep {
  return {
    id: options?.id ?? generateStepId('click'),
    type: E2EStepType.CLICK,
    target: selector,
    description,
    required: options?.required ?? true,
    timeout: options?.timeout,
    options: options?.options,
    retries: options?.retries,
    delayBefore: options?.delayBefore,
    delayAfter: options?.delayAfter,
    continueOnFailure: options?.continueOnFailure,
    condition: options?.condition,
    tags: options?.tags,
  };
}

/**
 * Create a type step
 */
export function createTypeStep(
  selector: string,
  text: string,
  description: string,
  options?: Partial<Omit<TypeStep, 'type' | 'target' | 'value'>>
): TypeStep {
  return {
    id: options?.id ?? generateStepId('type'),
    type: E2EStepType.TYPE,
    target: selector,
    value: text,
    description,
    required: options?.required ?? true,
    timeout: options?.timeout,
    options: options?.options,
    retries: options?.retries,
    delayBefore: options?.delayBefore,
    delayAfter: options?.delayAfter,
    continueOnFailure: options?.continueOnFailure,
    condition: options?.condition,
    tags: options?.tags,
  };
}

/**
 * Create a wait step
 */
export function createWaitStep(
  condition: WaitConditionType,
  description: string,
  waitOptions: Omit<WaitStepOptions, 'condition'>,
  options?: Partial<Omit<WaitStep, 'type' | 'options'>>
): WaitStep {
  return {
    id: options?.id ?? generateStepId('wait'),
    type: E2EStepType.WAIT,
    target: options?.target,
    value: options?.value,
    description,
    required: options?.required ?? true,
    timeout: options?.timeout,
    options: {
      condition,
      ...waitOptions,
    },
    retries: options?.retries,
    delayBefore: options?.delayBefore,
    delayAfter: options?.delayAfter,
    continueOnFailure: options?.continueOnFailure,
    condition: options?.condition,
    tags: options?.tags,
  };
}

/**
 * Create an assert step
 */
export function createAssertStep(
  assertion: AssertionType,
  description: string,
  assertOptions: Omit<AssertStepOptions, 'assertion'>,
  options?: Partial<Omit<AssertStep, 'type' | 'options'>>
): AssertStep {
  return {
    id: options?.id ?? generateStepId('assert'),
    type: E2EStepType.ASSERT,
    target: options?.target,
    value: options?.value,
    description,
    required: options?.required ?? true,
    timeout: options?.timeout,
    options: {
      assertion,
      ...assertOptions,
    },
    retries: options?.retries,
    delayBefore: options?.delayBefore,
    delayAfter: options?.delayAfter,
    continueOnFailure: options?.continueOnFailure,
    condition: options?.condition,
    tags: options?.tags,
  };
}

/**
 * Create a screenshot step
 */
export function createScreenshotStep(
  description: string,
  options?: Partial<Omit<ScreenshotStep, 'type'>>
): ScreenshotStep {
  return {
    id: options?.id ?? generateStepId('screenshot'),
    type: E2EStepType.SCREENSHOT,
    target: options?.target,
    description,
    required: options?.required ?? false, // Screenshots are typically non-blocking
    timeout: options?.timeout,
    options: options?.options,
    retries: options?.retries,
    delayBefore: options?.delayBefore,
    delayAfter: options?.delayAfter,
    continueOnFailure: options?.continueOnFailure ?? true,
    condition: options?.condition,
    tags: options?.tags,
  };
}

/**
 * Create an accessibility check step
 */
export function createA11yCheckStep(
  description: string,
  a11yOptions?: A11yCheckStepOptions,
  options?: Partial<Omit<A11yCheckStep, 'type' | 'options'>>
): A11yCheckStep {
  return {
    id: options?.id ?? generateStepId('a11y'),
    type: E2EStepType.A11Y_CHECK,
    target: options?.target,
    description,
    required: options?.required ?? true,
    timeout: options?.timeout ?? 60000, // A11y checks can take longer
    options: a11yOptions,
    retries: options?.retries,
    delayBefore: options?.delayBefore,
    delayAfter: options?.delayAfter,
    continueOnFailure: options?.continueOnFailure,
    condition: options?.condition,
    tags: options?.tags,
  };
}

// ============================================================================
// Test Case Factory
// ============================================================================

/**
 * Create an E2E test case with sensible defaults
 */
export function createE2ETestCase(
  id: string,
  name: string,
  baseUrl: string,
  steps: E2EStep[],
  options?: Partial<Omit<E2ETestCase, 'id' | 'name' | 'baseUrl' | 'steps'>>
): E2ETestCase {
  return {
    id,
    name,
    description: options?.description ?? name,
    steps,
    baseUrl,
    viewport: options?.viewport ?? { width: 1280, height: 720 },
    timeout: options?.timeout ?? 30000,
    retries: options?.retries ?? 0,
    browserContext: options?.browserContext,
    hooks: options?.hooks,
    tags: options?.tags,
    priority: options?.priority ?? 'medium',
    skip: options?.skip ?? false,
    only: options?.only ?? false,
    metadata: options?.metadata,
    requiredEnvVars: options?.requiredEnvVars,
    testData: options?.testData,
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for NavigateStep
 */
export function isNavigateStep(step: E2EStep): step is NavigateStep {
  return step.type === E2EStepType.NAVIGATE;
}

/**
 * Type guard for ClickStep
 */
export function isClickStep(step: E2EStep): step is ClickStep {
  return step.type === E2EStepType.CLICK;
}

/**
 * Type guard for TypeStep
 */
export function isTypeStep(step: E2EStep): step is TypeStep {
  return step.type === E2EStepType.TYPE;
}

/**
 * Type guard for WaitStep
 */
export function isWaitStep(step: E2EStep): step is WaitStep {
  return step.type === E2EStepType.WAIT;
}

/**
 * Type guard for AssertStep
 */
export function isAssertStep(step: E2EStep): step is AssertStep {
  return step.type === E2EStepType.ASSERT;
}

/**
 * Type guard for ScreenshotStep
 */
export function isScreenshotStep(step: E2EStep): step is ScreenshotStep {
  return step.type === E2EStepType.SCREENSHOT;
}

/**
 * Type guard for A11yCheckStep
 */
export function isA11yCheckStep(step: E2EStep): step is A11yCheckStep {
  return step.type === E2EStepType.A11Y_CHECK;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract step type from E2EStep
 */
export type ExtractStepType<T extends E2EStep> = T['type'];

/**
 * Get options type for a specific step type
 */
export type StepOptionsFor<T extends E2EStepType> = T extends typeof E2EStepType.NAVIGATE
  ? NavigateStepOptions
  : T extends typeof E2EStepType.CLICK
    ? ClickStepOptions
    : T extends typeof E2EStepType.TYPE
      ? TypeStepOptions
      : T extends typeof E2EStepType.WAIT
        ? WaitStepOptions
        : T extends typeof E2EStepType.ASSERT
          ? AssertStepOptions
          : T extends typeof E2EStepType.SCREENSHOT
            ? ScreenshotStepOptions
            : T extends typeof E2EStepType.A11Y_CHECK
              ? A11yCheckStepOptions
              : never;

/**
 * Step builder type for fluent API support
 */
export interface E2EStepBuilder {
  navigate(url: string, description: string): NavigateStep;
  click(selector: string, description: string): ClickStep;
  type(selector: string, text: string, description: string): TypeStep;
  wait(condition: WaitConditionType, description: string): WaitStep;
  assert(assertion: AssertionType, description: string): AssertStep;
  screenshot(description: string): ScreenshotStep;
  a11yCheck(description: string): A11yCheckStep;
}

/**
 * Serializable version of E2ETestCase for persistence
 */
export interface SerializableE2ETestCase extends Omit<E2ETestCase, 'hooks'> {
  hooks?: {
    beforeAll?: E2EStep[];
    afterAll?: E2EStep[];
    beforeEach?: E2EStep[];
    afterEach?: E2EStep[];
    onFailure?: E2EStep[];
  };
}

/**
 * E2E test suite containing multiple test cases
 */
export interface E2ETestSuite {
  /** Suite identifier */
  id: string;
  /** Suite name */
  name: string;
  /** Suite description */
  description: string;
  /** Test cases in this suite */
  testCases: E2ETestCase[];
  /** Suite-level hooks */
  hooks?: E2ETestHooks;
  /** Suite-level browser context options */
  browserContext?: BrowserContextOptions;
  /** Suite tags */
  tags?: string[];
  /** Run tests in parallel */
  parallel?: boolean;
  /** Maximum parallel workers */
  maxWorkers?: number;
}

/**
 * E2E test suite execution result
 */
export interface E2ETestSuiteResult {
  /** Suite ID */
  suiteId: string;
  /** Suite name */
  suiteName: string;
  /** Overall success */
  success: boolean;
  /** Results for each test case */
  testResults: E2ETestResult[];
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    totalDurationMs: number;
  };
  /** Execution timestamp */
  startedAt: Date;
  /** Completion timestamp */
  completedAt: Date;
}
