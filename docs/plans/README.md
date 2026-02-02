# Implementation Plans

This directory contains GOAP-style implementation plans for major AQE features.

## Active Plans

### [Skill Validation: Trust But Verify](./skill-validation-trust-but-verify.md)

**Status**: Planning
**Priority**: High
**Estimated Effort**: 214 hours across 5 phases

Implements a 4-layer validation system for AQE skills:

```
Level 3: Evaluation Suite (measure behavior)
Level 2: Executable Validator (verify output)
Level 1: JSON Schema (structure output)
Level 0: SKILL.md Instructions (guide intent)
```

**Key Deliverables**:
- Trust tier frontmatter extension for SKILL.md
- JSON output schemas for all P0 skills
- Executable validators with graceful degradation
- YAML-based evaluation test suites
- CI/CD workflow for multi-model validation
- ReasoningBank integration for learning

**Related Resources**:
- Schemas: `/docs/schemas/`
- Templates: `/docs/templates/`
- Exemplars: `.claude/skills/testability-scoring/`, `.claude/skills/brutal-honesty-review/`

---

## Plan Structure

Each plan follows the SPARC-GOAP methodology:

1. **Specification**: Define goal state and success criteria
2. **Pseudocode**: Plan action sequences and state transitions
3. **Architecture**: Structure solution components
4. **Refinement**: TDD implementation with iteration
5. **Completion**: Integration, validation, deployment

### Milestone Template

```yaml
Milestone X.Y: Name
  Description: What this milestone achieves
  Complexity: Low/Medium/High
  Estimated Hours: N
  Agent Assignment: qe-agent-name
  Dependencies: [milestone IDs]
  Parallel Opportunity: Yes/No

  Deliverables:
    - path/to/deliverable

  Success Criteria:
    - [ ] Measurable outcome
```

### Memory Namespaces

Plans define memory namespaces for pattern learning:

```
aqe/{feature}/
├── patterns/       - Learned patterns
├── outcomes/       - Execution outcomes
├── metrics/        - Performance metrics
└── trends/         - Historical trends
```

---

## Creating New Plans

1. Copy the structure from an existing plan
2. Define clear goal state vs current state
3. Break into SPARC phases with milestones
4. Assign agents and estimate complexity
5. Map dependencies and parallel opportunities
6. Define success criteria for each milestone
7. Add to this README

---

## Related Documentation

- [ADR-021: QE ReasoningBank](../adrs/adr-021-qe-reasoningbank.md)
- [ADR-023: Quality Feedback Loop](../adrs/adr-023-quality-feedback-loop.md)
- [Skills Manifest](../../.claude/skills/skills-manifest.json)
