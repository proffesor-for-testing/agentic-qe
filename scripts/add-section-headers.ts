#!/usr/bin/env tsx
/**
 * Script to add section headers to group tools by category
 * Phase 3 Track H - Issue #115
 */

import * as fs from 'fs';
import * as path from 'path';

// Section headers to add before the first tool of each category
const sectionHeaders: Record<string, string> = {
  core_fleet: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           CORE TOOLS - FLEET MANAGEMENT\n  //                    Always loaded for basic fleet operations and coordination\n  // ═════════════════════════════════════════════════════════════════════════════',
  core_testing: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           CORE TOOLS - TESTING EXECUTION\n  //                    Always loaded for test generation and execution\n  // ═════════════════════════════════════════════════════════════════════════════',
  core_memory: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           CORE TOOLS - MEMORY & STATE\n  //                    Always loaded for agent coordination and memory\n  // ═════════════════════════════════════════════════════════════════════════════',
  core_orchestration: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           CORE TOOLS - TASK ORCHESTRATION\n  //                    Always loaded for task management and coordination\n  // ═════════════════════════════════════════════════════════════════════════════',
  core_coordination: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           CORE TOOLS - COORDINATION\n  //                    Workflow, blackboard, consensus, and event coordination\n  // ═════════════════════════════════════════════════════════════════════════════',
  core_meta: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           CORE TOOLS - META/DISCOVERY\n  //                    Tool discovery and domain loading\n  // ═════════════════════════════════════════════════════════════════════════════',
  testing: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           TESTING DOMAIN TOOLS\n  //                    Test optimization, coverage, execution, and flaky detection\n  // ═════════════════════════════════════════════════════════════════════════════',
  analysis: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           ANALYSIS DOMAIN TOOLS\n  //                    Performance and coverage analysis with ML/AI\n  // ═════════════════════════════════════════════════════════════════════════════',
  security: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           SECURITY DOMAIN TOOLS\n  //                    Security scanning, vulnerability detection, compliance\n  // ═════════════════════════════════════════════════════════════════════════════',
  quality: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           QUALITY DOMAIN TOOLS\n  //                    Quality gates, metrics, code quality, requirements\n  // ═════════════════════════════════════════════════════════════════════════════',
  advanced: '\n  // ═════════════════════════════════════════════════════════════════════════════\n  //                           ADVANCED/SPECIALIZED TOOLS\n  //                    Mutation, API contracts, production, testgen, learning\n  // ═════════════════════════════════════════════════════════════════════════════',
};

function addSectionHeaders() {
  const toolsPath = path.join(process.cwd(), 'src/mcp/tools.ts');
  let content = fs.readFileSync(toolsPath, 'utf-8');

  // Track which sections have been added
  const addedSections = new Set<string>();

  // Define first tool of each section
  const firstToolsInSections: Record<string, string> = {
    core_fleet: 'mcp__agentic_qe__fleet_init',
    core_testing: 'mcp__agentic_qe__test_execute',
    core_memory: 'mcp__agentic_qe__memory_store',
    core_orchestration: 'mcp__agentic_qe__task_orchestrate',
    core_coordination: 'mcp__agentic_qe__workflow_create',
    core_meta: 'mcp__agentic_qe__tools_discover',
    testing: 'mcp__agentic_qe__test_optimize_sublinear',
    analysis: 'mcp__agentic_qe__performance_analyze_bottlenecks',
    security: 'mcp__agentic_qe__qe_security_scan_comprehensive',
    quality: 'mcp__agentic_qe__qe_qualitygate_evaluate',
    advanced: 'mcp__agentic_qe__mutation_test_execute',
  };

  // Add section headers before the first tool of each section
  for (const [section, toolName] of Object.entries(firstToolsInSections)) {
    const header = sectionHeaders[section];
    if (!header) continue;

    const escapedName = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find the category comment before this tool
    const pattern = new RegExp(
      `(\\s*)(// Category: [^\\n]+\\n)(\\s*\\{\\s*\\n\\s*name:\\s*'${escapedName}')`,
      'g'
    );

    content = content.replace(pattern, (match, indent, categoryComment, toolStart) => {
      if (!addedSections.has(section)) {
        addedSections.add(section);
        return `${header}\n${indent}${categoryComment}${indent}${toolStart}`;
      }
      return match;
    });
  }

  // Write back
  fs.writeFileSync(toolsPath, content, 'utf-8');

  console.log('✅ Section headers added');
  console.log(`   Added ${addedSections.size} section headers\n`);
}

addSectionHeaders();
