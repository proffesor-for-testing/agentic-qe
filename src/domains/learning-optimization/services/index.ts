/**
 * Agentic QE v3 - Learning & Optimization Services
 * Service layer exports for the learning-optimization domain
 */

export {
  LearningCoordinatorService,
  type LearningCoordinatorConfig,
} from './learning-coordinator.js';

export {
  TransferSpecialistService,
  type TransferSpecialistConfig,
  type TransferResult,
} from './transfer-specialist.js';

export {
  MetricsOptimizerService,
  type MetricsOptimizerConfig,
  type MetricsSnapshot,
} from './metrics-optimizer.js';

export {
  ProductionIntelService,
  type ProductionIntelConfig,
  type ProductionMetric,
  type ProductionIncident,
  type ProductionHealth,
} from './production-intel.js';
