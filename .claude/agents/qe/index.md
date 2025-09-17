# Quality Engineering Agent Registry

This directory contains Claude Code agent definitions for comprehensive Quality Engineering (QE) workflows. These agents implement modern QE practices including Rapid Software Testing (RST), context-driven testing, risk-based approaches, and production-integrated quality assurance.

## Core QE Agents

### [Exploratory Testing Navigator](./exploratory-testing-navigator.md)
**Agent ID:** `exploratory-testing-navigator`
**Purpose:** Autonomous exploration of applications to discover unknown unknowns through session-based test management.

**Key Features:**
- RST-based testing tours (Money Tour, Saboteur Tour, etc.)
- PROOF documentation framework
- Session-based test management
- Anomaly and pattern detection

**Use Cases:**
- Discovering edge cases and unexpected behaviors
- Validating complex user workflows
- Finding security vulnerabilities through adversarial testing

---

### [Risk Oracle](./risk-oracle.md)
**Agent ID:** `risk-oracle`
**Purpose:** Predictive risk assessment and test prioritization using multi-dimensional risk modeling.

**Key Features:**
- Technical, business, and contextual risk assessment
- Statistical failure prediction
- Risk-based test prioritization
- Mitigation strategy recommendations

**Use Cases:**
- Prioritizing testing efforts with limited time
- Assessing deployment risks
- Optimizing test coverage based on real risk

---

### [TDD Pair Programmer](./tdd-pair-programmer.md)
**Agent ID:** `tdd-pair-programmer`
**Purpose:** Intelligent pair programmer supporting both London and Chicago schools of TDD.

**Key Features:**
- Test-first development guidance
- Coverage gap identification
- Refactoring suggestions
- TDD cycle management

**Use Cases:**
- Implementing new features using TDD
- Improving existing code with tests
- Learning TDD best practices

---

### [Production Observer](./production-observer.md)
**Agent ID:** `production-observer`
**Purpose:** Continuous production monitoring and anomaly detection to improve testing strategies.

**Key Features:**
- Golden Signals monitoring (Latency, Traffic, Errors, Saturation)
- Synthetic user journey validation
- Anomaly detection and pattern recognition
- Test gap identification from production issues

**Use Cases:**
- Monitoring production health
- Identifying missing test scenarios
- Validating deployment success

---

### [Deployment Guardian](./deployment-guardian.md)
**Agent ID:** `deployment-guardian`
**Purpose:** Ensures safe deployments through progressive validation and automated rollback triggers.

**Key Features:**
- Smoke test generation
- Canary analysis with statistical validation
- Progressive rollout strategies
- Automated rollback decision making

**Use Cases:**
- Zero-downtime deployments
- Risk-minimized feature releases
- Automated deployment validation

---

### [Requirements Explorer](./requirements-explorer.md)
**Agent ID:** `requirements-explorer`
**Purpose:** Analyzes requirements for testability, ambiguity, and risk using RST heuristics.

**Key Features:**
- SFDIPOT and FEW HICCUPPS heuristic application
- Testability assessment
- Risk identification and heatmap generation
- Exploratory testing charter creation

**Use Cases:**
- Shift-left quality engineering
- Requirement clarification and improvement
- Early risk identification

## Agent Integration Patterns

### Quality Engineering Workflow
```
Requirements Explorer → Risk Oracle → TDD Pair Programmer → Production Observer → Deployment Guardian
```

1. **Requirements Analysis** - Explorer identifies risks and testability issues
2. **Risk Assessment** - Oracle prioritizes testing efforts based on risk
3. **Implementation** - TDD Pair Programmer ensures test-first development
4. **Production Monitoring** - Observer validates real-world behavior
5. **Safe Deployment** - Guardian ensures reliable releases

### Claude Code Integration

All agents are designed to work seamlessly with Claude Code's development workflow:

- **Task Coordination** - Agents can be spawned concurrently using Claude Code's Task tool
- **Memory Integration** - Shared context and findings across agent sessions
- **Hook Integration** - Automated triggers and coordination with other development tools
- **Progressive Enhancement** - Each agent builds upon findings from others

## Usage with Claude Code

### Spawning Multiple QE Agents
```javascript
// Spawn QE agents concurrently for comprehensive coverage
Task("Requirements Analysis", "Analyze user stories for testability and risks", "requirements-explorer")
Task("Risk Assessment", "Calculate risk scores and prioritize testing", "risk-oracle")
Task("TDD Implementation", "Guide test-first development", "tdd-pair-programmer")
Task("Production Validation", "Monitor deployment and identify gaps", "production-observer")
```

### Agent Coordination
```javascript
// Coordinated QE workflow with shared context
mcp__claude-flow__swarm_init { topology: "hierarchical", maxAgents: 6 }
mcp__claude-flow__task_orchestrate {
  task: "Complete QE workflow for payment feature",
  strategy: "sequential",
  priority: "high"
}
```

## Available Agent Categories

### Core QE (6 agents)
Primary quality engineering agents for essential workflows

### Testing Specialists (8 agents)
- functional-negative
- functional-flow-validator
- functional-stateful
- security-injection
- mocking-agent
- spec-linter
- quality-storyteller

### Risk & Analysis (5 agents)
- context-orchestrator
- byzantine-coordinator
- collective-intelligence-coordinator

### CI/CD & Production (7 agents)
- pr-manager
- workflow-automation
- swarm-memory-manager
- quorum-manager
- crdt-synchronizer
- mesh-coordinator

## Best Practices

1. **Start with Requirements Explorer** - Always begin QE workflows with requirement analysis
2. **Use Risk Oracle for Prioritization** - Let risk assessment drive testing decisions
3. **Implement with TDD Pair Programmer** - Ensure test-first development practices
4. **Monitor with Production Observer** - Validate assumptions in real-world conditions
5. **Deploy with Deployment Guardian** - Ensure safe, validated releases

## Agent Metadata

Each agent includes:
- **Version tracking** for compatibility
- **Claude model optimization** for specific use cases
- **Tool definitions** for automated integration
- **Capability declarations** for discovery
- **Usage examples** for quick adoption
- **Integration patterns** with other agents

## Contributing

When adding new QE agents:
1. Follow the established metadata format
2. Include comprehensive tool definitions
3. Provide realistic usage examples
4. Document integration patterns
5. Tag appropriately for discovery
6. Test with Claude Code workflow integration