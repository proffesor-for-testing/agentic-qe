/**
 * Learning Algorithms - Reinforcement Learning Implementations
 *
 * This module provides various RL algorithms for agent learning:
 * - AbstractRLLearner: Base class for all RL algorithms
 * - QLearning: Off-policy TD(0) algorithm
 * - SARSALearner: On-policy TD(0) algorithm
 * - ActorCriticLearner: Advantage Actor-Critic (A2C) algorithm
 * - PPOLearner: Proximal Policy Optimization (PPO-Clip) algorithm
 * - MAMLMetaLearner: Model-Agnostic Meta-Learning for fast adaptation
 */

import { AbstractRLLearner, RLConfig, QValue } from './AbstractRLLearner';
import { QLearning, QLearningConfig } from '../QLearning';
import { SARSALearner, SARSAConfig } from './SARSALearner';
import { ActorCriticLearner, ActorCriticConfig, createDefaultActorCriticConfig } from './ActorCriticLearner';
import { PPOLearner, PPOConfig, createDefaultPPOConfig } from './PPOLearner';
import { MAMLMetaLearner, MAMLConfig, createDefaultMAMLConfig } from './MAMLMetaLearner';

export { AbstractRLLearner, RLConfig, QValue };
export { QLearning, QLearningConfig };
export { SARSALearner, SARSAConfig };
export { ActorCriticLearner, ActorCriticConfig, createDefaultActorCriticConfig };
export { PPOLearner, PPOConfig, createDefaultPPOConfig };
export { MAMLMetaLearner, MAMLConfig, createDefaultMAMLConfig };

/**
 * Supported RL algorithm types
 */
export type RLAlgorithmType = 'q-learning' | 'sarsa' | 'actor-critic' | 'ppo' | 'maml' | 'legacy';

/**
 * Factory function to create RL algorithm instances
 */
export function createRLAlgorithm(
  type: RLAlgorithmType,
  config?: any
): AbstractRLLearner {
  switch (type) {
    case 'q-learning':
      return new QLearning(config);
    case 'sarsa':
      return new SARSALearner(config);
    case 'actor-critic':
      return new ActorCriticLearner(config ?? createDefaultActorCriticConfig());
    case 'ppo':
      return new PPOLearner(config ?? createDefaultPPOConfig());
    case 'maml':
      return new MAMLMetaLearner(config ?? createDefaultMAMLConfig());
    default:
      throw new Error(`Unknown RL algorithm type: ${type}`);
  }
}
