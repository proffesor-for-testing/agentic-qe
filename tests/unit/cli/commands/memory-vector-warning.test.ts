import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleMemoryStore: vi.fn(),
}));

vi.mock('../../../../src/mcp/handlers/memory-handlers.js', () => ({
  handleMemoryStore: mocks.handleMemoryStore,
}));

import { createMemoryCommand } from '../../../../src/cli/commands/memory.js';

describe('memory store vector indexing disclosure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.handleMemoryStore.mockReset();
  });

  it('should warn when KV storage succeeds but vector indexing fails', async () => {
    mocks.handleMemoryStore.mockResolvedValue({
      success: true,
      data: {
        stored: true,
        key: 'example',
        namespace: 'default',
        timestamp: '2026-08-04T00:00:00.000Z',
        persisted: true,
        vectorIndex: {
          status: 'failed',
          error: {
            code: 'VECTOR_INDEX_UNAVAILABLE',
            message: 'Semantic vector indexing is unavailable for this entry.',
          },
        },
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const command = createMemoryCommand(
      {} as never,
      vi.fn() as never,
      vi.fn().mockResolvedValue(true)
    );

    await command.parseAsync(
      ['store', '--key', 'example', '--value', 'value'],
      { from: 'user' }
    );

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Stored "example"'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Semantic vector indexing is unavailable for this entry.')
    );
  });
});
