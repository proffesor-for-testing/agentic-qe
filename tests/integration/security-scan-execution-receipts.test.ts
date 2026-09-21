/** Registered security scan results must describe work that actually executed. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { MCPProtocolServer } from '../../src/mcp/protocol-server.js';
import type { SecurityScannerService } from '../../src/domains/security-compliance/services/security-scanner.js';
import type { ToolResult } from '../../src/mcp/types.js';

// Keep the registered handler, executor, discovery, kernel memory, and built-in
// scanner real. Only external Semgrep availability and routing advice are mocked.
vi.mock('../../src/mcp/services/task-router.js', () => ({
  getTaskRouter: vi.fn(async () => { throw new Error('Offline routing fixture'); }),
}));
vi.mock('../../src/domains/security-compliance/services/semgrep-integration.js', () => ({
  isSemgrepAvailable: vi.fn(async () => false),
  runSemgrepWithRules: vi.fn(async () => { throw new Error('External Semgrep must not run'); }),
  convertSemgrepFindings: vi.fn(() => []),
}));

type ScanResponse = {
  savedFiles?: string[]; findings?: unknown[]; status: string; vulnerabilities: number; filesScanned: number;
  deepAnalysisPerformed: boolean; topVulnerabilities: Array<{ type: string }>;
  coverage?: { filesScanned: number }; limitations: string[]; recommendations: string[];
  evidence: {
    completeness: string; requestedFiles: number;
    files: Array<{ path: string; status: string; sourceDigest?: string; engineId: string }>;
    engines: Array<{ id: string; requested: boolean; status: string; errors: string[] }>;
    discovery?: { status: string; issues: Array<{ path: string; reason: string }> };
  };
};

describe('registered security_scan_comprehensive execution receipts', () => {
  let server: MCPProtocolServer;
  let embedder: Server;
  let root: string;
  let scanner: SecurityScannerService;
  let core: typeof import('../../src/mcp/handlers/core-handlers.js');
  let resetCache: () => void;
  const originalCwd = process.cwd();

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<ToolResult<T>> {
    const response = await server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args },
    }) as { content: Array<{ text: string }> };
    return JSON.parse(response.content[0].text) as ToolResult<T>;
  }

  async function source(name: string, content = 'export const answer = 42;\n'): Promise<string> {
    const dir = await mkdtemp(join(root, name));
    await writeFile(join(dir, 'example.ts'), content);
    return dir;
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'aqe-security-receipts-'));
    process.chdir(root);
    // Set every path before production imports. The entire test uses a new root.
    vi.stubEnv('TMPDIR', root);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_SESSION_CACHE', 'on');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_LLM_ROUTER_DISABLED', 'true');
    vi.stubEnv('AQE_TRAJECTORY_JUDGE', '0');
    vi.stubEnv('AQE_LEARNING_ENABLED', 'false');
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
    vi.stubEnv('AQE_EMBEDDER_ENDPOINT', `http://127.0.0.1:${(embedder.address() as { port: number }).port}`);
    const { createMCPProtocolServer } = await import('../../src/mcp/protocol-server.js');
    core = await import('../../src/mcp/handlers/core-handlers.js');
    ({ resetSessionCache: resetCache } = await import('../../src/optimization/session-cache.js'));
    server = createMCPProtocolServer();
    const fleet = await callTool('fleet_init', { memoryBackend: 'memory', maxAgents: 2 });
    expect(fleet.success).toBe(true);
    const { getTaskExecutor } = await import('../../src/mcp/handlers/handler-factory.js');
    scanner = getTaskExecutor().getSecurityScanner();
  }, 60000);

  beforeEach(() => {
    resetCache();
    core.getFleetState().queen!.getDomainBreakerRegistry()?.resetAll();
    // Configure the real producer, without replacing its results or scan method.
    Object.assign((scanner as unknown as { config: Record<string, unknown> }).config, {
      defaultRuleSets: ['owasp-top-10', 'cwe-sans-25'], enableSemgrep: false, enableLLMAnalysis: false,
    });
  });

  afterAll(async () => {
    resetCache?.();
    await server?.stop();
    if (embedder) await new Promise<void>(resolve => embedder.close(() => resolve()));
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
  });

  it('preserves an unavailable discovery outcome instead of a completed clean scan', async () => {
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { target: join(root, 'absent'), sast: true });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'unavailable', filesScanned: 0, deepAnalysisPerformed: false,
      evidence: { completeness: 'none', discovery: { status: 'failed' } } });
    expect(result.data!.evidence.discovery!.issues.length).toBeGreaterThan(0);
    expect(result.data!.recommendations).toEqual(['No findings reported; requested analysis is incomplete or unverified. Inspect execution receipts.']);
  });

  it('preserves real completed clean receipts and their source digests', async () => {
    const target = await source('clean-');
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { target, sast: true });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'completed', vulnerabilities: 0, filesScanned: 1,
      deepAnalysisPerformed: true, evidence: { completeness: 'complete', requestedFiles: 1 } });
    expect(result.data!.evidence.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: join(target, 'example.ts'), status: 'analyzed', sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]));
  });

  it('retains findings and a failed SAST outcome when the real scanner rejects its rule configuration', async () => {
    const target = await source('partial-', 'eval(userInput);\n');
    (scanner as unknown as { config: { defaultRuleSets: string[] } }).config.defaultRuleSets = ['unknown-fixture-rules'];
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { target, sast: true });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'partial', deepAnalysisPerformed: false,
      evidence: { completeness: 'partial' } });
    expect(result.data!.vulnerabilities).toBeGreaterThan(0);
    expect(result.data!.topVulnerabilities.some(v => v.type.includes('eval/exec'))).toBe(true);
    expect(result.data!.evidence.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'failed', errors: expect.arrayContaining([expect.stringContaining('No valid rule sets')]) }),
    ]));
  });

  it('does no source scanning when both scan modes are disabled', async () => {
    const target = await source('disabled-', 'eval(userInput);\n');
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { target, sast: false, dast: false });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'unavailable', vulnerabilities: 0, filesScanned: 0,
      deepAnalysisPerformed: false, evidence: { completeness: 'none' } });
    expect(result.data!.evidence.engines.every(engine => !engine.requested)).toBe(true);
  });

  it('reports requested DAST without a URL as not-run without unrelated source discovery', async () => {
    const result = await callTool<ScanResponse>('security_scan_comprehensive', {
      target: join(root, 'not-a-source-target'), sast: false, dast: true,
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'unavailable', filesScanned: 0,
      evidence: { completeness: 'none' } });
    expect(result.data!.evidence.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dast', requested: true, status: 'not-run' }),
    ]));
    expect(result.data!.evidence.discovery).toBeUndefined();
  });

  it('exposes an unavailable optional external engine without erasing completed built-in work', async () => {
    const target = await source('optional-');
    (scanner as unknown as { config: { enableSemgrep: boolean } }).config.enableSemgrep = true;
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { target, sast: true });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'completed', evidence: { completeness: 'complete' } });
    expect(result.data!.evidence.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'semgrep', status: 'unavailable' }),
    ]));
    expect(result.data!.limitations.length).toBeGreaterThan(0);
  });

  it('does not credit a legacy DAST success without a receipt establishing execution', async () => {
    const result = await callTool<ScanResponse>('security_scan_comprehensive', {
      sast: false, dast: true, targetUrl: 'not-a-valid-url',
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'unavailable', filesScanned: 0,
      evidence: { completeness: 'none' } });
    expect(result.data!.evidence.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dast', status: 'unverified' }),
    ]));
    expect(result.data!.limitations).toContain('dast returned no execution receipt; coverage is unverified.');
  });

  it('treats a legacy task result without receipts as unverified', async () => {
    const { securityScanConfig } = await import('../../src/mcp/handlers/domain-handler-configs.js');
    const result = securityScanConfig.mapToResult('legacy-fixture', {
      vulnerabilities: 0, filesScanned: 100, deepAnalysisPerformed: true,
    }, 1);
    expect(result.status).toBe('unverified');
    expect(result.deepAnalysisPerformed).toBe(false);
    expect(result.filesScanned).toBeUndefined();
    expect(result.coverage).toBeUndefined();
  });


  it('does not credit an explicitly requested unsupported file as analyzed', async () => {
    const target = join(root, 'unsupported.bin');
    await writeFile(target, 'eval(userInput);');
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { target, sast: true });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'unavailable', vulnerabilities: 0, filesScanned: 0,
      deepAnalysisPerformed: false, evidence: { completeness: 'none', requestedFiles: 1 } });
    expect(result.data!.evidence.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: target, engineId: 'generic-patterns', status: 'unsupported' }),
    ]));
    expect(result.data!.recommendations.join(' ')).not.toContain('maintain current security practices');
  });

  it('credits actual generic analysis of Python without claiming language-specific SAST', async () => {
    const target = join(root, 'generic.py');
    await writeFile(target, 'print("hello")\n');
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { target, sast: true });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'completed', filesScanned: 1, deepAnalysisPerformed: false });
    expect(result.data!.evidence.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'generic-patterns', status: 'completed' }),
      expect.objectContaining({ id: 'sast', status: 'not-run' }),
    ]));
  });

  it('executes a fresh scan when source changes under identical public arguments', async () => {
    const target = await source('changed-');
    const args = { target, sast: true };
    const first = await callTool<ScanResponse>('security_scan_comprehensive', args);
    expect(first.data?.vulnerabilities).toBe(0);
    const firstDigest = first.data!.evidence.files.find(file => file.engineId === 'generic-patterns')!.sourceDigest;
    await writeFile(join(target, 'example.ts'), 'eval(userInput);\n');
    const second = await callTool<ScanResponse>('security_scan_comprehensive', args);
    expect(second.data!.vulnerabilities).toBeGreaterThan(0);
    expect(second.data!.evidence.files.find(file => file.engineId === 'generic-patterns')!.sourceDigest).not.toBe(firstDigest);
  });

  it.each(['false', 0, null])('rejects a non-boolean SAST flag (%j)', async (sast) => {
    const result = await callTool<ScanResponse>('security_scan_comprehensive', { sast });
    expect(result.success).toBe(false);
    expect(result.error).toContain('sast must be a boolean');
    expect(result.data).toBeUndefined();
  });


  it('marks requested compliance checks not-run without claiming they were performed', async () => {
    const target = await source('compliance-');
    const result = await callTool<ScanResponse>('security_scan_comprehensive', {
      target, sast: true, compliance: ['soc2'],
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ status: 'partial', evidence: { completeness: 'partial' } });
    expect(result.data!.evidence.engines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'compliance', requested: true, status: 'not-run' }),
    ]));
  });

  it('preserves incomplete execution and every finding in saved JSON, Markdown, and SARIF', async () => {
    // Enable only result-file writes after fleet initialization. Any incidental
    // storage remains confined to this suite's fresh cwd/AQE_PROJECT_ROOT.
    vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
    try {
      const lines = Array.from({ length: 12 }, (_, i) => `const password_${i} = "synthetic-fixture-${i}";`).join('\n');
      const target = await source('saved-partial-', lines);
      (scanner as unknown as { config: { defaultRuleSets: string[] } }).config.defaultRuleSets = ['unknown-fixture-rules'];
      const result = await callTool<ScanResponse>('security_scan_comprehensive', { target, sast: true });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('partial');
      expect(result.data!.vulnerabilities).toBeGreaterThan(10);
      const files = result.data!.savedFiles!;
      expect(files).toHaveLength(3);
      const saved = JSON.parse(await readFile(files.find(file => file.endsWith('_scan.json'))!, 'utf8'));
      expect(saved.status).toBe('partial');
      expect(saved.findings).toHaveLength(result.data!.vulnerabilities);
      const sarif = JSON.parse(await readFile(files.find(file => file.endsWith('.sarif'))!, 'utf8'));
      expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(false);
      expect(sarif.runs[0].properties.securityScan.evidence.completeness).toBe('partial');
      expect(sarif.runs[0].results).toHaveLength(result.data!.vulnerabilities);
      const markdown = await readFile(files.find(file => file.endsWith('_report.md'))!, 'utf8');
      expect(markdown).toContain('**Execution:** partial');
      expect(markdown).toContain('## Execution receipts');
      expect(markdown).toContain('## All findings');
    } finally {
      vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    }
  });

});
