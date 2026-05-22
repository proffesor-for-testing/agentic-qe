/**
 * Phase 4 behavioral integration tests for ADR-043 ↔ ADR-051.
 *
 * The structural wiring tests in llm-router-wiring.test.ts prove
 * `service.llmRouter === kernel.llmRouter`. The audit (qe-devils-advocate,
 * 2026-05-21) pointed out that structural identity is not the same as
 * `isLLMAnalysisAvailable()` returning true — services may have
 * additional gates (e.g. `enableLLMAnalysis: false`) that bypass the
 * LLM path even when the router is wired.
 *
 * This file closes that audit gap by:
 *   1. Asserting `isLLMAnalysisAvailable() === true` for every wired
 *      service (the exact gate the audit was worried about)
 *   2. Running TWO end-to-end behavioral tests through real service
 *      methods that demonstrate the LLM round-trip end-to-end
 *
 * Per-method behavioral tests for the other 11 services would require
 * synthesizing valid domain data for each (CoverageGap, ChaosExperiment,
 * ApiContract, etc.) — a brittle test surface that adds little marginal
 * value beyond the structural + gate assertions here. The two
 * end-to-end tests cover the entire wiring chain through the simplest
 * representative services.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { QEKernelImpl } from '../../src/kernel/kernel';
import { resetUnifiedMemory } from '../../src/kernel/unified-memory';
import { resetSharedLLMRouter } from '../../src/mcp/tools/base';
import { ProviderManager } from '../../src/shared/llm/provider-manager';
import { createMockLLMProvider } from '../mocks';
import type { DomainName } from '../../src/shared/types';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-llm-behav-'));
});

afterEach(async () => {
  resetUnifiedMemory();
  resetSharedLLMRouter();
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

async function bootKernelWithMock(content: string = 'mock LLM response'): Promise<{
  kernel: QEKernelImpl;
  stats: ReturnType<typeof createMockLLMProvider>['stats'];
}> {
  const { provider, stats } = createMockLLMProvider({ type: 'claude', content });
  const pm = new ProviderManager({
    primary: 'claude',
    fallbacks: [],
    providers: { claude: { model: 'mock-model' } as any },
  });
  (pm as any).providers.set('claude', provider);
  (pm as any).initialized = true;
  (pm as any).initializeMetrics('claude');

  const kernel = new QEKernelImpl({
    memoryBackend: 'memory',
    enableExperienceBridge: false,
    enableDreamScheduler: false,
    dataDir: tmpRoot,
    enabledDomains: [
      'test-execution', 'test-generation', 'coverage-analysis',
      'quality-assessment', 'security-compliance', 'contract-testing',
      'chaos-resilience', 'requirements-validation', 'code-intelligence',
      'defect-intelligence', 'learning-optimization', 'visual-accessibility',
    ] as DomainName[],
    llmRouter: { enabled: true, providerManager: pm },
  });
  await kernel.initialize();
  return { kernel, stats };
}

async function getService(kernel: QEKernelImpl, domain: DomainName, servicePath: string): Promise<any> {
  const loaded = await kernel.ensureDomainLoaded?.(domain);
  expect(loaded).toBe(true);
  const plugin: any = (kernel.plugins as any).getPlugin(domain);
  return plugin.coordinator[servicePath];
}

describe('isLLMAnalysisAvailable() gate is satisfied for every wired service (ADR-051)', () => {
  /**
   * The audit's concern: structural wiring proves `svc.llmRouter ===
   * kernel.llmRouter`, but the service may still skip the LLM path
   * because of a config gate. This block proves the gate also passes.
   *
   * Most services have `isLLMAnalysisAvailable()` as a private method;
   * we access via `as any`. Some expose it publicly. Both call
   * `this.config.enableLLMAnalysis === true && this.llmRouter !== undefined`.
   */
  const cases: Array<{ domain: DomainName; service: string; gateMethod: string }> = [
    { domain: 'test-execution', service: 'executor', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'coverage-analysis', service: 'coverageAnalyzer', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'coverage-analysis', service: 'gapDetector', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'quality-assessment', service: 'qualityAnalyzer', gateMethod: 'isLLMInsightsAvailable' },
    { domain: 'quality-assessment', service: 'deploymentAdvisor', gateMethod: 'isLLMAdviceAvailable' },
    { domain: 'contract-testing', service: 'contractValidator', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'chaos-resilience', service: 'chaosEngineer', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'requirements-validation', service: 'validator', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'code-intelligence', service: 'knowledgeGraph', gateMethod: 'isLLMExtractionAvailable' },
    { domain: 'defect-intelligence', service: 'predictor', gateMethod: 'isLLMPredictionAvailable' },
    { domain: 'defect-intelligence', service: 'rootCauseAnalyzer', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'learning-optimization', service: 'learningService', gateMethod: 'isLLMSynthesisAvailable' },
    { domain: 'visual-accessibility', service: 'visualTester', gateMethod: 'isLLMAnalysisAvailable' },
    { domain: 'test-generation', service: 'testGenerator', gateMethod: 'isLLMEnhancementAvailable' },
  ];

  for (const c of cases) {
    it(`${c.domain} :: ${c.service}.${c.gateMethod}() returns true after kernel boot`, async () => {
      const { kernel } = await bootKernelWithMock();
      try {
        const svc = await getService(kernel, c.domain, c.service);
        expect(svc).toBeDefined();

        // Access the gate method via reflection — most are private. If
        // the method doesn't exist on a service, that's a test bug
        // (wrong method name), surfacing immediately.
        const gate = (svc as any)[c.gateMethod];
        expect(
          typeof gate,
          `expected ${c.service} to have ${c.gateMethod}() method`
        ).toBe('function');

        const available = gate.call(svc);
        expect(
          available,
          `${c.service}.${c.gateMethod}() should be true: llmRouter wired AND enableLLMAnalysis defaults to true`
        ).toBe(true);
      } finally {
        await kernel.dispose();
      }
    });
  }
});

describe('End-to-end behavioral round-trip (mock provider receives the chat call)', () => {
  it('TestExecutor.analyzeFailuresWithLLM invokes the mock provider', async () => {
    const { kernel, stats } = await bootKernelWithMock('LLM analysis: pattern X');
    try {
      const executor: any = await getService(kernel, 'test-execution', 'executor');
      const result = await executor.analyzeFailuresWithLLM([
        { testName: 'sample', error: 'boom' },
      ]);
      expect(stats.generateCalls).toBeGreaterThan(0);
      expect(String(result)).toContain('LLM analysis: pattern X');
    } finally {
      await kernel.dispose();
    }
  });

  it('LearningCoordinator.synthesizePatternsWithLLM invokes the mock provider', async () => {
    // Pick a second domain with a simple input shape to cover a second
    // end-to-end path. The synthesizePatternsWithLLM method takes
    // any[] of patterns and stringifies them — robust to data shape.
    const { kernel, stats } = await bootKernelWithMock('synthesized pattern');
    try {
      const svc: any = await getService(kernel, 'learning-optimization', 'learningService');
      const patterns = [
        { id: 'p1', domain: 'test', pattern: 'retry-on-flaky', confidence: 0.9 },
        { id: 'p2', domain: 'test', pattern: 'isolate-fixtures', confidence: 0.8 },
      ];
      const result = await svc.synthesizePatternsWithLLM(patterns);
      expect(stats.generateCalls).toBeGreaterThan(0);
      expect(String(result)).toContain('synthesized pattern');
    } finally {
      await kernel.dispose();
    }
  });
});
