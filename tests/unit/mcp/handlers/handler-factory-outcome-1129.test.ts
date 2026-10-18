/**
 * #1129: MCP domain handlers recorded pattern usage and captured experience
 * as `success: true` whenever the call completed. Success now describes the
 * outcome of a test run (every test passed, or some failed). A tool whose
 * result has no outcome measure, and a task that errored (often the caller's
 * input: an empty or glob test list, a missing target; #1142 review B2), is
 * not recorded as a pattern success or a measured failure.
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
import { TestRunnerExecutionError } from '../../../../src/shared/test-runner-verdict';

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

  it('a test run with a failing test is a failed, measured outcome, tagged with its run', async () => {
    const result = await run('execute-tests', { success: true, data: { total: 3, passed: 2, failed: 1 } });

    expect(result.success).toBe(true);
    expect(engine.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({
      patternId: 'hint-1',
      success: false,
      metrics: expect.objectContaining({ outcome: 'measured', outcomeBasis: 'test-results', runId: 'task-1' }),
    }));
    expect(capture.completeCapture).toHaveBeenCalledWith('exp-1', expect.objectContaining({
      success: false, outcomeBasis: 'test-results',
    }));
    expect(capture.startCapture).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      metadata: expect.objectContaining({ runId: 'task-1' }),
    }));
  });

  it('a test run where every test passed is a successful, measured outcome', async () => {
    await run('execute-tests', { success: true, data: { total: 3, passed: 3, failed: 0 } });

    expect(engine.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(capture.completeCapture).toHaveBeenCalledWith('exp-1', expect.objectContaining({
      success: true, outcomeBasis: 'test-results',
    }));
  });

  it.each([
    ['an index of existing files', 'index-code', { filesIndexed: 1 }, 'code-intelligence'],
    ['an index of a missing target (filesIndexed 0)', 'index-code', { filesIndexed: 0 }, 'code-intelligence'],
    ['a tool without an outcome measure', 'generate-tests', { tests: [] }, 'test-generation'],
  ])('%s records no pattern success or failure', async (_label, taskType, data, domain) => {
    await run(taskType, { success: true, data }, domain);

    expect(engine.recordOutcome).not.toHaveBeenCalled();
    const [, outcome] = capture.completeCapture.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(outcome).not.toHaveProperty('outcomeBasis');
  });

  it.each([
    ['an empty test list', new TestRunnerExecutionError('No test files specified. Provide testFiles array with paths to test files.')],
    ['a glob test path', new TestRunnerExecutionError('Some test file paths contain invalid characters and were rejected.')],
    ['a missing index target', new Error('Nothing was indexed: 0 of 1 requested path(s) indexed - no/such/dir (not-found)')],
  ])('a task that errored on %s is not recorded as a measured failure', async (_label, error) => {
    const result = await run('execute-tests', { success: false, error: error.message });

    expect(result.success).toBe(false);
    expect(engine.recordOutcome).not.toHaveBeenCalled();
    expect(capture.completeCapture).not.toHaveBeenCalled();
  });
});
