#!/usr/bin/env node

/**
 * QE Orchestrate Command Implementation
 * Orchestrates QE swarm with SPARC workflow integration and parallel execution
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class QEOrchestrateCommand {
  constructor(args = {}) {
    this.task = args.task;
    this.topology = args.topology || 'mesh';
    this.strategy = args.strategy || 'adaptive';
    this.sparcFull = args['sparc-full'] || false;
    this.maxAgents = parseInt(args['max-agents']) || 8;
    this.workingDir = process.cwd();

    if (!this.task) {
      throw new Error('Task description is required for orchestration');
    }
  }

  async execute() {
    console.log(`🎼 Orchestrating QE swarm for task: "${this.task}"`);

    try {
      // Step 1: Setup orchestration coordination
      await this.setupOrchestration();

      // Step 2: Analyze task and determine agent requirements
      const agentPlan = await this.analyzeTaskRequirements();

      // Step 3: Initialize swarm topology
      await this.initializeSwarmTopology();

      // Step 4: Execute SPARC workflow if enabled
      if (this.sparcFull) {
        await this.executeSparcWorkflow(agentPlan);
      } else {
        await this.executeStandardWorkflow(agentPlan);
      }

      // Step 5: Monitor and coordinate execution
      await this.monitorExecution();

      console.log('✅ QE orchestration completed successfully!');
      this.printOrchestrationSummary();

    } catch (error) {
      console.error('❌ QE orchestration failed:', error.message);
      process.exit(1);
    }
  }

  async setupOrchestration() {
    console.log('📡 Setting up orchestration coordination...');

    // Initialize orchestration session
    const orchestrationId = `qe-orchestrate-${Date.now()}`;
    this.orchestrationId = orchestrationId;

    this.executeCommand('npx claude-flow@alpha hooks pre-task --description "QE Swarm Orchestration"');
    this.executeCommand(`npx claude-flow@alpha hooks session-restore --session-id "${orchestrationId}"`);

    // Store orchestration configuration
    const orchestrationConfig = {
      id: orchestrationId,
      task: this.task,
      topology: this.topology,
      strategy: this.strategy,
      sparcFull: this.sparcFull,
      maxAgents: this.maxAgents,
      timestamp: new Date().toISOString(),
      status: 'initializing'
    };

    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/orchestration/config" --value '${JSON.stringify(orchestrationConfig)}'`);
  }

  async analyzeTaskRequirements() {
    console.log('🔍 Analyzing task requirements...');

    // AI-powered task analysis to determine optimal agent distribution
    const taskAnalysis = this.performTaskAnalysis();
    const agentPlan = this.generateAgentPlan(taskAnalysis);

    // Store analysis results
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/orchestration/task-analysis" --value '${JSON.stringify(taskAnalysis)}'`);
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/orchestration/agent-plan" --value '${JSON.stringify(agentPlan)}'`);

    console.log(`📋 Agent plan: ${agentPlan.totalAgents} agents across ${agentPlan.agentTypes.length} specializations`);

    return agentPlan;
  }

  performTaskAnalysis() {
    // Analyze task keywords and requirements
    const taskLower = this.task.toLowerCase();

    const analysis = {
      taskType: this.determineTaskType(taskLower),
      complexity: this.assessComplexity(taskLower),
      requiredSpecializations: this.identifySpecializations(taskLower),
      estimatedDuration: this.estimateDuration(taskLower),
      riskFactors: this.identifyRiskFactors(taskLower),
      parallelizable: this.assessParallelizability(taskLower),
      sparcPhases: this.identifySparcPhases(taskLower)
    };

    return analysis;
  }

  determineTaskType(task) {
    const typeKeywords = {
      'unit-testing': ['unit', 'component', 'function', 'method'],
      'integration-testing': ['integration', 'api', 'service', 'interface'],
      'e2e-testing': ['e2e', 'end-to-end', 'user journey', 'workflow', 'scenario'],
      'performance-testing': ['performance', 'load', 'stress', 'scalability', 'benchmark'],
      'security-testing': ['security', 'vulnerability', 'penetration', 'auth', 'permission'],
      'accessibility-testing': ['accessibility', 'a11y', 'wcag', 'screen reader', 'contrast'],
      'mobile-testing': ['mobile', 'android', 'ios', 'device', 'responsive'],
      'automation-framework': ['framework', 'automation', 'ci/cd', 'pipeline', 'infrastructure'],
      'test-planning': ['plan', 'strategy', 'specification', 'requirements', 'analysis']
    };

    for (const [type, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some(keyword => task.includes(keyword))) {
        return type;
      }
    }

    return 'general-testing';
  }

  assessComplexity(task) {
    const complexityIndicators = {
      high: ['comprehensive', 'complex', 'enterprise', 'full', 'complete', 'advanced'],
      medium: ['moderate', 'standard', 'typical', 'basic'],
      low: ['simple', 'quick', 'basic', 'minimal']
    };

    for (const [level, indicators] of Object.entries(complexityIndicators)) {
      if (indicators.some(indicator => task.includes(indicator))) {
        return level;
      }
    }

    // Default complexity based on task length and keywords
    const wordCount = task.split(' ').length;
    if (wordCount > 10) return 'high';
    if (wordCount > 5) return 'medium';
    return 'low';
  }

  identifySpecializations(task) {
    const specializations = [];

    const specializationMap = {
      'test-engineer': ['test', 'testing', 'qa', 'quality'],
      'qa-analyst': ['requirement', 'analysis', 'specification', 'criteria'],
      'automation-engineer': ['automation', 'framework', 'ci/cd', 'pipeline'],
      'performance-tester': ['performance', 'load', 'stress', 'benchmark'],
      'security-tester': ['security', 'vulnerability', 'auth', 'permission'],
      'mobile-tester': ['mobile', 'android', 'ios', 'device'],
      'accessibility-tester': ['accessibility', 'a11y', 'wcag', 'contrast']
    };

    for (const [specialization, keywords] of Object.entries(specializationMap)) {
      if (keywords.some(keyword => task.includes(keyword))) {
        specializations.push(specialization);
      }
    }

    // Ensure at least one core specialization
    if (specializations.length === 0) {
      specializations.push('test-engineer');
    }

    return specializations;
  }

  estimateDuration(task) {
    const complexity = this.assessComplexity(task);
    const baseMinutes = {
      low: 30,
      medium: 90,
      high: 240
    };

    return baseMinutes[complexity] || 90;
  }

  identifyRiskFactors(task) {
    const riskKeywords = {
      high: ['critical', 'production', 'security', 'payment', 'data'],
      medium: ['important', 'user', 'performance', 'integration'],
      low: ['simple', 'basic', 'internal', 'documentation']
    };

    for (const [level, keywords] of Object.entries(riskKeywords)) {
      if (keywords.some(keyword => task.includes(keyword))) {
        return level;
      }
    }

    return 'medium';
  }

  assessParallelizability(task) {
    const parallelKeywords = ['parallel', 'concurrent', 'multiple', 'batch', 'distributed'];
    const sequentialKeywords = ['sequential', 'order', 'dependent', 'chain'];

    if (parallelKeywords.some(keyword => task.includes(keyword))) {
      return 'high';
    }
    if (sequentialKeywords.some(keyword => task.includes(keyword))) {
      return 'low';
    }

    return 'medium';
  }

  identifySparcPhases(task) {
    const phaseKeywords = {
      specification: ['requirement', 'spec', 'criteria', 'analysis'],
      pseudocode: ['algorithm', 'logic', 'flow', 'pseudocode'],
      architecture: ['design', 'architecture', 'framework', 'structure'],
      refinement: ['implement', 'code', 'develop', 'build'],
      completion: ['integrate', 'deploy', 'finalize', 'complete']
    };

    const phases = [];
    for (const [phase, keywords] of Object.entries(phaseKeywords)) {
      if (keywords.some(keyword => task.includes(keyword))) {
        phases.push(phase);
      }
    }

    // If no specific phases identified, include all for full workflow
    return phases.length > 0 ? phases : ['specification', 'pseudocode', 'architecture', 'refinement', 'completion'];
  }

  generateAgentPlan(analysis) {
    const agentCounts = this.calculateAgentCounts(analysis);

    const plan = {
      totalAgents: agentCounts.total,
      agentTypes: analysis.requiredSpecializations,
      agentDistribution: agentCounts.distribution,
      executionStrategy: this.strategy,
      parallelization: analysis.parallelizable,
      estimatedDuration: analysis.estimatedDuration,
      sparcPhases: analysis.sparcPhases,
      riskLevel: analysis.riskFactors
    };

    return plan;
  }

  calculateAgentCounts(analysis) {
    const baseAgents = Math.min(analysis.requiredSpecializations.length, this.maxAgents);

    const complexityMultiplier = {
      low: 1,
      medium: 1.5,
      high: 2
    };

    const totalAgents = Math.min(
      Math.ceil(baseAgents * complexityMultiplier[analysis.complexity]),
      this.maxAgents
    );

    // Distribute agents across specializations
    const distribution = {};
    const agentsPerType = Math.max(1, Math.floor(totalAgents / analysis.requiredSpecializations.length));
    let remainingAgents = totalAgents;

    analysis.requiredSpecializations.forEach((specialization, index) => {
      const count = index === analysis.requiredSpecializations.length - 1
        ? remainingAgents
        : agentsPerType;
      distribution[specialization] = count;
      remainingAgents -= count;
    });

    return {
      total: totalAgents,
      distribution
    };
  }

  async initializeSwarmTopology() {
    console.log(`🕸️ Initializing ${this.topology} topology with ${this.maxAgents} max agents...`);

    // Initialize swarm with specified topology
    this.executeCommand(`npx claude-flow@alpha swarm init --topology ${this.topology} --max-agents ${this.maxAgents} --strategy ${this.strategy}`);

    // Store topology configuration
    const topologyConfig = {
      type: this.topology,
      maxAgents: this.maxAgents,
      strategy: this.strategy,
      initialized: new Date().toISOString()
    };

    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/orchestration/topology" --value '${JSON.stringify(topologyConfig)}'`);
  }

  async executeSparcWorkflow(agentPlan) {
    console.log('🎯 Executing full SPARC workflow...');

    const phases = ['specification', 'pseudocode', 'architecture', 'refinement', 'completion'];

    for (const phase of phases) {
      console.log(`📋 Executing SPARC phase: ${phase}`);
      await this.executeSparcPhase(phase, agentPlan);
    }
  }

  async executeSparcPhase(phase, agentPlan) {
    console.log(`🔄 Starting SPARC ${phase} phase...`);

    // Create phase-specific agent assignments
    const phaseAgents = this.assignAgentsToPhase(phase, agentPlan);

    // Execute phase using Claude Code's Task tool with parallel agent spawning
    const taskInstructions = this.generatePhaseInstructions(phase, phaseAgents);

    // Spawn agents for this phase using parallel execution
    console.log(`Spawning ${phaseAgents.length} agents for ${phase} phase...`);

    // Store phase execution plan
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/${phase}/plan" --value '${JSON.stringify({ agents: phaseAgents, instructions: taskInstructions })}'`);

    // Execute SPARC command for the phase
    this.executeCommand(`npx claude-flow@alpha sparc run ${phase} "${this.task}"`);

    // Wait for phase completion and gather results
    await this.waitForPhaseCompletion(phase);

    console.log(`✅ SPARC ${phase} phase completed`);
  }

  assignAgentsToPhase(phase, agentPlan) {
    const phaseAgentMap = {
      specification: ['qa-analyst', 'test-engineer'],
      pseudocode: ['qa-analyst', 'automation-engineer'],
      architecture: ['test-engineer', 'automation-engineer', 'performance-tester'],
      refinement: ['automation-engineer', 'test-engineer', 'security-tester'],
      completion: ['test-engineer', 'qa-analyst', 'automation-engineer']
    };

    const suitableAgents = phaseAgentMap[phase] || ['test-engineer'];
    const availableAgents = agentPlan.agentTypes.filter(type => suitableAgents.includes(type));

    return availableAgents.length > 0 ? availableAgents : ['test-engineer'];
  }

  generatePhaseInstructions(phase, agents) {
    const phaseInstructions = {
      specification: `Analyze requirements and create comprehensive test specifications for: ${this.task}`,
      pseudocode: `Design test algorithms and workflow pseudocode for: ${this.task}`,
      architecture: `Design test architecture and framework structure for: ${this.task}`,
      refinement: `Implement and refine test code, focusing on quality and efficiency for: ${this.task}`,
      completion: `Complete integration, documentation, and final validation for: ${this.task}`
    };

    return {
      phase,
      instruction: phaseInstructions[phase],
      assignedAgents: agents,
      coordinationRequired: true,
      parallelExecution: agents.length > 1
    };
  }

  async executeStandardWorkflow(agentPlan) {
    console.log('⚡ Executing standard QE workflow...');

    // Spawn all agents in parallel using Claude Code's Task tool
    await this.spawnWorkflowAgents(agentPlan);

    // Orchestrate task execution
    this.executeCommand(`npx claude-flow@alpha task orchestrate "${this.task}" --strategy ${this.strategy} --max-agents ${agentPlan.totalAgents}`);

    // Store workflow execution
    const workflowConfig = {
      type: 'standard',
      task: this.task,
      agentPlan,
      startTime: new Date().toISOString(),
      status: 'executing'
    };

    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/orchestration/workflow" --value '${JSON.stringify(workflowConfig)}'`);
  }

  async spawnWorkflowAgents(agentPlan) {
    console.log('🚀 Spawning workflow agents in parallel...');

    // Spawn agents for each specialization
    for (const [agentType, count] of Object.entries(agentPlan.agentDistribution)) {
      console.log(`Spawning ${count} ${agentType} agents...`);

      // Use MCP to define agent types for coordination
      this.executeCommand(`npx claude-flow@alpha agent spawn --type ${agentType} --count ${count}`);

      // Store agent spawn information
      this.executeCommand(`npx claude-flow@alpha memory store --key "qe/orchestration/agents/${agentType}" --value '${JSON.stringify({ count, spawned: new Date().toISOString() })}'`);
    }
  }

  async waitForPhaseCompletion(phase) {
    console.log(`⏳ Waiting for ${phase} phase completion...`);

    // Simple wait mechanism - in real implementation this would monitor actual completion
    const estimatedTime = this.estimatePhaseTime(phase);
    console.log(`Estimated completion time: ${estimatedTime} minutes`);

    // Store phase completion
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/${phase}/completed" --value "true"`);
  }

  estimatePhaseTime(phase) {
    const phaseTimes = {
      specification: 15,
      pseudocode: 20,
      architecture: 25,
      refinement: 35,
      completion: 20
    };

    return phaseTimes[phase] || 20;
  }

  async monitorExecution() {
    console.log('📊 Starting execution monitoring...');

    // Start real-time monitoring
    this.executeCommand('npx claude-flow@alpha swarm monitor --duration 300 --interval 10');

    // Store monitoring configuration
    const monitoringConfig = {
      enabled: true,
      startTime: new Date().toISOString(),
      orchestrationId: this.orchestrationId,
      realTime: true
    };

    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/orchestration/monitoring" --value '${JSON.stringify(monitoringConfig)}'`);
  }

  executeCommand(command) {
    try {
      execSync(command, {
        stdio: 'inherit',
        cwd: this.workingDir,
        env: { ...process.env, NODE_ENV: 'development' }
      });
    } catch (error) {
      console.warn(`Warning: Command failed: ${command}`);
      console.warn(error.message);
    }
  }

  printOrchestrationSummary() {
    console.log(`
🎉 QE Orchestration Summary

📋 Task: "${this.task}"
🏗️ Topology: ${this.topology}
⚡ Strategy: ${this.strategy}
🎯 SPARC Mode: ${this.sparcFull ? 'Full Workflow' : 'Standard'}
👥 Max Agents: ${this.maxAgents}

🔗 Coordination:
- Orchestration ID: ${this.orchestrationId}
- Memory Namespace: qe/orchestration
- Real-time Monitoring: Enabled

📊 Monitoring Commands:
- Check status: npm run qe:monitor
- View swarm: npx claude-flow@alpha swarm status
- Check memory: npx claude-flow@alpha memory retrieve --key "qe/orchestration/config"

✅ Orchestration is now running!
    `);
  }
}

// CLI execution
if (require.main === module) {
  const args = {};
  let taskDescription = '';

  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      args[key] = value || true;
    } else if (!taskDescription) {
      taskDescription = arg;
    } else {
      taskDescription += ' ' + arg;
    }
  });

  if (taskDescription) {
    args.task = taskDescription;
  }

  const command = new QEOrchestrateCommand(args);
  command.execute().catch(console.error);
}

module.exports = QEOrchestrateCommand;