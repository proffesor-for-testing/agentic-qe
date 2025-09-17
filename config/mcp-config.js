/**
 * MCP Server Configuration
 *
 * Controls response size and verbosity for QE Framework MCP tools
 */

module.exports = {
  // Response size management
  response: {
    // Maximum tokens in a single response (approximate)
    maxTokens: process.env.QE_MCP_MAX_RESPONSE_TOKENS || 2000,

    // Maximum response length in characters
    maxLength: process.env.QE_MCP_MAX_RESPONSE_LENGTH || 5000,

    // Enable summary mode by default (concise responses)
    summaryMode: process.env.QE_MCP_SUMMARY_MODE !== 'false',

    // Truncate file previews in deep analysis
    truncateFilePreviews: true,

    // Maximum files to analyze in detail
    maxFilesInDetail: 3,
  },

  // Analysis settings
  analysis: {
    // Default analysis depth
    defaultDepth: process.env.QE_MCP_ANALYSIS_DEPTH || 'standard',

    // Skip directory structure in lightweight mode
    lightweightMode: process.env.QE_MCP_LIGHTWEIGHT === 'true',

    // Include test files by default
    includeTests: process.env.QE_MCP_INCLUDE_TESTS !== 'false',
  },

  // Swarm coordination settings
  swarm: {
    // Force summary mode for swarm operations
    forceSummaryMode: true,

    // Maximum agents in swarm
    maxAgents: process.env.QE_MCP_MAX_SWARM_AGENTS || 5,

    // Default coordination strategy
    defaultStrategy: process.env.QE_MCP_SWARM_STRATEGY || 'hierarchical',
  },

  // Session management
  session: {
    // Maximum session duration (ms)
    maxDuration: 3600000, // 1 hour

    // Clean up inactive sessions after (ms)
    inactivityTimeout: 900000, // 15 minutes

    // Store compressed results in memory
    compressMemory: true,
  },

  // Performance settings
  performance: {
    // Maximum concurrent tool executions
    maxConcurrent: process.env.QE_MCP_MAX_CONCURRENT || 5,

    // Cache analysis results
    enableCache: process.env.QE_MCP_ENABLE_CACHE !== 'false',

    // Cache TTL (ms)
    cacheTTL: 300000, // 5 minutes
  },

  // Logging
  logging: {
    // Log level: error, warn, info, debug
    level: process.env.QE_MCP_LOG_LEVEL || 'error',

    // Log to file
    logToFile: process.env.QE_MCP_LOG_FILE || false,
  },

  // Environment-specific overrides
  getConfig() {
    const config = { ...this };

    // In CI/CD environments, use ultra-lightweight mode
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      config.response.maxTokens = 500;
      config.response.summaryMode = true;
      config.analysis.lightweightMode = true;
    }

    // For Claude Code, default to summary mode
    if (process.env.CLAUDE_CODE || process.env.MCP_MODE) {
      config.response.summaryMode = true;
      config.response.maxTokens = 1500;
    }

    return config;
  }
};