# Test Specialty Selection

- Public algorithm or data structure: invariants and property tests; consult
  `qe-property-tester` and `qe-test-architect`.
- CLI behavior: command-level test plus the equivalent MCP check when exposed;
  consult `qe-integration-tester`.
- MCP handler or protocol: handler tests are insufficient by themselves; add a
  protocol-level integration check.
- Coverage gap: inspect risk and branch behavior before adding examples; consult
  `qe-coverage-specialist`, `qe-gap-detector`, and `qe-mutation-tester`.
- Intermittent failure: preserve evidence and classify nondeterminism; consult
  `qe-flaky-hunter` and `qe-root-cause-analyzer`.
- API/schema change: test backward compatibility and negative cases; consult
  `qe-contract-validator` or the protocol-specific QE definition.
- Security boundary: test authorization, input validation, path safety, secret
  handling, and failure disclosure; consult `qe-security-auditor`.
- Performance-sensitive path: measure a baseline and regression threshold;
  consult `qe-performance-tester`.
- Browser or UI change: cover keyboard/accessibility, responsive layout, and
  stable visual evidence where relevant.

Repository test commands are defined in `package.json`; follow `AGENTS.md` for
the recommended narrow-to-broad sequence.
