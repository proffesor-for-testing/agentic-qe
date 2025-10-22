# Agentic Flow - Practical Examples for AQE Project

## 🎯 Real-World Usage Examples

### Example 1: Test Generation with Multi-Model Router

**Scenario**: Generate comprehensive test suite for a TypeScript module with cost optimization.

```bash
# Using DeepSeek Chat V3 (98% cost savings vs Claude Sonnet 4.5)
agentic-flow --agent qe-test-generator \
  --task "Generate comprehensive test suite for src/core/agents/BaseAgent.ts with 90% coverage" \
  --provider openrouter \
  --model "deepseek/deepseek-chat-v3.1:free" \
  --output json \
  --stream

# With automatic optimization
agentic-flow --agent qe-test-generator \
  --task "Generate comprehensive test suite for src/core/agents/BaseAgent.ts with 90% coverage" \
  --optimize --priority cost
```

**Expected Output**: Test suite with unit tests, integration tests, edge cases, and mocks.

**Cost**: ~$0.0002 per 1K tokens (vs ~$0.003 for Claude Sonnet)

### Example 2: Multi-Agent Swarm with QUIC Transport

**Scenario**: Run multiple agents concurrently for end-to-end feature development.

```bash
# Terminal 1: Start QUIC server
agentic-flow quic --port 4433

# Terminal 2: Run multi-agent swarm
# Agent 1: Research and planning
agentic-flow --agent researcher \
  --task "Research best practices for authentication middleware" \
  --transport quic --optimize --priority speed &

# Agent 2: Implementation
agentic-flow --agent coder \
  --task "Implement JWT authentication middleware in TypeScript" \
  --transport quic --optimize --priority balanced &

# Agent 3: Testing
agentic-flow --agent qe-test-generator \
  --task "Create tests for JWT authentication middleware" \
  --transport quic --optimize --priority cost &

# Agent 4: Review
agentic-flow --agent reviewer \
  --task "Review JWT middleware security and code quality" \
  --transport quic --optimize --priority quality &

# Wait for all agents to complete
wait
```

**Benefits**:
- **50-70% faster** communication vs HTTP
- **Stream multiplexing**: All 4 agents communicate without blocking
- **Cost optimized**: Each agent uses optimal model for its task type

### Example 3: Coverage Analysis with Agent Booster

**Scenario**: Analyze test coverage and identify gaps using optimized models.

```bash
# Auto-select best model for analysis task
agentic-flow --agent qe-coverage-analyzer \
  --task "Analyze test coverage for agentic-qe/ directory and identify gaps" \
  --optimize --priority balanced \
  --output json

# With cost constraint (max $0.001 per task)
agentic-flow --agent qe-coverage-analyzer \
  --task "Analyze test coverage for agentic-qe/ directory and identify gaps" \
  --optimize --max-cost 0.001
```

**Output**: JSON report with coverage metrics, uncovered lines, and recommendations.

### Example 4: Security Scanning with Quality Priority

**Scenario**: Comprehensive security audit requiring high-quality analysis.

```bash
# Use premium model for security-critical task
agentic-flow --agent qe-security-scanner \
  --task "Perform security audit of authentication and authorization code" \
  --optimize --priority quality \
  --verbose

# Fallback if quality models unavailable
agentic-flow --agent qe-security-scanner \
  --task "Perform security audit of authentication and authorization code" \
  --model "openai/gpt-4-turbo" \
  --verbose
```

**Output**: Security vulnerabilities, CVE matches, SAST/DAST findings, recommendations.

### Example 5: Claude Code Integration via Proxy

**Scenario**: Use OpenRouter models directly in Claude Code CLI.

```bash
# Terminal 1: Start proxy with OpenRouter
agentic-flow proxy --provider openrouter --port 3000

# Terminal 2: Configure and use Claude Code
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="sk-ant-proxy-dummy-key"

# Now use Claude Code normally - it will route through OpenRouter
claude-code

# Inside Claude Code, all operations use OpenRouter models
# Example: "Write a REST API for user management"
```

**Benefits**:
- 85-99% cost savings on all Claude Code operations
- Access to 100+ OpenRouter models
- No code changes to Claude Code
- Leaderboard tracking on OpenRouter

### Example 6: Performance Testing with QUIC

**Scenario**: Load testing with high-frequency agent coordination.

```bash
# Start QUIC server for low-latency coordination
agentic-flow quic --port 4433 &

# Run performance test agent
agentic-flow --agent qe-performance-tester \
  --task "Load test API endpoints with 1000 concurrent requests" \
  --transport quic \
  --optimize --priority speed \
  --stream

# Multiple performance agents in parallel
for i in {1..5}; do
  agentic-flow --agent qe-performance-tester \
    --task "Load test endpoint /api/v1/users with 200 concurrent requests" \
    --transport quic \
    --optimize --priority speed &
done
wait
```

**QUIC Benefits**:
- **0-RTT reconnection**: Agents reconnect instantly
- **Connection migration**: Survives network interruptions
- **100+ concurrent streams**: All agents coordinate in real-time

### Example 7: Documentation Generation (Cost Optimized)

**Scenario**: Generate API documentation for multiple modules.

```bash
# Use cheapest model for documentation task
agentic-flow --agent api-docs \
  --task "Generate OpenAPI documentation for REST API endpoints" \
  --optimize --priority cost \
  --output md

# Batch processing multiple files
for file in src/api/*.ts; do
  agentic-flow --agent api-docs \
    --task "Generate API docs for $file" \
    --optimize --priority cost \
    --output md > "docs/api/$(basename $file .ts).md" &
done
wait
```

**Cost**: ~$0.0001 per 1K tokens (Llama 3.1 8B or DeepSeek Chat V3)

### Example 8: Privacy-Focused Code Review (Local Models)

**Scenario**: Review sensitive code using local ONNX models (no cloud).

```bash
# Use local ONNX Phi-4 model (no API calls)
agentic-flow --agent reviewer \
  --task "Review security-sensitive authentication code" \
  --optimize --priority privacy \
  --provider onnx

# Alternative: explicit ONNX provider
agentic-flow --agent reviewer \
  --task "Review security-sensitive authentication code" \
  --provider onnx
```

**Benefits**:
- **100% private**: No data leaves your machine
- **No API costs**: Free local inference
- **Fast**: ~2-5 seconds for code review

### Example 9: Complete Feature Development Pipeline

**Scenario**: End-to-end feature with all optimizations enabled.

```bash
#!/bin/bash
# feature-pipeline.sh - Complete feature development with agentic-flow

# Start QUIC server for coordination
agentic-flow quic --port 4433 &
QUIC_PID=$!

# Phase 1: Research and Planning (speed optimized)
echo "Phase 1: Research"
agentic-flow --agent researcher \
  --task "Research user authentication patterns and security best practices" \
  --transport quic --optimize --priority speed \
  --output json > research.json

# Phase 2: Architecture Design (balanced)
echo "Phase 2: Architecture"
agentic-flow --agent system-architect \
  --task "Design authentication system architecture based on research.json" \
  --transport quic --optimize --priority balanced \
  --output json > architecture.json

# Phase 3: Implementation (quality for production code)
echo "Phase 3: Implementation"
agentic-flow --agent coder \
  --task "Implement authentication system based on architecture.json" \
  --transport quic --optimize --priority quality \
  --output text > implementation.log

# Phase 4: Testing (cost optimized)
echo "Phase 4: Testing"
agentic-flow --agent qe-test-generator \
  --task "Generate comprehensive test suite for authentication system" \
  --transport quic --optimize --priority cost \
  --output json > tests.json

agentic-flow --agent qe-test-executor \
  --task "Execute test suite and report results" \
  --transport quic --optimize --priority cost \
  --output json > test-results.json

# Phase 5: Security & Quality (quality for critical analysis)
echo "Phase 5: Security & Quality"
agentic-flow --agent qe-security-scanner \
  --task "Perform security audit of authentication implementation" \
  --transport quic --optimize --priority quality \
  --output json > security-report.json

agentic-flow --agent reviewer \
  --task "Perform code review focusing on maintainability and best practices" \
  --transport quic --optimize --priority quality \
  --output json > review-report.json

# Phase 6: Documentation (cost optimized)
echo "Phase 6: Documentation"
agentic-flow --agent api-docs \
  --task "Generate comprehensive API documentation" \
  --transport quic --optimize --priority cost \
  --output md > docs/authentication-api.md

# Cleanup
kill $QUIC_PID

echo "✅ Complete pipeline finished!"
echo "📊 Generated artifacts:"
ls -lh research.json architecture.json implementation.log tests.json test-results.json security-report.json review-report.json docs/authentication-api.md
```

### Example 10: Monitoring and Observability

**Scenario**: Monitor multi-agent execution with real-time metrics.

```bash
# Start QUIC server with verbose logging
agentic-flow quic --port 4433 --verbose &

# Run agent with streaming output
agentic-flow --agent coder \
  --task "Build REST API with Express and TypeScript" \
  --transport quic \
  --optimize --priority balanced \
  --stream \
  --verbose

# Monitor QUIC metrics
watch -n 1 'lsof -i :4433 | tail -n +2 | wc -l'
```

## 🎯 Integration with AQE Project

### Quick Start Script

Create `scripts/agentic-flow-setup.sh`:

```bash
#!/bin/bash
# Setup agentic-flow for AQE project

# Load environment variables
source ~/.bashrc

# Configure agentic-flow
echo "🔧 Configuring agentic-flow..."
agentic-flow config set PROVIDER openrouter
agentic-flow config set COMPLETION_MODEL "deepseek/deepseek-chat-v3.1:free"

# Start QUIC server
echo "🚀 Starting QUIC server..."
agentic-flow quic --port 4433 &
QUIC_PID=$!

# Wait for QUIC server
sleep 2

# Test configuration
echo "✅ Testing configuration..."
agentic-flow --agent coder \
  --task "Write a hello world function" \
  --transport quic \
  --optimize --priority balanced \
  --stream

echo "✅ Setup complete!"
echo "QUIC server running on port 4433 (PID: $QUIC_PID)"
echo ""
echo "To stop QUIC server: kill $QUIC_PID"
```

Make executable and run:
```bash
chmod +x scripts/agentic-flow-setup.sh
./scripts/agentic-flow-setup.sh
```

## 📊 Performance Comparison

| Configuration | Latency | Cost per 1M tokens | Throughput |
|--------------|---------|-------------------|-----------|
| **Claude Sonnet 4.5 (HTTP)** | 100-200ms | $15.00 | 1x |
| **OpenRouter + HTTP** | 80-150ms | $0.30-$2.00 | 1.2x |
| **OpenRouter + QUIC** | 30-70ms | $0.30-$2.00 | 2.8-4.4x |
| **OpenRouter + QUIC + Optimize (cost)** | 30-70ms | $0.03-$0.20 | 2.8-4.4x |

## 🎓 Best Practices

1. **Use QUIC for multi-agent coordination**: 50-70% faster than HTTP
2. **Use optimization for cost savings**: 85-98% cheaper than Claude
3. **Match priority to task type**:
   - `quality`: Production code, security audits
   - `balanced`: General development (default)
   - `cost`: Documentation, simple tasks
   - `speed`: Research, quick queries
   - `privacy`: Sensitive data
4. **Use streaming for long tasks**: See progress in real-time
5. **Use JSON output for automation**: Easier to parse and process
6. **Monitor costs**: Use `--max-cost` flag for budget control
7. **Leverage free models**: DeepSeek, Llama 3.1 8B are free on OpenRouter

## 🔗 Related Resources

- [Configuration Guide](./CONFIGURATION_GUIDE.md)
- [Agentic Flow GitHub](https://github.com/ruvnet/agentic-flow)
- [OpenRouter Models](https://openrouter.ai/models)
- [Model Capabilities Benchmark](../agentic-flow/benchmarks/MODEL_CAPABILITIES.md)
