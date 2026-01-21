# Phase 3: Visualization Architecture
## Agentic QE Fleet - Real-time Visual Intelligence System

**Version**: 1.0.0
**Status**: Design Complete
**Author**: System Architecture Team
**Date**: 2025-11-21

---

## Executive Summary

This document defines the complete architecture for the AQE Fleet's visualization system, enabling real-time monitoring and analysis of distributed QE agents through an intuitive web interface.

**Key Objectives**:
- Real-time fleet monitoring with <100ms render latency for 100 nodes
- Interactive mind-map visualization of agent coordination
- Live quality metrics dashboard with <500ms update lag
- Historical analytics and trend analysis
- Multi-user support with role-based access control

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Data Layer Architecture](#data-layer-architecture)
4. [API Design](#api-design)
5. [Frontend Architecture](#frontend-architecture)
6. [Real-time Communication](#real-time-communication)
7. [Performance Requirements](#performance-requirements)
8. [Security & Access Control](#security--access-control)
9. [Deployment Architecture](#deployment-architecture)
10. [Monitoring & Observability](#monitoring--observability)
11. [Architecture Decision Records](#architecture-decision-records)

---

## 1. System Architecture

### 1.1 High-Level Architecture (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                     AQE Fleet System Context                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │   QE Team    │────────>│ Visualization│                      │
│  │   Members    │         │   Web UI     │                      │
│  └──────────────┘         └──────┬───────┘                      │
│                                   │                               │
│                                   v                               │
│                          ┌────────────────┐                      │
│                          │  Visualization │                      │
│                          │     Backend    │                      │
│                          │   (Node.js)    │                      │
│                          └────────┬───────┘                      │
│                                   │                               │
│                                   v                               │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────┐│
│  │ OpenTelemetry│<────────│   Telemetry  │────────>│ AgentDB  ││
│  │  Collector   │         │   Layer      │         │ (SQLite) ││
│  └──────────────┘         └──────────────┘         └──────────┘│
│         ^                                                         │
│         │                                                         │
│  ┌──────┴──────┐                                                │
│  │  AQE Fleet  │                                                │
│  │   Agents    │                                                │
│  └─────────────┘                                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────┐
│                   Visualization System Containers                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Frontend (React + Vite)                    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  • React 18.x with TypeScript                           │   │
│  │  • Cytoscape.js for mind-map graphs                     │   │
│  │  • Recharts for quality metrics                         │   │
│  │  • Tailwind CSS for styling                             │   │
│  │  • React Query for data fetching                        │   │
│  │  • WebSocket client for real-time updates              │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                        │
│                         │ HTTPS + WebSocket                      │
│                         v                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Backend (Node.js + Express)                   │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  REST API Layer                                         │   │
│  │  ├─ /api/v1/metrics (historical data)                   │   │
│  │  ├─ /api/v1/agents (agent status)                       │   │
│  │  ├─ /api/v1/tasks (task execution data)                 │   │
│  │  └─ /api/v1/topology (fleet coordination)               │   │
│  │                                                          │   │
│  │  WebSocket Server                                       │   │
│  │  └─ /ws (real-time streaming)                           │   │
│  │                                                          │   │
│  │  Data Transformer (V4)                                  │   │
│  │  └─ Telemetry → Visualization format converter         │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                        │
│                         v                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Data Storage Layer                           │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  AgentDB (SQLite)                                       │   │
│  │  ├─ Telemetry data (traces, metrics, logs)             │   │
│  │  ├─ Agent execution history                             │   │
│  │  ├─ Learning patterns                                   │   │
│  │  └─ Quality metrics                                     │   │
│  │                                                          │   │
│  │  In-Memory Cache (Redis - Optional)                    │   │
│  │  └─ Real-time metrics buffer                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Component Diagram (C4 Level 3)

```
┌─────────────────────────────────────────────────────────────────┐
│              Backend Component Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              API Gateway Layer                         │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │  Express Router                                        │    │
│  │  ├─ Rate Limiting (1000 req/min)                       │    │
│  │  ├─ Authentication Middleware                          │    │
│  │  ├─ CORS Configuration                                 │    │
│  │  ├─ Request Validation (AJV)                           │    │
│  │  └─ Error Handling                                     │    │
│  └────────────┬───────────────────────────────────────────┘    │
│               │                                                  │
│               v                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         Data Transformer (V4)                          │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │  TelemetryToVisualizationConverter                    │    │
│  │  ├─ convertTraceToAgentNode()                          │    │
│  │  ├─ convertMetricsToChartData()                        │    │
│  │  ├─ buildCoordinationGraph()                           │    │
│  │  ├─ aggregateQualityMetrics()                          │    │
│  │  └─ transformHistoricalData()                          │    │
│  │                                                         │    │
│  │  VisualizationDataCache                               │    │
│  │  ├─ In-memory LRU cache (500 MB limit)                │    │
│  │  ├─ 5-minute TTL for real-time data                   │    │
│  │  └─ 1-hour TTL for historical data                    │    │
│  └────────────┬───────────────────────────────────────────┘    │
│               │                                                  │
│               v                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │          Real-time Streaming (V5)                      │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │  WebSocketServer (ws library)                         │    │
│  │  ├─ Connection Management                              │    │
│  │  │  └─ Max 1000 concurrent connections                │    │
│  │  ├─ Room-based Broadcasting                            │    │
│  │  │  └─ Clients subscribe to specific fleets           │    │
│  │  ├─ Message Queue (in-memory)                          │    │
│  │  │  └─ Buffer size: 10,000 messages                   │    │
│  │  └─ Heartbeat (ping every 30s)                        │    │
│  │                                                         │    │
│  │  EventStream                                           │    │
│  │  ├─ Subscribe to OpenTelemetry events                 │    │
│  │  ├─ Filter by fleet/agent                             │    │
│  │  ├─ Transform to WebSocket messages                   │    │
│  │  └─ Broadcast to connected clients                    │    │
│  └────────────┬───────────────────────────────────────────┘    │
│               │                                                  │
│               v                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │          REST API Endpoints (V6)                       │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │  MetricsController                                     │    │
│  │  ├─ GET /api/v1/metrics/quality                        │    │
│  │  ├─ GET /api/v1/metrics/performance                    │    │
│  │  └─ GET /api/v1/metrics/cost                           │    │
│  │                                                         │    │
│  │  AgentsController                                      │    │
│  │  ├─ GET /api/v1/agents                                 │    │
│  │  ├─ GET /api/v1/agents/:id                             │    │
│  │  ├─ GET /api/v1/agents/:id/tasks                       │    │
│  │  └─ GET /api/v1/agents/:id/health                      │    │
│  │                                                         │    │
│  │  TasksController                                       │    │
│  │  ├─ GET /api/v1/tasks                                  │    │
│  │  ├─ GET /api/v1/tasks/:id                              │    │
│  │  └─ GET /api/v1/tasks/:id/trace                        │    │
│  │                                                         │    │
│  │  TopologyController                                    │    │
│  │  ├─ GET /api/v1/topology                               │    │
│  │  ├─ GET /api/v1/topology/graph                         │    │
│  │  └─ GET /api/v1/topology/coordination                  │    │
│  └────────────┬───────────────────────────────────────────┘    │
│               │                                                  │
│               v                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │          Data Access Layer                             │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │  TelemetryRepository                                   │    │
│  │  ├─ Query OpenTelemetry traces                         │    │
│  │  ├─ Aggregate metrics from OTEL SDK                    │    │
│  │  └─ Access logs from exporter                          │    │
│  │                                                         │    │
│  │  AgentDBRepository                                     │    │
│  │  ├─ Query agent execution history                      │    │
│  │  ├─ Retrieve learning patterns                         │    │
│  │  └─ Access quality metrics                             │    │
│  │                                                         │    │
│  │  QueryOptimizer                                        │    │
│  │  ├─ Index-based lookups                                │    │
│  │  ├─ Query result caching                               │    │
│  │  └─ Parallel query execution                           │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Technology Selection

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Backend Runtime** | Node.js | 18.x LTS | Already used in project, native async I/O |
| **Backend Framework** | Express.js | 4.x | Lightweight, mature, excellent middleware ecosystem |
| **Real-time** | ws (WebSocket) | 8.x | Native WebSocket library, high performance, low overhead |
| **Database** | AgentDB (SQLite) | Existing | Already integrated, ACID guarantees, embedded |
| **Cache** | Node.js Map | Native | Built-in LRU cache, no external dependencies |
| **Frontend Framework** | React | 18.x | Virtual DOM, component reuse, large ecosystem |
| **Build Tool** | Vite | 5.x | Fast HMR, optimized builds, native ESM |
| **Graph Visualization** | Cytoscape.js | 3.x | Feature-rich, WebGL rendering, layout algorithms |
| **Charts** | Recharts | 2.x | React-native, declarative, responsive |
| **Styling** | Tailwind CSS | 3.x | Utility-first, minimal CSS bundle, consistent design |
| **State Management** | React Query | 5.x | Server state management, caching, automatic refetch |
| **Type Safety** | TypeScript | 5.x | Already used, type safety, better DX |
| **API Validation** | AJV | 8.x | JSON Schema validation, fast compilation |

### 2.2 Technology Trade-offs

#### Backend Framework: Express.js vs. Fastify vs. Koa

**Decision**: Express.js

**Rationale**:
- **Maturity**: 13+ years in production, battle-tested
- **Ecosystem**: Largest middleware library ecosystem
- **Team Familiarity**: Project already uses Node.js patterns similar to Express
- **Performance**: Sufficient for 1000 req/min with proper caching
- **Trade-off**: Fastify is 2x faster but adds learning curve and potential compatibility issues

#### WebSocket Library: ws vs. Socket.IO vs. uWebSockets.js

**Decision**: ws (native WebSocket library)

**Rationale**:
- **Simplicity**: Pure WebSocket protocol, no custom transport layers
- **Performance**: Minimal overhead, handles 10,000+ connections
- **Standards Compliance**: Native WebSocket API, works with all modern browsers
- **Size**: 30KB minified vs. Socket.IO's 300KB
- **Trade-off**: No automatic fallback to long-polling (not needed for modern browsers)

#### Graph Visualization: Cytoscape.js vs. D3.js vs. vis.js

**Decision**: Cytoscape.js

**Rationale**:
- **Purpose-built**: Designed specifically for graph/network visualization
- **Performance**: WebGL renderer for 10,000+ nodes
- **Layout Algorithms**: 15+ built-in algorithms (force-directed, hierarchical, etc.)
- **Interactivity**: Built-in pan, zoom, node selection
- **Trade-off**: D3.js offers more flexibility but requires custom graph implementation

#### State Management: React Query vs. Redux vs. Zustand

**Decision**: React Query

**Rationale**:
- **Server State Focus**: Designed for fetching, caching, and syncing server data
- **Automatic Refetch**: Background updates without manual orchestration
- **Caching**: Built-in intelligent cache invalidation
- **DevTools**: Excellent debugging experience
- **Trade-off**: Not ideal for complex client-side state (use React Context for that)

---

## 3. Data Layer Architecture

### 3.1 Data Transformer (V4)

The Data Transformer converts raw OpenTelemetry data into visualization-friendly formats.

```typescript
// src/visualization/transformer/TelemetryToVisualizationConverter.ts

import { Span, Metric, LogRecord } from '@opentelemetry/api';
import {
  AgentNode,
  CoordinationEdge,
  QualityMetrics,
  TimeSeriesData,
  VisualizationGraph
} from './types';

export class TelemetryToVisualizationConverter {
  /**
   * Convert OpenTelemetry trace to agent node representation
   */
  convertTraceToAgentNode(span: Span): AgentNode {
    const attributes = span.attributes;

    return {
      id: attributes['agent.id'] as string,
      type: attributes['agent.type'] as string,
      name: attributes['agent.name'] as string,
      status: this.mapSpanStatusToAgentStatus(span.status),
      metrics: {
        taskCount: attributes['task.count'] as number || 0,
        successRate: attributes['agent.success.rate'] as number || 0,
        avgDuration: span.duration / 1_000_000, // Convert ns to ms
        tokenUsage: attributes['agent.token.usage'] as number || 0,
        cost: attributes['agent.cost'] as number || 0
      },
      position: this.calculateNodePosition(span), // For graph layout
      metadata: {
        fleetId: attributes['fleet.id'] as string,
        topology: attributes['fleet.topology'] as string,
        startTime: span.startTime,
        endTime: span.endTime
      }
    };
  }

  /**
   * Build coordination graph from trace data
   */
  buildCoordinationGraph(spans: Span[]): VisualizationGraph {
    const nodes: AgentNode[] = [];
    const edges: CoordinationEdge[] = [];

    // Convert spans to nodes
    for (const span of spans) {
      const node = this.convertTraceToAgentNode(span);
      nodes.push(node);
    }

    // Build edges from parent-child relationships
    for (const span of spans) {
      if (span.parentSpanId) {
        const edge: CoordinationEdge = {
          source: span.parentSpanId,
          target: span.spanContext().spanId,
          type: this.inferEdgeType(span),
          weight: this.calculateEdgeWeight(span),
          metadata: {
            latency: span.duration / 1_000_000,
            messageCount: span.events.length
          }
        };
        edges.push(edge);
      }
    }

    return { nodes, edges };
  }

  /**
   * Aggregate metrics for quality dashboard
   */
  aggregateQualityMetrics(metrics: Metric[]): QualityMetrics {
    const result: QualityMetrics = {
      testPassRate: 0,
      coveragePercent: {
        line: 0,
        branch: 0,
        function: 0
      },
      defectDensity: 0,
      flakyTestCount: 0,
      securityVulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      qualityGateStatus: 'passing',
      timestamp: Date.now()
    };

    for (const metric of metrics) {
      switch (metric.descriptor.name) {
        case 'aqe.quality.test.pass_rate':
          result.testPassRate = this.getLatestMetricValue(metric);
          break;
        case 'aqe.quality.coverage.line':
          result.coveragePercent.line = this.getLatestMetricValue(metric);
          break;
        case 'aqe.quality.coverage.branch':
          result.coveragePercent.branch = this.getLatestMetricValue(metric);
          break;
        case 'aqe.quality.coverage.function':
          result.coveragePercent.function = this.getLatestMetricValue(metric);
          break;
        case 'aqe.quality.defect.density':
          result.defectDensity = this.getLatestMetricValue(metric);
          break;
        case 'aqe.quality.flaky.count':
          result.flakyTestCount = this.getLatestMetricValue(metric);
          break;
        case 'aqe.quality.security.vulnerability.count':
          this.aggregateSecurityMetrics(metric, result);
          break;
      }
    }

    return result;
  }

  /**
   * Convert metrics to time series for charts
   */
  convertMetricsToChartData(
    metrics: Metric[],
    timeRange: { start: number; end: number },
    granularity: 'minute' | 'hour' | 'day'
  ): TimeSeriesData[] {
    const buckets = this.createTimeBuckets(timeRange, granularity);
    const result: TimeSeriesData[] = [];

    for (const metric of metrics) {
      const points = metric.dataPoints.filter(
        dp => dp.timestamp >= timeRange.start && dp.timestamp <= timeRange.end
      );

      for (const bucket of buckets) {
        const bucketPoints = points.filter(
          dp => dp.timestamp >= bucket.start && dp.timestamp < bucket.end
        );

        if (bucketPoints.length > 0) {
          result.push({
            timestamp: bucket.start,
            metricName: metric.descriptor.name,
            value: this.aggregateDataPoints(bucketPoints, metric.descriptor.type),
            attributes: bucketPoints[0].attributes
          });
        }
      }
    }

    return result;
  }

  /**
   * Transform historical data with aggregation
   */
  async transformHistoricalData(
    query: {
      metricNames: string[];
      timeRange: { start: number; end: number };
      aggregation: 'avg' | 'sum' | 'min' | 'max' | 'p95';
      groupBy?: string[];
    }
  ): Promise<Record<string, TimeSeriesData[]>> {
    const result: Record<string, TimeSeriesData[]> = {};

    // Query optimization: Parallel fetching
    const metricsPromises = query.metricNames.map(name =>
      this.fetchMetricData(name, query.timeRange)
    );

    const metricsData = await Promise.all(metricsPromises);

    for (let i = 0; i < query.metricNames.length; i++) {
      const name = query.metricNames[i];
      const data = metricsData[i];

      result[name] = this.applyAggregation(
        data,
        query.aggregation,
        query.groupBy
      );
    }

    return result;
  }

  // Helper methods
  private mapSpanStatusToAgentStatus(status: any): 'active' | 'idle' | 'error' {
    if (status.code === 0) return 'active';
    if (status.code === 1) return 'error';
    return 'idle';
  }

  private calculateNodePosition(span: Span): { x: number; y: number } {
    // Initial position - will be refined by layout algorithm
    return { x: 0, y: 0 };
  }

  private inferEdgeType(span: Span): 'coordination' | 'data-flow' | 'control-flow' {
    const spanName = span.name;
    if (spanName.includes('coordinate')) return 'coordination';
    if (spanName.includes('data')) return 'data-flow';
    return 'control-flow';
  }

  private calculateEdgeWeight(span: Span): number {
    // Weight based on communication frequency and data volume
    return span.events.length;
  }

  private getLatestMetricValue(metric: Metric): number {
    const latest = metric.dataPoints[metric.dataPoints.length - 1];
    return latest?.value as number || 0;
  }

  private aggregateSecurityMetrics(metric: Metric, result: QualityMetrics): void {
    for (const dp of metric.dataPoints) {
      const severity = dp.attributes['qe.security_severity'] as string;
      const count = dp.value as number;

      switch (severity) {
        case 'critical':
          result.securityVulnerabilities.critical += count;
          break;
        case 'high':
          result.securityVulnerabilities.high += count;
          break;
        case 'medium':
          result.securityVulnerabilities.medium += count;
          break;
        case 'low':
          result.securityVulnerabilities.low += count;
          break;
      }
    }
  }

  private createTimeBuckets(
    timeRange: { start: number; end: number },
    granularity: 'minute' | 'hour' | 'day'
  ): Array<{ start: number; end: number }> {
    const buckets: Array<{ start: number; end: number }> = [];
    const interval = this.getIntervalMs(granularity);

    for (let ts = timeRange.start; ts < timeRange.end; ts += interval) {
      buckets.push({
        start: ts,
        end: Math.min(ts + interval, timeRange.end)
      });
    }

    return buckets;
  }

  private getIntervalMs(granularity: 'minute' | 'hour' | 'day'): number {
    switch (granularity) {
      case 'minute': return 60 * 1000;
      case 'hour': return 60 * 60 * 1000;
      case 'day': return 24 * 60 * 60 * 1000;
    }
  }

  private aggregateDataPoints(points: any[], metricType: string): number {
    if (points.length === 0) return 0;

    // For counters, sum the values
    if (metricType === 'counter') {
      return points.reduce((sum, p) => sum + (p.value as number), 0);
    }

    // For gauges and histograms, use average
    const sum = points.reduce((s, p) => s + (p.value as number), 0);
    return sum / points.length;
  }

  private async fetchMetricData(
    name: string,
    timeRange: { start: number; end: number }
  ): Promise<any[]> {
    // Implementation would query OpenTelemetry SDK or AgentDB
    return [];
  }

  private applyAggregation(
    data: any[],
    aggregation: 'avg' | 'sum' | 'min' | 'max' | 'p95',
    groupBy?: string[]
  ): TimeSeriesData[] {
    // Implementation of aggregation logic
    return [];
  }
}
```

### 3.2 Visualization Data Cache

```typescript
// src/visualization/cache/VisualizationCache.ts

export class VisualizationCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private evictionPolicy: 'LRU' | 'LFU';

  constructor(options: {
    maxSizeMb: number;
    evictionPolicy: 'LRU' | 'LFU';
  }) {
    this.cache = new Map();
    this.maxSize = options.maxSizeMb * 1024 * 1024; // Convert to bytes
    this.evictionPolicy = options.evictionPolicy;
  }

  set(key: string, value: any, ttlMs: number): void {
    const entry: CacheEntry = {
      value,
      expiresAt: Date.now() + ttlMs,
      size: this.estimateSize(value),
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Evict if necessary
    while (this.getTotalSize() + entry.size > this.maxSize) {
      this.evictOne();
    }

    this.cache.set(key, entry);
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.value;
  }

  private evictOne(): void {
    if (this.evictionPolicy === 'LRU') {
      this.evictLRU();
    } else {
      this.evictLFU();
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private evictLFU(): void {
    let leastUsedKey: string | null = null;
    let leastCount = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < leastCount) {
        leastCount = entry.accessCount;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }

  private getTotalSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  private estimateSize(value: any): number {
    const json = JSON.stringify(value);
    return json.length * 2; // UTF-16 encoding
  }
}

interface CacheEntry {
  value: any;
  expiresAt: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
}
```

---

## 4. API Design

### 4.1 REST API Endpoints (V6)

#### 4.1.1 Metrics Endpoints

```typescript
// GET /api/v1/metrics/quality
// Returns aggregated quality metrics

interface QualityMetricsResponse {
  data: {
    testPassRate: number;
    coverage: {
      line: number;
      branch: number;
      function: number;
      statement: number;
    };
    defectDensity: number;
    flakyTestCount: number;
    securityVulnerabilities: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    qualityGateStatus: 'passing' | 'failing' | 'warning';
  };
  metadata: {
    timestamp: number;
    fleetId: string;
    timeRange: {
      start: number;
      end: number;
    };
  };
}

// GET /api/v1/metrics/performance
// Returns performance metrics

interface PerformanceMetricsResponse {
  data: {
    avgTaskDuration: number;
    p50TaskDuration: number;
    p95TaskDuration: number;
    p99TaskDuration: number;
    throughput: number; // tasks per minute
    activeAgents: number;
    queueDepth: number;
    systemUtilization: {
      cpu: number;
      memory: number;
    };
  };
  metadata: {
    timestamp: number;
    granularity: 'minute' | 'hour' | 'day';
  };
}

// GET /api/v1/metrics/cost
// Returns cost and token usage metrics

interface CostMetricsResponse {
  data: {
    totalCost: number;
    costByModel: Record<string, number>;
    totalTokens: number;
    tokensByModel: Record<string, number>;
    estimatedMonthlyCost: number;
    savingsFromRouting: number;
  };
  metadata: {
    timestamp: number;
    currency: string;
  };
}

// GET /api/v1/metrics/timeseries
// Returns time series data for charting

interface TimeSeriesRequest {
  metricNames: string[];
  timeRange: {
    start: number; // Unix timestamp
    end: number;
  };
  granularity: 'minute' | 'hour' | 'day';
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'p95';
}

interface TimeSeriesResponse {
  data: Record<string, Array<{
    timestamp: number;
    value: number;
    attributes?: Record<string, any>;
  }>>;
  metadata: {
    totalPoints: number;
    granularity: string;
  };
}
```

#### 4.1.2 Agents Endpoints

```typescript
// GET /api/v1/agents
// Returns list of all agents

interface AgentsListRequest {
  fleetId?: string;
  status?: 'active' | 'idle' | 'error';
  limit?: number;
  offset?: number;
}

interface AgentsListResponse {
  data: Array<{
    id: string;
    type: string;
    name: string;
    status: 'active' | 'idle' | 'error';
    fleetId: string;
    createdAt: number;
    lastActiveAt: number;
    metrics: {
      taskCount: number;
      successRate: number;
      avgDuration: number;
    };
  }>;
  metadata: {
    total: number;
    limit: number;
    offset: number;
  };
}

// GET /api/v1/agents/:id
// Returns detailed agent information

interface AgentDetailResponse {
  data: {
    id: string;
    type: string;
    name: string;
    status: 'active' | 'idle' | 'error';
    fleetId: string;
    topology: string;
    createdAt: number;
    lastActiveAt: number;
    currentTask: {
      id: string;
      type: string;
      status: string;
      startedAt: number;
    } | null;
    metrics: {
      totalTasks: number;
      completedTasks: number;
      failedTasks: number;
      successRate: number;
      avgDuration: number;
      p95Duration: number;
      tokenUsage: {
        total: number;
        input: number;
        output: number;
      };
      cost: {
        total: number;
        perTask: number;
      };
    };
    health: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      uptime: number;
      errorRate: number;
      lastError: string | null;
    };
  };
  metadata: {
    timestamp: number;
  };
}

// GET /api/v1/agents/:id/tasks
// Returns task history for an agent

interface AgentTasksRequest {
  status?: 'pending' | 'running' | 'completed' | 'failed';
  limit?: number;
  offset?: number;
}

interface AgentTasksResponse {
  data: Array<{
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    priority: string;
    startedAt: number;
    completedAt: number | null;
    duration: number | null;
    result: any | null;
    error: string | null;
  }>;
  metadata: {
    total: number;
    limit: number;
    offset: number;
  };
}
```

#### 4.1.3 Tasks Endpoints

```typescript
// GET /api/v1/tasks
// Returns list of all tasks

interface TasksListRequest {
  agentId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeRange?: {
    start: number;
    end: number;
  };
  limit?: number;
  offset?: number;
}

interface TasksListResponse {
  data: Array<{
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    priority: string;
    agentId: string;
    agentName: string;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    duration: number | null;
  }>;
  metadata: {
    total: number;
    limit: number;
    offset: number;
  };
}

// GET /api/v1/tasks/:id
// Returns detailed task information

interface TaskDetailResponse {
  data: {
    id: string;
    type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    priority: string;
    agentId: string;
    agentName: string;
    parentTaskId: string | null;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    duration: number | null;
    input: any;
    output: any | null;
    error: {
      message: string;
      stack: string;
      code: string;
    } | null;
    metrics: {
      tokenUsage: number;
      cost: number;
      modelUsed: string;
    };
    trace: {
      traceId: string;
      spanId: string;
    };
  };
  metadata: {
    timestamp: number;
  };
}

// GET /api/v1/tasks/:id/trace
// Returns OpenTelemetry trace for a task

interface TaskTraceResponse {
  data: {
    traceId: string;
    spans: Array<{
      spanId: string;
      parentSpanId: string | null;
      name: string;
      startTime: number;
      endTime: number;
      duration: number;
      attributes: Record<string, any>;
      events: Array<{
        name: string;
        timestamp: number;
        attributes: Record<string, any>;
      }>;
      status: {
        code: number;
        message: string;
      };
    }>;
  };
  metadata: {
    timestamp: number;
  };
}
```

#### 4.1.4 Topology Endpoints

```typescript
// GET /api/v1/topology
// Returns fleet topology information

interface TopologyResponse {
  data: {
    fleetId: string;
    topology: 'hierarchical' | 'mesh' | 'star' | 'ring';
    createdAt: number;
    status: 'active' | 'scaling' | 'degraded';
    agents: {
      total: number;
      active: number;
      idle: number;
      error: number;
    };
    configuration: {
      maxAgents: number;
      strategy: 'balanced' | 'specialized' | 'adaptive';
    };
  };
  metadata: {
    timestamp: number;
  };
}

// GET /api/v1/topology/graph
// Returns graph representation for visualization

interface TopologyGraphResponse {
  data: {
    nodes: Array<{
      id: string;
      type: string;
      name: string;
      status: 'active' | 'idle' | 'error';
      position: { x: number; y: number };
      metrics: {
        taskCount: number;
        successRate: number;
      };
    }>;
    edges: Array<{
      source: string;
      target: string;
      type: 'coordination' | 'data-flow' | 'control-flow';
      weight: number;
      metadata: {
        latency: number;
        messageCount: number;
      };
    }>;
  };
  metadata: {
    layoutAlgorithm: string;
    timestamp: number;
  };
}

// GET /api/v1/topology/coordination
// Returns coordination patterns and communication metrics

interface CoordinationResponse {
  data: {
    patterns: Array<{
      name: string;
      frequency: number;
      avgDuration: number;
      participants: string[];
    }>;
    communication: {
      totalMessages: number;
      avgLatency: number;
      p95Latency: number;
      messagesByType: Record<string, number>;
    };
  };
  metadata: {
    timestamp: number;
  };
}
```

### 4.2 WebSocket Protocol (V5)

#### 4.2.1 Message Schema

```typescript
// WebSocket message types
type WSMessage =
  | SubscriptionMessage
  | UnsubscriptionMessage
  | DataUpdateMessage
  | HeartbeatMessage
  | ErrorMessage;

// Client → Server: Subscribe to updates
interface SubscriptionMessage {
  type: 'subscribe';
  channel: 'fleet' | 'agent' | 'metrics' | 'tasks';
  filters?: {
    fleetId?: string;
    agentId?: string;
    metricNames?: string[];
  };
  requestId: string;
}

// Client → Server: Unsubscribe
interface UnsubscriptionMessage {
  type: 'unsubscribe';
  channel: 'fleet' | 'agent' | 'metrics' | 'tasks';
  requestId: string;
}

// Server → Client: Data update
interface DataUpdateMessage {
  type: 'update';
  channel: 'fleet' | 'agent' | 'metrics' | 'tasks';
  data: AgentUpdate | MetricUpdate | TaskUpdate;
  timestamp: number;
}

// Server → Client: Heartbeat
interface HeartbeatMessage {
  type: 'ping';
  timestamp: number;
}

// Client → Server: Heartbeat response
interface HeartbeatResponseMessage {
  type: 'pong';
  timestamp: number;
}

// Server → Client: Error
interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  requestId?: string;
}

// Update payload types
interface AgentUpdate {
  agentId: string;
  status: 'active' | 'idle' | 'error';
  currentTask: {
    id: string;
    type: string;
    progress: number;
  } | null;
  metrics: {
    taskCount: number;
    successRate: number;
  };
}

interface MetricUpdate {
  metricName: string;
  value: number;
  attributes: Record<string, any>;
  timestamp: number;
}

interface TaskUpdate {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  agentId: string;
  timestamp: number;
}
```

#### 4.2.2 Connection Flow

```
Client                                Server
  |                                     |
  |--- WebSocket Handshake ----------->|
  |<-- 101 Switching Protocols --------|
  |                                     |
  |--- Subscribe to 'fleet' ----------->|
  |<-- Subscription Confirmed ----------|
  |                                     |
  |<-- Agent Update (real-time) -------|
  |<-- Metric Update (real-time) ------|
  |<-- Task Update (real-time) ---------|
  |                                     |
  |<-- Ping (heartbeat) ---------------|
  |--- Pong -------------------------->|
  |                                     |
  |--- Unsubscribe from 'fleet' ------>|
  |<-- Unsubscription Confirmed -------|
  |                                     |
  |--- Close Connection --------------->|
  |<-- Connection Closed --------------|
```

---

## 5. Frontend Architecture

### 5.1 Component Hierarchy

```
App
├─ Layout
│  ├─ Header
│  │  ├─ Logo
│  │  ├─ Navigation
│  │  └─ UserMenu
│  ├─ Sidebar
│  │  ├─ FleetSelector
│  │  └─ NavigationMenu
│  └─ Main Content
│     ├─ Dashboard (route: /)
│     │  ├─ MetricsOverview
│     │  │  ├─ QualityMetricsCard
│     │  │  ├─ PerformanceMetricsCard
│     │  │  └─ CostMetricsCard
│     │  ├─ TopologyMindMap
│     │  │  └─ CytoscapeGraph
│     │  └─ RecentActivity
│     │     └─ TaskTimeline
│     ├─ AgentView (route: /agents)
│     │  ├─ AgentList
│     │  │  └─ AgentCard (repeating)
│     │  └─ AgentDetail
│     │     ├─ AgentInfo
│     │     ├─ AgentMetrics
│     │     │  └─ MetricChart (Recharts)
│     │     └─ AgentTasks
│     │        └─ TaskTable
│     ├─ TaskView (route: /tasks)
│     │  ├─ TaskList
│     │  │  └─ TaskRow (repeating)
│     │  └─ TaskDetail
│     │     ├─ TaskInfo
│     │     ├─ TaskTrace
│     │     │  └─ TraceVisualization
│     │     └─ TaskMetrics
│     ├─ MetricsView (route: /metrics)
│     │  ├─ MetricSelector
│     │  ├─ TimeRangeSelector
│     │  └─ ChartContainer
│     │     ├─ LineChart (Recharts)
│     │     ├─ BarChart (Recharts)
│     │     └─ HeatMap (custom)
│     └─ AnalyticsView (route: /analytics)
│        ├─ AnalyticsFilters
│        ├─ TrendAnalysis
│        │  └─ TrendChart
│        └─ ComparativeAnalysis
│           └─ ComparisonTable
└─ Providers
   ├─ WebSocketProvider
   ├─ QueryClientProvider (React Query)
   └─ ThemeProvider
```

### 5.2 State Management Architecture

```typescript
// Global state managed by React Query
// src/visualization/frontend/state/queries.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// Agent queries
export function useAgents(filters?: AgentsListRequest) {
  return useQuery({
    queryKey: ['agents', filters],
    queryFn: () => api.agents.list(filters),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.agents.get(agentId),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

// Metrics queries
export function useQualityMetrics(timeRange?: TimeRange) {
  return useQuery({
    queryKey: ['metrics', 'quality', timeRange],
    queryFn: () => api.metrics.quality(timeRange),
    staleTime: 60 * 1000,
  });
}

export function useMetricsTimeSeries(request: TimeSeriesRequest) {
  return useQuery({
    queryKey: ['metrics', 'timeseries', request],
    queryFn: () => api.metrics.timeSeries(request),
    staleTime: 120 * 1000, // Historical data changes less frequently
  });
}

// Real-time updates via WebSocket
export function useRealtimeAgentUpdates(agentId?: string) {
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe } = useWebSocket();

  useEffect(() => {
    const handler = (update: AgentUpdate) => {
      // Invalidate React Query cache on real-time updates
      queryClient.setQueryData(
        ['agent', update.agentId],
        (old: any) => ({
          ...old,
          data: {
            ...old?.data,
            status: update.status,
            currentTask: update.currentTask,
            metrics: {
              ...old?.data?.metrics,
              ...update.metrics,
            },
          },
        })
      );
    };

    subscribe('agent', handler, { agentId });

    return () => unsubscribe('agent', handler);
  }, [agentId, subscribe, unsubscribe, queryClient]);
}

// Local UI state managed by React Context
// src/visualization/frontend/context/UIContext.tsx

interface UIState {
  selectedFleetId: string | null;
  selectedAgentId: string | null;
  timeRange: TimeRange;
  viewMode: 'grid' | 'list' | 'graph';
  filters: {
    status?: string[];
    type?: string[];
  };
}

const UIContext = createContext<{
  state: UIState;
  actions: {
    selectFleet: (fleetId: string) => void;
    selectAgent: (agentId: string) => void;
    setTimeRange: (range: TimeRange) => void;
    setViewMode: (mode: 'grid' | 'list' | 'graph') => void;
    setFilters: (filters: Partial<UIState['filters']>) => void;
  };
}>(null!);

export function UIProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UIState>({
    selectedFleetId: null,
    selectedAgentId: null,
    timeRange: { start: Date.now() - 3600000, end: Date.now() },
    viewMode: 'grid',
    filters: {},
  });

  const actions = useMemo(
    () => ({
      selectFleet: (fleetId: string) =>
        setState(s => ({ ...s, selectedFleetId: fleetId })),
      selectAgent: (agentId: string) =>
        setState(s => ({ ...s, selectedAgentId: agentId })),
      setTimeRange: (range: TimeRange) =>
        setState(s => ({ ...s, timeRange: range })),
      setViewMode: (mode: 'grid' | 'list' | 'graph') =>
        setState(s => ({ ...s, viewMode: mode })),
      setFilters: (filters: Partial<UIState['filters']>) =>
        setState(s => ({ ...s, filters: { ...s.filters, ...filters } })),
    }),
    []
  );

  return (
    <UIContext.Provider value={{ state, actions }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}
```

### 5.3 Key Components

#### 5.3.1 TopologyMindMap Component

```typescript
// src/visualization/frontend/components/TopologyMindMap.tsx

import cytoscape from 'cytoscape';
import { useEffect, useRef } from 'react';
import { useTopologyGraph } from '../state/queries';
import { useRealtimeAgentUpdates } from '../state/queries';

export function TopologyMindMap({ fleetId }: { fleetId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const { data: graphData, isLoading } = useTopologyGraph(fleetId);
  useRealtimeAgentUpdates(); // Subscribe to real-time updates

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: convertToC ytoscapeElements(graphData.data),
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (ele) => getNodeColor(ele.data('status')),
            'label': 'data(name)',
            'width': 60,
            'height': 60,
            'font-size': 12,
            'text-valign': 'center',
            'text-halign': 'center',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#ccc',
            'target-arrow-color': '#ccc',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#3b82f6',
          },
        },
      ],
      layout: {
        name: 'cose', // Force-directed layout
        idealEdgeLength: 100,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      },
    });

    // Event handlers
    cyRef.current.on('tap', 'node', (event) => {
      const agentId = event.target.data('id');
      onAgentSelect(agentId);
    });

    return () => {
      cyRef.current?.destroy();
    };
  }, [graphData]);

  // Update node states on real-time changes
  useEffect(() => {
    if (!cyRef.current || !graphData) return;

    const updateInterval = setInterval(() => {
      // React Query cache will have latest data from WebSocket updates
      // Update Cytoscape nodes to reflect current state
      cyRef.current?.nodes().forEach((node) => {
        const agentId = node.data('id');
        // Fetch latest status from React Query cache
        const cachedAgent = queryClient.getQueryData(['agent', agentId]);
        if (cachedAgent) {
          node.data('status', cachedAgent.data.status);
          node.style('background-color', getNodeColor(cachedAgent.data.status));
        }
      });
    }, 1000);

    return () => clearInterval(updateInterval);
  }, [graphData]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => cyRef.current?.fit()}
          className="px-3 py-1 bg-white rounded shadow"
        >
          Fit
        </button>
        <button
          onClick={() => cyRef.current?.reset()}
          className="px-3 py-1 bg-white rounded shadow"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function getNodeColor(status: string): string {
  switch (status) {
    case 'active': return '#10b981'; // green
    case 'idle': return '#6b7280'; // gray
    case 'error': return '#ef4444'; // red
    default: return '#3b82f6'; // blue
  }
}

function convertToCytoscapeElements(graphData: TopologyGraphResponse['data']) {
  const nodes = graphData.nodes.map(node => ({
    data: {
      id: node.id,
      name: node.name,
      type: node.type,
      status: node.status,
    },
    position: node.position,
  }));

  const edges = graphData.edges.map((edge, idx) => ({
    data: {
      id: `edge-${idx}`,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      weight: edge.weight,
    },
  }));

  return [...nodes, ...edges];
}
```

#### 5.3.2 MetricsChart Component

```typescript
// src/visualization/frontend/components/MetricsChart.tsx

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useMetricsTimeSeries } from '../state/queries';

export function MetricsChart({
  metricNames,
  timeRange,
  granularity,
}: {
  metricNames: string[];
  timeRange: TimeRange;
  granularity: 'minute' | 'hour' | 'day';
}) {
  const { data, isLoading } = useMetricsTimeSeries({
    metricNames,
    timeRange,
    granularity,
  });

  if (isLoading) {
    return <div>Loading chart...</div>;
  }

  // Transform data for Recharts
  const chartData = transformToChartFormat(data?.data || {});

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
        />
        <YAxis />
        <Tooltip
          labelFormatter={(ts) => new Date(ts).toLocaleString()}
        />
        <Legend />
        {metricNames.map((name, idx) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function transformToChartFormat(data: Record<string, TimeSeriesData[]>) {
  const timestamps = new Set<number>();

  // Collect all unique timestamps
  Object.values(data).forEach(series => {
    series.forEach(point => timestamps.add(point.timestamp));
  });

  // Create data points for each timestamp
  return Array.from(timestamps).sort().map(ts => {
    const point: any = { timestamp: ts };

    Object.entries(data).forEach(([metricName, series]) => {
      const dataPoint = series.find(p => p.timestamp === ts);
      point[metricName] = dataPoint?.value || null;
    });

    return point;
  });
}
```

---

## 6. Real-time Communication

### 6.1 WebSocket Server Implementation

```typescript
// src/visualization/server/WebSocketServer.ts

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';

export class VisualizationWebSocketServer extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Map<string, ClientConnection>;
  private rooms: Map<string, Set<string>>;
  private messageQueue: MessageQueue;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(options: {
    port: number;
    maxConnections: number;
    heartbeatIntervalMs: number;
  }) {
    super();

    this.clients = new Map();
    this.rooms = new Map();
    this.messageQueue = new MessageQueue({ maxSize: 10000 });

    this.wss = new WebSocket.Server({
      port: options.port,
      maxPayload: 1024 * 1024, // 1 MB max message size
    });

    this.wss.on('connection', this.handleConnection.bind(this));

    // Start heartbeat
    this.heartbeatInterval = setInterval(
      () => this.sendHeartbeats(),
      options.heartbeatIntervalMs
    );

    console.log(`WebSocket server listening on port ${options.port}`);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = this.generateClientId();

    const client: ClientConnection = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      lastHeartbeat: Date.now(),
      isAlive: true,
    };

    this.clients.set(clientId, client);

    ws.on('message', (data) => this.handleMessage(clientId, data));
    ws.on('pong', () => this.handlePong(clientId));
    ws.on('close', () => this.handleDisconnection(clientId));
    ws.on('error', (error) => this.handleError(clientId, error));

    console.log(`Client ${clientId} connected. Total clients: ${this.clients.size}`);
  }

  private handleMessage(clientId: string, data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientId, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(clientId, message);
          break;
        case 'pong':
          this.handlePong(clientId);
          break;
        default:
          this.sendError(clientId, 'UNKNOWN_MESSAGE_TYPE', 'Unknown message type');
      }
    } catch (error) {
      this.sendError(clientId, 'INVALID_MESSAGE', 'Failed to parse message');
    }
  }

  private handleSubscription(clientId: string, message: SubscriptionMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const roomKey = this.getRoomKey(message.channel, message.filters);

    // Add client to room
    if (!this.rooms.has(roomKey)) {
      this.rooms.set(roomKey, new Set());
    }
    this.rooms.get(roomKey)!.add(clientId);

    // Update client subscriptions
    client.subscriptions.add(roomKey);

    // Send confirmation
    this.sendToClient(clientId, {
      type: 'subscribed',
      channel: message.channel,
      requestId: message.requestId,
    });

    console.log(`Client ${clientId} subscribed to ${roomKey}`);
  }

  private handleUnsubscription(clientId: string, message: UnsubscriptionMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const roomKey = this.getRoomKey(message.channel);

    // Remove client from room
    this.rooms.get(roomKey)?.delete(clientId);

    // Update client subscriptions
    client.subscriptions.delete(roomKey);

    // Send confirmation
    this.sendToClient(clientId, {
      type: 'unsubscribed',
      channel: message.channel,
      requestId: message.requestId,
    });

    console.log(`Client ${clientId} unsubscribed from ${roomKey}`);
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.isAlive = true;
      client.lastHeartbeat = Date.now();
    }
  }

  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all rooms
    for (const roomKey of client.subscriptions) {
      this.rooms.get(roomKey)?.delete(clientId);
    }

    this.clients.delete(clientId);

    console.log(`Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
  }

  private handleError(clientId: string, error: Error): void {
    console.error(`WebSocket error for client ${clientId}:`, error);
  }

  private sendHeartbeats(): void {
    const now = Date.now();

    for (const [clientId, client] of this.clients.entries()) {
      if (client.isAlive === false) {
        // Client didn't respond to last ping - terminate
        console.log(`Terminating inactive client ${clientId}`);
        client.ws.terminate();
        this.clients.delete(clientId);
      } else {
        // Send ping
        client.isAlive = false;
        client.ws.ping();
      }
    }
  }

  /**
   * Broadcast update to all clients in a room
   */
  broadcast(channel: string, data: any, filters?: any): void {
    const roomKey = this.getRoomKey(channel, filters);
    const clientIds = this.rooms.get(roomKey);

    if (!clientIds || clientIds.size === 0) return;

    const message: DataUpdateMessage = {
      type: 'update',
      channel,
      data,
      timestamp: Date.now(),
    };

    // Queue message for delivery
    this.messageQueue.enqueue({
      recipients: Array.from(clientIds),
      message,
    });

    // Process queue
    this.processMessageQueue();
  }

  private processMessageQueue(): void {
    while (!this.messageQueue.isEmpty()) {
      const item = this.messageQueue.dequeue();
      if (!item) break;

      for (const clientId of item.recipients) {
        this.sendToClient(clientId, item.message);
      }
    }
  }

  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Failed to send message to client ${clientId}:`, error);
    }
  }

  private sendError(clientId: string, code: string, message: string): void {
    const errorMsg: ErrorMessage = {
      type: 'error',
      code,
      message,
    };
    this.sendToClient(clientId, errorMsg);
  }

  private getRoomKey(channel: string, filters?: any): string {
    if (!filters) return channel;

    const filterStr = Object.entries(filters)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('&');

    return `${channel}:${filterStr}`;
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  close(): void {
    clearInterval(this.heartbeatInterval);

    for (const client of this.clients.values()) {
      client.ws.close();
    }

    this.wss.close();
  }
}

interface ClientConnection {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastHeartbeat: number;
  isAlive: boolean;
}

class MessageQueue {
  private queue: Array<{ recipients: string[]; message: any }>;
  private maxSize: number;

  constructor(options: { maxSize: number }) {
    this.queue = [];
    this.maxSize = options.maxSize;
  }

  enqueue(item: { recipients: string[]; message: any }): void {
    if (this.queue.length >= this.maxSize) {
      // Drop oldest message
      this.queue.shift();
    }
    this.queue.push(item);
  }

  dequeue(): { recipients: string[]; message: any } | undefined {
    return this.queue.shift();
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
```

### 6.2 Event Stream Integration

```typescript
// src/visualization/server/EventStream.ts

import { EventEmitter } from 'events';
import { TelemetryCollector } from '../../telemetry/collector';
import { VisualizationWebSocketServer } from './WebSocketServer';
import { TelemetryToVisualizationConverter } from '../transformer/TelemetryToVisualizationConverter';

export class VisualizationEventStream {
  private telemetryCollector: TelemetryCollector;
  private wsServer: VisualizationWebSocketServer;
  private converter: TelemetryToVisualizationConverter;
  private eventBus: EventEmitter;

  constructor(
    telemetryCollector: TelemetryCollector,
    wsServer: VisualizationWebSocketServer
  ) {
    this.telemetryCollector = telemetryCollector;
    this.wsServer = wsServer;
    this.converter = new TelemetryToVisualizationConverter();
    this.eventBus = new EventEmitter();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen to OpenTelemetry span completions
    this.eventBus.on('span:end', (span) => {
      this.handleSpanEnd(span);
    });

    // Listen to metric recordings
    this.eventBus.on('metric:record', (metric) => {
      this.handleMetricRecord(metric);
    });

    // Listen to agent status changes
    this.eventBus.on('agent:status', (agentId, status) => {
      this.handleAgentStatusChange(agentId, status);
    });

    // Listen to task updates
    this.eventBus.on('task:update', (taskId, update) => {
      this.handleTaskUpdate(taskId, update);
    });
  }

  private handleSpanEnd(span: any): void {
    // Convert span to agent node update
    const agentNode = this.converter.convertTraceToAgentNode(span);

    // Broadcast to WebSocket clients
    this.wsServer.broadcast('agent', {
      agentId: agentNode.id,
      status: agentNode.status,
      currentTask: null, // Updated separately
      metrics: agentNode.metrics,
    }, { agentId: agentNode.id });
  }

  private handleMetricRecord(metric: any): void {
    // Convert metric to visualization format
    const metricUpdate = {
      metricName: metric.descriptor.name,
      value: metric.dataPoints[metric.dataPoints.length - 1].value,
      attributes: metric.dataPoints[metric.dataPoints.length - 1].attributes,
      timestamp: Date.now(),
    };

    // Broadcast to WebSocket clients
    this.wsServer.broadcast('metrics', metricUpdate);
  }

  private handleAgentStatusChange(agentId: string, status: string): void {
    this.wsServer.broadcast('agent', {
      agentId,
      status,
      currentTask: null,
      metrics: {},
    }, { agentId });
  }

  private handleTaskUpdate(taskId: string, update: any): void {
    this.wsServer.broadcast('tasks', {
      taskId,
      status: update.status,
      progress: update.progress || 0,
      agentId: update.agentId,
      timestamp: Date.now(),
    }, { taskId });
  }

  /**
   * Emit event from telemetry system
   */
  emit(event: string, ...args: any[]): void {
    this.eventBus.emit(event, ...args);
  }
}
```

---

## 7. Performance Requirements

### 7.1 Latency Requirements

| Operation | Target | Maximum |
|-----------|--------|---------|
| **Real-time WebSocket update** | <100ms | 200ms |
| **Graph rendering (100 nodes)** | <100ms | 300ms |
| **Graph rendering (1000 nodes)** | <500ms | 1000ms |
| **API response (cached)** | <50ms | 100ms |
| **API response (uncached)** | <200ms | 500ms |
| **Chart rendering (1000 points)** | <200ms | 500ms |
| **Initial page load** | <2s | 5s |
| **Time to interactive** | <3s | 7s |

### 7.2 Throughput Requirements

| Metric | Target | Maximum |
|--------|--------|---------|
| **WebSocket connections** | 1000 concurrent | 2000 concurrent |
| **WebSocket messages/sec** | 1000 msg/s | 5000 msg/s |
| **API requests/min** | 1000 req/min | 5000 req/min |
| **Graph updates/sec** | 10 updates/s | 50 updates/s |
| **Chart data points** | 10,000 points | 50,000 points |

### 7.3 Resource Constraints

| Resource | Limit | Rationale |
|----------|-------|-----------|
| **Backend memory** | 512 MB | Runs alongside AQE Fleet |
| **Cache size** | 500 MB | In-memory LRU cache |
| **Frontend bundle size** | <500 KB (gzipped) | Fast initial load |
| **Database query time** | <100ms | Responsive UI |
| **WebSocket message size** | 1 MB | Prevent DoS |

### 7.4 Optimization Strategies

#### 7.4.1 Backend Optimizations

1. **Query Optimization**
   - Index all frequently queried columns (agent_id, task_id, timestamp)
   - Use prepared statements to prevent SQL injection and improve performance
   - Implement query result caching (5-minute TTL for real-time, 1-hour for historical)
   - Parallel query execution for multi-metric requests

2. **Caching Strategy**
   - In-memory LRU cache (500 MB limit)
   - Cache invalidation on WebSocket updates
   - Cache warming on server startup (preload common queries)

3. **WebSocket Optimizations**
   - Message batching (combine multiple updates into one message)
   - Delta updates (send only changed fields, not entire objects)
   - Client-side throttling (max 10 updates/second per client)

4. **Data Transformer Optimizations**
   - Lazy transformation (transform on-demand, not all data upfront)
   - Stream processing for large datasets
   - Parallel transformation using worker threads

#### 7.4.2 Frontend Optimizations

1. **React Performance**
   - Virtualized lists for large datasets (react-window)
   - Memoization of expensive components (React.memo)
   - Lazy loading of routes (React.lazy + Suspense)
   - Code splitting by route

2. **Graph Rendering**
   - WebGL renderer for >1000 nodes
   - Level-of-detail rendering (simplify distant nodes)
   - Viewport culling (only render visible nodes)
   - Incremental layout updates (don't recalculate entire layout on every change)

3. **Chart Optimizations**
   - Data downsampling for large time series (e.g., 10,000 points → 500 points)
   - Canvas-based rendering for >5000 points
   - Debounced resize handlers
   - Lazy rendering (render charts only when visible)

4. **Network Optimizations**
   - HTTP/2 server push for critical resources
   - Resource preloading (<link rel="preload">)
   - Service worker for offline support
   - Brotli compression for static assets

---

## 8. Security & Access Control

### 8.1 Authentication

```typescript
// src/visualization/server/auth/AuthMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // Attach user info to request
    (req as any).user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: string[];
}
```

### 8.2 Authorization (RBAC)

```typescript
// src/visualization/server/auth/AuthorizationMiddleware.ts

import { Request, Response, NextFunction } from 'express';

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (user.role === 'admin' || user.permissions.includes(permission)) {
      next();
    } else {
      res.status(403).json({ error: 'Insufficient permissions' });
    }
  };
}

// Role-based permissions
export const PERMISSIONS = {
  VIEW_METRICS: 'metrics:view',
  VIEW_AGENTS: 'agents:view',
  VIEW_TASKS: 'tasks:view',
  VIEW_TOPOLOGY: 'topology:view',
  MANAGE_FLEET: 'fleet:manage',
  ADMIN: 'admin',
} as const;

// Usage in routes:
// router.get('/api/v1/metrics/quality', authMiddleware, requirePermission(PERMISSIONS.VIEW_METRICS), ...);
```

### 8.3 Data Sanitization

```typescript
// src/visualization/server/validation/Sanitizer.ts

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, removeAdditional: 'all' });
addFormats(ajv);

// Request validation schemas
const timeSeriesRequestSchema = {
  type: 'object',
  properties: {
    metricNames: {
      type: 'array',
      items: { type: 'string', pattern: '^aqe\\.' },
      minItems: 1,
      maxItems: 10,
    },
    timeRange: {
      type: 'object',
      properties: {
        start: { type: 'integer', minimum: 0 },
        end: { type: 'integer', minimum: 0 },
      },
      required: ['start', 'end'],
    },
    granularity: {
      type: 'string',
      enum: ['minute', 'hour', 'day'],
    },
  },
  required: ['metricNames', 'timeRange', 'granularity'],
};

export const validateTimeSeriesRequest = ajv.compile(timeSeriesRequestSchema);

// Middleware
export function validateRequest(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validate = ajv.compile(schema);
    const valid = validate(req.body);

    if (!valid) {
      res.status(400).json({
        error: 'Validation failed',
        details: validate.errors,
      });
      return;
    }

    next();
  };
}
```

### 8.4 Rate Limiting

```typescript
// src/visualization/server/middleware/RateLimiter.ts

import { Request, Response, NextFunction } from 'express';

export class RateLimiter {
  private requests: Map<string, number[]>;
  private windowMs: number;
  private maxRequests: number;

  constructor(options: {
    windowMs: number; // Time window in ms
    maxRequests: number; // Max requests per window
  }) {
    this.requests = new Map();
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.getClientKey(req);
      const now = Date.now();

      // Get request timestamps for this client
      const timestamps = this.requests.get(key) || [];

      // Remove timestamps outside the window
      const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

      if (validTimestamps.length >= this.maxRequests) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: this.windowMs / 1000,
        });
        return;
      }

      // Add current timestamp
      validTimestamps.push(now);
      this.requests.set(key, validTimestamps);

      next();
    };
  }

  private getClientKey(req: Request): string {
    // Use user ID if authenticated, otherwise IP address
    const user = (req as any).user;
    return user?.id || req.ip || 'unknown';
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }
}

// Usage:
// const rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 100 });
// app.use('/api', rateLimiter.middleware());
```

---

## 9. Deployment Architecture

### 9.1 Deployment Options

#### Option 1: Embedded Server (Recommended for MVP)

```
┌────────────────────────────────────────┐
│        AQE Fleet Process               │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐ │
│  │  AQE Fleet Core                  │ │
│  │  (Agents, Tasks, Learning)       │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │  Telemetry Layer                 │ │
│  │  (OpenTelemetry SDK)             │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │  Visualization Server            │ │
│  │  (Express + WebSocket)           │ │
│  │  Port: 3000                      │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │  Static File Server              │ │
│  │  (Frontend Build)                │ │
│  │  Port: 3000                      │ │
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

**Pros**:
- Single process, easy deployment
- No network latency between components
- Simple configuration

**Cons**:
- Resource contention (CPU, memory)
- No independent scaling

#### Option 2: Separate Processes

```
┌─────────────────┐       ┌──────────────────┐
│  AQE Fleet      │──────>│  Visualization   │
│  Process        │       │  Server          │
│  (Port: N/A)    │       │  (Port: 3000)    │
│                 │       │                  │
│  └─ Telemetry ──┼──────>│  └─ WebSocket    │
│     Exporter    │       │     Server       │
└─────────────────┘       └──────────────────┘
         │                         │
         v                         v
┌─────────────────────────────────────────┐
│           AgentDB (SQLite)              │
└─────────────────────────────────────────┘
```

**Pros**:
- Independent scaling
- Process isolation (better fault tolerance)
- Can run on different machines

**Cons**:
- More complex deployment
- Network latency between processes

### 9.2 Docker Deployment

```dockerfile
# Dockerfile for Visualization Server

FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Build frontend
WORKDIR /app/src/visualization/frontend
RUN npm ci && npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/visualization/frontend/dist ./public
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/visualization/server/index.js"]
```

```yaml
# docker-compose.yml

version: '3.8'

services:
  aqe-fleet:
    build:
      context: .
      dockerfile: Dockerfile.fleet
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OTLP_ENDPOINT=http://visualization:4318
    volumes:
      - ./data:/app/data
    depends_on:
      - visualization

  visualization:
    build:
      context: .
      dockerfile: Dockerfile.visualization
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/app/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - visualization
```

---

## 10. Monitoring & Observability

### 10.1 Visualization System Metrics

The visualization system should export its own telemetry:

```typescript
// src/visualization/telemetry/VisualizationTelemetry.ts

import { metrics, trace } from '@opentelemetry/api';

const meter = metrics.getMeter('aqe-visualization');
const tracer = trace.getTracer('aqe-visualization');

// Metrics
export const visualizationMetrics = {
  // WebSocket metrics
  activeConnections: meter.createUpDownCounter('viz.websocket.connections.active'),
  messagesReceived: meter.createCounter('viz.websocket.messages.received'),
  messagesSent: meter.createCounter('viz.websocket.messages.sent'),
  messageLatency: meter.createHistogram('viz.websocket.message.latency'),

  // API metrics
  apiRequests: meter.createCounter('viz.api.requests'),
  apiLatency: meter.createHistogram('viz.api.latency'),
  apiErrors: meter.createCounter('viz.api.errors'),

  // Cache metrics
  cacheHits: meter.createCounter('viz.cache.hits'),
  cacheMisses: meter.createCounter('viz.cache.misses'),
  cacheSize: meter.createUpDownCounter('viz.cache.size.bytes'),

  // Transformer metrics
  transformDuration: meter.createHistogram('viz.transform.duration'),
  transformedSpans: meter.createCounter('viz.transform.spans'),

  // Frontend metrics (sent via API)
  pageLoad: meter.createHistogram('viz.frontend.page.load'),
  graphRenderTime: meter.createHistogram('viz.frontend.graph.render'),
  chartRenderTime: meter.createHistogram('viz.frontend.chart.render'),
};

// Trace spans
export function recordAPIRequest(endpoint: string, handler: () => Promise<any>) {
  return tracer.startActiveSpan(`viz.api.${endpoint}`, async (span) => {
    const start = Date.now();
    try {
      const result = await handler();
      span.setStatus({ code: 1 }); // OK
      visualizationMetrics.apiRequests.add(1, { endpoint, status: 'success' });
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: error.message }); // ERROR
      visualizationMetrics.apiRequests.add(1, { endpoint, status: 'error' });
      visualizationMetrics.apiErrors.add(1, { endpoint, error: error.constructor.name });
      throw error;
    } finally {
      const duration = Date.now() - start;
      visualizationMetrics.apiLatency.record(duration, { endpoint });
      span.end();
    }
  });
}
```

### 10.2 Health Checks

```typescript
// src/visualization/server/health/HealthCheck.ts

export class HealthChecker {
  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkWebSocket(),
      this.checkMemory(),
      this.checkTelemetry(),
    ]);

    const status: HealthStatus = {
      status: checks.every(c => c.status === 'healthy') ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      checks: {
        database: checks[0],
        websocket: checks[1],
        memory: checks[2],
        telemetry: checks[3],
      },
    };

    return status;
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    try {
      const start = Date.now();
      // Execute simple query
      await database.query('SELECT 1');
      const latency = Date.now() - start;

      return {
        status: latency < 100 ? 'healthy' : 'degraded',
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  private async checkWebSocket(): Promise<ComponentHealth> {
    const activeConnections = wsServer.getActiveConnections();

    return {
      status: activeConnections < 1000 ? 'healthy' : 'degraded',
      metadata: {
        activeConnections,
        maxConnections: 2000,
      },
    };
  }

  private async checkMemory(): Promise<ComponentHealth> {
    const usage = process.memoryUsage();
    const maxHeap = 512 * 1024 * 1024; // 512 MB

    return {
      status: usage.heapUsed < maxHeap * 0.8 ? 'healthy' : 'degraded',
      metadata: {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        maxHeap,
      },
    };
  }

  private async checkTelemetry(): Promise<ComponentHealth> {
    // Check if telemetry is exporting successfully
    const lastExport = telemetryCollector.getLastExportTime();
    const timeSinceExport = Date.now() - lastExport;

    return {
      status: timeSinceExport < 60000 ? 'healthy' : 'degraded',
      metadata: {
        lastExport,
        timeSinceExport,
      },
    };
  }
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: Record<string, ComponentHealth>;
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
  metadata?: Record<string, any>;
}
```

---

## 11. Architecture Decision Records

### ADR-001: WebSocket Library Selection

**Status**: Accepted

**Context**:
We need a WebSocket library for real-time communication between backend and frontend.

**Options**:
1. `ws` (native WebSocket)
2. `Socket.IO`
3. `uWebSockets.js`

**Decision**: Use `ws`

**Rationale**:
- Pure WebSocket protocol (no custom transport)
- Minimal overhead (30KB vs. Socket.IO's 300KB)
- Sufficient performance (10,000+ concurrent connections)
- Modern browsers support WebSocket natively

**Consequences**:
- No automatic fallback to long-polling (acceptable for modern browsers)
- Must implement heartbeat mechanism manually

---

### ADR-002: Graph Visualization Library

**Status**: Accepted

**Context**:
We need a library to render interactive graph/network visualizations for agent topology.

**Options**:
1. Cytoscape.js
2. D3.js
3. vis.js

**Decision**: Use Cytoscape.js

**Rationale**:
- Purpose-built for graph visualization
- WebGL renderer for 10,000+ nodes
- 15+ built-in layout algorithms
- Active development and community

**Consequences**:
- Learning curve for team
- Less flexible than D3.js for custom visualizations

---

### ADR-003: State Management

**Status**: Accepted

**Context**:
We need to manage server state (API data) and UI state in the frontend.

**Options**:
1. Redux + RTK Query
2. React Query + React Context
3. Zustand

**Decision**: Use React Query for server state, React Context for UI state

**Rationale**:
- React Query excels at server state management (caching, refetching, etc.)
- React Context is built-in and sufficient for simple UI state
- No need for heavy Redux setup

**Consequences**:
- Two state management approaches (but for different concerns)
- Team must understand the distinction between server state and UI state

---

### ADR-004: Backend Deployment

**Status**: Accepted

**Context**:
We need to decide how to deploy the visualization server relative to the AQE Fleet.

**Options**:
1. Embedded in AQE Fleet process
2. Separate process (same machine)
3. Separate service (different machine)

**Decision**: Start with embedded, provide option for separate process

**Rationale**:
- MVP: Embedded is simpler (single process)
- Future: Separate process allows independent scaling
- Configuration flag to switch between modes

**Consequences**:
- Initial releases may have resource contention
- Must design for both deployment modes from the start

---

## 12. Next Steps

### Phase 3 Implementation Plan

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| **V4: Data Transformer** | Backend Team | 1 week | Phase 2 complete |
| **V5: WebSocket Server** | Backend Team | 1 week | V4 complete |
| **V6: REST API** | Backend Team | 1 week | V4 complete |
| **Frontend Setup** | Frontend Team | 3 days | - |
| **TopologyMindMap Component** | Frontend Team | 1 week | V6 complete |
| **Metrics Dashboard** | Frontend Team | 1 week | V6 complete |
| **Real-time Integration** | Full Stack | 1 week | V5, Frontend complete |
| **Performance Testing** | QA Team | 1 week | All components |
| **Security Audit** | Security Team | 3 days | All components |
| **Documentation** | Docs Team | 1 week | All components |

**Total Estimated Duration**: 6-8 weeks

### Success Criteria

- [ ] V4: Data transformer passes all unit tests
- [ ] V5: WebSocket server handles 1000 concurrent connections
- [ ] V6: REST API responds in <200ms (uncached)
- [ ] Frontend: Initial page load <2s
- [ ] Graph renders 100 nodes in <100ms
- [ ] Real-time updates arrive in <100ms
- [ ] Security: All endpoints protected with auth/authorization
- [ ] Performance: All metrics meet targets (Section 7)

---

## Appendix A: Type Definitions

```typescript
// src/visualization/types/index.ts

export interface AgentNode {
  id: string;
  type: string;
  name: string;
  status: 'active' | 'idle' | 'error';
  position: { x: number; y: number };
  metrics: {
    taskCount: number;
    successRate: number;
    avgDuration: number;
    tokenUsage: number;
    cost: number;
  };
  metadata: {
    fleetId: string;
    topology: string;
    startTime: number;
    endTime: number | null;
  };
}

export interface CoordinationEdge {
  source: string;
  target: string;
  type: 'coordination' | 'data-flow' | 'control-flow';
  weight: number;
  metadata: {
    latency: number;
    messageCount: number;
  };
}

export interface VisualizationGraph {
  nodes: AgentNode[];
  edges: CoordinationEdge[];
}

export interface QualityMetrics {
  testPassRate: number;
  coveragePercent: {
    line: number;
    branch: number;
    function: number;
    statement?: number;
  };
  defectDensity: number;
  flakyTestCount: number;
  securityVulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  qualityGateStatus: 'passing' | 'failing' | 'warning';
  timestamp: number;
}

export interface TimeSeriesData {
  timestamp: number;
  metricName: string;
  value: number;
  attributes?: Record<string, any>;
}

export interface TimeRange {
  start: number;
  end: number;
}
```

---

**Document End**

This architecture design provides a complete blueprint for implementing the Phase 3 visualization system. All technology choices, API contracts, and architectural patterns have been documented with clear rationales.
