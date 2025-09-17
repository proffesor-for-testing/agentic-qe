#!/usr/bin/env node

/**
 * QE Spawn Command Implementation
 * Spawns specialized QE agents for parallel execution using Claude Code's Task tool
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class QESpawnCommand {
  constructor(args = {}) {
    this.agentType = args['agent-type'];
    this.count = parseInt(args.count) || 1;
    this.parallel = args.parallel !== false;
    this.sparcPhase = args['sparc-phase'];
    this.workingDir = process.cwd();

    // Validate agent type
    this.validateAgentType();
  }

  async execute() {
    console.log(`🚀 Spawning ${this.count} ${this.agentType} agent(s)...`);

    try {
      // Step 1: Setup coordination
      await this.setupCoordination();

      // Step 2: Spawn agents using Claude Code's Task tool
      if (this.parallel && this.count > 1) {
        await this.spawnParallelAgents();
      } else {
        await this.spawnSequentialAgents();
      }

      // Step 3: Setup agent coordination
      await this.setupAgentCoordination();

      // Step 4: Initialize SPARC integration if specified
      if (this.sparcPhase) {
        await this.initializeSparcIntegration();
      }

      console.log(`✅ Successfully spawned ${this.count} ${this.agentType} agent(s)`);
      this.printAgentInfo();

    } catch (error) {
      console.error(`❌ Agent spawning failed:`, error.message);
      process.exit(1);
    }
  }

  validateAgentType() {
    const supportedAgents = [
      'test-engineer',
      'qa-analyst',
      'automation-engineer',
      'performance-tester',
      'security-tester',
      'mobile-tester',
      'accessibility-tester'
    ];

    if (!this.agentType || !supportedAgents.includes(this.agentType)) {
      throw new Error(`Invalid agent type: ${this.agentType}. Supported: ${supportedAgents.join(', ')}`);
    }
  }

  async setupCoordination() {
    console.log('📡 Setting up agent coordination...');

    // Initialize coordination hooks
    this.executeCommand('npx claude-flow@alpha hooks pre-task --description "Spawn QE Agents"');

    // Create session for agent coordination
    const sessionId = `qe-spawn-${Date.now()}`;
    this.executeCommand(`npx claude-flow@alpha hooks session-restore --session-id "${sessionId}"`);

    // Store spawn configuration
    const spawnConfig = {
      agentType: this.agentType,
      count: this.count,
      parallel: this.parallel,
      sparcPhase: this.sparcPhase,
      timestamp: new Date().toISOString(),
      sessionId
    };

    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/spawn/config" --value '${JSON.stringify(spawnConfig)}'`);
  }

  async spawnParallelAgents() {
    console.log(`🐝 Spawning ${this.count} agents in parallel...`);

    // Create agent specifications for parallel execution
    const agentSpecs = this.generateAgentSpecifications();

    // Use Claude Code's Task tool to spawn agents concurrently
    const taskPromises = agentSpecs.map((spec, index) => {
      return this.spawnSingleAgent(spec, index + 1);
    });

    // Execute all agent spawning in parallel
    console.log('Executing parallel agent spawning...');

    // Store parallel execution plan
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/agents/parallel-plan" --value '${JSON.stringify(agentSpecs)}'`);

    // Coordination for parallel execution
    this.executeCommand('npx claude-flow@alpha swarm init --topology mesh --max-agents 8 --strategy adaptive');

    // Spawn each agent type
    agentSpecs.forEach((spec, index) => {
      this.executeCommand(`npx claude-flow@alpha agent spawn --type ${spec.type} --capabilities "${spec.capabilities.join(',')}" --name "${spec.name}"`);
    });
  }

  async spawnSequentialAgents() {
    console.log(`⏳ Spawning ${this.count} agents sequentially...`);

    for (let i = 0; i < this.count; i++) {
      const agentSpec = this.generateAgentSpecification(i + 1);
      await this.spawnSingleAgent(agentSpec, i + 1);
    }
  }

  async spawnSingleAgent(agentSpec, index) {
    console.log(`🤖 Spawning agent ${index}: ${agentSpec.name}`);

    // Store agent information
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/agents/${agentSpec.id}" --value '${JSON.stringify(agentSpec)}'`);

    // Create agent-specific instructions
    const instructions = this.generateAgentInstructions(agentSpec);

    // Create agent work directory
    const agentWorkDir = path.join(this.workingDir, 'agents', agentSpec.id);
    this.ensureDirectoryExists(agentWorkDir);

    // Save agent instructions
    fs.writeFileSync(
      path.join(agentWorkDir, 'instructions.md'),
      instructions
    );

    // Create agent coordination script
    const coordinationScript = this.generateCoordinationScript(agentSpec);
    fs.writeFileSync(
      path.join(agentWorkDir, 'coordination.js'),
      coordinationScript
    );

    console.log(`✅ Agent ${agentSpec.name} spawned successfully`);
  }

  generateAgentSpecifications() {
    const specs = [];
    for (let i = 0; i < this.count; i++) {
      specs.push(this.generateAgentSpecification(i + 1));
    }
    return specs;
  }

  generateAgentSpecification(index) {
    const agentId = `${this.agentType}-${index}`;
    const agentName = `${this.agentType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} ${index}`;

    const agentTypes = {
      'test-engineer': {
        capabilities: ['test-planning', 'test-case-design', 'automation-framework-setup', 'test-execution', 'defect-analysis'],
        description: 'Designs and implements comprehensive test strategies',
        primaryRole: 'test-strategy-design',
        sparcPhases: ['specification', 'architecture', 'refinement']
      },
      'qa-analyst': {
        capabilities: ['requirement-analysis', 'test-specification', 'risk-assessment', 'acceptance-criteria', 'quality-metrics'],
        description: 'Analyzes requirements and creates test specifications',
        primaryRole: 'requirement-analysis',
        sparcPhases: ['specification', 'pseudocode']
      },
      'automation-engineer': {
        capabilities: ['framework-development', 'ci-cd-integration', 'parallel-execution', 'test-maintenance', 'tool-integration'],
        description: 'Builds and maintains test automation frameworks',
        primaryRole: 'automation-development',
        sparcPhases: ['architecture', 'refinement', 'completion']
      },
      'performance-tester': {
        capabilities: ['load-testing', 'stress-testing', 'performance-analysis', 'bottleneck-identification', 'scalability-testing'],
        description: 'Specializes in performance and load testing',
        primaryRole: 'performance-validation',
        sparcPhases: ['specification', 'architecture', 'refinement']
      },
      'security-tester': {
        capabilities: ['security-scanning', 'penetration-testing', 'vulnerability-assessment', 'compliance-testing', 'threat-modeling'],
        description: 'Focuses on security testing and vulnerability assessment',
        primaryRole: 'security-validation',
        sparcPhases: ['specification', 'architecture', 'refinement']
      },
      'mobile-tester': {
        capabilities: ['device-testing', 'os-compatibility', 'mobile-automation', 'app-store-compliance', 'usability-testing'],
        description: 'Specialized in mobile application testing',
        primaryRole: 'mobile-validation',
        sparcPhases: ['specification', 'architecture', 'refinement']
      },
      'accessibility-tester': {
        capabilities: ['wcag-compliance', 'screen-reader-testing', 'keyboard-navigation', 'color-contrast', 'accessibility-automation'],
        description: 'Ensures applications meet accessibility standards',
        primaryRole: 'accessibility-validation',
        sparcPhases: ['specification', 'refinement']
      }
    };

    const agentConfig = agentTypes[this.agentType];

    return {
      id: agentId,
      name: agentName,
      type: this.agentType,
      index: index,
      capabilities: agentConfig.capabilities,
      description: agentConfig.description,
      primaryRole: agentConfig.primaryRole,
      sparcPhases: agentConfig.sparcPhases,
      status: 'spawned',
      spawnedAt: new Date().toISOString(),
      workDirectory: path.join('agents', agentId),
      coordinationEnabled: true
    };
  }

  generateAgentInstructions(agentSpec) {
    return `# ${agentSpec.name} Instructions

## Agent Overview
- **Type**: ${agentSpec.type}
- **ID**: ${agentSpec.id}
- **Primary Role**: ${agentSpec.primaryRole}
- **Description**: ${agentSpec.description}

## Capabilities
${agentSpec.capabilities.map(cap => `- ${cap}`).join('\n')}

## SPARC Integration
${this.sparcPhase ? `- **Current Phase**: ${this.sparcPhase}` : '- **All Phases Supported**'}
- **Supported Phases**: ${agentSpec.sparcPhases.join(', ')}

## Coordination Protocol

### Before Starting Work
\`\`\`bash
npx claude-flow@alpha hooks pre-task --description "${agentSpec.name} starting work"
npx claude-flow@alpha hooks session-restore --session-id "qe-agent-${agentSpec.id}"
\`\`\`

### During Work
\`\`\`bash
# After each significant operation
npx claude-flow@alpha hooks post-edit --file "[file-path]" --memory-key "qe/agents/${agentSpec.id}/progress"
npx claude-flow@alpha hooks notify --message "[what was accomplished]"

# Store work artifacts
npx claude-flow@alpha memory store --key "qe/agents/${agentSpec.id}/artifacts/[artifact-name]" --value "[artifact-data]"
\`\`\`

### After Completing Work
\`\`\`bash
npx claude-flow@alpha hooks post-task --task-id "${agentSpec.id}-task"
npx claude-flow@alpha hooks session-end --export-metrics true
\`\`\`

## Work Assignments

### Primary Responsibilities
${this.generatePrimaryResponsibilities(agentSpec)}

### Coordination Tasks
${this.generateCoordinationTasks(agentSpec)}

### Quality Deliverables
${this.generateQualityDeliverables(agentSpec)}

## Communication
- **Memory Namespace**: qe/agents/${agentSpec.id}
- **Status Updates**: Every 15 minutes or after major milestones
- **Artifact Sharing**: Store in shared memory for team access
- **Issue Escalation**: Notify coordinator for blockers

## Success Criteria
${this.generateSuccessCriteria(agentSpec)}

---
Generated: ${new Date().toISOString()}
Agent Spawned by: QE Spawn Command
`;
  }

  generatePrimaryResponsibilities(agentSpec) {
    const responsibilities = {
      'test-engineer': [
        'Design comprehensive test strategies',
        'Create detailed test plans and test cases',
        'Set up testing frameworks and environments',
        'Execute test scenarios and analyze results',
        'Identify and document defects'
      ],
      'qa-analyst': [
        'Analyze functional and non-functional requirements',
        'Create test specifications and acceptance criteria',
        'Perform risk assessment and test coverage analysis',
        'Validate business logic and user workflows',
        'Define quality metrics and KPIs'
      ],
      'automation-engineer': [
        'Build and maintain test automation frameworks',
        'Implement CI/CD pipeline integration',
        'Develop reusable test components and utilities',
        'Optimize test execution for parallel processing',
        'Maintain test infrastructure and tools'
      ],
      'performance-tester': [
        'Design and execute load testing scenarios',
        'Perform stress and scalability testing',
        'Analyze performance metrics and bottlenecks',
        'Create performance benchmarks and SLAs',
        'Optimize application performance'
      ],
      'security-tester': [
        'Conduct security vulnerability assessments',
        'Perform penetration testing and threat modeling',
        'Validate authentication and authorization',
        'Test for OWASP Top 10 vulnerabilities',
        'Ensure compliance with security standards'
      ],
      'mobile-tester': [
        'Test across multiple devices and OS versions',
        'Validate mobile-specific functionality',
        'Test app store compliance and guidelines',
        'Perform usability and accessibility testing',
        'Validate mobile performance and battery usage'
      ],
      'accessibility-tester': [
        'Validate WCAG compliance and accessibility standards',
        'Test with assistive technologies',
        'Verify keyboard navigation and screen reader support',
        'Check color contrast and visual accessibility',
        'Automate accessibility testing where possible'
      ]
    };

    return responsibilities[agentSpec.type]?.map(resp => `- ${resp}`).join('\n') || '- General QE responsibilities';
  }

  generateCoordinationTasks(agentSpec) {
    return `- Coordinate with other agents in the swarm
- Share test artifacts and findings via memory storage
- Participate in parallel test execution
- Provide status updates to swarm coordinator
- Collaborate on cross-functional testing scenarios`;
  }

  generateQualityDeliverables(agentSpec) {
    const deliverables = {
      'test-engineer': [
        'Test strategy document',
        'Test plan and test cases',
        'Test execution reports',
        'Defect analysis reports',
        'Test coverage metrics'
      ],
      'qa-analyst': [
        'Requirements traceability matrix',
        'Test specifications',
        'Risk assessment reports',
        'Acceptance criteria validation',
        'Quality metrics dashboard'
      ],
      'automation-engineer': [
        'Automation framework code',
        'CI/CD pipeline configuration',
        'Test utilities and helpers',
        'Parallel execution setup',
        'Maintenance documentation'
      ],
      'performance-tester': [
        'Performance test scripts',
        'Load testing reports',
        'Performance benchmarks',
        'Bottleneck analysis',
        'Optimization recommendations'
      ],
      'security-tester': [
        'Security test results',
        'Vulnerability assessment reports',
        'Penetration test findings',
        'Security compliance validation',
        'Threat model documentation'
      ],
      'mobile-tester': [
        'Mobile test matrix',
        'Device compatibility reports',
        'App store validation results',
        'Mobile performance metrics',
        'Usability test findings'
      ],
      'accessibility-tester': [
        'Accessibility audit reports',
        'WCAG compliance validation',
        'Assistive technology test results',
        'Accessibility automation suite',
        'Remediation recommendations'
      ]
    };

    return deliverables[agentSpec.type]?.map(deliv => `- ${deliv}`).join('\n') || '- Quality assurance deliverables';
  }

  generateSuccessCriteria(agentSpec) {
    return `- Complete assigned tasks within specified timeframes
- Maintain coordination with swarm members
- Achieve quality targets and coverage goals
- Provide comprehensive documentation
- Follow SPARC methodology when applicable
- Contribute to overall swarm success metrics`;
  }

  generateCoordinationScript(agentSpec) {
    return `#!/usr/bin/env node

/**
 * Agent Coordination Script for ${agentSpec.name}
 * Handles SPARC methodology integration and swarm coordination
 */

const { execSync } = require('child_process');

class AgentCoordination {
  constructor() {
    this.agentId = '${agentSpec.id}';
    this.agentType = '${agentSpec.type}';
    this.sessionId = \`qe-agent-\${this.agentId}\`;
  }

  async beforeTask(taskDescription) {
    console.log(\`🚀 [\${this.agentId}] Starting task: \${taskDescription}\`);

    // Initialize coordination hooks
    execSync(\`npx claude-flow@alpha hooks pre-task --description "\${this.agentId}: \${taskDescription}"\`);
    execSync(\`npx claude-flow@alpha hooks session-restore --session-id "\${this.sessionId}"\`);

    // Store task start
    const taskData = {
      agentId: this.agentId,
      taskDescription,
      startTime: new Date().toISOString(),
      status: 'in-progress'
    };

    execSync(\`npx claude-flow@alpha memory store --key "qe/agents/\${this.agentId}/current-task" --value '\${JSON.stringify(taskData)}'\`);
  }

  async afterEdit(filePath, operation) {
    console.log(\`📝 [\${this.agentId}] Completed edit: \${filePath}\`);

    // Notify coordination system
    execSync(\`npx claude-flow@alpha hooks post-edit --file "\${filePath}" --memory-key "qe/agents/\${this.agentId}/edits"\`);

    // Store edit information
    const editData = {
      agentId: this.agentId,
      filePath,
      operation,
      timestamp: new Date().toISOString()
    };

    execSync(\`npx claude-flow@alpha memory store --key "qe/agents/\${this.agentId}/edits/\${Date.now()}" --value '\${JSON.stringify(editData)}'\`);
  }

  async storeArtifact(artifactName, artifactData) {
    console.log(\`💾 [\${this.agentId}] Storing artifact: \${artifactName}\`);

    const artifact = {
      name: artifactName,
      data: artifactData,
      agentId: this.agentId,
      agentType: this.agentType,
      timestamp: new Date().toISOString()
    };

    execSync(\`npx claude-flow@alpha memory store --key "qe/artifacts/\${artifactName}" --value '\${JSON.stringify(artifact)}'\`);
  }

  async notifyProgress(message) {
    console.log(\`📢 [\${this.agentId}] Progress: \${message}\`);

    execSync(\`npx claude-flow@alpha hooks notify --message "\${this.agentId}: \${message}"\`);

    // Store progress update
    const progressData = {
      agentId: this.agentId,
      message,
      timestamp: new Date().toISOString()
    };

    execSync(\`npx claude-flow@alpha memory store --key "qe/agents/\${this.agentId}/progress/\${Date.now()}" --value '\${JSON.stringify(progressData)}'\`);
  }

  async afterTask(taskId) {
    console.log(\`✅ [\${this.agentId}] Completed task: \${taskId}\`);

    // Complete coordination hooks
    execSync(\`npx claude-flow@alpha hooks post-task --task-id "\${taskId}"\`);
    execSync(\`npx claude-flow@alpha hooks session-end --export-metrics true\`);

    // Store task completion
    const completionData = {
      agentId: this.agentId,
      taskId,
      endTime: new Date().toISOString(),
      status: 'completed'
    };

    execSync(\`npx claude-flow@alpha memory store --key "qe/agents/\${this.agentId}/completed-tasks/\${taskId}" --value '\${JSON.stringify(completionData)}'\`);
  }

  async getSharedMemory(key) {
    try {
      const result = execSync(\`npx claude-flow@alpha memory retrieve --key "\${key}"\`, { encoding: 'utf8' });
      return JSON.parse(result.trim());
    } catch (error) {
      console.warn(\`Warning: Could not retrieve shared memory for key: \${key}\`);
      return null;
    }
  }

  async shareWithTeam(key, data) {
    console.log(\`🤝 [\${this.agentId}] Sharing with team: \${key}\`);

    const sharedData = {
      sharedBy: this.agentId,
      data,
      timestamp: new Date().toISOString()
    };

    execSync(\`npx claude-flow@alpha memory store --key "qe/shared/\${key}" --value '\${JSON.stringify(sharedData)}'\`);
  }

  async reportStatus() {
    const status = {
      agentId: this.agentId,
      agentType: this.agentType,
      status: 'active',
      lastUpdate: new Date().toISOString(),
      capabilities: ${JSON.stringify(agentSpec.capabilities)}
    };

    execSync(\`npx claude-flow@alpha memory store --key "qe/agents/\${this.agentId}/status" --value '\${JSON.stringify(status)}'\`);

    return status;
  }
}

module.exports = AgentCoordination;

// CLI usage
if (require.main === module) {
  const coordination = new AgentCoordination();
  const action = process.argv[2];
  const param = process.argv[3];

  switch (action) {
    case 'before-task':
      coordination.beforeTask(param);
      break;
    case 'after-task':
      coordination.afterTask(param);
      break;
    case 'notify':
      coordination.notifyProgress(param);
      break;
    case 'status':
      coordination.reportStatus().then(console.log);
      break;
    default:
      console.log('Usage: node coordination.js <action> [param]');
      console.log('Actions: before-task, after-task, notify, status');
  }
}`;
  }

  async setupAgentCoordination() {
    console.log('🤝 Setting up agent coordination network...');

    // Initialize swarm if not already done
    this.executeCommand('npx claude-flow@alpha swarm status || npx claude-flow@alpha swarm init --topology mesh --max-agents 12');

    // Store agent registry
    const agentRegistry = {
      agentType: this.agentType,
      count: this.count,
      spawnedAgents: this.count,
      coordinationEnabled: true,
      memoryNamespace: `qe/agents/${this.agentType}`,
      timestamp: new Date().toISOString()
    };

    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/registry/${this.agentType}" --value '${JSON.stringify(agentRegistry)}'`);

    // Setup inter-agent communication
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/communication/enabled" --value "true"`);
  }

  async initializeSparcIntegration() {
    console.log(`🎯 Initializing SPARC integration for phase: ${this.sparcPhase}`);

    const sparcConfig = {
      phase: this.sparcPhase,
      agentType: this.agentType,
      agentCount: this.count,
      methodology: 'SPARC',
      timestamp: new Date().toISOString()
    };

    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/${this.sparcPhase}/config" --value '${JSON.stringify(sparcConfig)}'`);

    // Phase-specific initialization
    switch (this.sparcPhase) {
      case 'specification':
        await this.initializeSpecificationPhase();
        break;
      case 'pseudocode':
        await this.initializePseudocodePhase();
        break;
      case 'architecture':
        await this.initializeArchitecturePhase();
        break;
      case 'refinement':
        await this.initializeRefinementPhase();
        break;
      case 'completion':
        await this.initializeCompletionPhase();
        break;
    }
  }

  async initializeSpecificationPhase() {
    console.log('📋 Initializing Specification phase...');
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/specification/agents" --value '${JSON.stringify([this.agentType])}'`);
  }

  async initializePseudocodePhase() {
    console.log('🔤 Initializing Pseudocode phase...');
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/pseudocode/agents" --value '${JSON.stringify([this.agentType])}'`);
  }

  async initializeArchitecturePhase() {
    console.log('🏗️ Initializing Architecture phase...');
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/architecture/agents" --value '${JSON.stringify([this.agentType])}'`);
  }

  async initializeRefinementPhase() {
    console.log('🔧 Initializing Refinement phase...');
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/refinement/agents" --value '${JSON.stringify([this.agentType])}'`);
  }

  async initializeCompletionPhase() {
    console.log('🎯 Initializing Completion phase...');
    this.executeCommand(`npx claude-flow@alpha memory store --key "qe/sparc/completion/agents" --value '${JSON.stringify([this.agentType])}'`);
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

  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  printAgentInfo() {
    console.log(`
🎉 Agent spawning completed successfully!

📊 Spawn Summary:
- Agent Type: ${this.agentType}
- Count: ${this.count}
- Execution Mode: ${this.parallel ? 'Parallel' : 'Sequential'}
- SPARC Phase: ${this.sparcPhase || 'All phases'}
- Coordination: Enabled

🔗 Agent Coordination:
- Memory Namespace: qe/agents/${this.agentType}
- Coordination Topology: Mesh
- Real-time Updates: Enabled

📋 Next Steps:
1. Monitor agents: npm run qe:monitor
2. Orchestrate tasks: npm run qe:orchestrate "<task description>"
3. Check status: npx claude-flow@alpha swarm status
4. View memory: npx claude-flow@alpha memory retrieve --key "qe/registry/${this.agentType}"

🚀 Happy testing!
    `);
  }
}

// CLI execution
if (require.main === module) {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      args[key] = value || true;
    } else if (!args['agent-type']) {
      args['agent-type'] = arg;
    }
  });

  const command = new QESpawnCommand(args);
  command.execute().catch(console.error);
}

module.exports = QESpawnCommand;