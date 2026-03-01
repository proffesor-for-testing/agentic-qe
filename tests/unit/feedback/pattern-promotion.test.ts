/**
 * Unit Tests for PatternPromotionManager
 * ADR-023: Quality Feedback Loop System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PatternPromotionManager,
  createPatternPromotionManager,
} from '../../../src/feedback/pattern-promotion.js';
import type { PatternMetrics } from '../../../src/feedback/pattern-promotion.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';

describe('PatternPromotionManager', () => {
  let manager: PatternPromotionManager;

  beforeEach(() => {
    manager = createPatternPromotionManager();
  });

  function createPattern(overrides: Partial<QEPattern> = {}): QEPattern {
    return {
      id: `pattern-${Date.now()}`,
      patternType: 'test-strategy',
      qeDomain: 'test-generation',
      domain: 'testing',
      name: 'Test Pattern',
      description: 'A test pattern',
      template: { type: 'code', content: 'test content', variables: [] },
      context: { tags: ['test'], confidence: 0.7, metadata: {} },
      confidence: 0.7,
      usageCount: 10,
      successRate: 0.8,
      qualityScore: 0.75,
      tier: 'short-term',
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      lastUsedAt: new Date(),
      successfulUses: 8,
      ...overrides,
    };
  }

  function createMetrics(overrides: Partial<PatternMetrics> = {}): PatternMetrics {
    return {
      patternId: 'pattern-1',
      successCount: 20,
      failureCount: 3,
      successRate: 0.87,
      qualityScore: 0.8,
      ageDays: 30,
      recentSuccessRate: 0.9,
      recentFailureCount: 0,
      ...overrides,
    };
  }

  describe('evaluatePromotion', () => {
    it('should promote pattern from short-term to working tier', () => {
      const pattern = createPattern({ tier: 'short-term' });
      const metrics = createMetrics({
        successCount: 10,
        successRate: 0.75,
        qualityScore: 0.7,
        ageDays: 10,
      });

      const event = manager.evaluatePromotion(pattern, metrics);

      expect(event).not.toBeNull();
      expect(event!.fromTier).toBe('short-term');
      expect(event!.toTier).toBe('working');
      expect(event!.reason).toContain('promoted');
    });

    it('should promote pattern from working to long-term tier', () => {
      const pattern = createPattern({ tier: 'working' });
      const metrics = createMetrics({
        successCount: 30,
        successRate: 0.85,
        qualityScore: 0.8,
        ageDays: 35,
      });

      const event = manager.evaluatePromotion(pattern, metrics);

      expect(event).not.toBeNull();
      expect(event!.fromTier).toBe('working');
      expect(event!.toTier).toBe('long-term');
    });

    it('should promote pattern from long-term to permanent tier', () => {
      const pattern = createPattern({ tier: 'long-term' });
      const metrics = createMetrics({
        successCount: 100,
        successRate: 0.95,
        qualityScore: 0.9,
        ageDays: 100,
      });

      const event = manager.evaluatePromotion(pattern, metrics);

      expect(event).not.toBeNull();
      expect(event!.fromTier).toBe('long-term');
      expect(event!.toTier).toBe('permanent');
    });

    it('should not promote pattern at highest tier', () => {
      const pattern = createPattern({ tier: 'permanent' });
      const metrics = createMetrics({
        successCount: 200,
        successRate: 0.99,
        qualityScore: 0.95,
        ageDays: 365,
      });

      const event = manager.evaluatePromotion(pattern, metrics);

      expect(event).toBeNull();
    });

    it('should not promote pattern with insufficient metrics', () => {
      const pattern = createPattern({ tier: 'short-term' });
      const metrics = createMetrics({
        successCount: 3, // Too low
        successRate: 0.5, // Too low
        qualityScore: 0.4, // Too low
        ageDays: 2, // Too young
      });

      const event = manager.evaluatePromotion(pattern, metrics);

      expect(event).toBeNull();
    });
  });

  describe('evaluateDemotion', () => {
    it('should demote pattern with low recent success rate', () => {
      const pattern = createPattern({ tier: 'long-term' });
      const metrics = createMetrics({
        recentSuccessRate: 0.3, // Below 0.4 threshold
        recentFailureCount: 6,
        qualityScore: 0.5,
      });

      const event = manager.evaluateDemotion(pattern, metrics);

      expect(event).not.toBeNull();
      expect(event!.fromTier).toBe('long-term');
      expect(event!.toTier).toBe('working');
      expect(event!.reason).toContain('low recent success rate');
    });

    it('should demote pattern with many recent failures', () => {
      const pattern = createPattern({ tier: 'working' });
      const metrics = createMetrics({
        recentSuccessRate: 0.5,
        recentFailureCount: 7, // >= 5 threshold
        qualityScore: 0.6,
      });

      const event = manager.evaluateDemotion(pattern, metrics);

      expect(event).not.toBeNull();
      expect(event!.fromTier).toBe('working');
      expect(event!.toTier).toBe('short-term');
      expect(event!.reason).toContain('recent failures');
    });

    it('should demote pattern with low quality score', () => {
      const pattern = createPattern({ tier: 'long-term' });
      const metrics = createMetrics({
        recentSuccessRate: 0.6,
        recentFailureCount: 2,
        qualityScore: 0.2, // Below 0.3 threshold
      });

      const event = manager.evaluateDemotion(pattern, metrics);

      expect(event).not.toBeNull();
      expect(event!.reason).toContain('low quality score');
    });

    it('should not demote pattern at lowest tier', () => {
      const pattern = createPattern({ tier: 'short-term' });
      const metrics = createMetrics({
        recentSuccessRate: 0.1,
        recentFailureCount: 10,
        qualityScore: 0.1,
      });

      const event = manager.evaluateDemotion(pattern, metrics);

      expect(event).toBeNull();
    });

    it('should not demote pattern with good metrics', () => {
      const pattern = createPattern({ tier: 'long-term' });
      const metrics = createMetrics({
        recentSuccessRate: 0.85,
        recentFailureCount: 1,
        qualityScore: 0.8,
      });

      const event = manager.evaluateDemotion(pattern, metrics);

      expect(event).toBeNull();
    });

    it('should respect autoDemote config', () => {
      const noAutoDemoteManager = createPatternPromotionManager({ autoDemote: false });
      const pattern = createPattern({ tier: 'long-term' });
      const metrics = createMetrics({
        recentSuccessRate: 0.1,
        recentFailureCount: 10,
        qualityScore: 0.1,
      });

      const event = noAutoDemoteManager.evaluateDemotion(pattern, metrics);

      expect(event).toBeNull();
    });
  });

  describe('processPatternChange', () => {
    it('should prioritize demotion over promotion', async () => {
      const pattern = createPattern({ tier: 'working' });
      const metrics = createMetrics({
        // Meets promotion criteria
        successCount: 30,
        successRate: 0.85,
        qualityScore: 0.8,
        ageDays: 35,
        // But also meets demotion criteria
        recentSuccessRate: 0.2,
        recentFailureCount: 8,
      });

      const result = await manager.processPatternChange(pattern, metrics);

      expect(result.action).toBe('demoted');
    });

    it('should return unchanged when no criteria met', async () => {
      const pattern = createPattern({ tier: 'working' });
      const metrics = createMetrics({
        successCount: 5, // Not enough for promotion to long-term (requires 10)
        successRate: 0.65, // Below long-term threshold (0.75)
        qualityScore: 0.55, // Below long-term threshold (0.7)
        ageDays: 5, // Below long-term threshold (7 days)
        recentSuccessRate: 0.8, // Good enough to avoid demotion
        recentFailureCount: 1,
      });

      const result = await manager.processPatternChange(pattern, metrics);

      expect(result.action).toBe('unchanged');
      expect(result.event).toBeUndefined();
    });
  });

  describe('criteria management', () => {
    it('should return criteria for a tier', () => {
      const criteria = manager.getCriteria('working');

      expect(criteria.minSuccessCount).toBeDefined();
      expect(criteria.minSuccessRate).toBeDefined();
      expect(criteria.minQualityScore).toBeDefined();
      expect(criteria.minAgeDays).toBeDefined();
    });

    it('should allow updating criteria', () => {
      manager.updateCriteria('working', { minSuccessCount: 15 });
      const criteria = manager.getCriteria('working');

      expect(criteria.minSuccessCount).toBe(15);
    });

    it('should return all criteria', () => {
      const allCriteria = manager.getAllCriteria();

      expect(allCriteria['short-term']).toBeDefined();
      expect(allCriteria['working']).toBeDefined();
      expect(allCriteria['long-term']).toBeDefined();
      expect(allCriteria['permanent']).toBeDefined();
    });
  });

  describe('history tracking', () => {
    it('should track promotion history', () => {
      const pattern = createPattern({ tier: 'short-term' });
      const metrics = createMetrics({
        successCount: 10,
        successRate: 0.75,
        qualityScore: 0.7,
        ageDays: 10,
      });

      manager.evaluatePromotion(pattern, metrics);
      const history = manager.getPromotionHistory();

      expect(history.length).toBe(1);
      expect(history[0].fromTier).toBe('short-term');
      expect(history[0].toTier).toBe('working');
    });

    it('should track demotion history', () => {
      const pattern = createPattern({ tier: 'working' });
      const metrics = createMetrics({
        recentSuccessRate: 0.2,
        recentFailureCount: 8,
        qualityScore: 0.2,
      });

      manager.evaluateDemotion(pattern, metrics);
      const history = manager.getDemotionHistory();

      expect(history.length).toBe(1);
      expect(history[0].fromTier).toBe('working');
      expect(history[0].toTier).toBe('short-term');
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', () => {
      // Add some promotions
      for (let i = 0; i < 3; i++) {
        manager.evaluatePromotion(
          createPattern({ id: `promo-${i}`, tier: 'short-term' }),
          createMetrics({ patternId: `promo-${i}`, successCount: 10, successRate: 0.75, qualityScore: 0.7, ageDays: 10 })
        );
      }

      // Add some demotions
      for (let i = 0; i < 2; i++) {
        manager.evaluateDemotion(
          createPattern({ id: `demo-${i}`, tier: 'working' }),
          createMetrics({ patternId: `demo-${i}`, recentSuccessRate: 0.2, recentFailureCount: 8, qualityScore: 0.2 })
        );
      }

      const stats = manager.getStats();

      expect(stats.totalPromotions).toBe(3);
      expect(stats.totalDemotions).toBe(2);
      expect(stats.promotionsByTier['working']).toBe(3);
      expect(stats.demotionsByTier['short-term']).toBe(2);
    });
  });

  describe('export/import', () => {
    it('should export and import history', () => {
      // Add promotion
      manager.evaluatePromotion(
        createPattern({ tier: 'short-term' }),
        createMetrics({ successCount: 10, successRate: 0.75, qualityScore: 0.7, ageDays: 10 })
      );

      // Add demotion
      manager.evaluateDemotion(
        createPattern({ tier: 'working' }),
        createMetrics({ recentSuccessRate: 0.2, recentFailureCount: 8, qualityScore: 0.2 })
      );

      const history = manager.exportHistory();

      // Create new manager and import
      const newManager = createPatternPromotionManager();
      newManager.importHistory(history);

      const stats = newManager.getStats();
      expect(stats.totalPromotions).toBe(1);
      expect(stats.totalDemotions).toBe(1);
    });
  });

  describe('clearHistory', () => {
    it('should clear all history', () => {
      manager.evaluatePromotion(
        createPattern({ tier: 'short-term' }),
        createMetrics({ successCount: 10, successRate: 0.75, qualityScore: 0.7, ageDays: 10 })
      );

      manager.clearHistory();
      const stats = manager.getStats();

      expect(stats.totalPromotions).toBe(0);
      expect(stats.totalDemotions).toBe(0);
    });
  });
});
