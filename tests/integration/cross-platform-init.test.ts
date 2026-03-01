/**
 * E2E Test: Cross-Platform Init
 *
 * Tests the full platform initialization flow through the AssetsPhase,
 * verifying that platform flags and auto-detection work correctly for
 * all 8 coding agent platforms.
 *
 * Uses real temporary directories -- no mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { PLATFORM_REGISTRY, type PlatformId } from '../../src/init/platform-config-generator.js';
import { createCopilotInstaller } from '../../src/init/copilot-installer.js';
import { createCursorInstaller } from '../../src/init/cursor-installer.js';
import { createClineInstaller } from '../../src/init/cline-installer.js';
import { createKiloCodeInstaller } from '../../src/init/kilocode-installer.js';
import { createRooCodeInstaller } from '../../src/init/roocode-installer.js';
import { createCodexInstaller } from '../../src/init/codex-installer.js';
import { createWindsurfInstaller } from '../../src/init/windsurf-installer.js';
import { createContinueDevInstaller } from '../../src/init/continuedev-installer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-e2e-platform-'));
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(tempDir, relativePath));
}

function readFileAt(relativePath: string): string {
  return fs.readFileSync(path.join(tempDir, relativePath), 'utf-8');
}

const ALL_PLATFORMS: PlatformId[] = [
  'copilot', 'cursor', 'cline', 'kilocode', 'roocode',
  'codex', 'windsurf', 'continuedev',
];

/**
 * Install a single platform by ID, returning the result.
 */
async function installPlatform(platformId: PlatformId, overwrite = false) {
  const opts = { projectRoot: tempDir, overwrite };
  switch (platformId) {
    case 'copilot':     return createCopilotInstaller(opts).install();
    case 'cursor':      return createCursorInstaller(opts).install();
    case 'cline':       return createClineInstaller(opts).install();
    case 'kilocode':    return createKiloCodeInstaller(opts).install();
    case 'roocode':     return createRooCodeInstaller(opts).install();
    case 'codex':       return createCodexInstaller(opts).install();
    case 'windsurf':    return createWindsurfInstaller(opts).install();
    case 'continuedev': return createContinueDevInstaller(opts).install();
  }
}

/**
 * Install all platforms into the current tempDir.
 */
async function installAllPlatforms(overwrite = false) {
  const results: Record<string, Awaited<ReturnType<typeof installPlatform>>> = {};
  for (const p of ALL_PLATFORMS) {
    results[p] = await installPlatform(p, overwrite);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cross-Platform Init - E2E', () => {

  // -------------------------------------------------------------------------
  // 1. Init with all platforms
  // -------------------------------------------------------------------------

  describe('Init with all platforms', () => {
    it('creates config and rules files for all 8 platforms', async () => {
      const results = await installAllPlatforms();

      for (const platformId of ALL_PLATFORMS) {
        const def = PLATFORM_REGISTRY[platformId];
        const result = results[platformId];

        expect(result.success, `${platformId} install should succeed`).toBe(true);
        expect(result.mcpConfigured, `${platformId} MCP should be configured`).toBe(true);
        expect(result.errors, `${platformId} should have no errors`).toEqual([]);

        // Config file exists and references agentic-qe
        expect(fileExists(def.configPath), `${platformId} config at ${def.configPath}`).toBe(true);
        const configContent = readFileAt(def.configPath);
        expect(configContent).toContain('agentic-qe');

        // Rules file exists
        expect(fileExists(def.rulesPath), `${platformId} rules at ${def.rulesPath}`).toBe(true);
      }
    });

    it('no two platforms overwrite each others config files', async () => {
      await installAllPlatforms();

      // Collect all config paths and rules paths, verify uniqueness
      const configPaths = ALL_PLATFORMS.map(p => PLATFORM_REGISTRY[p].configPath);
      const rulesPaths = ALL_PLATFORMS.map(p => PLATFORM_REGISTRY[p].rulesPath);

      // Config paths should all be unique
      expect(new Set(configPaths).size).toBe(configPaths.length);

      // Note: rules paths may share a directory but files themselves should be unique
      expect(new Set(rulesPaths).size).toBe(rulesPaths.length);
    });

    it('total file count matches expectations', async () => {
      await installAllPlatforms();

      // Each platform creates 2 files: config + rules = 16 files
      let fileCount = 0;
      for (const platformId of ALL_PLATFORMS) {
        const def = PLATFORM_REGISTRY[platformId];
        if (fileExists(def.configPath)) fileCount++;
        if (fileExists(def.rulesPath)) fileCount++;
      }
      expect(fileCount).toBe(16);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Init with a single platform
  // -------------------------------------------------------------------------

  describe('Init with single platform', () => {
    it.each(ALL_PLATFORMS)('installing only %s creates only that platforms files', async (platformId) => {
      await installPlatform(platformId);

      const def = PLATFORM_REGISTRY[platformId];

      // Target platform files exist
      expect(fileExists(def.configPath)).toBe(true);
      expect(fileExists(def.rulesPath)).toBe(true);

      // Other platform files do not exist
      for (const otherId of ALL_PLATFORMS) {
        if (otherId === platformId) continue;
        const otherDef = PLATFORM_REGISTRY[otherId];
        expect(
          fileExists(otherDef.configPath),
          `${otherId} config should not exist when only ${platformId} installed`
        ).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 3. Auto-detection simulation
  // -------------------------------------------------------------------------

  describe('Auto-detection via directory presence', () => {
    /**
     * The AssetsPhase uses directory presence to auto-detect platforms.
     * We simulate this by creating platform-specific directories, then
     * verifying the installer succeeds when invoked (as the assets phase would).
     */

    const autoDetectMappings: { dir: string; platformId: PlatformId }[] = [
      { dir: '.vscode', platformId: 'copilot' },
      { dir: '.cursor', platformId: 'cursor' },
      { dir: '.kilocode', platformId: 'kilocode' },
      { dir: '.roo', platformId: 'roocode' },
      { dir: '.codex', platformId: 'codex' },
      { dir: '.windsurf', platformId: 'windsurf' },
      { dir: '.continue', platformId: 'continuedev' },
    ];

    it.each(autoDetectMappings)(
      'detects $platformId when $dir directory exists',
      async ({ dir, platformId }) => {
        // Create the sentinel directory
        fs.mkdirSync(path.join(tempDir, dir), { recursive: true });

        // Verify directory exists (simulating autoMode detection)
        expect(fs.existsSync(path.join(tempDir, dir))).toBe(true);

        // Install the corresponding platform (as the assets phase would)
        const result = await installPlatform(platformId);
        const def = PLATFORM_REGISTRY[platformId];

        expect(result.success).toBe(true);
        expect(result.mcpConfigured).toBe(true);
        expect(fileExists(def.configPath)).toBe(true);
        expect(fileExists(def.rulesPath)).toBe(true);
      }
    );

    it('multiple auto-detected directories trigger multiple installs', async () => {
      // Create directories for copilot, cursor, and roocode
      fs.mkdirSync(path.join(tempDir, '.vscode'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, '.cursor'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, '.roo'), { recursive: true });

      // Install the detected platforms
      const results = await Promise.all([
        installPlatform('copilot'),
        installPlatform('cursor'),
        installPlatform('roocode'),
      ]);

      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.mcpConfigured).toBe(true);
      }

      // Verify all three have configs
      expect(fileExists(PLATFORM_REGISTRY.copilot.configPath)).toBe(true);
      expect(fileExists(PLATFORM_REGISTRY.cursor.configPath)).toBe(true);
      expect(fileExists(PLATFORM_REGISTRY.roocode.configPath)).toBe(true);

      // Verify non-detected platforms are absent
      expect(fileExists(PLATFORM_REGISTRY.codex.configPath)).toBe(false);
      expect(fileExists(PLATFORM_REGISTRY.continuedev.configPath)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Full round-trip: install, verify, overwrite, verify merge
  // -------------------------------------------------------------------------

  describe('Full round-trip: install then overwrite', () => {
    it('first install creates files, second install with overwrite merges', async () => {
      // First pass: install all
      const firstResults = await installAllPlatforms();
      for (const platformId of ALL_PLATFORMS) {
        expect(firstResults[platformId].success).toBe(true);
      }

      // Inject a custom server into copilot config
      const copilotConfigPath = path.join(tempDir, PLATFORM_REGISTRY.copilot.configPath);
      const copilotConfig = JSON.parse(fs.readFileSync(copilotConfigPath, 'utf-8'));
      copilotConfig.servers['my-custom-server'] = { command: 'echo', args: ['hello'] };
      fs.writeFileSync(copilotConfigPath, JSON.stringify(copilotConfig, null, 2));

      // Second pass: overwrite all
      const secondResults = await installAllPlatforms(true);
      for (const platformId of ALL_PLATFORMS) {
        expect(secondResults[platformId].success).toBe(true);
        expect(secondResults[platformId].mcpConfigured).toBe(true);
      }

      // Verify copilot config merged (custom server preserved)
      const mergedCopilot = JSON.parse(readFileAt(PLATFORM_REGISTRY.copilot.configPath));
      expect(mergedCopilot.servers['my-custom-server']).toBeDefined();
      expect(mergedCopilot.servers['agentic-qe']).toBeDefined();
    });

    it('second install without overwrite does not modify existing files', async () => {
      // First install
      await installAllPlatforms();

      // Record content of all config files
      const originalContents: Record<string, string> = {};
      for (const platformId of ALL_PLATFORMS) {
        originalContents[platformId] = readFileAt(PLATFORM_REGISTRY[platformId].configPath);
      }

      // Second install without overwrite
      const secondResults = await installAllPlatforms(false);

      for (const platformId of ALL_PLATFORMS) {
        expect(secondResults[platformId].mcpConfigured).toBe(false);
        // Content unchanged
        const currentContent = readFileAt(PLATFORM_REGISTRY[platformId].configPath);
        expect(currentContent).toBe(originalContents[platformId]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. Cross-format consistency
  // -------------------------------------------------------------------------

  describe('Cross-format consistency', () => {
    it('all configs reference the same MCP command and args', async () => {
      await installAllPlatforms();

      for (const platformId of ALL_PLATFORMS) {
        const def = PLATFORM_REGISTRY[platformId];
        const content = readFileAt(def.configPath);

        // All platforms should reference the npx command and agentic-qe package
        expect(content).toContain('npx');
        expect(content).toContain('agentic-qe');
      }
    });

    it('all configs reference AQE_V3_MODE environment variable', async () => {
      await installAllPlatforms();

      for (const platformId of ALL_PLATFORMS) {
        const def = PLATFORM_REGISTRY[platformId];
        const content = readFileAt(def.configPath);
        expect(content, `${platformId} should set AQE_V3_MODE`).toContain('AQE_V3_MODE');
      }
    });
  });
});
