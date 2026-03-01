/**
 * Test: CopilotInstaller
 * Tests GitHub Copilot MCP config and behavioral rules installation.
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

describe('CopilotInstaller', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('install() - fresh project', () => {
    beforeEach(() => {
      // Nothing exists yet
      mockExistsSync.mockReturnValue(false);
    });

    it('creates .vscode/mcp.json with servers key', async () => {
      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('mcp.json')
      );
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed).toHaveProperty('servers');
      expect(parsed.servers).toHaveProperty('agentic-qe');
    });

    it('creates .github/copilot-instructions.md', async () => {
      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('copilot-instructions.md')
      );
      expect(rulesCall).toBeDefined();
      expect(rulesCall![1]).toContain('Quality Engineering Standards');
    });

    it('creates .vscode/ and .github/ directories', async () => {
      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot });
      await installer.install();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.vscode'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.github'),
        { recursive: true }
      );
    });

    it('returns success with correct result shape', async () => {
      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.mcpConfigured).toBe(true);
      expect(result.rulesInstalled).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.configPath).toBe(join(projectRoot, '.vscode/mcp.json'));
      expect(result.rulesPath).toBe(join(projectRoot, '.github/copilot-instructions.md'));
    });
  });

  describe('install() - existing files', () => {
    it('skips when files exist and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);

      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot, overwrite: false });
      const result = await installer.install();

      expect(result.mcpConfigured).toBe(false);
      expect(result.rulesInstalled).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('merges when overwrite is true and config exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingConfig = JSON.stringify({
        servers: { 'other-server': { command: 'other' } },
      });
      mockReadFileSync.mockReturnValue(existingConfig);

      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('mcp.json')
      );
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.servers).toHaveProperty('other-server');
      expect(parsed.servers).toHaveProperty('agentic-qe');
    });

    it('preserves existing servers entries during merge', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingConfig = JSON.stringify({
        servers: { 'custom-tool': { command: 'npx', args: ['custom'] } },
        extraField: true,
      });
      mockReadFileSync.mockReturnValue(existingConfig);

      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('mcp.json')
      );
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.servers['custom-tool']).toEqual({ command: 'npx', args: ['custom'] });
      expect(parsed.extraField).toBe(true);
    });
  });

  describe('install() - error handling', () => {
    it('catches fs errors and returns success: false', async () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { createCopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Copilot installation failed');
    });
  });

  describe('createCopilotInstaller()', () => {
    it('returns a CopilotInstaller instance', async () => {
      const { createCopilotInstaller, CopilotInstaller } = await import('../../../src/init/copilot-installer.js');
      const installer = createCopilotInstaller({ projectRoot });
      expect(installer).toBeInstanceOf(CopilotInstaller);
    });
  });
});
