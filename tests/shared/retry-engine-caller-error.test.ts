import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallerInputError } from '../../src/shared/error-utils.js';
import { isRetryableError, withRetry } from '../../src/shared/retry-engine.js';

afterEach(() => vi.unstubAllEnvs());

describe('Retry engine caller-input errors', () => {
  it.each([new CallerInputError('invalid option'), { callerError: true, message: 'invalid option' }])('does not retry a deterministic caller failure', async error => {
    vi.stubEnv('AQE_RETRY_DISABLED', 'false');
    const operation = vi.fn(async () => { throw error; });
    const onRetry = vi.fn();
    await expect(withRetry(operation, { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, onRetry })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(isRetryableError(error)).toBe(false);
  });

  it('retains the explicit predicate override and retries transient network failures', async () => {
    vi.stubEnv('AQE_RETRY_DISABLED', 'false');
    const caller = new CallerInputError('caller decided to retry');
    const override = vi.fn().mockRejectedValueOnce(caller).mockResolvedValue('fixed');
    expect((await withRetry(override, { maxAttempts: 2, baseDelayMs: 0, retryableErrors: () => true })).result).toBe('fixed');
    const network = vi.fn().mockRejectedValueOnce(Object.assign(new Error('connection'), { code: 'ECONNRESET' })).mockResolvedValue('ready');
    expect((await withRetry(network, { maxAttempts: 2, baseDelayMs: 0 })).result).toBe('ready');
  });
});
