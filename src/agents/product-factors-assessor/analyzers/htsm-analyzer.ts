/**
 * HTSM Analyzer - Analyzes documents across all 7 HTSM Product Element categories
 */

import {
  HTSMCategory,
  HTSMSubcategory,
  HTSMAnalysisResult,
  TestableElement,
  TestOpportunity,
  TestTechnique,
  TestPriority,
  UserStory,
  FunctionalSpec,
  TechnicalArchitecture,
} from '../types/htsm.types';

export class HTSMAnalyzer {
  /**
   * Perform complete HTSM analysis across all 7 categories
   */
  analyzeAll(
    elements: TestableElement[],
    userStories: UserStory[],
    specs: FunctionalSpec[],
    architecture?: TechnicalArchitecture
  ): Map<HTSMCategory, HTSMAnalysisResult> {
    const results = new Map<HTSMCategory, HTSMAnalysisResult>();

    results.set('STRUCTURE', this.analyzeStructure(elements, architecture));
    results.set('FUNCTION', this.analyzeFunction(elements, userStories, specs));
    results.set('DATA', this.analyzeData(elements, specs));
    results.set('INTERFACES', this.analyzeInterfaces(elements, architecture));
    results.set('PLATFORM', this.analyzePlatform(architecture));
    results.set('OPERATIONS', this.analyzeOperations(elements, userStories));
    results.set('TIME', this.analyzeTime(elements, specs));

    return results;
  }

  /**
   * STRUCTURE: Everything that constitutes the physical product
   */
  analyzeStructure(
    elements: TestableElement[],
    architecture?: TechnicalArchitecture
  ): HTSMAnalysisResult {
    const structureElements = elements.filter(
      (e) => e.suggestedHTSM.includes('STRUCTURE') || e.type === 'interface'
    );

    const opportunities: TestOpportunity[] = [];

    // Code structure tests
    if (architecture?.components) {
      architecture.components.forEach((comp) => {
        opportunities.push({
          id: `STRUCT-CODE-${comp.name}`,
          htsmCategory: 'STRUCTURE',
          htsmSubcategory: 'Code',
          description: `Verify ${comp.name} component structure and dependencies`,
          technique: 'scenario-based',
          priority: 'P2',
          sourceElements: [comp.name],
        });

        // Dependency tests
        comp.dependencies.forEach((dep) => {
          opportunities.push({
            id: `STRUCT-DEP-${comp.name}-${dep}`,
            htsmCategory: 'STRUCTURE',
            htsmSubcategory: 'Code',
            description: `Verify ${comp.name} correctly integrates with ${dep}`,
            technique: 'scenario-based',
            priority: 'P1',
            sourceElements: [comp.name, dep],
          });
        });
      });
    }

    // Service structure tests
    const services = architecture?.components?.filter((c) => c.type === 'service') || [];
    services.forEach((service) => {
      opportunities.push({
        id: `STRUCT-SVC-${service.name}`,
        htsmCategory: 'STRUCTURE',
        htsmSubcategory: 'Service',
        description: `Verify ${service.name} service health and startup`,
        technique: 'scenario-based',
        priority: 'P1',
        sourceElements: [service.name],
      });
    });

    return {
      category: 'STRUCTURE',
      elements: structureElements,
      testOpportunities: opportunities,
      coverage: this.calculateCoverage(opportunities, 5), // 5 subcategories
    };
  }

  /**
   * FUNCTION: Everything that the product does
   */
  analyzeFunction(
    elements: TestableElement[],
    userStories: UserStory[],
    specs: FunctionalSpec[]
  ): HTSMAnalysisResult {
    const functionElements = elements.filter(
      (e) => e.suggestedHTSM.includes('FUNCTION') || e.type === 'action'
    );

    const opportunities: TestOpportunity[] = [];

    // Business rules from acceptance criteria
    userStories.forEach((story) => {
      story.acceptanceCriteria.forEach((ac) => {
        opportunities.push({
          id: `FUNC-BR-${story.id}-${ac.id}`,
          htsmCategory: 'FUNCTION',
          htsmSubcategory: 'BusinessRules',
          description: `Verify: ${ac.description}`,
          technique: this.selectTechnique(ac.description),
          priority: story.priority || 'P2',
          sourceElements: [story.id, ac.id],
        });
      });
    });

    // Error handling tests
    const errorPatterns = this.findErrorPatterns(elements);
    errorPatterns.forEach((pattern, index) => {
      opportunities.push({
        id: `FUNC-ERR-${index}`,
        htsmCategory: 'FUNCTION',
        htsmSubcategory: 'ErrorHandling',
        description: `Verify error handling for: ${pattern}`,
        technique: 'error-guessing',
        priority: 'P1',
        sourceElements: [pattern],
      });
    });

    // Security-related tests
    const securityElements = this.findSecurityElements(elements, specs);
    securityElements.forEach((elem, index) => {
      opportunities.push({
        id: `FUNC-SEC-${index}`,
        htsmCategory: 'FUNCTION',
        htsmSubcategory: 'SecurityRelated',
        description: `Verify security: ${elem}`,
        technique: 'risk-based',
        priority: 'P0',
        sourceElements: [elem],
      });
    });

    // Calculation tests
    const calculations = this.findCalculations(elements);
    calculations.forEach((calc, index) => {
      opportunities.push({
        id: `FUNC-CALC-${index}`,
        htsmCategory: 'FUNCTION',
        htsmSubcategory: 'Calculation',
        description: `Verify calculation: ${calc}`,
        technique: 'boundary-value-analysis',
        priority: 'P1',
        sourceElements: [calc],
      });
    });

    return {
      category: 'FUNCTION',
      elements: functionElements,
      testOpportunities: opportunities,
      coverage: this.calculateCoverage(opportunities, 10), // 10 subcategories
    };
  }

  /**
   * DATA: Everything that the product processes and produces
   */
  analyzeData(
    elements: TestableElement[],
    specs: FunctionalSpec[]
  ): HTSMAnalysisResult {
    const dataElements = elements.filter(
      (e) => e.suggestedHTSM.includes('DATA') || e.type === 'data'
    );

    const opportunities: TestOpportunity[] = [];

    // Input/Output validation
    dataElements.forEach((elem) => {
      // Valid input
      opportunities.push({
        id: `DATA-IO-VALID-${elem.id}`,
        htsmCategory: 'DATA',
        htsmSubcategory: 'InputOutput',
        description: `Verify valid input processing for: ${elem.description}`,
        technique: 'equivalence-partitioning',
        priority: 'P1',
        sourceElements: [elem.id],
      });

      // Invalid input
      opportunities.push({
        id: `DATA-IO-INVALID-${elem.id}`,
        htsmCategory: 'DATA',
        htsmSubcategory: 'InvalidNoise',
        description: `Verify invalid input rejection for: ${elem.description}`,
        technique: 'error-guessing',
        priority: 'P1',
        sourceElements: [elem.id],
      });

      // Boundary values
      opportunities.push({
        id: `DATA-BV-${elem.id}`,
        htsmCategory: 'DATA',
        htsmSubcategory: 'BigLittle',
        description: `Verify boundary values for: ${elem.description}`,
        technique: 'boundary-value-analysis',
        priority: 'P2',
        sourceElements: [elem.id],
      });
    });

    // Cardinality tests (zero, one, many)
    opportunities.push({
      id: 'DATA-CARD-ZERO',
      htsmCategory: 'DATA',
      htsmSubcategory: 'Cardinality',
      description: 'Verify behavior with zero items',
      technique: 'boundary-value-analysis',
      priority: 'P2',
      sourceElements: [],
    });

    opportunities.push({
      id: 'DATA-CARD-ONE',
      htsmCategory: 'DATA',
      htsmSubcategory: 'Cardinality',
      description: 'Verify behavior with exactly one item',
      technique: 'boundary-value-analysis',
      priority: 'P2',
      sourceElements: [],
    });

    opportunities.push({
      id: 'DATA-CARD-MANY',
      htsmCategory: 'DATA',
      htsmSubcategory: 'Cardinality',
      description: 'Verify behavior with many items',
      technique: 'boundary-value-analysis',
      priority: 'P2',
      sourceElements: [],
    });

    // Data lifecycle (CRUD)
    opportunities.push({
      id: 'DATA-LIFE-CREATE',
      htsmCategory: 'DATA',
      htsmSubcategory: 'Lifecycle',
      description: 'Verify data creation',
      technique: 'scenario-based',
      priority: 'P1',
      sourceElements: [],
    });

    opportunities.push({
      id: 'DATA-LIFE-UPDATE',
      htsmCategory: 'DATA',
      htsmSubcategory: 'Lifecycle',
      description: 'Verify data modification',
      technique: 'scenario-based',
      priority: 'P1',
      sourceElements: [],
    });

    opportunities.push({
      id: 'DATA-LIFE-DELETE',
      htsmCategory: 'DATA',
      htsmSubcategory: 'Lifecycle',
      description: 'Verify data deletion',
      technique: 'scenario-based',
      priority: 'P1',
      sourceElements: [],
    });

    return {
      category: 'DATA',
      elements: dataElements,
      testOpportunities: opportunities,
      coverage: this.calculateCoverage(opportunities, 9), // 9 subcategories
    };
  }

  /**
   * INTERFACES: Every conduit by which the product is accessed or expressed
   */
  analyzeInterfaces(
    elements: TestableElement[],
    architecture?: TechnicalArchitecture
  ): HTSMAnalysisResult {
    const interfaceElements = elements.filter(
      (e) => e.suggestedHTSM.includes('INTERFACES') || e.type === 'interface'
    );

    const opportunities: TestOpportunity[] = [];

    // API tests
    if (architecture?.interfaces) {
      architecture.interfaces.forEach((iface) => {
        opportunities.push({
          id: `INTF-API-${iface.name}`,
          htsmCategory: 'INTERFACES',
          htsmSubcategory: 'ApiSdk',
          description: `Verify API: ${iface.name} (${iface.type})`,
          technique: 'scenario-based',
          priority: 'P1',
          sourceElements: [iface.name],
        });

        // Endpoint tests
        iface.endpoints?.forEach((endpoint) => {
          opportunities.push({
            id: `INTF-API-${iface.name}-${endpoint}`,
            htsmCategory: 'INTERFACES',
            htsmSubcategory: 'ApiSdk',
            description: `Verify endpoint: ${endpoint}`,
            technique: 'equivalence-partitioning',
            priority: 'P1',
            sourceElements: [endpoint],
          });
        });
      });
    }

    // UI tests from elements mentioning UI interactions
    const uiElements = elements.filter((e) =>
      e.description.toLowerCase().match(/button|form|field|display|screen|page|click|input/)
    );

    uiElements.forEach((elem) => {
      opportunities.push({
        id: `INTF-UI-${elem.id}`,
        htsmCategory: 'INTERFACES',
        htsmSubcategory: 'UserInterfaces',
        description: `Verify UI: ${elem.description}`,
        technique: 'scenario-based',
        priority: 'P2',
        sourceElements: [elem.id],
      });
    });

    // System interfaces
    if (architecture?.dataFlows) {
      architecture.dataFlows.forEach((flow) => {
        opportunities.push({
          id: `INTF-SYS-${flow.from}-${flow.to}`,
          htsmCategory: 'INTERFACES',
          htsmSubcategory: 'SystemInterfaces',
          description: `Verify data flow: ${flow.from} -> ${flow.to} (${flow.dataType})`,
          technique: 'scenario-based',
          priority: 'P1',
          sourceElements: [flow.from, flow.to],
        });
      });
    }

    return {
      category: 'INTERFACES',
      elements: interfaceElements,
      testOpportunities: opportunities,
      coverage: this.calculateCoverage(opportunities, 4), // 4 subcategories
    };
  }

  /**
   * PLATFORM: Everything on which the product depends
   */
  analyzePlatform(architecture?: TechnicalArchitecture): HTSMAnalysisResult {
    const opportunities: TestOpportunity[] = [];

    if (architecture?.technologies) {
      // External software compatibility
      const frameworks = architecture.technologies.filter((t) => t.category === 'framework');
      frameworks.forEach((fw) => {
        opportunities.push({
          id: `PLAT-SW-${fw.name}`,
          htsmCategory: 'PLATFORM',
          htsmSubcategory: 'ExternalSoftware',
          description: `Verify compatibility with ${fw.name} ${fw.version || ''}`,
          technique: 'scenario-based',
          priority: 'P2',
          sourceElements: [fw.name],
        });
      });

      // Database compatibility
      const databases = architecture.technologies.filter((t) => t.category === 'database');
      databases.forEach((db) => {
        opportunities.push({
          id: `PLAT-DB-${db.name}`,
          htsmCategory: 'PLATFORM',
          htsmSubcategory: 'ExternalSoftware',
          description: `Verify database compatibility: ${db.name}`,
          technique: 'scenario-based',
          priority: 'P1',
          sourceElements: [db.name],
        });
      });
    }

    // Product footprint tests
    opportunities.push({
      id: 'PLAT-FOOT-MEM',
      htsmCategory: 'PLATFORM',
      htsmSubcategory: 'ProductFootprint',
      description: 'Verify memory usage within acceptable limits',
      technique: 'scenario-based',
      priority: 'P2',
      sourceElements: [],
    });

    opportunities.push({
      id: 'PLAT-FOOT-CPU',
      htsmCategory: 'PLATFORM',
      htsmSubcategory: 'ProductFootprint',
      description: 'Verify CPU usage within acceptable limits',
      technique: 'scenario-based',
      priority: 'P2',
      sourceElements: [],
    });

    // Browser compatibility (if web-based)
    const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];
    browsers.forEach((browser) => {
      opportunities.push({
        id: `PLAT-BROWSER-${browser}`,
        htsmCategory: 'PLATFORM',
        htsmSubcategory: 'ExternalSoftware',
        description: `Verify compatibility with ${browser}`,
        technique: 'scenario-based',
        priority: 'P2',
        sourceElements: [browser],
      });
    });

    return {
      category: 'PLATFORM',
      elements: [],
      testOpportunities: opportunities,
      coverage: this.calculateCoverage(opportunities, 4), // 4 subcategories
    };
  }

  /**
   * OPERATIONS: Every experience people could have with the product
   */
  analyzeOperations(
    elements: TestableElement[],
    userStories: UserStory[]
  ): HTSMAnalysisResult {
    const opportunities: TestOpportunity[] = [];

    // User role tests
    const userRoles = this.extractUserRoles(userStories);
    userRoles.forEach((role) => {
      opportunities.push({
        id: `OPS-USER-${role}`,
        htsmCategory: 'OPERATIONS',
        htsmSubcategory: 'Users',
        description: `Verify functionality for user role: ${role}`,
        technique: 'scenario-based',
        priority: 'P1',
        sourceElements: [role],
      });
    });

    // Common use scenarios (happy paths)
    userStories.forEach((story) => {
      opportunities.push({
        id: `OPS-COMMON-${story.id}`,
        htsmCategory: 'OPERATIONS',
        htsmSubcategory: 'CommonUse',
        description: `Verify common use: ${story.title}`,
        technique: 'scenario-based',
        priority: 'P1',
        sourceElements: [story.id],
      });
    });

    // Extreme use scenarios
    opportunities.push({
      id: 'OPS-EXTREME-LOAD',
      htsmCategory: 'OPERATIONS',
      htsmSubcategory: 'ExtremeUse',
      description: 'Verify behavior under high load',
      technique: 'risk-based',
      priority: 'P1',
      sourceElements: [],
    });

    opportunities.push({
      id: 'OPS-EXTREME-DATA',
      htsmCategory: 'OPERATIONS',
      htsmSubcategory: 'ExtremeUse',
      description: 'Verify behavior with maximum data volume',
      technique: 'boundary-value-analysis',
      priority: 'P2',
      sourceElements: [],
    });

    // Disfavored use (misuse, malicious)
    opportunities.push({
      id: 'OPS-DISFAVOR-INJECT',
      htsmCategory: 'OPERATIONS',
      htsmSubcategory: 'DisfavoredUse',
      description: 'Verify protection against injection attacks',
      technique: 'error-guessing',
      priority: 'P0',
      sourceElements: [],
    });

    opportunities.push({
      id: 'OPS-DISFAVOR-XSS',
      htsmCategory: 'OPERATIONS',
      htsmSubcategory: 'DisfavoredUse',
      description: 'Verify protection against XSS attacks',
      technique: 'error-guessing',
      priority: 'P0',
      sourceElements: [],
    });

    return {
      category: 'OPERATIONS',
      elements: [],
      testOpportunities: opportunities,
      coverage: this.calculateCoverage(opportunities, 6), // 6 subcategories
    };
  }

  /**
   * TIME: Any relationship between the product and time
   */
  analyzeTime(
    elements: TestableElement[],
    specs: FunctionalSpec[]
  ): HTSMAnalysisResult {
    const opportunities: TestOpportunity[] = [];

    // Time-related data
    const timeElements = elements.filter((e) =>
      e.description.toLowerCase().match(/time|date|schedule|expire|timeout|duration|interval/)
    );

    timeElements.forEach((elem) => {
      opportunities.push({
        id: `TIME-DATA-${elem.id}`,
        htsmCategory: 'TIME',
        htsmSubcategory: 'TimeRelatedData',
        description: `Verify time handling: ${elem.description}`,
        technique: 'boundary-value-analysis',
        priority: 'P2',
        sourceElements: [elem.id],
      });
    });

    // Timeout tests
    opportunities.push({
      id: 'TIME-TIMEOUT',
      htsmCategory: 'TIME',
      htsmSubcategory: 'InputOutputTiming',
      description: 'Verify timeout handling',
      technique: 'boundary-value-analysis',
      priority: 'P1',
      sourceElements: [],
    });

    // Pacing tests
    opportunities.push({
      id: 'TIME-PACE-FAST',
      htsmCategory: 'TIME',
      htsmSubcategory: 'Pacing',
      description: 'Verify behavior with rapid input',
      technique: 'scenario-based',
      priority: 'P2',
      sourceElements: [],
    });

    opportunities.push({
      id: 'TIME-PACE-SLOW',
      htsmCategory: 'TIME',
      htsmSubcategory: 'Pacing',
      description: 'Verify behavior with slow/delayed input',
      technique: 'scenario-based',
      priority: 'P2',
      sourceElements: [],
    });

    // Concurrency tests
    opportunities.push({
      id: 'TIME-CONC-MULTI',
      htsmCategory: 'TIME',
      htsmSubcategory: 'Concurrency',
      description: 'Verify concurrent user access',
      technique: 'scenario-based',
      priority: 'P1',
      sourceElements: [],
    });

    opportunities.push({
      id: 'TIME-CONC-RACE',
      htsmCategory: 'TIME',
      htsmSubcategory: 'Concurrency',
      description: 'Verify race condition handling',
      technique: 'risk-based',
      priority: 'P1',
      sourceElements: [],
    });

    return {
      category: 'TIME',
      elements: timeElements,
      testOpportunities: opportunities,
      coverage: this.calculateCoverage(opportunities, 4), // 4 subcategories
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private selectTechnique(description: string): TestTechnique {
    const desc = description.toLowerCase();

    if (desc.includes('validate') || desc.includes('format') || desc.includes('must be')) {
      return 'boundary-value-analysis';
    }
    if (desc.includes('if') || desc.includes('when') || desc.includes('condition')) {
      return 'decision-table';
    }
    if (desc.includes('state') || desc.includes('status') || desc.includes('transition')) {
      return 'state-transition';
    }
    if (desc.includes('combination') || desc.includes('multiple')) {
      return 'pairwise';
    }
    return 'equivalence-partitioning';
  }

  private findErrorPatterns(elements: TestableElement[]): string[] {
    const patterns: string[] = [];
    elements.forEach((elem) => {
      const desc = elem.description.toLowerCase();
      if (desc.includes('error') || desc.includes('fail') || desc.includes('invalid')) {
        patterns.push(elem.description);
      }
    });
    return patterns;
  }

  private findSecurityElements(
    elements: TestableElement[],
    specs: FunctionalSpec[]
  ): string[] {
    const security: string[] = [];
    elements.forEach((elem) => {
      const desc = elem.description.toLowerCase();
      if (
        desc.includes('auth') ||
        desc.includes('password') ||
        desc.includes('permission') ||
        desc.includes('role') ||
        desc.includes('encrypt') ||
        desc.includes('token')
      ) {
        security.push(elem.description);
      }
    });
    return security;
  }

  private findCalculations(elements: TestableElement[]): string[] {
    const calculations: string[] = [];
    elements.forEach((elem) => {
      const desc = elem.description.toLowerCase();
      if (
        desc.includes('calculate') ||
        desc.includes('compute') ||
        desc.includes('sum') ||
        desc.includes('total') ||
        desc.includes('percentage') ||
        desc.includes('rate')
      ) {
        calculations.push(elem.description);
      }
    });
    return calculations;
  }

  private extractUserRoles(userStories: UserStory[]): string[] {
    const roles = new Set<string>();
    userStories.forEach((story) => {
      if (story.asA) {
        roles.add(story.asA);
      }
    });
    return Array.from(roles);
  }

  private calculateCoverage(opportunities: TestOpportunity[], subcategoryCount: number): number {
    const coveredSubcategories = new Set(opportunities.map((o) => o.htsmSubcategory));
    return Math.round((coveredSubcategories.size / subcategoryCount) * 100);
  }
}

export const htsmAnalyzer = new HTSMAnalyzer();
