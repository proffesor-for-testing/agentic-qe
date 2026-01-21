/**
 * WorldStateBuilder Unit Tests
 *
 * Comprehensive tests for the WorldStateBuilder class that constructs
 * observable WorldState from various input sources.
 *
 * Coverage target: 95%+
 *
 * Test scenarios:
 * 1. Constructor initialization with default state
 * 2. Static factory methods
 * 3. Quality metrics builder methods
 * 4. Fleet status builder methods
 * 5. Resource constraints builder methods
 * 6. Context builder methods
 * 7. Risk level inference logic
 * 8. Factory functions (createWorldState)
 *
 * @module tests/unit/planning/WorldStateBuilder.test
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  WorldStateBuilder,
  QualityMetricsInput,
  FleetStatusInput,
  ResourceInput,
  ContextInput,
  createWorldState
} from '../../../src/planning/WorldStateBuilder';
import { DEFAULT_WORLD_STATE, WorldState } from '../../../src/planning/types';

// Mock Logger to avoid side effects during tests
jest.mock('../../../src/utils/Logger', () => ({
  Logger: {
    getInstance: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  }
}));

describe('WorldStateBuilder', () => {
  let builder: WorldStateBuilder;

  beforeEach(() => {
    builder = new WorldStateBuilder();
  });

  // ============================================================
  // CONSTRUCTOR AND INITIALIZATION TESTS
  // ============================================================
  describe('Constructor and Initialization', () => {
    it('should create a builder with default world state', () => {
      // Arrange & Act
      const state = builder.build();

      // Assert
      expect(state).toBeDefined();
      expect(state.coverage.line).toBe(DEFAULT_WORLD_STATE.coverage.line);
      expect(state.quality.testsPassing).toBe(DEFAULT_WORLD_STATE.quality.testsPassing);
      expect(state.fleet.activeAgents).toBe(DEFAULT_WORLD_STATE.fleet.activeAgents);
      expect(state.resources.timeRemaining).toBe(DEFAULT_WORLD_STATE.resources.timeRemaining);
      expect(state.context.environment).toBe(DEFAULT_WORLD_STATE.context.environment);
    });

    it('should return a deep copy of state (immutable)', () => {
      // Arrange
      const state1 = builder.build();
      const state2 = builder.build();

      // Act
      state1.coverage.line = 999;

      // Assert
      expect(state2.coverage.line).toBe(DEFAULT_WORLD_STATE.coverage.line);
      expect(state1.coverage.line).toBe(999);
    });

    it('should provide peek() for inspection without cloning', () => {
      // Arrange & Act
      const peeked = builder.peek();

      // Assert
      expect(peeked.coverage).toBeDefined();
      expect(Object.isFrozen(peeked)).toBe(false); // Not frozen, just readonly type
    });
  });

  // ============================================================
  // STATIC FACTORY METHODS TESTS
  // ============================================================
  describe('Static Factory Methods', () => {
    it('should create builder from quality metrics', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        coverage: { line: 85, branch: 80, function: 90 },
        testsPassing: 95,
        testsTotal: 100
      };

      // Act
      const builderFromMetrics = WorldStateBuilder.fromQualityMetrics(metrics);
      const state = builderFromMetrics.build();

      // Assert
      expect(state.coverage.line).toBe(85);
      expect(state.coverage.branch).toBe(80);
      expect(state.coverage.function).toBe(90);
      expect(state.quality.testsPassing).toBe(95); // 95/100 * 100
    });

    it('should create builder from fleet status', () => {
      // Arrange
      const status: FleetStatusInput = {
        activeAgents: 5,
        availableAgents: ['test-gen', 'coverage-analyzer'],
        busyAgents: ['security-scanner']
      };

      // Act
      const builderFromStatus = WorldStateBuilder.fromFleetStatus(status);
      const state = builderFromStatus.build();

      // Assert
      expect(state.fleet.activeAgents).toBe(5);
      expect(state.fleet.availableAgents).toEqual(['test-gen', 'coverage-analyzer']);
      expect(state.fleet.busyAgents).toEqual(['security-scanner']);
    });
  });

  // ============================================================
  // QUALITY METRICS BUILDER TESTS
  // ============================================================
  describe('Quality Metrics Builder (withQualityMetrics)', () => {
    it('should set coverage metrics', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        coverage: { line: 90, branch: 85, function: 95 }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.coverage.line).toBe(90);
      expect(state.coverage.branch).toBe(85);
      expect(state.coverage.function).toBe(95);
    });

    it('should calculate test passing percentage from count', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        testsPassing: 90,
        testsTotal: 100
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.testsPassing).toBe(90); // 90/100 * 100
    });

    it('should use testsPassing directly if testsTotal not provided', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        testsPassing: 85
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.testsPassing).toBe(85);
    });

    it('should handle zero testsTotal gracefully', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        testsPassing: 0,
        testsTotal: 0
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert - should use testsPassing directly when testsTotal is 0
      expect(state.quality.testsPassing).toBe(0);
    });

    it('should calculate security score from vulnerabilities', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        securityVulnerabilities: {
          critical: 0,
          high: 1,
          medium: 2,
          low: 5
        }
      };
      // Expected: 100 - (0*25 + 1*15 + 2*5 + 5*1) = 100 - 30 = 70

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.securityScore).toBe(70);
    });

    it('should floor security score at 0', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        securityVulnerabilities: {
          critical: 5, // 5 * 25 = 125 penalty alone
          high: 0,
          medium: 0,
          low: 0
        }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.securityScore).toBe(0);
    });

    it('should calculate performance score from metrics', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        performanceMetrics: {
          p95Latency: 200, // Baseline, no penalty
          throughput: 1000,
          errorRate: 0
        }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.performanceScore).toBe(100);
    });

    it('should apply latency penalty for slow p95', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        performanceMetrics: {
          p95Latency: 400, // 200ms over baseline
          errorRate: 0
        }
      };
      // Expected: 100 - (400 - 200) / 20 = 100 - 10 = 90

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.performanceScore).toBe(90);
    });

    it('should apply error rate penalty', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        performanceMetrics: {
          p95Latency: 200,
          errorRate: 5 // 5% error rate
        }
      };
      // Expected: 100 - 5*10 = 50

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.performanceScore).toBe(50);
    });

    it('should cap performance score between 0 and 100', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        performanceMetrics: {
          p95Latency: 5000, // Very slow
          errorRate: 10
        }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.performanceScore).toBeGreaterThanOrEqual(0);
      expect(state.quality.performanceScore).toBeLessThanOrEqual(100);
    });

    it('should set technical debt days', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        technicalDebt: { days: 15 }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.technicalDebt).toBe(15);
    });

    it('should preserve existing values when metric not provided', () => {
      // Arrange
      builder.withQualityMetrics({ coverage: { line: 80 } });

      // Act
      const state = builder.withQualityMetrics({ coverage: { branch: 75 } }).build();

      // Assert
      expect(state.coverage.line).toBe(80);
      expect(state.coverage.branch).toBe(75);
    });
  });

  // ============================================================
  // FLEET STATUS BUILDER TESTS
  // ============================================================
  describe('Fleet Status Builder (withFleetStatus)', () => {
    it('should set active agents count', () => {
      // Arrange
      const status: FleetStatusInput = {
        activeAgents: 10
      };

      // Act
      const state = builder.withFleetStatus(status).build();

      // Assert
      expect(state.fleet.activeAgents).toBe(10);
    });

    it('should set available agents list', () => {
      // Arrange
      const status: FleetStatusInput = {
        availableAgents: ['agent-a', 'agent-b', 'agent-c']
      };

      // Act
      const state = builder.withFleetStatus(status).build();

      // Assert
      expect(state.fleet.availableAgents).toEqual(['agent-a', 'agent-b', 'agent-c']);
    });

    it('should set busy agents list', () => {
      // Arrange
      const status: FleetStatusInput = {
        busyAgents: ['busy-1', 'busy-2']
      };

      // Act
      const state = builder.withFleetStatus(status).build();

      // Assert
      expect(state.fleet.busyAgents).toEqual(['busy-1', 'busy-2']);
    });

    it('should set agent types mapping', () => {
      // Arrange
      const status: FleetStatusInput = {
        agentTypes: {
          'test-generator': 3,
          'coverage-analyzer': 2,
          'security-scanner': 1
        }
      };

      // Act
      const state = builder.withFleetStatus(status).build();

      // Assert
      expect(state.fleet.agentTypes['test-generator']).toBe(3);
      expect(state.fleet.agentTypes['coverage-analyzer']).toBe(2);
      expect(state.fleet.agentTypes['security-scanner']).toBe(1);
    });

    it('should make copies of arrays (immutable)', () => {
      // Arrange
      const originalAgents = ['agent-a', 'agent-b'];
      const status: FleetStatusInput = {
        availableAgents: originalAgents
      };

      // Act
      const state = builder.withFleetStatus(status).build();
      originalAgents.push('agent-c');

      // Assert
      expect(state.fleet.availableAgents).toHaveLength(2);
      expect(state.fleet.availableAgents).not.toContain('agent-c');
    });
  });

  // ============================================================
  // RESOURCES BUILDER TESTS
  // ============================================================
  describe('Resources Builder (withResources)', () => {
    it('should set time remaining', () => {
      // Arrange
      const resources: ResourceInput = {
        timeRemaining: 7200 // 2 hours
      };

      // Act
      const state = builder.withResources(resources).build();

      // Assert
      expect(state.resources.timeRemaining).toBe(7200);
    });

    it('should set memory available', () => {
      // Arrange
      const resources: ResourceInput = {
        memoryAvailable: 8192 // 8GB
      };

      // Act
      const state = builder.withResources(resources).build();

      // Assert
      expect(state.resources.memoryAvailable).toBe(8192);
    });

    it('should set parallel slots', () => {
      // Arrange
      const resources: ResourceInput = {
        parallelSlots: 8
      };

      // Act
      const state = builder.withResources(resources).build();

      // Assert
      expect(state.resources.parallelSlots).toBe(8);
    });

    it('should set all resources at once', () => {
      // Arrange
      const resources: ResourceInput = {
        timeRemaining: 1800,
        memoryAvailable: 2048,
        parallelSlots: 2
      };

      // Act
      const state = builder.withResources(resources).build();

      // Assert
      expect(state.resources.timeRemaining).toBe(1800);
      expect(state.resources.memoryAvailable).toBe(2048);
      expect(state.resources.parallelSlots).toBe(2);
    });
  });

  // ============================================================
  // CONTEXT BUILDER TESTS
  // ============================================================
  describe('Context Builder (withContext)', () => {
    it('should set environment', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'production'
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.environment).toBe('production');
    });

    it('should set explicit change size', () => {
      // Arrange
      const context: ContextInput = {
        changeSize: 'large'
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.changeSize).toBe('large');
    });

    it('should infer small change size from few files', () => {
      // Arrange
      const context: ContextInput = {
        changedFiles: ['file1.ts', 'file2.ts', 'file3.ts'] // 3 files
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.changeSize).toBe('small'); // <= 5 files
    });

    it('should infer medium change size from moderate files', () => {
      // Arrange
      const context: ContextInput = {
        changedFiles: Array.from({ length: 15 }, (_, i) => `file${i}.ts`)
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.changeSize).toBe('medium'); // 6-20 files
    });

    it('should infer large change size from many files', () => {
      // Arrange
      const context: ContextInput = {
        changedFiles: Array.from({ length: 25 }, (_, i) => `file${i}.ts`)
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.changeSize).toBe('large'); // > 20 files
    });

    it('should set explicit risk level', () => {
      // Arrange
      const context: ContextInput = {
        riskLevel: 'critical'
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('critical');
    });

    it('should set previous failures count', () => {
      // Arrange
      const context: ContextInput = {
        previousFailures: 5
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.previousFailures).toBe(5);
    });

    it('should set project ID', () => {
      // Arrange
      const context: ContextInput = {
        projectId: 'proj-12345'
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.projectId).toBe('proj-12345');
    });

    it('should set impacted files from changed files', () => {
      // Arrange
      const context: ContextInput = {
        changedFiles: ['src/a.ts', 'src/b.ts']
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.impactedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    });
  });

  // ============================================================
  // RISK LEVEL INFERENCE TESTS
  // ============================================================
  describe('Risk Level Inference', () => {
    it('should infer critical risk for production hotfix', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'production',
        isHotfix: true
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('critical');
    });

    it('should infer high risk for production non-hotfix', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'production',
        isHotfix: false
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('high');
    });

    it('should infer high risk for staging with large changes', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'staging',
        changeSize: 'large'
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('high');
    });

    it('should infer high risk from many previous failures', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'development',
        previousFailures: 3
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('high');
    });

    it('should infer medium risk from some previous failures', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'development',
        previousFailures: 1
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('medium');
    });

    it('should infer medium risk from large changes in development', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'development',
        changeSize: 'large'
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('medium');
    });

    it('should infer low risk for small development changes', () => {
      // Arrange
      const context: ContextInput = {
        environment: 'development',
        changeSize: 'small',
        previousFailures: 0
      };

      // Act
      const state = builder.withContext(context).build();

      // Assert
      expect(state.context.riskLevel).toBe('low');
    });
  });

  // ============================================================
  // COVERAGE TARGET BUILDER TESTS
  // ============================================================
  describe('Coverage Target Builder (withCoverageTarget)', () => {
    it('should set coverage target', () => {
      // Act
      const state = builder.withCoverageTarget(90).build();

      // Assert
      expect(state.coverage.target).toBe(90);
    });
  });

  // ============================================================
  // GATE STATUS BUILDER TESTS
  // ============================================================
  describe('Gate Status Builder (withGateStatus)', () => {
    it('should set gate status to passed', () => {
      // Act
      const state = builder.withGateStatus('passed').build();

      // Assert
      expect(state.quality.gateStatus).toBe('passed');
    });

    it('should set gate status to failed', () => {
      // Act
      const state = builder.withGateStatus('failed').build();

      // Assert
      expect(state.quality.gateStatus).toBe('failed');
    });

    it('should set gate status to exception_requested', () => {
      // Act
      const state = builder.withGateStatus('exception_requested').build();

      // Assert
      expect(state.quality.gateStatus).toBe('exception_requested');
    });
  });

  // ============================================================
  // METHOD CHAINING TESTS
  // ============================================================
  describe('Method Chaining', () => {
    it('should support fluent method chaining', () => {
      // Act
      const state = builder
        .withQualityMetrics({ coverage: { line: 85 } })
        .withFleetStatus({ activeAgents: 5 })
        .withResources({ timeRemaining: 3600 })
        .withContext({ environment: 'staging' })
        .withCoverageTarget(90)
        .withGateStatus('pending')
        .build();

      // Assert
      expect(state.coverage.line).toBe(85);
      expect(state.fleet.activeAgents).toBe(5);
      expect(state.resources.timeRemaining).toBe(3600);
      expect(state.context.environment).toBe('staging');
      expect(state.coverage.target).toBe(90);
      expect(state.quality.gateStatus).toBe('pending');
    });
  });

  // ============================================================
  // FACTORY FUNCTIONS TESTS (createWorldState)
  // ============================================================
  describe('Factory Functions (createWorldState)', () => {
    describe('forQualityGate', () => {
      it('should create state for quality gate evaluation', () => {
        // Arrange
        const metrics: QualityMetricsInput = {
          coverage: { line: 80 },
          testsPassing: 95,
          testsTotal: 100
        };
        const context: ContextInput = {
          environment: 'staging'
        };

        // Act
        const state = createWorldState.forQualityGate(metrics, context);

        // Assert
        expect(state.coverage.line).toBe(80);
        expect(state.quality.testsPassing).toBe(95);
        expect(state.context.environment).toBe('staging');
      });

      it('should work without context', () => {
        // Arrange
        const metrics: QualityMetricsInput = {
          coverage: { line: 75 }
        };

        // Act
        const state = createWorldState.forQualityGate(metrics);

        // Assert
        expect(state.coverage.line).toBe(75);
        expect(state.context.environment).toBe(DEFAULT_WORLD_STATE.context.environment);
      });
    });

    describe('forTestStrategy', () => {
      it('should create state for test strategy planning', () => {
        // Arrange
        const coverage = { line: 70, branch: 65, target: 85 };
        const changedFiles = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
        const timeRemaining = 1800;

        // Act
        const state = createWorldState.forTestStrategy(coverage, changedFiles, timeRemaining);

        // Assert
        expect(state.coverage.line).toBe(70);
        expect(state.coverage.branch).toBe(65);
        expect(state.coverage.target).toBe(85);
        expect(state.context.impactedFiles).toEqual(changedFiles);
        expect(state.resources.timeRemaining).toBe(1800);
      });
    });

    describe('forFleetOrchestration', () => {
      it('should create state for fleet orchestration', () => {
        // Arrange
        const fleet: FleetStatusInput = {
          activeAgents: 8,
          availableAgents: ['agent-1', 'agent-2'],
          agentTypes: { 'test-gen': 4, 'coverage': 4 }
        };
        const resources: ResourceInput = {
          timeRemaining: 7200,
          parallelSlots: 4
        };

        // Act
        const state = createWorldState.forFleetOrchestration(fleet, resources);

        // Assert
        expect(state.fleet.activeAgents).toBe(8);
        expect(state.fleet.availableAgents).toHaveLength(2);
        expect(state.resources.timeRemaining).toBe(7200);
        expect(state.resources.parallelSlots).toBe(4);
      });
    });

    describe('minimal', () => {
      it('should create minimal state for testing', () => {
        // Act
        const state = createWorldState.minimal();

        // Assert
        expect(state).toEqual(DEFAULT_WORLD_STATE);
      });
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle empty quality metrics input', () => {
      // Act
      const state = builder.withQualityMetrics({}).build();

      // Assert
      expect(state.coverage.line).toBe(DEFAULT_WORLD_STATE.coverage.line);
    });

    it('should handle empty fleet status input', () => {
      // Act
      const state = builder.withFleetStatus({}).build();

      // Assert
      expect(state.fleet.activeAgents).toBe(DEFAULT_WORLD_STATE.fleet.activeAgents);
    });

    it('should handle empty resources input', () => {
      // Act
      const state = builder.withResources({}).build();

      // Assert
      expect(state.resources.timeRemaining).toBe(DEFAULT_WORLD_STATE.resources.timeRemaining);
    });

    it('should handle empty context input', () => {
      // Act
      const state = builder.withContext({}).build();

      // Assert
      expect(state.context.environment).toBe(DEFAULT_WORLD_STATE.context.environment);
    });

    it('should handle undefined optional fields in vulnerabilities', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        securityVulnerabilities: {
          // Only critical specified
          critical: 1
        }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.quality.securityScore).toBe(75); // 100 - 25
    });

    it('should handle partial coverage metrics', () => {
      // Arrange
      const metrics: QualityMetricsInput = {
        coverage: {
          line: 80
          // branch and function not specified
        }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert
      expect(state.coverage.line).toBe(80);
      expect(state.coverage.branch).toBe(DEFAULT_WORLD_STATE.coverage.branch);
      expect(state.coverage.function).toBe(DEFAULT_WORLD_STATE.coverage.function);
    });

    it('should handle negative latency values (below baseline)', () => {
      // Arrange - latency below baseline should not add negative penalty
      const metrics: QualityMetricsInput = {
        performanceMetrics: {
          p95Latency: 50 // Well below 200ms baseline
        }
      };

      // Act
      const state = builder.withQualityMetrics(metrics).build();

      // Assert - should use max(0, penalty) so no benefit from low latency
      expect(state.quality.performanceScore).toBe(100);
    });
  });
});
