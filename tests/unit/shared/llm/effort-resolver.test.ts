/**
 * Agentic QE v3 - Effort Resolver Tests
 * ADR-093: Opus 4.7 Migration + Claude Code 2026-04 Feature Adoption
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveEffortLevel,
  downgradeEffort,
  resetFleetDefaultsCache,
  DEFAULT_EFFORT_LEVEL,
  EFFORT_LEVELS,
  type EffortLevel,
} from '../../../../src/shared/llm/effort-resolver';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('ADR-093 effort-resolver', () => {
  beforeEach(() => {
    resetFleetDefaultsCache();
  });

  describe('DEFAULT_EFFORT_LEVEL', () => {
    it('should be xhigh per ADR-093', () => {
      expect(DEFAULT_EFFORT_LEVEL).toBe('xhigh');
    });
  });

  describe('EFFORT_LEVELS ordering', () => {
    it('should order low < medium < high < xhigh < max', () => {
      expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    });
  });

  describe('resolveEffortLevel priority chain', () => {
    it('should return xhigh when no overrides and no env', () => {
      const result = resolveEffortLevel({
        env: {},
        fleetDefaultsPath: '/non/existent/path.yaml',
      });
      expect(result).toBe('xhigh');
    });

    it('should honour QE_EFFORT_LEVEL env var', () => {
      const result = resolveEffortLevel({
        env: { QE_EFFORT_LEVEL: 'medium' },
        fleetDefaultsPath: '/non/existent/path.yaml',
      });
      expect(result).toBe('medium');
    });

    it('should ignore invalid QE_EFFORT_LEVEL and fall through', () => {
      const result = resolveEffortLevel({
        env: { QE_EFFORT_LEVEL: 'ludicrous' as unknown as string },
        fleetDefaultsPath: '/non/existent/path.yaml',
      });
      expect(result).toBe('xhigh'); // fell through to hardcoded default
    });

    it('should prefer per-agent frontmatter over env', () => {
      const result = resolveEffortLevel({
        env: { QE_EFFORT_LEVEL: 'medium' },
        agentEffort: 'max',
        fleetDefaultsPath: '/non/existent/path.yaml',
      });
      expect(result).toBe('max');
    });

    it('should prefer runtime override over frontmatter and env', () => {
      const result = resolveEffortLevel({
        env: { QE_EFFORT_LEVEL: 'medium' },
        agentEffort: 'max',
        override: 'low',
        fleetDefaultsPath: '/non/existent/path.yaml',
      });
      expect(result).toBe('low');
    });

    it('should read fleet-defaults.yaml when no env', () => {
      const dir = mkdtempSync(join(tmpdir(), 'adr-093-'));
      const yamlPath = join(dir, 'fleet-defaults.yaml');
      writeFileSync(yamlPath, 'effort_level: high\n');
      try {
        const result = resolveEffortLevel({
          env: {},
          fleetDefaultsPath: yamlPath,
        });
        expect(result).toBe('high');
      } finally {
        unlinkSync(yamlPath);
      }
    });

    it('should let env var override fleet-defaults.yaml', () => {
      const dir = mkdtempSync(join(tmpdir(), 'adr-093-'));
      const yamlPath = join(dir, 'fleet-defaults.yaml');
      writeFileSync(yamlPath, 'effort_level: high\n');
      try {
        const result = resolveEffortLevel({
          env: { QE_EFFORT_LEVEL: 'low' },
          fleetDefaultsPath: yamlPath,
        });
        expect(result).toBe('low');
      } finally {
        unlinkSync(yamlPath);
      }
    });
  });

  describe('downgradeEffort', () => {
    it('should downgrade xhigh to high when cap is high', () => {
      expect(downgradeEffort('xhigh', 'high')).toBe('high');
    });

    it('should not upgrade low to high when cap is high', () => {
      expect(downgradeEffort('low', 'high')).toBe('low');
    });

    it('should return the requested level when cap >= requested', () => {
      expect(downgradeEffort('medium', 'max')).toBe('medium');
      expect(downgradeEffort('max', 'max')).toBe('max');
    });

    it('should downgrade max to high when cap is high', () => {
      expect(downgradeEffort('max', 'high')).toBe('high');
    });
  });
});
