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
  let core: typeof import('../../src/mcp/handlers/core-handlers.js');
  let resetCache: () => void;
  const originalCwd = process.cwd();

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
  });

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
  });

  it.each(failures)('blocks measured %s failure even when static code analysis passes', async (metric, value) => {
    await seed({ ...passing, [metric]: value });
    const analysis = await callTool<QualityAssessResult>('quality_assess', { runGate: false });
    expect(analysis.data?.passed).toBe(true);
    const result = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
    const expected = cli.evaluateMeasuredQualityEvidence(await cli.loadQualityEvidence(memory));
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ passed: false, checks: expected.checks,
      recommendations: expected.recommendations, riskDecision: { decision: 'block' } });
    expect(cli.getMeasuredQualityExitCode(expected)).toBe(1);
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
      const result = await callTool<QualityAssessResult>('quality_assess', { runGate: true });
      expect(result.success).toBe(false);
      expect(result.error).toBe((expected as Error).message);
      expect(result.data).toBeUndefined();
    },
  );

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

  it('preserves analysis-only requests without measured evidence', async () => {
    const result = await callTool<QualityAssessResult>('quality_assess', {});
    expect(result.success).toBe(true);
    expect(result.data?.passed).toBe(true);
    expect(result.data?.qualityScore).toBeGreaterThan(80);
    expect(result.data).not.toHaveProperty('checks');
  });
});
