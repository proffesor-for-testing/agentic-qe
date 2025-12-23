/**
 * Dream Engine Module
 *
 * Implements dream-based pattern discovery for the Nightly-Learner system.
 * Uses spreading activation to find novel associations between concepts.
 *
 * @module src/learning/dream
 */

export {
  ConceptGraph,
  ConceptNode,
  ConceptEdge,
  ConceptType,
  EdgeType,
  ConceptGraphConfig,
  GraphStats,
} from './ConceptGraph';

export {
  SpreadingActivation,
  ActivationConfig,
  Association,
  ActivationResult,
  DreamResult,
} from './SpreadingActivation';

export {
  InsightGenerator,
  DreamInsight,
  InsightType,
  InsightGeneratorConfig,
  InsightGenerationResult,
} from './InsightGenerator';

export {
  DreamEngine,
  DreamEngineConfig,
  DreamCycleResult,
  DreamEngineState,
} from './DreamEngine';

export { DreamEngine as default } from './DreamEngine';
