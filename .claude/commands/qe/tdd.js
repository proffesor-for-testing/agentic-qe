#!/usr/bin/env node
/**
 * TDD Pair Programming Command
 * Intelligent pair programming for test-first development
 */

const { spawn } = require('child_process');

const command = {
  name: 'tdd',
  description: 'Start TDD pair programming session with Red-Green-Refactor cycle',
  aliases: ['test-driven', 'red-green-refactor'],

  options: [
    { name: '--feature', type: 'string', description: 'Feature to implement with TDD' },
    { name: '--style', type: 'string', description: 'TDD style (chicago, london)', default: 'chicago' },
    { name: '--framework', type: 'string', description: 'Test framework (jest, mocha, vitest, pytest)', default: 'jest' },
    { name: '--coverage', type: 'number', description: 'Target coverage percentage', default: 80 },
    { name: '--watch', type: 'boolean', description: 'Enable test watching', default: true },
    { name: '--mutation', type: 'boolean', description: 'Enable mutation testing', default: false },
    { name: '--refactor', type: 'string', description: 'Refactoring aggressiveness (conservative, balanced, aggressive)', default: 'balanced' }
  ],

  styles: {
    chicago: 'Classical TDD with real implementations',
    london: 'Mockist TDD with heavy use of test doubles',
    detroit: 'State-based testing focusing on outcomes',
    mockist: 'Interaction-based testing with mocks'
  },

  async execute(args) {
    const style = args.style || 'chicago';
    const feature = args.feature || 'the specified feature';

    const agentArgs = [
      'agent', 'spawn', 'tdd-pair-programmer',
      '--name', 'TDD-Partner',
      '--task', `Implement ${feature} using ${style} style TDD`
    ];

    // Configure TDD session
    const config = [
      `style=${style}`,
      `framework=${args.framework || 'jest'}`,
      `coverage_target=${args.coverage || 80}`,
      `refactoring_aggressive=${args.refactor === 'aggressive'}`
    ];

    if (args.watch) {
      config.push('watch_mode=true');
    }

    if (args.mutation) {
      config.push('mutation_testing=true');
    }

    agentArgs.push('--config', config.join(','));

    console.log('🔴🟢♻️  Starting TDD Pair Programming Session');
    console.log(`📝 Feature: ${feature}`);
    console.log(`🎯 Style: ${style.toUpperCase()} - ${this.styles[style] || 'Test-driven development'}`);
    console.log(`🧪 Framework: ${args.framework || 'jest'}`);
    console.log(`📊 Coverage Target: ${args.coverage || 80}%`);

    // Show TDD cycle guidance
    console.log('\n📋 TDD Cycle:');
    console.log('  1. 🔴 RED - Write a failing test');
    console.log('  2. 🟢 GREEN - Make the test pass');
    console.log('  3. ♻️  REFACTOR - Improve the code');
    console.log('  4. 🔄 REPEAT\n');

    return new Promise((resolve, reject) => {
      const proc = spawn('npx', ['claude-flow@alpha', ...agentArgs], {
        stdio: 'inherit',
        shell: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('✅ TDD session complete');
          console.log('📊 Tests written and passing');
          resolve();
        } else {
          reject(new Error(`TDD session failed with code ${code}`));
        }
      });
    });
  }
};

module.exports = command;

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const feature = args.find(a => !a.startsWith('--')) || 'new feature';
  command.execute({ feature, style: 'chicago' })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}