---
name: Advanced Exploratory Testing
description: Advanced exploratory testing techniques with Session-Based Test Management (SBTM), RST heuristics, and test tours. Use when planning exploration sessions, investigating bugs, or discovering unknown quality risks.
---

# Advanced Exploratory Testing

## Core Concept

Exploratory testing is simultaneous learning, test design, and test execution. It's not "ad-hoc" testing - it's skilled investigation guided by heuristics, experience, and critical thinking.

## Session-Based Test Management (SBTM)

### Session Structure

**Charter (Mission Statement)**
```
Explore [area]
With [resources/tools]
To discover [information/risks]
```

**Example:**
"Explore the checkout payment flow with various card types to discover edge cases in error handling and validation."

### Session Duration
- **Short:** 45-60 minutes (focused investigation)
- **Standard:** 90 minutes (deeper exploration)
- **Long:** 2 hours (complex feature deep dive)

**Why time-box?** Prevents endless wandering, creates focus, enables planning.

### Session Notes Template

```markdown
## Session Charter
[Your mission]

## Start Time: [timestamp]
## Tester: [name]

## Test Notes (What you did)
- Tested checkout with Visa card → Success
- Tried expired card → Error message unclear "Payment failed" 
- Discovered: No distinction between expired, invalid, or declined
- Tried $0.01 transaction → Processed (should block?)
- Card with special chars in name → App crashed (500 error)

## Bugs Found
1. [BUG-123] Unclear error messages for card failures
2. [BUG-124] App crashes on special characters in cardholder name
3. [BUG-125] Micro-transactions not blocked despite policy

## Questions / Issues
- What's the minimum transaction amount?
- Should we support international cards?
- Who handles fraud detection?

## Areas Not Covered
- Refund flow
- Subscription payments
- Multiple payment methods

## Duration: [actual time]
## Session %: [test execution vs setup/bugs/other]
```

### Session Metrics

**TBS (Test/Bug/Setup) Breakdown:**
- **Test %:** Actual exploration time
- **Bug %:** Time investigating/reporting bugs
- **Setup %:** Time getting environment ready

**Target:** 60-70% test, rest is normal overhead

## RST Heuristics Deep Dive

### SFDIPOT (Quality Criteria)

**Structure**
- Is the code organized logically?
- Are modules properly separated?
- Dependencies managed correctly?
- Configuration files valid?

**Test:** "Import malformed config file, does app handle gracefully?"

**Function**
- Does it do what it claims?
- All features working as expected?
- Business logic correct?

**Test:** "Calculate 15% tip on $47.82, does it match manual calculation?"

**Data**
- Input validation working?
- Data types handled correctly?
- Boundary values tested?
- Data persistence reliable?

**Test:** "Enter 999-character username, what happens?"

**Interfaces**
- APIs returning correct responses?
- UI elements responding properly?
- Integration points working?
- Error messages clear?

**Test:** "Call API with missing required field, is error message helpful?"

**Platform**
- Works across browsers/devices?
- OS compatibility verified?
- Screen sizes handled?
- Network conditions varied?

**Test:** "Use on mobile Chrome, iOS Safari, desktop Firefox - any differences?"

**Operations**
- Installation smooth?
- Upgrade path works?
- Logs useful for debugging?
- Performance acceptable?

**Test:** "Upgrade from v2.1 to v3.0, does migration preserve data?"

**Time**
- Handles timeouts correctly?
- Concurrent operations safe?
- Scheduled tasks running?
- Race conditions handled?

**Test:** "Submit form twice rapidly, does it create duplicate records?"

### FEW HICCUPPS (Product Elements to Test)

**Familiarity** - Is it like things users know?
**Explainability** - Can users understand it?
**World** - Does it work in the real world context?

**History** - Consistent with previous versions?
**Image** - Does it match brand/expectations?
**Comparable Products** - How does it compare to competitors?
**Claims** - Does it deliver on promises?
**Users** - Does it meet user needs?
**Purpose** - Does it solve the problem?
**Policies** - Compliant with regulations?
**Standards** - Meets industry standards?

### CRUSSPIC STMP (Test Techniques)

**Create** - Create new records/entities
**Read** - View/retrieve information
**Update** - Modify existing data
**Search** - Find specific items
**Sort** - Order results
**Print** - Export/output data
**Import** - Bring in external data
**Configure** - Change settings

**Status** - Check system state
**Tourism** - Explore like different user types
**Modeling** - Model expected behavior
**Patterns** - Look for recurring issues

### Test Tours (Exploration Strategies)

**Business District Tour**
Visit critical business functions first. Focus on revenue-generating features.

**Example:** E-commerce → checkout, payment, order confirmation

**Historical Tour**
Test areas with known bug history. Old problems often resurface.

**Example:** Check last 3 sprints' bug reports, test those areas

**Bad Neighborhood Tour**
Explore where bugs cluster. Some modules are just trouble-prone.

**Example:** If authentication always has issues, test it thoroughly

**Tourist Tour**
Follow the path a new user would take. First impressions matter.

**Example:** Sign up → onboarding → first successful action

**Museum Tour**
Explore help documentation, examples, tutorials. Do they work?

**Example:** Follow the "Getting Started" guide exactly as written

**Saboteur Tour**
Try to break things deliberately. Think like an attacker or malicious user.

**Example:** SQL injection attempts, XSS, CSRF, buffer overflows

**Fed-Ex Tour**
Follow data through the system. Track it end-to-end.

**Example:** User registration → email verification → profile creation → first purchase

**All-Nighter Tour**
Test during extended use. Does performance degrade over time?

**Example:** Leave app running for 8 hours with periodic interactions

**Obsessive-Compulsive Tour**
Repeat the same operation many times. Does it stay consistent?

**Example:** Save document 50 times in a row, check for corruption

**Supermodel Tour**
Focus purely on UI/UX. Is it beautiful AND usable?

**Example:** Check spacing, fonts, colors, alignment, accessibility

**Couch Potato Tour**
Do the minimum possible. Does lazy usage break things?

**Example:** Leave forms partially filled, navigate away and back

**Antisocial Tour**
Refuse to follow expected workflow. Go backward, skip steps, break sequence.

**Example:** Checkout without items, skip required steps, use back button

## Exploratory Test Design Patterns

### Pattern 1: Variation Testing

Pick one variable, vary it systematically while keeping others constant.

**Example: Login Testing**
```
Username: valid
Password: [vary this]
- Empty
- Wrong password
- Correct password
- SQL injection string
- 1000 characters
- Special characters
- Unicode
```

### Pattern 2: Boundary Testing

Test edges and limits.

```
Field: Age
- Minimum valid: 18
- Just below: 17
- Just above: 19
- Maximum valid: 120
- Just above max: 121
- Zero: 0
- Negative: -5
- Non-integer: 18.5
```

### Pattern 3: Combo Testing

Test interactions between features.

```
Feature A: Dark mode
Feature B: High contrast mode
Test: Both enabled simultaneously - readable?
```

### Pattern 4: State Transition Testing

Map application states, test transitions.

```
Cart States:
Empty → Has Items → Checkout Started → Payment → Order Complete

Test each transition and invalid transitions:
- Empty → Checkout (should block)
- Has Items → Order Complete (skip payment - should block)
```

### Pattern 5: Interrupt Testing

Interrupt processes mid-flow.

```
During file upload:
- Close browser
- Kill network
- Power off device
- Navigate away
Result: Should recover gracefully
```

## Bug Reporting from Exploration

### Effective Bug Report Structure

```markdown
## BUG-456: Checkout crashes on special characters in address

**Severity:** High
**Priority:** Medium

**Environment:**
- Chrome 118.0 on macOS 14.1
- Production environment
- User role: Customer

**Steps to Reproduce:**
1. Add item to cart
2. Proceed to checkout
3. Enter address with apostrophe: "123 O'Brien Street"
4. Click "Continue"

**Expected Result:**
Address accepted, proceed to payment

**Actual Result:**
500 Internal Server Error
Console shows: "Unescaped character in SQL query"

**Additional Context:**
- Tested with other special chars: &, <, > - same crash
- Regular addresses work fine
- Issue reproducible 100% of the time
- Potential SQL injection vulnerability

**Logs:**
[Attach relevant logs]

**Screenshots:**
[Attach error screenshot]

**Impact:**
- Blocks all users with apostrophes in address
- Estimated 2-5% of user base
- Security risk (SQL injection)

**Workaround:**
Tell users to omit apostrophes temporarily

**Suggested Fix:**
Parameterize SQL queries, use prepared statements
```

### Bug Triage During Exploration

**Stop and file immediately if:**
- Security vulnerability
- Data corruption
- Complete feature failure
- Crash/exception

**Note and continue if:**
- Minor UI glitch
- Spelling error
- Edge case with workaround
- Performance slightly slower

**End session notes if:**
- Multiple similar bugs (pattern detected)
- Enhancement ideas
- Questions for product team

## Collaborative Exploratory Testing

### Pair Exploration

**Navigator:** Directs testing strategy, takes notes
**Driver:** Operates application, reports observations

**Benefits:**
- Two perspectives simultaneously
- One focuses on exploration, one on documentation
- Real-time discussion of findings
- Better coverage

**Rotation:** Switch roles every 20-30 minutes

### Mob Exploration

3-5 people exploring together:
- One driver
- Others observe, suggest tests, take notes
- Rotate driver every 15 minutes

**Use when:**
- Complex new feature
- High-risk area
- Training new testers
- Critical bug investigation

## Exploratory Testing + Automation

### Automation-Assisted Exploration

**Use automation to:**
- Generate test data
- Set up complex scenarios
- Reset environment between sessions
- Capture screenshots/videos automatically
- Monitor logs in real-time

**Example:**
```bash
# Script to set up test scenario
./setup-test-user.sh --role=premium --with-orders=5

# Now explore manually with realistic data ready
```

### Exploration-Informed Automation

**After exploration session:**
1. Identify tests that are:
   - Repetitive
   - Regression-prone  
   - Require exact same steps
   
2. Automate those specific tests

3. Continue exploring new areas

**Don't automate:**
- Exploratory testing itself
- One-time investigations
- Rapidly changing features

## Metrics for Exploratory Testing

### Session Coverage

Track which areas explored:
```
Feature Map:
├─ Authentication [explored]
│  ├─ Login [thoroughly tested]
│  ├─ Registration [briefly tested]
│  └─ Password Reset [not yet tested]
├─ Checkout [explored]
│  ├─ Cart [thoroughly tested]
│  ├─ Payment [medium coverage]
│  └─ Confirmation [briefly tested]
```

### Bug Detection Rate

```
Sprint 12:
- 8 exploratory sessions (12 hours total)
- 23 bugs found
- 19 bugs were unique (not found by automation)
- Bug detection rate: 1.9 bugs/hour
```

### Risk Coverage

```
High-risk areas (payment, auth, data export):
- Planned: 10 hours
- Executed: 12 hours
- Bugs found: 15 (5 critical)
- Status: Well covered

Medium-risk areas:
- Planned: 6 hours
- Executed: 4 hours
- Bugs found: 7 (0 critical)
- Status: More exploration needed

Low-risk areas:
- Planned: 2 hours
- Executed: 1 hour
- Status: Adequate
```

## Common Mistakes

### ❌ No Charter
**Problem:** Aimless wandering, unclear what was tested

**Fix:** Always start with clear charter

### ❌ Too Long Sessions
**Problem:** Mental fatigue, diminishing returns after 2 hours

**Fix:** Keep sessions 45-90 minutes, take breaks

### ❌ Not Taking Notes
**Problem:** Can't reproduce bugs, forget what was tested

**Fix:** Take notes continuously during session

### ❌ Testing Same Things
**Problem:** Repetitive testing, missing new areas

**Fix:** Use session coverage map, vary tours

### ❌ Ignoring Automation
**Problem:** Wasting time on repetitive setup

**Fix:** Automate environment setup, data generation

## Advanced Techniques

### Hypothesis-Driven Exploration

```
Hypothesis: "Payment fails under high load"

Test Design:
1. Simulate 100 concurrent checkouts
2. Monitor error rates
3. Check if errors correlate with load
4. Investigate failed transactions

Result: Confirmed - database connection pool exhausted
```

### Personas-Based Exploration

Test as different user types:

**Persona 1: Novice User**
- Doesn't read instructions
- Makes mistakes frequently
- Uses basic features only

**Persona 2: Power User**
- Uses keyboard shortcuts
- Combines features in unexpected ways
- Pushes limits

**Persona 3: Malicious User**
- Tries to break security
- Attempts to access unauthorized data
- Injects malicious input

### State Model Exploration

```
Application States:
[Logged Out] → [Logged In] → [Premium User] → [Suspended]

Test state transitions:
- Valid: Logged Out → Logged In ✓
- Invalid: Logged Out → Premium User ✗ (should block)
- Edge: Suspended → attempt action (should prevent)
```

## Tools for Exploratory Testing

**Session Management:**
- Rapid Reporter (session notes)
- TestBuddy (charters and notes)
- Excel/Notion (custom templates)

**Screen Recording:**
- OBS Studio (screen capture)
- Loom (quick videos)
- Browser DevTools (network/console logs)

**Note Taking:**
- Obsidian (markdown notes with linking)
- Notion (structured templates)
- Simple text file (lightweight)

**Test Data:**
- Faker.js (generate realistic data)
- Mockaroo (custom data sets)
- SQL scripts (predefined scenarios)

## Remember

Exploratory testing is not:
- Random clicking
- Unstructured chaos
- What you do when lazy

Exploratory testing IS:
- Skilled investigation
- Structured thinking
- Critical analysis
- Creative test design
- Continuous learning

**Balance automation and exploration. Neither replaces the other.**
