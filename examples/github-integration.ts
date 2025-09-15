#!/usr/bin/env node

/**
 * GitHub Integration Example
 * Demonstrates automated GitHub workflows with QE agents
 */

import { AgenticQE } from '../src/index';
import {
  GitHubModesAgent,
  PRManagerAgent,
  CodeReviewSwarmAgent,
  IssueTrackerAgent,
  ReleaseManagerAgent,
  WorkflowAutomationAgent
} from '../src/agents';
import {
  AgentType,
  AgentConfig,
  SecurityReport,
  RSTHeuristic
} from '../src/core/types';
import chalk from 'chalk';

interface PullRequest {
  number: number;
  title: string;
  author: string;
  files: number;
  additions: number;
  deletions: number;
}

interface RepositoryContext {
  owner: string;
  repo: string;
  branch: string;
  pr: PullRequest;
}

interface GitHubModesResult {
  mode: string;
  agentsSpawned: number;
  qualityGates: string[];
  automationLevel: number;
}

interface QualityGate {
  name: string;
  passed: boolean;
  status: string;
}

interface PRResult {
  status: string;
  reviewers: string[];
  checks: string[];
  qualityScore: number;
  qualityGates: QualityGate[];
}

interface AgentFinding {
  agent: string;
  issues: number;
  severity: string;
}

interface CodeReviewResult {
  agents: string[];
  totalIssues: number;
  autoFixes: number;
  consensus: boolean;
  agentFindings: AgentFinding[];
}

interface Issue {
  title: string;
  type: string;
}

interface IssueContext extends RepositoryContext {
  issues: Issue[];
}

interface TriageResult {
  title: string;
  priority: string;
  label: string;
  assignee: string;
}

interface IssueResult {
  processed: number;
  autoClassified: number;
  prioritized: number;
  avgResolutionTime: number;
  triageResults: TriageResult[];
}

interface ReleaseContext extends RepositoryContext {
  version: string;
  changelog: string[];
  environments: string[];
}

interface ReleaseResult {
  version: string;
  strategy: string;
  environments: string[];
  qualityGatePassed: boolean;
  rollbackReady: boolean;
}

interface WorkflowInfo {
  name: string;
  triggers: string[];
}

interface WorkflowResult {
  workflowsGenerated: number;
  optimizationPercent: number;
  costSavings: number;
  securityScore: number;
  workflows: WorkflowInfo[];
}

interface Dashboard {
  'PR Status': string;
  'Code Quality': string;
  'Security Issues': number;
  'Test Coverage': string;
  'Deployment Ready': string;
  'Automation Level': string;
}

async function demonstrateGitHubIntegration(): Promise<void> {
  console.log(chalk.blue.bold('\n🐙 GitHub Integration Example\n'));

  const aqe = new AgenticQE({
    security: {
      enablePromptInjectionProtection: true,
      enableAuditLogging: true,
      rateLimiting: { requests: 100, window: 60000 }
    }
  });

  // Repository context
  const repoContext: RepositoryContext = {
    owner: 'agentic-qe',
    repo: 'payment-service',
    branch: 'feature/add-stripe-integration',
    pr: {
      number: 42,
      title: 'Add Stripe payment integration',
      author: 'developer-jane',
      files: 15,
      additions: 500,
      deletions: 50
    }
  };

  console.log(chalk.yellow('Repository Context'));
  console.log('─'.repeat(50));
  console.log(`Repository: ${repoContext.owner}/${repoContext.repo}`);
  console.log(`Branch: ${repoContext.branch}`);
  console.log(`PR #${repoContext.pr.number}: ${repoContext.pr.title}`);
  console.log(`Changes: +${repoContext.pr.additions} -${repoContext.pr.deletions}`);

  // 1. GitHub Modes - Workflow Orchestration
  console.log(chalk.yellow('\n1. GitHub Modes - Workflow Orchestration'));
  console.log('─'.repeat(40));

  const githubModesConfig: AgentConfig = {
    type: 'github-modes' as AgentType,
    pactLevel: 4,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['workflow-orchestration'],
      pactLevel: 4,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    learning: { enabled: true }
  };

  const githubModes = aqe.createAgent('github-modes' as AgentType, githubModesConfig);

  const modesObservation = await githubModes.perceive(repoContext);
  const modesDecision = await githubModes.decide(modesObservation);
  const modesResult = await githubModes.act(modesDecision) as GitHubModesResult;

  console.log(chalk.green('✓ Workflow mode activated'));
  console.log(`  Mode: ${modesResult.mode}`);
  console.log(`  Agents spawned: ${modesResult.agentsSpawned}`);
  console.log(`  Quality gates: ${modesResult.qualityGates.length}`);
  console.log(`  Automation level: ${modesResult.automationLevel}/10`);

  // 2. PR Manager - Automated PR Lifecycle
  console.log(chalk.yellow('\n2. PR Manager - Automated Lifecycle'));
  console.log('─'.repeat(40));

  const prManager = aqe.createAgent('pr-manager' as AgentType, {
    type: 'pr-manager' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['pr-management'],
      pactLevel: 3,
      rstHeuristics: ['SFDIPOT', 'CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    learning: { enabled: true }
  });

  const prObservation = await prManager.perceive(repoContext);
  const prDecision = await prManager.decide(prObservation);
  const prResult = await prManager.act(prDecision) as PRResult;

  console.log(chalk.green('✓ PR lifecycle management active'));
  console.log(`  Status: ${prResult.status}`);
  console.log(`  Reviewers assigned: ${prResult.reviewers.join(', ')}`);
  console.log(`  Checks running: ${prResult.checks.length}`);
  console.log(`  Quality score: ${prResult.qualityScore}/10`);

  // Show quality gate results
  console.log(chalk.cyan('\n  Quality Gates:'));
  prResult.qualityGates.forEach(gate => {
    const icon = gate.passed ? '✅' : '❌';
    console.log(`  ${icon} ${gate.name}: ${gate.status}`);
  });

  // 3. Code Review Swarm - Multi-Agent Review
  console.log(chalk.yellow('\n3. Code Review Swarm - Multi-Agent Analysis'));
  console.log('─'.repeat(40));

  const reviewSwarm = aqe.createAgent('code-review-swarm' as AgentType, {
    type: 'code-review-swarm' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 10,
      supportedTaskTypes: ['code-review'],
      pactLevel: 3,
      rstHeuristics: ['CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'confidential' as any
    },
    learning: { enabled: true }
  });

  const swarmObservation = await reviewSwarm.perceive(repoContext);
  const swarmDecision = await reviewSwarm.decide(swarmObservation);
  const swarmResult = await reviewSwarm.act(swarmDecision) as CodeReviewResult;

  console.log(chalk.green('✓ Code review swarm deployed'));
  console.log(`  Agents active: ${swarmResult.agents.length}`);
  console.log(`  Issues found: ${swarmResult.totalIssues}`);
  console.log(`  Auto-fixes available: ${swarmResult.autoFixes}`);
  console.log(`  Consensus reached: ${swarmResult.consensus ? 'Yes' : 'No'}`);

  // Show agent findings
  console.log(chalk.cyan('\n  Agent Findings:'));
  swarmResult.agentFindings.forEach(finding => {
    console.log(`  • ${finding.agent}: ${finding.issues} issues (${finding.severity})`);
  });

  // 4. Issue Tracker - Intelligent Issue Management
  console.log(chalk.yellow('\n4. Issue Tracker - Intelligent Triage'));
  console.log('─'.repeat(40));

  const issueTracker = aqe.createAgent('issue-tracker' as AgentType, {
    type: 'issue-tracker' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['issue-management'],
      pactLevel: 3,
      rstHeuristics: ['FEW_HICCUPPS'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'internal' as any
    },
    learning: { enabled: true }
  });

  // Simulate issue creation from PR
  const issueContext: IssueContext = {
    ...repoContext,
    issues: [
      { title: 'Payment validation failing', type: 'bug' },
      { title: 'Add retry mechanism', type: 'enhancement' },
      { title: 'Security: API key exposure', type: 'security' }
    ]
  };

  const issueObservation = await issueTracker.perceive(issueContext);
  const issueDecision = await issueTracker.decide(issueObservation);
  const issueResult = await issueTracker.act(issueDecision) as IssueResult;

  console.log(chalk.green('✓ Issue triage complete'));
  console.log(`  Issues processed: ${issueResult.processed}`);
  console.log(`  Auto-classified: ${issueResult.autoClassified}`);
  console.log(`  Priority assignments: ${issueResult.prioritized}`);
  console.log(`  Predicted resolution time: ${issueResult.avgResolutionTime} hours`);

  // Show issue triage results
  console.log(chalk.cyan('\n  Triage Results:'));
  issueResult.triageResults.forEach(issue => {
    console.log(`  • ${issue.title}`);
    console.log(`    Priority: ${issue.priority} | Label: ${issue.label} | Assignee: ${issue.assignee}`);
  });

  // 5. Release Manager - Automated Release
  console.log(chalk.yellow('\n5. Release Manager - Automated Deployment'));
  console.log('─'.repeat(40));

  const releaseManager = aqe.createAgent('release-manager' as AgentType, {
    type: 'release-manager' as AgentType,
    pactLevel: 4,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['release-management'],
      pactLevel: 4,
      rstHeuristics: ['CRUSSPIC'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: true,
      learningEnabled: true,
      securityClearance: 'confidential' as any
    },
    learning: { enabled: true }
  });

  const releaseContext: ReleaseContext = {
    ...repoContext,
    version: '2.1.0',
    changelog: ['Stripe integration', 'Bug fixes', 'Performance improvements'],
    environments: ['staging', 'production']
  };

  const releaseObservation = await releaseManager.perceive(releaseContext);
  const releaseDecision = await releaseManager.decide(releaseObservation);
  const releaseResult = await releaseManager.act(releaseDecision) as ReleaseResult;

  console.log(chalk.green('✓ Release automation complete'));
  console.log(`  Version: ${releaseResult.version}`);
  console.log(`  Strategy: ${releaseResult.strategy}`);
  console.log(`  Environments: ${releaseResult.environments.join(' → ')}`);
  console.log(`  Quality gate: ${releaseResult.qualityGatePassed ? 'Passed' : 'Failed'}`);
  console.log(`  Rollback ready: ${releaseResult.rollbackReady ? 'Yes' : 'No'}`);

  // 6. Workflow Automation - GitHub Actions
  console.log(chalk.yellow('\n6. Workflow Automation - GitHub Actions'));
  console.log('─'.repeat(40));

  const workflowAutomation = aqe.createAgent('workflow-automation' as AgentType, {
    type: 'workflow-automation' as AgentType,
    pactLevel: 3,
    capabilities: {
      maxConcurrentTasks: 5,
      supportedTaskTypes: ['workflow-automation'],
      pactLevel: 3,
      rstHeuristics: ['SFDIPOT'] as RSTHeuristic[],
      contextAwareness: true,
      explainability: false,
      learningEnabled: false,
      securityClearance: 'internal' as any
    },
    learning: { enabled: false }
  });

  const workflowObservation = await workflowAutomation.perceive(repoContext);
  const workflowDecision = await workflowAutomation.decide(workflowObservation);
  const workflowResult = await workflowAutomation.act(workflowDecision) as WorkflowResult;

  console.log(chalk.green('✓ Workflow automation configured'));
  console.log(`  Workflows generated: ${workflowResult.workflowsGenerated}`);
  console.log(`  Pipeline optimization: ${workflowResult.optimizationPercent}%`);
  console.log(`  Estimated cost savings: $${workflowResult.costSavings}/month`);
  console.log(`  Security hardening: ${workflowResult.securityScore}/10`);

  // Show generated workflows
  console.log(chalk.cyan('\n  Generated Workflows:'));
  workflowResult.workflows.forEach(workflow => {
    console.log(`  • ${workflow.name}: ${workflow.triggers.join(', ')}`);
  });

  // Summary Dashboard
  console.log(chalk.blue('\n📊 GitHub Integration Dashboard'));
  console.log('─'.repeat(50));

  const dashboard: Dashboard = {
    'PR Status': prResult.status,
    'Code Quality': `${prResult.qualityScore}/10`,
    'Security Issues': swarmResult.agentFindings.find(f => f.agent === 'security')?.issues || 0,
    'Test Coverage': '92%',
    'Deployment Ready': releaseResult.qualityGatePassed ? '✅' : '❌',
    'Automation Level': `${modesResult.automationLevel}/10`
  };

  console.table(dashboard);

  // Recommendations
  console.log(chalk.blue('\n💡 Automation Recommendations'));
  console.log('─'.repeat(50));

  const recommendations: string[] = [
    'Enable auto-merge for PRs passing all quality gates',
    'Configure security scanning on every commit',
    'Set up canary deployments for production releases',
    'Use predictive analytics for issue prioritization',
    'Implement cost optimization for GitHub Actions'
  ];

  recommendations.forEach(rec => {
    console.log(`• ${rec}`);
  });

  // Security Report
  const securityReport: SecurityReport = aqe.getSecurityReport();
  console.log(chalk.blue('\n🔒 Security Integration'));
  console.log('─'.repeat(50));
  console.log(`GitHub token validation: ✅`);
  console.log(`Webhook signatures verified: ${securityReport.totalValidations}`);
  console.log(`Suspicious activities blocked: ${securityReport.blockedRequests.length}`);

  console.log(chalk.green.bold('\n✅ GitHub Integration Demonstration Complete!\n'));
}

// Run the example
if (require.main === module) {
  demonstrateGitHubIntegration()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    });
}

export { demonstrateGitHubIntegration };