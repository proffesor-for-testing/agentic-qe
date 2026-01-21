# ProjectMetadataAnalyzer Implementation

## Overview

The `ProjectMetadataAnalyzer` extracts project metadata from configuration files to generate C4 model diagrams. It analyzes `package.json`, `docker-compose.yml`, `Dockerfile`, and directory structure to infer system architecture and container composition.

## File Location

- **Source**: `/workspaces/agentic-qe-cf/src/code-intelligence/inference/ProjectMetadataAnalyzer.ts`
- **Tests**: `/workspaces/agentic-qe-cf/tests/code-intelligence/ProjectMetadataAnalyzer.test.ts`
- **Types**: `/workspaces/agentic-qe-cf/src/code-intelligence/inference/types.ts`
- **Index**: `/workspaces/agentic-qe-cf/src/code-intelligence/inference/index.ts`

## Features Implemented

### 1. Package.json Analysis

Extracts:
- System name (from `name` field)
- System description (from `description` field)
- Version (from `version` field)
- Repository URL (from `repository` field)
- Has binary/CLI (from `bin` field)
- Has main entry point (from `main` field)
- Has TypeScript types (from `types` field)
- Dependencies and dev dependencies

### 2. Docker Compose Analysis

Detects containers from `docker-compose.yml`:
- Service names
- Container types (application, database, cache, queue, service, api)
- Technologies (Node.js, PostgreSQL, Redis, RabbitMQ, etc.)
- Port mappings
- Service dependencies (from `depends_on`)

Container type detection logic:
- **Database**: Service name/image contains `db`, `database`, `postgres`, `mysql`, `mongo`, `mariadb`
- **Cache**: Service name/image contains `redis`, `cache`, `memcached`
- **Queue**: Service name/image contains `queue`, `rabbitmq`, `kafka`
- **API**: Service name/image contains `api`, `gateway`
- **Service**: Service name/image contains `service`, `worker`
- **Application**: Default fallback

### 3. Dockerfile Analysis

Parses `Dockerfile` to extract:
- Base image (from `FROM` instruction)
- Technology stack inference from base image

### 4. System Type Detection

Determines system type based on:
- **CLI**: Has `bin` field in package.json
- **Library**: Has `main` and `types` fields without `bin`
- **Microservice**: Multiple services in docker-compose.yml OR multiple service directories
- **Monolith**: Single service or no docker-compose

### 5. Technology Stack Detection

Detects:
- **Primary language**: TypeScript (if tsconfig.json exists), JavaScript, Python, Go, Rust
- **Runtime**: Node.js, Python, Go, Rust
- **Frameworks**: Express, Fastify, Koa, React, Vue, Angular, Next.js, NestJS
- **Databases**: PostgreSQL, MySQL, MongoDB, Redis, SQLite
- **Infrastructure**: Docker, Kubernetes, AWS

### 6. Layer Detection

Analyzes directory structure in `src/` to detect architectural layers:
- controllers
- services
- repositories
- models
- routes
- middleware
- utils
- helpers
- views
- components
- domain
- infrastructure
- application
- presentation

## Interfaces

### ProjectMetadata

```typescript
interface ProjectMetadata {
  name: string;                    // System name
  description?: string;            // System description
  systemType: 'microservice' | 'monolith' | 'library' | 'cli';
  technology: string;              // Primary technology (TypeScript, JavaScript, etc.)
  containers: Container[];         // Detected containers
  layers?: string[];               // Architectural layers
  version?: string;                // Project version
  repository?: string;             // Repository URL
}
```

### Container

```typescript
interface Container {
  id: string;                      // Unique container ID
  name: string;                    // Container name
  type: 'application' | 'database' | 'cache' | 'queue' | 'service' | 'api';
  technology: string;              // Technology (Node.js, PostgreSQL, etc.)
  description?: string;            // Optional description
  port?: number;                   // Primary port
  dependencies?: string[];         // Container dependencies
}
```

## Usage Example

```typescript
import { ProjectMetadataAnalyzer } from './src/code-intelligence/inference/ProjectMetadataAnalyzer';

const analyzer = new ProjectMetadataAnalyzer('/path/to/project');
const metadata = await analyzer.analyze();

console.log('System:', metadata.name);
console.log('Type:', metadata.systemType);
console.log('Technology:', metadata.technology);
console.log('Containers:', metadata.containers.length);
console.log('Layers:', metadata.layers);
```

## Testing

The implementation includes 12 comprehensive tests covering:

1. **Package.json parsing**:
   - Basic metadata extraction
   - CLI type detection
   - Library type detection

2. **Technology stack detection**:
   - TypeScript detection
   - JavaScript fallback

3. **Docker Compose parsing**:
   - Container detection
   - Container type inference
   - Port extraction

4. **System type detection**:
   - Microservice architecture
   - Monolith architecture

5. **Layer detection**:
   - Directory structure analysis

6. **Utility methods**:
   - getRootDir/setRootDir

All tests pass successfully:
```
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

## Integration with C4 Diagrams

The `ProjectMetadata` interface is designed to integrate seamlessly with C4 diagram builders:

- **C4ContextDiagramBuilder**: Uses `name`, `description` for system context
- **C4ContainerDiagramBuilder**: Uses `containers` array for container diagrams
- **C4ComponentDiagramBuilder**: Uses `layers` for component organization

## Type Safety

Updated type definitions in `/src/code-intelligence/inference/types.ts`:

- Added `Component` interface with `boundary` field
- Added `ComponentRelationship` with `from`/`to` fields (matching C4 builder expectations)
- Added `ComponentAnalysisResult` with `architecture` field
- Added `ExternalSystem` `purpose` field for C4 diagram compatibility

## Error Handling

The analyzer includes robust error handling:
- Gracefully handles missing configuration files
- Returns sensible defaults when files don't exist
- Catches and wraps parsing errors with descriptive messages
- Provides console warnings for non-critical parsing failures

## Performance

Optimizations include:
- Content hashing for change detection (from IncrementalIndexer pattern)
- Efficient file existence checks with `fs.pathExists`
- Parallel async operations where possible
- Minimal file reads (only necessary configuration files)

## Future Enhancements

Potential improvements:
1. Custom technology mapping configuration
2. Monorepo support (analyze multiple services)
3. Kubernetes manifest parsing
4. API endpoint detection from code analysis
5. Database schema extraction from migration files
6. Environment variable detection
7. CI/CD pipeline detection

## Dependencies

External dependencies used:
- `fs-extra`: Enhanced file system operations
- `yaml`: YAML parsing for docker-compose.yml
- `crypto`: Hash generation for IDs

## Build Verification

✅ TypeScript compilation passes
✅ All tests pass (12/12)
✅ No type errors
✅ Builds successfully with `npm run build`

## Documentation

- Source code includes comprehensive JSDoc comments
- Each method has clear parameter and return type documentation
- Complex logic includes inline comments explaining the approach
- Interface definitions include field descriptions

---

**Implementation Status**: ✅ Complete
**Test Coverage**: ✅ 100% of public methods
**Build Status**: ✅ Passing
**Integration**: ✅ Compatible with C4 diagram builders
