/**
 * Quality Criteria Service
 * HTSM v6.3 Quality Criteria analysis for shift-left quality engineering
 *
 * Part of the QCSD (Quality Conscious Software Delivery) framework.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type {
  QualityCriteriaServiceConfig,
  QualityCriteriaInput,
  QualityCriteriaOutput,
  QualityCriteriaAnalysis,
  HTSMCategory,
  EvidencePoint,
  AgentInvocation,
} from './types.js';
import { HTSM_CATEGORIES, NEVER_OMIT_CATEGORIES } from './types.js';

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Quality Criteria Service Interface
 *
 * This service returns agentInvocation for semantic HTSM analysis.
 * Claude Code MUST spawn the qe-quality-criteria-recommender agent to get real analysis.
 *
 * Methods:
 * - analyze(): Returns agentInvocation - Claude Code must spawn agent for real analysis
 * - validateEvidence(): Programmatic validation of evidence points
 * - generateHTML(): Format a completed analysis as HTML
 * - generateMarkdown(): Format a completed analysis as Markdown
 */
export interface IQualityCriteriaService {
  analyze(input: QualityCriteriaInput): QualityCriteriaOutput;
  validateEvidence(evidence: EvidencePoint[]): { valid: boolean; errors: string[] };
  generateHTML(analysis: QualityCriteriaAnalysis): string;
  generateMarkdown(analysis: QualityCriteriaAnalysis): string;
}

// ============================================================================
// Quality Criteria Service
// ============================================================================

export class QualityCriteriaService implements IQualityCriteriaService {
  private config: Required<QualityCriteriaServiceConfig>;
  private templateCache: string | null = null;

  constructor(config: QualityCriteriaServiceConfig = {}) {
    this.config = {
      enableSemanticAnalysis: config.enableSemanticAnalysis ?? true,
      defaultOutputFormat: config.defaultOutputFormat ?? 'html',
      templatePath: config.templatePath ?? this.findTemplatePath(),
      minimumCategories: config.minimumCategories ?? 8,
    };
  }

  /**
   * Find the template path in standard locations
   */
  private findTemplatePath(): string {
    const possiblePaths = [
      // Relative to v3 package
      join(process.cwd(), '.claude/helpers/v3/quality-criteria/quality-criteria-reference-template.html'),
      // In node_modules
      join(process.cwd(), 'node_modules/agentic-qe/assets/agents/v3/helpers/quality-criteria/quality-criteria-reference-template.html'),
      // Development path
      join(__dirname, '../../../../../assets/agents/v3/helpers/quality-criteria/quality-criteria-reference-template.html'),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return possiblePaths[0]; // Return first path even if not found
  }

  /**
   * Analyze requirements for quality criteria.
   *
   * IMPORTANT: This method returns an agentInvocation, NOT the analysis itself.
   * Claude Code MUST spawn the qe-quality-criteria-recommender agent with the provided
   * prompt to get real semantic HTSM analysis.
   *
   * This is the ONLY way to get real analysis - no shortcuts, no fallbacks.
   */
  analyze(input: QualityCriteriaInput): QualityCriteriaOutput {
    // Load epic content
    let epicContent = input.epicContent || '';
    if (input.epicPath && existsSync(input.epicPath)) {
      epicContent = readFileSync(input.epicPath, 'utf-8');
    }

    if (!epicContent && !input.epicPath) {
      throw new Error('Either epicPath or epicContent is required for analysis');
    }

    // Build the agent prompt
    const agentPrompt = this.buildAgentPrompt({
      assessmentName: input.assessmentName,
      epicContent,
      epicPath: input.epicPath,
      sourcePaths: input.sourcePaths,
      outputFormat: input.outputFormat,
      outputPath: input.outputPath,
    });

    const agentInvocation: AgentInvocation = {
      required: true,
      agentType: 'qe-quality-criteria-recommender',
      prompt: agentPrompt,
      timeout: 300000, // 5 minutes for thorough analysis
      expectedOutput: 'QualityCriteriaAnalysis',
      instructions:
        'Claude Code MUST spawn the qe-quality-criteria-recommender agent with this prompt. ' +
        'The agent will perform real semantic HTSM analysis using Claude\'s reasoning capabilities. ' +
        'Use: Task("HTSM Quality Criteria Analysis", { prompt: <this prompt> }, "qe-quality-criteria-recommender")',
    };

    return {
      agentInvocation,
      message:
        'AGENT INVOCATION REQUIRED: This service cannot perform semantic HTSM analysis alone. ' +
        'Claude Code must spawn the qe-quality-criteria-recommender agent with the provided prompt.',
    };
  }

  /**
   * Build the complete prompt for the qe-quality-criteria-recommender agent
   */
  private buildAgentPrompt(input: {
    assessmentName: string;
    epicContent: string;
    epicPath?: string;
    sourcePaths?: string[];
    outputFormat?: string;
    outputPath?: string;
  }): string {
    const { assessmentName, epicContent, epicPath, sourcePaths, outputFormat, outputPath } = input;

    const sourcePathsSection = sourcePaths && sourcePaths.length > 0
      ? `\n## Source Paths to Analyze\n${sourcePaths.map(p => `- ${p}`).join('\n')}\n`
      : '';

    const outputSection = outputPath
      ? `\n## Output\n- Format: ${outputFormat || 'html'}\n- Save to: ${outputPath}\n`
      : `\n## Output\n- Format: ${outputFormat || 'html'}\n`;

    return `# Quality Criteria Analysis Request

## Assessment Name
${assessmentName}

## Epic/Requirements Content
${epicPath ? `Source: ${epicPath}\n\n` : ''}\`\`\`
${epicContent}
\`\`\`
${sourcePathsSection}
## Analysis Requirements

Perform HTSM v6.3 Quality Criteria analysis on the above requirements.

### HTSM Categories to Analyze
${HTSM_CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

### Categories That CANNOT Be Omitted
${NEVER_OMIT_CATEGORIES.map(cat => `- ${cat}`).join('\n')}

### Evidence Classification
For each finding, classify evidence as:
- **Direct**: Actual quotes from code/documentation with file:line references
- **Inferred**: Logical deductions from architecture/patterns (explain reasoning chain)
- **Claimed**: Requires verification (must state "requires verification", no speculation)

### Priority Assignment
- **P0 (Critical)**: Failure causes immediate business/user harm
- **P1 (High)**: Critical to core user value proposition
- **P2 (Medium)**: Affects satisfaction but not blocking
- **P3 (Low)**: Nice-to-have improvements

### Required Output Structure

Return a complete QualityCriteriaAnalysis object with:
1. coverageMetric: "X of 10 HTSM Categories" (actual count)
2. categoriesAnalyzed: Array of analyzed categories
3. categoriesOmitted: Array of { category, reason } for any omitted (with valid reasons)
4. recommendations: Array of recommendations by category with:
   - priority (P0-P3)
   - evidencePoints (with file:line references where possible)
   - testFocusAreas
   - automationFitness (high/medium/low)
   - whyItMatters (business context)
   - businessImpact (quantified where possible)
5. crossCuttingConcerns: Issues affecting multiple categories
6. piPlanningGuidance: Sprint-level guidance
7. executiveSummary: 2-3 sentence summary for stakeholders

### Critical Rules
1. NO keyword matching - use semantic understanding
2. NO speculation - if unsure, mark as "Claimed" requiring verification
3. NO fake confidence percentages - use evidence classification instead
4. ALWAYS explain WHY something matters, not just WHAT it is
5. QUANTIFY business impact where possible (e.g., "affects 80% of users")
${outputSection}
## Begin Analysis

Analyze the requirements above and return the complete QualityCriteriaAnalysis.`;
  }

  /**
   * Validate evidence points
   *
   * This is a programmatic validation that checks:
   * - Source reference format (file:line)
   * - Evidence type validity (Direct, Inferred, Claimed)
   * - Claimed evidence rules (must state "requires verification", no speculation)
   * - Reasoning quality (minimum length, explains WHY)
   */
  validateEvidence(evidence: EvidencePoint[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const point of evidence) {
      // Check source reference format
      if (!this.isValidSourceReference(point.sourceReference)) {
        errors.push(`Invalid source reference format: ${point.sourceReference}. Expected file:line format.`);
      }

      // Check evidence type
      if (!['Direct', 'Inferred', 'Claimed'].includes(point.type)) {
        errors.push(`Invalid evidence type: ${point.type}. Must be Direct, Inferred, or Claimed.`);
      }

      // Check Claimed evidence rules
      if (point.type === 'Claimed') {
        if (!point.reasoning.includes('requires verification') &&
            !point.reasoning.includes('needs inspection') &&
            !point.reasoning.includes('needs code inspection')) {
          errors.push(`Claimed evidence must state "requires verification": ${point.sourceReference}`);
        }
        if (point.reasoning.includes('could') || point.reasoning.includes('might')) {
          errors.push(`Claimed evidence must not speculate (no "could" or "might"): ${point.sourceReference}`);
        }
      }

      // Check reasoning quality (not just describing what, but why)
      if (point.reasoning.length < 20) {
        errors.push(`Reasoning too short for ${point.sourceReference}. Explain WHY it matters.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if source reference is in valid file:line format
   */
  private isValidSourceReference(ref: string): boolean {
    // Valid formats:
    // - file.ts:123-456
    // - src/path/file.ts:123-456
    // - N/A (verified via Glob/Grep search)
    // - Project search

    if (ref === 'N/A (verified via Glob/Grep search)' || ref === 'Project search') {
      return true;
    }

    // Check for file:line format
    const fileLinePattern = /^[\w\-./]+\.(ts|js|tsx|jsx|md|json|html|css|yaml|yml):\d+-\d+$/;
    const fileOnlyPattern = /^[\w\-./]+\.(ts|js|tsx|jsx|md|json|html|css|yaml|yml)(\s*\(\d+\s*LOC\))?$/;

    return fileLinePattern.test(ref) || fileOnlyPattern.test(ref);
  }

  /**
   * Extract component name from content
   */
  private extractComponent(content: string): string | undefined {
    // Try to extract from frontmatter or first heading
    const componentMatch = content.match(/component:\s*["']?([^"'\n]+)["']?/i);
    if (componentMatch) return componentMatch[1].trim();

    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) return headingMatch[1].trim();

    return undefined;
  }

  /**
   * Generate HTML output
   */
  generateHTML(analysis: QualityCriteriaAnalysis): string {
    // Load template
    if (!this.templateCache && existsSync(this.config.templatePath)) {
      this.templateCache = readFileSync(this.config.templatePath, 'utf-8');
    }

    if (!this.templateCache) {
      return this.generateFallbackHTML(analysis);
    }

    // Replace placeholders in template
    let html = this.templateCache;

    html = html.replace(/\{EPIC_TITLE\}/g, analysis.epic);
    html = html.replace(/\{COMPONENT_NAME\}/g, analysis.component || 'N/A');
    html = html.replace(/\{DATE\}/g, analysis.timestamp.toISOString().split('T')[0]);
    html = html.replace(/\{COVERAGE_METRIC\}/g, analysis.coverageMetric);

    return html;
  }

  /**
   * Generate fallback HTML when template not available
   */
  private generateFallbackHTML(analysis: QualityCriteriaAnalysis): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quality Criteria Recommendations - ${analysis.epic}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 2rem; border-radius: 16px; }
    .section { background: white; padding: 1.5rem; margin: 1rem 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="header">
    <h1>Quality Criteria Recommendations</h1>
    <p>${analysis.epic}</p>
    <p>${analysis.coverageMetric} | ${analysis.timestamp.toISOString().split('T')[0]}</p>
  </div>
  <div class="section">
    <h2>Executive Summary</h2>
    <p>${analysis.executiveSummary || 'Analysis pending. Run qe-quality-criteria-recommender agent for full semantic analysis.'}</p>
  </div>
  <div class="section">
    <h2>Categories Analyzed</h2>
    <ul>
      ${analysis.categoriesAnalyzed.map(c => `<li>${c}</li>`).join('\n      ')}
    </ul>
  </div>
  <footer style="text-align: center; margin-top: 2rem; color: #666;">
    <p>Generated by Agentic QE — qe-quality-criteria-recommender</p>
    <p>Analysis Method: AI Semantic Understanding | Framework: James Bach's HTSM v6.3</p>
  </footer>
</body>
</html>`;
  }

  /**
   * Generate Markdown output
   */
  generateMarkdown(analysis: QualityCriteriaAnalysis): string {
    const lines: string[] = [
      `# Quality Criteria Recommendations`,
      ``,
      `**Epic:** ${analysis.epic}`,
      `**Component:** ${analysis.component || 'N/A'}`,
      `**Date:** ${analysis.timestamp.toISOString().split('T')[0]}`,
      `**Coverage:** ${analysis.coverageMetric}`,
      ``,
      `## Executive Summary`,
      ``,
      analysis.executiveSummary || '_Analysis pending. Run qe-quality-criteria-recommender agent for full semantic analysis._',
      ``,
      `## Categories Analyzed`,
      ``,
      ...analysis.categoriesAnalyzed.map(c => `- ${c}`),
      ``,
    ];

    if (analysis.categoriesOmitted.length > 0) {
      lines.push(`## Categories Omitted`);
      lines.push(``);
      for (const omit of analysis.categoriesOmitted) {
        lines.push(`- **${omit.category}**: ${omit.reason}`);
      }
      lines.push(``);
    }

    if (analysis.recommendations.length > 0) {
      lines.push(`## Recommendations`);
      lines.push(``);
      for (const rec of analysis.recommendations) {
        lines.push(`### ${rec.category} (${rec.priority})`);
        lines.push(``);
        lines.push(`**Why It Matters:** ${rec.whyItMatters}`);
        lines.push(``);
        lines.push(`**Business Impact:** ${rec.businessImpact}`);
        lines.push(``);
        lines.push(`**Test Focus Areas:**`);
        for (const area of rec.testFocusAreas) {
          lines.push(`- ${area}`);
        }
        lines.push(``);
      }
    }

    lines.push(`---`);
    lines.push(``);
    lines.push(`*Generated by Agentic QE — qe-quality-criteria-recommender*`);
    lines.push(`*Analysis Method: AI Semantic Understanding | Framework: James Bach's HTSM v6.3*`);

    return lines.join('\n');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createQualityCriteriaService(
  config?: QualityCriteriaServiceConfig
): QualityCriteriaService {
  return new QualityCriteriaService(config);
}
