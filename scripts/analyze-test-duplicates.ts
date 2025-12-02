#!/usr/bin/env tsx

/**
 * Test Duplicate Analysis Script
 *
 * Analyzes test files to identify:
 * 1. Duplicate test cases across multiple files
 * 2. Overlapping test coverage
 * 3. Implementation detail tests vs user value tests
 * 4. Large monolithic test files
 *
 * Usage: npx tsx scripts/analyze-test-duplicates.ts
 * Output: docs/migration/duplicate-analysis.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface TestFile {
  path: string;
  lines: number;
  testCases: string[];
  describeSuites: string[];
  imports: string[];
  category: 'user-value' | 'implementation-detail' | 'contract' | 'unknown';
}

interface DuplicateGroup {
  pattern: string;
  files: string[];
  totalLines: number;
  overlapPercentage: number;
  recommendation: 'consolidate' | 'delete' | 'keep';
}

interface AnalysisResult {
  timestamp: string;
  totalFiles: number;
  totalLines: number;
  largeFiles: { path: string; lines: number }[];
  duplicates: DuplicateGroup[];
  categoryBreakdown: Record<string, { files: number; lines: number }>;
  recommendations: {
    filesToDelete: string[];
    filesToConsolidate: DuplicateGroup[];
    estimatedReduction: { files: number; lines: number };
  };
}

async function analyzeTestFile(filePath: string): Promise<TestFile> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').length;

  // Extract test cases (it(), test(), describe())
  const testCaseRegex = /(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const testCases: string[] = [];
  let match;
  while ((match = testCaseRegex.exec(content)) !== null) {
    testCases.push(match[1]);
  }

  // Extract describe suites
  const describeSuiteRegex = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const describeSuites: string[] = [];
  while ((match = describeSuiteRegex.exec(content)) !== null) {
    describeSuites.push(match[1]);
  }

  // Extract imports
  const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
  const imports: string[] = [];
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Categorize test
  const category = categorizeTest(content, filePath);

  return {
    path: filePath,
    lines,
    testCases,
    describeSuites,
    imports,
    category,
  };
}

function categorizeTest(content: string, filePath: string): TestFile['category'] {
  // Implementation detail indicators
  const implementationIndicators = [
    'null-safety',
    'type checking',
    'private method',
    'internal state',
    'constructor',
    '.skip',
    'should be defined',
    'should be a function',
  ];

  // User value indicators
  const userValueIndicators = [
    'user',
    'journey',
    'scenario',
    'workflow',
    'integration',
    'end-to-end',
    'e2e',
    'acceptance',
  ];

  // Contract indicators
  const contractIndicators = [
    'interface',
    'contract',
    'api',
    'public method',
    'exports',
  ];

  const contentLower = content.toLowerCase();
  const filePathLower = filePath.toLowerCase();

  let implementationScore = 0;
  let userValueScore = 0;
  let contractScore = 0;

  for (const indicator of implementationIndicators) {
    if (contentLower.includes(indicator) || filePathLower.includes(indicator)) {
      implementationScore++;
    }
  }

  for (const indicator of userValueIndicators) {
    if (contentLower.includes(indicator) || filePathLower.includes(indicator)) {
      userValueScore++;
    }
  }

  for (const indicator of contractIndicators) {
    if (contentLower.includes(indicator) || filePathLower.includes(indicator)) {
      contractScore++;
    }
  }

  if (implementationScore > userValueScore && implementationScore > contractScore) {
    return 'implementation-detail';
  } else if (userValueScore > implementationScore && userValueScore > contractScore) {
    return 'user-value';
  } else if (contractScore > 0) {
    return 'contract';
  }

  return 'unknown';
}

function findDuplicatePatterns(files: TestFile[]): DuplicateGroup[] {
  const patterns = new Map<string, TestFile[]>();

  // Group files by base name pattern
  for (const file of files) {
    const baseName = path.basename(file.path, '.test.ts');
    const pattern = baseName
      .replace(/\.(comprehensive|enhanced|null-safety|skip|ml|database|edge-cases|race-condition|lifecycle)$/, '')
      .replace(/Agent$/, '');

    if (!patterns.has(pattern)) {
      patterns.set(pattern, []);
    }
    patterns.get(pattern)!.push(file);
  }

  // Analyze groups with multiple files
  const duplicates: DuplicateGroup[] = [];

  for (const [pattern, groupFiles] of patterns) {
    if (groupFiles.length < 2) continue;

    const totalLines = groupFiles.reduce((sum, f) => sum + f.lines, 0);

    // Calculate overlap by comparing test case names
    const allTestCases = new Set<string>();
    const testCaseCounts = new Map<string, number>();

    for (const file of groupFiles) {
      for (const testCase of file.testCases) {
        allTestCases.add(testCase);
        testCaseCounts.set(testCase, (testCaseCounts.get(testCase) || 0) + 1);
      }
    }

    let duplicateTestCases = 0;
    for (const count of testCaseCounts.values()) {
      if (count > 1) duplicateTestCases++;
    }

    const overlapPercentage = allTestCases.size > 0
      ? (duplicateTestCases / allTestCases.size) * 100
      : 0;

    // Determine recommendation
    let recommendation: DuplicateGroup['recommendation'] = 'keep';
    if (overlapPercentage > 60) {
      recommendation = 'consolidate';
    } else if (groupFiles.some(f => f.category === 'implementation-detail')) {
      recommendation = 'delete';
    }

    duplicates.push({
      pattern,
      files: groupFiles.map(f => f.path),
      totalLines,
      overlapPercentage: Math.round(overlapPercentage),
      recommendation,
    });
  }

  return duplicates.sort((a, b) => b.totalLines - a.totalLines);
}

async function analyzeTestSuite(): Promise<AnalysisResult> {
  const testFiles = await glob('tests/**/*.test.ts', {
    cwd: process.cwd(),
    absolute: true,
  });

  console.log(`Found ${testFiles.length} test files. Analyzing...`);

  const analyzedFiles = await Promise.all(
    testFiles.map(file => analyzeTestFile(file))
  );

  const totalLines = analyzedFiles.reduce((sum, f) => sum + f.lines, 0);

  // Find large files (> 1000 lines)
  const largeFiles = analyzedFiles
    .filter(f => f.lines > 1000)
    .map(f => ({ path: f.path, lines: f.lines }))
    .sort((a, b) => b.lines - a.lines);

  // Find duplicates
  const duplicates = findDuplicatePatterns(analyzedFiles);

  // Category breakdown
  const categoryBreakdown: Record<string, { files: number; lines: number }> = {
    'user-value': { files: 0, lines: 0 },
    'implementation-detail': { files: 0, lines: 0 },
    'contract': { files: 0, lines: 0 },
    'unknown': { files: 0, lines: 0 },
  };

  for (const file of analyzedFiles) {
    categoryBreakdown[file.category].files++;
    categoryBreakdown[file.category].lines += file.lines;
  }

  // Generate recommendations
  const filesToDelete = analyzedFiles
    .filter(f =>
      f.category === 'implementation-detail' ||
      f.path.includes('.skip.') ||
      f.path.includes('null-safety')
    )
    .map(f => f.path);

  const filesToConsolidate = duplicates.filter(d => d.recommendation === 'consolidate');

  const estimatedDeletionLines = filesToDelete.reduce((sum, path) => {
    const file = analyzedFiles.find(f => f.path === path);
    return sum + (file?.lines || 0);
  }, 0);

  const estimatedConsolidationLines = filesToConsolidate.reduce((sum, group) => {
    // Assume we can reduce by 70% through consolidation
    return sum + (group.totalLines * 0.7);
  }, 0);

  const estimatedReduction = {
    files: filesToDelete.length + filesToConsolidate.reduce((sum, g) => sum + g.files.length - 1, 0),
    lines: Math.round(estimatedDeletionLines + estimatedConsolidationLines),
  };

  return {
    timestamp: new Date().toISOString(),
    totalFiles: testFiles.length,
    totalLines,
    largeFiles,
    duplicates,
    categoryBreakdown,
    recommendations: {
      filesToDelete,
      filesToConsolidate,
      estimatedReduction,
    },
  };
}

async function main() {
  console.log('🔍 Analyzing test suite for duplicates...\n');

  const result = await analyzeTestSuite();

  console.log('📊 Analysis Results:\n');
  console.log(`Total test files: ${result.totalFiles}`);
  console.log(`Total lines of test code: ${result.totalLines.toLocaleString()}`);
  console.log(`Large files (>1000 lines): ${result.largeFiles.length}`);
  console.log(`Duplicate groups found: ${result.duplicates.length}\n`);

  console.log('📂 Category Breakdown:');
  for (const [category, stats] of Object.entries(result.categoryBreakdown)) {
    const percentage = ((stats.lines / result.totalLines) * 100).toFixed(1);
    console.log(`  ${category}: ${stats.files} files, ${stats.lines.toLocaleString()} lines (${percentage}%)`);
  }

  console.log('\n💡 Recommendations:');
  console.log(`  Files to delete: ${result.recommendations.filesToDelete.length}`);
  console.log(`  Groups to consolidate: ${result.recommendations.filesToConsolidate.length}`);
  console.log(`  Estimated reduction: ${result.recommendations.estimatedReduction.files} files, ${result.recommendations.estimatedReduction.lines.toLocaleString()} lines\n`);

  // Write to JSON file
  const outputPath = path.join(process.cwd(), 'docs/migration/duplicate-analysis.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`✅ Analysis complete! Results saved to: ${outputPath}`);

  // Print top duplicate groups
  console.log('\n🔝 Top Duplicate Groups:\n');
  for (const group of result.duplicates.slice(0, 10)) {
    console.log(`  ${group.pattern}:`);
    console.log(`    Files: ${group.files.length}`);
    console.log(`    Total lines: ${group.totalLines.toLocaleString()}`);
    console.log(`    Overlap: ${group.overlapPercentage}%`);
    console.log(`    Recommendation: ${group.recommendation}`);
    console.log();
  }
}

main().catch(console.error);
