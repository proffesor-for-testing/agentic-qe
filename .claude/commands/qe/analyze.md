# Analyze with QE Agents

Run comprehensive analysis using specialized QE agents.

## Usage
```bash
aqe analyze --type <analysis-type> --target <path>
aqe analyze --agent <agent-name> --objective "<goal>"
```

## Analysis Types
- **requirements**: Analyze requirements for testability
- **risk**: Risk assessment and prioritization
- **security**: Security vulnerability analysis
- **performance**: Performance bottleneck analysis
- **coverage**: Test coverage analysis
- **quality**: Overall quality assessment

## Examples
```bash
# Analyze requirements
aqe analyze --type requirements --target ./docs/requirements.md

# Risk analysis
aqe analyze --type risk --target ./src

# Security scan
aqe analyze --type security --target ./api

# Custom agent analysis
aqe analyze --agent test-analyzer --objective "Find test gaps"
```
