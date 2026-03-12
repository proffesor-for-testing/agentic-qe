/**
 * Validation Pipeline MCP Handler (BMAD-003)
 *
 * Exposes the structured 13-step requirements validation pipeline
 * as an MCP tool that users can invoke directly.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { ToolResult } from '../types.js';
import { runPipeline, formatPipelineReport } from '../../validation/pipeline.js';
import { createRequirementsPipeline, REQUIREMENTS_VALIDATION_STEPS } from '../../validation/steps/requirements.js';
import { toErrorMessage } from '../../shared/error-utils.js';

export interface ValidationPipelineParams {
  /** Path to the document to validate */
  filePath?: string;
  /** Inline content to validate (alternative to filePath) */
  content?: string;
  /** Pipeline type (default: requirements) */
  pipeline?: string;
  /** Specific step IDs to run (default: all) */
  steps?: string[];
  /** Continue past blocking failures (default: false) */
  continueOnFailure?: boolean;
  /** Output format: 'markdown' or 'json' (default: 'json') */
  format?: string;
}

export interface ValidationPipelineResult {
  pipelineId: string;
  pipelineName: string;
  overall: string;
  score: number;
  stepsExecuted: number;
  findingsCount: number;
  halted: boolean;
  haltedAt?: string;
  totalDuration: number;
  report?: string;
  steps: Array<{
    stepId: string;
    stepName: string;
    status: string;
    score: number;
    findingsCount: number;
    duration: number;
  }>;
  findings: Array<{
    id: string;
    stepId: string;
    severity: string;
    title: string;
    description: string;
  }>;
}

/**
 * Run the structured validation pipeline on a document.
 */
export async function handleValidationPipeline(
  params: ValidationPipelineParams,
): Promise<ToolResult<ValidationPipelineResult>> {
  // Get content from file or inline
  let content: string;

  if (params.content) {
    content = params.content;
  } else if (params.filePath) {
    const absPath = resolve(process.cwd(), params.filePath);
    if (!existsSync(absPath)) {
      return {
        success: false,
        error: `File not found: ${params.filePath}`,
      };
    }
    try {
      content = readFileSync(absPath, 'utf-8');
    } catch (readErr) {
      return {
        success: false,
        error: `Failed to read file: ${toErrorMessage(readErr)}`,
      };
    }
  } else {
    return {
      success: false,
      error: "Either 'filePath' or 'content' parameter is required.",
    };
  }

  if (!content.trim()) {
    content = '(empty document)';
  }

  try {
    // Create pipeline config based on type
    const pipelineType = params.pipeline || 'requirements';

    if (pipelineType !== 'requirements') {
      return {
        success: false,
        error: `Unknown pipeline type: ${pipelineType}. Available: requirements`,
      };
    }

    // Build config with options
    const config = createRequirementsPipeline({
      continueOnFailure: params.continueOnFailure || false,
      stepFilter: params.steps,
    });

    // Validate step filter if provided
    if (params.steps && params.steps.length > 0) {
      const availableIds = REQUIREMENTS_VALIDATION_STEPS.map(s => s.id);
      const filteredSteps = config.steps.filter(s => params.steps!.includes(s.id));
      if (filteredSteps.length === 0) {
        return {
          success: false,
          error: `No matching steps found. Available: ${availableIds.join(', ')}`,
        };
      }
    }

    // Run pipeline: runPipeline(config, content, filePath?, metadata?)
    const result = await runPipeline(
      config,
      content,
      params.filePath,
      { source: 'mcp-tool' },
    );

    // Build report if markdown requested
    let report: string | undefined;
    if (params.format === 'markdown' || !params.format) {
      report = formatPipelineReport(result);
    }

    return {
      success: true,
      data: {
        pipelineId: result.pipelineId,
        pipelineName: result.pipelineName,
        overall: result.overall,
        score: result.score,
        stepsExecuted: result.steps.length,
        findingsCount: result.steps.reduce((sum, s) => sum + s.findings.length, 0),
        halted: result.halted,
        haltedAt: result.haltedAt,
        totalDuration: result.totalDuration,
        report,
        steps: result.steps.map(s => ({
          stepId: s.stepId,
          stepName: s.stepName,
          status: s.status,
          score: s.score,
          findingsCount: s.findings.length,
          duration: s.duration,
        })),
        findings: result.steps.flatMap(s =>
          s.findings.map(f => ({
            id: f.id,
            stepId: f.stepId,
            severity: f.severity,
            title: f.title,
            description: f.description,
          }))
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Pipeline execution failed: ${toErrorMessage(error)}`,
    };
  }
}
