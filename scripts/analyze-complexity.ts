#!/usr/bin/env tsx
/**
 * Detailed Code Complexity Analysis for Agentic QE
 * Analyzes cyclomatic and cognitive complexity with specific recommendations
 */

import fs from 'fs';
import path from 'path';

interface ComplexityResult {
  file: string;
  function: string;
  lineStart: number;
  lineEnd: number;
  cyclomatic: number;
  cognitive: number;
  linesOfCode: number;
  recommendations: string[];
}

interface FileAnalysis {
  file: string;
  totalLines: number;
  totalFunctions: number;
  avgCyclomatic: number;
  avgCognitive: number;
  hotspots: ComplexityResult[];
}

function analyzeFunction(name: string, code: string, startLine: number): ComplexityResult {
  const lines = code.split('\n');
  const cyclomatic = calculateCyclomaticComplexity(code);
  const cognitive = calculateCognitiveComplexity(code);

  const recommendations: string[] = [];
  if (cyclomatic > 10) {
    recommendations.push(`[HIGH] Reduce cyclomatic complexity from ${cyclomatic} to <10`);
    recommendations.push('Recommendation: Extract Method - break into smaller functions');
  }
  if (cognitive > 15) {
    recommendations.push(`[HIGH] Reduce cognitive complexity from ${cognitive} to <15`);
    recommendations.push('Recommendation: Reduce Nesting - use early returns and guard clauses');
  }
  if (lines.length > 50) {
    recommendations.push(`[MEDIUM] Function too long (${lines.length} lines)`);
    recommendations.push('Recommendation: Split into multiple focused functions');
  }

  return {
    file: '',
    function: name,
    lineStart: startLine,
    lineEnd: startLine + lines.length,
    cyclomatic,
    cognitive,
    linesOfCode: lines.length,
    recommendations
  };
}

function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Decision points
  complexity += (code.match(/\bif\b/g) || []).length;
  complexity += (code.match(/\belse\s+if\b/g) || []).length;
  complexity += (code.match(/\bfor\b/g) || []).length;
  complexity += (code.match(/\bwhile\b/g) || []).length;
  complexity += (code.match(/\bcase\b/g) || []).length;
  complexity += (code.match(/\bcatch\b/g) || []).length;
  complexity += (code.match(/\&\&/g) || []).length;
  complexity += (code.match(/\|\|/g) || []).length;
  complexity += (code.match(/\?[^.]/g) || []).length; // Ternary, exclude optional chaining

  return complexity;
}

function calculateCognitiveComplexity(code: string): number {
  const lines = code.split('\n');
  let complexity = 0;
  let nestingLevel = 0;

  for (const line of lines) {
    // Increase nesting for blocks
    if (line.match(/\{[^}]*$/)) nestingLevel++;
    if (line.match(/^\s*\}/)) nestingLevel = Math.max(0, nestingLevel - 1);

    // Control flow structures add to complexity with nesting penalty
    const hasControl = line.match(/\b(if|for|while|switch|catch)\b/);
    if (hasControl) {
      complexity += 1 + nestingLevel;
    }

    // Logical operators add to complexity
    const logicalOps = (line.match(/(\&\&|\|\|)/g) || []).length;
    complexity += logicalOps;
  }

  return complexity;
}

function analyzeFunctionsInFile(filePath: string): FileAnalysis {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const functions: ComplexityResult[] = [];
  const functionPattern = /(async\s+)?(function\s+([a-zA-Z_][a-zA-Z0-9_]*)|([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:\s*[^{]*\{|([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(async\s*)?\([^)]*\)\s*=>\s*\{)/g;

  let totalCyclomatic = 0;
  let totalCognitive = 0;

  // Find function definitions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(functionPattern);

    if (match) {
      // Extract function name
      const funcName = line.match(/(?:function\s+|async\s+function\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/)?.[1] || 'anonymous';

      // Find function body (simplified - assumes closing brace at same indentation)
      let braceCount = 0;
      let funcEnd = i;
      for (let j = i; j < lines.length; j++) {
        braceCount += (lines[j].match(/\{/g) || []).length;
        braceCount -= (lines[j].match(/\}/g) || []).length;
        if (braceCount === 0 && j > i) {
          funcEnd = j;
          break;
        }
      }

      const funcCode = lines.slice(i, funcEnd + 1).join('\n');
      const result = analyzeFunction(funcName, funcCode, i + 1);
      result.file = path.basename(filePath);

      if (result.cyclomatic > 10 || result.cognitive > 15 || result.linesOfCode > 50) {
        functions.push(result);
      }

      totalCyclomatic += result.cyclomatic;
      totalCognitive += result.cognitive;
    }
  }

  const totalFunctions = Math.max(1, content.match(/(?:async\s+)?(?:function|=>|\([^)]*\)\s*:)/g)?.length || 1);

  return {
    file: path.basename(filePath),
    totalLines: lines.length,
    totalFunctions,
    avgCyclomatic: totalCyclomatic / totalFunctions,
    avgCognitive: totalCognitive / totalFunctions,
    hotspots: functions.sort((a, b) => (b.cyclomatic + b.cognitive) - (a.cyclomatic + a.cognitive))
  };
}

// Main analysis
const filesToAnalyze = [
  'src/core/FleetManager.ts',
  'src/agents/TestGeneratorAgent.ts',
  'src/agents/CoverageAnalyzerAgent.ts',
  'src/learning/LearningEngine.ts',
  'src/agents/BaseAgent.ts'
];

const results = {
  totalFiles: filesToAnalyze.length,
  hotspots: [] as ComplexityResult[],
  averageComplexity: 0,
  criticalFiles: [] as string[],
  recommendations: [] as string[],
  fileAnalyses: [] as FileAnalysis[]
};

console.log('='.repeat(80));
console.log('Code Complexity Analysis - Agentic QE Project');
console.log('='.repeat(80));
console.log();

for (const file of filesToAnalyze) {
  try {
    const analysis = analyzeFunctionsInFile(file);
    results.fileAnalyses.push(analysis);
    results.averageComplexity += analysis.avgCyclomatic;

    if (analysis.avgCyclomatic > 10 || analysis.hotspots.length > 0) {
      results.criticalFiles.push(file);
    }

    results.hotspots.push(...analysis.hotspots);

    console.log(`📁 ${analysis.file}`);
    console.log(`   Lines: ${analysis.totalLines}, Functions: ${analysis.totalFunctions}`);
    console.log(`   Avg Cyclomatic: ${analysis.avgCyclomatic.toFixed(1)}, Avg Cognitive: ${analysis.avgCognitive.toFixed(1)}`);
    if (analysis.hotspots.length > 0) {
      console.log(`   ⚠️  Hotspots: ${analysis.hotspots.length}`);
    }
    console.log();
  } catch (error: any) {
    console.error(`Error analyzing ${file}: ${error.message}`);
  }
}

results.averageComplexity /= results.totalFiles;
results.hotspots.sort((a, b) => (b.cyclomatic + b.cognitive) - (a.cyclomatic + a.cognitive));

// Generate recommendations
console.log('='.repeat(80));
console.log('Top Complexity Hotspots');
console.log('='.repeat(80));
console.log();

const top10 = results.hotspots.slice(0, 10);
for (let i = 0; i < top10.length; i++) {
  const hotspot = top10[i];
  console.log(`${i + 1}. ${hotspot.file}:${hotspot.function} (lines ${hotspot.lineStart}-${hotspot.lineEnd})`);
  console.log(`   Cyclomatic: ${hotspot.cyclomatic}, Cognitive: ${hotspot.cognitive}, LOC: ${hotspot.linesOfCode}`);
  if (hotspot.recommendations.length > 0) {
    hotspot.recommendations.forEach(rec => console.log(`   ${rec}`));
  }
  console.log();
}

// Overall recommendations
results.recommendations = [
  `Reduce complexity in ${results.criticalFiles.length} critical files`,
  'Apply Extract Method pattern to functions with complexity > 15',
  'Use Early Return pattern to reduce nesting depth',
  'Break down large classes (BaseAgent: 1296 LOC) into smaller services',
  'Implement Strategy pattern for complex conditional logic',
  'Consider Facade pattern for LearningEngine complexity',
  'Add complexity budget checks to CI/CD pipeline'
];

console.log('='.repeat(80));
console.log('Recommendations');
console.log('='.repeat(80));
console.log();
results.recommendations.forEach((rec, i) => console.log(`${i + 1}. ${rec}`));
console.log();

// Export JSON report
const report = {
  ...results,
  analysisDate: new Date().toISOString(),
  summary: {
    totalFiles: results.totalFiles,
    totalHotspots: results.hotspots.length,
    criticalFiles: results.criticalFiles.length,
    averageComplexity: Math.round(results.averageComplexity * 10) / 10
  }
};

fs.writeFileSync('complexity-report.json', JSON.stringify(report, null, 2));
console.log('📊 Full report saved to: complexity-report.json');
console.log();
