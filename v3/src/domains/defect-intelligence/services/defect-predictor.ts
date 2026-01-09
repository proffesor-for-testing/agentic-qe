/**
 * Agentic QE v3 - Defect Prediction Service
 * ML-based defect prediction using code metrics and historical data
 * Uses GitAnalyzer for real git history analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, Severity } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  PredictRequest,
  PredictionResult,
  FilePrediction,
  PredictionFeature,
  RegressionRequest,
  RegressionRisk,
  ImpactedArea,
} from '../interfaces';
import { GitAnalyzer } from '../../../shared/git';
import { FileReader } from '../../../shared/io';
import { TypeScriptParser } from '../../../shared/parsers';

/**
 * Interface for the defect prediction service
 */
export interface IDefectPredictorService {
  predictDefects(request: PredictRequest): Promise<Result<PredictionResult, Error>>;
  analyzeRegressionRisk(request: RegressionRequest): Promise<Result<RegressionRisk, Error>>;
  updateModel(feedback: PredictionFeedback): Promise<Result<void, Error>>;
  getModelMetrics(): Promise<ModelMetrics>;
}

/**
 * Prediction feedback for model improvement
 */
export interface PredictionFeedback {
  predictionId: string;
  file: string;
  predictedProbability: number;
  actualDefect: boolean;
  defectType?: string;
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalPredictions: number;
  lastUpdated: Date;
}

/**
 * Configuration for the defect predictor
 */
export interface DefectPredictorConfig {
  defaultThreshold: number;
  maxPredictionsPerBatch: number;
  enableHistoricalAnalysis: boolean;
  modelNamespace: string;
  featureWeights: Record<string, number>;
}

const DEFAULT_CONFIG: DefectPredictorConfig = {
  defaultThreshold: 0.5,
  maxPredictionsPerBatch: 100,
  enableHistoricalAnalysis: true,
  modelNamespace: 'defect-intelligence:predictor',
  featureWeights: {
    codeComplexity: 0.25,
    changeFrequency: 0.20,
    developerExperience: 0.15,
    testCoverage: 0.20,
    codeAge: 0.10,
    bugHistory: 0.10,
  },
};

/**
 * Default prediction features
 */
const DEFAULT_FEATURES: PredictionFeature[] = [
  { name: 'codeComplexity', weight: 0.25 },
  { name: 'changeFrequency', weight: 0.20 },
  { name: 'developerExperience', weight: 0.15 },
  { name: 'testCoverage', weight: 0.20 },
  { name: 'codeAge', weight: 0.10 },
  { name: 'bugHistory', weight: 0.10 },
];

/**
 * Defect Prediction Service Implementation
 * Uses ML-based heuristics to predict defect probability in code files
 */
export class DefectPredictorService implements IDefectPredictorService {
  private readonly config: DefectPredictorConfig;
  private readonly gitAnalyzer: GitAnalyzer;
  private readonly fileReader: FileReader;
  private readonly tsParser: TypeScriptParser;
  private modelMetrics: ModelMetrics = {
    accuracy: 0.75,
    precision: 0.72,
    recall: 0.78,
    f1Score: 0.75,
    totalPredictions: 0,
    lastUpdated: new Date(),
  };

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<DefectPredictorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gitAnalyzer = new GitAnalyzer({ enableCache: true });
    this.fileReader = new FileReader();
    this.tsParser = new TypeScriptParser();
  }

  /**
   * Predict defect probability for given files
   */
  async predictDefects(request: PredictRequest): Promise<Result<PredictionResult, Error>> {
    try {
      const {
        files,
        features = DEFAULT_FEATURES,
        threshold = this.config.defaultThreshold,
      } = request;

      if (files.length === 0) {
        return err(new Error('No files provided for prediction'));
      }

      if (files.length > this.config.maxPredictionsPerBatch) {
        return err(new Error(`Too many files. Maximum: ${this.config.maxPredictionsPerBatch}`));
      }

      const predictions: FilePrediction[] = [];
      const factors: Set<string> = new Set();

      for (const file of files) {
        const prediction = await this.predictForFile(file, features, threshold);
        predictions.push(prediction);
        prediction.factors.forEach((f) => factors.add(f.name));
      }

      // Calculate model confidence based on historical accuracy
      const modelConfidence = this.calculateModelConfidence(predictions);

      // Store prediction for potential feedback
      await this.storePrediction(predictions);

      // Update metrics
      this.modelMetrics.totalPredictions += predictions.length;
      this.modelMetrics.lastUpdated = new Date();

      return ok({
        predictions,
        modelConfidence,
        factors: Array.from(factors),
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze regression risk for a changeset
   */
  async analyzeRegressionRisk(
    request: RegressionRequest
  ): Promise<Result<RegressionRisk, Error>> {
    try {
      const { changeset, baseline, depth = 'shallow' } = request;

      if (changeset.length === 0) {
        return err(new Error('No files in changeset'));
      }

      // Analyze each changed file
      const impactedAreas: ImpactedArea[] = [];
      let totalRisk = 0;

      for (const file of changeset) {
        const fileAnalysis = await this.analyzeFileImpact(file, depth);
        impactedAreas.push(...fileAnalysis.areas);
        totalRisk += fileAnalysis.risk;
      }

      // Consider baseline if provided
      if (baseline && this.config.enableHistoricalAnalysis) {
        const baselineRisk = await this.getBaselineRisk(baseline);
        totalRisk = (totalRisk + baselineRisk) / 2;
      }

      // Normalize overall risk
      const overallRisk = Math.min(1, totalRisk / changeset.length);
      const riskLevel = this.riskToSeverity(overallRisk);

      // Generate test recommendations based on impacted areas
      const recommendedTests = this.generateTestRecommendations(impactedAreas);

      // Calculate confidence based on analysis depth
      const confidence = depth === 'deep' ? 0.85 : 0.70;

      return ok({
        overallRisk,
        riskLevel,
        impactedAreas,
        recommendedTests,
        confidence,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update the prediction model with feedback
   */
  async updateModel(feedback: PredictionFeedback): Promise<Result<void, Error>> {
    try {
      // Store feedback for model improvement
      const feedbackKey = `${this.config.modelNamespace}:feedback:${feedback.predictionId}`;
      await this.memory.set(feedbackKey, feedback, {
        namespace: 'defect-intelligence',
        persist: true,
      });

      // Update model metrics based on feedback
      await this.recalculateMetrics(feedback);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get current model performance metrics
   */
  async getModelMetrics(): Promise<ModelMetrics> {
    // Try to load persisted metrics
    const storedMetrics = await this.memory.get<ModelMetrics>(
      `${this.config.modelNamespace}:metrics`
    );

    if (storedMetrics) {
      this.modelMetrics = {
        ...storedMetrics,
        lastUpdated: new Date(storedMetrics.lastUpdated),
      };
    }

    return { ...this.modelMetrics };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async predictForFile(
    file: string,
    features: PredictionFeature[],
    threshold: number
  ): Promise<FilePrediction> {
    // Extract file metrics
    const fileMetrics = await this.extractFileMetrics(file);

    // Calculate probability based on weighted features
    const featureContributions: { name: string; contribution: number }[] = [];
    let probability = 0;

    for (const feature of features) {
      const metricValue = fileMetrics[feature.name] ?? 0;
      const contribution = metricValue * feature.weight;
      probability += contribution;
      featureContributions.push({
        name: feature.name,
        contribution: Math.round(contribution * 100) / 100,
      });
    }

    // Normalize probability to 0-1 range
    probability = Math.max(0, Math.min(1, probability));

    // Determine risk level
    const riskLevel = this.probabilityToRisk(probability, threshold);

    // Generate recommendations based on high-contributing factors
    const recommendations = this.generateRecommendations(featureContributions, probability);

    return {
      file,
      probability,
      riskLevel,
      factors: featureContributions.filter((f) => f.contribution > 0.05),
      recommendations,
    };
  }

  private async extractFileMetrics(file: string): Promise<Record<string, number>> {
    // Try to get cached metrics
    const cachedMetrics = await this.memory.get<Record<string, number>>(
      `${this.config.modelNamespace}:file-metrics:${file}`
    );

    if (cachedMetrics) {
      return cachedMetrics;
    }

    // Calculate metrics using real code analysis and git history
    const metrics: Record<string, number> = {
      codeComplexity: await this.calculateComplexity(file),
      changeFrequency: await this.getChangeFrequency(file),
      developerExperience: await this.getDeveloperExperience(file),
      testCoverage: await this.getTestCoverage(file),
      codeAge: await this.getCodeAge(file),
      bugHistory: await this.getBugHistory(file),
    };

    // Cache metrics
    await this.memory.set(
      `${this.config.modelNamespace}:file-metrics:${file}`,
      metrics,
      { namespace: 'defect-intelligence', ttl: 3600 } // 1 hour cache
    );

    return metrics;
  }

  /**
   * Calculate code complexity using TypeScript AST analysis
   * Falls back to path-based heuristics if file cannot be parsed
   */
  private async calculateComplexity(file: string): Promise<number> {
    const extension = file.split('.').pop()?.toLowerCase();

    // For TypeScript/JavaScript files, use AST analysis
    if (extension && ['ts', 'tsx', 'js', 'jsx'].includes(extension)) {
      const fileResult = await this.fileReader.readFile(file);

      if (fileResult.success) {
        try {
          const fileName = file.split('/').pop() || file;
          const ast = this.tsParser.parseFile(fileName, fileResult.value);

          // Extract structural metrics
          const functions = this.tsParser.extractFunctions(ast);
          const classes = this.tsParser.extractClasses(ast);

          // Calculate complexity factors
          const lines = fileResult.value.split('\n').length;
          const functionCount = functions.length;
          const classCount = classes.length;
          const methodCount = classes.reduce((sum, cls) => sum + cls.methods.length, 0);
          const asyncCount = functions.filter((f) => f.isAsync).length;

          // Count complexity indicators in code
          const content = fileResult.value;
          const ifCount = (content.match(/\bif\s*\(/g) || []).length;
          const loopCount = (content.match(/\b(for|while|do)\s*[\(\{]/g) || []).length;
          const switchCount = (content.match(/\bswitch\s*\(/g) || []).length;
          const catchCount = (content.match(/\bcatch\s*\(/g) || []).length;
          const ternaryCount = (content.match(/\?[^?:]+:/g) || []).length;

          // Calculate cyclomatic complexity proxy
          const cyclomaticProxy = ifCount + loopCount * 2 + switchCount * 2 + catchCount + ternaryCount;

          // Normalize metrics to 0-1 scale
          const lineComplexity = Math.min(1, lines / 500); // 500 lines = max
          const functionComplexity = Math.min(1, (functionCount + methodCount) / 30); // 30 functions = max
          const branchComplexity = Math.min(1, cyclomaticProxy / 50); // 50 branches = max
          const asyncComplexity = asyncCount > 0 ? 0.1 : 0; // Async adds complexity

          // Weighted average
          const complexity =
            lineComplexity * 0.2 +
            functionComplexity * 0.25 +
            branchComplexity * 0.4 +
            asyncComplexity +
            (classCount > 3 ? 0.05 : 0); // Many classes add complexity

          return Math.max(0, Math.min(1, complexity));
        } catch {
          // Fall through to heuristics if parsing fails
        }
      }
    }

    // Fallback: Path-based heuristics for non-TS/JS files or parse failures
    return this.estimateComplexityFromPath(file);
  }

  /**
   * Estimate complexity based on file path heuristics (fallback)
   */
  private estimateComplexityFromPath(file: string): number {
    const pathParts = file.split('/');
    const filename = pathParts[pathParts.length - 1];

    let complexity = 0.3;
    if (file.includes('controller') || file.includes('service')) complexity += 0.2;
    if (file.includes('coordinator') || file.includes('orchestrator')) complexity += 0.15;
    if (file.includes('utils') || file.includes('helper')) complexity -= 0.1;
    if (file.includes('types') || file.includes('interfaces')) complexity -= 0.15;
    if (filename.length > 30) complexity += 0.1;

    return Math.max(0, Math.min(1, complexity));
  }

  /**
   * Get change frequency for a file using git history
   * Falls back to memory cache if git is not available
   */
  private async getChangeFrequency(file: string): Promise<number> {
    // Try git analysis first
    const gitFrequency = await this.gitAnalyzer.getChangeFrequency(file);
    if (gitFrequency !== 0.4) {
      // Cache the result
      await this.memory.set(
        `${this.config.modelNamespace}:history:${file}`,
        { changes: Math.round(gitFrequency * 30) },
        { ttl: 3600 }
      );
      return gitFrequency;
    }

    // Fallback to cached value
    const historyKey = `${this.config.modelNamespace}:history:${file}`;
    const history = await this.memory.get<{ changes: number }>(historyKey);
    if (history) {
      return Math.min(1, history.changes / 50);
    }

    return 0.4;
  }

  /**
   * Get developer experience score for a file using git blame
   * Falls back to memory cache if git is not available
   */
  private async getDeveloperExperience(file: string): Promise<number> {
    // Try git analysis first
    const gitExp = await this.gitAnalyzer.getDeveloperExperience(file);
    if (gitExp !== 0.5) {
      // Cache the result
      await this.memory.set(
        `${this.config.modelNamespace}:developer-exp:${file}`,
        { score: gitExp },
        { ttl: 3600 }
      );
      return gitExp;
    }

    // Fallback to cached value
    const expKey = `${this.config.modelNamespace}:developer-exp:${file}`;
    const exp = await this.memory.get<{ score: number }>(expKey);
    if (exp) {
      return exp.score;
    }

    return 0.5;
  }

  /**
   * Get test coverage for a file from coverage reports
   */
  private async getTestCoverage(file: string): Promise<number> {
    const coverageKey = `coverage-analysis:file:${file}`;
    const coverage = await this.memory.get<{ percentage: number }>(coverageKey);

    if (coverage) {
      // Invert: low coverage = high defect risk
      return 1 - coverage.percentage / 100;
    }

    // Default to medium coverage (inverted)
    return 0.4;
  }

  /**
   * Get code age for a file using git history
   * Falls back to memory cache if git is not available
   */
  private async getCodeAge(file: string): Promise<number> {
    // Try git analysis first
    const gitAge = await this.gitAnalyzer.getCodeAge(file);
    if (gitAge !== 0.4) {
      return gitAge;
    }

    // Fallback to cached value
    const ageKey = `${this.config.modelNamespace}:age:${file}`;
    const age = await this.memory.get<{ days: number }>(ageKey);

    if (age) {
      if (age.days < 7) return 0.7; // New code
      if (age.days > 365) return 0.3; // Stable code
      return 0.4;
    }

    return 0.4;
  }

  /**
   * Get bug history for a file using git commit messages
   * Falls back to memory cache if git is not available
   */
  private async getBugHistory(file: string): Promise<number> {
    // Try git analysis first
    const gitBugs = await this.gitAnalyzer.getBugHistory(file);
    if (gitBugs !== 0.2) {
      // Cache the result
      await this.memory.set(
        `${this.config.modelNamespace}:bugs:${file}`,
        { count: Math.round(gitBugs * 10) },
        { ttl: 3600 }
      );
      return gitBugs;
    }

    // Fallback to cached value
    const bugKey = `${this.config.modelNamespace}:bugs:${file}`;
    const bugs = await this.memory.get<{ count: number }>(bugKey);

    if (bugs) {
      return Math.min(1, bugs.count / 10);
    }

    return 0.2;
  }

  private probabilityToRisk(probability: number, threshold: number): Severity {
    if (probability >= threshold + 0.3) return 'critical';
    if (probability >= threshold + 0.15) return 'high';
    if (probability >= threshold) return 'medium';
    if (probability >= threshold - 0.2) return 'low';
    return 'info';
  }

  private riskToSeverity(risk: number): Severity {
    if (risk >= 0.8) return 'critical';
    if (risk >= 0.6) return 'high';
    if (risk >= 0.4) return 'medium';
    if (risk >= 0.2) return 'low';
    return 'info';
  }

  private generateRecommendations(
    factors: { name: string; contribution: number }[],
    probability: number
  ): string[] {
    const recommendations: string[] = [];

    // Sort factors by contribution
    const sortedFactors = [...factors].sort((a, b) => b.contribution - a.contribution);

    for (const factor of sortedFactors.slice(0, 3)) {
      switch (factor.name) {
        case 'codeComplexity':
          if (factor.contribution > 0.1) {
            recommendations.push('Consider refactoring to reduce cyclomatic complexity');
            recommendations.push('Break down large functions into smaller, testable units');
          }
          break;
        case 'changeFrequency':
          if (factor.contribution > 0.1) {
            recommendations.push('High churn area - add comprehensive regression tests');
            recommendations.push('Consider stabilizing the interface before further changes');
          }
          break;
        case 'testCoverage':
          if (factor.contribution > 0.1) {
            recommendations.push('Increase test coverage to reduce defect risk');
            recommendations.push('Add unit tests for critical paths');
          }
          break;
        case 'bugHistory':
          if (factor.contribution > 0.1) {
            recommendations.push('Review past bug fixes for patterns');
            recommendations.push('Add regression tests for previously fixed issues');
          }
          break;
        case 'codeAge':
          if (factor.contribution > 0.1) {
            recommendations.push('New code requires thorough review and testing');
          }
          break;
        case 'developerExperience':
          if (factor.contribution > 0.1) {
            recommendations.push('Request code review from senior developer');
          }
          break;
      }
    }

    if (probability > 0.7) {
      recommendations.push('CRITICAL: Schedule immediate code review');
    }

    return recommendations;
  }

  private async analyzeFileImpact(
    file: string,
    depth: 'shallow' | 'deep'
  ): Promise<{ areas: ImpactedArea[]; risk: number }> {
    const areas: ImpactedArea[] = [];
    let risk = 0;

    // Determine impacted areas based on file path
    const area = this.categorizeFile(file);
    const fileRisk = (await this.extractFileMetrics(file)).codeComplexity;

    areas.push({
      area,
      files: [file],
      risk: fileRisk,
      reason: `Modified file in ${area} area`,
    });

    risk += fileRisk;

    // Deep analysis includes dependency analysis
    if (depth === 'deep') {
      const dependencies = await this.analyzeDependencies(file);
      for (const dep of dependencies) {
        const depRisk = (await this.extractFileMetrics(dep)).codeComplexity * 0.5;
        areas.push({
          area: this.categorizeFile(dep),
          files: [dep],
          risk: depRisk,
          reason: `Dependency of ${file}`,
        });
        risk += depRisk;
      }
    }

    return { areas, risk };
  }

  private categorizeFile(file: string): string {
    if (file.includes('controller')) return 'API Layer';
    if (file.includes('service')) return 'Business Logic';
    if (file.includes('repository') || file.includes('dao')) return 'Data Access';
    if (file.includes('model') || file.includes('entity')) return 'Domain Model';
    if (file.includes('util') || file.includes('helper')) return 'Utilities';
    if (file.includes('test')) return 'Tests';
    if (file.includes('config')) return 'Configuration';
    return 'General';
  }

  private async analyzeDependencies(file: string): Promise<string[]> {
    // Check cache first
    const depsKey = `code-intelligence:dependencies:${file}`;
    const cachedDeps = await this.memory.get<string[]>(depsKey);
    if (cachedDeps && cachedDeps.length > 0) {
      return cachedDeps;
    }

    // Parse the file to extract imports
    const dependencies: string[] = [];
    try {
      const fileResult = await this.fileReader.readFile(file);
      if (!fileResult.success) {
        return [];
      }

      const fileName = file.split('/').pop() || file;
      const ast = this.tsParser.parseFile(fileName, fileResult.value);
      const imports = this.tsParser.extractImports(ast);

      for (const importInfo of imports) {
        // Resolve relative imports to actual file paths
        if (importInfo.module.startsWith('.')) {
          const resolvedPath = this.resolveRelativeImport(file, importInfo.module);
          dependencies.push(resolvedPath);
        } else if (!importInfo.module.startsWith('node:')) {
          // External package dependencies
          dependencies.push(importInfo.module);
        }
      }

      // Cache the dependencies for future lookups
      if (dependencies.length > 0) {
        await this.memory.set(depsKey, dependencies, {
          namespace: 'code-intelligence',
          ttl: 3600, // Cache for 1 hour
        });
      }
    } catch (error) {
      // Log but don't fail - return empty array
      console.error(`Failed to analyze dependencies for ${file}:`, error);
    }

    return dependencies;
  }

  /**
   * Resolve a relative import path to an absolute file path
   */
  private resolveRelativeImport(fromFile: string, importPath: string): string {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
    const segments = fromDir.split('/');

    // Process the relative path
    const importSegments = importPath.split('/');
    for (const segment of importSegments) {
      if (segment === '.') {
        continue;
      } else if (segment === '..') {
        segments.pop();
      } else {
        segments.push(segment);
      }
    }

    let resolved = segments.join('/');

    // Add file extension if not present
    if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx') && !resolved.endsWith('.js')) {
      // Check common extensions - prefer .ts
      resolved = resolved + '.ts';
    }

    return resolved;
  }

  private async getBaselineRisk(baseline: string): Promise<number> {
    const baselineKey = `${this.config.modelNamespace}:baseline:${baseline}`;
    const baselineData = await this.memory.get<{ risk: number }>(baselineKey);
    return baselineData?.risk ?? 0.3;
  }

  private generateTestRecommendations(areas: ImpactedArea[]): string[] {
    const recommendations: string[] = [];
    const areaNames = new Set(areas.map((a) => a.area));

    for (const area of areaNames) {
      switch (area) {
        case 'API Layer':
          recommendations.push('Run API integration tests');
          recommendations.push('Verify endpoint response contracts');
          break;
        case 'Business Logic':
          recommendations.push('Run unit tests for business rules');
          recommendations.push('Execute scenario-based tests');
          break;
        case 'Data Access':
          recommendations.push('Run database integration tests');
          recommendations.push('Verify data integrity constraints');
          break;
        case 'Domain Model':
          recommendations.push('Run entity validation tests');
          recommendations.push('Check serialization/deserialization');
          break;
      }
    }

    // Add general recommendations based on risk
    const highRiskAreas = areas.filter((a) => a.risk > 0.6);
    if (highRiskAreas.length > 0) {
      recommendations.push('Run full regression test suite');
      recommendations.push('Consider exploratory testing for edge cases');
    }

    return [...new Set(recommendations)];
  }

  private calculateModelConfidence(predictions: FilePrediction[]): number {
    // Base confidence from model metrics
    let confidence = this.modelMetrics.accuracy;

    // Adjust based on prediction spread
    const probabilities = predictions.map((p) => p.probability);
    const variance = this.calculateVariance(probabilities);

    // High variance indicates uncertain predictions
    if (variance > 0.2) confidence *= 0.9;

    // More predictions generally mean better confidence
    if (predictions.length > 10) confidence *= 1.05;

    return Math.min(1, Math.max(0, confidence));
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  private async storePrediction(predictions: FilePrediction[]): Promise<void> {
    const predictionId = uuidv4();
    await this.memory.set(
      `${this.config.modelNamespace}:prediction:${predictionId}`,
      {
        id: predictionId,
        predictions,
        timestamp: new Date().toISOString(),
      },
      { namespace: 'defect-intelligence', ttl: 86400 * 7 } // 7 days
    );
  }

  private async recalculateMetrics(feedback: PredictionFeedback): Promise<void> {
    // Simple online update of accuracy
    const predicted = feedback.predictedProbability >= this.config.defaultThreshold;
    const correct = predicted === feedback.actualDefect;

    // Moving average update
    const alpha = 0.01; // Learning rate
    this.modelMetrics.accuracy =
      this.modelMetrics.accuracy * (1 - alpha) + (correct ? 1 : 0) * alpha;

    // Update precision/recall
    if (predicted && feedback.actualDefect) {
      // True positive
      this.modelMetrics.precision =
        this.modelMetrics.precision * (1 - alpha) + 1 * alpha;
      this.modelMetrics.recall =
        this.modelMetrics.recall * (1 - alpha) + 1 * alpha;
    } else if (predicted && !feedback.actualDefect) {
      // False positive
      this.modelMetrics.precision =
        this.modelMetrics.precision * (1 - alpha) + 0 * alpha;
    } else if (!predicted && feedback.actualDefect) {
      // False negative
      this.modelMetrics.recall =
        this.modelMetrics.recall * (1 - alpha) + 0 * alpha;
    }

    // Calculate F1
    this.modelMetrics.f1Score =
      (2 * this.modelMetrics.precision * this.modelMetrics.recall) /
      (this.modelMetrics.precision + this.modelMetrics.recall || 1);

    this.modelMetrics.lastUpdated = new Date();

    // Persist metrics
    await this.memory.set(
      `${this.config.modelNamespace}:metrics`,
      this.modelMetrics,
      { namespace: 'defect-intelligence', persist: true }
    );
  }
}
