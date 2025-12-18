# Agent Learning System Architecture

## Complete Agent Lifecycle with Ruv's Solutions

This document explains exactly how QE agents work, when they use LLMs, and how they benefit from the integrated "ruv" solutions (RuvLLM, RuVector, ReasoningBank).

---

## 1. Agent Spawning - Two Entry Points

### A. Via Claude Code Task Tool

```
User → Claude Code → Task Tool → External Agent Process
                              └── Direct CLI execution
```

When you use Claude Code's Task tool:
- Spawns an external process
- Agent runs independently
- Hooks notify visualization dashboard

### B. Via AQE MCP Tools

```
User → Claude Code → MCP Tool → AgentSpawnHandler → AgentRegistry → QEAgentFactory
                                      │                    │
                                      │                    ├─ Creates BaseAgentConfig
                                      │                    │   ├─ agentType
                                      │                    │   ├─ capabilities
                                      │                    │   ├─ memoryStore (SHARED)  ←─ KEY!
                                      │                    │   ├─ enableLearning: true
                                      │                    │   └─ learningConfig
                                      │                    │
                                      │                    └─ Creates Agent Instance
                                      │                        └─ TestGeneratorAgent
                                      │                           CoverageAnalyzerAgent
                                      │                           etc.
                                      │
                                      └─ Returns AgentInstance metadata
```

**Key File:** `src/mcp/handlers/agent-spawn.ts:56-232`

---

## 2. BaseAgent Initialization - Multi-Stage Process

```
BaseAgent.initialize()
    │
    ├─ 1. Load Knowledge (subclass-specific)
    │
    ├─ 2. Restore State from Memory
    │
    ├─ 3. Create Performance Tracker
    │
    ├─ 4. Create LearningEngine ─────────────────────────────────────┐
    │      │                                                         │
    │      ├─ Q-Learning Algorithm (default)                         │
    │      ├─ Q-Table: Map<state, Map<action, reward>>               │
    │      ├─ SwarmMemoryManager (SHARED)                            │
    │      └─ HNSWPatternAdapter (Phase 0 M0.3) ←── RuVector!       │
    │                                                                │
    ├─ 5. Initialize LLM Provider ───────────────────────────────────┤
    │      │                                                         │
    │      └─ Selection Priority:                                    │
    │         1. RuvLLM (LOCAL - default) ←── RuvLLM!               │
    │         2. Claude (if ANTHROPIC_API_KEY)                       │
    │         3. OpenRouter (if OPENROUTER_API_KEY)                  │
    │                                                                │
    ├─ 6. Initialize Federated Learning (Phase 0 M0.5) ──────────────┤
    │      └─ Register with FederatedManager                         │
    │                                                                │
    └─ 7. Initialize Subclass Components                             │
           (TestGeneratorAgent → PatternExtractor, ReasoningBank)    │
                                                                     │
    ┌────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     INITIALIZATION COMPLETE                          │
│                                                                      │
│  Agent State:                                                        │
│  ├─ learningEngine: LearningEngine (with Q-table + HNSW)            │
│  ├─ llmProvider: RuvllmProvider (local) OR Claude/OpenRouter        │
│  ├─ llmSessionId: "sess-xxx" (for session continuity)              │
│  ├─ federatedManager: FederatedManager (cross-agent learning)       │
│  └─ memoryStore: SwarmMemoryManager (SQLite .agentic-qe/memory.db)  │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Files:**
- `src/agents/BaseAgent.ts:216-276` (initialize)
- `src/learning/LearningEngine.ts:107-179` (constructor + init)
- `src/agents/BaseAgent.ts:668-727` (LLM initialization)

---

## 3. LLM Provider Selection - When Does Agent Use LLM?

### Provider Selection Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LLM PROVIDER SELECTION                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Environment Check                        Selected Provider          │
│  ─────────────────                        ─────────────────          │
│                                                                      │
│  1. LLM_PROVIDER env override     ───────► Use specified provider   │
│                                                                      │
│  2. Inside Claude Code +                                             │
│     ANTHROPIC_API_KEY             ───────► Claude API               │
│                                                                      │
│  3. OPENROUTER_API_KEY            ───────► OpenRouter (300+ models) │
│                                                                      │
│  4. ANTHROPIC_API_KEY             ───────► Claude API               │
│                                                                      │
│  5. RuvLLM available              ───────► RuvLLM (LOCAL, FREE)     │
│     (default for QE agents)                                          │
│                                                                      │
│  6. Fallback                      ───────► Algorithmic-only mode    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### RuvLLM Features (When Local Provider Selected)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       RUVLLM PROVIDER                                │
│                    (src/providers/RuvllmProvider.ts)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐                                               │
│  │  TRM (Test-time  │  Iterative reasoning refinement               │
│  │  Reasoning &     │  - Up to 7 iterations                         │
│  │  Metacognition)  │  - Converges at 95% confidence                │
│  └────────┬─────────┘  - Improves output quality                    │
│           │                                                          │
│  ┌────────▼─────────┐                                               │
│  │  SONA (Self-     │  Continuous model adaptation                  │
│  │  Organizing      │  - LoRA rank: 8, alpha: 16                    │
│  │  Neural Arch)    │  - EWC lambda: 2000                           │
│  └────────┬─────────┘  - Prevents catastrophic forgetting           │
│           │                                                          │
│  ┌────────▼─────────┐                                               │
│  │  Sessions        │  Multi-turn context preservation              │
│  │                  │  - 50% latency reduction                      │
│  │                  │  - Context reuse across calls                 │
│  └────────┬─────────┘  - Session timeout: 30 min                    │
│           │                                                          │
│  ┌────────▼─────────┐                                               │
│  │  Batch API       │  Parallel request processing                  │
│  │                  │  - 4x throughput                              │
│  │                  │  - Rate limiting protection                   │
│  └──────────────────┘                                               │
│                                                                      │
│  Default Model: llama-3.2-3b-instruct                               │
│  Port: 8080                                                          │
│  Context Size: 4096                                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### When LLM is Called During Task Execution

```
TestGeneratorAgent.performTask(task)
    │
    ├─ Phase 1: Code Analysis
    │   └─ analyzeCodeWithConsciousness()  ─── May use LLM for analysis
    │
    ├─ Phase 2: Pattern Retrieval (NO LLM)
    │   └─ findApplicablePatterns() ─────────── Uses HNSW vector search
    │                                           O(log n), <1ms p95
    │
    ├─ Phase 3: Pattern Recognition
    │   └─ recognizePatterns() ───────────────── May use LLM
    │
    ├─ Phase 4: Test Strategy Selection
    │   └─ selectTestStrategy() ──────────────── Algorithmic, no LLM
    │
    ├─ Phase 5: Test Generation ─────────────────────────────────────┐
    │   │                                                            │
    │   ├─ generateTestCandidatesSublinear()                         │
    │   │   └─ Uses patterns for template-based generation           │
    │   │      (If patterns found, reduces LLM calls!)               │
    │   │                                                            │
    │   ├─ generateUnitTests()                                       │
    │   │   └─ this.llmChat(prompt) ←─── LLM CALLED HERE            │
    │   │                                                            │
    │   ├─ generateIntegrationTests()                                │
    │   │   └─ this.llmChat(prompt) ←─── LLM CALLED HERE            │
    │   │                                                            │
    │   └─ generateEdgeCaseTests()                                   │
    │       └─ this.llmChat(prompt) ←─── LLM CALLED HERE            │
    │                                                                │
    ├─ Phase 6: Test Optimization (NO LLM)                           │
    │   └─ optimizeTestSelection() ──────────── Algorithmic          │
    │                                                                │
    └─ Phase 7: Pattern Extraction & Storage                         │
        └─ Extracts patterns for future reuse                        │
           └─ this.llmEmbed() for embedding generation               │
```

**Key File:** `src/agents/TestGeneratorAgent.ts:390-666` (generateTestsWithAI)

---

## 4. Learning from Execution - The Magic Happens

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LEARNING FROM EXECUTION                           │
│                (src/learning/LearningEngine.ts:227-345)              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. EXTRACT EXPERIENCE                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  TaskExperience {                                                    │
│    state: encode(complexity, capabilities, resources)                │
│    action: encode(strategy, parallelization, retry)                  │
│    reward: calculated from results                                   │
│    nextState: updated state                                          │
│    timestamp: when executed                                          │
│  }                                                                   │
│                                                                      │
│  Reward Calculation:                                                 │
│  ┌────────────────────────────────────────────┐                     │
│  │ success        → +1.0                      │                     │
│  │ failure        → -1.0                      │                     │
│  │ fast execution → +0.2 bonus                │                     │
│  │ errors         → -0.3 penalty              │                     │
│  │ coverage       → +0.5 bonus (test gen)     │                     │
│  │ user feedback  → -1 to +1                  │                     │
│  │ ─────────────────────────────              │                     │
│  │ Final: clamp to [-2, +2]                   │                     │
│  └────────────────────────────────────────────┘                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. UPDATE Q-TABLE (Q-Learning Algorithm)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Q(s,a) ← Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]                  │
│                                                                      │
│  Where:                                                              │
│  ├─ α = 0.1 (learning rate)                                         │
│  ├─ γ = 0.95 (discount factor)                                      │
│  ├─ s = current state                                                │
│  ├─ a = action taken                                                 │
│  ├─ r = reward received                                              │
│  └─ s' = next state                                                  │
│                                                                      │
│  Persisted to: SwarmMemoryManager → q_values table                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. UPDATE PATTERNS (Dual Storage)                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Pattern Update:                                                     │
│  ├─ usageCount++                                                     │
│  ├─ successRate = (old * count + result) / (count + 1)              │
│  └─ confidence = min(0.95, confidence + 0.01)                       │
│                                                                      │
│        ┌──────────────────────────────────────────────────┐         │
│        │              DUAL STORAGE                         │         │
│        ├──────────────────────────────────────────────────┤         │
│        │                                                   │         │
│        │  ┌─────────────────┐    ┌─────────────────────┐  │         │
│        │  │    SQLite       │    │   HNSW (RuVector)   │  │         │
│        │  │    (Primary)    │    │   (Vector Search)   │  │         │
│        │  ├─────────────────┤    ├─────────────────────┤  │         │
│        │  │                 │    │                     │  │         │
│        │  │ patterns table  │    │ O(log n) search     │  │         │
│        │  │ q_values table  │    │ <1ms p95 latency    │  │         │
│        │  │ experiences     │    │ 768-dim embeddings  │  │         │
│        │  │                 │    │ via RuvLLM/fallback │  │         │
│        │  │                 │    │                     │  │         │
│        │  │ .agentic-qe/    │    │ In-memory index     │  │         │
│        │  │ memory.db       │    │                     │  │         │
│        │  │                 │    │                     │  │         │
│        │  └────────┬────────┘    └──────────┬──────────┘  │         │
│        │           │                        │             │         │
│        │           └────────┬───────────────┘             │         │
│        │                    │                             │         │
│        └────────────────────┼─────────────────────────────┘         │
│                             │                                        │
│                             ▼                                        │
│                   SHARED ACROSS ALL AGENTS                          │
│                   (Single source of truth)                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. EXPLORATION DECAY                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  explorationRate *= 0.995                                            │
│                                                                      │
│  0.30 ───────────────────────────────────────────────────► 0.01     │
│  (start)                                                   (min)     │
│                                                                      │
│  Over ~1000 tasks, agent shifts from:                               │
│  EXPLORING (trying new strategies) → EXPLOITING (using best known)  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. FEDERATED SHARING (Optional)                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  If federated learning enabled:                                      │
│  ├─ Generate embedding for pattern                                   │
│  ├─ Calculate priority from reward                                   │
│  └─ Share with FederatedManager                                      │
│                                                                      │
│  Other agents can:                                                   │
│  ├─ syncWithTeam() - get shared patterns                            │
│  └─ Use patterns they didn't learn themselves                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Pattern Retrieval During Future Tasks

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PATTERN RETRIEVAL FLOW                            │
│           (How learned patterns accelerate future tasks)             │
└─────────────────────────────────────────────────────────────────────┘

User Request: "Generate tests for UserService.ts"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. EXTRACT CODE SIGNATURE                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  codeSignature = {                                                   │
│    functionName: "createUser"                                        │
│    complexity: "medium"                                              │
│    patterns: ["service", "async", "validation"]                      │
│  }                                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. QUERY HNSW (O(log n) Vector Search)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  learningEngine.searchSimilarPatterns("createUser test")    │     │
│  │                        │                                    │     │
│  │                        ▼                                    │     │
│  │  hnswAdapter.searchSimilar(query, k=5)                      │     │
│  │                        │                                    │     │
│  │                        ▼                                    │     │
│  │  1. Generate query embedding (RuvLLM or hash fallback)      │     │
│  │  2. Search HNSW index (O(log n), <1ms)                      │     │
│  │  3. Return top-k similar patterns                           │     │
│  │                                                             │     │
│  │  Results:                                                   │     │
│  │  ├─ Pattern: "service-async-test" (similarity: 0.92)        │     │
│  │  ├─ Pattern: "validation-test" (similarity: 0.87)           │     │
│  │  └─ Pattern: "crud-service-test" (similarity: 0.81)         │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. APPLY PATTERNS (Reduce LLM Calls)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  For each high-confidence pattern (applicability > 0.7):            │
│  ├─ Use pattern template for test structure                         │
│  ├─ Customize with code-specific details                            │
│  └─ SKIP LLM call for template portions                             │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ WITHOUT PATTERNS:                                        │        │
│  │   Generate 10 tests → 10 LLM calls → ~5000ms             │        │
│  │                                                          │        │
│  │ WITH PATTERNS:                                           │        │
│  │   7 tests from patterns + 3 LLM calls → ~2000ms          │        │
│  │   (60% faster, 70% cost reduction)                       │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Complete Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │         USER REQUEST            │
                    │   "Generate tests for X.ts"     │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │        CLAUDE CODE              │
                    │   (Orchestrator / Interface)    │
                    └───────────────┬─────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
              ▼                                           ▼
┌─────────────────────────┐                 ┌─────────────────────────┐
│     MCP Tools           │                 │     Task Tool           │
│   (aqe-mcp server)      │                 │   (direct spawn)        │
└───────────┬─────────────┘                 └───────────┬─────────────┘
            │                                           │
            ▼                                           │
┌─────────────────────────┐                            │
│   AgentRegistry         │                            │
│   ├─ Shared Memory ─────┼────────────────────────────┤
│   └─ Creates Config     │                            │
└───────────┬─────────────┘                            │
            │                                           │
            └───────────────────┬───────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────────────┐
                    │      QE AGENT (BaseAgent)       │
                    │  ┌───────────────────────────┐  │
                    │  │    TestGeneratorAgent     │  │
                    │  │    CoverageAnalyzerAgent  │  │
                    │  │    SecurityScannerAgent   │  │
                    │  │    etc.                   │  │
                    │  └───────────────────────────┘  │
                    └───────────────┬─────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  LLM Provider   │      │ Learning Engine │      │ Memory Store    │
│                 │      │                 │      │                 │
│ ┌─────────────┐ │      │ ┌─────────────┐ │      │ ┌─────────────┐ │
│ │  RuvLLM     │ │      │ │  Q-Table    │ │      │ │ SQLite DB   │ │
│ │  (LOCAL)    │◄├──────┤►│  Algorithm  │◄├──────┤►│ patterns    │ │
│ │             │ │      │ │             │ │      │ │ q_values    │ │
│ │ ┌─────────┐ │ │      │ └─────────────┘ │      │ │ experiences │ │
│ │ │ TRM     │ │ │      │                 │      │ └─────────────┘ │
│ │ │ SONA    │ │ │      │ ┌─────────────┐ │      │                 │
│ │ │ Session │ │ │      │ │   HNSW      │ │      │ .agentic-qe/    │
│ │ │ Batch   │ │ │      │ │  Adapter    │◄├──────┤►memory.db       │
│ │ └─────────┘ │ │      │ │ (RuVector)  │ │      │                 │
│ └─────────────┘ │      │ └─────────────┘ │      │ SHARED ACROSS   │
│                 │      │                 │      │ ALL AGENTS      │
│ OR              │      │ Federated      │      │                 │
│                 │      │ Learning       │      │                 │
│ ┌─────────────┐ │      │ (cross-agent)  │      │                 │
│ │   Claude    │ │      │                 │      │                 │
│ │ OpenRouter  │ │      │                 │      │                 │
│ └─────────────┘ │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                          │                          │
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │         TASK RESULT             │
                    │   TestSuite, Coverage Report,   │
                    │   Quality Metrics, etc.         │
                    └─────────────────────────────────┘
```

---

## 7. Ruv Solutions Integration Summary

| Solution | Component | Purpose | Location |
|----------|-----------|---------|----------|
| **RuvLLM** | `RuvllmProvider` | Local LLM inference with TRM/SONA/Sessions | `src/providers/RuvllmProvider.ts` |
| **RuVector** | `HNSWPatternStore` | O(log n) vector similarity search | `src/memory/HNSWPatternStore.ts` |
| **RuVector** | `HNSWPatternAdapter` | Bridge to LearningEngine | `src/learning/HNSWPatternAdapter.ts` |
| **@ruvector/core** | VectorDB | HNSW index implementation | `node_modules/@ruvector/core` |
| **AgentDB** | `ReasoningBank` | Pattern storage and retrieval | `node_modules/agentdb` |

---

## 8. Benefits of This Architecture

### 1. **Reduced LLM Costs**
- Pattern templates reduce LLM calls by up to 70%
- Local RuvLLM provides zero-cost inference
- Session reuse cuts latency by 50%

### 2. **Continuous Improvement**
- Q-learning optimizes strategy selection
- Patterns improve with each successful task
- Federated learning shares knowledge across agents

### 3. **Fast Pattern Retrieval**
- HNSW provides O(log n) vector search
- <1ms p95 latency for pattern matching
- Scales to millions of patterns

### 4. **Unified Data Store**
- Single SQLite database prevents fragmentation
- All agents share learned patterns
- CLI, MCP, and direct spawning all contribute

### 5. **Graceful Degradation**
- If LLM unavailable → algorithmic fallback
- If HNSW fails → SQLite-only mode
- If patterns unavailable → full LLM generation
