# Agentic Flow - Quick Reference Guide

## 🚀 Quick Start (30 seconds)

```bash
# 1. Run setup script
./scripts/setup-agentic-flow.sh

# 2. Test basic functionality
agentic-flow --agent coder --task "Write hello world" --optimize

# 3. Done! 🎉
```

## 📋 Cheat Sheet

### Multi-Model Router Commands

```bash
# Use OpenRouter (cost savings)
agentic-flow --agent coder --task "Write code" --provider openrouter

# Use specific model
agentic-flow --agent coder --task "Write code" --model "deepseek/deepseek-chat-v3.1:free"

# Start proxy for Claude Code
agentic-flow proxy --provider openrouter --port 3000
```

### QUIC Transport Commands

```bash
# Start QUIC server
agentic-flow quic --port 4433

# Use QUIC transport
agentic-flow --agent coder --task "Write code" --transport quic

# Set as default
export AGENTIC_FLOW_TRANSPORT=quic
```

### Agent Booster Commands

```bash
# Auto-optimize (balanced)
agentic-flow --agent coder --task "Write code" --optimize

# Optimize for cost (cheapest)
agentic-flow --agent coder --task "Write code" --optimize --priority cost

# Optimize for quality (best results)
agentic-flow --agent reviewer --task "Review code" --optimize --priority quality

# Optimize for speed (fastest)
agentic-flow --agent researcher --task "Research topic" --optimize --priority speed

# With cost budget
agentic-flow --agent coder --task "Write code" --optimize --max-cost 0.001
```

### Combined Features

```bash
# All features together
agentic-flow --agent coder \
  --task "Build REST API" \
  --provider openrouter \
  --transport quic \
  --optimize --priority balanced \
  --stream
```

## 🎯 Common Use Cases

### 1. Code Generation (Cost-Optimized)

```bash
agentic-flow --agent coder \
  --task "Create TypeScript REST API with Express" \
  --optimize --priority cost
```

### 2. Test Generation

```bash
agentic-flow --agent qe-test-generator \
  --task "Generate tests for src/api/auth.ts" \
  --optimize --priority balanced
```

### 3. Code Review (Quality-Focused)

```bash
agentic-flow --agent reviewer \
  --task "Review security in src/api/auth.ts" \
  --optimize --priority quality
```

### 4. Documentation

```bash
agentic-flow --agent api-docs \
  --task "Generate OpenAPI docs for REST API" \
  --optimize --priority cost
```

### 5. Multi-Agent Swarm

```bash
# Start QUIC server
agentic-flow quic --port 4433 &

# Run agents in parallel
agentic-flow --agent researcher --task "Research auth patterns" --transport quic --optimize &
agentic-flow --agent coder --task "Implement auth" --transport quic --optimize &
agentic-flow --agent qe-test-generator --task "Generate auth tests" --transport quic --optimize &
agentic-flow --agent reviewer --task "Review auth code" --transport quic --optimize &
wait
```

## 📊 Model Selection Guide

| Model | Cost per 1M tokens | Best For | Speed |
|-------|-------------------|----------|-------|
| **deepseek/deepseek-chat-v3.1:free** | $0 (free) | Coding, general tasks | Medium |
| **meta-llama/llama-3.3-8b-instruct:free** | $0 (free) | Fast coding, versatile | Fast |
| **deepseek/deepseek-r1-0528:free** | $0 (free) | Reasoning, validation | Slow |
| **openai/gpt-4-turbo** | $10-30 | Premium quality | Medium |
| **claude-sonnet-4.5** | $15 | Production code | Medium |

## 🎨 Priority Guide

| Priority | Use When | Example Models | Cost |
|----------|----------|----------------|------|
| **quality** | Production code, security | Claude Sonnet, GPT-4o | $$$$ |
| **balanced** | General development | DeepSeek R1, Gemini Flash | $$ |
| **cost** | Simple tasks, docs | DeepSeek Chat, Llama 8B | $ |
| **speed** | Research, quick queries | Gemini Flash | $$ |
| **privacy** | Sensitive data | ONNX Phi-4 (local) | Free |

## 🔧 Configuration

### View Current Config

```bash
agentic-flow config list
```

### Set Config Values

```bash
agentic-flow config set PROVIDER openrouter
agentic-flow config set COMPLETION_MODEL "deepseek/deepseek-chat-v3.1:free"
```

### Environment Variables

```bash
# ~/.bashrc
export USE_OPENROUTER=true
export AGENTIC_FLOW_TRANSPORT=quic
export AGENTIC_FLOW_OPTIMIZE=true
export AGENTIC_FLOW_PRIORITY=balanced
```

## 🐛 Troubleshooting

### Issue: Command not found

```bash
# Check installation
which agentic-flow
agentic-flow --version

# Reinstall if needed
npm install -g agentic-flow
```

### Issue: API key not recognized

```bash
# Reload environment
source ~/.bashrc

# Verify keys
echo $ANTHROPIC_API_KEY
echo $OPENROUTER_API_KEY
```

### Issue: QUIC connection fails

```bash
# Check if port is available
lsof -i :4433

# Use different port
export QUIC_PORT=5433
agentic-flow quic --port 5433
```

### Issue: Model not found

```bash
# List available models at OpenRouter
# https://openrouter.ai/models

# Use verified free model
agentic-flow --agent coder \
  --task "Write code" \
  --model "deepseek/deepseek-chat-v3.1:free"
```

## 📚 Documentation Links

- **Full Configuration Guide**: [CONFIGURATION_GUIDE.md](./CONFIGURATION_GUIDE.md)
- **Practical Examples**: [PRACTICAL_EXAMPLES.md](./PRACTICAL_EXAMPLES.md)
- **Agentic Flow GitHub**: https://github.com/ruvnet/agentic-flow
- **OpenRouter Models**: https://openrouter.ai/models

## ⚡ Performance Tips

1. **Use QUIC for multi-agent**: 50-70% faster coordination
2. **Use free models for simple tasks**: 98% cost savings
3. **Enable streaming for long tasks**: `--stream` flag
4. **Use JSON output for automation**: `--output json`
5. **Set cost budgets**: `--max-cost 0.001` to prevent overruns
6. **Batch operations**: Run multiple agents in parallel

## 🎓 Learning Path

1. ✅ Run setup script: `./scripts/setup-agentic-flow.sh`
2. ✅ Test basic agent: `agentic-flow --agent coder --task "hello world" --optimize`
3. ✅ Try different models: Use `--model` flag with OpenRouter models
4. ✅ Test QUIC: Start server and use `--transport quic`
5. ✅ Test optimization: Try different `--priority` values
6. ✅ Run multi-agent: Execute parallel agents with QUIC
7. ✅ Integrate with project: Use for AQE tasks

## 🔗 Quick Links

```bash
# Setup
./scripts/setup-agentic-flow.sh

# Test
./scripts/test-agentic-flow.sh

# List agents
agentic-flow --list

# Get help
agentic-flow --help

# Agent info
agentic-flow agent info qe-test-generator
```

---

**Need Help?** Check the [Full Configuration Guide](./CONFIGURATION_GUIDE.md) or [Practical Examples](./PRACTICAL_EXAMPLES.md)
