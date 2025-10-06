/**
 * Quality Commands Index
 * Exports all quality-related CLI commands
 */

import { Command } from 'commander';
import { createQualityGateCommand } from './gate.js';
import { createQualityValidateCommand } from './validate.js';
import { createQualityRiskCommand } from './risk.js';
import { createQualityDecisionCommand } from './decision.js';
import { createQualityPolicyCommand } from './policy.js';

export function createQualityCommand(): Command {
  const command = new Command('quality')
    .description('Quality engineering commands for gates, validation, and risk assessment')
    .addCommand(createQualityGateCommand())
    .addCommand(createQualityValidateCommand())
    .addCommand(createQualityRiskCommand())
    .addCommand(createQualityDecisionCommand())
    .addCommand(createQualityPolicyCommand());

  return command;
}

// Export individual commands and classes for testing
export { createQualityGateCommand, QualityGateExecutor } from './gate.js';
export { createQualityValidateCommand, QualityValidator } from './validate.js';
export { createQualityRiskCommand, QualityRiskAssessor } from './risk.js';
export { createQualityDecisionCommand, QualityDecisionMaker } from './decision.js';
export { createQualityPolicyCommand, QualityPolicyValidator } from './policy.js';

export type { QualityGateConfig, QualityGateResult } from './gate.js';
export type { ValidationRule, ValidationResult } from './validate.js';
export type { RiskFactor, RiskAssessmentResult } from './risk.js';
export type { DecisionCriteria, DecisionResult } from './decision.js';
export type { QualityPolicy, PolicyRule, PolicyValidationResult } from './policy.js';
