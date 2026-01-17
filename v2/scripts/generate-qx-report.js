#!/usr/bin/env node
/**
 * Generate HTML Report from QX Analysis Results
 * Usage: node scripts/generate-qx-report.js <url>
 */

const { QXPartnerAgent } = require('../dist/agents/QXPartnerAgent');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

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
  
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'Untitled';
  const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  const viewport = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["']/i)?.[1] || '';
  
  const hasNav = /<nav[\s>]/i.test(html);
  const hasHeader = /<header[\s>]/i.test(html);
  const hasFooter = /<footer[\s>]/i.test(html);
  const hasMain = /<main[\s>]/i.test(html);
  const hasAside = /<aside[\s>]/i.test(html);
  const hasArticle = /<article[\s>]/i.test(html);
  const hasSection = /<section[\s>]/i.test(html);
  
  const forms = countMatches(/<form[\s>]/gi);
  const buttons = countMatches(/<button[\s>]/gi) + countMatches(/type=["'](?:button|submit)["']/gi);
  const inputs = countMatches(/<input[\s>]/gi) + countMatches(/<textarea[\s>]/gi) + countMatches(/<select[\s>]/gi);
  const links = countMatches(/<a[\s>]/gi);
  const totalElements = countMatches(/<[a-z][\s>]/gi);
  
  const images = countMatches(/<img[\s>]/gi);
  const imagesWithAlt = countMatches(/<img[^>]*alt=/gi);
  const ariaLabels = countMatches(/aria-label=/gi);
  const landmarkRoles = countMatches(/role=["'](?:banner|navigation|main|complementary|contentinfo)["']/gi);
  
  const hasErrorMessages = /class=["'][^"']*error[^"']*["']/.test(html) || /role=["']alert["']/.test(html);

  return {
    url,
    title,
    domMetrics: {
      totalElements,
      interactiveElements: buttons + inputs + links,
      forms,
      inputs,
      buttons,
      semanticStructure: {
        hasNav,
        hasHeader,
        hasFooter,
        hasMain,
        hasAside,
        hasArticle,
        hasSection
      }
    },
    accessibility: {
      ariaLabelsCount: ariaLabels,
      altTextsCoverage: images > 0 ? (imagesWithAlt / images) * 100 : 100,
      focusableElementsCount: links + buttons + inputs,
      landmarkRoles
    },
    performance: {
      loadTime
    },
    errorIndicators: {
      hasErrorMessages
    },
    metadata: {
      description,
      viewport
    }
  };
}

async function runQXAnalysis(url) {
  console.log(`\n🔍 Running QX Analysis for: ${url}\n`);
  
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

  const result = await agent.performTask({
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

  await agent.cleanup();
  return result;
}

function generateHTML(result, url) {
  const timestamp = Date.now();
  const date = new Date().toLocaleString();
  
  const gradeColor = {
    'A': '#22c55e',
    'B': '#3b82f6',
    'C': '#f59e0b',
    'D': '#ef4444',
    'F': '#dc2626'
  }[result.grade] || '#6b7280';

  // Group heuristics by category
  const byCategory = result.heuristics.reduce((acc, h) => {
    if (!acc[h.category]) acc[h.category] = [];
    acc[h.category].push(h);
    return acc;
  }, {});

  const categoryHTML = Object.entries(byCategory).map(([cat, heuristics]) => {
    const avg = Math.round(heuristics.reduce((sum, h) => sum + h.score, 0) / heuristics.length);
    const items = heuristics.map(h => `
      <div class="heuristic-item">
        <div class="heuristic-header">
          <span class="heuristic-name">${h.name}</span>
          <span class="heuristic-score" style="background: ${h.score >= 80 ? '#22c55e' : h.score >= 60 ? '#f59e0b' : '#ef4444'}">${h.score}/100</span>
        </div>
        ${h.findings.length > 0 ? `<div class="findings">✓ ${h.findings.slice(0, 2).join('<br>✓ ')}</div>` : ''}
        ${h.issues.length > 0 ? `<div class="issues">⚠ ${h.issues.map(i => i.description).slice(0, 2).join('<br>⚠ ')}</div>` : ''}
      </div>
    `).join('');
    
    return `
      <div class="category-section">
        <h3>${cat.toUpperCase()} (${avg}/100 avg, ${heuristics.length} heuristics)</h3>
        ${items}
      </div>
    `;
  }).join('');

  const recommendationsHTML = result.recommendations.map((rec, idx) => `
    <div class="recommendation ${rec.severity}">
      <div class="rec-header">
        <span class="rec-number">${idx + 1}</span>
        <span class="rec-severity">${rec.severity.toUpperCase()}</span>
        <span class="rec-title">${rec.principle}</span>
      </div>
      <div class="rec-description">${rec.recommendation}</div>
      <div class="rec-meta">
        <span>Category: ${rec.category}</span>
        <span>Impact: ${rec.impact}${rec.impactPercentage ? ` (${rec.impactPercentage}%)` : ''}</span>
        <span>Effort: ${rec.estimatedEffort || rec.effort}</span>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QX Analysis Report - ${url}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 2rem;
      line-height: 1.6;
    }
    .container { 
      max-width: 1200px; 
      margin: 0 auto; 
      background: white; 
      border-radius: 16px; 
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 3rem 2rem;
      text-align: center;
    }
    .header h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    .header .url { opacity: 0.9; font-size: 1.1rem; word-break: break-all; }
    .header .date { opacity: 0.8; font-size: 0.9rem; margin-top: 1rem; }
    
    .score-section {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;
      padding: 2rem;
      text-align: center;
    }
    .overall-score {
      font-size: 5rem;
      font-weight: bold;
      line-height: 1;
      margin: 1rem 0;
    }
    .grade-badge {
      display: inline-block;
      padding: 0.5rem 1.5rem;
      background: rgba(255,255,255,0.2);
      border-radius: 50px;
      font-size: 2rem;
      margin-left: 1rem;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      padding: 2rem;
      background: #f8fafc;
    }
    .summary-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .summary-card h3 {
      color: #667eea;
      font-size: 0.9rem;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    .summary-card .value {
      font-size: 2rem;
      font-weight: bold;
      color: #1e293b;
    }
    
    .content { padding: 2rem; }
    .section { margin-bottom: 3rem; }
    .section h2 {
      color: #667eea;
      font-size: 1.8rem;
      margin-bottom: 1.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 3px solid #667eea;
    }
    
    .category-section {
      margin-bottom: 2rem;
      background: #f8fafc;
      padding: 1.5rem;
      border-radius: 12px;
    }
    .category-section h3 {
      color: #475569;
      margin-bottom: 1rem;
    }
    
    .heuristic-item {
      background: white;
      padding: 1rem;
      margin-bottom: 0.75rem;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    .heuristic-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .heuristic-name {
      font-weight: 600;
      color: #1e293b;
    }
    .heuristic-score {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      color: white;
      font-weight: bold;
      font-size: 0.9rem;
    }
    .findings {
      color: #22c55e;
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }
    .issues {
      color: #ef4444;
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }
    
    .recommendation {
      background: white;
      padding: 1.5rem;
      margin-bottom: 1rem;
      border-radius: 12px;
      border-left: 5px solid #667eea;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .recommendation.high { border-left-color: #ef4444; }
    .recommendation.critical { border-left-color: #dc2626; }
    .recommendation.medium { border-left-color: #f59e0b; }
    .recommendation.low { border-left-color: #3b82f6; }
    
    .rec-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }
    .rec-number {
      background: #667eea;
      color: white;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .rec-severity {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: bold;
      text-transform: uppercase;
    }
    .recommendation.high .rec-severity { background: #fee2e2; color: #dc2626; }
    .recommendation.medium .rec-severity { background: #fef3c7; color: #d97706; }
    .recommendation.low .rec-severity { background: #dbeafe; color: #2563eb; }
    .rec-title {
      font-weight: 600;
      font-size: 1.1rem;
      color: #1e293b;
    }
    .rec-description {
      color: #475569;
      margin-bottom: 0.75rem;
      padding-left: 3rem;
    }
    .rec-meta {
      display: flex;
      gap: 1.5rem;
      padding-left: 3rem;
      font-size: 0.9rem;
      color: #64748b;
    }
    .rec-meta span {
      display: flex;
      align-items: center;
    }
    
    .footer {
      background: #f8fafc;
      padding: 2rem;
      text-align: center;
      color: #64748b;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Quality Experience (QX) Analysis</h1>
      <div class="url">${url}</div>
      <div class="date">Generated: ${date}</div>
    </div>
    
    <div class="score-section">
      <div>Overall QX Score</div>
      <div class="overall-score">
        ${result.overallScore}/100
        <span class="grade-badge" style="background: ${gradeColor}">${result.grade}</span>
      </div>
    </div>
    
    <div class="summary-grid">
      <div class="summary-card">
        <h3>Problem Understanding</h3>
        <div class="value">${result.problemAnalysis.clarityScore}/100</div>
        <div style="color: #64748b; margin-top: 0.5rem;">${result.problemAnalysis.complexity}</div>
      </div>
      <div class="summary-card">
        <h3>User Needs</h3>
        <div class="value">${result.userNeeds.alignmentScore}/100</div>
        <div style="color: #64748b; margin-top: 0.5rem;">${result.userNeeds.suitability}</div>
      </div>
      <div class="summary-card">
        <h3>Business Needs</h3>
        <div class="value">${result.businessNeeds.alignmentScore}/100</div>
        <div style="color: #64748b; margin-top: 0.5rem;">${result.businessNeeds.primaryGoal}</div>
      </div>
      <div class="summary-card">
        <h3>Heuristics Applied</h3>
        <div class="value">${result.heuristics.length}</div>
        <div style="color: #64748b; margin-top: 0.5rem;">Avg: ${Math.round(result.heuristics.reduce((sum, h) => sum + h.score, 0) / result.heuristics.length)}/100</div>
      </div>
    </div>
    
    <div class="content">
      <div class="section">
        <h2>📊 Heuristics Analysis</h2>
        ${categoryHTML}
      </div>
      
      <div class="section">
        <h2>💡 Recommendations (${result.recommendations.length})</h2>
        ${recommendationsHTML}
      </div>
      
      ${result.oracleProblems.length > 0 ? `
      <div class="section">
        <h2>⚠️ Oracle Problems (${result.oracleProblems.length})</h2>
        ${result.oracleProblems.map(p => `
          <div class="recommendation ${p.severity}">
            <div class="rec-header">
              <span class="rec-severity">${p.severity.toUpperCase()}</span>
              <span class="rec-title">${p.type}</span>
            </div>
            <div class="rec-description">${p.description}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <div>QX Partner Agent - Quality Experience Analysis</div>
      <div style="margin-top: 0.5rem;">Agentic QE Framework v1.9.4</div>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('❌ Error: URL is required');
    console.log('\nUsage: node scripts/generate-qx-report.js <URL>');
    console.log('Example: node scripts/generate-qx-report.js https://example.com/');
    process.exit(1);
  }

  try {
    const result = await runQXAnalysis(url);
    
    const html = generateHTML(result, url);
    const timestamp = Date.now();
    const filename = `qx-report-${timestamp}.html`;
    const filepath = path.join(process.cwd(), 'reports', filename);
    
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, html);
    
    console.log(`\n✅ Report generated successfully!`);
    console.log(`📄 File: ${filepath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Score: ${result.overallScore}/100 (${result.grade})`);
    console.log(`   Heuristics: ${result.heuristics.length}`);
    console.log(`   Recommendations: ${result.recommendations.length}`);
    console.log(`   Oracle Problems: ${result.oracleProblems.length}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
