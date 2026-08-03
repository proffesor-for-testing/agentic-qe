import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryMocks = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<void>>(),
  getDatabase: vi.fn(),
}));

vi.mock('../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => memoryMocks,
}));

describe('ExperienceReplay initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryMocks.getDatabase.mockReturnValue({
      prepare: vi.fn(() => ({ all: vi.fn(() => []) })),
    });
  });

  it('should share one in-flight initialization across concurrent callers', async () => {
    let finishInitialization!: () => void;
    memoryMocks.initialize.mockImplementation(
      () => new Promise<void>((resolve) => {
        finishInitialization = resolve;
      })
    );
    const { ExperienceReplay } = await import(
      '../../../src/integrations/agentic-flow/reasoning-bank/experience-replay.js'
    );
    const replay = new ExperienceReplay();
    vi.spyOn(replay as never, 'ensureSchema').mockImplementation(() => undefined);
    vi.spyOn(replay as never, 'prepareStatements').mockImplementation(() => undefined);
    vi.spyOn(replay as never, 'loadEmbeddingIndex').mockResolvedValue(undefined);

    const first = replay.initialize();
    await vi.waitFor(() => expect(memoryMocks.initialize).toHaveBeenCalledTimes(1));
    const second = replay.initialize();

    expect(memoryMocks.initialize).toHaveBeenCalledTimes(1);
    finishInitialization();
    await Promise.all([first, second]);
  });
});
