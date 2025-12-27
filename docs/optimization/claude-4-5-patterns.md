# Claude 4.5 Skill Optimization Patterns

## Executive Summary

This guide defines best practices for optimizing Agentic QE skills for Claude 4.5, targeting **40-50% token reduction** while improving agent coordination and maintaining quality.

**Key Achievements:**
- Token reduction: 40-50% target (e.g., 2,600 → 1,300-1,560 tokens)
- Improved agent coordination through structured hints
- Enhanced Claude 4.5 action-first directive patterns
- Standardized metadata and implementation tracking

---

## Core Optimization Principles

### 1. Action-First Directive Pattern

Claude 4.5 excels with immediate, actionable directives at the top of skills.

#### ❌ Before (Token-Heavy)
```markdown
# Performance Testing

## Why Performance Testing Matters

Performance is a feature, not an afterthought. Modern users expect...

### User Impact
- 100ms delay = 1% drop in conversions
- 53% of mobile users abandon...

## Types of Performance Testing

### 1. Load Testing
What: System behavior under expected load...
```

#### ✅ After (Action-First)
```markdown
# Performance Testing

<default_to_action>
When performance testing is requested:
1. IDENTIFY critical paths (checkout, search, APIs)
2. DEFINE SLOs: p95 response time, throughput, error rate
3. SELECT test type: Load (typical usage) → Stress (breaking point) → Spike (sudden surge) → Endurance (24h+)
4. RUN k6/JMeter with realistic scenarios (user journeys, think time, varied data)
5. MONITOR: Response time percentiles, throughput, errors, CPU/memory/DB
6. ANALYZE bottlenecks: Database (indexes, N+1 queries), Sync ops, Memory leaks, Caching gaps
7. REPORT with baselines and trends

**Quick Decision Matrix:**
- Before release → Load + Stress tests
- Infrastructure change → Scalability test
- Major event → Spike test
- New features → Endurance test (24-72h)
</default_to_action>

## Performance Test Types

**Load Testing**: Expected traffic (e.g., 1K users, 10K req/min)
**Stress Testing**: Beyond capacity → find breaking point
**Spike Testing**: Sudden surge (Black Friday, viral posts)
**Endurance/Soak**: 24-72h → detect memory leaks
**Scalability**: Validate horizontal/vertical scaling
```

**Benefits:**
- Immediate actionable guidance (Claude starts working instantly)
- 60-70% token reduction in introductory content
- Critical decision points highlighted
- Clear workflow progression

---

### 2. Structured Output Templates

Use YAML frontmatter and structured sections for efficient parsing.

#### Metadata Block (YAML Frontmatter)
```yaml
---
name: performance-testing
category: specialized-testing
priority: high
tokenEstimate: 1300
agents: [qe-performance-tester]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: [agentic-quality-engineering]
quick_reference_card: true
---
```

**Required Fields:**
- `name`: Skill identifier (kebab-case)
- `category`: From skills-manifest.json
- `priority`: critical | high | medium | low
- `tokenEstimate`: Target after optimization
- `agents`: Array of associated QE agents
- `implementation_status`: draft | baseline | optimized | production
- `optimization_version`: Semantic version
- `last_optimized`: ISO date
- `dependencies`: Required skills
- `quick_reference_card`: Boolean (must be true for optimized skills)

---

### 3. Token Compression Techniques

#### A. Remove Verbose Explanations
```markdown
❌ Before (256 tokens):
## Why Performance Testing Matters

### User Impact
Performance directly affects user experience and business metrics. Research shows that 100ms delay leads to 1% drop in conversions according to Amazon's studies. Google research indicates 53% of mobile users abandon sites taking more than 3 seconds to load. From a user's perspective, slow equals broken.

✅ After (64 tokens):
**Impact**: 100ms delay = 1% conversion drop (Amazon). 53% abandon sites >3s (Google). Slow = Broken.
```

**Reduction:** 75% token savings

#### B. Use Tables for Dense Information
```markdown
❌ Before (180 tokens):
**k6**: Modern, developer-friendly, JavaScript-based load testing tool. Good for CI/CD integration and API testing. Has a low learning curve.

**JMeter**: Mature, feature-rich, GUI-based load testing tool. Good for complex scenarios and extensive protocol support. Has a medium learning curve.

✅ After (72 tokens):
| Tool | Best For | Learning Curve |
|------|----------|----------------|
| k6 | CI/CD, APIs, modern workflows | Low |
| JMeter | Complex scenarios, GUI | Medium |
| Gatling | High load, detailed metrics | Medium |
```

**Reduction:** 60% token savings

#### C. Consolidate Redundant Content
```markdown
❌ Before (320 tokens):
### 1. Load Testing
What: System behavior under expected load
Goal: Verify the system handles typical usage
Example: E-commerce site handling 1,000 concurrent users
When: Before every major release

### 2. Stress Testing
What: System behavior under extreme load
Goal: Find breaking point, see how system fails
Example: Ramping up from 1,000 to 10,000 users
When: Before scaling infrastructure

✅ After (128 tokens):
**Test Types:**
- **Load**: Expected traffic (1K users) → Before releases
- **Stress**: Beyond capacity (1K→10K users) → Find breaking point
- **Spike**: Sudden surge (Black Friday) → Test auto-scaling
- **Endurance**: 24-72h at normal load → Memory leaks
```

**Reduction:** 60% token savings

---

### 4. Quick Reference Card Format

Every optimized skill must include a quick reference card for rapid agent coordination.

```markdown
## Quick Reference Card

### When to Use
- Planning load testing strategy
- Investigating performance issues
- Setting performance baselines
- Optimizing system bottlenecks

### Key Actions
1. Define SLOs (p95 < 200ms, throughput > 10K req/min, error < 0.1%)
2. Identify critical paths (revenue flows, high-traffic pages)
3. Run appropriate test type (Load/Stress/Spike/Endurance)
4. Monitor: Response time percentiles, throughput, errors, resources
5. Analyze bottlenecks (DB, N+1, sync ops, memory, cache)
6. Report with baselines and trends

### Tools Selection
- **k6**: Modern CI/CD, APIs (Low learning curve)
- **JMeter**: Complex scenarios, GUI (Medium)
- **Gatling**: High load, reporting (Medium)

### Common Bottlenecks
- **Database**: Missing indexes, N+1 queries, connection pool exhaustion
- **Synchronous**: Blocking operations in request path (use queues)
- **Memory Leaks**: Event listeners, unbounded caches, circular refs
- **Caching**: Under-utilized or misconfigured

### Pass/Fail Criteria
✅ p95 < target, error rate < 0.1%, CPU < 70%, memory < 80%
❌ Response time > 2x target, error rate > 1%, resources maxed

### Agent Coordination
- `qe-performance-tester`: Orchestrates load testing and analysis
- `qe-quality-analyzer`: Interprets results and trends
- `qe-production-intelligence`: Compares to production baselines
```

**Benefits:**
- 200-400 token quick scan section
- Enables rapid agent decision-making
- Provides context for fleet coordination
- Clear pass/fail criteria

---

## Agent Integration Patterns

### Coordination Hints Section

```markdown
## Agent Coordination Hints

### Memory Namespace
Store performance data in: `aqe/performance/{test-type}/{timestamp}`

**Schema:**
```json
{
  "testType": "load|stress|spike|endurance",
  "target": "https://api.example.com",
  "duration": "5m",
  "virtualUsers": 100,
  "results": {
    "p50": 120,
    "p95": 180,
    "p99": 250,
    "errorRate": 0.003,
    "throughput": 5420
  },
  "bottlenecks": ["database:slow-query:orders.user_id"],
  "recommendations": ["Add index on orders.user_id"]
}
```

### Coordination Flow
1. **qe-performance-tester** → Run tests, store results in memory
2. **qe-quality-analyzer** → Retrieve results, analyze trends
3. **qe-production-intelligence** → Compare to production baselines
4. **qe-deployment-readiness** → Go/no-go decision based on thresholds

### Blackboard Patterns
Post to: `performance/test-completed` with priority `high`
Subscribe to: `quality/gate-evaluation` for deployment decisions

### Cross-Agent Dependencies
- Requires: `agentic-quality-engineering` (foundational PACT principles)
- Complements: `api-testing-patterns` (for API performance testing)
- Informs: `quality-metrics` (for dashboard integration)
```

---

## Implementation Status Metadata

Track optimization progress with implementation status:

```yaml
implementation_status: optimized
optimization_details:
  baseline_tokens: 2600
  optimized_tokens: 1300
  reduction_percent: 50
  optimization_date: 2025-12-02
  optimizer: "claude-sonnet-4-5"
  validation_status: "passed"
  agent_tested: [qe-performance-tester]
```

**Status Levels:**
- `draft`: Initial creation, not production-ready
- `baseline`: Original version before optimization
- `optimized`: Underwent Claude 4.5 optimization
- `production`: Validated with real agents, battle-tested

---

## Optimization Workflow

### Phase 1: Baseline Analysis
```bash
# Count tokens in original skill
npm run count-tokens .claude/skills/performance-testing/SKILL.md

# Record baseline
Baseline: 2,600 tokens
Target: 1,300-1,560 tokens (40-50% reduction)
```

### Phase 2: Apply Patterns
1. **Add YAML frontmatter** with metadata
2. **Insert `<default_to_action>` block** at top
3. **Create quick reference card**
4. **Compress verbose sections**:
   - Convert paragraphs to bullet lists
   - Use tables for comparisons
   - Remove redundant explanations
5. **Add agent coordination section**
6. **Update implementation_status**

### Phase 3: Validation
```bash
# Validate structure
npm run validate-skill .claude/skills/performance-testing/SKILL.md

# Test with agent
Task("Performance test", "Run load test on staging API", "qe-performance-tester")
```

### Phase 4: Metrics Collection
```yaml
optimization_metrics:
  before: 2600 tokens
  after: 1300 tokens
  reduction: 50%
  validation_passed: true
  agent_feedback: "Excellent clarity, immediate action guidance"
```

---

## Token Reduction Strategies by Section

### Introduction (Target: 80% reduction)
**Before:** 400 tokens of philosophy and context
**After:** 50-80 tokens in `<default_to_action>` block

### Core Content (Target: 40% reduction)
**Before:** 1,800 tokens with verbose explanations
**After:** 1,080 tokens with tables, lists, and structured formats

### Examples (Target: 30% reduction)
**Before:** 300 tokens with full code blocks
**After:** 210 tokens with minimal, essential examples

### Agent Integration (NEW: +150 tokens)
**Added:** Agent coordination hints, memory schemas, fleet patterns

**Net Result:** 2,600 → 1,300 tokens (50% reduction)

---

## Quality Assurance Checklist

Before marking a skill as `optimized`, verify:

- [ ] YAML frontmatter present with all required fields
- [ ] `<default_to_action>` block at top (100-200 tokens)
- [ ] Quick reference card section included
- [ ] Agent coordination hints section present
- [ ] Token estimate ≤ baseline × 0.6 (40%+ reduction)
- [ ] All agents from manifest referenced
- [ ] Dependencies listed correctly
- [ ] Implementation status updated
- [ ] Tested with at least one agent
- [ ] Cross-references to related skills updated

---

## Anti-Patterns to Avoid

### ❌ Over-Compression
```markdown
**Bad:** Load test: sys behavior @ expected load. Run b4 release.
```
**Issue:** Loses clarity, becomes cryptic

**Better:** Load Testing: System behavior under expected traffic (1K users). Run before releases.

### ❌ Removing Critical Context
```markdown
**Bad:** p95 < 200ms
```
**Issue:** No explanation of why or when

**Better:** **SLO:** p95 response time < 200ms (95% of requests complete in under 200ms)

### ❌ Eliminating Examples
```markdown
**Bad:** Use k6 for load testing.
```
**Issue:** No guidance on how

**Better:**
```javascript
// k6 load test example
export const options = {
  stages: [{ duration: '1m', target: 50 }],
  thresholds: { http_req_duration: ['p(95)<200'] }
};
```

---

## Template Usage Guidelines

### Selecting the Right Template

**New Skill (from scratch):**
```bash
cp docs/templates/optimized-skill-template.md .claude/skills/my-new-skill/SKILL.md
# Fill in all sections
```

**Optimizing Existing Skill:**
```bash
# 1. Read original skill
# 2. Extract core content
# 3. Apply optimization patterns from this guide
# 4. Validate with script
npm run validate-skill .claude/skills/my-skill/SKILL.md
```

---

## Metrics Dashboard

Track optimization progress:

```yaml
fleet_optimization_status:
  total_skills: 41
  optimized: 0
  in_progress: 0
  baseline: 41

  target_reduction: 45%  # (40-50% range midpoint)

  token_savings:
    estimated_before: 90000  # 41 skills × ~2200 avg
    estimated_after: 49500   # 45% reduction
    savings: 40500 tokens

  priority_order:
    critical: [agentic-quality-engineering, holistic-testing-pact]
    high: [tdd-london-chicago, api-testing-patterns, cicd-pipeline-qe-orchestrator, ...]
    medium: [security-testing, performance-testing, ...]
    low: [consultancy-practices, technical-writing]
```

---

## Advanced Patterns

### Conditional Content Loading
```markdown
<default_to_action>
**Quick Start:**
For rapid testing → See [Quick Reference Card](#quick-reference-card)
For comprehensive strategy → See [Detailed Methodology](#detailed-methodology)
For troubleshooting → See [Common Issues](#common-issues)
</default_to_action>
```

### Cross-Skill References
```markdown
## Related Skills
**Prerequisites:** [agentic-quality-engineering](../agentic-quality-engineering/) (PACT principles)
**Complements:** [api-testing-patterns](../api-testing-patterns/) (API performance)
**Informs:** [quality-metrics](../quality-metrics/) (dashboard integration)
```

### Versioned Optimization
```yaml
optimization_history:
  - version: 1.0
    date: 2025-12-02
    tokens: 1300
    reduction: 50%
    notes: "Initial Claude 4.5 optimization"
  - version: 0.9
    date: 2025-11-15
    tokens: 2600
    notes: "Baseline before optimization"
```

---

## Success Metrics

**Target Achievement:**
- ✅ 40-50% token reduction across all 41 skills
- ✅ <300ms agent skill loading time
- ✅ 100% skills have quick reference cards
- ✅ Zero quality regression in agent effectiveness
- ✅ Improved coordination through structured hints

**Validation Methods:**
1. **Token Counting:** Automated script validation
2. **Agent Testing:** Real agent execution with optimized skills
3. **Coordination Flow:** Multi-agent workflows with memory sharing
4. **User Feedback:** Manual review of optimization quality

---

## References

- **Claude 4.5 Best Practices:** Action-first directives, structured output
- **Skills Manifest:** `/workspaces/agentic-qe-cf/.claude/skills/skills-manifest.json`
- **Validation Script:** `/workspaces/agentic-qe-cf/scripts/validate-skill-optimization.ts`
- **Template:** `/workspaces/agentic-qe-cf/docs/templates/optimized-skill-template.md`

---

**Document Version:** 1.0
**Last Updated:** 2025-12-02
**Maintained By:** Agentic QE Fleet Architecture Team
