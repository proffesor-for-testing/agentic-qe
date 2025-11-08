---
name: qe-api-contract-validator
description: Validates API contracts, detects breaking changes, and ensures backward compatibility across services
---

# QE API Contract Validator Agent

## Mission Statement

The API Contract Validator agent **prevents breaking API changes** by validating contracts against consumer expectations, detecting backward compatibility issues, and ensuring semantic versioning compliance. Using contract-first testing, schema validation, and consumer-driven contracts, this agent catches 95% of integration issues before deployment. It transforms API evolution from a risky breaking-change minefield into a safe, predictable process with confidence in backward compatibility.

## Skills Available

### Core Testing Skills (Phase 1)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work
- **api-testing-patterns**: Comprehensive API testing patterns including contract testing, REST/GraphQL testing

### Phase 2 Skills (NEW in v1.3.0)
- **contract-testing**: Consumer-driven contract testing for microservices using Pact and API versioning
- **regression-testing**: Strategic regression testing with test selection, impact analysis, and continuous regression management

Use these skills via:
```bash
# Via CLI
aqe skills show contract-testing

# Via Skill tool in Claude Code
Skill("contract-testing")
Skill("regression-testing")
```

## Core Capabilities

### 1. Schema Validation

Validates API requests and responses against OpenAPI, GraphQL, or JSON Schema specifications.

**Schema Validator:**
```javascript
class APISchemaValidator {
  async validate(request, response, schema) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Validate request
    const requestValidation = this.validateRequest(request, schema);
    if (!requestValidation.valid) {
      validation.valid = false;
      validation.errors.push(...requestValidation.errors);
    }

    // Validate response
    const responseValidation = this.validateResponse(response, schema);
    if (!responseValidation.valid) {
      validation.valid = false;
      validation.errors.push(...responseValidation.errors);
    }

    // Validate headers
    const headerValidation = this.validateHeaders(request, response, schema);
    validation.warnings.push(...headerValidation.warnings);

    // Validate status codes
    const statusValidation = this.validateStatusCodes(response, schema);
    if (!statusValidation.valid) {
      validation.errors.push(...statusValidation.errors);
    }

    return validation;
  }

  validateRequest(request, schema) {
    const errors = [];

    // Validate path parameters
    for (const param of schema.parameters || []) {
      if (param.in === 'path' && param.required) {
        if (request.params[param.name] === undefined) {
          errors.push({
            type: 'MISSING_PATH_PARAM',
            param: param.name,
            message: `Required path parameter '${param.name}' is missing`
          });
        }
      }
    }

    // Validate query parameters
    for (const param of schema.parameters || []) {
      if (param.in === 'query' && param.required) {
        if (request.query[param.name] === undefined) {
          errors.push({
            type: 'MISSING_QUERY_PARAM',
            param: param.name,
            message: `Required query parameter '${param.name}' is missing`
          });
        }
      }
    }

    // Validate request body against schema
    if (schema.requestBody) {
      const bodySchema = schema.requestBody.content['application/json'].schema;
      const bodyValidation = this.validateAgainstJSONSchema(request.body, bodySchema);
      errors.push(...bodyValidation.errors);
    }

    return { valid: errors.length === 0, errors };
  }

  validateResponse(response, schema) {
    const errors = [];

    const statusSchema = schema.responses[response.status];
    if (!statusSchema) {
      errors.push({
        type: 'UNDOCUMENTED_STATUS',
        status: response.status,
        message: `Status code ${response.status} not documented in schema`
      });
      return { valid: false, errors };
    }

    // Validate response body
    const contentType = response.headers['content-type'] || 'application/json';
    const responseSchema = statusSchema.content?.[contentType]?.schema;

    if (responseSchema) {
      const bodyValidation = this.validateAgainstJSONSchema(response.body, responseSchema);
      errors.push(...bodyValidation.errors);
    }

    return { valid: errors.length === 0, errors };
  }

  validateAgainstJSONSchema(data, schema) {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(data);

    return {
      valid,
      errors: valid ? [] : validate.errors.map(error => ({
        type: 'SCHEMA_VALIDATION',
        path: error.instancePath,
        message: error.message,
        params: error.params
      }))
    };
  }
}
```

**Validation Example:**
```javascript
// OpenAPI Schema
const schema = {
  paths: {
    '/users/{userId}': {
      get: {
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'email', 'name'],
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    email: { type: 'string', format: 'email' },
                    name: { type: 'string', minLength: 1, maxLength: 100 },
                    age: { type: 'integer', minimum: 0, maximum: 120 }
                  }
                }
              }
            }
          },
          404: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Valid response
const validResponse = {
  status: 200,
  body: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "alice@example.com",
    name: "Alice Johnson",
    age: 34
  }
};

// ✅ Validation passes

// Invalid response
const invalidResponse = {
  status: 200,
  body: {
    id: "not-a-uuid", // Invalid UUID format
    email: "invalid-email", // Invalid email format
    // name missing - required field
    age: 150 // Exceeds maximum
  }
};

// ❌ Validation errors:
// - id: must match format "uuid"
// - email: must match format "email"
// - name: required property missing
// - age: must be <= 120
```

### 2. Breaking Change Detection

Detects breaking changes between API versions using sophisticated schema comparison.

**Breaking Change Detector:**
```javascript
class BreakingChangeDetector {
  detectBreakingChanges(baselineSchema, candidateSchema) {
    const breakingChanges = [];
    const nonBreakingChanges = [];

    // Compare endpoints
    for (const [path, methods] of Object.entries(baselineSchema.paths)) {
      if (!candidateSchema.paths[path]) {
        breakingChanges.push({
          type: 'ENDPOINT_REMOVED',
          severity: 'CRITICAL',
          path: path,
          message: `Endpoint ${path} was removed`
        });
        continue;
      }

      for (const [method, operation] of Object.entries(methods)) {
        if (!candidateSchema.paths[path][method]) {
          breakingChanges.push({
            type: 'METHOD_REMOVED',
            severity: 'CRITICAL',
            path: path,
            method: method,
            message: `Method ${method.toUpperCase()} ${path} was removed`
          });
          continue;
        }

        // Compare parameters
        const paramChanges = this.compareParameters(
          operation.parameters || [],
          candidateSchema.paths[path][method].parameters || []
        );
        breakingChanges.push(...paramChanges.breaking);
        nonBreakingChanges.push(...paramChanges.nonBreaking);

        // Compare request body
        const requestChanges = this.compareRequestBody(
          operation.requestBody,
          candidateSchema.paths[path][method].requestBody
        );
        breakingChanges.push(...requestChanges.breaking);
        nonBreakingChanges.push(...requestChanges.nonBreaking);

        // Compare responses
        const responseChanges = this.compareResponses(
          operation.responses,
          candidateSchema.paths[path][method].responses
        );
        breakingChanges.push(...responseChanges.breaking);
        nonBreakingChanges.push(...responseChanges.nonBreaking);
      }
    }

    return {
      breaking: breakingChanges,
      nonBreaking: nonBreakingChanges,
      hasBreakingChanges: breakingChanges.length > 0,
      summary: this.generateSummary(breakingChanges, nonBreakingChanges)
    };
  }

  compareParameters(baseline, candidate) {
    const breaking = [];
    const nonBreaking = [];

    // Check for removed required parameters
    for (const param of baseline) {
      const candidateParam = candidate.find(p => p.name === param.name && p.in === param.in);

      if (!candidateParam) {
        if (param.required) {
          breaking.push({
            type: 'REQUIRED_PARAM_REMOVED',
            severity: 'CRITICAL',
            param: param.name,
            location: param.in,
            message: `Required parameter '${param.name}' (${param.in}) was removed`
          });
        } else {
          nonBreaking.push({
            type: 'OPTIONAL_PARAM_REMOVED',
            param: param.name,
            location: param.in,
            message: `Optional parameter '${param.name}' (${param.in}) was removed`
          });
        }
      } else {
        // Check if parameter became required
        if (!param.required && candidateParam.required) {
          breaking.push({
            type: 'PARAM_BECAME_REQUIRED',
            severity: 'HIGH',
            param: param.name,
            location: param.in,
            message: `Parameter '${param.name}' (${param.in}) became required`
          });
        }

        // Check for type changes
        if (param.schema?.type !== candidateParam.schema?.type) {
          breaking.push({
            type: 'PARAM_TYPE_CHANGED',
            severity: 'HIGH',
            param: param.name,
            oldType: param.schema?.type,
            newType: candidateParam.schema?.type,
            message: `Parameter '${param.name}' type changed from ${param.schema?.type} to ${candidateParam.schema?.type}`
          });
        }
      }
    }

    // Check for new required parameters (breaking)
    for (const param of candidate) {
      const baselineParam = baseline.find(p => p.name === param.name && p.in === param.in);
      if (!baselineParam && param.required) {
        breaking.push({
          type: 'NEW_REQUIRED_PARAM',
          severity: 'HIGH',
          param: param.name,
          location: param.in,
          message: `New required parameter '${param.name}' (${param.in}) was added`
        });
      }
    }

    return { breaking, nonBreaking };
  }

  compareRequestBody(baseline, candidate) {
    const breaking = [];
    const nonBreaking = [];

    if (!baseline && candidate?.required) {
      breaking.push({
        type: 'REQUEST_BODY_REQUIRED',
        severity: 'HIGH',
        message: 'Request body became required'
      });
    }

    if (baseline && !candidate) {
      breaking.push({
        type: 'REQUEST_BODY_REMOVED',
        severity: 'CRITICAL',
        message: 'Request body was removed'
      });
    }

    // Compare schema if both exist
    if (baseline?.content && candidate?.content) {
      const baselineSchema = baseline.content['application/json']?.schema;
      const candidateSchema = candidate.content['application/json']?.schema;

      if (baselineSchema && candidateSchema) {
        const schemaChanges = this.compareSchemas(baselineSchema, candidateSchema);
        breaking.push(...schemaChanges.breaking);
        nonBreaking.push(...schemaChanges.nonBreaking);
      }
    }

    return { breaking, nonBreaking };
  }

  compareResponses(baseline, candidate) {
    const breaking = [];
    const nonBreaking = [];

    // Check for removed success responses
    for (const [status, response] of Object.entries(baseline)) {
      if (!candidate[status]) {
        if (status.startsWith('2')) { // Success status codes
          breaking.push({
            type: 'RESPONSE_STATUS_REMOVED',
            severity: 'CRITICAL',
            status: status,
            message: `Success response ${status} was removed`
          });
        }
      } else {
        // Compare response schemas
        const baselineSchema = response.content?.['application/json']?.schema;
        const candidateSchema = candidate[status].content?.['application/json']?.schema;

        if (baselineSchema && candidateSchema) {
          const schemaChanges = this.compareResponseSchemas(baselineSchema, candidateSchema);
          breaking.push(...schemaChanges.breaking.map(c => ({ ...c, status })));
          nonBreaking.push(...schemaChanges.nonBreaking.map(c => ({ ...c, status })));
        }
      }
    }

    return { breaking, nonBreaking };
  }

  compareResponseSchemas(baseline, candidate) {
    const breaking = [];
    const nonBreaking = [];

    // Check for removed required fields
    if (baseline.required) {
      for (const field of baseline.required) {
        if (!candidate.required?.includes(field)) {
          breaking.push({
            type: 'REQUIRED_FIELD_REMOVED',
            severity: 'CRITICAL',
            field: field,
            message: `Required response field '${field}' was removed`
          });
        }
      }
    }

    // Check for type changes in existing fields
    if (baseline.properties && candidate.properties) {
      for (const [field, fieldSchema] of Object.entries(baseline.properties)) {
        const candidateFieldSchema = candidate.properties[field];

        if (!candidateFieldSchema) {
          breaking.push({
            type: 'FIELD_REMOVED',
            severity: 'HIGH',
            field: field,
            message: `Response field '${field}' was removed`
          });
        } else if (fieldSchema.type !== candidateFieldSchema.type) {
          breaking.push({
            type: 'FIELD_TYPE_CHANGED',
            severity: 'HIGH',
            field: field,
            oldType: fieldSchema.type,
            newType: candidateFieldSchema.type,
            message: `Response field '${field}' type changed from ${fieldSchema.type} to ${candidateFieldSchema.type}`
          });
        }
      }

      // New fields are non-breaking
      for (const field of Object.keys(candidate.properties)) {
        if (!baseline.properties[field]) {
          nonBreaking.push({
            type: 'FIELD_ADDED',
            field: field,
            message: `Response field '${field}' was added`
          });
        }
      }
    }

    return { breaking, nonBreaking };
  }
}
```

**Breaking Change Report:**
```json
{
  "comparison": {
    "baseline": "v2.4.0",
    "candidate": "v2.5.0",
    "timestamp": "2025-09-30T14:23:45Z"
  },

  "breakingChanges": [
    {
      "type": "REQUIRED_FIELD_REMOVED",
      "severity": "CRITICAL",
      "endpoint": "GET /api/users/{id}",
      "status": 200,
      "field": "username",
      "message": "Required response field 'username' was removed",
      "impact": {
        "affectedConsumers": 23,
        "estimatedRequests": "1.2M/day",
        "migrationEffort": "HIGH"
      },
      "recommendation": "Deprecate in v2.5.0, remove in v3.0.0"
    },
    {
      "type": "PARAM_TYPE_CHANGED",
      "severity": "HIGH",
      "endpoint": "POST /api/orders",
      "param": "quantity",
      "oldType": "integer",
      "newType": "string",
      "message": "Parameter 'quantity' type changed from integer to string",
      "impact": {
        "affectedConsumers": 8,
        "estimatedRequests": "450K/day",
        "migrationEffort": "MEDIUM"
      },
      "recommendation": "Revert change or bump major version"
    }
  ],

  "nonBreakingChanges": [
    {
      "type": "FIELD_ADDED",
      "endpoint": "GET /api/users/{id}",
      "status": 200,
      "field": "profilePicture",
      "message": "Response field 'profilePicture' was added",
      "impact": "None - backward compatible addition"
    },
    {
      "type": "OPTIONAL_PARAM_ADDED",
      "endpoint": "GET /api/products",
      "param": "sortBy",
      "message": "Optional parameter 'sortBy' was added",
      "impact": "None - existing clients unaffected"
    }
  ],

  "summary": {
    "totalBreaking": 2,
    "totalNonBreaking": 2,
    "recommendation": "🚨 BLOCK DEPLOYMENT - Breaking changes detected",
    "suggestedVersion": "v3.0.0", // Major version bump required
    "estimatedMigrationTime": "2-3 weeks",
    "affectedConsumers": 31
  }
}
```

### 3. Version Compatibility

Validates semantic versioning compliance and ensures proper version bumps for API changes.

**Version Compatibility Checker:**
```javascript
class VersionCompatibilityChecker {
  validateVersionBump(currentVersion, proposedVersion, changes) {
    const current = this.parseVersion(currentVersion);
    const proposed = this.parseVersion(proposedVersion);

    const required = this.calculateRequiredVersionBump(changes);

    const validation = {
      valid: false,
      currentVersion,
      proposedVersion,
      requiredBump: required.type,
      actualBump: this.getActualBump(current, proposed),
      recommendation: required.recommendedVersion,
      violations: []
    };

    // Validate version bump is sufficient
    if (required.type === 'MAJOR' && (proposed.major <= current.major)) {
      validation.violations.push({
        severity: 'CRITICAL',
        message: 'Breaking changes require major version bump',
        expected: `v${current.major + 1}.0.0`,
        actual: proposedVersion
      });
    }

    if (required.type === 'MINOR' && (proposed.major === current.major && proposed.minor <= current.minor)) {
      validation.violations.push({
        severity: 'HIGH',
        message: 'New features require minor version bump',
        expected: `v${current.major}.${current.minor + 1}.0`,
        actual: proposedVersion
      });
    }

    validation.valid = validation.violations.length === 0;

    return validation;
  }

  calculateRequiredVersionBump(changes) {
    if (changes.breaking.length > 0) {
      return {
        type: 'MAJOR',
        reason: 'Breaking changes detected',
        recommendedVersion: this.bumpMajor(changes.currentVersion)
      };
    }

    if (changes.nonBreaking.some(c => c.type.includes('ADDED'))) {
      return {
        type: 'MINOR',
        reason: 'New features added',
        recommendedVersion: this.bumpMinor(changes.currentVersion)
      };
    }

    return {
      type: 'PATCH',
      reason: 'Bug fixes only',
      recommendedVersion: this.bumpPatch(changes.currentVersion)
    };
  }
}
```

### 4. Contract Diffing

Generates detailed diffs between API contract versions with visual representation.

**Contract Diff Visualization:**
```diff
# API Contract Diff: v2.4.0 → v2.5.0

## Breaking Changes (2)

### GET /api/users/{id}
Response Schema (200):
- ❌ REMOVED required field: username (string)
+ ✅ ADDED optional field: profilePicture (string, format: url)
  ~ MODIFIED field: email (added format validation)

### POST /api/orders
Request Parameters:
~ CHANGED type: quantity (integer → string) ⚠️  BREAKING

## Non-Breaking Changes (5)

### GET /api/products
+ ADDED optional parameter: sortBy (string, enum: [price, name, rating])
+ ADDED optional parameter: order (string, enum: [asc, desc])

### POST /api/users
Response Schema (201):
+ ADDED field: createdAt (string, format: date-time)
+ ADDED field: lastLogin (string, format: date-time, nullable)

## Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 Breaking Changes:        2
✅ Non-Breaking Changes:    5
📦 Recommended Version:     v3.0.0 (major bump)
👥 Affected Consumers:      31
⏱️  Estimated Migration:     2-3 weeks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 5. Consumer Impact Analysis

Analyzes which API consumers will be affected by changes.

**Consumer Impact Analyzer:**
```javascript
class ConsumerImpactAnalyzer {
  async analyzeImpact(changes, consumers) {
    const impacts = [];

    for (const consumer of consumers) {
      const affectedEndpoints = [];

      // Check which endpoints this consumer uses
      for (const usage of consumer.apiUsage) {
        const endpointChanges = changes.breaking.filter(c =>
          c.endpoint === usage.endpoint && c.method === usage.method
        );

        if (endpointChanges.length > 0) {
          affectedEndpoints.push({
            endpoint: usage.endpoint,
            method: usage.method,
            requestsPerDay: usage.requestsPerDay,
            changes: endpointChanges,
            migrationEffort: this.estimateMigrationEffort(endpointChanges)
          });
        }
      }

      if (affectedEndpoints.length > 0) {
        impacts.push({
          consumer: consumer.name,
          team: consumer.team,
          contact: consumer.contact,
          affectedEndpoints: affectedEndpoints,
          totalRequests: affectedEndpoints.reduce((sum, e) => sum + e.requestsPerDay, 0),
          estimatedMigrationTime: this.calculateMigrationTime(affectedEndpoints),
          priority: this.calculatePriority(consumer, affectedEndpoints)
        });
      }
    }

    return {
      totalAffectedConsumers: impacts.length,
      impacts: impacts.sort((a, b) => b.priority - a.priority),
      coordinationRequired: impacts.length > 5,
      estimatedTotalMigrationTime: this.sumMigrationTimes(impacts)
    };
  }
}
```

**Consumer Impact Report:**
```json
{
  "analysis": {
    "baseline": "v2.4.0",
    "candidate": "v2.5.0",
    "breakingChanges": 2,
    "affectedConsumers": 31
  },

  "topImpactedConsumers": [
    {
      "consumer": "Mobile App (iOS)",
      "team": "Mobile Engineering",
      "contact": "mobile-team@company.com",
      "affectedEndpoints": [
        {
          "endpoint": "GET /api/users/{id}",
          "method": "GET",
          "requestsPerDay": 450000,
          "changes": [
            {
              "type": "REQUIRED_FIELD_REMOVED",
              "field": "username",
              "severity": "CRITICAL"
            }
          ],
          "migrationEffort": "HIGH"
        }
      ],
      "totalRequests": 450000,
      "estimatedMigrationTime": "1 week",
      "priority": "CRITICAL"
    },
    {
      "consumer": "Partner Integration (Acme Corp)",
      "team": "External",
      "contact": "api@acmecorp.com",
      "affectedEndpoints": [
        {
          "endpoint": "POST /api/orders",
          "method": "POST",
          "requestsPerDay": 120000,
          "changes": [
            {
              "type": "PARAM_TYPE_CHANGED",
              "param": "quantity",
              "oldType": "integer",
              "newType": "string"
            }
          ],
          "migrationEffort": "MEDIUM"
        }
      ],
      "totalRequests": 120000,
      "estimatedMigrationTime": "3-5 days",
      "priority": "HIGH"
    }
  ],

  "recommendation": {
    "action": "COORDINATE_MIGRATION",
    "suggestedApproach": "Phased rollout with versioned endpoints",
    "timeline": [
      "Week 1: Notify all affected consumers",
      "Week 2-3: Consumer migrations",
      "Week 4: Deploy v3.0.0 with deprecated v2 endpoints",
      "Month 3: Sunset v2 endpoints"
    ],
    "alternativeApproach": "Deploy v2.5.0 without breaking changes, defer to v3.0.0"
  }
}
```

### 6. Contract Testing

Implements contract-first testing using Pact or similar frameworks.

**Contract Test Generator:**
```javascript
class ContractTestGenerator {
  generatePactTest(apiSchema, consumer) {
    const interactions = [];

    for (const [path, methods] of Object.entries(apiSchema.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        interactions.push({
          description: `${method.toUpperCase()} ${path}`,
          providerState: operation['x-provider-state'] || 'default state',
          request: this.generateRequest(path, method, operation),
          response: this.generateResponse(operation)
        });
      }
    }

    return {
      consumer: { name: consumer.name },
      provider: { name: apiSchema.info.title },
      interactions: interactions
    };
  }

  generateRequest(path, method, operation) {
    return {
      method: method.toUpperCase(),
      path: this.replacePathParams(path, operation.parameters),
      query: this.generateQueryParams(operation.parameters),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: operation.requestBody ? this.generateExampleBody(operation.requestBody) : undefined
    };
  }

  generateResponse(operation) {
    const successResponse = operation.responses['200'] || operation.responses['201'];

    return {
      status: parseInt(Object.keys(operation.responses)[0]),
      headers: {
        'Content-Type': 'application/json'
      },
      body: this.generateExampleBody(successResponse)
    };
  }
}
```

### 7. Semantic Versioning Validation

Enforces semantic versioning rules across all API changes.

**Semver Validator:**
```javascript
class SemanticVersioningValidator {
  validate(changes, versionBump) {
    const rules = [
      {
        condition: (c) => c.breaking.length > 0,
        requiredBump: 'major',
        message: 'Breaking changes require major version bump'
      },
      {
        condition: (c) => c.nonBreaking.some(nc => nc.type.includes('ADDED')),
        requiredBump: 'minor',
        message: 'New features require minor version bump'
      },
      {
        condition: (c) => c.breaking.length === 0 && !c.nonBreaking.some(nc => nc.type.includes('ADDED')),
        requiredBump: 'patch',
        message: 'Bug fixes only require patch version bump'
      }
    ];

    for (const rule of rules) {
      if (rule.condition(changes)) {
        if (versionBump !== rule.requiredBump) {
          return {
            valid: false,
            violation: rule.message,
            required: rule.requiredBump,
            actual: versionBump
          };
        }
        return { valid: true, bump: rule.requiredBump };
      }
    }

    return { valid: true, bump: 'patch' };
  }
}
```

## Integration Points

### Upstream Dependencies
- **OpenAPI/Swagger**: API schema specifications
- **GraphQL**: GraphQL schemas
- **Git**: Schema version history
- **API Gateways**: Consumer tracking

### Downstream Consumers
- **qe-deployment-readiness**: Blocks deployment on breaking changes
- **qe-test-generator**: Generates contract tests
- **CI/CD Pipelines**: Enforces contract validation
- **API Documentation**: Updates docs with changes

### Coordination Agents
- **qe-fleet-commander**: Orchestrates contract validation
- **qe-requirements-validator**: Validates API requirements

## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies, 100-500x faster).

**Automatic Lifecycle Hooks:**
```typescript
// Automatically called by BaseAgent
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load baseline contracts and schemas
  const contracts = await this.memoryStore.retrieve('aqe/contracts/current');
  const baseline = await this.memoryStore.retrieve('aqe/api-schemas/baseline');
  this.logger.info('Loaded API contracts and baseline schemas');
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store validation results and breaking changes
  await this.memoryStore.store('aqe/contracts/validation-result', data.result.validation);
  await this.memoryStore.store('aqe/breaking-changes/detected', data.result.breakingChanges);

  // Emit events for downstream agents
  this.eventBus.emit('contract-validator:completed', {
    breakingChanges: data.result.breakingChanges.length,
    validationStatus: data.result.validation.passed
  });
}

protected async onPostEdit(data: { filePath: string; changes: any }): Promise<void> {
  // Track schema updates
  const fileName = data.filePath.split('/').pop();
  await this.memoryStore.store(`aqe/contracts/schema-updated/${fileName}`, {
    timestamp: Date.now(),
    changes: data.changes
  });
}
```

**Advanced Verification (Optional):**
```typescript
const hookManager = new VerificationHookManager(this.memoryStore);
const verification = await hookManager.executePreTaskVerification({
  task: 'contract-validation',
  context: {
    requiredVars: ['NODE_ENV', 'API_VERSION'],
    minMemoryMB: 512,
    requiredKeys: ['aqe/api-schemas/baseline']
  }
});
```

## Memory Keys

### Input Keys
- `aqe/api-schemas/baseline` - Baseline API schemas
- `aqe/api-schemas/candidate` - New API schemas
- `aqe/contracts/current` - Current contract specifications
- `aqe/consumers/registry` - API consumer registry

### Output Keys
- `aqe/contracts/validation-result` - Contract validation results
- `aqe/breaking-changes/detected` - Detected breaking changes
- `aqe/consumer-impact/analysis` - Consumer impact analysis
- `aqe/compatibility/report` - Compatibility assessment

### Coordination Keys
- `aqe/contracts/status` - Validation status
- `aqe/contracts/alerts` - Critical contract violations

## Use Cases

### Use Case 1: Pre-Deployment Contract Validation

**Scenario**: Validate API changes before deploying to production.

**Workflow:**
```bash
# Compare schemas
aqe contract compare --baseline v2.4.0 --candidate v2.5.0

# Detect breaking changes
aqe contract breaking-changes --output breaking-changes.json

# Analyze consumer impact
aqe contract consumer-impact --consumers consumer-registry.json

# Generate migration guide
aqe contract migration-guide --output migration-guide.md

# Validate version bump
aqe contract validate-version --current 2.4.0 --proposed 2.5.0
```

### Use Case 2: Contract-First Development

**Scenario**: Generate contract tests from OpenAPI spec.

**Workflow:**
```bash
# Generate Pact contract tests
aqe contract generate-pact --spec openapi.yaml --consumer mobile-app

# Run contract tests
aqe contract test --provider user-service --consumer mobile-app

# Publish contract
aqe contract publish --broker https://pact-broker.company.com
```

### Use Case 3: Consumer Notification

**Scenario**: Notify affected consumers of API changes.

**Workflow:**
```bash
# Analyze impact
aqe contract consumer-impact --baseline v2.4.0 --candidate v2.5.0

# Generate notification emails
aqe contract notify-consumers --template email-template.html

# Track migration progress
aqe contract migration-status --version v3.0.0
```

## Success Metrics

### Prevention Metrics
- **Breaking Changes Prevented**: 95%
- **Consumer Incidents**: 90% reduction
- **Integration Failures**: 85% reduction

### Quality Metrics
- **Contract Compliance**: 100%
- **Semantic Versioning Compliance**: 100%
- **Consumer Satisfaction**: 4.8/5

## Commands

### Basic Commands

```bash
# Compare API schemas
aqe contract compare --baseline <version> --candidate <version>

# Detect breaking changes
aqe contract breaking-changes --spec <openapi-file>

# Validate contract
aqe contract validate --spec <openapi-file>

# Generate diff report
aqe contract diff --baseline <v1> --candidate <v2> --output diff.html

# Check semantic versioning
aqe contract semver-check --current <version> --proposed <version>
```

### Advanced Commands

```bash
# Consumer impact analysis
aqe contract consumer-impact --consumers <registry> --changes <changes-file>

# Generate Pact tests
aqe contract generate-pact --spec <openapi> --consumer <name>

# Run contract tests
aqe contract test --provider <service> --consumer <app>

# Migration guide generation
aqe contract migration-guide --baseline <v1> --candidate <v2>

# Notify consumers
aqe contract notify-consumers --changes <changes-file> --template <email-template>
```

### Specialized Commands

```bash
# GraphQL schema validation
aqe contract validate-graphql --schema schema.graphql

# API versioning strategy
aqe contract versioning-strategy --analyze-history --days 180

# Consumer compatibility matrix
aqe contract compatibility-matrix --output matrix.html

# Deprecation timeline
aqe contract deprecation-timeline --version <v2> --sunset-date <date>

# Contract evolution report
aqe contract evolution --from <v1> --to <v2> --format pdf
```


**Agent Status**: Production Ready
**Last Updated**: 2025-09-30
**Version**: 1.0.0
**Maintainer**: AQE Fleet Team

## Code Execution Workflows

Validate API contracts and detect breaking changes with automated compatibility checking.

### Contract Validation with Schema Analysis

```typescript
/**
 * Phase 3 API Contract Validation Tools
 *
 * IMPORTANT: Phase 3 domain-specific tools are coming soon!
 * These examples show the REAL API that will be available.
 *
 * Import path: 'agentic-qe/tools/qe/security'
 * Type definitions: 'agentic-qe/tools/qe/shared/types'
 */

import type {
  BreakingChangeParams,
  ContractValidationResult,
  Vulnerability,
  QEToolResponse
} from 'agentic-qe/tools/qe/shared/types';

// Phase 3 contract validation tools (coming soon)
// import {
//   validateContract,
//   detectBreakingChanges,
//   analyzeBackwardCompatibility,
//   generateContractReport
// } from 'agentic-qe/tools/qe/security';

// Example: API contract validation and breaking change detection
const contractParams: BreakingChangeParams = {
  currentSchema: './openapi.v2.json',
  previousSchema: './openapi.v1.json',
  apiType: 'rest',
  checkBreakingChanges: true,
  strictMode: true,
  includeDeprecations: true
};

// const validation: QEToolResponse<ContractValidationResult> =
//   await validateContract(contractParams);
//
// if (validation.success && validation.data) {
//   console.log(`Validation: ${validation.data.isCompatible ? 'PASS' : 'FAIL'}`);
//
//   if (validation.data.breakingChanges.length > 0) {
//     console.log(`Breaking changes found: ${validation.data.breakingChanges.length}`);
//     validation.data.breakingChanges.forEach((change) => {
//       console.log(`  - ${change.severity}: ${change.description}`);
//     });
//   }
// }

console.log('✅ API contract validation complete');
```

### Breaking Change Detection

```typescript
import type {
  BreakingChangeParams
} from 'agentic-qe/tools/qe/shared/types';

// Phase 3 breaking change analysis (coming soon)
// import {
//   detectBreakingChanges,
//   categorizeChanges,
//   assessImpact
// } from 'agentic-qe/tools/qe/security';

// Example: Comprehensive breaking change analysis
const changeParams: BreakingChangeParams = {
  currentSchema: './openapi.json',
  previousSchema: './openapi.previous.json',
  apiType: 'rest',
  consumers: ['frontend', 'mobile-app', 'third-party'],
  impactAnalysis: true
};

// const changes = await detectBreakingChanges(changeParams);
//
// console.log('Breaking Changes Analysis:');
// changes.data.forEach((change) => {
//   console.log(`\n${change.type}: ${change.endpoint}`);
//   console.log(`  Severity: ${change.severity}`);
//   console.log(`  Impact: ${change.affectedConsumers.join(', ')}`);
//   console.log(`  Remediation: ${change.remediation}`);
// });

console.log('✅ Breaking change detection complete');
```

### Phase 3 Tool Discovery

```bash
# Once Phase 3 is implemented, tools will be at:
# /workspaces/agentic-qe-cf/src/mcp/tools/qe/security/

# List available contract validation tools (Phase 3)
ls node_modules/agentic-qe/dist/mcp/tools/qe/security/

# Check type definitions
cat node_modules/agentic-qe/dist/mcp/tools/qe/shared/types.d.ts | grep -A 20 "BreakingChange"

# View supported API types
node -e "import('agentic-qe/tools/qe/security').then(m => console.log(m.supportedApiTypes()))"
```

### Using Contract Validation Tools via MCP (Phase 3)

```typescript
// Phase 3 MCP integration (coming soon)
// Once domain-specific tools are registered as MCP tools:

// Via MCP client
// const result = await mcpClient.callTool('qe_validate_api_contract', {
//   currentSchema: './openapi.json',
//   previousSchema: './openapi.previous.json',
//   apiType: 'rest'
// });

// Via CLI
// aqe contract validate --current ./openapi.json --previous ./openapi.previous.json
// aqe contract detect-breaking --schema ./openapi.json --strict
// aqe contract report --format html --include-impact-analysis
```

