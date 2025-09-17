#!/usr/bin/env node
/**
 * Deployment Guardian Command
 * Ensures safe deployments through progressive validation
 */

const { spawn } = require('child_process');

const command = {
  name: 'deploy-guard',
  description: 'Guard deployments with progressive rollout and automated rollback',
  aliases: ['deploy-safe', 'canary', 'progressive-deploy'],

  options: [
    { name: '--strategy', type: 'string', description: 'Deployment strategy (canary, blue-green, feature-flag, rolling)', default: 'canary' },
    { name: '--version', type: 'string', description: 'Version to deploy' },
    { name: '--environment', type: 'string', description: 'Target environment (staging, production)', default: 'staging' },
    { name: '--stages', type: 'array', description: 'Rollout stages (e.g., 1%,5%,25%,50%,100%)', default: ['1%', '5%', '25%', '50%', '100%'] },
    { name: '--error-threshold', type: 'number', description: 'Error rate threshold for rollback (0-1)', default: 0.02 },
    { name: '--latency-threshold', type: 'number', description: 'Latency increase threshold (multiplier)', default: 1.5 },
    { name: '--smoke-tests', type: 'boolean', description: 'Run smoke tests', default: true },
    { name: '--dry-run', type: 'boolean', description: 'Simulate deployment without making changes', default: false }
  ],

  strategies: {
    canary: 'Gradual rollout with statistical analysis',
    'blue-green': 'Zero-downtime switch between environments',
    'feature-flag': 'Feature toggles for controlled release',
    rolling: 'Sequential update of instances',
    shadow: 'Traffic mirroring for validation'
  },

  async execute(args) {
    const strategy = args.strategy || 'canary';
    const environment = args.environment || 'staging';
    const isDryRun = args['dry-run'];

    const agentArgs = [
      'agent', 'spawn', 'deployment-guardian',
      '--name', 'Deploy-Guard',
      '--task', isDryRun
        ? `Create deployment plan for ${args.version || 'current version'} to ${environment}`
        : `Deploy ${args.version || 'current version'} to ${environment} using ${strategy} strategy`
    ];

    // Configure deployment
    const config = [
      `strategy=${strategy}`,
      `environment=${environment}`,
      `error_threshold=${args['error-threshold'] || 0.02}`,
      `latency_threshold=${args['latency-threshold'] || 1.5}`
    ];

    if (args.stages) {
      config.push(`stages=${args.stages.join(',')}`);
    }

    if (args['smoke-tests']) {
      config.push('smoke_tests=true');
    }

    if (isDryRun) {
      config.push('dry_run=true');
    }

    agentArgs.push('--config', config.join(','));

    console.log(`🛡️  ${isDryRun ? 'Planning' : 'Starting'} Deployment Guardian`);
    console.log(`📦 Version: ${args.version || 'current'}`);
    console.log(`🌍 Environment: ${environment.toUpperCase()}`);
    console.log(`🚀 Strategy: ${strategy.toUpperCase()} - ${this.strategies[strategy]}`);

    if (strategy === 'canary' && args.stages) {
      console.log(`📈 Rollout Stages: ${args.stages.join(' → ')}`);
    }

    console.log(`\n⚠️  Rollback Thresholds:`);
    console.log(`  • Error Rate: >${(args['error-threshold'] || 0.02) * 100}%`);
    console.log(`  • Latency: >${args['latency-threshold'] || 1.5}x baseline`);

    if (isDryRun) {
      console.log('\n🔍 DRY RUN MODE - No actual deployment will occur');
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['claude-flow@alpha', ...agentArgs], {
        stdio: 'inherit',
        shell: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          if (isDryRun) {
            console.log('✅ Deployment plan created successfully');
          } else {
            console.log('✅ Deployment completed successfully');
          }
          resolve();
        } else {
          console.log('⚠️  Deployment rolled back due to issues');
          reject(new Error(`Deployment failed with code ${code}`));
        }
      });
    });
  }
};

module.exports = command;

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  command.execute({
    strategy: 'canary',
    'dry-run': args.includes('--dry-run')
  })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}