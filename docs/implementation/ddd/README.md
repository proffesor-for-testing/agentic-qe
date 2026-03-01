# Agentic QE v3 - Domain-Driven Design Documentation

This directory contains Domain-Driven Design (DDD) documentation for each bounded context in the Agentic QE v3 platform.

## Bounded Contexts Overview

The Agentic QE v3 platform is organized into **12 bounded contexts**, each responsible for a specific aspect of quality engineering:

| Domain | Responsibility | Key Capabilities |
|--------|----------------|------------------|
| [Test Generation](./test-generation.md) | AI-powered test creation | TDD, property-based testing, pattern learning |
| [Test Execution](./test-execution.md) | Parallel test running | Flaky detection, retries, prioritization |
| [Coverage Analysis](./coverage-analysis.md) | Code coverage intelligence | O(log n) gap detection, risk scoring |
| [Quality Assessment](./quality-assessment.md) | Quality gate decisions | Metrics analysis, deployment advice |
| [Defect Intelligence](./defect-intelligence.md) | Defect prediction | Root cause analysis, regression risk |
| [Code Intelligence](./code-intelligence.md) | Codebase understanding | Knowledge graph, semantic search |
| [Requirements Validation](./requirements-validation.md) | Pre-development QA | BDD generation, testability scoring, SFDIPOT |
| [Security Compliance](./security-compliance.md) | Security testing | SAST/DAST, vulnerability analysis |
| [Contract Testing](./contract-testing.md) | API contracts | Consumer-driven contracts, schema validation |
| [Visual Accessibility](./visual-accessibility.md) | Visual & a11y testing | Screenshot comparison, WCAG compliance |
| [Chaos Resilience](./chaos-resilience.md) | Reliability testing | Chaos engineering, load testing |
| [Learning Optimization](./learning-optimization.md) | Continuous improvement | Pattern learning, knowledge transfer |

## Context Map

```
                                    ┌─────────────────────────────────────┐
                                    │         Queen Coordinator           │
                                    │   (Orchestration & Task Routing)    │
                                    └─────────────────────────────────────┘
                                                     │
                    ┌────────────────────────────────┼────────────────────────────────┐
                    │                                │                                │
        ┌───────────▼───────────┐      ┌────────────▼────────────┐      ┌────────────▼────────────┐
        │   Pre-Development     │      │      Execution Layer    │      │   Intelligence Layer    │
        │                       │      │                         │      │                         │
        │ • Requirements Val.   │◄────►│ • Test Generation       │◄────►│ • Code Intelligence     │
        │ • Contract Testing    │      │ • Test Execution        │      │ • Defect Intelligence   │
        │                       │      │ • Coverage Analysis     │      │ • Learning Optimization │
        └───────────────────────┘      └─────────────────────────┘      └─────────────────────────┘
                    │                                │                                │
                    │                                │                                │
        ┌───────────▼───────────┐      ┌────────────▼────────────┐      ┌────────────▼────────────┐
        │   Quality Assurance   │      │   Non-Functional Layer  │      │   Reliability Layer     │
        │                       │      │                         │      │                         │
        │ • Quality Assessment  │◄────►│ • Security Compliance   │◄────►│ • Chaos Resilience      │
        │                       │      │ • Visual Accessibility  │      │                         │
        └───────────────────────┘      └─────────────────────────┘      └─────────────────────────┘
```

## Cross-Cutting Concerns

### Event Bus
All domains communicate via an event-driven architecture using the shared `EventBus`:
- Domain events are published after significant state changes
- Other domains can subscribe to events they care about
- Enables loose coupling between bounded contexts

### Memory Backend
All domains share access to the unified memory backend:
- HNSW-indexed vector search (O(log n) semantic queries)
- Namespace isolation per domain
- TTL-based expiration for temporal data

### MinCut Integration (ADR-047)
Domains can participate in topology-aware routing:
- Report health status to Queen coordinator
- Participate in self-healing workflows
- Optimize cross-domain communication paths

### Consensus Integration (MM-006)
Critical findings can be verified via multi-model consensus:
- Configurable severity thresholds
- Auto-approval for high-confidence results
- Audit trail for verification decisions

## Shared Kernel

The following types are shared across all bounded contexts:

```typescript
// From src/shared/types
DomainName, DomainEvent, Result, Severity, Priority, AgentId

// From src/shared/value-objects
FilePath, Version, TimeRange, RiskScore
```

## Architecture Decision Records

Relevant ADRs for domain architecture:
- **ADR-001**: Deep agentic-flow@alpha integration
- **ADR-006**: Unified Memory Service
- **ADR-009**: Hybrid Memory Backend
- **ADR-047**: MinCut topology awareness
- **ADR-051**: LLM-powered analysis
- **MM-006**: Multi-model consensus verification
