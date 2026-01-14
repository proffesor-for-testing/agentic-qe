/**
 * Agentic QE v3 - Workflow YAML Parser
 *
 * Parses and validates QE pipeline YAML files per ADR-041.
 * Converts YAML definitions to WorkflowDefinition format for the WorkflowOrchestrator.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DomainName, ALL_DOMAINS } from '../../shared/types/index.js';
import type { WorkflowDefinition, WorkflowStepDefinition, WorkflowTrigger, StepCondition, ConditionOperator } from '../../coordination/workflow-orchestrator.js';

// ============================================================================
// Pipeline YAML Types (ADR-041 format)
// ============================================================================

/**
 * Pipeline YAML stage definition
 */
export interface PipelineStageYAML {
  /** Stage name */
  name: string;
  /** CLI command to execute (e.g., "aqe test generate") */
  command: string;
  /** Command parameters */
  params?: Record<string, unknown>;
  /** Dependencies on other stages */
  depends_on?: string[];
  /** Condition to execute (YAML format) */
  condition?: {
    path: string;
    operator: string;
    value: unknown;
  };
  /** Timeout in seconds */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    max_attempts?: number;
    backoff_seconds?: number;
  };
  /** Continue on failure */
  continue_on_failure?: boolean;
}

/**
 * Pipeline YAML trigger definition
 */
export interface PipelineTriggerYAML {
  /** Event type */
  event: string;
  /** Branch filters */
  branches?: string[];
  /** Event types for PR triggers */
  types?: string[];
  /** Source domain */
  source_domain?: string;
  /** Condition */
  condition?: {
    path: string;
    operator: string;
    value: unknown;
  };
}

/**
 * Pipeline YAML definition (ADR-041 format)
 */
export interface PipelineYAML {
  /** Pipeline name */
  name: string;
  /** Pipeline description */
  description?: string;
  /** Version */
  version?: string;
  /** Cron schedule */
  schedule?: string;
  /** Pipeline stages */
  stages: PipelineStageYAML[];
  /** Triggers */
  triggers?: PipelineTriggerYAML[];
  /** Tags */
  tags?: string[];
  /** Global timeout in seconds */
  timeout?: number;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ParseResult {
  success: boolean;
  pipeline?: PipelineYAML;
  workflow?: WorkflowDefinition;
  errors: string[];
}

// ============================================================================
// Command to Domain Mapping
// ============================================================================

/**
 * Maps CLI commands to domain actions
 */
const COMMAND_TO_DOMAIN_ACTION: Record<string, { domain: DomainName; action: string }> = {
  'aqe test generate': { domain: 'test-generation', action: 'generateTests' },
  'aqe test execute': { domain: 'test-execution', action: 'execute' },
  'aqe coverage analyze': { domain: 'coverage-analysis', action: 'analyze' },
  'aqe coverage gaps': { domain: 'coverage-analysis', action: 'detectGaps' },
  'aqe quality gate': { domain: 'quality-assessment', action: 'evaluateGate' },
  'aqe quality assess': { domain: 'quality-assessment', action: 'analyzeQuality' },
  'aqe security scan': { domain: 'security-compliance', action: 'runSASTScan' },
  'aqe security audit': { domain: 'security-compliance', action: 'runAudit' },
  'aqe defect predict': { domain: 'defect-intelligence', action: 'predictDefects' },
  'aqe code index': { domain: 'code-intelligence', action: 'index' },
  'aqe code impact': { domain: 'code-intelligence', action: 'analyzeImpact' },
  'aqe contract validate': { domain: 'contract-testing', action: 'validateContract' },
  'aqe chaos test': { domain: 'chaos-resilience', action: 'runChaosTest' },
  'aqe requirements validate': { domain: 'requirements-validation', action: 'validateRequirements' },
  'aqe visual test': { domain: 'visual-accessibility', action: 'runVisualTest' },
  'aqe accessibility test': { domain: 'visual-accessibility', action: 'runAccessibilityTest' },
  'aqe learn optimize': { domain: 'learning-optimization', action: 'optimizeAllStrategies' },
};

/**
 * Supported cron expression patterns
 */
const CRON_PATTERNS = {
  daily: '0 0 * * *',
  weekly: '0 0 * * 0',
  hourly: '0 * * * *',
  minutely: '* * * * *',
};

// ============================================================================
// Simple YAML Parser (no external dependency)
// ============================================================================

/**
 * Simple YAML parser for pipeline files
 * Handles basic YAML structures without external dependencies
 * Specifically designed for the pipeline format per ADR-041
 */
export function parseYAMLContent(content: string): Record<string, unknown> {
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};

  // First pass: parse top-level scalars
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    if (indent !== 0) continue; // Only top-level

    const match = line.match(/^([\w_-]+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      result[key] = parseYAMLValue(value);
    }
  }

  // Second pass: parse arrays (tags, stages, triggers)
  const arrayKeys = ['tags', 'stages', 'triggers'];
  for (const arrayKey of arrayKeys) {
    const startPattern = new RegExp(`^${arrayKey}:\\s*$`);
    let arrayStartLine = -1;

    // Find where this array starts
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      if (startPattern.test(line.trim())) {
        arrayStartLine = i;
        break;
      }
    }

    if (arrayStartLine === -1) continue;

    const arr: unknown[] = [];
    result[arrayKey] = arr;

    const baseIndent = lines[arrayStartLine].search(/\S/);
    let i = arrayStartLine + 1;

    while (i < lines.length) {
      const line = lines[i];

      // Skip empty and comments
      if (line.trim() === '' || line.trim().startsWith('#')) {
        i++;
        continue;
      }

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Exit if we're at or before base indent (not counting array items)
      if (indent <= baseIndent && !trimmed.startsWith('-')) {
        break;
      }

      // Handle array items
      if (trimmed.startsWith('- ')) {
        const itemContent = trimmed.slice(2).trim();

        // Simple value (for tags)
        if (!itemContent.includes(':')) {
          arr.push(parseYAMLValue(itemContent));
          i++;
          continue;
        }

        // Object item - parse all properties until next array item or outdent
        const itemObj: Record<string, unknown> = {};
        const firstMatch = itemContent.match(/^([\w_-]+):\s*(.*)$/);
        if (firstMatch) {
          const [, firstKey, firstValue] = firstMatch;
          itemObj[firstKey] = parseYAMLValue(firstValue);
        }

        const itemIndent = indent;
        i++;

        // Parse object properties
        while (i < lines.length) {
          const propLine = lines[i];

          if (propLine.trim() === '' || propLine.trim().startsWith('#')) {
            i++;
            continue;
          }

          const propIndent = propLine.search(/\S/);
          const propTrimmed = propLine.trim();

          // End of object if we're back to array item level or shallower
          if (propIndent <= itemIndent) break;

          // Handle property
          const propMatch = propTrimmed.match(/^([\w_-]+):\s*(.*)$/);
          if (propMatch) {
            const [, propKey, propValue] = propMatch;

            if (propValue === '') {
              // Nested structure - could be object or array
              const nestedResult = parseNestedStructure(lines, i + 1, propIndent);
              itemObj[propKey] = nestedResult.value;
              i = nestedResult.nextLine;
              continue;
            } else {
              itemObj[propKey] = parseYAMLValue(propValue);
            }
          }
          i++;
        }

        arr.push(itemObj);
      } else {
        i++;
      }
    }
  }

  return result;
}

/**
 * Parse a nested structure (object or array) from YAML
 */
function parseNestedStructure(
  lines: string[],
  startLine: number,
  parentIndent: number
): { value: unknown; nextLine: number } {
  const result: Record<string, unknown> = {};
  let currentArray: unknown[] | null = null;
  let currentArrayKey: string | null = null;
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Exit if we're back at or before parent level
    if (indent <= parentIndent) break;

    // Handle array items
    if (trimmed.startsWith('- ')) {
      const arrayVal = trimmed.slice(2).trim();

      // The parent key owns this array
      if (currentArrayKey && !Array.isArray(result[currentArrayKey])) {
        result[currentArrayKey] = [];
      }

      if (currentArrayKey) {
        (result[currentArrayKey] as unknown[]).push(parseYAMLValue(arrayVal));
      } else {
        // Array at root level of nested structure
        if (!currentArray) {
          currentArray = [];
        }
        currentArray.push(parseYAMLValue(arrayVal));
      }
      i++;
      continue;
    }

    // Handle key-value
    const kvMatch = trimmed.match(/^([\w_-]+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;

      if (value === '') {
        // This key will own subsequent array items
        currentArrayKey = key;
        result[key] = [];
      } else {
        result[key] = parseYAMLValue(value);
        currentArrayKey = null;
      }
    }

    i++;
  }

  // If we only collected array items, return the array
  if (currentArray && Object.keys(result).length === 0) {
    return { value: currentArray, nextLine: i };
  }

  // If there's a single array key, return just the array
  const keys = Object.keys(result);
  if (keys.length === 1 && Array.isArray(result[keys[0]])) {
    return { value: result[keys[0]], nextLine: i };
  }

  return { value: result, nextLine: i };
}

/**
 * Parse a YAML value to the appropriate type
 */
function parseYAMLValue(value: string): unknown {
  if (value === '') return '';

  // Handle quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Handle booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Handle null
  if (value === 'null' || value === '~') return null;

  // Handle numbers
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;

  // Handle inline arrays [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1);
    return inner.split(',').map(v => parseYAMLValue(v.trim()));
  }

  // Default to string
  return value;
}

// ============================================================================
// Pipeline Parser
// ============================================================================

/**
 * Parse a pipeline YAML file
 */
export function parsePipelineFile(filePath: string): ParseResult {
  const errors: string[] = [];

  // Check file exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      errors: [`File not found: ${filePath}`],
    };
  }

  // Read file
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      errors: [`Failed to read file: ${err}`],
    };
  }

  return parsePipelineContent(content, filePath);
}

/**
 * Parse pipeline YAML content
 */
export function parsePipelineContent(content: string, sourcePath?: string): ParseResult {
  const errors: string[] = [];

  // Parse YAML
  let parsed: Record<string, unknown>;
  try {
    parsed = parseYAMLContent(content);
  } catch (err) {
    return {
      success: false,
      errors: [`Invalid YAML syntax: ${err}`],
    };
  }

  // Validate required fields
  if (!parsed.name || typeof parsed.name !== 'string') {
    errors.push('Pipeline must have a "name" field');
  }

  if (!parsed.stages || !Array.isArray(parsed.stages)) {
    errors.push('Pipeline must have a "stages" array');
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Convert to PipelineYAML
  const pipeline: PipelineYAML = {
    name: parsed.name as string,
    description: parsed.description as string | undefined,
    version: (parsed.version as string) || '1.0.0',
    schedule: parsed.schedule as string | undefined,
    stages: (parsed.stages as unknown[]).map((stage, index) => {
      const s = stage as Record<string, unknown>;
      return {
        name: (s.name as string) || `stage-${index}`,
        command: s.command as string,
        params: s.params as Record<string, unknown> | undefined,
        depends_on: s.depends_on as string[] | undefined,
        condition: s.condition as PipelineStageYAML['condition'],
        timeout: s.timeout as number | undefined,
        retry: s.retry as PipelineStageYAML['retry'],
        continue_on_failure: s.continue_on_failure as boolean | undefined,
      };
    }),
    triggers: parsed.triggers as PipelineTriggerYAML[] | undefined,
    tags: parsed.tags as string[] | undefined,
    timeout: parsed.timeout as number | undefined,
  };

  // Validate stages
  for (let i = 0; i < pipeline.stages.length; i++) {
    const stage = pipeline.stages[i];
    if (!stage.command) {
      errors.push(`Stage ${i + 1} (${stage.name}) must have a "command" field`);
    }
  }

  if (errors.length > 0) {
    return { success: false, pipeline, errors };
  }

  // Convert to WorkflowDefinition
  const workflow = convertToWorkflowDefinition(pipeline, sourcePath);

  return {
    success: true,
    pipeline,
    workflow,
    errors: [],
  };
}

/**
 * Convert PipelineYAML to WorkflowDefinition
 */
export function convertToWorkflowDefinition(
  pipeline: PipelineYAML,
  sourcePath?: string
): WorkflowDefinition {
  const workflowId = `pipeline-${pipeline.name.replace(/\s+/g, '-').toLowerCase()}`;

  const steps: WorkflowStepDefinition[] = pipeline.stages.map((stage, index) => {
    // Map command to domain action
    const domainAction = mapCommandToDomainAction(stage.command);

    // Build input mapping from params
    const inputMapping: Record<string, string> = {};
    if (stage.params) {
      for (const [key, value] of Object.entries(stage.params)) {
        // For direct values, we'll store them in input context
        inputMapping[key] = `input.${key}`;
      }
    }

    const step: WorkflowStepDefinition = {
      id: `stage-${stage.name.replace(/\s+/g, '-').toLowerCase()}`,
      name: stage.name,
      domain: domainAction.domain,
      action: domainAction.action,
      inputMapping: Object.keys(inputMapping).length > 0 ? inputMapping : undefined,
      dependsOn: stage.depends_on?.map(dep => `stage-${dep.replace(/\s+/g, '-').toLowerCase()}`),
      timeout: stage.timeout ? stage.timeout * 1000 : undefined,
      continueOnFailure: stage.continue_on_failure,
    };

    // Add condition if present
    if (stage.condition) {
      step.condition = {
        path: stage.condition.path,
        operator: stage.condition.operator as ConditionOperator,
        value: stage.condition.value,
      };
    }

    // Add retry if present
    if (stage.retry) {
      step.retry = {
        maxAttempts: stage.retry.max_attempts || 3,
        backoffMs: (stage.retry.backoff_seconds || 1) * 1000,
      };
    }

    return step;
  });

  // Convert triggers
  const triggers: WorkflowTrigger[] | undefined = pipeline.triggers?.map(trigger => {
    const workflowTrigger: WorkflowTrigger = {
      eventType: mapTriggerEventType(trigger),
      sourceDomain: trigger.source_domain as DomainName | undefined,
    };

    if (trigger.condition) {
      workflowTrigger.condition = {
        path: trigger.condition.path,
        operator: trigger.condition.operator as ConditionOperator,
        value: trigger.condition.value,
      };
    }

    return workflowTrigger;
  });

  return {
    id: workflowId,
    name: pipeline.name,
    description: pipeline.description || `Pipeline from ${sourcePath || 'inline YAML'}`,
    version: pipeline.version || '1.0.0',
    steps,
    triggers,
    tags: pipeline.tags,
    timeout: pipeline.timeout ? pipeline.timeout * 1000 : undefined,
  };
}

/**
 * Map CLI command to domain and action
 */
function mapCommandToDomainAction(command: string): { domain: DomainName; action: string } {
  // Normalize command (remove extra whitespace)
  const normalized = command.trim().replace(/\s+/g, ' ').toLowerCase();

  // Try exact match first
  for (const [cmdPattern, domainAction] of Object.entries(COMMAND_TO_DOMAIN_ACTION)) {
    if (normalized.startsWith(cmdPattern.toLowerCase())) {
      return domainAction;
    }
  }

  // Try partial matching
  if (normalized.includes('test') && normalized.includes('generate')) {
    return { domain: 'test-generation', action: 'generateTests' };
  }
  if (normalized.includes('test') && (normalized.includes('execute') || normalized.includes('run'))) {
    return { domain: 'test-execution', action: 'execute' };
  }
  if (normalized.includes('coverage')) {
    return { domain: 'coverage-analysis', action: 'analyze' };
  }
  if (normalized.includes('quality') || normalized.includes('gate')) {
    return { domain: 'quality-assessment', action: 'evaluateGate' };
  }
  if (normalized.includes('security') || normalized.includes('scan')) {
    return { domain: 'security-compliance', action: 'runSASTScan' };
  }
  if (normalized.includes('defect') || normalized.includes('predict')) {
    return { domain: 'defect-intelligence', action: 'predictDefects' };
  }

  // Default to learning-optimization domain
  return { domain: 'learning-optimization', action: 'runLearningCycle' };
}

/**
 * Map trigger to event type string
 */
function mapTriggerEventType(trigger: PipelineTriggerYAML): string {
  const event = trigger.event.toLowerCase();

  // Map common CI/CD events to domain events
  if (event === 'push') {
    return 'code-intelligence.CodePushed';
  }
  if (event === 'pull_request' || event === 'pr') {
    return 'code-intelligence.PullRequestOpened';
  }
  if (event === 'schedule') {
    return 'workflow.ScheduleTrigger';
  }
  if (event === 'quality_gate') {
    return 'quality-assessment.QualityGateEvaluated';
  }
  if (event === 'test_complete') {
    return 'test-execution.TestRunCompleted';
  }

  // Default: use as-is
  return event;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a pipeline YAML structure
 */
export function validatePipeline(pipeline: PipelineYAML): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate name
  if (!pipeline.name) {
    errors.push({
      path: 'name',
      message: 'Pipeline name is required',
      severity: 'error',
    });
  }

  // Validate stages
  if (!pipeline.stages || pipeline.stages.length === 0) {
    errors.push({
      path: 'stages',
      message: 'Pipeline must have at least one stage',
      severity: 'error',
    });
  } else {
    const stageNames = new Set<string>();

    for (let i = 0; i < pipeline.stages.length; i++) {
      const stage = pipeline.stages[i];
      const stagePath = `stages[${i}]`;

      // Check for duplicate stage names
      if (stageNames.has(stage.name)) {
        errors.push({
          path: `${stagePath}.name`,
          message: `Duplicate stage name: ${stage.name}`,
          severity: 'error',
        });
      }
      stageNames.add(stage.name);

      // Validate command
      if (!stage.command) {
        errors.push({
          path: `${stagePath}.command`,
          message: 'Stage must have a command',
          severity: 'error',
        });
      } else {
        // Warn if command is not recognized
        const domainAction = mapCommandToDomainAction(stage.command);
        if (domainAction.domain === 'learning-optimization' && !stage.command.toLowerCase().includes('learn')) {
          warnings.push({
            path: `${stagePath}.command`,
            message: `Command "${stage.command}" not recognized, will default to learning-optimization domain`,
            severity: 'warning',
          });
        }
      }

      // Validate dependencies
      if (stage.depends_on) {
        for (const dep of stage.depends_on) {
          if (!pipeline.stages.some(s => s.name === dep)) {
            errors.push({
              path: `${stagePath}.depends_on`,
              message: `Unknown dependency: ${dep}`,
              severity: 'error',
            });
          }
        }
      }

      // Validate timeout
      if (stage.timeout !== undefined && stage.timeout <= 0) {
        errors.push({
          path: `${stagePath}.timeout`,
          message: 'Timeout must be a positive number',
          severity: 'error',
        });
      }

      // Validate retry
      if (stage.retry) {
        if (stage.retry.max_attempts !== undefined && stage.retry.max_attempts < 1) {
          errors.push({
            path: `${stagePath}.retry.max_attempts`,
            message: 'max_attempts must be at least 1',
            severity: 'error',
          });
        }
      }
    }

    // Check for circular dependencies
    const circular = detectCircularDependencies(pipeline.stages);
    if (circular) {
      errors.push({
        path: 'stages',
        message: `Circular dependency detected: ${circular}`,
        severity: 'error',
      });
    }
  }

  // Validate schedule
  if (pipeline.schedule) {
    if (!isValidCronExpression(pipeline.schedule)) {
      errors.push({
        path: 'schedule',
        message: `Invalid cron expression: ${pipeline.schedule}`,
        severity: 'error',
      });
    }
  }

  // Validate triggers
  if (pipeline.triggers) {
    for (let i = 0; i < pipeline.triggers.length; i++) {
      const trigger = pipeline.triggers[i];
      const triggerPath = `triggers[${i}]`;

      if (!trigger.event) {
        errors.push({
          path: `${triggerPath}.event`,
          message: 'Trigger must have an event type',
          severity: 'error',
        });
      }

      // Validate source_domain if present
      if (trigger.source_domain && !ALL_DOMAINS.includes(trigger.source_domain as DomainName)) {
        warnings.push({
          path: `${triggerPath}.source_domain`,
          message: `Unknown domain: ${trigger.source_domain}`,
          severity: 'warning',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect circular dependencies in stages
 */
function detectCircularDependencies(stages: PipelineStageYAML[]): string | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const visit = (stageName: string, path: string[]): string | null => {
    if (recursionStack.has(stageName)) {
      return [...path, stageName].join(' -> ');
    }

    if (visited.has(stageName)) {
      return null;
    }

    visited.add(stageName);
    recursionStack.add(stageName);

    const stage = stages.find(s => s.name === stageName);
    if (stage?.depends_on) {
      for (const dep of stage.depends_on) {
        const result = visit(dep, [...path, stageName]);
        if (result) return result;
      }
    }

    recursionStack.delete(stageName);
    return null;
  };

  for (const stage of stages) {
    const result = visit(stage.name, []);
    if (result) return result;
  }

  return null;
}

/**
 * Validate cron expression (basic validation)
 */
export function isValidCronExpression(expression: string): boolean {
  // Check for aliases
  if (Object.keys(CRON_PATTERNS).includes(expression)) {
    return true;
  }

  // Basic cron validation: 5 fields separated by spaces
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  // Validate each field
  const fieldPatterns = [
    /^(\*|[0-5]?\d)(-[0-5]?\d)?(\/\d+)?$/, // minute (0-59)
    /^(\*|1?\d|2[0-3])(-\d+)?(\/\d+)?$/, // hour (0-23)
    /^(\*|[1-9]|[12]\d|3[01])(-\d+)?(\/\d+)?$/, // day of month (1-31)
    /^(\*|[1-9]|1[0-2])(-\d+)?(\/\d+)?$/, // month (1-12)
    /^(\*|[0-7])(-[0-7])?(\/\d+)?$/, // day of week (0-7)
  ];

  for (let i = 0; i < 5; i++) {
    // Allow comma-separated values
    const values = parts[i].split(',');
    for (const value of values) {
      if (!fieldPatterns[i].test(value) && value !== '*') {
        return false;
      }
    }
  }

  return true;
}

/**
 * Parse cron expression to human-readable string
 */
export function describeCronSchedule(expression: string): string {
  // Check aliases
  const aliases: Record<string, string> = {
    '@daily': 'Daily at midnight',
    '@weekly': 'Weekly on Sunday at midnight',
    '@hourly': 'Every hour',
    '@minutely': 'Every minute',
  };

  if (aliases[expression]) {
    return aliases[expression];
  }

  // Handle numeric patterns
  if (Object.keys(CRON_PATTERNS).includes(expression)) {
    const aliasMap: Record<string, string> = {
      daily: 'Daily at midnight',
      weekly: 'Weekly on Sunday at midnight',
      hourly: 'Every hour',
      minutely: 'Every minute',
    };
    return aliasMap[expression] || expression;
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return expression;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Daily at midnight';
  }
  if (minute === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${hour}:00`;
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*') {
    return `Daily at ${hour}:${minute.padStart(2, '0')}`;
  }
  if (hour === '*' && minute === '0') {
    return 'Every hour';
  }
  if (minute !== '*' && hour === '*') {
    return `Every hour at minute ${minute}`;
  }

  return expression; // Return as-is for complex expressions
}

// ============================================================================
// Schedule Storage Types
// ============================================================================

export interface ScheduledWorkflow {
  id: string;
  workflowId: string;
  pipelinePath: string;
  schedule: string;
  scheduleDescription: string;
  nextRun?: Date;
  lastRun?: Date;
  enabled: boolean;
  createdAt: Date;
}

/**
 * Calculate next run time from cron expression
 */
export function calculateNextRun(cronExpression: string, fromDate: Date = new Date()): Date {
  // Simplified next run calculation
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    // Default to 1 day from now
    return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
  }

  const [minute, hour] = parts;
  const nextRun = new Date(fromDate);

  // Handle specific hour and minute
  if (hour !== '*' && minute !== '*') {
    nextRun.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
    if (nextRun <= fromDate) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (hour !== '*') {
    // Every day at specific hour
    nextRun.setHours(parseInt(hour, 10), 0, 0, 0);
    if (nextRun <= fromDate) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (minute !== '*') {
    // Every hour at specific minute
    nextRun.setMinutes(parseInt(minute, 10), 0, 0);
    if (nextRun <= fromDate) {
      nextRun.setHours(nextRun.getHours() + 1);
    }
  } else {
    // Every minute
    nextRun.setSeconds(0, 0);
    nextRun.setMinutes(nextRun.getMinutes() + 1);
  }

  return nextRun;
}
