/**
 * Test: WindsurfInstaller
 * Tests Windsurf MCP config and .windsurfrules installation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

describe('WindsurfInstaller', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('install() - fresh project', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
    });

    it('creates .windsurf/mcp_config.json with mcpServers key', async () => {
      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('mcp_config.json')
      );
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed).toHaveProperty('mcpServers');
      expect(parsed.mcpServers).toHaveProperty('agentic-qe');
      expect(parsed.mcpServers['agentic-qe'].command).toBe('npx');
    });

    it('creates .windsurfrules behavioral rules', async () => {
      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('.windsurfrules')
      );
      expect(rulesCall).toBeDefined();
      expect(rulesCall![1]).toContain('Quality Engineering Standards');
      expect(rulesCall![1]).toContain('fleet_init');
    });

    it('creates .windsurf/ directory', async () => {
      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot });
      await installer.install();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.windsurf'),
        { recursive: true }
      );
    });

    it('returns success with correct result shape', async () => {
      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.mcpConfigured).toBe(true);
      expect(result.rulesInstalled).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.configPath).toBe(join(projectRoot, '.windsurf/mcp_config.json'));
      expect(result.rulesPath).toBe(join(projectRoot, '.windsurfrules'));
    });

    it('includes AQE env vars in MCP config', async () => {
      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('mcp_config.json')
      );
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.mcpServers['agentic-qe'].env.AQE_V3_MODE).toBe('true');
      expect(parsed.mcpServers['agentic-qe'].env.AQE_MEMORY_PATH).toBe('.agentic-qe/memory.db');
    });
  });

  describe('install() - existing files', () => {
    it('skips when files exist and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);

      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot, overwrite: false });
      const result = await installer.install();

      expect(result.mcpConfigured).toBe(false);
      expect(result.rulesInstalled).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('merges into existing JSON config when overwrite is true', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingConfig = JSON.stringify({
        mcpServers: { 'other-server': { command: 'other' } },
      });
      mockReadFileSync.mockReturnValue(existingConfig);

      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('mcp_config.json')
      );
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.mcpServers).toHaveProperty('other-server');
      expect(parsed.mcpServers).toHaveProperty('agentic-qe');
    });

    it('appends to existing .windsurfrules when overwrite is true', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingRules = '# My Windsurf Rules\n\nCustom rules here.';
      mockReadFileSync.mockReturnValue(existingRules);

      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('.windsurfrules')
      );
      expect(rulesCall).toBeDefined();
      const content = rulesCall![1] as string;
      expect(content).toContain('My Windsurf Rules');
      expect(content).toContain('Quality Engineering Standards');
    });

    it('skips rules merge if AQE section already present', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingRules = '# Rules\n\nUse Agentic QE for testing.';
      mockReadFileSync.mockReturnValue(existingRules);

      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('.windsurfrules')
      );
      const content = rulesCall![1] as string;
      // Should keep existing unchanged
      expect(content).toBe(existingRules);
    });
  });

  describe('install() - error handling', () => {
    it('catches fs errors and returns success: false', async () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { createWindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Windsurf installation failed');
    });
  });

  describe('createWindsurfInstaller()', () => {
    it('returns a WindsurfInstaller instance', async () => {
      const { createWindsurfInstaller, WindsurfInstaller } = await import('../../../src/init/windsurf-installer.js');
      const installer = createWindsurfInstaller({ projectRoot });
      expect(installer).toBeInstanceOf(WindsurfInstaller);
    });
  });
});
