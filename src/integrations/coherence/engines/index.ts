/**
 * Agentic QE v3 - Coherence Engine Adapters
 *
 * Exports all Prime Radiant engine adapters:
 * - CohomologyAdapter: Sheaf cohomology for contradiction detection
 * - SpectralAdapter: Spectral analysis for collapse prediction
 * - CausalAdapter: Causal inference for spurious correlation detection
 * - CategoryAdapter: Category theory for type verification
 * - HomotopyAdapter: Homotopy type theory for formal verification
 * - WitnessAdapter: Blake3 witness chain for audit trails
 *
 * @module integrations/coherence/engines
 */

// Cohomology Engine (Contradiction Detection)
export {
  CohomologyAdapter,
  createCohomologyAdapter,
  type ICohomologyAdapter,
} from './cohomology-adapter';

// Spectral Engine (Collapse Prediction)
export {
  SpectralAdapter,
  createSpectralAdapter,
  type ISpectralAdapter,
} from './spectral-adapter';

// Causal Engine (Spurious Correlation Detection)
export {
  CausalAdapter,
  createCausalAdapter,
  type ICausalAdapter,
} from './causal-adapter';

// Category Engine (Type Verification)
export {
  CategoryAdapter,
  createCategoryAdapter,
  type ICategoryAdapter,
} from './category-adapter';

// Homotopy Engine (Formal Verification)
export {
  HomotopyAdapter,
  createHomotopyAdapter,
  type IHomotopyAdapter,
  type Proposition,
  type PathEquivalenceResult,
  type VerificationStatus,
} from './homotopy-adapter';

// Witness Engine (Audit Trails)
export {
  WitnessAdapter,
  createWitnessAdapter,
  type IWitnessAdapter,
} from './witness-adapter';
