# Phase 1 Migration Strategy

**Multi-Model Router + Streaming Integration**
**Version:** 1.0.5
**Date:** 2025-10-16

---

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Pre-Migration Preparation](#pre-migration-preparation)
3. [Migration Phases](#migration-phases)
4. [Configuration Migration](#configuration-migration)
5. [Code Migration](#code-migration)
6. [Data Migration](#data-migration)
7. [Testing Strategy](#testing-strategy)
8. [Rollback Procedures](#rollback-procedures)
9. [Success Criteria](#success-criteria)
10. [Communication Plan](#communication-plan)

---

## 1. Migration Overview

### 1.1 Migration Goals

1. **Zero Downtime**: System remains operational throughout migration
2. **Zero Breaking Changes**: Existing functionality preserved
3. **Gradual Rollout**: Features enabled incrementally
4. **Safe Rollback**: Ability to revert at any time
5. **Validation**: Extensive testing at each phase

### 1.2 Migration Timeline

| Phase | Duration | Description | Success Criteria |
|-------|----------|-------------|-----------------|
| **Preparation** | 1 week | Setup, testing, documentation | All tests pass, docs complete |
| **Alpha** | 2 weeks | Deploy with features disabled | Zero regressions |
| **Beta** | 2 weeks | Enable for dev/staging | Positive metrics |
| **Limited Release** | 1 week | Enable for 10% production | Cost savings verified |
| **Full Release** | 1 week | Enable for 100% production | All metrics green |
| **Post-Release** | Ongoing | Monitor, optimize, iterate | Sustained improvements |

**Total: 7 weeks from start to full rollout**

### 1.3 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Performance degradation | Low | High | Load testing, gradual rollout |
| Increased costs | Low | Medium | Budget limits, cost tracking |
| Integration issues | Medium | Medium | Feature flags, rollback plan |
| Memory issues | Low | Medium | Memory profiling, limits |
| Streaming failures | Medium | Low | Graceful fallback to sync |

---

## 2. Pre-Migration Preparation

### 2.1 Environment Setup

**Development Environment:**

```bash
# 1. Create feature branch
git checkout -b feature/phase1-routing-streaming

# 2. Install dependencies (no new deps required)
npm install

# 3. Set up test environment variables
cat > .env.test <<EOF
# Feature Flags (disabled for safety)
FEATURE_MULTI_MODEL_ROUTER=false
FEATURE_STREAMING=false

# Routing Configuration
ROUTING_ENABLED=false
ROUTING_DEFAULT_MODEL=claude-sonnet-4.5

# Model API Keys
ANTHROPIC_API_KEY=your-api-key-here

# Cost Tracking
COST_TRACKING_ENABLED=true
BUDGET_LIMIT_DAILY=10.00
BUDGET_LIMIT_MONTHLY=200.00

# Streaming Configuration
STREAMING_ENABLED=false
STREAMING_BUFFER_SIZE=1024
STREAMING_BACKPRESSURE_THRESHOLD=0.8
STREAMING_TIMEOUT_MS=30000
EOF

# 4. Create test configuration
cp config/fleet.example.yaml config/fleet.test.yaml
```

**Configuration Files:**

```yaml
# config/fleet.test.yaml
fleet:
  id: 'test-fleet'
  name: 'Test Fleet'

# IMPORTANT: Features disabled by default
features:
  multiModelRouter: false
  streaming: false

# Routing config (ready but disabled)
routing:
  enabled: false
  defaultModel: 'claude-sonnet-4.5'
  models:
    - name: 'claude-opus-4'
      provider: 'anthropic'
      model: 'claude-opus-4-20250514'
      capabilities:
        maxTokens: 200000
        supportsStreaming: true
        costPer1kTokens:
          input: 15.00
          output: 75.00
      complexityRange:
        min: 0.7
        max: 1.0
      enabled: true

    - name: 'claude-sonnet-4.5'
      provider: 'anthropic'
      model: 'claude-sonnet-4-5-20250929'
      capabilities:
        maxTokens: 200000
        supportsStreaming: true
        costPer1kTokens:
          input: 3.00
          output: 15.00
      complexityRange:
        min: 0.3
        max: 0.8
      enabled: true

    - name: 'claude-haiku-4'
      provider: 'anthropic'
      model: 'claude-haiku-4-20250110'
      capabilities:
        maxTokens: 200000
        supportsStreaming: true
        costPer1kTokens:
          input: 0.80
          output: 4.00
      complexityRange:
        min: 0.0
        max: 0.4
      enabled: true

  costTracking:
    enabled: true
    budgetLimits:
      daily: 10.00
      monthly: 200.00
    alertThresholds:
      dailyPercent: 80
      monthlyPercent: 90

# Streaming config (ready but disabled)
streaming:
  enabled: false
  bufferSize: 1024
  backpressureThreshold: 0.8
  timeoutMs: 30000
  retryConfig:
    maxRetries: 3
    backoffMs: 1000
    backoffMultiplier: 2
```

### 2.2 Backup and Documentation

**Create Backups:**

```bash
# 1. Backup current configuration
cp config/fleet.yaml config/fleet.yaml.backup.v1.0.4

# 2. Backup database (if using file-based)
cp data/fleet.db data/fleet.db.backup.v1.0.4

# 3. Create rollback tag
git tag -a v1.0.4-stable -m "Stable version before Phase 1 migration"
git push origin v1.0.4-stable
```

**Documentation Checklist:**

- [x] Architecture document created
- [x] Component diagrams created
- [x] Integration specifications written
- [x] Migration strategy documented (this document)
- [ ] API documentation updated
- [ ] User guide updated
- [ ] Troubleshooting guide created
- [ ] Runbook for operations team

### 2.3 Team Preparation

**Training Sessions:**

1. **Development Team** (2 hours)
   - Architecture overview
   - Code changes walkthrough
   - Testing procedures
   - Debugging techniques

2. **Operations Team** (1 hour)
   - Configuration management
   - Monitoring setup
   - Rollback procedures
   - Incident response

3. **QA Team** (1.5 hours)
   - Test plan review
   - Feature flag usage
   - Performance testing
   - Edge case scenarios

---

## 3. Migration Phases

### 3.1 Phase 0: Code Integration (Week 1)

**Objective:** Merge new code with all features DISABLED

**Tasks:**

1. **Implement Core Components**
   ```bash
   # Create component files
   touch src/core/routing/ModelRouter.ts
   touch src/core/routing/ComplexityAnalyzer.ts
   touch src/core/routing/CostTracker.ts
   touch src/mcp/tools/StreamingMCPTool.ts
   touch src/core/streaming/StreamManager.ts
   touch src/core/streaming/BufferManager.ts
   touch src/core/FeatureFlags.ts
   ```

2. **Update Existing Components**
   - FleetManager: Add router initialization
   - BaseAgent: Add routing support
   - Config: Add new configuration sections

3. **Run Test Suite**
   ```bash
   # All tests should pass with features disabled
   npm run test

   # Type checking
   npm run typecheck

   # Linting
   npm run lint
   ```

4. **Merge to Main**
   ```bash
   # Create pull request
   git add .
   git commit -m "feat(phase1): Add routing and streaming infrastructure (disabled)"
   git push origin feature/phase1-routing-streaming

   # After review and approval
   git checkout main
   git merge feature/phase1-routing-streaming
   git push origin main
   ```

**Success Criteria:**
- ✅ All existing tests pass
- ✅ No performance regression
- ✅ Zero functionality changes
- ✅ Code review approved
- ✅ Documentation updated

---

### 3.2 Phase 1: Alpha Deployment (Weeks 2-3)

**Objective:** Deploy to development/staging with features DISABLED

**Environment:** Development, Staging

**Configuration:**

```yaml
# config/fleet.dev.yaml
features:
  multiModelRouter: false  # Still disabled
  streaming: false         # Still disabled
```

**Deployment Steps:**

```bash
# 1. Deploy to development
npm run build
npm run deploy:dev

# 2. Verify deployment
curl https://dev-aqe.example.com/health
# Expected: { "status": "healthy", "version": "1.0.5", "features": { "multiModelRouter": false, "streaming": false } }

# 3. Run smoke tests
npm run test:e2e -- --env=dev

# 4. Monitor for 48 hours
# Check: Error rates, latency, memory usage

# 5. Deploy to staging
npm run deploy:staging

# 6. Run comprehensive tests
npm run test:integration -- --env=staging
npm run test:performance -- --env=staging

# 7. Monitor for 1 week
```

**Monitoring:**

```bash
# Set up alerts
./scripts/setup-monitoring.sh --env=dev

# Key metrics to watch:
# - Error rate (should be <0.1%)
# - P95 latency (should be <2s)
# - Memory usage (should be <600MB)
# - Agent spawn time (should be <100ms)
```

**Success Criteria:**
- ✅ Zero production incidents
- ✅ All metrics within baseline
- ✅ No user-reported issues
- ✅ Load tests pass
- ✅ Memory leaks not detected

---

### 3.3 Phase 2: Beta Testing (Weeks 4-5)

**Objective:** Enable features in development/staging

**Environment:** Development, Staging

**Configuration:**

```yaml
# config/fleet.beta.yaml
features:
  multiModelRouter: true   # ENABLED
  streaming: true          # ENABLED

routing:
  enabled: true
  # Use conservative budget limits for testing
  costTracking:
    budgetLimits:
      daily: 5.00    # Low limit for safety
      monthly: 100.00

streaming:
  enabled: true
  # Conservative settings
  timeoutMs: 15000  # Shorter timeout for faster failure detection
  retryConfig:
    maxRetries: 2   # Fewer retries to fail faster
```

**Enabling Process:**

```bash
# 1. Enable routing only (streaming still disabled)
kubectl set env deployment/aqe-fleet FEATURE_MULTI_MODEL_ROUTER=true
kubectl set env deployment/aqe-fleet FEATURE_STREAMING=false

# 2. Monitor for 3 days
./scripts/monitor-metrics.sh --feature=routing --duration=72h

# 3. If stable, enable streaming
kubectl set env deployment/aqe-fleet FEATURE_STREAMING=true

# 4. Monitor for 3 days
./scripts/monitor-metrics.sh --feature=streaming --duration=72h
```

**Test Scenarios:**

1. **Routing Validation**
   ```bash
   # Generate test tasks of varying complexity
   npm run test:routing:complexity

   # Expected:
   # - Simple tasks → Haiku
   # - Medium tasks → Sonnet
   # - Complex tasks → Opus
   ```

2. **Cost Tracking Validation**
   ```bash
   # Run tasks and verify cost tracking
   npm run test:routing:costs

   # Expected:
   # - Costs recorded in memory
   # - Budget alerts triggered at 80%
   # - Budget enforcement at 100%
   ```

3. **Streaming Validation**
   ```bash
   # Test streaming with various scenarios
   npm run test:streaming:scenarios

   # Expected:
   # - Chunks received in order
   # - Backpressure handled correctly
   # - Timeouts trigger fallback
   # - Final result matches synchronous
   ```

**Success Criteria:**
- ✅ Model selection accuracy >95%
- ✅ Cost savings >20% vs. single model
- ✅ Streaming success rate >98%
- ✅ Time to first chunk <500ms
- ✅ Zero critical bugs
- ✅ Performance within SLA

---

### 3.4 Phase 3: Limited Production Release (Week 6)

**Objective:** Enable for 10% of production traffic

**Environment:** Production

**Configuration:**

```yaml
# config/fleet.prod.yaml
features:
  multiModelRouter: true
  streaming: true

routing:
  enabled: true
  costTracking:
    budgetLimits:
      daily: 100.00
      monthly: 2000.00
```

**Canary Deployment:**

```bash
# 1. Deploy canary with features enabled (10% traffic)
kubectl apply -f k8s/canary-deployment.yaml

# 2. Monitor canary metrics
while true; do
  echo "=== Canary Metrics ==="
  kubectl exec -it deploy/aqe-fleet-canary -- curl localhost:3000/metrics
  echo ""
  echo "=== Stable Metrics ==="
  kubectl exec -it deploy/aqe-fleet-stable -- curl localhost:3000/metrics
  echo ""
  sleep 300  # Check every 5 minutes
done

# 3. Compare canary vs. stable
./scripts/compare-canary.sh

# 4. If metrics are good, increase to 25%
kubectl patch deployment aqe-fleet-canary -p '{"spec":{"replicas":2}}'

# 5. Continue monitoring for 24 hours

# 6. Increase to 50%
kubectl patch deployment aqe-fleet-canary -p '{"spec":{"replicas":4}}'

# 7. Continue monitoring for 24 hours

# 8. If stable, proceed to full rollout
```

**Monitoring Dashboard:**

```
┌─────────────────────────────────────────────────────────────┐
│              Canary vs. Stable Metrics                      │
├─────────────────────────────────────────────────────────────┤
│ Metric              │ Canary        │ Stable        │ Delta│
├─────────────────────────────────────────────────────────────┤
│ Error Rate          │ 0.05%         │ 0.05%         │  0%  │
│ P95 Latency         │ 1.8s          │ 1.9s          │ -5%  │
│ Memory Usage        │ 650MB         │ 550MB         │ +18% │
│ Cost per Task       │ $0.008        │ $0.012        │ -33% │
│ Tasks/sec           │ 45            │ 47            │ -4%  │
└─────────────────────────────────────────────────────────────┘
```

**Success Criteria:**
- ✅ Canary error rate ≤ stable error rate
- ✅ Canary latency within 10% of stable
- ✅ Cost reduction >20%
- ✅ No critical incidents
- ✅ User feedback positive

---

### 3.5 Phase 4: Full Production Release (Week 7)

**Objective:** Enable for 100% of production traffic

**Configuration:**

```bash
# 1. Promote canary to stable
kubectl set image deployment/aqe-fleet \
  aqe-fleet=agentic-qe:1.0.5 \
  --record

# 2. Update all replicas
kubectl scale deployment/aqe-fleet --replicas=8

# 3. Enable features globally
kubectl set env deployment/aqe-fleet \
  FEATURE_MULTI_MODEL_ROUTER=true \
  FEATURE_STREAMING=true

# 4. Remove canary deployment
kubectl delete deployment aqe-fleet-canary

# 5. Verify all pods healthy
kubectl get pods -l app=aqe-fleet

# 6. Monitor for 48 hours
./scripts/monitor-production.sh --duration=48h
```

**Post-Deployment Validation:**

```bash
# 1. Run production validation suite
npm run test:production:validate

# 2. Check cost savings
./scripts/analyze-costs.sh --period=7d

# 3. Generate performance report
./scripts/generate-report.sh --type=performance

# 4. Collect user feedback
./scripts/collect-feedback.sh
```

**Success Criteria:**
- ✅ All production pods healthy
- ✅ Error rate <0.1%
- ✅ P95 latency <2s
- ✅ Cost savings >20%
- ✅ No rollback required
- ✅ User satisfaction maintained

---

## 4. Configuration Migration

### 4.1 Automatic Migration Script

**File:** `scripts/migrate-config.ts`

```typescript
#!/usr/bin/env ts-node

import * as fs from 'fs-extra';
import * as yaml from 'yaml';
import * as path from 'path';

interface OldConfig {
  fleet: any;
  agents: any[];
  database: any;
  logging: any;
  api: any;
  security: any;
  // Old AI config
  ai?: {
    model: string;
    apiKey: string;
  };
}

interface NewConfig extends OldConfig {
  features: {
    multiModelRouter: boolean;
    streaming: boolean;
  };
  routing?: any;
  streaming?: any;
}

/**
 * Migrate v1.0.4 config to v1.0.5 format
 */
async function migrateConfig(
  oldConfigPath: string,
  newConfigPath: string
): Promise<void> {
  console.log(`Migrating config from ${oldConfigPath} to ${newConfigPath}`);

  // Read old config
  const oldConfigContent = await fs.readFile(oldConfigPath, 'utf8');
  const oldConfig: OldConfig = yaml.parse(oldConfigContent);

  // Create new config with features disabled
  const newConfig: NewConfig = {
    ...oldConfig,

    // Add feature flags (disabled for safety)
    features: {
      multiModelRouter: false,
      streaming: false
    },

    // Add routing config if AI model was configured
    routing: oldConfig.ai?.model ? {
      enabled: false,
      defaultModel: oldConfig.ai.model,
      models: [
        {
          name: 'claude-opus-4',
          provider: 'anthropic',
          model: 'claude-opus-4-20250514',
          capabilities: {
            maxTokens: 200000,
            supportsStreaming: true,
            costPer1kTokens: { input: 15.00, output: 75.00 }
          },
          complexityRange: { min: 0.7, max: 1.0 },
          enabled: true
        },
        {
          name: 'claude-sonnet-4.5',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250929',
          capabilities: {
            maxTokens: 200000,
            supportsStreaming: true,
            costPer1kTokens: { input: 3.00, output: 15.00 }
          },
          complexityRange: { min: 0.3, max: 0.8 },
          enabled: true
        },
        {
          name: 'claude-haiku-4',
          provider: 'anthropic',
          model: 'claude-haiku-4-20250110',
          capabilities: {
            maxTokens: 200000,
            supportsStreaming: true,
            costPer1kTokens: { input: 0.80, output: 4.00 }
          },
          complexityRange: { min: 0.0, max: 0.4 },
          enabled: true
        }
      ],
      complexity: {
        tokenWeighting: 0.4,
        structureWeighting: 0.3,
        contextWeighting: 0.3
      },
      costTracking: {
        enabled: false,
        budgetLimits: {
          daily: 100.00,
          monthly: 2000.00
        },
        alertThresholds: {
          dailyPercent: 80,
          monthlyPercent: 90
        }
      }
    } : undefined,

    // Add streaming config
    streaming: {
      enabled: false,
      bufferSize: 1024,
      backpressureThreshold: 0.8,
      timeoutMs: 30000,
      retryConfig: {
        maxRetries: 3,
        backoffMs: 1000,
        backoffMultiplier: 2
      }
    }
  };

  // Remove old AI config if present
  delete (newConfig as any).ai;

  // Write new config
  const newConfigContent = yaml.stringify(newConfig, {
    indent: 2,
    lineWidth: 0
  });
  await fs.writeFile(newConfigPath, newConfigContent, 'utf8');

  console.log('Migration complete!');
  console.log('IMPORTANT: Features are DISABLED by default for safety.');
  console.log('Review the new config and enable features when ready.');
}

// Run migration
const oldPath = process.argv[2] || 'config/fleet.yaml';
const newPath = process.argv[3] || 'config/fleet.v1.0.5.yaml';

migrateConfig(oldPath, newPath)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
```

**Usage:**

```bash
# Migrate config file
npm run migrate-config -- config/fleet.yaml config/fleet.v1.0.5.yaml

# Review changes
diff config/fleet.yaml config/fleet.v1.0.5.yaml

# Backup old config
cp config/fleet.yaml config/fleet.yaml.v1.0.4.backup

# Use new config
cp config/fleet.v1.0.5.yaml config/fleet.yaml

# Verify config is valid
npm run validate-config
```

### 4.2 Manual Migration Checklist

If automatic migration is not suitable:

**Step 1: Add Feature Flags**
```yaml
# Add to root of config
features:
  multiModelRouter: false
  streaming: false
```

**Step 2: Add Routing Configuration**
```yaml
routing:
  enabled: false
  defaultModel: 'claude-sonnet-4.5'
  models:
    # Copy from example config
  complexity:
    tokenWeighting: 0.4
    structureWeighting: 0.3
    contextWeighting: 0.3
  costTracking:
    enabled: false
    budgetLimits:
      daily: 100.00
      monthly: 2000.00
```

**Step 3: Add Streaming Configuration**
```yaml
streaming:
  enabled: false
  bufferSize: 1024
  backpressureThreshold: 0.8
  timeoutMs: 30000
  retryConfig:
    maxRetries: 3
    backoffMs: 1000
    backoffMultiplier: 2
```

**Step 4: Validate**
```bash
npm run validate-config -- config/fleet.yaml
```

---

## 5. Code Migration

### 5.1 Agent Code Migration

**For Custom Agents:**

If you have custom agents extending `BaseAgent`, minimal changes needed:

**Before (v1.0.4):**
```typescript
export class MyCustomAgent extends BaseAgent {
  protected async performTask(task: QETask): Promise<any> {
    // Your implementation
    const result = await this.myCustomLogic(task);
    return result;
  }
}
```

**After (v1.0.5):**
```typescript
export class MyCustomAgent extends BaseAgent {
  // Rename to performTaskImpl
  protected async performTaskImpl(
    task: QETask,
    selection?: ModelSelection  // New optional parameter
  ): Promise<any> {
    // Your implementation (unchanged)
    const result = await this.myCustomLogic(task);

    // Optional: Use model selection info
    if (selection) {
      this.logger.info(`Using model: ${selection.modelName}`);
    }

    return result;
  }
}
```

**Migration Script:**

```bash
# Automated migration for custom agents
./scripts/migrate-agents.sh

# Script will:
# 1. Find all classes extending BaseAgent
# 2. Rename performTask to performTaskImpl
# 3. Add optional ModelSelection parameter
# 4. Add backward compatibility wrapper
```

### 5.2 MCP Tool Migration

**For Custom MCP Tools:**

**Before (v1.0.4):**
```typescript
export class MyCustomTool extends BaseMCPTool {
  async execute(params: any): Promise<any> {
    // Your implementation
  }
}
```

**After (v1.0.5):**
```typescript
export class MyCustomTool extends BaseMCPTool {
  async execute(params: any): Promise<any> {
    // Your implementation (unchanged)
  }

  // Optional: Add streaming support
  supportsStreaming(): boolean {
    return true;  // if your tool supports streaming
  }

  async executeStreaming(
    params: any,
    callbacks: StreamCallbacks
  ): Promise<any> {
    // Optional streaming implementation
    callbacks.onStart?.({ streamId: '...', ... });

    // Process in chunks
    for (const chunk of this.processInChunks(params)) {
      callbacks.onChunk?.(chunk);
    }

    callbacks.onComplete?.({ data: result });
    return result;
  }
}
```

---

## 6. Data Migration

### 6.1 Memory Store Migration

**No migration needed** - SwarmMemoryManager schema is backward compatible.

New partitions are created automatically:
- `routing/costs` - Cost tracking data
- `routing/selections` - Model selections
- `streaming/sessions` - Streaming sessions

**Optional: Cleanup Old Data**

```typescript
// Clean up test data before production
await memoryStore.clear('test-partition');

// Set up new partitions
await memoryStore.store(
  'routing/initialized',
  { version: '1.0.5', timestamp: Date.now() },
  { partition: 'coordination', owner: 'system', accessLevel: AccessLevel.SYSTEM }
);
```

---

## 7. Testing Strategy

### 7.1 Test Phases

**Phase 1: Unit Tests**
```bash
npm run test:unit
# Expected: 100% pass rate
```

**Phase 2: Integration Tests**
```bash
npm run test:integration
# Expected: 100% pass rate
```

**Phase 3: Performance Tests**
```bash
npm run test:performance
# Expected: No degradation
```

**Phase 4: End-to-End Tests**
```bash
npm run test:e2e
# Expected: All workflows functional
```

### 7.2 Test Scenarios

**Backward Compatibility Tests:**
```typescript
describe('Backward Compatibility', () => {
  it('should work with features disabled', async () => {
    const config = createConfig({ features: { multiModelRouter: false, streaming: false } });
    const fleet = new FleetManager(config);
    await fleet.initialize();

    // Should work exactly as v1.0.4
    const agent = await fleet.spawnAgent('test-generator');
    const result = await agent.executeTask(task);

    expect(result).toBeDefined();
  });
});
```

**Feature Flag Tests:**
```typescript
describe('Feature Flags', () => {
  it('should enable routing when flag is true', async () => {
    const config = createConfig({ features: { multiModelRouter: true } });
    const fleet = new FleetManager(config);
    await fleet.initialize();

    expect(fleet.getModelRouter()).toBeDefined();
  });
});
```

---

## 8. Rollback Procedures

### 8.1 Immediate Rollback (Critical Issues)

**Scenario:** Critical bug found in production

**Procedure:**

```bash
# 1. Disable features via environment variables (hot reload)
kubectl set env deployment/aqe-fleet \
  FEATURE_MULTI_MODEL_ROUTER=false \
  FEATURE_STREAMING=false

# System automatically reverts to v1.0.4 behavior
# No restart needed, takes effect in <30 seconds

# 2. Verify features disabled
kubectl exec -it deploy/aqe-fleet-0 -- \
  curl localhost:3000/health | jq '.features'
# Expected: { "multiModelRouter": false, "streaming": false }

# 3. Monitor for stabilization (5-10 minutes)
./scripts/monitor-metrics.sh --duration=600

# 4. If stable, investigate issue
# If still unstable, proceed to full rollback
```

**Time to Rollback:** <2 minutes
**Downtime:** Zero (hot reload)

### 8.2 Full Rollback (Complete Revert)

**Scenario:** Features cannot be stabilized

**Procedure:**

```bash
# 1. Revert to v1.0.4 image
kubectl set image deployment/aqe-fleet \
  aqe-fleet=agentic-qe:1.0.4-stable \
  --record

# 2. Restore v1.0.4 configuration
kubectl create configmap aqe-fleet-config \
  --from-file=config/fleet.yaml.v1.0.4.backup \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Restart pods with old config
kubectl rollout restart deployment/aqe-fleet

# 4. Wait for rollout to complete
kubectl rollout status deployment/aqe-fleet

# 5. Verify v1.0.4 running
kubectl exec -it deploy/aqe-fleet-0 -- \
  curl localhost:3000/health | jq '.version'
# Expected: "1.0.4"

# 6. Restore database backup (if needed)
kubectl exec -it deploy/aqe-fleet-0 -- \
  cp /backups/fleet.db.v1.0.4.backup /data/fleet.db

# 7. Monitor for 1 hour
./scripts/monitor-metrics.sh --duration=3600
```

**Time to Rollback:** 5-10 minutes
**Downtime:** Rolling restart (~2 minutes)

### 8.3 Partial Rollback (Agent-Specific)

**Scenario:** Issue with specific agent type

**Procedure:**

```yaml
# Disable features for specific agent type
features:
  multiModelRouter: true
  streaming: true

# Override for problematic agent
featureOverrides:
  agentType:
    test-generator:
      multiModelRouter: false
      streaming: false
```

---

## 9. Success Criteria

### 9.1 Technical Metrics

| Metric | Baseline (v1.0.4) | Target (v1.0.5) | Actual |
|--------|------------------|----------------|--------|
| Error Rate | 0.05% | ≤0.05% | |
| P95 Latency | 2.0s | ≤2.0s | |
| Memory Usage | 550MB | ≤700MB | |
| Cost per Task | $0.012 | ≤$0.010 | |
| Tasks/sec | 50 | ≥45 | |
| Time to First Chunk | N/A | <500ms | |

### 9.2 Business Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Cost Savings | >20% | |
| User Satisfaction | ≥95% | |
| Incident Count | 0 critical | |
| Adoption Rate | >80% | |

### 9.3 Quality Gates

**Gate 1: Pre-Deployment**
- [ ] All tests pass (100%)
- [ ] Code review approved
- [ ] Documentation complete
- [ ] Security review passed

**Gate 2: Alpha (Dev/Staging)**
- [ ] Zero regressions detected
- [ ] Performance within baseline
- [ ] Load tests pass
- [ ] Monitoring setup complete

**Gate 3: Beta (Dev/Staging with Features)**
- [ ] Model selection accuracy >95%
- [ ] Cost savings >20%
- [ ] Streaming success rate >98%
- [ ] Zero critical bugs

**Gate 4: Production Canary**
- [ ] Canary metrics ≥ stable metrics
- [ ] No user-reported issues
- [ ] Cost tracking validated
- [ ] 24 hours stable

**Gate 5: Full Production**
- [ ] All pods healthy
- [ ] All metrics within SLA
- [ ] User feedback positive
- [ ] 48 hours stable

---

## 10. Communication Plan

### 10.1 Stakeholder Communication

**Before Migration:**
- Email to all stakeholders: Migration timeline and goals
- Engineering all-hands: Technical overview
- Ops team briefing: Deployment procedures

**During Migration:**
- Daily status updates in Slack
- Weekly stakeholder meeting
- Incident alerts (if any)

**After Migration:**
- Success announcement
- Metrics report
- Lessons learned session
- Updated documentation

### 10.2 User Communication

**Timeline:**

- **T-14 days**: Announcement of upcoming features
- **T-7 days**: Feature documentation published
- **T-1 day**: Deployment window notice
- **T-0**: Deployment in progress updates
- **T+1 day**: Deployment complete, feedback requested
- **T+7 days**: Results and metrics shared

**Template Email:**

```
Subject: New Features Coming to Agentic QE Fleet v1.0.5

Hi Team,

We're excited to announce Phase 1 of our fleet enhancement:

NEW FEATURES:
- Multi-Model Routing: Automatic model selection for optimal cost/quality
- Streaming Responses: Real-time feedback for long-running tasks

BENEFITS:
- 20%+ cost savings
- 75% faster time to first response
- Better task-to-model matching

TIMELINE:
- Alpha Testing: [Dates]
- Beta Testing: [Dates]
- Production Release: [Date]

WHAT YOU NEED TO DO:
- Review updated documentation: [Link]
- Test in staging environment: [Link]
- Provide feedback: [Form Link]

Questions? Join us at the Q&A session: [Calendar Invite]

Best,
The AQE Team
```

---

## Appendix A: Migration Checklist

### Pre-Migration
- [ ] Backup current configuration
- [ ] Backup database
- [ ] Create rollback git tag
- [ ] Run full test suite (v1.0.4)
- [ ] Document baseline metrics
- [ ] Train team members
- [ ] Setup monitoring

### Phase 0: Code Integration
- [ ] Implement core components
- [ ] Update existing components
- [ ] Run test suite (all pass)
- [ ] Code review and approval
- [ ] Merge to main
- [ ] Deploy with features disabled

### Phase 1: Alpha Deployment
- [ ] Deploy to dev/staging
- [ ] Verify features disabled
- [ ] Run smoke tests
- [ ] Monitor for 48 hours
- [ ] Run integration tests
- [ ] Monitor for 1 week

### Phase 2: Beta Testing
- [ ] Enable routing in staging
- [ ] Monitor for 3 days
- [ ] Enable streaming in staging
- [ ] Monitor for 3 days
- [ ] Validate cost tracking
- [ ] Validate streaming

### Phase 3: Limited Production
- [ ] Deploy canary (10%)
- [ ] Monitor canary vs stable
- [ ] Increase to 25%
- [ ] Monitor for 24 hours
- [ ] Increase to 50%
- [ ] Monitor for 24 hours

### Phase 4: Full Production
- [ ] Promote to 100%
- [ ] Remove canary deployment
- [ ] Verify all pods healthy
- [ ] Monitor for 48 hours
- [ ] Validate cost savings
- [ ] Collect user feedback

### Post-Migration
- [ ] Generate metrics report
- [ ] Update documentation
- [ ] Conduct retrospective
- [ ] Archive migration artifacts
- [ ] Celebrate success! 🎉

---

## Appendix B: Troubleshooting Guide

### Issue: Model Router Not Initializing

**Symptoms:**
- `modelRouter` is undefined in agents
- Error: "ModelRouter not initialized"

**Diagnosis:**
```bash
# Check feature flag
kubectl exec -it deploy/aqe-fleet-0 -- \
  env | grep FEATURE_MULTI_MODEL_ROUTER

# Check config
kubectl exec -it deploy/aqe-fleet-0 -- \
  cat /config/fleet.yaml | grep -A 5 "features:"
```

**Resolution:**
1. Verify feature flag is `true` in environment or config
2. Check for initialization errors in logs
3. Verify model configurations are valid
4. Restart pods if needed

---

### Issue: Streaming Timeouts

**Symptoms:**
- Frequent "Stream timeout" errors
- Tasks fallback to synchronous mode

**Diagnosis:**
```bash
# Check timeout configuration
kubectl exec -it deploy/aqe-fleet-0 -- \
  cat /config/fleet.yaml | grep -A 10 "streaming:"

# Check network latency to model API
kubectl exec -it deploy/aqe-fleet-0 -- \
  curl -w "@curl-format.txt" https://api.anthropic.com/health
```

**Resolution:**
1. Increase `timeoutMs` in streaming config
2. Check network connectivity to model API
3. Verify API key is valid
4. Review backoff/retry configuration

---

## Document Version

Version: 1.0
Date: 2025-10-16
Author: System Architecture Team
Status: Ready for Implementation
