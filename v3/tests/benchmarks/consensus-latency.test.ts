/**
 * Consensus Latency Benchmarks
 * Measures multi-model consensus verification performance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
} from '../../src/coordination/mixins/consensus-enabled-domain';
import {
  createDomainFinding,
  type DomainFinding,
  type FindingSeverity,
} from '../../src/coordination/consensus/domain-findings';
import { v4 as uuidv4 } from 'uuid';

describe('Consensus Latency Benchmarks', () => {
  let mixin: ConsensusEnabledMixin;

  beforeEach(() => {
    mixin = createConsensusEnabledMixin({
      enableConsensus: true,
      consensusThreshold: 0.7,
      verifyFindingTypes: ['benchmark-finding'],
      strategy: 'weighted',
      minModels: 2,
      modelTimeout: 5000,
    });
  });

  describe('Finding Creation', () => {
    it('should create 1000 findings in <50ms', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        createDomainFinding({
          id: uuidv4(),
          type: 'benchmark-finding',
          confidence: 0.85,
          description: `Benchmark finding ${i}`,
          payload: { index: i, data: 'test' },
          detectedBy: 'benchmark',
          severity: 'medium',
        });
      }
      const elapsed = performance.now() - start;

      console.log(`Create 1000 findings: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(50);
    });

    it('should create findings with various severities efficiently', () => {
      const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
      const start = performance.now();

      for (let i = 0; i < 5000; i++) {
        createDomainFinding({
          id: uuidv4(),
          type: 'security-vulnerability',
          confidence: Math.random(),
          description: `Finding with severity ${severities[i % 5]}`,
          payload: { test: true },
          detectedBy: 'scanner',
          severity: severities[i % 5],
        });
      }

      const elapsed = performance.now() - start;
      console.log(`Create 5000 findings with varying severities: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(200);
    });

    it('should handle complex payloads efficiently', () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        createDomainFinding({
          id: uuidv4(),
          type: 'defect-prediction',
          confidence: 0.92,
          description: 'Complex payload finding',
          payload: {
            file: `src/module-${i}/component.ts`,
            probability: Math.random(),
            factors: [
              { name: 'complexity', weight: 0.3, value: 25 },
              { name: 'churn', weight: 0.25, value: 15 },
              { name: 'coverage', weight: 0.2, value: 60 },
              { name: 'age', weight: 0.15, value: 120 },
              { name: 'authors', weight: 0.1, value: 3 },
            ],
            history: {
              defectCount: Math.floor(Math.random() * 10),
              lastDefectDate: new Date(),
            },
            metadata: {
              analyzedAt: new Date(),
              model: 'defect-predictor-v2',
              features: Array(20).fill(0).map(() => Math.random()),
            },
          },
          detectedBy: 'defect-intelligence',
          severity: 'high',
          context: {
            analysisRun: `run-${i}`,
            projectId: 'test-project',
          },
        });
      }

      const elapsed = performance.now() - start;
      console.log(`Create 1000 findings with complex payloads: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Consensus Check', () => {
    it('should check requiresConsensus 10000 times in <100ms', () => {
      const finding = createDomainFinding({
        id: uuidv4(),
        type: 'benchmark-finding',
        confidence: 0.85,
        description: 'Benchmark finding',
        payload: { test: true },
        detectedBy: 'benchmark',
        severity: 'medium',
      });

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        mixin.requiresConsensus(finding);
      }
      const elapsed = performance.now() - start;

      console.log(`requiresConsensus x10000: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(100);
    });

    it('should correctly filter by finding type', () => {
      const matching = createDomainFinding({
        id: uuidv4(),
        type: 'benchmark-finding', // Matches config
        confidence: 0.85,
        description: 'Should require consensus',
        payload: {},
        detectedBy: 'benchmark',
        severity: 'high',
      });

      const nonMatching = createDomainFinding({
        id: uuidv4(),
        type: 'other-finding', // Does not match
        confidence: 0.85,
        description: 'Should not require consensus',
        payload: {},
        detectedBy: 'benchmark',
        severity: 'high',
      });

      // requiresConsensus checks config and finding properties, not engine state
      // Engine state is only checked when actually calling verifyFinding
      expect(mixin.requiresConsensus(matching)).toBe(true); // Matches type + threshold
      expect(mixin.requiresConsensus(nonMatching)).toBe(false); // Type doesn't match
    });

    it('should evaluate high-confidence findings efficiently', () => {
      const findings = Array.from({ length: 1000 }, (_, i) =>
        createDomainFinding({
          id: uuidv4(),
          type: 'benchmark-finding',
          confidence: 0.5 + Math.random() * 0.5, // 0.5-1.0 range
          description: `High confidence finding ${i}`,
          payload: { index: i },
          detectedBy: 'benchmark',
          severity: i % 2 === 0 ? 'high' : 'medium',
        })
      );

      const start = performance.now();
      let requiresCount = 0;
      for (const finding of findings) {
        if (mixin.requiresConsensus(finding)) {
          requiresCount++;
        }
      }
      const elapsed = performance.now() - start;

      console.log(`Evaluate 1000 findings: ${elapsed.toFixed(3)}ms (${requiresCount} require consensus)`);
      expect(elapsed).toBeLessThan(20);
    });

    it('should handle severity-based filtering efficiently', () => {
      const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

      // Create mixin with specific severity filter
      const severityMixin = createConsensusEnabledMixin({
        enableConsensus: true,
        consensusThreshold: 0.5,
        verifyFindingTypes: [],
        strategy: 'majority',
        minModels: 2,
        modelTimeout: 30000,
        verifySeverities: ['critical', 'high'],
      });

      const findings = Array.from({ length: 5000 }, (_, i) =>
        createDomainFinding({
          id: uuidv4(),
          type: 'vulnerability',
          confidence: Math.random(),
          description: `Severity test ${i}`,
          payload: {},
          detectedBy: 'scanner',
          severity: severities[i % 5],
        })
      );

      const start = performance.now();
      let criticalHighCount = 0;
      for (const finding of findings) {
        if (severityMixin.requiresConsensus(finding)) {
          criticalHighCount++;
        }
      }
      const elapsed = performance.now() - start;

      console.log(`Severity filter 5000 findings: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Configuration Performance', () => {
    it('should create 100 mixin instances in <20ms', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        createConsensusEnabledMixin({
          enableConsensus: true,
          consensusThreshold: 0.7,
          verifyFindingTypes: ['type-a', 'type-b'],
          strategy: 'majority',
          minModels: 2,
          modelTimeout: 30000,
        });
      }
      const elapsed = performance.now() - start;

      console.log(`Create 100 mixins: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(20);
    });

    it('should handle configuration with many finding types', () => {
      const manyTypes = Array.from({ length: 100 }, (_, i) => `finding-type-${i}`);

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        createConsensusEnabledMixin({
          enableConsensus: true,
          consensusThreshold: 0.7,
          verifyFindingTypes: manyTypes,
          strategy: 'weighted',
          minModels: 3,
          modelTimeout: 60000,
        });
      }
      const elapsed = performance.now() - start;

      console.log(`Create 100 mixins with 100 finding types each: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(30);
    });
  });

  describe('Memory Usage', () => {
    it('should handle batch finding storage efficiently', () => {
      const findings: DomainFinding<Record<string, unknown>>[] = [];
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 10000; i++) {
        findings.push(
          createDomainFinding({
            id: uuidv4(),
            type: 'benchmark-finding',
            confidence: Math.random(),
            description: `Finding ${i} with some description text`,
            payload: { index: i, nested: { data: 'value' } },
            detectedBy: 'benchmark',
            severity: (['low', 'medium', 'high', 'critical'] as FindingSeverity[])[i % 4],
          })
        );
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryPerFinding = (finalMemory - initialMemory) / 10000;

      console.log(`Memory per finding: ${memoryPerFinding.toFixed(0)} bytes`);
      console.log(`Total for 10000: ${((finalMemory - initialMemory) / 1024 / 1024).toFixed(2)}MB`);

      // Each finding should use less than 2KB
      expect(memoryPerFinding).toBeLessThan(2048);
    });

    it('should handle mixin instance memory efficiently', () => {
      const mixins: ConsensusEnabledMixin[] = [];
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 1000; i++) {
        mixins.push(
          createConsensusEnabledMixin({
            enableConsensus: true,
            consensusThreshold: 0.7,
            verifyFindingTypes: [`type-${i}`],
            strategy: 'weighted',
            minModels: 2,
            modelTimeout: 30000,
          })
        );
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryPerMixin = (finalMemory - initialMemory) / 1000;

      console.log(`Memory per mixin: ${memoryPerMixin.toFixed(0)} bytes`);
      console.log(`Total for 1000: ${((finalMemory - initialMemory) / 1024 / 1024).toFixed(2)}MB`);

      // Each mixin should use less than 4KB
      expect(memoryPerMixin).toBeLessThan(4096);
    });
  });

  describe('Batch Operations', () => {
    it('should process batch of 1000 findings with requiresConsensus check in <50ms', () => {
      const findings = Array.from({ length: 1000 }, (_, i) =>
        createDomainFinding({
          id: uuidv4(),
          type: i % 2 === 0 ? 'benchmark-finding' : 'other-finding',
          confidence: Math.random(),
          description: `Batch finding ${i}`,
          payload: { index: i },
          detectedBy: 'batch-processor',
          severity: (['low', 'medium', 'high', 'critical'] as FindingSeverity[])[i % 4],
        })
      );

      const start = performance.now();
      const results = findings.map((f) => ({
        id: f.id,
        requires: mixin.requiresConsensus(f),
      }));
      const elapsed = performance.now() - start;

      const requiresCount = results.filter((r) => r.requires).length;
      console.log(`Batch process 1000 findings: ${elapsed.toFixed(3)}ms (${requiresCount} require consensus)`);
      expect(elapsed).toBeLessThan(50);
    });

    it('should handle parallel mixin checks efficiently', () => {
      // Create multiple mixins with different configs
      const mixins = [
        createConsensusEnabledMixin({
          enableConsensus: true,
          verifyFindingTypes: ['security'],
          verifySeverities: ['critical'],
        }),
        createConsensusEnabledMixin({
          enableConsensus: true,
          verifyFindingTypes: ['quality'],
          verifySeverities: ['high', 'critical'],
        }),
        createConsensusEnabledMixin({
          enableConsensus: true,
          verifyFindingTypes: ['coverage'],
          verifySeverities: ['medium', 'high', 'critical'],
        }),
      ];

      const finding = createDomainFinding({
        id: uuidv4(),
        type: 'security',
        confidence: 0.9,
        description: 'Critical security finding',
        payload: {},
        detectedBy: 'security-scanner',
        severity: 'critical',
      });

      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        mixins.forEach((m) => m.requiresConsensus(finding));
      }
      const elapsed = performance.now() - start;

      console.log(`${iterations} iterations across 3 mixins: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('Strategy Comparison', () => {
    it('should create mixins with different strategies efficiently', () => {
      const strategies: Array<'majority' | 'weighted' | 'unanimous'> = [
        'majority',
        'weighted',
        'unanimous',
      ];

      const start = performance.now();
      const mixinsByStrategy: Record<string, ConsensusEnabledMixin> = {};

      for (const strategy of strategies) {
        for (let i = 0; i < 100; i++) {
          mixinsByStrategy[`${strategy}-${i}`] = createConsensusEnabledMixin({
            enableConsensus: true,
            consensusThreshold: 0.7,
            verifyFindingTypes: ['finding'],
            strategy,
            minModels: strategy === 'unanimous' ? 3 : 2,
            modelTimeout: 30000,
          });
        }
      }

      const elapsed = performance.now() - start;
      console.log(`Create 300 mixins (100 per strategy): ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Edge Cases', () => {
    it('should handle finding with 0 confidence', () => {
      const finding = createDomainFinding({
        id: uuidv4(),
        type: 'benchmark-finding',
        confidence: 0,
        description: 'Zero confidence finding',
        payload: {},
        detectedBy: 'test',
        severity: 'low',
      });

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        mixin.requiresConsensus(finding);
      }
      const elapsed = performance.now() - start;

      console.log(`Zero confidence check x1000: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(20);
    });

    it('should handle finding with 1.0 confidence', () => {
      const finding = createDomainFinding({
        id: uuidv4(),
        type: 'benchmark-finding',
        confidence: 1.0,
        description: 'Max confidence finding',
        payload: {},
        detectedBy: 'test',
        severity: 'critical',
      });

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        mixin.requiresConsensus(finding);
      }
      const elapsed = performance.now() - start;

      console.log(`Max confidence check x1000: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(20);
    });

    it('should handle empty payload efficiently', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        createDomainFinding({
          id: uuidv4(),
          type: 'empty-payload',
          confidence: 0.5,
          description: 'Empty payload finding',
          payload: {},
          detectedBy: 'test',
        });
      }
      const elapsed = performance.now() - start;

      console.log(`Create 1000 findings with empty payload: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(30);
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(10000);

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        createDomainFinding({
          id: uuidv4(),
          type: 'long-description',
          confidence: 0.5,
          description: longDescription,
          payload: {},
          detectedBy: 'test',
        });
      }
      const elapsed = performance.now() - start;

      console.log(`Create 100 findings with 10KB descriptions: ${elapsed.toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(50);
    });
  });
});
