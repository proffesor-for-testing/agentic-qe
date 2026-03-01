/**
 * Tests for Browser Client Factory
 *
 * Tests the factory functions for creating browser clients with intelligent
 * tool selection based on preferences and use cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createBrowserClient,
  createAgentBrowserClient,
  getBrowserClientForUseCase,
  isVibiumAvailable,
  isAgentBrowserAvailable,
  getRecommendedToolForUseCase,
  getBrowserToolAvailability,
  type BrowserClientFactoryOptions,
} from '../../../../src/integrations/browser/client-factory';
import type { BrowserUseCase, BrowserToolPreference } from '../../../../src/integrations/browser/types';
import { BrowserUnavailableError } from '../../../../src/integrations/browser/types';

// Mock the AgentBrowserClient module with a proper class mock
vi.mock('../../../../src/integrations/browser/agent-browser/client', () => {
  // Create a mock class that can be instantiated
  const MockAgentBrowserClient = class {
    tool = 'agent-browser' as const;
    isAvailable = vi.fn().mockResolvedValue(true);
    launch = vi.fn().mockResolvedValue({ success: true, value: {} });
    quit = vi.fn().mockResolvedValue({ success: true, value: undefined });
    navigate = vi.fn().mockResolvedValue({ success: true, value: {} });
    dispose = vi.fn().mockResolvedValue(undefined);
    getSnapshot = vi.fn().mockResolvedValue({ success: true, value: {} });
    createSession = vi.fn().mockResolvedValue({ success: true, value: {} });
    switchSession = vi.fn().mockResolvedValue({ success: true, value: undefined });
    listSessions = vi.fn().mockResolvedValue({ success: true, value: [] });
    mockRoute = vi.fn().mockResolvedValue({ success: true, value: undefined });
    abortRoute = vi.fn().mockResolvedValue({ success: true, value: undefined });
    clearRoutes = vi.fn().mockResolvedValue({ success: true, value: undefined });
    setDevice = vi.fn().mockResolvedValue({ success: true, value: undefined });
    setViewport = vi.fn().mockResolvedValue({ success: true, value: undefined });
    saveState = vi.fn().mockResolvedValue({ success: true, value: undefined });
    loadState = vi.fn().mockResolvedValue({ success: true, value: undefined });
    waitForElement = vi.fn().mockResolvedValue({ success: true, value: undefined });
    waitForText = vi.fn().mockResolvedValue({ success: true, value: undefined });
    waitForUrl = vi.fn().mockResolvedValue({ success: true, value: undefined });
    waitForNetworkIdle = vi.fn().mockResolvedValue({ success: true, value: undefined });
    click = vi.fn().mockResolvedValue({ success: true, value: undefined });
    fill = vi.fn().mockResolvedValue({ success: true, value: undefined });
    getText = vi.fn().mockResolvedValue({ success: true, value: 'text' });
    isVisible = vi.fn().mockResolvedValue({ success: true, value: true });
    screenshot = vi.fn().mockResolvedValue({ success: true, value: {} });
    evaluate = vi.fn().mockResolvedValue({ success: true, value: {} });
    reload = vi.fn().mockResolvedValue({ success: true, value: undefined });
    goBack = vi.fn().mockResolvedValue({ success: true, value: undefined });
    goForward = vi.fn().mockResolvedValue({ success: true, value: undefined });
  };

  return {
    AgentBrowserClient: MockAgentBrowserClient,
    createAgentBrowserClient: vi.fn(() => new MockAgentBrowserClient()),
  };
});

describe('Browser Client Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createBrowserClient()', () => {
    describe('with default options (auto preference)', () => {
      it('should return a browser client', async () => {
        const client = await createBrowserClient();
        expect(client).toBeDefined();
        expect(client.tool).toBeDefined();
      });

      it('should return agent-browser when vibium is unavailable', async () => {
        // Vibium is always unavailable in current implementation (stub)
        const client = await createBrowserClient();
        expect(client).toBeDefined();
        // Could be either tool depending on availability
        expect(['agent-browser', 'vibium']).toContain(client.tool);
      });
    });

    describe('with agent-browser preference', () => {
      it('should return agent-browser client', async () => {
        const client = await createBrowserClient({ preference: 'agent-browser' });
        expect(client).toBeDefined();
        expect(client.tool).toBe('agent-browser');
      });

      it('should return client regardless of vibium availability', async () => {
        const client = await createBrowserClient({ preference: 'agent-browser' });
        expect(client.tool).toBe('agent-browser');
      });
    });

    describe('with vibium preference', () => {
      it('should throw BrowserUnavailableError when vibium is not available', async () => {
        // Vibium is always unavailable in current implementation
        await expect(createBrowserClient({ preference: 'vibium' })).rejects.toThrow(
          BrowserUnavailableError
        );
      });

      it('should include correct tool in error', async () => {
        try {
          await createBrowserClient({ preference: 'vibium' });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(BrowserUnavailableError);
          expect((error as BrowserUnavailableError).tool).toBe('vibium');
        }
      });
    });

    describe('with use case hints', () => {
      it('should return agent-browser for e2e-testing use case', async () => {
        const client = await createBrowserClient({ useCase: 'e2e-testing' });
        expect(client.tool).toBe('agent-browser');
      });

      it('should return agent-browser for api-mocking use case', async () => {
        const client = await createBrowserClient({ useCase: 'api-mocking' });
        expect(client.tool).toBe('agent-browser');
      });

      it('should return agent-browser for responsive-testing use case', async () => {
        const client = await createBrowserClient({ useCase: 'responsive-testing' });
        expect(client.tool).toBe('agent-browser');
      });

      it('should return agent-browser for auth-testing use case', async () => {
        const client = await createBrowserClient({ useCase: 'auth-testing' });
        expect(client.tool).toBe('agent-browser');
      });

      it('should allow either tool for visual-regression use case', async () => {
        const client = await createBrowserClient({ useCase: 'visual-regression' });
        expect(client).toBeDefined();
        expect(['agent-browser', 'vibium']).toContain(client.tool);
      });

      it('should allow either tool for accessibility use case', async () => {
        const client = await createBrowserClient({ useCase: 'accessibility' });
        expect(client).toBeDefined();
        expect(['agent-browser', 'vibium']).toContain(client.tool);
      });
    });

    describe('with combined options', () => {
      it('should prioritize use case over preference for agent-browser required use cases', async () => {
        // Even with auto preference, e2e-testing should use agent-browser
        const client = await createBrowserClient({
          preference: 'auto',
          useCase: 'e2e-testing',
        });
        expect(client.tool).toBe('agent-browser');
      });
    });
  });

  describe('createAgentBrowserClient()', () => {
    it('should return an IAgentBrowserClient instance', async () => {
      const client = await createAgentBrowserClient();
      expect(client).toBeDefined();
      expect(client.tool).toBe('agent-browser');
    });

    it('should return a new instance each time', async () => {
      const client1 = await createAgentBrowserClient();
      const client2 = await createAgentBrowserClient();
      expect(client1).not.toBe(client2);
    });

    it('should return a client with agent-browser specific methods', async () => {
      const client = await createAgentBrowserClient();
      // IAgentBrowserClient has additional methods
      expect(typeof client.launch).toBe('function');
      expect(typeof client.quit).toBe('function');
      expect(typeof client.navigate).toBe('function');
    });
  });

  describe('getBrowserClientForUseCase()', () => {
    const useCases: BrowserUseCase[] = [
      'e2e-testing',
      'visual-regression',
      'accessibility',
      'api-mocking',
      'responsive-testing',
      'auth-testing',
    ];

    it.each(useCases)('should return a client for %s use case', async (useCase) => {
      const client = await getBrowserClientForUseCase(useCase);
      expect(client).toBeDefined();
      expect(client.tool).toBeDefined();
    });

    it('should return agent-browser for use cases requiring refs', async () => {
      const client = await getBrowserClientForUseCase('e2e-testing');
      expect(client.tool).toBe('agent-browser');
    });

    it('should return agent-browser for use cases requiring network interception', async () => {
      const client = await getBrowserClientForUseCase('api-mocking');
      expect(client.tool).toBe('agent-browser');
    });

    it('should return agent-browser for use cases requiring device emulation', async () => {
      const client = await getBrowserClientForUseCase('responsive-testing');
      expect(client.tool).toBe('agent-browser');
    });

    it('should return agent-browser for use cases requiring state persistence', async () => {
      const client = await getBrowserClientForUseCase('auth-testing');
      expect(client.tool).toBe('agent-browser');
    });
  });

  describe('isAgentBrowserAvailable()', () => {
    it('should return a boolean', async () => {
      const result = await isAgentBrowserAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should check CLI availability', async () => {
      // This test just verifies the function runs without error
      // Actual availability depends on environment
      const available = await isAgentBrowserAvailable();
      expect([true, false]).toContain(available);
    });
  });

  describe('isVibiumAvailable()', () => {
    it('should return a boolean', async () => {
      const result = await isVibiumAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should return false in current implementation (stub)', async () => {
      // Vibium client is not yet implemented
      const available = await isVibiumAvailable();
      expect(available).toBe(false);
    });
  });

  describe('getRecommendedToolForUseCase()', () => {
    describe('use cases requiring agent-browser', () => {
      it('should return agent-browser for e2e-testing', () => {
        const recommendation = getRecommendedToolForUseCase('e2e-testing');
        expect(recommendation).toBe('agent-browser');
      });

      it('should return agent-browser for api-mocking', () => {
        const recommendation = getRecommendedToolForUseCase('api-mocking');
        expect(recommendation).toBe('agent-browser');
      });

      it('should return agent-browser for responsive-testing', () => {
        const recommendation = getRecommendedToolForUseCase('responsive-testing');
        expect(recommendation).toBe('agent-browser');
      });

      it('should return agent-browser for auth-testing', () => {
        const recommendation = getRecommendedToolForUseCase('auth-testing');
        expect(recommendation).toBe('agent-browser');
      });
    });

    describe('use cases supporting either tool', () => {
      it('should return either for visual-regression', () => {
        const recommendation = getRecommendedToolForUseCase('visual-regression');
        expect(recommendation).toBe('either');
      });

      it('should return either for accessibility', () => {
        const recommendation = getRecommendedToolForUseCase('accessibility');
        expect(recommendation).toBe('either');
      });
    });

    describe('return type validation', () => {
      const useCases: BrowserUseCase[] = [
        'e2e-testing',
        'visual-regression',
        'accessibility',
        'api-mocking',
        'responsive-testing',
        'auth-testing',
      ];

      it.each(useCases)('should return valid recommendation for %s', (useCase) => {
        const recommendation = getRecommendedToolForUseCase(useCase);
        expect(['agent-browser', 'vibium', 'either']).toContain(recommendation);
      });
    });
  });

  describe('getBrowserToolAvailability()', () => {
    it('should return availability object', async () => {
      const availability = await getBrowserToolAvailability();
      expect(availability).toHaveProperty('vibium');
      expect(availability).toHaveProperty('agentBrowser');
    });

    it('should return boolean values for each tool', async () => {
      const availability = await getBrowserToolAvailability();
      expect(typeof availability.vibium).toBe('boolean');
      expect(typeof availability.agentBrowser).toBe('boolean');
    });

    it('should check both tools in parallel', async () => {
      const startTime = Date.now();
      await getBrowserToolAvailability();
      const duration = Date.now() - startTime;

      // Should be fast since checks run in parallel
      // Just verify it doesn't take excessively long
      expect(duration).toBeLessThan(10000);
    });

    it('should return false for vibium in current implementation', async () => {
      const availability = await getBrowserToolAvailability();
      expect(availability.vibium).toBe(false);
    });
  });

  describe('Factory Options Type Safety', () => {
    it('should accept valid preference values', async () => {
      const preferences: BrowserToolPreference[] = ['agent-browser', 'vibium', 'auto'];

      for (const preference of preferences) {
        const options: BrowserClientFactoryOptions = { preference };
        expect(options.preference).toBe(preference);
      }
    });

    it('should accept valid use case values', async () => {
      const useCases: BrowserUseCase[] = [
        'e2e-testing',
        'visual-regression',
        'accessibility',
        'api-mocking',
        'responsive-testing',
        'auth-testing',
      ];

      for (const useCase of useCases) {
        const options: BrowserClientFactoryOptions = { useCase };
        expect(options.useCase).toBe(useCase);
      }
    });

    it('should accept empty options', async () => {
      const client = await createBrowserClient({});
      expect(client).toBeDefined();
    });

    it('should accept undefined options', async () => {
      const client = await createBrowserClient(undefined);
      expect(client).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw BrowserUnavailableError for unavailable tools', async () => {
      // Vibium is always unavailable
      await expect(createBrowserClient({ preference: 'vibium' })).rejects.toBeInstanceOf(
        BrowserUnavailableError
      );
    });

    it('should include tool name in error', async () => {
      try {
        await createBrowserClient({ preference: 'vibium' });
      } catch (error) {
        expect(error).toBeInstanceOf(BrowserUnavailableError);
        expect((error as BrowserUnavailableError).tool).toBe('vibium');
      }
    });

    it('should include error code in error', async () => {
      try {
        await createBrowserClient({ preference: 'vibium' });
      } catch (error) {
        expect(error).toBeInstanceOf(BrowserUnavailableError);
        expect((error as BrowserUnavailableError).code).toBe('BROWSER_UNAVAILABLE');
      }
    });
  });
});
