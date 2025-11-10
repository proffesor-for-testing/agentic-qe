---
name: bug-reporting-excellence
description: Write high-quality bug reports that get fixed quickly. Use when reporting bugs, training teams on bug reporting, or establishing bug report standards.
---

# Bug Reporting Excellence

## Core Philosophy

A good bug report saves hours of investigation. A bad bug report wastes everyone's time. Your job isn't just finding bugs - it's communicating them effectively.

**Key principle:** Make it easy for someone to reproduce, understand, and fix the issue.

## The Perfect Bug Report Structure

### Title: One-Line Summary

**Bad:** "Checkout broken"
**Good:** "Payment fails with Visa cards when order total > $1000"

**Formula:** `[Component] fails [Condition] causing [Impact]`

### Description: Three Parts

#### 1. Expected Behavior
What should happen?

**Example:**
```
When a user adds items to cart and proceeds to checkout with a valid Visa card,
the payment should be processed successfully and the order should be created.
```

#### 2. Actual Behavior
What actually happens?

**Example:**
```
Payment fails with error "Card declined" even though the card is valid.
User remains on checkout page, order is not created.
Error appears in console: "Payment gateway timeout: 30000ms exceeded"
```

#### 3. Steps to Reproduce
How to make it happen?

**Example:**
```
1. Log in as test user (test@example.com / password123)
2. Add "Premium Widget" to cart (SKU: WIDGET-001)
3. Add quantity: 15 (total: $1,050)
4. Go to checkout
5. Enter Visa card: 4532 1234 5678 9010
6. Click "Place Order"
7. Observe error message
```

## Essential Information to Include

### Environment Details
```
Browser: Chrome 120.0.6099.109 (Windows)
OS: Windows 11 Pro
Screen: 1920x1080
URL: https://example.com/checkout
Date/Time: 2025-10-17 14:23 UTC
User: test@example.com (ID: 12345)
```

### Impact/Severity

**Critical:** System down, data loss, security breach
- "Production database deleted"
- "Payment processing completely broken"
- "User credentials exposed"

**High:** Major feature broken, many users affected
- "Cannot checkout with Visa cards"
- "Search returns no results"
- "Admin dashboard doesn't load"

**Medium:** Feature partially broken, workaround exists
- "Filtering by price doesn't update results (refresh works)"
- "Export button slow (but completes eventually)"

**Low:** Minor issue, cosmetic, rare edge case
- "Button text wraps on mobile"
- "Tooltip shows wrong color"
- "Error message has typo"

### Supporting Evidence

**Screenshots/Videos**
- Annotate important areas
- Show full screen (URL bar, console visible)
- Include multiple steps if needed

**Error Messages**
```
Network Error:
POST /api/checkout HTTP/1.1
Status: 504 Gateway Timeout
Response: {
  "error": "Payment service unavailable",
  "code": "GATEWAY_TIMEOUT",
  "requestId": "abc-123-def-456"
}
```

**Console Logs**
```
[ERROR] PaymentGateway: Connection timeout after 30000ms
  at PaymentGateway.charge (gateway.js:145)
  at CheckoutController.processPayment (checkout.js:67)
  at async CheckoutController.submit (checkout.js:23)
```

**Network Traces**
```
Request ID: abc-123-def-456
Duration: 30,142ms
Payment gateway endpoint: https://gateway.example.com/v1/charge
Request body: { amount: 1050, currency: 'USD', card: '4532...9010' }
```

## Bug Report Template

```markdown
## [Component] Issue Title

**Severity:** [Critical/High/Medium/Low]
**Environment:** [Production/Staging/Dev]
**Affected Users:** [All/Specific segment/Single user]

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Steps to Reproduce
1. Step one
2. Step two
3. Step three
4. Observe issue

### Environment
- Browser/App:
- OS:
- Version:
- User account:
- Date/time:

### Supporting Evidence
[Screenshots, error messages, logs]

### Impact
How this affects users/business

### Additional Context
Any other relevant information

### Possible Cause (Optional)
If you have insights into why this might be happening
```

## Examples of Excellent Bug Reports

### Example 1: Performance Issue

```markdown
## [Checkout] Payment processing times out for orders > $1000

**Severity:** High
**Environment:** Production
**Affected Users:** ~15% of premium purchases (orders > $1000)

### Expected Behavior
Payment should complete within 5 seconds regardless of order amount.

### Actual Behavior
For orders above $1000, payment gateway request times out after 30 seconds.
User sees "Payment failed" error. Order is not created.

### Steps to Reproduce
1. Visit https://example.com
2. Add items totaling $1,050 to cart
3. Proceed to checkout
4. Enter payment info: Visa 4532 1234 5678 9010
5. Click "Place Order"
6. Wait 30+ seconds
7. Observe timeout error

### Environment
- Browser: Chrome 120 (Windows 11)
- User: test@example.com
- Time: 2025-10-17 14:23 UTC
- Request ID: abc-123-def-456

### Supporting Evidence

Error in console:
```
[ERROR] PaymentGateway timeout: 30000ms exceeded
```

Network tab shows:
- Request to /api/checkout: 30.14s
- Payment gateway call: 29.98s (timeout)

Screenshot attached: [timeout-error.png]

### Impact
- Lost revenue: ~$15K/week from failed premium orders
- Customer frustration: 23 support tickets this week
- Affects 15% of orders over $1000

### Additional Context
Issue started after Oct 15 deployment (v2.3.0)
Possibly related to PR #456 (fraud check improvements)

### Possible Cause
New fraud check service for orders > $1000 is slow.
Might need caching or async processing.
```

### Example 2: UI Bug

```markdown
## [Cart] "Remove" button hidden on mobile Safari

**Severity:** Medium
**Environment:** Production
**Affected Users:** Mobile Safari users (~8% of traffic)

### Expected Behavior
"Remove" button should be visible next to each cart item on all devices.

### Actual Behavior
On mobile Safari (iOS), "Remove" button is cut off and not clickable.

### Steps to Reproduce
1. Open https://example.com on iPhone (Safari)
2. Add 2+ items to cart
3. Navigate to cart page
4. Try to remove an item
5. Observe button is partially hidden

### Environment
- Device: iPhone 14 Pro (iOS 17.1)
- Browser: Safari 17
- Viewport: 390x844
- Time: 2025-10-17

### Supporting Evidence
Screenshot: [cart-mobile-bug.png]
- Shows button cut off at edge of screen

Comparison on Chrome iOS: Works correctly

### Impact
- Users cannot remove items from cart on iOS Safari
- Workaround: Use desktop or Chrome mobile
- Affects ~300 users/day

### Additional Context
CSS issue. Button has `position: absolute` and exceeds container width.

### Possible Cause
```css
.cart-item-remove {
  position: absolute;
  right: -10px; /* This is the problem */
}
```

Suggested fix: Change to `right: 10px;`
```

## Anti-Patterns: Bad Bug Reports

### ❌ Vague Description

**Bad:**
```
Title: Checkout is broken
Description: It doesn't work.
```

**Problem:** 
- What doesn't work?
- Which part of checkout?
- What did you try?

**Good:**
```
Title: Payment submission button does nothing when clicked
Description: [Full details with steps, expected vs actual behavior]
```

### ❌ No Steps to Reproduce

**Bad:**
```
Title: I saw an error
Description: There was an error message on the screen.
```

**Problem:**
- How did you get to that screen?
- What were you doing?
- Can anyone else reproduce it?

### ❌ Missing Environment Info

**Bad:**
```
Title: Page loads slowly
Description: The page takes forever to load.
```

**Problem:**
- Which page?
- Which browser?
- How slow is "slow"?
- Is it always slow or sometimes?

### ❌ Combining Multiple Issues

**Bad:**
```
Title: Multiple bugs found
Description: 
1. Cart doesn't update
2. Payment fails sometimes
3. Footer is misaligned
4. Email notifications are slow
```

**Problem:** Four separate issues, each needs its own investigation and fix.

**Good:** Create four separate bug reports.

### ❌ Feature Requests Disguised as Bugs

**Bad:**
```
Title: [BUG] No dark mode
Description: The app doesn't have dark mode.
```

**Problem:** Missing feature ≠ bug. File as feature request.

## Advanced Techniques

### Root Cause Analysis

Don't just report symptoms. Investigate:

```markdown
**Symptom:** Payment timeout

**Investigation:**
1. Checked network tab → 30s timeout
2. Checked server logs → Payment gateway slow
3. Checked gateway metrics → High latency for fraud checks
4. Checked recent changes → New fraud service deployed Oct 15

**Root Cause:** New fraud checking service adds 28s latency

**Suggested Fix:** 
- Make fraud check async
- Or optimize fraud service queries
- Or increase timeout threshold
```

### Isolation and Simplification

**Original:** Payment fails on checkout
**After isolation:**
- Works with Mastercard ✓
- Fails with Visa ✗
- Only for amounts > $1000 ✗
- Only in production environment ✗

**Simplified repro:**
```
1. Use Visa card
2. Order total > $1000
3. In production
4. Observe failure
```

### Regression Testing

**When reopening bugs:**
```markdown
## [RE-OPENED] Payment timeout still occurs

**Original bug:** #12345 (marked as fixed in v2.3.1)

**Current status:** Still failing in v2.3.2

**New evidence:**
- Tested with fix from v2.3.1
- Issue persists for orders > $5000 (different threshold)
- Previous fix only addressed orders $1000-$5000

**Steps to reproduce:**
[Updated steps with new threshold]
```

## Bug Triage Guidelines

### Questions Developers Will Ask

**"Can you reproduce it consistently?"**
- Always: High priority
- Sometimes: Document conditions
- Once: Hard to fix, low priority

**"Does it happen in other environments?"**
- Production only: Likely config issue
- All environments: Code bug
- Dev only: Environment-specific

**"Is there a workaround?"**
- No workaround + high impact = Critical
- Easy workaround + low impact = Low priority

**"What's the business impact?"**
- Lost revenue: High priority
- Cosmetic issue: Low priority
- Data loss: Critical

## Tools for Better Bug Reports

### Screen Recording
- **Loom** - Quick screen recording with annotation
- **OBS Studio** - Professional recording
- **Built-in OS tools** - Windows Game Bar, macOS Screenshot

### Browser DevTools
- Network tab (HAR file export)
- Console logs (copy all)
- Performance profiling
- Screenshots with annotations

### Bug Tracking Systems
- **Jira** - Enterprise standard
- **Linear** - Modern, fast
- **GitHub Issues** - For open source
- **Azure DevOps** - Microsoft stack

### Collaboration
- **Slack/Teams** - Quick questions
- **Confluence** - Documentation
- **Miro/Figma** - Visual explanation

## Communication Tips

### Be Objective, Not Judgmental

**Bad:** "This stupid button doesn't work because someone wrote terrible code"
**Good:** "The submit button doesn't respond to clicks. Investigating why."

### Assume Good Intent

**Bad:** "Lazy devs broke checkout again"
**Good:** "Checkout issue appeared after yesterday's deployment. Might be related to PR #456."

### Be Specific About Impact

**Vague:** "This is really bad"
**Specific:** "15% of orders are failing, costing ~$15K/week in lost revenue"

### Offer to Help

**Passive:** "Button is broken"
**Helpful:** "Button is broken. I can pair with a dev to investigate or test fixes."

## Follow-Up

### After Reporting

1. **Monitor** for questions from developers
2. **Test** the fix when deployed
3. **Verify** it actually resolves the issue
4. **Document** if regression occurs

### Closing Bug Reports

**Verified fixed:**
```
✓ Tested in staging (v2.3.2)
✓ Verified with original repro steps
✓ No longer reproducible
✓ Closing as resolved
```

**Won't fix:**
```
Accepted as "won't fix" due to:
- Low impact (< 0.1% users)
- Workaround exists (use desktop)
- Cost of fix > benefit
```

## Metrics for Bug Report Quality

### Good Bug Reports Have:
- Clear, reproducible steps (100%)
- Environment information (100%)
- Expected vs actual behavior (100%)
- Screenshots or logs (80%)
- Business impact stated (90%)
- Quick developer response time (<1 day)

### Poor Bug Reports Have:
- Developers asking for more info (>3 times)
- Multiple rounds of clarification needed
- Cannot be reproduced
- Marked as "invalid" or "duplicate"

## Using with QE Agents

### Automated Bug Triage

**qe-quality-analyzer** assists in bug triage and categorization:
```typescript
// Agent analyzes and triages bug report
const triage = await agent.triageBug({
  title: 'Payment fails for orders > $1000',
  description: bugDescription,
  steps: reproductionsteps,
  expectedBehavior: '...',
  actualBehavior: '...',
  attachments: screenshots
});

// Returns:
// {
//   severity: 'critical',
//   priority: 'high',
//   likelyComponent: 'payment-service',
//   suggestedAssignee: 'payments-team',
//   relatedIssues: ['#123', '#456'],
//   estimatedImpact: '5% of transactions affected'
// }
```

### Intelligent Bug Duplication Detection

```typescript
// Agent detects duplicate bug reports
const duplicateCheck = await agent.checkDuplicates({
  bugReport: newBug,
  searchIn: 'open-and-closed',
  similarityThreshold: 0.85
});

// Returns:
// {
//   isDuplicate: true,
//   originalIssue: '#789',
//   similarity: 0.92,
//   recommendation: 'Close as duplicate of #789'
// }
```

### Bug Report Quality Enhancement

```typescript
// Agent improves bug report quality
const enhanced = await qe-quality-analyzer.enhanceBugReport({
  originalReport: userSubmittedBug,
  addMissingInfo: true,
  suggestReproSteps: true,
  identifyRootCause: true
});

// Agent adds:
// - Environment details
// - Browser/OS information
// - Clearer reproduction steps
// - Potential root cause analysis
```

### Fleet Coordination for Bug Investigation

```typescript
const bugFleet = await FleetManager.coordinate({
  strategy: 'bug-investigation',
  agents: [
    'qe-quality-analyzer',        // Triage and categorize
    'qe-flaky-test-hunter',       // Check if test-related
    'qe-regression-risk-analyzer', // Assess regression risk
    'qe-production-intelligence'   // Check production logs
  ],
  topology: 'parallel'
});
```

---

## Related Skills

**Communication:**
- [technical-writing](../technical-writing/) - Clear bug documentation
- [code-review-quality](../code-review-quality/) - Bug reporting in reviews

**Testing:**
- [exploratory-testing-advanced](../exploratory-testing-advanced/) - Finding bugs through exploration
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven bug workflows

---

## Remember

Your bug report is the starting point for someone else's work. Make it:
- **Complete** - All info needed to understand and fix
- **Clear** - Anyone can follow your steps
- **Concise** - No unnecessary information
- **Actionable** - Developer knows what to do next

**Good bug reports = Faster fixes = Better product = Happier users**
