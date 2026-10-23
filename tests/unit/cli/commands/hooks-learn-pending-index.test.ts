/**
 * Issue #981: `aqe hooks learn` exited 1 with a raw COMMITTED_PENDING_INDEX /
 * VECTOR_SPACE_UNVERIFIED error even though the authoritative SQLite row was
 * committed (only the derived vector index was unavailable). A committed row
 * is a stored pattern: the command reports success, says the vector index is
 * pending and how to fill it, and exits 0. A genuine failure still fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const shared = vi.hoisted(() => ({
  storePattern: vi.fn(),
  getPattern: vi.fn(),
  getEmbedderFailure: vi.fn((): string | null => null),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/cli/commands/hooks-handlers/hooks-shared.js')>();
  return {
    ...actual,
    getHooksSystem: vi.fn(async () => ({
      reasoningBank: {
        storePattern: shared.storePattern,
        getPattern: shared.getPattern,
        getEmbedderFailure: shared.getEmbedderFailure,
      },
      hookRegistry: {},
    })),
  };
});

import { registerStatsHooks } from '../../../../src/cli/commands/hooks-handlers/stats-hooks.js';
import { PatternMutationError } from '../../../../src/learning/pattern-mutation-error.js';

const PATTERN = {
  id: 'p-981',
  name: 'retry-on-flaky-network',
  patternType: 'test-template',
  qeDomain: 'test-generation',
  tier: 'short-term',
};

async function runLearn(extra: string[] = []): Promise<void> {
  const hooks = new Command('hooks').exitOverride();
  registerStatsHooks(hooks);
  await hooks.parseAsync(['learn', '-n', PATTERN.name, '-d', 'Wrap flaky calls in retry', ...extra], { from: 'user' });
}

describe('aqe hooks learn — committed row with pending vector index (#981)', () => {
  let out: string[];

  beforeEach(() => {
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    shared.storePattern.mockReset();
    shared.getPattern.mockReset();
    shared.getEmbedderFailure.mockReset();
    shared.getEmbedderFailure.mockReturnValue(null);
    vi.unstubAllEnvs();
  });

  it('reports the committed pattern as stored, with the index pending, and does not throw', async () => {
    shared.storePattern.mockResolvedValue({
      success: false,
      error: new PatternMutationError(PATTERN.id, 'COMMITTED_PENDING_INDEX',
        new Error('RVF unavailable after authoritative pattern commit: VECTOR_SPACE_UNVERIFIED: no embedding runtime')),
    });
    shared.getPattern.mockResolvedValue(PATTERN);

    await expect(runLearn(['--json'])).resolves.toBeUndefined();

    const json = JSON.parse(out.join('\n'));
    expect(json).toMatchObject({
      success: true,
      pattern: { id: PATTERN.id, name: PATTERN.name },
      vectorIndex: 'pending',
    });
    expect(json.warning).toMatch(/backfill-embeddings/);
    expect(shared.getPattern).toHaveBeenCalledWith(PATTERN.id);
  });

  it('human output says stored + pending and prints no stack trace', async () => {
    shared.storePattern.mockResolvedValue({
      success: false,
      error: new PatternMutationError(PATTERN.id, 'COMMITTED_PENDING_INDEX', new Error('HNSW unavailable')),
    });
    shared.getPattern.mockResolvedValue(PATTERN);

    await runLearn();

    const text = out.join('\n');
    expect(text).toContain(`Pattern stored: ${PATTERN.name}`);
    expect(text).toMatch(/vector index pending/i);
    expect(text).not.toMatch(/\n\s+at /);
  });

  it('#981 review N1: with a working embedder the vector is stored, so no install/backfill advice is given', async () => {
    shared.storePattern.mockResolvedValue({
      success: false,
      error: new PatternMutationError(PATTERN.id, 'COMMITTED_PENDING_INDEX',
        new Error('RVF unavailable after authoritative pattern commit: VECTOR_SPACE_UNVERIFIED: no embedding runtime was available when the RVF index was opened')),
    });
    shared.getPattern.mockResolvedValue({ ...PATTERN, embedding: Array.from({ length: 384 }, () => 0.01) });

    await runLearn(['--json']);

    const json = JSON.parse(out.join('\n'));
    expect(json.vectorIndex).toBe('sqlite');
    expect(json.warning).toMatch(/vector is stored/i);
    expect(json.warning).toMatch(/next time/i);
    expect(json.warning).not.toMatch(/AQE_EMBEDDER_ENDPOINT|@huggingface|backfill-embeddings/);
  });

  it('a successful store with a vector reports it indexed and prints no notice', async () => {
    shared.storePattern.mockResolvedValue({ success: true, value: { ...PATTERN, embedding: [0.1, 0.2] } });

    await runLearn(['--json']);

    const json = JSON.parse(out.join('\n'));
    expect(json.vectorIndex).toBe('indexed');
    expect(json).not.toHaveProperty('warning');
  });

  it('a FAILED disposition is still a failure', async () => {
    shared.storePattern.mockResolvedValue({
      success: false,
      error: new PatternMutationError(PATTERN.id, 'FAILED', new Error('sqlite locked')),
    });

    await expect(runLearn()).rejects.toThrow(/FAILED/);
    expect(shared.getPattern).not.toHaveBeenCalled();
  });

  describe('#1204: AQE_EMBEDDER_ENDPOINT is set but the endpoint failed', () => {
    const REASON = 'Failed to initialize transformer model: connect ECONNREFUSED 127.0.0.1:8099';

    it('says the configured endpoint failed, with the reason, instead of "no embedding runtime"', async () => {
      vi.stubEnv('AQE_EMBEDDER_ENDPOINT', 'http://user:secret@127.0.0.1:8099');
      shared.storePattern.mockResolvedValue({ success: true, value: { ...PATTERN } });
      shared.getEmbedderFailure.mockReturnValue(REASON);

      await runLearn(['--json']);

      const json = JSON.parse(out.join('\n'));
      expect(json.vectorIndex).toBe('pending');
      expect(json.warning).toContain('configured embedding endpoint');
      expect(json.warning).toContain('AQE_EMBEDDER_ENDPOINT=http://127.0.0.1:8099');
      expect(json.warning).toContain('failed: connect ECONNREFUSED 127.0.0.1:8099.');
      expect(json.warning).toMatch(/backfill-embeddings/);
      expect(json.warning).not.toMatch(/no embedding runtime|Set AQE_EMBEDDER_ENDPOINT|secret|transformer/i);
    });

    it('human output prints the same failure hint', async () => {
      vi.stubEnv('AQE_EMBEDDER_ENDPOINT', 'http://127.0.0.1:8099');
      shared.storePattern.mockResolvedValue({ success: true, value: { ...PATTERN } });
      shared.getEmbedderFailure.mockReturnValue(REASON);

      await runLearn();

      const text = out.join('\n');
      expect(text).toMatch(/Vector index pending: .*configured embedding endpoint .* failed: .*ECONNREFUSED/);
    });

    it('keeps the "no embedding runtime" advice when nothing failed', async () => {
      shared.storePattern.mockResolvedValue({ success: true, value: { ...PATTERN } });

      await runLearn(['--json']);

      expect(JSON.parse(out.join('\n')).warning).toMatch(/no embedding runtime is available/);
    });
  });
});
