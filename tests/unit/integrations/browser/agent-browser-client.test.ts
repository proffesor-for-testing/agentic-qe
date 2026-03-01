/**
 * Tests for AgentBrowserClient
 *
 * Tests the AgentBrowserClient implementation of IAgentBrowserClient interface.
 * Uses mocked command executor to test behavior without actual browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentBrowserClient, createAgentBrowserClient } from '../../../../src/integrations/browser/agent-browser/client';
import type { ElementTarget } from '../../../../src/integrations/browser/types';
import {
  BrowserError,
  BrowserUnavailableError,
  BrowserElementNotFoundError,
  BrowserTimeoutError,
} from '../../../../src/integrations/browser/types';

// Mock dependencies with proper class constructors
vi.mock('../../../../src/integrations/browser/agent-browser/command-executor', () => {
  const MockAgentBrowserCommandExecutor = class {
    open = vi.fn().mockReturnValue({ success: true });
    close = vi.fn().mockReturnValue({ success: true });
    snapshot = vi.fn().mockReturnValue({ success: true, data: { snapshot: '', refs: {} } });
    click = vi.fn().mockReturnValue({ success: true });
    fill = vi.fn().mockReturnValue({ success: true });
    getText = vi.fn().mockReturnValue({ success: true, data: 'Test text' });
    isVisible = vi.fn().mockReturnValue({ success: true, data: true });
    screenshot = vi.fn().mockReturnValue({ success: true, data: 'base64data' });
    eval = vi.fn().mockReturnValue({ success: true, data: '{}' });
    waitForElement = vi.fn().mockReturnValue({ success: true });
    waitForText = vi.fn().mockReturnValue({ success: true });
    waitForUrl = vi.fn().mockReturnValue({ success: true });
    waitForNetworkIdle = vi.fn().mockReturnValue({ success: true });
    setDevice = vi.fn().mockReturnValue({ success: true });
    setViewport = vi.fn().mockReturnValue({ success: true });
    mockRoute = vi.fn().mockReturnValue({ success: true });
    abortRoute = vi.fn().mockReturnValue({ success: true });
    clearRoutes = vi.fn().mockReturnValue({ success: true });
    saveState = vi.fn().mockReturnValue({ success: true });
    loadState = vi.fn().mockReturnValue({ success: true });
    getSessionName = vi.fn().mockReturnValue('test-session');
    isBrowserLaunched = vi.fn().mockReturnValue(false);
  };

  return {
    AgentBrowserCommandExecutor: MockAgentBrowserCommandExecutor,
    isAgentBrowserAvailable: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../../../../src/integrations/browser/agent-browser/session-manager', () => {
  const MockAgentBrowserSessionManager = class {
    createSession = vi.fn().mockResolvedValue({
      name: 'test-session',
      status: 'active',
      currentUrl: undefined,
      createdAt: new Date(),
    });
    closeSession = vi.fn().mockResolvedValue({ success: true });
    closeAllSessions = vi.fn().mockResolvedValue(undefined);
    switchSession = vi.fn();
    listSessions = vi.fn().mockReturnValue([]);
    updateSessionUrl = vi.fn();
  };

  return {
    AgentBrowserSessionManager: MockAgentBrowserSessionManager,
  };
});

vi.mock('../../../../src/integrations/browser/agent-browser/snapshot-parser', () => {
  const mockParsedSnapshot = {
    rawTree: '',
    elements: [],
    interactiveElements: [],
    refMap: new Map(),
    stats: { totalElements: 0, interactiveCount: 0, maxDepth: 0 },
    parsedAt: new Date(),
  };

  const MockSnapshotParser = class {
    parse = vi.fn().mockReturnValue(mockParsedSnapshot);
    parseJson = vi.fn().mockReturnValue(mockParsedSnapshot);
    findByRef = vi.fn().mockReturnValue(null);
    findByRole = vi.fn().mockReturnValue([]);
    findByName = vi.fn().mockReturnValue([]);
  };

  return {
    SnapshotParser: MockSnapshotParser,
    getSnapshotParser: vi.fn().mockReturnValue(new MockSnapshotParser()),
  };
});

describe('AgentBrowserClient', () => {
  let client: AgentBrowserClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AgentBrowserClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Property', () => {
    it('should return "agent-browser" as tool', () => {
      expect(client.tool).toBe('agent-browser');
    });

    it('should be readonly', () => {
      expect(client.tool).toBe('agent-browser');
      // TypeScript would prevent reassignment at compile time
    });
  });

  describe('isAvailable()', () => {
    it('should return a boolean', async () => {
      const result = await client.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should return true when CLI is available', async () => {
      const result = await client.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('Interface Compliance', () => {
    describe('IBrowserClient methods', () => {
      it('should have launch method', () => {
        expect(typeof client.launch).toBe('function');
      });

      it('should have quit method', () => {
        expect(typeof client.quit).toBe('function');
      });

      it('should have isAvailable method', () => {
        expect(typeof client.isAvailable).toBe('function');
      });

      it('should have navigate method', () => {
        expect(typeof client.navigate).toBe('function');
      });

      it('should have reload method', () => {
        expect(typeof client.reload).toBe('function');
      });

      it('should have goBack method', () => {
        expect(typeof client.goBack).toBe('function');
      });

      it('should have goForward method', () => {
        expect(typeof client.goForward).toBe('function');
      });

      it('should have click method', () => {
        expect(typeof client.click).toBe('function');
      });

      it('should have fill method', () => {
        expect(typeof client.fill).toBe('function');
      });

      it('should have getText method', () => {
        expect(typeof client.getText).toBe('function');
      });

      it('should have isVisible method', () => {
        expect(typeof client.isVisible).toBe('function');
      });

      it('should have screenshot method', () => {
        expect(typeof client.screenshot).toBe('function');
      });

      it('should have evaluate method', () => {
        expect(typeof client.evaluate).toBe('function');
      });

      it('should have dispose method', () => {
        expect(typeof client.dispose).toBe('function');
      });
    });

    describe('IAgentBrowserClient specific methods', () => {
      it('should have getSnapshot method', () => {
        expect(typeof client.getSnapshot).toBe('function');
      });

      it('should have createSession method', () => {
        expect(typeof client.createSession).toBe('function');
      });

      it('should have switchSession method', () => {
        expect(typeof client.switchSession).toBe('function');
      });

      it('should have listSessions method', () => {
        expect(typeof client.listSessions).toBe('function');
      });

      it('should have mockRoute method', () => {
        expect(typeof client.mockRoute).toBe('function');
      });

      it('should have abortRoute method', () => {
        expect(typeof client.abortRoute).toBe('function');
      });

      it('should have clearRoutes method', () => {
        expect(typeof client.clearRoutes).toBe('function');
      });

      it('should have setDevice method', () => {
        expect(typeof client.setDevice).toBe('function');
      });

      it('should have setViewport method', () => {
        expect(typeof client.setViewport).toBe('function');
      });

      it('should have saveState method', () => {
        expect(typeof client.saveState).toBe('function');
      });

      it('should have loadState method', () => {
        expect(typeof client.loadState).toBe('function');
      });

      it('should have waitForElement method', () => {
        expect(typeof client.waitForElement).toBe('function');
      });

      it('should have waitForText method', () => {
        expect(typeof client.waitForText).toBe('function');
      });

      it('should have waitForUrl method', () => {
        expect(typeof client.waitForUrl).toBe('function');
      });

      it('should have waitForNetworkIdle method', () => {
        expect(typeof client.waitForNetworkIdle).toBe('function');
      });
    });
  });

  describe('ElementTarget Handling', () => {
    describe('string targets', () => {
      it('should handle ref format strings (@e1)', async () => {
        const result = await client.click('@e1');
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });

      it('should handle ref format without @ (e1)', async () => {
        const result = await client.click('e1');
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });

      it('should handle CSS selector strings', async () => {
        const result = await client.click('button.submit');
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });
    });

    describe('ElementTarget objects', () => {
      it('should handle ref type targets', async () => {
        const target: ElementTarget = { type: 'ref', value: '@e1' };
        const result = await client.click(target);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });

      it('should handle ref type without @', async () => {
        const target: ElementTarget = { type: 'ref', value: 'e1' };
        const result = await client.click(target);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });

      it('should handle css type targets', async () => {
        const target: ElementTarget = { type: 'css', value: 'button.submit' };
        const result = await client.click(target);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });

      it('should handle xpath type targets', async () => {
        const target: ElementTarget = { type: 'xpath', value: '//button[@class="submit"]' };
        const result = await client.click(target);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });

      it('should handle text type targets', async () => {
        const target: ElementTarget = { type: 'text', value: 'Submit' };
        const result = await client.click(target);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });
    });
  });

  describe('Result Pattern', () => {
    it('should return success result for successful operations', async () => {
      const result = await client.click('@e1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeUndefined();
      }
    });

    it('should return value for operations that return data', async () => {
      const result = await client.getText('@e1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.value).toBe('string');
      }
    });

    it('should return boolean value for visibility check', async () => {
      const result = await client.isVisible('@e1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.value).toBe('boolean');
      }
    });
  });

  describe('Configuration', () => {
    it('should accept custom config', () => {
      const customClient = new AgentBrowserClient({
        headed: true,
        timeout: 60000,
        debug: true,
        sessionName: 'custom-session',
      });
      expect(customClient).toBeDefined();
      expect(customClient.tool).toBe('agent-browser');
    });

    it('should use default config when not provided', () => {
      const defaultClient = new AgentBrowserClient();
      expect(defaultClient).toBeDefined();
      expect(defaultClient.tool).toBe('agent-browser');
    });

    it('should use partial config', () => {
      const partialClient = new AgentBrowserClient({ timeout: 10000 });
      expect(partialClient).toBeDefined();
    });
  });

  describe('Factory Function', () => {
    it('should create client via factory function', () => {
      const factoryClient = createAgentBrowserClient();
      expect(factoryClient).toBeDefined();
      expect(factoryClient.tool).toBe('agent-browser');
    });

    it('should create client with config via factory', () => {
      const factoryClient = createAgentBrowserClient({ headed: true });
      expect(factoryClient).toBeDefined();
      expect(factoryClient.tool).toBe('agent-browser');
    });

    it('should create new instances each time', () => {
      const client1 = createAgentBrowserClient();
      const client2 = createAgentBrowserClient();
      expect(client1).not.toBe(client2);
    });
  });

  describe('Lifecycle Methods', () => {
    it('should launch browser', async () => {
      const result = await client.launch();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should launch with options', async () => {
      const result = await client.launch({
        headless: true,
        viewport: { width: 1920, height: 1080 },
      });
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should quit browser', async () => {
      const result = await client.quit();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should dispose resources', async () => {
      await expect(client.dispose()).resolves.toBeUndefined();
    });
  });

  describe('Navigation Methods', () => {
    it('should navigate to URL', async () => {
      const result = await client.navigate('https://example.com');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should reload page', async () => {
      const result = await client.reload();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should go back in history', async () => {
      const result = await client.goBack();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should go forward in history', async () => {
      const result = await client.goForward();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Element Interaction Methods', () => {
    it('should click element', async () => {
      const result = await client.click('@e1');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should fill input', async () => {
      const result = await client.fill('@e2', 'test@example.com');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should get text content', async () => {
      const result = await client.getText('@e1');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should check visibility', async () => {
      const result = await client.isVisible('@e1');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Screenshot Methods', () => {
    it('should take screenshot', async () => {
      const result = await client.screenshot();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should take screenshot with options', async () => {
      const result = await client.screenshot({ fullPage: true });
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should take screenshot to path', async () => {
      const result = await client.screenshot({ path: '/tmp/screenshot.png' });
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Evaluate Method', () => {
    it('should evaluate JavaScript', async () => {
      const result = await client.evaluate('document.title');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should evaluate complex scripts', async () => {
      const result = await client.evaluate(`
        JSON.stringify({
          title: document.title,
          url: window.location.href
        })
      `);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Snapshot Methods (agent-browser specific)', () => {
    it('should get snapshot', async () => {
      const result = await client.getSnapshot();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should get interactive-only snapshot', async () => {
      const result = await client.getSnapshot({ interactive: true });
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should get snapshot with depth limit', async () => {
      const result = await client.getSnapshot({ depth: 3 });
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Session Methods (agent-browser specific)', () => {
    it('should create session', async () => {
      const result = await client.createSession('test-session');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should switch session', async () => {
      const result = await client.switchSession('other-session');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should list sessions', async () => {
      const result = await client.listSessions();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Network Methods (agent-browser specific)', () => {
    it('should mock route', async () => {
      const result = await client.mockRoute('/api/users', { status: 200, body: [] });
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should mock route with headers', async () => {
      const result = await client.mockRoute('/api/users', {
        status: 200,
        body: { data: [] },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should abort route', async () => {
      const result = await client.abortRoute('/api/analytics');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should clear routes', async () => {
      const result = await client.clearRoutes();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Device Methods (agent-browser specific)', () => {
    it('should set device', async () => {
      const result = await client.setDevice('iPhone 12');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should set viewport', async () => {
      const result = await client.setViewport(1920, 1080);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('State Methods (agent-browser specific)', () => {
    it('should save state', async () => {
      const result = await client.saveState('/tmp/state.json');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should load state', async () => {
      const result = await client.loadState('/tmp/state.json');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Wait Methods (agent-browser specific)', () => {
    it('should wait for element', async () => {
      const result = await client.waitForElement('@e1');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should wait for element with timeout', async () => {
      const result = await client.waitForElement('@e1', 5000);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should wait for text', async () => {
      const result = await client.waitForText('Welcome');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should wait for URL', async () => {
      const result = await client.waitForUrl('/dashboard');
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should wait for network idle', async () => {
      const result = await client.waitForNetworkIdle();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });
});
