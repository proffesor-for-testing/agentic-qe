/**
 * Core types for Agentic QE Framework
 * Based on claude-flow architecture with QE-specific enhancements
 */

// Agent Identity
export interface AgentId {
  id: string;
  swarmId: string;
  type: AgentType;
  instance: number;
}

// QE-specific agent types
export type AgentType =
  | 'context-orchestrator'
  | 'requirements-explorer'
  | 'risk-oracle'
  | 'security-sentinel'
  | 'performance-hunter'
  | 'exploratory-navigator'
  | 'tdd-programmer'
  | 'deployment-guardian'
  | 'production-observer'
  | 'pattern-sage'
  | 'quality-storyteller'
  | 'sparc-coord'
  | 'sparc-coder'
  | 'specification'
  | 'pseudocode'
  | 'architecture'
  | 'refinement'
  | 'byzantine-coordinator'
  | 'raft-manager'
  | 'gossip-coordinator'
  | 'quorum-manager'
  | 'crdt-synchronizer'
  | 'github-modes'
  | 'pr-manager'
  | 'code-review-swarm'
  | 'hierarchical-coordinator'
  | 'mesh-coordinator'
  | 'adaptive-coordinator';

// Agent Status
export type AgentStatus =
  | 'initializing'
  | 'idle'
  | 'busy'
  | 'error'
  | 'terminating'
  | 'terminated';

// PACT Framework Levels
export enum PACTLevel {
  PASSIVE = 1,      // Passive - requires human input
  COLLABORATIVE = 2, // Collaborative - works with humans
  AUTONOMOUS = 3,    // Autonomous - independent operation
  PROACTIVE = 4      // Proactive - anticipates needs
}

// Agent Capabilities
export interface AgentCapabilities {
  maxConcurrentTasks: number;
  supportedTaskTypes: TaskType[];
  pactLevel: PACTLevel;
  rstHeuristics: RSTHeuristic[];
  contextAwareness: boolean;
  explainability: boolean;
  learningEnabled: boolean;
  securityClearance: SecurityLevel;
}

// RST (Rapid Software Testing) Heuristics
export type RSTHeuristic =
  | 'SFDIPOT'     // Structure, Function, Data, Interfaces, Platform, Operations, Time
  | 'FEW_HICCUPPS' // Familiarity, Explainability, World, History, Image, Comparable, Claims, Users, Product, Purpose, Statutes
  | 'CRUSSPIC'    // Capability, Reliability, Usability, Security, Scalability, Performance, Installability, Compatibility
  | 'RCRCRC'      // Recent, Core, Risk, Configuration, Repaired, Chronic;

// Security Levels
export enum SecurityLevel {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  SECRET = 'secret'
}

// Task Definition
export interface TaskDefinition {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  context: TaskContext;
  requirements?: string[];
  constraints: TaskConstraints;
  dependencies: string[];
  expectedOutcome: string;
  metadata: Record<string, any>;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  decision?: AgentDecision;
  confidence?: number;
  error?: string;
  metrics?: AgentMetrics;
}

export type TaskType =
  | 'analyze-requirements'
  | 'assess-risk'
  | 'generate-tests'
  | 'execute-tests'
  | 'exploratory-testing'
  | 'security-scan'
  | 'performance-test'
  | 'code-review'
  | 'deployment-validation'
  | 'production-monitoring'
  | 'sparc-specification'
  | 'sparc-pseudocode'
  | 'sparc-architecture'
  | 'sparc-refinement'
  | 'consensus-coordination'
  | 'swarm-orchestration'
  | string; // Allow any string for flexibility

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskContext {
  domain?: string;
  environment?: string;
  testingPhase?: TestingPhase | string;
  qualityGates?: QualityGate[];
  riskLevel?: RiskLevel;
  application?: any;
  requirements?: string[];
  securityRequirements?: SecurityRequirement[];
  sla?: any;
  [key: string]: any; // Allow additional properties
}

export type TestingPhase =
  | 'requirements'
  | 'design'
  | 'development'
  | 'integration'
  | 'system'
  | 'acceptance'
  | 'production';

export interface QualityGate {
  name: string;
  criteria: string;
  threshold: number;
  mandatory: boolean;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface TaskConstraints {
  timeLimit?: number;
  resourceLimit?: ResourceLimit;
  qualityThreshold?: number;
  securityRequirements?: SecurityRequirement[];
}

export interface ResourceLimit {
  cpu: number;
  memory: number;
  network: number;
}

export interface SecurityRequirement {
  type: 'authentication' | 'authorization' | 'encryption' | 'audit';
  level: SecurityLevel;
  mandatory: boolean;
}

// Agent Decision with Explainability
export interface AgentDecision {
  id: string;
  agentId: string;
  timestamp: Date;
  action: string;
  reasoning: ExplainableReasoning;
  confidence: number;
  alternatives: Alternative[];
  risks: Risk[];
  recommendations: string[];
  metadata?: any; // Additional metadata for action parameters
}

export interface ExplainableReasoning {
  factors: ReasoningFactor[];
  heuristics: string[];
  evidence: Evidence[];
  assumptions?: string[];
  limitations?: string[];
}

export interface ReasoningFactor {
  name: string;
  weight: number;
  value?: any;
  impact: 'critical' | 'high' | 'medium' | 'low' | 'positive' | 'negative' | 'neutral';
  explanation: string;
}

export interface Evidence {
  type: 'historical' | 'analytical' | 'empirical' | 'heuristic' | 'risk' | 'vulnerability' | 'bottleneck' | 'exploration-path' | 'quality' | 'quantitative';
  source: string;
  confidence: number;
  description?: string;
  details?: any;
}

export interface Alternative {
  action: string;
  confidence: number;
  pros?: string[];
  cons?: string[];
  reason: string;
  impact?: string;
}

export interface Risk {
  id: string;
  type?: string;
  category?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  probability: number;
  impact: 'critical' | 'high' | 'medium' | 'low' | number;
  description?: string;
  mitigation?: string;
  confidence?: number;
}

// Memory Types
export interface MemoryEntry {
  id: string;
  key: string;
  value: any;
  type: MemoryType;
  owner: AgentId;
  permissions: MemoryPermissions;
  metadata: MemoryMetadata;
  version: number;
  created: Date;
  updated: Date;
  accessed: Date;
  ttl?: number;
}

export type MemoryType =
  | 'state'
  | 'knowledge'
  | 'experience'
  | 'decision'
  | 'metric'
  | 'artifact'
  | 'conversation'
  | 'test-result'
  | 'requirement'
  | 'risk-assessment';

export interface MemoryPermissions {
  read: AccessLevel;
  write: AccessLevel;
  delete: AccessLevel;
  share: AccessLevel;
}

export type AccessLevel = 'private' | 'team' | 'swarm' | 'public';

export interface MemoryMetadata {
  tags: string[];
  partition: string;
  consistency: ConsistencyLevel;
  replication: number;
  encryption: boolean;
  compression: boolean;
  type?: MemoryType;
  owner?: AgentId;
  ttl?: number;
}

export type ConsistencyLevel = 'strong' | 'eventual' | 'weak';

// Agent Metrics
export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  averageExecutionTime: number;
  successRate: number;
  cpuUsage: number;
  memoryUsage: number;
  testCoverage: number;
  bugDetectionRate: number;
  falsePositiveRate: number;
  collaborationScore: number;
  learningProgress: number;
  explainabilityScore: number;
}

// QE-specific Metrics
export interface QEMetrics extends AgentMetrics {
  requirementsAnalyzed: number;
  ambiguitiesDetected: number;
  risksIdentified: number;
  testsGenerated: number;
  testsExecuted: number;
  defectsFound: number;
  securityVulnerabilities: number;
  performanceBottlenecks: number;
  exploratoryFindings: number;
  automationCoverage: number;
}

// Agent Configuration
export interface AgentConfig {
  name: string;
  type: AgentType;
  pactLevel: PACTLevel;
  capabilities: Partial<AgentCapabilities>;
  environment: AgentEnvironment;
  learning: LearningConfig;
  security: SecurityConfig;
  collaboration: CollaborationConfig;
  explainability: ExplainabilityConfig;
}

export interface AgentEnvironment {
  runtime: 'node' | 'deno' | 'browser';
  version: string;
  workingDirectory: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  timeout: number;
}

export interface LearningConfig {
  enabled: boolean;
  strategy: 'reinforcement' | 'supervised' | 'unsupervised';
  learningRate: number;
  memoryRetention: number;
  experienceSharing: boolean;
}

export interface SecurityConfig {
  enablePromptInjectionProtection: boolean;
  enableOutputSanitization: boolean;
  enableAuditLogging: boolean;
  rateLimiting: {
    requests: number;
    window: number;
  };
  permissions: string[];
}

export interface CollaborationConfig {
  maxCollaborators: number;
  communicationProtocol: 'direct' | 'broadcast' | 'pubsub';
  consensusRequired: boolean;
  sharingStrategy: 'selective' | 'open' | 'restricted';
}

export interface ExplainabilityConfig {
  enabled: boolean;
  detailLevel: 'minimal' | 'standard' | 'detailed';
  includeAlternatives: boolean;
  includeConfidence: boolean;
  includeEvidence: boolean;
}

// Swarm Types
export interface SwarmConfig {
  id: string;
  name: string;
  topology: SwarmTopology;
  agents: AgentId[];
  coordinatorId?: string;
  consensus: ConsensusProtocol;
  communication: CommunicationProtocol;
  objectives: string[];
  constraints: SwarmConstraints;
}

export type SwarmTopology = 'hierarchical' | 'mesh' | 'star' | 'ring' | 'adaptive';

export type ConsensusProtocol = 'byzantine' | 'raft' | 'gossip' | 'quorum' | 'crdt';

export type CommunicationProtocol = 'broadcast' | 'multicast' | 'unicast' | 'pubsub';

export interface SwarmConstraints {
  maxAgents: number;
  minAgents: number;
  maxLatency: number;
  minThroughput: number;
  faultTolerance: number;
}

// Agent Errors
export interface AgentError {
  timestamp: Date;
  type: string;
  message: string;
  context: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolution?: string;
}

// Event Types
export interface AgentEvent {
  type: string;
  agentId: string;
  timestamp: Date;
  data: any;
}

// Interfaces for core services
export interface ILogger {
  debug(message: string, context?: any): void;
  info(message: string, context?: any): void;
  warn(message: string, context?: any): void;
  error(message: string, context?: any): void;
}

export interface IEventBus {
  emit(event: string, data: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

export interface IMemorySystem {
  store(key: string, value: any, metadata?: Partial<MemoryMetadata>): Promise<void>;
  retrieve(key: string): Promise<any>;
  query(query: MemoryQuery): Promise<MemoryEntry[]>;
  delete(key: string): Promise<void>;
  share(key: string, targets: AgentId[]): Promise<void>;
}

export interface MemoryQuery {
  type?: MemoryType;
  tags?: string[];
  owner?: AgentId;
  partition?: string;
  limit?: number;
  offset?: number;
}