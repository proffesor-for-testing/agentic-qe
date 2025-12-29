/**
 * JSON Formatter for Product Factors Assessor
 *
 * Generates JSON output for programmatic consumption
 * of SFDIPOT assessment results.
 */

import {
  AssessmentOutput,
  HTSMCategory,
  CategoryAnalysis,
} from '../types';

export interface JSONFormatterOptions {
  pretty?: boolean;
  includeMetadata?: boolean;
  flattenMaps?: boolean;
}

/**
 * JSON Formatter
 *
 * Produces structured JSON output suitable for:
 * - Integration with other tools
 * - Storage and retrieval
 * - API responses
 */
export class JSONFormatter {
  private options: JSONFormatterOptions;

  constructor(options: JSONFormatterOptions = {}) {
    this.options = {
      pretty: options.pretty ?? true,
      includeMetadata: options.includeMetadata ?? true,
      flattenMaps: options.flattenMaps ?? true,
    };
  }

  /**
   * Format assessment output as JSON string
   */
  format(output: AssessmentOutput): string {
    const jsonObj = this.toJSONObject(output);
    return this.options.pretty
      ? JSON.stringify(jsonObj, null, 2)
      : JSON.stringify(jsonObj);
  }

  /**
   * Convert assessment output to a plain JSON object
   */
  toJSONObject(output: AssessmentOutput): Record<string, unknown> {
    const result: Record<string, unknown> = {
      name: output.name,
      sourceDocuments: output.sourceDocuments,
      testIdeas: output.testIdeas,
      clarifyingQuestions: output.clarifyingQuestions,
      summary: {
        ...output.summary,
        generatedAt: output.summary.generatedAt.toISOString(),
      },
    };

    // Flatten categoryAnalysis Map to object
    if (this.options.flattenMaps) {
      const categoryAnalysis: Record<string, unknown> = {};
      for (const [category, analysis] of Array.from(output.categoryAnalysis.entries())) {
        categoryAnalysis[category] = this.formatCategoryAnalysis(analysis);
      }
      result.categoryAnalysis = categoryAnalysis;
    }

    // Add metadata if requested
    if (this.options.includeMetadata) {
      result.metadata = {
        version: '1.0.0',
        generator: 'qe-product-factors-assessor',
        framework: 'HTSM v6.3 (SFDIPOT)',
        generatedAt: new Date().toISOString(),
      };
    }

    return result;
  }

  /**
   * Format category analysis for JSON
   */
  private formatCategoryAnalysis(analysis: CategoryAnalysis): Record<string, unknown> {
    return {
      category: analysis.category,
      testIdeas: analysis.testIdeas.map(ti => ({
        id: ti.id,
        category: ti.category,
        subcategory: ti.subcategory,
        description: ti.description,
        priority: ti.priority,
        automationFitness: ti.automationFitness,
        tags: ti.tags,
        rationale: ti.rationale,
        sourceRequirement: ti.sourceRequirement,
      })),
      clarifyingQuestions: analysis.clarifyingQuestions.map(q => ({
        category: q.category,
        subcategory: q.subcategory,
        question: q.question,
        rationale: q.rationale,
        source: q.source,
      })),
      coverage: {
        subcategoriesCovered: analysis.coverage.subcategoriesCovered,
        subcategoriesMissing: analysis.coverage.subcategoriesMissing,
        coveragePercentage: analysis.coverage.coveragePercentage,
      },
    };
  }

  /**
   * Format test ideas only (for export)
   */
  formatTestIdeasOnly(output: AssessmentOutput): string {
    const testIdeas = output.testIdeas.map(ti => ({
      id: ti.id,
      category: ti.category,
      subcategory: ti.subcategory,
      description: ti.description,
      priority: ti.priority,
      automationFitness: ti.automationFitness,
      tags: ti.tags,
    }));

    return this.options.pretty
      ? JSON.stringify(testIdeas, null, 2)
      : JSON.stringify(testIdeas);
  }

  /**
   * Format summary only (for dashboards)
   */
  formatSummaryOnly(output: AssessmentOutput): string {
    const summary = {
      name: output.name,
      totalTestIdeas: output.summary.totalTestIdeas,
      totalClarifyingQuestions: output.summary.totalClarifyingQuestions,
      overallCoverageScore: output.summary.overallCoverageScore,
      byCategory: output.summary.byCategory,
      byPriority: output.summary.byPriority,
      byAutomationFitness: output.summary.byAutomationFitness,
      generatedAt: output.summary.generatedAt.toISOString(),
    };

    return this.options.pretty
      ? JSON.stringify(summary, null, 2)
      : JSON.stringify(summary);
  }
}
