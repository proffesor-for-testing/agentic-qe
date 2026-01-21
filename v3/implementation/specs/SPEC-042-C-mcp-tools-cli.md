# SPEC-042-C: MCP Tools and CLI

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-042-C |
| **Parent ADR** | [ADR-042](../adrs/ADR-042-v3-qe-token-tracking-integration.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Claude Code |

---

## Overview

Defines the MCP tool `token_usage` for analyzing token consumption patterns and the CLI commands for token usage reporting and optimization recommendations.

---

## Specification Details

### Section 1: MCP Tool Definition

```typescript
// v3/src/mcp/tools/analysis/token-usage.ts

export const tokenUsageTool = {
  name: 'token_usage',
  description: 'Analyze token consumption patterns and identify optimization opportunities',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['session', 'agent', 'domain', 'task'],
        description: 'Scope of analysis'
      },
      timeframe: {
        type: 'string',
        enum: ['1h', '24h', '7d', '30d'],
        description: 'Time period to analyze'
      },
      agentId: {
        type: 'string',
        description: 'Specific agent to analyze (optional)'
      },
      domain: {
        type: 'string',
        description: 'Specific domain to analyze (optional)'
      }
    },
    required: ['operation']
  },

  async execute(args: TokenUsageArgs): Promise<TokenUsageResult> {
    const collector = TokenMetricsCollector.getInstance();

    switch (args.operation) {
      case 'session':
        return collector.getSessionSummary(args.timeframe);
      case 'agent':
        return collector.getAgentMetrics(args.agentId, args.timeframe);
      case 'domain':
        return collector.getDomainMetrics(args.domain, args.timeframe);
      case 'task':
        return collector.getTaskMetrics(args.timeframe);
    }
  }
};
```

### Section 2: Example MCP Output

```json
{
  "summary": {
    "totalTokens": 45230,
    "totalCost": "$0.68",
    "tokensSaved": 12450,
    "savingsPercentage": 27.5
  },
  "breakdown": {
    "byAgent": {
      "qe-test-generator": { "tokens": 15200, "cost": "$0.23" },
      "qe-coverage-analyzer": { "tokens": 8900, "cost": "$0.13" }
    },
    "byDomain": {
      "test-generation": { "tokens": 18500 },
      "coverage-analysis": { "tokens": 12000 }
    }
  },
  "optimization": {
    "patternsReused": 34,
    "cacheHits": 89,
    "earlyExits": 12,
    "recommendations": [
      "High reuse potential for test-generation patterns (>0.85 similarity)",
      "Consider batching coverage-analysis requests"
    ]
  }
}
```

### Section 3: CLI Commands

```bash
# Check token usage for current session
aqe token-usage --period 24h

# Get breakdown by agent
aqe token-usage --by-agent

# Get breakdown by domain
aqe token-usage --by-domain

# Export detailed report
aqe token-usage --period 7d --export tokens.csv

# Show optimization recommendations
aqe token-usage --recommendations
```

---

## Architecture Diagram

```
+---------------------------------------------------------------------+
|                     V3 QE Token Tracking System                      |
+---------------------------------------------------------------------+
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |                    Token Metrics Collector                      |  |
|  |  - Per-task token tracking (input/output/total)                |  |
|  |  - Per-agent aggregation                                       |  |
|  |  - Per-domain breakdown                                        |  |
|  |  - Session-level summaries                                     |  |
|  +----------------------------------------------------------------+  |
|                              |                                       |
|         +--------------------+--------------------+                  |
|         v                    v                    v                  |
|  +--------------+    +--------------+    +--------------+            |
|  |   Pattern    |    |    Cache     |    |  Early Exit  |            |
|  |    Reuse     |    |   Manager    |    |  Optimizer   |            |
|  |              |    |              |    |              |            |
|  | - HNSW search|    | - File cache |    | - High conf  |            |
|  | - >0.85 sim  |    | - Query cache|    |   patterns   |            |
|  | - Skip regen |    | - 5min TTL   |    | - Skip LLM   |            |
|  +--------------+    +--------------+    +--------------+            |
|         |                    |                    |                  |
|         +--------------------+--------------------+                  |
|                              v                                       |
|  +----------------------------------------------------------------+  |
|  |                      Token Reduction Layer                      |  |
|  |  - Pattern-based shortcuts (avoid re-computation)              |  |
|  |  - Batch similar operations (fewer API calls)                  |  |
|  |  - Context compression (focused prompts)                       |  |
|  |  - Response caching (avoid duplicate requests)                 |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
+---------------------------------------------------------------------+
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-042-C-001 | operation parameter is required | Error |
| SPEC-042-C-002 | timeframe must be valid enum value | Error |
| SPEC-042-C-003 | agentId required when operation is 'agent' | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-042-A | Token Tracking Schema | Data structures returned |
| SPEC-042-B | Reduction Strategies | Optimization metrics |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-042-v3-qe-token-tracking-integration.md)
- [OpenTelemetry for Node.js](https://opentelemetry.io/docs/languages/js/) - Metrics infrastructure
