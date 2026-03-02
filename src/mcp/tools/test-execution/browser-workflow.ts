/**
 * Browser Workflow MCP Tool
 *
 * Loads, validates, and prepares browser automation workflows from inline YAML
 * or built-in templates. Returns the resolved workflow definition with
 * interpolated variables for execution by a browser client.
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
} from '../base.js';
import { ToolResult } from '../../types.js';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface BrowserWorkflowParams {
  workflowYaml?: string;
  variables?: Record<string, string>;
  templateName?: string;
  [key: string]: unknown;
}

export interface BrowserWorkflowResult {
  workflowName: string;
  description: string;
  source: 'template' | 'inline-yaml' | 'none';
  templateUsed: string | null;
  steps: Array<{
    name: string;
    action: string;
    config: Record<string, unknown>;
    optional: boolean;
    assertionCount: number;
  }>;
  variables: {
    defined: Array<{ name: string; type: string; required: boolean; hasDefault: boolean }>;
    provided: Record<string, string>;
  };
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  availableTemplates: string[];
  summary: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class BrowserWorkflowTool extends MCPToolBase<BrowserWorkflowParams, BrowserWorkflowResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/workflows/browser-load',
    description:
      'Load, validate, and prepare browser automation workflows from inline YAML or built-in templates. ' +
      'Returns the resolved workflow with steps and variable bindings, ready for browser execution. ' +
      'Templates: login-flow, form-validation, visual-regression, oauth-flow, etc.',
    domain: 'test-execution',
    schema: this.buildSchema(),
  };

  private buildSchema(): MCPToolSchema {
    return {
      type: 'object',
      properties: {
        workflowYaml: {
          type: 'string',
          description: 'Inline YAML workflow definition. Mutually exclusive with templateName.',
        },
        templateName: {
          type: 'string',
          description: 'Built-in template name to load.',
          enum: [
            'login-flow', 'oauth-flow', 'scraping-workflow', 'visual-regression',
            'form-validation', 'navigation-flow', 'api-integration',
            'performance-audit', 'accessibility-audit',
          ],
        },
        variables: {
          type: 'object',
          description: 'Runtime variable overrides (e.g., { "baseUrl": "https://example.com" })',
        },
      },
    };
  }

  async execute(
    params: BrowserWorkflowParams,
    context: MCPToolContext
  ): Promise<ToolResult<BrowserWorkflowResult>> {
    try {
      const {
        WorkflowLoader,
        WORKFLOW_TEMPLATES,
        WORKFLOW_DESCRIPTIONS,
        interpolateVariables,
      } = await import('../../../workflows/browser/index.js');
      const { parse: parseYaml } = await import('yaml');

      const loader = new WorkflowLoader();
      const templateList = [...WORKFLOW_TEMPLATES] as string[];
      const descriptions = WORKFLOW_DESCRIPTIONS as Record<string, string>;

      // No input — list available templates
      if (!params.workflowYaml && !params.templateName) {
        return {
          success: true,
          data: {
            workflowName: 'none',
            description: 'No workflow specified. Use templateName or workflowYaml.',
            source: 'none',
            templateUsed: null,
            steps: [],
            variables: { defined: [], provided: {} },
            validation: { valid: true, errors: [], warnings: [] },
            availableTemplates: templateList,
            summary: `Available templates: ${templateList.join(', ')}`,
          },
        };
      }

      // Load workflow from inline YAML or template
      let workflow: import('../../../workflows/browser/workflow-loader.js').BrowserWorkflow;
      let source: 'template' | 'inline-yaml';
      let templateUsed: string | null = null;

      if (params.workflowYaml) {
        // Parse inline YAML
        source = 'inline-yaml';
        workflow = parseYaml(params.workflowYaml) as typeof workflow;
      } else {
        // Load from template
        source = 'template';
        templateUsed = params.templateName!;
        workflow = await loader.load(params.templateName!);
      }

      // Validate
      const validation = await loader.validate(workflow);

      // Interpolate variables into step configs if provided
      const resolvedSteps = (workflow.steps ?? []).map(step => {
        let config = step.config;
        if (params.variables) {
          // Interpolate each string value in the config
          const interpolated: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(config)) {
            interpolated[k] = typeof v === 'string'
              ? interpolateVariables(v, params.variables as Record<string, unknown>)
              : v;
          }
          config = interpolated;
        }
        return {
          name: step.name,
          action: step.action,
          config,
          optional: step.optional ?? false,
          assertionCount: step.assertions?.length ?? 0,
        };
      });

      return {
        success: true,
        data: {
          workflowName: workflow.name || templateUsed || 'custom',
          description: workflow.description || (templateUsed ? descriptions[templateUsed] || '' : ''),
          source,
          templateUsed,
          steps: resolvedSteps,
          variables: {
            defined: (workflow.variables ?? []).map(v => ({
              name: v.name,
              type: v.type,
              required: v.required,
              hasDefault: v.default !== undefined,
            })),
            provided: params.variables || {},
          },
          validation: {
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
          },
          availableTemplates: templateList,
          summary: validation.valid
            ? `Workflow "${workflow.name}" loaded (${source}): ${resolvedSteps.length} steps, ${(workflow.variables ?? []).length} variables`
            : `Workflow "${workflow.name}" has validation errors: ${validation.errors.join('; ')}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }
}
