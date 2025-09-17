#!/usr/bin/env node
/**
 * MCP Server Configuration Script
 *
 * Helps users configure the MCP server for optimal performance
 * and manage response sizes to prevent context overflow.
 */

const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n🔧 QE Framework MCP Server Configuration\n');
  console.log('This script will help you configure the MCP server to optimize response sizes.');
  console.log('Large responses can quickly fill up Claude Code\'s context window.\n');

  // Check current configuration
  const configPath = path.join(__dirname, '..', 'config', 'mcp-config.js');
  const envPath = path.join(__dirname, '..', '.env');

  console.log('Current Settings:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Check environment variables
  const currentSettings = {
    summaryMode: process.env.QE_MCP_SUMMARY_MODE !== 'false',
    maxTokens: process.env.QE_MCP_MAX_RESPONSE_TOKENS || '2000',
    maxLength: process.env.QE_MCP_MAX_RESPONSE_LENGTH || '5000',
    lightweight: process.env.QE_MCP_LIGHTWEIGHT === 'true',
    analysisDepth: process.env.QE_MCP_ANALYSIS_DEPTH || 'standard'
  };

  console.log(`Summary Mode:     ${currentSettings.summaryMode ? '✅ ON (concise)' : '❌ OFF (verbose)'}`);
  console.log(`Max Tokens:       ${currentSettings.maxTokens}`);
  console.log(`Max Length:       ${currentSettings.maxLength} chars`);
  console.log(`Lightweight:      ${currentSettings.lightweight ? '✅ YES' : '❌ NO'}`);
  console.log(`Analysis Depth:   ${currentSettings.analysisDepth}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Ask for configuration preference
  console.log('Configuration Options:');
  console.log('1. 🚀 Ultra-Concise (Recommended for Claude Code)');
  console.log('2. ⚡ Balanced (Moderate detail)');
  console.log('3. 📊 Detailed (Full analysis - may cause context issues)');
  console.log('4. 🛠️  Custom (Configure each setting)');
  console.log('5. ❌ Exit without changes\n');

  const choice = await question('Select configuration [1-5]: ');

  let newConfig = {};

  switch (choice.trim()) {
    case '1':
      // Ultra-Concise Mode
      newConfig = {
        QE_MCP_SUMMARY_MODE: 'true',
        QE_MCP_MAX_RESPONSE_TOKENS: '1000',
        QE_MCP_MAX_RESPONSE_LENGTH: '3000',
        QE_MCP_LIGHTWEIGHT: 'true',
        QE_MCP_ANALYSIS_DEPTH: 'shallow',
        QE_MCP_MAX_SWARM_AGENTS: '3'
      };
      console.log('\n✅ Ultra-Concise mode selected');
      break;

    case '2':
      // Balanced Mode
      newConfig = {
        QE_MCP_SUMMARY_MODE: 'true',
        QE_MCP_MAX_RESPONSE_TOKENS: '2000',
        QE_MCP_MAX_RESPONSE_LENGTH: '5000',
        QE_MCP_LIGHTWEIGHT: 'false',
        QE_MCP_ANALYSIS_DEPTH: 'standard',
        QE_MCP_MAX_SWARM_AGENTS: '5'
      };
      console.log('\n✅ Balanced mode selected');
      break;

    case '3':
      // Detailed Mode
      newConfig = {
        QE_MCP_SUMMARY_MODE: 'false',
        QE_MCP_MAX_RESPONSE_TOKENS: '5000',
        QE_MCP_MAX_RESPONSE_LENGTH: '15000',
        QE_MCP_LIGHTWEIGHT: 'false',
        QE_MCP_ANALYSIS_DEPTH: 'deep',
        QE_MCP_MAX_SWARM_AGENTS: '10'
      };
      console.log('\n⚠️  Detailed mode selected (may cause context overflow)');
      break;

    case '4':
      // Custom Configuration
      console.log('\nCustom Configuration:');

      const summaryMode = await question('Enable summary mode? [y/N]: ');
      newConfig.QE_MCP_SUMMARY_MODE = summaryMode.toLowerCase() === 'y' ? 'true' : 'false';

      const maxTokens = await question(`Max tokens per response [${currentSettings.maxTokens}]: `);
      newConfig.QE_MCP_MAX_RESPONSE_TOKENS = maxTokens || currentSettings.maxTokens;

      const maxLength = await question(`Max response length in chars [${currentSettings.maxLength}]: `);
      newConfig.QE_MCP_MAX_RESPONSE_LENGTH = maxLength || currentSettings.maxLength;

      const lightweight = await question('Enable lightweight mode? [y/N]: ');
      newConfig.QE_MCP_LIGHTWEIGHT = lightweight.toLowerCase() === 'y' ? 'true' : 'false';

      const depth = await question('Analysis depth (shallow/standard/deep) [standard]: ');
      newConfig.QE_MCP_ANALYSIS_DEPTH = depth || 'standard';

      const maxAgents = await question('Max agents in swarm [5]: ');
      newConfig.QE_MCP_MAX_SWARM_AGENTS = maxAgents || '5';

      console.log('\n✅ Custom configuration set');
      break;

    default:
      console.log('\n❌ No changes made');
      rl.close();
      return;
  }

  // Save configuration
  console.log('\nSaving configuration...\n');

  // Create or update .env file
  let envContent = '';
  if (await fs.pathExists(envPath)) {
    envContent = await fs.readFile(envPath, 'utf-8');

    // Remove existing QE_MCP_ variables
    envContent = envContent.split('\n')
      .filter(line => !line.startsWith('QE_MCP_'))
      .join('\n');
  }

  // Add new configuration
  const newEnvVars = Object.entries(newConfig)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  envContent = envContent.trim() + '\n\n# QE Framework MCP Configuration\n' + newEnvVars + '\n';
  await fs.writeFile(envPath, envContent);

  console.log('Configuration saved to .env file');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Show usage tips
  console.log('💡 Tips for using QE MCP Server:\n');
  console.log('1. Restart the MCP server for changes to take effect:');
  console.log('   npm run mcp:restart\n');

  console.log('2. If you still get large responses, try:');
  console.log('   - Using specific agents instead of swarms');
  console.log('   - Setting analysisDepth to "shallow"');
  console.log('   - Reducing maxAgents in swarm operations\n');

  console.log('3. For debugging, temporarily disable summary mode:');
  console.log('   export QE_MCP_SUMMARY_MODE=false\n');

  console.log('4. Monitor response sizes in Claude Code:');
  console.log('   Watch for "Large MCP response" warnings\n');

  rl.close();
}

// Run the configuration script
main().catch(console.error);