# OpenTelemetry Observability Stack Architecture
**Agentic QE Fleet - Issues #69 & #71**

**Document Version:** 1.0.0
**Date:** 2025-11-29
**Status:** Design Phase
**Author:** System Architecture Designer

---

## 1. Executive Summary

This document outlines the comprehensive OpenTelemetry (OTEL) observability stack architecture for the Agentic QE Fleet system. The architecture enables distributed tracing, metrics collection, and log aggregation across the multi-agent quality engineering platform.

**Key Goals:**
- Full-stack observability for distributed agent coordination
- Performance monitoring and bottleneck detection
- Cost tracking and optimization insights
- Quality metrics visualization
- Production-ready deployment with Docker Compose

---

## 2. Current State Analysis

### 2.1 Existing Telemetry Infrastructure

**Already Implemented:**
- OpenTelemetry SDK integration (`@opentelemetry/sdk-node` v0.55.0)
- OTLP exporters (gRPC and HTTP) for traces and metrics
- Auto-instrumentation support (`@opentelemetry/auto-instrumentations-node`)
- Bootstrap module with initialization logic (`src/telemetry/bootstrap.ts`)
- Instrumentation modules:
  - Agent instrumentation (`src/telemetry/instrumentation/agent.ts`)
  - Task instrumentation (`src/telemetry/instrumentation/task.ts`)
  - Memory instrumentation (`src/telemetry/instrumentation/memory.ts`)
- Metric collectors:
  - Agent metrics (`src/telemetry/metrics/agent-metrics.ts`)
  - Quality metrics (`src/telemetry/metrics/quality-metrics.ts`)
  - System metrics (`src/telemetry/metrics/system-metrics.ts`)
  - Cost tracking (`src/telemetry/metrics/collectors/cost.ts`)

**Environment Variables (from bootstrap.ts):**
- `OTEL_EXPORTER_OTLP_ENDPOINT` - Default: `http://localhost:4317`
- `OTEL_EXPORTER_OTLP_PROTOCOL` - Default: gRPC
- `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` - Optional override
- `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` - Optional override
- `OTEL_CONSOLE_EXPORT` - Debug mode (true/false)
- `OTEL_LOG_LEVEL` - Debug logging (debug)
- `OTEL_TRACES_SAMPLER_ARG` - Sample rate (0.0-1.0)
- `OTEL_METRIC_EXPORT_INTERVAL` - Export interval in ms

### 2.2 Existing Docker Infrastructure

**Current docker-compose.yml:**
- `agentic-qe-fleet` service (Node.js application, port 3000)
- `postgres` service (optional, port 5432)
- `redis` service (optional, port 6379)
- Network: `agentic-qe` bridge network
- Volumes: `postgres_data`, `redis_data`

### 2.3 Integration Points Identified

**Application Entry Points:**
1. **CLI Commands** - `src/cli/commands/telemetry.ts`
2. **Fleet Manager** - `src/core/FleetManager.ts`
3. **Agent System** - `src/core/Agent.ts`
4. **Task Execution** - `src/core/Task.ts`
5. **Memory Operations** - `src/core/MemoryManager.ts`
6. **Event Bus** - `src/core/EventBus.ts`

**Key Metrics Already Defined:**
- Agent task duration, count, success rate, token usage, cost
- Quality metrics: test pass rate, coverage (line/branch/function), flaky test count
- System metrics: memory usage, CPU usage, queue depth, database query duration
- Model routing metrics: provider, tier, routing reason

---

## 3. Architecture Design

### 3.1 System Architecture Diagram (Text-Based)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENTIC QE FLEET                              │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Application Layer (Node.js - Port 3000)                    │    │
│  │                                                              │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │    │
│  │  │ Fleet    │  │  Agent   │  │  Task    │  │  Memory  │   │    │
│  │  │ Manager  │  │ Manager  │  │ Executor │  │ Manager  │   │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │    │
│  │       │             │             │             │          │    │
│  │       └─────────────┴─────────────┴─────────────┘          │    │
│  │                         │                                   │    │
│  │              ┌──────────▼──────────┐                        │    │
│  │              │ OpenTelemetry SDK   │                        │    │
│  │              │  - Auto-Instrument  │                        │    │
│  │              │  - Tracer           │                        │    │
│  │              │  - Meter            │                        │    │
│  │              └──────────┬──────────┘                        │    │
│  │                         │                                   │    │
│  │              ┌──────────▼──────────┐                        │    │
│  │              │  OTLP Exporters     │                        │    │
│  │              │  - gRPC: 4317       │                        │    │
│  │              │  - HTTP: 4318       │                        │    │
│  │              └──────────┬──────────┘                        │    │
│  └───────────────────────────────────────────────────────────────┘ │
└──────────────────────────┼────────────────────────────────────────┘
                           │
                           │ OTLP Protocol
                           │
          ┌────────────────▼────────────────┐
          │   OTEL COLLECTOR (Port 4317)    │
          │                                  │
          │  ┌────────────────────────┐     │
          │  │   OTLP Receivers       │     │
          │  │   - gRPC: 4317         │     │
          │  │   - HTTP: 4318         │     │
          │  └──────────┬─────────────┘     │
          │             │                    │
          │  ┌──────────▼─────────────┐     │
          │  │   Processors           │     │
          │  │   - Batch              │     │
          │  │   - Resource Detection │     │
          │  │   - Attributes         │     │
          │  └──────────┬─────────────┘     │
          │             │                    │
          │  ┌──────────▼─────────────┐     │
          │  │   Exporters            │     │
          │  │   - Prometheus         │     │
          │  │   - Jaeger             │     │
          │  └────┬─────────────┬─────┘     │
          └───────┼─────────────┼───────────┘
                  │             │
     ┌────────────▼──┐     ┌────▼─────────────┐
     │  PROMETHEUS   │     │     JAEGER       │
     │  (Port 9090)  │     │  (Port 16686)    │
     │               │     │                  │
     │  - Metrics DB │     │  - Trace Backend │
     │  - PromQL     │     │  - UI            │
     └───────┬───────┘     └────────┬─────────┘
             │                      │
             │      ┌───────────────▼──────────┐
             └──────►     GRAFANA              │
                    │   (Port 3001)            │
                    │                          │
                    │  - Dashboards            │
                    │  - Prometheus Datasource │
                    │  - Jaeger Datasource     │
                    │  - Alerting              │
                    └──────────────────────────┘
```

### 3.2 Component Descriptions

#### 3.2.1 OpenTelemetry Collector

**Purpose:** Central telemetry aggregation and routing hub

**Configuration:**
- Receives OTLP data via gRPC (4317) and HTTP (4318)
- Processes and batches telemetry data
- Routes to multiple backends (Prometheus, Jaeger)
- Health check endpoint (13133)

**Key Features:**
- Resource detection (auto-detect service metadata)
- Batch processing (reduce export overhead)
- Attribute processing (enrich telemetry data)
- Memory limiter (prevent OOM)

#### 3.2.2 Prometheus

**Purpose:** Time-series metrics storage and querying

**Configuration:**
- Scrapes OTEL Collector metrics endpoint (8889)
- Port: 9090
- Retention: 15 days (configurable)
- Storage: Local TSDB

**Metrics Collected:**
- Agent performance (task duration, success rate, token usage)
- Quality metrics (coverage, test pass rate, defect density)
- System metrics (CPU, memory, queue depth)
- Cost tracking (token costs per model/tier)

#### 3.2.3 Jaeger

**Purpose:** Distributed tracing backend and UI

**Configuration:**
- OTLP gRPC receiver (4317)
- UI port: 16686
- Backend: All-in-one (collector, query, UI)
- Storage: In-memory (ephemeral) or BadgerDB (persistent)

**Traces Collected:**
- Agent task execution spans
- Memory store/retrieve operations
- Database query spans
- Model routing decisions
- Fleet coordination events

#### 3.2.4 Grafana

**Purpose:** Unified visualization and alerting platform

**Configuration:**
- Port: 3001 (to avoid conflict with app port 3000)
- Datasources:
  - Prometheus (metrics)
  - Jaeger (traces)
- Pre-configured dashboards
- Alerting rules

**Dashboards:**
1. **Fleet Overview** - Agent health, task throughput, success rates
2. **Quality Metrics** - Coverage trends, test results, flaky tests
3. **Cost Analysis** - Token usage by model, cost per agent type
4. **Performance** - Latency p50/p95/p99, bottleneck detection
5. **System Health** - CPU, memory, database performance

---

## 4. Configuration Files

### 4.1 OTEL Collector Configuration

**File:** `config/otel-collector-config.yaml`

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
    send_batch_max_size: 2048

  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

  resource:
    attributes:
      - key: service.namespace
        value: agentic-qe
        action: upsert

  attributes:
    actions:
      - key: environment
        from_attribute: deployment.environment
        action: upsert

exporters:
  # Prometheus exporter for metrics
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: aqe
    const_labels:
      service: agentic-qe-fleet

  # Jaeger exporter for traces
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true

  # Debug logging (optional)
  logging:
    verbosity: detailed
    sampling_initial: 5
    sampling_thereafter: 200

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource, attributes]
      exporters: [otlp/jaeger, logging]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource, attributes]
      exporters: [prometheus, logging]

  telemetry:
    logs:
      level: info
    metrics:
      address: 0.0.0.0:8888

extensions:
  health_check:
    endpoint: 0.0.0.0:13133
  pprof:
    endpoint: 0.0.0.0:1777
  zpages:
    endpoint: 0.0.0.0:55679
```

### 4.2 Prometheus Configuration

**File:** `config/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  scrape_timeout: 10s
  evaluation_interval: 15s
  external_labels:
    cluster: 'agentic-qe-fleet'
    environment: 'development'

scrape_configs:
  # OTEL Collector metrics
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8889']
        labels:
          service: 'otel-collector'

  # OTEL Collector self-monitoring
  - job_name: 'otel-collector-internal'
    static_configs:
      - targets: ['otel-collector:8888']
        labels:
          service: 'otel-collector-internal'

  # Application direct metrics (if exposed)
  - job_name: 'agentic-qe-fleet'
    static_configs:
      - targets: ['agentic-qe-fleet:3000']
        labels:
          service: 'agentic-qe-fleet'
    metrics_path: '/metrics'
    scrape_interval: 30s

# Alerting rules (optional)
alerting:
  alertmanagers:
    - static_configs:
        - targets: []
          # - alertmanager:9093

# Rule files for recording/alerting rules
rule_files:
  - '/etc/prometheus/rules/*.yml'
```

### 4.3 Grafana Datasources Configuration

**File:** `config/grafana/datasources.yml`

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
    jsonData:
      timeInterval: "15s"
      queryTimeout: "60s"

  - name: Jaeger
    type: jaeger
    access: proxy
    url: http://jaeger:16686
    editable: true
    jsonData:
      tracesToLogs:
        datasourceUid: 'loki'
        filterByTraceID: false
        filterBySpanID: false
```

### 4.4 Enhanced Docker Compose

**File:** `docker-compose.otel.yml` (extends existing docker-compose.yml)

```yaml
version: '3.8'

services:
  # Existing service - add OTEL environment variables
  agentic-qe-fleet:
    environment:
      # Existing variables
      - NODE_ENV=production
      - LOG_LEVEL=info
      - DB_TYPE=sqlite
      - DB_FILENAME=/app/data/fleet.db
      - API_PORT=3000
      - API_HOST=0.0.0.0
      - MAX_AGENTS=10

      # NEW: OpenTelemetry configuration
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
      - OTEL_EXPORTER_OTLP_PROTOCOL=grpc
      - OTEL_SERVICE_NAME=agentic-qe-fleet
      - OTEL_SERVICE_VERSION=${APP_VERSION:-1.9.3}
      - OTEL_TRACES_SAMPLER=parentbased_traceidratio
      - OTEL_TRACES_SAMPLER_ARG=1.0
      - OTEL_METRIC_EXPORT_INTERVAL=30000
      - OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production,service.namespace=agentic-qe
    depends_on:
      - otel-collector

  # NEW: OpenTelemetry Collector
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.91.0
    container_name: otel-collector
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./config/otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC receiver
      - "4318:4318"   # OTLP HTTP receiver
      - "8889:8889"   # Prometheus metrics exporter
      - "8888:8888"   # Collector metrics (self-monitoring)
      - "13133:13133" # Health check
      - "55679:55679" # ZPages extension
    networks:
      - agentic-qe
    restart: unless-stopped
    depends_on:
      - jaeger
      - prometheus

  # NEW: Prometheus
  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./config/prometheus/rules:/etc/prometheus/rules
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - agentic-qe
    restart: unless-stopped

  # NEW: Jaeger (all-in-one)
  jaeger:
    image: jaegertracing/all-in-one:1.52
    container_name: jaeger
    environment:
      - COLLECTOR_OTLP_ENABLED=true
      - SPAN_STORAGE_TYPE=badger
      - BADGER_EPHEMERAL=false
      - BADGER_DIRECTORY_VALUE=/badger/data
      - BADGER_DIRECTORY_KEY=/badger/key
    volumes:
      - jaeger_data:/badger
    ports:
      - "16686:16686" # Jaeger UI
      - "14268:14268" # Jaeger collector HTTP
      - "14250:14250" # Jaeger collector gRPC
      - "6831:6831/udp" # Jaeger agent
    networks:
      - agentic-qe
    restart: unless-stopped

  # NEW: Grafana
  grafana:
    image: grafana/grafana:10.2.2
    container_name: grafana
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_INSTALL_PLUGINS=grafana-piechart-panel,grafana-clock-panel
    volumes:
      - ./config/grafana/datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml
      - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    networks:
      - agentic-qe
    restart: unless-stopped
    depends_on:
      - prometheus
      - jaeger

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  jaeger_data:
  grafana_data:

networks:
  agentic-qe:
    driver: bridge
```

### 4.5 Environment Variables Update

**File:** `.env.example` (additions)

```bash
# Existing variables...

# OpenTelemetry Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_SERVICE_NAME=agentic-qe-fleet
OTEL_SERVICE_VERSION=1.9.3
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_METRIC_EXPORT_INTERVAL=30000
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=development,service.namespace=agentic-qe
OTEL_CONSOLE_EXPORT=false
OTEL_LOG_LEVEL=info

# Observability Stack Endpoints
PROMETHEUS_URL=http://localhost:9090
JAEGER_URL=http://localhost:16686
GRAFANA_URL=http://localhost:3001
OTEL_COLLECTOR_URL=http://localhost:4317
```

---

## 5. Integration Plan

### 5.1 Application Instrumentation Points

**Already Instrumented:**
1. **Agent Operations** (via `src/telemetry/instrumentation/agent.ts`)
   - Agent task execution spans
   - Agent lifecycle events
   - Token usage tracking

2. **Task Operations** (via `src/telemetry/instrumentation/task.ts`)
   - Task submission/execution/completion spans
   - Task queue metrics
   - Task success/failure tracking

3. **Memory Operations** (via `src/telemetry/instrumentation/memory.ts`)
   - Memory store/retrieve spans
   - Memory search operations
   - Cache hit/miss metrics

**Additional Integration Points:**

1. **FleetManager** (`src/core/FleetManager.ts`)
   ```typescript
   import { withSpan, setSpanAttributes } from '../telemetry/bootstrap';

   async initialize() {
     return withSpan('fleet.initialize', async () => {
       setSpanAttributes({ 'fleet.id': this.id });
       // Existing initialization logic
     });
   }
   ```

2. **EventBus** (`src/core/EventBus.ts`)
   ```typescript
   // Add event publishing metrics
   eventBusPublishCount.add(1, { 'event.type': eventType });
   ```

3. **Database** (`src/utils/Database.ts`)
   ```typescript
   // Database query instrumentation
   return withSpan('db.query', async () => {
     setSpanAttributes({
       'db.system': 'sqlite',
       'db.statement': query
     });
     // Query execution
   });
   ```

4. **CLI Commands** (`src/cli/commands/*.ts`)
   ```typescript
   // CLI command tracing
   return withSpan('cli.command.execute', async () => {
     setSpanAttributes({ 'cli.command': commandName });
     // Command execution
   });
   ```

### 5.2 Initialization Sequence

**Current Flow:**
1. Application starts
2. Configuration loaded
3. Telemetry bootstrap NOT currently called at startup

**Proposed Flow:**
1. Application starts
2. **Initialize OTEL SDK** (call `initTelemetry()`)
3. Load configuration
4. Initialize FleetManager
5. Start agents
6. Begin collecting telemetry

**Implementation Location:**
- **Primary:** `src/cli/index.ts` (CLI entry point)
- **Secondary:** `src/core/FleetManager.ts` (if used as library)

```typescript
// src/cli/index.ts
import { initTelemetry } from '../telemetry/bootstrap';

async function main() {
  // Initialize telemetry FIRST
  const telemetryResult = await initTelemetry({
    serviceName: 'agentic-qe-fleet',
    environment: process.env.NODE_ENV || 'development'
  });

  if (!telemetryResult.success) {
    logger.warn('Telemetry initialization failed', telemetryResult.error);
  }

  // Continue with application startup
  const fleet = new FleetManager(config);
  await fleet.initialize();
}
```

### 5.3 Data Flow Diagram

```
Application → OTEL SDK → OTLP Exporter → OTEL Collector
                                              ├─→ Prometheus → Grafana
                                              └─→ Jaeger → Grafana

Metrics Path:
  Agent.executeTask()
    → meter.createCounter('aqe.agent.task.count')
    → OTLP Metrics Exporter (gRPC 4317)
    → OTEL Collector (processes/batches)
    → Prometheus Exporter (8889)
    → Prometheus scrapes metrics
    → Grafana queries Prometheus

Traces Path:
  FleetManager.submitTask()
    → tracer.startActiveSpan('fleet.submit_task')
    → OTLP Trace Exporter (gRPC 4317)
    → OTEL Collector (processes/batches)
    → Jaeger Exporter
    → Jaeger Backend (stores spans)
    → Grafana/Jaeger UI queries traces
```

---

## 6. Deployment Strategy

### 6.1 Development Environment

**Quick Start:**
```bash
# 1. Copy configuration files
mkdir -p config/grafana config/prometheus/rules
cp config/otel-collector-config.yaml.example config/otel-collector-config.yaml
cp config/prometheus.yml.example config/prometheus.yml

# 2. Start observability stack
docker-compose -f docker-compose.yml -f docker-compose.otel.yml up -d

# 3. Verify services
curl http://localhost:13133  # OTEL Collector health
curl http://localhost:9090   # Prometheus UI
curl http://localhost:16686  # Jaeger UI
curl http://localhost:3001   # Grafana UI (admin/admin)
```

### 6.2 Production Environment

**Considerations:**
1. **Persistent Storage:**
   - Prometheus: 15d retention with volume backup
   - Jaeger: BadgerDB with volume backup
   - Grafana: Dashboard persistence

2. **Resource Limits:**
   ```yaml
   otel-collector:
     deploy:
       resources:
         limits:
           cpus: '1.0'
           memory: 1G
         reservations:
           cpus: '0.5'
           memory: 512M
   ```

3. **High Availability:**
   - Multiple OTEL Collector instances
   - Prometheus federation
   - Jaeger with distributed storage (Elasticsearch/Cassandra)

4. **Security:**
   - TLS for OTLP endpoints
   - Authentication for Grafana
   - Network policies for service isolation

### 6.3 Monitoring the Monitors

**OTEL Collector Self-Monitoring:**
- Metrics endpoint: `http://otel-collector:8888/metrics`
- Health check: `http://otel-collector:13133`
- ZPages: `http://otel-collector:55679/debug/tracez`

**Prometheus Self-Monitoring:**
- Internal metrics: `up`, `prometheus_tsdb_*`
- Scrape health: `scrape_duration_seconds`

---

## 7. Grafana Dashboard Specifications

### 7.1 Fleet Overview Dashboard

**Panels:**
1. **Active Agents** (Gauge)
   - Query: `aqe_agent_active_count`
   - Threshold: Green >80%, Yellow 50-80%, Red <50%

2. **Task Throughput** (Graph)
   - Query: `rate(aqe_agent_task_count[5m])`
   - Group by: `agent.type`

3. **Success Rate** (Stat)
   - Query: `avg(aqe_agent_success_rate) * 100`
   - Unit: Percentage

4. **Task Duration p95** (Graph)
   - Query: `histogram_quantile(0.95, rate(aqe_agent_task_duration_bucket[5m]))`

5. **Recent Traces** (Table from Jaeger)
   - Show last 20 traces with errors

### 7.2 Quality Metrics Dashboard

**Panels:**
1. **Test Pass Rate Trend** (Graph)
   - Query: `aqe_quality_test_pass_rate`
   - Time range: Last 7 days

2. **Coverage by Type** (Bar Chart)
   - Queries:
     - Line: `aqe_quality_coverage_line`
     - Branch: `aqe_quality_coverage_branch`
     - Function: `aqe_quality_coverage_function`

3. **Flaky Test Count** (Stat)
   - Query: `aqe_quality_flaky_count`
   - Alert: >10 flaky tests

4. **Security Vulnerabilities** (Table)
   - Query: `aqe_quality_security_vulnerability_count`
   - Group by: `qe.security_severity`

### 7.3 Cost Analysis Dashboard

**Panels:**
1. **Total Cost (24h)** (Stat)
   - Query: `sum(increase(aqe_agent_cost[24h]))`
   - Unit: USD

2. **Cost by Model** (Pie Chart)
   - Query: `sum by (model.name) (aqe_agent_cost)`

3. **Token Usage by Agent Type** (Stacked Graph)
   - Query: `rate(aqe_agent_token_usage[5m])`
   - Group by: `agent.type`

4. **Cost per Task** (Table)
   - Query: `aqe_agent_cost / aqe_agent_task_count`

### 7.4 Performance Dashboard

**Panels:**
1. **Latency Percentiles** (Graph)
   - p50: `histogram_quantile(0.50, rate(aqe_agent_task_duration_bucket[5m]))`
   - p95: `histogram_quantile(0.95, rate(aqe_agent_task_duration_bucket[5m]))`
   - p99: `histogram_quantile(0.99, rate(aqe_agent_task_duration_bucket[5m]))`

2. **Queue Depth** (Graph)
   - Query: `aqe_system_queue_depth`

3. **Memory Usage** (Graph)
   - Query: `aqe_system_memory_usage`

4. **Database Query Duration** (Heatmap)
   - Query: `rate(aqe_system_db_query_duration_bucket[5m])`

### 7.5 System Health Dashboard

**Panels:**
1. **CPU Usage** (Gauge)
   - Query: `aqe_system_cpu_usage`

2. **Memory Usage** (Gauge)
   - Query: `aqe_system_memory_usage / (1024*1024*1024)`
   - Unit: GB

3. **Database Connections** (Graph)
   - Query: `aqe_system_db_connection_count`

4. **Event Bus Latency** (Graph)
   - Query: `rate(aqe_system_eventbus_latency[5m])`

---

## 8. Implementation Roadmap

### Phase 1: Infrastructure Setup (Week 1)
**Tasks:**
1. Create OTEL Collector configuration file
2. Create Prometheus configuration file
3. Create Grafana datasource configuration
4. Create docker-compose.otel.yml
5. Update .env.example with OTEL variables
6. Test stack startup and connectivity

**Deliverables:**
- Working Docker Compose stack
- All services healthy and communicating
- Manual verification of OTLP data flow

**Acceptance Criteria:**
- `docker-compose -f docker-compose.yml -f docker-compose.otel.yml up` succeeds
- OTEL Collector receives test spans/metrics
- Prometheus scrapes OTEL Collector metrics
- Jaeger UI shows test traces
- Grafana datasources connected

### Phase 2: Application Integration (Week 2)
**Tasks:**
1. Add telemetry initialization to CLI entry point
2. Instrument FleetManager with spans
3. Instrument EventBus with metrics
4. Instrument Database with spans
5. Add CLI command tracing
6. Test end-to-end data flow

**Deliverables:**
- Telemetry initialization at startup
- All major components instrumented
- Spans visible in Jaeger
- Metrics visible in Prometheus

**Acceptance Criteria:**
- Fleet startup creates initialization trace
- Agent task execution creates complete span hierarchy
- Quality metrics flow to Prometheus
- No telemetry errors in logs

### Phase 3: Dashboard Creation (Week 3)
**Tasks:**
1. Create Fleet Overview dashboard JSON
2. Create Quality Metrics dashboard JSON
3. Create Cost Analysis dashboard JSON
4. Create Performance dashboard JSON
5. Create System Health dashboard JSON
6. Configure Grafana provisioning

**Deliverables:**
- 5 pre-configured Grafana dashboards
- Dashboard provisioning via config files
- Alert rules for critical metrics

**Acceptance Criteria:**
- All dashboards display real data
- Graphs update with live metrics
- No query errors in dashboards
- Alerts trigger correctly

### Phase 4: Documentation & Testing (Week 4)
**Tasks:**
1. Write deployment guide
2. Write troubleshooting guide
3. Create runbook for common issues
4. Performance testing with observability
5. Load testing with metric validation
6. Documentation review and updates

**Deliverables:**
- Complete deployment documentation
- Troubleshooting guide
- Runbook for operations
- Performance test results

**Acceptance Criteria:**
- New team member can deploy stack using docs
- All common issues documented
- Performance baseline established
- No regressions in application performance

---

## 9. Quality Attributes

### 9.1 Performance

**Requirements:**
- OTEL SDK overhead: <5% CPU, <50MB memory
- OTLP export latency: <100ms p95
- Metric collection interval: 15-30 seconds
- Trace sampling: 100% in development, 10-50% in production

**Optimizations:**
- Batch processing (1024 spans/metrics per batch)
- Memory limiter (512MB limit, 128MB spike)
- Asynchronous exports
- Sampling strategies (parent-based trace ID ratio)

### 9.2 Reliability

**Requirements:**
- Telemetry failures don't crash application
- Data loss <0.1% under normal load
- Graceful degradation if collector unavailable
- 99.9% uptime for observability stack

**Strategies:**
- Circuit breaker for OTLP exports
- Local buffering during collector outage
- Exponential backoff for retries
- Health checks for all components

### 9.3 Security

**Requirements:**
- No sensitive data in spans/metrics
- TLS for all production endpoints
- Authentication for Grafana
- Network isolation for observability stack

**Implementations:**
- Attribute sanitization in processors
- TLS certificates for OTLP endpoints
- Grafana RBAC configuration
- Docker network policies

### 9.4 Scalability

**Requirements:**
- Support 100+ agents per fleet
- Handle 10K+ spans/second
- Prometheus retention: 15 days
- Jaeger storage: 7 days (configurable)

**Strategies:**
- OTEL Collector horizontal scaling
- Prometheus federation for multiple fleets
- Jaeger with distributed storage backend
- Metric aggregation and downsampling

### 9.5 Maintainability

**Requirements:**
- Configuration as code
- Version-controlled dashboards
- Automated provisioning
- Self-documenting metrics

**Implementations:**
- All config in Git repository
- Grafana dashboard JSON in version control
- Docker Compose for reproducible deployments
- Semantic metric naming (METRIC_NAMES constants)

---

## 10. Risk Analysis

### 10.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **OTEL SDK overhead affects performance** | High | Medium | Implement sampling, performance testing, rollback plan |
| **Collector single point of failure** | High | Medium | HA deployment, local buffering, health checks |
| **Metric cardinality explosion** | Medium | High | Limit labels, use relabeling, monitor Prometheus TSDB size |
| **Storage costs for traces/metrics** | Medium | Medium | Retention policies, sampling, storage limits |
| **Version incompatibility (OTEL deps)** | Low | Medium | Pin versions, compatibility testing |

### 10.2 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Team unfamiliarity with OTEL** | Medium | High | Training, documentation, gradual rollout |
| **Dashboard maintenance burden** | Low | High | Auto-provisioning, dashboard versioning |
| **Alert fatigue** | Medium | Medium | Tuned thresholds, alert aggregation |
| **Resource constraints in dev env** | Low | High | Optional profiles, lightweight configs |

### 10.3 Data Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **PII in traces** | High | Low | Attribute sanitization, code review |
| **API keys in metrics** | High | Low | Env var patterns, secret detection |
| **Cost tracking data exposure** | Medium | Low | RBAC in Grafana, secure datasources |

---

## 11. Success Metrics

### 11.1 Technical Metrics

**Deployment Success:**
- Stack startup time: <60 seconds
- All health checks pass: 100%
- Zero telemetry errors in logs

**Data Quality:**
- Trace completeness: >95%
- Metric delivery latency: <1 minute p95
- Missing span rate: <1%

**Performance:**
- Application performance degradation: <5%
- OTEL Collector CPU usage: <20%
- OTEL Collector memory usage: <500MB

### 11.2 Business Metrics

**Observability Adoption:**
- Dashboards created by team: >5
- Daily Grafana active users: >3
- Alerts configured: >10

**Issue Resolution:**
- MTTR reduction: 30% (via better debugging)
- Proactive issue detection: >50% of incidents
- Root cause identification time: <15 minutes

**Cost Optimization:**
- Token cost visibility: 100% of model calls
- Cost anomaly detection: <1 hour lag
- Cost reduction opportunities identified: >5

### 11.3 User Satisfaction

**Developer Experience:**
- Deployment documentation clarity: 4/5 rating
- Troubleshooting effectiveness: 4/5 rating
- Dashboard usefulness: 4/5 rating

---

## 12. Appendices

### A. Port Reference

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Agentic QE Fleet | 3000 | HTTP | Application API |
| OTEL Collector | 4317 | gRPC | OTLP receiver (traces/metrics) |
| OTEL Collector | 4318 | HTTP | OTLP receiver (traces/metrics) |
| OTEL Collector | 8889 | HTTP | Prometheus exporter endpoint |
| OTEL Collector | 8888 | HTTP | Self-monitoring metrics |
| OTEL Collector | 13133 | HTTP | Health check |
| OTEL Collector | 55679 | HTTP | ZPages debug UI |
| Prometheus | 9090 | HTTP | Prometheus UI & API |
| Jaeger | 16686 | HTTP | Jaeger UI |
| Jaeger | 14268 | HTTP | Jaeger collector HTTP |
| Jaeger | 14250 | gRPC | Jaeger collector gRPC |
| Jaeger | 6831 | UDP | Jaeger agent |
| Grafana | 3001 | HTTP | Grafana UI (changed from 3000) |
| PostgreSQL | 5432 | TCP | Database (optional) |
| Redis | 6379 | TCP | Cache (optional) |

### B. Environment Variable Reference

**Required:**
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP collector endpoint
- `OTEL_SERVICE_NAME` - Service identifier

**Optional:**
- `OTEL_EXPORTER_OTLP_PROTOCOL` - gRPC (default) or HTTP
- `OTEL_TRACES_SAMPLER` - Sampling strategy
- `OTEL_TRACES_SAMPLER_ARG` - Sampling rate (0.0-1.0)
- `OTEL_METRIC_EXPORT_INTERVAL` - Metric export interval (ms)
- `OTEL_CONSOLE_EXPORT` - Enable console debugging
- `OTEL_LOG_LEVEL` - Debug logging level

### C. Metric Catalog

**Agent Metrics:**
- `aqe.agent.task.duration` - Histogram of task execution time
- `aqe.agent.task.count` - Counter of tasks executed
- `aqe.agent.success.rate` - Gauge of success percentage
- `aqe.agent.token.usage` - Counter of tokens consumed
- `aqe.agent.cost` - Counter of costs incurred

**Quality Metrics:**
- `aqe.quality.test.pass_rate` - Gauge of test pass percentage
- `aqe.quality.coverage.line` - Gauge of line coverage
- `aqe.quality.coverage.branch` - Gauge of branch coverage
- `aqe.quality.flaky.count` - Counter of flaky tests detected

**System Metrics:**
- `aqe.system.memory.usage` - Gauge of memory consumption
- `aqe.system.cpu.usage` - Gauge of CPU usage
- `aqe.system.queue.depth` - Gauge of task queue size

### D. Span Catalog

**Agent Spans:**
- `aqe.agent.execute_task` - Agent task execution
- `aqe.agent.generate_tests` - Test generation operation
- `aqe.agent.analyze_coverage` - Coverage analysis operation

**Fleet Spans:**
- `aqe.fleet.spawn_agent` - Agent creation
- `aqe.fleet.coordinate` - Fleet coordination logic
- `aqe.fleet.distribute_task` - Task distribution

**Database Spans:**
- `aqe.db.query` - Database query execution
- `aqe.db.insert` - Database insert operation
- `aqe.db.update` - Database update operation

### E. Troubleshooting Guide (Preview)

**Issue: No traces appearing in Jaeger**
1. Check OTEL Collector logs: `docker logs otel-collector`
2. Verify OTLP endpoint: `curl http://localhost:13133`
3. Check application logs for telemetry errors
4. Verify Jaeger storage: `docker logs jaeger`

**Issue: Prometheus not scraping metrics**
1. Check Prometheus targets: http://localhost:9090/targets
2. Verify OTEL Collector Prometheus exporter: `curl http://localhost:8889/metrics`
3. Check Prometheus config: `docker exec prometheus cat /etc/prometheus/prometheus.yml`

**Issue: High collector memory usage**
1. Reduce batch size in config
2. Enable memory limiter processor
3. Reduce metric cardinality (fewer labels)
4. Implement sampling for traces

---

## 13. Conclusion

This architecture provides a comprehensive, production-ready observability solution for the Agentic QE Fleet. The design leverages existing OpenTelemetry instrumentation, extends it to critical components, and provides a complete stack with Prometheus, Jaeger, and Grafana.

**Key Benefits:**
- **Complete Visibility:** End-to-end tracing of agent workflows
- **Performance Insights:** Detailed metrics on task execution, costs, quality
- **Cost Optimization:** Token usage tracking across models and agents
- **Production Ready:** HA-capable, scalable, secure architecture
- **Developer Friendly:** Docker Compose deployment, comprehensive docs

**Next Steps:**
1. Review and approve architecture design
2. Begin Phase 1 implementation (infrastructure setup)
3. Test in development environment
4. Iterate based on feedback
5. Deploy to production with monitoring

---

**Document Control**
- Version: 1.0.0
- Status: Draft for Review
- Next Review Date: 2025-12-06
- Approval Required From: Engineering Lead, DevOps Lead

**Change Log:**
- 2025-11-29 v1.0.0: Initial architecture design (System Architecture Designer)
