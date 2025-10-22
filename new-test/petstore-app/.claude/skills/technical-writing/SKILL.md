---
name: technical-writing
description: Write clear, engaging technical content from real experience. Use when writing blog posts, documentation, tutorials, or technical articles.
version: 1.0.0
category: communication
tags: [documentation, blogging, tutorials, content-creation, clarity, audience-awareness]
difficulty: intermediate
estimated_time: 30 minutes
author: user
---

# Technical Writing Skill

## Purpose
Write clear, engaging technical content that practitioners actually want to read. No corporate fluff, no vendor speak. Real insights from real experience.

## Core Principles

### 1. Lead with Value
Start with what the reader will learn or gain. Skip the preamble.

**Bad:** "In today's fast-paced software development landscape, quality has become increasingly important..."
**Good:** "Here's how we reduced bug escape rate by 60% without adding test automation."

### 2. Show, Don't Just Tell
Use specific examples from actual work. Code snippets, real scenarios, actual numbers.

```
Generic: "We improved our testing approach."
Specific: "We switched from scripted E2E tests to risk-based exploratory sessions. 
Bug detection improved from 12 to 47 issues per sprint while cutting test execution time by 40%."
```

### 3. Be Honest About Trade-offs
Nothing works everywhere. Share what you gave up to gain something else.

Example: "TDD slowed our initial feature velocity by 20%, but reduced production bugs by 75% and made refactoring fearless."

### 4. Structure for Scanning
- Use clear headers that tell the story
- Bold key points
- Keep paragraphs short (3-5 sentences max)
- Use code blocks for technical details
- Lists for options or steps

### 5. Cut Ruthlessly
Every sentence must earn its place. Kill:
- Hedge words (basically, actually, probably)
- Corporate speak (leverage, synergy, paradigm shift)
- Unnecessary qualifiers (very, really, quite)
- Repetition of the same point

## Blog Post Structure

### Opening (2-3 paragraphs)
- Hook: The problem or surprising insight
- Context: Why this matters
- Promise: What they'll learn

### Body (3-5 sections)
- Each section: one clear idea
- Support with examples, code, data
- Explain your reasoning
- Show alternatives considered

### Closing
- Key takeaway (1-2 sentences)
- Action readers can take
- Optional: What's next for you

## Writing for Different Audiences

### For Developers
- Lead with code or concrete problem
- Show implementation details
- Discuss trade-offs and alternatives
- Link to repos or working examples

### For QA/QE
- Start with testing challenge
- Show testing strategy, not just tools
- Include risk assessment thinking
- Provide heuristics they can adapt

### For Leadership
- Open with business impact
- Use metrics that matter (not vanity metrics)
- Connect technical decisions to outcomes
- Keep technical details concise

### For General Tech Audience
- Use analogies from everyday life
- Define jargon when first used
- Focus on concepts over implementation
- Make it relatable

## Common Pitfalls

**Tutorial Hell:** Don't just list steps. Explain *why* each step matters.

**False Expertise:** Only write about what you've actually done in production. If you're exploring, say so.

**Tool Worship:** Focus on problems and approaches, not specific tools. Tools change, principles persist.

**Defensive Writing:** Don't pre-apologize or over-qualify. State your experience clearly and invite discussion.

## Voice and Tone

- **Direct:** Say what you mean
- **Conversational:** Write like you're explaining to a colleague over coffee
- **Confident but humble:** Share what worked for you, acknowledge context matters
- **Occasionally irreverent:** It's okay to call out BS in the industry

## Editing Checklist

Before publishing:
- [ ] Does the title promise something specific?
- [ ] Does the opening hook the reader in 30 seconds?
- [ ] Are claims backed by specific examples?
- [ ] Have I cut all unnecessary words?
- [ ] Would I send this to a colleague I respect?
- [ ] Are code examples tested and correct?
- [ ] Is the takeaway crystal clear?

## Example Transformations

**Before:** "We decided to implement a more comprehensive testing strategy that would allow us to catch bugs earlier in the development lifecycle."

**After:** "We moved exploratory testing into sprint planning. QE now pairs with devs during story refinement, identifying risks before code is written."

---

**Before:** "The benefits of this approach are numerous and include improved quality, faster feedback loops, and better team collaboration."

**After:** "Three outcomes: bugs found 2 days earlier on average, 30% fewer regression issues, and devs now ask QE for input during design."

## Resources

- **Plain Language:** www.plainlanguage.gov
- **On Writing Well** by William Zinsser
- **Technical Blogging** by Antonio Cangiano (pragmatic approach)
- Your own blog archives - review what got engagement vs. what flopped

## Using with QE Agents

### Automated Documentation Generation

**qe-quality-analyzer** generates documentation from code:
```typescript
// Agent generates documentation from source code
const docs = await agent.generateDocs({
  source: 'src/services/PaymentService.ts',
  format: 'markdown',
  includeExamples: true,
  includeApiDocs: true,
  includeTypeDefinitions: true
});

// Generates:
// - Function signatures
// - Parameter descriptions
// - Return types
// - Usage examples
// - Error handling docs
```

### Documentation Quality Review

```typescript
// Agent reviews documentation for quality
const docReview = await qe-quality-analyzer.reviewDocumentation({
  files: ['README.md', 'docs/api.md', 'docs/guides/*.md'],
  checkClarity: true,
  checkCompleteness: true,
  checkAccuracy: true,
  checkCodeExamples: true
});

// Returns:
// {
//   issues: [
//     { file: 'README.md', line: 45, issue: 'Example code is outdated' },
//     { file: 'docs/api.md', line: 12, issue: 'Missing error response docs' }
//   ],
//   score: 0.82
// }
```

### Automated README Updates

```typescript
// Agent keeps README in sync with code
const readmeUpdate = await qe-quality-analyzer.syncReadme({
  source: 'src/',
  readme: 'README.md',
  sections: {
    installation: true,
    usage: true,
    api: true,
    examples: true
  },
  preserveManual: true  // Keep manually written sections
});
```

### Documentation Fleet

```typescript
const docsFleet = await FleetManager.coordinate({
  strategy: 'documentation',
  agents: [
    'qe-quality-analyzer',     // Generate and review docs
    'qe-api-contract-validator', // API documentation accuracy
    'qe-test-generator'        // Generate example code
  ],
  topology: 'sequential'
});
```

---

## Related Skills

**Communication:**
- [bug-reporting-excellence](../bug-reporting-excellence/) - Technical writing for bugs
- [code-review-quality](../code-review-quality/) - Review documentation

**Development:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Doc automation

---

## Remember

You're not writing to impress people. You're writing to help them solve problems you've already solved. Be the colleague you wish you'd had when you were figuring this stuff out.
