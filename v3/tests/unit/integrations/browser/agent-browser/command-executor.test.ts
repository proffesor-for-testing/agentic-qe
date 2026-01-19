/**
 * Tests for AgentBrowserCommandExecutor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBrowserCommandExecutor, isAgentBrowserAvailable } from '../../../../../src/integrations/browser/agent-browser/command-executor';

describe('AgentBrowserCommandExecutor', () => {
  let executor: AgentBrowserCommandExecutor;

  beforeEach(() => {
    executor = new AgentBrowserCommandExecutor({
      sessionName: 'test-session',
      timeout: 10000,
      debug: false,
    });
  });

  describe('Configuration', () => {
    it('should initialize with default config', () => {
      const defaultExecutor = new AgentBrowserCommandExecutor();
      expect(defaultExecutor.getSessionName()).toBe('default');
      expect(defaultExecutor.isBrowserLaunched()).toBe(false);
    });

    it('should initialize with custom config', () => {
      expect(executor.getSessionName()).toBe('test-session');
      expect(executor.isBrowserLaunched()).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should return correct session name', () => {
      expect(executor.getSessionName()).toBe('test-session');
    });

    it('should track browser launch state', () => {
      expect(executor.isBrowserLaunched()).toBe(false);
      // Note: Cannot test actual launch without agent-browser installed
    });
  });

  describe('Command Building', () => {
    it('should build args correctly', () => {
      // This is tested indirectly through command execution
      // The buildArgs method is private, so we test its effects
      const result = executor.snapshot({ compact: true, depth: 2 });
      // Should not throw during arg building
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Type Safety', () => {
    it('should type CommandResult correctly for void operations', () => {
      const result = executor.close();
      expect(result).toHaveProperty('success');
      // agent-browser CLI may return a success message string, not undefined
      if (result.success) {
        // Data could be undefined or a success message string
        expect(result.data === undefined || typeof result.data === 'string').toBe(true);
      } else {
        expect(result.error).toBeDefined();
      }
    });

    it('should type CommandResult correctly for snapshot operations', () => {
      const result = executor.snapshot();
      expect(result).toHaveProperty('success');
      if (result.success && result.data) {
        // Snapshot returns a JSON object or string
        expect(['string', 'object'].includes(typeof result.data)).toBe(true);
      }
    });

    it('should type CommandResult correctly for boolean operations', () => {
      const result = executor.isVisible('#test');
      expect(result).toHaveProperty('success');
      if (result.success && result.data !== undefined) {
        expect(typeof result.data).toBe('boolean');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle command failure gracefully', () => {
      // Execute non-existent command
      const result = executor.execute('nonexistent-command');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    it('should handle timeout gracefully', () => {
      const shortTimeoutExecutor = new AgentBrowserCommandExecutor({ timeout: 1 });
      const result = shortTimeoutExecutor.execute('open', ['https://example.com']);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('CLI Availability', () => {
    it('should check agent-browser availability', () => {
      const available = isAgentBrowserAvailable();
      expect(typeof available).toBe('boolean');
      // May be true or false depending on environment
    });
  });

  describe('Method Signatures', () => {
    it('should expose all browser lifecycle methods', () => {
      expect(typeof executor.open).toBe('function');
      expect(typeof executor.close).toBe('function');
    });

    it('should expose all snapshot methods', () => {
      expect(typeof executor.snapshot).toBe('function');
    });

    it('should expose all interaction methods', () => {
      expect(typeof executor.click).toBe('function');
      expect(typeof executor.fill).toBe('function');
      expect(typeof executor.type).toBe('function');
      expect(typeof executor.getText).toBe('function');
      expect(typeof executor.isVisible).toBe('function');
    });

    it('should expose all screenshot methods', () => {
      expect(typeof executor.screenshot).toBe('function');
    });

    it('should expose all wait methods', () => {
      expect(typeof executor.waitForElement).toBe('function');
      expect(typeof executor.waitForText).toBe('function');
      expect(typeof executor.waitForUrl).toBe('function');
      expect(typeof executor.waitForNetworkIdle).toBe('function');
    });

    it('should expose all device/viewport methods', () => {
      expect(typeof executor.setDevice).toBe('function');
      expect(typeof executor.setViewport).toBe('function');
    });

    it('should expose all network methods', () => {
      expect(typeof executor.mockRoute).toBe('function');
      expect(typeof executor.abortRoute).toBe('function');
      expect(typeof executor.clearRoutes).toBe('function');
    });

    it('should expose all state methods', () => {
      expect(typeof executor.saveState).toBe('function');
      expect(typeof executor.loadState).toBe('function');
    });

    it('should expose eval method', () => {
      expect(typeof executor.eval).toBe('function');
    });
  });

  describe('Async Execution', () => {
    it('should support async execution', async () => {
      const result = await executor.executeAsync('close');
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });
});
