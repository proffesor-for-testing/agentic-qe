# Enhanced tools_discover Output Examples

This document demonstrates the enhanced `tools_discover` meta-tool capabilities added in Phase 3 Track H.

## Enhancements Summary

1. **Multiple Category Filtering**: Support comma-separated categories (e.g., `"core,domains"`)
2. **Detailed Statistics**: Return tool counts per category with loaded vs available breakdown
3. **Domain Information**: Include keyword triggers and loading status for each domain
4. **Coordination Tools**: Include workflow and inter-agent coordination tools
5. **Usage Hints**: Provide helpful tips when requesting all categories

## Example 1: Discover All Categories (Default)

**Request:**
```json
{
  "category": "all",
  "includeDescriptions": false
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-12-05T10:30:00.000Z",
  "statistics": {
    "totalAvailable": 107,
    "totalLoaded": 14,
    "loadingPercentage": "13%",
    "breakdown": {
      "core": {
        "available": 14,
        "loaded": 14,
        "status": "always loaded"
      },
      "domains": {
        "available": 31,
        "loaded": 0,
        "loadedDomains": [],
        "availableDomains": [
          "security",
          "performance",
          "coverage",
          "quality",
          "flaky",
          "visual",
          "requirements"
        ]
      },
      "specialized": {
        "available": 51,
        "loaded": 0,
        "loadedDomains": [],
        "availableDomains": [
          "learning",
          "advanced"
        ]
      },
      "coordination": {
        "available": 11,
        "loaded": 0,
        "status": "available"
      }
    }
  },
  "categories": {
    "core": {
      "description": "Always-loaded essential QE tools",
      "count": 14,
      "status": "loaded",
      "tools": [
        "mcp__agentic_qe__fleet_init",
        "mcp__agentic_qe__agent_spawn",
        "mcp__agentic_qe__fleet_status",
        "mcp__agentic_qe__test_generate_enhanced",
        "mcp__agentic_qe__test_execute",
        "mcp__agentic_qe__test_execute_parallel",
        "mcp__agentic_qe__test_report_comprehensive",
        "mcp__agentic_qe__memory_store",
        "mcp__agentic_qe__memory_retrieve",
        "mcp__agentic_qe__memory_query",
        "mcp__agentic_qe__task_orchestrate",
        "mcp__agentic_qe__task_status",
        "mcp__agentic_qe__tools_discover",
        "mcp__agentic_qe__tools_load_domain"
      ]
    },
    "domains": {
      "description": "Domain-specific tools loaded on demand via keyword detection",
      "totalCount": 31,
      "loadedCount": 0,
      "availableDomains": [
        {
          "domain": "security",
          "count": 4,
          "loaded": false,
          "keywords": [
            "security",
            "vulnerability",
            "vulnerabilities",
            "scan",
            "audit",
            "owasp",
            "cve",
            "sast",
            "dast",
            "penetration",
            "compliance",
            "authentication",
            "authorization",
            "encryption",
            "injection"
          ],
          "tools": [
            "mcp__agentic_qe__qe_security_scan_comprehensive",
            "mcp__agentic_qe__qe_security_detect_vulnerabilities",
            "mcp__agentic_qe__qe_security_validate_compliance",
            "mcp__agentic_qe__security_generate_report"
          ]
        },
        {
          "domain": "performance",
          "count": 5,
          "loaded": false,
          "keywords": [
            "performance",
            "benchmark",
            "bottleneck",
            "profiling",
            "latency",
            "throughput",
            "load test",
            "stress test",
            "speed",
            "optimization",
            "memory leak",
            "cpu usage",
            "response time"
          ],
          "tools": [
            "mcp__agentic_qe__performance_analyze_bottlenecks",
            "mcp__agentic_qe__performance_generate_report",
            "mcp__agentic_qe__performance_run_benchmark",
            "mcp__agentic_qe__performance_monitor_realtime",
            "mcp__agentic_qe__performance_track"
          ]
        },
        {
          "domain": "coverage",
          "count": 8,
          "loaded": false,
          "keywords": [
            "coverage",
            "gap",
            "uncovered",
            "line coverage",
            "branch coverage",
            "function coverage",
            "statement coverage",
            "path coverage",
            "code coverage",
            "test coverage",
            "missing tests"
          ],
          "tools": [
            "mcp__agentic_qe__coverage_analyze_stream",
            "mcp__agentic_qe__coverage_analyze_with_risk_scoring",
            "mcp__agentic_qe__coverage_detect_gaps_ml",
            "mcp__agentic_qe__coverage_recommend_tests",
            "mcp__agentic_qe__coverage_calculate_trends",
            "mcp__agentic_qe__test_coverage_detailed",
            "mcp__agentic_qe__coverage_analyze_sublinear",
            "mcp__agentic_qe__coverage_gaps_detect"
          ]
        },
        {
          "domain": "quality",
          "count": 12,
          "loaded": false,
          "keywords": [
            "quality gate",
            "deploy",
            "release",
            "go/no-go",
            "deployment readiness",
            "quality metrics",
            "code quality",
            "technical debt",
            "maintainability",
            "reliability",
            "complexity",
            "duplication",
            "smell"
          ],
          "tools": [
            "mcp__agentic_qe__qe_qualitygate_evaluate",
            "mcp__agentic_qe__qe_qualitygate_assess_risk",
            "mcp__agentic_qe__qe_qualitygate_validate_metrics",
            "mcp__agentic_qe__qe_qualitygate_generate_report",
            "mcp__agentic_qe__qe_code_quality_complexity",
            "mcp__agentic_qe__qe_code_quality_metrics",
            "mcp__agentic_qe__quality_gate_execute",
            "mcp__agentic_qe__quality_validate_metrics",
            "mcp__agentic_qe__quality_risk_assess",
            "mcp__agentic_qe__quality_decision_make",
            "mcp__agentic_qe__quality_policy_check",
            "mcp__agentic_qe__deployment_readiness_check"
          ]
        },
        {
          "domain": "flaky",
          "count": 3,
          "loaded": false,
          "keywords": [
            "flaky",
            "unstable",
            "intermittent",
            "retry",
            "non-deterministic",
            "test stability",
            "random failure",
            "inconsistent",
            "timing issue"
          ],
          "tools": [
            "mcp__agentic_qe__flaky_detect_statistical",
            "mcp__agentic_qe__flaky_analyze_patterns",
            "mcp__agentic_qe__flaky_stabilize_auto"
          ]
        },
        {
          "domain": "visual",
          "count": 4,
          "loaded": false,
          "keywords": [
            "screenshot",
            "visual",
            "visual regression",
            "accessibility",
            "wcag",
            "a11y",
            "contrast",
            "ui test",
            "pixel diff",
            "image comparison",
            "color contrast",
            "font size",
            "layout"
          ],
          "tools": [
            "mcp__agentic_qe__visual_compare_screenshots",
            "mcp__agentic_qe__visual_validate_accessibility",
            "mcp__agentic_qe__visual_detect_regression",
            "mcp__agentic_qe__visual_test_regression"
          ]
        },
        {
          "domain": "requirements",
          "count": 4,
          "loaded": false,
          "keywords": [
            "requirements",
            "bdd",
            "gherkin",
            "cucumber",
            "acceptance criteria",
            "user story",
            "scenario",
            "given when then",
            "feature file",
            "specification",
            "behavior driven"
          ],
          "tools": [
            "mcp__agentic_qe__qe_requirements_validate",
            "mcp__agentic_qe__qe_requirements_generate_bdd",
            "mcp__agentic_qe__requirements_validate",
            "mcp__agentic_qe__requirements_generate_bdd"
          ]
        }
      ]
    },
    "specialized": {
      "description": "Advanced tools for expert use, loaded explicitly",
      "totalCount": 51,
      "loadedCount": 0,
      "availableDomains": [
        {
          "domain": "learning",
          "count": 18,
          "loaded": false,
          "loadMethod": "explicit request via tools_load_domain",
          "tools": [
            "mcp__agentic_qe__learning_store_experience",
            "mcp__agentic_qe__learning_store_qvalue",
            "mcp__agentic_qe__learning_store_pattern",
            "mcp__agentic_qe__learning_query",
            "mcp__agentic_qe__learning_status",
            "mcp__agentic_qe__learning_train",
            "mcp__agentic_qe__learning_history",
            "mcp__agentic_qe__learning_reset",
            "mcp__agentic_qe__learning_export",
            "mcp__agentic_qe__pattern_store",
            "mcp__agentic_qe__pattern_find",
            "mcp__agentic_qe__pattern_extract",
            "mcp__agentic_qe__pattern_share",
            "mcp__agentic_qe__pattern_stats",
            "mcp__agentic_qe__improvement_status",
            "mcp__agentic_qe__improvement_cycle",
            "mcp__agentic_qe__improvement_ab_test",
            "mcp__agentic_qe__improvement_failures"
          ]
        },
        {
          "domain": "advanced",
          "count": 22,
          "loaded": false,
          "loadMethod": "explicit request via tools_load_domain",
          "tools": [
            "mcp__agentic_qe__mutation_test_execute",
            "mcp__agentic_qe__api_breaking_changes",
            "mcp__agentic_qe__qe_api_contract_validate",
            "mcp__agentic_qe__qe_api_contract_breaking_changes",
            "mcp__agentic_qe__qe_api_contract_versioning",
            "mcp__agentic_qe__production_incident_replay",
            "mcp__agentic_qe__production_rum_analyze",
            "mcp__agentic_qe__qe_testgen_generate_unit",
            "mcp__agentic_qe__qe_testgen_generate_integration",
            "mcp__agentic_qe__qe_testgen_optimize_suite",
            "mcp__agentic_qe__qe_testgen_analyze_quality",
            "mcp__agentic_qe__qe_test_data_generate",
            "mcp__agentic_qe__qe_test_data_mask",
            "mcp__agentic_qe__qe_test_data_analyze_schema",
            "mcp__agentic_qe__qe_regression_analyze_risk",
            "mcp__agentic_qe__qe_regression_select_tests",
            "mcp__agentic_qe__qe_fleet_coordinate",
            "mcp__agentic_qe__qe_fleet_agent_status",
            "mcp__agentic_qe__test_optimize_sublinear",
            "mcp__agentic_qe__test_execute_stream",
            "mcp__agentic_qe__predict_defects_ai",
            "mcp__agentic_qe__regression_risk_analyze"
          ]
        }
      ]
    },
    "coordination": {
      "description": "Workflow and inter-agent coordination tools",
      "count": 11,
      "loaded": false,
      "tools": [
        "mcp__agentic_qe__workflow_create",
        "mcp__agentic_qe__workflow_execute",
        "mcp__agentic_qe__workflow_checkpoint",
        "mcp__agentic_qe__workflow_resume",
        "mcp__agentic_qe__memory_share",
        "mcp__agentic_qe__memory_backup",
        "mcp__agentic_qe__blackboard_post",
        "mcp__agentic_qe__blackboard_read",
        "mcp__agentic_qe__consensus_propose",
        "mcp__agentic_qe__consensus_vote",
        "mcp__agentic_qe__artifact_manifest"
      ]
    }
  },
  "usage": {
    "tips": [
      "Filter by category: use category=\"core,domains\" for multiple categories",
      "Load domain tools: use tools_load_domain with domain name",
      "Auto-loading: Domain tools load automatically when keywords are detected",
      "Include descriptions: set includeDescriptions=true for detailed tool info"
    ],
    "availableCategories": [
      "core",
      "domains",
      "specialized",
      "coordination",
      "all"
    ],
    "loadableDomains": [
      "security",
      "performance",
      "coverage",
      "quality",
      "flaky",
      "visual",
      "requirements",
      "learning",
      "advanced",
      "coordination"
    ]
  }
}
```

## Example 2: Filter Multiple Categories

**Request:**
```json
{
  "category": "core,coordination",
  "includeDescriptions": false
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-12-05T10:31:00.000Z",
  "statistics": {
    "totalAvailable": 107,
    "totalLoaded": 14,
    "loadingPercentage": "13%",
    "breakdown": {
      "core": {
        "available": 14,
        "loaded": 14,
        "status": "always loaded"
      },
      "domains": {
        "available": 31,
        "loaded": 0,
        "loadedDomains": [],
        "availableDomains": [
          "security",
          "performance",
          "coverage",
          "quality",
          "flaky",
          "visual",
          "requirements"
        ]
      },
      "specialized": {
        "available": 51,
        "loaded": 0,
        "loadedDomains": [],
        "availableDomains": [
          "learning",
          "advanced"
        ]
      },
      "coordination": {
        "available": 11,
        "loaded": 0,
        "status": "available"
      }
    }
  },
  "categories": {
    "core": {
      "description": "Always-loaded essential QE tools",
      "count": 14,
      "status": "loaded",
      "tools": [
        "mcp__agentic_qe__fleet_init",
        "mcp__agentic_qe__agent_spawn",
        "..."
      ]
    },
    "coordination": {
      "description": "Workflow and inter-agent coordination tools",
      "count": 11,
      "loaded": false,
      "tools": [
        "mcp__agentic_qe__workflow_create",
        "mcp__agentic_qe__workflow_execute",
        "..."
      ]
    }
  }
}
```

## Example 3: With Detailed Descriptions

**Request:**
```json
{
  "category": "domains",
  "includeDescriptions": true
}
```

**Response (partial):**
```json
{
  "success": true,
  "timestamp": "2025-12-05T10:32:00.000Z",
  "statistics": { "..." },
  "categories": {
    "domains": {
      "description": "Domain-specific tools loaded on demand via keyword detection",
      "totalCount": 31,
      "loadedCount": 8,
      "availableDomains": [
        {
          "domain": "coverage",
          "count": 8,
          "loaded": true,
          "keywords": ["coverage", "gap", "uncovered", "..."],
          "tools": [
            {
              "name": "mcp__agentic_qe__coverage_analyze_stream",
              "loaded": true,
              "category": "domain",
              "domain": "coverage"
            },
            {
              "name": "mcp__agentic_qe__coverage_detect_gaps_ml",
              "loaded": true,
              "category": "domain",
              "domain": "coverage"
            }
          ]
        }
      ]
    }
  }
}
```

## Key Improvements

### 1. Comprehensive Statistics
- **Total available vs loaded**: See at a glance what percentage of tools are loaded
- **Per-category breakdown**: Understand the loading status for each category
- **Domain tracking**: Know which specific domains are loaded

### 2. Multiple Category Filtering
- Request specific categories: `"core,domains"`
- Mix and match: `"specialized,coordination"`
- Default to all: `"all"` or omit parameter

### 3. Enhanced Domain Information
- **Keywords**: See what triggers auto-loading for each domain
- **Load status**: Know if each domain is currently loaded
- **Tool counts**: Understand the size of each domain

### 4. Coordination Tools
- Now properly categorized and discoverable
- Includes workflow and inter-agent coordination capabilities

### 5. Usage Hints
- Helpful tips for using the tool discovery system
- List of available categories and loadable domains
- Guidance on filtering and loading strategies

## Use Cases

### For Claude Code Users
1. **Discover available tools**: `category: "all"` to see everything
2. **Find specific domain**: `category: "domains"` to see domain tools
3. **Check loading status**: View statistics to see what's loaded
4. **Get detailed info**: Use `includeDescriptions: true` for full details

### For Fleet Coordinators
1. **Monitor tool loading**: Use statistics to optimize memory usage
2. **Plan domain loading**: See which domains to load for specific tasks
3. **Coordinate agents**: Use coordination tools for multi-agent workflows

### For Developers
1. **Debug tool loading**: Check which tools are available vs loaded
2. **Optimize performance**: Understand the lazy loading strategy
3. **Plan features**: See what specialized tools are available
