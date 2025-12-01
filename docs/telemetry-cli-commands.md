# Telemetry CLI Commands

## Overview

The telemetry CLI commands provide comprehensive monitoring and querying capabilities for the Agentic QE Fleet's OpenTelemetry instrumentation, including metrics, traces, token usage, and cost tracking.

## Commands

### `aqe telemetry status`

Show the current telemetry configuration and initialization status.

```bash
aqe telemetry status
aqe telemetry status --json
```

**Output includes:**
- Initialization status
- Service name and version
- Environment configuration
- OTLP endpoint configuration
- Active exporters (console, gRPC, auto-instrumentation)
- Trace sample rate and metric export interval

**Example:**
```
📊 Telemetry Status

✅ Initialized: Yes

🔧 Configuration:
  Service:     agentic-qe-fleet v1.8.4
  Environment: development
  OTLP:        http://localhost:4317
  Metrics:     http://localhost:4317

📤 Exporters:
  Console:     ❌ Disabled
  gRPC:        ✅ Enabled
  Auto-Instr:  ✅ Enabled

⚙️  Settings:
  Trace Sample Rate: 100%
  Metric Interval:   60s
```

---

### `aqe telemetry metrics [metric-name]`

Query and display various metrics. If no metric name is provided, shows a summary of all metrics.

```bash
# Show all metrics
aqe telemetry metrics

# Show specific metric type
aqe telemetry metrics tokens
aqe telemetry metrics cost
aqe telemetry metrics system

# Filter by agent
aqe telemetry metrics --agent test-gen-001

# Output as JSON
aqe telemetry metrics --json
```

**Metric Types:**

#### `tokens` - Token Usage
Shows LLM token consumption including:
- Input tokens
- Output tokens
- Cache write tokens (Anthropic)
- Cache read tokens (Anthropic)
- Total tokens

#### `cost` - Cost Breakdown
Shows cost analysis including:
- Input cost ($)
- Output cost ($)
- Cache write cost ($)
- Cache read cost ($)
- Total cost ($)
- Cache savings ($ and %)

#### `system` - System Metrics
Shows system resource usage including:
- Memory usage (heap, RSS)
- CPU usage (user, system)
- Process information (PID, Node version, platform)
- Uptime

**Example:**
```
📊 Fleet Metrics Summary

🌐 Fleet-Wide:
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ (index)      │ Input        │ Output       │ Total        │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Total Tokens │ '245,892'    │ '52,134'     │ '298,026'    │
│ Total Cost   │ '$0.7377'    │ '$0.7820'    │ '$1.5197'    │
└──────────────┴──────────────┴──────────────┴──────────────┘
💰 Cache Savings: $0.2341

🤖 Per-Agent Breakdown:
┌───────────────┬──────────┬────────────┬────────────┬─────────────────────────────┐
│ (index)       │ Tokens   │ Cost       │ Provider   │ Model                       │
├───────────────┼──────────┼────────────┼────────────┼─────────────────────────────┤
│ test-gen-001  │ '145,892'│ '$0.8234'  │ 'anthropic'│ 'claude-sonnet-4-5-2025...' │
│ coverage-002  │ '98,134' │ '$0.4963'  │ 'anthropic'│ 'claude-sonnet-4-5-2025...' │
│ security-003  │ '54,000' │ '$0.2000'  │ 'anthropic'│ 'claude-3-5-haiku-20241...' │
└───────────────┴──────────┴────────────┴────────────┴─────────────────────────────┘
```

---

### `aqe telemetry trace [trace-id]`

View distributed traces. Requires OTLP backend configuration (Jaeger, Zipkin, Grafana Tempo).

```bash
# View specific trace
aqe telemetry trace abc123def456

# View recent traces by agent
aqe telemetry trace --agent test-generator --limit 10

# Output as JSON
aqe telemetry trace --json
```

**Note:** Trace viewing requires:
1. An OTLP collector or backend (Jaeger, Zipkin, Grafana Tempo)
2. `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable configured
3. Fleet restarted with telemetry enabled

**Example backends:**
- **Jaeger**: https://www.jaegertracing.io/
- **Zipkin**: https://zipkin.io/
- **Grafana Tempo**: https://grafana.com/oss/tempo/

---

### `aqe telemetry export-prometheus`

Export metrics in Prometheus format for integration with Prometheus monitoring.

```bash
aqe telemetry export-prometheus > metrics.txt
```

**Output format:**
```
# HELP aqe_fleet_tokens_total Total tokens consumed by fleet
# TYPE aqe_fleet_tokens_total counter
aqe_fleet_tokens_total{type="input"} 245892
aqe_fleet_tokens_total{type="output"} 52134

# HELP aqe_fleet_cost_total Total cost incurred by fleet
# TYPE aqe_fleet_cost_total counter
aqe_fleet_cost_total 1.5197

# HELP aqe_fleet_cache_savings_total Total cache savings
# TYPE aqe_fleet_cache_savings_total counter
aqe_fleet_cache_savings_total 0.2341

aqe_agent_tokens_total{agent_id="test-gen-001",provider="anthropic",model="claude-sonnet-4",type="input"} 145892
aqe_agent_tokens_total{agent_id="test-gen-001",provider="anthropic",model="claude-sonnet-4",type="output"} 24567
aqe_agent_cost_total{agent_id="test-gen-001",provider="anthropic",model="claude-sonnet-4"} 0.8234
```

---

## Integration with OpenTelemetry

### Environment Variables

Configure telemetry behavior with these environment variables:

```bash
# OTLP endpoint for traces and metrics
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Separate metrics endpoint (optional)
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics

# Protocol: http/protobuf or grpc (default: grpc)
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Enable console export for debugging
export OTEL_CONSOLE_EXPORT=true

# Trace sample rate (0.0 to 1.0)
export OTEL_TRACES_SAMPLER_ARG=1.0

# Metric export interval (milliseconds)
export OTEL_METRIC_EXPORT_INTERVAL=60000

# Enable debug logging
export OTEL_LOG_LEVEL=debug
```

### Setting up OTLP Collector

#### Option 1: Jaeger All-in-One

```bash
docker run -d --name jaeger \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 16686:16686 \
  jaegertracing/all-in-one:latest
```

Then access Jaeger UI at http://localhost:16686

#### Option 2: OpenTelemetry Collector + Jaeger

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true
  prometheus:
    endpoint: "0.0.0.0:8889"

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [jaeger]
    metrics:
      receivers: [otlp]
      exporters: [prometheus]
```

```bash
docker run -d -p 4317:4317 -p 4318:4318 -p 8889:8889 \
  -v $(pwd)/otel-collector-config.yaml:/etc/otel-collector-config.yaml \
  otel/opentelemetry-collector:latest \
  --config=/etc/otel-collector-config.yaml
```

---

## Usage Examples

### Monitor Token Usage During Test Generation

```bash
# Run test generation
aqe generate tests src/services/user.ts

# Check token usage
aqe telemetry metrics tokens

# Check costs
aqe telemetry metrics cost
```

### Export Metrics to Prometheus

```bash
# Start Prometheus scraping
aqe telemetry export-prometheus | curl --data-binary @- http://localhost:9091/metrics/job/aqe-fleet

# Or save to file for manual inspection
aqe telemetry export-prometheus > /tmp/aqe-metrics.txt
```

### Monitor System Resources

```bash
# Watch system metrics in real-time
watch -n 2 'aqe telemetry metrics system'
```

### Query Specific Agent Performance

```bash
# Get metrics for specific agent
aqe telemetry metrics --agent test-gen-001 --json | jq '.cost'

# Export to CSV
aqe telemetry metrics --json | jq -r '.agents[] | [.id, .cost.totalCost] | @csv'
```

---

## Performance Metrics

The telemetry system tracks:

1. **Token Metrics**
   - Input/output token counts
   - Cache utilization (Anthropic models)
   - Per-agent and fleet-wide totals

2. **Cost Metrics**
   - Real-time cost tracking per API call
   - Cache savings calculations
   - Multi-provider cost comparison

3. **System Metrics**
   - Memory usage (heap, RSS)
   - CPU utilization
   - Process information

4. **Quality Metrics** (via OpenTelemetry)
   - Test execution duration
   - Coverage percentages
   - Defect density
   - Quality gate pass rates

---

## Troubleshooting

### No Metrics Available

If metrics show zeros:
```bash
# Initialize telemetry
aqe init

# Run some agents
aqe generate tests src/

# Check metrics again
aqe telemetry metrics
```

### Trace Viewing Not Working

```bash
# Check if OTLP endpoint is configured
aqe telemetry status

# Set OTLP endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Restart fleet
aqe start
```

### High Token Costs

```bash
# Check cost breakdown
aqe telemetry metrics cost

# Identify expensive agents
aqe telemetry metrics --json | jq '.agents | sort_by(.cost.totalCost) | reverse | .[0:5]'

# Consider using cheaper models via routing
aqe routing enable
```

---

## Related Documentation

- [Telemetry Architecture](./phase2/telemetry-architecture.md)
- [OpenTelemetry Configuration](../src/telemetry/README.md)
- [Cost Tracking](../src/telemetry/metrics/collectors/cost.ts)
- [System Metrics](../src/telemetry/metrics/system-metrics.ts)
