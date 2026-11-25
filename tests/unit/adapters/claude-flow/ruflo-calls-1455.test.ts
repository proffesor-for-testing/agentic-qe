/**
 * Issue #1455: the Claude Flow bridges and ClaudeFlowAdapterImpl ran ruflo subcommands
 * that do not exist (`hooks intelligence trajectory-*` / `pattern-*`, `hooks transfer
 * --source-path`) and hid the failure behind invented ids and empty results.
 *
 * child_process is mocked; the ruflo outputs below were captured from real
 * `npx --no-install ruflo ...` runs of 3.76.0 (the pinned release); 3.80.7 printed the same.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
vi.mock('child_process', () => ({ execFileSync }));

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

import { parseMcpExecOutput, runRufloTool } from '../../../../src/adapters/claude-flow/ruflo-tool.js';
import { TrajectoryBridge } from '../../../../src/adapters/claude-flow/trajectory-bridge.js';
import { ModelRouterBridge } from '../../../../src/adapters/claude-flow/model-router-bridge.js';
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

function exitError(stderr: string, stdout = ''): Error {
  return Object.assign(new Error('Command failed: npx --no-install ruflo ...'), { status: 1, stderr, stdout });
}

const argvOf = (call: number) => execFileSync.mock.calls[call][1] as string[];

beforeEach(() => {
  execFileSync.mockReset();
  run.mockReset();
  detection.available = true;
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

describe('runRufloTool', () => {
  it('should_runMcpExecWithJsonParams_when_calledWithAToolName', async () => {
    execFileSync.mockReturnValueOnce(STARTED);
    const r = await runRufloTool('hooks_intelligence_trajectory-start', { task: 't', agent: 'a' }, { cwd: '/p' });
    expect(argvOf(0)).toEqual([
      '--no-install', 'ruflo', 'mcp', 'exec', '--tool', 'hooks_intelligence_trajectory-start', '--params', '{"task":"t","agent":"a"}',
    ]);
    expect(execFileSync.mock.calls[0][2]).toMatchObject({ cwd: '/p' });
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ trajectoryId: 'traj-1795598815055-kmjsaq' }) });
  });

  it('should_reportTheRufloError_when_theToolIsUnknown', async () => {
    execFileSync.mockImplementationOnce(() => {
      throw exitError('[INFO] Executing tool: hooks_intelligence_nope\n[ERROR] Tool not found: hooks_intelligence_nope\n');
    });
    const r = await runRufloTool('hooks_intelligence_pattern-search', {});
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('[ERROR] Tool not found') });
  });

  it('should_fail_when_outputHasNoResult', async () => {
    execFileSync.mockReturnValueOnce(INTELLIGENCE_STATUS);
    expect(await runRufloTool('hooks_intelligence_pattern-search', {})).toEqual({
      ok: false,
      reason: 'ruflo mcp exec hooks_intelligence_pattern-search printed no JSON result',
    });
  });

  it('should_fail_when_theToolReportsSuccessFalse', async () => {
    execFileSync.mockReturnValueOnce(mcpExec({ success: false, error: 'sourcePath contains path traversal (..)' }));
    const r = await runRufloTool('hooks_intelligence_pattern-store', { pattern: 'p' });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('path traversal') });
  });

  it('should_parseTheResultObject_when_textFollowsIt', () => {
    expect(parseMcpExecOutput(`${mcpExec({ a: '}{', b: [1] })}\nUpdate available: 3.80.7 {x}\n`)).toEqual({ a: '}{', b: [1] });
    expect(parseMcpExecOutput('Result:\nnot json')).toBeNull();
  });
});

describe('TrajectoryBridge with Claude Flow', () => {
  async function bridge() {
    const b = new TrajectoryBridge({ projectRoot: '/p' });
    await b.initialize();
    return b;
  }

  it('should_useRuflosTrajectoryAndKeepStepsLocally_when_rufloRecordsThem', async () => {
    execFileSync.mockReturnValueOnce(STARTED).mockReturnValueOnce(STEP_RECORDED).mockReturnValueOnce(ENDED);
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

  it('should_trackLocallyAndStopCallingRuflo_when_rufloStartsNoTrajectory', async () => {
    // Before #1455 this printed the intelligence status and exited 0.
    execFileSync.mockReturnValueOnce(INTELLIGENCE_STATUS);
    const b = await bridge();

    const id = await b.startTrajectory('generate tests');
    await b.recordStep(id, 'read file');
    const done = await b.endTrajectory(id, false);

    expect(id).toMatch(/^trajectory-[0-9a-f-]{36}$/);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(done).toMatchObject({ rufloTracked: false, success: false, steps: [expect.objectContaining({ action: 'read file' })] });
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('did not start a trajectory'), expect.anything());
  });

  it('should_logAndKeepLocalSteps_when_rufloDoesNotRecordTheStepOrEnd', async () => {
    execFileSync.mockReturnValueOnce(STARTED).mockReturnValueOnce(STEP_NOT_FOUND).mockReturnValueOnce(END_NOT_FOUND);
    const b = await bridge();

    const id = await b.startTrajectory('t');
    await b.recordStep(id, 'a');
    const done = await b.endTrajectory(id, true);

    expect(done?.steps).toHaveLength(1);
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('did not record the trajectory step'), 'trajectory-not-found');
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('did not end the trajectory'), 'Trajectory not found');
  });

  it('should_recordLocally_when_rufloExitsNonZero', async () => {
    execFileSync.mockImplementation(() => {
      throw exitError('[ERROR] Invalid JSON parameters\n');
    });
    const b = await bridge();
    const id = await b.startTrajectory('t');
    await b.recordStep(id, 'a');
    expect((await b.endTrajectory(id, true))?.steps).toHaveLength(1);
    expect(execFileSync).toHaveBeenCalledTimes(1);
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
    expect(argvOf(0)).toEqual(['--no-install', 'ruflo', 'hooks', 'model-route', '--task', 'fix typo']);
    expect(r.model).toBe('haiku');
    expect(r.confidence).toBeCloseTo(0.805);
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
    expect(argvOf(0)).toEqual(['--no-install', 'ruflo', 'hooks', 'transfer', 'from-project', '--source', '/src', '--min-confidence', '0.7']);
  });

  it('should_reportTheReason_when_rufloTransfersNothing', async () => {
    execFileSync.mockImplementationOnce(() => {
      throw exitError('', '[INFO] Transferring patterns from: /src\nNo patterns found in source project\n');
    });
    const b = await bridge();
    expect(await b.transferPatterns('/src')).toEqual({ transferred: 0, skipped: 0, error: 'No patterns found in source project' });
  });

  it('should_sayClaudeFlowIsUnavailable_when_notDetected', async () => {
    detection.available = false;
    const b = await bridge();
    expect(await b.transferPatterns('/src')).toEqual({ transferred: 0, skipped: 0, error: 'Claude Flow not available' });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('should_parseTransferCounts_when_outputHasColours', () => {
    expect(parseTransferOutput('\x1b[32mTransferred 0 patterns\x1b[0m')).toEqual({ transferred: 0, skipped: 0 });
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
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('should_returnRuflosIds_when_theToolsSucceed', async () => {
    execFileSync
      .mockReturnValueOnce(STARTED)
      .mockReturnValueOnce(STEP_RECORDED)
      .mockReturnValueOnce(ENDED)
      .mockReturnValueOnce(mcpExec({ patternId: '2', indexed: true }))
      .mockReturnValueOnce(mcpExec({ results: [{ patternId: '2', pattern: 'use mocks for network', similarity: 0.93 }] }));
    const a = await adapter();

    expect(await a.startTrajectory('generate tests', 'qe-test-architect')).toEqual({ status: 'ok', value: 'traj-1795598815055-kmjsaq' });
    expect(await a.recordStep('traj-1795598815055-kmjsaq', 'read file', 'ok', 0.9)).toEqual({ status: 'ok', value: undefined });
    expect(await a.endTrajectory('traj-1795598815055-kmjsaq', true)).toEqual({ status: 'ok', value: undefined });
    expect(await a.storePattern('use mocks for network', 'test', 0.9, { src: 'aqe' })).toEqual({ status: 'ok', value: '2' });
    expect(await a.searchPatterns('mocks network', 5)).toEqual({
      status: 'ok',
      value: [{ pattern: 'use mocks for network', similarity: 0.93 }],
    });
    expect(execFileSync.mock.calls.map((c) => (c[1] as string[])[5])).toEqual([
      'hooks_intelligence_trajectory-start',
      'hooks_intelligence_trajectory-step',
      'hooks_intelligence_trajectory-end',
      'hooks_intelligence_pattern-store',
      'hooks_intelligence_pattern-search',
    ]);
    expect(JSON.parse(argvOf(3).at(-1)!)).toEqual({ pattern: 'use mocks for network', type: 'test', confidence: 0.9, metadata: { src: 'aqe' } });
    expect(JSON.parse(argvOf(4).at(-1)!)).toEqual({ query: 'mocks network', topK: 5 });
  });

  it('should_reportFailed_when_rufloDoesNotDoIt', async () => {
    execFileSync
      .mockReturnValueOnce(INTELLIGENCE_STATUS)
      .mockReturnValueOnce(mcpExec({ trajectoryId: 'x' }).replace('"trajectoryId": "x"', '"status": "recording"'))
      .mockReturnValueOnce(STEP_NOT_FOUND)
      .mockReturnValueOnce(END_NOT_FOUND)
      .mockImplementationOnce(() => {
        throw exitError('[ERROR] Tool not found: hooks_intelligence_pattern-store\n');
      })
      .mockReturnValueOnce(mcpExec({ query: 'q' }));
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
