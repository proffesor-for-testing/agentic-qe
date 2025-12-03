#!/usr/bin/env node
/**
 * QX Analysis CLI - Proper implementation following QX Partner Agent architecture
 * 
 * Based on: /workspaces/agentic-qe/docs/agents/QX-PARTNER-AGENT.md
 * 
 * Usage:
 *   node scripts/generate-qx-analysis.js <url> [options]
 * 
 * Options:
 *   --mode <full|quick|targeted>     Analysis mode (default: full)
 *   --no-testability                 Disable testability integration
 *   --no-oracle                      Disable oracle problem detection
 *   --format <json|markdown|html>    Output format (default: markdown)
 *   --output <path>                  Output file path
 *   --min-score <number>             Minimum acceptable QX score
 * 
 * Examples:
 *   node scripts/generate-qx-analysis.js https://example.com
 *   node scripts/generate-qx-analysis.js https://example.com --mode quick
 *   node scripts/generate-qx-analysis.js https://example.com --format html --output report.html
 */

const { QXPartnerAgent } = require('../dist/agents/QXPartnerAgent');
const { QXTaskType } = require('../dist/types/qx');
const { QEAgentType } = require('../dist/types');
const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const { formatComprehensiveReport } = require('./contextualizers/comprehensive-qx-formatter');

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const config = {
    target: args[0],
    mode: 'full',
    testability: true,
    oracle: true,
    format: 'markdown',
    output: null,
    minScore: null
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        config.mode = args[++i];
        if (!['full', 'quick', 'targeted'].includes(config.mode)) {
          console.error(`Invalid mode: ${config.mode}. Must be full, quick, or targeted.`);
          process.exit(1);
        }
        break;
      case '--no-testability':
        config.testability = false;
        break;
      case '--no-oracle':
        config.oracle = false;
        break;
      case '--format':
        config.format = args[++i];
        if (!['json', 'markdown', 'html'].includes(config.format)) {
          console.error(`Invalid format: ${config.format}. Must be json, markdown, or html.`);
          process.exit(1);
        }
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--min-score':
        config.minScore = parseInt(args[++i], 10);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  return config;
}

function printUsage() {
  console.log(`
QX Analysis CLI - Quality Experience Analysis Tool

Usage:
  node scripts/generate-qx-analysis.js <url> [options]

Options:
  --mode <full|quick|targeted>     Analysis mode (default: full)
  --no-testability                 Disable testability integration
  --no-oracle                      Disable oracle problem detection
  --format <json|markdown|html>    Output format (default: markdown)
  --output <path>                  Output file path
  --min-score <number>             Minimum acceptable QX score

Examples:
  node scripts/generate-qx-analysis.js https://example.com
  node scripts/generate-qx-analysis.js https://example.com --mode quick
  node scripts/generate-qx-analysis.js https://example.com --format html --output report.html

For more information, see:
  /workspaces/agentic-qe/docs/agents/QX-PARTNER-AGENT.md
`);
}

// ============================================================================
// QX Analysis Execution
// ============================================================================

async function runQXAnalysis(config) {
  console.log(`\n🔍 Starting QX Analysis`);
  console.log(`Target: ${config.target}`);
  console.log(`Mode: ${config.mode}`);
  console.log(`Testability Integration: ${config.testability ? '✓' : '✗'}`);
  console.log(`Oracle Detection: ${config.oracle ? '✓' : '✗'}`);
  console.log(`Output Format: ${config.format}\n`);

  let agent = null;

  try {
    // Create QX Partner Agent
    const eventBus = new EventEmitter();
    
    // Create proper MemoryStore implementation
    const storage = new Map();
    const memoryStore = {
      async store(key, value, ttl) {
        storage.set(key, { value, timestamp: Date.now(), ttl });
      },
      async retrieve(key) {
        const item = storage.get(key);
        if (!item) return null;
        if (item.ttl && Date.now() - item.timestamp > item.ttl) {
          storage.delete(key);
          return null;
        }
        return item.value;
      },
      async set(key, value, namespace) {
        const fullKey = namespace ? `${namespace}:${key}` : key;
        storage.set(fullKey, { value, timestamp: Date.now() });
      },
      async get(key, namespace) {
        const fullKey = namespace ? `${namespace}:${key}` : key;
        const item = storage.get(fullKey);
        return item ? item.value : null;
      },
      async delete(key, namespace) {
        const fullKey = namespace ? `${namespace}:${key}` : key;
        return storage.delete(fullKey);
      },
      async clear(namespace) {
        if (namespace) {
          const prefix = `${namespace}:`;
          for (const key of storage.keys()) {
            if (key.startsWith(prefix)) {
              storage.delete(key);
            }
          }
        } else {
          storage.clear();
        }
      }
    };

    const agentConfig = {
      analysisMode: config.mode,
      integrateTestability: config.testability,
      detectOracleProblems: config.oracle,
      minOracleSeverity: 'low', // Show ALL oracle problems including low severity
      testabilityScoringPath: '.claude/skills/testability-scoring',
      // Don't override heuristics - let agent use all by default
      heuristics: undefined,
      collaboration: {
        coordinateWithUX: false, // Standalone mode
        coordinateWithQA: false,
        shareWithQualityAnalyzer: false
      },
      outputFormat: config.format,
      thresholds: config.minScore ? {
        minQXScore: config.minScore
      } : undefined,
      context: {
        workspaceRoot: process.cwd(),
        agentType: QEAgentType.QX_PARTNER,
        environment: 'cli'
      },
      memoryStore,
      eventBus
    };

    agent = new QXPartnerAgent(agentConfig);

    // Initialize agent
    console.log('⚙️  Initializing QX Partner Agent...');
    await agent.initialize();
    console.log('✅ Agent initialized\n');

    // Execute QX analysis task
    console.log('📊 Executing QX analysis...');
    const taskId = `qx-analysis-${Date.now()}`;
    
    const task = {
      id: taskId,
      assignee: agent.agentId,
      task: {
        type: 'qx-task',
        payload: {
          type: QXTaskType.FULL_ANALYSIS,
          target: config.target,
          params: {
            context: {
              source: 'cli',
              timestamp: new Date().toISOString()
            }
          },
          config: {
            integrateTestability: config.testability
          }
        }
      }
    };

    const analysis = await agent.executeTask(task);

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('📊 QX ANALYSIS RESULTS');
    console.log('='.repeat(80) + '\n');

    displayResults(analysis);

    // Generate output
    const output = await generateOutput(analysis, config);
    
    // Save to file
    const outputPath = await saveOutput(output, config, analysis);
    
    console.log(`\n✅ Analysis complete!`);
    console.log(`📄 Report saved: ${outputPath}\n`);

    // Check against minimum score
    if (config.minScore && analysis.overallScore < config.minScore) {
      console.log(`⚠️  Warning: Score ${analysis.overallScore} is below minimum threshold ${config.minScore}`);
      process.exit(1);
    }

    return analysis;

  } catch (error) {
    console.error('\n❌ QX Analysis failed:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (agent) {
      try {
        await agent.cleanup();
        console.log('🧹 Agent cleanup completed');
      } catch (error) {
        console.error('Warning: Cleanup error:', error.message);
      }
    }
  }
}

// ============================================================================
// Results Display
// ============================================================================

function displayResults(analysis) {
  console.log(`Target: ${analysis.target}`);
  console.log(`Overall Score: ${analysis.overallScore}/100 (Grade ${analysis.grade})`);
  console.log(`Timestamp: ${analysis.timestamp.toISOString()}\n`);

  // Problem Analysis
  console.log('📋 Problem Analysis');
  console.log(`   Clarity Score: ${analysis.problemAnalysis.clarityScore}/100`);
  console.log(`   Complexity: ${analysis.problemAnalysis.complexity}`);
  console.log(`   Problem Statement: ${analysis.problemAnalysis.problemStatement}`);
  if (analysis.problemAnalysis.potentialFailures?.length > 0) {
    console.log(`   Failure Modes: ${analysis.problemAnalysis.potentialFailures.length}`);
  }
  console.log();

  // User Needs Analysis
  console.log('👤 User Needs Analysis');
  console.log(`   Alignment Score: ${analysis.userNeeds.alignmentScore}/100`);
  console.log(`   Suitability: ${analysis.userNeeds.suitability}`);
  if (analysis.userNeeds.needs?.length > 0) {
    console.log(`   Identified Needs: ${analysis.userNeeds.needs.length}`);
    analysis.userNeeds.needs.slice(0, 3).forEach(need => {
      console.log(`      - [${need.priority}] ${need.description}`);
    });
  }
  console.log();

  // Business Needs Analysis
  console.log('💼 Business Needs Analysis');
  console.log(`   Alignment Score: ${analysis.businessNeeds.alignmentScore}/100`);
  console.log(`   Primary Goal: ${analysis.businessNeeds.primaryGoal}`);
  if (analysis.businessNeeds.kpiImpacts?.length > 0) {
    console.log(`   KPI Impacts: ${analysis.businessNeeds.kpiImpacts.length}`);
  }
  console.log();

  // Oracle Problems
  if (analysis.oracleProblems?.length > 0) {
    console.log('🔍 Oracle Problems Detected');
    analysis.oracleProblems.forEach((problem, idx) => {
      console.log(`   ${idx + 1}. [${problem.severity.toUpperCase()}] ${problem.type}`);
      console.log(`      ${problem.description}`);
      if (problem.stakeholders) console.log(`      Stakeholders: ${problem.stakeholders.join(', ')}`);
    });
    console.log();
  }

  // Impact Analysis
  console.log('💥 Impact Analysis');
  console.log(`   Overall Impact Score: ${analysis.impactAnalysis.overallImpactScore}/100`);
  console.log(`   Visible Impacts: ${analysis.impactAnalysis.visible.score}/100`);
  console.log(`   Invisible Impacts: ${analysis.impactAnalysis.invisible.score}/100`);
  if (analysis.impactAnalysis.visible.guiFlow?.forEndUser?.length > 0) {
    console.log(`   GUI Flow Impacts: ${analysis.impactAnalysis.visible.guiFlow.forEndUser.length}`);
  }
  if (analysis.impactAnalysis.visible.userFeelings?.length > 0) {
    console.log(`   User Feelings: ${analysis.impactAnalysis.visible.userFeelings.length}`);
  }
  console.log();

  // Heuristics Summary
  if (analysis.heuristics?.length > 0) {
    console.log('🎯 Heuristics Applied');
    const avgScore = analysis.heuristics.reduce((sum, h) => sum + h.score, 0) / analysis.heuristics.length;
    console.log(`   Total Heuristics: ${analysis.heuristics.length}`);
    console.log(`   Average Score: ${Math.round(avgScore)}/100`);
    console.log();
  }

  // Recommendations
  if (analysis.recommendations?.length > 0) {
    console.log('💡 Top Recommendations');
    const topRecs = analysis.recommendations
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5);
    
    topRecs.forEach((rec, idx) => {
      const severityEmoji = rec.severity === 'critical' ? '🚨' : 
                           rec.severity === 'high' ? '⚠️' : 
                           rec.severity === 'medium' ? '📌' : '💡';
      console.log(`   ${idx + 1}. ${severityEmoji} [${rec.category.toUpperCase()}] ${rec.principle}`);
      console.log(`      Impact: ${rec.impact}/100 | Effort: ${rec.effort}`);
      console.log(`      ${rec.recommendation}`);
    });
    console.log();
  }

  // Testability Integration
  if (analysis.testabilityIntegration) {
    console.log('🧪 Testability Integration');
    console.log(`   Testability Score: ${analysis.testabilityIntegration.testabilityScore}/100`);
    if (analysis.testabilityIntegration.combinedInsights?.length > 0) {
      console.log(`   Combined Insights: ${analysis.testabilityIntegration.combinedInsights.length}`);
    }
    console.log();
  }
}

// ============================================================================
// Output Generation
// ============================================================================

async function generateOutput(analysis, config) {
  switch (config.format) {
    case 'json':
      return generateJSONOutput(analysis);
    case 'html':
      return generateHTMLOutput(analysis);
    case 'markdown':
    default:
      return formatComprehensiveReport(analysis);
  }
}

function generateJSONOutput(analysis) {
  return JSON.stringify(analysis, null, 2);
}

// ============================================================================
// Helper Functions for Enhanced Markdown Report
// ============================================================================

/**
 * Group heuristics by score range for summary
 */
function groupHeuristicsByPerformance(heuristics) {
  const exceptional = [];
  const excellent = [];
  const good = [];
  const needsWork = [];

  heuristics.forEach(h => {
    if (h.score >= 95) exceptional.push(h);
    else if (h.score >= 85) excellent.push(h);
    else if (h.score >= 70) good.push(h);
    else needsWork.push(h);
  });

  return { exceptional, excellent, good, needsWork };
}

/**
 * Extract strengths from analysis
 */
function extractStrengths(analysis) {
  const strengths = [];

  // From problem analysis
  if (analysis.problemAnalysis.clarityScore >= 90) {
    strengths.push('Clear problem definition and purpose');
  }

  // From user needs
  if (analysis.userNeeds.alignmentScore >= 90) {
    strengths.push('Excellent user needs alignment');
  }
  if (analysis.userNeeds.suitability === 'excellent') {
    strengths.push('All user needs appropriately addressed');
  }

  // From business needs
  if (analysis.businessNeeds.alignmentScore >= 90) {
    strengths.push('Strong business-user alignment');
  }
  if (!analysis.businessNeeds.compromisesUX) {
    strengths.push('No UX compromises for business goals');
  }

  // From accessibility
  const altCoverage = analysis.context?.accessibility?.altTextsCoverage || 0;
  if (altCoverage >= 90) {
    strengths.push(`Excellent accessibility (${Math.round(altCoverage)}% alt text coverage)`);
  }

  // From performance
  const loadTime = analysis.context?.performance?.loadTime || 9999;
  if (loadTime < 1500) {
    strengths.push(`Very fast load time (${Math.round(loadTime)}ms)`);
  }

  // From heuristics
  const highScoreHeuristics = analysis.heuristics?.filter(h => h.score >= 95) || [];
  if (highScoreHeuristics.length > 0) {
    const topHeuristic = highScoreHeuristics[0];
    if (topHeuristic.name.includes('consistency')) {
      strengths.push('Professional, consistent design');
    }
    if (topHeuristic.name.includes('semantic') || topHeuristic.name.includes('clarity')) {
      strengths.push('Strong semantic structure');
    }
  }

  // From semantic structure
  if (analysis.context?.domMetrics?.semanticStructure?.hasMain) {
    strengths.push('Good semantic HTML structure');
  }

  return strengths.slice(0, 8); // Top 8 strengths
}

/**
 * Extract areas for improvement
 */
function extractImprovements(analysis) {
  const improvements = [];

  // From heuristics with scores < 70
  const lowScoreHeuristics = analysis.heuristics?.filter(h => h.score < 70) || [];
  lowScoreHeuristics.forEach(h => {
    if (h.recommendations && h.recommendations.length > 0) {
      improvements.push({
        area: h.name.replace(/-/g, ' '),
        score: h.score,
        recommendation: h.recommendations[0]
      });
    }
  });

  // From oracle problems
  if (analysis.oracleProblems?.length > 0) {
    improvements.push({
      area: 'Quality criteria clarity',
      score: 60,
      recommendation: `Resolve ${analysis.oracleProblems.length} oracle problem(s)`
    });
  }

  // From potential failures
  const highSeverityFailures = analysis.problemAnalysis.potentialFailures?.filter(
    f => f.severity === 'high' || f.severity === 'critical'
  ) || [];
  if (highSeverityFailures.length > 0) {
    improvements.push({
      area: 'High-risk failure modes',
      score: 50,
      recommendation: `Address ${highSeverityFailures.length} high-severity failure mode(s)`
    });
  }

  return improvements.slice(0, 5); // Top 5 improvements
}

/**
 * Detect site type from context
 */
function detectSiteType(analysis) {
  const title = (analysis.context?.title || '').toLowerCase();
  const desc = (analysis.context?.metadata?.description || '').toLowerCase();

  if (title.includes('hotel') || title.includes('booking') || title.includes('travel') ||
      desc.includes('book') || desc.includes('hotel')) {
    return 'E-commerce/Travel Booking';
  }
  if (title.includes('blog') || title.includes('testing') || title.includes('article')) {
    return 'Content/Blog/Professional Site';
  }
  if (title.includes('dashboard') || title.includes('app')) {
    return 'SaaS/Web Application';
  }

  const interactive = analysis.context?.domMetrics?.interactiveElements || 0;
  if (interactive > 50) {
    return 'Complex Web Application';
  }

  return 'Content Website';
}

/**
 * Generate key takeaway based on overall analysis
 */
function generateKeyTakeaway(analysis) {
  const grade = analysis.grade;
  const strengths = extractStrengths(analysis);
  const improvements = extractImprovements(analysis);

  let takeaway = '';

  if (grade === 'A') {
    takeaway = `This is an **outstanding website** with exceptional quality experience across all dimensions. `;
    takeaway += `With ${strengths.length} major strengths and minimal areas for improvement, the site sets a high standard for user experience and quality.`;
  } else if (grade === 'B') {
    takeaway = `This is a **well-built, professionally maintained website** with strong technical quality and good user experience. `;
    takeaway += `The ${analysis.overallScore}/100 score reflects solid execution across QX dimensions. `;
    if (improvements.length > 0) {
      takeaway += `Key opportunities lie in ${improvements[0].area} and enhancing innovation to elevate from "good" to "outstanding."`;
    }
  } else if (grade === 'C') {
    takeaway = `This website demonstrates **adequate quality** with room for improvement. `;
    takeaway += `While the foundation is solid (${strengths.length} key strengths), addressing ${improvements.length} improvement areas could significantly enhance the user experience.`;
  } else {
    takeaway = `This website faces **quality challenges** that require attention. `;
    takeaway += `Focus should be on addressing the ${improvements.length} identified improvement areas, particularly ${improvements[0]?.area || 'core quality issues'}.`;
  }

  return takeaway;
}

function generateMarkdownOutput(analysis) {
  let md = '';

  const siteType = detectSiteType(analysis);
  const strengths = extractStrengths(analysis);
  const improvements = extractImprovements(analysis);
  const grouped = groupHeuristicsByPerformance(analysis.heuristics || []);
  const keyTakeaway = generateKeyTakeaway(analysis);

  // Header
  md += `# QX Analysis Report\n\n`;
  md += `**Target:** ${analysis.target}\n`;
  md += `**Overall Score:** ${analysis.overallScore}/100 (Grade ${analysis.grade})\n`;
  md += `**Site Type:** ${siteType}\n`;
  md += `**Analysis Date:** ${new Date(analysis.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
  md += `---\n\n`;

  // Executive Summary - ENHANCED
  md += `## 📊 Executive Summary\n\n`;

  const qualityLevel = analysis.grade === 'A' ? 'Excellent' :
                       analysis.grade === 'B' ? 'Good' :
                       analysis.grade === 'C' ? 'Adequate' : 'Needs Improvement';

  md += `**Score: ${analysis.overallScore}/100 (Grade ${analysis.grade})** - ${qualityLevel} Quality Experience\n\n`;
  md += `This Quality Experience (QX) analysis combines Quality Advocacy (QA) and User Experience (UX) perspectives to provide a comprehensive assessment of ${analysis.target}.\n\n`;

  // Quick insights
  md += `### Key Insights\n\n`;
  md += `- **${strengths.length} Major Strengths** identified across QX dimensions\n`;
  md += `- **${improvements.length} Improvement Opportunities** for enhanced quality\n`;
  if (analysis.oracleProblems?.length > 0) {
    md += `- **${analysis.oracleProblems.length} Oracle Problem(s)** requiring stakeholder resolution\n`;
  }
  if (analysis.problemAnalysis.potentialFailures?.length > 0) {
    md += `- **${analysis.problemAnalysis.potentialFailures.length} Potential Failure Mode(s)** identified\n`;
  }
  md += `- **${analysis.heuristics?.length || 0} QX Heuristics** applied and evaluated\n\n`;

  // Score Breakdown
  md += `### Score Breakdown\n\n`;
  md += `| Component | Score | Grade | Assessment |\n`;
  md += `|-----------|-------|-------|------------|\n`;

  const problemAssessment = analysis.problemAnalysis.clarityScore >= 90 ? 'Excellent' :
                           analysis.problemAnalysis.clarityScore >= 80 ? 'Good' :
                           analysis.problemAnalysis.clarityScore >= 70 ? 'Adequate' : 'Needs Work';
  md += `| Problem Clarity | ${analysis.problemAnalysis.clarityScore}/100 | ${scoreToGrade(analysis.problemAnalysis.clarityScore)} | ${problemAssessment} |\n`;

  const userAssessment = analysis.userNeeds.alignmentScore >= 90 ? 'Excellent' :
                        analysis.userNeeds.alignmentScore >= 80 ? 'Good' :
                        analysis.userNeeds.alignmentScore >= 70 ? 'Adequate' : 'Needs Work';
  md += `| User Needs Alignment | ${analysis.userNeeds.alignmentScore}/100 | ${scoreToGrade(analysis.userNeeds.alignmentScore)} | ${userAssessment} |\n`;

  const businessAssessment = analysis.businessNeeds.alignmentScore >= 90 ? 'Excellent' :
                            analysis.businessNeeds.alignmentScore >= 80 ? 'Good' :
                            analysis.businessNeeds.alignmentScore >= 70 ? 'Adequate' : 'Needs Work';
  md += `| Business Needs Alignment | ${analysis.businessNeeds.alignmentScore}/100 | ${scoreToGrade(analysis.businessNeeds.alignmentScore)} | ${businessAssessment} |\n`;

  if (analysis.heuristics?.length > 0) {
    const avgHeuristicScore = Math.round(
      analysis.heuristics.reduce((sum, h) => sum + h.score, 0) / analysis.heuristics.length
    );
    const heuristicAssessment = avgHeuristicScore >= 90 ? 'Excellent' :
                               avgHeuristicScore >= 80 ? 'Good' :
                               avgHeuristicScore >= 70 ? 'Adequate' : 'Needs Work';
    md += `| Heuristics Average | ${avgHeuristicScore}/100 | ${scoreToGrade(avgHeuristicScore)} | ${heuristicAssessment} |\n`;
  }

  md += `\n`;

  // Strengths Summary - NEW
  if (strengths.length > 0) {
    md += `## ✅ Strengths Summary\n\n`;
    md += `This analysis identified **${strengths.length} major strengths** across QX dimensions:\n\n`;
    strengths.forEach((strength, idx) => {
      md += `${idx + 1}. ${strength}\n`;
    });
    md += `\n`;
  }

  // Areas for Improvement - NEW
  if (improvements.length > 0) {
    md += `## 🎯 Areas for Improvement\n\n`;
    md += `To enhance quality experience, consider addressing these **${improvements.length} opportunities**:\n\n`;
    improvements.forEach((improvement, idx) => {
      md += `${idx + 1}. **${improvement.area}** (Current: ${improvement.score}/100)\n`;
      md += `   - ${improvement.recommendation}\n\n`;
    });
  }

  // Problem Analysis
  md += `## 📋 Problem Analysis\n\n`;
  md += `**Clarity Score:** ${analysis.problemAnalysis.clarityScore}/100\n`;
  md += `**Complexity:** ${analysis.problemAnalysis.complexity}\n`;
  md += `**Problem Statement:** ${analysis.problemAnalysis.problemStatement}\n\n`;

  if (analysis.problemAnalysis.potentialFailures?.length > 0) {
    md += `### Rule of Three - Potential Failure Modes\n\n`;
    analysis.problemAnalysis.potentialFailures.forEach((failure, idx) => {
      md += `${idx + 1}. **${failure.description}**\n`;
      md += `   - Severity: ${failure.severity}\n`;
      md += `   - Likelihood: ${failure.likelihood}\n\n`;
    });
  }

  // User Needs Analysis
  md += `## 👤 User Needs Analysis\n\n`;
  md += `**Alignment Score:** ${analysis.userNeeds.alignmentScore}/100\n`;
  md += `**Suitability:** ${analysis.userNeeds.suitability}\n\n`;

  if (analysis.userNeeds.needs?.length > 0) {
    md += `### Identified User Needs\n\n`;
    const grouped = {
      'must-have': [],
      'should-have': [],
      'nice-to-have': []
    };
    
    analysis.userNeeds.needs.forEach(need => {
      grouped[need.priority].push(need);
    });

    Object.entries(grouped).forEach(([priority, needs]) => {
      if (needs.length > 0) {
        md += `#### ${priority.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}\n\n`;
        needs.forEach(need => {
          md += `- ${need.description}`;
          if (need.rationale) md += ` (${need.rationale})`;
          md += `\n`;
        });
        md += `\n`;
      }
    });
  }

  if (analysis.userNeeds.challenges?.length > 0) {
    md += `### Challenges\n\n`;
    analysis.userNeeds.challenges.forEach(challenge => {
      md += `- ⚠️ ${challenge}\n`;
    });
    md += `\n`;
  }

  // Business Needs Analysis
  md += `## 💼 Business Needs Analysis\n\n`;
  md += `**Alignment Score:** ${analysis.businessNeeds.alignmentScore}/100\n`;
  md += `**Primary Goal:** ${analysis.businessNeeds.primaryGoal}\n\n`;

  if (analysis.businessNeeds.kpiImpacts?.length > 0) {
    md += `### KPI Impacts\n\n`;
    analysis.businessNeeds.kpiImpacts.forEach(kpi => {
      md += `- **${kpi.kpi}**: ${kpi.impact} (${kpi.direction})\n`;
    });
    md += `\n`;
  }

  if (analysis.businessNeeds.crossTeamImpacts?.length > 0) {
    md += `### Cross-Team Impacts\n\n`;
    analysis.businessNeeds.crossTeamImpacts.forEach(impact => {
      md += `- **${impact.team}**: ${impact.impact}\n`;
    });
    md += `\n`;
  }

  if (analysis.businessNeeds.uxCompromises?.length > 0) {
    md += `### UX Compromises\n\n`;
    analysis.businessNeeds.uxCompromises.forEach(compromise => {
      md += `- ⚠️ ${compromise}\n`;
    });
    md += `\n`;
  }

  // Oracle Problems
  if (analysis.oracleProblems?.length > 0) {
    md += `## 🔍 Oracle Problems Detected\n\n`;
    md += `Oracle problems indicate situations where quality criteria are unclear or conflicting, requiring stakeholder collaboration to resolve.\n\n`;

    analysis.oracleProblems.forEach((problem, idx) => {
      const severityEmoji = problem.severity === 'critical' ? '🚨' : 
                           problem.severity === 'high' ? '⚠️' : 
                           problem.severity === 'medium' ? '📌' : '💡';
      
      md += `### ${idx + 1}. ${severityEmoji} ${problem.type} [${problem.severity.toUpperCase()}]\n\n`;
      md += `**Description:** ${problem.description}\n\n`;
      
      if (problem.evidence?.length > 0) {
        md += `**Evidence:**\n`;
        problem.evidence.forEach(e => md += `- ${e}\n`);
        md += `\n`;
      }

      if (problem.resolutionApproach?.length > 0) {
        md += `**Resolution Approach:**\n`;
        problem.resolutionApproach.forEach(r => md += `- ${r}\n`);
        md += `\n`;
      }

      if (problem.affectedStakeholders?.length > 0) {
        md += `**Affected Stakeholders:** ${problem.affectedStakeholders.join(', ')}\n\n`;
      }
    });
  }

  // Impact Analysis
  md += `## 💥 Impact Analysis\n\n`;
  md += `Analysis of both visible and invisible impacts on all stakeholders.\n\n`;
  md += `**Overall Impact Score:** ${analysis.impactAnalysis.overallImpactScore}/100\n\n`;

  md += `### Visible Impacts (Score: ${analysis.impactAnalysis.visible.score}/100)\n\n`;

  // GUI Flow Impact
  if (analysis.impactAnalysis.visible.guiFlow) {
    const { forEndUser, forInternalUser } = analysis.impactAnalysis.visible.guiFlow;
    if (forEndUser?.length > 0 || forInternalUser?.length > 0) {
      md += `#### GUI Flow Impact\n\n`;
      if (forEndUser?.length > 0) {
        md += `**End User Flow:**\n`;
        forEndUser.forEach(impact => {
          md += `- ${impact}\n`;
        });
        md += `\n`;
      }
      if (forInternalUser?.length > 0) {
        md += `**Internal User Flow:**\n`;
        forInternalUser.forEach(impact => {
          md += `- ${impact}\n`;
        });
        md += `\n`;
      }
    }
  }

  // User Feelings
  if (analysis.impactAnalysis.visible.userFeelings?.length > 0) {
    md += `#### User Feelings\n\n`;
    analysis.impactAnalysis.visible.userFeelings.forEach(feeling => {
      md += `- ${feeling}\n`;
    });
    md += `\n`;
  }

  md += `### Invisible Impacts (Score: ${analysis.impactAnalysis.invisible.score}/100)\n\n`;

  // Performance
  if (analysis.impactAnalysis.invisible.performance?.length > 0) {
    md += `#### Performance\n\n`;
    analysis.impactAnalysis.invisible.performance.forEach(perf => {
      md += `- ${perf}\n`;
    });
    md += `\n`;
  }

  // Security
  if (analysis.impactAnalysis.invisible.security?.length > 0) {
    md += `#### Security\n\n`;
    analysis.impactAnalysis.invisible.security.forEach(sec => {
      md += `- ${sec}\n`;
    });
    md += `\n`;
  }

  // Immutable Requirements
  if (analysis.impactAnalysis.immutableRequirements?.length > 0) {
    md += `### Immutable Requirements\n\n`;
    md += `These requirements must remain unchanged:\n\n`;
    analysis.impactAnalysis.immutableRequirements.forEach(req => {
      md += `- ✅ ${req}\n`;
    });
    md += `\n`;
  }

  // Legacy compatibility - keep looking for old structure but don't error
  if (analysis.impactAnalysis.dataDependentImpact) {
    md += `#### Data-Dependent Impact: ${analysis.impactAnalysis.dataDependentImpact.score}/100\n\n`;
    if (analysis.impactAnalysis.dataDependentImpact.insights?.length > 0) {
      analysis.impactAnalysis.dataDependentImpact.insights.forEach(insight => {
        md += `- ${insight}\n`;
      });
      md += `\n`;
    }
  }

  // Heuristics Summary - ENHANCED (Grouped instead of all 23 listed)
  if (analysis.heuristics?.length > 0) {
    md += `## 🎯 QX Heuristics Summary\n\n`;
    md += `Analysis applied **${analysis.heuristics.length} QX heuristics** across problem analysis, user needs, business needs, balance, impact, creativity, and design dimensions.\n\n`;

    // Exceptional Performance
    if (grouped.exceptional.length > 0) {
      md += `### 🌟 Exceptional Performance (95-100)\n\n`;
      grouped.exceptional.forEach(h => {
        md += `- **${h.name.replace(/-/g, ' ')}** (${h.score}/100)\n`;
        if (h.findings && h.findings.length > 0) {
          md += `  - ${h.findings[0]}\n`;
        }
      });
      md += `\n`;
    }

    // Excellent Performance
    if (grouped.excellent.length > 0) {
      md += `### ⭐ Excellent Performance (85-94)\n\n`;
      grouped.excellent.forEach(h => {
        md += `- **${h.name.replace(/-/g, ' ')}** (${h.score}/100)\n`;
      });
      md += `\n`;
    }

    // Good Performance
    if (grouped.good.length > 0) {
      md += `### ✓ Good Performance (70-84)\n\n`;
      grouped.good.forEach(h => {
        md += `- **${h.name.replace(/-/g, ' ')}** (${h.score}/100)\n`;
      });
      md += `\n`;
    }

    // Needs Improvement
    if (grouped.needsWork.length > 0) {
      md += `### ⚠️ Needs Improvement (<70)\n\n`;
      grouped.needsWork.forEach(h => {
        md += `- **${h.name.replace(/-/g, ' ')}** (${h.score}/100)\n`;
        if (h.recommendations && h.recommendations.length > 0) {
          md += `  - 💡 ${h.recommendations[0]}\n`;
        }
      });
      md += `\n`;
    }
  }

  // Recommendations
  if (analysis.recommendations?.length > 0) {
    md += `## 💡 QX Recommendations\n\n`;
    md += `Prioritized recommendations based on QX analysis:\n\n`;

    const sortedRecs = [...analysis.recommendations].sort((a, b) => a.priority - b.priority);

    sortedRecs.forEach((rec, idx) => {
      const severityEmoji = rec.severity === 'critical' ? '🚨' : 
                           rec.severity === 'high' ? '⚠️' : 
                           rec.severity === 'medium' ? '📌' : '💡';
      
      md += `### ${idx + 1}. ${severityEmoji} ${rec.principle}\n\n`;
      md += `**Category:** ${rec.category.toUpperCase()}\n`;
      md += `**Severity:** ${rec.severity}\n`;
      md += `**Impact:** ${rec.impact}/100\n`;
      md += `**Effort:** ${rec.effort}\n\n`;
      md += `${rec.recommendation}\n\n`;

      if (rec.evidence?.length > 0) {
        md += `**Evidence:**\n`;
        rec.evidence.forEach(e => md += `- ${e}\n`);
        md += `\n`;
      }
    });
  }

  // Testability Integration
  if (analysis.testabilityIntegration) {
    md += `## 🧪 Testability Integration\n\n`;
    md += `**Testability Score:** ${analysis.testabilityIntegration.testabilityScore}/100\n\n`;

    if (analysis.testabilityIntegration.combinedInsights?.length > 0) {
      md += `### Combined QX + Testability Insights\n\n`;
      analysis.testabilityIntegration.combinedInsights.forEach(insight => {
        md += `- ${insight}\n`;
      });
      md += `\n`;
    }

    if (analysis.testabilityIntegration.correlations) {
      md += `### Correlations\n\n`;
      md += `Analysis of how QX metrics correlate with testability principles.\n\n`;
      // Add correlation details if available
    }
  }

  // Key Takeaway - NEW
  md += `## 🎯 Key Takeaway\n\n`;
  md += `${keyTakeaway}\n\n`;

  // Technical Details
  const altCoverage = analysis.context?.accessibility?.altTextsCoverage || 0;
  const loadTime = analysis.context?.performance?.loadTime || 0;
  const interactiveElements = analysis.context?.domMetrics?.interactiveElements || 0;

  if (altCoverage > 0 || loadTime > 0 || interactiveElements > 0) {
    md += `### Technical Quality Indicators\n\n`;
    if (altCoverage >= 80) {
      md += `- **Accessibility:** ${Math.round(altCoverage)}% alt text coverage ✅\n`;
    }
    if (loadTime > 0 && loadTime < 3000) {
      md += `- **Performance:** ${Math.round(loadTime)}ms load time ✅\n`;
    }
    if (interactiveElements > 0) {
      md += `- **Interactivity:** ${interactiveElements} interactive elements\n`;
    }
    if (analysis.context?.domMetrics?.semanticStructure?.hasMain) {
      md += `- **Structure:** Semantic HTML with proper landmarks ✅\n`;
    }
    md += `\n`;
  }

  // Footer
  md += `---\n\n`;
  md += `**Analysis Method:** QX Partner Agent with domain-specific ${siteType.toLowerCase()} analysis\n`;
  md += `**Framework:** Agentic QE v1.9.4 (Enhanced)\n\n`;
  md += `*Report generated by Agentic QE - QX Partner Agent*\n`;
  md += `*Based on: [Quality Experience (QX) Concept](https://talesoftesting.com/quality-experienceqx-co-creating-quality-experience-for-everyone-associated-with-the-product/)*\n`;

  return md;
}

function generateHTMLOutput(analysis) {
  // Convert markdown to HTML
  const markdown = formatComprehensiveReport(analysis);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QX Analysis Report - ${analysis.target}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; border-bottom: 2px solid #ecf0f1; padding-bottom: 8px; }
    h3 { color: #555; }
    .score { font-size: 2em; color: #3498db; font-weight: bold; }
    .grade-A { color: #27ae60; }
    .grade-B { color: #2ecc71; }
    .grade-C { color: #f39c12; }
    .grade-D { color: #e67e22; }
    .grade-F { color: #e74c3c; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ecf0f1; }
    th { background: #3498db; color: white; }
    .recommendation { background: #ecf0f1; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #3498db; }
    .oracle-problem { background: #fff3cd; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #ffc107; }
    code { background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
    pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <pre>${markdown}</pre>
  </div>
</body>
</html>`;
}

function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ============================================================================
// Output Saving
// ============================================================================

async function saveOutput(content, config, analysis) {
  const reportsDir = path.join(process.cwd(), 'reports');
  
  // Ensure reports directory exists
  try {
    await fs.access(reportsDir);
  } catch {
    await fs.mkdir(reportsDir, { recursive: true });
  }

  // Determine output path
  let outputPath;
  if (config.output) {
    outputPath = path.isAbsolute(config.output) 
      ? config.output 
      : path.join(reportsDir, config.output);
  } else {
    const timestamp = Date.now();
    const extension = config.format === 'json' ? 'json' : 
                     config.format === 'html' ? 'html' : 'md';
    outputPath = path.join(reportsDir, `qx-analysis-${timestamp}.${extension}`);
  }

  await fs.writeFile(outputPath, content, 'utf8');
  
  return outputPath;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const config = parseArgs();
  await runQXAnalysis(config);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runQXAnalysis, generateMarkdownOutput, generateJSONOutput, generateHTMLOutput };
