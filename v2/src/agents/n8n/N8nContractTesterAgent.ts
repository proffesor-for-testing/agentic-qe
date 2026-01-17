/**
 * N8nContractTesterAgent
 *
 * Data-shape and schema contract testing for n8n workflows:
 * - JSON schema validation at node boundaries
 * - Data shape drift detection between nodes
 * - Optional field handling validation
 * - Array vs object type checking
 * - Pagination response validation
 * - Empty result handling
 * - Type coercion detection
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
  N8nNodeRunData,
} from './types';
import { QETask, AgentCapability } from '../../types';
import {
  N8nTestHarness,
  TestWorkflowResult,
} from './N8nTestHarness';

// ============================================================================
// Types
// ============================================================================

export interface ContractTestTask extends QETask {
  type: 'contract-test';
  target: string; // workflowId
  options?: {
    schemas?: Record<string, JsonSchema>; // Node name -> expected schema
    strictMode?: boolean; // Fail on any schema mismatch
    checkNullability?: boolean; // Check for unexpected null/undefined
    checkArrayConsistency?: boolean; // Ensure arrays have consistent item types
    inferSchemas?: boolean; // Auto-infer schemas from execution data
    // NEW: Schema persistence options
    persistSchemas?: boolean; // Store inferred schemas as baseline
    detectDrift?: boolean; // Compare against baseline schemas
    schemaVersion?: string; // Version tag for schema snapshots
    externalSchemaPath?: string; // Path to external JSON Schema file
    allowedDriftTypes?: DriftType[]; // Which drift types to allow
  };
}

/**
 * Types of schema drift that can occur
 */
export type DriftType =
  | 'field-added'
  | 'field-removed'
  | 'type-changed'
  | 'required-changed'
  | 'nullable-changed'
  | 'enum-changed';

export interface JsonSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  nullable?: boolean;
  enum?: unknown[];
  minItems?: number;
  maxItems?: number;
  pattern?: string;
}

export interface ContractTestResult {
  workflowId: string;
  workflowName: string;
  testDate: string;
  passed: boolean;
  score: number;
  nodeContracts: NodeContractResult[];
  boundaryTests: BoundaryTestResult[];
  schemaViolations: SchemaViolation[];
  inferredSchemas?: Record<string, JsonSchema>;
  recommendations: string[];
  // NEW: Drift detection results
  driftAnalysis?: DriftAnalysis;
  schemasPersisted?: boolean;
  schemaVersion?: string;
}

/**
 * Schema drift analysis result
 */
export interface DriftAnalysis {
  hasDrift: boolean;
  baselineVersion: string;
  currentVersion: string;
  baselineDate: string;
  drifts: SchemaDrift[];
  breakingChanges: SchemaDrift[];
  summary: string;
}

/**
 * Individual schema drift detection
 */
export interface SchemaDrift {
  nodeName: string;
  fieldPath: string;
  driftType: DriftType;
  baselineValue: unknown;
  currentValue: unknown;
  isBreaking: boolean;
  message: string;
  suggestion: string;
}

/**
 * Persisted schema snapshot
 */
export interface SchemaSnapshot {
  workflowId: string;
  workflowName: string;
  version: string;
  timestamp: string;
  schemas: Record<string, JsonSchema>;
  nodeCount: number;
  checksum: string;
}

export interface NodeContractResult {
  nodeName: string;
  nodeType: string;
  inputSchema: JsonSchema | null;
  outputSchema: JsonSchema | null;
  inputValid: boolean;
  outputValid: boolean;
  issues: string[];
}

export interface BoundaryTestResult {
  sourceNode: string;
  targetNode: string;
  compatible: boolean;
  issues: SchemaViolation[];
}

export interface SchemaViolation {
  node: string;
  field: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

// ============================================================================
// Common Data Patterns for n8n
// ============================================================================

const COMMON_PATTERNS = {
  // Pagination patterns
  pagination: {
    type: 'object' as const,
    properties: {
      data: { type: 'array' as const, items: { type: 'object' as const } },
      meta: {
        type: 'object' as const,
        properties: {
          total: { type: 'number' as const },
          page: { type: 'number' as const },
          limit: { type: 'number' as const },
          hasMore: { type: 'boolean' as const },
        },
      },
    },
  },

  // Empty result patterns
  emptyArray: { type: 'array' as const, items: { type: 'object' as const }, minItems: 0, maxItems: 0 },
  emptyObject: { type: 'object' as const, properties: {} },

  // Common API response patterns
  apiResponse: {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' as const },
      data: { type: 'object' as const },
      error: { type: 'object' as const, nullable: true },
    },
  },
};

// ============================================================================
// Agent Implementation
// ============================================================================

export class N8nContractTesterAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'schema-validation',
        version: '1.0.0',
        description: 'Validate JSON schemas at node boundaries',
        parameters: {},
      },
      {
        name: 'data-shape-detection',
        version: '1.0.0',
        description: 'Detect data shape drift between nodes',
        parameters: {},
      },
      {
        name: 'contract-inference',
        version: '1.0.0',
        description: 'Infer schemas from execution data',
        parameters: {},
      },
      {
        name: 'boundary-testing',
        version: '1.0.0',
        description: 'Test data compatibility at node boundaries',
        parameters: {},
      },
      {
        name: 'schema-persistence',
        version: '1.0.0',
        description: 'Persist schema snapshots for drift detection',
        parameters: {},
      },
      {
        name: 'drift-detection',
        version: '1.0.0',
        description: 'Detect schema drift against baseline',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-contract-tester' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<ContractTestResult> {
    const contractTask = task as ContractTestTask;

    if (contractTask.type !== 'contract-test') {
      throw new Error(`Unsupported task type: ${contractTask.type}`);
    }

    return this.testContracts(contractTask.target, contractTask.options);
  }

  /**
   * Run contract tests on a workflow
   */
  async testContracts(
    workflowId: string,
    options?: ContractTestTask['options'],
    providedWorkflow?: N8nWorkflow
  ): Promise<ContractTestResult> {
    const workflow = providedWorkflow || await this.getWorkflow(workflowId);
    const violations: SchemaViolation[] = [];
    const nodeContracts: NodeContractResult[] = [];
    const boundaryTests: BoundaryTestResult[] = [];
    const recommendations: string[] = [];

    // Get recent executions to analyze actual data shapes
    // Only fetch executions if we need to infer schemas and no workflow was provided
    let executions: N8nExecution[] = [];
    if (options?.inferSchemas && !providedWorkflow) {
      try {
        executions = await this.n8nClient.listExecutions({ workflowId, limit: 10 });
      } catch {
        recommendations.push('No execution data available - run the workflow to enable data shape analysis');
      }
    }

    // Infer schemas from execution data if requested
    let inferredSchemas: Record<string, JsonSchema> = {};
    if (options?.inferSchemas && executions.length > 0) {
      inferredSchemas = this.inferSchemasFromExecutions(executions);
    }

    // Combine provided schemas with inferred ones
    const schemas = { ...inferredSchemas, ...(options?.schemas || {}) };

    // Test each node's contract
    for (const node of workflow.nodes) {
      const nodeResult = await this.testNodeContract(
        node,
        workflow,
        executions,
        schemas[node.name],
        options
      );
      nodeContracts.push(nodeResult);
      violations.push(...nodeResult.issues.map(issue => ({
        node: node.name,
        field: '',
        expected: '',
        actual: '',
        severity: 'warning' as const,
        message: issue,
      })));
    }

    // Test boundaries between connected nodes
    for (const [sourceName, connections] of Object.entries(workflow.connections)) {
      if (connections.main) {
        for (const output of connections.main) {
          for (const conn of output) {
            const boundaryResult = this.testBoundary(
              sourceName,
              conn.node,
              nodeContracts,
              executions,
              options
            );
            boundaryTests.push(boundaryResult);
            violations.push(...boundaryResult.issues);
          }
        }
      }
    }

    // Check for common n8n data problems
    violations.push(...this.checkCommonDataProblems(workflow, executions, options));

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(violations, nodeContracts, boundaryTests));

    // NEW: Drift detection against baseline
    let driftAnalysis: DriftAnalysis | undefined;
    if (options?.detectDrift && Object.keys(schemas).length > 0) {
      driftAnalysis = await this.detectSchemaDrift(
        workflowId,
        schemas,
        options.schemaVersion || 'current',
        options.allowedDriftTypes
      );

      // Add drift violations
      for (const drift of driftAnalysis.drifts) {
        violations.push({
          node: drift.nodeName,
          field: drift.fieldPath,
          expected: String(drift.baselineValue),
          actual: String(drift.currentValue),
          severity: drift.isBreaking ? 'error' : 'warning',
          message: drift.message,
          suggestion: drift.suggestion,
        });
      }
    }

    // NEW: Persist schemas if requested
    let schemasPersisted = false;
    if (options?.persistSchemas && Object.keys(schemas).length > 0) {
      await this.persistSchemaSnapshot(
        workflowId,
        workflow.name,
        schemas,
        options.schemaVersion || 'latest'
      );
      schemasPersisted = true;
    }

    // Calculate score
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const score = Math.max(0, 100 - (errorCount * 15) - (warningCount * 5));

    const result: ContractTestResult = {
      workflowId: workflow.id || workflowId,
      workflowName: workflow.name,
      testDate: new Date().toISOString(),
      passed: errorCount === 0,
      score,
      nodeContracts,
      boundaryTests,
      schemaViolations: violations,
      inferredSchemas: options?.inferSchemas ? inferredSchemas : undefined,
      recommendations,
      driftAnalysis,
      schemasPersisted,
      schemaVersion: options?.schemaVersion,
    };

    // Store result
    await this.storeTestResult(`contract-test:${workflowId}`, result);

    // Emit event
    this.emitEvent('contract.test.completed', {
      workflowId,
      passed: result.passed,
      score: result.score,
      violations: violations.length,
    });

    return result;
  }

  /**
   * Test a single node's contract
   */
  private async testNodeContract(
    node: N8nNode,
    workflow: N8nWorkflow,
    executions: N8nExecution[],
    expectedSchema: JsonSchema | undefined,
    options?: ContractTestTask['options']
  ): Promise<NodeContractResult> {
    const issues: string[] = [];

    // Infer input/output schemas from execution data
    let inputSchema: JsonSchema | null = null;
    let outputSchema: JsonSchema | null = null;

    for (const execution of executions) {
      const runData = execution.data?.resultData?.runData?.[node.name];
      if (runData && runData[0]) {
        const nodeRun = runData[0];

        // Extract output schema
        if (nodeRun.data?.main?.[0]?.[0]) {
          const outputData = nodeRun.data.main[0][0].json;
          outputSchema = this.inferSchema(outputData);
        }

        // Get input from source nodes
        if (nodeRun.source?.[0]) {
          const sourceName = nodeRun.source[0].previousNode;
          const sourceRun = execution.data?.resultData?.runData?.[sourceName];
          if (sourceRun?.[0]?.data?.main?.[0]?.[0]) {
            const inputData = sourceRun[0].data.main[0][0].json;
            inputSchema = this.inferSchema(inputData);
          }
        }
        break;
      }
    }

    // Validate against expected schema if provided
    if (expectedSchema && outputSchema) {
      const schemaIssues = this.compareSchemas(expectedSchema, outputSchema, node.name);
      issues.push(...schemaIssues);
    }

    // Check for common issues
    if (outputSchema) {
      // Check for inconsistent array items
      if (options?.checkArrayConsistency) {
        const arrayIssues = this.checkArrayConsistency(outputSchema, node.name);
        issues.push(...arrayIssues);
      }

      // Check for unexpected nulls
      if (options?.checkNullability) {
        const nullIssues = this.checkNullability(outputSchema, node.name);
        issues.push(...nullIssues);
      }
    }

    return {
      nodeName: node.name,
      nodeType: node.type,
      inputSchema,
      outputSchema,
      inputValid: issues.length === 0,
      outputValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Test boundary between two connected nodes
   */
  private testBoundary(
    sourceName: string,
    targetName: string,
    nodeContracts: NodeContractResult[],
    executions: N8nExecution[],
    options?: ContractTestTask['options']
  ): BoundaryTestResult {
    const issues: SchemaViolation[] = [];

    const sourceContract = nodeContracts.find(nc => nc.nodeName === sourceName);
    const targetContract = nodeContracts.find(nc => nc.nodeName === targetName);

    if (!sourceContract?.outputSchema || !targetContract?.inputSchema) {
      return {
        sourceNode: sourceName,
        targetNode: targetName,
        compatible: true, // Can't determine without schemas
        issues: [],
      };
    }

    // Check if output schema is compatible with input schema
    const sourceOutput = sourceContract.outputSchema;
    const targetExpected = targetContract.inputSchema;

    // Check type compatibility
    if (sourceOutput.type !== targetExpected.type) {
      issues.push({
        node: targetName,
        field: 'input',
        expected: targetExpected.type,
        actual: sourceOutput.type,
        severity: 'error',
        message: `Type mismatch: ${sourceName} outputs ${sourceOutput.type} but ${targetName} expects ${targetExpected.type}`,
        suggestion: 'Add a Set node to transform the data type',
      });
    }

    // Check required fields
    if (targetExpected.required && sourceOutput.properties) {
      for (const required of targetExpected.required) {
        if (!sourceOutput.properties[required]) {
          issues.push({
            node: targetName,
            field: required,
            expected: 'present',
            actual: 'missing',
            severity: 'error',
            message: `Required field "${required}" missing from ${sourceName} output`,
            suggestion: `Add "${required}" field in ${sourceName} or use Set node to add it`,
          });
        }
      }
    }

    return {
      sourceNode: sourceName,
      targetNode: targetName,
      compatible: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  }

  /**
   * Check for common n8n data problems
   */
  private checkCommonDataProblems(
    workflow: N8nWorkflow,
    executions: N8nExecution[],
    options?: ContractTestTask['options']
  ): SchemaViolation[] {
    const violations: SchemaViolation[] = [];

    for (const execution of executions) {
      const runData = execution.data?.resultData?.runData;
      if (!runData) continue;

      for (const [nodeName, nodeRuns] of Object.entries(runData)) {
        const run = nodeRuns[0];
        if (!run?.data?.main?.[0]) continue;

        for (const item of run.data.main[0]) {
          const data = item.json;

          // Check for empty results that might break downstream nodes
          if (data === null || data === undefined) {
            violations.push({
              node: nodeName,
              field: 'output',
              expected: 'data',
              actual: 'null/undefined',
              severity: 'warning',
              message: `Node "${nodeName}" produced null/undefined output`,
              suggestion: 'Add IF node to handle empty results',
            });
          }

          // Check for arrays that might be empty
          if (Array.isArray(data) && data.length === 0) {
            violations.push({
              node: nodeName,
              field: 'output',
              expected: 'non-empty array',
              actual: 'empty array',
              severity: 'info',
              message: `Node "${nodeName}" produced empty array - ensure downstream nodes handle this`,
            });
          }

          // Check for pagination that might not be handled
          if (data && typeof data === 'object') {
            const objData = data as Record<string, unknown>;
            if ('nextPage' in objData || 'hasMore' in objData || 'cursor' in objData) {
              violations.push({
                node: nodeName,
                field: 'pagination',
                expected: 'handled',
                actual: 'detected',
                severity: 'warning',
                message: `Node "${nodeName}" has pagination fields - ensure all pages are fetched`,
                suggestion: 'Use Loop Over Items or pagination settings if available',
              });
            }
          }
        }
      }
    }

    return violations;
  }

  /**
   * Infer JSON schema from data
   */
  private inferSchema(data: unknown): JsonSchema {
    if (data === null) {
      return { type: 'null' };
    }

    if (Array.isArray(data)) {
      const itemSchemas = data.slice(0, 10).map(item => this.inferSchema(item));
      const mergedItemSchema = itemSchemas.length > 0
        ? this.mergeSchemas(itemSchemas)
        : { type: 'object' as const };

      return {
        type: 'array',
        items: mergedItemSchema,
        minItems: data.length,
        maxItems: data.length,
      };
    }

    if (typeof data === 'object') {
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        properties[key] = this.inferSchema(value);
        if (value !== null && value !== undefined) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required,
      };
    }

    if (typeof data === 'string') {
      return { type: 'string' };
    }

    if (typeof data === 'number') {
      return { type: 'number' };
    }

    if (typeof data === 'boolean') {
      return { type: 'boolean' };
    }

    return { type: 'object' };
  }

  /**
   * Merge multiple schemas into one
   */
  private mergeSchemas(schemas: JsonSchema[]): JsonSchema {
    if (schemas.length === 0) return { type: 'object' };
    if (schemas.length === 1) return schemas[0];

    // For simplicity, use first schema as base and mark fields as nullable if not in all
    const base = { ...schemas[0] };

    if (base.type === 'object' && base.properties) {
      const allKeys = new Set<string>();
      const keyPresence: Record<string, number> = {};

      for (const schema of schemas) {
        if (schema.properties) {
          for (const key of Object.keys(schema.properties)) {
            allKeys.add(key);
            keyPresence[key] = (keyPresence[key] || 0) + 1;
          }
        }
      }

      // Mark fields as nullable if not present in all schemas
      for (const key of allKeys) {
        if (keyPresence[key] < schemas.length) {
          if (base.properties![key]) {
            base.properties![key] = { ...base.properties![key], nullable: true };
          }
        }
      }

      // Only require fields present in ALL schemas
      base.required = Array.from(allKeys).filter(key => keyPresence[key] === schemas.length);
    }

    return base;
  }

  /**
   * Compare expected vs actual schema
   */
  private compareSchemas(expected: JsonSchema, actual: JsonSchema, nodeName: string): string[] {
    const issues: string[] = [];

    if (expected.type !== actual.type) {
      issues.push(`Type mismatch: expected ${expected.type}, got ${actual.type}`);
    }

    if (expected.type === 'object' && expected.properties && actual.properties) {
      // Check required fields
      for (const required of expected.required || []) {
        if (!actual.properties[required]) {
          issues.push(`Missing required field: ${required}`);
        }
      }

      // Check for extra fields (if strict)
      if (expected.additionalProperties === false) {
        for (const key of Object.keys(actual.properties)) {
          if (!expected.properties[key]) {
            issues.push(`Unexpected field: ${key}`);
          }
        }
      }
    }

    return issues;
  }

  /**
   * Check array item consistency
   */
  private checkArrayConsistency(schema: JsonSchema, nodeName: string): string[] {
    const issues: string[] = [];

    if (schema.type === 'array' && schema.items?.type === 'object' && schema.items.properties) {
      // Check if all required fields are consistently present
      const requiredFields = schema.items.required || [];
      for (const field of requiredFields) {
        if (schema.items.properties[field]?.nullable) {
          issues.push(`Array items have inconsistent field "${field}" - sometimes null/missing`);
        }
      }
    }

    return issues;
  }

  /**
   * Check for unexpected nullability
   */
  private checkNullability(schema: JsonSchema, nodeName: string): string[] {
    const issues: string[] = [];

    if (schema.type === 'object' && schema.properties) {
      for (const [field, fieldSchema] of Object.entries(schema.properties)) {
        if (fieldSchema.nullable && !fieldSchema.type.includes('null')) {
          issues.push(`Field "${field}" can be null but is not marked as nullable in schema`);
        }
      }
    }

    return issues;
  }

  /**
   * Infer schemas from multiple executions
   */
  private inferSchemasFromExecutions(executions: N8nExecution[]): Record<string, JsonSchema> {
    const schemas: Record<string, JsonSchema[]> = {};

    for (const execution of executions) {
      const runData = execution.data?.resultData?.runData;
      if (!runData) continue;

      for (const [nodeName, nodeRuns] of Object.entries(runData)) {
        const run = nodeRuns[0];
        if (run?.data?.main?.[0]?.[0]) {
          const data = run.data.main[0][0].json;
          const schema = this.inferSchema(data);

          if (!schemas[nodeName]) {
            schemas[nodeName] = [];
          }
          schemas[nodeName].push(schema);
        }
      }
    }

    // Merge schemas for each node
    const mergedSchemas: Record<string, JsonSchema> = {};
    for (const [nodeName, nodeSchemas] of Object.entries(schemas)) {
      mergedSchemas[nodeName] = this.mergeSchemas(nodeSchemas);
    }

    return mergedSchemas;
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(
    violations: SchemaViolation[],
    nodeContracts: NodeContractResult[],
    boundaryTests: BoundaryTestResult[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for nodes without schemas
    const noSchemaNodes = nodeContracts.filter(nc => !nc.outputSchema);
    if (noSchemaNodes.length > 0) {
      recommendations.push(
        `${noSchemaNodes.length} nodes have no schema data - execute the workflow to collect data shapes`
      );
    }

    // Check for boundary issues
    const boundaryIssues = boundaryTests.filter(bt => !bt.compatible);
    if (boundaryIssues.length > 0) {
      recommendations.push(
        `${boundaryIssues.length} node boundaries have compatibility issues - add Set nodes to transform data`
      );
    }

    // Check for pagination issues
    const paginationIssues = violations.filter(v => v.field === 'pagination');
    if (paginationIssues.length > 0) {
      recommendations.push(
        'Pagination detected - ensure all pages are fetched using Loop Over Items or API pagination settings'
      );
    }

    // Check for null/empty handling
    const nullIssues = violations.filter(v => v.actual.includes('null') || v.actual.includes('empty'));
    if (nullIssues.length > 0) {
      recommendations.push(
        'Empty/null results detected - add IF nodes to handle these cases gracefully'
      );
    }

    return recommendations;
  }

  /**
   * Quick contract check for a workflow
   */
  async quickCheck(workflowId: string): Promise<{
    compatible: boolean;
    boundaryIssues: number;
    schemaViolations: number;
    topIssue: string | null;
  }> {
    const result = await this.testContracts(workflowId, {
      inferSchemas: true,
      checkArrayConsistency: true,
    });

    return {
      compatible: result.passed,
      boundaryIssues: result.boundaryTests.filter(bt => !bt.compatible).length,
      schemaViolations: result.schemaViolations.length,
      topIssue: result.schemaViolations[0]?.message || null,
    };
  }

  // ============================================================================
  // Schema Persistence & Drift Detection
  // ============================================================================

  /**
   * Persist a schema snapshot as baseline
   */
  async persistSchemaSnapshot(
    workflowId: string,
    workflowName: string,
    schemas: Record<string, JsonSchema>,
    version: string
  ): Promise<SchemaSnapshot> {
    const snapshot: SchemaSnapshot = {
      workflowId,
      workflowName,
      version,
      timestamp: new Date().toISOString(),
      schemas,
      nodeCount: Object.keys(schemas).length,
      checksum: this.calculateSchemaChecksum(schemas),
    };

    // Store snapshot in memory (using agent's memory store)
    const key = `schema-snapshot:${workflowId}:${version}`;
    await this.storeTestResult(key, snapshot);

    // Also store as 'latest' if version is not 'latest'
    if (version !== 'latest') {
      await this.storeTestResult(`schema-snapshot:${workflowId}:latest`, snapshot);
    }

    // Emit event
    this.emitEvent('schema.snapshot.persisted', {
      workflowId,
      version,
      nodeCount: snapshot.nodeCount,
      checksum: snapshot.checksum,
    });

    return snapshot;
  }

  /**
   * Load a persisted schema snapshot
   */
  async loadSchemaSnapshot(
    workflowId: string,
    version: string = 'latest'
  ): Promise<SchemaSnapshot | null> {
    const key = `schema-snapshot:${workflowId}:${version}`;
    try {
      // Note: storeTestResult is available, but retrieval would need memory store integration
      // For now, return null - full persistence requires memory store setup
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect schema drift against baseline
   */
  async detectSchemaDrift(
    workflowId: string,
    currentSchemas: Record<string, JsonSchema>,
    currentVersion: string,
    allowedDriftTypes?: DriftType[]
  ): Promise<DriftAnalysis> {
    // Load baseline snapshot
    const baseline = await this.loadSchemaSnapshot(workflowId, 'latest');

    if (!baseline) {
      return {
        hasDrift: false,
        baselineVersion: 'none',
        currentVersion,
        baselineDate: '',
        drifts: [],
        breakingChanges: [],
        summary: 'No baseline schema found - consider persisting current schemas as baseline',
      };
    }

    const drifts: SchemaDrift[] = [];
    const allNodes = new Set([
      ...Object.keys(baseline.schemas),
      ...Object.keys(currentSchemas),
    ]);

    // Compare each node's schema
    for (const nodeName of allNodes) {
      const baselineSchema = baseline.schemas[nodeName];
      const currentSchema = currentSchemas[nodeName];

      // Node removed
      if (baselineSchema && !currentSchema) {
        drifts.push({
          nodeName,
          fieldPath: '',
          driftType: 'field-removed',
          baselineValue: baselineSchema,
          currentValue: null,
          isBreaking: true,
          message: `Node "${nodeName}" was removed from workflow`,
          suggestion: 'Verify this node removal is intentional',
        });
        continue;
      }

      // Node added
      if (!baselineSchema && currentSchema) {
        drifts.push({
          nodeName,
          fieldPath: '',
          driftType: 'field-added',
          baselineValue: null,
          currentValue: currentSchema,
          isBreaking: false,
          message: `Node "${nodeName}" was added to workflow`,
          suggestion: 'Update baseline schema if this is intentional',
        });
        continue;
      }

      // Compare schemas
      if (baselineSchema && currentSchema) {
        const nodeDrifts = this.compareSchemasForDrift(
          nodeName,
          baselineSchema,
          currentSchema,
          ''
        );
        drifts.push(...nodeDrifts);
      }
    }

    // Filter out allowed drift types
    const filteredDrifts = allowedDriftTypes
      ? drifts.filter(d => !allowedDriftTypes.includes(d.driftType))
      : drifts;

    const breakingChanges = filteredDrifts.filter(d => d.isBreaking);

    // Generate summary
    const summary = this.generateDriftSummary(filteredDrifts, breakingChanges, baseline);

    const analysis: DriftAnalysis = {
      hasDrift: filteredDrifts.length > 0,
      baselineVersion: baseline.version,
      currentVersion,
      baselineDate: baseline.timestamp,
      drifts: filteredDrifts,
      breakingChanges,
      summary,
    };

    // Emit event
    this.emitEvent('schema.drift.detected', {
      workflowId,
      hasDrift: analysis.hasDrift,
      driftCount: filteredDrifts.length,
      breakingCount: breakingChanges.length,
    });

    return analysis;
  }

  /**
   * Compare two schemas recursively for drift
   */
  private compareSchemasForDrift(
    nodeName: string,
    baseline: JsonSchema,
    current: JsonSchema,
    path: string
  ): SchemaDrift[] {
    const drifts: SchemaDrift[] = [];
    const fieldPath = path || 'root';

    // Type changed
    if (baseline.type !== current.type) {
      drifts.push({
        nodeName,
        fieldPath,
        driftType: 'type-changed',
        baselineValue: baseline.type,
        currentValue: current.type,
        isBreaking: true,
        message: `Type changed from "${baseline.type}" to "${current.type}" at ${fieldPath}`,
        suggestion: 'This is a breaking change - verify consumers can handle new type',
      });
      return drifts; // Type change is fundamental, skip further comparison
    }

    // Nullable changed
    if (baseline.nullable !== current.nullable) {
      drifts.push({
        nodeName,
        fieldPath,
        driftType: 'nullable-changed',
        baselineValue: baseline.nullable,
        currentValue: current.nullable,
        isBreaking: !current.nullable && baseline.nullable === true,
        message: `Nullable changed from ${baseline.nullable} to ${current.nullable} at ${fieldPath}`,
        suggestion: current.nullable
          ? 'Add null handling in consumers'
          : 'Verify consumers don\'t expect nulls',
      });
    }

    // Compare object properties
    if (baseline.type === 'object' && baseline.properties && current.properties) {
      const allKeys = new Set([
        ...Object.keys(baseline.properties),
        ...Object.keys(current.properties),
      ]);

      for (const key of allKeys) {
        const baselineProp = baseline.properties[key];
        const currentProp = current.properties[key];
        const propPath = path ? `${path}.${key}` : key;

        // Field removed
        if (baselineProp && !currentProp) {
          const wasRequired = baseline.required?.includes(key) ?? false;
          drifts.push({
            nodeName,
            fieldPath: propPath,
            driftType: 'field-removed',
            baselineValue: baselineProp,
            currentValue: null,
            isBreaking: wasRequired,
            message: `Field "${key}" was removed at ${propPath}`,
            suggestion: wasRequired
              ? 'Breaking: Required field removed - update consumers'
              : 'Non-breaking: Optional field removed',
          });
          continue;
        }

        // Field added
        if (!baselineProp && currentProp) {
          drifts.push({
            nodeName,
            fieldPath: propPath,
            driftType: 'field-added',
            baselineValue: null,
            currentValue: currentProp,
            isBreaking: false, // Adding fields is backward compatible
            message: `Field "${key}" was added at ${propPath}`,
            suggestion: 'Non-breaking: New field added',
          });
          continue;
        }

        // Recursively compare
        if (baselineProp && currentProp) {
          drifts.push(...this.compareSchemasForDrift(nodeName, baselineProp, currentProp, propPath));
        }
      }

      // Check required fields drift
      const baselineRequired = new Set(baseline.required || []);
      const currentRequired = new Set(current.required || []);

      // New required fields (breaking)
      for (const key of currentRequired) {
        if (!baselineRequired.has(key)) {
          drifts.push({
            nodeName,
            fieldPath: path ? `${path}.${key}` : key,
            driftType: 'required-changed',
            baselineValue: false,
            currentValue: true,
            isBreaking: true,
            message: `Field "${key}" became required at ${path || 'root'}`,
            suggestion: 'Breaking: Ensure all producers provide this field',
          });
        }
      }

      // No longer required (non-breaking)
      for (const key of baselineRequired) {
        if (!currentRequired.has(key)) {
          drifts.push({
            nodeName,
            fieldPath: path ? `${path}.${key}` : key,
            driftType: 'required-changed',
            baselineValue: true,
            currentValue: false,
            isBreaking: false,
            message: `Field "${key}" is no longer required at ${path || 'root'}`,
            suggestion: 'Non-breaking: Field made optional',
          });
        }
      }
    }

    // Compare array items
    if (baseline.type === 'array' && baseline.items && current.items) {
      drifts.push(...this.compareSchemasForDrift(nodeName, baseline.items, current.items, `${path}[]`));
    }

    // Compare enums
    if (baseline.enum || current.enum) {
      const baselineEnums = new Set(baseline.enum || []);
      const currentEnums = new Set(current.enum || []);

      // Removed enum values (breaking)
      for (const val of baselineEnums) {
        if (!currentEnums.has(val)) {
          drifts.push({
            nodeName,
            fieldPath,
            driftType: 'enum-changed',
            baselineValue: Array.from(baselineEnums),
            currentValue: Array.from(currentEnums),
            isBreaking: true,
            message: `Enum value "${val}" was removed at ${fieldPath}`,
            suggestion: 'Breaking: Ensure no producers use removed value',
          });
          break;
        }
      }

      // Added enum values (non-breaking)
      for (const val of currentEnums) {
        if (!baselineEnums.has(val)) {
          drifts.push({
            nodeName,
            fieldPath,
            driftType: 'enum-changed',
            baselineValue: Array.from(baselineEnums),
            currentValue: Array.from(currentEnums),
            isBreaking: false,
            message: `Enum value "${val}" was added at ${fieldPath}`,
            suggestion: 'Non-breaking: New enum value added',
          });
          break;
        }
      }
    }

    return drifts;
  }

  /**
   * Generate human-readable drift summary
   */
  private generateDriftSummary(
    drifts: SchemaDrift[],
    breakingChanges: SchemaDrift[],
    baseline: SchemaSnapshot
  ): string {
    if (drifts.length === 0) {
      return `No schema drift detected since baseline ${baseline.version} (${baseline.timestamp})`;
    }

    const parts: string[] = [];
    parts.push(`Schema drift detected: ${drifts.length} change(s) since baseline ${baseline.version}`);

    if (breakingChanges.length > 0) {
      parts.push(`⚠️ ${breakingChanges.length} BREAKING change(s) detected!`);
    }

    // Categorize changes
    const byType: Record<string, number> = {};
    for (const drift of drifts) {
      byType[drift.driftType] = (byType[drift.driftType] || 0) + 1;
    }

    const typeDescriptions: string[] = [];
    for (const [type, count] of Object.entries(byType)) {
      typeDescriptions.push(`${count} ${type}`);
    }
    parts.push(`Changes: ${typeDescriptions.join(', ')}`);

    return parts.join('. ');
  }

  /**
   * Calculate checksum for schema validation
   */
  private calculateSchemaChecksum(schemas: Record<string, JsonSchema>): string {
    const str = JSON.stringify(schemas, Object.keys(schemas).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * List all schema snapshots for a workflow
   */
  async listSchemaSnapshots(workflowId: string): Promise<string[]> {
    // This would need integration with the memory store's list capability
    // For now, return common versions
    const versions: string[] = [];

    // Check for latest
    const latest = await this.loadSchemaSnapshot(workflowId, 'latest');
    if (latest) {
      versions.push('latest');
      if (latest.version !== 'latest') {
        versions.push(latest.version);
      }
    }

    return versions;
  }

  /**
   * Compare two versions of schemas
   */
  async compareSchemaVersions(
    workflowId: string,
    versionA: string,
    versionB: string
  ): Promise<DriftAnalysis | null> {
    const snapshotA = await this.loadSchemaSnapshot(workflowId, versionA);
    const snapshotB = await this.loadSchemaSnapshot(workflowId, versionB);

    if (!snapshotA || !snapshotB) {
      return null;
    }

    const drifts: SchemaDrift[] = [];
    const allNodes = new Set([
      ...Object.keys(snapshotA.schemas),
      ...Object.keys(snapshotB.schemas),
    ]);

    for (const nodeName of allNodes) {
      const schemaA = snapshotA.schemas[nodeName];
      const schemaB = snapshotB.schemas[nodeName];

      if (!schemaA && schemaB) {
        drifts.push({
          nodeName,
          fieldPath: '',
          driftType: 'field-added',
          baselineValue: null,
          currentValue: schemaB,
          isBreaking: false,
          message: `Node "${nodeName}" added in ${versionB}`,
          suggestion: 'New node in workflow',
        });
      } else if (schemaA && !schemaB) {
        drifts.push({
          nodeName,
          fieldPath: '',
          driftType: 'field-removed',
          baselineValue: schemaA,
          currentValue: null,
          isBreaking: true,
          message: `Node "${nodeName}" removed in ${versionB}`,
          suggestion: 'Node no longer in workflow',
        });
      } else if (schemaA && schemaB) {
        drifts.push(...this.compareSchemasForDrift(nodeName, schemaA, schemaB, ''));
      }
    }

    const breakingChanges = drifts.filter(d => d.isBreaking);

    return {
      hasDrift: drifts.length > 0,
      baselineVersion: versionA,
      currentVersion: versionB,
      baselineDate: snapshotA.timestamp,
      drifts,
      breakingChanges,
      summary: this.generateDriftSummary(drifts, breakingChanges, snapshotA),
    };
  }
}
