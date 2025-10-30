/**
 * Comprehensive MidStream Analysis - ALL Files, ALL Branches
 *
 * Analyzes the complete MidStream codebase across multiple branches:
 * - main (default)
 * - AIMDS
 * - v2-advanced-intelligence
 * - claude/lean-agentic-learning-system
 */

import { CodeComplexityAnalyzerAgent } from '../../src/agents/CodeComplexityAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QEAgentType } from '../../src/types';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface BranchAnalysis {
  branch: string;
  filesAnalyzed: number;
  rustFiles: number;
  tsFiles: number;
  totalLOC: number;
  qualityScore: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  issuesCount: number;
  analysisTime: number;
  topComplexFiles: Array<{name: string; cyclomatic: number; cognitive: number}>;
}

async function analyzeBranch(
  branchName: string,
  repoPath: string,
  agent: CodeComplexityAnalyzerAgent
): Promise<BranchAnalysis> {

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Analyzing Branch: ${branchName}`);
  console.log('='.repeat(80));

  // Checkout branch
  try {
    execSync(`cd ${repoPath} && git checkout ${branchName} 2>/dev/null`, { stdio: 'pipe' });
  } catch (error) {
    console.error(`❌ Failed to checkout branch ${branchName}`);
    throw error;
  }

  // Find all source files
  const rustFiles = execSync(`cd ${repoPath} && find src crates -type f -name "*.rs" 2>/dev/null || true`)
    .toString()
    .trim()
    .split('\n')
    .filter(f => f.length > 0);

  const tsFiles = execSync(`cd ${repoPath} && find npm -type f \\( -name "*.ts" -o -name "*.js" \\) 2>/dev/null | grep -v node_modules || true`)
    .toString()
    .trim()
    .split('\n')
    .filter(f => f.length > 0);

  const allFiles = [...rustFiles, ...tsFiles];
  console.log(`\n📂 Found ${allFiles.length} files (🦀 ${rustFiles.length} Rust, 📘 ${tsFiles.length} TypeScript)\n`);

  // Read all files
  const files = [];
  let totalSize = 0;
  let totalLines = 0;

  for (const relativePath of allFiles) {
    const fullPath = path.join(repoPath, relativePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      const lines = content.split('\n').length;
      const language = relativePath.endsWith('.rs') ? 'rust' : 'typescript';

      files.push({ path: relativePath, content, language });
      totalSize += stats.size;
      totalLines += lines;
    }
  }

  console.log(`  📊 Total: ${totalSize.toLocaleString()} bytes, ${totalLines.toLocaleString()} lines`);
  console.log(`  🦀 Rust: ${rustFiles.length} files | 📘 TypeScript: ${tsFiles.length} files\n`);

  // Run analysis
  const startTime = Date.now();
  const result = await agent.analyzeComplexity({
    files,
    options: {
      includeRecommendations: true,
      severity: 'all'
    }
  });
  const analysisTime = Date.now() - startTime;

  // Extract top 5 complex files
  const sortedFiles = Array.from(result.fileMetrics.entries())
    .sort((a, b) => b[1].cyclomaticComplexity - a[1].cyclomaticComplexity)
    .slice(0, 5)
    .map(([filePath, metrics]) => ({
      name: path.basename(filePath),
      cyclomatic: metrics.cyclomaticComplexity,
      cognitive: metrics.cognitiveComplexity
    }));

  console.log(`\n✅ Analysis Complete:`);
  console.log(`   Quality Score: ${result.score}/100`);
  console.log(`   Issues Found: ${result.issues.length}`);
  console.log(`   Analysis Time: ${analysisTime}ms\n`);

  return {
    branch: branchName,
    filesAnalyzed: files.length,
    rustFiles: rustFiles.length,
    tsFiles: tsFiles.length,
    totalLOC: result.overall.linesOfCode,
    qualityScore: result.score,
    cyclomaticComplexity: result.overall.cyclomaticComplexity,
    cognitiveComplexity: result.overall.cognitiveComplexity,
    issuesCount: result.issues.length,
    analysisTime,
    topComplexFiles: sortedFiles
  };
}

async function main() {
  console.log('🌊 COMPREHENSIVE MIDSTREAM ANALYSIS - ALL FILES, ALL BRANCHES');
  console.log('📍 https://github.com/ruvnet/midstream');
  console.log('👨‍💻 Created by: rUv\n');

  const repoPath = '/tmp/midstream-temp';

  // Initialize agent
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();
  const eventBus = new EventEmitter();

  const agent = new CodeComplexityAnalyzerAgent({
    type: QEAgentType.QUALITY_ANALYZER,
    capabilities: [],
    context: {
      id: 'midstream-full-analyzer',
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

  // Branches to analyze
  const branches = [
    'main',
    'AIMDS',
    'v2-advanced-intelligence',
    'origin/claude/lean-agentic-learning-system-011CUUsq3TJioMficGe5bk2R'
  ];

  console.log(`🔍 Analyzing ${branches.length} branches:\n`);
  branches.forEach((branch, idx) => {
    console.log(`   ${idx + 1}. ${branch}`);
  });

  // Analyze all branches
  const results: BranchAnalysis[] = [];

  for (const branch of branches) {
    try {
      const result = await analyzeBranch(branch, repoPath, agent);
      results.push(result);
    } catch (error) {
      console.error(`❌ Failed to analyze branch ${branch}:`, error);
    }
  }

  // Display comparison
  console.log('\n' + '='.repeat(80));
  console.log('📊 CROSS-BRANCH COMPLEXITY COMPARISON');
  console.log('='.repeat(80));

  console.log('\n| Branch | Files | Rust | TS | LOC | Quality | Cyclo | Cognitive | Issues | Time |');
  console.log('|--------|-------|------|----|----|---------|-------|-----------|--------|------|');

  results.forEach(r => {
    const branchShort = r.branch.replace('origin/', '').substring(0, 20);
    console.log(`| ${branchShort.padEnd(20)} | ${r.filesAnalyzed.toString().padStart(5)} | ${r.rustFiles.toString().padStart(4)} | ${r.tsFiles.toString().padStart(2)} | ${r.totalLOC.toString().padStart(4)} | ${r.qualityScore.toString().padStart(7)} | ${r.cyclomaticComplexity.toFixed(1).padStart(5)} | ${r.cognitiveComplexity.toFixed(1).padStart(9)} | ${r.issuesCount.toString().padStart(6)} | ${r.analysisTime.toString().padStart(4)}ms |`);
  });

  // Detailed per-branch results
  console.log('\n' + '='.repeat(80));
  console.log('📋 DETAILED RESULTS PER BRANCH');
  console.log('='.repeat(80));

  results.forEach((result, idx) => {
    console.log(`\n${idx + 1}. Branch: ${result.branch}`);
    console.log('-'.repeat(80));
    console.log(`   Files Analyzed:      ${result.filesAnalyzed} (🦀 ${result.rustFiles} Rust, 📘 ${result.tsFiles} TypeScript)`);
    console.log(`   Total LOC:           ${result.totalLOC.toLocaleString()}`);
    console.log(`   Quality Score:       ${result.qualityScore}/100`);
    console.log(`   Cyclomatic Complex:  ${result.cyclomaticComplexity.toFixed(2)}`);
    console.log(`   Cognitive Complex:   ${result.cognitiveComplexity.toFixed(2)}`);
    console.log(`   Issues Found:        ${result.issuesCount}`);
    console.log(`   Analysis Time:       ${result.analysisTime}ms`);

    console.log(`\n   Top 5 Most Complex Files:`);
    result.topComplexFiles.forEach((file, fileIdx) => {
      const emoji = file.cyclomatic > 30 ? '🔴' : file.cyclomatic > 20 ? '🟠' : file.cyclomatic > 15 ? '🟡' : '🟢';
      console.log(`     ${fileIdx + 1}. ${emoji} ${file.name.padEnd(30)} Cyclo: ${file.cyclomatic.toFixed(0).padStart(3)} | Cognitive: ${file.cognitive.toFixed(0).padStart(3)}`);
    });
  });

  // Best/Worst branch analysis
  console.log('\n' + '='.repeat(80));
  console.log('🏆 BRANCH RANKINGS');
  console.log('='.repeat(80));

  const sortedByQuality = [...results].sort((a, b) => b.qualityScore - a.qualityScore);
  const sortedByComplexity = [...results].sort((a, b) => a.cyclomaticComplexity - b.cyclomaticComplexity);

  console.log('\n📈 Best Quality Scores:');
  sortedByQuality.forEach((r, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
    console.log(`   ${medal} ${r.branch.padEnd(35)} ${r.qualityScore}/100`);
  });

  console.log('\n⚡ Lowest Complexity (Best):');
  sortedByComplexity.forEach((r, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '  ';
    console.log(`   ${medal} ${r.branch.padEnd(35)} Cyclomatic: ${r.cyclomaticComplexity.toFixed(2)}`);
  });

  // Recommendations
  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS');
  console.log('='.repeat(80));

  const highestComplexity = sortedByComplexity[sortedByComplexity.length - 1];
  const mostIssues = [...results].sort((a, b) => b.issuesCount - a.issuesCount)[0];
  const lowestQuality = sortedByQuality[sortedByQuality.length - 1];

  console.log(`\n1. 🔴 Focus Refactoring on: ${highestComplexity.branch}`);
  console.log(`   Highest complexity (${highestComplexity.cyclomaticComplexity.toFixed(2)}) - needs immediate attention`);

  console.log(`\n2. ⚠️  Most Issues: ${mostIssues.branch}`);
  console.log(`   ${mostIssues.issuesCount} issues detected - prioritize issue resolution`);

  console.log(`\n3. 📉 Lowest Quality: ${lowestQuality.branch}`);
  console.log(`   Quality score ${lowestQuality.qualityScore}/100 - needs comprehensive review`);

  const bestBranch = sortedByQuality[0];
  if (bestBranch.branch !== 'main') {
    console.log(`\n4. ✅ Consider merging improvements from: ${bestBranch.branch}`);
    console.log(`   Highest quality score (${bestBranch.qualityScore}/100) - may have better implementations`);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 ANALYSIS SUMMARY');
  console.log('='.repeat(80));

  const totalFiles = results.reduce((sum, r) => sum + r.filesAnalyzed, 0);
  const avgQuality = results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;
  const totalIssues = results.reduce((sum, r) => sum + r.issuesCount, 0);
  const totalTime = results.reduce((sum, r) => sum + r.analysisTime, 0);

  console.log(`\n  🌊 MidStream Repository: ruvnet/midstream`);
  console.log(`  📊 Branches Analyzed:    ${results.length}`);
  console.log(`  📁 Total Files:          ${totalFiles}`);
  console.log(`  📈 Average Quality:      ${avgQuality.toFixed(2)}/100`);
  console.log(`  ⚠️  Total Issues:         ${totalIssues}`);
  console.log(`  ⏱️  Total Analysis Time:  ${totalTime}ms`);

  console.log('\n' + '='.repeat(80));

  // Cleanup
  await agent.terminate();
  await memoryStore.close();

  console.log('\n✅ Comprehensive multi-branch analysis complete!\n');

  return results;
}

// Run analysis
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}

export { main };
