/**
 * Test: CodexInstaller
 * Tests OpenAI Codex CLI TOML MCP config and AGENTS.md installation.
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

describe('CodexInstaller', () => {
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

    it('creates .codex/config.toml with TOML MCP config', async () => {
      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.toml')
      );
      expect(configCall).toBeDefined();
      const content = configCall![1] as string;
      expect(content).toContain('[mcp_servers.agentic-qe]');
      expect(content).toContain('type = "stdio"');
      expect(content).toContain('command = "npx"');
      expect(content).toContain('AQE_V3_MODE');
    });

    it('creates AGENTS.md behavioral rules', async () => {
      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('AGENTS.md')
      );
      expect(rulesCall).toBeDefined();
      expect(rulesCall![1]).toContain('Quality Engineering Standards');
      expect(rulesCall![1]).toContain('fleet_init');
    });

    it('creates .codex/ directory', async () => {
      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot });
      await installer.install();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.codex'),
        { recursive: true }
      );
    });

    it('returns success with correct result shape', async () => {
      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.mcpConfigured).toBe(true);
      expect(result.agentsMdInstalled).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.configPath).toBe(join(projectRoot, '.codex/config.toml'));
      expect(result.agentsMdPath).toBe(join(projectRoot, 'AGENTS.md'));
    });

    it('generates valid TOML syntax', async () => {
      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.toml')
      );
      const content = configCall![1] as string;
      // Verify TOML key-value pairs
      expect(content).toMatch(/^\[mcp_servers\.agentic-qe\]$/m);
      expect(content).toMatch(/^command = "npx"$/m);
      expect(content).toMatch(/^args = \["-y", "agentic-qe@latest", "mcp"\]$/m);
      expect(content).toMatch(/^\[mcp_servers\.agentic-qe\.env\]$/m);
    });
  });

  describe('install() - existing files', () => {
    it('skips when files exist and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot, overwrite: false });
      const result = await installer.install();

      expect(result.mcpConfigured).toBe(false);
      expect(result.agentsMdInstalled).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('appends to existing TOML when overwrite is true', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingToml = `[model]
default = "gpt-4"
`;
      mockReadFileSync.mockReturnValue(existingToml);

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.toml')
      );
      expect(configCall).toBeDefined();
      const content = configCall![1] as string;
      // Should contain both original and new content
      expect(content).toContain('[model]');
      expect(content).toContain('[mcp_servers.agentic-qe]');
    });

    it('skips TOML merge if agentic-qe already present', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingToml = `[mcp_servers.agentic-qe]
type = "stdio"
command = "npx"
`;
      mockReadFileSync.mockReturnValue(existingToml);

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.toml')
      );
      const content = configCall![1] as string;
      // Should return existing content unchanged
      expect(content).toBe(existingToml);
    });

    it('appends to existing AGENTS.md when overwrite is true', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingAgentsMd = '# My Project Agents\n\nCustom instructions here.';
      mockReadFileSync.mockReturnValue(existingAgentsMd);

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('AGENTS.md')
      );
      expect(rulesCall).toBeDefined();
      const content = rulesCall![1] as string;
      expect(content).toContain('My Project Agents');
      expect(content).toContain('Quality Engineering Standards');
    });
  });

  describe('install() - error handling', () => {
    it('catches fs errors and returns success: false', async () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Codex installation failed');
    });
  });

  describe('createCodexInstaller()', () => {
    it('returns a CodexInstaller instance', async () => {
      const { createCodexInstaller, CodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot });
      expect(installer).toBeInstanceOf(CodexInstaller);
    });
  });
});
