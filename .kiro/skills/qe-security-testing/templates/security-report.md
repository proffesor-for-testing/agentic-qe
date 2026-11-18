# Security Assessment Report

**Project**: {{project_name}}
**Date**: {{date}}
**Assessed by**: {{assessor}}
**Scope**: {{scope_description}}

## Executive Summary

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | | | |
| High | | | |
| Medium | | | |
| Low | | | |
| Info | | | |

**Overall Risk Level**: {{risk_level}}
**Recommendation**: {{ship/hold/remediate}}

## Findings

### Finding 1: {{title}}
- **Severity**: {{critical/high/medium/low}}
- **OWASP Category**: {{A01-A10}}
- **Location**: {{file:line or endpoint}}
- **Description**: {{what was found}}
- **Impact**: {{what an attacker could do}}
- **Reproduction**:
  1. {{step 1}}
  2. {{step 2}}
- **Remediation**: {{how to fix}}
- **Status**: {{open/fixed/accepted}}

## Tools Used
- [ ] npm audit
- [ ] Semgrep SAST
- [ ] OWASP ZAP DAST
- [ ] Manual review
- [ ] Secrets scanning

## Sign-off
- [ ] All critical/high findings addressed or accepted with risk justification
- [ ] Remediation verified with re-test
