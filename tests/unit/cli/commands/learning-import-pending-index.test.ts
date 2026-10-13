/**
 * Issue #981 (related): `aqe learning import` of a 20-pattern export into a
 * project with no embedder imported 0 and skipped 20, although every row was
 * committed and only the vector index was pending. Committed-pending rows are
 * imported (and counted as pending), genuine failures are still skipped.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { PatternMutationError } from '../../../../src/learning/pattern-mutation-error.js';

const dir = mkdtempSync(join(tmpdir(), 'aqe-981-import-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function exportFile(count: number): string {
  const file = join(dir, `export-${count}.json`);
  const patterns = Array.from({ length: count }, (_, i) => ({
    patternType: 'test-template',
    name: `p-${i}`,
    description: `pattern ${i}`,
    template: { type: 'prompt', content: 'x', variables: [] },
    context: { tags: [] },
  }));
  writeFileSync(file, JSON.stringify({ version: '3', patterns }));
  return file;
}

const pending = (id: string) => ({
  success: false as const,
  error: new PatternMutationError(id, 'COMMITTED_PENDING_INDEX', new Error('VECTOR_SPACE_UNVERIFIED: no embedding runtime')),
});

describe('aqe learning import with no embedder (#981)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('imports committed-pending rows instead of skipping them', async () => {
    const storePattern = vi.fn(async (o: { name: string }) => pending(o.name));
    mocks.initializeLearningSystem.mockResolvedValue({ storePattern });

    await createLearningCommand().exitOverride().parseAsync(['node', 'learning', 'import', '-i', exportFile(20), '--json']);

    expect(storePattern).toHaveBeenCalledTimes(20);
    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({
      totalPatterns: 20, imported: 20, skipped: 0, pendingIndex: 20, errors: [],
    }));
  });

  it('still skips a FAILED write', async () => {
    const storePattern = vi.fn(async (o: { name: string }) => ({
      success: false as const,
      error: new PatternMutationError(o.name, 'FAILED', new Error('sqlite locked')),
    }));
    mocks.initializeLearningSystem.mockResolvedValue({ storePattern });

    await createLearningCommand().exitOverride().parseAsync(['node', 'learning', 'import', '-i', exportFile(2), '--json']);

    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({ imported: 0, skipped: 2, pendingIndex: 0 }));
  });

  it('import-merge counts committed-pending rows as imported', async () => {
    const storePattern = vi.fn(async (o: { name: string }) => pending(o.name));
    mocks.initializeLearningSystem.mockResolvedValue({
      storePattern,
      searchPatterns: vi.fn().mockResolvedValue({ success: true, value: [] }),
    });

    await createLearningCommand().exitOverride().parseAsync(['node', 'learning', 'import-merge', '-i', exportFile(3), '--json']);

    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({ imported: 3, skipped: 0 }));
  });
});
