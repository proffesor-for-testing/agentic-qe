#!/usr/bin/env tsx
/**
 * Script to add category fields to all tool definitions in tools.ts
 * Phase 3 Track H - Issue #115
 */

import * as fs from 'fs';
import * as path from 'path';
import { getToolCategory, getToolDomain, CORE_TOOLS, DOMAIN_TOOLS, SPECIALIZED_TOOLS, COORDINATION_TOOLS } from '../src/mcp/tool-categories.js';

// Category mapping for all tools
const categoryMap: Record<string, { category: string; domain?: string }> = {
  // Core tools (14 tools)
  'mcp__agentic_qe__fleet_init': { category: 'core', domain: 'fleet' },
  'mcp__agentic_qe__agent_spawn': { category: 'core', domain: 'fleet' },
  'mcp__agentic_qe__fleet_status': { category: 'core', domain: 'fleet' },
  'mcp__agentic_qe__test_generate_enhanced': { category: 'core', domain: 'testing' },
  'mcp__agentic_qe__test_execute': { category: 'core', domain: 'testing' },
  'mcp__agentic_qe__test_execute_parallel': { category: 'core', domain: 'testing' },
  'mcp__agentic_qe__test_report_comprehensive': { category: 'core', domain: 'testing' },
  'mcp__agentic_qe__memory_store': { category: 'core', domain: 'memory' },
  'mcp__agentic_qe__memory_retrieve': { category: 'core', domain: 'memory' },
  'mcp__agentic_qe__memory_query': { category: 'core', domain: 'memory' },
  'mcp__agentic_qe__task_orchestrate': { category: 'core', domain: 'orchestration' },
  'mcp__agentic_qe__task_status': { category: 'core', domain: 'orchestration' },
  'mcp__agentic_qe__tools_discover': { category: 'core', domain: 'meta' },
  'mcp__agentic_qe__tools_load_domain': { category: 'core', domain: 'meta' },

  // Testing domain (from test_* tools)
  'mcp__agentic_qe__test_optimize_sublinear': { category: 'testing', domain: 'optimization' },
  'mcp__agentic_qe__test_coverage_detailed': { category: 'testing', domain: 'coverage' },
  'mcp__agentic_qe__test_execute_stream': { category: 'testing', domain: 'execution' },

  // Security domain
  'mcp__agentic_qe__qe_security_scan_comprehensive': { category: 'security', domain: 'scanning' },
  'mcp__agentic_qe__qe_security_detect_vulnerabilities': { category: 'security', domain: 'detection' },
  'mcp__agentic_qe__qe_security_validate_compliance': { category: 'security', domain: 'compliance' },
  'mcp__agentic_qe__security_generate_report': { category: 'security', domain: 'reporting' },

  // Performance domain
  'mcp__agentic_qe__performance_analyze_bottlenecks': { category: 'analysis', domain: 'performance' },
  'mcp__agentic_qe__performance_generate_report': { category: 'analysis', domain: 'performance' },
  'mcp__agentic_qe__performance_run_benchmark': { category: 'analysis', domain: 'performance' },
  'mcp__agentic_qe__performance_monitor_realtime': { category: 'analysis', domain: 'performance' },
  'mcp__agentic_qe__performance_benchmark_run': { category: 'analysis', domain: 'performance' },

  // Coverage domain
  'mcp__agentic_qe__coverage_analyze_stream': { category: 'analysis', domain: 'coverage' },
  'mcp__agentic_qe__coverage_analyze_with_risk_scoring': { category: 'analysis', domain: 'coverage' },
  'mcp__agentic_qe__coverage_detect_gaps_ml': { category: 'analysis', domain: 'coverage' },
  'mcp__agentic_qe__coverage_recommend_tests': { category: 'analysis', domain: 'coverage' },
  'mcp__agentic_qe__coverage_calculate_trends': { category: 'analysis', domain: 'coverage' },
  'mcp__agentic_qe__coverage_analyze_sublinear': { category: 'analysis', domain: 'coverage' },
  'mcp__agentic_qe__coverage_gaps_detect': { category: 'analysis', domain: 'coverage' },

  // Quality domain
  'mcp__agentic_qe__qe_qualitygate_evaluate': { category: 'quality', domain: 'gates' },
  'mcp__agentic_qe__qe_qualitygate_assess_risk': { category: 'quality', domain: 'gates' },
  'mcp__agentic_qe__qe_qualitygate_validate_metrics': { category: 'quality', domain: 'gates' },
  'mcp__agentic_qe__qe_qualitygate_generate_report': { category: 'quality', domain: 'gates' },
  'mcp__agentic_qe__qe_code_quality_complexity': { category: 'quality', domain: 'code' },
  'mcp__agentic_qe__qe_code_quality_metrics': { category: 'quality', domain: 'code' },
  'mcp__agentic_qe__deployment_readiness_check': { category: 'quality', domain: 'deployment' },

  // Flaky domain
  'mcp__agentic_qe__flaky_detect_statistical': { category: 'testing', domain: 'flaky' },
  'mcp__agentic_qe__flaky_analyze_patterns': { category: 'testing', domain: 'flaky' },
  'mcp__agentic_qe__flaky_stabilize_auto': { category: 'testing', domain: 'flaky' },
  'mcp__agentic_qe__flaky_test_detect': { category: 'testing', domain: 'flaky' },

  // Visual domain
  'mcp__agentic_qe__visual_compare_screenshots': { category: 'testing', domain: 'visual' },
  'mcp__agentic_qe__visual_validate_accessibility': { category: 'testing', domain: 'visual' },
  'mcp__agentic_qe__visual_detect_regression': { category: 'testing', domain: 'visual' },
  'mcp__agentic_qe__visual_test_regression': { category: 'testing', domain: 'visual' },

  // Requirements domain
  'mcp__agentic_qe__qe_requirements_validate': { category: 'quality', domain: 'requirements' },
  'mcp__agentic_qe__qe_requirements_generate_bdd': { category: 'quality', domain: 'requirements' },

  // Advanced/Specialized tools
  'mcp__agentic_qe__mutation_test_execute': { category: 'advanced', domain: 'mutation' },
  'mcp__agentic_qe__api_breaking_changes': { category: 'advanced', domain: 'api' },
  'mcp__agentic_qe__qe_api_contract_validate': { category: 'advanced', domain: 'api' },
  'mcp__agentic_qe__qe_api_contract_breaking_changes': { category: 'advanced', domain: 'api' },
  'mcp__agentic_qe__qe_api_contract_versioning': { category: 'advanced', domain: 'api' },
  'mcp__agentic_qe__production_incident_replay': { category: 'advanced', domain: 'production' },
  'mcp__agentic_qe__production_rum_analyze': { category: 'advanced', domain: 'production' },
  'mcp__agentic_qe__qe_testgen_generate_unit': { category: 'advanced', domain: 'testgen' },
  'mcp__agentic_qe__qe_testgen_generate_integration': { category: 'advanced', domain: 'testgen' },
  'mcp__agentic_qe__qe_testgen_optimize_suite': { category: 'advanced', domain: 'testgen' },
  'mcp__agentic_qe__qe_testgen_analyze_quality': { category: 'advanced', domain: 'testgen' },
  'mcp__agentic_qe__qe_test_data_generate': { category: 'advanced', domain: 'testdata' },
  'mcp__agentic_qe__qe_test_data_mask': { category: 'advanced', domain: 'testdata' },
  'mcp__agentic_qe__qe_test_data_analyze_schema': { category: 'advanced', domain: 'testdata' },
  'mcp__agentic_qe__qe_regression_analyze_risk': { category: 'advanced', domain: 'regression' },
  'mcp__agentic_qe__qe_regression_select_tests': { category: 'advanced', domain: 'regression' },
  'mcp__agentic_qe__qe_fleet_coordinate': { category: 'advanced', domain: 'fleet' },
  'mcp__agentic_qe__qe_fleet_agent_status': { category: 'advanced', domain: 'fleet' },
  'mcp__agentic_qe__predict_defects_ai': { category: 'advanced', domain: 'ai' },
  'mcp__agentic_qe__regression_risk_analyze': { category: 'advanced', domain: 'regression' },

  // Learning tools
  'mcp__agentic_qe__learning_store_experience': { category: 'advanced', domain: 'learning' },
  'mcp__agentic_qe__learning_store_qvalue': { category: 'advanced', domain: 'learning' },
  'mcp__agentic_qe__learning_store_pattern': { category: 'advanced', domain: 'learning' },
  'mcp__agentic_qe__learning_query': { category: 'advanced', domain: 'learning' },

  // Coordination tools
  'mcp__agentic_qe__workflow_create': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__workflow_execute': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__workflow_checkpoint': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__workflow_resume': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__memory_share': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__memory_backup': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__blackboard_post': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__blackboard_read': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__consensus_propose': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__consensus_vote': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__artifact_manifest': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__event_emit': { category: 'core', domain: 'coordination' },
  'mcp__agentic_qe__event_subscribe': { category: 'core', domain: 'coordination' },
};

// Function to process the tools.ts file
function addCategories() {
  const toolsPath = path.join(process.cwd(), 'src/mcp/tools.ts');
  let content = fs.readFileSync(toolsPath, 'utf-8');

  // Statistics
  const stats = {
    core: 0,
    testing: 0,
    analysis: 0,
    security: 0,
    quality: 0,
    advanced: 0,
    total: 0,
  };

  // Add category comments before each tool definition
  for (const [toolName, { category, domain }] of Object.entries(categoryMap)) {
    const escapedName = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find the tool definition
    const toolPattern = new RegExp(
      `(\\s*)(\\{\\s*\\n\\s*name:\\s*'${escapedName}')`,
      'g'
    );

    // Add category comment
    const categoryComment = `\n  // Category: ${category}${domain ? ` | Domain: ${domain}` : ''}`;
    content = content.replace(toolPattern, `$1${categoryComment}\n$1$2`);

    // Update stats
    if (category in stats) {
      stats[category as keyof typeof stats]++;
    }
    stats.total++;
  }

  // Write back the updated content
  fs.writeFileSync(toolsPath, content, 'utf-8');

  // Print summary
  console.log('✅ Category fields added to all tools');
  console.log('\nCategory Distribution:');
  console.log(`  - Core: ${stats.core} tools`);
  console.log(`  - Testing: ${stats.testing} tools`);
  console.log(`  - Analysis: ${stats.analysis} tools`);
  console.log(`  - Security: ${stats.security} tools`);
  console.log(`  - Quality: ${stats.quality} tools`);
  console.log(`  - Advanced: ${stats.advanced} tools`);
  console.log(`  - Total: ${stats.total} tools\n`);
}

// Run the script
addCategories();
