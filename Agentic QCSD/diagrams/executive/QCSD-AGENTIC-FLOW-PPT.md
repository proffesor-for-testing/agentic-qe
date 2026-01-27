# QCSD 2.0: Agentic Quality Engineering

## Main Flow Diagram

```mermaid
flowchart TB
    subgraph HEADER[" "]
        direction LR
        H1[ENABLE AND ENGAGE]
        H2[EXECUTE]
        H3[EVALUATE]
    end

    subgraph PHASES[" "]
        direction LR
        P1[Ideation]
        P2[Grooming]
        P3[Development]
        P4[CI/CD]
        P5[Production Telemetry]
        P1 --> P2 --> P3 --> P4 --> P5
    end

    subgraph SWARMS[" "]
        direction LR
        S1[IDEATION SWARM<br/>---<br/>Quality Criteria Recommender<br/>Risk Assessor<br/>Requirements Validator<br/>---<br/>Testability Scoring]
        S2[GROOMING SWARM<br/>---<br/>Product Factors Assessor<br/>BDD Generator<br/>Requirements Validator<br/>Dependency Mapper<br/>---<br/>Context-Driven Testing]
        S3[DEVELOPMENT SWARM<br/>---<br/>TDD Specialist<br/>Test Architect<br/>Mutation Tester<br/>---<br/>TDD Red<br/>TDD Green<br/>TDD Refactor<br/>Code Reviewer<br/>---<br/>TDD London-Chicago]
        S4[CI/CD SWARM<br/>---<br/>Quality Gate<br/>Deployment Advisor<br/>Security Scanner<br/>Parallel Executor<br/>Flaky Hunter<br/>Coverage Specialist<br/>---<br/>Security Reviewer<br/>---<br/>Security Testing]
        S5[TELEMETRY SWARM<br/>---<br/>Defect Predictor<br/>Root Cause Analyzer<br/>Pattern Learner<br/>Learning Coordinator<br/>Transfer Specialist<br/>Chaos Engineer<br/>---<br/>Chaos Engineering]
    end

    P1 --> S1
    P2 --> S2
    P3 --> S3
    P4 --> S4
    P5 --> S5

    S5 -.->|Feedback Loop| S1

    style H1 fill:#fff,stroke:#fff,color:#000
    style H2 fill:#fff,stroke:#fff,color:#000
    style H3 fill:#fff,stroke:#fff,color:#000

    style P1 fill:#FF69B4,stroke:#C71585,color:#fff
    style P2 fill:#FF69B4,stroke:#C71585,color:#fff
    style P3 fill:#FF69B4,stroke:#C71585,color:#fff
    style P4 fill:#FF69B4,stroke:#C71585,color:#fff
    style P5 fill:#FF69B4,stroke:#C71585,color:#fff

    style S1 fill:#4CAF50,stroke:#2E7D32,color:#fff
    style S2 fill:#2196F3,stroke:#1565C0,color:#fff
    style S3 fill:#9C27B0,stroke:#6A1B9A,color:#fff
    style S4 fill:#FF9800,stroke:#EF6C00,color:#fff
    style S5 fill:#F44336,stroke:#C62828,color:#fff
```

---

## Swarm Details

### IDEATION SWARM (Green)
| Type | Name |
|------|------|
| Agent | Quality Criteria Recommender |
| Agent | Risk Assessor |
| Agent | Requirements Validator |
| Skill | Testability Scoring |

### GROOMING SWARM (Blue)
| Type | Name |
|------|------|
| Agent | Product Factors Assessor |
| Agent | BDD Generator |
| Agent | Requirements Validator |
| Agent | Dependency Mapper |
| Skill | Context-Driven Testing |

### DEVELOPMENT SWARM (Purple)
| Type | Name |
|------|------|
| Agent | TDD Specialist |
| Agent | Test Architect |
| Agent | Mutation Tester |
| Sub-agent | TDD Red |
| Sub-agent | TDD Green |
| Sub-agent | TDD Refactor |
| Sub-agent | Code Reviewer |
| Skill | TDD London-Chicago |

### CI/CD SWARM (Orange)
| Type | Name |
|------|------|
| Agent | Quality Gate |
| Agent | Deployment Advisor |
| Agent | Security Scanner |
| Agent | Parallel Executor |
| Agent | Flaky Hunter |
| Agent | Coverage Specialist |
| Sub-agent | Security Reviewer |
| Skill | Security Testing |

### TELEMETRY SWARM (Red)
| Type | Name |
|------|------|
| Agent | Defect Predictor |
| Agent | Root Cause Analyzer |
| Agent | Pattern Learner |
| Agent | Learning Coordinator |
| Agent | Transfer Specialist |
| Agent | Chaos Engineer |
| Skill | Chaos Engineering |

---

## Legend

| Section | Meaning |
|---------|---------|
| --- | Separator between Agents, Sub-agents, and Skills |
| Pink boxes | Original QCSD 1.0 phases |
| Colored boxes | QCSD 2.0 AI Swarms |

---

## Summary

| Swarm | Agents | Sub-agents | Skills |
|-------|--------|------------|--------|
| Ideation | 3 | 0 | 1 |
| Grooming | 4 | 0 | 1 |
| Development | 3 | 4 | 1 |
| CI/CD | 6 | 1 | 1 |
| Telemetry | 6 | 0 | 1 |
| **Total** | **22** | **5** | **5** |
