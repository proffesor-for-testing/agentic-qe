/**
 * Issue #1014 — coverage estimates and unmeasured runs never flow into
 * learning through the MCP domain-handler factory.
 *
 * `recordDomainFeedback` wrote `coverage_sessions.after_lines` = the estimate
 * (unmeasured runs wrote 0.0), which `gate-check` / `threshold-check` and the
 * coverage-learner strategies read. Pattern-usage success and experience
 * capture recorded the same runs as successful learning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDomainHandler, resetTaskExecutor, type BaseHandlerResult } from '../../../../src/mcp/handlers/handler-factory';
import { isLearnableResult } from '../../../../src/learning/learnable-result';
import * as coreHandlers from '../../../../src/mcp/handlers/core-handlers';
import * as taskRouter from '../../../../src/mcp/services/task-router';

const loop = { recordCoverageSession: vi.fn(async () => undefined), recordTestOutcome: vi.fn(async () => undefined) };

vi.mock('../../../../src/mcp/handlers/core-handlers', () => ({ isFleetInitialized: vi.fn(), getFleetState: vi.fn() }));
vi.mock('../../../../src/mcp/services/task-router', () => ({ getTaskRouter: vi.fn() }));
vi.mock('../../../../src/coordination/task-executor', () => ({ createTaskExecutor: vi.fn() }));
vi.mock('../../../../src/learning/aqe-learning-engine', () => ({ createAQELearningEngine: vi.fn(() => null) }));
vi.mock('../../../../src/feedback/feedback-loop.js', () => ({
  createInitializedFeedbackLoop: vi.fn(async () => loop),
  getQualityFeedbackLoop: vi.fn(() => loop),
}));

interface CovResult extends BaseHandlerResult { data: Record<string, unknown> }

const queen = {
  submitTask: vi.fn(async () => ({ success: true, value: 'task-1' })),
  getTaskStatus: vi.fn(() => ({ task: { id: 'task-1', type: 'analyze-coverage' } })),
};
const executor = { execute: vi.fn(), setQualityFeedbackLoop: vi.fn() };

async function runCoverage(data: Record<string, unknown>) {
  executor.execute.mockResolvedValueOnce({ success: true, data, duration: 10 });
  const handler = createDomainHandler<{ target: string }, CovResult>({
    domain: 'coverage-analysis',
    taskType: 'analyze-coverage',
    buildTaskDescription: p => `Analyze ${p.target}`,
    mapToPayload: p => ({ target: p.target }),
    mapToResult: (taskId, d, duration) => ({ taskId, status: 'completed', duration, data: d }),
  });
  const result = await handler({ target: 'src' });
  await new Promise(r => setTimeout(r, 20));
  return result;
}

describe('#1014 — handler-factory learning gates', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetTaskExecutor();
    vi.mocked(coreHandlers.isFleetInitialized).mockReturnValue(true);
    vi.mocked(coreHandlers.getFleetState).mockReturnValue({ queen, kernel: { id: 'k' } } as never);
    vi.mocked(taskRouter.getTaskRouter).mockResolvedValue({ routeTask: vi.fn(async () => null) } as never);
    const { createTaskExecutor } = await import('../../../../src/coordination/task-executor');
    vi.mocked(createTaskExecutor).mockReturnValue(executor as never);
  });

  it.each([
    ['a static estimate', { lineCoverage: 11.1, estimated: true, measured: false, coverageMethod: 'static-estimation' }],
    ['an UNMEASURED target', { lineCoverage: null, unmeasured: true, measured: false, coverageMethod: 'none' }],
    ['a result with no provenance', { lineCoverage: 42 }],
  ])('does not record a coverage_sessions row for %s (the tool still succeeds)', async (_label, data) => {
    const result = await runCoverage(data);
    expect(result.success).toBe(true);
    expect(loop.recordCoverageSession).not.toHaveBeenCalled();
  });

  it('records a measured run, stamped with its provenance in the session context', async () => {
    await runCoverage({ lineCoverage: 57.1, branchCoverage: null, functionCoverage: 40, measured: true, estimated: false,
      coverageMethod: 'instrumented-report', gaps: [] });
    expect(loop.recordCoverageSession).toHaveBeenCalledTimes(1);
    expect(loop.recordCoverageSession).toHaveBeenCalledWith(expect.objectContaining({
      afterCoverage: expect.objectContaining({ lines: 57.1 }),
      context: expect.objectContaining({ measured: true, coverageMethod: 'instrumented-report', branchDataCollected: false }),
    }));
  });
});

describe('#1014 — isLearnableResult', () => {
  it.each([
    ['coverage-analysis', { measured: true }, true],
    ['coverage-analysis', { measured: false, estimated: true }, false],
    ['coverage-analysis', { unmeasured: true, measured: false }, false],
    ['coverage-analysis', {}, false],
    ['coverage-analysis', undefined, false],
    ['quality-assessment', { status: 'insufficient-evidence' }, false],
    ['quality-assessment', { evidenceStatus: 'insufficient-evidence' }, false],
    ['quality-assessment', { status: 'passed' }, true],
    ['test-generation', { tests: [] }, true],
  ])('%s %j → %s', (domain, data, expected) => {
    expect(isLearnableResult(domain, data)).toBe(expected);
  });
});
