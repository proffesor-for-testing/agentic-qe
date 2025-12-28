/**
 * Test Idea Generator
 *
 * Generates test ideas for each SFDIPOT category and subcategory
 * based on analysis results and project context.
 */

import {
  HTSMCategory,
  HTSMSubcategory,
  SFDIPOT_SUBCATEGORIES,
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
import { CategoryAnalysisResult } from '../analyzers';

export interface TestIdeaGeneratorConfig {
  maxIdeasPerSubcategory: number;
  minPriority?: Priority;
  includeRationale?: boolean;
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

  constructor(config: Partial<TestIdeaGeneratorConfig> = {}) {
    this.config = {
      maxIdeasPerSubcategory: config.maxIdeasPerSubcategory || 5,
      minPriority: config.minPriority,
      includeRationale: config.includeRationale ?? true,
    };
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
   * Generate test ideas for a specific subcategory
   */
  generateForSubcategory(
    category: HTSMCategory,
    subcategory: string,
    context: ProjectContext,
    entities: ExtractedEntities,
    relevance: number
  ): TestIdea[] {
    const templates = this.getTestTemplates(category, subcategory);
    const ideas: TestIdea[] = [];

    // Generate ideas from templates
    for (const template of templates.slice(0, this.config.maxIdeasPerSubcategory)) {
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

    return ideas;
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
   */
  private getTestTemplates(category: HTSMCategory, subcategory: string): TestTemplate[] {
    const templates: Record<string, TestTemplate[]> = {
      // STRUCTURE templates
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Code}`]: [
        { description: 'Verify all modules load without errors', basePriority: Priority.P1, tags: ['smoke'], rationale: 'Ensures basic code integrity' },
        { description: 'Test that code handles null/undefined inputs gracefully', basePriority: Priority.P1, tags: ['robustness'], rationale: 'Prevents null pointer exceptions' },
        { description: 'Verify code style and linting rules are enforced', basePriority: Priority.P3, tags: ['quality'], rationale: 'Maintains code consistency' },
      ],
      [`${HTSMCategory.STRUCTURE}-${StructureSubcategory.Dependencies}`]: [
        { description: 'Verify all dependencies are available and correct versions', basePriority: Priority.P1, tags: ['dependency'], rationale: 'Ensures reproducible builds' },
        { description: 'Test behavior when optional dependencies are missing', basePriority: Priority.P2, tags: ['resilience'], rationale: 'Validates graceful degradation' },
        { description: 'Check for security vulnerabilities in dependencies', basePriority: Priority.P0, tags: ['security'], automationFitness: AutomationFitness.Security, rationale: 'Critical for supply chain security' },
      ],

      // FUNCTION templates
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Application}`]: [
        { description: 'Verify {feature} works correctly for {actor}', basePriority: Priority.P1, tags: ['functional'], rationale: 'Core functionality validation' },
        { description: 'Test {feature} with valid and invalid inputs', basePriority: Priority.P1, tags: ['validation'], rationale: 'Input validation coverage' },
        { description: 'Verify {feature} produces correct output', basePriority: Priority.P1, tags: ['functional'], rationale: 'Output correctness' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Calculation}`]: [
        { description: 'Verify calculation accuracy with known test values', basePriority: Priority.P0, tags: ['calculation'], rationale: 'Mathematical correctness is critical' },
        { description: 'Test calculation with boundary values (min, max, zero)', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Edge cases in calculations' },
        { description: 'Verify rounding and precision handling', basePriority: Priority.P1, tags: ['precision'], rationale: 'Financial/scientific accuracy' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.ErrorHandling}`]: [
        { description: 'Verify appropriate error messages for invalid operations', basePriority: Priority.P1, tags: ['error'], rationale: 'User-friendly error handling' },
        { description: 'Test recovery from transient failures', basePriority: Priority.P1, tags: ['resilience'], rationale: 'System resilience' },
        { description: 'Verify error logging captures necessary diagnostic info', basePriority: Priority.P2, tags: ['observability'], rationale: 'Debugging capability' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.Security}`]: [
        { description: 'Verify authentication is required for protected resources', basePriority: Priority.P0, tags: ['auth'], automationFitness: AutomationFitness.Security, rationale: 'Access control' },
        { description: 'Test authorization enforcement for different roles', basePriority: Priority.P0, tags: ['authorization'], automationFitness: AutomationFitness.Security, rationale: 'Role-based access' },
        { description: 'Verify sensitive data is encrypted at rest and in transit', basePriority: Priority.P0, tags: ['encryption'], automationFitness: AutomationFitness.Security, rationale: 'Data protection' },
        { description: 'Test for common vulnerabilities (XSS, SQL injection, CSRF)', basePriority: Priority.P0, tags: ['owasp'], automationFitness: AutomationFitness.Security, rationale: 'OWASP Top 10' },
      ],
      [`${HTSMCategory.FUNCTION}-${FunctionSubcategory.StateTransition}`]: [
        { description: 'Verify all valid state transitions work correctly', basePriority: Priority.P1, tags: ['state'], rationale: 'Workflow correctness' },
        { description: 'Test that invalid state transitions are rejected', basePriority: Priority.P1, tags: ['state'], rationale: 'State machine integrity' },
        { description: 'Verify state is persisted correctly across sessions', basePriority: Priority.P1, tags: ['persistence'], rationale: 'State durability' },
      ],

      // DATA templates
      [`${HTSMCategory.DATA}-${DataSubcategory.InputOutput}`]: [
        { description: 'Verify correct handling of valid {data} input', basePriority: Priority.P1, tags: ['input'], rationale: 'Happy path validation' },
        { description: 'Test with malformed or invalid input data', basePriority: Priority.P1, tags: ['validation'], rationale: 'Input sanitization' },
        { description: 'Verify output format matches specification', basePriority: Priority.P1, tags: ['output'], rationale: 'Contract compliance' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Boundaries}`]: [
        { description: 'Test with minimum allowed values', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Lower bound validation' },
        { description: 'Test with maximum allowed values', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Upper bound validation' },
        { description: 'Test with values just outside boundaries', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Boundary enforcement' },
        { description: 'Test with empty/null values', basePriority: Priority.P1, tags: ['boundary'], rationale: 'Empty state handling' },
      ],
      [`${HTSMCategory.DATA}-${DataSubcategory.Persistence}`]: [
        { description: 'Verify data is persisted correctly to storage', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Data durability' },
        { description: 'Test data retrieval returns correct values', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Data integrity' },
        { description: 'Verify data updates are reflected correctly', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Update correctness' },
        { description: 'Test data deletion removes all related records', basePriority: Priority.P1, tags: ['persistence'], rationale: 'Cascade delete' },
      ],

      // INTERFACES templates
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.UserInterface}`]: [
        { description: 'Verify UI renders correctly for {actor}', basePriority: Priority.P1, tags: ['ui'], automationFitness: AutomationFitness.E2E, rationale: 'Visual correctness' },
        { description: 'Test UI responsiveness across screen sizes', basePriority: Priority.P2, tags: ['responsive'], automationFitness: AutomationFitness.Visual, rationale: 'Mobile/desktop compatibility' },
        { description: 'Verify accessibility compliance (WCAG)', basePriority: Priority.P1, tags: ['a11y'], automationFitness: AutomationFitness.Accessibility, rationale: 'Inclusive design' },
        { description: 'Test keyboard navigation and screen reader support', basePriority: Priority.P2, tags: ['a11y'], automationFitness: AutomationFitness.Accessibility, rationale: 'Keyboard accessibility' },
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.ApiSdk}`]: [
        { description: 'Verify API endpoints return correct status codes', basePriority: Priority.P1, tags: ['api'], rationale: 'HTTP compliance' },
        { description: 'Test API response format matches schema', basePriority: Priority.P1, tags: ['contract'], rationale: 'API contract' },
        { description: 'Verify API rate limiting works correctly', basePriority: Priority.P2, tags: ['rate-limit'], rationale: 'API protection' },
        { description: 'Test API versioning and backward compatibility', basePriority: Priority.P2, tags: ['versioning'], rationale: 'API evolution' },
      ],
      [`${HTSMCategory.INTERFACES}-${InterfacesSubcategory.SystemInterface}`]: [
        { description: 'Verify integration with {integration} works correctly', basePriority: Priority.P1, tags: ['integration'], rationale: 'External system connectivity' },
        { description: 'Test behavior when {integration} is unavailable', basePriority: Priority.P1, tags: ['resilience'], rationale: 'Graceful degradation' },
        { description: 'Verify data transformation between systems', basePriority: Priority.P1, tags: ['integration'], rationale: 'Data mapping correctness' },
      ],

      // PLATFORM templates
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.Browser}`]: [
        { description: 'Test on Chrome, Firefox, Safari, Edge browsers', basePriority: Priority.P1, tags: ['browser'], automationFitness: AutomationFitness.E2E, rationale: 'Cross-browser compatibility' },
        { description: 'Verify mobile browser support', basePriority: Priority.P2, tags: ['mobile'], automationFitness: AutomationFitness.E2E, rationale: 'Mobile compatibility' },
      ],
      [`${HTSMCategory.PLATFORM}-${PlatformSubcategory.ExternalSoftware}`]: [
        { description: 'Verify compatibility with required external systems', basePriority: Priority.P1, tags: ['dependency'], rationale: 'Infrastructure compatibility' },
        { description: 'Test with different versions of external dependencies', basePriority: Priority.P2, tags: ['compatibility'], rationale: 'Version compatibility' },
      ],

      // OPERATIONS templates
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.CommonUse}`]: [
        { description: 'Verify typical user workflow completes successfully', basePriority: Priority.P0, tags: ['smoke'], rationale: 'Core user journey' },
        { description: 'Test common {actor} actions work as expected', basePriority: Priority.P1, tags: ['functional'], rationale: 'Primary use cases' },
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.ExtremeUse}`]: [
        { description: 'Test system behavior under high load', basePriority: Priority.P1, tags: ['load'], automationFitness: AutomationFitness.Performance, rationale: 'Scalability validation' },
        { description: 'Verify performance with large data volumes', basePriority: Priority.P1, tags: ['performance'], automationFitness: AutomationFitness.Performance, rationale: 'Data volume handling' },
        { description: 'Test concurrent user scenarios', basePriority: Priority.P1, tags: ['concurrency'], automationFitness: AutomationFitness.Concurrency, rationale: 'Multi-user support' },
      ],
      [`${HTSMCategory.OPERATIONS}-${OperationsSubcategory.DisfavoredUse}`]: [
        { description: 'Verify blocked operations are properly rejected', basePriority: Priority.P1, tags: ['security'], rationale: 'Abuse prevention' },
        { description: 'Test that abuse attempts are logged', basePriority: Priority.P2, tags: ['audit'], rationale: 'Security monitoring' },
      ],

      // TIME templates
      [`${HTSMCategory.TIME}-${TimeSubcategory.Timing}`]: [
        { description: 'Verify response times meet SLA requirements', basePriority: Priority.P1, tags: ['performance'], automationFitness: AutomationFitness.Performance, rationale: 'SLA compliance' },
        { description: 'Test timeout handling for slow operations', basePriority: Priority.P1, tags: ['timeout'], rationale: 'Timeout resilience' },
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Concurrency}`]: [
        { description: 'Test concurrent access to shared resources', basePriority: Priority.P1, tags: ['concurrency'], automationFitness: AutomationFitness.Concurrency, rationale: 'Race condition prevention' },
        { description: 'Verify locking mechanisms prevent data corruption', basePriority: Priority.P0, tags: ['data-integrity'], automationFitness: AutomationFitness.Concurrency, rationale: 'Data consistency' },
      ],
      [`${HTSMCategory.TIME}-${TimeSubcategory.Scheduling}`]: [
        { description: 'Verify scheduled jobs run at correct times', basePriority: Priority.P1, tags: ['scheduling'], rationale: 'Scheduler reliability' },
        { description: 'Test behavior when scheduled job fails', basePriority: Priority.P1, tags: ['resilience'], rationale: 'Job failure handling' },
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
