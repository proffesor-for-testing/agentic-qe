/**
 * Tests for HookExecutor
 *
 * Comprehensive test suite for Claude Flow hook execution service.
 * Tests pre/post task hooks, memory operations, command execution,
 * and security features.
 *
 * @group unit
 * @group mcp
 * @group services
 */

import { HookExecutor, HookType, HookParams } from '@mcp/services/HookExecutor';
import { Logger } from '@utils/Logger';
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

// Mock Logger
jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('HookExecutor', () => {
  let hookExecutor: HookExecutor;
  let mockExec: jest.MockedFunction<typeof exec>;
  let mockLogger: any;

  beforeEach(() => {
    // Reset mocks
    mockExec = exec as jest.MockedFunction<typeof exec>;
    mockExec.mockImplementation((command, options, callback: any) => {
      // Simulate successful execution
      callback(null, { stdout: 'success', stderr: '' });
      return {} as any;
    });

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Logger is already mocked via manual mock in src/utils/__mocks__/Logger.ts
    // No need to mock it again - the manual mock handles getInstance() automatically

    hookExecutor = new HookExecutor({ enabled: true, dryRun: false, timeout: 5000 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create hook executor with default config', () => {
      const executor = new HookExecutor();
      expect(executor).toBeInstanceOf(HookExecutor);
    });

    it('should create hook executor with custom config', () => {
      const executor = new HookExecutor({
        enabled: false,
        dryRun: true,
        timeout: 10000
      });

      expect(executor).toBeInstanceOf(HookExecutor);
    });

    it('should respect enabled flag', async () => {
      const disabledExecutor = new HookExecutor({ enabled: false });

      const result = await disabledExecutor.executePreTask({
        description: 'test task'
      });

      expect(result.success).toBe(true);
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('Pre-Task Hook', () => {
    it('should execute pre-task hook with description', async () => {
      const params: HookParams = {
        description: 'Test task execution',
        agentId: 'test-agent-1'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.success).toBe(true);
      expect(result.hookType).toBe('pre_task');
      expect(result.commands.length).toBeGreaterThan(0);
      expect(result.commands[0]).toContain('pre-task');
      expect(result.commands[0]).toContain('Test task execution');
    });

    it('should include agent ID if provided', async () => {
      const params: HookParams = {
        description: 'Task with agent',
        agentId: 'agent-123'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.commands[0]).toContain('agent-123');
    });

    it('should retrieve memory for agent type', async () => {
      const params: HookParams = {
        description: 'Test task',
        agentType: 'test-generator'
      };

      const result = await hookExecutor.executePreTask(params);

      const memoryCommand = result.commands.find(cmd => cmd.includes('memory retrieve'));
      expect(memoryCommand).toBeDefined();
      expect(memoryCommand).toContain('aqe/test-generator');
    });
  });

  describe('Post-Task Hook', () => {
    it('should execute post-task hook with task ID', async () => {
      const params: HookParams = {
        taskId: 'task-123',
        status: 'completed'
      };

      const result = await hookExecutor.executePostTask(params);

      expect(result.success).toBe(true);
      expect(result.commands[0]).toContain('post-task');
      expect(result.commands[0]).toContain('task-123');
      expect(result.commands[0]).toContain('completed');
    });

    it('should store results in memory', async () => {
      const params: HookParams = {
        taskId: 'task-456',
        results: { success: true, data: 'test data' },
        agentType: 'test-executor'
      };

      const result = await hookExecutor.executePostTask(params);

      const storeCommand = result.commands.find(cmd => cmd.includes('memory store'));
      expect(storeCommand).toBeDefined();
      expect(storeCommand).toContain('aqe/test-executor/results');
    });
  });

  describe('Post-Edit Hook', () => {
    it('should execute post-edit hook with file path', async () => {
      const params: HookParams = {
        file: '/test/path/file.ts',
        fileName: 'file.ts'
      };

      const result = await hookExecutor.executePostEdit(params);

      expect(result.success).toBe(true);
      expect(result.commands[0]).toContain('post-edit');
      expect(result.commands[0]).toContain('/test/path/file.ts');
    });

    it('should use custom memory key if provided', async () => {
      const params: HookParams = {
        file: '/test/file.ts',
        memoryKey: 'custom/memory/key'
      };

      const result = await hookExecutor.executePostEdit(params);

      expect(result.commands[0]).toContain('custom/memory/key');
    });

    it('should generate default memory key from file path', async () => {
      const params: HookParams = {
        file: '/test/path/module.ts'
      };

      const result = await hookExecutor.executePostEdit(params);

      expect(result.commands[0]).toContain('aqe/files/module.ts');
    });
  });

  describe('Notification Hook', () => {
    it('should send notification with message', async () => {
      const params: HookParams = {
        message: 'Test notification',
        level: 'info'
      };

      const result = await hookExecutor.notify(params);

      expect(result.success).toBe(true);
      expect(result.commands[0]).toContain('notify');
      expect(result.commands[0]).toContain('Test notification');
      expect(result.commands[0]).toContain('info');
    });

    it('should support different notification levels', async () => {
      const levels: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];

      for (const level of levels) {
        const result = await hookExecutor.notify({
          message: 'test',
          level
        });

        expect(result.commands[0]).toContain(level);
      }
    });
  });

  describe('Memory Operations', () => {
    it('should store data in memory', async () => {
      const data = { test: 'data', nested: { value: 123 } };

      const result = await hookExecutor.storeMemory('test-key', data);

      expect(result.success).toBe(true);
      expect(result.commands[0]).toContain('memory store');
      expect(result.commands[0]).toContain('test-key');
      expect(result.commands[0]).toContain(JSON.stringify(data));
    });

    it('should retrieve data from memory', async () => {
      mockExec.mockImplementation((command, options, callback: any) => {
        callback(null, { stdout: JSON.stringify({ value: 'retrieved' }), stderr: '' });
        return {} as any;
      });

      const result = await hookExecutor.retrieveMemory('test-key');

      expect(result).toEqual({ value: 'retrieved' });
      expect(mockExec).toHaveBeenCalled();
    });

    it('should return null when memory retrieval fails', async () => {
      mockExec.mockImplementation((command, options, callback: any) => {
        callback(new Error('Not found'), { stdout: '', stderr: 'Error' });
        return {} as any;
      });

      const result = await hookExecutor.retrieveMemory('nonexistent-key');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle non-JSON memory values', async () => {
      mockExec.mockImplementation((command, options, callback: any) => {
        callback(null, { stdout: 'plain text value', stderr: '' });
        return {} as any;
      });

      const result = await hookExecutor.retrieveMemory('text-key');

      expect(result).toBe('plain text value');
    });
  });

  describe('Command Execution', () => {
    it('should execute commands successfully', async () => {
      const params: HookParams = {
        description: 'test'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(mockExec).toHaveBeenCalled();
    });

    it('should continue on command failure', async () => {
      mockExec
        .mockImplementationOnce((command, options, callback: any) => {
          callback(new Error('Command failed'), { stdout: '', stderr: 'Error' });
          return {} as any;
        })
        .mockImplementationOnce((command, options, callback: any) => {
          callback(null, { stdout: 'success', stderr: '' });
          return {} as any;
        });

      const params: HookParams = {
        description: 'test',
        agentType: 'test-agent' // This will generate 2 commands
      };

      const result = await hookExecutor.executePreTask(params);

      // Should have errors but not throw
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.success).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle command timeout', async () => {
      mockExec.mockImplementation((command, options, callback: any) => {
        // Simulate timeout
        const error: any = new Error('Command timed out');
        error.killed = true;
        error.signal = 'SIGTERM';
        callback(error, { stdout: '', stderr: '' });
        return {} as any;
      });

      const params: HookParams = {
        description: 'slow command'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('timeout'))).toBe(true);
    });

    it('should respect timeout configuration', async () => {
      const shortTimeout = new HookExecutor({ timeout: 100 });

      const params: HookParams = {
        description: 'test'
      };

      await shortTimeout.executePreTask(params);

      // Verify timeout was passed to exec
      expect(mockExec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 100 }),
        expect.any(Function)
      );
    });
  });

  describe('Dry-Run Mode', () => {
    let dryRunExecutor: HookExecutor;

    beforeEach(() => {
      dryRunExecutor = new HookExecutor({ dryRun: true });
    });

    it('should not execute commands in dry-run mode', async () => {
      const params: HookParams = {
        description: 'test'
      };

      const result = await dryRunExecutor.executePreTask(params);

      expect(result.success).toBe(true);
      expect(mockExec).not.toHaveBeenCalled();
      expect(result.outputs.some(o => o.includes('[DRY-RUN]'))).toBe(true);
    });

    it('should log commands that would be executed', async () => {
      const params: HookParams = {
        description: 'dry run test'
      };

      const result = await dryRunExecutor.executePreTask(params);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-RUN]')
      );
    });

    it('should not store memory in dry-run mode', async () => {
      await dryRunExecutor.storeMemory('key', 'value');

      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should return null for memory retrieval in dry-run mode', async () => {
      const result = await dryRunExecutor.retrieveMemory('key');

      expect(result).toBeNull();
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  describe('Shell Argument Escaping', () => {
    it('should escape double quotes in arguments', async () => {
      const params: HookParams = {
        description: 'Test with "quotes" in text'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.commands[0]).toContain('\\"quotes\\"');
    });

    it('should escape backslashes in arguments', async () => {
      const params: HookParams = {
        description: 'Path\\with\\backslashes'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.commands[0]).toContain('\\\\');
    });

    it('should prevent shell injection', async () => {
      const maliciousInput = 'test"; rm -rf /; echo "pwned';

      const params: HookParams = {
        description: maliciousInput
      };

      const result = await hookExecutor.executePreTask(params);

      // The malicious characters should be escaped
      expect(result.commands[0]).not.toMatch(/"; rm -rf/);
      expect(result.commands[0]).toContain('\\"');
    });

    it('should handle special characters in file paths', async () => {
      const params: HookParams = {
        file: '/path/with spaces/and-special$chars.ts'
      };

      const result = await hookExecutor.executePostEdit(params);

      // Should escape the path properly
      expect(result.commands[0]).toContain('/path/with spaces/');
    });
  });

  describe('Enable/Disable Configuration', () => {
    it('should enable hook execution', () => {
      hookExecutor.setEnabled(false);
      hookExecutor.setEnabled(true);

      expect(mockLogger.info).toHaveBeenCalledWith('Hook execution enabled');
    });

    it('should disable hook execution', () => {
      hookExecutor.setEnabled(false);

      expect(mockLogger.info).toHaveBeenCalledWith('Hook execution disabled');
    });

    it('should toggle dry-run mode', () => {
      hookExecutor.setDryRun(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Dry-run mode enabled');

      hookExecutor.setDryRun(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Dry-run mode disabled');
    });
  });

  describe('Session Hooks', () => {
    it('should execute session-start hook', async () => {
      const params: HookParams = {
        sessionId: 'session-123'
      };

      const result = await hookExecutor.executeHook('session_start', params);

      expect(result.success).toBe(true);
      expect(result.commands[0]).toContain('session-start');
      expect(result.commands[0]).toContain('session-123');
    });

    it('should execute session-end hook', async () => {
      const params: HookParams = {
        sessionId: 'session-456',
        exportMetrics: true
      };

      const result = await hookExecutor.executeHook('session_end', params);

      expect(result.commands[0]).toContain('session-end');
      expect(result.commands[0]).toContain('session-456');
      expect(result.commands[0]).toContain('export-metrics');
    });

    it('should handle session end without metrics export', async () => {
      const params: HookParams = {
        sessionId: 'session-789',
        exportMetrics: false
      };

      const result = await hookExecutor.executeHook('session_end', params);

      expect(result.commands[0]).not.toContain('export-metrics');
    });
  });

  describe('Error Handling', () => {
    it('should capture stderr output', async () => {
      mockExec.mockImplementation((command, options, callback: any) => {
        callback(null, { stdout: 'output', stderr: 'warning message' });
        return {} as any;
      });

      const params: HookParams = {
        description: 'test'
      };

      await hookExecutor.executePreTask(params);

      expect(mockLogger.warn).toHaveBeenCalledWith('Command stderr:', 'warning message');
    });

    it('should provide execution time even on failure', async () => {
      mockExec.mockImplementation((command, options, callback: any) => {
        callback(new Error('Failed'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const params: HookParams = {
        description: 'test'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should log execution summary', async () => {
      const params: HookParams = {
        description: 'test'
      };

      await hookExecutor.executePreTask(params);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Hook execution completed/)
      );
    });
  });

  describe('Multiple Hook Execution', () => {
    it('should execute multiple hooks in sequence', async () => {
      const params: HookParams = {
        description: 'test',
        agentType: 'test-generator' // This generates 2 commands
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.commands.length).toBeGreaterThan(1);
      expect(result.outputs.length).toBeGreaterThan(1);
    });

    it('should collect all outputs', async () => {
      mockExec
        .mockImplementationOnce((command, options, callback: any) => {
          callback(null, { stdout: 'output 1', stderr: '' });
          return {} as any;
        })
        .mockImplementationOnce((command, options, callback: any) => {
          callback(null, { stdout: 'output 2', stderr: '' });
          return {} as any;
        });

      const params: HookParams = {
        description: 'test',
        agentType: 'test-agent'
      };

      const result = await hookExecutor.executePreTask(params);

      expect(result.outputs).toContain('output 1');
      expect(result.outputs).toContain('output 2');
    });
  });

  describe('Global Hook Executor', () => {
    it('should provide singleton instance', async () => {
      const { getHookExecutor } = await import('../../../src/mcp/services/HookExecutor');

      const instance1 = getHookExecutor();
      const instance2 = getHookExecutor();

      expect(instance1).toBe(instance2);
    });

    it('should reset global instance for testing', async () => {
      const { getHookExecutor, resetHookExecutor } = await import('../../../src/mcp/services/HookExecutor');

      const instance1 = getHookExecutor();
      resetHookExecutor();
      const instance2 = getHookExecutor();

      expect(instance1).not.toBe(instance2);
    });
  });
});
