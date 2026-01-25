import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import { safeEvaluateBoolean } from '../../shared/utils/safe-expression-evaluator.js';

/**
 * Browser workflow variable definition
 */
export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description?: string;
}

/**
 * Browser workflow step configuration
 */
export interface WorkflowStep {
  name: string;
  action: string;
  config: Record<string, any>;
  assertions?: Array<{
    condition: string;
    message: string;
  }>;
  optional?: boolean;
}

/**
 * Browser workflow definition
 */
export interface BrowserWorkflow {
  name: string;
  version: string;
  description: string;
  variables: WorkflowVariable[];
  steps: WorkflowStep[];
}

/**
 * Workflow validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  variables: Record<string, any>;
  results: Map<string, any>;
  metadata: {
    startTime: number;
    workflow: string;
    templateName: string;
  };
}

/**
 * WorkflowLoader loads and validates browser workflow templates
 */
export class WorkflowLoader {
  private templatesDir: string;
  private cache: Map<string, BrowserWorkflow> = new Map();

  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir || join(__dirname, 'templates');
  }

  /**
   * Load a workflow template by name
   */
  async load(templateName: string): Promise<BrowserWorkflow> {
    // Check cache first
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName)!;
    }

    try {
      const templatePath = join(this.templatesDir, `${templateName}.yaml`);
      const content = await readFile(templatePath, 'utf-8');
      const workflow = parseYaml(content) as BrowserWorkflow;

      // Validate the workflow
      const validation = await this.validate(workflow);
      if (!validation.valid) {
        throw new Error(
          `Invalid workflow template ${templateName}:\n${validation.errors.join('\n')}`
        );
      }

      // Cache the workflow
      this.cache.set(templateName, workflow);

      return workflow;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Workflow template not found: ${templateName}`);
      }
      throw error;
    }
  }

  /**
   * List all available workflow templates
   */
  async list(): Promise<string[]> {
    try {
      const files = await readdir(this.templatesDir);
      return files
        .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
        .map(file => basename(file, file.endsWith('.yaml') ? '.yaml' : '.yml'))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Validate a workflow template
   */
  async validate(workflow: BrowserWorkflow): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!workflow.name) {
      errors.push('Workflow must have a name');
    }

    if (!workflow.version) {
      errors.push('Workflow must have a version');
    }

    if (!workflow.description) {
      warnings.push('Workflow should have a description');
    }

    if (!Array.isArray(workflow.variables)) {
      errors.push('Workflow must have a variables array');
    } else {
      // Validate variables
      workflow.variables.forEach((variable, index) => {
        if (!variable.name) {
          errors.push(`Variable at index ${index} must have a name`);
        }

        if (!variable.type) {
          errors.push(`Variable ${variable.name} must have a type`);
        }

        if (variable.required === undefined) {
          warnings.push(`Variable ${variable.name} should specify if it's required`);
        }
      });
    }

    if (!Array.isArray(workflow.steps)) {
      errors.push('Workflow must have a steps array');
    } else if (workflow.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    } else {
      // Validate steps
      workflow.steps.forEach((step, index) => {
        if (!step.name) {
          errors.push(`Step at index ${index} must have a name`);
        }

        if (!step.action) {
          errors.push(`Step ${step.name || index} must have an action`);
        }

        if (!step.config || typeof step.config !== 'object') {
          errors.push(`Step ${step.name || index} must have a config object`);
        }

        // Validate assertions if present
        if (step.assertions && Array.isArray(step.assertions)) {
          step.assertions.forEach((assertion, assertionIndex) => {
            if (!assertion.condition) {
              errors.push(
                `Assertion ${assertionIndex} in step ${step.name || index} must have a condition`
              );
            }

            if (!assertion.message) {
              warnings.push(
                `Assertion ${assertionIndex} in step ${step.name || index} should have a message`
              );
            }
          });
        }
      });

      // Check for duplicate step names
      const stepNames = workflow.steps.map(s => s.name);
      const duplicates = stepNames.filter(
        (name, index) => stepNames.indexOf(name) !== index
      );
      if (duplicates.length > 0) {
        errors.push(`Duplicate step names found: ${duplicates.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Create a workflow execution context with resolved variables
   */
  async createContext(
    templateName: string,
    variables: Record<string, any>
  ): Promise<WorkflowContext> {
    const workflow = await this.load(templateName);

    // Validate required variables
    const missingVars = workflow.variables
      .filter(v => v.required && !(v.name in variables))
      .map(v => v.name);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required variables: ${missingVars.join(', ')}`
      );
    }

    // Resolve variables with defaults
    const resolvedVariables: Record<string, any> = {};
    workflow.variables.forEach(varDef => {
      if (varDef.name in variables) {
        resolvedVariables[varDef.name] = variables[varDef.name];
      } else if ('default' in varDef) {
        resolvedVariables[varDef.name] = varDef.default;
      }
    });

    return {
      variables: resolvedVariables,
      results: new Map(),
      metadata: {
        startTime: Date.now(),
        workflow: workflow.name,
        templateName,
      },
    };
  }

  /**
   * Get workflow metadata without loading the full workflow
   */
  async getMetadata(templateName: string): Promise<{
    name: string;
    version: string;
    description: string;
  }> {
    try {
      const templatePath = join(this.templatesDir, `${templateName}.yaml`);
      const content = await readFile(templatePath, 'utf-8');
      const workflow = parseYaml(content) as BrowserWorkflow;

      return {
        name: workflow.name,
        version: workflow.version,
        description: workflow.description,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Workflow template not found: ${templateName}`);
      }
      throw error;
    }
  }

  /**
   * Clear the workflow cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reload a specific workflow template
   */
  async reload(templateName: string): Promise<BrowserWorkflow> {
    this.cache.delete(templateName);
    return this.load(templateName);
  }
}

/**
 * Default workflow loader instance
 */
export const defaultWorkflowLoader = new WorkflowLoader();

/**
 * Helper function to interpolate variables in strings
 */
export function interpolateVariables(
  template: string,
  variables: Record<string, any>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();

    // Handle nested object access (e.g., {{currentItem.name}})
    const keys = trimmedKey.split('.');
    let value: any = variables;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return match; // Return original if key not found
      }
    }

    return value !== undefined && value !== null ? String(value) : match;
  });
}

/**
 * Helper function to evaluate workflow conditions
 * Uses safe expression evaluator to prevent code injection (CVE fix)
 */
export function evaluateCondition(
  condition: string,
  context: WorkflowContext
): boolean {
  // Create a safe evaluation context
  const evalContext: Record<string, unknown> = {
    ...context.variables,
    result: context.results.get('__last_result__'),
  };

  // Interpolate variables first to replace {{var}} syntax
  const interpolated = interpolateVariables(condition, evalContext);

  // Use safe evaluator instead of eval() - prevents code injection
  return safeEvaluateBoolean(interpolated, evalContext, false);
}
