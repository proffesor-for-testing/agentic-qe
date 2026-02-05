/**
 * Handler Factory Tests
 *
 * Comprehensive tests for the MCP handler factory pattern.
 * Tests cover:
 * - Factory function creation
 * - Fleet initialization checks
 * - Task routing integration
 * - Task submission and execution
 * - Response mapping
 * - Error handling
 * - V2-compatible response utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDomainHandler,
  DomainHandlerConfig,
  BaseHandlerResult,
  generateTestId,
  generateAgentId,
  generateV2LearningFeedback,
  analyzeComplexity,
  generateV2AIInsights,
  generateV2Tests,
  detectAntiPatterns,
  resetTaskExecutor,
} from '../../../../src/mcp/handlers/handler-factory';
import * as coreHandlers from '../../../../src/mcp/handlers/core-handlers';
import * as taskRouter from '../../../../src/mcp/services/task-router';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../../src/mcp/handlers/core-handlers', () => ({
  isFleetInitialized: vi.fn(),
  getFleetState: vi.fn(),
}));

vi.mock('../../../../src/mcp/services/task-router', () => ({
  getTaskRouter: vi.fn(),
}));

vi.mock('../../../../src/coordination/task-executor', () => ({
  createTaskExecutor: vi.fn(() => ({
    execute: vi.fn(),
  })),
}));

// ============================================================================
// Test Utilities
// ============================================================================

interface TestParams {
  value: string;
  optional?: number;
}

interface TestResult extends BaseHandlerResult {
  processedValue: string;
  optionalResult?: number;
}

const createTestConfig = (): DomainHandlerConfig<TestParams, TestResult> => ({
  domain: 'test-generation',
  taskType: 'generate-tests',
  priority: 'p1',
  defaultTimeout: 60000,
  buildTaskDescription: (params) => `Test task for ${params.value}`,
  mapToPayload: (params, routing) => ({
    value: params.value,
    optional: params.optional,
    routingTier: routing?.decision.tier,
  }),
  mapToResult: (taskId, data, duration, savedFiles, params) => ({
    taskId,
    status: 'completed',
    duration,
    savedFiles,
    processedValue: (data.processed as string) || params?.value || '',
    optionalResult: data.optionalResult as number | undefined,
  }),
});

const mockQueen = {
  submitTask: vi.fn(),
  getTaskStatus: vi.fn(),
};

const mockExecutor = {
  execute: vi.fn(),
};

const mockRouter = {
  routeTask: vi.fn(),
};

// ============================================================================
// Test Setup
// ============================================================================

describe('Handler Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTaskExecutor();

    // Default mock setup
    vi.mocked(coreHandlers.isFleetInitialized).mockReturnValue(true);
    vi.mocked(coreHandlers.getFleetState).mockReturnValue({
      queen: mockQueen,
      kernel: { id: 'test-kernel' },
      fleetId: 'test-fleet',
      topology: 'hierarchical',
      maxAgents: 10,
      enabledDomains: ['test-generation'],
      initialized: true,
      startedAt: Date.now(),
    } as ReturnType<typeof coreHandlers.getFleetState>);
    vi.mocked(taskRouter.getTaskRouter).mockResolvedValue(mockRouter as unknown as Awaited<ReturnType<typeof taskRouter.getTaskRouter>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Factory Creation Tests
  // ============================================================================

  describe('createDomainHandler', () => {
    it('should create a handler function from config', () => {
      const config = createTestConfig();
      const handler = createDomainHandler(config);

      expect(typeof handler).toBe('function');
    });

    it('should return error when fleet is not initialized', async () => {
      vi.mocked(coreHandlers.isFleetInitialized).mockReturnValue(false);

      const config = createTestConfig();
      const handler = createDomainHandler(config);
      const result = await handler({ value: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should route task through model router', async () => {
      mockRouter.routeTask.mockResolvedValue({
        decision: { tier: 2, model: 'haiku' },
        useAgentBooster: false,
      });
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue({
        task: { id: 'task-123', type: 'generate-tests' },
      });
      mockExecutor.execute.mockResolvedValue({
        success: true,
        data: { processed: 'test-processed' },
        duration: 100,
      });

      // Re-mock the task executor
      const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
      vi.mocked(createTaskExecutor).mockReturnValue(mockExecutor as unknown as ReturnType<typeof createTaskExecutor>);

      const config = createTestConfig();
      const handler = createDomainHandler(config);
      await handler({ value: 'test-value' });

      expect(mockRouter.routeTask).toHaveBeenCalledWith({
        task: 'Test task for test-value',
        domain: 'test-generation',
        codeContext: undefined,
        agentType: 'qe-test-generation',
        enablePatternSearch: true,
        patternHints: undefined,
      });
    });

    it('should submit task with correct payload', async () => {
      mockRouter.routeTask.mockResolvedValue({
        decision: { tier: 2, model: 'haiku' },
        useAgentBooster: false,
      });
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue({
        task: { id: 'task-123', type: 'generate-tests' },
      });
      mockExecutor.execute.mockResolvedValue({
        success: true,
        data: { processed: 'result' },
        duration: 100,
      });

      const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
      vi.mocked(createTaskExecutor).mockReturnValue(mockExecutor as unknown as ReturnType<typeof createTaskExecutor>);

      const config = createTestConfig();
      const handler = createDomainHandler(config);
      await handler({ value: 'test-value', optional: 42 });

      expect(mockQueen.submitTask).toHaveBeenCalledWith({
        type: 'generate-tests',
        priority: 'p1',
        targetDomains: ['test-generation'],
        payload: {
          value: 'test-value',
          optional: 42,
          routingTier: 2,
        },
        timeout: 60000,
      });
    });

    it('should handle task submission failure', async () => {
      mockRouter.routeTask.mockResolvedValue(null);
      mockQueen.submitTask.mockResolvedValue({
        success: false,
        error: { message: 'Task queue full' },
      });

      const config = createTestConfig();
      const handler = createDomainHandler(config);
      const result = await handler({ value: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task queue full');
    });

    it('should handle task not found after submission', async () => {
      mockRouter.routeTask.mockResolvedValue(null);
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue(null);

      const config = createTestConfig();
      const handler = createDomainHandler(config);
      const result = await handler({ value: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found after submission');
    });

    it('should handle task execution failure', async () => {
      mockRouter.routeTask.mockResolvedValue(null);
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue({
        task: { id: 'task-123', type: 'generate-tests' },
      });
      mockExecutor.execute.mockResolvedValue({
        success: false,
        error: 'Execution timeout',
      });

      const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
      vi.mocked(createTaskExecutor).mockReturnValue(mockExecutor as unknown as ReturnType<typeof createTaskExecutor>);

      const config = createTestConfig();
      const handler = createDomainHandler(config);
      const result = await handler({ value: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution timeout');
    });

    it('should map successful result correctly', async () => {
      mockRouter.routeTask.mockResolvedValue(null);
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue({
        task: { id: 'task-123', type: 'generate-tests' },
      });
      mockExecutor.execute.mockResolvedValue({
        success: true,
        data: { processed: 'processed-value', optionalResult: 99 },
        duration: 150,
        savedFiles: ['output.json'],
      });

      const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
      vi.mocked(createTaskExecutor).mockReturnValue(mockExecutor as unknown as ReturnType<typeof createTaskExecutor>);

      const config = createTestConfig();
      const handler = createDomainHandler(config);
      const result = await handler({ value: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        taskId: 'task-123',
        status: 'completed',
        duration: 150,
        savedFiles: ['output.json'],
        processedValue: 'processed-value',
        optionalResult: 99,
      });
    });

    it('should handle exceptions gracefully', async () => {
      mockRouter.routeTask.mockRejectedValue(new Error('Router crashed'));
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue({
        task: { id: 'task-123', type: 'generate-tests' },
      });
      mockExecutor.execute.mockResolvedValue({
        success: true,
        data: {},
        duration: 100,
      });

      const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
      vi.mocked(createTaskExecutor).mockReturnValue(mockExecutor as unknown as ReturnType<typeof createTaskExecutor>);

      // Routing failure should be logged but not fail the handler
      const config = createTestConfig();
      const handler = createDomainHandler(config);
      const result = await handler({ value: 'test' });

      expect(result.success).toBe(true);
    });

    it('should use custom timeout calculator', async () => {
      mockRouter.routeTask.mockResolvedValue(null);
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue({
        task: { id: 'task-123', type: 'generate-tests' },
      });
      mockExecutor.execute.mockResolvedValue({
        success: true,
        data: {},
        duration: 100,
      });

      const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
      vi.mocked(createTaskExecutor).mockReturnValue(mockExecutor as unknown as ReturnType<typeof createTaskExecutor>);

      const config = createTestConfig();
      config.calculateTimeout = (params) => (params.optional || 1) * 1000;

      const handler = createDomainHandler(config);
      await handler({ value: 'test', optional: 120 });

      expect(mockQueen.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 120000,
        })
      );
    });

    it('should include code context for routing when configured', async () => {
      mockRouter.routeTask.mockResolvedValue(null);
      mockQueen.submitTask.mockResolvedValue({
        success: true,
        value: 'task-123',
      });
      mockQueen.getTaskStatus.mockReturnValue({
        task: { id: 'task-123', type: 'generate-tests' },
      });
      mockExecutor.execute.mockResolvedValue({
        success: true,
        data: {},
        duration: 100,
      });

      const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
      vi.mocked(createTaskExecutor).mockReturnValue(mockExecutor as unknown as ReturnType<typeof createTaskExecutor>);

      const config = createTestConfig();
      config.includeCodeContext = (params) => `code: ${params.value}`;

      const handler = createDomainHandler(config);
      await handler({ value: 'test-code' });

      expect(mockRouter.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          codeContext: 'code: test-code',
        })
      );
    });
  });

  // ============================================================================
  // V2-Compatible Utility Tests
  // ============================================================================

  describe('generateTestId', () => {
    it('should generate unique test IDs', () => {
      const id1 = generateTestId();
      const id2 = generateTestId();

      expect(id1).toMatch(/^test-[0-9a-f-]{36}$/);
      expect(id2).toMatch(/^test-[0-9a-f-]{36}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateAgentId', () => {
    it('should generate agent IDs with type prefix', () => {
      const id = generateAgentId('test-generator');

      expect(id).toMatch(/^test-generator-[0-9a-f-]{36}$/);
    });
  });

  describe('generateV2LearningFeedback', () => {
    it('should generate learning feedback structure', () => {
      const feedback = generateV2LearningFeedback('test-agent');

      expect(feedback.enabled).toBe(true);
      expect(feedback.agentId).toMatch(/^test-agent-/);
      expect(feedback.message).toContain('patterns and Q-values updated');
    });
  });

  describe('analyzeComplexity', () => {
    it('should analyze low complexity code', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const result = analyzeComplexity(code);

      expect(result.level).toBe('low');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should analyze medium complexity code', () => {
      const code = `
        function test() {
          if (a) { return 1; }
          if (b) { return 2; }
          if (c) { return 3; }
        }
      `;
      const result = analyzeComplexity(code);

      expect(result.level).toBe('medium');
    });

    it('should analyze high complexity code', () => {
      const code = `
        function complex() {
          if (a) { return 1; }
          if (b) { return 2; }
          if (c) { return 3; }
          for (let i = 0; i < 10; i++) {}
          while (true) { break; }
          switch (x) { case 1: break; }
        }
      `;
      const result = analyzeComplexity(code);

      expect(result.level).toBe('high');
    });
  });

  describe('generateV2AIInsights', () => {
    it('should generate insights for high complexity code', () => {
      const complexity = { score: 100, level: 'high' as const };
      const insights = generateV2AIInsights(complexity, 'unit');

      expect(insights.recommendations).toContain('Consider refactoring complex functions');
      expect(insights.recommendations).toContain('Add unit tests for each branch');
      expect(insights.confidence).toBe(0.85);
    });

    it('should add integration-specific recommendations', () => {
      const complexity = { score: 50, level: 'medium' as const };
      const insights = generateV2AIInsights(complexity, 'integration');

      expect(insights.recommendations).toContain('Add mock external dependencies');
      expect(insights.recommendations).toContain('Test API contract boundaries');
    });

    it('should calculate estimated time from complexity', () => {
      const complexity = { score: 100, level: 'high' as const };
      const insights = generateV2AIInsights(complexity, 'unit');

      expect(insights.estimatedTime).toBe('50 minutes');
    });
  });

  describe('generateV2Tests', () => {
    it('should generate tests for functions in source code', () => {
      const code = `
        function add(a, b) { return a + b; }
        function subtract(a, b) { return a - b; }
      `;
      const tests = generateV2Tests(code, 'unit', 'javascript', 5);

      expect(tests.length).toBeGreaterThan(0);
      expect(tests[0].type).toBe('unit');
      expect(tests[0].aiGenerated).toBe(true);
    });

    it('should add integration tests when test type is integration', () => {
      const code = 'function test() {}';
      const tests = generateV2Tests(code, 'integration', 'typescript', 3);

      const hasIntegrationTest = tests.some(t => t.type === 'integration');
      expect(hasIntegrationTest).toBe(true);
    });

    it('should include edge case tests', () => {
      const code = 'function test() {}';
      const tests = generateV2Tests(code, 'unit', 'typescript', 10);

      const edgeCaseTests = tests.filter(t => t.name.includes('edge_case'));
      expect(edgeCaseTests.length).toBeGreaterThan(0);
    });

    it('should set appropriate duration for integration tests', () => {
      const code = 'function test() {}';
      const tests = generateV2Tests(code, 'integration', 'typescript', 3);

      const integrationTest = tests.find(t => t.type === 'integration');
      expect(integrationTest?.estimatedDuration).toBe(2000);
    });
  });

  describe('detectAntiPatterns', () => {
    it('should detect eval usage', () => {
      const code = 'eval("malicious code")';
      const patterns = detectAntiPatterns(code, 'javascript');

      expect(patterns).toContainEqual(
        expect.objectContaining({
          type: 'dangerous-eval',
          severity: 'critical',
        })
      );
    });

    it('should detect var usage in JavaScript/TypeScript', () => {
      const code = 'var x = 1;';
      const patterns = detectAntiPatterns(code, 'javascript');

      expect(patterns).toContainEqual(
        expect.objectContaining({
          type: 'var-usage',
          severity: 'low',
        })
      );
    });

    it('should detect any type in TypeScript', () => {
      const code = 'const x: any = {}';
      const patterns = detectAntiPatterns(code, 'typescript');

      expect(patterns).toContainEqual(
        expect.objectContaining({
          type: 'any-type',
          severity: 'medium',
        })
      );
    });

    it('should not flag var in non-JS languages', () => {
      const code = 'var x = 1';
      const patterns = detectAntiPatterns(code, 'python');

      const varPattern = patterns.find(p => p.type === 'var-usage');
      expect(varPattern).toBeUndefined();
    });

    it('should not flag any in non-TS languages', () => {
      const code = 'any value = 1';
      const patterns = detectAntiPatterns(code, 'go');

      const anyPattern = patterns.find(p => p.type === 'any-type');
      expect(anyPattern).toBeUndefined();
    });
  });

  // ============================================================================
  // Handler Registry Tests
  // ============================================================================

  describe('Domain Handler Registry', () => {
    it('should export all 11 domain handlers', async () => {
      const { domainHandlers } = await import('../../../../src/mcp/handlers/domain-handlers');

      expect(Object.keys(domainHandlers)).toHaveLength(11);
      expect(domainHandlers).toHaveProperty('test-generation');
      expect(domainHandlers).toHaveProperty('test-execution');
      expect(domainHandlers).toHaveProperty('coverage-analysis');
      expect(domainHandlers).toHaveProperty('quality-assessment');
      expect(domainHandlers).toHaveProperty('security-compliance');
      expect(domainHandlers).toHaveProperty('contract-testing');
      expect(domainHandlers).toHaveProperty('visual-accessibility');
      expect(domainHandlers).toHaveProperty('chaos-resilience');
      expect(domainHandlers).toHaveProperty('defect-intelligence');
      expect(domainHandlers).toHaveProperty('requirements-validation');
      expect(domainHandlers).toHaveProperty('code-intelligence');
    });

    it('should provide hasHandler utility', async () => {
      const { hasHandler } = await import('../../../../src/mcp/handlers/domain-handlers');

      expect(hasHandler('test-generation')).toBe(true);
      expect(hasHandler('unknown-domain')).toBe(false);
    });

    it('should provide getHandlerByDomain utility', async () => {
      const { getHandlerByDomain } = await import('../../../../src/mcp/handlers/domain-handlers');

      const handler = getHandlerByDomain('test-generation');
      expect(typeof handler).toBe('function');
    });
  });

  // ============================================================================
  // Integration Tests (Handler Configs)
  // ============================================================================

  describe('Domain Handler Configurations', () => {
    it('should have valid test generation config', async () => {
      const { testGenerateConfig } = await import('../../../../src/mcp/handlers/domain-handler-configs');

      expect(testGenerateConfig.domain).toBe('test-generation');
      expect(testGenerateConfig.taskType).toBe('generate-tests');
      expect(typeof testGenerateConfig.buildTaskDescription).toBe('function');
      expect(typeof testGenerateConfig.mapToPayload).toBe('function');
      expect(typeof testGenerateConfig.mapToResult).toBe('function');
    });

    it('should build correct task description for test generation', async () => {
      const { testGenerateConfig } = await import('../../../../src/mcp/handlers/domain-handler-configs');

      const description = testGenerateConfig.buildTaskDescription({
        testType: 'integration',
        language: 'python',
      });

      expect(description).toBe('Generate integration tests for python code');
    });

    it('should map test generation payload correctly', async () => {
      const { testGenerateConfig } = await import('../../../../src/mcp/handlers/domain-handler-configs');

      const payload = testGenerateConfig.mapToPayload(
        {
          sourceCode: 'function test() {}',
          language: 'typescript',
          testType: 'unit',
          coverageGoal: 90,
        },
        { decision: { tier: 2, model: 'haiku' }, useAgentBooster: false } as unknown as Parameters<typeof testGenerateConfig.mapToPayload>[1]
      );

      expect(payload.sourceCode).toBe('function test() {}');
      expect(payload.language).toBe('typescript');
      expect(payload.testType).toBe('unit');
      expect(payload.coverageGoal).toBe(90);
      expect(payload.routingTier).toBe(2);
    });

    it('should have valid security scan config with priority p0', async () => {
      const { securityScanConfig } = await import('../../../../src/mcp/handlers/domain-handler-configs');

      expect(securityScanConfig.domain).toBe('security-compliance');
      expect(securityScanConfig.priority).toBe('p0');
      expect(securityScanConfig.defaultTimeout).toBe(600000);
    });

    it('should have chaos test config with custom timeout calculator', async () => {
      const { chaosTestConfig } = await import('../../../../src/mcp/handlers/domain-handler-configs');

      expect(chaosTestConfig.calculateTimeout).toBeDefined();
      const timeout = chaosTestConfig.calculateTimeout!({ duration: 60000 });
      expect(timeout).toBe(120000); // duration + 60000
    });
  });
});
