/**
 * BDD Scenario Generation Tool - Gherkin/Cucumber Generation
 *
 * Generates comprehensive Gherkin-formatted Cucumber scenarios from requirements
 * with support for scenario outlines, data-driven testing, and edge cases.
 *
 * Features:
 * - Feature file generation with descriptive narratives
 * - Scenario and Scenario Outline generation
 * - Background preconditions extraction
 * - Happy path, error, and edge case scenario synthesis
 * - Examples table generation for data-driven tests
 * - Traceability to requirements and test cases
 * - Language-neutral Gherkin syntax
 * - Test case count projection
 *
 * @module tools/qe/requirements/generate-bdd-scenarios
 * @version 1.0.0
 * @author Agentic QE Team - Phase 3
 * @date 2025-11-09
 */

import type { QEToolResponse } from '../shared/types.js';
import { seededRandom } from '../../../../utils/SeededRandom.js';

// ==================== Types ====================

/**
 * Requirement input for BDD scenario generation
 */
export interface RequirementForBdd {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  type?: 'functional' | 'non-functional' | 'technical' | 'business';
}

/**
 * Generated BDD feature file
 */
export interface GeneratedFeature {
  featureName: string;
  narrative: FeatureNarrative;
  background?: GherkinBackground;
  scenarios: GherkinScenario[];
  metadata: BddMetadata;
  gherkinContent: string;
}

/**
 * Feature narrative (As a user, I want, So that)
 */
export interface FeatureNarrative {
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria?: string[];
}

/**
 * Gherkin background (common Given steps)
 */
export interface GherkinBackground {
  steps: string[];
}

/**
 * Individual Gherkin scenario
 */
export interface GherkinScenario {
  name: string;
  type: 'scenario' | 'scenario_outline';
  description?: string;
  given: string[];
  when: string[];
  then: string[];
  examples?: ScenarioExamples;
  tags?: string[];
  testCaseCount: number;
}

/**
 * Scenario outline examples table
 */
export interface ScenarioExamples {
  name?: string;
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * BDD metadata
 */
export interface BddMetadata {
  generatedAt: string;
  requirementId: string;
  scenarioCount: number;
  scenarioOutlineCount: number;
  totalTestCases: number;
  tags: string[];
  language: string;
  version: string;
}

/**
 * Batch BDD generation result
 */
export interface BatchBddGenerationResult {
  requirementsProcessed: number;
  featuresGenerated: number;
  totalScenarios: number;
  totalTestCases: number;
  features: GeneratedFeature[];
  summary: BddGenerationSummary;
}

/**
 * BDD generation summary
 */
export interface BddGenerationSummary {
  avgScenariosPerRequirement: number;
  avgTestCasesPerRequirement: number;
  commonScenarioPatterns: string[];
  edgeCasesCovered: number;
  dataVariationCoverage: number;
}

/**
 * BDD generation parameters
 */
export interface GenerateBddScenariosParams {
  requirements: RequirementForBdd[];
  includeEdgeCases?: boolean;
  includeNegativeCases?: boolean;
  dataVariations?: boolean;
  language?: 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'zh';
}

// ==================== Gherkin Keywords ====================

const GHERKIN_KEYWORDS = {
  feature: 'Feature',
  scenario: 'Scenario',
  scenarioOutline: 'Scenario Outline',
  background: 'Background',
  given: 'Given',
  when: 'When',
  then: 'Then',
  and: 'And',
  but: 'But',
  examples: 'Examples'
} as const;

// ==================== Main BDD Generation Function ====================

/**
 * Generate BDD scenarios from requirements
 *
 * @param params - Generation parameters
 * @returns Batch BDD generation result
 */
export async function generateBddScenarios(
  params: GenerateBddScenariosParams
): Promise<QEToolResponse<BatchBddGenerationResult>> {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    if (!params.requirements || params.requirements.length === 0) {
      throw new Error('At least one requirement must be provided');
    }

    const features: GeneratedFeature[] = [];
    let totalScenarios = 0;
    let totalTestCases = 0;

    // Generate features for each requirement
    const generationPromises = params.requirements.map((req) =>
      generateFeatureFromRequirement(
        req,
        params.includeEdgeCases ?? true,
        params.includeNegativeCases ?? true,
        params.dataVariations ?? true,
        params.language ?? 'en'
      )
    );

    const generatedFeatures = await Promise.all(generationPromises);
    features.push(...generatedFeatures);

    // Calculate totals
    for (const feature of features) {
      totalScenarios += feature.scenarios.length;
      totalTestCases += feature.scenarios.reduce((sum, s) => sum + s.testCaseCount, 0);
    }

    // Compile summary
    const avgScenarios = Math.round((totalScenarios / features.length) * 10) / 10;
    const avgTestCases = Math.round((totalTestCases / features.length) * 10) / 10;

    const patternCounts = new Map<string, number>();
    for (const feature of features) {
      for (const scenario of feature.scenarios) {
        const pattern = scenario.type === 'scenario_outline' ? 'Scenario Outline' : 'Scenario';
        patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
      }
    }

    const commonPatterns = Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pattern, count]) => `${pattern} (${count})`);

    // Count edge cases
    let edgeCaseCount = 0;
    for (const feature of features) {
      for (const scenario of feature.scenarios) {
        if (scenario.name.includes('edge') || scenario.name.includes('boundary') || scenario.tags?.includes('@edge')) {
          edgeCaseCount++;
        }
      }
    }

    const result: BatchBddGenerationResult = {
      requirementsProcessed: params.requirements.length,
      featuresGenerated: features.length,
      totalScenarios,
      totalTestCases,
      features,
      summary: {
        avgScenariosPerRequirement: avgScenarios,
        avgTestCasesPerRequirement: avgTestCases,
        commonScenarioPatterns: commonPatterns,
        edgeCasesCovered: edgeCaseCount,
        dataVariationCoverage: params.dataVariations ? 100 : 0
      }
    };

    return createSuccessResponse(result, requestId, Date.now() - startTime);
  } catch (error) {
    return createErrorResponse(error as Error, requestId, Date.now() - startTime);
  }
}

// ==================== Feature Generation ====================

/**
 * Generate a feature from a requirement
 */
async function generateFeatureFromRequirement(
  requirement: RequirementForBdd,
  includeEdgeCases: boolean,
  includeNegativeCases: boolean,
  dataVariations: boolean,
  language: string
): Promise<GeneratedFeature> {
  const featureName = extractFeatureName(requirement);
  const narrative = extractNarrative(requirement);
  const background = generateBackground(requirement);
  const scenarios = await generateScenarios(
    requirement,
    includeEdgeCases,
    includeNegativeCases,
    dataVariations
  );

  // Calculate test cases
  let totalTestCases = 0;
  for (const scenario of scenarios) {
    if (scenario.type === 'scenario_outline' && scenario.examples) {
      totalTestCases += scenario.examples.rows.length;
    } else {
      totalTestCases += 1;
    }
  }

  const feature: GeneratedFeature = {
    featureName,
    narrative,
    background,
    scenarios,
    metadata: {
      generatedAt: new Date().toISOString(),
      requirementId: requirement.id,
      scenarioCount: scenarios.length,
      scenarioOutlineCount: scenarios.filter((s) => s.type === 'scenario_outline').length,
      totalTestCases,
      tags: requirement.priority ? [`@${requirement.priority}`] : [],
      language: language === 'en' ? 'English' : language,
      version: '1.0.0'
    },
    gherkinContent: buildGherkinContent(featureName, narrative, background, scenarios)
  };

  return feature;
}

/**
 * Extract feature name from requirement
 */
function extractFeatureName(requirement: RequirementForBdd): string {
  return requirement.title
    .replace(/^(US|REQ|STORY|FEATURE|AC|BRD)[-_\s]?\d+:?\s*/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * Extract user story narrative
 */
function extractNarrative(requirement: RequirementForBdd): FeatureNarrative {
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Try to extract from text
  let asA = 'a user';
  let iWant = requirement.title;
  let soThat = requirement.description.substring(0, 100);

  // Detect user type
  if (/admin|administrator/.test(text)) asA = 'an administrator';
  else if (/customer|client/.test(text)) asA = 'a customer';
  else if (/stakeholder|manager/.test(text)) asA = 'a stakeholder';
  else if (/developer|engineer|technical/.test(text)) asA = 'a developer';
  else if (/system|service/.test(text)) asA = 'the system';

  // Extract value statement
  const valueMatch = text.match(/so that\s+(.+?)(?:[\.\,]|$)/);
  if (valueMatch) {
    soThat = valueMatch[1].trim();
  }

  return {
    title: requirement.title,
    asA,
    iWant: iWant.replace(/^(as a|an|the)\s+/i, ''),
    soThat,
    acceptanceCriteria: requirement.acceptanceCriteria
  };
}

/**
 * Generate background steps
 */
function generateBackground(requirement: RequirementForBdd): GherkinBackground | undefined {
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();
  const steps: string[] = [];

  // System preconditions
  if (/(system|service|application|api|endpoint)/.test(text)) {
    steps.push('the system is running and accessible');
  }

  // User authentication
  if (/(user|login|auth|permission|access|admin)/.test(text)) {
    steps.push('the user is authenticated and has proper permissions');
    steps.push('the user database is accessible');
  }

  // Data preconditions
  if (/(data|record|entity|database|table)/.test(text)) {
    steps.push('the database is in a consistent state');
    steps.push('all required data is available');
  }

  // External services
  if (/(api|external|service|integration|gateway)/.test(text)) {
    steps.push('all external dependencies are available');
    steps.push('the API service is running');
  }

  // Network conditions
  if (/(network|concurrent|load|performance|scale)/.test(text)) {
    steps.push('stable network connectivity is available');
  }

  return steps.length > 0 ? { steps } : undefined;
}

// ==================== Scenario Generation ====================

/**
 * Generate all scenarios for a requirement
 */
async function generateScenarios(
  requirement: RequirementForBdd,
  includeEdgeCases: boolean,
  includeNegativeCases: boolean,
  dataVariations: boolean
): Promise<GherkinScenario[]> {
  const scenarios: GherkinScenario[] = [];

  // Happy path
  scenarios.push(generateHappyPathScenario(requirement));

  // Negative scenarios
  if (includeNegativeCases) {
    scenarios.push(...generateNegativeScenarios(requirement));
  }

  // Edge case scenarios
  if (includeEdgeCases) {
    scenarios.push(...generateEdgeCaseScenarios(requirement));
  }

  // Scenario outlines with examples
  if (dataVariations) {
    const outlines = generateScenarioOutlines(requirement);
    scenarios.push(...outlines);
  }

  // Calculate test cases
  for (const scenario of scenarios) {
    if (scenario.type === 'scenario_outline' && scenario.examples) {
      scenario.testCaseCount = scenario.examples.rows.length;
    } else {
      scenario.testCaseCount = 1;
    }
  }

  return scenarios;
}

/**
 * Generate happy path scenario
 */
function generateHappyPathScenario(requirement: RequirementForBdd): GherkinScenario {
  const actionVerb = extractActionVerb(requirement);
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  const given = generateGivenSteps(requirement);
  const when = generateWhenSteps(requirement, actionVerb);
  const then = generateThenSteps(requirement, actionVerb);

  return {
    name: `Successfully ${actionVerb} ${requirement.title}`,
    type: 'scenario',
    description: `Happy path scenario for ${requirement.title}`,
    given,
    when,
    then,
    tags: ['@happy-path', '@smoke'],
    testCaseCount: 1
  };
}

/**
 * Generate negative scenarios
 */
function generateNegativeScenarios(requirement: RequirementForBdd): GherkinScenario[] {
  const scenarios: GherkinScenario[] = [];
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Invalid input scenario
  if (/(input|data|parameter|field|value)/.test(text)) {
    scenarios.push({
      name: 'Handle invalid input data',
      type: 'scenario',
      given: ['a request with invalid input data'],
      when: ['the request is submitted'],
      then: [
        'the system returns a validation error',
        'the error message indicates invalid input',
        'the operation is not performed'
      ],
      tags: ['@negative', '@validation'],
      testCaseCount: 1
    });
  }

  // Unauthorized access scenario
  if (/(auth|permission|access|security|role)/.test(text)) {
    scenarios.push({
      name: 'Deny unauthorized access',
      type: 'scenario',
      given: ['a user without proper permissions'],
      when: ['the user attempts to access the resource'],
      then: [
        'the system returns a 403 Forbidden error',
        'access is denied',
        'the attempt is logged for audit'
      ],
      tags: ['@negative', '@security'],
      testCaseCount: 1
    });
  }

  // Service unavailable scenario
  if (/(api|service|external|integration)/.test(text)) {
    scenarios.push({
      name: 'Handle service unavailability',
      type: 'scenario',
      given: ['the external service is unavailable'],
      when: ['the operation is initiated'],
      then: [
        'the system returns a service unavailable error',
        'a retry mechanism is triggered',
        'the user is notified of the temporary issue'
      ],
      tags: ['@negative', '@resilience'],
      testCaseCount: 1
    });
  }

  // Resource not found scenario
  if (/(retrieve|get|fetch|find|search|lookup)/.test(text)) {
    scenarios.push({
      name: 'Handle missing resource',
      type: 'scenario',
      given: ['a request for a non-existent resource'],
      when: ['the lookup is performed'],
      then: [
        'the system returns a 404 Not Found error',
        'no data is returned',
        'an appropriate error message is displayed'
      ],
      tags: ['@negative', '@validation'],
      testCaseCount: 1
    });
  }

  return scenarios;
}

/**
 * Generate edge case scenarios
 */
function generateEdgeCaseScenarios(requirement: RequirementForBdd): GherkinScenario[] {
  const scenarios: GherkinScenario[] = [];
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Boundary value scenario
  if (/(limit|size|length|count|maximum|minimum|threshold)/.test(text)) {
    scenarios.push({
      name: 'Handle boundary values',
      type: 'scenario',
      description: 'Test behavior at minimum and maximum boundaries',
      given: [
        'input at minimum boundary value',
        'input at maximum boundary value'
      ],
      when: ['the operation is performed'],
      then: [
        'the system correctly handles both boundary cases',
        'no overflow or underflow errors occur',
        'expected behavior is maintained at boundaries'
      ],
      tags: ['@edge-case', '@boundary'],
      testCaseCount: 1
    });
  }

  // Empty/null scenario
  if (/(input|data|parameter|field|value)/.test(text)) {
    scenarios.push({
      name: 'Handle empty or null input',
      type: 'scenario',
      given: [
        'an empty input',
        'a null input',
        'undefined values'
      ],
      when: ['the validation is performed'],
      then: [
        'the system properly handles empty/null cases',
        'appropriate error messages are provided',
        'the system state is not corrupted'
      ],
      tags: ['@edge-case', '@validation'],
      testCaseCount: 1
    });
  }

  // Concurrent access scenario
  if (/(concurrent|parallel|simultaneous|race|transaction)/.test(text)) {
    scenarios.push({
      name: 'Handle concurrent operations',
      type: 'scenario',
      description: 'Test behavior under concurrent access',
      given: ['multiple users attempting simultaneous operations'],
      when: ['all operations are executed concurrently'],
      then: [
        'all operations complete successfully',
        'data consistency is maintained',
        'no race conditions occur',
        'proper locking mechanisms are in place'
      ],
      tags: ['@edge-case', '@concurrency'],
      testCaseCount: 1
    });
  }

  // Large dataset scenario
  if (/(bulk|batch|large|volume|scale|many)/.test(text)) {
    scenarios.push({
      name: 'Handle large dataset processing',
      type: 'scenario',
      given: ['a large dataset with 10000+ records'],
      when: ['the batch operation is performed'],
      then: [
        'all records are processed successfully',
        'performance meets SLA requirements',
        'no memory leaks occur',
        'proper pagination/chunking is applied'
      ],
      tags: ['@edge-case', '@performance'],
      testCaseCount: 1
    });
  }

  // Special character scenario
  if (/(string|text|name|email|url|input)/.test(text)) {
    scenarios.push({
      name: 'Handle special characters',
      type: 'scenario',
      given: [
        'input with special characters (!@#$%)',
        'input with unicode characters',
        'input with emoji characters'
      ],
      when: ['the input is processed'],
      then: [
        'special characters are properly handled',
        'no injection vulnerabilities exist',
        'data integrity is maintained'
      ],
      tags: ['@edge-case', '@security'],
      testCaseCount: 1
    });
  }

  return scenarios;
}

/**
 * Generate scenario outlines with examples
 */
function generateScenarioOutlines(requirement: RequirementForBdd): GherkinScenario[] {
  const outlines: GherkinScenario[] = [];
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Validation scenario outline
  if (/(valid|invalid|check|validate|verify|test)/.test(text)) {
    const examples: ScenarioExamples = {
      name: 'Various input types',
      headers: ['input', 'expectedResult', 'errorMessage'],
      rows: [
        { input: 'valid data', expectedResult: 'success', errorMessage: 'none' },
        { input: 'empty string', expectedResult: 'error', errorMessage: 'Input cannot be empty' },
        { input: 'null value', expectedResult: 'error', errorMessage: 'Input is required' },
        { input: 'invalid format', expectedResult: 'error', errorMessage: 'Invalid format' },
        { input: 'maximum length', expectedResult: 'success', errorMessage: 'none' }
      ]
    };

    outlines.push({
      name: 'Validation with various input types',
      type: 'scenario_outline',
      given: ['a request with <input> data'],
      when: ['the validation is performed'],
      then: [
        'the system returns <expectedResult>',
        'the error message is <errorMessage>'
      ],
      examples,
      tags: ['@data-driven', '@validation'],
      testCaseCount: examples.rows.length
    });
  }

  // User role scenario outline
  if (/(user|role|permission|admin|guest|customer)/.test(text)) {
    const examples: ScenarioExamples = {
      name: 'Different user roles',
      headers: ['userRole', 'hasAccess', 'expectedAction'],
      rows: [
        { userRole: 'admin', hasAccess: 'yes', expectedAction: 'full access' },
        { userRole: 'user', hasAccess: 'yes', expectedAction: 'limited access' },
        { userRole: 'guest', hasAccess: 'no', expectedAction: 'redirected to login' },
        { userRole: 'suspended', hasAccess: 'no', expectedAction: 'access denied message' }
      ]
    };

    outlines.push({
      name: 'Access control by user role',
      type: 'scenario_outline',
      given: ['a <userRole> user'],
      when: ['they attempt to access the resource'],
      then: [
        'access is <hasAccess>',
        'the expected action is <expectedAction>'
      ],
      examples,
      tags: ['@data-driven', '@security'],
      testCaseCount: examples.rows.length
    });
  }

  // Status code scenario outline
  if (/(response|status|http|api|endpoint|request)/.test(text)) {
    const examples: ScenarioExamples = {
      name: 'API response scenarios',
      headers: ['scenario', 'statusCode', 'responseType'],
      rows: [
        { scenario: 'successful request', statusCode: '200', responseType: 'success' },
        { scenario: 'bad request', statusCode: '400', responseType: 'error' },
        { scenario: 'unauthorized', statusCode: '401', responseType: 'error' },
        { scenario: 'not found', statusCode: '404', responseType: 'error' },
        { scenario: 'server error', statusCode: '500', responseType: 'error' }
      ]
    };

    outlines.push({
      name: 'API response handling',
      type: 'scenario_outline',
      given: ['a <scenario> is sent to the API'],
      when: ['the API processes the request'],
      then: [
        'the HTTP response code is <statusCode>',
        'the response type is <responseType>'
      ],
      examples,
      tags: ['@data-driven', '@api'],
      testCaseCount: examples.rows.length
    });
  }

  return outlines;
}

// ==================== Step Generation ====================

/**
 * Extract primary action verb
 */
function extractActionVerb(requirement: RequirementForBdd): string {
  const verbs = [
    'create', 'update', 'delete', 'retrieve', 'process',
    'validate', 'execute', 'submit', 'save', 'load',
    'authenticate', 'authorize', 'search', 'filter', 'sort'
  ];

  const text = requirement.title.toLowerCase();

  for (const verb of verbs) {
    if (text.includes(verb)) {
      return verb;
    }
  }

  return 'perform';
}

/**
 * Generate Given steps
 */
function generateGivenSteps(requirement: RequirementForBdd): string[] {
  const steps: string[] = [];
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // User/actor preconditions
  if (/(user|actor|customer)/.test(text)) {
    steps.push('a user with valid credentials');
  }

  // System state preconditions
  if (/(system|application|service)/.test(text)) {
    steps.push('the system is in a valid state');
  }

  // Data preconditions
  if (/(data|record|entity|item)/.test(text)) {
    steps.push('the required data exists in the system');
  }

  // Authentication
  if (/(auth|permission|role)/.test(text)) {
    steps.push('the user is properly authenticated');
  }

  if (steps.length === 0) {
    steps.push('the system is ready to process the request');
  }

  return steps;
}

/**
 * Generate When steps
 */
function generateWhenSteps(requirement: RequirementForBdd, actionVerb: string): string[] {
  const steps: string[] = [];

  steps.push(`the user initiates the ${actionVerb} operation`);

  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  if (/(submit|send|request)/.test(text)) {
    steps.push('the request is submitted with valid data');
  } else if (/(trigger|execute)/.test(text)) {
    steps.push('the operation is triggered');
  }

  return steps;
}

/**
 * Generate Then steps
 */
function generateThenSteps(requirement: RequirementForBdd, actionVerb: string): string[] {
  const steps: string[] = [];
  const text = `${requirement.title} ${requirement.description}`.toLowerCase();

  // Success outcome
  if (/(success|complete|finish|successful)/.test(text)) {
    steps.push('the operation completes successfully');
  } else {
    steps.push(`the ${actionVerb} operation is completed successfully`);
  }

  // Response
  if (/(response|return|result)/.test(text)) {
    steps.push('a success response is returned');
  }

  // Data persistence
  if (/(save|persist|store|create|update)/.test(text)) {
    steps.push('the data is persisted correctly');
  }

  // Notification
  if (/(notify|alert|inform|message)/.test(text)) {
    steps.push('the user is notified of the successful operation');
  }

  // Logging
  if (/(log|audit|track)/.test(text)) {
    steps.push('the operation is logged for audit purposes');
  }

  if (steps.length === 1) {
    steps.push('the expected outcome is achieved');
  }

  return steps;
}

// ==================== Gherkin Content Generation ====================

/**
 * Build complete Gherkin feature file content
 */
function buildGherkinContent(
  featureName: string,
  narrative: FeatureNarrative,
  background: GherkinBackground | undefined,
  scenarios: GherkinScenario[]
): string {
  const lines: string[] = [];

  // Feature header
  lines.push(`${GHERKIN_KEYWORDS.feature}: ${featureName}`);
  lines.push('');

  // Feature narrative
  lines.push(`  As a ${narrative.asA}`);
  lines.push(`  I want ${narrative.iWant}`);
  lines.push(`  So that ${narrative.soThat}`);
  lines.push('');

  // Background
  if (background && background.steps.length > 0) {
    lines.push(`  ${GHERKIN_KEYWORDS.background}:`);
    for (const step of background.steps) {
      lines.push(`    ${GHERKIN_KEYWORDS.given} ${step}`);
    }
    lines.push('');
  }

  // Scenarios
  for (const scenario of scenarios) {
    // Tags
    if (scenario.tags && scenario.tags.length > 0) {
      lines.push(`  ${scenario.tags.map((t) => t.startsWith('@') ? t : `@${t}`).join(' ')}`);
    }

    // Scenario keyword
    const keyword =
      scenario.type === 'scenario_outline' ? GHERKIN_KEYWORDS.scenarioOutline : GHERKIN_KEYWORDS.scenario;
    lines.push(`  ${keyword}: ${scenario.name}`);

    // Given steps
    for (let i = 0; i < scenario.given.length; i++) {
      const keyword = i === 0 ? GHERKIN_KEYWORDS.given : GHERKIN_KEYWORDS.and;
      lines.push(`    ${keyword} ${scenario.given[i]}`);
    }

    // When steps
    for (let i = 0; i < scenario.when.length; i++) {
      const keyword = i === 0 ? GHERKIN_KEYWORDS.when : GHERKIN_KEYWORDS.and;
      lines.push(`    ${keyword} ${scenario.when[i]}`);
    }

    // Then steps
    for (let i = 0; i < scenario.then.length; i++) {
      const keyword = i === 0 ? GHERKIN_KEYWORDS.then : GHERKIN_KEYWORDS.and;
      lines.push(`    ${keyword} ${scenario.then[i]}`);
    }

    // Examples
    if (scenario.examples) {
      lines.push('');
      lines.push(`    ${GHERKIN_KEYWORDS.examples}:`);

      if (scenario.examples.name) {
        lines.push(`      (${scenario.examples.name})`);
      }

      // Header row
      const headers = scenario.examples.headers;
      const headerRow = headers.map((h) => ` ${h} `).join('|');
      lines.push(`      |${headerRow}|`);

      // Data rows
      for (const row of scenario.examples.rows) {
        const values = headers.map((h) => ` ${row[h] ?? ''} `).join('|');
        lines.push(`      |${values}|`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ==================== Utility Functions ====================

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `bdd-gen-${Date.now()}-${seededRandom.random().toString(36).substr(2, 9)}`;
}

/**
 * Create success response
 */
function createSuccessResponse<T>(
  data: T,
  requestId: string,
  executionTime: number
): QEToolResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'bdd-generator',
      version: '1.0.0'
    }
  };
}

/**
 * Create error response
 */
function createErrorResponse(
  error: Error,
  requestId: string,
  executionTime: number
): QEToolResponse<never> {
  return {
    success: false,
    error: {
      code: 'BDD_GENERATION_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
      executionTime,
      agent: 'bdd-generator',
      version: '1.0.0'
    }
  };
}
