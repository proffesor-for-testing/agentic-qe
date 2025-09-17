# Claude Code QE Agent Usage Guide

## Quick Start

### 1. Single Agent Usage
```javascript
// Spawn individual QE agents using Claude Code's Task tool
Task("Risk Assessment", "Analyze deployment risks for payment service changes", "risk-oracle")
Task("TDD Session", "Guide test-first development for user authentication", "tdd-pair-programmer")
Task("Production Check", "Monitor API performance and error rates", "production-observer")
```

### 2. Multiple Agent Coordination
```javascript
// Concurrent execution for comprehensive coverage
[Single Message - Parallel Agent Execution]:
  Task("Requirements Analysis", "Analyze user stories for testability using RST heuristics", "requirements-explorer")
  Task("Risk Assessment", "Calculate risk scores and prioritize testing efforts", "risk-oracle")
  Task("Security Testing", "Test for injection vulnerabilities in API endpoints", "security-injection")
  Task("Negative Testing", "Generate boundary and error condition tests", "functional-negative")
  Task("Exploratory Session", "Conduct saboteur tour of payment flow", "exploratory-testing-navigator")
```

### 3. Sequential Workflow
```javascript
// Step-by-step QE workflow
[Message 1 - Analysis]:
  Task("Requirement Explorer", "Analyze requirements for payment feature using SFDIPOT heuristics", "requirements-explorer")

[Message 2 - Risk & Planning]:
  Task("Risk Oracle", "Prioritize testing based on requirement analysis findings", "risk-oracle")

[Message 3 - Implementation]:
  Task("TDD Pair Programmer", "Implement payment service with test-first approach", "tdd-pair-programmer")
  Task("Negative Tester", "Create comprehensive error handling tests", "functional-negative")

[Message 4 - Validation]:
  Task("Production Observer", "Monitor deployment metrics and user impact", "production-observer")
  Task("Deployment Guardian", "Ensure safe rollout with canary analysis", "deployment-guardian")
```

## MCP Integration

### Setup Coordination
```javascript
// Initialize swarm coordination (optional for complex workflows)
mcp__claude-flow__swarm_init {
  topology: "hierarchical",
  maxAgents: 6,
  strategy: "balanced"
}

// Then spawn actual agents via Claude Code Task tool
Task("QE Coordinator", "Orchestrate comprehensive QE workflow", "exploratory-testing-navigator")
Task("Security Specialist", "Focus on security testing", "security-injection")
Task("Quality Reporter", "Generate stakeholder reports", "quality-storyteller")
```

## Common Workflows

### Comprehensive QE Workflow
```javascript
// Complete quality engineering process
TodoWrite { todos: [
  {content: "Analyze requirements for testability", status: "in_progress", activeForm: "Analyzing requirements"},
  {content: "Calculate risk scores and priorities", status: "pending", activeForm: "Calculating risks"},
  {content: "Implement with TDD approach", status: "pending", activeForm: "Implementing with TDD"},
  {content: "Execute negative testing", status: "pending", activeForm: "Testing error paths"},
  {content: "Monitor production deployment", status: "pending", activeForm: "Monitoring production"},
  {content: "Generate quality report", status: "pending", activeForm: "Creating report"}
]}

[Parallel Execution]:
  Task("Requirements Explorer", "Apply RST heuristics to analyze payment feature requirements", "requirements-explorer")
  Task("Risk Oracle", "Calculate multi-dimensional risk scores for feature components", "risk-oracle")
  Task("TDD Pair", "Guide test-first implementation of payment processing", "tdd-pair-programmer")
  Task("Negative Tester", "Test all error conditions and boundary cases", "functional-negative")
  Task("Production Monitor", "Set up monitoring for deployment validation", "production-observer")
  Task("Quality Storyteller", "Prepare reports for different stakeholders", "quality-storyteller")
```

### Security-Focused Testing
```javascript
// Security testing workflow
[Security Testing Session]:
  Task("Security Injection", "Test for SQL, NoSQL, and prompt injection vulnerabilities", "security-injection")
  Task("Boundary Security", "Test security boundaries with invalid inputs", "functional-negative")
  Task("Adversarial Explorer", "Conduct saboteur and antisocial testing tours", "exploratory-testing-navigator")
```

### Quick Quality Check
```javascript
// Fast quality validation for time-constrained scenarios
[Quick Validation]:
  Task("Risk Assessment", "Quick risk analysis of changes", "risk-oracle")
  Task("Deployment Safety", "Validate deployment readiness", "deployment-guardian")
```

## Agent Coordination Patterns

### 1. Sequential (Waterfall)
- Requirements Explorer → Risk Oracle → TDD Pair → Production Observer
- Each agent builds on previous findings
- Best for systematic, thorough analysis

### 2. Parallel (Concurrent)
- Multiple agents working simultaneously
- Shared memory for coordination
- Best for time-constrained scenarios

### 3. Hierarchical (Coordinated)
- Lead agent coordinates others
- Structured workflow with dependencies
- Best for complex, multi-phase projects

### 4. Mesh (Collaborative)
- All agents can communicate with each other
- Dynamic task allocation
- Best for adaptive, complex scenarios

## Memory Integration

### Sharing Context
```javascript
// Agents store findings in shared memory
Task("Requirements Explorer", "Analyze requirements. Store findings in memory key: qe/requirements/analysis", "requirements-explorer")
Task("Risk Oracle", "Calculate risks using memory key: qe/requirements/analysis", "risk-oracle")
```

### Memory Keys Convention
- `qe/requirements/*` - Requirement analysis
- `qe/risks/*` - Risk assessments
- `qe/tests/*` - Test findings
- `qe/production/*` - Production observations
- `qe/security/*` - Security findings
- `qe/reports/*` - Generated reports

## Hook Integration

### Pre-task Hooks
```bash
npx claude-flow@alpha hooks pre-task --description "QE workflow for payment feature"
npx claude-flow@alpha hooks session-restore --session-id "qe-payment-feature"
```

### During Task Hooks
```bash
npx claude-flow@alpha hooks post-edit --file "tests/payment.test.js" --memory-key "qe/tests/payment"
npx claude-flow@alpha hooks notify --message "Risk assessment completed - high risk in payment validation"
```

### Post-task Hooks
```bash
npx claude-flow@alpha hooks post-task --task-id "qe-comprehensive"
npx claude-flow@alpha hooks session-end --export-metrics true
```

## Best Practices

### 1. Start with Requirements Explorer
Always begin QE workflows with requirement analysis to identify testability issues early.

### 2. Use Risk Oracle for Prioritization
Let risk assessment drive testing decisions and resource allocation.

### 3. Implement with TDD Pair Programmer
Ensure test-first development practices with continuous guidance.

### 4. Monitor with Production Observer
Validate assumptions in real-world conditions and learn from production.

### 5. Deploy with Deployment Guardian
Ensure safe, validated releases with automated rollback capabilities.

### 6. Communicate with Quality Storyteller
Transform technical findings into actionable insights for stakeholders.

## Integration Examples

### With Existing Tests
```javascript
// Enhance existing test suite
Task("Test Analyzer", "Analyze current test coverage and identify gaps", "functional-negative")
Task("TDD Guide", "Improve existing tests using TDD principles", "tdd-pair-programmer")
```

### With CI/CD Pipeline
```javascript
// Integrate into deployment pipeline
Task("Pre-deployment Check", "Validate release readiness", "deployment-guardian")
Task("Post-deployment Monitor", "Monitor deployment success", "production-observer")
```

### With Security Audit
```javascript
// Regular security testing
Task("Injection Testing", "Weekly injection vulnerability scan", "security-injection")
Task("Exploratory Security", "Monthly security-focused exploration", "exploratory-testing-navigator")
```

## Troubleshooting

### Agent Not Responding
- Check if agent ID matches exactly (case-sensitive)
- Verify Task tool syntax is correct
- Ensure proper memory key format

### Coordination Issues
- Initialize MCP swarm before complex workflows
- Use shared memory keys for context sharing
- Implement proper hook integration

### Performance Optimization
- Use parallel execution for independent tasks
- Batch related operations in single messages
- Limit concurrent agents based on system capacity

## Advanced Usage

### Custom Workflows
Create custom workflows by combining agents with specific coordination patterns and memory sharing strategies.

### Integration with External Tools
Use hooks to integrate with existing CI/CD, monitoring, and reporting tools.

### Continuous Learning
Agents learn from production feedback to improve future testing strategies and risk assessments.