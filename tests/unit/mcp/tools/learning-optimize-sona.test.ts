import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningOptimizeTool } from '../../../../src/mcp/tools/learning-optimization/optimize.js';
import type { MemoryBackend, QEKernel } from '../../../../src/kernel/interfaces.js';

const PERSISTED_STATS = {
  totalPatterns: 5,
  uniqueTypes: 2,
  uniqueDomains: 2,
  avgConfidence: 0.82,
  avgUsage: 3.4,
  totalSuccesses: 9,
  totalFailures: 2,
  byType: { successful: 4, optimization: 1 },
  byDomain: { 'test-generation': 3, 'quality-assessment': 2 },
};

describe('LearningOptimizeTool SONA visibility', () => {
  let tool: LearningOptimizeTool;
  let memory: MemoryBackend;
  let kernel: QEKernel;
  const getSONAPersistedStats = vi.fn();

  beforeEach(() => {
    tool = new LearningOptimizeTool();
    getSONAPersistedStats.mockReset().mockResolvedValue(PERSISTED_STATS);
    memory = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as unknown as MemoryBackend;
    kernel = {
      getDomainAPI: vi.fn().mockReturnValue({
        isSONAAvailable: () => true,
        getSONAPersistedStats,
      }),
    } as unknown as QEKernel;
  });

  it('should_includeReadOnlySONAStats_when_patternsActionUsesInitializedKernel', async () => {
    // Act
    const result = await tool.invoke({ action: 'patterns' }, { memory, kernel });

    // Assert
    expect(result.data?.patternResult?.sona).toEqual({ available: true, stats: PERSISTED_STATS });
  });

  it('should_includeReadOnlySONAStats_when_dashboardActionUsesInitializedKernel', async () => {
    // Act
    const result = await tool.invoke({ action: 'dashboard' }, { memory, kernel });

    // Assert
    expect(result.data?.dashboardResult?.sona).toEqual({ available: true, stats: PERSISTED_STATS });
  });

  it('should_reportSONAUnavailable_when_fleetKernelIsAbsent', async () => {
    // Act
    const result = await tool.invoke({ action: 'patterns' }, { memory });

    // Assert
    expect(result.data?.patternResult?.sona).toEqual({ available: false, stats: null });
  });
});
