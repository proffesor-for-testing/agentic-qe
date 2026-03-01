/**
 * Clarifying Question Generator
 *
 * Generates clarifying questions for SFDIPOT subcategories that lack
 * sufficient coverage in the input documentation.
 */

import {
  HTSMCategory,
  StructureSubcategory,
  FunctionSubcategory,
  DataSubcategory,
  InterfacesSubcategory,
  PlatformSubcategory,
  OperationsSubcategory,
  TimeSubcategory,
  ClarifyingQuestion,
  ProjectContext,
} from '../types';
import {
  CategoryAnalysisResult,
  SubcategoryAnalysis,
  BrutalHonestyAnalyzer,
  EnhancedQuestion,
  BrutalHonestySeverity,
} from '../analyzers';
import {
  domainPatternRegistry,
} from '../patterns/domain-registry';
import { DetectedDomain } from '../types';

export interface QuestionGeneratorConfig {
  maxQuestionsPerCategory: number;
  coverageThreshold: number; // Generate questions if coverage below this
  enableBrutalHonesty?: boolean; // Enable Linus-mode precision
}

/**
 * Result of generating questions with enhancements
 */
export interface QuestionGenerationResult {
  questions: ClarifyingQuestion[];
  enhancedQuestions: EnhancedQuestion[];
  criticalQuestions: EnhancedQuestion[];  // Questions with CRITICAL risk if unanswered
  highRiskQuestions: EnhancedQuestion[];  // Questions with HIGH risk if unanswered
}

/**
 * Question Generator
 *
 * Generates context-aware clarifying questions to fill coverage gaps
 * in the input documentation.
 */
export class QuestionGenerator {
  private config: QuestionGeneratorConfig;
  private brutalHonestyAnalyzer: BrutalHonestyAnalyzer;

  constructor(config: Partial<QuestionGeneratorConfig> = {}) {
    this.config = {
      maxQuestionsPerCategory: config.maxQuestionsPerCategory || 5,
      coverageThreshold: config.coverageThreshold || 0.3,
      enableBrutalHonesty: config.enableBrutalHonesty ?? true,
    };
    this.brutalHonestyAnalyzer = new BrutalHonestyAnalyzer();
  }

  /**
   * Generate questions for gaps in category analysis
   * Enhanced with domain-specific clarifying questions
   */
  generateForCategory(
    analysis: CategoryAnalysisResult,
    context: ProjectContext
  ): ClarifyingQuestion[] {
    const questions: ClarifyingQuestion[] = [];

    // First, inject domain-specific questions (highest priority)
    if (context.detectedDomains && context.detectedDomains.length > 0) {
      const domainQuestions = this.generateDomainSpecificQuestions(
        analysis.category,
        context.detectedDomains
      );
      questions.push(...domainQuestions);
    }

    // Then add generic gap-filling questions
    const uncovered = analysis.subcategoryAnalysis.filter(
      s => s.relevance < this.config.coverageThreshold
    );

    const remainingSlots = this.config.maxQuestionsPerCategory - questions.length;
    for (const subcatAnalysis of uncovered.slice(0, remainingSlots)) {
      const question = this.generateQuestion(
        analysis.category,
        subcatAnalysis,
        context
      );
      if (question) {
        questions.push(question);
      }
    }

    return questions;
  }

  /**
   * Generate domain-specific clarifying questions
   * These are expert-crafted questions for specific domains like Stripe, GDPR, etc.
   */
  private generateDomainSpecificQuestions(
    category: HTSMCategory,
    detectedDomains: DetectedDomain[]
  ): ClarifyingQuestion[] {
    const questions: ClarifyingQuestion[] = [];

    // Get domain names with sufficient confidence
    const domainNames = detectedDomains
      .filter(d => d.confidence >= 0.5)
      .map(d => d.domain);

    if (domainNames.length === 0) {
      return questions;
    }

    // Get clarifying questions from the registry for each domain
    for (const domainName of domainNames) {
      const pattern = domainPatternRegistry.getPattern(domainName);
      if (pattern && pattern.clarifyingQuestions) {
        // Filter questions relevant to this category
        const relevantQuestions = pattern.clarifyingQuestions.filter(
          q => q.category === category
        );

        // Add up to 2 questions per domain per category
        for (const q of relevantQuestions.slice(0, 2)) {
          const question: ClarifyingQuestion = {
            category: q.category,
            subcategory: domainName,  // Use domain name as subcategory for domain-specific questions
            question: q.question,
            rationale: q.riskIfUnanswered,
            source: 'template',  // Domain-specific questions are template-based
          };
          questions.push(question);
        }
      }
    }

    return questions;
  }

  /**
   * Generate questions with brutal honesty enhancements (Linus mode)
   *
   * This method generates questions and enhances them with:
   * - Technical precision requirements
   * - Assumptions being challenged
   * - Risk severity if left unanswered
   * - Impact area identification
   */
  generateWithEnhancements(
    analysis: CategoryAnalysisResult,
    context: ProjectContext,
    requirementsContext: string
  ): QuestionGenerationResult {
    // Generate base questions
    const questions = this.generateForCategory(analysis, context);

    // Skip enhancement if brutal honesty is disabled
    if (!this.config.enableBrutalHonesty) {
      return {
        questions,
        enhancedQuestions: [],
        criticalQuestions: [],
        highRiskQuestions: [],
      };
    }

    // Enhance questions using Linus mode
    const enhancedQuestions = this.brutalHonestyAnalyzer.enhanceQuestions(
      questions,
      requirementsContext
    );

    // Categorize by risk level
    const criticalQuestions = enhancedQuestions.filter(
      q => q.riskIfUnanswered === BrutalHonestySeverity.CRITICAL
    );

    const highRiskQuestions = enhancedQuestions.filter(
      q => q.riskIfUnanswered === BrutalHonestySeverity.HIGH
    );

    return {
      questions,
      enhancedQuestions,
      criticalQuestions,
      highRiskQuestions,
    };
  }

  /**
   * Generate enhanced questions for all categories
   */
  generateAllWithEnhancements(
    analysisResults: Map<HTSMCategory, CategoryAnalysisResult>,
    context: ProjectContext,
    requirementsContext: string
  ): {
    allQuestions: ClarifyingQuestion[];
    allEnhanced: EnhancedQuestion[];
    byCriticality: {
      critical: EnhancedQuestion[];
      high: EnhancedQuestion[];
      medium: EnhancedQuestion[];
      low: EnhancedQuestion[];
    };
  } {
    const allQuestions: ClarifyingQuestion[] = [];
    const allEnhanced: EnhancedQuestion[] = [];

    for (const [_category, analysis] of Array.from(analysisResults.entries())) {
      const result = this.generateWithEnhancements(analysis, context, requirementsContext);
      allQuestions.push(...result.questions);
      allEnhanced.push(...result.enhancedQuestions);
    }

    // Sort by criticality
    const byCriticality = {
      critical: allEnhanced.filter(q => q.riskIfUnanswered === BrutalHonestySeverity.CRITICAL),
      high: allEnhanced.filter(q => q.riskIfUnanswered === BrutalHonestySeverity.HIGH),
      medium: allEnhanced.filter(q => q.riskIfUnanswered === BrutalHonestySeverity.MEDIUM),
      low: allEnhanced.filter(q => q.riskIfUnanswered === BrutalHonestySeverity.LOW),
    };

    return {
      allQuestions,
      allEnhanced,
      byCriticality,
    };
  }

  /**
   * Get the brutal honesty analyzer instance
   */
  getBrutalHonestyAnalyzer(): BrutalHonestyAnalyzer {
    return this.brutalHonestyAnalyzer;
  }

  /**
   * Get a penetrating question for a specific subcategory
   * This is the public API for getting penetrating questions from the template registry
   */
  getQuestionForSubcategory(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): ClarifyingQuestion | null {
    const template = this.getQuestionTemplate(category, subcategory, context);

    if (!template) {
      return null;
    }

    return {
      category,
      subcategory,
      question: template.question,
      rationale: template.rationale,
      source: 'template',
    };
  }

  /**
   * Generate a question for a specific subcategory gap
   */
  private generateQuestion(
    category: HTSMCategory,
    subcatAnalysis: SubcategoryAnalysis,
    context: ProjectContext
  ): ClarifyingQuestion | null {
    const template = this.getQuestionTemplate(category, subcatAnalysis.subcategory, context);

    if (!template) {
      return null;
    }

    return {
      category,
      subcategory: subcatAnalysis.subcategory,
      question: template.question,
      rationale: template.rationale,
      source: 'template',
    };
  }

  /**
   * Get question template for a subcategory
   * Enhanced with penetrating questions that challenge assumptions and probe gaps
   */
  private getQuestionTemplate(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext
  ): { question: string; rationale: string } | null {
    // Penetrating questions that challenge assumptions (Bach mode inspired)
    const templates: Record<string, { question: string; rationale: string }> = {
      // STRUCTURE - Challenge architectural assumptions
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Code}`]: {
        question: 'What happens when a module fails to load? Is there graceful degradation or does the entire system crash? What are the module-level error boundaries?',
        rationale: 'Probes resilience - many systems assume all modules always load correctly, but production failures prove otherwise',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Hardware}`]: {
        question: 'What happens when hardware resources are exhausted (disk full, memory pressure, CPU throttling)? Are there alerts before failure?',
        rationale: 'Resource exhaustion scenarios are rarely specified but commonly occur in production',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.NonPhysical}`]: {
        question: 'What happens when environment variables are missing or malformed? Is there a configuration validation step at startup?',
        rationale: 'Configuration errors cause mysterious production failures that are hard to diagnose',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Dependencies}`]: {
        question: 'What is the fallback strategy when a dependency (API, database, cache) is unavailable? What is the retry/circuit-breaker policy?',
        rationale: 'Dependency failures are inevitable - the question is whether you handle them gracefully or crash',
      },
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Documentation}`]: {
        question: 'Is the API documentation generated from code or manually maintained? How are breaking changes communicated?',
        rationale: 'Manual documentation drifts from reality - need to verify documentation accuracy',
      },

      // FUNCTION - Probe edge cases and failure modes
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Application}`]: {
        question: 'What happens when a user performs an action they\'re not supposed to (bypassing UI, direct API call)? Is authorization enforced at every layer?',
        rationale: 'UI-only validation is easily bypassed - need backend enforcement',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: {
        question: 'What precision is used for monetary/financial calculations? How is floating-point rounding handled? Is there an audit trail for calculation inputs/outputs?',
        rationale: 'Financial calculation errors cause legal and regulatory issues - precision is critical',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.ErrorHandling}`]: {
        question: 'Are error messages sanitized to prevent information disclosure? What happens to in-flight operations when an error occurs - are they rolled back or left in inconsistent state?',
        rationale: 'Error handling often exposes sensitive data or leaves data corruption',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.StateTransition}`]: {
        question: 'What happens if two users try to transition the same entity simultaneously? Is there optimistic locking or last-write-wins? What about state transitions that span multiple services?',
        rationale: 'Concurrent state transitions cause data corruption in most systems',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: {
        question: 'How are secrets rotated without downtime? What happens to active sessions when permissions change? Is there defense-in-depth or single-point-of-failure in auth?',
        rationale: 'Security often has single points of failure that attackers exploit',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Startup}`]: {
        question: 'What happens if startup takes longer than the health check timeout? Are startup dependencies checked in the correct order? Is startup idempotent?',
        rationale: 'Race conditions during startup cause cascading failures in distributed systems',
      },
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Shutdown}`]: {
        question: 'How long do in-flight requests have to complete during shutdown? What happens to scheduled jobs during shutdown? Is shutdown order enforced?',
        rationale: 'Ungraceful shutdown causes data loss and corruption',
      },

      // DATA - Challenge data integrity assumptions
      [`${HTSMCategory.DATA}-${DataSubcategory.InputOutput}`]: {
        question: 'What happens with Unicode edge cases (emojis, RTL text, zero-width characters)? How is HTML/SQL/script injection prevented? Are file uploads validated beyond extension?',
        rationale: 'Input validation gaps are the #1 source of security vulnerabilities',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Lifecycle}`]: {
        question: 'What happens to related data when the parent is deleted? Is it cascaded, orphaned, or soft-deleted? How is deletion verified for GDPR compliance?',
        rationale: 'Data lifecycle bugs cause both data loss and compliance violations',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Cardinality}`]: {
        question: 'What happens when relationship cardinality exceeds expected bounds (10,000 items in a 1:N relationship)? Are there pagination limits enforced at the database level?',
        rationale: 'Unbounded cardinality causes memory exhaustion and performance degradation',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: {
        question: 'What happens at exactly the boundary (value = max)? What about off-by-one (value = max + 1)? Are boundaries enforced at API, database, and UI layers consistently?',
        rationale: 'Boundary conditions are the most common source of bugs - must test all boundaries explicitly',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Persistence}`]: {
        question: 'What is the consistency guarantee (eventual or strong)? What happens during write conflicts? How is data corruption detected and recovered?',
        rationale: 'Distributed systems have complex consistency semantics that are rarely tested',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Types}`]: {
        question: 'How are timezone conversions handled for users in different timezones? What happens when date/time crosses DST boundaries? How is currency precision maintained?',
        rationale: 'Date/time and currency handling are notoriously bug-prone',
      },
      [`${HTSMCategory.DATA}-${DataSubcategory.Selection}`]: {
        question: 'What happens when a search returns 0 results vs 1 million results? Are there rate limits on expensive queries? Is there SQL injection protection on dynamic filters?',
        rationale: 'Search functionality often has performance and security gaps',
      },

      // INTERFACES - Challenge integration assumptions
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.UserInterface}`]: {
        question: 'What happens when JavaScript fails to load? Is there progressive enhancement or does the UI become unusable? How is UI state preserved on page refresh?',
        rationale: 'JavaScript-dependent UIs fail silently for some users',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ApiSdk}`]: {
        question: 'How are breaking API changes versioned? What happens to clients using deprecated endpoints? Is there rate limiting per client, per endpoint, or globally?',
        rationale: 'API evolution without proper versioning breaks production clients',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.SystemInterface}`]: {
        question: 'What happens when the external system returns unexpected data formats or invalid responses? Is there retry logic with exponential backoff? How are network partitions handled?',
        rationale: 'External system failures are inevitable - defensive coding is essential',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ImportExport}`]: {
        question: 'What happens with malformed or maliciously crafted import files (CSV injection, XML bombs, zip bombs)? Are there file size limits? How is partial import failure handled?',
        rationale: 'File import is a common attack vector and failure point',
      },
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.Messaging}`]: {
        question: 'What happens when messages are delivered out of order or duplicated? Is message processing idempotent? What is the dead-letter queue strategy?',
        rationale: 'Message queue systems commonly have ordering and duplication issues',
      },

      // PLATFORM - Challenge environment assumptions
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Browser}`]: {
        question: 'What happens in browsers with JavaScript disabled or ad blockers installed? Are polyfills loaded for older browsers? How are browser-specific CSS bugs handled?',
        rationale: 'Browser assumptions break for significant user populations',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.OperatingSystem}`]: {
        question: 'Are file paths handled correctly on Windows (backslash) vs Unix (forward slash)? How are line endings normalized? Are there case-sensitivity issues with file names?',
        rationale: 'OS differences cause subtle bugs that only appear in production',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Hardware}`]: {
        question: 'What happens on low-end devices with limited RAM or slow CPUs? Is there graceful degradation of features? Are there memory leaks in long-running sessions?',
        rationale: 'Performance on low-end devices is often ignored during testing',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.ExternalSoftware}`]: {
        question: 'What happens when the database connection pool is exhausted? How is Redis cache invalidation handled? What is the behavior during rolling deployments?',
        rationale: 'Infrastructure edge cases cause production outages',
      },
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.InternalComponents}`]: {
        question: 'Are shared components versioned independently? What happens when different services use different versions? How are breaking changes in shared libraries communicated?',
        rationale: 'Shared component version conflicts cause integration failures',
      },

      // OPERATIONS - Challenge usage assumptions
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.CommonUse}`]: {
        question: 'What happens when users deviate from the expected workflow (back button, multiple tabs, browser refresh mid-operation)?',
        rationale: 'Users rarely follow the expected path - real-world usage is messy',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.UncommonUse}`]: {
        question: 'What happens when operations are performed in unusual combinations or sequences? Are there hidden dependencies between features?',
        rationale: 'Edge cases from unusual usage patterns reveal integration bugs',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.ExtremeUse}`]: {
        question: 'What is the breaking point? At what load does the system degrade vs crash? Are there circuit breakers to prevent cascade failures? What is the recovery time after overload?',
        rationale: 'Every system has a breaking point - need to know it before production discovers it',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.DisfavoredUse}`]: {
        question: 'How are abuse attempts detected and logged? Is there rate limiting on sensitive operations? How are brute-force attacks prevented?',
        rationale: 'Malicious users will find and exploit gaps in restrictions',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Users}`]: {
        question: 'What happens when a user has multiple conflicting roles? How are role changes propagated to active sessions? Is there privilege escalation testing?',
        rationale: 'Role-based access control has complex edge cases that are rarely tested',
      },
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Environment}`]: {
        question: 'How do you ensure staging accurately reflects production? What happens when environment-specific configuration is wrong? Are there safeguards against running production code on test data?',
        rationale: 'Environment configuration errors cause production incidents',
      },

      // TIME - Challenge timing assumptions
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timing}`]: {
        question: 'What are the P95 and P99 latency targets, not just average? What happens when latency exceeds SLA - is there alerting? Is there latency tracking per operation?',
        rationale: 'Average latency hides tail latency problems that affect users',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Concurrency}`]: {
        question: 'Is there a test for exactly N concurrent operations (not just "multiple")? What is the locking strategy - row-level, table-level, distributed? How is deadlock detected and resolved?',
        rationale: 'Concurrency bugs are non-deterministic and require specific test scenarios',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Scheduling}`]: {
        question: 'What happens when a scheduled job runs longer than the interval (overlap)? How are failed jobs retried? Is there visibility into job execution history?',
        rationale: 'Scheduled job failures go unnoticed without proper monitoring',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timeout}`]: {
        question: 'What happens to downstream operations when a timeout occurs? Is there cleanup of partial state? Are timeout values configurable per environment?',
        rationale: 'Timeout handling often leaves systems in inconsistent state',
      },
      [`${HTSMCategory.TIME}-${TimeSubcategory.Sequencing}`]: {
        question: 'What happens when operations arrive out of order (network delays, retries)? Is there idempotency built into the design? How is ordering enforced across distributed components?',
        rationale: 'Distributed systems cannot guarantee ordering - need explicit handling',
      },
    };

    const key = `${category}-${subcategory}`;
    let template = templates[key];

    // Apply domain-specific customization
    if (template && context.domain !== 'generic') {
      template = this.customizeForDomain(template, context.domain, category, subcategory);
    }

    return template || null;
  }

  /**
   * Customize question for specific domain
   */
  private customizeForDomain(
    template: { question: string; rationale: string },
    domain: string,
    category: HTSMCategory,
    subcategory: string
  ): { question: string; rationale: string } {
    const domainPrefixes: Record<string, string> = {
      ecommerce: 'For the e-commerce platform, ',
      healthcare: 'Given HIPAA compliance requirements, ',
      finance: 'For financial accuracy and compliance, ',
      saas: 'For the SaaS application, ',
    };

    const prefix = domainPrefixes[domain] || '';

    // Special domain-specific questions
    if (domain === 'healthcare' && category === HTSMCategory.FUNCTION &&
        subcategory === FunctionSubcategory.Security) {
      return {
        question: 'How is PHI (Protected Health Information) secured and access controlled?',
        rationale: 'HIPAA compliance requires strict PHI protection',
      };
    }

    if (domain === 'finance' && category === HTSMCategory.DATA &&
        subcategory === DataSubcategory.Boundaries) {
      return {
        question: 'What are the precision requirements for monetary calculations?',
        rationale: 'Financial calculations require exact precision',
      };
    }

    if (domain === 'ecommerce' && category === HTSMCategory.OPERATIONS &&
        subcategory === OperationsSubcategory.ExtremeUse) {
      return {
        question: 'What are the expected traffic patterns during sales events?',
        rationale: 'E-commerce must handle traffic spikes during promotions',
      };
    }

    return {
      question: prefix + template.question.charAt(0).toLowerCase() + template.question.slice(1),
      rationale: template.rationale,
    };
  }

  /**
   * Generate questions for all categories
   */
  generateAll(
    analysisResults: Map<HTSMCategory, CategoryAnalysisResult>,
    context: ProjectContext
  ): ClarifyingQuestion[] {
    const allQuestions: ClarifyingQuestion[] = [];

    for (const [_category, analysis] of Array.from(analysisResults.entries())) {
      const questions = this.generateForCategory(analysis, context);
      allQuestions.push(...questions);
    }

    return allQuestions;
  }
}
