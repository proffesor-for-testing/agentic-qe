/**
 * Agentic QE v3 - Default Phases Tests
 * ADR-032: Time Crystal Scheduling
 *
 * Tests for phase configurations and builder utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  // Thresholds
  STRICT_UNIT_THRESHOLDS,
  STANDARD_INTEGRATION_THRESHOLDS,
  RELAXED_E2E_THRESHOLDS,
  PERFORMANCE_THRESHOLDS,
  SECURITY_THRESHOLDS,

  // Agent configs
  HIGH_PARALLELISM_CONFIG,
  MEDIUM_PARALLELISM_CONFIG,
  LOW_PARALLELISM_CONFIG,
  SEQUENTIAL_CONFIG,

  // Phase presets
  DEFAULT_TEST_PHASES,
  FAST_TEST_PHASES,
  COMPREHENSIVE_TEST_PHASES,
  SECURITY_FOCUSED_PHASES,

  // Utilities
  createPhase,
  scalePhases,
  adjustThresholds,
  mergePhases,
  getPhasesForProjectType,
} from '../../src/time-crystal/default-phases';

describe('Quality Thresholds', () => {
  describe('STRICT_UNIT_THRESHOLDS', () => {
    it('should have high standards for unit tests', () => {
      expect(STRICT_UNIT_THRESHOLDS.minPassRate).toBe(0.99);
      expect(STRICT_UNIT_THRESHOLDS.maxFlakyRatio).toBe(0.01);
      expect(STRICT_UNIT_THRESHOLDS.minCoverage).toBe(0.80);
    });
  });

  describe('STANDARD_INTEGRATION_THRESHOLDS', () => {
    it('should have moderate standards', () => {
      expect(STANDARD_INTEGRATION_THRESHOLDS.minPassRate).toBe(0.95);
      expect(STANDARD_INTEGRATION_THRESHOLDS.maxFlakyRatio).toBe(0.05);
      expect(STANDARD_INTEGRATION_THRESHOLDS.minCoverage).toBe(0.70);
    });
  });

  describe('RELAXED_E2E_THRESHOLDS', () => {
    it('should have relaxed standards for E2E', () => {
      expect(RELAXED_E2E_THRESHOLDS.minPassRate).toBe(0.90);
      expect(RELAXED_E2E_THRESHOLDS.maxFlakyRatio).toBe(0.10);
      expect(RELAXED_E2E_THRESHOLDS.minCoverage).toBe(0.60);
    });
  });

  describe('SECURITY_THRESHOLDS', () => {
    it('should require 100% pass rate for security', () => {
      expect(SECURITY_THRESHOLDS.minPassRate).toBe(1.0);
      expect(SECURITY_THRESHOLDS.maxFlakyRatio).toBe(0.0);
    });
  });
});

describe('Agent Configurations', () => {
  describe('HIGH_PARALLELISM_CONFIG', () => {
    it('should have high parallelism', () => {
      expect(HIGH_PARALLELISM_CONFIG.parallelism).toBe(8);
      expect(HIGH_PARALLELISM_CONFIG.agents).toContain('qe-test-executor');
    });
  });

  describe('SEQUENTIAL_CONFIG', () => {
    it('should have sequential execution', () => {
      expect(SEQUENTIAL_CONFIG.parallelism).toBe(1);
    });
  });
});

describe('Phase Presets', () => {
  describe('DEFAULT_TEST_PHASES', () => {
    it('should have 4 phases', () => {
      expect(DEFAULT_TEST_PHASES).toHaveLength(4);
    });

    it('should have correct phase names', () => {
      expect(DEFAULT_TEST_PHASES[0].name).toBe('Unit');
      expect(DEFAULT_TEST_PHASES[1].name).toBe('Integration');
      expect(DEFAULT_TEST_PHASES[2].name).toBe('E2E');
      expect(DEFAULT_TEST_PHASES[3].name).toBe('Performance');
    });

    it('should have sequential IDs', () => {
      DEFAULT_TEST_PHASES.forEach((phase, index) => {
        expect(phase.id).toBe(index);
      });
    });

    it('should have increasing durations', () => {
      for (let i = 1; i < DEFAULT_TEST_PHASES.length; i++) {
        expect(DEFAULT_TEST_PHASES[i].expectedDuration)
          .toBeGreaterThanOrEqual(DEFAULT_TEST_PHASES[i - 1].expectedDuration);
      }
    });

    it('should have correct test types per phase', () => {
      expect(DEFAULT_TEST_PHASES[0].testTypes).toContain('unit');
      expect(DEFAULT_TEST_PHASES[1].testTypes).toContain('integration');
      expect(DEFAULT_TEST_PHASES[2].testTypes).toContain('e2e');
      expect(DEFAULT_TEST_PHASES[3].testTypes).toContain('performance');
    });
  });

  describe('FAST_TEST_PHASES', () => {
    it('should have 2 phases', () => {
      expect(FAST_TEST_PHASES).toHaveLength(2);
    });

    it('should have shorter durations', () => {
      const maxDuration = Math.max(...FAST_TEST_PHASES.map(p => p.expectedDuration));
      expect(maxDuration).toBeLessThanOrEqual(30000);
    });

    it('should have high parallelism', () => {
      expect(FAST_TEST_PHASES[0].agentConfig.parallelism).toBeGreaterThanOrEqual(8);
    });
  });

  describe('COMPREHENSIVE_TEST_PHASES', () => {
    it('should have 6 phases', () => {
      expect(COMPREHENSIVE_TEST_PHASES).toHaveLength(6);
    });

    it('should cover all test types', () => {
      const allTypes = new Set(COMPREHENSIVE_TEST_PHASES.flatMap(p => p.testTypes));
      expect(allTypes.has('unit')).toBe(true);
      expect(allTypes.has('integration')).toBe(true);
      expect(allTypes.has('contract')).toBe(true);
      expect(allTypes.has('visual')).toBe(true);
      expect(allTypes.has('accessibility')).toBe(true);
      expect(allTypes.has('e2e')).toBe(true);
      expect(allTypes.has('security')).toBe(true);
    });
  });

  describe('SECURITY_FOCUSED_PHASES', () => {
    it('should have 3 phases', () => {
      expect(SECURITY_FOCUSED_PHASES).toHaveLength(3);
    });

    it('should include security in all phases', () => {
      SECURITY_FOCUSED_PHASES.forEach(phase => {
        expect(phase.testTypes).toContain('security');
      });
    });

    it('should require 100% pass rate', () => {
      SECURITY_FOCUSED_PHASES.forEach(phase => {
        expect(phase.qualityThresholds.minPassRate).toBe(1.0);
      });
    });
  });
});

describe('createPhase', () => {
  it('should create phase with required options', () => {
    const phase = createPhase(0, 'Test', {
      testTypes: ['unit', 'integration'],
    });

    expect(phase.id).toBe(0);
    expect(phase.name).toBe('Test');
    expect(phase.testTypes).toEqual(['unit', 'integration']);
    expect(phase.expectedDuration).toBe(60000); // Default
  });

  it('should accept custom duration', () => {
    const phase = createPhase(1, 'Quick', {
      testTypes: ['unit'],
      expectedDuration: 5000,
    });

    expect(phase.expectedDuration).toBe(5000);
  });

  it('should accept custom thresholds', () => {
    const phase = createPhase(0, 'Strict', {
      testTypes: ['unit'],
      thresholds: {
        minPassRate: 0.999,
        maxFlakyRatio: 0.001,
        minCoverage: 0.95,
      },
    });

    expect(phase.qualityThresholds.minPassRate).toBe(0.999);
    expect(phase.qualityThresholds.maxFlakyRatio).toBe(0.001);
    expect(phase.qualityThresholds.minCoverage).toBe(0.95);
  });

  it('should accept partial thresholds', () => {
    const phase = createPhase(0, 'Partial', {
      testTypes: ['unit'],
      thresholds: {
        minPassRate: 0.999,
      },
    });

    expect(phase.qualityThresholds.minPassRate).toBe(0.999);
    expect(phase.qualityThresholds.maxFlakyRatio).toBe(0.05); // Default
    expect(phase.qualityThresholds.minCoverage).toBe(0.70); // Default
  });

  it('should accept custom agents', () => {
    const phase = createPhase(0, 'Custom', {
      testTypes: ['security'],
      agents: ['custom-scanner', 'sast-agent'],
      parallelism: 2,
    });

    expect(phase.agentConfig.agents).toEqual(['custom-scanner', 'sast-agent']);
    expect(phase.agentConfig.parallelism).toBe(2);
  });
});

describe('scalePhases', () => {
  it('should scale durations up', () => {
    const scaled = scalePhases(DEFAULT_TEST_PHASES, 2.0);

    scaled.forEach((phase, i) => {
      expect(phase.expectedDuration).toBe(DEFAULT_TEST_PHASES[i].expectedDuration * 2);
    });
  });

  it('should scale durations down', () => {
    const scaled = scalePhases(DEFAULT_TEST_PHASES, 0.5);

    scaled.forEach((phase, i) => {
      expect(phase.expectedDuration).toBe(DEFAULT_TEST_PHASES[i].expectedDuration * 0.5);
    });
  });

  it('should preserve other properties', () => {
    const scaled = scalePhases(DEFAULT_TEST_PHASES, 1.5);

    scaled.forEach((phase, i) => {
      expect(phase.name).toBe(DEFAULT_TEST_PHASES[i].name);
      expect(phase.testTypes).toEqual(DEFAULT_TEST_PHASES[i].testTypes);
      expect(phase.qualityThresholds).toEqual(DEFAULT_TEST_PHASES[i].qualityThresholds);
    });
  });
});

describe('adjustThresholds', () => {
  it('should adjust pass rate', () => {
    const adjusted = adjustThresholds(DEFAULT_TEST_PHASES, {
      passRateAdjust: -0.05,
    });

    adjusted.forEach((phase, i) => {
      expect(phase.qualityThresholds.minPassRate)
        .toBeCloseTo(DEFAULT_TEST_PHASES[i].qualityThresholds.minPassRate - 0.05, 5);
    });
  });

  it('should adjust flaky ratio', () => {
    const adjusted = adjustThresholds(DEFAULT_TEST_PHASES, {
      flakyRatioAdjust: 0.02,
    });

    adjusted.forEach((phase, i) => {
      expect(phase.qualityThresholds.maxFlakyRatio)
        .toBeCloseTo(DEFAULT_TEST_PHASES[i].qualityThresholds.maxFlakyRatio + 0.02, 5);
    });
  });

  it('should adjust coverage', () => {
    const adjusted = adjustThresholds(DEFAULT_TEST_PHASES, {
      coverageAdjust: -0.10,
    });

    adjusted.forEach((phase, i) => {
      expect(phase.qualityThresholds.minCoverage)
        .toBeCloseTo(DEFAULT_TEST_PHASES[i].qualityThresholds.minCoverage - 0.10, 5);
    });
  });

  it('should clamp values to [0, 1]', () => {
    const adjusted = adjustThresholds(DEFAULT_TEST_PHASES, {
      passRateAdjust: 0.5, // Would exceed 1
    });

    adjusted.forEach(phase => {
      expect(phase.qualityThresholds.minPassRate).toBeLessThanOrEqual(1);
    });
  });

  it('should handle negative clamping', () => {
    const adjusted = adjustThresholds(DEFAULT_TEST_PHASES, {
      coverageAdjust: -1.0, // Would go negative
    });

    adjusted.forEach(phase => {
      expect(phase.qualityThresholds.minCoverage).toBeGreaterThanOrEqual(0);
    });
  });

  it('should support multiple adjustments', () => {
    const adjusted = adjustThresholds(DEFAULT_TEST_PHASES, {
      passRateAdjust: -0.02,
      flakyRatioAdjust: 0.03,
      coverageAdjust: -0.05,
    });

    adjusted.forEach((phase, i) => {
      expect(phase.qualityThresholds.minPassRate)
        .toBeCloseTo(DEFAULT_TEST_PHASES[i].qualityThresholds.minPassRate - 0.02, 5);
      expect(phase.qualityThresholds.maxFlakyRatio)
        .toBeCloseTo(DEFAULT_TEST_PHASES[i].qualityThresholds.maxFlakyRatio + 0.03, 5);
      expect(phase.qualityThresholds.minCoverage)
        .toBeCloseTo(DEFAULT_TEST_PHASES[i].qualityThresholds.minCoverage - 0.05, 5);
    });
  });
});

describe('mergePhases', () => {
  it('should merge adjacent phases', () => {
    const merged = mergePhases(DEFAULT_TEST_PHASES, 0, 1, 'UnitAndIntegration');

    expect(merged).toHaveLength(3);
    expect(merged[0].name).toBe('UnitAndIntegration');
    expect(merged[0].testTypes).toContain('unit');
    expect(merged[0].testTypes).toContain('integration');
    expect(merged[0].testTypes).toContain('contract');
  });

  it('should combine durations', () => {
    const merged = mergePhases(DEFAULT_TEST_PHASES, 0, 1, 'Merged');

    const expectedDuration =
      DEFAULT_TEST_PHASES[0].expectedDuration +
      DEFAULT_TEST_PHASES[1].expectedDuration;

    expect(merged[0].expectedDuration).toBe(expectedDuration);
  });

  it('should use minimum thresholds', () => {
    const merged = mergePhases(DEFAULT_TEST_PHASES, 0, 1, 'Merged');

    // Should use the lower pass rate threshold
    expect(merged[0].qualityThresholds.minPassRate).toBe(
      Math.min(
        DEFAULT_TEST_PHASES[0].qualityThresholds.minPassRate,
        DEFAULT_TEST_PHASES[1].qualityThresholds.minPassRate
      )
    );
  });

  it('should use maximum flaky ratio', () => {
    const merged = mergePhases(DEFAULT_TEST_PHASES, 0, 1, 'Merged');

    expect(merged[0].qualityThresholds.maxFlakyRatio).toBe(
      Math.max(
        DEFAULT_TEST_PHASES[0].qualityThresholds.maxFlakyRatio,
        DEFAULT_TEST_PHASES[1].qualityThresholds.maxFlakyRatio
      )
    );
  });

  it('should combine agents', () => {
    const merged = mergePhases(DEFAULT_TEST_PHASES, 1, 2, 'IntegrationAndE2E');

    const mergedAgents = merged[1].agentConfig.agents;
    expect(mergedAgents).toContain('qe-test-executor');
  });

  it('should renumber phase IDs', () => {
    const merged = mergePhases(DEFAULT_TEST_PHASES, 1, 2, 'Merged');

    merged.forEach((phase, index) => {
      expect(phase.id).toBe(index);
    });
  });

  it('should throw on invalid indices', () => {
    expect(() => mergePhases(DEFAULT_TEST_PHASES, 2, 1, 'Invalid')).toThrow();
    expect(() => mergePhases(DEFAULT_TEST_PHASES, -1, 1, 'Invalid')).toThrow();
    expect(() => mergePhases(DEFAULT_TEST_PHASES, 0, 10, 'Invalid')).toThrow();
  });
});

describe('getPhasesForProjectType', () => {
  describe('frontend', () => {
    it('should include visual/a11y testing', () => {
      const phases = getPhasesForProjectType('frontend');

      const allTypes = new Set(phases.flatMap(p => p.testTypes));
      expect(allTypes.has('visual')).toBe(true);
      expect(allTypes.has('accessibility')).toBe(true);
    });

    it('should have 4 phases', () => {
      const phases = getPhasesForProjectType('frontend');
      expect(phases).toHaveLength(4);
    });
  });

  describe('backend', () => {
    it('should include security testing', () => {
      const phases = getPhasesForProjectType('backend');

      const allTypes = new Set(phases.flatMap(p => p.testTypes));
      expect(allTypes.has('security')).toBe(true);
      expect(allTypes.has('performance')).toBe(true);
    });

    it('should have contract testing', () => {
      const phases = getPhasesForProjectType('backend');

      const allTypes = new Set(phases.flatMap(p => p.testTypes));
      expect(allTypes.has('contract')).toBe(true);
    });
  });

  describe('fullstack', () => {
    it('should return comprehensive phases', () => {
      const phases = getPhasesForProjectType('fullstack');

      expect(phases).toHaveLength(6);
    });
  });

  describe('library', () => {
    it('should have high coverage requirements', () => {
      const phases = getPhasesForProjectType('library');

      expect(phases[0].qualityThresholds.minCoverage).toBeGreaterThanOrEqual(0.95);
    });

    it('should have fewer phases', () => {
      const phases = getPhasesForProjectType('library');

      expect(phases).toHaveLength(2);
    });
  });

  describe('microservice', () => {
    it('should emphasize contract testing', () => {
      const phases = getPhasesForProjectType('microservice');

      const contractPhase = phases.find(p => p.testTypes.includes('contract'));
      expect(contractPhase).toBeDefined();
      expect(contractPhase!.qualityThresholds.minPassRate).toBe(1.0);
    });

    it('should have 3 phases', () => {
      const phases = getPhasesForProjectType('microservice');

      expect(phases).toHaveLength(3);
    });
  });

  describe('unknown project type', () => {
    it('should return default phases', () => {
      // TypeScript would catch this, but test runtime behavior
      const phases = getPhasesForProjectType('unknown' as any);

      expect(phases).toEqual(DEFAULT_TEST_PHASES);
    });
  });
});
