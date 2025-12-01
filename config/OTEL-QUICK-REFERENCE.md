# OTEL Stack Quick Reference Card

## 🚀 One-Line Start

```bash
docker-compose -f config/docker-compose.otel.yml up -d
```

## 🌐 Service URLs

| Service | URL | Login |
|---------|-----|-------|
| **Grafana** | http://localhost:3001 | admin/admin |
| **Prometheus** | http://localhost:9090 | - |
| **Jaeger** | http://localhost:16686 | - |
| **OTEL Health** | http://localhost:13133/health | - |

## 📡 Send Telemetry

### OTLP Endpoints
- gRPC: `localhost:4317`
- HTTP: `localhost:4318`

### Node.js Example
```javascript
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces'
});
```

### cURL Test
```bash
curl http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d @trace.json
```

## 🔍 Quick Checks

```bash
# Verify all services
./scripts/verify-otel-stack.sh

# Check health
curl http://localhost:13133/health  # OTEL Collector
curl http://localhost:9090/-/healthy  # Prometheus
curl http://localhost:14269/  # Jaeger
curl http://localhost:3001/api/health  # Grafana

# View logs
docker-compose -f config/docker-compose.otel.yml logs -f
```

## 🛠️ Common Commands

```bash
# Start
docker-compose -f config/docker-compose.otel.yml up -d

# Stop
docker-compose -f config/docker-compose.otel.yml down

# Restart
docker-compose -f config/docker-compose.otel.yml restart

# View status
docker-compose -f config/docker-compose.otel.yml ps

# Logs
docker-compose -f config/docker-compose.otel.yml logs -f [service]

# Remove everything (INCLUDING DATA!)
docker-compose -f config/docker-compose.otel.yml down -v
```

## 📊 Port Reference

### OTEL Collector
- 4317 - OTLP gRPC
- 4318 - OTLP HTTP
- 8889 - Prometheus metrics
- 13133 - Health check

### Prometheus
- 9090 - Web UI

### Jaeger
- 16686 - UI
- 14269 - Metrics

### Grafana
- 3001 - Web UI

## 🔧 Configuration Files

- **Docker Compose**: `config/docker-compose.otel.yml`
- **OTEL Collector**: `config/otel-collector-config.yaml.example`
- **Prometheus**: `config/prometheus.yml.example`
- **Grafana Datasources**: `config/grafana/provisioning/datasources/datasources.yml`
- **Grafana Dashboards**: `config/grafana/provisioning/dashboards/dashboards.yml`

## 📚 Documentation

- **Quick Start**: `config/README-OTEL.md`
- **Full Summary**: `docs/implementation-plans/issue-71-completion-summary.md`
- **Architecture**: `docs/architecture/otel-stack-architecture.md`

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Services not starting | Check logs: `docker-compose -f config/docker-compose.otel.yml logs` |
| Port already in use | Change external port in `docker-compose.otel.yml` |
| Grafana can't connect | Check datasources: Grafana → Configuration → Data Sources |
| No metrics in Prometheus | Check targets: http://localhost:9090/targets |
| No traces in Jaeger | Verify OTLP endpoint: `curl http://localhost:4318` |

## 🎯 Grafana Datasources

Pre-configured and auto-loaded:

1. **Prometheus** (default) - `http://prometheus:9090`
2. **Jaeger** - `http://jaeger:16686`
3. **OTEL Collector Metrics** - `http://otel-collector:8889`

## ✅ Verification Checklist

- [ ] All 4 services running: `docker-compose ps`
- [ ] Health checks passing: `./scripts/verify-otel-stack.sh`
- [ ] OTLP endpoints accessible: `curl http://localhost:4318`
- [ ] Prometheus targets green: http://localhost:9090/targets
- [ ] Grafana datasources connected: Grafana UI → Data Sources
- [ ] Sample dashboard visible: Grafana → Dashboards

---

**Issue #71 - COMPLETED** ✅
