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
  });
});
