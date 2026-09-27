# Planning Framework

## Deliverable fields

For each deliverable record:

- outcome and owner/specialty;
- dependencies and downstream consumers;
- affected files or boundaries;
- failure modes and rollback;
- acceptance criteria;
- focused verification;
- size: `S`, `M`, or `L`, plus confidence.

## Fleet selection

Start with one coordinator only for genuinely cross-domain work. Add specialists
by triggered risk:

| Trigger | AQE specialty |
| --- | --- |
| Ambiguous requirements or low testability | `qe-requirements-validator`, `qe-test-architect` |
| Broad code or dependency impact | `qe-code-intelligence`, `qe-impact-analyzer` |
| Security or trust boundaries | `qe-security-auditor` |
| Contracts or CLI/MCP parity | `qe-contract-validator`, `qe-integration-tester` |
| Performance or failure recovery | `qe-performance-tester`, `qe-chaos-engineer` |
| Release decision | `qe-risk-assessor`, `qe-quality-gate` |
| Learning and routing feedback | `qe-pattern-learner`, `qe-learning-coordinator` |

Use `qe-fleet-commander` or `qe-queen-coordinator` only when at least three
independent specialties need coordinated handoffs.

## Phase gates

1. Evidence gate: current behavior and upstream assumptions are verified.
2. Contract gate: schemas, configuration, and compatibility are explicit.
3. Vertical-slice gate: one end-to-end path proves the architecture.
4. Expansion gate: broader fleet, hooks, or automation has measured value.
5. Release gate: parity, invariants, rollback, and user-facing docs pass.
