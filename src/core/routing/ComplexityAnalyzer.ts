/**
 * Complexity Analyzer
 * Analyzes task complexity for model selection
 */

import { QETask } from './types';
import { TaskComplexity, TaskAnalysis } from './types';
import { COMPLEXITY_KEYWORDS } from './ModelRules';

export class ComplexityAnalyzer {
  /**
   * Analyze task complexity based on content and context
   */
  analyzeComplexity(task: QETask): TaskAnalysis {
    const taskContent = this.extractTaskContent(task);
    const keywords = this.extractKeywords(taskContent);

    // Score each complexity level
    const scores = {
      [TaskComplexity.SIMPLE]: this.scoreComplexity(keywords, TaskComplexity.SIMPLE),
      [TaskComplexity.MODERATE]: this.scoreComplexity(keywords, TaskComplexity.MODERATE),
      [TaskComplexity.COMPLEX]: this.scoreComplexity(keywords, TaskComplexity.COMPLEX),
      [TaskComplexity.CRITICAL]: this.scoreComplexity(keywords, TaskComplexity.CRITICAL),
    };

    // Determine complexity (highest score wins)
    const complexity = this.determineComplexity(scores);
    const confidence = this.calculateConfidence(scores, complexity);

    // Estimate tokens based on complexity
    const estimatedTokens = this.estimateTokens(complexity, taskContent);

    // Analyze special requirements
    const requiresReasoning = this.requiresReasoning(keywords);
    const requiresSecurity = this.requiresSecurity(keywords);
    const requiresPerformance = this.requiresPerformance(keywords);

    return {
      complexity,
      estimatedTokens,
      requiresReasoning,
      requiresSecurity,
      requiresPerformance,
      confidence,
    };
  }

  /**
   * Extract task content for analysis
   */
  private extractTaskContent(task: QETask): string {
    const parts: string[] = [];

    if (task.type) parts.push(task.type);
    if (task.description) parts.push(task.description);
    if (task.data) {
      if (typeof task.data === 'string') {
        parts.push(task.data);
      } else if (typeof task.data === 'object') {
        parts.push(JSON.stringify(task.data));
      }
    }

    return parts.join(' ').toLowerCase();
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): Set<string> {
    const words = content
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9-]/g, ''))
      .filter((w) => w.length > 2);

    return new Set(words);
  }

  /**
   * Score complexity level based on keyword matches
   */
  private scoreComplexity(keywords: Set<string>, level: TaskComplexity): number {
    const levelKeywords = COMPLEXITY_KEYWORDS[level];
    let score = 0;

    levelKeywords.forEach((keyword) => {
      if (keywords.has(keyword.toLowerCase())) {
        score += 1;
      }
    });

    // Apply weights based on level
    const weights = {
      [TaskComplexity.SIMPLE]: 1.0,
      [TaskComplexity.MODERATE]: 1.2,
      [TaskComplexity.COMPLEX]: 1.5,
      [TaskComplexity.CRITICAL]: 2.0,
    };

    return score * weights[level];
  }

  /**
   * Determine final complexity from scores
   */
  private determineComplexity(scores: Record<TaskComplexity, number>): TaskComplexity {
    let maxScore = 0;
    let complexity = TaskComplexity.SIMPLE;

    Object.entries(scores).forEach(([level, score]) => {
      if (score > maxScore) {
        maxScore = score;
        complexity = level as TaskComplexity;
      }
    });

    // If all scores are zero, default to MODERATE
    if (maxScore === 0) {
      return TaskComplexity.MODERATE;
    }

    return complexity;
  }

  /**
   * Calculate confidence in complexity determination
   */
  private calculateConfidence(
    scores: Record<TaskComplexity, number>,
    selectedComplexity: TaskComplexity
  ): number {
    const selectedScore = scores[selectedComplexity];
    const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);

    if (totalScore === 0) {
      return 0.5; // Low confidence with no keyword matches
    }

    return Math.min(selectedScore / totalScore, 1.0);
  }

  /**
   * Estimate token count based on complexity
   */
  private estimateTokens(complexity: TaskComplexity, content: string): number {
    const baseTokens = content.length / 4; // Rough estimate: 1 token per 4 chars

    const multipliers = {
      [TaskComplexity.SIMPLE]: 1.0,
      [TaskComplexity.MODERATE]: 1.5,
      [TaskComplexity.COMPLEX]: 2.5,
      [TaskComplexity.CRITICAL]: 3.5,
    };

    return Math.round(baseTokens * multipliers[complexity]);
  }

  /**
   * Check if task requires advanced reasoning
   */
  private requiresReasoning(keywords: Set<string>): boolean {
    const reasoningKeywords = [
      'algorithm',
      'optimize',
      'design',
      'architecture',
      'pattern',
      'edge case',
      'property-based',
    ];

    return reasoningKeywords.some((kw) => keywords.has(kw));
  }

  /**
   * Check if task requires security analysis
   */
  private requiresSecurity(keywords: Set<string>): boolean {
    const securityKeywords = [
      'security',
      'authentication',
      'authorization',
      'encryption',
      'vulnerability',
      'injection',
      'xss',
      'csrf',
    ];

    return securityKeywords.some((kw) => keywords.has(kw));
  }

  /**
   * Check if task requires performance analysis
   */
  private requiresPerformance(keywords: Set<string>): boolean {
    const performanceKeywords = [
      'performance',
      'optimization',
      'memory',
      'leak',
      'bottleneck',
      'concurrent',
      'parallel',
      'scale',
    ];

    return performanceKeywords.some((kw) => keywords.has(kw));
  }
}
