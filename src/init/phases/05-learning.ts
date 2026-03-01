/**
 * Phase 05: Learning
 * Initializes the learning system with HNSW index and pattern storage
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import type { AQEInitConfig } from '../types.js';
import { getAQEVersion } from '../types.js';

export interface LearningResult {
  enabled: boolean;
  dataDir: string;
  hnswDir: string;
  patternsLoaded: number;
}

/**
 * Learning phase - initializes pattern learning system
 */
export class LearningPhase extends BasePhase<LearningResult> {
  readonly name = 'learning';
  readonly description = 'Initialize learning system';
  readonly order = 50;
  readonly critical = false;
  readonly requiresPhases = ['database', 'configuration'] as const;

  async shouldRun(context: InitContext): Promise<boolean> {
    const config = context.config as AQEInitConfig;
    return config?.learning?.enabled ?? true;
  }

  protected async run(context: InitContext): Promise<LearningResult> {
    const config = context.config as AQEInitConfig;
    const { projectRoot, options } = context;

    if (!config.learning.enabled) {
      return {
        enabled: false,
        dataDir: '',
        hnswDir: '',
        patternsLoaded: 0,
      };
    }

    // Create data directory
    const dataDir = join(projectRoot, '.agentic-qe', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Create HNSW index directory
    const hnswDir = join(dataDir, 'hnsw');
    if (!existsSync(hnswDir)) {
      mkdirSync(hnswDir, { recursive: true });
    }

    // Write learning system config
    const learningConfigPath = join(dataDir, 'learning-config.json');
    const learningConfig = {
      embeddingModel: config.learning.embeddingModel,
      hnswConfig: config.learning.hnswConfig,
      qualityThreshold: config.learning.qualityThreshold,
      promotionThreshold: config.learning.promotionThreshold,
      databasePath: join(dataDir, 'memory.db'),
      hnswIndexPath: join(hnswDir, 'index.bin'),
      initialized: new Date().toISOString(),
    };
    writeFileSync(learningConfigPath, JSON.stringify(learningConfig, null, 2), 'utf-8');

    // Load pre-trained patterns if available and not skipped
    let patternsLoaded = 0;

    if (config.learning.pretrainedPatterns && !options.skipPatterns) {
      patternsLoaded = await this.loadPretrainedPatterns(dataDir, context);
    }

    context.services.log(`  Data dir: ${dataDir}`);
    context.services.log(`  HNSW dir: ${hnswDir}`);
    context.services.log(`  Patterns loaded: ${patternsLoaded}`);

    return {
      enabled: true,
      dataDir,
      hnswDir,
      patternsLoaded,
    };
  }

  /**
   * Load pre-trained patterns from bundled library
   */
  private async loadPretrainedPatterns(
    dataDir: string,
    context: InitContext
  ): Promise<number> {
    try {
      // Try to load pre-trained patterns from bundled location
      const patternsDir = join(dataDir, 'patterns');
      if (!existsSync(patternsDir)) {
        mkdirSync(patternsDir, { recursive: true });
      }

      // Write a placeholder for now - actual patterns would come from
      // @agentic-qe/patterns package or bundled assets
      const indexPath = join(patternsDir, 'index.json');
      if (!existsSync(indexPath)) {
        writeFileSync(indexPath, JSON.stringify({
          version: getAQEVersion(),
          domains: [],
          loadedAt: new Date().toISOString(),
        }, null, 2), 'utf-8');
      }

      return 0; // Return actual count when patterns are bundled
    } catch (error) {
      context.services.warn(`Could not load pre-trained patterns: ${error}`);
      return 0;
    }
  }
}

// Instance exported from index.ts
