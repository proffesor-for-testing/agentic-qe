# Monitoring Module

Comprehensive monitoring and health tracking for LLM providers in the Agentic QE Fleet.

## Components

### ProviderHealthMonitor

Health monitoring and circuit breaker implementation for LLM providers.

**Features:**
- ✅ Automatic periodic health checks
- ✅ Circuit breaker pattern (closed → open → half-open → closed)
- ✅ Error rate and availability tracking
- ✅ Event-driven architecture for health and circuit state changes
- ✅ Concurrent health check support with timeout protection
- ✅ Manual circuit control (force open, reset)
- ✅ Configurable thresholds and intervals

**Usage:**

```typescript
import { ProviderHealthMonitor } from './monitoring/ProviderHealthMonitor';

// Create monitor with custom config
const monitor = new ProviderHealthMonitor({
  checkIntervalMs: 30000,       // Check every 30 seconds
  timeoutMs: 5000,              // 5 second timeout
  failureThreshold: 3,          // Open circuit after 3 failures
  recoveryTimeMs: 60000,        // Wait 60s before retry
  healthyLatencyThresholdMs: 3000 // Max healthy latency
});

// Register provider
monitor.registerProvider('ollama', async () => {
  return await ollamaProvider.healthCheck();
});

// Listen to events
monitor.on('health-change', (data) => {
  console.log(`Provider ${data.providerId} health: ${data.healthy}`);
});

monitor.on('circuit-change', (data) => {
  console.log(`Circuit state: ${data.circuitState}`);
});

// Start monitoring
monitor.startMonitoring();

// Query health state
const isHealthy = monitor.isProviderHealthy('ollama');
const healthyProviders = monitor.getHealthyProviders();
const state = monitor.getProviderHealth('ollama');
```

**Circuit Breaker States:**

1. **Closed** (Normal): All requests pass through
2. **Open** (Failing): Requests fail fast without calling provider
3. **Half-Open** (Testing): Allow one request to test recovery

**State Transitions:**

```
Closed ─[failures ≥ threshold]→ Open
Open ─[recovery time elapsed]→ Half-Open
Half-Open ─[success]→ Closed
Half-Open ─[failure]→ Open
```

**Tracked Metrics:**

- **Latency**: Response time in milliseconds
- **Error Rate**: Ratio of failed checks (0-1 scale)
- **Availability**: Ratio of successful checks (0-1 scale)
- **Consecutive Failures**: Count of failures since last success
- **Circuit State**: Current circuit breaker state

**Events:**

- `health-change`: Emitted when provider health status changes
- `circuit-change`: Emitted when circuit breaker state transitions

## Examples

See `/workspaces/agentic-qe-cf/examples/monitoring/provider-health-monitor-example.ts` for complete usage example.

## Tests

Run tests with:

```bash
npm test -- tests/monitoring/ProviderHealthMonitor.test.ts
```

**Test Coverage:**
- ✅ Provider registration and unregistration
- ✅ Health check execution (success, failure, timeout)
- ✅ Circuit breaker state transitions
- ✅ Error rate and availability calculation
- ✅ Event emission
- ✅ Automatic monitoring lifecycle
- ✅ Concurrent operations
- ✅ Edge cases and error handling

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  ProviderHealthMonitor                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Provider   │    │   Provider   │    │   Provider   │  │
│  │  Registry    │    │    Health    │    │   Circuit    │  │
│  │              │    │   Tracking   │    │   Breaker    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Periodic Health Check Timer                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Event Emitter (EventEmitter)             │  │
│  │    - health-change events                             │  │
│  │    - circuit-change events                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
  │   Ollama    │      │   Claude    │      │    Groq     │
  │  Provider   │      │  Provider   │      │  Provider   │
  └─────────────┘      └─────────────┘      └─────────────┘
```

## Design Principles

1. **Fail Fast**: Open circuits prevent cascading failures
2. **Observable**: Events enable real-time monitoring
3. **Configurable**: Tunable thresholds for different scenarios
4. **Resilient**: Automatic recovery detection
5. **Concurrent**: Thread-safe multi-provider monitoring

## Future Enhancements

- [ ] Persistent health history with time-series database
- [ ] Adaptive threshold adjustment based on historical data
- [ ] Integration with alerting systems (PagerDuty, Slack, etc.)
- [ ] Health score calculation with weighted metrics
- [ ] Distributed health monitoring across multiple nodes
