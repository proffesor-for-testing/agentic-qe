/**
 * Test Idea Generator
 *
 * Generates test ideas for each SFDIPOT category and subcategory
 * based on analysis results and project context.
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
  TestIdea,
  Priority,
  AutomationFitness,
  ProjectContext,
  ExtractedEntities,
  generateTestId,
} from '../types';
import {
  CategoryAnalysisResult,
  BrutalHonestyAnalyzer,
  TestIdeaValidation,
  BrutalHonestyFinding,
} from '../analyzers';
import {
  domainPatternRegistry,
} from '../patterns/domain-registry';
import { DetectedDomain } from '../types';

export interface TestIdeaGeneratorConfig {
  maxIdeasPerSubcategory: number;
  minPriority?: Priority;
  includeRationale?: boolean;
  enableBrutalHonesty?: boolean;  // Enable Ramsay-mode validation
}

/**
 * Result of generating test ideas with validation
 */
export interface TestIdeaGenerationResult {
  testIdeas: TestIdea[];
  validations: TestIdeaValidation[];
  coverageWarnings: BrutalHonestyFinding[];
  qualityScore: number;  // Average quality across all ideas
}

/**
 * Test Idea Generator
 *
 * Generates context-aware test ideas based on:
 * - SFDIPOT category and subcategory
 * - Project domain (ecommerce, healthcare, finance, etc.)
 * - Extracted entities (actors, features, data types)
 * - Coverage analysis results
 */
export class TestIdeaGenerator {
  private config: TestIdeaGeneratorConfig;
  private brutalHonestyAnalyzer: BrutalHonestyAnalyzer;

  constructor(config: Partial<TestIdeaGeneratorConfig> = {}) {
    this.config = {
      maxIdeasPerSubcategory: config.maxIdeasPerSubcategory || 5,
      minPriority: config.minPriority,
      includeRationale: config.includeRationale ?? true,
      enableBrutalHonesty: config.enableBrutalHonesty ?? true,
    };
    this.brutalHonestyAnalyzer = new BrutalHonestyAnalyzer();
  }

  /**
   * Generate test ideas for a category analysis result
   */
  generateForCategory(
    analysis: CategoryAnalysisResult,
    context: ProjectContext,
    entities: ExtractedEntities
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    for (const subcatAnalysis of analysis.subcategoryAnalysis) {
      const subcategoryIdeas = this.generateForSubcategory(
        analysis.category,
        subcatAnalysis.subcategory,
        context,
        entities,
        subcatAnalysis.relevance
      );
      ideas.push(...subcategoryIdeas);
    }

    return ideas;
  }

  /**
   * Generate test ideas with brutal honesty validation (Ramsay mode)
   *
   * This method generates ideas and validates them against quality standards:
   * - Checks for vague test descriptions
   * - Validates priority alignment
   * - Identifies coverage gaps
   */
  generateWithValidation(
    analysis: CategoryAnalysisResult,
    context: ProjectContext,
    entities: ExtractedEntities
  ): TestIdeaGenerationResult {
    // Generate the base test ideas
    const testIdeas = this.generateForCategory(analysis, context, entities);

    // Skip validation if brutal honesty is disabled
    if (!this.config.enableBrutalHonesty) {
      return {
        testIdeas,
        validations: [],
        coverageWarnings: [],
        qualityScore: 100,
      };
    }

    // Validate test ideas using Ramsay mode
    const validations = this.brutalHonestyAnalyzer.validateTestIdeas(
      testIdeas,
      analysis.category
    );

    // Extract coverage warnings (category-level findings)
    const coverageWarnings: BrutalHonestyFinding[] = [];
    for (const validation of validations) {
      for (const warning of validation.warnings) {
        if (warning.category === 'Coverage Gap') {
          coverageWarnings.push(warning);
        }
      }
    }

    // Calculate average quality score
    const totalScore = validations.reduce((sum, v) => sum + v.qualityScore, 0);
    const qualityScore = validations.length > 0
      ? Math.round(totalScore / validations.length)
      : 100;

    return {
      testIdeas,
      validations,
      coverageWarnings,
      qualityScore,
    };
  }

  /**
   * Get validation warnings for display
   */
  getValidationWarnings(validations: TestIdeaValidation[]): BrutalHonestyFinding[] {
    const warnings: BrutalHonestyFinding[] = [];
    for (const validation of validations) {
      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings);
      }
    }
    return warnings;
  }

  /**
   * Get the brutal honesty analyzer instance
   */
  getBrutalHonestyAnalyzer(): BrutalHonestyAnalyzer {
    return this.brutalHonestyAnalyzer;
  }

  /**
   * Generate test ideas for a specific subcategory
   * Enhanced with domain-specific template injection
   */
  generateForSubcategory(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext,
    entities: ExtractedEntities,
    relevance: number
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    // First, inject domain-specific templates (highest priority)
    // These are expert-crafted templates for specific domains like Stripe, GDPR, etc.
    if (context.detectedDomains && context.detectedDomains.length > 0) {
      const domainIdeas = this.generateDomainSpecificIdeas(
        category,
        subcategory,
        context.detectedDomains,
        context,
        entities,
        relevance
      );
      ideas.push(...domainIdeas);
    }

    // Then add generic templates (up to max minus domain ideas)
    const remainingSlots = this.config.maxIdeasPerSubcategory - ideas.length;
    if (remainingSlots > 0) {
      const templates = this.getTestTemplates(category, subcategory);

      for (const template of templates.slice(0, remainingSlots)) {
        const idea = this.createTestIdea(
          category,
          subcategory,
          template,
          context,
          entities,
          relevance
        );

        // Filter by minimum priority if configured
        if (this.config.minPriority) {
          const priorityOrder = [Priority.P0, Priority.P1, Priority.P2, Priority.P3];
          const minIndex = priorityOrder.indexOf(this.config.minPriority);
          const ideaIndex = priorityOrder.indexOf(idea.priority);
          if (ideaIndex > minIndex) continue;
        }

        ideas.push(idea);
      }
    }

    return ideas;
  }

  /**
   * Generate domain-specific test ideas from DomainPatternRegistry
   * These are high-quality, expert-crafted test ideas for specific domains
   */
  private generateDomainSpecificIdeas(
    category: HTSMCategory,
    subcategory: string,
    detectedDomains: DetectedDomain[],
    _context: ProjectContext,
    _entities: ExtractedEntities,
    _relevance: number
  ): TestIdea[] {
    const ideas: TestIdea[] = [];

    // Get domain names with sufficient confidence
    const domainNames = detectedDomains
      .filter(d => d.confidence >= 0.5)
      .map(d => d.domain);

    if (domainNames.length === 0) {
      return ideas;
    }

    // Get domain-specific templates from the registry
    const domainTemplates = domainPatternRegistry.getTestTemplates(domainNames);

    // Filter templates relevant to this category/subcategory
    const relevantTemplates = domainTemplates.filter(t =>
      t.category === category &&
      (t.subcategory === subcategory || this.isRelatedSubcategory(t.subcategory, subcategory))
    );

    // Convert domain templates to test ideas (limit to 3 per subcategory)
    for (const template of relevantTemplates.slice(0, 3)) {
      const idea: TestIdea = {
        id: template.id,
        description: template.description,
        category: template.category,
        subcategory: template.subcategory,
        priority: template.priority,
        automationFitness: template.automationFitness,
        sourceRequirement: undefined,
        tags: [...template.tags, 'domain-specific'],
        rationale: template.rationale,
      };

      ideas.push(idea);
    }

    return ideas;
  }

  /**
   * Check if a template subcategory is related to the target subcategory
   * Allows domain templates with similar focus to be included
   */
  private isRelatedSubcategory(templateSubcategory: string, targetSubcategory: string): boolean {
    // Map of related subcategories for flexibility
    const relatedGroups: Record<string, string[]> = {
      'Security': ['Application', 'Authentication', 'Authorization', 'Encryption'],
      'StateTransition': ['Workflow', 'Lifecycle', 'State'],
      'Validation': ['InputOutput', 'Boundaries', 'Format'],
      'Integration': ['SystemInterface', 'ApiSdk', 'ExternalSystem'],
      'Calculation': ['InputOutput', 'Precision', 'Business Logic'],
    };

    for (const [group, subcategories] of Object.entries(relatedGroups)) {
      if (subcategories.includes(templateSubcategory) && subcategories.includes(targetSubcategory)) {
        return true;
      }
      if (group === templateSubcategory && subcategories.includes(targetSubcategory)) {
        return true;
      }
      if (group === targetSubcategory && subcategories.includes(templateSubcategory)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a test idea from a template
   */
  private createTestIdea(
    category: HTSMCategory,
    subcategory: string,
    template: TestTemplate,
    context: ProjectContext,
    entities: ExtractedEntities,
    relevance: number
  ): TestIdea {
    // Personalize description with entities
    const description = this.personalizeDescription(template.description, entities, context);

    // Calculate priority based on template, domain, and relevance
    const priority = this.calculatePriority(template.basePriority, context, relevance);

    // Determine automation fitness
    const automationFitness = this.determineAutomationFitness(category, subcategory, template);

    return {
      id: generateTestId(category),
      category,
      subcategory,
      description,
      priority,
      automationFitness,
      tags: [category.toLowerCase(), subcategory.toLowerCase(), ...template.tags],
      rationale: this.config.includeRationale ? template.rationale : undefined,
    };
  }

  /**
   * Personalize description with extracted entities
   */
  private personalizeDescription(
    template: string,
    entities: ExtractedEntities,
    context: ProjectContext
  ): string {
    let description = template;

    // Replace placeholders
    if (entities.actors.length > 0) {
      description = description.replace('{actor}', entities.actors[0]);
      description = description.replace('{user}', entities.actors[0]);
    } else {
      description = description.replace('{actor}', 'user');
      description = description.replace('{user}', 'user');
    }

    if (entities.features.length > 0) {
      description = description.replace('{feature}', entities.features[0]);
    } else {
      description = description.replace('{feature}', 'feature');
    }

    if (entities.dataTypes.length > 0) {
      description = description.replace('{data}', entities.dataTypes[0]);
      description = description.replace('{entity}', entities.dataTypes[0]);
    } else {
      description = description.replace('{data}', 'data');
      description = description.replace('{entity}', 'record');
    }

    if (entities.integrations.length > 0) {
      description = description.replace('{integration}', entities.integrations[0]);
      description = description.replace('{service}', entities.integrations[0]);
    } else {
      description = description.replace('{integration}', 'external service');
      description = description.replace('{service}', 'service');
    }

    // Add domain context
    if (context.domain !== 'generic') {
      description = description.replace('{domain}', context.domain);
    }

    return description;
  }

  /**
   * Calculate priority based on multiple factors
   */
  private calculatePriority(
    basePriority: Priority,
    context: ProjectContext,
    relevance: number
  ): Priority {
    const priorityOrder = [Priority.P0, Priority.P1, Priority.P2, Priority.P3];
    let priorityIndex = priorityOrder.indexOf(basePriority);

    // Boost priority for regulated domains
    if (['healthcare', 'finance'].includes(context.domain)) {
      priorityIndex = Math.max(0, priorityIndex - 1);
    }

    // Boost priority for high relevance
    if (relevance >= 0.8) {
      priorityIndex = Math.max(0, priorityIndex - 1);
    }

    // Lower priority for low relevance
    if (relevance < 0.3) {
      priorityIndex = Math.min(3, priorityIndex + 1);
    }

    return priorityOrder[priorityIndex];
  }

  /**
   * Determine automation fitness based on category and subcategory
   */
  private determineAutomationFitness(
    category: HTSMCategory,
    subcategory: string,
    template: TestTemplate
  ): AutomationFitness {
    // Use template's recommendation if available
    if (template.automationFitness) {
      return template.automationFitness;
    }

    // Default mappings
    const automationMap: Record<string, AutomationFitness> = {
      // STRUCTURE
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Code}`]: AutomationFitness.API,
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Dependencies}`]: AutomationFitness.API,
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Documentation}`]: AutomationFitness.Human,

      // FUNCTION
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: AutomationFitness.API,
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: AutomationFitness.Security,
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.ErrorHandling}`]: AutomationFitness.Integration,

      // DATA
      [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: AutomationFitness.API,
      [`${HTSMCategory.DATA}-${DataSubcategory.Persistence}`]: AutomationFitness.Integration,

      // INTERFACES
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.UserInterface}`]: AutomationFitness.E2E,
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ApiSdk}`]: AutomationFitness.API,

      // PLATFORM
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Browser}`]: AutomationFitness.E2E,

      // OPERATIONS
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.ExtremeUse}`]: AutomationFitness.Performance,

      // TIME
      [`${HTSMCategory.TIME}-${TimeSubcategory.Concurrency}`]: AutomationFitness.Concurrency,
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timing}`]: AutomationFitness.Performance,
    };

    return automationMap[`${category}-${subcategory}`] || AutomationFitness.Integration;
  }

  /**
   * Get test templates for a subcategory
   * Comprehensive coverage for all 37 SFDIPOT subcategories with 3-5 templates each
   */
  private getTestTemplates(category: HTSMCategory, subcategory: string): TestTemplate[] {
    const templates: Record<string, TestTemplate[]> = {
      // =========================================================================
      // STRUCTURE (5 subcategories) - What the product IS
      // =========================================================================
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Code}`]: [
        { description: 'Verify all modules load without errors', basePriority: Priority.P1, tags: ['smoke'], rationale: 'Ensures basic code integrity' },
        { description: 'Test that code handles null/undefined inputs gracefully', basePriority: Priority.P1, tags: ['robustness'], rationale: 'Prevents null pointer exceptions' },
        { description: 'Verify code style and linting rules are enforced', basePriority: Priority.P3, tags: ['quality'], rationale: 'Maintains code consistency' },
        { description: 'Test error boundary behavior in component hierarchy', basePriority: Priority.P1, tags: ['resilience'], rationale: 'Isolates failures to prevent cascading crashes' },
        { description: 'Verify memory usage stays within acceptable limits', basePriority: Priority.P2, tags: ['performance'], automationFitness: AutomationFitness.Performance, rationale: 'Prevents memory leaks' },
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Hardware}`]: [
        { description: 'Test behavior on devices with limited RAM (< 2GB)', basePriority: Priority.P2, tags: ['hardware'], rationale: 'Low-end device compatibility' },
        { description: 'Verify application works on slow/throttled CPU', basePriority: Priority.P2, tags: ['hardware'], rationale: 'Performance on constrained devices' },
        { description: 'Test disk space handling when storage is nearly full', basePriority: Priority.P1, tags: ['hardware'], rationale: 'Graceful handling of storage limits' },
        { description: 'Verify network connectivity loss is handled gracefully', basePriority: Priority.P1, tags: ['hardware', 'offline'], rationale: 'Network resilience' },
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.NonPhysical}`]: [
        { description: 'Verify environment variable configuration loads correctly', basePriority: Priority.P0, tags: ['config'], rationale: 'Configuration correctness' },
        { description: 'Test behavior with missing or malformed config files', basePriority: Priority.P1, tags: ['config'], rationale: 'Configuration resilience' },
        { description: 'Verify feature flags toggle functionality correctly', basePriority: Priority.P1, tags: ['feature-flags'], rationale: 'Feature management' },
        { description: 'Test license validation and expiration handling', basePriority: Priority.P2, tags: ['licensing'], rationale: 'License compliance' },
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Dependencies}`]: [
        { description: 'Verify all dependencies are available and correct versions', basePriority: Priority.P1, tags: ['dependency'], rationale: 'Ensures reproducible builds' },
        { description: 'Test behavior when optional dependencies are missing', basePriority: Priority.P2, tags: ['resilience'], rationale: 'Validates graceful degradation' },
        { description: 'Check for security vulnerabilities in dependencies', basePriority: Priority.P0, tags: ['security'], automationFitness: AutomationFitness.Security, rationale: 'Critical for supply chain security' },
        { description: 'Verify dependency version conflicts are detected', basePriority: Priority.P2, tags: ['dependency'], rationale: 'Prevents version conflicts' },
        { description: 'Test fallback when CDN-hosted dependencies fail', basePriority: Priority.P1, tags: ['resilience'], rationale: 'CDN failure handling' },
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Documentation}`]: [
        { description: 'Verify API documentation matches actual behavior', basePriority: Priority.P2, tags: ['docs'], rationale: 'Documentation accuracy' },
        { description: 'Test that code examples in documentation work', basePriority: Priority.P2, tags: ['docs'], rationale: 'Example correctness' },
        { description: 'Verify inline code comments are accurate', basePriority: Priority.P3, tags: ['docs'], rationale: 'Comment quality' },
        { description: 'Test README installation steps produce working setup', basePriority: Priority.P1, tags: ['docs'], rationale: 'Onboarding experience' },
      ],

      // =========================================================================
      // FUNCTION (7 subcategories) - What the product DOES
      // =========================================================================
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Application}`]: [
        { description: 'Verify {feature} works correctly for {actor}', basePriority: Priority.P1, tags: ['functional'], rationale: 'Core functionality validation' },
        { description: 'Test {feature} with valid and invalid inputs', basePriority: Priority.P1, tags: ['validation'], rationale: 'Input validation coverage' },
        { description: 'Verify {feature} produces correct output', basePriority: Priority.P1, tags: ['functional'], rationale: 'Output correctness' },
        { description: 'Test {feature} interaction with related features', basePriority: Priority.P2, tags: ['integration'], rationale: 'Feature interaction' },
        { description: 'Verify {feature} undo/redo functionality', basePriority: Priority.P2, tags: ['ux'], rationale: 'Reversibility' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: [
        { description: 'Verify calculation accuracy with known test values', basePriority: Priority.P0, tags: ['calculation'], rationale: 'Mathematical correctness is critical' },
        { description: 'Test calculation with boundary values (min, max, zero)', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Edge cases in calculations' },
        { description: 'Verify rounding and precision handling', basePriority: Priority.P1, tags: ['precision'], rationale: 'Financial/scientific accuracy' },
        { description: 'Test calculation with negative numbers', basePriority: Priority.P1, tags: ['calculation'], rationale: 'Sign handling' },
        { description: 'Verify calculation audit trail is captured', basePriority: Priority.P2, tags: ['audit'], rationale: 'Traceability for compliance' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.ErrorHandling}`]: [
        { description: 'Verify appropriate error messages for invalid operations', basePriority: Priority.P1, tags: ['error'], rationale: 'User-friendly error handling' },
        { description: 'Test recovery from transient failures', basePriority: Priority.P1, tags: ['resilience'], rationale: 'System resilience' },
        { description: 'Verify error logging captures necessary diagnostic info', basePriority: Priority.P2, tags: ['observability'], rationale: 'Debugging capability' },
        { description: 'Test error messages do not expose sensitive information', basePriority: Priority.P0, tags: ['security'], automationFitness: AutomationFitness.Security, rationale: 'Information disclosure prevention' },
        { description: 'Verify error handling under cascading failure conditions', basePriority: Priority.P1, tags: ['resilience'], rationale: 'Cascade prevention' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: [
        { description: 'Verify authentication is required for protected resources', basePriority: Priority.P0, tags: ['auth'], automationFitness: AutomationFitness.Security, rationale: 'Access control' },
        { description: 'Test authorization enforcement for different roles', basePriority: Priority.P0, tags: ['authorization'], automationFitness: AutomationFitness.Security, rationale: 'Role-based access' },
        { description: 'Verify sensitive data is encrypted at rest and in transit', basePriority: Priority.P0, tags: ['encryption'], automationFitness: AutomationFitness.Security, rationale: 'Data protection' },
        { description: 'Test for common vulnerabilities (XSS, SQL injection, CSRF)', basePriority: Priority.P0, tags: ['owasp'], automationFitness: AutomationFitness.Security, rationale: 'OWASP Top 10' },
        { description: 'Verify session management and timeout handling', basePriority: Priority.P0, tags: ['session'], automationFitness: AutomationFitness.Security, rationale: 'Session security' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.StateTransition}`]: [
        { description: 'Verify all valid state transitions work correctly', basePriority: Priority.P1, tags: ['state'], rationale: 'Workflow correctness' },
        { description: 'Test that invalid state transitions are rejected', basePriority: Priority.P1, tags: ['state'], rationale: 'State machine integrity' },
        { description: 'Verify state is persisted correctly across sessions', basePriority: Priority.P1, tags: ['persistence'], rationale: 'State durability' },
        { description: 'Test concurrent state transition attempts', basePriority: Priority.P0, tags: ['concurrency'], automationFitness: AutomationFitness.Concurrency, rationale: 'Race condition prevention' },
        { description: 'Verify state rollback on transaction failure', basePriority: Priority.P1, tags: ['transaction'], rationale: 'Atomicity guarantee' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Startup}`]: [
        { description: 'Verify application starts within acceptable time', basePriority: Priority.P1, tags: ['startup'], automationFitness: AutomationFitness.Performance, rationale: 'Startup performance' },
        { description: 'Test startup with missing required dependencies', basePriority: Priority.P0, tags: ['startup'], rationale: 'Startup resilience' },
        { description: 'Verify startup order of dependent services', basePriority: Priority.P1, tags: ['startup'], rationale: 'Dependency ordering' },
        { description: 'Test recovery from interrupted startup', basePriority: Priority.P1, tags: ['startup'], rationale: 'Startup recovery' },
        { description: 'Verify database migrations run correctly on startup', basePriority: Priority.P0, tags: ['startup', 'migration'], rationale: 'Migration safety' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Shutdown}`]: [
        { description: 'Verify graceful shutdown completes in-flight requests', basePriority: Priority.P1, tags: ['shutdown'], rationale: 'Request completion' },
        { description: 'Test data is persisted before shutdown completes', basePriority: Priority.P0, tags: ['shutdown'], rationale: 'Data persistence' },
        { description: 'Verify shutdown timeout handling', basePriority: Priority.P1, tags: ['shutdown'], rationale: 'Shutdown timeout' },
        { description: 'Test resource cleanup on shutdown (connections, files)', basePriority: Priority.P1, tags: ['shutdown'], rationale: 'Resource cleanup' },
        { description: 'Verify shutdown signal handling (SIGTERM, SIGINT)', basePriority: Priority.P1, tags: ['shutdown'], rationale: 'Signal handling' },
      ],

      // =========================================================================
      // DATA (7 subcategories) - What the product PROCESSES
      // =========================================================================
      [`${HTSMCategory.DATA}-${DataSubcategory.InputOutput}`]: [
        { description: 'Verify correct handling of valid {data} input', basePriority: Priority.P1, tags: ['input'], rationale: 'Happy path validation' },
        { description: 'Test with malformed or invalid input data', basePriority: Priority.P1, tags: ['validation'], rationale: 'Input sanitization' },
        { description: 'Verify output format matches specification', basePriority: Priority.P1, tags: ['output'], rationale: 'Contract compliance' },
        { description: 'Test Unicode handling (emojis, RTL, special chars)', basePriority: Priority.P1, tags: ['i18n'], rationale: 'Internationalization' },
        { description: 'Verify large input handling (files, text blocks)', basePriority: Priority.P1, tags: ['performance'], rationale: 'Size handling' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Lifecycle}`]: [
        { description: 'Verify data creation with all required fields', basePriority: Priority.P1, tags: ['lifecycle'], rationale: 'Create operation' },
        { description: 'Test data update preserves unmodified fields', basePriority: Priority.P1, tags: ['lifecycle'], rationale: 'Update correctness' },
        { description: 'Verify soft delete marks records correctly', basePriority: Priority.P1, tags: ['lifecycle'], rationale: 'Soft delete' },
        { description: 'Test hard delete removes all related data', basePriority: Priority.P0, tags: ['lifecycle'], rationale: 'Cascade delete' },
        { description: 'Verify audit trail captures all lifecycle events', basePriority: Priority.P1, tags: ['audit'], rationale: 'Auditability' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Cardinality}`]: [
        { description: 'Test one-to-one relationships enforce uniqueness', basePriority: Priority.P1, tags: ['relationship'], rationale: 'Cardinality enforcement' },
        { description: 'Verify one-to-many relationships with large child count', basePriority: Priority.P1, tags: ['relationship', 'performance'], rationale: 'Scalability' },
        { description: 'Test many-to-many relationship operations', basePriority: Priority.P1, tags: ['relationship'], rationale: 'Join table correctness' },
        { description: 'Verify orphan record prevention', basePriority: Priority.P1, tags: ['relationship'], rationale: 'Referential integrity' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: [
        { description: 'Test with minimum allowed values', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Lower bound validation' },
        { description: 'Test with maximum allowed values', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Upper bound validation' },
        { description: 'Test with values just outside boundaries', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Boundary enforcement' },
        { description: 'Test with empty/null values', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Empty state handling' },
        { description: 'Verify string length limits are enforced', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Text length limits' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Persistence}`]: [
        { description: 'Verify data is persisted correctly to storage', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Data durability' },
        { description: 'Test data retrieval returns correct values', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Data integrity' },
        { description: 'Verify data updates are reflected correctly', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Update correctness' },
        { description: 'Test data deletion removes all related records', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Cascade delete' },
        { description: 'Verify backup and restore functionality', basePriority: Priority.P1, tags: ['backup'], rationale: 'Disaster recovery' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Types}`]: [
        { description: 'Test date/time handling across timezones', basePriority: Priority.P1, tags: ['datetime'], rationale: 'Timezone correctness' },
        { description: 'Verify currency precision and formatting', basePriority: Priority.P0, tags: ['currency'], rationale: 'Financial accuracy' },
        { description: 'Test boolean and enum type handling', basePriority: Priority.P2, tags: ['types'], rationale: 'Type correctness' },
        { description: 'Verify JSON/BLOB storage and retrieval', basePriority: Priority.P1, tags: ['types'], rationale: 'Complex type handling' },
        { description: 'Test date boundary handling (DST, leap year)', basePriority: Priority.P1, tags: ['datetime'], rationale: 'Date edge cases' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Selection}`]: [
        { description: 'Verify search returns relevant results', basePriority: Priority.P1, tags: ['search'], rationale: 'Search accuracy' },
        { description: 'Test filtering with multiple criteria', basePriority: Priority.P1, tags: ['filter'], rationale: 'Filter combinations' },
        { description: 'Verify sorting works correctly for all columns', basePriority: Priority.P2, tags: ['sort'], rationale: 'Sort correctness' },
        { description: 'Test pagination with large result sets', basePriority: Priority.P1, tags: ['pagination'], rationale: 'Page navigation' },
        { description: 'Verify empty result handling', basePriority: Priority.P2, tags: ['search'], rationale: 'No results UX' },
      ],

      // =========================================================================
      // INTERFACES (5 subcategories) - How the product CONNECTS
      // =========================================================================
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.UserInterface}`]: [
        { description: 'Verify UI renders correctly for {actor}', basePriority: Priority.P1, tags: ['ui'], automationFitness: AutomationFitness.E2E, rationale: 'Visual correctness' },
        { description: 'Test UI responsiveness across screen sizes', basePriority: Priority.P2, tags: ['responsive'], automationFitness: AutomationFitness.Visual, rationale: 'Mobile/desktop compatibility' },
        { description: 'Verify accessibility compliance (WCAG)', basePriority: Priority.P1, tags: ['a11y'], automationFitness: AutomationFitness.Accessibility, rationale: 'Inclusive design' },
        { description: 'Test keyboard navigation and screen reader support', basePriority: Priority.P2, tags: ['a11y'], automationFitness: AutomationFitness.Accessibility, rationale: 'Keyboard accessibility' },
        { description: 'Verify color contrast ratios meet WCAG requirements', basePriority: Priority.P2, tags: ['a11y'], automationFitness: AutomationFitness.Accessibility, rationale: 'Visual accessibility' },
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ApiSdk}`]: [
        { description: 'Verify API endpoints return correct status codes', basePriority: Priority.P1, tags: ['api'], rationale: 'HTTP compliance' },
        { description: 'Test API response format matches schema', basePriority: Priority.P1, tags: ['contract'], rationale: 'API contract' },
        { description: 'Verify API rate limiting works correctly', basePriority: Priority.P2, tags: ['rate-limit'], rationale: 'API protection' },
        { description: 'Test API versioning and backward compatibility', basePriority: Priority.P2, tags: ['versioning'], rationale: 'API evolution' },
        { description: 'Test API pagination with various page sizes and edge cases', basePriority: Priority.P1, tags: ['api', 'pagination'], rationale: 'Pagination correctness' },
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.SystemInterface}`]: [
        { description: 'Verify integration with {integration} works correctly', basePriority: Priority.P1, tags: ['integration'], rationale: 'External system connectivity' },
        { description: 'Test behavior when {integration} is unavailable', basePriority: Priority.P1, tags: ['resilience'], rationale: 'Graceful degradation' },
        { description: 'Verify data transformation between systems', basePriority: Priority.P1, tags: ['integration'], rationale: 'Data mapping correctness' },
        { description: 'Test retry logic for failed external calls', basePriority: Priority.P1, tags: ['resilience'], rationale: 'Retry behavior' },
        { description: 'Verify webhook delivery and retry mechanism', basePriority: Priority.P1, tags: ['webhook'], rationale: 'Event delivery' },
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ImportExport}`]: [
        { description: 'Verify CSV import with various formats and encodings', basePriority: Priority.P1, tags: ['import'], rationale: 'Import flexibility' },
        { description: 'Test Excel/spreadsheet import functionality', basePriority: Priority.P2, tags: ['import'], rationale: 'Excel support' },
        { description: 'Verify data export in multiple formats (CSV, JSON, PDF)', basePriority: Priority.P1, tags: ['export'], rationale: 'Export options' },
        { description: 'Test import with malformed or malicious files', basePriority: Priority.P0, tags: ['security'], automationFitness: AutomationFitness.Security, rationale: 'Import security' },
        { description: 'Verify partial import failure handling', basePriority: Priority.P1, tags: ['import'], rationale: 'Error recovery' },
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.Messaging}`]: [
        { description: 'Verify message delivery to queues/topics', basePriority: Priority.P1, tags: ['messaging'], rationale: 'Message reliability' },
        { description: 'Test message ordering preservation', basePriority: Priority.P1, tags: ['messaging'], rationale: 'Order guarantee' },
        { description: 'Verify dead-letter queue handling', basePriority: Priority.P1, tags: ['messaging'], rationale: 'Failed message handling' },
        { description: 'Test message deduplication', basePriority: Priority.P1, tags: ['messaging'], rationale: 'Duplicate prevention' },
        { description: 'Verify message acknowledgment and retry', basePriority: Priority.P1, tags: ['messaging'], rationale: 'Delivery confirmation' },
      ],

      // =========================================================================
      // PLATFORM (5 subcategories) - What the product DEPENDS ON
      // =========================================================================
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Browser}`]: [
        { description: 'Test on Chrome, Firefox, Safari, Edge browsers', basePriority: Priority.P1, tags: ['browser'], automationFitness: AutomationFitness.E2E, rationale: 'Cross-browser compatibility' },
        { description: 'Verify mobile browser support (iOS Safari, Chrome Mobile)', basePriority: Priority.P2, tags: ['mobile'], automationFitness: AutomationFitness.E2E, rationale: 'Mobile compatibility' },
        { description: 'Test with JavaScript disabled', basePriority: Priority.P2, tags: ['browser'], rationale: 'Progressive enhancement' },
        { description: 'Verify behavior with ad blockers enabled', basePriority: Priority.P2, tags: ['browser'], rationale: 'Ad blocker compatibility' },
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.OperatingSystem}`]: [
        { description: 'Verify compatibility on Windows, macOS, Linux', basePriority: Priority.P1, tags: ['os'], rationale: 'Cross-OS compatibility' },
        { description: 'Test file path handling (forward/backslash)', basePriority: Priority.P1, tags: ['os'], rationale: 'Path compatibility' },
        { description: 'Verify line ending normalization (CRLF/LF)', basePriority: Priority.P2, tags: ['os'], rationale: 'Text file handling' },
        { description: 'Test case-sensitivity behavior across file systems', basePriority: Priority.P2, tags: ['os'], rationale: 'Filesystem compatibility' },
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Hardware}`]: [
        { description: 'Test on low-end devices with limited resources', basePriority: Priority.P2, tags: ['hardware'], rationale: 'Device accessibility' },
        { description: 'Verify touch/gesture support on mobile devices', basePriority: Priority.P2, tags: ['mobile'], rationale: 'Touch interaction' },
        { description: 'Test print functionality and layout', basePriority: Priority.P3, tags: ['hardware'], rationale: 'Print support' },
        { description: 'Verify offline capability when network unavailable', basePriority: Priority.P1, tags: ['offline'], rationale: 'Offline support' },
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.ExternalSoftware}`]: [
        { description: 'Verify compatibility with required external systems', basePriority: Priority.P1, tags: ['dependency'], rationale: 'Infrastructure compatibility' },
        { description: 'Test with different versions of external dependencies', basePriority: Priority.P2, tags: ['compatibility'], rationale: 'Version compatibility' },
        { description: 'Verify database connection pool behavior under load', basePriority: Priority.P1, tags: ['database'], automationFitness: AutomationFitness.Performance, rationale: 'Connection management' },
        { description: 'Test cache invalidation and consistency', basePriority: Priority.P1, tags: ['cache'], rationale: 'Cache correctness' },
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.InternalComponents}`]: [
        { description: 'Verify shared component version compatibility', basePriority: Priority.P1, tags: ['components'], rationale: 'Version alignment' },
        { description: 'Test component isolation and independence', basePriority: Priority.P2, tags: ['components'], rationale: 'Loose coupling' },
        { description: 'Verify internal API contracts between services', basePriority: Priority.P1, tags: ['contract'], rationale: 'Internal integration' },
        { description: 'Test component hot-reload and updates', basePriority: Priority.P2, tags: ['components'], rationale: 'Dynamic updates' },
      ],

      // =========================================================================
      // OPERATIONS (6 subcategories) - How the product is USED
      // =========================================================================
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.CommonUse}`]: [
        { description: 'Verify typical user workflow completes successfully', basePriority: Priority.P0, tags: ['smoke'], rationale: 'Core user journey' },
        { description: 'Test common {actor} actions work as expected', basePriority: Priority.P1, tags: ['functional'], rationale: 'Primary use cases' },
        { description: 'FedEx Tour: Follow data through the system end-to-end', basePriority: Priority.P2, tags: ['exploratory'], automationFitness: AutomationFitness.Human, rationale: 'Data flow validation' },
        { description: 'Garbage Collector Tour: Look for orphaned features and dead code paths', basePriority: Priority.P2, tags: ['exploratory'], automationFitness: AutomationFitness.Human, rationale: 'Dead code detection' },
        { description: 'Bad Neighborhood Tour: Focus on historically buggy areas', basePriority: Priority.P2, tags: ['exploratory'], automationFitness: AutomationFitness.Human, rationale: 'Regression prevention' },
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.UncommonUse}`]: [
        { description: 'Test unusual navigation paths (back button, multiple tabs)', basePriority: Priority.P2, tags: ['edge-case'], rationale: 'Navigation edge cases' },
        { description: 'Verify behavior when session expires mid-operation', basePriority: Priority.P1, tags: ['session'], rationale: 'Session timeout handling' },
        { description: 'Test with extreme input sizes (very long strings)', basePriority: Priority.P1, tags: ['edge-case'], rationale: 'Input extremes' },
        { description: 'Landmark Tour: Visit features never or rarely used', basePriority: Priority.P2, tags: ['exploratory'], automationFitness: AutomationFitness.Human, rationale: 'Feature coverage' },
        { description: 'Intellectual Tour: Test the most complex features', basePriority: Priority.P2, tags: ['exploratory'], automationFitness: AutomationFitness.Human, rationale: 'Complexity handling' },
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.ExtremeUse}`]: [
        { description: 'Test system behavior under high load', basePriority: Priority.P1, tags: ['load'], automationFitness: AutomationFitness.Performance, rationale: 'Scalability validation' },
        { description: 'Verify performance with large data volumes', basePriority: Priority.P1, tags: ['performance'], automationFitness: AutomationFitness.Performance, rationale: 'Data volume handling' },
        { description: 'Test concurrent user scenarios', basePriority: Priority.P1, tags: ['concurrency'], automationFitness: AutomationFitness.Concurrency, rationale: 'Multi-user support' },
        { description: 'Verify system recovery after crash or OOM', basePriority: Priority.P0, tags: ['resilience'], rationale: 'Crash recovery' },
        { description: 'Obsessive-Compulsive Tour: Repeat actions obsessively', basePriority: Priority.P2, tags: ['exploratory'], automationFitness: AutomationFitness.Human, rationale: 'Repetition handling' },
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.DisfavoredUse}`]: [
        { description: 'Verify blocked operations are properly rejected', basePriority: Priority.P1, tags: ['security'], rationale: 'Abuse prevention' },
        { description: 'Test that abuse attempts are logged', basePriority: Priority.P2, tags: ['audit'], rationale: 'Security monitoring' },
        { description: 'Verify rate limiting prevents API abuse', basePriority: Priority.P1, tags: ['security'], rationale: 'Rate limiting' },
        { description: 'Test brute-force attack prevention', basePriority: Priority.P0, tags: ['security'], automationFitness: AutomationFitness.Security, rationale: 'Attack prevention' },
        { description: 'Saboteur Tour: Try to break things intentionally', basePriority: Priority.P2, tags: ['exploratory'], automationFitness: AutomationFitness.Human, rationale: 'Robustness testing' },
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Users}`]: [
        { description: 'Test user registration and onboarding flow', basePriority: Priority.P1, tags: ['user'], rationale: 'User acquisition' },
        { description: 'Verify user role and permission management', basePriority: Priority.P0, tags: ['authorization'], rationale: 'Access control' },
        { description: 'Test user profile update and preferences', basePriority: Priority.P2, tags: ['user'], rationale: 'User settings' },
        { description: 'Verify user deletion and data cleanup (GDPR)', basePriority: Priority.P0, tags: ['compliance'], rationale: 'Data privacy' },
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.Environment}`]: [
        { description: 'Verify staging environment matches production config', basePriority: Priority.P1, tags: ['environment'], rationale: 'Environment parity' },
        { description: 'Test deployment with zero-downtime (rolling update)', basePriority: Priority.P1, tags: ['deployment'], rationale: 'Deployment safety' },
        { description: 'Verify environment-specific configuration', basePriority: Priority.P1, tags: ['config'], rationale: 'Environment config' },
        { description: 'Test rollback procedure after failed deployment', basePriority: Priority.P0, tags: ['deployment'], rationale: 'Rollback capability' },
      ],

      // =========================================================================
      // TIME (5 subcategories) - WHEN things happen
      // =========================================================================
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timing}`]: [
        { description: 'Verify response times meet SLA requirements', basePriority: Priority.P1, tags: ['performance'], automationFitness: AutomationFitness.Performance, rationale: 'SLA compliance' },
        { description: 'Test timeout handling for slow operations', basePriority: Priority.P1, tags: ['timeout'], rationale: 'Timeout resilience' },
        { description: 'Verify P95/P99 latency targets under load', basePriority: Priority.P1, tags: ['performance'], automationFitness: AutomationFitness.Performance, rationale: 'Tail latency' },
        { description: 'Test page load time on slow connections (3G)', basePriority: Priority.P2, tags: ['performance'], automationFitness: AutomationFitness.Performance, rationale: 'Slow network handling' },
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Concurrency}`]: [
        { description: 'Test concurrent access to shared resources', basePriority: Priority.P1, tags: ['concurrency'], automationFitness: AutomationFitness.Concurrency, rationale: 'Race condition prevention' },
        { description: 'Verify locking mechanisms prevent data corruption', basePriority: Priority.P0, tags: ['data-integrity'], automationFitness: AutomationFitness.Concurrency, rationale: 'Data consistency' },
        { description: 'Test optimistic vs pessimistic locking strategies', basePriority: Priority.P1, tags: ['concurrency'], automationFitness: AutomationFitness.Concurrency, rationale: 'Locking strategy' },
        { description: 'Verify deadlock detection and resolution', basePriority: Priority.P0, tags: ['concurrency'], automationFitness: AutomationFitness.Concurrency, rationale: 'Deadlock prevention' },
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Scheduling}`]: [
        { description: 'Verify scheduled jobs run at correct times', basePriority: Priority.P1, tags: ['scheduling'], rationale: 'Scheduler reliability' },
        { description: 'Test behavior when scheduled job fails', basePriority: Priority.P1, tags: ['resilience'], rationale: 'Job failure handling' },
        { description: 'Verify job overlap prevention (job still running)', basePriority: Priority.P1, tags: ['scheduling'], rationale: 'Overlap prevention' },
        { description: 'Test scheduled job retry and backoff logic', basePriority: Priority.P1, tags: ['scheduling'], rationale: 'Retry behavior' },
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timeout}`]: [
        { description: 'Verify client-side request timeout handling', basePriority: Priority.P1, tags: ['timeout'], rationale: 'Client timeout' },
        { description: 'Test server-side operation timeout behavior', basePriority: Priority.P1, tags: ['timeout'], rationale: 'Server timeout' },
        { description: 'Verify database query timeout handling', basePriority: Priority.P1, tags: ['timeout'], rationale: 'Query timeout' },
        { description: 'Test timeout cascade (request -> service -> DB)', basePriority: Priority.P1, tags: ['timeout'], rationale: 'Timeout propagation' },
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Sequencing}`]: [
        { description: 'Verify operation order is preserved (FIFO)', basePriority: Priority.P1, tags: ['ordering'], rationale: 'Order preservation' },
        { description: 'Test behavior when events arrive out of order', basePriority: Priority.P1, tags: ['ordering'], rationale: 'Out-of-order handling' },
        { description: 'Verify idempotency for repeated requests', basePriority: Priority.P0, tags: ['idempotency'], rationale: 'Idempotent operations' },
        { description: 'Test event replay and reprocessing', basePriority: Priority.P1, tags: ['ordering'], rationale: 'Event replay' },
      ],
    };

    return templates[`${category}-${subcategory}`] || [
      { description: `Test ${subcategory} functionality`, basePriority: Priority.P2, tags: ['general'], rationale: 'General coverage' },
    ];
  }
}

interface TestTemplate {
  description: string;
  basePriority: Priority;
  tags: string[];
  rationale: string;
  automationFitness?: AutomationFitness;
}

interface TestTemplate {
  description: string;
  basePriority: Priority;
  tags: string[];
  rationale: string;
  automationFitness?: AutomationFitness;
}
