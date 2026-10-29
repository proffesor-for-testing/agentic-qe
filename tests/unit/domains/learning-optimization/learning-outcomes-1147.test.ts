/**
 * #1147 follow-ups to #1142:
 * - item 2: `topPerformingDomains` listed a domain at 0% measured success, and
 *   the domain coordinator ranked domains by pattern count.
 * - item 5: `learn` with `experienceIds` returned `patternsLearned: 0` without
 *   saying why.
 * - item 6: `consolidatePatterns` tagged a merge of pre-#1120 patterns as
 *   `assigned`; a merge keeps the most conservative evidence of its sources.
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
import { buildConsolidatedPattern } from '../../../../src/domains/learning-optimization/pattern-consolidation';
import { rankTopPerformingDomains } from '../../../../src/domains/learning-optimization/domain-ranking';
import { patternEvidenceOf } from '../../../../src/domains/learning-optimization/reward-source';
import type { LearnedPattern } from '../../../../src/domains/learning-optimization/interfaces';
import type { DomainName } from '../../../../src/shared/types';
import { MockAgentCoordinator, MockEventBus } from '../plugin-test-utils';

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

/** A pattern as stored before #1120 (no rewardSource), or tagged when `rewardSource` is given. */
function pattern(
  id: string,
  action: string,
  extra: Partial<LearnedPattern> = {},
  domain: DomainName = 'test-execution'
): LearnedPattern {
  return {
    id, type: 'test-pattern', domain, name: id, description: 'd',
    confidence: 0.9, usageCount: 2, successRate: 0.9, context: { tags: [] },
    template: {
      type: 'workflow',
      content: `// Pattern learned from 6 experiences\n// Common actions: ${action}\n// Apply to domain: {{domain}}`,
      variables: [],
    },
    createdAt: new Date(), lastUsedAt: new Date(),
    ...extra,
  };
}

describe('#1147 learning outcome follow-ups', () => {
  let dir: string;
  let memory: MemoryBackend;
  let eventBus: MockEventBus;
  let agents: MockAgentCoordinator;
  let plugin: LearningOptimizationPlugin;
  const tool = () => new LearningOptimizeTool();
  const api = () => plugin.getAPI<LearningOptimizationAPI>();

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1147-'));
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

  async function recordRuns(
    domain: DomainName,
    passes: boolean[],
    rewardSource: 'measured' | 'assigned' = 'measured'
  ): Promise<string[]> {
    const service = new LearningCoordinatorService({ memory });
    const ids: string[] = [];
    for (const passed of passes) {
      const result = await service.recordExperience({
        agentId: { value: domain, domain, type: 'tester' },
        domain,
        action: 'test-run',
        state: { context: {}, metrics: {} },
        result: { success: passed, outcome: {}, duration: 10 },
        reward: passed ? 1 : 0,
        rewardSource,
      });
      if (result.success) ids.push(result.value);
    }
    return ids;
  }

  describe('item 2: topPerformingDomains', () => {
    it('ranks by measured success and leaves out unmeasured and 0% domains', () => {
      expect(rankTopPerformingDomains([
        { domain: 'test-execution', successRate: 0 },
        { domain: 'coverage-analysis', successRate: null },
        { domain: 'quality-assessment', successRate: 0.5 },
        { domain: 'test-generation', successRate: 0.9 },
      ])).toEqual({ topPerformingDomains: ['test-generation', 'quality-assessment'], measuredDomains: 3 });
    });

    it('MCP dashboard does not list a domain whose measured runs all failed', async () => {
      await recordRuns('test-execution', [false, false, false]);

      const dashboard = (await tool().invoke({ action: 'dashboard' }, { memory })).data!.dashboardResult!;

      expect(dashboard.topPerformingDomains).toEqual([]);
      // The domain is measured, so the ranking is not "unmeasured".
      expect(dashboard.unmeasured ?? []).not.toContain('topPerformingDomains');
    });

    it('MCP dashboard ranks measured domains by success rate', async () => {
      await recordRuns('test-execution', [true, false, false, false]);
      await recordRuns('quality-assessment', [true, true, false]);
      await recordRuns('coverage-analysis', [false, false]);

      const dashboard = (await tool().invoke({ action: 'dashboard' }, { memory })).data!.dashboardResult!;

      expect(dashboard.topPerformingDomains).toEqual(['quality-assessment', 'test-execution']);
    });

    it('domain coordinator dashboard ranks by measured success, not pattern count', async () => {
      // Many stored patterns in test-execution, whose runs all failed.
      for (let i = 0; i < 3; i++) {
        await memory.set(`learning:pattern:te-${i}`, pattern(`te-${i}`, 'test-run', { rewardSource: 'measured' }), LEARNING);
      }
      await recordRuns('test-execution', [false, false]);
      await recordRuns('quality-assessment', [true, false]);
      await recordRuns('test-generation', [true, true], 'assigned');

      const dashboard = await api().getLearningDashboard();

      expect(dashboard.success && dashboard.value.topPerformingDomains).toEqual(['quality-assessment']);
    });
  });

  describe('item 5: learn with experienceIds says why nothing was learned', () => {
    it('when none of the IDs exists', async () => {
      const result = await tool().invoke({ action: 'learn', experienceIds: ['missing-1', 'missing-2'] }, { memory });

      expect(result.data?.learnResult).toMatchObject({
        patternsLearned: 0,
        noPatternReason: 'None of the 2 requested experience ID(s) were found.',
      });
    });

    it('when no experience read has a measured outcome', async () => {
      const ids = await recordRuns('test-execution', [true, true], 'assigned');

      const result = await tool().invoke({ action: 'learn', experienceIds: ids }, { memory });

      expect(result.data?.learnResult).toMatchObject({
        patternsLearned: 0,
        noPatternReason: 'None of the 2 experience(s) read has a measured outcome (2 with an assigned reward excluded).',
      });
    });

    it('when learning itself rejects the experiences', async () => {
      const ids = await recordRuns('test-execution', [false, false, false, false, false]);

      const result = await tool().invoke({ action: 'learn', experienceIds: ids }, { memory });

      expect(result.data?.learnResult?.patternsLearned).toBe(0);
      expect(result.data?.learnResult?.noPatternReason).toMatch(/^Success rate 0 below threshold/);
    });

    it('gives no reason when a pattern was learned', async () => {
      const ids = await recordRuns('test-execution', [true, true, true, true, false]);

      const result = await tool().invoke({ action: 'learn', experienceIds: ids }, { memory });

      expect(result.data?.learnResult?.patternsLearned).toBe(1);
      expect(result.data?.learnResult).not.toHaveProperty('noPatternReason');
    });
  });

  describe('item 6: a merge keeps the most conservative evidence of its sources', () => {
    const measured = (id: string) => pattern(id, 'test-run', { rewardSource: 'measured' });
    const pre1120 = (id: string) => pattern(id, 'test-run');
    const assigned = (id: string) => pattern(id, 'test-generated', {}, 'test-generation');

    it.each([
      ['measured + measured -> measured', [measured('a'), measured('b')], 'measured'],
      ['pre-1120 + pre-1120 -> pre-1120', [pre1120('a'), pre1120('b')], 'pre-1120'],
      ['measured + pre-1120 (best template measured) -> pre-1120', [{ ...measured('a'), successRate: 1 }, pre1120('b')], 'pre-1120'],
      ['measured + pre-1120 (best template pre-1120) -> pre-1120', [measured('a'), { ...pre1120('b'), successRate: 1 }], 'pre-1120'],
      ['pre-1120 + assigned -> assigned', [pre1120('a'), assigned('b')], 'assigned'],
      ['measured + assigned -> assigned', [measured('a'), assigned('b')], 'assigned'],
    ] as const)('%s', (_label, sources, expected) => {
      const merged = buildConsolidatedPattern(sources, 'merged');

      expect(patternEvidenceOf(merged)).toBe(expected);
    });

    it('consolidatePatterns stores a merge of pre-#1120 patterns untagged, read as pre-1120', async () => {
      await memory.set('learning:pattern:p1', pre1120('p1'), LEARNING);
      await memory.set('learning:pattern:p2', pre1120('p2'), LEARNING);
      const service = new LearningCoordinatorService({ memory });

      const result = await service.consolidatePatterns(['p1', 'p2']);

      expect(result.success).toBe(true);
      const stored = await memory.get<LearnedPattern>(`learning:pattern:${result.success && result.value.id}`, LEARNING);
      expect(stored).not.toHaveProperty('rewardSource');
      expect(patternEvidenceOf(stored!)).toBe('pre-1120');
    });
  });
});
