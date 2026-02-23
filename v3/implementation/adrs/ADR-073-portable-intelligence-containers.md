# ADR-073: Portable Intelligence Containers via RVF

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-073 |
| **Status** | Proposed |
| **Date** | 2026-02-22 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's learned intelligence (150K+ patterns, Q-values, HNSW indexes, correlation graphs, confidence histories) being locked inside a single installation's .agentic-qe/ directory with no mechanism to export, share, import, or version this intelligence as a portable artifact,

**facing** the inability to transfer learned QE knowledge between projects (each new project starts from zero), no way to create versioned snapshots of intelligence state for reproducibility, no mechanism for organizations to share domain-specific QE expertise (e.g., "React testing patterns" or "microservices integration patterns") across teams, and no marketplace or distribution model for curated intelligence,

**we decided for** defining a Portable Intelligence Container specification built on RVF's self-contained binary format, where a single .rvf file contains all learned knowledge (vectors, indexes, patterns, Q-values, witness chains, metadata) as a versioned, signed, sharable artifact with a standard manifest describing its contents, provenance, and compatibility requirements,

**and neglected** (a) JSON/YAML export of patterns only (rejected: loses embeddings, indexes, Q-values, and confidence histories; requires rebuilding indexes on import), (b) SQLite database file sharing (rejected: not self-describing, no built-in signing, no manifest, no selective import), (c) Git-based intelligence versioning (rejected: binary embeddings do not diff well in Git, repository size grows rapidly, no native vector search capability in the exported format),

**to achieve** portable intelligence that enables project-to-project knowledge transfer, versioned intelligence snapshots for reproducible QE baselines, a foundation for an intelligence marketplace where teams publish and consume domain-specific QE knowledge, and cryptographically signed containers that establish trust in shared intelligence via witness chain provenance,

**accepting that** this introduces a new distribution format that consumers must understand, intelligence containers may contain patterns that do not transfer well across different codebases (domain mismatch), container signing and verification adds key management complexity, and a marketplace infrastructure is out of scope for this ADR (covered as future work).

---

## Context

AQE's value proposition is cumulative: the more it runs, the more it learns, the better its quality engineering decisions become. After months of operation on a large codebase, an AQE installation has learned thousands of patterns specific to that codebase's technology stack, testing frameworks, common failure modes, and architectural patterns.

This knowledge is currently imprisoned in `.agentic-qe/memory.db` and (after the RVF migration) in `.rvf` files. When a team starts a new project with a similar technology stack, they start from zero. When an organization wants to establish baseline QE knowledge across 50 repositories, each must learn independently. When a consulting firm wants to offer "enterprise Java QE patterns" as a deliverable, there is no format to package and deliver it.

RVF's binary container format is naturally suited for this purpose. A single .rvf file already contains:
- **VEC_SEG**: Pattern embeddings
- **INDEX_SEG**: HNSW indexes (ready to query, no rebuild needed)
- **META_SEG**: Pattern metadata, Q-values, configuration
- **WITNESS_SEG**: Cryptographic provenance chain
- **MANIFEST**: Self-describing header with content inventory

What is missing is a standard specification for how to package, version, sign, and distribute these containers as portable intelligence.

### Container Structure

```
intelligence-container.rvf
  MANIFEST (Level 0, 4096 bytes at EOF)
    - Container ID (UUID)
    - Version (semver)
    - Created timestamp
    - Creator identity (Ed25519 public key)
    - Compatibility requirements (min AQE version, required domains)
    - Content inventory (segment counts, total patterns, total vectors)
    - Description and tags
  VEC_SEG
    - All pattern embeddings (384-dim Float32)
  INDEX_SEG
    - Progressive 3-layer HNSW (ready to query on import)
  META_SEG
    - Pattern metadata (confidence, domain, tags, creation context)
    - Q-values for routing decisions
    - Configuration overrides
  WITNESS_SEG
    - Full provenance chain from pattern creation through all mutations
  CRYPTO_SEG
    - Ed25519 container signature
    - Creator public key certificate
    - Optional: importing organization's countersignature
```

---

## Options Considered

### Option 1: RVF-Based Portable Intelligence Containers (Selected)

Define a container specification on top of RVF's existing segment types. A container is a self-contained .rvf file with a standardized manifest, all learned knowledge, and cryptographic signatures.

**Pros:**
- Self-contained: single file, no external dependencies
- Ready to query: HNSW index is pre-built, no import rebuild
- Cryptographically signed: Ed25519 signatures establish trust
- Witness chain included: full provenance for every pattern
- Progressive loading: Level 0 manifest enables <5ms content inspection
- Selective import: consumers can import specific domains or patterns
- Version controlled: semver in manifest enables compatibility checking

**Cons:**
- New specification to define and maintain
- Domain mismatch risk: patterns from Project A may not transfer to Project B
- Binary format is not human-inspectable (requires tooling)
- Key management for signing adds operational complexity

### Option 2: JSON/YAML Pattern Export (Rejected)

Export patterns as JSON/YAML files with metadata.

**Why rejected:** Loses embeddings (too large for JSON), loses HNSW indexes (must rebuild on import, taking seconds to minutes), loses Q-values and confidence histories, and loses witness chain provenance. The import side must regenerate embeddings and rebuild indexes, which requires the same ML pipeline that created them. Not self-contained.

### Option 3: SQLite Database File Sharing (Rejected)

Share the memory.db file directly between installations.

**Why rejected:** SQLite files are not self-describing (no manifest, no content inventory). No built-in signing or provenance. No selective import -- the entire database must be loaded. No HNSW index included (must rebuild on import). Platform-specific byte ordering concerns. Not a format designed for distribution.

### Option 4: Git-Based Intelligence Versioning (Rejected)

Store intelligence as files in a Git repository, using Git for versioning and distribution.

**Why rejected:** Binary embeddings (Float32Arrays) do not diff meaningfully in Git. Each version stores the full binary, causing rapid repository growth. Git does not support vector search on repository contents. Distribution via Git requires Git infrastructure (server, authentication, clone).

---

## Implementation

### Container Builder

```typescript
// v3/src/containers/intelligence-container-builder.ts
interface IntelligenceContainerBuilder {
  /** Create a new container from the current knowledge base */
  build(config: ContainerBuildConfig): Promise<ContainerBuildResult>;

  /** Create a container from a specific domain subset */
  buildDomainContainer(
    domain: string,
    config: ContainerBuildConfig
  ): Promise<ContainerBuildResult>;

  /** Sign a built container with the creator's Ed25519 key */
  sign(
    containerPath: string,
    signingKey: Ed25519PrivateKey
  ): Promise<SignedContainerResult>;
}

interface ContainerBuildConfig {
  version: string;                // Semver version string
  description: string;            // Human-readable description
  tags: string[];                 // Searchable tags (e.g., "react", "testing", "microservices")
  minAqeVersion: string;          // Minimum AQE version required for import
  requiredDomains: string[];      // Domains that must be active for patterns to be useful
  includeWitnessChain: boolean;   // Include full provenance (default: true)
  includeQValues: boolean;        // Include routing Q-values (default: true)
  confidenceThreshold: number;    // Only include patterns above this confidence (default: 0.3)
}

interface ContainerBuildResult {
  containerPath: string;
  containerId: string;
  patternCount: number;
  vectorCount: number;
  sizeBytes: number;
  domains: string[];
}
```

### Container Importer

```typescript
// v3/src/containers/intelligence-container-importer.ts
interface IntelligenceContainerImporter {
  /** Inspect a container without importing (reads Level 0 manifest) */
  inspect(containerPath: string): Promise<ContainerManifest>;

  /** Verify container signature */
  verify(containerPath: string): Promise<VerificationResult>;

  /** Import all patterns from a container */
  importAll(
    containerPath: string,
    options: ImportOptions
  ): Promise<ImportResult>;

  /** Import only patterns matching a domain filter */
  importDomain(
    containerPath: string,
    domain: string,
    options: ImportOptions
  ): Promise<ImportResult>;

  /** Preview what would be imported without writing */
  dryRun(
    containerPath: string,
    options: ImportOptions
  ): Promise<ImportPreview>;
}

interface ImportOptions {
  /** How to handle patterns that already exist locally */
  conflictStrategy: 'skip' | 'overwrite' | 'higher-confidence-wins' | 'merge';
  /** Minimum confidence threshold for imported patterns */
  confidenceThreshold: number;
  /** Whether to verify witness chain integrity before import */
  verifyWitnessChain: boolean;
  /** Whether to record the import in the local witness chain */
  recordImport: boolean;
}

interface ImportResult {
  patternsImported: number;
  patternsSkipped: number;      // Already existed locally
  patternsConflicted: number;   // Existed with different confidence
  vectorsIndexed: number;
  witnessEntriesImported: number;
  importDurationMs: number;
}
```

### CLI Integration

```bash
# Build a container from the current knowledge base
npx @claude-flow/cli@latest intelligence export \
  --version 1.0.0 \
  --description "React testing patterns from enterprise project" \
  --tags react,testing,jest,rtl \
  --output ./react-qe-patterns-v1.0.0.rvf

# Inspect a container
npx @claude-flow/cli@latest intelligence inspect ./react-qe-patterns-v1.0.0.rvf

# Import a container
npx @claude-flow/cli@latest intelligence import ./react-qe-patterns-v1.0.0.rvf \
  --conflict-strategy higher-confidence-wins \
  --verify-witness-chain

# Domain-specific import
npx @claude-flow/cli@latest intelligence import ./enterprise-patterns.rvf \
  --domain test-generation \
  --confidence-threshold 0.5
```

### Compatibility Checking

On import, the container's manifest is checked against the local installation:

```typescript
interface CompatibilityCheck {
  /** Verify the local AQE version meets the container's minimum requirement */
  checkVersion(manifest: ContainerManifest, localVersion: string): boolean;

  /** Verify required domains are active locally */
  checkDomains(manifest: ContainerManifest, localDomains: string[]): DomainCheckResult;

  /** Warn about embedding dimension mismatches */
  checkDimensions(manifest: ContainerManifest, localDimensions: number): boolean;
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | Containers built on RVF format |
| Depends On | ADR-066 | RVF-backed Pattern Store with Progressive HNSW | Index must be RVF-native for export |
| Depends On | ADR-070 | Witness Chain Audit Compliance | Provenance chain included in containers |
| Depends On | ADR-072 | RVF Primary Persistence Migration | Full migration enables complete export |
| Relates To | ADR-067 | Agent Memory Branching | Containers can be derived as COW branches |
| Relates To | ADR-050 | RuVector Neural Backbone | Containers package ruvector-learned knowledge |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration Phase 3 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF Manifest Spec | Technical Spec | @ruvector/rvf package documentation |
| EXT-002 | RVF CRYPTO_SEG Spec | Technical Spec | @ruvector/rvf package documentation |
| EXT-003 | Ed25519 (RFC 8032) | Standard | IETF signature standard |
| INT-001 | PatternStore | Existing Code | `v3/src/learning/pattern-store.ts` |
| INT-002 | ReasoningBank | Existing Code | `v3/src/learning/reasoning-bank.ts` |
| INT-003 | CLI Commands | Existing Code | `v3/src/cli/` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-22 | Proposed | 2026-08-22 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-22 | Initial creation. Portable intelligence container specification for exporting, sharing, and importing learned QE knowledge. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Approach validated (PoC, prior art, or expert input)
- [ ] **C - Criteria**: At least 2 options compared systematically
- [ ] **A - Agreement**: Relevant stakeholders consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: All relationships documented with typed relationships
- [ ] **Rf - References**: Implementation details in SPEC files, all links valid
- [ ] **M - Master**: Linked to Master ADR if part of larger initiative
