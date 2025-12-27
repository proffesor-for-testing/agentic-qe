/**
 * Transfer Module
 *
 * Implements cross-agent pattern transfer for the Nightly-Learner system.
 * Enables knowledge sharing between QE agents.
 *
 * @module src/learning/transfer
 */

export {
  TransferPrototype,
  TransferTest,
  TransferResult as PrototypeTransferResult,
  AgentDomain,
} from './TransferPrototype';

export {
  TransferProtocol,
  TransferRequest,
  TransferResult,
  TransferDetail,
  ValidationResult,
  ValidationTest,
  TransferProtocolConfig,
  TransferStats,
} from './TransferProtocol';

export {
  CompatibilityScorer,
  CompatibilityReport,
  CompatibilityBreakdown,
  AgentProfile,
  PatternProfile,
} from './CompatibilityScorer';

export {
  TransferValidator,
  ValidationConfig,
  ValidationReport,
  ValidationCheck,
  TransferRecord,
} from './TransferValidator';

export { TransferProtocol as default } from './TransferProtocol';
