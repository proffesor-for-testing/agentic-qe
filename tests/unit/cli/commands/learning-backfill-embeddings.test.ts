import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getGhostPatternCount: vi.fn(),
  backfillEmbeddings: vi.fn(),
  close: vi.fn(),
}));

vi.mock('../../../../src/learning/sqlite-persistence.js', () => ({
  createSQLitePatternStore: () => storeMocks,
}));

import { createLearningCommand } from '../../../../src/cli/commands/learning.js';

describe('learning backfill-embeddings command (#584)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.getGhostPatternCount.mockReturnValue({
      total: 8,
      withoutEmbeddings: 3,
      sampleGhostIds: ['p1', 'p2', 'p3'],
    });
    storeMocks.backfillEmbeddings.mockResolvedValue({
      processed: 3,
      skipped: 0,
      errors: 0,
      alreadyHad: 5,
      method: 'transformer',
    });
  });

  it('should report missing embeddings without writing during a dry run', async () => {
    const command = createLearningCommand().exitOverride();

    await command.parseAsync(['backfill-embeddings', '--dry-run', '--json'], { from: 'user' });

    expect(storeMocks.backfillEmbeddings).not.toHaveBeenCalled();
  });

  it('should pass the requested batch size to the repair operation', async () => {
    const command = createLearningCommand().exitOverride();

    await command.parseAsync(['backfill-embeddings', '--batch-size', '17', '--json'], {
      from: 'user',
    });

    expect(storeMocks.backfillEmbeddings).toHaveBeenCalledWith(17);
  });

  it('should reject a non-positive batch size', async () => {
    const command = createLearningCommand().exitOverride();

    await expect(
      command.parseAsync(['backfill-embeddings', '--batch-size', '0'], { from: 'user' })
    ).rejects.toThrow('batch size must be a positive integer');
  });
});
