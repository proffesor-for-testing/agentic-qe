# GOAP Plan: Security Hardening Implementation

**Issue Reference**: #146
**Created**: 2026-01-05
**Version**: v2.8.1 baseline
**Priority**: P1 (SP-1), P2 (SP-2, SP-3)

---

## Goal State

```yaml
goal:
  name: "Security Hardened Agent Execution"
  conditions:
    - docker_sandboxing_enabled: true
    - embedding_cache_multi_backend: true
    - network_policies_enforced: true
    - audit_logging_enabled: true
    - soc2_compliance_ready: true
```

## Current State Analysis

```yaml
current_state:
  sp1_docker_sandboxing:
    sandbox_manager: false
    cgroups_enforcement: false
    agent_resource_profiles: false
    completion: 0%

  sp2_embedding_cache:
    basic_cache: true
    lru_eviction: true
    content_hashing: true
    memory_backend: true
    redis_backend: false
    sqlite_backend: false
    auto_ttl_pruning: false
    completion: 60%

  sp3_network_policy:
    basic_rate_limiting: true
    token_bucket: true
    burst_support: true
    agent_type_policies: false
    domain_whitelisting: false
    audit_logging: false
    completion: 40%
```

---

## Phase 1: SP-1 Docker-Based Agent Sandboxing (P1)

### Milestone 1.1: SandboxManager Core
**Estimated Effort**: Medium
**Dependencies**: Docker SDK

#### Actions

1. **Create sandbox infrastructure directory**
   ```
   src/infrastructure/
   ├── sandbox/
   │   ├── index.ts
   │   ├── SandboxManager.ts
   │   ├── ResourceMonitor.ts
   │   ├── types.ts
   │   └── profiles/
   │       └── agent-profiles.ts
   ```

2. **Implement SandboxManager class**
   ```typescript
   // src/infrastructure/sandbox/SandboxManager.ts
   import Docker from 'dockerode';

   export interface SandboxConfig {
     cpuLimit: number;        // CPU cores (e.g., 2)
     memoryLimit: string;     // Memory limit (e.g., "2g")
     memorySwapLimit: string; // Swap limit (e.g., "2g")
     diskLimit: string;       // Disk quota (e.g., "512m")
     networkMode: 'isolated' | 'whitelisted' | 'host';
     allowedDomains?: string[];
     readOnlyRootFs: boolean;
     user: string;            // Non-root user
     seccompProfile?: string;
   }

   export interface ContainerInfo {
     containerId: string;
     agentId: string;
     status: 'creating' | 'running' | 'stopped' | 'error';
     createdAt: Date;
     resourceUsage?: ResourceStats;
   }

   export interface ResourceStats {
     cpuPercent: number;
     memoryUsageMB: number;
     memoryLimitMB: number;
     diskUsageMB: number;
     networkRxBytes: number;
     networkTxBytes: number;
   }

   export class SandboxManager {
     private docker: Docker;
     private containers: Map<string, ContainerInfo>;

     constructor(dockerOptions?: Docker.DockerOptions);

     async createSandbox(
       agentId: string,
       agentType: string,
       config?: Partial<SandboxConfig>
     ): Promise<ContainerInfo>;

     async destroySandbox(containerId: string): Promise<void>;

     async getResourceUsage(containerId: string): Promise<ResourceStats>;

     async listSandboxes(): Promise<ContainerInfo[]>;

     async healthCheck(containerId: string): Promise<boolean>;
   }
   ```

3. **Define agent resource profiles**
   ```typescript
   // src/infrastructure/sandbox/profiles/agent-profiles.ts
   export const AGENT_PROFILES: Record<string, SandboxConfig> = {
     'qe-test-generator': {
       cpuLimit: 2,
       memoryLimit: '2g',
       memorySwapLimit: '2g',
       diskLimit: '512m',
       networkMode: 'whitelisted',
       allowedDomains: ['api.anthropic.com', 'registry.npmjs.org'],
       readOnlyRootFs: true,
       user: 'node'
     },
     'qe-coverage-analyzer': {
       cpuLimit: 1,
       memoryLimit: '1g',
       memorySwapLimit: '1g',
       diskLimit: '256m',
       networkMode: 'whitelisted',
       allowedDomains: ['api.anthropic.com'],
       readOnlyRootFs: true,
       user: 'node'
     },
     'qe-security-scanner': {
       cpuLimit: 2,
       memoryLimit: '4g',
       memorySwapLimit: '4g',
       diskLimit: '1g',
       networkMode: 'whitelisted',
       allowedDomains: ['api.anthropic.com', 'nvd.nist.gov', 'cve.mitre.org'],
       readOnlyRootFs: true,
       user: 'node'
     },
     'default': {
       cpuLimit: 1,
       memoryLimit: '512m',
       memorySwapLimit: '512m',
       diskLimit: '128m',
       networkMode: 'isolated',
       readOnlyRootFs: true,
       user: 'node'
     }
   };
   ```

#### Success Criteria
- [ ] `SandboxManager` class with full CRUD operations
- [ ] Docker SDK integration working
- [ ] Agent profiles defined for all 21+ QE agents
- [ ] Unit tests with 80%+ coverage

### Milestone 1.2: Agent Dockerfile
**Estimated Effort**: Small

#### Actions

1. **Create secure agent Dockerfile**
   ```dockerfile
   # infrastructure/docker/agent.Dockerfile
   FROM node:20-alpine AS base

   # Security: Create non-root user
   RUN addgroup -g 1001 -S agentgroup && \
       adduser -u 1001 -S agent -G agentgroup

   # Security: Remove unnecessary packages
   RUN apk del --purge apk-tools && \
       rm -rf /var/cache/apk/*

   WORKDIR /app

   # Copy only necessary files
   COPY --chown=agent:agentgroup package*.json ./
   COPY --chown=agent:agentgroup dist/ ./dist/

   # Install production dependencies only
   RUN npm ci --only=production && \
       npm cache clean --force

   # Security: Switch to non-root user
   USER agent

   # Security: Read-only root filesystem compatible
   ENV NODE_ENV=production
   ENV HOME=/app

   # Health check
   HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
     CMD node -e "process.exit(0)" || exit 1

   ENTRYPOINT ["node", "dist/agent-runner.js"]
   ```

2. **Create docker-compose for development**
   ```yaml
   # infrastructure/docker/docker-compose.sandbox.yml
   version: '3.8'

   services:
     agent-sandbox:
       build:
         context: ../..
         dockerfile: infrastructure/docker/agent.Dockerfile
       deploy:
         resources:
           limits:
             cpus: '2'
             memory: 2G
           reservations:
             cpus: '0.5'
             memory: 256M
       read_only: true
       tmpfs:
         - /tmp:size=100M
       security_opt:
         - no-new-privileges:true
       cap_drop:
         - ALL
       networks:
         - sandbox-net

   networks:
     sandbox-net:
       driver: bridge
       internal: true
   ```

#### Success Criteria
- [ ] Dockerfile passes security scan (Trivy/Snyk)
- [ ] Container runs as non-root user
- [ ] Read-only filesystem works
- [ ] Resource limits enforced via `docker stats`

### Milestone 1.3: Integration with Agent Lifecycle
**Estimated Effort**: Medium

#### Actions

1. **Extend BaseAgent with sandbox support**
   ```typescript
   // Add to src/agents/BaseAgent.ts
   export interface AgentExecutionOptions {
     sandboxed?: boolean;
     sandboxConfig?: Partial<SandboxConfig>;
   }

   abstract class BaseAgent {
     protected sandboxManager?: SandboxManager;
     protected containerId?: string;

     async executeInSandbox<T>(
       task: () => Promise<T>,
       options?: AgentExecutionOptions
     ): Promise<T>;
   }
   ```

2. **Add CLI command for sandbox management**
   ```bash
   aqe sandbox list              # List running sandboxes
   aqe sandbox stats <id>        # Get resource usage
   aqe sandbox stop <id>         # Stop sandbox
   aqe sandbox logs <id>         # View sandbox logs
   ```

#### Success Criteria
- [ ] Agents can opt-in to sandbox execution
- [ ] CLI commands functional
- [ ] Zero OOM crashes under load test
- [ ] SOC2 audit checklist items satisfied

---

## Phase 2: SP-2 Embedding Cache Completion (P2)

### Milestone 2.1: Storage Backend Abstraction
**Estimated Effort**: Small

#### Actions

1. **Create storage backend interface**
   ```typescript
   // src/code-intelligence/embeddings/backends/types.ts
   export interface EmbeddingStorageBackend {
     name: string;

     get(key: string): Promise<EmbeddingCacheEntry | null>;
     set(key: string, entry: EmbeddingCacheEntry): Promise<void>;
     has(key: string): Promise<boolean>;
     delete(key: string): Promise<boolean>;
     clear(): Promise<void>;

     size(): Promise<number>;
     keys(): AsyncIterable<string>;

     // TTL support
     pruneExpired(maxAgeMs: number): Promise<number>;

     // Lifecycle
     initialize(): Promise<void>;
     close(): Promise<void>;
   }
   ```

2. **Refactor existing memory backend**
   ```typescript
   // src/code-intelligence/embeddings/backends/MemoryBackend.ts
   export class MemoryStorageBackend implements EmbeddingStorageBackend {
     name = 'memory';
     private cache: Map<string, EmbeddingCacheEntry>;
     // ... implement interface
   }
   ```

#### Success Criteria
- [ ] Backend interface defined
- [ ] Memory backend refactored to interface
- [ ] Existing tests pass

### Milestone 2.2: Redis Backend
**Estimated Effort**: Medium

#### Actions

1. **Implement Redis storage backend**
   ```typescript
   // src/code-intelligence/embeddings/backends/RedisBackend.ts
   import { Redis } from 'ioredis';

   export interface RedisBackendConfig {
     host: string;
     port: number;
     password?: string;
     db?: number;
     keyPrefix?: string;
     ttlSeconds?: number;
   }

   export class RedisStorageBackend implements EmbeddingStorageBackend {
     name = 'redis';
     private client: Redis;
     private config: RedisBackendConfig;

     constructor(config: RedisBackendConfig);

     async get(key: string): Promise<EmbeddingCacheEntry | null> {
       const data = await this.client.get(this.prefixKey(key));
       return data ? JSON.parse(data) : null;
     }

     async set(key: string, entry: EmbeddingCacheEntry): Promise<void> {
       const ttl = this.config.ttlSeconds || 86400; // 24h default
       await this.client.setex(
         this.prefixKey(key),
         ttl,
         JSON.stringify(entry)
       );
     }

     async pruneExpired(): Promise<number> {
       // Redis handles TTL automatically
       return 0;
     }
   }
   ```

#### Success Criteria
- [ ] Redis backend passes all interface tests
- [ ] TTL expiration working (24h default)
- [ ] Connection pooling configured
- [ ] Graceful degradation on Redis unavailability

### Milestone 2.3: SQLite Backend
**Estimated Effort**: Medium

#### Actions

1. **Implement SQLite storage backend**
   ```typescript
   // src/code-intelligence/embeddings/backends/SQLiteBackend.ts
   import Database from 'better-sqlite3';

   export interface SQLiteBackendConfig {
     dbPath: string;
     tableName?: string;
     ttlMs?: number;
   }

   export class SQLiteStorageBackend implements EmbeddingStorageBackend {
     name = 'sqlite';
     private db: Database.Database;

     async initialize(): Promise<void> {
       this.db.exec(`
         CREATE TABLE IF NOT EXISTS embedding_cache (
           key TEXT PRIMARY KEY,
           embedding BLOB NOT NULL,
           model TEXT NOT NULL,
           timestamp INTEGER NOT NULL,
           expires_at INTEGER
         );
         CREATE INDEX IF NOT EXISTS idx_expires ON embedding_cache(expires_at);
       `);
     }

     async pruneExpired(maxAgeMs: number): Promise<number> {
       const threshold = Date.now() - maxAgeMs;
       const result = this.db.prepare(
         'DELETE FROM embedding_cache WHERE timestamp < ?'
       ).run(threshold);
       return result.changes;
     }
   }
   ```

#### Success Criteria
- [ ] SQLite backend passes all interface tests
- [ ] Efficient binary storage for embeddings
- [ ] Automatic pruning working
- [ ] WAL mode for concurrent access

### Milestone 2.4: Cache Factory & Auto-Pruning
**Estimated Effort**: Small

#### Actions

1. **Create cache factory**
   ```typescript
   // src/code-intelligence/embeddings/EmbeddingCacheFactory.ts
   export type BackendType = 'memory' | 'redis' | 'sqlite';

   export interface CacheConfig {
     backend: BackendType;
     maxSize: number;
     ttlMs: number;           // Default: 86400000 (24h)
     autoPruneIntervalMs: number;
     // Backend-specific config
     redis?: RedisBackendConfig;
     sqlite?: SQLiteBackendConfig;
   }

   export function createEmbeddingCache(config: CacheConfig): EmbeddingCache {
     const backend = createBackend(config);
     return new EmbeddingCache(backend, config);
   }
   ```

2. **Add auto-pruning scheduler**
   ```typescript
   // In EmbeddingCache
   private startAutoPrune(intervalMs: number): void {
     this.pruneInterval = setInterval(async () => {
       const pruned = await this.backend.pruneExpired(this.config.ttlMs);
       if (pruned > 0) {
         console.log(`[EmbeddingCache] Pruned ${pruned} expired entries`);
       }
     }, intervalMs);
   }
   ```

#### Success Criteria
- [ ] Factory creates correct backend based on config
- [ ] Auto-pruning runs on schedule
- [ ] 24h TTL default applied
- [ ] Memory usage stays under 100MB for 10K embeddings

---

## Phase 3: SP-3 Network Policy Enforcement (P2)

### Milestone 3.1: NetworkPolicyManager Core
**Estimated Effort**: Medium

#### Actions

1. **Create network policy infrastructure**
   ```
   src/infrastructure/network/
   ├── index.ts
   ├── NetworkPolicyManager.ts
   ├── DomainWhitelist.ts
   ├── AgentRateLimiter.ts
   ├── AuditLogger.ts
   └── types.ts
   ```

2. **Implement NetworkPolicyManager**
   ```typescript
   // src/infrastructure/network/NetworkPolicyManager.ts
   export interface NetworkPolicy {
     agentType: string;
     allowedDomains: string[];
     rateLimit: {
       requestsPerMinute: number;
       requestsPerHour: number;
       burstSize: number;
     };
     auditLogging: boolean;
     blockUnknownDomains: boolean;
   }

   export class NetworkPolicyManager {
     private policies: Map<string, NetworkPolicy>;
     private rateLimiters: Map<string, AgentRateLimiter>;
     private auditLogger: AuditLogger;

     constructor(config: NetworkPolicyConfig);

     async checkRequest(
       agentId: string,
       agentType: string,
       domain: string
     ): Promise<PolicyCheckResult>;

     async recordRequest(
       agentId: string,
       domain: string,
       allowed: boolean,
       responseTime?: number
     ): Promise<void>;

     getPolicy(agentType: string): NetworkPolicy;

     updatePolicy(agentType: string, policy: Partial<NetworkPolicy>): void;
   }
   ```

3. **Define default policies**
   ```typescript
   // src/infrastructure/network/policies/default-policies.ts
   export const DEFAULT_NETWORK_POLICIES: Record<string, NetworkPolicy> = {
     'qe-test-generator': {
       agentType: 'qe-test-generator',
       allowedDomains: [
         'api.anthropic.com',
         'registry.npmjs.org',
         'api.github.com'
       ],
       rateLimit: {
         requestsPerMinute: 60,
         requestsPerHour: 1000,
         burstSize: 10
       },
       auditLogging: true,
       blockUnknownDomains: true
     },
     'qe-coverage-analyzer': {
       agentType: 'qe-coverage-analyzer',
       allowedDomains: ['api.anthropic.com'],
       rateLimit: {
         requestsPerMinute: 30,
         requestsPerHour: 500,
         burstSize: 5
       },
       auditLogging: true,
       blockUnknownDomains: true
     },
     'qe-security-scanner': {
       agentType: 'qe-security-scanner',
       allowedDomains: [
         'api.anthropic.com',
         'nvd.nist.gov',
         'cve.mitre.org',
         'osv.dev'
       ],
       rateLimit: {
         requestsPerMinute: 120,
         requestsPerHour: 2000,
         burstSize: 20
       },
       auditLogging: true,
       blockUnknownDomains: true
     },
     'default': {
       agentType: 'default',
       allowedDomains: ['api.anthropic.com'],
       rateLimit: {
         requestsPerMinute: 10,
         requestsPerHour: 100,
         burstSize: 3
       },
       auditLogging: true,
       blockUnknownDomains: true
     }
   };
   ```

#### Success Criteria
- [ ] NetworkPolicyManager with full policy CRUD
- [ ] Policies defined for all agent types
- [ ] Policy lookup by agent type working

### Milestone 3.2: Domain Whitelist Enforcement
**Estimated Effort**: Medium

#### Actions

1. **Implement DomainWhitelist**
   ```typescript
   // src/infrastructure/network/DomainWhitelist.ts
   export class DomainWhitelist {
     private allowedDomains: Set<string>;
     private wildcardPatterns: RegExp[];

     constructor(domains: string[]);

     isAllowed(domain: string): boolean {
       // Check exact match
       if (this.allowedDomains.has(domain)) return true;

       // Check wildcard patterns (*.example.com)
       return this.wildcardPatterns.some(p => p.test(domain));
     }

     addDomain(domain: string): void;
     removeDomain(domain: string): void;
     listDomains(): string[];
   }
   ```

2. **Create HTTP interceptor**
   ```typescript
   // src/infrastructure/network/HttpInterceptor.ts
   import { Agent } from 'http';

   export function createPolicyEnforcingAgent(
     policy: NetworkPolicy,
     auditLogger: AuditLogger
   ): Agent {
     // Intercept all HTTP requests and enforce policy
   }
   ```

#### Success Criteria
- [ ] Domain whitelist blocks unauthorized domains
- [ ] Wildcard patterns supported (*.anthropic.com)
- [ ] HTTP interceptor integrated with agents

### Milestone 3.3: Audit Logging
**Estimated Effort**: Small

#### Actions

1. **Implement AuditLogger**
   ```typescript
   // src/infrastructure/network/AuditLogger.ts
   export interface AuditEntry {
     timestamp: Date;
     agentId: string;
     agentType: string;
     domain: string;
     action: 'allowed' | 'blocked' | 'rate_limited';
     reason?: string;
     requestMethod?: string;
     requestPath?: string;
     responseTime?: number;
     metadata?: Record<string, unknown>;
   }

   export class AuditLogger {
     private entries: AuditEntry[];
     private maxEntries: number;
     private persistenceProvider?: IPersistenceProvider;

     async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void>;

     async query(filter: AuditQueryFilter): Promise<AuditEntry[]>;

     async exportToJson(filepath: string): Promise<void>;

     async getStats(since: Date): Promise<AuditStats>;
   }
   ```

2. **Add CLI commands**
   ```bash
   aqe audit list --since 1h        # List recent audit entries
   aqe audit stats                  # Show audit statistics
   aqe audit export --format json   # Export audit log
   ```

#### Success Criteria
- [ ] All network requests logged
- [ ] Audit entries include: timestamp, agent, domain, action
- [ ] CLI commands functional
- [ ] Audit log queryable and exportable

### Milestone 3.4: Integration with P2P Protocol
**Estimated Effort**: Small

#### Actions

1. **Extend ProtocolHandler rate limiter**
   ```typescript
   // Extend src/edge/p2p/protocol/ProtocolHandler.ts
   export interface AgentAwareRateLimitConfig extends RateLimitConfig {
     agentType?: string;
     policyOverrides?: Partial<NetworkPolicy>;
   }
   ```

2. **Wire up to BaseAgent**
   ```typescript
   // Add to BaseAgent
   protected networkPolicy?: NetworkPolicyManager;

   protected async makeNetworkRequest(
     url: string,
     options: RequestInit
   ): Promise<Response> {
     const domain = new URL(url).hostname;
     const check = await this.networkPolicy?.checkRequest(
       this.agentId,
       this.agentType,
       domain
     );

     if (!check?.allowed) {
       throw new NetworkPolicyError(check.reason);
     }

     return fetch(url, options);
   }
   ```

#### Success Criteria
- [ ] Network policy enforced on all agent HTTP requests
- [ ] Rate limiting per agent type working
- [ ] Blocked requests throw clear errors
- [ ] No regression in existing functionality

---

## Testing Strategy

### Unit Tests
```
tests/unit/infrastructure/sandbox/
├── SandboxManager.test.ts
├── ResourceMonitor.test.ts
└── agent-profiles.test.ts

tests/unit/code-intelligence/embeddings/backends/
├── MemoryBackend.test.ts
├── RedisBackend.test.ts
└── SQLiteBackend.test.ts

tests/unit/infrastructure/network/
├── NetworkPolicyManager.test.ts
├── DomainWhitelist.test.ts
├── AgentRateLimiter.test.ts
└── AuditLogger.test.ts
```

### Integration Tests
```
tests/integration/security/
├── sandbox-lifecycle.test.ts
├── embedding-cache-backends.test.ts
└── network-policy-enforcement.test.ts
```

### Load Tests
```
tests/performance/security/
├── sandbox-resource-limits.test.ts
├── embedding-cache-throughput.test.ts
└── rate-limiter-accuracy.test.ts
```

---

## Rollout Plan

### Phase 1: Development (SP-1)
1. Implement SandboxManager
2. Create agent Dockerfile
3. Unit tests + integration tests
4. Documentation

### Phase 2: Development (SP-2)
1. Storage backend abstraction
2. Redis + SQLite backends
3. Auto-pruning scheduler
4. Tests + benchmarks

### Phase 3: Development (SP-3)
1. NetworkPolicyManager
2. Domain whitelist
3. Audit logging
4. BaseAgent integration

### Phase 4: Staging Validation
1. Deploy to staging environment
2. Run full test suite
3. Performance benchmarks
4. Security audit

### Phase 5: Production Rollout
1. Feature flag enabled for opt-in
2. Monitor metrics for 1 week
3. Gradual rollout to all agents
4. Remove feature flag

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| OOM crashes | 0 | Docker stats monitoring |
| Process isolation | 100% | Security audit |
| Cache hit rate | 80-90% | EmbeddingCache.getStats() |
| Cache latency improvement | 10x (500ms→50ms) | Benchmark |
| Network audit coverage | 100% | AuditLogger.getStats() |
| Unauthorized requests blocked | 100% | Audit log analysis |
| Rate limit accuracy | 99%+ | Load test verification |

---

## Dependencies

### New npm packages
```json
{
  "dockerode": "^4.0.0",
  "ioredis": "^5.3.0",
  "better-sqlite3": "^9.0.0"
}
```

### Infrastructure
- Docker daemon access (for SP-1)
- Redis server (optional, for SP-2)
- SQLite support (built-in, for SP-2)

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker not available | SP-1 blocked | Graceful fallback to non-sandboxed |
| Redis connection failure | Cache degraded | Fallback to memory backend |
| Performance overhead | Slower agents | Benchmark and optimize |
| Breaking changes | Regression | Feature flags + gradual rollout |

---

**Document Version**: 1.0
**Last Updated**: 2026-01-05
**Author**: Claude Code Analysis
