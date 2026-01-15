# ADR-043: Vendor-Independent LLM Support

**Status:** Implemented
**Date:** 2026-01-13
**Implemented:** 2026-01-15
**Decision Makers:** Architecture Team
**GOAP Reference:** [GOAP-ADR-043-VENDOR-INDEPENDENT-LLM.md](../plans/GOAP-ADR-043-VENDOR-INDEPENDENT-LLM.md)

---

## Context

Agentic QE v3 currently supports 3 LLM providers (Claude, OpenAI, Ollama) via ADR-011. While functional, this limits users who need:

1. **Access to more models** - OpenRouter's 100+ models, Google Gemini, enterprise providers
2. **Intelligent routing** - Optimal model selection based on task requirements and agent type
3. **Seamless provider switching** - No code changes when switching between providers
4. **Cost optimization** - Route simple tasks to cheaper models automatically
5. **Enterprise compliance** - Azure OpenAI and AWS Bedrock for regulated environments
6. **Local inference** - ONNX models for privacy-sensitive operations

### Gap Analysis (Current State vs Goal)

| Capability | Current (ADR-011) | Goal |
|------------|------------------|------|
| Provider count | 3 | 7+ |
| Model ID mapping | None | Bidirectional |
| Routing modes | 1 (manual) | 4 (manual, rule-based, cost, performance) |
| Agent-aware routing | No | Yes |
| Prompt translation | No | Yes |
| Fallback chains | Partial | Complete |

### Research Foundation

Analysis of [agentic-flow HybridRouter](https://github.com/ruvnet/agentic-flow/tree/main/agentic-flow/src/router) revealed a proven pattern with:
- `ModelRouter` class implementing Strategy Pattern
- `LLMProvider` interface with capability flags
- `model-mapping.ts` for cross-vendor ID translation
- 7 provider implementations (Anthropic, OpenRouter, Gemini, 4 ONNX variants)

---

## Decision

**Implement a HybridRouter pattern extending ADR-011's foundation with vendor-independent LLM support.**

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     HybridRouter                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ selectProvider()│  │  chat()/stream()│  │  Fallback   │  │
│  │  - manual       │  │  - metrics      │  │  Chain      │  │
│  │  - rule-based   │  │  - cost track   │  │             │  │
│  │  - cost-opt     │  └────────┬────────┘  └─────────────┘  │
│  │  - perf-opt     │           │                            │
│  └────────┬────────┘           │                            │
└───────────┼────────────────────┼────────────────────────────┘
            │                    │
     ┌──────┴──────┐      ┌──────┴──────┐
     │Model Mapping│      │   Prompt    │
     │   Layer     │      │ Translation │
     └──────┬──────┘      └──────┬──────┘
            │                    │
┌───────────┴────────────────────┴────────────────────────────┐
│  Claude │ OpenAI │ Ollama │ OpenRouter │ Gemini │ Azure │ Bedrock │
└─────────────────────────────────────────────────────────────┘
```

### Components

#### 1. HybridRouter Core
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
}
```

#### 2. Model ID Normalization
```typescript
// Bidirectional mapping
const MODEL_MAPPINGS = {
  'claude-sonnet-4.5': {
    anthropic: 'claude-sonnet-4-5-20250929',
    openrouter: 'anthropic/claude-sonnet-4.5',
    bedrock: 'anthropic.claude-sonnet-4-5-v2:0',
    canonical: 'Claude Sonnet 4.5'
  },
  'gpt-4o': {
    openai: 'gpt-4o',
    azure: 'gpt-4o',
    openrouter: 'openai/gpt-4o',
    canonical: 'GPT-4o'
  }
};

function mapModelId(modelId: string, targetProvider: ProviderType): string;
```

#### 3. Provider Interface Extension
```typescript
interface LLMProvider {
  // Existing (ADR-011)
  generate(params: GenerateParams): Promise<LLMResponse>;
  embed(texts: string[]): Promise<number[][]>;
  healthCheck(): Promise<boolean>;

  // New capability flags
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsMCP: boolean;

  // Capability validation
  validateCapabilities(features: string[]): boolean;
}
```

#### 4. Routing Rules
```typescript
interface RoutingRule {
  condition: {
    agentType?: string[];        // Route specific agent types
    requiresTools?: boolean;      // Route tool-using requests
    complexity?: 'low' | 'medium' | 'high';
    localOnly?: boolean;          // Force local ONNX provider
    requiresReasoning?: boolean;  // Route to advanced models
  };
  action: {
    provider: ProviderType;
    model: string;
    temperature?: number;
  };
}

// Example rules for QE agents
const QE_ROUTING_RULES: RoutingRule[] = [
  {
    condition: { agentType: ['security-auditor', 'v3-qe-security-scanner'] },
    action: { provider: 'anthropic', model: 'claude-opus-4' }
  },
  {
    condition: { agentType: ['v3-qe-test-generator'], requiresTools: true },
    action: { provider: 'anthropic', model: 'claude-sonnet-4' }
  },
  {
    condition: { complexity: 'low', localOnly: true },
    action: { provider: 'onnx', model: 'phi-4' }
  }
];
```

#### 5. Prompt Translation Layer
```typescript
interface PromptTranslator {
  // Convert Anthropic format to target provider
  translateMessages(messages: Message[], targetProvider: ProviderType): Message[];

  // Handle system prompt differences
  handleSystemPrompt(system: string, targetProvider: ProviderType): SystemConfig;

  // Translate tool schemas
  translateTools(tools: Tool[], targetProvider: ProviderType): Tool[];
}
```

### New Providers

| Provider | SDK | Key Features |
|----------|-----|--------------|
| **OpenRouter** | axios | 100+ models, unified API |
| **Gemini** | @google/genai | Gemini Pro/Ultra/Flash |
| **Azure OpenAI** | @azure/openai | Enterprise, Azure AD |
| **AWS Bedrock** | @aws-sdk/client-bedrock | IAM, Claude on AWS |
| **ONNX Local** | onnxruntime-node | Zero-cost, privacy |

---

## Rationale

### Why HybridRouter Pattern?

1. **Proven Architecture** - Battle-tested in agentic-flow with 7 providers
2. **Minimal Breaking Changes** - Extends ADR-011, doesn't replace it
3. **DDD Alignment** - Router is a domain service, not a new bounded context
4. **Incremental Adoption** - Providers can be added without changing consumers

### Why These Providers?

| Provider | Justification |
|----------|---------------|
| OpenRouter | Single API for 100+ models, cost aggregation |
| Gemini | Google ecosystem integration, long context |
| Azure OpenAI | Enterprise compliance (SOC2, HIPAA) |
| AWS Bedrock | AWS-native customers, IAM integration |
| ONNX Local | Zero cost, privacy, offline capability |

### Alternatives Considered

1. **LiteLLM Gateway** - Rejected: External dependency, deployment complexity
2. **Per-Provider Abstraction** - Rejected: Already exists in ADR-011, insufficient
3. **Full Router Rewrite** - Rejected: HybridRouter pattern extends, doesn't replace

---

## Implementation Plan

### Milestones (12 total)

| # | Milestone | Priority | Parallel Group |
|---|-----------|----------|----------------|
| M1 | OpenRouter Provider | P0 | A |
| M2 | Model ID Normalization | P0 | A |
| M3 | HybridRouter Core | P0 | A |
| M4 | Gemini Provider | P1 | B |
| M5 | Azure OpenAI Provider | P1 | B |
| M6 | AWS Bedrock Provider | P2 | B |
| M7 | Prompt Translation Layer | P1 | C |
| M8 | Smart Routing by Agent Type | P1 | C |
| M9 | Domain Coordinator Integration | P2 | C |
| M10 | CLI Integration | P1 | D |
| M11 | Metrics and Observability | P2 | D |
| M12 | Integration Testing | P1 | E |

### Parallel Execution Groups

```
Week 1-2: Group A (M1, M2, M3) - Foundation [PARALLEL]
Week 2-3: Group B (M4, M5, M6) - Providers [PARALLEL]
Week 3-4: Group C (M7, M8, M9) - Enhancement [PARALLEL]
Week 4-5: Group D (M10, M11) - Polish [PARALLEL]
Week 5-6: Group E (M12) - Finalization [SEQUENTIAL]
```

### Agent Assignments

| Agent | Role | Milestones |
|-------|------|------------|
| `coder` | Implementation | All |
| `system-architect` | Architecture | M3, M8, M9 |
| `v3-qe-test-architect` | Test Strategy | All |
| `security-auditor` | Security Review | M1, M5, M6 |
| `researcher` | Format Research | M2, M7 |
| `performance-engineer` | Metrics | M11 |

### File Structure

```
v3/src/shared/llm/
├── router/
│   ├── hybrid-router.ts       # NEW: Main router
│   ├── types.ts               # NEW: Router types
│   ├── routing-rules.ts       # NEW: Rule engine
│   └── index.ts               # NEW: Exports
├── translation/
│   ├── prompt-translator.ts   # NEW: Message translation
│   ├── tool-translator.ts     # NEW: Tool schema translation
│   └── index.ts               # NEW: Exports
├── model-mapping.ts           # NEW: Model ID normalization
├── model-registry.ts          # NEW: Model metadata
├── metrics/
│   ├── router-metrics.ts      # NEW: Routing metrics
│   └── cost-metrics.ts        # NEW: Cost tracking
├── providers/
│   ├── openrouter.ts          # NEW: OpenRouter
│   ├── gemini.ts              # NEW: Google Gemini
│   ├── azure-openai.ts        # NEW: Azure OpenAI
│   ├── bedrock.ts             # NEW: AWS Bedrock
│   ├── claude.ts              # EXISTING
│   ├── openai.ts              # EXISTING
│   └── ollama.ts              # EXISTING
├── interfaces.ts              # MODIFY: Add capability flags
├── provider-manager.ts        # MODIFY: Integrate router
└── index.ts                   # MODIFY: Export router
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Provider count | 7+ | Code review |
| Model ID mapping accuracy | 100% | Unit tests |
| Fallback success rate | >99% | Integration tests |
| Routing decision latency | <10ms | Benchmarks |
| Integration test coverage | >80% | Coverage report |
| Breaking changes | 0 | API compatibility tests |
| Cost reduction (estimate) | 30-50% | Production metrics |

---

## Risk Analysis

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Provider API changes | High | Medium | Version pinning, adapter pattern |
| Model deprecation | High | Low | Model registry with fallbacks |
| Rate limiting | Medium | High | Circuit breaker, request queuing |
| Prompt translation accuracy | Medium | Medium | Extensive test suite |
| Integration complexity | Medium | Medium | Modular design, incremental rollout |

---

## Consequences

### Positive
- Users can access 100+ models through OpenRouter
- Enterprise customers can use Azure/Bedrock
- 30-50% cost reduction through intelligent routing
- Zero code changes for existing integrations
- Privacy-sensitive operations via local ONNX

### Negative
- Additional complexity in routing layer
- More configuration options to manage
- Provider-specific testing requirements
- Potential for routing decision overhead

### Neutral
- Learning curve for routing configuration
- Need for model capability documentation

---

## Implementation Notes (2026-01-15)

### Verified Implementation

All 12 milestones completed and verified via brutal-honesty audit:

| Milestone | Status | Evidence |
|-----------|--------|----------|
| M1: OpenRouter Provider | ✅ | `src/shared/llm/providers/openrouter.ts` |
| M2: Model ID Normalization | ✅ | `src/shared/llm/model-mapping.ts` with bidirectional mapping |
| M3: HybridRouter Core | ✅ | `src/shared/llm/router/hybrid-router.ts` with 4 routing modes |
| M4: Gemini Provider | ✅ | `src/shared/llm/providers/gemini.ts` |
| M5: Azure OpenAI Provider | ✅ | `src/shared/llm/providers/azure-openai.ts` |
| M6: AWS Bedrock Provider | ✅ | `src/shared/llm/providers/bedrock.ts` with SigV4 signing |
| M7: Prompt Translation | ✅ | `src/shared/llm/translation/prompt-translator.ts` |
| M8: Smart Routing | ✅ | `src/shared/llm/router/routing-rules.ts` with agent-aware rules |
| M9: Domain Integration | ✅ | Router integrated with ProviderManager |
| M10: CLI Integration | ✅ | Provider commands in CLI |
| M11: Metrics | ✅ | `src/shared/llm/metrics/router-metrics.ts` |
| M12: Integration Tests | ✅ | MSW-based HTTP tests in `tests/integration/llm/` |

### Key Integration Points Verified

1. **ProviderManager.createProvider()** - All 7 providers instantiable (not dead code)
2. **HybridRouter exports** - Public exports from `src/shared/llm/index.ts`
3. **Config interfaces** - All 7 provider configs typed in `interfaces.ts`
4. **Model-mapping wiring** - `resolveModelIds()` method in HybridRouter
5. **Real integration tests** - 6 MSW tests intercepting actual HTTP requests

### Test Results

- Total tests: 4936 passing
- ADR-043 specific tests: All passing
- MSW integration tests: 6/6 passing

### Files Modified/Created

**New Files:**
- `src/shared/llm/router/hybrid-router.ts` - 850 LOC
- `src/shared/llm/router/routing-rules.ts` - 200 LOC
- `src/shared/llm/router/types.ts` - 150 LOC
- `src/shared/llm/model-mapping.ts` - 300 LOC
- `src/shared/llm/model-registry.ts` - 250 LOC
- `src/shared/llm/providers/openrouter.ts` - 200 LOC
- `src/shared/llm/providers/gemini.ts` - 180 LOC
- `src/shared/llm/providers/azure-openai.ts` - 220 LOC
- `src/shared/llm/providers/bedrock.ts` - 350 LOC (includes SigV4)
- `src/shared/llm/translation/prompt-translator.ts` - 150 LOC
- `tests/integration/llm/real-provider-integration.test.ts` - 295 LOC

**Modified Files:**
- `src/shared/llm/provider-manager.ts` - Added all 7 providers to factory
- `src/shared/llm/interfaces.ts` - Added provider config interfaces
- `src/shared/llm/index.ts` - Added HybridRouter and provider exports

---

## References

- [ADR-011: LLM Provider System for QE](./v3-adrs.md#adr-011-llm-provider-system-for-qe)
- [agentic-flow HybridRouter](https://github.com/ruvnet/agentic-flow/tree/main/agentic-flow/src/router)
- [GOAP Implementation Plan](../plans/GOAP-ADR-043-VENDOR-INDEPENDENT-LLM.md)

---

*Created: 2026-01-13*
*Implemented: 2026-01-15*
*Authors: Architecture Team with AI Swarm Analysis*
