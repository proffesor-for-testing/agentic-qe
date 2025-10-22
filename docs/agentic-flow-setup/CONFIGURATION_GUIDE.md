# Agentic Flow Configuration Guide

## 📋 Current Setup Status

✅ **Environment Variables**: Configured in `~/.bashrc`
- `ANTHROPIC_API_KEY`: Set
- `OPENROUTER_API_KEY`: Set

✅ **Installation**: agentic-flow v1.6.4 installed globally

## 🎯 Three Key Features Setup

### 1. Multi-Model Router (OpenRouter Integration)

The Multi-Model Router allows you to use 100+ models from OpenRouter instead of just Claude models, with 85-99% cost savings.

#### Configuration Methods

**Method A: Environment Variables (Recommended for global use)**

Add to `~/.bashrc` (already done for API keys):
```bash
export USE_OPENROUTER=true
export COMPLETION_MODEL="deepseek/deepseek-chat-v3.1:free"  # or any OpenRouter model
```

Then reload:
```bash
source ~/.bashrc
```

**Method B: CLI Flags (Recommended for per-task control)**

```bash
# Use OpenRouter with specific provider
agentic-flow --agent coder --task "Create API" --provider openrouter

# Use specific OpenRouter model
agentic-flow --agent coder --task "Create API" --model "meta-llama/llama-3.1-8b-instruct"

# Use optimization to auto-select best model
agentic-flow --agent coder --task "Create API" --optimize --priority balanced
```

**Method C: Configuration File**

```bash
# Set default provider
agentic-flow config set PROVIDER openrouter
agentic-flow config set COMPLETION_MODEL "deepseek/deepseek-chat-v3.1:free"

# Verify configuration
agentic-flow config list
```

#### Best Free OpenRouter Models

```bash
# For reasoning tasks (95s/task, RFC validation)
--model "deepseek/deepseek-r1-0528:free"

# For coding tasks (21-103s/task, enterprise-grade)
--model "deepseek/deepseek-chat-v3.1:free"

# For fast coding (4.4s/task, versatile)
--model "meta-llama/llama-3.3-8b-instruct:free"

# For premium quality (10.7s/task)
--model "openai/gpt-4-turbo"
```

#### Proxy Mode for Claude Code Integration

This allows Claude Code itself to use OpenRouter models:

**Terminal 1 - Start Proxy:**
```bash
# Start proxy on default port 3000
agentic-flow proxy --provider openrouter

# Or with custom port
PROXY_PORT=8080 agentic-flow proxy --provider openrouter
```

**Terminal 2 - Configure and Use Claude Code:**
```bash
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="sk-ant-proxy-dummy-key"
export OPENROUTER_API_KEY="sk-or-v1-xxxxx"  # Your real key

# Now Claude Code will route through OpenRouter
claude-code
```

### 2. QUIC Transport (Ultra-Low Latency)

QUIC provides 50-70% faster agent communication than traditional TCP/HTTP.

#### Benefits
- **0-RTT Connection**: Instant reconnection without handshake delay
- **Stream Multiplexing**: 100+ concurrent messages without blocking
- **Built-in TLS 1.3**: Encrypted by default
- **Connection Migration**: Survives network changes (WiFi → cellular)
- **Reduced Latency**: Perfect for real-time agent coordination

#### Configuration Methods

**Method A: Environment Variable (Global Default)**

Add to `~/.bashrc`:
```bash
export AGENTIC_FLOW_TRANSPORT=quic
export QUIC_PORT=4433
```

Then reload:
```bash
source ~/.bashrc
```

**Method B: CLI Flag (Per-Task)**

```bash
# Use QUIC transport for single task
agentic-flow --agent coder --task "Build API" --transport quic

# With OpenRouter
agentic-flow --agent coder --task "Build API" --transport quic --provider openrouter
```

**Method C: Start QUIC Server**

```bash
# Start QUIC server on default port 4433
agentic-flow quic --port 4433

# With custom certificates
agentic-flow quic --cert ./certs/cert.pem --key ./certs/key.pem
```

#### Programmatic Usage

```javascript
import { QuicTransport } from 'agentic-flow/transport/quic';

const transport = new QuicTransport({
  host: 'localhost',
  port: 4433,
  maxConcurrentStreams: 100
});

await transport.connect();
await transport.send({
  type: 'task',
  data: {
    agent: 'coder',
    task: 'Build REST API'
  }
});
```

#### Use Cases
- Multi-agent swarm coordination (mesh/hierarchical topologies)
- High-frequency task distribution across worker agents
- Real-time state synchronization between agents
- Low-latency RPC for distributed agent systems

### 3. Agent Booster (Model Optimization)

Agent Booster automatically selects the best model for your task based on priorities, providing 85-98% cost savings.

#### Features
- **Smart Selection**: Agent-aware (coder needs quality ≥85, researcher flexible)
- **10+ Models**: Claude, GPT-4o, Gemini, DeepSeek, Llama, ONNX local
- **Zero Overhead**: <5ms decision time, no API calls during optimization
- **Cost Control**: Set max budget per task

#### Configuration Methods

**Method A: CLI Flags (Recommended)**

```bash
# Auto-optimize with balanced priority (default)
agentic-flow --agent coder --task "Build API" --optimize

# Optimize for cost (85-98% cheaper)
agentic-flow --agent coder --task "Build API" --optimize --priority cost

# Optimize for quality
agentic-flow --agent reviewer --task "Security audit" --optimize --priority quality

# Optimize for speed
agentic-flow --agent researcher --task "Find examples" --optimize --priority speed

# Optimize with cost budget
agentic-flow --agent coder --task "Simple function" --optimize --max-cost 0.001
```

**Method B: Short Flag**

```bash
# Use -O instead of --optimize
agentic-flow --agent coder --task "Build API" -O --priority balanced
```

#### Optimization Priorities

| Priority | Best For | Example Models | Use Case |
|----------|----------|----------------|----------|
| `quality` | Production code, security | Claude Sonnet 4.5, GPT-4o | Code reviews, security audits |
| `balanced` | Most tasks (default) | DeepSeek R1, Gemini 2.5 Flash | General development, testing |
| `cost` | Simple tasks, bulk operations | DeepSeek Chat V3, Llama 3.1 8B | Documentation, simple scripts |
| `speed` | Research, quick queries | Gemini 2.5 Flash | Quick lookups, research |
| `privacy` | Sensitive data | ONNX Phi-4 (local) | Private/confidential work |

#### Cost Savings Examples

```bash
# DeepSeek R1: 85% less than Claude Sonnet 4.5
agentic-flow --agent coder --task "Build API" --model "deepseek/deepseek-r1-0528:free"

# DeepSeek Chat V3: 98% less for simple tasks
agentic-flow --agent coder --task "Add docstring" --model "deepseek/deepseek-chat-v3.1:free"

# Llama 3.1 8B: 99% less for basic tasks
agentic-flow --agent researcher --task "Find examples" --model "meta-llama/llama-3.3-8b-instruct:free"
```

## 🚀 Recommended Setup for Your Project

Based on your agentic-qe-cf project, here's the optimal configuration:

### Step 1: Add Environment Variables

Add these to your `~/.bashrc` (in addition to existing API keys):

```bash
# Multi-Model Router (Already have API keys ✅)
export USE_OPENROUTER=true
export COMPLETION_MODEL="deepseek/deepseek-chat-v3.1:free"

# QUIC Transport (Ultra-fast agent coordination)
export AGENTIC_FLOW_TRANSPORT=quic
export QUIC_PORT=4433

# Model Optimization (Enable by default)
export AGENTIC_FLOW_OPTIMIZE=true
export AGENTIC_FLOW_PRIORITY=balanced
```

Then reload:
```bash
source ~/.bashrc
```

### Step 2: Configure agentic-flow

```bash
# Set default provider
agentic-flow config set PROVIDER openrouter
agentic-flow config set COMPLETION_MODEL "deepseek/deepseek-chat-v3.1:free"

# Verify configuration
agentic-flow config list
```

### Step 3: Test Each Feature

```bash
# Test Multi-Model Router
agentic-flow --agent coder --task "Write a hello world function" --provider openrouter

# Test QUIC Transport
agentic-flow --agent coder --task "Write a hello world function" --transport quic

# Test Agent Booster
agentic-flow --agent coder --task "Write a hello world function" --optimize --priority cost

# Test All Together
agentic-flow --agent coder --task "Write a hello world function" --provider openrouter --transport quic --optimize --priority balanced
```

## 📊 Performance Comparison

| Configuration | Speed | Cost | Best For |
|--------------|-------|------|----------|
| **Standard (Claude)** | 1x | $$$$ | High-quality production code |
| **OpenRouter + QUIC** | 1.5-1.7x | $ | Fast development, testing |
| **OpenRouter + QUIC + Optimize (cost)** | 1.5-1.7x | $ | Bulk operations, documentation |
| **OpenRouter + QUIC + Optimize (balanced)** | 1.5-1.7x | $$ | General development (recommended) |

## 🎯 Integration with Your Project

### For AQE Fleet Operations

```bash
# Start QUIC server for agent coordination
agentic-flow quic --port 4433 &

# Initialize AQE fleet with optimized models
cd /workspaces/agentic-qe-cf
aqe init

# Run test generation with optimization
agentic-flow --agent qe-test-generator \
  --task "Generate tests for src/core/agents/BaseAgent.ts" \
  --provider openrouter \
  --transport quic \
  --optimize --priority balanced
```

### For Swarm Coordination

```bash
# Multi-agent execution with QUIC transport
agentic-flow --agent coder --task "Build REST API" --transport quic --optimize &
agentic-flow --agent tester --task "Create test suite" --transport quic --optimize &
agentic-flow --agent reviewer --task "Code review" --transport quic --optimize &
```

## 🔧 Troubleshooting

### Issue: QUIC connection fails

**Solution 1**: Check if port 4433 is available
```bash
lsof -i :4433
```

**Solution 2**: Use custom port
```bash
export QUIC_PORT=5433
agentic-flow quic --port 5433
```

### Issue: OpenRouter API key not recognized

**Solution**: Verify key is loaded
```bash
source ~/.bashrc
echo $OPENROUTER_API_KEY
```

### Issue: Model optimization not working

**Solution**: Ensure optimization flag is used
```bash
agentic-flow --agent coder --task "Build API" --optimize --priority balanced
```

## 📚 Additional Resources

- [Agentic Flow GitHub](https://github.com/ruvnet/agentic-flow)
- [OpenRouter Models](https://openrouter.ai/models)
- [QUIC Protocol](https://www.chromium.org/quic/)
- [Model Capabilities Benchmark](docs/agentic-flow/benchmarks/MODEL_CAPABILITIES.md)

## 🎓 Next Steps

1. ✅ Verify environment variables are loaded
2. ✅ Configure agentic-flow defaults
3. ✅ Test each feature individually
4. ✅ Test combined features
5. ✅ Integrate with your AQE project workflows
6. ✅ Monitor performance and costs
7. ✅ Optimize based on usage patterns
