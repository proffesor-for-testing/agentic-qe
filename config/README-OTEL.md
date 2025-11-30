# OTEL Observability Stack - Quick Start Guide

Complete observability stack for the Agentic QE Fleet with OpenTelemetry, Prometheus, Jaeger, and Grafana.

## 🚀 Quick Start

### 1. Start the OTEL Stack

```bash
# Start only the OTEL stack
docker-compose -f config/docker-compose.otel.yml up -d

# Or combine with the main application
docker-compose -f docker-compose.yml -f config/docker-compose.otel.yml up -d
```

### 2. Access the Services

| Service | URL | Purpose |
|---------|-----|---------|
| **Grafana** | http://localhost:3001 | Dashboards and visualization |
| **Prometheus** | http://localhost:9090 | Metrics storage and querying |
| **Jaeger UI** | http://localhost:16686 | Distributed tracing |
| **OTEL Collector** | http://localhost:13133/health | Health check |

### 3. Default Credentials

- **Grafana**: `admin` / `admin` (change on first login)

## 📊 Service Endpoints

### OTEL Collector
- **OTLP gRPC**: `localhost:4317` - Send traces/metrics via gRPC
- **OTLP HTTP**: `localhost:4318` - Send traces/metrics via HTTP
- **Prometheus Exporter**: `localhost:8889` - Metrics endpoint
- **Health Check**: `localhost:13133` - Collector health
- **pprof**: `localhost:1777` - Performance profiling
- **zPages**: `localhost:55679` - Debug interface

### Prometheus
- **Web UI**: `localhost:9090` - Query and explore metrics
- **API**: `localhost:9090/api/v1/` - Prometheus HTTP API

### Jaeger
- **UI**: `localhost:16686` - Trace visualization
- **OTLP gRPC**: `localhost:4327` - Receive traces (forwarded from collector)
- **Metrics**: `localhost:14269/metrics` - Jaeger metrics
- **Health**: `localhost:14269/` - Health check

### Grafana
- **Web UI**: `localhost:3001` - Dashboards and visualization
- **API**: `localhost:3001/api/` - Grafana HTTP API

## 🔧 Configuration Files

### Required Files (Already Created)
- `config/docker-compose.otel.yml` - Docker Compose configuration
- `config/otel-collector-config.yaml.example` - OTEL Collector config
- `config/prometheus.yml.example` - Prometheus scrape config
- `config/grafana/provisioning/datasources/datasources.yml` - Grafana datasources
- `config/grafana/provisioning/dashboards/dashboards.yml` - Dashboard provisioning
- `config/grafana/dashboards/agentic-qe-overview.json` - Sample dashboard

### Environment Variables (Optional)
Copy and customize:
```bash
cp config/.env.otel.example config/.env.otel
```

Then use:
```bash
docker-compose -f config/docker-compose.otel.yml --env-file config/.env.otel up -d
```

## 📈 Using the Stack

### Send Telemetry to OTEL Collector

#### Via HTTP (curl example)
```bash
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d @trace-data.json
```

#### Via Node.js Application
```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces'
    })
  )
);
provider.register();
```

### Query Metrics in Prometheus

1. Open http://localhost:9090
2. Try queries:
   - `aqe_requests_total` - Total requests
   - `rate(aqe_requests_total[5m])` - Request rate
   - `histogram_quantile(0.95, rate(aqe_request_duration_bucket[5m]))` - P95 latency

### View Traces in Jaeger

1. Open http://localhost:16686
2. Select service: `agentic-qe-fleet`
3. Click "Find Traces"
4. Explore trace details and service dependencies

### Create Dashboards in Grafana

1. Open http://localhost:3001
2. Login with `admin` / `admin`
3. Navigate to Dashboards → Agentic QE Fleet → Overview
4. Or create new dashboards using Prometheus and Jaeger datasources

## 🛠️ Management Commands

### View Logs
```bash
# All services
docker-compose -f config/docker-compose.otel.yml logs -f

# Specific service
docker-compose -f config/docker-compose.otel.yml logs -f otel-collector
docker-compose -f config/docker-compose.otel.yml logs -f prometheus
docker-compose -f config/docker-compose.otel.yml logs -f jaeger
docker-compose -f config/docker-compose.otel.yml logs -f grafana
```

### Check Service Health
```bash
# OTEL Collector
curl http://localhost:13133/health

# Prometheus
curl http://localhost:9090/-/healthy

# Jaeger
curl http://localhost:14269/

# Grafana
curl http://localhost:3001/api/health
```

### Stop Services
```bash
# Stop OTEL stack
docker-compose -f config/docker-compose.otel.yml down

# Stop and remove volumes (CAUTION: deletes all data)
docker-compose -f config/docker-compose.otel.yml down -v
```

### Restart Services
```bash
# Restart all
docker-compose -f config/docker-compose.otel.yml restart

# Restart specific service
docker-compose -f config/docker-compose.otel.yml restart otel-collector
```

## 🔍 Troubleshooting

### OTEL Collector Not Receiving Data
1. Check collector logs: `docker-compose -f config/docker-compose.otel.yml logs otel-collector`
2. Verify endpoints: `curl http://localhost:13133/health`
3. Check application OTLP endpoint: `http://localhost:4318`

### Prometheus Not Scraping Metrics
1. Check Prometheus targets: http://localhost:9090/targets
2. Verify OTEL Collector is exposing metrics: `curl http://localhost:8889/metrics`
3. Check Prometheus config: `docker-compose -f config/docker-compose.otel.yml exec prometheus cat /etc/prometheus/prometheus.yml`

### Jaeger Not Showing Traces
1. Check Jaeger logs: `docker-compose -f config/docker-compose.otel.yml logs jaeger`
2. Verify OTEL Collector is forwarding traces (check collector logs)
3. Ensure application is sending traces to OTLP endpoint

### Grafana Datasources Not Working
1. Check datasource configuration: Grafana UI → Configuration → Data Sources
2. Test datasource connection (should show green checkmark)
3. Verify Prometheus/Jaeger are accessible from Grafana container

### Performance Issues
1. Adjust OTEL Collector batch size in `otel-collector-config.yaml.example`
2. Reduce Prometheus scrape interval in `prometheus.yml.example`
3. Adjust memory limits for services in `docker-compose.otel.yml`

## 📚 Next Steps

1. **Integrate with Application**: Configure your app to send telemetry to OTLP endpoints
2. **Create Custom Dashboards**: Build Grafana dashboards for your specific metrics
3. **Set Up Alerting**: Configure Prometheus alerting rules (see Phase 4 docs)
4. **Production Hardening**:
   - Change default passwords
   - Enable TLS/authentication
   - Configure persistent storage
   - Set up backup/restore procedures

## 📖 Related Documentation

- [OTEL Stack Architecture](../docs/architecture/otel-stack-architecture.md)
- [Phase 4 Alerting Implementation Plan](../docs/implementation-plans/phase4-alerting-implementation-plan.md)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

## 🐛 Issue Tracking

This implementation resolves **Issue #71**: Complete OTEL Stack Docker Compose Configuration

For issues or improvements, please file an issue on the repository.
