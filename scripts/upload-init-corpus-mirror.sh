#!/usr/bin/env bash
#
# scripts/upload-init-corpus-mirror.sh
#
# Populates the self-hosted mirror for the init-corpus tarballs referenced by
# tests/fixtures/init-corpus/MANIFEST.json. Used as defense against GitHub's
# codeload.github.com regenerating `git archive` tarballs (has happened in
# 2023 and 2024), which would otherwise break every release publish until a
# maintainer manually rewrote the pinned sha256s.
#
# Load-bearing invariant: this script REFUSES to upload any tarball whose
# sha256 does not match MANIFEST.json. The mirror must never serve drifted
# content — if it did, the sha256 verification in setup.sh would succeed on
# drifted bytes, which is exactly the failure mode the mirror is supposed to
# defend against.
#
# Target: https://github.com/proffesor-for-testing/agentic-qe/releases/tag/init-corpus-v1
# Asset naming: <sha256>.tar.gz (content-addressed — no collision when
# fixtures are bumped; old assets stay valid for old MANIFEST.json refs).
#
# Usage:
#   ./scripts/upload-init-corpus-mirror.sh                 # live mode
#   ./scripts/upload-init-corpus-mirror.sh --dry-run       # no writes, logs what would happen
#   ./scripts/upload-init-corpus-mirror.sh --release-tag init-corpus-v1  # override tag
#
# Exit codes:
#   0  every non-null fixture is mirrored (uploaded or already present)
#   1  required tool missing, or not logged into gh
#   2  download from primary URL failed
#   3  sha256 mismatch on primary download — REFUSES to upload (load-bearing)
#   4  gh release create/upload failed
#

set -euo pipefail

REPO_SLUG="proffesor-for-testing/agentic-qe"
DEFAULT_TAG="init-corpus-v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "${SCRIPT_DIR}")"
MANIFEST="${REPO_ROOT}/tests/fixtures/init-corpus/MANIFEST.json"

DRY_RUN=false
RELEASE_TAG="${DEFAULT_TAG}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --release-tag)
      RELEASE_TAG="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,30p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Tool guards
for tool in jq curl sha256sum gh; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: required tool '${tool}' not found in PATH" >&2
    exit 1
  fi
done

if [[ ! -f "${MANIFEST}" ]]; then
  echo "ERROR: ${MANIFEST} not found" >&2
  exit 1
fi

# gh auth guard — fail fast if not logged in (upload would fail cryptically)
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: not logged into gh. Run 'gh auth login' first." >&2
  exit 1
fi

log() { echo "[mirror-upload] $*"; }

log "manifest: ${MANIFEST}"
log "target:   https://github.com/${REPO_SLUG}/releases/tag/${RELEASE_TAG}"
if [[ "${DRY_RUN}" == "true" ]]; then
  log "MODE: dry-run (no writes)"
fi

# 1. Ensure the release exists
release_exists=true
if ! gh release view "${RELEASE_TAG}" --repo "${REPO_SLUG}" >/dev/null 2>&1; then
  release_exists=false
fi

if [[ "${release_exists}" == "false" ]]; then
  log "release ${RELEASE_TAG} does not exist yet"
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "  would create: gh release create ${RELEASE_TAG} --repo ${REPO_SLUG} ..."
  else
    NOTES="Self-hosted mirror for tests/fixtures/init-corpus tarballs.

This release exists to insure the release-gate corpus against
codeload.github.com regenerating its git archive output (has happened
in 2023 and 2024). tests/fixtures/init-corpus/setup.sh falls back to
these assets on primary-URL sha256 mismatch.

Assets are content-addressed (<sha256>.tar.gz). Never modify or delete
an asset once uploaded — old MANIFEST.json revisions may reference it.

Tracking: https://github.com/${REPO_SLUG}/issues/411"
    gh release create "${RELEASE_TAG}" \
      --repo "${REPO_SLUG}" \
      --title "init-corpus mirror (v1)" \
      --notes "${NOTES}"
    log "  created release ${RELEASE_TAG}"
  fi
else
  log "release ${RELEASE_TAG} already exists"
fi

# 2. Get the set of already-uploaded assets (by name) — structured output, not grep
existing_assets=""
if [[ "${release_exists}" == "true" ]]; then
  existing_assets=$(gh release view "${RELEASE_TAG}" --repo "${REPO_SLUG}" \
    --json assets --jq '.assets[].name' 2>/dev/null || echo "")
fi

fixture_count=$(jq '.fixtures | length' "${MANIFEST}")
uploaded=0
skipped_existing=0
skipped_no_tarball=0

TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

for i in $(seq 0 $((fixture_count - 1))); do
  id=$(jq -r ".fixtures[${i}].id" "${MANIFEST}")
  has_tarball=$(jq -r ".fixtures[${i}].tarball != null" "${MANIFEST}")

  if [[ "${has_tarball}" != "true" ]]; then
    log "${id}: no tarball (in-tree fixture, nothing to mirror)"
    skipped_no_tarball=$((skipped_no_tarball + 1))
    continue
  fi

  url=$(jq -r ".fixtures[${i}].tarball.url" "${MANIFEST}")
  expected_sha=$(jq -r ".fixtures[${i}].tarball.sha256" "${MANIFEST}")
  asset_name="${expected_sha}.tar.gz"

  log "${id}: ${asset_name}"

  # Skip if already uploaded
  if printf '%s\n' "${existing_assets}" | grep -Fxq "${asset_name}"; then
    log "  already mirrored — skipping"
    skipped_existing=$((skipped_existing + 1))
    continue
  fi

  # Download from primary
  tmp_file="${TMP_DIR}/${asset_name}"
  log "  downloading: ${url}"
  if ! curl -fSL --retry 3 --retry-delay 2 -o "${tmp_file}" "${url}"; then
    echo "ERROR: download failed for ${id} (${url})" >&2
    exit 2
  fi

  # Verify sha256 — LOAD-BEARING INVARIANT: never upload drifted bytes
  actual_sha=$(sha256sum "${tmp_file}" | awk '{print $1}')
  if [[ "${actual_sha}" != "${expected_sha}" ]]; then
    echo "FATAL: sha256 mismatch on primary download for ${id}" >&2
    echo "  expected: ${expected_sha}" >&2
    echo "  actual:   ${actual_sha}" >&2
    echo "  REFUSING to upload drifted content to mirror." >&2
    echo "  This may mean codeload has already drifted. Investigate before retrying." >&2
    exit 3
  fi

  # Upload
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "  would upload: ${asset_name} ($(stat -c %s "${tmp_file}" 2>/dev/null || stat -f %z "${tmp_file}") bytes)"
  else
    if ! gh release upload "${RELEASE_TAG}" "${tmp_file}" \
         --repo "${REPO_SLUG}" --clobber=false 2>&1; then
      echo "ERROR: gh release upload failed for ${id}" >&2
      exit 4
    fi
    log "  uploaded ${asset_name}"
  fi

  uploaded=$((uploaded + 1))
done

echo ""
log "summary:"
log "  uploaded:               ${uploaded}"
log "  already mirrored:       ${skipped_existing}"
log "  in-tree (no download):  ${skipped_no_tarball}"
log "  release URL:            https://github.com/${REPO_SLUG}/releases/tag/${RELEASE_TAG}"
