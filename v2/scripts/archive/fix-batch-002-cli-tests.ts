/**
 * BATCH-002 Fix Script: CLI & Command Tests
 * Fixes common issues in CLI tests systematically
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestFix {
  file: string;
  issues: string[];
  fixes: string[];
}

const fixes: TestFix[] = [];

/**
 * Fix 1: Mock Logger to prevent undefined errors
 */
function ensureLoggerMock(content: string): string {
  if (!content.includes("jest.mock('../../src/utils/Logger')")) {
    const importIndex = content.indexOf("import");
    const insertPoint = content.indexOf('\n', importIndex);

    const mockCode = `
// Mock Logger to prevent undefined errors in Database
jest.mock('../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }))
  }
}));
`;

    return content.slice(0, insertPoint + 1) + mockCode + content.slice(insertPoint + 1);
  }
  return content;
}

/**
 * Fix 2: Mock process.exit to prevent test interruption
 */
function mockProcessExit(content: string): string {
  if (!content.includes('process.exit') && !content.includes('jest.spyOn(process, \'exit\')')) {
    const beforeEachIndex = content.indexOf('beforeEach');
    if (beforeEachIndex > -1) {
      const insertPoint = content.indexOf('{', beforeEachIndex) + 1;
      const mockCode = `
    // Mock process.exit to prevent test interruption
    jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(\`Process.exit called with code \${code}\`);
    });
`;
      return content.slice(0, insertPoint) + mockCode + content.slice(insertPoint);
    }
  }
  return content;
}

/**
 * Fix 3: Mock console methods for output assertions
 */
function mockConsole(content: string): string {
  if (!content.includes('console.log') || content.includes('jest.spyOn(console')) {
    return content;
  }

  const beforeEachIndex = content.indexOf('beforeEach');
  if (beforeEachIndex > -1) {
    const insertPoint = content.indexOf('{', beforeEachIndex) + 1;
    const mockCode = `
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
`;
    return content.slice(0, insertPoint) + mockCode + content.slice(insertPoint);
  }
  return content;
}

/**
 * Fix 4: Ensure proper async/await in tests
 */
function ensureAsyncAwait(content: string): string {
  // Fix missing awaits on async operations
  const patterns = [
    { pattern: /it\('.*', \(\) => \{[\s\S]*?await /g, needsAsync: true },
    { pattern: /describe\('.*', \(\) => \{[\s\S]*?await /g, needsAsync: false }
  ];

  let fixed = content;

  // Make test functions async if they use await
  fixed = fixed.replace(
    /it\('([^']*)', \(\) => \{([\s\S]*?)await /g,
    "it('$1', async () => {$2await "
  );

  return fixed;
}

/**
 * Process a single test file
 */
function processTestFile(filePath: string): TestFix {
  const relativePath = path.relative(process.cwd(), filePath);
  console.log(`Processing: ${relativePath}`);

  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const issues: string[] = [];
  const appliedFixes: string[] = [];

  // Apply fixes
  const newContent1 = ensureLoggerMock(content);
  if (newContent1 !== content) {
    appliedFixes.push('Added Logger mock');
    issues.push('Missing Logger mock');
    content = newContent1;
  }

  const newContent2 = mockProcessExit(content);
  if (newContent2 !== content) {
    appliedFixes.push('Added process.exit mock');
    issues.push('Missing process.exit mock');
    content = newContent2;
  }

  const newContent3 = mockConsole(content);
  if (newContent3 !== content) {
    appliedFixes.push('Added console mocks');
    issues.push('Missing console mocks');
    content = newContent3;
  }

  const newContent4 = ensureAsyncAwait(content);
  if (newContent4 !== content) {
    appliedFixes.push('Fixed async/await');
    issues.push('Missing async/await');
    content = newContent4;
  }

  // Write back if changed
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`  ✓ Fixed ${appliedFixes.length} issues`);
  } else {
    console.log(`  ✓ No issues found`);
  }

  return {
    file: relativePath,
    issues,
    fixes: appliedFixes
  };
}

/**
 * Main execution
 */
function main() {
  console.log('BATCH-002: Fixing CLI & Command Tests\n');

  const cliTestDirs = [
    path.join(process.cwd(), 'tests/cli'),
    path.join(process.cwd(), 'tests/unit/cli')
  ];

  let totalFiles = 0;
  let totalFixed = 0;

  for (const dir of cliTestDirs) {
    if (!fs.existsSync(dir)) {
      console.log(`Directory not found: ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.test.ts'))
      .map(f => path.join(dir, f));

    console.log(`\nProcessing ${files.length} files in ${path.relative(process.cwd(), dir)}:`);

    for (const file of files) {
      totalFiles++;
      const fix = processTestFile(file);
      if (fix.fixes.length > 0) {
        totalFixed++;
        fixes.push(fix);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('BATCH-002 Fix Summary');
  console.log('='.repeat(60));
  console.log(`Total files processed: ${totalFiles}`);
  console.log(`Files fixed: ${totalFixed}`);
  console.log(`Files unchanged: ${totalFiles - totalFixed}`);

  if (fixes.length > 0) {
    console.log('\nFixed files:');
    for (const fix of fixes) {
      console.log(`\n${fix.file}:`);
      fix.fixes.forEach(f => console.log(`  • ${f}`));
    }
  }

  // Write summary to file
  const summaryPath = path.join(process.cwd(), 'batch-002-fixes.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ totalFiles, totalFixed, fixes }, null, 2));
  console.log(`\nSummary written to: ${summaryPath}`);
}

main();
