/**
 * QuantizationManager tests
 */

import { QuantizationManager, type AgentProfile } from '../../../src/core/quantization';

describe('QuantizationManager', () => {
  beforeEach(() => {
    QuantizationManager.clearMetrics();
  });

  describe('getRecommendation', () => {
    it('should recommend "none" for critical accuracy', () => {
      const profile: AgentProfile = {
        vectorCount: 50000,
        accuracyPriority: 'critical'
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('none');
      expect(recommendation.reason).toContain('Critical accuracy');
    });

    it('should recommend "binary" for mobile deployment', () => {
      const profile: AgentProfile = {
        vectorCount: 50000,
        deployment: 'mobile'
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('binary');
      expect(recommendation.expectedBenefits.memoryReduction).toContain('32x');
    });

    it('should recommend "binary" for edge deployment', () => {
      const profile: AgentProfile = {
        vectorCount: 50000,
        deployment: 'edge'
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('binary');
    });

    it('should recommend "binary" for low memory constraint', () => {
      const profile: AgentProfile = {
        vectorCount: 50000,
        memoryConstraint: 'low'
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('binary');
    });

    it('should recommend "product" for large scale (>1M vectors)', () => {
      const profile: AgentProfile = {
        vectorCount: 1500000
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('product');
      expect(recommendation.reason).toContain('Large-scale');
    });

    it('should recommend "scalar" for medium scale (10K-1M)', () => {
      const profile: AgentProfile = {
        vectorCount: 50000
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('scalar');
      expect(recommendation.expectedBenefits.memoryReduction).toContain('4x');
    });

    it('should recommend "none" for small scale (<10K)', () => {
      const profile: AgentProfile = {
        vectorCount: 5000
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('none');
    });

    it('should recommend "binary" for high speed priority', () => {
      const profile: AgentProfile = {
        vectorCount: 50000,
        speedPriority: 'critical'
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('binary');
    });

    it('should recommend "product" for high speed + large scale', () => {
      const profile: AgentProfile = {
        vectorCount: 200000,
        speedPriority: 'critical'
      };

      const recommendation = QuantizationManager.getRecommendation(profile);
      expect(recommendation.type).toBe('product');
    });
  });

  describe('calculateMemoryUsage', () => {
    it('should calculate correct memory for "none" quantization', () => {
      const result = QuantizationManager.calculateMemoryUsage(10000, 768, 'none');

      // 10000 vectors * 768 dimensions * 4 bytes (float32) = 30,720,000 bytes = ~29.3 MB
      expect(result.bytesPerVector).toBe(768 * 4);
      expect(result.totalMB).toBeCloseTo(29.3, 1);
      expect(result.reduction).toBe('none');
    });

    it('should calculate correct memory for "scalar" quantization', () => {
      const result = QuantizationManager.calculateMemoryUsage(10000, 768, 'scalar');

      // 10000 vectors * 768 dimensions * 1 byte (uint8) = 7,680,000 bytes = ~7.3 MB (4x reduction)
      expect(result.bytesPerVector).toBe(768);
      expect(result.totalMB).toBeCloseTo(7.3, 1);
      expect(result.reduction).toBe('4x');
    });

    it('should calculate correct memory for "binary" quantization', () => {
      const result = QuantizationManager.calculateMemoryUsage(10000, 768, 'binary');

      // 10000 vectors * ceil(768/8) = 10000 * 96 = 960,000 bytes = ~0.92 MB (32x reduction)
      expect(result.bytesPerVector).toBe(96);
      expect(result.totalMB).toBeCloseTo(0.92, 1);
      expect(result.reduction).toBe('32x');
    });

    it('should calculate correct memory for "product" quantization', () => {
      const result = QuantizationManager.calculateMemoryUsage(10000, 768, 'product');

      // 10000 vectors * ceil(768/16) = 10000 * 48 = 480,000 bytes = ~0.46 MB (16x reduction)
      expect(result.bytesPerVector).toBe(48);
      expect(result.totalMB).toBeCloseTo(0.46, 1);
      expect(result.reduction).toBe('16x');
    });

    it('should handle different vector dimensions', () => {
      const result = QuantizationManager.calculateMemoryUsage(1000, 1536, 'scalar');
      expect(result.bytesPerVector).toBe(1536);
    });
  });

  describe('recordMetrics and getMetrics', () => {
    it('should record and retrieve metrics for an agent', () => {
      const metrics = {
        type: 'scalar' as const,
        memoryReduction: 4,
        estimatedAccuracyLoss: 1.5,
        searchSpeedIncrease: 3,
        memoryUsageMB: 7.3,
        vectorCount: 10000,
        timestamp: new Date()
      };

      QuantizationManager.recordMetrics('agent-1', metrics);
      const retrieved = QuantizationManager.getMetrics('agent-1');

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]).toEqual(metrics);
    });

    it('should keep only last 100 metrics per agent', () => {
      for (let i = 0; i < 150; i++) {
        QuantizationManager.recordMetrics('agent-1', {
          type: 'scalar',
          memoryReduction: 4,
          estimatedAccuracyLoss: 1,
          searchSpeedIncrease: 3,
          memoryUsageMB: 7,
          vectorCount: 10000,
          timestamp: new Date()
        });
      }

      const metrics = QuantizationManager.getMetrics('agent-1');
      expect(metrics).toHaveLength(100);
    });

    it('should return empty array for unknown agent', () => {
      const metrics = QuantizationManager.getMetrics('unknown');
      expect(metrics).toEqual([]);
    });
  });

  describe('getAggregatedMetrics', () => {
    it('should aggregate metrics across agents', () => {
      QuantizationManager.recordMetrics('agent-1', {
        type: 'scalar',
        memoryReduction: 4,
        estimatedAccuracyLoss: 1,
        searchSpeedIncrease: 3,
        memoryUsageMB: 7.3,
        vectorCount: 10000,
        timestamp: new Date()
      });

      QuantizationManager.recordMetrics('agent-2', {
        type: 'binary',
        memoryReduction: 32,
        estimatedAccuracyLoss: 3,
        searchSpeedIncrease: 10,
        memoryUsageMB: 0.92,
        vectorCount: 10000,
        timestamp: new Date()
      });

      const aggregated = QuantizationManager.getAggregatedMetrics();

      expect(aggregated.totalVectors).toBe(20000);
      expect(aggregated.totalMemoryMB).toBeCloseTo(8.22, 2);
      expect(aggregated.averageMemoryReduction).toBe(18); // (4 + 32) / 2
      expect(aggregated.quantizationTypes.scalar).toBe(1);
      expect(aggregated.quantizationTypes.binary).toBe(1);
    });

    it('should return zeros when no metrics exist', () => {
      const aggregated = QuantizationManager.getAggregatedMetrics();

      expect(aggregated.totalVectors).toBe(0);
      expect(aggregated.totalMemoryMB).toBe(0);
      expect(aggregated.averageMemoryReduction).toBe(1);
    });
  });

  describe('compareQuantizationTypes', () => {
    it('should compare all quantization types', () => {
      const comparison = QuantizationManager.compareQuantizationTypes(50000, 768);

      expect(comparison).toHaveLength(4);
      expect(comparison.map(c => c.type)).toEqual(['none', 'scalar', 'binary', 'product']);

      // Verify scalar is recommended for 50K vectors
      const scalarItem = comparison.find(c => c.type === 'scalar');
      expect(scalarItem?.recommended).toBe(true);

      // Verify memory calculations
      const noneItem = comparison.find(c => c.type === 'none');
      const binaryItem = comparison.find(c => c.type === 'binary');

      expect(noneItem?.memoryMB).toBeGreaterThan(binaryItem?.memoryMB || 0);
    });

    it('should mark correct recommendation', () => {
      const smallScale = QuantizationManager.compareQuantizationTypes(5000, 768);
      const noneRecommended = smallScale.find(c => c.type === 'none');
      expect(noneRecommended?.recommended).toBe(true);

      const largeScale = QuantizationManager.compareQuantizationTypes(1500000, 768);
      const productRecommended = largeScale.find(c => c.type === 'product');
      expect(productRecommended?.recommended).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('should generate formatted report', () => {
      QuantizationManager.recordMetrics('agent-1', {
        type: 'scalar',
        memoryReduction: 4,
        estimatedAccuracyLoss: 1,
        searchSpeedIncrease: 3,
        memoryUsageMB: 7.3,
        vectorCount: 10000,
        timestamp: new Date()
      });

      const report = QuantizationManager.generateReport();

      expect(report).toContain('VECTOR QUANTIZATION REPORT');
      expect(report).toContain('AGGREGATE METRICS');
      expect(report).toContain('10,000');
      expect(report).toContain('7.30 MB');
      expect(report).toContain('Scalar (4x):           1 agents');
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      QuantizationManager.recordMetrics('agent-1', {
        type: 'scalar',
        memoryReduction: 4,
        estimatedAccuracyLoss: 1,
        searchSpeedIncrease: 3,
        memoryUsageMB: 7,
        vectorCount: 10000,
        timestamp: new Date()
      });

      QuantizationManager.clearMetrics();

      const metrics = QuantizationManager.getMetrics('agent-1');
      expect(metrics).toEqual([]);

      const aggregated = QuantizationManager.getAggregatedMetrics();
      expect(aggregated.totalVectors).toBe(0);
    });
  });
});
