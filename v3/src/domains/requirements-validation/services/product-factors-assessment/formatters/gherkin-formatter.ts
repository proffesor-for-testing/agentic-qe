/**
 * Gherkin Formatter for Product Factors Assessor
 *
 * Generates Gherkin/Cucumber feature files from test ideas
 * for BDD-style test automation.
 */

import {
  AssessmentOutput,
  HTSMCategory,
  CategoryAnalysis,
  TestIdea,
  Priority,
  AutomationFitness,
  CATEGORY_DESCRIPTIONS,
} from '../types';

export interface GherkinFormatterOptions {
  includeBackground?: boolean;
  includeExamples?: boolean;
  groupByCategory?: boolean;
  tagPrefix?: string;
}

/**
 * Gherkin Formatter
 *
 * Produces Cucumber/Gherkin feature files suitable for:
 * - BDD test automation
 * - Cucumber/SpecFlow/Behave
 * - Living documentation
 */
export class GherkinFormatter {
  private options: GherkinFormatterOptions;

  constructor(options: GherkinFormatterOptions = {}) {
    this.options = {
      includeBackground: options.includeBackground ?? true,
      includeExamples: options.includeExamples ?? false,
      groupByCategory: options.groupByCategory ?? true,
      tagPrefix: options.tagPrefix ?? '',
    };
  }

  /**
   * Format assessment output as Gherkin features
   * Returns a Map of feature name -> feature content
   */
  format(output: AssessmentOutput): Map<string, string> {
    const features = new Map<string, string>();

    if (this.options.groupByCategory) {
      // One feature file per category
      for (const [category, analysis] of Array.from(output.categoryAnalysis.entries())) {
        const featureContent = this.formatCategoryFeature(category, analysis, output.name);
        if (featureContent) {
          const fileName = `${category.toLowerCase()}.feature`;
          features.set(fileName, featureContent);
        }
      }
    } else {
      // Single feature file
      const featureContent = this.formatSingleFeature(output);
      features.set('sfdipot-assessment.feature', featureContent);
    }

    return features;
  }

  /**
   * Format a single category as a feature file
   */
  private formatCategoryFeature(
    category: HTSMCategory,
    analysis: CategoryAnalysis,
    assessmentName: string
  ): string | null {
    if (analysis.testIdeas.length === 0) {
      return null;
    }

    const lines: string[] = [];

    // Feature header with tags
    const categoryTag = this.formatTag(category.toLowerCase());
    const priorityTags = this.getUniquePriorityTags(analysis.testIdeas);

    lines.push(`${categoryTag} ${priorityTags}`);
    lines.push(`Feature: ${category} - ${this.toTitleCase(category)} Testing`);
    lines.push(`  ${CATEGORY_DESCRIPTIONS[category]}`);
    lines.push('');
    lines.push(`  Assessment: ${assessmentName}`);
    lines.push('');

    // Background section
    if (this.options.includeBackground) {
      lines.push('  Background:');
      lines.push('    Given the system is initialized');
      lines.push('    And the user is authenticated');
      lines.push('');
    }

    // Group test ideas by subcategory
    const bySubcategory = new Map<string, TestIdea[]>();
    for (const idea of analysis.testIdeas) {
      if (!bySubcategory.has(idea.subcategory)) {
        bySubcategory.set(idea.subcategory, []);
      }
      bySubcategory.get(idea.subcategory)!.push(idea);
    }

    // Generate scenarios for each subcategory
    for (const [subcategory, ideas] of Array.from(bySubcategory.entries())) {
      lines.push(`  # ${subcategory} Subcategory`);

      for (const idea of ideas) {
        lines.push(this.formatScenario(idea, subcategory));
      }
    }

    return lines.join('\n');
  }

  /**
   * Format all categories into a single feature file
   */
  private formatSingleFeature(output: AssessmentOutput): string {
    const lines: string[] = [];

    // Feature header
    lines.push('@sfdipot @assessment');
    lines.push(`Feature: SFDIPOT Assessment - ${output.name}`);
    lines.push('  Comprehensive test coverage based on HTSM Product Factors');
    lines.push('');

    if (this.options.includeBackground) {
      lines.push('  Background:');
      lines.push('    Given the system is initialized');
      lines.push('    And the user is authenticated');
      lines.push('');
    }

    // Generate scenarios for each category
    for (const [category, analysis] of Array.from(output.categoryAnalysis.entries())) {
      if (analysis.testIdeas.length === 0) continue;

      lines.push(`  # ============== ${category} ==============`);
      lines.push(`  # ${CATEGORY_DESCRIPTIONS[category]}`);
      lines.push('');

      for (const idea of analysis.testIdeas) {
        lines.push(this.formatScenario(idea, idea.subcategory));
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a test idea as a Gherkin scenario
   */
  private formatScenario(idea: TestIdea, subcategory: string): string {
    const lines: string[] = [];

    // Tags
    const tags = this.formatScenarioTags(idea);
    lines.push(`  ${tags}`);

    // Scenario title
    const scenarioTitle = this.generateScenarioTitle(idea);
    lines.push(`  Scenario: ${scenarioTitle}`);

    // Generate Given/When/Then from description
    const steps = this.generateSteps(idea);
    for (const step of steps) {
      lines.push(`    ${step}`);
    }

    // Add examples if requested and applicable
    if (this.options.includeExamples && this.shouldHaveExamples(idea)) {
      lines.push('');
      lines.push('    Examples:');
      lines.push(this.generateExamples(idea));
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format tags for a scenario
   */
  private formatScenarioTags(idea: TestIdea): string {
    const tags: string[] = [];

    // Priority tag
    tags.push(this.formatTag(idea.priority.toLowerCase()));

    // Category tag
    tags.push(this.formatTag(idea.category.toLowerCase()));

    // Automation fitness tag
    tags.push(this.formatTag(idea.automationFitness.replace(/-/g, '_')));

    // Custom tags
    if (idea.tags) {
      for (const tag of idea.tags.slice(0, 3)) {
        tags.push(this.formatTag(tag));
      }
    }

    return tags.join(' ');
  }

  /**
   * Format a tag with optional prefix
   */
  private formatTag(tag: string): string {
    const cleanTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    return `@${this.options.tagPrefix}${cleanTag}`;
  }

  /**
   * Generate scenario title from test idea
   */
  private generateScenarioTitle(idea: TestIdea): string {
    // Clean up description for use as title
    let title = idea.description;

    // Remove leading "Verify", "Test", etc.
    title = title.replace(/^(Verify|Test|Check|Ensure)\s+/i, '');

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Truncate if too long
    if (title.length > 80) {
      title = title.substring(0, 77) + '...';
    }

    // Add ID reference
    return `[${idea.id}] ${title}`;
  }

  /**
   * Generate Given/When/Then steps from test idea
   */
  private generateSteps(idea: TestIdea): string[] {
    const steps: string[] = [];
    const desc = idea.description.toLowerCase();

    // Generate Given (preconditions)
    if (desc.includes('user') || desc.includes('actor')) {
      steps.push('Given the user has appropriate permissions');
    } else if (desc.includes('data') || desc.includes('input')) {
      steps.push('Given valid test data is available');
    } else if (desc.includes('system') || desc.includes('service')) {
      steps.push('Given the system is in a stable state');
    } else {
      steps.push('Given the preconditions are met');
    }

    // Add context-specific Given
    if (idea.automationFitness === AutomationFitness.API) {
      steps.push('And the API endpoint is accessible');
    } else if (idea.automationFitness === AutomationFitness.E2E) {
      steps.push('And the user interface is loaded');
    }

    // Generate When (action)
    const action = this.extractAction(idea.description);
    steps.push(`When ${action}`);

    // Generate Then (expected outcome)
    const expectation = this.extractExpectation(idea);
    steps.push(`Then ${expectation}`);

    // Additional Then clauses based on priority
    if (idea.priority === Priority.P0) {
      steps.push('And no data corruption occurs');
      steps.push('And no security vulnerabilities are exposed');
    } else if (idea.priority === Priority.P1) {
      steps.push('And the operation completes successfully');
    }

    return steps;
  }

  /**
   * Extract action from description
   */
  private extractAction(description: string): string {
    // Try to extract the main action
    let action = description;

    // Remove common prefixes
    action = action.replace(/^(Verify|Test|Check|Ensure)\s+(that\s+)?/i, '');

    // Convert to action form
    if (action.match(/^[a-z]/i)) {
      // Add "the user" prefix if needed
      if (!action.toLowerCase().startsWith('the ')) {
        action = 'the user ' + action;
      }
    }

    return action.charAt(0).toLowerCase() + action.slice(1);
  }

  /**
   * Extract expected outcome
   */
  private extractExpectation(idea: TestIdea): string {
    const desc = idea.description.toLowerCase();

    if (desc.includes('error')) {
      return 'the appropriate error is displayed';
    } else if (desc.includes('security') || desc.includes('auth')) {
      return 'access is properly controlled';
    } else if (desc.includes('performance') || desc.includes('load')) {
      return 'performance meets the defined thresholds';
    } else if (desc.includes('valid')) {
      return 'the operation succeeds';
    } else if (desc.includes('invalid')) {
      return 'the operation is rejected appropriately';
    } else {
      return 'the expected behavior is observed';
    }
  }

  /**
   * Check if scenario should have examples
   */
  private shouldHaveExamples(idea: TestIdea): boolean {
    const desc = idea.description.toLowerCase();
    return desc.includes('boundary') ||
           desc.includes('different') ||
           desc.includes('multiple') ||
           desc.includes('various');
  }

  /**
   * Generate examples table
   */
  private generateExamples(idea: TestIdea): string {
    const desc = idea.description.toLowerCase();

    if (desc.includes('boundary')) {
      return `      | value     | expected    |
      | minimum   | valid       |
      | maximum   | valid       |
      | below_min | invalid     |
      | above_max | invalid     |`;
    } else if (desc.includes('browser')) {
      return `      | browser   |
      | Chrome    |
      | Firefox   |
      | Safari    |
      | Edge      |`;
    } else if (desc.includes('role') || desc.includes('user')) {
      return `      | role      | access      |
      | admin     | full        |
      | user      | limited     |
      | guest     | minimal     |`;
    } else {
      return `      | scenario  | expected    |
      | valid     | success     |
      | invalid   | failure     |`;
    }
  }

  /**
   * Get unique priority tags from test ideas
   */
  private getUniquePriorityTags(ideas: TestIdea[]): string {
    const priorities = new Set(ideas.map(i => i.priority));
    return Array.from(priorities).map(p => this.formatTag(p.toLowerCase())).join(' ');
  }

  /**
   * Convert string to title case
   */
  private toTitleCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Format as single string (all features concatenated)
   */
  formatAsString(output: AssessmentOutput): string {
    const features = this.format(output);
    const parts: string[] = [];

    for (const [fileName, content] of Array.from(features.entries())) {
      parts.push(`# File: ${fileName}\n\n${content}`);
    }

    return parts.join('\n\n---\n\n');
  }
}
