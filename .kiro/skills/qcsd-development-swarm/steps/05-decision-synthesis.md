# Step 5: Synthesize Results & Determine Recommendation

## Prerequisites
- Core and conditional results available

## Instructions

### Apply SHIP/CONDITIONAL/HOLD logic EXACTLY

**HOLD conditions (ANY triggers HOLD):**
- Coverage < 50%
- Complexity score > critical threshold
- TDD adherence < 30%
- Security vulnerabilities (critical/high) in security code
- Mutation score < 40% on critical code

**SHIP conditions (ALL required):**
- Coverage >= 80%
- Complexity within acceptable range
- TDD adherence >= 70%
- No critical/high security findings
- All conditional checks passed

**Default: CONDITIONAL**

## Success Criteria
- [ ] FINAL RECOMMENDATION: SHIP / CONDITIONAL / HOLD

## Navigation
- On success: proceed to Step 6 by reading `steps/06-report-generation.md`
