#!/usr/bin/env bash
# Fetch the published tarball with a fresh cache on each bounded attempt.
# Keep diagnostics outside temporary caches so failure artifacts survive cleanup.
set -euo pipefail

: "${PACKAGE_VERSION:?PACKAGE_VERSION must be set}"
attempts="${AQE_NPM_PROBE_ATTEMPTS:-10}"
delay_seconds="${AQE_NPM_PROBE_DELAY_SECONDS:-30}"
log_dir="${AQE_NPM_PROBE_LOG_DIR:-${GITHUB_WORKSPACE:-$PWD}/probe-logs}"

if [[ ! "$attempts" =~ ^([1-9]|10)$ || ! "$delay_seconds" =~ ^([0-9]|[12][0-9]|30)$ ]]; then
  echo 'ERROR: probe attempts must be 1-10 and delay must be 0-30 seconds' >&2
  exit 2
fi

mkdir -p "$log_dir"
log_dir="$(cd "$log_dir" && pwd)"
: > "$log_dir/summary.txt"
{
  node --version
  npm --version
  printf 'Package: agentic-qe@%s\n' "$PACKAGE_VERSION"
} > "$log_dir/environment.txt"

work_dir=''
cleanup() {
  if [[ -n "$work_dir" ]]; then
    rm -rf -- "$work_dir"
  fi
}
trap cleanup EXIT

for ((attempt = 1; attempt <= attempts; attempt++)); do
  attempt_dir="$log_dir/attempt-$attempt"
  mkdir -p "$attempt_dir/npm-logs"
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/aqe-npm-probe.XXXXXX")"

  # npm install --dry-run resolves metadata but does not fetch the tarball.
  # pack downloads and verifies its integrity without running package scripts.
  status=0
  if (
    cd "$work_dir"
    npm pack --ignore-scripts --json \
      --cache "$work_dir/cache" --logs-dir "$attempt_dir/npm-logs" \
      --fetch-retries=0 --fetch-timeout=15000 \
      "agentic-qe@${PACKAGE_VERSION}"
  ) > "$attempt_dir/stdout.log" 2> "$attempt_dir/stderr.log"; then
    status=0
  else
    status=$?
  fi
  printf '%s\n' "$status" > "$attempt_dir/exit-code.txt"
  printf 'Attempt %s/%s: exit %s\n' "$attempt" "$attempts" "$status" >> "$log_dir/summary.txt"
  cleanup
  work_dir=''

  if [[ "$status" -eq 0 ]]; then
    printf 'Downloaded agentic-qe@%s (attempt %s)\n' "$PACKAGE_VERSION" "$attempt" | tee -a "$log_dir/summary.txt"
    exit 0
  fi
  printf 'npm pack failed (attempt %s/%s, exit %s)\n' "$attempt" "$attempts" "$status" >&2
  cat "$attempt_dir/stderr.log" >&2
  if (( attempt < attempts )); then
    sleep "$delay_seconds"
  fi
done

printf 'ERROR: could not fetch agentic-qe@%s after %s attempts; see %s\n' \
  "$PACKAGE_VERSION" "$attempts" "$log_dir" | tee -a "$log_dir/summary.txt" >&2
exit 1
