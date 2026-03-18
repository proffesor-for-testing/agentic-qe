---
name: xp-practices
description: "Apply XP practices including pair programming, ensemble programming, continuous integration, and sustainable pace. Use when implementing agile development practices, improving team collaboration, or adopting technical excellence practices."
category: methodology
priority: medium
tokenEstimate: 1000
agents: [qe-quality-analyzer, qe-test-executor, qe-code-reviewer]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-03
dependencies: []
quick_reference_card: true
tags: [xp, agile, pair-programming, tdd, continuous-integration, collaboration]
trust_tier: 0
validation:
---

# Extreme Programming (XP) Practices

<default_to_action>
When applying XP practices:
1. START with practices that give immediate value
2. BUILD supporting practices gradually
3. ADAPT to your context
4. MEASURE results

**Core XP Practices (Prioritized):**
| Practice | Start Here | Why First |
|----------|------------|-----------|
| TDD | ✅ Yes | Foundation for everything |
| Continuous Integration | ✅ Yes | Fast feedback |
| Pair Programming | ✅ Yes | Knowledge sharing |
| Collective Ownership | After CI+TDD | Needs safety net |
| Small Releases | After CI | Infrastructure dependent |

**Pairing Quick Start:**
```
Driver-Navigator (Classic):
- Driver: Writes code
- Navigator: Reviews, thinks ahead
- Rotate every 20-30 min

Ping-Pong (with TDD):
A: Write failing test
B: Make test pass + refactor
B: Write next failing test
A: Make test pass + refactor
```
</default_to_action>

## Quick Reference Card

### When to Pair

| Context | Pair? | Why |
|---------|-------|-----|
| Complex/risky code | ✅ Always | Needs multiple perspectives |
| New technology | ✅ Always | Learning accelerator |
| Onboarding | ✅ Always | Knowledge transfer |
| Critical bugs | ✅ Always | Two heads better |
| Simple tasks | ❌ Skip | Not worth overhead |
| Research spikes | ❌ Skip | Pair to discuss findings |

---

## Agent Integration

```typescript
// Agent-human pair testing
const charter = "Test payment edge cases";
const tests = await Task("Generate Tests", { charter }, "qe-test-generator");
const reviewed = await human.review(tests);
await Task("Implement", { tests: reviewed }, "qe-test-generator");

// Continuous integration with agents
await Task("Risk Analysis", { prDiff }, "qe-regression-risk-analyzer");
await Task("Generate Tests", { changes: prDiff }, "qe-test-generator");
await Task("Execute Tests", { scope: 'affected' }, "qe-test-executor");

// Sustainable pace: agents handle grunt work
const agentWork = ['regression', 'data-generation', 'coverage-analysis'];
const humanWork = ['exploratory', 'risk-assessment', 'strategy'];
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/xp-practices/
├── pairing-sessions/*   - Pair/ensemble session logs
├── ci-metrics/*         - CI health metrics
├── velocity/*           - Team velocity data
└── retrospectives/*     - XP retrospective notes
```

### Fleet Coordination
```typescript
const xpFleet = await FleetManager.coordinate({
  strategy: 'xp-workflow',
  agents: [
    'qe-test-generator',   // TDD support
    'qe-test-executor',    // CI integration
    'qe-code-reviewer'     // Collective ownership
  ],
  topology: 'parallel'
});
```

---

## Related Skills
- [tdd-london-chicago](../tdd-london-chicago/) - TDD deep dive
- [refactoring-patterns](../refactoring-patterns/) - Safe refactoring
- [pair-programming](../pair-programming/) - AI-assisted pairing

---

## Remember

**XP practices work as a system** - TDD enables collective ownership, CI enables small releases, pairing enables collective ownership. Don't cherry-pick randomly.

**With Agents:** Pair humans with agents. Agents handle repetitive work (regression, data generation, coverage analysis), humans provide judgment and creativity.
