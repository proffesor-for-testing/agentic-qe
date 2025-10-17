---
name: Context-Driven Testing
description: Apply context-driven testing principles where practices are chosen based on project context, not universal "best practices". Use when making testing decisions, questioning dogma, or adapting approaches to specific project needs.
---

# Context-Driven Testing

## Core Principle

**There are no "best practices" that work everywhere. There are only good practices in context.**

Context-driven testing means: skilled testers making informed decisions based on their specific project's goals, constraints, and risks.

## The Seven Basic Principles (Context-Driven School)

1. **The value of any practice depends on its context**
2. **There are good practices in context, but no best practices**
3. **People, working together, are the most important part of any project's context**
4. **Projects unfold over time in ways that are often not predictable**
5. **The product is a solution. If the problem isn't solved, the product doesn't work**
6. **Good software testing is a challenging intellectual process**
7. **Only through judgment and skill, exercised cooperatively throughout the project, are we able to do the right things at the right times to effectively test our products**

## What This Means in Practice

### Question Everything

**Someone says:** "We need 100% code coverage."
**You ask:** "Why? What risk does that address? What's the cost? What about production monitoring?"

**Someone says:** "Everyone does test automation first."
**You ask:** "Do they have our constraints? Our risks? Our team skills? What problem are we actually solving?"

### Understand Your Mission

**Bad mission:** "Execute all test cases"
**Good mission:** "Find important problems fast enough to matter"

**Bad mission:** "Achieve 80% automation coverage"  
**Good mission:** "Give stakeholders confidence to release while managing risk"

### Testing is Investigation

You're not checking if the software matches a spec. You're investigating whether it solves the problem it's supposed to solve, and whether it creates new problems.

**Checking:** Did this API return status 200?
**Testing:** Does this API actually meet user needs? What happens under load? With bad data? When dependencies fail?

## Rapid Software Testing (RST) Techniques

### Exploratory Testing

**Session-based approach:**
1. Charter: What are we investigating? (45-90 min session)
2. Explore: Use the software, vary inputs, observe behavior
3. Note: Document findings in real-time
4. Debrief: What did we learn? What's next?

**Example charter:**
"Explore checkout flow to discover issues with payment processing, focusing on edge cases and error handling."

**Not:** "Click through checkout following this 47-step script."

### Heuristics for Test Design

**SFDIPOT** - Quality criteria
- **S**tructure: Is it properly composed?
- **F**unction: Does it do what it's supposed to?
- **D**ata: Does it handle data correctly?
- **I**nterfaces: How does it interact with other components?
- **P**latform: Does it work in its environment?
- **O**perations: How well can it be used and managed?
- **T**ime: Does it handle timing issues?

**CRUSSPIC STMP** - Test techniques
- **C**reate, **R**ead, **U**pdate, **S**earch, **S**ort, **P**rint, **I**mport, **C**onfirm
- **S**tatus, **T**ourism, **M**odeling, **P**atterns

### Oracles (How to Recognize Problems)

**Consistency oracles:**
- Consistent with product history
- Consistent with similar products
- Consistent with user expectations
- Consistent with documentation

**Example:**
The save button works in 5 screens but fails on the 6th. Inconsistency suggests a problem.

**Comparability oracle:**
Compare behavior across browsers, devices, user roles, data sets.

**Inference oracle:**  
If X is true, we can infer Y should also be true.

### Touring Heuristic

Explore the application like a tourist in different districts:

**Business District Tour:** Critical business functions
**Historical Tour:** Legacy features, old bugs
**Bad Neighborhood Tour:** Where problems cluster
**Tourist Tour:** What a new user sees first
**Museum Tour:** Help documentation and examples
**Intellectual Tour:** Complex features requiring thought

## Context Analysis

Before choosing testing approach, analyze:

### 1. Project Context
- What's the business goal?
- Who are the users and what do they care about?
- What happens if we fail?
- What's the competitive landscape?

### 2. Constraints
- Timeline (ship next week vs. next quarter)
- Budget (startup vs. enterprise)
- Skills (junior team vs. experts)
- Legacy (greenfield vs. 10-year codebase)

### 3. Risk Profile
- Safety-critical (medical device) vs. low stakes (internal tool)
- Regulatory requirements vs. no compliance burden
- High transaction volume vs. occasional use
- Public-facing vs. internal only

### 4. Technical Context
- Technology stack and its quirks
- Integration points and dependencies
- Production environment complexity
- Monitoring and observability maturity

## Making Context-Driven Decisions

### Example 1: Test Automation Level

**Startup context:**
- Small team, rapid changes, unclear product-market fit
- **Decision:** Light automation on critical paths, heavy exploratory testing
- **Rationale:** Requirements change too fast for extensive automation

**Established product context:**
- Stable features, regulatory requirements, large team
- **Decision:** Comprehensive automated regression suite
- **Rationale:** Stability allows automation investment to pay off

### Example 2: Documentation

**Highly regulated context:**
- FDA/medical device requirements
- **Decision:** Detailed test protocols, traceability matrices
- **Rationale:** Regulatory compliance isn't optional

**Fast-paced startup:**
- Minimal compliance needs
- **Decision:** Lightweight session notes, risk logs
- **Rationale:** Bureaucracy slows down more than it helps

## Common Misconceptions

**"Context-driven means no process."**
False. It means choosing processes that fit your context, not blindly following standards.

**"Context-driven means no automation."**
False. It means automating what makes sense in your context, not achieving arbitrary coverage goals.

**"Context-driven means no documentation."**
False. It means documenting what's valuable in your context, not creating docs no one reads.

**"Context-driven means testing is unstructured."**
False. Skilled exploratory testing is highly structured thinking, just not scripted.

## Skills Required

Context-driven testing isn't a shortcut. It requires:

### Technical Skills
- Understanding architecture and code
- Ability to use testing tools effectively
- Debug issues when found
- Understand what's possible and what's hard

### Domain Knowledge
- Understand the business problem
- Know the users and their goals
- Recognize what matters vs. what's trivial

### Testing Craft
- Heuristics and oracles
- Test design techniques
- Risk analysis
- Bug investigation

### Social Skills
- Communicate findings clearly
- Navigate organizational politics
- Collaborate with diverse stakeholders
- Say "I don't know" when you don't

## Red Flags: You're Not Being Context-Driven

- You follow a process "because that's how it's done"
- You can't explain *why* you're doing something
- You measure test cases executed instead of problems found
- You treat testing as checking against requirements only
- You don't talk to users or stakeholders
- Your test plan could apply to any project
- You stop thinking once you have a script

## Questions to Ask Constantly

**"What problem am I solving?"**
Not "What does the process say to do?" but "What actual problem needs solving?"

**"Who cares about this?"**
If no one cares, maybe it doesn't matter.

**"What's the risk if I'm wrong?"**
High risk = more rigor. Low risk = lighter touch.

**"What's the cost of this activity?"**
Time spent here can't be spent elsewhere. Worth it?

**"Is there a better way?"**
Given my actual constraints, not ideal conditions.

## Practical Tips

### 1. Start with Risk Assessment
List features. For each, ask:
- How likely is it to fail?
- How bad if it fails?
- How hard to test?

Focus on high-risk areas.

### 2. Time-box Exploration
You can explore forever. Set limits:
- 2 hours exploring checkout
- 30 minutes investigating error handling
- 15 minutes with each browser

### 3. Document Discoveries, Not Plans
Don't write test cases you'll execute later. Document what you learned as you test.

**Test case:** "Enter invalid email, verify error message"
**Discovery:** "Payment API returns 500 instead of 400 for malformed email, no user-visible error. Investigated logs: gateway expects specific format. Bug filed."

### 4. Talk to Humans
- Developers (how it's built, what worried them)
- Users (what they actually do)
- Support (common problems)
- Product (business priorities)

### 5. Pair with Others
- Pair testing sessions uncover more than solo work
- Different perspectives = different bugs found
- Teaching others clarifies your own thinking

## When to Use Scripted Tests

Context-driven doesn't mean "never script." Use scripts when:

- Compliance requires documented test procedures
- Testing is truly repetitive (regression after each deploy)
- Training new team members on how to test
- Need to precisely reproduce an issue

But even then, leave room for exploration around the scripts.

## Evolution with Experience

**Novice:** Needs structure, follows steps, can't adapt yet
**Competent:** Understands tradeoffs, makes informed choices
**Expert:** Intuitively adjusts approach, sees patterns others miss

Context-driven testing requires competence. Invest in skill development.

## Resources

**Books:**
- **Lessons Learned in Software Testing** by Kaner, Bach, Pettichord
- **Explore It!** by Elisabeth Hendrickson
- **Perfect Software and Other Illusions About Testing** by Gerald Weinberg

**Courses:**
- Rapid Software Testing (RST) by James Bach and Michael Bolton

**Communities:**
- Association for Software Testing (AST)
- Ministry of Testing community

## Final Thought

Context-driven testing is intellectually demanding. It requires constant thinking, learning, and adaptation. That's also what makes it effective and fulfilling.

You're not a test script executor. You're a skilled investigator helping teams build better products.
