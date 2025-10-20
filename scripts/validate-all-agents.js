#!/usr/bin/env node

/**
 * Agent Validation Script
 * Validates all 72 agents (18 QE + 54 Claude Flow) are properly configured
 */

const fs = require('fs');
const path = require('path');

// Expected QE Agents (18)
const expectedQEAgents = [
  // Core Testing (5)
  { name: 'qe-test-generator', category: 'Core Testing', file: 'qe-test-generator.md' },
  { name: 'qe-test-executor', category: 'Core Testing', file: 'qe-test-executor.md' },
  { name: 'qe-coverage-analyzer', category: 'Core Testing', file: 'qe-coverage-analyzer.md' },
  { name: 'qe-quality-gate', category: 'Core Testing', file: 'qe-quality-gate.md' },
  { name: 'qe-quality-analyzer', category: 'Core Testing', file: 'qe-quality-analyzer.md' },

  // Performance & Security (2)
  { name: 'qe-performance-tester', category: 'Performance & Security', file: 'qe-performance-tester.md' },
  { name: 'qe-security-scanner', category: 'Performance & Security', file: 'qe-security-scanner.md' },

  // Strategic Planning (3)
  { name: 'qe-requirements-validator', category: 'Strategic Planning', file: 'qe-requirements-validator.md' },
  { name: 'qe-production-intelligence', category: 'Strategic Planning', file: 'qe-production-intelligence.md' },
  { name: 'qe-fleet-commander', category: 'Strategic Planning', file: 'qe-fleet-commander.md' },

  // Deployment (1)
  { name: 'qe-deployment-readiness', category: 'Deployment', file: 'qe-deployment-readiness.md' },

  // Advanced Testing (4)
  { name: 'qe-regression-risk-analyzer', category: 'Advanced Testing', file: 'qe-regression-risk-analyzer.md' },
  { name: 'qe-test-data-architect', category: 'Advanced Testing', file: 'qe-test-data-architect.md' },
  { name: 'qe-api-contract-validator', category: 'Advanced Testing', file: 'qe-api-contract-validator.md' },
  { name: 'qe-flaky-test-hunter', category: 'Advanced Testing', file: 'qe-flaky-test-hunter.md' },

  // Specialized (2)
  { name: 'qe-visual-tester', category: 'Specialized', file: 'qe-visual-tester.md' },
  { name: 'qe-chaos-engineer', category: 'Specialized', file: 'qe-chaos-engineer.md' },
];

// Expected Claude Flow Agents (54)
const expectedClaudeFlowAgents = [
  // Core Development (5)
  { name: 'coder', category: 'Core Development', file: 'core/coder.md' },
  { name: 'reviewer', category: 'Core Development', file: 'core/reviewer.md' },
  { name: 'tester', category: 'Core Development', file: 'core/tester.md' },
  { name: 'planner', category: 'Core Development', file: 'core/planner.md' },
  { name: 'researcher', category: 'Core Development', file: 'core/researcher.md' },

  // Swarm Coordination (5)
  { name: 'hierarchical-coordinator', category: 'Swarm Coordination', file: 'swarm/hierarchical-coordinator.md' },
  { name: 'mesh-coordinator', category: 'Swarm Coordination', file: 'swarm/mesh-coordinator.md' },
  { name: 'adaptive-coordinator', category: 'Swarm Coordination', file: 'swarm/adaptive-coordinator.md' },
  { name: 'collective-intelligence-coordinator', category: 'Swarm Coordination', file: 'hive-mind/collective-intelligence-coordinator.md' },
  { name: 'swarm-memory-manager', category: 'Swarm Coordination', file: 'hive-mind/swarm-memory-manager.md' },

  // Consensus & Distributed (7)
  { name: 'byzantine-coordinator', category: 'Consensus & Distributed', file: 'consensus/byzantine-coordinator.md' },
  { name: 'raft-manager', category: 'Consensus & Distributed', file: 'consensus/raft-manager.md' },
  { name: 'gossip-coordinator', category: 'Consensus & Distributed', file: 'consensus/gossip-coordinator.md' },
  { name: 'crdt-synchronizer', category: 'Consensus & Distributed', file: 'consensus/crdt-synchronizer.md' },
  { name: 'quorum-manager', category: 'Consensus & Distributed', file: 'consensus/quorum-manager.md' },
  { name: 'security-manager', category: 'Consensus & Distributed', file: 'consensus/security-manager.md' },
  { name: 'performance-benchmarker', category: 'Consensus & Distributed', file: 'consensus/performance-benchmarker.md' },

  // Performance & Optimization (5)
  { name: 'performance-monitor', category: 'Performance & Optimization', file: 'optimization/performance-monitor.md' },
  { name: 'benchmark-suite', category: 'Performance & Optimization', file: 'optimization/benchmark-suite.md' },
  { name: 'resource-allocator', category: 'Performance & Optimization', file: 'optimization/resource-allocator.md' },
  { name: 'load-balancer', category: 'Performance & Optimization', file: 'optimization/load-balancer.md' },
  { name: 'topology-optimizer', category: 'Performance & Optimization', file: 'optimization/topology-optimizer.md' },

  // GitHub & Repository (9)
  { name: 'github-modes', category: 'GitHub & Repository', file: 'github/github-modes.md' },
  { name: 'pr-manager', category: 'GitHub & Repository', file: 'github/pr-manager.md' },
  { name: 'code-review-swarm', category: 'GitHub & Repository', file: 'github/code-review-swarm.md' },
  { name: 'issue-tracker', category: 'GitHub & Repository', file: 'github/issue-tracker.md' },
  { name: 'release-manager', category: 'GitHub & Repository', file: 'github/release-manager.md' },
  { name: 'workflow-automation', category: 'GitHub & Repository', file: 'github/workflow-automation.md' },
  { name: 'project-board-sync', category: 'GitHub & Repository', file: 'github/project-board-sync.md' },
  { name: 'repo-architect', category: 'GitHub & Repository', file: 'github/repo-architect.md' },
  { name: 'multi-repo-swarm', category: 'GitHub & Repository', file: 'github/multi-repo-swarm.md' },

  // SPARC Methodology (4)
  { name: 'specification', category: 'SPARC Methodology', file: 'sparc/specification.md' },
  { name: 'pseudocode', category: 'SPARC Methodology', file: 'sparc/pseudocode.md' },
  { name: 'architecture', category: 'SPARC Methodology', file: 'sparc/architecture.md' },
  { name: 'refinement', category: 'SPARC Methodology', file: 'sparc/refinement.md' },

  // Specialized Development (8)
  { name: 'backend-dev', category: 'Specialized Development', file: 'development/backend/dev-backend-api.md' },
  { name: 'mobile-dev', category: 'Specialized Development', file: 'specialized/mobile/spec-mobile-react-native.md' },
  { name: 'ml-developer', category: 'Specialized Development', file: 'data/ml/data-ml-model.md' },
  { name: 'cicd-engineer', category: 'Specialized Development', file: 'devops/ci-cd/ops-cicd-github.md' },
  { name: 'api-docs', category: 'Specialized Development', file: 'documentation/api-docs/docs-api-openapi.md' },
  { name: 'system-architect', category: 'Specialized Development', file: 'architecture/system-design/arch-system-design.md' },
  { name: 'code-analyzer', category: 'Specialized Development', file: 'analysis/code-analyzer.md' },
  { name: 'base-template-generator', category: 'Specialized Development', file: 'base-template-generator.md' },

  // Testing & Validation (2)
  { name: 'tdd-london-swarm', category: 'Testing & Validation', file: 'testing/unit/tdd-london-swarm.md' },
  { name: 'production-validator', category: 'Testing & Validation', file: 'testing/validation/production-validator.md' },

  // Hive Mind (3)
  { name: 'queen-coordinator', category: 'Hive Mind', file: 'hive-mind/queen-coordinator.md' },
  { name: 'scout-explorer', category: 'Hive Mind', file: 'hive-mind/scout-explorer.md' },
  { name: 'worker-specialist', category: 'Hive Mind', file: 'hive-mind/worker-specialist.md' },

  // Flow Nexus Platform (9)
  { name: 'flow-nexus-swarm', category: 'Flow Nexus Platform', file: 'flow-nexus/swarm.md' },
  { name: 'flow-nexus-authentication', category: 'Flow Nexus Platform', file: 'flow-nexus/authentication.md' },
  { name: 'flow-nexus-sandbox', category: 'Flow Nexus Platform', file: 'flow-nexus/sandbox.md' },
  { name: 'flow-nexus-neural-network', category: 'Flow Nexus Platform', file: 'flow-nexus/neural-network.md' },
  { name: 'flow-nexus-workflow', category: 'Flow Nexus Platform', file: 'flow-nexus/workflow.md' },
  { name: 'flow-nexus-app-store', category: 'Flow Nexus Platform', file: 'flow-nexus/app-store.md' },
  { name: 'flow-nexus-challenges', category: 'Flow Nexus Platform', file: 'flow-nexus/challenges.md' },
  { name: 'flow-nexus-payments', category: 'Flow Nexus Platform', file: 'flow-nexus/payments.md' },
  { name: 'flow-nexus-user-tools', category: 'Flow Nexus Platform', file: 'flow-nexus/user-tools.md' },
];

const agentsDir = path.join(__dirname, '..', '.claude', 'agents');

// Validation results
const results = {
  qe: {
    found: [],
    missing: [],
    invalid: [],
    total: expectedQEAgents.length
  },
  claudeFlow: {
    found: [],
    missing: [],
    invalid: [],
    total: expectedClaudeFlowAgents.length
  }
};

console.log('🔍 Validating All 72 Agents...\n');

// Validate QE Agents
console.log('📋 Validating QE Fleet Agents (18)...');
for (const agent of expectedQEAgents) {
  const filePath = path.join(agentsDir, agent.file);

  if (!fs.existsSync(filePath)) {
    results.qe.missing.push(agent);
    console.log(`  ❌ Missing: ${agent.name} (${agent.file})`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Check for YAML frontmatter
  if (!content.startsWith('---')) {
    results.qe.invalid.push({ ...agent, reason: 'No YAML frontmatter' });
    console.log(`  ⚠️  Invalid: ${agent.name} - No YAML frontmatter`);
    continue;
  }

  // Check for required fields
  const hasName = content.includes(`name: ${agent.name}`);
  const hasType = content.includes('type:');
  const hasDescription = content.includes('description:');

  if (!hasName || !hasType || !hasDescription) {
    results.qe.invalid.push({ ...agent, reason: 'Missing required frontmatter fields' });
    console.log(`  ⚠️  Invalid: ${agent.name} - Missing required fields`);
    continue;
  }

  results.qe.found.push(agent);
  console.log(`  ✅ Valid: ${agent.name}`);
}

// Validate Claude Flow Agents
console.log('\n📋 Validating Claude Flow Agents (54)...');
for (const agent of expectedClaudeFlowAgents) {
  const filePath = path.join(agentsDir, agent.file);

  if (!fs.existsSync(filePath)) {
    results.claudeFlow.missing.push(agent);
    console.log(`  ❌ Missing: ${agent.name} (${agent.file})`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Check for YAML frontmatter
  if (!content.startsWith('---')) {
    results.claudeFlow.invalid.push({ ...agent, reason: 'No YAML frontmatter' });
    console.log(`  ⚠️  Invalid: ${agent.name} - No YAML frontmatter`);
    continue;
  }

  results.claudeFlow.found.push(agent);
  console.log(`  ✅ Valid: ${agent.name}`);
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('📊 VALIDATION SUMMARY');
console.log('='.repeat(80));

console.log('\n🤖 QE Fleet Agents:');
console.log(`  Total Expected: ${results.qe.total}`);
console.log(`  ✅ Found & Valid: ${results.qe.found.length}`);
console.log(`  ❌ Missing: ${results.qe.missing.length}`);
console.log(`  ⚠️  Invalid: ${results.qe.invalid.length}`);

console.log('\n🤖 Claude Flow Agents:');
console.log(`  Total Expected: ${results.claudeFlow.total}`);
console.log(`  ✅ Found & Valid: ${results.claudeFlow.found.length}`);
console.log(`  ❌ Missing: ${results.claudeFlow.missing.length}`);
console.log(`  ⚠️  Invalid: ${results.claudeFlow.invalid.length}`);

const totalExpected = results.qe.total + results.claudeFlow.total;
const totalFound = results.qe.found.length + results.claudeFlow.found.length;
const totalMissing = results.qe.missing.length + results.claudeFlow.missing.length;
const totalInvalid = results.qe.invalid.length + results.claudeFlow.invalid.length;

console.log('\n📈 OVERALL STATUS:');
console.log(`  Total Expected: ${totalExpected}`);
console.log(`  ✅ Found & Valid: ${totalFound}`);
console.log(`  ❌ Missing: ${totalMissing}`);
console.log(`  ⚠️  Invalid: ${totalInvalid}`);
console.log(`  Success Rate: ${((totalFound / totalExpected) * 100).toFixed(1)}%`);

// Generate detailed report
if (results.qe.missing.length > 0 || results.claudeFlow.missing.length > 0) {
  console.log('\n❌ MISSING AGENTS:');
  [...results.qe.missing, ...results.claudeFlow.missing].forEach(agent => {
    console.log(`  - ${agent.name} (${agent.category})`);
  });
}

if (results.qe.invalid.length > 0 || results.claudeFlow.invalid.length > 0) {
  console.log('\n⚠️  INVALID AGENTS:');
  [...results.qe.invalid, ...results.claudeFlow.invalid].forEach(agent => {
    console.log(`  - ${agent.name}: ${agent.reason}`);
  });
}

console.log('\n' + '='.repeat(80));

// Exit with error code if validation failed
const exitCode = (totalMissing > 0 || totalInvalid > 0) ? 1 : 0;
process.exit(exitCode);
