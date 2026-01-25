/**
 * Analyze Real Codebase Files - CodeComplexityAnalyzerAgent Demo
 *
 * This demo analyzes actual files from the Agentic QE codebase to demonstrate
 * the CodeComplexityAnalyzerAgent in action with real-world code.
 */

import { CodeComplexityAnalyzerAgent } from '../../src/agents/CodeComplexityAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QEAgentType } from '../../src/types';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🔍 Analyzing Agentic QE Codebase\n');
  console.log('=' .repeat(80));

  // Initialize the agent
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  const eventBus = new EventEmitter();

  const agent = new CodeComplexityAnalyzerAgent({
    type: QEAgentType.QUALITY_ANALYZER,
    capabilities: [],
    context: {
      id: 'codebase-analyzer',
      type: 'quality-analyzer',
      status: AgentStatus.INITIALIZING
    },
    memoryStore,
    eventBus,
    thresholds: {
      cyclomaticComplexity: 10,
      cognitiveComplexity: 15,
      linesOfCode: 200
    },
    enableRecommendations: true,
    enableLearning: false
  });

  await agent.initialize();

  // Files to analyze from the codebase
  const filesToAnalyze = [
    'src/agents/BaseAgent.ts',
    'src/core/memory/SwarmMemoryManager.ts',
    'src/agents/TestGeneratorAgent.ts',
    'src/cli/commands/init.ts',
    'src/utils/Logger.ts'
  ];

  console.log(`\n📂 Files to analyze: ${filesToAnalyze.length}\n`);

  // Read and prepare files
  const files = [];
  for (const filePath of filesToAnalyze) {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);

      files.push({
        path: filePath,
        content,
        language: 'typescript'
      });

      console.log(`  ✓ ${filePath} (${stats.size} bytes, ${content.split('\n').length} lines)`);
    } else {
      console.log(`  ✗ ${filePath} (not found)`);
    }
  }

  if (files.length === 0) {
    console.error('\n❌ No files found to analyze');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n🚀 Running Complexity Analysis...\n');

  // Run the analysis
  const result = await agent.analyzeComplexity({
    files,
    options: {
      includeRecommendations: true,
      severity: 'all'
    }
  });

  // Display results
  console.log('=' .repeat(80));
  console.log('📊 ANALYSIS RESULTS');
  console.log('=' .repeat(80));

  console.log('\n📈 Overall Metrics:');
  console.log(`  Quality Score: ${result.score}/100`);
  console.log(`  Cyclomatic Complexity: ${result.overall.cyclomaticComplexity.toFixed(2)}`);
  console.log(`  Cognitive Complexity: ${result.overall.cognitiveComplexity.toFixed(2)}`);
  console.log(`  Lines of Code: ${result.overall.linesOfCode}`);
  console.log(`  Function Count: ${result.overall.functionCount}`);
  console.log(`  Average Complexity/Function: ${result.overall.averageComplexityPerFunction.toFixed(2)}`);
  console.log(`  Analysis Time: ${result.analysisTime}ms`);

  // Display per-file metrics
  console.log('\n📁 Per-File Breakdown:');
  console.log('-'.repeat(80));

  const sortedFiles = Array.from(result.fileMetrics.entries())
    .sort((a, b) => b[1].cyclomaticComplexity - a[1].cyclomaticComplexity);

  sortedFiles.forEach(([filePath, metrics], index) => {
    const fileName = path.basename(filePath);
    const complexity = metrics.cyclomaticComplexity;
    const cognitive = metrics.cognitiveComplexity;

    // Color code by complexity
    let emoji = '🟢'; // Low
    if (complexity > 20 || cognitive > 30) emoji = '🔴'; // High
    else if (complexity > 10 || cognitive > 15) emoji = '🟡'; // Medium

    console.log(`\n${index + 1}. ${emoji} ${fileName}`);
    console.log(`   Path: ${filePath}`);
    console.log(`   Cyclomatic: ${complexity.toFixed(2)} | Cognitive: ${cognitive.toFixed(2)} | LOC: ${metrics.linesOfCode} | Functions: ${metrics.functionCount}`);

    if (metrics.functionCount > 0) {
      console.log(`   Avg Complexity/Function: ${(complexity / metrics.functionCount).toFixed(2)}`);
    }
  });

  // Display issues
  if (result.issues.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`⚠️  ISSUES DETECTED: ${result.issues.length}`);
    console.log('='.repeat(80));

    const criticalIssues = result.issues.filter(i => i.severity === 'critical');
    const highIssues = result.issues.filter(i => i.severity === 'high');
    const mediumIssues = result.issues.filter(i => i.severity === 'medium');
    const lowIssues = result.issues.filter(i => i.severity === 'low');

    if (criticalIssues.length > 0) {
      console.log(`\n🔴 CRITICAL (${criticalIssues.length}):`);
      criticalIssues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${path.basename(issue.file)} - ${issue.location}`);
        console.log(`     ${issue.type}: ${issue.current} (threshold: ${issue.threshold})`);
        if (issue.recommendation) {
          console.log(`     💡 ${issue.recommendation}`);
        }
      });
    }

    if (highIssues.length > 0) {
      console.log(`\n🟠 HIGH (${highIssues.length}):`);
      highIssues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${path.basename(issue.file)} - ${issue.location}`);
        console.log(`     ${issue.type}: ${issue.current} (threshold: ${issue.threshold})`);
      });
    }

    if (mediumIssues.length > 0) {
      console.log(`\n🟡 MEDIUM (${mediumIssues.length}):`);
      mediumIssues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${path.basename(issue.file)} - ${issue.location}`);
        console.log(`     ${issue.type}: ${issue.current} (threshold: ${issue.threshold})`);
      });
    }

    if (lowIssues.length > 0) {
      console.log(`\n🟢 LOW (${lowIssues.length}):`);
      lowIssues.slice(0, 5).forEach((issue, idx) => {
        console.log(`  ${idx + 1}. ${path.basename(issue.file)} - ${issue.location}`);
        console.log(`     ${issue.type}: ${issue.current} (threshold: ${issue.threshold})`);
      });
      if (lowIssues.length > 5) {
        console.log(`  ... and ${lowIssues.length - 5} more low-severity issues`);
      }
    }
  } else {
    console.log('\n✅ No issues detected - excellent code quality!');
  }

  // Display recommendations
  if (result.recommendations.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('💡 RECOMMENDATIONS');
    console.log('='.repeat(80));
    result.recommendations.forEach((rec, idx) => {
      console.log(`\n${idx + 1}. ${rec}`);
    });
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n✨ Files Analyzed: ${files.length}`);
  console.log(`📊 Overall Quality: ${result.score}/100`);
  console.log(`⚠️  Issues Found: ${result.issues.length}`);
  console.log(`💡 Recommendations: ${result.recommendations.length}`);

  // Quality assessment
  if (result.score >= 90) {
    console.log(`\n🎉 Excellent! The analyzed code has high quality.`);
  } else if (result.score >= 75) {
    console.log(`\n✅ Good! Minor improvements recommended.`);
  } else if (result.score >= 60) {
    console.log(`\n⚠️  Fair. Consider addressing the identified issues.`);
  } else {
    console.log(`\n❌ Needs improvement. Multiple refactoring opportunities identified.`);
  }

  console.log('\n' + '='.repeat(80));

  // Cleanup
  await agent.terminate();
  await memoryStore.close();

  console.log('\n✅ Analysis complete!\n');
}

// Run the analysis
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}

export { main };
