/**
 * Routing Configuration Tests - TD-004
 * ADR-026: Intelligent Model Routing
 *
 * Tests for the routing configuration system including thresholds,
 * cost optimization, fallback behavior, and environment variable overrides.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  DEFAULT_TIER_MAPPING,
  DEFAULT_COST_OPTIMIZATION,
  DEFAULT_FALLBACK_CONFIG,
  loadRoutingConfigFromEnv,
  mapComplexityToTier,
  getNextFallbackTier,
  tierToModel,
  estimateTaskCost,
  validateRoutingConfig,
  type RoutingConfig,
  type AgentTier,
  type ConfidenceThresholds,
} from '../../../src/routing/routing-config.js';
import type { TaskComplexity, ClaudeModel } from '../../../src/routing/task-classifier.js';

describe('Routing Configuration', () => {
  describe('Default Configuration Values', () => {
    describe('DEFAULT_CONFIDENCE_THRESHOLDS', () => {
      it('should have multiModel threshold of 0.80', () => {
        expect(DEFAULT_CONFIDENCE_THRESHOLDS.multiModel).toBe(0.80);
      });

      it('should have humanReview threshold of 0.20', () => {
        expect(DEFAULT_CONFIDENCE_THRESHOLDS.humanReview).toBe(0.20);
      });

      it('should have security threshold of 0.85', () => {
        expect(DEFAULT_CONFIDENCE_THRESHOLDS.security).toBe(0.85);
      });

      it('should have escalation threshold of 0.60', () => {
        expect(DEFAULT_CONFIDENCE_THRESHOLDS.escalation).toBe(0.60);
      });
    });

    describe('DEFAULT_TIER_MAPPING', () => {
      it('should map trivial to booster and haiku', () => {
        expect(DEFAULT_TIER_MAPPING.trivial).toEqual(['booster', 'haiku']);
      });

      it('should map simple to haiku only', () => {
        expect(DEFAULT_TIER_MAPPING.simple).toEqual(['haiku']);
      });

      it('should map moderate to sonnet only', () => {
        expect(DEFAULT_TIER_MAPPING.moderate).toEqual(['sonnet']);
      });

      it('should map complex to sonnet and opus', () => {
        expect(DEFAULT_TIER_MAPPING.complex).toEqual(['sonnet', 'opus']);
      });

      it('should map critical to opus only', () => {
        expect(DEFAULT_TIER_MAPPING.critical).toEqual(['opus']);
      });
    });

    describe('DEFAULT_COST_OPTIMIZATION', () => {
      it('should be enabled by default', () => {
        expect(DEFAULT_COST_OPTIMIZATION.enabled).toBe(true);
      });

      it('should prefer cheaper models by default', () => {
        expect(DEFAULT_COST_OPTIMIZATION.preferCheaperModels).toBe(true);
      });

      it('should have haiku pricing', () => {
        expect(DEFAULT_COST_OPTIMIZATION.costPerMillionTokens.haiku).toEqual({
          input: 0.25,
          output: 1.25,
        });
      });

      it('should have sonnet pricing', () => {
        expect(DEFAULT_COST_OPTIMIZATION.costPerMillionTokens.sonnet).toEqual({
          input: 3.0,
          output: 15.0,
        });
      });

      it('should have opus pricing', () => {
        expect(DEFAULT_COST_OPTIMIZATION.costPerMillionTokens.opus).toEqual({
          input: 15.0,
          output: 75.0,
        });
      });

      it('should have unlimited daily cost limit by default', () => {
        expect(DEFAULT_COST_OPTIMIZATION.dailyCostLimit).toBe(0);
      });

      it('should have cost alert threshold of 0.80', () => {
        expect(DEFAULT_COST_OPTIMIZATION.costAlertThreshold).toBe(0.80);
      });
    });

    describe('DEFAULT_FALLBACK_CONFIG', () => {
      it('should be enabled by default', () => {
        expect(DEFAULT_FALLBACK_CONFIG.enabled).toBe(true);
      });

      it('should have max 2 fallback attempts', () => {
        expect(DEFAULT_FALLBACK_CONFIG.maxAttempts).toBe(2);
      });

      it('should have 1000ms retry delay', () => {
        expect(DEFAULT_FALLBACK_CONFIG.retryDelayMs).toBe(1000);
      });

      it('should have booster -> haiku fallback', () => {
        expect(DEFAULT_FALLBACK_CONFIG.chain.booster).toBe('haiku');
      });

      it('should have haiku -> sonnet fallback', () => {
        expect(DEFAULT_FALLBACK_CONFIG.chain.haiku).toBe('sonnet');
      });

      it('should have sonnet -> opus fallback', () => {
        expect(DEFAULT_FALLBACK_CONFIG.chain.sonnet).toBe('opus');
      });

      it('should have no fallback from opus', () => {
        expect(DEFAULT_FALLBACK_CONFIG.chain.opus).toBeNull();
      });
    });

    describe('DEFAULT_ROUTING_CONFIG', () => {
      it('should include confidence thresholds', () => {
        expect(DEFAULT_ROUTING_CONFIG.confidence).toEqual(DEFAULT_CONFIDENCE_THRESHOLDS);
      });

      it('should include tier mapping', () => {
        expect(DEFAULT_ROUTING_CONFIG.tierMapping).toEqual(DEFAULT_TIER_MAPPING);
      });

      it('should include cost optimization', () => {
        expect(DEFAULT_ROUTING_CONFIG.costOptimization).toEqual(DEFAULT_COST_OPTIMIZATION);
      });

      it('should include fallback config', () => {
        expect(DEFAULT_ROUTING_CONFIG.fallback).toEqual(DEFAULT_FALLBACK_CONFIG);
      });

      it('should have verbose disabled by default', () => {
        expect(DEFAULT_ROUTING_CONFIG.verbose).toBe(false);
      });
    });
  });

  describe('loadRoutingConfigFromEnv', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Clear relevant env vars
      delete process.env.ROUTING_CONFIDENCE_MULTI_MODEL;
      delete process.env.ROUTING_CONFIDENCE_HUMAN_REVIEW;
      delete process.env.ROUTING_CONFIDENCE_SECURITY;
      delete process.env.ROUTING_CONFIDENCE_ESCALATION;
      delete process.env.ROUTING_COST_DAILY_LIMIT;
      delete process.env.ROUTING_COST_PREFER_CHEAPER;
      delete process.env.ROUTING_FALLBACK_ENABLED;
      delete process.env.ROUTING_FALLBACK_MAX_ATTEMPTS;
      delete process.env.ROUTING_VERBOSE;
    });

    afterEach(() => {
      // Restore env
      process.env = { ...originalEnv };
    });

    it('should return default config when no env vars set', () => {
      const config = loadRoutingConfigFromEnv();
      expect(config).toEqual(DEFAULT_ROUTING_CONFIG);
    });

    it('should override multiModel threshold from env', () => {
      process.env.ROUTING_CONFIDENCE_MULTI_MODEL = '0.90';
      const config = loadRoutingConfigFromEnv();

      expect(config.confidence.multiModel).toBe(0.90);
    });

    it('should override humanReview threshold from env', () => {
      process.env.ROUTING_CONFIDENCE_HUMAN_REVIEW = '0.15';
      const config = loadRoutingConfigFromEnv();

      expect(config.confidence.humanReview).toBe(0.15);
    });

    it('should override security threshold from env', () => {
      process.env.ROUTING_CONFIDENCE_SECURITY = '0.95';
      const config = loadRoutingConfigFromEnv();

      expect(config.confidence.security).toBe(0.95);
    });

    it('should override escalation threshold from env', () => {
      process.env.ROUTING_CONFIDENCE_ESCALATION = '0.70';
      const config = loadRoutingConfigFromEnv();

      expect(config.confidence.escalation).toBe(0.70);
    });

    it('should override daily cost limit from env', () => {
      process.env.ROUTING_COST_DAILY_LIMIT = '100.50';
      const config = loadRoutingConfigFromEnv();

      expect(config.costOptimization.dailyCostLimit).toBe(100.50);
    });

    it('should override preferCheaperModels from env (true)', () => {
      process.env.ROUTING_COST_PREFER_CHEAPER = 'true';
      const config = loadRoutingConfigFromEnv();

      expect(config.costOptimization.preferCheaperModels).toBe(true);
    });

    it('should override preferCheaperModels from env (false)', () => {
      process.env.ROUTING_COST_PREFER_CHEAPER = 'false';
      const config = loadRoutingConfigFromEnv();

      expect(config.costOptimization.preferCheaperModels).toBe(false);
    });

    it('should handle case-insensitive boolean (TRUE)', () => {
      process.env.ROUTING_COST_PREFER_CHEAPER = 'TRUE';
      const config = loadRoutingConfigFromEnv();

      expect(config.costOptimization.preferCheaperModels).toBe(true);
    });

    it('should override fallback enabled from env (false)', () => {
      process.env.ROUTING_FALLBACK_ENABLED = 'false';
      const config = loadRoutingConfigFromEnv();

      expect(config.fallback.enabled).toBe(false);
    });

    it('should override fallback max attempts from env', () => {
      process.env.ROUTING_FALLBACK_MAX_ATTEMPTS = '5';
      const config = loadRoutingConfigFromEnv();

      expect(config.fallback.maxAttempts).toBe(5);
    });

    it('should override verbose from env', () => {
      process.env.ROUTING_VERBOSE = 'true';
      const config = loadRoutingConfigFromEnv();

      expect(config.verbose).toBe(true);
    });

    it('should apply multiple env overrides', () => {
      process.env.ROUTING_CONFIDENCE_MULTI_MODEL = '0.75';
      process.env.ROUTING_COST_DAILY_LIMIT = '50';
      process.env.ROUTING_VERBOSE = 'true';

      const config = loadRoutingConfigFromEnv();

      expect(config.confidence.multiModel).toBe(0.75);
      expect(config.costOptimization.dailyCostLimit).toBe(50);
      expect(config.verbose).toBe(true);
    });

    it('should use provided base config', () => {
      const baseConfig: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        verbose: true,
        confidence: {
          ...DEFAULT_CONFIDENCE_THRESHOLDS,
          multiModel: 0.50,
        },
      };

      const config = loadRoutingConfigFromEnv(baseConfig);

      expect(config.verbose).toBe(true);
      expect(config.confidence.multiModel).toBe(0.50);
    });

    it('should override base config with env vars', () => {
      const baseConfig: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        confidence: {
          ...DEFAULT_CONFIDENCE_THRESHOLDS,
          multiModel: 0.50,
        },
      };

      process.env.ROUTING_CONFIDENCE_MULTI_MODEL = '0.99';
      const config = loadRoutingConfigFromEnv(baseConfig);

      expect(config.confidence.multiModel).toBe(0.99);
    });

    it('should not mutate the base config', () => {
      const baseConfig = { ...DEFAULT_ROUTING_CONFIG };
      process.env.ROUTING_VERBOSE = 'true';

      loadRoutingConfigFromEnv(baseConfig);

      expect(baseConfig.verbose).toBe(false);
    });
  });

  describe('mapComplexityToTier', () => {
    it('should map trivial complexity (score <= 20) to trivial tiers', () => {
      const tiers = mapComplexityToTier('simple', 10);
      expect(tiers).toEqual(['booster', 'haiku']);
    });

    it('should map simple complexity to simple tiers', () => {
      const tiers = mapComplexityToTier('simple', 25);
      expect(tiers).toEqual(['haiku']);
    });

    it('should map moderate complexity to moderate tiers', () => {
      const tiers = mapComplexityToTier('moderate', 35);
      expect(tiers).toEqual(['sonnet']);
    });

    it('should map complex complexity to complex tiers', () => {
      const tiers = mapComplexityToTier('complex', 55);
      expect(tiers).toEqual(['sonnet', 'opus']);
    });

    it('should map critical complexity to critical tiers', () => {
      const tiers = mapComplexityToTier('critical', 80);
      expect(tiers).toEqual(['opus']);
    });

    it('should respect custom tier mapping config', () => {
      const customConfig: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        tierMapping: {
          ...DEFAULT_TIER_MAPPING,
          simple: ['sonnet'], // Override simple mapping
        },
      };

      const tiers = mapComplexityToTier('simple', 25, customConfig);
      expect(tiers).toEqual(['sonnet']);
    });

    it('should handle score at boundary (20)', () => {
      // Score of 20 is exactly at boundary, normalized to 0.2
      const tiers = mapComplexityToTier('moderate', 20);
      expect(tiers).toEqual(['booster', 'haiku']); // <= 0.2 goes to trivial
    });

    it('should handle score just above boundary (21)', () => {
      const tiers = mapComplexityToTier('moderate', 21);
      expect(tiers).toEqual(['sonnet']);
    });

    it('should handle score of 0', () => {
      const tiers = mapComplexityToTier('simple', 0);
      expect(tiers).toEqual(['booster', 'haiku']);
    });

    it('should handle score of 100', () => {
      const tiers = mapComplexityToTier('critical', 100);
      expect(tiers).toEqual(['opus']);
    });
  });

  describe('getNextFallbackTier', () => {
    it('should return haiku as fallback for booster', () => {
      const next = getNextFallbackTier('booster');
      expect(next).toBe('haiku');
    });

    it('should return sonnet as fallback for haiku', () => {
      const next = getNextFallbackTier('haiku');
      expect(next).toBe('sonnet');
    });

    it('should return opus as fallback for sonnet', () => {
      const next = getNextFallbackTier('sonnet');
      expect(next).toBe('opus');
    });

    it('should return null as fallback for opus', () => {
      const next = getNextFallbackTier('opus');
      expect(next).toBeNull();
    });

    it('should return null when fallback is disabled', () => {
      const config: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        fallback: {
          ...DEFAULT_FALLBACK_CONFIG,
          enabled: false,
        },
      };

      const next = getNextFallbackTier('haiku', config);
      expect(next).toBeNull();
    });

    it('should use custom fallback chain', () => {
      const config: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        fallback: {
          ...DEFAULT_FALLBACK_CONFIG,
          chain: {
            booster: 'opus', // Direct jump to opus
            haiku: 'opus',
            sonnet: 'opus',
            opus: null,
          },
        },
      };

      const next = getNextFallbackTier('booster', config);
      expect(next).toBe('opus');
    });
  });

  describe('tierToModel', () => {
    it('should map booster to haiku', () => {
      expect(tierToModel('booster')).toBe('haiku');
    });

    it('should map haiku to haiku', () => {
      expect(tierToModel('haiku')).toBe('haiku');
    });

    it('should map sonnet to sonnet', () => {
      expect(tierToModel('sonnet')).toBe('sonnet');
    });

    it('should map opus to opus', () => {
      expect(tierToModel('opus')).toBe('opus');
    });
  });

  describe('estimateTaskCost', () => {
    it('should calculate haiku cost correctly', () => {
      const cost = estimateTaskCost('haiku', 1_000_000, 1_000_000);
      // Input: $0.25, Output: $1.25 = $1.50
      expect(cost).toBeCloseTo(1.50, 2);
    });

    it('should calculate sonnet cost correctly', () => {
      const cost = estimateTaskCost('sonnet', 1_000_000, 1_000_000);
      // Input: $3.00, Output: $15.00 = $18.00
      expect(cost).toBeCloseTo(18.00, 2);
    });

    it('should calculate opus cost correctly', () => {
      const cost = estimateTaskCost('opus', 1_000_000, 1_000_000);
      // Input: $15.00, Output: $75.00 = $90.00
      expect(cost).toBeCloseTo(90.00, 2);
    });

    it('should handle smaller token counts', () => {
      const cost = estimateTaskCost('haiku', 10_000, 5_000);
      // Input: 0.01 * $0.25 = $0.0025, Output: 0.005 * $1.25 = $0.00625
      // Total: $0.00875
      expect(cost).toBeCloseTo(0.00875, 5);
    });

    it('should handle zero tokens', () => {
      const cost = estimateTaskCost('haiku', 0, 0);
      expect(cost).toBe(0);
    });

    it('should handle large token counts', () => {
      const cost = estimateTaskCost('opus', 10_000_000, 5_000_000);
      // Input: 10 * $15.00 = $150, Output: 5 * $75.00 = $375
      // Total: $525
      expect(cost).toBeCloseTo(525, 2);
    });

    it('should use custom cost config', () => {
      const config: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        costOptimization: {
          ...DEFAULT_COST_OPTIMIZATION,
          costPerMillionTokens: {
            haiku: { input: 1.0, output: 2.0 },
            sonnet: { input: 5.0, output: 20.0 },
            opus: { input: 20.0, output: 100.0 },
          },
        },
      };

      const cost = estimateTaskCost('haiku', 1_000_000, 1_000_000, config);
      expect(cost).toBe(3.0); // $1 + $2
    });
  });

  describe('validateRoutingConfig', () => {
    it('should accept valid default config', () => {
      expect(() => validateRoutingConfig(DEFAULT_ROUTING_CONFIG)).not.toThrow();
    });

    describe('Confidence Thresholds Validation', () => {
      it('should reject multiModel < 0', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, multiModel: -0.1 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('multiModel confidence must be between 0 and 1');
      });

      it('should reject multiModel > 1', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, multiModel: 1.5 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('multiModel confidence must be between 0 and 1');
      });

      it('should accept multiModel at boundary (0)', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, multiModel: 0 },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });

      it('should accept multiModel at boundary (1)', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, multiModel: 1 },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });

      it('should reject humanReview < 0', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, humanReview: -1 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('humanReview confidence must be between 0 and 1');
      });

      it('should reject humanReview > 1', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, humanReview: 2 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('humanReview confidence must be between 0 and 1');
      });

      it('should reject security < 0', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, security: -0.5 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('security confidence must be between 0 and 1');
      });

      it('should reject security > 1', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, security: 1.1 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('security confidence must be between 0 and 1');
      });

      it('should reject escalation < 0', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, escalation: -0.2 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('escalation confidence must be between 0 and 1');
      });

      it('should reject escalation > 1', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: { ...DEFAULT_CONFIDENCE_THRESHOLDS, escalation: 1.01 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('escalation confidence must be between 0 and 1');
      });
    });

    describe('Cost Optimization Validation', () => {
      it('should reject negative dailyCostLimit', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          costOptimization: { ...DEFAULT_COST_OPTIMIZATION, dailyCostLimit: -10 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('dailyCostLimit must be non-negative');
      });

      it('should accept dailyCostLimit of 0 (unlimited)', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          costOptimization: { ...DEFAULT_COST_OPTIMIZATION, dailyCostLimit: 0 },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });

      it('should accept positive dailyCostLimit', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          costOptimization: { ...DEFAULT_COST_OPTIMIZATION, dailyCostLimit: 100 },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });

      it('should reject costAlertThreshold < 0', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          costOptimization: { ...DEFAULT_COST_OPTIMIZATION, costAlertThreshold: -0.1 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('costAlertThreshold must be between 0 and 1');
      });

      it('should reject costAlertThreshold > 1', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          costOptimization: { ...DEFAULT_COST_OPTIMIZATION, costAlertThreshold: 1.5 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('costAlertThreshold must be between 0 and 1');
      });
    });

    describe('Fallback Validation', () => {
      it('should reject negative maxAttempts', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          fallback: { ...DEFAULT_FALLBACK_CONFIG, maxAttempts: -1 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('maxAttempts must be non-negative');
      });

      it('should accept maxAttempts of 0', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          fallback: { ...DEFAULT_FALLBACK_CONFIG, maxAttempts: 0 },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });

      it('should reject negative retryDelayMs', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          fallback: { ...DEFAULT_FALLBACK_CONFIG, retryDelayMs: -100 },
        };
        expect(() => validateRoutingConfig(config)).toThrow('retryDelayMs must be non-negative');
      });

      it('should accept retryDelayMs of 0', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          fallback: { ...DEFAULT_FALLBACK_CONFIG, retryDelayMs: 0 },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });
    });

    describe('Valid Custom Configurations', () => {
      it('should accept all confidence thresholds at 0.5', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          confidence: {
            multiModel: 0.5,
            humanReview: 0.5,
            security: 0.5,
            escalation: 0.5,
          },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });

      it('should accept high cost limits', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          costOptimization: {
            ...DEFAULT_COST_OPTIMIZATION,
            dailyCostLimit: 10000,
          },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });

      it('should accept high max attempts', () => {
        const config: RoutingConfig = {
          ...DEFAULT_ROUTING_CONFIG,
          fallback: {
            ...DEFAULT_FALLBACK_CONFIG,
            maxAttempts: 100,
          },
        };
        expect(() => validateRoutingConfig(config)).not.toThrow();
      });
    });
  });

  describe('Type Safety', () => {
    it('should enforce AgentTier type', () => {
      const validTiers: AgentTier[] = ['booster', 'haiku', 'sonnet', 'opus'];
      validTiers.forEach(tier => {
        const model = tierToModel(tier);
        expect(['haiku', 'sonnet', 'opus']).toContain(model);
      });
    });

    it('should enforce TaskComplexity type in mapComplexityToTier', () => {
      const complexities: TaskComplexity[] = ['simple', 'moderate', 'complex', 'critical'];
      complexities.forEach(complexity => {
        const tiers = mapComplexityToTier(complexity, 50);
        expect(Array.isArray(tiers)).toBe(true);
      });
    });

    it('should enforce ClaudeModel type in estimateTaskCost', () => {
      const models: ClaudeModel[] = ['haiku', 'sonnet', 'opus'];
      models.forEach(model => {
        const cost = estimateTaskCost(model, 1000, 1000);
        expect(typeof cost).toBe('number');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle fractional token counts in cost estimation', () => {
      const cost = estimateTaskCost('haiku', 500, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it('should handle very small confidence thresholds', () => {
      const config: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        confidence: {
          multiModel: 0.001,
          humanReview: 0.001,
          security: 0.001,
          escalation: 0.001,
        },
      };
      expect(() => validateRoutingConfig(config)).not.toThrow();
    });

    it('should handle confidence thresholds at exact boundaries', () => {
      const config: RoutingConfig = {
        ...DEFAULT_ROUTING_CONFIG,
        confidence: {
          multiModel: 0,
          humanReview: 1,
          security: 0,
          escalation: 1,
        },
      };
      expect(() => validateRoutingConfig(config)).not.toThrow();
    });
  });
});
