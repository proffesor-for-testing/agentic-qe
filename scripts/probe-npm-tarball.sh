#!/usr/bin/env bash
# Verify that a freshly published agentic-qe version is downloadable.
#
# Since 3.14.3 npm processes each publish asynchronously ("Your package is
# being processed and may take a few minutes to become available"). Until that
# finishes the version is missing from the packument and npm fails with
# ETARGET/E404. Measured delays reached 16 minutes, so the probe runs in two
# phases, each with its own wall-clock deadline:
#
#   1. availability: poll `npm view agentic-qe@V version` with backoff until it
#      returns exactly V or AQE_NPM_WAIT_SECONDS elapses (exit 3);
#   2. download: `npm pack --ignore-scripts` with bounded retries inside
#      AQE_NPM_PACK_SECONDS, fresh cache per attempt (exit 1).
#
# Every npm call runs under `timeout`, with an isolated HOME, cache and empty
# npmrc, so a hung connection or a user config cannot extend the deadline.
# Diagnostics live outside the temporary caches so failure artifacts survive.
# Exit codes: 0 ok, 1 download failed, 2 bad configuration, 3 not available,
# 4 local npm unusable (stage=setup).
set -euo pipefail

: "${PACKAGE_VERSION:?PACKAGE_VERSION must be set}"
wait_seconds="${AQE_NPM_WAIT_SECONDS:-1500}"
poll_initial="${AQE_NPM_POLL_INITIAL_SECONDS:-20}"
poll_max="${AQE_NPM_POLL_MAX_SECONDS:-60}"
view_timeout="${AQE_NPM_VIEW_TIMEOUT_SECONDS:-30}"
pack_seconds="${AQE_NPM_PACK_SECONDS:-300}"
pack_timeout="${AQE_NPM_PACK_TIMEOUT_SECONDS:-60}"
attempts="${AQE_NPM_PROBE_ATTEMPTS:-3}"
delay_seconds="${AQE_NPM_PROBE_DELAY_SECONDS:-15}"
registry="${NPM_CONFIG_REGISTRY:-${npm_config_registry:-https://registry.npmjs.org/}}"
log_dir="${AQE_NPM_PROBE_LOG_DIR:-${GITHUB_WORKSPACE:-$PWD}/probe-logs}"

# Bounded integer in [min, max]; leading zeros rejected to avoid octal surprises.
in_range() { [[ "$1" =~ ^(0|[1-9][0-9]{0,4})$ ]] && (( $1 >= $2 && $1 <= $3 )); }
config_error() { echo "ERROR: $*" >&2; exit 2; }

[[ "$PACKAGE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
  || config_error "PACKAGE_VERSION '$PACKAGE_VERSION' is not a semver version"
# Ceiling 45 min: the workflow's probe step and job timeouts are sized for it.
in_range "$wait_seconds" 1 2700 || config_error 'AQE_NPM_WAIT_SECONDS must be 1-2700'
# A minimum of 1 s between polls: 0 would busy-poll the registry.
in_range "$poll_initial" 1 60 || config_error 'AQE_NPM_POLL_INITIAL_SECONDS must be 1-60'
in_range "$poll_max" 1 120 || config_error 'AQE_NPM_POLL_MAX_SECONDS must be 1-120'
in_range "$view_timeout" 1 60 || config_error 'AQE_NPM_VIEW_TIMEOUT_SECONDS must be 1-60'
in_range "$pack_seconds" 1 600 || config_error 'AQE_NPM_PACK_SECONDS must be 1-600'
in_range "$pack_timeout" 1 120 || config_error 'AQE_NPM_PACK_TIMEOUT_SECONDS must be 1-120'
in_range "$attempts" 1 10 || config_error 'AQE_NPM_PROBE_ATTEMPTS must be 1-10'
in_range "$delay_seconds" 0 60 || config_error 'AQE_NPM_PROBE_DELAY_SECONDS must be 0-60'
[[ "$registry" =~ ^https?://[^[:space:]]+$ ]] || config_error "registry '$registry' is not an http(s) URL"
command -v timeout >/dev/null || config_error 'coreutils timeout is required'

spec="agentic-qe@${PACKAGE_VERSION}"
mkdir -p "$log_dir"
log_dir="$(cd "$log_dir" && pwd)"
summary="$log_dir/summary.txt"
: > "$summary"

work_root="$(mktemp -d "${TMPDIR:-/tmp}/aqe-npm-probe.XXXXXX")"
trap 'rm -rf -- "$work_root"' EXIT
mkdir -p "$work_root/home"
: > "$work_root/user.npmrc"
: > "$work_root/global.npmrc"

# Isolate npm from the runner's ~/.npmrc, global config and update checks.
export HOME="$work_root/home"
export NPM_CONFIG_USERCONFIG="$work_root/user.npmrc"
export NPM_CONFIG_GLOBALCONFIG="$work_root/global.npmrc"
export NPM_CONFIG_UPDATE_NOTIFIER=false
export NO_UPDATE_NOTIFIER=1
npm_common=(
  --registry="$registry"
  --userconfig="$work_root/user.npmrc"
  --globalconfig="$work_root/global.npmrc"
  --no-update-notifier --no-audit --no-fund
  --fetch-retries=0
)

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s %s\n' "$(now)" "$*" | tee -a "$summary" >&2; }
min() { if (( $1 < $2 )); then echo "$1"; else echo "$2"; fi; }
# Machine-readable result for the workflow's summary and failure issue.
result() {
  printf 'stage=%s\nwait_seconds=%s\nwait_limit_seconds=%s\n' "$1" "$2" "$wait_seconds" \
    | tee "$log_dir/result.txt" >> "${GITHUB_OUTPUT:-/dev/null}"
}

npm_version=''
if ! npm_version="$(timeout -k 5 30 npm --version 2> "$log_dir/npm-version.stderr")"; then
  result setup 0
  log "ERROR: local npm is unusable (npm --version failed); see $log_dir/npm-version.stderr"
  exit 4
fi
{
  node --version
  printf '%s\n' "$npm_version"
  printf 'Package: %s\nRegistry: %s\n' "$spec" "$registry"
  printf 'Availability deadline: %ss (poll %s-%ss, view timeout %ss)\n' \
    "$wait_seconds" "$poll_initial" "$poll_max" "$view_timeout"
  printf 'Download deadline: %ss (%s attempts, pack timeout %ss)\n' \
    "$pack_seconds" "$attempts" "$pack_timeout"
} > "$log_dir/environment.txt"

# Run npm under a hard wall-clock cap; SIGKILL follows 5 s after SIGTERM.
npm_capped() {
  local secs="$1"; shift
  timeout -k 5 "$secs" npm "$@" --fetch-timeout="$(( secs * 1000 ))"
}

# Phase 1: wait until npm finishes processing the publish.
wait_dir="$log_dir/wait"
mkdir -p "$wait_dir/npm-logs"
wait_start=$SECONDS
wait_deadline=$(( wait_start + wait_seconds ))
delay=$poll_initial
poll=0
available=0
log "Waiting up to $(( wait_seconds / 60 ))m$(( wait_seconds % 60 ))s for npm to make $spec available"
while :; do
  remaining=$(( wait_deadline - SECONDS ))
  (( remaining > 0 )) || break
  poll=$(( poll + 1 ))
  status=0
  npm_capped "$(min "$view_timeout" "$remaining")" view "$spec" version --json \
    "${npm_common[@]}" --prefer-online \
    --cache "$work_root/view-cache-$poll" --logs-dir "$wait_dir/npm-logs" \
    > "$wait_dir/poll-$poll.stdout" 2> "$wait_dir/poll-$poll.stderr" || status=$?
  rm -rf -- "$work_root/view-cache-$poll"
  got="$(tr -d '"[:space:]' < "$wait_dir/poll-$poll.stdout")"
  elapsed=$(( SECONDS - wait_start ))
  if [[ "$status" -eq 0 && "$got" == "$PACKAGE_VERSION" ]]; then
    log "poll $poll (+${elapsed}s): available ($got)"
    available=1
    break
  fi
  reason="$(grep -m1 -oE 'npm error (code )?E[A-Z0-9]+' "$wait_dir/poll-$poll.stderr" || true)"
  (( status == 124 || status == 137 )) && reason="npm view timed out"
  (( status == 0 )) || got=''  # --json errors go to stdout; keep them in the poll log only
  log "poll $poll (+${elapsed}s): not available (exit $status${reason:+, $reason}${got:+, got $got})"
  remaining=$(( wait_deadline - SECONDS ))
  (( remaining > 0 )) || break
  sleep "$(min "$delay" "$remaining")"
  delay=$(min $(( delay * 2 )) "$poll_max")
done
waited=$(( SECONDS - wait_start ))

if (( ! available )); then
  result availability "$waited"
  log "ERROR: npm did not make $spec available within $(( wait_seconds / 60 ))m$(( wait_seconds % 60 ))s ($poll polls, waited ${waited}s); see $log_dir"
  exit 3
fi

# Phase 2: download and integrity-check the tarball without running scripts.
pack_deadline=$(( SECONDS + pack_seconds ))
for ((attempt = 1; attempt <= attempts; attempt++)); do
  remaining=$(( pack_deadline - SECONDS ))
  if (( remaining <= 0 )); then
    log "Download deadline of ${pack_seconds}s reached before attempt $attempt"
    break
  fi
  attempt_dir="$log_dir/attempt-$attempt"
  mkdir -p "$attempt_dir/npm-logs"
  pack_dir="$work_root/pack-$attempt"
  mkdir -p "$pack_dir"

  status=0
  (
    cd "$pack_dir"
    npm_capped "$(min "$pack_timeout" "$remaining")" pack "$spec" --ignore-scripts --json \
      "${npm_common[@]}" --prefer-online \
      --cache "$pack_dir/cache" --logs-dir "$attempt_dir/npm-logs"
  ) > "$attempt_dir/stdout.log" 2> "$attempt_dir/stderr.log" || status=$?
  rm -rf -- "$pack_dir"
  printf '%s\n' "$status" > "$attempt_dir/exit-code.txt"
  printf 'Attempt %s/%s: exit %s\n' "$attempt" "$attempts" "$status" >> "$summary"

  if [[ "$status" -eq 0 ]]; then
    # The full --json output is ~100 KB of file listings; keep it in the
    # artifact and print only the identity of what was downloaded.
    # shellcheck disable=SC2016 # JavaScript template literal, not shell.
    node -e '
      const [p] = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      console.log(`${p.id} ${p.filename} size=${p.size} shasum=${p.shasum} integrity=${p.integrity}`);
    ' "$attempt_dir/stdout.log" | tee -a "$summary" || true
    log "Downloaded $spec (attempt $attempt, availability waited ${waited}s)"
    result ok "$waited"
    exit 0
  fi
  (( status == 124 || status == 137 )) && log "npm pack timed out (attempt $attempt)"
  printf 'npm pack failed (attempt %s/%s, exit %s)\n' "$attempt" "$attempts" "$status" >&2
  tail -n 40 "$attempt_dir/stderr.log" >&2
  if (( attempt < attempts )); then
    remaining=$(( pack_deadline - SECONDS ))
    (( remaining > 0 )) && sleep "$(min "$delay_seconds" "$remaining")"
  fi
done

result pack "$waited"
log "ERROR: could not fetch $spec after $(( attempt > attempts ? attempts : attempt - 1 )) attempts; see $log_dir"
exit 1
