#!/usr/bin/env bash
#
# tests/fixtures/init-corpus/setup.sh
#
# Downloads, sha256-verifies, and extracts every fixture listed in
# MANIFEST.json into ./extracted/. Designed to be re-runnable and safe to
# call from CI: existing extracted dirs with matching checksums are left
# alone.
#
# Output layout:
#   tests/fixtures/init-corpus/
#     .cache/<sha256>.tar.gz       <- raw tarballs (cacheable in GH Actions)
#     extracted/<extractedDir>/    <- top-level dir from inside the tarball
#
# Exit codes:
#   0  every fixture in MANIFEST.json is downloaded and extracted
#   1  manifest parse error or required tool missing
#   2  one or more downloads failed
#   3  one or more sha256 mismatches (treated as fatal — never overwrite)
#   4  one or more extractions failed
#

set -euo pipefail

CORPUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${CORPUS_DIR}/MANIFEST.json"
CACHE_DIR="${CORPUS_DIR}/.cache"
EXTRACT_DIR="${CORPUS_DIR}/extracted"

mkdir -p "${CACHE_DIR}" "${EXTRACT_DIR}"

# Tool guards — fail fast and clearly if the runner is missing something
for tool in jq curl sha256sum tar; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: required tool '${tool}' not found in PATH" >&2
    exit 1
  fi
done

if [[ ! -f "${MANIFEST}" ]]; then
  echo "ERROR: ${MANIFEST} not found" >&2
  exit 1
fi

fixture_count=$(jq '.fixtures | length' "${MANIFEST}")
echo "[corpus] manifest: ${MANIFEST} (${fixture_count} fixtures)"

download_failures=0
checksum_failures=0
extract_failures=0
processed=0
skipped_no_tarball=0

for i in $(seq 0 $((fixture_count - 1))); do
  id=$(jq -r ".fixtures[${i}].id" "${MANIFEST}")
  has_tarball=$(jq -r ".fixtures[${i}].tarball != null" "${MANIFEST}")

  if [[ "${has_tarball}" != "true" ]]; then
    echo "[corpus] ${id}: no tarball (in-tree fixture, skipping download)"
    skipped_no_tarball=$((skipped_no_tarball + 1))
    continue
  fi

  url=$(jq -r ".fixtures[${i}].tarball.url" "${MANIFEST}")
  sha256=$(jq -r ".fixtures[${i}].tarball.sha256" "${MANIFEST}")
  size=$(jq -r ".fixtures[${i}].tarball.sizeBytes" "${MANIFEST}")
  extracted_dir=$(jq -r ".fixtures[${i}].extractedDir" "${MANIFEST}")

  cache_path="${CACHE_DIR}/${sha256}.tar.gz"
  extract_path="${EXTRACT_DIR}/${extracted_dir}"

  echo "[corpus] ${id}: ${url}"
  echo "[corpus]   sha256=${sha256} (${size} bytes)"

  # 1. Download (cache hit if .cache/<sha256>.tar.gz already exists and verifies)
  needs_download=true
  if [[ -f "${cache_path}" ]]; then
    cached_sum=$(sha256sum "${cache_path}" | awk '{print $1}')
    if [[ "${cached_sum}" == "${sha256}" ]]; then
      echo "[corpus]   cache hit"
      needs_download=false
    else
      echo "[corpus]   cache miss (sha mismatch in cache, re-downloading)"
      rm -f "${cache_path}"
    fi
  fi

  if [[ "${needs_download}" == "true" ]]; then
    if ! curl -fSL --retry 3 --retry-delay 2 -o "${cache_path}.tmp" "${url}"; then
      echo "[corpus]   ERROR: download failed for ${id}" >&2
      download_failures=$((download_failures + 1))
      rm -f "${cache_path}.tmp"
      continue
    fi
    mv "${cache_path}.tmp" "${cache_path}"
  fi

  # 2. Verify sha256 (always — even on cache hit, since cache_path may be tampered)
  actual_sum=$(sha256sum "${cache_path}" | awk '{print $1}')
  if [[ "${actual_sum}" != "${sha256}" ]]; then
    echo "[corpus]   FATAL: sha256 mismatch for ${id}" >&2
    echo "[corpus]     expected: ${sha256}" >&2
    echo "[corpus]     actual:   ${actual_sum}" >&2
    echo "[corpus]   leaving cache file in place — investigate before re-running" >&2
    checksum_failures=$((checksum_failures + 1))
    continue
  fi

  # 3. Extract (idempotent — re-extract is fine, but skip if dir already populated)
  if [[ -d "${extract_path}" ]] && [[ -n "$(ls -A "${extract_path}" 2>/dev/null || true)" ]]; then
    echo "[corpus]   already extracted at extracted/${extracted_dir}"
  else
    rm -rf "${extract_path}"
    if ! tar -xzf "${cache_path}" -C "${EXTRACT_DIR}"; then
      echo "[corpus]   ERROR: extraction failed for ${id}" >&2
      extract_failures=$((extract_failures + 1))
      continue
    fi
    if [[ ! -d "${extract_path}" ]]; then
      echo "[corpus]   ERROR: expected extractedDir ${extracted_dir} not found after extract" >&2
      extract_failures=$((extract_failures + 1))
      continue
    fi
    echo "[corpus]   extracted -> extracted/${extracted_dir}"
  fi

  processed=$((processed + 1))
done

echo ""
echo "[corpus] summary:"
echo "[corpus]   downloaded/extracted: ${processed}"
echo "[corpus]   in-tree (no download): ${skipped_no_tarball}"
echo "[corpus]   download failures:    ${download_failures}"
echo "[corpus]   checksum failures:    ${checksum_failures}"
echo "[corpus]   extract failures:     ${extract_failures}"

if (( checksum_failures > 0 )); then
  exit 3
fi
if (( download_failures > 0 )); then
  exit 2
fi
if (( extract_failures > 0 )); then
  exit 4
fi
exit 0
