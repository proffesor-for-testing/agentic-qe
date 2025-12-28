/**
 * Skill Integration for Product Factors Assessor
 *
 * Integrates with existing QE skills to enhance test idea generation
 * and analysis based on skill-specific heuristics.
 */

import {
  HTSMCategory,
  TestIdea,
  Priority,
  AutomationFitness,
  ProjectContext,
  generateTestId,
} from '../types';

/**
 * Skill mapping for SFDIPOT categories
 */
export interface SkillMapping {
  skillName: string;
  categories: HTSMCategory[];
  enhancementType: 'test-ideas' | 'heuristics' | 'questions';
}

/**
 * Available skill integrations
 */
export const SKILL_MAPPINGS: SkillMapping[] = [
  {
    skillName: 'exploratory-testing-advanced',
    categories: [HTSMCategory.FUNCTION, HTSMCategory.OPERATIONS, HTSMCategory.DATA],
    enhancementType: 'heuristics',
  },
  {
    skillName: 'risk-based-testing',
    categories: [HTSMCategory.FUNCTION, HTSMCategory.DATA, HTSMCategory.TIME],
    enhancementType: 'test-ideas',
  },
  {
    skillName: 'context-driven-testing',
    categories: Object.values(HTSMCategory),
    enhancementType: 'heuristics',
  },
  {
    skillName: 'api-testing-patterns',
    categories: [HTSMCategory.INTERFACES, HTSMCategory.DATA],
    enhancementType: 'test-ideas',
  },
  {
    skillName: 'security-testing',
    categories: [HTSMCategory.FUNCTION, HTSMCategory.INTERFACES],
    enhancementType: 'test-ideas',
  },
  {
    skillName: 'performance-testing',
    categories: [HTSMCategory.TIME, HTSMCategory.OPERATIONS, HTSMCategory.PLATFORM],
    enhancementType: 'test-ideas',
  },
  {
    skillName: 'accessibility-testing',
    categories: [HTSMCategory.INTERFACES, HTSMCategory.OPERATIONS],
    enhancementType: 'test-ideas',
  },
];

/**
 * Skill Integration Service
 *
 * Provides additional test ideas and heuristics based on
 * integrated QE skills.
 */
export class SkillIntegration {
  private enabledSkills: Set<string>;

  constructor(enabledSkills?: string[]) {
    this.enabledSkills = new Set(
      enabledSkills || SKILL_MAPPINGS.map(s => s.skillName)
    );
  }

  /**
   * Get relevant skills for a category
   */
  getSkillsForCategory(category: HTSMCategory): SkillMapping[] {
    return SKILL_MAPPINGS.filter(
      mapping => mapping.categories.includes(category) &&
                 this.enabledSkills.has(mapping.skillName)
    );
  }

  /**
   * Generate skill-enhanced test ideas for a category
   */
  generateEnhancedTestIdeas(
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];
    const relevantSkills = this.getSkillsForCategory(category);

    for (const skill of relevantSkills) {
      const skillIdeas = this.getSkillTestIdeas(skill.skillName, category, context);
      ideas.push(...skillIdeas);
    }

    return ideas;
  }

  /**
   * Get test ideas from a specific skill
   */
  private getSkillTestIdeas(
    skillName: string,
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    switch (skillName) {
      case 'exploratory-testing-advanced':
        return this.getExploratoryTestIdeas(category, context);
      case 'risk-based-testing':
        return this.getRiskBasedTestIdeas(category, context);
      case 'api-testing-patterns':
        return this.getApiTestIdeas(category, context);
      case 'security-testing':
        return this.getSecurityTestIdeas(category, context);
      case 'performance-testing':
        return this.getPerformanceTestIdeas(category, context);
      case 'accessibility-testing':
        return this.getAccessibilityTestIdeas(category, context);
      default:
        return [];
    }
  }

  /**
   * Exploratory testing heuristics (RST/SBTM)
   */
  private getExploratoryTestIdeas(
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    // SBTM Charter-based ideas
    if (category === HTSMCategory.FUNCTION) {
      ideas.push({
        id: generateTestId(category),
        category,
        subcategory: 'Application',
        description: 'Explore feature with varied input combinations using SBTM session',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Human,
        tags: ['exploratory', 'sbtm', 'charter'],
        rationale: 'Session-based exploration finds unexpected behaviors',
      });
    }

    // Heuristic test tours
    if (category === HTSMCategory.OPERATIONS) {
      const tours = [
        { name: 'FedEx Tour', desc: 'Follow data through the system end-to-end' },
        { name: 'Garbage Collector Tour', desc: 'Look for orphaned features and dead code paths' },
        { name: 'Bad Neighborhood Tour', desc: 'Focus on historically buggy areas' },
      ];

      for (const tour of tours) {
        ideas.push({
          id: generateTestId(category),
          category,
          subcategory: 'CommonUse',
          description: `${tour.name}: ${tour.desc}`,
          priority: Priority.P2,
          automationFitness: AutomationFitness.Human,
          tags: ['exploratory', 'tour', tour.name.toLowerCase().replace(/\s+/g, '-')],
          rationale: 'Test tours provide structured exploration coverage',
        });
      }
    }

    return ideas;
  }

  /**
   * Risk-based testing ideas
   */
  private getRiskBasedTestIdeas(
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    // Domain-specific risk areas
    const riskAreas = this.getDomainRiskAreas(context.domain);

    for (const risk of riskAreas) {
      if (risk.categories.includes(category)) {
        ideas.push({
          id: generateTestId(category),
          category,
          subcategory: risk.subcategory,
          description: risk.testIdea,
          priority: risk.priority,
          automationFitness: risk.automation,
          tags: ['risk-based', risk.riskType],
          rationale: risk.rationale,
        });
      }
    }

    return ideas;
  }

  /**
   * Get domain-specific risk areas
   */
  private getDomainRiskAreas(domain: string): Array<{
    categories: HTSMCategory[];
    subcategory: string;
    testIdea: string;
    priority: Priority;
    automation: AutomationFitness;
    riskType: string;
    rationale: string;
  }> {
    const commonRisks = [
      {
        categories: [HTSMCategory.DATA],
        subcategory: 'Persistence',
        testIdea: 'Test data integrity under concurrent modifications',
        priority: Priority.P0,
        automation: AutomationFitness.Concurrency,
        riskType: 'data-integrity',
        rationale: 'Data corruption is high-impact',
      },
      {
        categories: [HTSMCategory.TIME],
        subcategory: 'Timeout',
        testIdea: 'Verify graceful handling of network timeouts',
        priority: Priority.P1,
        automation: AutomationFitness.Integration,
        riskType: 'reliability',
        rationale: 'Timeout handling affects user experience',
      },
    ];

    const domainRisks: Record<string, typeof commonRisks> = {
      ecommerce: [
        {
          categories: [HTSMCategory.FUNCTION],
          subcategory: 'Calculation',
          testIdea: 'Verify pricing calculations with promotions and discounts',
          priority: Priority.P0,
          automation: AutomationFitness.API,
          riskType: 'financial',
          rationale: 'Pricing errors cause revenue loss',
        },
        {
          categories: [HTSMCategory.DATA],
          subcategory: 'Boundaries',
          testIdea: 'Test inventory boundary conditions (0, negative, max)',
          priority: Priority.P1,
          automation: AutomationFitness.API,
          riskType: 'inventory',
          rationale: 'Inventory errors affect fulfillment',
        },
      ],
      healthcare: [
        {
          categories: [HTSMCategory.FUNCTION],
          subcategory: 'Security',
          testIdea: 'Verify PHI access controls and audit logging',
          priority: Priority.P0,
          automation: AutomationFitness.Security,
          riskType: 'compliance',
          rationale: 'HIPAA compliance is mandatory',
        },
      ],
      finance: [
        {
          categories: [HTSMCategory.FUNCTION],
          subcategory: 'Calculation',
          testIdea: 'Verify financial calculations maintain precision',
          priority: Priority.P0,
          automation: AutomationFitness.API,
          riskType: 'financial',
          rationale: 'Rounding errors cause compliance issues',
        },
      ],
    };

    return [...commonRisks, ...(domainRisks[domain] || [])];
  }

  /**
   * API testing pattern ideas
   */
  private getApiTestIdeas(
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    if (category !== HTSMCategory.INTERFACES) return [];

    return [
      {
        id: generateTestId(category),
        category,
        subcategory: 'ApiSdk',
        description: 'Verify API contract compliance with OpenAPI/Swagger schema',
        priority: Priority.P1,
        automationFitness: AutomationFitness.API,
        tags: ['api', 'contract', 'schema'],
        rationale: 'Contract testing prevents breaking changes',
      },
      {
        id: generateTestId(category),
        category,
        subcategory: 'ApiSdk',
        description: 'Test API pagination with various page sizes and edge cases',
        priority: Priority.P2,
        automationFitness: AutomationFitness.API,
        tags: ['api', 'pagination'],
        rationale: 'Pagination bugs affect data retrieval',
      },
      {
        id: generateTestId(category),
        category,
        subcategory: 'ApiSdk',
        description: 'Verify API error responses match documented formats',
        priority: Priority.P2,
        automationFitness: AutomationFitness.API,
        tags: ['api', 'error-handling'],
        rationale: 'Consistent errors improve client integration',
      },
    ];
  }

  /**
   * Security testing ideas
   */
  private getSecurityTestIdeas(
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    if (category === HTSMCategory.FUNCTION) {
      ideas.push(
        {
          id: generateTestId(category),
          category,
          subcategory: 'Security',
          description: 'Test for SQL injection vulnerabilities in all input fields',
          priority: Priority.P0,
          automationFitness: AutomationFitness.Security,
          tags: ['security', 'owasp', 'injection'],
          rationale: 'OWASP Top 10: Injection attacks',
        },
        {
          id: generateTestId(category),
          category,
          subcategory: 'Security',
          description: 'Verify XSS prevention in user-generated content',
          priority: Priority.P0,
          automationFitness: AutomationFitness.Security,
          tags: ['security', 'owasp', 'xss'],
          rationale: 'OWASP Top 10: Cross-site scripting',
        },
        {
          id: generateTestId(category),
          category,
          subcategory: 'Security',
          description: 'Test CSRF token validation on state-changing operations',
          priority: Priority.P0,
          automationFitness: AutomationFitness.Security,
          tags: ['security', 'owasp', 'csrf'],
          rationale: 'OWASP Top 10: Cross-site request forgery',
        }
      );
    }

    if (category === HTSMCategory.INTERFACES) {
      ideas.push({
        id: generateTestId(category),
        category,
        subcategory: 'ApiSdk',
        description: 'Verify API authentication tokens cannot be reused after logout',
        priority: Priority.P0,
        automationFitness: AutomationFitness.Security,
        tags: ['security', 'authentication', 'session'],
        rationale: 'Token security prevents unauthorized access',
      });
    }

    return ideas;
  }

  /**
   * Performance testing ideas
   */
  private getPerformanceTestIdeas(
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    if (category === HTSMCategory.TIME) {
      ideas.push(
        {
          id: generateTestId(category),
          category,
          subcategory: 'Timing',
          description: 'Measure and verify P95 response times under normal load',
          priority: Priority.P1,
          automationFitness: AutomationFitness.Performance,
          tags: ['performance', 'latency', 'sla'],
          rationale: 'Response time affects user experience',
        },
        {
          id: generateTestId(category),
          category,
          subcategory: 'Concurrency',
          description: 'Load test with expected concurrent user count',
          priority: Priority.P1,
          automationFitness: AutomationFitness.Performance,
          tags: ['performance', 'load', 'scalability'],
          rationale: 'Validates system capacity',
        }
      );
    }

    if (category === HTSMCategory.OPERATIONS) {
      ideas.push({
        id: generateTestId(category),
        category,
        subcategory: 'ExtremeUse',
        description: 'Stress test with 2x expected peak load',
        priority: Priority.P2,
        automationFitness: AutomationFitness.Performance,
        tags: ['performance', 'stress', 'breaking-point'],
        rationale: 'Identifies system breaking points',
      });
    }

    return ideas;
  }

  /**
   * Accessibility testing ideas
   */
  private getAccessibilityTestIdeas(
    category: HTSMCategory,
    context: ProjectContext
  ): TestIdea[] {
    if (category !== HTSMCategory.INTERFACES) return [];

    return [
      {
        id: generateTestId(category),
        category,
        subcategory: 'UserInterface',
        description: 'Verify WCAG 2.1 AA compliance using automated scanning',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Accessibility,
        tags: ['a11y', 'wcag', 'compliance'],
        rationale: 'Accessibility is a legal requirement in many jurisdictions',
      },
      {
        id: generateTestId(category),
        category,
        subcategory: 'UserInterface',
        description: 'Test complete keyboard navigation without mouse',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Accessibility,
        tags: ['a11y', 'keyboard', 'navigation'],
        rationale: 'Keyboard access is essential for motor disabilities',
      },
      {
        id: generateTestId(category),
        category,
        subcategory: 'UserInterface',
        description: 'Verify screen reader compatibility (NVDA/JAWS/VoiceOver)',
        priority: Priority.P1,
        automationFitness: AutomationFitness.Human,
        tags: ['a11y', 'screen-reader', 'assistive'],
        rationale: 'Screen reader support enables blind users',
      },
      {
        id: generateTestId(category),
        category,
        subcategory: 'UserInterface',
        description: 'Test color contrast ratios meet WCAG requirements',
        priority: Priority.P2,
        automationFitness: AutomationFitness.Visual,
        tags: ['a11y', 'contrast', 'visual'],
        rationale: 'Color contrast aids low-vision users',
      },
    ];
  }

  /**
   * Get all available skill names
   */
  getAvailableSkills(): string[] {
    return SKILL_MAPPINGS.map(s => s.skillName);
  }

  /**
   * Enable a specific skill
   */
  enableSkill(skillName: string): void {
    this.enabledSkills.add(skillName);
  }

  /**
   * Disable a specific skill
   */
  disableSkill(skillName: string): void {
    this.enabledSkills.delete(skillName);
  }
}
