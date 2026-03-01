# Goal-Oriented Action Plan (GOAP): ADR-043 Vendor-Independent LLM Support

**Project:** Agentic QE v3
**Date:** 2026-01-13
**Status:** Planning
**Priority:** P1 (High)
**Estimated Effort:** 8-12 sprints (4-6 weeks)

---

## Executive Summary

This GOAP defines the implementation strategy for vendor-independent LLM support in Agentic QE v3, enabling seamless switching between LLM providers while maintaining consistent QE functionality. The plan leverages patterns from agentic-flow's HybridRouter and adapts them for the DDD-based v3 architecture.

---

## 1. Goal State Definition

### What Vendor Independence Looks Like When Complete

**Primary Goals:**
- **7+ LLM providers supported**: Claude, OpenAI, Ollama, OpenRouter, Gemini, Azure OpenAI, AWS Bedrock
- **Unified interface**: All providers accessed through a single HybridRouter abstraction
- **Smart routing**: Agent-type aware routing with cost/performance/capability optimization
- **Zero code changes for consumers**: Domain coordinators and MCP tools work identically regardless of provider
- **Model ID normalization**: Transparent translation between provider-specific model formats
- **Fallback chains**: Automatic failover when providers are unavailable
- **Prompt translation**: Provider-specific prompt formatting handled transparently

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Provider coverage | 7+ providers |
| Model ID mapping accuracy | 100% |
| Fallback success rate | >99% |
| Routing decision latency | <10ms |
| Integration test coverage | >80% |
| Zero breaking changes | Yes |

---

## 2. Current State Assessment

### What Exists Today in v3

**Implemented (ADR-011):**
```
v3/src/shared/llm/
├── interfaces.ts          # 630 lines - Core types (LLMProvider, LLMResponse, etc.)
├── provider-manager.ts    # 685 lines - Load balancing, failover, circuit breaker
├── circuit-breaker.ts     # Circuit breaker for resilience
├── cache.ts               # LRU response caching
├── cost-tracker.ts        # Cost tracking with alerts
├── index.ts               # Public exports
└── providers/
    ├── claude.ts          # Anthropic Claude provider
    ├── openai.ts          # OpenAI GPT provider
    └── ollama.ts          # Local Ollama provider
```

**Strengths:**
- Solid foundation with LLMProvider interface
- Circuit breaker and cost tracking infrastructure
- 4 load balancing strategies (round-robin, least-cost, least-latency, random)
- Provider failover chain support

**Gaps:**
| Gap | Impact | Priority |
|-----|--------|----------|
| No OpenRouter provider | Cannot access 100+ models | P0 |
| No model ID mapping | Provider switching requires code changes | P0 |
| No smart routing by agent type | Suboptimal model selection | P1 |
| No Gemini provider | Missing Google AI ecosystem | P1 |
| No Azure OpenAI provider | Enterprise customers blocked | P1 |
| No AWS Bedrock provider | AWS customers blocked | P2 |
| No prompt translation layer | Provider-specific prompts leak to consumers | P1 |
| Domain coordinators don't use LLM directly | Limited AI capabilities | P2 |

---

## 3. Milestone Breakdown

### Milestone 1: OpenRouter Provider Implementation
**Priority:** P0 (Critical Path)
**Complexity:** M
**Dependencies:** None

**Description:**
Implement OpenRouter provider to unlock access to 100+ models including Claude, GPT-4, Llama, Mistral, and more through a single API.

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/providers/openrouter.ts` (~250 lines)
- MODIFY: `v3/src/shared/llm/interfaces.ts` (add OpenRouterConfig)
- MODIFY: `v3/src/shared/llm/provider-manager.ts` (register OpenRouter)
- MODIFY: `v3/src/shared/llm/providers/index.ts` (export OpenRouter)
- CREATE: `v3/tests/unit/shared/llm/providers/openrouter.test.ts`

**Assigned Agents:**
- `v3-qe-test-architect` (test strategy)
- `coder` (implementation)
- `security-auditor` (API key handling)

**Success Criteria:**
- [ ] OpenRouter provider implements LLMProvider interface
- [ ] Supports streaming, tools, and standard chat
- [ ] API key configuration via environment variable
- [ ] Cost calculation for OpenRouter pricing
- [ ] 15+ unit tests passing

**Can Run in Parallel With:** M2, M3

---

### Milestone 2: Model ID Normalization Layer
**Priority:** P0 (Critical Path)
**Complexity:** M
**Dependencies:** None

**Description:**
Implement bidirectional model ID mapping to translate between provider-specific formats (e.g., `claude-sonnet-4-20250514` vs `anthropic/claude-sonnet-4`).

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/model-mapping.ts` (~200 lines)
- CREATE: `v3/src/shared/llm/model-registry.ts` (~300 lines)
- CREATE: `v3/tests/unit/shared/llm/model-mapping.test.ts`
- CREATE: `v3/tests/unit/shared/llm/model-registry.test.ts`

**Assigned Agents:**
- `v3-qe-test-architect` (test strategy)
- `coder` (implementation)
- `researcher` (model ID formats research)

**Success Criteria:**
- [ ] Bidirectional mapping for Claude, OpenAI, Gemini models
- [ ] Model registry with capability metadata (context length, features)
- [ ] Canonical model names for human readability
- [ ] 20+ unit tests covering edge cases
- [ ] No breaking changes to existing provider usage

**Can Run in Parallel With:** M1, M3

---

### Milestone 3: HybridRouter Core Implementation
**Priority:** P0 (Critical Path)
**Complexity:** L
**Dependencies:** None

**Description:**
Create the HybridRouter class that provides intelligent provider selection based on routing mode, agent type, and model capabilities.

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/router/hybrid-router.ts` (~400 lines)
- CREATE: `v3/src/shared/llm/router/types.ts` (~150 lines)
- CREATE: `v3/src/shared/llm/router/routing-rules.ts` (~200 lines)
- CREATE: `v3/src/shared/llm/router/index.ts`
- CREATE: `v3/tests/unit/shared/llm/router/hybrid-router.test.ts`
- CREATE: `v3/tests/unit/shared/llm/router/routing-rules.test.ts`

**Assigned Agents:**
- `system-architect` (architecture design)
- `v3-qe-test-architect` (test strategy)
- `coder` (implementation)

**Success Criteria:**
- [ ] 4 routing modes: manual, rule-based, cost-optimized, performance-optimized
- [ ] Agent-type aware routing with configurable rules
- [ ] Fallback chain support with automatic failover
- [ ] Metrics collection for routing decisions
- [ ] 30+ unit tests passing

**Can Run in Parallel With:** M1, M2

---

### Milestone 4: Gemini Provider Implementation
**Priority:** P1
**Complexity:** M
**Dependencies:** M1, M2

**Description:**
Implement Google Gemini provider for access to Gemini Pro, Gemini Ultra, and Gemini Flash models.

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/providers/gemini.ts` (~250 lines)
- MODIFY: `v3/src/shared/llm/interfaces.ts` (add GeminiConfig)
- MODIFY: `v3/src/shared/llm/provider-manager.ts` (register Gemini)
- MODIFY: `v3/src/shared/llm/model-mapping.ts` (add Gemini mappings)
- CREATE: `v3/tests/unit/shared/llm/providers/gemini.test.ts`

**Assigned Agents:**
- `coder` (implementation)
- `v3-qe-test-architect` (test strategy)

**Success Criteria:**
- [ ] Gemini provider implements LLMProvider interface
- [ ] Supports Gemini Pro, Ultra, Flash models
- [ ] Tool calling support via Gemini function calling
- [ ] 15+ unit tests passing

**Can Run in Parallel With:** M5, M6

---

### Milestone 5: Azure OpenAI Provider Implementation
**Priority:** P1
**Complexity:** M
**Dependencies:** M1, M2

**Description:**
Implement Azure OpenAI provider for enterprise customers using Azure-hosted OpenAI models.

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/providers/azure-openai.ts` (~280 lines)
- MODIFY: `v3/src/shared/llm/interfaces.ts` (add AzureOpenAIConfig)
- MODIFY: `v3/src/shared/llm/provider-manager.ts` (register Azure OpenAI)
- MODIFY: `v3/src/shared/llm/model-mapping.ts` (add Azure mappings)
- CREATE: `v3/tests/unit/shared/llm/providers/azure-openai.test.ts`

**Assigned Agents:**
- `coder` (implementation)
- `v3-qe-test-architect` (test strategy)
- `security-auditor` (Azure AD integration)

**Success Criteria:**
- [ ] Azure OpenAI provider implements LLMProvider interface
- [ ] Azure AD token authentication support
- [ ] Deployment-based model selection
- [ ] 15+ unit tests passing

**Can Run in Parallel With:** M4, M6

---

### Milestone 6: AWS Bedrock Provider Implementation
**Priority:** P2
**Complexity:** M
**Dependencies:** M1, M2

**Description:**
Implement AWS Bedrock provider for Claude and other models via AWS infrastructure.

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/providers/bedrock.ts` (~300 lines)
- MODIFY: `v3/src/shared/llm/interfaces.ts` (add BedrockConfig)
- MODIFY: `v3/src/shared/llm/provider-manager.ts` (register Bedrock)
- MODIFY: `v3/src/shared/llm/model-mapping.ts` (add Bedrock ARN mappings)
- CREATE: `v3/tests/unit/shared/llm/providers/bedrock.test.ts`

**Assigned Agents:**
- `coder` (implementation)
- `v3-qe-test-architect` (test strategy)
- `security-auditor` (AWS IAM integration)

**Success Criteria:**
- [ ] Bedrock provider implements LLMProvider interface
- [ ] AWS credential chain support (IAM, STS, profile)
- [ ] ARN-style model ID mapping
- [ ] 15+ unit tests passing

**Can Run in Parallel With:** M4, M5

---

### Milestone 7: Prompt Translation Layer
**Priority:** P1
**Complexity:** M
**Dependencies:** M3

**Description:**
Create a prompt translation layer that adapts prompts for provider-specific requirements (system prompt handling, message format, tool schema).

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/translation/prompt-translator.ts` (~250 lines)
- CREATE: `v3/src/shared/llm/translation/tool-translator.ts` (~200 lines)
- CREATE: `v3/src/shared/llm/translation/message-formatter.ts` (~150 lines)
- CREATE: `v3/src/shared/llm/translation/index.ts`
- CREATE: `v3/tests/unit/shared/llm/translation/prompt-translator.test.ts`
- CREATE: `v3/tests/unit/shared/llm/translation/tool-translator.test.ts`

**Assigned Agents:**
- `coder` (implementation)
- `v3-qe-test-architect` (test strategy)
- `researcher` (prompt format research)

**Success Criteria:**
- [ ] Anthropic <-> OpenAI message format translation
- [ ] Tool schema translation between formats
- [ ] System prompt handling per provider requirements
- [ ] 25+ unit tests passing

**Can Run in Parallel With:** M4, M5, M6

---

### Milestone 8: Smart Routing by Agent Type
**Priority:** P1
**Complexity:** M
**Dependencies:** M3, M7

**Description:**
Implement intelligent routing rules that select optimal provider/model based on QE agent type (e.g., security agents use Claude Opus, test generators use Sonnet).

**Files to Create/Modify:**
- MODIFY: `v3/src/shared/llm/router/routing-rules.ts` (add agent-aware rules)
- CREATE: `v3/src/shared/llm/router/agent-router-config.ts` (~200 lines)
- MODIFY: `v3/src/routing/qe-agent-registry.ts` (add preferred model hints)
- CREATE: `v3/tests/unit/shared/llm/router/agent-routing.test.ts`
- CREATE: `v3/tests/integration/llm/agent-routing.test.ts`

**Assigned Agents:**
- `system-architect` (routing strategy)
- `coder` (implementation)
- `v3-qe-test-architect` (test strategy)

**Success Criteria:**
- [ ] Agent-type to model mapping configuration
- [ ] Capability-based routing (reasoning, tools, cost)
- [ ] Override mechanism for specific tasks
- [ ] 20+ unit tests, 10+ integration tests

**Can Run in Parallel With:** M9

---

### Milestone 9: Domain Coordinator LLM Integration
**Priority:** P2
**Complexity:** M
**Dependencies:** M3, M8

**Description:**
Enable domain coordinators to make direct LLM calls through the HybridRouter for AI-enhanced domain operations.

**Files to Create/Modify:**
- MODIFY: `v3/src/domains/test-generation/coordinator.ts` (add LLM integration)
- MODIFY: `v3/src/domains/defect-intelligence/coordinator.ts` (add LLM integration)
- MODIFY: `v3/src/domains/quality-assessment/coordinator.ts` (add LLM integration)
- CREATE: `v3/src/domains/shared/llm-coordinator-mixin.ts` (~150 lines)
- CREATE: `v3/tests/integration/domains/llm-integration.test.ts`

**Assigned Agents:**
- `system-architect` (integration design)
- `coder` (implementation)
- `v3-qe-test-architect` (test strategy)

**Success Criteria:**
- [ ] Test generation uses LLM for AI-powered test creation
- [ ] Defect intelligence uses LLM for root cause analysis
- [ ] Quality assessment uses LLM for deployment risk evaluation
- [ ] 15+ integration tests passing

**Can Run in Parallel With:** M8

---

### Milestone 10: Configuration and CLI Integration
**Priority:** P1
**Complexity:** S
**Dependencies:** M3, M8

**Description:**
Add CLI commands and configuration options for router management, provider selection, and model preferences.

**Files to Create/Modify:**
- CREATE: `v3/src/cli/commands/llm-router.ts` (~200 lines)
- MODIFY: `v3/src/config/llm-config.ts` (add router config)
- CREATE: `config/router.config.example.json` (~100 lines)
- CREATE: `v3/tests/unit/cli/commands/llm-router.test.ts`

**Assigned Agents:**
- `coder` (implementation)
- `v3-qe-test-architect` (test strategy)

**Success Criteria:**
- [ ] `aqe-v3 llm providers` - list available providers
- [ ] `aqe-v3 llm route` - test routing decisions
- [ ] `aqe-v3 llm config` - manage router configuration
- [ ] 10+ unit tests passing

**Can Run in Parallel With:** M11

---

### Milestone 11: Metrics and Observability
**Priority:** P2
**Complexity:** S
**Dependencies:** M3

**Description:**
Add comprehensive metrics and observability for LLM routing decisions, costs, and performance.

**Files to Create/Modify:**
- CREATE: `v3/src/shared/llm/metrics/router-metrics.ts` (~200 lines)
- CREATE: `v3/src/shared/llm/metrics/cost-metrics.ts` (~150 lines)
- MODIFY: `v3/src/shared/llm/router/hybrid-router.ts` (add metrics hooks)
- CREATE: `v3/tests/unit/shared/llm/metrics/router-metrics.test.ts`

**Assigned Agents:**
- `performance-engineer` (metrics design)
- `coder` (implementation)

**Success Criteria:**
- [ ] Per-provider latency, cost, and token metrics
- [ ] Routing decision audit log
- [ ] Cost breakdown by agent type
- [ ] 10+ unit tests passing

**Can Run in Parallel With:** M10

---

### Milestone 12: Integration Testing and Documentation
**Priority:** P1
**Complexity:** M
**Dependencies:** M1-M11

**Description:**
Comprehensive integration testing across all providers and documentation for ADR-043.

**Files to Create/Modify:**
- CREATE: `v3/tests/integration/llm/multi-provider.test.ts`
- CREATE: `v3/tests/integration/llm/routing-scenarios.test.ts`
- CREATE: `v3/tests/integration/llm/failover.test.ts`
- MODIFY: `v3/implementation/adrs/v3-adrs.md` (add ADR-043)
- CREATE: `v3/docs/llm-router-guide.md`

**Assigned Agents:**
- `v3-qe-test-architect` (test design)
- `tester` (test implementation)
- `researcher` (documentation)

**Success Criteria:**
- [ ] 50+ integration tests covering all providers
- [ ] Failover scenario tests passing
- [ ] ADR-043 documented and approved
- [ ] User guide complete

**Can Run in Parallel With:** None (final milestone)

---

## 4. Parallel Execution Groups

### Group A: Foundation (Week 1-2)
**Run in Parallel:**
- M1: OpenRouter Provider
- M2: Model ID Normalization
- M3: HybridRouter Core

**No Conflicts:** Different files, independent implementations.

### Group B: Additional Providers (Week 2-3)
**Run in Parallel:**
- M4: Gemini Provider
- M5: Azure OpenAI Provider
- M6: AWS Bedrock Provider

**No Conflicts:** Each provider in separate file, share only interfaces.

### Group C: Enhancement Layer (Week 3-4)
**Run in Parallel:**
- M7: Prompt Translation
- M8: Smart Routing by Agent Type
- M9: Domain Coordinator Integration

**Minimal Conflicts:** M8 and M9 both touch `routing-rules.ts` - coordinate via PR.

### Group D: Polish (Week 4-5)
**Run in Parallel:**
- M10: CLI Integration
- M11: Metrics and Observability

**No Conflicts:** Different subsystems.

### Group E: Finalization (Week 5-6)
**Sequential:**
- M12: Integration Testing and Documentation

---

## 5. Risk Analysis

### High Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Provider API changes | High | Medium | Version pinning, adapter pattern |
| Model deprecation | High | Low | Model registry with fallbacks |
| Rate limiting across providers | Medium | High | Circuit breaker, request queuing |

### Medium Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Prompt translation accuracy | Medium | Medium | Extensive test suite, human review |
| Cost tracking accuracy | Medium | Low | Cross-validate with provider billing |
| Integration complexity | Medium | Medium | Modular design, incremental rollout |

### Low Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Performance overhead | Low | Low | Caching, lazy provider initialization |
| Configuration complexity | Low | Medium | Sensible defaults, validation |

---

## 6. ADR-043 Summary Draft

```markdown
## ADR-043: Vendor-Independent LLM Support

**Status:** Proposed
**Date:** 2026-01-13

### Context

Agentic QE v3 currently supports 3 LLM providers (Claude, OpenAI, Ollama) via ADR-011.
Users need:
- Access to more models (OpenRouter's 100+ models, Gemini, Azure, Bedrock)
- Intelligent routing based on task requirements and agent type
- Seamless provider switching without code changes
- Cost optimization across providers

### Decision

Implement a HybridRouter pattern with:
1. **7+ providers**: Claude, OpenAI, Ollama, OpenRouter, Gemini, Azure OpenAI, AWS Bedrock
2. **Model ID normalization**: Bidirectional mapping between provider formats
3. **4 routing modes**: Manual, rule-based, cost-optimized, performance-optimized
4. **Prompt translation**: Provider-specific formatting handled transparently
5. **Agent-aware routing**: Optimal model selection per QE agent type

### Rationale

- OpenRouter unlocks 100+ models with single API key
- Enterprise customers require Azure/Bedrock for compliance
- Intelligent routing reduces costs by 30-50% (preliminary estimates)
- Unified interface maintains DDD principles

### Implementation

12 milestones across 5-6 weeks, detailed in GOAP document.

### Success Metrics

- 7+ LLM providers supported
- <10ms routing decision latency
- >99% fallback success rate
- Zero breaking changes to existing code
- >80% integration test coverage
```

---

## 7. Agent Assignment Summary

| Milestone | Primary Agents | Supporting Agents |
|-----------|---------------|-------------------|
| M1 | coder, v3-qe-test-architect | security-auditor |
| M2 | coder, researcher | v3-qe-test-architect |
| M3 | system-architect, coder | v3-qe-test-architect |
| M4 | coder | v3-qe-test-architect |
| M5 | coder, security-auditor | v3-qe-test-architect |
| M6 | coder, security-auditor | v3-qe-test-architect |
| M7 | coder, researcher | v3-qe-test-architect |
| M8 | system-architect, coder | v3-qe-test-architect |
| M9 | system-architect, coder | v3-qe-test-architect |
| M10 | coder | v3-qe-test-architect |
| M11 | performance-engineer, coder | - |
| M12 | v3-qe-test-architect, tester, researcher | - |

---

## 8. Dependency Graph

```
         M1 (OpenRouter)
              │
              ├──────────────┐
              │              │
         M2 (Model ID)       │
              │              │
              ├──────┐       │
              │      │       │
         M3 (Router) │       │
              │      │       │
    ┌─────────┼──────┼───────┤
    │         │      │       │
   M4        M5     M6      M7 (Prompt)
  (Gemini) (Azure) (Bedrock)  │
    │         │      │        │
    └─────────┼──────┼────────┘
              │      │
             M8 (Smart Routing)
              │
              ├──────────────┐
              │              │
             M9          M10, M11
         (Domains)    (CLI, Metrics)
              │              │
              └──────┬───────┘
                     │
                    M12
              (Integration Tests)
```

---

## 9. Execution Timeline

| Week | Milestones | Focus |
|------|------------|-------|
| 1 | M1, M2, M3 | Foundation |
| 2 | M1, M2, M3 (complete), M4, M5, M6 (start) | Providers |
| 3 | M4, M5, M6 (complete), M7, M8 (start) | Enhancement |
| 4 | M7, M8 (complete), M9, M10, M11 (start) | Integration |
| 5 | M9, M10, M11 (complete), M12 (start) | Polish |
| 6 | M12 (complete) | Finalization |

---

## 10. Next Steps

1. **Approve GOAP**: Review with architecture team
2. **Create ADR-043**: Formal decision record
3. **Spawn Swarm**: Initialize Group A milestones in parallel
4. **Track Progress**: Use MCP memory for milestone status

---

*Generated by GOAP Specialist Agent*
*Last Updated: 2026-01-13*
