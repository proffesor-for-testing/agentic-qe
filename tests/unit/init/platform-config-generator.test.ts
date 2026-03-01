/**
 * Test: PlatformConfigGenerator
 * Tests config generation, behavioral rules, and platform registry for all 8 platforms.
 */

import { describe, it, expect } from 'vitest';
import {
  PlatformConfigGenerator,
  createPlatformConfigGenerator,
  PLATFORM_REGISTRY,
  type PlatformId,
} from '../../../src/init/platform-config-generator.js';

describe('PlatformConfigGenerator', () => {
  const generator = new PlatformConfigGenerator();

  describe('generateMcpConfig()', () => {
    it('copilot config uses "servers" key', () => {
      const config = generator.generateMcpConfig('copilot');
      const parsed = JSON.parse(config.content);
      expect(parsed).toHaveProperty('servers');
      expect(parsed).not.toHaveProperty('mcpServers');
    });

    it('cursor config uses "mcpServers" key', () => {
      const config = generator.generateMcpConfig('cursor');
      const parsed = JSON.parse(config.content);
      expect(parsed).toHaveProperty('mcpServers');
    });

    it('cline config uses "mcpServers" key', () => {
      const config = generator.generateMcpConfig('cline');
      const parsed = JSON.parse(config.content);
      expect(parsed).toHaveProperty('mcpServers');
    });

    it('kilocode config uses "mcpServers" key', () => {
      const config = generator.generateMcpConfig('kilocode');
      const parsed = JSON.parse(config.content);
      expect(parsed).toHaveProperty('mcpServers');
    });

    it('roocode config uses "mcpServers" key', () => {
      const config = generator.generateMcpConfig('roocode');
      const parsed = JSON.parse(config.content);
      expect(parsed).toHaveProperty('mcpServers');
    });

    it('codex config returns TOML format', () => {
      const config = generator.generateMcpConfig('codex');
      expect(config.format).toBe('toml');
      expect(config.content).toContain('[mcp_servers.agentic-qe]');
    });

    it('windsurf config returns JSON with mcpServers', () => {
      const config = generator.generateMcpConfig('windsurf');
      expect(config.format).toBe('json');
      const parsed = JSON.parse(config.content);
      expect(parsed).toHaveProperty('mcpServers');
    });

    it('continuedev config returns YAML format', () => {
      const config = generator.generateMcpConfig('continuedev');
      expect(config.format).toBe('yaml');
      expect(config.content).toContain('mcpServers:');
      expect(config.content).toContain('agentic-qe');
    });

    it('all JSON configs include agentic-qe server entry', () => {
      const jsonPlatforms: PlatformId[] = ['copilot', 'cursor', 'cline', 'kilocode', 'roocode', 'windsurf'];
      for (const id of jsonPlatforms) {
        const config = generator.generateMcpConfig(id);
        const parsed = JSON.parse(config.content);
        const key = PLATFORM_REGISTRY[id].configKey;
        expect(parsed[key]).toHaveProperty('agentic-qe');
      }
    });

    it('copilot server entry includes type: stdio', () => {
      const config = generator.generateMcpConfig('copilot');
      const parsed = JSON.parse(config.content);
      expect(parsed.servers['agentic-qe'].type).toBe('stdio');
    });

    it('config paths match platform registry', () => {
      const platforms: PlatformId[] = ['copilot', 'cursor', 'cline', 'kilocode', 'roocode', 'codex', 'windsurf', 'continuedev'];
      for (const id of platforms) {
        const config = generator.generateMcpConfig(id);
        expect(config.path).toBe(PLATFORM_REGISTRY[id].configPath);
      }
    });
  });

  describe('generateBehavioralRules()', () => {
    it('copilot returns markdown rules', () => {
      const rules = generator.generateBehavioralRules('copilot');
      expect(rules.format).toBe('markdown');
      expect(rules.path).toBe('.github/copilot-instructions.md');
      expect(rules.content).toContain('Quality Engineering Standards');
    });

    it('cursor returns markdown rules', () => {
      const rules = generator.generateBehavioralRules('cursor');
      expect(rules.format).toBe('markdown');
      expect(rules.path).toBe('.cursorrules');
    });

    it('cline returns JSON custom mode', () => {
      const rules = generator.generateBehavioralRules('cline');
      expect(rules.format).toBe('json');
      const parsed = JSON.parse(rules.content);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].slug).toBe('qe-engineer');
      expect(parsed[0].roleDefinition).toContain('Quality Engineering');
    });

    it('kilocode returns JSON custom mode', () => {
      const rules = generator.generateBehavioralRules('kilocode');
      expect(rules.format).toBe('json');
      const parsed = JSON.parse(rules.content);
      expect(parsed[0].slug).toBe('qe-engineer');
    });

    it('roocode returns JSON custom mode', () => {
      const rules = generator.generateBehavioralRules('roocode');
      expect(rules.format).toBe('json');
      const parsed = JSON.parse(rules.content);
      expect(parsed[0].slug).toBe('qe-engineer');
    });
  });

  describe('getPlatform()', () => {
    it('throws for unknown platform', () => {
      expect(() => generator.getPlatform('unknown' as PlatformId)).toThrow('Unknown platform: unknown');
    });

    it('returns correct definition for known platform', () => {
      const def = generator.getPlatform('copilot');
      expect(def.id).toBe('copilot');
      expect(def.name).toBe('GitHub Copilot');
    });
  });

  describe('getAllPlatformIds()', () => {
    it('returns all 8 platform IDs', () => {
      const ids = generator.getAllPlatformIds();
      expect(ids).toHaveLength(8);
      expect(ids).toContain('copilot');
      expect(ids).toContain('cursor');
      expect(ids).toContain('cline');
      expect(ids).toContain('kilocode');
      expect(ids).toContain('roocode');
      expect(ids).toContain('codex');
      expect(ids).toContain('windsurf');
      expect(ids).toContain('continuedev');
    });
  });

  describe('getAutoApproveTools()', () => {
    it('returns a non-empty array', () => {
      const tools = generator.getAutoApproveTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('returns a copy (not the original)', () => {
      const tools1 = generator.getAutoApproveTools();
      const tools2 = generator.getAutoApproveTools();
      expect(tools1).not.toBe(tools2);
      expect(tools1).toEqual(tools2);
    });
  });

  describe('createPlatformConfigGenerator()', () => {
    it('returns a PlatformConfigGenerator instance', () => {
      const gen = createPlatformConfigGenerator();
      expect(gen).toBeInstanceOf(PlatformConfigGenerator);
    });
  });
});
