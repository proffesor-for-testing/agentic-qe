/**
 * Hive-Mind Consensus Engine for Agentic QE Framework
 * Inspired by Claude Flow's hive-mind integration
 * Enables collective intelligence and distributed decision making
 */

import { EventEmitter } from 'events';
import { DistributedMemorySystem } from './distributed-memory';

export interface HiveMindConfig {
  enableSharedIntelligence: boolean;
  enableCollectiveMemory: boolean;
  enableDistributedLearning: boolean;
  enableKnowledgeSharing: boolean;
  syncInterval: number;
  maxSharedMemorySize: number;
  intelligencePoolSize: number;
  learningRate: number;
  knowledgeRetentionPeriod: number;
  consensusThreshold: number;
  votingTimeout: number;
}

export interface HiveMindSession {
  id: string;
  swarmId: string;
  participants: string[];
  sharedMemory: Map<string, any>;
  collectiveIntelligence: CollectiveIntelligence;
  knowledgeBase: KnowledgeBase;
  distributedLearning: DistributedLearning;
  status: 'active' | 'paused' | 'terminated';
  startTime: Date;
  lastSync: Date;
}

export interface CollectiveIntelligence {
  patterns: Map<string, Pattern>;
  insights: Map<string, Insight>;
  decisions: Map<string, CollectiveDecision>;
  predictions: Map<string, Prediction>;
}

export interface Pattern {
  id: string;
  type: 'behavioral' | 'performance' | 'error' | 'success';
  description: string;
  frequency: number;
  confidence: number;
  contexts: string[];
  impact: 'low' | 'medium' | 'high';
  discoveredBy: string[];
  lastSeen: Date;
}

export interface Insight {
  id: string;
  category: 'optimization' | 'coordination' | 'quality' | 'efficiency';
  title: string;
  description: string;
  evidence: any[];
  confidence: number;
  applicability: string[];
  contributingAgents: string[];
  timestamp: Date;
}

export interface CollectiveDecision {
  id: string;
  question: string;
  options: DecisionOption[];
  votingResults: Map<string, string>;
  consensus: string;
  confidence: number;
  reasoning: string;
  participants: string[];
  timestamp: Date;
}

export interface DecisionOption {
  id: string;
  description: string;
  pros: string[];
  cons: string[];
  risk: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  expectedOutcome: string;
}

export interface Prediction {
  id: string;
  target: string;
  predictedValue: any;
  confidence: number;
  timeframe: string;
  methodology: string;
  factors: string[];
  accuracy?: number;
  createdBy: string[];
  timestamp: Date;
}

export interface KnowledgeBase {
  facts: Map<string, Fact>;
  procedures: Map<string, Procedure>;
  bestPractices: Map<string, BestPractice>;
  lessons: Map<string, Lesson>;
}

export interface Fact {
  id: string;
  statement: string;
  category: string;
  confidence: number;
  sources: string[];
  validatedBy: string[];
  contexts: string[];
  timestamp: Date;
}

export interface Procedure {
  id: string;
  name: string;
  description: string;
  steps: ProcedureStep[];
  preconditions: string[];
  postconditions: string[];
  successRate: number;
  contexts: string[];
  lastUsed: Date;
}

export interface ProcedureStep {
  order: number;
  action: string;
  parameters: Record<string, any>;
  expectedResult: string;
  alternatives: string[];
}

export interface BestPractice {
  id: string;
  domain: string;
  practice: string;
  rationale: string;
  benefits: string[];
  applicableContexts: string[];
  effectiveness: number;
  adoptionRate: number;
  validatedBy: string[];
  timestamp: Date;
}

export interface Lesson {
  id: string;
  title: string;
  situation: string;
  actions: string[];
  outcome: string;
  learning: string;
  applicability: string[];
  importance: 'low' | 'medium' | 'high' | 'critical';
  learnedBy: string[];
  timestamp: Date;
}

export interface DistributedLearning {
  models: Map<string, LearningModel>;
  experiences: Map<string, Experience>;
  adaptations: Map<string, Adaptation>;
  performance: PerformanceTrends;
}

export interface LearningModel {
  id: string;
  type: 'neural' | 'statistical' | 'heuristic' | 'ensemble';
  purpose: string;
  parameters: Record<string, any>;
  performance: ModelPerformance;
  trainingData: string[];
  lastUpdated: Date;
  version: string;
}

export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  validationResults: any[];
  benchmarkResults: any[];
}

export interface Experience {
  id: string;
  context: string;
  situation: string;
  actions: string[];
  results: any[];
  feedback: number;
  tags: string[];
  agentId: string;
  timestamp: Date;
}

export interface Adaptation {
  id: string;
  trigger: string;
  change: string;
  reason: string;
  effectiveness: number;
  rollbackPlan: string;
  approvedBy: string[];
  implementedAt: Date;
}

export interface PerformanceTrends {
  metrics: Map<string, number[]>;
  improvements: string[];
  degradations: string[];
  stability: number;
  trends: TrendAnalysis[];
}

export interface TrendAnalysis {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  magnitude: number;
  confidence: number;
  timeframe: string;
  factors: string[];
}

/**
 * Hive-Mind Consensus Engine for collective decision making
 */
export class HiveMindConsensusEngine extends EventEmitter {
  private config: HiveMindConfig;
  private memorySystem: DistributedMemorySystem;
  private activeSessions: Map<string, HiveMindSession> = new Map();
  private globalKnowledgeBase: KnowledgeBase;
  private globalIntelligence: CollectiveIntelligence;
  private consensusTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(
    config?: Partial<HiveMindConfig>,
    memorySystem?: DistributedMemorySystem
  ) {
    super();

    this.config = {
      enableSharedIntelligence: true,
      enableCollectiveMemory: true,
      enableDistributedLearning: true,
      enableKnowledgeSharing: true,
      syncInterval: 5000,
      maxSharedMemorySize: 100 * 1024 * 1024, // 100MB
      intelligencePoolSize: 10,
      learningRate: 0.1,
      knowledgeRetentionPeriod: 86400000, // 24 hours
      consensusThreshold: 0.66, // 66% agreement
      votingTimeout: 30000, // 30 seconds
      ...config
    };

    this.memorySystem = memorySystem || new DistributedMemorySystem();
    this.globalKnowledgeBase = this.initializeKnowledgeBase();
    this.globalIntelligence = this.initializeCollectiveIntelligence();
  }

  /**
   * Initialize the hive-mind consensus engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Hive-mind consensus engine already initialized');
      return;
    }

    console.log('Initializing hive-mind consensus engine...');

    try {
      // Initialize memory system
      await this.memorySystem.initialize();

      // Load existing knowledge base
      await this.loadKnowledgeBase();

      // Load collective intelligence data
      await this.loadCollectiveIntelligence();

      // Start synchronization if enabled
      if (this.config.syncInterval > 0) {
        this.startPeriodicSync();
      }

      this.isInitialized = true;
      console.log('Hive-mind consensus engine initialized successfully');
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize hive-mind consensus engine', error);
      throw error;
    }
  }

  /**
   * Shutdown the engine gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    console.log('Shutting down hive-mind consensus engine...');

    try {
      // Stop synchronization
      if (this.consensusTimer) {
        clearInterval(this.consensusTimer as NodeJS.Timeout);
      }

      // Save current state
      await this.saveKnowledgeBase();
      await this.saveCollectiveIntelligence();

      // Terminate active sessions
      const terminationPromises = Array.from(this.activeSessions.keys())
        .map(sessionId => this.terminateSession(sessionId));

      await Promise.allSettled(terminationPromises);

      // Shutdown memory system
      await this.memorySystem.shutdown();

      this.isInitialized = false;
      console.log('Hive-mind consensus engine shut down successfully');
      this.emit('shutdown');
    } catch (error) {
      console.error('Error during hive-mind consensus engine shutdown', error);
      throw error;
    }
  }

  /**
   * Create a new hive-mind session for a swarm
   */
  async createSession(swarmId: string): Promise<string> {
    const sessionId = this.generateId('hive-session');

    console.log('Creating hive-mind session', { sessionId, swarmId });

    const session: HiveMindSession = {
      id: sessionId,
      swarmId,
      participants: [],
      sharedMemory: new Map(),
      collectiveIntelligence: this.initializeCollectiveIntelligence(),
      knowledgeBase: this.initializeKnowledgeBase(),
      distributedLearning: this.initializeDistributedLearning(),
      status: 'active',
      startTime: new Date(),
      lastSync: new Date()
    };

    this.activeSessions.set(sessionId, session);

    // Initialize session with global knowledge
    await this.initializeSessionWithGlobalKnowledge(session);

    this.emit('session:created', { sessionId, swarmId });
    return sessionId;
  }

  /**
   * Add an agent to a hive-mind session
   */
  async addAgentToSession(
    sessionId: string,
    agentId: string,
    agentCapabilities?: string[]
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Hive-mind session not found: ${sessionId}`);
    }

    if (!session.participants.includes(agentId)) {
      session.participants.push(agentId);

      console.log('Agent added to hive-mind session', {
        sessionId,
        agentId,
        participantCount: session.participants.length
      });

      // Share relevant knowledge with the agent
      await this.shareKnowledgeWithAgent(session, agentId, agentCapabilities);

      this.emit('agent:joined', {
        sessionId,
        agentId,
        participantCount: session.participants.length
      });
    }
  }

  /**
   * Request collective decision making
   */
  async requestCollectiveDecision(
    sessionId: string,
    question: string,
    options: DecisionOption[],
    requesterAgentId: string
  ): Promise<CollectiveDecision> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Hive-mind session not found: ${sessionId}`);
    }

    const decisionId = this.generateId('decision');

    console.log('Requesting collective decision', {
      sessionId,
      decisionId,
      question,
      optionCount: options.length
    });

    // Create decision structure
    const decision: CollectiveDecision = {
      id: decisionId,
      question,
      options,
      votingResults: new Map(),
      consensus: '',
      confidence: 0,
      reasoning: '',
      participants: [],
      timestamp: new Date()
    };

    // Collect votes from participants
    const votes = await this.collectVotes(session, question, options);

    // Calculate consensus
    const consensusResult = this.calculateConsensus(votes, options);

    // Update decision with results
    decision.votingResults = votes;
    decision.consensus = consensusResult.selectedOption;
    decision.confidence = consensusResult.confidence;
    decision.reasoning = consensusResult.reasoning;
    decision.participants = Array.from(votes.keys());

    // Store decision in collective intelligence
    session.collectiveIntelligence.decisions.set(decisionId, decision);

    // Learn from decision
    await this.learnFromDecision(session, decision);

    this.emit('decision:made', {
      sessionId,
      decisionId,
      consensus: decision.consensus,
      confidence: decision.confidence
    });

    return decision;
  }

  /**
   * Share knowledge or experience with the hive-mind
   */
  async shareWithHive(
    sessionId: string,
    agentId: string,
    type: 'knowledge' | 'experience' | 'insight' | 'pattern',
    data: any
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Hive-mind session not found: ${sessionId}`);
    }

    console.log('Sharing with hive-mind', {
      sessionId,
      agentId,
      type
    });

    switch (type) {
      case 'knowledge':
        await this.addKnowledge(session, agentId, data);
        break;
      case 'experience':
        await this.addExperience(session, agentId, data);
        break;
      case 'insight':
        await this.addInsight(session, agentId, data);
        break;
      case 'pattern':
        await this.addPattern(session, agentId, data);
        break;
    }

    // Store in distributed memory
    await this.memorySystem.store(
      `${type}-${Date.now()}`,
      data,
      {
        type,
        tags: [sessionId, agentId, type],
        owner: { id: agentId, type: 'agent' },
        accessLevel: 'swarm'
      }
    );

    this.emit('knowledge:shared', {
      sessionId,
      agentId,
      type
    });
  }

  /**
   * Get collective intelligence insights
   */
  async getInsights(sessionId: string, category?: string): Promise<Insight[]> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Hive-mind session not found: ${sessionId}`);
    }

    const insights = Array.from(session.collectiveIntelligence.insights.values());

    if (category) {
      return insights.filter(i => i.category === category);
    }

    return insights;
  }

  /**
   * Get discovered patterns
   */
  async getPatterns(sessionId: string, type?: string): Promise<Pattern[]> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Hive-mind session not found: ${sessionId}`);
    }

    const patterns = Array.from(session.collectiveIntelligence.patterns.values());

    if (type) {
      return patterns.filter(p => p.type === type);
    }

    return patterns;
  }

  /**
   * Get best practices
   */
  async getBestPractices(sessionId: string, domain?: string): Promise<BestPractice[]> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Hive-mind session not found: ${sessionId}`);
    }

    const practices = Array.from(session.knowledgeBase.bestPractices.values());

    if (domain) {
      return practices.filter(p => p.domain === domain);
    }

    return practices;
  }

  /**
   * Make a prediction based on collective intelligence
   */
  async makePrediction(
    sessionId: string,
    target: string,
    factors: string[]
  ): Promise<Prediction> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Hive-mind session not found: ${sessionId}`);
    }

    const predictionId = this.generateId('prediction');

    // Analyze historical data
    const historicalData = await this.analyzeHistoricalData(session, target, factors);

    // Generate prediction
    const prediction: Prediction = {
      id: predictionId,
      target,
      predictedValue: this.generatePrediction(historicalData, factors),
      confidence: this.calculatePredictionConfidence(historicalData),
      timeframe: '7 days',
      methodology: 'ensemble',
      factors,
      createdBy: session.participants,
      timestamp: new Date()
    };

    // Store prediction
    session.collectiveIntelligence.predictions.set(predictionId, prediction);

    this.emit('prediction:made', {
      sessionId,
      predictionId,
      target,
      confidence: prediction.confidence
    });

    return prediction;
  }

  // === PRIVATE METHODS ===

  private initializeKnowledgeBase(): KnowledgeBase {
    return {
      facts: new Map(),
      procedures: new Map(),
      bestPractices: new Map(),
      lessons: new Map()
    };
  }

  private initializeCollectiveIntelligence(): CollectiveIntelligence {
    return {
      patterns: new Map(),
      insights: new Map(),
      decisions: new Map(),
      predictions: new Map()
    };
  }

  private initializeDistributedLearning(): DistributedLearning {
    return {
      models: new Map(),
      experiences: new Map(),
      adaptations: new Map(),
      performance: {
        metrics: new Map(),
        improvements: [],
        degradations: [],
        stability: 1.0,
        trends: []
      }
    };
  }

  private async initializeSessionWithGlobalKnowledge(session: HiveMindSession): Promise<void> {
    // Copy relevant global knowledge to session
    for (const [key, fact] of this.globalKnowledgeBase.facts) {
      session.knowledgeBase.facts.set(key, { ...fact });
    }

    for (const [key, practice] of this.globalKnowledgeBase.bestPractices) {
      session.knowledgeBase.bestPractices.set(key, { ...practice });
    }
  }

  private async shareKnowledgeWithAgent(
    session: HiveMindSession,
    agentId: string,
    capabilities?: string[]
  ): Promise<void> {
    // Share relevant knowledge based on agent capabilities
    if (capabilities) {
      for (const capability of capabilities) {
        const relevantFacts = Array.from(session.knowledgeBase.facts.values())
          .filter(f => f.category === capability || f.contexts.includes(capability));

        for (const fact of relevantFacts) {
          await this.memorySystem.store(
            `knowledge-${agentId}-${fact.id}`,
            fact,
            {
              type: 'knowledge',
              tags: [agentId, 'fact', capability],
              owner: { id: agentId, type: 'agent' }
            }
          );
        }
      }
    }
  }

  private async collectVotes(
    session: HiveMindSession,
    question: string,
    options: DecisionOption[]
  ): Promise<Map<string, string>> {
    const votes = new Map<string, string>();

    // Simulate voting from participants
    for (const participantId of session.participants) {
      // In a real implementation, this would request votes from actual agents
      const vote = await this.simulateVote(participantId, question, options);
      votes.set(participantId, vote);
    }

    return votes;
  }

  private async simulateVote(
    agentId: string,
    question: string,
    options: DecisionOption[]
  ): Promise<string> {
    // Simple simulation - in reality would use agent's decision logic
    const weights = options.map(opt => {
      let weight = 1.0;
      if (opt.risk === 'low') weight *= 1.5;
      if (opt.effort === 'low') weight *= 1.3;
      if (opt.risk === 'high') weight *= 0.5;
      if (opt.effort === 'high') weight *= 0.7;
      return weight;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < options.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return options[i].id;
      }
    }

    return options[0].id;
  }

  private calculateConsensus(
    votes: Map<string, string>,
    options: DecisionOption[]
  ): {
    selectedOption: string;
    confidence: number;
    reasoning: string;
  } {
    // Count votes for each option
    const voteCounts = new Map<string, number>();
    for (const option of options) {
      voteCounts.set(option.id, 0);
    }

    for (const vote of votes.values()) {
      voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
    }

    // Find option with most votes
    let maxVotes = 0;
    let selectedOption = '';

    for (const [optionId, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        selectedOption = optionId;
      }
    }

    // Calculate confidence
    const totalVotes = votes.size;
    const confidence = totalVotes > 0 ? maxVotes / totalVotes : 0;

    // Generate reasoning
    const selectedOpt = options.find(o => o.id === selectedOption);
    const reasoning = `Selected based on ${maxVotes} out of ${totalVotes} votes. ` +
      `Risk: ${selectedOpt?.risk}, Effort: ${selectedOpt?.effort}. ` +
      `Confidence level: ${(confidence * 100).toFixed(1)}%`;

    return {
      selectedOption,
      confidence,
      reasoning
    };
  }

  private async learnFromDecision(
    session: HiveMindSession,
    decision: CollectiveDecision
  ): Promise<void> {
    // Create experience from decision
    const experience: Experience = {
      id: this.generateId('experience'),
      context: 'collective-decision',
      situation: decision.question,
      actions: [decision.consensus],
      results: [],
      feedback: decision.confidence,
      tags: ['decision', 'consensus'],
      agentId: 'collective',
      timestamp: new Date()
    };

    session.distributedLearning.experiences.set(experience.id, experience);

    // Update performance metrics
    const metrics = session.distributedLearning.performance.metrics;
    const decisionMetrics = metrics.get('decisions') || [];
    decisionMetrics.push(decision.confidence);
    metrics.set('decisions', decisionMetrics);
  }

  private async addKnowledge(
    session: HiveMindSession,
    agentId: string,
    data: any
  ): Promise<void> {
    const fact: Fact = {
      id: this.generateId('fact'),
      statement: data.statement || data.toString(),
      category: data.category || 'general',
      confidence: data.confidence || 0.8,
      sources: [agentId],
      validatedBy: [],
      contexts: data.contexts || [],
      timestamp: new Date()
    };

    session.knowledgeBase.facts.set(fact.id, fact);
  }

  private async addExperience(
    session: HiveMindSession,
    agentId: string,
    data: any
  ): Promise<void> {
    const experience: Experience = {
      id: this.generateId('experience'),
      context: data.context || '',
      situation: data.situation || '',
      actions: data.actions || [],
      results: data.results || [],
      feedback: data.feedback || 0,
      tags: data.tags || [],
      agentId,
      timestamp: new Date()
    };

    session.distributedLearning.experiences.set(experience.id, experience);
  }

  private async addInsight(
    session: HiveMindSession,
    agentId: string,
    data: any
  ): Promise<void> {
    const insight: Insight = {
      id: this.generateId('insight'),
      category: data.category || 'optimization',
      title: data.title || '',
      description: data.description || '',
      evidence: data.evidence || [],
      confidence: data.confidence || 0.7,
      applicability: data.applicability || [],
      contributingAgents: [agentId],
      timestamp: new Date()
    };

    session.collectiveIntelligence.insights.set(insight.id, insight);
  }

  private async addPattern(
    session: HiveMindSession,
    agentId: string,
    data: any
  ): Promise<void> {
    const pattern: Pattern = {
      id: this.generateId('pattern'),
      type: data.type || 'behavioral',
      description: data.description || '',
      frequency: data.frequency || 1,
      confidence: data.confidence || 0.6,
      contexts: data.contexts || [],
      impact: data.impact || 'medium',
      discoveredBy: [agentId],
      lastSeen: new Date()
    };

    session.collectiveIntelligence.patterns.set(pattern.id, pattern);
  }

  private async analyzeHistoricalData(
    session: HiveMindSession,
    target: string,
    factors: string[]
  ): Promise<any[]> {
    // Query memory system for historical data
    const entries = await this.memorySystem.query({
      tags: factors,
      limit: 100
    });

    return entries.map(e => e.value);
  }

  private generatePrediction(historicalData: any[], factors: string[]): any {
    // Simple prediction logic - would be more sophisticated in reality
    if (historicalData.length === 0) {
      return { value: 'unknown', trend: 'stable' };
    }

    return {
      value: historicalData[historicalData.length - 1],
      trend: 'increasing',
      factors: factors
    };
  }

  private calculatePredictionConfidence(historicalData: any[]): number {
    // Simple confidence calculation
    const dataPoints = historicalData.length;
    const maxConfidence = 0.95;
    const minConfidence = 0.1;

    if (dataPoints === 0) return minConfidence;
    if (dataPoints >= 100) return maxConfidence;

    return minConfidence + (maxConfidence - minConfidence) * (dataPoints / 100);
  }

  private startPeriodicSync(): void {
    this.consensusTimer = setInterval(() => {
      this.performSync();
    }, this.config.syncInterval);

    console.log('Started periodic synchronization', {
      interval: this.config.syncInterval
    });
  }

  private async performSync(): Promise<void> {
    try {
      for (const session of this.activeSessions.values()) {
        await this.syncSession(session);
      }
    } catch (error) {
      console.error('Sync error', error);
    }
  }

  private async syncSession(session: HiveMindSession): Promise<void> {
    session.lastSync = new Date();

    // Sync with global knowledge base
    for (const [key, fact] of session.knowledgeBase.facts) {
      if (!this.globalKnowledgeBase.facts.has(key)) {
        this.globalKnowledgeBase.facts.set(key, { ...fact });
      }
    }

    // Sync best practices
    for (const [key, practice] of session.knowledgeBase.bestPractices) {
      if (!this.globalKnowledgeBase.bestPractices.has(key)) {
        this.globalKnowledgeBase.bestPractices.set(key, { ...practice });
      }
    }

    // Clean old data
    await this.cleanOldData(session);
  }

  private async cleanOldData(session: HiveMindSession): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.knowledgeRetentionPeriod);

    // Clean old experiences
    for (const [id, exp] of session.distributedLearning.experiences) {
      if (exp.timestamp < cutoff) {
        session.distributedLearning.experiences.delete(id);
      }
    }

    // Clean old predictions
    for (const [id, pred] of session.collectiveIntelligence.predictions) {
      if (pred.timestamp < cutoff) {
        session.collectiveIntelligence.predictions.delete(id);
      }
    }
  }

  private async loadKnowledgeBase(): Promise<void> {
    // Load from memory system
    const entries = await this.memorySystem.query({
      type: 'knowledge',
      limit: 1000
    });

    for (const entry of entries) {
      if (entry.value?.id && entry.value?.statement) {
        this.globalKnowledgeBase.facts.set(entry.value.id, entry.value as Fact);
      }
    }
  }

  private async loadCollectiveIntelligence(): Promise<void> {
    // Load from memory system
    const entries = await this.memorySystem.query({
      type: 'intelligence',
      limit: 1000
    });

    for (const entry of entries) {
      if (entry.value?.id) {
        if (entry.value?.type === 'pattern') {
          this.globalIntelligence.patterns.set(entry.value.id, entry.value as Pattern);
        } else if (entry.value?.type === 'insight') {
          this.globalIntelligence.insights.set(entry.value.id, entry.value as Insight);
        }
      }
    }
  }

  private async saveKnowledgeBase(): Promise<void> {
    // Save to memory system
    for (const [id, fact] of this.globalKnowledgeBase.facts) {
      await this.memorySystem.store(
        `knowledge-fact-${id}`,
        fact,
        {
          type: 'knowledge',
          tags: ['fact', 'global']
        }
      );
    }
  }

  private async saveCollectiveIntelligence(): Promise<void> {
    // Save to memory system
    for (const [id, pattern] of this.globalIntelligence.patterns) {
      await this.memorySystem.store(
        `intelligence-pattern-${id}`,
        { ...pattern, type: 'pattern' },
        {
          type: 'intelligence',
          tags: ['pattern', 'global']
        }
      );
    }
  }

  private async terminateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.status = 'terminated';

    // Save session data
    await this.memorySystem.store(
      `session-${sessionId}`,
      {
        id: session.id,
        swarmId: session.swarmId,
        participants: session.participants,
        startTime: session.startTime,
        endTime: new Date(),
        insights: Array.from(session.collectiveIntelligence.insights.values()),
        patterns: Array.from(session.collectiveIntelligence.patterns.values()),
        decisions: Array.from(session.collectiveIntelligence.decisions.values())
      },
      {
        type: 'session',
        tags: ['terminated', sessionId]
      }
    );

    this.activeSessions.delete(sessionId);
    this.emit('session:terminated', { sessionId });
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // === PUBLIC API ===

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  getSession(sessionId: string): HiveMindSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getGlobalKnowledgeBase(): KnowledgeBase {
    return this.globalKnowledgeBase;
  }

  getGlobalIntelligence(): CollectiveIntelligence {
    return this.globalIntelligence;
  }
}

export default HiveMindConsensusEngine;