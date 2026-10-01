import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { MCPProtocolServer } from '../../../src/mcp/protocol-server';

describe('#787 behavior examples via real MCP tools/call', () => {
  let server: MCPProtocolServer;
  let dir: string;
  const cwd = process.cwd();
  async function call(name: string, args: Record<string, unknown>) {
    const response = await server['handleRequest']({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as { content: Array<{text: string}> };
    return JSON.parse(response.content[0].text);
  }
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-787-mcp-'));
    process.chdir(dir);
    vi.stubEnv('AQE_PROJECT_ROOT', dir);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_LLM_ROUTER_DISABLED', 'true');
    vi.stubEnv('AQE_LEARNING_ENABLED', 'false');
    vi.stubEnv('AQE_SESSION_CACHE', 'off');
    const { createMCPProtocolServer } = await import('../../../src/mcp/protocol-server');
    server = createMCPProtocolServer();
    expect((await call('fleet_init', { memoryBackend: 'memory', maxAgents: 2 })).success).toBe(true);
  }, 180000);
  afterAll(async () => {
    await server?.stop();
    process.chdir(cwd);
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits runnable assertions from fixtures; preserves null unmeasured coverage at the protocol boundary', async () => {
    const source = join(dir, 'add.js');
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    const result = await call('test_generate_enhanced', {
      filePath: source, language: 'javascript', framework: 'node-test', aiEnhancement: false,
      behaviorExamples: [{ functionName: 'add', args: [2,3], expected: 5 }],
    });
    expect(result.success).toBe(true);
    expect(result.data.generationMode).toBe('behavior-examples');
    expect(result.data.coverage.predicted).toBeNull();
    expect(result.data.coverage.confidence).toBe(0);
    expect(result.data.tests[0].generationLimits.join(' ')).toContain('unmeasured');
    const file = join(dir, 'generated.test.mjs');
    writeFileSync(file, result.data.tests[0].testCode);
    expect(spawnSync(process.execPath, ['--test', file]).status).toBe(0);
    writeFileSync(source, 'export function add(a,b) { return a-b; }');
    expect(spawnSync(process.execPath, ['--test', file]).status).not.toBe(0);
  }, 180000);

  it('reports inline scaffolding and rejects unrecognized specifications through the protocol', async () => {
    const params = { sourceCode: 'export function add(a,b) { return a+b; }', framework: 'vitest', aiEnhancement: false };
    const scaffold = await call('test_generate_enhanced', params);
    expect(scaffold.success).toBe(true);
    expect(scaffold.data.tests[0].generationMode).toBe('scaffolding');
    expect(scaffold.data.tests[0].generationLimits.join(' ')).toContain('Inline source');
    expect(scaffold.data.tests[0].testCode).not.toContain('new moduleUnderTest');
    const invalid = await call('test_generate_enhanced', { ...params, behaviorExamples: [{ functionName: 'missing', args: [], expected: 1 }] });
    expect(invalid.success).toBe(false);
  }, 180000);

  it('advertises the behaviorExamples item shape in tools/list (#795)', async () => {
    const list = await server['handleRequest']({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) as {
      tools: Array<{ name: string; inputSchema: { properties: Record<string, { type: string; items?: { required?: string[] } }> } }>;
    };
    const schema = list.tools.find(t => t.name === 'test_generate_enhanced')!.inputSchema.properties.behaviorExamples;
    expect(schema.type).toBe('array');
    expect(schema.items?.required).toEqual(['functionName', 'args', 'expected']);
  });

  it('returns clean errors for invalid fixtures without opening the test-generation breaker (#795)', async () => {
    const source = join(dir, 'math.js');
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(source, 'export function add(a,b) { return a+b; }\nexport function isEven(n) { return n % 2 === 0; }');
    const base = { filePath: source, language: 'javascript', framework: 'vitest', aiEnhancement: false };
    const invalidCalls: unknown[] = [
      { functionName: 'add', args: [2, 3], expected: 5 },          // not an array (boundary)
      [{ functionName: 'add', args: [2, 3] }],                    // missing expected (boundary)
      [{ functionName: 'missing', args: [1], expected: 1 }],      // unknown export (domain)
      [{ functionName: 'add', args: [2], expected: 2 }],          // wrong arity (domain)
      [{ functionName: 'nope', args: [], expected: null }],       // unknown export (domain)
      'add(2,3)=5',                                               // not an array (boundary)
    ];
    // The test-generation breaker opens after 2 counted failures; send 3x that.
    for (const behaviorExamples of invalidCalls) {
      const response = await server['handleRequest']({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'test_generate_enhanced', arguments: { ...base, behaviorExamples } },
      }) as { isError?: boolean; content: Array<{ text: string }> };
      const body = JSON.parse(response.content[0].text);
      expect(response.isError).toBe(true);
      expect(body.success).toBe(false);
      expect(body.error).not.toContain('circuit breaker');
    }

    const valid = await call('test_generate_enhanced', { ...base, behaviorExamples: [{ functionName: 'isEven', args: [4], expected: true }] });
    expect(valid.error).toBeUndefined();
    expect(valid.success).toBe(true);
    expect(valid.data.tests[0].generationMode).toBe('behavior-examples');
  }, 180000);
});
