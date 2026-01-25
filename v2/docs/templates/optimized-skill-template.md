---
name: skill-name-kebab-case
description: "Concise one-sentence description of what this skill does and when to use it. Maximum 200 characters."
category: qe-core|testing-methodologies|test-design|specialized-testing|analysis-review|infrastructure|development-practices|bug-management
priority: critical|high|medium|low
tokenEstimate: 1200
agents: [qe-agent-1, qe-agent-2]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: [dependency-skill-1, dependency-skill-2]
quick_reference_card: true
tags: [tag1, tag2, tag3]
---

# Skill Name

<default_to_action>
When [trigger/context] is requested:
1. ACTION VERB: First critical step with clear outcome
2. ACTION VERB: Second step with specific deliverable
3. ACTION VERB: Third step with measurable result
4. ACTION VERB: Fourth step with validation criteria
5. ACTION VERB: Fifth step with completion indicator

**Quick Decision Matrix:**
- Scenario A → Action X (use when Y)
- Scenario B → Action Z (use when W)
- Scenario C → Action Q (use when P)

**Critical Success Factors:**
- Factor 1: Measurable criterion
- Factor 2: Observable outcome
- Factor 3: Validation checkpoint
</default_to_action>

## Quick Reference Card

### When to Use
- Trigger condition 1 (specific context)
- Trigger condition 2 (specific need)
- Trigger condition 3 (specific problem)
- Trigger condition 4 (specific goal)

### Key Actions
1. Primary action with expected outcome
2. Secondary action with validation
3. Tertiary action with deliverable
4. Quality check with pass/fail criteria
5. Completion step with artifacts

### Tools & Frameworks
- **Tool 1**: Best for X (Learning curve: Low/Medium/High)
- **Tool 2**: Best for Y (Learning curve: Low/Medium/High)
- **Tool 3**: Best for Z (Learning curve: Low/Medium/High)

### Common Patterns
| Pattern | Use Case | Complexity |
|---------|----------|------------|
| Pattern A | Scenario X | Low |
| Pattern B | Scenario Y | Medium |
| Pattern C | Scenario Z | High |

### Success Criteria
✅ Metric 1: Target value or range
✅ Metric 2: Validation method
✅ Metric 3: Quality threshold
❌ Anti-pattern 1: What to avoid
❌ Anti-pattern 2: Common pitfall

### Agent Coordination
- `agent-type-1`: Primary responsibility and output
- `agent-type-2`: Supporting role and artifacts
- `agent-type-3`: Validation and quality gates

---

## Core Concepts

### Concept 1: Foundational Understanding
**Definition:** Clear, concise explanation in 1-2 sentences.

**Key Points:**
- Essential element 1 with measurable aspect
- Essential element 2 with observable outcome
- Essential element 3 with validation criteria

**Example:**
```language
// Minimal, focused example demonstrating core concept
function exampleFunction() {
  // Only essential code, no verbose comments
  return criticalOperation();
}
```

### Concept 2: Advanced Application
**When to Use:** Specific context or condition.

**Approach:**
1. Step 1 with clear outcome
2. Step 2 with validation
3. Step 3 with completion criteria

**Trade-offs:**
| Approach | Pros | Cons | When to Use |
|----------|------|------|-------------|
| Option A | Benefit 1, Benefit 2 | Limitation 1 | Context X |
| Option B | Benefit 3, Benefit 4 | Limitation 2 | Context Y |

---

## Implementation Patterns

### Pattern 1: Primary Use Case
**Goal:** Specific, measurable objective.

**Steps:**
1. **Preparation**: What to set up
2. **Execution**: How to perform action
3. **Validation**: How to verify success
4. **Iteration**: How to refine

**Example:**
```language
// Concrete, runnable example
const result = await primaryPattern({
  config: { key: 'value' },
  validation: (r) => r.status === 'success'
});
```

**Expected Outcome:**
- Observable result 1
- Measurable metric 2
- Validation checkpoint 3

### Pattern 2: Secondary Use Case
**Context:** When pattern 1 doesn't apply.

**Quick Implementation:**
```language
// Minimal code snippet
const alternative = quickPattern(input);
// Expected: specific result type
```

**Comparison:**
| Aspect | Pattern 1 | Pattern 2 |
|--------|-----------|-----------|
| Speed | Fast | Moderate |
| Accuracy | High | Medium |
| Complexity | Low | Medium |

---

## Common Scenarios

### Scenario A: Frequent Problem
**Problem:** Clear problem statement.

**Solution:**
1. Diagnostic step with expected finding
2. Remediation action with outcome
3. Verification with pass/fail criteria

**Code Example:**
```language
// Minimal solution code
const fix = applyFix(problem);
if (fix.verified) { /* success */ }
```

### Scenario B: Edge Case
**When It Happens:** Specific trigger condition.

**Handling:**
- Detection method
- Mitigation strategy
- Fallback approach

---

## Tools & Integrations

### Tool Selection Matrix
| Tool | Best For | Complexity | Setup Time |
|------|----------|------------|------------|
| Tool A | Use case X | Low | 5 min |
| Tool B | Use case Y | Medium | 30 min |
| Tool C | Use case Z | High | 2 hours |

### Integration Example: Tool A
```language
// Minimal working integration
import { Tool } from 'tool-package';

const integration = new Tool({
  essential: 'config',
  only: 'critical-params'
});

const result = await integration.execute();
// Validation: expected result structure
```

---

## Agent Coordination Hints

### Memory Namespace
Store data in: `aqe/{category}/{skill-name}/{data-type}`

**Schema:**
```json
{
  "skill": "skill-name",
  "timestamp": "ISO-8601",
  "agent": "qe-agent-name",
  "operation": "action-performed",
  "results": {
    "metric1": "value",
    "metric2": "value",
    "status": "success|failure"
  },
  "metadata": {
    "duration": "milliseconds",
    "resources": ["file1.js", "file2.test.js"]
  }
}
```

### Coordination Flow
1. **Agent 1** → Primary action, store results to memory
2. **Agent 2** → Retrieve results, perform analysis
3. **Agent 3** → Make decision based on analysis
4. **Fleet Commander** → Coordinate cross-agent workflow

### Blackboard Patterns
**Post to:** `{category}/{event-type}` with priority `critical|high|medium|low`
**Subscribe to:** `{related-category}/{related-event}` for downstream coordination

**Event Schema:**
```json
{
  "event": "skill-name:action-completed",
  "priority": "high",
  "payload": {
    "status": "success",
    "artifacts": ["file1", "file2"],
    "next_actions": ["validation", "reporting"]
  }
}
```

### Cross-Agent Dependencies
- **Requires:** [dependency-skill-1](../dependency-skill-1/) (why required)
- **Complements:** [related-skill-2](../related-skill-2/) (synergy description)
- **Informs:** [downstream-skill-3](../downstream-skill-3/) (data flow)

### Fleet Coordination Example
```typescript
// Example of multi-agent coordination
const fleetStrategy = await FleetManager.coordinate({
  strategy: 'skill-name-workflow',
  agents: [
    'qe-agent-1',  // Primary execution
    'qe-agent-2',  // Analysis & validation
    'qe-agent-3'   // Reporting & decisions
  ],
  topology: 'sequential|parallel|hierarchical',
  memoryNamespace: 'aqe/skill-name',
  coordination: {
    shareResults: true,
    waitForCompletion: true,
    aggregateFindings: true
  }
});
```

---

## Best Practices

### ✅ Do This
- **Practice 1:** Clear guideline with measurable outcome
- **Practice 2:** Specific action with validation method
- **Practice 3:** Observable behavior with success criteria

### ❌ Avoid This
- **Anti-pattern 1:** Problem and why it's bad
- **Anti-pattern 2:** Common mistake and consequences
- **Anti-pattern 3:** Pitfall and how to prevent

### Performance Tips
| Optimization | Impact | Effort | When to Apply |
|--------------|--------|--------|---------------|
| Tip 1 | High | Low | Always |
| Tip 2 | Medium | Medium | Scale >100 |
| Tip 3 | Low | High | Edge cases |

---

## Troubleshooting

### Issue 1: Common Problem
**Symptoms:**
- Observable symptom 1
- Measurable indicator 2

**Diagnosis:**
```bash
# Command to diagnose
diagnostic-command --flags
```

**Solution:**
1. Remediation step 1
2. Validation step 2
3. Confirmation step 3

### Issue 2: Edge Case Problem
**Root Cause:** Explanation of underlying issue.

**Quick Fix:**
```language
// Minimal fix code
const fix = quickSolution(problem);
```

**Long-term Solution:** Strategic approach for prevention.

---

## Examples Gallery

### Example 1: Basic Usage
```language
// Complete working example
import { Skill } from 'skill-package';

async function basicExample() {
  const skill = new Skill({ config: 'value' });
  const result = await skill.execute();

  // Validation
  if (result.success) {
    console.log('Success:', result.data);
  }
}
```

**Expected Output:**
```
Success: { metric: 95, status: 'passed' }
```

### Example 2: Advanced Usage
```language
// Complex scenario with error handling
async function advancedExample() {
  try {
    const result = await complexOperation({
      option1: true,
      option2: 'value'
    });
    return result;
  } catch (error) {
    // Graceful degradation
    return fallbackStrategy();
  }
}
```

---

## Metrics & Validation

### Success Metrics
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Metric 1 | 95%+ | Automated test |
| Metric 2 | <200ms | Performance monitoring |
| Metric 3 | 0 errors | Error tracking |

### Quality Gates
**Pre-execution:**
- [ ] Prerequisite 1 verified
- [ ] Prerequisite 2 validated
- [ ] Configuration correct

**Post-execution:**
- [ ] Success criteria met
- [ ] Artifacts generated
- [ ] Quality thresholds passed

### Validation Commands
```bash
# Validate setup
npm run validate:{skill-name}

# Run quality checks
npm run quality-check

# Generate report
npm run report:{skill-name}
```

---

## Related Skills

### Prerequisites
- [**dependency-skill-1**](../dependency-skill-1/): Required foundational knowledge
- [**dependency-skill-2**](../dependency-skill-2/): Essential for understanding

### Complementary Skills
- [**related-skill-1**](../related-skill-1/): Enhances effectiveness
- [**related-skill-2**](../related-skill-2/): Provides synergy

### Downstream Skills
- [**informed-skill-1**](../informed-skill-1/): Uses outputs from this skill
- [**informed-skill-2**](../informed-skill-2/): Benefits from this skill's data

---

## Resources

### Documentation
- Official docs: [URL](https://example.com/docs)
- API reference: [URL](https://example.com/api)
- Best practices: [URL](https://example.com/best-practices)

### Learning Resources
- Tutorial: [Title](https://example.com/tutorial)
- Video guide: [Title](https://example.com/video)
- Interactive demo: [Title](https://example.com/demo)

### Community
- GitHub: [Repository](https://github.com/org/repo)
- Stack Overflow: [Tag](https://stackoverflow.com/questions/tagged/tag)
- Discord/Slack: [Community Link](https://discord.gg/community)

---

## Metadata

**Implementation Status:** `optimized`

**Optimization Details:**
```yaml
baseline_tokens: 2500
optimized_tokens: 1200
reduction_percent: 52
optimization_date: 2025-12-02
optimizer: claude-sonnet-4-5
validation_status: passed
agent_tested: [qe-agent-1, qe-agent-2]
```

**Version History:**
- v1.0 (2025-12-02): Initial optimized version
- v0.9 (2025-11-XX): Baseline before optimization

**Maintainers:**
- Primary: Agent type or team
- Contributors: Community members

---

**Document Version:** 1.0
**Last Updated:** 2025-12-02
**Compatibility:** Claude Code 2.0+, Agentic QE Fleet v2.0+
**License:** MIT (or appropriate license)

---

## Template Usage Instructions

### For New Skills
1. Copy this template to `.claude/skills/{skill-name}/SKILL.md`
2. Replace all placeholder text in `{curly-braces}`
3. Update YAML frontmatter with accurate metadata
4. Fill in `<default_to_action>` with actionable directives
5. Complete Quick Reference Card section
6. Add agent coordination hints
7. Validate with: `npm run validate-skill .claude/skills/{skill-name}/SKILL.md`

### For Optimizing Existing Skills
1. Read existing skill to understand core content
2. Extract essential information
3. Apply optimization patterns from `/docs/optimization/claude-4-5-patterns.md`
4. Preserve all critical examples and code
5. Add missing sections (quick reference, agent coordination)
6. Update metadata and implementation status
7. Validate token reduction (target: 40-50%)
8. Test with actual agent execution

### Validation Checklist
- [ ] YAML frontmatter complete
- [ ] `<default_to_action>` block present (100-200 tokens)
- [ ] Quick reference card included
- [ ] Agent coordination section present
- [ ] Token estimate ≤ 1500 (or documented reason)
- [ ] All code examples runnable
- [ ] Related skills cross-referenced
- [ ] Implementation status accurate
- [ ] Tested with at least one agent

### Token Budget Guidelines
- YAML frontmatter: ~80 tokens
- `<default_to_action>`: 100-200 tokens
- Quick reference card: 200-400 tokens
- Core concepts: 300-500 tokens
- Implementation patterns: 200-400 tokens
- Agent coordination: 150-250 tokens
- Examples: 150-300 tokens
- Remaining sections: 200-400 tokens
- **Total target:** 1,200-1,500 tokens (adjust based on complexity)

---

**This is a living template. Update it as optimization patterns evolve.**
