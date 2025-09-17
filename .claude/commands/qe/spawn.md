# Spawn QE Agent Command

Spawn optimized QE agents for specific testing tasks.

## Usage
```bash
aqe spawn <agent-name> --task "<description>"
aqe spawn --swarm <swarm-name> --objective "<goal>"
```

## Available Agents (35 total)
- **exploratory-testing-navigator**: Exploratory testing and edge case discovery specialist
- **functional-flow-validator**: End-to-end functional flow validation specialist
- **test-analyzer**: Test suite analysis and improvement specialist
- **test-generator**: Automated test case generation specialist
- **test-planner**: Test planning and strategy specialist
- **test-runner**: Test execution and orchestration specialist
- **tdd-pair-programmer**: Test-driven development pair programming specialist
- **regression-guardian**: Regression testing and stability assurance specialist
- **mutation-testing-swarm**: Mutation testing for test suite effectiveness
- **functional-negative**: Negative testing and error handling specialist
- **functional-positive**: Positive testing and happy path validation
- **functional-stateful**: Stateful testing and session management specialist
- **requirements-explorer**: Requirements analysis and validation specialist
- **design-challenger**: Design review and architecture challenge specialist
- **spec-linter**: Specification validation and consistency checker
- **accessibility-advocate**: Accessibility testing and compliance specialist
- **risk-oracle**: Risk assessment and test prioritization specialist
- **security-sentinel**: Security testing and vulnerability assessment
- **security-injection**: Injection attack and input validation specialist
- **security-auth**: Authentication and authorization testing specialist
- **performance-analyzer**: Performance analysis and optimization specialist
- **performance-hunter**: Performance issue hunting and load testing
- **performance-planner**: Performance test planning and capacity planning
- **resilience-challenger**: Resilience testing and failure recovery specialist
- **production-observer**: Production monitoring and observability specialist
- **deployment-guardian**: Deployment validation and rollback specialist
- **chaos-engineer**: Chaos engineering and resilience testing
- **hierarchical-coordinator**: Hierarchical swarm coordination with delegation
- **mesh-coordinator**: Mesh network coordination for peer-to-peer collaboration
- **adaptive-coordinator**: Adaptive coordination based on context and performance
- **context-orchestrator**: Context-aware orchestration and workflow management
- **knowledge-curator**: Knowledge management and learning specialist
- **quality-storyteller**: Quality reporting and stakeholder communication
- **test-strategist**: Testing strategy and continuous improvement
- **mocking-agent**: Mock creation and test double specialist

## Available Swarms (8 total)
- **requirements-design**: Early quality gates, testability assessment, design validation
- **development-tdd**: Test-first development, unit testing, mocking support
- **integration-api**: Integration testing, API validation, contract testing
- **security-compliance**: Security assessment, compliance validation, accessibility
- **performance-scalability**: Performance testing, load testing, chaos engineering
- **e2e-journey**: End-to-end testing, user journey validation, edge cases
- **production-readiness**: Pre-production validation, deployment verification, monitoring
- **continuous-quality**: Continuous improvement, knowledge management, mutation testing

## Examples
```bash
# Spawn individual agent
aqe spawn risk-oracle --task "Analyze authentication system"

# Spawn entire swarm
aqe spawn --swarm security-compliance --objective "Full security audit"

# Spawn with specific strategy
aqe spawn --swarm e2e-journey --strategy sequential
```
