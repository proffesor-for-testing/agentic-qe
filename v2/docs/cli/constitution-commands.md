# Constitution CLI Commands

CLI commands for managing and evaluating quality constitutions in the Agentic QE Fleet.

## Commands

### `aqe constitution validate [path]`

Validate constitution file(s) against the JSON schema.

**Arguments:**
- `path` - Path to constitution file or directory (default: base constitutions directory)

**Options:**
- `--strict` - Enable strict validation mode
- `--json` - Output results as JSON

**Examples:**
```bash
# Validate all base constitutions
aqe constitution validate

# Validate a specific file
aqe constitution validate custom.constitution.json

# Validate with JSON output
aqe constitution validate --json
```

**Output:**
- Lists each constitution with validation status
- Shows errors and warnings with detailed messages
- Exits with code 1 if any validation fails

---

### `aqe constitution list`

List all available constitutions in the base directory.

**Options:**
- `-d, --directory <path>` - Constitution directory to scan (default: base)
- `--detailed` - Show detailed information (principles, rules, metrics counts)
- `--json` - Output as JSON array

**Examples:**
```bash
# List all constitutions
aqe constitution list

# Show detailed information
aqe constitution list --detailed

# JSON output
aqe constitution list --json
```

**Output:**
- Constitution ID, version, name, and description
- Optional detailed stats (principles, rules, metrics, applicable agents)

---

### `aqe constitution show <id>`

Show detailed information about a specific constitution.

**Arguments:**
- `id` - Constitution ID or file path

**Options:**
- `-d, --directory <path>` - Constitution directory (default: base)
- `--json` - Output full constitution as JSON

**Examples:**
```bash
# Show default constitution
aqe constitution show default

# Show by file path
aqe constitution show ./custom.constitution.json

# JSON output
aqe constitution show default --json
```

**Output:**
- Full constitution details including:
  - Principles with priorities
  - Rules breakdown by severity
  - Metrics with target values
  - Metadata (author, dates, applicable agents)

---

### `aqe constitution evaluate <files...>`

Evaluate file(s) against constitution with agent voting.

**Arguments:**
- `files...` - One or more files to evaluate

**Options:**
- `--output <format>` - Output format: `human` (default), `json`, or `agent`
- `--min-agents <n>` - Minimum voting agents (default: 3)
- `--constitution <id>` - Constitution ID or path (default: "default")
- `--timeout <ms>` - Vote timeout in milliseconds (default: 30000)

**Examples:**
```bash
# Evaluate a single file
aqe constitution evaluate src/utils/helper.ts

# Evaluate multiple files
aqe constitution evaluate src/**/*.ts

# Use specific constitution
aqe constitution evaluate app.js --constitution code-review

# Use more agents
aqe constitution evaluate app.js --min-agents 5

# JSON output for CI/CD
aqe constitution evaluate src/ --output json

# Agent-readable output
aqe constitution evaluate src/ --output agent
```

**Output Formats:**

1. **human** (default) - Human-readable markdown format:
   - Verdict (PASS/FAIL/WARNING)
   - Summary statistics
   - Detailed findings (errors, warnings)
   - Agent votes with reasoning
   - Next steps recommendations

2. **json** - Structured JSON with full details:
   ```json
   {
     "summary": {
       "verdict": "pass",
       "constitutionId": "default",
       "filesEvaluated": 1,
       "totalRules": 4,
       "passedRules": 4,
       "failedRules": 0,
       "warnings": 0
     },
     "findings": [...],
     "agentVotes": [...],
     "nextSteps": [...]
   }
   ```

3. **agent** - Machine-readable format for agent consumption:
   ```json
   {
     "verdict": "pass",
     "constitution": "default",
     "passed": 4,
     "failed": 0,
     "warnings": 0,
     "nextSteps": [...],
     "votes": [...]
   }
   ```

**Exit Codes:**
- `0` - Evaluation passed
- `1` - Evaluation failed (errors found)

---

## Integration with GOAP

The constitution evaluation system integrates with the Phase 2 GOAP (Goal-Oriented Action Planning) implementation:

1. **Voting Panel Assembly**: Uses `VotingOrchestrator` to assemble a panel of specialized agents
2. **Parallel Evaluation**: Agents vote in parallel with timeout handling and retry logic
3. **Consensus Building**: Aggregates votes using weighted-average consensus method
4. **Rule Evaluation**: Each constitution rule is evaluated using specialized evaluators:
   - `ast` - Abstract Syntax Tree analysis
   - `metric` - Quantitative metric calculation
   - `pattern` - Regex pattern matching
   - `semantic` - LLM-based semantic understanding

---

## Agent Types in Voting

The evaluation system uses these agent types:

- `test-generator` - Test creation and structure
- `coverage-analyzer` - Code coverage and gap analysis
- `quality-gate` - Quality metrics and thresholds
- `security-scanner` - Security vulnerabilities
- `performance-tester` - Performance benchmarks
- `flaky-detector` - Test flakiness detection
- `mutation-tester` - Mutation testing
- `visual-tester` - Visual regression
- `api-tester` - API testing
- `requirements-validator` - Requirements validation
- `data-generator` - Test data generation
- `regression-analyzer` - Regression analysis

---

## Example Workflow

```bash
# 1. List available constitutions
aqe constitution list --detailed

# 2. Show constitution details
aqe constitution show code-review

# 3. Validate custom constitution
aqe constitution validate my-custom.constitution.json

# 4. Evaluate code against constitution
aqe constitution evaluate src/ --constitution code-review --min-agents 5

# 5. Use in CI/CD pipeline
aqe constitution evaluate src/ --output json > evaluation-results.json
```

---

## Constitution Files

Constitution files are stored in `/workspaces/agentic-qe-cf/src/constitution/base/`:

- `default.constitution.json` - Base quality principles for all agents
- `code-review.constitution.json` - Code review standards
- `performance.constitution.json` - Performance testing standards
- `test-generation.constitution.json` - Test generation standards

Custom constitutions can be created following the schema at `/workspaces/agentic-qe-cf/config/constitution.schema.json`.

---

## Implementation Details

**File:** `/workspaces/agentic-qe-cf/src/cli/commands/constitution.ts`

**Dependencies:**
- `ConstitutionLoader` - Load and validate constitution files
- `VotingOrchestrator` - Manage agent voting
- `EvaluatorFactory` - Create rule evaluators
- `AgentPool` - Manage voting agents
- `VotingStrategy` - Agent selection and weighting

**Key Features:**
- Schema validation with detailed error messages
- Parallel agent voting with timeout/retry
- Multiple output formats (human, JSON, agent)
- Exit codes for CI/CD integration
- Comprehensive agent reasoning capture
