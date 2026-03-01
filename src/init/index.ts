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

// Fleet Integration (CI-005, CI-006, CI-007)
export type {
  FleetIntegrationOptions,
  CodeIntelligenceStatus,
  FleetIntegrationResult,
} from './fleet-integration.js';
export {
  FleetInitEnhancer,
  createFleetInitEnhancer,
  checkCodeIntelligenceStatus,
  integrateCodeIntelligence,
} from './fleet-integration.js';

// Modular Init System (Phase-based architecture)
export type {
  InitPhase,
  InitContext,
  InitOptions,
  PhaseResult,
  V2DetectionResult,
  EnhancementStatus,
} from './phases/index.js';
export {
  BasePhase,
  PhaseRegistry,
  createPhaseRegistry,
  getDefaultPhases,
  detectionPhase,
  analysisPhase,
  configurationPhase,
  databasePhase,
  learningPhase,
  codeIntelligencePhase,
  hooksPhase,
  mcpPhase,
  assetsPhase,
  workersPhase,
  claudeMdPhase,
  verificationPhase,
} from './phases/index.js';

// Modular Orchestrator
export type { OrchestratorOptions } from './orchestrator.js';
export {
  ModularInitOrchestrator,
  createModularInitOrchestrator,
  quickInitModular,
  formatInitResultModular,
} from './orchestrator.js';

// Enhancement Adapters
export type {
  EnhancementAdapter,
  ClaudeFlowAdapter,
  ClaudeFlowFeatures,
  EnhancementRegistry,
} from './enhancements/index.js';
export {
  detectEnhancements,
  createClaudeFlowAdapter,
  createEnhancementRegistry,
} from './enhancements/index.js';

// Platform Config Generator
export type {
  PlatformId,
  PlatformDefinition,
  GeneratedConfig,
} from './platform-config-generator.js';
export {
  PlatformConfigGenerator,
  createPlatformConfigGenerator,
  PLATFORM_REGISTRY,
} from './platform-config-generator.js';

// Platform Installers
export type { CopilotInstallerOptions, CopilotInstallResult } from './copilot-installer.js';
export { CopilotInstaller, createCopilotInstaller } from './copilot-installer.js';

export type { CursorInstallerOptions, CursorInstallResult } from './cursor-installer.js';
export { CursorInstaller, createCursorInstaller } from './cursor-installer.js';

export type { ClineInstallerOptions, ClineInstallResult } from './cline-installer.js';
export { ClineInstaller, createClineInstaller } from './cline-installer.js';

export type { KiloCodeInstallerOptions, KiloCodeInstallResult } from './kilocode-installer.js';
export { KiloCodeInstaller, createKiloCodeInstaller } from './kilocode-installer.js';

export type { RooCodeInstallerOptions, RooCodeInstallResult } from './roocode-installer.js';
export { RooCodeInstaller, createRooCodeInstaller } from './roocode-installer.js';

export type { CodexInstallerOptions, CodexInstallResult } from './codex-installer.js';
export { CodexInstaller, createCodexInstaller } from './codex-installer.js';

export type { WindsurfInstallerOptions, WindsurfInstallResult } from './windsurf-installer.js';
export { WindsurfInstaller, createWindsurfInstaller } from './windsurf-installer.js';

export type { ContinueDevInstallerOptions, ContinueDevInstallResult } from './continuedev-installer.js';
export { ContinueDevInstaller, createContinueDevInstaller } from './continuedev-installer.js';

// Migration
export type {
  V2DetectionInfo,
  MigrationResult,
} from './migration/index.js';
export {
  V2Detector,
  createV2Detector,
  V2DataMigrator,
  createV2DataMigrator,
  V2ConfigMigrator,
  createV2ConfigMigrator,
} from './migration/index.js';
