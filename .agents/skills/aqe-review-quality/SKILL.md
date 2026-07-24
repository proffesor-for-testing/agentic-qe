---
name: aqe-review-quality
description: Review Agentic QE changes and issue an evidence-backed quality verdict. Use for code review, regression-risk assessment, release readiness, quality-gate evaluation, security/performance/testability review, or checking whether a change has sufficient verification. Do not use when the user primarily asks to implement a feature.
---

# Review AQE Quality

1. Read `AGENTS.md`, the diff or requested scope, affected implementation,
   tests, and configuration.
2. Review for correctness first: broken behavior, data loss, security,
   concurrency, compatibility, and missing error paths.
3. Use [references/quality-gates.md](references/quality-gates.md) to select
   relevant QE review lenses. Do not run unrelated broad scans.
4. Verify claims with focused commands where safe and available. Distinguish
   observed failures from inferred risks.
5. Report findings by severity with file and line references, the triggering
   scenario, and the smallest useful remediation.
6. End with one verdict:
   - `PASS`: no material finding and adequate evidence;
   - `CONDITIONAL`: bounded risks or missing environment-dependent evidence;
   - `FAIL`: correctness, safety, compatibility, or verification blocker.
7. List the exact checks run and any checks not run.

Do not edit code during a review unless the user also asks for fixes.
