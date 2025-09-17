/**
 * Response Formatter Utility
 *
 * Provides intelligent response formatting inspired by Claude Flow patterns
 * to keep MCP responses concise and structured.
 */

const config = require('../../config/mcp-config');

class ResponseFormatter {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || config.response?.maxTokens || 2000;
    this.format = options.format || 'summary';
    this.includeMetadata = options.includeMetadata !== false;
  }

  /**
   * Format a response based on the specified format type
   */
  format(data, formatType = this.format) {
    switch (formatType) {
      case 'summary':
        return this.formatSummary(data);
      case 'detailed':
        return this.formatDetailed(data);
      case 'json':
        return this.formatJSON(data);
      case 'minimal':
        return this.formatMinimal(data);
      default:
        return this.formatSummary(data);
    }
  }

  /**
   * Create a summary response (most concise)
   */
  formatSummary(data) {
    if (typeof data === 'string') {
      return this.truncateText(data, 500);
    }

    const summary = {
      success: data.success !== false,
      summary: this.extractSummary(data),
    };

    if (data.metrics) {
      summary.key_metrics = this.extractKeyMetrics(data.metrics);
    }

    if (data.recommendations) {
      summary.top_recommendations = data.recommendations.slice(0, 3);
    }

    if (this.includeMetadata) {
      summary.timestamp = new Date().toISOString();
      summary.format = 'summary';
    }

    return summary;
  }

  /**
   * Create a detailed response (moderate detail)
   */
  formatDetailed(data) {
    if (typeof data === 'string') {
      return this.truncateText(data, 1500);
    }

    const detailed = {
      success: data.success !== false,
      data: this.pruneDeepObject(data, 3), // Limit depth
    };

    if (this.includeMetadata) {
      detailed.metadata = {
        timestamp: new Date().toISOString(),
        format: 'detailed',
        truncated: this.wasDataTruncated(data),
      };
    }

    return detailed;
  }

  /**
   * Return raw JSON (may be large)
   */
  formatJSON(data) {
    const json = {
      success: data.success !== false,
      data: data,
    };

    if (this.includeMetadata) {
      json.metadata = {
        timestamp: new Date().toISOString(),
        format: 'json',
        size: JSON.stringify(data).length,
      };
    }

    return json;
  }

  /**
   * Ultra-minimal response
   */
  formatMinimal(data) {
    if (typeof data === 'string') {
      return { text: this.truncateText(data, 200) };
    }

    return {
      ok: data.success !== false,
      count: this.countItems(data),
      status: data.status || 'complete',
    };
  }

  /**
   * Extract a text summary from complex data
   */
  extractSummary(data) {
    if (data.summary) return this.truncateText(data.summary, 500);
    if (data.description) return this.truncateText(data.description, 500);
    if (data.message) return this.truncateText(data.message, 500);

    // Generate summary from structure
    const items = [];

    if (data.agents) items.push(`${data.agents.length || data.agents} agents`);
    if (data.tasks) items.push(`${data.tasks.length || data.tasks} tasks`);
    if (data.results) items.push(`${data.results.length || data.results} results`);
    if (data.files) items.push(`${data.files.length || data.files} files`);

    if (items.length > 0) {
      return `Analysis complete: ${items.join(', ')}`;
    }

    return 'Operation completed successfully';
  }

  /**
   * Extract key metrics only
   */
  extractKeyMetrics(metrics) {
    if (!metrics) return undefined;

    const keyMetrics = {};
    const importantKeys = [
      'success_rate', 'total', 'count', 'accuracy', 'performance',
      'coverage', 'errors', 'warnings', 'duration', 'score'
    ];

    for (const key of importantKeys) {
      if (metrics[key] !== undefined) {
        keyMetrics[key] = metrics[key];
      }
    }

    // Limit to 5 metrics
    const entries = Object.entries(keyMetrics).slice(0, 5);
    return Object.fromEntries(entries);
  }

  /**
   * Prune deeply nested objects
   */
  pruneDeepObject(obj, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return '[truncated]';
    }

    if (Array.isArray(obj)) {
      // Limit arrays to 10 items
      return obj.slice(0, 10).map(item =>
        this.pruneDeepObject(item, maxDepth, currentDepth + 1)
      );
    }

    if (obj && typeof obj === 'object') {
      const pruned = {};
      let keyCount = 0;

      for (const [key, value] of Object.entries(obj)) {
        if (keyCount >= 20) {
          pruned['...'] = 'truncated';
          break;
        }
        pruned[key] = this.pruneDeepObject(value, maxDepth, currentDepth + 1);
        keyCount++;
      }

      return pruned;
    }

    return obj;
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Count items in various data structures
   */
  countItems(data) {
    if (Array.isArray(data)) return data.length;
    if (data.length !== undefined) return data.length;
    if (data.count !== undefined) return data.count;
    if (data.total !== undefined) return data.total;
    if (typeof data === 'object') return Object.keys(data).length;
    return 1;
  }

  /**
   * Check if data was truncated
   */
  wasDataTruncated(data) {
    const jsonStr = JSON.stringify(data);
    return jsonStr.length > this.maxTokens * 4; // Rough estimate
  }

  /**
   * Format agent analysis response (QE-specific)
   */
  formatAgentAnalysis(agent, task, results, format = 'summary') {
    const baseResponse = {
      agent: agent.name,
      task: this.truncateText(task, 100),
      status: 'complete',
    };

    switch (format) {
      case 'minimal':
        return {
          ...baseResponse,
          analyzed: true,
        };

      case 'summary':
        return {
          ...baseResponse,
          findings: this.extractFindings(results, 3),
          metrics: this.extractKeyMetrics(results.metrics),
        };

      case 'detailed':
        return {
          ...baseResponse,
          findings: this.extractFindings(results, 10),
          metrics: results.metrics,
          recommendations: results.recommendations?.slice(0, 5),
        };

      default:
        return results;
    }
  }

  /**
   * Extract top findings
   */
  extractFindings(results, limit = 3) {
    const findings = [];

    if (results.findings) {
      return results.findings.slice(0, limit);
    }

    if (results.issues) {
      findings.push(`${results.issues.length} issues found`);
    }

    if (results.risks) {
      findings.push(`${results.risks.length} risks identified`);
    }

    if (results.coverage) {
      findings.push(`Coverage: ${results.coverage}%`);
    }

    return findings.slice(0, limit);
  }

  /**
   * Create a progress response for long-running operations
   */
  formatProgress(operation, progress, total) {
    return {
      operation,
      progress,
      total,
      percentage: Math.round((progress / total) * 100),
      status: progress >= total ? 'complete' : 'in_progress',
    };
  }

  /**
   * Format error response
   */
  formatError(error, includeStack = false) {
    const response = {
      success: false,
      error: error.message || String(error),
    };

    if (includeStack && error.stack) {
      response.stack = this.truncateText(error.stack, 500);
    }

    return response;
  }
}

module.exports = ResponseFormatter;