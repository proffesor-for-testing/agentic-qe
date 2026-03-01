/**
 * Agentic QE v3 - User Flow Template Types
 *
 * Defines flow template types for common user journeys that can be
 * recorded and converted to E2E test steps via Vibium browser automation.
 *
 * @module test-execution/types/flow-templates
 */

import type { E2EStep, Viewport, BrowserContextOptions } from './e2e-step.types';

// ============================================================================
// Flow Template Base Types
// ============================================================================

/**
 * Flow template category for organization
 */
export const FlowCategory = {
  AUTHENTICATION: 'authentication',
  ECOMMERCE: 'ecommerce',
  FORM: 'form',
  NAVIGATION: 'navigation',
  SEARCH: 'search',
  USER_MANAGEMENT: 'user-management',
  CONTENT: 'content',
  CUSTOM: 'custom',
} as const;

export type FlowCategory = (typeof FlowCategory)[keyof typeof FlowCategory];

/**
 * Flow status during recording
 */
export const FlowStatus = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export type FlowStatus = (typeof FlowStatus)[keyof typeof FlowStatus];

/**
 * Recorded action type from browser interactions
 */
export const RecordedActionType = {
  NAVIGATE: 'navigate',
  CLICK: 'click',
  TYPE: 'type',
  HOVER: 'hover',
  SCROLL: 'scroll',
  SELECT: 'select',
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  DRAG_DROP: 'drag-drop',
  KEYBOARD: 'keyboard',
  ASSERTION: 'assertion',
} as const;

export type RecordedActionType = (typeof RecordedActionType)[keyof typeof RecordedActionType];

/**
 * Base recorded action from browser
 */
export interface RecordedAction {
  /** Unique action identifier */
  id: string;
  /** Action type */
  type: RecordedActionType;
  /** Timestamp when action occurred */
  timestamp: Date;
  /** Element selector (if applicable) */
  selector?: string;
  /** Target URL (for navigation) */
  url?: string;
  /** Input value (for type actions) */
  value?: string;
  /** Page URL where action occurred */
  pageUrl: string;
  /** Page title where action occurred */
  pageTitle: string;
  /** Screenshot at time of action (base64) */
  screenshot?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Navigate action
 */
export interface NavigateAction extends RecordedAction {
  type: typeof RecordedActionType.NAVIGATE;
  url: string;
  /** Final URL after redirects */
  finalUrl?: string;
  /** Navigation duration in ms */
  durationMs?: number;
}

/**
 * Click action
 */
export interface ClickAction extends RecordedAction {
  type: typeof RecordedActionType.CLICK;
  selector: string;
  /** Button clicked */
  button?: 'left' | 'right' | 'middle';
  /** Click coordinates relative to element */
  position?: { x: number; y: number };
  /** Modifiers held during click */
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
}

/**
 * Type/input action
 */
export interface TypeAction extends RecordedAction {
  type: typeof RecordedActionType.TYPE;
  selector: string;
  value: string;
  /** Whether field was cleared before typing */
  cleared?: boolean;
  /** Whether this is a sensitive field (password, etc.) */
  sensitive?: boolean;
}

/**
 * Hover action
 */
export interface HoverAction extends RecordedAction {
  type: typeof RecordedActionType.HOVER;
  selector: string;
}

/**
 * Scroll action
 */
export interface ScrollAction extends RecordedAction {
  type: typeof RecordedActionType.SCROLL;
  /** Scroll target (element or page) */
  target: 'page' | 'element';
  selector?: string;
  /** Scroll delta */
  delta: { x: number; y: number };
  /** Final scroll position */
  position: { x: number; y: number };
}

/**
 * Select action (dropdown/select element)
 */
export interface SelectAction extends RecordedAction {
  type: typeof RecordedActionType.SELECT;
  selector: string;
  value: string;
  /** Selected option text */
  optionText?: string;
  /** Multi-select values */
  values?: string[];
}

/**
 * File upload action
 */
export interface UploadAction extends RecordedAction {
  type: typeof RecordedActionType.UPLOAD;
  selector: string;
  /** File names (not paths for security) */
  fileNames: string[];
  /** File types */
  fileTypes: string[];
}

/**
 * File download action
 */
export interface DownloadAction extends RecordedAction {
  type: typeof RecordedActionType.DOWNLOAD;
  /** Downloaded file name */
  fileName: string;
  /** File size in bytes */
  fileSize?: number;
  /** Download URL */
  downloadUrl: string;
}

/**
 * Drag and drop action
 */
export interface DragDropAction extends RecordedAction {
  type: typeof RecordedActionType.DRAG_DROP;
  /** Source element selector */
  sourceSelector: string;
  /** Target element selector */
  targetSelector: string;
}

/**
 * Keyboard action (special keys)
 */
export interface KeyboardAction extends RecordedAction {
  type: typeof RecordedActionType.KEYBOARD;
  /** Key or key combination */
  key: string;
  /** Modifiers held */
  modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
}

/**
 * Assertion action (user-added verification)
 */
export interface AssertionAction extends RecordedAction {
  type: typeof RecordedActionType.ASSERTION;
  /** Assertion type */
  assertionType:
    | 'element-exists'
    | 'element-visible'
    | 'element-text'
    | 'element-value'
    | 'url-equals'
    | 'url-contains'
    | 'title-equals'
    | 'title-contains';
  /** Target selector */
  selector?: string;
  /** Expected value */
  expected?: string;
}

/**
 * Union type for all recorded actions
 */
export type AnyRecordedAction =
  | NavigateAction
  | ClickAction
  | TypeAction
  | HoverAction
  | ScrollAction
  | SelectAction
  | UploadAction
  | DownloadAction
  | DragDropAction
  | KeyboardAction
  | AssertionAction;

// ============================================================================
// Flow Template Interfaces
// ============================================================================

/**
 * Base flow template interface
 */
export interface FlowTemplateBase {
  /** Template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Flow category */
  category: FlowCategory;
  /** Base URL for the flow */
  baseUrl: string;
  /** Tags for organization */
  tags?: string[];
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modified timestamp */
  updatedAt: Date;
}

/**
 * Login flow template
 */
export interface LoginFlowTemplate extends FlowTemplateBase {
  category: typeof FlowCategory.AUTHENTICATION;
  /** Username field selector */
  usernameSelector: string;
  /** Password field selector */
  passwordSelector: string;
  /** Submit button selector */
  submitSelector: string;
  /** URL to navigate to for login */
  loginUrl: string;
  /** Expected URL after successful login */
  successUrl?: string;
  /** Success indicator selector (element that appears after login) */
  successIndicator?: string;
  /** Error message selector */
  errorSelector?: string;
  /** Remember me checkbox selector */
  rememberMeSelector?: string;
  /** Two-factor authentication support */
  twoFactorEnabled?: boolean;
  /** 2FA input selector */
  twoFactorSelector?: string;
  /** Social login buttons */
  socialLogins?: Array<{
    provider: string;
    selector: string;
  }>;
}

/**
 * Checkout flow template
 */
export interface CheckoutFlowTemplate extends FlowTemplateBase {
  category: typeof FlowCategory.ECOMMERCE;
  /** Cart page URL */
  cartUrl: string;
  /** Checkout page URL */
  checkoutUrl: string;
  /** Shipping form selectors */
  shippingForm: {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    phone?: string;
    email?: string;
  };
  /** Billing form selectors (if different from shipping) */
  billingForm?: {
    sameAsShipping?: string;
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  /** Payment form selectors */
  paymentForm: {
    cardNumber?: string;
    cardExpiry?: string;
    cardCvc?: string;
    cardName?: string;
    paymentMethod?: string;
  };
  /** Proceed to checkout button selector */
  proceedButton: string;
  /** Place order button selector */
  placeOrderButton: string;
  /** Order confirmation indicator */
  confirmationIndicator?: string;
  /** Order number element selector */
  orderNumberSelector?: string;
  /** Coupon/promo code input selector */
  couponSelector?: string;
  /** Apply coupon button selector */
  applyCouponSelector?: string;
}

/**
 * Form submission flow template
 */
export interface FormSubmissionFlowTemplate extends FlowTemplateBase {
  category: typeof FlowCategory.FORM;
  /** Form page URL */
  formUrl: string;
  /** Form fields with their selectors and types */
  fields: Array<{
    name: string;
    selector: string;
    type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file';
    required?: boolean;
    validation?: string;
    placeholder?: string;
  }>;
  /** Submit button selector */
  submitSelector: string;
  /** Success indicator after submission */
  successIndicator?: string;
  /** Success message selector */
  successMessageSelector?: string;
  /** Error message selector */
  errorSelector?: string;
  /** Validation error selectors */
  fieldErrorSelectors?: Record<string, string>;
  /** Form reset button selector */
  resetSelector?: string;
  /** Cancel button selector */
  cancelSelector?: string;
}

/**
 * Search flow template
 */
export interface SearchFlowTemplate extends FlowTemplateBase {
  category: typeof FlowCategory.SEARCH;
  /** Search input selector */
  searchInputSelector: string;
  /** Search button selector (if any) */
  searchButtonSelector?: string;
  /** Search page URL */
  searchUrl: string;
  /** Results container selector */
  resultsContainerSelector: string;
  /** Individual result item selector */
  resultItemSelector: string;
  /** No results message selector */
  noResultsSelector?: string;
  /** Pagination selectors */
  pagination?: {
    nextButton?: string;
    prevButton?: string;
    pageNumber?: string;
  };
  /** Filter selectors */
  filters?: Array<{
    name: string;
    selector: string;
    type: 'checkbox' | 'radio' | 'select' | 'range';
  }>;
  /** Sort selector */
  sortSelector?: string;
  /** Search suggestions selector */
  suggestionsSelector?: string;
  /** Auto-complete delay in ms */
  autocompleteDelay?: number;
}

/**
 * Navigation flow template
 */
export interface NavigationFlowTemplate extends FlowTemplateBase {
  category: typeof FlowCategory.NAVIGATION;
  /** Starting URL */
  startUrl: string;
  /** Navigation waypoints */
  waypoints: Array<{
    name: string;
    url: string;
    selector?: string;
    description?: string;
    waitFor?: string;
  }>;
  /** Main navigation selector */
  mainNavSelector?: string;
  /** Breadcrumb selector */
  breadcrumbSelector?: string;
  /** Footer navigation selector */
  footerNavSelector?: string;
  /** Mobile menu toggle selector */
  mobileMenuToggle?: string;
  /** Expected final URL */
  expectedFinalUrl?: string;
}

/**
 * Union type for all flow templates
 */
export type FlowTemplate =
  | LoginFlowTemplate
  | CheckoutFlowTemplate
  | FormSubmissionFlowTemplate
  | SearchFlowTemplate
  | NavigationFlowTemplate;

// ============================================================================
// Recording Session Types
// ============================================================================

/**
 * Recording session configuration
 */
export interface RecordingConfig {
  /** Capture screenshots for each action */
  captureScreenshots: boolean;
  /** Screenshot quality (1-100) */
  screenshotQuality?: number;
  /** Ignore certain selectors from recording */
  ignoreSelectors?: string[];
  /** Only record actions matching these selectors */
  includeSelectors?: string[];
  /** Auto-generate assertions for page loads */
  autoAssertPageLoads: boolean;
  /** Auto-generate assertions for navigation */
  autoAssertNavigation: boolean;
  /** Debounce time for type events (ms) */
  typeDebounceMs: number;
  /** Include scroll events */
  recordScrolls: boolean;
  /** Include hover events */
  recordHovers: boolean;
  /** Viewport for recording */
  viewport?: Viewport;
  /** Browser context options */
  browserContext?: BrowserContextOptions;
}

/**
 * Default recording configuration
 */
export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  captureScreenshots: true,
  screenshotQuality: 80,
  autoAssertPageLoads: true,
  autoAssertNavigation: true,
  typeDebounceMs: 300,
  recordScrolls: false,
  recordHovers: false,
};

/**
 * Recording session state
 */
export interface RecordingSession {
  /** Session ID */
  id: string;
  /** Session status */
  status: FlowStatus;
  /** Session name */
  name: string;
  /** Recording configuration */
  config: RecordingConfig;
  /** Start timestamp */
  startedAt?: Date;
  /** End timestamp */
  endedAt?: Date;
  /** Base URL */
  baseUrl: string;
  /** Recorded actions */
  actions: AnyRecordedAction[];
  /** Current page URL */
  currentUrl?: string;
  /** Current page title */
  currentTitle?: string;
  /** Error if status is error */
  error?: string;
}

// ============================================================================
// Generated Flow Types
// ============================================================================

/**
 * Generated user flow from recording
 */
export interface UserFlow {
  /** Flow ID */
  id: string;
  /** Flow name */
  name: string;
  /** Flow description */
  description: string;
  /** Flow category */
  category: FlowCategory;
  /** Base URL */
  baseUrl: string;
  /** Generated E2E steps */
  steps: E2EStep[];
  /** Original recorded actions */
  recordedActions: AnyRecordedAction[];
  /** Flow tags */
  tags?: string[];
  /** Viewport used during recording */
  viewport?: Viewport;
  /** Browser context options */
  browserContext?: BrowserContextOptions;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modified timestamp */
  updatedAt: Date;
  /** Template ID if created from template */
  templateId?: string;
  /** Recording session ID */
  sessionId?: string;
}

/**
 * Code generation options
 */
export interface CodeGenerationOptions {
  /** Target language/framework */
  framework: 'playwright' | 'cypress' | 'puppeteer' | 'webdriverio' | 'testcafe';
  /** Programming language */
  language: 'typescript' | 'javascript';
  /** Include comments */
  includeComments: boolean;
  /** Include assertions */
  includeAssertions: boolean;
  /** Use page object pattern */
  usePageObjects: boolean;
  /** Generate data-testid selectors */
  preferTestIds: boolean;
  /** Timeout for actions (ms) */
  defaultTimeout: number;
  /** Include error handling */
  includeErrorHandling: boolean;
  /** Test file name */
  fileName?: string;
  /** Test description */
  testDescription?: string;
}

/**
 * Default code generation options
 */
export const DEFAULT_CODE_GENERATION_OPTIONS: CodeGenerationOptions = {
  framework: 'playwright',
  language: 'typescript',
  includeComments: true,
  includeAssertions: true,
  usePageObjects: false,
  preferTestIds: true,
  defaultTimeout: 30000,
  includeErrorHandling: true,
};

/**
 * Generated test code result
 */
export interface GeneratedTestCode {
  /** Generated code */
  code: string;
  /** File name */
  fileName: string;
  /** Framework used */
  framework: string;
  /** Language used */
  language: 'typescript' | 'javascript';
  /** Number of steps */
  stepCount: number;
  /** Number of assertions */
  assertionCount: number;
  /** Generation timestamp */
  generatedAt: Date;
  /** Page object code (if usePageObjects is true) */
  pageObjectCode?: string;
  /** Page object file name */
  pageObjectFileName?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if action is a navigate action
 */
export function isNavigateAction(action: RecordedAction): action is NavigateAction {
  return action.type === RecordedActionType.NAVIGATE;
}

/**
 * Check if action is a click action
 */
export function isClickAction(action: RecordedAction): action is ClickAction {
  return action.type === RecordedActionType.CLICK;
}

/**
 * Check if action is a type action
 */
export function isTypeAction(action: RecordedAction): action is TypeAction {
  return action.type === RecordedActionType.TYPE;
}

/**
 * Check if action is an assertion action
 */
export function isAssertionAction(action: RecordedAction): action is AssertionAction {
  return action.type === RecordedActionType.ASSERTION;
}

/**
 * Check if template is a login template
 */
export function isLoginFlowTemplate(template: FlowTemplate): template is LoginFlowTemplate {
  return template.category === FlowCategory.AUTHENTICATION;
}

/**
 * Check if template is a checkout template
 */
export function isCheckoutFlowTemplate(template: FlowTemplate): template is CheckoutFlowTemplate {
  return template.category === FlowCategory.ECOMMERCE;
}

/**
 * Check if template is a form submission template
 */
export function isFormSubmissionFlowTemplate(
  template: FlowTemplate
): template is FormSubmissionFlowTemplate {
  return template.category === FlowCategory.FORM;
}

/**
 * Check if template is a search template
 */
export function isSearchFlowTemplate(template: FlowTemplate): template is SearchFlowTemplate {
  return template.category === FlowCategory.SEARCH;
}

/**
 * Check if template is a navigation template
 */
export function isNavigationFlowTemplate(
  template: FlowTemplate
): template is NavigationFlowTemplate {
  return template.category === FlowCategory.NAVIGATION;
}
