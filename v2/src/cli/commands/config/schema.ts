/**
 * JSON Schema for AQE Configuration Validation
 * Uses AJV for real schema validation
 */

export const AQEConfigSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['version', 'fleet'],
  properties: {
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+$',
      description: 'Configuration version (e.g., 1.0, 2.0)'
    },
    fleet: {
      type: 'object',
      required: ['topology', 'maxAgents'],
      properties: {
        topology: {
          type: 'string',
          enum: ['hierarchical', 'mesh', 'ring', 'star'],
          description: 'Fleet topology type'
        },
        maxAgents: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of agents in fleet'
        },
        testingFocus: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['unit', 'integration', 'e2e', 'performance', 'security']
          },
          description: 'Areas of testing focus'
        },
        environments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target testing environments'
        },
        agents: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'count'],
            properties: {
              type: { type: 'string' },
              count: {
                type: 'integer',
                minimum: 0
              },
              capabilities: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        }
      }
    },
    features: {
      type: 'object',
      properties: {
        monitoring: { type: 'boolean' },
        security: {
          type: ['boolean', 'object'],
          properties: {
            enabled: { type: 'boolean' },
            level: {
              type: 'string',
              enum: ['basic', 'standard', 'strict']
            }
          }
        },
        reporting: { type: 'boolean' },
        coordination: { type: 'boolean' }
      }
    },
    plugins: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          config: { type: 'object' }
        }
      }
    }
  }
};
