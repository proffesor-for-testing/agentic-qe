---
name: code-review-quality
description: Conduct context-driven code reviews focusing on quality, testability, and maintainability. Use when reviewing code, providing feedback, or establishing review practices.
---

# Code Review Quality

## Core Philosophy

Code review is about learning, teaching, and improving quality - not gatekeeping or showing off. Be constructive, be specific, be kind.

**Key principle:** Review code like you're helping a colleague, not judging them.

## The Code Review Mindset

### What You're Looking For

**Must address:**
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Breaking changes

**Should address:**
- Unclear naming
- Missing tests
- Duplicated code
- Complex logic

**Nice to have:**
- Style inconsistencies (if not auto-fixable)
- Minor optimizations
- Suggestions for improvement

**Not your job:**
- Enforcing personal preferences
- Rewriting in your style
- Nitpicking formatting (use linter)

### Questions to Ask Yourself

**Is this a problem or a preference?**
- Problem: Will cause bugs, confuse future maintainers
- Preference: "I would have done it differently"

**Is this blocking or non-blocking?**
- Blocking: Must fix before merge
- Non-blocking: Suggestion for future improvement

**Am I teaching or judging?**
- Teaching: "Here's why this could be better"
- Judging: "This is wrong"

## Feedback Levels

Use these prefixes to indicate severity:

**🔴 BLOCKER** - Must fix before merging
```
🔴 This function has SQL injection vulnerability.
Use parameterized queries instead.
```

**🟡 MAJOR** - Should fix, but not necessarily blocking
```
🟡 This test doesn't actually verify the error handling.
Consider adding assertion for error message.
```

**🟢 MINOR** - Nice to have, optional
```
🟢 Consider extracting this into a separate function
for better readability (optional).
```

**💡 SUGGESTION** - Ideas for improvement
```
💡 For future consideration: We could cache this
result to improve performance.
```

## The Review Process

### 1. Understand the Context

**Before reviewing code, check:**
- PR description - What problem does this solve?
- Linked issues/tickets - Why is this needed?
- Related PRs - Is this part of larger change?

**Bad start:** Jump straight to code and criticize
**Good start:** Understand what they're trying to accomplish

### 2. Review at Different Levels

**High-level (5 min):**
- Does approach make sense?
- Are there architectural concerns?
- Does it fit with existing patterns?

**Detail-level (15-30 min):**
- Logic correctness
- Edge cases handled?
- Error handling adequate?
- Tests sufficient?

**Micro-level (5 min):**
- Naming clear?
- Code readable?
- Comments where needed?

### 3. Look for Common Issues

**Logic Errors**
```javascript
// 🔴 BLOCKER: Logic error
if (price > 100 && price < 50) { // Impossible condition
  applyDiscount();
}

// Should be:
if (price > 100 || (price >= 50 && price <= 100)) {
  applyDiscount();
}
```

**Null/Undefined Handling**
```javascript
// 🟡 MAJOR: Possible null reference
function calculateTotal(order) {
  return order.items.reduce(...); // What if order.items is null?
}

// Suggestion:
function calculateTotal(order) {
  if (!order?.items?.length) return 0;
  return order.items.reduce(...);
}
```

**Race Conditions**
```javascript
// 🔴 BLOCKER: Race condition
async function updateInventory(productId, quantity) {
  const product = await db.products.findById(productId);
  product.stock -= quantity; // Not atomic!
  await product.save();
}

// Suggestion:
async function updateInventory(productId, quantity) {
  await db.products.updateOne(
    { _id: productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } }
  );
}
```

**Missing Tests**
```javascript
// 🟡 MAJOR: Missing test coverage
function calculateDiscount(price, customerType) {
  // Complex business logic
  // ...
}

// No tests provided. Should test:
// - Different customer types
// - Edge cases (price = 0, negative)
// - Boundary values
```

**Security Issues**
```javascript
// 🔴 BLOCKER: SQL injection vulnerability
const query = `SELECT * FROM users WHERE email = '${email}'`;

// Use parameterized query:
const query = 'SELECT * FROM users WHERE email = ?';
db.query(query, [email]);
```

## Writing Good Review Comments

### Be Specific

**Bad:**
```
This function is too long.
```

**Good:**
```
🟡 This function has 4 distinct responsibilities:
1. Validation
2. Calculation  
3. Database save
4. Email sending

Consider extracting into separate functions for easier testing:
- validateOrder()
- calculateTotal()
- saveOrder()
- sendConfirmation()
```

### Explain Why

**Bad:**
```
Don't use var.
```

**Good:**
```
🟢 Consider using `const` or `let` instead of `var`.
`var` has function scope which can lead to unexpected 
behavior with closures. `const`/`let` have block scope
which is more predictable.
```

### Suggest Solutions

**Bad:**
```
This won't work.
```

**Good:**
```
🔴 This will fail when items array is empty.

Suggested fix:
if (!items || items.length === 0) {
  return 0;
}
```

### Ask Questions

**Accusatory:**
```
Why did you do it this way?
```

**Curious:**
```
💡 I'm curious about the approach here. Have you
considered using X pattern? It might simplify
the error handling. What do you think?
```

### Praise Good Work

**Don't just criticize, also highlight good things:**
```
✅ Nice use of early returns to avoid nested conditionals.
This is much more readable than the previous version!
```

```
✅ Great test coverage on the edge cases. The negative
price test is especially important.
```

## The Comment Template

```markdown
🔴/🟡/🟢/💡 [Brief description of issue]

**Current code:**
```[language]
[code snippet]
```

**Issue:**
[Explain what's wrong and why it matters]

**Suggested fix:**
```[language]
[code snippet with solution]
```

**Alternative:**
[If applicable, mention other approaches]
```

### Example Using Template

```markdown
🔴 SQL injection vulnerability in user search

**Current code:**
```javascript
const query = `SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`;
const results = await db.query(query);
```

**Issue:**
User input is directly interpolated into SQL query. An attacker
could inject SQL code (e.g., searchTerm = "'; DROP TABLE users--")

**Suggested fix:**
```javascript
const query = 'SELECT * FROM users WHERE name LIKE ?';
const results = await db.query(query, [`%${searchTerm}%`]);
```

**Alternative:**
If using an ORM:
```javascript
const results = await User.findAll({
  where: {
    name: { [Op.like]: `%${searchTerm}%` }
  }
});
```
```

## What NOT to Review

### Don't Review (Automate Instead)

**Formatting**
- Indentation, spacing, line breaks
- **Solution:** Use Prettier, ESLint with auto-fix

**Code Style**
- Semicolons, quotes, naming conventions
- **Solution:** ESLint, style guide enforced in CI

**Import Order**
- Which imports come first
- **Solution:** ESLint plugin for imports

**Type Errors**
- TypeScript compile errors
- **Solution:** TypeScript in CI

### Focus Human Review On

- Logic correctness
- Business logic implementation
- Test quality and coverage
- Security concerns
- Performance issues
- API design
- Error handling
- Edge cases

## Review Checklist

### Functionality
- [ ] Does code do what PR says it does?
- [ ] Are edge cases handled?
- [ ] Is error handling adequate?
- [ ] What happens with invalid input?

### Tests
- [ ] Are there tests?
- [ ] Do tests actually test the logic?
- [ ] Are edge cases tested?
- [ ] Are error cases tested?
- [ ] Can I understand what's being tested?

### Security
- [ ] Input validation present?
- [ ] SQL injection prevented?
- [ ] XSS prevented?
- [ ] Authorization checks in place?
- [ ] Secrets not hardcoded?

### Performance
- [ ] No obvious performance issues?
- [ ] Database queries optimized?
- [ ] No N+1 queries?
- [ ] Appropriate use of caching?

### Maintainability
- [ ] Code is readable?
- [ ] Naming is clear?
- [ ] Complex logic is commented?
- [ ] No obvious duplication?
- [ ] Follows existing patterns?

### Documentation
- [ ] Public API documented?
- [ ] Complex logic explained?
- [ ] README updated if needed?

## Handling Disagreements

### When Author Disagrees with Your Feedback

**Your comment:**
```
🟡 Consider extracting this into a separate function.
```

**Their response:**
```
I don't think that's necessary. The function is fine as is.
```

**Your options:**

**If non-blocking (🟢💡):**
```
Fair enough! It's a stylistic preference. Feel free to leave as is.
```

**If important (🟡):**
```
I understand your perspective. My concern is that this
function currently handles 4 different responsibilities,
which makes it harder to test in isolation. Would you be
open to extracting just the calculation logic?
```

**If critical (🔴):**
```
I appreciate you're trying to keep it simple, but this
is a security vulnerability. We need to fix this before
merging. Let's discuss the best approach - happy to pair
on it if helpful.
```

### When You're Wrong

**Happens to everyone. Be gracious:**
```
You're absolutely right - I missed that this is handled
in the middleware layer. Thanks for clarifying! 
Resolving this comment.
```

## Review Timing

### How Long Should Review Take?

**Small PR (<100 lines):** 10-15 minutes
**Medium PR (100-500 lines):** 30-45 minutes  
**Large PR (>500 lines):** 1-2 hours (or ask to split)

### When to Request Changes

**Immediately:** Critical bugs, security issues
**Within 4 hours:** Normal business hours, blocking work
**Within 24 hours:** Non-urgent, non-blocking

### When PR is Too Large

```
This PR is quite large (847 lines). Would you consider
splitting into smaller PRs? It's hard to review thoroughly
in one go, and increases risk of missing issues.

Suggested splits:
1. Database schema changes
2. API endpoints
3. Frontend components
4. Tests

Happy to prioritize reviewing the first chunk today!
```

## Common Review Smells

### Unhelpful Reviews

**❌ Just "LGTM"**
- Not helpful unless you actually reviewed thoroughly

**❌ Nitpicking**
- 20 comments about spacing and naming
- 0 comments about logic

**❌ Rewriting in Your Style**
- "I would do it this way" (but their way works fine)

**❌ Demanding Perfection**
- "Rewrite this entire module"
- (When minor improvements would suffice)

**❌ Being a Gatekeeper**
- Blocking PRs unnecessarily
- Making approval feel like pulling teeth

### Helpful Reviews

**✅ Constructive Feedback**
- Specific, actionable, explained

**✅ Praise + Improvements**
- Highlight good work
- Suggest improvements where needed

**✅ Teaching Moments**
- Explain why, not just what
- Share knowledge and context

**✅ Focus on Impact**
- Prioritize important issues
- Let minor things go

**✅ Timely Response**
- Review within reasonable time
- Don't block progress unnecessarily

## Example Reviews

### Excellent Review Comment

```markdown
🔴 Memory leak in event handler

**Current code:**
```javascript
useEffect(() => {
  window.addEventListener('resize', handleResize);
}, []);
```

**Issue:**
Event listener is registered but never cleaned up. On component
unmount, the listener remains active, causing a memory leak.
This will accumulate if component mounts/unmounts frequently.

**Suggested fix:**
```javascript
useEffect(() => {
  window.addEventListener('resize', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

The return function acts as cleanup, removing the listener when
component unmounts.

**Further reading:**
React docs on cleanup: https://react.dev/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed
```

### Poor Review Comment

```markdown
This is bad. Rewrite it.
```

**Problems:**
- Not specific
- No explanation
- No suggestion
- Unhelpful tone

## Reviewing Your Own Code

Before requesting review:

### Self-Review Checklist
- [ ] Read through entire diff
- [ ] Remove debug code, console.logs
- [ ] Check for commented-out code
- [ ] Verify tests pass locally
- [ ] Update documentation if needed
- [ ] Write clear PR description
- [ ] Add screenshots/videos if UI change
- [ ] Link related issues

### Pre-Review Your Own Comments

Add comments explaining:
- Non-obvious decisions
- Workarounds and why
- Areas you're unsure about
- Questions for reviewers

```javascript
// NOTE: Using setTimeout here instead of requestAnimationFrame
// because we need this to run after React's commit phase.
// Tried RAF but it caused flicker on initial render.
setTimeout(() => scrollToElement(ref.current), 0);
```

## Using with QE Agents

### Automated Code Review with qe-quality-analyzer

**qe-quality-analyzer** performs intelligent code review:
```typescript
// Agent analyzes PR for quality issues
const reviewAnalysis = await agent.reviewCode({
  files: prChanges,
  depth: 'comprehensive',
  checkBugs: true,
  checkSecurity: true,
  checkPerformance: true,
  checkMaintainability: true
});

// Returns categorized feedback
// {
//   blockers: [{ file, line, issue, severity: 'BLOCKER' }],
//   major: [{ file, line, issue, severity: 'MAJOR' }],
//   suggestions: [{ file, line, suggestion, severity: 'MINOR' }],
//   qualityScore: 0.87
// }
```

### Human-Agent Collaborative Review

```typescript
// Agent does first-pass review, human refines
const agentReview = await qe-quality-analyzer.reviewCode(prChanges);
const humanRefinements = await human.refineReview(agentReview);
const finalReview = await agent.formatFeedback({
  agentFindings: agentReview,
  humanInsights: humanRefinements,
  useEmojis: true  // 🔴 🟡 🟢 💡
});
```

### Fleet Coordination for Comprehensive Review

```typescript
// Multiple agents review different aspects
const reviewFleet = await FleetManager.coordinate({
  strategy: 'code-review',
  agents: [
    'qe-quality-analyzer',      // Overall quality
    'qe-security-scanner',       // Security vulnerabilities
    'qe-performance-tester',     // Performance implications
    'qe-coverage-analyzer'       // Test coverage impact
  ],
  topology: 'parallel'
});

await reviewFleet.execute({
  prNumber: 123,
  aggregateResults: true
});
```

---

## Related Skills

**Core Quality Practices:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven quality workflows
- [holistic-testing-pact](../holistic-testing-pact/) - Quality across all test quadrants

**Development Practices:**
- [refactoring-patterns](../refactoring-patterns/) - Code improvements post-review
- [tdd-london-chicago](../tdd-london-chicago/) - Test-driven development practices
- [xp-practices](../xp-practices/) - Pair programming and ensemble coding

**Communication:**
- [bug-reporting-excellence](../bug-reporting-excellence/) - Report issues found in reviews
- [technical-writing](../technical-writing/) - Document review processes

---

## Remember

**Good code review is:**
- Collaborative, not adversarial
- Teaching, not judging
- Specific, not vague
- Constructive, not destructive
- Timely, not delayed

**The goal is better code and better developers, not perfect code.**

Review with empathy. Everyone writes imperfect code sometimes. Your job is to help make it better, not to prove how smart you are.
