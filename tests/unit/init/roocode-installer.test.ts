/**
 * Test: RooCodeInstaller
 * Tests Roo Code MCP config and custom QE mode installation.
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

describe('RooCodeInstaller', () => {
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

    it('creates .roo/mcp.json with mcpServers key', async () => {
      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('.roo/mcp.json')
      );
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed).toHaveProperty('mcpServers');
      expect(parsed.mcpServers).toHaveProperty('agentic-qe');
    });

    it('creates .roo/modes.json with qe-engineer mode', async () => {
      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot });
      await installer.install();

      const modeCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('modes.json')
      );
      expect(modeCall).toBeDefined();
      const parsed = JSON.parse(modeCall![1] as string);
      expect(parsed[0].slug).toBe('qe-engineer');
    });

    it('creates .roo/ directory if missing', async () => {
      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot });
      await installer.install();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.roo'),
        { recursive: true }
      );
    });

    it('MCP config includes alwaysAllow list', async () => {
      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('mcp.json')
      );
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.mcpServers['agentic-qe'].alwaysAllow).toBeDefined();
      expect(parsed.mcpServers['agentic-qe'].alwaysAllow.length).toBeGreaterThan(0);
    });

    it('returns success with correct result shape', async () => {
      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.mcpConfigured).toBe(true);
      expect(result.modeInstalled).toBe(true);
      expect(result.configPath).toBe(join(projectRoot, '.roo/mcp.json'));
      expect(result.modePath).toBe(join(projectRoot, '.roo/modes.json'));
      expect(result.errors).toEqual([]);
    });
  });

  describe('install() - existing files', () => {
    it('skips when files exist and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);

      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot, overwrite: false });
      const result = await installer.install();

      expect(result.mcpConfigured).toBe(false);
      expect(result.modeInstalled).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('merges config preserving existing mcpServers', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('modes.json')) {
          return JSON.stringify([{ slug: 'custom-mode', name: 'Custom' }]);
        }
        return JSON.stringify({ mcpServers: { 'existing-server': { command: 'run' } } });
      });

      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('mcp.json')
      );
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.mcpServers).toHaveProperty('existing-server');
      expect(parsed.mcpServers).toHaveProperty('agentic-qe');
    });

    it('merges modes and adds qe-engineer to existing array', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('modes.json')) {
          return JSON.stringify([{ slug: 'other-mode', name: 'Other' }]);
        }
        return JSON.stringify({ mcpServers: {} });
      });

      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const modeCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('modes.json')
      );
      const parsed = JSON.parse(modeCall![1] as string);
      expect(parsed).toHaveLength(2);
      expect(parsed.map((m: { slug: string }) => m.slug)).toContain('other-mode');
      expect(parsed.map((m: { slug: string }) => m.slug)).toContain('qe-engineer');
    });

    it('does not duplicate qe-engineer mode on merge', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('modes.json')) {
          return JSON.stringify([
            { slug: 'qe-engineer', name: 'Old QE' },
            { slug: 'helper', name: 'Helper' },
          ]);
        }
        return JSON.stringify({ mcpServers: {} });
      });

      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const modeCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('modes.json')
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
        throw new Error('Read-only filesystem');
      });

      const { createRooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Roo Code installation failed');
    });
  });

  describe('createRooCodeInstaller()', () => {
    it('returns a RooCodeInstaller instance', async () => {
      const { createRooCodeInstaller, RooCodeInstaller } = await import('../../../src/init/roocode-installer.js');
      const installer = createRooCodeInstaller({ projectRoot });
      expect(installer).toBeInstanceOf(RooCodeInstaller);
    });
  });
});
