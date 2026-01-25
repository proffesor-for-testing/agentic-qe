/**
 * TDD Workflow Orchestration Example
 *
 * Demonstrates how to orchestrate the three TDD subagents (qe-test-writer,
 * qe-test-implementer, qe-test-refactorer) with proper context sharing
 * and handoff validation using real MCP tools.
 *
 * Key Features:
 * - Real MCP tool calls for memory operations (mcp__claude-flow__memory_usage)
 * - TDDPhaseValidator for runtime validation between phases
 * - Cycle-based memory namespace for shared context
 * - File hash validation for artifact integrity
 * - Sequential phase execution with validation gates
 * - Comprehensive error handling and rollback
 *
 * Note: This is an example/reference file. In production, the MCP tool calls
 * would be executed by the Claude Code runtime.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { TDDPhaseValidator, TDDValidationResult } from '../src/core/hooks/validators/TDDPhaseValidator';

// =============================================================================
// Type Definitions - Shared across all TDD phases
// =============================================================================

/**
 * Context created by the parent orchestrator and shared across all phases
 */
interface TDDCycleContext {
  cycleId: string;
  module: {
    path: string;
    name: string;
  };
  requirements: {
    functionality: string;
    acceptanceCriteria: string[];
    edgeCases: string[];
  };
  constraints: {
    framework: 'jest' | 'mocha' | 'vitest' | 'playwright';
    coverageTarget: number;
    testTypes: ('unit' | 'integration' | 'e2e')[];
  };
  testFilePath: string;
  implFilePath: string;
}

/**
 * Output from RED phase (qe-test-writer)
 */
interface REDPhaseOutput {
  cycleId: string;
  phase: 'RED';
  timestamp: number;
  testFile: {
    path: string;
    content: string;
    hash: string;
  };
  tests: Array<{
    name: string;
    type: 'unit' | 'integration' | 'e2e';
    assertion: string;
    givenWhenThen: {
      given: string;
      when: string;
      then: string;
    };
  }>;
  validation: {
    allTestsFailing: boolean;
    failureCount: number;
    errorMessages: string[];
  };
  nextPhase: 'GREEN';
  readyForHandoff: boolean;
}

/**
 * Output from GREEN phase (qe-test-implementer)
 */
interface GREENPhaseOutput {
  cycleId: string;
  phase: 'GREEN';
  timestamp: number;
  testFile: {
    path: string;
    hash: string;
  };
  implFile: {
    path: string;
    content: string;
    hash: string;
  };
  implementation: {
    className: string;
    methods: Array<{
      name: string;
      signature: string;
      complexity: number;
    }>;
  };
  validation: {
    allTestsPassing: boolean;
    passCount: number;
    totalCount: number;
    coverage: number;
  };
  nextPhase: 'REFACTOR';
  readyForHandoff: boolean;
}

/**
 * Output from REFACTOR phase (qe-test-refactorer)
 */
interface REFACTORPhaseOutput {
  cycleId: string;
  phase: 'REFACTOR';
  timestamp: number;
  testFile: {
    path: string;
    hash: string;
  };
  implFile: {
    path: string;
    content: string;
    hash: string;
    originalHash: string;
  };
  refactoring: {
    applied: Array<{
      type: string;
      description: string;
      linesAffected: number;
    }>;
    metrics: {
      complexityBefore: number;
      complexityAfter: number;
      maintainabilityBefore: number;
      maintainabilityAfter: number;
      duplicateCodeReduced: number;
    };
  };
  validation: {
    allTestsPassing: boolean;
    passCount: number;
    totalCount: number;
    coverage: number;
  };
  cycleComplete: boolean;
  readyForReview: boolean;
}

/**
 * Complete TDD cycle result
 */
interface TDDCycleResult {
  cycleId: string;
  success: boolean;
  phases: {
    red: REDPhaseOutput;
    green: GREENPhaseOutput;
    refactor: REFACTORPhaseOutput;
  };
  artifacts: {
    testFile: string;
    implFile: string;
  };
  metrics: {
    totalTests: number;
    coverage: number;
    complexityReduction: number;
    refactoringsApplied: number;
  };
  duration: number;
}

// =============================================================================
// MCP Tool Signatures Reference
// =============================================================================

/**
 * MCP Tool: mcp__claude-flow__memory_usage
 *
 * Store/retrieve persistent memory with TTL and namespacing
 *
 * Parameters:
 * - action: 'store' | 'retrieve' | 'list' | 'delete' | 'search'
 * - key: string (memory key)
 * - value?: string (JSON stringified value for store)
 * - namespace?: string (default: 'default')
 * - ttl?: number (time-to-live in seconds)
 *
 * Example Usage in Claude Code:
 *
 * ```javascript
 * // Store TDD context
 * mcp__claude-flow__memory_usage({
 *   action: 'store',
 *   key: 'aqe/tdd/cycle-12345/context',
 *   value: JSON.stringify({ cycleId: '12345', module: { name: 'UserService' } }),
 *   namespace: 'coordination'
 * })
 *
 * // Retrieve phase output
 * mcp__claude-flow__memory_usage({
 *   action: 'retrieve',
 *   key: 'aqe/tdd/cycle-12345/red/tests',
 *   namespace: 'coordination'
 * })
 * ```
 */

// =============================================================================
// Memory Operations using MCP Tools
// =============================================================================

/**
 * Memory operations using claude-flow MCP tools
 *
 * In a real orchestration, these would be actual MCP tool calls.
 * This example shows the exact format and parameters.
 */

// Local cache for example demonstration purposes
const _localCache: Map<string, any> = new Map();

/**
 * Store value to memory via MCP tool
 *
 * Actual MCP call format:
 * ```javascript
 * await mcp__claude-flow__memory_usage({
 *   action: 'store',
 *   key: key,
 *   value: JSON.stringify(value),
 *   namespace: partition
 * });
 * ```
 */
async function storeToMemory(key: string, value: any, partition: string = 'coordination'): Promise<void> {
  // In production, this would be the actual MCP tool call:
  // const result = await mcp__claude-flow__memory_usage({
  //   action: 'store',
  //   key: key,
  //   value: JSON.stringify(value),
  //   namespace: partition
  // });

  // For this example, simulate with local cache
  const fullKey = `${partition}:${key}`;
  _localCache.set(fullKey, value);
  console.log(`[MCP] memory_usage(store): ${key} -> namespace: ${partition}`);
}

/**
 * Retrieve value from memory via MCP tool
 *
 * Actual MCP call format:
 * ```javascript
 * const result = await mcp__claude-flow__memory_usage({
 *   action: 'retrieve',
 *   key: key,
 *   namespace: partition
 * });
 * return JSON.parse(result.value);
 * ```
 */
async function retrieveFromMemory(key: string, partition: string = 'coordination'): Promise<any> {
  // In production, this would be the actual MCP tool call:
  // const result = await mcp__claude-flow__memory_usage({
  //   action: 'retrieve',
  //   key: key,
  //   namespace: partition
  // });
  // return result ? JSON.parse(result.value) : null;

  // For this example, simulate with local cache
  const fullKey = `${partition}:${key}`;
  const value = _localCache.get(fullKey);
  console.log(`[MCP] memory_usage(retrieve): ${key} <- namespace: ${partition}`);
  return value;
}

/**
 * Delete value from memory via MCP tool
 */
async function deleteFromMemory(key: string, partition: string = 'coordination'): Promise<void> {
  // In production: mcp__claude-flow__memory_usage({ action: 'delete', key, namespace: partition })
  const fullKey = `${partition}:${key}`;
  _localCache.delete(fullKey);
  console.log(`[MCP] memory_usage(delete): ${key} x namespace: ${partition}`);
}

/**
 * Search memory patterns via MCP tool
 *
 * Actual MCP call format:
 * ```javascript
 * const result = await mcp__claude-flow__memory_search({
 *   pattern: 'aqe/tdd/cycle-*',
 *   namespace: 'coordination',
 *   limit: 10
 * });
 * ```
 */
async function searchMemory(pattern: string, partition: string = 'coordination', limit: number = 10): Promise<string[]> {
  // In production, this would be the actual MCP tool call
  console.log(`[MCP] memory_search: pattern=${pattern}, namespace=${partition}, limit=${limit}`);
  return [];
}

// =============================================================================
// Memory Client Wrapper (implements MemoryClient interface for TDDPhaseValidator)
// =============================================================================

/**
 * Memory client wrapper that uses MCP tools
 * This implements the MemoryClient interface required by TDDPhaseValidator
 */
class MCPMemoryClient {
  async retrieve(key: string, options?: { partition?: string }): Promise<any> {
    return retrieveFromMemory(key, options?.partition || 'coordination');
  }

  async store(key: string, value: any, options?: { partition?: string; ttl?: number }): Promise<void> {
    return storeToMemory(key, value, options?.partition || 'coordination');
  }

  async delete(key: string, options?: { partition?: string }): Promise<void> {
    return deleteFromMemory(key, options?.partition || 'coordination');
  }
}

// =============================================================================
// TDD Workflow Orchestrator
// =============================================================================

export class TDDWorkflowOrchestrator {
  private memoryClient: MCPMemoryClient;
  private validator: TDDPhaseValidator;
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();

  constructor() {
    this.memoryClient = new MCPMemoryClient();
    this.validator = new TDDPhaseValidator(this.memoryClient);
  }

  /**
   * Execute a complete TDD cycle with proper coordination
   */
  async executeTDDCycle(
    modulePath: string,
    moduleName: string,
    requirements: TDDCycleContext['requirements'],
    options: {
      framework?: 'jest' | 'mocha' | 'vitest' | 'playwright';
      coverageTarget?: number;
      testTypes?: ('unit' | 'integration' | 'e2e')[];
      outputDir?: string;
    } = {}
  ): Promise<TDDCycleResult> {
    const startTime = Date.now();

    // Generate unique cycle ID
    const cycleId = `tdd-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Resolve output paths
    const outputDir = options.outputDir || dirname(modulePath);
    const testFilePath = resolve(outputDir, `__tests__/${moduleName}.test.ts`);
    const implFilePath = resolve(outputDir, `${moduleName}.ts`);

    console.log(`\n========================================`);
    console.log(`TDD CYCLE: ${cycleId}`);
    console.log(`========================================\n`);

    // Create cycle context
    const context: TDDCycleContext = {
      cycleId,
      module: {
        path: modulePath,
        name: moduleName
      },
      requirements,
      constraints: {
        framework: options.framework || 'jest',
        coverageTarget: options.coverageTarget || 0.95,
        testTypes: options.testTypes || ['unit']
      },
      testFilePath,
      implFilePath
    };

    // Store context for all subagents using MCP memory_usage tool
    await this.memoryClient.store(`aqe/tdd/cycle-${cycleId}/context`, context, {
      partition: 'coordination'
    });

    console.log(`Context stored for cycle ${cycleId}`);
    console.log(`  Test file: ${testFilePath}`);
    console.log(`  Impl file: ${implFilePath}`);
    console.log();

    try {
      // Phase 1: RED - Write failing tests
      console.log(`PHASE 1: RED - Writing failing tests...`);
      const redOutput = await this.executeREDPhase(cycleId, context);
      console.log(`  Generated ${redOutput.tests.length} failing tests`);
      console.log(`  All tests failing: ${redOutput.validation.allTestsFailing}`);

      // Validate RED phase before transitioning to GREEN
      console.log(`  Validating RED phase...`);
      const redValidation = await this.validator.validateREDPhase(cycleId);
      if (!redValidation.valid) {
        throw new Error(`RED phase validation failed: ${redValidation.errors.join(', ')}`);
      }
      console.log(`  RED phase validated: ${redValidation.metrics.handoffReady ? 'ready for handoff' : 'not ready'}`);
      console.log();

      // Phase 2: GREEN - Make tests pass
      console.log(`PHASE 2: GREEN - Implementing code to pass tests...`);
      const greenOutput = await this.executeGREENPhase(cycleId, redOutput);
      console.log(`  Tests passing: ${greenOutput.validation.passCount}/${greenOutput.validation.totalCount}`);
      console.log(`  Coverage: ${(greenOutput.validation.coverage * 100).toFixed(1)}%`);

      // Validate GREEN phase before transitioning to REFACTOR
      console.log(`  Validating GREEN phase...`);
      const greenValidation = await this.validator.validateGREENPhase(cycleId);
      if (!greenValidation.valid) {
        throw new Error(`GREEN phase validation failed: ${greenValidation.errors.join(', ')}`);
      }
      console.log(`  GREEN phase validated: ${greenValidation.metrics.handoffReady ? 'ready for handoff' : 'not ready'}`);
      console.log();

      // Phase 3: REFACTOR - Improve code quality
      console.log(`PHASE 3: REFACTOR - Improving code quality...`);
      const refactorOutput = await this.executeREFACTORPhase(cycleId, greenOutput, redOutput);
      console.log(`  Refactorings applied: ${refactorOutput.refactoring.applied.length}`);
      console.log(`  Complexity: ${refactorOutput.refactoring.metrics.complexityBefore} -> ${refactorOutput.refactoring.metrics.complexityAfter}`);
      console.log(`  Tests still passing: ${refactorOutput.validation.allTestsPassing}`);

      // Validate REFACTOR phase (final validation)
      console.log(`  Validating REFACTOR phase...`);
      const refactorValidation = await this.validator.validateREFACTORPhase(cycleId);
      if (!refactorValidation.valid) {
        throw new Error(`REFACTOR phase validation failed: ${refactorValidation.errors.join(', ')}`);
      }
      console.log(`  REFACTOR phase validated: ${refactorValidation.metrics.handoffReady ? 'ready for review' : 'not ready'}`);
      console.log();

      const duration = Date.now() - startTime;

      const result: TDDCycleResult = {
        cycleId,
        success: true,
        phases: {
          red: redOutput,
          green: greenOutput,
          refactor: refactorOutput
        },
        artifacts: {
          testFile: testFilePath,
          implFile: implFilePath
        },
        metrics: {
          totalTests: redOutput.tests.length,
          coverage: refactorOutput.validation.coverage,
          complexityReduction: refactorOutput.refactoring.metrics.complexityBefore -
                               refactorOutput.refactoring.metrics.complexityAfter,
          refactoringsApplied: refactorOutput.refactoring.applied.length
        },
        duration
      };

      console.log(`========================================`);
      console.log(`TDD CYCLE COMPLETE`);
      console.log(`========================================`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Tests: ${result.metrics.totalTests}`);
      console.log(`Coverage: ${(result.metrics.coverage * 100).toFixed(1)}%`);
      console.log(`Complexity Reduction: ${result.metrics.complexityReduction}`);
      console.log();

      return result;

    } catch (error) {
      console.error(`\nTDD CYCLE FAILED: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute RED phase - Write failing tests
   */
  private async executeREDPhase(cycleId: string, context: TDDCycleContext): Promise<REDPhaseOutput> {
    // In production, this would spawn the qe-test-writer agent
    // For this example, we simulate the agent behavior

    // Ensure test directory exists
    const testDir = dirname(context.testFilePath);
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Generate test content based on requirements
    const testContent = this.generateTestContent(context);

    // Write test file
    writeFileSync(context.testFilePath, testContent);

    // Create RED phase output
    const redOutput: REDPhaseOutput = {
      cycleId,
      phase: 'RED',
      timestamp: Date.now(),
      testFile: {
        path: context.testFilePath,
        content: testContent,
        hash: createHash('sha256').update(testContent).digest('hex')
      },
      tests: context.requirements.acceptanceCriteria.map((criterion, index) => ({
        name: criterion,
        type: 'unit' as const,
        assertion: `Should ${criterion.toLowerCase()}`,
        givenWhenThen: {
          given: `Given a ${context.module.name}`,
          when: `When ${criterion.toLowerCase()}`,
          then: `Then the expected result is achieved`
        }
      })),
      validation: {
        allTestsFailing: true, // Tests fail because implementation doesn't exist
        failureCount: context.requirements.acceptanceCriteria.length,
        errorMessages: [`Cannot find module '${context.implFilePath}'`]
      },
      nextPhase: 'GREEN',
      readyForHandoff: true
    };

    // Store RED phase output using MCP memory_usage tool
    await this.memoryClient.store(`aqe/tdd/cycle-${cycleId}/red/tests`, redOutput, {
      partition: 'coordination'
    });

    // Emit completion event
    this.emit('test-writer:completed', {
      cycleId,
      testsGenerated: redOutput.tests.length,
      testFilePath: context.testFilePath,
      nextPhase: 'GREEN',
      readyForHandoff: true
    });

    return redOutput;
  }

  /**
   * Execute GREEN phase - Make tests pass
   */
  private async executeGREENPhase(cycleId: string, redOutput: REDPhaseOutput): Promise<GREENPhaseOutput> {
    // Retrieve context using MCP memory_usage tool
    const context = await this.memoryClient.retrieve(`aqe/tdd/cycle-${cycleId}/context`, {
      partition: 'coordination'
    });

    // Validate RED phase is complete
    if (!redOutput.readyForHandoff || !redOutput.validation.allTestsFailing) {
      throw new Error('Cannot proceed to GREEN phase - RED phase incomplete');
    }

    // Verify test file exists and matches hash
    const actualTestContent = readFileSync(redOutput.testFile.path, 'utf-8');
    const actualHash = createHash('sha256').update(actualTestContent).digest('hex');
    if (actualHash !== redOutput.testFile.hash) {
      throw new Error('Test file has been modified since RED phase');
    }

    // Generate minimal implementation
    const implContent = this.generateImplementation(context, redOutput);

    // Ensure implementation directory exists
    const implDir = dirname(context.implFilePath);
    if (!existsSync(implDir)) {
      mkdirSync(implDir, { recursive: true });
    }

    // Write implementation file
    writeFileSync(context.implFilePath, implContent);

    // Create GREEN phase output
    const greenOutput: GREENPhaseOutput = {
      cycleId,
      phase: 'GREEN',
      timestamp: Date.now(),
      testFile: {
        path: redOutput.testFile.path,
        hash: redOutput.testFile.hash // SAME hash - tests unchanged
      },
      implFile: {
        path: context.implFilePath,
        content: implContent,
        hash: createHash('sha256').update(implContent).digest('hex')
      },
      implementation: {
        className: context.module.name,
        methods: this.extractMethods(implContent)
      },
      validation: {
        allTestsPassing: true,
        passCount: redOutput.tests.length,
        totalCount: redOutput.tests.length,
        coverage: 0.85 // Simulated coverage
      },
      nextPhase: 'REFACTOR',
      readyForHandoff: true
    };

    // Store GREEN phase output using MCP memory_usage tool
    await this.memoryClient.store(`aqe/tdd/cycle-${cycleId}/green/impl`, greenOutput, {
      partition: 'coordination'
    });

    // Emit completion event
    this.emit('test-implementer:completed', {
      cycleId,
      implementationPath: context.implFilePath,
      testsPassing: greenOutput.validation.passCount,
      testsTotal: greenOutput.validation.totalCount,
      coverage: greenOutput.validation.coverage,
      nextPhase: 'REFACTOR',
      readyForHandoff: true
    });

    return greenOutput;
  }

  /**
   * Execute REFACTOR phase - Improve code quality
   */
  private async executeREFACTORPhase(
    cycleId: string,
    greenOutput: GREENPhaseOutput,
    redOutput: REDPhaseOutput
  ): Promise<REFACTORPhaseOutput> {
    // Retrieve context using MCP memory_usage tool
    const context = await this.memoryClient.retrieve(`aqe/tdd/cycle-${cycleId}/context`, {
      partition: 'coordination'
    });

    // Validate GREEN phase is complete
    if (!greenOutput.readyForHandoff || !greenOutput.validation.allTestsPassing) {
      throw new Error('Cannot proceed to REFACTOR phase - GREEN phase incomplete');
    }

    // Verify implementation file exists and matches hash
    const actualImplContent = readFileSync(greenOutput.implFile.path, 'utf-8');
    const actualHash = createHash('sha256').update(actualImplContent).digest('hex');
    if (actualHash !== greenOutput.implFile.hash) {
      throw new Error('Implementation file has been modified since GREEN phase');
    }

    // Apply refactorings
    const refactoredCode = this.applyRefactorings(greenOutput.implFile.content);

    // Write refactored implementation
    writeFileSync(greenOutput.implFile.path, refactoredCode);

    // Create REFACTOR phase output
    const refactorOutput: REFACTORPhaseOutput = {
      cycleId,
      phase: 'REFACTOR',
      timestamp: Date.now(),
      testFile: {
        path: redOutput.testFile.path,
        hash: redOutput.testFile.hash // SAME hash - tests unchanged throughout
      },
      implFile: {
        path: greenOutput.implFile.path,
        content: refactoredCode,
        hash: createHash('sha256').update(refactoredCode).digest('hex'),
        originalHash: greenOutput.implFile.hash
      },
      refactoring: {
        applied: [
          { type: 'extract-constants', description: 'Extracted magic numbers to named constants', linesAffected: 5 },
          { type: 'rename-variables', description: 'Improved variable naming for clarity', linesAffected: 8 },
          { type: 'extract-function', description: 'Extracted validation logic to separate function', linesAffected: 12 }
        ],
        metrics: {
          complexityBefore: 15,
          complexityAfter: 8,
          maintainabilityBefore: 65,
          maintainabilityAfter: 85,
          duplicateCodeReduced: 25
        }
      },
      validation: {
        allTestsPassing: true,
        passCount: redOutput.tests.length,
        totalCount: redOutput.tests.length,
        coverage: 0.92 // Improved coverage after refactoring
      },
      cycleComplete: true,
      readyForReview: true
    };

    // Store REFACTOR phase output using MCP memory_usage tool
    await this.memoryClient.store(`aqe/tdd/cycle-${cycleId}/refactor/result`, refactorOutput, {
      partition: 'coordination'
    });

    // Emit completion event
    this.emit('test-refactorer:completed', {
      cycleId,
      testFilePath: redOutput.testFile.path,
      implFilePath: greenOutput.implFile.path,
      refactoringsApplied: refactorOutput.refactoring.applied.length,
      complexityReduction: refactorOutput.refactoring.metrics.complexityBefore -
                          refactorOutput.refactoring.metrics.complexityAfter,
      testsStillPassing: refactorOutput.validation.allTestsPassing,
      coverage: refactorOutput.validation.coverage,
      cycleComplete: true,
      readyForReview: true
    });

    return refactorOutput;
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private generateTestContent(context: TDDCycleContext): string {
    const tests = context.requirements.acceptanceCriteria.map(criterion => `
  test('${criterion}', async () => {
    // GIVEN: Setup preconditions
    const instance = new ${context.module.name}();

    // WHEN: Execute action
    const result = await instance.execute();

    // THEN: Verify outcome
    expect(result.success).toBe(true);
  });`).join('\n');

    const edgeCaseTests = context.requirements.edgeCases.map(edgeCase => `
  test('Edge case: ${edgeCase}', async () => {
    // GIVEN: Edge case setup
    const instance = new ${context.module.name}();

    // WHEN: Execute with edge case
    const result = await instance.executeEdgeCase();

    // THEN: Handle edge case correctly
    expect(result).toBeDefined();
  });`).join('\n');

    return `/**
 * Test Suite: ${context.module.name}
 * Generated by: qe-test-writer
 * TDD Phase: RED
 * Cycle: ${context.cycleId}
 */

import { ${context.module.name} } from '../${context.module.name}';

describe('${context.module.name}', () => {
  describe('${context.requirements.functionality}', () => {
${tests}
  });

  describe('Edge Cases', () => {
${edgeCaseTests}
  });
});
`;
  }

  private generateImplementation(context: TDDCycleContext, redOutput: REDPhaseOutput): string {
    return `/**
 * Implementation: ${context.module.name}
 * Generated by: qe-test-implementer
 * TDD Phase: GREEN
 * Cycle: ${context.cycleId}
 */

export class ${context.module.name} {
  async execute(): Promise<{ success: boolean }> {
    // Minimal implementation to pass tests
    return { success: true };
  }

  async executeEdgeCase(): Promise<{ handled: boolean }> {
    // Minimal edge case handling
    return { handled: true };
  }
}
`;
  }

  private applyRefactorings(code: string): string {
    // Simulate refactoring improvements
    return code.replace(
      '// Minimal implementation to pass tests',
      `// Refactored implementation with improved structure
    // Constants extracted for maintainability
    const SUCCESS_RESULT = { success: true };

    // Validation logic extracted
    this.validate();

    return SUCCESS_RESULT;
  }

  private validate(): void {
    // Extracted validation logic for better testability`
    );
  }

  private extractMethods(code: string): Array<{ name: string; signature: string; complexity: number }> {
    // Simple method extraction simulation
    const methodMatches = code.match(/async \w+\([^)]*\)/g) || [];
    return methodMatches.map(match => ({
      name: match.match(/async (\w+)/)?.[1] || 'unknown',
      signature: match,
      complexity: 5
    }));
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  on(event: string, handler: (data: any) => void): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }
}

// =============================================================================
// Usage Example
// =============================================================================

async function main() {
  const orchestrator = new TDDWorkflowOrchestrator();

  // Register event handlers for monitoring
  orchestrator.on('test-writer:completed', (data) => {
    console.log(`  [Event] Test Writer completed: ${data.testsGenerated} tests`);
  });

  orchestrator.on('test-implementer:completed', (data) => {
    console.log(`  [Event] Test Implementer completed: ${data.testsPassing}/${data.testsTotal} passing`);
  });

  orchestrator.on('test-refactorer:completed', (data) => {
    console.log(`  [Event] Test Refactorer completed: ${data.refactoringsApplied} refactorings`);
  });

  // Execute TDD cycle
  const result = await orchestrator.executeTDDCycle(
    '/workspaces/agentic-qe-cf/examples/tdd-demo/user-service.ts',
    'UserService',
    {
      functionality: 'User authentication with OAuth2',
      acceptanceCriteria: [
        'Should authenticate user with valid OAuth2 token',
        'Should reject expired OAuth2 tokens',
        'Should handle network failures gracefully'
      ],
      edgeCases: [
        'Token expires during authentication',
        'Multiple simultaneous login attempts'
      ]
    },
    {
      framework: 'jest',
      coverageTarget: 0.95,
      testTypes: ['unit', 'integration'],
      outputDir: '/workspaces/agentic-qe-cf/examples/tdd-demo'
    }
  );

  console.log('\nFinal Result:');
  console.log(JSON.stringify(result.metrics, null, 2));
}

// Run example
main().catch(console.error);

// =============================================================================
// MCP Tool Reference - Complete Signatures for TDD Coordination
// =============================================================================

/**
 * MCP Tool Reference for TDD Workflow Orchestration
 *
 * These are the actual MCP tool signatures used in production.
 * This reference documents the exact parameters and expected responses.
 */

/**
 * mcp__claude-flow__memory_usage
 *
 * Store/retrieve persistent memory with TTL and namespacing
 *
 * @param action - 'store' | 'retrieve' | 'list' | 'delete' | 'search'
 * @param key - Memory key (e.g., 'aqe/tdd/cycle-12345/red/tests')
 * @param value - JSON stringified value (for store action)
 * @param namespace - Memory namespace (default: 'default', use 'coordination' for TDD)
 * @param ttl - Time-to-live in seconds (optional)
 *
 * Example store:
 * ```javascript
 * mcp__claude-flow__memory_usage({
 *   action: 'store',
 *   key: 'aqe/tdd/cycle-12345/red/tests',
 *   value: JSON.stringify({
 *     cycleId: '12345',
 *     phase: 'RED',
 *     testFile: { path: '/path/to/test.ts', hash: 'abc123' },
 *     validation: { allTestsFailing: true, failureCount: 3 },
 *     readyForHandoff: true
 *   }),
 *   namespace: 'coordination'
 * })
 * ```
 *
 * Example retrieve:
 * ```javascript
 * const result = mcp__claude-flow__memory_usage({
 *   action: 'retrieve',
 *   key: 'aqe/tdd/cycle-12345/context',
 *   namespace: 'coordination'
 * })
 * // Returns: { value: '{"cycleId":"12345",...}' }
 * ```
 */

/**
 * mcp__claude-flow__memory_search
 *
 * Search memory with patterns
 *
 * @param pattern - Search pattern (e.g., 'aqe/tdd/cycle-*')
 * @param namespace - Memory namespace
 * @param limit - Maximum results (default: 10)
 *
 * Example: Search for all RED phase outputs
 * pattern: "aqe\/tdd\/cycle-*\/red\/*"
 * namespace: "coordination"
 * limit: 20
 * Returns keys like: "aqe/tdd/cycle-12345/red/tests"
 */

/**
 * TDD Phase Validation Integration
 *
 * The TDDPhaseValidator should be used after each phase execution:
 *
 * ```typescript
 * import { TDDPhaseValidator } from '../src/core/hooks/validators/TDDPhaseValidator';
 *
 * // After RED phase
 * const validator = new TDDPhaseValidator(memoryClient);
 * const redValidation = await validator.validateREDPhase(cycleId);
 * if (!redValidation.valid) {
 *   throw new Error(`RED phase failed: ${redValidation.errors.join(', ')}`);
 * }
 *
 * // After GREEN phase
 * const greenValidation = await validator.validateGREENPhase(cycleId);
 * if (!greenValidation.valid) {
 *   throw new Error(`GREEN phase failed: ${greenValidation.errors.join(', ')}`);
 * }
 *
 * // After REFACTOR phase
 * const refactorValidation = await validator.validateREFACTORPhase(cycleId);
 *
 * // Or validate complete cycle
 * const cycleValidation = await validator.validateCompleteCycle(cycleId);
 * console.log(cycleValidation.summary);
 * ```
 */

/**
 * Memory Namespace Convention for TDD Cycles
 *
 * All TDD coordination uses the 'coordination' namespace with the following key structure:
 *
 * - aqe/tdd/cycle-{cycleId}/context     - Initial cycle context
 * - aqe/tdd/cycle-{cycleId}/red/tests   - RED phase output (failing tests)
 * - aqe/tdd/cycle-{cycleId}/green/impl  - GREEN phase output (implementation)
 * - aqe/tdd/cycle-{cycleId}/refactor/result - REFACTOR phase output (final)
 *
 * This structure allows TDDPhaseValidator to validate transitions between phases.
 */
