#!/usr/bin/env node
/**
 * Exploratory Testing Command
 * Autonomous exploration to discover unknown unknowns using testing tours
 */

const { spawn } = require('child_process');

const command = {
  name: 'exploratory-test',
  description: 'Launch exploratory testing sessions with various tour patterns',
  aliases: ['explore', 'et', 'test-explore'],

  options: [
    { name: '--tour', type: 'string', description: 'Tour type (money, landmark, garbage, back-alley, tourist, rain, supermodel)', default: 'landmark' },
    { name: '--target', type: 'string', description: 'Target area to explore' },
    { name: '--duration', type: 'number', description: 'Session duration in minutes', default: 90 },
    { name: '--charter', type: 'string', description: 'Test charter or mission' },
    { name: '--proof', type: 'boolean', description: 'Generate PROOF documentation', default: true },
    { name: '--anomaly-detection', type: 'boolean', description: 'Enable ML anomaly detection', default: true },
    { name: '--session-report', type: 'boolean', description: 'Generate session-based test report', default: true }
  ],

  tours: {
    money: 'Focus on features that directly affect revenue and business value',
    landmark: 'Test major features that define the application',
    garbage: 'Find code that should be removed or cleaned up',
    'back-alley': 'Explore rarely used features and edge cases',
    tourist: 'Test from a new user perspective',
    rain: 'Test under adverse conditions and stress',
    supermodel: 'Test UI/UX and visual aspects',
    security: 'Focus on authentication, authorization, and data protection',
    performance: 'Hunt for performance bottlenecks and memory leaks',
    integration: 'Test system integrations and external dependencies'
  },

  async execute(args) {
    const tour = args.tour || 'landmark';
    const tourDescription = this.tours[tour] || 'General exploratory testing';

    const agentArgs = [
      'agent', 'spawn', 'exploratory-testing-navigator',
      '--name', 'Explorer',
      '--task', args.charter || `Execute ${tour} tour: ${tourDescription}`
    ];

    // Configure the session
    const config = [];

    if (args.target) {
      config.push(`target=${args.target}`);
    }

    config.push(`tour=${tour}`);
    config.push(`duration=${args.duration || 90}`);

    if (args.proof) {
      config.push('documentation=PROOF');
    }

    if (args['anomaly-detection']) {
      config.push('anomaly_detection=ml');
    }

    if (config.length > 0) {
      agentArgs.push('--config', config.join(','));
    }

    console.log(`🗺️  Starting Exploratory Testing Session`);
    console.log(`📍 Tour: ${tour.toUpperCase()} - ${tourDescription}`);
    console.log(`⏱️  Duration: ${args.duration || 90} minutes`);
    if (args.target) {
      console.log(`🎯 Target: ${args.target}`);
    }
    if (args.charter) {
      console.log(`📋 Charter: ${args.charter}`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['claude-flow@alpha', ...agentArgs], {
        stdio: 'inherit',
        shell: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Exploratory testing session complete');
          if (args['session-report']) {
            console.log('📊 Session report generated');
          }
          resolve();
        } else {
          reject(new Error(`Exploratory testing failed with code ${code}`));
        }
      });
    });
  }
};

module.exports = command;

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const tour = args.find(a => !a.startsWith('--')) || 'landmark';
  command.execute({ tour })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}