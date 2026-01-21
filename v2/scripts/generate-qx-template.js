#!/usr/bin/env node
/**
 * Generate Human-Editable QX Analysis Template
 * Combines automated metrics with structured sections for human context
 * Usage: node scripts/generate-qx-template.js <url>
 */

const { QXPartnerAgent } = require('../dist/agents/QXPartnerAgent');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Simpleified context collector
async function collectContextHTTP(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    
    const req = protocol.get(url, { timeout: 10000 }, (res) => {
      let html = '';
      res.on('data', (chunk) => { html += chunk; });
      res.on('end', () => {
        const loadTime = Date.now() - startTime;
        resolve(parseHTML(url, html, loadTime));
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseHTML(url, html, loadTime) {
  const countMatches = (pattern) => (html.match(pattern) || []).length;
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'Untitled';
  const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  
  const images = countMatches(/<img[\s>]/gi);
  const imagesWithAlt = countMatches(/<img[^>]*alt=/gi);
  
  return {
    url, title,
    domMetrics: {
      totalElements: countMatches(/<[a-z][\s>]/gi),
      interactiveElements: countMatches(/<button[\s>]/gi) + countMatches(/<input[\s>]/gi) + countMatches(/<a[\s>]/gi),
      forms: countMatches(/<form[\s>]/gi),
      semanticStructure: {
        hasNav: /<nav[\s>]/i.test(html),
        hasHeader: /<header[\s>]/i.test(html),
        hasFooter: /<footer[\s>]/i.test(html),
        hasMain: /<main[\s>]/i.test(html)
      }
    },
    accessibility: {
      altTextsCoverage: images > 0 ? (imagesWithAlt / images) * 100 : 100,
      focusableElementsCount: countMatches(/<a[\s>]/gi) + countMatches(/<button[\s>]/gi)
    },
    performance: { loadTime },
    errorIndicators: { hasErrorMessages: /class=["'][^"']*error[^"']*["']/.test(html) },
    metadata: { description }
  };
}

async function runQXAnalysis(url) {
  const context = await collectContextHTTP(url);
  
  const memoryStore = new Map();
  memoryStore.store = async (key, value) => { memoryStore.set(key, value); };
  memoryStore.retrieve = async (key) => { return memoryStore.get(key); };
  
  const agent = new QXPartnerAgent({
    agentId: `qx-partner-${Date.now()}`,
    context: { projectRoot: process.cwd(), config: {} },
    memoryStore,
    eventBus: new EventEmitter(),
    analysisMode: 'full',
    heuristics: {
      enabledHeuristics: [
        'problem-understanding', 'rule-of-three', 'user-needs-identification',
        'user-vs-business-balance', 'consistency-analysis', 'intuitive-design',
        'user-feelings-impact', 'gui-flow-impact'
      ]
    }
  });

  await agent.initialize();
  const result = await agent.performTask({
    id: 'qx-1',
    type: 'qx-task',
    priority: 1,
    status: 'pending',
    payload: { type: 'qx-full-analysis', target: url, params: { context } },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await agent.cleanup();
  return { result, context };
}

function generateEditableTemplate(analysis, url) {
  const { result, context } = analysis;
  const timestamp = new Date().toLocaleString();
  
  return `# QX Partner Agent Analysis: ${new URL(url).hostname}
**Quality Experience (QX) Assessment**  
**Date**: ${timestamp}  
**Analysis Mode**: Hybrid (Automated + Human Context)

---

## 📊 Overall QX Score: ${result.overallScore}/100 (Grade: ${result.grade})

**Target**: ${url}  
**Context**: [HUMAN: Describe the website's purpose and target users in 2-3 sentences]

---

## 📋 Problem Understanding (Rule of Three)

**Clarity Score**: ${result.problemAnalysis.clarityScore}/100 (Automated)

**Problem Definition**:
[HUMAN: Write a clear 2-3 sentence description of what problem this website solves]

**Potential Failure Modes** (Rule of Three - minimum 3):

1. **[HUMAN: Name]**: [HUMAN: Describe what could fail and why it matters]
   - *Automated detected*: ${result.problemAnalysis.potentialFailures[0]?.description || 'None'}

2. **[HUMAN: Name]**: [HUMAN: Describe another failure mode]
   - *Automated detected*: ${result.problemAnalysis.potentialFailures[1]?.description || 'None'}

3. **[HUMAN: Name]**: [HUMAN: Describe third failure mode]
   - *Automated detected*: ${result.problemAnalysis.potentialFailures[2]?.description || 'None'}

---

## 👤 User Needs Analysis

**Alignment Score**: ${result.userNeeds.alignmentScore}/100 (Automated)

### Must-Have Features ([HUMAN: Count] identified):
[HUMAN: List 4-6 specific features users absolutely need from this site]
1. [Feature name and brief description]
2. 
3. 
4. 
5. 
6. 

*Automated detected ${result.userNeeds.needs.filter(n => n.priority === 'must-have').length} must-have needs*

### Should-Have Features ([HUMAN: Count] identified):
[HUMAN: List 3-4 important but not critical features]
1. 
2. 
3. 
4. 

*Automated detected ${result.userNeeds.needs.filter(n => n.priority === 'should-have').length} should-have needs*

### Nice-to-Have Features ([HUMAN: Count] identified):
[HUMAN: List 3-5 features that would enhance experience]
1. 
2. 
3. 
4. 
5. 

*Automated detected ${result.userNeeds.needs.filter(n => n.priority === 'nice-to-have').length} nice-to-have needs*

### User-Centric Features:
[HUMAN: List 3-4 features that show user-centric design philosophy]
- 
- 
- 
- 

---

## 💼 Business Needs Analysis

**Alignment Score**: ${result.businessNeeds.alignmentScore}/100 (Automated)

**Primary Goal**: ${result.businessNeeds.primaryGoal} (Automated)

**KPI Impact**: [HUMAN: High/Medium/Low] - [HUMAN: Explain which KPIs are most important]

**Business Requirements** ([HUMAN: Count] identified):
[HUMAN: List 3-5 concrete business objectives this site must achieve]
1. 
2. 
3. 
4. 
5. 

**Cross-Team Impact**:
[HUMAN: List 3-4 teams/roles affected and how]
- [Team name]: [How they're impacted]
- 
- 
- 

---

## ⚠️  Oracle Problems Detected: ${result.oracleProblems.length} (Automated)

[HUMAN: For each oracle problem below, add resolution approach]

${result.oracleProblems.map((problem, idx) => `
### ${idx + 1}. [${problem.severity.toUpperCase()}] ${problem.type}
**Description**: ${problem.description}

**Impact**: [HUMAN: Explain business and user impact]

**Affected Stakeholders**: [HUMAN: List specific roles - e.g., "content contributors", "editorial team"]

**Resolution Approach**: [HUMAN: Suggest concrete steps to resolve this problem]
`).join('\n')}

${result.oracleProblems.length === 0 ? '[HUMAN: Identify 2-3 potential oracle problems if any exist]' : ''}

---

## 📈 Impact Analysis

**Overall Impact Score**: [HUMAN: Calculate] (Automated: ${result.impactAnalysis?.overallImpactScore || 'N/A'})

### Visible Impact:
[HUMAN: Describe what users directly see and experience]
- **GUI Changes**: [High/Medium/Low] impact - [Explanation]
- **User Flows**: [High/Medium/Low] impact - [Explanation]
- **User Feelings**: [High/Medium/Low] impact - [Explanation]
- **Performance**: [High/Medium/Low] impact - [Explanation]

### Invisible Impact:
[HUMAN: Describe backend/technical impacts]
- **Security**: [High/Medium/Low] - [Explanation]
- **Maintainability**: [High/Medium/Low] - [Explanation]
- **Technical Debt**: [High/Medium/Low] - [Explanation]
- **Cross-Functional**: [High/Medium/Low] - [Explanation]

### Immutable Requirements ([HUMAN: Count] identified):
[HUMAN: List 3-4 things that absolutely must not change]
1. 
2. 
3. 
4. 

---

## 🎯 Heuristics Applied: ${result.heuristics.length} (Automated)

**Average Heuristic Score**: ${Math.round(result.heuristics.reduce((sum, h) => sum + h.score, 0) / result.heuristics.length)}/100

[HUMAN: Review automated heuristic scores below and add context/examples]

### Top 3 Performing Heuristics:
${result.heuristics.sort((a, b) => b.score - a.score).slice(0, 3).map((h, idx) => `
${idx + 1}. **${h.name}**: ${h.score}/100 - [HUMAN: Add specific example of what works well]
   *Automated finding*: ${h.findings[0] || 'No specific findings'}
`).join('\n')}

### Bottom 3 Performing Heuristics:
${result.heuristics.sort((a, b) => a.score - b.score).slice(0, 3).map((h, idx) => `
${idx + 1}. **${h.name}**: ${h.score}/100 - [HUMAN: Explain why this scores low and what to improve]
   *Automated issue*: ${h.issues[0]?.description || 'No specific issues'}
`).join('\n')}

---

## 💡 Recommendations ([HUMAN: Count] total)

[HUMAN: Review automated recommendations below and enhance with specific details]

${result.recommendations.slice(0, 5).map((rec, idx) => `
### ${idx + 1}. [${rec.severity.toUpperCase()}] ${rec.principle}
**Recommendation**: ${rec.recommendation}

**Rationale**: [HUMAN: Explain WHY this matters for this specific site]

**Evidence**: [HUMAN: Provide specific examples or data points]

**Impact**: ${rec.impact}${rec.impactPercentage ? ` (${rec.impactPercentage}%)` : ''} - [HUMAN: Explain the impact]

**Effort**: ${rec.estimatedEffort || rec.effort} - [HUMAN: Break down what's involved]

**Priority**: ${rec.priority}
`).join('\n')}

### [HUMAN: Add 3-5 more contextual recommendations]

---

## 📊 Quantitative Data (Automated)

### Technical Metrics:
- **Total Elements**: ${context.domMetrics.totalElements}
- **Interactive Elements**: ${context.domMetrics.interactiveElements}
- **Forms**: ${context.domMetrics.forms}
- **Navigation**: ${context.domMetrics.semanticStructure.hasNav ? '✓ Present' : '✗ Missing'}
- **Semantic Structure**: Header ${context.domMetrics.semanticStructure.hasHeader ? '✓' : '✗'}, Main ${context.domMetrics.semanticStructure.hasMain ? '✓' : '✗'}, Footer ${context.domMetrics.semanticStructure.hasFooter ? '✓' : '✗'}

### Accessibility:
- **Alt Text Coverage**: ${Math.round(context.accessibility.altTextsCoverage)}%
- **Focusable Elements**: ${context.accessibility.focusableElementsCount}

### Performance:
- **Load Time**: ${Math.round(context.performance.loadTime)}ms

---

## 📋 Analysis Completion Checklist

- [ ] Added website context and user description
- [ ] Identified 3+ specific failure modes with names
- [ ] Listed must-have/should-have/nice-to-have features
- [ ] Defined business requirements and KPIs
- [ ] Identified affected stakeholders
- [ ] Added resolution approaches for oracle problems
- [ ] Described visible and invisible impacts
- [ ] Listed immutable requirements
- [ ] Enhanced top/bottom heuristic explanations
- [ ] Enriched recommendations with rationale and evidence
- [ ] Added 3-5 additional contextual recommendations

---

*Generated by Agentic QE Framework v1.9.4*  
*QX Partner Agent - Hybrid Analysis Template*  
*Next Step: Fill in [HUMAN: ...] sections with contextual insights*
`;
}

async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('❌ Error: URL is required');
    console.log('\nUsage: node scripts/generate-qx-template.js <URL>');
    console.log('Example: node scripts/generate-qx-template.js https://example.com/');
    console.log('\nThis generates a template with automated metrics + human-editable sections');
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Generating editable QX analysis template for: ${url}\n`);
    
    const analysis = await runQXAnalysis(url);
    const template = generateEditableTemplate(analysis, url);
    
    const timestamp = Date.now();
    const filename = `qx-template-${timestamp}.md`;
    const filepath = path.join(process.cwd(), 'reports', filename);
    
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, template);
    
    console.log(`\n✅ Template generated successfully!`);
    console.log(`📄 File: ${filepath}`);
    console.log(`\n📝 Next Steps:`);
    console.log(`   1. Open template: code ${filepath}`);
    console.log(`   2. Search for [HUMAN: and fill in contextual insights`);
    console.log(`   3. Review automated metrics and add examples`);
    console.log(`   4. Complete the checklist at the end`);
    console.log(`\n💡 This combines automated analysis with human expertise!\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
