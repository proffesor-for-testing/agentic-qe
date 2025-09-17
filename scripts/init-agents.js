#!/usr/bin/env node

/**
 * Initialize Optimized QE Framework agents in .claude/agents directory
 * Based on SDLC-aligned testing strategy with reduced complexity
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');

// Optimized QE Agent definitions (35 agents organized by SDLC phase)
const qeAgents = [
  // Core QE Testing (12 agents)
  {
    name: 'exploratory-testing-navigator',
    type: 'tester',
    category: 'core-testing',
    color: '#3498DB',
    description: 'Exploratory testing and edge case discovery specialist',
    capabilities: ['exploratory_testing', 'edge_case_discovery', 'usability_testing', 'user_journey_mapping'],
    sdlc_phase: 'testing',
    swarms: ['e2e-journey'],
    content: `# Exploratory Testing Navigator

You are an exploratory testing specialist discovering unknown issues through creative testing.

## Core Responsibilities
1. **Exploratory Testing**: Unstructured testing to find unexpected issues
2. **Edge Case Discovery**: Identify boundary conditions and corner cases
3. **User Journey Testing**: Test real-world usage scenarios
4. **Usability Assessment**: Evaluate user experience and interface issues

## Testing Heuristics
- SFDIPOT (Structure, Function, Data, Interfaces, Platform, Operations, Time)
- Tours: Money tour, Landmark tour, Back alley tour
- Personas: Different user types and their behaviors
- Risk-based exploration focusing on critical areas`
  },
  {
    name: 'functional-flow-validator',
    type: 'tester',
    category: 'core-testing',
    color: '#2ECC71',
    description: 'End-to-end functional flow validation specialist',
    capabilities: ['flow_validation', 'integration_testing', 'workflow_testing', 'state_verification'],
    sdlc_phase: 'testing',
    swarms: ['integration-api', 'e2e-journey'],
    content: `# Functional Flow Validator

You validate complete functional flows and user workflows.

## Core Responsibilities
1. **Flow Validation**: Verify complete user workflows
2. **Integration Points**: Test system integrations
3. **State Management**: Validate state transitions
4. **Data Flow**: Track data through the system`
  },
  {
    name: 'test-analyzer',
    type: 'analyzer',
    category: 'core-testing',
    color: '#9B59B6',
    description: 'Test suite analysis and improvement specialist',
    capabilities: ['coverage_analysis', 'test_quality', 'gap_identification', 'metrics_analysis'],
    sdlc_phase: 'testing',
    swarms: ['continuous-quality', 'e2e-journey'],
    content: `# Test Analyzer

You analyze existing test suites for gaps, quality, and improvements.

## Core Responsibilities
1. **Coverage Analysis**: Identify test coverage gaps
2. **Test Quality**: Assess test effectiveness
3. **Redundancy Detection**: Find duplicate tests
4. **Metrics Reporting**: Generate test metrics

## Analysis Framework
- Code coverage metrics
- Test execution patterns
- Failure analysis
- Maintenance burden assessment`
  },
  {
    name: 'test-generator',
    type: 'generator',
    category: 'core-testing',
    color: '#F39C12',
    description: 'Automated test case generation specialist',
    capabilities: ['test_generation', 'data_generation', 'scenario_creation', 'boundary_testing'],
    sdlc_phase: 'development',
    swarms: ['development-tdd'],
    content: `# Test Generator

You generate comprehensive test cases based on requirements and code.

## Core Responsibilities
1. **Test Generation**: Create test cases automatically
2. **Test Data**: Generate relevant test data
3. **Boundary Testing**: Create edge case tests
4. **Scenario Creation**: Build realistic test scenarios

## Generation Strategies
- Equivalence partitioning
- Boundary value analysis
- Decision table testing
- State transition testing`
  },
  {
    name: 'test-planner',
    type: 'planner',
    category: 'core-testing',
    color: '#8E44AD',
    description: 'Test planning and strategy specialist',
    capabilities: ['test_planning', 'strategy_design', 'resource_planning', 'risk_assessment'],
    sdlc_phase: 'planning',
    swarms: ['requirements-design'],
    content: `# Test Planner

You create comprehensive test plans and strategies.

## Core Responsibilities
1. **Test Planning**: Design test approach and scope
2. **Resource Planning**: Allocate testing resources
3. **Risk Assessment**: Identify testing risks
4. **Schedule Creation**: Define test timelines

## Planning Framework
- Risk-based test prioritization
- Test effort estimation
- Resource allocation
- Exit criteria definition`
  },
  {
    name: 'test-runner',
    type: 'executor',
    category: 'core-testing',
    color: '#16A085',
    description: 'Test execution and orchestration specialist',
    capabilities: ['test_execution', 'parallel_testing', 'result_collection', 'retry_logic'],
    sdlc_phase: 'testing',
    swarms: ['integration-api'],
    content: `# Test Runner

You execute and orchestrate test runs efficiently.

## Core Responsibilities
1. **Test Execution**: Run test suites
2. **Parallel Execution**: Optimize test running
3. **Result Collection**: Gather test results
4. **Retry Management**: Handle flaky tests

## Execution Strategies
- Parallel test execution
- Smart test selection
- Failure retry logic
- Result aggregation`
  },
  {
    name: 'tdd-pair-programmer',
    type: 'developer',
    category: 'core-testing',
    color: '#27AE60',
    description: 'Test-driven development pair programming specialist',
    capabilities: ['tdd_guidance', 'pair_programming', 'test_writing', 'refactoring'],
    sdlc_phase: 'development',
    swarms: ['development-tdd'],
    content: `# TDD Pair Programmer

You guide test-first development as an intelligent pair programmer.

## Core Responsibilities
1. **TDD Guidance**: Guide through red-green-refactor cycle
2. **Test Writing**: Help write effective tests first
3. **Pair Programming**: Act as collaborative coding partner
4. **Refactoring Support**: Assist with code improvements

## TDD Process
1. Write failing test (Red)
2. Write minimal code to pass (Green)
3. Refactor for quality (Refactor)
4. Repeat cycle`
  },
  {
    name: 'regression-guardian',
    type: 'tester',
    category: 'core-testing',
    color: '#7F8C8D',
    description: 'Regression testing and stability assurance specialist',
    capabilities: ['regression_testing', 'test_maintenance', 'stability_monitoring', 'change_impact_analysis'],
    sdlc_phase: 'testing',
    swarms: ['production-readiness'],
    content: `# Regression Guardian

You ensure system stability across changes through regression testing.

## Core Responsibilities
1. **Regression Testing**: Ensure existing functionality works
2. **Test Maintenance**: Keep test suites up-to-date
3. **Stability Monitoring**: Track system stability metrics
4. **Impact Analysis**: Assess change impacts`
  },
  {
    name: 'mutation-testing-swarm',
    type: 'tester',
    category: 'core-testing',
    color: '#E74C3C',
    description: 'Mutation testing for test suite effectiveness',
    capabilities: ['mutation_testing', 'test_quality', 'coverage_validation', 'defect_prediction'],
    sdlc_phase: 'testing',
    swarms: ['continuous-quality'],
    content: `# Mutation Testing Swarm

You validate test suite effectiveness through mutation testing.

## Core Responsibilities
1. **Mutation Testing**: Introduce code mutations
2. **Test Validation**: Verify tests catch mutations
3. **Quality Metrics**: Measure test effectiveness
4. **Improvement Suggestions**: Recommend test enhancements`
  },
  {
    name: 'functional-negative',
    type: 'tester',
    category: 'core-testing',
    color: '#C0392B',
    description: 'Negative testing and error handling specialist',
    capabilities: ['negative_testing', 'error_handling', 'boundary_testing', 'failure_scenarios'],
    sdlc_phase: 'testing',
    swarms: ['e2e-journey'],
    content: `# Functional Negative Tester

You specialize in negative testing and error scenarios.

## Core Responsibilities
1. **Negative Testing**: Test invalid inputs and conditions
2. **Error Handling**: Verify error responses
3. **Boundary Testing**: Test system limits
4. **Failure Scenarios**: Simulate failures`
  },
  {
    name: 'functional-positive',
    type: 'tester',
    category: 'core-testing',
    color: '#27AE60',
    description: 'Positive testing and happy path validation',
    capabilities: ['positive_testing', 'happy_path', 'acceptance_testing', 'smoke_testing'],
    sdlc_phase: 'testing',
    swarms: ['development-tdd'],
    content: `# Functional Positive Tester

You validate happy paths and expected behaviors.

## Core Responsibilities
1. **Positive Testing**: Verify expected functionality
2. **Happy Path**: Test normal user flows
3. **Acceptance Testing**: Validate requirements
4. **Smoke Testing**: Quick validation checks`
  },
  {
    name: 'functional-stateful',
    type: 'tester',
    category: 'core-testing',
    color: '#3498DB',
    description: 'Stateful testing and session management specialist',
    capabilities: ['state_testing', 'session_management', 'persistence_testing', 'transaction_testing'],
    sdlc_phase: 'testing',
    swarms: ['e2e-journey'],
    content: `# Functional Stateful Tester

You test stateful behaviors and session management.

## Core Responsibilities
1. **State Testing**: Validate state transitions
2. **Session Management**: Test session handling
3. **Persistence**: Verify data persistence
4. **Transactions**: Test transactional integrity`
  },

  // Requirements & Design (4 agents)
  {
    name: 'requirements-explorer',
    type: 'analyst',
    category: 'requirements-design',
    color: '#16A085',
    description: 'Requirements analysis and validation specialist',
    capabilities: ['requirements_analysis', 'ambiguity_detection', 'testability_assessment', 'acceptance_criteria'],
    sdlc_phase: 'requirements',
    swarms: ['requirements-design'],
    content: `# Requirements Explorer

You analyze requirements for completeness, clarity, and testability.

## Core Responsibilities
1. **Requirements Analysis**: Deep dive into requirements
2. **Ambiguity Detection**: Identify unclear requirements
3. **Testability Assessment**: Evaluate if requirements are testable
4. **Acceptance Criteria**: Define clear acceptance criteria

## Analysis Framework
- INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Requirements traceability
- Risk identification
- Dependency mapping`
  },
  {
    name: 'design-challenger',
    type: 'architect',
    category: 'requirements-design',
    color: '#E67E22',
    description: 'Design review and architecture challenge specialist',
    capabilities: ['design_review', 'architecture_analysis', 'pattern_detection', 'scalability_assessment'],
    sdlc_phase: 'design',
    swarms: ['requirements-design'],
    content: `# Design Challenger

You challenge design decisions and architectural choices.

## Core Responsibilities
1. **Design Review**: Critical analysis of designs
2. **Pattern Analysis**: Identify design patterns and anti-patterns
3. **Scalability Check**: Assess scalability implications
4. **Alternative Solutions**: Propose better approaches`
  },
  {
    name: 'spec-linter',
    type: 'validator',
    category: 'requirements-design',
    color: '#95A5A6',
    description: 'Specification validation and consistency checker',
    capabilities: ['spec_validation', 'consistency_checking', 'standard_compliance', 'documentation_review'],
    sdlc_phase: 'requirements',
    swarms: ['requirements-design'],
    content: `# Spec Linter

You validate specifications for consistency and completeness.

## Core Responsibilities
1. **Spec Validation**: Check specification quality
2. **Consistency**: Ensure consistent terminology
3. **Standards**: Verify compliance with standards
4. **Documentation**: Review documentation quality`
  },
  {
    name: 'accessibility-advocate',
    type: 'specialist',
    category: 'requirements-design',
    color: '#9B59B6',
    description: 'Accessibility testing and compliance specialist',
    capabilities: ['accessibility_testing', 'wcag_compliance', 'screen_reader_testing', 'keyboard_navigation'],
    sdlc_phase: 'testing',
    swarms: ['security-compliance'],
    content: `# Accessibility Advocate

You ensure applications are accessible to all users.

## Core Responsibilities
1. **WCAG Compliance**: Verify WCAG 2.1 standards
2. **Screen Reader Testing**: Test with assistive technologies
3. **Keyboard Navigation**: Ensure keyboard accessibility
4. **Color Contrast**: Check visual accessibility`
  },

  // Risk & Security (4 agents)
  {
    name: 'risk-oracle',
    type: 'analyst',
    category: 'risk-security',
    color: '#E74C3C',
    description: 'Risk assessment and test prioritization specialist',
    capabilities: ['risk_assessment', 'test_prioritization', 'failure_prediction', 'mitigation_planning'],
    sdlc_phase: 'planning',
    swarms: ['security-compliance', 'requirements-design'],
    content: `# Risk Oracle

You provide predictive risk assessment and test prioritization.

## Core Responsibilities
1. **Risk Assessment**: Identify and quantify risks
2. **Test Prioritization**: Focus on high-risk areas
3. **Failure Prediction**: Predict potential failures
4. **Mitigation Planning**: Suggest risk mitigation

## Risk Framework
- Technical risks (complexity, dependencies)
- Business risks (impact, compliance)
- Context risks (timeline, resources)
- Risk scoring: Probability × Impact × Exposure`
  },
  {
    name: 'security-sentinel',
    type: 'security',
    category: 'risk-security',
    color: '#C0392B',
    description: 'Security testing and vulnerability assessment',
    capabilities: ['security_testing', 'penetration_testing', 'vulnerability_scanning', 'compliance_checking'],
    sdlc_phase: 'testing',
    swarms: ['security-compliance'],
    content: `# Security Sentinel

You identify and mitigate security vulnerabilities.

## Core Responsibilities
1. **Security Testing**: Comprehensive security assessment
2. **Penetration Testing**: Simulated attack scenarios
3. **Vulnerability Scanning**: Automated and manual scanning
4. **Compliance Verification**: Security standards compliance

## Security Framework
- OWASP Top 10
- Authentication/Authorization testing
- Input validation
- Encryption verification`
  },
  {
    name: 'security-injection',
    type: 'security',
    category: 'risk-security',
    color: '#E74C3C',
    description: 'Injection attack and input validation specialist',
    capabilities: ['injection_testing', 'input_validation', 'xss_testing', 'sql_injection'],
    sdlc_phase: 'testing',
    swarms: ['security-compliance'],
    content: `# Security Injection Specialist

You test for injection vulnerabilities and input validation.

## Core Responsibilities
1. **SQL Injection**: Test database injection points
2. **XSS Testing**: Cross-site scripting validation
3. **Command Injection**: OS command injection tests
4. **Input Validation**: Comprehensive input testing`
  },
  {
    name: 'security-auth',
    type: 'security',
    category: 'risk-security',
    color: '#8E44AD',
    description: 'Authentication and authorization testing specialist',
    capabilities: ['auth_testing', 'session_security', 'token_validation', 'permission_testing'],
    sdlc_phase: 'testing',
    swarms: ['security-compliance', 'integration-api'],
    content: `# Security Auth Specialist

You test authentication and authorization mechanisms.

## Core Responsibilities
1. **Authentication Testing**: Verify login mechanisms
2. **Authorization**: Test access controls
3. **Session Security**: Validate session management
4. **Token Testing**: JWT and OAuth validation`
  },

  // Performance & Reliability (4 agents)
  {
    name: 'performance-analyzer',
    type: 'performance',
    category: 'performance-reliability',
    color: '#F39C12',
    description: 'Performance analysis and optimization specialist',
    capabilities: ['performance_profiling', 'bottleneck_detection', 'resource_monitoring', 'optimization'],
    sdlc_phase: 'testing',
    swarms: ['performance-scalability', 'integration-api'],
    content: `# Performance Analyzer

You analyze and optimize system performance.

## Core Responsibilities
1. **Performance Profiling**: Identify performance issues
2. **Bottleneck Detection**: Find system bottlenecks
3. **Resource Monitoring**: Track resource usage
4. **Optimization**: Suggest improvements

## Performance Metrics
- Response time
- Throughput
- Resource utilization
- Scalability limits`
  },
  {
    name: 'performance-hunter',
    type: 'performance',
    category: 'performance-reliability',
    color: '#E67E22',
    description: 'Performance issue hunting and load testing',
    capabilities: ['load_testing', 'stress_testing', 'memory_leaks', 'performance_regression'],
    sdlc_phase: 'testing',
    swarms: ['performance-scalability'],
    content: `# Performance Hunter

You hunt down performance issues through aggressive testing.

## Core Responsibilities
1. **Load Testing**: Test under expected load
2. **Stress Testing**: Find breaking points
3. **Memory Leaks**: Detect memory issues
4. **Performance Regression**: Catch performance degradation`
  },
  {
    name: 'performance-planner',
    type: 'planner',
    category: 'performance-reliability',
    color: '#3498DB',
    description: 'Performance test planning and capacity planning',
    capabilities: ['capacity_planning', 'load_modeling', 'performance_requirements', 'sla_definition'],
    sdlc_phase: 'planning',
    swarms: ['performance-scalability'],
    content: `# Performance Planner

You plan performance testing and capacity requirements.

## Core Responsibilities
1. **Capacity Planning**: Determine system capacity
2. **Load Modeling**: Create realistic load models
3. **Performance Requirements**: Define performance criteria
4. **SLA Definition**: Establish service level agreements`
  },
  {
    name: 'resilience-challenger',
    type: 'reliability',
    category: 'performance-reliability',
    color: '#95A5A6',
    description: 'Resilience testing and failure recovery specialist',
    capabilities: ['resilience_testing', 'failover_testing', 'recovery_testing', 'circuit_breaker_testing'],
    sdlc_phase: 'testing',
    swarms: ['performance-scalability'],
    content: `# Resilience Challenger

You test system resilience and recovery capabilities.

## Core Responsibilities
1. **Resilience Testing**: Test failure handling
2. **Failover Testing**: Verify failover mechanisms
3. **Recovery Testing**: Validate recovery procedures
4. **Circuit Breakers**: Test circuit breaker patterns`
  },

  // Production & Monitoring (3 agents)
  {
    name: 'production-observer',
    type: 'monitor',
    category: 'production-monitoring',
    color: '#34495E',
    description: 'Production monitoring and observability specialist',
    capabilities: ['production_monitoring', 'anomaly_detection', 'observability', 'incident_analysis'],
    sdlc_phase: 'production',
    swarms: ['production-readiness'],
    content: `# Production Observer

You monitor production systems for issues and anomalies.

## Core Responsibilities
1. **Production Monitoring**: Real-time system monitoring
2. **Anomaly Detection**: Identify unusual patterns
3. **Observability Setup**: Implement comprehensive observability
4. **Incident Analysis**: Root cause analysis of issues

## Monitoring Stack
- Metrics collection
- Log aggregation
- Distributed tracing
- Alert configuration`
  },
  {
    name: 'deployment-guardian',
    type: 'validator',
    category: 'production-monitoring',
    color: '#2ECC71',
    description: 'Deployment validation and rollback specialist',
    capabilities: ['deployment_validation', 'smoke_testing', 'rollback_testing', 'canary_analysis'],
    sdlc_phase: 'deployment',
    swarms: ['production-readiness'],
    content: `# Deployment Guardian

You ensure safe deployments through validation and testing.

## Core Responsibilities
1. **Deployment Validation**: Verify deployments
2. **Smoke Testing**: Quick deployment checks
3. **Rollback Testing**: Validate rollback procedures
4. **Canary Analysis**: Monitor canary deployments`
  },
  {
    name: 'chaos-engineer',
    type: 'engineer',
    category: 'production-monitoring',
    color: '#E74C3C',
    description: 'Chaos engineering and resilience testing',
    capabilities: ['chaos_testing', 'fault_injection', 'disaster_recovery', 'game_days'],
    sdlc_phase: 'testing',
    swarms: ['performance-scalability'],
    content: `# Chaos Engineer

You introduce controlled chaos to test system resilience.

## Core Responsibilities
1. **Chaos Testing**: Introduce controlled failures
2. **Fault Injection**: Simulate various failure modes
3. **Disaster Recovery**: Test DR procedures
4. **Game Days**: Coordinate chaos experiments

## Chaos Experiments
- Network failures
- Service outages
- Resource exhaustion
- Data corruption`
  },

  // Coordination & Orchestration (4 agents)
  {
    name: 'hierarchical-coordinator',
    type: 'coordinator',
    category: 'coordination',
    color: '#9B59B6',
    description: 'Hierarchical swarm coordination with delegation',
    capabilities: ['hierarchical_coordination', 'task_delegation', 'result_aggregation', 'priority_management'],
    sdlc_phase: 'orchestration',
    swarms: ['production-readiness', 'integration-api'],
    content: `# Hierarchical Coordinator

You coordinate agents in a hierarchical structure.

## Core Responsibilities
1. **Task Delegation**: Assign tasks to sub-agents
2. **Result Aggregation**: Collect and synthesize results
3. **Priority Management**: Manage task priorities
4. **Progress Tracking**: Monitor agent progress`
  },
  {
    name: 'mesh-coordinator',
    type: 'coordinator',
    category: 'coordination',
    color: '#16A085',
    description: 'Mesh network coordination for peer-to-peer collaboration',
    capabilities: ['mesh_coordination', 'peer_collaboration', 'distributed_decisions', 'consensus_building'],
    sdlc_phase: 'orchestration',
    swarms: ['security-compliance', 'performance-scalability'],
    content: `# Mesh Coordinator

You enable peer-to-peer agent collaboration.

## Core Responsibilities
1. **Peer Coordination**: Enable agent-to-agent communication
2. **Distributed Decisions**: Facilitate group decisions
3. **Consensus Building**: Build agreement among agents
4. **Knowledge Sharing**: Share insights across agents`
  },
  {
    name: 'adaptive-coordinator',
    type: 'coordinator',
    category: 'coordination',
    color: '#F39C12',
    description: 'Adaptive coordination based on context and performance',
    capabilities: ['adaptive_coordination', 'dynamic_topology', 'performance_optimization', 'context_awareness'],
    sdlc_phase: 'orchestration',
    swarms: ['continuous-quality', 'performance-scalability'],
    content: `# Adaptive Coordinator

You adapt coordination strategies based on context.

## Core Responsibilities
1. **Dynamic Adaptation**: Change strategies as needed
2. **Performance Optimization**: Optimize agent performance
3. **Context Awareness**: Consider current context
4. **Strategy Selection**: Choose best coordination approach`
  },
  {
    name: 'context-orchestrator',
    type: 'orchestrator',
    category: 'coordination',
    color: '#8E44AD',
    description: 'Context-aware orchestration and workflow management',
    capabilities: ['workflow_orchestration', 'context_management', 'dependency_resolution', 'pipeline_coordination'],
    sdlc_phase: 'orchestration',
    swarms: ['requirements-design', 'e2e-journey'],
    content: `# Context Orchestrator

You orchestrate workflows with context awareness.

## Core Responsibilities
1. **Workflow Orchestration**: Manage complex workflows
2. **Context Management**: Maintain execution context
3. **Dependency Resolution**: Handle task dependencies
4. **Pipeline Coordination**: Coordinate CI/CD pipelines`
  },

  // Knowledge & Reporting (4 agents)
  {
    name: 'knowledge-curator',
    type: 'knowledge',
    category: 'knowledge-reporting',
    color: '#3498DB',
    description: 'Knowledge management and learning specialist',
    capabilities: ['knowledge_management', 'pattern_extraction', 'best_practices', 'lesson_learned'],
    sdlc_phase: 'continuous',
    swarms: ['continuous-quality'],
    content: `# Knowledge Curator

You manage and curate testing knowledge.

## Core Responsibilities
1. **Knowledge Management**: Organize testing knowledge
2. **Pattern Extraction**: Identify recurring patterns
3. **Best Practices**: Document best practices
4. **Lessons Learned**: Capture and share learnings`
  },
  {
    name: 'quality-storyteller',
    type: 'reporter',
    category: 'knowledge-reporting',
    color: '#27AE60',
    description: 'Quality reporting and stakeholder communication',
    capabilities: ['quality_reporting', 'metrics_visualization', 'stakeholder_communication', 'trend_analysis'],
    sdlc_phase: 'reporting',
    swarms: ['production-readiness'],
    content: `# Quality Storyteller

You tell the quality story through reports and visualizations.

## Core Responsibilities
1. **Quality Reporting**: Create quality reports
2. **Metrics Visualization**: Visualize test metrics
3. **Stakeholder Communication**: Communicate findings
4. **Trend Analysis**: Identify quality trends`
  },
  {
    name: 'test-strategist',
    type: 'strategist',
    category: 'knowledge-reporting',
    color: '#E67E22',
    description: 'Testing strategy and continuous improvement',
    capabilities: ['strategy_planning', 'process_improvement', 'tool_selection', 'maturity_assessment'],
    sdlc_phase: 'planning',
    swarms: ['continuous-quality'],
    content: `# Test Strategist

You develop testing strategies and drive improvements.

## Core Responsibilities
1. **Strategy Planning**: Develop test strategies
2. **Process Improvement**: Improve testing processes
3. **Tool Selection**: Recommend testing tools
4. **Maturity Assessment**: Assess testing maturity`
  },
  {
    name: 'mocking-agent',
    type: 'developer',
    category: 'knowledge-reporting',
    color: '#95A5A6',
    description: 'Mock creation and test double specialist',
    capabilities: ['mock_creation', 'stub_generation', 'fake_services', 'virtualization'],
    sdlc_phase: 'development',
    swarms: ['development-tdd'],
    content: `# Mocking Agent

You create mocks, stubs, and test doubles.

## Core Responsibilities
1. **Mock Creation**: Generate mock objects
2. **Stub Generation**: Create stub implementations
3. **Fake Services**: Build fake service implementations
4. **Service Virtualization**: Virtualize external dependencies`
  }
];

// SDLC-aligned swarm configurations
const swarmConfigurations = [
  {
    name: 'requirements-design',
    description: 'Early quality gates, testability assessment, design validation',
    agents: ['requirements-explorer', 'design-challenger', 'spec-linter', 'test-planner'],
    strategy: 'sequential',
    priority: 'critical',
    phase: 'requirements'
  },
  {
    name: 'development-tdd',
    description: 'Test-first development, unit testing, mocking support',
    agents: ['tdd-pair-programmer', 'test-generator', 'mocking-agent', 'functional-positive'],
    strategy: 'parallel',
    priority: 'high',
    phase: 'development'
  },
  {
    name: 'integration-api',
    description: 'Integration testing, API validation, contract testing',
    agents: ['functional-flow-validator', 'test-runner', 'security-auth', 'performance-analyzer'],
    strategy: 'hierarchical',
    priority: 'high',
    phase: 'integration'
  },
  {
    name: 'security-compliance',
    description: 'Security assessment, compliance validation, accessibility',
    agents: ['security-sentinel', 'security-injection', 'accessibility-advocate', 'risk-oracle'],
    strategy: 'parallel',
    priority: 'critical',
    phase: 'testing'
  },
  {
    name: 'performance-scalability',
    description: 'Performance testing, load testing, chaos engineering',
    agents: ['performance-hunter', 'performance-planner', 'resilience-challenger', 'chaos-engineer'],
    strategy: 'adaptive',
    priority: 'high',
    phase: 'testing'
  },
  {
    name: 'e2e-journey',
    description: 'End-to-end testing, user journey validation, edge cases',
    agents: ['exploratory-testing-navigator', 'functional-stateful', 'functional-negative', 'test-analyzer'],
    strategy: 'sequential',
    priority: 'critical',
    phase: 'testing'
  },
  {
    name: 'production-readiness',
    description: 'Pre-production validation, deployment verification, monitoring',
    agents: ['deployment-guardian', 'production-observer', 'regression-guardian', 'quality-storyteller'],
    strategy: 'hierarchical',
    priority: 'critical',
    phase: 'deployment'
  },
  {
    name: 'continuous-quality',
    description: 'Continuous improvement, knowledge management, mutation testing',
    agents: ['test-strategist', 'knowledge-curator', 'mutation-testing-swarm', 'test-analyzer'],
    strategy: 'adaptive',
    priority: 'medium',
    phase: 'continuous'
  }
];

async function initializeAgents() {
  const claudeDir = path.join(process.cwd(), '.claude');
  const agentsDir = path.join(claudeDir, 'agents');

  console.log('🚀 Initializing Optimized QE Framework agents...\n');

  // Create directories
  await fs.ensureDir(agentsDir);

  // Create category directories and agent files
  for (const agent of qeAgents) {
    const categoryDir = path.join(agentsDir, agent.category);
    await fs.ensureDir(categoryDir);

    const agentPath = path.join(categoryDir, `${agent.name}.md`);

    // Create agent file content with enhanced frontmatter
    const frontMatter = {
      name: agent.name,
      type: agent.type,
      color: agent.color,
      description: agent.description,
      category: agent.category,
      capabilities: agent.capabilities,
      sdlc_phase: agent.sdlc_phase,
      swarms: agent.swarms || [],
      priority: 'high',
      estimatedTime: 'medium',
      maxConcurrentTasks: ['risk-oracle', 'test-runner', 'performance-analyzer'].includes(agent.name) ? 3 : 2,
      hooks: {
        pre: `echo "🎯 ${agent.name} starting: $TASK"
npx claude-flow@alpha hooks pre-task --description "$TASK"
npx claude-flow@alpha memory store "${agent.name}_context_$(date +%s)" "$TASK"`,
        post: `echo "✅ ${agent.name} complete"
npx claude-flow@alpha hooks post-task --task-id "$TASK_ID"
npx claude-flow@alpha memory search "${agent.name}_*" | head -3`
      }
    };

    const content = `---
${yaml.stringify(frontMatter)}---

${agent.content}

## Analysis Output Format

\`\`\`yaml
${agent.name.replace(/-/g, '_')}_analysis:
  summary: "Analysis summary"
  phase: "${agent.sdlc_phase}"
  findings:
    - type: "finding type"
      severity: "critical|high|medium|low"
      description: "Finding details"
      location: "Where found"
      recommendation: "How to fix"

  metrics:
    coverage: "percentage"
    issues_found: count
    risk_level: "high|medium|low"
    confidence: "percentage"

  recommendations:
    immediate: []
    short_term: []
    long_term: []

  collaboration:
    upstream_agents: []
    downstream_agents: []
    shared_context: {}
\`\`\`

## Collaboration Protocol

1. Store findings in shared memory with key: \`${agent.name}_findings\`
2. Check for related agent results in memory
3. Coordinate with swarm members: ${(agent.swarms || []).join(', ')}
4. Update metrics after each analysis
5. Notify downstream agents when complete

## Priority Levels

- **Critical**: Immediate action required (blocks release)
- **High**: Address within current sprint
- **Medium**: Plan for next release
- **Low**: Track for future improvements

## Integration Points

- **Memory**: Use EnhancedQEMemory for cross-agent knowledge sharing
- **Coordination**: Integrate with QECoordinator for phase management
- **Monitoring**: Report metrics to PerformanceMonitor
- **Queue**: Use AsyncOperationQueue for task management
`;

    await fs.writeFile(agentPath, content);
    console.log(`✅ Created agent: ${agent.category}/${agent.name}`);
  }

  // Create swarm configurations directory
  const swarmsDir = path.join(claudeDir, 'swarms');
  await fs.ensureDir(swarmsDir);

  // Create swarm configuration files
  for (const swarm of swarmConfigurations) {
    const swarmPath = path.join(swarmsDir, `${swarm.name}.yaml`);
    await fs.writeFile(swarmPath, yaml.stringify(swarm));
    console.log(`✅ Created swarm: ${swarm.name}`);
  }

  // Create agent registry
  const registry = {
    version: '2.0.0',
    agents: qeAgents.map(a => ({
      name: a.name,
      type: a.type,
      category: a.category,
      path: `${a.category}/${a.name}.md`,
      capabilities: a.capabilities,
      sdlc_phase: a.sdlc_phase,
      swarms: a.swarms || []
    })),
    categories: [...new Set(qeAgents.map(a => a.category))],
    swarms: swarmConfigurations.map(s => s.name),
    total: qeAgents.length
  };

  await fs.writeJson(path.join(agentsDir, 'registry.json'), registry, { spaces: 2 });
  console.log('\n✅ Created agent registry');

  // Create commands directory structure
  const commandsDir = path.join(claudeDir, 'commands');
  await fs.ensureDir(commandsDir);

  // Create QE-specific commands
  const qeCommandsDir = path.join(commandsDir, 'qe');
  await fs.ensureDir(qeCommandsDir);

  const qeCommands = {
    'spawn.md': `# Spawn QE Agent Command

Spawn optimized QE agents for specific testing tasks.

## Usage
\`\`\`bash
aqe spawn <agent-name> --task "<description>"
aqe spawn --swarm <swarm-name> --objective "<goal>"
\`\`\`

## Available Agents (35 total)
${qeAgents.map(a => `- **${a.name}**: ${a.description}`).join('\n')}

## Available Swarms (8 total)
${swarmConfigurations.map(s => `- **${s.name}**: ${s.description}`).join('\n')}

## Examples
\`\`\`bash
# Spawn individual agent
aqe spawn risk-oracle --task "Analyze authentication system"

# Spawn entire swarm
aqe spawn --swarm security-compliance --objective "Full security audit"

# Spawn with specific strategy
aqe spawn --swarm e2e-journey --strategy sequential
\`\`\`
`,
    'orchestrate.md': `# Orchestrate QE Testing

Orchestrate comprehensive testing using SDLC-aligned swarms.

## Usage
\`\`\`bash
aqe orchestrate --phase <sdlc-phase> --objective "<goal>"
aqe orchestrate --swarm <swarm-name> --strategy <strategy>
\`\`\`

## SDLC Phases
- **requirements**: Requirements analysis and validation
- **design**: Design review and architecture validation
- **development**: TDD and unit testing
- **integration**: Integration and API testing
- **testing**: Comprehensive testing phase
- **deployment**: Deployment validation
- **production**: Production monitoring
- **continuous**: Continuous improvement

## Strategies
- **parallel**: All agents work simultaneously (fastest)
- **sequential**: Agents build on each other's work (thorough)
- **hierarchical**: Leaders analyze first, then delegate (organized)
- **adaptive**: Dynamic selection based on analysis (smart)

## Examples
\`\`\`bash
# Orchestrate by phase
aqe orchestrate --phase testing --objective "Complete test coverage"

# Orchestrate specific swarm
aqe orchestrate --swarm e2e-journey --strategy sequential

# Full SDLC orchestration
aqe orchestrate --phase all --objective "Release validation"
\`\`\`
`,
    'analyze.md': `# Analyze with QE Agents

Run comprehensive analysis using specialized QE agents.

## Usage
\`\`\`bash
aqe analyze --type <analysis-type> --target <path>
aqe analyze --agent <agent-name> --objective "<goal>"
\`\`\`

## Analysis Types
- **requirements**: Analyze requirements for testability
- **risk**: Risk assessment and prioritization
- **security**: Security vulnerability analysis
- **performance**: Performance bottleneck analysis
- **coverage**: Test coverage analysis
- **quality**: Overall quality assessment

## Examples
\`\`\`bash
# Analyze requirements
aqe analyze --type requirements --target ./docs/requirements.md

# Risk analysis
aqe analyze --type risk --target ./src

# Security scan
aqe analyze --type security --target ./api

# Custom agent analysis
aqe analyze --agent test-analyzer --objective "Find test gaps"
\`\`\`
`
  };

  for (const [file, content] of Object.entries(qeCommands)) {
    await fs.writeFile(path.join(qeCommandsDir, file), content);
  }

  console.log('✅ Created QE commands\n');

  // Create hooks directory
  const hooksDir = path.join(claudeDir, 'hooks');
  await fs.ensureDir(hooksDir);

  const hookConfig = {
    'pre-task.sh': `#!/bin/bash
# Pre-task hook for QE agents

TASK_ID=$(uuidgen)
echo "Task ID: $TASK_ID"

# Store task context
npx claude-flow@alpha memory store "task_$TASK_ID" "$1"

# Check for dependent tasks
npx claude-flow@alpha memory search "task_*" | grep -v "$TASK_ID" | head -5

# Notify swarm members
if [ ! -z "$SWARM_ID" ]; then
  npx claude-flow@alpha hooks notify --swarm "$SWARM_ID" --message "Task $TASK_ID starting"
fi
`,
    'post-task.sh': `#!/bin/bash
# Post-task hook for QE agents

# Store results
npx claude-flow@alpha memory store "result_$1" "$2"

# Update metrics
npx claude-flow@alpha hooks metrics --update "$1"

# Notify downstream agents
npx claude-flow@alpha hooks notify --downstream "$1"

# Generate report if needed
if [ "$GENERATE_REPORT" = "true" ]; then
  npx claude-flow@alpha hooks report --task "$1"
fi
`,
    'swarm-coordinate.sh': `#!/bin/bash
# Swarm coordination hook

# Get swarm status
npx claude-flow@alpha swarm status --id "$1"

# Coordinate agents
npx claude-flow@alpha swarm coordinate --id "$1" --strategy "$2"

# Share context
npx claude-flow@alpha memory share --swarm "$1"
`
  };

  for (const [file, content] of Object.entries(hookConfig)) {
    const hookPath = path.join(hooksDir, file);
    await fs.writeFile(hookPath, content);
    await fs.chmod(hookPath, '755');
  }

  console.log('✅ Created hook scripts');

  // Create cache configuration
  const cacheDir = path.join(claudeDir, 'cache');
  await fs.ensureDir(cacheDir);

  const cacheConfig = {
    'agent-pool.json': {
      maxAgents: 35,
      categories: {
        'core-testing': { max: 12, priority: 'high' },
        'requirements-design': { max: 4, priority: 'high' },
        'risk-security': { max: 4, priority: 'critical' },
        'performance-reliability': { max: 4, priority: 'high' },
        'production-monitoring': { max: 3, priority: 'critical' },
        'coordination': { max: 4, priority: 'medium' },
        'knowledge-reporting': { max: 4, priority: 'low' }
      },
      reuseStrategy: 'lru',
      ttl: 3600000
    },
    'swarm-config.json': {
      maxSwarms: 8,
      swarms: swarmConfigurations.map(s => ({
        name: s.name,
        maxAgents: s.agents.length,
        strategy: s.strategy,
        priority: s.priority
      })),
      coordinationMode: 'adaptive'
    },
    'session-memory.json': {
      maxSessions: 100,
      sessionTTL: 7200000,
      compressionEnabled: true,
      sharedMemory: true,
      persistence: 'redis'
    }
  };

  for (const [file, config] of Object.entries(cacheConfig)) {
    await fs.writeJson(path.join(cacheDir, file), config, { spaces: 2 });
  }

  console.log('✅ Created cache configuration');

  // Summary
  console.log('\n📊 Initialization Summary:');
  console.log(`  • Agents created: ${qeAgents.length}`);
  console.log(`  • Categories: ${[...new Set(qeAgents.map(a => a.category))].join(', ')}`);
  console.log(`  • Swarms configured: ${swarmConfigurations.length}`);
  console.log(`  • SDLC phases covered: All phases from requirements to production`);
  console.log(`  • Location: ${agentsDir}`);
  console.log('\n🎉 Optimized QE Framework agents initialized successfully!');
  console.log('\n💡 Next steps:');
  console.log('  1. Run "aqe spawn --help" to see available agents');
  console.log('  2. Run "aqe orchestrate --phase testing" to start testing');
  console.log('  3. Check .claude/swarms/ for pre-configured testing swarms');
}

// Run initialization
if (require.main === module) {
  initializeAgents().catch(console.error);
}

module.exports = { initializeAgents, qeAgents, swarmConfigurations };