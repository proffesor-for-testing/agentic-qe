#!/usr/bin/env bash
#
# scripts/embed-verification-matrix.sh
#
# Generates the verification matrix for a release notes file from the
# init-corpus gate's summary.txt artifact. Run this after npm-publish.yml
# completes for a tag, then redirect or paste the output into the
# corresponding docs/releases/vX.Y.Z.md file.
#
# Status-only matrix per #409 option C — Time and KG-entries columns are
# future work. The gate's summary.txt doesn't carry that data today, so
# populating richer columns would require either parsing per-fixture
# JSON files or extending run-gate.sh, both of which are out of scope.
#
# Usage:
#   ./scripts/embed-verification-matrix.sh <run-id>
#     downloads the init-corpus-logs artifact from the given workflow run,
#     parses summary.txt, prints a markdown matrix to stdout
#
#   ./scripts/embed-verification-matrix.sh --from-file <path-to-summary.txt>
#     parses an existing summary.txt directly (for local testing)
#
# Exit codes:
#   0  matrix printed
#   1  usage error or required tool missing
#   2  artifact download failed
#   3  summary.txt missing from artifact
#
# Refs: https://github.com/proffesor-for-testing/agentic-qe/issues/409

set -euo pipefail

REPO_SLUG="proffesor-for-testing/agentic-qe"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <run-id>"  >&2
  echo "       $0 --from-file <path>"  >&2
  exit 1
fi

# Parse args
SUMMARY_FILE=""
RUN_ID=""
case "$1" in
  --from-file)
    if [[ $# -ne 2 ]]; then
      echo "Usage: $0 --from-file <path>" >&2
      exit 1
    fi
    SUMMARY_FILE="$2"
    if [[ ! -f "$SUMMARY_FILE" ]]; then
      echo "ERROR: summary file not found: $SUMMARY_FILE" >&2
      exit 1
    fi
    ;;
  *)
    RUN_ID="$1"
    ;;
esac

# Tool guards (only when downloading from GH)
if [[ -z "$SUMMARY_FILE" ]]; then
  for tool in gh; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "ERROR: required tool '$tool' not found in PATH" >&2
      exit 1
    fi
  done
fi

# Download artifact if we don't already have a summary file
if [[ -z "$SUMMARY_FILE" ]]; then
  TMP_DIR=$(mktemp -d -t aqe-matrix-XXXXXX)
  trap 'rm -rf "$TMP_DIR"' EXIT

  echo "[matrix] downloading init-corpus-logs artifact from run $RUN_ID..." >&2
  if ! gh run download "$RUN_ID" \
       --repo "$REPO_SLUG" \
       --name init-corpus-logs \
       --dir "$TMP_DIR" 2>&1 >&2; then
    echo "ERROR: failed to download init-corpus-logs artifact from run $RUN_ID" >&2
    echo "  - confirm the run ID is correct: gh run list --workflow=npm-publish.yml" >&2
    echo "  - confirm the run completed and the artifact wasn't pruned (30-day retention)" >&2
    exit 2
  fi

  SUMMARY_FILE="$TMP_DIR/summary.txt"
  if [[ ! -f "$SUMMARY_FILE" ]]; then
    echo "ERROR: summary.txt not present in downloaded artifact" >&2
    echo "  contents of artifact:" >&2
    ls -la "$TMP_DIR" >&2 || true
    exit 3
  fi
fi

# Resolve version + date for the header
VERSION="${AQE_VERSION:-$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")}"
DATE="${AQE_MATRIX_DATE:-$(date -u +%Y-%m-%d)}"
RUN_ID_DISPLAY="${RUN_ID:-(local file)}"

# Render the matrix
cat <<EOF

## Verification matrix (agentic-qe@${VERSION})

Generated from npm-publish.yml run ${RUN_ID_DISPLAY} on ${DATE}.

| Fixture | Status |
|---|---|
EOF

# summary.txt format: each line is either
#   <id> PASS
# or
#   <id> FAIL <code>
# Some fixtures may write multiple lines (one per assertion); the LAST
# line wins, since the gate halts on the first failure for a given
# fixture and any subsequent line would be from a different fixture.
# Use awk to keep the last line per fixture id.

awk '
{
  id=$1
  if ($2 == "PASS") {
    status[id]="PASS"
  } else if ($2 == "FAIL") {
    code=""
    for (i=3; i<=NF; i++) code = code (i==3 ? "" : " ") $i
    status[id]="FAIL " code
    last_failed[id]=1
  }
  order[++n]=id
}
END {
  seen=""
  for (i=1; i<=n; i++) {
    id=order[i]
    if (index(seen, " " id " ") == 0) {
      printf "| %-16s | %s |\n", id, status[id]
      seen = seen " " id " "
    }
  }
}
' "$SUMMARY_FILE"

echo ""
