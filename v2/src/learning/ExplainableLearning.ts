/**
 * ExplainableLearning - Explainable AI for Reinforcement Learning Decisions
 *
 * Provides human-readable explanations for RL agent decisions, tracking:
 * - Action selection rationale (Q-values, exploration vs exploitation)
 * - Confidence scores based on experience history
 * - Contributing experiences that influenced decisions
 * - Decision factors and alternative actions
 *
 * Supports transparency and trust in agent decision-making for issue #118
 */

import { Logger } from '../utils/Logger';
import { TaskState, AgentAction, TaskExperience } from './types';

/**
 * Decision type: exploration or exploitation
 */
export type DecisionType = 'exploration' | 'exploitation';

/**
 * Explanation for action selection
 */
export interface ActionExplanation {
  /** The selected action */
  selectedAction: AgentAction;

  /** Decision type (exploration or exploitation) */
  decisionType: DecisionType;

  /** Q-value of the selected action */
  qValue: number;

  /** Confidence score (0-1) based on experience */
  confidence: number;

  /** Human-readable reasoning */
  reasoning: string;

  /** Alternative actions considered */
  alternatives: ActionAlternative[];

  /** Contributing experiences that led to this decision */
  contributingExperiences: ContributingExperience[];

  /** Decision factors that influenced selection */
  decisionFactors: DecisionFactor[];

  /** Timestamp of decision */
  timestamp: Date;
}

/**
 * Alternative action that was considered
 */
export interface ActionAlternative {
  /** The alternative action */
  action: AgentAction;

  /** Q-value of this alternative */
  qValue: number;

  /** Confidence score for this alternative */
  confidence: number;

  /** Why it wasn't selected */
  reason: string;
}

/**
 * Experience that contributed to the decision
 */
export interface ContributingExperience {
  /** Experience ID */
  experienceId: string;

  /** Task type */
  taskType: string;

  /** Reward received */
  reward: number;

  /** How similar this experience is to current state (0-1) */
  similarity: number;

  /** Timestamp of experience */
  timestamp: Date;
}

/**
 * Factor that influenced the decision
 */
export interface DecisionFactor {
  /** Factor name */
  name: string;

  /** Factor value */
  value: number | string;

  /** Impact on decision (0-1) */
  impact: number;

  /** Description of this factor */
  description: string;
}

/**
 * Structured explanation format for programmatic use
 */
export interface StructuredExplanation {
  /** Action explanation */
  explanation: ActionExplanation;

  /** State representation */
  state: TaskState;

  /** All available actions */
  availableActions: AgentAction[];

  /** Exploration rate at time of decision */
  explorationRate: number;
}

/**
 * Natural language explanation format
 */
export interface NaturalLanguageExplanation {
  /** Summary sentence */
  summary: string;

  /** Detailed explanation paragraphs */
  details: string[];

  /** Key metrics */
  metrics: Record<string, string>;

  /** Recommendations */
  recommendations: string[];
}

/**
 * Experience statistics for confidence calculation
 */
interface ExperienceStats {
  totalCount: number;
  successCount: number;
  averageReward: number;
  recentPerformance: number;
}

/**
 * ExplainableLearning - Generates explanations for RL decisions
 */
export class ExplainableLearning {
  private readonly logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
    this.logger.info('ExplainableLearning initialized');
  }

  /**
   * Generate explanation for action selection
   *
   * @param state - Current task state
   * @param selectedAction - The action that was selected
   * @param availableActions - All available actions
   * @param qValues - Q-values for state-action pairs
   * @param explorationRate - Current exploration rate
   * @param experiences - Historical experiences for this agent
   * @param wasExploration - Whether this was an exploration decision
   * @returns Complete action explanation
   */
  explainAction(
    state: TaskState,
    selectedAction: AgentAction,
    availableActions: AgentAction[],
    qValues: Map<string, number>,
    explorationRate: number,
    experiences: TaskExperience[],
    wasExploration: boolean
  ): ActionExplanation {
    const selectedActionKey = this.encodeAction(selectedAction);
    const selectedQValue = qValues.get(selectedActionKey) ?? 0;

    // Determine decision type
    const decisionType: DecisionType = wasExploration ? 'exploration' : 'exploitation';

    // Calculate confidence based on experience
    const confidence = this.calculateConfidence(
      state,
      selectedAction,
      experiences
    );

    // Generate reasoning
    const reasoning = this.generateReasoning(
      decisionType,
      selectedQValue,
      confidence,
      explorationRate,
      availableActions.length,
      experiences
    );

    // Identify alternatives
    const alternatives = this.identifyAlternatives(
      selectedAction,
      availableActions,
      qValues,
      experiences,
      decisionType
    );

    // Find contributing experiences
    const contributingExperiences = this.findContributingExperiences(
      state,
      selectedAction,
      experiences
    );

    // Analyze decision factors
    const decisionFactors = this.analyzeDecisionFactors(
      state,
      selectedAction,
      selectedQValue,
      explorationRate,
      confidence,
      wasExploration
    );

    return {
      selectedAction,
      decisionType,
      qValue: selectedQValue,
      confidence,
      reasoning,
      alternatives,
      contributingExperiences,
      decisionFactors,
      timestamp: new Date()
    };
  }

  /**
   * Calculate confidence score based on experience history
   * Higher confidence when:
   * - More experiences with similar states
   * - Higher success rate
   * - More recent positive experiences
   */
  private calculateConfidence(
    state: TaskState,
    action: AgentAction,
    experiences: TaskExperience[]
  ): number {
    const stats = this.getExperienceStats(state, action, experiences);

    if (stats.totalCount === 0) {
      return 0.1; // Low confidence with no experience
    }

    // Base confidence from experience count (logarithmic scale)
    const experienceConfidence = Math.min(0.4, Math.log10(stats.totalCount + 1) / 2);

    // Success rate confidence
    const successConfidence = stats.successCount > 0
      ? (stats.successCount / stats.totalCount) * 0.3
      : 0;

    // Recent performance confidence
    const recentConfidence = Math.max(0, stats.recentPerformance) * 0.3;

    return Math.min(0.95, experienceConfidence + successConfidence + recentConfidence);
  }

  /**
   * Get experience statistics for state-action pair
   */
  private getExperienceStats(
    state: TaskState,
    action: AgentAction,
    experiences: TaskExperience[]
  ): ExperienceStats {
    const stateKey = this.encodeState(state);
    const actionKey = this.encodeAction(action);

    // Find similar experiences
    const similarExperiences = experiences.filter(exp => {
      const expStateKey = this.encodeState(exp.state);
      const expActionKey = this.encodeAction(exp.action);

      // Exact match for now (could use similarity threshold)
      return expStateKey === stateKey && expActionKey === actionKey;
    });

    const totalCount = similarExperiences.length;
    const successCount = similarExperiences.filter(exp => exp.reward > 0).length;

    const averageReward = totalCount > 0
      ? similarExperiences.reduce((sum, exp) => sum + exp.reward, 0) / totalCount
      : 0;

    // Recent performance (last 10 experiences)
    const recentExperiences = similarExperiences.slice(-10);
    const recentPerformance = recentExperiences.length > 0
      ? recentExperiences.reduce((sum, exp) => sum + exp.reward, 0) / recentExperiences.length
      : 0;

    return {
      totalCount,
      successCount,
      averageReward,
      recentPerformance
    };
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(
    decisionType: DecisionType,
    qValue: number,
    confidence: number,
    explorationRate: number,
    numActions: number,
    experiences: TaskExperience[]
  ): string {
    if (decisionType === 'exploration') {
      const explorationPercent = (explorationRate * 100).toFixed(1);
      return `Explored this action (confidence: ${confidence.toFixed(2)}) to gather more information. ` +
        `Current exploration rate is ${explorationPercent}%, balancing learning with exploitation.`;
    }

    // Exploitation
    const qValueFormatted = qValue.toFixed(3);
    const confidencePercent = (confidence * 100).toFixed(0);
    const experienceCount = experiences.length;

    if (qValue > 0.5) {
      return `Selected action with highest Q-value (${qValueFormatted}) among ${numActions} alternatives. ` +
        `High confidence (${confidencePercent}%) based on ${experienceCount} past experiences with strong positive results.`;
    } else if (qValue > 0) {
      return `Selected action with Q-value ${qValueFormatted} (moderate positive expectation). ` +
        `Medium confidence (${confidencePercent}%) from ${experienceCount} experiences. More data will improve decision quality.`;
    } else {
      return `Selected best available action (Q-value: ${qValueFormatted}) among ${numActions} options. ` +
        `Lower confidence (${confidencePercent}%) suggests limited experience in this state.`;
    }
  }

  /**
   * Identify alternative actions and explain why they weren't selected
   */
  private identifyAlternatives(
    selectedAction: AgentAction,
    availableActions: AgentAction[],
    qValues: Map<string, number>,
    experiences: TaskExperience[],
    decisionType: DecisionType
  ): ActionAlternative[] {
    const selectedActionKey = this.encodeAction(selectedAction);
    const alternatives: ActionAlternative[] = [];

    for (const action of availableActions) {
      const actionKey = this.encodeAction(action);

      // Skip the selected action
      if (actionKey === selectedActionKey) {
        continue;
      }

      const qValue = qValues.get(actionKey) ?? 0;
      const confidence = this.calculateConfidence(
        { taskComplexity: 0, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 1 },
        action,
        experiences
      );

      // Determine why it wasn't selected
      let reason: string;
      if (decisionType === 'exploration') {
        reason = 'Random exploration selected different action';
      } else {
        const selectedQValue = qValues.get(selectedActionKey) ?? 0;
        if (qValue < selectedQValue) {
          reason = `Lower Q-value (${qValue.toFixed(3)} vs ${selectedQValue.toFixed(3)})`;
        } else {
          reason = 'Similar Q-value but other action selected during exploitation';
        }
      }

      alternatives.push({
        action,
        qValue,
        confidence,
        reason
      });
    }

    // Sort by Q-value descending
    alternatives.sort((a, b) => b.qValue - a.qValue);

    // Return top 3 alternatives
    return alternatives.slice(0, 3);
  }

  /**
   * Find experiences that contributed to this decision
   */
  private findContributingExperiences(
    state: TaskState,
    action: AgentAction,
    experiences: TaskExperience[]
  ): ContributingExperience[] {
    const stateKey = this.encodeState(state);
    const actionKey = this.encodeAction(action);

    const contributingExps: ContributingExperience[] = [];

    for (const exp of experiences) {
      const expStateKey = this.encodeState(exp.state);
      const expActionKey = this.encodeAction(exp.action);

      // Calculate similarity
      const similarity = this.calculateStateSimilarity(state, exp.state);

      // Include if same action and similar state
      if (expActionKey === actionKey && similarity > 0.5) {
        contributingExps.push({
          experienceId: exp.taskId,
          taskType: exp.taskType,
          reward: exp.reward,
          similarity,
          timestamp: exp.timestamp
        });
      }
    }

    // Sort by similarity and recency
    contributingExps.sort((a, b) => {
      const similarityDiff = b.similarity - a.similarity;
      if (Math.abs(similarityDiff) > 0.1) {
        return similarityDiff;
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    // Return top 5
    return contributingExps.slice(0, 5);
  }

  /**
   * Calculate similarity between two states (0-1)
   */
  private calculateStateSimilarity(state1: TaskState, state2: TaskState): number {
    let similarity = 0;
    let factors = 0;

    // Task complexity similarity
    similarity += 1 - Math.abs(state1.taskComplexity - state2.taskComplexity);
    factors++;

    // Available resources similarity
    similarity += 1 - Math.abs(state1.availableResources - state2.availableResources);
    factors++;

    // Previous attempts similarity
    const attemptDiff = Math.abs(state1.previousAttempts - state2.previousAttempts);
    similarity += Math.max(0, 1 - attemptDiff / 5);
    factors++;

    // Required capabilities overlap
    const capabilities1 = new Set(state1.requiredCapabilities);
    const capabilities2 = new Set(state2.requiredCapabilities);
    const intersection = new Set([...capabilities1].filter(x => capabilities2.has(x)));
    const union = new Set([...capabilities1, ...capabilities2]);

    if (union.size > 0) {
      similarity += intersection.size / union.size;
      factors++;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  /**
   * Analyze decision factors
   */
  private analyzeDecisionFactors(
    state: TaskState,
    action: AgentAction,
    qValue: number,
    explorationRate: number,
    confidence: number,
    wasExploration: boolean
  ): DecisionFactor[] {
    const factors: DecisionFactor[] = [];

    // Q-value factor
    factors.push({
      name: 'Q-Value',
      value: qValue.toFixed(3),
      impact: wasExploration ? 0.3 : 0.9,
      description: 'Expected cumulative reward for this state-action pair'
    });

    // Exploration rate factor
    factors.push({
      name: 'Exploration Rate',
      value: `${(explorationRate * 100).toFixed(1)}%`,
      impact: wasExploration ? 0.9 : 0.1,
      description: 'Probability of selecting random action for exploration'
    });

    // Confidence factor
    factors.push({
      name: 'Confidence',
      value: `${(confidence * 100).toFixed(0)}%`,
      impact: 0.7,
      description: 'Based on number and quality of similar past experiences'
    });

    // Task complexity factor
    factors.push({
      name: 'Task Complexity',
      value: state.taskComplexity.toFixed(2),
      impact: 0.5,
      description: 'Complexity of current task (0=simple, 1=complex)'
    });

    // Resource availability factor
    factors.push({
      name: 'Available Resources',
      value: `${(state.availableResources * 100).toFixed(0)}%`,
      impact: 0.4,
      description: 'Resources available for task execution'
    });

    // Strategy factor
    factors.push({
      name: 'Strategy',
      value: action.strategy,
      impact: 0.8,
      description: 'Selected execution strategy'
    });

    // Parallelization factor
    factors.push({
      name: 'Parallelization',
      value: `${(action.parallelization * 100).toFixed(0)}%`,
      impact: 0.5,
      description: 'Degree of parallel execution'
    });

    // Sort by impact
    factors.sort((a, b) => b.impact - a.impact);

    return factors;
  }

  /**
   * Export explanation in structured format
   */
  exportStructured(
    explanation: ActionExplanation,
    state: TaskState,
    availableActions: AgentAction[],
    explorationRate: number
  ): StructuredExplanation {
    return {
      explanation,
      state,
      availableActions,
      explorationRate
    };
  }

  /**
   * Export explanation in natural language format
   */
  exportNaturalLanguage(explanation: ActionExplanation): NaturalLanguageExplanation {
    const summary = this.generateSummary(explanation);
    const details = this.generateDetails(explanation);
    const metrics = this.generateMetrics(explanation);
    const recommendations = this.generateRecommendations(explanation);

    return {
      summary,
      details,
      metrics,
      recommendations
    };
  }

  /**
   * Generate summary sentence
   */
  private generateSummary(explanation: ActionExplanation): string {
    const action = explanation.selectedAction.strategy;
    const type = explanation.decisionType;
    const confidence = (explanation.confidence * 100).toFixed(0);

    if (type === 'exploration') {
      return `Explored "${action}" strategy with ${confidence}% confidence to gather more experience.`;
    } else {
      return `Selected "${action}" strategy with ${confidence}% confidence based on Q-value of ${explanation.qValue.toFixed(3)}.`;
    }
  }

  /**
   * Generate detailed explanation paragraphs
   */
  private generateDetails(explanation: ActionExplanation): string[] {
    const details: string[] = [];

    // Main reasoning
    details.push(explanation.reasoning);

    // Contributing experiences
    if (explanation.contributingExperiences.length > 0) {
      const exp = explanation.contributingExperiences[0];
      const successRate = explanation.contributingExperiences.filter(e => e.reward > 0).length /
        explanation.contributingExperiences.length;

      details.push(
        `This decision is based on ${explanation.contributingExperiences.length} similar past experiences ` +
        `with a ${(successRate * 100).toFixed(0)}% success rate. The most similar experience was from ` +
        `"${exp.taskType}" which had a reward of ${exp.reward.toFixed(2)}.`
      );
    } else {
      details.push(
        'This decision is based on limited historical data. As the agent gains more experience, ' +
        'decision quality will improve.'
      );
    }

    // Top decision factors
    const topFactors = explanation.decisionFactors.slice(0, 3);
    if (topFactors.length > 0) {
      const factorList = topFactors.map(f => `${f.name} (${f.value})`).join(', ');
      details.push(`Key decision factors: ${factorList}.`);
    }

    // Alternatives
    if (explanation.alternatives.length > 0) {
      const alt = explanation.alternatives[0];
      details.push(
        `The next best alternative was "${alt.action.strategy}" with Q-value ${alt.qValue.toFixed(3)}. ` +
        `It wasn't selected because: ${alt.reason}.`
      );
    }

    return details;
  }

  /**
   * Generate key metrics
   */
  private generateMetrics(explanation: ActionExplanation): Record<string, string> {
    const metrics: Record<string, string> = {};

    metrics['Decision Type'] = explanation.decisionType === 'exploration' ? 'Exploration' : 'Exploitation';
    metrics['Q-Value'] = explanation.qValue.toFixed(3);
    metrics['Confidence'] = `${(explanation.confidence * 100).toFixed(0)}%`;
    metrics['Strategy'] = explanation.selectedAction.strategy;
    metrics['Similar Experiences'] = explanation.contributingExperiences.length.toString();

    if (explanation.contributingExperiences.length > 0) {
      const successCount = explanation.contributingExperiences.filter(e => e.reward > 0).length;
      metrics['Success Rate'] = `${((successCount / explanation.contributingExperiences.length) * 100).toFixed(0)}%`;
    }

    return metrics;
  }

  /**
   * Generate recommendations for user
   */
  private generateRecommendations(explanation: ActionExplanation): string[] {
    const recommendations: string[] = [];

    // Low confidence recommendation
    if (explanation.confidence < 0.3) {
      recommendations.push(
        'Low confidence detected. Consider providing feedback to help the agent learn faster.'
      );
    }

    // Limited experience recommendation
    if (explanation.contributingExperiences.length < 3) {
      recommendations.push(
        'Limited experience in this scenario. The agent will improve with more similar tasks.'
      );
    }

    // Exploration recommendation
    if (explanation.decisionType === 'exploration') {
      recommendations.push(
        'This was an exploratory action. If it performs well, it will be favored in future decisions.'
      );
    }

    // High confidence recommendation
    if (explanation.confidence > 0.8) {
      recommendations.push(
        'High confidence in this decision based on extensive past experience.'
      );
    }

    // Alternative suggestion
    if (explanation.alternatives.length > 0) {
      const alt = explanation.alternatives[0];
      if (Math.abs(alt.qValue - explanation.qValue) < 0.1) {
        recommendations.push(
          `Alternative strategy "${alt.action.strategy}" has similar expected performance and could also work well.`
        );
      }
    }

    return recommendations;
  }

  /**
   * Encode state to string key (matches LearningEngine encoding)
   */
  private encodeState(state: TaskState): string {
    const features = [
      state.taskComplexity,
      state.requiredCapabilities.length / 10,
      state.previousAttempts / 5,
      state.availableResources,
      state.timeConstraint ? Math.min(state.timeConstraint / 300000, 1) : 1
    ];
    return features.map(f => Math.round(f * 10) / 10).join(',');
  }

  /**
   * Encode action to string key (matches LearningEngine encoding)
   */
  private encodeAction(action: AgentAction): string {
    return `${action.strategy}:${action.parallelization.toFixed(1)}:${action.retryPolicy}`;
  }
}
