# Agentic QE CLI Usage Guide

## 🚀 Getting Started

### Local Installation and Setup

Since `agentic-qe` is not yet published to npm, you need to set it up locally:

```bash
# Clone or navigate to your agentic-qe directory
cd /Users/profa/coding/agentic-qe

# Install dependencies
npm install

# Link the CLI globally (makes 'aqe' command available system-wide)
npm link

# Verify installation
aqe --version
aqe --help
```

### Alternative: Use Without Global Installation

```bash
# Run directly with npx and ts-node
npx ts-node cli/bin/aqe-simple.ts --help

# Or add to package.json scripts
npm run cli:dev -- --help
```

## 📋 Available Commands

### 1. List Available Agents

```bash
# Show all available QE agents
aqe agents
```

Output shows all configured agents:
- ✓ functional-positive (Happy path testing)
- ✓ functional-negative (Error/boundary testing)
- ✓ security-auth (Authentication testing)
- ✓ performance-analyzer (Performance analysis)
- ... and more

### 2. Run a Specific Agent

```bash
# Basic usage
aqe run <agent-name>

# With options
aqe run functional-positive --spec ./api/openapi.yaml --output ./tests

# Examples
aqe run functional-negative --spec api.yaml -o ./negative-tests
aqe run security-auth --spec api.yaml --verbose
aqe run performance-analyzer --output ./perf-results
```

**Available Options:**
- `-s, --spec <path>`: API specification file
- `-o, --output <path>`: Output directory (default: ./test-results)
- `-v, --verbose`: Enable verbose output

### 3. Interactive Mode

```bash
# Launch interactive agent selection
aqe interactive
```

This will prompt you to:
1. Select an agent from a list
2. Optionally provide API specification
3. Choose output directory
4. Run the selected agent

### 4. SPARC Methodology

```bash
# Run specific SPARC phase
aqe sparc spec --input requirements.md
aqe sparc architecture --output ./arch-docs
aqe sparc refinement

# Available phases:
# - spec: Specification analysis
# - pseudocode: Algorithm design
# - architecture: System design
# - refinement: Implementation refinement
# - completion: Final integration
# - full: Complete SPARC workflow
```

### 5. Swarm Orchestration

```bash
# Initialize a swarm
aqe swarm init --topology mesh --agents functional-positive,functional-negative

# Run swarm
aqe swarm run --agents security-auth,security-injection

# Check swarm status
aqe swarm status

# Stop swarm
aqe swarm stop
```

**Topology Options:**
- `mesh`: Peer-to-peer communication
- `hierarchical`: Tree structure
- `ring`: Circular communication
- `star`: Centralized hub

### 6. Quick Validation

```bash
# Run quick checks on your codebase
aqe quick-check
```

Performs rapid validation:
- Functional test scan
- Security quick audit
- Performance check
- Accessibility validation

### 7. Test Execution

```bash
# Run unit tests
aqe test unit

# Run integration tests
aqe test integration
```

## 🎯 Real-World Usage Examples

### Example 1: API Testing Workflow

```bash
# Step 1: Validate API specification
aqe run spec-linter --spec ./api/openapi.yaml

# Step 2: Generate positive tests
aqe run functional-positive --spec ./api/openapi.yaml --output ./tests/positive

# Step 3: Generate negative tests
aqe run functional-negative --spec ./api/openapi.yaml --output ./tests/negative

# Step 4: Security audit
aqe run security-auth --spec ./api/openapi.yaml --output ./tests/security

# Step 5: Performance test planning
aqe run performance-planner --spec ./api/openapi.yaml --output ./tests/performance
```

### Example 2: Pre-Deployment Validation

```bash
# Quick validation before deployment
aqe quick-check

# Run critical agents
aqe run production-observer --output ./pre-deploy-check
aqe run deployment-guardian --output ./deployment-validation
aqe run risk-oracle --output ./risk-assessment
```

### Example 3: Continuous Testing

```bash
# Add to package.json scripts
{
  "scripts": {
    "test:qe": "aqe quick-check",
    "test:functional": "aqe run functional-positive && aqe run functional-negative",
    "test:security": "aqe run security-auth && aqe run security-injection",
    "test:full": "aqe swarm run --agents functional-positive,functional-negative,security-auth,performance-analyzer"
  }
}

# Run from npm
npm run test:qe
npm run test:functional
npm run test:security
npm run test:full
```

### Example 4: CI/CD Integration

```yaml
# .github/workflows/qe-tests.yml
name: QE Testing

on: [push, pull_request]

jobs:
  quality-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Link CLI
        run: npm link

      - name: Run QE Tests
        run: |
          aqe quick-check
          aqe run functional-positive --output ./test-results
          aqe run security-auth --output ./test-results

      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: ./test-results
```

### Example 5: Interactive Development

```bash
# Start interactive mode for exploratory testing
aqe interactive

# Follow prompts:
# 1. Select "Exploratory Testing Navigator"
# 2. Provide your application URL or API spec
# 3. Let the agent guide your testing session
```

## 📁 Output Structure

Each agent run creates a JSON report with:

```json
{
  "agent": "functional-positive",
  "timestamp": "2025-01-15T12:00:00Z",
  "configuration": {
    "spec": "./api/openapi.yaml",
    "output": "./test-results"
  },
  "status": "completed",
  "results": {
    "message": "functional-positive analysis completed successfully",
    "testsGenerated": 42,
    "issues": 2
  }
}
```

## 🔧 Configuration

Create `.aqe.config.json` in your project root:

```json
{
  "defaultAgents": ["functional-positive", "functional-negative", "security-auth"],
  "outputDir": "./qe-results",
  "verbose": false,
  "topology": "mesh",
  "apiSpec": "./api/openapi.yaml"
}
```

## 🐛 Troubleshooting

### Command not found: aqe

```bash
# Ensure npm link was run
cd /Users/profa/coding/agentic-qe
npm link

# Or use npx directly
npx ts-node /Users/profa/coding/agentic-qe/cli/bin/aqe-simple.ts
```

### TypeScript errors

```bash
# Install TypeScript dependencies
npm install

# Use ts-node directly
npx ts-node cli/bin/aqe-simple.ts
```

### Permission denied

```bash
# Make CLI executable
chmod +x cli/bin/aqe-simple.ts
```

## 🚦 Next Steps

1. **Extend the CLI**: The current implementation is a foundation. Actual agent logic needs to be integrated.

2. **Publish to npm**: Once ready, publish the package:
   ```bash
   npm publish
   ```

3. **Add Real Agent Integration**: Connect the CLI to actual agent implementations:
   - Load agent configurations from YAML files
   - Execute agent logic
   - Generate real test cases
   - Integrate with testing frameworks

4. **Add Configuration Management**:
   - Support for .aqe.config.json
   - Environment-specific configurations
   - Plugin system for custom agents

## 📚 Additional Resources

- [Agent Definitions](../agents/README.md)
- [SPARC Methodology](./SPARC-GUIDE.md)
- [Swarm Orchestration](./SWARM-PATTERNS.md)
- [Contributing Guide](../CONTRIBUTING.md)

---

**Note**: This CLI is currently in development. The commands work but generate simulated output. Full agent integration is being implemented.