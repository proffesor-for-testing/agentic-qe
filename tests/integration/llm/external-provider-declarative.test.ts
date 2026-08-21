/**
 * Integration tests for the declarative half of ADR-127 / issue #628.
 *
 * This is the surface that actually unblocks the requester. agentic-kit drives
 * AQE as spawned subprocesses (the `aqe` CLI bundle and the MCP server bundle
 * are separate esbuild artifacts), so an in-process `registerProvider()` call
 * cannot reach them — but both call `loadRouterConfig()`, so a declaration in
 * `.agentic-qe/llm-config.json` does.
 *
 * These tests use a REAL host script on disk and REAL subprocess execution.
 * Mocking the spawn would test the mock, not the contract a downstream host
 * has to satisfy.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  resetProviderRegistry,
  listRegisteredProviders,
  registerProvider,
} from '../../../src/shared/llm/provider-registry';
import { loadRouterConfig } from '../../../src/shared/llm/router/config-store';
import { registerExternalProviders } from '../../../src/shared/llm/router/external-provider-config';
import { ExternalCliProvider, resolvesOnPath } from '../../../src/shared/llm/providers/external-cli';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import { HybridRouter } from '../../../src/shared/llm/router/hybrid-router';

const HOST = 'my-host';

let projectRoot: string;
let hostScript: string;

/**
 * A stand-in for a downstream host CLI: reads the prompt on stdin, echoes a
 * marker plus its argv and a chosen env var, so tests can assert what AQE
 * actually passed it.
 */
function writeHostScript(dir: string, body?: string): string {
  const script = path.join(dir, 'my-host');
  fs.writeFileSync(
    script,
    body ??
      `#!/usr/bin/env node
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({
    marker: 'served-by-my-host',
    prompt: input,
    argv: process.argv.slice(2),
    sawSecret: process.env.SECRET_API_KEY ?? null,
  }));
});
`,
    { mode: 0o755 }
  );
  return script;
}

function writeConfig(root: string, config: unknown): void {
  const dir = path.join(root, '.agentic-qe');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'llm-config.json'), JSON.stringify(config, null, 2));
}

/** Env with built-in provider keys stripped so only the declared host exists. */
function isolatedEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, ...extra };
}

describe('ADR-127 declarative external providers (integration)', () => {
  beforeEach(() => {
    resetProviderRegistry();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-adr127-'));
    hostScript = writeHostScript(projectRoot);
  });

  afterEach(() => {
    resetProviderRegistry();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('declaration on disk becomes a live provider', () => {
    it('registers a declared host and enables it', () => {
      writeConfig(projectRoot, {
        externalProviders: {
          [HOST]: {
            kind: 'cli',
            command: [hostScript],
            billingMode: 'subscription',
            models: ['default'],
            displayName: 'My Host (subscription)',
          },
        },
      });

      const config = loadRouterConfig({ projectRoot, env: isolatedEnv() });

      expect(listRegisteredProviders().map((r) => r.type)).toContain(HOST);
      // Declaring a host is enabling it — otherwise it would be selectable in
      // principle but dropped by pickEnabledProviders.
      expect(config.providers?.[HOST]?.enabled).toBe(true);
    });

    it('lets AQE_LLM_PROVIDER select a declared host', () => {
      writeConfig(projectRoot, {
        externalProviders: {
          [HOST]: { kind: 'cli', command: [hostScript], billingMode: 'subscription' },
        },
      });

      const config = loadRouterConfig({
        projectRoot,
        env: isolatedEnv({ AQE_LLM_PROVIDER: HOST }),
      });

      expect(config.defaultProvider).toBe(HOST);
    });

    it('honors an explicit `enabled: false` under providers', () => {
      // ADR-123 precedence: an explicit off is never resurrected.
      writeConfig(projectRoot, {
        externalProviders: {
          [HOST]: { kind: 'cli', command: [hostScript] },
        },
        providers: { [HOST]: { enabled: false } },
      });

      const config = loadRouterConfig({ projectRoot, env: isolatedEnv() });
      expect(config.providers?.[HOST]?.enabled).toBe(false);
    });

    it('leaves an in-process registration alone across a config reload', () => {
      // Reaping is keyed off what this module actually registered, not off the
      // caller-supplied `source` field — otherwise an embedder that labelled
      // its registration 'config' would have it silently reaped.
      registerProvider('embedder-host', () => ({}) as never, { source: 'config' });
      writeConfig(projectRoot, { externalProviders: {} });

      loadRouterConfig({ projectRoot, env: isolatedEnv() });

      expect(listRegisteredProviders().map((r) => r.type)).toContain('embedder-host');
    });

    it('drops a declaration that is removed from the file on reload', () => {
      writeConfig(projectRoot, {
        externalProviders: { [HOST]: { kind: 'cli', command: [hostScript] } },
      });
      loadRouterConfig({ projectRoot, env: isolatedEnv() });
      expect(listRegisteredProviders().map((r) => r.type)).toContain(HOST);

      writeConfig(projectRoot, { externalProviders: {} });
      loadRouterConfig({ projectRoot, env: isolatedEnv() });
      expect(listRegisteredProviders().map((r) => r.type)).not.toContain(HOST);
    });
  });

  describe('malformed declarations drop individually, never fatally', () => {
    it('keeps the good entry and drops the bad one', () => {
      const result = registerExternalProviders({
        'good-host': { kind: 'cli', command: [hostScript] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'bad-host': { kind: 'cli', command: [] } as any,
      });

      expect(result.registered).toEqual(['good-host']);
      expect(result.warnings.join('\n')).toMatch(/command must be a non-empty string array/);
    });

    it.each([
      [{ kind: 'http', command: ['x'] }, /kind must be "cli"/],
      [{ kind: 'cli' }, /command must be a non-empty string array/],
      [{ kind: 'cli', command: ['x'], billingMode: 'free' }, /is not a valid billing mode/],
      [{ kind: 'cli', command: ['x'], timeoutMs: -1 }, /timeoutMs must be a positive number/],
      [{ kind: 'cli', command: ['x'], maxConcurrency: 0 }, /maxConcurrency must be >= 1/],
      [{ kind: 'cli', command: ['x'], stripEnv: 'nope' }, /stripEnv must be a string array/],
    ])('rejects %j', (declaration, expected) => {
      const result = registerExternalProviders({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'bad-host': declaration as any,
      });
      expect(result.registered).toEqual([]);
      expect(result.warnings.join('\n')).toMatch(expected);
    });

    it('refuses a declaration carrying an apiKey', () => {
      // Same never-persist-keys discipline saveRouterConfigFile enforces.
      const result = registerExternalProviders({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'bad-host': { kind: 'cli', command: ['x'], apiKey: 'sk-leaked' } as any,
      });
      expect(result.registered).toEqual([]);
      expect(result.warnings.join('\n')).toMatch(/must not contain an apiKey/);
    });

    it('refuses a declaration that would shadow a built-in', () => {
      const result = registerExternalProviders({
        claude: { kind: 'cli', command: [hostScript] },
      });
      expect(result.registered).toEqual([]);
      expect(result.warnings.join('\n')).toMatch(/built in and cannot be overridden/);
    });
  });

  describe('ExternalCliProvider really drives the host process', () => {
    it('spawns the host, feeds it the prompt, and returns its stdout', async () => {
      const provider = new ExternalCliProvider(HOST, {
        kind: 'cli',
        command: [hostScript],
        billingMode: 'subscription',
      });

      const response = await provider.generate([{ role: 'user', content: 'generate a test' }], {
        systemPrompt: 'You are a QE assistant.',
      });

      const payload = JSON.parse(response.content);
      expect(payload.marker).toBe('served-by-my-host');
      expect(payload.prompt).toContain('generate a test');
      // System content is hoisted into a preamble — a generic CLI has no role
      // protocol, matching message-formatter's 'first-message' fallback.
      expect(payload.prompt).toContain('You are a QE assistant.');
      expect(response.provider).toBe(HOST);
    });

    it('passes the model through the declared flag', async () => {
      const provider = new ExternalCliProvider(HOST, {
        kind: 'cli',
        command: [hostScript, 'exec'],
        modelFlag: '--model',
        models: ['default', 'fast'],
      });

      const response = await provider.generate('hi', { model: 'fast' });
      const payload = JSON.parse(response.content);

      expect(payload.argv).toEqual(['exec', '--model', 'fast']);
    });

    it('omits the model flag for the sentinel default model', async () => {
      const provider = new ExternalCliProvider(HOST, {
        kind: 'cli',
        command: [hostScript, 'exec'],
        modelFlag: '--model',
      });

      const payload = JSON.parse((await provider.generate('hi')).content);
      expect(payload.argv).toEqual(['exec']);
    });

    it('strips declared env vars from the child process', async () => {
      // LOAD-BEARING: a host claiming subscription billing must be able to
      // guarantee an API key is not present to flip it back to metered.
      const provider = new ExternalCliProvider(HOST, {
        kind: 'cli',
        command: [hostScript],
        stripEnv: ['SECRET_API_KEY'],
      });

      process.env.SECRET_API_KEY = 'sk-should-not-reach-the-child';
      try {
        const payload = JSON.parse((await provider.generate('hi')).content);
        expect(payload.sawSecret).toBeNull();
      } finally {
        delete process.env.SECRET_API_KEY;
      }
    });

    it('passes env through when nothing is declared stripped', async () => {
      const provider = new ExternalCliProvider(HOST, { kind: 'cli', command: [hostScript] });

      process.env.SECRET_API_KEY = 'sk-visible';
      try {
        const payload = JSON.parse((await provider.generate('hi')).content);
        expect(payload.sawSecret).toBe('sk-visible');
      } finally {
        delete process.env.SECRET_API_KEY;
      }
    });

    it('reports cost as a local estimate, never as a receipt', async () => {
      // ADR-126: an estimate must never be reported as a measurement. AQE did
      // not observe this host's billing event and cannot verify its declared
      // mode, so the provenance must say so.
      const provider = new ExternalCliProvider(HOST, {
        kind: 'cli',
        command: [hostScript],
        billingMode: 'subscription',
      });

      const response = await provider.generate('hi');
      expect(response.cost.source).toBe('local-estimate');
    });

    it('surfaces a host failure as a provider error', async () => {
      const failing = path.join(projectRoot, 'failing-host');
      fs.writeFileSync(
        failing,
        `#!/usr/bin/env node\nprocess.stderr.write('host exploded');\nprocess.exit(3);\n`,
        { mode: 0o755 }
      );
      const provider = new ExternalCliProvider('failing-host', {
        kind: 'cli',
        command: [failing],
      });

      await expect(provider.generate('hi')).rejects.toThrow(/host exploded/);
    });

    it('classifies a rate-limit message as retryable', async () => {
      const limited = path.join(projectRoot, 'limited-host');
      fs.writeFileSync(
        limited,
        `#!/usr/bin/env node\nprocess.stderr.write('429 usage limit reached');\nprocess.exit(1);\n`,
        { mode: 0o755 }
      );
      const provider = new ExternalCliProvider('limited-host', {
        kind: 'cli',
        command: [limited],
      });

      await expect(provider.generate('hi')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('refuses to fabricate an embedding', async () => {
      const provider = new ExternalCliProvider(HOST, { kind: 'cli', command: [hostScript] });
      await expect(provider.embed('text')).rejects.toMatchObject({
        code: 'EMBEDDING_UNSUPPORTED',
      });
    });
  });

  describe('availability is answered without invoking the host', () => {
    it('reports available for a real executable', async () => {
      const provider = new ExternalCliProvider(HOST, { kind: 'cli', command: [hostScript] });
      expect(await provider.isAvailable()).toBe(true);
      expect((await provider.healthCheck()).healthy).toBe(true);
    });

    it('reports unavailable for a missing binary without running anything', async () => {
      const provider = new ExternalCliProvider(HOST, {
        kind: 'cli',
        command: [path.join(projectRoot, 'does-not-exist')],
      });

      expect(await provider.isAvailable()).toBe(false);
      const health = await provider.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.error).toMatch(/could not run/);
    });

    it('resolves a bare binary name across PATH', () => {
      expect(resolvesOnPath('my-host', { PATH: projectRoot })).toBe(true);
      expect(resolvesOnPath('my-host', { PATH: '/nonexistent' })).toBe(false);
      // A declaration is portable: valid on a machine where the host is not
      // installed yet, just unavailable.
      expect(resolvesOnPath('definitely-not-a-real-binary-xyz')).toBe(false);
    });
  });

  describe('end-to-end: declaration on disk to a routed answer', () => {
    it('routes a chat request through the declared host', async () => {
      writeConfig(projectRoot, {
        externalProviders: {
          [HOST]: {
            kind: 'cli',
            command: [hostScript],
            billingMode: 'subscription',
            models: ['default'],
          },
        },
      });

      const config = loadRouterConfig({
        projectRoot,
        env: isolatedEnv({ AQE_LLM_PROVIDER: HOST }),
      });

      const manager = new ProviderManager({ primary: config.defaultProvider, fallbacks: [] });
      const router = new HybridRouter(manager, { ...config, mode: 'manual' });
      await router.initialize();

      const response = await router.chat({
        messages: [{ role: 'user', content: 'generate a test for UserService' }],
      });

      const payload = JSON.parse(response.content);
      expect(payload.marker).toBe('served-by-my-host');
      expect(payload.prompt).toContain('generate a test for UserService');
    });
  });
});
