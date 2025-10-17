# Risk-Based Testing

## Core Principle

**You cannot test everything. Test what matters most.**

Risk-based testing focuses testing effort on areas where failures would cause the most harm, weighted by the likelihood of failure.

## Risk Formula

```
Risk = Probability of Failure × Impact of Failure
```

**High Risk:** Test thoroughly, often, with multiple techniques
**Medium Risk:** Standard testing, automated regression
**Low Risk:** Light testing, maybe skip

## Risk Identification

### Business Impact Factors

**Revenue Impact**
- Directly generates revenue? (checkout, payment)
- Blocks revenue? (login, product catalog)
- Minor impact? (help documentation)

**User Impact**
- Number of users affected
- Frequency of use
- Critical to user workflow?
- Workarounds available?

**Regulatory/Compliance**
- Legal requirements
- Security standards (PCI-DSS, GDPR)
- Industry regulations
- Contractual obligations

**Reputation**
- Public-facing features
- Brand perception
- Social media amplification risk
- Customer trust impact

**Data Sensitivity**
- Financial data
- Personal information
- Health records
- Confidential business data

### Technical Risk Factors

**Complexity**
- Complex algorithms → higher risk
- Many dependencies → higher risk
- Distributed systems → higher risk
- Simple CRUD → lower risk

**Change Frequency**
- Frequently changed code → higher risk
- New technology → higher risk
- Stable, mature code → lower risk

**Test Coverage**
- Well-tested area → lower risk
- No automated tests → higher risk
- Poor test quality → higher risk

**Historical Data**
- Bug history (hotspots)
- Production incidents
- Failed releases
- Customer complaints

**Dependencies**
- Third-party services
- Legacy systems
- Network reliability
- External APIs

## Risk Assessment Matrix

### Creating Risk Matrix

```
Impact →   Low        Medium      High        Critical
         ─────────────────────────────────────────────
High     │ Medium    High        High        CRITICAL
Prob     │
↓        │
Medium   │ Low       Medium      High        High
         │
Low      │ Low       Low         Medium      Medium
         │
Rare     │ Skip      Low         Low         Medium
```

**Priority = Risk Level**
- Critical: Test first, test thoroughly
- High: Standard comprehensive testing
- Medium: Focused testing on key scenarios
- Low: Smoke test or skip if time-limited

### Example Risk Assessment

**E-commerce Application:**

| Feature | Impact | Probability | Risk | Test Strategy |
|---------|--------|-------------|------|---------------|
| Payment processing | Critical | Medium | CRITICAL | Extensive testing, multiple payment types, error scenarios, security testing |
| Product search | High | Medium | High | Core flows automated, exploratory for edge cases |
| User reviews | Medium | Low | Medium | Basic functional tests, focus on new features |
| Help documentation | Low | Low | Low | Quick smoke test, spell check |
| Admin analytics | Medium | Low | Medium | Key reports tested, edge cases documented |

## Risk-Based Test Planning

### Step 1: Identify Risks

**Workshop with stakeholders:**
- Product owner (business risks)
- Developers (technical risks)
- Support team (common issues)
- QE (quality risks)
- Security team (security risks)

**Output:** List of potential failure points

### Step 2: Assess Each Risk

For each risk:
1. **Probability:** How likely is this to fail? (Rare/Low/Medium/High)
2. **Impact:** What happens if it fails? (Low/Medium/High/Critical)
3. **Risk Level:** Use matrix to determine

**Example:**
```
Risk: Payment gateway timeout during high traffic

Probability: Medium
- Seen in load tests before
- Known issue during sales events
- Mitigation in place but not perfect

Impact: Critical
- Revenue loss (thousands/minute)
- Customer frustration
- Bad press potential

Risk Level: CRITICAL → Test extensively
```

### Step 3: Prioritize Testing

**Critical Risks:**
- Test first in sprint
- Multiple testing techniques
- Extensive test coverage
- Performance/load testing
- Security testing
- Manual exploratory testing
- Automated regression tests

**High Risks:**
- Core test scenarios automated
- Key user flows tested manually
- Edge cases documented
- Regular regression testing

**Medium Risks:**
- Happy path automated
- Basic edge case testing
- Spot-check during exploratory sessions

**Low Risks:**
- Smoke test only
- May skip if time-limited
- Document known limitations

### Step 4: Allocate Testing Time

**Time budget based on risk:**

```
Critical: 40% of testing time
High: 35% of testing time
Medium: 20% of testing time
Low: 5% of testing time
```

**Adjust based on context:**
- Startup: Heavily weight Critical/High
- Mature product: More balanced
- Compliance-heavy: May need comprehensive coverage

## Risk-Based Test Design

### Coverage by Risk Level

**Critical Risk Area:**
```
Test coverage:
✓ Happy path (multiple variations)
✓ All error scenarios
✓ Boundary conditions
✓ Performance under load
✓ Security vulnerabilities
✓ Recovery from failures
✓ Concurrent operations
✓ Data integrity
✓ Integration points

Techniques:
- Exploratory testing sessions
- Automated regression suite
- Load/stress testing
- Security scanning
- Chaos engineering
```

**Medium Risk Area:**
```
Test coverage:
✓ Happy path
✓ Common error scenarios
✓ Key boundary conditions

Techniques:
- Automated happy path tests
- Spot-check during exploratory testing
- Basic error handling verification
```

**Low Risk Area:**
```
Test coverage:
✓ Smoke test (works at all?)

Techniques:
- Quick manual check
- Maybe automated smoke test
```

### Example: Login Feature

**Risk Assessment:**
```
Impact: High (blocks all functionality)
Probability: Medium (well-understood, but complex)
Risk Level: High
```

**Test Strategy:**
```
Critical Scenarios:
✓ Valid credentials → Success
✓ Invalid password → Error message
✓ Account locked after failed attempts
✓ Session timeout handling
✓ Multi-factor authentication
✓ Password reset flow
✓ SQL injection attempts
✓ Brute force protection

Medium Priority:
✓ Remember me functionality
✓ Social login integration
✓ Different user roles

Low Priority:
✓ Login page UI variations
✓ Keyboard navigation
```

## Risk Mitigation Strategies

### Reducing Probability

**Technical Mitigation:**
- Code reviews
- Static analysis
- Test automation
- Pair programming
- Design patterns
- Simpler architecture

**Process Mitigation:**
- Feature flags (gradual rollout)
- Canary deployments
- Blue-green deployments
- Comprehensive monitoring

### Reducing Impact

**Technical Mitigation:**
- Graceful degradation
- Circuit breakers
- Fallback mechanisms
- Data backups
- Rollback procedures

**Business Mitigation:**
- Insurance
- Service level agreements
- Customer communication plans
- Workarounds documented

## Dynamic Risk Assessment

**Risks change over time:**

**Risk increases when:**
- Major refactoring
- New team members
- Tight deadlines
- New technology
- Integration changes
- High-traffic events coming (Black Friday)

**Risk decreases when:**
- Comprehensive test coverage
- Code stabilizes
- Team expertise grows
- Multiple successful releases
- Production monitoring improves

**Re-assess risks:**
- Every sprint planning
- Before major releases
- After production incidents
- Quarterly review

## Production Risk Monitoring

### Leading Indicators

Monitor for risk signals:

**Code metrics:**
- Increasing complexity
- Test coverage declining
- Code churn in critical areas
- Growing tech debt

**Team metrics:**
- Velocity dropping
- Bug fix time increasing
- Team turnover

**Production metrics:**
- Error rates trending up
- Performance degrading
- Customer complaints rising

### Incident-Based Risk Assessment

**After each production incident:**

1. **Root cause analysis**
   - Why did it happen?
   - Why wasn't it caught?

2. **Risk re-assessment**
   - Was this area properly risk-assessed?
   - Should we increase testing focus?

3. **Preventive measures**
   - Add tests
   - Improve monitoring
   - Architectural changes

**Example:**
```
Incident: Payment processing failed for 2 hours
Root cause: Database connection pool exhausted
Previous risk level: High
New risk level: CRITICAL
Action: Add load testing, improve monitoring, auto-scaling
```

## Risk-Based Automation Strategy

### Automate Based on Risk × Frequency

```
High Risk + High Frequency = MUST AUTOMATE
High Risk + Low Frequency = Manual testing OK
Low Risk + High Frequency = Consider automation
Low Risk + Low Frequency = Skip or manual spot-check
```

**Automation priorities:**
```
1. Critical user flows (checkout, payment)
2. High-risk regressions (known to break)
3. Security vulnerabilities (injection, XSS)
4. Data integrity checks
5. Integration points
6. Lower priority features
```

## Communication of Risk

### Stakeholder Risk Dashboard

```markdown
## Sprint 15 Risk Dashboard

### CRITICAL Risks
🔴 **Payment Gateway Integration**
- Risk: Integration fails during high traffic
- Impact: Revenue loss, customer frustration
- Status: Load testing scheduled, monitoring enhanced
- Test coverage: 85% → Target: 95%

### HIGH Risks
🟡 **User Authentication**
- Risk: Session handling under concurrent logins
- Impact: Security vulnerability, user lockouts
- Status: Tests passing, exploratory testing planned

### Recently Mitigated
✅ **Database Performance** (was Critical)
- Added connection pooling
- Load testing completed successfully
- Monitoring in place
```

### Risk-Based Test Reports

```markdown
## Test Summary - Release 3.2

### Risk Coverage
✅ Critical Risks: 100% tested
✅ High Risks: 95% tested  
✅ Medium Risks: 75% tested
⚠️ Low Risks: 40% tested (acceptable)

### Issues Found by Risk Level
- Critical: 0 open issues
- High: 1 open issue (non-blocking)
- Medium: 3 open issues (documented)
- Low: 5 open issues (deferred)

### Recommendation: GREEN for release
All critical and high-risk areas thoroughly tested and passing.
```

## Practical Examples

### Example 1: New Feature - Social Login

**Initial Risk Assessment:**
```
Feature: Login via Google/Facebook
Impact: Medium (alternative to email login exists)
Probability: Medium (third-party integration, new to team)
Risk Level: Medium → High
```

**Test Strategy:**
- Core flow automated
- Error scenarios tested
- Security review (OAuth flow)
- Privacy compliance check
- Fallback to email tested

### Example 2: Bug Fix in Payment Processing

**Risk Re-Assessment:**
```
Change: Fix rounding error in multi-currency payments
Area Risk: Critical (payment processing)
Change Risk: Medium (localized change)
Overall: High → Test thoroughly despite "simple fix"
```

**Test Strategy:**
- Fix verified with unit tests
- Regression tests for payment flow
- Manual testing with multiple currencies
- Edge cases (0.01 amounts, max amounts)
- Deploy to staging first
- Monitor production closely

## Combining Risk-Based with Other Approaches

### Risk + Context-Driven Testing
- Risk identifies WHERE to test
- Context determines HOW to test

### Risk + Exploratory Testing
- High-risk areas get more exploration time
- Use risk assessment to create charters

### Risk + TDD
- Critical code gets TDD treatment
- Less critical code might skip TDD

### Risk + Automation
- Risk determines automation priority
- High-risk = automate first and thoroughly

## Common Pitfalls

### ❌ Risk Assessment Too Generic
"High risk: payment processing"

**Better:** "Critical risk: payment processing timeout under load during checkout, especially for international transactions"

### ❌ Not Updating Risk Assessment
Risks from 6 months ago may not be relevant now.

**Fix:** Review and update quarterly or after incidents

### ❌ Ignoring Low Probability, High Impact
Rare but catastrophic events still need attention.

**Fix:** Some testing of high-impact items regardless of probability

### ❌ Only Technical Risks
Missing business, regulatory, reputation risks.

**Fix:** Include diverse stakeholders in risk assessment

## Risk-Based Testing Checklist

**Before Sprint:**
- [ ] Risks identified for new features
- [ ] Risk levels assigned
- [ ] Test strategy per risk level
- [ ] Testing time allocated by risk

**During Development:**
- [ ] Critical areas tested first
- [ ] Risk levels guide test depth
- [ ] New risks identified and assessed

**Before Release:**
- [ ] All critical risks tested and passed
- [ ] High risks have sufficient coverage
- [ ] Known issues documented with risk level
- [ ] Stakeholders informed of residual risks

**After Release:**
- [ ] Monitor for risk realization
- [ ] Update risk assessment based on learnings
- [ ] Improve testing for next cycle

## Remember

**Perfect testing is impossible. Smart testing is achievable.**

Focus effort where it matters most. Accept that low-risk areas might have bugs. Communicate risk clearly. Adjust as you learn.

Risk-based testing isn't about testing less - it's about testing smarter.
