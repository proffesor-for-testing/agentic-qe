#!/usr/bin/env node
/**
 * QE Swarm Command
 * Orchestrate multiple QE agents for comprehensive quality assurance
 */

const { spawn } = require('child_process');

const command = {
  name: 'qe-swarm',
  description: 'Deploy a swarm of QE agents for comprehensive quality engineering',
  aliases: ['quality-swarm', 'test-swarm', 'qe-orchestrate'],

  options: [
    { name: '--pipeline', type: 'string', description: 'QE pipeline type (full, shift-left, risk-driven, continuous)', default: 'full' },
    { name: '--agents', type: 'array', description: 'Specific agents to include' },
    { name: '--target', type: 'string', description: 'Target for quality assessment' },
    { name: '--phase', type: 'string', description: 'Development phase (requirements, development, testing, deployment, production)' },
    { name: '--topology', type: 'string', description: 'Swarm topology (hierarchical, mesh, adaptive)', default: 'adaptive' },
    { name: '--max-agents', type: 'number', description: 'Maximum number of concurrent agents', default: 6 },
    { name: '--chain', type: 'boolean', description: 'Chain agents sequentially', default: false },
    { name: '--report', type: 'boolean', description: 'Generate comprehensive quality report', default: true }
  ],

  pipelines: {
    full: {
      name: 'Full Quality Pipeline',
      agents: ['requirements-explorer', 'tdd-pair-programmer', 'exploratory-testing-navigator', 'risk-oracle', 'deployment-guardian', 'production-observer'],
      description: 'Complete quality engineering from requirements to production'
    },
    'shift-left': {
      name: 'Shift-Left Quality',
      agents: ['requirements-explorer', 'tdd-pair-programmer', 'deployment-guardian'],
      description: 'Early quality focus on requirements and development'
    },
    'risk-driven': {
      name: 'Risk-Driven Testing',
      agents: ['risk-oracle', 'exploratory-testing-navigator', 'tdd-pair-programmer'],
      description: 'Focus testing efforts based on risk assessment'
    },
    continuous: {
      name: 'Continuous Quality',
      agents: ['production-observer', 'deployment-guardian', 'risk-oracle'],
      description: 'Continuous monitoring and safe deployment'
    },
    exploratory: {
      name: 'Exploratory Focus',
      agents: ['exploratory-testing-navigator', 'requirements-explorer', 'production-observer'],
      description: 'Deep exploration and discovery testing'
    }
  },

  async execute(args) {
    const pipeline = args.pipeline || 'full';
    const pipelineConfig = this.pipelines[pipeline];
    const agents = args.agents || pipelineConfig.agents;
    const topology = args.topology || 'adaptive';

    console.log('🐝 Initializing QE Swarm');
    console.log(`📋 Pipeline: ${pipelineConfig.name}`);
    console.log(`📝 ${pipelineConfig.description}`);
    console.log(`🔗 Topology: ${topology.toUpperCase()}`);
    console.log(`👥 Agents: ${agents.length}`);

    // Initialize swarm
    const swarmArgs = [
      'swarm', 'init',
      '--topology', topology,
      '--max-agents', args['max-agents'] || 6,
      '--agents', agents.join(',')
    ];

    if (args.target) {
      swarmArgs.push('--target', args.target);
    }

    console.log('\n📊 QE Pipeline Stages:');
    console.log('════════════════════════════════════════');

    const stages = [
      { emoji: '📋', name: 'Requirements', agent: 'requirements-explorer', active: agents.includes('requirements-explorer') },
      { emoji: '🔴🟢', name: 'TDD Development', agent: 'tdd-pair-programmer', active: agents.includes('tdd-pair-programmer') },
      { emoji: '🗺️', name: 'Exploration', agent: 'exploratory-testing-navigator', active: agents.includes('exploratory-testing-navigator') },
      { emoji: '🔮', name: 'Risk Assessment', agent: 'risk-oracle', active: agents.includes('risk-oracle') },
      { emoji: '🛡️', name: 'Deployment', agent: 'deployment-guardian', active: agents.includes('deployment-guardian') },
      { emoji: '👁️', name: 'Production', agent: 'production-observer', active: agents.includes('production-observer') }
    ];

    stages.forEach((stage, index) => {
      const status = stage.active ? '✅' : '⭕';
      const arrow = index < stages.length - 1 ? ' → ' : '';
      process.stdout.write(`${status} ${stage.emoji} ${stage.name}${arrow}`);
    });
    console.log('\n════════════════════════════════════════\n');

    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['claude-flow@alpha', ...swarmArgs], {
        stdio: 'inherit',
        shell: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ QE Swarm execution complete');

          if (args.report) {
            console.log('📊 Generating quality report...');

            // Generate comprehensive report
            const reportProc = spawn('npx', ['claude-flow@alpha', 'report', 'quality', '--format', 'markdown'], {
              stdio: 'inherit',
              shell: true
            });

            reportProc.on('close', (reportCode) => {
              if (reportCode === 0) {
                console.log('📄 Quality report generated: quality-report.md');
              }
              resolve();
            });
          } else {
            resolve();
          }
        } else {
          reject(new Error(`QE Swarm failed with code ${code}`));
        }
      });
    });
  },

  // Helper to show available pipelines
  listPipelines() {
    console.log('📋 Available QE Pipelines:\n');
    Object.entries(this.pipelines).forEach(([key, pipeline]) => {
      console.log(`  ${key}:`);
      console.log(`    ${pipeline.name}`);
      console.log(`    ${pipeline.description}`);
      console.log(`    Agents: ${pipeline.agents.join(', ')}\n`);
    });
  }
};

module.exports = command;

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    command.listPipelines();
  } else {
    const pipeline = args.find(a => !a.startsWith('--')) || 'full';
    command.execute({ pipeline })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  }
}