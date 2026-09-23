import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowOrchestrator } from '../../../src/coordination/workflow-orchestrator.js';
import { YamlPipelineLoader } from '../../../src/coordination/yaml-pipeline-loader.js';
import type { WorkflowDefinition, WorkflowExecutionStatus } from '../../../src/coordination/workflow-types.js';
import { InMemoryEventBus } from '../../../src/kernel/event-bus.js';
import { DefaultAgentCoordinator } from '../../../src/kernel/agent-coordinator.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import { ok, err } from '../../../src/shared/types/index.js';

const memory = {
  search: async () => [],
  set: async () => {},
} as unknown as MemoryBackend;

function workflow(firstTarget: string, secondTarget: string): WorkflowDefinition {
  return {
    id: 'parallel-composition', name: 'Parallel composition', description: 'Composition regression',
    version: '1.0.0',
    steps: [
      { id: 'first', name: 'First', domain: 'test-generation', action: 'first', outputMapping: { value: firstTarget } },
      { id: 'second', name: 'Second', domain: 'test-generation', action: 'second', outputMapping: { value: secondTarget } },
    ],
  };
}

async function completed(orchestrator: WorkflowOrchestrator): Promise<WorkflowExecutionStatus> {
  const started = await orchestrator.executeWorkflow('parallel-composition');
  expect(started.success).toBe(true);
  if (!started.success) throw started.error;
  await vi.waitFor(() => {
    expect(orchestrator.getWorkflowStatus(started.value)?.status).toMatch(/completed|failed/);
  }, { timeout: 2000 });
  return orchestrator.getWorkflowStatus(started.value)!;
}

describe('parallel workflow output composition (#720)', () => {
  let orchestrator: WorkflowOrchestrator;

  beforeEach(async () => {
    orchestrator = new WorkflowOrchestrator(
      new InMemoryEventBus(), memory, new DefaultAgentCoordinator(),
      { enableEventTriggers: false, persistExecutions: false },
    );
    await orchestrator.initialize();
  });

  afterEach(async () => { await orchestrator.dispose(); });

  it.each([[20, 0], [0, 20]])('rejects an exact output collision regardless of completion order (%i/%i ms)', async (firstDelay, secondDelay) => {
    let calls = 0;
    orchestrator.registerAction('test-generation', 'first', async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, firstDelay));
      return ok({ value: 'first' });
    });
    orchestrator.registerAction('test-generation', 'second', async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, secondDelay));
      return ok({ value: 'second' });
    });
    expect(orchestrator.registerWorkflow(workflow('summary', 'summary')).success).toBe(true);

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.error).toContain('parallel_output_conflict');
    expect(status.currentSteps).toEqual([]);
    expect(status.context.results).toEqual({});
    expect(calls).toBe(0);
    expect(status.parallelCompositionReceipts?.[0]).toMatchObject({
      version: 1, disposition: 'conflict', strategy: 'rejected',
      conflicts: [{ stepA: 'first', pathA: 'summary', stepB: 'second', pathB: 'summary', kind: 'exact' }],
    });
  });

  it('rejects ancestor and descendant targets before either action starts', async () => {
    const first = vi.fn(async () => ok({ value: { security: 'first' } }));
    const second = vi.fn(async () => ok({ value: 'second' }));
    orchestrator.registerAction('test-generation', 'first', first);
    orchestrator.registerAction('test-generation', 'second', second);
    expect(orchestrator.registerWorkflow(workflow('analysis', 'analysis.security')).success).toBe(true);

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.error).toContain('parallel_output_conflict');
    expect(status.context.results).toEqual({});
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(status.parallelCompositionReceipts?.[0].conflicts).toContainEqual({
      stepA: 'first', pathA: 'analysis', stepB: 'second', pathB: 'analysis.security', kind: 'ancestor-descendant',
    });
  });

  it('composes disjoint outputs only after both actions finish', async () => {
    let releaseFirst!: () => void;
    let secondFinished = false;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    orchestrator.registerAction('test-generation', 'first', async () => {
      await firstGate;
      return ok({ value: 'first' });
    });
    orchestrator.registerAction('test-generation', 'second', async () => {
      secondFinished = true;
      return ok({ value: 'second' });
    });
    expect(orchestrator.registerWorkflow(workflow('left', 'right')).success).toBe(true);

    const started = await orchestrator.executeWorkflow('parallel-composition');
    expect(started.success).toBe(true);
    if (!started.success) throw started.error;
    await vi.waitFor(() => expect(secondFinished).toBe(true));
    expect(orchestrator.getWorkflowStatus(started.value)?.context.results).toEqual({});
    expect(orchestrator.getWorkflowStatus(started.value)?.stepResults.has('second')).toBe(false);
    releaseFirst();
    await vi.waitFor(() => expect(orchestrator.getWorkflowStatus(started.value)?.status).toBe('completed'));
    expect(orchestrator.getWorkflowStatus(started.value)?.context.results).toEqual({
      first: { value: 'first' }, second: { value: 'second' }, left: 'first', right: 'second',
    });
    expect(orchestrator.getWorkflowStatus(started.value)?.parallelCompositionReceipts?.[0]).toMatchObject({
      disposition: 'composed', strategy: 'disjoint',
      steps: [{ stepId: 'first', disposition: 'succeeded' }, { stepId: 'second', disposition: 'succeeded' }],
    });
    expect(orchestrator.getWorkflowStatus(started.value)?.parallelCompositionReceipts?.[0].combinedStateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the same combined-state hash when completion order reverses', async () => {
    let firstDelay = 20;
    let secondDelay = 0;
    orchestrator.registerAction('test-generation', 'first', async () => {
      await new Promise(resolve => setTimeout(resolve, firstDelay));
      return ok({ value: 'first' });
    });
    orchestrator.registerAction('test-generation', 'second', async () => {
      await new Promise(resolve => setTimeout(resolve, secondDelay));
      return ok({ value: 'second' });
    });
    expect(orchestrator.registerWorkflow(workflow('left', 'right')).success).toBe(true);

    const firstRun = await completed(orchestrator);
    firstDelay = 0;
    secondDelay = 20;
    const secondRun = await completed(orchestrator);
    expect(firstRun.context.results).toEqual(secondRun.context.results);
    expect(firstRun.parallelCompositionReceipts?.[0].combinedStateHash).toBe(
      secondRun.parallelCompositionReceipts?.[0].combinedStateHash,
    );
  });

  it('does not commit a successful sibling when another step fails', async () => {
    orchestrator.registerAction('test-generation', 'first', async () => ok({ value: 'first' }));
    orchestrator.registerAction('test-generation', 'second', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return err(new Error('action failed'));
    });
    expect(orchestrator.registerWorkflow(workflow('left', 'right')).success).toBe(true);

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.context.results).toEqual({});
    expect(status.parallelCompositionReceipts?.[0].disposition).toBe('partial');
  });

  it('isolates direct action mutations from sibling inputs and shared context', async () => {
    orchestrator.registerAction('test-generation', 'first', async (_input, context) => {
      context.results.rogue = 'unexpected';
      return ok({ value: 'first' });
    });
    orchestrator.registerAction('test-generation', 'second', async (_input, context) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return ok({ value: Object.hasOwn(context.results, 'rogue') ? 'polluted' : 'clean' });
    });
    expect(orchestrator.registerWorkflow(workflow('left', 'right')).success).toBe(true);

    const status = await completed(orchestrator);
    expect(status.status).toBe('completed');
    expect(status.context.results).toMatchObject({ left: 'first', right: 'clean' });
    expect(status.context.results).not.toHaveProperty('rogue');
  });

  it('applies the same collision guard to a YAML-loaded workflow', async () => {
    const yaml = `
id: parallel-composition
name: YAML collision
steps:
  - id: first
    name: First
    domain: test-generation
    action: first
    outputMapping: { value: summary }
  - id: second
    name: Second
    domain: test-generation
    action: second
    outputMapping: { value: summary }
`;
    const parsed = new YamlPipelineLoader().parse(yaml);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(orchestrator.registerWorkflow(parsed.value).success).toBe(true);
    const first = vi.fn(async () => ok({ value: 'first' }));
    orchestrator.registerAction('test-generation', 'first', first);
    orchestrator.registerAction('test-generation', 'second', async () => ok({ value: 'second' }));

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.error).toContain('parallel_output_conflict');
    expect(first).not.toHaveBeenCalled();
  });

  it('rejects a declared read of a concurrently runnable step', async () => {
    const definition = workflow('left', 'right');
    definition.steps[0].inputMapping = { prior: 'results.second.value' };
    expect(orchestrator.registerWorkflow(definition).success).toBe(true);
    const first = vi.fn(async () => ok({ value: 'first' }));
    orchestrator.registerAction('test-generation', 'first', first);
    orchestrator.registerAction('test-generation', 'second', async () => ok({ value: 'second' }));

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.error).toContain('parallel_dependency_error');
    expect(status.context.results).toEqual({});
    expect(status.parallelCompositionReceipts?.[0].disposition).toBe('invalid');
    expect(first).not.toHaveBeenCalled();
  });

  it('rejects a declared read of a sibling mapped output path', async () => {
    const definition = workflow('summary', 'right');
    definition.steps[1].inputMapping = { prior: 'results.summary' };
    expect(orchestrator.registerWorkflow(definition).success).toBe(true);
    const first = vi.fn(async () => ok({ value: 'first' }));
    orchestrator.registerAction('test-generation', 'first', first);
    orchestrator.registerAction('test-generation', 'second', async () => ok({ value: 'second' }));

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.error).toContain('parallel_dependency_error');
    expect(first).not.toHaveBeenCalled();
  });

  it('rejects reading the entire results object while a sibling writes it', async () => {
    const definition = workflow('left', 'right');
    definition.steps[1].inputMapping = { prior: 'results' };
    expect(orchestrator.registerWorkflow(definition).success).toBe(true);
    const first = vi.fn(async () => ok({ value: 'first' }));
    orchestrator.registerAction('test-generation', 'first', first);
    orchestrator.registerAction('test-generation', 'second', async () => ok({ value: 'second' }));

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.error).toContain('parallel_dependency_error');
    expect(first).not.toHaveBeenCalled();
  });

  it('does not publish any output if staged composition is invalid', async () => {
    const definition = workflow('first.value.deep', 'right');
    orchestrator.registerAction('test-generation', 'first', async () => ok({ value: 1 }));
    orchestrator.registerAction('test-generation', 'second', async () => ok({ value: 'second' }));
    expect(orchestrator.registerWorkflow(definition).success).toBe(true);

    const status = await completed(orchestrator);
    expect(status.status).toBe('failed');
    expect(status.error).toContain('parallel_output_invalid');
    expect(status.context.results).toEqual({});
    expect(status.parallelCompositionReceipts?.[0].disposition).toBe('invalid');
  });

  it('does not map a step output before its approval gate accepts it', async () => {
    const definition: WorkflowDefinition = {
      ...workflow('left', 'right'),
      steps: [{
        id: 'first', name: 'First', domain: 'test-generation', action: 'first',
        outputMapping: { value: 'left' }, approval: true,
      }],
    };
    orchestrator.registerAction('test-generation', 'first', async () => ok({ value: 'unapproved' }));
    expect(orchestrator.registerWorkflow(definition).success).toBe(true);
    const started = await orchestrator.executeWorkflow('parallel-composition');
    expect(started.success).toBe(true);
    if (!started.success) throw started.error;
    await vi.waitFor(() => expect(orchestrator.rejectStep(started.value, 'first', 'rejected')).toBe(true));
    await vi.waitFor(() => expect(orchestrator.getWorkflowStatus(started.value)?.status).toBe('failed'));
    expect(orchestrator.getWorkflowStatus(started.value)?.context.results).toEqual({});
  });

  it('persists the conflict receipt with the workflow execution', async () => {
    const saved = new Map<string, unknown>();
    const backend = {
      search: async () => [],
      set: async (key: string, value: unknown) => { saved.set(key, value); },
    } as unknown as MemoryBackend;
    const persisted = new WorkflowOrchestrator(
      new InMemoryEventBus(), backend, new DefaultAgentCoordinator(),
      { enableEventTriggers: false, persistExecutions: true },
    );
    await persisted.initialize();
    try {
      expect(persisted.registerWorkflow(workflow('summary', 'summary')).success).toBe(true);
      const started = await persisted.executeWorkflow('parallel-composition');
      expect(started.success).toBe(true);
      if (!started.success) throw started.error;
      await vi.waitFor(() => expect(saved.has(`workflow:execution:${started.value}`)).toBe(true));
      const record = saved.get(`workflow:execution:${started.value}`) as WorkflowExecutionStatus;
      expect(record.status).toBe('failed');
      expect(record.parallelCompositionReceipts?.[0].disposition).toBe('conflict');
      expect(record.context.results).toEqual({});
    } finally {
      await persisted.dispose();
    }
  });
});
