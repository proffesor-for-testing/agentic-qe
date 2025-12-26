/**
 * Gherkin Formatter - Formats test cases as Gherkin feature files
 */

import {
  TestCase,
  TestSuite,
  GherkinFeature,
  GherkinScenario,
  TestStep,
  UserStory,
} from '../types/htsm.types';

export class GherkinFormatter {
  /**
   * Format a test suite as Gherkin feature files
   */
  formatTestSuite(suite: TestSuite, userStories: UserStory[]): Map<string, string> {
    const features = new Map<string, string>();

    // Group tests by user story
    const testsByStory = this.groupTestsByStory(suite.tests, userStories);

    testsByStory.forEach((tests, storyId) => {
      const story = userStories.find((s) => s.id === storyId);
      if (story) {
        const featureContent = this.formatFeature(story, tests);
        features.set(`${storyId}.feature`, featureContent);
      }
    });

    // Create a feature for tests without linked user stories
    const unlinkedTests = suite.tests.filter((t) => !t.traceability.userStoryId);
    if (unlinkedTests.length > 0) {
      const miscFeature = this.formatMiscellaneousFeature(unlinkedTests);
      features.set('miscellaneous.feature', miscFeature);
    }

    return features;
  }

  /**
   * Format a single user story as a Gherkin feature
   */
  formatFeature(story: UserStory, tests: TestCase[]): string {
    const lines: string[] = [];

    // Feature tags
    const tags = [
      `@${story.id}`,
      ...(story.epicId ? [`@${story.epicId}`] : []),
      ...(story.tags?.map((t) => `@${t}`) || []),
    ];
    lines.push(tags.join(' '));

    // Feature declaration
    lines.push(`Feature: ${story.title}`);
    lines.push(`  As a ${story.asA}`);
    lines.push(`  I want ${story.iWant}`);
    lines.push(`  So that ${story.soThat}`);
    lines.push('');

    // Background (common preconditions)
    const commonPreconditions = this.findCommonPreconditions(tests);
    if (commonPreconditions.length > 0) {
      lines.push('  Background:');
      commonPreconditions.forEach((precondition) => {
        lines.push(`    Given ${precondition}`);
      });
      lines.push('');
    }

    // Scenarios
    tests.forEach((test) => {
      lines.push(this.formatScenario(test));
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Format a single test case as a Gherkin scenario
   */
  formatScenario(test: TestCase): string {
    const lines: string[] = [];

    // Scenario tags
    const tags = [
      `@${test.id}`,
      `@HTSM:${test.htsm.primary.category}`,
      `@HTSM:${test.htsm.primary.subcategory}`,
      `@Priority:${test.priority}`,
      ...test.tags.filter((t) => !t.startsWith('htsm:') && !t.startsWith('priority:')).map((t) => `@${t}`),
    ];
    lines.push(`  ${tags.join(' ')}`);

    // Scenario declaration
    const scenarioType = test.testData && Object.keys(test.testData).length > 0 ? 'Scenario Outline' : 'Scenario';
    lines.push(`  ${scenarioType}: ${test.name}`);

    // Steps
    test.steps.forEach((step) => {
      const stepText = this.formatStep(step);
      lines.push(`    ${stepText}`);
    });

    // Examples for Scenario Outline
    if (scenarioType === 'Scenario Outline' && test.testData) {
      lines.push('');
      lines.push(this.formatExamples(test.testData));
    }

    return lines.join('\n');
  }

  /**
   * Format a test step
   */
  private formatStep(step: TestStep): string {
    const keyword = this.capitalizeFirst(step.type);
    return `${keyword} ${step.text}`;
  }

  /**
   * Format examples table for Scenario Outline
   */
  private formatExamples(testData: Record<string, unknown>): string {
    const lines: string[] = ['    Examples:'];

    if (testData.boundaryValues) {
      const bv = testData.boundaryValues as Record<string, string>;
      lines.push('      | value_type    | value           |');
      Object.entries(bv).forEach(([key, value]) => {
        lines.push(`      | ${key.padEnd(13)} | ${String(value).padEnd(15)} |`);
      });
    } else if (testData.partitions) {
      const partitions = testData.partitions as Record<string, string>;
      lines.push('      | partition | value                       |');
      Object.entries(partitions).forEach(([key, value]) => {
        lines.push(`      | ${key.padEnd(9)} | ${String(value).padEnd(27)} |`);
      });
    } else if (testData.combinations) {
      const combinations = testData.combinations as Array<Record<string, unknown>>;
      if (combinations.length > 0) {
        const headers = Object.keys(combinations[0]);
        lines.push(`      | ${headers.map((h) => h.padEnd(15)).join(' | ')} |`);
        combinations.forEach((combo) => {
          const values = headers.map((h) => String(combo[h]).padEnd(15));
          lines.push(`      | ${values.join(' | ')} |`);
        });
      }
    } else if (testData.errorCases) {
      const errors = testData.errorCases as string[];
      lines.push('      | error_case           |');
      errors.forEach((error) => {
        lines.push(`      | ${error.padEnd(20)} |`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Format tests without linked user stories
   */
  private formatMiscellaneousFeature(tests: TestCase[]): string {
    const lines: string[] = [];

    lines.push('@miscellaneous @generated');
    lines.push('Feature: Generated Test Ideas');
    lines.push('  Test ideas generated from Product Factors (SFDIPOT) analysis without direct user story links');
    lines.push('');

    // Group by HTSM category
    const byCategory = new Map<string, TestCase[]>();
    tests.forEach((test) => {
      const cat = test.htsm.primary.category;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(test);
    });

    byCategory.forEach((categoryTests, category) => {
      lines.push(`  # ${category} Tests`);
      categoryTests.forEach((test) => {
        lines.push(this.formatScenario(test));
        lines.push('');
      });
    });

    return lines.join('\n');
  }

  /**
   * Group tests by their linked user story
   */
  private groupTestsByStory(tests: TestCase[], userStories: UserStory[]): Map<string, TestCase[]> {
    const grouped = new Map<string, TestCase[]>();

    tests.forEach((test) => {
      const storyId = test.traceability.userStoryId;
      if (storyId) {
        if (!grouped.has(storyId)) {
          grouped.set(storyId, []);
        }
        grouped.get(storyId)!.push(test);
      }
    });

    return grouped;
  }

  /**
   * Find common preconditions across tests
   */
  private findCommonPreconditions(tests: TestCase[]): string[] {
    if (tests.length === 0) return [];

    // Find preconditions that appear in all tests
    const firstTest = tests[0];
    return firstTest.preconditions.filter((precondition) =>
      tests.every((test) => test.preconditions.includes(precondition))
    );
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Format a single test case as standalone Gherkin
   */
  formatSingleTest(test: TestCase): string {
    const lines: string[] = [];

    // Tags
    const tags = [
      `@${test.id}`,
      `@HTSM:${test.htsm.primary.category}`,
      `@Priority:${test.priority}`,
    ];
    lines.push(tags.join(' '));

    // Feature wrapper
    lines.push(`Feature: ${test.name}`);
    lines.push('');
    lines.push(this.formatScenario(test));

    return lines.join('\n');
  }

  /**
   * Format HTSM coverage summary as Gherkin comments
   */
  formatCoverageSummary(suite: TestSuite): string {
    const lines: string[] = [];

    lines.push('# ============================================================');
    lines.push(`# Product Factors (SFDIPOT) Test Ideas Coverage Summary for: ${suite.name}`);
    lines.push(`# Generated: ${suite.generatedAt}`);
    lines.push('# ============================================================');
    lines.push('#');
    lines.push(`# Overall Product Factors (SFDIPOT) Coverage: ${suite.htsmCoverage.overall}%`);
    lines.push('#');
    lines.push('# Coverage by Category:');

    Object.entries(suite.htsmCoverage.byCategory).forEach(([category, data]) => {
      lines.push(`#   ${category}: ${data.testCount} tests (${data.coverage}%)`);
      Object.entries(data.subcategories).forEach(([sub, count]) => {
        lines.push(`#     - ${sub}: ${count} tests`);
      });
    });

    if (suite.htsmCoverage.gaps.length > 0) {
      lines.push('#');
      lines.push('# Coverage Gaps:');
      suite.htsmCoverage.gaps.forEach((gap) => {
        lines.push(`#   [${gap.severity.toUpperCase()}] ${gap.category}: ${gap.recommendation}`);
      });
    }

    lines.push('#');
    lines.push(`# Traceability Coverage: ${suite.traceabilityMatrix.coverage}%`);
    lines.push('# ============================================================');
    lines.push('');

    return lines.join('\n');
  }
}

export const gherkinFormatter = new GherkinFormatter();
