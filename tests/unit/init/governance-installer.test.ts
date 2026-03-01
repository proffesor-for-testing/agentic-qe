/**
 * Test: GovernanceInstaller
 * Tests governance file installation, skip logic, and overwrite behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

describe('GovernanceInstaller', () => {
  const testDir = join(process.cwd(), '.test-governance-installer');
  const projectDir = join(testDir, 'project');
  const assetsDir = join(testDir, 'assets', 'governance');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Create mock governance assets
    mkdirSync(join(assetsDir, 'shards'), { recursive: true });
    writeFileSync(
      join(assetsDir, 'constitution.md'),
      '# QE Constitution\n\n## 7 Invariants\n\n1. Never fake test results\n'
    );
    writeFileSync(
      join(assetsDir, 'shards', 'test-generation.shard.md'),
      '# Test Generation Governance\n\nRules for test generation domain.\n'
    );
    writeFileSync(
      join(assetsDir, 'shards', 'security-compliance.shard.md'),
      '# Security Compliance Governance\n\nRules for security domain.\n'
    );

    // Create project directory
    mkdirSync(projectDir, { recursive: true });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('GovernanceInstaller with mocked assets path', () => {
    // We need to mock getGovernanceAssetsPath since it uses import.meta.url
    let GovernanceInstallerClass: any;
    let createGovernanceInstallerFn: any;

    beforeEach(async () => {
      vi.resetModules();

      // Mock the module to override the assets path resolution
      vi.doMock('url', async () => {
        const actual = await vi.importActual('url');
        return {
          ...actual,
          fileURLToPath: () => join(assetsDir, '..', 'init', 'governance-installer.js'),
        };
      });

      // Re-import with mocked URL
      // Since fileURLToPath is mocked, the path resolution should find our assets
      const mod = await import('../../../src/init/governance-installer.js');
      GovernanceInstallerClass = mod.GovernanceInstaller;
      createGovernanceInstallerFn = mod.createGovernanceInstaller;
    });

    it('should export GovernanceInstaller class', () => {
      expect(GovernanceInstallerClass).toBeDefined();
    });

    it('should export createGovernanceInstaller factory', () => {
      expect(typeof createGovernanceInstallerFn).toBe('function');
    });
  });

  describe('GovernanceInstaller result shape', () => {
    it('should handle missing assets directory gracefully', async () => {
      vi.resetModules();

      // This will fail to find assets since test env doesn't match expected paths
      // But we can verify the error handling behavior
      try {
        const { GovernanceInstaller } = await import('../../../src/init/governance-installer.js');
        const installer = new GovernanceInstaller({
          projectRoot: projectDir,
        });

        // If assets are found (in dev env), test install behavior
        const result = await installer.install();
        expect(result).toHaveProperty('installed');
        expect(result).toHaveProperty('skipped');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('governanceDir');
        expect(result).toHaveProperty('constitutionInstalled');
        expect(result).toHaveProperty('shardsInstalled');
      } catch (error) {
        // If assets not found, constructor throws
        expect((error as Error).message).toContain('Governance assets not found');
      }
    });
  });

  describe('GovernanceInstaller with real assets', () => {
    // Test with real governance assets if they exist in the project
    const realAssetsCheck = join(process.cwd(), 'assets', 'governance', 'constitution.md');
    const hasRealAssets = existsSync(realAssetsCheck);

    it.skipIf(!hasRealAssets)('should install constitution and shards to project', async () => {
      const { GovernanceInstaller } = await import('../../../src/init/governance-installer.js');
      const installer = new GovernanceInstaller({
        projectRoot: projectDir,
      });

      const result = await installer.install();

      expect(result.constitutionInstalled).toBe(true);
      expect(result.shardsInstalled).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // Verify files exist
      const constitutionPath = join(projectDir, '.claude', 'guidance', 'constitution.md');
      expect(existsSync(constitutionPath)).toBe(true);
    });

    it.skipIf(!hasRealAssets)('should skip existing files when overwrite is false', async () => {
      const { GovernanceInstaller } = await import('../../../src/init/governance-installer.js');

      // First install
      const installer1 = new GovernanceInstaller({
        projectRoot: projectDir,
        overwrite: false,
      });
      await installer1.install();

      // Second install - should skip
      const installer2 = new GovernanceInstaller({
        projectRoot: projectDir,
        overwrite: false,
      });
      const result = await installer2.install();

      expect(result.skipped.length).toBeGreaterThan(0);
      expect(result.installed).toHaveLength(0);
    });

    it.skipIf(!hasRealAssets)('should overwrite existing files when overwrite is true', async () => {
      const { GovernanceInstaller } = await import('../../../src/init/governance-installer.js');

      // First install
      const installer1 = new GovernanceInstaller({ projectRoot: projectDir });
      await installer1.install();

      // Second install with overwrite
      const installer2 = new GovernanceInstaller({
        projectRoot: projectDir,
        overwrite: true,
      });
      const result = await installer2.install();

      expect(result.installed.length).toBeGreaterThan(0);
      expect(result.constitutionInstalled).toBe(true);
    });

    it.skipIf(!hasRealAssets)('should skip shards when skipShards is true', async () => {
      const { GovernanceInstaller } = await import('../../../src/init/governance-installer.js');
      const installer = new GovernanceInstaller({
        projectRoot: projectDir,
        skipShards: true,
      });

      const result = await installer.install();

      expect(result.shardsInstalled).toBe(0);
      expect(result.constitutionInstalled).toBe(true);
    });

    it.skipIf(!hasRealAssets)('should report isInstalled correctly', async () => {
      const { GovernanceInstaller } = await import('../../../src/init/governance-installer.js');
      const installer = new GovernanceInstaller({ projectRoot: projectDir });

      expect(installer.isInstalled()).toBe(false);

      await installer.install();

      expect(installer.isInstalled()).toBe(true);
    });

    it.skipIf(!hasRealAssets)('should return installed shards list', async () => {
      const { GovernanceInstaller } = await import('../../../src/init/governance-installer.js');
      const installer = new GovernanceInstaller({ projectRoot: projectDir });

      // Before install
      expect(installer.getInstalledShards()).toHaveLength(0);

      await installer.install();

      const shards = installer.getInstalledShards();
      expect(shards.length).toBeGreaterThan(0);
      expect(shards.every((s: string) => s.endsWith('.shard.md'))).toBe(true);
    });
  });
});
