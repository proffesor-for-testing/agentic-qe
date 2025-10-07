# Chaos Engineering MCP Tools

Enterprise-grade chaos engineering tools for testing system resilience through real fault injection.

## Overview

The Agentic QE Chaos Engineering suite provides three powerful MCP tools for injecting faults and testing system resilience:

1. **`mcp__agentic_qe__chaos_inject_latency`** - Network latency injection
2. **`mcp__agentic_qe__chaos_inject_failure`** - Failure injection (errors, timeouts, connection issues)
3. **`mcp__agentic_qe__chaos_resilience_test`** - Comprehensive resilience testing

## Features

### Real Fault Injection (No Mocks)
- **Network interceptors** for latency and failure injection
- **Multiple distribution types** for realistic scenarios
- **Blast radius control** for safe testing
- **Auto-rollback mechanisms** for safety

### Blast Radius Control
- **Percentage-based targeting** (0-100%)
- **Service-level granularity**
- **Progressive increase** for gradual testing
- **Emergency rollback** for safety

### Multiple Failure Types
- HTTP errors (4xx, 5xx)
- Timeouts
- Connection refused
- DNS failures
- Partial responses
- Combined scenarios

## Tool 1: Chaos Inject Latency

Injects network latency into service calls with configurable distributions.

### Configuration

```typescript
interface ChaosLatencyConfig {
  target: string;                    // Target service URL
  latencyMs: number;                 // Latency in milliseconds
  distribution: LatencyDistribution; // 'fixed', 'uniform', 'normal', 'exponential'
  distributionParams?: {
    min?: number;
    max?: number;
    mean?: number;
    stdDev?: number;
  };
  blastRadius: {
    percentage: number;              // 0-100
    targetServices: string[];
    progressive?: boolean;
    maxPercentage?: number;
    incrementStep?: number;
  };
  duration?: number;                 // Duration in ms (auto-rollback)
  rollback?: boolean;                // Manual rollback flag
  injectionId?: string;              // For rollback
}
```

### Example Usage

```javascript
// Fixed latency
const result = await mcp__agentic_qe__chaos_inject_latency({
  target: 'http://api.example.com',
  latencyMs: 500,
  distribution: 'fixed',
  blastRadius: {
    percentage: 50,
    targetServices: ['user-service', 'auth-service']
  },
  duration: 60000  // 1 minute, auto-rollback
});

// Normal distribution (realistic)
const result = await mcp__agentic_qe__chaos_inject_latency({
  target: 'http://api.example.com',
  latencyMs: 1000,
  distribution: 'normal',
  distributionParams: {
    mean: 1000,
    stdDev: 200
  },
  blastRadius: {
    percentage: 100,
    targetServices: ['payment-service']
  }
});

// Manual rollback
await mcp__agentic_qe__chaos_inject_latency({
  target: 'http://api.example.com',
  rollback: true,
  injectionId: result.injectionId,
  blastRadius: { percentage: 0, targetServices: [] }
});
```

## Tool 2: Chaos Inject Failure

Injects various failure types into service calls.

### Configuration

```typescript
interface ChaosFailureConfig {
  target: string;
  failureType: FailureType;  // 'http_error', 'timeout', 'connection_refused', 'dns_failure', 'partial_response', 'combined'
  httpErrorCode?: number;    // For http_error type
  timeoutMs?: number;        // For timeout type
  failureRate?: number;      // 0-1 (1 = 100%)
  failureTypes?: FailureType[];  // For combined type
  blastRadius: BlastRadius;
  duration?: number;
  rollback?: boolean;
  injectionId?: string;
}
```

### Example Usage

```javascript
// HTTP 500 errors
const result = await mcp__agentic_qe__chaos_inject_failure({
  target: 'http://api.example.com',
  failureType: 'http_error',
  httpErrorCode: 500,
  failureRate: 0.5,  // 50% of requests fail
  blastRadius: {
    percentage: 75,
    targetServices: ['order-service']
  }
});

// Timeout failures
await mcp__agentic_qe__chaos_inject_failure({
  target: 'http://api.example.com',
  failureType: 'timeout',
  timeoutMs: 5000,
  blastRadius: {
    percentage: 100,
    targetServices: ['slow-service']
  }
});

// Connection refused
await mcp__agentic_qe__chaos_inject_failure({
  target: 'http://api.example.com',
  failureType: 'connection_refused',
  blastRadius: {
    percentage: 50,
    targetServices: ['external-api']
  }
});

// Combined failures (random selection)
await mcp__agentic_qe__chaos_inject_failure({
  target: 'http://api.example.com',
  failureType: 'combined',
  failureTypes: ['http_error', 'timeout', 'connection_refused'],
  blastRadius: {
    percentage: 100,
    targetServices: ['unstable-service']
  }
});
```

## Tool 3: Chaos Resilience Test

Comprehensive resilience testing with multiple scenarios and automated analysis.

### Configuration

```typescript
interface ChaosResilienceConfig {
  target: string;
  scenarios?: ChaosScenario[];
  template?: string;  // Predefined template name
  blastRadius: BlastRadius;
  duration?: number;
  resilience?: {
    circuitBreaker?: boolean;
    retryPolicy?: {
      maxRetries: number;
      backoffMs: number;
      exponential?: boolean;
    };
    timeout?: {
      requestTimeoutMs: number;
      overallTimeoutMs: number;
    };
    fallback?: boolean;
  };
  monitoring?: {
    enabled: boolean;
    metricsEndpoint?: string;
  };
  autoRollback?: boolean;
}
```

### Predefined Templates

1. **network-partition**: Tests network partition scenarios
2. **high-latency**: Tests high latency conditions
3. **cascading-failure**: Tests cascading failure scenarios

### Example Usage

```javascript
// Using predefined template
const report = await mcp__agentic_qe__chaos_resilience_test({
  target: 'http://api.example.com',
  template: 'network-partition',
  blastRadius: {
    percentage: 50,
    targetServices: ['critical-service']
  },
  resilience: {
    circuitBreaker: true,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 100,
      exponential: true
    }
  }
});

// Custom scenarios
const report = await mcp__agentic_qe__chaos_resilience_test({
  target: 'http://api.example.com',
  scenarios: [
    {
      type: 'latency',
      config: { latencyMs: 2000, distribution: 'normal' },
      weight: 0.5
    },
    {
      type: 'failure',
      config: { failureType: 'http_error', httpErrorCode: 503 },
      weight: 0.5
    }
  ],
  blastRadius: {
    percentage: 100,
    progressive: true,
    maxPercentage: 100,
    incrementStep: 10,
    targetServices: ['api-gateway']
  },
  duration: 30000,  // 30 seconds
  autoRollback: true
});

// Analyze results
console.log('Overall Score:', report.overallScore);
console.log('Availability:', report.metrics?.availabilityScore);
console.log('Error Rate:', report.metrics?.errorRate);
console.log('Recommendations:', report.recommendations);
```

### Report Structure

```typescript
interface ChaosResilienceReport {
  success: boolean;
  overallScore: number;  // 0-100
  scenarios: ScenarioResult[];
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
    p99ResponseTimeMs: number;
    availabilityScore: number;  // 0-1
    errorRate: number;          // 0-1
  };
  resilience: {
    circuitBreakerTriggered?: boolean;
    retriesAttempted?: number;
    fallbackUsed?: boolean;
    gracefulDegradation?: boolean;
  };
  recommendations: ResilienceRecommendation[];
}
```

## Safety Features

### Blast Radius Control
- Start with small percentages (10-25%)
- Use progressive increase for gradual testing
- Target specific services to limit impact
- Always define target services explicitly

### Auto-Rollback
- Set duration for automatic rollback
- Manual rollback always available
- Expired injections auto-cleaned every 60 seconds
- Emergency stop mechanisms

### Monitoring Integration
- Real-time metrics collection
- Performance tracking
- Error rate monitoring
- Recovery time measurement

## Best Practices

### 1. Start Small
```javascript
// Good: Start with 10% blast radius
blastRadius: {
  percentage: 10,
  targetServices: ['non-critical-service']
}

// Bad: Start with 100%
blastRadius: {
  percentage: 100,
  targetServices: ['critical-payment-service']
}
```

### 2. Use Progressive Testing
```javascript
blastRadius: {
  percentage: 10,
  progressive: true,
  maxPercentage: 100,
  incrementStep: 10,
  targetServices: ['test-service']
}
```

### 3. Always Set Duration
```javascript
// Good: Auto-rollback after 5 minutes
duration: 300000

// Bad: No duration (manual rollback required)
duration: undefined
```

### 4. Test Resilience Mechanisms
```javascript
resilience: {
  circuitBreaker: true,
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 100,
    exponential: true
  }
}
```

### 5. Monitor and Analyze
```javascript
// Always check recommendations
if (report.recommendations.length > 0) {
  console.log('Improvements needed:', report.recommendations);
}

// Track key metrics
if (report.metrics.availabilityScore < 0.99) {
  console.warn('Availability below 99%');
}
```

## Real-World Scenarios

### E-Commerce Checkout
```javascript
await mcp__agentic_qe__chaos_resilience_test({
  target: 'http://checkout.example.com',
  scenarios: [
    { type: 'latency', config: { latencyMs: 3000, distribution: 'normal' } },
    { type: 'failure', config: { failureType: 'timeout', timeoutMs: 5000 } }
  ],
  blastRadius: {
    percentage: 25,
    targetServices: ['payment-gateway', 'inventory-service']
  },
  resilience: {
    circuitBreaker: true,
    retryPolicy: { maxRetries: 3, backoffMs: 200 }
  }
});
```

### Microservices Communication
```javascript
await mcp__agentic_qe__chaos_inject_failure({
  target: 'http://service-mesh.example.com',
  failureType: 'combined',
  failureTypes: ['http_error', 'timeout', 'connection_refused'],
  failureRate: 0.1,  // 10% failure rate
  blastRadius: {
    percentage: 50,
    targetServices: ['user-service', 'auth-service', 'profile-service']
  }
});
```

### Database Connection Pool
```javascript
await mcp__agentic_qe__chaos_inject_latency({
  target: 'http://database-proxy.example.com',
  latencyMs: 2000,
  distribution: 'exponential',
  blastRadius: {
    percentage: 75,
    targetServices: ['postgres-pool']
  },
  duration: 60000
});
```

## Implementation Details

### Latency Injection Mechanism
- **Network proxy interceptors** modify fetch() calls
- **Distribution algorithms** generate realistic latency patterns
- **Delay injection** uses Promise-based setTimeout
- **Service matching** via URL pattern recognition

### Failure Injection Mechanism
- **HTTP error responses** with custom status codes
- **Timeout simulation** via delayed Promise rejection
- **Connection failures** with ECONNREFUSED errors
- **DNS failures** with ENOTFOUND errors
- **Partial responses** with truncated data

### Resilience Testing Mechanism
- **Health check polling** every 1 second
- **Retry logic** with exponential backoff
- **Circuit breaker detection** after 3+ failures
- **Metrics aggregation** with percentile calculations
- **Recommendation engine** based on test results

## Troubleshooting

### Issue: Injection not taking effect
**Solution**: Check that target URL matches service endpoints exactly.

### Issue: Too much impact
**Solution**: Reduce blast radius percentage or use progressive increase.

### Issue: Can't rollback
**Solution**: Use the injection ID from the original result.

### Issue: Tests timing out
**Solution**: Increase test duration or reduce the number of scenarios.

## Integration with AQE Fleet

```javascript
// Initialize QE fleet
await mcp__agentic_qe__fleet_init({
  topology: 'hierarchical',
  maxAgents: 10
});

// Spawn chaos engineer agent
await mcp__agentic_qe__agent_spawn({
  type: 'chaos-engineer',
  capabilities: ['fault-injection', 'resilience-testing']
});

// Run chaos test
await mcp__agentic_qe__chaos_resilience_test({
  target: 'http://api.example.com',
  template: 'cascading-failure',
  blastRadius: {
    percentage: 50,
    targetServices: ['critical-service']
  }
});
```

## Performance Characteristics

- **Latency injection overhead**: <5ms per request
- **Failure injection overhead**: <2ms per request
- **Resilience test throughput**: 100+ requests/second
- **Memory usage**: O(n) where n = active injections
- **Cleanup interval**: 60 seconds

## License

MIT - Part of the Agentic QE Fleet

## Support

- Issues: https://github.com/proffesor-for-testing/agentic-qe-cf/issues
- Documentation: /workspaces/agentic-qe-cf/docs/
- Tests: /workspaces/agentic-qe-cf/tests/mcp/handlers/ChaosTools.test.ts
