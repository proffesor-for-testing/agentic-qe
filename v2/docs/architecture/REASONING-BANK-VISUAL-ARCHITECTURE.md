# QE ReasoningBank Visual Architecture (v1.1.0)

## 1. System Architecture Diagram

```mermaid
graph TB
    subgraph "External Systems"
        TG[TestGeneratorAgent]
        CA[CoverageAnalyzerAgent]
        TE[TestExecutorAgent]
        MM[MemoryManager]
        EB[EventBus]
    end

    subgraph "QE ReasoningBank Core"
        API[QEReasoningBank API]
        PE[PatternExtractor]
        PM[PatternMatcher]
        PS[PatternStorage]
        QS[QualityScorer]
        PC[PatternCache<br/>LRU 1000]
    end

    subgraph "Data Layer"
        DB[(SQLite Database<br/>WAL Mode)]
        FTS[(FTS5 Index)]
        SI[(Similarity Index)]
    end

    subgraph "Pattern Processing Pipeline"
        AST[AST Parser<br/>TS Compiler API]
        SIG[Signature<br/>Extractor]
        TPL[Template<br/>Generator]
        QUAL[Quality<br/>Scorer]
    end

    %% External → API
    TG -->|findPatterns| API
    CA -->|extractPatterns| API
    TE -->|updateUsage| API

    %% API → Core Components
    API --> PE
    API --> PM
    API --> PS
    API --> QS

    %% Pattern Extraction Pipeline
    PE --> AST
    AST --> SIG
    SIG --> TPL
    TPL --> QUAL

    %% Storage Layer
    PS --> PC
    PC -->|miss| DB
    PS --> DB
    PM --> SI
    PM --> FTS

    %% Data Storage
    DB --> FTS
    DB --> SI

    %% Events
    API -.->|emit events| EB
    EB -.->|consume events| API

    %% Memory Sharing
    API -->|share patterns| MM
    MM -->|sync patterns| API

    %% Styling
    style API fill:#4A90E2,stroke:#2E5C8A,stroke-width:3px,color:#fff
    style DB fill:#50E3C2,stroke:#2E8B7A,stroke-width:2px
    style PC fill:#F5A623,stroke:#C17D11,stroke-width:2px
    style PE fill:#7ED321,stroke:#5FA019,stroke-width:2px
    style PM fill:#BD10E0,stroke:#9012FE,stroke-width:2px
    style EB fill:#FF6B6B,stroke:#C92A2A,stroke-width:2px
    style MM fill:#FA8231,stroke:#D96A1E,stroke-width:2px
```

## 2. Data Flow Diagram

### 2.1 Pattern Storage Flow

```mermaid
sequenceDiagram
    participant TE as TestExecutorAgent
    participant API as QEReasoningBank
    participant PE as PatternExtractor
    participant PS as PatternStorage
    participant DB as SQLite DB
    participant MM as MemoryManager

    TE->>API: extractPatterns(testFiles)
    API->>PE: extract(testFiles)

    loop For each test file
        PE->>PE: Parse to AST
        PE->>PE: Extract signature
        PE->>PE: Generate template
        PE->>PE: Compute quality
    end

    PE-->>API: patterns[]

    loop For each pattern
        API->>PS: store(pattern)
        PS->>PS: Validate pattern
        PS->>PS: Compute signature hash
        PS->>DB: Check for duplicate

        alt Pattern is new
            PS->>DB: INSERT pattern
            PS->>PS: Add to cache
            PS->>MM: Share pattern
            PS-->>API: patternId
        else Pattern exists
            PS-->>API: existingPatternId
        end
    end

    API-->>TE: extractedPatterns[]
```

### 2.2 Pattern Matching Flow

```mermaid
sequenceDiagram
    participant TG as TestGeneratorAgent
    participant API as QEReasoningBank
    participant PM as PatternMatcher
    participant PC as PatternCache
    participant DB as SQLite DB
    participant SI as SimilarityIndex

    TG->>API: findPatterns(query)
    API->>PM: search(query)

    PM->>PC: Check cache

    alt Cache hit (80%+)
        PC-->>PM: cached patterns
    else Cache miss
        PM->>DB: Query candidates
        DB-->>PM: candidates[]
    end

    loop For each candidate
        PM->>SI: Get similarity score
        alt Score in index
            SI-->>PM: cached score
        else Score not indexed
            PM->>PM: Compute similarity
            PM->>SI: Cache score
        end
    end

    PM->>PM: Filter by minSimilarity
    PM->>PM: Sort by sortBy
    PM->>PM: Apply limit/offset

    PM-->>API: matches[]
    API-->>TG: PatternMatch[]
```

### 2.3 Usage Tracking Flow

```mermaid
sequenceDiagram
    participant TE as TestExecutorAgent
    participant API as QEReasoningBank
    participant PS as PatternStorage
    participant DB as SQLite DB
    participant QS as QualityScorer

    TE->>API: updateUsage(patternId, projectId, result)
    API->>PS: update(patternId, projectId, result)

    PS->>DB: Get current usage stats
    DB-->>PS: usage record

    PS->>PS: Increment usage_count

    alt Test passed
        PS->>PS: Increment success_count
    else Test failed
        PS->>PS: Increment failure_count
    end

    PS->>PS: Update avg_execution_time
    PS->>PS: Update avg_coverage_gain

    PS->>DB: UPDATE pattern_usage

    PS->>QS: Compute new quality score
    QS->>QS: Calculate success_rate
    QS->>QS: Assess trend (rising/stable/declining)
    QS-->>PS: quality_score, trend

    PS->>DB: UPDATE quality_score

    PS-->>API: success
    API-->>TE: updated
```

## 3. Component Interaction Diagram

```mermaid
graph LR
    subgraph "Pattern Lifecycle"
        A[Test Execution] --> B[Pattern Extraction]
        B --> C[Pattern Storage]
        C --> D[Pattern Indexing]
        D --> E[Pattern Matching]
        E --> F[Test Generation]
        F --> G[Usage Tracking]
        G --> H[Quality Scoring]
        H --> I[Pattern Refinement]
        I --> D
    end

    style A fill:#FF6B6B
    style B fill:#7ED321
    style C fill:#4A90E2
    style D fill:#F5A623
    style E fill:#BD10E0
    style F fill:#50E3C2
    style G fill:#FA8231
    style H fill:#9012FE
    style I fill:#C92A2A
```

## 4. Database Schema ERD

```mermaid
erDiagram
    test_patterns ||--o{ pattern_usage : "tracks"
    test_patterns ||--o{ cross_project_mappings : "maps"
    test_patterns ||--o{ pattern_similarity_index : "similarity_a"
    test_patterns ||--o{ pattern_similarity_index : "similarity_b"
    test_patterns ||--|| pattern_fts : "indexes"

    test_patterns {
        string id PK
        string pattern_type
        string framework
        string language
        string code_signature_hash UK
        json code_signature
        json test_template
        json metadata
        string version
        timestamp created_at
        timestamp updated_at
    }

    pattern_usage {
        int id PK
        string pattern_id FK
        string project_id
        int usage_count
        int success_count
        int failure_count
        real avg_execution_time
        real avg_coverage_gain
        int flaky_count
        real quality_score
        timestamp first_used
        timestamp last_used
    }

    cross_project_mappings {
        int id PK
        string pattern_id FK
        string source_framework
        string target_framework
        json transformation_rules
        real compatibility_score
        int project_count
        real success_rate
        timestamp created_at
        timestamp updated_at
    }

    pattern_similarity_index {
        string pattern_a FK
        string pattern_b FK
        real similarity_score
        real structure_similarity
        real identifier_similarity
        real metadata_similarity
        string algorithm
        timestamp last_computed
    }

    pattern_fts {
        string pattern_id FK
        string pattern_name
        string description
        string tags
        string framework
        string pattern_type
    }
```

## 5. Pattern Extraction Pipeline

```mermaid
flowchart TD
    Start([Test Files]) --> Parse[Parse to AST]
    Parse --> Identify[Identify Test Blocks]
    Identify --> Extract[Extract Code Signature]
    Extract --> Generate[Generate Template]
    Generate --> Quality[Compute Quality Metrics]
    Quality --> Dedup[Deduplication Check]

    Dedup -->|New| Store[Store Pattern]
    Dedup -->|Duplicate| Skip[Skip]

    Store --> Index[Update Similarity Index]
    Index --> Cache[Add to Cache]
    Cache --> End([Stored Pattern])
    Skip --> End

    style Start fill:#7ED321
    style Parse fill:#4A90E2
    style Identify fill:#F5A623
    style Extract fill:#BD10E0
    style Generate fill:#50E3C2
    style Quality fill:#9012FE
    style Dedup fill:#FA8231
    style Store fill:#4A90E2
    style End fill:#7ED321
```

## 6. Pattern Matching Algorithm

```mermaid
flowchart TD
    Query([Pattern Query]) --> Cache{Cache<br/>Hit?}

    Cache -->|Yes 80%| CachePatterns[Get Cached Patterns]
    Cache -->|No 20%| DBQuery[Query Database]

    DBQuery --> Candidates[Get Candidates]
    Candidates --> FTS[Full-Text Search]
    FTS --> Filter[Filter by Framework/Type]

    CachePatterns --> Score[Compute Similarity Scores]
    Filter --> Score

    Score --> StructureSim[Structure Similarity<br/>40%]
    Score --> IdentifierSim[Identifier Similarity<br/>30%]
    Score --> MetadataSim[Metadata Similarity<br/>20%]
    Score --> UsageSim[Usage Score<br/>10%]

    StructureSim --> Combine[Combine Scores]
    IdentifierSim --> Combine
    MetadataSim --> Combine
    UsageSim --> Combine

    Combine --> MinSim{Score >=<br/>minSimilarity?}

    MinSim -->|Yes| Keep[Keep Match]
    MinSim -->|No| Discard[Discard]

    Keep --> Sort[Sort by sortBy]
    Discard --> Sort

    Sort --> Limit[Apply Limit/Offset]
    Limit --> Return([PatternMatch[]])

    style Query fill:#7ED321
    style Cache fill:#F5A623
    style Score fill:#BD10E0
    style Return fill:#7ED321
```

## 7. Quality Scoring System

```mermaid
flowchart TD
    Pattern([Test Pattern]) --> Coverage[Coverage Score<br/>40% weight]
    Pattern --> Maint[Maintainability Score<br/>30% weight]
    Pattern --> Reliable[Reliability Score<br/>30% weight]

    Coverage --> CovMetrics{Code<br/>Coverage}
    CovMetrics --> CovHigh[0.8 - 1.0<br/>Excellent]
    CovMetrics --> CovMed[0.5 - 0.8<br/>Good]
    CovMetrics --> CovLow[< 0.5<br/>Poor]

    Maint --> MaintMetrics{Complexity}
    MaintMetrics --> MaintLow[Low Complexity<br/>High Score]
    MaintMetrics --> MaintHigh[High Complexity<br/>Low Score]

    Reliable --> RelMetrics{Success<br/>Rate}
    RelMetrics --> RelHigh[> 0.9<br/>Excellent]
    RelMetrics --> RelMed[0.7 - 0.9<br/>Good]
    RelMetrics --> RelLow[< 0.7<br/>Poor]

    CovHigh --> Combine[Weighted Combination]
    CovMed --> Combine
    CovLow --> Combine
    MaintLow --> Combine
    MaintHigh --> Combine
    RelHigh --> Combine
    RelMed --> Combine
    RelLow --> Combine

    Combine --> FinalScore[Final Quality Score<br/>0.0 - 1.0]

    FinalScore --> Trend{Trend<br/>Analysis}
    Trend --> Rising[Rising<br/>Quality improving]
    Trend --> Stable[Stable<br/>Consistent quality]
    Trend --> Declining[Declining<br/>Quality issues]

    style Pattern fill:#7ED321
    style Coverage fill:#4A90E2
    style Maint fill:#F5A623
    style Reliable fill:#BD10E0
    style FinalScore fill:#50E3C2
    style Rising fill:#7ED321
    style Stable fill:#F5A623
    style Declining fill:#FF6B6B
```

## 8. Cross-Framework Pattern Sharing

```mermaid
flowchart TD
    Start([Pattern in Jest]) --> Share[sharePattern API]
    Share --> Rules[Apply Transformation Rules]

    Rules --> ImportMap[Import Mappings<br/>@testing-library/react → vue]
    Rules --> IdMap[Identifier Mappings<br/>describe → suite<br/>it → test]
    Rules --> AssertMap[Assertion Mappings<br/>toBe → toStrictEqual]

    ImportMap --> Transform[Transform Pattern]
    IdMap --> Transform
    AssertMap --> Transform

    Transform --> Validate[Validate Compatibility]

    Validate --> Score{Compatibility<br/>Score}
    Score -->|> 0.8| High[High Compatibility<br/>Safe to use]
    Score -->|0.5 - 0.8| Medium[Medium Compatibility<br/>Review needed]
    Score -->|< 0.5| Low[Low Compatibility<br/>Manual adaptation]

    High --> Store[Store Mapping]
    Medium --> Store
    Low --> Store

    Store --> Cypress([Pattern in Cypress])
    Store --> Mocha([Pattern in Mocha])
    Store --> Vitest([Pattern in Vitest])

    style Start fill:#7ED321
    style Transform fill:#4A90E2
    style High fill:#7ED321
    style Medium fill:#F5A623
    style Low fill:#FF6B6B
    style Cypress fill:#50E3C2
    style Mocha fill:#BD10E0
    style Vitest fill:#FA8231
```

## 9. Performance Optimization Strategy

```mermaid
flowchart TD
    Request([Query Request]) --> CacheCheck{Cache<br/>Check}

    CacheCheck -->|Hit 80%+| CacheReturn[Return Cached<br/>< 20ms]
    CacheCheck -->|Miss 20%| DBQuery[Database Query]

    DBQuery --> Index{Index<br/>Available?}

    Index -->|Yes| FastQuery[Indexed Query<br/>< 50ms]
    Index -->|No| FullScan[Full Scan<br/>< 200ms]

    FastQuery --> Results[Query Results]
    FullScan --> Results

    Results --> SimCheck{Similarity<br/>Indexed?}

    SimCheck -->|Yes| CachedSim[Cached Similarity<br/>< 5ms]
    SimCheck -->|No| ComputeSim[Compute Similarity<br/>< 15ms]

    CachedSim --> Return[Return Results]
    ComputeSim --> UpdateIndex[Update Index]
    UpdateIndex --> Return

    CacheReturn --> Return
    Return --> UpdateCache[Update Cache<br/>LRU Eviction]
    UpdateCache --> End([Response])

    style Request fill:#7ED321
    style CacheCheck fill:#F5A623
    style CacheReturn fill:#7ED321
    style FastQuery fill:#7ED321
    style FullScan fill:#FF6B6B
    style End fill:#7ED321
```

## 10. Agent Integration Architecture

```mermaid
graph TB
    subgraph "AQE Fleet Agents"
        TG[TestGeneratorAgent<br/>Generate tests from patterns]
        CA[CoverageAnalyzerAgent<br/>Extract patterns from tests]
        TE[TestExecutorAgent<br/>Track pattern usage]
        QG[QualityGateAgent<br/>Validate pattern quality]
    end

    subgraph "QE ReasoningBank"
        API[QEReasoningBank API]

        subgraph "Core Services"
            PE[Pattern Extractor]
            PM[Pattern Matcher]
            PS[Pattern Storage]
            QS[Quality Scorer]
        end

        subgraph "Infrastructure"
            DB[(SQLite DB)]
            Cache[LRU Cache]
            Index[Similarity Index]
        end
    end

    subgraph "Coordination Layer"
        EB[EventBus<br/>pattern:* events]
        MM[MemoryManager<br/>reasoning-bank namespace]
    end

    TG -->|findPatterns| API
    CA -->|extractPatterns| API
    TE -->|updateUsage| API
    QG -->|getPatternStats| API

    API --> PE
    API --> PM
    API --> PS
    API --> QS

    PE --> DB
    PM --> Cache
    PM --> Index
    PS --> DB
    QS --> DB

    API -.->|emit| EB
    EB -.->|consume| API

    API -->|share| MM
    MM -->|sync| API

    style API fill:#4A90E2,stroke:#2E5C8A,stroke-width:3px
    style TG fill:#7ED321
    style CA fill:#F5A623
    style TE fill:#BD10E0
    style QG fill:#50E3C2
    style EB fill:#FF6B6B
    style MM fill:#FA8231
    style DB fill:#50E3C2
```

---

**Architecture Version:** 1.1.0
**Status:** ✓ Design Complete
**Last Updated:** 2025-10-16
