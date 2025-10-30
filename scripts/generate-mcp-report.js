#!/usr/bin/env node

/**
 * MCP Report Generator
 *
 * Aggregates test results, calculates coverage metrics,
 * and generates a comprehensive markdown report.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const REPORTS_DIR = path.join(__dirname, '../reports');
const COVERAGE_DIR = path.join(__dirname, '../coverage');
const TOOLS_FILE = path.join(__dirname, '../dist/mcp/tools.js');

/**
 * Check if file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    return false;
  }
}

/**
 * Load latest validation report
 */
function loadValidationReport() {
  if (!fileExists(REPORTS_DIR)) {
    return null;
  }

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith('mcp-validation-'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  const reportPath = path.join(REPORTS_DIR, files[0]);
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

/**
 * Load coverage summary
 */
function loadCoverageSummary() {
  const coverageFile = path.join(COVERAGE_DIR, 'coverage-summary.json');

  if (!fileExists(coverageFile)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
}

/**
 * Extract tool categories
 */
function categorizeTools() {
  try {
    const toolsModule = require(TOOLS_FILE);
    const tools = toolsModule.agenticQETools || [];

    const categories = {
      'Core Fleet Management': [],
      'Test Generation & Execution': [],
      'Quality & Coverage Analysis': [],
      'Memory & Coordination': [],
      'Advanced Testing': [],
      'Streaming & Real-time': [],
      'Other': []
    };

    tools.forEach(tool => {
      const name = tool.name;

      if (name.includes('fleet') || name.includes('agent_spawn')) {
        categories['Core Fleet Management'].push(tool);
      } else if (name.includes('test_generate') || name.includes('test_execute')) {
        categories['Test Generation & Execution'].push(tool);
      } else if (name.includes('quality') || name.includes('coverage')) {
        categories['Quality & Coverage Analysis'].push(tool);
      } else if (name.includes('memory') || name.includes('blackboard') || name.includes('consensus')) {
        categories['Memory & Coordination'].push(tool);
      } else if (name.includes('mutation') || name.includes('flaky') || name.includes('security')) {
        categories['Advanced Testing'].push(tool);
      } else if (name.includes('stream')) {
        categories['Streaming & Real-time'].push(tool);
      } else {
        categories['Other'].push(tool);
      }
    });

    return categories;
  } catch (err) {
    console.error('Failed to categorize tools:', err.message);
    return {};
  }
}

/**
 * Generate markdown report
 */
function generateReport(validation, coverage, categories) {
  const timestamp = new Date().toISOString();

  let report = `# MCP Tools Test Report\n\n`;
  report += `**Generated**: ${timestamp}\n\n`;

  // Executive Summary
  report += `## Executive Summary\n\n`;

  if (validation) {
    report += `- **Total MCP Tools**: ${validation.totalTools}\n`;
    report += `- **Valid Tools**: ${validation.validTools} ✅\n`;
    report += `- **Invalid Tools**: ${validation.invalidTools} ${validation.invalidTools > 0 ? '❌' : '✅'}\n`;
    report += `- **Validation Coverage**: ${validation.coverage}%\n\n`;
  }

  if (coverage) {
    const total = coverage.total || {};
    report += `### Code Coverage\n\n`;
    report += `- **Lines**: ${total.lines?.pct || 0}%\n`;
    report += `- **Statements**: ${total.statements?.pct || 0}%\n`;
    report += `- **Functions**: ${total.functions?.pct || 0}%\n`;
    report += `- **Branches**: ${total.branches?.pct || 0}%\n\n`;
  }

  // Tool Categories
  report += `## MCP Tools by Category\n\n`;

  Object.entries(categories).forEach(([category, tools]) => {
    if (tools.length > 0) {
      report += `### ${category} (${tools.length} tools)\n\n`;
      tools.forEach(tool => {
        const validation_status = validation?.tools.find(t => t.name === tool.name);
        const status = validation_status?.valid ? '✅' : '❌';
        report += `- ${status} \`${tool.name}\`\n`;
        if (validation_status && !validation_status.valid) {
          validation_status.issues.forEach(issue => {
            report += `  - ${issue}\n`;
          });
        }
      });
      report += `\n`;
    }
  });

  // Validation Details
  if (validation && validation.invalidTools > 0) {
    report += `## Validation Issues\n\n`;
    validation.tools
      .filter(tool => !tool.valid)
      .forEach(tool => {
        report += `### ${tool.name}\n\n`;
        tool.issues.forEach(issue => {
          report += `- ${issue}\n`;
        });
        report += `\n`;
      });
  }

  // Test Coverage Details
  if (coverage) {
    report += `## Test Coverage Details\n\n`;
    report += `\`\`\`\n`;
    report += `Lines      : ${coverage.total?.lines?.pct || 0}% (${coverage.total?.lines?.covered || 0}/${coverage.total?.lines?.total || 0})\n`;
    report += `Statements : ${coverage.total?.statements?.pct || 0}% (${coverage.total?.statements?.covered || 0}/${coverage.total?.statements?.total || 0})\n`;
    report += `Functions  : ${coverage.total?.functions?.pct || 0}% (${coverage.total?.functions?.covered || 0}/${coverage.total?.functions?.total || 0})\n`;
    report += `Branches   : ${coverage.total?.branches?.pct || 0}% (${coverage.total?.branches?.covered || 0}/${coverage.total?.branches?.total || 0})\n`;
    report += `\`\`\`\n\n`;
  }

  // Recommendations
  report += `## Recommendations\n\n`;

  if (validation && validation.invalidTools > 0) {
    report += `### High Priority\n\n`;
    validation.tools
      .filter(tool => !tool.valid && !tool.hasHandler)
      .forEach(tool => {
        report += `- 🔴 **${tool.name}**: Missing handler implementation\n`;
      });

    report += `\n### Medium Priority\n\n`;
    validation.tools
      .filter(tool => !tool.valid && !tool.hasTests)
      .forEach(tool => {
        report += `- 🟡 **${tool.name}**: Missing unit tests\n`;
      });
    report += `\n`;
  }

  if (validation && validation.tools.some(t => !t.hasIntegrationTests)) {
    report += `### Low Priority\n\n`;
    report += `- 🟢 Add integration tests for tools without coverage\n\n`;
  }

  // Footer
  report += `---\n\n`;
  report += `*Report generated by Agentic QE MCP Tools Testing Pipeline*\n`;

  return report;
}

/**
 * Main execution
 */
function main() {
  console.log('📊 Generating MCP report...\n');

  // Ensure reports directory exists
  if (!fileExists(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // Load data
  const validation = loadValidationReport();
  const coverage = loadCoverageSummary();
  const categories = categorizeTools();

  if (!validation) {
    console.error('❌ No validation report found. Run validation first.');
    process.exit(1);
  }

  // Generate report
  const report = generateReport(validation, coverage, categories);

  // Save report
  const reportPath = path.join(
    REPORTS_DIR,
    `mcp-report-${Date.now()}.md`
  );

  fs.writeFileSync(reportPath, report, 'utf8');

  console.log(`✅ Report generated: ${reportPath}\n`);

  // Print summary
  console.log(report);
}

// Run generator
main();
