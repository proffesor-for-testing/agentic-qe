# Multi-Model Router Setup & Usage Guide

## Overview

The **agentic-flow Multi-Model Router** provides intelligent model selection with **70-85% cost savings** while maintaining quality. It's fully integrated in your DevPod workspace with all environment variables configured globally.

## ✅ Current Setup Status

Your workspace has agentic-flow **v1.9.4** installed globally with:

```bash
✅ agentic-flow CLI: /usr/local/share/nvm/versions/node/v22.19.0/bin/agentic-flow
✅ Version: v1.9.4
✅ Environment Variables: Configured in ~/.bashrc
   - AGENTIC_FLOW_TRANSPORT=quic
   - QUIC_PORT=4433
   - AGENTIC_FLOW_OPTIMIZE=true
   - AGENTIC_FLOW_PRIORITY=quality
   - ANTHROPIC_API_KEY (set)
   - OPENROUTER_API_KEY (set)
   - OPENAI_API_KEY (set)
```

## 🚀 Quick Start

### 1. Basic Model Optimization

```bash
# Auto-select best model for task (balanced priority)
agentic-flow --agent coder --task "Create REST API" --optimize

# Optimize for cost (cheapest models)
agentic-flow --agent coder --task "Simple function" --optimize --priority cost

# Optimize for quality (flagship models)
agentic-flow --agent reviewer --task "Security audit" --optimize --priority quality

# Optimize for speed (fastest models)
agentic-flow --agent researcher --task "Quick research" --optimize --priority speed

# Optimize for privacy (local ONNX models)
agentic-flow --agent coder --task "Offline task" --optimize --priority privacy
```

### 2. Budget Constraints

```bash
# Set maximum cost per task ($0.001 = 1/10th of a cent)
agentic-flow --agent coder --task "Build feature" --optimize --max-cost 0.001

# Cost-optimized with budget cap
agentic-flow --agent qe-test-generator \
  --task "Generate tests" \
  --optimize \
  --priority cost \
  --max-cost 0.002
```

### 3. QE Agent Integration

```bash
# Test generation with cost optimization
agentic-flow --agent qe-test-generator \
  --task "Generate unit tests for UserService" \
  --optimize \
  --priority cost

# Coverage analysis with balanced optimization
agentic-flow --agent qe-coverage-analyzer \
  --task "Analyze test coverage gaps" \
  --optimize \
  --priority balanced

# Security scanning with quality optimization
agentic-flow --agent qe-security-scanner \
  --task "Security audit of authentication" \
  --optimize \
  --priority quality

# Performance testing with speed optimization
agentic-flow --agent qe-performance-tester \
  --task "Load test API endpoints" \
  --optimize \
  --priority speed
```

## 🎯 Optimization Priorities

| Priority | Use Case | Models | Cost Savings |
|----------|----------|--------|--------------|
| **quality** | Security audits, architecture reviews | Claude Sonnet 4.5, GPT-4o | 0% (baseline) |
| **balanced** | General development, code reviews | DeepSeek R1, Gemini 2.5 Flash | 60-70% |
| **cost** | Simple tasks, test generation | DeepSeek Chat V3, Llama 3.1 8B | 85-98% |
| **speed** | Quick research, rapid iterations | Gemini 2.5 Flash | 40-60% |
| **privacy** | Offline work, sensitive data | ONNX Phi-4 (local) | 100% (no API) |

## 📊 Model Capabilities

### Flagship Models (Quality Priority)
```
Claude Sonnet 4.5
├─ Quality: 95/100
├─ Speed: 85/100
├─ Cost: 20/100
└─ Best for: Security, architecture, complex algorithms

GPT-4o
├─ Quality: 92/100
├─ Speed: 80/100
├─ Cost: 25/100
└─ Best for: Multi-modal tasks, long-form content
```

### Mid-Tier Models (Balanced Priority)
```
DeepSeek R1
├─ Quality: 85/100
├─ Speed: 70/100
├─ Cost: 90/100
└─ Best for: Code generation, reasoning tasks

Gemini 2.5 Flash
├─ Quality: 80/100
├─ Speed: 95/100
├─ Cost: 85/100
└─ Best for: Fast iterations, research
```

### Budget Models (Cost Priority)
```
DeepSeek Chat V3
├─ Quality: 80/100
├─ Speed: 75/100
├─ Cost: 98/100
└─ Best for: Simple tasks, test generation

Llama 3.1 8B
├─ Quality: 75/100
├─ Speed: 85/100
├─ Cost: 95/100
└─ Best for: Quick tasks, documentation
```

## 🔧 MCP Tool Integration

### Using via Claude Code

```typescript
// MCP tool for model optimization
mcp__agentic-flow__agentic_flow_optimize_model({
  agent: "qe-test-generator",
  task: "Generate unit tests for authentication",
  priority: "cost",
  max_cost: 0.001
})

// Execute agent with optimization
mcp__agentic-flow__agentic_flow_agent({
  agent: "coder",
  task: "Create REST API",
  provider: "openrouter", // or "anthropic", "gemini", "onnx"
  model: "deepseek/deepseek-r1:free", // optional, auto-selected if not specified
  temperature: 0.7,
  maxTokens: 4096,
  outputFormat: "markdown"
})
```

### Available MCP Tools (7 total)

```bash
agentic-flow mcp list

Output:
• agentic_flow_agent           - Execute agent with specific task
• agentic_flow_optimize_model  - Get model recommendations
• agentic_flow_list_agents     - List all 150+ agents
• agentic_flow_create_agent    - Create custom agent
• agentic_flow_list_all_agents - List package + local agents
• agentic_flow_agent_info      - Get agent details
• agentic_flow_check_conflicts - Check agent conflicts
```

## 💰 Cost Savings Examples

### Example 1: Test Generation

**Before Optimization (always Claude Sonnet 4.5):**
- 100 test generation tasks
- Cost: $0.015/task × 100 = **$1.50**

**After Optimization (cost priority):**
- 100 test generation tasks → DeepSeek Chat V3
- Cost: $0.0008/task × 100 = **$0.08**
- **Savings: $1.42 (94.7%)**

### Example 2: Mixed Workload

**Before Optimization:**
- 50 simple tasks (Claude): $0.75
- 30 complex tasks (Claude): $0.45
- 20 security audits (Claude): $0.30
- **Total: $1.50**

**After Optimization:**
- 50 simple → DeepSeek Chat ($0.04)
- 30 complex → DeepSeek R1 ($0.24)
- 20 security → Claude Sonnet 4.5 ($0.30)
- **Total: $0.58**
- **Savings: $0.92 (61%)**

## 🔄 Provider Fallback (v1.9.4)

Automatic failover between providers with circuit breaker:

```bash
# Automatic fallback chain
Primary: OpenRouter (DeepSeek R1)
   ↓ (if fails)
Secondary: Gemini (Gemini 2.5 Flash)
   ↓ (if fails)
Tertiary: Claude (Sonnet 4.5)
   ↓ (if fails)
Final: ONNX (local Phi-4)
```

### Features

- ✅ **Circuit Breaker**: Auto-recovery after timeout
- ✅ **Health Monitoring**: Success rate, latency tracking
- ✅ **Cost Optimization**: 70% savings with smart routing
- ✅ **Crash Recovery**: Checkpointing for long tasks
- ✅ **Budget Controls**: Hard limits on spending

### Configuration

```bash
# Provider fallback is automatic
# Configure via environment variables or config files

export AGENTIC_FLOW_FALLBACK_ENABLED=true
export AGENTIC_FLOW_PRIMARY_PROVIDER=openrouter
export AGENTIC_FLOW_FALLBACK_CHAIN=gemini,anthropic,onnx
```

## 🚀 QUIC Transport (Ultra-Low Latency)

Your workspace has QUIC transport enabled (50-70% faster than TCP):

```bash
# Environment variable already set
echo $AGENTIC_FLOW_TRANSPORT
# Output: quic

echo $QUIC_PORT
# Output: 4433

# Start QUIC server manually (if needed)
agentic-flow quic --port 4433

# Test QUIC with WASM bindings
npm run test:quic:wasm
```

### QUIC Benefits

- ✅ **0-RTT**: Instant reconnection without handshake
- ✅ **Stream Multiplexing**: 100+ concurrent messages
- ✅ **Built-in TLS 1.3**: Encrypted by default
- ✅ **Connection Migration**: Survives network changes
- ✅ **Reduced Latency**: Perfect for agent coordination

## 📈 Monitoring & Debugging

### View Optimization Output

```bash
# Enable verbose mode to see optimization details
agentic-flow --agent coder \
  --task "Test task" \
  --optimize \
  --priority balanced \
  --verbose

# Output includes:
# ════════════════════════════════════════════════════════════
# 🎯 Optimized Model Selection
# ════════════════════════════════════════════════════════════
# Model: DeepSeek R1
# Provider: openrouter
# Tier: mid-tier
#
# Scores:
#   Quality:  85/100
#   Speed:    70/100
#   Cost:     90/100
#   Overall:  80/100
#
# Cost: $0.16/1M input, $0.64/1M output
#
# Reasoning:
#   Balanced selection (overall: 80/100). Optimized for coder
#   agent tasks. Estimated cost: $0.0008 per task. Tier: mid-tier
# ════════════════════════════════════════════════════════════
```

### Check Provider Status

```bash
# Check provider configuration
agentic-flow --help | grep -A 5 "Provider Selection"

# List available models
agentic-flow --help | grep -A 10 "OPENROUTER MODELS"

# Check MCP server status
agentic-flow mcp status
```

### Cost Tracking

```bash
# View cost estimates in optimization output
agentic-flow --agent coder --task "Test" --optimize --verbose | grep -i cost

# Example output:
# Cost: $0.16/1M input, $0.64/1M output
# Estimated cost: $0.0008 per task
```

## 🎓 Best Practices

### 1. Choose Right Priority for Task

```bash
✅ GOOD:
agentic-flow --agent qe-security-scanner \
  --task "Security audit" \
  --optimize --priority quality  # Security needs quality!

❌ BAD:
agentic-flow --agent qe-security-scanner \
  --task "Security audit" \
  --optimize --priority cost  # Security is not the place to cut costs!
```

### 2. Use Budget Caps for Experiments

```bash
✅ GOOD:
agentic-flow --agent coder \
  --task "Experimental feature" \
  --optimize --max-cost 0.005  # Safe budget limit

❌ BAD:
agentic-flow --agent coder \
  --task "Experimental feature"  # No cost limit, could use expensive model
```

### 3. Leverage Agent-Specific Optimization

```bash
# The router knows qe-test-generator can use cheaper models
agentic-flow --agent qe-test-generator \
  --task "Generate tests" \
  --optimize  # Auto-selects cost-effective model

# The router knows qe-security-scanner needs quality
agentic-flow --agent qe-security-scanner \
  --task "Security scan" \
  --optimize  # Auto-selects high-quality model
```

## 🔧 Advanced Configuration

### Environment Variables

```bash
# Already set in ~/.bashrc
export AGENTIC_FLOW_OPTIMIZE=true          # Enable optimization by default
export AGENTIC_FLOW_PRIORITY=quality       # Default priority
export AGENTIC_FLOW_TRANSPORT=quic         # Use QUIC transport
export QUIC_PORT=4433                      # QUIC server port

# Optional additional settings
export AGENTIC_FLOW_MAX_COST=0.01         # Global max cost per task
export AGENTIC_FLOW_FALLBACK_ENABLED=true # Enable provider fallback
export AGENTIC_FLOW_VERBOSE=true          # Always show optimization details
```

### Config File (Alternative to Env Vars)

Create `~/.agentic-flow/config.json`:

```json
{
  "optimization": {
    "enabled": true,
    "defaultPriority": "balanced",
    "maxCostPerTask": 0.01
  },
  "providers": {
    "primary": "openrouter",
    "fallbackChain": ["gemini", "anthropic", "onnx"],
    "circuitBreakerTimeout": 30000
  },
  "transport": {
    "type": "quic",
    "port": 4433
  }
}
```

## 🧪 Testing the Setup

Run the comprehensive integration tests:

```bash
# Run multi-model router tests
npm run test:integration -- tests/integration/multi-model-router.test.ts

# Or run all integration tests
npm run test:integration
```

## 📚 Documentation References

- **Main Docs**: `docs/agentic-flow/benchmarks/MODEL_CAPABILITIES.md`
- **Provider Fallback**: `docs/PROVIDER-FALLBACK-GUIDE.md`
- **QUIC Transport**: `docs/agentic-flow/QUIC-TRANSPORT.md`
- **MCP Tools**: Run `agentic-flow mcp list`

## 🆘 Troubleshooting

### Issue: Optimization not working

```bash
# Check if environment variables are set
env | grep AGENTIC_FLOW

# Verify API keys are configured
env | grep -E "ANTHROPIC_API_KEY|OPENROUTER_API_KEY"

# Test with verbose mode
agentic-flow --agent coder --task "Test" --optimize --verbose
```

### Issue: Provider fallback not triggering

```bash
# Enable fallback explicitly
export AGENTIC_FLOW_FALLBACK_ENABLED=true

# Check provider status
agentic-flow mcp status

# Test with verbose mode to see provider selection
agentic-flow --agent coder --task "Test" --optimize --verbose 2>&1 | grep "Provider"
```

### Issue: QUIC transport errors

```bash
# Verify QUIC is configured
echo $AGENTIC_FLOW_TRANSPORT  # Should output: quic
echo $QUIC_PORT               # Should output: 4433

# Test QUIC server
agentic-flow quic --port 4433

# Fallback to TCP if needed
export AGENTIC_FLOW_TRANSPORT=tcp
```

## 🎯 Summary

Your DevPod workspace is **fully configured** for Multi-Model Router:

✅ agentic-flow v1.9.4 installed globally
✅ Environment variables configured in ~/.bashrc
✅ QUIC transport enabled (50-70% faster)
✅ API keys configured (Anthropic, OpenRouter, OpenAI)
✅ Optimization enabled by default
✅ Provider fallback available
✅ MCP tools ready for Claude Code integration

**Start using it now:**

```bash
# Simple test
agentic-flow --agent coder --task "Hello world" --optimize

# QE agent with cost optimization
agentic-flow --agent qe-test-generator \
  --task "Generate tests" \
  --optimize --priority cost

# Security audit with quality optimization
agentic-flow --agent qe-security-scanner \
  --task "Security scan" \
  --optimize --priority quality
```

**Expected savings: 70-85% cost reduction with maintained quality!**
