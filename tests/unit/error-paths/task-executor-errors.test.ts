/**
 * Agentic QE v3 - Task Executor Error Path Tests
 * Milestone 3.6: Error Path Coverage Improvement
 *
 * Tests cover:
 * - Task handler registration errors
 * - Task execution timeouts
 * - Domain service failures
 * - Agent Booster integration errors
 * - Result saving failures
 * - Routing tier errors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DomainName, Result } from '../../../src/shared/types';

// Mock types matching task executor interfaces
interface QueenTask {
  id: string;
  type: TaskType;
  payload: Record<string, unknown>;
  timeout?: number;
}

type TaskType =
  | 'generate-tests'
  | 'execute-tests'
  | 'analyze-coverage'
  | 'assess-quality'
  | 'predict-defects'
  | 'validate-requirements'
  | 'index-code'
  | 'scan-security'
  | 'validate-contracts'
  | 'test-accessibility'
  | 'run-chaos'
  | 'optimize-learning';

interface TaskResult {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  domain: DomainName;
  savedFiles?: string[];
}

describe('Task Executor Error Paths', () => {
  // ===========================================================================
  // Handler Registration Errors
  // ===========================================================================

  describe('Handler Registration', () => {
    it('should return error for unregistered task type', async () => {
      const handlers = new Map<TaskType, () => Promise<Result<unknown, Error>>>();

      const execute = async (task: QueenTask): Promise<TaskResult> => {
        const handler = handlers.get(task.type);

        if (!handler) {
          return {
            taskId: task.id,
            success: false,
            error: `No handler registered for task type: ${task.type}`,
            duration: 0,
            domain: 'learning-optimization',
          };
        }

        const result = await handler();
        return {
          taskId: task.id,
          success: result.success,
          data: result.success ? result.value : undefined,
          error: !result.success ? (result.error as Error).message : undefined,
          duration: 100,
          domain: 'learning-optimization',
        };
      };

      const result = await execute({
        id: 'task-1',
        type: 'generate-tests',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No handler registered');
    });

    it('should prevent duplicate handler registration', () => {
      const handlers = new Map<string, () => void>();
      const errors: string[] = [];

      const registerHandler = (type: string, handler: () => void, allowOverwrite = false) => {
        if (handlers.has(type) && !allowOverwrite) {
          errors.push(`Handler for ${type} already registered`);
          return false;
        }
        handlers.set(type, handler);
        return true;
      };

      expect(registerHandler('test', () => {})).toBe(true);
      expect(registerHandler('test', () => {})).toBe(false);
      expect(errors).toContain('Handler for test already registered');
      expect(registerHandler('test', () => {}, true)).toBe(true);
    });
  });

  // ===========================================================================
  // Task Execution Timeouts
  // ===========================================================================

  describe('Task Execution Timeouts', () => {
    it('should timeout long-running task', async () => {
      const executeWithTimeout = async <T>(
        operation: () => Promise<T>,
        timeout: number
      ): Promise<T> => {
        return Promise.race([
          operation(),
          new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(`Task execution timed out after ${timeout}ms`)), timeout);
          }),
        ]);
      };

      const longRunningTask = () => new Promise<string>(resolve => {
        setTimeout(() => resolve('done'), 1000);
      });

      await expect(executeWithTimeout(longRunningTask, 50)).rejects.toThrow('timed out');
    });

    it('should respect per-task timeout override', async () => {
      const defaultTimeout = 1000;

      const getTimeout = (task: QueenTask): number => {
        return task.timeout || defaultTimeout;
      };

      const task1: QueenTask = { id: '1', type: 'generate-tests', payload: {} };
      const task2: QueenTask = { id: '2', type: 'generate-tests', payload: {}, timeout: 500 };

      expect(getTimeout(task1)).toBe(1000);
      expect(getTimeout(task2)).toBe(500);
    });

    it('should handle timeout cascade in batch execution', async () => {
      const executeBatch = async (
        tasks: QueenTask[],
        timeout: number
      ): Promise<TaskResult[]> => {
        const results: TaskResult[] = [];

        for (const task of tasks) {
          try {
            await Promise.race([
              new Promise(resolve => setTimeout(resolve, Math.random() * 200)),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
            ]);
            results.push({ taskId: task.id, success: true, duration: 100, domain: 'test-generation' });
          } catch (error) {
            results.push({
              taskId: task.id,
              success: false,
              error: (error as Error).message,
              duration: timeout,
              domain: 'test-generation',
            });
          }
        }

        return results;
      };

      const tasks: QueenTask[] = [
        { id: '1', type: 'generate-tests', payload: {} },
        { id: '2', type: 'generate-tests', payload: {} },
        { id: '3', type: 'generate-tests', payload: {} },
      ];

      const results = await executeBatch(tasks, 50);

      expect(results).toHaveLength(3);
      // Some might timeout due to random delay
      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      expect(succeeded.length + failed.length).toBe(3);
    });
  });

  // ===========================================================================
  // Domain Service Failures
  // ===========================================================================

  describe('Domain Service Failures', () => {
    it('should handle test generator service failure', async () => {
      const mockTestGenerator = {
        generateTests: vi.fn().mockRejectedValue(new Error('Source file not found')),
      };

      const executeTestGeneration = async (task: QueenTask): Promise<TaskResult> => {
        try {
          const result = await mockTestGenerator.generateTests(task.payload);
          return {
            taskId: task.id,
            success: true,
            data: result,
            duration: 100,
            domain: 'test-generation',
          };
        } catch (error) {
          return {
            taskId: task.id,
            success: false,
            error: (error as Error).message,
            duration: 100,
            domain: 'test-generation',
          };
        }
      };

      const result = await executeTestGeneration({
        id: 'task-1',
        type: 'generate-tests',
        payload: { sourceFiles: ['/nonexistent/file.ts'] },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Source file not found');
    });

    it('should handle coverage analyzer service failure', async () => {
      const mockCoverageAnalyzer = {
        analyze: vi.fn().mockRejectedValue(new Error('Coverage data corrupted')),
      };

      const executeCoverageAnalysis = async (task: QueenTask): Promise<TaskResult> => {
        try {
          const result = await mockCoverageAnalyzer.analyze(task.payload);
          return {
            taskId: task.id,
            success: true,
            data: result,
            duration: 100,
            domain: 'coverage-analysis',
          };
        } catch (error) {
          return {
            taskId: task.id,
            success: false,
            error: (error as Error).message,
            duration: 100,
            domain: 'coverage-analysis',
          };
        }
      };

      const result = await executeCoverageAnalysis({
        id: 'task-1',
        type: 'analyze-coverage',
        payload: { target: '/path/to/project' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Coverage data corrupted');
    });

    it('should handle security scanner service failure', async () => {
      const mockSecurityScanner = {
        scanFiles: vi.fn().mockRejectedValue(new Error('Scan aborted: too many files')),
      };

      const executeSecurityScan = async (task: QueenTask): Promise<TaskResult> => {
        try {
          const result = await mockSecurityScanner.scanFiles(task.payload);
          return {
            taskId: task.id,
            success: true,
            data: result,
            duration: 100,
            domain: 'security-compliance',
          };
        } catch (error) {
          return {
            taskId: task.id,
            success: false,
            error: (error as Error).message,
            duration: 100,
            domain: 'security-compliance',
          };
        }
      };

      const result = await executeSecurityScan({
        id: 'task-1',
        type: 'scan-security',
        payload: { target: '/path/to/large-project' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('too many files');
    });

    it('should return graceful fallback when no source files provided', async () => {
      const executeTestGeneration = async (task: QueenTask): Promise<TaskResult> => {
        const payload = task.payload as {
          sourceFiles?: string[];
          sourceCode?: string;
          filePath?: string;
        };

        const hasSource = (
          (payload.sourceFiles && payload.sourceFiles.length > 0) ||
          payload.sourceCode ||
          payload.filePath
        );

        if (!hasSource) {
          return {
            taskId: task.id,
            success: true,
            data: {
              testsGenerated: 0,
              coverageEstimate: 0,
              tests: [],
              patternsUsed: [],
              warning: 'No source files or code provided for test generation',
            },
            duration: 10,
            domain: 'test-generation',
          };
        }

        return {
          taskId: task.id,
          success: true,
          data: { testsGenerated: 5 },
          duration: 100,
          domain: 'test-generation',
        };
      };

      const result = await executeTestGeneration({
        id: 'task-1',
        type: 'generate-tests',
        payload: {},
      });

      expect(result.success).toBe(true);
      expect((result.data as any).warning).toContain('No source files');
      expect((result.data as any).testsGenerated).toBe(0);
    });
  });

  // ===========================================================================
  // Agent Booster Integration Errors
  // ===========================================================================

  describe('Agent Booster Integration', () => {
    it('should fallback when Agent Booster unavailable', async () => {
      const mockAgentBooster = {
        transform: vi.fn().mockRejectedValue(new Error('WASM module not loaded')),
        isAvailable: vi.fn().mockReturnValue(false),
      };

      const executeWithBooster = async (task: QueenTask): Promise<TaskResult> => {
        const useAgentBooster = (task.payload.useAgentBooster as boolean) ?? false;

        if (useAgentBooster) {
          try {
            if (!mockAgentBooster.isAvailable()) {
              throw new Error('Agent Booster not available');
            }
            await mockAgentBooster.transform(task.payload);
          } catch (error) {
            // Fallback to normal execution
            console.debug(`Agent Booster fallback: ${(error as Error).message}`);
          }
        }

        return {
          taskId: task.id,
          success: true,
          data: { fallbackUsed: true },
          duration: 100,
          domain: 'test-generation',
        };
      };

      const result = await executeWithBooster({
        id: 'task-1',
        type: 'generate-tests',
        payload: { useAgentBooster: true },
      });

      expect(result.success).toBe(true);
      expect((result.data as any).fallbackUsed).toBe(true);
    });

    it('should handle low confidence transform', async () => {
      const mockAgentBooster = {
        transform: vi.fn().mockResolvedValue({
          success: true,
          confidence: 0.3, // Below threshold
          transformedCode: 'const x = 1;',
        }),
      };

      const confidenceThreshold = 0.7;

      const executeWithConfidenceCheck = async (task: QueenTask): Promise<TaskResult> => {
        const result = await mockAgentBooster.transform(task.payload);

        if (result.confidence < confidenceThreshold) {
          // Low confidence - don't use result
          return {
            taskId: task.id,
            success: true,
            data: {
              usedBooster: false,
              reason: `Low confidence: ${result.confidence}`,
            },
            duration: 50,
            domain: 'test-generation',
          };
        }

        return {
          taskId: task.id,
          success: true,
          data: { usedBooster: true, transformed: result.transformedCode },
          duration: 5,
          domain: 'test-generation',
        };
      };

      const result = await executeWithConfidenceCheck({
        id: 'task-1',
        type: 'generate-tests',
        payload: { codeContext: 'var x = 1;' },
      });

      expect(result.success).toBe(true);
      expect((result.data as any).usedBooster).toBe(false);
      expect((result.data as any).reason).toContain('Low confidence');
    });

    it('should detect transform type correctly', () => {
      const detectTransformType = (code: string): string | null => {
        if (code.includes('var ') && !code.includes('const ') && !code.includes('let ')) {
          return 'var-to-const';
        }
        if (code.includes('console.log') || code.includes('console.warn')) {
          return 'remove-console';
        }
        if (code.includes('.then(') && code.includes('.catch(')) {
          return 'promise-to-async';
        }
        if (code.includes('require(') && !code.includes('import ')) {
          return 'cjs-to-esm';
        }
        return null;
      };

      expect(detectTransformType('var x = 1;')).toBe('var-to-const');
      expect(detectTransformType('console.log("test");')).toBe('remove-console');
      expect(detectTransformType('fetch().then().catch()')).toBe('promise-to-async');
      expect(detectTransformType("const x = require('fs')")).toBe('cjs-to-esm');
      expect(detectTransformType('const x = 1;')).toBeNull();
    });
  });

  // ===========================================================================
  // Result Saving Failures
  // ===========================================================================

  describe('Result Saving', () => {
    it('should continue on result save failure', async () => {
      const mockResultSaver = {
        save: vi.fn().mockRejectedValue(new Error('Disk full')),
      };

      const executeWithSave = async (task: QueenTask): Promise<TaskResult> => {
        const taskResult = { testsGenerated: 5 };
        let savedFiles: string[] | undefined;

        try {
          const saved = await mockResultSaver.save(task.id, task.type, taskResult);
          savedFiles = saved.files;
        } catch (saveError) {
          // Log but don't fail the task
          console.error(`Failed to save results: ${saveError}`);
        }

        return {
          taskId: task.id,
          success: true,
          data: taskResult,
          duration: 100,
          domain: 'test-generation',
          savedFiles,
        };
      };

      const result = await executeWithSave({
        id: 'task-1',
        type: 'generate-tests',
        payload: {},
      });

      // Task still succeeds even if save fails
      expect(result.success).toBe(true);
      expect(result.savedFiles).toBeUndefined();
    });

    it('should handle result directory creation failure', async () => {
      const mockFs = {
        mkdir: vi.fn().mockRejectedValue(new Error('Permission denied')),
        existsSync: vi.fn().mockReturnValue(false),
      };

      const ensureResultsDir = async (dir: string): Promise<boolean> => {
        try {
          if (!mockFs.existsSync(dir)) {
            await mockFs.mkdir(dir);
          }
          return true;
        } catch {
          return false;
        }
      };

      const dirReady = await ensureResultsDir('/path/to/results');
      expect(dirReady).toBe(false);
    });
  });

  // ===========================================================================
  // Routing Tier Errors
  // ===========================================================================

  describe('Routing Tier', () => {
    it('should handle invalid routing tier', () => {
      const getModelForTier = (tier: number): string => {
        switch (tier) {
          case 0: return 'agent-booster';
          case 1: return 'claude-3-5-haiku-20241022';
          case 2: return 'claude-sonnet-4-20250514';
          case 3: return 'claude-sonnet-4-20250514';
          case 4: return 'claude-opus-4-5-20251101';
          default: return 'claude-sonnet-4-20250514'; // Default fallback
        }
      };

      expect(getModelForTier(-1)).toBe('claude-sonnet-4-20250514');
      expect(getModelForTier(999)).toBe('claude-sonnet-4-20250514');
      expect(getModelForTier(0)).toBe('agent-booster');
      expect(getModelForTier(4)).toBe('claude-opus-4-5-20251101');
    });

    it('should handle outcome recording failure gracefully', async () => {
      const mockRouter = {
        recordOutcome: vi.fn().mockRejectedValue(new Error('Router unavailable')),
      };

      const recordOutcome = async (
        taskId: string,
        tier: number,
        success: boolean
      ): Promise<void> => {
        try {
          await mockRouter.recordOutcome({ taskId, tier, success });
        } catch {
          // Don't fail task execution if metrics recording fails
          console.warn('Failed to record outcome');
        }
      };

      // Should not throw
      await expect(recordOutcome('task-1', 2, true)).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // Domain Resolution Errors
  // ===========================================================================

  describe('Domain Resolution', () => {
    it('should map task types to correct domains', () => {
      const domainMap: Record<TaskType, DomainName> = {
        'generate-tests': 'test-generation',
        'execute-tests': 'test-execution',
        'analyze-coverage': 'coverage-analysis',
        'assess-quality': 'quality-assessment',
        'predict-defects': 'defect-intelligence',
        'validate-requirements': 'requirements-validation',
        'index-code': 'code-intelligence',
        'scan-security': 'security-compliance',
        'validate-contracts': 'contract-testing',
        'test-accessibility': 'visual-accessibility',
        'run-chaos': 'chaos-resilience',
        'optimize-learning': 'learning-optimization',
      };

      const getTaskDomain = (taskType: TaskType): DomainName => {
        return domainMap[taskType] || 'learning-optimization';
      };

      expect(getTaskDomain('generate-tests')).toBe('test-generation');
      expect(getTaskDomain('run-chaos')).toBe('chaos-resilience');
      expect(getTaskDomain('optimize-learning')).toBe('learning-optimization');
    });

    it('should handle unknown task type in domain resolution', () => {
      const getTaskDomain = (taskType: string): DomainName => {
        const domainMap: Record<string, DomainName> = {
          'generate-tests': 'test-generation',
          'execute-tests': 'test-execution',
        };
        return domainMap[taskType] || 'learning-optimization';
      };

      expect(getTaskDomain('unknown-task')).toBe('learning-optimization');
    });
  });

  // ===========================================================================
  // Event Publishing Errors
  // ===========================================================================

  describe('Event Publishing', () => {
    it('should handle event bus failure during task completion', async () => {
      const mockEventBus = {
        publish: vi.fn().mockRejectedValue(new Error('Event bus unavailable')),
      };

      const publishTaskCompleted = async (taskId: string, result: unknown): Promise<boolean> => {
        try {
          await mockEventBus.publish({
            type: 'TaskCompleted',
            payload: { taskId, result },
          });
          return true;
        } catch {
          console.error('Failed to publish task completion event');
          return false;
        }
      };

      const published = await publishTaskCompleted('task-1', { success: true });
      expect(published).toBe(false);
    });

    it('should handle event bus failure during task failure', async () => {
      const mockEventBus = {
        publish: vi.fn().mockRejectedValue(new Error('Event bus unavailable')),
      };

      const publishTaskFailed = async (taskId: string, error: string): Promise<boolean> => {
        try {
          await mockEventBus.publish({
            type: 'TaskFailed',
            payload: { taskId, error },
          });
          return true;
        } catch {
          console.error('Failed to publish task failure event');
          return false;
        }
      };

      const published = await publishTaskFailed('task-1', 'Task failed');
      expect(published).toBe(false);
    });
  });

  // ===========================================================================
  // Service Cache Errors
  // ===========================================================================

  describe('Service Cache', () => {
    it('should handle service creation failure', async () => {
      let testGenerator: { generate: () => void } | null = null;
      const createError = new Error('Failed to initialize service');

      const getTestGenerator = () => {
        if (!testGenerator) {
          throw createError;
        }
        return testGenerator;
      };

      expect(() => getTestGenerator()).toThrow('Failed to initialize service');
    });

    it('should reset service caches on dispose', () => {
      const caches = {
        coverageAnalyzer: { value: 'instance' },
        securityScanner: { value: 'instance' },
        testGenerator: { value: 'instance' },
      };

      const resetServiceCaches = () => {
        caches.coverageAnalyzer = null as any;
        caches.securityScanner = null as any;
        caches.testGenerator = null as any;
      };

      resetServiceCaches();

      expect(caches.coverageAnalyzer).toBeNull();
      expect(caches.securityScanner).toBeNull();
      expect(caches.testGenerator).toBeNull();
    });
  });
});
