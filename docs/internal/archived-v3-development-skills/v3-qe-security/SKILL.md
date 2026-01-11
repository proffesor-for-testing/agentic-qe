# v3-qe-security

## Purpose
Guide the implementation of security patterns for AQE v3, including secure test data handling, credential management, and security testing integration.

## Activation
- When implementing security-sensitive QE features
- When handling test credentials or secrets
- When adding security scanning to QE workflows
- When implementing secure agent communication

## Security Architecture

### 1. Credential Management for Tests

```typescript
// v3/src/infrastructure/security/TestCredentialManager.ts
import { SecretStore, EncryptionProvider } from '@aqe/security';

export class TestCredentialManager {
  private readonly secretStore: SecretStore;
  private readonly encryption: EncryptionProvider;
  private readonly credentialCache: Map<string, CachedCredential> = new Map();

  constructor(config: CredentialManagerConfig) {
    this.secretStore = new SecretStore(config.secretsPath);
    this.encryption = new EncryptionProvider(config.encryptionKey);
  }

  // Secure credential retrieval for tests
  async getTestCredential(key: string): Promise<TestCredential> {
    // Check cache first
    const cached = this.credentialCache.get(key);
    if (cached && !this.isExpired(cached)) {
      return cached.credential;
    }

    // Retrieve from secure store
    const encrypted = await this.secretStore.get(key);
    const credential = await this.encryption.decrypt(encrypted);

    // Cache with TTL
    this.credentialCache.set(key, {
      credential,
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 min
    });

    // Audit log
    await this.auditLog('credential_access', { key, timestamp: new Date() });

    return credential;
  }

  // Secure credential injection for test environments
  async injectCredentials(env: TestEnvironment): Promise<void> {
    const credentials = await this.getRequiredCredentials(env);

    for (const [key, value] of Object.entries(credentials)) {
      // Never log actual values
      process.env[key] = value;
      this.auditLog('credential_injected', { key, env: env.name });
    }
  }

  // Cleanup after test execution
  async cleanupCredentials(env: TestEnvironment): Promise<void> {
    const keys = await this.getRequiredCredentialKeys(env);
    for (const key of keys) {
      delete process.env[key];
      this.credentialCache.delete(key);
    }
  }
}
```

### 2. Secure Test Data Generation

```typescript
// v3/src/domains/test-generation/services/SecureTestDataGenerator.ts
export class SecureTestDataGenerator {
  private readonly piiDetector: PIIDetector;
  private readonly anonymizer: DataAnonymizer;

  // Generate test data without PII
  async generateSecureTestData(schema: DataSchema): Promise<TestData> {
    const rawData = await this.generateRawData(schema);

    // Detect and anonymize any PII
    const piiFields = await this.piiDetector.detect(rawData);
    if (piiFields.length > 0) {
      return await this.anonymizer.anonymize(rawData, piiFields);
    }

    return rawData;
  }

  // Sanitize production data for testing
  async sanitizeProductionData(data: any): Promise<TestData> {
    const sanitized = await this.anonymizer.deepAnonymize(data, {
      emails: 'faker.email',
      phones: 'faker.phone',
      names: 'faker.name',
      ssn: 'redact',
      creditCards: 'redact',
      addresses: 'faker.address'
    });

    // Verify no PII remains
    const remaining = await this.piiDetector.detect(sanitized);
    if (remaining.length > 0) {
      throw new PIILeakageError(`PII detected after sanitization: ${remaining}`);
    }

    return sanitized;
  }
}
```

### 3. Security Test Integration

```typescript
// v3/src/domains/quality-assessment/services/SecurityTestRunner.ts
export class SecurityTestRunner {
  constructor(
    private readonly scanners: SecurityScanner[],
    private readonly memory: QEAgentDB
  ) {}

  async runSecuritySuite(target: TestTarget): Promise<SecurityReport> {
    const results: SecurityFinding[] = [];

    // Run all security scanners in parallel
    const scanPromises = this.scanners.map(scanner =>
      scanner.scan(target).catch(e => ({
        scanner: scanner.name,
        error: e.message,
        findings: []
      }))
    );

    const scanResults = await Promise.all(scanPromises);

    for (const result of scanResults) {
      results.push(...result.findings);
    }

    // Store findings for pattern learning
    await this.storeFindings(results);

    return {
      target: target.path,
      totalFindings: results.length,
      critical: results.filter(f => f.severity === 'critical'),
      high: results.filter(f => f.severity === 'high'),
      medium: results.filter(f => f.severity === 'medium'),
      low: results.filter(f => f.severity === 'low'),
      scanners: this.scanners.map(s => s.name),
      timestamp: new Date()
    };
  }

  private async storeFindings(findings: SecurityFinding[]): Promise<void> {
    for (const finding of findings) {
      await this.memory.store({
        id: `security:${finding.id}`,
        index: 'defects',
        data: finding,
        embedding: await this.memory.embed(finding.description),
        metadata: {
          type: 'security',
          severity: finding.severity,
          cwe: finding.cweId
        }
      });
    }
  }
}

// Available security scanners
export const SECURITY_SCANNERS = {
  SAST: new SASTScanner(),      // Static analysis
  DAST: new DASTScanner(),      // Dynamic analysis
  SCA: new SCAScanner(),        // Software composition
  SECRETS: new SecretsScanner(), // Secret detection
  CONTAINER: new ContainerScanner() // Container vulnerabilities
};
```

### 4. Secure Agent Communication

```typescript
// v3/src/infrastructure/security/SecureAgentComm.ts
export class SecureAgentCommunication {
  private readonly keyPairs: Map<string, KeyPair> = new Map();

  // Generate agent-specific key pairs
  async initializeAgent(agentId: string): Promise<void> {
    const keyPair = await crypto.generateKeyPair('ed25519');
    this.keyPairs.set(agentId, keyPair);

    // Register public key
    await this.registerPublicKey(agentId, keyPair.publicKey);
  }

  // Sign messages before sending
  async signMessage(
    fromAgent: string,
    message: AgentMessage
  ): Promise<SignedMessage> {
    const keyPair = this.keyPairs.get(fromAgent);
    if (!keyPair) {
      throw new AgentNotInitializedError(fromAgent);
    }

    const payload = JSON.stringify(message);
    const signature = await crypto.sign(keyPair.privateKey, payload);

    return {
      message,
      signature: signature.toString('base64'),
      signer: fromAgent,
      timestamp: Date.now()
    };
  }

  // Verify incoming messages
  async verifyMessage(signed: SignedMessage): Promise<boolean> {
    const publicKey = await this.getPublicKey(signed.signer);
    const payload = JSON.stringify(signed.message);

    return crypto.verify(
      publicKey,
      payload,
      Buffer.from(signed.signature, 'base64')
    );
  }
}
```

### 5. Audit Logging for QE

```typescript
// v3/src/infrastructure/security/QEAuditLogger.ts
export class QEAuditLogger {
  private readonly storage: AuditStorage;
  private readonly encryptor: EncryptionProvider;

  async log(event: AuditEvent): Promise<void> {
    const enriched = {
      ...event,
      timestamp: new Date().toISOString(),
      sessionId: this.getSessionId(),
      agentId: this.getAgentId(),
      environment: process.env.NODE_ENV
    };

    // Encrypt sensitive data
    const encrypted = await this.encryptor.encrypt(
      JSON.stringify(enriched)
    );

    await this.storage.append(encrypted);

    // Alert on critical events
    if (event.severity === 'critical') {
      await this.alertSecurityTeam(enriched);
    }
  }

  // QE-specific audit events
  readonly EVENTS = {
    CREDENTIAL_ACCESS: 'credential_access',
    TEST_DATA_GENERATED: 'test_data_generated',
    SECURITY_SCAN_STARTED: 'security_scan_started',
    SECURITY_FINDING: 'security_finding',
    AGENT_COMMUNICATION: 'agent_communication',
    MEMORY_ACCESS: 'memory_access',
    QUALITY_GATE_EVALUATED: 'quality_gate_evaluated'
  };
}
```

### 6. Security Quality Gate

```typescript
// v3/src/domains/quality-assessment/services/SecurityQualityGate.ts
export class SecurityQualityGate {
  evaluate(report: SecurityReport): SecurityGateResult {
    const criteria = {
      noCritical: report.critical.length === 0,
      noHigh: report.high.length === 0,
      mediumThreshold: report.medium.length <= 5,
      totalThreshold: report.totalFindings <= 20
    };

    const passed = criteria.noCritical &&
                   criteria.noHigh &&
                   criteria.mediumThreshold;

    return {
      passed,
      criteria,
      blockers: [
        ...report.critical.map(f => `CRITICAL: ${f.title}`),
        ...report.high.map(f => `HIGH: ${f.title}`)
      ],
      recommendations: this.generateRecommendations(report)
    };
  }

  private generateRecommendations(report: SecurityReport): string[] {
    const recommendations: string[] = [];

    // Group findings by CWE
    const byCWE = this.groupByCWE(report.totalFindings);

    for (const [cwe, findings] of Object.entries(byCWE)) {
      if (findings.length >= 3) {
        recommendations.push(
          `Multiple ${cwe} vulnerabilities detected. Consider security training on this topic.`
        );
      }
    }

    return recommendations;
  }
}
```

## Security Configuration

```typescript
// v3/src/config/security.config.ts
export const SECURITY_CONFIG = {
  // Credential management
  credentials: {
    secretsPath: '.aqe/secrets',
    encryptionAlgorithm: 'aes-256-gcm',
    keyRotationDays: 90
  },

  // Test data
  testData: {
    anonymizationEnabled: true,
    piiDetectionStrict: true,
    allowedPIIFields: [] // None by default
  },

  // Scanners
  scanners: {
    sast: { enabled: true, severity: 'high' },
    dast: { enabled: true, severity: 'medium' },
    sca: { enabled: true, severity: 'high' },
    secrets: { enabled: true, severity: 'critical' }
  },

  // Audit
  audit: {
    enabled: true,
    retentionDays: 365,
    alertOnCritical: true
  },

  // Agent communication
  agents: {
    signMessages: true,
    verifySignatures: true,
    keyAlgorithm: 'ed25519'
  }
};
```

## Implementation Checklist

- [ ] Implement TestCredentialManager
- [ ] Add SecureTestDataGenerator with PII detection
- [ ] Integrate security scanners (SAST, DAST, SCA)
- [ ] Implement secure agent communication
- [ ] Add QE audit logging
- [ ] Create security quality gate
- [ ] Write security-focused tests
- [ ] Document security best practices

## Related Skills
- v3-qe-core-implementation - Domain entities
- v3-qe-fleet-coordination - Agent security
- v3-qe-mcp - MCP security patterns
