# Agentic QE Fleet - Agent Reference

This document provides comprehensive reference for all 21 QE agents, 15 n8n workflow testing agents, and 11 subagents in the Agentic Quality Engineering Fleet.

## Overview

The Agentic QE Fleet is a distributed swarm of AI agents for comprehensive software testing and quality assurance. Each agent specializes in specific quality engineering tasks and coordinates through the `aqe/*` memory namespace.

---

## Core Testing Agents (5 agents)

### qe-test-generator
**AI-powered test generation with sublinear optimization**

**Capabilities:**
- Generates unit, integration, and E2E tests
- Supports Jest, Mocha, Vitest, Playwright
- Sublinear optimization algorithms for test selection
- Property-based testing generation
- Edge case discovery

**Usage:**
```javascript
Task("Generate tests", "Create comprehensive test suite for UserService", "qe-test-generator")
```

**Memory Namespace:**
- Stores: `aqe/test-plan/generated`
- Reads: `aqe/coverage/gaps`

---

### qe-test-executor
**Multi-framework test execution with parallel processing**

**Capabilities:**
- Executes tests across multiple frameworks
- Parallel test execution with worker pools
- Real-time progress streaming
- Test retry logic for flaky tests
- Coverage collection

**Usage:**
```javascript
Task("Execute tests", "Run test plan with 90% coverage target", "qe-test-executor")
```

**Memory Namespace:**
- Stores: `aqe/test-results/*`
- Reads: `aqe/test-plan/generated`

---

### qe-coverage-analyzer
**Real-time gap detection with O(log n) algorithms**

**Capabilities:**
- Incremental coverage analysis
- Sublinear gap detection algorithms
- Critical path identification
- Coverage visualization
- Untested code hotspot detection

**Usage:**
```javascript
Task("Analyze coverage", "Find gaps using O(log n) algorithms", "qe-coverage-analyzer")
```

**Memory Namespace:**
- Stores: `aqe/coverage/gaps`, `aqe/coverage/results`
- Reads: `aqe/test-results/*`

---

### qe-quality-gate
**Intelligent quality gate with risk assessment**

**Capabilities:**
- Multi-factor risk assessment
- Customizable quality thresholds
- Trend analysis
- Deployment readiness scoring
- Automated go/no-go decisions

**Usage:**
```javascript
Task("Quality check", "Run quality gate validation", "qe-quality-gate")
```

**Memory Namespace:**
- Stores: `aqe/quality/gate-results`
- Reads: `aqe/coverage/results`, `aqe/test-results/*`

---

### qe-quality-analyzer
**Comprehensive quality metrics analysis**

**Capabilities:**
- Quality metrics collection and analysis
- Trend detection and prediction
- Technical debt calculation
- Code health scoring
- Actionable insights generation

**Usage:**
```javascript
Task("Quality analysis", "Analyze project quality metrics", "qe-quality-analyzer")
```

**Memory Namespace:**
- Stores: `aqe/quality/metrics`
- Reads: `aqe/quality/*`, `aqe/test-results/*`

---

## Performance & Security Agents (2 agents)

### qe-performance-tester
**Load testing with k6, JMeter, Gatling integration**

**Capabilities:**
- Load, stress, and spike testing
- Performance baseline establishment
- Bottleneck identification
- SLA validation
- Multi-tool integration (k6, JMeter, Gatling)

**Usage:**
```javascript
Task("Performance test", "Load test critical paths with 1000 concurrent users", "qe-performance-tester")
```

**Memory Namespace:**
- Stores: `aqe/performance/results`
- Reads: `aqe/test-plan/*`

---

### qe-security-scanner
**Multi-layer security with SAST/DAST scanning**

**Capabilities:**
- SAST (Static Application Security Testing)
- DAST (Dynamic Application Security Testing)
- Dependency vulnerability scanning
- OWASP Top 10 validation
- Security compliance checking

**Usage:**
```javascript
Task("Security scan", "Run comprehensive security checks", "qe-security-scanner")
```

**Memory Namespace:**
- Stores: `aqe/security/findings`
- Reads: `aqe/test-plan/*`

---

## Strategic Planning Agents (3 agents)

### qe-requirements-validator
**INVEST criteria validation and BDD generation**

**Capabilities:**
- Requirements testability analysis
- INVEST criteria validation
- BDD scenario generation (Gherkin)
- Acceptance criteria validation
- Requirements ambiguity detection

**Usage:**
```javascript
Task("Validate requirements", "Check testability and generate BDD scenarios", "qe-requirements-validator")
```

**Memory Namespace:**
- Stores: `aqe/requirements/validated`
- Reads: `aqe/test-plan/*`

---

### qe-production-intelligence
**Production data to test scenarios conversion**

**Capabilities:**
- Production incident replay
- RUM (Real User Monitoring) analysis
- Log-based test generation
- Production pattern extraction
- Edge case discovery from production

**Usage:**
```javascript
Task("Production intelligence", "Convert production incidents to test scenarios", "qe-production-intelligence")
```

**Memory Namespace:**
- Stores: `aqe/production/insights`
- Reads: Production logs, incident data

---

### qe-fleet-commander
**Hierarchical fleet coordination (50+ agents)**

**Capabilities:**
- Multi-agent orchestration
- Resource allocation
- Task decomposition and distribution
- Agent performance monitoring
- Coordination topology optimization

**Usage:**
```javascript
Task("Fleet coordination", "Orchestrate 20 agents for comprehensive testing", "qe-fleet-commander")
```

**Memory Namespace:**
- Stores: `aqe/swarm/coordination`
- Reads: All `aqe/*` namespaces

---

## Deployment Agent (1 agent)

### qe-deployment-readiness
**Multi-factor risk assessment for deployments**

**Capabilities:**
- Deployment risk scoring
- Rollback plan validation
- Production readiness checklist
- Release notes generation
- Deployment window optimization

**Usage:**
```javascript
Task("Deployment check", "Assess deployment readiness", "qe-deployment-readiness")
```

**Memory Namespace:**
- Stores: `aqe/deployment/readiness`
- Reads: `aqe/quality/*`, `aqe/test-results/*`

---

## Code Understanding Agent (1 agent)

### qe-code-intelligence
**Knowledge graph-based code understanding with 80% token reduction**

**Capabilities:**
- Tree-sitter multi-language parsing (TypeScript, Python, Go, Rust, JavaScript)
- Semantic embeddings via Ollama nomic-embed-text (768 dimensions)
- RuVector PostgreSQL storage with vector similarity search
- Hybrid search (BM25 + Vector with RRF fusion)
- Knowledge graph with entity relationships (imports, extends, calls)
- Context building for other agents with 80% token reduction
- Mermaid diagram generation (class diagrams, dependency graphs)
- Incremental indexing with git change detection

**Usage:**
```javascript
// Index codebase
Task("Index codebase", "Parse and index all TypeScript files in src/", "qe-code-intelligence")

// Semantic search
Task("Find auth code", "Search for code related to JWT authentication", "qe-code-intelligence")

// Build context for another agent
Task("Build test context", "Create context for UserService to pass to test-generator", "qe-code-intelligence")
```

**CLI Commands:**
```bash
aqe kg index              # Index codebase
aqe kg query "search"     # Semantic search
aqe kg graph file.ts      # Generate diagram
aqe kg stats              # Show statistics
```

**Memory Namespace:**
- Stores: `aqe/code-intelligence/index-stats`, `aqe/code-intelligence/context/*`
- Reads: `aqe/project-metadata/*`

**Prerequisites:** Ollama + nomic-embed-text, RuVector PostgreSQL. See [Code Intelligence Quick Start](../guides/code-intelligence-quickstart.md).

---

## Advanced Testing Agents (4 agents)

### qe-regression-risk-analyzer
**Smart test selection with ML patterns**

**Capabilities:**
- Change impact analysis
- Intelligent test selection
- Regression risk prediction
- Test prioritization
- Historical failure pattern analysis

**Usage:**
```javascript
Task("Regression analysis", "Select minimal test suite for code changes", "qe-regression-risk-analyzer")
```

**Memory Namespace:**
- Stores: `aqe/regression/risk-analysis`
- Reads: `aqe/test-results/*`, learning patterns

---

### qe-test-data-architect
**High-speed realistic data generation (10k+ records/sec)**

**Capabilities:**
- Schema-aware data generation
- Relationship preservation
- Edge case coverage
- GDPR-compliant data masking
- High-performance generation (10k+ records/sec)

**Usage:**
```javascript
Task("Generate test data", "Create 10k realistic user records", "qe-test-data-architect")
```

**Memory Namespace:**
- Stores: `aqe/test-data/generated`
- Reads: Database schemas

---

### qe-api-contract-validator
**Breaking change detection across API versions**

**Capabilities:**
- API contract validation
- Breaking change detection
- Backward compatibility verification
- OpenAPI/Swagger validation
- Consumer-driven contract testing

**Usage:**
```javascript
Task("Validate API contracts", "Check for breaking changes", "qe-api-contract-validator")
```

**Memory Namespace:**
- Stores: `aqe/api/contract-validation`
- Reads: API specifications

---

### qe-flaky-test-hunter
**Statistical flakiness detection and auto-stabilization**

**Capabilities:**
- Flaky test detection with ML
- Root cause analysis
- Auto-stabilization strategies
- Statistical significance testing
- Retry policy optimization

**Usage:**
```javascript
Task("Hunt flaky tests", "Detect and stabilize flaky tests", "qe-flaky-test-hunter")
```

**Memory Namespace:**
- Stores: `aqe/flaky-tests/detected`
- Reads: `aqe/test-results/*`, historical test data

---

## Specialized Agents (2 agents)

### qe-visual-tester
**Visual regression with AI-powered comparison**

**Capabilities:**
- Screenshot-based visual testing
- AI-powered image comparison
- Layout shift detection
- Accessibility visual validation
- Cross-browser visual testing

**Usage:**
```javascript
Task("Visual testing", "Run visual regression tests", "qe-visual-tester")
```

**Memory Namespace:**
- Stores: `aqe/visual/results`
- Reads: `aqe/test-plan/*`

---

### qe-chaos-engineer
**Resilience testing with controlled fault injection**

**Capabilities:**
- Controlled fault injection
- Resilience testing
- Blast radius management
- Recovery validation
- System stability verification

**Usage:**
```javascript
Task("Chaos testing", "Test system resilience with controlled failures", "qe-chaos-engineer")
```

**Memory Namespace:**
- Stores: `aqe/chaos/results`
- Reads: `aqe/test-plan/*`

---

### qe-a11y-ally
**Intelligent accessibility testing with WCAG 2.2 compliance**
*Contributed by [@fndlalit](https://github.com/fndlalit)*

**Capabilities:**
- WCAG 2.2 Level A, AA, AAA validation using axe-core
- Context-aware ARIA label generation
- Intelligent remediation with code examples
- Keyboard navigation and screen reader testing
- Color contrast optimization
- AI video analysis (OpenAI, Anthropic, Ollama, moondream)
- WebVTT caption generation
- EN 301 549 EU compliance mapping
- ARIA Authoring Practices Guide (APG) patterns

**Usage:**
```javascript
Task("Accessibility scan", "Run WCAG 2.2 AA compliance check", "qe-a11y-ally")
Task("Generate captions", "Create WebVTT captions for video", "qe-a11y-ally")
Task("Remediation", "Fix accessibility issues with code suggestions", "qe-a11y-ally")
```

**Memory Namespace:**
- Stores: `aqe/accessibility/scan-results`, `aqe/accessibility/remediation`
- Reads: `aqe/test-plan/*`

**MCP Tools (10 tools):**
- `scan-comprehensive` - Full WCAG 2.2 scan
- `remediation-code-generator` - Auto-fix code generation
- `html-report-generator` - Detailed HTML reports
- `video-vision-analyzer` - AI video accessibility analysis
- `webvtt-generator` - Caption file generation

---

## n8n Workflow Testing Agents (15 agents)
*Contributed by [@fndlalit](https://github.com/fndlalit)*

The n8n workflow testing agents provide comprehensive testing capabilities for n8n automation workflows.

### n8n-workflow-executor
**Execute and validate n8n workflows programmatically**

**Capabilities:**
- Execute workflows via n8n REST API
- Inject test data at workflow start or specific nodes
- Validate node-to-node data flow
- Assert expected outputs per node
- Measure execution time and resource usage

**Usage:**
```javascript
Task("Execute n8n workflow", "Test workflow with sample data", "n8n-workflow-executor")
```

---

### n8n-chaos-tester
**Fault injection and resilience testing for n8n workflows**

**Capabilities:**
- Controlled fault injection using N8nTestHarness
- Network failure simulation
- Node timeout testing
- Error propagation validation
- Recovery path verification

---

### n8n-security-auditor
**Security scanning for n8n workflows**

**Capabilities:**
- 40+ secret patterns detection
- Runtime credential leak detection
- API key exposure scanning
- Node permission validation
- OWASP compliance checking

---

### n8n-performance-tester
**Load and stress testing for n8n workflows**

**Capabilities:**
- Concurrent execution testing
- Timing metrics and percentiles
- Bottleneck identification
- Resource usage monitoring
- SLA validation

---

### n8n-compliance-validator
**GDPR/HIPAA/SOC2/PCI-DSS compliance validation**

**Capabilities:**
- Data handling compliance checks
- PII detection and tracing
- Audit trail validation
- Regulatory mapping
- Compliance reporting

---

### Additional n8n Agents

| Agent | Purpose |
|-------|---------|
| **n8n-bdd-scenario-tester** | Cucumber-style BDD testing with real execution |
| **n8n-expression-validator** | Safe expression validation using pattern matching |
| **n8n-integration-test** | Real API connectivity testing via workflow execution |
| **n8n-trigger-test** | Webhook testing with correct n8n URL patterns |
| **n8n-monitoring-validator** | SLA compliance checking with runtime metrics |
| **n8n-node-validator** | Node configuration validation |
| **n8n-unit-tester** | Unit testing for individual workflow nodes |
| **n8n-version-comparator** | Version compatibility analysis |
| **n8n-ci-orchestrator** | CI/CD pipeline integration for n8n workflows |
| **n8n-base-agent** | Base agent with common n8n testing functionality |

**Setup Guide:** [n8n Real Instance Setup](../guides/n8n-real-instance-setup.md)

---

## MCP Tool Discovery System

The Agentic QE Fleet uses **lazy-loaded MCP tools** to reduce initial context by 87%.

### Tool Discovery

```javascript
// Discover available tool domains
mcp__agentic_qe__tools_discover()
// Returns: security, coverage, test-generation, test-execution, quality-gates,
//          fleet-management, memory, learning, patterns, reporting

// Load specific domain tools
mcp__agentic_qe__tools_load_domain({ domain: "security" })
mcp__agentic_qe__tools_load_domain({ domain: "coverage" })
```

### Automatic Loading

Tools are **auto-loaded based on keywords** when agents work:
- "security", "vulnerability" → loads security tools
- "coverage", "gaps" → loads coverage tools
- "generate", "create tests" → loads test-generation tools
- "execute", "run tests" → loads test-execution tools

### Benefits

- **87% context reduction** (from 15,000 to 2,000 tokens initially)
- **Faster agent spawning** with minimal overhead
- **On-demand loading** only when tools are needed

---

## Agent Coordination

All agents coordinate through the **`aqe/*` memory namespace**:

- `aqe/test-plan/*` - Test planning and requirements
- `aqe/coverage/*` - Coverage analysis and gaps
- `aqe/quality/*` - Quality metrics and gates
- `aqe/performance/*` - Performance test results
- `aqe/security/*` - Security scan findings
- `aqe/swarm/coordination` - Cross-agent coordination

## Parallel Agent Execution

Execute multiple agents concurrently for maximum efficiency:

```javascript
// Execute multiple agents in parallel
Task("Test Generation", "Generate unit tests", "qe-test-generator")
Task("Coverage Analysis", "Analyze current coverage", "qe-coverage-analyzer")
Task("Security Scan", "Run security checks", "qe-security-scanner")
Task("Performance Test", "Load test critical paths", "qe-performance-tester")
```

---

**Related Documentation:**
- [Skills Reference](skills.md) - All 46 QE skills
- [Usage Guide](usage.md) - Complete usage examples
- [AQE Hooks](../architecture/AQE-HOOKS.md) - Agent coordination details

**Related Policies:**
- [Release Verification Policy](../policies/release-verification.md)
- [Test Execution Policy](../policies/test-execution.md)
