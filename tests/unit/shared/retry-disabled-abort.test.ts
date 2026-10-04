import { describe, it, expect, vi, afterEach } from 'vitest';
import { withRetry } from '../../../src/shared/retry-engine.js';
afterEach(() => vi.unstubAllEnvs());
describe('retry kill switch cancellation', () => {
  it('does not start a pre-cancelled side effect with retries disabled', async () => {
    vi.stubEnv('AQE_RETRY_DISABLED', 'true');
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    const fn = vi.fn(async () => 'side effect');
    await expect(
      withRetry(fn, { abortSignal: controller.signal }),
    ).rejects.toBe(reason);
    expect(fn).not.toHaveBeenCalled();
  });
  it('still performs one uncancelled attempt without retrying failures', async () => {
    vi.stubEnv('AQE_RETRY_DISABLED', 'true');
    const fn = vi.fn(async () => {
      throw new Error('unavailable');
    });
    await expect(withRetry(fn)).rejects.toThrow('unavailable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
