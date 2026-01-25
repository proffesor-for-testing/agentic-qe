/**
 * Type definitions for Analysis MCP Tools
 */

export interface CoverageData {
  file: string;
  lines: number;
  covered: number;
  branches: number;
  branchesCovered: number;
}

export interface CoverageGap {
  file: string;
  type: 'uncovered-lines' | 'uncovered-branches' | 'uncovered-functions' | 'edge-cases';
  location: {
    start: number;
    end: number;
  };
  severity: 'critical' | 'high' | 'medium' | 'low';
  complexity: number;
  suggestedTests?: string[];
  riskScore?: number;
  context?: string;
}

export interface SublinearAnalysisResult {
  algorithm: string;
  originalDimension: number;
  reducedDimension: number;
  distortion: number;
}

export interface AIAnalysisResult {
  patterns: string[];
  recommendations: string[];
  riskAreas: string[];
}

export interface BenchmarkConfig {
  iterations: number;
  warmupRuns: number;
  concurrency: number;
  timeout: number;
}

export interface BenchmarkResult {
  target: string;
  metrics: any;
  status: 'pass' | 'fail' | 'warning';
}
