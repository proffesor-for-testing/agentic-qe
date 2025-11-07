---
name: shift-right-testing
description: Testing in production with feature flags, canary deployments, synthetic monitoring, and chaos engineering. Use when validating real-world behavior, implementing safe deployments, or ensuring production resilience.
version: 1.0.0
category: testing-methodologies
tags: [shift-right, testing-in-production, feature-flags, canary-deployment, synthetic-monitoring, chaos-engineering, production-testing]
difficulty: advanced
estimated_time: 75 minutes
author: agentic-qe
---

# Shift-Right Testing

## Core Principle

**Production is different. Test where it matters most.**

Shift-right testing moves testing activities into production environments to validate real-world behavior, user experience, and system resilience under actual conditions.

## What is Shift-Right Testing?

**Shift-Right:** Moving testing activities later (right on timeline) into production environments.

**Why Test in Production?**

Pre-production testing can't replicate:
- Real user traffic patterns
- Actual data volumes and variety
- Production dependencies and integrations
- Real network conditions and latency
- Unpredictable load and edge cases
- Geographic distribution
- Third-party service behavior

**Shift-Right solves this by:**
- Validating deployments safely
- Detecting regressions immediately
- Monitoring real user experience
- Testing with production data (safely)
- Validating system resilience

**Timeline:**
```
Requirements → Design → Code → Deploy → Monitor
                                   ↓       ↓
                                 Test    Test (production)
```

---

## Shift-Right Techniques

### 1. Feature Flags (Progressive Rollout)

**Concept:** Deploy code to production but control who sees it.

```javascript
import { FeatureFlags } from './feature-flags';

// New feature behind flag
if (FeatureFlags.isEnabled('new-checkout-flow', user)) {
  return <NewCheckout />;  // New code (for selected users)
} else {
  return <OldCheckout />;  // Existing code (fallback)
}
```

**Rollout Strategy:**
```
1% → Monitor metrics for 1 hour
     ↓ (if healthy)
10% → A/B test performance vs old version
     ↓ (if successful)
50% → Validate at scale, monitor errors
     ↓ (if stable)
100% → Full rollout complete
```

**Benefits:**
- Test in production safely
- Instant rollback (disable flag)
- A/B testing built-in
- Gradual risk exposure
- Dark launches (test without users seeing)

**Implementation with LaunchDarkly:**
```javascript
import * as ld from 'launchdarkly-node-server-sdk';

const client = ld.init(process.env.LD_SDK_KEY);

// Check if feature enabled for user
const showNewFeature = await client.variation(
  'new-checkout-flow',
  { key: user.id, email: user.email },
  false  // default value
);

if (showNewFeature) {
  // New code path
} else {
  // Old code path
}
```

**Targeting Rules:**
```yaml
feature: new-checkout-flow
variations:
  - on: true
  - off: false
targeting:
  - rule: Internal employees
    serve: on
    match: email ends with "@company.com"

  - rule: Beta testers
    serve: on
    match: user in segment "beta-users"

  - rule: Percentage rollout
    serve: on
    match: 10% of users (by user ID hash)

  default: off
```

---

### 2. Canary Deployments

**Concept:** Deploy new version to small percentage of infrastructure, monitor, then gradually increase.

**Manual Canary with Kubernetes:**
```bash
# Deploy new version to 5% of pods
kubectl set image deployment/api api=v2.0 --record

# Monitor for 10 minutes
./monitor-metrics.sh --deployment=api --duration=10m \
  --metrics="error_rate,latency_p95,cpu_usage"

# If healthy, scale up gradually
kubectl scale deployment/api-v2 --replicas=20   # 10%
./monitor-metrics.sh --duration=10m

kubectl scale deployment/api-v2 --replicas=100  # 50%
./monitor-metrics.sh --duration=10m

kubectl scale deployment/api-v2 --replicas=200  # 100%
kubectl scale deployment/api-v1 --replicas=0    # Remove old
```

**Automated Canary with Flagger:**
```yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: api-canary
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api

  # Canary analysis configuration
  analysis:
    interval: 1m           # Check every minute
    threshold: 10          # Fail after 10 failed checks
    maxWeight: 50          # Max 50% canary traffic
    stepWeight: 10         # Increase by 10% each step

    # Success metrics (must pass)
    metrics:
      - name: request-success-rate
        thresholdRange:
          min: 99          # 99%+ success rate required

      - name: request-duration-p95
        thresholdRange:
          max: 500         # p95 latency < 500ms

      - name: error-rate
        thresholdRange:
          max: 1           # < 1% errors

  # Webhook notifications
  webhooks:
    - name: slack-notification
      url: https://hooks.slack.com/services/YOUR/WEBHOOK
      type: post-rollout
```

**Automated Process:**
1. Deploy v2 to 10% of traffic
2. Monitor success rate, latency, errors
3. If metrics healthy → increase to 20%
4. Continue until 100% or failure detected
5. On failure → automatic rollback to v1

**Benefits:**
- Real production validation
- Gradual risk mitigation
- Automatic rollback on failures
- Minimal blast radius (5-10% impact)

---

### 3. Synthetic Monitoring (Active Testing)

**Concept:** Continuously run automated tests against production to detect issues before users do.

**Playwright Synthetic Monitor:**
```javascript
// synthetic-monitor.js
import { chromium } from 'playwright';

async function runCheckoutFlowMonitor() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const start = Date.now();

  try {
    // Critical user journey: Add to cart → Checkout
    await page.goto('https://example.com');
    await page.click('[data-test=add-to-cart]');
    await page.click('[data-test=checkout]');
    await page.fill('[data-test=email]', 'synthetic@monitor.test');
    await page.fill('[data-test=card]', '4242424242424242'); // Test mode

    // Don't actually complete purchase (test mode stops here)

    const duration = Date.now() - start;

    // Report success metric
    await reportMetric('checkout-flow', {
      success: true,
      duration,
      timestamp: new Date()
    });

    console.log(`✅ Checkout flow healthy (${duration}ms)`);

  } catch (error) {
    // Alert on failure
    await reportMetric('checkout-flow', {
      success: false,
      error: error.message,
      timestamp: new Date()
    });

    await alertOncall({
      severity: 'critical',
      message: 'Checkout flow failed in production',
      error: error.message
    });

    console.error(`❌ Checkout flow failed: ${error.message}`);
  } finally {
    await browser.close();
  }
}

// Run every 5 minutes
setInterval(runCheckoutFlowMonitor, 5 * 60 * 1000);
```

**Datadog Synthetic Monitoring:**
```yaml
# synthetics.yaml
tests:
  - name: "API Health Check"
    type: api
    request:
      url: "https://api.example.com/health"
      method: GET
    assertions:
      - type: statusCode
        operator: is
        target: 200
      - type: responseTime
        operator: lessThan
        target: 500
    locations: ["us-east-1", "eu-west-1", "ap-southeast-1"]
    frequency: 300  # 5 minutes

  - name: "Checkout Flow E2E"
    type: browser
    steps:
      - type: navigateTo
        url: "https://example.com"
      - type: click
        selector: "[data-test=add-to-cart]"
      - type: click
        selector: "[data-test=checkout]"
    assertions:
      - type: element
        selector: "[data-test=checkout-success]"
        operator: isVisible
    frequency: 600  # 10 minutes
```

**Benefits:**
- Proactive issue detection
- User experience validation
- SLA monitoring
- Geographic validation (test from multiple regions)

---

### 4. Chaos Engineering (Resilience Testing)

**Concept:** Intentionally introduce failures in production to validate system resilience.

**Principles (Netflix Chaos Monkey):**
1. Define steady state (normal system behavior)
2. Hypothesize steady state continues during chaos
3. Introduce real-world failures
4. Try to disprove hypothesis
5. Minimize blast radius

**Example: Instance Failure Test**
```javascript
import { ChaosMonkey } from './chaos';

async function testInstanceResilience() {
  // 1. Baseline: Record normal behavior
  const baseline = await collectMetrics('api', '5m');
  console.log(`Baseline: ${baseline.successRate}% success, ${baseline.latencyP95}ms p95`);

  // 2. Hypothesis: System handles 1 instance failure gracefully
  console.log('Hypothesis: Killing 1 instance won\'t impact users');

  // 3. Introduce chaos (kill random instance)
  await ChaosMonkey.killRandomInstance({
    service: 'api',
    count: 1,  // Kill 1 instance
    duration: '5m'
  });

  // 4. Measure impact
  const chaosMetrics = await collectMetrics('api', '5m');
  console.log(`During chaos: ${chaosMetrics.successRate}% success, ${chaosMetrics.latencyP95}ms p95`);

  // 5. Verify hypothesis
  const successRateDrop = baseline.successRate - chaosMetrics.successRate;
  const latencyIncrease = chaosMetrics.latencyP95 - baseline.latencyP95;

  if (successRateDrop < 0.1 && latencyIncrease < 50) {
    console.log('✅ System is resilient to instance failures');
  } else {
    console.log('❌ System not resilient. Add redundancy!');
  }
}

// Run weekly during low traffic
schedule.weekly('Sunday 3am', testInstanceResilience);
```

**Common Chaos Experiments:**

**a) Instance Failures**
```javascript
// Kill random instances (10% of fleet)
await ChaosMonkey.killRandomInstance({
  service: 'api',
  percentage: 10,
  duration: '10m'
});
```

**b) Network Latency**
```javascript
// Inject 500ms latency to database calls
await ChaosMonkey.injectLatency({
  service: 'database',
  latency: '500ms',
  percentage: 20  // 20% of requests
});
```

**c) Dependency Failures**
```javascript
// Simulate payment gateway outage
await ChaosMonkey.blockService({
  service: 'payment-gateway',
  duration: '5m'
});

// Verify: Graceful degradation? Retry logic working?
```

**d) Resource Exhaustion**
```javascript
// Stress test: High CPU load
await ChaosMonkey.stressCPU({
  service: 'api',
  percentage: 80,  // 80% CPU usage
  duration: '10m'
});
```

**Chaos Testing Tools:**
- Chaos Monkey (Netflix) - Random instance termination
- Chaos Toolkit - Programmable chaos experiments
- Gremlin - Chaos engineering platform
- Litmus Chaos - Kubernetes chaos engineering

---

### 5. A/B Testing (Hypothesis Validation)

**Concept:** Test two versions in production to determine which performs better.

```javascript
import { ABTest } from './ab-testing';

// Define A/B test
const checkoutTest = ABTest.create({
  name: 'checkout-redesign',
  hypothesis: 'New checkout flow increases conversion by 10%',

  variants: {
    control: {
      weight: 50,  // 50% of traffic
      implementation: () => <OldCheckout />
    },
    treatment: {
      weight: 50,  // 50% of traffic
      implementation: () => <NewCheckout />
    }
  },

  metrics: {
    primary: 'conversion_rate',      // Primary success metric
    secondary: ['cart_abandonment', 'time_to_purchase']
  },

  sample_size: 10000,  // Users needed for statistical significance
  confidence: 0.95      // 95% confidence level
});

// Render based on variant
function CheckoutPage({ user }) {
  const variant = checkoutTest.getVariant(user.id);
  const Checkout = variant.implementation;

  // Track metrics
  useEffect(() => {
    checkoutTest.trackImpression(user.id, variant.name);
  }, []);

  return <Checkout onComplete={() => {
    checkoutTest.trackConversion(user.id, variant.name);
  }} />;
}

// Analyze results after sufficient data
async function analyzeTest() {
  const results = await checkoutTest.analyze();

  console.log(`Control conversion: ${results.control.conversionRate}%`);
  console.log(`Treatment conversion: ${results.treatment.conversionRate}%`);
  console.log(`Lift: ${results.lift}%`);
  console.log(`P-value: ${results.pValue}`);
  console.log(`Statistical significance: ${results.significant ? 'YES' : 'NO'}`);

  if (results.significant && results.lift > 0) {
    console.log('✅ Treatment wins! Rolling out to 100%');
    await rolloutToProduction('treatment');
  } else {
    console.log('❌ No significant improvement. Keeping control.');
  }
}
```

---

## Shift-Right Best Practices

### 1. Minimize Blast Radius

**Always limit exposure:**
- Feature flags: 1% → 10% → 50% → 100%
- Canary: 5% → 10% → 25% → 50% → 100%
- Geographic: 1 region → 2 regions → All regions

### 2. Automate Rollback

**Never rely on manual rollback:**
```javascript
// Automatic rollback on error rate spike
if (errorRate > 1% || latencyP95 > 500) {
  await rollback();
  await alert('Automatic rollback triggered');
}
```

### 3. Monitor Everything

**Key Metrics:**
- Success/error rates
- Latency (p50, p95, p99)
- CPU/memory usage
- User-facing metrics (conversion, engagement)

### 4. Test During Low Traffic

**Chaos engineering schedule:**
- Weekday mornings: Low traffic
- Sunday 3am: Minimal users
- Avoid holidays, sales events

### 5. Have a Kill Switch

**Emergency stop for everything:**
```javascript
// Global kill switch (stops all experiments)
if (FeatureFlags.isEnabled('global-kill-switch')) {
  return <SafeMode />;  // Fallback to known-good state
}
```

---

## Shift-Right Metrics

**1. Mean Time to Detect (MTTD)**
```
Time from issue occurrence to detection

Target: < 5 minutes (synthetic monitoring)
```

**2. Mean Time to Recover (MTTR)**
```
Time from detection to resolution

Target: < 15 minutes (with automatic rollback)
```

**3. Blast Radius**
```
Percentage of users impacted by failure

Target: < 10% (canary deployment)
```

**4. False Positive Rate**
```
Alerts that weren't real issues

Target: < 5%
```

---

## Related Skills

**Testing Methodologies:**
- [shift-left-testing](../shift-left-testing/) - Testing BEFORE production (complement)
- [chaos-engineering-resilience](../chaos-engineering-resilience/) - Detailed chaos testing
- [regression-testing](../regression-testing/)

**Infrastructure:**
- [test-environment-management](../test-environment-management/)
- [performance-testing](../performance-testing/)

**Monitoring:**
- [test-reporting-analytics](../test-reporting-analytics/)
- [production-intelligence](../production-intelligence/) (agent)

---

## Remember

**Production is the ultimate test environment.**

**Shift-Right complements Shift-Left:**
- **Shift-Left**: Catch bugs early (cheap)
- **Shift-Right**: Validate real-world behavior (accurate)

**Best Practices:**
1. Use feature flags for safe deployments
2. Canary deploy with automatic rollback
3. Synthetic monitoring for proactive detection
4. Chaos engineering for resilience
5. Always minimize blast radius
6. Monitor everything, alert intelligently

**With Agents:** `qe-production-intelligence` monitors production metrics and converts real usage patterns into tests. `qe-chaos-engineer` orchestrates safe chaos experiments with automatic rollback. Together, they enable comprehensive shift-right testing with minimal risk.
