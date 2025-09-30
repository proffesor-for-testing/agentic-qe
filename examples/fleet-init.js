#!/usr/bin/env node

/**
 * Fleet Initialization Example
 * Demonstrates how to initialize and configure an AQE Fleet
 */

const { FleetManager } = require('../dist/core/FleetManager');
const { Logger } = require('../dist/utils/Logger');

async function initializeFleet() {
  const logger = Logger.getInstance();

  try {
    console.log('🚀 Initializing Agentic QE Fleet...\n');

    // Basic fleet configuration
    const config = {
      fleet: {
        id: 'demo-fleet',
        name: 'Demo Quality Engineering Fleet',
        maxAgents: 5
      },
      agents: [
        {
          type: 'test-executor',
          count: 2,
          config: {
            frameworks: ['jest', 'cypress'],
            maxParallelTests: 2
          }
        },
        {
          type: 'quality-analyzer',
          count: 1,
          config: {
            tools: ['eslint', 'sonarqube'],
            thresholds: {
              coverage: 80,
              complexity: 10
            }
          }
        }
      ],
      database: {
        type: 'sqlite',
        path: './data/demo-fleet.db'
      }
    };

    console.log('📋 Fleet Configuration:');
    console.log(`  - Fleet ID: ${config.fleet.id}`);
    console.log(`  - Max Agents: ${config.fleet.maxAgents}`);
    console.log(`  - Agent Types: ${config.agents.map(a => a.type).join(', ')}`);
    console.log(`  - Database: ${config.database.type}\n`);

    // Create fleet manager
    const fleetManager = new FleetManager(config);

    console.log('🔧 Initializing fleet manager...');
    await fleetManager.initialize();

    console.log('✅ Fleet initialized successfully!');
    console.log('📊 Fleet Status:', fleetManager.getStatus());

    // Clean shutdown
    await fleetManager.stop();
    console.log('🛑 Demo completed successfully');

  } catch (error) {
    console.error('❌ Fleet initialization failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeFleet();
}

module.exports = { initializeFleet };