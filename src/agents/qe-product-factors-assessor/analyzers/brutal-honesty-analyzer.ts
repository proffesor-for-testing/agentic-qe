/**
 * Brutal Honesty Analyzer
 *
 * Integrates the brutal-honesty-review skill into product factors assessment.
 * Provides three analysis modes:
 * - Bach Mode: BS detection for requirements (vague, buzzword-laden, unrealistic)
 * - Ramsay Mode: Quality standards for test ideas (ensure not just happy-path)
 * - Linus Mode: Technical precision for clarifying questions
 *
 * Enhanced with domain-specific BS patterns for targeted quality validation.
 */

import { HTSMCategory, Priority, TestIdea, ClarifyingQuestion, DetectedDomain } from '../types';
import { domainPatternRegistry, DomainBSPattern } from '../patterns/domain-registry';

/**
 * Severity levels for brutal honesty findings
 */
export enum BrutalHonestySeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Modes of brutal honesty analysis
 */
export enum BrutalHonestyMode {
  BACH = 'bach',      // BS detection for requirements
  RAMSAY = 'ramsay',  // Quality standards for test coverage
  LINUS = 'linus',    // Technical precision for questions
}

/**
 * A finding from brutal honesty analysis
 */
export interface BrutalHonestyFinding {
  id: string;
  mode: BrutalHonestyMode;
  severity: BrutalHonestySeverity;
  category: string;
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
  impactIfIgnored: string;
}

/**
 * Requirements quality assessment result
 */
export interface RequirementsQualityScore {
  score: number;           // 0-100
  verdict: string;         // Human-readable verdict
  findings: BrutalHonestyFinding[];
  categoryScores: Record<string, number>;
}

/**
 * Test idea quality validation result
 */
export interface TestIdeaValidation {
  originalIdea: TestIdea;
  isValid: boolean;
  qualityScore: number;    // 0-100
  warnings: BrutalHonestyFinding[];
  enhancements: string[];
}

/**
 * Enhanced clarifying question with brutal honesty precision
 */
export interface EnhancedQuestion extends ClarifyingQuestion {
  technicalPrecision: string;
  assumptionsChallenged: string[];
  riskIfUnanswered: BrutalHonestySeverity;
  impactArea: string;
}

/**
 * BS patterns to detect in requirements (Bach mode)
 */
const BS_PATTERNS = {
  vagueness: [
    { pattern: /improve\s+(performance|quality|experience)/i, issue: 'Vague improvement goal without baseline or target' },
    { pattern: /enhance\s+\w+/i, issue: 'Enhancement without specific criteria' },
    { pattern: /better\s+(user\s+)?experience/i, issue: 'Subjective quality without measurable definition' },
    { pattern: /seamless\s+(integration|experience)/i, issue: 'Marketing speak without technical specification' },
    { pattern: /intuitive\s+(ui|interface|design)/i, issue: 'Subjective usability claim without validation method' },
    { pattern: /real-?time/i, issue: 'Real-time claim without latency SLA (what does real-time mean? <100ms? <1s?)' },
    { pattern: /scalable/i, issue: 'Scalability claim without load targets or growth projections' },
    { pattern: /high\s*availability/i, issue: 'HA claim without uptime SLA (99.9%? 99.99%?)' },
  ],
  missingContext: [
    { pattern: /as\s+needed/i, issue: 'Undefined trigger condition' },
    { pattern: /when\s+appropriate/i, issue: 'Subjective decision criteria' },
    { pattern: /if\s+required/i, issue: 'Undefined requirement trigger' },
    { pattern: /as\s+applicable/i, issue: 'No definition of applicability' },
    { pattern: /etc\.?/i, issue: 'Incomplete list hiding unknown scope' },
    { pattern: /and\s+more/i, issue: 'Open-ended scope without boundaries' },
  ],
  unrealisticMetrics: [
    { pattern: /100%\s+(uptime|availability|coverage)/i, issue: 'Impossible 100% claim' },
    { pattern: /zero\s+(downtime|bugs|defects)/i, issue: 'Zero defect claim is unrealistic' },
    { pattern: /instant(aneous)?/i, issue: 'Instant response claim needs latency definition' },
    { pattern: /unlimited/i, issue: 'Unlimited capacity claim ignores physics' },
  ],
  buzzwords: [
    { pattern: /ai-?powered/i, issue: 'AI claim without ML/model specification' },
    { pattern: /machine\s+learning/i, issue: 'ML claim without algorithm or training data details' },
    { pattern: /blockchain/i, issue: 'Blockchain without consensus mechanism or justification' },
    { pattern: /cloud-?native/i, issue: 'Cloud-native without container/orchestration details' },
    { pattern: /microservices/i, issue: 'Microservices without service boundaries defined' },
    { pattern: /serverless/i, issue: 'Serverless without cold start or scaling considerations' },
  ],
};

/**
 * Quality standards for test ideas (Ramsay mode)
 */
const TEST_IDEA_QUALITY_STANDARDS = {
  mustCover: [
    'happy-path',
    'error-handling',
    'boundary-conditions',
    'edge-cases',
    'validation-failures',
  ],
  redFlags: [
    { pattern: /verify.*works/i, issue: 'Too vague - what does "works" mean?' },
    { pattern: /test.*functionality/i, issue: 'Generic - specify exact behavior to verify' },
    { pattern: /ensure.*correct/i, issue: 'Subjective - define correct expected outcome' },
    { pattern: /check.*proper/i, issue: 'Vague - specify the exact validation' },
  ],
  priorityRules: {
    P0: ['security', 'data-loss', 'crash', 'payment', 'authentication'],
    P1: ['core-feature', 'user-flow', 'integration', 'performance-critical'],
    P2: ['edge-case', 'error-message', 'ui-polish', 'validation'],
    P3: ['cosmetic', 'rare-scenario', 'nice-to-have'],
  },
};

/**
 * Brutal Honesty Analyzer
 */
export class BrutalHonestyAnalyzer {
  private findings: BrutalHonestyFinding[] = [];
  private findingIdCounter = 0;

  constructor() {
    this.findings = [];
    this.findingIdCounter = 0;
  }

  /**
   * Generate a unique finding ID
   */
  private generateFindingId(): string {
    this.findingIdCounter++;
    return `BH-${String(this.findingIdCounter).padStart(3, '0')}`;
  }

  /**
   * Analyze requirements using Bach mode (BS detection)
   * Enhanced with domain-specific BS pattern detection
   *
   * @param requirements - The requirements text to analyze
   * @param detectedDomains - Optional detected domains for domain-specific BS detection
   */
  analyzeRequirements(requirements: string, detectedDomains?: DetectedDomain[]): RequirementsQualityScore {
    const findings: BrutalHonestyFinding[] = [];
    const categoryScores: Record<string, number> = {
      clarity: 100,
      completeness: 100,
      measurability: 100,
      realism: 100,
      domainCoverage: 100, // New category for domain-specific issues
    };

    // Get domain-specific BS patterns if domains are detected
    const domainBSPatterns = this.getDomainBSPatterns(detectedDomains);

    // Check for vagueness
    for (const check of BS_PATTERNS.vagueness) {
      const matches = requirements.match(new RegExp(check.pattern, 'gi'));
      if (matches) {
        for (const match of matches) {
          findings.push({
            id: this.generateFindingId(),
            mode: BrutalHonestyMode.BACH,
            severity: BrutalHonestySeverity.HIGH,
            category: 'Vagueness',
            title: 'Vague Requirement Detected',
            description: check.issue,
            evidence: `Found: "${match}"`,
            recommendation: 'Define specific, measurable criteria. What exactly should be achieved and how will success be measured?',
            impactIfIgnored: 'Development team will make assumptions, leading to rework when stakeholder expectations differ.',
          });
          categoryScores.clarity -= 10;
        }
      }
    }

    // Check for missing context
    for (const check of BS_PATTERNS.missingContext) {
      const matches = requirements.match(new RegExp(check.pattern, 'gi'));
      if (matches) {
        for (const match of matches) {
          findings.push({
            id: this.generateFindingId(),
            mode: BrutalHonestyMode.BACH,
            severity: BrutalHonestySeverity.MEDIUM,
            category: 'Missing Context',
            title: 'Undefined Condition',
            description: check.issue,
            evidence: `Found: "${match}"`,
            recommendation: 'Explicitly define the conditions and criteria. Remove ambiguous qualifiers.',
            impactIfIgnored: 'Edge cases will be discovered in production when it\'s expensive to fix.',
          });
          categoryScores.completeness -= 8;
        }
      }
    }

    // Check for unrealistic metrics
    for (const check of BS_PATTERNS.unrealisticMetrics) {
      const matches = requirements.match(new RegExp(check.pattern, 'gi'));
      if (matches) {
        for (const match of matches) {
          findings.push({
            id: this.generateFindingId(),
            mode: BrutalHonestyMode.BACH,
            severity: BrutalHonestySeverity.CRITICAL,
            category: 'Unrealistic Metrics',
            title: 'Impossible Requirement',
            description: check.issue,
            evidence: `Found: "${match}"`,
            recommendation: 'Replace with achievable targets. 99.9% uptime is realistic; 100% is not.',
            impactIfIgnored: 'Team will either fail to meet impossible goals or waste time on diminishing returns.',
          });
          categoryScores.realism -= 15;
          categoryScores.measurability -= 10;
        }
      }
    }

    // Check for buzzwords
    for (const check of BS_PATTERNS.buzzwords) {
      const matches = requirements.match(new RegExp(check.pattern, 'gi'));
      if (matches) {
        for (const match of matches) {
          findings.push({
            id: this.generateFindingId(),
            mode: BrutalHonestyMode.BACH,
            severity: BrutalHonestySeverity.MEDIUM,
            category: 'Buzzword Alert',
            title: 'Technology Buzzword Without Substance',
            description: check.issue,
            evidence: `Found: "${match}"`,
            recommendation: 'Define the specific technology, algorithm, or architecture being proposed.',
            impactIfIgnored: 'Risk of cargo-cult implementation without understanding the underlying requirements.',
          });
          categoryScores.clarity -= 5;
        }
      }
    }

    // Check for missing acceptance criteria indicators
    const hasAcceptanceCriteria = /given|when|then|acceptance\s+criteria|ac:|scenario/i.test(requirements);
    if (!hasAcceptanceCriteria && requirements.length > 200) {
      findings.push({
        id: this.generateFindingId(),
        mode: BrutalHonestyMode.BACH,
        severity: BrutalHonestySeverity.HIGH,
        category: 'Missing Structure',
        title: 'No Acceptance Criteria Found',
        description: 'Requirements lack structured acceptance criteria (Given/When/Then or similar)',
        evidence: 'No acceptance criteria pattern detected in requirements',
        recommendation: 'Add explicit acceptance criteria using Given/When/Then format for each feature.',
        impactIfIgnored: '"Done" becomes subjective. Testing cannot verify completion without clear criteria.',
      });
      categoryScores.completeness -= 20;
    }

    // Check for missing error handling requirements
    const hasErrorHandling = /error|exception|fail|invalid|timeout|retry|fallback/i.test(requirements);
    if (!hasErrorHandling && requirements.length > 300) {
      findings.push({
        id: this.generateFindingId(),
        mode: BrutalHonestyMode.BACH,
        severity: BrutalHonestySeverity.HIGH,
        category: 'Missing Coverage',
        title: 'No Error Handling Requirements',
        description: 'Requirements focus only on happy path - no failure scenarios defined',
        evidence: 'No error, exception, or failure handling patterns found',
        recommendation: 'Define behavior for: invalid input, network failures, timeouts, concurrent access conflicts.',
        impactIfIgnored: 'Developers will implement ad-hoc error handling or none at all.',
      });
      categoryScores.completeness -= 15;
    }

    // Check domain-specific BS patterns (Bach mode enhanced)
    if (domainBSPatterns.length > 0) {
      for (const domainPattern of domainBSPatterns) {
        const matches = requirements.match(new RegExp(domainPattern.pattern, 'gi'));
        if (matches) {
          for (const match of matches) {
            findings.push({
              id: this.generateFindingId(),
              mode: BrutalHonestyMode.BACH,
              severity: domainPattern.severity as BrutalHonestySeverity,
              category: 'Domain-Specific Issue',
              title: `${domainPattern.issue}`,
              description: `Domain-specific BS detected: ${domainPattern.issue}`,
              evidence: `Found: "${match}"`,
              recommendation: domainPattern.recommendation,
              impactIfIgnored: `This is a domain-specific issue that can lead to compliance failures, security vulnerabilities, or integration problems.`,
            });
            // Weight domain-specific issues heavily
            categoryScores.domainCoverage -= domainPattern.severity === 'CRITICAL' ? 25 :
                                              domainPattern.severity === 'HIGH' ? 15 : 10;
          }
        }
      }
    }

    // Check for missing domain-specific coverage (if domains detected)
    if (detectedDomains && detectedDomains.length > 0) {
      for (const domain of detectedDomains) {
        // Only check high-confidence domains
        if (domain.confidence >= 0.6) {
          for (const requiredCoverage of domain.requiredCoverage) {
            // Check if the required coverage is mentioned in requirements
            const coveragePattern = new RegExp(requiredCoverage.split('-').join('.+'), 'i');
            if (!coveragePattern.test(requirements)) {
              findings.push({
                id: this.generateFindingId(),
                mode: BrutalHonestyMode.BACH,
                severity: BrutalHonestySeverity.HIGH,
                category: 'Missing Domain Coverage',
                title: `Missing ${domain.displayName} Coverage: ${requiredCoverage}`,
                description: `For ${domain.displayName} domain, requirements should address: ${requiredCoverage}`,
                evidence: `Domain "${domain.displayName}" detected with ${(domain.confidence * 100).toFixed(0)}% confidence, but "${requiredCoverage}" coverage not found`,
                recommendation: `Add requirements addressing ${requiredCoverage} for ${domain.displayName} compliance`,
                impactIfIgnored: `Missing ${requiredCoverage} coverage can lead to compliance violations or integration failures`,
              });
              categoryScores.domainCoverage -= 10;
            }
          }
        }
      }
    }

    // Calculate overall score (now includes domainCoverage)
    const scoreCategories = [
      categoryScores.clarity,
      categoryScores.completeness,
      categoryScores.measurability,
      categoryScores.realism,
    ];

    // Include domainCoverage only if domains were detected
    if (detectedDomains && detectedDomains.length > 0) {
      scoreCategories.push(categoryScores.domainCoverage);
    }

    const overallScore = Math.max(0, Math.min(100, Math.round(
      scoreCategories.reduce((a, b) => a + b, 0) / scoreCategories.length
    )));

    // Generate verdict
    let verdict: string;
    if (overallScore >= 80) {
      verdict = 'Requirements are well-defined. Minor clarifications may help.';
    } else if (overallScore >= 60) {
      verdict = 'Requirements need clarification before development. Schedule Product Coverage Session.';
    } else if (overallScore >= 40) {
      verdict = 'Significant gaps detected. Development should not start without addressing findings.';
    } else {
      verdict = 'Requirements are not development-ready. Major rework needed.';
    }

    this.findings.push(...findings);

    return {
      score: overallScore,
      verdict,
      findings,
      categoryScores,
    };
  }

  /**
   * Validate test ideas using Ramsay mode (quality standards)
   * Enhanced with domain-specific quality calibration
   *
   * @param testIdeas - Test ideas to validate
   * @param category - SFDIPOT category
   * @param detectedDomains - Optional detected domains for domain-aware scoring
   */
  validateTestIdeas(
    testIdeas: TestIdea[],
    category: HTSMCategory,
    detectedDomains?: DetectedDomain[]
  ): TestIdeaValidation[] {
    const validations: TestIdeaValidation[] = [];

    // Track coverage types in this category
    const coverageTypes = new Set<string>();

    // Get domain-specific required coverage for calibration (stored for future use)
    const _requiredDomainCoverage = this.getRequiredDomainCoverage(detectedDomains);

    for (const idea of testIdeas) {
      const warnings: BrutalHonestyFinding[] = [];
      const enhancements: string[] = [];
      let qualityScore = 100;

      // Check for vague test descriptions
      for (const check of TEST_IDEA_QUALITY_STANDARDS.redFlags) {
        if (check.pattern.test(idea.description)) {
          warnings.push({
            id: this.generateFindingId(),
            mode: BrutalHonestyMode.RAMSAY,
            severity: BrutalHonestySeverity.MEDIUM,
            category: 'Test Quality',
            title: 'Vague Test Description',
            description: check.issue,
            evidence: `Test: "${idea.description.substring(0, 100)}..."`,
            recommendation: 'Rewrite with specific expected behavior and observable outcome.',
            impactIfIgnored: 'Test may pass while actual behavior is broken.',
          });
          qualityScore -= 15;
          enhancements.push('Specify exact expected behavior and observable outcome');
        }
      }

      // Domain-specific quality calibration (Ramsay mode enhanced)
      if (detectedDomains && detectedDomains.length > 0) {
        const domainQualityResult = this.calibrateDomainQuality(idea, detectedDomains);
        qualityScore += domainQualityResult.adjustment;

        if (domainQualityResult.warnings.length > 0) {
          warnings.push(...domainQualityResult.warnings);
        }
        if (domainQualityResult.enhancements.length > 0) {
          enhancements.push(...domainQualityResult.enhancements);
        }
      }

      // Track coverage type
      const desc = idea.description.toLowerCase();
      if (desc.includes('error') || desc.includes('fail') || desc.includes('invalid')) {
        coverageTypes.add('error-handling');
      } else if (desc.includes('boundary') || desc.includes('limit') || desc.includes('max') || desc.includes('min')) {
        coverageTypes.add('boundary-conditions');
      } else if (desc.includes('edge') || desc.includes('corner') || desc.includes('unusual')) {
        coverageTypes.add('edge-cases');
      } else if (desc.includes('valid') && !desc.includes('invalid')) {
        coverageTypes.add('validation-failures');
      } else {
        coverageTypes.add('happy-path');
      }

      // Check priority alignment
      const priorityKeywords = TEST_IDEA_QUALITY_STANDARDS.priorityRules[idea.priority];
      if (priorityKeywords) {
        const hasAlignedKeywords = priorityKeywords.some(kw => desc.includes(kw));
        if (!hasAlignedKeywords && idea.priority === Priority.P0) {
          warnings.push({
            id: this.generateFindingId(),
            mode: BrutalHonestyMode.RAMSAY,
            severity: BrutalHonestySeverity.LOW,
            category: 'Priority Alignment',
            title: 'P0 Priority May Be Over-assigned',
            description: `P0 test doesn't mention security, data-loss, crash, payment, or authentication`,
            evidence: `Test: "${idea.description.substring(0, 80)}..."`,
            recommendation: 'Verify this is truly critical. P0 should be reserved for security/data-loss/crash scenarios.',
            impactIfIgnored: 'Priority inflation makes real P0 issues harder to identify.',
          });
          qualityScore -= 5;
        }
      }

      const isValid = warnings.length === 0;

      validations.push({
        originalIdea: idea,
        isValid,
        qualityScore: Math.max(0, qualityScore),
        warnings,
        enhancements,
      });
    }

    // Check for missing coverage types
    const missingCoverage = TEST_IDEA_QUALITY_STANDARDS.mustCover.filter(
      type => !coverageTypes.has(type)
    );

    if (missingCoverage.length > 0) {
      const finding: BrutalHonestyFinding = {
        id: this.generateFindingId(),
        mode: BrutalHonestyMode.RAMSAY,
        severity: BrutalHonestySeverity.HIGH,
        category: 'Coverage Gap',
        title: `Missing Test Coverage in ${category}`,
        description: `Category lacks tests for: ${missingCoverage.join(', ')}`,
        evidence: `Only found coverage for: ${Array.from(coverageTypes).join(', ')}`,
        recommendation: `Add test ideas for: ${missingCoverage.map(m => m.replace('-', ' ')).join(', ')}`,
        impactIfIgnored: 'Happy-path testing misses the bugs that actually affect users.',
      };
      this.findings.push(finding);

      // Add the finding to the first validation as a category-level warning
      if (validations.length > 0) {
        validations[0].warnings.push(finding);
      }
    }

    return validations;
  }

  /**
   * Enhance clarifying questions using Linus mode (technical precision)
   */
  enhanceQuestions(questions: ClarifyingQuestion[], context: string): EnhancedQuestion[] {
    const enhanced: EnhancedQuestion[] = [];

    for (const question of questions) {
      // Determine risk if unanswered based on category
      let riskIfUnanswered = BrutalHonestySeverity.MEDIUM;
      const qLower = question.question.toLowerCase();

      if (qLower.includes('security') || qLower.includes('authentication') || qLower.includes('authorization')) {
        riskIfUnanswered = BrutalHonestySeverity.CRITICAL;
      } else if (qLower.includes('data') || qLower.includes('persist') || qLower.includes('storage')) {
        riskIfUnanswered = BrutalHonestySeverity.HIGH;
      } else if (qLower.includes('performance') || qLower.includes('scale') || qLower.includes('load')) {
        riskIfUnanswered = BrutalHonestySeverity.HIGH;
      } else if (qLower.includes('error') || qLower.includes('fail') || qLower.includes('timeout')) {
        riskIfUnanswered = BrutalHonestySeverity.HIGH;
      }

      // Generate technical precision enhancements
      const technicalPrecision = this.addTechnicalPrecision(question.question);

      // Identify assumptions being challenged
      const assumptionsChallenged = this.identifyAssumptions(question.question, context);

      // Determine impact area
      const impactArea = this.determineImpactArea(question.question);

      enhanced.push({
        ...question,
        technicalPrecision,
        assumptionsChallenged,
        riskIfUnanswered,
        impactArea,
      });
    }

    return enhanced;
  }

  /**
   * Add technical precision to a question (Linus mode)
   */
  private addTechnicalPrecision(question: string): string {
    const precisionAdditions: Array<{ pattern: RegExp; addition: string }> = [
      {
        pattern: /what happens when.*offline/i,
        addition: 'Specify: What\'s the local storage strategy (IndexedDB quota)? Conflict resolution for sync? Max offline duration supported?'
      },
      {
        pattern: /how.*handle.*error/i,
        addition: 'Define: HTTP status codes mapped to user messages? Retry strategy with backoff? Circuit breaker thresholds?'
      },
      {
        pattern: /performance.*requirement/i,
        addition: 'Specify: P50/P95/P99 latency targets? Throughput requirements? Resource constraints (memory, CPU)?'
      },
      {
        pattern: /security.*authentication/i,
        addition: 'Define: Token type (JWT/opaque)? Expiration policy? Refresh mechanism? MFA requirements?'
      },
      {
        pattern: /scale.*users/i,
        addition: 'Specify: Concurrent vs total users? Geographic distribution? Peak load patterns? Database sharding strategy?'
      },
      {
        pattern: /data.*retention/i,
        addition: 'Define: Retention period by data type? Archival strategy? GDPR deletion requirements? Audit trail preservation?'
      },
      {
        pattern: /integration.*api/i,
        addition: 'Specify: API versioning strategy? Rate limits? SLA expectations? Fallback behavior?'
      },
      {
        pattern: /browser.*support/i,
        addition: 'Define: Minimum browser versions? Feature detection vs graceful degradation? Polyfill strategy?'
      },
    ];

    for (const { pattern, addition } of precisionAdditions) {
      if (pattern.test(question)) {
        return addition;
      }
    }

    return 'Ensure answer includes: specific thresholds, measurable criteria, and edge case handling.';
  }

  /**
   * Identify assumptions being challenged by the question
   */
  private identifyAssumptions(question: string, _context: string): string[] {
    const assumptions: string[] = [];
    const qLower = question.toLowerCase();

    if (qLower.includes('what happens when') || qLower.includes('what if')) {
      assumptions.push('Assumes happy-path is the only scenario');
    }
    if (qLower.includes('how long') || qLower.includes('timeout')) {
      assumptions.push('Assumes unlimited time/resources available');
    }
    if (qLower.includes('concurrent') || qLower.includes('simultaneous')) {
      assumptions.push('Assumes single-user operation');
    }
    if (qLower.includes('fallback') || qLower.includes('alternative')) {
      assumptions.push('Assumes primary path always works');
    }
    if (qLower.includes('minimum') || qLower.includes('maximum')) {
      assumptions.push('Assumes no boundary conditions');
    }
    if (qLower.includes('permission') || qLower.includes('authorization')) {
      assumptions.push('Assumes all users have required permissions');
    }

    if (assumptions.length === 0) {
      assumptions.push('Challenges implicit assumptions in requirements');
    }

    return assumptions;
  }

  /**
   * Determine the impact area of a question
   */
  private determineImpactArea(question: string): string {
    const qLower = question.toLowerCase();

    if (qLower.includes('security') || qLower.includes('auth')) return 'Security & Compliance';
    if (qLower.includes('performance') || qLower.includes('scale') || qLower.includes('load')) return 'Performance & Scalability';
    if (qLower.includes('data') || qLower.includes('storage') || qLower.includes('persist')) return 'Data Integrity';
    if (qLower.includes('user') || qLower.includes('ux') || qLower.includes('interface')) return 'User Experience';
    if (qLower.includes('integration') || qLower.includes('api') || qLower.includes('third-party')) return 'System Integration';
    if (qLower.includes('error') || qLower.includes('fail') || qLower.includes('exception')) return 'Reliability';
    if (qLower.includes('deploy') || qLower.includes('release') || qLower.includes('rollback')) return 'Operations';

    return 'Requirements Clarity';
  }

  /**
   * Get all findings from this analyzer instance
   */
  getFindings(): BrutalHonestyFinding[] {
    return this.findings;
  }

  /**
   * Clear all findings
   */
  clearFindings(): void {
    this.findings = [];
    this.findingIdCounter = 0;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalFindings: number;
    bySeverity: Record<BrutalHonestySeverity, number>;
    byMode: Record<BrutalHonestyMode, number>;
  } {
    const bySeverity: Record<BrutalHonestySeverity, number> = {
      [BrutalHonestySeverity.CRITICAL]: 0,
      [BrutalHonestySeverity.HIGH]: 0,
      [BrutalHonestySeverity.MEDIUM]: 0,
      [BrutalHonestySeverity.LOW]: 0,
    };

    const byMode: Record<BrutalHonestyMode, number> = {
      [BrutalHonestyMode.BACH]: 0,
      [BrutalHonestyMode.RAMSAY]: 0,
      [BrutalHonestyMode.LINUS]: 0,
    };

    for (const finding of this.findings) {
      bySeverity[finding.severity]++;
      byMode[finding.mode]++;
    }

    return {
      totalFindings: this.findings.length,
      bySeverity,
      byMode,
    };
  }

  /**
   * Calibrate quality score based on domain-specific requirements
   * Rewards test ideas that address domain-specific concerns
   * Penalizes generic test ideas in domains that require specificity
   */
  private calibrateDomainQuality(
    idea: TestIdea,
    detectedDomains: DetectedDomain[]
  ): { adjustment: number; warnings: BrutalHonestyFinding[]; enhancements: string[] } {
    let adjustment = 0;
    const warnings: BrutalHonestyFinding[] = [];
    const enhancements: string[] = [];
    const desc = idea.description.toLowerCase();
    const _tags = (idea.tags || []).map(t => t.toLowerCase());

    for (const domain of detectedDomains) {
      // Skip low-confidence domains
      if (domain.confidence < 0.5) continue;

      // Domain-specific quality calibration
      switch (domain.domain) {
        case 'stripe-subscription':
          // Reward Stripe-specific test ideas
          if (desc.includes('stripe') || desc.includes('webhook') || desc.includes('subscription')) {
            adjustment += 10;
          }
          if (desc.includes('idempotent') || desc.includes('retry') || desc.includes('proration')) {
            adjustment += 15; // These are high-value Stripe concepts
          }
          // Penalize generic payment tests
          if (desc.includes('payment') && !desc.includes('stripe') && !desc.includes('webhook')) {
            warnings.push({
              id: this.generateFindingId(),
              mode: BrutalHonestyMode.RAMSAY,
              severity: BrutalHonestySeverity.MEDIUM,
              category: 'Domain Specificity',
              title: 'Generic Payment Test in Stripe Context',
              description: 'This payment test should mention Stripe-specific concepts like webhooks, idempotency, or subscription lifecycle',
              evidence: `Test: "${desc.substring(0, 80)}..."`,
              recommendation: 'Make test Stripe-specific: mention webhook handling, idempotent operations, or subscription state transitions',
              impactIfIgnored: 'Generic payment tests miss Stripe-specific edge cases like webhook retries and proration calculations',
            });
            adjustment -= 10;
            enhancements.push('Make payment test Stripe-specific (webhooks, idempotency, subscription lifecycle)');
          }
          break;

        case 'gdpr-compliance':
          // Reward GDPR-specific test ideas
          if (desc.includes('consent') || desc.includes('gdpr') || desc.includes('erasure') || desc.includes('portability')) {
            adjustment += 15;
          }
          // Penalize generic data tests in GDPR context
          if ((desc.includes('user data') || desc.includes('personal')) && !desc.includes('consent') && !desc.includes('erasure')) {
            warnings.push({
              id: this.generateFindingId(),
              mode: BrutalHonestyMode.RAMSAY,
              severity: BrutalHonestySeverity.HIGH,
              category: 'Domain Specificity',
              title: 'Missing GDPR Specificity',
              description: 'Personal data test should address GDPR requirements like consent, erasure rights, or data portability',
              evidence: `Test: "${desc.substring(0, 80)}..."`,
              recommendation: 'Add GDPR-specific verification: consent collection, right to erasure, data portability export',
              impactIfIgnored: 'Non-compliance with GDPR can result in fines up to 4% of annual global revenue',
            });
            adjustment -= 15;
            enhancements.push('Add GDPR-specific verification (consent, erasure, portability)');
          }
          break;

        case 'pci-dss':
          // Reward PCI-DSS-specific test ideas
          if (desc.includes('pci') || desc.includes('card data') || desc.includes('tokenization') || desc.includes('encryption')) {
            adjustment += 15;
          }
          // Check for PCI violations
          if (desc.includes('store') && (desc.includes('card') || desc.includes('cvv') || desc.includes('pan'))) {
            if (!desc.includes('token') && !desc.includes('encrypt')) {
              warnings.push({
                id: this.generateFindingId(),
                mode: BrutalHonestyMode.RAMSAY,
                severity: BrutalHonestySeverity.CRITICAL,
                category: 'Domain Specificity',
                title: 'PCI-DSS Compliance Risk',
                description: 'Storing card data without mentioning tokenization or encryption is a PCI violation',
                evidence: `Test: "${desc.substring(0, 80)}..."`,
                recommendation: 'Never store raw card data - use tokenization via Stripe or encrypt per PCI requirements',
                impactIfIgnored: 'PCI-DSS violations can result in significant fines and loss of ability to process cards',
              });
              adjustment -= 25;
              enhancements.push('Verify tokenization/encryption for card data - never store raw PANs or CVVs');
            }
          }
          break;

        case 'hipaa':
          // Reward HIPAA-specific test ideas
          if (desc.includes('hipaa') || desc.includes('phi') || desc.includes('audit log') || desc.includes('access control')) {
            adjustment += 15;
          }
          // Check for HIPAA-sensitive data handling
          if ((desc.includes('patient') || desc.includes('medical') || desc.includes('health')) && !desc.includes('access')) {
            warnings.push({
              id: this.generateFindingId(),
              mode: BrutalHonestyMode.RAMSAY,
              severity: BrutalHonestySeverity.HIGH,
              category: 'Domain Specificity',
              title: 'Missing HIPAA Access Control',
              description: 'PHI access test should verify role-based access controls and audit logging',
              evidence: `Test: "${desc.substring(0, 80)}..."`,
              recommendation: 'Add access control verification: role-based permissions, minimum necessary access, audit logging',
              impactIfIgnored: 'HIPAA violations can result in fines up to $1.5M per violation category',
            });
            adjustment -= 10;
            enhancements.push('Add HIPAA access control verification (RBAC, audit logging)');
          }
          break;

        case 'oauth-oidc':
          // Reward OAuth/OIDC-specific test ideas
          if (desc.includes('oauth') || desc.includes('oidc') || desc.includes('token') || desc.includes('refresh')) {
            adjustment += 10;
          }
          if (desc.includes('pkce') || desc.includes('state parameter') || desc.includes('nonce')) {
            adjustment += 15; // These are security-critical OAuth concepts
          }
          // Check for OAuth security concerns
          if (desc.includes('redirect') && !desc.includes('validate') && !desc.includes('whitelist')) {
            warnings.push({
              id: this.generateFindingId(),
              mode: BrutalHonestyMode.RAMSAY,
              severity: BrutalHonestySeverity.HIGH,
              category: 'Domain Specificity',
              title: 'Missing OAuth Redirect Validation',
              description: 'OAuth redirect test should verify redirect URI validation to prevent open redirects',
              evidence: `Test: "${desc.substring(0, 80)}..."`,
              recommendation: 'Add redirect URI validation testing: whitelist enforcement, exact match vs pattern match',
              impactIfIgnored: 'Unvalidated redirects enable OAuth token theft attacks',
            });
            adjustment -= 10;
            enhancements.push('Add redirect URI validation testing (whitelist, exact match)');
          }
          break;

        case 'webhook-integration':
          // Reward webhook-specific test ideas
          if (desc.includes('idempotent') || desc.includes('retry') || desc.includes('signature') || desc.includes('webhook')) {
            adjustment += 15;
          }
          // Check for webhook security concerns
          if (desc.includes('webhook') && !desc.includes('signature') && !desc.includes('verify') && !desc.includes('hmac')) {
            warnings.push({
              id: this.generateFindingId(),
              mode: BrutalHonestyMode.RAMSAY,
              severity: BrutalHonestySeverity.HIGH,
              category: 'Domain Specificity',
              title: 'Missing Webhook Signature Verification',
              description: 'Webhook test should verify signature validation to prevent spoofed webhooks',
              evidence: `Test: "${desc.substring(0, 80)}..."`,
              recommendation: 'Add webhook signature verification testing: HMAC validation, replay attack prevention',
              impactIfIgnored: 'Unverified webhooks can be spoofed, leading to data manipulation or unauthorized actions',
            });
            adjustment -= 10;
            enhancements.push('Add webhook signature verification testing (HMAC, replay prevention)');
          }
          break;
      }
    }

    // Cap adjustments to reasonable range
    adjustment = Math.max(-30, Math.min(20, adjustment));

    return { adjustment, warnings, enhancements };
  }

  /**
   * Get domain-specific BS patterns for detected domains
   * Uses DomainPatternRegistry to fetch patterns for all detected domains
   */
  private getDomainBSPatterns(detectedDomains?: DetectedDomain[]): DomainBSPattern[] {
    if (!detectedDomains || detectedDomains.length === 0) {
      return [];
    }

    // Get domain names with sufficient confidence (>= 0.4)
    const domainNames = detectedDomains
      .filter(d => d.confidence >= 0.4)
      .map(d => d.domain);

    if (domainNames.length === 0) {
      return [];
    }

    // Use the registry to get domain-specific BS patterns
    return domainPatternRegistry.getBSPatterns(domainNames);
  }

  /**
   * Get required test coverage for detected domains
   * Returns combined required coverage from all detected domains
   */
  getRequiredDomainCoverage(detectedDomains?: DetectedDomain[]): string[] {
    if (!detectedDomains || detectedDomains.length === 0) {
      return [];
    }

    const requiredCoverage = new Set<string>();

    for (const domain of detectedDomains) {
      if (domain.confidence >= 0.5) {
        for (const coverage of domain.requiredCoverage) {
          requiredCoverage.add(coverage);
        }
      }
    }

    return Array.from(requiredCoverage);
  }

  /**
   * Validate test coverage against domain requirements
   * Returns missing coverage areas
   */
  validateDomainCoverage(
    testIdeas: TestIdea[],
    detectedDomains?: DetectedDomain[]
  ): { missing: string[]; covered: string[]; score: number } {
    const requiredCoverage = this.getRequiredDomainCoverage(detectedDomains);

    if (requiredCoverage.length === 0) {
      return { missing: [], covered: [], score: 100 };
    }

    const testDescriptions = testIdeas.map(t => t.description.toLowerCase()).join(' ');
    const covered: string[] = [];
    const missing: string[] = [];

    for (const coverage of requiredCoverage) {
      // Create a flexible pattern to check for coverage
      const coverageWords = coverage.toLowerCase().split('-');
      const isPresent = coverageWords.some(word => testDescriptions.includes(word));

      if (isPresent) {
        covered.push(coverage);
      } else {
        missing.push(coverage);
      }
    }

    const score = requiredCoverage.length > 0
      ? Math.round((covered.length / requiredCoverage.length) * 100)
      : 100;

    return { missing, covered, score };
  }
}

/**
 * Export singleton instance for use across the assessment
 */
export const brutalHonestyAnalyzer = new BrutalHonestyAnalyzer();
