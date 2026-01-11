/**
 * Init Module
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Provides project analysis, self-configuration, and initialization wizard.
 */

// Types
export type {
  ProjectAnalysis,
  DetectedFramework,
  DetectedLanguage,
  ExistingTests,
  CodeComplexity,
  CoverageMetrics,
  AQEInitConfig,
  LearningConfig,
  RoutingConfig,
  WorkersConfig,
  HooksConfig,
  AutoTuningConfig,
  HNSWConfig,
  InitResult,
  InitStepResult,
  WizardStep,
  WizardOption,
  WizardState,
  PretrainedPattern,
  PretrainedLibrary,
} from './types.js';

export {
  DEFAULT_HNSW_CONFIG,
  DEFAULT_LEARNING_CONFIG,
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_WORKERS_CONFIG,
  DEFAULT_HOOKS_CONFIG,
  DEFAULT_AUTO_TUNING_CONFIG,
  ALL_DOMAINS,
  createDefaultConfig,
} from './types.js';

// Project Analyzer
export {
  ProjectAnalyzer,
  createProjectAnalyzer,
} from './project-analyzer.js';

// Self-Configurator
export type { SelfConfiguratorOptions } from './self-configurator.js';
export {
  SelfConfigurator,
  createSelfConfigurator,
  recommendConfig,
} from './self-configurator.js';

// Init Wizard & Orchestrator
export type { InitOrchestratorOptions } from './init-wizard.js';
export {
  InitOrchestrator,
  createInitOrchestrator,
  quickInit,
  formatInitResult,
} from './init-wizard.js';

// Skills Installer
export type { SkillsInstallerOptions, SkillsInstallResult, SkillInfo } from './skills-installer.js';
export {
  SkillsInstaller,
  createSkillsInstaller,
  installSkills,
} from './skills-installer.js';

// Agents Installer
export type { AgentsInstallerOptions, AgentsInstallResult, AgentInfo } from './agents-installer.js';
export {
  AgentsInstaller,
  createAgentsInstaller,
  installAgents,
} from './agents-installer.js';
