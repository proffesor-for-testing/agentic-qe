/**
 * #1075: a task type that no candidate domain plugin executes falls through to
 * the TaskAssigned event fallback, never reaches a terminal state and holds a
 * Queen concurrency slot for good. task_submit and `aqe task submit` reject such
 * types up front through QueenCoordinator.validateTaskExecutable.
 */
import { describe, expect, it } from 'vitest';
import { QueenCoordinator } from '../../../src/coordination/queen-coordinator.js';
import type {
  AgentCoordinator,
  DomainPlugin,
  EventBus,
  MemoryBackend,
} from '../../../src/kernel/interfaces.js';
import type { CrossDomainRouter } from '../../../src/coordination/interfaces.js';
import type { DomainName } from '../../../src/shared/types/index.js';

function plugin(types: string[], withExecutor = true): DomainPlugin {
  return {
    ...(withExecutor ? { executeTask: async () => ({ success: true, value: undefined }) } : {}),
    canHandleTask: (type: string) => types.includes(type),
    getSupportedTaskTypes: () => [...types],
  } as unknown as DomainPlugin;
}

function queenWith(plugins?: Array<[DomainName, DomainPlugin]>): QueenCoordinator {
  return new QueenCoordinator(
    {} as EventBus,
    {} as AgentCoordinator,
    {} as MemoryBackend,
    {} as CrossDomainRouter,
    undefined,
    undefined,
    plugins ? new Map(plugins) : undefined,
  );
}

describe('QueenCoordinator.validateTaskExecutable (#1075)', () => {
  const queen = queenWith([
    ['code-intelligence', plugin(['index', 'search'])],
    ['coverage-analysis', plugin(['analyze-coverage'])],
    ['security-compliance', plugin(['security-audit'])],
    ['quality-assessment', plugin(['assess-quality'], false)],
  ]);

  it('rejects a mapped type its domain plugin does not handle and names the supported types', () => {
    const result = queen.validateTaskExecutable('index-code');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toBe(
      "No handler for task type 'index-code' in domain code-intelligence (supported: index, search)",
    );
  });

  it('rejects an unhandled type on an explicit target domain', () => {
    const result = queen.validateTaskExecutable('scan-security', ['security-compliance']);
    expect(result.success).toBe(false);
  });

  it('accepts a type its domain plugin executes, mapped or explicit', () => {
    expect(queen.validateTaskExecutable('analyze-coverage').success).toBe(true);
    expect(queen.validateTaskExecutable('index' as never, ['code-intelligence']).success).toBe(true);
  });

  it('rejects when any candidate domain cannot run the type, since assignTask may pick it', () => {
    const result = queen.validateTaskExecutable('analyze-coverage', ['coverage-analysis', 'code-intelligence']);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('code-intelligence');
    expect(result.error.message).not.toContain('coverage-analysis');
  });

  it('rejects a plugin that claims the type but has no executeTask', () => {
    expect(queen.validateTaskExecutable('assess-quality').success).toBe(false);
  });

  it('rejects a target domain whose plugin is not loaded', () => {
    const result = queen.validateTaskExecutable('run-chaos', ['chaos-resilience']);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain('chaos-resilience (domain not loaded)');
  });

  it('rejects a type with no configured domain and no target', () => {
    const result = queen.validateTaskExecutable('no-such-type' as never);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toContain("Unknown task type 'no-such-type'");
  });

  it('accepts any configured type when the Queen has no domain plugins to check', () => {
    expect(queenWith().validateTaskExecutable('index-code').success).toBe(true);
  });
});
