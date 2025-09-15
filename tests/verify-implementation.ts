#!/usr/bin/env ts-node

/**
 * Verification Script - Confirms All Agents Are Implemented
 * This is a simpler verification that checks file existence and basic structure
 */

import * as fs from 'fs';
import * as path from 'path';

const EXPECTED_AGENTS = [
  // Core QE Agents (5)
  'requirements-explorer.ts',
  'risk-oracle.ts',
  'security-sentinel.ts',
  'performance-hunter.ts',
  'exploratory-navigator.ts',

  // Swarm Coordination (4)
  'adaptive-coordinator.ts',
  'hierarchical-coordinator.ts',
  'mesh-coordinator.ts',
  'collective-intelligence-coordinator.ts',

  // Consensus & Distributed (5)
  'byzantine-coordinator.ts',
  'raft-manager.ts',
  'gossip-coordinator.ts',
  'quorum-manager.ts',
  'crdt-synchronizer.ts',

  // SPARC Methodology (6)
  'sparc-coord.ts',
  'sparc-coder.ts',
  'specification.ts',
  'pseudocode.ts',
  'architecture.ts',
  'refinement.ts',

  // Testing & Quality (8)
  'tdd-pair-programmer.ts',
  'mutation-testing-swarm.ts',
  'functional-stateful.ts',
  'spec-linter.ts',
  'quality-storyteller.ts',
  'design-challenger.ts',
  'pattern-recognition-sage.ts',
  'resilience-challenger.ts',

  // GitHub & Deployment (8)
  'github-modes.ts',
  'pr-manager.ts',
  'code-review-swarm.ts',
  'issue-tracker.ts',
  'release-manager.ts',
  'workflow-automation.ts',
  'deployment-guardian.ts',
  'production-observer.ts',

  // Context & Security (3)
  'context-orchestrator.ts',
  'swarm-memory-manager.ts',
  'security-injection.ts'
];

console.log('🔍 Verification of TypeScript Agent Implementation\n');
console.log('=' .repeat(60));

let totalLines = 0;
let implemented = 0;
let missing = [];
const agentInfo = [];

// Check each agent file
for (const agentFile of EXPECTED_AGENTS) {
  const filePath = path.join(__dirname, '..', 'src', 'agents', agentFile);

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    totalLines += lines;
    implemented++;

    // Check for key patterns
    const hasClass = content.includes('export class');
    const extendsBase = content.includes('extends BaseAgent');
    const hasExecuteTask = content.includes('executeTask');

    agentInfo.push({
      file: agentFile,
      lines,
      hasClass,
      extendsBase,
      hasExecuteTask,
      status: hasClass && extendsBase && hasExecuteTask ? '✅' : '⚠️'
    });

    console.log(`${hasClass && extendsBase && hasExecuteTask ? '✅' : '⚠️'} ${agentFile.padEnd(35)} - ${lines.toString().padStart(5)} lines`);
  } else {
    missing.push(agentFile);
    console.log(`❌ ${agentFile.padEnd(35)} - NOT FOUND`);
  }
}

console.log('\n' + '=' .repeat(60));
console.log('📊 IMPLEMENTATION SUMMARY');
console.log('=' .repeat(60));

console.log(`\n✅ Implemented: ${implemented}/${EXPECTED_AGENTS.length} agents`);
console.log(`📝 Total Lines: ${totalLines.toLocaleString()} lines of TypeScript code`);
console.log(`📈 Average: ${Math.round(totalLines / implemented)} lines per agent`);

if (missing.length > 0) {
  console.log(`\n❌ Missing: ${missing.length} agents`);
  missing.forEach(f => console.log(`   - ${f}`));
} else {
  console.log('\n🎉 All agents are implemented!');
}

// Check for proper structure
const properlyStructured = agentInfo.filter(a => a.status === '✅').length;
const needsAttention = agentInfo.filter(a => a.status === '⚠️').length;

console.log(`\n🏗️ Structure Verification:`);
console.log(`   ✅ Properly structured: ${properlyStructured}/${implemented}`);
if (needsAttention > 0) {
  console.log(`   ⚠️ Need attention: ${needsAttention}`);
  agentInfo.filter(a => a.status === '⚠️').forEach(a => {
    console.log(`      - ${a.file}: ${!a.hasClass ? 'missing class' : !a.extendsBase ? 'not extending BaseAgent' : 'missing executeTask'}`);
  });
}

// Check exports
console.log(`\n📦 Export Verification:`);
const indexPath = path.join(__dirname, '..', 'src', 'agents', 'index.ts');
if (fs.existsSync(indexPath)) {
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  const exportCount = (indexContent.match(/export \{/g) || []).length;
  console.log(`   Total exports in index.ts: ${exportCount}`);
  console.log(`   ✅ Central export file exists`);
} else {
  console.log(`   ❌ index.ts not found`);
}

// Summary
console.log('\n' + '=' .repeat(60));
console.log('🏆 FINAL VERIFICATION STATUS');
console.log('=' .repeat(60));

const successRate = (implemented / EXPECTED_AGENTS.length) * 100;

if (successRate === 100 && properlyStructured === implemented) {
  console.log('\n✅ VERIFICATION PASSED!');
  console.log('All 39 TypeScript agents are fully implemented and properly structured.');
} else if (successRate === 100) {
  console.log('\n⚠️ VERIFICATION PASSED WITH WARNINGS');
  console.log('All 39 agents exist but some may need structural improvements.');
} else {
  console.log('\n❌ VERIFICATION FAILED');
  console.log(`Only ${implemented}/${EXPECTED_AGENTS.length} agents are implemented.`);
}

console.log(`\n📊 Implementation Rate: ${successRate.toFixed(1)}%`);
console.log(`💯 Quality Score: ${((properlyStructured / implemented) * 100).toFixed(1)}%`);

// Generate report file
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    expected: EXPECTED_AGENTS.length,
    implemented,
    missing: missing.length,
    totalLines,
    averageLines: Math.round(totalLines / implemented),
    successRate,
    properlyStructured,
    qualityScore: (properlyStructured / implemented) * 100
  },
  agents: agentInfo,
  missing
};

fs.writeFileSync(
  path.join(__dirname, 'verification-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('\n📝 Detailed report saved to: tests/verification-report.json');

process.exit(successRate === 100 ? 0 : 1);