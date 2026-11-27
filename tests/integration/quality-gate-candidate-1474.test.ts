/**
 * #1474 — CLI `aqe quality --gate`, CI `aqe ci run --phase quality-gate` and MCP
 * `quality_assess({ runGate: true })` judge the same candidate, resolved from
 * the checkout, and agree on candidate identity, evidence reasons and receipt
 * ids for one frozen fixture whose subject varies.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MCPProtocolServer } from '../../src/mcp/protocol-server.js';
import type { MemoryBackend } from '../../src/kernel/interfaces.js';
import type { ToolResult } from '../../src/mcp/types.js';
import type { CLIContext } from '../../src/cli/handlers/interfaces.js';
import type { CIRunResult } from '../../src/cli/utils/ci-config.js';
import type { QualityEvidenceValues, QualityMetricName } from '../../src/domains/quality-assessment/quality-evidence.js';

vi.mock('../../src/mcp/services/task-router.js', () => ({
  getTaskRouter: vi.fn(async () => { throw new Error('Routing unavailable in offline test'); }),
}));

const FROZEN: QualityEvidenceValues = {
  coverage: 91, testsPassing: 100, criticalBugs: 0, codeSmells: 3,
  securityVulnerabilities: 0, technicalDebt: 1, duplications: 1,
};
const METRICS = Object.keys(FROZEN) as QualityMetricName[];

type Verdict = Record<string, any>;

describe('#1474 candidate-bound gate across CLI, CI and MCP', () => {
  let root: string;
  let server: MCPProtocolServer;
  let memory: MemoryBackend;
  let evidence: typeof import('../../src/domains/quality-assessment/quality-evidence.js');
  let cli: typeof import('../../src/cli/commands/quality.js');
  let ci: typeof import('../../src/cli/commands/ci.js');
  let core: typeof import('../../src/mcp/handlers/core-handlers.js');
  let resetCache: () => void;
  const originalCwd = process.cwd();
  const git = (...args: string[]) => execFileSync('git', [
    '-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: root, stdio: 'ignore' });

  async function measure(metrics: QualityMetricName[] = METRICS, measuredAt = new Date().toISOString()) {
    // Independent measurements: one write per metric, each with its own source.
    for (const metric of metrics) {
      await evidence.writeQualityEvidence(memory, { [metric]: FROZEN[metric] }, {
        measuredAt, source: `frozen-${metric}`,
      });
    }
  }

  async function runCLI(): Promise<{ verdict: Verdict; exitCode: number }> {
    const output = join(root, 'cli-result.json');
    const exit = vi.fn(async (_code: number) => undefined);
    const command = cli.createQualityCommand(
      { kernel: core.getFleetState().kernel } as CLIContext, exit as never, async () => true,
    );
    await command.parseAsync(['--gate', '--format', 'json', '--output', output], { from: 'user' });
    return { verdict: JSON.parse(await readFile(output, 'utf8')), exitCode: exit.mock.calls[0][0] };
  }

  async function runCI(): Promise<{ report: CIRunResult; artifact: Verdict; exitCode: number }> {
    const output = join(root, 'ci-result.json');
    const cleanup = vi.fn(async (_code: number) => undefined);
    const command = ci.createCICommand(
      { kernel: core.getFleetState().kernel } as CLIContext, cleanup as never, async () => true,
    );
    await command.parseAsync(['run', '--phase', 'quality-gate', '--format', 'json', '--output', output], { from: 'user' });
    const report = JSON.parse(await readFile(output, 'utf8')) as CIRunResult;
    const artifact = JSON.parse(await readFile(report.phases[0].artifacts[0], 'utf8'));
    return { report, artifact, exitCode: cleanup.mock.calls[0][0] };
  }

  async function runMCP(): Promise<ToolResult<Verdict>> {
    resetCache();
    core.getFleetState().queen!.getDomainBreakerRegistry()?.resetAll();
    const response = await server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'quality_assess', arguments: { runGate: true } },
    }) as { content: Array<{ text: string }> };
    return JSON.parse(response.content[0].text) as ToolResult<Verdict>;
  }

  /** Run all three entry points and check they agree. */
  async function gateEverywhere() {
    const [cliRun, ciRun, mcp] = [await runCLI(), await runCI(), await runMCP()];
    expect(ciRun.artifact.candidate).toEqual(cliRun.verdict.candidate);
    expect(mcp.data?.candidate).toEqual(cliRun.verdict.candidate);
    return { cliRun, ciRun, mcp };
  }

  const codes = (problems: Array<{ metric: string; code: string }> = []) =>
    Object.fromEntries(problems.map((p) => [p.metric, p.code]));

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'aqe-gate-1474-'));
    process.chdir(root);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
    vi.stubEnv('AQE_SESSION_CACHE', 'on');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_LLM_ROUTER_DISABLED', 'true');
    vi.stubEnv('AQE_TRAJECTORY_JUDGE', '0');
    vi.stubEnv('AQE_EMBEDDER_ENDPOINT', 'http://127.0.0.1:9');
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'index.ts'), 'export const a = 1;\n');
    await writeFile(join(root, '.gitignore'), 'ci-result.json\ncli-result.json\n');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'A');
    const { createMCPProtocolServer } = await import('../../src/mcp/protocol-server.js');
    core = await import('../../src/mcp/handlers/core-handlers.js');
    evidence = await import('../../src/domains/quality-assessment/quality-evidence.js');
    cli = await import('../../src/cli/commands/quality.js');
    ci = await import('../../src/cli/commands/ci.js');
    ({ resetSessionCache: resetCache } = await import('../../src/optimization/session-cache.js'));
    server = createMCPProtocolServer();
    const fleet = await server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'fleet_init', arguments: { memoryBackend: 'memory', maxAgents: 2 } },
    }) as { content: Array<{ text: string }> };
    expect(JSON.parse(fleet.content[0].text).success).toBe(true);
    memory = core.getFleetState().kernel!.memory;
  }, 60000);

  afterAll(async () => {
    resetCache?.();
    await server?.stop();
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  // The cases build on each other: one checkout moves from A to B.
  it('legacy-only evidence is insufficient everywhere (legacy-unbound)', async () => {
    for (const metric of METRICS) {
      await memory.set(`quality-evidence:${metric}:latest`, {
        schemaVersion: 1, metric, value: FROZEN[metric], measuredAt: new Date().toISOString(), source: 'legacy',
      }, { namespace: evidence.QUALITY_EVIDENCE_NAMESPACE });
    }
    const { cliRun, ciRun, mcp } = await gateEverywhere();
    expect(cliRun.exitCode).toBe(3);
    expect(ciRun.exitCode).toBe(1);
    expect(mcp.success).toBe(false);
    const expected = Object.fromEntries(METRICS.map((m) => [m, 'legacy-unbound']));
    expect(codes(cliRun.verdict.problems)).toEqual(expected);
    expect(codes(ciRun.artifact.problems)).toEqual(expected);
    expect(codes(mcp.data?.problems)).toEqual(expected);
  });

  it('stale evidence for this candidate is insufficient everywhere', async () => {
    await measure(METRICS, new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString());
    const { cliRun, ciRun, mcp } = await gateEverywhere();
    const expected = Object.fromEntries(METRICS.map((m) => [m, 'stale']));
    expect(codes(cliRun.verdict.problems)).toEqual(expected);
    expect(codes(ciRun.artifact.problems)).toEqual(expected);
    expect(codes(mcp.data?.problems)).toEqual(expected);
  });

  let receiptsA: Record<string, { receiptId: string }>;
  let candidateA: Verdict;

  it('all A evidence passes for A, with identical candidate and receipt ids on every surface', async () => {
    await measure();
    const { cliRun, ciRun, mcp } = await gateEverywhere();
    expect(cliRun.exitCode).toBe(0);
    expect(ciRun.exitCode).toBe(0);
    expect(mcp.success).toBe(true);
    expect(cliRun.verdict).toMatchObject({ passed: true, candidate: { status: 'resolved', dirty: false } });
    receiptsA = cliRun.verdict.receipts;
    candidateA = cliRun.verdict.candidate;
    expect(Object.keys(receiptsA)).toEqual(METRICS);
    expect(ciRun.artifact.receipts).toEqual(receiptsA);
    expect(mcp.data?.receipts).toEqual(receiptsA);
    expect(ciRun.artifact.thresholds.coverage.value).toBe(80);
  });

  it('all A evidence is insufficient for B (a new commit), on every surface', async () => {
    await writeFile(join(root, 'src', 'index.ts'), 'export const a = 2;\n');
    git('commit', '-qam', 'B');
    const { cliRun, ciRun, mcp } = await gateEverywhere();
    expect(cliRun.verdict.candidate.id).not.toBe(candidateA.id);
    expect(cliRun.exitCode).toBe(3);
    expect(ciRun.exitCode).toBe(1);
    expect(ciRun.report.qualityGatePassed).toBe(false);
    expect(mcp.success).toBe(false);
    const expected = Object.fromEntries(METRICS.map((m) => [m, 'mismatched']));
    expect(codes(cliRun.verdict.problems)).toEqual(expected);
    expect(codes(ciRun.artifact.problems)).toEqual(expected);
    expect(codes(mcp.data?.problems)).toEqual(expected);
    // The rejected receipts are A's, named the same way everywhere.
    expect(cliRun.verdict.problems.map((p: Verdict) => p.receiptId))
      .toEqual(METRICS.map((m) => receiptsA[m].receiptId));
  });

  it('mixed A/B evidence (five B, two A) is insufficient for B', async () => {
    await measure(METRICS.slice(2));
    const { cliRun, ciRun, mcp } = await gateEverywhere();
    const expected = { coverage: 'mismatched', testsPassing: 'mismatched' };
    expect(codes(cliRun.verdict.problems)).toEqual(expected);
    expect(codes(ciRun.artifact.problems)).toEqual(expected);
    expect(codes(mcp.data?.problems)).toEqual(expected);
    expect(cliRun.exitCode).toBe(3);
  });

  it('seven independently measured B records pass for B', async () => {
    await measure(METRICS.slice(0, 2));
    const { cliRun, ciRun, mcp } = await gateEverywhere();
    expect(cliRun.exitCode).toBe(0);
    expect(ciRun.exitCode).toBe(0);
    expect(mcp.data?.passed).toBe(true);
    expect(mcp.data?.receipts).toEqual(cliRun.verdict.receipts);
    expect(new Set(Object.values(cliRun.verdict.receipts as Record<string, { receiptId: string }>)
      .map((r) => r.receiptId)).size).toBe(7);
  });

  it('changed dirty-tree content with the same HEAD is insufficient', async () => {
    await writeFile(join(root, 'src', 'index.ts'), 'export const a = 3; // uncommitted\n');
    const { cliRun, ciRun, mcp } = await gateEverywhere();
    expect(cliRun.verdict.candidate).toMatchObject({ dirty: true });
    expect(cliRun.exitCode).toBe(3);
    expect(ciRun.exitCode).toBe(1);
    expect(mcp.success).toBe(false);
    expect(Object.values(codes(cliRun.verdict.problems))).toEqual(METRICS.map(() => 'mismatched'));
  });
});
