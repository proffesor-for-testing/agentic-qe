/**
 * Test: ClineInstaller
 * Tests Cline MCP config and custom QE mode installation.
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

describe('ClineInstaller', () => {
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

    it('creates cline_mcp_settings.json with mcpServers key', async () => {
      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('cline_mcp_settings.json')
      );
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed).toHaveProperty('mcpServers');
      expect(parsed.mcpServers).toHaveProperty('agentic-qe');
    });

    it('creates .vscode/cline_custom_modes.json', async () => {
      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      await installer.install();

      const modeCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('cline_custom_modes.json')
      );
      expect(modeCall).toBeDefined();
    });

    it('mode JSON includes qe-engineer slug', async () => {
      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      await installer.install();

      const modeCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('cline_custom_modes.json')
      );
      const parsed = JSON.parse(modeCall![1] as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].slug).toBe('qe-engineer');
      expect(parsed[0].name).toBe('QE Engineer');
    });

    it('MCP config includes alwaysAllow list', async () => {
      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('cline_mcp_settings.json')
      );
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.mcpServers['agentic-qe'].alwaysAllow).toBeDefined();
      expect(parsed.mcpServers['agentic-qe'].alwaysAllow.length).toBeGreaterThan(0);
    });

    it('creates .vscode/ directory if missing', async () => {
      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      await installer.install();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.vscode'),
        { recursive: true }
      );
    });

    it('returns success with modePath and modeInstalled', async () => {
      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.mcpConfigured).toBe(true);
      expect(result.modeInstalled).toBe(true);
      expect(result.configPath).toBe(join(projectRoot, '.vscode/cline_mcp_settings.json'));
      expect(result.modePath).toBe(join(projectRoot, '.vscode/cline_custom_modes.json'));
      expect(result.errors).toEqual([]);
    });
  });

  describe('install() - existing files', () => {
    it('skips when files exist and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);

      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot, overwrite: false });
      const result = await installer.install();

      expect(result.mcpConfigured).toBe(false);
      expect(result.modeInstalled).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('merges modes into existing customModes array', async () => {
      mockExistsSync.mockReturnValue(true);
      // For config reads, return valid JSON; for mode reads, return existing modes
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('cline_custom_modes')) {
          return JSON.stringify([{ slug: 'other-mode', name: 'Other' }]);
        }
        return JSON.stringify({ mcpServers: { existing: { command: 'x' } } });
      });

      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const modeCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('cline_custom_modes.json')
      );
      const parsed = JSON.parse(modeCall![1] as string);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].slug).toBe('other-mode');
      expect(parsed[1].slug).toBe('qe-engineer');
    });

    it('does not duplicate qe-engineer mode on merge', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('cline_custom_modes')) {
          return JSON.stringify([
            { slug: 'qe-engineer', name: 'Old QE' },
            { slug: 'other-mode', name: 'Other' },
          ]);
        }
        return JSON.stringify({ mcpServers: {} });
      });

      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const modeCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('cline_custom_modes.json')
      );
      const parsed = JSON.parse(modeCall![1] as string);
      const qeModes = parsed.filter((m: { slug: string }) => m.slug === 'qe-engineer');
      expect(qeModes).toHaveLength(1);
    });
  });

  describe('install() - error handling', () => {
    it('catches write errors and returns success: false', async () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const { createClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Cline installation failed');
    });
  });

  describe('createClineInstaller()', () => {
    it('returns a ClineInstaller instance', async () => {
      const { createClineInstaller, ClineInstaller } = await import('../../../src/init/cline-installer.js');
      const installer = createClineInstaller({ projectRoot });
      expect(installer).toBeInstanceOf(ClineInstaller);
    });
  });
});
