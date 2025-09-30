/**
 * MCP Tools for Agentic QE Fleet System
 * 
 * This module defines the Model Context Protocol (MCP) tools for the Agentic Quality Engineering
 * Fleet system. These tools enable Claude Flow coordination and orchestration of QE agents.
 * 
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Type definitions for tool parameters
export interface FleetConfig {
  topology: 'hierarchical' | 'mesh' | 'ring' | 'adaptive';
  maxAgents: number;
  testingFocus: string[];
  environments: string[];
  frameworks: string[];
}

export interface AgentSpec {
  type: 'test-generator' | 'coverage-analyzer' | 'quality-gate' | 'performance-tester' | 'security-scanner' | 'chaos-engineer' | 'visual-tester';
  name?: string;
  capabilities: string[];
  resources?: {
    memory: number;
    cpu: number;
    storage: number;
  };
}

export interface TestGenerationSpec {
  type: 'unit' | 'integration' | 'e2e' | 'property-based' | 'mutation';
  sourceCode: {
    repositoryUrl: string;
    branch: string;
    language: string;
    testPatterns: string[];
  };
  coverageTarget: number;
  frameworks: string[];
  synthesizeData: boolean;
}

export interface TestExecutionSpec {
  testSuites: string[];
  environments: string[];
  parallelExecution: boolean;
  retryCount: number;
  timeoutSeconds: number;
  reportFormat: 'junit' | 'tap' | 'json' | 'html';
}

export interface QualityAnalysisParams {
  scope: 'code' | 'tests' | 'performance' | 'security' | 'all';
  metrics: string[];
  thresholds: Record<string, number>;
  generateRecommendations: boolean;
}

export interface DefectPredictionScope {
  analysisType: 'file' | 'function' | 'line' | 'module';
  modelType: 'neural' | 'statistical' | 'hybrid';
  confidenceThreshold: number;
  historicalDataDays: number;
  features: string[];
}

/**
 * Core MCP Tools for Agentic QE Fleet
 * These tools enable Claude Flow to coordinate and manage QE agent fleets
 */
export const agenticQETools: Tool[] = [
  {
    name: 'mcp__agentic_qe__fleet_init',
    description: 'Initialize a new QE fleet with specified topology and configuration',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            topology: {
              type: 'string',
              enum: ['hierarchical', 'mesh', 'ring', 'adaptive'],
              description: 'Fleet coordination topology'
            },
            maxAgents: {
              type: 'number',
              minimum: 5,
              maximum: 50,
              description: 'Maximum number of agents in the fleet'
            },
            testingFocus: {
              type: 'array',
              items: { type: 'string' },
              description: 'Areas of testing focus (unit, integration, performance, etc.)'
            },
            environments: {
              type: 'array',
              items: { type: 'string' },
              description: 'Target environments for testing'
            },
            frameworks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Testing frameworks to support'
            }
          },
          required: ['topology', 'maxAgents']
        },
        projectContext: {
          type: 'object',
          properties: {
            repositoryUrl: { type: 'string' },
            language: { type: 'string' },
            buildSystem: { type: 'string' }
          }
        }
      },
      required: ['config']
    }
  },

  {
    name: 'mcp__agentic_qe__agent_spawn',
    description: 'Spawn a specialized QE agent with specific capabilities',
    inputSchema: {
      type: 'object',
      properties: {
        spec: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['test-generator', 'coverage-analyzer', 'quality-gate', 'performance-tester', 'security-scanner', 'chaos-engineer', 'visual-tester'],
              description: 'Type of specialized QE agent'
            },
            name: {
              type: 'string',
              description: 'Custom name for the agent'
            },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific capabilities for the agent'
            },
            resources: {
              type: 'object',
              properties: {
                memory: { type: 'number', description: 'Memory allocation in MB' },
                cpu: { type: 'number', description: 'CPU cores allocation' },
                storage: { type: 'number', description: 'Storage allocation in MB' }
              }
            }
          },
          required: ['type', 'capabilities']
        },
        fleetId: {
          type: 'string',
          description: 'ID of the fleet to spawn the agent in'
        }
      },
      required: ['spec']
    }
  },

  {
    name: 'mcp__agentic_qe__test_generate',
    description: 'Generate comprehensive test suites using AI analysis',
    inputSchema: {
      type: 'object',
      properties: {
        spec: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['unit', 'integration', 'e2e', 'property-based', 'mutation'],
              description: 'Type of tests to generate'
            },
            sourceCode: {
              type: 'object',
              properties: {
                repositoryUrl: { type: 'string' },
                branch: { type: 'string', default: 'main' },
                language: { type: 'string' },
                testPatterns: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'File patterns to include in analysis'
                }
              },
              required: ['repositoryUrl', 'language']
            },
            coverageTarget: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Target code coverage percentage'
            },
            frameworks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Testing frameworks to use'
            },
            synthesizeData: {
              type: 'boolean',
              default: true,
              description: 'Whether to synthesize realistic test data'
            }
          },
          required: ['type', 'sourceCode', 'coverageTarget']
        },
        agentId: {
          type: 'string',
          description: 'ID of the test generator agent to use'
        }
      },
      required: ['spec']
    }
  },

  {
    name: 'mcp__agentic_qe__test_execute',
    description: 'Execute test suites with orchestrated parallel execution',
    inputSchema: {
      type: 'object',
      properties: {
        spec: {
          type: 'object',
          properties: {
            testSuites: {
              type: 'array',
              items: { type: 'string' },
              description: 'Test suites to execute'
            },
            environments: {
              type: 'array',
              items: { type: 'string' },
              description: 'Target environments'
            },
            parallelExecution: {
              type: 'boolean',
              default: true,
              description: 'Enable parallel test execution'
            },
            retryCount: {
              type: 'number',
              minimum: 0,
              maximum: 5,
              default: 3,
              description: 'Number of retries for flaky tests'
            },
            timeoutSeconds: {
              type: 'number',
              minimum: 10,
              default: 300,
              description: 'Timeout for test execution'
            },
            reportFormat: {
              type: 'string',
              enum: ['junit', 'tap', 'json', 'html'],
              default: 'json',
              description: 'Test report format'
            }
          },
          required: ['testSuites']
        },
        fleetId: {
          type: 'string',
          description: 'Fleet ID for coordinated execution'
        }
      },
      required: ['spec']
    }
  },

  {
    name: 'mcp__agentic_qe__quality_analyze',
    description: 'Analyze quality metrics and generate comprehensive reports',
    inputSchema: {
      type: 'object',
      properties: {
        params: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['code', 'tests', 'performance', 'security', 'all'],
              description: 'Scope of quality analysis'
            },
            metrics: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific metrics to analyze'
            },
            thresholds: {
              type: 'object',
              additionalProperties: { type: 'number' },
              description: 'Quality thresholds for pass/fail decisions'
            },
            generateRecommendations: {
              type: 'boolean',
              default: true,
              description: 'Generate improvement recommendations'
            },
            historicalComparison: {
              type: 'boolean',
              default: false,
              description: 'Compare with historical quality trends'
            }
          },
          required: ['scope', 'metrics']
        },
        dataSource: {
          type: 'object',
          properties: {
            testResults: { type: 'string', description: 'Path to test results' },
            codeMetrics: { type: 'string', description: 'Path to code quality metrics' },
            performanceData: { type: 'string', description: 'Path to performance data' }
          }
        }
      },
      required: ['params']
    }
  },

  {
    name: 'mcp__agentic_qe__predict_defects',
    description: 'Predict potential defects using AI/ML models',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'object',
          properties: {
            analysisType: {
              type: 'string',
              enum: ['file', 'function', 'line', 'module'],
              description: 'Granularity of defect prediction'
            },
            modelType: {
              type: 'string',
              enum: ['neural', 'statistical', 'hybrid'],
              description: 'Type of prediction model to use'
            },
            confidenceThreshold: {
              type: 'number',
              minimum: 0.0,
              maximum: 1.0,
              default: 0.8,
              description: 'Minimum confidence for predictions'
            },
            historicalDataDays: {
              type: 'number',
              minimum: 7,
              maximum: 365,
              default: 90,
              description: 'Days of historical data to consider'
            },
            features: {
              type: 'array',
              items: { type: 'string' },
              description: 'Code features to analyze for prediction'
            }
          },
          required: ['analysisType', 'modelType']
        },
        codeChanges: {
          type: 'object',
          properties: {
            repository: { type: 'string' },
            commit: { type: 'string' },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to analyze for defect risk'
            }
          },
          required: ['repository']
        }
      },
      required: ['scope']
    }
  },

  {
    name: 'mcp__agentic_qe__fleet_status',
    description: 'Get comprehensive status of QE fleet and agents',
    inputSchema: {
      type: 'object',
      properties: {
        fleetId: {
          type: 'string',
          description: 'Fleet ID to get status for'
        },
        includeMetrics: {
          type: 'boolean',
          default: true,
          description: 'Include performance metrics'
        },
        includeAgentDetails: {
          type: 'boolean',
          default: false,
          description: 'Include detailed agent information'
        }
      }
    }
  },

  {
    name: 'mcp__agentic_qe__task_orchestrate',
    description: 'Orchestrate complex QE tasks across multiple agents',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['comprehensive-testing', 'quality-gate', 'defect-prevention', 'performance-validation'],
              description: 'Type of orchestrated task'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
              description: 'Task priority level'
            },
            strategy: {
              type: 'string',
              enum: ['parallel', 'sequential', 'adaptive'],
              default: 'adaptive',
              description: 'Execution strategy'
            },
            maxAgents: {
              type: 'number',
              minimum: 1,
              maximum: 10,
              description: 'Maximum agents to use for task'
            },
            timeoutMinutes: {
              type: 'number',
              minimum: 1,
              default: 30,
              description: 'Task timeout in minutes'
            }
          },
          required: ['type']
        },
        context: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            branch: { type: 'string' },
            environment: { type: 'string' },
            requirements: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific requirements for the task'
            }
          }
        },
        fleetId: {
          type: 'string',
          description: 'Fleet to orchestrate task within'
        }
      },
      required: ['task']
    }
  },

  {
    name: 'mcp__agentic_qe__optimize_tests',
    description: 'Optimize test suites using sublinear algorithms',
    inputSchema: {
      type: 'object',
      properties: {
        optimization: {
          type: 'object',
          properties: {
            algorithm: {
              type: 'string',
              enum: ['sublinear', 'johnson-lindenstrauss', 'temporal-advantage'],
              description: 'Optimization algorithm to use'
            },
            targetMetric: {
              type: 'string',
              enum: ['execution-time', 'coverage', 'cost', 'reliability'],
              description: 'Primary optimization target'
            },
            constraints: {
              type: 'object',
              properties: {
                maxExecutionTime: { type: 'number' },
                minCoverage: { type: 'number' },
                maxCost: { type: 'number' }
              }
            }
          },
          required: ['algorithm', 'targetMetric']
        },
        testSuite: {
          type: 'object',
          properties: {
            size: { type: 'number' },
            characteristics: {
              type: 'array',
              items: { type: 'string' }
            },
            historical_performance: { type: 'object' }
          }
        }
      },
      required: ['optimization']
    }
  }
];

/**
 * Export tool names for easy reference
 */
export const TOOL_NAMES = {
  FLEET_INIT: 'mcp__agentic_qe__fleet_init',
  AGENT_SPAWN: 'mcp__agentic_qe__agent_spawn',
  TEST_GENERATE: 'mcp__agentic_qe__test_generate',
  TEST_EXECUTE: 'mcp__agentic_qe__test_execute',
  QUALITY_ANALYZE: 'mcp__agentic_qe__quality_analyze',
  PREDICT_DEFECTS: 'mcp__agentic_qe__predict_defects',
  FLEET_STATUS: 'mcp__agentic_qe__fleet_status',
  TASK_ORCHESTRATE: 'mcp__agentic_qe__task_orchestrate',
  OPTIMIZE_TESTS: 'mcp__agentic_qe__optimize_tests'
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
