/**
 * Analyze MidStream Real-Time LLM Streaming Platform - CodeComplexityAnalyzerAgent Demo
 *
 * This demo analyzes the MidStream platform created by rUv
 * (https://github.com/ruvnet/midstream) - a real-time LLM streaming system
 * with lean agentic learning and temporal analysis.
 *
 * Analyzes both Rust and TypeScript codebases.
 */

import { CodeComplexityAnalyzerAgent } from '../../src/agents/CodeComplexityAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QEAgentType } from '../../src/types';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('🌊 Analyzing MidStream Real-Time LLM Streaming Platform');
  console.log('📍 https://github.com/ruvnet/midstream');
  console.log('👨‍💻 Created by: rUv\n');
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
      id: 'midstream-analyzer',
      type: 'quality-analyzer',
      status: AgentStatus.INITIALIZING
    },
    memoryStore,
    eventBus,
    thresholds: {
      cyclomaticComplexity: 15,
      cognitiveComplexity: 20,
      linesOfCode: 300
    },
    enableRecommendations: true,
    enableLearning: false
  });

  await agent.initialize();

  // Select diverse files from MidStream (Rust + TypeScript)
  const midstreamRoot = '/workspaces/agentic-qe/midstream';
  const filesToAnalyze = [
    // Rust Core
    'src/lib.rs',
    'src/midstream.rs',
    'src/lean_agentic/agent.rs',
    'src/lean_agentic/temporal.rs',
    'src/lean_agentic/temporal_neural.rs',
    'crates/temporal-compare/src/lib.rs',
    'crates/temporal-neural-solver/src/lib.rs',
    'crates/strange-loop/src/lib.rs',
    // TypeScript/Node
    'npm/src/index.ts',
    'npm/src/streaming.ts',
    'npm/src/agent.ts',
    'npm/src/mcp-server.ts',
  ];

  console.log(`\n📂 Selected files from MidStream (${filesToAnalyze.length} files):\n`);

  // Read and prepare files
  const files = [];
  let totalSize = 0;
  let totalLines = 0;
  let rustFiles = 0;
  let tsFiles = 0;

  for (const relativePath of filesToAnalyze) {
    const fullPath = path.join(midstreamRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      const lines = content.split('\n').length;

      // Determine language
      const language = relativePath.endsWith('.rs') ? 'rust' : 'typescript';
      if (language === 'rust') rustFiles++;
      else tsFiles++;

      files.push({
        path: relativePath,
        content,
        language
      });

      totalSize += stats.size;
      totalLines += lines;

      const fileName = path.basename(relativePath);
      const langEmoji = language === 'rust' ? '🦀' : '📘';
      console.log(`  ${langEmoji} ${fileName.padEnd(35)} (${stats.size.toString().padStart(6)} bytes, ${lines.toString().padStart(4)} lines)`);
    } else {
      console.log(`  ✗ ${relativePath} (not found)`);
    }
  }

  console.log(`\n  📊 Total: ${totalSize.toLocaleString()} bytes, ${totalLines.toLocaleString()} lines`);
  console.log(`  🦀 Rust: ${rustFiles} files | 📘 TypeScript: ${tsFiles} files`);

  if (files.length === 0) {
    console.error('\n❌ No files found to analyze');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n🚀 Running Complexity Analysis on MidStream Codebase...\n');

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
  console.log('📊 MIDSTREAM COMPLEXITY ANALYSIS RESULTS');
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

  // Separate Rust and TypeScript files
  const rustFilesResult = Array.from(result.fileMetrics.entries()).filter(([path]) => path.endsWith('.rs'));
  const tsFilesResult = Array.from(result.fileMetrics.entries()).filter(([path]) => path.endsWith('.ts'));

  // Display per-language breakdown
  console.log('\n📊 Language Breakdown:');
  console.log('-'.repeat(80));

  if (rustFilesResult.length > 0) {
    const rustComplexity = rustFilesResult.reduce((sum, [, metrics]) => sum + metrics.cyclomaticComplexity, 0) / rustFilesResult.length;
    const rustCognitive = rustFilesResult.reduce((sum, [, metrics]) => sum + metrics.cognitiveComplexity, 0) / rustFilesResult.length;
    console.log(`\n🦀 Rust (${rustFilesResult.length} files):`);
    console.log(`   Avg Cyclomatic: ${rustComplexity.toFixed(2)} | Avg Cognitive: ${rustCognitive.toFixed(2)}`);
  }

  if (tsFilesResult.length > 0) {
    const tsComplexity = tsFilesResult.reduce((sum, [, metrics]) => sum + metrics.cyclomaticComplexity, 0) / tsFilesResult.length;
    const tsCognitive = tsFilesResult.reduce((sum, [, metrics]) => sum + metrics.cognitiveComplexity, 0) / tsFilesResult.length;
    console.log(`\n📘 TypeScript (${tsFilesResult.length} files):`);
    console.log(`   Avg Cyclomatic: ${tsComplexity.toFixed(2)} | Avg Cognitive: ${tsCognitive.toFixed(2)}`);
  }

  // Display complexity rankings
  console.log('\n📁 Complexity Rankings (Most to Least Complex):');
  console.log('-'.repeat(80));

  const sortedFiles = Array.from(result.fileMetrics.entries())
    .sort((a, b) => {
      const cycloDiff = b[1].cyclomaticComplexity - a[1].cyclomaticComplexity;
      if (cycloDiff !== 0) return cycloDiff;
      return b[1].cognitiveComplexity - a[1].cognitiveComplexity;
    });

  sortedFiles.forEach(([filePath, metrics], index) => {
    const fileName = path.basename(filePath);
    const cyclo = metrics.cyclomaticComplexity;
    const cognitive = metrics.cognitiveComplexity;
    const langEmoji = filePath.endsWith('.rs') ? '🦀' : '📘';

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

    console.log(`\n${(index + 1).toString().padStart(2)}. ${emoji} ${langEmoji} ${fileName} [${level}]`);
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
        const langEmoji = issue.file.endsWith('.rs') ? '🦀' : '📘';
        console.log(`\n  ${idx + 1}. ${langEmoji} ${fileName} - ${issue.location}`);
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
        const langEmoji = issue.file.endsWith('.rs') ? '🦀' : '📘';
        console.log(`  ${idx + 1}. ${langEmoji} ${fileName}: ${issue.type} = ${issue.current} (threshold: ${issue.threshold})`);
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
    console.log('💡 ACTIONABLE RECOMMENDATIONS FOR MIDSTREAM');
    console.log('='.repeat(80));
    result.recommendations.forEach((rec, idx) => {
      console.log(`\n${idx + 1}. ${rec}`);
    });
  }

  // Top files needing refactoring
  console.log('\n' + '='.repeat(80));
  console.log('🎯 TOP FILES NEEDING REFACTORING');
  console.log('='.repeat(80));

  sortedFiles.slice(0, 5).forEach(([filePath, metrics], index) => {
    const fileName = path.basename(filePath);
    const langEmoji = filePath.endsWith('.rs') ? '🦀' : '📘';
    console.log(`\n${index + 1}. ${langEmoji} ${fileName}`);
    console.log(`   Cyclomatic: ${metrics.cyclomaticComplexity.toFixed(2)} | Cognitive: ${metrics.cognitiveComplexity.toFixed(2)}`);
    console.log(`   Lines: ${metrics.linesOfCode} | Functions: ${metrics.functionCount}`);
    if (filePath.endsWith('.rs')) {
      console.log(`   Recommendation: Consider extracting complex logic into smaller modules`);
    } else {
      console.log(`   Recommendation: Consider breaking down into smaller, focused functions`);
    }
  });

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 MIDSTREAM CODEBASE SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n  📊 Files Analyzed:      ${files.length} (🦀 ${rustFiles} Rust, 📘 ${tsFiles} TypeScript)`);
  console.log(`  📈 Quality Score:       ${result.score}/100`);
  console.log(`  ⚠️  Issues Found:        ${result.issues.length}`);
  console.log(`  💡 Recommendations:     ${result.recommendations.length}`);
  console.log(`  ⏱️  Analysis Time:       ${analysisTime}ms`);

  // Quality assessment
  console.log('\n  🏆 Quality Assessment:');
  if (result.score >= 90) {
    console.log(`     Excellent! MidStream shows high code quality with minimal issues.`);
  } else if (result.score >= 75) {
    console.log(`     Good! MidStream is well-maintained with minor improvement opportunities.`);
  } else if (result.score >= 60) {
    console.log(`     Fair. MidStream would benefit from targeted refactoring in some areas.`);
  } else if (result.score >= 40) {
    console.log(`     Moderate. Several components have elevated complexity.`);
  } else {
    console.log(`     Needs improvement. Consider refactoring high-complexity modules.`);
  }

  // Technology-specific insights
  console.log('\n  💻 Technology Insights:');
  if (rustFiles > 0) {
    const avgRustComplexity = rustFilesResult.reduce((sum, [, m]) => sum + m.cyclomaticComplexity, 0) / rustFilesResult.length;
    if (avgRustComplexity <= 15) {
      console.log(`     🦀 Rust modules show good complexity management`);
    } else {
      console.log(`     🦀 Rust modules could benefit from further decomposition`);
    }
  }
  if (tsFiles > 0) {
    const avgTsComplexity = tsFilesResult.reduce((sum, [, m]) => sum + m.cyclomaticComplexity, 0) / tsFilesResult.length;
    if (avgTsComplexity <= 10) {
      console.log(`     📘 TypeScript code demonstrates clean architecture`);
    } else {
      console.log(`     📘 TypeScript code could use additional modularization`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💾 Memory Storage:');
  console.log(`   ✓ Analysis results stored in memory`);
  console.log(`   ✓ Available for coordination with other QE agents`);
  console.log(`   ✓ Can inform test generation and quality gates`);

  console.log('\n' + '='.repeat(80));

  // Cleanup
  await agent.terminate();
  await memoryStore.close();

  console.log('\n✅ MidStream analysis complete!\n');
}

// Run the analysis
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}

export { main };
