/**
 * #1109: event handlers that record an experience before any outcome exists
 * (generated test, defect prediction, impact analysis, coverage gap) assign
 * `success: true` and a fixed reward. Those experiences are kept but tagged
 * `rewardSource: 'assigned'`, and no reported rate, confidence, ranking,
 * milestone, average reward or anomaly baseline may come from them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../../src/kernel/memory-factory';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { LearningOptimizationPlugin } from '../../../../src/domains/learning-optimization/plugin';
import { LearningCoordinatorService } from '../../../../src/domains/learning-optimization/services/learning-coordinator';
import { MetricsOptimizerService } from '../../../../src/domains/learning-optimization/services/metrics-optimizer';
import { LearningOptimizeTool } from '../../../../src/mcp/tools/learning-optimization/optimize';
import {
  isMeasuredPattern,
  rewardSourceOf,
} from '../../../../src/domains/learning-optimization/reward-source';
import type { Experience, LearnedPattern } from '../../../../src/domains/learning-optimization/interfaces';
import { MockAgentCoordinator, MockEventBus, createMockEvent } from '../plugin-test-utils';
import { TimeRange } from '../../../../src/shared/value-objects';

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

const LEARNING = { namespace: 'learning-optimization' };

describe('#1109 assigned rewards are recorded but never reported as measured', () => {
  let dir: string;
  let memory: MemoryBackend;
  let eventBus: MockEventBus;
  let agents: MockAgentCoordinator;
  let plugin: LearningOptimizationPlugin;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1109-'));
    ({ backend: memory } = await createMemoryBackend({
      type: 'sqlite', sqlite: { path: join(dir, 'memory.db'), walMode: true },
    }, true));
    eventBus = new MockEventBus();
    agents = new MockAgentCoordinator();
    plugin = new LearningOptimizationPlugin(eventBus, memory, agents);
    await plugin.initialize();
  });

  afterEach(async () => {
    if (plugin.isReady()) await plugin.dispose();
    await eventBus.dispose();
    await agents.dispose();
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  async function publishAssigned(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await eventBus.publish(createMockEvent('test-generation.TestGenerated', 'test-generation', {
        testId: `t-${i}`, testFile: `t-${i}.test.ts`, testType: 'unit',
      }));
      await eventBus.publish(createMockEvent('defect-intelligence.DefectPredicted', 'defect-intelligence', {
        predictionId: `p-${i}`, probability: 0.4,
      }));
      await eventBus.publish(createMockEvent('code-intelligence.ImpactAnalysisCompleted', 'code-intelligence', {
        analysisId: `a-${i}`, changedFiles: ['a.ts'], impactedFiles: ['b.ts'],
      }));
    }
  }

  async function storedExperiences(): Promise<Experience[]> {
    const keys = await memory.search('learning:experience:*', 10000, LEARNING);
    const values = await Promise.all(keys
      .map(key => key.replace(/^learning-optimization:/, ''))
      .filter(key => !key.includes(':index:'))
      .map(key => memory.get<Experience>(key, LEARNING)));
    return values.filter((value): value is Experience => !!value?.agentId);
  }

  const tool = () => new LearningOptimizeTool();

  it('tags handler-assigned rewards and keeps measured outcomes untouched', async () => {
    await publishAssigned(1);
    await eventBus.publish(createMockEvent('coverage-analysis.CoverageGapDetected', 'coverage-analysis', {
      gapId: 'g-1', file: 'src/a.ts', riskScore: 0.3, measured: true,
    }));
    await eventBus.publish(createMockEvent('test-execution.TestRunCompleted', 'test-execution', {
      runId: 'r-1', passed: 3, failed: 1, duration: 10,
    }));
    await eventBus.publish(createMockEvent('quality-assessment.QualityGateEvaluated', 'quality-assessment', {
      gateId: 'q-1', passed: false,
    }));

    const rows = await storedExperiences();
    const sources = (action: string) => [...new Set(rows.filter(e => e.action === action).map(e => e.rewardSource))];
    const read = (action: string) => [...new Set(rows.filter(e => e.action === action).map(rewardSourceOf))];
    // Written by the plugin handlers alone: the tag is on the row itself.
    expect(sources('test-generated')).toEqual(['assigned']);
    expect(sources('defect-prediction')).toEqual(['assigned']);
    expect(sources('impact-analysis')).toEqual(['assigned']);
    // Also written, untagged, by the coordinator until #1110 lands: read by rule.
    expect(read('gap-detection')).toEqual(['assigned']);
    expect(read('test-run')).toEqual(['measured']);
    expect(read('gate-evaluation')).toEqual(['measured']);
    expect(rows.filter(e => e.rewardSource === 'measured').map(e => e.action).sort())
      .toEqual(['gate-evaluation', 'test-run']);
  });

  it('learn reports insufficient evidence, not a 100% pattern, from assigned rewards only', async () => {
    await publishAssigned(6);

    const result = await tool().invoke({ action: 'learn', domain: 'test-generation' }, { memory });

    expect(result.success).toBe(true);
    expect(result.data?.evidenceStatus).toBe('insufficient-evidence');
    expect(result.data?.learnResult).toMatchObject({
      experiencesProcessed: 6,
      measuredExperiences: 0,
      assignedRewardsExcluded: 6,
      patternsLearned: 0,
      newPatterns: [],
      improvement: null,
      unmeasured: ['improvement'],
    });
  });

  it('learn reports the observed rate of measured outcomes, failures included', async () => {
    const runs = [[10, 0], [10, 0], [10, 0], [10, 0], [1, 9]];
    for (const [i, [passed, failed]] of runs.entries()) {
      await eventBus.publish(createMockEvent('test-execution.TestRunCompleted', 'test-execution', {
        runId: `r-${i}`, passed, failed, duration: 10,
      }));
    }

    const result = await tool().invoke({ action: 'learn', domain: 'test-execution' }, { memory });

    expect(result.data?.learnResult?.patternsLearned).toBe(1);
    const [pattern] = result.data!.learnResult!.newPatterns;
    expect(pattern.successRate).toBe(0.8);
    expect(pattern.confidence).toBe(0.8);
    expect(result.data?.learnResult?.improvement).toBeNull();
  });

  it('dashboard ranks no domain and awards no milestone from assigned rewards', async () => {
    await publishAssigned(6);

    const result = await tool().invoke({ action: 'dashboard' }, { memory });
    const dashboard = result.data!.dashboardResult!;

    expect(dashboard.topPerformingDomains).toEqual([]);
    expect(dashboard.overallLearningRate).toBeNull();
    expect(dashboard.recentMilestones).toEqual([]);
    // The dashboard reads six domains; code-intelligence is not one of them.
    expect(dashboard.experiencesLast24h).toBe(12);
    expect(dashboard.assignedRewardsExcluded).toBe(12);
    expect(dashboard.evidenceStatus).toBe('insufficient-evidence');
    expect(dashboard.unmeasured).toEqual(['overallLearningRate', 'topPerformingDomains']);
  });

  it('dashboard ranks domains by measured success rate only', async () => {
    await publishAssigned(6);
    await eventBus.publish(createMockEvent('test-execution.TestRunCompleted', 'test-execution', {
      runId: 'r-1', passed: 1, failed: 3, duration: 10,
    }));

    const result = await tool().invoke({ action: 'dashboard' }, { memory });

    expect(result.data?.dashboardResult?.topPerformingDomains).toEqual(['test-execution']);
  });

  it('mining leaves assigned rewards out of avgReward and the anomaly baseline', async () => {
    await publishAssigned(6);
    const service = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });

    const mined = await service.mineExperiences('defect-intelligence', TimeRange.lastNDays(1));

    expect(mined.success && mined.value).toMatchObject({
      experienceCount: 6,
      measuredExperienceCount: 0,
      assignedRewardsExcluded: 6,
      evidenceStatus: 'insufficient-evidence',
      successRate: null,
      avgReward: null,
      patterns: [],
      anomalies: [],
    });
  });

  it('clusters report no average reward when every member was assigned one', async () => {
    await publishAssigned(2);
    const service = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
    const recorded = await service.getExperiences('test-generation', TimeRange.lastNDays(1));
    if (!recorded.success) throw recorded.error;

    const clusters = await service.clusterExperiences(recorded.value);

    expect(clusters.success && clusters.value.map(c => c.avgReward)).toEqual([null]);
  });

  it('optimizer refuses to fit or evaluate on assigned rewards', async () => {
    await publishAssigned(25);
    const recorder = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
    const recorded = await recorder.getExperiences('test-generation', TimeRange.lastNDays(1));
    if (!recorded.success) throw recorded.error;
    const optimizer = new MetricsOptimizerService(memory);
    const strategy = { name: 's', parameters: {}, expectedOutcome: {} };

    const optimized = await optimizer.optimizeStrategy(
      strategy, { metric: 'generated', direction: 'maximize', constraints: [] }, recorded.value,
    );
    const evaluated = await optimizer.evaluateStrategy(strategy, recorded.value);

    expect(optimized.success).toBe(false);
    if (!optimized.success) expect(optimized.error.message).toContain('25 with an assigned reward excluded');
    expect(evaluated.success && evaluated.value).toMatchObject({
      evidenceStatus: 'insufficient-evidence', metrics: {}, assignedRewardsExcluded: 25,
    });
  });

  it('optimize action reports insufficient evidence instead of failing on assigned rewards', async () => {
    await publishAssigned(25);

    const result = await tool().invoke({
      action: 'optimize', domain: 'defect-intelligence',
      objective: { metric: 'probability', direction: 'maximize' },
    }, { memory });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.data?.optimizeResult).toMatchObject({
      experiencesUsed: 0,
      assignedRewardsExcluded: 25,
      strategiesEvaluated: 0,
      evidenceStatus: 'insufficient-evidence',
    });
  });

  describe('rows written before the tag existed', () => {
    const legacy = (agent: string, action: string): Pick<Experience, 'agentId' | 'action'> => ({
      agentId: { value: agent, domain: agent as Experience['domain'], type: 'analyzer' }, action,
    });

    it('reads untagged rows from the assigning handlers as assigned, everything else as measured', () => {
      expect(rewardSourceOf(legacy('test-generation', 'test-generated'))).toBe('assigned');
      expect(rewardSourceOf(legacy('coverage-analysis', 'gap-detection'))).toBe('assigned');
      expect(rewardSourceOf(legacy('defect-intelligence', 'defect-prediction'))).toBe('assigned');
      expect(rewardSourceOf(legacy('code-intelligence', 'impact-analysis'))).toBe('assigned');
      expect(rewardSourceOf(legacy('test-execution', 'test-run'))).toBe('measured');
      expect(rewardSourceOf(legacy('quality-assessment', 'gate-evaluation'))).toBe('measured');
      expect(rewardSourceOf(legacy('qe-test-architect', 'test-generated'))).toBe('measured');
      expect(rewardSourceOf({ ...legacy('test-generation', 'test-generated'), rewardSource: 'measured' }))
        .toBe('measured');
    });

    it('excludes a stored pattern mined from assigned rewards from stats and the dashboard', async () => {
      const pattern = (id: string, domain: LearnedPattern['domain'], action: string): LearnedPattern => ({
        id, type: 'test-pattern', domain, name: id, description: 'legacy',
        confidence: 1, usageCount: 0, successRate: 1, context: { tags: [] },
        template: {
          type: 'workflow',
          content: `// Pattern learned from 6 experiences\n// Common actions: ${action}\n// Apply to domain: {{domain}}`,
          variables: [],
        },
        createdAt: new Date(), lastUsedAt: new Date(),
      });
      const legacyAssigned = pattern('legacy-assigned', 'test-generation', 'test-generated');
      const legacyMeasured = { ...pattern('legacy-measured', 'test-execution', 'test-run'), successRate: 0.75, confidence: 0.75 };
      await memory.set('learning:pattern:legacy-assigned', legacyAssigned, { ...LEARNING, persist: true });
      await memory.set('learning:pattern:legacy-measured', legacyMeasured, { ...LEARNING, persist: true });
      expect(isMeasuredPattern(legacyAssigned)).toBe(false);
      expect(isMeasuredPattern(legacyMeasured)).toBe(true);

      const patterns = await tool().invoke({ action: 'patterns' }, { memory });
      const dashboard = await tool().invoke({ action: 'dashboard' }, { memory });

      expect(patterns.data?.patternResult).toMatchObject({
        totalPatterns: 1, avgSuccessRate: 0.75, avgConfidence: 0.75,
      });
      expect(patterns.data?.patternResult?.topPatterns.map(p => p.id)).toEqual(['legacy-measured']);
      expect(dashboard.data?.dashboardResult).toMatchObject({
        totalPatterns: 1, overallLearningRate: 0.75, assignedPatternsExcluded: 1, recentMilestones: [],
      });
    });
  });
});
