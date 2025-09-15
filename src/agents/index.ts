/**
 * Agent exports for Agentic QE Framework
 */

// Base Agent
export { BaseAgent } from './base-agent';

// Core QE Agents
export { RequirementsExplorerAgent } from './requirements-explorer';
export { RiskOracleAgent } from './risk-oracle';
export { SecuritySentinelAgent } from './security-sentinel';
export { PerformanceHunterAgent } from './performance-hunter';
export { ExploratoryNavigatorAgent } from './exploratory-navigator';

// Swarm Coordination Agents
export { AdaptiveCoordinatorAgent } from './adaptive-coordinator';
export { CollectiveIntelligenceCoordinatorAgent } from './collective-intelligence-coordinator';
export { HierarchicalCoordinatorAgent } from './hierarchical-coordinator';
export { MeshCoordinatorAgent } from './mesh-coordinator';

// Consensus & Distributed Agents
export { ByzantineCoordinator } from './byzantine-coordinator';
export { ByzantineCoordinator as ByzantineCoordinatorAgent } from './byzantine-coordinator';
export { RaftManager } from './raft-manager';
export { RaftManager as RaftManagerAgent } from './raft-manager';
export { GossipCoordinator } from './gossip-coordinator';
export { GossipCoordinator as GossipCoordinatorAgent } from './gossip-coordinator';
export { QuorumManager } from './quorum-manager';
export { QuorumManager as QuorumManagerAgent } from './quorum-manager';
export { CRDTSynchronizer } from './crdt-synchronizer';
export { CRDTSynchronizer as CRDTSynchronizerAgent } from './crdt-synchronizer';

// SPARC Methodology Agents
export { SPARCCoordinatorAgent } from './sparc-coord';
export { SPARCCoderAgent } from './sparc-coder';
export { SpecificationAgent } from './specification';
export { PseudocodeAgent } from './pseudocode';
export { ArchitectureAgent } from './architecture';
export { RefinementAgent } from './refinement';

// Testing & Quality Agents
export { TDDPairProgrammerAgent } from './tdd-pair-programmer';
export { MutationTestingSwarmAgent } from './mutation-testing-swarm';
export { FunctionalStatefulAgent } from './functional-stateful';
export { SpecLinterAgent } from './spec-linter';
export { QualityStorytellerAgent } from './quality-storyteller';
export { DesignChallengerAgent } from './design-challenger';
export { PatternRecognitionSageAgent } from './pattern-recognition-sage';
export { ResilienceChallengerAgent } from './resilience-challenger';

// GitHub & Deployment Agents
export { GitHubModesAgent } from './github-modes';
export { PRManagerAgent } from './pr-manager';
export { CodeReviewSwarmAgent } from './code-review-swarm';
export { IssueTrackerAgent } from './issue-tracker';
export { ReleaseManagerAgent } from './release-manager';
export { WorkflowAutomationAgent } from './workflow-automation';
export { DeploymentGuardianAgent } from './deployment-guardian';
export { ProductionObserverAgent } from './production-observer';

// Context & Security Agents
export { ContextOrchestrator } from './context-orchestrator';
export { ContextOrchestrator as ContextOrchestratorAgent } from './context-orchestrator';
export { SwarmMemoryManager } from './swarm-memory-manager';
export { SwarmMemoryManager as SwarmMemoryManagerAgent } from './swarm-memory-manager';
export { SecurityInjection } from './security-injection';
export { SecurityInjection as SecurityInjectionAgent } from './security-injection';