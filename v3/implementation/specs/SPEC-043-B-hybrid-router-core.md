# SPEC-043-B: HybridRouter Core

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-043-B |
| **Parent ADR** | [ADR-043](../adrs/ADR-043-vendor-independent-llm.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-15 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the HybridRouter core implementation including routing modes, fallback chains, and the provider selection algorithm.

---

## Architecture

```
+-------------------------------------------------------------+
|                     HybridRouter                             |
|  +---------------+  +---------------+  +-------------+      |
|  |selectProvider |  | chat()/stream |  |  Fallback   |      |
|  | - manual      |  | - metrics     |  |  Chain      |      |
|  | - rule-based  |  | - cost track  |  |             |      |
|  | - cost-opt    |  +-------+-------+  +-------------+      |
|  | - perf-opt    |          |                               |
|  +-------+-------+          |                               |
+-----------|-----------------+-------------------------------+
            |                 |
     +------+------+   +------+------+
     |Model Mapping|   |   Prompt    |
     |   Layer     |   | Translation |
     +------+------+   +------+------+
            |                 |
+-----------|-----------------|-------------------------------+
| Claude | OpenAI | Ollama | OpenRouter | Gemini | Azure | AWS |
+------------------------------------------------------------- +
```

---

## HybridRouter Interface

```typescript
interface HybridRouter {
  // Routing modes
  routingMode: 'manual' | 'rule-based' | 'cost-optimized' | 'performance-optimized';

  // Provider selection
  selectProvider(params: ChatParams): Promise<LLMProvider>;

  // Unified interface
  chat(params: ChatParams): Promise<ChatResponse>;
  stream(params: ChatParams): AsyncGenerator<StreamChunk>;

  // Fallback handling
  fallbackChain: ProviderType[];

  // Model ID resolution
  resolveModelIds(modelId: string, targetProvider: ProviderType): string;
}

interface ChatParams {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  agentType?: string;
  requiresTools?: boolean;
  complexity?: 'low' | 'medium' | 'high';
}
```

---

## Routing Modes

### Manual Mode
User explicitly specifies provider and model in request.

### Rule-Based Mode
Routes based on configured rules matching agent type, complexity, and requirements.

### Cost-Optimized Mode
Selects cheapest provider capable of handling the request.

### Performance-Optimized Mode
Selects fastest provider with required capabilities.

---

## Fallback Chain

```typescript
const DEFAULT_FALLBACK_CHAIN: ProviderType[] = [
  'anthropic',
  'openai',
  'openrouter',
  'ollama'
];

// Fallback triggers on:
// - Provider error/timeout
// - Rate limiting (429)
// - Model not available
// - Capability mismatch
```

---

## Implementation Files

| File | LOC | Description |
|------|-----|-------------|
| `src/shared/llm/router/hybrid-router.ts` | 850 | Main router implementation |
| `src/shared/llm/router/types.ts` | 150 | Router types and interfaces |
| `src/shared/llm/router/index.ts` | 30 | Public exports |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-043-B-001 | Routing decision must complete in <10ms | Warning |
| SPEC-043-B-002 | Fallback chain must have at least one provider | Error |
| SPEC-043-B-003 | All routing modes must be implemented | Error |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-15 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-043-vendor-independent-llm.md)
- [SPEC-043-A: Provider Adapters](./SPEC-043-A-llm-provider-adapters.md)
