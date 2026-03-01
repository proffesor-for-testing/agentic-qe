# SPEC-043-C: Model ID Mapping

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-043-C |
| **Parent ADR** | [ADR-043](../adrs/ADR-043-vendor-independent-llm.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-15 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the bidirectional model ID mapping system that enables vendor-independent model references across all supported providers.

---

## Model Mapping Structure

```typescript
const MODEL_MAPPINGS = {
  'claude-sonnet-4.5': {
    anthropic: 'claude-sonnet-4-5-20250929',
    openrouter: 'anthropic/claude-sonnet-4.5',
    bedrock: 'anthropic.claude-sonnet-4-5-v2:0',
    canonical: 'Claude Sonnet 4.5'
  },
  'claude-opus-4': {
    anthropic: 'claude-opus-4-20250514',
    openrouter: 'anthropic/claude-opus-4',
    bedrock: 'anthropic.claude-opus-4-v1:0',
    canonical: 'Claude Opus 4'
  },
  'gpt-4o': {
    openai: 'gpt-4o',
    azure: 'gpt-4o',
    openrouter: 'openai/gpt-4o',
    canonical: 'GPT-4o'
  },
  'gpt-4-turbo': {
    openai: 'gpt-4-turbo',
    azure: 'gpt-4-turbo',
    openrouter: 'openai/gpt-4-turbo',
    canonical: 'GPT-4 Turbo'
  },
  'gemini-pro': {
    gemini: 'gemini-pro',
    openrouter: 'google/gemini-pro',
    canonical: 'Gemini Pro'
  },
  'llama-3-70b': {
    ollama: 'llama3:70b',
    openrouter: 'meta-llama/llama-3-70b-instruct',
    bedrock: 'meta.llama3-70b-instruct-v1:0',
    canonical: 'Llama 3 70B'
  }
};
```

---

## Mapping Functions

```typescript
/**
 * Map a canonical model ID to provider-specific ID
 */
function mapModelId(modelId: string, targetProvider: ProviderType): string {
  const mapping = MODEL_MAPPINGS[modelId];
  if (!mapping) {
    return modelId; // Pass through unknown models
  }
  return mapping[targetProvider] || modelId;
}

/**
 * Reverse lookup: find canonical ID from provider-specific ID
 */
function reverseMapModelId(providerModelId: string, sourceProvider: ProviderType): string {
  for (const [canonical, mapping] of Object.entries(MODEL_MAPPINGS)) {
    if (mapping[sourceProvider] === providerModelId) {
      return canonical;
    }
  }
  return providerModelId;
}

/**
 * Get all available mappings for a model
 */
function getModelAvailability(modelId: string): ProviderType[] {
  const mapping = MODEL_MAPPINGS[modelId];
  if (!mapping) return [];
  return Object.keys(mapping).filter(k => k !== 'canonical') as ProviderType[];
}
```

---

## Model Registry

```typescript
interface ModelMetadata {
  canonical: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
  latencyMs: number;  // Estimated P50
}

const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  'claude-sonnet-4.5': {
    canonical: 'Claude Sonnet 4.5',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsStreaming: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    latencyMs: 1200
  },
  // ... additional models
};
```

---

## Implementation Files

| File | LOC | Description |
|------|-----|-------------|
| `src/shared/llm/model-mapping.ts` | 300 | Bidirectional mapping functions |
| `src/shared/llm/model-registry.ts` | 250 | Model metadata and capabilities |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-043-C-001 | All mapped models must have canonical name | Error |
| SPEC-043-C-002 | Provider-specific IDs must be unique per provider | Error |
| SPEC-043-C-003 | Unknown models should pass through unchanged | Warning |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-15 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-043-vendor-independent-llm.md)
- [SPEC-043-B: HybridRouter Core](./SPEC-043-B-hybrid-router-core.md)
