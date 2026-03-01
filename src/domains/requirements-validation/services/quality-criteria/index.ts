/**
 * Quality Criteria Service
 * HTSM v6.3 Quality Criteria analysis for shift-left quality engineering
 */

export {
  QualityCriteriaService,
  createQualityCriteriaService,
  type IQualityCriteriaService,
} from './quality-criteria-service.js';

export {
  // Constants
  HTSM_CATEGORIES,
  NEVER_OMIT_CATEGORIES,
  PRIORITY_DEFINITIONS,
} from './types.js';

export type {
  // HTSM Types
  HTSMCategory,
  EvidenceType,
  EvidencePoint,
  Priority,
  PriorityDefinition,

  // Recommendation Types
  QualityCriteriaRecommendation,
  CrossCuttingConcern,
  PIGuidanceItem,

  // Analysis Types
  QualityCriteriaAnalysis,

  // Agent Invocation (for semantic analysis)
  AgentInvocation,

  // Service Types
  QualityCriteriaServiceConfig,
  QualityCriteriaInput,
  QualityCriteriaOutput,
} from './types.js';
