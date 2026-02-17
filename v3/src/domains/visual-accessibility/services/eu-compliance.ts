/**
 * Agentic QE v3 - EU Compliance Service
 *
 * Implements EN 301 549 (European Standard for ICT Accessibility) mapping
 * and EU Accessibility Act (Directive 2019/882) compliance validation.
 *
 * EN 301 549 V3.2.1 (2021-03) is the harmonized European standard that
 * references WCAG 2.1 for web accessibility requirements.
 *
 * @module domains/visual-accessibility/services/eu-compliance
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import { toError } from '../../../shared/error-utils.js';
import type {
  AccessibilityReport,
  AccessibilityViolation,
  WCAGCriterion,
  EN301549Clause,
  EN301549ClauseResult,
  EAARequirement,
  EAAProductCategory,
  EAAComplianceResult,
  EAARequirementResult,
  EUComplianceResult,
  EUComplianceReport,
  EUComplianceOptions,
  EUComplianceRecommendation,
  WCAGtoEN301549Mapping,
} from '../interfaces.js';

/**
 * EN 301 549 V3.2.1 Chapter 9 - Web content
 * Maps WCAG 2.1 Level AA criteria to EN 301 549 clauses
 */
const EN_301_549_WEB_CLAUSES: EN301549Clause[] = [
  // Chapter 9.1 - Perceivable
  {
    id: '9.1.1.1',
    title: 'Non-text content',
    chapter: '9.1.1',
    wcagMapping: ['1.1.1'],
    description: 'All non-text content that is presented to the user has a text alternative that serves the equivalent purpose.',
    testMethod: 'automated',
  },
  {
    id: '9.1.2.1',
    title: 'Audio-only and video-only (prerecorded)',
    chapter: '9.1.2',
    wcagMapping: ['1.2.1'],
    description: 'For prerecorded audio-only and prerecorded video-only media, alternatives are provided.',
    testMethod: 'manual',
  },
  {
    id: '9.1.2.2',
    title: 'Captions (prerecorded)',
    chapter: '9.1.2',
    wcagMapping: ['1.2.2'],
    description: 'Captions are provided for all prerecorded audio content in synchronized media.',
    testMethod: 'hybrid',
  },
  {
    id: '9.1.2.3',
    title: 'Audio description or media alternative (prerecorded)',
    chapter: '9.1.2',
    wcagMapping: ['1.2.3'],
    description: 'An alternative for time-based media or audio description is provided.',
    testMethod: 'manual',
  },
  {
    id: '9.1.2.5',
    title: 'Audio description (prerecorded)',
    chapter: '9.1.2',
    wcagMapping: ['1.2.5'],
    description: 'Audio description is provided for all prerecorded video content.',
    testMethod: 'manual',
  },
  {
    id: '9.1.3.1',
    title: 'Info and relationships',
    chapter: '9.1.3',
    wcagMapping: ['1.3.1'],
    description: 'Information, structure, and relationships conveyed through presentation can be programmatically determined.',
    testMethod: 'automated',
  },
  {
    id: '9.1.3.2',
    title: 'Meaningful sequence',
    chapter: '9.1.3',
    wcagMapping: ['1.3.2'],
    description: 'When the sequence affects meaning, a correct reading sequence can be programmatically determined.',
    testMethod: 'hybrid',
  },
  {
    id: '9.1.3.3',
    title: 'Sensory characteristics',
    chapter: '9.1.3',
    wcagMapping: ['1.3.3'],
    description: 'Instructions do not rely solely on sensory characteristics.',
    testMethod: 'manual',
  },
  {
    id: '9.1.3.4',
    title: 'Orientation',
    chapter: '9.1.3',
    wcagMapping: ['1.3.4'],
    description: 'Content does not restrict its view and operation to a single display orientation.',
    testMethod: 'hybrid',
  },
  {
    id: '9.1.3.5',
    title: 'Identify input purpose',
    chapter: '9.1.3',
    wcagMapping: ['1.3.5'],
    description: 'The purpose of each input field collecting user information can be programmatically determined.',
    testMethod: 'automated',
  },
  {
    id: '9.1.4.1',
    title: 'Use of colour',
    chapter: '9.1.4',
    wcagMapping: ['1.4.1'],
    description: 'Colour is not used as the only visual means of conveying information.',
    testMethod: 'manual',
  },
  {
    id: '9.1.4.2',
    title: 'Audio control',
    chapter: '9.1.4',
    wcagMapping: ['1.4.2'],
    description: 'A mechanism is available to pause or stop audio that plays automatically.',
    testMethod: 'manual',
  },
  {
    id: '9.1.4.3',
    title: 'Contrast (minimum)',
    chapter: '9.1.4',
    wcagMapping: ['1.4.3'],
    description: 'Visual presentation of text has a contrast ratio of at least 4.5:1.',
    testMethod: 'automated',
  },
  {
    id: '9.1.4.4',
    title: 'Resize text',
    chapter: '9.1.4',
    wcagMapping: ['1.4.4'],
    description: 'Text can be resized without assistive technology up to 200 percent.',
    testMethod: 'hybrid',
  },
  {
    id: '9.1.4.5',
    title: 'Images of text',
    chapter: '9.1.4',
    wcagMapping: ['1.4.5'],
    description: 'Text is used to convey information rather than images of text.',
    testMethod: 'hybrid',
  },
  {
    id: '9.1.4.10',
    title: 'Reflow',
    chapter: '9.1.4',
    wcagMapping: ['1.4.10'],
    description: 'Content can be presented without loss of information or functionality at 320 CSS pixels.',
    testMethod: 'hybrid',
  },
  {
    id: '9.1.4.11',
    title: 'Non-text contrast',
    chapter: '9.1.4',
    wcagMapping: ['1.4.11'],
    description: 'Visual presentation of UI components and graphical objects has a contrast ratio of at least 3:1.',
    testMethod: 'automated',
  },
  {
    id: '9.1.4.12',
    title: 'Text spacing',
    chapter: '9.1.4',
    wcagMapping: ['1.4.12'],
    description: 'No loss of content or functionality occurs when text spacing is adjusted.',
    testMethod: 'hybrid',
  },
  {
    id: '9.1.4.13',
    title: 'Content on hover or focus',
    chapter: '9.1.4',
    wcagMapping: ['1.4.13'],
    description: 'Additional content triggered by hover or focus is dismissible, hoverable, and persistent.',
    testMethod: 'manual',
  },

  // Chapter 9.2 - Operable
  {
    id: '9.2.1.1',
    title: 'Keyboard',
    chapter: '9.2.1',
    wcagMapping: ['2.1.1'],
    description: 'All functionality is operable through a keyboard interface.',
    testMethod: 'hybrid',
  },
  {
    id: '9.2.1.2',
    title: 'No keyboard trap',
    chapter: '9.2.1',
    wcagMapping: ['2.1.2'],
    description: 'Keyboard focus can be moved away from any component using only a keyboard.',
    testMethod: 'hybrid',
  },
  {
    id: '9.2.1.4',
    title: 'Character key shortcuts',
    chapter: '9.2.1',
    wcagMapping: ['2.1.4'],
    description: 'Keyboard shortcuts using only letter, punctuation, number, or symbol characters can be turned off or remapped.',
    testMethod: 'manual',
  },
  {
    id: '9.2.2.1',
    title: 'Timing adjustable',
    chapter: '9.2.2',
    wcagMapping: ['2.2.1'],
    description: 'Users can turn off, adjust, or extend time limits.',
    testMethod: 'manual',
  },
  {
    id: '9.2.2.2',
    title: 'Pause, stop, hide',
    chapter: '9.2.2',
    wcagMapping: ['2.2.2'],
    description: 'Moving, blinking, scrolling, or auto-updating information can be paused, stopped, or hidden.',
    testMethod: 'manual',
  },
  {
    id: '9.2.3.1',
    title: 'Three flashes or below threshold',
    chapter: '9.2.3',
    wcagMapping: ['2.3.1'],
    description: 'Web pages do not contain anything that flashes more than three times in any one second period.',
    testMethod: 'automated',
  },
  {
    id: '9.2.4.1',
    title: 'Bypass blocks',
    chapter: '9.2.4',
    wcagMapping: ['2.4.1'],
    description: 'A mechanism is available to bypass blocks of content that are repeated on multiple web pages.',
    testMethod: 'hybrid',
  },
  {
    id: '9.2.4.2',
    title: 'Page titled',
    chapter: '9.2.4',
    wcagMapping: ['2.4.2'],
    description: 'Web pages have titles that describe topic or purpose.',
    testMethod: 'automated',
  },
  {
    id: '9.2.4.3',
    title: 'Focus order',
    chapter: '9.2.4',
    wcagMapping: ['2.4.3'],
    description: 'Focusable components receive focus in an order that preserves meaning and operability.',
    testMethod: 'hybrid',
  },
  {
    id: '9.2.4.4',
    title: 'Link purpose (in context)',
    chapter: '9.2.4',
    wcagMapping: ['2.4.4'],
    description: 'The purpose of each link can be determined from the link text or its context.',
    testMethod: 'hybrid',
  },
  {
    id: '9.2.4.5',
    title: 'Multiple ways',
    chapter: '9.2.4',
    wcagMapping: ['2.4.5'],
    description: 'More than one way is available to locate a web page within a set of web pages.',
    testMethod: 'manual',
  },
  {
    id: '9.2.4.6',
    title: 'Headings and labels',
    chapter: '9.2.4',
    wcagMapping: ['2.4.6'],
    description: 'Headings and labels describe topic or purpose.',
    testMethod: 'hybrid',
  },
  {
    id: '9.2.4.7',
    title: 'Focus visible',
    chapter: '9.2.4',
    wcagMapping: ['2.4.7'],
    description: 'Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.',
    testMethod: 'hybrid',
  },
  {
    id: '9.2.5.1',
    title: 'Pointer gestures',
    chapter: '9.2.5',
    wcagMapping: ['2.5.1'],
    description: 'All functionality that uses multipoint or path-based gestures can be operated with a single pointer.',
    testMethod: 'manual',
  },
  {
    id: '9.2.5.2',
    title: 'Pointer cancellation',
    chapter: '9.2.5',
    wcagMapping: ['2.5.2'],
    description: 'Functions triggered by single pointer can be cancelled.',
    testMethod: 'manual',
  },
  {
    id: '9.2.5.3',
    title: 'Label in name',
    chapter: '9.2.5',
    wcagMapping: ['2.5.3'],
    description: 'User interface components with visible labels have accessible names that include the visible text.',
    testMethod: 'automated',
  },
  {
    id: '9.2.5.4',
    title: 'Motion actuation',
    chapter: '9.2.5',
    wcagMapping: ['2.5.4'],
    description: 'Functionality operated by device motion can be operated by user interface components.',
    testMethod: 'manual',
  },

  // Chapter 9.3 - Understandable
  {
    id: '9.3.1.1',
    title: 'Language of page',
    chapter: '9.3.1',
    wcagMapping: ['3.1.1'],
    description: 'The default human language of each web page can be programmatically determined.',
    testMethod: 'automated',
  },
  {
    id: '9.3.1.2',
    title: 'Language of parts',
    chapter: '9.3.1',
    wcagMapping: ['3.1.2'],
    description: 'The human language of each passage or phrase can be programmatically determined.',
    testMethod: 'hybrid',
  },
  {
    id: '9.3.2.1',
    title: 'On focus',
    chapter: '9.3.2',
    wcagMapping: ['3.2.1'],
    description: 'Receiving focus does not initiate a change of context.',
    testMethod: 'hybrid',
  },
  {
    id: '9.3.2.2',
    title: 'On input',
    chapter: '9.3.2',
    wcagMapping: ['3.2.2'],
    description: 'Changing the setting of a user interface component does not automatically cause a change of context.',
    testMethod: 'hybrid',
  },
  {
    id: '9.3.2.3',
    title: 'Consistent navigation',
    chapter: '9.3.2',
    wcagMapping: ['3.2.3'],
    description: 'Navigational mechanisms that are repeated are in the same relative order.',
    testMethod: 'manual',
  },
  {
    id: '9.3.2.4',
    title: 'Consistent identification',
    chapter: '9.3.2',
    wcagMapping: ['3.2.4'],
    description: 'Components with the same functionality are identified consistently.',
    testMethod: 'manual',
  },
  {
    id: '9.3.3.1',
    title: 'Error identification',
    chapter: '9.3.3',
    wcagMapping: ['3.3.1'],
    description: 'If an input error is detected, the item in error is identified and described to the user.',
    testMethod: 'hybrid',
  },
  {
    id: '9.3.3.2',
    title: 'Labels or instructions',
    chapter: '9.3.3',
    wcagMapping: ['3.3.2'],
    description: 'Labels or instructions are provided when content requires user input.',
    testMethod: 'hybrid',
  },
  {
    id: '9.3.3.3',
    title: 'Error suggestion',
    chapter: '9.3.3',
    wcagMapping: ['3.3.3'],
    description: 'If an input error is detected and suggestions for correction are known, the suggestions are provided.',
    testMethod: 'hybrid',
  },
  {
    id: '9.3.3.4',
    title: 'Error prevention (legal, financial, data)',
    chapter: '9.3.3',
    wcagMapping: ['3.3.4'],
    description: 'Submissions are reversible, checked, or confirmed for legal, financial, or data-deletion actions.',
    testMethod: 'manual',
  },

  // Chapter 9.4 - Robust
  {
    id: '9.4.1.1',
    title: 'Parsing',
    chapter: '9.4.1',
    wcagMapping: ['4.1.1'],
    description: 'In content implemented using markup languages, elements have complete start and end tags.',
    testMethod: 'automated',
  },
  {
    id: '9.4.1.2',
    title: 'Name, role, value',
    chapter: '9.4.1',
    wcagMapping: ['4.1.2'],
    description: 'User interface components have name and role programmatically determined.',
    testMethod: 'automated',
  },
  {
    id: '9.4.1.3',
    title: 'Status messages',
    chapter: '9.4.1',
    wcagMapping: ['4.1.3'],
    description: 'Status messages can be programmatically determined without receiving focus.',
    testMethod: 'hybrid',
  },
];

/**
 * EU Accessibility Act requirements for web services (e-commerce)
 */
const EAA_WEB_REQUIREMENTS: EAARequirement[] = [
  {
    id: 'EAA-I.1',
    title: 'Perceivable information',
    article: 'Annex I, Section I',
    description: 'Information shall be perceivable through more than one sensory channel.',
    applicableTo: ['e-commerce', 'banking-services', 'transport-services'],
    en301549Mapping: ['9.1.1.1', '9.1.2.1', '9.1.2.2', '9.1.3.1'],
  },
  {
    id: 'EAA-I.2',
    title: 'Operable user interface',
    article: 'Annex I, Section I',
    description: 'User interface shall be operable through multiple input modalities.',
    applicableTo: ['e-commerce', 'banking-services', 'transport-services', 'e-books'],
    en301549Mapping: ['9.2.1.1', '9.2.1.2', '9.2.4.1', '9.2.4.3'],
  },
  {
    id: 'EAA-I.3',
    title: 'Understandable operation',
    article: 'Annex I, Section I',
    description: 'Operation of the product and its user interface shall be understandable.',
    applicableTo: ['e-commerce', 'banking-services', 'transport-services'],
    en301549Mapping: ['9.3.1.1', '9.3.2.1', '9.3.3.1', '9.3.3.2'],
  },
  {
    id: 'EAA-I.4',
    title: 'Robust content',
    article: 'Annex I, Section I',
    description: 'Content shall be robust enough to be interpreted by assistive technologies.',
    applicableTo: ['e-commerce', 'banking-services', 'transport-services', 'e-books', 'audiovisual-media'],
    en301549Mapping: ['9.4.1.1', '9.4.1.2', '9.4.1.3'],
  },
  {
    id: 'EAA-II.1',
    title: 'Accessible support services',
    article: 'Annex I, Section II',
    description: 'Support services shall provide information on accessibility features.',
    applicableTo: ['e-commerce', 'banking-services', 'transport-services'],
    en301549Mapping: [],
  },
  {
    id: 'EAA-III.1',
    title: 'Electronic identification',
    article: 'Annex I, Section III',
    description: 'Electronic identification and authentication shall be accessible.',
    applicableTo: ['banking-services', 'e-commerce'],
    en301549Mapping: ['9.2.1.1', '9.3.3.1', '9.3.3.2'],
  },
];

/**
 * WCAG to EN 301 549 mapping table
 */
const WCAG_TO_EN301549_MAP: WCAGtoEN301549Mapping[] = EN_301_549_WEB_CLAUSES.flatMap(
  (clause) =>
    clause.wcagMapping.map((wcag) => ({
      wcagCriterion: wcag,
      wcagLevel: getWCAGLevel(wcag),
      en301549Clause: clause.id,
      en301549Chapter: clause.chapter,
      conformanceLevel: 'required' as const,
    }))
);

/**
 * Get WCAG level from criterion ID
 */
function getWCAGLevel(criterionId: string): 'A' | 'AA' | 'AAA' {
  // WCAG 2.1 Level A criteria
  const levelA = [
    '1.1.1', '1.2.1', '1.2.2', '1.2.3', '1.3.1', '1.3.2', '1.3.3',
    '1.4.1', '1.4.2', '2.1.1', '2.1.2', '2.1.4', '2.2.1', '2.2.2',
    '2.3.1', '2.4.1', '2.4.2', '2.4.3', '2.4.4', '2.5.1', '2.5.2',
    '2.5.3', '2.5.4', '3.1.1', '3.2.1', '3.2.2', '3.3.1', '3.3.2',
    '4.1.1', '4.1.2',
  ];

  // WCAG 2.1 Level AA criteria
  const levelAA = [
    '1.2.4', '1.2.5', '1.3.4', '1.3.5', '1.4.3', '1.4.4', '1.4.5',
    '1.4.10', '1.4.11', '1.4.12', '1.4.13', '2.4.5', '2.4.6', '2.4.7',
    '3.1.2', '3.2.3', '3.2.4', '3.3.3', '3.3.4', '4.1.3',
  ];

  if (levelA.includes(criterionId)) return 'A';
  if (levelAA.includes(criterionId)) return 'AA';
  return 'AAA';
}

/**
 * EU Compliance Service Configuration
 */
export interface EUComplianceServiceConfig {
  /** EN 301 549 version */
  en301549Version: '3.2.1' | '3.1.1';
  /** Include EAA validation */
  includeEAA: boolean;
  /** Default product category */
  defaultProductCategory: EAAProductCategory;
  /** Cache TTL for compliance results */
  cacheTTL: number;
}

const DEFAULT_CONFIG: EUComplianceServiceConfig = {
  en301549Version: '3.2.1',
  includeEAA: true,
  defaultProductCategory: 'e-commerce',
  cacheTTL: 3600,
};

/**
 * EU Compliance Service
 *
 * Provides EN 301 549 and EU Accessibility Act compliance validation
 * by mapping WCAG audit results to European accessibility standards.
 *
 * @example
 * ```typescript
 * const service = new EUComplianceService(memory);
 * const report = await service.validateCompliance(wcagReport, {
 *   includeEAA: true,
 *   productCategory: 'e-commerce',
 * });
 * ```
 */
export class EUComplianceService {
  private readonly config: EUComplianceServiceConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<EUComplianceServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate EU compliance based on WCAG audit results
   *
   * @param wcagReport - WCAG accessibility report
   * @param options - EU compliance options
   * @returns Full EU compliance report
   */
  async validateCompliance(
    wcagReport: AccessibilityReport,
    options?: EUComplianceOptions
  ): Promise<Result<EUComplianceReport, Error>> {
    try {
      const en301549Version = options?.en301549Version ?? this.config.en301549Version;
      const includeEAA = options?.includeEAA ?? this.config.includeEAA;
      const productCategory = options?.productCategory ?? this.config.defaultProductCategory;
      const excludeClauses = options?.excludeClauses ?? [];

      // Validate EN 301 549 compliance
      const en301549Result = this.validateEN301549(
        wcagReport,
        en301549Version,
        excludeClauses
      );

      // Validate EAA compliance if requested
      let eaaCompliance: EAAComplianceResult | undefined;
      if (includeEAA) {
        eaaCompliance = this.validateEAA(en301549Result, productCategory);
      }

      // Calculate overall status
      const overallStatus = this.calculateOverallStatus(en301549Result, eaaCompliance);
      const complianceScore = en301549Result.score;
      const certificationReady = en301549Result.passed && (!eaaCompliance || eaaCompliance.passed);

      const report: EUComplianceReport = {
        url: wcagReport.url,
        timestamp: new Date(),
        en301549: en301549Result,
        eaaCompliance,
        overallStatus,
        complianceScore,
        certificationReady,
        nextReviewDate: this.calculateNextReviewDate(),
      };

      // Cache the report
      await this.cacheReport(report);

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Validate EN 301 549 compliance
   */
  private validateEN301549(
    wcagReport: AccessibilityReport,
    version: string,
    excludeClauses: string[]
  ): EUComplianceResult {
    const failedClauses: EN301549ClauseResult[] = [];
    const passedClauses: EN301549ClauseResult[] = [];
    const partialClauses: EN301549ClauseResult[] = [];

    // Build violation map by WCAG criterion
    const violationsByWCAG = new Map<string, AccessibilityViolation[]>();
    for (const violation of wcagReport.violations) {
      for (const criterion of violation.wcagCriteria) {
        const existing = violationsByWCAG.get(criterion.id) ?? [];
        existing.push(violation);
        violationsByWCAG.set(criterion.id, existing);
      }
    }

    // Evaluate each EN 301 549 clause
    for (const clause of EN_301_549_WEB_CLAUSES) {
      if (excludeClauses.includes(clause.id)) {
        continue;
      }

      const clauseViolations: AccessibilityViolation[] = [];
      let hasViolations = false;

      // Check violations for mapped WCAG criteria
      for (const wcagId of clause.wcagMapping) {
        const violations = violationsByWCAG.get(wcagId);
        if (violations && violations.length > 0) {
          clauseViolations.push(...violations);
          hasViolations = true;
        }
      }

      const result: EN301549ClauseResult = {
        clause,
        status: hasViolations ? 'failed' : 'passed',
        violations: clauseViolations,
      };

      if (hasViolations) {
        // Check if partial (some criteria passed)
        const totalCriteria = clause.wcagMapping.length;
        const failedCriteria = clause.wcagMapping.filter(
          (wcag) => violationsByWCAG.has(wcag)
        ).length;

        if (failedCriteria < totalCriteria && totalCriteria > 1) {
          // Partial: some criteria failed but not all
          partialClauses.push({ ...result, status: 'partial' });
        } else {
          // Failed: all criteria failed (or single criterion failed)
          failedClauses.push(result);
        }
      } else {
        passedClauses.push(result);
      }
    }

    // Calculate score
    const totalClauses = failedClauses.length + passedClauses.length + partialClauses.length;
    const passedWeight = passedClauses.length + partialClauses.length * 0.5;
    const score = totalClauses > 0 ? Math.round((passedWeight / totalClauses) * 100) : 100;

    // Generate recommendations
    const recommendations = this.generateRecommendations(failedClauses, partialClauses);

    return {
      standard: 'EN301549',
      version,
      passed: failedClauses.length === 0,
      score,
      failedClauses,
      passedClauses,
      partialClauses,
      wcagMapping: WCAG_TO_EN301549_MAP,
      recommendations,
    };
  }

  /**
   * Validate EU Accessibility Act compliance
   */
  private validateEAA(
    en301549Result: EUComplianceResult,
    productCategory: EAAProductCategory
  ): EAAComplianceResult {
    // Filter requirements applicable to the product category
    const applicableRequirements = EAA_WEB_REQUIREMENTS.filter((req) =>
      req.applicableTo.includes(productCategory)
    );

    const failedRequirements: EAARequirementResult[] = [];

    // Check each requirement against EN 301 549 results
    for (const requirement of applicableRequirements) {
      // A requirement fails if any of its mapped EN 301 549 clauses failed
      const failedMappings = requirement.en301549Mapping.filter((clauseId) =>
        en301549Result.failedClauses.some((fc) => fc.clause.id === clauseId)
      );

      if (failedMappings.length > 0) {
        failedRequirements.push({
          requirement,
          status: failedMappings.length === requirement.en301549Mapping.length ? 'not-met' : 'partially-met',
          evidence: `Failed EN 301 549 clauses: ${failedMappings.join(', ')}`,
          remediationRequired: true,
        });
      }
    }

    return {
      productCategory,
      passed: failedRequirements.length === 0,
      applicableRequirements,
      failedRequirements,
    };
  }

  /**
   * Generate remediation recommendations
   */
  private generateRecommendations(
    failedClauses: EN301549ClauseResult[],
    partialClauses: EN301549ClauseResult[]
  ): EUComplianceRecommendation[] {
    const recommendations: EUComplianceRecommendation[] = [];

    // Prioritize by impact and test method
    const prioritizedClauses = [...failedClauses, ...partialClauses].sort((a, b) => {
      // Automated tests first (easier to fix)
      if (a.clause.testMethod !== b.clause.testMethod) {
        return a.clause.testMethod === 'automated' ? -1 : 1;
      }
      // Then by number of violations
      return b.violations.length - a.violations.length;
    });

    for (const clauseResult of prioritizedClauses) {
      const priority = this.calculatePriority(clauseResult);
      const effort = this.estimateEffort(clauseResult);

      recommendations.push({
        priority,
        clause: clauseResult.clause.id,
        description: `${clauseResult.clause.title}: ${clauseResult.clause.description}`,
        remediation: this.generateRemediationText(clauseResult),
        estimatedEffort: effort,
        deadline: priority === 'high' ? this.getDeadline(30) : undefined,
      });
    }

    return recommendations.slice(0, 10); // Top 10 recommendations
  }

  /**
   * Calculate priority for a failed clause
   */
  private calculatePriority(
    clauseResult: EN301549ClauseResult
  ): 'high' | 'medium' | 'low' {
    // Check if any violations are critical or serious
    const hasCritical = clauseResult.violations.some((v) => v.impact === 'critical');
    const hasSerious = clauseResult.violations.some((v) => v.impact === 'serious');

    if (hasCritical) return 'high';
    if (hasSerious) return 'medium';
    return 'low';
  }

  /**
   * Estimate remediation effort
   */
  private estimateEffort(
    clauseResult: EN301549ClauseResult
  ): 'trivial' | 'minor' | 'moderate' | 'major' {
    const violationCount = clauseResult.violations.length;
    const testMethod = clauseResult.clause.testMethod;

    // Automated tests are typically easier to fix
    if (testMethod === 'automated') {
      if (violationCount <= 3) return 'trivial';
      if (violationCount <= 10) return 'minor';
      return 'moderate';
    }

    // Manual/hybrid tests require more effort
    if (violationCount <= 2) return 'minor';
    if (violationCount <= 5) return 'moderate';
    return 'major';
  }

  /**
   * Generate remediation text for a clause
   */
  private generateRemediationText(clauseResult: EN301549ClauseResult): string {
    const wcagIds = clauseResult.clause.wcagMapping.join(', ');
    const violationCount = clauseResult.violations.length;

    return (
      `Fix ${violationCount} violation(s) related to WCAG ${wcagIds}. ` +
      `Refer to EN 301 549 clause ${clauseResult.clause.id} (${clauseResult.clause.title}) ` +
      `for detailed requirements. Test method: ${clauseResult.clause.testMethod}.`
    );
  }

  /**
   * Calculate overall compliance status
   */
  private calculateOverallStatus(
    en301549Result: EUComplianceResult,
    eaaCompliance?: EAAComplianceResult
  ): 'compliant' | 'partially-compliant' | 'non-compliant' {
    if (!en301549Result.passed) {
      // Check if mostly compliant (score >= 80)
      if (en301549Result.score >= 80) {
        return 'partially-compliant';
      }
      return 'non-compliant';
    }

    if (eaaCompliance && !eaaCompliance.passed) {
      return 'partially-compliant';
    }

    return 'compliant';
  }

  /**
   * Calculate next review date (annual review recommended)
   */
  private calculateNextReviewDate(): Date {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear;
  }

  /**
   * Get deadline date
   */
  private getDeadline(days: number): Date {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);
    return deadline;
  }

  /**
   * Cache compliance report
   */
  private async cacheReport(report: EUComplianceReport): Promise<void> {
    const cacheKey = `eu-compliance:${this.hashUrl(report.url)}`;
    await this.memory.set(cacheKey, report, {
      namespace: 'visual-accessibility',
      ttl: this.config.cacheTTL,
    });
  }

  /**
   * Get cached compliance report
   */
  async getCachedReport(url: string): Promise<EUComplianceReport | null> {
    const cacheKey = `eu-compliance:${this.hashUrl(url)}`;
    const cached = await this.memory.get<EUComplianceReport>(cacheKey);
    return cached ?? null;
  }

  /**
   * Get all EN 301 549 clauses
   */
  getEN301549Clauses(): EN301549Clause[] {
    return [...EN_301_549_WEB_CLAUSES];
  }

  /**
   * Get all EAA requirements
   */
  getEAARequirements(): EAARequirement[] {
    return [...EAA_WEB_REQUIREMENTS];
  }

  /**
   * Get WCAG to EN 301 549 mapping
   */
  getWCAGMapping(): WCAGtoEN301549Mapping[] {
    return [...WCAG_TO_EN301549_MAP];
  }

  /**
   * Get clauses for a specific WCAG criterion
   */
  getClausesForWCAG(wcagCriterion: string): EN301549Clause[] {
    return EN_301_549_WEB_CLAUSES.filter((clause) =>
      clause.wcagMapping.includes(wcagCriterion)
    );
  }

  /**
   * Hash URL for cache key
   */
  private hashUrl(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

export {
  EN_301_549_WEB_CLAUSES,
  EAA_WEB_REQUIREMENTS,
  WCAG_TO_EN301549_MAP,
  getWCAGLevel,
};
