#!/usr/bin/env node
/**
 * Requirements Analysis Command
 * Analyzes requirements for testability, ambiguity, and risk using RST heuristics
 */

const { spawn } = require('child_process');
const path = require('path');

const command = {
  name: 'requirements',
  description: 'Analyze requirements for testability, ambiguity, and risk',
  aliases: ['req', 'req-analyze'],

  options: [
    { name: '--file', type: 'string', description: 'Requirements file to analyze' },
    { name: '--heuristics', type: 'array', description: 'Heuristics to apply (SFDIPOT, FEW_HICCUPPS)', default: ['SFDIPOT'] },
    { name: '--output', type: 'string', description: 'Output format (markdown, json, charters)', default: 'markdown' },
    { name: '--risk-threshold', type: 'string', description: 'Risk threshold (low, medium, high)', default: 'medium' },
    { name: '--generate-charters', type: 'boolean', description: 'Generate test charters', default: true },
    { name: '--ambiguity-check', type: 'boolean', description: 'Check for ambiguous requirements', default: true }
  ],

  async execute(args) {
    const agentArgs = [
      'agent', 'spawn', 'requirements-explorer',
      '--name', 'Req-Analyzer',
      '--task', args.file ? `Analyze requirements from ${args.file}` : 'Analyze project requirements'
    ];

    // Add configuration based on options
    if (args.heuristics) {
      agentArgs.push('--config', `heuristics=${args.heuristics.join(',')}`);
    }

    if (args.output) {
      agentArgs.push('--output', args.output);
    }

    if (args['risk-threshold']) {
      agentArgs.push('--config', `risk_threshold=${args['risk-threshold']}`);
    }

    if (args['generate-charters']) {
      agentArgs.push('--config', 'generate_charters=true');
    }

    if (args['ambiguity-check']) {
      agentArgs.push('--config', 'ambiguity_detection=true');
    }

    console.log('🔍 Starting Requirements Analysis...');
    console.log('Using heuristics:', args.heuristics || ['SFDIPOT']);

    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['claude-flow@alpha', ...agentArgs], {
        stdio: 'inherit',
        shell: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Requirements analysis complete');
          resolve();
        } else {
          reject(new Error(`Requirements analysis failed with code ${code}`));
        }
      });
    });
  }
};

module.exports = command;

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  command.execute({ file: args[0] || null, heuristics: ['SFDIPOT', 'FEW_HICCUPPS'] })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}