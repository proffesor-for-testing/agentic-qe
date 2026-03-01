/**
 * TrajectoryAdapter Unit Tests
 * Comprehensive test coverage for trajectory-to-pattern adaptation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrajectoryAdapter, createTrajectoryAdapter } from '../../../src/adapters/trajectory-adapter.js';
import type { Trajectory, TrajectoryStep, TrajectoryMetrics } from '../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import * as unifiedMemory from '../../../src/kernel/unified-memory.js';

// Mock unified memory
vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: vi.fn(() => ({
    kvSet: vi.fn().mockResolvedValue(undefined),
    kvGet: vi.fn().mockResolvedValue(null),
    kvSearch: vi.fn().mockResolvedValue([]),
  })),
}));

describe('TrajectoryAdapter', () => {
  let mockTrajectory: Trajectory;
  let mockMetrics: TrajectoryMetrics;

  beforeEach(() => {
    // Create mock metrics
    mockMetrics = {
      totalDurationMs: 1000,
      successfulSteps: 4,
      failedSteps: 0,
      averageQuality: 0.9625, // (0.9 + 1.0 + 1.0 + 0.95) / 4
      totalTokensUsed: 100,
      efficiencyScore: 0.95,
    };

    // Create a mock successful trajectory with correct shape
    mockTrajectory = {
      id: 'traj-001',
      task: 'Login user flow',
      agent: 'browser-automation',
      domain: 'test-execution',
      steps: [
        {
          id: 'step-1',
          action: 'navigate',
          result: { outcome: 'success', data: { url: 'https://example.com/login' } },
          quality: 0.9,
          durationMs: 500,
          timestamp: new Date('2025-01-20T10:00:00Z'),
        },
        {
          id: 'step-2',
          action: 'fill-email',
          result: { outcome: 'success' },
          quality: 1.0,
          durationMs: 100,
          timestamp: new Date('2025-01-20T10:00:01Z'),
        },
        {
          id: 'step-3',
          action: 'fill-password',
          result: { outcome: 'success' },
          quality: 1.0,
          durationMs: 100,
          timestamp: new Date('2025-01-20T10:00:02Z'),
        },
        {
          id: 'step-4',
          action: 'click-submit',
          result: { outcome: 'success' },
          quality: 0.95,
          durationMs: 300,
          timestamp: new Date('2025-01-20T10:00:03Z'),
        },
      ],
      outcome: 'success',
      metrics: mockMetrics,
      startedAt: new Date('2025-01-20T10:00:00Z'),
      endedAt: new Date('2025-01-20T10:00:03Z'),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('agenticFlowToQEPattern', () => {
    it('should convert trajectory correctly', () => {
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(mockTrajectory);

      expect(pattern.id).toBe('traj-001');
      expect(pattern.name).toBe('browser-trajectory-login-user-flow');
      expect(pattern.description).toContain('Login user flow');
      expect(pattern.qeDomain).toBe('test-execution');
      expect(pattern.domain).toBe('test-execution');
      expect(pattern.confidence).toBe(0.95); // efficiencyScore
      expect(pattern.successRate).toBe(0.95); // efficiencyScore
      expect(pattern.context.tags).toContain('browser');
      expect(pattern.context.tags).toContain('trajectory');
    });

    it('should include template with steps', () => {
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(mockTrajectory);

      expect(pattern.template).toBeDefined();
      expect(pattern.template.type).toBe('workflow');
      expect(pattern.template.content).toBeDefined();
      // Template content is markdown format, not JSON
      expect(pattern.template.content).toContain('# Browser Trajectory');
      expect(pattern.template.content).toContain('Login user flow');
      expect(pattern.template.content).toContain('navigate');
      expect(pattern.template.content).toContain('fill-email');
      expect(pattern.template.content).toContain('fill-password');
      expect(pattern.template.content).toContain('click-submit');
    });

    it('should include proper context', () => {
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(mockTrajectory);

      expect(pattern.context).toBeDefined();
      expect(pattern.context.testType).toBe('e2e');
      expect(pattern.context.relatedDomains).toContain('test-execution');
      expect(pattern.context.tags).toContain('outcome:success');
    });

    it('should handle trajectory without domain', () => {
      const trajectoryNoDomain = { ...mockTrajectory, domain: undefined };
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(trajectoryNoDomain);

      expect(pattern.domain).toBe('test-execution'); // Default
      expect(pattern.context.tags).toContain('test-execution');
    });

    it('should sanitize task name for pattern name', () => {
      const trajectoryWithSpaces = {
        ...mockTrajectory,
        task: 'Test  Multiple   Spaces',
      };
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(trajectoryWithSpaces);

      expect(pattern.name).toBe('browser-trajectory-test-multiple-spaces');
      expect(pattern.name).not.toContain('  ');
    });

    it('should handle empty steps array', () => {
      const trajectoryNoSteps = { ...mockTrajectory, steps: [] };
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(trajectoryNoSteps);

      // Template content is markdown format with no steps
      expect(pattern.template.content).toContain('# Browser Trajectory');
      expect(pattern.template.content).toContain('## Steps');
      // With empty steps, the steps section should be empty
      expect(pattern.template.content).not.toContain('Step 1:');
    });

    it('should set tier and tracking fields correctly', () => {
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(mockTrajectory);

      expect(pattern.tier).toBe('short-term');
      expect(pattern.createdAt).toEqual(mockTrajectory.startedAt);
      expect(pattern.lastUsedAt).toEqual(mockTrajectory.endedAt);
      expect(pattern.successfulUses).toBe(1); // success outcome
      expect(pattern.reusable).toBe(true); // success outcome
      expect(pattern.reuseCount).toBe(0);
      expect(pattern.averageTokenSavings).toBe(0);
    });

    it('should mark failed trajectories as not reusable', () => {
      const failedTrajectory = {
        ...mockTrajectory,
        outcome: 'failure' as const,
        metrics: { ...mockMetrics, efficiencyScore: 0.3 },
      };
      const pattern = TrajectoryAdapter.agenticFlowToQEPattern(failedTrajectory);

      expect(pattern.reusable).toBe(false);
      expect(pattern.successfulUses).toBe(0);
    });
  });

  describe('toLearningOutcome', () => {
    it('should generate success outcome correctly', () => {
      const outcome = TrajectoryAdapter.toLearningOutcome(mockTrajectory);

      expect(outcome.id).toBeDefined();
      expect(outcome.trajectoryId).toBe('traj-001');
      expect(outcome.type).toBe('success');
      expect(outcome.lesson).toContain('Successful browser automation');
      expect(outcome.lesson).toContain('Login user flow');
      expect(outcome.lesson).toContain('navigate -> fill-email -> fill-password -> click-submit');
      expect(outcome.confidence).toBe(0.95);
      expect(outcome.domains).toContain('test-execution');
      expect(outcome.timestamp).toEqual(mockTrajectory.endedAt);
    });

    it('should generate failure outcome correctly', () => {
      const failedTrajectory: Trajectory = {
        ...mockTrajectory,
        steps: [
          ...mockTrajectory.steps.slice(0, 2),
          {
            id: 'step-3',
            action: 'fill-password',
            result: { outcome: 'failure', error: 'Element not found' },
            quality: 0.0,
            durationMs: 100,
            timestamp: new Date('2025-01-20T10:00:02Z'),
          },
        ],
        outcome: 'failure',
        metrics: { ...mockMetrics, efficiencyScore: 0.0, failedSteps: 1, successfulSteps: 2 },
      };

      const outcome = TrajectoryAdapter.toLearningOutcome(failedTrajectory);

      expect(outcome.type).toBe('failure');
      expect(outcome.lesson).toContain('Failed browser automation');
      expect(outcome.lesson).toContain('Error at step: fill-password');
      expect(outcome.confidence).toBe(0.0);
    });

    it('should handle trajectory without endedAt timestamp', () => {
      const trajectoryNoEnd = { ...mockTrajectory, endedAt: undefined };
      const outcome = TrajectoryAdapter.toLearningOutcome(trajectoryNoEnd);

      expect(outcome.timestamp).toBeInstanceOf(Date);
    });

    it('should default to unknown step when no failure found', () => {
      const failedTrajectoryNoFailStep: Trajectory = {
        ...mockTrajectory,
        outcome: 'failure',
        metrics: { ...mockMetrics, efficiencyScore: 0.0 },
      };

      const outcome = TrajectoryAdapter.toLearningOutcome(failedTrajectoryNoFailStep);

      expect(outcome.lesson).toContain('Error at step: unknown');
    });

    it('should include domain in outcome', () => {
      const outcome = TrajectoryAdapter.toLearningOutcome(mockTrajectory);

      expect(outcome.domains).toEqual(['test-execution']);
    });
  });

  describe('extractActionSequences', () => {
    it('should find common patterns across trajectories', () => {
      const trajectory1: Trajectory = {
        ...mockTrajectory,
        id: 'traj-001',
        steps: mockTrajectory.steps,
      };

      const trajectory2: Trajectory = {
        ...mockTrajectory,
        id: 'traj-002',
        steps: [
          { ...mockTrajectory.steps[0], id: 'step-2-1' },
          { ...mockTrajectory.steps[1], id: 'step-2-2' },
          { ...mockTrajectory.steps[2], id: 'step-2-3' },
          { ...mockTrajectory.steps[3], id: 'step-2-4' },
        ],
      };

      const patterns = TrajectoryAdapter.extractActionSequences([trajectory1, trajectory2], 2);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].frequency).toBeGreaterThanOrEqual(2);
      expect(patterns[0].actions).toBeInstanceOf(Array);
      expect(patterns[0].trajectoryIds).toContain('traj-001');
      expect(patterns[0].trajectoryIds).toContain('traj-002');
    });

    it('should calculate success rate correctly', () => {
      const successTrajectory: Trajectory = {
        ...mockTrajectory,
        id: 'traj-success',
        outcome: 'success',
      };

      const failureTrajectory: Trajectory = {
        ...mockTrajectory,
        id: 'traj-failure',
        outcome: 'failure',
      };

      const patterns = TrajectoryAdapter.extractActionSequences(
        [successTrajectory, failureTrajectory],
        2
      );

      // Should find patterns with 50% success rate (1 success, 1 failure)
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].successRate).toBeCloseTo(0.5, 1);
    });

    it('should sort patterns by frequency descending', () => {
      const trajectories: Trajectory[] = [
        { ...mockTrajectory, id: 'traj-1' },
        { ...mockTrajectory, id: 'traj-2' },
        { ...mockTrajectory, id: 'traj-3' },
      ];

      const patterns = TrajectoryAdapter.extractActionSequences(trajectories, 2);

      // Patterns should be sorted by frequency (descending)
      for (let i = 1; i < patterns.length; i++) {
        expect(patterns[i - 1].frequency).toBeGreaterThanOrEqual(patterns[i].frequency);
      }
    });

    it('should respect minFrequency threshold', () => {
      const singleTrajectory: Trajectory = { ...mockTrajectory, id: 'traj-single' };

      // With minFrequency=2, single trajectory should not produce patterns
      const patterns = TrajectoryAdapter.extractActionSequences([singleTrajectory], 2);

      // All patterns should have frequency >= 2
      patterns.forEach((pattern) => {
        expect(pattern.frequency).toBeGreaterThanOrEqual(2);
      });
    });

    it('should handle empty trajectories array', () => {
      const patterns = TrajectoryAdapter.extractActionSequences([], 2);

      expect(patterns).toHaveLength(0);
    });

    it('should generate sequences of length 2-5', () => {
      const longTrajectory: Trajectory = {
        ...mockTrajectory,
        steps: Array.from({ length: 10 }, (_, i) => ({
          id: `step-${i}`,
          action: `action-${i}`,
          result: { outcome: 'success' as const },
          quality: 1.0,
          durationMs: 100,
          timestamp: new Date(),
        })),
      };

      const patterns = TrajectoryAdapter.extractActionSequences([longTrajectory, longTrajectory], 2);

      // Should include sequences of various lengths
      const lengths = patterns.map((p) => p.actions.length);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(5);
      expect(Math.min(...lengths)).toBeGreaterThanOrEqual(2);
    });
  });

  describe('storeTrajectory', () => {
    it('should persist trajectory to memory successfully', async () => {
      const mockMemory = {
        kvSet: vi.fn().mockResolvedValue(undefined),
        kvGet: vi.fn(),
        kvSearch: vi.fn(),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      const result = await TrajectoryAdapter.storeTrajectory(mockTrajectory);

      expect(result).toBe(true);
      // storeTrajectory uses 'trajectory:' prefix with trajectory.id
      expect(mockMemory.kvSet).toHaveBeenCalledWith(
        'trajectory:traj-001',
        expect.objectContaining({
          pattern: expect.any(String), // JSON-stringified pattern
          metadata: expect.objectContaining({
            outcome: 'success',
          }),
        }),
        'browser-trajectories'
      );
    });

    it('should return false on storage failure', async () => {
      const mockMemory = {
        kvSet: vi.fn().mockRejectedValue(new Error('Storage failed')),
        kvGet: vi.fn(),
        kvSearch: vi.fn(),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      const result = await TrajectoryAdapter.storeTrajectory(mockTrajectory);

      expect(result).toBe(false);
    });

    it('should store pattern with correct metadata', async () => {
      const mockMemory = {
        kvSet: vi.fn().mockResolvedValue(undefined),
        kvGet: vi.fn(),
        kvSearch: vi.fn(),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      await TrajectoryAdapter.storeTrajectory(mockTrajectory);

      const call = mockMemory.kvSet.mock.calls[0];
      const key = call[0];
      const value = call[1];
      const namespace = call[2];

      expect(key).toBe('trajectory:traj-001');
      expect(namespace).toBe('browser-trajectories');
      expect(value.pattern).toBeDefined();
      expect(value.metadata.outcome).toBe('success');
    });
  });

  describe('findSimilarSuccessful', () => {
    it('should return similar successful trajectories', async () => {
      const testDate = new Date('2025-01-20T10:00:00Z');
      const mockPattern: QEPattern = {
        id: 'pattern-001',
        patternType: 'test-template',
        qeDomain: 'test-execution',
        name: 'similar-pattern',
        description: 'Similar pattern',
        domain: 'test-execution',
        template: { type: 'workflow', content: '[]', variables: [], example: '' },
        context: { testType: 'e2e', relatedDomains: [], tags: [] },
        confidence: 0.9,
        usageCount: 5,
        successRate: 0.85,
        qualityScore: 0.85,
        tier: 'short-term',
        createdAt: testDate,
        lastUsedAt: testDate,
        successfulUses: 4,
        reusable: true,
        reuseCount: 3,
        averageTokenSavings: 0,
      };

      const mockMemory = {
        kvSet: vi.fn(),
        kvGet: vi.fn().mockImplementation((key: string) => {
          if (key === 'trajectory:pattern-001') {
            return Promise.resolve({
              pattern: JSON.stringify(mockPattern), // Pattern is stored as JSON string
              // Task must match query for similarity filter
              metadata: { outcome: 'success', task: 'login flow test', efficiencyScore: '0.85' },
            });
          }
          return Promise.resolve(null);
        }),
        kvSearch: vi.fn().mockResolvedValue(['trajectory:pattern-001']),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      // Query must match task in metadata for similarity filter
      const results = await TrajectoryAdapter.findSimilarSuccessful('login flow', 5);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('pattern-001');
      expect(results[0].name).toBe('similar-pattern');
      expect(results[0].successRate).toBe(0.85);
      // kvSearch uses hardcoded limit of 100
      expect(mockMemory.kvSearch).toHaveBeenCalledWith(
        'trajectory:*',
        'browser-trajectories',
        100
      );
    });

    it('should filter out low success rate patterns', async () => {
      const lowSuccessPattern: QEPattern = {
        id: 'pattern-low',
        patternType: 'test-template',
        qeDomain: 'test-execution',
        name: 'low-success',
        description: 'Low success pattern',
        domain: 'test-execution',
        template: { type: 'workflow', content: '[]', variables: [], example: '' },
        context: { testType: 'e2e', relatedDomains: [], tags: [] },
        confidence: 0.5,
        usageCount: 1,
        successRate: 0.5, // Below 0.7 threshold
        qualityScore: 0.5,
        tier: 'short-term',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        successfulUses: 0,
        reusable: false,
        reuseCount: 0,
        averageTokenSavings: 0,
      };

      const mockMemory = {
        kvSet: vi.fn(),
        kvGet: vi.fn().mockResolvedValue({
          pattern: JSON.stringify(lowSuccessPattern),
          metadata: { outcome: 'success', task: 'test', efficiencyScore: '0.5' },
        }),
        kvSearch: vi.fn().mockResolvedValue(['trajectory:pattern-low']),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      const results = await TrajectoryAdapter.findSimilarSuccessful('test', 5);

      expect(results).toHaveLength(0); // Filtered out
    });

    it('should handle search errors gracefully', async () => {
      const mockMemory = {
        kvSet: vi.fn(),
        kvGet: vi.fn(),
        kvSearch: vi.fn().mockRejectedValue(new Error('Search failed')),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      const results = await TrajectoryAdapter.findSimilarSuccessful('test', 5);

      expect(results).toHaveLength(0);
    });

    it('should handle null kvGet results', async () => {
      const mockMemory = {
        kvSet: vi.fn(),
        kvGet: vi.fn().mockResolvedValue(null),
        kvSearch: vi.fn().mockResolvedValue(['trajectory:missing']),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      const results = await TrajectoryAdapter.findSimilarSuccessful('test', 5);

      expect(results).toHaveLength(0);
    });

    it('should call kvSearch with correct parameters', async () => {
      const mockMemory = {
        kvSet: vi.fn(),
        kvGet: vi.fn(),
        kvSearch: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(unifiedMemory.getUnifiedMemory).mockReturnValue(mockMemory as any);

      await TrajectoryAdapter.findSimilarSuccessful('test', 10);

      // kvSearch always fetches 100, limit is applied during result filtering
      expect(mockMemory.kvSearch).toHaveBeenCalledWith(
        'trajectory:*',
        'browser-trajectories',
        100
      );
    });
  });

  describe('createTrajectoryAdapter', () => {
    it('should return TrajectoryAdapter class', () => {
      const adapter = createTrajectoryAdapter();
      expect(adapter).toBe(TrajectoryAdapter);
    });

    it('should allow using factory function for consistency', () => {
      const adapter = createTrajectoryAdapter();
      const pattern = adapter.agenticFlowToQEPattern(mockTrajectory);

      expect(pattern).toBeDefined();
      expect(pattern.id).toBe('traj-001');
    });
  });
});
