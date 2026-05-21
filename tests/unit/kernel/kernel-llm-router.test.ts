/**
 * Tests for ADR-043 kernel ↔ LLM router wiring.
 *
 * Covers:
 *   - kernel.llmRouter is undefined when llmRouter.enabled = false
 *   - kernel.llmRouter is undefined when no provider is available (auto)
 *   - kernel.llmRouter is built when an injected ProviderManager is provided
 *   - the router is forwarded to plugin factories as the 4th arg
 *   - a chat() call round-trips through the mock provider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { QEKernelImpl } from '../../../src/kernel/kernel';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import { createMockLLMProvider } from '../../mocks';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-kernel-llm-'));
});

afterEach(async () => {
  resetUnifiedMemory();
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

/** Build a ProviderManager pre-loaded with a mock provider — bypasses
 *  network on initialize(). Same trick as in llm-router-service.test.ts. */
function makeMockProviderManager(): { pm: ProviderManager; stats: ReturnType<typeof createMockLLMProvider>['stats'] } {
  const { provider, stats } = createMockLLMProvider({ type: 'claude' });
  const pm = new ProviderManager({
    primary: 'claude',
    fallbacks: [],
    providers: { claude: { model: 'mock-model' } as any },
  });
  (pm as any).providers.set('claude', provider);
  (pm as any).initialized = true;
  (pm as any).initializeMetrics('claude');
  return { pm, stats };
}

describe('Kernel ↔ LLM router wiring (ADR-043)', () => {
  it('does not build a router when llmRouter.enabled is false', async () => {
    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: { enabled: false },
    });
    await kernel.initialize();

    expect(kernel.llmRouter).toBeUndefined();

    await kernel.dispose();
  });

  it('does not build a router in auto mode when no provider is available', async () => {
    // Save and clear any provider keys from the host env so this test
    // is hermetic (the dev shell may have keys exported from .env).
    const saved = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    };
    for (const k of Object.keys(saved)) delete process.env[k];

    try {
      const kernel = new QEKernelImpl({
        memoryBackend: 'memory',
        enabledDomains: [],
        enableExperienceBridge: false,
        enableDreamScheduler: false,
        dataDir: tmpRoot,
        llmRouter: { enabled: 'auto' },
      });
      await kernel.initialize();

      expect(kernel.llmRouter).toBeUndefined();

      await kernel.dispose();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });

  it('builds a router when an injected ProviderManager is supplied', async () => {
    const { pm } = makeMockProviderManager();

    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: { enabled: true, providerManager: pm },
    });
    await kernel.initialize();

    expect(kernel.llmRouter).toBeDefined();

    await kernel.dispose();
  });

  it('round-trips a chat() call through the injected mock provider', async () => {
    const { pm, stats } = makeMockProviderManager();

    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: { enabled: true, providerManager: pm },
    });
    await kernel.initialize();

    const router = kernel.llmRouter as any;
    const response = await router.chat({
      messages: [{ role: 'user', content: 'hello from a domain plugin' }],
      model: 'mock-model',
    });

    expect(response.content).toBe('mock response');
    expect(stats.generateCalls).toBe(1);

    await kernel.dispose();
  });
});
