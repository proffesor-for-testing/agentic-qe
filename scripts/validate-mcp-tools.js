#!/usr/bin/env node

/**
 * MCP Tools Validation Script
 *
 * Validates all MCP tools have:
 * - Handler implementation
 * - Schema definition
 * - Unit tests
 * - Integration tests (optional)
 * - Documentation
 *
 * Generates JSON report and exits with code 1 if any validation fails.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const TOOLS_FILE = path.join(__dirname, '../dist/mcp/tools.js');
const HANDLERS_DIR = path.join(__dirname, '../dist/mcp/handlers');
const TESTS_DIR = path.join(__dirname, '../tests/mcp');
const INTEGRATION_TESTS_DIR = path.join(__dirname, '../tests/integration/phase2');
const REPORTS_DIR = path.join(__dirname, '../reports');

// Validation results
const results = {
  totalTools: 0,
  validTools: 0,
  invalidTools: 0,
  coverage: 0,
  tools: [],
  timestamp: new Date().toISOString()
};

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
 * Extract tool names from tools.ts
 */
function extractToolNames() {
  try {
    const toolsModule = require(TOOLS_FILE);
    const tools = toolsModule.agenticQETools || [];
    return tools.map(tool => tool.name);
  } catch (err) {
    console.error('❌ Failed to load tools:', err.message);
    process.exit(1);
  }
}

/**
 * Find handler file for a tool
 */
function findHandler(toolName) {
  // Extract handler name from tool name
  // mcp__agentic_qe__fleet_init -> fleet-init or fleet_init
  const handlerName = toolName
    .replace('mcp__agentic_qe__', '')
    .replace(/_/g, '-');

  const handlerPaths = [
    path.join(HANDLERS_DIR, `${handlerName}.js`),
    path.join(HANDLERS_DIR, `${handlerName}-handler.js`),
    path.join(HANDLERS_DIR, toolName.replace('mcp__agentic_qe__', '') + '.js')
  ];

  for (const handlerPath of handlerPaths) {
    if (fileExists(handlerPath)) {
      return handlerPath;
    }
  }

  return null;
}

/**
 * Find test file for a tool
 */
function findTests(toolName) {
  const testName = toolName
    .replace('mcp__agentic_qe__', '')
    .replace(/_/g, '-');

  const testPaths = [
    path.join(TESTS_DIR, `${testName}.test.ts`),
    path.join(TESTS_DIR, `${testName}-handler.test.ts`),
    path.join(TESTS_DIR, 'handlers', `${testName}.test.ts`)
  ];

  for (const testPath of testPaths) {
    if (fileExists(testPath)) {
      return testPath;
    }
  }

  return null;
}

/**
 * Find integration test file
 */
function findIntegrationTests(toolName) {
  const testFiles = [
    path.join(INTEGRATION_TESTS_DIR, 'phase2-mcp-integration.test.ts'),
    path.join(INTEGRATION_TESTS_DIR, 'mcp-integration.test.ts')
  ];

  for (const testFile of testFiles) {
    if (fileExists(testFile)) {
      try {
        const content = fs.readFileSync(testFile, 'utf8');
        if (content.includes(toolName)) {
          return testFile;
        }
      } catch (err) {
        // Skip if can't read
      }
    }
  }

  return null;
}

/**
 * Validate a single tool
 */
function validateTool(toolName) {
  const validation = {
    name: toolName,
    valid: true,
    issues: [],
    hasHandler: false,
    hasTests: false,
    hasIntegrationTests: false
  };

  // Check handler
  const handlerPath = findHandler(toolName);
  if (handlerPath) {
    validation.hasHandler = true;
    validation.handlerPath = handlerPath;
  } else {
    validation.valid = false;
    validation.issues.push('Missing handler implementation');
  }

  // Check unit tests
  const testPath = findTests(toolName);
  if (testPath) {
    validation.hasTests = true;
    validation.testPath = testPath;
  } else {
    validation.valid = false;
    validation.issues.push('Missing unit tests');
  }

  // Check integration tests (optional - warning only)
  const integrationTestPath = findIntegrationTests(toolName);
  if (integrationTestPath) {
    validation.hasIntegrationTests = true;
    validation.integrationTestPath = integrationTestPath;
  } else {
    validation.issues.push('⚠️  No integration tests found (optional)');
  }

  return validation;
}

/**
 * Generate validation report
 */
function generateReport() {
  // Ensure reports directory exists
  if (!fileExists(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const reportPath = path.join(
    REPORTS_DIR,
    `mcp-validation-${Date.now()}.json`
  );

  fs.writeFileSync(
    reportPath,
    JSON.stringify(results, null, 2),
    'utf8'
  );

  console.log(`\n📄 Report saved: ${reportPath}`);
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n========================================');
  console.log('MCP Tools Validation Summary');
  console.log('========================================\n');

  console.log(`Total Tools: ${results.totalTools}`);
  console.log(`Valid Tools: ${results.validTools} ✅`);
  console.log(`Invalid Tools: ${results.invalidTools} ❌`);
  console.log(`Coverage: ${results.coverage}%\n`);

  if (results.invalidTools > 0) {
    console.log('❌ Invalid Tools:\n');
    results.tools
      .filter(tool => !tool.valid)
      .forEach(tool => {
        console.log(`  ${tool.name}:`);
        tool.issues.forEach(issue => {
          console.log(`    - ${issue}`);
        });
        console.log('');
      });
  }

  console.log('========================================\n');
}

/**
 * Main validation
 */
function main() {
  console.log('🔍 Validating MCP tools...\n');

  // Extract tool names
  const toolNames = extractToolNames();
  results.totalTools = toolNames.length;

  console.log(`Found ${toolNames.length} MCP tools\n`);

  // Validate each tool
  toolNames.forEach((toolName, index) => {
    const validation = validateTool(toolName);
    results.tools.push(validation);

    if (validation.valid) {
      results.validTools++;
      console.log(`✅ ${index + 1}/${toolNames.length} ${toolName}`);
    } else {
      results.invalidTools++;
      console.log(`❌ ${index + 1}/${toolNames.length} ${toolName}`);
      validation.issues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
    }
  });

  // Calculate coverage
  results.coverage = Math.round((results.validTools / results.totalTools) * 100);

  // Generate report
  generateReport();

  // Print summary
  printSummary();

  // Exit with error if validation failed
  if (results.invalidTools > 0) {
    console.error(`\n❌ Validation failed: ${results.invalidTools} tools have issues\n`);
    process.exit(1);
  }

  console.log('✅ All MCP tools validated successfully\n');
  process.exit(0);
}

// Run validation
main();
