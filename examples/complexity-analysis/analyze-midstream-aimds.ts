/**
 * Analyze MidStream AIMDS Branch - Advanced Intelligence Multi-Domain System
 *
 * This analyzes the AIMDS branch which appears to be a specialized variant
 * of the MidStream platform focusing on advanced intelligence capabilities.
 */

import { CodeComplexityAnalyzerAgent } from '../../src/agents/CodeComplexityAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QEAgentType } from '../../src/types';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

async function main() {
  console.log('🧠 Analyzing MidStream AIMDS Branch');
  console.log('📍 Advanced Intelligence Multi-Domain System');
  console.log('=' .repeat(80));

  const repoPath = '/tmp/midstream-temp';

  // Ensure we're on AIMDS branch
  try {
    execSync(`cd ${repoPath} && git checkout AIMDS 2>/dev/null`, { stdio: 'pipe' });
  } catch (error) {
    console.error('❌ Failed to checkout AIMDS branch');
    throw error;
  }

  // Initialize agent
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();
  const eventBus = new EventEmitter();

  const agent = new CodeComplexityAnalyzerAgent({
    type: QEAgentType.QUALITY_ANALYZER,
    capabilities: [],
    context: {
      id: 'aimds-analyzer',
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

  // Find all source files
  const rustFiles = execSync(`cd ${repoPath} && find . -type f -name "*.rs" 2>/dev/null | grep -E "(src|crates)" || true`)
    .toString()
    .trim()
    .split('\n')
    .filter(f => f.length > 0);

  const tsFiles = execSync(`cd ${repoPath} && find . -type f \\( -name "*.ts" -o -name "*.js" \\) 2>/dev/null | grep -v node_modules | grep -E "(npm|src)" || true`)
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
    const cleanPath = relativePath.startsWith('./') ? relativePath.substring(2) : relativePath;
    const fullPath = path.join(repoPath, cleanPath);

    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
      const lines = content.split('\n').length;
      const language = cleanPath.endsWith('.rs') ? 'rust' : 'typescript';

      files.push({ path: cleanPath, content, language });
      totalSize += stats.size;
      totalLines += lines;

      const fileName = path.basename(cleanPath);
      const langEmoji = language === 'rust' ? '🦀' : '📘';
      console.log(`  ${langEmoji} ${fileName.padEnd(35)}`);
    }
  }

  console.log(`\n  📊 Total: ${totalSize.toLocaleString()} bytes, ${totalLines.toLocaleString()} lines`);

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

  // Display results
  console.log('\n' + '='.repeat(80));
  console.log('📊 AIMDS BRANCH ANALYSIS RESULTS');
  console.log('='.repeat(80));

  console.log('\n📈 Overall Metrics:');
  console.log(`  Files Analyzed:         ${files.length}`);
  console.log(`  Rust Files:             ${rustFiles.length}`);
  console.log(`  TypeScript Files:       ${tsFiles.length}`);
  console.log(`  Total LOC:              ${result.overall.linesOfCode.toLocaleString()}`);
  console.log(`  Quality Score:          ${result.score}/100`);
  console.log(`  Cyclomatic Complexity:  ${result.overall.cyclomaticComplexity.toFixed(2)}`);
  console.log(`  Cognitive Complexity:   ${result.overall.cognitiveComplexity.toFixed(2)}`);
  console.log(`  Issues Found:           ${result.issues.length}`);
  console.log(`  Analysis Time:          ${analysisTime}ms`);

  // Top complex files
  console.log('\n📁 Top 10 Most Complex Files:');
  console.log('-'.repeat(80));

  const sortedFiles = Array.from(result.fileMetrics.entries())
    .sort((a, b) => b[1].cyclomaticComplexity - a[1].cyclomaticComplexity)
    .slice(0, 10);

  sortedFiles.forEach(([filePath, metrics], index) => {
    const fileName = path.basename(filePath);
    const cyclo = metrics.cyclomaticComplexity;
    const cognitive = metrics.cognitiveComplexity;
    const langEmoji = filePath.endsWith('.rs') ? '🦀' : '📘';

    let emoji = '🟢';
    if (cyclo > 30 || cognitive > 40) emoji = '🔴';
    else if (cyclo > 20 || cognitive > 30) emoji = '🟠';
    else if (cyclo > 15 || cognitive > 20) emoji = '🟡';

    console.log(`\n${(index + 1).toString().padStart(2)}. ${emoji} ${langEmoji} ${fileName}`);
    console.log(`    Cyclomatic: ${cyclo.toFixed(2).padStart(6)} | Cognitive: ${cognitive.toFixed(2).padStart(6)} | LOC: ${metrics.linesOfCode.toString().padStart(4)}`);
  });

  // Issues breakdown
  if (result.issues.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`⚠️  ISSUES: ${result.issues.length} Total`);
    console.log('='.repeat(80));

    const critical = result.issues.filter(i => i.severity === 'critical').length;
    const high = result.issues.filter(i => i.severity === 'high').length;
    const medium = result.issues.filter(i => i.severity === 'medium').length;
    const low = result.issues.filter(i => i.severity === 'low').length;

    console.log(`\n  🔴 Critical: ${critical}`);
    console.log(`  🟠 High:     ${high}`);
    console.log(`  🟡 Medium:   ${medium}`);
    console.log(`  🟢 Low:      ${low}`);
  }

  // Comparison with other branches
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPARISON WITH OTHER BRANCHES');
  console.log('='.repeat(80));

  console.log('\nAIMDS vs Other Branches:');
  console.log('  main:                    48 files, 21.50 complexity, 74 issues');
  console.log('  v2-advanced-intelligence: 48 files, 21.50 complexity, 74 issues');
  console.log('  claude/lean-agentic:     43 files, 21.26 complexity, 68 issues');
  console.log(`  AIMDS (this):            ${files.length} files, ${result.overall.cyclomaticComplexity.toFixed(2)} complexity, ${result.issues.length} issues`);

  // Recommendations
  if (result.recommendations.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('💡 RECOMMENDATIONS');
    console.log('='.repeat(80));
    result.recommendations.forEach((rec, idx) => {
      console.log(`\n${idx + 1}. ${rec}`);
    });
  }

  console.log('\n' + '='.repeat(80));

  // Cleanup
  await agent.terminate();
  await memoryStore.close();

  console.log('\n✅ AIMDS branch analysis complete!\n');

  return result;
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}

export { main };
