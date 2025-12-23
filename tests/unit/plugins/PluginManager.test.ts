/**
 * Plugin System Unit Tests
 * Phase 3 B2: Extensible Test Framework Adapters
 */

import {
  PluginManager,
  getPluginManager,
  resetPluginManager,
  PlaywrightPlugin,
  VitestPlugin,
  McpToolsPlugin,
  PluginCategory,
  PluginState,
} from '../../../src/plugins';

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    resetPluginManager();
    manager = getPluginManager();
  });

  afterEach(async () => {
    await manager.shutdown();
    resetPluginManager();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);
    });

    it('should be singleton via getPluginManager', () => {
      const manager1 = getPluginManager();
      const manager2 = getPluginManager();
      expect(manager1).toBe(manager2);
    });

    it('should allow custom configuration', async () => {
      await manager.initialize({
        pluginDirs: ['./custom-plugins'],
        autoActivate: false,
      });
      expect(manager.isInitialized()).toBe(true);
    });
  });

  describe('plugin registration', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should register a plugin', async () => {
      const plugin = new PlaywrightPlugin();
      await manager.registerPlugin(plugin);

      expect(manager.hasPlugin('@agentic-qe/playwright-adapter')).toBe(true);
    });

    it('should get registered plugin by ID', async () => {
      const plugin = new PlaywrightPlugin();
      await manager.registerPlugin(plugin);

      const retrieved = manager.getPlugin('@agentic-qe/playwright-adapter');
      expect(retrieved).toBe(plugin);
    });

    it('should track plugin state after registration', async () => {
      const plugin = new PlaywrightPlugin();
      await manager.registerPlugin(plugin);

      // After registration, state is DISCOVERED (loading is a separate step)
      const state = manager.getPluginState('@agentic-qe/playwright-adapter');
      expect(state).toBe(PluginState.DISCOVERED);
    });

    it('should reject duplicate plugin IDs', async () => {
      const plugin1 = new PlaywrightPlugin();
      const plugin2 = new PlaywrightPlugin();

      await manager.registerPlugin(plugin1);
      await expect(manager.registerPlugin(plugin2)).rejects.toThrow(/already registered/);
    });
  });

  describe('plugin activation', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should activate a registered plugin', async () => {
      const plugin = new VitestPlugin();
      await manager.registerPlugin(plugin);
      await manager.activatePlugin('@agentic-qe/vitest-adapter');

      const state = manager.getPluginState('@agentic-qe/vitest-adapter');
      expect(state).toBe(PluginState.ACTIVE);
    });

    it('should call plugin onActivate lifecycle hook', async () => {
      const plugin = new VitestPlugin();
      const activateSpy = jest.spyOn(plugin, 'onActivate');

      await manager.registerPlugin(plugin);
      await manager.activatePlugin('@agentic-qe/vitest-adapter');

      expect(activateSpy).toHaveBeenCalled();
    });

    it('should throw for non-existent plugin', async () => {
      await expect(manager.activatePlugin('non-existent')).rejects.toThrow(/not found/);
    });
  });

  describe('plugin deactivation', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should deactivate an active plugin', async () => {
      const plugin = new PlaywrightPlugin();
      await manager.registerPlugin(plugin);
      await manager.activatePlugin('@agentic-qe/playwright-adapter');
      await manager.deactivatePlugin('@agentic-qe/playwright-adapter');

      const state = manager.getPluginState('@agentic-qe/playwright-adapter');
      expect(state).toBe(PluginState.INACTIVE);
    });

    it('should call plugin onDeactivate lifecycle hook', async () => {
      const plugin = new PlaywrightPlugin();
      const deactivateSpy = jest.spyOn(plugin, 'onDeactivate');

      await manager.registerPlugin(plugin);
      await manager.activatePlugin('@agentic-qe/playwright-adapter');
      await manager.deactivatePlugin('@agentic-qe/playwright-adapter');

      expect(deactivateSpy).toHaveBeenCalled();
    });
  });

  describe('plugins by category', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should get plugins by category', async () => {
      const playwright = new PlaywrightPlugin();
      const vitest = new VitestPlugin();
      const mcpTools = new McpToolsPlugin();

      await manager.registerPlugin(playwright);
      await manager.registerPlugin(vitest);
      await manager.registerPlugin(mcpTools);

      const testFrameworks = manager.getPluginsByCategory(PluginCategory.TEST_FRAMEWORK);
      expect(testFrameworks).toHaveLength(2);
      expect(testFrameworks).toContain(playwright);
      expect(testFrameworks).toContain(vitest);

      const mcpPlugins = manager.getPluginsByCategory(PluginCategory.MCP_TOOLS);
      expect(mcpPlugins).toHaveLength(1);
      expect(mcpPlugins).toContain(mcpTools);
    });
  });

  describe('service registration', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should register and retrieve services', async () => {
      const testService = { doSomething: () => 'done' };
      manager.registerService('test:service', testService);

      const retrieved = manager.getService('test:service');
      expect(retrieved).toBe(testService);
    });

    it('should return undefined for non-existent service', () => {
      const service = manager.getService('non-existent');
      expect(service).toBeUndefined();
    });
  });

  describe('all plugins listing', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should list all registered plugins', async () => {
      const playwright = new PlaywrightPlugin();
      const vitest = new VitestPlugin();

      await manager.registerPlugin(playwright);
      await manager.registerPlugin(vitest);

      const all = manager.getAllPlugins();
      expect(all).toHaveLength(2);
    });
  });

  describe('shutdown', () => {
    it('should deactivate all plugins on shutdown', async () => {
      await manager.initialize();

      const plugin = new VitestPlugin();
      await manager.registerPlugin(plugin);
      await manager.activatePlugin('@agentic-qe/vitest-adapter');

      await manager.shutdown();

      expect(manager.isInitialized()).toBe(false);
    });
  });
});

describe('PlaywrightPlugin', () => {
  it('should have correct metadata', () => {
    const plugin = new PlaywrightPlugin();

    expect(plugin.metadata.id).toBe('@agentic-qe/playwright-adapter');
    expect(plugin.metadata.category).toBe(PluginCategory.TEST_FRAMEWORK);
    expect(plugin.frameworkId).toBe('playwright');
  });

  it('should define file patterns', () => {
    const plugin = new PlaywrightPlugin();

    expect(plugin.filePatterns).toContain('**/*.spec.ts');
    expect(plugin.filePatterns).toContain('**/*.test.ts');
  });

  it('should generate test code', async () => {
    const plugin = new PlaywrightPlugin();

    const result = await plugin.generateTest({
      sourceCode: 'export function hello() { return "world"; }',
      sourceFilePath: '/src/hello.ts',
      testType: 'e2e',
    });

    expect(result.code).toContain("import { test, expect }");
    expect(result.filePath).toContain('.spec.ts');
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies?.[0].name).toBe('@playwright/test');
  });

  it('should parse test files', async () => {
    const plugin = new PlaywrightPlugin();

    const content = `
import { test, expect } from '@playwright/test';

test.describe('MyFeature', () => {
  test('should work', async ({ page }) => {
    await expect(true).toBe(true);
  });
});
`;

    const parsed = await plugin.parseTestFile('/tests/my.spec.ts', content);

    expect(parsed.suites).toHaveLength(1);
    expect(parsed.suites[0].name).toBe('MyFeature');
    expect(parsed.imports).toHaveLength(1);
  });

  it('should provide framework config', () => {
    const plugin = new PlaywrightPlugin();
    const config = plugin.getFrameworkConfig();

    expect(config.configFileName).toBe('playwright.config.ts');
    expect(config.defaultTestDir).toBe('tests');
    expect(config.dependencies).toHaveLength(1);
  });
});

describe('VitestPlugin', () => {
  it('should have correct metadata', () => {
    const plugin = new VitestPlugin();

    expect(plugin.metadata.id).toBe('@agentic-qe/vitest-adapter');
    expect(plugin.metadata.category).toBe(PluginCategory.TEST_FRAMEWORK);
    expect(plugin.frameworkId).toBe('vitest');
  });

  it('should generate unit tests', async () => {
    const plugin = new VitestPlugin();

    const result = await plugin.generateTest({
      sourceCode: 'export function add(a: number, b: number) { return a + b; }',
      sourceFilePath: '/src/math.ts',
      testType: 'unit',
    });

    expect(result.code).toContain("import { describe, it, expect");
    expect(result.code).toContain("describe('");
    expect(result.filePath).toContain('.test.ts');
  });

  it('should parse vitest test files', async () => {
    const plugin = new VitestPlugin();

    const content = `
import { describe, it, expect } from 'vitest';

describe('Calculator', () => {
  it('should add numbers', () => {
    expect(1 + 1).toBe(2);
  });

  it('should multiply numbers', () => {
    expect(2 * 3).toBe(6);
  });
});
`;

    const parsed = await plugin.parseTestFile('/tests/calc.test.ts', content);

    expect(parsed.suites).toHaveLength(1);
    expect(parsed.suites[0].name).toBe('Calculator');
    expect(parsed.suites[0].tests).toHaveLength(2);
  });

  it('should provide framework config', () => {
    const plugin = new VitestPlugin();
    const config = plugin.getFrameworkConfig();

    expect(config.configFileName).toBe('vitest.config.ts');
    expect(config.dependencies.some(d => d.name === 'vitest')).toBe(true);
  });
});

describe('McpToolsPlugin', () => {
  it('should have correct metadata', () => {
    const plugin = new McpToolsPlugin();

    expect(plugin.metadata.id).toBe('@agentic-qe/mcp-tools');
    expect(plugin.metadata.category).toBe(PluginCategory.MCP_TOOLS);
  });

  it('should discover capabilities on activation', async () => {
    const manager = getPluginManager();
    await manager.initialize();

    const plugin = new McpToolsPlugin();
    await manager.registerPlugin(plugin);
    await manager.activatePlugin('@agentic-qe/mcp-tools');

    const capabilities = plugin.getCapabilities();
    expect(capabilities.length).toBeGreaterThan(0);

    // Check for key capabilities
    expect(plugin.hasCapability('mcp__agentic_qe__fleet_init')).toBe(true);
    expect(plugin.hasCapability('mcp__agentic_qe__test_generate_enhanced')).toBe(true);
    expect(plugin.hasCapability('mcp__agentic_qe__memory_store')).toBe(true);

    await manager.shutdown();
  });

  it('should get capability by name', async () => {
    const manager = getPluginManager();
    await manager.initialize();

    const plugin = new McpToolsPlugin();
    await manager.registerPlugin(plugin);
    await manager.activatePlugin('@agentic-qe/mcp-tools');

    const capability = plugin.getCapability('mcp__agentic_qe__fleet_init');
    expect(capability).toBeDefined();
    expect(capability?.name).toBe('mcp__agentic_qe__fleet_init');
    expect(capability?.available).toBe(true);

    await manager.shutdown();
  });

  it('should invoke tools via stub', async () => {
    const manager = getPluginManager();
    await manager.initialize();

    const plugin = new McpToolsPlugin();
    await manager.registerPlugin(plugin);
    await manager.activatePlugin('@agentic-qe/mcp-tools');

    const result = await plugin.invokeTool('mcp__agentic_qe__fleet_status', {});
    expect(result).toBeDefined();
    expect((result as { status: string }).status).toBe('active');

    await manager.shutdown();
  });
});
