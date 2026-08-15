import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const { routeTaskMock } = vi.hoisted(() => ({
  routeTaskMock: vi.fn(),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/hooks-route-pattern-test'),
  getUnifiedMemory: vi.fn(() => ({
    isInitialized: vi.fn(() => true),
    getDatabase: vi.fn(() => { throw new Error('persistence disabled in boundary test'); }),
  })),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../../src/cli/commands/hooks-handlers/hooks-shared.js')
  >();
  return {
    ...actual,
    getHooksSystem: vi.fn().mockResolvedValue({
      hookRegistry: { emit: vi.fn().mockResolvedValue([]) },
      reasoningBank: { routeTask: routeTaskMock },
    }),
  };
});

import { registerRoutingHooks } from '../../../../src/cli/commands/hooks-handlers/routing-hooks.js';

describe('hooks route learned-pattern output', () => {
  beforeEach(() => {
    routeTaskMock.mockReset().mockResolvedValue({
      success: true,
      value: {
        recommendedAgent: 'qe-test-architect',
        confidence: 0.6,
        alternatives: [],
        domains: ['test-generation'],
        patterns: [{
          id: 'pattern-1',
          name: 'Checkout integration fixture',
          description: 'Reuse the checkout service fixture',
          confidence: 0.82,
        }],
        guidance: [
          'Static domain guidance',
          '--- Relevant Patterns ---',
          '[Pattern: Checkout integration fixture] Reuse the checkout service fixture',
        ],
        reasoning: 'Domain match; Found 1 relevant pattern(s)',
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('retains patternCount and serializes backward-compatible pattern details as JSON', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => output.push(String(value)));
    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);

    await hooks.parseAsync(['route', '--task', 'test checkout', '--json'], { from: 'user' });

    const payload = JSON.parse(output.join('\n'));
    expect(payload.patternCount).toBe(1);
    expect(payload.patterns).toEqual([{
      id: 'pattern-1',
      name: 'Checkout integration fixture',
      description: 'Reuse the checkout service fixture',
      confidence: 0.82,
    }]);
    expect(routeTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      includePatternGuidance: true,
    }));
  });

  it('prints learned pattern guidance in non-JSON output', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
      output.push(values.map(String).join(' '));
    });
    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);

    await hooks.parseAsync(['route', '--task', 'test checkout'], { from: 'user' });

    expect(output.join('\n')).toContain('Checkout integration fixture');
    expect(output.join('\n')).toContain('Relevant Patterns');
  });
});
