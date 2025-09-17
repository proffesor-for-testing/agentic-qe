/**
 * Exploratory Testing Navigator Agent
 * Implements session-based test management following RST principles
 */

import { QEAgent, AgentContext, AgentExecutionResult } from '../base/QEAgent';
import { QEAgentConfig, TestStatus, AgentCapability } from '../../types';
import { QEMemory } from '../../memory/QEMemory';
import { HookManager } from '../../hooks';
import { Logger } from '../../utils/Logger';

/**
 * Tour types available for exploratory testing
 */
export type TourType =
  | 'money'
  | 'landmark'
  | 'garbage_collector'
  | 'back_alley'
  | 'all_nighter'
  | 'saboteur'
  | 'antisocial';

/**
 * Observation categories for documenting findings
 */
export type ObservationCategory =
  | 'bug'
  | 'question'
  | 'idea'
  | 'concern'
  | 'pattern';

/**
 * Exploratory testing session
 */
export interface ExploratorySession {
  id: string;
  charter: string;
  timeBox: number; // minutes
  tourType: TourType;
  startTime: Date;
  endTime?: Date;
  observations: Observation[];
  status: 'active' | 'completed' | 'cancelled';
  metadata: Record<string, unknown>;
}

/**
 * Individual observation during exploration
 */
export interface Observation {
  id: string;
  timestamp: Date;
  observation: string;
  category: ObservationCategory;
  context: Record<string, unknown>;
  followUpActions?: string[];
}

/**
 * Session report following PROOF methodology
 */
export interface SessionReport {
  sessionId: string;
  charter: string;
  tourType: TourType;
  duration: number;
  proof: {
    past: string; // What happened before?
    results: string; // What actually happened?
    observations: string; // What did you notice?
    opportunities: string; // What could be explored next?
    feelings: string; // What concerns or intuitions arose?
  };
  observations: Observation[];
  recommendations: string[];
  followUpSessions: string[];
}

/**
 * Exploratory Testing Navigator Agent
 * Provides autonomous exploration of applications to discover unknown unknowns
 */
export class ExploratoryTestingNavigator extends QEAgent {
  private activeSessions: Map<string, ExploratorySession> = new Map();
  private sessionHistory: Map<string, SessionReport> = new Map();

  constructor(
    config: QEAgentConfig,
    memory: QEMemory,
    hooks: HookManager,
    logger?: Logger
  ) {
    super(config, memory, hooks, logger);
  }

  protected async doExecute(context: AgentContext): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const artifacts: string[] = [];
    const metrics: Record<string, number> = {};

    try {
      this.logger.info('Starting exploratory testing navigation', { context });

      // Store execution context in memory
      await this.storeMemory('execution_context', context, ['exploration', 'session']);

      // Default execution: start a landmark tour for 30 minutes
      const sessionId = await this.startSession(
        'Explore key user journeys and identify potential issues',
        30,
        'landmark'
      );

      artifacts.push(`session:${sessionId}`);
      metrics.sessions_started = 1;

      return {
        success: true,
        status: 'passed',
        message: `Started exploratory testing session: ${sessionId}`,
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: { sessionId }
      };

    } catch (error) {
      this.logger.error('Failed to execute exploratory testing navigation', { error });

      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        artifacts,
        metrics,
        duration: Date.now() - startTime,
        metadata: { error: true }
      };
    }
  }

  /**
   * Start an exploratory testing session
   */
  public async startSession(
    charter: string,
    timeBox: number,
    tourType: TourType
  ): Promise<string> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session: ExploratorySession = {
      id: sessionId,
      charter,
      timeBox,
      tourType,
      startTime: new Date(),
      observations: [],
      status: 'active',
      metadata: {
        agentId: this.id,
        tourDescription: this.getTourDescription(tourType)
      }
    };

    this.activeSessions.set(sessionId, session);

    // Store session in memory
    await this.storeMemory(`session:${sessionId}`, session, ['exploration', 'active']);

    this.logger.info(`Started exploratory session`, {
      sessionId,
      charter,
      tourType,
      timeBox
    });

    // Set timeout to automatically end session
    setTimeout(() => {
      this.endSession(sessionId).catch(error => {
        this.logger.error('Failed to auto-end session', { error, sessionId });
      });
    }, timeBox * 60 * 1000);

    return sessionId;
  }

  /**
   * Record an observation during exploration
   */
  public async recordObservation(
    sessionId: string,
    observation: string,
    category: ObservationCategory,
    context: Record<string, unknown> = {}
  ): Promise<string> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is not active`);
    }

    const observationId = `obs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const obs: Observation = {
      id: observationId,
      timestamp: new Date(),
      observation,
      category,
      context,
      followUpActions: this.generateFollowUpActions(category, observation)
    };

    session.observations.push(obs);

    // Update session in memory
    await this.storeMemory(`session:${sessionId}`, session, ['exploration', 'active']);

    this.logger.info(`Recorded observation`, {
      sessionId,
      observationId,
      category,
      observation: observation.substring(0, 100)
    });

    return observationId;
  }

  /**
   * Generate a session report using PROOF methodology
   */
  public async generateSessionReport(sessionId: string): Promise<SessionReport> {
    const session = this.activeSessions.get(sessionId) ||
                   await this.getMemory<ExploratorySession>(`session:${sessionId}`);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const duration = session.endTime
      ? session.endTime.getTime() - session.startTime.getTime()
      : Date.now() - session.startTime.getTime();

    const report: SessionReport = {
      sessionId,
      charter: session.charter,
      tourType: session.tourType,
      duration: Math.round(duration / 1000), // in seconds
      proof: this.generateProofReport(session),
      observations: session.observations,
      recommendations: this.generateRecommendations(session),
      followUpSessions: this.generateFollowUpSessions(session)
    };

    this.sessionHistory.set(sessionId, report);

    // Store report in memory
    await this.storeMemory(`report:${sessionId}`, report, ['exploration', 'report']);

    this.logger.info(`Generated session report`, {
      sessionId,
      observationCount: session.observations.length,
      duration: report.duration
    });

    return report;
  }

  /**
   * End an active exploration session
   */
  private async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return;
    }

    session.status = 'completed';
    session.endTime = new Date();

    // Generate final report
    await this.generateSessionReport(sessionId);

    // Move to completed sessions
    this.activeSessions.delete(sessionId);

    this.logger.info(`Ended exploration session`, { sessionId });
  }

  /**
   * Get description for a tour type
   */
  private getTourDescription(tourType: TourType): string {
    const descriptions = {
      money: 'Follow the money through the system - focus on revenue-generating features',
      landmark: 'Visit key features users visit most - the main user journeys',
      garbage_collector: 'Test data cleanup and edge cases - boundary conditions',
      back_alley: 'Explore features users rarely visit - hidden functionality',
      all_nighter: 'Extended operation scenarios - long-running processes',
      saboteur: 'Act like a malicious user - security and abuse cases',
      antisocial: 'Break rules and conventions - unexpected usage patterns'
    };

    return descriptions[tourType] || 'General exploration';
  }

  /**
   * Generate PROOF methodology report
   */
  private generateProofReport(session: ExploratorySession): SessionReport['proof'] {
    const bugObservations = session.observations.filter(o => o.category === 'bug');
    const questionObservations = session.observations.filter(o => o.category === 'question');
    const patternObservations = session.observations.filter(o => o.category === 'pattern');

    return {
      past: `Session started with charter: "${session.charter}". Previous context and state unknown.`,
      results: `Completed ${session.tourType} tour with ${session.observations.length} observations. Found ${bugObservations.length} potential issues.`,
      observations: `Key findings: ${patternObservations.length} patterns identified, ${questionObservations.length} questions raised about behavior.`,
      opportunities: `Recommend follow-up sessions focusing on areas with high observation density and unresolved questions.`,
      feelings: `${bugObservations.length > 0 ? 'Concerns about quality in observed areas. ' : ''}Confidence in explored areas varies by complexity and coverage.`
    };
  }

  /**
   * Generate recommendations based on session findings
   */
  private generateRecommendations(session: ExploratorySession): string[] {
    const recommendations: string[] = [];

    const bugCount = session.observations.filter(o => o.category === 'bug').length;
    const questionCount = session.observations.filter(o => o.category === 'question').length;
    const concernCount = session.observations.filter(o => o.category === 'concern').length;

    if (bugCount > 0) {
      recommendations.push(`Investigate ${bugCount} potential bugs identified during exploration`);
    }

    if (questionCount > 2) {
      recommendations.push(`Clarify ${questionCount} behavioral questions with product team`);
    }

    if (concernCount > 0) {
      recommendations.push(`Address ${concernCount} quality concerns through deeper testing`);
    }

    if (session.observations.length < 3) {
      recommendations.push('Consider extending session time or trying different tour type');
    }

    recommendations.push('Update risk assessments based on exploration findings');

    return recommendations;
  }

  /**
   * Generate follow-up session suggestions
   */
  private generateFollowUpSessions(session: ExploratorySession): string[] {
    const followUps: string[] = [];

    // Suggest complementary tours
    const tourComplements = {
      money: ['saboteur', 'garbage_collector'],
      landmark: ['back_alley', 'antisocial'],
      garbage_collector: ['money', 'saboteur'],
      back_alley: ['landmark', 'all_nighter'],
      all_nighter: ['garbage_collector', 'saboteur'],
      saboteur: ['money', 'antisocial'],
      antisocial: ['landmark', 'back_alley']
    };

    const complements = tourComplements[session.tourType] || [];
    complements.forEach(tour => {
      followUps.push(`${tour} tour focusing on areas with high observation density`);
    });

    // Suggest deep dives for specific findings
    const concernAreas = session.observations
      .filter(o => o.category === 'concern' || o.category === 'bug')
      .map(o => o.context.area as string)
      .filter(Boolean);

    [...new Set(concernAreas)].forEach(area => {
      followUps.push(`Deep dive session on ${area} area`);
    });

    return followUps;
  }

  /**
   * Generate follow-up actions for observations
   */
  private generateFollowUpActions(category: ObservationCategory, observation: string): string[] {
    const actions: string[] = [];

    switch (category) {
      case 'bug':
        actions.push('Reproduce issue with specific steps');
        actions.push('Document expected vs actual behavior');
        actions.push('Assess impact and severity');
        break;
      case 'question':
        actions.push('Seek clarification from product team');
        actions.push('Review requirements documentation');
        actions.push('Test different scenarios to understand behavior');
        break;
      case 'concern':
        actions.push('Investigate with focused testing');
        actions.push('Gather additional evidence');
        actions.push('Consult with technical team');
        break;
      case 'pattern':
        actions.push('Validate pattern across similar areas');
        actions.push('Document pattern for future reference');
        actions.push('Consider automation opportunities');
        break;
      case 'idea':
        actions.push('Evaluate feasibility and impact');
        actions.push('Discuss with team for feedback');
        actions.push('Plan implementation approach');
        break;
    }

    return actions;
  }

  /**
   * Get active sessions count
   */
  public getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get session by ID
   */
  public async getSession(sessionId: string): Promise<ExploratorySession | null> {
    return this.activeSessions.get(sessionId) ||
           await this.getMemory<ExploratorySession>(`session:${sessionId}`);
  }

  /**
   * Get session report by ID
   */
  public async getSessionReport(sessionId: string): Promise<SessionReport | null> {
    return this.sessionHistory.get(sessionId) ||
           await this.getMemory<SessionReport>(`report:${sessionId}`);
  }

  protected async onInitialize(): Promise<void> {
    this.logger.info('Initializing Exploratory Testing Navigator');

    // Load any persisted sessions from memory
    // Implementation would restore state if needed
  }

  protected async onStop(): Promise<void> {
    // End all active sessions
    for (const sessionId of this.activeSessions.keys()) {
      await this.endSession(sessionId);
    }
  }
}