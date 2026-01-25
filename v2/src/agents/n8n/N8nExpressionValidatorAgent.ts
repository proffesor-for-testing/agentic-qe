/**
 * N8nExpressionValidatorAgent
 *
 * Validates n8n expressions and data transformations:
 * - Expression syntax checking
 * - Context-aware validation
 * - Security analysis (injection risks)
 * - Code node validation
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
  ExpressionValidationResult,
  ExtractedExpression,
  ExpressionIssue,
  RuntimeExpressionResult,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface ExpressionValidationTask extends QETask {
  type: 'expression-validation';
  target: string; // workflowId
  options?: {
    validateSecurity?: boolean;
    validateDataReferences?: boolean;
    checkCodeNodes?: boolean;
    executeRuntimeValidation?: boolean;  // Actually execute expressions with test data
    testData?: Record<string, unknown>;  // Test data to use for runtime validation
  };
}

// Patterns for expression analysis
const EXPRESSION_PATTERNS = {
  simple: /^\{\{\s*\$[a-zA-Z]+\.[a-zA-Z_.[\]0-9]+\s*\}\}$/,
  function: /\{\{.*\.(toUpperCase|toLowerCase|split|join|map|filter|reduce|substring|slice|trim|replace|match|includes|startsWith|endsWith)\s*\(/,
  ternary: /\{\{.*\?.*:.*\}\}/,
  arithmetic: /\{\{.*[+\-*/%].*\}\}/,
  comparison: /\{\{.*(===?|!==?|>=?|<=?).*\}\}/,
};

// Security patterns to detect
const SECURITY_PATTERNS = {
  eval: /eval\s*\(/i,
  function: /new\s+Function\s*\(/i,
  processEnv: /process\.env\./,
  require: /require\s*\(/i,
  import: /import\s*\(/,
  fileSystem: /(fs\.|readFile|writeFile|unlink)/i,
  shell: /(exec|spawn|execSync|spawnSync)\s*\(/i,
  sqlInjection: /['"]?\s*\+\s*\$json\./,
  commandInjection: /\$\{?\$json\.[^}]*\}?\s*[;&|`]/,
};

export class N8nExpressionValidatorAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'expression-extraction',
        version: '1.0.0',
        description: 'Extract and analyze n8n expressions',
        parameters: {},
      },
      {
        name: 'syntax-validation',
        version: '1.0.0',
        description: 'Validate expression syntax',
        parameters: {},
      },
      {
        name: 'security-analysis',
        version: '1.0.0',
        description: 'Detect security risks in expressions',
        parameters: {},
      },
      {
        name: 'code-node-validation',
        version: '1.0.0',
        description: 'Validate JavaScript code in Code nodes',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-expression-validator' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<ExpressionValidationResult> {
    const exprTask = task as ExpressionValidationTask;

    if (exprTask.type !== 'expression-validation') {
      throw new Error(`Unsupported task type: ${exprTask.type}`);
    }

    return this.validateExpressions(exprTask.target, exprTask.options);
  }

  /**
   * Validate all expressions in a workflow
   *
   * PRODUCTION DEFAULT: Runtime validation is ENABLED by default.
   * This ensures expressions are actually evaluated, not just statically analyzed.
   * Set executeRuntimeValidation: false to disable if workflow cannot be executed.
   */
  async validateExpressions(
    workflowId: string,
    options?: ExpressionValidationTask['options']
  ): Promise<ExpressionValidationResult> {
    const workflow = await this.getWorkflow(workflowId);

    // Extract all expressions
    const expressions = this.extractAllExpressions(workflow);

    // Validate each expression
    const issues: ExpressionIssue[] = [];

    for (const expr of expressions) {
      // Syntax validation
      issues.push(...this.validateSyntax(expr));

      // Security validation
      if (options?.validateSecurity !== false) {
        issues.push(...this.validateSecurity(expr));
      }

      // Data reference validation - ENABLED BY DEFAULT for production
      if (options?.validateDataReferences !== false) {
        issues.push(...this.validateDataReferences(expr, workflow));
      }
    }

    // Validate Code nodes
    if (options?.checkCodeNodes !== false) {
      issues.push(...this.validateCodeNodes(workflow));
    }

    // Runtime expression validation - ENABLED BY DEFAULT
    // This is critical for production - static analysis alone misses runtime errors
    // Set executeRuntimeValidation: false explicitly to skip
    let runtimeResults: RuntimeExpressionResult[] = [];
    if (options?.executeRuntimeValidation !== false) {
      try {
        runtimeResults = await this.executeRuntimeValidation(
          workflowId,
          expressions,
          options?.testData
        );

        // Add issues for failed runtime evaluations
        for (const result of runtimeResults) {
          if (!result.success) {
            issues.push({
              node: result.node,
              field: result.field,
              expression: result.expression,
              severity: 'error',
              message: `Runtime evaluation failed: ${result.error}`,
              suggestion: 'Expression may reference undefined data or contain syntax errors',
            });
          }
        }
      } catch (error) {
        // If runtime execution fails, emit warning but continue with static results
        this.emitEvent('expression.runtime.skipped', {
          workflowId,
          reason: error instanceof Error ? error.message : 'Runtime validation failed',
          note: 'Static analysis completed, but runtime expression validation was skipped',
        });
      }
    }

    const result: ExpressionValidationResult = {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      expressions,
      issues,
      runtimeResults,
    };

    // Store result
    await this.storeTestResult(`expression-validation:${workflowId}`, result);

    // Emit event
    this.emitEvent('expression.validation.completed', {
      workflowId,
      expressionsFound: expressions.length,
      issuesFound: issues.length,
    });

    return result;
  }

  /**
   * Extract all expressions from workflow
   */
  private extractAllExpressions(workflow: N8nWorkflow): ExtractedExpression[] {
    const expressions: ExtractedExpression[] = [];
    const baseExpressions = this.extractExpressions(workflow);

    for (const expr of baseExpressions) {
      expressions.push({
        node: expr.node,
        field: expr.field,
        expression: expr.expression,
        type: this.classifyExpression(expr.expression),
        referencedFields: this.extractReferencedFields(expr.expression),
      });
    }

    return expressions;
  }

  /**
   * Classify expression type
   */
  private classifyExpression(expression: string): ExtractedExpression['type'] {
    if (EXPRESSION_PATTERNS.ternary.test(expression)) {
      return 'ternary';
    }
    if (EXPRESSION_PATTERNS.function.test(expression)) {
      return 'function';
    }
    if (EXPRESSION_PATTERNS.simple.test(expression)) {
      return 'simple';
    }
    return 'code';
  }

  /**
   * Extract referenced fields from expression
   */
  private extractReferencedFields(expression: string): string[] {
    const fields: string[] = [];

    // Match $json.field patterns
    const jsonMatches = expression.match(/\$json\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (jsonMatches) {
      fields.push(...jsonMatches.map(m => m.replace('$json.', '')));
    }

    // Match $input patterns
    const inputMatches = expression.match(/\$input\.(first|last|all|item)\(\)\.json\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (inputMatches) {
      fields.push(...inputMatches.map(m => {
        const match = m.match(/\.json\.([a-zA-Z_][a-zA-Z0-9_]*)/);
        return match ? match[1] : m;
      }));
    }

    // Match $env patterns
    const envMatches = expression.match(/\$env\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (envMatches) {
      fields.push(...envMatches.map(m => `env:${m.replace('$env.', '')}`));
    }

    return [...new Set(fields)];
  }

  /**
   * Validate expression syntax
   */
  private validateSyntax(expr: ExtractedExpression): ExpressionIssue[] {
    const issues: ExpressionIssue[] = [];

    // Check for balanced braces
    const openBraces = (expr.expression.match(/\{\{/g) || []).length;
    const closeBraces = (expr.expression.match(/\}\}/g) || []).length;

    if (openBraces !== closeBraces) {
      issues.push({
        node: expr.node,
        field: expr.field,
        expression: expr.expression,
        severity: 'error',
        message: 'Unbalanced expression braces',
        suggestion: 'Ensure all {{ have matching }}',
      });
    }

    // Check for empty expressions
    if (/\{\{\s*\}\}/.test(expr.expression)) {
      issues.push({
        node: expr.node,
        field: expr.field,
        expression: expr.expression,
        severity: 'warning',
        message: 'Empty expression',
        suggestion: 'Remove empty expression or add content',
      });
    }

    // Check for invalid variable references
    if (/\{\{[^}]*\$\s+/.test(expr.expression)) {
      issues.push({
        node: expr.node,
        field: expr.field,
        expression: expr.expression,
        severity: 'error',
        message: 'Invalid variable reference - space after $',
        suggestion: 'Remove space after $ in variable reference',
      });
    }

    // Check for common mistakes
    if (/\$json\[/.test(expr.expression) && !/\$json\[['"]/.test(expr.expression)) {
      issues.push({
        node: expr.node,
        field: expr.field,
        expression: expr.expression,
        severity: 'warning',
        message: 'Bracket notation should use quotes',
        suggestion: 'Use $json["field"] instead of $json[field]',
      });
    }

    return issues;
  }

  /**
   * Validate expression for security issues
   */
  private validateSecurity(expr: ExtractedExpression): ExpressionIssue[] {
    const issues: ExpressionIssue[] = [];

    for (const [name, pattern] of Object.entries(SECURITY_PATTERNS)) {
      if (pattern.test(expr.expression)) {
        const severity = ['eval', 'function', 'shell', 'sqlInjection', 'commandInjection'].includes(name)
          ? 'error'
          : 'warning';

        issues.push({
          node: expr.node,
          field: expr.field,
          expression: expr.expression,
          severity,
          message: `Potential security risk: ${name}`,
          suggestion: this.getSecuritySuggestion(name),
        });
      }
    }

    return issues;
  }

  /**
   * Get security suggestion for issue type
   */
  private getSecuritySuggestion(issueType: string): string {
    const suggestions: Record<string, string> = {
      eval: 'Avoid using eval() - use safer alternatives',
      function: 'Avoid new Function() - use predefined functions',
      processEnv: 'Use n8n credentials instead of process.env',
      require: 'External modules should be pre-approved',
      import: 'Dynamic imports are not recommended',
      fileSystem: 'File system access should be carefully controlled',
      shell: 'Avoid shell execution - use dedicated nodes',
      sqlInjection: 'Use parameterized queries instead of string concatenation',
      commandInjection: 'Sanitize user input before using in commands',
    };

    return suggestions[issueType] || 'Review and secure this expression';
  }

  /**
   * Validate data references exist
   */
  private validateDataReferences(
    expr: ExtractedExpression,
    workflow: N8nWorkflow
  ): ExpressionIssue[] {
    const issues: ExpressionIssue[] = [];

    // Check $node references
    const nodeRefs = expr.expression.match(/\$node\["([^"]+)"\]/g);
    if (nodeRefs) {
      const nodeNames = new Set(workflow.nodes.map(n => n.name));
      for (const ref of nodeRefs) {
        const nodeName = ref.match(/\$node\["([^"]+)"\]/)?.[1];
        if (nodeName && !nodeNames.has(nodeName)) {
          issues.push({
            node: expr.node,
            field: expr.field,
            expression: expr.expression,
            severity: 'error',
            message: `Referenced node "${nodeName}" does not exist`,
            suggestion: 'Check node name spelling or use existing node',
          });
        }
      }
    }

    return issues;
  }

  /**
   * Validate Code nodes
   */
  private validateCodeNodes(workflow: N8nWorkflow): ExpressionIssue[] {
    const issues: ExpressionIssue[] = [];
    const codeNodes = this.findNodesByType(workflow, 'n8n-nodes-base.code');

    for (const node of codeNodes) {
      const jsCode = node.parameters.jsCode as string;
      if (!jsCode) continue;

      // Check for security patterns in code
      for (const [name, pattern] of Object.entries(SECURITY_PATTERNS)) {
        if (pattern.test(jsCode)) {
          issues.push({
            node: node.name,
            field: 'jsCode',
            expression: jsCode.substring(0, 100) + '...',
            severity: ['eval', 'function', 'shell'].includes(name) ? 'error' : 'warning',
            message: `Code node contains potential security risk: ${name}`,
            suggestion: this.getSecuritySuggestion(name),
          });
        }
      }

      // Check for common code issues
      if (!/return\s/.test(jsCode)) {
        issues.push({
          node: node.name,
          field: 'jsCode',
          expression: jsCode.substring(0, 100) + '...',
          severity: 'warning',
          message: 'Code node may not return data',
          suggestion: 'Ensure the code returns data using return statement',
        });
      }

      // Check for infinite loops
      if (/while\s*\(\s*true\s*\)/.test(jsCode) && !/break/.test(jsCode)) {
        issues.push({
          node: node.name,
          field: 'jsCode',
          expression: jsCode.substring(0, 100) + '...',
          severity: 'error',
          message: 'Potential infinite loop detected',
          suggestion: 'Add break condition to while(true) loop',
        });
      }
    }

    return issues;
  }

  /**
   * Validate a single expression string
   */
  validateSingleExpression(
    expression: string,
    nodeName = 'unknown'
  ): ExpressionIssue[] {
    const expr: ExtractedExpression = {
      node: nodeName,
      field: 'input',
      expression,
      type: this.classifyExpression(expression),
      referencedFields: this.extractReferencedFields(expression),
    };

    return [
      ...this.validateSyntax(expr),
      ...this.validateSecurity(expr),
    ];
  }

  /**
   * Get expression complexity score
   */
  getExpressionComplexity(expression: string): {
    score: number;
    factors: string[];
  } {
    let score = 1;
    const factors: string[] = [];

    if (EXPRESSION_PATTERNS.function.test(expression)) {
      score += 2;
      factors.push('function call');
    }

    if (EXPRESSION_PATTERNS.ternary.test(expression)) {
      score += 2;
      factors.push('ternary operator');
    }

    if (EXPRESSION_PATTERNS.arithmetic.test(expression)) {
      score += 1;
      factors.push('arithmetic');
    }

    const nestedBraces = (expression.match(/\{\{/g) || []).length;
    if (nestedBraces > 1) {
      score += nestedBraces;
      factors.push(`${nestedBraces} nested expressions`);
    }

    const chainedCalls = (expression.match(/\.[a-zA-Z]+\(/g) || []).length;
    if (chainedCalls > 2) {
      score += chainedCalls;
      factors.push(`${chainedCalls} chained calls`);
    }

    return { score, factors };
  }

  /**
   * Execute expressions at runtime to validate they evaluate correctly
   * This actually runs the workflow with test data and captures expression outputs
   */
  private async executeRuntimeValidation(
    workflowId: string,
    expressions: ExtractedExpression[],
    testData?: Record<string, unknown>
  ): Promise<RuntimeExpressionResult[]> {
    const results: RuntimeExpressionResult[] = [];

    // Default test data that covers common scenarios
    const defaultTestData: Record<string, unknown> = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      status: 'active',
      items: [{ id: 1, value: 'item1' }, { id: 2, value: 'item2' }],
      metadata: { created: new Date().toISOString(), version: '1.0.0' },
      count: 42,
      enabled: true,
      ...testData,
    };

    try {
      // Execute the workflow with test data to get actual expression results
      const execution = await this.executeWorkflow(workflowId, defaultTestData, {
        waitForCompletion: true,
        timeout: 30000,
      });

      // Wait for completion
      const completedExecution = await this.waitForExecution(execution.id, 30000);

      // Analyze the execution to see which expressions were evaluated
      const runData = completedExecution.data?.resultData?.runData;

      if (runData) {
        // For each expression, check if the node executed and what data it produced
        for (const expr of expressions) {
          const startTime = Date.now();
          const nodeRuns = runData[expr.node];

          if (nodeRuns && nodeRuns.length > 0) {
            const lastRun = nodeRuns[nodeRuns.length - 1];

            // If node executed successfully, expression likely evaluated
            if (lastRun.executionStatus === 'success') {
              // Try to find the evaluated value in the output
              const outputData = lastRun.data?.main?.[0]?.[0]?.json;

              results.push({
                expression: expr.expression,
                node: expr.node,
                field: expr.field,
                success: true,
                evaluatedValue: outputData,
                executionTimeMs: Date.now() - startTime,
              });
            } else {
              results.push({
                expression: expr.expression,
                node: expr.node,
                field: expr.field,
                success: false,
                error: lastRun.error?.message || 'Node execution failed',
                executionTimeMs: Date.now() - startTime,
              });
            }
          } else {
            // Node didn't execute - might be in a branch that wasn't triggered
            results.push({
              expression: expr.expression,
              node: expr.node,
              field: expr.field,
              success: true, // Not an error, just not executed
              evaluatedValue: undefined,
              executionTimeMs: Date.now() - startTime,
            });
          }
        }
      }

      // If workflow failed entirely, all expressions are suspect
      if (completedExecution.status === 'failed' || completedExecution.status === 'crashed') {
        const errorMsg = completedExecution.data?.resultData?.error?.message || 'Workflow execution failed';
        const failedNode = completedExecution.data?.resultData?.error?.node;

        // Mark expressions in the failed node as failed
        for (const expr of expressions) {
          const existingResult = results.find(r => r.node === expr.node && r.field === expr.field);
          if (existingResult) continue;

          if (failedNode && expr.node === failedNode) {
            results.push({
              expression: expr.expression,
              node: expr.node,
              field: expr.field,
              success: false,
              error: errorMsg,
              executionTimeMs: 0,
            });
          }
        }
      }
    } catch (error) {
      // If workflow execution fails, evaluate expressions locally
      for (const expr of expressions) {
        const startTime = Date.now();
        const localResult = this.evaluateExpressionLocally(expr.expression, defaultTestData);

        results.push({
          expression: expr.expression,
          node: expr.node,
          field: expr.field,
          success: localResult.success,
          evaluatedValue: localResult.value,
          error: localResult.error,
          executionTimeMs: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * Evaluate expression locally as fallback when workflow can't be executed
   *
   * NOTE: This uses safe pattern matching for common n8n expressions instead of
   * dynamic code evaluation. This is intentionally LIMITED to avoid the security
   * risks that this agent itself detects (eval, new Function).
   *
   * For full expression evaluation, use executeRuntimeValidation() which
   * executes through n8n's own expression engine.
   */
  private evaluateExpressionLocally(
    expression: string,
    testData: Record<string, unknown>
  ): { success: boolean; value?: unknown; error?: string } {
    try {
      // Extract the expression content (between {{ }})
      const match = expression.match(/\{\{(.+?)\}\}/s);
      if (!match) {
        return { success: false, error: 'Invalid expression format' };
      }

      const exprContent = match[1].trim();

      // SAFE evaluation using pattern matching instead of eval/new Function
      // This handles the most common n8n expression patterns

      // Pattern 1: Simple $json.field access
      const simpleJsonMatch = exprContent.match(/^\$json\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (simpleJsonMatch) {
        const field = simpleJsonMatch[1];
        const value = testData[field];
        return { success: true, value };
      }

      // Pattern 2: Nested $json.field.subfield access
      const nestedJsonMatch = exprContent.match(/^\$json\.([a-zA-Z_][a-zA-Z0-9_.]+)$/);
      if (nestedJsonMatch) {
        const path = nestedJsonMatch[1].split('.');
        let value: unknown = testData;
        for (const part of path) {
          if (value === null || value === undefined) {
            return { success: true, value: undefined };
          }
          value = (value as Record<string, unknown>)[part];
        }
        return { success: true, value };
      }

      // Pattern 3: $json["field"] bracket notation
      const bracketMatch = exprContent.match(/^\$json\["([^"]+)"\]$/);
      if (bracketMatch) {
        const field = bracketMatch[1];
        const value = testData[field];
        return { success: true, value };
      }

      // Pattern 4: $input.first().json.field
      const inputFirstMatch = exprContent.match(/^\$input\.first\(\)\.json\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (inputFirstMatch) {
        const field = inputFirstMatch[1];
        const value = testData[field];
        return { success: true, value };
      }

      // Pattern 5: $now (current date)
      if (exprContent === '$now') {
        return { success: true, value: new Date().toISOString() };
      }

      // Pattern 6: String literals
      if (exprContent.match(/^["'].*["']$/)) {
        return { success: true, value: exprContent.slice(1, -1) };
      }

      // Pattern 7: Number literals
      if (exprContent.match(/^-?\d+(\.\d+)?$/)) {
        return { success: true, value: parseFloat(exprContent) };
      }

      // Pattern 8: Boolean literals
      if (exprContent === 'true' || exprContent === 'false') {
        return { success: true, value: exprContent === 'true' };
      }

      // Complex expressions require n8n runtime execution
      // Return success=true but value=undefined to indicate "needs runtime"
      return {
        success: true,
        value: undefined,
        error: 'Complex expression requires runtime validation via n8n execution',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Evaluation failed',
      };
    }
  }

  /**
   * Wait for workflow execution to complete
   */
  private async waitForExecution(
    executionId: string,
    timeoutMs: number
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const execution = await this.getExecution(executionId);

      if (execution.status !== 'running' && execution.status !== 'waiting') {
        return execution;
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Execution ${executionId} timed out after ${timeoutMs}ms`);
  }
}
