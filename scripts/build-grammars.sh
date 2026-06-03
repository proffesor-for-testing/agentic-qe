#!/usr/bin/env bash
#
# Build tree-sitter WASM grammars for code-intelligence (assets/grammars/).
#
# WHY THIS EXISTS:
#   web-tree-sitter >= 0.25 builds grammars with wasi-sdk (not the old emscripten
#   "side module" / dylink format). Grammars built with the old toolchain fail to
#   load at runtime ("getDylinkMetadata" error) and silently fall back to regex.
#   Always rebuild grammars with a tree-sitter CLI matching the web-tree-sitter
#   version in package.json (currently ~0.26.x).
#
# REQUIREMENTS: Docker (uses the emscripten/emsdk image — it has emcc + a modern
#   glibc so the prebuilt tree-sitter-cli binary runs). No local emscripten needed.
#
# USAGE:
#   scripts/build-grammars.sh                # build the TS/JS set (default)
#   scripts/build-grammars.sh all            # also rebuild python/java/c#/rust/swift
#
set -euo pipefail

# Keep in lockstep with `web-tree-sitter` in package.json.
TS_CLI_VERSION="0.26.9"
IMAGE="emscripten/emsdk:latest"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/grammars"
MODE="${1:-tsjs}"

# package-spec : grammar-subdir(relative to its package) : output-wasm-name
GRAMMARS_TSJS=(
  "tree-sitter-typescript:typescript:tree-sitter-typescript.wasm"
  "tree-sitter-typescript:tsx:tree-sitter-tsx.wasm"
  "tree-sitter-javascript::tree-sitter-javascript.wasm"
)
GRAMMARS_ALL=(
  "tree-sitter-python::tree-sitter-python.wasm"
  "tree-sitter-java::tree-sitter-java.wasm"
  "tree-sitter-c-sharp::tree-sitter-c_sharp.wasm"
  "tree-sitter-rust::tree-sitter-rust.wasm"
  "tree-sitter-swift::tree-sitter-swift.wasm"
)

SPECS=("${GRAMMARS_TSJS[@]}")
[ "$MODE" = "all" ] && SPECS+=("${GRAMMARS_ALL[@]}")

PKGS="$(printf '%s\n' "${SPECS[@]}" | cut -d: -f1 | sort -u | tr '\n' ' ')"

# Build a shell program to run inside the container.
BUILD="set -e; cd /work; npm init -y >/dev/null 2>&1;"
BUILD+=" npm i --no-audit --no-fund --ignore-scripts $PKGS >/dev/null 2>&1;"
BUILD+=" npm i --no-audit --no-fund tree-sitter-cli@${TS_CLI_VERSION} >/dev/null 2>&1;"
for spec in "${SPECS[@]}"; do
  pkg="$(echo "$spec" | cut -d: -f1)"
  sub="$(echo "$spec" | cut -d: -f2)"
  out="$(echo "$spec" | cut -d: -f3)"
  dir="node_modules/$pkg"; [ -n "$sub" ] && dir="$dir/$sub"
  BUILD+=" echo building $out; ./node_modules/.bin/tree-sitter build --wasm $dir -o /work/out/$out;"
done

echo "Building grammars: ${SPECS[*]}"
mkdir -p "$OUT"
WORK="$(mktemp -d)"
mkdir -p "$WORK/out"
docker run --rm -v "$WORK:/work" -w /work "$IMAGE" bash -c "$BUILD"
cp "$WORK/out/"*.wasm "$OUT/"
# node_modules is created root-owned inside the container; remove it via a
# throwaway container (root) so cleanup doesn't fail with permission errors.
docker run --rm -v "$WORK:/work" "$IMAGE" sh -c 'rm -rf /work/* /work/.[!.]* 2>/dev/null' || true
rmdir "$WORK" 2>/dev/null || true

echo "Done. Grammars written to $OUT:"
ls -la "$OUT"/*.wasm
