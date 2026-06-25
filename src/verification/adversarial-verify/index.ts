/**
 * @ruvector/adversarial-verify (plan 05 / A2).
 *
 * Host-agnostic blind-refuter verification: turn raw findings into adversarially
 * verified finding-verdict@1 envelopes. N blind refuters per finding (anti-
 * sycophancy, default-refuted on uncertainty) → deterministic majority-kill.
 * The LLM is injected as a `Judge`, so this has ZERO AQE/Claude-Code dependency
 * and is publishable as `@ruvector/adversarial-verify`.
 *
 * @example
 *   const verdicts = await adversarialVerify(findings, { judge, refuters: 3 });
 *   const { confirmed, killed } = partitionVerdicts(verdicts);
 */
export type {
  Finding,
  FindingVerdict,
  FindingSeverity,
  FindingOutcome,
  RefuterVote,
  Judge,
  AdversarialVerifyOptions,
} from './types.js';
export { adversarialVerify, partitionVerdicts } from './verify.js';
export { synthesizeVerdict, majorityKill, isFindingVerdict } from './synthesize.js';
export { refuterPrompt, DEFAULT_LENSES } from './prompts.js';
export { calibrate, type LabeledFinding, type CalibrationReport } from './calibrate.js';
