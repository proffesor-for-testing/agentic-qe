#!/usr/bin/env node
/**
 * Suggest Agents from RuVector Intelligence
 *
 * Analyzes the migrated learning data to suggest optimized agent configurations
 * based on actual usage patterns, not just file types.
 */

const fs = require('fs');
const path = require('path');

const INTELLIGENCE_PATH = '.ruvector/intelligence.json';
const OUTPUT_DIR = '.claude/agents/suggested';

console.log('🧠 Analyzing Intelligence for Agent Suggestions\n');

if (!fs.existsSync(INTELLIGENCE_PATH)) {
  console.error('❌ Intelligence file not found');
  process.exit(1);
}

const intel = JSON.parse(fs.readFileSync(INTELLIGENCE_PATH, 'utf8'));

// Analyze patterns to find agent specializations
const agentScores = {};
const agentTasks = {};
const agentPatterns = {};

// 1. Analyze Q-learning patterns
console.log('📊 Analyzing Q-learning patterns...');
Object.entries(intel.patterns || {}).forEach(([state, agents]) => {
  Object.entries(agents).forEach(([agent, score]) => {
    // Normalize agent names
    const normalizedAgent = agent
      .replace(/-specialist$/, '')
      .replace(/-developer$/, '')
      .replace(/^qe-/, '');

    agentScores[normalizedAgent] = (agentScores[normalizedAgent] || 0) + score;

    if (!agentPatterns[normalizedAgent]) {
      agentPatterns[normalizedAgent] = [];
    }
    agentPatterns[normalizedAgent].push({ state, score });
  });
});

// 2. Analyze trajectories for task types
console.log('📊 Analyzing learning trajectories...');
(intel.trajectories || []).forEach(traj => {
  const agent = traj.agent || 'unknown';
  const normalizedAgent = agent
    .replace(/-specialist$/, '')
    .replace(/-\d+-\d+-[a-f0-9]+$/, ''); // Remove UUID suffixes

  agentScores[normalizedAgent] = (agentScores[normalizedAgent] || 0) + (traj.quality || 0.5) * 10;

  if (!agentTasks[normalizedAgent]) {
    agentTasks[normalizedAgent] = new Set();
  }
  agentTasks[normalizedAgent].add(traj.task);
});

// 3. Analyze registered agents
console.log('📊 Analyzing registered agents...');
const registeredTypes = {};
Object.values(intel.agents || {}).forEach(agent => {
  const type = agent.type;
  registeredTypes[type] = (registeredTypes[type] || 0) + 1;
});

// 4. Analyze memories for domain knowledge
console.log('📊 Analyzing domain knowledge from memories...');
const domainKeywords = {};
(intel.memories || []).forEach(mem => {
  const content = mem.content || '';
  const type = mem.memory_type || 'unknown';

  // Extract domain indicators
  const domains = ['test', 'coverage', 'quality', 'security', 'performance', 'api', 'database', 'ui', 'integration'];
  domains.forEach(domain => {
    if (content.toLowerCase().includes(domain)) {
      domainKeywords[domain] = (domainKeywords[domain] || 0) + 1;
    }
  });
});

// Sort and rank agents
const rankedAgents = Object.entries(agentScores)
  .map(([name, score]) => ({
    name,
    score,
    patterns: (agentPatterns[name] || []).length,
    tasks: agentTasks[name] ? agentTasks[name].size : 0,
    topPatterns: (agentPatterns[name] || [])
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => p.state)
  }))
  .filter(a => a.score > 5) // Filter low-scoring
  .sort((a, b) => b.score - a.score);

console.log('\n' + '='.repeat(60));
console.log('🎯 SUGGESTED AGENTS (Based on Intelligence Data)');
console.log('='.repeat(60) + '\n');

// Top recommended agents
console.log('📌 Top Recommended Agents:\n');
rankedAgents.slice(0, 15).forEach((agent, i) => {
  console.log(`${i + 1}. ${agent.name}`);
  console.log(`   Score: ${Math.round(agent.score)} | Patterns: ${agent.patterns} | Tasks: ${agent.tasks}`);
  if (agent.topPatterns.length > 0) {
    console.log(`   Top patterns: ${agent.topPatterns.slice(0, 2).map(p => p.substring(0, 40)).join(', ')}`);
  }
  console.log();
});

// Domain analysis
console.log('📊 Domain Expertise (from memories):\n');
Object.entries(domainKeywords)
  .sort((a, b) => b[1] - a[1])
  .forEach(([domain, count]) => {
    const bar = '█'.repeat(Math.min(count / 10, 30));
    console.log(`   ${domain.padEnd(12)} ${bar} (${count})`);
  });

// Registered agent types
console.log('\n📋 Most Used Agent Types (from registry):\n');
Object.entries(registeredTypes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`   ${type}: ${count} instances`);
  });

// Generate suggested agent configs
console.log('\n' + '='.repeat(60));
console.log('🔧 GENERATED AGENT CONFIGURATIONS');
console.log('='.repeat(60) + '\n');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Map intelligence to QE agent suggestions
const qeAgentSuggestions = [
  {
    id: 'qe-test-generator',
    name: 'QE Test Generator',
    basedOn: ['test-generator', 'test-engineer', 'tester'],
    capabilities: ['unit-test-generation', 'integration-test-generation', 'bdd-scenarios'],
    patterns: agentPatterns['test-generator'] || agentPatterns['test-engineer'] || []
  },
  {
    id: 'qe-coverage-analyzer',
    name: 'QE Coverage Analyzer',
    basedOn: ['coverage-analyzer', 'code-analyzer'],
    capabilities: ['coverage-gap-detection', 'risk-scoring', 'test-prioritization'],
    patterns: agentPatterns['coverage-analyzer'] || []
  },
  {
    id: 'qe-quality-gate',
    name: 'QE Quality Gate',
    basedOn: ['quality-gate', 'quality-analyzer'],
    capabilities: ['quality-metrics', 'release-readiness', 'policy-validation'],
    patterns: agentPatterns['quality-gate'] || agentPatterns['quality-analyzer'] || []
  },
  {
    id: 'qe-security-scanner',
    name: 'QE Security Scanner',
    basedOn: ['security-scanner', 'security-analyst'],
    capabilities: ['vulnerability-detection', 'sast-dast', 'compliance-checking'],
    patterns: agentPatterns['security-scanner'] || []
  },
  {
    id: 'qe-performance-tester',
    name: 'QE Performance Tester',
    basedOn: ['performance-tester', 'performance-analyzer'],
    capabilities: ['load-testing', 'bottleneck-detection', 'sla-validation'],
    patterns: agentPatterns['performance-tester'] || []
  },
  {
    id: 'qe-integration-specialist',
    name: 'QE Integration Specialist',
    basedOn: ['test-executor', 'integration-tester'],
    capabilities: ['api-testing', 'contract-testing', 'e2e-validation'],
    patterns: agentPatterns['test-executor'] || []
  }
];

// Calculate scores for each suggested agent
qeAgentSuggestions.forEach(suggestion => {
  let totalScore = 0;
  suggestion.basedOn.forEach(base => {
    totalScore += agentScores[base] || 0;
  });
  suggestion.intelligenceScore = totalScore;
  suggestion.patternCount = suggestion.patterns.length;
});

// Sort by intelligence score
qeAgentSuggestions.sort((a, b) => b.intelligenceScore - a.intelligenceScore);

// Output suggestions
qeAgentSuggestions.forEach(agent => {
  const config = {
    name: agent.id,
    displayName: agent.name,
    type: 'qe-specialist',
    description: `${agent.name} - Intelligence-optimized agent`,
    intelligenceScore: Math.round(agent.intelligenceScore),
    basedOnPatterns: agent.patternCount,
    capabilities: agent.capabilities,
    routing: {
      patterns: agent.patterns.slice(0, 10).map(p => p.state),
      priority: agent.intelligenceScore > 100 ? 'high' : agent.intelligenceScore > 50 ? 'medium' : 'low'
    },
    generated: new Date().toISOString(),
    source: 'ruvector-intelligence'
  };

  const filename = path.join(OUTPUT_DIR, `${agent.id}.yaml`);
  const yaml = `# Auto-generated from RuVector Intelligence
# Intelligence Score: ${config.intelligenceScore}
# Based on ${config.basedOnPatterns} learned patterns

name: ${config.name}
displayName: ${config.displayName}
type: ${config.type}
description: ${config.description}

capabilities:
${config.capabilities.map(c => `  - ${c}`).join('\n')}

routing:
  priority: ${config.routing.priority}
  patterns:
${config.routing.patterns.slice(0, 5).map(p => `    - "${p}"`).join('\n') || '    - "*"'}

metadata:
  intelligenceScore: ${config.intelligenceScore}
  patternCount: ${config.basedOnPatterns}
  generated: "${config.generated}"
  source: ruvector-intelligence
`;

  fs.writeFileSync(filename, yaml);
  console.log(`✓ Generated ${agent.id}.yaml (score: ${config.intelligenceScore})`);
});

console.log(`\n✅ Generated ${qeAgentSuggestions.length} agent configs in ${OUTPUT_DIR}/`);

// Summary recommendations
console.log('\n' + '='.repeat(60));
console.log('💡 RECOMMENDATIONS');
console.log('='.repeat(60) + '\n');

console.log('Based on your intelligence data, prioritize these agents:\n');

const priorities = qeAgentSuggestions
  .filter(a => a.intelligenceScore > 10)
  .slice(0, 5);

priorities.forEach((agent, i) => {
  console.log(`${i + 1}. ${agent.name}`);
  console.log(`   • Intelligence score: ${Math.round(agent.intelligenceScore)}`);
  console.log(`   • Learned patterns: ${agent.patternCount}`);
  console.log(`   • Key capabilities: ${agent.capabilities.slice(0, 2).join(', ')}`);
  console.log();
});

console.log('These agents have the most learning data and should perform best.');
console.log('\nTo use in Claude Code, spawn with:');
console.log('  Task("description", "prompt", "qe-test-generator")');
