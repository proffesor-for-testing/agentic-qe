/**
 * Test: Config Preservation on Reinstall
 * Issue #206: Config overwritten on reinstall
 *
 * Verifies that user customizations in config.yaml are preserved
 * when running `aqe init` again.
 */

import { describe, it, expect } from 'vitest';
import { VerificationPhase } from '../../../src/init/phases/12-verification.js';

describe('Config Preservation (Issue #206)', () => {
  // Create instance to access private methods via any
  const phase = new VerificationPhase() as any;

  describe('parseYAML', () => {
    it('should parse basic config YAML', () => {
      const yaml = `
# Agentic QE v3 Configuration
version: "3.3.0"

project:
  name: "test-project"
  type: "single"

learning:
  enabled: true

domains:
  enabled:
    - "test-generation"
    - "coverage-analysis"
    - "visual-accessibility"
  disabled:
    - "chaos-resilience"
`;
      const result = phase.parseYAML(yaml);

      expect(result).toBeDefined();
      expect(result.version).toBe('3.3.0');
      expect(result.project?.name).toBe('test-project');
      expect(result.learning?.enabled).toBe(true);
      expect(result.domains?.enabled).toContain('visual-accessibility');
      expect(result.domains?.disabled).toContain('chaos-resilience');
    });

    it('should return [] not {} for empty array fields (Issue #244)', () => {
      const yaml = `
domains:
  enabled:
    - "test-generation"
  disabled:

workers:
  enabled:
`;
      const result = phase.parseYAML(yaml);

      // disabled: with no items must be [] not {}
      expect(Array.isArray(result.domains?.disabled)).toBe(true);
      expect(result.domains?.disabled).toEqual([]);

      // workers.enabled: with no items must be [] not {}
      expect(Array.isArray(result.workers?.enabled)).toBe(true);
      expect(result.workers?.enabled).toEqual([]);

      // enabled with items should still work
      expect(result.domains?.enabled).toContain('test-generation');
    });

    it('should parse numeric and boolean values correctly', () => {
      const yaml = `
agents:
  maxConcurrent: 10
  defaultTimeout: 60000

workers:
  daemonAutoStart: false
`;
      const result = phase.parseYAML(yaml);

      expect(result.agents?.maxConcurrent).toBe(10);
      expect(result.agents?.defaultTimeout).toBe(60000);
      expect(result.workers?.daemonAutoStart).toBe(false);
    });
  });

  describe('mergeConfigs', () => {
    const createBaseConfig = () => ({
      version: '3.3.0',
      project: { name: 'test', root: '/test', type: 'single' as const },
      learning: {
        enabled: true,
        embeddingModel: 'transformer' as const,
        hnswConfig: { M: 8, efConstruction: 100, efSearch: 50 },
        qualityThreshold: 0.5,
        promotionThreshold: 2,
        pretrainedPatterns: true,
      },
      routing: { mode: 'ml' as const, confidenceThreshold: 0.7, feedbackEnabled: true },
      workers: {
        enabled: ['pattern-consolidator'],
        intervals: {},
        maxConcurrent: 2,
        daemonAutoStart: true,
      },
      hooks: { claudeCode: true, preCommit: false, ciIntegration: false },
      skills: { install: true, installV2: true, installV3: true, overwrite: false },
      autoTuning: { enabled: true, parameters: [], evaluationPeriodMs: 3600000 },
      domains: {
        enabled: ['test-generation', 'coverage-analysis'],
        disabled: [],
      },
      agents: { maxConcurrent: 5, defaultTimeout: 60000 },
    });

    it('should preserve custom enabled domains (Issue #206 - visual-accessibility)', () => {
      const newConfig = createBaseConfig();
      const existing = {
        domains: {
          enabled: ['test-generation', 'coverage-analysis', 'visual-accessibility'],
          disabled: [],
        },
      };

      const result = phase.mergeConfigs(newConfig, existing);

      expect(result.domains.enabled).toContain('visual-accessibility');
      expect(result.domains.enabled).toContain('test-generation');
      expect(result.domains.enabled).toContain('coverage-analysis');
    });

    it('should add new default domains while preserving custom ones', () => {
      const newConfig = createBaseConfig();
      newConfig.domains.enabled = ['test-generation', 'coverage-analysis', 'NEW-DOMAIN'];

      const existing = {
        domains: {
          enabled: ['test-generation', 'visual-accessibility'],
          disabled: [],
        },
      };

      const result = phase.mergeConfigs(newConfig, existing);

      // Should have all: existing custom + new defaults
      expect(result.domains.enabled).toContain('visual-accessibility'); // preserved custom
      expect(result.domains.enabled).toContain('NEW-DOMAIN'); // added new default
      expect(result.domains.enabled).toContain('test-generation'); // existing
    });

    it('should respect disabled domains when merging', () => {
      const newConfig = createBaseConfig();
      const existing = {
        domains: {
          enabled: ['test-generation', 'visual-accessibility'],
          disabled: ['coverage-analysis'], // user explicitly disabled this
        },
      };

      const result = phase.mergeConfigs(newConfig, existing);

      expect(result.domains.enabled).not.toContain('coverage-analysis');
      expect(result.domains.disabled).toContain('coverage-analysis');
    });

    it('should handle non-array disabled field without crashing (Issue #244)', () => {
      const newConfig = createBaseConfig();
      // Simulate the bug: parser returned {} for disabled
      const existing = {
        domains: {
          enabled: ['test-generation'],
          disabled: {} as unknown as string[],
        },
      };

      // Should not throw TypeError: object is not iterable
      const result = phase.mergeConfigs(newConfig, existing);

      expect(result.domains.enabled).toContain('test-generation');
      // disabled should remain as newConfig default since existing was invalid
      expect(Array.isArray(result.domains.disabled)).toBe(true);
    });

    it('should preserve learning.enabled preference', () => {
      const newConfig = createBaseConfig();
      newConfig.learning.enabled = true;

      const existing = {
        learning: { enabled: false }, // user disabled learning
      };

      const result = phase.mergeConfigs(newConfig, existing);

      expect(result.learning.enabled).toBe(false);
    });

    it('should preserve hooks preferences', () => {
      const newConfig = createBaseConfig();
      const existing = {
        hooks: {
          claudeCode: false, // user disabled
          preCommit: true,   // user enabled
        },
      };

      const result = phase.mergeConfigs(newConfig, existing);

      expect(result.hooks.claudeCode).toBe(false);
      expect(result.hooks.preCommit).toBe(true);
    });

    it('should preserve agent limits', () => {
      const newConfig = createBaseConfig();
      const existing = {
        agents: {
          maxConcurrent: 20, // user increased
          defaultTimeout: 120000, // user increased
        },
      };

      const result = phase.mergeConfigs(newConfig, existing);

      expect(result.agents.maxConcurrent).toBe(20);
      expect(result.agents.defaultTimeout).toBe(120000);
    });

    it('should preserve worker preferences', () => {
      const newConfig = createBaseConfig();
      const existing = {
        workers: {
          enabled: ['pattern-consolidator', 'coverage-gap-scanner'],
          daemonAutoStart: false,
        },
      };

      const result = phase.mergeConfigs(newConfig, existing);

      expect(result.workers.enabled).toContain('coverage-gap-scanner');
      expect(result.workers.daemonAutoStart).toBe(false);
    });
  });
});
