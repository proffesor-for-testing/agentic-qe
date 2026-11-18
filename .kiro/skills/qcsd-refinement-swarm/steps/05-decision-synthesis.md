# Step 5: Synthesize Results & Determine Recommendation

## Prerequisites
- Core and conditional agent results available

## Instructions

### Apply READY/CONDITIONAL/NOT-READY decision logic EXACTLY

Derive metrics from agent outputs and apply the decision tree:

**NOT-READY conditions (ANY triggers NOT-READY):**
- Testability score < 40%
- INVEST validation fails on 3+ criteria
- Critical SFDIPOT gaps in Structure or Function
- Missing acceptance criteria for core functionality
- Contract validation failures on existing APIs (if applicable)

**READY conditions (ALL required for READY):**
- Testability score >= 70%
- INVEST validation passes on 5+ criteria
- All SFDIPOT factors assessed with no critical gaps
- BDD scenarios cover all acceptance criteria
- No unresolved blocking issues from conditional agents

**Default: CONDITIONAL**

### Record decision with full metrics and rationale.

If CONDITIONAL, list specific conditions that must be met.
If NOT-READY, list specific blockers with remediation steps.

## Success Criteria
- [ ] All metrics derived from actual agent outputs
- [ ] Decision logic applied exactly
- [ ] FINAL RECOMMENDATION: READY / CONDITIONAL / NOT-READY

## Output
Recommendation, metrics, rationale, and improvement actions.

## Navigation
- On success: proceed to Step 6 by reading `steps/06-report-generation.md`
- On failure: resolve missing metrics
