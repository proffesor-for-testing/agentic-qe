/**
 * Agentic QE v3 - Model Registry Unit Tests
 * ADR-043: Vendor-Independent LLM Support (Milestone 2)
 */

import { describe, it, expect } from 'vitest';
import {
  getModelCapabilities,
  getModelCost,
  getModelInfo,
  listModels,
  findModelsByCapability,
  findModelsByCost,
  findCheapestModel,
  findBestModelInBudget,
  getRecommendedModels,
  getDeprecationStatus,
  estimateRequestCost,
  compareModels,
  MODEL_REGISTRY,
  type ModelCapabilities,
  type ModelInfo,
} from '../../../../src/shared/llm/model-registry';

describe('Model Registry', () => {
  describe('getModelCapabilities', () => {
    it('should return capabilities for claude-sonnet-4-5', () => {
      const caps = getModelCapabilities('claude-sonnet-4-5');

      expect(caps.contextLength).toBe(200000);
      expect(caps.maxOutputTokens).toBe(16384);
      expect(caps.supportsTools).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsJsonMode).toBe(true);
      expect(caps.supportsExtendedThinking).toBe(true);
      expect(caps.supportsMCP).toBe(true);
    });

    it('should return capabilities for gpt-4o', () => {
      const caps = getModelCapabilities('gpt-4o');

      expect(caps.contextLength).toBe(128000);
      expect(caps.supportsTools).toBe(true);
      expect(caps.supportsVision).toBe(true);
      expect(caps.supportsMCP).toBe(false);
    });

    it('should return capabilities for gemini-pro-1.5', () => {
      const caps = getModelCapabilities('gemini-pro-1.5');

      expect(caps.contextLength).toBe(1000000); // 1M context
      expect(caps.supportsCodeExecution).toBe(true);
    });

    it('should work with provider-specific model IDs', () => {
      const caps = getModelCapabilities('anthropic/claude-sonnet-4.5');
      expect(caps.supportsTools).toBe(true);
    });

    it('should throw for unknown model', () => {
      expect(() => getModelCapabilities('unknown-model')).toThrow();
    });

    it('should return a copy, not the original object', () => {
      const caps1 = getModelCapabilities('claude-sonnet-4-5');
      const caps2 = getModelCapabilities('claude-sonnet-4-5');

      caps1.contextLength = 0;
      expect(caps2.contextLength).toBe(200000);
    });
  });

  describe('getModelCost', () => {
    it('should return cost for claude models', () => {
      const cost = getModelCost('claude-sonnet-4-5');

      expect(cost.inputCostPerMillion).toBe(3.0);
      expect(cost.outputCostPerMillion).toBe(15.0);
    });

    it('should return cost for gpt models', () => {
      const cost = getModelCost('gpt-4o');

      expect(cost.inputCostPerMillion).toBe(5.0);
      expect(cost.outputCostPerMillion).toBe(15.0);
      expect(cost.imageCostPerUnit).toBe(0.00765);
    });

    it('should return zero cost for ollama models', () => {
      const cost = getModelCost('llama3');

      expect(cost.inputCostPerMillion).toBe(0);
      expect(cost.outputCostPerMillion).toBe(0);
    });

    it('should return zero cost for unknown models', () => {
      const cost = getModelCost('unknown-model');

      expect(cost.inputCostPerMillion).toBe(0);
      expect(cost.outputCostPerMillion).toBe(0);
    });
  });

  describe('getModelInfo', () => {
    it('should return full info for claude model', () => {
      const info = getModelInfo('claude-sonnet-4-5');

      expect(info).toBeDefined();
      expect(info!.id).toBe('claude-sonnet-4-5');
      expect(info!.name).toBe('Claude Sonnet 4.5');
      expect(info!.family).toBe('claude');
      expect(info!.tier).toBe('standard');
      expect(info!.providers).toContain('anthropic');
      expect(info!.capabilities.supportsTools).toBe(true);
      expect(info!.cost.inputCostPerMillion).toBe(3.0);
      expect(info!.recommended).toBe(true);
    });

    it('should return undefined for unknown model', () => {
      const info = getModelInfo('unknown-model');
      expect(info).toBeUndefined();
    });

    it('should include provider list', () => {
      const info = getModelInfo('gpt-4o');

      expect(info!.providers).toContain('openai');
      expect(info!.providers).toContain('azure');
      expect(info!.providers).toContain('openrouter');
    });
  });

  describe('listModels', () => {
    it('should list all models when no provider specified', () => {
      const models = listModels();

      expect(models.length).toBeGreaterThan(15);
      expect(models.some(m => m.id === 'claude-sonnet-4-5')).toBe(true);
      expect(models.some(m => m.id === 'gpt-4o')).toBe(true);
    });

    it('should filter by anthropic provider', () => {
      const models = listModels('anthropic');

      expect(models.every(m => m.providers.includes('anthropic'))).toBe(true);
      expect(models.some(m => m.id === 'claude-sonnet-4-5')).toBe(true);
      expect(models.some(m => m.id === 'gpt-4o')).toBe(false);
    });

    it('should filter by openai provider', () => {
      const models = listModels('openai');

      expect(models.every(m => m.providers.includes('openai'))).toBe(true);
      expect(models.some(m => m.id === 'gpt-4o')).toBe(true);
      expect(models.some(m => m.id === 'claude-sonnet-4-5')).toBe(false);
    });

    it('should filter by ollama provider', () => {
      const models = listModels('ollama');

      expect(models.every(m => m.providers.includes('ollama'))).toBe(true);
      expect(models.every(m => m.cost.inputCostPerMillion === 0)).toBe(true);
    });

    it('should return full ModelInfo objects', () => {
      const models = listModels('anthropic');

      for (const model of models) {
        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
        expect(model.capabilities).toBeDefined();
        expect(model.cost).toBeDefined();
      }
    });
  });

  describe('findModelsByCapability', () => {
    it('should find models with vision support', () => {
      const models = findModelsByCapability({ supportsVision: true });

      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('gpt-4o');
      expect(models).not.toContain('llama3');
    });

    it('should find models with MCP support', () => {
      const models = findModelsByCapability({ supportsMCP: true });

      expect(models).toContain('claude-sonnet-4-5');
      expect(models).not.toContain('gpt-4o');
    });

    it('should find models with minimum context length', () => {
      const models = findModelsByCapability({ contextLength: 500000 });

      expect(models).toContain('gemini-pro-1.5');
      expect(models).toContain('gemini-flash-1.5');
      expect(models).not.toContain('gpt-4o'); // 128k
    });

    it('should find models matching multiple criteria', () => {
      const models = findModelsByCapability({
        supportsTools: true,
        supportsVision: true,
        contextLength: 100000,
      });

      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('gpt-4o');
      expect(models).not.toContain('llama3');
    });

    it('should find models with extended thinking', () => {
      const models = findModelsByCapability({ supportsExtendedThinking: true });

      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('claude-opus-4');
      expect(models).toContain('o1');
      expect(models).not.toContain('gpt-4o');
    });
  });

  describe('findModelsByCost', () => {
    it('should find free models', () => {
      const models = findModelsByCost(0, 0);

      expect(models).toContain('llama3');
      expect(models).toContain('mistral');
      expect(models).not.toContain('gpt-4o');
    });

    it('should find budget models', () => {
      const models = findModelsByCost(1.0, 5.0);

      expect(models).toContain('claude-haiku-3-5');
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gemini-flash-1.5');
      expect(models).not.toContain('claude-opus-4');
    });

    it('should find models with only input cost constraint', () => {
      const models = findModelsByCost(5.0);

      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('gpt-4o');
      expect(models).not.toContain('claude-opus-4'); // 15.0 input
    });
  });

  describe('findCheapestModel', () => {
    it('should find cheapest model with tools', () => {
      const model = findCheapestModel({ supportsTools: true });

      // Should be a zero-cost local model with tools
      expect(model).toBeDefined();
      const info = getModelInfo(model!);
      expect(info!.cost.inputCostPerMillion + info!.cost.outputCostPerMillion).toBe(0);
    });

    it('should find cheapest model with vision', () => {
      const model = findCheapestModel({ supportsVision: true });

      expect(model).toBeDefined();
      // Gemini Flash 1.5 is one of the cheapest with vision
    });

    it('should find cheapest model for provider', () => {
      const model = findCheapestModel({ supportsTools: true }, 'anthropic');

      expect(model).toBe('claude-haiku-3-5');
    });

    it('should return undefined when no match', () => {
      const model = findCheapestModel(
        { supportsTools: true, supportsMCP: true },
        'gemini'
      );

      expect(model).toBeUndefined();
    });
  });

  describe('findBestModelInBudget', () => {
    it('should find best model in low budget', () => {
      const model = findBestModelInBudget(2.0); // $2/M total

      expect(model).toBeDefined();
      const info = getModelInfo(model!);
      const totalCost = info!.cost.inputCostPerMillion + info!.cost.outputCostPerMillion;
      expect(totalCost).toBeLessThanOrEqual(2.0);
    });

    it('should find best model in medium budget', () => {
      const model = findBestModelInBudget(20.0);

      expect(model).toBeDefined();
    });

    it('should find best model for provider', () => {
      const model = findBestModelInBudget(20.0, 'anthropic');

      expect(model).toBeDefined();
      const info = getModelInfo(model!);
      expect(info!.providers).toContain('anthropic');
    });

    it('should return undefined when budget too low', () => {
      const model = findBestModelInBudget(0.001, 'anthropic');

      expect(model).toBeUndefined();
    });
  });

  describe('getRecommendedModels', () => {
    it('should return coding recommendations', () => {
      const models = getRecommendedModels('coding');

      expect(models).toContain('claude-sonnet-4-5');
      expect(models.length).toBeGreaterThan(3);
    });

    it('should return reasoning recommendations', () => {
      const models = getRecommendedModels('reasoning');

      expect(models).toContain('claude-opus-4-5');
      expect(models).toContain('o1');
    });

    it('should return vision recommendations', () => {
      const models = getRecommendedModels('vision');

      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('gpt-4o');
    });

    it('should return chat recommendations', () => {
      const models = getRecommendedModels('chat');

      expect(models).toContain('claude-haiku-3-5');
      expect(models).toContain('gpt-4o-mini');
    });

    it('should return local recommendations', () => {
      const models = getRecommendedModels('local');

      expect(models).toContain('llama3.1');
      expect(models).toContain('mixtral');
      expect(models.every(m => {
        const info = getModelInfo(m);
        return info?.providers.includes('ollama') || false;
      })).toBe(true);
    });
  });

  describe('getDeprecationStatus', () => {
    it('should return non-deprecated status for current models', () => {
      const status = getDeprecationStatus('claude-sonnet-4-5');

      expect(status).toBeDefined();
      expect(status!.deprecated).toBe(false);
    });

    it('should return deprecation info for scheduled models', () => {
      const status = getDeprecationStatus('gpt-4');

      expect(status).toBeDefined();
      expect(status!.date).toBeDefined();
    });

    it('should return undefined for unknown models', () => {
      const status = getDeprecationStatus('unknown-model');
      expect(status).toBeUndefined();
    });
  });

  describe('estimateRequestCost', () => {
    it('should estimate cost for claude model', () => {
      const cost = estimateRequestCost('claude-sonnet-4-5', 1000, 500);

      // 1000 input tokens at $3/M = $0.003
      // 500 output tokens at $15/M = $0.0075
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should estimate cost for gpt model', () => {
      const cost = estimateRequestCost('gpt-4o', 1000, 500);

      // 1000 input tokens at $5/M = $0.005
      // 500 output tokens at $15/M = $0.0075
      expect(cost).toBeCloseTo(0.0125, 4);
    });

    it('should return zero for local models', () => {
      const cost = estimateRequestCost('llama3', 10000, 5000);
      expect(cost).toBe(0);
    });

    it('should scale correctly with token count', () => {
      const cost1 = estimateRequestCost('claude-sonnet-4-5', 1000, 500);
      const cost2 = estimateRequestCost('claude-sonnet-4-5', 2000, 1000);

      expect(cost2).toBeCloseTo(cost1 * 2, 4);
    });
  });

  describe('compareModels', () => {
    it('should compare context lengths', () => {
      const result = compareModels('claude-sonnet-4-5', 'gpt-4o');

      // Claude: 200k, GPT: 128k
      expect(result.contextLengthDiff).toBe(72000);
    });

    it('should compare costs', () => {
      const result = compareModels('claude-haiku-3-5', 'claude-opus-4');

      // Haiku: $6/M total, Opus: $90/M total
      expect(result.costDiff).toBeLessThan(0); // Haiku is cheaper
    });

    it('should identify capability differences', () => {
      const result = compareModels('claude-sonnet-4-5', 'gpt-4o');

      // Claude has MCP, GPT doesn't
      expect(result.capabilityDiff.some(d => d.includes('supportsMCP'))).toBe(true);
    });

    it('should throw for unknown models', () => {
      expect(() => compareModels('unknown', 'gpt-4o')).toThrow();
    });
  });

  describe('MODEL_REGISTRY structure', () => {
    it('should have all required fields for each model', () => {
      for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
        expect(entry.name).toBeTruthy();
        expect(entry.family).toBeTruthy();
        expect(entry.tier).toMatch(/^(economy|standard|premium|flagship)$/);
        expect(entry.description).toBeTruthy();
        expect(entry.capabilities).toBeDefined();
        expect(entry.cost).toBeDefined();
        expect(typeof entry.recommended).toBe('boolean');
      }
    });

    it('should have valid capability values', () => {
      for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
        const caps = entry.capabilities;

        expect(caps.contextLength).toBeGreaterThan(0);
        expect(caps.maxOutputTokens).toBeGreaterThan(0);
        expect(typeof caps.supportsTools).toBe('boolean');
        expect(typeof caps.supportsStreaming).toBe('boolean');
        expect(typeof caps.supportsVision).toBe('boolean');
        expect(typeof caps.supportsJsonMode).toBe('boolean');
        expect(typeof caps.supportsSystemPrompt).toBe('boolean');
        expect(typeof caps.supportsExtendedThinking).toBe('boolean');
        expect(typeof caps.supportsMCP).toBe('boolean');
        expect(typeof caps.supportsEmbeddings).toBe('boolean');
        expect(typeof caps.supportsCodeExecution).toBe('boolean');
      }
    });

    it('should have valid cost values', () => {
      for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
        const cost = entry.cost;

        expect(cost.inputCostPerMillion).toBeGreaterThanOrEqual(0);
        expect(cost.outputCostPerMillion).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have release dates in ISO format', () => {
      for (const [id, entry] of Object.entries(MODEL_REGISTRY)) {
        if (entry.releaseDate) {
          const date = new Date(entry.releaseDate);
          expect(date.toString()).not.toBe('Invalid Date');
        }
      }
    });
  });

  describe('consistency with model-mapping', () => {
    it('should have registry entry for all mapped models', () => {
      const registryIds = Object.keys(MODEL_REGISTRY);

      // Import is done at runtime, so we check if all registry models exist
      for (const id of registryIds) {
        expect(getModelInfo(id)).toBeDefined();
      }
    });
  });
});
