# Skill Optimization Framework for Claude 4.5

## Overview

This framework enables systematic optimization of all 41 Agentic QE skills for Claude 4.5, targeting **40-50% token reduction** while improving agent coordination and maintaining quality.

## Quick Start

### Validate a Single Skill
```bash
npm run validate-skill .claude/skills/performance-testing/SKILL.md
```

### Validate All Skills
```bash
npm run validate-all-skills
```

### Generate Optimization Report
```bash
npm run optimize:report
```

## Framework Components

### 1. Claude 4.5 Patterns Guide
**Location:** [`claude-4-5-patterns.md`](./claude-4-5-patterns.md)

Comprehensive guide covering:
- Action-first directive patterns (`<default_to_action>`)
- Token compression techniques (60-75% reduction strategies)
- Structured output templates
- Quick reference card format
- Agent coordination patterns
- Implementation status tracking

**Key Techniques:**
- Remove verbose explanations → 75% token savings
- Use tables for dense information → 60% savings
- Consolidate redundant content → 60% savings
- Add action-first directives → Immediate agent guidance

### 2. Optimized Skill Template
**Location:** [`../templates/optimized-skill-template.md`](../templates/optimized-skill-template.md)

Standardized template with:
- YAML frontmatter (metadata, agents, dependencies)
- `<default_to_action>` block (100-200 tokens)
- Quick reference card section (200-400 tokens)
- Agent coordination hints with memory schemas
- Compressed core content
- Structured examples

**Token Budget:**
- YAML frontmatter: ~80 tokens
- `<default_to_action>`: 100-200 tokens
- Quick reference card: 200-400 tokens
- Core concepts: 300-500 tokens
- Implementation patterns: 200-400 tokens
- Agent coordination: 150-250 tokens
- Examples: 150-300 tokens
- **Total target:** 1,200-1,500 tokens

### 3. Validation Script
**Location:** [`../../scripts/validate-skill-optimization.ts`](../../scripts/validate-skill-optimization.ts)

Automated validation checking:
- ✅ YAML frontmatter completeness
- ✅ Required sections (`<default_to_action>`, quick reference, agent coordination)
- ✅ Token estimates (target: ≤1,500 tokens)
- ✅ Agent associations match manifest
- ✅ Implementation status accuracy
- ✅ Cross-references to dependencies

**Features:**
- Single skill or full fleet validation
- Optimization metrics (before/after comparison)
- Error reporting with severity levels
- Warning generation for improvement opportunities
- Detailed reports with actionable insights

## Optimization Workflow

### Phase 1: Baseline Analysis
```bash
# Validate current state of all skills
npm run validate-all-skills

# Review baseline metrics
# Total Skills: 41
# Baseline: 41 (needs optimization)
# Estimated baseline tokens: ~90,000
```

### Phase 2: Apply Optimization Patterns

For each skill:

1. **Read existing skill**
   ```bash
   cat .claude/skills/performance-testing/SKILL.md
   ```

2. **Apply optimization patterns**
   - Add YAML frontmatter with metadata
   - Insert `<default_to_action>` block at top
   - Create quick reference card section
   - Compress verbose sections (paragraphs → bullets, tables)
   - Add agent coordination hints
   - Update implementation_status to `optimized`

3. **Validate optimized skill**
   ```bash
   npm run validate-skill .claude/skills/performance-testing/SKILL.md
   ```

4. **Test with actual agent**
   ```typescript
   Task("Performance test", "Run load test on API", "qe-performance-tester")
   ```

### Phase 3: Validation & Testing

```bash
# Full validation report
npm run optimize:report

# Expected output:
# ✅ Optimized: 1/41
# Token Savings: 1,300 tokens saved
# Average Reduction: 50%
# Target (45%): ✅ TARGET MET
```

### Phase 4: Quality Gates

Before marking as `production`:
- [ ] All validation errors resolved
- [ ] Token reduction ≥40% from baseline
- [ ] Quick reference card present
- [ ] Agent coordination section complete
- [ ] Tested with at least one agent
- [ ] Cross-references updated
- [ ] Implementation status accurate

## Validation Output Examples

### Single Skill Validation
```bash
$ npm run validate-skill .claude/skills/performance-testing/SKILL.md

✅ PASSED performance-testing
  Path: /workspaces/agentic-qe-cf/.claude/skills/performance-testing/SKILL.md
  Status: optimized
  Tokens: 1,300 (Target: ≤1,500)
  Reduction: 50.0% from baseline (2,600 tokens)

  Sections:
    YAML Frontmatter: ✅
    <default_to_action>: ✅
    Quick Reference Card: ✅
    Agent Coordination: ✅
    Core Content: ✅
    Examples: ✅
    Related Skills: ✅
```

### Full Fleet Report
```bash
$ npm run validate-all-skills

================================================================================
SKILL OPTIMIZATION REPORT
================================================================================

Total Skills: 41
  ✅ Optimized: 5
  📝 Baseline: 35
  ⚠️  Draft: 1

Optimization Progress: 12.2%

Token Savings: 6,500 tokens saved
Average Reduction: 48.3%
Target (45%): ✅ TARGET MET

Top Optimizations:
  1. performance-testing: 50.0% reduction
  2. testability-scoring: 48.5% reduction
  3. api-testing-patterns: 47.2% reduction
  4. security-testing: 46.8% reduction
  5. tdd-london-chicago: 45.3% reduction

Skills Needing Optimization (35):
  • agentic-quality-engineering (4,200 tokens)
  • cicd-pipeline-qe-orchestrator (3,200 tokens)
  • six-thinking-hats (2,300 tokens)
  • exploratory-testing-advanced (2,200 tokens)
  • chaos-engineering-resilience (2,200 tokens)
  ... and 30 more

================================================================================
```

## Error Types & Fixes

### Critical Errors (Block Production)

**Missing Frontmatter:**
```yaml
---
name: skill-name
category: specialized-testing
priority: high
tokenEstimate: 1300
agents: [qe-agent-1]
implementation_status: optimized
---
```

**Missing `<default_to_action>`:**
```markdown
<default_to_action>
When [context]:
1. ACTION: Step with outcome
2. ACTION: Step with validation
3. ACTION: Step with completion
</default_to_action>
```

**Missing Quick Reference:**
```markdown
## Quick Reference Card

### When to Use
- Trigger 1
- Trigger 2

### Key Actions
1. Action with outcome
2. Validation with criteria
```

### High Severity Warnings

**Token Limit Exceeded:**
- Current: 2,600 tokens
- Target: ≤1,500 tokens
- **Fix:** Apply compression techniques from patterns guide

**Agent Mismatch:**
- Manifest agents: [qe-agent-1, qe-agent-2]
- Skill agents: [qe-agent-1]
- **Fix:** Add missing agents to frontmatter

### Medium Severity Warnings

**Inaccurate Token Estimate:**
- Estimated: 1,300 tokens
- Declared: 2,000 tokens
- **Fix:** Update `tokenEstimate` in frontmatter

## Optimization Metrics Dashboard

### Current State (Example)
```yaml
fleet_optimization_status:
  total_skills: 41
  optimized: 5
  baseline: 35
  draft: 1

  progress: 12.2%

  tokens:
    baseline_total: 90,000
    current_total: 83,500
    saved: 6,500
    avg_reduction: 48.3%

  target:
    reduction_goal: 45%
    status: "ON TRACK" # ✅

  priorities:
    critical: 2 skills
    high: 12 skills
    medium: 23 skills
    low: 4 skills
```

### Target Metrics
```yaml
completion_goals:
  optimized_skills: 41/41 (100%)
  token_reduction: 40-50%
  total_token_savings: 40,500 tokens
  estimated_final: 49,500 tokens

  quality_gates:
    - All skills have quick reference cards
    - All skills have agent coordination sections
    - Zero critical validation errors
    - 100% agent association accuracy
    - All skills tested with real agents
```

## Priority-Based Optimization Order

### 1. Critical Skills (2 skills) - Do First
```
1. agentic-quality-engineering (4,200 tokens) - Foundation for all agents
2. holistic-testing-pact (1,500 tokens) - Core PACT principles
```

### 2. High Priority (12 skills) - Do Second
```
3. tdd-london-chicago (2,800 tokens)
4. api-testing-patterns (2,500 tokens)
5. cicd-pipeline-qe-orchestrator (3,200 tokens)
6. performance-testing (2,600 tokens) ✅ DONE
7. security-testing (2,400 tokens)
8. test-design-techniques (2,400 tokens)
9. shift-left-testing (1,700 tokens)
10. shift-right-testing (1,900 tokens)
11. test-automation-strategy (2,200 tokens)
12. context-driven-testing (1,800 tokens)
13. exploratory-testing-advanced (2,200 tokens)
14. risk-based-testing (1,900 tokens)
```

### 3. Medium Priority (23 skills) - Do Third
All specialized testing, analysis-review, and infrastructure skills.

### 4. Low Priority (4 skills) - Do Last
```
38. consultancy-practices (1,600 tokens)
39. refactoring-patterns (1,900 tokens)
40. technical-writing (1,700 tokens)
41. pair-programming (2,100 tokens)
```

## Integration with Agents

### Memory Coordination
Optimized skills use standardized memory namespaces:

```typescript
// Store test results
memory.store('aqe/performance/load-test/2025-12-02', {
  testType: 'load',
  target: 'https://api.example.com',
  results: { p95: 180, throughput: 5420 }
});

// Retrieve for coordination
const perfData = await memory.retrieve('aqe/performance/load-test/2025-12-02');
```

### Blackboard Coordination
```typescript
// Post completion event
blackboard.post('performance/test-completed', {
  priority: 'high',
  payload: { status: 'success', artifacts: ['report.html'] }
});

// Subscribe to quality gate decisions
blackboard.subscribe('quality/gate-evaluation', callback);
```

### Fleet Orchestration
```typescript
const fleet = await FleetManager.coordinate({
  strategy: 'performance-testing',
  agents: ['qe-performance-tester', 'qe-quality-analyzer'],
  memoryNamespace: 'aqe/performance',
  coordination: { shareResults: true }
});
```

## Best Practices

### ✅ Do This
1. **Validate before and after optimization**
2. **Test with actual agents** to ensure functionality
3. **Keep examples minimal** but runnable
4. **Use tables** for comparison data
5. **Add clear action directives** at the top
6. **Document all agent associations**
7. **Cross-reference related skills**
8. **Track optimization metrics**

### ❌ Avoid This
1. **Over-compression** that loses clarity
2. **Removing critical context** or examples
3. **Skipping validation** before marking as done
4. **Ignoring agent feedback** during testing
5. **Incomplete frontmatter** metadata
6. **Missing quick reference cards**
7. **Vague action directives**
8. **Breaking cross-skill dependencies**

## Troubleshooting

### Issue: Validation Fails with Token Count Error
```
ERROR: Token estimate 2,000 differs from actual 1,300
```

**Solution:**
```bash
# Update frontmatter tokenEstimate to match actual
vim .claude/skills/my-skill/SKILL.md
# Change: tokenEstimate: 2000
# To:     tokenEstimate: 1300
```

### Issue: Missing Section Error
```
ERROR: Quick Reference Card section is missing
```

**Solution:**
```bash
# Add section from template
cat docs/templates/optimized-skill-template.md
# Copy "Quick Reference Card" section into skill
```

### Issue: Agent Mismatch
```
ERROR: Missing agents from manifest: qe-agent-2
```

**Solution:**
```yaml
# Update frontmatter agents array
agents: [qe-agent-1, qe-agent-2]
```

## Monitoring Progress

### Daily Progress Tracking
```bash
# Generate daily report
npm run optimize:report > reports/optimization-progress-$(date +%Y-%m-%d).txt

# Track changes
git diff HEAD~1 -- .claude/skills/*/SKILL.md
```

### Weekly Milestones
```bash
# Week 1: Critical skills (2 skills)
# Week 2: High priority (12 skills)
# Week 3: Medium priority (15 skills)
# Week 4: Medium priority (8 skills)
# Week 5: Low priority (4 skills)
```

### Success Criteria
- [ ] 41/41 skills optimized
- [ ] Average token reduction ≥45%
- [ ] Zero critical validation errors
- [ ] All skills tested with agents
- [ ] Complete agent coordination documentation
- [ ] Full cross-reference integrity

## Resources

### Documentation
- **Patterns Guide:** [claude-4-5-patterns.md](./claude-4-5-patterns.md)
- **Template:** [optimized-skill-template.md](../templates/optimized-skill-template.md)
- **Skills Manifest:** [skills-manifest.json](../../.claude/skills/skills-manifest.json)

### Tools
- **Validation Script:** [validate-skill-optimization.ts](../../scripts/validate-skill-optimization.ts)
- **NPM Commands:**
  - `npm run validate-skill [path]`
  - `npm run validate-all-skills`
  - `npm run optimize:report`

### Reference Implementations
- **Optimized Example:** `.claude/skills/performance-testing/SKILL.md` (50% reduction)
- **Baseline Example:** `.claude/skills/testability-scoring/SKILL.md` (pre-optimization)

## Contributing

### Adding New Optimization Patterns
1. Document pattern in `claude-4-5-patterns.md`
2. Add example to template
3. Update validation script checks
4. Test with multiple skills
5. Measure token reduction impact

### Reporting Issues
- **Validation Errors:** Open issue with skill name and error output
- **Pattern Suggestions:** Share token reduction techniques that worked
- **Template Improvements:** Suggest better section structures

---

**Framework Version:** 1.0.0
**Last Updated:** 2025-12-02
**Maintained By:** Agentic QE Fleet Architecture Team
**Target:** 40-50% token reduction across 41 skills
**Status:** Ready for full fleet optimization
