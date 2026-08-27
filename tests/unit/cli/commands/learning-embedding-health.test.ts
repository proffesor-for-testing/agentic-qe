import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  rows: [
    { spaceId: 'active-space' },
    { spaceId: 'other-space' },
    { spaceId: null },
  ],
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: () => '/test-project',
}));

vi.mock('../../../../src/learning/real-embeddings.js', () => ({
  getActiveEmbeddingSpaceIdentity: () => ({ spaceId: 'active-space' }),
}));

vi.mock('../../../../src/shared/safe-db.js', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      get: () => sql.includes('sqlite_master') ? { name: 'qe_pattern_embeddings' } : undefined,
      all: () => sql.includes('table_info') ? [{ name: 'space_id' }] : mocks.rows,
    }),
    close: mocks.close,
  }),
}));

import { createLearningCommand } from '../../../../src/cli/commands/learning.js';

describe('learning embedding-health command (#633)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports verified, mismatched, and unverified vectors as JSON', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const command = createLearningCommand().exitOverride();

    await command.parseAsync(['embedding-health', '--json'], { from: 'user' });

    const output = JSON.parse(log.mock.calls.map(([value]) => String(value)).join('\n'));
    expect(output).toMatchObject({
      status: 'unverified',
      activeSpaceId: 'active-space',
      storedSpaceIds: ['active-space', 'other-space'],
      verifiedVectors: 1,
      mismatchedVectors: 1,
      unverifiedVectors: 1,
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
