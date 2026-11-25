/**
 * Issue #1455: the Claude Flow bridges and ClaudeFlowAdapterImpl ran ruflo subcommands
 * that do not exist (`hooks intelligence trajectory-*` / `pattern-*`, `hooks transfer
 * --source-path`) and hid the failure behind invented ids and empty results.
 *
 * child_process is mocked; the ruflo outputs below were captured from real
 * `npx --no-install ruflo ...` runs of 3.76.0 (the pinned release); 3.80.7 printed the same.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `ruflo mcp exec` runs through async execFile; the kept hooks calls use execFileSync.
const execFile = vi.fn();
const execFileSync = vi.fn();
vi.mock('child_process', () => ({ execFile, execFileSync }));

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
/** An execFile implementation that exits 0 with `stdout`. */
const reply =
  (stdout: string, stderr = '') =>
  (_bin: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
    setImmediate(() => cb(null, stdout, stderr));
  };
/** An execFile implementation that exits 1. */
const exit1 =
  (stderr: string, stdout = '', extra: Record<string, unknown> = {}) =>
  (_bin: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
    setImmediate(() => cb(Object.assign(new Error('Command failed: npx --no-install ruflo ...'), { code: 1 }, extra), stdout, stderr));
  };
/** Queue execFile replies, one per call. */
function replies(...impls: Array<ReturnType<typeof reply>>) {
  for (const impl of impls) execFile.mockImplementationOnce(impl);
}

const detection = { available: true, method: 'npx-cached', version: '3.76.0' };
vi.mock('../../../../src/adapters/claude-flow/detect.js', () => ({
  detectClaudeFlow: () => detection,
  resolveCliPackage: () => 'ruflo',
}));

const run = vi.fn();
vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => ({
    isInitialized: () => true,
    getDatabase: () => ({
      prepare: (sql: string) => ({ all: () => [{ name: 'feedback' }], run: (...args: unknown[]) => run(sql, ...args) }),
      exec: vi.fn(),
    }),
  }),
}));

import { KeyedSerialQueue, parseMcpExecOutput, runRufloTool } from '../../../../src/adapters/claude-flow/ruflo-tool.js';
import { TrajectoryBridge } from '../../../../src/adapters/claude-flow/trajectory-bridge.js';
import { ModelRouterBridge, confidenceFraction } from '../../../../src/adapters/claude-flow/model-router-bridge.js';
import { PretrainBridge, parseTransferOutput } from '../../../../src/adapters/claude-flow/pretrain-bridge.js';
import { ClaudeFlowAdapterImpl } from '../../../../src/init/enhancements/claude-flow-adapter.js';

/** `ruflo mcp exec` stdout (its `[INFO] Executing tool` line goes to stderr). */
const mcpExec = (result: Record<string, unknown>) =>
  `  Parameters: {}\n\n[OK] Tool executed in 501.33ms\n\nResult:\n${JSON.stringify(result, null, 2)}\n`;

const STARTED = mcpExec({ trajectoryId: 'traj-1795598815055-kmjsaq', status: 'recording', persisted: true });
const STEP_RECORDED = mcpExec({ trajectoryId: 'traj-1795598815055-kmjsaq', recorded: true, implementation: 'real-step-recording' });
const STEP_NOT_FOUND = mcpExec({ trajectoryId: 'nope', recorded: false, persisted: false, implementation: 'trajectory-not-found' });
const ENDED = mcpExec({ trajectoryId: 'traj-1795598815055-kmjsaq', success: true, persisted: true, trajectory: { totalSteps: 1 } });
const END_NOT_FOUND = mcpExec({ trajectoryId: 'none', persisted: false, trajectory: null, note: 'Trajectory not found' });

/** What `ruflo hooks intelligence trajectory-start --task ...` printed (exit 0): the status table. */
const INTELLIGENCE_STATUS = 'RuVector Intelligence System\nIntelligence system active\n| Mode: balanced |\n';

const argvOf = (call: number) => execFile.mock.calls[call][1] as string[];
const syncArgvOf = (call: number) => execFileSync.mock.calls[call][1] as string[];

beforeEach(() => {
  execFile.mockReset();
  execFileSync.mockReset();
  run.mockReset();
  detection.available = true;
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

describe('runRufloTool', () => {
  it('should_runMcpExecAsynchronouslyWithJsonParams_when_calledWithAToolName', async () => {
    replies(reply(STARTED));
    const r = await runRufloTool('hooks_intelligence_trajectory-start', { task: 't', agent: 'a' }, { cwd: '/p' });
    expect(execFile.mock.calls[0][0]).toBe('npx');
    expect(argvOf(0)).toEqual([
      '--no-install', 'ruflo', 'mcp', 'exec', '--tool', 'hooks_intelligence_trajectory-start', '--params', '{"task":"t","agent":"a"}',
    ]);
    expect(execFile.mock.calls[0][2]).toMatchObject({ cwd: '/p', timeout: 15000 });
    expect(execFileSync).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ trajectoryId: 'traj-1795598815055-kmjsaq' }) });
  });

  it('should_notBlockTheEventLoop_when_rufloIsRunning', async () => {
    let finish: ExecCallback | undefined;
    execFile.mockImplementationOnce((_b: string, _a: string[], _o: unknown, cb: ExecCallback) => {
      finish = cb;
    });
    const pending = runRufloTool('hooks_intelligence_pattern-search', { query: 'q' });
    let ticked = false;
    await new Promise<void>((resolve) => setImmediate(() => { ticked = true; resolve(); }));
    expect(ticked).toBe(true);
    finish!(null, mcpExec({ results: [] }), '');
    expect(await pending).toMatchObject({ ok: true });
  });

  it('should_reportTheRufloError_when_theToolIsUnknown', async () => {
    replies(exit1('[INFO] Executing tool: hooks_intelligence_nope\n[ERROR] Tool not found: hooks_intelligence_nope\n'));
    const r = await runRufloTool('hooks_intelligence_pattern-search', {});
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('[ERROR] Tool not found') });
  });

  it('should_reportATimeout_when_rufloIsKilled', async () => {
    replies(exit1('[INFO] Executing tool: hooks_intelligence_trajectory-end\n', '', { killed: true, signal: 'SIGTERM' }));
    const r = await runRufloTool('hooks_intelligence_trajectory-end', { trajectoryId: 't' }, { timeoutMs: 30000 });
    expect(r).toEqual({ ok: false, reason: 'ruflo mcp exec hooks_intelligence_trajectory-end failed: timed out after 30000 ms' });
  });

  it('should_fail_when_outputHasNoResult', async () => {
    replies(reply(INTELLIGENCE_STATUS));
    expect(await runRufloTool('hooks_intelligence_pattern-search', {})).toEqual({
      ok: false,
      reason: 'ruflo mcp exec hooks_intelligence_pattern-search printed no JSON result',
    });
  });

  it('should_fail_when_theToolReportsSuccessFalse', async () => {
    replies(reply(mcpExec({ success: false, error: 'sourcePath contains path traversal (..)' })));
    const r = await runRufloTool('hooks_intelligence_pattern-store', { pattern: 'p' });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('path traversal') });
  });

  it('should_parseTheResultObject_when_textFollowsIt', () => {
    expect(parseMcpExecOutput(`${mcpExec({ a: '}{', b: [1] })}\nUpdate available: 3.80.7 {x}\n`)).toEqual({ a: '}{', b: [1] });
    expect(parseMcpExecOutput('Result:\nnot json')).toBeNull();
  });
});

describe('KeyedSerialQueue', () => {
  it('should_runTasksOfOneKeyInOrder_when_startedTogether', async () => {
    const q = new KeyedSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<string>((resolve) => setTimeout(() => { log.push(name); resolve(name); }, ms));
    const results = await Promise.all([q.run('t', task('a', 30)), q.run('t', task('b', 1)), q.run('u', task('c', 5))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['c', 'a', 'b']);
  });

  it('should_keepGoing_when_aTaskRejects', async () => {
    const q = new KeyedSerialQueue();
    const failed = q.run('t', () => Promise.reject(new Error('x')));
    const next = q.run('t', () => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('x');
    expect(await next).toBe('ok');
  });
});

describe('TrajectoryBridge with Claude Flow', () => {
  async function bridge() {
    const b = new TrajectoryBridge({ projectRoot: '/p' });
    await b.initialize();
    return b;
  }

  it('should_useRuflosTrajectoryAndKeepStepsLocally_when_rufloRecordsThem', async () => {
    replies(reply(STARTED), reply(STEP_RECORDED), reply(ENDED));
    const b = await bridge();

    const id = await b.startTrajectory('generate tests', 'qe-test-architect');
    await b.recordStep(id, 'read file', 'ok', 0.9);
    const done = await b.endTrajectory(id, true, 'good');

    expect(id).toBe('traj-1795598815055-kmjsaq');
    expect(argvOf(1)).toContain('hooks_intelligence_trajectory-step');
    expect(JSON.parse(argvOf(1).at(-1)!)).toEqual({ trajectoryId: id, action: 'read file', result: 'ok', quality: 0.9 });
    expect(JSON.parse(argvOf(2).at(-1)!)).toEqual({ trajectoryId: id, success: true, feedback: 'good' });
    expect(done).toMatchObject({ id, rufloTracked: true, success: true, steps: [expect.objectContaining({ action: 'read file' })] });
    expect(run).toHaveBeenCalledTimes(1); // persisted to qe_trajectories
  });

  it('should_neverSendAnUnknownIdToRuflo_when_theTrajectoryWasNotStartedHere', async () => {
    // AQELearningEngine passed its experience id (exp-...) before the review of #1455.
    const b = await bridge();
    await b.recordStep('exp-123-abc', 'x');
    expect(await b.endTrajectory('exp-123-abc', true)).toBeUndefined();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should_sendStepsOneAtATimeInOrder_when_recordedConcurrently', async () => {
    replies(reply(STARTED));
    const b = await bridge();
    const id = await b.startTrajectory('t');

    let inFlight = 0;
    let maxInFlight = 0;
    execFile.mockImplementation((_b: string, args: string[], _o: unknown, cb: ExecCallback) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => {
        inFlight--;
        cb(null, args.includes('hooks_intelligence_trajectory-end') ? ENDED : STEP_RECORDED, '');
      }, 5);
    });
    await Promise.all([1, 2, 3, 4, 5].map((n) => b.recordStep(id, `step ${n}`)));
    const done = await b.endTrajectory(id, true);

    expect(maxInFlight).toBe(1);
    const sent = execFile.mock.calls.slice(1).map((c) => JSON.parse((c[1] as string[]).at(-1)!).action ?? 'end');
    expect(sent).toEqual(['step 1', 'step 2', 'step 3', 'step 4', 'step 5', 'end']);
    expect(done?.steps.map((s) => s.action)).toEqual(['step 1', 'step 2', 'step 3', 'step 4', 'step 5']);
  });

  it('should_trackLocallyAndStopCallingRuflo_when_rufloStartsNoTrajectory', async () => {
    // Before #1455 this printed the intelligence status and exited 0.
    replies(reply(INTELLIGENCE_STATUS));
    const b = await bridge();

    const id = await b.startTrajectory('generate tests');
    await b.recordStep(id, 'read file');
    const done = await b.endTrajectory(id, false);

    expect(id).toMatch(/^trajectory-[0-9a-f-]{36}$/);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(done).toMatchObject({ rufloTracked: false, success: false, steps: [expect.objectContaining({ action: 'read file' })] });
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('did not start a trajectory'), expect.anything());
  });

  it('should_logAndKeepLocalSteps_when_rufloDoesNotRecordTheStepOrEnd', async () => {
    replies(reply(STARTED), reply(STEP_NOT_FOUND), reply(END_NOT_FOUND));
    const b = await bridge();

    const id = await b.startTrajectory('t');
    await b.recordStep(id, 'a');
    const done = await b.endTrajectory(id, true);

    expect(done?.steps).toHaveLength(1);
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('did not record the trajectory step'), 'trajectory-not-found');
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('did not end the trajectory'), 'Trajectory not found');
  });

  it('should_recordLocally_when_rufloExitsNonZero', async () => {
    execFile.mockImplementation(exit1('[ERROR] Invalid JSON parameters\n'));
    const b = await bridge();
    const id = await b.startTrajectory('t');
    await b.recordStep(id, 'a');
    expect((await b.endTrajectory(id, true))?.steps).toHaveLength(1);
    expect(execFile).toHaveBeenCalledTimes(1);
  });
});

describe('ModelRouterBridge', () => {
  it('should_returnAFraction_when_rufloPrintsConfidenceAsAPercentage', async () => {
    execFileSync.mockReturnValueOnce(
      '+-- Model Routing Result ---+\n| Selected Model: 🌸 HAIKU  |\n| Confidence: 80.5%         |\n+---------------------------+\n\nReasoning\n' +
        'Complexity: 14% | Confidence: 81% | Model: haiku - Fast, cost-effective for simple tasks | Cost: 0.04x baseline\n',
    );
    const b = new ModelRouterBridge({ projectRoot: '/p' });
    await b.initialize();
    const r = await b.routeTask('fix typo');
    expect(syncArgvOf(0)).toEqual(['--no-install', 'ruflo', 'hooks', 'model-route', '--task', 'fix typo']);
    expect(r.model).toBe('haiku');
    expect(r.confidence).toBeCloseTo(0.805);
  });

  it.each([
    ['0.5%', 0.005],
    ['1.0%', 0.01],
    ['80.5%', 0.805],
    ['100%', 1],
    ['0.8', 0.8],
    ['1', 1],
  ])('should_divideOnlyPercentages_when_parsing %s', (raw, expected) => {
    expect(confidenceFraction(raw)).toBeCloseTo(expected);
  });
});

describe('PretrainBridge', () => {
  async function bridge() {
    const b = new PretrainBridge({ projectRoot: '/p' });
    await b.initialize();
    return b;
  }

  it('should_returnLocalConfigsWithoutRunningRuflo_when_generatingAgentConfigs', async () => {
    const b = await bridge();
    const yaml = await b.generateAgentConfigs('yaml');
    const json = await b.generateAgentConfigs('json');
    expect(execFileSync).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
    expect(yaml.map((c) => c.name)).toContain('qe-test-architect');
    expect(json).toEqual(yaml);
  });

  it('should_runTransferFromProject_when_transferringPatterns', async () => {
    execFileSync.mockReturnValueOnce(
      '[INFO] Transferring patterns from: /src\nTransferred 1 patterns\n\nTransfer Summary\n' +
        '| Total Transferred        |     1 |\n| Skipped (Low Confidence) |     1 |\n| Skipped (Duplicates)     |     2 |\n| Skipped (Conflicts)      |     0 |\n',
    );
    const b = await bridge();
    expect(await b.transferPatterns('/src', 0.7)).toEqual({ transferred: 1, skipped: 3 });
    expect(syncArgvOf(0)).toEqual(['--no-install', 'ruflo', 'hooks', 'transfer', 'from-project', '--source', '/src', '--min-confidence', '0.7']);
  });

  it('should_reportZeroWithoutError_when_allPatternsAreDuplicates', async () => {
    // Real 3.76.0 output of a second transfer from the same source (exit 0).
    execFileSync.mockReturnValueOnce('Transferred 0 patterns\n| Skipped (Low Confidence) |     1 |\n| Skipped (Duplicates)     |     1 |\n');
    const b = await bridge();
    expect(await b.transferPatterns('/src')).toEqual({ transferred: 0, skipped: 2 });
  });

  it('should_reportTheReason_when_rufloTransfersNothing', async () => {
    execFileSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('Command failed'), { status: 1, stderr: '', stdout: '[INFO] Transferring patterns from: /src\nNo patterns found in source project\n' });
    });
    const b = await bridge();
    expect(await b.transferPatterns('/src')).toEqual({ transferred: 0, skipped: 0, error: 'No patterns found in source project' });
  });

  it('should_reportAnError_when_rufloExitsZeroWithoutACount', async () => {
    // What the old `hooks transfer --source-path` printed: the transfer help.
    execFileSync.mockReturnValueOnce('Pattern Transfer System\nSubcommands:\n  - from-project - Transfer patterns from another project\n');
    const b = await bridge();
    expect(await b.transferPatterns('/src')).toEqual({
      transferred: 0,
      skipped: 0,
      error: 'ruflo exited 0 without a "Transferred N patterns" line',
    });
  });

  it('should_sayClaudeFlowIsUnavailable_when_notDetected', async () => {
    detection.available = false;
    const b = await bridge();
    expect(await b.transferPatterns('/src')).toEqual({ transferred: 0, skipped: 0, error: 'Claude Flow not available' });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('should_parseTransferCounts_when_outputHasColours', () => {
    expect(parseTransferOutput('\x1b[32mTransferred 0 patterns\x1b[0m')).toEqual({ transferred: 0, skipped: 0 });
    expect(parseTransferOutput('No count here')).toBeNull();
  });
});

describe('ClaudeFlowAdapterImpl', () => {
  async function adapter() {
    const a = new ClaudeFlowAdapterImpl();
    await a.initialize();
    return a;
  }

  it('should_reportUnavailable_when_claudeFlowIsNotDetected', async () => {
    detection.available = false;
    const a = await adapter();
    const unavailable = { status: 'unavailable', reason: 'Claude Flow not available' };
    expect(await a.startTrajectory('t')).toEqual(unavailable);
    expect(await a.recordStep('id', 'x')).toEqual(unavailable);
    expect(await a.endTrajectory('id', true)).toEqual(unavailable);
    expect(await a.storePattern('p', 'test', 0.9)).toEqual(unavailable);
    expect(await a.searchPatterns('q')).toEqual(unavailable);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('should_returnRuflosIds_when_theToolsSucceed', async () => {
    replies(
      reply(STARTED),
      reply(STEP_RECORDED),
      reply(ENDED),
      reply(mcpExec({ patternId: '2', indexed: true })),
      reply(mcpExec({ results: [{ patternId: '2', pattern: 'use mocks for network', similarity: 0.93 }] })),
    );
    const a = await adapter();

    expect(await a.startTrajectory('generate tests', 'qe-test-architect')).toEqual({ status: 'ok', value: 'traj-1795598815055-kmjsaq' });
    expect(await a.recordStep('traj-1795598815055-kmjsaq', 'read file', 'ok', 0.9)).toEqual({ status: 'ok', value: undefined });
    expect(await a.endTrajectory('traj-1795598815055-kmjsaq', true)).toEqual({ status: 'ok', value: undefined });
    expect(await a.storePattern('use mocks for network', 'test', 0.9, { src: 'aqe' })).toEqual({ status: 'ok', value: '2' });
    expect(await a.searchPatterns('mocks network', 5)).toEqual({
      status: 'ok',
      value: [{ pattern: 'use mocks for network', similarity: 0.93 }],
    });
    expect(execFile.mock.calls.map((c) => (c[1] as string[])[5])).toEqual([
      'hooks_intelligence_trajectory-start',
      'hooks_intelligence_trajectory-step',
      'hooks_intelligence_trajectory-end',
      'hooks_intelligence_pattern-store',
      'hooks_intelligence_pattern-search',
    ]);
    expect(JSON.parse(argvOf(3).at(-1)!)).toEqual({ pattern: 'use mocks for network', type: 'test', confidence: 0.9, metadata: { src: 'aqe' } });
    expect(JSON.parse(argvOf(4).at(-1)!)).toEqual({ query: 'mocks network', topK: 5 });
  });

  it('should_serializeStepsOfOneTrajectory_when_calledConcurrently', async () => {
    const a = await adapter();
    let inFlight = 0;
    let maxInFlight = 0;
    execFile.mockImplementation((_b: string, _a: string[], _o: unknown, cb: ExecCallback) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => { inFlight--; cb(null, STEP_RECORDED, ''); }, 5);
    });
    const results = await Promise.all([1, 2, 3].map((n) => a.recordStep('traj-x', `s${n}`)));
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(maxInFlight).toBe(1);
  });

  it('should_reportFailed_when_rufloDoesNotDoIt', async () => {
    replies(
      reply(INTELLIGENCE_STATUS),
      reply(mcpExec({ status: 'recording' })),
      reply(STEP_NOT_FOUND),
      reply(END_NOT_FOUND),
      exit1('[ERROR] Tool not found: hooks_intelligence_pattern-store\n'),
      reply(mcpExec({ query: 'q' })),
    );
    const a = await adapter();

    expect(await a.startTrajectory('t')).toEqual({ status: 'failed', reason: expect.stringContaining('printed no JSON result') });
    expect(await a.startTrajectory('t')).toEqual({ status: 'failed', reason: 'ruflo returned no trajectoryId' });
    expect(await a.recordStep('nope', 'x')).toEqual({ status: 'failed', reason: expect.stringContaining('trajectory-not-found') });
    expect(await a.endTrajectory('none', true)).toEqual({ status: 'failed', reason: expect.stringContaining('Trajectory not found') });
    expect(await a.storePattern('p', 't', 1)).toEqual({ status: 'failed', reason: expect.stringContaining('Tool not found') });
    expect(await a.searchPatterns('q')).toEqual({ status: 'failed', reason: 'ruflo returned no results array' });
  });

  it('should_returnAFraction_when_routingAModel', async () => {
    execFileSync.mockReturnValueOnce('| Confidence: 54.7%       |\nReasoning\nComplexity: 14% | Confidence: 55% | Model: opus - Most capable\n');
    const a = await adapter();
    const r = await a.routeModel('fix typo');
    expect(r.model).toBe('opus');
    expect(r.confidence).toBeCloseTo(0.547);
  });
});
