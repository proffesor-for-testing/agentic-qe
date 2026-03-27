/**
 * YAML Pipeline Loader (Imp-9)
 *
 * Converts declarative YAML files into WorkflowDefinition objects for
 * deterministic, token-free execution through the WorkflowOrchestrator.
 * Supports ${VAR} variable interpolation and schema validation.
 */

import * as fs from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { Result, ok, err, DomainName, ALL_DOMAINS } from '../shared/types/index.js';
import type {
  WorkflowDefinition, WorkflowStepDefinition, WorkflowTrigger,
  StepCondition, ConditionOperator, StepExecutionMode,
} from './workflow-types.js';

const VALID_OPERATORS: readonly ConditionOperator[] = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists',
];
const VALID_EXECUTION_MODES: readonly StepExecutionMode[] = ['sequential', 'parallel'];
const VAR_PATTERN = /\$\{([^}]+)\}/g;

// ============================================================================
// YAML Pipeline Loader
// ============================================================================

export class YamlPipelineLoader {

  /** Parse a YAML string into a WorkflowDefinition with optional variable interpolation. */
  parse(
    yaml: string,
    vars?: Record<string, unknown>,
  ): Result<WorkflowDefinition, Error> {
    try {
      const interpolated = this.interpolateVariables(yaml, vars ?? {});
      const parsed: unknown = parseYaml(interpolated);

      return this.validateAndConvert(parsed);
    } catch (error) {
      return err(
        error instanceof Error
          ? new Error(`YAML parse error: ${error.message}`)
          : new Error(`YAML parse error: ${String(error)}`),
      );
    }
  }

  /** Load a WorkflowDefinition from a YAML file on disk. */
  async loadFromFile(
    filePath: string,
    vars?: Record<string, unknown>,
  ): Promise<Result<WorkflowDefinition, Error>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parse(content, vars);
    } catch (error) {
      return err(
        error instanceof Error
          ? new Error(`Failed to read pipeline file '${filePath}': ${error.message}`)
          : new Error(`Failed to read pipeline file '${filePath}': ${String(error)}`),
      );
    }
  }

  /** Interpolate ${VAR} placeholders. Supports flat and dot-path keys. */
  interpolateVariables(
    yaml: string,
    vars: Record<string, unknown>,
  ): string {
    return yaml.replace(VAR_PATTERN, (_match, varPath: string) => {
      const value = this.resolveVarPath(vars, varPath);
      if (value === undefined) return _match; // leave unresolved
      return String(value);
    });
  }

  /** Validate a raw parsed object against the WorkflowDefinition schema. */
  validateSchema(parsed: unknown): Result<WorkflowDefinition, Error> {
    return this.validateAndConvert(parsed);
  }

  private validateAndConvert(parsed: unknown): Result<WorkflowDefinition, Error> {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return err(new Error('YAML must parse to an object'));
    }

    const raw = parsed as Record<string, unknown>;

    // Required top-level fields
    if (!raw.id || typeof raw.id !== 'string') {
      return err(new Error("Missing or invalid required field 'id' (string)"));
    }
    if (!raw.name || typeof raw.name !== 'string') {
      return err(new Error("Missing or invalid required field 'name' (string)"));
    }
    if (!raw.steps || !Array.isArray(raw.steps) || raw.steps.length === 0) {
      return err(new Error("'steps' must be a non-empty array"));
    }

    // Optional fields with type checks
    const description = typeof raw.description === 'string' ? raw.description : '';
    const version = typeof raw.version === 'string' ? raw.version : '1.0.0';

    let defaultMode: StepExecutionMode | undefined;
    if (raw.defaultMode !== undefined) {
      if (!VALID_EXECUTION_MODES.includes(raw.defaultMode as StepExecutionMode)) {
        return err(new Error(`Invalid defaultMode '${String(raw.defaultMode)}'. Must be one of: ${VALID_EXECUTION_MODES.join(', ')}`));
      }
      defaultMode = raw.defaultMode as StepExecutionMode;
    }

    let timeout: number | undefined;
    if (raw.timeout !== undefined) {
      if (typeof raw.timeout !== 'number' || raw.timeout <= 0) {
        return err(new Error("'timeout' must be a positive number"));
      }
      timeout = raw.timeout;
    }

    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === 'string')
      : undefined;

    // Validate steps
    const stepsResult = this.validateSteps(raw.steps);
    if (!stepsResult.success) return stepsResult;

    // Validate triggers (optional)
    let triggers: WorkflowTrigger[] | undefined;
    if (raw.triggers !== undefined) {
      if (!Array.isArray(raw.triggers)) {
        return err(new Error("'triggers' must be an array"));
      }
      const triggersResult = this.validateTriggers(raw.triggers);
      if (!triggersResult.success) return triggersResult;
      triggers = triggersResult.value;
    }

    // Check for circular dependencies among steps
    const circularError = this.detectCircularDependencies(stepsResult.value);
    if (circularError) {
      return err(new Error(`Circular dependency detected: ${circularError}`));
    }

    const definition: WorkflowDefinition = {
      id: raw.id,
      name: raw.name,
      description,
      version,
      steps: stepsResult.value,
      ...(defaultMode !== undefined && { defaultMode }),
      ...(timeout !== undefined && { timeout }),
      ...(tags !== undefined && { tags }),
      ...(triggers !== undefined && { triggers }),
    };

    return ok(definition);
  }

  private validateSteps(
    rawSteps: unknown[],
  ): Result<WorkflowStepDefinition[], Error> {
    const steps: WorkflowStepDefinition[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < rawSteps.length; i++) {
      const raw = rawSteps[i];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return err(new Error(`Step at index ${i} must be an object`));
      }

      const s = raw as Record<string, unknown>;

      // Required step fields
      if (!s.id || typeof s.id !== 'string') {
        return err(new Error(`Step at index ${i}: missing or invalid 'id' (string)`));
      }
      if (seenIds.has(s.id)) {
        return err(new Error(`Duplicate step ID: ${s.id}`));
      }
      seenIds.add(s.id);

      if (!s.name || typeof s.name !== 'string') {
        return err(new Error(`Step '${s.id}': missing or invalid 'name' (string)`));
      }
      if (!s.domain || typeof s.domain !== 'string') {
        return err(new Error(`Step '${s.id}': missing or invalid 'domain' (string)`));
      }
      if (!ALL_DOMAINS.includes(s.domain as DomainName)) {
        return err(new Error(
          `Step '${s.id}': invalid domain '${s.domain}'. ` +
          `Must be one of: ${ALL_DOMAINS.join(', ')}`,
        ));
      }
      if (!s.action || typeof s.action !== 'string') {
        return err(new Error(`Step '${s.id}': missing or invalid 'action' (string)`));
      }

      // Optional step fields
      const inputMapping = this.validateStringRecord(s.inputMapping, `Step '${s.id}'.inputMapping`);
      if (inputMapping !== undefined && inputMapping instanceof Error) return err(inputMapping);

      const outputMapping = this.validateStringRecord(s.outputMapping, `Step '${s.id}'.outputMapping`);
      if (outputMapping !== undefined && outputMapping instanceof Error) return err(outputMapping);

      let dependsOn: string[] | undefined;
      if (s.dependsOn !== undefined) {
        if (!Array.isArray(s.dependsOn) || !s.dependsOn.every((d: unknown) => typeof d === 'string')) {
          return err(new Error(`Step '${s.id}': 'dependsOn' must be an array of strings`));
        }
        // Validate that all dependencies reference known step IDs
        for (const dep of s.dependsOn as string[]) {
          if (!rawSteps.some((rs: unknown) => (rs as Record<string, unknown>).id === dep)) {
            return err(new Error(`Step '${s.id}' depends on unknown step: ${dep}`));
          }
        }
        dependsOn = s.dependsOn as string[];
      }

      let condition: StepCondition | undefined;
      if (s.condition !== undefined) {
        const condResult = this.validateCondition(s.condition, `Step '${s.id}'.condition`);
        if (!condResult.success) return condResult;
        condition = condResult.value;
      }

      let skipCondition: StepCondition | undefined;
      if (s.skipCondition !== undefined) {
        const condResult = this.validateCondition(s.skipCondition, `Step '${s.id}'.skipCondition`);
        if (!condResult.success) return condResult;
        skipCondition = condResult.value;
      }

      let timeout: number | undefined;
      if (s.timeout !== undefined) {
        if (typeof s.timeout !== 'number' || s.timeout <= 0) {
          return err(new Error(`Step '${s.id}': 'timeout' must be a positive number`));
        }
        timeout = s.timeout;
      }

      let retry: WorkflowStepDefinition['retry'];
      if (s.retry !== undefined) {
        const retryResult = this.validateRetry(s.retry, s.id as string);
        if (!retryResult.success) return retryResult;
        retry = retryResult.value;
      }

      let rollback: WorkflowStepDefinition['rollback'];
      if (s.rollback !== undefined) {
        const rollbackResult = this.validateRollback(s.rollback, s.id as string);
        if (!rollbackResult.success) return rollbackResult;
        rollback = rollbackResult.value;
      }

      const continueOnFailure = typeof s.continueOnFailure === 'boolean'
        ? s.continueOnFailure
        : undefined;

      // Validate approval gate configuration
      let approval: WorkflowStepDefinition['approval'];
      if (s.approval !== undefined) {
        const approvalResult = this.validateApproval(s.approval, s.id as string);
        if (!approvalResult.success) return approvalResult;
        approval = approvalResult.value;
      }

      const step: WorkflowStepDefinition = {
        id: s.id,
        name: s.name,
        domain: s.domain as DomainName,
        action: s.action,
        ...(inputMapping !== undefined && { inputMapping: inputMapping as Record<string, string> }),
        ...(outputMapping !== undefined && { outputMapping: outputMapping as Record<string, string> }),
        ...(dependsOn !== undefined && { dependsOn }),
        ...(condition !== undefined && { condition }),
        ...(skipCondition !== undefined && { skipCondition }),
        ...(timeout !== undefined && { timeout }),
        ...(retry !== undefined && { retry }),
        ...(rollback !== undefined && { rollback }),
        ...(continueOnFailure !== undefined && { continueOnFailure }),
        ...(approval !== undefined && { approval }),
      };

      steps.push(step);
    }

    return ok(steps);
  }

  private validateCondition(
    raw: unknown,
    label: string,
  ): Result<StepCondition, Error> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return err(new Error(`${label}: must be an object with path, operator, value`));
    }

    const c = raw as Record<string, unknown>;

    if (!c.path || typeof c.path !== 'string') {
      return err(new Error(`${label}: missing or invalid 'path' (string)`));
    }
    if (!c.operator || typeof c.operator !== 'string') {
      return err(new Error(`${label}: missing or invalid 'operator' (string)`));
    }
    if (!VALID_OPERATORS.includes(c.operator as ConditionOperator)) {
      return err(new Error(
        `${label}: invalid operator '${c.operator}'. ` +
        `Must be one of: ${VALID_OPERATORS.join(', ')}`,
      ));
    }
    if (c.value === undefined) {
      return err(new Error(`${label}: missing 'value'`));
    }

    return ok({
      path: c.path,
      operator: c.operator as ConditionOperator,
      value: c.value,
    });
  }

  private validateTriggers(
    rawTriggers: unknown[],
  ): Result<WorkflowTrigger[], Error> {
    const triggers: WorkflowTrigger[] = [];

    for (let i = 0; i < rawTriggers.length; i++) {
      const raw = rawTriggers[i];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return err(new Error(`Trigger at index ${i} must be an object`));
      }

      const t = raw as Record<string, unknown>;

      if (!t.eventType || typeof t.eventType !== 'string') {
        return err(new Error(`Trigger at index ${i}: missing or invalid 'eventType' (string)`));
      }

      let sourceDomain: DomainName | undefined;
      if (t.sourceDomain !== undefined) {
        if (typeof t.sourceDomain !== 'string' || !ALL_DOMAINS.includes(t.sourceDomain as DomainName)) {
          return err(new Error(`Trigger at index ${i}: invalid 'sourceDomain' '${String(t.sourceDomain)}'`));
        }
        sourceDomain = t.sourceDomain as DomainName;
      }

      let condition: StepCondition | undefined;
      if (t.condition !== undefined) {
        const condResult = this.validateCondition(t.condition, `Trigger at index ${i}.condition`);
        if (!condResult.success) return condResult;
        condition = condResult.value;
      }

      const inputMapping = this.validateStringRecord(t.inputMapping, `Trigger at index ${i}.inputMapping`);
      if (inputMapping !== undefined && inputMapping instanceof Error) return err(inputMapping);

      triggers.push({
        eventType: t.eventType,
        ...(sourceDomain !== undefined && { sourceDomain }),
        ...(condition !== undefined && { condition }),
        ...(inputMapping !== undefined && { inputMapping: inputMapping as Record<string, string> }),
      });
    }

    return ok(triggers);
  }

  private validateRetry(
    raw: unknown,
    stepId: string,
  ): Result<NonNullable<WorkflowStepDefinition['retry']>, Error> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return err(new Error(`Step '${stepId}': 'retry' must be an object`));
    }
    const r = raw as Record<string, unknown>;

    if (typeof r.maxAttempts !== 'number' || r.maxAttempts < 1) {
      return err(new Error(`Step '${stepId}': retry.maxAttempts must be a positive integer`));
    }
    if (typeof r.backoffMs !== 'number' || r.backoffMs < 0) {
      return err(new Error(`Step '${stepId}': retry.backoffMs must be a non-negative number`));
    }

    return ok({
      maxAttempts: r.maxAttempts,
      backoffMs: r.backoffMs,
      ...(typeof r.backoffMultiplier === 'number' && { backoffMultiplier: r.backoffMultiplier }),
    });
  }

  private validateRollback(
    raw: unknown,
    stepId: string,
  ): Result<NonNullable<WorkflowStepDefinition['rollback']>, Error> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return err(new Error(`Step '${stepId}': 'rollback' must be an object`));
    }
    const r = raw as Record<string, unknown>;

    if (!r.domain || typeof r.domain !== 'string' || !ALL_DOMAINS.includes(r.domain as DomainName)) {
      return err(new Error(`Step '${stepId}': rollback.domain is invalid or missing`));
    }
    if (!r.action || typeof r.action !== 'string') {
      return err(new Error(`Step '${stepId}': rollback.action is required (string)`));
    }

    return ok({
      domain: r.domain as DomainName,
      action: r.action,
      ...(r.input !== undefined && typeof r.input === 'object' && { input: r.input as Record<string, unknown> }),
    });
  }

  private validateApproval(
    raw: unknown,
    stepId: string,
  ): Result<NonNullable<WorkflowStepDefinition['approval']>, Error> {
    // Simple boolean form: approval: true
    if (typeof raw === 'boolean') {
      return ok(raw);
    }

    // Object form: approval: { autoApproveAfter, message }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return err(new Error(`Step '${stepId}': 'approval' must be a boolean or object`));
    }

    const a = raw as Record<string, unknown>;
    const result: { autoApproveAfter?: number; message?: string } = {};

    if (a.autoApproveAfter !== undefined) {
      if (typeof a.autoApproveAfter !== 'number' || a.autoApproveAfter < 0) {
        return err(new Error(`Step '${stepId}': approval.autoApproveAfter must be a non-negative number`));
      }
      result.autoApproveAfter = a.autoApproveAfter;
    }

    if (a.message !== undefined) {
      if (typeof a.message !== 'string') {
        return err(new Error(`Step '${stepId}': approval.message must be a string`));
      }
      result.message = a.message;
    }

    return ok(result);
  }

  /** Validate that a value is Record<string, string>, undefined, or return an Error. */
  private validateStringRecord(
    value: unknown,
    label: string,
  ): Record<string, string> | Error | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
      return new Error(`${label}: must be an object with string values`);
    }

    const record = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(record)) {
      if (typeof v !== 'string') {
        return new Error(`${label}: value for key '${k}' must be a string, got ${typeof v}`);
      }
    }

    return record as Record<string, string>;
  }

  /** Resolve a dot-path variable (e.g. "foo.bar") from a variables map. */
  private resolveVarPath(
    vars: Record<string, unknown>,
    path: string,
  ): unknown {
    // Try direct key first (covers flat keys like "coverageGoal")
    if (path in vars) return vars[path];

    // Try dot-path traversal
    const parts = path.split('.');
    let current: unknown = vars;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /** Detect circular dependencies. Returns a cycle description or null. */
  private detectCircularDependencies(steps: WorkflowStepDefinition[]): string | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const visit = (stepId: string, path: string[]): string | null => {
      if (recursionStack.has(stepId)) return [...path, stepId].join(' -> ');
      if (visited.has(stepId)) return null;

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = steps.find((s) => s.id === stepId);
      if (step?.dependsOn) {
        for (const dep of step.dependsOn) {
          const result = visit(dep, [...path, stepId]);
          if (result) return result;
        }
      }

      recursionStack.delete(stepId);
      return null;
    };

    for (const step of steps) {
      const result = visit(step.id, []);
      if (result) return result;
    }

    return null;
  }
}
