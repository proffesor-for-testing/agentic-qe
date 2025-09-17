#!/usr/bin/env node
/**
 * Risk Assessment Command
 * Predictive risk assessment and test prioritization
 */

const { spawn } = require('child_process');

const command = {
  name: 'risk-assess',
  description: 'Assess risks and prioritize testing efforts',
  aliases: ['risk', 'risk-oracle', 'test-prioritize'],

  options: [
    { name: '--scope', type: 'string', description: 'Assessment scope (feature, release, system)', default: 'feature' },
    { name: '--target', type: 'string', description: 'Target to assess (file, directory, or feature name)' },
    { name: '--factors', type: 'array', description: 'Risk factors to evaluate', default: ['technical', 'business', 'context'] },
    { name: '--ml-prediction', type: 'boolean', description: 'Use ML for failure prediction', default: true },
    { name: '--historical', type: 'boolean', description: 'Include historical failure data', default: true },
    { name: '--threshold', type: 'string', description: 'Risk threshold for alerts (low, medium, high, critical)', default: 'medium' },
    { name: '--output', type: 'string', description: 'Output format (report, matrix, priorities)', default: 'report' },
    { name: '--mitigation', type: 'boolean', description: 'Generate mitigation strategies', default: true }
  ],

  riskLevels: {
    low: { color: '🟢', threshold: 0.25 },
    medium: { color: '🟡', threshold: 0.5 },
    high: { color: '🟠', threshold: 0.75 },
    critical: { color: '🔴', threshold: 1.0 }
  },

  async execute(args) {
    const scope = args.scope || 'feature';
    const target = args.target || 'current changes';

    const agentArgs = [
      'agent', 'spawn', 'risk-oracle',
      '--name', 'Risk-Analyzer',
      '--task', `Assess ${scope}-level risks for ${target}`
    ];

    // Configure risk assessment
    const config = [
      `scope=${scope}`,
      `threshold=${args.threshold || 'medium'}`
    ];

    if (args.factors) {
      config.push(`factors=${args.factors.join(',')}`);
    }

    if (args['ml-prediction']) {
      config.push('ml_prediction=true');
    }

    if (args.historical) {
      config.push('use_historical_data=true');
    }

    if (args.mitigation) {
      config.push('generate_mitigation=true');
    }

    config.push(`output_format=${args.output || 'report'}`);

    agentArgs.push('--config', config.join(','));

    console.log('🔮 Starting Risk Assessment');
    console.log(`📊 Scope: ${scope.toUpperCase()}`);
    console.log(`🎯 Target: ${target}`);
    console.log(`📈 Risk Factors: ${args.factors ? args.factors.join(', ') : 'technical, business, context'}`);

    if (args['ml-prediction']) {
      console.log('🤖 ML Prediction: ENABLED');
    }

    console.log(`\n⚠️  Risk Thresholds:`);
    Object.entries(this.riskLevels).forEach(([level, info]) => {
      console.log(`  ${info.color} ${level.toUpperCase()}: ${info.threshold * 100}%`);
    });

    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['claude-flow@alpha', ...agentArgs], {
        stdio: 'inherit',
        shell: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Risk assessment complete');

          if (args.output === 'priorities') {
            console.log('📋 Test priorities generated');
          }

          if (args.mitigation) {
            console.log('🛡️  Mitigation strategies provided');
          }

          resolve();
        } else {
          reject(new Error(`Risk assessment failed with code ${code}`));
        }
      });
    });
  }
};

module.exports = command;

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('--')) || '.';
  command.execute({ target, scope: 'release' })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}