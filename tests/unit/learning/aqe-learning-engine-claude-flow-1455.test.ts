/**
 * Issue #1455 (review of PR #1489): AQELearningEngine with Claude Flow on.
 *
 * With experience capture on (the default), the engine's task id is the experience id,
 * and it used to pass that id to TrajectoryBridge.recordStep/endTrajectory. The bridge
 * did not know it, the steps and the end went to ruflo with an unknown id, the ruflo
 * trajectory stayed open, and qe_trajectories got no row.
 *
 * ruflo is faked at child_process.execFile (it answers like `ruflo mcp exec` 3.76.0:
 * an unknown trajectory id gives `recorded: false` / `trajectory: null`). The unified
 * memory database is real, in a temporary project.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { ruflo, execFile } = vi.hoisted(() => {
  type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

  /** A fake ruflo: trajectories it started, and every tool call it got. */
  const ruflo = {
    open: new Map<string, number>(),
    calls: [] as Array<{ tool: string; params: Record<string, unknown> }>,
    next: 1,
  };

  function answer(tool: string, params: Record<string, unknown>): Record<string, unknown> {
    const id = String(params.trajectoryId ?? '');
    switch (tool) {
      case 'hooks_intelligence_trajectory-start': {
        const trajectoryId = `traj-fake-${ruflo.next++}`;
        ruflo.open.set(trajectoryId, 0);
        return { trajectoryId, status: 'recording', persisted: true };
      }
      case 'hooks_intelligence_trajectory-step':
        if (!ruflo.open.has(id)) return { trajectoryId: id, recorded: false, implementation: 'trajectory-not-found' };
        ruflo.open.set(id, ruflo.open.get(id)! + 1);
        return { trajectoryId: id, recorded: true, totalSteps: ruflo.open.get(id) };
      case 'hooks_intelligence_trajectory-end': {
        if (!ruflo.open.has(id)) return { trajectoryId: id, persisted: false, trajectory: null, note: 'Trajectory not found' };
        const totalSteps = ruflo.open.get(id);
        ruflo.open.delete(id);
        return { trajectoryId: id, persisted: true, trajectory: { totalSteps } };
      }
      default:
        return { success: false, error: `unexpected tool ${tool}` };
    }
  }

  const execFile = vi.fn((_bin: string, args: string[], _opts: unknown, cb: ExecCallback) => {
    const tool = args[args.indexOf('--tool') + 1];
    const params = JSON.parse(args[args.indexOf('--params') + 1]) as Record<string, unknown>;
    ruflo.calls.push({ tool, params });
    setImmediate(() => cb(null, `[OK] Tool executed\n\nResult:\n${JSON.stringify(answer(tool, params), null, 2)}\n`, ''));
  });
  return { ruflo, execFile };
});

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile,
}));
vi.mock('../../../src/adapters/claude-flow/detect.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/adapters/claude-flow/detect.js')>()),
  detectClaudeFlow: () => ({ available: true, method: 'npx-cached', version: '3.76.0' }),
  resolveCliPackage: () => 'ruflo',
}));

import { createAQELearningEngine, type AQELearningEngine } from '../../../src/learning/aqe-learning-engine.js';
import { getUnifiedMemory, resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import { clearProjectRootCache } from '../../../src/kernel/project-root.js';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import { createMockEventBus, createMockMemoryBackend } from './_aqe-engine-test-helpers';

describe('AQELearningEngine with Claude Flow (#1455)', () => {
  const savedRoot = process.env.AQE_PROJECT_ROOT;
  const savedBackend = process.env.AQE_MEMORY_BACKEND;
  let projectRoot: string;
  let engine: AQELearningEngine;

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-1455-engine-'));
    process.env.AQE_PROJECT_ROOT = projectRoot;
    process.env.AQE_MEMORY_BACKEND = 'memory';
    clearProjectRootCache();
    resetUnifiedMemory();
  });

  afterAll(() => {
    resetUnifiedMemory();
    if (savedRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedRoot;
    if (savedBackend === undefined) delete process.env.AQE_MEMORY_BACKEND;
    else process.env.AQE_MEMORY_BACKEND = savedBackend;
    clearProjectRootCache();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    resetUnifiedPersistence();
    ruflo.open.clear();
    ruflo.calls.length = 0;
    ruflo.next = 1;
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    engine = createAQELearningEngine(
      createMockMemoryBackend(),
      { projectRoot, enableClaudeFlow: true, enableExperienceCapture: true },
      createMockEventBus()
    );
    await engine.initialize();
  }, 60_000);

  afterEach(async () => {
    await engine.dispose();
    resetRuVectorFeatureFlags();
    vi.restoreAllMocks();
  });

  it('should_sendStepsAndEndToRuflosTrajectory_when_experienceCaptureIsOn', async () => {
    expect(engine.getStatus().features.trajectories).toBe(true);

    const taskId = await engine.startTask('Generate unit tests for UserService', 'qe-test-architect');
    await engine.recordStep(taskId, 'analyze', 'ok', 0.9);
    await engine.recordStep(taskId, 'generate', 'ok', 0.8);
    await engine.endTask(taskId, true, 'fine');

    expect(taskId).not.toMatch(/^traj-/); // the engine's own id, not ruflo's
    expect(ruflo.calls.map((c) => `${c.tool.replace('hooks_intelligence_', '')} ${String(c.params.trajectoryId ?? '')}`)).toEqual([
      'trajectory-start ',
      'trajectory-step traj-fake-1',
      'trajectory-step traj-fake-1',
      'trajectory-end traj-fake-1',
    ]);
    expect(ruflo.open.size).toBe(0); // closed, not orphaned
  });

  it('should_saveTheTrajectoryWithItsSteps_when_theTaskEnds', async () => {
    const taskId = await engine.startTask('Generate unit tests for UserService', 'qe-test-architect');
    await engine.recordStep(taskId, 'analyze', 'ok', 0.9);
    await engine.recordStep(taskId, 'generate', 'ok', 0.8);
    await engine.endTask(taskId, true, 'fine');

    const um = getUnifiedMemory();
    if (!um.isInitialized()) await um.initialize();
    const rows = um
      .getDatabase()
      .prepare('SELECT id, agent, success, steps_json, feedback FROM qe_trajectories WHERE id = ?')
      .all('traj-fake-1') as Array<{ id: string; agent: string; success: number; steps_json: string; feedback: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agent: 'qe-test-architect', success: 1, feedback: 'fine' });
    expect((JSON.parse(rows[0].steps_json) as Array<{ action: string }>).map((s) => s.action)).toEqual(['analyze', 'generate']);
  });

  it('should_notCallRuflo_when_aStepIsForAnUnknownTask', async () => {
    await engine.recordStep('exp-unknown', 'x');
    await engine.endTask('exp-unknown', true);
    expect(ruflo.calls).toEqual([]);
  });
});
