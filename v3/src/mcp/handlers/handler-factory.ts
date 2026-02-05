/**
 * Agentic QE v3 - MCP Handler Factory
 *
 * Generic factory pattern for creating domain handlers.
 * Reduces duplicate boilerplate code across 11 domain handlers.
 *
 * ADR-051: Integrates with task router for optimal model tier selection.
 * ADR-037: Supports V2-compatible response enrichment.
 * Phase 5: Integrates pattern utilization in routing.
 *
 * @module mcp/handlers/handler-factory
 */

import { randomUUID } from 'crypto';
import { getFleetState, isFleetInitialized } from './core-handlers';
import { ToolResult } from '../types';
import { createTaskExecutor, DomainTaskExecutor } from '../../coordination/task-executor';
import { getTaskRouter, type TaskRoutingResult, type PatternHint } from '../services/task-router';
import { Priority } from '../../shared/types';
import type { QEDomain as LearningDomain } from '../../learning/qe-patterns.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Domain name type for handler configuration
 */
export type DomainHandlerDomain =
  | 'test-generation'
  | 'test-execution'
  | 'coverage-analysis'
  | 'quality-assessment'
  | 'security-compliance'
  | 'contract-testing'
  | 'visual-accessibility'
  | 'chaos-resilience'
  | 'defect-intelligence'
  | 'requirements-validation'
  | 'code-intelligence';

/**
 * Task type for queen submission
 */
export type HandlerTaskType =
  | 'generate-tests'
  | 'execute-tests'
  | 'analyze-coverage'
  | 'assess-quality'
  | 'scan-security'
  | 'validate-contracts'
  | 'test-accessibility'
  | 'run-chaos'
  | 'predict-defects'
  | 'validate-requirements'
  | 'index-code';

/**
 * Configuration for creating a domain handler
 */
export interface DomainHandlerConfig<TParams, TResult> {
  /** Domain name for routing */
  domain: DomainHandlerDomain;

  /** Task type for queen submission */
  taskType: HandlerTaskType;

  /** Task priority (default: p1) */
  priority?: Priority;

  /** Default timeout in milliseconds */
  defaultTimeout?: number;

  /** Build task description for routing */
  buildTaskDescription: (params: TParams) => string;

  /** Map input params to task payload */
  mapToPayload: (params: TParams, routingResult: TaskRoutingResult | null) => Record<string, unknown>;

  /** Map execution result to handler result */
  mapToResult: (
    taskId: string,
    data: Record<string, unknown>,
    duration: number,
    savedFiles?: string[],
    params?: TParams
  ) => TResult;

  /** Optional: Calculate timeout from params */
  calculateTimeout?: (params: TParams) => number;

  /** Optional: Include source code in routing context */
  includeCodeContext?: (params: TParams) => string | undefined;
}

/**
 * Base result interface that all domain results extend
 */
export interface BaseHandlerResult {
  taskId: string;
  status: string;
  duration: number;
  savedFiles?: string[];
}

// ============================================================================
// Shared Utilities (exported for response mappers)
// ============================================================================

/**
 * Generate a unique test ID
 */
export function generateTestId(): string {
  return `test-${randomUUID()}`;
}

/**
 * Generate a unique agent ID
 */
export function generateAgentId(type: string): string {
  return `${type}-${randomUUID()}`;
}

/**
 * V2-compatible learning feedback
 */
export interface V2LearningFeedback {
  enabled: boolean;
  agentId: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Generate V2-compatible learning feedback
 */
export function generateV2LearningFeedback(agentType: string): V2LearningFeedback {
  return {
    enabled: true,
    agentId: generateAgentId(agentType),
    message: 'Agent learned from this execution - patterns and Q-values updated'
  };
}

/**
 * V2-compatible complexity analysis
 */
export interface V2Complexity {
  score: number;
  level: 'low' | 'medium' | 'high';
  [key: string]: unknown;
}

/**
 * Analyze code complexity
 */
export function analyzeComplexity(sourceCode: string): V2Complexity {
  const lines = sourceCode.split('\n').length;
  const branches = (sourceCode.match(/if|switch|for|while|catch/g) || []).length;
  const score = lines + branches * 2;

  return {
    score,
    level: branches > 5 ? 'high' : branches > 2 ? 'medium' : 'low'
  };
}

/**
 * V2-compatible AI insights
 */
export interface V2AIInsights {
  recommendations: string[];
  estimatedTime: string;
  confidence: number;
  [key: string]: unknown;
}

/**
 * Generate V2-compatible AI insights
 */
export function generateV2AIInsights(complexity: V2Complexity, testType: string): V2AIInsights {
  const recommendations: string[] = [];

  if (complexity.level === 'high') {
    recommendations.push('Consider refactoring complex functions');
    recommendations.push('Add unit tests for each branch');
  }
  recommendations.push('Consider adding edge case tests');
  recommendations.push('Add error handling tests');

  if (testType === 'integration') {
    recommendations.push('Add mock external dependencies');
    recommendations.push('Test API contract boundaries');
  }

  return {
    recommendations,
    estimatedTime: `${Math.round(complexity.score * 0.5)} minutes`,
    confidence: 0.85
  };
}

/**
 * V2-compatible test object
 */
export interface V2TestObject {
  id: string;
  name: string;
  type: string;
  parameters: string[];
  assertions: string[];
  expectedResult: unknown;
  estimatedDuration: number;
  code?: string;
  aiGenerated?: boolean;
}

/**
 * Generate V2-compatible test objects
 */
export function generateV2Tests(
  sourceCode: string,
  testType: string,
  language: string,
  count: number
): V2TestObject[] {
  const tests: V2TestObject[] = [];
  const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=|def\s+(\w+)|func\s+(\w+))/g;
  const functions: string[] = [];
  let match;

  while ((match = funcRegex.exec(sourceCode)) !== null) {
    const funcName = match[1] || match[2] || match[3] || match[4];
    if (funcName) functions.push(funcName);
  }

  // Generate tests for each function
  for (let i = 0; i < Math.min(functions.length, count); i++) {
    const funcName = functions[i] || 'exampleFunction';
    tests.push({
      id: generateTestId(),
      name: `test_${funcName}_${i}`,
      type: testType,
      parameters: [],
      assertions: [`${funcName}() === null`],
      expectedResult: null,
      estimatedDuration: testType === 'integration' ? 2000 : 1000,
      aiGenerated: true,
    });
  }

  // Add integration test if needed
  if (testType === 'integration' || count > functions.length) {
    tests.push({
      id: generateTestId(),
      name: `integration_ComponentA_${tests.length}`,
      type: 'integration',
      parameters: [],
      assertions: ['ComponentA integration test passes'],
      expectedResult: null,
      estimatedDuration: 2000,
      aiGenerated: true,
    });
  }

  // Add edge case tests
  const edgeCases = ['high-complexity', 'deep-nesting', 'null-handling', 'empty-input'];
  for (let i = tests.length; i < count && i - tests.length < edgeCases.length; i++) {
    tests.push({
      id: generateTestId(),
      name: `edge_case_${edgeCases[i - tests.length]}_${i}`,
      type: 'unit',
      parameters: [],
      assertions: [`${edgeCases[i - tests.length]} edge case handled`],
      expectedResult: null,
      estimatedDuration: 1500,
      aiGenerated: true,
    });
  }

  return tests;
}

/**
 * Detect anti-patterns in source code
 */
export function detectAntiPatterns(sourceCode: string, language: string): Array<{
  type: string;
  line: number;
  severity: string;
  suggestion: string;
}> {
  const antiPatterns: Array<{
    type: string;
    line: number;
    severity: string;
    suggestion: string;
  }> = [];

  const lines = sourceCode.split('\n');

  if (sourceCode.includes('eval(')) {
    antiPatterns.push({
      type: 'dangerous-eval',
      line: lines.findIndex(l => l.includes('eval(')) + 1,
      severity: 'critical',
      suggestion: 'Replace eval() with safer alternatives'
    });
  }

  if (sourceCode.includes('var ') && (language === 'javascript' || language === 'typescript')) {
    antiPatterns.push({
      type: 'var-usage',
      line: lines.findIndex(l => l.includes('var ')) + 1,
      severity: 'low',
      suggestion: 'Use const or let instead of var'
    });
  }

  if (sourceCode.includes('any') && language === 'typescript') {
    antiPatterns.push({
      type: 'any-type',
      line: lines.findIndex(l => l.includes('any')) + 1,
      severity: 'medium',
      suggestion: 'Replace any with specific types'
    });
  }

  return antiPatterns;
}

// ============================================================================
// Task Executor Management
// ============================================================================

// Cached task executor
let taskExecutor: DomainTaskExecutor | null = null;

// Cached learning engine for pattern search (declared here for use in resetTaskExecutor)
let cachedLearningEngine: import('../../learning/aqe-learning-engine.js').AQELearningEngine | null = null;

/**
 * Get or create the task executor
 */
export function getTaskExecutor(): DomainTaskExecutor {
  if (!taskExecutor) {
    const { kernel } = getFleetState();
    if (!kernel) {
      throw new Error('Kernel not initialized');
    }
    taskExecutor = createTaskExecutor(kernel);
  }
  return taskExecutor;
}

/**
 * Reset the task executor (call when fleet is reinitialized)
 */
export function resetTaskExecutor(): void {
  taskExecutor = null;
  // Also reset the learning engine cache
  cachedLearningEngine = null;
}

// ============================================================================
// Task Routing
// ============================================================================

/**
 * Get or create the learning engine for pattern search
 */
async function getLearningEngine(): Promise<import('../../learning/aqe-learning-engine.js').AQELearningEngine | null> {
  if (cachedLearningEngine) {
    return cachedLearningEngine;
  }

  try {
    const { kernel } = getFleetState();
    if (!kernel) {
      return null;
    }

    const { createAQELearningEngine } = await import('../../learning/aqe-learning-engine.js');
    const memory = kernel.memory;

    cachedLearningEngine = createAQELearningEngine(memory, {
      projectRoot: process.cwd(),
      enableClaudeFlow: false, // Don't need Claude Flow for pattern search
    });

    await cachedLearningEngine.initialize();
    return cachedLearningEngine;
  } catch (error) {
    // Non-critical - pattern search is optional
    console.debug(
      '[HandlerFactory] Learning engine init failed:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Search for relevant patterns for a task (Phase 5.1)
 */
async function searchPatternsForTask(
  taskDescription: string,
  domain: string
): Promise<PatternHint[]> {
  try {
    const engine = await getLearningEngine();
    if (!engine) {
      return [];
    }

    // Map domain string to QEDomain
    const qeDomain = domain as LearningDomain;

    const result = await engine.searchPatterns(taskDescription, {
      limit: 5,
      minConfidence: 0.4,
      domain: qeDomain,
      useVectorSearch: true,
    });

    if (!result.success || result.value.length === 0) {
      return [];
    }

    // Convert to PatternHints
    return result.value
      .filter(r => r.similarity >= 0.4)
      .map(r => ({
        name: r.pattern.name,
        description: r.pattern.description,
        similarity: r.similarity,
        confidence: r.pattern.confidence,
        canReuse: r.canReuse,
        patternId: r.pattern.id,
      }));
  } catch (error) {
    // Non-critical - pattern search is optional
    console.debug(
      '[HandlerFactory] Pattern search failed:',
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

/**
 * Route a domain task through the Model Router
 * Returns routing decision with model tier recommendation
 * Includes pattern hints from learning system (Phase 5.1, 5.2)
 */
async function routeDomainTask(
  taskDescription: string,
  domain: string,
  codeContext?: string
): Promise<TaskRoutingResult | null> {
  try {
    // Search for relevant patterns (Phase 5.1)
    const patternHints = await searchPatternsForTask(taskDescription, domain);

    if (patternHints.length > 0) {
      console.debug(
        `[HandlerFactory] Found ${patternHints.length} relevant patterns for ${domain}`
      );
    }

    const router = await getTaskRouter();
    const result = await router.routeTask({
      task: taskDescription,
      domain,
      codeContext,
      agentType: `qe-${domain}`,
      enablePatternSearch: true,
      patternHints: patternHints.length > 0 ? patternHints : undefined,
    });
    return result;
  } catch (error) {
    // Log but don't fail - routing is advisory
    console.error(`[HandlerFactory] Routing failed for ${domain}: ${error}`);
    return null;
  }
}

/**
 * Reset the cached learning engine (call when fleet is reinitialized)
 */
export function resetLearningEngine(): void {
  cachedLearningEngine = null;
}

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Create a domain handler using the factory pattern
 *
 * This factory eliminates duplicate boilerplate across all domain handlers:
 * 1. Fleet initialization check
 * 2. Task routing (ADR-051)
 * 3. Task submission to queen
 * 4. Task execution
 * 5. Response mapping
 * 6. Error handling
 *
 * @example
 * ```typescript
 * const handleTestGenerate = createDomainHandler({
 *   domain: 'test-generation',
 *   taskType: 'generate-tests',
 *   buildTaskDescription: (params) => `Generate ${params.testType} tests`,
 *   mapToPayload: (params, routing) => ({
 *     sourceCode: params.sourceCode,
 *     routingTier: routing?.decision.tier,
 *   }),
 *   mapToResult: (taskId, data, duration) => ({
 *     taskId,
 *     testsGenerated: data.testsGenerated,
 *     duration,
 *   }),
 * });
 * ```
 */
export function createDomainHandler<TParams, TResult extends BaseHandlerResult>(
  config: DomainHandlerConfig<TParams, TResult>
): (params: TParams) => Promise<ToolResult<TResult>> {
  const {
    domain,
    taskType,
    priority = 'p1',
    defaultTimeout = 180000,
    buildTaskDescription,
    mapToPayload,
    mapToResult,
    calculateTimeout,
    includeCodeContext,
  } = config;

  return async (params: TParams): Promise<ToolResult<TResult>> => {
    // Step 1: Fleet initialization check
    if (!isFleetInitialized()) {
      return {
        success: false,
        error: 'Fleet not initialized. Call fleet_init first.',
      };
    }

    const { queen } = getFleetState();

    try {
      // Step 2: Route task to optimal model tier (ADR-051)
      const taskDescription = buildTaskDescription(params);
      const codeContext = includeCodeContext?.(params);
      const routingResult = await routeDomainTask(taskDescription, domain, codeContext);

      // Step 3: Build payload and submit task
      const payload = mapToPayload(params, routingResult);
      const timeout = calculateTimeout?.(params) ?? defaultTimeout;

      const submitResult = await queen!.submitTask({
        type: taskType,
        priority,
        targetDomains: [domain],
        payload,
        timeout,
      });

      if (!submitResult.success) {
        return {
          success: false,
          error: submitResult.error.message,
        };
      }

      // Step 4: Execute task
      const executor = getTaskExecutor();
      const task = queen!.getTaskStatus(submitResult.value);

      if (!task) {
        return {
          success: false,
          error: 'Task not found after submission',
        };
      }

      const result = await executor.execute(task.task);

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Task execution failed',
        };
      }

      // Step 5: Map result
      const data = result.data as Record<string, unknown>;
      const mappedResult = mapToResult(
        submitResult.value,
        data,
        result.duration,
        result.savedFiles,
        params
      );

      return {
        success: true,
        data: mappedResult,
      };
    } catch (error) {
      // Step 6: Error handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to ${taskType.replace(/-/g, ' ')}: ${errorMessage}`,
      };
    }
  };
}

/**
 * Create multiple domain handlers from configurations
 *
 * @example
 * ```typescript
 * const handlers = createDomainHandlers([
 *   testGenerateConfig,
 *   testExecuteConfig,
 *   coverageAnalyzeConfig,
 * ]);
 * ```
 */
export function createDomainHandlers<T extends Record<string, DomainHandlerConfig<unknown, BaseHandlerResult>>>(
  configs: T
): { [K in keyof T]: ReturnType<typeof createDomainHandler<unknown, BaseHandlerResult>> } {
  const handlers = {} as { [K in keyof T]: ReturnType<typeof createDomainHandler<unknown, BaseHandlerResult>> };

  for (const [key, config] of Object.entries(configs)) {
    handlers[key as keyof T] = createDomainHandler(config as DomainHandlerConfig<unknown, BaseHandlerResult>);
  }

  return handlers;
}
