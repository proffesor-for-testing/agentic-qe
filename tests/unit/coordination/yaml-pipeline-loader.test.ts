/**
 * Unit tests for YamlPipelineLoader and YamlPipelineRegistry (Imp-9)
 *
 * Tests YAML parsing, variable interpolation, schema validation,
 * file loading, and registry operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import { YamlPipelineLoader } from '../../../src/coordination/yaml-pipeline-loader.js';
import { YamlPipelineRegistry } from '../../../src/coordination/yaml-pipeline-registry.js';
import type {
  WorkflowDefinition,
  IWorkflowOrchestrator,
  WorkflowListItem,
  WorkflowExecutionStatus,
} from '../../../src/coordination/workflow-types.js';
import { Result, ok, err } from '../../../src/shared/types/index.js';

// ============================================================================
// Fixtures
// ============================================================================

const VALID_YAML = `
id: test-pipeline
name: Test QE Pipeline
description: A test pipeline for unit tests
version: "1.0.0"
tags: [quality, unit-test]

steps:
  - id: generate-tests
    name: Generate Unit Tests
    domain: test-generation
    action: generate
    inputMapping:
      target: "input.target"
    outputMapping:
      testsGenerated: "testCount"
    timeout: 60000
    continueOnFailure: false

  - id: analyze-coverage
    name: Analyze Coverage
    domain: coverage-analysis
    action: analyze
    dependsOn: [generate-tests]
    inputMapping:
      target: "input.target"
    condition:
      path: "results.generate-tests.testCount"
      operator: gt
      value: 0
    timeout: 30000

  - id: quality-gate
    name: Quality Gate Check
    domain: quality-assessment
    action: assess
    dependsOn: [analyze-coverage]

triggers:
  - eventType: "task.TestCompleted"
    inputMapping:
      target: "event.targetPath"
`;

const MINIMAL_YAML = `
id: minimal
name: Minimal Pipeline
steps:
  - id: step1
    name: Step One
    domain: test-generation
    action: generate
`;

const YAML_WITH_VARIABLES = `
id: var-pipeline
name: Variable Pipeline
description: Pipeline with \${coverageGoal}% coverage goal
version: "1.0.0"

steps:
  - id: quality-gate
    name: Quality Gate Check
    domain: quality-assessment
    action: assess
    condition:
      path: "results.coverage.lineCoverage"
      operator: gte
      value: \${coverageGoal}
    timeout: \${timeoutMs}
`;

const YAML_WITH_NESTED_VARIABLES = `
id: nested-var
name: Nested Var Pipeline
version: "1.0.0"

steps:
  - id: step1
    name: Step One
    domain: test-generation
    action: generate
    inputMapping:
      framework: "\${config.testFramework}"
      target: "\${config.paths.src}"
`;

// ============================================================================
// Mock Orchestrator
// ============================================================================

function createMockOrchestrator(): IWorkflowOrchestrator {
  const workflows = new Map<string, WorkflowDefinition>();

  return {
    async initialize(): Promise<void> { /* noop */ },
    async dispose(): Promise<void> { /* noop */ },

    registerWorkflow(definition: WorkflowDefinition): Result<void, Error> {
      if (workflows.has(definition.id)) {
        // Allow re-registration (overwrite)
      }
      workflows.set(definition.id, definition);
      return ok(undefined);
    },

    unregisterWorkflow(workflowId: string): Result<void, Error> {
      if (!workflows.has(workflowId)) {
        return err(new Error(`Workflow not found: ${workflowId}`));
      }
      workflows.delete(workflowId);
      return ok(undefined);
    },

    async executeWorkflow(
      workflowId: string,
      _input?: Record<string, unknown>,
      _correlationId?: string,
    ): Promise<Result<string, Error>> {
      if (!workflows.has(workflowId)) {
        return err(new Error(`Workflow not found: ${workflowId}`));
      }
      return ok('exec-123');
    },

    getWorkflowStatus(_executionId: string): WorkflowExecutionStatus | undefined {
      return undefined;
    },

    async cancelWorkflow(_executionId: string): Promise<Result<void, Error>> {
      return ok(undefined);
    },

    async pauseWorkflow(_executionId: string): Promise<Result<void, Error>> {
      return ok(undefined);
    },

    async resumeWorkflow(_executionId: string): Promise<Result<void, Error>> {
      return ok(undefined);
    },

    listWorkflows(): WorkflowListItem[] {
      return Array.from(workflows.values()).map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        version: w.version,
        stepCount: w.steps.length,
        tags: w.tags,
        triggers: w.triggers?.map((t) => t.eventType),
      }));
    },

    getActiveExecutions(): WorkflowExecutionStatus[] {
      return [];
    },

    getWorkflow(workflowId: string): WorkflowDefinition | undefined {
      return workflows.get(workflowId);
    },
  };
}

// ============================================================================
// YamlPipelineLoader Tests
// ============================================================================

describe('YamlPipelineLoader', () => {
  let loader: YamlPipelineLoader;

  beforeEach(() => {
    loader = new YamlPipelineLoader();
  });

  afterEach(() => {
    // Reset state to prevent leaks between tests
  });

  // --------------------------------------------------------------------------
  // Happy path: Valid YAML parsing
  // --------------------------------------------------------------------------

  describe('parse — happy path', () => {
    it('should parse valid YAML into a WorkflowDefinition', () => {
      const result = loader.parse(VALID_YAML);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const def = result.value;
      expect(def.id).toBe('test-pipeline');
      expect(def.name).toBe('Test QE Pipeline');
      expect(def.description).toBe('A test pipeline for unit tests');
      expect(def.version).toBe('1.0.0');
      expect(def.tags).toEqual(['quality', 'unit-test']);
      expect(def.steps).toHaveLength(3);
    });

    it('should parse step properties correctly', () => {
      const result = loader.parse(VALID_YAML);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const step0 = result.value.steps[0];
      expect(step0.id).toBe('generate-tests');
      expect(step0.domain).toBe('test-generation');
      expect(step0.action).toBe('generate');
      expect(step0.inputMapping).toEqual({ target: 'input.target' });
      expect(step0.outputMapping).toEqual({ testsGenerated: 'testCount' });
      expect(step0.timeout).toBe(60000);
      expect(step0.continueOnFailure).toBe(false);

      const step1 = result.value.steps[1];
      expect(step1.dependsOn).toEqual(['generate-tests']);
      expect(step1.condition).toEqual({
        path: 'results.generate-tests.testCount',
        operator: 'gt',
        value: 0,
      });
    });

    it('should parse triggers correctly', () => {
      const result = loader.parse(VALID_YAML);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value.triggers).toHaveLength(1);
      expect(result.value.triggers![0].eventType).toBe('task.TestCompleted');
      expect(result.value.triggers![0].inputMapping).toEqual({
        target: 'event.targetPath',
      });
    });

    it('should parse minimal YAML with defaults', () => {
      const result = loader.parse(MINIMAL_YAML);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const def = result.value;
      expect(def.id).toBe('minimal');
      expect(def.name).toBe('Minimal Pipeline');
      expect(def.description).toBe(''); // defaults to empty string
      expect(def.version).toBe('1.0.0'); // defaults to 1.0.0
      expect(def.steps).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Variable interpolation
  // --------------------------------------------------------------------------

  describe('variable interpolation', () => {
    it('should replace ${VAR} with provided values', () => {
      const result = loader.parse(YAML_WITH_VARIABLES, {
        coverageGoal: 80,
        timeoutMs: 30000,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const def = result.value;
      expect(def.description).toBe('Pipeline with 80% coverage goal');

      const step = def.steps[0];
      expect(step.condition?.value).toBe(80);
      expect(step.timeout).toBe(30000);
    });

    it('should support nested variable paths like ${config.testFramework}', () => {
      const result = loader.parse(YAML_WITH_NESTED_VARIABLES, {
        config: {
          testFramework: 'vitest',
          paths: { src: './src' },
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const step = result.value.steps[0];
      expect(step.inputMapping?.framework).toBe('vitest');
      expect(step.inputMapping?.target).toBe('./src');
    });

    it('should leave unresolved variables as-is', () => {
      const yaml = `
id: unresolved
name: Unresolved Vars
version: "1.0.0"
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
    inputMapping:
      val: "\${MISSING_VAR}"
`;
      const result = loader.parse(yaml, {});
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value.steps[0].inputMapping?.val).toBe('${MISSING_VAR}');
    });

    it('should interpolate using interpolateVariables method directly', () => {
      const template = 'coverage: ${goal}%, framework: ${fw}';
      const result = loader.interpolateVariables(template, { goal: 80, fw: 'vitest' });
      expect(result).toBe('coverage: 80%, framework: vitest');
    });
  });

  // --------------------------------------------------------------------------
  // Schema validation errors
  // --------------------------------------------------------------------------

  describe('validation errors', () => {
    it('should reject empty YAML', () => {
      const result = loader.parse('');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('YAML must parse to an object');
    });

    it('should reject YAML that parses to a scalar', () => {
      const result = loader.parse('just a string');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('YAML must parse to an object');
    });

    it('should reject missing id', () => {
      const yaml = `
name: No ID
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain("'id'");
    });

    it('should reject missing name', () => {
      const yaml = `
id: no-name
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain("'name'");
    });

    it('should reject empty steps array', () => {
      const yaml = `
id: empty-steps
name: Empty Steps
steps: []
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('non-empty array');
    });

    it('should reject missing steps', () => {
      const yaml = `
id: no-steps
name: No Steps
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('non-empty array');
    });

    it('should reject invalid domain', () => {
      const yaml = `
id: bad-domain
name: Bad Domain
steps:
  - id: s1
    name: Step
    domain: not-a-real-domain
    action: generate
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('invalid domain');
      expect(result.error.message).toContain('not-a-real-domain');
    });

    it('should reject duplicate step IDs', () => {
      const yaml = `
id: dup-steps
name: Dup Steps
steps:
  - id: s1
    name: Step One
    domain: test-generation
    action: generate
  - id: s1
    name: Step Two
    domain: coverage-analysis
    action: analyze
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('Duplicate step ID');
    });

    it('should reject unknown dependency', () => {
      const yaml = `
id: bad-dep
name: Bad Dep
steps:
  - id: s1
    name: Step One
    domain: test-generation
    action: generate
    dependsOn: [nonexistent]
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('unknown step');
      expect(result.error.message).toContain('nonexistent');
    });

    it('should detect circular dependencies', () => {
      const yaml = `
id: circular
name: Circular
steps:
  - id: a
    name: Step A
    domain: test-generation
    action: generate
    dependsOn: [b]
  - id: b
    name: Step B
    domain: coverage-analysis
    action: analyze
    dependsOn: [a]
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('Circular dependency');
    });

    it('should reject invalid condition operator', () => {
      const yaml = `
id: bad-op
name: Bad Op
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
    condition:
      path: "results.x"
      operator: banana
      value: 1
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('invalid operator');
      expect(result.error.message).toContain('banana');
    });

    it('should reject step missing action', () => {
      const yaml = `
id: no-action
name: No Action
steps:
  - id: s1
    name: Step
    domain: test-generation
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain("'action'");
    });

    it('should reject invalid defaultMode', () => {
      const yaml = `
id: bad-mode
name: Bad Mode
defaultMode: invalid
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('defaultMode');
    });

    it('should reject invalid trigger without eventType', () => {
      const yaml = `
id: bad-trigger
name: Bad Trigger
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
triggers:
  - inputMapping:
      target: "event.path"
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('eventType');
    });
  });

  // --------------------------------------------------------------------------
  // validateSchema method
  // --------------------------------------------------------------------------

  describe('validateSchema', () => {
    it('should validate a correct parsed object', () => {
      const parsed = {
        id: 'test',
        name: 'Test',
        steps: [
          { id: 's1', name: 'Step', domain: 'test-generation', action: 'gen' },
        ],
      };

      const result = loader.validateSchema(parsed);
      expect(result.success).toBe(true);
    });

    it('should reject null', () => {
      const result = loader.validateSchema(null);
      expect(result.success).toBe(false);
    });

    it('should reject an array', () => {
      const result = loader.validateSchema([1, 2, 3]);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // File loading (mock fs)
  // --------------------------------------------------------------------------

  describe('loadFromFile', () => {
    it('should return an error for non-existent files', async () => {
      const result = await loader.loadFromFile('/nonexistent/path.yaml');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('Failed to read pipeline file');
    });
  });

  // --------------------------------------------------------------------------
  // Retry config validation
  // --------------------------------------------------------------------------

  describe('retry config', () => {
    it('should parse valid retry config', () => {
      const yaml = `
id: retry-test
name: Retry Test
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
    retry:
      maxAttempts: 3
      backoffMs: 1000
      backoffMultiplier: 2
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value.steps[0].retry).toEqual({
        maxAttempts: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
      });
    });

    it('should reject retry with invalid maxAttempts', () => {
      const yaml = `
id: bad-retry
name: Bad Retry
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
    retry:
      maxAttempts: 0
      backoffMs: 1000
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('maxAttempts');
    });
  });

  // --------------------------------------------------------------------------
  // Rollback config validation
  // --------------------------------------------------------------------------

  describe('rollback config', () => {
    it('should parse valid rollback config', () => {
      const yaml = `
id: rollback-test
name: Rollback Test
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
    rollback:
      domain: test-generation
      action: cleanup
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value.steps[0].rollback).toEqual({
        domain: 'test-generation',
        action: 'cleanup',
      });
    });

    it('should reject rollback with invalid domain', () => {
      const yaml = `
id: bad-rollback
name: Bad Rollback
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
    rollback:
      domain: fake-domain
      action: cleanup
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.message).toContain('rollback.domain');
    });
  });

  // --------------------------------------------------------------------------
  // Trigger with condition and sourceDomain
  // --------------------------------------------------------------------------

  describe('triggers with conditions', () => {
    it('should parse trigger with condition and sourceDomain', () => {
      const yaml = `
id: trigger-cond
name: Trigger Cond
steps:
  - id: s1
    name: Step
    domain: test-generation
    action: generate
triggers:
  - eventType: "quality-assessment.QualityGateEvaluated"
    sourceDomain: quality-assessment
    condition:
      path: "event.passed"
      operator: eq
      value: true
    inputMapping:
      score: "event.score"
`;
      const result = loader.parse(yaml);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const trigger = result.value.triggers![0];
      expect(trigger.eventType).toBe('quality-assessment.QualityGateEvaluated');
      expect(trigger.sourceDomain).toBe('quality-assessment');
      expect(trigger.condition).toEqual({
        path: 'event.passed',
        operator: 'eq',
        value: true,
      });
      expect(trigger.inputMapping).toEqual({ score: 'event.score' });
    });
  });
});

// ============================================================================
// YamlPipelineRegistry Tests
// ============================================================================

describe('YamlPipelineRegistry', () => {
  let registry: YamlPipelineRegistry;
  let orchestrator: IWorkflowOrchestrator;

  beforeEach(() => {
    registry = new YamlPipelineRegistry();
    orchestrator = createMockOrchestrator();
  });

  describe('registerPipeline', () => {
    it('should register a valid YAML pipeline', () => {
      const result = registry.registerPipeline(orchestrator, VALID_YAML);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value.id).toBe('test-pipeline');
      expect(result.value.steps).toHaveLength(3);

      // Verify it was registered with the orchestrator
      const listed = orchestrator.listWorkflows();
      expect(listed.some((w) => w.id === 'test-pipeline')).toBe(true);
    });

    it('should apply variable interpolation during registration', () => {
      const result = registry.registerPipeline(
        orchestrator,
        YAML_WITH_VARIABLES,
        { coverageGoal: 90, timeoutMs: 45000 },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.value.steps[0].condition?.value).toBe(90);
      expect(result.value.steps[0].timeout).toBe(45000);
    });

    it('should return error for invalid YAML', () => {
      const result = registry.registerPipeline(orchestrator, 'id: test\nsteps: []');
      expect(result.success).toBe(false);
    });
  });

  describe('loadAllPipelines', () => {
    it('should return empty result for non-existent directory', async () => {
      const result = await registry.loadAllPipelines(
        orchestrator,
        '/nonexistent/dir',
      );

      expect(result.loaded).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getLoader', () => {
    it('should return the loader instance', () => {
      const loader = registry.getLoader();
      expect(loader).toBeInstanceOf(YamlPipelineLoader);
    });
  });

  describe('getLoadedPipelines', () => {
    it('should return an empty map initially', () => {
      const loaded = registry.getLoadedPipelines();
      expect(loaded.size).toBe(0);
    });
  });
});
