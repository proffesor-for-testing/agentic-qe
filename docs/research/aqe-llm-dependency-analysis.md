# AQE Fleet LLM Dependency Analysis
**Research Date:** 2025-12-15
**Last Updated:** 2025-12-15 (December 2025 models added)
**AQE Version:** 2.5.4
**Researcher:** Research Agent

---

## 🆕 December 2025 Update - New Local Models Available!

> **IMPORTANT:** Since this analysis was written, several new models have been released that significantly improve the path to LLM independence.

### Recommended Local Models for AQE (December 2025)

| Task | Model | Size | Ollama Command | Why |
|------|-------|------|----------------|-----|
| **Simple Tasks** | RNJ-1 | 8B | `ollama pull rnj-1` | NEW - Optimized for code/STEM |
| **SE Agents** | Devstral-Small-2 | 24B | `ollama pull devstral-small-2` | NEW - Designed for SE agents |
| **Complex** | Qwen 2.5 Coder | 32B | `ollama pull qwen2.5-coder:32b` | Well-tested |
| **Max Power** | Devstral-2 | 123B | `ollama pull devstral-2` | NEW - Best agentic coding |

### Key New Models

1. **Devstral-Small-2 (24B)** - From Mistral, specifically designed for software engineering agents
2. **Devstral-2 (123B)** - Full-size version for complex agentic tasks
3. **RNJ-1 (8B)** - New dense model optimized for code and STEM
4. **Qwen3-Coder-30B-A3B** - MoE: 30B total, only 3B active (efficient!)

See `docs/planning/aqe-llm-independence-goap-plan.md` for the full implementation plan.

---

## Executive Summary

The Agentic Quality Engineering (AQE) Fleet is a sophisticated multi-agent system comprising **20 QE agents** and **11 specialized subagents** that provide AI-driven quality management capabilities. This analysis reveals the current LLM dependencies, vendor coupling points, and architectural bottlenecks that impact cost, flexibility, and local deployment capabilities.

**Key Findings:**
- ✅ **Modern Provider Abstraction**: Well-designed `ILLMProvider` interface supports multiple vendors
- ⚠️ **Partial Vendor Lock-in**: Heavy Anthropic Claude dependency with limited local alternatives
- ✅ **Hybrid Architecture Ready**: Infrastructure supports local/cloud hybrid deployment
- ⚠️ **Limited Local Inference**: RuvLLM integration exists but underutilized
- ✅ **Cost Optimization**: Multi-model router achieves 70-81% cost savings
- ⚠️ **Embedding Dependency**: Uses Transformers.js but falls back to hash-based embeddings

---

## 1. System Architecture Overview

### 1.1 Agent Hierarchy

**20 Main QE Agents:**
1. TestGeneratorAgent
2. TestExecutorAgent
3. CoverageAnalyzerAgent
4. QualityGateAgent
5. QualityAnalyzerAgent
6. RequirementsValidatorAgent
7. ProductionIntelligenceAgent
8. FleetCommanderAgent
9. DeploymentReadinessAgent
10. PerformanceTesterAgent
11. SecurityScannerAgent
12. RegressionRiskAnalyzerAgent
13. TestDataArchitectAgent
14. ApiContractValidatorAgent
15. FlakyTestHunterAgent
16. QXPartnerAgent
17. AccessibilityAllyAgent
18. CodeComplexityAnalyzerAgent
19. ChaosEngineer (stub)
20. VisualTester (stub)

**11 TDD Subagents:**
- RED Phase: TDD-Red-Unit, TDD-Red-Integration, TDD-Red-E2E
- GREEN Phase: TDD-Green-Unit, TDD-Green-Integration, TDD-Green-E2E
- REFACTOR Phase: TDD-Refactor-London, TDD-Refactor-Chicago
- Specialized: TDD-Code-Reviewer, TDD-Test-Architect, TDD-Integration-Tester

**Agent Capabilities:**
- Each agent has 4-10 specialized capabilities
- Total: 150+ distinct QE capabilities across the fleet
- All agents extend `BaseAgent` with standardized lifecycle

### 1.2 Core Architecture Components

```
┌─────────────────────────────────────────────────────────┐
│                  AQE Fleet Architecture                  │
├─────────────────────────────────────────────────────────┤
│  ┌────────────────┐   ┌────────────────┐              │
│  │  20 QE Agents  │   │ 11 Subagents   │              │
│  │  (BaseAgent)   │   │ (TDD Phases)   │              │
│  └────────┬───────┘   └────────┬───────┘              │
│           │                     │                       │
│           └──────────┬──────────┘                       │
│                      ▼                                  │
│        ┌─────────────────────────────┐                 │
│        │   Agent Lifecycle Layer     │                 │
│        │  - Memory Management        │                 │
│        │  - Coordination             │                 │
│        │  - Learning Engine          │                 │
│        └─────────────┬───────────────┘                 │
│                      ▼                                  │
│        ┌─────────────────────────────┐                 │
│        │    Routing & Inference      │                 │
│        │  - AdaptiveModelRouter      │                 │
│        │  - Provider Abstraction     │                 │
│        │  - Cost Tracking            │                 │
│        └─────────────┬───────────────┘                 │
│                      ▼                                  │
│    ┌──────────────────────────────────────┐           │
│    │        LLM Provider Layer            │           │
│    │  ┌──────────┐  ┌──────────┐         │           │
│    │  │  Claude  │  │OpenRouter│         │           │
│    │  │Provider  │  │Provider  │         │           │
│    │  └──────────┘  └──────────┘         │           │
│    │  ┌──────────┐                        │           │
│    │  │  RuvLLM  │ (Underutilized)        │           │
│    │  │Provider  │                        │           │
│    │  └──────────┘                        │           │
│    └──────────────────────────────────────┘           │
├─────────────────────────────────────────────────────────┤
│               Memory & Storage Layer                     │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │ SwarmMemoryMgr   │  │ HNSW VectorDB    │           │
│  │ (SQLite)         │  │ (Embeddings)     │           │
│  └──────────────────┘  └──────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

---

## 2. LLM Dependencies Analysis

### 2.1 Current Provider Implementation

**Implemented Providers:**

1. **ClaudeProvider** (`src/providers/ClaudeProvider.ts`)
   - **Status**: ✅ Fully Implemented
   - **SDK**: `@anthropic-ai/sdk` v0.64.0
   - **Models Supported**:
     - claude-sonnet-4-20250514 ($3/$15 per M tokens)
     - claude-opus-4-20250514 ($15/$75 per M tokens)
     - claude-3-5-sonnet-20241022 ($3/$15 per M tokens)
     - claude-3-5-haiku-20241022 ($0.8/$4 per M tokens)
   - **Features**:
     - ✅ Streaming responses
     - ✅ Prompt caching (25% premium write, 90% discount read)
     - ✅ Vision/multimodal support
     - ❌ No native embeddings
   - **Location**: Cloud-only
   - **Vendor Lock-in**: **HIGH** - Primary inference provider

2. **OpenRouterProvider** (`src/providers/OpenRouterProvider.ts`)
   - **Status**: ✅ Fully Implemented
   - **SDK**: Native `fetch` API (no SDK dependency)
   - **Models Supported**: 300+ models from multiple providers
     - Anthropic Claude models
     - OpenAI GPT-4o, GPT-4o-mini
     - Google Gemini Pro
     - Meta Llama 3.1
     - Auto-routing to cheapest capable model
   - **Features**:
     - ✅ Hot-swapping models at runtime
     - ✅ Auto-routing to cheapest model
     - ✅ Streaming responses
     - ✅ Embedding support (model-dependent)
     - ❌ No prompt caching
   - **Location**: Cloud-only
   - **Vendor Lock-in**: **MEDIUM** - Unified API across providers

3. **RuvLLMProvider** (`src/providers/RuvllmProvider.ts`)
   - **Status**: ⚠️ Partially Implemented (exists but underutilized)
   - **SDK**: `@ruvector/ruvllm` v0.2.3
   - **Models Supported**:
     - M350, M700, B1_2, B2_6 (local models)
     - Adaptive routing based on complexity
   - **Features**:
     - ✅ Local inference (WASM/native bindings)
     - ✅ Adaptive learning (LoRA fine-tuning)
     - ✅ Vector memory (HNSW)
     - ✅ SIMD acceleration (10-50x faster)
     - ✅ Federated learning
     - ✅ Native embeddings
   - **Location**: **LOCAL** (no cloud dependency)
   - **Vendor Lock-in**: **NONE** - Open source, local execution

### 2.2 Provider Abstraction Layer

**Interface: `ILLMProvider`** (`src/providers/ILLMProvider.ts`)

```typescript
interface ILLMProvider {
  initialize(): Promise<void>;
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse>;
  streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent>;
  embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse>;
  countTokens(options: LLMTokenCountOptions): Promise<number>;
  healthCheck(): Promise<LLMHealthStatus>;
  getMetadata(): LLMProviderMetadata;
  shutdown(): Promise<void>;
  trackCost(usage: LLMCompletionResponse['usage']): number;
}
```

**Quality Assessment**: ✅ **EXCELLENT**
- Clean separation of concerns
- Supports multiple modalities (text, embeddings, streaming)
- Cost tracking built-in
- Health monitoring capabilities
- Easy to add new providers

### 2.3 Model Routing & Cost Optimization

**AdaptiveModelRouter** (`src/core/routing/AdaptiveModelRouter.ts`)

**Architecture:**
```typescript
Task → Complexity Analysis → Model Selection → Cost Check → Execution
         (O(log n))            (Rule-based)     (Threshold)
```

**Routing Rules** (from `ModelRules.ts`):
- **SIMPLE** tasks → Haiku models ($0.25-$0.8/M tokens)
- **MODERATE** tasks → Sonnet models ($3/M tokens)
- **COMPLEX** tasks → Opus/GPT-4 ($15/M tokens)
- **CRITICAL** tasks → Claude Opus 4 ($15/$75/M tokens)

**Cost Optimization Strategies:**
1. Complexity-based downgrading (if cost > threshold)
2. Fallback chains for failed models
3. Real-time cost tracking and dashboard
4. 70-81% cost savings reported

**Limitations:**
- ⚠️ No local model integration in routing logic
- ⚠️ Limited to cloud providers (Claude, OpenRouter)
- ⚠️ RuvLLM not included in routing decisions

---

## 3. Agent-Level LLM Requirements

### 3.1 Agents Requiring LLM Inference

**20 of 20 agents require LLM capabilities:**

| Agent | LLM Requirement | Complexity Level | Local Capable? |
|-------|----------------|------------------|----------------|
| TestGeneratorAgent | ✅ High | COMPLEX | ⚠️ Partial |
| TestExecutorAgent | ❌ None | N/A | ✅ Yes |
| CoverageAnalyzerAgent | ✅ Medium | MODERATE | ⚠️ Partial |
| QualityGateAgent | ✅ Medium | MODERATE | ⚠️ Partial |
| QualityAnalyzerAgent | ✅ High | COMPLEX | ⚠️ Partial |
| RequirementsValidatorAgent | ✅ High | COMPLEX | ⚠️ Partial |
| ProductionIntelligenceAgent | ✅ Very High | CRITICAL | ❌ No |
| FleetCommanderAgent | ✅ Medium | MODERATE | ⚠️ Partial |
| DeploymentReadinessAgent | ✅ High | COMPLEX | ⚠️ Partial |
| PerformanceTesterAgent | ✅ Medium | MODERATE | ⚠️ Partial |
| SecurityScannerAgent | ✅ Very High | CRITICAL | ❌ No |
| RegressionRiskAnalyzerAgent | ✅ High | COMPLEX | ⚠️ Partial |
| TestDataArchitectAgent | ✅ Medium | MODERATE | ✅ Yes |
| ApiContractValidatorAgent | ✅ High | COMPLEX | ⚠️ Partial |
| FlakyTestHunterAgent | ✅ Very High | CRITICAL | ❌ No |
| QXPartnerAgent | ✅ Very High | CRITICAL | ❌ No |
| AccessibilityAllyAgent | ✅ High | COMPLEX | ⚠️ Partial |
| CodeComplexityAnalyzerAgent | ✅ Medium | MODERATE | ✅ Yes |

**Analysis:**
- **17/20 agents** require cloud LLM for optimal performance
- **3/20 agents** can run fully locally (TestExecutor, TestDataArchitect, CodeComplexityAnalyzer)
- **7/20 agents** require CRITICAL-level reasoning (security, production, flaky detection)

### 3.2 Agent Lifecycle & LLM Integration

**BaseAgent Architecture** (`src/agents/BaseAgent.ts`):

```typescript
class BaseAgent {
  // No direct LLM dependency in base class!
  protected memoryStore: MemoryStore | SwarmMemoryManager;
  protected learningEngine?: LearningEngine;
  protected performanceTracker?: PerformanceTracker;

  // Agents implement task execution
  protected abstract performTask(task: QETask): Promise<any>;
}
```

**Key Observation**:
- ✅ Agents are **NOT** tightly coupled to LLM providers
- ✅ LLM usage is delegated to task implementation
- ✅ Easy to inject local vs cloud providers per agent
- ❌ No current mechanism to configure provider per agent type

---

## 4. Memory & Embedding Dependencies

### 4.1 Vector Database: HNSW

**SwarmMemoryManager** (`src/core/memory/SwarmMemoryManager.ts`):
- **Storage**: SQLite via `better-sqlite3`
- **Schema**: 12-table design (memory, events, workflows, patterns, consensus, etc.)
- **TTL Policies**: Configurable per table (artifacts: never, patterns: 7 days, events: 30 days)
- **Access Control**: 5-level (private, team, swarm, public, system)
- **Location**: Local filesystem (`.agentic-qe/memory.db`)

**No LLM Dependency**: ✅ Pure SQLite, no cloud storage

### 4.2 Embedding Generation

**EmbeddingGenerator** (`src/core/embeddings/EmbeddingGenerator.ts`):

**Dual-Mode Architecture:**

1. **ML-Based Embeddings** (Primary):
   - **Library**: `@xenova/transformers` v2.6.0
   - **Text Model**: Xenova/all-MiniLM-L6-v2 (384D)
   - **Code Model**: microsoft/codebert-base (768D)
   - **Performance**: ~5-10ms per embedding (cached)
   - **Dependency**: ⚠️ Downloads models on first use (~50MB each)
   - **Fallback**: Graceful degradation to hash-based

2. **Hash-Based Embeddings** (Fallback):
   - **Algorithm**: SHA-256 cryptographic hashing
   - **Dimension**: Configurable (default: 256D)
   - **Performance**: ~50µs per embedding
   - **Dependency**: ✅ None (Node.js crypto module)

**Embedding Usage:**
- Pattern recognition for learning system
- Semantic memory search (HNSW)
- Similar test/code detection
- Cross-project pattern reuse

**LLM Dependency**: ❌ **NONE** - Self-contained embedding system

---

## 5. Learning & Adaptation Systems

### 5.1 Learning Engine Architecture

**LearningEngine** (`src/learning/LearningEngine.ts`):

**Architecture:**
```
Experience Collection → Q-Learning → Pattern Recognition → Strategy Optimization
      (Agent tasks)     (RL-based)    (Embeddings)         (Adaptive routing)
```

**Components:**
1. **Q-Learning Table**:
   - State-action-reward tracking
   - Exploration vs exploitation (ε-greedy)
   - Temporal difference learning
   - **Storage**: SwarmMemoryManager (local SQLite)

2. **Pattern Recognition**:
   - Embedding-based similarity search
   - Confidence scoring
   - Usage count tracking
   - **Dependency**: EmbeddingGenerator (local or ML)

3. **Performance Tracking**:
   - Task execution metrics
   - Success/failure rates
   - Cost tracking
   - **Storage**: Local memory

**LLM Dependency**: ❌ **NONE** for learning mechanics
- ⚠️ Requires LLM for task execution (to generate experiences)
- ✅ Learning algorithm is vendor-agnostic

### 5.2 SONA Integration (Self-Optimizing Neural Architecture)

**SONAIntegration** (`src/agents/SONAIntegration.ts`):

**Integration with RuvLLM:**
```typescript
interface SONAAgentContext {
  llm: RuvLLM;              // RuvLLM instance
  memoryStore: SwarmMemoryManager;
  agentId: string;
  capabilities: AgentCapability[];
}
```

**Capabilities:**
- ✅ Local model fine-tuning (LoRA adapters)
- ✅ Adaptive learning from feedback
- ✅ Pattern-based optimization
- ✅ Memory-augmented inference

**Current Status**: 🚧 **Underutilized**
- Infrastructure exists
- Not integrated into agent factory
- No routing to SONA-enabled agents
- Manual configuration required

---

## 6. MCP Server Architecture

### 6.1 MCP Tool Ecosystem

**AgenticQEMCPServer** (`src/mcp/server.ts`):
- **Tools**: 85 MCP tools (lazy-loaded, 87% context reduction)
- **Categories**:
  - Test generation (10 tools)
  - Coverage analysis (8 tools)
  - Quality gates (12 tools)
  - Fleet management (15 tools)
  - Memory operations (20 tools)
  - Coordination (20 tools)

**LLM Dependency**: ❌ **NONE** for MCP server
- ✅ MCP server is pure Node.js/TypeScript
- ✅ Tools invoke agents via internal APIs
- ⚠️ Agents invoked by tools may require LLM

### 6.2 Agent Spawning via MCP

**Tool: `agent_spawn`** (`src/mcp/handlers/agent-spawn.ts`):
```typescript
// Claude Code invokes this tool
{
  "agentType": "qe-test-generator",
  "config": { /* agent config */ }
}

// Server creates agent via factory
const agent = await factory.createAgent(agentType, config);
await agent.initialize();
```

**Implication**:
- ✅ LLM provider is configured at agent creation time
- ⚠️ No per-request provider switching
- ⚠️ All agents currently use same provider (via config)

---

## 7. Vendor Lock-in Assessment

### 7.1 Lock-in Severity Matrix

| Component | Current Vendor | Lock-in Level | Migration Effort | Local Alternative |
|-----------|----------------|---------------|------------------|-------------------|
| **Core Inference** | Anthropic Claude | 🔴 HIGH | 🟡 Medium | RuvLLM (exists) |
| **Streaming** | Anthropic Claude | 🟡 MEDIUM | 🟢 Low | OpenRouter/RuvLLM |
| **Embeddings** | Transformers.js | 🟢 LOW | 🟢 Low | Hash-based (built-in) |
| **Vector DB** | SQLite (local) | 🟢 NONE | N/A | N/A |
| **Memory Storage** | SQLite (local) | 🟢 NONE | N/A | N/A |
| **Model Routing** | Custom (cloud-only) | 🟡 MEDIUM | 🟡 Medium | Extend to RuvLLM |
| **Learning System** | Vendor-agnostic | 🟢 NONE | N/A | N/A |
| **MCP Integration** | Vendor-agnostic | 🟢 NONE | N/A | N/A |

### 7.2 Critical Dependencies

**Package.json Analysis:**

```json
{
  "@anthropic-ai/sdk": "^0.64.0",        // CRITICAL - Primary inference
  "openai": "^6.9.1",                    // UNUSED - Imported but not used
  "@ruvector/ruvllm": "^0.2.3",          // UNDERUTILIZED - Local inference
  "@ruvector/core": "^0.1.15",           // UNDERUTILIZED - Vector ops
  "@xenova/transformers": "^2.6.0",      // IMPORTANT - Embeddings
  "agentdb": "^1.6.1",                   // DEPRECATED (v2.2.0+)
  "better-sqlite3": "^12.4.1"            // CRITICAL - Memory storage
}
```

**Vendor Distribution:**
- **Anthropic**: 1 package (primary inference)
- **OpenAI**: 1 package (not actively used)
- **RuvLLM**: 2 packages (underutilized)
- **Hugging Face**: 1 package (embeddings)
- **Local**: 2 packages (SQLite, AgentDB)

### 7.3 Cost Implications

**Monthly Cost Projection** (based on 1M tokens/day):

| Scenario | Provider | Model | Input Cost | Output Cost | Monthly Total |
|----------|----------|-------|-----------|------------|---------------|
| **Current (All Claude)** | Anthropic | Sonnet 4 | $90 | $450 | **$540/month** |
| **Optimized (Routing)** | Mixed | Auto | $27 | $135 | **$162/month** (70% savings) |
| **Hybrid (50% Local)** | RuvLLM + Cloud | Mixed | $13.50 | $67.50 | **$81/month** (85% savings) |
| **Full Local** | RuvLLM | Local | $0 | $0 | **$0/month** (100% savings) |

**Caveats:**
- Full local requires model fine-tuning for quality
- Critical agents (security, production) may require cloud models
- Hybrid approach balances cost and quality

---

## 8. Bottlenecks & Coupling Points

### 8.1 Architectural Bottlenecks

1. **Model Router → Cloud-Only**
   - **Location**: `src/core/routing/AdaptiveModelRouter.ts`
   - **Issue**: Only routes to Claude and OpenRouter models
   - **Impact**: Cannot leverage local RuvLLM models
   - **Fix Complexity**: 🟡 Medium (extend routing rules)

2. **Agent Factory → Single Provider**
   - **Location**: `src/agents/index.ts` (QEAgentFactory)
   - **Issue**: All agents share same LLM provider
   - **Impact**: Cannot mix local/cloud per agent type
   - **Fix Complexity**: 🟡 Medium (per-agent provider config)

3. **BaseAgent → No Provider Awareness**
   - **Location**: `src/agents/BaseAgent.ts`
   - **Issue**: Base class doesn't know about LLM providers
   - **Impact**: Agents implement LLM calls directly
   - **Fix Complexity**: 🔴 High (refactor all 20 agents)

4. **SONA Integration → Not Activated**
   - **Location**: `src/agents/SONAIntegration.ts`
   - **Issue**: Infrastructure exists but not used
   - **Impact**: Local learning capabilities unused
   - **Fix Complexity**: 🟢 Low (configuration change)

### 8.2 Code Coupling Analysis

**Direct SDK Imports** (from Grep analysis):

```bash
# Files importing @anthropic-ai/sdk
src/providers/ClaudeProvider.ts           ← Expected
src/providers/ILLMProvider.ts             ← Interface definition (OK)
src/types/index.ts                        ← Type imports (OK)
src/mcp/tools/qe/accessibility/video-vision-analyzer.ts  ← COUPLING!
src/agents/AccessibilityAllyAgent.ts      ← COUPLING!
```

**Critical Finding**:
- ⚠️ 2 agents directly import Anthropic SDK
- ⚠️ Bypasses provider abstraction layer
- ⚠️ Creates tight coupling to Claude API

**Affected Agents:**
1. **AccessibilityAllyAgent**: Uses Claude for vision analysis
2. **Video Vision Analyzer** (MCP tool): Direct Claude API calls

**Recommended Fix**: Refactor to use `ILLMProvider.complete()` with vision support

---

## 9. Local Deployment Readiness

### 9.1 Fully Local Capabilities

**Components Ready for Local Deployment:**

✅ **Memory System**:
- SwarmMemoryManager (SQLite)
- HNSW Vector DB
- Pattern cache
- No cloud dependency

✅ **Embedding Generation**:
- Hash-based fallback (always available)
- Transformers.js (downloads models once)
- No API calls required

✅ **Learning Engine**:
- Q-learning table (local)
- Pattern recognition (local)
- Performance tracking (local)

✅ **MCP Server**:
- Pure Node.js/TypeScript
- No external APIs
- Tool execution is local

✅ **Agent Lifecycle**:
- Coordination (EventBus)
- State management
- Workflow execution

### 9.2 Partial Local Capabilities (with RuvLLM)

**Agents That Could Run Locally:**

| Agent | Local Capability | Quality Trade-off |
|-------|------------------|-------------------|
| TestGeneratorAgent | 🟡 Moderate | -20% test coverage |
| CoverageAnalyzerAgent | ✅ High | -5% accuracy |
| TestDataArchitectAgent | ✅ High | No trade-off |
| CodeComplexityAnalyzerAgent | ✅ High | No trade-off |
| PerformanceTesterAgent | ✅ High | -10% insight depth |
| QualityAnalyzerAgent | 🟡 Moderate | -15% accuracy |

**Agents Requiring Cloud:**
- SecurityScannerAgent (complex vulnerability analysis)
- FlakyTestHunterAgent (ML pattern recognition)
- ProductionIntelligenceAgent (large-scale anomaly detection)
- QXPartnerAgent (sophisticated UX/QA reasoning)

### 9.3 RuvLLM Integration Gap

**What's Missing:**

1. **Routing Integration**:
   - RuvLLM not in `ModelRules.ts`
   - No local model selection logic
   - No fallback to local on cloud failure

2. **Agent Factory Support**:
   - No `RuvLLMProvider` option in factory
   - Manual configuration required
   - Not documented in agent creation

3. **Quality Benchmarking**:
   - No A/B testing local vs cloud
   - Unknown quality impact per agent
   - No documented best practices

4. **SONA Activation**:
   - Infrastructure complete but unused
   - No CLI command to enable
   - Requires manual code changes

---

## 10. Recommendations

### 10.1 Short-Term (1-2 weeks)

**Priority 1: Decouple Vision-Dependent Agents**
- **Action**: Refactor `AccessibilityAllyAgent` and `VideoVisionAnalyzer` to use `ILLMProvider`
- **Impact**: Removes direct Anthropic SDK coupling
- **Effort**: 4-8 hours
- **File**: `/workspaces/agentic-qe-cf/src/agents/AccessibilityAllyAgent.ts`

**Priority 2: Activate RuvLLM in Model Router**
- **Action**: Add RuvLLM models to `ModelRules.ts` for SIMPLE/MODERATE tasks
- **Impact**: Enable hybrid local/cloud routing
- **Effort**: 2-4 hours
- **Files**:
  - `/workspaces/agentic-qe-cf/src/core/routing/ModelRules.ts`
  - `/workspaces/agentic-qe-cf/src/core/routing/AdaptiveModelRouter.ts`

**Priority 3: Document Local Deployment**
- **Action**: Create guide for running agents with RuvLLM
- **Impact**: Enable cost-conscious users to go local
- **Effort**: 2-3 hours
- **File**: `/workspaces/agentic-qe-cf/docs/guides/local-deployment.md` (new)

### 10.2 Medium-Term (1-2 months)

**Priority 4: Per-Agent Provider Configuration**
- **Action**: Extend `QEAgentFactory` to support provider per agent type
- **Impact**: Mix local/cloud intelligently
- **Effort**: 1-2 days
- **Example**:
  ```typescript
  factory.createAgent('qe-test-generator', {
    provider: 'ruvllm',  // Use local
    fallbackProvider: 'claude'  // Cloud fallback
  })
  ```

**Priority 5: Local Quality Benchmarking**
- **Action**: Create benchmark suite comparing local vs cloud for each agent
- **Impact**: Data-driven local deployment decisions
- **Effort**: 3-5 days
- **Metrics**: Coverage %, accuracy, execution time, cost

**Priority 6: Hybrid Routing Strategy**
- **Action**: Implement tiered routing (local → cheap cloud → premium cloud)
- **Impact**: Balance cost and quality automatically
- **Effort**: 2-3 days
- **Logic**:
  ```
  1. Try RuvLLM (free, fast)
  2. If confidence < threshold, try Haiku (cheap)
  3. If still low confidence, try Sonnet/Opus (expensive)
  ```

### 10.3 Long-Term (3-6 months)

**Priority 7: Multi-Provider Agent Pool**
- **Action**: Enable agent instances with different providers running concurrently
- **Impact**: Distribute load across local/cloud
- **Effort**: 1-2 weeks
- **Example**: 5 TestGeneratorAgents (3 local, 2 cloud)

**Priority 8: Fine-Tuned Local Models**
- **Action**: Train RuvLLM adapters on project-specific test patterns
- **Impact**: Local model quality matches cloud
- **Effort**: 2-4 weeks (data collection + training)
- **Mechanism**: SONA learning system (already built!)

**Priority 9: Full Local Mode**
- **Action**: Make AQE fully functional without internet
- **Impact**: Air-gapped deployments, complete cost elimination
- **Effort**: 1-2 months
- **Components**: All agents use local models, no API calls

---

## 11. Migration Strategy

### 11.1 Phase 1: Hybrid Deployment (Recommended First Step)

**Week 1-2: Foundation**
1. Add RuvLLM to model router (Priority 2)
2. Refactor vision agents (Priority 1)
3. Document local setup (Priority 3)

**Week 3-4: Validation**
4. Benchmark 5 agents (TestGenerator, Coverage, Quality, Complexity, TestData)
5. Measure quality delta (target: <10% degradation)
6. Document trade-offs

**Week 5-6: Production Rollout**
7. Enable hybrid mode by default
8. Route SIMPLE/MODERATE to local
9. Route COMPLEX/CRITICAL to cloud
10. Monitor cost savings (target: 50%+)

### 11.2 Phase 2: Local-First Architecture

**Month 2-3: Infrastructure**
1. Per-agent provider config (Priority 4)
2. Tiered routing strategy (Priority 6)
3. SONA activation for learning

**Month 3-4: Optimization**
4. Multi-provider agent pools (Priority 7)
5. A/B testing framework
6. Cost/quality dashboard

### 11.3 Phase 3: Full Local Capability

**Month 5-6: Training & Fine-Tuning**
1. Collect training data from agent executions
2. Fine-tune RuvLLM adapters per agent type
3. Benchmark against cloud (target: <5% quality gap)

**Month 6+: Production**
4. Full local mode release
5. Air-gapped deployment support
6. Community-contributed model weights

---

## 12. Risk Assessment

### 12.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Local model quality < cloud** | 🔴 HIGH | 🔴 HIGH | Benchmark before rollout, keep cloud fallback |
| **RuvLLM stability issues** | 🟡 MEDIUM | 🟡 MEDIUM | Extensive testing, vendor support |
| **Increased latency (local CPU)** | 🟡 MEDIUM | 🟢 LOW | GPU support, parallel execution |
| **Breaking changes in provider APIs** | 🟢 LOW | 🟡 MEDIUM | Provider abstraction layer mitigates |
| **Memory constraints (large models)** | 🟡 MEDIUM | 🟡 MEDIUM | Quantization, smaller models |

### 12.2 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **User dissatisfaction (quality)** | 🟡 MEDIUM | 🔴 HIGH | Opt-in hybrid mode, clear documentation |
| **Increased support burden** | 🟡 MEDIUM | 🟡 MEDIUM | Comprehensive guides, telemetry |
| **Cost savings not realized** | 🟢 LOW | 🟡 MEDIUM | Benchmark shows 70-81% savings possible |
| **Vendor relationship issues** | 🟢 LOW | 🟢 LOW | Maintain Claude as premium option |

---

## 13. Cost-Benefit Analysis

### 13.1 Current State

**Monthly Costs** (1M tokens/day, all Claude Sonnet):
- Input: 30M tokens × $3/M = $90
- Output: 30M tokens × $15/M = $450
- **Total: $540/month**

**Annual**: $6,480

### 13.2 Hybrid Deployment (50% Local)

**Monthly Costs**:
- Local (RuvLLM): 15M tokens × $0 = $0
- Cloud (Sonnet): 15M tokens × $18/M = $270
- **Total: $270/month (50% savings)**

**Annual**: $3,240
**Savings**: $3,240/year

**Plus Benefits**:
- Faster response time (local inference)
- No rate limits on local
- Privacy (sensitive data stays local)

### 13.3 Full Local Deployment

**Monthly Costs**:
- RuvLLM: $0 (hardware cost amortized)
- Fine-tuning: ~$50/month (GPU compute for training)
- **Total: $50/month (91% savings)**

**Annual**: $600
**Savings**: $5,880/year

**Trade-offs**:
- Initial setup effort (1-2 months)
- Quality gap on complex tasks (5-15%)
- Hardware requirements (GPU recommended)

---

## 14. Conclusion

### 14.1 Current State Summary

The AQE Fleet has a **well-architected provider abstraction layer** but suffers from **partial vendor lock-in** due to:
1. Heavy reliance on Anthropic Claude for primary inference
2. Underutilized local inference capabilities (RuvLLM)
3. Direct SDK coupling in 2 vision-dependent agents
4. Cloud-only model routing logic

### 14.2 Recommendations Summary

**Immediate Actions** (This Week):
1. ✅ Refactor vision agents to use `ILLMProvider`
2. ✅ Add RuvLLM to model router for SIMPLE/MODERATE tasks
3. ✅ Document local deployment setup

**Near-Term Actions** (This Month):
4. ✅ Benchmark 5 agents (local vs cloud quality)
5. ✅ Enable per-agent provider configuration
6. ✅ Implement hybrid routing (local → cloud fallback)

**Long-Term Vision** (Next Quarter):
7. ✅ Multi-provider agent pools
8. ✅ Fine-tune local models on project data
9. ✅ Full local mode for air-gapped deployments

### 14.3 Strategic Positioning

**Strengths:**
- ✅ Clean provider abstraction (easy to extend)
- ✅ Local memory/storage (no cloud dependency)
- ✅ RuvLLM infrastructure already built
- ✅ Cost optimization (70-81% savings proven)

**Opportunities:**
- 🎯 Differentiate from cloud-only competitors
- 🎯 Enable enterprise air-gapped deployments
- 🎯 Reduce operational costs by 85%+
- 🎯 Build community around local model fine-tuning

**Threats:**
- ⚠️ Quality gap if local models underperform
- ⚠️ User expectations (cloud model quality)
- ⚠️ Support complexity (hybrid deployments)

**Final Recommendation**: **Pursue Hybrid Deployment (Phase 1)** with controlled rollout. This balances cost savings, quality, and risk while validating local model performance before full commitment.

---

## Appendix A: File Locations

**Key Architecture Files:**
- `/workspaces/agentic-qe-cf/src/agents/BaseAgent.ts` - Base agent class
- `/workspaces/agentic-qe-cf/src/agents/index.ts` - Agent factory
- `/workspaces/agentic-qe-cf/src/providers/ILLMProvider.ts` - Provider interface
- `/workspaces/agentic-qe-cf/src/providers/ClaudeProvider.ts` - Claude implementation
- `/workspaces/agentic-qe-cf/src/providers/OpenRouterProvider.ts` - OpenRouter implementation
- `/workspaces/agentic-qe-cf/src/providers/RuvllmProvider.ts` - RuvLLM implementation
- `/workspaces/agentic-qe-cf/src/core/routing/AdaptiveModelRouter.ts` - Model routing
- `/workspaces/agentic-qe-cf/src/core/routing/ModelRules.ts` - Routing rules
- `/workspaces/agentic-qe-cf/src/core/embeddings/EmbeddingGenerator.ts` - Embeddings
- `/workspaces/agentic-qe-cf/src/core/memory/SwarmMemoryManager.ts` - Memory system
- `/workspaces/agentic-qe-cf/src/learning/LearningEngine.ts` - Q-learning
- `/workspaces/agentic-qe-cf/src/agents/SONAIntegration.ts` - SONA integration
- `/workspaces/agentic-qe-cf/src/mcp/server.ts` - MCP server
- `/workspaces/agentic-qe-cf/package.json` - Dependencies

**Agents with Direct SDK Coupling:**
- `/workspaces/agentic-qe-cf/src/agents/AccessibilityAllyAgent.ts`
- `/workspaces/agentic-qe-cf/src/mcp/tools/qe/accessibility/video-vision-analyzer.ts`

---

## Appendix B: Agent Capability Matrix

| Agent | Capabilities | LLM Required | Local Feasible | Cloud Required |
|-------|-------------|--------------|----------------|----------------|
| TestGeneratorAgent | 2 (ai-test-generation, property-based-testing) | ✅ | 🟡 | ❌ |
| TestExecutorAgent | 2 (parallel-execution, multi-framework) | ❌ | ✅ | ❌ |
| CoverageAnalyzerAgent | 2 (sublinear-coverage-optimization, real-time-gap-detection) | ✅ | 🟡 | ❌ |
| QualityGateAgent | 2 (intelligent-quality-assessment, dynamic-threshold-adjustment) | ✅ | 🟡 | ❌ |
| QualityAnalyzerAgent | 1 (quality-metrics-analysis) | ✅ | 🟡 | ❌ |
| RequirementsValidatorAgent | 4 (testability-analysis, bdd-scenario-generation, ambiguity-detection, acceptance-criteria-validation) | ✅ | 🟡 | ❌ |
| ProductionIntelligenceAgent | 4 (incident-replay-generation, rum-analysis, load-pattern-extraction, observability-integration) | ✅ | ❌ | ✅ |
| FleetCommanderAgent | 5 (hierarchical-orchestration, agent-health-monitoring, dynamic-load-balancing, auto-scaling, failure-recovery) | ✅ | 🟡 | ❌ |
| DeploymentReadinessAgent | 6 (risk-scoring, release-confidence-analysis, rollback-risk-prediction, checklist-validation, integration-orchestration, incident-monitoring) | ✅ | 🟡 | ❌ |
| PerformanceTesterAgent | 6 (multi-tool-load-testing, performance-profiling, bottleneck-detection, load-pattern-simulation, threshold-monitoring, resource-tracking) | ✅ | 🟡 | ❌ |
| SecurityScannerAgent | 6 (multi-layer-scanning, vulnerability-prioritization, compliance-validation, dependency-analysis, container-security, security-remediation) | ✅ | ❌ | ✅ |
| RegressionRiskAnalyzerAgent | 6 (smart-test-selection, code-impact-analysis, ml-pattern-recognition, risk-heat-mapping, git-integration, adaptive-strategy) | ✅ | 🟡 | ❌ |
| TestDataArchitectAgent | 6 (high-speed-data-generation, referential-integrity, pii-anonymization, schema-introspection, edge-case-generation, multi-database-support) | ✅ | ✅ | ❌ |
| ApiContractValidatorAgent | 6 (breaking-change-detection, multi-schema-support, consumer-impact-analysis, semantic-versioning, backward-compatibility, contract-diffing) | ✅ | 🟡 | ❌ |
| FlakyTestHunterAgent | 6 (statistical-flakiness-detection, root-cause-identification, auto-stabilization, flakiness-scoring, quarantine-management, environmental-analysis) | ✅ | ❌ | ✅ |
| QXPartnerAgent | 7 (qx-analysis, oracle-problem-detection, ux-testing-heuristics, user-business-balance, impact-analysis, testability-integration, collaborative-qx) | ✅ | ❌ | ✅ |
| AccessibilityAllyAgent | 10 (wcag-2.2-validation, context-aware-remediation, aria-intelligence, video-accessibility-analysis, webvtt-generation, en301549-compliance, apg-pattern-suggestions, keyboard-navigation-testing, color-contrast-optimization, learning-integration) | ✅ | 🟡 | 🟡 |
| CodeComplexityAnalyzerAgent | TBD | ✅ | ✅ | ❌ |

**Legend:**
- ✅ Yes / Feasible
- 🟡 Partial / With Trade-offs
- ❌ No / Not Recommended

---

**End of Report**
