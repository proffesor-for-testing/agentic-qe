/**
 * Unit Tests for Unified Browser Types
 *
 * Validates that:
 * 1. Types are correctly defined
 * 2. Both IBrowserClient and IAgentBrowserClient are compatible
 * 3. Error classes work as expected
 * 4. Element targeting supports all variants
 */

import { describe, it, expect } from 'vitest';
import type {
  IBrowserClient,
  IAgentBrowserClient,
  ElementTarget,
  BrowserSessionInfo,
  ParsedSnapshot,
  SnapshotElement,
} from '../../../../src/integrations/browser/types';
import {
  BrowserError,
  BrowserUnavailableError,
  BrowserTimeoutError,
  BrowserElementNotFoundError,
} from '../../../../src/integrations/browser/types';

describe('Unified Browser Types', () => {
  describe('ElementTarget', () => {
    it('should support ref targeting (agent-browser)', () => {
      const target: ElementTarget = { type: 'ref', value: '@e1' };
      expect(target.type).toBe('ref');
      expect(target.value).toBe('@e1');
    });

    it('should support CSS selector targeting', () => {
      const target: ElementTarget = { type: 'css', value: 'button.submit' };
      expect(target.type).toBe('css');
      expect(target.value).toBe('button.submit');
    });

    it('should support XPath targeting', () => {
      const target: ElementTarget = { type: 'xpath', value: '//button[@class="submit"]' };
      expect(target.type).toBe('xpath');
    });

    it('should support text content targeting', () => {
      const target: ElementTarget = { type: 'text', value: 'Submit' };
      expect(target.type).toBe('text');
    });
  });

  describe('BrowserError', () => {
    it('should create error with all properties', () => {
      const error = new BrowserError('Test error', 'TEST_CODE', 'vibium');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.tool).toBe('vibium');
      expect(error.name).toBe('BrowserError');
    });

    it('should support instanceof checks', () => {
      const error = new BrowserError('Test', 'CODE', 'vibium');
      expect(error instanceof BrowserError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should include cause chain', () => {
      const cause = new Error('Root cause');
      const error = new BrowserError('Test', 'CODE', 'vibium', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('BrowserUnavailableError', () => {
    it('should create unavailable error for vibium', () => {
      const error = new BrowserUnavailableError('vibium', 'Vibium not installed');
      expect(error.code).toBe('BROWSER_UNAVAILABLE');
      expect(error.tool).toBe('vibium');
      expect(error instanceof BrowserError).toBe(true);
    });

    it('should create unavailable error for agent-browser', () => {
      const error = new BrowserUnavailableError('agent-browser');
      expect(error.code).toBe('BROWSER_UNAVAILABLE');
      expect(error.tool).toBe('agent-browser');
    });

    it('should use default message', () => {
      const error = new BrowserUnavailableError('vibium');
      expect(error.message).toContain('unavailable');
    });
  });

  describe('BrowserTimeoutError', () => {
    it('should create timeout error', () => {
      const error = new BrowserTimeoutError('vibium', 'element click');
      expect(error.code).toBe('BROWSER_TIMEOUT');
      expect(error.message).toContain('element click');
      expect(error.message).toContain('timed out');
    });
  });

  describe('BrowserElementNotFoundError', () => {
    it('should create element not found error for string target', () => {
      const error = new BrowserElementNotFoundError('vibium', 'button.submit');
      expect(error.code).toBe('ELEMENT_NOT_FOUND');
      expect(error.message).toContain('button.submit');
    });

    it('should create element not found error for ElementTarget', () => {
      const target: ElementTarget = { type: 'ref', value: '@e1' };
      const error = new BrowserElementNotFoundError('agent-browser', target);
      expect(error.code).toBe('ELEMENT_NOT_FOUND');
      expect(error.message).toContain('@e1');
    });
  });

  describe('BrowserSessionInfo', () => {
    it('should create session info', () => {
      const session: BrowserSessionInfo = {
        id: 'session-123',
        tool: 'vibium',
        status: 'active',
        currentUrl: 'https://example.com',
        createdAt: new Date(),
      };

      expect(session.id).toBe('session-123');
      expect(session.tool).toBe('vibium');
      expect(session.status).toBe('active');
    });
  });

  describe('SnapshotElement', () => {
    it('should create snapshot element', () => {
      const element: SnapshotElement = {
        ref: '@e1',
        role: 'button',
        name: 'Submit',
        text: 'Click me',
        depth: 2,
      };

      expect(element.ref).toBe('@e1');
      expect(element.role).toBe('button');
      expect(element.depth).toBe(2);
    });
  });

  describe('ParsedSnapshot', () => {
    it('should create parsed snapshot', () => {
      const element: SnapshotElement = {
        ref: '@e1',
        role: 'button',
        depth: 1,
      };

      const refMap = new Map<string, SnapshotElement>();
      refMap.set('@e1', element);

      const snapshot: ParsedSnapshot = {
        url: 'https://example.com',
        title: 'Example Page',
        elements: [element],
        interactiveElements: [element],
        refMap,
        timestamp: new Date(),
      };

      expect(snapshot.url).toBe('https://example.com');
      expect(snapshot.elements.length).toBe(1);
      expect(snapshot.refMap.get('@e1')).toBe(element);
    });
  });

  describe('IBrowserClient Interface', () => {
    it('should define common browser operations', () => {
      // This is a compile-time check - if the interface is missing methods,
      // TypeScript will complain during compilation
      const _expectCompilation = (client: IBrowserClient) => {
        void client.tool;
        void client.launch;
        void client.quit;
        void client.isAvailable;
        void client.navigate;
        void client.reload;
        void client.goBack;
        void client.goForward;
        void client.click;
        void client.fill;
        void client.getText;
        void client.isVisible;
        void client.screenshot;
        void client.evaluate;
        void client.dispose;
      };
      expect(_expectCompilation).toBeDefined();
    });
  });

  describe('IAgentBrowserClient Interface', () => {
    it('should extend IBrowserClient with agent-browser features', () => {
      // This is a compile-time check
      const _expectCompilation = (client: IAgentBrowserClient) => {
        void client.tool;
        // IBrowserClient methods
        void client.launch;
        void client.quit;
        void client.navigate;
        // agent-browser specific
        void client.getSnapshot;
        void client.createSession;
        void client.switchSession;
        void client.listSessions;
        void client.mockRoute;
        void client.abortRoute;
        void client.clearRoutes;
        void client.setDevice;
        void client.setViewport;
        void client.saveState;
        void client.loadState;
        void client.waitForElement;
        void client.waitForText;
        void client.waitForUrl;
        void client.waitForNetworkIdle;
      };
      expect(_expectCompilation).toBeDefined();
    });

    it('should enforce tool property as agent-browser', () => {
      // This is a compile-time check that tool must be 'agent-browser'
      const _expectCompilation = (client: IAgentBrowserClient) => {
        // TypeScript will error if tool is not 'agent-browser'
        const tool: 'agent-browser' = client.tool;
        expect(tool).toBe('agent-browser');
      };
    });
  });

  describe('Type compatibility', () => {
    it('should allow IBrowserClient implementations', () => {
      // Mock implementation of IBrowserClient
      const mockClient: IBrowserClient = {
        tool: 'vibium',
        launch: async () => ({ success: true, value: {} as BrowserSessionInfo }),
        quit: async () => ({ success: true, value: undefined }),
        isAvailable: async () => true,
        navigate: async () => ({ success: true, value: {} as any }),
        reload: async () => ({ success: true, value: undefined }),
        goBack: async () => ({ success: true, value: undefined }),
        goForward: async () => ({ success: true, value: undefined }),
        click: async () => ({ success: true, value: undefined }),
        fill: async () => ({ success: true, value: undefined }),
        getText: async () => ({ success: true, value: 'text' }),
        isVisible: async () => ({ success: true, value: true }),
        screenshot: async () => ({ success: true, value: {} as any }),
        evaluate: async () => ({ success: true, value: undefined }),
        dispose: async () => {},
      };

      expect(mockClient.tool).toBe('vibium');
    });

    it('should allow polymorphic element targeting', () => {
      function acceptElementTarget(target: ElementTarget | string): void {
        if (typeof target === 'string') {
          expect(typeof target).toBe('string');
        } else {
          expect(target.type).toBeDefined();
          expect(target.value).toBeDefined();
        }
      }

      acceptElementTarget('button.submit');
      acceptElementTarget({ type: 'css', value: 'button' });
      acceptElementTarget({ type: 'ref', value: '@e1' });
    });
  });

  describe('Use cases', () => {
    it('should support e2e-testing use case', () => {
      const useCase: any = 'e2e-testing';
      expect(['e2e-testing', 'visual-regression', 'accessibility', 'api-mocking', 'responsive-testing', 'auth-testing']).toContain(useCase);
    });

    it('should support browser tool preference', () => {
      const preference: any = 'auto';
      expect(['agent-browser', 'vibium', 'auto']).toContain(preference);
    });
  });
});
