# AQE Quality Gates

Apply only relevant gates:

| Gate | Blocking signal |
| --- | --- |
| Correctness | A realistic input violates the stated behavior or invariant |
| Data safety | A path can corrupt, overwrite, or silently lose persisted data |
| Security | Authorization bypass, injection, secret exposure, unsafe path, or unvalidated boundary |
| Compatibility | Public API, CLI, MCP, schema, or shipped asset changes without migration/compatibility handling |
| Test adequacy | Changed behavior lacks a durable assertion or the test cannot detect a plausible defect |
| CLI/MCP parity | Equivalent surfaces behave differently or only one was verified |
| Reliability | Race, leak, retry masking, nondeterministic result, or unbounded resource use |
| Performance | Measured regression beyond an established threshold |
| Distribution | `.claude/agents/v3`, `assets/agents/v3`, manifests, or generated bundles are out of sync |
| Release evidence | Required build, invariant, parity, or smoke check failed or was not run |

Use `.claude/agents/v3/qe-quality-gate.md`,
`qe-risk-assessor.md`, `qe-deployment-advisor.md`, and the domain-specific QE
definitions as deeper references when a gate needs specialized criteria.
