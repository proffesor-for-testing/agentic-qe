/**
 * Agentic QE v3 - axe-core Integration Module
 *
 * Provides integration with axe-core accessibility testing engine via Vibium browser automation.
 * This module handles:
 * - Injecting axe-core script into browser pages
 * - Running accessibility audits with configurable options
 * - Parsing and transforming axe-core results to our domain types
 * - WCAG tag mapping (wcag2a, wcag21aa, etc. to our WCAGCriterion format)
 *
 * @module domains/visual-accessibility/services/axe-core-integration
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type {
  AccessibilityReport,
  AccessibilityViolation,
  ViolationNode,
  WCAGCriterion,
  PassedRule,
  IncompleteCheck,
} from '../interfaces.js';
import type { VibiumClient } from '../../../integrations/vibium/index.js';

// ============================================================================
// axe-core Type Definitions
// ============================================================================

/**
 * axe-core audit options
 * @see https://www.deque.com/axe/core-documentation/api-documentation/#options-parameter
 */
export interface AxeOptions {
  /** Run only specific rules or tags */
  runOnly?: {
    type: 'tag' | 'rule';
    values: string[];
  };
  /** Rules to enable/disable */
  rules?: Record<string, { enabled: boolean }>;
  /** Reporter type */
  reporter?: 'v1' | 'v2' | 'raw' | 'rawEnv' | 'no-passes';
  /** Result types to include */
  resultTypes?: ('violations' | 'passes' | 'incomplete' | 'inapplicable')[];
  /** Element selectors to include in analysis */
  include?: string[] | string[][];
  /** Element selectors to exclude from analysis */
  exclude?: string[] | string[][];
  /** Absolute paths for frame testing */
  absolutePaths?: boolean;
  /** Enable iframe testing */
  iframes?: boolean;
  /** Limit elements to check per rule */
  elementRef?: boolean;
  /** Frame selector for targeted testing */
  frameSelector?: string;
  /** Preload external CSS */
  preload?: boolean;
  /** Performance timing options */
  performanceTimer?: boolean;
}

/**
 * axe-core result structure returned from axe.run()
 */
export interface AxeResults {
  /** Violations found during audit */
  violations: AxeViolation[];
  /** Rules that passed */
  passes: AxePass[];
  /** Rules requiring manual review */
  incomplete: AxeIncomplete[];
  /** Rules that did not apply */
  inapplicable: AxeInapplicable[];
  /** Timestamp of the audit */
  timestamp: string;
  /** URL that was audited */
  url: string;
  /** Test environment information */
  testEnvironment: AxeTestEnvironment;
  /** Test runner information */
  testRunner: AxeTestRunner;
  /** Tool options used */
  toolOptions: AxeToolOptions;
}

/**
 * axe-core violation structure
 */
export interface AxeViolation {
  /** Rule ID (e.g., 'color-contrast', 'image-alt') */
  id: string;
  /** Impact level */
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  /** WCAG tags (e.g., ['wcag2a', 'wcag21aa']) */
  tags: string[];
  /** Human-readable description */
  description: string;
  /** Short help text */
  help: string;
  /** URL to more information */
  helpUrl: string;
  /** Affected nodes */
  nodes: AxeNode[];
}

/**
 * axe-core passed rule structure
 */
export interface AxePass {
  /** Rule ID */
  id: string;
  /** Impact level (null for passes) */
  impact: null;
  /** WCAG tags */
  tags: string[];
  /** Human-readable description */
  description: string;
  /** Short help text */
  help: string;
  /** URL to more information */
  helpUrl: string;
  /** Passing nodes */
  nodes: AxeNode[];
}

/**
 * axe-core incomplete check structure
 */
export interface AxeIncomplete {
  /** Rule ID */
  id: string;
  /** Impact level */
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  /** WCAG tags */
  tags: string[];
  /** Human-readable description */
  description: string;
  /** Short help text */
  help: string;
  /** URL to more information */
  helpUrl: string;
  /** Nodes requiring manual review */
  nodes: AxeNode[];
}

/**
 * axe-core inapplicable rule structure
 */
export interface AxeInapplicable {
  /** Rule ID */
  id: string;
  /** Impact level (null for inapplicable) */
  impact: null;
  /** WCAG tags */
  tags: string[];
  /** Human-readable description */
  description: string;
  /** Short help text */
  help: string;
  /** URL to more information */
  helpUrl: string;
  /** Empty nodes array */
  nodes: [];
}

/**
 * axe-core node (element) information
 */
export interface AxeNode {
  /** HTML of the element */
  html: string;
  /** Impact at node level */
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  /** CSS selectors to locate the element */
  target: string[];
  /** XPath selectors (optional) */
  xpath?: string[];
  /** Ancestry path */
  ancestry?: string[];
  /** Failure summary explaining the issue */
  failureSummary?: string;
  /** Checks that passed */
  any: AxeCheck[];
  /** Checks that all must pass */
  all: AxeCheck[];
  /** Checks that none should pass */
  none: AxeCheck[];
}

/**
 * axe-core individual check result
 */
export interface AxeCheck {
  /** Check ID */
  id: string;
  /** Check impact */
  impact: string;
  /** Check message */
  message: string;
  /** Related nodes */
  relatedNodes?: AxeRelatedNode[];
  /** Check data */
  data?: unknown;
}

/**
 * axe-core related node information
 */
export interface AxeRelatedNode {
  /** HTML of the related element */
  html: string;
  /** CSS selectors */
  target: string[];
}

/**
 * axe-core test environment info
 */
export interface AxeTestEnvironment {
  /** User agent string */
  userAgent: string;
  /** Window width */
  windowWidth: number;
  /** Window height */
  windowHeight: number;
  /** Orientation angle */
  orientationAngle: number;
  /** Orientation type */
  orientationType: string;
}

/**
 * axe-core test runner info
 */
export interface AxeTestRunner {
  /** Runner name */
  name: string;
}

/**
 * axe-core tool options used
 */
export interface AxeToolOptions {
  /** Reporter used */
  reporter?: string;
}

// ============================================================================
// WCAG Tag Mapping
// ============================================================================

/**
 * WCAG 2.x level definitions
 * Maps axe-core tags to our WCAGCriterion format
 */
export const WCAG_TAG_MAP: Record<string, { level: 'A' | 'AA' | 'AAA'; version: string }> = {
  // WCAG 2.0 Level A
  'wcag2a': { level: 'A', version: '2.0' },
  'wcag20': { level: 'A', version: '2.0' },
  // WCAG 2.0 Level AA
  'wcag2aa': { level: 'AA', version: '2.0' },
  // WCAG 2.0 Level AAA
  'wcag2aaa': { level: 'AAA', version: '2.0' },
  // WCAG 2.1 Level A
  'wcag21a': { level: 'A', version: '2.1' },
  // WCAG 2.1 Level AA
  'wcag21aa': { level: 'AA', version: '2.1' },
  // WCAG 2.1 Level AAA
  'wcag21aaa': { level: 'AAA', version: '2.1' },
  // WCAG 2.2 Level A
  'wcag22a': { level: 'A', version: '2.2' },
  // WCAG 2.2 Level AA
  'wcag22aa': { level: 'AA', version: '2.2' },
  // WCAG 2.2 Level AAA
  'wcag22aaa': { level: 'AAA', version: '2.2' },
};

/**
 * WCAG Success Criterion mapping from axe-core rule tags
 * Maps common axe rule IDs to WCAG success criteria
 */
export const WCAG_CRITERIA_MAP: Record<string, WCAGCriterion> = {
  // Perceivable
  'wcag111': { id: '1.1.1', level: 'A', title: 'Non-text Content' },
  'wcag121': { id: '1.2.1', level: 'A', title: 'Audio-only and Video-only (Prerecorded)' },
  'wcag122': { id: '1.2.2', level: 'A', title: 'Captions (Prerecorded)' },
  'wcag123': { id: '1.2.3', level: 'A', title: 'Audio Description or Media Alternative (Prerecorded)' },
  'wcag124': { id: '1.2.4', level: 'AA', title: 'Captions (Live)' },
  'wcag125': { id: '1.2.5', level: 'AA', title: 'Audio Description (Prerecorded)' },
  'wcag131': { id: '1.3.1', level: 'A', title: 'Info and Relationships' },
  'wcag132': { id: '1.3.2', level: 'A', title: 'Meaningful Sequence' },
  'wcag133': { id: '1.3.3', level: 'A', title: 'Sensory Characteristics' },
  'wcag134': { id: '1.3.4', level: 'AA', title: 'Orientation' },
  'wcag135': { id: '1.3.5', level: 'AA', title: 'Identify Input Purpose' },
  'wcag141': { id: '1.4.1', level: 'A', title: 'Use of Color' },
  'wcag142': { id: '1.4.2', level: 'A', title: 'Audio Control' },
  'wcag143': { id: '1.4.3', level: 'AA', title: 'Contrast (Minimum)' },
  'wcag144': { id: '1.4.4', level: 'AA', title: 'Resize Text' },
  'wcag145': { id: '1.4.5', level: 'AA', title: 'Images of Text' },
  'wcag146': { id: '1.4.6', level: 'AAA', title: 'Contrast (Enhanced)' },
  'wcag1410': { id: '1.4.10', level: 'AA', title: 'Reflow' },
  'wcag1411': { id: '1.4.11', level: 'AA', title: 'Non-text Contrast' },
  'wcag1412': { id: '1.4.12', level: 'AA', title: 'Text Spacing' },
  'wcag1413': { id: '1.4.13', level: 'AA', title: 'Content on Hover or Focus' },
  // Operable
  'wcag211': { id: '2.1.1', level: 'A', title: 'Keyboard' },
  'wcag212': { id: '2.1.2', level: 'A', title: 'No Keyboard Trap' },
  'wcag214': { id: '2.1.4', level: 'A', title: 'Character Key Shortcuts' },
  'wcag221': { id: '2.2.1', level: 'A', title: 'Timing Adjustable' },
  'wcag222': { id: '2.2.2', level: 'A', title: 'Pause, Stop, Hide' },
  'wcag231': { id: '2.3.1', level: 'A', title: 'Three Flashes or Below Threshold' },
  'wcag241': { id: '2.4.1', level: 'A', title: 'Bypass Blocks' },
  'wcag242': { id: '2.4.2', level: 'A', title: 'Page Titled' },
  'wcag243': { id: '2.4.3', level: 'A', title: 'Focus Order' },
  'wcag244': { id: '2.4.4', level: 'A', title: 'Link Purpose (In Context)' },
  'wcag245': { id: '2.4.5', level: 'AA', title: 'Multiple Ways' },
  'wcag246': { id: '2.4.6', level: 'AA', title: 'Headings and Labels' },
  'wcag247': { id: '2.4.7', level: 'AA', title: 'Focus Visible' },
  'wcag2411': { id: '2.4.11', level: 'AA', title: 'Focus Not Obscured (Minimum)' },
  'wcag251': { id: '2.5.1', level: 'A', title: 'Pointer Gestures' },
  'wcag252': { id: '2.5.2', level: 'A', title: 'Pointer Cancellation' },
  'wcag253': { id: '2.5.3', level: 'A', title: 'Label in Name' },
  'wcag254': { id: '2.5.4', level: 'A', title: 'Motion Actuation' },
  'wcag258': { id: '2.5.8', level: 'AA', title: 'Target Size (Minimum)' },
  // Understandable
  'wcag311': { id: '3.1.1', level: 'A', title: 'Language of Page' },
  'wcag312': { id: '3.1.2', level: 'AA', title: 'Language of Parts' },
  'wcag321': { id: '3.2.1', level: 'A', title: 'On Focus' },
  'wcag322': { id: '3.2.2', level: 'A', title: 'On Input' },
  'wcag323': { id: '3.2.3', level: 'AA', title: 'Consistent Navigation' },
  'wcag324': { id: '3.2.4', level: 'AA', title: 'Consistent Identification' },
  'wcag326': { id: '3.2.6', level: 'A', title: 'Consistent Help' },
  'wcag331': { id: '3.3.1', level: 'A', title: 'Error Identification' },
  'wcag332': { id: '3.3.2', level: 'A', title: 'Labels or Instructions' },
  'wcag333': { id: '3.3.3', level: 'AA', title: 'Error Suggestion' },
  'wcag334': { id: '3.3.4', level: 'AA', title: 'Error Prevention (Legal, Financial, Data)' },
  'wcag337': { id: '3.3.7', level: 'A', title: 'Redundant Entry' },
  'wcag338': { id: '3.3.8', level: 'AA', title: 'Accessible Authentication (Minimum)' },
  // Robust
  'wcag411': { id: '4.1.1', level: 'A', title: 'Parsing' },
  'wcag412': { id: '4.1.2', level: 'A', title: 'Name, Role, Value' },
  'wcag413': { id: '4.1.3', level: 'AA', title: 'Status Messages' },
};

/**
 * Map axe-core rule ID to fix suggestions
 */
export const FIX_SUGGESTIONS: Record<string, string> = {
  'area-alt': 'Add an alt attribute to all area elements within image maps',
  'aria-allowed-attr': 'Ensure ARIA attributes used are allowed for the element role',
  'aria-allowed-role': 'Ensure the role attribute is appropriate for the element',
  'aria-hidden-body': 'Ensure aria-hidden is not applied to the document body',
  'aria-hidden-focus': 'Ensure aria-hidden elements do not contain focusable elements',
  'aria-required-attr': 'Add all required ARIA attributes for the given role',
  'aria-required-children': 'Ensure elements with ARIA roles have required child elements',
  'aria-required-parent': 'Ensure elements with ARIA roles are contained in required parent elements',
  'aria-roles': 'Use valid ARIA role values',
  'aria-valid-attr': 'Ensure ARIA attributes are spelled correctly',
  'aria-valid-attr-value': 'Ensure ARIA attributes have valid values',
  'audio-caption': 'Add captions to audio elements',
  'blink': 'Do not use the blink element',
  'button-name': 'Add accessible text to buttons using inner text, aria-label, or aria-labelledby',
  'bypass': 'Add a skip link or ARIA landmarks to bypass repeated content',
  'color-contrast': 'Ensure text color has sufficient contrast against the background (4.5:1 for normal text, 3:1 for large text)',
  'definition-list': 'Ensure dl elements contain properly ordered dt and dd elements',
  'dlitem': 'Ensure dt and dd elements are contained in dl elements',
  'document-title': 'Add a non-empty title element to the document head',
  'duplicate-id': 'Ensure all id attributes are unique',
  'duplicate-id-active': 'Ensure all id attributes of active elements are unique',
  'duplicate-id-aria': 'Ensure all IDs used in ARIA attributes are unique',
  'form-field-multiple-labels': 'Ensure form fields have at most one label',
  'frame-title': 'Add a title attribute to iframe and frame elements',
  'html-has-lang': 'Add a lang attribute to the html element',
  'html-lang-valid': 'Use a valid lang attribute value on the html element',
  'image-alt': 'Add alternative text to images using the alt attribute',
  'input-button-name': 'Add accessible text to input buttons using value, aria-label, or aria-labelledby',
  'input-image-alt': 'Add alternative text to image inputs using the alt attribute',
  'label': 'Associate form inputs with labels using for/id or aria-label/aria-labelledby',
  'label-title-only': 'Ensure form elements have visible labels, not just title attributes',
  'landmark-one-main': 'Add exactly one main landmark to the page',
  'link-name': 'Add accessible text to links using inner text, aria-label, or aria-labelledby',
  'list': 'Ensure lists use proper markup (ul, ol with li children)',
  'listitem': 'Ensure li elements are contained in ul or ol',
  'marquee': 'Do not use the marquee element',
  'meta-refresh': 'Do not use meta refresh to redirect pages',
  'meta-viewport': 'Ensure meta viewport allows user scaling (no maximum-scale or user-scalable=no)',
  'object-alt': 'Add alternative text to object elements',
  'p-as-heading': 'Use proper heading elements (h1-h6) instead of styled paragraphs',
  'region': 'Ensure all content is contained within landmarks',
  'scope-attr-valid': 'Use scope attribute correctly on table headers',
  'scrollable-region-focusable': 'Ensure scrollable regions are keyboard accessible',
  'server-side-image-map': 'Avoid server-side image maps or provide text alternatives',
  'skip-link': 'Ensure skip links are focusable and visible on focus',
  'svg-img-alt': 'Add alternative text to SVG images using title or aria-label',
  'tabindex': 'Avoid positive tabindex values to maintain natural tab order',
  'table-duplicate-name': 'Ensure tables have unique captions or summaries',
  'td-headers-attr': 'Use headers attribute to associate data cells with headers in complex tables',
  'th-has-data-cells': 'Ensure table headers are associated with data cells',
  'valid-lang': 'Use valid lang attribute values',
  'video-caption': 'Add captions to video elements',
};

// ============================================================================
// axe-core CDN URL
// ============================================================================

/**
 * axe-core CDN URL for injection
 * Using the official axe-core CDN
 */
export const AXE_CORE_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.4/axe.min.js';

/**
 * Minified axe-core script for injection
 * This is a placeholder - in production, use the CDN or bundle axe-core
 */
const AXE_CORE_INJECTION_CHECK = `
  if (typeof axe === 'undefined') {
    throw new Error('axe-core not loaded');
  }
`;

// ============================================================================
// Integration Functions
// ============================================================================

/**
 * Error thrown when axe-core injection fails
 */
export class AxeCoreInjectionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'AxeCoreInjectionError';
  }
}

/**
 * Error thrown when axe-core audit fails
 */
export class AxeCoreAuditError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'AxeCoreAuditError';
  }
}

/**
 * Inject axe-core script into the current page
 *
 * Uses Vibium's evaluate function to load axe-core from CDN or inject
 * the minified script directly if CDN is blocked.
 *
 * @param client - VibiumClient with active browser session
 * @param options - Injection options
 * @returns Result indicating success or failure
 *
 * @example
 * ```typescript
 * const client = await createVibiumClient({ enabled: true });
 * await client.launch();
 * await client.navigate({ url: 'https://example.com' });
 *
 * const injected = await injectAxeCore(client);
 * if (injected.success) {
 *   console.log('axe-core ready for auditing');
 * }
 * ```
 */
export async function injectAxeCore(
  client: VibiumClient,
  options: { useCDN?: boolean; timeout?: number } = {}
): Promise<Result<void, AxeCoreInjectionError>> {
  const { useCDN = true, timeout = 10000 } = options;

  try {
    // Check if axe-core is already loaded
    const checkResult = await executeInBrowser(client, `
      return typeof axe !== 'undefined';
    `, timeout);

    if (checkResult.success && checkResult.value === true) {
      // axe-core already loaded
      return ok(undefined);
    }

    if (useCDN) {
      // Try to load from CDN
      const cdnResult = await executeInBrowser(client, `
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '${AXE_CORE_CDN_URL}';
          script.onload = () => resolve(true);
          script.onerror = () => reject(new Error('Failed to load axe-core from CDN'));
          document.head.appendChild(script);
          setTimeout(() => reject(new Error('axe-core CDN load timeout')), ${timeout});
        });
      `, timeout + 1000);

      if (cdnResult.success) {
        return ok(undefined);
      }

      // CDN failed, log and continue to fallback
      console.warn('Failed to load axe-core from CDN, attempting inline injection');
    }

    // Fallback: Check if we have inline axe-core (would need to be bundled)
    // For now, return error if CDN fails
    return err(new AxeCoreInjectionError(
      'Failed to inject axe-core. CDN load failed and inline injection not available. ' +
      'Ensure the page has network access to cdnjs.cloudflare.com'
    ));
  } catch (error) {
    return err(new AxeCoreInjectionError(
      'Failed to inject axe-core',
      error instanceof Error ? error : new Error(String(error))
    ));
  }
}

/**
 * Run axe-core accessibility audit on the current page
 *
 * Executes axe.run() in the browser with the specified options and returns
 * the raw axe-core results.
 *
 * @param client - VibiumClient with active browser session and axe-core injected
 * @param options - axe-core run options
 * @returns Result containing AxeResults or error
 *
 * @example
 * ```typescript
 * const client = await createVibiumClient({ enabled: true });
 * await client.launch();
 * await client.navigate({ url: 'https://example.com' });
 * await injectAxeCore(client);
 *
 * const result = await runAxeAudit(client, {
 *   runOnly: { type: 'tag', values: ['wcag2aa'] }
 * });
 *
 * if (result.success) {
 *   console.log(`Found ${result.value.violations.length} violations`);
 * }
 * ```
 */
export async function runAxeAudit(
  client: VibiumClient,
  options: AxeOptions = {}
): Promise<Result<AxeResults, AxeCoreAuditError>> {
  try {
    // Verify axe-core is loaded
    const checkResult = await executeInBrowser(client, AXE_CORE_INJECTION_CHECK, 5000);
    if (!checkResult.success) {
      // Try to inject axe-core first
      const injectResult = await injectAxeCore(client);
      if (!injectResult.success) {
        return err(new AxeCoreAuditError(
          'axe-core not loaded and injection failed',
          injectResult.error
        ));
      }
    }

    // Build the axe.run() call with options
    const axeOptionsJson = JSON.stringify(options);

    const auditScript = `
      return await axe.run(document, ${axeOptionsJson});
    `;

    const auditResult = await executeInBrowser(client, auditScript, 60000);

    if (!auditResult.success) {
      return err(new AxeCoreAuditError(
        'axe.run() execution failed',
        auditResult.error
      ));
    }

    // Validate the result structure
    const results = auditResult.value as AxeResults;
    if (!results || !Array.isArray(results.violations)) {
      return err(new AxeCoreAuditError(
        'Invalid axe-core result structure'
      ));
    }

    return ok(results);
  } catch (error) {
    return err(new AxeCoreAuditError(
      'Failed to run axe-core audit',
      error instanceof Error ? error : new Error(String(error))
    ));
  }
}

/**
 * Parse axe-core results into our AccessibilityReport format
 *
 * Transforms the raw axe-core output into the domain-specific
 * AccessibilityReport structure with proper WCAG criterion mapping.
 *
 * @param results - Raw AxeResults from axe.run()
 * @param wcagLevel - Target WCAG level for score calculation
 * @returns AccessibilityReport in our domain format
 *
 * @example
 * ```typescript
 * const axeResults = await runAxeAudit(client, { runOnly: { type: 'tag', values: ['wcag2aa'] } });
 * if (axeResults.success) {
 *   const report = parseAxeResults(axeResults.value, 'AA');
 *   console.log(`Score: ${report.score}/100`);
 *   console.log(`Violations: ${report.violations.length}`);
 * }
 * ```
 */
export function parseAxeResults(
  results: AxeResults,
  wcagLevel: 'A' | 'AA' | 'AAA' = 'AA'
): AccessibilityReport {
  // Parse violations
  const violations: AccessibilityViolation[] = results.violations.map((v) => ({
    id: v.id,
    impact: mapAxeImpact(v.impact),
    wcagCriteria: extractWCAGCriteria(v.tags),
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => parseAxeNode(n, v.id)),
  }));

  // Parse passed rules
  const passes: PassedRule[] = results.passes.map((p) => ({
    id: p.id,
    description: p.description,
    nodes: p.nodes.length,
  }));

  // Parse incomplete checks
  const incomplete: IncompleteCheck[] = results.incomplete.map((i) => ({
    id: i.id,
    description: i.description,
    reason: i.nodes.length > 0 && i.nodes[0].failureSummary
      ? i.nodes[0].failureSummary
      : 'Could not determine compliance - manual review required',
    nodes: i.nodes.map((n) => parseAxeNode(n, i.id)),
  }));

  // Calculate score based on violation severity
  const score = calculateAccessibilityScore(violations, passes, incomplete);

  return {
    url: results.url,
    timestamp: new Date(results.timestamp),
    violations,
    passes,
    incomplete,
    score,
    wcagLevel,
  };
}

/**
 * Run a complete axe-core audit with automatic injection and parsing
 *
 * This is a convenience function that combines injection, auditing, and parsing
 * into a single operation.
 *
 * @param client - VibiumClient with active browser session
 * @param url - URL to navigate to and audit
 * @param options - Audit configuration options
 * @returns Result containing AccessibilityReport
 *
 * @example
 * ```typescript
 * const client = await createVibiumClient({ enabled: true });
 * await client.launch();
 *
 * const report = await runCompleteAxeAudit(client, 'https://example.com', {
 *   wcagLevel: 'AA',
 *   includeWarnings: true,
 * });
 *
 * if (report.success) {
 *   console.log(`Accessibility Score: ${report.value.score}`);
 *   report.value.violations.forEach(v => {
 *     console.log(`- ${v.id}: ${v.help} (${v.impact})`);
 *   });
 * }
 * ```
 */
export async function runCompleteAxeAudit(
  client: VibiumClient,
  url: string,
  options: {
    wcagLevel?: 'A' | 'AA' | 'AAA';
    includeWarnings?: boolean;
    rules?: string[];
    excludeSelectors?: string[];
    timeout?: number;
  } = {}
): Promise<Result<AccessibilityReport, Error>> {
  const {
    wcagLevel = 'AA',
    includeWarnings = true,
    rules,
    excludeSelectors,
    timeout = 30000,
  } = options;

  try {
    // Navigate to URL
    const navResult = await client.navigate({
      url,
      waitUntil: 'networkidle',
      timeout,
    });

    if (!navResult.success) {
      return err(new Error(`Failed to navigate to ${url}: ${getErrorMessage(navResult)}`));
    }

    // Inject axe-core
    const injectResult = await injectAxeCore(client, { timeout: 10000 });
    if (!injectResult.success) {
      return err(injectResult.error);
    }

    // Build axe-core options
    const axeOptions: AxeOptions = {
      runOnly: {
        type: 'tag',
        values: getWCAGTagsForLevel(wcagLevel),
      },
      resultTypes: includeWarnings
        ? ['violations', 'passes', 'incomplete']
        : ['violations', 'passes'],
    };

    // Add specific rules if provided
    if (rules && rules.length > 0) {
      axeOptions.runOnly = { type: 'rule', values: rules };
    }

    // Add exclude selectors if provided
    if (excludeSelectors && excludeSelectors.length > 0) {
      axeOptions.exclude = excludeSelectors.map((s) => [s]);
    }

    // Run audit
    const auditResult = await runAxeAudit(client, axeOptions);
    if (!auditResult.success) {
      return err(auditResult.error);
    }

    // Parse results
    const report = parseAxeResults(auditResult.value, wcagLevel);

    return ok(report);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Execute JavaScript in the browser via Vibium
 *
 * Uses the VibiumClient's evaluate method to execute scripts in the browser context.
 * This is the primary mechanism for axe-core injection and audit execution.
 *
 * @param client - VibiumClient with active browser session
 * @param script - JavaScript code to execute
 * @param timeout - Execution timeout in milliseconds
 * @returns Result containing the script return value
 */
async function executeInBrowser(
  client: VibiumClient,
  script: string,
  timeout: number
): Promise<Result<unknown, Error>> {
  try {
    // Use the VibiumClient's evaluate method
    // This is now part of the official interface and implemented via Vibium
    const result = await client.evaluate(script, timeout);

    if (result.success) {
      return ok(result.value);
    } else {
      // Convert VibiumError to standard Error for compatibility
      const errorMessage = result.error instanceof Error
        ? result.error.message
        : 'Script evaluation failed';
      return err(new Error(errorMessage));
    }
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Map axe-core impact to our impact type
 */
function mapAxeImpact(
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null
): 'critical' | 'serious' | 'moderate' | 'minor' {
  return impact ?? 'moderate';
}

/**
 * Extract WCAG criteria from axe-core tags
 */
function extractWCAGCriteria(tags: string[]): WCAGCriterion[] {
  const criteria: WCAGCriterion[] = [];

  for (const tag of tags) {
    // Check for direct WCAG criterion tags (e.g., wcag111)
    if (tag.startsWith('wcag') && tag.length > 6) {
      const criterion = WCAG_CRITERIA_MAP[tag];
      if (criterion) {
        criteria.push(criterion);
        continue;
      }
    }

    // Check for best-practice tags
    if (tag === 'best-practice') {
      // Best practices don't map to specific WCAG criteria
      continue;
    }

    // Try to parse WCAG reference from tag (e.g., "wcag2a" -> level A)
    const levelMatch = WCAG_TAG_MAP[tag];
    if (levelMatch) {
      // Generic level tag - doesn't map to specific criterion
      continue;
    }
  }

  // If no specific criteria found, try to infer from rule patterns
  if (criteria.length === 0) {
    // Check for common rule ID patterns in tags
    for (const tag of tags) {
      // ACT rules (e.g., "ACT")
      if (tag.toLowerCase().includes('cat.')) {
        // Category tags don't map to WCAG
        continue;
      }
    }
  }

  return criteria;
}

/**
 * Parse an axe-core node into our ViolationNode format
 */
function parseAxeNode(node: AxeNode, ruleId: string): ViolationNode {
  // Build failure summary from checks
  let failureSummary = node.failureSummary || '';

  if (!failureSummary && node.any.length > 0) {
    failureSummary = node.any.map((c) => c.message).join('; ');
  }

  // Get fix suggestion for this rule
  const fixSuggestion = FIX_SUGGESTIONS[ruleId];

  return {
    selector: node.target.join(' '),
    html: node.html,
    target: node.target,
    failureSummary,
    fixSuggestion,
  };
}

/**
 * Calculate accessibility score from violations and passes
 *
 * Score is weighted by:
 * - Critical violations: -25 points each
 * - Serious violations: -15 points each
 * - Moderate violations: -8 points each
 * - Minor violations: -3 points each
 *
 * Base score starts at 100.
 */
function calculateAccessibilityScore(
  violations: AccessibilityViolation[],
  passes: PassedRule[],
  incomplete: IncompleteCheck[]
): number {
  const weights = {
    critical: 25,
    serious: 15,
    moderate: 8,
    minor: 3,
  };

  // Calculate penalty from violations
  let penalty = 0;
  for (const violation of violations) {
    // Weight by number of affected nodes (capped at 5 to avoid excessive penalties)
    const nodeMultiplier = Math.min(violation.nodes.length, 5);
    penalty += weights[violation.impact] * (1 + (nodeMultiplier - 1) * 0.2);
  }

  // Add small penalty for incomplete checks (need manual review)
  penalty += incomplete.length * 2;

  // Calculate score (floor at 0)
  const score = Math.max(0, Math.round(100 - penalty));

  return score;
}

/**
 * Get WCAG tags for a specific level
 */
function getWCAGTagsForLevel(level: 'A' | 'AA' | 'AAA'): string[] {
  const tags: string[] = [];

  // Always include level A
  tags.push('wcag2a', 'wcag21a', 'wcag22a');

  // Include AA if requested
  if (level === 'AA' || level === 'AAA') {
    tags.push('wcag2aa', 'wcag21aa', 'wcag22aa');
  }

  // Include AAA if requested
  if (level === 'AAA') {
    tags.push('wcag2aaa', 'wcag21aaa', 'wcag22aaa');
  }

  // Include best practices
  tags.push('best-practice');

  return tags;
}

/**
 * Extract error message from a Result
 */
function getErrorMessage<T, E extends Error>(result: Result<T, E>): string {
  if (result.success === false) {
    return (result as { success: false; error: E }).error?.message ?? 'Unknown error';
  }
  return 'Unknown error';
}

// ============================================================================
// Convenience Types for External Use
// ============================================================================

/**
 * Configuration options for axe-core integration
 */
export interface AxeCoreConfig {
  /** Use CDN to load axe-core (default: true) */
  useCDN: boolean;
  /** Timeout for axe-core operations in milliseconds */
  timeout: number;
  /** Default WCAG level for audits */
  defaultWCAGLevel: 'A' | 'AA' | 'AAA';
  /** Include best practices in addition to WCAG rules */
  includeBestPractices: boolean;
}

/**
 * Default axe-core configuration
 */
export const DEFAULT_AXE_CONFIG: AxeCoreConfig = {
  useCDN: true,
  timeout: 30000,
  defaultWCAGLevel: 'AA',
  includeBestPractices: true,
};
