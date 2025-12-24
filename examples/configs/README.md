# Provider Configuration Examples

This directory contains example configurations for different deployment scenarios.

## Configuration Files

### 1. `local-first.yaml`
**Use Case**: Development, cost-sensitive environments, privacy-focused

**Strategy**:
- Primary: Ollama (local inference, 100% free)
- Fallback: OpenRouter (cost-effective cloud models)

**Best For**:
- Local development
- Privacy-sensitive projects
- Budget-constrained teams
- Offline-capable deployments

**Cost**: ~$0-5/day (mostly free with Ollama)

---

### 2. `hosted-only.yaml`
**Use Case**: Production environments, CI/CD pipelines, enterprise teams

**Strategy**:
- Primary: Groq (fast, generous free tier)
- Secondary: OpenRouter (multi-model routing)
- Tertiary: Claude API (premium quality)

**Best For**:
- Production deployments
- CI/CD integration
- Teams without local GPU infrastructure
- High-reliability requirements

**Cost**: ~$10-50/day (depends on usage)

---

### 3. `free-tier.yaml`
**Use Case**: Open-source projects, learning, personal use

**Strategy**:
- Primary: Groq (generous free tier)
- Secondary: Google Gemini (free tier)
- Tertiary: GitHub Models (free for GitHub users)
- Quaternary: Ollama (local, free)

**Best For**:
- Open-source projects
- Learning and experimentation
- Personal projects
- Zero-budget deployments

**Cost**: $0/day (completely free)

---

## Quick Start

### 1. Copy a Configuration

```bash
# For local development
cp examples/configs/local-first.yaml .aqe/providers.yaml

# For production
cp examples/configs/hosted-only.yaml .aqe/providers.yaml

# For free tier
cp examples/configs/free-tier.yaml .aqe/providers.yaml
```

### 2. Set Environment Variables

```bash
# Required for hosted providers
export GROQ_API_KEY="gsk_..."
export OPENROUTER_API_KEY="sk-or-v1-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="AIza..."
export GITHUB_TOKEN="ghp_..."

# Optional: Override deployment mode
export LLM_MODE="local_first"

# Optional: Explicit provider selection
export LLM_PROVIDER="groq"
```

### 3. Initialize Agentic QE

```bash
# The configuration is automatically loaded
aqe init

# Verify configuration
aqe config show
```

---

## Configuration Syntax

### Basic Structure

```yaml
mode: local_first | hosted | free_only | hybrid

providers:
  - type: ollama | groq | openrouter | claude | google | github
    enabled: true
    priority: 10  # Lower = higher priority
    apiKey: ${ENV_VAR}  # Environment variable interpolation
    baseUrl: https://api.example.com
    defaultModel: model-name

    modelOverrides:
      test-generation: specialized-model
      code-review: another-model

    costPer1MTokens:
      input: 0.59
      output: 0.79

    limits:
      requestsPerMinute: 30
      tokensPerMinute: 20000

    fallbackProvider: backup-provider

fallbackChain:
  - primary-provider
  - secondary-provider
  - tertiary-provider

costBudget:
  daily: 20.0
  monthly: 500.0
  warnThreshold: 80
  enforceLimit: true
```

### Environment Variable Interpolation

Use `${VAR_NAME}` to inject environment variables:

```yaml
providers:
  - type: groq
    apiKey: ${GROQ_API_KEY}
    baseUrl: ${GROQ_BASE_URL}  # Optional override
```

### Task-Specific Model Routing

Route different task types to specialized models:

```yaml
modelOverrides:
  test-generation: qwen2.5-coder:7b      # Code-focused model
  code-review: deepseek-coder:6.7b       # Review-optimized
  documentation: llama3.2:3b             # Lightweight for docs
  security-scanning: claude-3.5-sonnet   # Premium for security
```

### Rate Limiting

Configure rate limits to stay within provider quotas:

```yaml
limits:
  requestsPerMinute: 30
  requestsPerDay: 14400
  tokensPerMinute: 20000
  tokensPerDay: 1000000
```

### Cost Budgets

Set spending limits with automatic enforcement:

```yaml
costBudget:
  daily: 5.0           # $5/day hard limit
  monthly: 100.0       # $100/month hard limit
  warnThreshold: 80    # Warn at 80% of budget
  enforceLimit: true   # Block requests when budget exceeded
```

---

### 4. `hybrid.yaml`
**Use Case**: Adaptive workloads, intelligent cost optimization

**Strategy**:
- Primary: Groq (fast inference for complex tasks)
- Secondary: Ollama (local for simple tasks)
- Tertiary: OpenRouter (premium quality when needed)

**Best For**:
- Teams with varied workloads
- Dynamic cost optimization
- Performance tuning based on task complexity

**Cost**: ~$5-20/day (adaptive based on usage)

---

## Deployment Mode Comparison

| Feature | local_first | hosted | free_only | hybrid |
|---------|------------|--------|-----------|--------|
| **Primary Provider** | Ollama | Groq | Groq/Google | Groq/Ollama |
| **Fallback** | OpenRouter | OpenRouter/Claude | Google/GitHub | Multi-tier |
| **Cost** | $0-5/day | $10-50/day | $0/day | $5-20/day |
| **Latency** | Low (local) | Medium | Variable | Adaptive |
| **Privacy** | High | Medium | Low | Medium-High |
| **Reliability** | Medium | High | Medium | High |
| **Setup Complexity** | High | Low | Low | Medium |
| **Best For** | Dev/Privacy | Production | Open Source | Adaptive Teams |

---

## Troubleshooting

### Configuration Not Loading

```bash
# Check default locations
ls -la .aqe/providers.yaml
ls -la aqe.config.yaml

# Enable debug logging
export LOG_LEVEL=debug
aqe init
```

### Provider Initialization Fails

```bash
# Verify API keys
echo $GROQ_API_KEY
echo $OPENROUTER_API_KEY

# Test provider health
aqe providers health

# Check specific provider
aqe providers test groq
```

### Environment Variables Not Interpolating

```bash
# Ensure variables are exported
export GROQ_API_KEY="gsk_..."

# Verify interpolation syntax
cat .aqe/providers.yaml | grep '${GROQ_API_KEY}'
```

---

## Next Steps

1. **Customize**: Edit the configuration to match your needs
2. **Test**: Run `aqe init` to validate the configuration
3. **Monitor**: Use `aqe providers status` to check health
4. **Optimize**: Adjust models and priorities based on usage

For more information, see:
- [Configuration Reference](/docs/reference/configuration.md)
- [Provider Guide](/docs/guides/providers.md)
- [Cost Optimization](/docs/guides/cost-optimization.md)
