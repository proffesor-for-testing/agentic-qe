# Multi-Provider Configuration Guide

## Overview

Agentic QE supports multiple LLM providers with flexible YAML-based configuration. This allows you to optimize for cost, performance, privacy, and reliability based on your deployment needs.

## Quick Start

### 1. Choose a Configuration Template

```bash
# Copy a template to your project
cp examples/configs/local-first.yaml .aqe/providers.yaml

# Or create from scratch
mkdir -p .aqe
touch .aqe/providers.yaml
```

### 2. Set Environment Variables

```bash
# Add to your .bashrc or .zshrc
export GROQ_API_KEY="gsk_..."
export OPENROUTER_API_KEY="sk-or-v1-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 3. Initialize Agentic QE

```bash
aqe init
```

---

## Deployment Modes

### Local First (`local_first`)

Prioritizes local providers with cloud fallback.

**Use Cases**:
- Development environments
- Privacy-sensitive projects
- Cost optimization
- Offline capability

**Provider Priority**:
1. Ollama (local, free)
2. ruvLLM (local, free)
3. OpenRouter (cloud, paid)

**Example**:
```yaml
mode: local_first

providers:
  - type: ollama
    enabled: true
    priority: 10
    defaultModel: llama3.2:3b

  - type: openrouter
    enabled: true
    priority: 20
    apiKey: ${OPENROUTER_API_KEY}
    defaultModel: google/gemini-flash-1.5-8b
```

---

### Hosted Only (`hosted`)

Uses only cloud-hosted providers.

**Use Cases**:
- Production deployments
- CI/CD pipelines
- No local GPU infrastructure
- High reliability requirements

**Provider Priority**:
1. Groq (fast, affordable)
2. OpenRouter (multi-model)
3. Claude (premium)

**Example**:
```yaml
mode: hosted

providers:
  - type: groq
    enabled: true
    priority: 10
    apiKey: ${GROQ_API_KEY}
    defaultModel: llama-3.3-70b-versatile

  - type: openrouter
    enabled: true
    priority: 20
    apiKey: ${OPENROUTER_API_KEY}
    defaultModel: anthropic/claude-3.5-sonnet
```

---

### Free Tier Only (`free_only`)

Uses only free-tier models and providers.

**Use Cases**:
- Open-source projects
- Learning and experimentation
- Personal projects
- Zero-budget deployments

**Provider Priority**:
1. Groq (generous free tier)
2. Google Gemini (free tier)
3. GitHub Models (free for GitHub users)
4. Ollama (local, free)

**Example**:
```yaml
mode: free_only

providers:
  - type: groq
    enabled: true
    priority: 10
    apiKey: ${GROQ_API_KEY}
    defaultModel: llama-3.3-70b-versatile

  - type: google
    enabled: true
    priority: 20
    apiKey: ${GOOGLE_API_KEY}
    defaultModel: gemini-2.0-flash-exp
```

---

### Hybrid (`hybrid`)

Intelligently balances local and hosted providers.

**Use Cases**:
- Adaptive workloads
- Cost optimization
- Performance tuning

**Provider Priority**:
- Simple tasks: Local providers
- Complex tasks: Hosted providers
- Critical tasks: Premium providers

**Example**:
```yaml
mode: hybrid

providers:
  - type: ollama
    priority: 15
    modelOverrides:
      documentation: llama3.2:3b

  - type: groq
    priority: 10
    modelOverrides:
      test-generation: llama-3.3-70b-versatile

  - type: openrouter
    priority: 20
    modelOverrides:
      security-scanning: anthropic/claude-3.5-sonnet
```

---

## Configuration Options

### Provider Configuration

```yaml
providers:
  - type: ollama | groq | openrouter | claude | ruvllm | google | together | github
    enabled: true | false
    priority: 10  # Lower = higher priority

    # Authentication
    apiKey: ${ENV_VAR}
    baseUrl: https://api.example.com
    headers:
      X-Custom-Header: value

    # Models
    defaultModel: model-name
    modelOverrides:
      test-generation: specialized-model
      code-review: review-optimized-model
      security-scanning: security-model

    # Rate Limits
    limits:
      requestsPerMinute: 30
      requestsPerDay: 14400
      tokensPerMinute: 20000
      tokensPerDay: 1000000

    # Cost Tracking
    costPer1MTokens:
      input: 0.59
      output: 0.79
      cacheReadMultiplier: 0.1
      cacheWriteMultiplier: 1.25

    # Capabilities
    supportsStreaming: true
    supportsCaching: false
    supportsEmbeddings: true
    supportsVision: false

    # Fallback
    fallbackProvider: backup-provider
```

### Global Options

```yaml
# Fallback chain
fallbackChain:
  - primary-provider
  - secondary-provider

# Cost budget
costBudget:
  daily: 10.0
  monthly: 250.0
  warnThreshold: 80
  enforceLimit: true

# Health checks
enableHealthChecks: true
healthCheckInterval: 60000
maxConsecutiveFailures: 3

# Retries
enableRetries: true
maxRetries: 3

# Caching
enableCaching: true
cacheTTL: 3600

# Logging
logLevel: debug | info | warn | error
```

---

## Task-Specific Routing

Route different task types to specialized models:

```yaml
providers:
  - type: openrouter
    defaultModel: anthropic/claude-3.5-haiku

    modelOverrides:
      # Code-focused tasks
      test-generation: qwen/qwen-2.5-coder-32b-instruct
      refactoring: qwen/qwen-2.5-coder-32b-instruct

      # Review tasks
      code-review: anthropic/claude-3.5-sonnet
      security-scanning: anthropic/claude-3.5-sonnet

      # Documentation
      documentation: google/gemini-flash-1.5-8b

      # Analysis
      coverage-analysis: meta-llama/llama-3.1-70b-instruct
      performance-testing: meta-llama/llama-3.1-70b-instruct
```

**Available Task Types**:
- `test-generation`
- `coverage-analysis`
- `code-review`
- `bug-detection`
- `documentation`
- `refactoring`
- `performance-testing`
- `security-scanning`
- `accessibility-testing`

---

## Environment Variables

### Standard Variables

```bash
# Provider API Keys
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENROUTER_API_KEY="sk-or-v1-..."
export GROQ_API_KEY="gsk_..."
export GOOGLE_API_KEY="AIza..."
export TOGETHER_API_KEY="..."
export GITHUB_TOKEN="ghp_..."

# Provider URLs (optional overrides)
export OLLAMA_HOST="http://localhost:11434"
export RUVLLM_HOST="http://localhost:8080"

# Global settings
export LLM_PROVIDER="groq"        # Override default provider
export LLM_MODE="local_first"     # Override deployment mode
```

### Variable Interpolation

Use `${VAR_NAME}` in YAML files:

```yaml
providers:
  - type: groq
    apiKey: ${GROQ_API_KEY}
    baseUrl: ${GROQ_BASE_URL}
```

---

## Cost Management

### Setting Budgets

```yaml
costBudget:
  daily: 5.0           # $5/day limit
  monthly: 100.0       # $100/month limit
  warnThreshold: 80    # Warn at 80%
  enforceLimit: true   # Block when exceeded
```

### Tracking Costs

```bash
# View cost summary
aqe costs summary

# Daily breakdown
aqe costs daily

# By provider
aqe costs by-provider

# Current budget status
aqe costs budget
```

### Cost Optimization Tips

1. **Use free tiers**: Groq, Google Gemini, GitHub Models
2. **Enable caching**: 90% discount on cache hits (Claude, OpenRouter)
3. **Route intelligently**: Use cheap models for simple tasks
4. **Set budgets**: Prevent runaway costs with hard limits
5. **Monitor usage**: Track costs daily and adjust

---

## Health Monitoring

### Automatic Health Checks

```yaml
enableHealthChecks: true
healthCheckInterval: 60000  # 1 minute
maxConsecutiveFailures: 3   # Mark unhealthy after 3 failures
```

### Manual Health Checks

```bash
# Check all providers
aqe providers health

# Check specific provider
aqe providers health groq

# Detailed status
aqe providers status --verbose
```

---

## Fallback Chains

### Configuration

```yaml
# Simple chain
fallbackChain:
  - groq
  - openrouter
  - claude

# Per-provider fallback
providers:
  - type: groq
    fallbackProvider: openrouter

  - type: openrouter
    fallbackProvider: claude
```

### Behavior

1. Try primary provider
2. If fails, try fallback
3. Continue chain until success
4. Log all attempts
5. Return error if all fail

---

## Examples

### Minimal Configuration

```yaml
mode: hybrid

providers:
  - type: groq
    enabled: true
    priority: 10
    apiKey: ${GROQ_API_KEY}
    defaultModel: llama-3.3-70b-versatile
```

### Full Configuration

See `examples/configs/` for complete examples:
- `local-first.yaml`
- `hosted-only.yaml`
- `free-tier.yaml`
- `hybrid.yaml`

---

## Troubleshooting

### Configuration Not Loading

```bash
# Check file location
ls -la .aqe/providers.yaml

# Enable debug logging
export LOG_LEVEL=debug
aqe init
```

### Provider Fails to Initialize

```bash
# Verify API key
echo $GROQ_API_KEY

# Test provider
aqe providers test groq

# Check health
aqe providers health groq
```

### Environment Variables Not Working

```bash
# Ensure exported
export GROQ_API_KEY="..."

# Check interpolation
cat .aqe/providers.yaml | grep GROQ

# Reload shell
source ~/.bashrc
```

---

## Best Practices

1. **Start with templates**: Use examples as starting point
2. **Use environment variables**: Never commit API keys
3. **Set cost budgets**: Prevent surprises
4. **Enable health checks**: Automatic failover
5. **Route by task type**: Optimize per use case
6. **Monitor costs**: Track daily spending
7. **Test configuration**: `aqe init --dry-run`

---

## Next Steps

- [Provider Reference](/docs/reference/providers.md)
- [Cost Optimization Guide](/docs/guides/cost-optimization.md)
- [API Documentation](/docs/api/configuration.md)
