# Performance Testing

## Core Principle

**Performance is a feature, not an afterthought.**

Test performance like you test functionality: continuously, automatically, and with clear acceptance criteria.

## Why Performance Testing Matters

### User Impact
- 100ms delay = 1% drop in conversions (Amazon)
- 53% of mobile users abandon sites taking > 3 seconds (Google)
- Slow = Broken (in users' eyes)

### Business Impact
- Lost revenue from abandoned transactions
- Increased infrastructure costs
- Degraded user experience
- Reputation damage

### Technical Impact
- Scalability limits
- Infrastructure bottlenecks
- Hidden architectural problems

## Types of Performance Testing

### 1. Load Testing

**What**: System behavior under expected load

**Goal**: Verify the system handles typical usage

**Example**: 
- E-commerce site handling 1,000 concurrent users
- API serving 10,000 requests/minute
- Database processing 500 transactions/second

**When**: Before every major release

**Tools**: k6, JMeter, Gatling, Artillery

### 2. Stress Testing

**What**: System behavior under extreme load (beyond capacity)

**Goal**: Find breaking point, see how system fails

**Example**:
- Ramping up from 1,000 to 10,000 concurrent users
- Pushing API until response time degrades
- Filling database until queries slow

**When**: Before scaling infrastructure, quarterly at minimum

**What to look for**: Graceful degradation, not catastrophic failure

### 3. Spike Testing

**What**: System behavior under sudden load increase

**Goal**: Test auto-scaling, handling unexpected traffic

**Example**:
- Black Friday sale announcement
- Viral social media post
- Marketing campaign launch

**When**: Before major events, after infrastructure changes

**Pattern**: Instant ramp from normal to 5-10x load

### 4. Endurance/Soak Testing

**What**: System behavior over extended time

**Goal**: Find memory leaks, resource exhaustion, gradual degradation

**Example**:
- Run at normal load for 24-72 hours
- Monitor memory, connections, file handles
- Check for resource leaks

**When**: After significant code changes, quarterly

**What to look for**: Stable resource usage over time

### 5. Scalability Testing

**What**: How system performs as load increases

**Goal**: Validate horizontal/vertical scaling

**Example**:
- Add servers, measure throughput improvement
- Test auto-scaling triggers
- Find scaling limits

**When**: Before capacity planning, infrastructure changes

## Performance Testing Strategy

### Start with Requirements

**Bad**: "The system should be fast"
**Good**: "95th percentile response time < 200ms under 1,000 concurrent users"

**Define SLOs (Service Level Objectives)**:
- **Response Time**: 95th percentile < 200ms
- **Throughput**: 10,000 requests/minute minimum
- **Error Rate**: < 0.1% under load
- **Resource Usage**: CPU < 70%, Memory < 80%

### Identify Critical Paths

Don't test everything equally. Focus on:
- Revenue-generating flows (checkout, payment)
- High-traffic pages (homepage, product pages)
- Critical APIs (authentication, data access)
- Resource-intensive operations (search, reports)

### Realistic Scenarios

**Bad**: Every user hits homepage repeatedly
**Good**: 
- 40% browse products
- 30% search
- 20% view product details
- 10% checkout

Include:
- Think time (users don't click instantly)
- Varied data (different products, users, queries)
- Realistic workflows (browse → search → add to cart → checkout)

## Setting Up Performance Tests

### Test Environment

**Ideal**: Production-like infrastructure
- Same server specs
- Same database size
- Same network topology
- Same third-party integrations (or mocks)

**Reality**: Often scaled-down version
- Document differences
- Extrapolate results carefully
- Validate with production monitoring

### Test Data

**Requirements**:
- Realistic volume (don't test with 100 users when you have 10M)
- Varied data (avoid cache hits skewing results)
- Production-like distribution (80/20 rule applies)

**Example**:
```
Products: 100,000 (matching production)
Users: 50,000 test accounts
Orders: 1M historical orders
Search queries: Real query distribution
```

### Monitoring During Tests

**Essential metrics**:
- Response time (avg, 50th, 95th, 99th percentile)
- Throughput (requests/second)
- Error rate
- CPU, memory, disk I/O
- Database query time
- Network latency

**Tools**:
- Application: New Relic, Datadog, Dynatrace
- Infrastructure: Prometheus, Grafana
- Database: Query analyzers, slow query logs

## Common Performance Bottlenecks

### 1. Database

**Symptoms**:
- Slow queries under load
- Connection pool exhaustion
- Lock contention

**Solutions**:
- Add indexes on filtered columns
- Optimize N+1 queries
- Increase connection pool size
- Add read replicas
- Implement caching

### 2. N+1 Queries

**Problem**:
```javascript
// Load 100 orders
const orders = await Order.findAll();

// For each order, load customer (100 queries!)
for (const order of orders) {
  const customer = await Customer.findById(order.customerId);
}
```

**Fix**:
```javascript
// Load orders with customers in one query
const orders = await Order.findAll({
  include: [Customer]
});
```

### 3. Synchronous Processing

**Problem**: Blocking operations in request path

**Example**: Sending email during checkout

**Fix**: 
- Use message queues (RabbitMQ, SQS)
- Process asynchronously
- Return response immediately

### 4. Memory Leaks

**Symptoms**:
- Memory usage grows over time
- Performance degrades gradually
- Eventually crashes

**Detection**:
- Endurance testing
- Memory profiling (heap dumps)
- Monitor garbage collection

**Common causes**:
- Event listeners not cleaned up
- Caches without eviction
- Circular references
- Global state accumulation

### 5. Inadequate Caching

**Problem**: Recalculating same results repeatedly

**Strategy**:
- Cache expensive operations
- Use CDN for static assets
- Implement application-level caching (Redis)
- Browser caching (Cache-Control headers)

**Balance**: Cache hit rate vs. memory usage

### 6. External Dependencies

**Problem**: Third-party APIs slow or unavailable

**Solutions**:
- Set aggressive timeouts
- Implement circuit breakers
- Cache responses when possible
- Degrade gracefully if unavailable

## Performance Testing in CI/CD

### Continuous Performance Testing

**Approach 1: Smoke Tests**
- Run small load test on every commit
- 10 concurrent users for 1 minute
- Catch major regressions quickly

**Approach 2: Nightly Tests**
- Full load test overnight
- More comprehensive scenarios
- Trend analysis over time

**Approach 3: Pre-Production Gate**
- Load test before production deploy
- Automated pass/fail criteria
- Block deployment if performance degrades

### Example: k6 in CI/CD

```javascript
// performance-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up
    { duration: '3m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% of requests < 200ms
    http_req_failed: ['rate<0.01'],    // < 1% failures
  },
};

export default function () {
  const res = http.get('https://api.example.com/products');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  sleep(1);
}
```

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on:
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Run k6 test
        uses: grafana/k6-action@v0.3.0
        with:
          filename: performance-test.js
          
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: k6-results
          path: results.json
```

## Analyzing Performance Test Results

### Key Metrics

**Response Time Distribution**:
- **Average**: Misleading (outliers skew it)
- **Median (50th percentile)**: Typical user experience
- **95th percentile**: "Slow but acceptable"
- **99th percentile**: Worst user experience

**Throughput**:
- Requests/second sustained
- How it changes with load
- Where it plateaus (capacity)

**Error Rate**:
- Should stay flat as load increases
- Spike indicates breaking point

### Interpreting Results

**Good**:
```
Load: 1,000 users
Response time p95: 180ms
Throughput: 5,000 req/s
Error rate: 0.05%
CPU: 65%, Memory: 70%
```

**Problems**:
```
Load: 1,000 users
Response time p95: 3,500ms ❌ (too slow)
Throughput: 500 req/s ❌ (way below target)
Error rate: 5% ❌ (too many errors)
CPU: 95%, Memory: 90% ❌ (maxed out)
```

### Root Cause Analysis

1. **Correlate metrics**: When response time spikes, what else changes?
2. **Check logs**: Errors, warnings, slow queries
3. **Profile code**: Where is time spent?
4. **Monitor resources**: CPU, memory, network, disk
5. **Trace requests**: End-to-end request flow

## Production Performance Monitoring

### Synthetic Monitoring

**What**: Automated tests hitting production

**Example**:
- Every 5 minutes, test critical flows
- Measure response time from multiple locations
- Alert if degradation detected

**Tools**: Pingdom, Datadog Synthetics, New Relic Synthetics

### Real User Monitoring (RUM)

**What**: Measure actual user experience

**Metrics**:
- Page load time
- Time to interactive
- API response times
- Error rates

**Tools**: Google Analytics, New Relic Browser, Datadog RUM

### Alerting

**Set alerts on**:
- p95 response time > threshold
- Error rate > 1%
- Throughput drops suddenly
- Queue depth growing

**Don't alert on**:
- Average response time (too noisy)
- Single slow request (outliers happen)

## Performance Testing Anti-Patterns

### ❌ Testing Too Late

**Problem**: Find performance issues in production

**Fix**: Test early and often, catch issues before release

### ❌ Unrealistic Scenarios

**Problem**: Test doesn't match real usage

**Example**: All users hitting same endpoint simultaneously

**Fix**: Model realistic user journeys, think time, data distribution

### ❌ Ignoring Ramp-Up

**Problem**: 0 to 1,000 users instantly

**Real world**: Traffic grows gradually (usually)

**Fix**: Ramp up over time, see how system adapts

### ❌ Testing Without Monitoring

**Problem**: Can't see what's happening during test

**Fix**: Monitor everything during tests

### ❌ No Baseline

**Problem**: Don't know if results are good or bad

**Fix**: Establish baseline, track trends over time

### ❌ One-Time Testing

**Problem**: Test once before launch, never again

**Fix**: Continuous performance testing, trend monitoring

## Tools Overview

### Load Testing Tools

**k6**: Modern, developer-friendly, JavaScript-based
- Good for: CI/CD integration, API testing
- Learning curve: Low

**JMeter**: Mature, feature-rich, GUI-based
- Good for: Complex scenarios, extensive protocols
- Learning curve: Medium

**Gatling**: Scala-based, great reporting
- Good for: High load, detailed metrics
- Learning curve: Medium

**Artillery**: Node.js, simple YAML configs
- Good for: Quick tests, simple scenarios
- Learning curve: Very low

**Locust**: Python-based, distributed testing
- Good for: Custom user behavior, Python ecosystems
- Learning curve: Low-Medium

### APM (Application Performance Monitoring)

- **New Relic**: Comprehensive, expensive
- **Datadog**: Infrastructure + APM combined
- **Dynatrace**: AI-powered root cause analysis
- **AppDynamics**: Enterprise-focused

### Database Profiling

- **pg_stat_statements** (PostgreSQL)
- **MySQL slow query log**
- **MongoDB profiler**
- **Redis SLOWLOG**

## Real-World Example

### Scenario: E-Commerce Checkout Slow

**Problem**: Checkout taking 5+ seconds under load

**Investigation**:
1. Load test: Reproduce issue
2. Monitor: Database CPU at 95%
3. Profile: Slow query on order creation
4. Root cause: Missing index on `orders.user_id`

**Fix**:
```sql
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

**Result**:
- Checkout time: 5s → 300ms
- Database CPU: 95% → 40%
- Throughput: 5x improvement

## When NOT to Performance Test

- **MVPs/Prototypes**: Focus on validating idea first
- **Internal tools**: With < 10 users, performance rarely matters
- **One-time scripts**: Not worth the effort
- **Before optimization**: Profile first, optimize second, then test

## Checklist: Before Going to Production

- [ ] Load test passed (expected traffic)
- [ ] Stress test passed (2-3x expected traffic)
- [ ] Spike test passed (sudden traffic surge)
- [ ] Endurance test passed (24+ hours)
- [ ] Database indexes in place
- [ ] Caching configured
- [ ] Monitoring and alerting set up
- [ ] Auto-scaling configured (if applicable)
- [ ] Performance baseline established

## Remember

**Performance is a feature**: Test it like functionality
**Test continuously**: Not just before launch
**Monitor production**: Synthetic + real user monitoring
**Set realistic goals**: Based on business requirements
**Fix what matters**: Focus on user-impacting bottlenecks
**Trend over time**: Performance degrades gradually, catch it early

## Resources

- **k6 Documentation**: k6.io/docs
- **Google Web Fundamentals**: Performance optimization guides
- **"Release It!"** by Michael Nygard: Production-ready patterns
- **High Performance Browser Networking** by Ilya Grigorik

Performance testing isn't optional—it's how you ensure your system works when it matters most.
