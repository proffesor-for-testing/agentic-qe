/**
 * End-to-End Integration Tests: ADR-042 Token Tracking
 *
 * These tests verify the REAL integration flow:
 * 1. LLM Providers -> TokenMetricsCollector (via HTTP mock)
 * 2. EarlyExitTokenOptimizer -> Pattern Store
 * 3. CLI Commands -> TokenMetricsCollector
 * 4. Persistence -> File System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenMetricsCollector } from '../../src/learning/token-tracker.js';
import { ClaudeProvider } from '../../src/shared/llm/providers/claude.js';
import { OpenAIProvider } from '../../src/shared/llm/providers/openai.js';
import { OllamaProvider } from '../../src/shared/llm/providers/ollama.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fetch at the HTTP level (not at the provider level)
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ADR-042: End-to-End Token Tracking Integration', () => {
  beforeEach(() => {
    TokenMetricsCollector.reset();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LLM Provider Integration (HTTP-level mock)', () => {
    it('should track tokens when ClaudeProvider.generate() is called', async () => {
      // Setup: Mock Claude API response at HTTP level
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello, world!' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 50,
            output_tokens: 25,
          },
        }),
      });

      // Act: Call the provider (this should trigger TokenMetricsCollector)
      const provider = new ClaudeProvider({ apiKey: 'test-key' });
      const result = await provider.generate('Hello');

      // Assert: Verify tokens were tracked
      expect(result.usage.promptTokens).toBe(50);
      expect(result.usage.completionTokens).toBe(25);
      expect(result.usage.totalTokens).toBe(75);

      // Verify TokenMetricsCollector captured the usage
      const agentMetrics = TokenMetricsCollector.getAgentMetrics('claude-provider');
      expect(agentMetrics).toBeDefined();
      expect((agentMetrics as any).totalTokens).toBe(75);
      expect((agentMetrics as any).totalInputTokens).toBe(50);
      expect((agentMetrics as any).totalOutputTokens).toBe(25);
    });

    it('should track tokens when OpenAIProvider.generate() is called', async () => {
      // Setup: Mock OpenAI API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4o',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Test response' },
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
      });

      // Act
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      const result = await provider.generate('Hello OpenAI');

      // Assert
      expect(result.usage.totalTokens).toBe(150);

      const agentMetrics = TokenMetricsCollector.getAgentMetrics('openai-provider');
      expect(agentMetrics).toBeDefined();
      expect((agentMetrics as any).totalTokens).toBe(150);
    });

    it('should track tokens when OllamaProvider.generate() is called', async () => {
      // Setup: Mock Ollama API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3.1',
          created_at: new Date().toISOString(),
          response: 'Local LLM response',
          done: true,
          prompt_eval_count: 80,
          eval_count: 40,
        }),
      });

      // Act
      const provider = new OllamaProvider();
      const result = await provider.generate('Hello Ollama');

      // Assert
      expect(result.usage.promptTokens).toBe(80);
      expect(result.usage.completionTokens).toBe(40);

      const agentMetrics = TokenMetricsCollector.getAgentMetrics('ollama-provider');
      expect(agentMetrics).toBeDefined();
      expect((agentMetrics as any).totalTokens).toBe(120);
    });

    it('should aggregate tokens from multiple providers', async () => {
      // Setup: Mock both providers
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Claude' }],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            choices: [{ message: { role: 'assistant', content: 'GPT' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
          }),
        });

      // Act
      const claude = new ClaudeProvider({ apiKey: 'test' });
      const openai = new OpenAIProvider({ apiKey: 'test' });

      await claude.generate('Test Claude');
      await openai.generate('Test OpenAI');

      // Assert: Session summary should include both
      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.totalUsage.totalTokens).toBe(450); // 150 + 300
      expect(summary.byAgent.size).toBe(2);
      expect(summary.byAgent.get('claude-provider')?.totalTokens).toBe(150);
      expect(summary.byAgent.get('openai-provider')?.totalTokens).toBe(300);
    });
  });

  describe('Persistence Integration', () => {
    const testFilePath = '/tmp/test-token-metrics.json';

    beforeEach(() => {
      // Configure persistence with test file
      TokenMetricsCollector.configurePersistence({
        filePath: testFilePath,
        autoSaveIntervalMs: 0, // Disable auto-save for tests
      });

      // Clean up test file
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    afterEach(() => {
      // Clean up
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should save metrics to file', async () => {
      // Record some usage
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'test', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      // Save
      await TokenMetricsCollector.save();

      // Verify file exists
      expect(fs.existsSync(testFilePath)).toBe(true);

      // Verify content
      const content = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));
      expect(content.version).toBe('1.0.0');
      expect(content.taskMetrics.length).toBe(1);
      expect(content.taskMetrics[0].usage.totalTokens).toBe(150);
    });

    it('should load metrics from file', async () => {
      // Create a persisted file
      const persistedData = {
        version: '1.0.0',
        sessionId: 'old-session',
        sessionStartTime: Date.now() - 3600000,
        taskMetrics: [
          {
            taskId: 'old-task',
            agentId: 'old-agent',
            domain: 'historical',
            operation: 'test',
            timestamp: Date.now() - 3600000,
            usage: {
              inputTokens: 500,
              outputTokens: 250,
              totalTokens: 750,
            },
            patternReused: false,
          },
        ],
        optimizationStats: {
          cacheHits: 5,
          earlyExits: 3,
          totalTokensSaved: 1000,
          totalPatternsReused: 2,
        },
        lastSavedAt: Date.now() - 3600000,
      };

      fs.writeFileSync(testFilePath, JSON.stringify(persistedData));

      // Load
      const loaded = await TokenMetricsCollector.load();
      expect(loaded).toBe(true);

      // Verify historical data is loaded
      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.cacheHits).toBeGreaterThanOrEqual(5);
      expect(summary.optimizationStats.tokensSaved).toBeGreaterThanOrEqual(1000);

      // Verify metrics are merged
      const tasks = TokenMetricsCollector.getTaskMetrics();
      expect(tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('should track dirty state correctly', async () => {
      expect(TokenMetricsCollector.hasUnsavedChanges()).toBe(false);

      // Record usage
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'test', 'op', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });

      expect(TokenMetricsCollector.hasUnsavedChanges()).toBe(true);

      // Save
      await TokenMetricsCollector.save();

      expect(TokenMetricsCollector.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('Token Savings Tracking', () => {
    it('should track pattern reuse correctly', () => {
      // Simulate pattern reuse flow
      TokenMetricsCollector.recordPatternReuse('task-1', 500);
      TokenMetricsCollector.recordPatternReuse('task-2', 300);

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.tokensSaved).toBe(800);
      expect(summary.optimizationStats.patternsReused).toBe(2);
    });

    it('should track early exits correctly', () => {
      TokenMetricsCollector.recordEarlyExit(400);
      TokenMetricsCollector.recordEarlyExit(200);

      const summary = TokenMetricsCollector.getSessionSummary();
      expect(summary.optimizationStats.earlyExits).toBe(2);
      expect(summary.optimizationStats.tokensSaved).toBe(600);
    });

    it('should calculate savings percentage correctly', () => {
      // Record actual usage
      TokenMetricsCollector.recordTokenUsage('task-1', 'agent-1', 'test', 'op', {
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
      });

      // Record savings
      TokenMetricsCollector.recordPatternReuse('task-2', 500);
      TokenMetricsCollector.recordEarlyExit(500);

      const summary = TokenMetricsCollector.getSessionSummary();
      // Total tokens used: 1000
      // Total tokens saved: 1000
      // Savings percentage: 1000 / (1000 + 1000) * 100 = 50%
      expect(summary.optimizationStats.savingsPercentage).toBeCloseTo(50, 1);
    });
  });

  describe('Domain Aggregation', () => {
    it('should aggregate tokens by domain correctly', () => {
      TokenMetricsCollector.recordTokenUsage('t1', 'a1', 'test-generation', 'gen', {
        inputTokens: 100, outputTokens: 50, totalTokens: 150,
      });
      TokenMetricsCollector.recordTokenUsage('t2', 'a1', 'test-generation', 'gen', {
        inputTokens: 200, outputTokens: 100, totalTokens: 300,
      });
      TokenMetricsCollector.recordTokenUsage('t3', 'a2', 'coverage-analysis', 'analyze', {
        inputTokens: 300, outputTokens: 150, totalTokens: 450,
      });

      const domainMetrics = TokenMetricsCollector.getDomainMetrics() as Map<string, any>;
      expect(domainMetrics.get('test-generation')?.totalTokens).toBe(450);
      expect(domainMetrics.get('coverage-analysis')?.totalTokens).toBe(450);
    });
  });

  describe('Efficiency Report', () => {
    it('should generate recommendations based on usage patterns', () => {
      // Record many tasks without pattern reuse
      for (let i = 0; i < 25; i++) {
        TokenMetricsCollector.recordTokenUsage(`task-${i}`, 'agent-1', 'test-generation', 'gen', {
          inputTokens: 100, outputTokens: 100, totalTokens: 200,
        });
      }

      const report = TokenMetricsCollector.getTokenEfficiency();
      expect(report.recommendations.length).toBeGreaterThan(0);
      // Should recommend enabling pattern reuse since rate is 0%
      expect(report.recommendations.some(r => r.includes('pattern'))).toBe(true);
      // Should recommend early exit since none used
      expect(report.recommendations.some(r => r.includes('Early exit') || r.includes('exit'))).toBe(true);
    });
  });
});
