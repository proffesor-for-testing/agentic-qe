# Quality Metrics

## Core Principle

**Measure what matters, not what's easy to measure.**

Metrics should drive better decisions, not just prettier dashboards. If a metric doesn't change behavior or inform action, stop tracking it.

## The Vanity Metrics Problem

### Vanity Metrics (Stop Measuring These)

**Test Count**
- "We have 5,000 tests!"
- So what? Are they finding bugs? Are they maintainable? Do they give confidence?

**Code Coverage Percentage**
- "We achieved 85% coverage!"
- Useless without context. 85% of what? Critical paths? Or just getters/setters?

**Test Cases Executed**
- "Ran 10,000 test cases today!"
- How many found problems? How many are redundant?

**Bugs Found**
- "QA found 200 bugs this sprint!"
- Is that good or bad? Are they trivial or critical? Should they have been found earlier?

**Story Points Completed**
- "We completed 50 points of testing work!"
- Points are relative and gameable. What actually got better?

### Why Vanity Metrics Fail

1. **Easily gamed**: People optimize for the metric, not the goal
2. **No context**: Numbers without meaning
3. **No action**: What do you do differently based on this number?
4. **False confidence**: High numbers that mean nothing

## Meaningful Metrics

### 1. Defect Escape Rate

**What**: Percentage of bugs that reach production vs. caught before release

**Why it matters**: Measures effectiveness of your quality process

**How to measure**:
```
Defect Escape Rate = (Production Bugs / Total Bugs Found) × 100
```

**Good**: < 5% escape rate
**Needs work**: > 15% escape rate

**Actions**:
- High escape rate → Shift testing left, improve risk assessment
- Low escape rate but slow releases → Maybe over-testing, reduce friction

### 2. Mean Time to Detect (MTTD)

**What**: How long from bug introduction to discovery

**Why it matters**: Faster detection = cheaper fixes

**How to measure**:
```
MTTD = Time bug found - Time bug introduced
```

**Good**: < 1 day for critical paths
**Needs work**: > 1 week

**Actions**:
- High MTTD → Add monitoring, improve test coverage on critical paths
- Very low MTTD → Your fast feedback loops are working

### 3. Mean Time to Resolution (MTTR)

**What**: Time from bug discovery to fix deployed

**Why it matters**: Indicates team efficiency and process friction

**How to measure**:
```
MTTR = Time fix deployed - Time bug discovered
```

**Good**: < 24 hours for critical bugs, < 1 week for minor
**Needs work**: > 1 week for critical bugs

**Actions**:
- High MTTR → Investigate bottlenecks (test env access? deployment pipeline? handoffs?)
- Very low MTTR but high escape rate → Rushing fixes, need better verification

### 4. Deployment Frequency

**What**: How often you deploy to production

**Why it matters**: Proxy for team confidence and process maturity

**How to measure**:
```
Deployments per week (or day)
```

**Good**: Multiple per day
**Decent**: Multiple per week
**Needs work**: Less than weekly

**Actions**:
- Low frequency → Reduce batch size, improve automation, build confidence
- High frequency with high defect rate → Need better automated checks

### 5. Change Failure Rate

**What**: Percentage of deployments that cause production issues

**Why it matters**: Measures release quality

**How to measure**:
```
Change Failure Rate = (Failed Deployments / Total Deployments) × 100
```

**Good**: < 5%
**Needs work**: > 15%

**Actions**:
- High failure rate → Improve pre-production validation, add canary deployments
- Very low but slow releases → Maybe you can deploy more frequently

### 6. Test Execution Time

**What**: How long your test suite takes to run

**Why it matters**: Slow tests = slow feedback = less frequent testing

**How to measure**:
```
Time from commit to test completion
```

**Good**: < 10 minutes for unit tests, < 30 minutes for full suite
**Needs work**: > 1 hour

**Actions**:
- Slow tests → Parallelize, remove redundant tests, optimize slow tests
- Fast tests but bugs escaping → Coverage gaps, need better tests

### 7. Flaky Test Rate

**What**: Percentage of tests that fail intermittently

**Why it matters**: Flaky tests destroy confidence

**How to measure**:
```
Flaky Test Rate = (Flaky Tests / Total Tests) × 100
```

**Good**: < 1%
**Needs work**: > 5%

**Actions**:
- High flakiness → Fix or delete flaky tests immediately (quarantine pattern)
- Low flakiness → Maintain vigilance, don't let it creep up

## Context-Specific Metrics

### For Startups

**Focus on**:
- Deployment frequency (speed to market)
- Critical path coverage (protect revenue)
- MTTR (move fast, fix fast)

**Skip**:
- Comprehensive coverage metrics
- Detailed test documentation
- Complex traceability

### For Regulated Industries

**Focus on**:
- Traceability (requirement → test → result)
- Test documentation completeness
- Audit trail integrity

**Don't skip**:
- Deployment frequency still matters
- But compliance isn't optional

### For Established Products

**Focus on**:
- Defect escape rate (protect reputation)
- Regression detection (maintain stability)
- Test maintenance cost

**Balance**:
- Innovation vs. stability
- New features vs. technical debt

## Leading vs. Lagging Indicators

### Lagging Indicators (Rearview Mirror)
- Defect escape rate
- Production incidents
- Customer complaints
- MTTR

**Use for**: Understanding what happened, trending over time

### Leading Indicators (Windshield)
- Code review quality
- Test coverage on new code
- Deployment frequency trend
- Team confidence surveys

**Use for**: Predicting problems, early intervention

## Metrics for Different Audiences

### For Developers
- Test execution time
- Flaky test rate
- Code review turnaround
- Build failure frequency

**Language**: Technical, actionable

### For Product/Management
- Deployment frequency
- Change failure rate
- Feature lead time
- Customer-impacting incidents

**Language**: Business outcomes, not technical details

### For Executive Leadership
- Defect escape rate trend
- Mean time to resolution
- Release velocity
- Customer satisfaction (related to quality)

**Language**: Business impact, strategic

## Building a Metrics Dashboard

### Essential Dashboard (Start Here)

**Top Row (Health)**
- Defect escape rate (last 30 days)
- Deployment frequency (last 7 days)
- Change failure rate (last 30 days)

**Middle Row (Speed)**
- MTTD (average, last 30 days)
- MTTR (average, last 30 days)
- Test execution time (current)

**Bottom Row (Trends)**
- All of the above as sparklines (3-6 months)

### Advanced Dashboard (If Needed)

Add:
- Flaky test rate
- Test coverage on critical paths (not overall %)
- Production error rate
- Customer-reported bugs vs. internally found

## Anti-Patterns

### ❌ Metric-Driven Development
**Problem**: Optimizing for metrics instead of quality

**Example**: Writing useless tests to hit coverage targets

**Fix**: Focus on outcomes (can we deploy confidently?) not numbers

### ❌ Too Many Metrics
**Problem**: Dashboard overload, no clear priorities

**Example**: Tracking 30+ metrics that no one understands

**Fix**: Start with 5-7 core metrics, add only if they drive decisions

### ❌ Metrics Without Action
**Problem**: Tracking numbers but not changing behavior

**Example**: Watching MTTR climb for months without investigating

**Fix**: For every metric, define thresholds and actions

### ❌ Gaming the System
**Problem**: People optimize for metrics, not quality

**Example**: Marking bugs as "won't fix" to improve resolution time

**Fix**: Multiple complementary metrics, qualitative reviews

### ❌ One-Size-Fits-All
**Problem**: Using same metrics for all teams/contexts

**Example**: Measuring startup team same as regulated medical device team

**Fix**: Context-driven metric selection

## Metric Hygiene

### Review Quarterly
- Are we still using this metric to make decisions?
- Is it being gamed?
- Does it reflect current priorities?

### Adjust Thresholds
- What's "good" changes as you improve
- Don't keep celebrating the same baseline
- Raise the bar when appropriate

### Kill Zombie Metrics
- If no one looks at it → Delete it
- If no one can explain what action to take → Delete it
- If it's always green or always red → Delete it

## Real-World Examples

### Example 1: E-Commerce Company

**Before**:
- Measured: Test count (5,000 tests)
- Result: Slow CI, frequent production bugs

**After**:
- Measured: Defect escape rate (8%), MTTD (3 days), deployment frequency (2/week)
- Actions: 
  - Removed 2,000 redundant tests
  - Added monitoring for critical paths
  - Improved deployment pipeline
- Result: Escape rate to 3%, MTTD to 6 hours, deploy 5x/day

### Example 2: SaaS Platform

**Before**:
- Measured: Code coverage (85%)
- Result: False confidence, bugs in uncovered critical paths

**After**:
- Measured: Critical path coverage (60%), deployment frequency, change failure rate
- Actions:
  - Focused testing on payment, auth, data integrity
  - Removed tests on deprecated features
  - Added production monitoring
- Result: Fewer production incidents, faster releases

## Questions to Ask About Any Metric

1. **What decision does this inform?**
   - If none → Don't track it

2. **What action do we take if it's red?**
   - If you don't know → Define thresholds and actions

3. **Can this be gamed?**
   - If yes → Add complementary metrics

4. **Does this reflect actual quality?**
   - If no → Replace it with something that does

5. **Who needs to see this?**
   - If no one → Stop tracking it

## Remember

**Good metrics**:
- Drive better decisions
- Are actionable
- Reflect actual outcomes
- Change as you mature

**Bad metrics**:
- Make dashboards pretty
- Are easily gamed
- Provide false confidence
- Persist long after they're useful

**Start small**: 5-7 metrics that matter
**Review often**: Quarterly at minimum
**Kill ruthlessly**: Remove metrics that don't drive action
**Stay contextual**: What matters changes with your situation

## Resources

- **Accelerate** by Forsgren, Humble, Kim (DORA metrics)
- **How to Measure Anything** by Douglas Hubbard (measuring intangibles)
- Your own retrospectives (which metrics helped? Which didn't?)

Metrics are tools for better decisions, not scorecards for performance reviews. Use them wisely.
