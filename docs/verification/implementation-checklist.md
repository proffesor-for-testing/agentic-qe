# Implementation Checklist: Issues #83, #71, #69

**Quick reference for implementing the three issues in priority order.**

---

## ✅ Issue #83: Documentation Verification (1-2 hours)

### Pre-Implementation Checks
- [ ] Review GitHub Actions workflow failure
- [ ] Check workflow artifacts for detailed reports

### Implementation Steps

**Step 1: Run Local Verification (15 min)**
```bash
cd /workspaces/agentic-qe-cf

# Run all verification scripts
npm run verify:counts
npm run verify:agent-skills
npm run verify:features
```

**Step 2: Apply Automated Fixes (15 min)**
```bash
# Update documentation counts
npm run update:counts

# Re-verify
npm run verify:all
```

**Step 3: Manual Fixes (30 min)**
- [ ] Review any remaining skill reference issues
- [ ] Validate feature claims against implementation
- [ ] Fix any broken links or missing files
- [ ] Update CHANGELOG.md if needed

**Step 4: Validation (15 min)**
```bash
# Final verification
npm run verify:all

# Should output: ✅ All checks passed
```

**Step 5: Commit (15 min)**
```bash
# Only if user requests commit
git status
git diff
# Wait for user approval before committing
```

### Success Criteria
- [ ] All verification scripts pass
- [ ] No count mismatches
- [ ] All skill references valid
- [ ] All feature claims accurate
- [ ] GitHub Actions workflow will pass

---

## 🔧 Issue #71: OTEL Stack Integration (7 hours)

### Prerequisites
- [ ] Docker and Docker Compose installed
- [ ] Ports available: 4317, 4318, 9090, 16686
- [ ] Issue #83 complete (documentation verified)

### Task 1: OTEL Collector Deployment (2 hours)

**Step 1.1: Create Docker Compose File (45 min)**
```bash
# Create docker-compose.yml in project root
touch /workspaces/agentic-qe-cf/docker-compose.yml
```

**Services to add:**
- [ ] OTEL Collector (otel/opentelemetry-collector:latest)
- [ ] Prometheus (prom/prometheus:latest)
- [ ] Jaeger (jaegertracing/all-in-one:latest)
- [ ] Grafana (already exists or add)

**Step 1.2: Create OTEL Collector Config (45 min)**
```bash
mkdir -p /workspaces/agentic-qe-cf/configs/observability
touch /workspaces/agentic-qe-cf/configs/observability/otel-collector.yaml
```

**Configuration requirements:**
- [ ] Receivers: OTLP gRPC (4317), OTLP HTTP (4318)
- [ ] Processors: batch, memory_limiter
- [ ] Exporters: prometheus, jaeger
- [ ] Service pipelines: traces, metrics

**Step 1.3: Test Collector (30 min)**
```bash
# Start collector only
docker-compose up otel-collector

# Test receivers
curl http://localhost:4318/v1/traces
curl http://localhost:4317  # gRPC check

# Should see: collector running, receivers ready
```

### Task 2: Prometheus Integration (1 hour)

**Step 2.1: Configure Prometheus (30 min)**
```bash
touch /workspaces/agentic-qe-cf/configs/observability/prometheus.yml
```

**Configuration:**
- [ ] Scrape interval: 15s
- [ ] Scrape targets: OTEL Collector (8889/metrics)
- [ ] Recording rules for AQE metrics
- [ ] Retention: 15 days

**Step 2.2: Deploy and Test (30 min)**
```bash
# Start Prometheus
docker-compose up prometheus

# Access UI
open http://localhost:9090

# Verify targets
# Should see: OTEL Collector target UP
```

### Task 3: Jaeger Integration (1 hour)

**Step 3.1: Deploy Jaeger (30 min)**
```bash
# Already in docker-compose.yml
docker-compose up jaeger

# Access UI
open http://localhost:16686
```

**Configuration:**
- [ ] Backend: Elasticsearch or memory
- [ ] UI port: 16686
- [ ] Collector: receives from OTEL

**Step 3.2: Test Tracing (30 min)**
```bash
# Run instrumented code
npm run dev -- init

# Check Jaeger UI for traces
# Should see: agentic-qe-fleet service, spans visible
```

### Task 4: Grafana Datasource Wiring (1 hour)

**Step 4.1: Update Dashboards (45 min)**
```bash
# Locate existing Grafana dashboards
ls /workspaces/agentic-qe-cf/frontend/public/dashboards/

# Update datasources from SQLite API to:
# - Prometheus datasource for metrics
# - Jaeger datasource for traces
```

**Step 4.2: Test Dashboards (15 min)**
```bash
# Access Grafana
open http://localhost:3000

# Import updated dashboards
# Verify data flows from Prometheus and Jaeger
```

### Task 5: Test Coverage Metrics (30 minutes)

**Step 5.1: Run Coverage (20 min)**
```bash
# Generate coverage report
npm run test:coverage-safe

# Review output
cat coverage/coverage-summary.json
```

**Step 5.2: Document Coverage (10 min)**
- [ ] Current coverage percentage
- [ ] Coverage by subsystem
- [ ] Gaps identified
- [ ] Improvement plan

### Task 6: Bundle Optimization (1.5 hours)

**Step 6.1: Analyze Current Bundle (15 min)**
```bash
cd /workspaces/agentic-qe-cf/frontend

# Build and analyze
npm run build

# Check bundle size
ls -lh dist/assets/*.js
# Current: ~1,213 kB
# Target: <500 kB
```

**Step 6.2: Implement Code Splitting (1 hour)**

**Files to update:**
- [ ] `frontend/src/App.tsx` - Add React.lazy()
- [ ] `frontend/src/components/MindMap.tsx` - Lazy load
- [ ] `frontend/src/components/QualityMetrics.tsx` - Lazy load
- [ ] `frontend/src/components/Timeline.tsx` - Lazy load

**Example:**
```typescript
const MindMap = React.lazy(() => import('./components/MindMap'));
const QualityMetrics = React.lazy(() => import('./components/QualityMetrics'));
```

**Step 6.3: Verify Optimization (15 min)**
```bash
# Rebuild
npm run build

# Check new bundle size
ls -lh dist/assets/*.js

# Should see: initial bundle <500 kB, lazy chunks created
```

### Integration Testing (30 min)

**End-to-End Verification:**
```bash
# 1. Start all services
docker-compose up -d

# 2. Run AQE with instrumentation
npm run dev -- init

# 3. Verify data flow:
# - Check Prometheus metrics: http://localhost:9090
# - Check Jaeger traces: http://localhost:16686
# - Check Grafana dashboards: http://localhost:3000

# 4. Run Phase 2 tests
npm run test:phase2:instrumentation
npm run test:integration:phase2:perf

# All should pass ✅
```

### Success Criteria
- [ ] OTEL Collector running and ingesting data
- [ ] Prometheus scraping metrics
- [ ] Jaeger displaying traces
- [ ] Grafana dashboards using OTEL datasources
- [ ] Coverage report shows 80%+ (or document current %)
- [ ] Frontend bundle <500 kB initial load
- [ ] All tests passing
- [ ] Documentation updated

---

## 🚀 Issue #69: Phase 4 Integration (38 hours)

**DEFER UNTIL ISSUE #71 COMPLETE**

### Planning Phase (4 hours)

**Before starting implementation:**
- [ ] Review Issue #71 completion
- [ ] Validate OTEL stack operational
- [ ] Create detailed task breakdown
- [ ] Identify sub-tasks for each action
- [ ] Assign time estimates
- [ ] Document dependencies

### Implementation Phases

**Phase 4.1: Alerting & Feedback (11 hours)**
- [ ] A11: Configure Alerting Rules (3h)
  - [ ] Define alert conditions
  - [ ] Create Prometheus alert rules
  - [ ] Set up notification channels
  - [ ] Test alert firing

- [ ] A12: Build Autonomous Feedback Loop (8h)
  - [ ] Design feedback architecture
  - [ ] Implement alert → agent trigger
  - [ ] Create remediation strategies
  - [ ] Test autonomous responses

**Phase 4.2: Output Generation (14 hours)**
- [ ] C9: Result Aggregator (4h)
- [ ] C10: Human-Readable Reporter (4h)
- [ ] C11: Structured JSON Reporter (2h)
- [ ] C12: Agent Control Loop Reporter (4h)

**Phase 4.3: Integration Points (8 hours)**
- [ ] C13: CI/CD Integration (4h)
- [ ] A14: Telemetry CLI Commands (4h)
- [ ] C14: Constitution CLI Commands (4h)
- [ ] V11: Visualization MCP Tools (4h)
- [ ] C16: Constitution MCP Tools (4h)
- [ ] C15: Memory Integration (2h)

**Phase 4.4: Testing & Documentation (5 hours)**
- [ ] Integration testing (3h)
- [ ] Documentation updates (2h)
- [ ] Release preparation (included in above)

### Success Criteria
- [ ] All Phase 4 actions complete
- [ ] Alerting operational
- [ ] Feedback loop autonomous
- [ ] CI/CD integration working
- [ ] All CLI commands functional
- [ ] All MCP tools integrated
- [ ] Documentation complete
- [ ] Ready for v2.0.0 release

---

## Quick Reference Commands

### Documentation (Issue #83)
```bash
npm run verify:all           # Verify all documentation
npm run update:counts        # Update count references
npm run verify:counts        # Verify counts only
npm run verify:agent-skills  # Verify skill references
npm run verify:features      # Verify feature claims
```

### Testing (All Issues)
```bash
npm run test:unit                      # Unit tests (safe)
npm run test:integration               # Integration (batched)
npm run test:coverage-safe             # Coverage report
npm run test:phase2:instrumentation    # OTEL tests
npm run test:integration:phase2:perf   # Performance tests
```

### OTEL Stack (Issue #71)
```bash
docker-compose up -d                 # Start all services
docker-compose logs otel-collector   # Check collector logs
docker-compose logs prometheus       # Check Prometheus logs
docker-compose logs jaeger           # Check Jaeger logs
docker-compose down                  # Stop all services
```

### Bundle Analysis (Issue #71)
```bash
cd frontend
npm run build                # Build production bundle
ls -lh dist/assets/*.js      # Check bundle sizes
```

---

## Risk Mitigation

### Issue #83 (Low Risk)
- **Risk**: Documentation changes break references
- **Mitigation**: Run verification before commit
- **Rollback**: `git checkout -- docs/`

### Issue #71 (Medium Risk)
- **Risk**: OTEL stack port conflicts
- **Mitigation**: Check ports before deployment
- **Rollback**: `docker-compose down`, revert configs

- **Risk**: Frontend bundle optimization breaks UI
- **Mitigation**: Test thoroughly, use Suspense fallbacks
- **Rollback**: Revert lazy loading changes

### Issue #69 (High Risk)
- **Risk**: Complex integration failures
- **Mitigation**: Incremental implementation, test each phase
- **Rollback**: Git branches for each phase

---

## Support Resources

### Documentation
- Main verification report: `/docs/verification/issues-83-71-69-verification-report.md`
- Test execution policy: `/docs/policies/test-execution.md`
- Git operations policy: `/docs/policies/git-operations.md`

### Key Files
- OpenTelemetry: `/src/telemetry/bootstrap.ts`
- Test config: `/jest.config.js`
- Package scripts: `/package.json`

### Getting Help
- Review GitHub issues: #83, #71, #69
- Check workflow runs for detailed error logs
- Test locally before pushing changes

---

**Created**: 2025-11-29
**Last Updated**: 2025-11-29
**Status**: Ready for implementation
