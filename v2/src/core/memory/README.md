# Swarm Memory System - Advanced Features

Enterprise-grade memory management for AI agent coordination with version control, encryption, compression, and integrity validation.

## Quick Start

```typescript
import { EnhancedSwarmMemoryManager } from './memory';

// Initialize
const memory = new EnhancedSwarmMemoryManager('./db/memory.db');
await memory.initialize();

// Store with encryption + compression + versioning
const encryptionKey = memory.encryption.generateKey();
await memory.storeEnhanced('secure-data', { secret: 'value' }, {
  encrypt: true,
  encryptionKey,
  compress: true,
  enableVersioning: true,
  partition: 'sensitive',
  ttl: 3600
});

// Retrieve with validation
const data = await memory.retrieveEnhanced('secure-data', {
  encryptionKey,
  validateChecksum: true,
  partition: 'sensitive'
});

// Get version history
const history = await memory.getHistory('secure-data');

// Rollback if needed
await memory.rollbackToVersion('secure-data', history[2].timestamp);
```

## Features

### ✨ Version History
- Automatic versioning (last 10 versions)
- SHA-256 checksum per version
- Timestamp-based retrieval
- Rollback to any version
- Version comparison

### 🔒 Encryption
- AES-256-GCM authenticated encryption
- Secure 256-bit key generation
- IV management
- Authentication tag validation
- Object encryption helpers

### 📦 Compression
- Gzip and Deflate algorithms
- Automatic compression for large values
- Configurable size threshold (default: 1KB)
- Compression ratio tracking
- Intelligent compression decisions

### ✅ Data Integrity
- SHA-256 checksums
- Automatic validation
- Corruption detection
- Per-version checksums

## API Reference

### EnhancedSwarmMemoryManager

```typescript
class EnhancedSwarmMemoryManager extends SwarmMemoryManager {
  // Core managers
  versionHistory: VersionHistory;
  encryption: EncryptionManager;
  compression: CompressionManager;

  // Enhanced operations
  storeEnhanced(key: string, value: any, options?: EnhancedStoreOptions): Promise<void>;
  retrieveEnhanced(key: string, options?: EnhancedRetrieveOptions): Promise<any>;

  // Version management
  getHistory(key: string, options?: VersionRetrieveOptions): Promise<VersionEntry[]>;
  rollbackToVersion(key: string, timestamp: number): Promise<void>;
  getLatestVersion(key: string): Promise<VersionEntry | null>;

  // Integrity
  validateIntegrity(key: string): Promise<boolean>;

  // Statistics
  getEnhancedStats(): Promise<EnhancedStats>;
}
```

### VersionHistory

```typescript
class VersionHistory {
  // Store version
  store(key: string, value: any, options?: VersionStoreOptions): Promise<number>;

  // Retrieve versions
  getHistory(key: string, options?: VersionRetrieveOptions): Promise<VersionEntry[]>;
  getVersion(key: string, timestamp: number): Promise<VersionEntry | null>;
  getLatest(key: string): Promise<VersionEntry | null>;

  // Operations
  rollback(key: string, timestamp: number): Promise<void>;
  compareVersions(key: string, ts1: number, ts2: number): Promise<ComparisonResult>;
  validateChecksum(key: string, timestamp: number): Promise<boolean>;
  deleteHistory(key: string): Promise<void>;
}
```

### EncryptionManager

```typescript
class EncryptionManager {
  // Key management
  generateKey(): string;
  deriveKeyFromPassword(password: string, salt?: string): string;
  isValidKey(key: string): boolean;

  // Encryption
  encrypt(plaintext: string, key: string, algorithm?: EncryptionAlgorithm): Promise<string>;
  decrypt(ciphertext: string, key: string, algorithm?: EncryptionAlgorithm): Promise<string>;

  // Object helpers
  encryptObject(obj: any, key: string): Promise<string>;
  decryptObject<T>(ciphertext: string, key: string): Promise<T>;

  // Key rotation
  reencrypt(ciphertext: string, oldKey: string, newKey: string): Promise<string>;
}
```

### CompressionManager

```typescript
class CompressionManager {
  // Compression
  compress(data: string, algorithm?: CompressionAlgorithm): Promise<string>;
  decompress(compressedData: string, algorithm?: CompressionAlgorithm): Promise<string>;

  // Decision helpers
  shouldCompress(data: string, threshold?: number): boolean;
  compressIfBeneficial(data: string, minRatio?: number): Promise<CompressResult>;

  // Object helpers
  compressObject(obj: any): Promise<string>;
  decompressObject<T>(compressedData: string): Promise<T>;

  // Analytics
  getCompressionRatio(original: string, compressed: string): number;
  getCompressionStats(data: string): Promise<CompressionMetadata>;

  // Batch operations
  compressBatch(values: string[]): Promise<string[]>;
  decompressBatch(values: string[]): Promise<string[]>;
}
```

## Configuration Options

### EnhancedStoreOptions

```typescript
interface EnhancedStoreOptions extends StoreOptions {
  // Encryption
  encrypt?: boolean;
  encryptionKey?: string;

  // Compression
  compress?: boolean;
  compressionThreshold?: number;  // Default: 1024 (1KB)

  // Versioning
  enableVersioning?: boolean;

  // Access control (from base)
  owner?: string;
  accessLevel?: AccessLevel;
  teamId?: string;
  swarmId?: string;

  // Storage
  partition?: string;
  ttl?: number;
  metadata?: Record<string, any>;
}
```

### EnhancedRetrieveOptions

```typescript
interface EnhancedRetrieveOptions extends RetrieveOptions {
  // Decryption
  encryptionKey?: string;

  // Validation
  validateChecksum?: boolean;

  // Access control (from base)
  agentId?: string;
  teamId?: string;
  swarmId?: string;
  isSystemAgent?: boolean;

  // Query
  partition?: string;
  includeExpired?: boolean;
}
```

## Usage Patterns

### Pattern 1: Secure Configuration Storage

```typescript
// Store encrypted configuration
const key = memory.encryption.generateKey();
await memory.storeEnhanced('app-config', {
  apiKey: 'secret',
  dbPassword: 'password'
}, {
  encrypt: true,
  encryptionKey: key,
  enableVersioning: true,
  partition: 'config'
});

// Retrieve and decrypt
const config = await memory.retrieveEnhanced('app-config', {
  encryptionKey: key,
  partition: 'config',
  validateChecksum: true
});
```

### Pattern 2: Large Data Compression

```typescript
// Store large dataset with compression
const largeData = generateLargeDataset();
await memory.storeEnhanced('analytics-data', largeData, {
  compress: true,
  compressionThreshold: 1024,
  partition: 'analytics',
  ttl: 86400  // 24 hours
});

// Retrieve and decompress automatically
const data = await memory.retrieveEnhanced('analytics-data', {
  partition: 'analytics'
});
```

### Pattern 3: Version Control for State

```typescript
// Store state with versioning
await memory.storeEnhanced('workflow-state', {
  step: 1,
  completed: false
}, {
  enableVersioning: true,
  partition: 'workflow'
});

// Update state (new version created automatically)
await memory.storeEnhanced('workflow-state', {
  step: 2,
  completed: false
}, {
  enableVersioning: true,
  partition: 'workflow'
});

// View history
const history = await memory.getHistory('workflow-state');
console.log(`${history.length} versions`);

// Rollback to step 1
await memory.rollbackToVersion('workflow-state', history[0].timestamp);
```

### Pattern 4: Combined Security + Compression + Versioning

```typescript
// All features enabled
const key = memory.encryption.generateKey();
await memory.storeEnhanced('critical-data', sensitiveData, {
  encrypt: true,
  encryptionKey: key,
  compress: true,
  compressionThreshold: 512,
  enableVersioning: true,
  partition: 'critical',
  ttl: 3600,
  metadata: {
    source: 'agent-123',
    classification: 'confidential'
  }
});

// Retrieve with full validation
const data = await memory.retrieveEnhanced('critical-data', {
  encryptionKey: key,
  validateChecksum: true,
  partition: 'critical'
});

// Verify integrity
const isValid = await memory.validateIntegrity('critical-data');
console.log(`Data integrity: ${isValid ? 'Valid' : 'Corrupted'}`);
```

## Performance Characteristics

### Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Store (no features) | <1ms | Base operation |
| Store with encryption | ~10ms | AES-256-GCM |
| Store with compression | ~20ms | 1MB data |
| Store with versioning | ~5ms | Includes checksum |
| Store (all features) | ~35ms | Combined overhead |
| Retrieve (no features) | <1ms | Base operation |
| Retrieve with decryption | ~10ms | Includes validation |
| Retrieve with decompression | ~15ms | 1MB data |
| Version history (100 versions) | <2s | With cleanup |

### Storage Efficiency

| Feature | Overhead | Benefit |
|---------|----------|---------|
| Encryption | +32 bytes (IV + tag) | Data security |
| Compression | -50% to -90% | Size reduction |
| Versioning | +10% per version | Audit trail |
| Checksums | +32 bytes (SHA-256) | Integrity validation |

## Testing

```bash
# Run all advanced features tests
npm test -- tests/core/memory/AdvancedFeatures.test.ts

# Run specific test suite
npm test -- tests/core/memory/AdvancedFeatures.test.ts -t "VersionHistory"
npm test -- tests/core/memory/AdvancedFeatures.test.ts -t "EncryptionManager"
npm test -- tests/core/memory/AdvancedFeatures.test.ts -t "CompressionManager"

# Run integration tests
npm test -- tests/core/memory/AdvancedFeatures.test.ts -t "Integration"

# Run performance tests
npm test -- tests/core/memory/AdvancedFeatures.test.ts -t "Performance"
```

## Security Best Practices

### 1. Key Management

```typescript
// ❌ DON'T: Hardcode keys
const key = 'abc123...';

// ✅ DO: Generate and store securely
const key = memory.encryption.generateKey();
process.env.ENCRYPTION_KEY = key; // Or use key vault

// ✅ DO: Derive from password
const key = memory.encryption.deriveKeyFromPassword(userPassword, salt);
```

### 2. Access Control

```typescript
// Combine encryption with access control
await memory.storeEnhanced('secret', data, {
  encrypt: true,
  encryptionKey: key,
  owner: 'agent-123',
  accessLevel: AccessLevel.PRIVATE,
  teamId: 'team-456'
});

// Only authorized agents can read
const data = await memory.retrieveEnhanced('secret', {
  encryptionKey: key,
  agentId: 'agent-123',
  teamId: 'team-456'
});
```

### 3. Integrity Validation

```typescript
// Always validate critical data
const data = await memory.retrieveEnhanced('important', {
  validateChecksum: true  // Throws if corrupted
});

// Periodic integrity checks
const isValid = await memory.validateIntegrity('important');
if (!isValid) {
  // Handle corruption (restore from backup, etc.)
}
```

### 4. Key Rotation

```typescript
// Rotate encryption keys
const oldKey = process.env.OLD_KEY;
const newKey = memory.encryption.generateKey();

// Reencrypt all sensitive data
const keys = await memory.query('sensitive:*');
for (const entry of keys) {
  const data = await memory.retrieveEnhanced(entry.key, {
    encryptionKey: oldKey
  });

  await memory.storeEnhanced(entry.key, data, {
    encrypt: true,
    encryptionKey: newKey
  });
}

process.env.ENCRYPTION_KEY = newKey;
```

## Migration Guide

### From Base SwarmMemoryManager

```typescript
// Before
const memory = new SwarmMemoryManager('./db');
await memory.store('key', value);

// After (backward compatible)
const memory = new EnhancedSwarmMemoryManager('./db');
await memory.store('key', value); // Still works

// With new features
await memory.storeEnhanced('key', value, {
  encrypt: true,
  encryptionKey: key,
  compress: true
});
```

### Gradual Adoption

```typescript
// Start with versioning only
await memory.storeEnhanced('data', value, {
  enableVersioning: true
});

// Add compression later
await memory.storeEnhanced('data', value, {
  enableVersioning: true,
  compress: true
});

// Add encryption when needed
await memory.storeEnhanced('data', value, {
  enableVersioning: true,
  compress: true,
  encrypt: true,
  encryptionKey: key
});
```

## Troubleshooting

### Issue: Checksum validation fails

```typescript
// Check if data is corrupted
const history = await memory.getHistory('key');
for (const version of history) {
  const isValid = await memory.versionHistory.validateChecksum(
    'key',
    version.timestamp
  );
  console.log(`Version ${version.version}: ${isValid ? 'Valid' : 'Corrupted'}`);
}

// Restore from last valid version
const validVersion = history.find(v => v.checksum === expectedChecksum);
if (validVersion) {
  await memory.rollbackToVersion('key', validVersion.timestamp);
}
```

### Issue: Decryption fails

```typescript
// Verify key format
if (!memory.encryption.isValidKey(key)) {
  throw new Error('Invalid encryption key format');
}

// Try different algorithm
try {
  const data = await memory.encryption.decrypt(encrypted, key, 'aes-256-cbc');
} catch (error) {
  console.error('Decryption failed:', error.message);
}
```

### Issue: Poor compression ratio

```typescript
// Check compression stats
const stats = await memory.compression.getCompressionStats(data);
console.log(`Ratio: ${stats.compressionRatio}`);

// Try different algorithm
const gzip = await memory.compression.compress(data, 'gzip');
const deflate = await memory.compression.compress(data, 'deflate');
console.log(`Gzip: ${gzip.length}, Deflate: ${deflate.length}`);

// Use uncompressed if ratio is poor
const result = await memory.compression.compressIfBeneficial(data, 0.9);
if (!result.compressed) {
  console.log('Data not compressed (ratio > 90%)');
}
```

## Contributing

See [PHASE1-IMPLEMENTATION-SUMMARY.md](../../../docs/PHASE1-IMPLEMENTATION-SUMMARY.md) for implementation details.

## License

Part of the Agentic QE Fleet project.

## Support

For issues and questions:
- Create an issue in the repository
- Check existing tests for usage examples
- Review the implementation summary document
