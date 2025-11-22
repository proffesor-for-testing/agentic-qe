/**
 * Tests for Token and Cost Tracking (Phase 2 - Action A5)
 *
 * Validates:
 * - Token counting from API responses
 * - Cost calculation with pricing tables
 * - Per-agent, per-task, and fleet-level aggregation
 * - Multi-provider support (Anthropic, OpenRouter, ONNX)
 * - Cache-aware cost calculation
 * - Prometheus metric export
 */

import {
  CostTracker,
  getCostTracker,
  withTokenTracking,
  TokenUsage,
  PRICING_TABLE,
} from '../../../src/telemetry/metrics/collectors/cost';
import {
  getPricing,
  calculateSavingsPercentage,
  PRICING_CONFIG,
} from '../../../src/telemetry/metrics/collectors/pricing-config';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  afterEach(() => {
    tracker.reset();
  });

  describe('Token Tracking', () => {
    it('should track basic token usage', () => {
      const usage: TokenUsage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      };

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage,
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      expect(metrics).toBeDefined();
      expect(metrics?.tokens.inputTokens).toBe(1000);
      expect(metrics?.tokens.outputTokens).toBe(500);
      expect(metrics?.tokens.totalTokens).toBe(1500);
    });

    it('should accumulate tokens for multiple calls', () => {
      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
        },
      });

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: {
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
        },
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      expect(metrics?.tokens.inputTokens).toBe(3000);
      expect(metrics?.tokens.outputTokens).toBe(1500);
      expect(metrics?.tokens.totalTokens).toBe(4500);
    });

    it('should track cache tokens separately', () => {
      const usage: TokenUsage = {
        inputTokens: 5000,
        outputTokens: 1000,
        cacheCreationTokens: 2000,
        cacheReadTokens: 3000,
        totalTokens: 6000,
      };

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage,
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      expect(metrics?.tokens.cacheCreationTokens).toBe(2000);
      expect(metrics?.tokens.cacheReadTokens).toBe(3000);
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate costs for Anthropic Claude Sonnet', () => {
      const usage: TokenUsage = {
        inputTokens: 100000,  // 0.1M tokens
        outputTokens: 50000,  // 0.05M tokens
        totalTokens: 150000,
      };

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage,
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      expect(metrics?.cost.inputCost).toBeCloseTo(0.3, 4); // 100k * $3/M = $0.30
      expect(metrics?.cost.outputCost).toBeCloseTo(0.75, 4); // 50k * $15/M = $0.75
      expect(metrics?.cost.totalCost).toBeCloseTo(1.05, 4); // $0.30 + $0.75 = $1.05
    });

    it('should calculate cache write cost (25% premium)', () => {
      const usage: TokenUsage = {
        inputTokens: 100000,
        outputTokens: 10000,
        cacheCreationTokens: 50000, // 50k tokens written to cache
        totalTokens: 110000,
      };

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage,
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      // Regular input: (100k - 50k) * $3/M = $0.15
      // Cache write: 50k * $3.75/M = $0.1875
      // Output: 10k * $15/M = $0.15
      expect(metrics?.cost.inputCost).toBeCloseTo(0.15, 4);
      expect(metrics?.cost.cacheWriteCost).toBeCloseTo(0.1875, 4);
      expect(metrics?.cost.totalCost).toBeCloseTo(0.4875, 4);
    });

    it('should calculate cache read cost (90% discount) and savings', () => {
      const usage: TokenUsage = {
        inputTokens: 100000,
        outputTokens: 10000,
        cacheReadTokens: 80000, // 80k tokens read from cache
        totalTokens: 110000,
      };

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage,
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      // Regular input: (100k - 80k) * $3/M = $0.06
      // Cache read: 80k * $0.30/M = $0.024
      // Savings: (80k * $3/M) - (80k * $0.30/M) = $0.24 - $0.024 = $0.216
      expect(metrics?.cost.inputCost).toBeCloseTo(0.06, 4);
      expect(metrics?.cost.cacheReadCost).toBeCloseTo(0.024, 4);
      expect(metrics?.cost.cacheSavings).toBeCloseTo(0.216, 4);
    });

    it('should calculate costs for OpenRouter (99% cheaper)', () => {
      const usage: TokenUsage = {
        inputTokens: 100000,
        outputTokens: 50000,
        totalTokens: 150000,
      };

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'openrouter',
        model: 'meta-llama/llama-3.1-8b-instruct',
        usage,
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      // Input: 100k * $0.03/M = $0.003
      // Output: 50k * $0.15/M = $0.0075
      expect(metrics?.cost.inputCost).toBeCloseTo(0.003, 6);
      expect(metrics?.cost.outputCost).toBeCloseTo(0.0075, 6);
      expect(metrics?.cost.totalCost).toBeCloseTo(0.0105, 6);
    });

    it('should calculate zero cost for ONNX (local)', () => {
      const usage: TokenUsage = {
        inputTokens: 100000,
        outputTokens: 50000,
        totalTokens: 150000,
      };

      tracker.trackTokens({
        agentId: 'test-agent-001',
        provider: 'onnx',
        model: 'Xenova/gpt2',
        usage,
      });

      const metrics = tracker.getAgentMetrics('test-agent-001');
      expect(metrics?.cost.totalCost).toBe(0);
    });
  });

  describe('Multi-Level Aggregation', () => {
    it('should track per-agent metrics', () => {
      tracker.trackTokens({
        agentId: 'agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      tracker.trackTokens({
        agentId: 'agent-002',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
      });

      const agent1 = tracker.getAgentMetrics('agent-001');
      const agent2 = tracker.getAgentMetrics('agent-002');

      expect(agent1?.tokens.inputTokens).toBe(1000);
      expect(agent2?.tokens.inputTokens).toBe(2000);
    });

    it('should track per-task metrics', () => {
      tracker.trackTokens({
        agentId: 'agent-001',
        taskId: 'task-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      const taskMetrics = tracker.getTaskMetrics('task-123');
      expect(taskMetrics).toBeDefined();
      expect(taskMetrics?.tokens.inputTokens).toBe(1000);
    });

    it('should aggregate fleet-wide metrics', () => {
      tracker.trackTokens({
        agentId: 'agent-001',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      tracker.trackTokens({
        agentId: 'agent-002',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
      });

      const fleetMetrics = tracker.getFleetMetrics();
      expect(fleetMetrics?.tokens.inputTokens).toBe(3000);
      expect(fleetMetrics?.tokens.outputTokens).toBe(1500);
      expect(fleetMetrics?.tokens.totalTokens).toBe(4500);
    });
  });

  describe('Prometheus Export', () => {
    it('should export metrics in Prometheus format', () => {
      tracker.trackTokens({
        agentId: 'test-agent',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      });

      const prometheus = tracker.exportPrometheusMetrics();
      expect(prometheus).toContain('aqe_fleet_tokens_total');
      expect(prometheus).toContain('aqe_fleet_cost_total');
      expect(prometheus).toContain('aqe_agent_tokens_total');
      expect(prometheus).toContain('agent_id="test-agent"');
    });

    it('should include cache savings in export', () => {
      tracker.trackTokens({
        agentId: 'test-agent',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        usage: {
          inputTokens: 100000,
          outputTokens: 10000,
          cacheReadTokens: 50000,
          totalTokens: 110000,
        },
      });

      const prometheus = tracker.exportPrometheusMetrics();
      expect(prometheus).toContain('aqe_fleet_cache_savings_total');
    });
  });

  describe('Middleware', () => {
    it('should wrap LLM calls with automatic tracking', async () => {
      const mockLLMCall = jest.fn(async (prompt: string) => ({
        text: 'Generated response',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 300,
        },
      }));

      const trackedCall = withTokenTracking(mockLLMCall, {
        agentId: 'test-agent',
        taskId: 'task-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
      });

      await trackedCall('Test prompt');

      const metrics = getCostTracker().getAgentMetrics('test-agent');
      expect(metrics).toBeDefined();
      expect(metrics?.tokens.inputTokens).toBe(1000);
      expect(metrics?.tokens.outputTokens).toBe(500);
      expect(metrics?.tokens.cacheReadTokens).toBe(300);
    });
  });
});

describe('Pricing Configuration', () => {
  it('should have pricing for all major providers', () => {
    const anthropic = getPricing('anthropic', 'claude-sonnet-4');
    const openrouter = getPricing('openrouter', 'meta-llama/llama-3.1-8b-instruct');
    const onnx = getPricing('onnx', 'Xenova/gpt2');

    expect(anthropic).toBeDefined();
    expect(openrouter).toBeDefined();
    expect(onnx).toBeDefined();
  });

  it('should calculate 99% savings for OpenRouter vs Anthropic', () => {
    const savings = calculateSavingsPercentage(
      { provider: 'anthropic', model: 'claude-sonnet-4' },
      { provider: 'openrouter', model: 'meta-llama/llama-3.1-8b-instruct' },
      { input: 100000, output: 50000 }
    );

    expect(savings).toBeGreaterThan(0.98); // At least 98% savings
  });

  it('should have cache pricing for Anthropic models', () => {
    const pricing = getPricing('anthropic', 'claude-sonnet-4');
    expect(pricing?.cacheWriteCostPerMillion).toBe(3.75); // 25% premium
    expect(pricing?.cacheReadCostPerMillion).toBe(0.3);   // 90% discount
  });

  it('should have metadata for pricing config', () => {
    expect(PRICING_CONFIG.metadata.version).toBeDefined();
    expect(PRICING_CONFIG.metadata.lastUpdated).toBeDefined();
    expect(PRICING_CONFIG.metadata.source).toBeDefined();
  });
});
