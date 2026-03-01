/**
 * Agentic QE v3 - Sampling Server Tests
 * Tests for server-initiated LLM sampling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SamplingServer,
  createSamplingServer,
  QEDecisionPrompts,
} from '../../../../src/mcp/security/sampling-server';

describe('SamplingServer', () => {
  let server: SamplingServer;

  beforeEach(() => {
    server = createSamplingServer({
      maxRequestsPerMinute: 60,
      maxTokensPerMinute: 100000,
      enableCaching: true,
      cacheTTL: 5000,
    });
  });

  afterEach(() => {
    server.dispose();
  });

  describe('request creation', () => {
    it('should create a sampling request', () => {
      const request = server.createRequest({
        systemPrompt: 'You are a helpful assistant',
        messages: [
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(request.requestId).toBeDefined();
      expect(request.requestId).toMatch(/^sr-/);
      expect(request.messages).toHaveLength(1);
    });

    it('should include optional parameters', () => {
      const request = server.createRequest({
        systemPrompt: 'System prompt',
        messages: [{ role: 'user', content: 'Test' }],
        model: 'claude-3-opus',
        maxTokens: 2000,
        temperature: 0.5,
      });

      expect(request.model).toBe('claude-3-opus');
      expect(request.maxTokens).toBe(2000);
      expect(request.temperature).toBe(0.5);
    });
  });

  describe('sampling', () => {
    it('should process sampling request', async () => {
      const request = server.createRequest({
        systemPrompt: 'You are a helpful assistant',
        messages: [
          { role: 'user', content: 'What is 2+2?' },
        ],
      });

      const response = await server.sample(request);

      expect(response.requestId).toBe(request.requestId);
      expect(response.content).toBeDefined();
      expect(response.stopReason).toBe('end_turn');
      expect(response.usage).toBeDefined();
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
    });

    it('should fill in default parameters', async () => {
      const request = server.createRequest({
        messages: [{ role: 'user', content: 'Test' }],
      });

      const response = await server.sample(request);

      expect(response.model).toBeDefined();
      expect(response.model).toContain('claude');
    });

    it('should handle rich content', async () => {
      const request = server.createRequest({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this code:' },
              { type: 'code', code: { language: 'typescript', content: 'const x = 1;' } },
            ],
          },
        ],
      });

      const response = await server.sample(request);
      expect(response.content).toBeDefined();
    });
  });

  describe('caching', () => {
    it('should cache identical requests', async () => {
      const request1 = server.createRequest({
        messages: [{ role: 'user', content: 'Cached test' }],
      });

      // First request - not cached
      const response1 = await server.sample(request1);
      expect(response1.cached).toBe(false);

      // Second request with same content - should be cached
      const request2 = server.createRequest({
        messages: [{ role: 'user', content: 'Cached test' }],
      });

      const response2 = await server.sample(request2);
      expect(response2.cached).toBe(true);
    });

    it('should clear cache', async () => {
      const request = server.createRequest({
        messages: [{ role: 'user', content: 'Clear cache test' }],
      });

      await server.sample(request);
      server.clearCache();

      const request2 = server.createRequest({
        messages: [{ role: 'user', content: 'Clear cache test' }],
      });

      const response = await server.sample(request2);
      expect(response.cached).toBe(false);
    });

    it('should expire cached items', async () => {
      vi.useFakeTimers();

      const request = server.createRequest({
        messages: [{ role: 'user', content: 'Expire test' }],
      });

      await server.sample(request);

      // Advance time past TTL
      vi.advanceTimersByTime(6000);

      const request2 = server.createRequest({
        messages: [{ role: 'user', content: 'Expire test' }],
      });

      const response = await server.sample(request2);
      expect(response.cached).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('quota management', () => {
    it('should track request quota', async () => {
      const stats = server.getStats();
      expect(stats.remainingRequests).toBe(60);
    });

    it('should enforce request quota', async () => {
      // Create server with very low quota
      const limitedServer = createSamplingServer({
        maxRequestsPerMinute: 2,
        enableCaching: false, // Disable caching to test quota
      });

      // Make requests
      await limitedServer.sample(
        limitedServer.createRequest({ messages: [{ role: 'user', content: 'Request 1' }] })
      );
      await limitedServer.sample(
        limitedServer.createRequest({ messages: [{ role: 'user', content: 'Request 2' }] })
      );

      // Third request should fail
      await expect(
        limitedServer.sample(
          limitedServer.createRequest({ messages: [{ role: 'user', content: 'Request 3' }] })
        )
      ).rejects.toThrow(/Rate limit exceeded/);

      limitedServer.dispose();
    });

    it('should reset quota after window', async () => {
      vi.useFakeTimers();

      const limitedServer = createSamplingServer({
        maxRequestsPerMinute: 2,
        enableCaching: false,
      });

      // Exhaust quota
      await limitedServer.sample(
        limitedServer.createRequest({ messages: [{ role: 'user', content: 'R1' }] })
      );
      await limitedServer.sample(
        limitedServer.createRequest({ messages: [{ role: 'user', content: 'R2' }] })
      );

      // Advance time past 1 minute window
      vi.advanceTimersByTime(61000);

      // Should work now
      const response = await limitedServer.sample(
        limitedServer.createRequest({ messages: [{ role: 'user', content: 'R3' }] })
      );
      expect(response.content).toBeDefined();

      limitedServer.dispose();
      vi.useRealTimers();
    });
  });

  describe('custom handlers', () => {
    it('should register custom handler', async () => {
      server.registerHandler('custom', async (request) => ({
        requestId: request.requestId,
        content: 'Custom response',
        stopReason: 'end_turn',
        model: 'custom-model',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        cached: false,
        latencyMs: 0,
      }));

      const request = server.createRequest({
        messages: [{ role: 'user', content: 'Test' }],
      });

      const response = await server.sample(request, 'custom');

      expect(response.content).toBe('Custom response');
      expect(response.model).toBe('custom-model');
    });

    it('should throw for unknown handler', async () => {
      const request = server.createRequest({
        messages: [{ role: 'user', content: 'Test' }],
      });

      await expect(server.sample(request, 'nonexistent')).rejects.toThrow(
        /Unknown sampling handler/
      );
    });
  });

  describe('QE decision prompts', () => {
    it('should sample test generation decision', async () => {
      const response = await server.sampleQEDecision('testGenerationDecision', {
        sourceCode: 'function add(a: number, b: number) { return a + b; }',
        coverageData: { lineCoverage: 50, branchCoverage: 40 },
      });

      expect(response.content).toBeDefined();
      expect(response.content).toContain('Test');
    });

    it('should sample quality gate decision', async () => {
      const response = await server.sampleQEDecision('qualityGateDecision', {
        metrics: { coverage: 85, passRate: 99 },
        thresholds: { coverage: 80, passRate: 95 },
        trends: [
          { metric: 'coverage', direction: 'up', change: 5 },
        ],
      });

      expect(response.content).toBeDefined();
      expect(response.content).toContain('Quality Gate');
    });

    it('should sample defect prediction decision', async () => {
      const response = await server.sampleQEDecision('defectPredictionDecision', {
        codeChanges: [
          { file: 'auth.ts', additions: 100, deletions: 20, complexity: 15 },
        ],
        historicalDefects: [
          { file: 'auth.ts', defectCount: 5, lastDefect: '2024-01-01' },
        ],
        riskFactors: ['High complexity', 'Recent changes'],
      });

      expect(response.content).toBeDefined();
      expect(response.content).toContain('Defect');
    });

    it('should sample security analysis decision', async () => {
      const response = await server.sampleQEDecision('securityAnalysisDecision', {
        findings: [
          {
            type: 'SQL Injection',
            severity: 'high',
            location: 'user-service.ts:45',
            description: 'Unsanitized user input in query',
          },
        ],
        codeContext: 'db.query(`SELECT * FROM users WHERE id = ${userId}`)',
      });

      expect(response.content).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should track request statistics', async () => {
      await server.sample(
        server.createRequest({ messages: [{ role: 'user', content: 'Test 1' }] })
      );
      await server.sample(
        server.createRequest({ messages: [{ role: 'user', content: 'Test 2' }] })
      );

      const stats = server.getStats();

      expect(stats.totalRequests).toBe(2);
      expect(stats.totalTokensUsed).toBeGreaterThan(0);
      expect(stats.averageLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should track cached requests', async () => {
      // First request
      await server.sample(
        server.createRequest({ messages: [{ role: 'user', content: 'Cache stats test' }] })
      );

      // Cached request
      await server.sample(
        server.createRequest({ messages: [{ role: 'user', content: 'Cache stats test' }] })
      );

      const stats = server.getStats();
      expect(stats.cachedRequests).toBe(1);
    });
  });

  describe('latency tracking', () => {
    it('should track latency', async () => {
      const response = await server.sample(
        server.createRequest({ messages: [{ role: 'user', content: 'Latency test' }] })
      );

      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('QEDecisionPrompts', () => {
  describe('testGenerationDecision', () => {
    it('should build proper prompt structure', () => {
      const prompt = QEDecisionPrompts.testGenerationDecision({
        sourceCode: 'function test() {}',
        existingTests: 'describe("test", () => {});',
        coverageData: { lineCoverage: 80, branchCoverage: 70 },
      });

      expect(prompt.systemPrompt).toContain('QE expert');
      expect(prompt.systemPrompt).toContain('test');
      expect(prompt.messages).toHaveLength(1);
      expect(prompt.messages[0].role).toBe('user');
    });

    it('should work without optional params', () => {
      const prompt = QEDecisionPrompts.testGenerationDecision({
        sourceCode: 'function test() {}',
      });

      expect(prompt.messages).toHaveLength(1);
    });
  });

  describe('qualityGateDecision', () => {
    it('should build proper prompt structure', () => {
      const prompt = QEDecisionPrompts.qualityGateDecision({
        metrics: { coverage: 85 },
        thresholds: { coverage: 80 },
        trends: [{ metric: 'coverage', direction: 'up', change: 5 }],
      });

      expect(prompt.systemPrompt).toContain('quality gate');
      expect(prompt.messages[0].content).toContain('Metrics');
    });
  });

  describe('defectPredictionDecision', () => {
    it('should build proper prompt structure', () => {
      const prompt = QEDecisionPrompts.defectPredictionDecision({
        codeChanges: [{ file: 'test.ts', additions: 10, deletions: 5, complexity: 3 }],
        historicalDefects: [{ file: 'test.ts', defectCount: 1, lastDefect: '2024-01-01' }],
        riskFactors: ['Complex code'],
      });

      expect(prompt.systemPrompt).toContain('defect');
      expect(prompt.messages[0].content).toContain('Code Changes');
    });
  });

  describe('securityAnalysisDecision', () => {
    it('should build proper prompt structure', () => {
      const prompt = QEDecisionPrompts.securityAnalysisDecision({
        findings: [
          { type: 'XSS', severity: 'high', location: 'file.ts:10', description: 'Unsafe innerHTML' },
        ],
        codeContext: 'element.innerHTML = userInput;',
      });

      expect(prompt.systemPrompt).toContain('security');
      expect(prompt.messages[0].content).toBeDefined();
    });
  });
});
