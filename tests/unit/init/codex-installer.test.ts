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
    copyFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'fs';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockCopyFileSync = copyFileSync as ReturnType<typeof vi.fn>;
const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;

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
      expect(result.hooksConfigured).toBe(false);
      expect(result.skillsInstalled).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.components.mcp.status).toBe('installed');
      expect(result.components.rules.status).toBe('installed');
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

  describe('install() - Codex hooks and skills', () => {
    it('installs packaged hooks and AQE skills', async () => {
      mockExistsSync.mockImplementation((value: unknown) => {
        const file = String(value);
        if (file.startsWith(projectRoot)) return false;
        return file.endsWith('/.codex/hooks.json')
          || file.endsWith('/.codex/hooks')
          || file.endsWith('/.agents/skills')
          || file.endsWith('/.agents/skills/aqe-plan-quality')
          || file.endsWith('/.claude/hooks/aqe-hook.cjs')
          || file.endsWith('/.claude/helpers/ruflo-hook.cjs');
      });
      mockReaddirSync.mockImplementation((value: unknown) => {
        const dir = String(value);
        if (dir.endsWith('.codex/hooks')) return ['aqe-codex-hook.cjs', 'ruflo-codex-hook.cjs'];
        if (dir.endsWith('.agents/skills')) return ['aqe-plan-quality'];
        if (dir.endsWith('aqe-plan-quality')) return ['SKILL.md'];
        return [];
      });
      mockStatSync.mockImplementation((value: unknown) => ({
        isFile: () => String(value).endsWith('.cjs') || String(value).endsWith('.md'),
        isDirectory: () => !String(value).endsWith('.cjs') && !String(value).endsWith('.md'),
      }));
      mockReadFileSync.mockImplementation((value: unknown) => {
        if (String(value).endsWith('.codex/hooks.json')) {
          return JSON.stringify({ hooks: { SessionStart: [] } });
        }
        return '';
      });

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const result = await createCodexInstaller({ projectRoot }).install();

      expect(result.hooksConfigured).toBe(true);
      expect(result.skillsInstalled).toBe(1);
      expect(mockCopyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('aqe-codex-hook.cjs'),
        join(projectRoot, '.codex/hooks/aqe-codex-hook.cjs'),
      );
      expect(mockCopyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude/hooks/aqe-hook.cjs'),
        join(projectRoot, '.codex/hooks/aqe-runtime.cjs'),
      );
      expect(mockCopyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.claude/helpers/ruflo-hook.cjs'),
        join(projectRoot, '.codex/hooks/ruflo-runtime.cjs'),
      );
      expect(mockCopyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('SKILL.md'),
        join(projectRoot, '.agents/skills/aqe-plan-quality/SKILL.md'),
      );
    });

    it('does not write MCP config when installMcp is false', async () => {
      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const result = await createCodexInstaller({ projectRoot, installMcp: false }).install();

      expect(result.mcpConfigured).toBe(false);
      expect(mockWriteFileSync.mock.calls.some(
        (c: unknown[]) => String(c[0]).endsWith('config.toml'),
      )).toBe(false);
      expect(mockWriteFileSync.mock.calls.some(
        (c: unknown[]) => String(c[0]).endsWith('AGENTS.md'),
      )).toBe(true);
    });

    it('merges hooks idempotently without overwrite and preserves user groups', async () => {
      const generatedGroup = { hooks: [{ command: '$PROJECT_ROOT/.codex/hooks/aqe-codex-hook.cjs' }] };
      const oldOwnedGroup = { hooks: [{ command: '$PROJECT_ROOT/.codex/hooks/aqe-codex-hook.cjs --old' }] };
      const userGroup = { hooks: [{ command: './custom-hook.sh' }] };
      mockExistsSync.mockImplementation((value: unknown) => {
        const file = String(value);
        if (file === join(projectRoot, '.codex', 'hooks.json')) return true;
        if (file.startsWith(projectRoot)) return false;
        return file.endsWith('/.codex/hooks.json') || file.endsWith('/.codex/hooks');
      });
      mockReaddirSync.mockReturnValue([]);
      mockReadFileSync.mockImplementation((value: unknown) => {
        if (String(value) === join(projectRoot, '.codex', 'hooks.json')) {
          return JSON.stringify({ custom: true, hooks: { SessionStart: [userGroup, oldOwnedGroup] } });
        }
        return JSON.stringify({ description: 'AQE hooks', hooks: { SessionStart: [generatedGroup] } });
      });

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const result = await createCodexInstaller({ projectRoot, installMcp: false }).install();

      expect(result.hooksConfigured).toBe(true);
      const hooksWrite = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => String(c[0]) === join(projectRoot, '.codex', 'hooks.json'),
      );
      const merged = JSON.parse(hooksWrite![1] as string);
      expect(merged.custom).toBe(true);
      expect(merged.hooks.SessionStart).toEqual([userGroup, generatedGroup]);
    });

    it('isolates malformed hooks and still installs available skills', async () => {
      mockExistsSync.mockImplementation((value: unknown) => {
        const file = String(value);
        if (file.startsWith(projectRoot)) return false;
        return file.endsWith('/.codex/hooks.json')
          || file.endsWith('/.codex/hooks')
          || file.endsWith('/.agents/skills')
          || file.endsWith('/aqe-plan-quality')
          || file.endsWith('/aqe-plan-quality/SKILL.md');
      });
      mockReaddirSync.mockImplementation((value: unknown) =>
        String(value).endsWith('.codex/hooks') ? [] : ['SKILL.md']);
      mockStatSync.mockImplementation((value: unknown) => ({
        isFile: () => String(value).endsWith('.md'),
        isDirectory: () => !String(value).endsWith('.md'),
      }));
      mockReadFileSync.mockReturnValue('{ malformed hooks');

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const result = await createCodexInstaller({ projectRoot }).install();

      expect(result.success).toBe(false);
      expect(result.mcpConfigured).toBe(true);
      expect(result.agentsMdInstalled).toBe(true);
      expect(result.hooksConfigured).toBe(false);
      expect(result.components.hooks.status).toBe('failed');
      expect(result.components.hooks.error).toContain('JSON');
      expect(result.skillsInstalled).toBe(1);
      expect(result.components.skills.status).toBe('installed');
    });

    it('reports packaged hooks and skills as unavailable without failing core install', async () => {
      mockExistsSync.mockImplementation((value: unknown) => String(value).startsWith(projectRoot) ? false : false);

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const result = await createCodexInstaller({ projectRoot }).install();

      expect(result.success).toBe(true);
      expect(result.components.hooks.status).toBe('unavailable');
      expect(result.components.skills.status).toBe('unavailable');
      expect(result.skillsInstalled).toBe(0);
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
      expect(mockWriteFileSync.mock.calls.some(
        (c: unknown[]) => String(c[0]).endsWith('config.toml') || String(c[0]).endsWith('AGENTS.md'),
      )).toBe(false);
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

    it('upgrades an existing AQE TOML block while preserving user tables', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingToml = `[model]
default = "custom"

[mcp_servers.agentic-qe]
type = "stdio"
command = "old-aqe"

[mcp_servers.agentic-qe.env] # old generated environment
AQE_V3_MODE = "false"

[features]
web_search = true
`;
      mockReadFileSync.mockReturnValue(existingToml);

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      const installer = createCodexInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.toml')
      );
      const content = configCall![1] as string;
      expect(content).toContain('default = "custom"');
      expect(content).toContain('[features]');
      expect(content).toContain('web_search = true');
      expect(content).not.toContain('old-aqe');
      expect(content).toContain('command = "npx"');
      expect(content.match(/\[mcp_servers\.agentic-qe\]/g)).toHaveLength(1);
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
      expect(content).toContain('<!-- BEGIN AGENTIC-QE CODEX -->');
    });

    it('replaces only a marked AQE AGENTS section and preserves user references', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingAgentsMd = '# Project\n\nUse fleet_init in our own docs.\n\n' +
        '<!-- BEGIN AGENTIC-QE CODEX -->\nOld AQE rules\n<!-- END AGENTIC-QE CODEX -->\n\nKeep me.';
      mockReadFileSync.mockReturnValue(existingAgentsMd);

      const { createCodexInstaller } = await import('../../../src/init/codex-installer.js');
      await createCodexInstaller({ projectRoot, overwrite: true }).install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => String(c[0]).endsWith('AGENTS.md'),
      );
      const content = rulesCall![1] as string;
      expect(content).toContain('Use fleet_init in our own docs.');
      expect(content).toContain('Keep me.');
      expect(content).not.toContain('Old AQE rules');
      expect(content.match(/BEGIN AGENTIC-QE CODEX/g)).toHaveLength(1);
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
      expect(result.errors[0]).toContain('Codex mcp installation failed');
      expect(result.components.mcp.status).toBe('failed');
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
