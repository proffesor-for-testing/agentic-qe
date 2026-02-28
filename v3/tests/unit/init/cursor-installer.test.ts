/**
 * Test: CursorInstaller
 * Tests Cursor IDE MCP config and .cursorrules installation.
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

describe('CursorInstaller', () => {
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

    it('creates .cursor/mcp.json with mcpServers key', async () => {
      const { createCursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('.cursor')
      );
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed).toHaveProperty('mcpServers');
      expect(parsed.mcpServers).toHaveProperty('agentic-qe');
    });

    it('creates .cursorrules at project root', async () => {
      const { createCursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('.cursorrules')
      );
      expect(rulesCall).toBeDefined();
      expect(rulesCall![1]).toContain('Quality Engineering Standards');
    });

    it('creates .cursor/ directory if missing', async () => {
      const { createCursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot });
      await installer.install();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.cursor'),
        { recursive: true }
      );
    });

    it('returns success with correct result shape', async () => {
      const { createCursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.mcpConfigured).toBe(true);
      expect(result.rulesInstalled).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.configPath).toBe(join(projectRoot, '.cursor/mcp.json'));
      expect(result.rulesPath).toBe(join(projectRoot, '.cursorrules'));
    });
  });

  describe('install() - existing files', () => {
    it('skips when files exist and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);

      const { createCursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot, overwrite: false });
      const result = await installer.install();

      expect(result.mcpConfigured).toBe(false);
      expect(result.rulesInstalled).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('merges when overwrite is true and preserves existing mcpServers', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingConfig = JSON.stringify({
        mcpServers: { 'other-tool': { command: 'other' } },
        extraSetting: 42,
      });
      mockReadFileSync.mockReturnValue(existingConfig);

      const { createCursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('.cursor')
      );
      const parsed = JSON.parse(configCall![1] as string);
      expect(parsed.mcpServers).toHaveProperty('other-tool');
      expect(parsed.mcpServers).toHaveProperty('agentic-qe');
      expect(parsed.extraSetting).toBe(42);
    });
  });

  describe('install() - error handling', () => {
    it('catches fs errors and returns success: false', async () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const { createCursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Cursor installation failed');
    });
  });

  describe('createCursorInstaller()', () => {
    it('returns a CursorInstaller instance', async () => {
      const { createCursorInstaller, CursorInstaller } = await import('../../../src/init/cursor-installer.js');
      const installer = createCursorInstaller({ projectRoot });
      expect(installer).toBeInstanceOf(CursorInstaller);
    });
  });
});
