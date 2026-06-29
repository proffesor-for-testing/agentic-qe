/**
 * Darwin Mode integration (cross-pollination plan 05, D1).
 *
 * Folds AQE's objective QE metrics into `@metaharness/darwin`'s ScoreCard
 * contract so a Darwin evolution loop can promote real QE improvements.
 * See docs/metaharness/06-darwin-qe-self-learning-action-lane.md.
 */
export type { DarwinScoreCard, QeFitness, MutationSurface } from './types.js';
export {
  qeFitnessToScoreCard,
  applyQePromotionGate,
  arenaStrategiesToScoreCards,
  computeQeFitness,
  QE_FITNESS_WEIGHTS,
  SAFETY_GATE,
  type QeScoreOptions,
  type EvaluatedStrategyLike,
} from './qe-fitness.js';
export {
  candidateExclusionReason,
  screenCandidates,
  populationStats,
  applyJudgeVeto,
  assertTrainEvalDisjoint,
  filterHoldout,
  type CandidateScreen,
  type PopulationStats,
  type JudgeVerdict,
} from './darwin-guard.js';
