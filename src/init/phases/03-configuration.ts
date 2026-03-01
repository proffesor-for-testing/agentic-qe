/**
 * Phase 03: Configuration
 * Generates AQE configuration based on analysis and options
 */

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import { createSelfConfigurator } from '../self-configurator.js';
import type { AQEInitConfig } from '../types.js';

/**
 * Configuration phase - generates optimal config
 */
export class ConfigurationPhase extends BasePhase<AQEInitConfig> {
  readonly name = 'configuration';
  readonly description = 'Generate configuration';
  readonly order = 30;
  readonly critical = true;
  readonly requiresPhases = ['analysis'] as const;

  protected async run(context: InitContext): Promise<AQEInitConfig> {
    if (!context.analysis) {
      throw new Error('Analysis phase must complete before configuration');
    }

    const configurator = createSelfConfigurator({
      minimal: context.options.minimal,
    });

    // Generate base config from analysis
    let config = configurator.recommend(context.analysis);

    // Apply CLI options
    config = this.applyOptions(config, context);

    // Store in context
    context.config = config;

    context.services.log(`  Version: ${config.version}`);
    context.services.log(`  Learning: ${config.learning.enabled ? 'enabled' : 'disabled'}`);
    context.services.log(`  Workers: ${config.workers.enabled.length}`);

    return config;
  }

  /**
   * Apply CLI options to config
   */
  private applyOptions(config: AQEInitConfig, context: InitContext): AQEInitConfig {
    const { options } = context;

    // Minimal mode
    if (options.minimal) {
      config.skills.install = false;
      config.learning.pretrainedPatterns = false;
      config.workers.enabled = [];
      config.workers.daemonAutoStart = false;
    }

    // Skip patterns
    if (options.skipPatterns) {
      config.learning.pretrainedPatterns = false;
    }

    // Apply wizard answers if present
    if (options.wizardAnswers) {
      config = this.applyWizardAnswers(config, options.wizardAnswers);
    }

    return config;
  }

  /**
   * Apply wizard answers to config
   */
  private applyWizardAnswers(
    config: AQEInitConfig,
    answers: Record<string, unknown>
  ): AQEInitConfig {
    // Project type override
    if (answers['project-type'] && answers['project-type'] !== 'auto') {
      config.project.type = answers['project-type'] as 'single' | 'monorepo' | 'library';
    }

    // Learning mode
    switch (answers['learning-mode']) {
      case 'full':
        config.learning.enabled = true;
        config.learning.embeddingModel = 'transformer';
        break;
      case 'basic':
        config.learning.enabled = true;
        config.learning.embeddingModel = 'hash';
        break;
      case 'disabled':
        config.learning.enabled = false;
        break;
    }

    // Pattern loading
    if (answers['load-patterns'] === false) {
      config.learning.pretrainedPatterns = false;
    }

    // Hooks
    if (answers['hooks'] === false) {
      config.hooks.claudeCode = false;
    }

    // Workers
    if (answers['workers'] === false) {
      config.workers.daemonAutoStart = false;
    }

    // Skills
    if (answers['skills'] === false) {
      config.skills.install = false;
    }

    return config;
  }
}

// Instance exported from index.ts
