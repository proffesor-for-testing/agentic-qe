# Step 5: Synthesize Results & Determine Recommendation

## Prerequisites
- Core and conditional results available

## Instructions

### Apply GO/CONDITIONAL/NO-GO logic EXACTLY

**NO-GO conditions (ANY triggers NO-GO):**
- Testability score < 30%
- Critical requirements gaps with no mitigation
- Security risks rated Critical with no mitigation path
- No measurable acceptance criteria

**GO conditions (ALL required):**
- Testability score >= 70%
- All HTSM categories assessed
- Risk assessment complete with mitigations
- Requirements validation passed
- No unresolved critical issues

**Default: CONDITIONAL**

## Success Criteria
- [ ] FINAL RECOMMENDATION: GO / CONDITIONAL / NO-GO

## Navigation
- On success: proceed to Step 6 by reading `steps/06-report-generation.md`
