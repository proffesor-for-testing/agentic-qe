#!/usr/bin/env node
/**
 * Generate Contextual QX Analysis Report with LLM Enhancement
 * Combines automated metrics with AI-powered contextual understanding
 * Usage: node scripts/generate-contextual-qx-report.js <url>
 */

const { QXPartnerAgent } = require('../dist/agents/QXPartnerAgent');
const { EventEmitter } = require('events');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const USE_LLM = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

// HTTP-based context collector
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function parseHTML(url, html, loadTime) {
  const countMatches = (pattern) => (html.match(pattern) || []).length;
  const extractText = (pattern, max = 10) => {
    const matches = html.match(pattern);
    return matches ? matches.slice(0, max).map(m => m.replace(/<[^>]*>/g, '').trim()) : [];
  };
  
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'Untitled';
  const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  const viewport = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  
  // Extract actual content for contextual understanding
  const h1Texts = extractText(/<h1[^>]*>([^<]+)<\/h1>/gi, 3);
  const h2Texts = extractText(/<h2[^>]*>([^<]+)<\/h2>/gi, 5);
  const navLinks = extractText(/<nav[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/nav>/gi, 10);
  const buttonTexts = extractText(/<button[^>]*>([^<]+)<\/button>/gi, 10);
  
  // Extract main content snippet
  const mainContentMatch = html.match(/<main[^>]*>([\s\S]{0,500})/i) || 
                           html.match(/<article[^>]*>([\s\S]{0,500})/i) ||
                           html.match(/<body[^>]*>([\s\S]{0,500})/i);
  const contentSnippet = mainContentMatch ? mainContentMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  
  const hasNav = /<nav[\s>]/i.test(html);
  const hasHeader = /<header[\s>]/i.test(html);
  const hasFooter = /<footer[\s>]/i.test(html);
  const hasMain = /<main[\s>]/i.test(html);
  
  const forms = countMatches(/<form[\s>]/gi);
  const buttons = countMatches(/<button[\s>]/gi);
  const inputs = countMatches(/<input[\s>]/gi);
  const links = countMatches(/<a[\s>]/gi);
  const totalElements = countMatches(/<[a-z][\s>]/gi);
  
  const images = countMatches(/<img[\s>]/gi);
  const imagesWithAlt = countMatches(/<img[^>]*alt=/gi);
  const ariaLabels = countMatches(/aria-label=/gi);
  
  const hasErrorMessages = /class=["'][^"']*error[^"']*["']/.test(html) || /role=["']alert["']/.test(html);

  return {
    url,
    title,
    html: html.substring(0, 50000), // First 50KB for LLM analysis
    domMetrics: {
      totalElements,
      interactiveElements: buttons + inputs + links,
      forms,
      inputs,
      buttons,
      semanticStructure: { hasNav, hasHeader, hasFooter, hasMain }
    },
    content: {
      h1Texts,
      h2Texts,
      navLinks,
      buttonTexts,
      contentSnippet,
      description
    },
    accessibility: {
      ariaLabelsCount: ariaLabels,
      altTextsCoverage: images > 0 ? (imagesWithAlt / images) * 100 : 100,
      focusableElementsCount: links + buttons + inputs
    },
    performance: { loadTime },
    errorIndicators: { hasErrorMessages },
    metadata: { description, viewport }
  };
}

async function enhanceWithLLM(context, quantitativeAnalysis) {
  if (!USE_LLM) {
    console.log('⚠️  No API key found - skipping LLM enhancement. Set ANTHROPIC_API_KEY for rich contextual analysis.\n');
    return null;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY });
    
    console.log('🤖 Enhancing analysis with AI contextual understanding...\n');
    
    const prompt = `You are a Quality Experience (QX) expert analyzing a website. QX is the marriage of QA (Quality Advocacy) and UX (User Experience).

WEBSITE DATA:
Title: ${context.title}
URL: ${context.url}
Description: ${context.content.description || 'None'}
H1 Headings: ${context.content.h1Texts.join(', ') || 'None'}
H2 Headings: ${context.content.h2Texts.slice(0, 5).join(', ') || 'None'}
Navigation Items: ${context.content.navLinks.join(', ') || 'None'}
Button Labels: ${context.content.buttonTexts.join(', ') || 'None'}
Content Snippet: ${context.content.contentSnippet || 'None'}

QUANTITATIVE METRICS:
- Overall QX Score: ${quantitativeAnalysis.overallScore}/100
- Interactive Elements: ${context.domMetrics.interactiveElements}
- Forms: ${context.domMetrics.forms}
- Alt Text Coverage: ${Math.round(context.accessibility.altTextsCoverage)}%
- Load Time: ${Math.round(context.performance.loadTime)}ms
- Semantic Structure: ${context.domMetrics.semanticStructure.hasNav ? '✓ Nav' : '✗ Nav'}, ${context.domMetrics.semanticStructure.hasHeader ? '✓ Header' : '✗ Header'}, ${context.domMetrics.semanticStructure.hasMain ? '✓ Main' : '✗ Main'}

Provide a detailed QX analysis following this exact structure:

## CONTEXT UNDERSTANDING
What is this website's purpose and who are its users? (2-3 sentences)

## SPECIFIC FAILURE MODES (3-5 items)
List concrete, named failure modes specific to this website type:
Format each as:
**[Failure Name]**: Description of what could fail and why it matters for this specific site

## USER NEEDS ANALYSIS
### Must-Have Features (list 4-6 actual features this site needs):
1. [Feature name]: Brief description
2. ...

### Should-Have Features (list 3-4):
1. ...

### Nice-to-Have Features (list 3-5):
1. ...

## BUSINESS NEEDS (3-5 concrete requirements)
What business objectives does this site serve?

## STAKEHOLDER IMPACT
List 3-4 affected stakeholder groups with specific roles (e.g., "content contributors", "editorial team", not just "users")

## RECOMMENDATIONS (5-8 specific, actionable items)
Each recommendation should include:
- [Priority: HIGH/MEDIUM/LOW]
- **[Specific Title]**
- What to do (actionable)
- Why it matters (impact)
- Estimated effort

Be specific to THIS website, not generic advice. Use actual content from the data provided.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const analysis = message.content[0].text;
    return analysis;
  } catch (error) {
    console.error('⚠️  LLM enhancement failed:', error.message);
    return null;
  }
}

async function runQXAnalysis(url) {
  console.log(`\n🔍 Running Contextual QX Analysis for: ${url}\n`);
  
  const context = await collectContextHTTP(url);
  console.log('✅ Collected page context\n');
  
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
        'problem-understanding', 'rule-of-three', 'problem-complexity',
        'user-needs-identification', 'user-needs-suitability', 'user-needs-validation',
        'business-needs-identification', 'user-vs-business-balance', 'kpi-impact-analysis',
        'oracle-problem-detection', 'what-must-not-change', 'supporting-data-analysis',
        'gui-flow-impact', 'user-feelings-impact', 'cross-functional-impact', 'data-dependent-impact',
        'competitive-analysis', 'domain-inspiration', 'innovative-solutions',
        'exactness-and-clarity', 'intuitive-design', 'counter-intuitive-design', 'consistency-analysis'
      ]
    }
  });

  await agent.initialize();
  console.log('✅ Agent initialized\n');
  
  console.log('📊 Running quantitative analysis...\n');
  const quantitativeResult = await agent.performTask({
    id: 'qx-report-1',
    type: 'qx-task',
    priority: 1,
    status: 'pending',
    payload: {
      type: 'qx-full-analysis',
      target: url,
      params: { context }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log(`✅ Quantitative score: ${quantitativeResult.overallScore}/100\n`);
  
  const llmEnhancement = await enhanceWithLLM(context, quantitativeResult);
  
  await agent.cleanup();
  
  return {
    quantitative: quantitativeResult,
    llmEnhancement,
    context
  };
}

function generateMarkdownReport(result, url) {
  const { quantitative, llmEnhancement, context } = result;
  const timestamp = new Date().toLocaleString();
  
  let report = `# QX Partner Agent Analysis: ${new URL(url).hostname}
**Quality Experience (QX) Assessment**  
**Date**: ${timestamp}  
**Analysis Mode**: ${llmEnhancement ? 'AI-Enhanced Contextual Analysis' : 'Quantitative Analysis Only'}

---

## 📊 Overall QX Score: ${quantitative.overallScore}/100 (Grade: ${quantitative.grade})

**Analysis Timestamp**: ${timestamp}  
**Target**: ${url}  
`;

  if (llmEnhancement) {
    report += `**Analysis Type**: Hybrid (Automated Metrics + AI Contextual Understanding)\n\n---\n\n`;
    report += llmEnhancement;
    report += `\n\n---\n\n`;
  } else {
    report += `**Analysis Type**: Automated Quantitative Only\n\n`;
    report += `⚠️  **Note**: This is quantitative analysis only. For rich contextual insights, set ANTHROPIC_API_KEY environment variable.\n\n---\n\n`;
  }

  // Add quantitative data
  report += `## 📈 Quantitative Metrics\n\n`;
  report += `### Problem Understanding\n`;
  report += `- **Clarity Score**: ${quantitative.problemAnalysis.clarityScore}/100\n`;
  report += `- **Complexity**: ${quantitative.problemAnalysis.complexity}\n`;
  report += `- **Components**: ${quantitative.problemAnalysis.breakdown.length}\n\n`;
  
  report += `### User Needs\n`;
  report += `- **Alignment Score**: ${quantitative.userNeeds.alignmentScore}/100\n`;
  report += `- **Suitability**: ${quantitative.userNeeds.suitability}\n`;
  report += `- **Identified Needs**: ${quantitative.userNeeds.needs.length}\n`;
  report += `- **Challenges**: ${quantitative.userNeeds.challenges.length}\n\n`;
  
  report += `### Business Needs\n`;
  report += `- **Alignment Score**: ${quantitative.businessNeeds.alignmentScore}/100\n`;
  report += `- **Primary Goal**: ${quantitative.businessNeeds.primaryGoal}\n`;
  report += `- **KPIs Affected**: ${quantitative.businessNeeds.kpisAffected.length}\n\n`;

  // Heuristics breakdown
  const byCategory = quantitative.heuristics.reduce((acc, h) => {
    if (!acc[h.category]) acc[h.category] = [];
    acc[h.category].push(h);
    return acc;
  }, {});

  report += `## 🎯 Heuristics Applied: ${quantitative.heuristics.length}\n\n`;
  report += `**Average Score**: ${Math.round(quantitative.heuristics.reduce((sum, h) => sum + h.score, 0) / quantitative.heuristics.length)}/100\n\n`;
  
  Object.entries(byCategory).forEach(([cat, heuristics]) => {
    const avg = Math.round(heuristics.reduce((sum, h) => sum + h.score, 0) / heuristics.length);
    report += `### ${cat.toUpperCase()} (${avg}/100 avg)\n\n`;
    heuristics.slice(0, 5).forEach(h => {
      report += `- **${h.name}**: ${h.score}/100\n`;
      if (h.findings.length > 0) {
        report += `  - ✓ ${h.findings[0]}\n`;
      }
      if (h.issues.length > 0) {
        report += `  - ⚠ ${h.issues[0].description}\n`;
      }
    });
    report += `\n`;
  });

  // Potential failures
  if (quantitative.problemAnalysis.potentialFailures.length > 0) {
    report += `## ⚠️  Potential Failure Modes Detected\n\n`;
    quantitative.problemAnalysis.potentialFailures.forEach((failure, idx) => {
      report += `${idx + 1}. **[${failure.severity.toUpperCase()}]** ${failure.description}\n`;
      report += `   - Likelihood: ${failure.likelihood}\n\n`;
    });
  }

  // Raw recommendations if no LLM
  if (!llmEnhancement && quantitative.recommendations.length > 0) {
    report += `## 💡 Automated Recommendations\n\n`;
    quantitative.recommendations.forEach((rec, idx) => {
      report += `### ${idx + 1}. [${rec.severity.toUpperCase()}] ${rec.principle}\n`;
      report += `${rec.recommendation}\n\n`;
      report += `- **Category**: ${rec.category}\n`;
      report += `- **Impact**: ${rec.impact}${rec.impactPercentage ? ` (${rec.impactPercentage}%)` : ''}\n`;
      report += `- **Effort**: ${rec.estimatedEffort || rec.effort}\n\n`;
    });
  }

  report += `---\n\n`;
  report += `## 📋 Analysis Methodology\n\n`;
  report += `This report combines:\n`;
  report += `1. **Automated Metrics**: Quantitative analysis of structure, accessibility, performance\n`;
  report += `2. **Heuristic Evaluation**: 23 QX heuristics applied across 6 categories\n`;
  if (llmEnhancement) {
    report += `3. **AI Contextual Analysis**: LLM-powered understanding of website purpose and user needs\n`;
  } else {
    report += `3. **AI Enhancement**: Not available (set ANTHROPIC_API_KEY for contextual insights)\n`;
  }
  report += `\n`;
  report += `**QX Philosophy**: Quality Experience = QA (Quality Advocacy) + UX (User Experience)\n\n`;
  report += `---\n\n`;
  report += `*Generated by Agentic QE Framework v1.9.4*\n`;
  report += `*QX Partner Agent - ${llmEnhancement ? 'AI-Enhanced' : 'Quantitative'} Analysis*\n`;

  return report;
}

async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('❌ Error: URL is required');
    console.log('\nUsage: node scripts/generate-contextual-qx-report.js <URL>');
    console.log('Example: node scripts/generate-contextual-qx-report.js https://example.com/');
    console.log('\nOptional: Set ANTHROPIC_API_KEY for AI-enhanced contextual analysis');
    process.exit(1);
  }

  try {
    const result = await runQXAnalysis(url);
    
    const markdown = generateMarkdownReport(result, url);
    const timestamp = Date.now();
    const filename = `qx-analysis-${timestamp}.md`;
    const filepath = path.join(process.cwd(), 'reports', filename);
    
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, markdown);
    
    console.log(`\n✅ Report generated successfully!`);
    console.log(`📄 File: ${filepath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Score: ${result.quantitative.overallScore}/100 (${result.quantitative.grade})`);
    console.log(`   Heuristics: ${result.quantitative.heuristics.length}`);
    console.log(`   Recommendations: ${result.quantitative.recommendations.length}`);
    console.log(`   AI Enhancement: ${result.llmEnhancement ? '✓ Enabled' : '✗ Disabled (set ANTHROPIC_API_KEY)'}`);
    console.log(`\nOpen report: code ${filepath}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
