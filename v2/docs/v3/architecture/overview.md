# Agentic QE v3 Architecture Overview

## Executive Summary

Agentic QE v3 implements a Domain-Driven Design (DDD) architecture with 12 bounded contexts, event-driven communication, and hierarchical agent coordination.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        AGENTIC QE V3 ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         PRESENTATION LAYER                                  │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │ │
│  │  │   CLI   │  │   MCP   │  │   API   │  │  Hooks  │  │ WebUI   │          │ │
│  │  │Commands │  │  Tools  │  │Endpoints│  │(17 total│  │Dashboard│          │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                           │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         APPLICATION LAYER                                   │ │
│  │  ┌───────────────────────────────────────────────────────────────────────┐ │ │
│  │  │                    QE KERNEL (Microkernel)                             │ │ │
│  │  │  • Domain Registry    • Plugin Loader    • Event Bus    • Coordinator  │ │ │
│  │  │  • Max 15 Concurrent  • Hybrid Memory (SQLite + AgentDB with HNSW)     │ │ │
│  │  └───────────────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                           │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                         DOMAIN LAYER (12 Bounded Contexts)                  │ │
│  │                                                                             │ │
│  │  ROW 1: CORE TESTING                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │    TEST     │  │    TEST     │  │  COVERAGE   │  │   QUALITY   │        │ │
│  │  │ GENERATION  │  │  EXECUTION  │  │  ANALYSIS   │  │ ASSESSMENT  │        │ │
│  │  │   (5 agts)  │  │   (4 agts)  │  │   (4 agts)  │  │   (4 agts)  │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  │                                                                             │ │
│  │  ROW 2: INTELLIGENCE                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │   DEFECT    │  │ REQUIREMENTS│  │    CODE     │  │  SECURITY   │        │ │
│  │  │INTELLIGENCE │  │ VALIDATION  │  │INTELLIGENCE │  │ COMPLIANCE  │        │ │
│  │  │   (4 agts)  │  │   (4 agts)  │  │   (4 agts)  │  │   (4 agts)  │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  │                                                                             │ │
│  │  ROW 3: SPECIALIZED                                                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │  CONTRACT   │  │   VISUAL    │  │   CHAOS     │  │  LEARNING   │        │ │
│  │  │  TESTING    │  │ACCESSIBILITY│  │ RESILIENCE  │  │OPTIMIZATION │        │ │
│  │  │   (4 agts)  │  │   (4 agts)  │  │   (4 agts)  │  │   (5 agts)  │        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                           │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                        INFRASTRUCTURE LAYER                                 │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │ │
│  │  │ AgentDB │  │ SQLite  │  │AI Models│  │   Git   │  │ RuVector│          │ │
│  │  │  HNSW   │  │         │  │(Claude) │  │         │  │CodeIntel│          │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Key Architectural Principles

### 1. Domain-Driven Design

Each of the 12 domains is a bounded context with:
- Clear boundaries and interfaces
- Independent evolution
- Domain-specific language
- Encapsulated business logic

### 2. Microkernel Architecture

The QE Kernel provides:
- Domain registration and discovery
- Plugin loading and lifecycle
- Event routing
- Resource management (max 15 concurrent agents)

### 3. Event-Driven Communication

Domains communicate via events, not direct calls:

```typescript
// Publishing an event
eventBus.publish({
  type: 'TestCaseGenerated',
  payload: { testId, coverage, patterns }
});

// Subscribing to events
eventBus.subscribe('TestCaseGenerated', handler);
```

### 4. Hierarchical Agent Coordination

```
QUEEN COORDINATOR
├── Domain Coordinators (12)
│   ├── Domain Agents (4-5 each)
│   └── Subagents (task workers)
└── Cross-Domain Specialists (2)
```

## Domain Structure

Each domain follows this structure:

```
v3/src/domains/<domain-name>/
├── index.ts              # Domain entry point
├── coordinator.ts        # Domain coordinator
├── plugin.ts             # Plugin registration
├── interfaces.ts         # Domain interfaces
├── events.ts             # Domain events
├── services/             # Domain services
│   ├── <service>.ts
│   └── ...
└── __tests__/            # Domain tests
```

## Event Flow

```
┌───────────────┐    Event Bus    ┌───────────────┐
│Test Generation│ ───────────────▶│Code Intelligence
│    Events     │                 │    Events     │
├───────────────┤                 ├───────────────┤
│TestCreated    │                 │KGIndexRequest │
│SuiteComplete  │                 │ImpactAnalysis │
│PatternLearned │                 │DependencyMap  │
└───────────────┘                 └───────────────┘
        │                                 │
        ▼                                 ▼
┌───────────────┐                 ┌───────────────┐
│  Coverage     │                 │   Quality     │
│   Events      │                 │    Gates      │
├───────────────┤                 ├───────────────┤
│GapDetected    │ ◀───────────── │GateEvaluate   │
│RiskIdentified │                 │DeployApproved │
└───────────────┘                 └───────────────┘
```

## Memory Architecture

### Hybrid Backend

```
┌─────────────────────────────────────────┐
│           HYBRID MEMORY                  │
├──────────────────┬──────────────────────┤
│     SQLite       │      AgentDB         │
├──────────────────┼──────────────────────┤
│ • Structured     │ • Vector storage     │
│ • Relational     │ • HNSW indexing      │
│ • ACID           │ • O(log n) search    │
│ • Metrics        │ • Embeddings         │
│ • Configs        │ • Patterns           │
└──────────────────┴──────────────────────┘
```

### HNSW Performance

| Operation | Traditional | HNSW |
|-----------|-------------|------|
| Search 10K vectors | 100ms | 0.8ms |
| Search 100K vectors | 1000ms | 1.2ms |
| Search 1M vectors | 10000ms | 2ms |

## Plugin System

Domains register as plugins:

```typescript
export const testGenerationPlugin: DomainPlugin = {
  name: 'test-generation',
  version: '3.0.0',

  async register(kernel: QEKernel) {
    kernel.registerDomain(this);
    kernel.registerEvents(testGenerationEvents);
    kernel.registerHandlers(testGenerationHandlers);
  },

  async initialize() {
    // Domain initialization
  },

  async shutdown() {
    // Cleanup
  }
};
```

## Resource Management

### Concurrent Agent Limit

Maximum 15 agents running concurrently:

```typescript
// Kernel enforces limit
if (runningAgents.size >= 15) {
  await waitForSlot();
}
```

### Work Stealing

Idle agents can steal work from overloaded agents:

```typescript
// Work stealing algorithm
const idleAgent = findIdleAgent();
const overloadedAgent = findOverloadedAgent();
if (idleAgent && overloadedAgent) {
  transferWork(overloadedAgent, idleAgent);
}
```

## Performance Targets

| Metric | Target |
|--------|--------|
| Coverage analysis | O(log n) |
| Gap detection | <100ms for 100K files |
| Semantic search | <100ms |
| Event propagation | <100ms |
| Test generation | <30s per suite |
| Plugin loading | <200ms |

## Related Documentation

- [DDD Domains](ddd-domains.md)
- [Event System](events.md)
- [Domain Index](../domains/index.md)
- [Agent Hierarchy](../agents/hierarchy.md)
