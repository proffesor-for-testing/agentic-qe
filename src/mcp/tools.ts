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
  environments?: string[];  // Made optional for streaming compatibility
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
  // ═════════════════════════════════════════════════════════════════════════════
  //                           CORE TOOLS - FLEET MANAGEMENT
  //                    Always loaded for basic fleet operations and coordination
  // ═════════════════════════════════════════════════════════════════════════════

  
  // Category: core | Domain: fleet

  
  
  {
    name: 'mcp__agentic_qe__fleet_init',
    description: 'Init QE fleet with specified topology and config',
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

  
  // Category: core | Domain: fleet


  {
    name: 'mcp__agentic_qe__agent_spawn',
    description: 'Spawn specialized QE agent with specific capabilities',
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

  // NOTE: Legacy test_generate removed in Issue #115
  // Use test_generate_enhanced instead

  // ═════════════════════════════════════════════════════════════════════════════
  //                           CORE TOOLS - TESTING EXECUTION
  //                    Always loaded for test generation and execution
  // ═════════════════════════════════════════════════════════════════════════════


  
  // Category: core | Domain: testing


  
  

  {
    name: 'mcp__agentic_qe__test_execute',
    description: 'Execute test suites with parallel orchestration',
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

  // NOTE: Legacy quality_analyze removed in Issue #115
  // Use qe_qualitygate_evaluate instead

  // NOTE: Legacy predict_defects removed in Issue #115
  // Use predict_defects_ai instead

  // Category: core | Domain: fleet


  {
    name: 'mcp__agentic_qe__fleet_status',
    description: 'Get QE fleet and agent status',
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
  // ═════════════════════════════════════════════════════════════════════════════
  //                           CORE TOOLS - TASK ORCHESTRATION
  //                    Always loaded for task management and coordination
  // ═════════════════════════════════════════════════════════════════════════════


  
  // Category: core | Domain: orchestration


  
  

  {
    name: 'mcp__agentic_qe__task_orchestrate',
    description: 'Orchestrate QE tasks across multiple agents',
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

  // NOTE: Legacy optimize_tests removed in Issue #115
  // Use test_optimize_sublinear instead

  // Enhanced Test Tools
  
  // Category: core | Domain: testing

  {
    name: 'mcp__agentic_qe__test_generate_enhanced',
    description: 'AI test generation with pattern recognition & anti-pattern detection',
    inputSchema: {
      type: 'object',
      properties: {
        sourceCode: {
          type: 'string',
          description: 'Source code to analyze and generate tests for'
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'java', 'go'],
          description: 'Programming language'
        },
        testType: {
          type: 'string',
          enum: ['unit', 'integration', 'e2e', 'property-based', 'mutation'],
          description: 'Type of tests to generate'
        },
        aiEnhancement: {
          type: 'boolean',
          default: true,
          description: 'Enable AI-powered analysis and generation'
        },
        coverageGoal: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Target coverage percentage'
        },
        detectAntiPatterns: {
          type: 'boolean',
          default: false,
          description: 'Detect and report code anti-patterns'
        }
      },
      required: ['sourceCode', 'language', 'testType']
    }
  },

  
  // Category: core | Domain: testing


  {
    name: 'mcp__agentic_qe__test_execute_parallel',
    description: 'Execute tests in parallel with workers, retry, & load balancing',
    inputSchema: {
      type: 'object',
      properties: {
        testFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of test files to execute'
        },
        parallelism: {
          type: 'number',
          minimum: 1,
          maximum: 16,
          default: 4,
          description: 'Number of parallel workers'
        },
        timeout: {
          type: 'number',
          default: 5000,
          description: 'Test execution timeout in milliseconds'
        },
        retryFailures: {
          type: 'boolean',
          default: true,
          description: 'Retry failed tests'
        },
        maxRetries: {
          type: 'number',
          default: 3,
          minimum: 0,
          maximum: 5,
          description: 'Maximum retry attempts'
        },
        retryDelay: {
          type: 'number',
          default: 1000,
          description: 'Delay between retries in milliseconds'
        },
        continueOnFailure: {
          type: 'boolean',
          default: true,
          description: 'Continue execution if a test fails'
        },
        loadBalancing: {
          type: 'string',
          enum: ['round-robin', 'least-loaded', 'random'],
          default: 'round-robin',
          description: 'Load balancing strategy'
        },
        collectCoverage: {
          type: 'boolean',
          default: false,
          description: 'Collect coverage data during execution'
        }
      },
      required: ['testFiles']
    }
  },
  // ═════════════════════════════════════════════════════════════════════════════
  //                           TESTING DOMAIN TOOLS
  //                    Test optimization, coverage, execution, and flaky detection
  // ═════════════════════════════════════════════════════════════════════════════


  
  // Category: testing | Domain: optimization


  
  

  {
    name: 'mcp__agentic_qe__test_optimize_sublinear',
    description: 'Optimize tests using sublinear algorithms (JL, temporal, redundancy)',
    inputSchema: {
      type: 'object',
      properties: {
        testSuite: {
          type: 'object',
          properties: {
            tests: {
              type: 'array',
              description: 'Array of tests to optimize'
            }
          },
          required: ['tests']
        },
        algorithm: {
          type: 'string',
          enum: ['johnson-lindenstrauss', 'temporal-advantage', 'redundancy-detection', 'sublinear'],
          description: 'Optimization algorithm'
        },
        targetReduction: {
          type: 'number',
          minimum: 0.1,
          maximum: 0.9,
          description: 'Target reduction ratio (0.3 = reduce to 30%)'
        },
        maintainCoverage: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum coverage to maintain (0-1)'
        },
        predictFailures: {
          type: 'boolean',
          default: false,
          description: 'Enable failure prediction'
        },
        metrics: {
          type: 'boolean',
          default: true,
          description: 'Calculate complexity metrics'
        },
        preserveCritical: {
          type: 'boolean',
          default: true,
          description: 'Preserve critical priority tests'
        }
      },
      required: ['testSuite', 'algorithm']
    }
  },

  
  // Category: core | Domain: testing


  {
    name: 'mcp__agentic_qe__test_report_comprehensive',
    description: 'Generate test reports in multiple formats (HTML, JSON, JUnit, MD, PDF)',
    inputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            passed: { type: 'number' },
            failed: { type: 'number' },
            skipped: { type: 'number' },
            duration: { type: 'number' },
            suites: { type: 'array' }
          },
          required: ['total', 'passed', 'failed']
        },
        format: {
          type: 'string',
          enum: ['html', 'json', 'junit', 'markdown', 'pdf'],
          description: 'Report output format'
        },
        includeCharts: {
          type: 'boolean',
          default: false,
          description: 'Include visual charts'
        },
        includeTrends: {
          type: 'boolean',
          default: false,
          description: 'Include trend analysis'
        },
        includeSummary: {
          type: 'boolean',
          default: true,
          description: 'Include summary section'
        },
        includeDetails: {
          type: 'boolean',
          default: false,
          description: 'Include detailed test information'
        },
        structured: {
          type: 'boolean',
          default: true,
          description: 'Use structured output (for JSON)'
        },
        historicalData: {
          type: 'array',
          description: 'Historical test data for trends'
        }
      },
      required: ['results', 'format']
    }
  },

  
  // Category: testing | Domain: coverage


  {
    name: 'mcp__agentic_qe__test_coverage_detailed',
    description: 'Coverage analysis with gap detection, prioritization, & suggestions',
    inputSchema: {
      type: 'object',
      properties: {
        coverageData: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  lines: { type: 'object' },
                  branches: { type: 'object' },
                  functions: { type: 'object' },
                  importance: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'critical']
                  }
                }
              }
            }
          },
          required: ['files']
        },
        analysisType: {
          type: 'string',
          enum: ['line', 'branch', 'function', 'comprehensive'],
          description: 'Type of coverage analysis'
        },
        detailLevel: {
          type: 'string',
          enum: ['basic', 'detailed', 'comprehensive'],
          default: 'detailed',
          description: 'Level of detail in analysis'
        },
        identifyGaps: {
          type: 'boolean',
          default: true,
          description: 'Identify coverage gaps'
        },
        prioritizeGaps: {
          type: 'boolean',
          default: true,
          description: 'Prioritize gaps by importance'
        },
        generateSuggestions: {
          type: 'boolean',
          default: true,
          description: 'Generate improvement suggestions'
        },
        comparePrevious: {
          type: 'boolean',
          default: false,
          description: 'Compare with previous coverage'
        },
        historicalData: {
          type: 'array',
          description: 'Historical coverage data'
        }
      },
      required: ['coverageData', 'analysisType']
    }
  },

  // Memory Management Tools
  // ═════════════════════════════════════════════════════════════════════════════
  //                           CORE TOOLS - MEMORY & STATE
  //                    Always loaded for agent coordination and memory
  // ═════════════════════════════════════════════════════════════════════════════

  
  // Category: core | Domain: memory

  
  
  {
    name: 'mcp__agentic_qe__memory_store',
    description: 'Store QE data with TTL & namespacing for coordination',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Memory key'
        },
        value: {
          description: 'Value to store (any type)'
        },
        namespace: {
          type: 'string',
          default: 'default',
          description: 'Memory namespace for isolation'
        },
        ttl: {
          type: 'number',
          description: 'Time to live in seconds (0 for persistent)'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata'
        },
        persist: {
          type: 'boolean',
          default: false,
          description: 'Persist to database'
        }
      },
      required: ['key', 'value']
    }
  },

  
  // Category: core | Domain: memory


  {
    name: 'mcp__agentic_qe__memory_retrieve',
    description: 'Retrieve QE data with optional metadata',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Memory key'
        },
        namespace: {
          type: 'string',
          default: 'default',
          description: 'Memory namespace'
        },
        includeMetadata: {
          type: 'boolean',
          default: false,
          description: 'Include metadata in response'
        },
        agentId: {
          type: 'string',
          description: 'Agent ID for access tracking'
        }
      },
      required: ['key']
    }
  },

  
  // Category: core | Domain: memory


  {
    name: 'mcp__agentic_qe__memory_query',
    description: 'Query memory with pattern matching & filtering',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Filter by namespace'
        },
        pattern: {
          type: 'string',
          description: 'Key pattern (supports wildcards)'
        },
        startTime: {
          type: 'number',
          description: 'Filter by start timestamp'
        },
        endTime: {
          type: 'number',
          description: 'Filter by end timestamp'
        },
        limit: {
          type: 'number',
          default: 100,
          minimum: 1,
          maximum: 1000,
          description: 'Maximum results'
        },
        offset: {
          type: 'number',
          default: 0,
          minimum: 0,
          description: 'Pagination offset'
        },
        includeExpired: {
          type: 'boolean',
          default: false,
          description: 'Include expired entries'
        }
      }
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__memory_share',
    description: 'Share memory between agents w/ access control',
    inputSchema: {
      type: 'object',
      properties: {
        sourceKey: {
          type: 'string',
          description: 'Source memory key'
        },
        sourceNamespace: {
          type: 'string',
          description: 'Source namespace'
        },
        targetAgents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target agent IDs'
        },
        targetNamespace: {
          type: 'string',
          default: 'shared',
          description: 'Target namespace'
        },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          default: ['read'],
          description: 'Access permissions'
        },
        ttl: {
          type: 'number',
          description: 'Time to live for shared memory'
        }
      },
      required: ['sourceKey', 'sourceNamespace', 'targetAgents']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__memory_backup',
    description: 'Backup & restore memory namespaces',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'restore', 'list', 'delete'],
          description: 'Backup operation'
        },
        namespace: {
          type: 'string',
          description: 'Namespace to backup/restore'
        },
        backupId: {
          type: 'string',
          description: 'Backup identifier'
        },
        targetNamespace: {
          type: 'string',
          description: 'Target namespace for restore'
        }
      },
      required: ['action']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__blackboard_post',
    description: 'Post coordination hints to blackboard',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Coordination topic'
        },
        message: {
          type: 'string',
          description: 'Hint message'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Hint priority'
        },
        agentId: {
          type: 'string',
          description: 'Source agent ID'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata'
        },
        ttl: {
          type: 'number',
          default: 0,
          description: 'Time to live in seconds'
        }
      },
      required: ['topic', 'message', 'priority', 'agentId']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__blackboard_read',
    description: 'Read coordination hints from blackboard',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Coordination topic'
        },
        agentId: {
          type: 'string',
          description: 'Reading agent ID'
        },
        minPriority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Minimum priority filter'
        },
        since: {
          type: 'number',
          description: 'Filter hints after timestamp'
        },
        limit: {
          type: 'number',
          default: 50,
          minimum: 1,
          maximum: 100,
          description: 'Maximum hints to return'
        }
      },
      required: ['topic', 'agentId']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__consensus_propose',
    description: 'Create consensus proposal for multi-agent decisions',
    inputSchema: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'string',
          description: 'Unique proposal identifier'
        },
        topic: {
          type: 'string',
          description: 'Proposal topic'
        },
        proposal: {
          description: 'Proposal content (any type)'
        },
        votingAgents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agents authorized to vote'
        },
        quorum: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Quorum threshold (0-1)'
        },
        timeout: {
          type: 'number',
          default: 300,
          description: 'Voting timeout in seconds'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata'
        }
      },
      required: ['proposalId', 'topic', 'proposal', 'votingAgents', 'quorum']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__consensus_vote',
    description: 'Vote on consensus proposal with quorum check',
    inputSchema: {
      type: 'object',
      properties: {
        proposalId: {
          type: 'string',
          description: 'Proposal identifier'
        },
        agentId: {
          type: 'string',
          description: 'Voting agent ID'
        },
        vote: {
          type: 'string',
          enum: ['approve', 'reject', 'abstain'],
          description: 'Vote decision'
        },
        rationale: {
          type: 'string',
          description: 'Vote rationale'
        },
        checkConsensus: {
          type: 'boolean',
          default: true,
          description: 'Check if consensus reached'
        }
      },
      required: ['proposalId', 'agentId', 'vote']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__artifact_manifest',
    description: 'Manage artifact manifests for QE outputs',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'list', 'update', 'delete'],
          description: 'Manifest operation'
        },
        manifestId: {
          type: 'string',
          description: 'Manifest identifier'
        },
        artifacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              path: { type: 'string' },
              metadata: { type: 'object' }
            },
            required: ['type', 'path']
          },
          description: 'Artifact list'
        },
        updates: {
          type: 'object',
          description: 'Manifest updates'
        },
        filterBy: {
          type: 'object',
          description: 'Filter criteria for list'
        }
      },
      required: ['action']
    }
  },

  // Coordination Tools (Phase 1)
  // ═════════════════════════════════════════════════════════════════════════════
  //                           CORE TOOLS - COORDINATION
  //                    Workflow, blackboard, consensus, and event coordination
  // ═════════════════════════════════════════════════════════════════════════════

  
  // Category: core | Domain: coordination

  
  
  {
    name: 'mcp__agentic_qe__workflow_create',
    description: 'Create QE workflow with checkpoints & dependency mgmt',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Workflow name'
        },
        description: {
          type: 'string',
          description: 'Workflow description'
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string' },
              dependencies: { type: 'array', items: { type: 'string' } },
              timeout: { type: 'number' },
              config: { type: 'object' }
            },
            required: ['id', 'name', 'type', 'dependencies']
          },
          description: 'Workflow steps with dependencies'
        },
        checkpoints: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            frequency: {
              type: 'string',
              enum: ['manual', 'after-each-step', 'on-failure', 'timed']
            },
            interval: { type: 'number' }
          }
        }
      },
      required: ['name', 'steps']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__workflow_execute',
    description: 'Execute workflow with OODA loop',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Workflow ID to execute'
        },
        context: {
          type: 'object',
          properties: {
            environment: { type: 'string' },
            dryRun: { type: 'boolean' },
            variables: { type: 'object' }
          }
        },
        oodaEnabled: {
          type: 'boolean',
          default: true,
          description: 'Enable OODA loop coordination'
        },
        autoCheckpoint: {
          type: 'boolean',
          default: true,
          description: 'Automatically create checkpoints'
        }
      },
      required: ['workflowId']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__workflow_checkpoint',
    description: 'Save workflow state to checkpoint',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'Execution ID to checkpoint'
        },
        reason: {
          type: 'string',
          description: 'Reason for checkpoint'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata'
        }
      },
      required: ['executionId']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__workflow_resume',
    description: 'Resume workflow from checkpoint',
    inputSchema: {
      type: 'object',
      properties: {
        checkpointId: {
          type: 'string',
          description: 'Checkpoint ID to resume from'
        },
        context: {
          type: 'object',
          properties: {
            skipFailedSteps: { type: 'boolean' },
            overrideVariables: { type: 'object' }
          }
        }
      },
      required: ['checkpointId']
    }
  },

  
  // Category: core | Domain: orchestration


  {
    name: 'mcp__agentic_qe__task_status',
    description: 'Check task status & progress',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'Task or orchestration ID'
        },
        includeDetails: {
          type: 'boolean',
          default: false,
          description: 'Include detailed information'
        },
        includeTimeline: {
          type: 'boolean',
          default: false,
          description: 'Include timeline events'
        }
      },
      required: ['taskId']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__event_emit',
    description: 'Emit coordination event to event bus',
    inputSchema: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          description: 'Event name (e.g., test:started, agent:ready)'
        },
        data: {
          type: 'object',
          description: 'Event data payload'
        },
        metadata: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical']
            }
          }
        }
      },
      required: ['event', 'data']
    }
  },

  
  // Category: core | Domain: coordination


  {
    name: 'mcp__agentic_qe__event_subscribe',
    description: 'Subscribe to coordination event stream',
    inputSchema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: { type: 'string' },
          description: 'Event patterns to subscribe to (supports wildcards like agent:*)'
        },
        filter: {
          type: 'object',
          description: 'Filter criteria for events'
        },
        action: {
          type: 'string',
          enum: ['subscribe', 'unsubscribe'],
          description: 'Action to perform'
        },
        subscriptionId: {
          type: 'string',
          description: 'Subscription ID (for unsubscribe)'
        }
      }
    }
  },

  // Quality Gate Tools - REMOVED in Issue #115
  // NOTE: Legacy quality_gate_execute, quality_validate_metrics, quality_risk_assess,
  // quality_decision_make, quality_policy_check removed
  // Use qe_qualitygate_evaluate, qe_qualitygate_validate_metrics, qe_qualitygate_assess_risk instead

  // Prediction & Analysis Tools
  // DEPRECATED: Use flaky_detect_statistical with method='basic' instead
  // Kept for backward compatibility only - will be removed in v3.0.0
  // {
  //   name: 'mcp__agentic_qe__flaky_test_detect',
  //   description: '[DEPRECATED] Use flaky_detect_statistical instead. Detect flaky tests using pattern recognition',
  //   inputSchema: {
  //     type: 'object',
  //     properties: {
  //       testData: {
  //         type: 'object',
  //         properties: {
  //           testResults: { type: 'array', items: { type: 'object' } },
  //           minRuns: { type: 'number', default: 5 },
  //           timeWindow: { type: 'number', default: 30 }
  //         },
  //         required: ['testResults']
  //       },
  //       analysisConfig: { type: 'object' },
  //       reportConfig: { type: 'object' }
  //     },
  //     required: ['testData']
  //   }
  // },

  
  // Category: advanced | Domain: ai


  {
    name: 'mcp__agentic_qe__predict_defects_ai',
    description: 'Predict defects using AI/ML models',
    inputSchema: {
      type: 'object',
      properties: {
        codeChanges: { type: 'object' },
        modelConfig: { type: 'object' },
        historicalData: { type: 'array' }
      },
      required: ['codeChanges']
    }
  },

  
  // Category: advanced | Domain: regression
  // NOTE: Legacy regression_risk_analyze removed in Issue #115
  // Use qe_regression_analyze_risk instead (Phase 3 domain tools)

  // Category: testing | Domain: visual


  {
    name: 'mcp__agentic_qe__visual_test_regression',
    description: 'Detect visual regression in UI tests',
    inputSchema: {
      type: 'object',
      properties: {
        baselineImages: { type: 'array', items: { type: 'string' } },
        currentImages: { type: 'array', items: { type: 'string' } },
        threshold: { type: 'number', default: 0.05 }
      },
      required: ['baselineImages', 'currentImages']
    }
  },

  
  // Category: quality | Domain: deployment


  {
    name: 'mcp__agentic_qe__deployment_readiness_check',
    description: 'Check deployment readiness with comprehensive check',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        environment: { type: 'string' },
        checks: { type: 'array', items: { type: 'string' } }
      },
      required: ['projectId', 'environment']
    }
  },

  // Analysis Tools
  
  // Category: analysis | Domain: coverage

  {
    name: 'mcp__agentic_qe__coverage_analyze_sublinear',
    description: 'Analyze coverage with O(log n) algorithms',
    inputSchema: {
      type: 'object',
      properties: {
        sourceFiles: { type: 'array', items: { type: 'string' } },
        coverageThreshold: { type: 'number', default: 0.8 },
        useJohnsonLindenstrauss: { type: 'boolean', default: true },
        targetDimension: { type: 'number' },
        includeUncoveredLines: { type: 'boolean', default: true }
      },
      required: ['sourceFiles']
    }
  },

  
  // Category: analysis | Domain: coverage


  {
    name: 'mcp__agentic_qe__coverage_gaps_detect',
    description: 'Detect & prioritize coverage gaps',
    inputSchema: {
      type: 'object',
      properties: {
        coverageData: { type: 'object' },
        prioritization: {
          type: 'string',
          enum: ['complexity', 'criticality', 'change-frequency'],
          default: 'complexity'
        }
      },
      required: ['coverageData']
    }
  },

  
  // Category: analysis | Domain: performance
  // NOTE: Legacy performance_benchmark_run removed in Issue #115
  // Use performance_run_benchmark instead (Phase 3 domain tools)

  {
    name: 'mcp__agentic_qe__performance_monitor_realtime',
    description: 'Monitor performance metrics in real-time',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        duration: { type: 'number', default: 60 },
        interval: { type: 'number', default: 5 }
      },
      required: ['target']
    }
  },

  // DEPRECATED: Legacy security_scan_comprehensive - Use qe_security_scan_comprehensive instead (line ~3284)
  // This tool has been replaced with the modern qe_security_* version that includes:
  // - Enhanced SAST/DAST/dependency scanning
  // - OWASP compliance checking
  // - Customizable security rules
  // - Better exclude pattern support
  /*
  {
    name: 'mcp__agentic_qe__security_scan_comprehensive',
    description: 'Comprehensive security scanning',
    inputSchema: {
      type: 'object',
      properties: {
        scanType: {
          type: 'string',
          enum: ['sast', 'dast', 'dependency', 'comprehensive'],
          default: 'comprehensive'
        },
        target: { type: 'string' },
        depth: { type: 'string', enum: ['basic', 'standard', 'deep'], default: 'standard' }
      },
      required: ['target']
    }
  },
  */

  // Advanced MCP Tools - Production Intelligence
  // NOTE: Legacy requirements_validate and requirements_generate_bdd removed in Issue #115
  // Use qe_requirements_validate and qe_requirements_generate_bdd instead

  // Category: advanced | Domain: production


  {
    name: 'mcp__agentic_qe__production_incident_replay',
    description: 'Replay production incidents as tests',
    inputSchema: {
      type: 'object',
      properties: {
        incident: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            timestamp: { type: 'string' },
            type: { type: 'string', enum: ['error', 'performance', 'security', 'availability'] },
            message: { type: 'string' },
            stackTrace: { type: 'string' },
            context: { type: 'object' },
            metrics: { type: 'object' },
            sourceCode: { type: 'string' }
          },
          required: ['id', 'timestamp', 'type', 'message']
        },
        analyzeRootCause: { type: 'boolean', default: false },
        generateRegressionTests: { type: 'boolean', default: false },
        linkSimilarIncidents: { type: 'boolean', default: false }
      },
      required: ['incident']
    }
  },

  
  // Category: advanced | Domain: production


  {
    name: 'mcp__agentic_qe__production_rum_analyze',
    description: 'Analyze Real User Monitoring (RUM) data',
    inputSchema: {
      type: 'object',
      properties: {
        rumData: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            userActions: { type: 'array' },
            metrics: { type: 'object' }
          },
          required: ['sessionId', 'userActions']
        },
        detectBottlenecks: { type: 'boolean', default: false },
        generateTests: { type: 'boolean', default: false },
        analyzeBehavior: { type: 'boolean', default: false }
      },
      required: ['rumData']
    }
  },

  
  // Category: advanced | Domain: api


  {
    name: 'mcp__agentic_qe__api_breaking_changes',
    description: 'Detect API breaking changes with AST analysis',
    inputSchema: {
      type: 'object',
      properties: {
        oldAPI: { type: 'string', description: 'Old API source code' },
        newAPI: { type: 'string', description: 'New API source code' },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'java'],
          default: 'typescript'
        },
        calculateSemver: { type: 'boolean', default: false },
        generateMigrationGuide: { type: 'boolean', default: false }
      },
      required: ['oldAPI', 'newAPI']
    }
  },
  // ═════════════════════════════════════════════════════════════════════════════
  //                           ADVANCED/SPECIALIZED TOOLS
  //                    Mutation, API contracts, production, testgen, learning
  // ═════════════════════════════════════════════════════════════════════════════


  
  // Category: advanced | Domain: mutation


  
  

  {
    name: 'mcp__agentic_qe__mutation_test_execute',
    description: 'Execute mutation testing with real mutations',
    inputSchema: {
      type: 'object',
      properties: {
        sourceCode: { type: 'string', description: 'Source code to mutate' },
        testCode: { type: 'string', description: 'Test code' },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python'],
          default: 'javascript'
        },
        operators: {
          type: 'array',
          items: { type: 'string' },
          default: ['arithmetic', 'logical', 'relational']
        },
        timeout: { type: 'number', default: 5000 },
        calculateCoverage: { type: 'boolean', default: false },
        generateSuggestions: { type: 'boolean', default: false }
      },
      required: ['sourceCode', 'testCode']
    }
  },

  // Streaming Tools (v1.0.5)
  
  // Category: testing | Domain: execution

  {
    name: 'mcp__agentic_qe__test_execute_stream',
    description: 'Execute tests with real-time streaming (recommended for tests >30s)',
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
        },
        enableRealtimeUpdates: {
          type: 'boolean',
          default: true,
          description: 'Enable real-time progress streaming'
        }
      },
      required: ['spec']
    }
  },

  
  // Category: analysis | Domain: coverage


  {
    name: 'mcp__agentic_qe__coverage_analyze_stream',
    description: 'Analyze coverage with real-time streaming for large codebases',
    inputSchema: {
      type: 'object',
      properties: {
        sourceFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Source files to analyze'
        },
        coverageThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.8,
          description: 'Coverage threshold (0-1)'
        },
        useJohnsonLindenstrauss: {
          type: 'boolean',
          default: true,
          description: 'Apply O(log n) dimension reduction for faster analysis'
        },
        targetDimension: {
          type: 'number',
          minimum: 2,
          description: 'Target dimension for JL reduction (defaults to log(n))'
        },
        includeUncoveredLines: {
          type: 'boolean',
          default: true,
          description: 'Include specific uncovered line numbers'
        },
        analysisDepth: {
          type: 'string',
          enum: ['basic', 'detailed', 'comprehensive'],
          default: 'detailed',
          description: 'Depth of coverage analysis'
        }
      },
      required: ['sourceFiles']
    }
  },

  // Phase 3: Domain-Specific Tools

  // Coverage Domain Tools (4 tools)
  
  // Category: analysis | Domain: coverage

  {
    name: 'mcp__agentic_qe__coverage_analyze_with_risk_scoring',
    description: 'Analyze coverage with ML risk scoring for critical paths',
    inputSchema: {
      type: 'object',
      properties: {
        coverageData: {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'object' } },
            lines: { type: 'object' },
            branches: { type: 'object' },
            functions: { type: 'object' }
          },
          required: ['files']
        },
        riskFactors: {
          type: 'object',
          properties: {
            complexity: { type: 'boolean', default: true },
            changeFrequency: { type: 'boolean', default: true },
            criticalPaths: { type: 'boolean', default: true },
            historicalDefects: { type: 'boolean', default: false }
          }
        },
        threshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.8,
          description: 'Coverage threshold (0-1)'
        }
      },
      required: ['coverageData']
    }
  },

  
  // Category: analysis | Domain: coverage


  {
    name: 'mcp__agentic_qe__coverage_detect_gaps_ml',
    description: 'Detect coverage gaps using ML recognition & prioritization',
    inputSchema: {
      type: 'object',
      properties: {
        coverageData: { type: 'object', description: 'Coverage data' },
        sourceCode: { type: 'array', items: { type: 'string' }, description: 'Source files' },
        mlModel: {
          type: 'string',
          enum: ['neural', 'random-forest', 'gradient-boosting'],
          default: 'gradient-boosting',
          description: 'ML model for gap detection'
        },
        priorityScoring: {
          type: 'object',
          properties: {
            complexity: { type: 'number', default: 0.4 },
            criticality: { type: 'number', default: 0.3 },
            changeFrequency: { type: 'number', default: 0.3 }
          }
        }
      },
      required: ['coverageData', 'sourceCode']
    }
  },

  
  // Category: analysis | Domain: coverage


  {
    name: 'mcp__agentic_qe__coverage_recommend_tests',
    description: 'Recommend tests to improve coverage from gap analysis',
    inputSchema: {
      type: 'object',
      properties: {
        gaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              lines: { type: 'array' },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
            }
          },
          description: 'Coverage gaps'
        },
        testFramework: {
          type: 'string',
          enum: ['jest', 'mocha', 'jasmine', 'vitest'],
          default: 'jest'
        },
        generateCode: {
          type: 'boolean',
          default: true,
          description: 'Generate test code snippets'
        },
        includeDataGenerators: {
          type: 'boolean',
          default: false
        }
      },
      required: ['gaps']
    }
  },

  
  // Category: analysis | Domain: coverage


  {
    name: 'mcp__agentic_qe__coverage_calculate_trends',
    description: 'Calculate coverage trends over time with forecasting',
    inputSchema: {
      type: 'object',
      properties: {
        historicalData: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              coverage: { type: 'number' },
              lines: { type: 'number' },
              branches: { type: 'number' },
              functions: { type: 'number' }
            }
          },
          description: 'Historical coverage data'
        },
        forecastDays: {
          type: 'number',
          default: 30,
          minimum: 7,
          maximum: 180,
          description: 'Days to forecast'
        },
        includeRegression: {
          type: 'boolean',
          default: true
        },
        anomalyDetection: {
          type: 'boolean',
          default: false
        }
      },
      required: ['historicalData']
    }
  },

  // Flaky Detection Tools (3 tools)
  
  // Category: testing | Domain: flaky

  {
    name: 'mcp__agentic_qe__flaky_detect_statistical',
    description: 'Detect flaky tests using statistical analysis (χ², variance)',
    inputSchema: {
      type: 'object',
      properties: {
        testResults: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              testId: { type: 'string' },
              testName: { type: 'string' },
              status: { type: 'string', enum: ['pass', 'fail', 'skip', 'timeout'] },
              duration: { type: 'number' },
              timestamp: { type: 'string' }
            }
          },
          description: 'Test execution results'
        },
        minRuns: {
          type: 'number',
          default: 10,
          minimum: 5,
          description: 'Minimum runs to analyze'
        },
        confidenceLevel: {
          type: 'number',
          default: 0.95,
          minimum: 0.9,
          maximum: 0.99
        },
        methods: {
          type: 'array',
          items: { type: 'string' },
          default: ['chi-square', 'variance', 'entropy'],
          description: 'Statistical methods to apply'
        }
      },
      required: ['testResults']
    }
  },

  
  // Category: testing | Domain: flaky


  {
    name: 'mcp__agentic_qe__flaky_analyze_patterns',
    description: 'Analyze flaky test patterns (timing, environment, dependencies)',
    inputSchema: {
      type: 'object',
      properties: {
        flakyTests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              testId: { type: 'string' },
              testName: { type: 'string' },
              failures: { type: 'array' },
              environment: { type: 'object' }
            }
          }
        },
        analyzeTiming: { type: 'boolean', default: true },
        analyzeEnvironment: { type: 'boolean', default: true },
        analyzeDependencies: { type: 'boolean', default: true },
        clusterSimilar: { type: 'boolean', default: false }
      },
      required: ['flakyTests']
    }
  },

  
  // Category: testing | Domain: flaky


  {
    name: 'mcp__agentic_qe__flaky_stabilize_auto',
    description: 'Auto-stabilize flaky tests with retry, waits, & isolation',
    inputSchema: {
      type: 'object',
      properties: {
        testCode: {
          type: 'string',
          description: 'Test source code'
        },
        flakyPattern: {
          type: 'string',
          enum: ['timing', 'async', 'race-condition', 'external-dependency'],
          description: 'Type of flakiness pattern'
        },
        stabilizationStrategy: {
          type: 'string',
          enum: ['retry', 'wait', 'isolation', 'mock', 'hybrid'],
          default: 'hybrid'
        },
        framework: {
          type: 'string',
          enum: ['jest', 'mocha', 'jasmine', 'cypress', 'playwright'],
          default: 'jest'
        },
        dryRun: {
          type: 'boolean',
          default: false,
          description: 'Preview changes without applying'
        }
      },
      required: ['testCode', 'flakyPattern']
    }
  },

  // Performance Tools (4 tools)
  // ═════════════════════════════════════════════════════════════════════════════
  //                           ANALYSIS DOMAIN TOOLS
  //                    Performance and coverage analysis with ML/AI
  // ═════════════════════════════════════════════════════════════════════════════

  
  // Category: analysis | Domain: performance

  
  
  {
    name: 'mcp__agentic_qe__performance_analyze_bottlenecks',
    description: 'Analyze performance bottlenecks using profiling & ML',
    inputSchema: {
      type: 'object',
      properties: {
        profileData: {
          type: 'object',
          properties: {
            functions: { type: 'array' },
            callGraph: { type: 'object' },
            timings: { type: 'object' },
            memory: { type: 'object' }
          }
        },
        threshold: {
          type: 'number',
          default: 100,
          description: 'Bottleneck threshold in ms'
        },
        analyzeMemory: { type: 'boolean', default: true },
        analyzeCPU: { type: 'boolean', default: true },
        analyzeIO: { type: 'boolean', default: false },
        generateRecommendations: { type: 'boolean', default: true }
      },
      required: ['profileData']
    }
  },

  
  // Category: analysis | Domain: performance


  {
    name: 'mcp__agentic_qe__performance_generate_report',
    description: 'Generate comprehensive performance reports',
    inputSchema: {
      type: 'object',
      properties: {
        benchmarkResults: { type: 'object', description: 'Benchmark data' },
        bottlenecks: { type: 'array', description: 'Identified bottlenecks' },
        format: {
          type: 'string',
          enum: ['html', 'pdf', 'json', 'markdown'],
          default: 'html'
        },
        includeCharts: { type: 'boolean', default: true },
        includeRecommendations: { type: 'boolean', default: true },
        compareBaseline: {
          type: 'object',
          description: 'Baseline performance data for comparison'
        }
      },
      required: ['benchmarkResults']
    }
  },

  
  // Category: analysis | Domain: performance


  {
    name: 'mcp__agentic_qe__performance_run_benchmark',
    description: 'Run performance benchmarks with configurable scenarios',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target function or endpoint to benchmark'
        },
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              load: { type: 'number' },
              duration: { type: 'number' },
              rampUp: { type: 'number' }
            }
          }
        },
        iterations: { type: 'number', default: 100, minimum: 10 },
        warmupIterations: { type: 'number', default: 10 },
        collectMetrics: {
          type: 'array',
          items: { type: 'string' },
          default: ['duration', 'memory', 'cpu']
        }
      },
      required: ['target']
    }
  },

  // Security Tools (2 tools - 3 deprecated, use qe_security_* instead)

  // Category: security | Domain: reporting
  // NOTE: Legacy security_validate_auth, security_check_authz, security_scan_dependencies
  // removed in Issue #115 - use qe_security_detect_vulnerabilities instead


  {
    name: 'mcp__agentic_qe__security_generate_report',
    description: 'Generate comprehensive security audit reports',
    inputSchema: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              severity: { type: 'string' },
              description: { type: 'string' },
              remediation: { type: 'string' }
            }
          },
          description: 'Security findings'
        },
        format: {
          type: 'string',
          enum: ['pdf', 'html', 'json', 'sarif'],
          default: 'html'
        },
        includeOWASP: {
          type: 'boolean',
          default: true,
          description: 'Include OWASP Top 10 mapping'
        },
        includeCVSS: {
          type: 'boolean',
          default: true,
          description: 'Include CVSS scores'
        },
        includeRemediation: { type: 'boolean', default: true }
      },
      required: ['findings']
    }
  },

  // Visual Testing Tools (3 tools)
  
  // Category: testing | Domain: visual

  {
    name: 'mcp__agentic_qe__visual_compare_screenshots',
    description: 'Compare screenshots with AI-powered diff analysis',
    inputSchema: {
      type: 'object',
      properties: {
        baselineImage: {
          type: 'string',
          description: 'Path or URL to baseline image'
        },
        currentImage: {
          type: 'string',
          description: 'Path or URL to current image'
        },
        threshold: {
          type: 'number',
          default: 0.01,
          minimum: 0,
          maximum: 1,
          description: 'Acceptable difference threshold (0-1)'
        },
        ignoreRegions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' }
            }
          },
          description: 'Regions to ignore (e.g., timestamps, ads)'
        },
        algorithm: {
          type: 'string',
          enum: ['pixel-diff', 'structural-similarity', 'ai-semantic'],
          default: 'structural-similarity'
        }
      },
      required: ['baselineImage', 'currentImage']
    }
  },

  
  // Category: testing | Domain: visual


  {
    name: 'mcp__agentic_qe__visual_validate_accessibility',
    description: 'Validate visual accessibility (contrast, text size, WCAG)',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'URL or screenshot path'
        },
        wcagLevel: {
          type: 'string',
          enum: ['A', 'AA', 'AAA'],
          default: 'AA',
          description: 'WCAG compliance level'
        },
        checks: {
          type: 'array',
          items: { type: 'string' },
          default: ['color-contrast', 'text-size', 'touch-targets', 'focus-indicators'],
          description: 'Accessibility checks to perform'
        },
        generateReport: { type: 'boolean', default: true },
        includeRemediation: { type: 'boolean', default: true }
      },
      required: ['target']
    }
  },


  // Category: testing | Domain: accessibility


  {
    name: 'mcp__agentic_qe__a11y_scan_comprehensive',
    description: 'Comprehensive WCAG 2.2 accessibility scan with context-aware remediation',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to scan for accessibility violations'
        },
        level: {
          type: 'string',
          enum: ['A', 'AA', 'AAA'],
          default: 'AA',
          description: 'WCAG compliance level to validate against'
        },
        options: {
          type: 'object',
          properties: {
            includeScreenshots: {
              type: 'boolean',
              default: false,
              description: 'Include annotated screenshots of violations'
            },
            keyboard: {
              type: 'boolean',
              default: true,
              description: 'Test keyboard navigation'
            },
            screenReader: {
              type: 'boolean',
              default: true,
              description: 'Test screen reader compatibility'
            },
            colorContrast: {
              type: 'boolean',
              default: true,
              description: 'Test color contrast ratios'
            },
            includeContext: {
              type: 'boolean',
              default: true,
              description: 'Enable context-aware remediation recommendations'
            },
            generateHTMLReport: {
              type: 'boolean',
              default: false,
              description: 'Generate comprehensive HTML report with findings and recommendations'
            },
            reportPath: {
              type: 'string',
              description: 'Custom path for HTML report (defaults to docs/reports/)'
            }
          }
        }
      },
      required: ['url']
    }
  },


  // Category: testing | Domain: visual


  {
    name: 'mcp__agentic_qe__visual_detect_regression',
    description: 'Detect visual regressions across components or pages',
    inputSchema: {
      type: 'object',
      properties: {
        baseline: {
          type: 'object',
          properties: {
            directory: { type: 'string' },
            branch: { type: 'string' },
            commit: { type: 'string' }
          },
          description: 'Baseline configuration'
        },
        current: {
          type: 'object',
          properties: {
            directory: { type: 'string' },
            branch: { type: 'string' },
            commit: { type: 'string' }
          },
          description: 'Current configuration'
        },
        components: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific components to check'
        },
        threshold: {
          type: 'number',
          default: 0.05,
          description: 'Regression threshold (0-1)'
        },
        parallelComparisons: {
          type: 'number',
          default: 4,
          minimum: 1,
          maximum: 16
        }
      },
      required: ['baseline', 'current']
    }
  },

  // ==================== Phase 3: New Domain Tools ====================

  // API Contract Domain Tools (3 tools)
  
  // Category: advanced | Domain: api

  {
    name: 'mcp__agentic_qe__qe_api_contract_validate',
    description: 'Validate API contract (Pact/OpenAPI/GraphQL) with schema & endpoint check',
    inputSchema: {
      type: 'object',
      properties: {
        contract: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['pact', 'openapi', 'graphql'],
              description: 'Contract specification type'
            },
            version: {
              type: 'string',
              description: 'Contract version'
            },
            provider: {
              type: 'string',
              description: 'Provider service name'
            },
            consumer: {
              type: 'string',
              description: 'Consumer service name (for Pact)'
            },
            specification: {
              type: 'object',
              description: 'Contract specification object (OpenAPI/Pact JSON)'
            },
            timestamp: {
              type: 'string',
              description: 'Contract creation timestamp'
            }
          },
          required: ['type', 'version', 'provider', 'specification', 'timestamp']
        },
        strictMode: {
          type: 'boolean',
          default: false,
          description: 'Enable strict validation mode'
        },
        validateSchemas: {
          type: 'boolean',
          default: true,
          description: 'Validate data schemas'
        },
        validateEndpoints: {
          type: 'boolean',
          default: true,
          description: 'Validate endpoint definitions'
        }
      },
      required: ['contract']
    }
  },

  
  // Category: advanced | Domain: api


  {
    name: 'mcp__agentic_qe__qe_api_contract_breaking_changes',
    description: 'Detect breaking changes in API contracts with semver recommendations',
    inputSchema: {
      type: 'object',
      properties: {
        currentContract: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['pact', 'openapi', 'graphql']
            },
            version: { type: 'string' },
            provider: { type: 'string' },
            specification: { type: 'object' },
            timestamp: { type: 'string' }
          },
          required: ['type', 'version', 'provider', 'specification', 'timestamp'],
          description: 'Current API contract version'
        },
        previousContract: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['pact', 'openapi', 'graphql']
            },
            version: { type: 'string' },
            provider: { type: 'string' },
            specification: { type: 'object' },
            timestamp: { type: 'string' }
          },
          required: ['type', 'version', 'provider', 'specification', 'timestamp'],
          description: 'Previous API contract version'
        },
        calculateSemver: {
          type: 'boolean',
          default: true,
          description: 'Calculate semantic version recommendation'
        },
        generateMigrationGuide: {
          type: 'boolean',
          default: false,
          description: 'Generate migration guide for breaking changes'
        },
        analyzeConsumerImpact: {
          type: 'boolean',
          default: false,
          description: 'Analyze impact on consumers'
        }
      },
      required: ['currentContract', 'previousContract']
    }
  },

  
  // Category: advanced | Domain: api


  {
    name: 'mcp__agentic_qe__qe_api_contract_versioning',
    description: 'Validate API versioning compatibility with consumer version support',
    inputSchema: {
      type: 'object',
      properties: {
        providerName: {
          type: 'string',
          description: 'Provider service name'
        },
        currentVersion: {
          type: 'string',
          description: 'Current provider version (e.g., "2.1.0")'
        },
        consumerVersions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of consumer versions to validate'
        },
        historicalVersions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Historical provider versions'
        },
        compatibilityRules: {
          type: 'object',
          description: 'Custom compatibility rules by version'
        }
      },
      required: ['providerName', 'currentVersion']
    }
  },

  // Test Data Domain Tools (3 tools)
  
  // Category: advanced | Domain: testdata

  {
    name: 'mcp__agentic_qe__qe_test_data_generate',
    description: 'High-speed realistic test data generation (10k+ records/sec) with referential integrity',
    inputSchema: {
      type: 'object',
      properties: {
        schema: {
          type: 'object',
          description: 'Database schema (single table or multi-table with relationships)'
        },
        recordCount: {
          type: 'number',
          minimum: 1,
          description: 'Number of records to generate'
        },
        includeEdgeCases: {
          type: 'boolean',
          default: false,
          description: 'Include edge case data (nulls, min/max values)'
        },
        batchSize: {
          type: 'number',
          default: 1000,
          description: 'Batch size for generation'
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducibility'
        },
        format: {
          type: 'string',
          enum: ['json', 'sql', 'csv'],
          default: 'json',
          description: 'Output format'
        },
        preserveIntegrity: {
          type: 'boolean',
          default: true,
          description: 'Preserve referential integrity for foreign keys'
        },
        targetRate: {
          type: 'number',
          description: 'Target generation rate (records/sec)'
        }
      },
      required: ['schema', 'recordCount']
    }
  },

  
  // Category: advanced | Domain: testdata


  {
    name: 'mcp__agentic_qe__qe_test_data_mask',
    description: 'GDPR-compliant data masking with multiple anonymization strategies',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Records to mask'
        },
        sensitiveFields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              classification: {
                type: 'string',
                enum: ['public', 'internal', 'confidential', 'restricted', 'pii', 'sensitive']
              },
              type: { type: 'string' },
              strategy: {
                type: 'string',
                enum: ['mask', 'hash', 'tokenize', 'generalize', 'substitute', 'redact']
              },
              caseSensitive: { type: 'boolean' },
              preserveFormat: { type: 'boolean' }
            },
            required: ['name', 'classification', 'type', 'strategy']
          },
          description: 'Sensitive field definitions'
        },
        defaultStrategy: {
          type: 'string',
          enum: ['mask', 'hash', 'tokenize', 'generalize', 'substitute', 'redact'],
          default: 'mask',
          description: 'Default anonymization strategy'
        },
        gdprCompliant: {
          type: 'boolean',
          default: true,
          description: 'Enable GDPR compliance validation'
        },
        auditLog: {
          type: 'boolean',
          default: false,
          description: 'Enable audit logging'
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducibility'
        },
        salt: {
          type: 'string',
          description: 'Salt for hashing operations'
        },
        kAnonymity: {
          type: 'number',
          minimum: 1,
          description: 'K-anonymity minimum group size'
        },
        preserveIntegrity: {
          type: 'boolean',
          default: false,
          description: 'Preserve referential integrity for foreign keys'
        }
      },
      required: ['data', 'sensitiveFields']
    }
  },

  
  // Category: advanced | Domain: testdata


  {
    name: 'mcp__agentic_qe__qe_test_data_analyze_schema',
    description: 'Comprehensive DB schema analysis with optimization recommendations',
    inputSchema: {
      type: 'object',
      properties: {
        schema: {
          type: 'object',
          description: 'Database schema to analyze'
        },
        databaseType: {
          type: 'string',
          enum: ['postgresql', 'mysql', 'sqlite', 'mongodb', 'generic'],
          default: 'generic',
          description: 'Database type'
        },
        analyzeConstraints: {
          type: 'boolean',
          default: true,
          description: 'Analyze constraints and validation rules'
        },
        analyzeRelationships: {
          type: 'boolean',
          default: true,
          description: 'Analyze table relationships'
        },
        analyzeIndexes: {
          type: 'boolean',
          default: true,
          description: 'Analyze index usage and recommendations'
        },
        analyzeDataQuality: {
          type: 'boolean',
          default: true,
          description: 'Analyze data quality issues'
        },
        includeRecommendations: {
          type: 'boolean',
          default: true,
          description: 'Include optimization recommendations'
        }
      },
      required: ['schema']
    }
  },

  // Regression Domain Tools (2 tools)
  
  // Category: advanced | Domain: regression

  {
    name: 'mcp__agentic_qe__qe_regression_analyze_risk',
    description: 'ML-based regression risk analysis with 95%+ accuracy and blast radius assessment',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              changeType: {
                type: 'string',
                enum: ['added', 'modified', 'deleted', 'renamed']
              },
              linesAdded: { type: 'number' },
              linesDeleted: { type: 'number' },
              complexity: { type: 'number' }
            },
            required: ['filePath', 'changeType']
          },
          description: 'Code changes to analyze'
        },
        historicalData: {
          type: 'object',
          description: 'Historical failure patterns and metrics'
        },
        coverageData: {
          type: 'object',
          description: 'Code coverage information'
        },
        dependencies: {
          type: 'object',
          description: 'Dependency graph for blast radius analysis'
        },
        businessCritical: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to business-critical components'
        },
        includeMLPrediction: {
          type: 'boolean',
          default: true,
          description: 'Include ML-based risk prediction'
        },
        includeBlastRadius: {
          type: 'boolean',
          default: true,
          description: 'Calculate blast radius'
        }
      },
      required: ['changes']
    }
  },

  
  // Category: advanced | Domain: regression


  {
    name: 'mcp__agentic_qe__qe_regression_select_tests',
    description: 'Smart test selection with 70% time reduction using ML & coverage',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              changeType: {
                type: 'string',
                enum: ['added', 'modified', 'deleted', 'renamed']
              },
              linesAdded: { type: 'number' },
              linesDeleted: { type: 'number' }
            },
            required: ['filePath', 'changeType']
          },
          description: 'Code changes to base selection on'
        },
        availableTests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              type: {
                type: 'string',
                enum: ['unit', 'integration', 'e2e', 'performance']
              },
              estimatedTime: { type: 'number' },
              coveredPaths: {
                type: 'array',
                items: { type: 'string' }
              },
              historicalFailureRate: { type: 'number' }
            },
            required: ['path', 'type']
          },
          description: 'Available tests to select from'
        },
        coverageData: {
          type: 'object',
          description: 'Code coverage mapping'
        },
        selectionStrategy: {
          type: 'string',
          enum: ['aggressive', 'balanced', 'conservative'],
          default: 'balanced',
          description: 'Test selection strategy'
        },
        targetReduction: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.7,
          description: 'Target reduction rate (0-1)'
        },
        minConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.95,
          description: 'Minimum confidence for selection (0-1)'
        },
        includeMLPrediction: {
          type: 'boolean',
          default: true,
          description: 'Include ML-predicted tests'
        }
      },
      required: ['changes', 'availableTests']
    }
  },

  // Requirements Domain Tools (2 tools)
  
  // Category: quality | Domain: requirements

  {
    name: 'mcp__agentic_qe__qe_requirements_validate',
    description: 'INVEST validation with SMART analysis & testability scoring',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              acceptanceCriteria: {
                type: 'array',
                items: { type: 'string' }
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical']
              },
              type: {
                type: 'string',
                enum: ['functional', 'non-functional', 'technical', 'business']
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['id', 'title', 'description']
          },
          description: 'Requirements to validate'
        },
        strictMode: {
          type: 'boolean',
          default: false,
          description: 'Enable strict validation mode'
        },
        includeInvestAnalysis: {
          type: 'boolean',
          default: true,
          description: 'Include INVEST criteria analysis'
        },
        includeSmartAnalysis: {
          type: 'boolean',
          default: true,
          description: 'Include SMART framework analysis'
        },
        testabilityThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          default: 70,
          description: 'Minimum testability score threshold'
        }
      },
      required: ['requirements']
    }
  },

  
  // Category: quality | Domain: requirements


  {
    name: 'mcp__agentic_qe__qe_requirements_generate_bdd',
    description: 'Generate Gherkin/Cucumber BDD scenarios with data-driven examples',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              acceptanceCriteria: {
                type: 'array',
                items: { type: 'string' }
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical']
              },
              type: {
                type: 'string',
                enum: ['functional', 'non-functional', 'technical', 'business']
              }
            },
            required: ['id', 'title', 'description']
          },
          description: 'Requirements to generate BDD scenarios from'
        },
        includeBackground: {
          type: 'boolean',
          default: true,
          description: 'Include background preconditions'
        },
        includeScenarioOutlines: {
          type: 'boolean',
          default: true,
          description: 'Generate scenario outlines with examples'
        },
        includeNegativeCases: {
          type: 'boolean',
          default: true,
          description: 'Generate negative test scenarios'
        },
        includeEdgeCases: {
          type: 'boolean',
          default: true,
          description: 'Generate edge case scenarios'
        },
        examplesPerScenario: {
          type: 'number',
          minimum: 1,
          default: 3,
          description: 'Number of examples per scenario outline'
        },
        outputFormat: {
          type: 'string',
          enum: ['gherkin', 'cucumber', 'json'],
          default: 'gherkin',
          description: 'Output format'
        }
      },
      required: ['requirements']
    }
  },

  // Code Quality Domain Tools (2 tools)
  
  // Category: quality | Domain: code

  {
    name: 'mcp__agentic_qe__qe_code_quality_complexity',
    description: 'Cyclomatic & cognitive complexity analysis with hotspot detection',
    inputSchema: {
      type: 'object',
      properties: {
        sourceCode: {
          type: 'string',
          description: 'Source code to analyze'
        },
        filePath: {
          type: 'string',
          description: 'File path for context'
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'java'],
          description: 'Programming language'
        },
        cyclomaticThreshold: {
          type: 'number',
          default: 10,
          description: 'Cyclomatic complexity threshold for hotspot detection'
        },
        cognitiveThreshold: {
          type: 'number',
          default: 15,
          description: 'Cognitive complexity threshold for hotspot detection'
        },
        includePerFunction: {
          type: 'boolean',
          default: true,
          description: 'Include per-function analysis'
        },
        includeRecommendations: {
          type: 'boolean',
          default: true,
          description: 'Include refactoring recommendations'
        }
      },
      required: ['sourceCode', 'filePath', 'language']
    }
  },

  
  // Category: quality | Domain: code


  {
    name: 'mcp__agentic_qe__qe_code_quality_metrics',
    description: 'Calculate maintainability, reliability, & security metrics',
    inputSchema: {
      type: 'object',
      properties: {
        sourceCode: {
          type: 'string',
          description: 'Source code to analyze'
        },
        filePath: {
          type: 'string',
          description: 'File path for context'
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'java'],
          description: 'Programming language'
        },
        coveragePercentage: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Code coverage percentage'
        },
        codeSmells: {
          type: 'number',
          minimum: 0,
          description: 'Number of code smells detected'
        },
        duplicationPercentage: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Code duplication percentage'
        },
        includeSecurityAnalysis: {
          type: 'boolean',
          default: true,
          description: 'Include security score analysis'
        },
        includeTechnicalDebt: {
          type: 'boolean',
          default: true,
          description: 'Calculate technical debt'
        }
      },
      required: ['sourceCode', 'filePath', 'language']
    }
  },

  // Fleet Coordination Domain Tools (2 tools)
  
  // Category: advanced | Domain: fleet

  {
    name: 'mcp__agentic_qe__qe_fleet_coordinate',
    description: 'Hierarchical fleet coordination with task distribution & load balancing',
    inputSchema: {
      type: 'object',
      properties: {
        agentCount: {
          type: 'number',
          minimum: 1,
          description: 'Total agents in fleet'
        },
        topology: {
          type: 'string',
          enum: ['hierarchical', 'mesh', 'hybrid', 'adaptive'],
          description: 'Coordination topology'
        },
        agentPools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              minSize: { type: 'number' },
              maxSize: { type: 'number' },
              currentSize: { type: 'number' },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical']
              },
              capabilities: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['type', 'minSize', 'maxSize', 'currentSize', 'priority', 'capabilities']
          },
          description: 'Agent pool configurations'
        },
        workload: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              estimatedDuration: { type: 'number' },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical']
              },
              requiredCapabilities: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['id', 'type', 'estimatedDuration', 'priority', 'requiredCapabilities']
          },
          description: 'Task workload to distribute'
        },
        resourceConstraints: {
          type: 'object',
          properties: {
            totalCpuCores: { type: 'number' },
            totalMemory: { type: 'number' },
            cpuPerAgent: { type: 'number' },
            memoryPerAgent: { type: 'number' },
            maxConcurrentTasks: { type: 'number' }
          },
          description: 'Resource constraints'
        },
        enableLoadBalancing: {
          type: 'boolean',
          default: true,
          description: 'Enable load balancing'
        },
        enableAutoScaling: {
          type: 'boolean',
          default: false,
          description: 'Enable auto-scaling recommendations'
        },
        includeMetrics: {
          type: 'boolean',
          default: true,
          description: 'Include coordination metrics'
        }
      },
      required: ['agentCount', 'topology', 'agentPools', 'workload']
    }
  },

  
  // Category: advanced | Domain: fleet


  {
    name: 'mcp__agentic_qe__qe_fleet_agent_status',
    description: 'Real-time agent health monitoring with failure detection & recommendations',
    inputSchema: {
      type: 'object',
      properties: {
        fleetId: {
          type: 'string',
          description: 'Fleet ID to query'
        },
        agentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agent IDs to check (empty = all agents)'
        },
        includeDetailedMetrics: {
          type: 'boolean',
          default: false,
          description: 'Include detailed performance metrics'
        },
        includeHistory: {
          type: 'boolean',
          default: false,
          description: 'Include historical health data'
        },
        historyDuration: {
          type: 'number',
          minimum: 1,
          default: 60,
          description: 'History duration in minutes'
        },
        healthCheckType: {
          type: 'string',
          enum: ['heartbeat', 'performance', 'comprehensive'],
          default: 'comprehensive',
          description: 'Health check type'
        }
      },
      required: ['fleetId']
    }
  },

  // Security Domain Tools (3 tools)
  // ═════════════════════════════════════════════════════════════════════════════
  //                           SECURITY DOMAIN TOOLS
  //                    Security scanning, vulnerability detection, compliance
  // ═════════════════════════════════════════════════════════════════════════════

  
  // Category: security | Domain: scanning

  
  
  {
    name: 'mcp__agentic_qe__qe_security_scan_comprehensive',
    description: 'Comprehensive security scan with SAST, DAST, dependencies, & OWASP',
    inputSchema: {
      type: 'object',
      properties: {
        scanType: {
          type: 'string',
          enum: ['sast', 'dast', 'dependency', 'comprehensive'],
          default: 'comprehensive',
          description: 'Type of security scan'
        },
        target: {
          type: 'string',
          description: 'Target directory or URL to scan'
        },
        depth: {
          type: 'string',
          enum: ['basic', 'standard', 'deep'],
          default: 'standard',
          description: 'Scan depth level'
        },
        rules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Security rules to apply (OWASP, CWE, SANS)'
        },
        excludePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'File patterns to exclude from scan'
        }
      },
      required: ['target']
    }
  },

  
  // Category: security | Domain: detection


  {
    name: 'mcp__agentic_qe__qe_security_detect_vulnerabilities',
    description: 'Detect & classify vulnerabilities using ML analysis with CVE database',
    inputSchema: {
      type: 'object',
      properties: {
        sourceCode: {
          type: 'array',
          items: { type: 'string' },
          description: 'Source code files to analyze'
        },
        dependencies: {
          type: 'object',
          description: 'Dependency manifest (package.json, requirements.txt, etc.)'
        },
        scanDepth: {
          type: 'string',
          enum: ['shallow', 'moderate', 'deep'],
          default: 'moderate',
          description: 'Depth of vulnerability analysis'
        },
        severityThreshold: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          default: 'medium',
          description: 'Minimum severity level to report'
        },
        includeCVE: {
          type: 'boolean',
          default: true,
          description: 'Include CVE database lookup'
        },
        mlDetection: {
          type: 'boolean',
          default: true,
          description: 'Enable ML-based vulnerability detection'
        }
      },
      required: ['sourceCode']
    }
  },

  
  // Category: security | Domain: compliance


  {
    name: 'mcp__agentic_qe__qe_security_validate_compliance',
    description: 'Validate compliance with security standards (OWASP, CWE, SANS, ISO)',
    inputSchema: {
      type: 'object',
      properties: {
        standards: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['owasp-top-10', 'cwe-top-25', 'sans-top-25', 'iso-27001', 'pci-dss', 'hipaa', 'gdpr']
          },
          description: 'Security standards to validate against'
        },
        codebase: {
          type: 'string',
          description: 'Path to codebase root directory'
        },
        includeInfrastructure: {
          type: 'boolean',
          default: false,
          description: 'Include infrastructure compliance checks'
        },
        generateRoadmap: {
          type: 'boolean',
          default: true,
          description: 'Generate remediation roadmap for gaps'
        },
        certificationTarget: {
          type: 'string',
          enum: ['iso-27001', 'soc2', 'pci-dss', 'hipaa'],
          description: 'Target certification (optional)'
        }
      },
      required: ['standards', 'codebase']
    }
  },

  // Test-Generation Domain Tools (4 tools)
  
  // Category: advanced | Domain: testgen

  {
    name: 'mcp__agentic_qe__qe_testgen_generate_unit',
    description: 'AI unit test generation with pattern recognition & mock generation',
    inputSchema: {
      type: 'object',
      properties: {
        sourceCode: {
          type: 'string',
          description: 'Source code to generate tests for'
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'java', 'go'],
          description: 'Programming language'
        },
        framework: {
          type: 'string',
          enum: ['jest', 'mocha', 'jasmine', 'vitest', 'pytest', 'junit', 'go-test'],
          default: 'jest',
          description: 'Testing framework'
        },
        coverageGoal: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          default: 80,
          description: 'Target code coverage percentage'
        },
        includeEdgeCases: {
          type: 'boolean',
          default: true,
          description: 'Generate edge case tests'
        },
        mockStrategy: {
          type: 'string',
          enum: ['auto', 'manual', 'none'],
          default: 'auto',
          description: 'Mock generation strategy'
        }
      },
      required: ['sourceCode', 'language']
    }
  },

  
  // Category: advanced | Domain: testgen


  {
    name: 'mcp__agentic_qe__qe_testgen_generate_integration',
    description: 'Integration test generation with dependency mocking & contract testing',
    inputSchema: {
      type: 'object',
      properties: {
        sourceCode: {
          type: 'array',
          items: { type: 'string' },
          description: 'Source files for integration testing'
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'java', 'go'],
          description: 'Programming language'
        },
        framework: {
          type: 'string',
          enum: ['jest', 'mocha', 'jasmine', 'vitest', 'pytest', 'junit', 'go-test'],
          default: 'jest',
          description: 'Testing framework'
        },
        integrationPoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['api', 'database', 'filesystem', 'external-service'] },
              name: { type: 'string' },
              endpoint: { type: 'string' }
            }
          },
          description: 'Integration points to test'
        },
        mockStrategy: {
          type: 'string',
          enum: ['full', 'partial', 'none'],
          default: 'partial',
          description: 'Dependency mocking strategy'
        },
        contractTesting: {
          type: 'boolean',
          default: false,
          description: 'Generate contract tests (e.g., Pact)'
        }
      },
      required: ['sourceCode', 'language', 'integrationPoints']
    }
  },

  
  // Category: advanced | Domain: testgen


  {
    name: 'mcp__agentic_qe__qe_testgen_optimize_suite',
    description: 'Optimize test suite using sublinear algorithms (JL, temporal advantage)',
    inputSchema: {
      type: 'object',
      properties: {
        tests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              executionTime: { type: 'number' },
              coverage: { type: 'array' },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
            }
          },
          description: 'Test suite to optimize'
        },
        algorithm: {
          type: 'string',
          enum: ['johnson-lindenstrauss', 'temporal-advantage', 'redundancy-detection'],
          default: 'johnson-lindenstrauss',
          description: 'Optimization algorithm'
        },
        targetReduction: {
          type: 'number',
          minimum: 0.1,
          maximum: 0.9,
          default: 0.3,
          description: 'Target reduction ratio (0.3 = reduce to 30%)'
        },
        maintainCoverage: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          default: 0.95,
          description: 'Minimum coverage to maintain (0-1)'
        },
        preserveCritical: {
          type: 'boolean',
          default: true,
          description: 'Preserve critical priority tests'
        }
      },
      required: ['tests']
    }
  },

  
  // Category: advanced | Domain: testgen


  {
    name: 'mcp__agentic_qe__qe_testgen_analyze_quality',
    description: 'Analyze test quality with pattern detection, anti-patterns, & maintainability',
    inputSchema: {
      type: 'object',
      properties: {
        tests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              code: { type: 'string' },
              framework: { type: 'string' }
            }
          },
          description: 'Tests to analyze'
        },
        checkPatterns: {
          type: 'boolean',
          default: true,
          description: 'Check for good test patterns'
        },
        checkAntiPatterns: {
          type: 'boolean',
          default: true,
          description: 'Check for anti-patterns'
        },
        generateRecommendations: {
          type: 'boolean',
          default: true,
          description: 'Generate improvement recommendations'
        },
        detailLevel: {
          type: 'string',
          enum: ['summary', 'detailed', 'comprehensive'],
          default: 'detailed',
          description: 'Analysis detail level'
        }
      },
      required: ['tests']
    }
  },

  // Quality-Gates Domain Tools (4 tools)
  // ═════════════════════════════════════════════════════════════════════════════
  //                           QUALITY DOMAIN TOOLS
  //                    Quality gates, metrics, code quality, requirements
  // ═════════════════════════════════════════════════════════════════════════════

  
  // Category: quality | Domain: gates

  
  
  {
    name: 'mcp__agentic_qe__qe_qualitygate_evaluate',
    description: 'Evaluate quality gate with multi-factor decisions & policy enforcement',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project identifier'
        },
        buildId: {
          type: 'string',
          description: 'Build identifier'
        },
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          description: 'Target deployment environment'
        },
        metrics: {
          type: 'object',
          properties: {
            coverage: { type: 'object', description: 'Code coverage metrics' },
            testResults: { type: 'object', description: 'Test execution results' },
            security: { type: 'object', description: 'Security scan results' },
            performance: { type: 'object', description: 'Performance benchmarks' },
            codeQuality: { type: 'object', description: 'Code quality metrics' }
          },
          required: ['coverage', 'testResults', 'security']
        },
        policy: {
          type: 'object',
          description: 'Quality gate policy rules'
        },
        context: {
          type: 'object',
          description: 'Deployment context (commit, branch, changes)'
        }
      },
      required: ['projectId', 'buildId', 'environment', 'metrics']
    }
  },

  
  // Category: quality | Domain: gates


  {
    name: 'mcp__agentic_qe__qe_qualitygate_assess_risk',
    description: 'Assess deployment risk with historical analysis & ML prediction',
    inputSchema: {
      type: 'object',
      properties: {
        deployment: {
          type: 'object',
          properties: {
            environment: { type: 'string' },
            version: { type: 'string' },
            changes: { type: 'array' }
          },
          description: 'Deployment configuration'
        },
        metrics: {
          type: 'object',
          description: 'Current quality metrics'
        },
        historicalData: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              timestamp: { type: 'string' },
              success: { type: 'boolean' },
              metrics: { type: 'object' }
            }
          },
          description: 'Historical deployment data'
        },
        riskThreshold: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          default: 'medium',
          description: 'Risk tolerance threshold'
        }
      },
      required: ['deployment', 'metrics']
    }
  },

  
  // Category: quality | Domain: gates


  {
    name: 'mcp__agentic_qe__qe_qualitygate_validate_metrics',
    description: 'Validate quality metrics against standards with anomaly detection',
    inputSchema: {
      type: 'object',
      properties: {
        metrics: {
          type: 'object',
          properties: {
            coverage: { type: 'number' },
            testPassRate: { type: 'number' },
            securityScore: { type: 'number' },
            performanceScore: { type: 'number' },
            codeQuality: { type: 'number' }
          },
          description: 'Quality metrics to validate'
        },
        standards: {
          type: 'object',
          properties: {
            minCoverage: { type: 'number', default: 80 },
            minTestPassRate: { type: 'number', default: 95 },
            minSecurityScore: { type: 'number', default: 80 },
            minPerformanceScore: { type: 'number', default: 70 },
            minCodeQuality: { type: 'number', default: 75 }
          },
          description: 'Quality standards thresholds'
        },
        detectAnomalies: {
          type: 'boolean',
          default: true,
          description: 'Detect statistical anomalies'
        },
        historicalData: {
          type: 'array',
          description: 'Historical metrics for trend analysis'
        }
      },
      required: ['metrics']
    }
  },

  
  // Category: quality | Domain: gates


  {
    name: 'mcp__agentic_qe__qe_qualitygate_generate_report',
    description: 'Generate comprehensive quality report with trends, risks, and actionable recommendations',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project identifier'
        },
        buildId: {
          type: 'string',
          description: 'Build identifier'
        },
        metrics: {
          type: 'object',
          description: 'Quality metrics data'
        },
        evaluation: {
          type: 'object',
          description: 'Quality gate evaluation result'
        },
        riskAssessment: {
          type: 'object',
          description: 'Deployment risk assessment'
        },
        format: {
          type: 'string',
          enum: ['html', 'pdf', 'json', 'markdown'],
          default: 'html',
          description: 'Report output format'
        },
        includeCharts: {
          type: 'boolean',
          default: true,
          description: 'Include visual charts'
        },
        includeTrends: {
          type: 'boolean',
          default: true,
          description: 'Include trend analysis'
        },
        includeRecommendations: {
          type: 'boolean',
          default: true,
          description: 'Include actionable recommendations'
        }
      },
      required: ['projectId', 'buildId', 'metrics']
    }
  },

  // Phase 6: Learning Service Tools (Hybrid Approach - Option C)
  
  // Category: advanced | Domain: learning

  {
    name: 'mcp__agentic_qe__learning_store_experience',
    description: 'Store a learning experience for an agent (reward, outcome, task execution details). Enables learning persistence with Claude Code Task tool.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique identifier for the agent'
        },
        taskType: {
          type: 'string',
          description: 'Type of task executed (e.g., "coverage-analysis", "test-generation")'
        },
        reward: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Task success assessment on 0-1 scale (1 = perfect success)'
        },
        outcome: {
          type: 'object',
          description: 'Task execution outcome data (results, metrics, findings)'
        },
        timestamp: {
          type: 'number',
          description: 'Unix timestamp in milliseconds (defaults to Date.now())'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata about the task execution'
        }
      },
      required: ['agentId', 'taskType', 'reward', 'outcome']
    }
  },

  
  // Category: advanced | Domain: learning


  {
    name: 'mcp__agentic_qe__learning_store_qvalue',
    description: 'Store or update a Q-value for a state-action pair. Q-values represent expected reward for taking a specific action in a given state.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Unique identifier for the agent'
        },
        stateKey: {
          type: 'string',
          description: 'State identifier (e.g., "coverage-analysis-state", "test-generation-unit")'
        },
        actionKey: {
          type: 'string',
          description: 'Action identifier (e.g., "sublinear-algorithm", "ml-pattern-matching")'
        },
        qValue: {
          type: 'number',
          description: 'Q-value representing expected reward for this state-action pair'
        },
        updateCount: {
          type: 'number',
          default: 1,
          description: 'Number of times this Q-value is being updated (for weighted averaging)'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata about the Q-value update'
        }
      },
      required: ['agentId', 'stateKey', 'actionKey', 'qValue']
    }
  },

  
  // Category: advanced | Domain: learning


  {
    name: 'mcp__agentic_qe__learning_store_pattern',
    description: 'Store a successful pattern for an agent. Patterns capture proven approaches, strategies, and techniques that worked well and should be reused.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Agent ID that discovered this pattern (optional, for cross-agent patterns)'
        },
        pattern: {
          type: 'string',
          description: 'Description of the successful pattern or technique'
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence in this pattern (0-1 scale)'
        },
        domain: {
          type: 'string',
          default: 'general',
          description: 'Domain or category for this pattern (e.g., "coverage-analysis", "test-generation")'
        },
        usageCount: {
          type: 'number',
          default: 1,
          minimum: 1,
          description: 'Number of times this pattern was used'
        },
        successRate: {
          type: 'number',
          default: 1.0,
          minimum: 0,
          maximum: 1,
          description: 'Success rate when using this pattern (0-1 scale)'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata about the pattern (use cases, performance metrics, etc.)'
        }
      },
      required: ['pattern', 'confidence']
    }
  },

  
  // Category: advanced | Domain: learning


  {
    name: 'mcp__agentic_qe__learning_query',
    description: 'Query learning data (experiences, Q-values, patterns) for an agent. Supports filtering by agent ID, task type, time range, and minimum reward.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: 'Filter by specific agent ID (optional)'
        },
        taskType: {
          type: 'string',
          description: 'Filter by task type (optional)'
        },
        minReward: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Filter by minimum reward threshold (optional)'
        },
        limit: {
          type: 'number',
          default: 50,
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of results to return'
        },
        offset: {
          type: 'number',
          default: 0,
          minimum: 0,
          description: 'Pagination offset'
        },
        queryType: {
          type: 'string',
          enum: ['experiences', 'qvalues', 'patterns', 'all'],
          default: 'all',
          description: 'Type of learning data to query'
        },
        timeRange: {
          type: 'object',
          properties: {
            start: {
              type: 'number',
              description: 'Start timestamp in milliseconds'
            },
            end: {
              type: 'number',
              description: 'End timestamp in milliseconds'
            }
          },
          description: 'Filter by time range (optional)'
        }
      }
    }
  }
];

/**
 * Export tool names for easy reference
 */
export const TOOL_NAMES = {
  // Core Fleet Tools
  FLEET_INIT: 'mcp__agentic_qe__fleet_init',
  AGENT_SPAWN: 'mcp__agentic_qe__agent_spawn',
  FLEET_STATUS: 'mcp__agentic_qe__fleet_status',
  TASK_ORCHESTRATE: 'mcp__agentic_qe__task_orchestrate',
  // Test tools (use enhanced versions)
  TEST_EXECUTE: 'mcp__agentic_qe__test_execute',
  TEST_GENERATE_ENHANCED: 'mcp__agentic_qe__test_generate_enhanced',
  TEST_EXECUTE_PARALLEL: 'mcp__agentic_qe__test_execute_parallel',
  TEST_OPTIMIZE_SUBLINEAR: 'mcp__agentic_qe__test_optimize_sublinear',
  TEST_REPORT_COMPREHENSIVE: 'mcp__agentic_qe__test_report_comprehensive',
  TEST_COVERAGE_DETAILED: 'mcp__agentic_qe__test_coverage_detailed',
  // Memory tools
  MEMORY_STORE: 'mcp__agentic_qe__memory_store',
  MEMORY_RETRIEVE: 'mcp__agentic_qe__memory_retrieve',
  MEMORY_QUERY: 'mcp__agentic_qe__memory_query',
  MEMORY_SHARE: 'mcp__agentic_qe__memory_share',
  MEMORY_BACKUP: 'mcp__agentic_qe__memory_backup',
  BLACKBOARD_POST: 'mcp__agentic_qe__blackboard_post',
  BLACKBOARD_READ: 'mcp__agentic_qe__blackboard_read',
  CONSENSUS_PROPOSE: 'mcp__agentic_qe__consensus_propose',
  CONSENSUS_VOTE: 'mcp__agentic_qe__consensus_vote',
  ARTIFACT_MANIFEST: 'mcp__agentic_qe__artifact_manifest',
  // Coordination tools (Phase 1)
  WORKFLOW_CREATE: 'mcp__agentic_qe__workflow_create',
  WORKFLOW_EXECUTE: 'mcp__agentic_qe__workflow_execute',
  WORKFLOW_CHECKPOINT: 'mcp__agentic_qe__workflow_checkpoint',
  WORKFLOW_RESUME: 'mcp__agentic_qe__workflow_resume',
  TASK_STATUS: 'mcp__agentic_qe__task_status',
  EVENT_EMIT: 'mcp__agentic_qe__event_emit',
  EVENT_SUBSCRIBE: 'mcp__agentic_qe__event_subscribe',
  // Prediction and analysis tools
  FLAKY_TEST_DETECT: 'mcp__agentic_qe__flaky_test_detect',
  PREDICT_DEFECTS_AI: 'mcp__agentic_qe__predict_defects_ai',
  VISUAL_TEST_REGRESSION: 'mcp__agentic_qe__visual_test_regression',
  DEPLOYMENT_READINESS_CHECK: 'mcp__agentic_qe__deployment_readiness_check',
  // Analysis tools (use Phase 3 domain tools for enhanced versions)
  COVERAGE_ANALYZE_SUBLINEAR: 'mcp__agentic_qe__coverage_analyze_sublinear',
  COVERAGE_GAPS_DETECT: 'mcp__agentic_qe__coverage_gaps_detect',
  PERFORMANCE_MONITOR_REALTIME: 'mcp__agentic_qe__performance_monitor_realtime',
  SECURITY_SCAN_COMPREHENSIVE: 'mcp__agentic_qe__security_scan_comprehensive',
  // Advanced tools (use QE_REQUIREMENTS_* for validation)
  PRODUCTION_INCIDENT_REPLAY: 'mcp__agentic_qe__production_incident_replay',
  PRODUCTION_RUM_ANALYZE: 'mcp__agentic_qe__production_rum_analyze',
  API_BREAKING_CHANGES: 'mcp__agentic_qe__api_breaking_changes',
  MUTATION_TEST_EXECUTE: 'mcp__agentic_qe__mutation_test_execute',
  // Streaming tools (v1.0.5)
  TEST_EXECUTE_STREAM: 'mcp__agentic_qe__test_execute_stream',
  COVERAGE_ANALYZE_STREAM: 'mcp__agentic_qe__coverage_analyze_stream',
  // Phase 2 tools
  LEARNING_STATUS: 'mcp__agentic_qe__learning_status',
  LEARNING_TRAIN: 'mcp__agentic_qe__learning_train',
  LEARNING_HISTORY: 'mcp__agentic_qe__learning_history',
  LEARNING_RESET: 'mcp__agentic_qe__learning_reset',
  LEARNING_EXPORT: 'mcp__agentic_qe__learning_export',
  // Phase 6: Learning Service Tools (Hybrid Approach - Option C)
  LEARNING_STORE_EXPERIENCE: 'mcp__agentic_qe__learning_store_experience',
  LEARNING_STORE_QVALUE: 'mcp__agentic_qe__learning_store_qvalue',
  LEARNING_STORE_PATTERN: 'mcp__agentic_qe__learning_store_pattern',
  LEARNING_QUERY: 'mcp__agentic_qe__learning_query',
  PATTERN_STORE: 'mcp__agentic_qe__pattern_store',
  PATTERN_FIND: 'mcp__agentic_qe__pattern_find',
  PATTERN_EXTRACT: 'mcp__agentic_qe__pattern_extract',
  PATTERN_SHARE: 'mcp__agentic_qe__pattern_share',
  PATTERN_STATS: 'mcp__agentic_qe__pattern_stats',
  IMPROVEMENT_STATUS: 'mcp__agentic_qe__improvement_status',
  IMPROVEMENT_CYCLE: 'mcp__agentic_qe__improvement_cycle',
  IMPROVEMENT_AB_TEST: 'mcp__agentic_qe__improvement_ab_test',
  IMPROVEMENT_FAILURES: 'mcp__agentic_qe__improvement_failures',
  PERFORMANCE_TRACK: 'mcp__agentic_qe__performance_track',
  // Phase 3: Domain-Specific Tools
  // Coverage Domain
  COVERAGE_ANALYZE_WITH_RISK_SCORING: 'mcp__agentic_qe__coverage_analyze_with_risk_scoring',
  COVERAGE_DETECT_GAPS_ML: 'mcp__agentic_qe__coverage_detect_gaps_ml',
  COVERAGE_RECOMMEND_TESTS: 'mcp__agentic_qe__coverage_recommend_tests',
  COVERAGE_CALCULATE_TRENDS: 'mcp__agentic_qe__coverage_calculate_trends',
  // Flaky Detection
  FLAKY_DETECT_STATISTICAL: 'mcp__agentic_qe__flaky_detect_statistical',
  FLAKY_ANALYZE_PATTERNS: 'mcp__agentic_qe__flaky_analyze_patterns',
  FLAKY_STABILIZE_AUTO: 'mcp__agentic_qe__flaky_stabilize_auto',
  // Performance
  PERFORMANCE_ANALYZE_BOTTLENECKS: 'mcp__agentic_qe__performance_analyze_bottlenecks',
  PERFORMANCE_GENERATE_REPORT: 'mcp__agentic_qe__performance_generate_report',
  PERFORMANCE_RUN_BENCHMARK: 'mcp__agentic_qe__performance_run_benchmark',
  // Security (use QE_SECURITY_* for comprehensive scanning)
  SECURITY_GENERATE_REPORT: 'mcp__agentic_qe__security_generate_report',
  // Visual Testing
  VISUAL_COMPARE_SCREENSHOTS: 'mcp__agentic_qe__visual_compare_screenshots',
  VISUAL_VALIDATE_ACCESSIBILITY: 'mcp__agentic_qe__visual_validate_accessibility',
  VISUAL_DETECT_REGRESSION: 'mcp__agentic_qe__visual_detect_regression',
  A11Y_SCAN_COMPREHENSIVE: 'mcp__agentic_qe__a11y_scan_comprehensive',
  // Phase 3: New Domain Tools
  // Security Domain (3 tools)
  QE_SECURITY_SCAN_COMPREHENSIVE: 'mcp__agentic_qe__qe_security_scan_comprehensive',
  QE_SECURITY_DETECT_VULNERABILITIES: 'mcp__agentic_qe__qe_security_detect_vulnerabilities',
  QE_SECURITY_VALIDATE_COMPLIANCE: 'mcp__agentic_qe__qe_security_validate_compliance',
  // Test-Generation Domain (4 tools)
  QE_TESTGEN_GENERATE_UNIT: 'mcp__agentic_qe__qe_testgen_generate_unit',
  QE_TESTGEN_GENERATE_INTEGRATION: 'mcp__agentic_qe__qe_testgen_generate_integration',
  QE_TESTGEN_OPTIMIZE_SUITE: 'mcp__agentic_qe__qe_testgen_optimize_suite',
  QE_TESTGEN_ANALYZE_QUALITY: 'mcp__agentic_qe__qe_testgen_analyze_quality',
  // Quality-Gates Domain (4 tools)
  QE_QUALITYGATE_EVALUATE: 'mcp__agentic_qe__qe_qualitygate_evaluate',
  QE_QUALITYGATE_ASSESS_RISK: 'mcp__agentic_qe__qe_qualitygate_assess_risk',
  QE_QUALITYGATE_VALIDATE_METRICS: 'mcp__agentic_qe__qe_qualitygate_validate_metrics',
  QE_QUALITYGATE_GENERATE_REPORT: 'mcp__agentic_qe__qe_qualitygate_generate_report',
  // API-Contract Domain (3 tools)
  QE_APICONTRACT_VALIDATE: 'mcp__agentic_qe__qe_apicontract_validate',
  QE_APICONTRACT_BREAKING_CHANGES: 'mcp__agentic_qe__qe_apicontract_breaking_changes',
  QE_APICONTRACT_VERSIONING: 'mcp__agentic_qe__qe_apicontract_versioning',
  // Test-Data Domain (3 tools)
  QE_TESTDATA_GENERATE: 'mcp__agentic_qe__qe_testdata_generate',
  QE_TESTDATA_MASK: 'mcp__agentic_qe__qe_testdata_mask',
  QE_TESTDATA_SCHEMA: 'mcp__agentic_qe__qe_testdata_schema',
  // Regression Domain (2 tools)
  QE_REGRESSION_ANALYZE_RISK: 'mcp__agentic_qe__qe_regression_analyze_risk',
  QE_REGRESSION_SELECT_TESTS: 'mcp__agentic_qe__qe_regression_select_tests',
  // Requirements Domain (2 tools)
  QE_REQUIREMENTS_VALIDATE: 'mcp__agentic_qe__qe_requirements_validate',
  QE_REQUIREMENTS_BDD: 'mcp__agentic_qe__qe_requirements_bdd',
  // Code-Quality Domain (2 tools)
  QE_CODEQUALITY_COMPLEXITY: 'mcp__agentic_qe__qe_codequality_complexity',
  QE_CODEQUALITY_METRICS: 'mcp__agentic_qe__qe_codequality_metrics',
  // Fleet Management Domain (2 tools)
  QE_FLEET_COORDINATE: 'mcp__agentic_qe__qe_fleet_coordinate',
  QE_FLEET_STATUS: 'mcp__agentic_qe__qe_fleet_status',
  // Meta Tools (Phase 2 - Hierarchical Lazy Loading)
  TOOLS_DISCOVER: 'mcp__agentic_qe__tools_discover',
  TOOLS_LOAD_DOMAIN: 'mcp__agentic_qe__tools_load_domain'
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
