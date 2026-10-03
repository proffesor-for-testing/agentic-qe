import { beforeEach, describe, expect, it, vi } from 'vitest';

const closers = vi.hoisted(() => [vi.fn(), vi.fn(), vi.fn()]);
vi.mock('../../../src/integrations/ruvector/shared-rvf-dual-writer.js', () => ({ resetSharedRvfDualWriter: closers[0] }));
vi.mock('../../../src/integrations/ruvector/shared-rvf-adapter.js', () => ({ resetSharedRvfAdapter: closers[1] }));
vi.mock('../../../src/kernel/process-lifecycle.js', () => ({ closeRegisteredStores: closers[2] }));

beforeEach(() => {
  vi.resetModules();
  for (const close of closers) close.mockReset();
});

describe('synchronous CLI store cleanup', () => {
  it.each([0, 1, 2])('continues closing stores when closer %s throws, and remains idempotent', async (failure) => {
    const order: number[] = [];
    for (const [index, close] of closers.entries()) {
      close.mockImplementation(() => {
        order.push(index);
        if (index === failure) throw new Error('native close failed');
      });
    }
    const { releaseCliProcessStores } = await import('../../../src/cli/process-store-cleanup.js');
    expect(() => releaseCliProcessStores()).not.toThrow();
    expect(() => releaseCliProcessStores()).not.toThrow();
    expect(order).toEqual([0, 1, 2]);
    for (const close of closers) expect(close).toHaveBeenCalledOnce();
  });
});
