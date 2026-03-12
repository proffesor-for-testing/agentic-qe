/**
 * YAML Pipeline MCP Handlers (Imp-9)
 *
 * Exposes YAML deterministic pipelines through MCP tools:
 * - pipeline_load: Load a pipeline from a YAML string
 * - pipeline_run: Execute a loaded pipeline
 * - pipeline_list: List all registered pipelines (built-in + YAML)
 * - pipeline_validate: Validate YAML without registering
 */

import { getFleetState, isFleetInitialized } from './core-handlers.js';
import type { ToolResult } from '../types.js';
import { YamlPipelineLoader } from '../../coordination/yaml-pipeline-loader.js';
import { YamlPipelineRegistry } from '../../coordination/yaml-pipeline-registry.js';
import type { WorkflowListItem } from '../../coordination/workflow-types.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface PipelineLoadParams {
  yaml: string;
  variables?: Record<string, unknown>;
}

export interface PipelineLoadResult {
  pipelineId: string;
  name: string;
  description: string;
  version: string;
  stepCount: number;
  tags?: string[];
}

export interface PipelineRunParams {
  pipelineId: string;
  input?: Record<string, unknown>;
}

export interface PipelineRunResult {
  executionId: string;
  pipelineId: string;
  status: string;
}

export type PipelineListParams = Record<string, never>;

export interface PipelineListResult {
  pipelines: WorkflowListItem[];
  total: number;
}

export interface PipelineValidateParams {
  yaml: string;
  variables?: Record<string, unknown>;
}

export interface PipelineValidateResult {
  valid: boolean;
  pipelineId?: string;
  name?: string;
  stepCount?: number;
  errors?: string[];
}

// ============================================================================
// Shared State
// ============================================================================

const loader = new YamlPipelineLoader();
const registry = new YamlPipelineRegistry(loader);

/**
 * Get the shared registry instance (for use by initialization code).
 */
export function getPipelineRegistry(): YamlPipelineRegistry {
  return registry;
}

/**
 * Get the shared loader instance (for use by validation-only operations).
 */
export function getPipelineLoader(): YamlPipelineLoader {
  return loader;
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Load and register a pipeline from a YAML string.
 */
export async function handlePipelineLoad(
  params: PipelineLoadParams,
): Promise<ToolResult<PipelineLoadResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { workflowOrchestrator } = getFleetState();
  if (!workflowOrchestrator) {
    return {
      success: false,
      error: 'Workflow orchestrator not available.',
    };
  }

  if (!params.yaml || typeof params.yaml !== 'string') {
    return {
      success: false,
      error: "Parameter 'yaml' is required and must be a string.",
    };
  }

  try {
    const result = registry.registerPipeline(
      workflowOrchestrator,
      params.yaml,
      params.variables,
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    const def = result.value;
    return {
      success: true,
      data: {
        pipelineId: def.id,
        name: def.name,
        description: def.description,
        version: def.version,
        stepCount: def.steps.length,
        tags: def.tags,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to load pipeline: ${toErrorMessage(error)}`,
    };
  }
}

/**
 * Execute a previously loaded/registered pipeline.
 */
export async function handlePipelineRun(
  params: PipelineRunParams,
): Promise<ToolResult<PipelineRunResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { workflowOrchestrator } = getFleetState();
  if (!workflowOrchestrator) {
    return {
      success: false,
      error: 'Workflow orchestrator not available.',
    };
  }

  if (!params.pipelineId || typeof params.pipelineId !== 'string') {
    return {
      success: false,
      error: "Parameter 'pipelineId' is required and must be a string.",
    };
  }

  try {
    const result = await workflowOrchestrator.executeWorkflow(
      params.pipelineId,
      params.input ?? {},
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    return {
      success: true,
      data: {
        executionId: result.value,
        pipelineId: params.pipelineId,
        status: 'running',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to run pipeline: ${toErrorMessage(error)}`,
    };
  }
}

/**
 * List all registered pipelines (built-in + YAML).
 */
export async function handlePipelineList(
  _params: PipelineListParams,
): Promise<ToolResult<PipelineListResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  const { workflowOrchestrator } = getFleetState();
  if (!workflowOrchestrator) {
    return {
      success: false,
      error: 'Workflow orchestrator not available.',
    };
  }

  try {
    const pipelines = workflowOrchestrator.listWorkflows();
    return {
      success: true,
      data: {
        pipelines,
        total: pipelines.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list pipelines: ${toErrorMessage(error)}`,
    };
  }
}

/**
 * Validate a YAML pipeline without registering it.
 */
export async function handlePipelineValidate(
  params: PipelineValidateParams,
): Promise<ToolResult<PipelineValidateResult>> {
  if (!params.yaml || typeof params.yaml !== 'string') {
    return {
      success: false,
      error: "Parameter 'yaml' is required and must be a string.",
    };
  }

  try {
    const result = loader.parse(params.yaml, params.variables);

    if (!result.success) {
      return {
        success: true,
        data: {
          valid: false,
          errors: [result.error.message],
        },
      };
    }

    const def = result.value;
    return {
      success: true,
      data: {
        valid: true,
        pipelineId: def.id,
        name: def.name,
        stepCount: def.steps.length,
      },
    };
  } catch (error) {
    return {
      success: true,
      data: {
        valid: false,
        errors: [toErrorMessage(error)],
      },
    };
  }
}
