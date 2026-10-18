/**
 * #1129: MCP domain handlers recorded pattern usage and captured experience
 * as `success: true` whenever the call completed, and recorded nothing when
 * the task itself failed. Success now describes the outcome (tests passed,
 * files indexed); a failed task is a failed outcome; a tool whose result has
 * no outcome measure is not recorded as a pattern success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDomainHandler,
  resetTaskExecutor,
  resetLearningEngine,
  type BaseHandlerResult,
} from '../../../../src/mcp/handlers/handler-factory';
import * as coreHandlers from '../../../../src/mcp/handlers/core-handlers';
import * as taskRouter from '../../../../src/mcp/services/task-router';
import { ok } from '../../../../src/shared/types';

const capture = {
  startCapture: vi.fn(() => 'exp-1'),
  recordStep: vi.fn(),
  completeCapture: vi.fn(async () => ({ success: false })),
};
const engine = {
  initialize: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  searchPatterns: vi.fn(async () => ok([{
    pattern: { id: 'hint-1', name: 'hint', description: 'd', confidence: 0.6 }, similarity: 0.9, canReuse: true,
  }])),
  recordOutcome: vi.fn(async () => ok(undefined)),
  getExperienceCaptureService: vi.fn(() => capture),
};

vi.mock('../../../../src/mcp/handlers/core-handlers', () => ({ isFleetInitialized: vi.fn(), getFleetState: vi.fn() }));
vi.mock('../../../../src/mcp/services/task-router', () => ({ getTaskRouter: vi.fn() }));
vi.mock('../../../../src/coordination/task-executor', () => ({ createTaskExecutor: vi.fn() }));
vi.mock('../../../../src/learning/aqe-learning-engine', () => ({ createAQELearningEngine: vi.fn(() => engine) }));
vi.mock('../../../../src/feedback/feedback-loop.js', () => ({
  createInitializedFeedbackLoop: vi.fn(async () => null),
  getQualityFeedbackLoop: vi.fn(() => null),
}));

interface Result extends BaseHandlerResult { data: Record<string, unknown> }

const queen = {
  submitTask: vi.fn(async () => ({ success: true, value: 'task-1' })),
  getTaskStatus: vi.fn(() => ({ task: { id: 'task-1' } })),
};
const executor = { execute: vi.fn(), setQualityFeedbackLoop: vi.fn() };

function handler(taskType: string, domain = 'test-execution') {
  return createDomainHandler<{ target: string }, Result>({
    domain,
    taskType,
    buildTaskDescription: (p) => `${taskType} ${p.target}`,
    mapToPayload: (p) => ({ target: p.target }),
    mapToResult: (taskId, d, duration) => ({ taskId, status: 'completed', duration, ...d } as unknown as Result),
  });
}

async function run(taskType: string, execution: Record<string, unknown>, domain?: string) {
  executor.execute.mockResolvedValueOnce({ duration: 10, ...execution });
  const result = await handler(taskType, domain)({ target: 'src' });
  await new Promise((r) => setTimeout(r, 20));
  return result;
}

describe('#1129 handler factory records the outcome, not the completed call', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetTaskExecutor();
    resetLearningEngine();
    vi.mocked(coreHandlers.isFleetInitialized).mockReturnValue(true);
    vi.mocked(coreHandlers.getFleetState).mockReturnValue({ queen, kernel: { memory: {} } } as never);
    vi.mocked(taskRouter.getTaskRouter).mockResolvedValue({
      routeTask: vi.fn(async (req: { patternHints?: unknown }) => ({ patternHints: req.patternHints, decision: { tier: 2 } })),
    } as never);
    const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
    vi.mocked(createTaskExecutor).mockReturnValue(executor as never);
  });

  it('a test run with a failing test is a failed, measured outcome', async () => {
    const result = await run('execute-tests', { success: true, data: { total: 3, passed: 2, failed: 1 } });

    expect(result.success).toBe(true);
    expect(engine.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({
      patternId: 'hint-1',
      success: false,
      metrics: expect.objectContaining({ outcome: 'measured', outcomeBasis: 'test-results' }),
    }));
    expect(capture.completeCapture).toHaveBeenCalledWith('exp-1', expect.objectContaining({
      success: false, outcomeBasis: 'test-results',
    }));
  });

  it('an index that indexed files is a successful, measured outcome', async () => {
    await run('index-code', { success: true, data: { filesIndexed: 1 } }, 'code-intelligence');

    expect(engine.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(capture.completeCapture).toHaveBeenCalledWith('exp-1', expect.objectContaining({
      success: true, outcomeBasis: 'files-indexed',
    }));
  });

  it('a tool without an outcome measure records no pattern success', async () => {
    await run('generate-tests', { success: true, data: { tests: [] } }, 'test-generation');

    expect(engine.recordOutcome).not.toHaveBeenCalled();
    const [, outcome] = capture.completeCapture.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(outcome).not.toHaveProperty('outcomeBasis');
  });

  it('a task that ran and failed is recorded as a failed outcome', async () => {
    const result = await run('index-code', { success: false, error: 'Nothing was indexed' }, 'code-intelligence');

    expect(result.success).toBe(false);
    expect(engine.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({
      success: false, metrics: expect.objectContaining({ outcome: 'measured', outcomeBasis: 'task-failed' }),
    }));
    expect(capture.completeCapture).toHaveBeenCalledWith('exp-1', expect.objectContaining({
      success: false, outcomeBasis: 'task-failed',
    }));
  });

  it('a failure with structured details (caller input, insufficient evidence) is not recorded', async () => {
    await run('assess-quality', {
      success: false, error: 'insufficient evidence', errorDetails: { status: 'insufficient-evidence' },
    }, 'quality-assessment');

    expect(engine.recordOutcome).not.toHaveBeenCalled();
    expect(capture.completeCapture).not.toHaveBeenCalled();
  });
});
