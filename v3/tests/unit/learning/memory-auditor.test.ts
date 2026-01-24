/**
 * Unit tests for Memory Coherence Auditor
 * ADR-052 Phase 3 Action A3.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryCoherenceAuditor,
  createMemoryAuditor,
  DEFAULT_AUDITOR_CONFIG,
  type MemoryAuditResult,
  type PatternHotspot,
  type AuditRecommendation,
} from '../../../src/learning/memory-auditor.js';
import type { CoherenceService, CoherenceResult } from '../../../src/integrations/coherence/index.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import type { EventBus } from '../../../src/kernel/interfaces.js';

describe('MemoryCoherenceAuditor', () => {
  let mockCoherenceService: CoherenceService;
  let mockEventBus: EventBus;
  let auditor: MemoryCoherenceAuditor;

  // Sample test patterns
  const createTestPattern = (
    id: string,
    domain: string,
    qualityScore: number,
    usageCount: number,
    successRate: number
  ): QEPattern => ({
    id,
    patternType: 'test-template',
    qeDomain: domain as any,
    domain: domain as any,
    name: `Pattern ${id}`,
    description: `Test pattern ${id}`,
    confidence: 0.8,
    usageCount,
    successRate,
    qualityScore,
    context: {
      language: 'typescript',
      framework: 'vitest',
      testType: 'unit',
      tags: ['test', 'pattern'],
    },
    template: {
      type: 'code',
      content: 'test code',
      variables: [],
    },
    embedding: Array(64).fill(0).map(() => Math.random()),
    tier: 'short-term',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    successfulUses: 5,
    reusable: true,
    reuseCount: 0,
    averageTokenSavings: 0,
  });

  beforeEach(() => {
    // Mock coherence service
    mockCoherenceService = {
      checkCoherence: vi.fn().mockResolvedValue({
        energy: 0.3,
        isCoherent: true,
        lane: 'reflex',
        contradictions: [],
        recommendations: [],
        durationMs: 10,
        usedFallback: false,
      } as CoherenceResult),
      isInitialized: vi.fn().mockReturnValue(true),
    } as any;

    // Mock event bus
    mockEventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as any;

    auditor = createMemoryAuditor(mockCoherenceService, mockEventBus);
  });

  describe('auditPatterns', () => {
    it('should audit patterns and return results', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
        createTestPattern('p2', 'test-generation', 0.7, 8, 0.85),
        createTestPattern('p3', 'coverage-analysis', 0.9, 15, 0.95),
      ];

      const result = await auditor.auditPatterns(patterns);

      expect(result).toBeDefined();
      expect(result.totalPatterns).toBe(3);
      expect(result.scannedPatterns).toBe(3);
      expect(result.globalEnergy).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory:audit_started',
        })
      );
    });

    it('should detect high-energy hotspots', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
        createTestPattern('p2', 'test-generation', 0.7, 8, 0.85),
      ];

      // Mock high energy response
      vi.mocked(mockCoherenceService.checkCoherence).mockResolvedValue({
        energy: 0.8, // Above hotspot threshold
        isCoherent: false,
        lane: 'human',
        contradictions: [
          {
            nodeIds: ['p1', 'p2'],
            severity: 'high',
            description: 'Test contradiction',
            confidence: 0.9,
          },
        ],
        recommendations: ['Review patterns'],
        durationMs: 10,
        usedFallback: false,
      });

      const result = await auditor.auditPatterns(patterns);

      expect(result.contradictionCount).toBeGreaterThan(0);
      expect(result.globalEnergy).toBeGreaterThan(0.6);
      expect(result.hotspots.length).toBeGreaterThan(0);
    });

    it('should emit audit events', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
      ];

      await auditor.auditPatterns(patterns);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory:audit_started',
          source: 'learning-optimization',
        })
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory:audit_completed',
          source: 'learning-optimization',
        })
      );
    });

    it('should handle audit failures gracefully', async () => {
      // Need multiple patterns in same domain to trigger coherence check
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
        createTestPattern('p2', 'test-generation', 0.7, 8, 0.85),
      ];

      vi.mocked(mockCoherenceService.checkCoherence).mockRejectedValue(
        new Error('Coherence check failed')
      );

      await expect(auditor.auditPatterns(patterns)).rejects.toThrow('Coherence check failed');

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory:audit_failed',
        })
      );
    });
  });

  describe('identifyHotspots', () => {
    it('should identify domains with high energy', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
        createTestPattern('p2', 'test-generation', 0.7, 8, 0.85),
      ];

      vi.mocked(mockCoherenceService.checkCoherence).mockResolvedValue({
        energy: 0.7, // Above hotspot threshold
        isCoherent: false,
        lane: 'heavy',
        contradictions: [],
        recommendations: [],
        durationMs: 10,
        usedFallback: false,
      });

      const hotspots = await auditor.identifyHotspots(patterns);

      expect(hotspots).toHaveLength(1);
      expect(hotspots[0].domain).toBe('test-generation');
      expect(hotspots[0].energy).toBeGreaterThan(0.6);
      expect(hotspots[0].patternIds).toContain('p1');
      expect(hotspots[0].patternIds).toContain('p2');
    });

    it('should skip single-pattern domains', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
        createTestPattern('p2', 'coverage-analysis', 0.7, 8, 0.85),
      ];

      const hotspots = await auditor.identifyHotspots(patterns);

      // No hotspots because each domain has only 1 pattern
      expect(mockCoherenceService.checkCoherence).not.toHaveBeenCalled();
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend merging duplicate patterns', async () => {
      // Create patterns with identical normalized names/descriptions
      const p1 = createTestPattern('p1', 'test-generation', 0.8, 10, 0.9);
      const p2 = createTestPattern('p2', 'test-generation', 0.7, 8, 0.85);

      // Make p2 a duplicate of p1 by using same name/description
      const patterns: QEPattern[] = [
        p1,
        { ...p2, name: p1.name, description: p1.description },
      ];

      const hotspots: PatternHotspot[] = [
        {
          domain: 'test-generation',
          patternIds: ['p1', 'p2'],
          energy: 0.7,
          description: 'High energy in test-generation',
        },
      ];

      const recommendations = await auditor.generateRecommendations(hotspots, patterns);

      // Should have recommendations
      expect(recommendations.length).toBeGreaterThan(0);

      // Should recommend merging duplicates
      const mergeRec = recommendations.find(r => r.type === 'merge');
      expect(mergeRec).toBeDefined();
    });

    it('should recommend removing outdated patterns', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.3, 2, 0.3), // Low usage, low success
        createTestPattern('p2', 'test-generation', 0.8, 10, 0.9),
      ];

      const hotspots: PatternHotspot[] = [
        {
          domain: 'test-generation',
          patternIds: ['p1', 'p2'],
          energy: 0.5,
          description: 'Moderate energy',
        },
      ];

      const recommendations = await auditor.generateRecommendations(hotspots, patterns);

      const removeRec = recommendations.find(r => r.type === 'remove');
      expect(removeRec).toBeDefined();
      expect(removeRec?.patternIds).toContain('p1');
    });

    it('should recommend reviewing critical energy patterns', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
      ];

      const hotspots: PatternHotspot[] = [
        {
          domain: 'test-generation',
          patternIds: ['p1'],
          energy: 0.8, // Critical energy
          description: 'Critical energy',
        },
      ];

      const recommendations = await auditor.generateRecommendations(hotspots, patterns);

      const reviewRec = recommendations.find(r => r.type === 'review');
      expect(reviewRec).toBeDefined();
      expect(reviewRec?.priority).toBe('high');
    });

    it('should limit recommendations to maxRecommendations', async () => {
      const patterns: QEPattern[] = Array(20)
        .fill(null)
        .map((_, i) => createTestPattern(`p${i}`, 'test-generation', 0.5, 3, 0.4));

      const hotspots: PatternHotspot[] = [
        {
          domain: 'test-generation',
          patternIds: patterns.map(p => p.id),
          energy: 0.8,
          description: 'Many patterns',
        },
      ];

      const recommendations = await auditor.generateRecommendations(hotspots, patterns);

      expect(recommendations.length).toBeLessThanOrEqual(DEFAULT_AUDITOR_CONFIG.maxRecommendations);
    });
  });

  describe('runBackgroundAudit', () => {
    it('should run background audit without blocking', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
      ];

      const patternSource = vi.fn().mockResolvedValue(patterns);

      await auditor.runBackgroundAudit(patternSource);

      expect(patternSource).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory:audit_progress',
        })
      );
    });

    it('should skip if audit already in progress', async () => {
      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
      ];

      const slowSource = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(patterns), 100))
      );

      // Start first audit (don't await)
      const promise1 = auditor.runBackgroundAudit(slowSource);

      // Try to start second audit immediately
      await auditor.runBackgroundAudit(slowSource);

      // Wait for first to complete
      await promise1;

      // Source should only be called once
      expect(slowSource).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in background audit', async () => {
      const errorSource = vi.fn().mockRejectedValue(new Error('Source failed'));

      await auditor.runBackgroundAudit(errorSource);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory:audit_progress',
          payload: expect.objectContaining({
            status: 'failed',
          }),
        })
      );
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customConfig = {
        batchSize: 100,
        energyThreshold: 0.5,
        hotspotThreshold: 0.7,
        maxRecommendations: 20,
      };

      const customAuditor = createMemoryAuditor(
        mockCoherenceService,
        mockEventBus,
        customConfig
      );

      expect(customAuditor).toBeInstanceOf(MemoryCoherenceAuditor);
    });

    it('should work without event bus', async () => {
      const auditorNoEvents = createMemoryAuditor(mockCoherenceService);

      const patterns: QEPattern[] = [
        createTestPattern('p1', 'test-generation', 0.8, 10, 0.9),
      ];

      const result = await auditorNoEvents.auditPatterns(patterns);

      expect(result).toBeDefined();
      expect(result.totalPatterns).toBe(1);
    });
  });
});
