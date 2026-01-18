/**
 * Markdown Formatter for Product Factors Assessor
 *
 * Generates Markdown output for documentation and sharing
 * of SFDIPOT assessment results.
 */

import {
  AssessmentOutput,
  HTSMCategory,
  CategoryAnalysis,
  TestIdea,
  ClarifyingQuestion,
  Priority,
  CATEGORY_DESCRIPTIONS,
  PRIORITY_METADATA,
  AUTOMATION_FITNESS_METADATA,
} from '../types';

export interface MarkdownFormatterOptions {
  includeTableOfContents?: boolean;
  includeRationale?: boolean;
  priorityEmojis?: boolean;
}

/**
 * Markdown Formatter
 *
 * Produces GitHub-flavored Markdown suitable for:
 * - README files
 * - Wiki pages
 * - Documentation sites
 * - Issue/PR descriptions
 */
export class MarkdownFormatter {
  private options: MarkdownFormatterOptions;

  constructor(options: MarkdownFormatterOptions = {}) {
    this.options = {
      includeTableOfContents: options.includeTableOfContents ?? true,
      includeRationale: options.includeRationale ?? true,
      priorityEmojis: options.priorityEmojis ?? true,
    };
  }

  /**
   * Format assessment output as Markdown
   */
  format(output: AssessmentOutput): string {
    const sections: string[] = [];

    // Header
    sections.push(this.formatHeader(output));

    // QCSD Context Section (always included)
    sections.push(this.formatQCSDContext());

    // Table of Contents
    if (this.options.includeTableOfContents) {
      sections.push(this.formatTableOfContents(output));
    }

    // Summary
    sections.push(this.formatSummary(output));

    // Category Sections
    for (const [category, analysis] of Array.from(output.categoryAnalysis.entries())) {
      sections.push(this.formatCategorySection(category, analysis));
    }

    // Clarifying Questions
    if (output.clarifyingQuestions.length > 0) {
      sections.push(this.formatQuestionsSection(output.clarifyingQuestions));
    }

    // Full Test Ideas Table
    sections.push(this.formatTestIdeasTable(output.testIdeas));

    // Footer
    sections.push(this.formatFooter(output));

    return sections.join('\n\n');
  }

  /**
   * Format header
   */
  private formatHeader(output: AssessmentOutput): string {
    return `# SFDIPOT Assessment Report

## ${output.name}

> Based on James Bach's Heuristic Test Strategy Model (HTSM v6.3)

**Generated:** ${output.summary.generatedAt.toISOString()}

**Source Documents:**
${output.sourceDocuments.map(d => `- ${d}`).join('\n')}`;
  }

  /**
   * Format QCSD Context Section
   * This provides the "How this report can help you?" context that should appear in every report
   */
  private formatQCSDContext(): string {
    return `---

## How can this report help you?

> *"Requirements are not an end in themselves, but a means to an end—the end of providing value to some person(s)."* — Jerry Weinberg

In the [QCSD framework](https://talesoftesting.com/wp-content/uploads/2022/10/Lalitkumar-Bhamare-Quality-Conscious-Software-Delivery-eBook.pdf), it is recommended to conduct **Product Coverage Sessions** or **Requirements Engineering Sessions** on a regular basis. These sessions can be carried out at the epic level or for complex feature requests and user stories. Testers in the team can analyze the epic or feature story using **SFDIPOT** (a product factors checklist from [Heuristic Test Strategy Model](https://www.satisfice.com/download/heuristic-test-strategy-model) by James Bach) and come up with test ideas, questions about risks, missing information, unconsidered dependencies, identified risks, and more.

A guided discussion based on this analysis can help teams:
- Uncover hidden risks
- Assess the completeness of requirements
- Create a clearer development plan
- Identify gaps and dependencies
- Improve estimation with better information at hand
- **Avoid rework** caused by discovering issues halfway through development

If we want to save time and cost while still delivering quality software, **it is always cheaper to do things right the first time**. The purpose of this report is to facilitate Product Coverage Sessions and help teams achieve exactly that: doing things right the first time.

### When to generate this report?

**The sooner the better!** As soon as testers can access Epic/User Stories or any project artifact they use for test design, this report should be generated. Generate this report and organize a "Product Coverage Session" discussion with relevant stakeholders such as programmers, Product Owners, Designers, Architects, etc.

### How to use this report?

In this report you will find:

- [ ] **The Test Ideas** generated for each product factor based on applicable subcategories. Review these test ideas carefully for context relevance, applicability and then derive specific test cases where needed.
- [ ] **Automation Fitness** recommendations against each test idea that can help for drafting suitable automation strategy.
- [ ] **The Clarifying Questions** - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage. Ensure that Epics, User Stories, Acceptance Criteria etc. are readily updated based on answers derived for each clarifying question listed.

> **Note:** All in all, this report represents important and unique elements to be considered in the test strategy. **Rebuild this report if there are updates made in Epics, User Stories, Acceptance Criteria etc.**
>
> *Testers are advised to carefully evaluate all the information using critical thinking and context awareness.*

---`;
  }

  /**
   * Format table of contents
   */
  private formatTableOfContents(output: AssessmentOutput): string {
    const toc = [
      '## Table of Contents',
      '',
      '- [How can this report help you?](#how-can-this-report-help-you)',
      '- [Summary](#summary)',
    ];

    for (const category of Object.values(HTSMCategory)) {
      const anchor = category.toLowerCase();
      toc.push(`- [${category}](#${anchor})`);
    }

    toc.push('- [Clarifying Questions](#clarifying-questions)');
    toc.push('- [All Test Ideas](#all-test-ideas)');

    return toc.join('\n');
  }

  /**
   * Format summary section
   */
  private formatSummary(output: AssessmentOutput): string {
    const { summary } = output;
    const coverageEmoji = summary.overallCoverageScore >= 80 ? '🟢' :
                          summary.overallCoverageScore >= 50 ? '🟡' : '🔴';

    let md = `## Summary

| Metric | Value |
|--------|-------|
| Total Test Ideas | ${summary.totalTestIdeas} |
| Clarifying Questions | ${summary.totalClarifyingQuestions} |
| Overall Coverage | ${coverageEmoji} ${summary.overallCoverageScore}% |

### By Priority

| Priority | Count |
|----------|-------|
`;

    for (const [priority, count] of Object.entries(summary.byPriority)) {
      const emoji = this.getPriorityEmoji(priority as Priority);
      md += `| ${emoji} ${priority} | ${count} |\n`;
    }

    md += `
### By Category

| Category | Count |
|----------|-------|
`;

    for (const [category, count] of Object.entries(summary.byCategory)) {
      const emoji = this.getCategoryEmoji(category as HTSMCategory);
      md += `| ${emoji} ${category} | ${count} |\n`;
    }

    return md;
  }

  /**
   * Format category section
   */
  private formatCategorySection(category: HTSMCategory, analysis: CategoryAnalysis): string {
    const emoji = this.getCategoryEmoji(category);
    const coverageEmoji = analysis.coverage.coveragePercentage >= 80 ? '🟢' :
                          analysis.coverage.coveragePercentage >= 50 ? '🟡' : '🔴';

    let md = `## ${emoji} ${category}

> ${CATEGORY_DESCRIPTIONS[category]}

**Coverage:** ${coverageEmoji} ${analysis.coverage.coveragePercentage}%

**Covered Subcategories:** ${analysis.coverage.subcategoriesCovered.join(', ') || 'None'}

**Missing Subcategories:** ${analysis.coverage.subcategoriesMissing.join(', ') || 'None'}

### Test Ideas

`;

    if (analysis.testIdeas.length === 0) {
      md += '*No test ideas generated for this category.*\n';
    } else {
      for (const idea of analysis.testIdeas) {
        md += this.formatTestIdea(idea);
      }
    }

    if (analysis.clarifyingQuestions.length > 0) {
      md += `
### Questions

`;
      for (const q of analysis.clarifyingQuestions) {
        md += `- **${q.subcategory}:** ${q.question}\n`;
        if (this.options.includeRationale) {
          md += `  - *${q.rationale}*\n`;
        }
      }
    }

    return md;
  }

  /**
   * Format a single test idea
   */
  private formatTestIdea(idea: TestIdea): string {
    const priorityEmoji = this.getPriorityEmoji(idea.priority);
    const automationMeta = AUTOMATION_FITNESS_METADATA[idea.automationFitness];

    let md = `#### ${idea.id}

- **Subcategory:** ${idea.subcategory}
- **Priority:** ${priorityEmoji} ${idea.priority}
- **Automation:** ${automationMeta.label}
- **Description:** ${idea.description}
`;

    if (this.options.includeRationale && idea.rationale) {
      md += `- **Rationale:** *${idea.rationale}*\n`;
    }

    if (idea.tags && idea.tags.length > 0) {
      md += `- **Tags:** ${idea.tags.map(t => `\`${t}\``).join(' ')}\n`;
    }

    md += '\n';
    return md;
  }

  /**
   * Format questions section
   */
  private formatQuestionsSection(questions: ClarifyingQuestion[]): string {
    let md = `## Clarifying Questions

These questions identify gaps in the input documentation that need clarification for comprehensive test coverage.

`;

    // Group by category
    const byCategory = new Map<HTSMCategory, ClarifyingQuestion[]>();
    for (const q of questions) {
      if (!byCategory.has(q.category)) {
        byCategory.set(q.category, []);
      }
      byCategory.get(q.category)!.push(q);
    }

    for (const [category, qs] of Array.from(byCategory.entries())) {
      const emoji = this.getCategoryEmoji(category);
      md += `### ${emoji} ${category}\n\n`;

      for (const q of qs) {
        md += `- **${q.subcategory}:** ${q.question}\n`;
        if (this.options.includeRationale) {
          md += `  - *${q.rationale}*\n`;
        }
      }
      md += '\n';
    }

    return md;
  }

  /**
   * Format all test ideas as a table
   */
  private formatTestIdeasTable(testIdeas: TestIdea[]): string {
    let md = `## All Test Ideas

| ID | Category | Subcategory | Priority | Automation | Description |
|----|----------|-------------|----------|------------|-------------|
`;

    for (const idea of testIdeas) {
      const priorityEmoji = this.options.priorityEmojis ? this.getPriorityEmoji(idea.priority) + ' ' : '';
      const automationMeta = AUTOMATION_FITNESS_METADATA[idea.automationFitness];
      const desc = idea.description.length > 60
        ? idea.description.substring(0, 57) + '...'
        : idea.description;

      md += `| ${idea.id} | ${idea.category} | ${idea.subcategory} | ${priorityEmoji}${idea.priority} | ${automationMeta.label} | ${desc} |\n`;
    }

    return md;
  }

  /**
   * Format footer
   */
  private formatFooter(output: AssessmentOutput): string {
    return `---

*Generated by QE Product Factors Assessor*
*Based on James Bach's Heuristic Test Strategy Model (HTSM v6.3)*
*Assessment: ${output.name} | Generated: ${output.summary.generatedAt.toISOString()}*`;
  }

  /**
   * Get priority emoji
   */
  private getPriorityEmoji(priority: Priority): string {
    if (!this.options.priorityEmojis) return '';
    const emojiMap: Record<Priority, string> = {
      [Priority.P0]: '🔴',
      [Priority.P1]: '🟠',
      [Priority.P2]: '🟡',
      [Priority.P3]: '🟢',
    };
    return emojiMap[priority] || '';
  }

  /**
   * Get category emoji
   */
  private getCategoryEmoji(category: HTSMCategory): string {
    const emojiMap: Record<HTSMCategory, string> = {
      [HTSMCategory.STRUCTURE]: '🏗️',
      [HTSMCategory.FUNCTION]: '⚙️',
      [HTSMCategory.DATA]: '📊',
      [HTSMCategory.INTERFACES]: '🔌',
      [HTSMCategory.PLATFORM]: '💻',
      [HTSMCategory.OPERATIONS]: '👥',
      [HTSMCategory.TIME]: '⏰',
    };
    return emojiMap[category] || '📁';
  }
}
