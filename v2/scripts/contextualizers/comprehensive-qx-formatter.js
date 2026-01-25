/**
 * Comprehensive QX Report Formatter
 * Matches manual report structure from teatime-qx-analysis-report.md
 */

/**
 * Format comprehensive QX analysis report matching manual structure
 */
function formatComprehensiveReport(analysis) {
  let md = '';

  // === HEADER ===
  md += `# QX Partner Agent Analysis: ${extractDomain(analysis.target)}\n`;
  md += `**Quality Experience (QX) Assessment**  \n`;
  md += `**Date**: ${new Date(analysis.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}  \n`;
  md += `**Analysis Mode**: Full QX Analysis\n\n`;
  md += `---\n\n`;

  // === OVERALL SCORE ===
  md += `## 📊 Overall QX Score: ${analysis.overallScore}/100 (Grade: ${analysis.grade}${gradeModifier(analysis.overallScore)})\n\n`;
  md += `**Analysis Timestamp**: ${new Date(analysis.timestamp).toISOString().replace('T', ' ').substring(0, 19)}  \n`;
  md += `**Target**: ${analysis.target}  \n`;
  md += `**Context**: ${inferContext(analysis)}\n\n`;
  md += `---\n\n`;

  // === PROBLEM UNDERSTANDING ===
  md += `## 📋 Problem Understanding (Rule of Three)\n\n`;
  md += `**Clarity Score**: ${analysis.problemAnalysis.clarityScore}/100\n\n`;
  md += `**Problem Definition**:\n`;
  md += `${analysis.problemAnalysis.problemStatement}\n\n`;

  if (analysis.problemAnalysis.potentialFailures?.length > 0) {
    md += `**Potential Failure Modes**:\n`;
    analysis.problemAnalysis.potentialFailures.forEach((failure, idx) => {
      md += `${idx + 1}. **${failure.description}**\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  // === USER NEEDS ANALYSIS ===
  md += `## 👤 User Needs Analysis\n\n`;
  md += `**Alignment Score**: ${analysis.userNeeds.alignmentScore}/100\n\n`;

  const mustHave = analysis.userNeeds.needs.filter(n => n.priority === 'must-have');
  const shouldHave = analysis.userNeeds.needs.filter(n => n.priority === 'should-have');
  const niceToHave = analysis.userNeeds.needs.filter(n => n.priority === 'nice-to-have');

  if (mustHave.length > 0) {
    md += `### Must-Have Features (${mustHave.length} identified):\n`;
    mustHave.forEach((need, idx) => {
      md += `${idx + 1}. ${need.description}\n`;
    });
    md += `\n`;
  }

  if (shouldHave.length > 0) {
    md += `### Should-Have Features (${shouldHave.length} identified):\n`;
    shouldHave.forEach((need, idx) => {
      md += `${idx + 1}. ${need.description}\n`;
    });
    md += `\n`;
  }

  if (niceToHave.length > 0) {
    md += `### Nice-to-Have Features (${niceToHave.length} identified):\n`;
    niceToHave.forEach((need, idx) => {
      md += `${idx + 1}. ${need.description}\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  // === BUSINESS NEEDS ANALYSIS ===
  md += `## 💼 Business Needs Analysis\n\n`;
  md += `**Alignment Score**: ${analysis.businessNeeds.alignmentScore}/100\n\n`;
  md += `**Primary Goal**: ${analysis.businessNeeds.primaryGoal}\n\n`;

  if (analysis.businessNeeds.kpisAffected?.length > 0) {
    md += `**KPI Impact**: High - ${analysis.businessNeeds.kpisAffected.join(', ')}\n\n`;
  }

  if (analysis.businessNeeds.crossTeamImpact?.length > 0) {
    md += `**Cross-Team Impact**:\n`;
    analysis.businessNeeds.crossTeamImpact.forEach(impact => {
      md += `- ${impact.team}: ${impact.description}\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  // === ORACLE PROBLEMS ===
  if (analysis.oracleProblems?.length > 0) {
    md += `## ⚠️ Oracle Problems Detected: ${analysis.oracleProblems.length}\n\n`;

    analysis.oracleProblems.forEach((problem, idx) => {
      const severityUpper = problem.severity.toUpperCase();
      md += `### ${idx + 1}. [${severityUpper}] ${problem.type}\n`;
      md += `**Description**: ${problem.description}\n\n`;
      md += `**Impact**: ${getOracleProblemImpact(problem)}\n\n`;
      md += `**Affected Stakeholders**: ${problem.stakeholders.join(', ')}\n\n`;

      if (problem.resolutionApproach?.length > 0) {
        md += `**Resolution Approach**: ${problem.resolutionApproach.join('; ')}\n\n`;
      }

      md += `---\n\n`;
    });
  }

  // === IMPACT ANALYSIS ===
  md += `## 📈 Impact Analysis\n\n`;
  md += `**Overall Impact Score**: ${analysis.impactAnalysis.overallImpactScore}/100\n\n`;

  md += `### Visible Impact (Score: ${analysis.impactAnalysis.visible.score}/100):\n`;
  if (analysis.impactAnalysis.visible.guiFlow) {
    md += `- **GUI Changes**: ${analysis.impactAnalysis.visible.guiFlow.forEndUser.length > 0 ? 'High impact' : 'Low impact'}\n`;
  }
  if (analysis.impactAnalysis.visible.userFeelings?.length > 0) {
    md += `- **User Feelings**: ${analysis.impactAnalysis.visible.userFeelings.join('; ')}\n`;
  }
  md += `\n`;

  md += `### Invisible Impact (Score: ${analysis.impactAnalysis.invisible.score}/100):\n`;
  if (analysis.impactAnalysis.invisible.performance?.length > 0) {
    md += `- **Performance**: ${analysis.impactAnalysis.invisible.performance.join('; ')}\n`;
  }
  if (analysis.impactAnalysis.invisible.security?.length > 0) {
    md += `- **Security**: ${analysis.impactAnalysis.invisible.security.join('; ')}\n`;
  }
  md += `\n`;

  if (analysis.impactAnalysis.immutableRequirements?.length > 0) {
    md += `### Immutable Requirements (${analysis.impactAnalysis.immutableRequirements.length} identified):\n`;
    analysis.impactAnalysis.immutableRequirements.forEach((req, idx) => {
      md += `${idx + 1}. ${req}\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  // === UX HEURISTICS (ORGANIZED BY CATEGORY) ===
  const heuristicsByCategory = organizeHeuristicsByCategory(analysis.heuristics || []);
  const avgScore = calculateAverageScore(analysis.heuristics || []);

  md += `## 🎯 UX Heuristics Applied: ${analysis.heuristics?.length || 0}\n\n`;
  md += `**Average Heuristic Score**: ${avgScore.toFixed(1)}/100\n\n`;

  // Top 3 and Bottom 3
  const sorted = [...(analysis.heuristics || [])].sort((a, b) => b.score - a.score);
  if (sorted.length >= 3) {
    md += `### Top 3 Performing Heuristics:\n`;
    sorted.slice(0, 3).forEach((h, idx) => {
      md += `${idx + 1}. **${formatHeuristicName(h.name)}**: ${h.score}/100${h.findings?.[0] ? ` - ${h.findings[0]}` : ''}\n`;
    });
    md += `\n`;

    md += `### Bottom 3 Performing Heuristics:\n`;
    sorted.slice(-3).reverse().forEach((h, idx) => {
      md += `${idx + 1}. **${formatHeuristicName(h.name)}**: ${h.score}/100${h.issues?.[0]?.description ? ` - ${h.issues[0].description}` : ''}\n`;
    });
    md += `\n`;
  }

  // Heuristics by Category - WITH DETAILED ANALYSIS
  md += `### Heuristics by Category:\n\n`;

  for (const [category, heuristics] of Object.entries(heuristicsByCategory)) {
    if (heuristics.length === 0) continue;

    const categoryAvg = calculateAverageScore(heuristics);
    md += `**${capitalizeFirst(category)}** (Avg: ${Math.round(categoryAvg)}/100):\n\n`;

    heuristics.forEach(h => {
      const emoji = h.score >= 85 ? '✅' : h.score >= 70 ? '✓' : h.score >= 60 ? '⚠️' : '❌';
      md += `#### ${emoji} ${formatHeuristicName(h.name)}: ${h.score}/100\n\n`;

      // What was found
      if (h.findings && h.findings.length > 0) {
        md += `**Findings:**\n`;
        h.findings.forEach(finding => {
          md += `- ${finding}\n`;
        });
        md += `\n`;
      }

      // Issues detected
      if (h.issues && h.issues.length > 0) {
        md += `**Issues:**\n`;
        h.issues.forEach(issue => {
          const issueEmoji = issue.severity === 'critical' ? '🚨' :
                             issue.severity === 'high' ? '⚠️' :
                             issue.severity === 'medium' ? '📌' : '💡';
          md += `- ${issueEmoji} [${issue.severity?.toUpperCase() || 'INFO'}] ${issue.description}\n`;
        });
        md += `\n`;
      }

      // Recommendations
      if (h.recommendations && h.recommendations.length > 0) {
        md += `**Recommendations:**\n`;
        h.recommendations.forEach(rec => {
          md += `- 💡 ${rec}\n`;
        });
        md += `\n`;
      }

      // If no details, explain the score
      if ((!h.findings || h.findings.length === 0) &&
          (!h.issues || h.issues.length === 0) &&
          (!h.recommendations || h.recommendations.length === 0)) {
        md += `*${getHeuristicExplanation(h.name, h.score)}*\n\n`;
      }
    });
  }

  md += `---\n\n`;

  // === TESTABILITY INTEGRATION ===
  if (analysis.testabilityIntegration) {
    md += `## 🔬 Testability Integration\n\n`;
    md += `**Overall Testability Score**: ${analysis.testabilityIntegration.testabilityScore || 'N/A'}/100\n\n`;
    md += `**QX-Testability Relation**: ${analysis.testabilityIntegration.relationship || 'Strong correlation between user experience quality and testability'}\n\n`;

    if (analysis.testabilityIntegration.combinedInsights?.length > 0) {
      md += `### Combined Insights:\n`;
      analysis.testabilityIntegration.combinedInsights.forEach((insight, idx) => {
        md += `${idx + 1}. ${insight}\n`;
      });
      md += `\n`;
    }

    if (analysis.testabilityIntegration.principles) {
      md += `### Testability Principle Alignment:\n`;
      Object.entries(analysis.testabilityIntegration.principles).forEach(([principle, score]) => {
        md += `- **${capitalizeFirst(principle)}**: ${score}/100\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;
  }

  // === RECOMMENDATIONS ===
  const topRecs = [...(analysis.recommendations || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 10);

  if (topRecs.length > 0) {
    md += `## 💡 Top ${topRecs.length} Recommendations\n\n`;

    topRecs.forEach((rec, idx) => {
      const severityLabel = (rec.severity || 'medium').toUpperCase();
      md += `### ${idx + 1}. [${severityLabel}] ${rec.principle}\n`;
      md += `**Recommendation**: ${rec.recommendation}\n\n`;
      md += `**Category**: ${rec.category}  \n`;
      md += `**Impact**: ${rec.impactPercentage || Math.round((rec.impact || 0) / 3)}% (${rec.impact}/100)  \n`;
      md += `**Effort**: ${rec.effort}  \n`;

      if (rec.estimatedEffort) {
        md += `**Estimated Effort**: ${rec.estimatedEffort}  \n`;
      }

      md += `\n`;

      if (rec.evidence?.length > 0) {
        md += `**Evidence**: ${rec.evidence[0]}\n\n`;
      }

      md += `---\n\n`;
    });
  }

  // === SCORE BREAKDOWN ===
  md += `## 📊 Score Breakdown\n\n`;
  md += `| Component | Score | Weight | Contribution |\n`;
  md += `|-----------|-------|--------|--------------|`;
  md += `\n| Problem Analysis | ${analysis.problemAnalysis.clarityScore}/100 | 20% | ${(analysis.problemAnalysis.clarityScore * 0.20).toFixed(1)} |`;
  md += `\n| User Needs | ${analysis.userNeeds.alignmentScore}/100 | 25% | ${(analysis.userNeeds.alignmentScore * 0.25).toFixed(1)} |`;
  md += `\n| Business Needs | ${analysis.businessNeeds.alignmentScore}/100 | 20% | ${(analysis.businessNeeds.alignmentScore * 0.20).toFixed(1)} |`;
  md += `\n| Impact Analysis | ${analysis.impactAnalysis.overallImpactScore}/100 | 15% | ${(analysis.impactAnalysis.overallImpactScore * 0.15).toFixed(1)} |`;
  md += `\n| Heuristics | ${avgScore.toFixed(1)}/100 | 20% | ${(avgScore * 0.20).toFixed(1)} |`;
  md += `\n| **Overall** | **${analysis.overallScore}/100** | **100%** | **${analysis.overallScore.toFixed(1)}** |\n\n`;

  const gradeInterp = getGradeInterpretation(analysis.grade);
  md += `**Grade**: ${analysis.grade}${gradeModifier(analysis.overallScore)}  \n`;
  md += `**Interpretation**: ${gradeInterp}\n\n`;
  md += `---\n\n`;

  // === BALANCE ANALYSIS ===
  md += `## 🎯 Balance Analysis\n\n`;
  md += `**User Alignment**: ${analysis.userNeeds.alignmentScore}/100  \n`;
  md += `**Business Alignment**: ${analysis.businessNeeds.alignmentScore}/100  \n`;
  const gap = Math.abs(analysis.userNeeds.alignmentScore - analysis.businessNeeds.alignmentScore);
  md += `**Gap**: ${gap} points\n\n`;

  const balanceStatus = gap < 10 ? '✅ **Well Balanced**' : gap < 20 ? '⚠️ **Moderate Imbalance**' : '❌ **Significant Imbalance**';
  md += `**Status**: ${balanceStatus}\n\n`;

  md += getBalanceDescription(analysis.userNeeds.alignmentScore, analysis.businessNeeds.alignmentScore, gap);
  md += `\n\n---\n\n`;

  // === EXECUTIVE SUMMARY ===
  md += `## 📝 Executive Summary\n\n`;

  const strengths = extractStrengths(analysis);
  const improvements = extractImprovements(analysis);

  md += `**Strengths**:\n`;
  strengths.slice(0, 5).forEach(s => md += `- ${s}\n`);
  md += `\n`;

  md += `**Areas for Improvement**:\n`;
  improvements.slice(0, 5).forEach(i => md += `- ${i.area}: ${i.recommendation}\n`);
  md += `\n`;

  if (topRecs.length > 0) {
    md += `**Priority Actions**:\n`;
    topRecs.slice(0, 5).forEach((rec, idx) => {
      md += `${idx + 1}. ${rec.principle} (${rec.severity?.toUpperCase() || 'MEDIUM'} Impact, ${capitalizeFirst(rec.effort)} Effort)\n`;
    });
    md += `\n`;
  }

  md += `**Overall Assessment**:\n`;
  md += `${generateOverallAssessment(analysis)}\n\n`;

  md += `---\n\n`;

  // === FOOTER ===
  md += `**Analysis Generated By**: QX Partner Agent v1.0  \n`;
  md += `**Framework**: Agentic QE - Quality Experience Analysis  \n`;
  md += `**Philosophy**: QX = QA (Quality Advocacy) + UX (User Experience)\n`;

  return md;
}

// === HELPER FUNCTIONS ===

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function gradeModifier(score) {
  const base = score - (score % 10);
  if (score >= base + 7) return '+';
  if (score <= base + 3) return '-';
  return '';
}

function inferContext(analysis) {
  const title = analysis.context?.title || '';
  const forms = analysis.context?.domMetrics?.forms || 0;

  if (title.toLowerCase().includes('test')) {
    return 'Testing community website for testers and QA professionals';
  }
  if (forms > 3) {
    return 'Interactive web application with form-based user input';
  }
  return 'Web application providing content and services to users';
}

function getOracleProblemImpact(problem) {
  const impacts = {
    'critical': 'Critical impact on both user satisfaction and business success',
    'high': 'Significant impact on user experience and business goals',
    'medium': 'Moderate impact on quality criteria and stakeholder alignment',
    'low': 'Minor impact but worth addressing for quality improvement'
  };
  return impacts[problem.severity] || impacts.medium;
}

function organizeHeuristicsByCategory(heuristics) {
  const categories = {
    usability: [],
    accessibility: [],
    design: [],
    interaction: [],
    content: [],
    problem: [],
    user: [],
    business: [],
    balance: [],
    impact: [],
    creativity: [],
    other: []
  };

  heuristics.forEach(h => {
    const cat = h.category || 'other';
    if (categories[cat]) {
      categories[cat].push(h);
    } else {
      categories.other.push(h);
    }
  });

  return categories;
}

function calculateAverageScore(heuristics) {
  if (heuristics.length === 0) return 0;
  const sum = heuristics.reduce((acc, h) => acc + h.score, 0);
  return sum / heuristics.length;
}

function formatHeuristicName(name) {
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getGradeInterpretation(grade) {
  const interpretations = {
    'A': 'Exceptional quality experience across all dimensions',
    'B': 'Good QX with minor areas for refinement',
    'C': 'Adequate quality with room for enhancement',
    'D': 'Below expectations with several quality issues',
    'F': 'Significant quality problems requiring immediate attention'
  };
  return interpretations[grade] || interpretations.C;
}

function getBalanceDescription(userScore, businessScore, gap) {
  if (gap < 10) {
    return `The website shows excellent alignment between user needs and business goals. This balance is ideal for sustainable growth.`;
  } else if (userScore > businessScore) {
    return `The website favors user needs (${gap} points higher), which is positive for user satisfaction but may need stronger business metric alignment for sustainability.`;
  } else {
    return `The website favors business needs (${gap} points higher), which may risk user satisfaction. Consider enhancing user-centric features.`;
  }
}

function extractStrengths(analysis) {
  const strengths = [];

  if (analysis.userNeeds.alignmentScore >= 85) {
    strengths.push('Excellent user needs alignment');
  }
  if (analysis.businessNeeds.alignmentScore >= 85) {
    strengths.push('Strong business-user alignment');
  }
  if (analysis.problemAnalysis.clarityScore >= 85) {
    strengths.push('Clear problem definition and understanding');
  }
  if (analysis.impactAnalysis.visible.score >= 85) {
    strengths.push('Positive visible impact on users');
  }

  const loadTime = analysis.context?.performance?.loadTime || 0;
  if (loadTime > 0 && loadTime < 1000) {
    strengths.push(`Very fast load time (${loadTime}ms)`);
  }

  const altCoverage = analysis.context?.accessibility?.altTextsCoverage || 0;
  if (altCoverage >= 80) {
    strengths.push(`Good accessibility (${Math.round(altCoverage)}% alt text coverage)`);
  }

  return strengths;
}

function extractImprovements(analysis) {
  const improvements = [];

  const heuristics = analysis.heuristics || [];
  const lowScoring = heuristics.filter(h => h.score < 70).sort((a, b) => a.score - b.score);

  lowScoring.slice(0, 5).forEach(h => {
    improvements.push({
      area: formatHeuristicName(h.name),
      recommendation: h.recommendations?.[0] || `Improve ${formatHeuristicName(h.name)}`
    });
  });

  if (analysis.oracleProblems?.length > 0) {
    improvements.push({
      area: 'Quality criteria clarity',
      recommendation: `Resolve ${analysis.oracleProblems.length} oracle problem(s)`
    });
  }

  return improvements;
}

function generateOverallAssessment(analysis) {
  const grade = analysis.grade;
  const strengths = extractStrengths(analysis);
  const improvements = extractImprovements(analysis);

  let assessment = '';

  if (grade === 'A') {
    assessment = `The website demonstrates exceptional quality experience with ${strengths.length} key strengths. `;
    assessment += `It successfully balances user needs with business objectives while maintaining high standards across all QX dimensions.`;
  } else if (grade === 'B') {
    assessment = `The website shows good quality experience with ${strengths.length} notable strengths. `;
    assessment += `${improvements.length} enhancement opportunities have been identified that could elevate the experience from "good" to "exceptional."`;
  } else if (grade === 'C') {
    assessment = `The website demonstrates adequate quality experience with a solid foundation (${strengths.length} strengths). `;
    assessment += `Key opportunities lie in ${improvements[0]?.area || 'core areas'} to enhance overall user satisfaction and business alignment.`;
  } else {
    assessment = `The website faces quality challenges requiring attention. `;
    assessment += `Focus should be on addressing ${improvements.length} identified areas, particularly ${improvements[0]?.area || 'fundamental quality issues'}.`;
  }

  return assessment;
}

function getHeuristicExplanation(name, score) {
  const explanations = {
    'problem-understanding': `Problem understanding is evaluated based on clarity of problem definition and breakdown. Score of ${score}/100 indicates ${score >= 80 ? 'good' : score >= 60 ? 'adequate' : 'poor'} problem comprehension.`,
    'problem-complexity': `Problem complexity assessment determines if the problem scope is simple, moderate, or complex. Score reflects complexity management.`,
    'rule-of-three': `Rule of Three checks if at least 3 potential failure modes have been identified. Score of ${score}/100 means ${score >= 80 ? 'sufficient' : 'insufficient'} failure mode analysis.`,
    'user-needs-identification': `Evaluates how well user needs are identified and categorized. ${score}/100 indicates ${score >= 85 ? 'excellent' : score >= 70 ? 'good' : 'weak'} user needs discovery.`,
    'user-needs-suitability': `Assesses whether identified user needs are appropriately categorized (must-have, should-have, nice-to-have).`,
    'user-needs-validation': `Checks if all identified user needs are validated and addressed in the design.`,
    'business-needs-identification': `Evaluates identification of business goals, KPIs, and cross-team impacts.`,
    'user-vs-business-balance': `Measures balance between user satisfaction and business objectives. ${score}/100 indicates ${score >= 85 ? 'excellent' : 'imbalanced'} alignment.`,
    'oracle-problem-detection': `Detects situations where quality criteria are unclear or conflicting between stakeholders.`,
    'kpi-impact-analysis': `Assesses impact on key business performance indicators.`,
    'gui-flow-impact': `Analyzes impact on user interface flows and interactions.`,
    'user-feelings-impact': `Evaluates emotional impact on users (frustrated, satisfied, confused, etc.).`,
    'cross-functional-impact': `Examines impact across different teams (dev, QA, content, marketing).`,
    'data-dependent-impact': `Identifies impacts that vary based on data conditions.`,
    'what-must-not-change': `Identifies immutable requirements that must be preserved.`,
    'supporting-data-analysis': `Evaluates availability and quality of supporting data for decisions.`,
    'competitive-analysis': `Compares against competitor approaches and industry standards.`,
    'domain-inspiration': `Checks for inspiration from other domains that could enhance the solution.`,
    'innovative-solutions': `Assesses creativity and innovation in the design approach. ${score}/100 suggests ${score >= 70 ? 'some' : 'limited'} innovative thinking.`,
    'exactness-and-clarity': `Evaluates precision and clarity of design specifications.`,
    'intuitive-design': `Measures how naturally users can understand and use the interface.`,
    'counter-intuitive-design': `Identifies design elements that work against user expectations.`,
    'consistency-analysis': `Checks for consistent design patterns and behaviors throughout.`
  };

  return explanations[name] || `${formatHeuristicName(name)} evaluates a specific quality dimension. Score: ${score}/100.`;
}

module.exports = {
  formatComprehensiveReport
};
