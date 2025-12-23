#!/usr/bin/env node
/**
 * Test Dashboard Generator
 * Generates a summary of test suite metrics and progress
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function countFiles(pattern) {
  try {
    const result = execSync(`find tests -name "${pattern}" 2>/dev/null | wc -l`, { encoding: 'utf8' });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

function countLines(dir) {
  try {
    const result = execSync(`find ${dir} -name "*.test.ts" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}'`, { encoding: 'utf8' });
    return parseInt(result.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function countLargeFiles(threshold) {
  try {
    const result = execSync(`find tests -name "*.test.ts" -exec wc -l {} \\; 2>/dev/null | awk '$1 > ${threshold}' | wc -l`, { encoding: 'utf8' });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

function countSkippedTests() {
  try {
    const result = execSync('grep -r "describe.skip\\|it.skip\\|test.skip" tests --include="*.test.ts" 2>/dev/null | wc -l', { encoding: 'utf8' });
    return parseInt(result.trim(), 10);
  } catch {
    return 0;
  }
}

function getDirectoryStats(dir) {
  try {
    const files = execSync(`find ${dir} -name "*.test.ts" 2>/dev/null | wc -l`, { encoding: 'utf8' });
    const lines = execSync(`find ${dir} -name "*.test.ts" -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}'`, { encoding: 'utf8' });
    return {
      files: parseInt(files.trim(), 10) || 0,
      lines: parseInt(lines.trim(), 10) || 0
    };
  } catch {
    return { files: 0, lines: 0 };
  }
}

function progressBar(current, target, width = 20) {
  const ratio = Math.min(current / target, 1);
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${(ratio * 100).toFixed(1)}%`;
}

function generateDashboard() {
  log('\n' + '═'.repeat(60), 'cyan');
  log('  📊 AGENTIC QE - TEST SUITE DASHBOARD', 'bold');
  log('═'.repeat(60) + '\n', 'cyan');

  // Current metrics
  const totalFiles = countFiles('*.test.ts');
  const totalLines = countLines('tests');
  const largeFiles = countLargeFiles(600);
  const skippedTests = countSkippedTests();

  // Target metrics
  const targetFiles = 50;
  const targetLines = 40000;
  const targetLargeFiles = 0;
  const targetSkipped = 0;

  // Baseline metrics (from issue #103)
  const baselineFiles = 426;
  const baselineLines = 208253;

  // Progress calculations
  const filesReduced = baselineFiles - totalFiles;
  const linesReduced = baselineLines - totalLines;
  const filesProgress = ((baselineFiles - totalFiles) / (baselineFiles - targetFiles)) * 100;
  const linesProgress = ((baselineLines - totalLines) / (baselineLines - targetLines)) * 100;

  // Current state
  log('📈 CURRENT STATE', 'bold');
  log('─'.repeat(40));
  log(`  Test Files:      ${totalFiles} files`);
  log(`  Lines of Code:   ${totalLines.toLocaleString()} lines`);
  log(`  Large Files:     ${largeFiles} files (>600 lines)`);
  log(`  Skipped Tests:   ${skippedTests}`);

  // Progress from baseline
  log('\n📉 PROGRESS FROM BASELINE', 'bold');
  log('─'.repeat(40));
  log(`  Files Reduced:   ${filesReduced} (-${((filesReduced/baselineFiles)*100).toFixed(1)}%)`, filesReduced > 0 ? 'green' : 'yellow');
  log(`  Lines Reduced:   ${linesReduced.toLocaleString()} (-${((linesReduced/baselineLines)*100).toFixed(1)}%)`, linesReduced > 0 ? 'green' : 'yellow');

  // Progress to target
  log('\n🎯 PROGRESS TO TARGET', 'bold');
  log('─'.repeat(40));
  log(`  Files:  ${progressBar(filesReduced, baselineFiles - targetFiles)} (${totalFiles} → ${targetFiles})`);
  log(`  Lines:  ${progressBar(linesReduced, baselineLines - targetLines)} (${totalLines.toLocaleString()} → ${targetLines.toLocaleString()})`);
  log(`  Large:  ${progressBar(149 - largeFiles, 149)} (${largeFiles} → ${targetLargeFiles})`);

  // Directory breakdown
  log('\n📁 DIRECTORY BREAKDOWN', 'bold');
  log('─'.repeat(40));

  const directories = [
    { name: 'journeys', path: 'tests/journeys', icon: '🎯' },
    { name: 'contracts', path: 'tests/contracts', icon: '📝' },
    { name: 'infrastructure', path: 'tests/infrastructure', icon: '🔧' },
    { name: 'regression', path: 'tests/regression', icon: '🐛' },
    { name: 'unit', path: 'tests/unit', icon: '🧪' },
    { name: 'integration', path: 'tests/integration', icon: '🔗' },
    { name: 'e2e', path: 'tests/e2e', icon: '🌐' },
    { name: 'mcp', path: 'tests/mcp', icon: '🔌' },
    { name: 'cli', path: 'tests/cli', icon: '💻' }
  ];

  for (const dir of directories) {
    const stats = getDirectoryStats(dir.path);
    if (stats.files > 0) {
      log(`  ${dir.icon} ${dir.name.padEnd(15)} ${String(stats.files).padStart(4)} files | ${stats.lines.toLocaleString().padStart(8)} lines`);
    }
  }

  // Health indicators
  log('\n🏥 HEALTH INDICATORS', 'bold');
  log('─'.repeat(40));

  const healthChecks = [
    { name: 'Files under target', pass: totalFiles <= targetFiles * 2, value: `${totalFiles}/${targetFiles * 2}` },
    { name: 'Lines under target', pass: totalLines <= targetLines * 2, value: `${totalLines.toLocaleString()}/${(targetLines * 2).toLocaleString()}` },
    { name: 'No large files', pass: largeFiles === 0, value: `${largeFiles} files >600 lines` },
    { name: 'No skipped tests', pass: skippedTests === 0, value: `${skippedTests} skipped` },
    { name: 'Journey tests exist', pass: getDirectoryStats('tests/journeys').files >= 7, value: `${getDirectoryStats('tests/journeys').files}/7 journeys` }
  ];

  for (const check of healthChecks) {
    const icon = check.pass ? '✅' : '⚠️';
    const color = check.pass ? 'green' : 'yellow';
    log(`  ${icon} ${check.name.padEnd(25)} ${check.value}`, color);
  }

  // Recommendations
  log('\n💡 RECOMMENDATIONS', 'bold');
  log('─'.repeat(40));

  if (largeFiles > 0) {
    log(`  • Split ${largeFiles} large files (>600 lines)`, 'yellow');
  }
  if (skippedTests > 0) {
    log(`  • Fix or remove ${skippedTests} skipped tests`, 'yellow');
  }
  if (totalFiles > targetFiles * 1.5) {
    log(`  • Continue consolidating tests (${totalFiles} → ${targetFiles})`, 'yellow');
  }
  if (totalLines > targetLines * 1.5) {
    log(`  • Reduce test code (${totalLines.toLocaleString()} → ${targetLines.toLocaleString()})`, 'yellow');
  }

  const journeyStats = getDirectoryStats('tests/journeys');
  if (journeyStats.files < 7) {
    log(`  • Complete journey tests (${journeyStats.files}/7)`, 'yellow');
  }

  if (largeFiles === 0 && skippedTests === 0 && totalFiles <= targetFiles) {
    log('  ✨ All health checks passing!', 'green');
  }

  log('\n' + '═'.repeat(60), 'cyan');
  log(`  Generated: ${new Date().toISOString()}`, 'blue');
  log('═'.repeat(60) + '\n', 'cyan');

  // Return metrics for programmatic use
  return {
    current: { files: totalFiles, lines: totalLines, largeFiles, skippedTests },
    target: { files: targetFiles, lines: targetLines, largeFiles: targetLargeFiles, skipped: targetSkipped },
    baseline: { files: baselineFiles, lines: baselineLines },
    progress: { filesReduced, linesReduced, filesProgress, linesProgress }
  };
}

// Run dashboard
const metrics = generateDashboard();

// Export metrics as JSON if requested
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(metrics, null, 2));
}

// Exit with error if health checks fail
if (process.argv.includes('--strict')) {
  const { current, target } = metrics;
  if (current.largeFiles > 0 || current.skippedTests > target.skipped) {
    process.exit(1);
  }
}
