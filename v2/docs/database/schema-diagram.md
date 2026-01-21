# AgentDB v2.0 Schema Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENTDB v2.0 ARCHITECTURE                          │
│                        Unified Learning Database                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE LEARNING LAYER                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│      EPISODES        │         │    TEST_PATTERNS     │
├──────────────────────┤         ├──────────────────────┤
│ id (PK)              │         │ id (PK)              │
│ session_id           │         │ pattern_name         │
│ task                 │         │ pattern_type         │
│ input / output       │         │ framework            │
│ critique             │         │ language             │
│ reward / success     │◄────────┤ code_signature_hash  │
│ latency_ms           │         │ test_template (JSON) │
│ tokens_used          │         │ pattern_content      │
│                      │         │ description          │
│ NEW in v2.0:         │         │                      │
│ ├─ test_framework    │         │ LEARNING METRICS:    │
│ ├─ test_type         │         │ ├─ success_rate      │
│ ├─ coverage_before   │         │ ├─ usage_count       │
│ ├─ coverage_after    │         │ ├─ coverage_delta    │
│ ├─ test_count        │         │ ├─ quality_score     │
│ ├─ quality_score     │         │ ├─ trend             │
│ └─ pattern_ids       │         │ └─ embedding (BLOB)  │
│                      │         │                      │
│ tags (JSON)          │         │ created_at           │
│ metadata (JSON)      │         │ last_used            │
│ created_at           │         │ updated_at           │
└──────────────────────┘         └──────────────────────┘
         │                                  │
         │                                  │
         └────────────┬─────────────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │    PATTERN_USAGE        │
         ├─────────────────────────┤
         │ id (PK)                 │
         │ pattern_id (FK) ────────┼───► test_patterns.id
         │ session_id              │
         │ agent_type              │
         │ usage_timestamp         │
         │ success                 │
         │ coverage_improvement    │
         │ execution_time_ms       │
         │ context (JSON)          │
         └─────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        LEARNING METRICS LAYER                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐
│     LEARNING_METRICS         │
├──────────────────────────────┤
│ id (PK)                      │
│ agent_id                     │
│ agent_type                   │
│ session_id                   │
│ metric_type                  │  Types: coverage, quality, latency,
│ metric_value                 │         success_rate, improvement
│ baseline_value               │
│ improvement_percentage       │
│                              │
│ TEST METRICS:                │
│ ├─ test_framework            │
│ ├─ test_type                 │
│ ├─ coverage_percent          │
│ ├─ test_pass_rate            │
│ ├─ execution_time_ms         │
│ ├─ patterns_used             │
│ └─ new_patterns_created      │
│                              │
│ iteration / epoch            │
│ timestamp                    │
└──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    REINFORCEMENT LEARNING LAYER                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐      ┌──────────────────────────┐
│     Q_VALUES        │      │  LEARNING_EXPERIENCES    │
├─────────────────────┤      ├──────────────────────────┤
│ id (PK)             │      │ id (PK)                  │
│ agent_id            │      │ agent_id                 │
│ agent_type          │      │ session_id               │
│ state_key           │      │ state (JSON)             │
│ action_key          │      │ action (JSON)            │
│ q_value             │      │ reward                   │
│ update_count        │      │ next_state (JSON)        │
│ metadata (JSON)     │      │ done                     │
│ created_at          │      │ metadata (JSON)          │
│ last_updated        │      │ timestamp                │
└─────────────────────┘      └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      PATTERN DISCOVERY LAYER                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────┐      ┌──────────────────────────┐
│ PATTERN_SIMILARITY_INDEX    │      │     PATTERN_FTS          │
├─────────────────────────────┤      │   (Virtual Table)        │
│ id (PK)                     │      ├──────────────────────────┤
│ pattern_id (FK)             │      │ pattern_id               │
│ similar_pattern_id (FK)     │      │ pattern_name             │
│ similarity_score (0-1)      │      │ description              │
│ distance_metric             │      │ pattern_content          │
│ created_at                  │      │ tags                     │
└─────────────────────────────┘      └──────────────────────────┘
              │                                    │
              │                                    │
              └──────────┬─────────────────────────┘
                         │
                         ▼
              SEMANTIC PATTERN SEARCH
              - FTS5 full-text search
              - Vector similarity (embeddings)
              - Hybrid ranking (text + vectors)

┌─────────────────────────────────────────────────────────────────────────────┐
│                    CROSS-PROJECT SHARING LAYER                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐
│  CROSS_PROJECT_MAPPINGS      │
├──────────────────────────────┤
│ id (PK)                      │
│ pattern_id (FK) ─────────────┼───► test_patterns.id
│ source_project               │
│ target_project               │
│ adaptation_notes             │
│ success_rate                 │
│ usage_count                  │
│ created_at                   │
└──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         CACHING & VIEWS LAYER                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐      ┌──────────────────────────────┐
│  PATTERN_STATS_CACHE    │      │         VIEWS                │
├─────────────────────────┤      ├──────────────────────────────┤
│ cache_key (PK)          │      │ v_pattern_performance        │
│ framework               │      │ ├─ Aggregate pattern metrics │
│ pattern_type            │      │ └─ Usage statistics          │
│ total_patterns          │      │                              │
│ avg_success_rate        │      │ v_agent_learning_progress    │
│ avg_quality_score       │      │ ├─ Agent improvement over    │
│ total_usage_count       │      │ │   time                     │
│ avg_coverage_delta      │      │ └─ Metric breakdowns         │
│ computed_at             │      │                              │
│ expires_at              │      │ v_top_patterns               │
│ version                 │      │ ├─ High-performing patterns  │
└─────────────────────────┘      │ └─ Pre-filtered for quality  │
                                 └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRIGGER LAYER                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  AUTOMATIC DATA MAINTENANCE                                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  update_pattern_stats (on pattern_usage.INSERT)         │  │
│  │  ├─ Increment usage_count                               │  │
│  │  ├─ Update success_rate (30-day rolling window)         │  │
│  │  ├─ Update last_used timestamp                          │  │
│  │  └─ Set updated_at                                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  update_pattern_trend (on test_patterns.UPDATE)         │  │
│  │  ├─ Compare new vs old success_rate                     │  │
│  │  ├─ Set trend: improving/declining/stable               │  │
│  │  └─ Update last_success_rate                            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  patterns_ai / patterns_ad / patterns_au                │  │
│  │  ├─ Keep FTS index synchronized                         │  │
│  │  ├─ Auto-update on INSERT/UPDATE/DELETE                 │  │
│  │  └─ Maintain search performance                         │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA FLOW DIAGRAM                                  │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌──────────────┐
   │  Agent Task  │
   │  Execution   │
   └──────┬───────┘
          │
          ▼
   ┌──────────────────┐
   │  1. Record       │
   │     Episode      │────────► episodes (with test context)
   └──────┬───────────┘
          │
          ▼
   ┌──────────────────┐
   │  2. Use/Create   │
   │     Patterns     │────────► test_patterns
   └──────┬───────────┘          pattern_usage
          │
          ▼
   ┌──────────────────┐
   │  3. Log Metrics  │────────► learning_metrics
   └──────┬───────────┘
          │
          ▼
   ┌──────────────────┐
   │  4. Update       │────────► q_values (RL state)
   │     Q-Values     │          learning_experiences
   └──────┬───────────┘
          │
          ▼
   ┌──────────────────┐
   │  5. Auto-Update  │────────► Triggers fire:
   │     Stats        │          - pattern stats
   └──────┬───────────┘          - trend detection
          │                      - FTS sync
          ▼
   ┌──────────────────┐
   │  6. Query &      │────────► Views provide:
   │     Analyze      │          - performance summary
   └──────────────────┘          - learning progress
                                 - top patterns

┌─────────────────────────────────────────────────────────────────────────────┐
│                         INDEX STRATEGY                                      │
└─────────────────────────────────────────────────────────────────────────────┘

EPISODES (6 indexes)
├─ idx_episodes_session           (session_id, ts)
├─ idx_episodes_task              (task)
├─ idx_episodes_success           (success, reward)
├─ idx_episodes_timestamp         (ts DESC)
├─ idx_episodes_framework         (test_framework, test_type)
└─ idx_episodes_coverage          (coverage_after DESC)

TEST_PATTERNS (10 indexes)
├─ PRIMARY KEY                    (id)
├─ idx_patterns_framework_type    (framework, pattern_type)
├─ idx_patterns_signature_hash    (code_signature_hash)
├─ idx_patterns_created           (created_at DESC)
├─ idx_patterns_language          (language, framework)
├─ idx_patterns_success_rate      (success_rate DESC)
├─ idx_patterns_usage             (usage_count DESC)
├─ idx_patterns_quality           (quality_score DESC)
├─ idx_patterns_category          (category, framework)
├─ idx_patterns_tags              (tags)
├─ idx_patterns_trend             (trend, success_rate)
└─ idx_patterns_dedup (UNIQUE)    (code_signature_hash, framework)

PATTERN_USAGE (4 indexes)
├─ idx_usage_pattern              (pattern_id, usage_timestamp)
├─ idx_usage_session              (session_id)
├─ idx_usage_agent                (agent_type, usage_timestamp)
└─ idx_usage_success              (success, coverage_improvement)

LEARNING_METRICS (6 indexes)
├─ idx_metrics_agent              (agent_id, timestamp)
├─ idx_metrics_type               (metric_type, agent_type)
├─ idx_metrics_session            (session_id, iteration)
├─ idx_metrics_timestamp          (timestamp DESC)
├─ idx_metrics_framework          (test_framework, metric_type)
└─ idx_metrics_improvement        (improvement_percentage DESC)

Q_VALUES (3 indexes)
├─ PRIMARY KEY                    (id)
├─ UNIQUE                         (agent_id, state_key, action_key)
├─ idx_qvalues_agent              (agent_id, state_key)
├─ idx_qvalues_value              (q_value DESC)
└─ idx_qvalues_updated            (last_updated DESC)

┌─────────────────────────────────────────────────────────────────────────────┐
│                      PERFORMANCE TARGETS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

QUERY TYPE                    TARGET      STRATEGY
─────────────────────────────────────────────────────────────────────────────
Pattern by ID                 < 1ms       Primary key index
Framework + type filter       < 10ms      Composite index
Similarity search            < 50ms      Pre-computed similarity index
Full-text search             < 100ms     FTS5 index
Episode coverage analysis    < 100ms     Coverage + framework indexes
Agent learning timeline      < 100ms     Agent + timestamp indexes
Aggregate statistics         < 100ms     Stats cache + indexes
Top patterns query           < 10ms      View with pre-filtered data

┌─────────────────────────────────────────────────────────────────────────────┐
│                        STORAGE ESTIMATES                                    │
└─────────────────────────────────────────────────────────────────────────────┘

TABLE                    ROWS (Est.)    SIZE/ROW    TOTAL SIZE
─────────────────────────────────────────────────────────────────────────────
episodes                 1,759 (now)    ~2 KB       ~3.5 MB
                         10,000 (1yr)   ~2 KB       ~20 MB

test_patterns            0 (now)        ~5 KB       0 MB
                         500 (1yr)      ~5 KB       ~2.5 MB

pattern_usage            0 (now)        ~500 B      0 MB
                         5,000 (1yr)    ~500 B      ~2.5 MB

learning_metrics         varies         ~300 B      ~1 MB

q_values                 varies         ~200 B      ~500 KB

ESTIMATED TOTAL (1 year): ~30 MB

┌─────────────────────────────────────────────────────────────────────────────┐
│                          LEGEND                                             │
└─────────────────────────────────────────────────────────────────────────────┘

(PK)    - Primary Key
(FK)    - Foreign Key
JSON    - JSON data type with validation
BLOB    - Binary data (embeddings)
◄────   - Relationship/Reference
│       - Hierarchical connection
└─      - Sub-element/Detail
