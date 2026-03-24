---
name: "stream-chain"
description: "Execute multi-step agent workflows where each step's output flows to the next. Build custom chains or use predefined pipelines for analysis, refactoring, testing, and optimization. Use when orchestrating sequential agent pipelines."
---

# Stream-Chain

Sequential multi-agent pipelines where each step's output feeds the next. Custom chains for flexibility, predefined pipelines for common tasks.

## Quick Start

```bash
# Custom chain
claude-flow stream-chain run \
  "Analyze codebase structure" \
  "Identify improvement areas" \
  "Generate action plan"

# Predefined pipeline
claude-flow stream-chain pipeline analysis
```

## Custom Chains

```bash
claude-flow stream-chain run <prompt1> <prompt2> [...] [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--verbose` | Detailed execution info | false |
| `--timeout <s>` | Timeout per step | 30 |
| `--debug` | Full logging | false |

**Minimum 2 prompts required.** Each step receives the previous output as context.

### Examples

```bash
# Security audit
claude-flow stream-chain run \
  "Analyze authentication system for vulnerabilities" \
  "Categorize security issues by severity" \
  "Propose fixes with priority" \
  "Generate security test cases" \
  --timeout 45

# Code refactoring
claude-flow stream-chain run \
  "Identify code smells in src/" \
  "Create refactoring plan" \
  "Apply top 3 priority refactors" \
  "Verify refactored code" \
  --debug
```

## Predefined Pipelines

```bash
claude-flow stream-chain pipeline <type> [options]
```

| Pipeline | Steps | Use Case |
|----------|-------|----------|
| `analysis` | Structure -> Issues -> Recommendations | Codebase onboarding, tech debt, architecture review |
| `refactor` | Candidates -> Prioritization -> Implementation | Legacy modernization, pattern implementation |
| `test` | Coverage analysis -> Test design -> Test generation | Increasing coverage, TDD, regression tests |
| `optimize` | Profiling -> Strategy -> Implementation | Performance, latency reduction, scalability |

### Pipeline Examples

```bash
claude-flow stream-chain pipeline refactor --timeout 60 --verbose
claude-flow stream-chain pipeline test --debug
claude-flow stream-chain pipeline optimize --timeout 90
```

## Custom Pipeline Definitions

Define reusable pipelines in `.claude-flow/config.json`:

```json
{
  "streamChain": {
    "pipelines": {
      "security": {
        "name": "Security Audit Pipeline",
        "prompts": [
          "Scan codebase for security vulnerabilities",
          "Categorize by severity",
          "Generate fixes with priority",
          "Create security test suite"
        ],
        "timeout": 45
      }
    }
  }
}
```

```bash
claude-flow stream-chain pipeline security
```

## Best Practices

1. **Specific prompts** -- `"Analyze authentication.js for SQL injection"` not `"Check security"`
2. **Logical progression** -- Identify -> Analyze -> Design -> Implement -> Verify
3. **Appropriate timeouts** -- 30s simple, 45-60s analysis, 60-90s implementation
4. **Include verification** -- Always end chains with a validation step
5. **Iterative refinement** -- Generate -> Review -> Refine -> Final check

## Integration

```bash
# Combine with swarm coordination
claude-flow swarm init --topology mesh
claude-flow stream-chain run "Research" "Implement" "Test" "Review"

# Memory integration -- results auto-stored in .claude-flow/memory/stream-chain/
claude-flow stream-chain run "Analyze requirements" "Design architecture" --verbose
```

## Related Skills

- **SPARC Methodology** -- Systematic development workflow
- **Swarm Coordination** -- Multi-agent orchestration
- **Memory Management** -- Persistent context storage
