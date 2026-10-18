/**
 * #1121 follow-ups to #1109:
 * 1. getLearningDashboard fell back to `overallLearningRate: 0.5` when pattern
 *    stats failed; shareCrossDomainLearnings reported a 100% transfer rate
 *    with no transfer attempted.
 * 2. `learn` reported `experiencesProcessed = experienceIds.length` without
 *    reading those experiences.
 * 3. Patterns stored before #1120 keep a 100% rate mined from successes only.
 *    They are kept but read as unmeasured (tag and exclude); nothing deletes them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../../src/kernel/memory-factory';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { LearningOptimizationPlugin, type LearningOptimizationAPI } from '../../../../src/domains/learning-optimization/plugin';
import { LearningCoordinatorService } from '../../../../src/domains/learning-optimization/services/learning-coordinator';
import { LearningOptimizeTool } from '../../../../src/mcp/tools/learning-optimization/optimize';
import { isMeasuredPattern, patternEvidenceOf } from '../../../../src/domains/learning-optimization/reward-source';
import type { LearnedPattern } from '../../../../src/domains/learning-optimization/interfaces';
import { MockAgentCoordinator, MockEventBus } from '../plugin-test-utils';
import { err } from '../../../../src/shared/types';

vi.mock('../../../../src/integrations/ruvector/sona-persistence', () => ({
  createPersistentSONAEngine: vi.fn().mockResolvedValue({
    getStats: vi.fn().mockReturnValue({ totalPatterns: 0, typeBreakdown: {}, domainBreakdown: {} }),
    getAllPatterns: vi.fn().mockReturnValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  PersistentSONAEngine: vi.fn(),
}));

vi.mock('../../../../src/learning/dream/index', () => ({
  createDreamEngine: vi.fn().mockResolvedValue({
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  createDreamScheduler: vi.fn().mockReturnValue({
    initialize: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  }),
  DreamScheduler: vi.fn(),
}));

const LEARNING = { namespace: 'learning-optimization', persist: true };

/** A pattern exactly as builds before #1120 stored it: no rewardSource. */
function prePattern(id: string, domain: LearnedPattern['domain'], action: string): LearnedPattern {
  return {
    id, type: 'test-pattern', domain, name: id, description: 'Learned pattern from 6 experiences with 100% success rate',
    confidence: 1, usageCount: 0, successRate: 1, context: { tags: [] },
    template: {
      type: 'workflow',
      content: `// Pattern learned from 6 experiences\n// Common actions: ${action}\n// Apply to domain: {{domain}}`,
      variables: [],
    },
    createdAt: new Date(), lastUsedAt: new Date(),
  };
}

describe('#1121 learning rates without invented fallbacks or stale 100% patterns', () => {
  let dir: string;
  let memory: MemoryBackend;
  let eventBus: MockEventBus;
  let agents: MockAgentCoordinator;
  let plugin: LearningOptimizationPlugin;
  const tool = () => new LearningOptimizeTool();

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1121-'));
    ({ backend: memory } = await createMemoryBackend({
      type: 'sqlite', sqlite: { path: join(dir, 'memory.db'), walMode: true },
    }, true));
    eventBus = new MockEventBus();
    agents = new MockAgentCoordinator();
    plugin = new LearningOptimizationPlugin(eventBus, memory, agents);
    await plugin.initialize();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (plugin.isReady()) await plugin.dispose();
    await eventBus.dispose();
    await agents.dispose();
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  async function recordTestRuns(passes: boolean[]): Promise<string[]> {
    const service = new LearningCoordinatorService({ memory });
    const ids: string[] = [];
    for (const passed of passes) {
      const result = await service.recordExperience({
        agentId: { value: 'test-execution', domain: 'test-execution', type: 'tester' },
        domain: 'test-execution',
        action: 'test-run',
        state: { context: {}, metrics: {} },
        result: { success: passed, outcome: {}, duration: 10 },
        reward: passed ? 1 : 0,
        rewardSource: 'measured',
      });
      if (result.success) ids.push(result.value);
    }
    return ids;
  }

  describe('dashboard and transfer report', () => {
    const api = () => plugin.getAPI<LearningOptimizationAPI>();

    it('reports a null learning rate when pattern stats cannot be read, not 0.5', async () => {
      vi.spyOn(LearningCoordinatorService.prototype, 'getPatternStats')
        .mockResolvedValue(err(new Error('stats unavailable')));

      const dashboard = await api().getLearningDashboard();

      expect(dashboard.success && dashboard.value.overallLearningRate).toBeNull();
    });

    it('reports a null learning rate when only pre-#1120 patterns exist', async () => {
      await memory.set('learning:pattern:pre', prePattern('pre', 'test-execution', 'test-run'), LEARNING);

      const dashboard = await api().getLearningDashboard();

      expect(dashboard.success && dashboard.value.overallLearningRate).toBeNull();
    });

    it('reports no transfer success rate when nothing was transferred', async () => {
      const report = await api().shareCrossDomainLearnings();

      expect(report.success && report.value.knowledgeShared).toBe(0);
      expect(report.success && report.value.transferSuccessRate).toBeNull();
    });
  });

  describe('learn with experienceIds', () => {
    it('counts only the experiences it read and learns from them', async () => {
      const ids = await recordTestRuns([true, true, true, true, false]);

      const result = await tool().invoke({
        action: 'learn', domain: 'test-execution', experienceIds: [...ids, 'missing-1', 'missing-2'],
      }, { memory });

      expect(result.data?.learnResult).toMatchObject({
        experiencesProcessed: 5,
        experienceIdsNotFound: 2,
        measuredExperiences: 5,
        patternsLearned: 1,
        improvement: null,
      });
      expect(result.data?.learnResult?.newPatterns[0]?.successRate).toBe(0.8);
    });

    it('reports insufficient evidence when none of the IDs exists', async () => {
      const result = await tool().invoke({
        action: 'learn', domain: 'test-execution', experienceIds: ['missing-1', 'missing-1', 'missing-2'],
      }, { memory });

      expect(result.data?.learnResult).toMatchObject({
        experiencesProcessed: 0, experienceIdsNotFound: 2, patternsLearned: 0, evidenceStatus: 'insufficient-evidence',
      });
      expect(result.data?.evidenceStatus).toBe('insufficient-evidence');
    });
  });

  describe('patterns stored before #1120', () => {
    it('are read as pre-#1120, whatever their action; tagged patterns keep their tag', () => {
      expect(patternEvidenceOf(prePattern('a', 'test-execution', 'test-run'))).toBe('pre-1120');
      expect(patternEvidenceOf(prePattern('b', 'quality-assessment', 'gate-evaluation'))).toBe('pre-1120');
      expect(patternEvidenceOf(prePattern('c', 'test-generation', 'test-generated'))).toBe('assigned');
      expect(patternEvidenceOf({ ...prePattern('d', 'test-execution', 'test-run'), rewardSource: 'measured' })).toBe('measured');
      expect(isMeasuredPattern(prePattern('a', 'test-execution', 'test-run'))).toBe(false);
    });

    it('are kept but left out of patterns and the dashboard, which say how many were excluded', async () => {
      await memory.set('learning:pattern:pre-run', prePattern('pre-run', 'test-execution', 'test-run'), LEARNING);
      await memory.set('learning:pattern:pre-gate', prePattern('pre-gate', 'quality-assessment', 'gate-evaluation'), LEARNING);
      await memory.set('learning:pattern:assigned', prePattern('assigned', 'test-generation', 'test-generated'), LEARNING);
      await memory.set('learning:pattern:measured', {
        ...prePattern('measured', 'test-execution', 'test-run'), successRate: 0.6, confidence: 0.6, rewardSource: 'measured',
      }, LEARNING);

      const patterns = await tool().invoke({ action: 'patterns' }, { memory });
      const dashboard = await tool().invoke({ action: 'dashboard' }, { memory });

      expect(patterns.data?.patternResult).toMatchObject({
        totalPatterns: 1, avgSuccessRate: 0.6, avgConfidence: 0.6,
        assignedPatternsExcluded: 1, legacyPatternsExcluded: 2,
      });
      expect(dashboard.data?.dashboardResult).toMatchObject({
        totalPatterns: 1, overallLearningRate: 0.6, assignedPatternsExcluded: 1, legacyPatternsExcluded: 2,
        recentMilestones: [],
      });
      // Kept, not deleted or rewritten.
      expect(await memory.get('learning:pattern:pre-run', LEARNING)).toMatchObject({ successRate: 1 });
      expect(await memory.get('learning:pattern:pre-run', LEARNING)).not.toHaveProperty('rewardSource');
    });

    it('patterns reports insufficient evidence, not 0% averages, when no measured pattern exists', async () => {
      await memory.set('learning:pattern:pre-run', prePattern('pre-run', 'test-execution', 'test-run'), LEARNING);

      const patterns = await tool().invoke({ action: 'patterns' }, { memory });

      expect(patterns.data?.patternResult).toMatchObject({
        totalPatterns: 0, avgSuccessRate: null, avgConfidence: null,
        legacyPatternsExcluded: 1, evidenceStatus: 'insufficient-evidence',
      });
      expect(patterns.data?.evidenceStatus).toBe('insufficient-evidence');
    });
  });
});
