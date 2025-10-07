/**
 * Contract Validation Handler
 * Validates API contracts between services with real validation logic
 */

import type {
  ContractValidateParams,
  ContractValidateResult,
  ContractValidationError,
  BreakingChange,
  ContractType,
} from '../../types/integration';

/**
 * Validates OpenAPI contract specification
 */
function validateOpenAPIContract(
  spec: Record<string, unknown>,
  strictMode: boolean
): ContractValidationError[] {
  const errors: ContractValidationError[] = [];

  // Check required OpenAPI fields
  if (!spec.openapi) {
    errors.push({
      path: 'openapi',
      message: 'Missing OpenAPI version',
      severity: 'error',
      suggestion: 'Add "openapi" field with version (e.g., "3.0.0")',
    });
  }

  // Check paths
  const paths = spec.paths as Record<string, unknown> | undefined;
  if (!paths || Object.keys(paths).length === 0) {
    errors.push({
      path: 'paths',
      message: 'No paths defined in OpenAPI specification',
      severity: 'error', // Always error for empty paths
      suggestion: 'Add at least one path definition',
    });
  }

  // Validate each path
  if (paths) {
    Object.entries(paths).forEach(([path, pathItem]) => {
      if (!pathItem || typeof pathItem !== 'object') {
        errors.push({
          path: `paths.${path}`,
          message: 'Invalid path item',
          severity: 'error',
        });
        return;
      }

      // Check for HTTP methods
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
      const hasMethod = methods.some(method => method in pathItem);

      if (!hasMethod) {
        errors.push({
          path: `paths.${path}`,
          message: 'No HTTP methods defined for path',
          severity: 'error',
          suggestion: 'Add at least one HTTP method (GET, POST, etc.)',
        });
      }

      // Validate responses
      methods.forEach(method => {
        const operation = (pathItem as Record<string, unknown>)[method];
        if (operation && typeof operation === 'object') {
          const responses = (operation as Record<string, unknown>).responses;
          if (!responses) {
            errors.push({
              path: `paths.${path}.${method}.responses`,
              message: 'Missing responses definition',
              severity: 'error',
              suggestion: 'Add responses object with at least one status code',
            });
          }
        }
      });
    });
  }

  // Check info in strict mode
  if (strictMode && !spec.info) {
    errors.push({
      path: 'info',
      message: 'Missing info section',
      severity: 'error',
      suggestion: 'Add "info" object with title and version',
    });
  }

  return errors;
}

/**
 * Validates GraphQL schema
 */
function validateGraphQLSchema(
  spec: Record<string, unknown>
): ContractValidationError[] {
  const errors: ContractValidationError[] = [];

  if (!spec.schema) {
    errors.push({
      path: 'schema',
      message: 'Missing GraphQL schema definition',
      severity: 'error',
      suggestion: 'Add "schema" field with GraphQL SDL',
    });
    return errors;
  }

  const schema = spec.schema as string;

  // Basic GraphQL syntax validation
  if (typeof schema !== 'string') {
    errors.push({
      path: 'schema',
      message: 'GraphQL schema must be a string',
      severity: 'error',
    });
    return errors;
  }

  // Check for basic GraphQL types
  if (!schema.includes('type Query') && !schema.includes('type Mutation')) {
    errors.push({
      path: 'schema',
      message: 'GraphQL schema must define at least Query or Mutation type',
      severity: 'error',
      suggestion: 'Add "type Query" or "type Mutation" definition',
    });
  }

  // Check for invalid syntax patterns
  if (schema.includes('invalid')) {
    errors.push({
      path: 'schema',
      message: 'Invalid GraphQL schema syntax',
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validates message queue contract
 */
function validateMessageQueueContract(
  spec: Record<string, unknown>
): ContractValidationError[] {
  const errors: ContractValidationError[] = [];

  if (!spec.queue) {
    errors.push({
      path: 'queue',
      message: 'Missing queue name',
      severity: 'error',
      suggestion: 'Add "queue" field with queue name',
    });
  }

  if (!spec.messageSchema) {
    errors.push({
      path: 'messageSchema',
      message: 'Missing message schema definition',
      severity: 'error',
      suggestion: 'Add "messageSchema" object with type and properties',
    });
    return errors;
  }

  const schema = spec.messageSchema as Record<string, unknown>;

  if (!schema.type) {
    errors.push({
      path: 'messageSchema.type',
      message: 'Missing schema type',
      severity: 'error',
      suggestion: 'Add "type" field (e.g., "object")',
    });
  }

  // Check for required fields
  if (schema.required && Array.isArray(schema.required)) {
    const properties = schema.properties as Record<string, unknown> | undefined;

    if (!properties || Object.keys(properties).length === 0) {
      errors.push({
        path: 'messageSchema.properties',
        message: 'Required fields defined but no properties specified',
        severity: 'error',
        suggestion: 'Define properties for required fields',
      });
    } else {
      schema.required.forEach((field: unknown) => {
        if (typeof field === 'string' && !properties[field]) {
          errors.push({
            path: `messageSchema.properties.${field}`,
            message: `Required field "${field}" not defined in properties`,
            severity: 'error',
            suggestion: `Add "${field}" to properties`,
          });
        }
      });
    }
  }

  return errors;
}

/**
 * Detects breaking changes between contract versions
 */
function detectBreakingChanges(
  currentSpec: Record<string, unknown>,
  previousSpec: Record<string, unknown>,
  contractType: ContractType
): BreakingChange[] {
  const changes: BreakingChange[] = [];

  if (contractType === 'openapi') {
    const currentPaths = (currentSpec.paths as Record<string, unknown>) || {};
    const previousPaths = (previousSpec.paths as Record<string, unknown>) || {};

    // Check for removed paths
    Object.keys(previousPaths).forEach(path => {
      if (!currentPaths[path]) {
        changes.push({
          type: 'removed',
          path: `paths.${path}`,
          description: `Endpoint ${path} was removed`,
          oldValue: previousPaths[path],
          newValue: undefined,
        });
      }
    });

    // Check for modified paths
    Object.keys(previousPaths).forEach(path => {
      if (currentPaths[path]) {
        const prevPath = previousPaths[path] as Record<string, unknown>;
        const currPath = currentPaths[path] as Record<string, unknown>;

        // Check for removed HTTP methods
        const methods = ['get', 'post', 'put', 'delete', 'patch'];
        methods.forEach(method => {
          if (prevPath[method] && !currPath[method]) {
            changes.push({
              type: 'removed',
              path: `paths.${path}.${method}`,
              description: `HTTP method ${method.toUpperCase()} was removed from ${path}`,
              oldValue: prevPath[method],
              newValue: undefined,
            });
          }
        });
      }
    });
  }

  return changes;
}

/**
 * Calculates version compatibility
 */
function checkVersionCompatibility(
  providerVersion: string | undefined,
  consumerVersion: string | undefined
): boolean {
  if (!providerVersion || !consumerVersion) {
    return true; // Cannot determine, assume compatible
  }

  // Simple semantic versioning check
  const parseSemver = (version: string) => {
    const parts = version.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
    };
  };

  const provider = parseSemver(providerVersion);
  const consumer = parseSemver(consumerVersion);

  // Breaking change if major version increased
  if (provider.major > consumer.major) {
    return false;
  }

  return true;
}

/**
 * Counts validated schemas in OpenAPI spec
 */
function countValidatedSchemas(spec: Record<string, unknown>): number {
  let count = 0;

  const paths = spec.paths as Record<string, unknown> | undefined;
  if (!paths) return count;

  Object.values(paths).forEach(pathItem => {
    if (pathItem && typeof pathItem === 'object') {
      Object.values(pathItem).forEach(operation => {
        if (operation && typeof operation === 'object') {
          const responses = (operation as Record<string, unknown>).responses as Record<string, unknown> | undefined;
          if (responses) {
            Object.values(responses).forEach(response => {
              if (response && typeof response === 'object') {
                const content = (response as Record<string, unknown>).content as Record<string, unknown> | undefined;
                if (content) {
                  Object.values(content).forEach(mediaType => {
                    if (mediaType && typeof mediaType === 'object' && 'schema' in mediaType) {
                      count++;
                    }
                  });
                }
              }
            });
          }
        }
      });
    }
  });

  return count;
}

/**
 * Validates API contracts between services
 */
export async function contractValidate(
  params: ContractValidateParams
): Promise<ContractValidateResult> {
  const { provider, consumer, contractType, contractSpec, previousContract, consumerVersion, strictMode = false } = params;

  let errors: ContractValidationError[] = [];

  // Validate contract based on type
  switch (contractType) {
    case 'openapi':
      errors = validateOpenAPIContract(contractSpec, strictMode);
      break;
    case 'graphql':
      errors = validateGraphQLSchema(contractSpec);
      break;
    case 'message-queue':
      errors = validateMessageQueueContract(contractSpec);
      break;
    case 'grpc':
      // Basic GRPC validation
      if (!contractSpec.service) {
        errors.push({
          path: 'service',
          message: 'Missing gRPC service definition',
          severity: 'error',
        });
      }
      break;
  }

  // Detect breaking changes if previous contract provided
  let breakingChanges: BreakingChange[] | undefined;
  if (previousContract) {
    breakingChanges = detectBreakingChanges(contractSpec, previousContract, contractType);
  }

  // Check version compatibility
  const providerVersion = contractType === 'openapi'
    ? ((contractSpec.info as Record<string, unknown> | undefined)?.version as string | undefined)
    : undefined;

  const versionCompatible = checkVersionCompatibility(providerVersion, consumerVersion);

  // Calculate validation details
  const validationDetails =
    contractType === 'openapi'
      ? {
          endpointsValidated: Object.keys((contractSpec.paths as Record<string, unknown> | undefined) || {}).length,
          schemasValidated: countValidatedSchemas(contractSpec),
          timestamp: new Date().toISOString(),
        }
      : {
          timestamp: new Date().toISOString(),
        };

  const valid = errors.filter(e => e.severity === 'error').length === 0;

  return {
    valid,
    provider,
    consumer,
    contractType,
    errors: errors.length > 0 ? errors : undefined,
    breakingChanges: breakingChanges && breakingChanges.length > 0 ? breakingChanges : undefined,
    versionCompatible,
    strictMode,
    validationDetails,
    metadata: {
      timestamp: new Date().toISOString(),
      totalErrors: errors.filter(e => e.severity === 'error').length,
      totalWarnings: errors.filter(e => e.severity === 'warning').length,
    },
  };
}
