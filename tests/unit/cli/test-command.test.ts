import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestCommand } from '../../../src/cli/commands/test.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

describe('test command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes an explicit Node framework to test execution', async () => {
    const runTests = vi.fn().mockResolvedValue({
      success: true,
      value: { passed: 1, failed: 0, skipped: 0, duration: 1 },
    });
    const context = {
      kernel: {
        getDomainAPIAsync: vi.fn().mockResolvedValue({ runTests }),
        memory: { set: vi.fn().mockResolvedValue(undefined) },
      },
    } as unknown as CLIContext;
    const command = createTestCommand(
      context,
      vi.fn() as unknown as (code: number) => Promise<never>,
      vi.fn().mockResolvedValue(true)
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.parseAsync([
      'execute',
      'tests/unit/cli/commands.test.ts',
      '--framework',
      'node',
    ], { from: 'user' });

    expect(runTests).toHaveBeenCalledWith(expect.objectContaining({
      framework: 'node',
    }));
    expect(context.kernel.memory.set).toHaveBeenCalledWith(
      'test-run:latest',
      expect.objectContaining({ passed: 1, failed: 0, skipped: 0 }),
      { namespace: 'test-execution', persist: true },
    );
  });

  it('exits unsuccessfully without publishing quality evidence when execution fails', async () => {
    const runTests = vi.fn().mockResolvedValue({ success: false, error: new Error('Runner could not complete') });
    const context = {
      kernel: {
        getDomainAPIAsync: vi.fn().mockResolvedValue({ runTests }),
        memory: { set: vi.fn() },
      },
    } as unknown as CLIContext;
    const cleanupAndExit = vi.fn(async (code: number): Promise<never> => {
      throw Object.assign(new Error('exit'), { exitCode: code });
    });
    const command = createTestCommand(context, cleanupAndExit, vi.fn().mockResolvedValue(true));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(command.parseAsync(['execute', 'tests/unit/cli/commands.test.ts'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(cleanupAndExit.mock.calls[0]).toEqual([1]);
    expect(context.kernel.memory.set).not.toHaveBeenCalled();
  });
});
