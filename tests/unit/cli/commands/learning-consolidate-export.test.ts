import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeLearningSystem: vi.fn(),
  printJson: vi.fn(),
}));

vi.mock('../../../../src/cli/commands/learning-helpers.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/cli/commands/learning-helpers.js')>(),
  initializeLearningSystem: mocks.initializeLearningSystem,
  printJson: mocks.printJson,
}));

import { createLearningCommand } from '../../../../src/cli/commands/learning.js';

const promotablePattern = {
  id: 'promotable',
  name: 'Promotable',
  qeDomain: 'test-generation',
  tier: 'short-term',
  successfulUses: 4,
  successRate: 0.8,
  qualityScore: 0.75,
  confidence: 0.8,
  patternType: 'test-template',
  description: 'durable test pattern',
  template: { type: 'prompt', content: 'test', variables: [] },
  context: { tags: ['test'] },
};

describe('learning consolidate and export regression (#618)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_promoteEligiblePatterns_when_consolidateRuns', async () => {
    const bank = {
      searchPatterns: vi.fn().mockResolvedValue({
        success: true,
        value: [{ pattern: promotablePattern }],
      }),
      promotePattern: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    };
    mocks.initializeLearningSystem.mockResolvedValue(bank);

    await createLearningCommand().exitOverride().parseAsync([
      'node', 'learning', 'consolidate', '--json',
    ]);

    expect(bank.searchPatterns).toHaveBeenCalledWith('', { limit: 1000 });
    expect(bank.promotePattern).toHaveBeenCalledWith('promotable');
    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({
      eligibleCount: 1,
      promotedCount: 1,
      failedCount: 0,
    }));
  });

  it('should_notPromotePatterns_when_consolidateIsDryRun', async () => {
    const bank = {
      searchPatterns: vi.fn().mockResolvedValue({
        success: true,
        value: [{ pattern: promotablePattern }],
      }),
      promotePattern: vi.fn(),
    };
    mocks.initializeLearningSystem.mockResolvedValue(bank);

    await createLearningCommand().exitOverride().parseAsync([
      'node', 'learning', 'consolidate', '--dry-run', '--json',
    ]);

    expect(bank.promotePattern).not.toHaveBeenCalled();
    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({
      dryRun: true,
      eligibleCount: 1,
      promotedCount: 0,
    }));
  });

  it('should_notPromotePattern_when_confidenceIsBelowDocumentedGate', async () => {
    const bank = {
      searchPatterns: vi.fn().mockResolvedValue({
        success: true,
        value: [{ pattern: { ...promotablePattern, confidence: 0.59 } }],
      }),
      promotePattern: vi.fn(),
    };
    mocks.initializeLearningSystem.mockResolvedValue(bank);

    await createLearningCommand().exitOverride().parseAsync([
      'node', 'learning', 'consolidate', '--json',
    ]);

    expect(bank.promotePattern).not.toHaveBeenCalled();
    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({
      eligibleCount: 0,
      confidenceMin: 0.6,
    }));
  });

  it('should_reportPromotionFailures_when_storeRejectsPromotion', async () => {
    const bank = {
      searchPatterns: vi.fn().mockResolvedValue({
        success: true,
        value: [{ pattern: promotablePattern }],
      }),
      promotePattern: vi.fn().mockResolvedValue({
        success: false,
        error: new Error('write failed'),
      }),
    };
    mocks.initializeLearningSystem.mockResolvedValue(bank);

    await createLearningCommand().exitOverride().parseAsync([
      'node', 'learning', 'consolidate', '--json',
    ]);

    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({
      promotedCount: 0,
      failedCount: 1,
      failures: [{ id: 'promotable', error: 'write failed' }],
    }));
  });

  it('should_rejectMalformedThreshold_when_consolidateRuns', async () => {
    mocks.initializeLearningSystem.mockResolvedValue({});

    const operation = createLearningCommand().exitOverride().parseAsync([
      'node', 'learning', 'consolidate', '--threshold', '3uses', '--json',
    ]);

    await expect(operation).rejects.toThrow('threshold must be a positive integer');
  });

  it('should_exportCompleteStoredMetadata_when_exportRuns', async () => {
    const bank = {
      searchPatterns: vi.fn().mockResolvedValue({
        success: true,
        value: [{ pattern: { ...promotablePattern, tier: 'long-term' } }],
      }),
    };
    mocks.initializeLearningSystem.mockResolvedValue(bank);

    await createLearningCommand().exitOverride().parseAsync([
      'node', 'learning', 'export', '--json',
    ]);

    expect(bank.searchPatterns).toHaveBeenCalledWith('', {
      limit: 10000,
      domain: undefined,
    });
    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({
      patternCount: 1,
      patterns: [expect.objectContaining({
        successfulUses: 4,
        successRate: 0.8,
        qualityScore: 0.75,
        tier: 'long-term',
      })],
    }));
  });
});
