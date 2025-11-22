# PromQL Query Examples for AQE Dashboards

This document contains example PromQL queries used in the Grafana dashboards. Use these for testing, debugging, or creating new panels.

---

## Executive Dashboard Queries

### 1. Test Success Rate
```promql
# Calculate percentage of passed tests over total tests
100 * (
  sum(rate(aqe_test_executions_total{status="passed"}[5m])) /
  sum(rate(aqe_test_executions_total[5m]))
)
```

### 2. Quality Gate Pass Rate
```promql
# Calculate quality gate pass percentage
100 * (1 - (
  sum(rate(aqe_quality_gate_failures_total[5m])) /
  sum(rate(aqe_quality_gate_checks_total[5m]))
))
```

### 3. Code Coverage Percentage
```promql
# Average line coverage across all services
avg(aqe_code_coverage_percentage{type="line"})

# Coverage by type
avg by(type) (aqe_code_coverage_percentage)
```

### 4. Token Consumption
```promql
# Total tokens consumed in time range
sum(increase(aqe_tokens_consumed_total[24h]))

# Tokens by agent type
sum by(agent_type) (increase(aqe_tokens_consumed_total[24h]))
```

### 5. API Costs
```promql
# Total API costs in USD
sum(increase(aqe_api_cost_dollars_total[24h]))

# Costs by service
sum by(service_name) (increase(aqe_api_cost_dollars_total[24h]))
```

### 6. Critical Issues
```promql
# Open issues grouped by severity
sum by(severity) (aqe_quality_issues_total{status="open"})

# Top 10 critical issues
topk(10, aqe_quality_issues_total{severity="critical"})
```

### 7. Agent Fleet Utilization
```promql
# Success rate by agent type
100 * (
  sum by(agent_type) (aqe_agent_execution_time_seconds_count{status="success"}) /
  sum by(agent_type) (aqe_agent_execution_time_seconds_count)
)
```

---

## Developer Dashboard Queries

### 1. Agent Execution Time
```promql
# Average execution time by agent and span
sum by(agent_type, span_name) (rate(aqe_agent_execution_time_seconds_sum[5m])) /
sum by(agent_type, span_name) (rate(aqe_agent_execution_time_seconds_count[5m]))

# p95 execution time
histogram_quantile(0.95,
  sum by(le, agent_type) (rate(aqe_agent_execution_time_seconds_bucket[5m]))
)
```

### 2. API Response Time Heatmap
```promql
# Response time distribution by endpoint
sum by(le, endpoint) (rate(aqe_http_request_duration_seconds_bucket[5m]))
```

### 3. Error Rate by Service
```promql
# Error rate percentage
sum by(service_name, error_type) (rate(aqe_errors_total[5m])) /
sum by(service_name) (rate(aqe_requests_total[5m]))

# Error count
sum by(service_name) (rate(aqe_errors_total[5m]))
```

### 4. Top Error Endpoints
```promql
# Top 10 endpoints with highest error rate
topk(10,
  sum by(endpoint) (rate(aqe_errors_total[5m])) /
  sum by(endpoint) (rate(aqe_requests_total[5m]))
)
```

### 5. Request Rate
```promql
# Requests per second by service
sum by(service_name) (rate(aqe_requests_total[5m]))

# Total RPS
sum(rate(aqe_requests_total[5m]))
```

---

## QA Leader Dashboard Queries

### 1. Test Coverage Metrics
```promql
# All coverage types
avg by(type) (aqe_code_coverage_percentage{environment=~"${environment}"})

# Line coverage only
avg(aqe_code_coverage_percentage{type="line", environment=~"${environment}"})

# Coverage by test suite
avg by(test_suite) (aqe_code_coverage_percentage{type="line"})
```

### 2. Flaky Test Rate
```promql
# Percentage of flaky tests
sum(aqe_flaky_tests_total{environment=~"${environment}"}) /
sum(aqe_test_executions_total{environment=~"${environment}"})

# Flaky tests by suite
sum by(test_suite) (aqe_flaky_tests_total)
```

### 3. Test Execution Trends
```promql
# Test executions by status
sum by(status) (increase(aqe_test_executions_total[7d]))

# With filters
sum by(status) (increase(
  aqe_test_executions_total{
    environment=~"${environment}",
    test_suite=~"${test_suite}"
  }[7d]
))
```

### 4. Top Flaky Tests
```promql
# Top 20 most flaky tests
topk(20, aqe_flaky_tests_total{environment=~"${environment}"})

# Flaky tests above threshold
aqe_flaky_tests_total > 5
```

### 5. Performance Test Results
```promql
# p95 performance test duration
histogram_quantile(0.95,
  sum by(le, test_type) (rate(aqe_performance_test_duration_seconds_bucket[5m]))
)

# p50 (median) duration
histogram_quantile(0.50,
  sum by(le, test_type) (rate(aqe_performance_test_duration_seconds_bucket[5m]))
)

# Max duration
max by(test_type) (aqe_performance_test_duration_seconds)
```

### 6. Quality Gate Results
```promql
# Pass/fail by gate name
sum by(gate_name, status) (increase(aqe_quality_gate_checks_total[7d]))

# Overall pass rate
100 * (
  sum(increase(aqe_quality_gate_checks_total{status="passed"}[7d])) /
  sum(increase(aqe_quality_gate_checks_total[7d]))
)
```

### 7. Test Duration
```promql
# Average test duration
avg(aqe_test_execution_duration_seconds)

# Duration by suite
avg by(test_suite) (aqe_test_execution_duration_seconds)
```

---

## Advanced Queries

### Time Series Analysis
```promql
# Rate of change over 5 minutes
rate(aqe_test_executions_total[5m])

# Increase over time range
increase(aqe_test_executions_total[$__range])

# Delta (simple difference)
delta(aqe_code_coverage_percentage[1h])
```

### Aggregations
```promql
# Sum across all labels
sum(aqe_test_executions_total)

# Sum grouped by label
sum by(status) (aqe_test_executions_total)

# Average
avg(aqe_code_coverage_percentage)

# Min/Max
min(aqe_test_execution_duration_seconds)
max(aqe_test_execution_duration_seconds)

# Count
count(aqe_test_executions_total)
```

### Percentiles
```promql
# 95th percentile
histogram_quantile(0.95, rate(aqe_test_execution_duration_seconds_bucket[5m]))

# 50th percentile (median)
histogram_quantile(0.50, rate(aqe_test_execution_duration_seconds_bucket[5m]))

# 99th percentile
histogram_quantile(0.99, rate(aqe_test_execution_duration_seconds_bucket[5m]))
```

### Filtering
```promql
# Equals
aqe_test_executions_total{status="passed"}

# Not equals
aqe_test_executions_total{status!="passed"}

# Regex match
aqe_test_executions_total{environment=~"prod.*"}

# Regex not match
aqe_test_executions_total{environment!~"dev.*"}

# Multiple conditions
aqe_test_executions_total{status="passed", environment="production"}
```

### Top N / Bottom N
```promql
# Top 10
topk(10, aqe_test_execution_duration_seconds)

# Bottom 5
bottomk(5, aqe_code_coverage_percentage)

# Top 10 by rate
topk(10, rate(aqe_errors_total[5m]))
```

### Boolean Operations
```promql
# Greater than
aqe_code_coverage_percentage > 80

# Less than
aqe_flaky_tests_total < 5

# Between (using 'and')
aqe_code_coverage_percentage > 70 and aqe_code_coverage_percentage < 90
```

### Mathematical Operations
```promql
# Percentage
100 * (aqe_test_executions_total{status="passed"} / aqe_test_executions_total)

# Addition
aqe_test_executions_total{status="passed"} + aqe_test_executions_total{status="failed"}

# Subtraction
aqe_test_executions_total - aqe_test_executions_total{status="skipped"}
```

---

## Testing Queries

### Quick Tests in Prometheus UI

1. **Navigate to** http://prometheus:9090/graph
2. **Enter query** in the expression box
3. **Click "Execute"** to run
4. **Switch to "Graph"** tab for time series visualization

### Example Test Queries

```promql
# Check if metric exists
aqe_test_executions_total

# Get current value
aqe_test_executions_total{status="passed"}[1m]

# Check label values
count by(status) (aqe_test_executions_total)

# Validate rate calculation
rate(aqe_test_executions_total[5m])
```

---

## Common Variables

Used in dashboard queries for dynamic filtering:

- `$__rate_interval` - Auto-calculated rate interval
- `$__range` - Dashboard time range
- `${environment}` - Environment variable
- `${service}` - Service name variable
- `${test_suite}` - Test suite variable
- `${agent_type}` - Agent type variable

### Variable Example
```promql
# Using environment variable
aqe_test_executions_total{environment=~"${environment}"}

# With multi-select support (regex or)
aqe_test_executions_total{environment=~"${environment:regex}"}
```

---

## Recording Rules

For expensive queries that run frequently, create recording rules:

```yaml
# prometheus.yml or separate rules file
groups:
  - name: aqe_recording_rules
    interval: 30s
    rules:
      # Pre-calculate test success rate
      - record: aqe:test_success_rate:5m
        expr: |
          100 * (
            sum(rate(aqe_test_executions_total{status="passed"}[5m])) /
            sum(rate(aqe_test_executions_total[5m]))
          )

      # Pre-calculate coverage average
      - record: aqe:code_coverage:avg
        expr: avg(aqe_code_coverage_percentage{type="line"})

      # Pre-calculate agent utilization
      - record: aqe:agent_utilization:5m
        expr: |
          100 * (
            sum by(agent_type) (aqe_agent_execution_time_seconds_count{status="success"}) /
            sum by(agent_type) (aqe_agent_execution_time_seconds_count)
          )
```

Then use in dashboards:
```promql
# Instead of complex query, use recording rule
aqe:test_success_rate:5m
```

---

## Alerting Rules

Example alerts based on dashboard metrics:

```yaml
groups:
  - name: aqe_alerts
    interval: 30s
    rules:
      # Alert on low test success rate
      - alert: LowTestSuccessRate
        expr: aqe:test_success_rate:5m < 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Test success rate below 80%"

      # Alert on high flaky test rate
      - alert: HighFlakyTestRate
        expr: |
          sum(aqe_flaky_tests_total) /
          sum(aqe_test_executions_total) > 0.1
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Flaky test rate above 10%"

      # Alert on low coverage
      - alert: LowCodeCoverage
        expr: avg(aqe_code_coverage_percentage{type="line"}) < 70
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Code coverage below 70%"
```

---

## Troubleshooting

### Query Returns No Data
1. Check metric exists: `aqe_test_executions_total`
2. Verify labels: `aqe_test_executions_total{status="passed"}`
3. Check time range includes data
4. Validate scrape targets are up

### Query Too Slow
1. Use recording rules for complex calculations
2. Reduce time range
3. Add more specific label filters
4. Use `rate()` instead of `increase()` where possible

### Incorrect Values
1. Verify `rate()` time window: `[5m]` vs `[1m]`
2. Check aggregation: `sum()` vs `avg()`
3. Validate label grouping: `by(label1, label2)`
4. Ensure metric type matches query (counter vs gauge)

---

## Resources

- **Prometheus Documentation**: https://prometheus.io/docs/prometheus/latest/querying/basics/
- **PromQL Tutorial**: https://prometheus.io/docs/prometheus/latest/querying/examples/
- **Grafana Variables**: https://grafana.com/docs/grafana/latest/variables/
- **Dashboard JSON**: https://grafana.com/docs/grafana/latest/dashboards/json-model/

---

**Last Updated**: 2025-11-21
**Version**: 1.0.0
**AQE Phase**: Phase 3 - Observability
