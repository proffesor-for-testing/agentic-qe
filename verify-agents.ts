#!/usr/bin/env ts-node

/**
 * Quick verification that all TypeScript agents are implemented
 */

import * as fs from 'fs';
import * as path from 'path';

const AGENT_FILES = [
  // Core QE Agents
  'requirements-explorer.ts',
  'risk-oracle.ts',
  'security-sentinel.ts',
  'performance-hunter.ts',
  'exploratory-navigator.ts',

  // Swarm Coordination
  'adaptive-coordinator.ts',
  'hierarchical-coordinator.ts',
  'mesh-coordinator.ts',
  'collective-intelligence-coordinator.ts',

  // Consensus & Distributed
  'byzantine-coordinator.ts',
  'raft-manager.ts',
  'gossip-coordinator.ts',
  'quorum-manager.ts',
  'crdt-synchronizer.ts',

  // SPARC Methodology
  'sparc-coord.ts',
  'sparc-coder.ts',
  'specification.ts',
  'pseudocode.ts',
  'architecture.ts',
  'refinement.ts',

  // Testing & Quality
  'tdd-pair-programmer.ts',
  'mutation-testing-swarm.ts',
  'functional-stateful.ts',
  'spec-linter.ts',
  'quality-storyteller.ts',
  'design-challenger.ts',
  'pattern-recognition-sage.ts',
  'resilience-challenger.ts',

  // GitHub & Deployment
  'github-modes.ts',
  'pr-manager.ts',
  'code-review-swarm.ts',
  'issue-tracker.ts',
  'release-manager.ts',
  'workflow-automation.ts',
  'deployment-guardian.ts',
  'production-observer.ts',

  // Context & Security
  'context-orchestrator.ts',
  'swarm-memory-manager.ts',
  'security-injection.ts'
];

console.log('🔍 Verifying TypeScript Agent Implementation\n');
console.log(`Total agents expected: ${AGENT_FILES.length}\n`);

let found = 0;
let missing = 0;
const missingFiles: string[] = [];

for (const file of AGENT_FILES) {
  const filePath = path.join(__dirname, 'src', 'agents', file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
    found++;
  } else {
    console.log(`❌ ${file} - NOT FOUND`);
    missing++;
    missingFiles.push(file);
  }
}

console.log('\n' + '='.repeat(50));
console.log('📊 VERIFICATION SUMMARY');
console.log('='.repeat(50));
console.log(`✅ Found: ${found}/${AGENT_FILES.length}`);
console.log(`❌ Missing: ${missing}/${AGENT_FILES.length}`);
console.log(`📈 Implementation Rate: ${((found / AGENT_FILES.length) * 100).toFixed(1)}%`);

if (missing > 0) {
  console.log('\n⚠️ Missing Agent Files:');
  missingFiles.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log('\n🎉 All TypeScript agents are implemented!');

  // Count total lines of TypeScript code
  let totalLines = 0;
  for (const file of AGENT_FILES) {
    const filePath = path.join(__dirname, 'src', 'agents', file);
    const content = fs.readFileSync(filePath, 'utf-8');
    totalLines += content.split('\n').length;
  }

  console.log(`\n📝 Total TypeScript Code:`);
  console.log(`  - ${AGENT_FILES.length} agent files`);
  console.log(`  - ${totalLines.toLocaleString()} lines of code`);
  console.log(`  - Average: ${Math.round(totalLines / AGENT_FILES.length)} lines per agent`);

  process.exit(0);
}