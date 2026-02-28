/**
 * Test: ContinueDevInstaller
 * Tests Continue.dev YAML MCP config and QE rules installation.
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

describe('ContinueDevInstaller', () => {
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

    it('creates .continue/config.yaml with YAML MCP config', async () => {
      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.yaml')
      );
      expect(configCall).toBeDefined();
      const content = configCall![1] as string;
      expect(content).toContain('mcpServers:');
      expect(content).toContain('agentic-qe');
      expect(content).toContain('npx');
      expect(content).toContain('AQE_V3_MODE');
    });

    it('creates .continue/rules/aqe-qe-standards.yaml', async () => {
      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot });
      await installer.install();

      const rulesCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('aqe-qe-standards.yaml')
      );
      expect(rulesCall).toBeDefined();
      expect(rulesCall![1]).toContain('Quality Engineering');
      expect(rulesCall![1]).toContain('fleet_init');
    });

    it('creates .continue/ and .continue/rules/ directories', async () => {
      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot });
      await installer.install();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.continue'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        join(projectRoot, '.continue', 'rules'),
        { recursive: true }
      );
    });

    it('returns success with correct result shape', async () => {
      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.mcpConfigured).toBe(true);
      expect(result.rulesInstalled).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.configPath).toBe(join(projectRoot, '.continue/config.yaml'));
      expect(result.rulesPath).toBe(join(projectRoot, '.continue/rules/aqe-qe-standards.yaml'));
    });

    it('generates valid YAML structure', async () => {
      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.yaml')
      );
      const content = configCall![1] as string;
      // Verify YAML structure
      expect(content).toMatch(/^mcpServers:$/m);
      expect(content).toMatch(/^\s+- name: agentic-qe$/m);
      expect(content).toMatch(/^\s+command: npx$/m);
      expect(content).toContain('agentic-qe@latest');
    });
  });

  describe('install() - existing files', () => {
    it('skips when files exist and overwrite is false', async () => {
      mockExistsSync.mockReturnValue(true);

      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot, overwrite: false });
      const result = await installer.install();

      expect(result.mcpConfigured).toBe(false);
      expect(result.rulesInstalled).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('appends to existing YAML config when overwrite is true', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingYaml = `models:
  - name: claude-sonnet
    provider: anthropic
`;
      mockReadFileSync.mockReturnValue(existingYaml);

      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.yaml')
      );
      expect(configCall).toBeDefined();
      const content = configCall![1] as string;
      expect(content).toContain('models:');
      expect(content).toContain('mcpServers:');
    });

    it('appends server entry (not full block) when mcpServers key already exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingYaml = `mcpServers:
  - name: other-server
    command: other
`;
      mockReadFileSync.mockReturnValue(existingYaml);

      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.yaml')
      );
      expect(configCall).toBeDefined();
      const content = configCall![1] as string;
      // Should NOT have duplicate mcpServers: keys
      const mcpCount = (content.match(/^mcpServers:/gm) || []).length;
      expect(mcpCount).toBe(1);
      // Should contain both servers
      expect(content).toContain('other-server');
      expect(content).toContain('agentic-qe');
    });

    it('skips YAML merge if agentic-qe already present', async () => {
      mockExistsSync.mockReturnValue(true);
      const existingYaml = `mcpServers:
  - name: agentic-qe
    command: npx
`;
      mockReadFileSync.mockReturnValue(existingYaml);

      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot, overwrite: true });
      await installer.install();

      const configCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('config.yaml')
      );
      const content = configCall![1] as string;
      // Should return existing content unchanged
      expect(content).toBe(existingYaml);
    });
  });

  describe('install() - error handling', () => {
    it('catches fs errors and returns success: false', async () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { createContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Continue.dev installation failed');
    });
  });

  describe('createContinueDevInstaller()', () => {
    it('returns a ContinueDevInstaller instance', async () => {
      const { createContinueDevInstaller, ContinueDevInstaller } = await import('../../../src/init/continuedev-installer.js');
      const installer = createContinueDevInstaller({ projectRoot });
      expect(installer).toBeInstanceOf(ContinueDevInstaller);
    });
  });
});
