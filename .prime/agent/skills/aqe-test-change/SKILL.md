---
name: aqe-test-change
description: Design, implement, and run durable tests for Agentic QE code changes. Use when adding tests, reproducing a defect, filling a coverage gap, selecting affected Vitest suites, checking CLI/MCP parity, or verifying a fix in this repository. Do not use for a read-only quality review with no requested edits.
---

# Test an AQE Change

1. Read `AGENTS.md`, the changed code, nearby tests, and relevant public
   interfaces.
2. Reproduce a reported defect with the exact scenario before changing code.
3. Identify the affected QE specialty from
   [references/test-specialties.md](references/test-specialties.md).
4. Add tests in this order:
   - durable boundary contracts, invariants, or properties;
   - integration behavior across affected components;
   - focused unit examples needed for the red-green loop.
5. Keep tests deterministic. Do not hide failures with retries, skips, weakened
   assertions, fabricated fixtures, or mocks of the behavior under test.
6. Run the narrowest matching Vitest target first. Expand to typecheck, build,
   agent/skill parity, MCP integration, or full CI checks in proportion to the
   changed surface.
7. For capabilities exposed through both CLI and MCP, verify both paths.
8. Report commands, pass/fail counts, limitations, and untested external
   dependencies.

Never modify or reset `.agentic-qe/memory.db`. Use a copy for any database test.
