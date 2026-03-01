/**
 * Agentic QE v3 - Model Mapping Unit Tests
 * ADR-043: Vendor-Independent LLM Support (Milestone 2)
 */

import { describe, it, expect } from 'vitest';
import {
  mapModelId,
  normalizeModelId,
  getCanonicalName,
  getModelFamily,
  getModelTier,
  isModelAvailableOnProvider,
  getSupportedProviders,
  listCanonicalModels,
  listModelsByProvider,
  listModelsByFamily,
  listModelsByTier,
  getModelMapping,
  MODEL_MAPPINGS,
  type ProviderType,
} from '../../../../src/shared/llm/model-mapping';

describe('Model Mapping', () => {
  describe('mapModelId', () => {
    it('should map canonical claude model to anthropic provider', () => {
      const result = mapModelId('claude-sonnet-4-5', 'anthropic');
      expect(result).toBe('claude-sonnet-4-5-20250929');
    });

    it('should map canonical claude model to openrouter provider', () => {
      const result = mapModelId('claude-sonnet-4-5', 'openrouter');
      expect(result).toBe('anthropic/claude-sonnet-4.5');
    });

    it('should map canonical claude model to bedrock provider', () => {
      const result = mapModelId('claude-sonnet-4-5', 'bedrock');
      expect(result).toBe('anthropic.claude-sonnet-4-5-v2:0');
    });

    it('should map gpt-4o to openai provider', () => {
      const result = mapModelId('gpt-4o', 'openai');
      expect(result).toBe('gpt-4o');
    });

    it('should map gpt-4o to azure provider', () => {
      const result = mapModelId('gpt-4o', 'azure');
      expect(result).toBe('gpt-4o');
    });

    it('should map gpt-4o to openrouter provider', () => {
      const result = mapModelId('gpt-4o', 'openrouter');
      expect(result).toBe('openai/gpt-4o');
    });

    it('should map gemini-pro to gemini provider', () => {
      const result = mapModelId('gemini-pro', 'gemini');
      expect(result).toBe('gemini-pro');
    });

    it('should map gemini-pro to openrouter provider', () => {
      const result = mapModelId('gemini-pro', 'openrouter');
      expect(result).toBe('google/gemini-pro');
    });

    it('should throw error for unsupported provider', () => {
      expect(() => mapModelId('claude-sonnet-4-5', 'gemini')).toThrow(
        "Model 'claude-sonnet-4-5' (Claude Sonnet 4.5) is not available on provider 'gemini'"
      );
    });

    it('should throw error for unknown model', () => {
      expect(() => mapModelId('unknown-model', 'anthropic')).toThrow(
        'Unknown model ID: unknown-model'
      );
    });

    it('should handle provider-specific ID as input', () => {
      // Map from OpenRouter format to Bedrock
      const result = mapModelId('anthropic/claude-sonnet-4.5', 'bedrock');
      expect(result).toBe('anthropic.claude-sonnet-4-5-v2:0');
    });

    it('should handle Anthropic API format as input', () => {
      const result = mapModelId('claude-sonnet-4-5-20250929', 'openrouter');
      expect(result).toBe('anthropic/claude-sonnet-4.5');
    });
  });

  describe('normalizeModelId', () => {
    it('should normalize anthropic API model ID', () => {
      const result = normalizeModelId('claude-sonnet-4-5-20250929');
      expect(result).toBe('claude-sonnet-4-5');
    });

    it('should normalize openrouter model ID', () => {
      const result = normalizeModelId('anthropic/claude-sonnet-4.5');
      expect(result).toBe('claude-sonnet-4-5');
    });

    it('should normalize openrouter gpt model ID', () => {
      const result = normalizeModelId('openai/gpt-4o');
      expect(result).toBe('gpt-4o');
    });

    it('should return canonical ID unchanged', () => {
      const result = normalizeModelId('claude-sonnet-4-5');
      expect(result).toBe('claude-sonnet-4-5');
    });

    it('should handle case-insensitive matching', () => {
      const result = normalizeModelId('CLAUDE-SONNET-4-5');
      expect(result).toBe('claude-sonnet-4-5');
    });

    it('should throw for unknown model ID', () => {
      expect(() => normalizeModelId('not-a-real-model')).toThrow(
        'Unknown model ID: not-a-real-model'
      );
    });

    it('should normalize bedrock model ID', () => {
      const result = normalizeModelId('anthropic.claude-sonnet-4-5-v2:0');
      expect(result).toBe('claude-sonnet-4-5');
    });

    it('should normalize gemini model ID', () => {
      const result = normalizeModelId('gemini-1.5-pro');
      expect(result).toBe('gemini-pro-1.5');
    });
  });

  describe('getCanonicalName', () => {
    it('should return human-readable name for claude model', () => {
      const result = getCanonicalName('claude-sonnet-4-5');
      expect(result).toBe('Claude Sonnet 4.5');
    });

    it('should return human-readable name for gpt model', () => {
      const result = getCanonicalName('gpt-4o');
      expect(result).toBe('GPT-4o');
    });

    it('should return human-readable name for gemini model', () => {
      const result = getCanonicalName('gemini-pro');
      expect(result).toBe('Gemini Pro');
    });

    it('should work with provider-specific IDs', () => {
      const result = getCanonicalName('anthropic/claude-opus-4');
      expect(result).toBe('Claude Opus 4');
    });

    it('should return input for unknown models', () => {
      const result = getCanonicalName('unknown-model');
      expect(result).toBe('unknown-model');
    });
  });

  describe('getModelFamily', () => {
    it('should return claude family for claude models', () => {
      expect(getModelFamily('claude-sonnet-4-5')).toBe('claude');
      expect(getModelFamily('claude-opus-4')).toBe('claude');
      expect(getModelFamily('claude-haiku-3-5')).toBe('claude');
    });

    it('should return gpt family for openai models', () => {
      expect(getModelFamily('gpt-4o')).toBe('gpt');
      expect(getModelFamily('gpt-4o-mini')).toBe('gpt');
      expect(getModelFamily('o1')).toBe('gpt');
    });

    it('should return gemini family for google models', () => {
      expect(getModelFamily('gemini-pro')).toBe('gemini');
      expect(getModelFamily('gemini-flash-1.5')).toBe('gemini');
    });

    it('should return llama family for meta models', () => {
      expect(getModelFamily('llama3')).toBe('llama');
      expect(getModelFamily('llama3.1')).toBe('llama');
      expect(getModelFamily('codellama')).toBe('llama');
    });

    it('should return unknown for unrecognized models', () => {
      expect(getModelFamily('not-a-model')).toBe('unknown');
    });
  });

  describe('getModelTier', () => {
    it('should return correct tier for flagship models', () => {
      expect(getModelTier('claude-opus-4')).toBe('flagship');
      expect(getModelTier('claude-opus-4-5')).toBe('flagship');
      expect(getModelTier('o1')).toBe('flagship');
    });

    it('should return correct tier for standard models', () => {
      expect(getModelTier('claude-sonnet-4-5')).toBe('standard');
      expect(getModelTier('gpt-4o')).toBe('standard');
      expect(getModelTier('gemini-pro-1.5')).toBe('standard');
    });

    it('should return correct tier for economy models', () => {
      expect(getModelTier('claude-haiku-3-5')).toBe('economy');
      expect(getModelTier('gpt-4o-mini')).toBe('economy');
      expect(getModelTier('llama3')).toBe('economy');
    });

    it('should return standard as default for unknown models', () => {
      expect(getModelTier('unknown-model')).toBe('standard');
    });
  });

  describe('isModelAvailableOnProvider', () => {
    it('should return true for available models', () => {
      expect(isModelAvailableOnProvider('claude-sonnet-4-5', 'anthropic')).toBe(true);
      expect(isModelAvailableOnProvider('claude-sonnet-4-5', 'openrouter')).toBe(true);
      expect(isModelAvailableOnProvider('gpt-4o', 'openai')).toBe(true);
      expect(isModelAvailableOnProvider('gpt-4o', 'azure')).toBe(true);
    });

    it('should return false for unavailable models', () => {
      expect(isModelAvailableOnProvider('claude-sonnet-4-5', 'gemini')).toBe(false);
      expect(isModelAvailableOnProvider('gpt-4o', 'anthropic')).toBe(false);
      expect(isModelAvailableOnProvider('gemini-pro', 'anthropic')).toBe(false);
    });

    it('should return false for unknown models', () => {
      expect(isModelAvailableOnProvider('unknown-model', 'anthropic')).toBe(false);
    });
  });

  describe('getSupportedProviders', () => {
    it('should return all providers for claude models', () => {
      const providers = getSupportedProviders('claude-sonnet-4-5');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('bedrock');
      expect(providers).not.toContain('gemini');
    });

    it('should return all providers for gpt models', () => {
      const providers = getSupportedProviders('gpt-4o');
      expect(providers).toContain('openai');
      expect(providers).toContain('azure');
      expect(providers).toContain('openrouter');
    });

    it('should return empty array for unknown models', () => {
      const providers = getSupportedProviders('unknown-model');
      expect(providers).toEqual([]);
    });
  });

  describe('listCanonicalModels', () => {
    it('should return all canonical model IDs', () => {
      const models = listCanonicalModels();
      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gemini-pro');
      expect(models).toContain('llama3');
      expect(models.length).toBeGreaterThan(15);
    });
  });

  describe('listModelsByProvider', () => {
    it('should list anthropic models', () => {
      const models = listModelsByProvider('anthropic');
      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('claude-opus-4');
      expect(models).not.toContain('gpt-4o');
    });

    it('should list openai models', () => {
      const models = listModelsByProvider('openai');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
      expect(models).not.toContain('claude-sonnet-4-5');
    });

    it('should list ollama models', () => {
      const models = listModelsByProvider('ollama');
      expect(models).toContain('llama3');
      expect(models).toContain('mistral');
      expect(models).not.toContain('gpt-4o');
    });

    it('should list openrouter models (many)', () => {
      const models = listModelsByProvider('openrouter');
      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gemini-pro');
    });
  });

  describe('listModelsByFamily', () => {
    it('should list claude family models', () => {
      const models = listModelsByFamily('claude');
      expect(models).toContain('claude-sonnet-4-5');
      expect(models).toContain('claude-opus-4');
      expect(models).toContain('claude-haiku-3-5');
      expect(models).not.toContain('gpt-4o');
    });

    it('should list gpt family models', () => {
      const models = listModelsByFamily('gpt');
      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('o1');
      expect(models).not.toContain('claude-sonnet-4-5');
    });

    it('should return empty array for unknown family', () => {
      const models = listModelsByFamily('unknown-family');
      expect(models).toEqual([]);
    });
  });

  describe('listModelsByTier', () => {
    it('should list flagship tier models', () => {
      const models = listModelsByTier('flagship');
      expect(models).toContain('claude-opus-4');
      expect(models).toContain('o1');
      expect(models).not.toContain('gpt-4o-mini');
    });

    it('should list economy tier models', () => {
      const models = listModelsByTier('economy');
      expect(models).toContain('claude-haiku-3-5');
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('llama3');
      expect(models).not.toContain('claude-opus-4');
    });
  });

  describe('getModelMapping', () => {
    it('should return full mapping for valid model', () => {
      const mapping = getModelMapping('claude-sonnet-4-5');
      expect(mapping).toBeDefined();
      expect(mapping?.canonical).toBe('Claude Sonnet 4.5');
      expect(mapping?.family).toBe('claude');
      expect(mapping?.tier).toBe('standard');
      expect(mapping?.providers.anthropic).toBe('claude-sonnet-4-5-20250929');
    });

    it('should return undefined for unknown model', () => {
      const mapping = getModelMapping('unknown-model');
      expect(mapping).toBeUndefined();
    });

    it('should work with provider-specific IDs', () => {
      const mapping = getModelMapping('openai/gpt-4o');
      expect(mapping).toBeDefined();
      expect(mapping?.canonical).toBe('GPT-4o');
    });
  });

  describe('MODEL_MAPPINGS structure', () => {
    it('should have all required claude models', () => {
      expect(MODEL_MAPPINGS['claude-sonnet-4-5']).toBeDefined();
      expect(MODEL_MAPPINGS['claude-opus-4']).toBeDefined();
      expect(MODEL_MAPPINGS['claude-opus-4-5']).toBeDefined();
      expect(MODEL_MAPPINGS['claude-haiku-3-5']).toBeDefined();
    });

    it('should have all required openai models', () => {
      expect(MODEL_MAPPINGS['gpt-4o']).toBeDefined();
      expect(MODEL_MAPPINGS['gpt-4o-mini']).toBeDefined();
      expect(MODEL_MAPPINGS['gpt-4-turbo']).toBeDefined();
      expect(MODEL_MAPPINGS['o1']).toBeDefined();
    });

    it('should have all required gemini models', () => {
      expect(MODEL_MAPPINGS['gemini-pro']).toBeDefined();
      expect(MODEL_MAPPINGS['gemini-pro-1.5']).toBeDefined();
      expect(MODEL_MAPPINGS['gemini-flash-1.5']).toBeDefined();
    });

    it('should have valid provider mappings', () => {
      for (const [id, mapping] of Object.entries(MODEL_MAPPINGS)) {
        expect(mapping.canonical).toBeTruthy();
        expect(mapping.family).toBeTruthy();
        expect(mapping.tier).toMatch(/^(economy|standard|premium|flagship)$/);
        expect(Object.keys(mapping.providers).length).toBeGreaterThan(0);
      }
    });
  });

  describe('bidirectional mapping consistency', () => {
    it('should round-trip through normalization and mapping', () => {
      const providers: ProviderType[] = ['anthropic', 'openai', 'openrouter', 'gemini'];

      for (const [canonicalId, mapping] of Object.entries(MODEL_MAPPINGS)) {
        for (const provider of providers) {
          const providerId = mapping.providers[provider];
          if (providerId) {
            // Map canonical -> provider -> normalize should return canonical
            const mapped = mapModelId(canonicalId, provider);
            const normalized = normalizeModelId(mapped);
            expect(normalized).toBe(canonicalId);
          }
        }
      }
    });
  });
});
