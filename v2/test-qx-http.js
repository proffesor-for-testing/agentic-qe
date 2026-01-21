#!/usr/bin/env node
/**
 * QX Partner Agent Test Script - HTTP Fallback Version
 * Tests QX analysis without requiring browser automation
 */

const { QXPartnerAgent } = require('./dist/agents/QXPartnerAgent');
const { QEAgentType } = require('./dist/types');
const { EventEmitter } = require('events');

// Simple HTTP-based context collector
async function collectContextHTTP(url) {
  const https = require('https');
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    
    const req = protocol.get(url, { timeout: 10000 }, (res) => {
      let html = '';
      
      res.on('data', (chunk) => {
        html += chunk;
      });
      
      res.on('end', () => {
        const loadTime = Date.now() - startTime;
        const context = parseHTML(url, html, loadTime);
        resolve(context);
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

async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.error('❌ Error: URL is required');
    console.log('\nUsage: node test-qx-http.js <URL>');
    console.log('Example: node test-qx-http.js https://example.com/');
    process.exit(1);
  }

  console.log('🔍 QX Partner Agent Analysis (HTTP Mode)');
  console.log('============================\n');
  console.log(`Target: ${url}\n`);

  try {
    // Fetch HTML using HTTP
    console.log('⚙️  Fetching website...');
    const context = await collectContextHTTP(url);
    console.log('✅ Fetched\n');

    // Initialize agent
    console.log('🔬 Analyzing...\n');
    
    // Create proper memory store
    const memoryStore = new Map();
    memoryStore.store = async (key, value) => { memoryStore.set(key, value); };
    memoryStore.retrieve = async (key) => { return memoryStore.get(key); };
    
    const agent = new QXPartnerAgent({
      agentId: `qx-partner-${Date.now()}`,
      context: {
        projectRoot: process.cwd(),
        config: {}
      },
      memoryStore,
      eventBus: new EventEmitter(),
      analysisMode: 'full',
      heuristics: {
        enabledHeuristics: [
          // Problem Analysis (3)
          'problem-understanding',
          'rule-of-three',
          'problem-complexity',
          // User Needs (3)
          'user-needs-identification',
          'user-needs-suitability',
          'user-needs-validation',
          // Business Needs (3)
          'business-needs-identification',
          'user-vs-business-balance',
          'kpi-impact-analysis',
          // Oracle Resolution (3)
          'oracle-problem-detection',
          'what-must-not-change',
          'supporting-data-analysis',
          // Impact Analysis (4)
          'gui-flow-impact',
          'user-feelings-impact',
          'cross-functional-impact',
          'data-dependent-impact',
          // Creativity (3)
          'competitive-analysis',
          'domain-inspiration',
          'innovative-solutions',
          // Design Quality (4)
          'exactness-and-clarity',
          'intuitive-design',
          'counter-intuitive-design',
          'consistency-analysis'
        ]
      }
    });

    await agent.initialize();

    // Perform QX analysis with pre-collected context
    const result = await agent.performTask({
      id: 'test-qx-1',
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

    // Display results
    console.log('\n📊 QX ANALYSIS RESULTS');
    console.log('======================\n');
    console.log(`Overall QX Score: ${result.overallScore}/100 (Grade: ${result.grade})`);
    console.log(`Analysis Date: ${new Date().toLocaleString()}\n`);

    console.log('📋 Problem Understanding:');
    console.log(`   Clarity Score: ${result.problemAnalysis.clarityScore}/100`);
    console.log(`   Complexity: ${result.problemAnalysis.complexity}`);
    console.log(`   Breakdown: ${result.problemAnalysis.breakdown.length} components\n`);

    console.log('👤 User Needs:');
    console.log(`   Alignment Score: ${result.userNeeds.alignmentScore}/100`);
    console.log(`   Suitability: ${result.userNeeds.suitability}`);
    console.log(`   Total Needs: ${result.userNeeds.needs.length}`);
    console.log(`   Challenges: ${result.userNeeds.challenges.length}\n`);

    console.log('💼 Business Needs:');
    console.log(`   Alignment Score: ${result.businessNeeds.alignmentScore}/100`);
    console.log(`   Primary Goal: ${result.businessNeeds.primaryGoal}`);
    console.log(`   KPIs Affected: ${result.businessNeeds.kpisAffected.length}\n`);

    console.log(`⚠️  Oracle Problems Detected: ${result.oracleProblems.length}`);
    result.oracleProblems.slice(0, 3).forEach((problem, i) => {
      console.log(`   ${i + 1}. [${problem.severity.toUpperCase()}] ${problem.type}`);
      console.log(`      ${problem.description}`);
    });

    console.log(`\n🎯 Heuristics Applied: ${result.heuristics.length}`);
    console.log(`   Average Score: ${Math.round(result.heuristics.reduce((sum, h) => sum + h.score, 0) / result.heuristics.length)}/100\n`);
    
    // Group by category
    const byCategory = result.heuristics.reduce((acc, h) => {
      if (!acc[h.category]) acc[h.category] = [];
      acc[h.category].push(h);
      return acc;
    }, {});
    
    console.log('   By Category:');
    Object.entries(byCategory).forEach(([cat, heuristics]) => {
      const avg = Math.round(heuristics.reduce((sum, h) => sum + h.score, 0) / heuristics.length);
      console.log(`   - ${cat}: ${avg}/100 avg (${heuristics.length} heuristics)`);
    });
    
    console.log('\n   Top 5 Performing:');
    const top5Heuristics = result.heuristics.sort((a, b) => b.score - a.score).slice(0, 5);
    top5Heuristics.forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.name}: ${h.score}/100`);
      if (h.findings.length > 0) {
        console.log(`      ✓ ${h.findings[0]}`);
      }
    });
    
    console.log('\n   Bottom 3 Performing:');
    const bottom3 = result.heuristics.sort((a, b) => a.score - b.score).slice(0, 3);
    bottom3.forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.name}: ${h.score}/100`);
      if (h.issues.length > 0) {
        console.log(`      ⚠ ${h.issues[0].description}`);
      }
    });

    console.log(`\n💡 RECOMMENDATIONS: ${result.recommendations.length} total\n`);
    const topRecs = result.recommendations.slice(0, 10);
    topRecs.forEach((rec, i) => {
      console.log(`${i + 1}. [${rec.severity.toUpperCase()}] ${rec.principle}`);
      console.log(`   ${rec.recommendation}`);
      const impactPct = rec.impactPercentage ? ` (${rec.impactPercentage}%)` : '';
      console.log(`   Category: ${rec.category} | Impact: ${rec.impact}${impactPct} | Effort: ${rec.estimatedEffort || rec.effort}`);
      console.log(`   Priority: ${rec.priority}\n`);
    });

    console.log('✅ Analysis Complete!\n');
    console.log('📝 Summary:');
    console.log(`   - Overall QX Score: ${result.overallScore}/100 (${result.grade})`);
    console.log(`   - Oracle Problems: ${result.oracleProblems.length}`);
    console.log(`   - Recommendations: ${result.recommendations.length}`);
    console.log(`   - Heuristics Applied: ${result.heuristics.length}\n`);

    await agent.cleanup();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error during analysis:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
