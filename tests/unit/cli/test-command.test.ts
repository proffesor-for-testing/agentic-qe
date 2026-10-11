import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestGeneratorService } from '../../../src/domains/test-generation/services/test-generator';
import { createTestCommand } from '../../../src/cli/commands/test.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

describe('test command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes an explicit Node framework to test execution', async () => {
    const runTests = vi.fn().mockResolvedValue({
      success: true,
      value: { passed: 1, failed: 0, skipped: 0, duration: 1 },
    });
    const context = {
      kernel: {
        getDomainAPIAsync: vi.fn().mockResolvedValue({ runTests }),
        memory: { set: vi.fn().mockResolvedValue(undefined) },
      },
    } as unknown as CLIContext;
    const command = createTestCommand(
      context,
      vi.fn() as unknown as (code: number) => Promise<never>,
      vi.fn().mockResolvedValue(true)
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.parseAsync([
      'execute',
      'tests/unit/cli/commands.test.ts',
      '--framework',
      'node',
    ], { from: 'user' });

    expect(runTests).toHaveBeenCalledWith(expect.objectContaining({
      framework: 'node',
    }));
    expect(context.kernel.memory.set).toHaveBeenCalledWith(
      'test-run:latest',
      expect.objectContaining({ passed: 1, failed: 0, skipped: 0 }),
      { namespace: 'test-execution', persist: true },
    );
  });

  it('exits unsuccessfully without publishing quality evidence when execution fails', async () => {
    const runTests = vi.fn().mockResolvedValue({ success: false, error: new Error('Runner could not complete') });
    const context = {
      kernel: {
        getDomainAPIAsync: vi.fn().mockResolvedValue({ runTests }),
        memory: { set: vi.fn() },
      },
    } as unknown as CLIContext;
    const cleanupAndExit = vi.fn(async (code: number): Promise<never> => {
      throw Object.assign(new Error('exit'), { exitCode: code });
    });
    const command = createTestCommand(context, cleanupAndExit, vi.fn().mockResolvedValue(true));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(command.parseAsync(['execute', 'tests/unit/cli/commands.test.ts'], { from: 'user' }))
      .rejects.toMatchObject({ exitCode: 1 });
    expect(cleanupAndExit.mock.calls[0]).toEqual([1]);
    expect(context.kernel.memory.set).not.toHaveBeenCalled();
  });
});

describe('#787 CLI behavior examples', () => {
  it('loads caller fixtures, invokes the real generator, and publishes passing quality evidence', async () => {
    const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'aqe-cli-787-'));
    const source = join(directory, 'add.js');
    const fixtures = join(directory, 'examples.json');
    const output = join(directory, 'result.json');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    writeFileSync(fixtures, JSON.stringify([{ functionName: 'add', args: [2,3], expected: 5 }]));
    const memory = { set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() };
    const generator = createTestGeneratorService(memory as never);
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => generator), memory } } as unknown as CLIContext;
    const exit = vi.fn() as unknown as (code: number) => Promise<never>;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync([
        'generate', source, '--behavior-examples', fixtures, '--framework', 'node-test', '--format', 'json', '--output', output,
      ], { from: 'user' });
      const result = JSON.parse(readFileSync(output, 'utf8'));
      expect(result.tests[0]).toMatchObject({ generationMode: 'behavior-examples', assertions: 1, qualityGateResult: { passed: true } });
      expect(result.coverageEstimate).toBeNull();
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync([
        'generate', source, '--behavior-examples', fixtures, '--framework', 'node-test', '--format', 'markdown', '--output', output,
      ], { from: 'user' });
      expect(readFileSync(output, 'utf8')).toContain('**Coverage Estimate**: Unmeasured');
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync([
        'generate', source, '--behavior-examples', fixtures, '--framework', 'node-test',
      ], { from: 'user' });
      expect(log.mock.calls.flat().join(' ')).toContain('Coverage Estimate: Unmeasured');
      expect(log.mock.calls.flat().join(' ')).not.toContain('Coverage Estimate: 0%');
      expect(exit).not.toHaveBeenCalledWith(1);
    } finally {
      log.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('exits 1 when the domain rejects a well-formed fixture file (unknown export)', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'aqe-cli-795-'));
    const source = join(directory, 'add.js');
    const fixtures = join(directory, 'examples.json');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    // Passes the shape validator; only the domain can tell `missing` is not an export.
    writeFileSync(fixtures, JSON.stringify([{ functionName: 'missing', args: [1], expected: 1 }]));
    const memory = { set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() };
    const generator = createTestGeneratorService(memory as never);
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => generator), memory } } as unknown as CLIContext;
    const cleanupAndExit = vi.fn(async (code: number): Promise<never> => {
      throw Object.assign(new Error('exit'), { exitCode: code });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(createTestCommand(context, cleanupAndExit, vi.fn(async () => true)).parseAsync([
        'generate', source, '--behavior-examples', fixtures, '--framework', 'node-test',
      ], { from: 'user' })).rejects.toMatchObject({ exitCode: 1 });
      expect(cleanupAndExit.mock.calls[0]).toEqual([1]);
      expect(error.mock.calls.flat().join(' ')).toContain("'missing' is not one");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('#925 CLI --no-save (parity with MCP saveResults:false)', () => {
  it('generates without writing test files, and writes them by default', async () => {
    const { mkdtempSync, writeFileSync, readdirSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'aqe-cli-925-'));
    const source = join(directory, 'add.js');
    const fixtures = join(directory, 'examples.json');
    writeFileSync(source, 'export function add(a,b) { return a+b; }');
    writeFileSync(fixtures, JSON.stringify([{ functionName: 'add', args: [2,3], expected: 5 }]));
    const memory = { set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() };
    const generator = createTestGeneratorService(memory as never);
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => generator), memory } } as unknown as CLIContext;
    const exit = vi.fn() as unknown as (code: number) => Promise<never>;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const args = ['generate', source, '--behavior-examples', fixtures, '--framework', 'node-test'];
    try {
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync([...args, '--no-save'], { from: 'user' });
      expect(readdirSync(directory).sort()).toEqual(['add.js', 'examples.json']);
      const noSaveOutput = log.mock.calls.flat().join(' ');
      expect(noSaveOutput).toContain('not written, --no-save');
      expect(noSaveOutput).toContain('no generated test files were written');
      // The generated code is the only output, so it must reach stdout
      // (compared verbatim against the JSON run below).
      expect(noSaveOutput).toContain("import assert from 'node:assert/strict'");
      expect(noSaveOutput).not.toContain('Test File:');

      // An explicit --output is a separate request and is still honored.
      const report = join(directory, 'report.json');
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync(
        [...args, '--no-save', '--format', 'json', '--output', report], { from: 'user' });
      expect(readdirSync(directory).sort()).toEqual(['add.js', 'examples.json', 'report.json']);
      const { readFileSync } = await import('node:fs');
      const generatedCode: string = JSON.parse(readFileSync(report, 'utf8')).tests[0].testCode;
      expect(generatedCode.length).toBeGreaterThan(0);
      expect(noSaveOutput).toContain(generatedCode);
      rmSync(report);

      log.mockClear();
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync(args, { from: 'user' });
      expect(readdirSync(directory).length).toBeGreaterThan(2);
      expect(log.mock.calls.flat().join(' ')).toContain('Written to:');
      expect(exit).not.toHaveBeenCalledWith(1);
    } finally {
      log.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});


describe('#936 saving generated files beyond the display limit', () => {
  it('writes every real generated test while limiting the text preview', async () => {
    vi.restoreAllMocks();
    const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'aqe-cli-936-'));
    for (let index = 0; index < 12; index++) {
      writeFileSync(join(directory, `module${index}.js`), `export function value${index}() { return ${index}; }`);
    }
    const memory = { set: vi.fn(), search: vi.fn(async () => []), vectorSearch: vi.fn(async () => []), get: vi.fn() };
    const { createServer } = await import('node:http');
    const { ProviderManager } = await import('../../../src/shared/llm/provider-manager.js');
    const { HybridRouter } = await import('../../../src/shared/llm/router/hybrid-router.js');
    const { createTestGeneratorServiceWithDependencies } = await import('../../../src/domains/test-generation/services/test-generator.js');
    let chats = 0;
    const server = createServer(async (request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/tags') {
        response.end(JSON.stringify({ models: [{ name: 'fixture-model' }] }));
        return;
      }
      let body = '';
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      const prompt = JSON.stringify(payload.messages ?? payload.prompt);
      const match = prompt.match(/module(\d+)\.js/);
      if (!match) { response.statusCode = 400; response.end('{}'); return; }
      chats++;
      const index = match[1];
      const content = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { value${index} } from ${JSON.stringify(join(directory, `module${index}.js`))};\ntest('value type', () => { assert.equal(typeof value${index}(), 'number'); });`;
      response.end(JSON.stringify({ model: 'fixture-model', message: { role: 'assistant', content }, done: true, prompt_eval_count: 1, eval_count: 1 }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as import('node:net').AddressInfo;
    const manager = new ProviderManager({ primary: 'ollama', fallbacks: [], providers: { ollama: { baseUrl: `http://127.0.0.1:${address.port}`, model: 'fixture-model', enableCache: false } } });
    const router = new HybridRouter(manager, { defaultProvider: 'ollama', defaultModel: 'fixture-model', fallbackChain: { id: 'local-fixture', entries: [{ provider: 'ollama', models: ['fixture-model'], enabled: true, priority: 1 }], maxRetries: 0, retryDelayMs: 0, backoffMultiplier: 1, maxDelayMs: 0 }, mode: 'manual' });
    try {
      await router.initialize();
    } catch (error) {
      await manager.dispose();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    const generator = createTestGeneratorServiceWithDependencies({ memory: memory as never, llmRouter: router });
    const generateTests = vi.spyOn(generator, 'generateTests');
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => generator), memory } } as unknown as CLIContext;
    const exit = vi.fn(async (code: number) => { if (code !== 0) throw Object.assign(new Error('exit'), { exitCode: code }); }) as unknown as (code: number) => Promise<never>;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync([
        'generate', directory, '--framework', 'node-test',
      ], { from: 'user' }).catch(error => { if (error.exitCode !== 0) throw error; });
      const generated = await generateTests.mock.results[0].value;
      expect(generated.success).toBe(true);
      if (!generated.success) throw generated.error;
      expect(generated.value.tests).toHaveLength(12);
      expect(chats).toBe(12);
      expect(generated.value.tests.every(test => test.qualityGateResult?.passed)).toBe(true);
      for (const test of generated.value.tests) {
        expect(existsSync(test.testFile), test.testFile).toBe(true);
        expect(readFileSync(test.testFile, 'utf8')).toBe(test.testCode);
      }
      expect(log.mock.calls.flat().join(' ')).toContain('and 2 more');
      expect(log.mock.calls.flat().filter(value => typeof value === 'string' && value.includes('Written to:'))).toHaveLength(10);
      for (const test of generated.value.tests) rmSync(test.testFile);
      log.mockClear();
      await createTestCommand(context, exit, vi.fn(async () => true)).parseAsync([
        'generate', directory, '--framework', 'node-test', '--no-save',
      ], { from: 'user' });
      for (const test of generated.value.tests) {
        expect(existsSync(test.testFile)).toBe(false);
        expect(log.mock.calls.flat().join(' ')).toContain(test.testCode);
      }
      expect(log.mock.calls.flat().join(' ')).not.toContain('and 2 more');
      expect(exit).not.toHaveBeenCalledWith(1);
    } finally {
      log.mockRestore();
      await manager.dispose();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
