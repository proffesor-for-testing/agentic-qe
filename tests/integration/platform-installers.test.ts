/**
 * Integration Tests: Platform Installers
 *
 * Tests all 8 platform installers against real temporary directories.
 * No mocking -- uses real filesystem operations to verify config generation,
 * file creation, merge behavior, and format correctness.
 *
 * Platforms:
 *   P1 (JSON): copilot, cursor, cline, kilocode, roocode
 *   P2 (mixed): codex (TOML), windsurf (JSON), continuedev (YAML)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createCopilotInstaller } from '../../src/init/copilot-installer.js';
import { createCursorInstaller } from '../../src/init/cursor-installer.js';
import { createClineInstaller } from '../../src/init/cline-installer.js';
import { createKiloCodeInstaller } from '../../src/init/kilocode-installer.js';
import { createRooCodeInstaller } from '../../src/init/roocode-installer.js';
import { createCodexInstaller } from '../../src/init/codex-installer.js';
import { createWindsurfInstaller } from '../../src/init/windsurf-installer.js';
import { createContinueDevInstaller } from '../../src/init/continuedev-installer.js';
import { PLATFORM_REGISTRY, type PlatformId } from '../../src/init/platform-config-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-platform-test-'));
}

function readFileAt(relativePath: string): string {
  return fs.readFileSync(path.join(tempDir, relativePath), 'utf-8');
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(tempDir, relativePath));
}

/**
 * Factory to instantiate any installer by platform ID.
 */
function createInstallerFor(platformId: PlatformId, opts?: { overwrite?: boolean }) {
  const options = { projectRoot: tempDir, overwrite: opts?.overwrite ?? false };
  switch (platformId) {
    case 'copilot':    return createCopilotInstaller(options);
    case 'cursor':     return createCursorInstaller(options);
    case 'cline':      return createClineInstaller(options);
    case 'kilocode':   return createKiloCodeInstaller(options);
    case 'roocode':    return createRooCodeInstaller(options);
    case 'codex':      return createCodexInstaller(options);
    case 'windsurf':   return createWindsurfInstaller(options);
    case 'continuedev': return createContinueDevInstaller(options);
  }
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
// Per-platform fresh install tests
// ---------------------------------------------------------------------------

const ALL_PLATFORMS: PlatformId[] = [
  'copilot', 'cursor', 'cline', 'kilocode', 'roocode',
  'codex', 'windsurf', 'continuedev',
];

describe('Platform Installers - Integration', () => {

  describe.each(ALL_PLATFORMS)('Fresh install: %s', (platformId) => {
    const def = PLATFORM_REGISTRY[platformId];

    it('succeeds without errors', async () => {
      const installer = createInstallerFor(platformId);
      const result = await installer.install();

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.mcpConfigured).toBe(true);
    });

    it('creates config file at the expected path', async () => {
      const installer = createInstallerFor(platformId);
      await installer.install();

      expect(fileExists(def.configPath)).toBe(true);
    });

    it('config file contains agentic-qe entry', async () => {
      const installer = createInstallerFor(platformId);
      await installer.install();

      const content = readFileAt(def.configPath);
      expect(content).toContain('agentic-qe');
    });

    it('creates rules/behavioral file at expected path', async () => {
      const installer = createInstallerFor(platformId);
      await installer.install();

      expect(fileExists(def.rulesPath)).toBe(true);
    });

    it('rules file has QE content', async () => {
      const installer = createInstallerFor(platformId);
      await installer.install();

      const content = readFileAt(def.rulesPath);
      // All rules files reference QE concepts in some form
      const hasQeContent =
        content.includes('Quality Engineering') ||
        content.includes('qe-engineer') ||
        content.includes('fleet_init') ||
        content.includes('Agentic QE');
      expect(hasQeContent).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Config format validation
  // -------------------------------------------------------------------------

  describe('Config format validation', () => {

    describe('JSON platforms', () => {
      const jsonPlatforms: PlatformId[] = ['copilot', 'cursor', 'cline', 'kilocode', 'roocode', 'windsurf'];

      it.each(jsonPlatforms)('%s produces valid JSON config', async (platformId) => {
        const def = PLATFORM_REGISTRY[platformId];
        const installer = createInstallerFor(platformId);
        await installer.install();

        const content = readFileAt(def.configPath);
        const parsed = JSON.parse(content);
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
        // Verify the config has the expected key containing the agentic-qe server
        expect(parsed[def.configKey]).toBeDefined();
        expect(parsed[def.configKey]['agentic-qe']).toBeDefined();
      });
    });

    describe('TOML platform (codex)', () => {
      it('produces valid TOML structure', async () => {
        const installer = createInstallerFor('codex');
        await installer.install();

        const content = readFileAt(PLATFORM_REGISTRY.codex.configPath);
        // TOML validation: check for section headers and key-value pairs
        expect(content).toContain('[mcp_servers.agentic-qe]');
        expect(content).toContain('command = "npx"');
        expect(content).toContain('type = "stdio"');
        // Verify it has the env section
        expect(content).toContain('[mcp_servers.agentic-qe.env]');
        expect(content).toContain('AQE_V3_MODE');
      });
    });

    describe('YAML platform (continuedev)', () => {
      it('produces valid YAML structure', async () => {
        const installer = createInstallerFor('continuedev');
        await installer.install();

        const content = readFileAt(PLATFORM_REGISTRY.continuedev.configPath);
        // YAML validation: check for proper indentation and structure
        expect(content).toContain('mcpServers:');
        expect(content).toContain('name: agentic-qe');
        expect(content).toContain('command: npx');
        expect(content).toContain('AQE_V3_MODE');
      });
    });

    describe('Rules format validation', () => {
      const jsonRulesPlatforms: PlatformId[] = ['cline', 'kilocode', 'roocode'];

      it.each(jsonRulesPlatforms)('%s produces valid JSON rules', async (platformId) => {
        const def = PLATFORM_REGISTRY[platformId];
        const installer = createInstallerFor(platformId);
        await installer.install();

        const content = readFileAt(def.rulesPath);
        const parsed = JSON.parse(content);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0]).toHaveProperty('slug', 'qe-engineer');
      });

      const markdownRulesPlatforms: PlatformId[] = ['copilot', 'cursor', 'codex', 'windsurf'];

      it.each(markdownRulesPlatforms)('%s produces markdown rules', async (platformId) => {
        const def = PLATFORM_REGISTRY[platformId];
        const installer = createInstallerFor(platformId);
        await installer.install();

        const content = readFileAt(def.rulesPath);
        expect(content).toContain('Quality Engineering');
        expect(content).toContain('fleet_init');
      });

      it('continuedev produces YAML rules', async () => {
        const installer = createInstallerFor('continuedev');
        await installer.install();

        const content = readFileAt(PLATFORM_REGISTRY.continuedev.rulesPath);
        expect(content).toContain('AQE Quality Engineering Rules');
        expect(content).toContain('fleet_init');
      });
    });
  });

  // -------------------------------------------------------------------------
  // All platforms simultaneously (no conflict)
  // -------------------------------------------------------------------------

  describe('All platforms simultaneously', () => {
    it('installs all 8 platforms in the same directory without conflicts', async () => {
      const results = await Promise.all(
        ALL_PLATFORMS.map(async (platformId) => {
          const installer = createInstallerFor(platformId);
          return { platformId, result: await installer.install() };
        })
      );

      for (const { platformId, result } of results) {
        expect(result.success, `${platformId} should succeed`).toBe(true);
        expect(result.errors, `${platformId} should have no errors`).toEqual([]);
        expect(result.mcpConfigured, `${platformId} should configure MCP`).toBe(true);
      }

      // Verify all config files exist independently
      for (const platformId of ALL_PLATFORMS) {
        const def = PLATFORM_REGISTRY[platformId];
        expect(fileExists(def.configPath), `${platformId} config at ${def.configPath}`).toBe(true);
        expect(fileExists(def.rulesPath), `${platformId} rules at ${def.rulesPath}`).toBe(true);
      }
    });

    it('each config file retains its own agentic-qe entry after concurrent install', async () => {
      await Promise.all(
        ALL_PLATFORMS.map(async (platformId) => {
          const installer = createInstallerFor(platformId);
          return installer.install();
        })
      );

      for (const platformId of ALL_PLATFORMS) {
        const def = PLATFORM_REGISTRY[platformId];
        const content = readFileAt(def.configPath);
        expect(content, `${platformId} config should reference agentic-qe`).toContain('agentic-qe');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Overwrite / merge behavior
  // -------------------------------------------------------------------------

  describe('Overwrite and merge behavior', () => {

    describe('JSON platforms merge correctly', () => {
      const jsonPlatforms: PlatformId[] = ['copilot', 'cursor', 'cline', 'kilocode', 'roocode', 'windsurf'];

      it.each(jsonPlatforms)('%s merges with existing JSON config', async (platformId) => {
        const def = PLATFORM_REGISTRY[platformId];
        const configFullPath = path.join(tempDir, def.configPath);

        // Create pre-existing config
        fs.mkdirSync(path.dirname(configFullPath), { recursive: true });
        const existingConfig = {
          [def.configKey]: {
            'custom-server': { command: 'custom', args: ['--flag'] },
          },
          extraField: 'preserved',
        };
        fs.writeFileSync(configFullPath, JSON.stringify(existingConfig, null, 2));

        // Install with overwrite
        const installer = createInstallerFor(platformId, { overwrite: true });
        const result = await installer.install();

        expect(result.success).toBe(true);
        expect(result.mcpConfigured).toBe(true);

        // Verify merge: both old and new servers present
        const merged = JSON.parse(readFileAt(def.configPath));
        expect(merged[def.configKey]['custom-server']).toBeDefined();
        expect(merged[def.configKey]['agentic-qe']).toBeDefined();
        expect(merged.extraField).toBe('preserved');
      });
    });

    describe('Codex TOML merges correctly', () => {
      it('appends AQE section to existing TOML config', async () => {
        const def = PLATFORM_REGISTRY.codex;
        const configFullPath = path.join(tempDir, def.configPath);

        // Create pre-existing TOML config
        fs.mkdirSync(path.dirname(configFullPath), { recursive: true });
        const existingToml = `# Existing Codex config
[mcp_servers.other-tool]
command = "npx"
args = ["other-tool"]
`;
        fs.writeFileSync(configFullPath, existingToml);

        const installer = createInstallerFor('codex', { overwrite: true });
        const result = await installer.install();

        expect(result.success).toBe(true);
        const content = readFileAt(def.configPath);
        // Existing server preserved
        expect(content).toContain('[mcp_servers.other-tool]');
        // New server added
        expect(content).toContain('[mcp_servers.agentic-qe]');
      });

      it('skips merge if agentic-qe already present in TOML', async () => {
        const def = PLATFORM_REGISTRY.codex;
        const configFullPath = path.join(tempDir, def.configPath);

        fs.mkdirSync(path.dirname(configFullPath), { recursive: true });
        const existingToml = `[mcp_servers.agentic-qe]
command = "npx"
args = ["-y", "agentic-qe@latest", "mcp"]
`;
        fs.writeFileSync(configFullPath, existingToml);

        const installer = createInstallerFor('codex', { overwrite: true });
        await installer.install();

        const content = readFileAt(def.configPath);
        // Should not duplicate the section
        const matches = content.match(/\[mcp_servers\.agentic-qe\]/g);
        expect(matches?.length).toBe(1);
      });
    });

    describe('Continue.dev YAML merges correctly', () => {
      it('appends AQE section to existing YAML config', async () => {
        const def = PLATFORM_REGISTRY.continuedev;
        const configFullPath = path.join(tempDir, def.configPath);

        fs.mkdirSync(path.dirname(configFullPath), { recursive: true });
        const existingYaml = `# Existing Continue config
models:
  - title: GPT-4
    provider: openai
`;
        fs.writeFileSync(configFullPath, existingYaml);

        const installer = createInstallerFor('continuedev', { overwrite: true });
        const result = await installer.install();

        expect(result.success).toBe(true);
        const content = readFileAt(def.configPath);
        expect(content).toContain('models:');
        expect(content).toContain('agentic-qe');
      });

      it('skips merge if agentic-qe already present in YAML', async () => {
        const def = PLATFORM_REGISTRY.continuedev;
        const configFullPath = path.join(tempDir, def.configPath);

        fs.mkdirSync(path.dirname(configFullPath), { recursive: true });
        const existingYaml = `mcpServers:
  - name: agentic-qe
    command: npx
`;
        fs.writeFileSync(configFullPath, existingYaml);

        const installer = createInstallerFor('continuedev', { overwrite: true });
        await installer.install();

        const content = readFileAt(def.configPath);
        // Count occurrences -- should not duplicate
        const matches = content.match(/agentic-qe/g);
        expect(matches?.length).toBe(1);
      });
    });

    describe('No overwrite skips existing files', () => {
      it.each(ALL_PLATFORMS)('%s skips existing config when overwrite=false', async (platformId) => {
        const def = PLATFORM_REGISTRY[platformId];
        const configFullPath = path.join(tempDir, def.configPath);
        const rulesFullPath = path.join(tempDir, def.rulesPath);

        // Pre-create config and rules with sentinel content
        fs.mkdirSync(path.dirname(configFullPath), { recursive: true });
        fs.writeFileSync(configFullPath, 'ORIGINAL_CONFIG');
        fs.mkdirSync(path.dirname(rulesFullPath), { recursive: true });
        fs.writeFileSync(rulesFullPath, 'ORIGINAL_RULES');

        const installer = createInstallerFor(platformId, { overwrite: false });
        const result = await installer.install();

        expect(result.success).toBe(true);
        expect(result.mcpConfigured).toBe(false);

        // Original content preserved
        expect(readFileAt(def.configPath)).toBe('ORIGINAL_CONFIG');
        expect(readFileAt(def.rulesPath)).toBe('ORIGINAL_RULES');
      });
    });
  });
});
