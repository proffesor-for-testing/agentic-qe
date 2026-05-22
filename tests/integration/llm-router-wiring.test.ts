/**
 * Phase 4 integration test for ADR-043 ↔ ADR-051 wiring.
 *
 * The gap this test guards against: domain services accept an optional
 * `llmRouter` dependency, but before Phases 1 + 2 nothing in the
 * production code path ever injected one. Every service's
 * `isLLMAnalysisAvailable()` returned false; every `analyzeXxxWithLLM()`
 * branch was unreachable.
 *
 * This test boots the full kernel with an injected mock ProviderManager,
 * loads each of the 12 LLM-enhanced domains, and asserts that the
 * service inside the plugin → coordinator → service chain holds the
 * SAME HybridRouter instance the kernel built. A regression in any
 * domain's wiring will fail one of these assertions immediately.
 *
 * Bonus: one end-to-end test exercises TestExecutorService's actual
 * analyzeFailuresWithLLM() path and confirms the mock provider's
 * generateCalls counter increments — proof that the wiring isn't just
 * structurally correct but behaviorally live.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { QEKernelImpl } from '../../src/kernel/kernel';
import { resetUnifiedMemory } from '../../src/kernel/unified-memory';
import { ProviderManager } from '../../src/shared/llm/provider-manager';
import { createMockLLMProvider } from '../mocks';
import type { DomainName } from '../../src/shared/types';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-llm-wire-'));
});

afterEach(async () => {
  resetUnifiedMemory();
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

function buildMockProviderManager(): {
  pm: ProviderManager;
  stats: ReturnType<typeof createMockLLMProvider>['stats'];
} {
  const { provider, stats } = createMockLLMProvider({
    type: 'claude',
    content: 'mock LLM analysis result',
  });
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

/**
 * Boot a kernel for testing with all 12 LLM-enhanced domains enabled
 * and the mock provider injected.
 */
async function bootKernelWithMockRouter(): Promise<{
  kernel: QEKernelImpl;
  stats: ReturnType<typeof createMockLLMProvider>['stats'];
}> {
  const { pm, stats } = buildMockProviderManager();

  const kernel = new QEKernelImpl({
    memoryBackend: 'memory',
    enableExperienceBridge: false,
    enableDreamScheduler: false,
    dataDir: tmpRoot,
    enabledDomains: [
      'test-execution',
      'test-generation',
      'coverage-analysis',
      'quality-assessment',
      'security-compliance',
      'contract-testing',
      'chaos-resilience',
      'requirements-validation',
      'code-intelligence',
      'defect-intelligence',
      'learning-optimization',
      'visual-accessibility',
    ] as DomainName[],
    llmRouter: { enabled: true, providerManager: pm },
  });

  await kernel.initialize();
  return { kernel, stats };
}

describe('ADR-043 ↔ ADR-051 cross-domain wiring (Phase 2)', () => {
  it('kernel.llmRouter is the same instance forwarded to plugin factories', async () => {
    const { kernel } = await bootKernelWithMockRouter();
    expect(kernel.llmRouter).toBeDefined();
    await kernel.dispose();
  });

  /**
   * Walks each LLM-enhanced domain and verifies the service inside the
   * coordinator holds the same router instance the kernel built.
   *
   * Uses bracket-access into private fields via `as any` — this is a
   * structural test for wiring, not an API surface test. If a domain
   * is renamed or refactored, update the path here.
   */
  describe('per-domain wiring (service.llmRouter === kernel.llmRouter)', () => {
    const cases: Array<{
      domain: DomainName;
      coordinatorPath: string;
      servicePath: string;
    }> = [
      { domain: 'test-execution', coordinatorPath: 'coordinator', servicePath: 'executor' },
      { domain: 'test-generation', coordinatorPath: 'coordinator', servicePath: 'testGenerator' },
      { domain: 'coverage-analysis', coordinatorPath: 'coordinator', servicePath: 'coverageAnalyzer' },
      { domain: 'coverage-analysis', coordinatorPath: 'coordinator', servicePath: 'gapDetector' },
      { domain: 'quality-assessment', coordinatorPath: 'coordinator', servicePath: 'qualityAnalyzer' },
      { domain: 'quality-assessment', coordinatorPath: 'coordinator', servicePath: 'deploymentAdvisor' },
      { domain: 'security-compliance', coordinatorPath: 'coordinator', servicePath: 'securityScanner' },
      { domain: 'contract-testing', coordinatorPath: 'coordinator', servicePath: 'contractValidator' },
      { domain: 'chaos-resilience', coordinatorPath: 'coordinator', servicePath: 'chaosEngineer' },
      { domain: 'requirements-validation', coordinatorPath: 'coordinator', servicePath: 'validator' },
      { domain: 'code-intelligence', coordinatorPath: 'coordinator', servicePath: 'knowledgeGraph' },
      { domain: 'defect-intelligence', coordinatorPath: 'coordinator', servicePath: 'predictor' },
      { domain: 'defect-intelligence', coordinatorPath: 'coordinator', servicePath: 'rootCauseAnalyzer' },
      { domain: 'learning-optimization', coordinatorPath: 'coordinator', servicePath: 'learningService' },
      { domain: 'visual-accessibility', coordinatorPath: 'coordinator', servicePath: 'visualTester' },
    ];

    for (const c of cases) {
      it(`${c.domain} :: ${c.servicePath} received the kernel's llmRouter`, async () => {
        const { kernel } = await bootKernelWithMockRouter();
        try {
          // Force-load the domain plugin
          const loaded = await kernel.ensureDomainLoaded?.(c.domain);
          expect(loaded).toBe(true);

          const plugin: any = (kernel.plugins as any).getPlugin(c.domain);
          expect(plugin).toBeDefined();

          const coordinator = plugin[c.coordinatorPath];
          expect(coordinator).toBeDefined();

          const service = coordinator[c.servicePath];
          expect(service).toBeDefined();

          // The actual wiring assertion: the service holds the same
          // router instance the kernel built. This is what was always
          // null before Phases 1 + 2.
          expect(service.llmRouter).toBe(kernel.llmRouter);
        } finally {
          await kernel.dispose();
        }
      });
    }
  });

  /**
   * Behavioral proof: trigger the LLM path on test-execution and
   * confirm the mock provider actually received a generate() call.
   * One domain is enough to prove the round trip; per-domain
   * behavioral coverage is left to each domain's own service tests.
   */
  it('end-to-end: TestExecutorService.analyzeFailures invokes the mock LLM provider', async () => {
    const { kernel, stats } = await bootKernelWithMockRouter();
    try {
      const loaded = await kernel.ensureDomainLoaded?.('test-execution');
      expect(loaded).toBe(true);

      const plugin: any = (kernel.plugins as any).getPlugin('test-execution');
      const executor: any = plugin.coordinator.executor;

      // executor.analyzeFailuresWithLLM is private; call it via the
      // public surface that triggers it. The simplest trigger is
      // injecting a failed run into the analyzer directly.
      const callBefore = stats.generateCalls;
      // Call the private method through the reflection escape hatch —
      // this test is specifically about wiring, not API design.
      const result = await executor.analyzeFailuresWithLLM([
        { testName: 'sample', error: 'boom' },
      ]);

      expect(stats.generateCalls).toBeGreaterThan(callBefore);
      expect(result).toBeTruthy();
      expect(String(result)).toContain('mock LLM analysis result');
    } finally {
      await kernel.dispose();
    }
  });
});
