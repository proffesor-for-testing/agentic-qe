/**
 * Mock LearningEngine for Testing
 *
 * Provides a mock implementation of LearningEngine that avoids
 * database initialization and provides consistent mock responses.
 */

import { jest } from '@jest/globals';

// Shared mock methods that all instances use
const sharedMockMethods = {
  initialize: jest.fn().mockResolvedValue(undefined) as any,
  learn: jest.fn().mockResolvedValue(undefined) as any,
  getStatus: jest.fn().mockReturnValue({
    totalExperiences: 0,
    averageReward: 0,
    explorationRate: 1.0,
    learningRate: 0.1,
    discountFactor: 0.9
  }) as any,
  getLearnedPatterns: jest.fn().mockReturnValue([]) as any,
  recommendStrategy: jest.fn().mockResolvedValue({
    strategy: 'default',
    confidence: 0.5,
    reasoning: 'Default strategy'
  }) as any,
  dispose: jest.fn().mockResolvedValue(undefined) as any,
  recordExperience: jest.fn().mockResolvedValue(undefined) as any,
  getRecommendations: jest.fn().mockResolvedValue([]) as any,
  updateQValue: jest.fn().mockResolvedValue(undefined) as any,
  // Missing methods found in BaseAgent usage
  isEnabled: jest.fn().mockReturnValue(true) as any,
  setEnabled: jest.fn().mockReturnValue(undefined) as any,
  getPatterns: jest.fn().mockReturnValue([]) as any,
  getFailurePatterns: jest.fn().mockReturnValue([]) as any,
  flush: jest.fn().mockResolvedValue(undefined) as any,
  getExplorationRate: jest.fn().mockReturnValue(1.0) as any,
  getTotalExperiences: jest.fn().mockReturnValue(0) as any,
  enableQLearning: jest.fn().mockReturnValue(undefined) as any,
  disableQLearning: jest.fn().mockReturnValue(undefined) as any,
  isQLearningEnabled: jest.fn().mockReturnValue(false) as any,
  getQLearningStats: jest.fn().mockReturnValue({
    totalExperiences: 0,
    averageReward: 0,
    qTableSize: 0
  }) as any,
  learnFromExecution: jest.fn().mockResolvedValue({
    success: true,
    patternsLearned: 0,
    qValuesUpdated: 0
  }) as any,
  learnFromExperience: jest.fn().mockResolvedValue(undefined) as any,
  selectActionWithPolicy: jest.fn().mockResolvedValue({ type: 'default-action', params: {} }) as any
};

/**
 * Mock LearningEngine class
 */
export class LearningEngine {
  public initialize: jest.Mock<() => Promise<void>>;
  public learn: jest.Mock;
  public getStatus: jest.Mock;
  public getLearnedPatterns: jest.Mock;
  public recommendStrategy: jest.Mock;
  public dispose: jest.Mock;
  public recordExperience: jest.Mock;
  public getRecommendations: jest.Mock;
  public updateQValue: jest.Mock;
  public isEnabled: jest.Mock;
  public setEnabled: jest.Mock;
  public getPatterns: jest.Mock;
  public getFailurePatterns: jest.Mock;
  public flush: jest.Mock;
  public getExplorationRate: jest.Mock;
  public getTotalExperiences: jest.Mock;
  public enableQLearning: jest.Mock;
  public disableQLearning: jest.Mock;
  public isQLearningEnabled: jest.Mock;
  public getQLearningStats: jest.Mock;
  public learnFromExecution: jest.Mock;
  public learnFromExperience: jest.Mock;
  public selectActionWithPolicy: jest.Mock;

  constructor(agentId?: string, memoryStore?: any, config?: any) {
    // Create fresh mocks for each instance to survive Jest's resetMocks: true
    // This ensures mock return values are preserved across test runs
    this.initialize = jest.fn().mockResolvedValue(undefined as any);
    this.learn = jest.fn().mockResolvedValue(undefined as any);
    this.getStatus = jest.fn().mockReturnValue({
      totalExperiences: 0,
      averageReward: 0,
      explorationRate: 1.0,
      learningRate: 0.1,
      discountFactor: 0.9
    } as any);
    this.getLearnedPatterns = jest.fn().mockReturnValue([] as any);
    this.recommendStrategy = jest.fn().mockResolvedValue({
      strategy: 'default',
      confidence: 0.5,
      reasoning: 'Default strategy'
    } as any);
    this.dispose = jest.fn().mockResolvedValue(undefined as any);
    this.recordExperience = jest.fn().mockResolvedValue(undefined as any);
    this.getRecommendations = jest.fn().mockResolvedValue([] as any);
    this.updateQValue = jest.fn().mockResolvedValue(undefined as any);
    this.isEnabled = jest.fn().mockReturnValue(true as any);
    this.setEnabled = jest.fn().mockReturnValue(undefined as any);
    this.getPatterns = jest.fn().mockReturnValue([] as any);
    this.getFailurePatterns = jest.fn().mockReturnValue([] as any);
    this.flush = jest.fn().mockResolvedValue(undefined as any);
    this.getExplorationRate = jest.fn().mockReturnValue(1.0 as any);
    this.getTotalExperiences = jest.fn().mockReturnValue(0 as any);
    this.enableQLearning = jest.fn().mockReturnValue(undefined as any);
    this.disableQLearning = jest.fn().mockReturnValue(undefined as any);
    this.isQLearningEnabled = jest.fn().mockReturnValue(false as any);
    this.getQLearningStats = jest.fn().mockReturnValue({
      totalExperiences: 0,
      averageReward: 0,
      qTableSize: 0
    } as any);
    this.learnFromExecution = jest.fn().mockResolvedValue({
      success: true,
      patternsLearned: 0,
      qValuesUpdated: 0
    } as any);
    this.learnFromExperience = jest.fn().mockResolvedValue(undefined as any);
    this.selectActionWithPolicy = jest.fn().mockResolvedValue({ type: 'default-action', params: {} } as any);
  }

  // Test helper to reset all mocks
  static _resetAllMocks(): void {
    Object.values(sharedMockMethods).forEach(mockFn => {
      if (typeof mockFn === 'function' && 'mockClear' in mockFn) {
        (mockFn as jest.Mock).mockClear();
      }
    });
  }
}

export default LearningEngine;
