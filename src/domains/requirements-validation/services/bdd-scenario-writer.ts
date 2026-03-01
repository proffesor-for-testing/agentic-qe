/**
 * Agentic QE v3 - BDD Scenario Writer Service
 * Generates Gherkin/BDD scenarios from requirements
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import { toError } from '../../../shared/error-utils.js';
import {
  IBDDGenerationService,
  Requirement,
  BDDScenario,
  DataTable,
} from '../interfaces.js';

/**
 * Configuration for the BDD scenario writer
 */
export interface BDDScenarioWriterConfig {
  defaultExampleCount: number;
  includeBackgroundScenarios: boolean;
  generateNegativeScenarios: boolean;
  maxScenariosPerRequirement: number;
}

const DEFAULT_CONFIG: BDDScenarioWriterConfig = {
  defaultExampleCount: 3,
  includeBackgroundScenarios: true,
  generateNegativeScenarios: true,
  maxScenariosPerRequirement: 10,
};

/**
 * Mutable scenario for internal parsing
 */
interface MutableBDDScenario {
  id: string;
  feature: string;
  scenario: string;
  given: string[];
  when: string[];
  then: string[];
  tags: string[];
  examples?: MutableDataTable;
}

/**
 * Mutable data table for internal parsing
 */
interface MutableDataTable {
  headers: string[];
  rows: string[][];
}

/**
 * BDD Scenario Writer Service Implementation
 * Generates BDD scenarios in Gherkin format from requirements
 */
export class BDDScenarioWriterService implements IBDDGenerationService {
  private readonly config: BDDScenarioWriterConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<BDDScenarioWriterConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate BDD scenarios from a requirement
   */
  async generateScenarios(requirement: Requirement): Promise<Result<BDDScenario[]>> {
    try {
      const scenarios: BDDScenario[] = [];
      const feature = this.extractFeatureName(requirement);

      // Generate scenarios from acceptance criteria
      for (const ac of requirement.acceptanceCriteria) {
        const scenario = this.generateScenarioFromCriteria(feature, ac, requirement);
        if (scenario) {
          scenarios.push(scenario);
        }
      }

      // Generate additional scenarios based on requirement type
      const additionalScenarios = this.generateAdditionalScenarios(requirement, feature);
      scenarios.push(...additionalScenarios);

      // Generate negative scenarios if enabled
      if (this.config.generateNegativeScenarios) {
        const negativeScenarios = this.generateNegativeScenarios(requirement, feature);
        scenarios.push(...negativeScenarios);
      }

      // Limit scenarios
      const limitedScenarios = scenarios.slice(0, this.config.maxScenariosPerRequirement);

      // Store generated scenarios
      await this.storeScenarios(requirement.id, limitedScenarios);

      return ok(limitedScenarios);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Generate scenarios with data table examples
   */
  async generateScenariosWithExamples(
    requirement: Requirement,
    exampleCount: number
  ): Promise<Result<BDDScenario[]>> {
    try {
      const baseResult = await this.generateScenarios(requirement);
      if (!baseResult.success) {
        return baseResult;
      }

      const scenariosWithExamples = baseResult.value.map((scenario) => {
        const examples = this.generateExamplesForScenario(scenario, exampleCount);
        return {
          ...scenario,
          examples,
        };
      });

      return ok(scenariosWithExamples);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Convert scenarios to Gherkin text format
   */
  toGherkin(scenarios: BDDScenario[]): string {
    if (scenarios.length === 0) {
      return '';
    }

    const feature = scenarios[0].feature;
    const lines: string[] = [];

    // Feature header
    lines.push(`Feature: ${feature}`);
    lines.push('');

    // Group scenarios by tags
    const groupedScenarios = this.groupScenariosByTags(scenarios);

    for (const scenario of groupedScenarios) {
      // Tags
      if (scenario.tags.length > 0) {
        lines.push(`  ${scenario.tags.map((t) => `@${t}`).join(' ')}`);
      }

      // Scenario or Scenario Outline
      const hasExamples = scenario.examples && scenario.examples.rows.length > 0;
      const scenarioKeyword = hasExamples ? 'Scenario Outline' : 'Scenario';
      lines.push(`  ${scenarioKeyword}: ${scenario.scenario}`);

      // Given steps
      for (let i = 0; i < scenario.given.length; i++) {
        const keyword = i === 0 ? 'Given' : 'And';
        lines.push(`    ${keyword} ${scenario.given[i]}`);
      }

      // When steps
      for (let i = 0; i < scenario.when.length; i++) {
        const keyword = i === 0 ? 'When' : 'And';
        lines.push(`    ${keyword} ${scenario.when[i]}`);
      }

      // Then steps
      for (let i = 0; i < scenario.then.length; i++) {
        const keyword = i === 0 ? 'Then' : 'And';
        lines.push(`    ${keyword} ${scenario.then[i]}`);
      }

      // Examples table
      if (hasExamples && scenario.examples) {
        lines.push('');
        lines.push('    Examples:');
        lines.push(`      | ${scenario.examples.headers.join(' | ')} |`);
        for (const row of scenario.examples.rows) {
          lines.push(`      | ${row.join(' | ')} |`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Parse Gherkin text to BDD scenarios
   */
  parseGherkin(gherkinText: string): Result<BDDScenario[]> {
    try {
      const scenarios: BDDScenario[] = [];
      const lines = gherkinText.split('\n').map((l) => l.trim());

      let currentFeature = '';
      let currentScenario: MutableBDDScenario | null = null;
      let currentTags: string[] = [];
      let currentSection: 'given' | 'when' | 'then' | 'examples' | null = null;
      let currentExamples: MutableDataTable | null = null;

      for (const line of lines) {
        // Skip empty lines and comments
        if (!line || line.startsWith('#')) {
          continue;
        }

        // Tags
        if (line.startsWith('@')) {
          currentTags = line.split(/\s+/).map((t) => t.replace('@', ''));
          continue;
        }

        // Feature
        if (line.startsWith('Feature:')) {
          currentFeature = line.replace('Feature:', '').trim();
          continue;
        }

        // Scenario or Scenario Outline
        if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
          // Save previous scenario
          if (currentScenario) {
            if (currentExamples) {
              currentScenario.examples = currentExamples;
            }
            scenarios.push(this.convertToReadonly(currentScenario));
          }

          const scenarioName = line
            .replace('Scenario Outline:', '')
            .replace('Scenario:', '')
            .trim();

          currentScenario = {
            id: uuidv4(),
            feature: currentFeature,
            scenario: scenarioName,
            given: [],
            when: [],
            then: [],
            tags: [...currentTags],
          };
          currentTags = [];
          currentSection = null;
          currentExamples = null;
          continue;
        }

        // Given/When/Then/And steps
        if (line.startsWith('Given')) {
          currentSection = 'given';
          currentScenario?.given.push(line.replace('Given', '').trim());
        } else if (line.startsWith('When')) {
          currentSection = 'when';
          currentScenario?.when.push(line.replace('When', '').trim());
        } else if (line.startsWith('Then')) {
          currentSection = 'then';
          currentScenario?.then.push(line.replace('Then', '').trim());
        } else if (line.startsWith('And') && currentSection && currentScenario && currentSection !== 'examples') {
          const step = line.replace('And', '').trim();
          currentScenario[currentSection].push(step);
        } else if (line.startsWith('But') && currentSection && currentScenario && currentSection !== 'examples') {
          const step = line.replace('But', '').trim();
          currentScenario[currentSection].push(step);
        }

        // Examples
        if (line.startsWith('Examples:')) {
          currentSection = 'examples';
          currentExamples = { headers: [], rows: [] };
          continue;
        }

        // Table rows
        if (line.startsWith('|') && currentExamples) {
          const cells = line
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());

          if (currentExamples.headers.length === 0) {
            currentExamples.headers = cells;
          } else {
            currentExamples.rows.push(cells);
          }
        }
      }

      // Save last scenario
      if (currentScenario) {
        if (currentExamples) {
          currentScenario.examples = currentExamples;
        }
        scenarios.push(this.convertToReadonly(currentScenario));
      }

      return ok(scenarios);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Convert mutable scenario to readonly BDDScenario
   */
  private convertToReadonly(scenario: MutableBDDScenario): BDDScenario {
    return {
      id: scenario.id,
      feature: scenario.feature,
      scenario: scenario.scenario,
      given: scenario.given,
      when: scenario.when,
      then: scenario.then,
      tags: scenario.tags,
      examples: scenario.examples,
    };
  }

  // ============================================================================
  // Private Scenario Generation Methods
  // ============================================================================

  private generateScenarioFromCriteria(
    feature: string,
    acceptanceCriteria: string,
    requirement: Requirement
  ): BDDScenario | null {
    // Try to parse GWT format
    const gwtPattern =
      /given\s+(.+?)\s+when\s+(.+?)\s+then\s+(.+?)(?:\s+and\s+(.+))?$/i;
    const gwtMatch = acceptanceCriteria.match(gwtPattern);

    if (gwtMatch) {
      return {
        id: uuidv4(),
        feature,
        scenario: this.extractScenarioTitle(acceptanceCriteria),
        given: [gwtMatch[1].trim()],
        when: [gwtMatch[2].trim()],
        then: gwtMatch[4]
          ? [gwtMatch[3].trim(), gwtMatch[4].trim()]
          : [gwtMatch[3].trim()],
        tags: this.inferTags(requirement),
      };
    }

    // Generate from plain text acceptance criteria
    return this.generateScenarioFromPlainText(feature, acceptanceCriteria, requirement);
  }

  private generateScenarioFromPlainText(
    feature: string,
    text: string,
    requirement: Requirement
  ): BDDScenario {
    // Extract action words and build scenario
    const given: string[] = [];
    const when: string[] = [];
    const then: string[] = [];

    // Analyze text for scenario components
    const lowerText = text.toLowerCase();

    // Default preconditions based on requirement type
    if (requirement.type === 'user-story') {
      given.push('the user is authenticated');
    } else if (requirement.type === 'functional') {
      given.push('the system is in a valid state');
    } else {
      given.push('the preconditions are met');
    }

    // Extract action (when)
    if (lowerText.includes('click') || lowerText.includes('press')) {
      when.push('the user performs the action');
    } else if (lowerText.includes('enter') || lowerText.includes('input')) {
      when.push('the user provides the required input');
    } else if (lowerText.includes('submit') || lowerText.includes('send')) {
      when.push('the user submits the form');
    } else if (lowerText.includes('select') || lowerText.includes('choose')) {
      when.push('the user makes a selection');
    } else {
      when.push('the action is performed');
    }

    // Extract expected outcome (then)
    if (lowerText.includes('display') || lowerText.includes('show')) {
      then.push('the expected content is displayed');
    } else if (lowerText.includes('save') || lowerText.includes('store')) {
      then.push('the data is persisted correctly');
    } else if (lowerText.includes('error') || lowerText.includes('fail')) {
      then.push('an appropriate error message is shown');
    } else if (lowerText.includes('redirect') || lowerText.includes('navigate')) {
      then.push('the user is redirected to the expected page');
    } else if (lowerText.includes('notify') || lowerText.includes('email')) {
      then.push('a notification is sent');
    } else {
      then.push('the expected outcome is achieved');
    }

    return {
      id: uuidv4(),
      feature,
      scenario: this.extractScenarioTitle(text),
      given,
      when,
      then,
      tags: this.inferTags(requirement),
    };
  }

  private generateAdditionalScenarios(
    requirement: Requirement,
    feature: string
  ): BDDScenario[] {
    const scenarios: BDDScenario[] = [];

    // Generate based on requirement type
    switch (requirement.type) {
      case 'user-story':
        scenarios.push(
          this.createScenario(feature, 'First-time user flow', requirement, {
            given: ['a new user visits the application'],
            when: ['they complete the onboarding process'],
            then: ['they can access the main features'],
          })
        );
        break;

      case 'non-functional':
        if (
          requirement.description.toLowerCase().includes('performance') ||
          requirement.description.toLowerCase().includes('speed')
        ) {
          scenarios.push(
            this.createScenario(feature, 'Performance under load', requirement, {
              given: ['the system is under normal load'],
              when: ['100 concurrent users perform operations'],
              then: ['response time remains under threshold'],
            })
          );
        }
        break;

      case 'technical':
        scenarios.push(
          this.createScenario(feature, 'System integration', requirement, {
            given: ['all dependent services are available'],
            when: ['the system initializes'],
            then: ['all integrations are established successfully'],
          })
        );
        break;
    }

    return scenarios;
  }

  private generateNegativeScenarios(
    requirement: Requirement,
    feature: string
  ): BDDScenario[] {
    const scenarios: BDDScenario[] = [];

    // Invalid input scenario
    scenarios.push(
      this.createScenario(feature, 'Invalid input handling', requirement, {
        given: ['the user is on the input form'],
        when: ['they submit invalid data'],
        then: ['validation errors are displayed', 'the form is not submitted'],
        tags: ['negative', 'validation'],
      })
    );

    // Unauthorized access scenario
    if (requirement.type === 'user-story' || requirement.type === 'functional') {
      scenarios.push(
        this.createScenario(feature, 'Unauthorized access attempt', requirement, {
          given: ['the user is not authenticated'],
          when: ['they attempt to access protected resources'],
          then: ['access is denied', 'a login prompt is displayed'],
          tags: ['negative', 'security'],
        })
      );
    }

    // Error recovery scenario
    scenarios.push(
      this.createScenario(feature, 'Error recovery', requirement, {
        given: ['an error has occurred during operation'],
        when: ['the user attempts to recover'],
        then: ['the system returns to a valid state', 'no data is lost'],
        tags: ['negative', 'error-handling'],
      })
    );

    return scenarios;
  }

  private createScenario(
    feature: string,
    scenarioTitle: string,
    requirement: Requirement,
    config: {
      given: string[];
      when: string[];
      then: string[];
      tags?: string[];
    }
  ): BDDScenario {
    return {
      id: uuidv4(),
      feature,
      scenario: scenarioTitle,
      given: config.given,
      when: config.when,
      then: config.then,
      tags: config.tags || this.inferTags(requirement),
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private extractFeatureName(requirement: Requirement): string {
    // Use requirement title as feature name, cleaned up
    return requirement.title
      .replace(/^(as a|i want|enable|implement|add|create)\s+/i, '')
      .trim();
  }

  private extractScenarioTitle(text: string): string {
    // Create a concise scenario title from text
    const words = text.split(/\s+/).slice(0, 8);
    let title = words.join(' ');

    if (title.length > 60) {
      title = title.slice(0, 57) + '...';
    }

    // Capitalize first letter
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  private inferTags(requirement: Requirement): string[] {
    const tags: string[] = [];

    // Add type tag
    tags.push(requirement.type);

    // Add priority tag
    tags.push(`priority-${requirement.priority}`);

    // Infer additional tags from content
    const text = `${requirement.title} ${requirement.description}`.toLowerCase();

    if (text.includes('api') || text.includes('endpoint')) {
      tags.push('api');
    }
    if (text.includes('ui') || text.includes('interface') || text.includes('display')) {
      tags.push('ui');
    }
    if (text.includes('database') || text.includes('persist') || text.includes('storage')) {
      tags.push('database');
    }
    if (text.includes('security') || text.includes('auth') || text.includes('permission')) {
      tags.push('security');
    }
    if (text.includes('performance') || text.includes('speed') || text.includes('fast')) {
      tags.push('performance');
    }

    return tags;
  }

  private generateExamplesForScenario(scenario: BDDScenario, count: number): DataTable {
    // Extract placeholders from scenario steps
    const placeholders = new Set<string>();
    const placeholderPattern = /<(\w+)>/g;

    const allSteps = [...scenario.given, ...scenario.when, ...scenario.then];
    for (const step of allSteps) {
      let match;
      while ((match = placeholderPattern.exec(step)) !== null) {
        placeholders.add(match[1]);
      }
    }

    // If no placeholders, create generic examples
    const headers =
      placeholders.size > 0 ? Array.from(placeholders) : ['input', 'expected_result'];

    const rows: string[][] = [];
    for (let i = 0; i < count; i++) {
      const row = headers.map((header) => this.generateExampleValue(header, i));
      rows.push(row);
    }

    return { headers, rows };
  }

  private generateExampleValue(header: string, index: number): string {
    const lowerHeader = header.toLowerCase();

    // Generate appropriate test data based on header name
    if (lowerHeader.includes('name') || lowerHeader.includes('user')) {
      return `test_user_${index + 1}`;
    }
    if (lowerHeader.includes('email')) {
      return `user${index + 1}@example.com`;
    }
    if (lowerHeader.includes('password')) {
      return index === 0 ? 'ValidPass123!' : index === 1 ? 'short' : '';
    }
    if (lowerHeader.includes('amount') || lowerHeader.includes('price')) {
      return String((index + 1) * 100);
    }
    if (lowerHeader.includes('count') || lowerHeader.includes('quantity')) {
      return String(index + 1);
    }
    if (lowerHeader.includes('date')) {
      const date = new Date();
      date.setDate(date.getDate() + index);
      return date.toISOString().split('T')[0];
    }
    if (lowerHeader.includes('result') || lowerHeader.includes('expected')) {
      return index === 0 ? 'success' : index === 1 ? 'failure' : 'error';
    }
    if (lowerHeader.includes('status')) {
      return ['active', 'pending', 'inactive'][index] || 'unknown';
    }

    return `value_${index + 1}`;
  }

  private groupScenariosByTags(scenarios: BDDScenario[]): BDDScenario[] {
    // Sort scenarios to group similar ones together
    return [...scenarios].sort((a, b) => {
      const aHasNegative = a.tags.includes('negative');
      const bHasNegative = b.tags.includes('negative');

      if (aHasNegative !== bHasNegative) {
        return aHasNegative ? 1 : -1;
      }

      return a.scenario.localeCompare(b.scenario);
    });
  }

  private async storeScenarios(
    requirementId: string,
    scenarios: BDDScenario[]
  ): Promise<void> {
    await this.memory.set(
      `requirements-validation:scenarios:${requirementId}`,
      {
        requirementId,
        scenarios,
        generatedAt: new Date().toISOString(),
        count: scenarios.length,
      },
      { namespace: 'requirements-validation', persist: true }
    );
  }
}
