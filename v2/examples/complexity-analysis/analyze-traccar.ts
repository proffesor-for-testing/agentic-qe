/**
 * Analyze Traccar GPS Tracking System - CodeComplexityAnalyzerAgent Demo
 *
 * This demo analyzes the Traccar open-source GPS tracking system
 * (https://github.com/traccar/traccar) to demonstrate the CodeComplexityAnalyzerAgent
 * analyzing a real-world, production Java codebase.
 *
 * Traccar is a popular GPS tracking platform with 1400+ Java files.
 */

import { CodeComplexityAnalyzerAgent } from '../../src/agents/CodeComplexityAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QEAgentType } from '../../src/types';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🚗 Analyzing Traccar GPS Tracking System');
  console.log('📍 https://github.com/traccar/traccar\n');
  console.log('=' .repeat(80));

  // Initialize the agent
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  const eventBus = new EventEmitter();

  // Listen for analysis events
  let analysisCount = 0;
  eventBus.on('complexity:analysis:completed', (event) => {
    analysisCount++;
  });

  const agent = new CodeComplexityAnalyzerAgent({
    type: QEAgentType.QUALITY_ANALYZER,
    capabilities: [],
    context: {
      id: 'traccar-analyzer',
      type: 'quality-analyzer',
      status: AgentStatus.INITIALIZING
    },
    memoryStore,
    eventBus,
    thresholds: {
      cyclomaticComplexity: 15,  // Java tends to be more complex
      cognitiveComplexity: 20,
      linesOfCode: 300
    },
    enableRecommendations: true,
    enableLearning: false
  });

  await agent.initialize();

  // Select diverse files from Traccar to analyze
  const traccarRoot = '/workspaces/agentic-qe/traccar';
  const filesToAnalyze = [
    'src/main/java/org/traccar/Main.java',
    'src/main/java/org/traccar/MainModule.java',
    'src/main/java/org/traccar/ProcessingHandler.java',
    'src/main/java/org/traccar/handler/DatabaseHandler.java',
    'src/main/java/org/traccar/handler/GeolocationHandler.java',
    'src/main/java/org/traccar/handler/network/MainEventHandler.java',
    'src/main/java/org/traccar/handler/events/MotionEventHandler.java',
    'src/main/java/org/traccar/schedule/ScheduleManager.java',
    'src/main/java/org/traccar/storage/DatabaseStorage.java',
    'src/main/java/org/traccar/session/ConnectionManager.java',
  ];

  console.log(`\n📂 Selected files from Traccar (${filesToAnalyze.length} files):\n`);

  // Read and prepare files
  const files = [];
  let totalSize = 0;
  let totalLines = 0;

  for (const relativePath of filesToAnalyze) {
    const fullPath = path.join(traccarRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      const lines = content.split('\n').length;

      files.push({
        path: relativePath,
        content,
        language: 'java'
      });

      totalSize += stats.size;
      totalLines += lines;

      const fileName = path.basename(relativePath);
      console.log(`  ✓ ${fileName.padEnd(35)} (${stats.size.toString().padStart(6)} bytes, ${lines.toString().padStart(4)} lines)`);
    } else {
      console.log(`  ✗ ${relativePath} (not found)`);
    }
  }

  console.log(`\n  📊 Total: ${totalSize.toLocaleString()} bytes, ${totalLines.toLocaleString()} lines`);

  if (files.length === 0) {
    console.error('\n❌ No files found to analyze');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n🚀 Running Complexity Analysis on Traccar Codebase...\n');

  const startTime = Date.now();

  // Run the analysis
  const result = await agent.analyzeComplexity({
    files,
    options: {
      includeRecommendations: true,
      severity: 'all'
    }
  });

  const analysisTime = Date.now() - startTime;

  // Display results
  console.log('=' .repeat(80));
  console.log('📊 TRACCAR COMPLEXITY ANALYSIS RESULTS');
  console.log('=' .repeat(80));

  console.log('\n📈 Overall Code Quality Metrics:');
  console.log(`  Quality Score:          ${result.score}/100`);
  console.log(`  Cyclomatic Complexity:  ${result.overall.cyclomaticComplexity.toFixed(2)}`);
  console.log(`  Cognitive Complexity:   ${result.overall.cognitiveComplexity.toFixed(2)}`);
  console.log(`  Total Lines of Code:    ${result.overall.linesOfCode.toLocaleString()}`);
  console.log(`  Function Count:         ${result.overall.functionCount}`);
  console.log(`  Avg Complexity/Function: ${result.overall.averageComplexityPerFunction.toFixed(2)}`);
  console.log(`  Analysis Time:          ${analysisTime}ms`);
  console.log(`  Events Emitted:         ${analysisCount}`);

  // Display per-file metrics sorted by complexity
  console.log('\n📁 Complexity Rankings (Most to Least Complex):');
  console.log('-'.repeat(80));

  const sortedFiles = Array.from(result.fileMetrics.entries())
    .sort((a, b) => {
      // Sort by cyclomatic complexity first, then cognitive
      const cycloDiff = b[1].cyclomaticComplexity - a[1].cyclomaticComplexity;
      if (cycloDiff !== 0) return cycloDiff;
      return b[1].cognitiveComplexity - a[1].cognitiveComplexity;
    });

  sortedFiles.forEach(([filePath, metrics], index) => {
    const fileName = path.basename(filePath);
    const cyclo = metrics.cyclomaticComplexity;
    const cognitive = metrics.cognitiveComplexity;

    // Determine complexity level
    let emoji = '🟢'; // Low
    let level = 'Low';
    if (cyclo > 30 || cognitive > 40) {
      emoji = '🔴'; // Critical
      level = 'Critical';
    } else if (cyclo > 20 || cognitive > 30) {
      emoji = '🟠'; // High
      level = 'High';
    } else if (cyclo > 15 || cognitive > 20) {
      emoji = '🟡'; // Medium
      level = 'Medium';
    }

    console.log(`\n${(index + 1).toString().padStart(2)}. ${emoji} ${fileName} [${level}]`);
    console.log(`    Path: ${filePath}`);
    console.log(`    Cyclomatic: ${cyclo.toFixed(2).padStart(6)} | Cognitive: ${cognitive.toFixed(2).padStart(6)} | LOC: ${metrics.linesOfCode.toString().padStart(4)} | Functions: ${metrics.functionCount.toString().padStart(3)}`);

    if (metrics.functionCount > 0) {
      const avgComplexity = cyclo / metrics.functionCount;
      console.log(`    Avg Complexity per Function: ${avgComplexity.toFixed(2)}`);
    }
  });

  // Display issues by severity
  if (result.issues.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`⚠️  CODE QUALITY ISSUES: ${result.issues.length} Total`);
    console.log('='.repeat(80));

    const criticalIssues = result.issues.filter(i => i.severity === 'critical');
    const highIssues = result.issues.filter(i => i.severity === 'high');
    const mediumIssues = result.issues.filter(i => i.severity === 'medium');
    const lowIssues = result.issues.filter(i => i.severity === 'low');

    console.log(`\n  🔴 Critical: ${criticalIssues.length}`);
    console.log(`  🟠 High:     ${highIssues.length}`);
    console.log(`  🟡 Medium:   ${mediumIssues.length}`);
    console.log(`  🟢 Low:      ${lowIssues.length}`);

    if (criticalIssues.length > 0) {
      console.log('\n🔴 CRITICAL ISSUES (Immediate attention recommended):');
      console.log('-'.repeat(80));
      criticalIssues.slice(0, 8).forEach((issue, idx) => {
        const fileName = path.basename(issue.file);
        console.log(`\n  ${idx + 1}. ${fileName} - ${issue.location}`);
        console.log(`     Issue: ${issue.type.toUpperCase()}`);
        console.log(`     Current: ${issue.current} | Threshold: ${issue.threshold}`);
        if (issue.recommendation) {
          console.log(`     💡 ${issue.recommendation}`);
        }
      });
      if (criticalIssues.length > 8) {
        console.log(`\n  ... and ${criticalIssues.length - 8} more critical issues`);
      }
    }

    if (highIssues.length > 0) {
      console.log(`\n🟠 HIGH PRIORITY ISSUES (${highIssues.length} total):`);
      console.log('-'.repeat(80));
      highIssues.slice(0, 5).forEach((issue, idx) => {
        const fileName = path.basename(issue.file);
        console.log(`  ${idx + 1}. ${fileName}: ${issue.type} = ${issue.current} (threshold: ${issue.threshold})`);
      });
      if (highIssues.length > 5) {
        console.log(`  ... and ${highIssues.length - 5} more high priority issues`);
      }
    }

    if (mediumIssues.length > 0) {
      console.log(`\n🟡 MEDIUM PRIORITY: ${mediumIssues.length} issues`);
    }

    if (lowIssues.length > 0) {
      console.log(`🟢 LOW PRIORITY: ${lowIssues.length} issues`);
    }
  } else {
    console.log('\n✅ Excellent! No code quality issues detected.');
  }

  // Display recommendations
  if (result.recommendations.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('💡 ACTIONABLE RECOMMENDATIONS FOR TRACCAR');
    console.log('='.repeat(80));
    result.recommendations.forEach((rec, idx) => {
      console.log(`\n${idx + 1}. ${rec}`);
    });
  }

  // Top 3 most complex files needing refactoring
  console.log('\n' + '='.repeat(80));
  console.log('🎯 TOP 3 FILES NEEDING REFACTORING');
  console.log('='.repeat(80));

  sortedFiles.slice(0, 3).forEach(([filePath, metrics], index) => {
    const fileName = path.basename(filePath);
    console.log(`\n${index + 1}. ${fileName}`);
    console.log(`   Cyclomatic: ${metrics.cyclomaticComplexity.toFixed(2)} | Cognitive: ${metrics.cognitiveComplexity.toFixed(2)}`);
    console.log(`   Lines: ${metrics.linesOfCode} | Functions: ${metrics.functionCount}`);
    console.log(`   Recommendation: Consider breaking down into smaller, focused classes`);
  });

  // Summary and quality assessment
  console.log('\n' + '='.repeat(80));
  console.log('📋 TRACCAR CODEBASE SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n  📊 Files Analyzed:      ${files.length}`);
  console.log(`  📈 Quality Score:       ${result.score}/100`);
  console.log(`  ⚠️  Issues Found:        ${result.issues.length}`);
  console.log(`  💡 Recommendations:     ${result.recommendations.length}`);
  console.log(`  ⏱️  Analysis Time:       ${analysisTime}ms`);

  // Quality assessment with context
  console.log('\n  🏆 Quality Assessment:');
  if (result.score >= 90) {
    console.log(`     Excellent! The Traccar codebase shows high quality with minimal issues.`);
  } else if (result.score >= 75) {
    console.log(`     Good! The Traccar codebase is well-maintained with minor improvement opportunities.`);
  } else if (result.score >= 60) {
    console.log(`     Fair. The Traccar codebase would benefit from targeted refactoring.`);
  } else if (result.score >= 40) {
    console.log(`     Moderate. Several components have high complexity and need refactoring.`);
  } else {
    console.log(`     Needs improvement. Significant refactoring recommended for better maintainability.`);
  }

  // Comparison context
  console.log('\n  📊 Complexity Context (vs Industry Standards):');
  const avgCyclo = result.overall.cyclomaticComplexity / files.length;
  if (avgCyclo <= 10) {
    console.log(`     Average Cyclomatic: ${avgCyclo.toFixed(2)} - Excellent (target: ≤10)`);
  } else if (avgCyclo <= 15) {
    console.log(`     Average Cyclomatic: ${avgCyclo.toFixed(2)} - Good (target: ≤10)`);
  } else if (avgCyclo <= 20) {
    console.log(`     Average Cyclomatic: ${avgCyclo.toFixed(2)} - Moderate (target: ≤10)`);
  } else {
    console.log(`     Average Cyclomatic: ${avgCyclo.toFixed(2)} - High (target: ≤10)`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💾 Memory Storage:');
  console.log(`   ✓ Analysis results stored in memory at: aqe/complexity/${agent.getStatus().agentId.id}/latest-result`);
  console.log(`   ✓ Available for coordination with other QE agents`);
  console.log(`   ✓ Can be used by test-generator to focus on complex areas`);
  console.log(`   ✓ Can be used by quality-gate for deployment decisions`);

  console.log('\n' + '='.repeat(80));

  // Cleanup
  await agent.terminate();
  await memoryStore.close();

  console.log('\n✅ Traccar analysis complete!\n');
}

// Run the analysis
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}

export { main };
