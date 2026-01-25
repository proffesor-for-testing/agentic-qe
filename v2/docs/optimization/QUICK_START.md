# Skill Optimization Quick Start Guide

## 5-Minute Overview

This framework optimizes 41 Agentic QE skills for Claude 4.5, achieving **40-50% token reduction**.

## Instant Commands

```bash
# Validate one skill
npm run validate-skill .claude/skills/performance-testing/SKILL.md

# Validate all 41 skills
npm run validate-all-skills

# Generate detailed report
npm run optimize:report
```

## The Optimization Formula

### 1. Add YAML Frontmatter (~80 tokens)
```yaml
---
name: skill-name
category: specialized-testing
priority: high
tokenEstimate: 1300
agents: [qe-agent-1]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
---
```

### 2. Insert Action-First Block (100-200 tokens)
```markdown
<default_to_action>
When [context]:
1. ACTION: Step with outcome
2. ACTION: Step with validation
3. ACTION: Step with completion

**Quick Decision Matrix:**
- Scenario A → Action X
- Scenario B → Action Y

**Critical Success Factors:**
- Factor 1: Measurable criterion
- Factor 2: Observable outcome
</default_to_action>
```

### 3. Add Quick Reference Card (200-400 tokens)
```markdown
## Quick Reference Card

### When to Use
- Trigger 1
- Trigger 2

### Key Actions
1. Action with outcome
2. Validation with criteria

### Tools Selection
| Tool | Use Case | Complexity |
|------|----------|------------|
| Tool A | Scenario X | Low |

### Success Criteria
✅ Metric 1: Target value
❌ Anti-pattern 1: What to avoid

### Agent Coordination
- `agent-1`: Primary role
- `agent-2`: Supporting role
```

### 4. Add Agent Coordination (150-250 tokens)
```markdown
## Agent Coordination Hints

### Memory Namespace
Store data in: `aqe/{category}/{skill-name}/{data-type}`

### Coordination Flow
1. **Agent 1** → Primary action, store results
2. **Agent 2** → Retrieve results, analyze
3. **Agent 3** → Make decision

### Blackboard Patterns
Post to: `{category}/{event-type}` with priority `high`
```

### 5. Compress Core Content (300-500 tokens)
```markdown
## Core Concepts

### Concept 1
**Definition:** Clear, 1-2 sentence explanation.

**Key Points:**
- Point 1 with measurable aspect
- Point 2 with observable outcome

**Example:**
```language
// Minimal, focused code
const result = operation();
```
```

## Token Savings Breakdown

| Section | Before | After | Savings |
|---------|--------|-------|---------|
| Introduction | 400 | 80 | **80%** |
| Core Content | 1,800 | 1,080 | **40%** |
| Examples | 300 | 210 | **30%** |
| Agent Integration | 0 | 150 | +150 |
| **Total** | **2,600** | **1,300** | **50%** |

## Validation Checklist

Run this before marking as `optimized`:

```bash
npm run validate-skill .claude/skills/my-skill/SKILL.md
```

**Must Pass:**
- [ ] YAML frontmatter complete
- [ ] `<default_to_action>` present
- [ ] Quick reference card included
- [ ] Agent coordination section added
- [ ] Token count ≤ 1,500
- [ ] All agents from manifest listed
- [ ] Implementation status = `optimized`

## Common Errors & Fixes

### "Missing frontmatter"
```yaml
# Add YAML block at top of file
---
name: skill-name
category: specialized-testing
priority: high
tokenEstimate: 1300
agents: [qe-agent-1]
implementation_status: optimized
---
```

### "Missing <default_to_action>"
```markdown
# Add after frontmatter, before ## heading
<default_to_action>
When requested:
1. ACTION: Clear step
2. ACTION: Validation
3. ACTION: Completion
</default_to_action>
```

### "Token limit exceeded"
Apply compression techniques:
- Convert paragraphs → bullet lists
- Use tables for comparisons
- Remove verbose explanations
- Consolidate redundant sections

## Example: Before vs After

### Before (2,600 tokens)
```markdown
# Performance Testing

## Why Performance Testing Matters

Performance is not just about speed - it's a fundamental quality attribute that directly impacts user satisfaction, conversion rates, and business outcomes. Research has consistently shown that even small delays can have significant consequences...

### User Impact
When we talk about user impact, we're referring to how performance affects the end-user experience. Studies by Amazon have demonstrated that every 100 milliseconds of delay results in approximately 1% drop in conversion rates...
```

### After (1,300 tokens - 50% reduction)
```markdown
---
name: performance-testing
category: specialized-testing
priority: high
tokenEstimate: 1300
agents: [qe-performance-tester]
implementation_status: optimized
---

# Performance Testing

<default_to_action>
When performance testing requested:
1. IDENTIFY critical paths (checkout, search, APIs)
2. DEFINE SLOs: p95 < 200ms, throughput > 10K req/min
3. SELECT test type: Load → Stress → Spike → Endurance
4. RUN k6/JMeter with realistic scenarios
5. MONITOR: Response time, throughput, errors, resources
6. ANALYZE bottlenecks: DB, N+1, sync ops, memory, cache
7. REPORT with baselines and trends
</default_to_action>

## Quick Reference Card

**Impact:** 100ms delay = 1% conversion drop (Amazon)

### Test Types
- **Load:** Expected traffic → Before releases
- **Stress:** Beyond capacity → Find breaking point
- **Spike:** Sudden surge → Test auto-scaling
- **Endurance:** 24-72h → Memory leaks
```

## 3-Step Quick Optimization

For fastest optimization of a single skill:

### Step 1: Copy Template (30 seconds)
```bash
# View optimized template
cat docs/templates/optimized-skill-template.md
```

### Step 2: Extract & Compress (10 minutes)
- Copy essential content from original skill
- Apply compression patterns (bullets, tables)
- Add action-first directives
- Create quick reference card

### Step 3: Validate & Test (5 minutes)
```bash
# Validate structure
npm run validate-skill .claude/skills/my-skill/SKILL.md

# Test with agent
Task("Test skill", "Execute with new format", "qe-agent-name")
```

**Total Time: ~15 minutes per skill**

## Priority Order

### Week 1: Critical (2 skills)
```
1. agentic-quality-engineering
2. holistic-testing-pact
```

### Week 2: High Priority (12 skills)
```
3. tdd-london-chicago
4. api-testing-patterns
5. cicd-pipeline-qe-orchestrator
... (9 more)
```

### Weeks 3-5: Medium & Low (27 skills)

## Success Metrics

**Current State:**
- Total Skills: 41
- Optimized: 0
- Baseline Tokens: ~90,000

**Target State:**
- Optimized: 41 (100%)
- Final Tokens: ~49,500
- Reduction: 45% (40,500 tokens saved)

## Resources

- **Detailed Patterns:** [claude-4-5-patterns.md](./claude-4-5-patterns.md)
- **Full Template:** [optimized-skill-template.md](../templates/optimized-skill-template.md)
- **Complete Guide:** [README.md](./README.md)

## Next Steps

1. **Read patterns guide** (10 min): `docs/optimization/claude-4-5-patterns.md`
2. **Review template** (5 min): `docs/templates/optimized-skill-template.md`
3. **Optimize first skill** (15 min): Start with `agentic-quality-engineering`
4. **Validate & iterate** (5 min): Use validation script
5. **Test with agent** (2 min): Ensure functionality

**Total: ~37 minutes to first optimized skill**

---

**Framework Version:** 1.0.0
**Ready to optimize all 41 skills for 40-50% token reduction**
