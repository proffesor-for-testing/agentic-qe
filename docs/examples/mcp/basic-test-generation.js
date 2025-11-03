/**
 * Basic Test Generation Example
 *
 * Demonstrates how to use AQE MCP tools to generate tests
 * for a TypeScript project.
 */

/**
 * Step 1: Initialize Fleet
 */
async function initializeFleet() {
  console.log('🚀 Initializing AQE Fleet...');

  const fleet = await mcp__agentic_qe__fleet_init({
    config: {
      topology: 'hierarchical',
      maxAgents: 10,
      testingFocus: ['unit', 'integration'],
      environments: ['development'],
      frameworks: ['jest']
    },
    projectContext: {
      repositoryUrl: 'https://github.com/company/project',
      language: 'typescript',
      buildSystem: 'npm'
    }
  });

  console.log(`✅ Fleet initialized: ${fleet.fleetId}`);
  console.log(`   Topology: ${fleet.topology}`);
  console.log(`   Capacity: ${fleet.maxAgents} agents`);

  return fleet;
}

/**
 * Step 2: Spawn Test Generator Agent
 */
async function spawnTestGenerator(fleetId) {
  console.log('\n🤖 Spawning test generator agent...');

  const agent = await mcp__agentic_qe__agent_spawn({
    spec: {
      type: 'test-generator',
      name: 'test-gen-001',
      capabilities: [
        'unit-tests',
        'integration-tests',
        'data-synthesis',
        'edge-case-detection'
      ],
      resources: {
        memory: 512,
        cpu: 2,
        storage: 1024
      }
    },
    fleetId
  });

  console.log(`✅ Agent spawned: ${agent.name}`);
  console.log(`   Type: ${agent.type}`);
  console.log(`   Status: ${agent.status}`);
  console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);

  return agent;
}

/**
 * Step 3: Generate Tests
 */
async function generateTests(agentId) {
  console.log('\n📝 Generating tests...');

  const result = await mcp__agentic_qe__test_generate({
    spec: {
      type: 'unit',
      sourceCode: {
        repositoryUrl: 'https://github.com/company/project',
        branch: 'develop',
        language: 'typescript',
        testPatterns: [
          'src/**/*.ts',
          '!src/**/*.test.ts',
          '!src/**/*.spec.ts'
        ]
      },
      coverageTarget: 85,
      frameworks: ['jest'],
      synthesizeData: true
    },
    agentId
  });

  console.log(`✅ Test generation complete!`);
  console.log(`   Generated tests: ${result.generatedTests}`);
  console.log(`   Test files: ${result.testFiles.length}`);
  console.log(`   Estimated coverage: ${result.estimatedCoverage}%`);
  console.log(`   Generation time: ${result.generationTime}ms`);

  // Show test files
  console.log('\n📄 Generated test files:');
  result.testFiles.slice(0, 5).forEach(file => {
    console.log(`   - ${file.path} (${file.testCount} tests, ${file.coverage}% coverage)`);
  });
  if (result.testFiles.length > 5) {
    console.log(`   ... and ${result.testFiles.length - 5} more files`);
  }

  return result;
}

/**
 * Step 4: Store Results for Other Agents
 */
async function storeResults(testResults) {
  console.log('\n💾 Storing results in memory...');

  await mcp__agentic_qe__memory_store({
    key: 'aqe/test-plan/generated',
    value: {
      testFiles: testResults.testFiles,
      generatedTests: testResults.generatedTests,
      estimatedCoverage: testResults.estimatedCoverage,
      metadata: testResults.metadata,
      timestamp: Date.now()
    },
    namespace: 'coordination',
    ttl: 86400, // 24 hours
    persist: true
  });

  console.log('✅ Results stored in coordination namespace');
  console.log('   Key: aqe/test-plan/generated');
  console.log('   TTL: 24 hours');
}

/**
 * Main Execution
 */
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('     AQE MCP Tools - Basic Test Generation Example      ');
    console.log('═══════════════════════════════════════════════════════\n');

    // Step 1: Initialize fleet
    const fleet = await initializeFleet();

    // Step 2: Spawn test generator
    const agent = await spawnTestGenerator(fleet.fleetId);

    // Step 3: Generate tests
    const testResults = await generateTests(agent.agentId);

    // Step 4: Store results
    await storeResults(testResults);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Test generation workflow completed successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

    return {
      success: true,
      fleet,
      agent,
      testResults
    };
  } catch (error) {
    console.error('\n❌ Error during test generation:');
    console.error(`   Message: ${error.message}`);

    if (error.suggestion) {
      console.error(`   Suggestion: ${error.suggestion}`);
    }

    if (error.context) {
      console.error(`   Context:`, error.context);
    }

    throw error;
  }
}

/**
 * Run if executed directly
 */
if (require.main === module) {
  main()
    .then(result => {
      console.log('\n✅ Example completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Example failed:', error);
      process.exit(1);
    });
}

module.exports = { main };
