import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';

const chat = vi.fn();

vi.mock('../../../../src/shared/llm/llm-router-service.js', () => ({
  createLLMRouterService: vi.fn(async () => ({ router: { chat } })),
}));

import { createQualityGateCommand } from '../../../../src/cli/commands/quality-gate.js';

describe('quality-gate CLI diagnostics', () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    chat.mockReset();
    vi.spyOn(console, 'log').mockImplementation((message) => stdout.push(String(message)));
    vi.spyOn(console, 'error').mockImplementation((message) => stderr.push(String(message)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_keepStdoutParseable_when_judgeFailureIsLoggedToStderr', async () => {
    // Arrange: preflight succeeds, then both grade attempts fail.
    chat
      .mockResolvedValueOnce({ content: 'OK' })
      .mockRejectedValueOnce(new Error('provider spawn failed'))
      .mockRejectedValueOnce(new Error('provider spawn failed'));
    const cleanupAndExit = vi.fn(async () => undefined) as unknown as (
      code: number,
    ) => Promise<never>;
    const command = createQualityGateCommand(
      {} as CLIContext,
      cleanupAndExit,
      vi.fn(async () => true),
    );

    // Act
    await command.parseAsync([
      '--checklist', 'A1-inRange',
      '--artifact', 'test artifact',
      '--oracle-passed',
      '--baseline-passed',
      '--anchor', path.resolve('verification/anchors/qe-anchor-v1.json'),
      '--format', 'json',
    ], { from: 'user' });

    // Assert
    expect(stdout, stderr.join('\n')).not.toHaveLength(0);
    expect(() => JSON.parse(stdout.join('\n'))).not.toThrow();
    expect(stderr.join('\n')).toContain('provider spawn failed');
    expect(cleanupAndExit).toHaveBeenCalledWith(3);
  });
});
