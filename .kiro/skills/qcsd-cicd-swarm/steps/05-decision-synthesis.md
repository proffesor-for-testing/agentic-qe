# Step 5: Synthesize Results & Determine Recommendation

## Prerequisites
- Core and conditional results available

## Instructions

### Apply RELEASE/REMEDIATE/BLOCK decision logic EXACTLY

**BLOCK conditions (ANY triggers BLOCK):**
- Quality gate FAILED on critical thresholds
- P0/P1 regressions detected
- Security vulnerabilities with CVSS >= 9.0
- Flaky test rate > 20% on critical paths

**RELEASE conditions (ALL required):**
- All quality gates PASSED
- No P0/P1 regressions
- Flaky test rate < 5%
- All conditional checks passed

**Default: REMEDIATE**

Record decision with metrics and rationale.

## Success Criteria
- [ ] FINAL RECOMMENDATION: RELEASE / REMEDIATE / BLOCK

## Navigation
- On success: proceed to Step 6 by reading `steps/06-report-generation.md`
