/**
 * HookExecutor Compatibility Layer Tests
 *
 * Verifies that HookExecutor properly detects Claude Flow availability
 * and gracefully falls back to AQE hooks when needed.
 */

import { HookExecutor } from '@mcp/services/HookExecutor';

describe('HookExecutor Compatibility Layer', () => {
  let hookExecutor: HookExecutor;

  beforeEach(() => {
    hookExecutor = new HookExecutor({ enabled: true, dryRun: false });
  });

  describe('Claude Flow Detection', () => {
    it('should detect execution mode', async () => {
      const mode = hookExecutor.getExecutionMode();
      expect(mode).toHaveProperty('external');
      expect(mode).toHaveProperty('fallback');
      expect(mode).toHaveProperty('mode');
      expect(['external', 'aqe-fallback', 'not-detected']).toContain(mode.mode);
    });

    it('should allow resetting detection cache', () => {
      hookExecutor.resetClaudeFlowDetection();
      const mode = hookExecutor.getExecutionMode();
      expect(mode.mode).toBe('not-detected');
    });
  });

  describe('Hook Execution with Fallback', () => {
    it('should execute pre-task hook with fallback', async () => {
      const result = await hookExecutor.executePreTask({
        description: 'Test task',
        agentType: 'test-agent',
        agentId: 'agent-1'
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.hookType).toBe('pre_task');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should execute post-task hook with fallback', async () => {
      const result = await hookExecutor.executePostTask({
        taskId: 'task-1',
        agentType: 'test-agent',
        results: { output: 'test-output' },
        status: 'completed'
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.hookType).toBe('post_task');
    });

    it('should execute post-edit hook with fallback', async () => {
      const result = await hookExecutor.executePostEdit({
        file: '/path/to/file.ts',
        fileName: 'file.ts',
        memoryKey: 'aqe/files/file.ts'
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.hookType).toBe('post_edit');
    });

    it('should send notification with fallback', async () => {
      const result = await hookExecutor.notify({
        message: 'Test notification',
        level: 'info'
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.hookType).toBe('notify');
    });
  });

  describe('Memory Operations with Fallback', () => {
    it('should store memory with fallback', async () => {
      const result = await hookExecutor.storeMemory('test-key', { data: 'test-value' });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should retrieve memory with fallback', async () => {
      // Store first
      await hookExecutor.storeMemory('test-retrieve', { data: 'retrieve-test' });

      // Then retrieve
      const value = await hookExecutor.retrieveMemory('test-retrieve');

      // In fallback mode, this should work
      expect(value).toBeDefined();
    });

    it('should handle non-existent keys gracefully', async () => {
      const value = await hookExecutor.retrieveMemory('non-existent-key-12345');
      // Fallback may return undefined, null, or empty object
      // The important thing is it doesn't throw an error
      expect(true).toBe(true); // Test passes if no error thrown
    });
  });

  describe('Configuration', () => {
    it('should support enabling/disabling hooks', () => {
      hookExecutor.setEnabled(false);
      hookExecutor.setEnabled(true);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should support dry-run mode', () => {
      hookExecutor.setDryRun(true);
      hookExecutor.setDryRun(false);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should skip execution when disabled', async () => {
      hookExecutor.setEnabled(false);
      const result = await hookExecutor.executePreTask({ description: 'test' });

      expect(result.success).toBe(true);
      expect(result.commands).toHaveLength(0);
      expect(result.outputs).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown hook types gracefully', async () => {
      const result = await hookExecutor.executeHook('unknown' as any, {});

      // Should complete without throwing
      expect(result).toBeDefined();
    });

    it('should handle missing parameters gracefully', async () => {
      const result = await hookExecutor.executePreTask({});

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete hook execution within reasonable time', async () => {
      const startTime = Date.now();
      await hookExecutor.executePreTask({
        description: 'Performance test',
        agentType: 'perf-agent'
      });
      const executionTime = Date.now() - startTime;

      // Should complete within 10 seconds (includes detection + fallback)
      expect(executionTime).toBeLessThan(10000);
    });

    it('should cache Claude Flow detection for subsequent calls', async () => {
      // First call triggers detection
      const firstStart = Date.now();
      await hookExecutor.executePreTask({ description: 'test1' });
      const firstTime = Date.now() - firstStart;

      // Second call should use cached result and be faster
      const secondStart = Date.now();
      await hookExecutor.executePreTask({ description: 'test2' });
      const secondTime = Date.now() - secondStart;

      // Second call should be faster since detection is cached
      expect(secondTime).toBeLessThanOrEqual(firstTime);
    });
  });
});
