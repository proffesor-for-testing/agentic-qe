# QE Claude-Flow Integration Hooks

This directory contains Claude-Flow integration hooks for the Agentic QE framework, providing seamless coordination between QE agents and Claude-Flow's swarm orchestration capabilities.

## 🎯 Overview

The QE hooks system provides:

- **Pre-test hooks** for setup and validation
- **Post-test hooks** for analysis and reporting
- **Session management hooks** for coordination
- **Quality gate enforcement hooks** for CI/CD integration
- **Memory coordination hooks** for cross-agent communication

## 📁 Structure

```
.claude/hooks/qe/
├── index.yaml           # Hook registry and configuration
├── pre-test.js          # Pre-test setup and validation
├── post-test.js         # Post-test analysis and reporting
├── quality-gates.js     # Quality standards enforcement
├── session-manager.js   # Session management and coordination
└── README.md           # This file

.claude/hooks/
└── qe-runner.js        # CLI runner for QE hooks
```

## 🚀 Quick Start

### 1. List Available Hooks

```bash
node .claude/hooks/qe-runner.js list
```

### 2. Run a Single Hook

```bash
# Pre-test setup
node .claude/hooks/qe-runner.js run pre-test \
  --testType unit \
  --testSuite core \
  --environment test

# Post-test analysis
node .claude/hooks/qe-runner.js run post-test \
  --sessionId qe-123 \
  --testType unit

# Quality gates validation
node .claude/hooks/qe-runner.js run quality-gates \
  --environment production \
  --pipeline ci-123
```

### 3. Run a Complete Workflow

```bash
# Complete test cycle
node .claude/hooks/qe-runner.js workflow complete-test-cycle \
  --testType integration \
  --testSuite api-tests

# TDD workflow
node .claude/hooks/qe-runner.js workflow tdd-workflow
```

### 4. Session Management

```bash
# Create session
node .claude/hooks/qe-runner.js run session-manager \
  --command create \
  --sessionData '{"type": "unit", "suite": "core"}'

# Get status
node .claude/hooks/qe-runner.js run session-manager \
  --command status
```

## 🔧 Hook Details

### Pre-Test Hook (`pre-test.js`)

**Purpose**: Environment setup, validation, and preparation before test execution.

**Capabilities**:
- Test environment setup (directories, config, services)
- Dependency validation
- Test data initialization
- Service coordination (databases, mocks)
- Monitoring setup

**Parameters**:
- `testType`: Type of test (unit, integration, e2e, performance)
- `testSuite`: Test suite identifier
- `environment`: Target environment
- `sessionId`: Test session identifier
- `config`: Additional configuration

**Example**:
```bash
node .claude/hooks/qe-runner.js run pre-test \
  --testType integration \
  --testSuite api-tests \
  --environment staging \
  --config '{"database": {"enabled": true}, "coverage": {"enabled": true}}'
```

### Post-Test Hook (`post-test.js`)

**Purpose**: Analysis, reporting, and cleanup after test execution.

**Capabilities**:
- Test result collection and analysis
- Coverage analysis and reporting
- Performance metrics generation
- Trend analysis
- Report generation (JSON, HTML, Markdown)
- Environment cleanup

**Parameters**:
- `sessionId`: Test session identifier
- `testType`: Type of test completed
- `testResults`: Test execution results
- `config`: Analysis configuration

**Example**:
```bash
node .claude/hooks/qe-runner.js run post-test \
  --sessionId qe-session-123 \
  --testType unit \
  --config '{"generateReports": true, "analyzeTriends": true}'
```

### Quality Gates Hook (`quality-gates.js`)

**Purpose**: Enforce quality standards and gates for CI/CD pipelines.

**Capabilities**:
- Test coverage validation
- Test reliability checks
- Code quality analysis
- Performance validation
- Security scanning
- CI/CD pipeline integration

**Parameters**:
- `sessionId`: Quality gate session identifier
- `environment`: Target environment
- `pipeline`: CI/CD pipeline identifier
- `config`: Quality gate configuration

**Example**:
```bash
node .claude/hooks/qe-runner.js run quality-gates \
  --environment production \
  --pipeline build-456 \
  --config '{"enforceAll": true, "thresholds": {"coverage": 80, "passRate": 95}}'
```

### Session Manager Hook (`session-manager.js`)

**Purpose**: Manage QE test sessions, coordination, and state persistence.

**Capabilities**:
- Session lifecycle management
- Agent coordination
- State persistence
- Swarm orchestration
- Cleanup automation
- Export/import functionality

**Commands**:
- `create`: Create new session
- `get`: Retrieve session
- `update`: Update session
- `delete`: Delete session
- `list`: List sessions
- `status`: Get status
- `cleanup`: Clean expired sessions
- `coordinate`: Coordinate agents

**Example**:
```bash
# Create session
node .claude/hooks/qe-runner.js run session-manager \
  --command create \
  --sessionData '{"type": "e2e", "suite": "user-flows", "environment": "staging"}'

# Coordinate agents
node .claude/hooks/qe-runner.js run session-manager \
  --command coordinate \
  --sessionId qe-session-789
```

## 🔄 Workflows

### Complete Test Cycle

Executes a full test lifecycle with quality gates:

1. **Session Creation** - Initialize test session
2. **Pre-test Setup** - Environment preparation
3. **Post-test Analysis** - Result analysis and reporting
4. **Quality Gates** - Standards validation
5. **Session Cleanup** - Finalization

```bash
node .claude/hooks/qe-runner.js workflow complete-test-cycle \
  --testType integration \
  --testSuite api-tests
```

### TDD Workflow

Test-driven development workflow with continuous monitoring:

1. **Session Initialization** - TDD session setup
2. **Pre-test Setup** - TDD-specific configuration
3. **Post-test Feedback** - Continuous feedback loop

```bash
node .claude/hooks/qe-runner.js workflow tdd-workflow
```

### CI/CD Integration

Quality gates integration for CI/CD pipelines:

1. **Quality Gates** - Pre-deployment validation
2. **Agent Coordination** - Distributed testing

```bash
node .claude/hooks/qe-runner.js workflow ci-cd-integration \
  --environment production \
  --pipeline build-123
```

## 🔌 Claude-Flow Integration

### Swarm Initialization

```bash
# Initialize Claude-Flow swarm
npx claude-flow@alpha swarm init --topology mesh --maxAgents 8

# Spawn QE agents
npx claude-flow@alpha agent spawn --type tester
npx claude-flow@alpha agent spawn --type reviewer
npx claude-flow@alpha agent spawn --type performance-benchmarker
```

### Hook Coordination

```bash
# Use hooks with Claude-Flow memory
npx claude-flow@alpha hooks memory-store \
  --key "qe/session/123" \
  --value '{"status": "active", "testType": "unit"}'

# Notify agents via hooks
npx claude-flow@alpha hooks notify \
  --event "test-session-start" \
  --data '{"sessionId": "123", "testType": "unit"}'
```

### Task Orchestration

```bash
# Orchestrate QE tasks across swarm
npx claude-flow@alpha task orchestrate \
  --task "Execute unit tests with coverage analysis" \
  --strategy adaptive \
  --priority high
```

## 📊 Configuration

### Quality Gates Configuration

Create `.claude/hooks/qe/quality-gates.config.json`:

```json
{
  "enforceAll": true,
  "failOnWarnings": false,
  "thresholds": {
    "testCoverage": {
      "statements": 80,
      "branches": 75,
      "functions": 80,
      "lines": 80
    },
    "testReliability": {
      "passRate": 95,
      "maxFlakyTests": 5
    },
    "codeQuality": {
      "maxComplexity": 10,
      "maxDuplication": 5,
      "maxIssues": 20
    },
    "performance": {
      "maxTestDuration": 300000,
      "maxMemoryUsage": 512,
      "maxBuildTime": 600000
    },
    "security": {
      "maxVulnerabilities": 0,
      "maxDependencyIssues": 5
    }
  }
}
```

### Session Manager Configuration

Create `.claude/hooks/qe/session-manager.config.json`:

```json
{
  "maxSessions": 10,
  "sessionTimeout": 3600000,
  "persistenceEnabled": true,
  "cleanupInterval": 300000,
  "memoryNamespace": "qe/sessions",
  "retention": {
    "maxAge": 86400000,
    "maxCount": 100
  },
  "agents": {
    "autoSpawn": true,
    "defaultAgents": ["tester", "reviewer", "analyst"]
  }
}
```

## 🎨 CI/CD Integration Examples

### GitHub Actions

```yaml
name: QE Quality Gates

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: QE Quality Gates
        run: |
          node .claude/hooks/qe-runner.js run quality-gates \
            --environment ${{ github.event.deployment.environment || 'test' }} \
            --pipeline ${{ github.run_id }} \
            --config '{"enforceAll": true, "failOnWarnings": false}'
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any

    stages {
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Quality Gates') {
            steps {
                script {
                    sh '''
                        node .claude/hooks/qe-runner.js run quality-gates \
                          --environment ${ENV} \
                          --pipeline ${BUILD_ID} \
                          --config '{"enforceAll": true}'
                    '''
                }
            }
        }
    }
}
```

### GitLab CI

```yaml
stages:
  - test
  - quality-gates

test:
  stage: test
  script:
    - npm test

quality-gates:
  stage: quality-gates
  script:
    - |
      node .claude/hooks/qe-runner.js run quality-gates \
        --environment $CI_ENVIRONMENT_NAME \
        --pipeline $CI_PIPELINE_ID \
        --config '{"enforceAll": true}'
```

## 🧪 Testing Hooks

### Test All Hooks

```bash
node .claude/hooks/qe-runner.js test
```

### Test Specific Hook

```bash
node .claude/hooks/qe-runner.js run pre-test \
  --testType unit \
  --testSuite test
```

### Run Demo

```bash
node examples/qe-hooks-demo.js
```

## 📈 Monitoring and Observability

### Hook Metrics

Hooks automatically track:
- Execution time
- Success/failure rates
- Resource usage
- Quality metrics

### Integration with Claude-Flow

```bash
# View hook execution metrics
npx claude-flow@alpha hooks memory-get --key "qe/metrics"

# Monitor real-time hook activity
npx claude-flow@alpha hooks monitor --namespace qe
```

## 🔧 Troubleshooting

### Common Issues

1. **Hook execution fails**
   ```bash
   # Check hook status
   node .claude/hooks/qe-runner.js status

   # Verify Claude-Flow integration
   npx claude-flow@alpha --version
   ```

2. **Session persistence issues**
   ```bash
   # Check session directory
   ls -la tests/sessions/

   # Verify memory access
   npx claude-flow@alpha hooks memory-list --namespace qe/sessions
   ```

3. **Quality gates failing**
   ```bash
   # Check test results
   ls -la tests/reports/

   # Review quality gate configuration
   cat .claude/hooks/qe/quality-gates.config.json
   ```

### Debug Mode

Enable debug logging:

```bash
DEBUG=qe:* node .claude/hooks/qe-runner.js run pre-test --testType unit
```

## 📚 API Reference

### Hook Registry (index.yaml)

The hook registry defines:
- Hook metadata and capabilities
- Parameter schemas
- Workflow definitions
- Integration patterns
- Configuration templates

### CLI Runner (qe-runner.js)

Commands:
- `list` - List hooks and workflows
- `info <hook>` - Show hook details
- `run <hook> [args]` - Execute hook
- `workflow <workflow> [args]` - Execute workflow
- `status` - Check system status
- `test` - Test all hooks

## 🤝 Contributing

To add new hooks:

1. Create hook script in `.claude/hooks/qe/`
2. Update `index.yaml` registry
3. Add tests and documentation
4. Update CLI runner if needed

## 📄 License

This project is licensed under the MIT License.

## 🔗 Related Documentation

- [Claude-Flow Documentation](https://github.com/ruvnet/claude-flow)
- [Agentic QE Framework](../../../README.md)
- [SPARC Methodology](../../../docs/SPARC.md)
- [Agent Types](../../../docs/agents.md)