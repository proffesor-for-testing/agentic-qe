#!/usr/bin/env bash
#
# tests/fixtures/init-corpus/run-gate.sh
#
# Runs `aqe init --auto --json` against every fixture in MANIFEST.json
# and asserts the gate criteria. This is the script the npm-publish.yml
# release-gate job invokes against a freshly-built tarball.
#
# Required env (one of):
#   AQE_LOCAL_TARBALL=/path/to/agentic-qe-X.Y.Z.tgz   for pre-publish gate
#   AQE_FROM_NPM=1 + AQE_NPM_VERSION=X.Y.Z            for post-publish canary
#
# Optional env:
#   AQE_CORPUS_FILTER=tiny-ts,multi-lang-real         comma-separated id filter
#   AQE_GATE_KEEP_TMPDIRS=1                           keep cleanroom dirs
#
# Output layout:
#   tests/fixtures/init-corpus/run-logs/${id}.log     stderr from init
#   tests/fixtures/init-corpus/run-logs/${id}.json    stdout (the InitJsonOutput)
#   tests/fixtures/init-corpus/run-logs/summary.txt   one-line per fixture verdict
#
# Exit codes:
#   0  every fixture in scope passed every assertion
#   1  manifest/setup error (cannot run gate)
#   2  one or more fixtures failed an assertion
#

set -uo pipefail

CORPUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${CORPUS_DIR}/MANIFEST.json"
EXTRACT_DIR="${CORPUS_DIR}/extracted"
LOG_DIR="${CORPUS_DIR}/run-logs"
SUMMARY="${LOG_DIR}/summary.txt"
REPO_ROOT="$(cd "${CORPUS_DIR}/../../.." && pwd)"

mkdir -p "${LOG_DIR}"
: > "${SUMMARY}"

for tool in jq node npm sha256sum tar; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: required tool '${tool}' not found in PATH" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Install source — local .tgz or npm registry
# ---------------------------------------------------------------------------

INSTALL_SPEC=""
if [[ "${AQE_FROM_NPM:-0}" == "1" ]]; then
  if [[ -z "${AQE_NPM_VERSION:-}" ]]; then
    echo "ERROR: AQE_FROM_NPM=1 but AQE_NPM_VERSION is unset" >&2
    exit 1
  fi
  INSTALL_SPEC="agentic-qe@${AQE_NPM_VERSION}"
  echo "[gate] install source: npm registry (${INSTALL_SPEC})"
elif [[ -n "${AQE_LOCAL_TARBALL:-}" ]]; then
  if [[ ! -f "${AQE_LOCAL_TARBALL}" ]]; then
    echo "ERROR: AQE_LOCAL_TARBALL='${AQE_LOCAL_TARBALL}' does not exist" >&2
    exit 1
  fi
  INSTALL_SPEC="${AQE_LOCAL_TARBALL}"
  echo "[gate] install source: local tarball (${INSTALL_SPEC})"
else
  echo "ERROR: set AQE_LOCAL_TARBALL=/path/to/agentic-qe-X.Y.Z.tgz or AQE_FROM_NPM=1+AQE_NPM_VERSION" >&2
  exit 1
fi

if [[ ! -f "${MANIFEST}" ]]; then
  echo "ERROR: ${MANIFEST} not found" >&2
  exit 1
fi

fixture_count=$(jq '.fixtures | length' "${MANIFEST}")
filter="${AQE_CORPUS_FILTER:-}"

failures=0
passes=0
skipped=0

# ---------------------------------------------------------------------------
# Per-fixture runner
# ---------------------------------------------------------------------------
#
# Assertions in order — first failure wins, the rest are skipped:
#
#   A1  fixture root exists
#   A2  mustContainFile exists in fixture root (if declared)
#   A3  mustContainFileSha256 matches actual file content (if declared)
#   A4  cleanroom copy succeeded (cp -a exit code)
#   A5  npm install of agentic-qe succeeded
#   A6  aqe binary present in node_modules/.bin
#   A7  init exited 0 within timeoutSec
#   A8  init produced parseable JSON on stdout (the --json contract)
#   A9  json.success === true
#   A10 NO step in json.steps[] has status='error'
#   A11 .agentic-qe/memory.db exists
#   A12 KG entries (kv_store + hypergraph_nodes) >= expectedKgEntries * tolerance
#   A13 skills usable (json count OR on-disk count) >= expectedSkillsInstalled
#   A14 agents usable (json count OR on-disk count) >= expectedAgentsInstalled
#   A15 .claude/agents/ has >= expectedAgentsInstalled .md files (subsumed by A14 OR-logic)
#   A16 .claude/skills/ has >= expectedSkillsInstalled SKILL.md files (subsumed by A13 OR-logic)
#   A17 if expectMcpConfigured: summary.mcpConfigured === true AND .mcp.json exists
#   A18 CLAUDE.md exists in cleanroom (regardless of summary.claudeMdGenerated, since pre-existing CLAUDE.md is fine)
#   A19 .agentic-qe/workers/registry.json exists with at least one worker
#   A20 .agentic-qe/config.yaml exists and is non-empty
#   A21 elapsed <= expectedElapsedSec * 3 (subthreshold stall detection)
#   A22 if doubleInit: a SECOND aqe init in the same cleanroom also passes A7-A12
#       (exercises the incremental delta-scan code path of phase 06 — the
#        actual surface that hung in v3.9.1 ruview, which the first init
#        of any cleanroom never touches)
#
# Each assertion writes its verdict to the summary line for the fixture.
# ---------------------------------------------------------------------------

run_one() {
  local id="$1"
  local fixture_root="$2"
  local timeout_sec="$3"
  local expected_kg="$4"
  local kg_tolerance="$5"
  local expected_elapsed="$6"
  local expected_skills="$7"
  local expected_agents="$8"
  local expect_mcp="$9"
  local double_init="${10}"
  local must_contain_file="${11}"
  local must_contain_file_sha256="${12}"

  local log="${LOG_DIR}/${id}.log"
  local json="${LOG_DIR}/${id}.json"
  local json2="${LOG_DIR}/${id}-second.json"
  : > "${log}"
  : > "${json}"
  : > "${json2}"

  echo "[gate] === ${id} ===" | tee -a "${log}"
  echo "[gate]   fixture root:   ${fixture_root}" | tee -a "${log}"
  echo "[gate]   timeout:        ${timeout_sec}s" | tee -a "${log}"
  echo "[gate]   expected KG:    ${expected_kg} (tolerance ${kg_tolerance}, min $(awk "BEGIN { printf \"%d\", ${expected_kg} * ${kg_tolerance} }"))" | tee -a "${log}"
  echo "[gate]   expected ≤ :    ${expected_elapsed}s (soft cap $((expected_elapsed * 3))s, hard cap ${timeout_sec}s)" | tee -a "${log}"
  echo "[gate]   double init:    ${double_init}" | tee -a "${log}"

  # ----- A1 -------------------------------------------------------------
  if [[ ! -d "${fixture_root}" ]]; then
    echo "[gate]   FAIL A1: fixture root does not exist (run setup.sh first)" | tee -a "${log}"
    echo "${id} FAIL A1-no-fixture-root" >> "${SUMMARY}"
    return 1
  fi

  # ----- A2/A3 ----------------------------------------------------------
  if [[ -n "${must_contain_file}" ]]; then
    if [[ ! -f "${fixture_root}/${must_contain_file}" ]]; then
      echo "[gate]   FAIL A2: required file '${must_contain_file}' missing from fixture" | tee -a "${log}"
      echo "${id} FAIL A2-missing-${must_contain_file}" >> "${SUMMARY}"
      return 1
    fi
    if [[ -n "${must_contain_file_sha256}" ]]; then
      local actual_sha
      actual_sha=$(sha256sum "${fixture_root}/${must_contain_file}" | awk '{print $1}')
      if [[ "${actual_sha}" != "${must_contain_file_sha256}" ]]; then
        echo "[gate]   FAIL A3: ${must_contain_file} sha256 mismatch" | tee -a "${log}"
        echo "[gate]     expected: ${must_contain_file_sha256}" | tee -a "${log}"
        echo "[gate]     actual:   ${actual_sha}" | tee -a "${log}"
        echo "[gate]   The regression marker file content has drifted. Either upstream rewrote it" | tee -a "${log}"
        echo "[gate]   (in which case re-pin the fixture commit), or the corpus tarball was tampered." | tee -a "${log}"
        echo "${id} FAIL A3-sha256-drift-${must_contain_file}" >> "${SUMMARY}"
        return 1
      fi
      echo "[gate]   ${must_contain_file} sha256 OK (regression marker pinned)" | tee -a "${log}"
    fi
  fi

  # ----- Cleanroom setup ------------------------------------------------
  local tmpdir
  tmpdir=$(mktemp -d -t "aqe-gate-${id}-XXXXXX")
  echo "[gate]   tmpdir:       ${tmpdir}" | tee -a "${log}"

  # ----- A4: cleanroom copy --------------------------------------------
  # For self-dogfood we MUST exclude the corpus' own .cache/, extracted/,
  # and run-logs/ directories — otherwise we copy the 42MB tarball cache
  # into the cleanroom on every run, blowing local disk and slowing init.
  # We also exclude .git/, node_modules/, and .agentic-qe/* (the test should
  # exercise a fresh init, not whatever state the dev's checkout is in).
  if [[ "${id}" == "self-dogfood" ]]; then
    if ! tar -cf - \
      --exclude='./.git' \
      --exclude='./node_modules' \
      --exclude='./.agentic-qe' \
      --exclude='./tests/fixtures/init-corpus/.cache' \
      --exclude='./tests/fixtures/init-corpus/extracted' \
      --exclude='./tests/fixtures/init-corpus/run-logs' \
      --exclude='./dist' \
      --exclude='./coverage' \
      -C "${fixture_root}" . | tar -xf - -C "${tmpdir}" 2>>"${log}"; then
      echo "[gate]   FAIL A4: cleanroom copy (tar pipe) failed" | tee -a "${log}"
      echo "${id} FAIL A4-copy" >> "${SUMMARY}"
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi
  else
    if ! cp -a "${fixture_root}/." "${tmpdir}/" 2>>"${log}"; then
      echo "[gate]   FAIL A4: cp -a from fixture to cleanroom failed" | tee -a "${log}"
      echo "${id} FAIL A4-copy" >> "${SUMMARY}"
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi
  fi

  pushd "${tmpdir}" >/dev/null

  # ----- A5: install agentic-qe ----------------------------------------
  # We deliberately do NOT pass --ignore-scripts. agentic-qe's transitive
  # native deps (hnswlib-node, better-sqlite3) need their postinstall
  # scripts to fetch prebuilt binaries; --ignore-scripts would silently
  # fall back to JS-only paths and break init. --omit=dev skips the
  # fixture's own devDeps to keep the install fast.
  if [[ ! -f "package.json" ]]; then
    cat > package.json <<'EOF'
{
  "name": "aqe-corpus-cleanroom",
  "version": "0.0.0",
  "private": true
}
EOF
  fi

  if ! npm install --no-save --no-audit --no-fund --omit=dev \
    "${INSTALL_SPEC}" >>"${log}" 2>&1; then
    echo "[gate]   FAIL A5: npm install of agentic-qe failed" | tee -a "${log}"
    echo "${id} FAIL A5-npm-install" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A6: binary present --------------------------------------------
  if [[ ! -e "node_modules/.bin/aqe" ]]; then
    echo "[gate]   FAIL A6: node_modules/.bin/aqe missing after install" | tee -a "${log}"
    ls -la node_modules/.bin/ 2>>"${log}" || true
    echo "${id} FAIL A6-no-binary" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A7: run init under timeout, capture JSON to stdout ------------
  local start_ts
  start_ts=$(date +%s)

  echo "[gate]   running: timeout ${timeout_sec}s ./node_modules/.bin/aqe init --auto --json" | tee -a "${log}"
  local init_exit=0
  timeout --signal=KILL "${timeout_sec}" \
    ./node_modules/.bin/aqe init --auto --json \
    >"${json}" 2>>"${log}" || init_exit=$?

  local elapsed=$(( $(date +%s) - start_ts ))
  echo "[gate]   exit ${init_exit} after ${elapsed}s" | tee -a "${log}"

  if [[ "${init_exit}" -ne 0 ]]; then
    if [[ "${init_exit}" -eq 137 ]] || [[ "${init_exit}" -eq 124 ]]; then
      echo "[gate]   FAIL A7: init was killed by timeout (exit ${init_exit}) after ${timeout_sec}s" | tee -a "${log}"
      echo "${id} FAIL A7-timeout" >> "${SUMMARY}"
    else
      echo "[gate]   FAIL A7: init exited non-zero (${init_exit})" | tee -a "${log}"
      echo "${id} FAIL A7-exit-${init_exit}" >> "${SUMMARY}"
    fi
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A8: JSON parses ------------------------------------------------
  if ! jq -e . "${json}" >/dev/null 2>&1; then
    echo "[gate]   FAIL A8: init --json output is not valid JSON" | tee -a "${log}"
    echo "[gate]   first 30 lines of stdout:" | tee -a "${log}"
    head -30 "${json}" | tee -a "${log}"
    echo "${id} FAIL A8-bad-json" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  local schema_version
  schema_version=$(jq -r '.schemaVersion' "${json}")
  if [[ "${schema_version}" != "1" ]]; then
    echo "[gate]   FAIL A8: init --json schemaVersion=${schema_version}, gate expects 1" | tee -a "${log}"
    echo "${id} FAIL A8-schema-version" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A9: result.success ---------------------------------------------
  local json_success
  json_success=$(jq -r '.success' "${json}")
  if [[ "${json_success}" != "true" ]]; then
    echo "[gate]   FAIL A9: result.success=${json_success}" | tee -a "${log}"
    echo "${id} FAIL A9-success-false" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A10: NO step has status='error' --------------------------------
  # This is THE assertion the old gate was missing. Non-critical phases
  # like phase 06 (code-intelligence) and phase 09 (assets) used to fail
  # silently because the orchestrator only flips result.success on
  # critical-phase failures. Now we walk every step and fail if any has
  # status='error', regardless of overall result.success.
  local errored_steps
  errored_steps=$(jq -r '[.steps[] | select(.status == "error") | .step] | join(", ")' "${json}")
  if [[ -n "${errored_steps}" ]]; then
    echo "[gate]   FAIL A10: one or more steps reported status='error':" | tee -a "${log}"
    jq -r '.steps[] | select(.status == "error") | "    - " + .step + ": " + .message' "${json}" | tee -a "${log}"
    echo "${id} FAIL A10-step-error (${errored_steps})" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A11: .agentic-qe/memory.db exists ------------------------------
  if [[ ! -f ".agentic-qe/memory.db" ]]; then
    echo "[gate]   FAIL A11: .agentic-qe/memory.db missing after init" | tee -a "${log}"
    echo "${id} FAIL A11-no-memory-db" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A12: KG entries above tolerance floor --------------------------
  # We sum kv_store(code-intelligence:kg%) + hypergraph_nodes. The min
  # threshold is `expectedKgEntries * tolerance` (see MANIFEST.json).
  # Tolerance defaults to 0.7 — lets the gate accept ±30% drift around
  # the snapshot without false fails when init's indexing is tuned, but
  # catches a 90%+ regression where indexing silently produces almost
  # nothing.
  local kg_entries
  kg_entries=$(node -e "
    try {
      const Database = require('better-sqlite3');
      const db = new Database('.agentic-qe/memory.db', { readonly: true });
      let total = 0;
      try {
        const r1 = db.prepare(\"SELECT COUNT(*) AS c FROM kv_store WHERE namespace LIKE 'code-intelligence:kg%'\").get();
        total += r1.c;
      } catch (_) { /* table may not exist */ }
      try {
        const r2 = db.prepare('SELECT COUNT(*) AS c FROM hypergraph_nodes').get();
        total += r2.c;
      } catch (_) { /* table may not exist */ }
      db.close();
      console.log(total);
    } catch (e) {
      console.log('-1');
    }
  " 2>>"${log}")

  local kg_min
  kg_min=$(awk "BEGIN { printf \"%d\", ${expected_kg} * ${kg_tolerance} }")

  echo "[gate]   kg entries: ${kg_entries} (min ${kg_min}, snapshot ${expected_kg})" | tee -a "${log}"
  if [[ "${kg_entries}" == "-1" ]]; then
    echo "[gate]   FAIL A12: could not query .agentic-qe/memory.db" | tee -a "${log}"
    echo "${id} FAIL A12-db-query" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi
  if (( kg_entries < kg_min )); then
    echo "[gate]   FAIL A12: kg has ${kg_entries} entries, expected >= ${kg_min} (snapshot ${expected_kg} * ${kg_tolerance})" | tee -a "${log}"
    echo "${id} FAIL A12-kg-too-small (${kg_entries}/${kg_min})" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A13/A14/A15/A16: skills + agents present after init -----------
  #
  # The assets phase returns `summary.skillsInstalled` / `agentsInstalled`
  # = 0 when init runs against a project that ALREADY has `.claude/`
  # populated (it's an "incremental" install in that case — nothing new
  # to install). The user-visible question is "are skills usable after
  # init", not "did init create them this run". So the assertion
  # accepts EITHER the JSON count OR the on-disk count to pass.
  local skills_installed
  skills_installed=$(jq -r '.summary.skillsInstalled' "${json}")
  local agents_installed
  agents_installed=$(jq -r '.summary.agentsInstalled' "${json}")

  local agents_on_disk=0
  if [[ -d ".claude/agents" ]]; then
    agents_on_disk=$(find .claude/agents -type f -name '*.md' 2>/dev/null | wc -l)
  fi
  local skills_on_disk=0
  if [[ -d ".claude/skills" ]]; then
    skills_on_disk=$(find .claude/skills -type f -name 'SKILL.md' 2>/dev/null | wc -l)
  fi

  # A13 — skills usable: JSON count OR on-disk count must meet expectation
  local skills_max=$skills_installed
  if (( skills_on_disk > skills_max )); then
    skills_max=$skills_on_disk
  fi
  if (( skills_max < expected_skills )); then
    echo "[gate]   FAIL A13: skills usable=${skills_max} (json=${skills_installed}, disk=${skills_on_disk}), expected >= ${expected_skills}" | tee -a "${log}"
    echo "${id} FAIL A13-skills (${skills_max}/${expected_skills})" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # A14 — agents usable: same OR-logic
  local agents_max=$agents_installed
  if (( agents_on_disk > agents_max )); then
    agents_max=$agents_on_disk
  fi
  if (( agents_max < expected_agents )); then
    echo "[gate]   FAIL A14: agents usable=${agents_max} (json=${agents_installed}, disk=${agents_on_disk}), expected >= ${expected_agents}" | tee -a "${log}"
    echo "${id} FAIL A14-agents (${agents_max}/${expected_agents})" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A17: MCP configured (if expected) ------------------------------
  if [[ "${expect_mcp}" == "true" ]]; then
    local mcp_configured
    mcp_configured=$(jq -r '.summary.mcpConfigured' "${json}")
    if [[ "${mcp_configured}" != "true" ]]; then
      echo "[gate]   FAIL A17: summary.mcpConfigured=${mcp_configured}, expected true" | tee -a "${log}"
      echo "${id} FAIL A17-mcp-not-configured" >> "${SUMMARY}"
      popd >/dev/null
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi
    if [[ ! -f ".mcp.json" ]]; then
      echo "[gate]   FAIL A17: .mcp.json file missing despite mcpConfigured=true" | tee -a "${log}"
      echo "${id} FAIL A17-no-mcp-json" >> "${SUMMARY}"
      popd >/dev/null
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi
  fi

  # ----- A18: CLAUDE.md exists -----------------------------------------
  # We don't assert summary.claudeMdGenerated because for self-dogfood
  # the file already exists, so the phase reports generated:false. The
  # user-visible truth is whether CLAUDE.md is present after init.
  if [[ ! -f "CLAUDE.md" ]]; then
    echo "[gate]   FAIL A18: CLAUDE.md missing after init" | tee -a "${log}"
    echo "${id} FAIL A18-no-claude-md" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A19: workers registry has at least one worker ----------------
  local workers_started
  workers_started=$(jq -r '.summary.workersStarted' "${json}")
  local workers_in_registry=0
  if [[ -f ".agentic-qe/workers/registry.json" ]]; then
    workers_in_registry=$(node -e "
      try {
        const r = JSON.parse(require('fs').readFileSync('.agentic-qe/workers/registry.json','utf-8'));
        if (Array.isArray(r)) console.log(r.length);
        else if (r && typeof r === 'object' && Array.isArray(r.workers)) console.log(r.workers.length);
        else if (r && typeof r === 'object') console.log(Object.keys(r).length);
        else console.log(0);
      } catch (e) { console.log(0); }
    " 2>/dev/null)
  fi
  local workers_max=$workers_started
  if (( workers_in_registry > workers_max )); then
    workers_max=$workers_in_registry
  fi
  if (( workers_max < 1 )); then
    echo "[gate]   FAIL A19: no workers configured (json=${workers_started}, registry=${workers_in_registry})" | tee -a "${log}"
    echo "${id} FAIL A19-no-workers" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A20: config.yaml exists and is non-empty ----------------------
  # Init writes .agentic-qe/config.yaml as the canonical user-editable
  # config. If it's missing or empty, downstream commands like
  # `aqe status` and `aqe test` will fail at startup. We don't try to
  # parse the YAML in bash — just verify the file is non-empty (the
  # parser is exercised every time the user runs init's verify phase).
  if [[ ! -s ".agentic-qe/config.yaml" ]]; then
    echo "[gate]   FAIL A20: .agentic-qe/config.yaml missing or empty" | tee -a "${log}"
    echo "${id} FAIL A20-no-config-yaml" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A21: subthreshold stall detection -----------------------------
  # The hard timeoutSec catches infinite hangs. The soft cap catches
  # 5×-10× slowdowns that still complete within the hard timeout but
  # are clearly a regression. expected_elapsed * 3 gives ~3× headroom
  # for runner variance + double-init while still trapping anything
  # genuinely pathological.
  local soft_cap=$(( expected_elapsed * 3 ))
  if (( elapsed > soft_cap )); then
    echo "[gate]   FAIL A21: elapsed ${elapsed}s exceeds soft cap ${soft_cap}s (snapshot ${expected_elapsed}s × 3)" | tee -a "${log}"
    echo "${id} FAIL A21-slow (${elapsed}s/${soft_cap}s)" >> "${SUMMARY}"
    popd >/dev/null
    [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
    return 1
  fi

  # ----- A22: double init exercises the delta-scan path ---------------
  # The first init in any cleanroom always runs phase 06 with
  # incremental=false (the database doesn't exist yet). The
  # incremental=true / delta-scan branch in 06-code-intelligence.ts
  # only runs when .agentic-qe/memory.db already exists with a
  # populated KG. That branch was the actual surface that hung in the
  # original v3.9.1 ruview report — and the first-init-only fixture
  # design wouldn't catch a regression in it.
  #
  # When `doubleInit: true` is set in the manifest, we run init a
  # second time in the same cleanroom and assert it also succeeds.
  # This is the only place in the corpus that exercises the delta path.
  if [[ "${double_init}" == "true" ]]; then
    echo "[gate]   running second init (delta-scan path): timeout ${timeout_sec}s ./node_modules/.bin/aqe init --auto --json" | tee -a "${log}"
    local start2_ts
    start2_ts=$(date +%s)
    local init2_exit=0
    timeout --signal=KILL "${timeout_sec}" \
      ./node_modules/.bin/aqe init --auto --json \
      >"${json2}" 2>>"${log}" || init2_exit=$?
    local elapsed2=$(( $(date +%s) - start2_ts ))
    echo "[gate]   second init: exit ${init2_exit} after ${elapsed2}s" | tee -a "${log}"

    if [[ "${init2_exit}" -ne 0 ]]; then
      echo "[gate]   FAIL A22: second (delta-scan) init exited ${init2_exit}" | tee -a "${log}"
      echo "${id} FAIL A22-delta-exit-${init2_exit}" >> "${SUMMARY}"
      popd >/dev/null
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi

    if ! jq -e . "${json2}" >/dev/null 2>&1; then
      echo "[gate]   FAIL A22: second init JSON invalid" | tee -a "${log}"
      echo "${id} FAIL A22-delta-bad-json" >> "${SUMMARY}"
      popd >/dev/null
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi

    local errored2
    errored2=$(jq -r '[.steps[] | select(.status == "error") | .step] | join(", ")' "${json2}")
    if [[ -n "${errored2}" ]]; then
      echo "[gate]   FAIL A22: second init had step errors: ${errored2}" | tee -a "${log}"
      jq -r '.steps[] | select(.status == "error") | "    - " + .step + ": " + .message' "${json2}" | tee -a "${log}"
      echo "${id} FAIL A22-delta-step-error" >> "${SUMMARY}"
      popd >/dev/null
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi

    # Soft cap for the second run too — same headroom.
    if (( elapsed2 > soft_cap )); then
      echo "[gate]   FAIL A22: second init elapsed ${elapsed2}s > soft cap ${soft_cap}s" | tee -a "${log}"
      echo "${id} FAIL A22-delta-slow (${elapsed2}s/${soft_cap}s)" >> "${SUMMARY}"
      popd >/dev/null
      [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
      return 1
    fi

    echo "[gate]   second init OK (${elapsed2}s, delta-scan path exercised)" | tee -a "${log}"
  fi

  echo "[gate]   PASS (${elapsed}s, kg=${kg_entries}, skills=${skills_installed}, agents=${agents_installed}, agentsOnDisk=${agents_on_disk}, skillsOnDisk=${skills_on_disk}, workers=${workers_max})" | tee -a "${log}"
  echo "${id} PASS ${elapsed}s kg=${kg_entries} skills=${skills_max} agents=${agents_max} workers=${workers_max}" >> "${SUMMARY}"

  popd >/dev/null
  [[ "${AQE_GATE_KEEP_TMPDIRS:-0}" == "1" ]] || rm -rf "${tmpdir}"
  return 0
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

for i in $(seq 0 $((fixture_count - 1))); do
  id=$(jq -r ".fixtures[${i}].id" "${MANIFEST}")

  if [[ -n "${filter}" ]]; then
    if [[ ",${filter}," != *",${id},"* ]]; then
      echo "[gate] ${id}: skipped (not in AQE_CORPUS_FILTER)"
      skipped=$((skipped + 1))
      continue
    fi
  fi

  has_tarball=$(jq -r ".fixtures[${i}].tarball != null" "${MANIFEST}")
  timeout_sec=$(jq -r ".fixtures[${i}].gate.timeoutSec" "${MANIFEST}")
  expected_kg=$(jq -r ".fixtures[${i}].gate.expectedKgEntries" "${MANIFEST}")
  kg_tolerance=$(jq -r ".fixtures[${i}].gate.kgEntriesTolerance" "${MANIFEST}")
  expected_elapsed=$(jq -r ".fixtures[${i}].gate.expectedElapsedSec // 30" "${MANIFEST}")
  expected_skills=$(jq -r ".fixtures[${i}].gate.expectedSkillsInstalled // 0" "${MANIFEST}")
  expected_agents=$(jq -r ".fixtures[${i}].gate.expectedAgentsInstalled // 0" "${MANIFEST}")
  expect_mcp=$(jq -r ".fixtures[${i}].gate.expectMcpConfigured // false" "${MANIFEST}")
  double_init=$(jq -r ".fixtures[${i}].gate.doubleInit // false" "${MANIFEST}")
  must_contain=$(jq -r ".fixtures[${i}].gate.mustContainFile // empty" "${MANIFEST}")
  must_contain_sha=$(jq -r ".fixtures[${i}].gate.mustContainFileSha256 // empty" "${MANIFEST}")

  if [[ "${has_tarball}" == "true" ]]; then
    extracted_dir=$(jq -r ".fixtures[${i}].extractedDir" "${MANIFEST}")
    fixture_root="${EXTRACT_DIR}/${extracted_dir}"
  else
    if [[ "${id}" == "self-dogfood" ]]; then
      fixture_root="${REPO_ROOT}"
    else
      echo "[gate] ${id}: ERROR — null tarball but no in-tree handler" >&2
      echo "${id} FAIL no-handler" >> "${SUMMARY}"
      failures=$((failures + 1))
      continue
    fi
  fi

  if run_one "${id}" "${fixture_root}" "${timeout_sec}" \
    "${expected_kg}" "${kg_tolerance}" "${expected_elapsed}" \
    "${expected_skills}" "${expected_agents}" "${expect_mcp}" \
    "${double_init}" \
    "${must_contain}" "${must_contain_sha}"; then
    passes=$((passes + 1))
  else
    failures=$((failures + 1))
  fi
done

echo ""
echo "[gate] summary: ${passes} pass / ${failures} fail / ${skipped} skipped"
cat "${SUMMARY}"

if (( failures > 0 )); then
  exit 2
fi
exit 0
