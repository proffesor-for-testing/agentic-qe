import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestGeneratorService } from '../../../src/domains/test-generation/services/test-generator';
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

describe('#787 CLI behavior examples', () => {
  it('loads caller fixtures, invokes the real generator, and publishes passing quality evidence', async () => {
    const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'aqe-cli-787-'));
    const source = join(directory, 'add.js');
    const fixtures = join(directory, 'examples.json');
    const output = join(directory, 'result.json');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    writeFileSync(fixtures, JSON.stringify([{ functionName: 'add', args: [2,3], expected: 5 }]));
    const memory = { set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() };
    const generator = createTestGeneratorService(memory as never);
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => generator), memory } } as unknown as CLIContext;
    const exit = vi.fn() as unknown as (code: number) => Promise<never>;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync([
        'generate', source, '--behavior-examples', fixtures, '--framework', 'node-test', '--format', 'json', '--output', output,
      ], { from: 'user' });
      const result = JSON.parse(readFileSync(output, 'utf8'));
      expect(result.tests[0]).toMatchObject({ generationMode: 'behavior-examples', assertions: 1, qualityGateResult: { passed: true } });
      expect(result.coverageEstimate).toBe(0);
      expect(exit).not.toHaveBeenCalledWith(1);
    } finally {
      log.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
