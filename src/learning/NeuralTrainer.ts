/**
 * Neural Trainer - Training Orchestration for Neural Pattern Matcher
 *
 * Provides:
 * - Training orchestration and scheduling
 * - Data preprocessing and augmentation
 * - Model evaluation and validation
 * - Hyperparameter tuning
 * - Training progress tracking
 * - Incremental learning management
 *
 * @module NeuralTrainer
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  NeuralPatternMatcher,
  ModelBackend,
  NeuralArchitecture,
  TrainingDataPoint,
  ModelMetrics,
  PatternPrediction
} from './NeuralPatternMatcher';
import type { SwarmMemoryManager } from '../swarm/SwarmMemoryManager';
import type { QEReasoningBank } from './QEReasoningBank';

/**
 * Training configuration
 */
export interface TrainingConfig {
  /** Model backend */
  backend: ModelBackend;
  /** Neural architecture */
  architecture: NeuralArchitecture;
  /** Validation split ratio */
  validationSplit: number;
  /** Early stopping patience (epochs) */
  earlyStoppingPatience?: number;
  /** Minimum improvement for early stopping */
  minImprovement?: number;
  /** Enable data augmentation */
  dataAugmentation: boolean;
  /** Cross-validation folds (0 = no cross-validation) */
  crossValidationFolds?: number;
  /** Model path for persistence */
  modelPath?: string;
}

/**
 * Hyperparameter tuning configuration
 */
export interface HyperparameterConfig {
  /** Learning rates to try */
  learningRates: number[];
  /** Batch sizes to try */
  batchSizes: number[];
  /** Hidden layer configurations */
  hiddenLayerConfigs: number[][];
  /** Dropout rates */
  dropoutRates: number[];
  /** Number of epochs for each trial */
  trialsPerConfig: number;
  /** Maximum total trials */
  maxTrials: number;
}

/**
 * Training progress information
 */
export interface TrainingProgress {
  /** Current epoch */
  epoch: number;
  /** Total epochs */
  totalEpochs: number;
  /** Current batch */
  batch: number;
  /** Total batches */
  totalBatches: number;
  /** Current training loss */
  trainingLoss: number;
  /** Current validation loss */
  validationLoss: number;
  /** Current accuracy */
  accuracy: number;
  /** Elapsed time (ms) */
  elapsedTime: number;
  /** Estimated time remaining (ms) */
  estimatedTimeRemaining: number;
}

/**
 * Training result
 */
export interface TrainingResult {
  /** Final model metrics */
  metrics: ModelMetrics;
  /** Training configuration used */
  config: TrainingConfig;
  /** Best epoch */
  bestEpoch: number;
  /** Total training time (ms) */
  totalTime: number;
  /** Early stopped? */
  earlyStopped: boolean;
  /** Model version */
  modelVersion: string;
}

/**
 * Hyperparameter tuning result
 */
export interface TuningResult {
  /** Best configuration found */
  bestConfig: NeuralArchitecture;
  /** Best metrics achieved */
  bestMetrics: ModelMetrics;
  /** All trial results */
  trials: Array<{
    config: NeuralArchitecture;
    metrics: ModelMetrics;
  }>;
  /** Total tuning time (ms) */
  totalTime: number;
}

/**
 * Data preprocessing options
 */
interface PreprocessingOptions {
  /** Normalize features */
  normalize: boolean;
  /** Handle missing values */
  handleMissing: boolean;
  /** Remove outliers */
  removeOutliers: boolean;
  /** Balance classes */
  balanceClasses: boolean;
}

/**
 * Neural Trainer
 *
 * Orchestrates training, evaluation, and optimization of neural pattern matcher
 */
export class NeuralTrainer extends EventEmitter {
  private config: TrainingConfig;
  private patternMatcher: NeuralPatternMatcher;
  private memoryManager: SwarmMemoryManager;
  private reasoningBank?: QEReasoningBank;
  private trainingHistory: TrainingProgress[] = [];
  private bestMetrics: ModelMetrics | null = null;
  private currentEpoch: number = 0;

  constructor(
    config: TrainingConfig,
    memoryManager: SwarmMemoryManager,
    reasoningBank?: QEReasoningBank
  ) {
    super();
    this.config = config;
    this.memoryManager = memoryManager;
    this.reasoningBank = reasoningBank;

    // Initialize pattern matcher
    this.patternMatcher = new NeuralPatternMatcher(
      config.backend,
      config.architecture,
      memoryManager,
      reasoningBank,
      config.modelPath
    );

    // Forward events from pattern matcher
    this.patternMatcher.on('training:progress', (data) => {
      this.emit('training:progress', data);
    });
  }

  /**
   * Preprocess training data
   */
  public async preprocessData(
    data: TrainingDataPoint[],
    options: PreprocessingOptions = {
      normalize: true,
      handleMissing: true,
      removeOutliers: false,
      balanceClasses: true
    }
  ): Promise<TrainingDataPoint[]> {
    this.emit('preprocessing:started', { dataSize: data.length, options });

    let processed = [...data];

    // Handle missing values
    if (options.handleMissing) {
      processed = this.handleMissingValues(processed);
    }

    // Remove outliers
    if (options.removeOutliers) {
      processed = this.removeOutliers(processed);
    }

    // Normalize features
    if (options.normalize) {
      processed = this.normalizeFeatures(processed);
    }

    // Balance classes
    if (options.balanceClasses) {
      processed = this.balanceClasses(processed);
    }

    this.emit('preprocessing:completed', {
      originalSize: data.length,
      processedSize: processed.length
    });

    return processed;
  }

  /**
   * Handle missing values in training data
   */
  private handleMissingValues(data: TrainingDataPoint[]): TrainingDataPoint[] {
    return data.filter(point => {
      // Check for NaN or undefined in features
      return point.features.every(f => !isNaN(f) && f !== undefined);
    });
  }

  /**
   * Remove outliers using IQR method
   */
  private removeOutliers(data: TrainingDataPoint[]): TrainingDataPoint[] {
    if (data.length === 0) return data;

    const featureCount = data[0].features.length;
    const outlierIndices = new Set<number>();

    // Check each feature dimension
    for (let i = 0; i < featureCount; i++) {
      const values = data.map(d => d.features[i]).sort((a, b) => a - b);

      const q1Index = Math.floor(values.length * 0.25);
      const q3Index = Math.floor(values.length * 0.75);
      const q1 = values[q1Index];
      const q3 = values[q3Index];
      const iqr = q3 - q1;

      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      // Mark outliers
      data.forEach((point, idx) => {
        if (point.features[i] < lowerBound || point.features[i] > upperBound) {
          outlierIndices.add(idx);
        }
      });
    }

    // Remove outliers
    return data.filter((_, idx) => !outlierIndices.has(idx));
  }

  /**
   * Normalize features using min-max scaling
   */
  private normalizeFeatures(data: TrainingDataPoint[]): TrainingDataPoint[] {
    if (data.length === 0) return data;

    const featureCount = data[0].features.length;
    const mins = new Array(featureCount).fill(Infinity);
    const maxs = new Array(featureCount).fill(-Infinity);

    // Find min and max for each feature
    for (const point of data) {
      for (let i = 0; i < featureCount; i++) {
        mins[i] = Math.min(mins[i], point.features[i]);
        maxs[i] = Math.max(maxs[i], point.features[i]);
      }
    }

    // Normalize
    return data.map(point => ({
      ...point,
      features: point.features.map((f, i) => {
        const range = maxs[i] - mins[i];
        return range === 0 ? 0 : (f - mins[i]) / range;
      })
    }));
  }

  /**
   * Balance classes using oversampling
   */
  private balanceClasses(data: TrainingDataPoint[]): TrainingDataPoint[] {
    // Count classes
    const classCounts = new Map<string, TrainingDataPoint[]>();

    for (const point of data) {
      const classLabel = point.labels.indexOf(Math.max(...point.labels)).toString();
      if (!classCounts.has(classLabel)) {
        classCounts.set(classLabel, []);
      }
      classCounts.get(classLabel)!.push(point);
    }

    // Find max class size
    const maxCount = Math.max(...Array.from(classCounts.values()).map(v => v.length));

    // Oversample minority classes
    const balanced: TrainingDataPoint[] = [];

    for (const [label, points] of classCounts) {
      balanced.push(...points);

      // Add duplicates to reach max count
      const needed = maxCount - points.length;
      for (let i = 0; i < needed; i++) {
        const randomPoint = points[Math.floor(Math.random() * points.length)];
        balanced.push({ ...randomPoint });
      }
    }

    return balanced;
  }

  /**
   * Augment training data
   */
  public async augmentData(
    data: TrainingDataPoint[],
    augmentationFactor: number = 2
  ): Promise<TrainingDataPoint[]> {
    this.emit('augmentation:started', {
      dataSize: data.length,
      factor: augmentationFactor
    });

    const augmented = [...data];

    for (let i = 0; i < augmentationFactor - 1; i++) {
      for (const point of data) {
        // Add noise to features
        const noisyFeatures = point.features.map(f => {
          const noise = (Math.random() - 0.5) * 0.1; // 10% noise
          return f + noise;
        });

        augmented.push({
          ...point,
          features: noisyFeatures,
          metadata: {
            ...point.metadata,
            augmented: true
          } as any
        });
      }
    }

    this.emit('augmentation:completed', {
      originalSize: data.length,
      augmentedSize: augmented.length
    });

    return augmented;
  }

  /**
   * Train model with progress tracking
   */
  public async train(): Promise<TrainingResult> {
    const startTime = Date.now();
    this.emit('training:started', { config: this.config });

    try {
      // Load and preprocess data
      const rawData = await this.patternMatcher.loadTrainingData();

      if (rawData.length === 0) {
        throw new Error('No training data available');
      }

      let processedData = await this.preprocessData(rawData);

      // Augment data if enabled
      if (this.config.dataAugmentation) {
        processedData = await this.augmentData(processedData);
      }

      // Train model
      let metrics: ModelMetrics;

      if (this.config.crossValidationFolds && this.config.crossValidationFolds > 1) {
        metrics = await this.crossValidationTrain(processedData);
      } else {
        metrics = await this.patternMatcher.train(
          processedData,
          this.config.validationSplit
        );
      }

      const totalTime = Date.now() - startTime;

      const result: TrainingResult = {
        metrics,
        config: this.config,
        bestEpoch: this.currentEpoch,
        totalTime,
        earlyStopped: false,
        modelVersion: this.patternMatcher.getModelInfo().version
      };

      this.emit('training:completed', result);

      return result;
    } catch (error) {
      this.emit('training:error', { error });
      throw error;
    }
  }

  /**
   * Cross-validation training
   */
  private async crossValidationTrain(
    data: TrainingDataPoint[]
  ): Promise<ModelMetrics> {
    const folds = this.config.crossValidationFolds || 5;
    this.emit('crossvalidation:started', { folds });

    const foldSize = Math.floor(data.length / folds);
    const allMetrics: ModelMetrics[] = [];

    for (let fold = 0; fold < folds; fold++) {
      this.emit('crossvalidation:fold:started', { fold: fold + 1, totalFolds: folds });

      // Split data into train and validation
      const validationStart = fold * foldSize;
      const validationEnd = validationStart + foldSize;

      const validationData = data.slice(validationStart, validationEnd);
      const trainData = [
        ...data.slice(0, validationStart),
        ...data.slice(validationEnd)
      ];

      // Train on this fold
      const metrics = await this.patternMatcher.train(trainData, 0);

      // Evaluate on validation set
      const foldMetrics = await this.patternMatcher.evaluate(validationData);
      allMetrics.push(foldMetrics);

      this.emit('crossvalidation:fold:completed', {
        fold: fold + 1,
        metrics: foldMetrics
      });
    }

    // Average metrics across folds
    const avgMetrics: ModelMetrics = {
      accuracy: allMetrics.reduce((sum, m) => sum + m.accuracy, 0) / folds,
      precision: allMetrics.reduce((sum, m) => sum + m.precision, 0) / folds,
      recall: allMetrics.reduce((sum, m) => sum + m.recall, 0) / folds,
      f1Score: allMetrics.reduce((sum, m) => sum + m.f1Score, 0) / folds,
      trainingLoss: allMetrics.reduce((sum, m) => sum + m.trainingLoss, 0) / folds,
      validationLoss: allMetrics.reduce((sum, m) => sum + m.validationLoss, 0) / folds,
      trainingTime: allMetrics.reduce((sum, m) => sum + m.trainingTime, 0),
      confusionMatrix: allMetrics[0].confusionMatrix // Use last fold
    };

    this.emit('crossvalidation:completed', { avgMetrics, folds });

    return avgMetrics;
  }

  /**
   * Hyperparameter tuning using grid search
   */
  public async tuneHyperparameters(
    config: HyperparameterConfig
  ): Promise<TuningResult> {
    const startTime = Date.now();
    this.emit('tuning:started', { config });

    const trials: Array<{
      config: NeuralArchitecture;
      metrics: ModelMetrics;
    }> = [];

    let bestMetrics: ModelMetrics | null = null;
    let bestConfig: NeuralArchitecture | null = null;

    // Load and preprocess data once
    const rawData = await this.patternMatcher.loadTrainingData();
    const processedData = await this.preprocessData(rawData);

    let trialCount = 0;

    // Grid search
    for (const learningRate of config.learningRates) {
      for (const batchSize of config.batchSizes) {
        for (const hiddenLayers of config.hiddenLayerConfigs) {
          for (const dropout of config.dropoutRates) {
            if (trialCount >= config.maxTrials) break;

            const architecture: NeuralArchitecture = {
              ...this.config.architecture,
              learningRate,
              batchSize,
              hiddenLayers,
              dropout
            };

            this.emit('tuning:trial:started', {
              trial: trialCount + 1,
              totalTrials: config.maxTrials,
              architecture
            });

            // Create new matcher with this config
            const matcher = new NeuralPatternMatcher(
              this.config.backend,
              architecture,
              this.memoryManager,
              this.reasoningBank
            );

            // Train
            const metrics = await matcher.train(
              processedData,
              this.config.validationSplit
            );

            trials.push({ config: architecture, metrics });

            // Update best
            if (!bestMetrics || metrics.accuracy > bestMetrics.accuracy) {
              bestMetrics = metrics;
              bestConfig = architecture;
            }

            this.emit('tuning:trial:completed', {
              trial: trialCount + 1,
              metrics,
              isBest: metrics === bestMetrics
            });

            trialCount++;
          }
        }
      }
    }

    if (!bestConfig || !bestMetrics) {
      throw new Error('No valid trials completed');
    }

    const totalTime = Date.now() - startTime;

    const result: TuningResult = {
      bestConfig,
      bestMetrics,
      trials,
      totalTime
    };

    this.emit('tuning:completed', result);

    return result;
  }

  /**
   * Evaluate model on test data
   */
  public async evaluate(testData?: TrainingDataPoint[]): Promise<ModelMetrics> {
    this.emit('evaluation:started');

    try {
      let data = testData;

      if (!data) {
        // Load fresh test data
        const allData = await this.patternMatcher.loadTrainingData();
        const splitIndex = Math.floor(allData.length * 0.8);
        data = allData.slice(splitIndex); // Use last 20% as test
      }

      data = await this.preprocessData(data);

      const metrics = await this.patternMatcher.evaluate(data);

      this.emit('evaluation:completed', { metrics });

      return metrics;
    } catch (error) {
      this.emit('evaluation:error', { error });
      throw error;
    }
  }

  /**
   * Incremental training with new data
   */
  public async incrementalTrain(
    newData: TrainingDataPoint[]
  ): Promise<TrainingResult> {
    const startTime = Date.now();
    this.emit('incremental:training:started', { dataSize: newData.length });

    try {
      // Preprocess new data
      const processedData = await this.preprocessData(newData);

      // Incremental train
      const metrics = await this.patternMatcher.incrementalTrain(processedData);

      const totalTime = Date.now() - startTime;

      const result: TrainingResult = {
        metrics,
        config: this.config,
        bestEpoch: this.currentEpoch,
        totalTime,
        earlyStopped: false,
        modelVersion: this.patternMatcher.getModelInfo().version
      };

      this.emit('incremental:training:completed', result);

      return result;
    } catch (error) {
      this.emit('incremental:training:error', { error });
      throw error;
    }
  }

  /**
   * Save trained model
   */
  public async saveModel(): Promise<void> {
    await this.patternMatcher.saveModel();
  }

  /**
   * Load trained model
   */
  public async loadModel(version?: string): Promise<void> {
    await this.patternMatcher.loadModel(version);
  }

  /**
   * Get training history
   */
  public getTrainingHistory(): TrainingProgress[] {
    return [...this.trainingHistory];
  }

  /**
   * Get pattern matcher instance
   */
  public getPatternMatcher(): NeuralPatternMatcher {
    return this.patternMatcher;
  }

  /**
   * Predict using trained model
   */
  public async predict(codePattern: any): Promise<PatternPrediction> {
    return await this.patternMatcher.predict(codePattern);
  }

  /**
   * Export training report
   */
  public async exportReport(outputPath: string): Promise<void> {
    this.emit('report:exporting', { path: outputPath });

    const report = {
      config: this.config,
      modelInfo: this.patternMatcher.getModelInfo(),
      trainingHistory: this.trainingHistory,
      bestMetrics: this.bestMetrics,
      timestamp: new Date().toISOString()
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

    this.emit('report:exported', { path: outputPath });
  }
}
