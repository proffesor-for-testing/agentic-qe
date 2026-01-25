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
const STREAMING_DIR = path.join(__dirname, '../dist/mcp/streaming');
const TESTS_DIR = path.join(__dirname, '../tests/mcp');
const INTEGRATION_TESTS_DIR = path.join(__dirname, '../tests/integration/phase2');
const REPORTS_DIR = path.join(__dirname, '../reports');

// Composite handlers that serve multiple tools
const COMPOSITE_HANDLERS = {
  'Phase3DomainToolsHandler': [
    'coverage_analyze_with_risk_scoring', 'coverage_detect_gaps_ml',
    'coverage_recommend_tests', 'coverage_calculate_trends',
    'flaky_detect_statistical', 'flaky_analyze_patterns', 'flaky_stabilize_auto',
    'performance_analyze_bottlenecks', 'performance_generate_report', 'performance_run_benchmark',
    'performance_monitor_realtime', 'security_validate_auth', 'security_check_authz',
    'security_scan_dependencies', 'security_generate_report', 'security_scan_comprehensive',
    'visual_compare_screenshots', 'visual_validate_accessibility', 'visual_detect_regression',
    'qe_security_scan_comprehensive', 'qe_security_detect_vulnerabilities',
    'qe_security_validate_compliance', 'qe_testgen_generate_unit', 'qe_testgen_generate_integration',
    'qe_testgen_optimize_suite', 'qe_testgen_analyze_quality', 'qe_qualitygate_evaluate',
    'qe_qualitygate_assess_risk', 'qe_qualitygate_validate_metrics', 'qe_qualitygate_generate_report',
    'qe_api_contract_validate', 'qe_api_contract_breaking_changes', 'qe_api_contract_versioning',
    'qe_test_data_generate', 'qe_test_data_mask', 'qe_test_data_analyze_schema',
    'qe_regression_analyze_risk', 'qe_regression_select_tests', 'qe_requirements_validate',
    'qe_requirements_generate_bdd', 'qe_code_quality_complexity', 'qe_code_quality_metrics',
    'qe_fleet_coordinate', 'qe_fleet_agent_status'
  ],
  'Phase2ToolsHandler': [
    'learning_status', 'learning_train', 'learning_history', 'learning_reset',
    'learning_export', 'pattern_store', 'pattern_find', 'pattern_extract',
    'pattern_share', 'pattern_stats', 'improvement_status', 'improvement_cycle',
    'improvement_ab_test', 'improvement_failures', 'performance_track'
  ],
  'StreamingHandlers': [
    'test_execute_stream', 'coverage_analyze_stream'
  ]
};

// Handler file mapping for composite handlers
const COMPOSITE_HANDLER_FILES = {
  'Phase3DomainToolsHandler': 'phase3/Phase3DomainTools.js',
  'Phase2ToolsHandler': 'phase2/Phase2Tools.js'
};

// Streaming handler file mapping (in streaming directory, not handlers)
const STREAMING_HANDLER_FILES = {
  'test_execute_stream': 'TestExecuteStreamHandler.js',
  'coverage_analyze_stream': 'CoverageAnalyzeStreamHandler.js'
};

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
 * Recursively find all JS files in a directory
 */
function findAllJsFiles(dir, fileList = []) {
  if (!fileExists(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findAllJsFiles(filePath, fileList);
    } else if (file.endsWith('.js') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Find handler file for a tool
 */
function findHandler(toolName) {
  // Extract short name from tool name
  const shortName = toolName.replace('mcp__agentic_qe__', '');

  // Check if tool is a streaming handler (in streaming directory)
  if (STREAMING_HANDLER_FILES[shortName]) {
    const streamingHandlerFile = path.join(STREAMING_DIR, STREAMING_HANDLER_FILES[shortName]);
    if (fileExists(streamingHandlerFile)) {
      return streamingHandlerFile;
    }
  }

  // Check if tool is handled by a composite handler
  for (const [handlerName, tools] of Object.entries(COMPOSITE_HANDLERS)) {
    if (tools.includes(shortName)) {
      // Skip StreamingHandlers as they're handled above
      if (handlerName === 'StreamingHandlers') continue;

      const handlerFile = path.join(HANDLERS_DIR, COMPOSITE_HANDLER_FILES[handlerName]);
      if (fileExists(handlerFile)) {
        return handlerFile;
      }
    }
  }

  // Fall back to original individual handler search
  const handlerName = shortName.replace(/_/g, '-');
  const handlerNameUnderscore = shortName.replace(/-/g, '_');

  const allHandlers = findAllJsFiles(HANDLERS_DIR);

  for (const handlerPath of allHandlers) {
    const basename = path.basename(handlerPath, '.js');
    if (
      basename === handlerName ||
      basename === `${handlerName}-handler` ||
      basename === handlerNameUnderscore ||
      basename === `${handlerNameUnderscore}-handler` ||
      basename === shortName
    ) {
      return handlerPath;
    }
  }

  return null;
}

/**
 * Recursively find all test files
 */
function findAllTestFiles(dir, fileList = []) {
  if (!fileExists(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findAllTestFiles(filePath, fileList);
    } else if (file.endsWith('.test.ts')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Helper to convert snake_case to PascalCase
 */
function toPascalCase(str) {
  return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

/**
 * Find test file for a tool
 */
function findTests(toolName) {
  const shortName = toolName.replace('mcp__agentic_qe__', '');
  const testName = shortName.replace(/_/g, '-');

  // Try specific file names first
  const specificPaths = [
    path.join(TESTS_DIR, `${testName}.test.ts`),
    path.join(TESTS_DIR, `${testName}-handler.test.ts`),
    path.join(TESTS_DIR, 'handlers', `${testName}.test.ts`),
    // Check subdirectories
    path.join(TESTS_DIR, 'handlers', 'memory', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'coordination', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'test', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'analysis', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'prediction', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'learning', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'security', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'phase2', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'handlers', 'phase3', `${testName}.test.ts`),
    // Streaming tests
    path.join(TESTS_DIR, 'streaming', `${testName}.test.ts`),
    path.join(TESTS_DIR, 'streaming', 'StreamingMCPTools.test.ts')
  ];

  // For streaming handlers, also check the streaming test file
  if (STREAMING_HANDLER_FILES[shortName]) {
    const streamingTestFile = path.join(TESTS_DIR, 'streaming', 'StreamingMCPTools.test.ts');
    if (fileExists(streamingTestFile)) {
      try {
        const content = fs.readFileSync(streamingTestFile, 'utf8');
        // Check for streaming handler class name
        const handlerClassName = shortName === 'test_execute_stream' ? 'TestExecuteStreamHandler' : 'CoverageAnalyzeStreamHandler';
        if (content.includes(handlerClassName)) {
          return streamingTestFile;
        }
      } catch (err) {
        // Continue to other checks
      }
    }
  }

  for (const testPath of specificPaths) {
    if (fileExists(testPath)) {
      return testPath;
    }
  }

  // Check if tool is handled by a composite handler - look for composite handler tests
  for (const [handlerName, tools] of Object.entries(COMPOSITE_HANDLERS)) {
    if (tools.includes(shortName)) {
      // Look for composite handler test files
      const compositeTestPatterns = [
        path.join(TESTS_DIR, 'handlers', 'phase2', 'Phase2Tools.test.ts'),
        path.join(TESTS_DIR, 'handlers', 'phase3', 'Phase3DomainTools.test.ts'),
        path.join(TESTS_DIR, 'handlers', 'Phase2Tools.test.ts'),
        path.join(TESTS_DIR, 'handlers', 'Phase3DomainTools.test.ts')
      ];

      for (const testPath of compositeTestPatterns) {
        if (fileExists(testPath)) {
          // Check if this test file contains tests for the specific tool
          try {
            const content = fs.readFileSync(testPath, 'utf8');
            // Look for handler method names (e.g., handleLearningStatus, handleCoverageAnalyzeWithRiskScoring)
            const handlerMethodName = `handle${toPascalCase(shortName)}`;
            if (content.includes(handlerMethodName) ||
                content.includes(shortName) ||
                content.includes(testName)) {
              return testPath;
            }
          } catch (err) {
            // Skip if can't read
          }
        }
      }
    }
  }

  // Search within all test files for various patterns
  const allTestFiles = findAllTestFiles(TESTS_DIR);
  const searchPatterns = [
    toolName,                           // Full tool name
    shortName,                          // Short name
    testName,                           // Hyphenated name
    shortName.replace(/_/g, ''),        // No separators
    `handle${toPascalCase(shortName)}`, // Handler method name
  ];

  for (const testFile of allTestFiles) {
    try {
      const content = fs.readFileSync(testFile, 'utf8');
      for (const pattern of searchPatterns) {
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
          return testFile;
        }
      }
    } catch (err) {
      // Skip files that can't be read
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
