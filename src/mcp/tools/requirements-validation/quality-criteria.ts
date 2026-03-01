/**
 * Agentic QE v3 - Quality Criteria MCP Tool
 *
 * qe/requirements/quality-criteria - HTSM-based quality criteria analysis
 *
 * This tool provides REAL semantic analysis via the qe-quality-criteria-recommender agent.
 * NO fallbacks, NO scaffolds - real analysis or nothing.
 *
 * Actions:
 * - analyze: Returns agentInvocation for real HTSM analysis (DEFAULT)
 * - validate-evidence: Validates evidence points (programmatic, no agent needed)
 * - format: Formats a completed analysis into HTML/JSON/Markdown (programmatic)
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';
import {
  QualityCriteriaService,
  createQualityCriteriaService,
  type QualityCriteriaInput,
  type QualityCriteriaAnalysis,
  type HTSMCategory,
  type EvidencePoint,
  type Priority,
  HTSM_CATEGORIES,
  NEVER_OMIT_CATEGORIES,
} from '../../../domains/requirements-validation/index.js';
import { existsSync, readFileSync } from 'fs';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface QualityCriteriaParams {
  /** Assessment name (e.g., Epic title) */
  assessmentName: string;
  /** Path to epic/requirements document */
  epicPath?: string;
  /** Epic content (if not using path) */
  epicContent?: string;
  /** Source paths to analyze for evidence */
  sourcePaths?: string[];
  /** Output format */
  outputFormat?: 'html' | 'json' | 'markdown';
  /** Output path (if saving to file) */
  outputPath?: string;
  /** Evidence points to validate (for validate-evidence action) */
  evidencePoints?: EvidencePointInput[];
  /** Completed analysis (for format action) */
  completedAnalysis?: QualityCriteriaAnalysis;
  /** Action: analyze (default), validate-evidence, or format */
  action?: 'analyze' | 'validate-evidence' | 'format';
  [key: string]: unknown;
}

export interface EvidencePointInput {
  sourceReference: string;
  type: 'Direct' | 'Inferred' | 'Claimed';
  qualityImplication: string;
  reasoning: string;
}

/**
 * Agent invocation - tells Claude Code to spawn an agent
 * This is NOT optional when action is 'analyze'
 */
export interface AgentInvocation {
  /** Always true - agent invocation is required */
  required: true;
  /** Agent type to spawn */
  agentType: 'qe-quality-criteria-recommender';
  /** Complete prompt for the agent */
  prompt: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Expected output format */
  expectedOutput: 'QualityCriteriaAnalysis';
  /** Instructions for the caller */
  instructions: string;
}

export interface QualityCriteriaResult {
  /** Agent invocation (for analyze action) - Claude Code MUST spawn this agent */
  agentInvocation?: AgentInvocation;
  /** Formatted output (for format action) */
  html?: string;
  json?: string;
  markdown?: string;
  outputFilePath?: string;
  /** Evidence validation results (for validate-evidence action) */
  evidenceValidation?: {
    valid: boolean;
    errors: string[];
  };
  /** Message explaining the result */
  message: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class QualityCriteriaTool extends MCPToolBase<QualityCriteriaParams, QualityCriteriaResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/requirements/quality-criteria',
    description:
      'HTSM v6.3 Quality Criteria analysis tool. ' +
      'For "analyze" action: Returns an agentInvocation that MUST be executed to get real semantic analysis. ' +
      'For "validate-evidence": Validates evidence points programmatically. ' +
      'For "format": Formats a completed analysis into HTML/JSON/Markdown.',
    domain: 'requirements-validation',
    schema: QUALITY_CRITERIA_SCHEMA,
    streaming: true,
    timeout: 120000,
  };

  private service: QualityCriteriaService | null = null;

  private getService(): QualityCriteriaService {
    if (!this.service) {
      this.service = createQualityCriteriaService();
    }
    return this.service;
  }

  async execute(
    params: QualityCriteriaParams,
    context: MCPToolContext
  ): Promise<ToolResult<QualityCriteriaResult>> {
    const {
      assessmentName,
      epicPath,
      epicContent,
      sourcePaths,
      outputFormat = 'html',
      outputPath,
      evidencePoints,
      completedAnalysis,
      action = 'analyze',
    } = params;

    try {
      const service = this.getService();

      this.emitStream(context, {
        status: 'starting',
        message: `Quality Criteria: ${action} - ${assessmentName}`,
        action,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // ========================================================================
      // ACTION: validate-evidence (programmatic, no agent needed)
      // ========================================================================
      if (action === 'validate-evidence') {
        if (!evidencePoints || evidencePoints.length === 0) {
          return {
            success: false,
            error: 'validate-evidence action requires evidencePoints array',
          };
        }

        this.emitStream(context, {
          status: 'validating',
          message: `Validating ${evidencePoints.length} evidence points`,
        });

        const validation = service.validateEvidence(evidencePoints as EvidencePoint[]);

        return {
          success: true,
          data: {
            evidenceValidation: validation,
            message: validation.valid
              ? `All ${evidencePoints.length} evidence points are valid`
              : `Validation failed with ${validation.errors.length} errors`,
          },
        };
      }

      // ========================================================================
      // ACTION: format (programmatic, no agent needed)
      // ========================================================================
      if (action === 'format') {
        if (!completedAnalysis) {
          return {
            success: false,
            error: 'format action requires completedAnalysis object',
          };
        }

        this.emitStream(context, {
          status: 'formatting',
          message: `Formatting analysis as ${outputFormat}`,
        });

        let html: string | undefined;
        let json: string | undefined;
        let markdown: string | undefined;

        switch (outputFormat) {
          case 'html':
            html = service.generateHTML(completedAnalysis);
            break;
          case 'json':
            json = JSON.stringify(completedAnalysis, null, 2);
            break;
          case 'markdown':
            markdown = service.generateMarkdown(completedAnalysis);
            break;
        }

        return {
          success: true,
          data: {
            html,
            json,
            markdown,
            message: `Analysis formatted as ${outputFormat}`,
          },
        };
      }

      // ========================================================================
      // ACTION: analyze (requires agent invocation)
      // ========================================================================
      this.emitStream(context, {
        status: 'preparing',
        message: 'Preparing agent invocation for semantic HTSM analysis',
      });

      // Load epic content
      let content = epicContent || '';
      if (epicPath && existsSync(epicPath)) {
        content = readFileSync(epicPath, 'utf-8');
      }

      if (!content && !epicPath) {
        return {
          success: false,
          error: 'Either epicPath or epicContent is required for analysis',
        };
      }

      // Build the agent prompt
      const agentPrompt = this.buildAgentPrompt({
        assessmentName,
        epicContent: content,
        epicPath,
        sourcePaths,
        outputFormat,
        outputPath,
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

      this.emitStream(context, {
        status: 'agent-required',
        message: 'Agent invocation prepared. Claude Code must spawn qe-quality-criteria-recommender agent.',
        agentType: 'qe-quality-criteria-recommender',
      });

      return {
        success: true,
        data: {
          agentInvocation,
          message:
            'AGENT INVOCATION REQUIRED: This tool cannot perform semantic HTSM analysis alone. ' +
            'Claude Code must spawn the qe-quality-criteria-recommender agent with the provided prompt.',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Quality Criteria tool failed: ${toErrorMessage(error)}`,
      };
    }
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
${epicPath ? `Source: ${epicPath}\n\n` : ''}
\`\`\`
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
   * Reset service cache
   */
  resetInstanceCache(): void {
    this.service = null;
  }
}

// ============================================================================
// Schema
// ============================================================================

const QUALITY_CRITERIA_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    assessmentName: {
      type: 'string',
      description: 'Assessment name (e.g., Epic title or feature name)',
    },
    epicPath: {
      type: 'string',
      description: 'Path to epic/requirements document',
    },
    epicContent: {
      type: 'string',
      description: 'Epic content as string (alternative to epicPath)',
    },
    sourcePaths: {
      type: 'array',
      description: 'Source code paths to analyze for evidence',
      items: { type: 'string', description: 'Source path glob pattern' },
    },
    outputFormat: {
      type: 'string',
      description: 'Output format for the report',
      enum: ['html', 'json', 'markdown'],
      default: 'html',
    },
    outputPath: {
      type: 'string',
      description: 'Path to save the output report',
    },
    evidencePoints: {
      type: 'array',
      description: 'Evidence points to validate (for validate-evidence action)',
      items: {
        type: 'object',
        description: 'Evidence point object',
        properties: {
          sourceReference: { type: 'string', description: 'Source reference in file:line format' },
          type: { type: 'string', enum: ['Direct', 'Inferred', 'Claimed'], description: 'Evidence type' },
          qualityImplication: { type: 'string', description: 'Quality implication of this evidence' },
          reasoning: { type: 'string', description: 'Reasoning explaining WHY it matters' },
        },
        required: ['sourceReference', 'type', 'qualityImplication', 'reasoning'],
      },
    },
    completedAnalysis: {
      type: 'object',
      description: 'Completed QualityCriteriaAnalysis object (for format action)',
    },
    action: {
      type: 'string',
      description:
        'Action to perform. "analyze" (default) returns agentInvocation for real analysis. ' +
        '"validate-evidence" validates evidence format. "format" formats completed analysis.',
      enum: ['analyze', 'validate-evidence', 'format'],
      default: 'analyze',
    },
  },
  required: ['assessmentName'],
};

// ============================================================================
// Export singleton instance
// ============================================================================

export const qualityCriteriaTool = new QualityCriteriaTool();
