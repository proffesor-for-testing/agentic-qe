/** The registered MCP gate must enforce the same measured evidence as the CLI. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { MCPProtocolServer } from '../../src/mcp/protocol-server.js';
import type { MemoryBackend } from '../../src/kernel/interfaces.js';
import type { QualityAssessResult } from '../../src/mcp/handlers/domain-handler-configs.js';
import type { ToolResult } from '../../src/mcp/types.js';
import type { QualityEvidenceValues } from '../../src/domains/quality-assessment/quality-evidence.js';
import type { CLIContext } from '../../src/cli/handlers/interfaces.js';
import type { CIRunResult } from '../../src/cli/utils/ci-config.js';

// Routing advice is unrelated to gate enforcement. Keep the real registered
// handler, executor, analyzer, kernel memory, and evidence validator in this test.
vi.mock('../../src/mcp/services/task-router.js', () => ({
  getTaskRouter: vi.fn(async () => { throw new Error('Routing unavailable in offline test'); }),
}));

const passing: QualityEvidenceValues = {
  coverage: 90, testsPassing: 100, criticalBugs: 0, codeSmells: 10,
  securityVulnerabilities: 0, technicalDebt: 2, duplications: 3,
};
const failures: [keyof QualityEvidenceValues, number][] = [
  ['coverage', 79], ['testsPassing', 94], ['criticalBugs', 1],
  ['codeSmells', 21], ['securityVulnerabilities', 1], ['technicalDebt', 6], ['duplications', 6],
];

describe('registered quality_assess measured gate', () => {
  let server: MCPProtocolServer;
  let embedder: Server;
  let memory: MemoryBackend;
  let evidence: typeof import('../../src/domains/quality-assessment/quality-evidence.js');
  let cli: typeof import('../../src/cli/commands/quality.js');
  let ci: typeof import('../../src/cli/commands/ci.js');
  let core: typeof import('../../src/mcp/handlers/core-handlers.js');
  let resetCache: () => void;
  const originalCwd = process.cwd();

  async function runCIGate(args: string[] = []) {
    const output = join(process.cwd(), 'ci-result.json');
    const cleanup = vi.fn(async (_code: number) => undefined);
    const command = ci.createCICommand(
      { kernel: core.getFleetState().kernel } as CLIContext,
      cleanup as unknown as (code: number) => Promise<never>,
      async () => true,
    );
    await command.parseAsync([
      'run', '--phase', 'quality-gate', '--format', 'json', '--output', output, ...args,
    ], { from: 'user' });
    return {
      report: JSON.parse(await readFile(output, 'utf8')) as CIRunResult,
      exitCode: cleanup.mock.calls[0]?.[0],
    };
  }

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<ToolResult<T>> {
    const response = await server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args },
    }) as { content: Array<{ text: string }> };
    return JSON.parse(response.content[0].text) as ToolResult<T>;
  }

  async function seed(values: QualityEvidenceValues = passing, ageMs = 0): Promise<void> {
    await evidence.writeQualityEvidence(memory, values, {
      measuredAt: new Date(Date.now() - ageMs).toISOString(), source: 'regression-fixture',
    });
  }

  beforeAll(async () => {
    // Set cwd/root BEFORE product imports: none of the fleet's stores may touch
    // a developer's project database, even incidental learning infrastructure.
    const root = await mkdtemp(join(tmpdir(), 'aqe-measured-gate-'));
    process.chdir(root);
    embedder = createServer((request, response) => {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const { input } = JSON.parse(body);
        const inputs = Array.isArray(input) ? input : [input];
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ data: inputs.map((_, index) => ({
          index, embedding: [1, ...Array(383).fill(0)],
        })) }));
      });
    });
    await new Promise<void>(resolve => embedder.listen(0, '127.0.0.1', resolve));
    const port = (embedder.address() as { port: number }).port;
    vi.stubEnv('AQE_EMBEDDER_ENDPOINT', `http://127.0.0.1:${port}`);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    // The fleet below uses memory; incidental persistence and result files are
    // confined to this fresh root. Enable result writes to verify gate reports.
    vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
    vi.stubEnv('AQE_SESSION_CACHE', 'on');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_LLM_ROUTER_DISABLED', 'true');
    vi.stubEnv('AQE_TRAJECTORY_JUDGE', '0');
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'math.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    const { createMCPProtocolServer } = await import('../../src/mcp/protocol-server.js');
    core = await import('../../src/mcp/handlers/core-handlers.js');
    evidence = await import('../../src/domains/quality-assessment/quality-evidence.js');
    cli = await import('../../src/cli/commands/quality.js');
    ci = await import('../../src/cli/commands/ci.js');
    ({ resetSessionCache: resetCache } = await import('../../src/optimization/session-cache.js'));
    server = createMCPProtocolServer();
    const fleet = await callTool('fleet_init', { memoryBackend: 'memory', maxAgents: 2 });
    expect(fleet.success).toBe(true);
    memory = core.getFleetState().kernel!.memory;
  }, 60000);

  beforeEach(async () => {
    resetCache();
    // Each case starts with independent evidence; previous expected errors must
    // not trip the fleet's unrelated protective circuit breaker for this case.
    core.getFleetState().queen!.getDomainBreakerRegistry()?.resetAll();
    for (const metric of Object.keys(passing)) {
      await memory.delete(`quality-evidence:${metric}:latest`, { namespace: evidence.QUALITY_EVIDENCE_NAMESPACE });
    }
    await memory.delete('coverage:latest');
  });

  /** Measured coverage the static analyzer reads (written by coverage analysis). */
  async function seedStaticCoverage(line = 90): Promise<void> {
    await memory.set('coverage:latest', { line, branch: line, function: line, statement: line, files: 1 });
  }

  afterAll(async () => {
    resetCache?.();
    await server?.stop();
    if (embedder) await new Promise<void>(resolve => embedder.close(() => resolve()));
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  it('approves fresh passing evidence and exposes all seven CLI-identical checks', async () => {
    await seed();
    const result = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
    const expected = cli.evaluateMeasuredQualityEvidence(await cli.loadQualityEvidence(memory));
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ passed: true, metrics: passing, checks: expected.checks,
      recommendations: expected.recommendations, riskDecision: { decision: 'approve' } });
    // The canonical gate has no aggregate score; do not invent one from static analysis.
    expect(result.data?.qualityScore).toBeUndefined();
    const report = result.data?.savedFiles?.find(file => file.endsWith('_report.md'));
    expect(report).toBeDefined();
    expect(await readFile(report!, 'utf8')).toContain('N/A — measured gate uses individual checks.');

    const pipeline = await runCIGate();
    expect(pipeline.exitCode).toBe(0);
    expect(pipeline.report).toMatchObject({
      overallStatus: 'passed', qualityGatePassed: true, qualityGateStatus: 'passed',
      phases: [{ status: 'passed', details: { passed: true, checks: expected.checks } }],
    });
    const artifact = JSON.parse(await readFile(pipeline.report.phases[0].artifacts[0], 'utf8'));
    expect(artifact).toMatchObject({ passed: true, checks: expected.checks });
    expect(artifact).not.toHaveProperty('score');
  });

  it.each(failures)('blocks measured %s failure even when static code analysis passes', async (metric, value) => {
    await seed({ ...passing, [metric]: value });
    await seedStaticCoverage();
    const analysis = await callTool<QualityAssessResult>('quality_assess', { runGate: false });
    expect(analysis.data).toMatchObject({ passed: true, evidenceStatus: 'measured', gateEvaluated: false });
    const result = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
    const expected = cli.evaluateMeasuredQualityEvidence(await cli.loadQualityEvidence(memory));
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ passed: false, checks: expected.checks,
      recommendations: expected.recommendations, riskDecision: { decision: 'block' } });
    expect(cli.getMeasuredQualityExitCode(expected)).toBe(1);
    const pipeline = await runCIGate();
    expect(pipeline.exitCode).toBe(1);
    expect(pipeline.report).toMatchObject({
      overallStatus: 'failed', qualityGatePassed: false, qualityGateStatus: 'failed',
      phases: [{ status: 'failed', details: { passed: false, checks: expected.checks } }],
    });
  });

  it.each(['missing', 'partial', 'stale', 'malformed', 'future'] as const)(
    'fails closed for %s evidence with the same error as the CLI loader', async (mode) => {
      if (mode !== 'missing') await seed(passing, mode === 'stale' ? 48 * 60 * 60 * 1000 : 0);
      if (mode === 'partial') {
        await memory.delete('quality-evidence:technicalDebt:latest', { namespace: evidence.QUALITY_EVIDENCE_NAMESPACE });
      }
      if (mode === 'malformed' || mode === 'future') {
        await memory.set('quality-evidence:coverage:latest', {
          schemaVersion: 1, metric: 'coverage', value: 90, source: 'regression-fixture',
          ...(mode === 'future' ? { measuredAt: new Date(Date.now() + 120_000).toISOString() } : {}),
        }, { namespace: evidence.QUALITY_EVIDENCE_NAMESPACE });
      }
      const expected = await cli.loadQualityEvidence(memory).catch((error: Error) => error);
      expect(expected).toBeInstanceOf(Error);
      // N5: absent, stale, future-dated and malformed records are all named.
      const unmeasured = {
        missing: Object.keys(passing),
        partial: ['technicalDebt'],
        stale: Object.keys(passing),
        malformed: ['coverage'],
        future: ['coverage'],
      }[mode];
      const result = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
      expect(result.success).toBe(false);
      expect(result.error).toBe((expected as Error).message);
      // N4: the failure carries the shared insufficient-evidence shape.
      expect(result.data).toMatchObject({
        passed: false, status: 'insufficient-evidence', evidenceStatus: 'insufficient-evidence',
        gateEvaluated: false, unmeasured,
      });
      const cliResult = await cli.describeUnavailableQualityEvidence(memory, expected);
      expect(cliResult).toMatchObject({ status: 'insufficient-evidence', unmeasured });
      expect(cli.getMeasuredQualityExitCode(cliResult)).toBe(3);
      const pipeline = await runCIGate();
      expect(pipeline.exitCode).toBe(1);
      expect(pipeline.report.qualityGatePassed).toBe(false);
      expect(pipeline.report.phases[0].summary).toContain((expected as Error).message);
      const artifact = JSON.parse(await readFile(pipeline.report.phases[0].artifacts[0], 'utf8'));
      expect(artifact).toMatchObject({
        passed: false, status: 'insufficient-evidence', evidenceStatus: 'insufficient-evidence', unmeasured,
      });
    },
  );

  it('rejects an invalid phase without reporting a passing gate, even when enforcement is disabled', async () => {
    await seed();
    await runCIGate();
    const required = await runCIGate(['--phase', 'no-such-phase']);
    expect(required.exitCode).toBe(1);
    expect(required.report).toMatchObject({
      phases: [], qualityGatePassed: false, qualityGateStatus: 'not-run', overallStatus: 'failed',
    });
    expect(required.report.configurationError).toContain('no-such-phase');
    expect(JSON.parse(await readFile(join(process.cwd(), '.aqe-ci-output', 'quality-gate.json'), 'utf8')))
      .toMatchObject({ passed: false, status: 'not-run', evidenceStatus: 'not-run' });
    const advisory = await runCIGate(['--phase', 'no-such-phase', '--no-quality-gate']);
    expect(advisory.exitCode).toBe(1);
    expect(advisory.report).toMatchObject({
      phases: [], qualityGatePassed: false, qualityGateStatus: 'not-run', qualityGateEnforced: false,
      overallStatus: 'failed',
    });
    expect(await readFile(join(process.cwd(), '.aqe-ci-output', 'ci-report.md'), 'utf8'))
      .toContain('**Quality Gate:** Not run (advisory)');
  });

  it('retains a failed advisory gate and continues without blocking the pipeline', async () => {
    await seed({ ...passing, criticalBugs: 1 });
    const pipeline = await runCIGate(['--no-quality-gate']);
    expect(pipeline.exitCode).toBe(0);
    expect(pipeline.report).toMatchObject({
      overallStatus: 'warning', qualityGatePassed: false, qualityGateEnforced: false,
      qualityGateStatus: 'failed', phases: [{ status: 'failed' }],
    });
  });

  it('rechecks changed evidence with identical gate arguments and the session cache enabled', async () => {
    await seed();
    const first = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
    expect(first.data?.passed).toBe(true);
    // A separate producer updates memory, without an MCP cache invalidation call.
    await seed({ ...passing, testsPassing: 0 });
    const second = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
    expect(second.data?.passed).toBe(false);
    expect(second.data?.riskDecision?.decision).toBe('block');
    await memory.delete('quality-evidence:coverage:latest', { namespace: evidence.QUALITY_EVIDENCE_NAMESPACE });
    const third = await callTool('quality_assess', { runGate: true });
    expect(third.success).toBe(false);
  });

  it.each(['true', 'false', 1, 0, null])('rejects invalid runGate=%j instead of silently analyzing', async (runGate) => {
    const result = await callTool<QualityAssessResult>('quality_assess', { runGate });
    expect(result.success).toBe(false);
    expect(result.error).toContain('runGate must be a boolean');
    expect(result.data).toBeUndefined();
  });

  // #996: an analysis-only request with unmeasured coverage must not approve.
  it('reports insufficient evidence, not approve, when coverage is unmeasured', async () => {
    const result = await callTool<QualityAssessResult>('quality_assess', {});
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: 'insufficient-evidence',
      passed: false,
      evidenceStatus: 'insufficient-evidence',
      unmeasured: ['coverage'],
      gateEvaluated: false,
      metrics: { coverage: -1 },
      riskDecision: { decision: 'escalate' },
    });
    // The static score is still reported, but it is not a verdict.
    expect(result.data?.qualityScore).toBeGreaterThan(80);
    expect(result.data?.confidence).toBeLessThan(1);
    expect(result.data?.riskDecision?.confidence).toBeLessThan(0.5);
    expect(result.data?.note).toMatch(/no quality gate was evaluated/i);
    expect(result.data?.recommendations[0]).toMatch(/insufficient evidence: coverage not measured — run the tests with coverage/i);
    expect(result.data).not.toHaveProperty('checks');
    const report = result.data?.savedFiles?.find(file => file.endsWith('_report.md'));
    expect(report).toBeDefined();
    const markdown = await readFile(report!, 'utf8');
    expect(markdown).toContain('INSUFFICIENT EVIDENCE');
    expect(markdown).toContain('| coverage | not measured |');
    expect(markdown).not.toContain('all quality gates passed');
  });

  it('keeps the static verdict when every requested metric is measured', async () => {
    await seedStaticCoverage(92);
    const result = await callTool<QualityAssessResult>('quality_assess', {});
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: 'completed', passed: true, evidenceStatus: 'measured', unmeasured: [],
      gateEvaluated: false, confidence: 1, metrics: { coverage: 92 },
      // N1: an ungated static approval is capped below a gate pass.
      riskDecision: { decision: 'approve', confidence: 0.7 },
    });
    expect(result.data?.riskDecision?.rationale).toMatch(/no quality gate was evaluated/i);
  });

  it('fails closed with runGate true when measured coverage is missing', async () => {
    await seed();
    await memory.delete('quality-evidence:coverage:latest', { namespace: evidence.QUALITY_EVIDENCE_NAMESPACE });
    await seedStaticCoverage();
    const result = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('No measured quality evidence found for coverage.');
    expect(result.data).toMatchObject({ passed: false, status: 'insufficient-evidence', unmeasured: ['coverage'] });
    expect(result.data).not.toHaveProperty('riskDecision');
  });

  it('blocks a measured coverage failure even when security is unmeasured (N2)', async () => {
    await seedStaticCoverage(0);
    const result = await callTool<QualityAssessResult>('quality_assess', {
      metrics: ['coverage', 'complexity', 'security'],
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      passed: false, unmeasured: ['security'],
      measuredFailures: [{ metric: 'coverage', value: 0, threshold: 80 }],
      riskDecision: { decision: 'block' },
    });
  });

  it.each([
    ['a bare string', 'coverage'],
    ['an unknown name', ['coverage', 'vibes']],
  ])('rejects %s as metrics with a validation error (N3)', async (_label, metrics) => {
    const result = await callTool<QualityAssessResult>('quality_assess', { metrics });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/metrics/);
    expect(result.data).toBeUndefined();
  });
});
