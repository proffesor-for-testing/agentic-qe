---
name: consultancy-practices
description: Apply effective software quality consultancy practices. Use when consulting, advising clients, or establishing consultancy workflows.
version: 1.0.0
category: professional
tags: [consulting, advisory, client-engagement, strategy, transformation, coaching]
difficulty: advanced
estimated_time: 2 hours
author: user
---

# Consultancy Practices

## Core Philosophy

You're not there to impose your process. You're there to help them solve their specific problems in their specific context. Listen first, prescribe second.

**Key principle:** Leave them better than you found them - not dependent on you.

## Types of Engagements

### Assessment / Discovery
**Duration:** 1-4 weeks
**Goal:** Understand current state, identify problems, recommend improvements
**Deliverable:** Report with findings and recommendations

### Transformation / Implementation
**Duration:** 3-12 months
**Goal:** Help team implement new practices, tools, or processes
**Deliverable:** Working system, trained team, documented practices

### Advisory / Coaching
**Duration:** Ongoing (monthly/quarterly)
**Goal:** Provide strategic guidance, review progress, course-correct
**Deliverable:** Regular advice, problem-solving sessions

### Crisis / Fire-Fighting
**Duration:** 1-4 weeks
**Goal:** Fix critical quality issues blocking production
**Deliverable:** Stabilized system, action plan

## The Consulting Process

### Phase 1: Discovery (Week 1-2)

**Understand the Context**
- What's the business goal?
- What's the current pain?
- What have they tried?
- What are the constraints?

**Talk to Everyone**
- Leadership (strategy, budget, expectations)
- Developers (daily reality, technical debt)
- QA/QE (testing challenges, tooling gaps)
- Product (priorities, customer impact)
- Operations (deployment, monitoring)

**Observe, Don't Judge (Yet)**
- Shadow team members
- Review code, tests, processes
- Check metrics and dashboards
- Look at recent incidents

**Key Questions:**
- "Walk me through your last deployment"
- "Tell me about a recent bug that escaped to production"
- "What's the hardest part of your job?"
- "If you could fix one thing, what would it be?"

### Phase 2: Analysis (Week 2-3)

**Identify Root Causes**
Don't stop at symptoms. Five Whys technique:

```
Problem: "Tests are too slow"
Why? → Test suite takes 2 hours
Why? → Too many E2E tests
Why? → No confidence in unit tests
Why? → Unit tests don't catch real bugs
Why? → Tests don't reflect actual use cases

Root cause: Test strategy doesn't match risk profile
```

**Prioritize Issues**
Not everything can be fixed at once. Use impact/effort matrix:

```
High Impact, Low Effort:  Do First
High Impact, High Effort: Plan Carefully  
Low Impact, Low Effort:   Quick Wins
Low Impact, High Effort:  Skip
```

**Consider Constraints**
- Budget limitations
- Skill gaps
- Political dynamics
- Technical debt
- Timeline pressure

### Phase 3: Recommendations (Week 3-4)

**Present Findings**
- Current state (what you observed)
- Impact (cost of not fixing)
- Recommendations (specific, actionable)
- Roadmap (phased approach)

**Format:**
```
Executive Summary (1 page)
- Key findings
- Critical recommendations
- Expected outcomes

Detailed Findings (10-20 pages)
- Each finding with evidence
- Impact assessment
- Specific recommendations
- Implementation approach

Appendices
- Metrics and data
- Interview notes
- Technical details
```

**Present in Layers**
- Leadership: Business impact, ROI, timeline
- Technical team: Implementation details, tools, practices
- Everyone: Clear next steps

### Phase 4: Implementation (Month 2-6+)

**Start Small**
Don't boil the ocean. Pick one high-impact change:

**Example:** "Let's get your deployment time from 4 hours to 30 minutes"
- Faster feedback
- Visible improvement
- Builds trust for bigger changes

**Work Alongside the Team**
- Pair programming
- Ensemble testing
- Workshop facilitation
- Code/test reviews

**Transfer Knowledge**
- Document as you go
- Explain your reasoning
- Teach, don't just do
- Create repeatable practices

**Measure Progress**
- Define success metrics upfront
- Track weekly
- Celebrate wins
- Course-correct quickly

### Phase 5: Transition (Final Month)

**Ensure Self-Sufficiency**
- Team can maintain practices without you
- Documentation is current
- Knowledge is spread (not siloed)
- Clear ownership defined

**Set Up for Long-Term Success**
- Quarterly health checks (optional follow-up)
- Open door for questions
- Community of practice established

## Common Engagement Patterns

### Pattern 1: "We Need Test Automation"

**What they say:** "We need test automation"
**What they mean:** "Manual testing is too slow/expensive"

**Discovery Questions:**
- What are you testing manually now?
- How long does a full regression take?
- What's your deployment frequency?
- What's your biggest quality pain?

**Typical Finding:**
They don't need "test automation." They need:
- Faster feedback on changes
- Confidence to deploy more often
- Better test strategy (automation where it helps)

**Recommendation:**
1. Start with unit tests for new code (TDD)
2. Automate smoke tests for critical paths
3. Keep exploratory testing for discovery
4. Build automation incrementally, not big-bang

### Pattern 2: "Fix Our Quality Problem"

**What they say:** "We have too many bugs"
**What they mean:** "Something is broken but we don't know what"

**Discovery Questions:**
- Where are bugs being found? (testing, staging, production)
- What types of bugs? (functional, performance, security)
- When were they introduced? (recent changes, old code)
- What's the impact? (revenue loss, customer complaints)

**Typical Finding:**
"Quality problem" is usually one of:
- No test strategy (testing randomly)
- Testing too late (after code complete)
- No feedback loops (bugs found weeks later)
- Poor communication (requirements unclear)

**Recommendation:**
Depends on root cause, but often:
- Shift testing left (involve QE earlier)
- Improve test coverage on critical paths
- Speed up feedback (CI/CD improvements)
- Better requirements/acceptance criteria

### Pattern 3: "We Want to Scale Quality"

**What they say:** "We're growing fast, quality can't keep up"
**What they mean:** "We can't hire enough QA fast enough"

**Discovery Questions:**
- What's your current QA:Dev ratio?
- Where are QA resources spending time?
- What bottlenecks exist?
- What's your deployment process?

**Typical Finding:**
QA is a bottleneck because:
- Manual regression testing before every deploy
- QA as gatekeepers, not enablers
- Developers don't write tests
- Quality isn't a whole-team responsibility

**Recommendation:**
- Make QA role strategic, not tactical
- Developers own test automation
- QA focuses on exploratory testing, risk analysis
- Build quality into development process
- Use agentic approaches for scale

## Consulting Anti-Patterns

### ❌ The Cookie-Cutter
**Problem:** Apply same solution everywhere
**Example:** "Everyone should use Selenium for E2E"
**Better:** Understand their context, recommend fit-for-purpose solutions

### ❌ The Tool Pusher
**Problem:** Recommend expensive tools (often for kickbacks)
**Example:** "You need this $100k test management platform"
**Better:** Recommend tools that solve actual problems, regardless of cost

### ❌ The Process Nazi
**Problem:** Impose rigid process
**Example:** "You must follow these 47 steps for every release"
**Better:** Lightweight process that fits their culture

### ❌ The Permanent Fixture
**Problem:** Never actually leave, create dependency
**Example:** "I'll just stay on retainer... indefinitely"
**Better:** Explicitly work toward them not needing you

### ❌ The Blame Game
**Problem:** Point fingers at people instead of fixing systems
**Example:** "Your developers are terrible at testing"
**Better:** "Your developers lack test infrastructure and training"

## Difficult Situations

### "We Already Tried That"

**Response:** "Tell me more about what you tried and what didn't work."

Often they tried a poor implementation or in the wrong context. Learn from their experience.

### "Our Context is Special"

**Response:** "You're right, every context is unique. Help me understand what makes yours special."

They might be right. Or they might be making excuses. Listen first, then challenge assumptions gently.

### "We Don't Have Budget/Time"

**Response:** "What's the cost of not fixing this? Let's start with something small that delivers value quickly."

Show ROI, start with quick wins, build momentum.

### "That Won't Work Here"

**Response:** "What specific constraints make this challenging? Let's adapt the approach."

Acknowledge their concerns, adjust recommendations, find what WILL work.

### "We Need Certification/Compliance"

**Response:** "What are the actual requirements vs. what's nice to have?"

Often "compliance" is over-interpreted. Find the minimum viable compliance.

## Pricing Models

### Time & Materials
**Good for:** Discovery, unclear scope
**Risk:** Client bears cost uncertainty
**Rate:** Daily or hourly

### Fixed Price
**Good for:** Well-defined deliverables
**Risk:** You bear scope creep risk
**Rate:** Project-based

### Retainer
**Good for:** Ongoing advisory
**Risk:** Scope creep if not managed
**Rate:** Monthly fee for X hours/month

### Value-Based
**Good for:** Clear ROI metrics
**Risk:** Requires trust and metrics
**Rate:** % of value delivered

**Example:** "If we reduce your deployment time from 4 hours to 30 minutes, saving your team 200 hours/month, my fee is $X based on that value."

## Building Your Practice

### Start Small
- 1-2 clients initially
- Focus on referrals
- Build case studies
- Learn from each engagement

### Specialize
- Pick a niche (fintech, healthcare, e-commerce)
- Or a practice area (test automation, CI/CD, agentic QE)
- Become known for something specific

### Network
- Speak at conferences
- Write blog posts
- Contribute to communities
- Help people generously (leads to referrals)

### Learn Continuously
- Every client teaches you something
- Study other consultants
- Read business/consulting books
- Practice your craft

## Success Metrics

**For You:**
- Client satisfaction (would they hire you again?)
- Referrals generated
- Project profitability
- Learning and growth

**For Client:**
- Problem actually solved (not just "we hired a consultant")
- Team is self-sufficient
- Measurable improvement in metrics
- Would recommend you to others

## Essential Skills

### Technical Excellence
- Deep expertise in your domain
- Hands-on capability (not just theory)
- Up to date with practices and tools

### Communication
- Listen more than you talk
- Adjust message for audience
- Written and verbal clarity
- Facilitation skills

### Business Acumen
- Understand ROI and costs
- Speak to business outcomes
- Navigate organizational politics
- Negotiation skills

### Teaching
- Transfer knowledge effectively
- Create "aha" moments
- Patience with learning curves
- Adapt to different learning styles

## Your Consulting Toolkit

### Assessment Tools
- Maturity models (adapted to context)
- Interview scripts
- Observation checklists
- Metrics to gather

### Workshop Formats
- Example mapping
- Risk storming
- Retrospective facilitation
- Technical training

### Documentation Templates
- Assessment reports
- Implementation roadmaps
- Practice guides
- Handover documents

### Follow-Up
- Monthly check-ins (first 3 months)
- Quarterly health checks
- Open door for questions
- Community of practice

## Using with QE Agents

### Automated Codebase Assessment

**qe-quality-analyzer** performs comprehensive client codebase analysis:
```typescript
// Agent analyzes client codebase for improvement areas
const assessment = await agent.assessCodebase({
  scope: 'client-project/',
  depth: 'comprehensive',
  reportFormat: 'executive-summary',
  includeMetrics: true,
  includeRecommendations: true
});

// Returns:
// {
//   qualityScore: 0.67,
//   testCoverage: 45,
//   technicalDebt: 'high',
//   securityRisk: 'medium',
//   maintainabilityIndex: 62,
//   recommendations: [...]
// }
```

### Prioritized Recommendations

```typescript
// Agent generates prioritized improvement roadmap
const recommendations = await qe-quality-analyzer.generateRecommendations({
  assessment,
  prioritize: 'high-impact-low-effort',
  timeline: '3-months',
  budget: 'medium',
  teamSize: 5
});

// Returns phased improvement plan:
// Phase 1 (Month 1): Critical security fixes, test automation setup
// Phase 2 (Month 2): Improve test coverage, refactor hotspots
// Phase 3 (Month 3): Performance optimization, monitoring
```

### ROI Analysis for Quality Improvements

```typescript
// Agent calculates ROI for quality initiatives
const roiAnalysis = await qe-quality-analyzer.calculateQualityROI({
  currentState: {
    defectEscapeRate: 0.15,
    mttr: 48,  // hours
    deploymentFrequency: 'weekly'
  },
  proposedImprovements: [
    'test-automation',
    'ci-cd-pipeline',
    'code-review-process'
  ],
  timeframe: '6-months'
});

// Returns:
// {
//   estimatedCost: '$50,000',
//   estimatedSavings: '$120,000/year',
//   paybackPeriod: '3 months',
//   qualityImprovement: '40% fewer production bugs'
// }
```

### Client Engagement Fleet

```typescript
const consultingFleet = await FleetManager.coordinate({
  strategy: 'client-engagement',
  agents: [
    'qe-quality-analyzer',         // Assess current state
    'qe-regression-risk-analyzer',  // Risk assessment
    'qe-quality-gate',             // Define quality gates
    'qe-deployment-readiness'      // Deployment maturity
  ],
  topology: 'hierarchical'
});

await consultingFleet.execute({
  clientProject: 'enterprise-saas',
  deliverable: 'comprehensive-quality-assessment'
});
```

---

## Related Skills

**Core Quality:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven consulting workflows
- [quality-metrics](../quality-metrics/) - Metrics for client reporting

**Testing:**
- [risk-based-testing](../risk-based-testing/) - Client risk assessment
- [holistic-testing-pact](../holistic-testing-pact/) - Comprehensive testing strategy

**Communication:**
- [technical-writing](../technical-writing/) - Client deliverables
- [code-review-quality](../code-review-quality/) - Code quality consulting

---

## Remember

Good consulting is about empowering teams, not creating dependency. Your success is measured by them not needing you anymore - while still wanting to work with you again.

**Best compliment:** "We've got this now, but when we tackle X next year, we're calling you."

Be honest. Be helpful. Be context-driven. Leave them better.
