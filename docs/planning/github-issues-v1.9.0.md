# GitHub Issues for v1.9.0 - MCP Performance Optimization

**Generated:** 2025-11-16
**Source:** [mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md)
**Total Issues:** 7 (HIGH priority features from 3-phase plan)
**Expected ROI:** $90,520/year (64% cost reduction)
**Timeline:** 12 weeks (3 months)

---

## Issue #1: [v1.9.0] QW-1: Client-Side Data Filtering - 99% Token Reduction

**Labels:** `enhancement`, `v1.9.0`, `high-priority`, `performance`, `mcp`
**Phase:** Phase 1 - Quick Wins (Week 1)
**Effort:** 1 week
**ROI:** ⭐⭐⭐⭐⭐ (Highest)

### Overview
Implement client-side data filtering layer to reduce output tokens by 99% on high-volume operations (coverage analysis, test execution, flaky detection, performance benchmarks).

**Problem:** Coverage reports and test results return 10,000+ rows (50,000 tokens), overwhelming context window and driving up costs.

**Solution:** Process full datasets locally, return only top-N items + summary statistics to Claude.

### Context
- **Original Plan:** [QW-1 Section](./mcp-improvement-plan-revised.md#qw-1-client-side-data-filtering-week-1)
- **Dependencies:** None
- **Expected Savings:** $108,030/year

### Implementation Details

**Technical Approach:**
1. Create `src/utils/filtering.ts` with `FilterConfig` interface and `filterLargeDataset()` function
2. Apply to 6 high-volume MCP operations:
   - `aqe_coverage_analyze` (50,000 → 500 tokens)
   - `aqe_test_execute` (30,000 → 800 tokens)
   - `aqe_flaky_analyze` (40,000 → 600 tokens)
   - `aqe_performance_benchmark` (60,000 → 1,000 tokens)
   - `aqe_security_scan` (25,000 → 700 tokens)
   - `aqe_quality_assess` (20,000 → 500 tokens)

**Files to Create/Modify:**
- ✅ Create: `src/utils/filtering.ts`
- ✅ Create: `src/mcp/handlers/filtered/coverage-analyzer.ts`
- ✅ Create: `src/mcp/handlers/filtered/test-executor.ts`
- ✅ Create: `src/mcp/handlers/filtered/flaky-analyzer.ts`
- ✅ Create: `src/mcp/handlers/filtered/performance-benchmarker.ts`
- ✅ Create: `src/mcp/handlers/filtered/security-scanner.ts`
- ✅ Create: `src/mcp/handlers/filtered/quality-assessor.ts`
- ✅ Create: `tests/unit/filtering.test.ts`
- ✅ Create: `tests/integration/filtered-handlers.test.ts`

### Acceptance Criteria
- [ ] Filtering layer handles 10,000+ row datasets without errors
- [ ] Returns only top-N items (default 10, configurable)
- [ ] Includes summary statistics (total, filtered count, distributions)
- [ ] Calculates aggregate metrics (avg, stdDev) when requested
- [ ] Applied to all 6 high-volume operations
- [ ] Unit tests achieve 90%+ coverage
- [ ] Integration tests verify 99% token reduction
- [ ] Performance benchmarks show <0.5s response time
- [ ] Documentation updated with usage examples

### Success Metrics

**Performance:**
- **Token Reduction:** Average output tokens: 50,000 → 683 (98.6% reduction)
- **Response Time:** Coverage analysis: 5s → 0.5s (10x faster)
- **Cost Savings:** $300/day → $4/day on outputs ($108,030/year savings)

**Quality:**
| Operation | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Coverage Analysis | 50,000 tokens | 500 tokens | 99% |
| Test Execution | 30,000 tokens | 800 tokens | 97.3% |
| Flaky Detection | 40,000 tokens | 600 tokens | 98.5% |
| Performance Benchmarks | 60,000 tokens | 1,000 tokens | 98.3% |
| Security Scan | 25,000 tokens | 700 tokens | 97.2% |
| Quality Assessment | 20,000 tokens | 500 tokens | 97.5% |

### Testing Requirements
```bash
# Unit tests
npm run test:unit -- filtering.test.ts

# Integration tests
npm run test:integration -- filtered-handlers.test.ts

# Performance benchmarks
npm run benchmark -- before-after-filtering
```

### References
- Original Plan: [docs/planning/mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md#qw-1-client-side-data-filtering-week-1)
- Brutal Honesty Review: Validated this as highest ROI feature
- Implementation Details: Lines 142-257 of revised plan

---

## Issue #2: [v1.9.0] QW-2: Batch Tool Operations - 80% Latency Reduction

**Labels:** `enhancement`, `v1.9.0`, `high-priority`, `performance`, `mcp`
**Phase:** Phase 1 - Quick Wins (Week 2)
**Effort:** 1 week
**ROI:** ⭐⭐⭐⭐⭐ (Highest)

### Overview
Implement batch operation manager to execute multiple independent operations concurrently with retry logic, reducing API calls by 80% and improving response times by 3-5x.

**Problem:** Sequential API calls waste time (N × latency) and create unnecessary round-trips.

**Solution:** Batch independent operations and execute concurrently with exponential backoff retry logic.

### Context
- **Original Plan:** [QW-2 Section](./mcp-improvement-plan-revised.md#qw-2-batch-tool-operations-week-2)
- **Dependencies:** None
- **Expected Savings:** Included in $43,470/year Phase 1 savings

### Implementation Details

**Technical Approach:**
1. Create `src/utils/batch-operations.ts` with `BatchOperationManager` class
2. Support concurrent execution with configurable concurrency limit (default 5)
3. Implement timeout handling (default 60s per operation)
4. Add exponential backoff retry logic (default 3 retries)
5. Integrate with test generation, coverage analysis, and other agents

**Files to Create/Modify:**
- ✅ Create: `src/utils/batch-operations.ts`
- ✅ Modify: `src/agents/qe-test-generator/index.ts` (add batch generation)
- ✅ Modify: `src/agents/qe-coverage-analyzer/index.ts` (add batch analysis)
- ✅ Modify: `src/agents/qe-performance-tester/index.ts` (add batch benchmarks)
- ✅ Create: `tests/unit/batch-operations.test.ts`
- ✅ Create: `tests/integration/batch-execution.test.ts`

### Acceptance Criteria
- [ ] Batch manager handles 100+ concurrent operations without errors
- [ ] Configurable concurrency limit (1-20 concurrent operations)
- [ ] Timeout enforcement with configurable duration
- [ ] Exponential backoff retry with max retries
- [ ] Integration with at least 3 agent types
- [ ] Unit tests achieve 90%+ coverage
- [ ] Integration tests verify 80% API call reduction
- [ ] Performance benchmarks show 3-5x speedup

### Success Metrics

**Performance:**
- **API Calls:** 100 sequential → 20 batched (80% reduction)
- **Test Generation:** 3 files × 2s = 6s → 2s (3x faster)
- **Coverage Analysis:** 10 modules × 1s = 10s → 2s (5x faster)

**Quality:**
- **Error Handling:** Automatic retry on transient failures
- **Resource Usage:** Bounded concurrency prevents overload
- **Observability:** Track batch metrics (success rate, avg latency)

### Testing Requirements
```bash
# Unit tests
npm run test:unit -- batch-operations.test.ts

# Integration tests
npm run test:integration -- batch-execution.test.ts

# Load testing
npm run load-test -- batch-operations-stress
```

### References
- Original Plan: [docs/planning/mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md#qw-2-batch-tool-operations-week-2)
- Implementation Details: Lines 260-376 of revised plan

---

## Issue #3: [v1.9.0] CO-1: Prompt Caching Infrastructure - 60% Cost Reduction

**Labels:** `enhancement`, `v1.9.0`, `high-priority`, `cost-optimization`, `mcp`
**Phase:** Phase 2 - Cost Optimization (Week 3-4)
**Effort:** 2 weeks
**ROI:** ⭐⭐⭐⭐

### Overview
Implement Anthropic's prompt caching with proper cache key management and invalidation to reduce costs by 50-70% on system prompts.

**Problem:** System prompts (10,000+ tokens) sent with every API call, no caching utilized.

**Current Cost:** $32,850/year on system prompt tokens alone.

**Solution:** Implement Anthropic's prompt caching with proper cache key tracking, content hash-based invalidation, and statistics collection.

### Context
- **Original Plan:** [CO-1 Section](./mcp-improvement-plan-revised.md#co-1-prompt-caching-infrastructure-week-3-4)
- **Dependencies:** None
- **Expected Savings:** $19,710/year (60% of system prompt costs)

### Implementation Details

**Technical Approach:**
1. Create `src/utils/prompt-cache.ts` with `PromptCacheManager` class
2. Implement Anthropic's prompt caching API correctly:
   - Minimum 1024 tokens per cached block
   - Cache control on LAST 3 blocks only
   - 5-minute TTL (automatic)
3. Track cache keys with content hashing
4. Collect statistics (hits, misses, cost savings)
5. Auto-prune expired cache keys

**Cache Economics:**
```
First call (cache write): $0.1035 (25% premium)
Subsequent calls (cache hit): $0.0414 (60% savings)
Break-even: 2 calls
Target hit rate: 60-80%
Expected annual savings: $19,710/year
```

**Files to Create/Modify:**
- ✅ Create: `src/utils/prompt-cache.ts`
- ✅ Modify: `src/agents/qe-test-generator/index.ts` (add caching)
- ✅ Modify: `src/agents/qe-coverage-analyzer/index.ts` (add caching)
- ✅ Modify: All agent files to use `PromptCacheManager`
- ✅ Create: `tests/unit/prompt-cache.test.ts`
- ✅ Create: `tests/integration/cache-hit-rate.test.ts`
- ✅ Create: `docs/implementation/prompt-caching-co-1.md`

### Acceptance Criteria
- [ ] Cache manager handles 1000+ cache entries without errors
- [ ] Content hashing correctly detects changes
- [ ] Cache invalidation works on 5-minute TTL
- [ ] Statistics tracking (hits, misses, savings)
- [ ] Applied to all agent system prompts
- [ ] Unit tests achieve 90%+ coverage
- [ ] 7-day monitoring shows 60-80% cache hit rate
- [ ] Cost reduction verified: 50-70% on system prompts
- [ ] Documentation includes usage examples

### Success Metrics

**Performance:**
- **Cache Hit Rate:** 60-80% (measured over 7 days)
- **Cost per Operation:** $0.09 → $0.05 (44% reduction)
- **Annual Savings:** $19,710/year

**Break-Even Analysis:**
| Scenario | Cost | Savings |
|----------|------|---------|
| Cache write (1st call) | $0.1035 | -$0.0225 (25% premium) |
| Cache hit (2nd+ call) | $0.0414 | $0.0486 (54% savings) |
| 2 calls total | $0.1449 | $0.0351 (19% savings) |
| 5 calls total | $0.269 | $0.181 (40% savings) |

### Testing Requirements
```bash
# Unit tests
npm run test:unit -- prompt-cache.test.ts

# Integration tests (requires 7-day monitoring)
npm run test:integration -- cache-hit-rate.test.ts

# Cost analysis
npm run analyze -- prompt-cache-savings
```

### References
- Original Plan: [docs/planning/mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md#co-1-prompt-caching-infrastructure-week-3-4)
- Anthropic Prompt Caching Docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Implementation Details: Lines 379-647 of revised plan

---

## Issue #4: [v1.9.0] CO-2: PII Tokenization Layer - GDPR/CCPA Compliance

**Labels:** `enhancement`, `v1.9.0`, `high-priority`, `security`, `compliance`
**Phase:** Phase 2 - Cost Optimization (Week 5-6)
**Effort:** 2 weeks
**ROI:** ⭐⭐⭐⭐

### Overview
Implement PII tokenization layer to protect test data containing realistic PII (emails, phones, SSNs, credit cards), ensuring GDPR/CCPA compliance.

**Problem:** Test data contains realistic PII, creating GDPR/CCPA compliance risks when sent to model or stored in logs.

**Solution:** Tokenize PII before sending to model, maintain reverse map for detokenization, ensure zero PII exposure in logs/context.

### Context
- **Original Plan:** [CO-2 Section](./mcp-improvement-plan-revised.md#co-2-pii-tokenization-layer-week-5-6)
- **Dependencies:** None
- **Expected Benefits:** GDPR/CCPA compliance + risk mitigation

### Implementation Details

**Technical Approach:**
1. Create `src/security/pii-tokenization.ts` with `PIITokenizer` class
2. Support 5 PII types:
   - Email addresses (regex-based detection)
   - Phone numbers (US format)
   - SSNs (XXX-XX-XXXX format)
   - Credit cards (16-digit format)
   - Names (basic pattern matching)
3. Maintain bidirectional token map for reversibility
4. Apply to test generation, test data, and all agent outputs
5. Document compliance process for audits

**Files to Create/Modify:**
- ✅ Create: `src/security/pii-tokenization.ts`
- ✅ Create: `src/agents/examples/generateWithPII.ts`
- ✅ Modify: `src/agents/qe-test-generator/index.ts` (add tokenization)
- ✅ Modify: All agents that handle test data
- ✅ Create: `tests/unit/pii-tokenization.test.ts`
- ✅ Create: `tests/integration/pii-compliance.test.ts`
- ✅ Create: `docs/compliance/pii-tokenization-gdpr-ccpa.md`

### Acceptance Criteria
- [ ] Tokenizer detects all 5 PII types with 99%+ accuracy
- [ ] Bidirectional tokenization (tokenize + detokenize)
- [ ] Zero PII exposure in logs (verified by audit)
- [ ] Zero PII exposure in model context (verified by inspection)
- [ ] Applied to all test generation workflows
- [ ] Unit tests achieve 90%+ coverage
- [ ] 1000+ PII samples tested successfully
- [ ] GDPR compliance documentation complete
- [ ] CCPA compliance documentation complete

### Success Metrics

**Security:**
- **PII Exposure in Logs:** 0 instances
- **PII Exposure in Model Context:** 0 instances
- **False Negative Rate:** <1% (missed PII)
- **False Positive Rate:** <5% (incorrectly tokenized non-PII)

**Compliance:**
- **GDPR:** Documented tokenization process
- **CCPA:** No PII in third-party systems
- **Audit Trail:** All PII operations logged

### Testing Requirements
```bash
# Unit tests
npm run test:unit -- pii-tokenization.test.ts

# Integration tests (1000+ samples)
npm run test:integration -- pii-compliance.test.ts

# Security audit
npm run security:audit -- pii-exposure
```

### References
- Original Plan: [docs/planning/mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md#co-2-pii-tokenization-layer-week-5-6)
- GDPR Requirements: https://gdpr.eu/
- CCPA Requirements: https://oag.ca.gov/privacy/ccpa
- Implementation Details: Lines 650-851 of revised plan

---

## Issue #5: [v1.9.0] SP-1: Docker Sandboxing - SOC2/ISO27001 Compliance

**Labels:** `enhancement`, `v1.9.0`, `high-priority`, `security`, `infrastructure`
**Phase:** Phase 3 - Security & Performance (Week 7-9)
**Effort:** 3 weeks
**ROI:** ⭐⭐⭐⭐

### Overview
Implement Docker-based sandbox infrastructure with cgroup limits for actual process isolation and resource enforcement (CPU, memory, disk, network).

**Problem:** Node.js resource monitoring is security theater—can't enforce limits, can't isolate processes.

**Solution:** Use Docker containers with cgroup limits for real isolation, enforcement, and SOC2/ISO27001 compliance.

### Context
- **Original Plan:** [SP-1 Section](./mcp-improvement-plan-revised.md#sp-1-docker-sandboxing-week-7-9)
- **Dependencies:** Docker installed on host
- **Expected Benefits:** SOC2/ISO27001 compliance + zero OOM crashes

### Implementation Details

**Technical Approach:**
1. Create `sandboxes/agent.Dockerfile` for agent containers
2. Implement `src/infrastructure/sandbox-manager.ts` with `SandboxManager` class
3. Configure cgroup limits per agent type:
   - CPU: 1-4 cores (enforced)
   - Memory: 1-4GB (enforced)
   - Disk: 512MB tmpfs (enforced)
   - Network: none/bridge (enforced)
4. Add health checks and automatic cleanup
5. Integrate with test execution and agent workflows

**Agent-Specific Limits:**
| Agent Type | CPU | Memory | Disk | Timeout |
|------------|-----|--------|------|---------|
| test-generator | 1 core | 1GB | 512MB | 60s |
| performance-tester | 4 cores | 4GB | 512MB | 600s |
| coverage-analyzer | 2 cores | 2GB | 512MB | 300s |
| Default | 2 cores | 2GB | 512MB | 300s |

**Files to Create/Modify:**
- ✅ Create: `sandboxes/agent.Dockerfile`
- ✅ Create: `src/infrastructure/sandbox-manager.ts`
- ✅ Modify: `src/agents/qe-test-executor/index.ts` (use sandboxes)
- ✅ Modify: All agents to support sandbox execution
- ✅ Create: `tests/unit/sandbox-manager.test.ts`
- ✅ Create: `tests/integration/sandbox-isolation.test.ts`
- ✅ Create: `docs/compliance/docker-sandbox-soc2-iso27001.md`

### Acceptance Criteria
- [ ] Docker containers enforce CPU limits (verified by stress test)
- [ ] Docker containers enforce memory limits (verified by OOM test)
- [ ] Docker containers enforce disk limits (verified by fill test)
- [ ] Docker containers enforce network isolation (verified by connection test)
- [ ] Health checks detect unhealthy containers
- [ ] Automatic cleanup after timeout
- [ ] Applied to test execution workflow
- [ ] Unit tests achieve 90%+ coverage
- [ ] Zero OOM crashes in 7-day test
- [ ] SOC2 compliance documentation complete
- [ ] ISO27001 compliance documentation complete

### Success Metrics

**Security:**
- **Zero OOM Crashes:** Enforced by cgroup memory limits
- **100% Process Isolation:** Enforced by Docker
- **CPU Limits Enforced:** Enforced by cgroup CPU quotas
- **Network Isolation Enforced:** Enforced by Docker network mode

**Compliance:**
- **SOC2:** Process isolation documented
- **ISO27001:** Resource controls documented
- **Audit Trail:** All sandbox operations logged

### Testing Requirements
```bash
# Unit tests
npm run test:unit -- sandbox-manager.test.ts

# Integration tests (stress testing)
npm run test:integration -- sandbox-isolation.test.ts

# Security audit
npm run security:audit -- sandbox-enforcement
```

### References
- Original Plan: [docs/planning/mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md#sp-1-docker-sandboxing-week-7-9)
- Docker Resource Limits: https://docs.docker.com/config/containers/resource_constraints/
- Implementation Details: Lines 854-1176 of revised plan

---

## Issue #6: [v1.9.0] SP-2: Embedding Cache - 10x Faster Semantic Search

**Labels:** `enhancement`, `v1.9.0`, `medium-priority`, `performance`, `learning`
**Phase:** Phase 3 - Security & Performance (Week 10-11)
**Effort:** 2 weeks
**ROI:** ⭐⭐⭐

### Overview
Implement embedding cache with 24-hour TTL to reduce embedding generation latency by 90% (500ms → 50ms on cache hit).

**Problem:** Embedding generation for semantic search is slow (500ms per operation), slowing down pattern retrieval and recommendations.

**Solution:** Cache embeddings with content hash keys and 24-hour TTL, achieving 80-90% cache hit rate on repeated searches.

### Context
- **Original Plan:** [SP-2 Section](./mcp-improvement-plan-revised.md#sp-2-embedding-cache-week-10-11)
- **Dependencies:** AgentDB for embedding generation
- **Expected Benefits:** 10x faster semantic search + reduced LLM API calls

### Implementation Details

**Technical Approach:**
1. Create `src/utils/embedding-cache.ts` with `EmbeddingCache` class
2. Cache embeddings keyed by content SHA-256 hash
3. Implement 24-hour TTL with automatic pruning
4. Track statistics (hits, misses, avg latency)
5. Integrate with AgentDB semantic search
6. Support batch embedding operations

**Files to Create/Modify:**
- ✅ Create: `src/utils/embedding-cache.ts`
- ✅ Modify: `src/learning/PatternStorage.ts` (add caching)
- ✅ Modify: `src/agents/qe-recommendation-engine/index.ts` (add caching)
- ✅ Create: `tests/unit/embedding-cache.test.ts`
- ✅ Create: `tests/integration/cache-performance.test.ts`

### Acceptance Criteria
- [ ] Cache handles 1000+ embeddings without errors
- [ ] Content hashing correctly detects changes
- [ ] 24-hour TTL enforced with auto-pruning
- [ ] Statistics tracking (hits, misses, latency)
- [ ] Applied to all semantic search operations
- [ ] Unit tests achieve 90%+ coverage
- [ ] 7-day monitoring shows 80-90% cache hit rate
- [ ] Latency reduction verified: 500ms → 50ms on hit

### Success Metrics

**Performance:**
- **Cache Hit Rate:** 80-90% (for repeated searches)
- **Embedding Latency:** 500ms → 50ms on cache hit (10x faster)
- **Annual Savings:** Reduced LLM API calls for embedding generation

**Quality:**
| Scenario | Latency | Speedup |
|----------|---------|---------|
| Cold cache (miss) | 500ms | 1x (baseline) |
| Warm cache (hit) | 50ms | 10x faster |
| Batch (10 items, 90% hit) | 550ms | 9x faster |

### Testing Requirements
```bash
# Unit tests
npm run test:unit -- embedding-cache.test.ts

# Performance benchmarks (1000+ lookups)
npm run benchmark -- embedding-cache-performance

# 7-day cache monitoring
npm run monitor -- embedding-cache-hit-rate
```

### References
- Original Plan: [docs/planning/mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md#sp-2-embedding-cache-week-10-11)
- AgentDB Documentation: https://github.com/ruvnet/agentdb
- Implementation Details: Lines 1186-1305 of revised plan

---

## Issue #7: [v1.9.0] SP-3: Network Policy Enforcement - Security Compliance

**Labels:** `enhancement`, `v1.9.0`, `medium-priority`, `security`, `infrastructure`
**Phase:** Phase 3 - Security & Performance (Week 12)
**Effort:** 1 week
**ROI:** ⭐⭐⭐

### Overview
Implement network policy enforcement to whitelist allowed domains and enforce rate limits per agent type via Docker network policies.

**Problem:** Agents may make unauthorized network requests, creating security and compliance risks.

**Solution:** Whitelist allowed domains per agent type, enforce via Docker custom bridge networks with DNS restrictions.

### Context
- **Original Plan:** [SP-3 Section](./mcp-improvement-plan-revised.md#sp-3-network-policy-enforcement-week-12)
- **Dependencies:** SP-1 (Docker Sandboxing)
- **Expected Benefits:** 100% network request auditing + zero unauthorized requests

### Implementation Details

**Technical Approach:**
1. Create `src/infrastructure/network-policy.ts` with agent-specific whitelists
2. Define network policies per agent type:
   - test-generator: api.anthropic.com, registry.npmjs.org
   - coverage-analyzer: api.anthropic.com
   - Default: api.anthropic.com only
3. Implement rate limiting (requests per minute/hour)
4. Create custom Docker bridge networks with DNS restrictions
5. Log all network requests for auditing

**Network Policies:**
| Agent Type | Allowed Domains | Rate Limit (rpm/rph) |
|------------|-----------------|---------------------|
| test-generator | api.anthropic.com, registry.npmjs.org | 60/1000 |
| coverage-analyzer | api.anthropic.com | 30/500 |
| Default | api.anthropic.com | 30/500 |

**Files to Create/Modify:**
- ✅ Create: `src/infrastructure/network-policy.ts`
- ✅ Modify: `src/infrastructure/sandbox-manager.ts` (add network enforcement)
- ✅ Create: `tests/unit/network-policy.test.ts`
- ✅ Create: `tests/integration/network-enforcement.test.ts`

### Acceptance Criteria
- [ ] Network policies defined for all agent types
- [ ] Docker custom bridge networks created per agent
- [ ] Unauthorized domains blocked (verified by connection test)
- [ ] Rate limits enforced (verified by load test)
- [ ] All network requests logged for auditing
- [ ] Unit tests achieve 90%+ coverage
- [ ] Integration tests verify 100% enforcement
- [ ] Documentation includes audit procedures

### Success Metrics

**Security:**
- **100% Network Request Auditing:** All requests logged
- **0 Unauthorized Domain Requests:** Blocked by Docker network
- **Rate Limit Violations:** Logged and blocked

**Compliance:**
- **Audit Trail:** Complete network request history
- **Policy Enforcement:** 100% compliance in 7-day test
- **Incident Response:** Automated alerts on violations

### Testing Requirements
```bash
# Unit tests
npm run test:unit -- network-policy.test.ts

# Integration tests (unauthorized requests)
npm run test:integration -- network-enforcement.test.ts

# Security audit
npm run security:audit -- network-policy-violations
```

### References
- Original Plan: [docs/planning/mcp-improvement-plan-revised.md](./mcp-improvement-plan-revised.md#sp-3-network-policy-enforcement-week-12)
- Docker Networking: https://docs.docker.com/network/
- Implementation Details: Lines 1308-1386 of revised plan

---

## Summary & Prioritization

### Phase 1 - Quick Wins (Week 1-2): $43,470/year savings
1. **QW-1: Client-Side Data Filtering** - ⭐⭐⭐⭐⭐ (Highest ROI)
   - 99% token reduction on 6 high-volume operations
   - $108,030/year savings
   - 1 week effort

2. **QW-2: Batch Tool Operations** - ⭐⭐⭐⭐⭐ (Highest ROI)
   - 80% API call reduction
   - 3-5x faster responses
   - 1 week effort

### Phase 2 - Cost Optimization (Week 3-6): $19,710/year savings
3. **CO-1: Prompt Caching Infrastructure** - ⭐⭐⭐⭐
   - 60% cost reduction on system prompts
   - $19,710/year savings
   - 2 weeks effort

4. **CO-2: PII Tokenization Layer** - ⭐⭐⭐⭐
   - GDPR/CCPA compliance
   - Zero PII exposure
   - 2 weeks effort

### Phase 3 - Security & Performance (Week 7-12): Compliance + 10x speedup
5. **SP-1: Docker Sandboxing** - ⭐⭐⭐⭐
   - SOC2/ISO27001 compliance
   - Zero OOM crashes
   - 3 weeks effort

6. **SP-2: Embedding Cache** - ⭐⭐⭐
   - 10x faster semantic search
   - 90% latency reduction
   - 2 weeks effort

7. **SP-3: Network Policy Enforcement** - ⭐⭐⭐
   - 100% network auditing
   - Security compliance
   - 1 week effort

### Total Impact
- **Annual Cost Savings:** $90,520/year (64% reduction)
- **Performance Improvements:** 10x faster operations
- **Compliance:** GDPR/CCPA + SOC2/ISO27001 readiness
- **Timeline:** 12 weeks (3 months)
- **Effort:** 12 person-weeks total

---

## Implementation Notes

### Creating GitHub Issues
Use the GitHub CLI to create these issues:

```bash
# Install gh CLI
brew install gh  # macOS
# or: sudo apt install gh  # Linux

# Authenticate
gh auth login

# Create issues from this file
# (manually copy each issue section above)

# Example for Issue #1:
gh issue create \
  --title "[v1.9.0] QW-1: Client-Side Data Filtering - 99% Token Reduction" \
  --body "$(cat docs/planning/github-issues-v1.9.0.md | sed -n '/^## Issue #1/,/^## Issue #2/p')" \
  --label "enhancement,v1.9.0,high-priority,performance,mcp"

# Repeat for all 7 issues
```

### Milestone Setup
Create v1.9.0 milestone on GitHub:
- **Title:** v1.9.0 - MCP Performance Optimization
- **Due Date:** 2025-02-15 (12 weeks from now)
- **Description:** 64% cost reduction ($90,520/year) + SOC2/ISO27001 compliance

### Project Board
Organize issues on GitHub Projects:
- **Column 1:** Phase 1 - Quick Wins (QW-1, QW-2)
- **Column 2:** Phase 2 - Cost Optimization (CO-1, CO-2)
- **Column 3:** Phase 3 - Security & Performance (SP-1, SP-2, SP-3)

---

**Document Version:** 1.0
**Generated By:** AQE Backend API Developer Agent
**Review Status:** Ready for GitHub issue creation
**Next Action:** Use `gh issue create` to create all 7 issues
